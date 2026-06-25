import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';
import { Subscription } from 'rxjs';
import { MarketAuthService } from '../../../core/services/auth/market-auth.service';
import { MarketSelectionService, AvailableMarketsResponse } from '../../../core/services/market-selection/market-selection.service';
import { KeycloakService } from '../../../core/services/keycloak/keycloak.service';
import { MarketFactoryService } from '../../../features/market-factory/services/market-factory.service';
import { MarketState } from '../../../features/market-factory/enums/market-enums';

@Component({
  selector: 'app-market-info',
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    MatButtonModule,
    MatMenuModule,
    MatTooltipModule,
    MatDividerModule
  ],
  templateUrl: './market-info.component.html',
  styleUrl: './market-info.component.css'
})
export class MarketInfoComponent implements OnInit, OnDestroy {
  currentMarket: string | null = null;
  availableMarkets: string[] = [];
  isLoading = true;
  hasError = false;
  loadingMarkets = false;
  isSwitching = false;
  shouldShowMarketInfo = true; // Controls visibility based on user role
  shouldShowMarketInfo2 = true;
  isMarketDeactivated = false;
  private subscription: Subscription = new Subscription();

  constructor(
    private marketAuthService: MarketAuthService,
    private marketSelectionService: MarketSelectionService,
    private keycloakService: KeycloakService,
    private marketFactoryService: MarketFactoryService
  ) { }

  ngOnInit(): void {
    // Check if user has market_crud role - they should not see market info
    const hasMarketplaceAdminRole = this.keycloakService.hasRole('MARKETPLACE_ADMIN');
    this.shouldShowMarketInfo = !hasMarketplaceAdminRole;

    if (!this.shouldShowMarketInfo) {
      this.isLoading = false;
      return;
    }

    // 🎯 Start with NO market selected and NOT loading
    // This ensures we show "No market selected" initially until market is confirmed
    this.currentMarket = null;
    this.isLoading = false;
    
    
    // Subscribe to marketContextReady to clear market info on logout/login
    this.subscription.add(
      this.marketAuthService.marketContextReady$.subscribe(isReady => {
        if (!isReady) {
          // Context not ready - clear current market display and stop loading
          this.currentMarket = null;
          this.isLoading = false;
        } else {
          // Context is now ready - check current market and display it
          const currentMarket = this.marketSelectionService.getSelectedMarket();

          if (currentMarket) {
          this.marketFactoryService.getMarketById(currentMarket).subscribe({
            next: (market: any) => {
              this.isMarketDeactivated = (market.state || market.status) === 'DEACTIVATED';
            },
            error: () => {
              this.isMarketDeactivated = false
            }
          });
        }
          
          this.currentMarket = currentMarket;
          this.isLoading = false;
        }
      })
    );

    // Load available markets
    this.loadAvailableMarkets();
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
  }

  getMarketDisplayName(marketId: string): string {
    return this.marketSelectionService.getMarketName(marketId);
  }

  getTooltipText(): string {
    if (this.isSwitching) {
      return 'Switching market...';
    }
    if (this.availableMarkets.length > 1) {
      return `Current market: ${this.getMarketDisplayName(this.currentMarket || '')} (Click to switch)`;
    }
    return `Current market: ${this.getMarketDisplayName(this.currentMarket || '')}`;
  }

  switchToMarket(marketId: string): void {
    if (marketId === this.currentMarket || this.isSwitching) {
      return;
    }

    this.isSwitching = true;

    this.marketAuthService.switchMarket(marketId).subscribe({
      next: (success) => {
        if (success) {
          // Reload the entire page to refresh all components with new market context
          window.location.reload();
        } else {
          this.isSwitching = false;
          // Could show a snackbar or error message
        }
      },
      error: (error) => {
        this.isSwitching = false;
        // Could show a snackbar or error message
      }
    });
  }

  refreshMarkets(): void {
    this.loadingMarkets = true;

    this.marketSelectionService.getAvailableMarkets().subscribe({
      next: (response: AvailableMarketsResponse) => {
        this.availableMarkets = response.availableMarkets || [];
        this.loadingMarkets = false;
      },
      error: (error) => {
        this.loadingMarkets = false;
      }
    });
  }

  private loadAvailableMarkets(): void {
    // Load available markets when component initializes
    this.marketSelectionService.getAvailableMarkets().subscribe({
      next: (response: AvailableMarketsResponse) => {
        this.availableMarkets = response.availableMarkets || [];
      },
      error: (error) => {
        this.availableMarkets = [];
      }
    });
  }
}
