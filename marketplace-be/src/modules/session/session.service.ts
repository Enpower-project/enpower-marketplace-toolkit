import { Injectable, Logger, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Session, SessionDocument, SessionStatus, HourlyBid } from '../../schemas/Session.schema';
import { Market, MarketDocument } from '../../schemas/Market.schema';
import { User, UserDocument, UserRole } from '../../schemas/User.schema';
import { CreateSessionDto, UpdateSessionDto, CreateHourlyBidDto, SessionResponseDto } from '../../dtos/create-session.dto';
import { TenantContextService } from '../tenant/services/tenant-context.service';
import { NotFoundException, ConflictException } from '../../exceptions/http-exception';
import { BlockchainService } from '../blockchain/blockchain.service';
import { MarketSessionContractService } from '../blockchain/contracts/market-session/market-session.contract.service';
import { TreasuryContractService } from '../blockchain/contracts/treasury/treasury.contract.service';
import { FlexibilityNFTContractService } from '../blockchain/contracts/flexibility-nft/flexibility-nft.contract.service';
import { ParticipantRegistryContractService } from '../blockchain/contracts/participant-registry/participant-registry.contract.service';
import { WalletService } from '../wallet/wallet.service';
import { ethers } from 'ethers';
import { ConfigService } from '@nestjs/config';
import { HourlyOffer, HourlyOfferDocument, OfferStatus } from 'src/schemas/HourlyOffer.schema';
import { BlockchainProviderService } from '../blockchain/core/blockchain-provider.service';

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);

  constructor(
    private config: ConfigService,
    @InjectModel(Session.name) private sessionModel: Model<SessionDocument>,
    @InjectModel(Market.name) private marketModel: Model<MarketDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(HourlyOffer.name) private hourlyOfferModel: Model<HourlyOfferDocument>,
    private readonly tenantContext: TenantContextService,
    private readonly blockchainService: BlockchainService,
    private readonly marketSessionContract: MarketSessionContractService,
    private readonly treasuryContract: TreasuryContractService,
    private readonly flexibilityNFTContract: FlexibilityNFTContractService,
    private readonly participantRegistryContract: ParticipantRegistryContractService,
    private readonly providerService: BlockchainProviderService,
    @Inject(forwardRef(() => WalletService))
    private readonly walletService: WalletService,
  ) { }

  // Helper method to get user ObjectId from keycloak ID
  private async getUserByKeycloakId(keycloakId: string) {
    this.logger.debug(`Looking for user with keycloakId: ${keycloakId}`);
    const user = await this.userModel.findOne({ keycloakId });
    if (!user) {
      this.logger.warn(`User with keycloakId ${keycloakId} not found`);
      throw new BadRequestException(`User with keycloak ID ${keycloakId} not found`);
    }
    this.logger.debug(`Found user: ${user._id} for keycloakId: ${keycloakId}`);
    return user;
  }

  /** Creates a new DRAFT session for the current market and user. */
  async createSession(createSessionDto: CreateSessionDto): Promise<SessionResponseDto> {
    this.logger.debug('createSession called');
    const currentMarketId = await this.tenantContext.getCurrentMarket();
    const currentUserId = this.tenantContext.getCurrentUserId();
    this.logger.debug(`createSession - marketId: ${currentMarketId}, userId: ${currentUserId}`);

    if (!currentMarketId) {
      throw new BadRequestException('Market context is required');
    }

    if (!currentUserId) {
      throw new BadRequestException('User context is required');
    }

    // Verificar que el market existe
    const market = await this.marketModel.findById(currentMarketId);
    if (!market) {
      throw new NotFoundException('market', currentMarketId);
    }

    // Verificar que el usuario existe
    const user = await this.getUserByKeycloakId(currentUserId);

    // Verificar que no existe ya una sesión para esa fecha en ese market
    // Parse YYYY-MM-DD using UTC to avoid server timezone shifting the date
    const [syear, smonth, sday] = createSessionDto.sessionDate.split('-').map(Number);
    const sessionDate = new Date(Date.UTC(syear, smonth - 1, sday));

    const existingSession = await this.sessionModel.findOne({
      market: new Types.ObjectId(currentMarketId),
      sessionDate: sessionDate,
    });

    if (existingSession) {
      throw new ConflictException('session', 'sessionDate', `Session already exists for date ${createSessionDto.sessionDate} in this market`);
    }

    // Validar bids si se proporcionan
    if (createSessionDto.bids && createSessionDto.bids.length > 0) {
      this.validateBids(createSessionDto.bids);
    }

    // Log flexibility requests if provided
    if (createSessionDto.flexibilityRequests && createSessionDto.flexibilityRequests.length > 0) {
      this.logger.log(`Session includes ${createSessionDto.flexibilityRequests.length} flexibility requests`);
    }

    // Crear la sesión (usar el _id del usuario encontrado, no el keycloakId)
    const session = new this.sessionModel({
      name: createSessionDto.name,
      description: createSessionDto.description,
      sessionDate: sessionDate,
      market: new Types.ObjectId(currentMarketId),
      createdBy: user._id, // Usar el ObjectId del usuario, no el keycloakId
      status: SessionStatus.DRAFT,
      bids: createSessionDto.bids || [],
      flexibilityRequests: createSessionDto.flexibilityRequests || [],
    });

    await session.save();

    this.logger.log(`Session created: ${session._id} for market: ${currentMarketId}`);

    return this.mapToResponseDto(session, market, user);
  }

  /**
 * Get sessions where the current FSP user has created offers
 * Returns sessions that:
 * 1. Are in the FSP's accessible markets
 * 2. Have offers created by the FSP
 */
  async getSessionsWithFSPOffers(): Promise<SessionResponseDto[]> {
    const currentMarketId = await this.tenantContext.getCurrentMarket();
    const currentUserId = this.tenantContext.getCurrentUserId();

    if (!currentMarketId || !currentUserId) {
      throw new BadRequestException('Market and user context required');
    }

    const currentUser = await this.getUserByKeycloakId(currentUserId);

    if (currentUser.role !== UserRole.FSP) {
      throw new BadRequestException('Only FSP users can access this endpoint');
    }

    // Find all unique sessions where this FSP has offers
    const offersWithSessions = await this.hourlyOfferModel
      .find({
        fsp: currentUser._id,
        status: { $ne: OfferStatus.CANCELLED } // Exclude cancelled offers
      })
      .populate({
        path: 'session',
        match: { market: new Types.ObjectId(currentMarketId) }, // Filter by market
        populate: [
          { path: 'market', select: 'name' },
          { path: 'createdBy', select: 'username email' }
        ]
      })
      .lean();

    // Filter out offers where session didn't match the market (populate returns null)
    const validOffers = offersWithSessions.filter(offer => offer.session != null);

    // Get unique sessions
    const uniqueSessionIds = [...new Set(validOffers.map(offer =>
      (offer.session as any)._id.toString()
    ))];

    // Fetch full session documents
    const sessions = await this.sessionModel
      .find({ _id: { $in: uniqueSessionIds } })
      .populate('market', 'name')
      .populate('createdBy', 'username email')
      .sort({ sessionDate: -1 });

    this.logger.log(
      `Found ${sessions.length} sessions with offers from FSP ${currentUser.email}`
    );

    return sessions.map(session =>
      this.mapToResponseDto(session, session.market as any, session.createdBy as any)
    );
  }

  /** Returns all sessions for the current market, applying FSP-visibility filters when applicable. */
  async getSessionsByMarket(): Promise<SessionResponseDto[]> {
    const currentMarketId = await this.tenantContext.getCurrentMarket();
    const currentUserId = this.tenantContext.getCurrentUserId();

    if (!currentMarketId) {
      throw new BadRequestException('Market context is required');
    }

    // Construir el query base
    const query: any = {
      market: new Types.ObjectId(currentMarketId)
    };

    // Filtro adicional solo para FSP: solo mostrar sesiones PUBLICADAS después de su registro
    try {
      if (currentUserId) {
        const currentUser = await this.getUserByKeycloakId(currentUserId);

        this.logger.log(`📋 FSP User: ${currentUser.username} (${currentUser.email}), Role: ${currentUser.role}`);
        const userCreatedAt = (currentUser as any).createdAt;
        this.logger.log(`📅 FSP Created At: ${userCreatedAt?.toISOString()}`);

        // Solo aplicar filtro si es FSP
        if (currentUser.role === UserRole.FSP && userCreatedAt) {
          // Mostrar SOLO sesiones que:
          // 1. Están publicadas (publishedAt exists)
          // 2. Fueron publicadas DESPUÉS de que el FSP se creó
          query.publishedAt = { $exists: true, $gte: userCreatedAt };
          this.logger.log(`🔍 FSP Filter Applied: Only PUBLISHED sessions after ${userCreatedAt.toISOString()}`);
        }
      }
    } catch (error) {
      // Si algo falla, ignorar el filtro de FSP y mostrar todas las sesiones
      this.logger.debug(`Could not apply FSP-specific filtering: ${error.message}`);
    }

    const sessions = await this.sessionModel
      .find(query)
      .populate('market', 'name')
      .populate('createdBy', 'username email')
      .sort({ sessionDate: -1 });

    this.logger.log(`📊 Total Sessions Found: ${sessions.length}`);
    sessions.forEach((session, index) => {
      this.logger.log(
        `  [${index + 1}] "${session.name}" - PublishedAt: ${session.publishedAt?.toISOString() || 'NOT SET'}, Status: ${session.status}`
      );
    });

    return sessions.map((session) => this.mapToResponseDto(session, session.market as any, session.createdBy as any));
  }

  /** Returns sessions with PUBLISHED status for the current market. */
  async getPublishedSessionsByMarket(): Promise<SessionResponseDto[]> {
    const currentMarketId = await this.tenantContext.getCurrentMarket();

    if (!currentMarketId) {
      throw new BadRequestException('Market context is required');
    }

    const sessions = await this.sessionModel
      .find({
        market: new Types.ObjectId(currentMarketId),
        status: SessionStatus.PUBLISHED
      })
      .populate('market', 'name')
      .populate('createdBy', 'username email')
      .sort({ sessionDate: -1 });

    return sessions.map((session) => this.mapToResponseDto(session, session.market as any, session.createdBy as any));
  }

  /** Returns ACTIVE sessions for the current market, applying FSP-visibility filters when applicable. */
  async getActiveSessionsByMarket(): Promise<SessionResponseDto[]> {
    const currentMarketId = await this.tenantContext.getCurrentMarket();
    const currentUserId = this.tenantContext.getCurrentUserId();

    if (!currentMarketId) {
      throw new BadRequestException('Market context is required');
    }

    // Construir el query base - por defecto mostrar sesiones ACTIVE
    const query: any = {
      market: new Types.ObjectId(currentMarketId),
      status: { $in: [SessionStatus.ACTIVE] }
    };

    // Filtro adicional solo para FSP: solo mostrar sesiones PUBLICADAS después de su registro
    try {
      if (currentUserId) {
        const currentUser = await this.getUserByKeycloakId(currentUserId);

        this.logger.log(`📋 FSP User: ${currentUser.username} (${currentUser.email}), Role: ${currentUser.role}`);
        const userCreatedAt = (currentUser as any).createdAt;
        this.logger.log(`📅 FSP Created At: ${userCreatedAt?.toISOString()}`);

        // Solo aplicar filtro si es FSP
        if (currentUser.role === UserRole.FSP && userCreatedAt) {
          // Mostrar SOLO sesiones que:
          // 1. Están publicadas (publishedAt exists)
          // 2. Fueron publicadas DESPUÉS de que el FSP se creó
          query.publishedAt = { $exists: true, $gte: userCreatedAt };
          this.logger.log(`🔍 FSP Filter Applied: Only PUBLISHED sessions after ${userCreatedAt.toISOString()}`);
        }
      }
    } catch (error) {
      // Si algo falla, ignorar el filtro de FSP y mostrar todas las sesiones PUBLISHED/ACTIVE
      this.logger.debug(`Could not apply FSP-specific filtering: ${error.message}`);
    }

    const sessions = await this.sessionModel
      .find(query)
      .populate('market', 'name')
      .populate('createdBy', 'username email')
      .sort({ sessionDate: -1 });

    this.logger.log(`📊 Total Sessions Found: ${sessions.length}`);
    sessions.forEach((session, index) => {
      this.logger.log(
        `  [${index + 1}] "${session.name}" - PublishedAt: ${session.publishedAt?.toISOString() || 'NOT SET'}, Status: ${session.status}`
      );
    });

    return sessions.map((session) => this.mapToResponseDto(session, session.market as any, session.createdBy as any));
  }

  /** Returns a session by its MongoDB ObjectId, scoped to the current market. */
  async getSessionById(sessionId: string): Promise<SessionResponseDto> {
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
      .populate('market', 'name')
      .populate('createdBy', 'username email');

    if (!session) {
      throw new NotFoundException('session', sessionId);
    }

    return this.mapToResponseDto(session, session.market as any, session.createdBy as any);
  }

  /** Returns a session by its blockchain contract address, scoped to the current market. */
  async getSessionByAddress(contractAddress: string): Promise<SessionResponseDto> {
    const currentMarketId = await this.tenantContext.getCurrentMarket();

    this.logger.log(`getSessionByAddress: address=${contractAddress}, marketId=${currentMarketId}`);

    if (!currentMarketId) {
      throw new BadRequestException('Market context is required');
    }

    const session = await this.sessionModel
      .findOne({
        contractAddress: contractAddress,
        market: new Types.ObjectId(currentMarketId),
      })
      .populate('market', 'name')
      .populate('createdBy', 'username email');

    this.logger.log(`getSessionByAddress: found=${!!session}`);

    if (!session) {
      throw new NotFoundException('session', contractAddress);
    }

    return this.mapToResponseDto(session, session.market as any, session.createdBy as any);
  }


  /** Updates a DRAFT session's fields. Only the session creator may update it. */
  async updateSession(sessionId: string, updateSessionDto: UpdateSessionDto): Promise<SessionResponseDto> {
    const currentMarketId = await this.tenantContext.getCurrentMarket();
    const currentUserId = this.tenantContext.getCurrentUserId();

    if (!currentMarketId) {
      throw new BadRequestException('Market context is required');
    }

    if (!currentUserId) {
      throw new BadRequestException('User context is required');
    }

    if (!Types.ObjectId.isValid(sessionId)) {
      throw new NotFoundException('session', sessionId);
    }

    // Obtener usuario actual
    const user = await this.getUserByKeycloakId(currentUserId);

    const session = await this.sessionModel.findOne({
      _id: new Types.ObjectId(sessionId),
      market: new Types.ObjectId(currentMarketId),
    });

    if (!session) {
      throw new NotFoundException('session', sessionId);
    }

    // Solo el creador puede modificar la sesión (o admin) - comparar ObjectIds
    if (session.createdBy.toString() !== (user._id as any).toString()) {
      throw new BadRequestException('Only the session creator can modify this session');
    }

    // No permitir modificaciones si la sesión ya está publicada
    if (session.status !== SessionStatus.DRAFT) {
      throw new BadRequestException('Cannot modify session that is not in DRAFT status');
    }

    // Validar bids si se proporcionan
    if (updateSessionDto.bids && updateSessionDto.bids.length > 0) {
      const validBids = updateSessionDto.bids.filter(bid =>
        bid.hour !== undefined && bid.powerMw !== undefined && bid.pricePerMwh !== undefined && bid.bidType !== undefined
      ) as CreateHourlyBidDto[];
      this.validateBids(validBids);
    }

    // Actualizar campos de la sesión
    if (updateSessionDto.name !== undefined) session.name = updateSessionDto.name;
    if (updateSessionDto.description !== undefined) session.description = updateSessionDto.description;
    if (updateSessionDto.sessionDate) {
      const sessionDate = new Date(updateSessionDto.sessionDate);
      sessionDate.setHours(0, 0, 0, 0);
      session.sessionDate = sessionDate;
    }
    if (updateSessionDto.bids !== undefined) session.bids = updateSessionDto.bids as any;

    // Guardar usando .save() para que se ejecuten los middleware
    await session.save();

    // Recargar con populate
    const updatedSession = await this.sessionModel
      .findById(sessionId)
      .populate('market', 'name')
      .populate('createdBy', 'username email');

    if (!updatedSession) {
      throw new NotFoundException('session', sessionId);
    }

    this.logger.log(`Session updated: ${sessionId}`);

    return this.mapToResponseDto(updatedSession, updatedSession.market as any, updatedSession.createdBy as any);
  }

  /** Adds a new bid or updates an existing bid for the specified hour in a DRAFT session. */
  async addBidToSession(sessionId: string, bidDto: CreateHourlyBidDto): Promise<SessionResponseDto> {
    const currentMarketId = await this.tenantContext.getCurrentMarket();
    const currentUserId = this.tenantContext.getCurrentUserId();

    if (!currentMarketId) {
      throw new BadRequestException('Market context is required');
    }

    if (!currentUserId) {
      throw new BadRequestException('User context is required');
    }

    if (!Types.ObjectId.isValid(sessionId)) {
      throw new NotFoundException('session', sessionId);
    }

    // Get user by Keycloak ID
    const user = await this.getUserByKeycloakId(currentUserId);

    const session = await this.sessionModel.findOne({
      _id: new Types.ObjectId(sessionId),
      market: new Types.ObjectId(currentMarketId),
    });

    if (!session) {
      throw new NotFoundException('session', sessionId);
    }

    // Solo el creador puede modificar la sesión (comparing MongoDB ObjectIds)
    if (session.createdBy.toString() !== (user._id as any).toString()) {
      throw new BadRequestException('Only the session creator can modify this session');
    }

    // No permitir modificaciones si la sesión ya está publicada
    if (session.status !== SessionStatus.DRAFT) {
      throw new BadRequestException('Cannot modify session that is not in DRAFT status');
    }

    // Verificar que no existe ya una bid para esa hora
    const existingBidIndex = session.bids.findIndex(bid => bid.hour === bidDto.hour);

    if (existingBidIndex >= 0) {
      // Actualizar bid existente
      session.bids[existingBidIndex] = {
        ...bidDto,
        createdAt: session.bids[existingBidIndex].createdAt,
        updatedAt: new Date(),
      } as HourlyBid;
    } else {
      // Agregar nueva bid
      session.bids.push({
        ...bidDto,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as HourlyBid);
    }

    await session.save();

    const populatedSession = await this.sessionModel
      .findById(sessionId)
      .populate('market', 'name')
      .populate('createdBy', 'username email');

    if (!populatedSession) {
      throw new NotFoundException('session', sessionId);
    }

    this.logger.log(`Bid ${existingBidIndex >= 0 ? 'updated' : 'added'} to session: ${sessionId} for hour: ${bidDto.hour}`);

    return this.mapToResponseDto(populatedSession, populatedSession.market as any, populatedSession.createdBy as any);
  }

  /** Removes the bid for the given hour from a DRAFT session. */
  async removeBidFromSession(sessionId: string, hour: number): Promise<SessionResponseDto> {
    const currentMarketId = await this.tenantContext.getCurrentMarket();
    const currentUserId = this.tenantContext.getCurrentUserId();

    if (!currentMarketId) {
      throw new BadRequestException('Market context is required');
    }

    if (!currentUserId) {
      throw new BadRequestException('User context is required');
    }

    if (!Types.ObjectId.isValid(sessionId)) {
      throw new NotFoundException('session', sessionId);
    }

    // Get user by Keycloak ID
    const user = await this.getUserByKeycloakId(currentUserId);

    const session = await this.sessionModel.findOne({
      _id: new Types.ObjectId(sessionId),
      market: new Types.ObjectId(currentMarketId),
    });

    if (!session) {
      throw new NotFoundException('session', sessionId);
    }

    // Solo el creador puede modificar la sesión (comparing MongoDB ObjectIds)
    if (session.createdBy.toString() !== (user._id as any).toString()) {
      throw new BadRequestException('Only the session creator can modify this session');
    }

    // No permitir modificaciones si la sesión ya está publicada
    if (session.status !== SessionStatus.DRAFT) {
      throw new BadRequestException('Cannot modify session that is not in DRAFT status');
    }

    // Remover la bid
    session.bids = session.bids.filter(bid => bid.hour !== hour);
    await session.save();

    const populatedSession = await this.sessionModel
      .findById(sessionId)
      .populate('market', 'name')
      .populate('createdBy', 'username email');

    if (!populatedSession) {
      throw new NotFoundException('session', sessionId);
    }

    this.logger.log(`Bid removed from session: ${sessionId} for hour: ${hour}`);

    return this.mapToResponseDto(populatedSession, populatedSession.market as any, populatedSession.createdBy as any);
  }

  /** Transitions a DRAFT session to APPROVED status. Requires at least one bid. */
  async approveSession(sessionId: string): Promise<SessionResponseDto> {
    const currentMarketId = await this.tenantContext.getCurrentMarket();
    const currentUserId = this.tenantContext.getCurrentUserId();

    if (!currentMarketId) {
      throw new BadRequestException('Market context is required');
    }

    if (!currentUserId) {
      throw new BadRequestException('User context is required');
    }

    if (!Types.ObjectId.isValid(sessionId)) {
      throw new NotFoundException('session', sessionId);
    }

    // Get user by Keycloak ID
    const user = await this.getUserByKeycloakId(currentUserId);

    const session = await this.sessionModel.findOne({
      _id: new Types.ObjectId(sessionId),
      market: new Types.ObjectId(currentMarketId),
    }).populate('market');

    if (!session) {
      throw new NotFoundException('session', sessionId);
    }

    // Solo el creador puede aprobar la sesión
    if (session.createdBy.toString() !== (user._id as any).toString()) {
      throw new BadRequestException('Only the session creator can approve this session');
    }

    // Verificar que la sesión esté en estado DRAFT
    if (session.status !== SessionStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT sessions can be approved');
    }

    // Verificar que la sesión tenga al menos una bid
    if (session.bids.length === 0) {
      throw new BadRequestException('Cannot approve session without bids');
    }

    // Actualizar estado a APPROVED
    const updatedSession = await this.sessionModel
      .findByIdAndUpdate(
        sessionId,
        {
          status: SessionStatus.APPROVED,
        },
        { new: true }
      )
      .populate('market', 'name')
      .populate('createdBy', 'username email');

    if (!updatedSession) {
      throw new NotFoundException('session', sessionId);
    }

    this.logger.log(`Session approved: ${sessionId}`);

    return this.mapToResponseDto(updatedSession, updatedSession.market as any, updatedSession.createdBy as any);
  }

  /** Reverts an APPROVED session (not yet deployed to blockchain) back to DRAFT. */
  async revertToDraft(sessionId: string): Promise<SessionResponseDto> {
    const currentMarketId = await this.tenantContext.getCurrentMarket();
    const currentUserId = this.tenantContext.getCurrentUserId();

    if (!currentMarketId || !currentUserId) {
      throw new BadRequestException('Market and user context required');
    }

    if (!Types.ObjectId.isValid(sessionId)) {
      throw new NotFoundException('session', sessionId);
    }

    // Usar findOneAndUpdate para operación atómica con bloqueo optimista
    const session = await this.sessionModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(sessionId),
        market: new Types.ObjectId(currentMarketId),
        status: SessionStatus.APPROVED,
        contractAddress: { $exists: false }
      },
      {
        status: SessionStatus.DRAFT,
        updatedAt: new Date()
      },
      { new: true }
    ).populate('market', 'name').populate('createdBy', 'username email');

    if (!session) {
      // Determinar razón específica del fallo
      const existingSession = await this.sessionModel.findOne({
        _id: new Types.ObjectId(sessionId),
        market: new Types.ObjectId(currentMarketId)
      });

      if (!existingSession) {
        throw new NotFoundException('session', sessionId);
      }
      if (existingSession.status !== SessionStatus.APPROVED) {
        throw new BadRequestException(
          `Cannot revert session with status ${existingSession.status}. Only APPROVED sessions can be reverted.`
        );
      }
      if (existingSession.contractAddress) {
        throw new BadRequestException(
          'Cannot revert session deployed to blockchain'
        );
      }
      throw new ConflictException('session', 'status',
        'Session was modified. Please refresh and try again.');
    }

    this.logger.log(`Session ${sessionId} reverted to DRAFT by ${currentUserId}`);
    return this.mapToResponseDto(session, session.market as any, session.createdBy as any);
  }

  /**
   * Deploys the MarketSession smart contract and sets up all required roles and contract links.
   * Transitions the session from APPROVED to PUBLISHED.
   *
   * @param pin Optional 6-digit PIN to sign with the user's own wallet instead of the admin wallet.
   */
  async publishSession(sessionId: string, pin?: string): Promise<SessionResponseDto> {
    const currentMarketId = await this.tenantContext.getCurrentMarket();
    const currentUserId = this.tenantContext.getCurrentUserId();

    if (!currentMarketId) {
      throw new BadRequestException('Market context is required');
    }

    if (!currentUserId) {
      throw new BadRequestException('User context is required');
    }

    if (!Types.ObjectId.isValid(sessionId)) {
      throw new NotFoundException('session', sessionId);
    }

    // Get user by Keycloak ID
    const user = await this.getUserByKeycloakId(currentUserId);

    const session = await this.sessionModel.findOne({
      _id: new Types.ObjectId(sessionId),
      market: new Types.ObjectId(currentMarketId),
    }).populate('market');

    if (!session) {
      throw new NotFoundException('session', sessionId);
    }

    // Verificar que la sesión esté en estado APPROVED (cambio: ya no DRAFT)
    if (session.status !== SessionStatus.APPROVED) {
      throw new BadRequestException('Only APPROVED sessions can be published');
    }

    // Verificar que la sesión tenga al menos una bid
    if (session.bids.length === 0) {
      throw new BadRequestException('Cannot publish session without bids');
    }

    // Obtener el market para verificar que tiene contractAddress
    const market = session.market as any;
    if (!market.marketAddress) {
      throw new BadRequestException('Market must be activated on blockchain before publishing sessions');
    }

    // Verificar que la sesión tiene flexibilityRequests guardados
    if (!session.flexibilityRequests || session.flexibilityRequests.length === 0) {
      throw new BadRequestException('Session must have flexibility requests to be published');
    }

    // Preparar parámetros para blockchain
    const deliveryDay = Math.floor(new Date(session.sessionDate).getTime() / 1000); // timestamp en segundos
    const treasury = process.env.TREASURY_ADDRESS || '0x0000000000000000000000000000000000000000';

    // 🔒 VERIFY ADMIN PERMISSIONS BEFORE DEPLOYING
    // Check that backend admin wallet has DEFAULT_ADMIN_ROLE on Treasury to grant roles
    const adminAddress = this.treasuryContract.getAdminSignerAddress();
    const hasAdminRole = await this.treasuryContract.hasAdminRole(adminAddress);
    if (!hasAdminRole) {
      this.logger.error(`❌ Backend admin wallet ${adminAddress} does not have DEFAULT_ADMIN_ROLE on Treasury`);
      throw new BadRequestException(
        `Backend admin wallet does not have permission to grant roles on Treasury. ` +
        `Please grant DEFAULT_ADMIN_ROLE to ${adminAddress} on Treasury contract.`
      );
    }
    this.logger.log(`✅ Backend admin wallet ${adminAddress} has DEFAULT_ADMIN_ROLE on Treasury`);

    // Get FMO/LMO and FRP addresses
    // FMO/LMO is the user who publishes the session (uses market wallet)
    // FRP has their own SELF wallet with FRP_ROLE on Treasury
    let fmoLmo: string;
    let frp: string;
    let userWallet: ethers.Wallet | undefined;

    // Market must have a wallet for FMO/LMO operations
    if (!market.publicAddress) {
      throw new BadRequestException('Market must have a wallet before publishing sessions');
    }

    // Get FRP user's own wallet address
    if (!market.frp) {
      throw new BadRequestException('Market must have an FRP assigned before publishing sessions');
    }
    const frpUser = await this.userModel.findById(market.frp).exec();
    if (!frpUser || !frpUser.publicAddress) {
      throw new BadRequestException('FRP user must have a wallet created before publishing sessions');
    }
    frp = frpUser.publicAddress;

    if (pin) {
      // If PIN is provided, use the user's wallet to sign the transaction
      try {
        // Get user wallet for signing using the PIN
        userWallet = await this.walletService.getConnectedWallet(
          (user._id as any).toString(),
          pin,
          currentMarketId
        );

        // FMO/LMO uses the market wallet (which is the user's wallet in MARKET binding)
        fmoLmo = userWallet.address;

        this.logger.log(`Using user wallet for transaction: ${userWallet.address}`);
      } catch (error) {
        this.logger.error(`Failed to get user wallet: ${error.message}`);
        throw new BadRequestException(`Failed to verify PIN or get user wallet: ${error.message}`);
      }
    } else {
      // Fallback to admin wallet if no PIN provided (for backward compatibility)
      const adminWallet = this.providerService.getSigner(this.config.get('ADMIN_PK')!);
      fmoLmo = adminWallet.address;
      this.logger.warn('Publishing session with admin wallet. Consider using PIN-based authentication for production.');
    }

    // Usar los flexibilityRequests guardados en la sesión
    const requests = session.flexibilityRequests.map(req => ({
      hourSlot: req.hourSlot,
      quantity: req.quantity,
      price: req.price,
      flexType: req.flexType
    }));

    // Desplegar el contrato de sesión en blockchain
    this.logger.log(`Deploying session contract for session ${sessionId} on market ${market.marketAddress}`);
    this.logger.log(`Using ${requests.length} flexibility requests from database`);
    this.logger.log(`FMO/LMO address: ${fmoLmo}`);
    this.logger.log(`FRP address: ${frp}`);
    let blockchainResult;
    try {
      blockchainResult = await this.blockchainService.createSession(
        market.marketAddress,
        deliveryDay,
        treasury,
        fmoLmo,
        frp,
        requests,
        userWallet // Pass user wallet if available
      );
      this.logger.log(`Session contract deployed at ${blockchainResult.sessionAddress}`);
    } catch (error) {
      this.logger.error(`Failed to deploy session contract: ${error.message}`, error.stack);
      throw new BadRequestException(`Failed to deploy session contract: ${error.message}`);
    }

    // 🆕 AUTOMATIC SESSION CONFIGURATION
    // Configure all required contracts and roles after deployment
    const sessionAddress = blockchainResult.sessionAddress;
    this.logger.log(`🔧 Starting automatic configuration for Session ${sessionAddress}`);

    try {
      // Get environment contract addresses
      const nftAddress = this.config.get('FLEXIBILITY_NFT_ADDRESS');
      const treasuryAddress = this.config.get('TREASURY_ADDRESS');
      const participantRegistryAddress = this.config.get('PARTICIPANT_REGISTRY_ADDRESS');

      if (!nftAddress || !treasuryAddress || !participantRegistryAddress) {
        throw new Error('Required contract addresses not configured in environment');
      }

      // STEP 1: Set NFT Contract in MarketSession (using user wallet who deployed it)
      this.logger.log(`📝 Step 1: Setting NFT contract ${nftAddress} in Session`);
      const setNFTTx = await this.marketSessionContract.setNFTContract(sessionAddress, nftAddress, userWallet);
      await setNFTTx.wait();
      this.logger.log(`✅ NFT contract configured. TX: ${setNFTTx.hash}`);

      // STEP 2: Set ParticipantRegistry in MarketSession (using user wallet who deployed it)
      this.logger.log(`📝 Step 2: Setting ParticipantRegistry ${participantRegistryAddress} in Session`);
      const setRegistryTx = await this.marketSessionContract.setParticipantRegistry(
        sessionAddress,
        participantRegistryAddress,
        userWallet
      );
      await setRegistryTx.wait();
      this.logger.log(`✅ ParticipantRegistry configured. TX: ${setRegistryTx.hash}`);

      // STEP 3: Grant SESSION_CONTRACT role to session in Treasury
      this.logger.log(`📝 Step 3: Granting SESSION_CONTRACT role to ${sessionAddress} in Treasury`);
      const grantSessionTx = await this.treasuryContract.grantSessionContractRole(sessionAddress);
      await grantSessionTx.wait();
      this.logger.log(`✅ SESSION_CONTRACT role granted. TX: ${grantSessionTx.hash}`);

      // STEP 4: Grant FRP_ROLE to FRP address in Treasury
      this.logger.log(`📝 Step 4: Granting FRP_ROLE to ${frp} in Treasury`);
      const grantFRPTx = await this.treasuryContract.grantFRPRole(frp);
      await grantFRPTx.wait();
      this.logger.log(`✅ FRP_ROLE granted. TX: ${grantFRPTx.hash}`);

      // STEP 5: Grant MINTER_ROLE and UPDATER_ROLE to session in FlexibilityNFT
      this.logger.log(`📝 Step 5: Granting MINTER_ROLE to ${sessionAddress} in NFT contract`);
      const grantMinterTx = await this.flexibilityNFTContract.grantMinterRole(sessionAddress);
      await grantMinterTx.wait();
      this.logger.log(`✅ MINTER_ROLE granted. TX: ${grantMinterTx.hash}`);

      this.logger.log(`📝 Step 6: Granting UPDATER_ROLE to ${sessionAddress} in NFT contract`);
      const grantUpdaterTx = await this.flexibilityNFTContract.grantUpdaterRole(sessionAddress);
      await grantUpdaterTx.wait();
      this.logger.log(`✅ UPDATER_ROLE granted. TX: ${grantUpdaterTx.hash}`);

      // STEP 7: Grant FMO_LMO role in MarketSession (using user wallet who deployed it)
      this.logger.log(`📝 Step 7: Granting FMO_LMO role to ${fmoLmo} in Session`);
      const grantFMOTx = await this.marketSessionContract.grantFMOLMORole(sessionAddress, fmoLmo, userWallet);
      await grantFMOTx.wait();
      this.logger.log(`✅ FMO_LMO role granted. TX: ${grantFMOTx.hash}`);

      // STEP 8: Grant ORACLE role in MarketSession (same as FMO_LMO, using user wallet)
      this.logger.log(`📝 Step 8: Granting ORACLE role to ${fmoLmo} in Session`);
      const grantOracleTx = await this.marketSessionContract.grantOracleRole(sessionAddress, fmoLmo, userWallet);
      await grantOracleTx.wait();
      this.logger.log(`✅ ORACLE role granted. TX: ${grantOracleTx.hash}`);

      // STEP 9: Get all qualified FSPs for this market and grant FSP role (using user wallet)
      this.logger.log(`📝 Step 9: Getting qualified FSPs for market ${market._id}`);
      const qualifiedFSPs = await this.getQualifiedFSPsForMarket(market._id.toString());
      this.logger.log(`Found ${qualifiedFSPs.length} qualified FSPs`);

      for (const fsp of qualifiedFSPs) {
        this.logger.log(`📝 Granting FSP role to ${fsp.publicAddress} in Session`);
        const grantFSPTx = await this.marketSessionContract.grantFSPRole(sessionAddress, fsp.publicAddress, userWallet);
        await grantFSPTx.wait();
        this.logger.log(`✅ FSP role granted to ${fsp.email}. TX: ${grantFSPTx.hash}`);
      }

      this.logger.log(`🎉 Session configuration completed successfully!`);
    } catch (configError) {
      this.logger.error(`❌ Session configuration failed: ${configError.message}`, configError.stack);
      // Re-throw the error - session was deployed but configuration failed
      // The session contract exists on blockchain but won't work properly without roles
      throw new BadRequestException(
        `Session deployed at ${sessionAddress} but configuration failed: ${configError.message}. ` +
        `The session contract exists on blockchain but requires manual role configuration.`
      );
    }

    // Actualizar estado, fecha de publicación y datos de blockchain
    const updatedSession = await this.sessionModel
      .findByIdAndUpdate(
        sessionId,
        {
          status: SessionStatus.PUBLISHED,
          publishedAt: new Date(),
          contractAddress: blockchainResult.sessionAddress,
          transactionHash: blockchainResult.txHash,
          blockchainSessionId: blockchainResult.sessionId,
          frpAddress: frp,
          fmoLmoAddress: fmoLmo,
        },
        { new: true }
      )
      .populate('market', 'name')
      .populate('createdBy', 'username email');

    if (!updatedSession) {
      throw new NotFoundException('session', sessionId);
    }

    this.logger.log(`Session published: ${sessionId} with contract at ${blockchainResult.sessionAddress}`);

    return this.mapToResponseDto(updatedSession, updatedSession.market as any, updatedSession.createdBy as any);
  }

  /**
   * Opens the offers period on the MarketSession contract, transitioning the session to ACTIVE.
   * Automatically grants FSP roles to newly qualified participants.
   *
   * @param pin Optional 6-digit PIN to sign with the user's own wallet.
   */
  async openOffersPeriod(sessionId: string, pin?: string): Promise<SessionResponseDto> {
    const currentMarketId = await this.tenantContext.getCurrentMarket();
    const currentUserId = this.tenantContext.getCurrentUserId();

    if (!currentMarketId) {
      throw new BadRequestException('Market context is required');
    }

    if (!currentUserId) {
      throw new BadRequestException('User context is required');
    }

    if (!Types.ObjectId.isValid(sessionId)) {
      throw new NotFoundException('session', sessionId);
    }

    // Get user by Keycloak ID
    const user = await this.getUserByKeycloakId(currentUserId);

    const session = await this.sessionModel.findOne({
      _id: new Types.ObjectId(sessionId),
      market: new Types.ObjectId(currentMarketId),
    }).populate('market');

    if (!session) {
      throw new NotFoundException('session', sessionId);
    }

    // Verify that offers period must be opened at least 24h BEFORE the session start
    const now = new Date();
    const sessionStart = new Date(session.sessionDate); // Date

    const msInHour = 60 * 60 * 1000;
    const latestAllowedOpenTime = new Date(sessionStart.getTime() - 24 * msInHour);

    // Too late: within the last 24 hours before start (X-1) or after start
    if (now.getTime() >= latestAllowedOpenTime.getTime()) {
      throw new BadRequestException(
        'Offers period must be opened more than 24 hours before the session starts'
      );
    }

    // Verificar que la sesión esté en estado PUBLISHED
    if (session.status !== SessionStatus.PUBLISHED) {
      throw new BadRequestException('Only PUBLISHED sessions can open offers period');
    }

    // Verificar que la sesión tenga contractAddress
    if (!session.contractAddress) {
      throw new BadRequestException('Session must have a blockchain contract address');
    }

    // Get user wallet for signing using the PIN
    let userWallet: ethers.Wallet | undefined;

    if (pin) {
      // If PIN is provided, use the user's wallet to sign the transaction
      try {
        userWallet = await this.walletService.getConnectedWallet(
          (user._id as any).toString(),
          pin,
          currentMarketId
        );

        this.logger.log(`Using user wallet ${userWallet.address} to open offers period`);
      } catch (error) {
        this.logger.error(`Failed to get user wallet: ${error.message}`, error.stack);
        throw new BadRequestException(`Failed to authenticate wallet: ${error.message}`);
      }
    }

    // 🆕 AUTOMATIC FSP ROLE GRANTING
    // Before opening offers, check for newly qualified FSPs and grant them the FSP role
    this.logger.log(`🔍 Checking for newly qualified FSPs in market ${currentMarketId}`);

    try {
      const market = session.market as any;
      const qualifiedFSPs = await this.getQualifiedFSPsForMarket(market._id.toString());
      this.logger.log(`Found ${qualifiedFSPs.length} qualified FSPs in the market`);

      // Grant FSP role to each qualified FSP (if they don't already have it)
      for (const fsp of qualifiedFSPs) {
        try {
          this.logger.log(`📝 Granting FSP role to ${fsp.publicAddress} (${fsp.email}) in Session`);
          const grantFSPTx = await this.marketSessionContract.grantFSPRole(
            session.contractAddress,
            fsp.publicAddress,
            userWallet
          );
          await grantFSPTx.wait();
          this.logger.log(`✅ FSP role granted to ${fsp.email}. TX: ${grantFSPTx.hash}`);
        } catch (roleError) {
          // If the role grant fails, log but don't stop the process
          // (FSP might already have the role, or there might be another issue)
          this.logger.warn(`⚠️  Failed to grant FSP role to ${fsp.email}: ${roleError.message}`);
          // Continue with other FSPs
        }
      }

      this.logger.log(`✅ FSP role granting completed`);
    } catch (fspError) {
      this.logger.error(`❌ Error during FSP role granting: ${fspError.message}`);
      // Don't throw - continue with opening offers even if role granting fails
      this.logger.warn(`⚠️  Continuing with opening offers period despite FSP role granting issues`);
    }

    // Llamar al método openOffers() del contrato
    this.logger.log(`Opening offers period for session ${sessionId} at contract ${session.contractAddress}`);
    let tx;

    try {
      tx = await this.marketSessionContract.openOffers(session.contractAddress, userWallet);
      await tx.wait();
      this.logger.log(`Offers period opened successfully. Transaction hash: ${tx.hash}`);
    } catch (error) {
      this.logger.error(`Failed to open offers period on blockchain: ${error.message}`, error.stack);
      throw new BadRequestException(`Failed to open offers period on blockchain: ${error.message}`);
    }

    // Actualizar estado a ACTIVE
    let updatedSession = await this.sessionModel
      .findByIdAndUpdate(
        sessionId,
        {
          status: SessionStatus.ACTIVE,
        },
        {
          new: true,
        },
      )
      .populate('market', 'name')
      .populate('createdBy', 'username email');

    if (!updatedSession) {
      throw new NotFoundException('session', sessionId);
    }

    updatedSession.transactionHash = tx.hash;
    this.logger.log(`Session ${sessionId} status updated to ACTIVE`);

    return this.mapToResponseDto(updatedSession, updatedSession.market as any, updatedSession.createdBy as any);
  }

  /** Returns collateral tokens to FSPs by calling the smart contract on a CANCELLED session. */
  async returnTokensOnCancelledSession(sessionId: string, pin: string): Promise<void> {
    const currentMarketId = await this.tenantContext.getCurrentMarket();
    const currentUserId = this.tenantContext.getCurrentUserId();

    if (!currentMarketId) {
      throw new BadRequestException('Market context is required');
    }

    if (!currentUserId) {
      throw new BadRequestException('User context is required');
    }

    const fmoLmo = await this.getUserByKeycloakId(currentUserId);
    if (fmoLmo.role !== UserRole.FMO_LMO) {
      throw new BadRequestException('Only FMO_LMO can close the offers period');
    }

    if (!Types.ObjectId.isValid(sessionId)) {
      throw new NotFoundException('session', sessionId);
    }

    // Obtener la sesión
    const session = await this.sessionModel.findOne({
      _id: new Types.ObjectId(sessionId),
      market: new Types.ObjectId(currentMarketId),
    }).populate('market');

    if (!session) {
      throw new NotFoundException('session', sessionId);
    }

    // Obtener el market
    const market = session.market as any;
    if (!market || !market._id) {
      throw new BadRequestException('Session must have an associated market');
    }

    if (session.status !== SessionStatus.CANCELLED) {
      throw new BadRequestException('The tokens will be given back once the session is Cancelled');
    }

    const userWallet = await this.walletService.getConnectedWallet(
      (fmoLmo._id as Types.ObjectId).toString(),
      pin,
      market._id.toString()
    );

    try {
      const returnTokens = await this.marketSessionContract.returnTokensCancelSession(
        session.contractAddress!,
        userWallet
      );

      this.logger.log(`Token return transaction sent: ${returnTokens.hash}`);
      await returnTokens.wait();
      this.logger.log(`Token return transaction confirmed: ${returnTokens.hash}`);

      // Marcar la sesión como tokens devueltos
      await this.sessionModel.updateOne(
        { _id: new Types.ObjectId(sessionId) },
        { $set: { tokensReturned: true } }
      );
      this.logger.log(`Session ${sessionId} marked as tokens returned`);

    } catch (error) {
      this.logger.error(`Failed to failed to return tokens for session ${sessionId}`, error);
      throw error;
    }


  }

  /**
   * Closes the offers period on the MarketSession contract, transitioning the session to OFFERS_CLOSED.
   * Must be called more than 2 hours before the session delivery date.
   */
  async closeOffersPeriod(sessionId: string, pin: string): Promise<SessionResponseDto> {
    const currentMarketId = await this.tenantContext.getCurrentMarket();
    const currentUserId = this.tenantContext.getCurrentUserId();

    if (!currentMarketId) {
      throw new BadRequestException('Market context is required');
    }

    if (!currentUserId) {
      throw new BadRequestException('User context is required');
    }

    if (!Types.ObjectId.isValid(sessionId)) {
      throw new NotFoundException('session', sessionId);
    }

    // Obtener la sesión
    const session = await this.sessionModel.findOne({
      _id: new Types.ObjectId(sessionId),
      market: new Types.ObjectId(currentMarketId),
    }).populate('market');

    if (!session) {
      throw new NotFoundException('session', sessionId);
    }

    // Verify that offers period must be closed more than 2h BEFORE the session start
    const now = new Date();
    const sessionStart = new Date(session.sessionDate);

    const msInHour = 60 * 60 * 1000;
    const latestAllowedCloseTime = new Date(sessionStart.getTime() - 2 * msInHour);

    // Too late: within the last 2 hours before start or after start
    if (now.getTime() >= latestAllowedCloseTime.getTime()) {

      throw new BadRequestException(
        'Offers period can only be closed more than 2 hours before the session starts'
      );
    }


    // Verificar que la sesión está en estado ACTIVE
    if (session.status !== SessionStatus.ACTIVE) {
      throw new BadRequestException('Only ACTIVE sessions can have their offers period closed');
    }

    // Verificar que tiene contractAddress
    if (!session.contractAddress) {
      throw new BadRequestException('Session does not have a blockchain contract address');
    }

    // Obtener el usuario (debe ser FMO_LMO)
    const fmoLmo = await this.getUserByKeycloakId(currentUserId);
    if (fmoLmo.role !== UserRole.FMO_LMO) {
      throw new BadRequestException('Only FMO_LMO can close the offers period');
    }

    // Obtener el market
    const market = session.market as any;
    if (!market || !market._id) {
      throw new BadRequestException('Session must have an associated market');
    }

    // Obtener el wallet del FMO_LMO con el PIN
    const userWallet = await this.walletService.getConnectedWallet(
      (fmoLmo._id as Types.ObjectId).toString(),
      pin,
      market._id.toString()
    );

    this.logger.log(`Closing offers period for session ${sessionId} at contract ${session.contractAddress}`);

    try {
      // Llamar al método closeOffers() del contrato con el wallet del FMO_LMO
      const closeOffersTx = await this.marketSessionContract.closeOffers(
        session.contractAddress!,
        userWallet
      );

      this.logger.log(`Close offers transaction sent: ${closeOffersTx.hash}`);
      await closeOffersTx.wait();
      this.logger.log(`Close offers transaction confirmed: ${closeOffersTx.hash}`);

      // Actualizar el estado de la sesión a OFFERS_CLOSED
      const updatedSession = await this.sessionModel
        .findByIdAndUpdate(
          sessionId,
          {
            status: SessionStatus.OFFERS_CLOSED,
            transactionHash: closeOffersTx.hash
          },
          { new: true }
        )
        .populate('market', 'name')
        .populate('createdBy', 'username email');

      if (!updatedSession) {
        throw new NotFoundException('session', sessionId);
      }

      this.logger.log(`Session ${sessionId} status updated to OFFERS_CLOSED`);

      return this.mapToResponseDto(updatedSession, updatedSession.market as any, updatedSession.createdBy as any);
    } catch (error) {
      this.logger.error(`Failed to close offers period for session ${sessionId}`, error);

      // Check if the error is from the smart contract "Too early to close"
      if (error.message && error.message.includes('Too early to close')) {
        throw new BadRequestException('Offers period can only be closed more than 2 hours before the session starts');
      }

      throw new BadRequestException(`Failed to close offers period: ${error.message}`);
    }
  }

  /** Permanently deletes a DRAFT session. Published or active sessions cannot be deleted. */
  async deleteSession(sessionId: string): Promise<void> {
    const currentMarketId = await this.tenantContext.getCurrentMarket();
    const currentUserId = this.tenantContext.getCurrentUserId();

    if (!currentMarketId) {
      throw new BadRequestException('Market context is required');
    }

    if (!currentUserId) {
      throw new BadRequestException('User context is required');
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

    // Solo permitir eliminación si está en estado DRAFT
    if (session.status !== SessionStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT sessions can be deleted');
    }

    await this.sessionModel.findByIdAndDelete(sessionId);

    this.logger.log(`Session deleted: ${sessionId}`);
  }

  private validateBids(bids: CreateHourlyBidDto[]): void {
    const hours = new Set<number>();

    for (const bid of bids) {
      // Verificar que no hay horas duplicadas
      if (hours.has(bid.hour)) {
        throw new BadRequestException(`Duplicate bid for hour ${bid.hour}`);
      }
      hours.add(bid.hour);

      // Validaciones adicionales
      if (bid.hour < 0 || bid.hour > 23) {
        throw new BadRequestException(`Hour must be between 0 and 23, got ${bid.hour}`);
      }

      if (bid.powerMw <= 0) {
        throw new BadRequestException(`Power must be greater than 0, got ${bid.powerMw}`);
      }

      if (bid.pricePerMwh <= 0) {
        throw new BadRequestException(`Price must be greater than 0, got ${bid.pricePerMwh}`);
      }
    }
  }

  private mapToResponseDto(session: SessionDocument, market: any, user: any): SessionResponseDto {
    return {
      id: (session._id as any).toString(),
      name: session.name,
      description: session.description,
      sessionDate: session.sessionDate.toISOString().split('T')[0], // YYYY-MM-DD format
      market: {
        id: market._id?.toString() || market.id,
        name: market.name,
      },
      createdBy: {
        id: user._id?.toString() || user.id,
        username: user.username,
        email: user.email,
      },
      status: session.status,
      bids: session.bids.map(bid => {
        const availablePowerMw = bid.powerMw - (bid.fulfilledPowerMw || 0);
        return {
          hour: bid.hour,
          powerMw: bid.powerMw,
          pricePerMwh: bid.pricePerMwh,
          bidType: bid.bidType,
          fulfilledPowerMw: bid.fulfilledPowerMw || 0,
          availablePowerMw,
          isFull: availablePowerMw <= 0,
          createdAt: bid.createdAt,
          updatedAt: bid.updatedAt,
        };
      }).sort((a, b) => a.hour - b.hour), // Ordenar por hora
      totalBids: session.totalBids,
      totalPowerMw: session.totalPowerMw,
      averagePricePerMwh: session.averagePricePerMwh,
      publishedAt: session.publishedAt,
      completedAt: session.completedAt,
      cancelReason: session.cancelReason,
      cancelledAt: session.cancelledAt,
      contractAddress: session.contractAddress,
      transactionHash: session.transactionHash,
      createdAt: session.createdAt || new Date(),
      updatedAt: session.updatedAt || new Date(),
    };
  }

  /**
   * Get all qualified FSPs for a specific market
   * Returns FSP users who are:
   * 1. Assigned to the market (in accessibleMarkets)
   * 2. Have FSP role
   * 3. Have a wallet (publicAddress)
   * 4. Are qualified in blockchain ParticipantRegistry
   */
  private async getQualifiedFSPsForMarket(marketId: string): Promise<UserDocument[]> {
    try {
      // Find all users with FSP role assigned to this market who have wallets
      const fspUsers = await this.userModel.find({
        role: 'FSP',
        accessibleMarkets: new Types.ObjectId(marketId),
        publicAddress: { $exists: true, $ne: null }
      });

      this.logger.log(`Found ${fspUsers.length} FSP users with wallets in market ${marketId}`);

      // Filter only those who are qualified in blockchain
      const qualifiedFSPs: UserDocument[] = [];

      for (const user of fspUsers) {
        try {
          const isQualified = await this.participantRegistryContract.isQualified(user.publicAddress);
          if (isQualified) {
            qualifiedFSPs.push(user);
            this.logger.log(`✅ FSP ${user.email} (${user.publicAddress}) is qualified`);
          } else {
            this.logger.warn(`⚠️  FSP ${user.email} (${user.publicAddress}) is NOT qualified in blockchain`);
          }
        } catch (error) {
          this.logger.error(`Error checking qualification for FSP ${user.email}: ${error.message}`);
        }
      }

      this.logger.log(`Total qualified FSPs: ${qualifiedFSPs.length}`);
      return qualifiedFSPs;
    } catch (error) {
      this.logger.error(`Error getting qualified FSPs for market ${marketId}: ${error.message}`);
      return [];
    }
  }

  /**
   * Grant FSP role to a specific user in a session
   * Useful when a user creates their wallet AFTER the session was published
   * @param sessionId Session ID
   * @param fspAddress FSP wallet address
   * @param pin FMO_LMO PIN for signing the transaction
   */
  async grantFSPRoleToUser(sessionId: string, fspAddress: string, pin: string): Promise<{ txHash: string }> {
    // Get session
    const session = await this.sessionModel.findById(sessionId).populate('market');
    if (!session) {
      throw new NotFoundException('session', sessionId);
    }

    if (!session.contractAddress) {
      throw new BadRequestException('Session does not have a contract address');
    }

    // Get current user (should be FMO_LMO)
    const currentUserId = this.tenantContext.getCurrentUserId();
    if (!currentUserId) {
      throw new BadRequestException('User context is required');
    }

    const fmoLmo = await this.getUserByKeycloakId(currentUserId);
    if (fmoLmo.role !== UserRole.FMO_LMO) {
      throw new BadRequestException('Only FMO_LMO can grant FSP roles');
    }

    // Get market
    const market = session.market as any;
    if (!market || !market._id) {
      throw new BadRequestException('Session must have an associated market');
    }

    // Get FMO_LMO wallet with PIN
    const userWallet = await this.walletService.getConnectedWallet(
      (fmoLmo._id as Types.ObjectId).toString(),
      pin,
      market._id.toString()
    );

    this.logger.log(`Granting FSP role to ${fspAddress} in Session ${session.contractAddress}`);

    // Grant FSP role
    const grantFSPTx = await this.marketSessionContract.grantFSPRole(
      session.contractAddress,
      fspAddress,
      userWallet
    );
    await grantFSPTx.wait();

    this.logger.log(`✅ FSP role granted to ${fspAddress}. TX: ${grantFSPTx.hash}`);

    return { txHash: grantFSPTx.hash };
  }
}