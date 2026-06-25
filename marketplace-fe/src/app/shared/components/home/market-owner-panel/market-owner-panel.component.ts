import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatMenuModule } from '@angular/material/menu';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';
import { KeycloakService } from '../../../../core/services/keycloak/keycloak.service';
import { MarketAuthService } from '../../../../core/services/auth/market-auth.service';
import { MarketSelectionService } from '../../../../core/services/market-selection/market-selection.service';
import { MarketAcceptanceService } from '../../../../features/market-factory/services/market-acceptance.service';
import { InvitationService } from '../../../../core/services/invitation/invitation.service';
import { MarketFactoryService } from '../../../../features/market-factory/services/market-factory.service';
import { UserService } from '../../../../core/services/user.service';
import { ConfirmationDialogComponent, ConfirmationDialogData, ConfirmationDialogResult } from '../../confirmation-dialog/confirmation-dialog.component';
import { ToastNotificationComponent } from '../../toast-notification/toast-notification.component';
import { InviteUserModalComponent, InviteUserDialogData } from '../../invite-user-modal/invite-user-modal.component';
import { MarketActivationWarningModalComponent, MarketActivationWarningData, MarketActivationWarningResult } from '../../../../features/market-factory/market-activation-warning-modal/market-activation-warning-modal.component';
import { FeesService, MarketFeesSummary } from '../../../../core/services/fees/fees.service';
import { SettlementHttpService } from '../../../../core/services/settlement/settlement.http.service';
import { Subscription, forkJoin, from, of } from 'rxjs';
import { catchError, finalize, map, mergeMap, switchMap, toArray } from 'rxjs/operators';
import { OwnerSessionsContainerComponent } from "./components/owner-sessions-container/owner-sessions-container.component";
import { Session } from '../../../models/session.model';
import { SessionService } from '../../../../core/services/session/session.service';
import { DeactivateUserDialogComponent } from '../../../../features/market-factory/deactivate-user-dialog/deactivate-user-dialog.component';
import { MatChipSet, MatChip } from "@angular/material/chips";
import { ReactivateUserDialogComponent } from '../../../../features/market-factory/reactivate-user-dialog/reactivate-user-dialog.component';
import { UploadFlexibilityModalComponent, UploadFlexibilityDialogData } from '../../upload-flexibility-modal/upload-flexibility-modal.component';

@Component({
  selector: 'app-market-owner-panel',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatMenuModule,
    MatTableModule,
    MatTooltipModule,
    RouterModule,
    OwnerSessionsContainerComponent,
    MatChipSet,
    MatChip,
  ],
  templateUrl: './market-owner-panel.component.html',
  styleUrl: './market-owner-panel.component.css'
})
export class MarketOwnerPanelComponent implements OnInit, OnDestroy {
  ownedMarkets: Array<{ id: string; name: string; status?: string; description?: string; region?: string }> = [];
  isLoading = false;
  loading = false;
  sessions: Session[] = [];
  username: string = '';
  hasMarketSelected: boolean = false;
  marketUsersMap: Record<string, any[]> = {};
  marketUsersLoading: Record<string, boolean> = {};
  actionLoading: Record<string, boolean> = {};
  inviteUsersLoading: Record<string, boolean> = {};
  private readonly subscription = new Subscription();
  private marketContextSubscription?: Subscription;
  private marketSelectionSubscription?: Subscription;

  // Fees tracking
  marketFeesMap: Record<string, MarketFeesSummary> = {};
  marketFeesLoading: Record<string, boolean> = {};
  feesVisible: Record<string, boolean> = {};

  constructor(
    private readonly keycloakService: KeycloakService,
    private readonly router: Router,
    private readonly marketAuthService: MarketAuthService,
    private readonly marketSelectionService: MarketSelectionService,
    private readonly marketAcceptanceService: MarketAcceptanceService,
    private readonly dialog: MatDialog,
    private readonly invitationService: InvitationService,
    private readonly marketFactoryService: MarketFactoryService,
    private readonly feesService: FeesService,
    private readonly sessionService: SessionService,
    private readonly userService: UserService
  ) {
    this.isLoading = true;
  }

  ngOnInit(): void {
    this.username = this.keycloakService.getUsername() || '';

    this.subscription?.add(
      this.sessionService.sessions$.subscribe(sessions => {
        this.sessions = sessions;
      })
    );

    this.marketContextSubscription = this.marketAuthService.marketContextReady$.subscribe(isReady => {
      if (!isReady) {
        this.isLoading = false;
        this.hasMarketSelected = false;
        this.ownedMarkets = [];
        this.marketUsersMap = {};
        this.usersVisible = {};
      } else {
        const currentMarket = this.marketSelectionService.getSelectedMarket();

        if (currentMarket) {
          this.hasMarketSelected = true;
          this.ownedMarkets = [];
          this.marketUsersMap = {};
          this.usersVisible = {};
          this.loadOwnedMarkets();
        } else {
          this.hasMarketSelected = false;
          this.isLoading = false;
          this.ownedMarkets = [];
          this.marketUsersMap = {};
          this.usersVisible = {};
        }
      }
    });

    this.marketSelectionSubscription = this.marketSelectionService.selectedMarket$.subscribe(market => {
      if (!this.marketAuthService.isMarketContextReady()) {
        this.isLoading = true;
        return;
      }

      if (market) {
        this.hasMarketSelected = true;
        this.ownedMarkets = [];
        this.marketUsersMap = {};
        this.usersVisible = {};
        this.loadOwnedMarkets();
      } else {
        this.hasMarketSelected = false;
        this.isLoading = false;
        this.ownedMarkets = [];
        this.marketUsersMap = {};
        this.usersVisible = {};
      }
    });
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
    if (this.marketContextSubscription) {
      this.marketContextSubscription.unsubscribe();
    }
    if (this.marketSelectionSubscription) {
      this.marketSelectionSubscription.unsubscribe();
    }
  }

  get isMarketDeactivated(): boolean {
    const selectedMarketId = this.marketSelectionService.getSelectedMarket();
    if (!selectedMarketId) return false;
    const selectedMarket = this.ownedMarkets.find(m => m.id === selectedMarketId);
    return selectedMarket?.status === 'DEACTIVATED';
  }

  loadOwnedMarkets(): void {
    this.isLoading = true;

    this.marketSelectionService.getAvailableMarkets().subscribe({
      next: (response) => {
        if (response.availableMarketsWithNames && response.availableMarketsWithNames.length > 0) {
          const marketDetailRequests = response.availableMarketsWithNames.map(market =>
            this.marketFactoryService.getMarketById(market.id)
          );

          forkJoin(marketDetailRequests).subscribe({
            next: (markets) => {
              this.ownedMarkets = markets.map((market: any) => ({
                id: market.id,
                name: market.name,
                status: market.status || market.state,
                description: market.description,
                region: market.region
              }));
              this.isLoading = false;
              this.ownedMarkets.forEach(market => {
                this.loadMarketFees(market.id);
              });
            },
            error: () => {
              this.ownedMarkets = response.availableMarketsWithNames || [];
              this.isLoading = false;
            }
          });
        } else if (response.availableMarkets && response.availableMarkets.length > 0) {
          this.ownedMarkets = response.availableMarkets.map(marketId => ({
            id: marketId,
            name: this.marketSelectionService.getMarketName(marketId)
          }));
          this.isLoading = false;
          this.ownedMarkets.forEach(market => {
            this.loadMarketFees(market.id);
          });
        } else {
          this.ownedMarkets = [];
          this.isLoading = false;
        }
      },
      error: (err) => {
        this.ownedMarkets = [];
        this.isLoading = false;
      }
    });

    this.fetchSessions();
  }

  navigateToMarketInfo(marketId: string): void {
    this.router.navigate(['/market-info'], { queryParams: { marketId } });
  }

  navigateToMarketUsers(_marketId: string): void {
    // Navigation to market users page not yet implemented
  }

  private fetchSessions(): void {
    this.sessionService.getSessions().subscribe({
      next: (response) => {
        if (response.success) {
          this.sessions = response.data;
        }
      },
      error: () => {
        this.sessions = [];
      }
    });
  }

  private actionKey(marketId: string, userId: string, action: 'consumption' | 'theoretical') {
    return `${marketId}:${userId}:${action}`;
  }

  isActionLoading(marketId: string, userId: string, action: 'consumption' | 'theoretical') {
    return !!this.actionLoading[this.actionKey(marketId, userId, action)];
  }

  private setActionLoading(marketId: string, userId: string, action: 'consumption' | 'theoretical', v: boolean) {
    this.actionLoading[this.actionKey(marketId, userId, action)] = v;
  }

  generateUserComsumptionData(fspId: string, marketId: string) {
    const users = this.marketUsersMap[marketId] ?? [];
    const user = users.find(u => (u.id || u._id || '').toString() === fspId);
    const fspName = user?.username ?? user?.name ?? fspId;

    const dialogData: UploadFlexibilityDialogData = { fspId, fspName, marketId };

    const dialogRef = this.dialog.open(UploadFlexibilityModalComponent, {
      width: '520px',
      maxWidth: '95vw',
      data: dialogData,
      disableClose: true,
    });

    dialogRef.afterClosed().subscribe((uploaded: boolean) => {
      if (uploaded) {
        this.loadUsers(marketId);
      }
    });
  }

  calculateTheoretical(fspId: string, marketId: string) {
    this.setActionLoading(marketId, fspId, 'theoretical', true);
    this.loading = true;

    // IMPORTANTE: esto debe devolver Observable para poder finalizar correctamente.
    this.userService.calculateTheoreticalFlexibilityData(fspId, this.keycloakService.getToken() ?? "")
      .pipe(finalize(() => {
        this.loading = false;
        this.setActionLoading(marketId, fspId, 'theoretical', false);
      }))
      .subscribe({
        next: () => {
          ToastNotificationComponent.show('User theoretical data calculated!', 'success');
          this.loadUsers(marketId);
        },
        error: (err) => {
          ToastNotificationComponent.show(err, 'error');
        },
      });
  }

  usersVisible: Record<string, boolean> = {};

  private loadUsers(marketId: string): void {
    if (!marketId) return;

    this.marketUsersLoading[marketId] = true;

    forkJoin({
      marketUsersResp: this.marketFactoryService.getUsersInMarket(marketId),
    }).pipe(
      // 1) Construyes y deduplicas la lista de usuarios
      map(({ marketUsersResp }) => {
        const directUsers = marketUsersResp?.users ?? [];

        const byId = new Map<string, any>();
        [...directUsers].forEach(u => {
          const id = u.id.toString();
          if (id && !byId.has(id)) byId.set(id, u);
        });

        return Array.from(byId.values());
      }),



      // 2) Por cada usuario llamas al backend y devuelves el user enriquecido
      switchMap((users) =>
        from(users).pipe(
          mergeMap((u) => {
            if (u.role != 'FSP') {
              return of({ ...u, consumption: false });
            }

            const id = (u.id || u._id || '').toString();

            return this.userService.hasConsumptionData(id).pipe(
              map((res) => {
                const hasData =
                  res != null &&
                  (
                    (Array.isArray(res) && res.length > 0) ||
                    (Array.isArray(res?.measurement)) ||
                    (!!res?.measurement) ||
                    Object.keys(res || {}).length > 0
                  );

                return { ...u, consumption: hasData };
              }),
              catchError(() => of({ ...u, consumption: false }))
            );
          }, 5),
          toArray()
        )
      ),

      switchMap((users) =>
        from(users).pipe(
          mergeMap((u) => {
            if (u.role != 'FSP') {
              return of({ ...u, theoretical: false });
            }
            const id = (u.id || u._id || '').toString();

            return this.userService.hasTheoreticalData(id).pipe(
              map((res) => {
                const hasData =
                  res != null &&
                  (
                    (Array.isArray(res) && res.length > 0) ||
                    (Array.isArray(res?.measurements)) ||
                    (!!res?.measurements) ||
                    Object.keys(res || {}).length > 0
                  );

                return { ...u, theoretical: hasData };
              }),
              catchError(() => of({ ...u, theoretical: false }))
            );
          }, 5),
          toArray()
        )
      ),

      finalize(() => {
        this.marketUsersLoading[marketId] = false;
      })
    ).subscribe({
      next: (usersWithConsumption) => {
        this.marketUsersMap[marketId] = usersWithConsumption;
      },
      error: () => {
        this.marketUsersMap[marketId] = [];
      }
    });
  }

  toggleUsersList(marketId: string): void {
    this.usersVisible[marketId] = !this.usersVisible[marketId];
    if (this.usersVisible[marketId]) {
      this.loadUsers(marketId);
    }
  }

  isOwnerRole(user: any): boolean {
    const role = (user?.role || '').toString().toUpperCase();
    // Match exact or namespaced values like 'REALM:FMO_LMO'
    return role === 'FMO_LMO' || role.includes('FMO_LMO');
  }

  /**
   * Check if a user has FSP role
   */
  private isUserFSP(userId: string): boolean {
    // Look up the user in the current market's users map to verify they have FSP role
    const currentMarket = this.marketSelectionService.getSelectedMarket();
    if (!currentMarket || !this.marketUsersMap[currentMarket]) {
      return false;
    }

    const user = this.marketUsersMap[currentMarket].find(
      u => (u.id || u._id || '').toString() === userId
    );

    return user && (user.role === 'FSP' || (user.role || '').toString().includes('FSP'));
  }

  removeUserFromMarket(userId: string, username: string): void {
    const currentMarketId = this.marketSelectionService.getSelectedMarket();

    const dialogRef = this.dialog.open(DeactivateUserDialogComponent, {
      width: '600px',
      maxWidth: '80vw',
      data: { userId, username }
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result && currentMarketId) {
        this.loadUsers(currentMarketId);
      }
    });
  }


  openReactivateDialog(userId: string, username: string) {
    const currentMarketId = this.marketSelectionService.getSelectedMarket();

    const dialogRef = this.dialog.open(ReactivateUserDialogComponent, {
      width: '600px',
      maxWidth: '80vw',
      data: { userId, username }
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result && currentMarketId) {
        this.loadUsers(currentMarketId);
      }
    });
  }

  navigateToMarketActivity(_marketId: string): void {
    // Navigation to market activity page not yet implemented
  }

  reopenMarketAcceptanceModal(): void {
    this.isLoading = true;

    this.marketAcceptanceService.forceCheckPendingMarkets().subscribe({
      next: (result) => {
        this.isLoading = false;

        if (result.acceptedCount > 0) {
          // Market was accepted, reload the panel
          const selectedMarket = this.marketSelectionService.getSelectedMarket();
          if (selectedMarket) {
            this.hasMarketSelected = true;
            this.loadOwnedMarkets();
          }
        }
      },
      error: (error) => {
        this.isLoading = false;
      }
    });
  }

  getCurrentSession(_market: any): any {
    return null;
  }

  openInviteUserModal(marketId: string, marketName: string): void {
    this.inviteUsersLoading[marketId] = true;

    // First, check if market has FRP
    this.invitationService.checkMarketHasFRP(marketId).subscribe({
      next: (response: { hasFRP: boolean; email?: string }) => {
        const hasFRP = response.hasFRP || false;

        const dialogData: InviteUserDialogData = {
          marketId: marketId,
          marketName: marketName,
          hasFRP: hasFRP
        };

        const dialogRef = this.dialog.open(InviteUserModalComponent, {
          width: '600px',
          maxWidth: '95vw',
          data: dialogData,
          disableClose: true
        });

        dialogRef.afterClosed().subscribe(() => {
          this.inviteUsersLoading[marketId] = false;
        });
      },
      error: () => {
        const dialogData: InviteUserDialogData = {
          marketId: marketId,
          marketName: marketName,
          hasFRP: false
        };

        const dialogRef = this.dialog.open(InviteUserModalComponent, {
          width: '600px',
          maxWidth: '95vw',
          data: dialogData,
          disableClose: true
        });

        dialogRef.afterClosed().subscribe(() => {
          this.inviteUsersLoading[marketId] = false;
        });
      }
    });
  }

  /**
   * Opens the market activation modal to activate the market on blockchain
   */
  openActivationModal(market: any): void {
    const dialogData: MarketActivationWarningData = {
      marketId: market.id,
      marketName: market.name,
      marketDescription: market.description || '',
      region: market.region || ''
    };

    const dialogRef = this.dialog.open(MarketActivationWarningModalComponent, {
      data: dialogData,
      disableClose: true,
      width: '650px',
      maxWidth: '90vw',
      panelClass: 'market-activation-modal-overlay'
    });

    dialogRef.afterClosed().subscribe((result: MarketActivationWarningResult) => {
      if (result && result.marketActivated) {
        // Reload the page to refresh all data
        window.location.reload();
      }
    });
  }

  // ============================================================================
  // Fees Tracking Methods
  // ============================================================================

  /**
   * Toggle fees visibility and load data
   */
  toggleFeesSection(marketId: string): void {
    this.feesVisible[marketId] = !this.feesVisible[marketId];
    if (this.feesVisible[marketId] && !this.marketFeesMap[marketId]) {
      this.loadMarketFees(marketId);
    }
  }

  /**
   * Load fees summary for a market
   */
  loadMarketFees(marketId: string): void {
    this.marketFeesLoading[marketId] = true;
    this.feesService.getMarketFeesSummary(marketId).subscribe({
      next: (feesSummary) => {
        this.marketFeesMap[marketId] = feesSummary;
        this.marketFeesLoading[marketId] = false;
      },
      error: () => {
        // Create empty summary on error
        this.marketFeesMap[marketId] = {
          marketId: marketId,
          totalFees: '0',
          totalSettlements: 0,
          executedSettlements: 0,
          feesBySession: []
        };
        this.marketFeesLoading[marketId] = false;
      }
    });
  }

  /**
   * Refresh fees data for a market
   */
  refreshFees(marketId: string): void {
    this.loadMarketFees(marketId);
  }

  /**
   * Format wei amount to human readable FLEX
   */
  formatFlexAmount(weiAmount: string): string {
    if (!weiAmount || weiAmount === '0') return '0';
    try {
      const value = parseFloat(weiAmount) / 1e18;
      if (value < 0.0001 && value > 0) return '< 0.0001';
      return value.toFixed(4);
    } catch {
      return weiAmount;
    }
  }

  /**
   * Navigate to settlements page for a specific session
   */
  viewSessionSettlements(sessionAddress: string): void {
    this.router.navigate(['/settlements', sessionAddress]);
  }

  /**
   * Check if market has fees data
   */
  hasFeesData(marketId: string): boolean {
    const fees = this.marketFeesMap[marketId];
    return fees && (fees.totalSettlements > 0 || parseFloat(fees.totalFees) > 0);
  }

  /**
   * Get total fees collected across all markets
   */
  getTotalFeesCollected(): string {
    let total = BigInt(0);
    for (const marketId of Object.keys(this.marketFeesMap)) {
      const fees = this.marketFeesMap[marketId];
      if (fees?.totalFees) {
        total += BigInt(fees.totalFees);
      }
    }
    return this.formatFlexAmount(total.toString());
  }
}
