import { Injectable, ConflictException, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../../schemas/User.schema';
import { Market, MarketDocument, MarketState } from '../../schemas/Market.schema';
import { KeycloakAdminService } from '../tenant/services/keycloak-admin.service';
import { log } from 'node:console';
import { Session } from 'node:inspector/promises';
import { SessionDocument } from 'src/schemas/Session.schema';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Market.name) private marketModel: Model<MarketDocument>,
    @InjectModel(Session.name) private sessionModel: Model<SessionDocument>,
    private readonly keycloakAdmin: KeycloakAdminService,
  ) { }

  /** Finds a user by their Keycloak UUID; throws NotFoundException if not found. */
  async getUserByKeycloakId(keycloakId: string): Promise<UserDocument> {
    const user = await this.userModel.findOne({ keycloakId });
    if (!user) throw new NotFoundException();
    return user;
  }

  /**
   * Resolves a user from a wallet address; searches the user's own address first,
   * then falls back to the market owner address.
   * @throws NotFoundException if no user is associated with the address.
   */
  async getUserByWalletAddress(publicAddress: string): Promise<UserDocument> {
    const addressRegex = new RegExp(`^${publicAddress}$`, 'i');

    const userBySelf = await this.userModel.findOne({
      publicAddress: { $regex: addressRegex }
    });
    if (userBySelf) return userBySelf;

    const market = await this.marketModel.findOne({
      publicAddress: { $regex: addressRegex }
    });

    this.logger.debug(`Market found by address: ${market?._id ?? 'null'}`);

    if (market) {
      const userByMarket = await this.userModel.findOne({
        assignedMarket: market._id
      });
      if (userByMarket) return userByMarket;
    }

    throw new NotFoundException(`No user found for wallet address ${publicAddress}`);
  }

  /**
   * Returns a human-readable label for a session-related address (contract, FMO wallet, or FRP wallet).
   * @returns Label string, or null if no matching session is found.
   */
  async getSessionLabelByAddress(address: string): Promise<string | null> {
    const addressRegex = new RegExp(`^${address}$`, 'i');

    const session = await this.sessionModel.findOne({
      $or: [
        { contractAddress: { $regex: addressRegex } },
        { fmoLmoAddress: { $regex: addressRegex } },
        { frpAddress: { $regex: addressRegex } }
      ]
    });

    if (!session) return null;

    if (session.contractAddress?.match(addressRegex)) {
      return `Session: ${session.name}`;
    }
    if (session.fmoLmoAddress?.match(addressRegex)) {
      return `FMO Wallet (${session.name})`;
    }
    if (session.frpAddress?.match(addressRegex)) {
      return `FRP Wallet (${session.name})`;
    }

    return `Session: ${session.name}`;
  }

  /** Finds a user by MongoDB ID; throws NotFoundException if not found. */
  async findById(userId: string): Promise<UserDocument> {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }
    return user;
  }

  /**
   * Ensures a user does not already own an active market.
   * @throws ConflictException if the user already owns an active market.
   */
  async validateMarketOwnerEligibility(userId: string): Promise<void> {
    const existingOwnership = await this.marketModel.findOne({
      marketOwner: userId,
      state: { $in: [MarketState.WALLET_CREATED_PENDING_ACTIVATION, MarketState.ACTIVE_ONCHAIN] },
      isActive: true
    });

    if (existingOwnership) {
      throw new ConflictException('User already owns an active market');
    }
  }

  /** Clears the temporary-password flag and marks first login as completed for a market owner. */
  async assignMarketOwnerRole(userId: string, marketId: string): Promise<void> {
    await this.userModel.findByIdAndUpdate(userId, {
      $set: {
        temporaryPassword: false,
        firstLoginCompleted: true
      }
    });
  }

  /** Returns whether the user identified by email owns an active market, along with its name and state. */
  async checkMarketOwnership(email: string): Promise<{
    hasActiveMarket: boolean;
    marketName?: string;
    marketState?: MarketState;
  }> {
    const user = await this.userModel.findOne({ email });
    if (!user) {
      return { hasActiveMarket: false };
    }

    const activeMarket = await this.marketModel.findOne({
      marketOwner: user._id,
      state: { $in: [MarketState.WALLET_CREATED_PENDING_ACTIVATION, MarketState.ACTIVE_ONCHAIN] },
      isActive: true
    });

    if (activeMarket) {
      return {
        hasActiveMarket: true,
        marketName: activeMarket.name,
        marketState: activeMarket.state
      };
    }

    return { hasActiveMarket: false };
  }

  /** Finds a user by email address; returns null if not found. */
  async findUserByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ email }).exec();
  }

  /**
   * Get all users (with optional role filter)
   */
  async getAllUsers(role?: string): Promise<UserDocument[]> {
    const query = role ? { role } : {};
    const users = await this.userModel.find(query).populate('wallet').select('-encryptedPinHash -privateKeyEncrypted -personalPinHash -commonSecretEncrypted').lean().exec();

    // Log to verify what MongoDB actually returns
    if (!role) {
      const roleCount = users.reduce((acc: any, user: any) => {
        acc[user.role || 'undefined'] = (acc[user.role || 'undefined'] || 0) + 1;
        return acc;
      }, {});
    }

    return users as any;
  }

  /**
   * Get users by IDs
   */
  async getUsersByIds(userIds: string[]): Promise<UserDocument[]> {
    return this.userModel.find({ _id: { $in: userIds } }).exec();
  }

  /**
   * Delete a user safely from database.
   * - Prevent deletion if user owns any market
   * - Remove user from Market.users arrays
   * - Clear FRP assignment if the user is set as FRP
   */
  async deleteUser(userId: string): Promise<void> {
    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    // Prevent deleting a market owner (to avoid orphan markets)
    const ownsMarkets = await this.marketModel.countDocuments({ marketOwner: user._id }).exec();
    if (ownsMarkets > 0) {
      throw new ConflictException('Cannot delete a user who owns one or more markets');
    }

    // Remove from Market.users arrays
    await this.marketModel.updateMany(
      { users: user._id },
      { $pull: { users: user._id } }
    ).exec();

    // Clear FRP assignment where applicable
    await this.marketModel.updateMany(
      { frp: user._id },
      { $set: { frp: null } }
    ).exec();

    // Delete Keycloak account
    if (user.keycloakId) {
      await this.keycloakAdmin.deleteUserAccount(user.keycloakId).catch(err => {
        // If Keycloak deletion fails, stop the process to avoid inconsistency
        throw new ConflictException(`Failed to delete user in Keycloak: ${err?.message || 'Unknown error'}`);
      });
    }

    // Finally delete the user document
    await this.userModel.findByIdAndDelete(userId).exec();
  }

  /**
   * Authorized deletion that allows MARKETPLACE_ADMIN to delete any user and
   * FMO_LMO to delete users assigned to markets they own.
   */
  async deleteUserAuthorized(requesterKeycloakId: string | undefined, userRoles: string[], targetUserId: string): Promise<void> {
    // Normalize roles to handle realm: prefix and case differences
    const normalizedRoles = (userRoles || []).map(r => r?.toString().replace(/^realm:/i, '').toUpperCase());
    // Admin can delete any user
    const isAdmin = normalizedRoles.includes('MARKETPLACE_ADMIN');
    if (!isAdmin) {
      if (!requesterKeycloakId) {
        throw new ForbiddenException('Missing requester identity');
      }

      const requester = await this.userModel.findOne({ keycloakId: requesterKeycloakId }).exec();
      if (!requester) {
        throw new ForbiddenException('Requester not found');
      }

      // Collect all markets owned by requester
      const ownedMarkets = await this.marketModel
        .find({ marketOwner: requester._id })
        .select('_id')
        .lean()
        .exec();
      const ownedMarketIds = ownedMarkets.map((m: any) => m._id);

      if (!ownedMarketIds.length) {
        throw new ForbiddenException('Only market owners can delete users from their own markets');
      }

      // Check if target user is directly part of any owned market (users[] or frp)
      const hasDirectMembership = await this.marketModel.exists({
        _id: { $in: ownedMarketIds },
        $or: [
          { users: targetUserId },
          { frp: targetUserId }
        ]
      });

      let isAuthorized = !!hasDirectMembership;

      // Fallback: check if the target user's accessibleMarkets includes any owned market
      if (!isAuthorized) {
        const userHasAccessToOwned = await this.userModel.exists({
          _id: targetUserId,
          accessibleMarkets: { $in: ownedMarketIds }
        });
        isAuthorized = !!userHasAccessToOwned;
      }

      if (!isAuthorized) {
        throw new ForbiddenException('Only market owners can delete users related to their markets');
      }
    }

    // Perform safe deletion
    await this.deleteUser(targetUserId);
  }
}
