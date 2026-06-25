import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { WalletService, WalletCreationResult } from '../../../core/services/wallet/wallet.service';
import { ToastNotificationComponent } from '../toast-notification/toast-notification.component';

export interface ProsumerWalletModalData {
  userName: string;
}

export interface ProsumerWalletModalResult {
  walletCreated: boolean;
  walletData?: WalletCreationResult;
}

@Component({
  selector: 'app-prosumer-wallet-modal',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressSpinnerModule
  ],
  templateUrl: './prosumer-wallet-modal.component.html',
  styleUrl: './prosumer-wallet-modal.component.css'
})
export class ProsumerWalletModalComponent implements OnInit {
  isCreatingWallet = false;
  walletCreated = false;
  createdWallet: WalletCreationResult | null = null;

  constructor(
    private dialogRef: MatDialogRef<ProsumerWalletModalComponent>,
    @Inject(MAT_DIALOG_DATA) public data: ProsumerWalletModalData,
    private walletService: WalletService
  ) {}

  ngOnInit(): void {
  }

  onCreateWallet(): void {
    this.isCreatingWallet = true;
    
    this.walletService.createSelfWallet().subscribe({
      next: (response) => {
        if (response.success && response.data) {
          this.createdWallet = response.data;
          this.walletCreated = true;
          this.isCreatingWallet = false;
          
          ToastNotificationComponent.show('Personal wallet created successfully!', 'success');
          
          // Esperar 2 segundos para que el usuario vea el mensaje y luego recargar la página
          setTimeout(() => {
            window.location.reload();
          }, 2000);
        } else {
          this.handleError(response.message || 'Unknown error occurred');
        }
      },
      error: (error) => {
        this.handleError(error.error?.message || error.message || 'Failed to create wallet');
      }
    });
  }

  onCancel(): void {
    this.dialogRef.close({
      walletCreated: false
    });
  }

  copyToClipboard(value: string): void {
    navigator.clipboard.writeText(value).then(() => {
      ToastNotificationComponent.show('Address copied to clipboard', 'success');
    }).catch(err => {
      ToastNotificationComponent.show('Failed to copy address', 'error');
    });
  }

  private handleError(message: string): void {
    this.isCreatingWallet = false;
    this.walletCreated = false;
    
    ToastNotificationComponent.show(`Failed to create wallet: ${message}`, 'error');
  }
}