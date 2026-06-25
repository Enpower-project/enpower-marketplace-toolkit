import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { SettlementHttpService } from '../../../core/services/settlement/settlement.http.service';
import { Settlement, SettlementStatus, DeviationType } from '../../../core/services/settlement/settlement.types';

@Component({
  selector: 'app-my-settlements',
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    MatTableModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatChipsModule,
    MatTooltipModule,
  ],
  templateUrl: './my-settlements.component.html',
  styleUrls: ['./my-settlements.component.css']
})
export class MySettlementsComponent implements OnInit {
  settlements: Settlement[] = [];
  loading = false;
  error: string | null = null;

  totalPayment = '0';
  totalPenalties = '0';
  totalCollateralForfeited = '0';

  displayedColumns = ['deliveryDate', 'hourSlot', 'deliveredQuantity', 'deviationPercentage', 'collateral', 'payment', 'nft', 'status', 'actions'];

  constructor(private settlementService: SettlementHttpService) { }

  ngOnInit(): void {
    this.loadMySettlements();
  }

  loadMySettlements(): void {
    this.loading = true;
    this.error = null;

    this.settlementService.getMySettlements().subscribe({
      next: (settlements) => {
        this.settlements = settlements;
        this.calculateTotals();
        this.loading = false;
      },
      error: (err) => {
        this.error = err.message || 'Error loading settlements';
        this.loading = false;
      }
    });
  }

  private calculateTotals(): void {
    let totalPayment = BigInt(0);
    let totalPenalties = BigInt(0);
    let totalForfeited = BigInt(0);

    for (const s of this.settlements) {
      if (s.status === SettlementStatus.EXECUTED) {
        totalPayment += BigInt(s.payment || '0');
        totalPenalties += BigInt(s.penaltyAmount || '0');
        totalForfeited += BigInt(s.collateralForfeited || '0');
      }
    }

    this.totalPayment = totalPayment.toString();
    this.totalPenalties = totalPenalties.toString();
    this.totalCollateralForfeited = totalForfeited.toString();
  }

  getStatusClass(status: SettlementStatus): string {
    switch (status) {
      case SettlementStatus.PENDING:
        return 'status-pending';
      case SettlementStatus.CALCULATED:
        return 'status-calculated';
      case SettlementStatus.SUBMITTED:
        return 'status-submitted';
      case SettlementStatus.EXECUTED:
        return 'status-executed';
      case SettlementStatus.FAILED:
        return 'status-failed';
      default:
        return '';
    }
  }

  getStatusLabel(status: SettlementStatus): string {
    switch (status) {
      case SettlementStatus.PENDING:
        return 'Pending';
      case SettlementStatus.CALCULATED:
        return 'Calculated';
      case SettlementStatus.SUBMITTED:
        return 'Submitted';
      case SettlementStatus.EXECUTED:
        return 'Executed';
      case SettlementStatus.FAILED:
        return 'Failed';
      default:
        return status;
    }
  }

  getDeviationClass(deviationType?: DeviationType): string {
    if (!deviationType) return '';
    switch (deviationType) {
      case DeviationType.OVER_DELIVERY:
        return 'deviation-over';
      case DeviationType.UNDER_DELIVERY:
        return 'deviation-under';
      case DeviationType.EXACT:
        return 'deviation-exact';
      default:
        return '';
    }
  }

  getDeviationLabel(deviationType?: DeviationType): string {
    if (!deviationType) return '';
    switch (deviationType) {
      case DeviationType.OVER_DELIVERY:
        return 'Over';
      case DeviationType.UNDER_DELIVERY:
        return 'Under';
      case DeviationType.EXACT:
        return 'Exact';
      default:
        return '';
    }
  }

  formatWei(wei: string): string {
    if (!wei) return '0';
    const value = parseFloat(wei) / 1e18;
    return value.toFixed(4);
  }

  formatDate(dateString: string): string {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  }

  countByStatus(status: string): number {
    return this.settlements.filter(s => s.status === status).length;
  }
}
