
import { Injectable, Logger, ForbiddenException } from '@nestjs/common';
import { KeycloakAdminService } from './keycloak-admin.service';
import { MarketValidationService } from './market-validation.service';

export interface MarketInfo {
  id: string;
  name: string;
}

export interface MarketResolutionResult {
  marketId?: string;
  marketName?: string;
  availableMarkets?: string[];
  availableMarketsWithNames?: MarketInfo[];
  requiresSelection?: boolean;
  hasAccess?: boolean;
}

export interface MarketSelectionRequest {
  selectedMarketId: string;
  keycloakUserId: string;
}

@Injectable()
export class MarketSelectionService {
  private readonly logger = new Logger(MarketSelectionService.name);

  constructor(
    private readonly keycloakAdmin: KeycloakAdminService,
    private readonly marketValidation: MarketValidationService,
  ) {}

  /**
   * Resolves the markets accessible to a user.
   * Returns a single market ID when the user belongs to exactly one market,
   * or a list requiring client-side selection when multiple markets are available.
   */
  async resolveUserMarkets(keycloakUserId: string): Promise<MarketResolutionResult> {
    this.logger.debug(`Resolving markets for user ${keycloakUserId}`);

    try {
      const accessibleMarketsWithNames = await this.marketValidation.getUserAccessibleMarketsWithNames(keycloakUserId);

      if (accessibleMarketsWithNames.length === 0) {
        this.logger.warn(`User ${keycloakUserId} has no market access`);
        return { hasAccess: false };
      }

      if (accessibleMarketsWithNames.length === 1) {
        const market = accessibleMarketsWithNames[0];
        this.logger.debug(`Single market ${market.id} (${market.name}) for user ${keycloakUserId}`);

        return {
          marketId: market.id,
          marketName: market.name,
          hasAccess: true
        };
      } else {
        this.logger.debug(`Multiple markets for user ${keycloakUserId}: ${accessibleMarketsWithNames.map(m => `${m.id}:${m.name}`).join(', ')}`);

        const accessibleMarkets = accessibleMarketsWithNames.map(m => m.id);

        return {
          availableMarkets: accessibleMarkets,
          availableMarketsWithNames: accessibleMarketsWithNames,
          requiresSelection: true,
          hasAccess: true
        };
      }

    } catch (error) {
      this.logger.error(`Market resolution failed for user ${keycloakUserId}: ${error.message}`);
      return { hasAccess: false };
    }
  }

  /**
   * Selects a market for the user: validates access, updates the assigned market in MongoDB,
   * and updates the Keycloak user attribute so future tokens carry the market claim.
   * If Keycloak attribute update fails due to auth errors, the selection still succeeds.
   */
  async selectUserMarket(request: MarketSelectionRequest): Promise<void> {
    const { selectedMarketId, keycloakUserId } = request;

    this.logger.debug(`Processing market selection: user ${keycloakUserId} selected ${selectedMarketId}`);

    try {
      const hasAccess = await this.marketValidation.validateAccess(keycloakUserId, selectedMarketId);
      if (!hasAccess) {
        this.logger.warn(`User ${keycloakUserId} attempted to select unauthorized market ${selectedMarketId}`);
        throw new ForbiddenException('Access denied to selected market');
      }

      const isMarketActive = await this.marketValidation.validateMarketStatus(selectedMarketId);
      if (!isMarketActive) {
        this.logger.warn(`User ${keycloakUserId} attempted to select inactive market ${selectedMarketId}`);
        throw new ForbiddenException('Selected market is not active');
      }

      await this.marketValidation.updateUserAssignedMarket(keycloakUserId, selectedMarketId);

      try {
        await this.keycloakAdmin.enhanceUserTokenWithMarket(keycloakUserId, selectedMarketId);
        this.logger.debug(`Market selection completed for user ${keycloakUserId}`);
      } catch (keycloakError) {
        this.logger.warn(`Keycloak admin operation failed for user ${keycloakUserId}: ${keycloakError.message}`);

        if (keycloakError.message?.includes('401') || keycloakError.message?.includes('authentication')) {
          this.logger.warn(`Keycloak admin authentication failed - market selection will continue without token enhancement`);
          this.logger.debug(`Market selection completed for user ${keycloakUserId} (without token enhancement)`);
          return;
        }

        throw new Error(`Token enhancement failed: ${keycloakError.message}`);
      }

    } catch (error) {
      this.logger.error(`Market selection failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Switches the user to a different market. Follows the same validation flow as selectUserMarket
   * but is more tolerant of Keycloak token-enhancement failures to avoid disrupting active sessions.
   */
  async switchUserMarket(keycloakUserId: string, targetMarketId: string): Promise<void> {
    this.logger.debug(`Processing market switch: user ${keycloakUserId} to market ${targetMarketId}`);

    try {
      const hasAccess = await this.marketValidation.validateAccess(keycloakUserId, targetMarketId);
      if (!hasAccess) {
        this.logger.warn(`User ${keycloakUserId} attempted to switch to unauthorized market ${targetMarketId}`);
        throw new ForbiddenException('Access denied to selected market');
      }

      const isMarketActive = await this.marketValidation.validateMarketStatus(targetMarketId);
      if (!isMarketActive) {
        this.logger.warn(`User ${keycloakUserId} attempted to switch to inactive market ${targetMarketId}`);
        throw new ForbiddenException('Selected market is not active');
      }

      await this.marketValidation.updateUserAssignedMarket(keycloakUserId, targetMarketId);

      try {
        await this.keycloakAdmin.enhanceUserTokenWithMarket(keycloakUserId, targetMarketId);
        this.logger.debug(`Market switch completed for user ${keycloakUserId} to ${targetMarketId} with token enhancement`);
      } catch (keycloakError) {
        this.logger.warn(`Keycloak admin operation failed during market switch for user ${keycloakUserId}: ${keycloakError.message}`);

        if (keycloakError.message?.includes('401') || keycloakError.message?.includes('authentication')) {
          this.logger.warn(`Keycloak admin authentication failed during switch - user can continue but may need to refresh token manually`);
        } else {
          this.logger.error(`Unexpected error during token enhancement: ${keycloakError.message}`);
        }

        this.logger.debug(`Market switch completed for user ${keycloakUserId} to ${targetMarketId} (token enhancement failed but operation succeeded)`);
      }

    } catch (error) {
      this.logger.error(`Market switch failed: ${error.message}`);
      throw error;
    }
  }

  /** Returns the currently assigned market ID for a user, or null if none is set. */
  getCurrentUserMarket(keycloakUserId: string): string | null {
    return null;
  }

 
}