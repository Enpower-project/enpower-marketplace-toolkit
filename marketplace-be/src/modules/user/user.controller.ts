import { Controller, Get, Query, UseGuards, Delete, Param, HttpCode, HttpStatus, Request } from '@nestjs/common';
import { UserService } from './user.service';
import { Roles } from 'nest-keycloak-connect';
import { JwtAuthGuard } from 'src/guards/jwt-auth.guard';
import { ApiBearerAuth, ApiOAuth2, ApiTags } from '@nestjs/swagger';

@ApiTags('users')
@ApiOAuth2(['openid'], 'keycloak')
@Controller('users')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard)
export class UserController {
  constructor(private readonly userService: UserService) { }

  /** Returns profile data for the currently authenticated user. */
  @Get('me')
  async getCurrentUser(@Request() req: any) {
    try {
      const keycloakUserId = req.user?.sub;

      if (!keycloakUserId) {
        return {
          success: false,
          message: 'User not authenticated',
        };
      }

      const user = await this.userService.getUserByKeycloakId(keycloakUserId);

      return {
        success: true,
        data: {
          id: user._id,
          username: user.username,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          status: user.status,
          accessibleMarkets: user.accessibleMarkets,
          assignedMarket: user.assignedMarket,
        },
      };
    } catch (error) {
      return {
        success: false,
        message: 'Error retrieving current user',
        error: error.message,
      };
    }
  }

  /** Looks up a user by their wallet address (case-insensitive). */
  @Get('address/:walletAddress')
  async getUserByAddress(@Param('walletAddress') walletAddress: string) {
    try {
      const user = await this.userService.getUserByWalletAddress(walletAddress);
      return {
        success: true,
        data: {
          id: user._id,
          username: user.username,
          email: user.email,
          role: user.role,
        }
      };
    } catch (error) {
      return {
        success: false,
        message: 'No user found for this address',
      };
    }
  }

  /** Returns a human-readable session label for a contract, FMO, or FRP wallet address. */
  @Get('address/session/:address')
  async getSessionPlateByAddress(@Param('address') address: string) {
    try {
      const sessionLabel = await this.userService.getSessionLabelByAddress(address);
      if (sessionLabel) {
        return {
          success: true,
          data: {
            username: sessionLabel,
          }
        };
      }

    } catch (error) {
      return {
        success: false,
        message: 'No session found for this address',
      };
    }
  }

  /** Returns the assigned market ID for the currently authenticated user. */
  @Get('me/assigned-market')
  async getMyAssignedMarket(@Request() req: any) {
    try {
      const keycloakUserId = req.user?.sub;
      if (!keycloakUserId) {
        return {
          success: false,
          message: 'User not authenticated'
        };
      }

      const user = await this.userService.getUserByKeycloakId(keycloakUserId);
      if (!user) {
        return {
          success: false,
          message: 'User not found'
        };
      }

      return {
        success: true,
        data: {
          assignedMarket: user.assignedMarket?.toString() || null
        }
      };
    } catch (error) {
      return {
        success: false,
        message: 'Error retrieving assigned market',
        error: error.message
      };
    }
  }

  /** Returns all users; restricted to marketplace administrators. */
  @Get()
  @Roles({ roles: ['realm:MARKETPLACE_ADMIN'] })
  async getAllUsers() {
    return this.userService.getAllUsers();
  }

  /**
   * Returns a list of users with summary fields, optionally filtered by role.
   * @param role Optional role name to filter results.
   */
  @Get('list')
  @Roles({ roles: ['realm:MARKETPLACE_ADMIN', 'realm:FMO_LMO'] })
  async getUsersList(@Query('role') role?: string) {
    try {
      const users = await this.userService.getAllUsers(role);

      return {
        success: true,
        data: {
          users: users.map(user => ({
            id: user._id,
            username: user.username,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role,
            status: user.status,
            accessibleMarkets: user.accessibleMarkets,
            assignedMarket: user.assignedMarket
          })),
          count: users.length
        }
      };
    } catch (error) {
      return {
        success: false,
        message: 'Error retrieving users',
        error: error.message
      };
    }
  }

  /** Deletes a user after authorisation checks; admins can delete any user, market owners only their own users. */
  @Delete(':userId')
  @Roles({ roles: ['realm:MARKETPLACE_ADMIN', 'realm:FMO_LMO'] })
  @HttpCode(HttpStatus.OK)
  async deleteUser(@Param('userId') userId: string, @Request() req: any) {
    const requesterKeycloakId: string | undefined = req?.user?.sub;
    const userRoles: string[] = req?.user?.realm_access?.roles || [];

    await this.userService.deleteUserAuthorized(requesterKeycloakId, userRoles, userId);
    return {
      success: true,
      message: 'User deleted successfully'
    };
  }
}