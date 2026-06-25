import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { MatBadgeModule } from '@angular/material/badge';
import { Subscription, interval } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { WalletService } from '../../../core/services/wallet/wallet.service';
import { KeycloakService } from '../../../core/services/keycloak/keycloak.service';

@Component({
  selector: 'app-wallet-info-header',
  standalone: true,
  imports: [
    CommonModule,
    MatToolbarModule,
    MatIconModule,
    MatButtonModule,
    MatTooltipModule,
    MatMenuModule,
    MatBadgeModule
  ],
  templateUrl: './wallet-info-header.component.html',
  styleUrls: ['./wallet-info-header.component.css']
})
export class WalletInfoHeaderComponent implements OnInit, OnDestroy {
  walletAddress: string = '';
  balance: string = '0';
  network: string = 'localhost';
  isConnected: boolean = false;
  loading: boolean = false;
  showCopiedMessage: boolean = false;

  private subscriptions = new Subscription();

  constructor(
    private walletService: WalletService,
    private keycloakService: KeycloakService
  ) {}

  ngOnInit(): void {
    this.loadWalletInfo();
    this.startBalanceRefresh();
    this.detectNetwork();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  /** Fetches the wallet data from the API and stores the address. */
  loadWalletInfo(): void {
    this.loading = true;

    this.walletService.getWallet().subscribe({
      next: (wallet: any) => {
        if (wallet?.address) {
          this.walletAddress = wallet.address;
          this.isConnected = wallet.isActive || true;
          this.loadBalance();
        }
        this.loading = false;
      },
      error: () => {
        this.isConnected = false;
        this.loading = false;
      }
    });
  }

  /** Fetches the FLEX token balance for the current wallet address. */
  loadBalance(): void {
    if (!this.walletAddress) return;

    this.walletService.getFlexBalance(this.walletAddress).subscribe({
      next: (balance: string) => {
        this.balance = this.formatBalance(balance);
      },
      error: () => {}
    });
  }

  /** Converts a wei string to a human-readable FLEX amount (18 decimals). */
  private formatBalance(weiBalance: string): string {
    try {
      const ethers = (window as any).ethers;
      if (ethers) {
        const formatted = ethers.formatEther(weiBalance);
        const num = parseFloat(formatted);
        return num.toLocaleString('en-US', {
          minimumFractionDigits: 0,
          maximumFractionDigits: 2
        });
      }
      return '0';
    } catch {
      return '0';
    }
  }

  private startBalanceRefresh(): void {
    const refresh$ = interval(30000).pipe(
      switchMap(() => {
        if (this.walletAddress) {
          return this.walletService.getFlexBalance(this.walletAddress);
        }
        return [];
      })
    );

    this.subscriptions.add(
      refresh$.subscribe({
        next: (balance: any) => {
          if (balance) {
            this.balance = this.formatBalance(balance);
          }
        }
      })
    );
  }

  private detectNetwork(): void {
    const env = (window as any).environment;
    if (env && env.rpcProviderUrl) {
      if (env.rpcProviderUrl.includes('localhost') || env.rpcProviderUrl.includes('127.0.0.1')) {
        this.network = 'Localhost';
      } else if (env.rpcProviderUrl.includes('sepolia')) {
        this.network = 'Sepolia Testnet';
      } else if (env.rpcProviderUrl.includes('mainnet')) {
        this.network = 'Ethereum Mainnet';
      } else {
        this.network = 'Custom Network';
      }
    }
  }

  copyAddress(): void {
    if (!this.walletAddress) return;

    navigator.clipboard.writeText(this.walletAddress).then(() => {
      this.showCopiedMessage = true;
      setTimeout(() => {
        this.showCopiedMessage = false;
      }, 2000);
    }).catch(() => {});
  }

  getTruncatedAddress(): string {
    if (!this.walletAddress) return '';
    return `${this.walletAddress.slice(0, 6)}...${this.walletAddress.slice(-4)}`;
  }

  getConnectionColor(): string {
    return this.isConnected ? 'accent' : 'warn';
  }

  getConnectionIcon(): string {
    return this.isConnected ? 'check_circle' : 'error';
  }

  refresh(): void {
    this.loadWalletInfo();
  }
}
