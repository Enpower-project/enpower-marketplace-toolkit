import { Body, Controller, Post, Get, HttpException, HttpStatus, Logger, Param, Put } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterUserDto } from './dto/register-user.dto';
import { UpdateUserStatusDto, UserStatusResponseDto } from './dto/user-status.dto';
import { I18nService } from 'nestjs-i18n';
import { Language } from '../../decorators/language.decorator';
import { Public } from '../../decorators/public.decorator';
import { Roles, Unprotected } from 'nest-keycloak-connect';
import { ApiOAuth2, ApiTags } from '@nestjs/swagger';
import { UserDocument } from 'src/schemas/User.schema';

@ApiTags('auth')
@ApiOAuth2(['openid'], 'keycloak')
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly authService: AuthService,
    private readonly i18n: I18nService,
  ) { }

  /** Checks connectivity to Keycloak and reports overall auth service health. */
  @Get('health')
  @Unprotected()
  async healthCheck() {
    try {
      // Test Keycloak connectivity
      await this.authService.getAdminToken();
      return {
        success: true,
        message: 'Auth service is healthy',
        keycloak: 'Connected',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      this.logger.error(`Health check failed: ${error.message}`);
      return {
        success: false,
        message: 'Auth service has issues',
        keycloak: 'Disconnected',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /** Registers a new prosumer; creates their Keycloak account and MongoDB record. */
  @Post('register')
  @Unprotected()
  async registerUser(@Body() dto: RegisterUserDto, @Language() lang: string) {
    try {
      this.logger.log(`Attempting to register user: ${dto.username} with email: ${dto.email}`);
      const registered = await this.authService.registerUser(dto);
      const successMessage = this.i18n.translate('auth.register.success', { lang });

      this.logger.log(`User registered successfully: ${registered.username}`);
      return {
        success: true,
        data: {
          id: registered.id,
          username: registered.username,
          email: registered.email,
          status: registered.status,
          nextRequiredStep: registered.nextRequiredStep,
          walletCreated: registered.walletCreated || false,
          walletPin: registered.walletPin // Include PIN for prosumer wallet
        },
        message: successMessage
      };
    } catch (error) {
      this.logger.error(`Registration failed for ${dto.username}: ${error.message}`, error.stack);

      if (error instanceof HttpException) {
        throw error;
      }

      let errorMessage: string;
      if (error.message.includes('User exists')) {
        errorMessage = await this.i18n.translate('auth.errors.userExists', { lang });
      } else if (error.message.includes('Invalid email')) {
        errorMessage = await this.i18n.translate('auth.errors.invalidEmail', { lang });
      } else {
        errorMessage = await this.i18n.translate('auth.register.error', { lang });
      }

      throw new HttpException(
        {
          success: false,
          message: errorMessage,
          error: error.message
        },
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * Get user status information
   */
  @Get('user/:userId/status')
  @Roles({ roles: ['user', 'admin'] })
  async getUserStatus(
    @Param('userId') userId: string,
    @Language() lang: string = 'en'
  ): Promise<UserStatusResponseDto> {
    try {
      const statusInfo = await this.authService.getUserStatusInfo(userId);
      return statusInfo;
    } catch (error) {
      this.logger.error(`Failed to get user status for ${userId}: ${error.message}`, error.stack);
      
      const errorMessage = await this.i18n.translate('auth.errors.userNotFound', { lang });
      throw new HttpException(
        {
          success: false,
          message: errorMessage,
          error: error.message
        },
        HttpStatus.NOT_FOUND
      );
    }
  }

  /**
   * Update user status (admin only)
   */
  @Put('user/:userId/status')
  @Roles({ roles: ['admin'] })
  async updateUserStatus(
    @Param('userId') userId: string,
    @Body() dto: UpdateUserStatusDto,
    @Language() lang: string = 'en'
  ) {
    try {
      const updatedUser = await this.authService.updateUserStatus(userId, dto.status);
      const successMessage = await this.i18n.translate('auth.status.updated', { lang });
      
      return {
        success: true,
        message: successMessage,
        user: {
          id: updatedUser._id,
          username: updatedUser.username,
          status: updatedUser.status,
          nextRequiredStep: updatedUser.nextRequiredStep
        }
      };
    } catch (error) {
      this.logger.error(`Failed to update user status for ${userId}: ${error.message}`, error.stack);
      
      const errorMessage = await this.i18n.translate('auth.errors.statusUpdateFailed', { lang });
      throw new HttpException(
        {
          success: false,
          message: errorMessage,
          error: error.message
        },
        HttpStatus.BAD_REQUEST
      );
    }
  }

  @Put('user/:userId/deactivate')
  @Roles({roles:['realm:MARKETPLACE_ADMIN','realm:FMO_LMO']})
  async deactivateUser(
    @Param('userId') userId: string,
  ){
    try{
      const deactivatedUser = await this.authService.deactivateUser(userId)
      
      return {
        success: true,
        message: 'User successfuly deactivated',
        user: deactivatedUser
      }
    } catch (error){
      this.logger.error(`Failed to deactivate user for ${userId}: ${error}`);
    
      return {
        success: false,
        message: error,
      }
    }
  }

  @Put('user/:userId/reactivate')
  @Roles({roles:['realm:MARKETPLACE_ADMIN','realm:FMO_LMO']})
  async reactivateUser(
    @Param('userId') userId: string,
  ){
    try{
      const reactivatedUser = await this.authService.reactivateUser(userId)
      
      return {
        success: true,
        message: 'User successfuly reactivated',
        user: reactivatedUser
      }
    } catch (error){
      this.logger.error(`Failed to reactivate user for ${userId}: ${error}`);
    
      return {
        success: false,
        message: error,
      }
    }
  }


  /**
   * Complete first login step
   */
  @Post('user/:userId/complete-first-login')
  @Roles({ roles: ['user', 'admin'] })
  async completeFirstLogin(
    @Param('userId') userId: string,
    @Language() lang: string = 'en'
  ) {
    try {
      const updatedUser = await this.authService.completeFirstLogin(userId);
      const successMessage = await this.i18n.translate('auth.firstLogin.completed', { lang });
      
      return {
        success: true,
        message: successMessage,
        nextStep: updatedUser.nextRequiredStep
      };
    } catch (error) {
      this.logger.error(`Failed to complete first login for ${userId}: ${error.message}`, error.stack);
      throw new HttpException(
        {
          success: false,
          message: error.message
        },
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * Complete profile step
   */
  @Post('user/:userId/complete-profile')
  @Roles({ roles: ['user', 'admin'] })
  async completeProfile(
    @Param('userId') userId: string,
    @Language() lang: string = 'en'
  ) {
    try {
      const updatedUser = await this.authService.completeProfile(userId);
      const successMessage = await this.i18n.translate('auth.profile.completed', { lang });
      
      return {
        success: true,
        message: successMessage,
        nextStep: updatedUser.nextRequiredStep
      };
    } catch (error) {
      this.logger.error(`Failed to complete profile for ${userId}: ${error.message}`, error.stack);
      throw new HttpException(
        {
          success: false,
          message: error.message
        },
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * Complete wallet creation step
   */
  @Post('user/:userId/complete-wallet')
  @Roles({ roles: ['user', 'admin'] })
  async completeWalletCreation(
    @Param('userId') userId: string,
    @Language() lang: string = 'en'
  ) {
    try {
      const updatedUser = await this.authService.completeWalletCreation(userId);
      const successMessage = await this.i18n.translate('auth.wallet.completed', { lang });
      
      return {
        success: true,
        message: successMessage,
        nextStep: updatedUser.nextRequiredStep
      };
    } catch (error) {
      this.logger.error(`Failed to complete wallet creation for ${userId}: ${error.message}`, error.stack);
      throw new HttpException(
        {
          success: false,
          message: error.message
        },
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * Complete email verification step
   */
  @Post('user/:userId/complete-email-verification')
  @Roles({ roles: ['user', 'admin'] })
  async completeEmailVerification(
    @Param('userId') userId: string,
    @Language() lang: string = 'en'
  ) {
    try {
      const updatedUser = await this.authService.completeEmailVerification(userId);
      const successMessage = await this.i18n.translate('auth.email.verified', { lang });
      
      return {
        success: true,
        message: successMessage,
        status: updatedUser.status
      };
    } catch (error) {
      this.logger.error(`Failed to complete email verification for ${userId}: ${error.message}`, error.stack);
      throw new HttpException(
        {
          success: false,
          message: error.message
        },
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * Migrate users to new status system (admin only, one-time operation)
   */
  @Post('migrate-user-status')
  @Roles({ roles: ['admin'] })
  async migrateUsersToStatusEnum(@Language() lang: string = 'en') {
    try {
      const result = await this.authService.migrateUsersToStatusEnum();
      const successMessage = await this.i18n.translate('auth.migration.completed', { lang });
      
      return {
        success: true,
        message: successMessage,
        migrated: result.migrated,
        errors: result.errors
      };
    } catch (error) {
      this.logger.error(`Failed to migrate users: ${error.message}`, error.stack);
      throw new HttpException(
        {
          success: false,
          message: error.message
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Logout endpoint - invalidates the user session
   * This endpoint is called by the frontend before Keycloak logout
   * to ensure backend clears any context related to the user
   */
  @Post('logout')
  async logout() {
    try {
      this.logger.log('User logout initiated');
      // Just return success - the frontend will handle the actual Keycloak logout
      // and the token will be invalidated by Keycloak
      // The TenantContextInterceptor will handle removing market context on next request
      return {
        success: true,
        message: 'Logout successful'
      };
    } catch (error) {
      this.logger.error(`Logout failed: ${error.message}`, error.stack);
      throw new HttpException(
        {
          success: false,
          message: 'Logout failed'
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
}