import { Component, Inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MarketFactoryService } from '../services/market-factory.service';
import { MarketState } from '../enums/market-enums';
import { ToastNotificationComponent } from '../../../shared/components/toast-notification/toast-notification.component';
import { MarketSelectionService } from '../../../core/services/market-selection/market-selection.service';

export interface PendingMarket {
  id: string;
  name: string;
  description: string;
  state: string;
  createdAt: string;
}

export interface MarketAcceptanceModalData {
  pendingMarkets: PendingMarket[];
  userEmail: string;
}

@Component({
  selector: 'app-market-acceptance-modal',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressSpinnerModule
  ],
  templateUrl: './market-acceptance-modal.component.html',
  styleUrl: './market-acceptance-modal.component.css'
})
export class MarketAcceptanceModalComponent implements OnInit, OnDestroy {
  acceptedMarkets = new Set<string>();
  rejectedMarkets = new Set<string>();
  isProcessing = false;
  private autoCloseTimer: any;

  constructor(
    private dialogRef: MatDialogRef<MarketAcceptanceModalComponent>,
    @Inject(MAT_DIALOG_DATA) public data: MarketAcceptanceModalData,
    private marketFactoryService: MarketFactoryService,
    private marketSelectionService: MarketSelectionService
  ) { }

  ngOnInit(): void {
  }

  ngOnDestroy(): void {
    // Clear timer if component is destroyed
    if (this.autoCloseTimer) {
      clearTimeout(this.autoCloseTimer);
    }
  }

  trackByMarketId(index: number, market: PendingMarket): string {
    return market.id;
  }

  getStateDisplay(state: string): string {
    switch (state) {
      case MarketState.CREATED_OFFLINE_PENDING_ACCEPTATION:
        return 'Pending Acceptance';
      case MarketState.CREATED_OFFLINE_ACCEPTED:
        return 'Accepted';
      case MarketState.CREATED_OFFLINE_REJECTED:
        return 'Rejected';
      case MarketState.CREATED_OFFLINE_EXPIRED:
        return 'Expired';
      case MarketState.WALLET_CREATED_PENDING_ACTIVATION:
        return 'Wallet Created - Pending Activation';
      case MarketState.ACTIVE_ONCHAIN:
        return 'Active on Blockchain';
      default:
        return state;
    }
  }

  acceptMarket(market: PendingMarket): void {
    this.isProcessing = true;

    this.marketFactoryService.acceptMarket(market.id).subscribe({
      next: (response) => {
        if (response.success) {
          this.acceptedMarkets.add(market.id);
          market.state = MarketState.CREATED_OFFLINE_ACCEPTED;
          
          // Persist the market using the service (handles both in-memory and localStorage)
          this.marketSelectionService.setSelectedMarket(market.id, market.name);
          
          ToastNotificationComponent.show(`Market "${market.name}" accepted! Window will close in 3 seconds...`, 'success');
          this.isProcessing = false;
          
          // Auto-close modal after 3 seconds
          this.autoCloseTimer = setTimeout(() => {
            this.dialogRef.close({
              completed: true,
              acceptedMarkets: Array.from(this.acceptedMarkets),
              rejectedMarkets: Array.from(this.rejectedMarkets)
            });
          }, 3000);
        } else {
          ToastNotificationComponent.show(`Failed to accept market: ${response.message || 'Unknown error'}`, 'error');
          this.isProcessing = false;
        }
      },
      error: (error) => {
        ToastNotificationComponent.show('Error accepting market', 'error');
        this.isProcessing = false;
      }
    });
  }

  rejectMarket(market: PendingMarket): void {
    this.isProcessing = true;

    this.marketFactoryService.rejectMarket(market.id).subscribe({
      next: (response) => {
        if (response.success) {
          this.rejectedMarkets.add(market.id);
          // Update market state to Rejected
          market.state = MarketState.CREATED_OFFLINE_REJECTED;
          ToastNotificationComponent.show(`Market "${market.name}" rejected successfully`, 'success');
        } else {
          ToastNotificationComponent.show(`Failed to reject market: ${response.message || 'Unknown error'}`, 'error');
        }
        this.isProcessing = false;
      },
      error: (error) => {
        ToastNotificationComponent.show(`Error rejecting market "${market.name}"`, 'error');
        this.isProcessing = false;
      }
    });
  }

  postpone(): void {
    this.dialogRef.close({
      postponed: true,
      acceptedMarkets: Array.from(this.acceptedMarkets),
      rejectedMarkets: Array.from(this.rejectedMarkets)
    });
  }
}
