import { Component, OnInit } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { NgIf, CommonModule } from '@angular/common';
import { MatDialog } from '@angular/material/dialog';
import { KeycloakService } from '../../../core/services/keycloak/keycloak.service';
import { MarketAuthService } from '../../../core/services/auth/market-auth.service';
import { SettlementHttpService } from '../../../core/services/settlement/settlement.http.service';
import { SuperadminPanelComponent } from './superadmin-panel/superadmin-panel.component';
import { ProsumerPanelComponent } from './prosumer-panel/prosumer-panel.component';
import { DSOPanelComponent } from './dsopanel/dsopanel.component';
import { MarketOwnerPanelComponent } from './market-owner-panel/market-owner-panel.component';
import { FrpPendingPaymentsModalComponent } from '../frp-pending-payments-modal/frp-pending-payments-modal.component';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterModule, NgIf, CommonModule, SuperadminPanelComponent, DSOPanelComponent, ProsumerPanelComponent, MarketOwnerPanelComponent],
  providers: [],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css'
})
export class HomeComponent implements OnInit {
  username = '';
  roles: string[] = [];
  userRole: string = '';
  isLoadingMarket = false;

  constructor(
    private keycloak: KeycloakService,
    private marketAuthService: MarketAuthService,
    private router: Router,
    private dialog: MatDialog,
    private settlementService: SettlementHttpService,
  ) { }

  ngOnInit() {
    // AuthGuard already verified authentication
    // We can safely get user data
    this.username = this.keycloak.getUsername() || '';
    this.roles = this.keycloak.getRoles() || [];

    // Determine user role - Priority: MARKETPLACE_ADMIN first, then others
    this.userRole = this.roles.includes('MARKETPLACE_ADMIN')
      ? 'MARKETPLACE_ADMIN'
      : this.roles.includes('FMO_LMO')
        ? 'FMO_LMO'
        : this.roles.includes('FSP') || this.roles.includes('prosumer')
          ? 'FSP'
          : this.roles.includes('DSO')
            ? 'DSO'
            : this.roles.includes('FRP')
              ? 'FRP'
              : '';

    // Market selection is already handled by app.component.ts
    // No need to call it again here

    // Check for pending FRP payments if user has FRP role
    if (this.userRole === 'FRP') {
      this.checkFrpPendingPayments();
    }
  }

  /**
   * Check if FRP user has pending payment requests and show modal
   */
  private async checkFrpPendingPayments(): Promise<void> {
    try {
      const pendingPayments = await this.settlementService.getPendingPaymentsForFrp().toPromise();

      if (pendingPayments && pendingPayments.length > 0) {
        // Show modal with pending payments
        this.dialog.open(FrpPendingPaymentsModalComponent, {
          data: { pendingPayments },
          width: '600px',
          disableClose: false,
        });
      }
    } catch (err) {
      // Don't block the user if check fails
    }
  }

  logout() {
    this.marketAuthService.resetMarketContext();
    this.keycloak.logout();
  }
}
