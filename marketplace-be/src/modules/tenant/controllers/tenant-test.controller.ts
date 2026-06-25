import { Controller, Get, Request, Logger } from '@nestjs/common';
import { MarketSelectionService } from '../services/market-selection.service';

@Controller('api/tenant')
export class TenantTestController {
  private readonly logger = new Logger(TenantTestController.name);

  constructor(
    private readonly marketSelection: MarketSelectionService,
  ) {}

  /**
   * Endpoint de testing para verificar el tenant context
   */
  @Get('test')
  async testTenantContext(@Request() req: any) {
    const user = req.user;
    const userId = user?.id || user?.sub;

    this.logger.debug(`Testing tenant context for user: ${userId}`);

    if (!userId) {
      return {
        error: 'No user context found',
        user: user
      };
    }

    try {
      const marketResolution = await this.marketSelection.resolveUserMarkets(userId);
      
      // 🎯 VERIFICAR SI YA HAY UN MARKET SELECCIONADO (JWT o Sesión)
      const currentMarket = user?.current_market || user?.market_id;
      const effectiveMarket = currentMarket;
      
      // Si ya hay un market seleccionado, corregir requiresSelection
      if (effectiveMarket && marketResolution.requiresSelection) {
        this.logger.debug(`User ${userId} already has market selected: ${effectiveMarket} (source: ${currentMarket ? 'JWT' : 'session'}), setting requiresSelection to false`);
        marketResolution.requiresSelection = false;
      }
      
      return {
        success: true,
        userId,
        userInfo: {
          keycloakId: user?.sub,
          username: user?.preferred_username,
          currentMarket: effectiveMarket, // 🎯 Market efectivo (JWT o sesión)
          roles: user?.realm_access?.roles || []
        },
        marketResolution,
        message: 'Tenant context test completed successfully'
      };

    } catch (error) {
      this.logger.error(`Tenant context test failed: ${error.message}`);
      return {
        error: error.message,
        userId,
        userInfo: user
      };
    }
  }

  /**
   * Endpoint para verificar el interceptor está funcionando
   */
  @Get('interceptor-test')
  async testInterceptor(@Request() req: any) {
    return {
      success: true,
      message: 'If you see this, the interceptor allowed the request',
      userContext: {
        userId: req.user?.id || req.user?.sub,
        currentMarket: req.user?.current_market,
        keycloakId: req.user?.sub
      },
      timestamp: new Date().toISOString()
    };
  }
}
