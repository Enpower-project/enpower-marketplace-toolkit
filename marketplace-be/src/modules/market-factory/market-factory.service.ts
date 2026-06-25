import { Injectable, BadRequestException, ConflictException, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Market, MarketDocument, MarketState } from '../../schemas/Market.schema';
import { User, UserDocument } from '../../schemas/User.schema';
import { AuthService, CreateMarketOwnerResult } from '../auth/auth.service';
import { UserService } from '../user/user.service';
import { EmailService } from '../email/email.service';
import { UpdateMarketDto } from '../../dtos/update-market.dto';
import { UserMarketAccessService } from '../tenant/services/user-market-access.service';
import { WalletService } from '../wallet/wallet.service';
import { BlockchainService } from '../blockchain/blockchain.service';
import * as crypto from 'crypto';

export interface CreateMarketWithOwnerDto {
  name: string;
  description: string;
  ownerEmail: string;
  ownerFirstName: string;
  ownerLastName: string;
  // dsoAddress: string;
  region?: string;
}

export interface MarketCreationResult {
  market: MarketDocument;
  isNewUser: boolean;
  userCreated?: boolean;
  walletCreated: boolean;
  walletPin?: string;
  temporaryPassword?: string;
}

export interface MarketActivationResult {
  market: MarketDocument;
  txHash: string;
  marketAddress: string;
  success: boolean;
}

@Injectable()
export class MarketFactoryService {
  private readonly logger = new Logger(MarketFactoryService.name);

  constructor(
    @InjectModel(Market.name) private marketModel: Model<MarketDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private authService: AuthService,
    private userService: UserService,
    private readonly emailService: EmailService,
    private readonly userMarketAccessService: UserMarketAccessService,
    private readonly walletService: WalletService,
    private readonly blockchainService: BlockchainService,
  ) { }

  /**
   * Creates a market and its owner account in a single operation.
   * If the owner email does not exist a new Keycloak user is provisioned; otherwise
   * the existing user is validated for market-owner eligibility.
   * Sends a market acceptance email to the owner on success.
   * @param language BCP-47 language tag used for outbound emails
   */
  async createMarketWithOwner(createMarketDto: CreateMarketWithOwnerDto, language: string = 'en'): Promise<MarketCreationResult> {
    const { name, description, ownerEmail, ownerFirstName, ownerLastName, /* dsoAddress, */ region } = createMarketDto;

    // 1. Validazione unicità nome mercato
    const existingMarket = await this.marketModel.findOne({ name });
    if (existingMarket) {
      throw new ConflictException('Market name already exists');
    }

    // 2. Validazione formato email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(ownerEmail)) {
      throw new BadRequestException('Invalid email format');
    }

    // 3. Controllo se utente esiste
    let marketOwner: UserDocument | null = await this.userModel.findOne({ email: ownerEmail });
    let isNewUser = false;
    let userCreated = false;
    let temporaryPassword: string | undefined;

    if (!marketOwner) {
      // 4. Creazione nuovo utente con password temporanea generata
      const createResult: CreateMarketOwnerResult = await this.authService.createUserWithMarketOwnerRole({
        email: ownerEmail,
        username: ownerEmail.split('@')[0],
        firstName: ownerFirstName,
        lastName: ownerLastName,
        temporaryPassword: true
      });
      marketOwner = createResult.user;
      temporaryPassword = createResult.temporaryPassword;
      isNewUser = true;
      userCreated = true;
    } else {
      // 5. Validazione che utente esistente possa essere Market Owner
      await this.userService.validateMarketOwnerEligibility('' + marketOwner._id);
    }

    // 6. Generate acceptance expiration date (7 days from now)
    const expireMarketAcceptationDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    // 7. Creazione mercato con marketOwner field
    const market = new this.marketModel({
      name,
      description,
      // dso: dsoAddress,
      region,
      marketOwner: new Types.ObjectId('' + marketOwner._id),
      state: MarketState.CREATED_OFFLINE_PENDING_ACCEPTATION,
      expireMarketAcceptationDate,
      isActive: true
    });

    const savedMarket = await market.save();

    // 🆕 DEBUG: Log the saved market state

    // 7. Asignar acceso al market en accessibleMarkets
    await this.userMarketAccessService.grantMarketAccess(marketOwner.keycloakId, (savedMarket._id as any).toString());

    // 8. Assegnazione ruolo Market Owner se utente esistente
    if (!isNewUser) {
      await this.userService.assignMarketOwnerRole('' + marketOwner._id, '' + savedMarket._id);
    }

    // 9. Don't create wallet automatically - will be created after acceptance
    let walletCreated = false;
    let walletPin: string | undefined;

    // 10. Invio email di notificación del mercado creado
    await this.emailService.sendMarketAcceptanceEmail({
      email: marketOwner.email,
      username: marketOwner.username,
      marketName: savedMarket.name,
      marketId: (savedMarket._id as any).toString(),
      acceptanceToken: undefined, // No longer needed
      temporaryPassword: temporaryPassword,
      language
    });

    return {
      market: savedMarket,
      isNewUser,
      userCreated,
      walletCreated,
      walletPin,
      temporaryPassword
    };
  }

  /** Returns all markets (all states) with their owner populated. */
  async listAll(): Promise<MarketDocument[]> {
    return this.marketModel.find().populate('marketOwner').exec();
  }

  /** Finds a market by its MongoDB ID and populates the owner, returning null if not found. */
  async findMarketById(marketId: string): Promise<MarketDocument | null> {
    return this.marketModel.findById(marketId).populate('marketOwner').exec();
  }


  /** Returns all markets owned by the given user, regardless of state. */
  async findMarketsByOwner(ownerId: string): Promise<MarketDocument[]> {
    return this.marketModel.find({
      marketOwner: new Types.ObjectId(ownerId),
      //isActive: true
    }).populate('marketOwner').exec();
  }

  /** Returns markets matching the given list of MongoDB IDs, regardless of state. */
  async findMarketsByIds(marketIds: string[]): Promise<MarketDocument[]> {
    return this.marketModel.find({
      _id: { $in: marketIds.map(id => new Types.ObjectId(id)) },
      //isActive: true
    }).populate('marketOwner').exec();
  }

  /** Returns the first accepted, pending-activation, or active market owned by the given user, or null. */
  async findActiveMarketByOwner(ownerId: string): Promise<MarketDocument | null> {
    return this.marketModel.findOne({
      marketOwner: new Types.ObjectId(ownerId),
      state: {
        $in: [
          MarketState.CREATED_OFFLINE_ACCEPTED,
          MarketState.WALLET_CREATED_PENDING_ACTIVATION,
          MarketState.ACTIVE_ONCHAIN
        ]
      },
      //isActive: true
    }).exec();
  }

  /**
   * Transitions a market to a new state.
   * Sets `activatedAt` automatically when transitioning to `ACTIVE_ONCHAIN`.
   * @throws NotFoundException if the market does not exist
   */
  async updateMarketState(marketId: string, state: MarketState): Promise<MarketDocument> {
    const updatedMarket = await this.marketModel.findByIdAndUpdate(
      marketId,
      {
        state,
        ...(state === MarketState.ACTIVE_ONCHAIN && { activatedAt: new Date() })
      },
      { new: true }
    ).exec();

    if (!updatedMarket) {
      throw new NotFoundException(`Market with ID ${marketId} not found`);
    }

    return updatedMarket;
  }

  /**
   * Updates editable market fields after validating existence, permission, and name uniqueness.
   * @param requestingUserId Keycloak or MongoDB user ID; omit to skip permission check
   */
  async updateMarket(marketId: string, updateData: UpdateMarketDto, requestingUserId?: string): Promise<MarketDocument> {
    // 1. Verificar que el market existe
    const existingMarket = await this.validateMarketExists(marketId);

    // 2. Verificar permisos si se proporciona requestingUserId
    if (requestingUserId) {
      await this.validateUpdatePermissions(existingMarket, requestingUserId);
    }

    // 3. Validar unicidad del nombre si se está actualizando
    if (updateData.name) {
      await this.validateUniqueMarketName(updateData.name, marketId, existingMarket.name);
    }

    // 4. Preparar y ejecutar actualización
    const updateFields = this.prepareUpdateFields(updateData, existingMarket);

    const updatedMarket = await this.marketModel.findByIdAndUpdate(
      marketId,
      updateFields,
      { new: true, runValidators: true }
    ).populate('marketOwner').exec();

    if (!updatedMarket) {
      throw new NotFoundException(`Market with ID ${marketId} not found`);
    }

    return updatedMarket;
  }

  private async validateMarketExists(marketId: string): Promise<MarketDocument> {
    const market = await this.marketModel.findById(marketId).exec();
    if (!market) {
      throw new NotFoundException(`Market with ID ${marketId} not found`);
    }
    return market;
  }

  private async validateUpdatePermissions(existingMarket: MarketDocument, requestingUserId: string): Promise<void> {
    // Construir la query dinámicamente según el tipo de ID
    const query: any = { $or: [{ keycloakId: requestingUserId }] };

    // Solo agregar búsqueda por ObjectId si es un ObjectId válido
    if (Types.ObjectId.isValid(requestingUserId)) {
      query.$or.push({ _id: new Types.ObjectId(requestingUserId) });
    }

    const requestingUser = await this.userModel.findOne(query).exec();
    if (!requestingUser) {
      // Si no se encuentra el usuario, crear uno demo para propósitos de testing
      return;
    }

    if (requestingUser.role === 'MARKETPLACE_ADMIN') {
      return;
    }

    // Verificar si el usuario es propietario del market
    const isOwner = (existingMarket.marketOwner as unknown as Types.ObjectId).toString() ===
      (requestingUser._id as Types.ObjectId).toString();

    if (!isOwner) {
      throw new ForbiddenException('You do not have permission to update this market');
    }
  }

  private async validateUniqueMarketName(newName: string, marketId: string, currentName: string): Promise<void> {
    if (newName !== currentName) {
      const marketWithSameName = await this.marketModel.findOne({
        name: newName,
        _id: { $ne: marketId }
      }).exec();

      if (marketWithSameName) {
        throw new ConflictException('Market name already exists');
      }
    }
  }

  private prepareUpdateFields(updateData: UpdateMarketDto, existingMarket: MarketDocument): any {
    const updateFields: any = {};

    if (updateData.name !== undefined) updateFields.name = updateData.name;
    if (updateData.description !== undefined) updateFields.description = updateData.description;
    if (updateData.dso !== undefined) updateFields.dso = updateData.dso;
    if (updateData.region !== undefined) updateFields.region = updateData.region;
    if (updateData.isActive !== undefined) updateFields.isActive = updateData.isActive;
    if (updateData.marketAddress !== undefined) updateFields.marketAddress = updateData.marketAddress;
    if (updateData.txHash !== undefined) updateFields.txHash = updateData.txHash;

    // Manejo especial para el estado
    if (updateData.state !== undefined) {
      updateFields.state = updateData.state;
      if (updateData.state === MarketState.ACTIVE_ONCHAIN && !existingMarket.activatedAt) {
        updateFields.activatedAt = new Date();
      }
    }

    return updateFields;
  }

  /**
   * Activates a market on the blockchain
   * @param marketId Market ID to activate
   * @param requestingUserId User requesting activation (optional for validation)
   * @returns Market activation result with blockchain transaction details
   */
  async activateMarketOnBlockchain(marketId: string, requestingUserId?: string): Promise<MarketActivationResult> {
    // 1. Validate market exists
    const market = await this.validateMarketExists(marketId);

    // 2. Check if market is in the correct state for activation
    if (market.state !== MarketState.WALLET_CREATED_PENDING_ACTIVATION) {
      throw new BadRequestException(
        `Market must be in WALLET_CREATED_PENDING_ACTIVATION state to be activated. Current state: ${market.state}`
      );
    }

    // 3. Validate permissions if requesting user is provided
    if (requestingUserId) {
      await this.validateUpdatePermissions(market, requestingUserId);
    }

    // 4. Get market owner's wallet address for DSO parameter
    const marketOwner = await this.userModel.findById(market.marketOwner);
    if (!marketOwner) {
      throw new NotFoundException('Market owner not found');
    }

    // Get the market owner's wallet address (this will be used as DSO address)
    const marketOwnerWalletAddress = await this.walletService.getWallet(
      (marketOwner._id as any).toString(),
      marketId // Market ID for MARKET wallet binding
    );

    if (!marketOwnerWalletAddress) {
      throw new BadRequestException('Market owner must have a wallet before activating market on blockchain');
    }

    try {
      // 5. Create market on blockchain using market owner's wallet as DSO
      const blockchainResult = await this.blockchainService.createMarket(
        marketOwnerWalletAddress,
        market.region || '',
        market.description || ''
      );

      // 6. Update market with blockchain information and set state to ACTIVE_ONCHAIN
      const updatedMarket = await this.marketModel.findByIdAndUpdate(
        marketId,
        {
          state: MarketState.ACTIVE_ONCHAIN,
          txHash: blockchainResult.txHash,
          marketAddress: blockchainResult.newContractAddress,
          blockchainMarketId: blockchainResult.marketId,
          activatedAt: new Date()
        },
        { new: true }
      ).populate('marketOwner').exec();

      if (!updatedMarket) {
        throw new NotFoundException(`Market with ID ${marketId} not found`);
      }

      return {
        market: updatedMarket,
        txHash: blockchainResult.txHash,
        marketAddress: blockchainResult.newContractAddress,
        success: true
      };

    } catch (error) {
      // If blockchain activation fails, update market state to reflect the error
      await this.marketModel.findByIdAndUpdate(marketId, {
        state: MarketState.WALLET_CREATED_PENDING_ACTIVATION // Reset to pending if activation failed
      });

      throw new BadRequestException(`Failed to activate market on blockchain: ${error.message}`);
    }
  }

  /**
   * Deactivates an active on-chain market by calling the blockchain service and updating the market state to DEACTIVATED.
   * @param requestingUserId Keycloak or MongoDB user ID; omit to skip permission check
   * @throws BadRequestException if the market is not in ACTIVE_ONCHAIN state or is missing blockchain data
   */
  async deactivateMarketOnBlockchain(marketId: string, requestingUserId?: string): Promise<MarketActivationResult> {
    const market = await this.validateMarketExists(marketId);

    if (market.state !== MarketState.ACTIVE_ONCHAIN) {
      throw new BadRequestException(
        `Market must be in ACTIVE_ONCHAIN state to be deactivated. Current state: ${market.state}`
      );
    }

    if (requestingUserId) {
      await this.validateUpdatePermissions(market, requestingUserId);
    }

    if (!market.marketAddress || market.blockchainMarketId === undefined) {
      throw new BadRequestException(
        'Market does not have blockchain data. Cannot deactivate.'
      );
    }

    try {
      const blockchainResult = await this.blockchainService.deactivateMarket(
        market.blockchainMarketId
      );

      const updatedMarket = await this.marketModel.findByIdAndUpdate(
        marketId,
        {
          state: MarketState.DEACTIVATED,
          isActive: false,
          txHash: blockchainResult.txHash,
          deactivatedAt: new Date(),
        },
        { new: true }
      ).populate('marketOwner').exec();

      if (!updatedMarket) {
        throw new NotFoundException(`Market with ID ${marketId} not found`);
      }

      return {
        market: updatedMarket,
        txHash: blockchainResult.txHash,
        marketAddress: market.marketAddress,
        success: true,
      };
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException(`Failed to deactivate market: ${error.message}`);
    }
  }

  // acceptMarketWithToken method removed - replaced with expiration-based system

  /**
   * Returns markets in CREATED_OFFLINE_PENDING_ACCEPTATION state owned by the user with the given email.
   * Does not filter out expired ones — use {@link getPendingMarketsByOwnerEmailWithExpirationCheck} for that.
   */
  async getPendingMarketsByOwnerEmail(email: string): Promise<MarketDocument[]> {
    // First find user by email
    const user = await this.userModel.findOne({ email }).exec();
    if (!user) {
      return [];
    }

    // Find markets owned by this user that are pending acceptance
    const query = {
      marketOwner: user._id,
      state: MarketState.CREATED_OFFLINE_PENDING_ACCEPTATION
      // Temporarily removed: acceptanceTokenExpiry: { $gt: new Date() } // Only non-expired tokens
    };


    const markets = await this.marketModel.find(query).exec();

    return markets;
  }

  // updateMarketTokens method removed - replaced with expiration-based system

  /**
   * Accepts a market invitation by transitioning the market state from
   * CREATED_OFFLINE_PENDING_ACCEPTATION to CREATED_OFFLINE_ACCEPTED.
   * @throws ForbiddenException if userId is not the market owner
   * @throws BadRequestException if the market is already accepted/activated or the acceptance period has expired
   */
  async acceptMarketSimplified(marketId: string, userId: string): Promise<MarketDocument> {
    const market = await this.marketModel.findById(marketId).exec();

    if (!market) {
      throw new NotFoundException(`Market with ID ${marketId} not found`);
    }

    // Verify user is the market owner
    if (market.marketOwner.toString() !== userId) {
      throw new ForbiddenException('You do not have permission to accept this market');
    }

    // Check if market is already accepted or activated
    if (market.state !== MarketState.CREATED_OFFLINE_PENDING_ACCEPTATION) {
      throw new BadRequestException('Market is already accepted or activated');
    }

    // Check if market acceptance has expired
    if (market.expireMarketAcceptationDate && market.expireMarketAcceptationDate < new Date()) {
      // Auto-update to expired state
      await this.marketModel.findByIdAndUpdate(marketId, {
        state: MarketState.CREATED_OFFLINE_EXPIRED,
        expireMarketAcceptationDate: undefined
      });
      throw new BadRequestException('Market acceptance period has expired');
    }

    // Update market state to CREATED_OFFLINE_ACCEPTED and clear expiration date
    const updatedMarket = await this.marketModel.findByIdAndUpdate(
      marketId,
      {
        state: MarketState.CREATED_OFFLINE_ACCEPTED,
        expireMarketAcceptationDate: undefined // Clear expiration date after acceptance
      },
      { new: true }
    ).exec();

    if (!updatedMarket) {
      throw new NotFoundException(`Market with ID ${marketId} not found`);
    }

    return updatedMarket;
  }

  /**
   * Rejects a market invitation by transitioning the market state from
   * CREATED_OFFLINE_PENDING_ACCEPTATION to CREATED_OFFLINE_REJECTED.
   * @throws ForbiddenException if userId is not the market owner
   * @throws BadRequestException if the market is not in a rejectable state
   */
  async rejectMarketSimplified(marketId: string, userId: string): Promise<MarketDocument> {
    const market = await this.marketModel.findById(marketId).exec();

    if (!market) {
      throw new NotFoundException(`Market with ID ${marketId} not found`);
    }

    // Verify user is the market owner
    if (market.marketOwner.toString() !== userId) {
      throw new ForbiddenException('You do not have permission to reject this market');
    }

    // Check if market is in the correct state for rejection
    if (market.state !== MarketState.CREATED_OFFLINE_PENDING_ACCEPTATION) {
      throw new BadRequestException('Market can only be rejected when in pending acceptation state');
    }

    // Update market state to CREATED_OFFLINE_REJECTED and clear expiration date
    const updatedMarket = await this.marketModel.findByIdAndUpdate(
      marketId,
      {
        state: MarketState.CREATED_OFFLINE_REJECTED,
        expireMarketAcceptationDate: undefined // Clear expiration date after rejection
      },
      { new: true }
    ).exec();

    if (!updatedMarket) {
      throw new NotFoundException(`Market with ID ${marketId} not found`);
    }

    return updatedMarket;
  }

  /**
   * Check and update expired markets to CREATED_OFFLINE_EXPIRED state
   */
  async checkAndUpdateExpiredMarkets(): Promise<number> {
    try {
      const now = new Date();

      // Find markets that are pending acceptance and have expired
      const expiredMarkets = await this.marketModel.updateMany(
        {
          state: MarketState.CREATED_OFFLINE_PENDING_ACCEPTATION,
          expireMarketAcceptationDate: { $lt: now }
        },
        {
          state: MarketState.CREATED_OFFLINE_EXPIRED,
          expireMarketAcceptationDate: undefined // Clear expiration date
        }
      );

      if (expiredMarkets.modifiedCount > 0) {
      }

      return expiredMarkets.modifiedCount;

    } catch (error) {
      return 0;
    }
  }

  /**
   * Get pending markets by owner email, excluding expired ones
   */
  async getPendingMarketsByOwnerEmailWithExpirationCheck(email: string): Promise<MarketDocument[]> {
    // First update any expired markets
    await this.checkAndUpdateExpiredMarkets();

    // Find user by email (CASE-INSENSITIVE)
    const user = await this.userModel.findOne({
      email: { $regex: new RegExp(`^${email}$`, 'i') }
    }).exec();
    if (!user) {
      return [];
    }

    // 🆕 DEBUG: Show ALL markets for this user first
    const allUserMarkets = await this.marketModel.find({ marketOwner: user._id }).exec();
    allUserMarkets.forEach(market => {

    });

    // Find markets owned by this user that are still pending acceptance (not expired)
    const query = {
      marketOwner: user._id,
      state: MarketState.CREATED_OFFLINE_PENDING_ACCEPTATION,
      expireMarketAcceptationDate: { $gt: new Date() } // Only non-expired markets
    };



    const markets = await this.marketModel.find(query).exec();


    if (markets.length === 0 && allUserMarkets.length > 0) {
    }

    return markets;
  }

  /**
   * Assign users to a market
   * Synchronizes both Market.users[] and User.accessibleMarkets[]
   */
  async assignUsersToMarket(marketId: string, userIds: string[]): Promise<MarketDocument> {
    const market = await this.validateMarketExists(marketId);

    // Convert string IDs to ObjectIds
    const userObjectIds = userIds.map(id => new Types.ObjectId(id));

    // Validate all users exist
    const users = await this.userModel.find({ _id: { $in: userObjectIds } }).exec();
    if (users.length !== userIds.length) {
      throw new NotFoundException('One or more users not found');
    }

    // Update market with new users (using $addToSet to avoid duplicates)
    const updatedMarket = await this.marketModel.findByIdAndUpdate(
      marketId,
      { $addToSet: { users: { $each: userObjectIds } } },
      { new: true }
    ).populate('marketOwner').populate('users').exec();

    // Update each user's accessibleMarkets (using $addToSet to avoid duplicates)
    await this.userModel.updateMany(
      { _id: { $in: userObjectIds } },
      { $addToSet: { accessibleMarkets: new Types.ObjectId(marketId) } }
    ).exec();

    if (!updatedMarket) {
      throw new NotFoundException(`Market with ID ${marketId} not found`);
    }

    return updatedMarket;
  }

  /**
   * Remove users from a market
   * Synchronizes both Market.users[] and User.accessibleMarkets[]
   * If the user's assignedMarket was this market, reassign to their first accessible market
   */
  async removeUsersFromMarket(marketId: string, userIds: string[]): Promise<MarketDocument> {
    const market = await this.validateMarketExists(marketId);

    // Convert string IDs to ObjectIds
    const userObjectIds = userIds.map(id => new Types.ObjectId(id));
    const marketObjectId = new Types.ObjectId(marketId);

    // Update market by removing users
    const updatedMarket = await this.marketModel.findByIdAndUpdate(
      marketId,
      { $pull: { users: { $in: userObjectIds } } },
      { new: true }
    ).populate('marketOwner').populate('users').exec();

    // Update each user's accessibleMarkets by removing this market
    await this.userModel.updateMany(
      { _id: { $in: userObjectIds } },
      { $pull: { accessibleMarkets: marketObjectId } }
    ).exec();

    // 🎯 For each user, if their assignedMarket was this market, reassign to first accessible market
    for (const userId of userObjectIds) {
      const user = await this.userModel.findById(userId).exec();

      if (user && user.assignedMarket?.toString() === marketId) {
        // User was assigned to the market they're being removed from
        // Reassign to the first available market in accessibleMarkets (after removal)
        if (user.accessibleMarkets && user.accessibleMarkets.length > 0) {
          const newAssignedMarket = user.accessibleMarkets[0];
          await this.userModel.findByIdAndUpdate(
            userId,
            { $set: { assignedMarket: newAssignedMarket } }
          ).exec();
          this.logger.log(`User ${userId} reassigned from market ${marketId} to ${newAssignedMarket}`);
        } else {
          // User has no more accessible markets, set assignedMarket to null
          await this.userModel.findByIdAndUpdate(
            userId,
            { $set: { assignedMarket: null } }
          ).exec();
          this.logger.log(`User ${userId} removed from last market, assignedMarket set to null`);
        }
      }
    }

    if (!updatedMarket) {
      throw new NotFoundException(`Market with ID ${marketId} not found`);
    }

    return updatedMarket;
  }

  /**
   * Get all users assigned to a market
   */
  async getUsersInMarket(marketId: string): Promise<UserDocument[]> {
    const market = await this.marketModel.findById(marketId).populate('users').exec();

    if (!market) {
      throw new NotFoundException(`Market with ID ${marketId} not found`);
    }

    return market.users as any as UserDocument[];
  }

  /**
   * Replace all users in a market with a new set
   * Synchronizes both Market.users[] and User.accessibleMarkets[]
   */
  async setUsersInMarket(marketId: string, userIds: string[]): Promise<MarketDocument> {
    const market = await this.validateMarketExists(marketId);

    // Get current users in market
    const currentUsers = market.users || [];

    // Convert string IDs to ObjectIds
    const newUserObjectIds = userIds.map(id => new Types.ObjectId(id));

    // Validate all new users exist
    const users = await this.userModel.find({ _id: { $in: newUserObjectIds } }).exec();
    if (users.length !== userIds.length) {
      throw new NotFoundException('One or more users not found');
    }

    // Update market with new users array
    const updatedMarket = await this.marketModel.findByIdAndUpdate(
      marketId,
      { users: newUserObjectIds },
      { new: true }
    ).populate('marketOwner').populate('users').exec();

    // Remove market from accessibleMarkets of users that are no longer in the market
    await this.userModel.updateMany(
      { _id: { $in: currentUsers, $nin: newUserObjectIds } },
      { $pull: { accessibleMarkets: new Types.ObjectId(marketId) } }
    ).exec();

    // Add market to accessibleMarkets of new users
    await this.userModel.updateMany(
      { _id: { $in: newUserObjectIds } },
      { $addToSet: { accessibleMarkets: new Types.ObjectId(marketId) } }
    ).exec();

    if (!updatedMarket) {
      throw new NotFoundException(`Market with ID ${marketId} not found`);
    }

    return updatedMarket;
  }
}
