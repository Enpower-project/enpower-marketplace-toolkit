import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatTableModule } from '@angular/material/table';
import { SessionService } from '../../../core/services/session/session.service';
import { Session, SessionStatus } from '../../../shared/models/session.model';
import { KeycloakService } from '../../../core/services/keycloak/keycloak.service';

/**
 * Settlement Manager Component
 *
 * Allows all users (FMO_LMO, FRP, FSP) to:
 * - View sessions with status OFFERS_CLOSED or SETTLEMENT_PENDING (ready for settlement)
 * - Select a session to view settlements
 * - Navigate to the settlements page for the selected session
 */
@Component({
  selector: 'app-settlement-manager',
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    MatButtonModule,
    MatCardModule,
    MatProgressSpinnerModule,
    MatChipsModule,
    MatTooltipModule,
    MatTableModule,
  ],
  templateUrl: './settlement-manager.component.html',
  styleUrls: ['./settlement-manager.component.css']
})
export class SettlementManagerComponent implements OnInit {
  sessions: Session[] = [];
  loading = false;
  error: string | null = null;
  isFMO: boolean = false;
  isFSP: boolean = false;
  isFRP: boolean = false;

  displayedColumns = ['name', 'sessionDate', 'totalOffers', 'status', 'actions'];

  constructor(
    private sessionService: SessionService,
    private keycloakService: KeycloakService,
    private router: Router,

  ) { }

  ngOnInit(): void {
    this.isFMO = this.keycloakService.hasRole('FMO_LMO');
    this.isFSP = this.keycloakService.hasRole('FSP');
    this.isFRP = this.keycloakService.hasRole('FRP');
    this.loadSessions();
  }

  loadSessions(): void {
    this.loading = true;
    this.error = null;

    if (this.isFSP) {
      this.sessionService.getMySessions().subscribe({
        next: (response) => {
          if (response.success) {
            this.sessions = response.data.filter(
              session => session.status === SessionStatus.SETTLEMENT_PENDING ||
                         session.status === SessionStatus.SETTLED ||
                         session.status === SessionStatus.COMPLETED
            );
          }
          this.loading = false;
        },
        error: (err) => {
          this.error = err.message || 'Error loading sessions';
          this.loading = false;
        }
      });
    } else if (this.isFRP) {
      this.sessionService.getSessions().subscribe({
        next: (response) => {
          if (response.success) {
            this.sessions = response.data.filter(
              session => session.status === SessionStatus.SETTLEMENT_PENDING ||
                         session.status === SessionStatus.SETTLED ||
                         session.status === SessionStatus.COMPLETED
            );
          }
          this.loading = false;
        },
        error: (err) => {
          this.error = err.message || 'Error loading sessions';
          this.loading = false;
        }
      });
    } else {
      // FMO: sessions pending settlement
      this.sessionService.getSessions().subscribe({
        next: (response) => {
          if (response.success) {
            this.sessions = response.data.filter(
              session => session.status === SessionStatus.SETTLEMENT_PENDING ||
                         session.status === SessionStatus.SETTLED ||
                         session.status === SessionStatus.COMPLETED
            );
          }
          this.loading = false;
        },
        error: (err) => {
          this.error = err.message || 'Error loading sessions';
          this.loading = false;
        }
      });
    }
  }

  canViewSettlementDetails(session: Session): boolean {
    return (session.status === SessionStatus.SETTLEMENT_PENDING ||
            session.status === SessionStatus.SETTLED ||
            session.status === SessionStatus.COMPLETED) &&
           !!session.contractAddress;
  }

  /**
   * Navigate to the settlements page for the selected session
   */
  openSettlementsPage(session: Session): void {
    if (session.contractAddress) {
      this.router.navigate(['/settlements/session', session.contractAddress]);
    } else {
      this.error = 'Session does not have a blockchain contract address';
    }
  }

  /**
   * Get status display label
   */
  getStatusLabel(status: SessionStatus): string {
    switch (status) {
      case SessionStatus.OFFERS_CLOSED:
        return 'Offers Closed';
      case SessionStatus.SETTLEMENT_PENDING:
        return 'Settlement Pending';
      case SessionStatus.SETTLED:
        return 'Settled';
      default:
        return status;
    }
  }

  /**
   * Get status CSS class
   */
  getStatusClass(status: SessionStatus): string {
    switch (status) {
      case SessionStatus.OFFERS_CLOSED:
        return 'status-offers-closed';
      case SessionStatus.SETTLEMENT_PENDING:
        return 'status-settlement-pending';
      case SessionStatus.SETTLED:
        return 'status-settled';
      default:
        return '';
    }
  }

  /**
   * Format date for display
   */
  formatDate(dateString: string): string {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-UK', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  }

  /**
   * Get total offers count from bids
   */
  getTotalOffers(session: Session): number {
    return session.bids?.length || 0;
  }

  /**
   * Check if session can start settlement process
   */
  canStartSettlement(session: Session): boolean {
    return session.status === SessionStatus.OFFERS_CLOSED &&
      !!session.contractAddress;
  }

  /**
   * Truncate address for display
   */
  truncateAddress(address: string): string {
    if (!address) return '-';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }
}
