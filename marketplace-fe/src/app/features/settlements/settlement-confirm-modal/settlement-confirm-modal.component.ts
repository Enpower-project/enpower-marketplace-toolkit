import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { SettlementCalculation, DeviationType } from '../../../core/services/settlement/settlement.types';

/**
 * Settlement confirmation modal with PIN input
 *
 * Shows:
 * - Settlement summary (delivered quantity, deviation, penalty)
 * - Payment breakdown (gross, fees, net)
 * - Collateral information (if applicable)
 * - 6-digit PIN input
 * - Confirm/Cancel buttons
 */
@Component({
  selector: 'app-settlement-confirm-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule],
  templateUrl: './settlement-confirm-modal.component.html',
  styleUrls: ['./settlement-confirm-modal.component.css']
})
export class SettlementConfirmModalComponent {
  @Input() title: string = 'Confirm Settlement';
  @Input() action: 'submit' | 'execute' | 'measurement' | 'finalize' = 'submit';
  @Input() calculation!: SettlementCalculation;

  @Output() close = new EventEmitter<void>();
  @Output() confirmed = new EventEmitter<string>();

  pin: string = '';
  submitting = false;
  error: string | null = null;
  showPin = false;

  /**
   * Converts wei to readable value
   */
  formatWei(wei: string): string {
    if (!wei) return '0';
    const value = parseFloat(wei) / 1e18;
    return value.toFixed(4);
  }

  /**
   * Formats percentage
   */
  formatPercentage(value: number): string {
    return value.toFixed(2);
  }

  /**
   * Checks if there is a penalty
   */
  hasPenalty(): boolean {
    return !!(this.calculation?.penaltyAmount && parseFloat(this.calculation.penaltyAmount) > 0);
  }

  /**
   * Checks if there is collateral
   */
  hasCollateral(): boolean {
    return !!(this.calculation?.collateralAmount && parseFloat(this.calculation.collateralAmount) > 0);
  }

  /**
   * Checks if collateral has been forfeited
   */
  hasCollateralForfeited(): boolean {
    return !!(this.calculation?.collateralForfeited && parseFloat(this.calculation.collateralForfeited) > 0);
  }

  /**
   * Checks if deviation is high (>5%)
   */
  isHighDeviation(): boolean {
    return (this.calculation?.deviationPercentage ?? 0) > 5;
  }

  /**
   * Gets the label for deviation type
   */
  getDeviationTypeLabel(): string {
    if (!this.calculation?.deviationType) return 'N/A';
    switch (this.calculation.deviationType) {
      case DeviationType.OVER_DELIVERY:
        return 'Over Delivery';
      case DeviationType.UNDER_DELIVERY:
        return 'Under Delivery';
      case DeviationType.EXACT:
        return 'Exact Delivery';
      default:
        return 'N/A';
    }
  }

  /**
   * Gets the CSS class for deviation type styling
   */
  getDeviationTypeClass(): string {
    if (!this.calculation?.deviationType) return '';
    switch (this.calculation.deviationType) {
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

  onSubmit(): void {
    this.error = null;

    if (!this.pin || this.pin.trim().length === 0) {
      this.error = 'PIN is required';
      return;
    }

    if (this.pin.length < 6) {
      this.error = 'PIN must be at least 6 digits';
      return;
    }

    this.confirmed.emit(this.pin);
  }

  onCancel(): void {
    this.close.emit();
  }

  togglePinVisibility(): void {
    this.showPin = !this.showPin;
  }

  setSubmitting(value: boolean): void {
    this.submitting = value;
  }

  setError(message: string): void {
    this.error = message;
  }

  clearPin(): void {
    this.pin = '';
  }

  isFinalize(): boolean {
    return this.action === 'finalize';
  }

  getActionLabel(): string {
    switch (this.action) {
      case 'measurement': return 'Submit Measurement Data';
      case 'finalize': return 'Finalize Session';
      case 'execute': return 'Execute Settlement';
      default: return 'Submit Settlement';
    }
  }

  getActionDescription(): string {
    switch (this.action) {
      case 'measurement':
        return 'This action will submit measurement data to the blockchain and advance the session status to SETTLEMENT_PENDING.';
      case 'finalize':
        return 'This action will finalize the session and set its status to SETTLED. All settlements must be Executed or Failed before finalizing. This action cannot be undone.';
      case 'execute':
        return 'This action will execute the settlement and process the payment. The FSP will receive the net payment and the NFT will be transferred to the FRP.';
      default:
        return 'This action will submit the settlement to the blockchain. Once submitted, you will need to execute it to process the payment.';
    }
  }

  /**
   * Checks if this is a measurement data submission (not a settlement)
   */
  isMeasurementData(): boolean {
    return this.action === 'measurement';
  }
}
