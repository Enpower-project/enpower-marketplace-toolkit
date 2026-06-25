import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { BlockchainService } from '../../../../core/services/blockchain/blockchain.service';
import { SessionService } from '../../../../core/services/session/session.service';
import { KeycloakService } from '../../../../core/services/keycloak/keycloak.service';
import { WalletService } from '../../../../core/services/wallet/wallet.service';
import { ProsumerWalletCheckService } from '../../../../core/services/wallet/prosumer-wallet-check.service';
import { MarketAuthService } from '../../../../core/services/auth/market-auth.service';
import { MarketSelectionService } from '../../../../core/services/market-selection/market-selection.service';
import { SettlementHttpService } from '../../../../core/services/settlement/settlement.http.service';
import { TreasuryService } from '../../../../core/services/treasury/treasury.service';
import { FrpPaymentRequest } from '../../../../core/services/settlement/settlement.types';
import { CommonModule, NgFor, NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatBadgeModule } from '@angular/material/badge';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';
import { FrpPendingPaymentsModalComponent } from '../../frp-pending-payments-modal/frp-pending-payments-modal.component';
import { Subscription } from 'rxjs';
import { ActiveSessionsContainerComponent } from "./components/active-sessions-container/active-sessions-container.component";
import { MarketFactoryService } from '../../../../features/market-factory/services/market-factory.service';

@Component({
  selector: 'app-dsopanel',
  imports: [NgIf, CommonModule, FormsModule, MatCardModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule, MatBadgeModule, MatTooltipModule, ActiveSessionsContainerComponent],
  standalone: true,
  templateUrl: './dsopanel.component.html',
  styleUrl: './dsopanel.component.css'
})
export class DSOPanelComponent implements OnInit, OnDestroy {
  associatedMarket: any = null;
  sessions: any[] = [];
  username: string = '';
  selectedSession: any = null;
  showBidForm = false;
  confirmationMessage = '';
  private currentMarketState: string | null = null;
  manageSessionModal = false;
  sessionToManage: any = null;
  sessionState: string = '';
  isLoading = false;
  private subscription = new Subscription();
  currentMarketId: string | null = null;

  // Wallet status properties
  walletInfo: any = null;
  isCheckingWallet = true;
  walletCheckError = false;

  // FRP Dashboard Metrics
  pendingPayments: FrpPaymentRequest[] = [];
  isLoadingPayments = false;
  totalPendingAmount = '0';
  totalPaidAmount = '0';
  treasuryBalance: any = null;
  isLoadingTreasury = false;

  sessionStateMap = [
    'Created',
    'BidSessionOpened',
    'OfferSessionOpened',
    'BidSessionClosed',
    'OfferSessionClosed',
    'TradingStopped',
    'MatchDone',
    'OfferVerified',
    'ContractExecuted',
    'SessionClosed'
  ];
  managementMessage = '';

  bidData = {
    quantity: null,
    price: null,
    startDTime: '',
    endDTime: '',
    flexType: 'UP'
  };

  constructor(
    private blockchainService: BlockchainService,
    private sessionService: SessionService,
    private keycloak: KeycloakService,
    private walletService: WalletService,
    private prosumerWalletCheckService: ProsumerWalletCheckService,
    private marketAuthService: MarketAuthService,
    private marketSelectionService: MarketSelectionService,
    private marketFactoryService: MarketFactoryService,
    private settlementService: SettlementHttpService,
    private treasuryService: TreasuryService,
    private dialog: MatDialog,
    private router: Router
  ) { }

  ngOnInit() {
    this.username = this.keycloak.getUsername() || '';

    this.checkWalletStatus();

    this.subscription.add(
      this.marketAuthService.marketContextReady$.subscribe(isReady => {
        if (isReady) {
          const currentMarket = this.marketSelectionService.getSelectedMarket();
          if (currentMarket) {
            this.loadMarketData(currentMarket);
          } else {
            this.clearMarketData();
          }
        } else {
          this.clearMarketData();
        }
      })
    );
    this.loadPendingPayments();

    this.marketAuthService.marketContextReady$.subscribe(isReady => {
      if (!isReady) {
        this.isLoading = false;
        this.currentMarketId = null;
        this.associatedMarket = null;
        this.sessions = [];
      } else {
        const currentMarket = this.marketSelectionService.getSelectedMarket();

        if (currentMarket) {
          if (!this.currentMarketId || currentMarket !== this.currentMarketId) {
            this.currentMarketId = currentMarket;
            this.associatedMarket = null;
            this.sessions = [];
            this.isLoading = true;
            this.loadAssociatedMarket();
            this.checkWalletStatus();
          } else {
            this.isLoading = false;
          }
        } else {
          this.isLoading = false;
          this.currentMarketId = null;
          this.associatedMarket = null;
          this.sessions = [];
        }
      }
    });


    this.subscription.add(
      this.marketSelectionService.selectedMarket$.subscribe(marketId => {
        if (!this.marketAuthService.isMarketContextReady()) {
          this.isLoading = true;
          return;
        }

        if (marketId) {
          if (marketId !== this.currentMarketId) {
            this.loadMarketData(marketId);
          }
        } else {
          this.clearMarketData();
        }
      })
    );

    this.subscription.add(
      this.sessionService.sessions$.subscribe(sessions => {
        this.sessions = sessions;
      })
    );
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
  }

  get isMarketDeactivated(): boolean {
    return this.currentMarketState === 'DEACTIVATED';
  }

  private loadMarketData(marketId: string): void {
    this.currentMarketId = marketId;
    this.associatedMarket = {
      id: marketId,
      name: this.marketSelectionService.getMarketName(marketId)
    };

    this.marketFactoryService.getMarketById(marketId).subscribe({
    next: (market: any) => {
      this.currentMarketState = market.state || market.status || null;
    },
    error: () => this.currentMarketState = null
  });

    this.fetchSessions();
    this.checkWalletStatus();
  }

  private clearMarketData(): void {
    this.isLoading = false;
    this.currentMarketId = null;
    this.associatedMarket = null;
    this.sessions = [];
  }

  private fetchSessions(): void {
    if (!this.currentMarketId) {
      this.isLoading = false;
      return;
    }

    this.isLoading = true;
    this.sessionService.getSessions().subscribe({
      next: (response) => {
        this.isLoading = false;
        if (response.success) {
          this.sessions = response.data;
        }
      },
      error: () => {
        this.isLoading = false;
        this.sessions = [];
      }
    });
  }

  openBidForm(session: any) {
    this.selectedSession = session;
    this.showBidForm = true;
    this.bidData = {
      quantity: null,
      price: null,
      startDTime: '',
      endDTime: '',
      flexType: 'UP'
    };
    this.confirmationMessage = '';
  }

  loadAssociatedMarket(): void {
    const currentMarketId = this.marketSelectionService.getSelectedMarket();

    if (currentMarketId) {
      this.associatedMarket = {
        id: currentMarketId,
        name: this.marketSelectionService.getMarketName(currentMarketId)
      };

      this.loadSessions(this.associatedMarket.id);
      this.isLoading = false;
    } else {
      this.associatedMarket = null;
      this.isLoading = false;
    }
  }

  loadSessions(marketId: string) {
    this.blockchainService.getMarketSessions(marketId).subscribe({
      next: (res) => this.sessions = res.sessions || [],
      error: () => this.sessions = []
    });
  }

  cancelBid() {
    this.showBidForm = false;
    this.selectedSession = null;
    this.bidData = {
      quantity: null,
      price: null,
      startDTime: '',
      endDTime: '',
      flexType: 'UP'
    };
  }

  onSubmitBid() {
    const startDTime = Math.floor(new Date(this.bidData.startDTime).getTime() / 1000);
    const endDTime = Math.floor(new Date(this.bidData.endDTime).getTime() / 1000);

    const payload = {
      quantity: Number(this.bidData.quantity),
      price: Number(this.bidData.price),
      startDTime,
      endDTime,
      flexType: this.bidData.flexType
    };

    this.blockchainService.createBid(this.selectedSession.id, payload).subscribe({
      next: (res) => {
        this.confirmationMessage = `Bid creada correctamente. Coste de la transacción: ${res.txCost || 'desconocido'} ETH.`;
        this.showBidForm = false;
        this.selectedSession = null;
      },
      error: () => {
        this.confirmationMessage = 'Error al crear la Bid.';
        this.showBidForm = false;
        this.selectedSession = null;
      }
    });
  }

  closeConfirmation() {
    this.confirmationMessage = '';
  }

  manageSession(session: any) {
    this.sessionToManage = session;
    this.manageSessionModal = true;
    this.managementMessage = '';
    this.sessionState = this.sessionStateMap[session.currentState] || 'Desconocido';
  }

  closeManageSession() {
    this.manageSessionModal = false;
    this.sessionToManage = null;
    this.managementMessage = '';
  }

  // Session management methods
  openBidSession() {
    this.blockchainService.openBidSession(this.sessionToManage.id).subscribe({
      next: () => {
        this.managementMessage = 'Bid session abierta correctamente.';
        this.reloadSessions();
      },
      error: () => this.managementMessage = 'Error al abrir Bid session.'
    });
  }

  openOfferSession() {
    this.blockchainService.openOfferSession(this.sessionToManage.id).subscribe({
      next: () => {
        this.managementMessage = 'Offer session abierta correctamente.';
        this.reloadSessions();
      },
      error: () => this.managementMessage = 'Error al abrir Offer session.'
    });
  }

  closeBidSession() {
    this.blockchainService.closeBidSession(this.sessionToManage.id).subscribe({
      next: () => {
        this.managementMessage = 'Bid session cerrada correctamente.';
        this.reloadSessions();
      },
      error: () => this.managementMessage = 'Error al cerrar Bid session.'
    });
  }

  closeOfferSession() {
    this.blockchainService.closeOfferSession(this.sessionToManage.id).subscribe({
      next: () => {
        this.managementMessage = 'Offer session cerrada correctamente.';
        this.reloadSessions();
      },
      error: () => this.managementMessage = 'Error al cerrar Offer session.'
    });
  }

  stopTrading() {
    this.blockchainService.stopTrading(this.sessionToManage.id).subscribe({
      next: () => {
        this.managementMessage = 'Trading detenido correctamente.';
        this.reloadSessions();
      },
      error: () => this.managementMessage = 'Error al detener trading.'
    });
  }

  doMatch() {
    this.blockchainService.doMatch(this.sessionToManage.id).subscribe({
      next: () => {
        this.managementMessage = 'Emparejamiento realizado correctamente.';
        this.reloadSessions();
      },
      error: () => this.managementMessage = 'Error al emparejar.'
    });
  }

  verifyOffers() {
    this.blockchainService.verifyOffers(this.sessionToManage.id).subscribe({
      next: () => {
        this.managementMessage = 'Offers verificadas correctamente.';
        this.reloadSessions();
      },
      error: () => this.managementMessage = 'Error al verificar offers.'
    });
  }

  executeContract() {
    this.blockchainService.executeContract(this.sessionToManage.id).subscribe({
      next: () => {
        this.managementMessage = 'Contrato ejecutado correctamente.';
        this.reloadSessions();
      },
      error: () => this.managementMessage = 'Error al ejecutar contrato.'
    });
  }

  closeSession() {
    this.blockchainService.closeSession(this.sessionToManage.id).subscribe({
      next: () => {
        this.managementMessage = 'Sesión cerrada correctamente.';
        this.reloadSessions();
      },
      error: () => this.managementMessage = 'Error al cerrar sesión.'
    });
  }

  reloadSessions() {
    this.fetchSessions();
    setTimeout(() => {
      if (this.sessionToManage) {
        const updated = this.sessions.find(s => s.id === this.sessionToManage.id);
        if (updated) {
          this.sessionToManage = updated;
          this.sessionState = this.sessionStateMap[updated.currentState] || 'Desconocido';
        }
      }
    }, 500);
  }

  checkWalletStatus(): void {
    this.isCheckingWallet = true;
    this.walletCheckError = false;

    this.walletService.getWallet().subscribe({
      next: (response) => {
        if (response.success && response.data) {
          this.walletInfo = response.data;
        } else {
          this.walletInfo = { hasWallet: false, address: null, binding: '' };
        }
        this.isCheckingWallet = false;
      },
      error: (error) => {
        this.walletCheckError = true;
        this.isCheckingWallet = false;
        this.walletInfo = { hasWallet: false, address: null, binding: '' };
      }
    });
  }

  createWallet(): void {
    this.prosumerWalletCheckService.forceWalletCheck().subscribe({
      next: (walletCreated) => {
        if (walletCreated) {
          this.checkWalletStatus();
        }
      },
      error: (error) => {
      }
    });
  }

  canParticipateInTrading(): boolean {
    return this.walletInfo && this.walletInfo.hasWallet;
  }

  createFlexibilityRequest(): void {
    this.router.navigate(['/market-sessions', 'create']);
  }

  viewActiveRequests(): void {
    this.router.navigate(['/market-sessions'], { queryParams: { status: 'DRAFT' } });
  }

  // ============================================================================
  // FRP Dashboard Methods
  // ============================================================================

  /**
   * Load pending payment requests for FRP
   */
  loadPendingPayments(): void {
    this.isLoadingPayments = true;
    this.settlementService.getPendingPaymentsForFrp().subscribe({
      next: (payments) => {
        this.pendingPayments = payments || [];
        this.calculateTotalPending();
        this.isLoadingPayments = false;
      },
      error: () => {
        this.pendingPayments = [];
        this.totalPendingAmount = '0';
        this.isLoadingPayments = false;
      }
    });
  }

  /**
   * Calculate total pending amount from payment requests
   */
  private calculateTotalPending(): void {
    if (this.pendingPayments.length === 0) {
      this.totalPendingAmount = '0';
      return;
    }

    const total = this.pendingPayments.reduce((sum, payment) => {
      const amount = parseFloat(payment.totalPayment || '0');
      return sum + amount;
    }, 0);

    this.totalPendingAmount = this.formatFlexAmount(total.toString());
  }

  /**
   * Load treasury balance for the FRP user
   */
  loadTreasuryBalance(): void {
    if (!this.walletInfo?.address) return;

    this.isLoadingTreasury = true;
    this.treasuryService.getBalanceSummary(this.walletInfo.address).subscribe({
      next: (balance) => {
        this.treasuryBalance = balance;
        this.isLoadingTreasury = false;
      },
      error: () => {
        this.treasuryBalance = null;
        this.isLoadingTreasury = false;
      }
    });
  }

  /**
   * Open pending payments modal
   */
  openPendingPaymentsModal(): void {
    if (this.pendingPayments.length === 0) return;

    const dialogRef = this.dialog.open(FrpPendingPaymentsModalComponent, {
      data: { pendingPayments: this.pendingPayments },
      width: '700px',
      disableClose: false,
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result?.paid) {
        // Refresh data after payment
        this.loadPendingPayments();
        this.loadTreasuryBalance();
      }
    });
  }

  /**
   * Navigate to settlements page
   */
  viewSettlements(): void {
    this.router.navigate(['/settlement-manager']);
  }

  /**
   * Format FLEX token amount from wei to readable format
   */
  formatFlexAmount(weiAmount: string): string {
    if (!weiAmount || weiAmount === '0') return '0';
    try {
      const value = parseFloat(weiAmount) / 1e18;
      return value.toFixed(4);
    } catch {
      return weiAmount;
    }
  }

  /**
   * Get count of sessions by status
   */
  getSessionCountByStatus(status: string): number {
    return this.sessions.filter(s =>
      this.sessionStateMap[s.currentState]?.toLowerCase().includes(status.toLowerCase())
    ).length;
  }

  /** Copies the wallet address to the clipboard. */
  copyAddress(address: string): void {
    if (!address) return;
    navigator.clipboard.writeText(address).catch(() => {});
  }
}
