import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ethers } from 'ethers';
import { HourlyOffer, HourlyOfferDocument, OfferStatus } from '../../schemas/HourlyOffer.schema';
import { Session, SessionDocument, SessionStatus } from '../../schemas/Session.schema';
import { User, UserDocument } from '../../schemas/User.schema';
import { CreateHourlyOfferDto, HourlyOfferResponseDto, SessionWithBidsResponseDto, BidWithOffersDto } from '../../dtos/hourly-offer.dto';
import { TenantContextService } from '../tenant/services/tenant-context.service';
import { NotFoundException, ConflictException } from '../../exceptions/http-exception';
import { WalletService } from '../wallet/wallet.service';
import { FlexibilityDataService } from '../flexibility/services/flexibility-data.service';
import { MeasurementType } from '../flexibility/schemas/interfaces';
import { MarketSessionContractService } from '../blockchain/contracts/market-session/market-session.contract.service';
import { FlexibilityTokenContractService } from '../blockchain/contracts/flexibility-token/flexibility-token.contract.service';
import { TreasuryContractService } from '../blockchain/contracts/treasury/treasury.contract.service';
import { FlexibilityNFTContractService } from '../blockchain/contracts/flexibility-nft/flexibility-nft.contract.service';
import { UserService } from '../user/user.service';

@Injectable()
export class HourlyOfferService {
  private readonly logger = new Logger(HourlyOfferService.name);

  constructor(
    @InjectModel(HourlyOffer.name) private hourlyOfferModel: Model<HourlyOfferDocument>,
    @InjectModel(Session.name) private sessionModel: Model<SessionDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private readonly tenantContext: TenantContextService,
    private readonly walletService: WalletService,
    private readonly flexibilityDataService: FlexibilityDataService,
    private readonly marketSessionService: MarketSessionContractService,
    private readonly flexTokenService: FlexibilityTokenContractService,
    private readonly treasuryService: TreasuryContractService,
    private readonly flexibilityNFTService: FlexibilityNFTContractService,
    private readonly userService: UserService
  ) { }

  private async getUserByKeycloakId(keycloakId: string) {
    const user = await this.userModel.findOne({ keycloakId });
    if (!user) {
      throw new BadRequestException(`User with keycloak ID ${keycloakId} not found`);
    }
    return user;
  }

  /**
   * Verifica che l'FSP abbia abbastanza flessibilità disponibile per l'ora richiesta
   */
  private async validateFlexibilityAvailability(
    fspUserId: string,
    hour: number,
    requestedPowerMw: number,
  ): Promise<void> {
    // Recupera flessibilità teorica dell'FSP
    const theoreticalFlex = await this.flexibilityDataService.getTheoreticalFlexibility(fspUserId);

    if (!theoreticalFlex) {
      throw new BadRequestException(
        'FSP must have reference profiles configured before creating offers. ' +
        'Please contact the administrator to set up your consumption profiles.'
      );
    }

    // Ottieni flessibilità upward per l'ora specifica (granularità 60min)
    const upwardFlexibilityWh = theoreticalFlex.getMeasurementAt(
      MeasurementType.FLEXIBILITY_UPWARD,
      60,
      hour
    );

    if (upwardFlexibilityWh === null) {
      throw new BadRequestException(
        `Flexibility data not found for hour ${hour}. Please contact support.`
      );
    }

    // Converti richiesta da MW a MWh (per 1 ora: MW * 1h = MWh)
    const requestedEnergyMWh = requestedPowerMw;

    // Converti flessibilità da Wh a MWh
    const availableFlexibilityMWh = upwardFlexibilityWh / 1_000;

    if (requestedEnergyMWh > availableFlexibilityMWh) {
      throw new BadRequestException(
        `Requested power (${requestedPowerMw} MW) exceeds available upward flexibility ` +
        `(${availableFlexibilityMWh.toFixed(6)} MWh) for hour ${hour}. ` +
        `You can provide at most ${availableFlexibilityMWh.toFixed(6)} MW for this hour.`
      );
    }

    this.logger.debug(
      `Flexibility check passed for FSP ${fspUserId}: ` +
      `requested ${requestedEnergyMWh} MWh <= available ${availableFlexibilityMWh.toFixed(6)} MWh (hour ${hour})`
    );
  }

  /**
   * Creates a new hourly offer for the authenticated FSP after validating session status,
   * bid availability, and the FSP's theoretical flexibility for the requested hour.
   */
  async createOffer(createOfferDto: CreateHourlyOfferDto): Promise<HourlyOfferResponseDto> {
    const currentUserId = this.tenantContext.getCurrentUserId() ?? "";
    const userId = (await this.userService.getUserByKeycloakId(currentUserId)).id;
    const currentMarketId = await this.tenantContext.getCurrentMarket();

    if (!currentUserId) {
      throw new BadRequestException('User context is required');
    }

    if (!currentMarketId) {
      throw new BadRequestException('Market context is required');
    }

    const fsp = await this.getUserByKeycloakId(currentUserId);

    // Verificar que la sesión existe y está publicada
    const session = await this.sessionModel.findOne({
      _id: new Types.ObjectId(createOfferDto.sessionId),
      market: new Types.ObjectId(currentMarketId),
    });

    if (!session) {
      throw new NotFoundException('session', createOfferDto.sessionId);
    }

    if (session.status !== SessionStatus.ACTIVE) {
      throw new BadRequestException('Can only create offers for ACTIVE sessions (offers period must be open)');
    }

    // Verificar que existe una bid para esa hora
    const bid = session.bids.find(b => b.hour === createOfferDto.hour);
    if (!bid) {
      throw new BadRequestException(`No bid found for hour ${createOfferDto.hour} in this session`);
    }

    // Verificar que la bid no está llena
    const currentFulfilled = bid.fulfilledPowerMw || 0;
    const available = bid.powerMw - currentFulfilled;

    if (available <= 0) {
      throw new BadRequestException(`Bid for hour ${createOfferDto.hour} is already full`);
    }

    // Verificar que la cantidad ofrecida no excede lo disponible
    if (createOfferDto.powerMw > available) {
      throw new BadRequestException(
        `Offer power (${createOfferDto.powerMw} MW) exceeds available power (${available} MW) for hour ${createOfferDto.hour}`
      );
    }

    // Verificar que l'FSP abbia abbastanza flessibilità disponibile
    await this.validateFlexibilityAvailability(
      userId,
      createOfferDto.hour,
      createOfferDto.powerMw,
    );

    // Verificar que el FSP no tenga ya una offer ACTIVA para esta hora en esta sesión
    const existingOffer = await this.hourlyOfferModel.findOne({
      session: session._id,
      hour: createOfferDto.hour,
      fsp: fsp._id,
      status: { $in: [OfferStatus.PENDING, OfferStatus.ACCEPTED] } // Verificar ofertas activas
    });

    if (existingOffer) {
      throw new ConflictException(
        'offer',
        'session-hour-fsp',
        'You already have an active offer for this hour in this session'
      );
    }

    // Calcular el collateral (5%) y fee (2%) del valor de la offer
    const offerValue = createOfferDto.powerMw * bid.pricePerMwh; // valor en tokens (MW * Flex/MWh)
    const collateralAmount = offerValue * 0.05;
    const feeAmount = offerValue * 0.02;

    // Calcular el próximo blockchainOfferId para esta sesión (incremental, empezando desde 1)
    const maxOfferInSession = await this.hourlyOfferModel
      .findOne({ session: session._id })
      .sort({ blockchainOfferId: -1 })
      .select('blockchainOfferId')
      .exec();

    const nextBlockchainOfferId = (maxOfferInSession?.blockchainOfferId ?? 0) + 1;

    // Crear la offer
    const offer = new this.hourlyOfferModel({
      session: session._id,
      hour: createOfferDto.hour,
      fsp: fsp._id,
      powerMw: createOfferDto.powerMw,
      pricePerMwh: bid.pricePerMwh, // Usar el precio de la bid
      collateralAmount, // 5% del valor de la offer
      feeAmount, // 2% del valor de la offer
      blockchainOfferId: nextBlockchainOfferId, // ID incremental por sesión
      status: OfferStatus.PENDING,
    });

    await offer.save();

    // Actualizar fulfilledPowerMw en la bid
    const bidIndex = session.bids.findIndex(b => b.hour === createOfferDto.hour);
    session.bids[bidIndex].fulfilledPowerMw = currentFulfilled + createOfferDto.powerMw;
    session.bids[bidIndex].updatedAt = new Date();
    await session.save();

    this.logger.log(`Offer created: ${offer._id} for session: ${session._id}, hour: ${createOfferDto.hour}`);

    return this.mapOfferToResponseDto(offer, session, fsp);
  }

  /** Returns all non-cancelled offers created by the authenticated FSP. */
  async getOffersByProsumer(): Promise<HourlyOfferResponseDto[]> {
    const currentUserId = this.tenantContext.getCurrentUserId();

    if (!currentUserId) {
      throw new BadRequestException('User context is required');
    }

    const fsp = await this.getUserByKeycloakId(currentUserId);

    const offers = await this.hourlyOfferModel
      .find({ fsp: fsp._id })
      .populate({
        path: 'session',
        populate: {
          path: 'market',
          select: 'name'
        }
      })
      .sort({ createdAt: -1 });

    return offers.map(offer => this.mapOfferToResponseDto(offer, offer.session as any, fsp));
  }

  /** Returns all offers for a session, scoped to the current market. */
  async getOffersBySession(sessionId: string): Promise<HourlyOfferResponseDto[]> {
    const currentMarketId = await this.tenantContext.getCurrentMarket();

    if (!currentMarketId) {
      throw new BadRequestException('Market context is required');
    }

    if (!Types.ObjectId.isValid(sessionId)) {
      throw new NotFoundException('session', sessionId);
    }

    const session = await this.sessionModel.findOne({
      _id: new Types.ObjectId(sessionId),
      market: new Types.ObjectId(currentMarketId),
    });

    if (!session) {
      throw new NotFoundException('session', sessionId);
    }

    const offers = await this.hourlyOfferModel
      .find({ session: session._id })
      .populate('fsp', 'username email')
      .sort({ hour: 1, createdAt: 1 });

    return offers.map(offer => this.mapOfferToResponseDto(offer, session, offer.fsp as any));
  }

  /** Returns a session together with its bids and the current FSP's active offers grouped by hour. */
  async getSessionWithBidsAndOffers(sessionId: string): Promise<SessionWithBidsResponseDto> {
    const currentMarketId = await this.tenantContext.getCurrentMarket();

    if (!currentMarketId) {
      throw new BadRequestException('Market context is required');
    }

    if (!Types.ObjectId.isValid(sessionId)) {
      throw new NotFoundException('session', sessionId);
    }

    const session = await this.sessionModel
      .findOne({
        _id: new Types.ObjectId(sessionId),
        market: new Types.ObjectId(currentMarketId),
      })
      .populate('market', 'name');

    if (!session) {
      throw new NotFoundException('session', sessionId);
    }

    // Obtener el usuario actual (FSP)
    const currentUserId = this.tenantContext.getCurrentUserId();
    if (!currentUserId) {
      throw new BadRequestException('User context is required');
    }

    const currentUser = await this.getUserByKeycloakId(currentUserId);

    // Obtener SOLO las offers ACTIVAS de este FSP para esta sesión
    const offers = await this.hourlyOfferModel
      .find({
        session: session._id,
        fsp: currentUser._id, // Filtro: solo las ofertas del FSP actual
        status: { $in: [OfferStatus.PENDING, OfferStatus.ACCEPTED] } // Solo mostrar ofertas activas
      })
      .populate('fsp', 'username email')
      .sort({ hour: 1, createdAt: 1 });

    // Agrupar offers por hora
    const offersByHour = new Map<number, HourlyOfferDocument[]>();
    offers.forEach(offer => {
      const hourOffers = offersByHour.get(offer.hour) || [];
      hourOffers.push(offer);
      offersByHour.set(offer.hour, hourOffers);
    });

    // Mapear bids con sus offers
    const bidsWithOffers: BidWithOffersDto[] = session.bids.map(bid => {
      const hourOffers = offersByHour.get(bid.hour) || [];
      const fulfilledPowerMw = bid.fulfilledPowerMw || 0;
      const availablePowerMw = bid.powerMw - fulfilledPowerMw;

      return {
        hour: bid.hour,
        powerMw: bid.powerMw,
        pricePerMwh: bid.pricePerMwh,
        bidType: bid.bidType,
        fulfilledPowerMw,
        availablePowerMw,
        isFull: availablePowerMw <= 0,
        offers: hourOffers.map(offer => this.mapOfferToResponseDto(offer, session, offer.fsp as any)),
      };
    }).sort((a, b) => a.hour - b.hour);

    return {
      id: (session._id as any).toString(),
      name: session.name,
      description: session.description,
      sessionDate: session.sessionDate.toISOString().split('T')[0],
      market: {
        id: (session.market as any)._id?.toString() || (session.market as any).id,
        name: (session.market as any).name,
      },
      status: session.status,
      bids: bidsWithOffers,
      publishedAt: session.publishedAt,
      createdAt: session.createdAt || new Date(),
      updatedAt: session.updatedAt || new Date(),
    };
  }

  /** Cancels a PENDING offer owned by the authenticated FSP and releases its reserved power from the bid. */
  async cancelOffer(offerId: string): Promise<HourlyOfferResponseDto> {
    const currentUserId = this.tenantContext.getCurrentUserId();

    if (!currentUserId) {
      throw new BadRequestException('User context is required');
    }

    if (!Types.ObjectId.isValid(offerId)) {
      throw new NotFoundException('offer', offerId);
    }

    const fsp = await this.getUserByKeycloakId(currentUserId);

    const offer = await this.hourlyOfferModel
      .findOne({
        _id: new Types.ObjectId(offerId),
        fsp: fsp._id,
      })
      .populate('session');

    if (!offer) {
      throw new NotFoundException('offer', offerId);
    }

    if (offer.status !== OfferStatus.PENDING) {
      throw new BadRequestException('Can only cancel pending offers');
    }

    // Actualizar estado de la offer
    offer.status = OfferStatus.CANCELLED;
    offer.cancelledAt = new Date();
    offer.blockchainOfferId = null;
    await offer.save();

    // Actualizar fulfilledPowerMw en la session bid
    const session = await this.sessionModel.findById(offer.session);
    if (session) {
      const bidIndex = session.bids.findIndex(b => b.hour === offer.hour);
      if (bidIndex >= 0) {
        session.bids[bidIndex].fulfilledPowerMw = Math.max(
          0,
          (session.bids[bidIndex].fulfilledPowerMw || 0) - offer.powerMw
        );
        session.bids[bidIndex].updatedAt = new Date();
        await session.save();
      }
    }

    this.logger.log(`Offer cancelled: ${offerId}`);

    return this.mapOfferToResponseDto(offer, session, fsp);
  }

  /**
   * Approves FLEX token spend, submits the offer to the MarketSession smart contract,
   * and grants NFT approval for settlement. Transitions the offer to ACCEPTED status.
   *
   * @param pin 6-digit PIN to unlock the FSP's wallet for signing
   */
  async publishOfferToBlockchain(offerId: string, pin: string): Promise<HourlyOfferResponseDto> {
    const currentUserId = this.tenantContext.getCurrentUserId();
    const currentMarketId = await this.tenantContext.getCurrentMarket();

    if (!currentUserId) {
      throw new BadRequestException('User context is required');
    }

    if (!currentMarketId) {
      throw new BadRequestException('Market context is required');
    }

    if (!Types.ObjectId.isValid(offerId)) {
      throw new NotFoundException('offer', offerId);
    }

    const fsp = await this.getUserByKeycloakId(currentUserId);

    // Obtener la offer y verificar que pertenece al usuario
    const offer = await this.hourlyOfferModel
      .findOne({
        _id: new Types.ObjectId(offerId),
        fsp: fsp._id,
      })
      .populate('session');

    if (!offer) {
      throw new NotFoundException('offer', offerId);
    }

    // Verificar que la offer está en estado PENDING
    if (offer.status !== OfferStatus.PENDING) {
      throw new BadRequestException('Can only publish offers with PENDING status');
    }

    const session = await this.sessionModel.findById(offer.session);
    if (!session) {
      throw new NotFoundException('session', offer.session.toString());
    }

    // Verificar que la sesión está activa y tiene contractAddress
    if (session.status !== SessionStatus.ACTIVE) {
      throw new BadRequestException('Session must be in ACTIVE status (offers period must be open)');
    }

    if (!session.contractAddress) {
      throw new BadRequestException('Session does not have a blockchain contract address');
    }

    try {
      // Obtener el wallet del usuario con el PIN
      const userWallet = await this.walletService.getConnectedWallet(
        (fsp._id as Types.ObjectId).toString(),
        pin,
        currentMarketId
      );

      this.logger.log(`Publishing offer ${offerId} to blockchain for user ${fsp.username}`);

      // powerMw ya está en MW, la cantidad en el contrato es en MWh
      const quantityMWh = Number(offer.powerMw.toFixed(5)); // MW por 1 hora = MWh
      const quantityWei = ethers.parseEther(quantityMWh.toString());

      // Obtener la dirección del Treasury contract
      const treasuryAddress = this.treasuryService.getContractAddress();

      const sessionContract = new ethers.Contract(
        session.contractAddress,
        [
          'function createOffer(uint8 _hourSlot, uint256 _quantity) returns (uint256)',
          'function flexibilityRequests(uint8) view returns (uint8 hourSlot, uint256 quantity, uint256 quantityFilled, uint256 price, uint8 flexType, bool active, bool completed)'
        ],
        userWallet
      );

      // Calcular el collateral (5%) y fee (2%) del valor de la offer usando el precio
      // almacenado on-chain y aritmética entera, para que el depósito aprobado coincida
      // exactamente con el monto que el contrato calculará en createOffer
      const flexRequest = await sessionContract.flexibilityRequests(offer.hour);
      const priceWei: bigint = flexRequest.price;
      const offerValueWei = (quantityWei * priceWei) / 10n ** 18n;
      const collateralWei = (offerValueWei * 500n) / 10000n;
      const feeWei = (offerValueWei * 200n) / 10000n;
      const totalDepositWei = collateralWei + feeWei;

      this.logger.log(`Offer value (wei): ${offerValueWei}, Collateral (wei): ${collateralWei}, Fee (wei): ${feeWei}, Total deposit (wei): ${totalDepositWei}`);

      // 1. Aprobar tokens para el Treasury (collateral + fee)
      this.logger.log(`Approving ${ethers.formatEther(totalDepositWei)} FLEX tokens for Treasury at ${treasuryAddress}`);

      const tokenContract = new ethers.Contract(
        this.flexTokenService.getContractAddress(),
        [
          'function approve(address spender, uint256 amount) returns (bool)'
        ],
        userWallet
      );

      const approveTx = await tokenContract.approve(treasuryAddress, totalDepositWei);
      this.logger.log(`Approve transaction sent: ${approveTx.hash}`);
      await approveTx.wait();
      this.logger.log(`Approve transaction confirmed: ${approveTx.hash}`);

      // 2. Crear la offer en el contrato de sesión
      this.logger.log(`Creating offer in blockchain for session ${session.contractAddress}`);

      const createOfferTx = await sessionContract.createOffer(offer.hour, quantityWei);
      this.logger.log(`Create offer transaction sent: ${createOfferTx.hash}`);

      const receipt = await createOfferTx.wait();
      this.logger.log(`Create offer transaction confirmed: ${createOfferTx.hash}`);

      // 2.5. Aprobar al MarketSession para transferir NFTs del FSP
      const nftContractAddress = this.flexibilityNFTService.getContractAddress();
      const nftContract = new ethers.Contract(
        nftContractAddress,
        ['function setApprovalForAll(address operator, bool approved) external'],
        userWallet
      );

      this.logger.log(`[Offer ${offerId}] Setting NFT approval for MarketSession ${session.contractAddress}...`);
      const approvalTx = await nftContract.setApprovalForAll(session.contractAddress, true);
      await approvalTx.wait();
      this.logger.log(`[Offer ${offerId}] ✅ NFT approval granted. TX: ${approvalTx.hash}`);

      // Extraer el offerId del evento OfferCreated
      let blockchainOfferId: number | null = null;
      for (const log of receipt.logs) {
        try {
          const parsed = sessionContract.interface.parseLog(log);
          if (parsed && parsed.name === 'OfferCreated') {
            blockchainOfferId = Number(parsed.args[0]);
            break;
          }
        } catch {
          // Ignorar logs que no son del contrato
        }
      }

      if (blockchainOfferId === null) {
        this.logger.warn('Could not extract offerId from OfferCreated event');
      }

      // 3. Actualizar la offer en la base de datos
      offer.status = OfferStatus.ACCEPTED;
      offer.transactionHash = createOfferTx.hash;
      if (blockchainOfferId !== null) {
        offer.blockchainOfferId = blockchainOfferId;
      }
      offer.acceptedAt = new Date();
      await offer.save();

      this.logger.log(`Offer ${offerId} successfully published to blockchain with ID ${blockchainOfferId}`);

      return this.mapOfferToResponseDto(offer, session, fsp);
    } catch (error) {
      this.logger.error(`Failed to publish offer ${offerId} to blockchain`, error);

      // Si el error es por PIN incorrecto o wallet locked, lanzarlo directamente
      if (error instanceof BadRequestException) {
        throw error;
      }

      // Manejar errores específicos de blockchain
      const errorMessage = error.message || 'Unknown blockchain error';
      
      // Error de fondos insuficientes (ETH para gas)
      if (errorMessage.includes('insufficient funds') || 
          errorMessage.includes("doesn't have enough funds") ||
          errorMessage.includes('balance is: 0')) {
        throw new BadRequestException(
          'Insufficient ETH to pay for gas fees. Please contact the marketplace administrator to fund your wallet.'
        );
      }

      // Error de tokens insuficientes
      if (errorMessage.includes('insufficient balance') || 
          errorMessage.includes('ERC20: transfer amount exceeds balance')) {
        throw new BadRequestException('Insufficient FLEX tokens. Please check your balance.');
      }

      // Error genérico
      throw new BadRequestException('Failed to publish offer. Please try again or contact support.');
    }
  }

  private mapOfferToResponseDto(
    offer: HourlyOfferDocument,
    session: SessionDocument | any,
    fsp: UserDocument | any
  ): HourlyOfferResponseDto {
    return {
      id: (offer._id as any).toString(),
      session: {
        id: session._id?.toString() || session.id,
        name: session.name,
        sessionDate: session.sessionDate?.toISOString().split('T')[0] || '',
      },
      hour: offer.hour,
      fsp: {
        id: fsp._id?.toString() || fsp.id,
        username: fsp.username,
        email: fsp.email,
      },
      powerMw: offer.powerMw,
      pricePerMwh: offer.pricePerMwh,
      status: offer.status,
      acceptedAt: offer.acceptedAt,
      rejectedAt: offer.rejectedAt,
      cancelledAt: offer.cancelledAt,
      createdAt: offer.createdAt || new Date(),
      updatedAt: offer.updatedAt || new Date(),
      transactionHash: offer.transactionHash,
    };
  }
}
