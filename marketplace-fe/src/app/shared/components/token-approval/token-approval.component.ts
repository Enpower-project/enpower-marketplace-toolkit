import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { FlexibilityTokenHttpService } from '../../../core/services/blockchain/contracts/flexibility-token/flexibility-token.http.service';
import { TreasuryService } from '../../../core/services/treasury/treasury.service';
import { WalletService } from '../../../core/services/wallet/wallet.service';
import { ToastNotificationComponent } from '../toast-notification/toast-notification.component';

export interface TokenApprovalStatus {
  currentAllowance: string;
  requiredAmount: string;
  needsApproval: boolean;
  approved: boolean;
}

/**
 * Token Approval Component
 *
 * Handles the ERC20 approval flow for FLEX tokens before deposits to Treasury.
 * Shows current allowance, checks if approval is needed, and provides approve button.
 */
@Component({
  selector: 'app-token-approval',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
  ],
  templateUrl: './token-approval.component.html',
  styleUrl: './token-approval.component.css'
})
export class TokenApprovalComponent implements OnInit {
  @Input() requiredAmount: string = '0';
  @Input() spenderAddress: string = '';
  @Input() ownerAddress: string = '';
  @Input() compact: boolean = false;
  @Input() showDetails: boolean = true;
  @Input() autoCheck: boolean = true;

  @Output() approvalComplete = new EventEmitter<{ txHash: string; allowance: string }>();
  @Output() approvalStatusChange = new EventEmitter<TokenApprovalStatus>();

  currentAllowance: string = '0';
  needsApproval: boolean = true;
  isLoading: boolean = false;
  isApproving: boolean = false;
  error: string | null = null;
  txHash: string | null = null;
  showPinInput: boolean = false;
  pin: string = '';

  private treasuryAddress: string = '';

  constructor(
    private tokenService: FlexibilityTokenHttpService,
    private treasuryService: TreasuryService,
    private walletService: WalletService,
  ) {}

  ngOnInit(): void {
    if (this.autoCheck) {
      this.initializeAndCheck();
    }
  }

  /**
   * Initialize addresses and check allowance
   */
  async initializeAndCheck(): Promise<void> {
    this.isLoading = true;
    this.error = null;

    try {
      // Get Treasury address if not provided
      if (!this.spenderAddress) {
        this.treasuryAddress = await this.treasuryService.getContractAddress().toPromise() || '';
        this.spenderAddress = this.treasuryAddress;
      }

      // Get user wallet address if not provided
      if (!this.ownerAddress) {
        const walletResponse = await this.walletService.getWallet().toPromise();
        if (walletResponse?.success && walletResponse.data?.address) {
          this.ownerAddress = walletResponse.data.address;
        } else {
          throw new Error('Could not get wallet address');
        }
      }

      await this.checkAllowance();
    } catch (err: any) {
      this.error = err.message || 'Failed to initialize token approval';
      this.isLoading = false;
    }
  }

  /**
   * Check current allowance against required amount
   */
  async checkAllowance(): Promise<void> {
    if (!this.ownerAddress || !this.spenderAddress) {
      this.error = 'Missing owner or spender address';
      this.isLoading = false;
      return;
    }

    this.isLoading = true;
    this.error = null;

    try {
      const response = await this.tokenService.allowance(
        this.ownerAddress,
        this.spenderAddress
      ).toPromise();

      if (response?.data?.allowance) {
        this.currentAllowance = response.data.allowance;

        // Compare BigInt values
        const current = BigInt(this.currentAllowance);
        const required = BigInt(this.requiredAmount || '0');

        this.needsApproval = current < required;

        this.emitStatus();
      } else {
        throw new Error('Invalid response from allowance check');
      }
    } catch (err: any) {
      this.error = err.error?.message || err.message || 'Failed to check allowance';
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Start the approval flow (show PIN input)
   */
  startApproval(): void {
    this.showPinInput = true;
    this.pin = '';
    this.error = null;
  }

  /**
   * Cancel approval flow
   */
  cancelApproval(): void {
    this.showPinInput = false;
    this.pin = '';
    this.error = null;
  }

  /**
   * Execute token approval
   */
  async approveTokens(): Promise<void> {
    if (!this.pin || this.pin.length < 4) {
      this.error = 'Please enter a valid PIN';
      return;
    }

    this.isApproving = true;
    this.error = null;

    try {
      // Add extra 10% to approval amount for safety margin
      const amountToApprove = this.calculateApprovalAmount(this.requiredAmount);

      const response = await this.tokenService.approve({
        spender: this.spenderAddress,
        amount: amountToApprove,
      }).toPromise();

      if (response?.data?.txHash) {
        this.txHash = response.data.txHash;
        this.needsApproval = false;
        this.showPinInput = false;
        this.pin = '';

        // Update current allowance
        this.currentAllowance = amountToApprove;

        ToastNotificationComponent.show(
          `Tokens approved successfully! TX: ${this.txHash.slice(0, 10)}...`,
          'success'
        );

        this.approvalComplete.emit({
          txHash: this.txHash,
          allowance: amountToApprove,
        });

        this.emitStatus();
      } else {
        throw new Error('Approval transaction failed');
      }
    } catch (err: any) {
      this.error = err.error?.message || err.message || 'Failed to approve tokens';
      ToastNotificationComponent.show(this.error!, 'error');
    } finally {
      this.isApproving = false;
    }
  }

  /**
   * Calculate approval amount with safety margin
   */
  private calculateApprovalAmount(required: string): string {
    try {
      const requiredBigInt = BigInt(required);
      // Add 20% buffer for future transactions
      const buffer = requiredBigInt * BigInt(20) / BigInt(100);
      return (requiredBigInt + buffer).toString();
    } catch {
      return required;
    }
  }

  /**
   * Emit current approval status
   */
  private emitStatus(): void {
    this.approvalStatusChange.emit({
      currentAllowance: this.currentAllowance,
      requiredAmount: this.requiredAmount,
      needsApproval: this.needsApproval,
      approved: !this.needsApproval,
    });
  }

  /**
   * Format wei amount to human readable FLEX
   */
  formatAmount(weiAmount: string): string {
    if (!weiAmount || weiAmount === '0') return '0';
    try {
      const value = parseFloat(weiAmount) / 1e18;
      if (value < 0.0001) return '< 0.0001';
      return value.toFixed(4);
    } catch {
      return weiAmount;
    }
  }

  /**
   * Copy transaction hash to clipboard
   */
  copyTxHash(): void {
    if (this.txHash) {
      navigator.clipboard.writeText(this.txHash);
      ToastNotificationComponent.show('Transaction hash copied!', 'info');
    }
  }

  /**
   * Public method to trigger allowance check externally
   */
  refresh(): void {
    this.checkAllowance();
  }

  /**
   * Public method to check if approval is complete
   */
  isApproved(): boolean {
    return !this.needsApproval && !this.isLoading && !this.error;
  }
}
