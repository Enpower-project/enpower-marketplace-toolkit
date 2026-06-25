import { Component, OnDestroy, OnInit } from '@angular/core';
import { RouterOutlet, Router, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MenuElementInterface, SnackUserNotifyModule } from 'dst-ui-kit';
import { EventService, EventListener } from 'hateoas-utils';
import { KeycloakService } from './core/services/keycloak/keycloak.service';
import { MarketAuthService } from './core/services/auth/market-auth.service';
import { ProsumerWalletCheckService } from './core/services/wallet/prosumer-wallet-check.service';
import { MarketActivationCheckService } from './core/services/market/market-activation-check.service';
import { MarketAcceptanceService } from './features/market-factory/services/market-acceptance.service';
import { MarketFactoryService } from './features/market-factory/services/market-factory.service';
import { AuthEvents, AuthEventPayload } from './core/enums/auth-events.enum';
import { MENU_CONFIG, MENU_CATEGORIES, TOP_LEVEL_ITEMS, MenuCategory } from './shared/config/menu.config';
import { MatExpansionModule } from '@angular/material/expansion';
import { FormsModule } from "@angular/forms";
import { InfiniteLoaderComponent } from './shared/components/infinite-loader/infinite-loader.component';
import { MarketInfoComponent } from './shared/components/market-info/market-info.component';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import { LogoutConfirmationDialogComponent } from './shared/components/logout-confirmation-dialog/logout-confirmation-dialog.component';
import { MarketWalletWarningModalComponent, MarketWalletWarningData } from './features/market-factory/market-wallet-warning-modal/market-wallet-warning-modal.component';
import { MarketSelectionService } from './core/services/market-selection/market-selection.service';
import { MarketSubscriptionModalComponent } from './shared/components/market-subscription-modal/market-subscription-modal.component';
import { ToastNotificationComponent } from './shared/components/toast-notification/toast-notification.component';
import { BalanceInfoComponent } from "./shared/components/balance-info/balance-info.component";
import { UserService } from './core/services/user.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    RouterOutlet,
    RouterModule,
    CommonModule,
    MatSidenavModule,
    MatToolbarModule,
    MatListModule,
    MatIconModule,
    MatButtonModule,
    MatExpansionModule,
    MatDialogModule,
    MatTooltipModule,
    MatMenuModule,
    FormsModule,
    MarketInfoComponent,
    SnackUserNotifyModule,
    MatProgressSpinnerModule,
    ToastNotificationComponent,
    BalanceInfoComponent
],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent extends EventListener implements OnInit, OnDestroy {
  title = 'Marketplace';
  isAuthenticated = false;
  hideLayout = false;
  userRoles: string[] = [];
  menuConfig: MenuElementInterface[] = MENU_CONFIG.map(menu => menu.value);
  topLevelItems: MenuElementInterface[] = TOP_LEVEL_ITEMS.map(item => item.value);
  menuCategories: MenuCategory[] = MENU_CATEGORIES;
  isAppLoading = true;
  private readonly FSP_MARKET_CHECK_KEY = 'fsp_market_check_completed';
  private fspMarketCheckCompleted = false;

  constructor(
    private readonly keycloakService: KeycloakService,
    private readonly marketAuthService: MarketAuthService,
    private readonly prosumerWalletCheckService: ProsumerWalletCheckService,
    private readonly marketActivationCheckService: MarketActivationCheckService,
    private readonly router: Router,
    private readonly marketAcceptanceService: MarketAcceptanceService,
    private readonly marketFactoryService: MarketFactoryService,
    private readonly marketSelectionService: MarketSelectionService,
    private readonly userService: UserService,
    private readonly dialog: MatDialog,
    eventService: EventService
  ) {
    super(eventService);
    const storedFlag = sessionStorage.getItem(this.FSP_MARKET_CHECK_KEY);
    this.fspMarketCheckCompleted = storedFlag === 'true';
  }

  ngOnInit(): void {
    this.setupEventListeners();
    this.checkInitialAuthStatus();
    this.router.events.subscribe(() => {
      const url = this.router.url;
      this.hideLayout = url.startsWith('/accept-invitation');
    });
    const url = this.router.url;
    this.hideLayout = url.startsWith('/accept-invitation');
  }

  private setupEventListeners(): void {
    this.fmap.set(AuthEvents.AUTH_SUCCESS, this.onAuthSuccess.bind(this));
    this.fmap.set(AuthEvents.AUTH_FAILED, this.onAuthFailed.bind(this));
    this.fmap.set(AuthEvents.KEYCLOAK_READY, this.onKeycloakReady.bind(this));
    this.fmap.set(AuthEvents.AUTH_LOGOUT, this.onAuthLogout.bind(this));
    this.fmap.set('logout', this.handleLogout.bind(this));
    this.fmap.set('auth_logout', this.handleLogout.bind(this));
    this.fmap.set('SESSION_EXPIRED', this.onSessionExpired.bind(this));
    this.eventSubscribe();
  }

  private onAuthSuccess(payload: AuthEventPayload): void {
    // Clear stale market data from any previous session before loading fresh state
    this.marketSelectionService.clearStoredData();
    this.marketAuthService.setMarketContextReady(false);
    this.loadAssignedMarketFromDB();

    this.isAuthenticated = true;
    this.userRoles = payload.roles || [];

    this.marketAcceptanceService.checkAndHandlePendingMarkets().subscribe({
      next: (acceptanceResult) => {
        this.prosumerWalletCheckService.checkProsumerWallet().subscribe({
          next: () => {
            this.checkAndHandleFSPMarketSelection();
            this.marketActivationCheckService.checkMarketActivation().subscribe({
              next: () => {},
              error: () => {}
            });
            this.finishLoadingProcess();
          },
          error: () => {
            this.checkAndHandleFSPMarketSelection();
            this.marketActivationCheckService.checkMarketActivation().subscribe({
              next: () => {},
              error: () => {}
            });
            this.finishLoadingProcess();
          }
        });

        if (acceptanceResult.userInteracted && acceptanceResult.acceptedCount > 0) {
          // Small delay to ensure the backend has processed the acceptance before opening modals
          setTimeout(() => {
            this.showWalletCreationThenActivation();
          }, 500);
        }
      },
      error: () => {
        this.prosumerWalletCheckService.checkProsumerWallet().subscribe({
          next: () => {
            this.checkAndHandleFSPMarketSelection();
            this.marketActivationCheckService.checkMarketActivation().subscribe({
              next: () => {},
              error: () => {}
            });
            this.finishLoadingProcess();
          },
          error: () => {
            this.checkAndHandleFSPMarketSelection();
            this.marketActivationCheckService.checkMarketActivation().subscribe({
              next: () => {},
              error: () => {}
            });
            this.finishLoadingProcess();
          }
        });
      }
    });
  }

  private onAuthFailed(_payload: AuthEventPayload): void {
    this.isAuthenticated = false;
    this.userRoles = [];
    this.finishLoadingProcess();
  }

  private onKeycloakReady(payload: AuthEventPayload): void {
    this.isAuthenticated = payload.authenticated;
    this.userRoles = payload.roles || [];
    if (!payload.authenticated) {
      this.finishLoadingProcess();
    }
  }

  private onAuthLogout(_payload: AuthEventPayload): void {
    this.isAuthenticated = false;
    this.userRoles = [];
    this.finishLoadingProcess();
  }

  private checkInitialAuthStatus(): void {
    if (this.keycloakService.isLoggedIn()) {
      this.isAuthenticated = true;
      this.userRoles = this.keycloakService.getRoles();
      // Small delay to allow services to initialize before releasing the loading state
      setTimeout(() => this.finishLoadingProcess(), 500);
    } else {
      this.finishLoadingProcess();
    }
  }


  hasAccess(roles?: string[]): boolean {
    if (!roles || roles.length === 0) {
      return true; // No role restriction
    }
    return this.userRoles.some(role => roles.includes(role));
  }

  hasCategoryAccess(category: MenuCategory): boolean {
    return this.hasAccess(category.rolesEnabled);
  }

  handleMenuClick(menuItem: MenuElementInterface): void {
    this.eventService.broadcast({action: menuItem.event? menuItem.event:'no',payload: "menu event emitted"})
  }

  logout(): void {
    this.resetAllServices();
    this.keycloakService.logout();
  }

  private resetAllServices(): void {
    this.marketAuthService.resetMarketContext();
    this.prosumerWalletCheckService.resetWalletCheck();
    this.marketActivationCheckService.resetActivationCheck();
    this.marketAcceptanceService.resetCheckState();
    this.fspMarketCheckCompleted = false;
    sessionStorage.removeItem(this.FSP_MARKET_CHECK_KEY);
  }

  private finishLoadingProcess(): void {
    this.isAppLoading = false;
  }

  /** Cleans up local state when the interceptor reports a fully-expired session. */
  private onSessionExpired(_payload: any): void {
    this.isAppLoading = false;
    this.resetAllServices();
  }

  /**
   * Ensures the correct market is selected after login.
   * - 1 available market: auto-selects it.
   * - Multiple markets: shows the selection modal.
   * - No markets: no-op.
   */
  private checkAndHandleFSPMarketSelection(): void {
    const isFSP = this.userRoles.includes('FSP');
    const isFMO_LMO = this.userRoles.includes('FMO_LMO');
    
    if (!isFSP && !isFMO_LMO) {
      this.fspMarketCheckCompleted = true;
      return;
    }

    // Mark as started to prevent duplicates
    this.fspMarketCheckCompleted = true;
    sessionStorage.setItem(this.FSP_MARKET_CHECK_KEY, 'true');

    // Get available markets for the user
    this.marketSelectionService.getAvailableMarkets().subscribe({
      next: (response) => {
        const marketCount = response.availableMarkets?.length || 0;

        if (marketCount === 0) {
          return;
        }

        if (marketCount === 1) {
          const marketId = response.availableMarkets[0];
          const marketName = response.availableMarketsWithNames?.[0]?.name || 'Market';
          this.marketSelectionService.setSelectedMarket(marketId, marketName);
          this.marketAuthService.setMarketContextReady(true);
        } else {
          // Multiple markets — keep dashboards in loading state until the user chooses
          setTimeout(() => {
            this.showMarketSelectionModal();
          }, 500);
        }
      },
      error: () => {}
    });
  }

  /** Opens the market selection modal and updates context readiness based on the result. */
  private showMarketSelectionModal(): void {
    this.marketSelectionService.clearSelectedMarket();
    this.marketAuthService.setMarketContextReady(false);

    const dialogRef = this.dialog.open(MarketSubscriptionModalComponent, {
      width: '800px',
      maxHeight: '90vh',
      disableClose: true
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result?.selected && result?.marketId) {
        // Small timeout to ensure the BehaviorSubject has emitted before dependents react
        setTimeout(() => {
          this.marketAuthService.setMarketContextReady(true);
        }, 100);
      } else {
        this.marketSelectionService.clearSelectedMarket();
        // Mark context ready so the UI reflects "no market selected"
        this.marketAuthService.setMarketContextReady(true);
      }
    });
  }

  /**
   * Fetches the user's assigned market from the database and pre-selects it.
   * This is the authoritative source; the FSP modal fallback runs only when no
   * assignment is found.
   */
  private loadAssignedMarketFromDB(): void {
    this.userService.getMyAssignedMarket().subscribe({
      next: (response) => {
        if (response.success && response.data.assignedMarket) {
          const marketId = response.data.assignedMarket;
          this.marketSelectionService.getAvailableMarkets().subscribe({
            next: (marketsResponse) => {
              const marketName = marketsResponse.availableMarketsWithNames?.find(m => m.id === marketId)?.name || 'Market';
              this.marketSelectionService.setSelectedMarket(marketId, marketName);
              this.marketAuthService.setMarketContextReady(true);
            },
            error: () => {
              this.marketSelectionService.setSelectedMarket(marketId);
              this.marketAuthService.setMarketContextReady(true);
            }
          });
        }
      },
      error: () => {}
    });
  }

  /**
   * After a market acceptance, finds the newly accepted market and opens the
   * wallet creation modal, then the blockchain activation modal in sequence.
   */
  private showWalletCreationThenActivation(): void {
    this.marketFactoryService.getMyMarkets().subscribe({
      next: (response) => {
        if (!response.success || !response.data?.markets) return;

        const acceptedMarket = response.data.markets.find(
          (market: any) => market.state === 'CREATED_OFFLINE_ACCEPTED'
        );

        if (acceptedMarket) {
          this.showWalletCreationModal(acceptedMarket.id, acceptedMarket.name);
        }
      },
      error: () => {}
    });
  }

  /** Opens the wallet creation modal for the given market. */
  private showWalletCreationModal(marketId: string, marketName: string): void {
    const dialogData: MarketWalletWarningData = {
      marketId,
      marketName
    };

    const dialogRef = this.dialog.open(MarketWalletWarningModalComponent, {
      data: dialogData,
      disableClose: true,
      width: '600px',
      maxWidth: '90vw'
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result?.walletCreated) {
        // Short delay to allow the backend to update the market state
        setTimeout(() => {
          this.marketActivationCheckService.forceActivationCheck().subscribe({
            next: () => {},
            error: () => {}
          });
        }, 1000);
      }
    });
  }

  ngOnDestroy(){
    this.unsubcribe();
  }

  getUserName(): string {
    return this.keycloakService.getUsername() || 'User';
  }

  handleLogout(): void {
    const dialogRef = this.dialog.open(LogoutConfirmationDialogComponent, {
      width: '400px',
      disableClose: false
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result === true) {
        this.keycloakService.logout();
      }
    });
  }

}

