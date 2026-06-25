import { Component, inject, OnInit } from '@angular/core';
import { WalletService, WalletBalance, TokenBalance } from '../../../core/services/wallet/wallet.service';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';
import { KeycloakService } from '../../../core/services/keycloak/keycloak.service';

@Component({
  selector: 'app-balance-info',
  imports: [
    CommonModule,
    MatIconModule,
    MatButtonModule,
    MatMenuModule,
    MatTooltipModule,
    MatDividerModule
  ],
  templateUrl: './balance-info.component.html',
  styleUrl: './balance-info.component.css',
})
export class BalanceInfoComponent implements OnInit {

  walletService = inject(WalletService);
  keycloakService = inject(KeycloakService)

  isLoading = false;
  hasError = false;
  shouldShowBalance = true;
  isFRP = false;

  walletBalance : WalletBalance | undefined = undefined;
  tokenBalance : TokenBalance | undefined = undefined;

  ngOnInit() {

    const hasMarketplaceAdminRole = this.keycloakService.hasRole('MARKETPLACE_ADMIN');
    this.shouldShowBalance = !hasMarketplaceAdminRole;

    // Detectar si el usuario es FRP para mostrar información de wallet de mercado
    this.isFRP = this.keycloakService.hasRole('FRP');

    if(this.shouldShowBalance){
      this.loadBalanceInfo();
      this.loadTokenBalanceInfo();
    }
  }

  loadBalanceInfo() {
    this.isLoading = true;
    this.walletService.getWalletBalance().subscribe({
      next: (response) => {
        if (response?.data) {
          this.walletBalance = response.data;
          if (this.walletBalance.balance !== null && this.walletBalance.balance !== undefined) {
            const numBalance = parseFloat(this.walletBalance.balance);
            if (!isNaN(numBalance)) {
              this.walletBalance.balance = numBalance.toFixed(4);
            }
          }
        }
        this.isLoading = false;
      },
      error: (err) => {
        this.hasError = true;
        this.isLoading = false;
      }
    });
  }

  loadTokenBalanceInfo() {
    this.walletService.getTokenBalance().subscribe({
      next: (response) => {
        if (response?.data) {
          this.tokenBalance = response.data;
          if (this.tokenBalance.tokenBalance !== null && this.tokenBalance.tokenBalance !== undefined) {
            const numBalance = parseFloat(this.tokenBalance.tokenBalance);
            if (!isNaN(numBalance)) {
              this.tokenBalance.tokenBalance = numBalance.toFixed(4);
            }
          }
        }
      },
      error: (err) => {
        this.hasError = true;
      }
    });
  }

}
