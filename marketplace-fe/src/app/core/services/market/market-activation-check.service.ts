import { Injectable } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Observable, of } from 'rxjs';
import { map, catchError, switchMap } from 'rxjs/operators';
import { KeycloakService } from '../keycloak/keycloak.service';
import { MarketFactoryService } from '../../../features/market-factory/services/market-factory.service';
import { MarketActivationWarningModalComponent, MarketActivationWarningData, MarketActivationWarningResult } from '../../../features/market-factory/market-activation-warning-modal/market-activation-warning-modal.component';
import { MyMarket } from '../../../shared/models/market-place/market-model';

@Injectable({
  providedIn: 'root'
})
export class MarketActivationCheckService {
  private hasCheckedActivation = false;
  private isDialogOpen = false;

  constructor(
    private marketFactoryService: MarketFactoryService,
    private keycloakService: KeycloakService,
    private dialog: MatDialog
  ) { }

  /**
   * Checks if market owner has markets pending activation and shows modal if needed
   * Should be called after successful authentication
   */
  checkMarketActivation(): Observable<boolean> {
    // Prevent multiple checks or if dialog is already open
    if (this.hasCheckedActivation || this.isDialogOpen) {
      return of(true);
    }

    // Mark as checked IMMEDIATELY to prevent race conditions
    this.hasCheckedActivation = true;

    // Only check for FMO_LMO (market owners)
    const userRoles = this.keycloakService.getRoles();
    if (!userRoles.includes('FMO_LMO')) {
      return of(true);
    }

    return this.marketFactoryService.getMyMarkets().pipe(
      map(response => {
        if (response.success && response.data && response.data.markets) {
          // Find markets that need activation (only with wallet pending activation)
          const pendingActivationMarkets = response.data.markets.filter(
            (market: MyMarket) => market.state === 'WALLET_CREATED_PENDING_ACTIVATION'
          );

          return pendingActivationMarkets;
        }
        return [];
      }),
      catchError(error => {
        return of([]);
      }),
      switchMap((pendingMarkets: MyMarket[]) => {
        if (pendingMarkets.length > 0) {
          // Show modal for the first pending market (or all if needed)
          return this.showMarketActivationModal(pendingMarkets[0]);
        }
        return of(true);
      })
    );
  }

  /**
   * Shows the market activation warning modal
   */
  private showMarketActivationModal(market: MyMarket): Observable<boolean> {
    // DOUBLE CHECK: Prevent opening if already open
    if (this.isDialogOpen) {
      return of(false);
    }

    // EXTRA PROTECTION: Check if there are any open dialogs at all
    if (this.dialog.openDialogs.length > 0) {
      return of(false);
    }

    // Mark as open IMMEDIATELY before creating dialog
    this.isDialogOpen = true;

    const dialogData: MarketActivationWarningData = {
      marketId: market.id,
      marketName: market.name,
      marketDescription: market.description || '',
      region: market.region || ''
    };

    // Add a small delay to ensure synchronization
    return new Observable<boolean>(observer => {
      setTimeout(() => {
        const dialogRef = this.dialog.open(MarketActivationWarningModalComponent, {
          data: dialogData,
          disableClose: true, // Prevent closing without action
          width: '650px',
          maxWidth: '90vw',
          panelClass: 'market-activation-modal-overlay'
        });

        dialogRef.afterClosed().subscribe((result: MarketActivationWarningResult) => {
          this.isDialogOpen = false;

          if (result && result.marketActivated) {
            observer.next(true);
          } else {
            observer.next(false);
          }
          observer.complete();
        });
      }, 100); // Small delay to prevent race conditions
    });
  }

  /**
   * Resets the activation check flag (useful for testing or when user logs out/in)
   */
  resetActivationCheck(): void {
    this.hasCheckedActivation = false;
    this.isDialogOpen = false;
  }

  /**
   * Forces an activation check regardless of previous checks
   */
  forceActivationCheck(): Observable<boolean> {
    this.hasCheckedActivation = false;
    this.isDialogOpen = false;
    return this.checkMarketActivation();
  }

  /**
   * Checks if the activation check has already been performed
   */
  hasPerformedActivationCheck(): boolean {
    return this.hasCheckedActivation;
  }

  /**
   * Checks if the activation modal is currently open
   */
  isActivationModalOpen(): boolean {
    return this.isDialogOpen;
  }
}
