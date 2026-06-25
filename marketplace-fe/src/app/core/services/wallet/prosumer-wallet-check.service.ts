import { Injectable } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Observable, of } from 'rxjs';
import { map, catchError, switchMap } from 'rxjs/operators';
import { KeycloakService } from '../keycloak/keycloak.service';
import { WalletService } from './wallet.service';
import { ProsumerWalletModalComponent, ProsumerWalletModalData, ProsumerWalletModalResult } from '../../../shared/components/prosumer-wallet-modal/prosumer-wallet-modal.component';

@Injectable({
  providedIn: 'root'
})
export class ProsumerWalletCheckService {
  private hasCheckedWallet = false;
  private isDialogOpen = false;

  constructor(
    private walletService: WalletService,
    private keycloakService: KeycloakService,
    private dialog: MatDialog
  ) {}

  /**
   * Checks if FSP or FRP user has a wallet and shows modal if needed
   * Should be called after successful authentication
   */
  checkProsumerWallet(): Observable<boolean> {
    // Prevent multiple checks or if dialog is already open
    if (this.hasCheckedWallet || this.isDialogOpen) {
      return of(true);
    }

    // Only check for FSP and FRP users
    const userRoles = this.keycloakService.getRoles();
    if (!userRoles.includes('FSP') && !userRoles.includes('FRP')) {
      return of(true);
    }

    this.hasCheckedWallet = true;

    return this.walletService.getWallet().pipe(
      map(response => {
        if (response.success && response.data) {
          // User has a wallet, no action needed
          return response.data.hasWallet;
        }
        // If no wallet data, show modal
        return false;
      }),
      catchError(error => {
        // If error occurs, assume no wallet and show modal
        return of(false);
      }),
      switchMap(hasWallet => {
        if (!hasWallet) {
          return this.showProsumerWalletModal();
        }
        return of(true);
      })
    );
  }

  /**
   * Shows the prosumer wallet creation modal
   */
  private showProsumerWalletModal(): Observable<boolean> {
    if (this.isDialogOpen) {
      return of(false);
    }

    this.isDialogOpen = true;
    const userName = this.keycloakService.getUsername() || 'User';

    const dialogData: ProsumerWalletModalData = {
      userName: userName
    };

    const dialogRef = this.dialog.open(ProsumerWalletModalComponent, {
      data: dialogData,
      disableClose: true, // Prevent closing without action
      width: '650px',
      maxWidth: '90vw',
      panelClass: 'prosumer-wallet-modal-overlay'
    });

    return dialogRef.afterClosed().pipe(
      map((result: ProsumerWalletModalResult) => {
        this.isDialogOpen = false;
        
        if (result && result.walletCreated) {
          return true;
        }
        
        // User cancelled or closed without creating wallet
        return false;
      }),
      catchError(error => {
        this.isDialogOpen = false;
        return of(false);
      })
    );
  }

  /**
   * Resets the wallet check flag (useful for testing or when user logs out/in)
   */
  resetWalletCheck(): void {
    this.hasCheckedWallet = false;
    this.isDialogOpen = false;
  }

  /**
   * Forces a wallet check regardless of previous checks
   */
  forceWalletCheck(): Observable<boolean> {
    this.hasCheckedWallet = false;
    this.isDialogOpen = false;
    return this.checkProsumerWallet();
  }

  /**
   * Checks if the wallet check has already been performed
   */
  hasPerformedWalletCheck(): boolean {
    return this.hasCheckedWallet;
  }

  /**
   * Checks if the wallet modal is currently open
   */
  isWalletModalOpen(): boolean {
    return this.isDialogOpen;
  }
}