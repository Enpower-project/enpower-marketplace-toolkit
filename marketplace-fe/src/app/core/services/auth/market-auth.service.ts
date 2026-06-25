import { Injectable } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Observable, of, BehaviorSubject } from 'rxjs';
import { switchMap, catchError, tap } from 'rxjs/operators';
import { MarketSelectionService, AvailableMarketsResponse } from '../market-selection/market-selection.service';
import { KeycloakService } from '../keycloak/keycloak.service';
import { MarketSelectionModalComponent, MarketSelectionModalData } from '../../../shared/components/market-selection-modal/market-selection-modal.component';
import { MarketAcceptanceService } from '../../../features/market-factory/services/market-acceptance.service';

export interface AuthWithMarketResult {
  authenticated: boolean;
  marketSelected: boolean;
  marketId?: string;
  requiresMarketSelection?: boolean;
  availableMarkets?: string[];
  error?: string;
}

@Injectable({
  providedIn: 'root'
})
export class MarketAuthService {
  private marketContextReady = new BehaviorSubject<boolean>(false);
  public marketContextReady$ = this.marketContextReady.asObservable();
  private isMarketSelectionInProgress = false;

  constructor(
    private marketSelectionService: MarketSelectionService,
    private keycloakService: KeycloakService,
    private dialog: MatDialog,
    private marketAcceptanceService: MarketAcceptanceService
  ) {}

  /**
   * Main method to handle authentication with market context
   * This should be called after successful Keycloak authentication
   */
  handlePostLoginMarketSelection(): Observable<AuthWithMarketResult> {
    // Prevent multiple simultaneous calls
    if (this.isMarketSelectionInProgress) {
      return of({
        authenticated: true,
        marketSelected: false,
        error: 'Market selection already in progress'
      });
    }

    // First check if user is authenticated
    if (!this.keycloakService.isLoggedIn()) {
      return of({
        authenticated: false,
        marketSelected: false,
        error: 'User not authenticated'
      });
    }

    // Set flag to prevent concurrent calls
    this.isMarketSelectionInProgress = true;

    // FMO_LMO users should NOT use persisted markets - they need to accept markets first
    // The market acceptance flow in app.component.ts will handle their market selection
    const userRoles = this.keycloakService.getRoles();
    const isFMO_LMO = userRoles.includes('FMO_LMO');
    
    if (isFMO_LMO) {

      this.isMarketSelectionInProgress = false;
      // Return success without selecting market - app.component.ts will handle it
      return of({
        authenticated: true,
        marketSelected: false,
        requiresMarketSelection: false
      });
    }

    // Check for persisted market selection first (for non-FMO_LMO users)
    if (this.marketSelectionService.hasPersistedMarket()) {
      const persistedMarket = this.marketSelectionService.getSelectedMarket();
      if (persistedMarket) {
        this.marketSelectionService.setSelectedMarket(persistedMarket);
        this.marketContextReady.next(true);
        this.isMarketSelectionInProgress = false;
        return of({
          authenticated: true,
          marketSelected: true,
          marketId: persistedMarket
        });
      }
    }

    // 🚫 REMOVED DUPLICATE CHECK: Pending markets are already checked in app.component.ts via onAuthSuccess()
    // The checkAndHandlePendingMarkets() method has a flag to prevent duplicate checks,
    // but having two call sites is confusing and can cause race conditions.
    // If markets were accepted/rejected in app.component, the cache was already cleared there.


    // Directly proceed with market selection
    return this.proceedWithMarketSelection().pipe(
      catchError((error) => {
        this.isMarketSelectionInProgress = false;
        return of({
          authenticated: true,
          marketSelected: false,
          error: 'Market selection process failed'
        });
      }),
      tap(() => {
        this.isMarketSelectionInProgress = false;
      })
    );
  }

  private proceedWithMarketSelection(): Observable<AuthWithMarketResult> {
    // Check available markets from server
    return this.marketSelectionService.refreshAvailableMarkets().pipe(
      switchMap((marketsResponse: AvailableMarketsResponse) => {
        return this.handleMarketsResponse(marketsResponse);
      }),
      catchError((error) => {
        return of({
          authenticated: true,
          marketSelected: false,
          error: 'Failed to load available markets'
        });
      })
    );
  }

  private handleMarketsResponse(response: AvailableMarketsResponse): Observable<AuthWithMarketResult> {
    if (!response.availableMarkets || response.availableMarkets.length === 0) {
      // No markets available
      return of({
        authenticated: true,
        marketSelected: false,
        error: 'No markets available for this user'
      });
    }

    if (response.availableMarkets.length === 1 && !response.requiresSelection) {
      // Single market - auto-select
      const marketId = response.availableMarkets[0];
      return this.autoSelectSingleMarket(marketId);
    }

    if (response.selectedMarket && !response.requiresSelection) {
      // Market already selected
      this.marketSelectionService.setSelectedMarket(response.selectedMarket);
      this.marketContextReady.next(true);
      return of({
        authenticated: true,
        marketSelected: true,
        marketId: response.selectedMarket
      });
    }

    if (response.requiresSelection) {
      // Multiple markets - show selection dialog
      return this.showMarketSelectionModal(response.availableMarkets);
    }

    // Fallback
    return of({
      authenticated: true,
      marketSelected: false,
      requiresMarketSelection: true,
      availableMarkets: response.availableMarkets
    });
  }

  private autoSelectSingleMarket(marketId: string): Observable<AuthWithMarketResult> {
    return this.marketSelectionService.selectMarket(marketId).pipe(
      switchMap((selectionResponse): Observable<AuthWithMarketResult> => {
        if (selectionResponse.success) {
          this.marketSelectionService.setSelectedMarket(marketId);

          if (selectionResponse.requiresTokenRefresh) {
            // Refresh token to get market context
            return new Observable<AuthWithMarketResult>(observer => {
              this.keycloakService.updateToken(3600).then(() => {
                this.marketContextReady.next(true);
                observer.next({
                  authenticated: true,
                  marketSelected: true,
                  marketId: marketId
                });
                observer.complete();
              }).catch((error) => {
                this.marketContextReady.next(true);
                observer.next({
                  authenticated: true,
                  marketSelected: true,
                  marketId: marketId,
                  error: 'Token refresh failed but market selected'
                });
                observer.complete();
              });
            });
          } else {
            this.marketContextReady.next(true);
            return of({
              authenticated: true,
              marketSelected: true,
              marketId: marketId
            });
          }
        } else {
          return of({
            authenticated: true,
            marketSelected: false,
            error: selectionResponse.message || 'Failed to auto-select market'
          });
        }
      }),
      catchError((error) => {
        return of({
          authenticated: true,
          marketSelected: false,
          error: 'Failed to auto-select market'
        });
      })
    );
  }

  private showMarketSelectionModal(availableMarkets: string[]): Observable<AuthWithMarketResult> {
    const dialogData: MarketSelectionModalData = {
      availableMarkets,
      title: 'Select Your Market',
      message: 'You have access to multiple markets. Please select one to continue:'
    };

    const dialogRef = this.dialog.open(MarketSelectionModalComponent, {
      width: '450px',
      disableClose: true, // Prevent closing without selection
      data: dialogData
    });

    return dialogRef.afterClosed().pipe(
      switchMap((result) => {
        if (!result || !result.success) {
          // User cancelled or selection failed
          return of({
            authenticated: true,
            marketSelected: false,
            // error: 'Market selection cancelled or failed'
          });
        }

        this.marketContextReady.next(true);
        return of({
          authenticated: true,
          marketSelected: true,
          marketId: result.selectedMarket
        });
      })
    );
  }

  /**
   * Check if user has market context ready
   */
  isMarketContextReady(): boolean {
    return this.marketContextReady.value;
  }

  /**   * Set market context ready state (used by app component after market selection)
   */
  setMarketContextReady(ready: boolean): void {
    this.marketContextReady.next(ready);
  }

  /**   * Reset market context (useful for logout)
   */
  resetMarketContext(): void {
    this.marketSelectionService.clearStoredData(); // 🎯 NEW: Clear localStorage
    this.marketContextReady.next(false);
    this.isMarketSelectionInProgress = false; // Reset flag when context is reset
    this.marketAcceptanceService.resetCheckState(); // Reset market acceptance check state
  }

  /**
   * Get current market ID
   */
  getCurrentMarketId(): string | null {
    return this.marketSelectionService.getSelectedMarket();
  }

  /**
   * Switch to a different market (for users with multiple market access)
   */
  switchMarket(marketId: string): Observable<boolean> {
    return this.marketSelectionService.switchMarket(marketId).pipe(
      switchMap((response): Observable<boolean> => {
        if (response.success) {
          // Get the market name from cache to update it properly
          const marketName = this.marketSelectionService.getMarketName(marketId);
          
          if (response.requiresTokenRefresh) {
            return new Observable<boolean>(observer => {
              this.keycloakService.updateToken(0).then(() => {
                // NOW update local state AFTER token is refreshed
                this.marketSelectionService.setSelectedMarket(marketId, marketName);
                observer.next(true);
                observer.complete();
              }).catch((error) => {
                // Still update the market even if token refresh failed
                this.marketSelectionService.setSelectedMarket(marketId, marketName);
                observer.next(true);
                observer.complete();
              });
            });
          } else {
            // No token refresh needed, just update local state
            this.marketSelectionService.setSelectedMarket(marketId, marketName);
          }
          return of(true);
        }
        return of(false);
      }),
      catchError((error) => {
        // Even if server call fails, we can update the local state
        // This ensures the UI is consistent across tabs
        const marketName = this.marketSelectionService.getMarketName(marketId);
        this.marketSelectionService.setSelectedMarket(marketId, marketName);

        // Return true because we at least updated locally
        return of(true);
      })
    );
  }

}
