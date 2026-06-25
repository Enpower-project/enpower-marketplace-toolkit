import { Component, inject, OnInit } from '@angular/core';
import { Pagination, Transaction, WalletService } from '../../../core/services/wallet/wallet.service';
import { CommonModule } from '@angular/common';
import { MatProgressSpinner } from "@angular/material/progress-spinner";
import { MatTableModule } from "@angular/material/table";
import { CapitalizePipe } from '../../pipes/capitalize-pipe';
import { Clipboard } from '@angular/cdk/clipboard';
import { MatIcon } from "@angular/material/icon";
import { ToastNotificationComponent } from '../toast-notification/toast-notification.component';
import { KeycloakService } from '../../../core/services/keycloak/keycloak.service';
import { MatSelectModule } from "@angular/material/select";
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatButtonModule } from '@angular/material/button';
import { UserService } from '../../../core/services/user.service';

@Component({
  selector: 'app-transaction-history',
  imports: [
    CommonModule,
    MatProgressSpinner,
    MatTableModule,
    CapitalizePipe,
    MatIcon,
    MatFormFieldModule,
    MatSelectModule,
    MatInputModule,
    FormsModule,
    MatTooltipModule,
    MatButtonModule
  ],
  standalone: true,
  templateUrl: './transaction-history.component.html',
  styleUrl: './transaction-history.component.css',
})
export class TransactionHistoryComponent implements OnInit {

  walletUserMap: Map<string, string> = new Map();

  transactions: Transaction[] = [];
  filteredTransactions: Transaction[] = [];
  walletAddress: string = '';
  pagination: Pagination | null = null;

  isAdmin: boolean = false;
  isFMO: boolean = false;

  searchTerm: string = '';
  selectedStatus: string = '';
  allStatuses: string[] = ['success', 'reverted'];

  displayedColumns: string[] = ['hash', 'transactionLog', 'timestamp', 'from', 'to', 'gasUsed', 'gasPrice', 'status'];

  isLoading: boolean = false;
  error: string | null = null;

  currentPage: number = 1;
  itemsPerPage: number = 10;

  fromUser: string = ""
  toUser: string = ""

  // Statistics
  totalTransactions: number = 0;
  successfulTransactions: number = 0;
  failedTransactions: number = 0;
  totalGasUsed: bigint = BigInt(0);

  constructor(
    private readonly walletService: WalletService,
    private readonly clipboard: Clipboard,
    private readonly keyCloakService: KeycloakService,
    private readonly userService: UserService
  ) { }

  ngOnInit(): void {

    if (this.keyCloakService.hasRole('MARKETPLACE_ADMIN')) {
      this.isAdmin = true;
    } else if (this.keyCloakService.hasRole('FMO_LMO')) {
      this.isFMO = true;
    }

    this.loadTransactions();
  }

  loadTransactions() {
    this.isLoading = true;
    this.error = null;

    const loadObservable = this.isFMO
      ? this.walletService.getWalletTransactionHistoryForMarket(this.currentPage, this.itemsPerPage, this.selectedStatus, this.searchTerm)
      : this.isAdmin
        ? this.walletService.getWalletTransactionHistoryForAdmin(this.currentPage, this.itemsPerPage, this.selectedStatus, this.searchTerm)
        : this.walletService.getWalletTransactionHistory(this.currentPage, this.itemsPerPage, this.selectedStatus, this.searchTerm);

    loadObservable.subscribe({
      next: (response) => {
        if (response.success && response.data) {
          this.transactions = response.data.transactions || [];
          this.filteredTransactions = this.transactions;
          this.walletAddress = response.data.address;
          this.pagination = response.data.pagination;
          this.calculateStatistics();
          this.loadWalletUsernames();
          this.isLoading = false;
        }
      },
      error: (err) => {
        this.error = err.error?.message || 'Failed to load Transactions';
        this.isLoading = false;
        this.transactions = [];
        this.filteredTransactions = [];
      }
    });
  }

  loadWalletUsernames(): void {
    const fromAddresses = [...new Set(this.transactions.map(t => t.from).filter(Boolean))];
    const toAddresses = [...new Set(this.transactions.map(t => t.to).filter(Boolean))];

    fromAddresses.forEach(address => {
      this.userService.getUserByWalletAddress(address).subscribe({
        next: (response) => {
          if (response.success) {
            this.walletUserMap.set(address, response.data.username);
          }
        },
        error: () => {
          this.walletUserMap.set(address, this.truncateAddress(address));
        }
      });
    });

    toAddresses.forEach(address => {
      this.userService.getSessionPlateByAddress(address).subscribe({
        next: (response) => {
          if (response.success) {
            this.walletUserMap.set(address, response.data.username);
          }
        },
        error: () => {
          this.walletUserMap.set(address, this.truncateAddress(address));
        }
      });
    });
  }

  getUsernameByAddress(address: string): string {
    return this.walletUserMap.get(address) || this.truncateAddress(address);
  }

  filterTransactions(): void {
    this.currentPage = 1;
    this.loadTransactions();
  }


  removeStatusFilter(): void {
    this.selectedStatus = '';
    this.filterTransactions();
  }

  /**
   * Handle status selection change
   */
  onStatusChange(): void {
    this.filterTransactions();
  }

  goTopage(page: number) {
    if (page < 1 || (this.pagination && page > this.pagination.totalPages)) {
      return;
    }

    this.currentPage = page;
    this.loadTransactions();
  }

  nextPage() {
    if (this.pagination?.hasNextPage) {
      this.currentPage++;
      this.loadTransactions();
    }
  }

  previousPage() {
    if (this.pagination?.hasPreviousPage) {
      this.currentPage--;
      this.loadTransactions();
    }
  }

  changeItemsPerPage(limit: number) {
    this.itemsPerPage = limit;
    this.currentPage = 1;
    this.loadTransactions();
  }

  getPageNumbers() {
    if (!this.pagination) return [];

    const totalPages = this.pagination.totalPages;
    const current = this.currentPage;
    const pages: number[] = [];

    let start = Math.max(1, current - 2);
    let end = Math.min(totalPages, start + 4)

    if (end - start < 4) {
      start = Math.max(1, end - 4)
    }

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }

    return pages;
  }

  truncateHash(hash: string): string {
    if (!hash) return '';
    return `${hash.slice(0, 10)}...${hash.slice(-8)}`;
  }

  truncateAddress(address: string): string {
    if (!address) return '';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }

  formatTimestamp(timestamp: number): string {
    return new Date(timestamp * 1000).toLocaleString();
  }

  clearSearch(): void {
    this.searchTerm = '';
    this.filterTransactions();
  }

  copy(value: string): void {
    this.clipboard.copy(value);
    ToastNotificationComponent.show('Copied to clipboard', 'success', 1000);
  }

  calculateStatistics(): void {
    if (!this.pagination) return;

    this.totalTransactions = this.pagination.totalTransactions;
    this.successfulTransactions = this.transactions.filter(t => t.status === "success").length;
    this.failedTransactions = this.transactions.filter(t => t.status === "reverted").length;

    // Calculate total gas used from current page
    this.totalGasUsed = this.transactions.reduce((total, t) => {
      try {
        return total + BigInt(t.gasUsed || 0);
      } catch {
        return total;
      }
    }, BigInt(0));
  }

  getTransactionTypeIcon(log: string): string {
    if (!log) return 'swap_horiz';
    const logLower = log.toLowerCase();

    if (logLower.includes('deposit') || logLower.includes('receive')) return 'download';
    if (logLower.includes('withdraw') || logLower.includes('send')) return 'upload';
    if (logLower.includes('approve') || logLower.includes('approval')) return 'verified';
    if (logLower.includes('settlement')) return 'handshake';
    if (logLower.includes('offer')) return 'local_offer';
    if (logLower.includes('session') || logLower.includes('market')) return 'store';
    if (logLower.includes('transfer')) return 'swap_horiz';
    if (logLower.includes('collateral')) return 'account_balance';

    return 'receipt_long';
  }

  getTransactionTypeClass(log: string): string {
    if (!log) return 'type-default';
    const logLower = log.toLowerCase();

    if (logLower.includes('deposit') || logLower.includes('receive')) return 'type-deposit';
    if (logLower.includes('withdraw') || logLower.includes('send')) return 'type-withdraw';
    if (logLower.includes('approve') || logLower.includes('approval')) return 'type-approve';
    if (logLower.includes('settlement')) return 'type-settlement';
    if (logLower.includes('offer')) return 'type-offer';
    if (logLower.includes('collateral')) return 'type-collateral';

    return 'type-default';
  }

  formatGasUsed(gasUsed: string | number): string {
    try {
      const gas = BigInt(gasUsed);
      if (gas > BigInt(1000000)) {
        return (Number(gas) / 1000000).toFixed(2) + 'M Wei';
      } else if (gas > BigInt(1000)) {
        return (Number(gas) / 1000).toFixed(1) + 'K';
      }
      return gas.toString();
    } catch {
      return String(gasUsed);
    }
  }

  exportTransactions(): void {
    if (this.transactions.length === 0) {
      ToastNotificationComponent.show('No transactions to export', 'info');
      return;
    }

    const headers = ['Hash', 'Log', 'Timestamp', 'From', 'To', 'Gas Used', 'Gas Price', 'Status'];
    const rows = this.transactions.map(t => [
      t.hash,
      t.transactionLog || '',
      this.formatTimestamp(t.timestamp),
      t.from,
      t.to,
      t.gasUsed,
      t.gasPrice,
      t.status
    ]);

    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `transactions_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    ToastNotificationComponent.show('Transactions exported successfully', 'success');
  }

  refreshTransactions(): void {
    this.loadTransactions();
  }

  goToFirstPage() {
    this.currentPage = 1;
    this.filterTransactions();
  }

  goToLastPage() {
    this.currentPage = this.pagination?.totalPages!
    this.loadTransactions();
  }
}
