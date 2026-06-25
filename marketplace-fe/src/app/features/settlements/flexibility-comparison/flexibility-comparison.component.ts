import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { DeviationType } from '../../../core/services/settlement/settlement.types';

export interface FlexibilityComparison {
  offerId: number;
  hourSlot: number;
  deliveryDate: string;
  theoretical: string;
  actual: string;
  deviation: number;
  deviationType: DeviationType;
  price: string;
  penalty: string;
}

@Component({
  selector: 'app-flexibility-comparison',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatIconModule,
    MatProgressBarModule,
  ],
  templateUrl: './flexibility-comparison.component.html',
  styleUrls: ['./flexibility-comparison.component.css']
})
export class FlexibilityComparisonComponent implements OnInit {
  @Input() comparison!: FlexibilityComparison;

  theoreticalValue: number = 0;
  actualValue: number = 0;
  deviationPercentage: number = 0;
  progressValue: number = 0;

  ngOnInit(): void {
    if (this.comparison) {
      this.theoreticalValue = parseFloat(this.comparison.theoretical) / 1e18;
      this.actualValue = parseFloat(this.comparison.actual) / 1e18;
      this.deviationPercentage = this.comparison.deviation;
      this.progressValue = (this.actualValue / this.theoreticalValue) * 100;
    }
  }

  getDeviationClass(): string {
    switch (this.comparison.deviationType) {
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

  getDeviationIcon(): string {
    switch (this.comparison.deviationType) {
      case DeviationType.OVER_DELIVERY:
        return 'trending_up';
      case DeviationType.UNDER_DELIVERY:
        return 'trending_down';
      case DeviationType.EXACT:
        return 'check_circle';
      default:
        return 'remove';
    }
  }

  getProgressClass(): string {
    if (this.progressValue >= 95 && this.progressValue <= 105) {
      return 'progress-good';
    } else if (this.progressValue >= 75 && this.progressValue < 95) {
      return 'progress-warning';
    } else {
      return 'progress-danger';
    }
  }

  formatWei(wei: string): string {
    if (!wei) return '0.0000';
    const value = parseFloat(wei) / 1e18;
    return value.toFixed(4);
  }
}
