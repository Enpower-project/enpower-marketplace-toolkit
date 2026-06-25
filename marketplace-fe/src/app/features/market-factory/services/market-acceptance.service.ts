import { Injectable } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Observable, of, EMPTY } from 'rxjs';
import { switchMap, catchError, tap } from 'rxjs/operators';
import { MarketFactoryService } from './market-factory.service';
import { KeycloakService } from '../../../core/services/keycloak/keycloak.service';
import { MarketSelectionService } from '../../../core/services/market-selection/market-selection.service';
import { MarketAcceptanceModalComponent, MarketAcceptanceModalData, PendingMarket } from '../market-acceptance-modal/market-acceptance-modal.component';
import { MarketState } from '../enums/market-enums';

export interface MarketAcceptanceResult {
  hasChecked: boolean;
  hasPendingMarkets: boolean;
  userInteracted: boolean;
  acceptedCount: number;
  rejectedCount: number;
  postponed: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class MarketAcceptanceService {
  private hasCheckedPendingMarkets = false;
  private isModalOpen = false;

  constructor(
    private marketFactoryService: MarketFactoryService,
    private keycloakService: KeycloakService,
    private dialog: MatDialog,
    private marketSelectionService: MarketSelectionService
  ) { }

  /**
   * Main method to check and handle pending market acceptance after login
   * Should be called once after successful authentication
   */
  checkAndHandlePendingMarkets(): Observable<MarketAcceptanceResult> {

    // Check if user is authenticated FIRST (before checking the flag)
    if (!this.keycloakService.isLoggedIn()) {
      // Reset the flag when user is not authenticated (they might have logged out)
      this.hasCheckedPendingMarkets = false;
      return of({
        hasChecked: false,
        hasPendingMarkets: false,
        userInteracted: false,
        acceptedCount: 0,
        rejectedCount: 0,
        postponed: false
      });
    }

    // ONLY check for FMO_LMO users (market owners)
    const userRoles = this.keycloakService.getRoles();
    if (!userRoles.includes('FMO_LMO')) {
      this.hasCheckedPendingMarkets = true;
      return of({
        hasChecked: true,
        hasPendingMarkets: false,
        userInteracted: false,
        acceptedCount: 0,
        rejectedCount: 0,
        postponed: false
      });
    }

    // Prevent multiple checks during the same session
    if (this.hasCheckedPendingMarkets) {
      return of({
        hasChecked: true,
        hasPendingMarkets: false,
        userInteracted: false,
        acceptedCount: 0,
        rejectedCount: 0,
        postponed: false
      });
    }

    // Mark as checked IMMEDIATELY to prevent race conditions
    this.hasCheckedPendingMarkets = true;
    // Get user email from token
    const userEmail = this.keycloakService.getUserEmail();

    if (!userEmail) {

      return of({
        hasChecked: false,
        hasPendingMarkets: false,
        userInteracted: false,
        acceptedCount: 0,
        rejectedCount: 0,
        postponed: false
      });
    }
    return this.marketFactoryService.getPendingMarketsByEmail(userEmail).pipe(
      switchMap((response) => {
        this.hasCheckedPendingMarkets = true;
        if (!response || !response.success || !response.data || !response.data.markets) {
          return of({
            hasChecked: true,
            hasPendingMarkets: false,
            userInteracted: false,
            acceptedCount: 0,
            rejectedCount: 0,
            postponed: false
          });
        }
        const pendingMarkets: PendingMarket[] = response.data.markets
          .filter((market: any) => {
            const isPending = market.state === MarketState.CREATED_OFFLINE_PENDING_ACCEPTATION;

            return isPending;
          })
          .map((market: any) => ({
            id: market.id,
            name: market.name,
            description: market.description || 'No description available',
            state: market.state,
            createdAt: market.createdAt
          }));

        // Check for accepted markets
        const acceptedMarkets = response.data.markets.filter(
          (market: any) => market.state === MarketState.CREATED_OFFLINE_ACCEPTED || 
                         market.state === MarketState.WALLET_CREATED_PENDING_ACTIVATION ||
                         market.state === MarketState.ACTIVE_ONCHAIN
        );

        if (pendingMarkets.length === 0) {

          
          // 🎯 CRITICAL FIX: NUNCA modificar la selección de mercado aquí
          // Esta API (getPendingMarketsByEmail) solo retorna mercados donde el usuario es OWNER
          // No retorna mercados suscritos (FSP), por lo que NO podemos asumir que si no aparece aquí, no existe
          // La selección de mercado debe manejarse SOLO en el flujo de selección de mercado
          return of({
            hasChecked: true,
            hasPendingMarkets: false,
            userInteracted: false,
            acceptedCount: 0,
            rejectedCount: 0,
            postponed: false
          });
        }


        
        // IMPORTANT: ONLY clear market selection if there are ONLY pending markets (no accepted ones)
        if (acceptedMarkets.length === 0) {
          this.marketSelectionService.clearStoredData(); // Clear localStorage completely
          this.marketSelectionService.setSelectedMarket(null); // Clear in-memory selection
        } else {
        }
        
        return this.showMarketAcceptanceModal(pendingMarkets, userEmail);
      }),
      catchError((error) => {
        this.hasCheckedPendingMarkets = true; // Prevent retry loops
        return of({
          hasChecked: true,
          hasPendingMarkets: false,
          userInteracted: false,
          acceptedCount: 0,
          rejectedCount: 0,
          postponed: false
        });
      })
    );
  }

  /**
   * Show the market acceptance modal
   */
  private showMarketAcceptanceModal(pendingMarkets: PendingMarket[], userEmail: string): Observable<MarketAcceptanceResult> {

    // PROTECTION: Prevent opening if already open
    if (this.isModalOpen) {
      return of({
        hasChecked: true,
        hasPendingMarkets: true,
        userInteracted: false,
        acceptedCount: 0,
        rejectedCount: 0,
        postponed: true
      });
    }

    // EXTRA PROTECTION: Check if there are any open dialogs at all
    if (this.dialog.openDialogs.length > 0) {
      return of({
        hasChecked: true,
        hasPendingMarkets: true,
        userInteracted: false,
        acceptedCount: 0,
        rejectedCount: 0,
        postponed: true
      });
    }

    // Mark as open IMMEDIATELY
    this.isModalOpen = true;
    const modalData: MarketAcceptanceModalData = {
      pendingMarkets,
      userEmail
    };

    const dialogRef = this.dialog.open(MarketAcceptanceModalComponent, {
      width: '600px',
      disableClose: true, // Prevent closing without user interaction
      data: modalData
    });

    return dialogRef.afterClosed().pipe(
      tap((result) => {
        // Reset modal flag when closed
        this.isModalOpen = false;
      }),
      switchMap((result) => {
        if (!result) {
          // Modal was somehow closed without interaction (shouldn't happen due to disableClose)
          return of({
            hasChecked: true,
            hasPendingMarkets: true,
            userInteracted: false,
            acceptedCount: 0,
            rejectedCount: 0,
            postponed: true
          });
        }

        const acceptedCount = result.acceptedMarkets?.length || 0;
        const rejectedCount = result.rejectedMarkets?.length || 0;
        const postponed = result.postponed || false;
        // ❌ NEVER clear storage after accepting - the market is already saved!
        // The modal has already persisted the accepted market to localStorage
        // Determine if there are still pending markets
        const hasPendingMarkets = postponed && acceptedCount === 0 && rejectedCount === 0;

        const finalResult = {
          hasChecked: true,
          hasPendingMarkets: hasPendingMarkets,
          userInteracted: true,
          acceptedCount,
          rejectedCount,
          postponed
        };
        return of(finalResult);
      }),
      catchError((error) => {
        return of({
          hasChecked: true,
          hasPendingMarkets: true,
          userInteracted: false,
          acceptedCount: 0,
          rejectedCount: 0,
          postponed: true
        });
      })
    );
  }

  /**
   * Reset the check state (useful for testing or when user logs out and back in)
   */
  resetCheckState(): void {
    this.hasCheckedPendingMarkets = false;
  }

  /**
   * Force check pending markets (ignores the hasChecked flag)
   */
  forceCheckPendingMarkets(): Observable<MarketAcceptanceResult> {
    this.resetCheckState();
    return this.checkAndHandlePendingMarkets();
  }

  /**
   * Check if we've already handled pending markets in this session
   */
  hasAlreadyChecked(): boolean {
    return this.hasCheckedPendingMarkets;
  }

  /**
   * Check for pending markets synchronously and return a promise
   * Used for blocking the market selection flow until acceptance is handled
   */
  checkPendingMarketsBeforeSelection(): Promise<MarketAcceptanceResult> {
    return new Promise((resolve) => {
      this.checkAndHandlePendingMarkets().subscribe({
        next: (result) => {
          resolve(result);
        },
        error: (error) => {
          resolve({
            hasChecked: true,
            hasPendingMarkets: false,
            userInteracted: false,
            acceptedCount: 0,
            rejectedCount: 0,
            postponed: false
          });
        }
      });
    });
  }
}
