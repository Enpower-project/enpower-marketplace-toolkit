import { Component, Input } from '@angular/core';
import { UpperCasePipe } from '@angular/common';

export interface OfferingStats {
  name: string;
  total: number;
  errors: number;
}

@Component({
  selector: 'app-offering-performance',
  imports: [UpperCasePipe],
  templateUrl: './offering-performance.component.html',
  styleUrl: './offering-performance.component.css',
})
export class OfferingPerformanceComponent {
  @Input() offerings: OfferingStats[] = [];
  @Input() grandTotal: number = 1;

  getBarWidth(total: number): string {
    if (!this.grandTotal) return '0%';
    return `${Math.min((total / this.grandTotal) * 100, 100)}%`;
  }
}
