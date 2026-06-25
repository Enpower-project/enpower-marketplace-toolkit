import { Component, Input, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TreasuryService, TreasuryBalance } from '../../../core/services/treasury/treasury.service';
import { ethers } from 'ethers';

@Component({
  selector: 'app-treasury-balance',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatProgressSpinnerModule,
    MatIconModule,
    MatTooltipModule
  ],
  templateUrl: './treasury-balance.component.html',
  styleUrls: ['./treasury-balance.component.css']
})
export class TreasuryBalanceComponent implements OnInit, OnChanges {
  @Input() walletAddress: string = '';
  @Input() autoRefresh: boolean = false;
  @Input() refreshInterval: number = 30000; // 30 seconds

  balance: TreasuryBalance | null = null;
  loading: boolean = false;
  error: string | null = null;

  // Formatted values for display
  depositedFormatted: string = '0';
  lockedFormatted: string = '0';
  availableFormatted: string = '0';
  lockedPercentageFormatted: string = '0';

  private refreshTimer: any;

  constructor(private treasuryService: TreasuryService) {}

  ngOnInit(): void {
    if (this.walletAddress) {
      this.loadBalance();

      if (this.autoRefresh) {
        this.startAutoRefresh();
      }
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['walletAddress'] && !changes['walletAddress'].firstChange) {
      this.loadBalance();
    }
  }

  ngOnDestroy(): void {
    this.stopAutoRefresh();
  }

  loadBalance(): void {
    if (!this.walletAddress) {
      this.error = 'Wallet address is required';
      return;
    }

    this.loading = true;
    this.error = null;

    this.treasuryService.getBalanceSummary(this.walletAddress).subscribe({
      next: (balance) => {
        this.balance = balance;
        this.formatBalances();
        this.loading = false;
      },
      error: () => {
        this.error = 'Failed to load treasury balance';
        this.loading = false;
      }
    });
  }

  /** Converts raw wei amounts to human-readable FLEX token strings for the template. */
  private formatBalances(): void {
    if (!this.balance) return;

    try {
      this.depositedFormatted = this.formatWeiToToken(this.balance.collateralDeposited);
      this.lockedFormatted = this.formatWeiToToken(this.balance.collateralLocked);
      this.availableFormatted = this.formatWeiToToken(this.balance.availableBalance);

      // Locked percentage is stored as basis points (e.g. 5000 = 50.00%)
      const basisPoints = BigInt(this.balance.lockedPercentage);
      this.lockedPercentageFormatted = (Number(basisPoints) / 100).toFixed(2);
    } catch {
      // Leave formatted values at their default '0' on parse failure
    }
  }

  /** Formats a raw wei string into a localised FLEX token amount (18 decimals). */
  private formatWeiToToken(weiValue: string): string {
    try {
      const value = ethers.formatEther(weiValue);
      const num = parseFloat(value);
      return num.toLocaleString('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 4
      });
    } catch {
      return '0';
    }
  }

  private startAutoRefresh(): void {
    this.refreshTimer = setInterval(() => {
      this.loadBalance();
    }, this.refreshInterval);
  }

  private stopAutoRefresh(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  refresh(): void {
    this.loadBalance();
  }

  getLockedColor(): string {
    if (!this.balance) return 'accent';

    const percentage = Number(this.lockedPercentageFormatted);
    if (percentage >= 90) return 'warn';
    if (percentage >= 70) return 'accent';
    return 'primary';
  }
}
