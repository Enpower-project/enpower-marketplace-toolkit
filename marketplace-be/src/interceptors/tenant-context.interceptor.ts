import { 
  Injectable, 
  NestInterceptor, 
  ExecutionContext, 
  CallHandler,
  HttpException,
  HttpStatus,
  Logger,
  UnauthorizedException
} from '@nestjs/common';
import { Observable, EMPTY, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { MarketSelectionService } from '../modules/tenant/services/market-selection.service';
import { KeycloakAdminService } from '../modules/tenant/services/keycloak-admin.service'; // 🎯 AGGIUNTO
import { AsyncLocalStorage } from 'async_hooks';
import { TenantContextService } from '../modules/tenant/services/tenant-context.service';

export interface TenantContext {
  marketId: string;        // Always present for tenant endpoints
  userId: string;
  userRoles: string[];
  enhancedJwt?: string;
  requestId: string;
  timestamp: Date;
}

@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  private readonly logger = new Logger(TenantContextInterceptor.name);
  private readonly als = new AsyncLocalStorage<TenantContext>();

  constructor(
    private readonly marketSelectionService: MarketSelectionService,
    private readonly keycloakAdminService: KeycloakAdminService, // 🎯 AGGIUNTO
    private readonly tenantContext: TenantContextService,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();

    // Skip market resolution for certain endpoints
    if (!this.shouldInterceptMarketResolution(request)) {
      this.logger.debug(`Skipping market resolution for this endpoint ${this.shouldInterceptMarketResolution(request)}`);
      return next.handle();
    }

    try {
      // Extraer información del JWT
      const user = request.user;
      this.logger.debug(`TenantContextInterceptor: Processing request for user:`, user?.sub || 'no user');

      if (!user) {
        this.logger.debug('No user in request, skipping market resolution');
        return next.handle();
      }

      const keycloakUserId = user.sub;

      // Check for market ID in multiple sources (JWT, headers)
      const marketFromHeader = request.headers['x-market-id'];
      const currentMarket = user.current_market || user.market_id || marketFromHeader;

      this.logger.debug(`User ${keycloakUserId}: current_market=${user.current_market}, market_id=${user.market_id}, header=${marketFromHeader}, resolved=${currentMarket}`);

      // Si ya hay un market en el JWT, usar ese
      if (currentMarket) {
        this.logger.debug(`User ${keycloakUserId} has market in JWT: ${currentMarket} (from ${user.current_market ? 'current_market' : 'market_id'})`);

        // Actualizar el context del request
        request.user.current_market = currentMarket;
        request.user.market_id = currentMarket;
        response.setHeader('X-Market-ID', currentMarket);

        const tenantContext = {
          marketId: request.user?.current_market || request.user?.market_id,
          userId: request.user?.sub,
          userRoles: request.user?.roles || [],
          enhancedJwt: request.user?.enhancedJwt,
          requestId: request.id,
          timestamp: new Date()
        }

         this.logger.debug('Tenant context resolved from JWT:', tenantContext);
        try {
          return new Observable(subscriber => {
            this.tenantContext.run(tenantContext, () => {
              next.handle().subscribe({
                next: (value) => subscriber.next(value),
                error: (error) => subscriber.error(error),
                complete: () => subscriber.complete(),
              });
            });
          });

        } catch (error) {
          throw new UnauthorizedException('Invalid token or missing tenant information');
        }

      }

      // RESOLUCIÓN DE MARKET: El usuario no tiene market en el JWT
      this.logger.debug(`Resolving market for user ${keycloakUserId} - no market context found in JWT`);

      // 🎯 MEJORADO: Primero verifica si el usuario ya tiene un market seleccionado recientemente
      try {
        this.logger.debug(`Attempting to get user attributes from Keycloak for user ${keycloakUserId}`);
        const userAttributes = await this.keycloakAdminService.getUserAttributes(keycloakUserId);
        this.logger.debug(`User attributes retrieved:`, userAttributes);

        const selectedMarketFromKeycloak = userAttributes?.current_market?.[0];
        this.logger.debug(`Selected market from Keycloak: ${selectedMarketFromKeycloak}`);

        if (selectedMarketFromKeycloak) {
          this.logger.debug(`User ${keycloakUserId} has recently selected market in Keycloak: ${selectedMarketFromKeycloak}`);

          // Actualiza el token context con el market desde Keycloak
          request.user.current_market = selectedMarketFromKeycloak;
          request.user.market_id = selectedMarketFromKeycloak;
          response.setHeader('X-Market-ID', selectedMarketFromKeycloak);

          const tenantContext = {
            marketId: selectedMarketFromKeycloak,
            userId: request.user?.sub,
            userRoles: request.user?.roles || [],
            enhancedJwt: request.user?.enhancedJwt,
            requestId: request.id,
            timestamp: new Date()
          }

          this.logger.debug('Tenant context resolved from Keycloak attributes:', tenantContext);
          return new Observable(subscriber => {
            this.tenantContext.run(tenantContext, () => {
              next.handle().subscribe({
                next: (value) => subscriber.next(value),
                error: (error) => subscriber.error(error),
                complete: () => subscriber.complete(),
              });
            });
          });
        } else {
          this.logger.debug(`No current_market found in Keycloak attributes for user ${keycloakUserId}, proceeding with market resolution`);
        }
      } catch (keycloakError) {
        this.logger.warn(`Failed to get user attributes from Keycloak: ${keycloakError.message}`);
        // Continue with normal market resolution
      }

      const marketResolution = await this.marketSelectionService.resolveUserMarkets(keycloakUserId);

      if (!marketResolution.hasAccess) {
        throw new HttpException(
          'No market access available',
          HttpStatus.FORBIDDEN
        );
      }

      this.logger.debug(`Market resolution result for ${keycloakUserId}:`, {
        hasAccess: marketResolution.hasAccess,
        requiresSelection: marketResolution.requiresSelection,
        marketId: marketResolution.marketId,
        availableMarketsCount: marketResolution.availableMarkets?.length
      });

      if (marketResolution.requiresSelection && marketResolution.availableMarkets) {
        // CASO: Multiple markets - enviar lista al cliente
        response.status(HttpStatus.PRECONDITION_REQUIRED);
        response.json({
          error: 'MARKET_SELECTION_REQUIRED',
          message: 'Multiple markets available, please select one',
          availableMarkets: marketResolution.availableMarkets,
          selectionEndpoint: '/api/market/select'
        });

        return of(null);
      }

      if (marketResolution.marketId) {
        // CASO: Single market - aggiorna attributo utente
        this.logger.debug(`Auto-selecting market for user ${keycloakUserId}: ${marketResolution.marketId}`);

        try {
          // 🎯 AGGIORNA L'ATTRIBUTO UTENTE invece di generare nuovo token
          await this.keycloakAdminService.enhanceUserTokenWithMarket(keycloakUserId, marketResolution.marketId);

          // 🎯 INDICA AL CLIENT DI FARE REFRESH DEL TOKEN
          throw new HttpException({
            error: 'TOKEN_REFRESH_REQUIRED',
            message: 'Token refresh required to include market context',
            marketId: marketResolution.marketId
          }, HttpStatus.UNAUTHORIZED);

        } catch (keycloakError) {
          // Re-throw HttpException (TOKEN_REFRESH_REQUIRED) to propagate to client
          if (keycloakError instanceof HttpException) {
            throw keycloakError;
          }

          // Only catch actual Keycloak errors
          this.logger.error(`Failed to update user market attribute: ${keycloakError.message}`);

          // Si falla la actualización de Keycloak, permitir que continúe sin market context
          this.logger.warn(`Continuing without market context for user ${keycloakUserId}`);
          return next.handle();
        }
      }

    } catch (error) {
      this.logger.error(`Tenant context resolution failed: ${error.message}`);

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        'Market context resolution failed',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }

    // Si llegamos aquí, no se pudo resolver el market context
    this.logger.warn('No market context could be resolved, continuing without tenant context');
    return next.handle();
  }


  /**
   * Determina si se debe saltar la resolución de market para ciertos endpoints
   */
  private shouldInterceptMarketResolution(request: any): boolean {
    const path = request.route?.path || request.url;
    const method = request.method;
    
    this.logger.debug(`Checking skip for: ${method} ${path}`);
    
    // Endpoints que NO requieren market context y deben ser EXCLUIDOS
    const skipPaths = [
      '/api/market/available',   // Obtener markets disponibles
      '/api/market/select',      // Seleccionar market
      '/api/market/switch',      // Cambiar market
      '/api/market/current',     // Market actual
      '/api/market/refresh-token', // Refresh token
      '/api/market/inspect-jwt',   // Inspeccionar JWT
      '/health',                 // Health checks
      '/auth/',                  // Endpoints de autenticación (incluyendo logout)
      '/market-factory/',        // Factory endpoints
      '/transactions/admin'
    ];

    // Endpoints que SÍ requieren market context
    const interceptPaths = [
      '/api/tenant/',
      '/api/flexibility/',
      '/sessions',
      '/hourly-offers',
      '/transactions/',
      '/settlements',
    ];

    // Primero verificar si debe ser excluido (skip)
    const shouldSkip = skipPaths.some(skipPath => path && path.includes(skipPath));
    
    if (shouldSkip) {
      this.logger.debug(`SKIPPING market resolution for: ${method} ${path}`);
      return false; // No interceptar
    }
    
    // Luego verificar si debe ser interceptado
    const shouldIntercept = interceptPaths.some(interceptPath => path && path.includes(interceptPath));
    
    if (!shouldIntercept) {
      this.logger.debug(`NOT intercepting for: ${method} ${path}`);
    } else {
      this.logger.debug(`INTERCEPTING for: ${method} ${path}`);
    }
    
    return shouldIntercept;
  }

  /**
   * Check if the JWT token has been invalidated (e.g., after logout)
   * Returns true if the token should be considered invalid
   */
  private isTokenInvalidated(request: any): boolean {
    const user = request.user;
    if (!user) {
      return false;
    }

    // Check if token has been recently issued or is too old
    // If token was issued before a recent logout, it's likely invalid
    const iat = user.iat ? new Date(user.iat * 1000) : null;
    
    if (iat) {
      const tokenAge = Date.now() - iat.getTime();
      // If token is less than 1 second old and we're checking after a logout was initiated,
      // it's suspicious. But this is hard to verify.
      // Better approach: Frontend should clean JWT on logout
      this.logger.debug(`Token age: ${tokenAge}ms`);
    }

    // Alternative: Check if the `current_market` in JWT was cleared (not present)
    // If there's no market and the user hasn't explicitly selected one, token is stale
    return false; // For now, rely on frontend cleanup
  }
}
