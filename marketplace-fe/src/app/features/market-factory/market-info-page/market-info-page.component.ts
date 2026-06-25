import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatTableModule } from '@angular/material/table';
import { MatDialog } from '@angular/material/dialog';
import { HttpErrorResponse } from '@angular/common/http';
import { Subscription, forkJoin } from 'rxjs';
import { distinctUntilChanged, map } from 'rxjs/operators';
import { MarketAuthService } from '../../../core/services/auth/market-auth.service';
import { MarketSelectionService } from '../../../core/services/market-selection/market-selection.service';
import { MarketFactoryService } from '../services/market-factory.service';
import { WalletService } from '../../../core/services/wallet/wallet.service';
import { MarketActivationCheckService } from '../../../core/services/market/market-activation-check.service';
import { KeycloakService } from '../../../core/services/keycloak/keycloak.service';
import { InvitationService } from '../../../core/services/invitation/invitation.service';
import { MarketWalletWarningModalComponent, MarketWalletWarningData, MarketWalletWarningResult } from '../market-wallet-warning-modal/market-wallet-warning-modal.component';
import { MarketActivationWarningModalComponent, MarketActivationWarningData, MarketActivationWarningResult } from '../market-activation-warning-modal/market-activation-warning-modal.component';
import { Market, MyMarket } from '../../../shared/models/market-place/market-model';
import { UserService } from '../../../core/services/user.service';
import { ConfirmationDialogComponent, ConfirmationDialogData, ConfirmationDialogResult } from '../../../shared/components/confirmation-dialog/confirmation-dialog.component';
import { ToastNotificationComponent } from '../../../shared/components/toast-notification/toast-notification.component';
import { InviteUserModalComponent, InviteUserDialogData } from '../../../shared/components/invite-user-modal/invite-user-modal.component';
import { Clipboard } from '@angular/cdk/clipboard';
import { ActivatedRoute } from '@angular/router';

interface MarketDetails {
  id: string;
  name: string;
  description?: string;
  status: 'CREATED_OFFLINE' | 'WALLET_CREATED_PENDING_ACTIVATION' | 'ACTIVE_ONCHAIN' | 'SUSPENDED' | 'DEACTIVATED';
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;

  // Real market fields
  region?: string;
  dsoAddress?: string;
  ownerEmail?: string;
  marketOwner?: {
    id?: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    username?: string;
    profileCompleted?: boolean;
    walletCreated?: boolean;
    isVerified?: boolean;
    lastLoginAt?: string;
  };

  // Blockchain fields
  marketAddress?: string;
  txHash?: string;
  publicAddress?: string;
  activatedAt?: string;

  // Wallet information
  hasWallet?: boolean;
  walletAddress?: string;

  // Mock data for display (keeps existing functionality)
  participantCount?: number;
  configuration?: {
    maxParticipants?: number;
    tradingEnabled?: boolean;
    sessionDuration?: number;
  };
}

@Component({
  selector: 'app-market-info-page',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatIconModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatChipsModule,
    MatDividerModule,
    MatTooltipModule,
    MatExpansionModule,
    MatTableModule
  ],
  templateUrl: './market-info-page.component.html',
  styleUrls: ['./market-info-page.component.css']
})
export class MarketInfoPageComponent implements OnInit, OnDestroy {
  clipboard = inject(Clipboard)
  currentMarketId: string | null = null;
  marketDetails: MarketDetails | null = null;
  isLoading = true;
  hasError = false;
  marketId: string | null = null;
  errorMessage: string | null = null;
  isCheckingWallet = false;
  hasShownWalletModal = false;
  hasShownActivationModal = false;
  private subscription = new Subscription();
  marketUsers: any[] = [];
  isLoadingUsers = false;

  // Check if user has FMO_LMO role
  get isFMO_LMO(): boolean {
    return this.keycloakService.hasRole('FMO_LMO');
  }

  constructor(
    private marketAuthService: MarketAuthService,
    private marketSelectionService: MarketSelectionService,
    private marketFactoryService: MarketFactoryService,
    private walletService: WalletService,
    private dialog: MatDialog,
    private marketActivationCheckService: MarketActivationCheckService,
    private keycloakService: KeycloakService,
    private activatedRoute: ActivatedRoute,
    private userService: UserService,
    private invitationService: InvitationService
  ) { }

  ngOnInit(): void {
    this.setupSubscriptions();
    
    this.marketId = this.activatedRoute.snapshot.queryParamMap.get('marketId') ?? this.marketSelectionService.getSelectedMarket();

    if (this.marketId) {
      this.loadMarketInfo();
      this.loadMarketUsers();
    }
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
  }

  private setupSubscriptions(): void {
    // Subscribe to selected market changes to reload data when market changes
    this.subscription.add(
      this.marketSelectionService.selectedMarket$.subscribe(marketId => {
        if (marketId) {
          // Check if market actually changed before reloading
          if (marketId !== this.currentMarketId) {
            this.currentMarketId = marketId;
            this.loadMarketInfo();
            this.loadMarketUsers();
          }
        } else {
          // No market selected - clear data
          this.currentMarketId = null;
          this.marketDetails = null;
          this.marketUsers = [];
          this.isLoading = false;
        }
      })
    );
  }

  loadMarketInfo(): void {
    
    if (!this.marketId) {
      // No market selected - clear everything
      this.currentMarketId = null;
      this.marketDetails = null;
      this.isLoading = false;
      this.hasError = false;
      this.errorMessage = null;
      return;
    }

    this.isLoading = true;
    this.hasError = false;
    this.errorMessage = null;
    this.hasShownWalletModal = false;
    this.hasShownActivationModal = false;
    this.currentMarketId = this.marketId;
    this.fetchMarketDetails();
  }

  private fetchMarketDetails(): void {
    if (!this.currentMarketId) {
      this.isLoading = false;
      return;
    }

    // Try to get real market data first
    this.marketFactoryService.getMarketById(this.currentMarketId).subscribe({
      next: (market) => {
        this.marketDetails = this.combineRealAndMockData(market);
        this.isLoading = false;
        this.hasError = false;
        this.checkMarketWallet();
        this.checkMarketActivation();
        this.loadMarketUsers();
      },
      error: (error) => {

        // Fallback to my-markets endpoint
        this.loadFromMyMarkets();
      }
    });
  }

  private loadFromMyMarkets(): void {
    this.marketFactoryService.getMyMarkets().subscribe({
      next: (response) => {
        const market = response.data.markets.find(m => m.id === this.currentMarketId);
        if (market) {
          this.marketDetails = this.combineMyMarketAndMockData(market);
          this.isLoading = false;
          this.hasError = false;
          this.checkMarketWallet();
          this.checkMarketActivation();
          // Ensure users are loaded after resolving market details from my-markets
          this.loadMarketUsers();
        } else {
          this.fallbackToMockData();
        }
      },
      error: (error) => {
        this.fallbackToMockData();
      }
    });
  }

  private combineRealAndMockData(market: Market): MarketDetails {
    return {
      id: market._id || this.currentMarketId!,
      name: market.name || this.marketSelectionService.getMarketName(this.currentMarketId!) || `Market ${this.currentMarketId}`,
      description: market.description || 'Energy trading marketplace for distributed energy resources',
      status: market.state || 'ACTIVE_ONCHAIN',
      isActive: market.state === 'ACTIVE_ONCHAIN', // Could be derived from market.state
      createdAt: market.createdAt?.toString() || '2024-01-15T10:30:00Z',
      updatedAt: market.updatedAt?.toString() || new Date().toISOString(),

      // Real market fields
      region: market.region,
      dsoAddress: market.dsoAddress,
      ownerEmail: market.ownerEmail,
      marketOwner: market.marketOwner ? {
        id: market.marketOwner.id,
        firstName: market.marketOwner.firstName,
        lastName: market.marketOwner.lastName,
        email: market.marketOwner.email,
      } : undefined,

      // Blockchain fields - these are needed for "Blockchain Information" section
      marketAddress: market.marketAddress,
      txHash: market.txHash,
      publicAddress: market.publicAddress,

      // Mock data for display functionality
      participantCount: 15,
      configuration: {
        maxParticipants: 50,
        tradingEnabled: true,
        sessionDuration: 60
      }
    };
  }

  private combineMyMarketAndMockData(market: MyMarket): MarketDetails {
    return {
      id: market.id,
      name: market.name,
      description: market.description || 'Energy trading marketplace for distributed energy resources',
      status: market.state,
      isActive: market.isActive,
      createdAt: market.createdAt,
      updatedAt: new Date().toISOString(),

      // Real market fields
      region: market.region,
      marketOwner: market.marketOwner ? {
        id: market.marketOwner._id,
        firstName: market.marketOwner.firstName,
        lastName: market.marketOwner.lastName,
        email: market.marketOwner.email,
        username: market.marketOwner.username,
        profileCompleted: market.marketOwner.profileCompleted,
        walletCreated: market.marketOwner.walletCreated,
        isVerified: market.marketOwner.isVerified,
        lastLoginAt: market.marketOwner.lastLoginAt
      } : undefined,

      // Blockchain fields - now included in MyMarket interface
      marketAddress: market.marketAddress,
      txHash: market.txHash,
      publicAddress: market.publicAddress,

      // Mock data for display functionality
      participantCount: 15,
      configuration: {
        maxParticipants: 50,
        tradingEnabled: true,
        sessionDuration: 60
      }
    };
  }

  private fallbackToMockData(): void {
    setTimeout(() => {
      this.marketDetails = {
        id: this.currentMarketId!,
        name: this.marketSelectionService.getMarketName(this.currentMarketId!) || `Market ${this.currentMarketId}`,
        description: 'Energy trading marketplace for distributed energy resources',
        status: 'ACTIVE_ONCHAIN',
        isActive: true,
        createdAt: '2024-01-15T10:30:00Z',
        updatedAt: new Date().toISOString(),

        // Default mock fields
        region: 'Europe/Italy',
        dsoAddress: '0x1234...5678',
        ownerEmail: 'admin@market.com',
        participantCount: 15,
        configuration: {
          maxParticipants: 50,
          tradingEnabled: true,
          sessionDuration: 60
        }
      };

      this.isLoading = false;
      this.hasError = false;
    }, 500);
  }

  refreshMarketInfo(): void {
    this.loadMarketInfo();
  }

  getStatusClass(status: string): string {
    switch (status) {
      case 'ACTIVE_ONCHAIN':
        return 'status-active';
      case 'PENDING_ACTIVATION':
        return 'status-pending';
      case 'CREATED_OFFLINE':
        return 'status-created';
      case 'DEACTIVATED':
        return 'status-deactivated';
      default:
        return 'status-unknown';
    }
  }

  getStatusIcon(status: string): string {
    switch (status) {
      case 'ACTIVE_ONCHAIN':
        return 'check_circle';
      case 'PENDING_ACTIVATION':
        return 'hourglass_empty';
      case 'CREATED_OFFLINE':
        return 'draft';
      case 'DEACTIVATED': 
        return 'block';
      default:
        return 'help';
    }
  }

  getStatusLabel(status: string): string {
    switch (status) {
      case 'ACTIVE_ONCHAIN':
        return 'Active On-Chain';
      case 'PENDING_ACTIVATION':
        return 'Pending Activation';
      case 'CREATED_OFFLINE':
        return 'Created Offline';
      case 'DEACTIVATED': 
        return 'Deactivated';
      default:
        return 'Unknown';
    }
  }

  viewMarketDetails(): void {
    // Navigate to detailed market view or blockchain explorer
    // Could implement navigation to marketplace component or external link
  }

  copyToClipboard(value: string): void {
    navigator.clipboard.writeText(value).then(() => {
      // Could show a toast notification here
    }).catch(err => {
    });
  }

  /**
   * Manually trigger wallet creation (for deferred creation)
   */
  createMarketWallet(): void {
    if (!this.marketDetails || !this.currentMarketId) {
      return;
    }

    // Reset flag to allow showing modal again
    this.hasShownWalletModal = false;
    this.showMarketWalletWarning();
  }

  private checkMarketWallet(): void {
    if (!this.currentMarketId || !this.marketDetails || this.hasShownWalletModal) {
      return;
    }

    // DISABLED: Wallet creation modal is now handled in app.component.ts after login
    // Just check the wallet status but don't show any modals


    this.isCheckingWallet = true;

    this.walletService.getMarketWallet(this.currentMarketId).subscribe({
      next: (response) => {
        if (response.success && response.data) {
          this.marketDetails!.hasWallet = response.data.hasWallet;
          this.marketDetails!.walletAddress = response.data.address;
          // Don't show modal - handled in app.component.ts
        }
        this.isCheckingWallet = false;
      },
      error: (error) => {
        this.isCheckingWallet = false;
        // Don't show modal even on error - handled in app.component.ts
      }
    });
  }

  private showMarketWalletWarning(): void {
    if (!this.marketDetails || !this.currentMarketId || this.hasShownWalletModal) {
      return;
    }

    this.hasShownWalletModal = true;

    const dialogData: MarketWalletWarningData = {
      marketId: this.currentMarketId,
      marketName: this.marketDetails.name
    };

    const dialogRef = this.dialog.open(MarketWalletWarningModalComponent, {
      data: dialogData,
      disableClose: false,
      width: '600px',
      maxWidth: '90vw'
    });

    dialogRef.afterClosed().subscribe((result: MarketWalletWarningResult) => {
      if (result && result.walletCreated && result.walletData) {
        // Update market details with new wallet information
        this.marketDetails!.hasWallet = true;
        this.marketDetails!.walletAddress = result.walletData.publicAddress;
        this.marketDetails!.publicAddress = result.walletData.publicAddress;
        this.marketDetails!.status = 'WALLET_CREATED_PENDING_ACTIVATION';
        // REMOVED: Automatic activation modal trigger
        // The MarketActivationCheckService in app.component handles activation prompts globally
        // Don't automatically show activation modal here to prevent duplicate modals

      }
      // Reset modal flag when dialog closes, but only if wallet wasn't created
      if (!result || !result.walletCreated) {
        this.hasShownWalletModal = false;
      }
    });
  }

  private checkMarketActivation(): void {
    // DISABLED: All modals (wallet creation, activation) are now handled in app.component.ts
    // They appear automatically in /home after login in the correct sequence:
    // 1. Market Acceptance Modal
    // 2. Wallet Creation Modal
    // 3. Activation Modal
  }

  private showMarketActivationModal(): void {
    // Deprecated - now handled by checkMarketActivation which uses MarketActivationCheckService
    return;
  }

  // Variable para controlar el estado de activación (añadir en las propiedades del componente)
  isActivatingBlockchain = false;

  /**
   * Opens the market activation warning modal to activate the market on blockchain
   */
  activateMarketOnBlockchain(): void {
    if (!this.marketDetails?.hasWallet) {
      // Opcional: mostrar un mensaje de error si no tiene wallet
      return;
    }

    const dialogRef = this.dialog.open(MarketActivationWarningModalComponent, {
      width: '600px',
      disableClose: true,
      data: {
        marketId: this.marketDetails.id,
        marketName: this.marketDetails.name
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result?.success) {
        // La activación fue exitosa, recargar la información del market
        this.loadMarketInfo();
      }
    });
  }

  private loadMarketUsers(): void {
    if (!this.currentMarketId) {
      this.marketUsers = [];
      return;
    }
    this.isLoadingUsers = true;
    const marketId = this.currentMarketId as string;
    forkJoin({
      marketUsersResp: this.marketFactoryService.getUsersInMarket(marketId),
      allUsersResp: this.userService.getAllUsers()
    }).subscribe({
      next: ({ marketUsersResp, allUsersResp }) => {
        const directUsers = marketUsersResp?.users ?? [];
        const allUsers = allUsersResp?.data?.users ?? [];

        const accessUsers = allUsers.filter(u => Array.isArray(u.accessibleMarkets) && u.accessibleMarkets.includes(marketId));

        const byId = new Map<string, any>();
        [...directUsers, ...accessUsers].forEach(u => {
          const id = u.id.toString();
          if (id && !byId.has(id)) byId.set(id, u);
        });

        this.marketUsers = Array.from(byId.values());
        this.isLoadingUsers = false;
      },
      error: (error) => {
        this.marketUsers = [];
        this.isLoadingUsers = false;
      }
    });
  }

  refreshUsers(): void {
    this.loadMarketUsers();
  }

  isOwnerRole(user: any): boolean {
    const role = (user?.role || '').toString().toUpperCase();
    return role === 'FMO_LMO' || role.includes('FMO_LMO');
  }

  openInviteUserModal(): void {
    if (!this.currentMarketId || !this.marketDetails) {
      ToastNotificationComponent.show('No market selected', 'error');
      return;
    }
    // First, check if market has FRP
    this.invitationService.checkMarketHasFRP(this.currentMarketId).subscribe({
      next: (response: { hasFRP: boolean; email?: string }) => {
        const hasFRP = response.hasFRP || false;

        const dialogData: InviteUserDialogData = {
          marketId: this.currentMarketId!,
          marketName: this.marketDetails!.name,
          hasFRP: hasFRP
        };

        const dialogRef = this.dialog.open(InviteUserModalComponent, {
          width: '600px',
          data: dialogData,
          disableClose: true
        });

        dialogRef.afterClosed().subscribe((result) => {
          if (result?.success) {
            this.loadMarketUsers();
          }
        });
      },
      error: (error: HttpErrorResponse) => {
        ToastNotificationComponent.show('Error checking market FRP status', 'error');
      }
    });
  }

  deleteUserPermanently(userId: string): void {
    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      width: '420px',
      data: {
        title: 'Delete User',
        message: 'This will permanently delete the user from the system. Continue?',
        confirmText: 'Delete',
        cancelText: 'Cancel',
        type: 'danger'
      } as ConfirmationDialogData
    });

    dialogRef.afterClosed().subscribe((result: ConfirmationDialogResult) => {
      if (!result?.confirmed) return;

      this.userService.deleteUser(userId).subscribe({
        next: () => {
          ToastNotificationComponent.show('User deleted successfully', 'success');
          this.loadMarketUsers();
        },
        error: (error) => {
          const message = error?.error?.message || 'Failed to delete user';
          ToastNotificationComponent.show(message, 'error');
        }
      });
    });
    
  }
  copy(value: string): void {
    this.clipboard.copy(value);
    ToastNotificationComponent.show('Copied to clipboard', 'success');
  }
}
