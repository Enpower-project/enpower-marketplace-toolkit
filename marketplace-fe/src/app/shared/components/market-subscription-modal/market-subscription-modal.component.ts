import { Component, OnInit, Output, EventEmitter, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MarketSelectionService, MarketInfo } from '../../../core/services/market-selection/market-selection.service';
import { KeycloakService } from '../../../core/services/keycloak/keycloak.service';
import { Router } from '@angular/router';
import { ToastNotificationComponent } from '../toast-notification/toast-notification.component';
import { MarketFactoryService } from '../../../features/market-factory/services/market-factory.service';
import { Market } from '../../models/market-place/market-model';
import { forkJoin } from 'rxjs';

@Component({
  selector: 'app-market-subscription-modal',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressSpinnerModule
  ],
  templateUrl: './market-subscription-modal.component.html',
  styleUrl: './market-subscription-modal.component.css'
})
export class MarketSubscriptionModalComponent implements OnInit {
  @Output() marketSelected = new EventEmitter<{ marketId: string; marketName: string }>();

  markets: MarketInfo[] = [];
  marketsFull: Market[] = [];
  loading = false;
  error: string | null = null;
  selectingMarketId: string | null = null;

  constructor(
    private marketSelectionService: MarketSelectionService,
    private marketFactoryService: MarketFactoryService,
    private keycloakService: KeycloakService,
    private router: Router,
    public dialogRef: MatDialogRef<MarketSubscriptionModalComponent>
  ) { }

  ngOnInit(): void {
    this.loadUserMarkets();
  }

  loadUserMarkets(): void {
  this.marketsFull = [];
  this.loading = true;
  this.error = null;

  this.marketSelectionService.getAvailableMarkets().subscribe({
    next: (response) => {
      if (response.availableMarketsWithNames && response.availableMarketsWithNames.length > 0) {
        this.markets = response.availableMarketsWithNames;
      } else {
        this.markets = [];
        this.error = 'No markets available for this user.';
        this.loading = false;
        return;
      }

      const marketRequests = response.availableMarkets.map(marketId =>
        this.marketFactoryService.getMarketById(marketId)
      );

      forkJoin(marketRequests).subscribe({
        next: (markets) => {
          this.marketsFull = markets;
          this.loading = false;

          if (this.marketsFull.length === 1) {
            this.selectMarket(this.marketsFull[0]);
          }
        },
        error: () => {
          this.loading = false;
        }
      });
    },
    error: () => {
      this.error = 'Failed to load available markets. Please try again.';
      this.loading = false;
    }
  });
}

  selectMarket(market: Market): void {
    if (this.selectingMarketId) return;

    if (!market.id) {
      this.error = 'Invalid market ID';
      return;
    }

    this.selectingMarketId = market.id;
    this.error = null;

    this.marketSelectionService.selectMarket(market.id).subscribe({
      next: (response) => {
        this.selectingMarketId = null;
        if (response.success) {
          // Update the selected market with both ID and name in cache
          this.marketSelectionService.setSelectedMarket(response.marketId, market.name);

          this.marketSelected.emit({
            marketId: response.marketId,
            marketName: market.name
          });

          // Show success toast notification
          ToastNotificationComponent.show(
            `Market "${market.name}" selected successfully!`,
            'success'
          );

          this.dialogRef.close({
            selected: true,
            marketId: response.marketId,
            marketName: market.name,
            requiresTokenRefresh: response.requiresTokenRefresh
          });
        }
      },
      error: (error) => {
        this.selectingMarketId = null;
        this.error = error.error?.message || 'Failed to select market. Please try again.';
      }
    });
  }

  close(): void {
    // Modal no se puede cerrar sin seleccionar un mercado
    // this.dialogRef.close({ selected: false });
  }
}
