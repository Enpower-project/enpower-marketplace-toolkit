import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { distinctUntilChanged } from 'rxjs/operators';
import { MatIconModule } from '@angular/material/icon';
import { HourlyOfferService } from '../services/hourly-offer.service';
import { Session } from '../../../shared/models/session.model';
import { MarketAuthService } from '../../../core/services/auth/market-auth.service';
import { MarketSelectionService } from '../../../core/services/market-selection/market-selection.service';
import { MarketFactoryService } from '../../market-factory/services/market-factory.service';

@Component({
  selector: 'app-published-sessions-list',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: './published-sessions-list.component.html',
  styleUrls: ['./published-sessions-list.component.css']
})
export class PublishedSessionsListComponent implements OnInit, OnDestroy {
  sessions: Session[] = [];
  loading = false;
  error: string | null = null;
  currentMarketId: string | null = null;
  private subscription = new Subscription();
  isMarketDeactivated = false;

  constructor(
    private hourlyOfferService: HourlyOfferService,
    private router: Router,
    private marketAuthService: MarketAuthService,
    private marketSelectionService: MarketSelectionService,
    private marketFactoryService: MarketFactoryService
  ) { }

  ngOnInit(): void {
    this.setupSubscriptions();

    // Only load if there's a selected market
    const marketId = this.marketSelectionService.getSelectedMarket();
    if (marketId) {
      this.currentMarketId = marketId;
      this.loadActiveSessions();
    }
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
  }

  private setupSubscriptions(): void {
    // Subscribe to selected market changes to reload sessions when market changes
    this.subscription.add(
      this.marketSelectionService.selectedMarket$.subscribe(marketId => {
        // Only process if market context is ready
        if (!this.marketAuthService.isMarketContextReady()) {
          this.loading = true;
          return;
        }

        if (marketId) {
          // Check if market actually changed before reloading
          if (marketId !== this.currentMarketId) {
            this.currentMarketId = marketId;
            this.loadActiveSessions();
          }
        } else {
          // No market selected - clear data
          this.currentMarketId = null;
          this.sessions = [];
          this.loading = false;
        }
      })
    );
  }

  loadActiveSessions(): void {
    // Don't load if no market selected
    if (!this.currentMarketId) {
      this.sessions = [];
      this.loading = false;
      return;
    }

    this.loading = true;
    this.error = null;

    this.marketFactoryService.getMarketById(this.currentMarketId).subscribe({
      next: (market: any) => {
        this.isMarketDeactivated = market.state === 'DEACTIVATED';
      },
      error: () => this.isMarketDeactivated = false
    });

    this.hourlyOfferService.getActiveSessions().subscribe({
      next: (response) => {
        this.sessions = response.data;
        this.loading = false;
      },
      error: (error) => {
        this.error = 'Error loading active sessions';
        this.loading = false;
      }
    });
  }

  viewSessionBids(sessionId: string): void {
    this.router.navigate(['/prosumer-offers/session', sessionId]);
  }

  onCardClick(sessionId: string): void {
    if (!this.isMarketDeactivated) {
      this.viewSessionBids(sessionId);
    }
  }

  getAvailableBidsCount(session: Session): number {
    return session.bids.filter(bid => !bid.isFull).length;
  }

  getTotalBidsCount(session: Session): number {
    return session.bids.length;
  }
}
