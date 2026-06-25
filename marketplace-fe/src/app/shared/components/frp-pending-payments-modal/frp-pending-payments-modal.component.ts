import { Component, OnInit, Inject, Optional } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { FormsModule } from '@angular/forms';
import { SettlementHttpService } from '../../../core/services/settlement/settlement.http.service';
import { MarketSelectionService } from '../../../core/services/market-selection/market-selection.service';
import { FrpPaymentRequest, FrpPaymentRequestStatus } from '../../../core/services/settlement/settlement.types';
import { ToastNotificationComponent } from '../toast-notification/toast-notification.component';

export interface FrpPendingPaymentsDialogData {
  pendingPayments: FrpPaymentRequest[];
}

/**
 * Modal component for FRP users to see and manage pending payment deposits
 */
@Component({
  selector: 'app-frp-pending-payments-modal',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    FormsModule,
  ],
  template: `
    <div class="frp-pending-payments-modal">
      <div class="modal-header">
        <mat-icon class="header-icon">account_balance_wallet</mat-icon>
        <h2>Pending Payment Deposits</h2>
        <button mat-icon-button (click)="close()" class="close-button">
          <mat-icon>close</mat-icon>
        </button>
      </div>

      <div class="modal-content">
        <p class="intro-text">
          You have {{ pendingPayments.length }} pending payment request{{ pendingPayments.length > 1 ? 's' : '' }}.
          Please deposit the required FLEX tokens to enable settlement execution.
        </p>

        <div class="payments-list">
          <div class="payment-item" *ngFor="let payment of pendingPayments">
            <div class="payment-header">
              <div class="payment-info">
                <span class="session-name">{{ payment.sessionName || 'Session' }}</span>
                <span class="market-name" *ngIf="payment.marketName">{{ payment.marketName }}</span>
              </div>
              <span class="status-badge" [ngClass]="'status-' + payment.status.toLowerCase()">
                {{ payment.status }}
              </span>
            </div>

            <div class="payment-details">
              <div class="detail-row">
                <span class="label">Total Settlements:</span>
                <span class="value">{{ payment.totalSettlements }}</span>
              </div>
              <div class="detail-row">
                <span class="label">Amount Required:</span>
                <span class="value amount">{{ formatWei(payment.totalPayment) }} FLEX</span>
              </div>
              <div class="detail-row" *ngIf="payment.emailSentAt">
                <span class="label">Requested:</span>
                <span class="value">{{ payment.emailSentAt | date:'medium' }}</span>
              </div>
            </div>

            <div class="payment-actions" *ngIf="payment.status === 'PENDING'">
              <div class="pin-input-group" *ngIf="selectedPaymentId === payment.id">
                <input
                  type="password"
                  [(ngModel)]="pin"
                  placeholder="Enter your PIN"
                  maxlength="6"
                  class="pin-input"
                  [disabled]="depositing"
                />
                <button
                  mat-raised-button
                  color="primary"
                  (click)="depositPayment(payment)"
                  [disabled]="!pin || pin.length < 4 || depositing"
                >
                  <mat-spinner *ngIf="depositing" diameter="18"></mat-spinner>
                  <span *ngIf="!depositing">Confirm Deposit</span>
                </button>
                <button mat-button (click)="cancelDeposit()">Cancel</button>
              </div>
              <button
                mat-raised-button
                color="primary"
                *ngIf="selectedPaymentId !== payment.id"
                (click)="selectPayment(payment)"
                class="deposit-button"
              >
                <mat-icon>account_balance_wallet</mat-icon>
                Deposit {{ formatWei(payment.totalPayment) }} FLEX
              </button>
            </div>

            <div class="payment-actions" *ngIf="payment.status === 'DEPOSITED'">
              <div class="deposited-info">
                <mat-icon>check_circle</mat-icon>
                <span>Deposited {{ formatWei(payment.depositedAmount || '0') }} FLEX</span>
              </div>
            </div>
          </div>
        </div>

        <div class="error-message" *ngIf="error">
          <mat-icon class="error-icon">error_outline</mat-icon>
          <div class="error-content">
            <strong class="error-title">Oops! Something went wrong</strong>
            <p class="error-text">{{ error }}</p>
          </div>
          <button mat-icon-button (click)="error = null" class="error-close">
            <mat-icon>close</mat-icon>
          </button>
        </div>
      </div>

      <div class="modal-footer">
        <button mat-button (click)="close()">Close</button>
        <button mat-raised-button color="accent" (click)="goToSettlements()" *ngIf="pendingPayments.length > 0">
          View Settlements
        </button>
      </div>
    </div>
  `,
  styles: [`
    .frp-pending-payments-modal {
      min-width: 500px;
      max-width: 600px;
    }

    .modal-header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 20px 24px;
      border-bottom: 1px solid #e0e0e0;
      background: linear-gradient(135deg, #274b95 0%, #274b95 100%);
      color: white;
      border-radius: 4px 4px 0 0;
    }

    .header-icon {
      font-size: 32px;
      width: 32px;
      height: 32px;
    }

    .modal-header h2 {
      margin: 0;
      flex: 1;
      font-size: 1.25rem;
    }

    .close-button {
      color: white;
      transition: all 0.3s ease;
      transform: scale(1);
    }

    .close-button:hover {
      transform: scale(1.1) rotate(90deg);
    }

    .modal-content {
      padding: 24px;
      max-height: 400px;
      overflow-y: auto;
    }

    .intro-text {
      margin: 0 0 20px 0;
      color: #666;
      line-height: 1.5;
    }

    .payments-list {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .payment-item {
      background: white;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 12px;
      transition: all 0.3s ease;
    }

    .payment-item:hover {
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
      border-color: #3B7DBF;
    }

    .payment-item {
      background: white;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 12px;
      transition: all 0.3s ease;
    }

    .payment-item:hover {
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
      border-color: #3B7DBF;
    }

    .payment-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }

    .payment-info {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .session-name {
      font-weight: 600;
      color: #333;
    }

    .market-name {
      font-size: 0.85rem;
      color: #666;
    }

    .status-badge {
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
    }

    .status-pending {
      background: #e3f2fd;
      color: #3B7DBF;
    }

    .status-deposited {
      background: #e8f5e9;
      color: #388e3c;
    }

    .payment-details {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-bottom: 16px;
    }

    .detail-row {
      display: flex;
      justify-content: space-between;
    }

    .detail-row .label {
      color: #666;
      font-size: 0.9rem;
    }

    .detail-row .value {
      font-weight: 500;
      color: #333;
    }

    .detail-row .value.amount {
      color: #3B7DBF;
      font-weight: 600;
      font-size: 1.1rem;
    }

    .payment-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }

    .payment-actions button[mat-raised-button][color="primary"] {
      background: linear-gradient(135deg, #3B7DBF 0%, #2D5A8C 100%);
      color: white;
      border: none;
      font-weight: 600;
      padding: 10px 20px;
      transition: all 0.3s ease;
      box-shadow: 0 2px 8px rgba(59, 125, 191, 0.3);
    }

    .payment-actions button[mat-raised-button][color="primary"]:hover:not(:disabled) {
      background: linear-gradient(135deg, #2D5A8C 0%, #1f3d5c 100%);
      box-shadow: 0 4px 16px rgba(59, 125, 191, 0.4);
      transform: translateY(-2px);
    }

    .payment-actions button[mat-raised-button][color="primary"]:active:not(:disabled) {
      transform: translateY(0);
      box-shadow: 0 2px 8px rgba(59, 125, 191, 0.3);
    }

    .payment-actions button[mat-raised-button][color="primary"] mat-icon {
      margin-right: 8px;
      font-size: 20px;
    }

    .deposit-button {
      padding: 10px 24px !important;
      font-size: 0.95rem !important;
      font-weight: 600 !important;
    }

    .payment-actions button[mat-button] {
      color: #666;
      text-decoration: none;
      transition: all 0.3s ease;
    }

    .payment-actions button[mat-button]:hover:not(:disabled) {
      color: #3B7DBF;
      background: #f0f7ff;
    }

    .pin-input-group {
      display: flex;
      align-items: center;
      gap: 12px;
      width: 100%;
      padding: 12px;
      background: #f0f7ff;
      border-radius: 8px;
      border-left: 4px solid #3B7DBF;
    }

    .pin-input {
      flex: 1;
      padding: 12px 14px;
      border: 1px solid #ddd;
      border-radius: 6px;
      font-size: 1rem;
      letter-spacing: 3px;
      font-weight: 600;
      background: white;
      transition: all 0.3s ease;
    }

    .pin-input:focus {
      outline: none;
      border-color: #3B7DBF;
      box-shadow: 0 0 0 3px rgba(59, 125, 191, 0.1);
      background: white;
    }

    .pin-input::placeholder {
      color: #bbb;
      letter-spacing: 1px;
      font-weight: 400;
    }

    .deposited-info {
      display: flex;
      align-items: center;
      gap: 8px;
      color: #4caf50;
      font-weight: 600;
      padding: 12px 16px;
      background: #e8f5e9;
      border-radius: 6px;
      border-left: 4px solid #4caf50;
    }

    .deposited-info mat-icon {
      font-size: 24px;
      width: 24px;
      height: 24px;
    }

    .error-message {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 14px 16px;
      background: #ffebee;
      border-radius: 6px;
      color: #c62828;
      margin-top: 16px;
      border-left: 4px solid #f44336;
      font-weight: 500;
    }

    .error-message .error-icon {
      font-size: 24px;
      width: 24px;
      height: 24px;
      flex-shrink: 0;
      margin-top: 2px;
    }

    .error-message .error-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .error-message .error-title {
      font-size: 0.95rem;
      font-weight: 700;
      color: #b71c1c;
    }

    .error-message .error-text {
      font-size: 0.85rem;
      margin: 0;
      line-height: 1.4;
      color: #c62828;
      font-weight: 500;
    }

    .error-message .error-close {
      flex-shrink: 0;
      color: #c62828;
      transition: all 0.3s ease;
    }

    .error-message .error-close:hover {
      color: #b71c1c;
      background: rgba(196, 40, 40, 0.08);
      transform: scale(1.1);
    }

    .modal-footer {
      display: flex;
      justify-content: flex-end;
      gap: 12px;
      padding: 16px 24px;
      border-top: 1px solid #e0e0e0;
      background: #f9f9f9;
    }

    .modal-footer button[mat-button] {
      color: #666;
      transition: all 0.3s ease;
    }

    .modal-footer button[mat-button]:hover:not(:disabled) {
      color: #3B7DBF;
      background: #f0f7ff;
    }

    .modal-footer button[mat-raised-button][color="accent"] {
      background: linear-gradient(135deg, #3B7DBF 0%, #2D5A8C 100%);
      color: white;
      border: none;
      font-weight: 600;
      transition: all 0.3s ease;
      box-shadow: 0 2px 8px rgba(59, 125, 191, 0.3);
    }

    .modal-footer button[mat-raised-button][color="accent"]:hover:not(:disabled) {
      background: linear-gradient(135deg, #2D5A8C 0%, #1f3d5c 100%);
      box-shadow: 0 4px 16px rgba(59, 125, 191, 0.4);
      transform: translateY(-2px);
    }

    .modal-footer button[mat-raised-button][color="accent"] mat-icon {
      margin-right: 8px;
    }
  `]
})
export class FrpPendingPaymentsModalComponent implements OnInit {
  pendingPayments: FrpPaymentRequest[] = [];
  selectedPaymentId: string | null = null;
  pin: string = '';
  depositing = false;
  error: string | null = null;

  constructor(
    private dialogRef: MatDialogRef<FrpPendingPaymentsModalComponent>,
    @Optional() @Inject(MAT_DIALOG_DATA) public data: FrpPendingPaymentsDialogData,
    private settlementService: SettlementHttpService,
    private marketSelectionService: MarketSelectionService,
    private router: Router,
  ) {
    if (data?.pendingPayments) {
      this.pendingPayments = data.pendingPayments;
    }
  }

  ngOnInit(): void {
    if (!this.data?.pendingPayments) {
      this.loadPendingPayments();
    }
  }

  async loadPendingPayments(): Promise<void> {
    try {
      const payments = await this.settlementService.getPendingPaymentsForFrp().toPromise();
      this.pendingPayments = payments || [];
    } catch (err: any) {
    }
  }

  selectPayment(payment: FrpPaymentRequest): void {
    this.selectedPaymentId = payment.id;
    this.pin = '';
    this.error = null;
  }

  cancelDeposit(): void {
    this.selectedPaymentId = null;
    this.pin = '';
    this.error = null;
  }

  async depositPayment(payment: FrpPaymentRequest): Promise<void> {
    if (!this.pin || this.pin.length < 4) {
      this.error = 'Please enter a valid PIN';
      return;
    }

    const marketId = payment.marketId || this.marketSelectionService.getSelectedMarket();
    if (!marketId) {
      this.error = 'Market ID is required';
      return;
    }

    try {
      this.depositing = true;
      this.error = null;

      const result = await this.settlementService.depositFrpPayment(
        payment.sessionAddress,
        this.pin,
        marketId
      ).toPromise();

      if (result?.success) {
        ToastNotificationComponent.show(
          `Successfully deposited ${this.formatWei(result.amount)} FLEX. TX: ${result.transactionHash.slice(0, 10)}...`,
          'success'
        );

        // Update local state
        const index = this.pendingPayments.findIndex(p => p.id === payment.id);
        if (index >= 0) {
          this.pendingPayments[index] = {
            ...this.pendingPayments[index],
            status: FrpPaymentRequestStatus.DEPOSITED,
            depositedAmount: result.amount,
            depositTxHash: result.transactionHash,
          };
        }

        this.cancelDeposit();
      }
    } catch (err: any) {
      this.error = this.getUserFriendlyErrorMessage(err);
    } finally {
      this.depositing = false;
    }
  }

  /**
   * Converts technical error messages into user-friendly messages
   */
  private getUserFriendlyErrorMessage(err: any): string {
    const errorMessage = err?.error?.message || err?.message || '';
    const errorCode = err?.error?.code || err?.code || '';

    // Map common error codes/messages to user-friendly messages
    const errorMap: { [key: string]: string } = {
      'INSUFFICIENT_BALANCE': 'Insufficient balance to complete this deposit.',
      'INVALID_PIN': 'The PIN you entered is incorrect. Please try again.',
      'PIN_LOCKED': 'Too many incorrect PIN attempts. Please wait before trying again.',
      'INVALID_AMOUNT': 'Invalid deposit amount. Please check the amount and try again.',
      'NETWORK_ERROR': 'Network error. Please check your connection and try again.',
      'TRANSACTION_FAILED': 'The deposit transaction failed. Please try again.',
      'WALLET_NOT_CONNECTED': 'Wallet is not connected. Please connect your wallet and try again.',
      'INSUFFICIENT_GAS': 'Insufficient gas for transaction. Please try again later.',
      'USER_REJECTED': 'Transaction was rejected. Please try again.',
    };

    // Check if error message contains any known error patterns
    for (const [key, friendlyMessage] of Object.entries(errorMap)) {
      if (errorMessage.toUpperCase().includes(key) || errorCode.toUpperCase().includes(key)) {
        return friendlyMessage;
      }
    }

    // Check for common HTTP error codes
    if (err?.status === 401) {
      return 'Authentication failed. Please log in again and try.';
    }
    if (err?.status === 403) {
      return 'You do not have permission to perform this action.';
    }
    if (err?.status === 404) {
      return 'Payment request not found. Please refresh and try again.';
    }
    if (err?.status === 500) {
      return 'Server error occurred. Please try again later.';
    }
    if (err?.status === 503) {
      return 'Service temporarily unavailable. Please try again later.';
    }

    // Fallback: if message looks like a technical error, show generic message
    if (errorMessage && errorMessage.length > 100) {
      return 'An error occurred while processing your deposit. Please try again.';
    }

    // Return original message if it's already user-friendly
    return errorMessage || 'Failed to deposit payment. Please try again.';
  }

  formatWei(wei: string | undefined): string {
    if (!wei) return '0';
    const value = parseFloat(wei) / 1e18;
    return value.toFixed(4);
  }

  goToSettlements(): void {
    if (this.pendingPayments.length > 0) {
      const firstPayment = this.pendingPayments[0];
      this.dialogRef.close();
      this.router.navigate(['/settlements/session/', firstPayment.sessionAddress]);
    }
  }

  close(): void {
    this.dialogRef.close();
  }
}
