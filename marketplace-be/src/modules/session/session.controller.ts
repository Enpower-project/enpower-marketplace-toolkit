import { Body, Controller, Delete, Get, HttpStatus, Logger, Param, Post, Put, BadRequestException } from '@nestjs/common';
import { SessionService } from './session.service';
import { CreateSessionDto, UpdateSessionDto, CreateHourlyBidDto, SessionResponseDto } from '../../dtos/create-session.dto';
import { Roles } from 'nest-keycloak-connect';
import { I18nService } from 'nestjs-i18n';
import { Language } from '../../decorators/language.decorator';
import { NotFoundException, ConflictException, UnprocessableEntityException } from '../../exceptions/http-exception';
import { SessionOfferReminderJob } from 'src/jobs/sessionOfferReminder.job';
import { ApiOAuth2, ApiTags } from '@nestjs/swagger';
import { Types } from 'mongoose';

@ApiTags('sessions')
@ApiOAuth2(['openid'], 'keycloak')
@Controller('sessions')
export class SessionController {
  private readonly logger = new Logger(SessionController.name);

  constructor(
    private readonly sessionService: SessionService,
    private readonly i18n: I18nService,
    private readonly reminderJob: SessionOfferReminderJob
  ) { }

  /** Triggers the session offer reminder job immediately. */
  @Post('send-offers-open-reminders')
  @Roles({ roles: ['realm:FMO_LMO'] })
  async sendOffersOpenRemindersNow() {
    await this.reminderJob.runNow();
    return { ok: true };
  }

  /** Creates a new session for the current market. */
  @Post()
  @Roles({ roles: ['realm:FRP'] })
  async createSession(
    @Body() createSessionDto: CreateSessionDto,
    @Language() lang: string
  ): Promise<{
    success: boolean;
    data: SessionResponseDto;
    message: string;
  }> {
    try {
      this.logger.log(`Creating session: ${createSessionDto.name} for date: ${createSessionDto.sessionDate}`);

      const session = await this.sessionService.createSession(createSessionDto);

      const successMessage = await this.i18n.translate('session.created.success', {
        lang,
        args: { sessionName: session.name }
      });

      return {
        success: true,
        data: session,
        message: successMessage || 'Session created successfully'
      };
    } catch (error) {
      this.logger.error(`Failed to create session: ${error.message}`, error.stack);

      if (error.name === 'SessionNotFound') {
        throw new NotFoundException('session', createSessionDto.name);
      } else if (error.name === 'SessionExists' || error.message?.includes('already exists')) {
        throw new ConflictException('session', 'sessionDate', createSessionDto.sessionDate);
      } else if (error.name === 'InvalidConfiguration' || error.message?.includes('Duplicate bid')) {
        throw new UnprocessableEntityException('session', error.message, createSessionDto);
      }
      throw error;
    }
  }

  /** Returns sessions in which the authenticated FSP has created at least one offer. */
  @Get('my-sessions')
  @Roles({ roles: ['realm:FSP'] })
  async getSessionsWithMyOffers(@Language() lang: string): Promise<{
    success: boolean;
    data: SessionResponseDto[];
    message: string;
  }> {
    try {
      this.logger.log('Fetching sessions with FSP offers');

      const sessions = await this.sessionService.getSessionsWithFSPOffers();

      const successMessage = await this.i18n.translate('session.fsp.offers.list.success', {
        lang,
        args: { count: sessions.length }
      });

      return {
        success: true,
        data: sessions,
        message: successMessage || `Retrieved ${sessions.length} sessions with your offers`
      };
    } catch (error) {
      this.logger.error(`Failed to fetch sessions with FSP offers: ${error.message}`, error.stack);
      throw error;
    }
  }

  /** Returns all sessions for the current market. */
  @Get()
  @Roles({ roles: ['realm:FMO_LMO', 'realm:dso', 'realm:FSP', 'realm:FRP'] })
  async getSessions(@Language() lang: string): Promise<{
    success: boolean;
    data: SessionResponseDto[];
    message: string;
  }> {
    try {
      this.logger.log('Fetching sessions for current market');

      const sessions = await this.sessionService.getSessionsByMarket();

      const successMessage = await this.i18n.translate('session.list.success', {
        lang,
        args: { count: sessions.length }
      });

      return {
        success: true,
        data: sessions,
        message: successMessage || `Retrieved ${sessions.length} sessions`
      };
    } catch (error) {
      this.logger.error(`Failed to fetch sessions: ${error.message}`, error.stack);
      throw error;
    }
  }

  /** Returns sessions that are in PUBLISHED status for the current market. */
  @Get('published/list')
  @Roles({ roles: ['realm:FMO_LMO', 'realm:dso', 'realm:FSP'] })
  async getPublishedSessions(@Language() lang: string): Promise<{
    success: boolean;
    data: SessionResponseDto[];
    message: string;
  }> {
    try {
      this.logger.log('Fetching published sessions for current market');

      const sessions = await this.sessionService.getPublishedSessionsByMarket();

      const successMessage = await this.i18n.translate('session.published.list.success', {
        lang,
        args: { count: sessions.length }
      });

      return {
        success: true,
        data: sessions,
        message: successMessage || `Retrieved ${sessions.length} published sessions`
      };
    } catch (error) {
      this.logger.error(`Failed to fetch published sessions: ${error.message}`, error.stack);
      throw error;
    }
  }

  /** Returns sessions with the offers period currently open (ACTIVE status). */
  @Get('active/list')
  @Roles({ roles: ['realm:FMO_LMO', 'realm:dso', 'realm:FSP'] })
  async getActiveSessions(@Language() lang: string): Promise<{
    success: boolean;
    data: SessionResponseDto[];
    message: string;
  }> {
    try {
      this.logger.log('Fetching active sessions for current market');

      const sessions = await this.sessionService.getActiveSessionsByMarket();

      const successMessage = await this.i18n.translate('session.active.list.success', {
        lang,
        args: { count: sessions.length }
      });

      return {
        success: true,
        data: sessions,
        message: successMessage || `Retrieved ${sessions.length} active sessions`
      };
    } catch (error) {
      this.logger.error(`Failed to fetch active sessions: ${error.message}`, error.stack);
      throw error;
    }
  }

  /** Returns a session by its MongoDB ObjectId or blockchain contract address. */
  @Get(':id')
  @Roles({ roles: ['realm:FMO_LMO', 'realm:FRP', 'realm:FSP'] })
  async getSessionById(
    @Param('id') sessionId: string,
  ) {
    const session = Types.ObjectId.isValid(sessionId)
      ? await this.sessionService.getSessionById(sessionId)
      : await this.sessionService.getSessionByAddress(sessionId);

    return { success: true, data: session, message: 'Session retrieved successfully' };
  }

  /** Updates a DRAFT session's metadata and bids. */
  @Put(':id')
  @Roles({ roles: ['realm:FRP', 'realm:FSP'] })
  async updateSession(
    @Param('id') sessionId: string,
    @Body() updateSessionDto: UpdateSessionDto,
    @Language() lang: string
  ): Promise<{
    success: boolean;
    data: SessionResponseDto;
    message: string;
  }> {
    try {
      this.logger.log(`Updating session: ${sessionId}`);

      const session = await this.sessionService.updateSession(sessionId, updateSessionDto);

      const successMessage = await this.i18n.translate('session.updated.success', {
        lang,
        args: { sessionName: session.name }
      });

      return {
        success: true,
        data: session,
        message: successMessage || 'Session updated successfully'
      };
    } catch (error) {
      this.logger.error(`Failed to update session ${sessionId}: ${error.message}`, error.stack);

      if (error.name === 'SessionNotFound') {
        throw new NotFoundException('session', sessionId);
      } else if (error.message?.includes('Duplicate bid')) {
        throw new UnprocessableEntityException('session', error.message, updateSessionDto);
      }
      throw error;
    }
  }

  /** Adds or updates a bid for a specific hour in a DRAFT session. */
  @Post(':id/bids')
  @Roles({ roles: ['realm:FRP'] })
  async addBidToSession(
    @Param('id') sessionId: string,
    @Body() bidDto: CreateHourlyBidDto,
    @Language() lang: string
  ): Promise<{
    success: boolean;
    data: SessionResponseDto;
    message: string;
  }> {
    try {
      this.logger.log(`Adding bid to session: ${sessionId} for hour: ${bidDto.hour}`);

      const session = await this.sessionService.addBidToSession(sessionId, bidDto);

      const successMessage = await this.i18n.translate('session.bid.added.success', {
        lang,
        args: { hour: bidDto.hour, sessionName: session.name }
      });

      return {
        success: true,
        data: session,
        message: successMessage || `Bid added successfully for hour ${bidDto.hour}`
      };
    } catch (error) {
      this.logger.error(`Failed to add bid to session ${sessionId}: ${error.message}`, error.stack);

      if (error.name === 'SessionNotFound') {
        throw new NotFoundException('session', sessionId);
      }
      throw error;
    }
  }

  /** Removes the bid for the given hour from a DRAFT session. */
  @Delete(':id/bids/:hour')
  @Roles({ roles: ['realm:FRP'] })
  async removeBidFromSession(
    @Param('id') sessionId: string,
    @Param('hour') hour: string,
    @Language() lang: string
  ): Promise<{
    success: boolean;
    data: SessionResponseDto;
    message: string;
  }> {
    try {
      const hourNumber = parseInt(hour, 10);
      if (isNaN(hourNumber) || hourNumber < 0 || hourNumber > 23) {
        throw new UnprocessableEntityException('bid', 'Hour must be a number between 0 and 23', { hour });
      }

      this.logger.log(`Removing bid from session: ${sessionId} for hour: ${hourNumber}`);

      const session = await this.sessionService.removeBidFromSession(sessionId, hourNumber);

      const successMessage = await this.i18n.translate('session.bid.removed.success', {
        lang,
        args: { hour: hourNumber, sessionName: session.name }
      });

      return {
        success: true,
        data: session,
        message: successMessage || `Bid removed successfully for hour ${hourNumber}`
      };
    } catch (error) {
      this.logger.error(`Failed to remove bid from session ${sessionId}: ${error.message}`, error.stack);

      if (error.name === 'SessionNotFound') {
        throw new NotFoundException('session', sessionId);
      }
      throw error;
    }
  }

  /** Moves a session from DRAFT to APPROVED status. */
  @Post(':id/approve')
  @Roles({ roles: ['realm:FRP'] })
  async approveSession(
    @Param('id') sessionId: string,
    @Language() lang: string
  ): Promise<{
    success: boolean;
    data: SessionResponseDto;
    message: string;
  }> {
    try {
      this.logger.log(`Approving session: ${sessionId}`);

      const session = await this.sessionService.approveSession(sessionId);

      const successMessage = await this.i18n.translate('session.approved.success', {
        lang,
        args: { sessionName: session.name }
      });

      return {
        success: true,
        data: session,
        message: successMessage || 'Session approved successfully'
      };
    } catch (error) {
      this.logger.error(`Failed to approve session ${sessionId}: ${error.message}`, error.stack);

      if (error.name === 'SessionNotFound') {
        throw new NotFoundException('session', sessionId);
      }
      throw error;
    }
  }

  /** Reverts an APPROVED session back to DRAFT status. */
  @Post(':id/revert-to-draft')
  @Roles({ roles: ['realm:FRP'] })
  async revertToDraft(
    @Param('id') sessionId: string,
    @Language() lang: string
  ): Promise<{
    success: boolean;
    data: SessionResponseDto;
    message: string;
  }> {
    try {
      this.logger.log(`Reverting session to DRAFT: ${sessionId}`);

      const session = await this.sessionService.revertToDraft(sessionId);

      const successMessage = await this.i18n.translate('session.reverted.success', {
        lang,
        args: { sessionName: session.name }
      });

      return {
        success: true,
        data: session,
        message: successMessage || 'Session reverted to DRAFT successfully'
      };
    } catch (error) {
      this.logger.error(`Failed to revert session ${sessionId}: ${error.message}`, error.stack);

      if (error.name === 'SessionNotFound') {
        throw new NotFoundException('session', sessionId);
      }
      throw error;
    }
  }

  /** Deploys the session smart contract to blockchain, moving the session to PUBLISHED status. */
  @Post(':id/publish')
  @Roles({ roles: ['realm:FMO_LMO'] })
  async publishSession(
    @Param('id') sessionId: string,
    @Language() lang: string
  ): Promise<{
    success: boolean;
    data: SessionResponseDto;
    message: string;
  }> {
    try {
      this.logger.log(`Publishing session: ${sessionId}`);

      const session = await this.sessionService.publishSession(sessionId);

      const successMessage = await this.i18n.translate('session.published.success', {
        lang,
        args: { sessionName: session.name }
      });

      return {
        success: true,
        data: session,
        message: successMessage || 'Session published successfully'
      };
    } catch (error) {
      this.logger.error(`Failed to publish session ${sessionId}: ${error.message}`, error.stack);

      if (error.name === 'SessionNotFound') {
        throw new NotFoundException('session', sessionId);
      }
      throw error;
    }
  }

  /** Deploys the session smart contract using the user's wallet unlocked with the provided PIN. */
  @Post(':id/publish-with-pin')
  @Roles({ roles: ['realm:FMO_LMO'] })
  async publishSessionWithPin(
    @Param('id') sessionId: string,
    @Body('pin') pin: string,
    @Language() lang: string
  ): Promise<{
    success: boolean;
    data: SessionResponseDto;
    message: string;
  }> {
    try {
      // Validate PIN input
      if (!pin || pin.length !== 6) {
        throw new BadRequestException('PIN must be 6 digits');
      }

      this.logger.log(`Publishing session with PIN: ${sessionId}`);

      const session = await this.sessionService.publishSession(sessionId, pin);

      const successMessage = await this.i18n.translate('session.published.success', {
        lang,
        args: { sessionName: session.name }
      });

      return {
        success: true,
        data: session,
        message: successMessage || 'Session published successfully on blockchain'
      };
    } catch (error) {
      this.logger.error(`Failed to publish session ${sessionId} with PIN: ${error.message}`, error.stack);

      if (error.name === 'SessionNotFound') {
        throw new NotFoundException('session', sessionId);
      }
      throw error;
    }
  }

  /** Opens the offers period on-chain, transitioning the session from PUBLISHED to ACTIVE. */
  @Post(':id/open-offers')
  @Roles({ roles: ['realm:FMO_LMO'] })
  async openOffersPeriod(
    @Param('id') sessionId: string,
    @Body('pin') pin: string,
    @Language() lang: string
  ): Promise<{
    success: boolean;
    data: SessionResponseDto;
    message: string;
  }> {
    try {
      // Validate PIN input
      if (!pin || pin.length !== 6) {
        throw new BadRequestException('PIN must be 6 digits');
      }

      this.logger.log(`Opening offers period for session: ${sessionId}`);

      const session = await this.sessionService.openOffersPeriod(sessionId, pin);

      const successMessage = await this.i18n.translate('session.offers.opened.success', {
        lang,
        args: { sessionName: session.name }
      });

      return {
        success: true,
        data: session,
        message: successMessage || 'Offers period opened successfully on blockchain'
      };
    } catch (error) {
      this.logger.error(`Failed to open offers period for session ${sessionId}: ${error.message}`, error.stack);

      if (error.name === 'SessionNotFound') {
        throw new NotFoundException('session', sessionId);
      }
      throw error;
    }
  }

  /** Closes the offers period on-chain, transitioning the session from ACTIVE to OFFERS_CLOSED. */
  @Post(':id/close-offers')
  @Roles({ roles: ['realm:FMO_LMO'] })
  async closeOffersPeriod(
    @Param('id') sessionId: string,
    @Body('pin') pin: string,
    @Language() lang: string
  ): Promise<{
    success: boolean;
    data: SessionResponseDto;
    message: string;
  }> {
    try {
      // Validate PIN input
      if (!pin || pin.length !== 6) {
        throw new BadRequestException('PIN must be 6 digits');
      }

      this.logger.log(`Closing offers period for session: ${sessionId}`);

      const session = await this.sessionService.closeOffersPeriod(sessionId, pin);

      const successMessage = await this.i18n.translate('session.offers.closed.success', {
        lang,
        args: { sessionName: session.name }
      });

      return {
        success: true,
        data: session,
        message: successMessage || 'Offers period closed successfully on blockchain'
      };
    } catch (error) {
      this.logger.error(`Failed to close offers period for session ${sessionId}: ${error.message}`, error.stack);

      if (error.name === 'SessionNotFound') {
        throw new NotFoundException('session', sessionId);
      }
      throw error;
    }
  }

  /** Returns collateral tokens to FSPs after a session has been CANCELLED. */
  @Post(':id/return-tokens')
  @Roles({ roles: ['realm:FMO_LMO'] })
  async returnTokensForSession(
    @Param('id') sessionId: string,
    @Body('pin') pin: string,
    @Language() lang: string
  ): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      // Validate PIN input
      if (!pin || pin.length !== 6) {
        throw new BadRequestException('PIN must be 6 digits');
      }

      this.logger.log(`Returning tokens for session: ${sessionId}`);

      await this.sessionService.returnTokensOnCancelledSession(sessionId, pin);

      return {
        success: true,
        message: 'Tokens returned successfully on blockchain'
      };
    } catch (error) {
      this.logger.error(`Failed to close offers period for session ${sessionId}: ${error.message}`, error.stack);

      if (error.name === 'SessionNotFound') {
        throw new NotFoundException('session', sessionId);
      }
      throw error;
    }
  }

  /** Grants the FSP role on the session contract to a specific wallet address. */
  @Post(':id/grant-fsp-role')
  @Roles({ roles: ['realm:FMO_LMO'] })
  async grantFSPRole(
    @Param('id') sessionId: string,
    @Body() body: { fspAddress: string; pin: string }
  ): Promise<{
    success: boolean;
    data: { txHash: string };
    message: string;
  }> {
    try {
      this.logger.log(`Granting FSP role to ${body.fspAddress} in session ${sessionId}`);

      const result = await this.sessionService.grantFSPRoleToUser(sessionId, body.fspAddress, body.pin);

      return {
        success: true,
        data: result,
        message: `FSP role granted successfully to ${body.fspAddress}`
      };
    } catch (error) {
      this.logger.error(`Failed to grant FSP role: ${error.message}`, error.stack);

      if (error.name === 'SessionNotFound') {
        throw new NotFoundException('session', sessionId);
      }
      throw error;
    }
  }

  /** Deletes a DRAFT session permanently. */
  @Delete(':id')
  @Roles({ roles: ['realm:FRP'] })
  async deleteSession(
    @Param('id') sessionId: string,
    @Language() lang: string
  ): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      this.logger.log(`Deleting session: ${sessionId}`);

      await this.sessionService.deleteSession(sessionId);

      const successMessage = await this.i18n.translate('session.deleted.success', {
        lang,
        args: { sessionId }
      });

      return {
        success: true,
        message: successMessage || 'Session deleted successfully'
      };
    } catch (error) {
      this.logger.error(`Failed to delete session ${sessionId}: ${error.message}`, error.stack);

      if (error.name === 'SessionNotFound') {
        throw new NotFoundException('session', sessionId);
      }
      throw error;
    }
  }
}