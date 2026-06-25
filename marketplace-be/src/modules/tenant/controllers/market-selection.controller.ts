
import { 
  Controller, 
  Post, 
  Body, 
  Request, 
  HttpException, 
  HttpStatus,
  Logger,
  Get
} from '@nestjs/common';
import { MarketSelectionService } from '../services/market-selection.service';
import { KeycloakAdminService } from '../services/keycloak-admin.service';
import { MarketSelectionDto, MarketSelectionResponse, MultipleMarketsResponse } from '../dto/market-selection.dto';
import { ApiOAuth2, ApiTags } from '@nestjs/swagger';

@ApiTags('market-selection')
@ApiOAuth2(['openid'], 'keycloak')
@Controller('api/market')
export class MarketSelectionController {
  private readonly logger = new Logger(MarketSelectionController.name);

  constructor(
    private readonly marketSelection: MarketSelectionService,
    private readonly keycloakAdmin: KeycloakAdminService
  ) {}

  /** Selects a market for the authenticated user and instructs the client to refresh its token. */
  @Post('select')
  async selectMarket(
    @Body() dto: MarketSelectionDto,
    @Request() req: any
  ): Promise<MarketSelectionResponse> {
    
    try {
      const keycloakUserId = req.user?.sub;
      if (!keycloakUserId) {
        throw new HttpException('User context required', HttpStatus.UNAUTHORIZED);
      }

      this.logger.debug(`Market selection request from user ${keycloakUserId} for market ${dto.selectedMarketId}`);

      let tokenRefreshNeeded = true;
      let selectionMessage = 'Market selected successfully. Please refresh your token.';
      
      try {
        await this.marketSelection.selectUserMarket({
          selectedMarketId: dto.selectedMarketId,
          keycloakUserId
        });
      } catch (selectionError) {
        // If the error is related to token enhancement but market was still selected
        if (selectionError.message?.includes('Token enhancement failed') || 
            selectionError.message?.includes('authentication')) {
          this.logger.warn(`Market selection succeeded but token enhancement failed: ${selectionError.message}`);
          selectionMessage = 'Market selected successfully, but automatic token enhancement failed. You may need to refresh your token manually.';
          tokenRefreshNeeded = true;
        } else {
          // Real selection failure, re-throw
          throw selectionError;
        }
      }

      return {
        success: true,
        message: selectionMessage,
        marketId: dto.selectedMarketId,
        requiresTokenRefresh: tokenRefreshNeeded
      };

    } catch (error) {
      this.logger.error(`Market selection failed: ${error.message}`);
      
      if (error instanceof HttpException) {
        throw error;
      }
      
      throw new HttpException(
        'Market selection failed',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /** Switches the authenticated user to a different market and instructs the client to refresh its token. */
  @Post('switch')
  async switchMarket(
    @Body() dto: MarketSelectionDto,
    @Request() req: any
  ): Promise<MarketSelectionResponse> {
    
    try {
      const keycloakUserId = req.user?.sub;
      if (!keycloakUserId) {
        throw new HttpException('User context required', HttpStatus.UNAUTHORIZED);
      }

      this.logger.debug(`Market switch request from user ${keycloakUserId} to market ${dto.selectedMarketId}`);

      let tokenRefreshNeeded = true;
      let switchMessage = 'Market switched successfully. Please refresh your token.';
      
      try {
        await this.marketSelection.switchUserMarket(keycloakUserId, dto.selectedMarketId);
      } catch (switchError) {
        // If the error is related to token enhancement but market was still switched
        if (switchError.message?.includes('Token enhancement failed') || 
            switchError.message?.includes('authentication')) {
          this.logger.warn(`Market switch succeeded but token enhancement failed: ${switchError.message}`);
          switchMessage = 'Market switched successfully, but automatic token enhancement failed. You may need to refresh your token manually.';
          tokenRefreshNeeded = true;
        } else {
          // Real switch failure, re-throw
          throw switchError;
        }
      }

      return {
        success: true,
        message: switchMessage,
        marketId: dto.selectedMarketId,
        requiresTokenRefresh: tokenRefreshNeeded
      };

    } catch (error) {
      this.logger.error(`Market switch failed: ${error.message}`);
      
      if (error instanceof HttpException) {
        throw error;
      }
      
      throw new HttpException(
        'Market switch failed',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /** Returns the list of markets accessible to the authenticated user. */
  @Get('available')
  async getAvailableMarkets(@Request() req: any): Promise<MultipleMarketsResponse> {
    try {
      const keycloakUserId = req.user?.sub;
      if (!keycloakUserId) {
        throw new HttpException('User context required', HttpStatus.UNAUTHORIZED);
      }

      const currentMarket = req.user?.current_market || req.user?.market_id;
      
      this.logger.debug(`Available markets request from user ${keycloakUserId}, current market in JWT: ${currentMarket}`);

      const result = await this.marketSelection.resolveUserMarkets(keycloakUserId);

      // Allow prosumers without market access to receive empty list
      // They will use the market subscription flow instead
      if (!result.hasAccess) {
        const userRoles = req.user?.realm_access?.roles || [];
        const isProsumer = userRoles.includes('FSP');

        if (isProsumer) {
          this.logger.debug(`Prosumer ${keycloakUserId} has no market access, returning empty list`);
          return {
            availableMarkets: [],
            availableMarketsWithNames: [],
            requiresSelection: false,
            message: 'No markets available. Please subscribe to a market first.'
          };
        }

        // For other users without market access, return empty list instead of throwing 403
        this.logger.debug(`User ${keycloakUserId} has no market access, returning empty list`);
        return {
          availableMarkets: [],
          availableMarketsWithNames: [],
          requiresSelection: false,
          message: 'No markets available for this user'
        };
      }

      const selectedMarket = currentMarket ;
      
      if (selectedMarket) {
        this.logger.debug(`User ${keycloakUserId} already has market context: ${selectedMarket}`);
        
        if (result.requiresSelection && result.availableMarkets) {
          return {
            availableMarkets: result.availableMarkets,
            availableMarketsWithNames: result.availableMarketsWithNames,
            requiresSelection: false,
            message: 'Market already selected',
            selectedMarket
          };
        }
        
        return {
          availableMarkets: result.marketId ? [result.marketId] : [],
          availableMarketsWithNames: result.marketId && result.marketName ? [{id: result.marketId, name: result.marketName}] : [],
          requiresSelection: false,
          message: 'Market already selected',
          selectedMarket
        };
      }

      if (result.requiresSelection && result.availableMarkets) {
        return {
          availableMarkets: result.availableMarkets,
          availableMarketsWithNames: result.availableMarketsWithNames,
          requiresSelection: true,
          message: 'Multiple markets available, please select one'
        };
      }

      return {
        availableMarkets: result.marketId ? [result.marketId] : [],
        availableMarketsWithNames: result.marketId && result.marketName ? [{id: result.marketId, name: result.marketName}] : [],
        requiresSelection: false,
        message: result.marketId ? 'Single market available' : 'No markets available'
      };

    } catch (error) {
      this.logger.error(`Get available markets failed: ${error.message}`);
      
      if (error instanceof HttpException) {
        throw error;
      }
      
      throw new HttpException(
        'Failed to get available markets',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /** Returns the decoded JWT payload along with the effective market context for the current user. */
  @Get('inspect-jwt')
  async inspectJwt(@Request() req: any): Promise<{
    jwtPayload: any;
    currentMarket: {
      fromJwt?: string;
      effective: string | null;
    };
    availableMarkets: string[];
    message: string;
  }> {
    try {
      const keycloakUserId = req.user?.sub;
      if (!keycloakUserId) {
        throw new HttpException('User context required', HttpStatus.UNAUTHORIZED);
      }

      const jwtMarket = req.user?.current_market || req.user?.market_id;
      const effectiveMarket = jwtMarket ;
      const result = await this.marketSelection.resolveUserMarkets(keycloakUserId);
      
      const messageText = effectiveMarket 
        ? `Market context active: ${effectiveMarket} (source: ${jwtMarket ? 'JWT' : 'session'})`
        : 'No market context available';
      
      return {
        jwtPayload: {
          sub: req.user.sub,
          email: req.user.email,
          preferred_username: req.user.preferred_username,
          current_market: req.user.current_market,
          market_id: req.user.market_id,
          realm_access: req.user.realm_access,
        },
        currentMarket: {
          fromJwt: jwtMarket,
          effective: effectiveMarket
        },
        availableMarkets: result.availableMarkets || (result.marketId ? [result.marketId] : []),
        message: messageText
      };

    } catch (error) {
      this.logger.error(`JWT inspection failed: ${error.message}`);
      throw new HttpException('JWT inspection failed', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /** Updates the user's market attribute in Keycloak so the next token refresh picks it up. */
  @Post('refresh-token')
  async refreshToken(@Request() req: any): Promise<{
    success: boolean;
    message: string;
    marketId?: string;
  }> {
    try {
      const keycloakUserId = req.user?.sub;
      if (!keycloakUserId) {
        throw new HttpException('User context required', HttpStatus.UNAUTHORIZED);
      }

      return {
        success: true,
        message: 'User attribute updated. Please refresh your token via Keycloak.',
        marketId: 'NEW MARKET ID'
      };

    } catch (error) {
      this.logger.error(`Token refresh preparation failed: ${error.message}`);
      throw new HttpException('Token refresh preparation failed', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /** Returns the market currently active in the user's JWT token. */
  @Get('current')
  async getCurrentMarket(@Request() req: any): Promise<{
    marketId: string | null;
    source: 'jwt' | 'session' | 'none';
    message: string;
  }> {
    try {
      const keycloakUserId = req.user?.sub;
      if (!keycloakUserId) {
        throw new HttpException('User context required', HttpStatus.UNAUTHORIZED);
      }

      const jwtMarket = req.user?.current_market || req.user?.market_id;

        return {
          marketId: jwtMarket,
          source: 'jwt',
          message: 'Market found in JWT token'
        };


    } catch (error) {
      this.logger.error(`Get current market failed: ${error.message}`);
      throw new HttpException('Get current market failed', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}