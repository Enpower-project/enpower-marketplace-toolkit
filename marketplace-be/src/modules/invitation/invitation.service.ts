import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  Logger
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Invitation, InvitationDocument, InvitationStatus } from '../../schemas/Invitation.schema';
import { User, UserDocument, UserRole } from '../../schemas/User.schema';
import { Market, MarketDocument } from '../../schemas/Market.schema';
import { SendInvitationDto } from './dto/send-invitation.dto';
import { InvitationResponseDto, InvitationDetailsDto } from './dto/invitation-response.dto';
import { v4 as uuidv4 } from 'uuid';
import { I18nService } from 'nestjs-i18n';
import { EmailService, UserInvitationData } from '../email/email.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class InvitationService {
  private readonly logger = new Logger(InvitationService.name);

  constructor(
    @InjectModel(Invitation.name)
    private invitationModel: Model<InvitationDocument>,
    @InjectModel(User.name)
    private userModel: Model<UserDocument>,
    @InjectModel(Market.name)
    private marketModel: Model<MarketDocument>,
    private readonly i18n: I18nService,
    private readonly emailService: EmailService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Send an invitation to a user
   * Validates:
   * - Market exists and inviter is the market owner or has market_crud role
   * - Role is FRP or FSP
   * - If FRP, only one FRP per market is allowed
   * - User email is not already registered
   * - No pending invitation exists for this email and market
   */
  async sendInvitation(
    sendInvitationDto: SendInvitationDto,
    inviterId: string,
    language: string = 'en',
    userRoles: string[] = []
  ): Promise<InvitationResponseDto> {
    const { email, role, marketId } = sendInvitationDto;

    // Debug logging
    this.logger.debug(`sendInvitation called with: email=${email}, role=${role}, marketId=${marketId}, type=${typeof marketId}`);

    // Validate role is FRP or FSP
    if (role !== UserRole.FRP && role !== UserRole.FSP) {
      throw new BadRequestException(
        await this.i18n.translate('invitation.errors.invalidRole', {
          lang: language
        })
      );
    }

    // Validate marketId format
    if (!marketId || !Types.ObjectId.isValid(marketId)) {
      throw new BadRequestException(
        `Invalid marketId format: ${marketId}`
      );
    }

    // Check if market exists
    const market = await this.marketModel.findById(marketId).populate('marketOwner');
    if (!market) {
      throw new NotFoundException(
        await this.i18n.translate('invitation.errors.marketNotFound', {
          lang: language
        })
      );
    }

    // Resolve inviter by Keycloak ID and check ownership/permissions
    const marketOwner = market.marketOwner as any;
    const inviterByKeycloak = await this.userModel.findOne({ keycloakId: inviterId });
    const isMarketOwner = inviterByKeycloak
      ? marketOwner._id.toString() === (inviterByKeycloak._id as Types.ObjectId).toString()
      : false;
    const hasMarketCrudRole = userRoles.includes('market_crud') || userRoles.includes('MARKETPLACE_ADMIN');

    this.logger.debug(`Authorization check - isMarketOwner: ${isMarketOwner}, hasMarketCrudRole: ${hasMarketCrudRole}, userRoles: ${JSON.stringify(userRoles)}`);

    if (!isMarketOwner && !hasMarketCrudRole) {
      throw new ForbiddenException(
        await this.i18n.translate('invitation.errors.notMarketOwner', {
          lang: language
        })
      );
    }

    // If role is FRP, check if market already has an FRP
    if (role === UserRole.FRP) {
      await this.validateFRPUniqueness(marketId, language);
    }

    // Check if user already has access to this specific market
    const existingUser = await this.userModel.findOne({ email });
    if (existingUser) {
      // Check if user already has access to this market
      const hasMarketAccess = existingUser.accessibleMarkets.some(
        marketObjId => marketObjId.toString() === marketId
      );

      if (hasMarketAccess) {
        throw new ConflictException(
          await this.i18n.translate('invitation.errors.userAlreadyHasMarketAccess', {
            lang: language,
            args: { email, marketName: market.name }
          })
        );
      }

      this.logger.log(`✅ User ${email} exists but doesn't have access to market ${marketId}. Invitation will grant access.`);
    }

    // Check if there's already a pending invitation for this specific email and market
    const existingInvitation = await this.invitationModel.findOne({
      email,
      marketId: new Types.ObjectId(marketId),
      status: InvitationStatus.PENDING,
      expiresAt: { $gt: new Date() }
    });

    if (existingInvitation) {
      throw new ConflictException(
        await this.i18n.translate('invitation.errors.pendingInvitationExists', {
          lang: language,
          args: { email, marketName: market.name }
        })
      );
    }

    // Try to get inviter's MongoDB user ID from Keycloak ID
    // If inviter doesn't exist in MongoDB (e.g., superadmin), we'll store the market owner's ID instead
    let inviterMongoId: Types.ObjectId;
    const inviterUser = inviterByKeycloak || await this.userModel.findOne({ keycloakId: inviterId });

    if (inviterUser) {
      inviterMongoId = inviterUser._id as Types.ObjectId;
    } else {
      // If inviter is not in MongoDB (e.g., superadmin), use the market owner's ID
      inviterMongoId = marketOwner._id as Types.ObjectId;
    }

    // Create invitation
    const invitationToken = uuidv4();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiration

    const invitation = new this.invitationModel({
      email,
      role,
      marketId: new Types.ObjectId(marketId),
      invitedBy: inviterMongoId,
      invitationToken,
      status: InvitationStatus.PENDING,
      expiresAt
    });

    await invitation.save();

    this.logger.log(
      `Invitation created for ${email} with role ${role} for market ${marketId}`
    );

    // Send invitation email
    const frontendUrl = this.configService.get<string>('FRONTEND_URL') /* || 'http://localhost:4200' */;
    const invitationLink = `${frontendUrl}/accept-invitation/${invitationToken}`;

    

    // Find inviter by keycloakId (not _id, since inviterId is a Keycloak UUID)
    const inviter = await this.userModel.findOne({ keycloakId: inviterId });
    const inviterName = inviter
      ? `${inviter.firstName || ''} ${inviter.lastName || ''}`.trim() || inviter.username
      : 'Market Owner';

    const emailData: UserInvitationData = {
      email,
      inviterName,
      marketName: market.name,
      role,
      invitationLink,
      expiresAt,
      language: 'en' // Force English for invitation emails
    };

    try {
      await this.emailService.sendUserInvitation(emailData);
      this.logger.log(`Invitation email sent to ${email}`);
    } catch (error) {
      this.logger.error(`Failed to send invitation email to ${email}:`, error);
      // Continue even if email fails - invitation is still created
    }

    return this.mapToResponseDto(invitation, market);
  }

  /**
   * Validate that market doesn't already have an FRP
   */
  async validateFRPUniqueness(marketId: string, language: string = 'en'): Promise<void> {
    // Check if market already has an FRP assigned
    const market = await this.marketModel.findById(marketId).populate('frp');

    if (market?.frp) {
      const frpUser = market.frp as any;
      throw new ConflictException(
        await this.i18n.translate('invitation.errors.frpAlreadyExists', {
          lang: language,
          args: { email: frpUser.email || 'existing user' }
        })
      );
    }

    // Check if there's a pending FRP invitation
    const pendingFRPInvitation = await this.invitationModel.findOne({
      marketId: new Types.ObjectId(marketId),
      role: UserRole.FRP,
      status: InvitationStatus.PENDING,
      expiresAt: { $gt: new Date() }
    });

    if (pendingFRPInvitation) {
      throw new ConflictException(
        await this.i18n.translate('invitation.errors.pendingFRPInvitation', {
          lang: language,
          args: { email: pendingFRPInvitation.email }
        })
      );
    }
  }

  /**
   * Check if market has FRP assigned
   */
  async checkMarketHasFRP(marketId: string): Promise<{ hasFRP: boolean; email?: string }> {
    const market = await this.marketModel.findById(marketId).populate('frp');

    if (market?.frp) {
      const frpUser = market.frp as any;
      return {
        hasFRP: true,
        email: frpUser.email
      };
    }

    // Also check for pending FRP invitations
    const pendingFRPInvitation = await this.invitationModel.findOne({
      marketId: new Types.ObjectId(marketId),
      role: UserRole.FRP,
      status: InvitationStatus.PENDING,
      expiresAt: { $gt: new Date() }
    });

    if (pendingFRPInvitation) {
      return {
        hasFRP: true,
        email: pendingFRPInvitation.email
      };
    }

    return { hasFRP: false };
  }

  /**
   * Get invitation details by token (public endpoint for accepting invitations)
   */
  async getInvitationByToken(
    token: string,
    language: string = 'en'
  ): Promise<InvitationDetailsDto> {
    const invitation = await this.invitationModel
      .findOne({ invitationToken: token })
      .populate('marketId')
      .populate('invitedBy');

    if (!invitation) {
      throw new NotFoundException(
        await this.i18n.translate('invitation.errors.invitationNotFound', {
          lang: language
        })
      );
    }

    const market = invitation.marketId as any;
    const inviter = invitation.invitedBy as any;

    const isExpired = invitation.expiresAt < new Date();
    const isValid =
      invitation.status === InvitationStatus.PENDING && !isExpired;

    // Check if user already exists
    const existingUser = await this.userModel.findOne({ email: invitation.email });
    const userExists = !!existingUser;
    let existingUsername: string | undefined;

    if (existingUser) {
      existingUsername = existingUser.username;
    }

    return {
      email: invitation.email,
      role: invitation.role,
      marketId: market._id.toString(),
      marketName: market.name,
      invitedBy: inviter._id.toString(),
      invitedByName: `${inviter.firstName || ''} ${inviter.lastName || ''}`.trim() || inviter.username,
      expiresAt: invitation.expiresAt,
      isExpired,
      isValid,
      userExists,
      existingUsername
    };
  }

  /**
   * Get all invitations for a market (market owner only)
   */
  async getMarketInvitations(
    marketId: string,
    userId: string,
    language: string = 'en'
  ): Promise<InvitationResponseDto[]> {
    // Verify user is market owner
    const market = await this.marketModel.findById(marketId);
    if (!market) {
      throw new NotFoundException(
        await this.i18n.translate('invitation.errors.marketNotFound', {
          lang: language
        })
      );
    }

    const marketOwner = market.marketOwner as any;
    const requester = await this.userModel.findOne({ keycloakId: userId });
    const isOwner = requester && marketOwner.toString() === (requester._id as Types.ObjectId).toString();
    if (!isOwner) {
      throw new ForbiddenException(
        await this.i18n.translate('invitation.errors.notMarketOwner', {
          lang: language
        })
      );
    }

    const invitations = await this.invitationModel
      .find({ marketId: new Types.ObjectId(marketId) })
      .populate('invitedBy')
      .sort({ createdAt: -1 });

    return invitations.map(inv => this.mapToResponseDto(inv, market));
  }

  /**
   * Revoke an invitation (market owner only)
   */
  async revokeInvitation(
    invitationId: string,
    userId: string,
    language: string = 'en'
  ): Promise<void> {
    const invitation = await this.invitationModel
      .findById(invitationId)
      .populate('marketId');

    if (!invitation) {
      throw new NotFoundException(
        await this.i18n.translate('invitation.errors.invitationNotFound', {
          lang: language
        })
      );
    }

    // Verify user is market owner
    const market = invitation.marketId as any;
    const marketOwner = market.marketOwner as any;
    const requester = await this.userModel.findOne({ keycloakId: userId });
    const isOwner = requester && marketOwner.toString() === (requester._id as Types.ObjectId).toString();
    if (!isOwner) {
      throw new ForbiddenException(
        await this.i18n.translate('invitation.errors.notMarketOwner', {
          lang: language
        })
      );
    }

    if (invitation.status !== InvitationStatus.PENDING) {
      throw new BadRequestException(
        await this.i18n.translate('invitation.errors.cannotRevokeNonPending', {
          lang: language
        })
      );
    }

    invitation.status = InvitationStatus.REVOKED;
    await invitation.save();

    this.logger.log(`Invitation ${invitationId} revoked by user ${userId}`);
  }

  /**
   * Mark invitation as accepted (called after user registration)
   */
  async markAsAccepted(
    token: string,
    userId: string
  ): Promise<void> {
    const invitation = await this.invitationModel.findOne({
      invitationToken: token
    });

    if (invitation) {
      invitation.status = InvitationStatus.ACCEPTED;
      invitation.acceptedAt = new Date();
      invitation.acceptedUserId = new Types.ObjectId(userId);
      await invitation.save();

      // If the accepted user is FRP, assign them to the market's FRP field
      if (invitation.role === UserRole.FRP) {
        await this.marketModel.findByIdAndUpdate(
          invitation.marketId,
          { frp: new Types.ObjectId(userId) }
        );
        this.logger.log(`Assigned FRP user ${userId} to market ${invitation.marketId}`);
        // Note: FRP_ROLE on Treasury will be granted when FRP creates their wallet
        // (in wallet.service.ts -> createSelfWallet)
      }
    }
  }

  /**
   * TEMPORARY: Deletes all invitation documents and drops all collection indexes.
   * Use only for maintenance; indexes are recreated automatically on the next insert.
   */
  async resetCollection(): Promise<void> {
    this.logger.warn('⚠️  Resetting invitations collection - all data will be deleted!');

    // Delete all documents
    const deleteResult = await this.invitationModel.deleteMany({});
    this.logger.log(`🗑️  Deleted ${deleteResult.deletedCount} invitations`);

    // Drop all indexes (except _id)
    try {
      await this.invitationModel.collection.dropIndexes();
      this.logger.log('✅ All indexes dropped successfully');
    } catch (error) {
      this.logger.warn(`Could not drop indexes: ${error.message}`);
    }

    this.logger.log('✅ Collection reset complete. Indexes will be recreated on next insert.');
  }

  /**
   * Check if a user (by email) already has access to a specific market
   */
  async checkUserMarketAccess(
    marketId: string,
    email: string
  ): Promise<{ hasAccess: boolean; userExists: boolean; message?: string }> {
    // Validate marketId format
    if (!marketId || !Types.ObjectId.isValid(marketId)) {
      throw new BadRequestException(`Invalid marketId format: ${marketId}`);
    }

    // Check if user exists
    const user = await this.userModel.findOne({ email });

    if (!user) {
      return {
        hasAccess: false,
        userExists: false
      };
    }

    // Check if user has access to this market
    const hasAccess = user.accessibleMarkets.some(
      marketObjId => marketObjId.toString() === marketId
    );

    return {
      hasAccess,
      userExists: true,
      message: hasAccess 
        ? `User ${email} already has access to this market`
        : `User ${email} exists but does not have access to this market`
    };
  }

  /**
   * Remove FRP from market
   * Allows market owner or admin to unassign the FRP from a market
   */
  async removeFRPFromMarket(
    marketId: string,
    userId: string,
    userRoles: string[] = [],
    language: string = 'en'
  ): Promise<{ success: boolean; message: string }> {
    // Validate marketId format
    if (!marketId || !Types.ObjectId.isValid(marketId)) {
      throw new BadRequestException(
        `Invalid marketId format: ${marketId}`
      );
    }

    // Check if market exists
    const market = await this.marketModel.findById(marketId).populate('marketOwner');
    if (!market) {
      throw new NotFoundException(
        await this.i18n.translate('invitation.errors.marketNotFound', {
          lang: language
        })
      );
    }

    // Check if user is the market owner or has market_crud role
    const marketOwner = market.marketOwner as any;
    const requester = await this.userModel.findOne({ keycloakId: userId });
    const isMarketOwner = requester ? marketOwner._id.toString() === (requester._id as Types.ObjectId).toString() : false;
    const hasMarketCrudRole = userRoles.includes('market_crud') || userRoles.includes('MARKETPLACE_ADMIN');

    this.logger.debug(`Remove FRP Authorization - isMarketOwner: ${isMarketOwner}, hasMarketCrudRole: ${hasMarketCrudRole}`);

    if (!isMarketOwner && !hasMarketCrudRole) {
      throw new ForbiddenException(
        await this.i18n.translate('invitation.errors.notMarketOwner', {
          lang: language
        })
      );
    }

    // Check if market has an FRP assigned
    if (!market.frp) {
      throw new BadRequestException(
        await this.i18n.translate('invitation.errors.noFRPAssigned', {
          lang: language
        })
      );
    }

    // Remove the FRP from the market
    await this.marketModel.findByIdAndUpdate(
      marketId,
      { frp: null }
    );

    this.logger.log(`FRP removed from market ${marketId} by user ${userId}`);

    return {
      success: true,
      message: await this.i18n.translate('invitation.success.frpRemoved', {
        lang: language
      })
    };
  }

  /**
   * Helper method to map invitation to response DTO
   */
  private mapToResponseDto(
    invitation: InvitationDocument,
    market?: MarketDocument
  ): InvitationResponseDto {
    const inviter = invitation.invitedBy as any;

    return {
      _id: (invitation._id as Types.ObjectId).toString(),
      email: invitation.email,
      role: invitation.role,
      marketId: invitation.marketId.toString(),
      marketName: market?.name,
      invitedBy: inviter?._id?.toString(),
      invitedByName: inviter
        ? `${inviter.firstName || ''} ${inviter.lastName || ''}`.trim() || inviter.username
        : undefined,
      invitationToken: invitation.invitationToken,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
      acceptedAt: invitation.acceptedAt,
      createdAt: invitation.createdAt || new Date(),
      updatedAt: invitation.updatedAt || new Date()
    };
  }
}
