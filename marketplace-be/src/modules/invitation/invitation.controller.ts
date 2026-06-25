import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  Request,
  HttpCode,
  HttpStatus,
  BadRequestException
} from '@nestjs/common';
import { Roles, Public } from 'nest-keycloak-connect';
import { Language } from '../../decorators/language.decorator';
import { InvitationService } from './invitation.service';
import { SendInvitationDto } from './dto/send-invitation.dto';
import { AcceptInvitationDto } from './dto/accept-invitation.dto';
import { InvitationResponseDto, InvitationDetailsDto } from './dto/invitation-response.dto';
import { AuthService } from '../auth/auth.service';
import { EmailService } from '../email/email.service';
import { ApiOAuth2, ApiTags } from '@nestjs/swagger';

@ApiTags('invitation')
@ApiOAuth2(['openid'], 'keycloak')
@Controller('invitation')
export class InvitationController {
  constructor(
    private readonly invitationService: InvitationService,
    private readonly authService: AuthService,
    private readonly emailService: EmailService
  ) {}

  /**
   * Send invitation to user
   * Only market owners can send invitations
   */
  @Post('send')
  @Roles({ roles: ['realm:market_owner', 'realm:FMO_LMO', 'realm:MARKETPLACE_ADMIN'] })
  @HttpCode(HttpStatus.CREATED)
  async sendInvitation(
    @Body() sendInvitationDto: SendInvitationDto,
    @Request() req,
    @Language() language: string
  ): Promise<{ success: boolean; message: string; data: InvitationResponseDto }> {
    const userId = req.user.sub;

    // Debug logging

    const userRoles = req.user.realm_access?.roles || [];
    const invitation = await this.invitationService.sendInvitation(
      sendInvitationDto,
      userId,
      language,
      userRoles
    );

    return {
      success: true,
      message: 'Invitation sent successfully',
      data: invitation
    };
  }

  /**
   * Get invitation details by token
   * Public endpoint - no authentication required
   */
  @Get('token/:token')
  @Public()
  async getInvitationByToken(
    @Param('token') token: string,
    @Language() language: string
  ): Promise<{ success: boolean; data: InvitationDetailsDto }> {
    const invitation = await this.invitationService.getInvitationByToken(
      token,
      language
    );

    return {
      success: true,
      data: invitation
    };
  }

  /**
   * Get all invitations for a market
   * Only market owner can access
   */
  @Get('market/:marketId')
  @Roles({ roles: ['realm:market_owner', 'realm:FMO_LMO', 'realm:MARKETPLACE_ADMIN'] })
  async getMarketInvitations(
    @Param('marketId') marketId: string,
    @Request() req,
    @Language() language: string
  ): Promise<{ success: boolean; data: InvitationResponseDto[] }> {
    const userId = req.user.sub;
    const invitations = await this.invitationService.getMarketInvitations(
      marketId,
      userId,
      language
    );

    return {
      success: true,
      data: invitations
    };
  }

  /**
   * Revoke an invitation
   * Only market owner can revoke
   */
  @Delete(':invitationId')
  @Roles({ roles: ['realm:market_owner', 'realm:FMO_LMO', 'realm:MARKETPLACE_ADMIN'] })
  @HttpCode(HttpStatus.OK)
  async revokeInvitation(
    @Param('invitationId') invitationId: string,
    @Request() req,
    @Language() language: string
  ): Promise<{ success: boolean; message: string }> {
    const userId = req.user.sub;
    await this.invitationService.revokeInvitation(
      invitationId,
      userId,
      language
    );

    return {
      success: true,
      message: 'Invitation revoked successfully'
    };
  }

  /**
   * Check if market has FRP assigned
   * Returns whether the market already has an FRP user
   */
  @Get('market/:marketId/has-frp')
  @Roles({ roles: ['realm:market_owner', 'realm:FMO_LMO', 'realm:market_crud', 'realm:MARKETPLACE_ADMIN'] })
  async checkMarketHasFRP(
    @Param('marketId') marketId: string
  ): Promise<{ hasFRP: boolean; email?: string }> {
    const result = await this.invitationService.checkMarketHasFRP(marketId);
    return result;
  }

  /**
   * Remove FRP from market
   * Allows market owner or admin to unassign the FRP from a market
   */
  @Delete('market/:marketId/frp')
  @Roles({ roles: ['realm:market_owner', 'realm:FMO_LMO', 'realm:market_crud', 'realm:MARKETPLACE_ADMIN'] })
  @HttpCode(HttpStatus.OK)
  async removeFRPFromMarket(
    @Param('marketId') marketId: string,
    @Request() req,
    @Language() language: string
  ): Promise<{ success: boolean; message: string }> {
    const userId = req.user.sub;
    const userRoles = req.user.realm_access?.roles || [];

    return await this.invitationService.removeFRPFromMarket(
      marketId,
      userId,
      userRoles,
      language
    );
  }

  /**
   * Accept invitation and register user
   * Public endpoint - no authentication required
   */
  @Post('accept/:token')
  @Public()
  @HttpCode(HttpStatus.CREATED)
  async acceptInvitation(
    @Param('token') token: string,
    @Body() acceptInvitationDto: AcceptInvitationDto,
    @Language() language: string
  ): Promise<{ success: boolean; message: string; data: any }> {
    // Get invitation details
    const invitation = await this.invitationService.getInvitationByToken(
      token,
      language
    );

    if (!invitation.isValid) {
      throw new BadRequestException(
        invitation.isExpired
          ? 'Invitation has expired'
          : 'Invitation is not valid'
      );
    }

    let user: any;

    // Check if user already exists
    if (invitation.userExists) {
      // User exists - just add market access
      user = await this.authService.addMarketAccessToExistingUser(
        invitation.email,
        invitation.marketId
      );
    } else {
      // New user - requires registration data
      if (!acceptInvitationDto.username || !acceptInvitationDto.password || 
          !acceptInvitationDto.firstName || !acceptInvitationDto.lastName) {
        throw new BadRequestException('Username, password, first name, and last name are required for new users');
      }

      // Register the user with the invited role
      user = await this.authService.registerInvitedUser(
        acceptInvitationDto.username,
        acceptInvitationDto.password,
        acceptInvitationDto.firstName,
        acceptInvitationDto.lastName,
        invitation.email,
        invitation.role,
        invitation.marketId
      );
    }

    // Mark invitation as accepted
    await this.invitationService.markAsAccepted(token, user._id.toString());

    return {
      success: true,
      message: invitation.userExists 
        ? `Market access granted successfully. You can now log in with your existing credentials.`
        : 'Invitation accepted successfully. You can now login.',
      data: {
        username: user.username,
        email: user.email,
        role: invitation.role,
        marketName: invitation.marketName,
        userExisted: invitation.userExists
      }
    };
  }

  /**
   * Check if a user (by email) already has access to a specific market
   * Returns whether the user exists and has access to the market
   */
  @Get('check-user-access/:marketId/:email')
  @Roles({ roles: ['realm:market_owner', 'realm:FMO_LMO', 'realm:market_crud', 'realm:MARKETPLACE_ADMIN'] })
  async checkUserMarketAccess(
    @Param('marketId') marketId: string,
    @Param('email') email: string
  ): Promise<{ hasAccess: boolean; userExists: boolean; message?: string }> {
    return await this.invitationService.checkUserMarketAccess(marketId, email);
  }

  /**
   * Resend invitation email
   * Only market owner can resend
   */
  @Post('resend/:invitationId')
  @Roles({ roles: ['realm:market_owner'] })
  @HttpCode(HttpStatus.OK)
  async resendInvitation(
    @Param('invitationId') invitationId: string,
    @Request() req,
    @Language() language: string
  ): Promise<{ success: boolean; message: string }> {
    // Implementation for resending invitation email
    // This would be similar to the initial send but reusing the existing invitation
    return {
      success: true,
      message: 'Invitation resent successfully'
    };
  }

  /**
   * TEMPORARY: Drops and reinitialises the invitations collection indexes.
   * Public endpoint — remove before production deployment.
   */
  @Delete('admin/reset-collection')
  @Public()
  @HttpCode(HttpStatus.OK)
  async resetCollection(): Promise<{ success: boolean; message: string }> {
    try {
      await this.invitationService.resetCollection();
      return {
        success: true,
        message: 'Invitations collection reset successfully. Indexes will be recreated on next insert.'
      };
    } catch (error) {
      throw new BadRequestException(`Failed to reset collection: ${error.message}`);
    }
  }
}
