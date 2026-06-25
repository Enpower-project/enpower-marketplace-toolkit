import { KeycloakService } from './../../../../core/services/keycloak/keycloak.service';
import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { BlockchainService } from '../../../../core/services/blockchain/blockchain.service';
import { MarketFactoryService } from '../../../../features/market-factory/services/market-factory.service';
import { CommonModule, NgFor, NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialog } from '@angular/material/dialog';
import { SuperadminService } from './superadmin.service';
import { InviteUserModalComponent } from '../../invite-user-modal/invite-user-modal.component';
import { InviteUserDialogData } from '../../../models/invitation.model';
import { InvitationService } from '../../../../core/services/invitation/invitation.service';

@Component({
  selector: 'app-superadmin-panel',
  imports: [NgFor, NgIf, CommonModule, FormsModule, MatIconModule, MatProgressSpinnerModule],
  templateUrl: './superadmin-panel.component.html',
  styleUrl: './superadmin-panel.component.css'
})
export class SuperadminPanelComponent implements OnInit {
  markets: any[] = [];
  showRoleForm = false;
  showUserManagement = false;
  showMarketSelection = false;
  selectedMarketId: string = '';
  isLoadingMarketSelection = false;
  roleData = { username: '', role: 'DSO' };
  users: any[] = [];
  selectedUser: any = null;
  newRole: string = '';
  isLoading = false;
  private loadingCount = 0; // Track multiple loading operations

  // Statistics
  totalMarkets: number = 0;
  totalUsers: number = 0;
  activeMarkets: number = 0;
  prosumersCount: number = 0;
  frpCount: number = 0;
  fmoLmoCount: number = 0;
  pendingMarkets: number = 0;
  usersWithWallet: number = 0;

  constructor(
    private blockchainService: BlockchainService,
    private marketFactoryService: MarketFactoryService,
    private keycloakService: KeycloakService,
    private superadminService: SuperadminService,
    private router: Router,
    private dialog: MatDialog,
    private invitationService: InvitationService
  ) { }

  ngOnInit() {
    this.isLoading = true;
    this.loadMarkets();
    this.loadUsers();
  }

  private startLoading(): void {
    this.loadingCount++;
    this.isLoading = true;
  }

  private finishLoading(): void {
    this.loadingCount--;
    if (this.loadingCount <= 0) {
      this.loadingCount = 0;
      this.isLoading = false;
    }
  }

  loadMarkets() {
    this.startLoading();
    this.marketFactoryService.getMarkets().subscribe({
      next: (markets) => {
        this.markets = Array.isArray(markets) ? markets : [];
        this.calculateStatistics();
        this.finishLoading();
      },
      error: (err) => {
        this.markets = [];
        this.calculateStatistics();
        this.finishLoading();
      }
    });
  }

  createMarket() {
    // const description = prompt('Description for the new Market:');
    // const region = prompt('Region for the new Market:');
    const username = prompt('Username (DSO) who will own this Market:');
    if (/* !description || !region || */ !username) return;

    this.keycloakService.getWalletByUsername(username).subscribe({
      next: (address) => {
        if (!address) {
          alert('Could not find user address');
          return;
        }
        this.blockchainService.createMarket(address).subscribe({
          next: (response) => {
            alert('Market created successfully');
            this.loadMarkets();
          },
          error: () => alert('Error creating Market')
        });
      },
      error: () => alert('Error fetching user address')
    });
  }

  manageRoles() {
    this.showRoleForm = true;
    this.roleData = { username: '', role: '' };
  }

  submitRole() {
    if (!this.roleData.username || !this.roleData.role) return;
    this.keycloakService.assignRole(this.roleData.username, this.roleData.role).subscribe({
      next: () => {
        alert('Role assigned successfully');
        this.showRoleForm = false;
      },
      error: () => alert('Error assigning role')
    });
  }

  cancelRole() {
    this.showRoleForm = false;
  }

  loadUsers() {

    this.startLoading();
    this.superadminService.getAllUsers().subscribe({
      next: (users) => {
      
        // Check if the response is an array or an object with data property
        if (Array.isArray(users)) {
          this.users = users;
        } else if (users && Array.isArray((users as any).data)) {
          this.users = (users as any).data;
        } else {
          this.users = [];
        }
        this.calculateStatistics();
        this.finishLoading();
      },
      error: (err) => {
        this.users = [];
        this.calculateStatistics();
        this.finishLoading();
      }
    });
  }

  selectUser(user: any) {
    this.selectedUser = user;
    this.newRole = '';
  }

  assignRole() {
    if (!this.selectedUser || !this.newRole) return;
    this.superadminService.assignRole(this.selectedUser._id, this.newRole).subscribe(() => {
      alert('Role assigned!');
      this.loadUsers();
    });
  }

  createWallet(user: any) {
    if (!user) return;
    this.superadminService.createWallet(user._id).subscribe(() => {
      alert('Wallet created!');
      this.loadUsers();
    });
  }

  navigateToMarkets(): void {
    this.router.navigate(['/markets-management']);
  }

  toggleUserManagement(): void {
    this.showMarketSelection = true;
    this.selectedMarketId = '';
  }

  cancelMarketSelection(): void {
    this.showMarketSelection = false;
    this.selectedMarketId = '';
    this.isLoadingMarketSelection = false;
  }

  confirmMarketSelection(): void {
    if (!this.selectedMarketId) return;

    const selectedMarket = this.markets.find(m => m._id === this.selectedMarketId);
    if (!selectedMarket) return;

    // Close the market selection modal
    this.showMarketSelection = false;

    // Check if market has FRP before opening invite modal
    this.invitationService.checkMarketHasFRP(this.selectedMarketId).subscribe({
      next: (response: { hasFRP: boolean; email?: string }) => {
        const dialogData: InviteUserDialogData = {
          marketId: selectedMarket._id!,
          marketName: selectedMarket.name,
          hasFRP: response.hasFRP
        };

        this.dialog.open(InviteUserModalComponent, {
          width: '500px',
          data: dialogData
        });
      },
      error: (error: any) => {
        // Open modal anyway with hasFRP = false
        const dialogData: InviteUserDialogData = {
          marketId: selectedMarket._id!,
          marketName: selectedMarket.name,
          hasFRP: false
        };

        this.dialog.open(InviteUserModalComponent, {
          width: '500px',
          data: dialogData
        });
      }
    });
  }

  getActiveMarketsCount(): number {
    return this.markets.filter((market: any) => market.isActive).length;
  }

  getUsersByRole(role: string): number {
    return this.users.filter((user: any) => user.role === role).length;
  }

  hasWallet(user: any): boolean {
    // Check if user has wallet using multiple possible indicators
    return !!(
      user.walletBinding
    );
  }

  calculateStatistics(): void {
    // Users by role
    const prosumerUsers = this.users.filter((user: any) => user.role === 'FSP');
    const marketOwnerUsers = this.users.filter((user: any) => user.role === 'FMO_LMO');
    const frpUsers = this.users.filter((user: any) => user.role === 'FRP');

    // Total markets - count all markets from database
    this.totalMarkets = this.markets.length;

    // Total users - count all participating users
    this.totalUsers = this.users.length;

    // Active markets - count markets with state 'ACTIVE_ONCHAIN'
    this.activeMarkets = this.markets.filter((market: any) =>
      market.state === 'ACTIVE_ONCHAIN'
    ).length;

    // Pending markets - markets waiting for activation
    this.pendingMarkets = this.markets.filter((market: any) =>
      market.state === 'WALLET_CREATED_PENDING_ACTIVATION' ||
      market.state === 'CREATED'
    ).length;

    // Users by role
    this.prosumersCount = prosumerUsers.length;
    this.frpCount = frpUsers.length;
    this.fmoLmoCount = marketOwnerUsers.length;

    // Users with wallet
    this.usersWithWallet = this.users.filter((user: any) =>
      user.walletBinding || user.wallet || user.walletAddress
    ).length;
  }

  /**
   * Refresh all data
   */
  refreshData(): void {
    this.loadMarkets();
    this.loadUsers();
  }

  /**
   * Get market state display name
   */
  getMarketStateDisplay(state: string): string {
    const stateMap: Record<string, string> = {
      'CREATED': 'Created',
      'WALLET_CREATED_PENDING_ACTIVATION': 'Pending Activation',
      'ACTIVE_ONCHAIN': 'Active',
      'DEACTIVATED': 'Deactivated'
    };
    return stateMap[state] || state;
  }

  /**
   * Get market state color class
   */
  getMarketStateClass(state: string): string {
    const classMap: Record<string, string> = {
      'CREATED': 'state-created',
      'WALLET_CREATED_PENDING_ACTIVATION': 'state-pending',
      'ACTIVE_ONCHAIN': 'state-active',
      'DEACTIVATED': 'state-inactive'
    };
    return classMap[state] || '';
  }
}
