import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ethers } from 'ethers';
import { Settlement, SettlementDocument, SettlementStatus } from './schemas/settlement.schema';
import { FrpPaymentRequest, FrpPaymentRequestDocument, FrpPaymentRequestStatus } from './schemas/frp-payment-request.schema';
import { MarketSessionContractService } from '../blockchain/contracts/market-session/market-session.contract.service';
import { FlexibilityNFTContractService } from '../blockchain/contracts/flexibility-nft/flexibility-nft.contract.service';
import { FlexibilityTokenContractService } from '../blockchain/contracts/flexibility-token/flexibility-token.contract.service';
import { TreasuryContractService } from '../blockchain/contracts/treasury/treasury.contract.service';
import { ConsumptionDataService } from '../flexibility/services/consumption-data.service';
import { WalletService } from '../wallet/wallet.service';
import { TenantContextService } from '../tenant/services/tenant-context.service';
import { UserService } from '../user/user.service';
import { EmailService } from '../email/email.service';
import { ProfileType, MeasurementType } from '../flexibility/schemas/interfaces';
import { HourlyOffer, HourlyOfferDocument, OfferStatus } from '../../schemas/HourlyOffer.schema';
import { Session, SessionDocument } from '../../schemas/Session.schema';
import { Market, MarketDocument } from '../../schemas/Market.schema';
import { User, UserDocument } from '../../schemas/User.schema';
import {
  SettlementCalculationResponseDto,
  SettlementResponseDto,
  SettlementTxResponseDto,
  SessionSettlementsSummaryDto,
} from './dto/settlement.dto';
import { ConfigService } from '@nestjs/config';

/**
 * Service responsible for the full settlement lifecycle of flexibility offers.
 *
 * Responsibilities:
 * - Calculate settlements based on actual consumption data
 * - Submit settlements to blockchain signed with the user's wallet (PIN)
 * - Execute settlements to trigger payments
 * - Persist and query settlement records in MongoDB
 * - Manage FRP deposit payment requests
 */
@Injectable()
export class SettlementService {
  private readonly logger = new Logger(SettlementService.name);

  // Constantes de cálculo
  private readonly PLATFORM_FEE_BPS = 200; // 2% = 200 basis points

  constructor(
    @InjectModel(Settlement.name) private settlementModel: Model<SettlementDocument>,
    @InjectModel(FrpPaymentRequest.name) private frpPaymentRequestModel: Model<FrpPaymentRequestDocument>,
    @InjectModel(HourlyOffer.name) private hourlyOfferModel: Model<HourlyOfferDocument>,
    @InjectModel(Session.name) private sessionModel: Model<SessionDocument>,
    @InjectModel(Market.name) private marketModel: Model<MarketDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private readonly marketSessionService: MarketSessionContractService,
    private readonly flexibilityNFTService: FlexibilityNFTContractService,
    private readonly flexibilityTokenService: FlexibilityTokenContractService,
    private readonly treasuryService: TreasuryContractService,
    private readonly consumptionDataService: ConsumptionDataService,
    private readonly walletService: WalletService,
    private readonly tenantContext: TenantContextService,
    private readonly userService: UserService,
    private readonly emailService: EmailService,
    private readonly configService: ConfigService,
  ) { }

  /**
   * Calculates a settlement for a single offer without submitting it to blockchain (preview).
   *
   * @param sessionAddress Address of the MarketSession contract
   * @param offerId Offer ID as stored in the smart contract
   * @returns Detailed settlement calculation result
   */
  async calculateSettlement(
    sessionAddress: string,
    offerId: number,
  ): Promise<SettlementCalculationResponseDto> {
    this.logger.log(`Calculating settlement for session ${sessionAddress}, offer ${offerId}`);

    // 1. Obtener información de la oferta desde blockchain
    let offerInfo: any;
    try {
      offerInfo = await this.marketSessionService.getOffer(sessionAddress, offerId);
    } catch (error) {
      this.logger.error(`[Offer ${offerId}] Failed to get offer from blockchain: ${error.message}`);
      throw error;
    }
    if (!offerInfo) {
      throw new NotFoundException(`Offer ${offerId} not found in session ${sessionAddress}`);
    }
    this.logger.debug(`[Offer ${offerId}] Blockchain offer data: hourSlot=${offerInfo.hourSlot}, quantity=${offerInfo.quantity}, price=${offerInfo.price}, collateral=${offerInfo.collateralAmount}`);

    // 2. Buscar la session en MongoDB
    const session = await this.sessionModel.findOne({ contractAddress: sessionAddress }).exec();
    if (!session) {
      throw new NotFoundException(`Session with address ${sessionAddress} not found`);
    }
    this.logger.debug(`[Offer ${offerId}] Session found: ${session._id}, flexibilityRequests count=${session.flexibilityRequests?.length || 0}`);

    // 3. Verificar que el hourSlot tiene un flexibility request correspondiente
    const hourSlot = offerInfo.hourSlot;
    const hasFlexibilityRequest = session.flexibilityRequests?.some(
      (req: any) => req.hourSlot === hourSlot
    );
    if (!hasFlexibilityRequest) {
      const availableHourSlots = session.flexibilityRequests?.map((r: any) => r.hourSlot).join(', ') || 'none';
      this.logger.warn(
        `[Offer ${offerId}] ⚠️ No flexibility request found for hourSlot ${hourSlot} in session ${session._id}. ` +
        `Available hourSlots: [${availableHourSlots}]`
      );
      throw new BadRequestException(
        `No flexibility request configured for hourSlot ${hourSlot} in this session. ` +
        `Cannot calculate settlement without baseline data.`
      );
    }
    this.logger.debug(`[Offer ${offerId}] ✅ Flexibility request validated for hourSlot ${hourSlot}`);

    // 4. Obtener HourlyOffer desde MongoDB
    const hourlyOffer = await this.hourlyOfferModel.findOne({
      session: session._id,
      blockchainOfferId: offerId,
      status: OfferStatus.ACCEPTED,
    }).populate('fsp').exec();

    if (!hourlyOffer) {
      throw new NotFoundException(`HourlyOffer with blockchain ID ${offerId} not found`);
    }

    const fspUser = hourlyOffer.fsp as any;
    const fspUserId = fspUser._id.toString();
    const fspAddress = offerInfo.fsp;
    const deliveryDate = session.sessionDate;
    const marketId = session.market?.toString();

    // 5. Obtener el tipo de bid (UPWARD o DOWNWARD) de la session
    const correspondingBid = session.bids?.find(bid => bid.hour === hourlyOffer.hour);
    if (!correspondingBid) {
      throw new BadRequestException(
        `No bid found for hour ${hourlyOffer.hour} in session ${session._id}. Cannot determine bid type.`
      );
    }
    const bidType = correspondingBid.bidType;
    
    this.logger.debug(`[Offer ${offerId}] FSP: ${fspUserId}, hourSlot: ${hourSlot}, bidType: ${bidType}, market: ${marketId}, collateralAmount(MongoDB): ${hourlyOffer.collateralAmount}`);

    // Normalizar la fecha a inicio del día para comparaciones
    const deliveryDateNormalized = new Date(deliveryDate);
    deliveryDateNormalized.setUTCHours(0, 0, 0, 0);

    // 3. Obtener perfil de referencia STANDARD (usando marketId de la session)
    const baseline = await this.consumptionDataService.getReferenceProfileByMarket(
      fspUserId,
      ProfileType.REFERENCE_STANDARD,
      marketId,
    );

    if (!baseline) {
      throw new BadRequestException(
        `No baseline (REFERENCE_STANDARD) profile found for FSP ${fspUserId} in market ${marketId}`,
      );
    }

    // 4. Obtener consumo ACTUAL del día de entrega (usando marketId de la session)
    const actual = await this.consumptionDataService.getActualConsumptionByMarket(
      fspUserId,
      deliveryDateNormalized,
      marketId,
    );

    if (!actual) {
      throw new BadRequestException(
        `No actual consumption data found for FSP ${fspUserId} on ${deliveryDateNormalized.toISOString()} in market ${marketId}`,
      );
    }

    // 6. Calcular valores de consumo para la hora específica
    // Prefer NET_LOAD_WITHOUT_FLEX (matches flexibility_data calculation); fall back to CONSUMPTION
    const baselineValue =
      baseline.getMeasurementAt(MeasurementType.NET_LOAD_WITHOUT_FLEX, 60, hourSlot) ??
      baseline.getMeasurementAt(MeasurementType.CONSUMPTION, 60, hourSlot);
    const actualValue =
      actual.getMeasurementAt(MeasurementType.NET_LOAD_WITHOUT_FLEX, 60, hourSlot) ??
      actual.getMeasurementAt(MeasurementType.CONSUMPTION, 60, hourSlot);

    this.logger.debug(`[Offer ${offerId}] Consumption values: baseline=${baselineValue}, actual=${actualValue}, hourSlot=${hourSlot}, bidType=${bidType}`);

    if (baselineValue === null || actualValue === null) {
      throw new BadRequestException(
        `Missing consumption data for hour ${hourSlot}. Baseline: ${baselineValue}, Actual: ${actualValue}`,
      );
    }

    // 7. Calcular flexibilidad entregada en Wh según el tipo de bid
    let deliveredFlexWh: number;
    
    if (bidType === 'UPWARD') {
      // UPWARD: FRP pide que el FSP AUMENTE consumo → flexibilidad = actual - baseline
      deliveredFlexWh = actualValue - baselineValue;

      if (deliveredFlexWh < 0) {
        this.logger.warn(
          `[Offer ${offerId}] ⚠️ UPWARD bid has NEGATIVE flexibility (${deliveredFlexWh}Wh). ` +
          `FSP reduced consumption instead of increasing it. Baseline: ${baselineValue}Wh, Actual: ${actualValue}Wh. ` +
          `This will result in full penalty.`
        );
        deliveredFlexWh = 0;
      } else {
        this.logger.debug(
          `[Offer ${offerId}] UPWARD flexibility delivered: ${deliveredFlexWh}Wh (increased consumption from ${baselineValue}Wh to ${actualValue}Wh)`
        );
      }
    } else if (bidType === 'DOWNWARD') {
      // DOWNWARD: FRP pide que el FSP REDUZCA consumo → flexibilidad = baseline - actual
      deliveredFlexWh = baselineValue - actualValue;

      if (deliveredFlexWh < 0) {
        this.logger.warn(
          `[Offer ${offerId}] ⚠️ DOWNWARD bid has NEGATIVE flexibility (${deliveredFlexWh}Wh). ` +
          `FSP increased consumption instead of reducing it. Baseline: ${baselineValue}Wh, Actual: ${actualValue}Wh. ` +
          `This will result in full penalty.`
        );
        deliveredFlexWh = 0;
      } else {
        this.logger.debug(
          `[Offer ${offerId}] DOWNWARD flexibility delivered: ${deliveredFlexWh}Wh (reduced consumption from ${baselineValue}Wh to ${actualValue}Wh)`
        );
      }
    } else {
      throw new BadRequestException(`Unknown bid type: ${bidType}`);
    }

    // 7. Convertir delivered quantity a wei (kWh con 18 decimales, igual que committedQuantityWei)
    // deliveredFlexWh está en Wh, dividir por 1_000 para kWh, luego multiplicar por 1e18 para wei
    // Equivalente: deliveredFlexWh * 1e18 / 1_000 = deliveredFlexWh * 1e15
    const deliveredQuantityWei = BigInt(Math.round(deliveredFlexWh)) * BigInt(1e15);

    // 8. Cantidad comprometida en wei (ya viene en wei del blockchain)
    const committedQuantityWei = BigInt(offerInfo.quantity);

    // 9. Calcular desviación en wei
    const deviationWei = committedQuantityWei - deliveredQuantityWei;
    // Para porcentaje usamos números normales (committedQuantityWei representa kWh, igual que deliveredFlexWh/1000)
    const committedQuantityWh = Number(ethers.formatUnits(committedQuantityWei, 18)) * 1_000;
    const deviationPct = committedQuantityWh > 0
      ? ((committedQuantityWh - deliveredFlexWh) / committedQuantityWh) * 100
      : 0;

    // 10. Obtener precio por MWh en wei (ya viene en wei del blockchain)
    const priceWei = BigInt(offerInfo.price);

    // 11. Calcular payment (lo que FRP paga y FSP recibe) - EXACTAMENTE como el contrato:
    // payment = (deliveredQuantity * price) / 1e18
    const paymentWei = (deliveredQuantityWei * priceWei) / BigInt(1e18);

    // 12. Calcular platform fee (2% del valor COMPROMETIDO, no del entregado)
    // El fee fue pre-pagado por el FSP al crear la offer
    const offerValueWei = (committedQuantityWei * priceWei) / BigInt(1e18);
    const platformFeeWei = (offerValueWei * BigInt(this.PLATFORM_FEE_BPS)) / BigInt(10000);

    // 14. Obtener collateral de la oferta (ya en wei del blockchain)
    const collateralFromBlockchain = offerInfo.collateralAmount; // String en wei
    const collateralAmountWei = BigInt(collateralFromBlockchain || '0');

    // Valores en float solo para logging y display
    const deliveredFlexKWh = deliveredFlexWh / 1_000;
    const pricePerKWh = Number(ethers.formatUnits(priceWei, 18));
    const paymentDisplay = Number(ethers.formatUnits(paymentWei, 18));
    const collateralDisplay = Number(ethers.formatUnits(collateralAmountWei, 18));
    const feeDisplay = Number(ethers.formatUnits(platformFeeWei, 18));

    this.logger.debug(`[Offer ${offerId}] Calculation values: deliveredFlexWh=${deliveredFlexWh}, deliveredFlexKWh=${deliveredFlexKWh.toFixed(6)}, committedWei=${committedQuantityWei}, deviationPct=${deviationPct.toFixed(2)}%, pricePerKWh=${pricePerKWh}, payment=${paymentDisplay.toFixed(6)} FLEX, fee=${feeDisplay.toFixed(6)} FLEX, collateral=${collateralDisplay}`);

    // 15. Calcular penalización basada en collateral
    let collateralForfeitedWei = BigInt(0);
    let collateralReturnedWei = collateralAmountWei;
    let deviationType = 'none';

    if (deviationWei > BigInt(0)) {
      deviationType = 'shortfall';
      const shortfallPct = deviationPct;

      if (shortfallPct <= 25) {
        // collateralForfeited = collateral * shortfallPct / 100
        // Use integer math: multiply by deviationPct * 100 (to keep 2 decimal precision), divide by 10000
        const shortfallBps = BigInt(Math.round(shortfallPct * 100));
        collateralForfeitedWei = (collateralAmountWei * shortfallBps) / BigInt(10000);
        collateralReturnedWei = collateralAmountWei - collateralForfeitedWei;
      } else {
        collateralForfeitedWei = collateralAmountWei;
        collateralReturnedWei = BigInt(0);
      }
    } else if (deviationWei < BigInt(0)) {
      deviationType = 'excess';
      collateralReturnedWei = collateralAmountWei;
      collateralForfeitedWei = BigInt(0);
    }

    // 16. Generar hash de mediciones
    const meterReadingsHash = this.generateMeterReadingsHash(
      fspAddress,
      baselineValue,
      actualValue,
      hourSlot,
      deliveryDate,
    );

    this.logger.log(`[Offer ${offerId}] Settlement calculated: delivered=${deliveredFlexWh}Wh, deviation=${deviationPct.toFixed(2)}%, type=${deviationType}, bidType=${bidType}, collateralForfeited=${ethers.formatUnits(collateralForfeitedWei, 18)} FLEX, payment=${paymentDisplay.toFixed(6)} FLEX, fee=${feeDisplay.toFixed(6)} FLEX`);

    return {
      offerId,
      hourSlot,
      bidType,
      fspUserId,
      fspAddress,
      deliveryDate: deliveryDateNormalized,
      committedQuantity: offerInfo.quantity,
      deliveredQuantity: deliveredQuantityWei.toString(),
      deviationPercentage: parseFloat(deviationPct.toFixed(2)),
      deviationType,
      collateralAmount: collateralAmountWei.toString(),
      collateralForfeited: collateralForfeitedWei.toString(),
      collateralReturned: collateralReturnedWei.toString(),
      penaltyAmount: collateralForfeitedWei.toString(),
      payment: paymentWei.toString(),
      platformFee: platformFeeWei.toString(),
      price: offerInfo.price,
      meterReadingsHash,
      baselineConsumption: baselineValue,
      actualConsumption: actualValue,
    };
  }

  /** Calculates and persists settlements for all accepted offers in a session. */
  async calculateAllSettlements(sessionAddress: string): Promise<{
    total: number;
    success: number;
    failed: number;
    settlements: SettlementCalculationResponseDto[];
    errors: string[];
  }> {
    this.logger.log(`Calculating all settlements for session ${sessionAddress}`);

    // Get session from MongoDB
    const session = await this.sessionModel.findOne({
      contractAddress: sessionAddress
    }).exec();

    if (!session) {
      throw new NotFoundException(`Session not found: ${sessionAddress}`);
    }

    // Get accepted offers
    const acceptedOffers = await this.hourlyOfferModel.find({
      session: session._id,
      status: OfferStatus.ACCEPTED,
    }).exec();

    const total = acceptedOffers.length;
    const settlements: SettlementCalculationResponseDto[] = [];
    const errors: string[] = [];
    let success = 0;
    let failed = 0;

    for (const offer of acceptedOffers) {
      const offerId = offer.blockchainOfferId;
      if (offerId === undefined || offerId === null) {
        errors.push(`Offer ${offer._id} has no blockchainOfferId`);
        failed++;
        continue;
      }

      try {
        const calculation = await this.calculateSettlement(sessionAddress, offerId);

        // Guardar en MongoDB con status CALCULATED
        await this.findOrCreateSettlement(sessionAddress, offerId, calculation);

        settlements.push(calculation);
        success++;
        this.logger.log(`✅ Settlement calculated and saved for offer ${offerId}`);
      } catch (error: any) {
        errors.push(`Offer ${offerId}: ${error.message}`);
        failed++;
        this.logger.error(`❌ Failed to calculate settlement for offer ${offerId}: ${error.message}`);
      }
    }

    return {
      total,
      success,
      failed,
      settlements,
      errors,
    };
  }

  /**
   * Submits a calculated settlement to blockchain, signed with the user's wallet.
   *
   * @param sessionAddress Address of the MarketSession contract
   * @param offerId Offer ID as stored in the smart contract
   * @param userId MongoDB ObjectId of the signing user
   * @param pin 6-digit PIN to unlock the user's wallet
   * @param marketId Optional market ObjectId used to resolve the wallet
   * @returns Transaction hash and updated settlement record
   */
  async submitSettlementWithPin(
    sessionAddress: string,
    offerId: number,
    userId: string,
    pin: string,
    marketId?: string,
  ): Promise<SettlementTxResponseDto> {
    this.logger.log(`Submitting settlement for session ${sessionAddress}, offer ${offerId}`);

    // 1. Calcular el settlement
    const calculation = await this.calculateSettlement(sessionAddress, offerId);

    // 2. Obtener wallet del usuario
    const userWallet = await this.walletService.getConnectedWallet(userId, pin, marketId);

    // 3. Buscar o crear registro de settlement en MongoDB
    // Note: FRP balance check is only done in executeSettlementWithPin, not here
    let settlement = await this.findOrCreateSettlement(sessionAddress, offerId, calculation);

    try {
      // 6. Crear contrato con wallet del usuario
      const contract = new ethers.Contract(
        sessionAddress,
        [
          'function submitSettlement(uint256 offerId, uint256 deliveredQuantity, uint256 penaltyAmount, bytes32 meterReadingsHash) external',
        ],
        userWallet,
      );

      // 7. Enviar transacción
      const tx = await contract.submitSettlement(
        offerId,
        calculation.deliveredQuantity,
        calculation.penaltyAmount,
        calculation.meterReadingsHash,
      );

      this.logger.log(`[Offer ${offerId}] Submit settlement tx sent: ${tx.hash}`);

      // 8. Esperar confirmación
      const receipt = await tx.wait();

      // 9. Actualizar estado en MongoDB
      const updatedSettlement = await this.settlementModel.findByIdAndUpdate(
        settlement._id,
        {
          status: SettlementStatus.SUBMITTED,
          submitTxHash: tx.hash,
        },
        { new: true },
      ).exec();

      if (!updatedSettlement) {
        throw new Error(`Settlement not found: ${settlement._id}`);
      }

      settlement = updatedSettlement;

      this.logger.log(
        `[Offer ${offerId}] ✅ Settlement submitted successfully.\n` +
        `   TX Hash: ${tx.hash}\n` +
        `   Block: ${receipt.blockNumber}`
      );

      return {
        success: true,
        transactionHash: tx.hash,
        blockNumber: receipt.blockNumber,
        status: SettlementStatus.SUBMITTED,
        settlement: this.toResponseDto(settlement!),
      };
    } catch (error) {
      this.logger.error(
        `[Offer ${offerId}] ❌ Failed to submit settlement: ${error.message}`,
        error.stack
      );

      // Actualizar estado de error
      await this.settlementModel.findByIdAndUpdate(settlement._id, {
        status: SettlementStatus.FAILED,
        errorMessage: error.message,
      }).exec();

      throw new BadRequestException(`Failed to submit settlement: ${error.message}`);
    }
  }

  /**
   * Executes a previously submitted settlement to trigger payment distribution.
   * Verifies that the FRP has sufficient funds in Treasury before proceeding.
   *
   * @param sessionAddress Address of the MarketSession contract
   * @param offerId Offer ID as stored in the smart contract
   * @param userId MongoDB ObjectId of the signing user
   * @param pin 6-digit PIN to unlock the user's wallet
   * @param marketId Optional market ObjectId used to resolve the wallet
   * @returns Transaction hash and updated settlement record
   */
  async executeSettlementWithPin(
    sessionAddress: string,
    offerId: number,
    userId: string,
    pin: string,
    marketId?: string,
  ): Promise<SettlementTxResponseDto> {
    this.logger.log(`Executing settlement for session ${sessionAddress}, offer ${offerId}`);

    // 1. Validar settlement existe y está en estado SUBMITTED
    const settlement = await this.settlementModel.findOne({
      sessionAddress,
      offerId,
    }).exec();

    if (!settlement) {
      throw new NotFoundException(`Settlement not found for session ${sessionAddress}, offer ${offerId}`);
    }

    if (settlement.status !== SettlementStatus.SUBMITTED) {
      throw new BadRequestException(
        `Settlement must be in SUBMITTED status to execute. Current status: ${settlement.status}`,
      );
    }

    // 2. Obtener session y hourlyOffer para actualizar después
    const session = await this.sessionModel.findOne({ contractAddress: sessionAddress }).exec();
    if (!session) {
      throw new NotFoundException(`Session not found: ${sessionAddress}`);
    }

    const hourlyOffer = await this.hourlyOfferModel.findOne({
      session: session._id,
      blockchainOfferId: offerId,
      status: OfferStatus.ACCEPTED,
    }).exec();

    if (!hourlyOffer) {
      throw new NotFoundException(`HourlyOffer not found for offer ${offerId}`);
    }

    // 3. Obtener wallet del usuario
    const userWallet = await this.walletService.getConnectedWallet(userId, pin, marketId);

    // 3.1 Obtener información del FRP desde market
    const market = await this.marketModel.findById(session.market).exec();
    if (!market || !market.frp) {
      throw new NotFoundException('Market or FRP not found');
    }

    const frpUser = await this.userModel.findById(market.frp).exec();
    if (!frpUser) {
      throw new NotFoundException('FRP user not found');
    }

    // FRP uses their own SELF wallet with FRP_ROLE granted on Treasury
    const frpAddress = frpUser.publicAddress || '';

    // 3.2 Verificar balance del FRP en Treasury ANTES de ejecutar
    if (frpAddress) {
      try {
        const treasuryAddress = this.treasuryService.getContractAddress();
        const treasuryContract = new ethers.Contract(
          treasuryAddress,
          ['function getBalance(address account) view returns (uint256)'],
          userWallet,
        );

        const frpBalance = await treasuryContract.getBalance(frpAddress);
        const requiredAmount = BigInt(settlement.payment || '0');
        const frpBalanceFlex = Number(ethers.formatUnits(frpBalance, 18));
        const paymentFlex = Number(ethers.formatUnits(requiredAmount, 18));

        this.logger.log(
          `[Offer ${offerId}] 💰 FRP Treasury Balance Check (EXECUTE):\n` +
          `   FRP Address: ${frpAddress}\n` +
          `   Current Balance: ${frpBalanceFlex.toFixed(4)} FLEX\n` +
          `   Required (Payment): ${paymentFlex.toFixed(4)} FLEX\n` +
          `   Status: ${frpBalance >= requiredAmount ? '✅ SUFFICIENT' : '❌ INSUFFICIENT'}`
        );

        if (frpBalance < requiredAmount) {
          const deficit = paymentFlex - frpBalanceFlex;
          this.logger.error(
            `[Offer ${offerId}] ❌ FRP Treasury Balance Insufficient (EXECUTE):\n` +
            `   Deficit: ${deficit.toFixed(4)} FLEX\n` +
            `   Settlement cannot be executed without sufficient FRP funds`
          );
          throw new BadRequestException(
            `FRP has insufficient funds in Treasury. ` +
            `Required: ${paymentFlex.toFixed(4)} FLEX, ` +
            `Available: ${frpBalanceFlex.toFixed(4)} FLEX, ` +
            `Deficit: ${deficit.toFixed(4)} FLEX. ` +
            `Please request FRP to deposit more funds before executing settlement.`
          );
        }

        this.logger.log(
          `[Offer ${offerId}] ✅ FRP Treasury balance verified. Proceeding with settlement execution.`
        );
      } catch (error: any) {
        if (error instanceof BadRequestException) {
          throw error;
        }
        this.logger.warn(
          `[Offer ${offerId}] ⚠️ Failed to check FRP balance in Treasury: ${error.message}. ` +
          `Proceeding with settlement execution (balance check may be unavailable).`
        );
      }
    }

    try {
      // 4. Ejecutar settlement en blockchain
      const contract = new ethers.Contract(
        sessionAddress,
        ['function executeSettlement(uint256 offerId) external'],
        userWallet,
      );

      const executeTx = await contract.executeSettlement(offerId);
      this.logger.log(`Execute settlement tx sent: ${executeTx.hash}`);

      const executeReceipt = await executeTx.wait();
      if (!executeReceipt) {
        throw new Error('Execute settlement transaction failed: receipt is null');
      }

      // 5. Extraer NFT tokenId del evento TransferSingle
      const nftTokenId = this.extractNftTokenIdFromReceipt(executeReceipt, userWallet);

      // 6. Actualizar settlement en MongoDB con metadata completo
      const nftMetadata = nftTokenId !== undefined ? {
        tokenId: nftTokenId,
        promisedFlexibility: settlement.committedQuantity,
        deliveredFlexibility: settlement.deliveredQuantity,
        deliveryDate: settlement.deliveryDate,
        hourSlot: settlement.hourSlot,
        deviationPercentage: settlement.deviationPercentage,
        penaltyApplied: BigInt(settlement.penaltyAmount || '0') > BigInt(0),
        deviationType: settlement.deviationType,
        collateralAmount: settlement.collateralAmount,
        collateralForfeited: settlement.collateralForfeited,
        collateralReturned: settlement.collateralReturned,
        penaltyAmount: settlement.penaltyAmount,
      } : undefined;

      const updatedSettlement = await this.settlementModel.findByIdAndUpdate(
        settlement._id,
        {
          status: SettlementStatus.EXECUTED,
          executeTxHash: executeTx.hash,
          executedAt: new Date(),
          flexibilityNftId: nftTokenId?.toString(),
          nftMetadata,
        },
        { new: true },
      ).exec();

      if (!updatedSettlement) {
        throw new Error(`Settlement not found: ${settlement._id}`);
      }

      // 7. Actualizar HourlyOffer con información de collateral
      const collateralReturned = BigInt(settlement.collateralReturned || '0');
      const collateralForfeited = BigInt(settlement.collateralForfeited || '0');

      await this.hourlyOfferModel.findByIdAndUpdate(
        hourlyOffer._id,
        {
          collateralReturned: Number(ethers.formatUnits(collateralReturned, 18)),
          collateralForfeited: Number(ethers.formatUnits(collateralForfeited, 18)),
        },
      ).exec();

      this.logger.log(`Settlement executed successfully for offer ${offerId}`);

      return {
        success: true,
        transactionHash: executeTx.hash,
        blockNumber: executeReceipt.blockNumber,
        status: SettlementStatus.EXECUTED,
        settlement: this.toResponseDto(updatedSettlement),
      };
    } catch (error) {
      this.logger.error(`Failed to execute settlement: ${error.message}`, error.stack);

      await this.settlementModel.findByIdAndUpdate(settlement._id, {
        status: SettlementStatus.FAILED,
        errorMessage: error.message,
      }).exec();

      throw new BadRequestException(`Failed to execute settlement: ${error.message}`);
    }
  }

  /**
   * Extrae el NFT tokenId del receipt de la transacción
   */
  private extractNftTokenIdFromReceipt(executeReceipt: any, userWallet: any): number | undefined {
    const nftAddress = this.flexibilityNFTService.getContractAddress();
    const nftContract = new ethers.Contract(
      nftAddress,
      ['event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value)'],
      userWallet,
    );

    for (const log of executeReceipt.logs) {
      try {
        const parsed = nftContract.interface.parseLog({
          topics: log.topics as string[],
          data: log.data,
        });

        if (parsed && parsed.name === 'TransferSingle') {
          const tokenId = Number(parsed.args.id);
          this.logger.log(`NFT ${tokenId} transferred to FRP`);
          return tokenId;
        }
      } catch (e) {
        continue;
      }
    }

    return undefined;
  }

  /** Retrieves a settlement record by session address and offer ID, or null if not found. */
  async getSettlement(sessionAddress: string, offerId: number): Promise<SettlementResponseDto | null> {
    const settlement = await this.settlementModel.findOne({
      sessionAddress,
      offerId,
    }).exec();

    return settlement ? this.toResponseDto(settlement) : null;
  }

  /** Returns all settlement records for the given session, ordered by offer ID. */
  async getSettlementsBySession(sessionAddress: string): Promise<SettlementResponseDto[]> {
    const settlements = await this.settlementModel.find({
      sessionAddress,
    }).sort({ offerId: 1 }).exec();

    return settlements.map(s => this.toResponseDto(s));
  }

  /** Returns all settlement records belonging to a specific FSP in the current market. */
  async getSettlementsByFsp(fspUserId: string): Promise<SettlementResponseDto[]> {
    const marketId = await this.tenantContext.getCurrentMarket();

    const settlements = await this.settlementModel.find({
      fspUserId: new Types.ObjectId(fspUserId),
      market: new Types.ObjectId(marketId),
    }).sort({ createdAt: -1 }).exec();

    return settlements.map(s => this.toResponseDto(s));
  }

  /** Returns settlement records for the currently authenticated FSP user. */
  async getMySettlements(): Promise<SettlementResponseDto[]> {
    const userKeycloakId = this.tenantContext.getCurrentUserId();
    if (!userKeycloakId) {
      throw new BadRequestException('User context required');
    }

    const user = await this.userService.getUserByKeycloakId(userKeycloakId);
    return this.getSettlementsByFsp(user.id);
  }

  /** Returns all settlement records for the specified market, ordered by creation date. */
  async getSettlementsByMarket(marketId: string): Promise<SettlementResponseDto[]> {
    const settlements = await this.settlementModel
      .find({
        market: new Types.ObjectId(marketId),
      })
      .populate('sessionId', 'name sessionDate')
      .sort({ createdAt: -1 })
      .exec();

    return settlements.map(s => this.toResponseDto(s));
  }

  /** Returns aggregated counts and totals for all settlements of a session. */
  async getSessionSettlementsSummary(sessionAddress: string): Promise<SessionSettlementsSummaryDto> {
    const settlements = await this.settlementModel.find({ sessionAddress }).exec();

    const summary: SessionSettlementsSummaryDto = {
      sessionAddress,
      totalOffers: settlements.length,
      settlementsCalculated: settlements.filter(s => s.status === SettlementStatus.CALCULATED).length,
      settlementsSubmitted: settlements.filter(s => s.status === SettlementStatus.SUBMITTED).length,
      settlementsExecuted: settlements.filter(s => s.status === SettlementStatus.EXECUTED).length,
      settlementsFailed: settlements.filter(s => s.status === SettlementStatus.FAILED).length,
      totalPayment: '0',
      totalPlatformFees: '0',
      totalPenalties: '0',
    };

    // Sumar valores
    let totalPayment = BigInt(0);
    let totalFees = BigInt(0);
    let totalPenalties = BigInt(0);

    for (const s of settlements) {
      totalPayment += BigInt(s.payment);
      totalFees += BigInt(s.platformFee);
      totalPenalties += BigInt(s.penaltyAmount);
    }

    summary.totalPayment = totalPayment.toString();
    summary.totalPlatformFees = totalFees.toString();
    summary.totalPenalties = totalPenalties.toString();

    return summary;
  }

  /**
   * Genera hash de lecturas del medidor
   */
  private generateMeterReadingsHash(
    fspAddress: string,
    baselineValue: number,
    actualValue: number,
    hourSlot: number,
    deliveryDate: Date,
  ): string {
    const encoder = new ethers.AbiCoder();
    const encoded = encoder.encode(
      ['address', 'uint256', 'uint256', 'uint8', 'uint256'],
      [
        fspAddress,
        Math.max(0, Math.round(baselineValue)),
        Math.max(0, Math.round(actualValue)),
        hourSlot,
        Math.floor(deliveryDate.getTime() / 1000),
      ],
    );
    return ethers.keccak256(encoded);
  }

  /**
   * Busca o crea un registro de settlement en MongoDB
   */
  private async findOrCreateSettlement(
    sessionAddress: string,
    offerId: number,
    calculation: SettlementCalculationResponseDto,
  ): Promise<SettlementDocument> {
    let settlement = await this.settlementModel.findOne({
      sessionAddress,
      offerId,
    }).exec();

    if (settlement) {
      // Actualizar con nuevos cálculos
      settlement = await this.settlementModel.findByIdAndUpdate(
        settlement._id,
        {
          ...this.calculationToSchema(calculation, sessionAddress),
          status: SettlementStatus.CALCULATED,
        },
        { new: true },
      ).exec();
    } else {
      // Crear nuevo
      const session = await this.sessionModel.findOne({ contractAddress: sessionAddress }).exec();
      const hourlyOffer = await this.hourlyOfferModel.findOne({
        session: session?._id,
        blockchainOfferId: offerId,
      }).exec();

      settlement = await this.settlementModel.create({
        ...this.calculationToSchema(calculation, sessionAddress),
        sessionId: session?._id,
        hourlyOfferId: hourlyOffer?._id,
        market: session?.market,
        status: SettlementStatus.CALCULATED,
      });
      
      this.logger.debug(`[Settlement Created] Offer ${offerId} - bidType: ${settlement.bidType || 'NOT SET'} - saved to MongoDB`);
    }

    return settlement!;
  }

  /**
   * Convierte cálculo a campos del schema
   */
  private calculationToSchema(
    calc: SettlementCalculationResponseDto,
    sessionAddress: string,
  ): Partial<Settlement> {
    return {
      sessionAddress,
      offerId: calc.offerId,
      fspUserId: new Types.ObjectId(calc.fspUserId) as any,
      fspAddress: calc.fspAddress,
      hourSlot: calc.hourSlot,
      bidType: calc.bidType,
      deliveryDate: calc.deliveryDate,
      committedQuantity: calc.committedQuantity,
      deliveredQuantity: calc.deliveredQuantity,
      deviationPercentage: calc.deviationPercentage,
      deviationType: calc.deviationType,
      collateralAmount: calc.collateralAmount,
      collateralForfeited: calc.collateralForfeited,
      collateralReturned: calc.collateralReturned,
      penaltyAmount: calc.penaltyAmount,
      payment: calc.payment,
      platformFee: calc.platformFee,
      price: calc.price,
      meterReadingsHash: calc.meterReadingsHash,
    };
  }

  /**
   * Submits aggregated measurement data to blockchain to advance the session to SETTLEMENT_PENDING.
   * Must be called before individual `submitSettlement` calls.
   *
   * @param sessionAddress Address of the MarketSession contract
   * @param userId Keycloak ID of the signing user
   * @param pin 6-digit PIN to unlock the user's wallet
   * @param marketId MongoDB ObjectId of the market
   * @returns Transaction hash and the combined measurement hash
   */
  async submitMeasurementData(
    sessionAddress: string,
    userId: string,
    pin: string,
    marketId: string,
  ): Promise<{ transactionHash: string; measurementHash: string }> {
    this.logger.log(`Submitting measurement data for session ${sessionAddress}`);

    // 1. Obtener la sesión
    const session = await this.sessionModel.findOne({ contractAddress: sessionAddress }).exec();
    if (!session) {
      throw new NotFoundException(`Session with address ${sessionAddress} not found`);
    }

    // 2. Obtener todas las ofertas de la sesión
    const offers = await this.hourlyOfferModel.find({
      session: session._id,
      status: OfferStatus.ACCEPTED,
    }).populate('fsp').exec();

    if (offers.length === 0) {
      throw new BadRequestException('No accepted offers found for this session');
    }

    // 3. Generar hash combinado de todos los measurements
    const encoder = new ethers.AbiCoder();
    const measurementHashes: string[] = [];

    for (const offer of offers) {
      const fspUser = offer.fsp as any;
      const fspUserId = fspUser._id.toString();

      // Obtener datos de consumo
      const deliveryDateNormalized = new Date(session.sessionDate);
      deliveryDateNormalized.setUTCHours(0, 0, 0, 0);

      const baseline = await this.consumptionDataService.getReferenceProfileByMarket(
        fspUserId,
        ProfileType.REFERENCE_STANDARD,
        session.market?.toString() || '',
      );

      const actual = await this.consumptionDataService.getActualConsumptionByMarket(
        fspUserId,
        deliveryDateNormalized,
        session.market?.toString() || '',
      );

      if (baseline && actual) {
        const baselineValue =
          (baseline.getMeasurementAt(MeasurementType.NET_LOAD_WITHOUT_FLEX, 60, offer.hour) ??
           baseline.getMeasurementAt(MeasurementType.CONSUMPTION, 60, offer.hour)) || 0;
        const actualValue =
          (actual.getMeasurementAt(MeasurementType.NET_LOAD_WITHOUT_FLEX, 60, offer.hour) ??
           actual.getMeasurementAt(MeasurementType.CONSUMPTION, 60, offer.hour)) || 0;

        // Generar hash individual para esta offer
        const offerHash = this.generateMeterReadingsHash(
          fspUser.publicAddress || fspUser.walletAddress || '0x0000000000000000000000000000000000000000',
          baselineValue,
          actualValue,
          offer.hour,
          session.sessionDate,
        );
        measurementHashes.push(offerHash);
      }
    }

    // 4. Combinar todos los hashes en uno solo
    const combinedHash = ethers.keccak256(
      encoder.encode(['bytes32[]'], [measurementHashes])
    );

    this.logger.log(`Generated measurement hash: ${combinedHash} from ${measurementHashes.length} offers`);

    // 5. Obtener wallet del usuario
    const userWallet = await this.walletService.getConnectedWallet(userId, pin, marketId);

    // 6. Crear contrato y enviar transacción
    const contract = new ethers.Contract(
      sessionAddress,
      ['function submitMeasurementData(bytes32 _measurementHash) external'],
      userWallet,
    );

    try {
      const tx = await contract.submitMeasurementData(combinedHash);
      this.logger.log(`Submit measurement data transaction sent: ${tx.hash}`);

      const receipt = await tx.wait();
      this.logger.log(`Submit measurement data confirmed. Block: ${receipt.blockNumber}`);

      return {
        transactionHash: tx.hash,
        measurementHash: combinedHash,
      };
    } catch (error) {
      this.logger.error(`Failed to submit measurement data: ${error.message}`);
      throw new BadRequestException(`Failed to submit measurement data: ${error.message}`);
    }
  }

  /**
   * Convierte documento a DTO de respuesta
   */
  private toResponseDto(doc: SettlementDocument): SettlementResponseDto {
    return {
      id: doc._id ? doc._id.toString() : '',
      sessionId: doc.sessionId?.toString() || '',
      sessionAddress: doc.sessionAddress,
      offerId: doc.offerId,
      hourlyOfferId: doc.hourlyOfferId?.toString(),
      bidType: doc.bidType,
      fspUserId: doc.fspUserId?.toString() || '',
      fspAddress: doc.fspAddress,
      hourSlot: doc.hourSlot,
      deliveryDate: doc.deliveryDate,
      committedQuantity: doc.committedQuantity,
      deliveredQuantity: doc.deliveredQuantity,
      deviationPercentage: doc.deviationPercentage,
      deviationType: doc.deviationType,
      collateralAmount: doc.collateralAmount,
      collateralForfeited: doc.collateralForfeited || '0',
      collateralReturned: doc.collateralReturned || '0',
      penaltyAmount: doc.penaltyAmount,
      payment: doc.payment,
      platformFee: doc.platformFee,
      price: doc.price,
      meterReadingsHash: doc.meterReadingsHash,
      status: doc.status,
      flexibilityNftId: doc.flexibilityNftId,
      nftMetadata: doc.nftMetadata,
      submitTxHash: doc.submitTxHash,
      executeTxHash: doc.executeTxHash,
      errorMessage: doc.errorMessage,
      createdAt: doc.createdAt!,
      updatedAt: doc.updatedAt!,
    };
  }

  // ============================================================================
  // FRP Payment Request Methods
  // ============================================================================

  /**
   * Requests FRP to deposit funds for session settlements.
   * Creates a payment request record and sends email notification to FRP.
   *
   * @param sessionAddress Address of the MarketSession contract
   * @param requestedByUserId MongoDB ObjectId of the user (FMO/LMO) making the request
   * @param marketId MongoDB ObjectId of the market
   * @returns The created FRP payment request
   */
  async requestFrpPayment(
    sessionAddress: string,
    requestedByUserId: string,
    marketId: string,
  ): Promise<FrpPaymentRequestDocument> {
    this.logger.log(`Requesting FRP payment for session ${sessionAddress}`);

    // 1. Get session from MongoDB
    const session = await this.sessionModel.findOne({
      contractAddress: sessionAddress,
    }).exec();

    if (!session) {
      throw new NotFoundException(`Session with address ${sessionAddress} not found`);
    }

    // 2. Get market and FRP user
    const market = await this.marketModel.findById(marketId).exec();
    if (!market) {
      throw new NotFoundException(`Market ${marketId} not found`);
    }

    if (!market.frp) {
      throw new BadRequestException('Market does not have an FRP assigned');
    }

    const frpUser = await this.userModel.findById(market.frp).exec();
    if (!frpUser) {
      throw new NotFoundException('FRP user not found');
    }

    // 3. Check if a payment request already exists for this session
    const existingRequest = await this.frpPaymentRequestModel.findOne({
      sessionAddress,
    }).exec();

    if (existingRequest) {
      if (existingRequest.status === FrpPaymentRequestStatus.PENDING) {
        throw new BadRequestException(
          `A pending payment request already exists for this session. Created at ${existingRequest.createdAt?.toISOString()}`
        );
      }
      // If completed/cancelled/expired, we allow creating a new one
    }

    // 4. Get settlement summary to calculate total amount needed
    const summary = await this.getSessionSettlementsSummary(sessionAddress);

    if (summary.totalOffers === 0) {
      throw new BadRequestException('No settlements found for this session. Please calculate settlements first.');
    }

    // 5. Get FRP blockchain address
    const frpAddress = frpUser.publicAddress || '';
    if (!frpAddress) {
      throw new BadRequestException('FRP user does not have a blockchain wallet address configured');
    }

    // 6. Create payment request
    const paymentRequest = await this.frpPaymentRequestModel.create({
      sessionAddress,
      session: session._id,
      market: new Types.ObjectId(marketId),
      frpUser: frpUser._id,
      frpAddress,
      requestedBy: new Types.ObjectId(requestedByUserId),
      totalPayment: summary.totalPayment,
      totalPlatformFees: summary.totalPlatformFees,
      totalSettlements: summary.totalOffers,
      status: FrpPaymentRequestStatus.PENDING,
      emailSentTo: frpUser.email,
    });

    // 7. Format amount for email (convert wei to FLEX tokens)
    const totalPaymentFlex = Number(ethers.formatUnits(BigInt(summary.totalPayment), 18));
    const formattedAmount = `${totalPaymentFlex.toFixed(4)} FLEX`;

    // 8. Generate deposit link
    const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:4200';
    const depositLink = `${frontendUrl}/settlements/deposit?session=${sessionAddress}&market=${marketId}`;

    // 9. Send email notification to FRP
    try {
      const emailSent = await this.emailService.sendFrpPaymentRequestEmail({
        email: frpUser.email,
        username: frpUser.username || frpUser.email,
        sessionName: session.name || `Session ${sessionAddress.slice(0, 10)}...`,
        sessionAddress,
        marketName: market.name,
        deliveryDate: session.sessionDate,
        totalSettlements: summary.totalOffers,
        amountRequired: formattedAmount,
        depositLink,
        language: 'en',
      });

      if (emailSent) {
        await this.frpPaymentRequestModel.findByIdAndUpdate(paymentRequest._id, {
          emailSentAt: new Date(),
        }).exec();
        this.logger.log(`Email notification sent to FRP: ${frpUser.email}`);
      } else {
        this.logger.warn(`Failed to send email notification to FRP: ${frpUser.email}`);
      }
    } catch (error) {
      this.logger.error(`Error sending email to FRP: ${error.message}`);
      // Don't throw - payment request is still created
    }

    this.logger.log(`FRP payment request created: ${paymentRequest._id}`);
    return paymentRequest;
  }

  /**
   * Gets pending payment requests for the current FRP user
   *
   * @param frpUserId MongoDB ObjectId of the FRP user
   * @returns Array of pending payment requests
   */
  async getPendingPaymentRequestsForFrp(frpUserId: string): Promise<FrpPaymentRequestDocument[]> {
    return this.frpPaymentRequestModel.find({
      frpUser: new Types.ObjectId(frpUserId),
      status: FrpPaymentRequestStatus.PENDING,
    })
      .populate('session')
      .populate('market')
      .sort({ createdAt: -1 })
      .exec();
  }

  /**
   * Gets a payment request by session address
   *
   * @param sessionAddress Address of the MarketSession contract
   * @returns The payment request or null
   */
  async getPaymentRequestBySession(sessionAddress: string): Promise<FrpPaymentRequestDocument | null> {
    return this.frpPaymentRequestModel.findOne({ sessionAddress })
      .populate('session')
      .populate('market')
      .populate('frpUser')
      .populate('requestedBy')
      .exec();
  }

  /**
   * FRP deposits funds for session settlements using Treasury contract
   *
   * @param sessionAddress Address of the MarketSession contract
   * @param frpUserId MongoDB ObjectId of the FRP user
   * @param pin PIN to unlock FRP's wallet
   * @param marketId MongoDB ObjectId of the market
   * @returns Transaction hash and deposit details
   */
  async depositFrpPayment(
    sessionAddress: string,
    frpUserId: string,
    pin: string,
    marketId: string,
  ): Promise<{ transactionHash: string; amount: string; paymentRequestId: string }> {
    this.logger.log(`FRP depositing payment for session ${sessionAddress}`);

    // 1. Get payment request
    const paymentRequest = await this.frpPaymentRequestModel.findOne({
      sessionAddress,
      status: FrpPaymentRequestStatus.PENDING,
    }).exec();

    if (!paymentRequest) {
      throw new NotFoundException('No pending payment request found for this session');
    }

    // 2. Verify the user is the FRP
    if (paymentRequest.frpUser.toString() !== frpUserId) {
      throw new BadRequestException('Only the FRP can deposit funds for this session');
    }

    // 3. Get the session to retrieve blockchainSessionId
    const session = await this.sessionModel.findOne({ contractAddress: sessionAddress }).exec();
    if (!session) {
      throw new NotFoundException(`Session with address ${sessionAddress} not found`);
    }

    if (session.blockchainSessionId === undefined || session.blockchainSessionId === null) {
      throw new BadRequestException('Session does not have a blockchain session ID');
    }

    // 4. Get FRP wallet
    const frpWallet = await this.walletService.getConnectedWallet(frpUserId, pin, marketId);

    // 5. Get Treasury contract address
    const treasuryAddress = this.treasuryService.getContractAddress();
    const flexTokenAddress = this.flexibilityTokenService.getContractAddress();

    // 6. Check FRP's FLEX token balance
    const flexContract = new ethers.Contract(
      flexTokenAddress,
      ['function balanceOf(address) view returns (uint256)'],
      frpWallet,
    );

    const balance = await flexContract.balanceOf(frpWallet.address);
    const requiredAmount = BigInt(paymentRequest.totalPayment);

    if (balance < requiredAmount) {
      const balanceFlex = Number(ethers.formatUnits(balance, 18));
      const requiredFlex = Number(ethers.formatUnits(requiredAmount, 18));
      throw new BadRequestException(
        `Insufficient FLEX balance. Required: ${requiredFlex.toFixed(4)} FLEX, Available: ${balanceFlex.toFixed(4)} FLEX`
      );
    }

    // 7. Approve Treasury to spend FLEX tokens
    const approveContract = new ethers.Contract(
      flexTokenAddress,
      ['function approve(address spender, uint256 amount) returns (bool)'],
      frpWallet,
    );

    const approveTx = await approveContract.approve(treasuryAddress, requiredAmount);
    await approveTx.wait();
    this.logger.log(`FLEX approval transaction confirmed: ${approveTx.hash}`);

    // 8. Deposit to Treasury using depositPaymentForSession with blockchainSessionId
    const treasuryContract = new ethers.Contract(
      treasuryAddress,
      ['function depositPaymentForSession(uint256 sessionId, uint256 amount) external'],
      frpWallet,
    );

    try {
      const depositTx = await treasuryContract.depositPaymentForSession(
        session.blockchainSessionId,
        requiredAmount,
      );
      const receipt = await depositTx.wait();

      // 9. Update payment request status
      await this.frpPaymentRequestModel.findByIdAndUpdate(paymentRequest._id, {
        status: FrpPaymentRequestStatus.DEPOSITED,
        depositTxHash: depositTx.hash,
        depositedAt: new Date(),
        depositedAmount: requiredAmount.toString(),
      }).exec();

      this.logger.log(`FRP deposit successful. TX: ${depositTx.hash}`);

      return {
        transactionHash: depositTx.hash,
        amount: requiredAmount.toString(),
        paymentRequestId: (paymentRequest._id as any).toString(),
      };
    } catch (error) {
      this.logger.error(`Failed to deposit payment: ${error.message}`);
      throw new BadRequestException(`Failed to deposit payment: ${error.message}`);
    }
  }

  /**
   * Marks a payment request as completed after all settlements are executed
   *
   * @param sessionAddress Address of the MarketSession contract
   */
  async completePaymentRequest(sessionAddress: string): Promise<void> {
    await this.frpPaymentRequestModel.findOneAndUpdate(
      { sessionAddress, status: FrpPaymentRequestStatus.DEPOSITED },
      {
        status: FrpPaymentRequestStatus.COMPLETED,
        completedAt: new Date(),
      },
    ).exec();
  }

  /**
   * Cancels a pending payment request
   *
   * @param sessionAddress Address of the MarketSession contract
   * @param reason Reason for cancellation
   */
  async cancelPaymentRequest(sessionAddress: string, reason: string): Promise<void> {
    await this.frpPaymentRequestModel.findOneAndUpdate(
      { sessionAddress, status: FrpPaymentRequestStatus.PENDING },
      {
        status: FrpPaymentRequestStatus.CANCELLED,
        cancelledAt: new Date(),
        cancelReason: reason,
      },
    ).exec();
  }

  /**
 * Finalizes a session by setting its status to SETTLED.
 * Can only be called when all settlements are EXECUTED or FAILED.
 *
 * @param sessionAddress Address of the MarketSession contract
 * @param userId ID of the user (FMO/LMO) finalizing the session
 * @param pin PIN to unlock the user's wallet
 * @param marketId ID of the market
 * @returns Transaction hash and finalization details
 */
async finalizeSession(
  sessionAddress: string,
  userId: string,
  pin: string,
  marketId: string,
): Promise<{ txHash: string; sessionAddress: string }> {
  this.logger.log(`Finalizing session ${sessionAddress}`);

  // 1. Get session from MongoDB
  const session = await this.sessionModel.findOne({ contractAddress: sessionAddress }).exec();
  if (!session) {
    throw new NotFoundException(`Session with address ${sessionAddress} not found`);
  }

  // 2. Get all settlements for this session
  const settlements = await this.settlementModel.find({ sessionAddress }).exec();

  if (settlements.length === 0) {
    throw new BadRequestException('No settlements found for this session. Cannot finalize.');
  }

  // 3. Validate ALL settlements are EXECUTED or FAILED
  const invalidSettlements = settlements.filter(
    (s) => s.status !== SettlementStatus.EXECUTED && s.status !== SettlementStatus.FAILED,
  );

  if (invalidSettlements.length > 0) {
    const details = invalidSettlements
      .map((s) => `Offer ${s.offerId} (${s.status})`)
      .join(', ');
    throw new BadRequestException(
      `Cannot finalize session. The following settlements are not yet completed: ${details}`,
    );
  }

  // 4. Get user wallet
  const userWallet = await this.walletService.getConnectedWallet(userId, pin, marketId);

  // 5. Call finalizeSession on the smart contract
  try {
    const contract = new ethers.Contract(
      sessionAddress,
      ['function finalizeSession() external'],
      userWallet,
    );

    const tx = await contract.finalizeSession();
    this.logger.log(`Finalize session tx sent: ${tx.hash}`);

    const receipt = await tx.wait();
    this.logger.log(`Session finalized. Block: ${receipt.blockNumber}`);

    // 6. Update session status in MongoDB
    await this.sessionModel.findByIdAndUpdate(session._id, {
      status: 'SETTLED',
      settledAt: new Date(),
    }).exec();

    // 7. Mark payment request as completed (if any)
    await this.completePaymentRequest(sessionAddress);

    this.logger.log(`✅ Session ${sessionAddress} finalized and set to SETTLED`);

    return {
      txHash: tx.hash,
      sessionAddress,
    };
  } catch (error) {
    this.logger.error(`Failed to finalize session: ${error.message}`, error.stack);
    throw new BadRequestException(`Failed to finalize session: ${error.message}`);
  }
}
}
