import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router } from '@angular/router';
import { MarketFactoryService } from '../services/market-factory.service';
import { MyMarket, MyMarketsResponse } from '../../../shared/models/market-place/market-model';

@Component({
  selector: 'app-my-markets',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatProgressSpinnerModule
  ],
  templateUrl: './my-markets.component.html',
  styleUrls: ['./my-markets.component.css']
})
export class MyMarketsComponent implements OnInit {
  markets: MyMarket[] = [];
  loading = false;
  error: string | null = null;
  userInfo: { count: number; userEmail: string } | null = null;

  private readonly marketFactoryService = inject(MarketFactoryService);
  private readonly router = inject(Router);

  ngOnInit(): void {
    this.loadMyMarkets();
  }

  loadMyMarkets(): void {
    this.loading = true;
    this.error = null;

    this.marketFactoryService.getMyMarkets().subscribe({
      next: (response: MyMarketsResponse) => {
        this.loading = false;
        if (response.success) {
          this.markets = response.data.markets;
          this.userInfo = {
            count: response.data.count,
            userEmail: response.data.userEmail
          };
        } else {
          this.error = response.message || 'Failed to load markets';
        }
      },
      error: (error: any) => {
        this.loading = false;
        this.error = 'Failed to load your markets. Please try again.';
      }
    });
  }

  getStatusClass(state: string): string {
    switch (state) {
      case 'CREATED_OFFLINE':
        return 'status-created';
      case 'PENDING_ACTIVATION':
        return 'status-pending';
      case 'ACTIVE_ONCHAIN':
        return 'status-active';
      default:
        return '';
    }
  }

  getStatusLabel(state: string): string {
    switch (state) {
      case 'CREATED_OFFLINE':
        return 'Created';
      case 'PENDING_ACTIVATION':
        return 'Pending';
      case 'ACTIVE_ONCHAIN':
        return 'Active';
      default:
        return state;
    }
  }

  // Método para calcular correctamente si un market está activo
  isMarketActive(market: MyMarket): boolean {
    return market.state === 'ACTIVE_ONCHAIN';
  }

  formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString();
  }

  viewMarket(market: MyMarket): void {
    // Navigate to market details or marketplace
    this.router.navigate(['/markets', market.id]);
  }

  editMarket(market: MyMarket): void {
    // Navigate to edit market passing the market data in the navigation state
    this.router.navigate(['/markets/edit', market.id], {
      state: { marketData: market }
    });
  }

  createNewMarket(): void {
    this.router.navigate(['/markets/create']);
  }
}
