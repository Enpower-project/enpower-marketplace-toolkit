import { Component, OnInit, OnDestroy } from '@angular/core';
import { BlockchainService } from '../../../../core/services/blockchain/blockchain.service';
import { SessionService } from '../../../../core/services/session/session.service';
import { KeycloakService } from '../../../../core/services/keycloak/keycloak.service';
import { WalletService } from '../../../../core/services/wallet/wallet.service';
import { ProsumerWalletCheckService } from '../../../../core/services/wallet/prosumer-wallet-check.service';
import { MarketAuthService } from '../../../../core/services/auth/market-auth.service';
import { MarketSelectionService } from '../../../../core/services/market-selection/market-selection.service';
import { MarketFactoryService } from '../../../../features/market-factory/services/market-factory.service';
import { UserService } from '../../../../core/services/user.service';
import { SettlementHttpService } from '../../../../core/services/settlement/settlement.http.service';
import { TreasuryService, TreasuryBalance } from '../../../../core/services/treasury/treasury.service';
import { Settlement } from '../../../../core/services/settlement/settlement.types';
import { CommonModule, NgFor, NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MarketSubscriptionModalComponent } from '../../market-subscription-modal/market-subscription-modal.component';
import { Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';
import { ProsumerSessionsContainerComponent } from "./components/prosumer-sessions-container/prosumer-sessions-container.component";

@Component({
  selector: 'app-prosumer-panel',
  imports: [NgIf, CommonModule, FormsModule, RouterModule, MatCardModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule, MatDialogModule, MatTooltipModule, ProsumerSessionsContainerComponent],
  templateUrl: './prosumer-panel.component.html',
  styleUrl: './prosumer-panel.component.css'
})
export class ProsumerPanelComponent implements OnInit, OnDestroy {
  associatedMarket: any = null;
  sessions: any[] = [];
  username: string = '';
  showOfferForm = false;
  selectedSession: any = null;
  confirmationMessage = '';
  isLoading = false;
  isMarketDeactivated = false;
  currentMarketId: string | null = null;

  // Wallet status properties
  walletInfo: any = null;
  isCheckingWallet = false;
  walletCheckError = false;

  // Multiple markets properties
  availableMarkets: any[] = [];
  isLoadingMarkets = false;
  switchingMarketId: string | null = null;

  // Earnings and performance tracking
  mySettlements: Settlement[] = [];
  isLoadingSettlements = false;
  totalEarnings = '0';
  totalPenalties = '0';
  averagePerformance = 0;
  executedSettlementsCount = 0;
  pendingSettlementsCount = 0;

  // Treasury balance
  treasuryBalance: TreasuryBalance | null = null;
  isLoadingTreasury = false;

  offerData = {
    quantity: null,
    price: null,
    startDTime: '',
    endDTime: '',
    flexType: 'UP'
  };

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

  constructor(
    private blockchainService: BlockchainService,
    private sessionService: SessionService,
    private keycloak: KeycloakService,
    private walletService: WalletService,
    private prosumerWalletCheckService: ProsumerWalletCheckService,
    private marketAuthService: MarketAuthService,
    private marketSelectionService: MarketSelectionService,
    private marketFactoryService: MarketFactoryService,
    private userService: UserService,
    private settlementService: SettlementHttpService,
    private treasuryService: TreasuryService,
    private dialog: MatDialog,
    private router: Router
  ) { }

  ngOnInit() {
    this.username = this.keycloak.getUsername() || '';

    // Subscribe to sessions from SessionService
    this.sessionService.sessions$.subscribe(sessions => {
      this.sessions = sessions;
    });

    // Check wallet status immediately
    this.checkWalletStatus();

    // Load available markets
    this.loadAvailableMarkets();

    // Load FSP earnings and performance data
    this.loadMySettlements();
    this.loadTreasuryBalance();

    // 🎯 Subscribe to marketContextReady to control loading state
    this.marketAuthService.marketContextReady$.subscribe(isReady => {
      if (!isReady) {
        // Context not ready - clear market and show 'no market selected' (NOT loading)
        this.isLoading = false;
        this.currentMarketId = null;
        this.associatedMarket = null;
        this.sessions = [];
      } else {
        // Context is now ready - check current market and process it
        const currentMarket = this.marketSelectionService.getSelectedMarket();

        if (currentMarket) {
          // There's a market - load it if different from current
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
          // No market - clear and stop loading
          this.isLoading = false;
          this.currentMarketId = null;
          this.associatedMarket = null;
          this.sessions = [];
        }
      }
    });

    // Single subscription to market changes - this will handle both initial load and market switches
    this.marketSelectionService.selectedMarket$.subscribe(marketId => {

      // Only process if market context is ready
      if (!this.marketAuthService.isMarketContextReady()) {
        this.isLoading = true;
        return;
      }

      if (marketId) {
        // If we have a new market ID and it's different from current, or if current is null
        if (!this.currentMarketId || marketId !== this.currentMarketId) {
          this.currentMarketId = marketId;
          // Clear previous data before reloading
          this.associatedMarket = null;
          this.sessions = [];
          // Reload the entire component data
          this.isLoading = true;
          this.loadAssociatedMarket();
          this.checkWalletStatus();
        }
      } else {
        // No market selected - clear data and stop loading to show 'no market selected' message
        this.isLoading = false;
        this.currentMarketId = null;
        this.associatedMarket = null;
        this.sessions = [];
      }
    });
  }

  ngOnDestroy(): void {
    // Subscriptions will be automatically cleaned up when component is destroyed
  }

  loadAssociatedMarket() {
    this.isLoading = true;

    // Use the same approach as market-info component
    // First try to get from context
    if (this.marketAuthService.isMarketContextReady()) {
      this.currentMarketId = this.marketAuthService.getCurrentMarketId();

      if (this.currentMarketId) {
        // We have the market ID, load its details
        this.loadMarketDetails(this.currentMarketId);
      } else {
        this.isLoading = false;
      }
    } else {
      // Try to get current market from backend like market-info does
      this.marketSelectionService.getCurrentMarket().subscribe({
        next: (response) => {
          this.currentMarketId = response.marketId;

          if (this.currentMarketId) {
            this.loadMarketDetails(this.currentMarketId);
          } else {
            this.isLoading = false;
          }
        },
        error: (err) => {
          this.isLoading = false;
        }
      });
    }
  }

  private loadMarketDetails(marketId: string): void {

    this.marketFactoryService.getMarketById(marketId).subscribe({
      next: (market) => {
        this.associatedMarket = market;
        this.isMarketDeactivated = market.state === 'DEACTIVATED'
        // Fetch sessions for this market
        this.fetchSessions();
        this.isLoading = false;
      },
      error: (err) => {
        // Even if details fail, we still have the market ID
        // Create a minimal market object with available info
        this.associatedMarket = {
          id: marketId,
          _id: marketId,
          name: this.getMarketDisplayName(marketId),
          region: null
        };
        // Fetch sessions anyway
        this.fetchSessions();
        this.isLoading = false;
      }
    });
  }

  getMarketDisplayName(marketId: string): string {
    return this.marketSelectionService.getMarketName(marketId);
  }

  private fetchSessions(): void {
    this.sessionService.getSessions().subscribe({
      next: (response) => {
        if (response.success) {
          this.sessions = response.data;
        }
      },
      error: (error) => {
        this.sessions = [];
      }
    });
  }

  canCreateOffer(session: any): boolean {
    // OfferSessionOpened is index 2
    return session.currentState === 2;
  }

  openOfferForm(session: any) {
    this.selectedSession = session;
    this.showOfferForm = true;
    this.offerData = {
      quantity: null,
      price: null,
      startDTime: '',
      endDTime: '',
      flexType: 'UP'
    };
    this.confirmationMessage = '';
  }

  cancelOffer() {
    this.showOfferForm = false;
    this.selectedSession = null;
    this.offerData = {
      quantity: null,
      price: null,
      startDTime: '',
      endDTime: '',
      flexType: 'UP'
    };
  }

  onSubmitOffer() {
    const startDTime = Math.floor(new Date(this.offerData.startDTime).getTime() / 1000);
    const endDTime = Math.floor(new Date(this.offerData.endDTime).getTime() / 1000);

    const payload = {
      quantity: Number(this.offerData.quantity),
      price: Number(this.offerData.price),
      startDTime,
      endDTime,
      flexType: this.offerData.flexType
    };

    this.blockchainService.createOffer(this.selectedSession.id, payload).subscribe({
      next: (res) => {
        this.confirmationMessage = `Offer created successfully. Transaction cost: ${res.txCost || 'unknown'} ETH.`;
        this.showOfferForm = false;
        this.selectedSession = null;
      },
      error: () => {
        this.confirmationMessage = 'Error creating the Offer.';
        this.showOfferForm = false;
        this.selectedSession = null;
      }
    });
  }

  /**
   * Check wallet status for the prosumer
   */
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

  /**
   * Create a new wallet for the prosumer
   */
  createWallet(): void {
    this.prosumerWalletCheckService.forceWalletCheck().subscribe({
      next: (walletCreated) => {
        if (walletCreated) {
          // Refresh wallet status after creation
          this.checkWalletStatus();
        }
      },
      error: (error) => {
      }
    });
  }

  /**
   * Check if user can participate in trading (has wallet)
   */
  canParticipateInTrading(): boolean {
    return this.walletInfo && this.walletInfo.hasWallet;
  }

  /**
   * Load available markets for the user
   */
  loadAvailableMarkets(): void {
    this.isLoadingMarkets = true;
    this.marketSelectionService.getAvailableMarkets().subscribe({
      next: (response) => {
        this.availableMarkets = response.availableMarketsWithNames || [];
        this.isLoadingMarkets = false;
      },
      error: (error) => {
        this.availableMarkets = [];
        this.isLoadingMarkets = false;
      }
    });
  }

  /**
   * Check if user has multiple markets
   */
  hasMultipleMarkets(): boolean {
    return this.availableMarkets.length > 1;
  }

  /**
   * Switch to a different market
   */
  switchToMarket(marketId: string): void {
    if (marketId === this.currentMarketId) {
      return; // Already on this market
    }

    this.switchingMarketId = marketId;
    this.isLoading = true;
    this.marketAuthService.setMarketContextReady(false);

    this.marketSelectionService.selectMarket(marketId).subscribe({
      next: (response) => {
        if (response.success) {
          // Market switched successfully
          setTimeout(() => {
            this.switchingMarketId = null;
            this.marketAuthService.setMarketContextReady(true);
          }, 100);
        } else {
          this.switchingMarketId = null;
          this.isLoading = false;
          this.marketAuthService.setMarketContextReady(true);
        }
      },
      error: (error) => {
        this.switchingMarketId = null;
        this.isLoading = false;
        this.marketAuthService.setMarketContextReady(true);
      }
    });
  }

  /**
   * Check if a market is currently being switched to
   */
  isSwitchingToMarket(marketId: string): boolean {
    return this.switchingMarketId === marketId;
  }

  /**
   * Check if a market is currently selected
   */
  isCurrentMarket(marketId: string): boolean {
    return marketId === this.currentMarketId;
  }

  /**
   * Open market subscription modal
   */
  openMarketSelectionModal(): void {
    // Clear market IMMEDIATELY before opening modal so UI shows 'No market selected'
    this.marketSelectionService.clearSelectedMarket();
    this.marketAuthService.setMarketContextReady(false);

    const dialogRef = this.dialog.open(MarketSubscriptionModalComponent, {
      width: '800px',
      maxHeight: '90vh',
      disableClose: true // Prevent closing without selecting a market
    });

    dialogRef.afterClosed().subscribe(result => {

      if (result?.selected && result?.marketId) {
        // Market selection successful - the modal already called selectMarket()
        // which updated the BehaviorSubject and saved to backend

        // Set context as ready so components can process the market change
        // Use a small timeout to ensure the BehaviorSubject has emitted
        setTimeout(() => {
          this.marketAuthService.setMarketContextReady(true);
        }, 100);

        // Reload available markets after selection
        this.loadAvailableMarkets();
      } else {
        // User closed modal without selecting
        this.marketSelectionService.clearSelectedMarket();
        this.marketAuthService.setMarketContextReady(true);
      }
    });
  }

  // ============================================================================
  // FSP Earnings and Performance Tracking
  // ============================================================================

  /**
   * Load settlements for the current FSP user
   */
  loadMySettlements(): void {
    this.isLoadingSettlements = true;
    this.settlementService.getMySettlements().subscribe({
      next: (settlements) => {
        this.mySettlements = settlements || [];
        this.calculateEarnings();
        this.calculatePerformance();
        this.isLoadingSettlements = false;
      },
      error: () => {
        this.mySettlements = [];
        this.totalEarnings = '0';
        this.totalPenalties = '0';
        this.averagePerformance = 0;
        this.isLoadingSettlements = false;
      }
    });
  }

  /**
   * Calculate total earnings from executed settlements
   */
  private calculateEarnings(): void {
    const executed = this.mySettlements.filter(s => s.status === 'EXECUTED');
    this.executedSettlementsCount = executed.length;
    this.pendingSettlementsCount = this.mySettlements.filter(s =>
      s.status === 'PENDING' || s.status === 'SUBMITTED' || s.status === 'CALCULATED'
    ).length;

    // Calculate total earnings (payment - collateral forfeited)
    let totalEarningsWei = BigInt(0);
    let totalPenaltiesWei = BigInt(0);

    for (const settlement of executed) {
      if (settlement.payment) {
        totalEarningsWei += BigInt(settlement.payment);
      }
      if (settlement.collateralForfeited) {
        totalPenaltiesWei += BigInt(settlement.collateralForfeited);
      }
    }

    this.totalEarnings = this.formatFlexAmount(totalEarningsWei.toString());
    this.totalPenalties = this.formatFlexAmount(totalPenaltiesWei.toString());
  }

  /**
   * Calculate average performance (delivery vs committed)
   */
  private calculatePerformance(): void {
    const settlementsWithData = this.mySettlements.filter(s =>
      s.deliveredQuantity && s.committedQuantity &&
      BigInt(s.committedQuantity) > BigInt(0)
    );

    if (settlementsWithData.length === 0) {
      this.averagePerformance = 0;
      return;
    }

    let totalPerformance = 0;
    for (const settlement of settlementsWithData) {
      const delivered = Number(settlement.deliveredQuantity);
      const committed = Number(settlement.committedQuantity);
      if (committed > 0) {
        const performance = Math.min((delivered / committed) * 100, 100);
        totalPerformance += performance;
      }
    }

    this.averagePerformance = Math.round(totalPerformance / settlementsWithData.length);
  }

  /**
   * Load treasury balance for the FSP user
   */
  loadTreasuryBalance(): void {
    if (!this.walletInfo?.address) {
      // Wait for wallet info to load
      setTimeout(() => {
        if (this.walletInfo?.address) {
          this.loadTreasuryBalance();
        }
      }, 1000);
      return;
    }

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
   * Get performance color class based on percentage
   */
  getPerformanceColorClass(): string {
    if (this.averagePerformance >= 90) return 'performance-good';
    if (this.averagePerformance >= 70) return 'performance-warning';
    return 'performance-poor';
  }

  /**
   * Navigate to settlements page
   */
  viewSettlements(): void {
    this.router.navigate(['/settlement-manager']);
  }

  /**
   * Navigate to my offers page
   */
  viewMyOffers(): void {
    this.router.navigate(['/prosumer-offers']);
  }

}
