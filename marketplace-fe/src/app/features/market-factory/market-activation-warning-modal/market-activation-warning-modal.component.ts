import { Component, Inject, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MarketFactoryService } from '../services/market-factory.service';
import { MarketFactoryHttpService } from '../../../core/services/blockchain/contracts/market-factory/market-factory.http.service';
import { ToastNotificationComponent } from '../../../shared/components/toast-notification/toast-notification.component';

export interface MarketActivationWarningData {
  marketId: string;
  marketName: string;
  marketDescription: string;
  region: string;
}

export interface MarketActivationWarningResult {
  marketActivated: boolean;
  activationData?: {
    txHash: string;
    contractAddress: string;
  };
}

export interface MarketActivationResponse {
  success: boolean;
  data?: {
    marketId: string;
    marketName: string;
    marketAddress: string;
    transactionHash: string;
    activatedAt: Date;
  };
  message: string;
}

@Component({
  selector: 'app-market-activation-warning-modal',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  templateUrl: './market-activation-warning-modal.component.html',
  styleUrl: './market-activation-warning-modal.component.css'
})
export class MarketActivationWarningModalComponent implements OnInit, OnDestroy {
  isActivatingMarket = false;
  marketActivated = false;
  activationData: { txHash: string; contractAddress: string } | null = null;
  isReloading = false;
  countdownSeconds = 2;

  // PIN verification states
  showPinRequest = false;
  pinCode = '';
  showPin = false;
  pinError = '';
  isVerifyingPin = false;
  isPinValid = false;
  isWalletLocked = false;
  resendCooldown = 0;
  private resendTimer?: any;

  constructor(
    private dialogRef: MatDialogRef<MarketActivationWarningModalComponent>,
    @Inject(MAT_DIALOG_DATA) public data: MarketActivationWarningData,
    private marketFactoryHttpService: MarketFactoryHttpService,
    private marketFactoryService: MarketFactoryService,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit(): void {
    // Component initialized
  }

  ngOnDestroy(): void {
    if (this.resendTimer) {
      clearInterval(this.resendTimer);
    }
  }

  onRequestPin(): void {
    this.showPinRequest = true;
    this.requestPinForMarket();
  }

  onCancelPin(): void {
    this.showPinRequest = false;
    this.pinCode = '';
    this.pinError = '';
    this.isPinValid = false;
    this.isWalletLocked = false;
  }

  onPinInput(event: any): void {
    const value = event.target.value;
    this.pinCode = value.replace(/\D/g, '').substring(0, 6); // Only numbers, max 6 digits
    this.isPinValid = this.pinCode.length === 6;
    this.pinError = '';
    this.isWalletLocked = false; // Reset lockout status when user starts typing
  }

  onVerifyPinAndActivate(): void {
    if (!this.isPinValid) {
      this.pinError = 'Please enter a valid 6-digit PIN';
      return;
    }

    this.isVerifyingPin = true;
    this.pinError = '';

    // Call the NEW backend endpoint with PIN verification (using new architecture)
    this.marketFactoryHttpService.activateMarketWithPin(this.data.marketId, this.pinCode).subscribe({
      next: (response: MarketActivationResponse) => {
        this.isVerifyingPin = false;
        if (response.success && response.data) {
          this.activationData = {
            txHash: response.data.transactionHash,
            contractAddress: response.data.marketAddress
          };
          this.marketActivated = true;
          this.isActivatingMarket = false;
          this.showPinRequest = false;
          this.isReloading = true;

          ToastNotificationComponent.show('Market activated successfully on blockchain! Reloading page...', 'success', 5000);

          // Countdown desde 2 segundos
          const countdownInterval = setInterval(() => {
            this.countdownSeconds--;
            if (this.countdownSeconds <= 0) {
              clearInterval(countdownInterval);
            }
          }, 1000);

          // Reload automático después de 2 segundos
          setTimeout(() => {
            window.location.reload();
          }, 2000);
        } else {
          this.handlePinError(response.message || 'Unknown error occurred');
        }
      },
      error: (error: any) => {
        this.isVerifyingPin = false;

        // Extract error message from various possible locations
        let errorMessage = 'Invalid PIN. Unknown error occurred.';

        // RFC7807 Problem Details format used by the backend - try all possible paths
        if (error.error?.errors && Array.isArray(error.error.errors) && error.error.errors.length > 0) {
          // RFC7807 format: { errors: [{ message: "actual error" }] }
          errorMessage = error.error.errors[0].message;
        } else if (error.error?.message) {
          // Standard NestJS error structure: { message: "actual error" }
          errorMessage = error.error.message;
        } else if (error.error && typeof error.error === 'string') {
          // Sometimes the error message is directly in error.error as string
          errorMessage = error.error;
        } else if (error.error?.error && typeof error.error.error === 'string') {
          // Some cases: { error: "actual error message" }
          errorMessage = error.error.error;
        } else if (error.message && !error.message.includes('Http failure response')) {
          // Last resort - direct error message if not HTTP wrapper
          errorMessage = error.message;
        }

        // If we still have HTTP error format, provide default English messages
        if (errorMessage.includes('Http failure response') ||
          errorMessage === 'Invalid PIN. Unknown error occurred.' ||
          errorMessage === 'Bad Request') {
          if (error.status === 400) {
            errorMessage = 'Invalid PIN. Please check the code and try again.';
          } else if (error.status === 401) {
            errorMessage = 'Wallet locked for security. Please try again later.';
          } else {
            errorMessage = 'Error activating market. Please try again.';
          }
        }

        // Handle different types of errors
        if (error.status === 400) {
          // Bad request - usually PIN-related errors
          this.handlePinError(errorMessage);
        } else if (error.status === 401) {
          // Unauthorized - usually lockout or authentication errors
          this.handlePinError(errorMessage);
        } else {
          // Other errors
          this.handlePinError(errorMessage);
        }
      }
    });
  }

  requestPinForMarket(): void {
    // Request a new PIN to be sent to the user's email
    this.marketFactoryService.requestActivationPin(this.data.marketId).subscribe({
      next: (response) => {
        if (response.success) {
          ToastNotificationComponent.show('PIN sent to your email address', 'info', 3000);
        } else {
          ToastNotificationComponent.show('Failed to send PIN. Please try again.', 'error', 3000);
        }
      },
      error: (error) => {
        ToastNotificationComponent.show('Failed to send PIN. Please try again.', 'error', 3000);
      }
    });
  }

  resendPin(): void {
    this.resendCooldown = 30; // 30 second cooldown
    this.requestPinForMarket();

    this.resendTimer = setInterval(() => {
      this.resendCooldown--;
      if (this.resendCooldown <= 0) {
        clearInterval(this.resendTimer);
        this.resendTimer = undefined;
      }
    }, 1000);
  }

  private handlePinError(message: string): void {
    this.pinError = message;
    this.pinCode = '';
    this.isPinValid = false;

    // Check if the error indicates a wallet lockout (only when truly locked with time restriction)
    this.isWalletLocked = message.toLowerCase().includes('wallet locked') ||
      message.toLowerCase().includes('try again in') ||
      (message.toLowerCase().includes('locked') && message.toLowerCase().includes('minutes'));

    // Force change detection
    this.cdr.detectChanges();

    // Show toast notification as fallback to ensure user sees the error
    if (!this.showPinRequest) {
      ToastNotificationComponent.show(message, 'error', 6000);
    }
  }

  onActivateMarket(): void {
    // Instead of direct activation, start PIN flow
    this.onRequestPin();
  }

  onActivateMarketDirect(): void {
    this.isActivatingMarket = true;

    this.marketFactoryService.activateMarket(this.data.marketId).subscribe({
      next: (response: MarketActivationResponse) => {
        if (response.success && response.data) {
          this.activationData = {
            txHash: response.data.transactionHash,
            contractAddress: response.data.marketAddress
          };
          this.marketActivated = true;
          this.isActivatingMarket = false;
          this.isReloading = true;

          ToastNotificationComponent.show('Market activated successfully on blockchain! Reloading page...', 'success', 5000);

          // Countdown desde 2 segundos
          const countdownInterval = setInterval(() => {
            this.countdownSeconds--;
            if (this.countdownSeconds <= 0) {
              clearInterval(countdownInterval);
            }
          }, 1000);

          // Reload automático después de 2 segundos
          setTimeout(() => {
            window.location.reload();
          }, 2000);
        } else {
          this.handleError(response.message || 'Unknown error occurred');
        }
      },
      error: (error) => {
        this.handleError(error.error?.message || error.message || 'Failed to activate market');
      }
    });
  }

  onCancel(): void {
    this.dialogRef.close({
      marketActivated: false
    });
  }

  onClose(): void {
    this.dialogRef.close({
      marketActivated: true,
      activationData: this.activationData
    });
  }

  copyToClipboard(value: string): void {
    navigator.clipboard.writeText(value).then(() => {
      ToastNotificationComponent.show('Copied to clipboard', 'success', 2000);
    }).catch(err => {
      ToastNotificationComponent.show('Failed to copy', 'error', 3000);
    });
  }

  openTransactionInExplorer(txHash: string): void {
    // You can customize this URL based on your network
    const explorerUrl = `https://etherscan.io/tx/${txHash}`;
    window.open(explorerUrl, '_blank');
  }

  private handleError(message: string): void {
    this.isActivatingMarket = false;
    this.marketActivated = false;

    ToastNotificationComponent.show(`Failed to activate market: ${message}`, 'error', 5000);
  }
}
