import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, NavigationEnd } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { SessionService } from '../../../core/services/session/session.service';
import { MarketAuthService } from '../../../core/services/auth/market-auth.service';
import { MarketSelectionService } from '../../../core/services/market-selection/market-selection.service';
import { Session } from '../../../shared/models/session.model';
import { Subscription } from 'rxjs';
import { Router, ActivatedRoute } from '@angular/router';
import { KeycloakService } from '../../../core/services/keycloak/keycloak.service';
import { PublishSessionDialogComponent, PublishSessionDialogResult } from '../publish-session-dialog/publish-session-dialog.component';
import { ToastNotificationComponent } from '../../../shared/components/toast-notification/toast-notification.component';
import { ConfirmationDialogComponent, ConfirmationDialogData, ConfirmationDialogResult } from '../../../shared/components/confirmation-dialog/confirmation-dialog.component';
import { filter, distinctUntilChanged } from 'rxjs/operators';
import { MarketFactoryService } from '../../market-factory/services/market-factory.service';
import { Market } from '../../../shared/models/market-place/market-model';
import { combineLatest } from 'rxjs';

@Component({
  selector: 'app-session-list',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatProgressSpinnerModule,
    MatTableModule,
    MatTooltipModule,
    MatDialogModule
  ],
  templateUrl: './session-list.component.html',
  styleUrl: './session-list.component.css'
})
export class SessionListComponent implements OnInit, OnDestroy {
  sessions: Session[] = [];
  loading = false;
  currentMarketId: string | null = null;
  private subscription = new Subscription();
  statusFilter: string | null = null;
  currentUserRole: string = '';
  isMarketDeactivated = false;

  constructor(
    private sessionService: SessionService,
    private marketAuthService: MarketAuthService,
    private marketSelectionService: MarketSelectionService,
    private marketFactoryService: MarketFactoryService,
    private router: Router,
    private dialog: MatDialog,
    private route: ActivatedRoute,
    private keycloak: KeycloakService
  ) { }

  ngOnInit(): void {
    // Obtener rol actual del usuario
    const roles = this.keycloak.getRoles();
    this.currentUserRole = roles.find(role => ['FRP', 'FSP', 'FMO_LMO'].includes(role)) || '';

    this.setupSubscriptions();

    // Only load if there's a selected market
    const marketId = this.marketSelectionService.getSelectedMarket();
    if (marketId) {
      this.loadSessions();
    }

    // Escuchar eventos de navegación para recargar cuando se vuelva a este componente
    this.subscription.add(
      this.router.events.pipe(
        filter(event => event instanceof NavigationEnd)
      ).subscribe((event: any) => {
        if (event.url === '/market-sessions' || event.url.startsWith('/market-sessions?')) {
          this.fetchSessions();
        }
      })
    );
  }

  private setupSubscriptions(): void {
    // Subscribe to query params changes
    this.subscription.add(
      this.route.queryParams.subscribe(params => {
        this.statusFilter = params['status'] || null;
      })
    );

    // Wait for BOTH market selection AND context readiness before loading.
    // combineLatest re-emits whenever either source changes, so it correctly handles
    // the race condition where marketContextReady fires after selectedMarket$.
    this.subscription.add(
      combineLatest([
        this.marketSelectionService.selectedMarket$,
        this.marketAuthService.marketContextReady$
      ]).subscribe(([marketId, contextReady]) => {
        if (!contextReady) {
          this.loading = true;
          return;
        }

        if (marketId) {
          // Check if market actually changed before reloading
          if (marketId !== this.currentMarketId) {
            this.currentMarketId = marketId;
            this.loadSessions();
          }
        } else {
          // No market selected - clear data
        if (!marketId) {
          this.currentMarketId = null;
          this.sessions = [];
          this.loading = false;
          return;
        }

        if (marketId !== this.currentMarketId) {
          this.currentMarketId = marketId;
          this.loadSessions();
        }
      }
    }
    )
    );

    // Subscribe to sessions changes
    this.subscription.add(
      this.sessionService.sessions$.subscribe(sessions => {
        this.sessions = sessions;
      })
    );
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
  }

  loadSessions(): void {
    // Check if we have a selected market first
    const marketId = this.marketSelectionService.getSelectedMarket();

    if (!marketId) {
      // No market selected - clear everything
      this.currentMarketId = null;
      this.sessions = [];
      this.loading = false;
      return;
    }

    this.currentMarketId = marketId;

    this.marketFactoryService.getMarketById(marketId).subscribe({
      next: (market: Market) => {
        this.isMarketDeactivated = market.state === 'DEACTIVATED';
      },
      error: () => this.isMarketDeactivated = false
    });

    this.fetchSessions();
  }

  private fetchSessions(): void {
    if (!this.currentMarketId) {
      this.loading = false;
      return;
    }

    this.loading = true;
    this.sessionService.getSessions().subscribe({
      next: (response) => {
        this.loading = false;
        if (response.success) {
          this.sessions = response.data;
        }
      },
      error: (error) => {
        this.loading = false;
        // Handle market selection required error (428)
        if (error.isMarketSelectionRequired) {
          // The UI will automatically show the market selection required state
          // when currentMarketId is null
          this.currentMarketId = null;
        }
      }
    });
  }

  canCreateSession(): boolean {
    return this.currentUserRole === 'FRP';
  }

  createNewSession(): void {
    // Only FRP users can create sessions
    if (!this.canCreateSession()) {
      ToastNotificationComponent.show('Only FRP users can create sessions', 'error');
      return;
    }
    this.router.navigate(['/market-sessions/create']);
  }

  viewSession(session: Session): void {
    this.router.navigate(['/market-sessions', session.id]);
  }

  viewSessionBids(session: Session): void {
    // Navigate to session bids view where FSP can create offers
    this.router.navigate(['/prosumer-offers/session', session.id]);
  }

  editSession(session: Session): void {
    // Only FRP users can edit sessions
    if (this.currentUserRole !== 'FRP') {
      ToastNotificationComponent.show('Only FRP users can edit sessions', 'error');
      return;
    }
    this.router.navigate(['/market-sessions', session.id, 'edit']);
  }

  approveSession(session: Session): void {
    // Only FRP users can approve sessions
    if (this.currentUserRole !== 'FRP') {
      ToastNotificationComponent.show('Only FRP users can approve sessions', 'error');
      return;
    }

    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      width: '500px',
      maxWidth: '95vw',
      data: {
        title: 'Approve Session',
        message: `Are you sure you want to approve the session "${session.name}"? This will allow the session to be published to the blockchain.`,
        confirmText: 'Approve',
        cancelText: 'Cancel',
        type: 'info'
      } as ConfirmationDialogData
    });

    dialogRef.afterClosed().subscribe((result: ConfirmationDialogResult) => {
      if (result?.confirmed) {
        this.sessionService.approveSession(session.id).subscribe({
          next: (response) => {
            if (response.success) {
              ToastNotificationComponent.show('Session approved successfully!', 'success');
              this.fetchSessions();
            }
          },
          error: (error) => {
            ToastNotificationComponent.show('Failed to approve session', 'error');
          }
        });
      }
    });
  }

  publishSession(session: Session): void {
    // Only FMO_LMO users can publish sessions
    if (this.currentUserRole !== 'FMO_LMO') {
      ToastNotificationComponent.show('Only Market Owners (FMO_LMO) can publish sessions', 'error');
      return;
    }

    // Open custom dialog
    const dialogRef = this.dialog.open(PublishSessionDialogComponent, {
      width: '600px',
      maxWidth: '95vw',
      data: { sessionName: session.name },
      disableClose: true,
      autoFocus: true
    });

    dialogRef.afterClosed().subscribe((result: PublishSessionDialogResult) => {
      if (result?.confirmed && result.pin) {
        // Mostrar indicador de carga
        this.loading = true;
        ToastNotificationComponent.show('Publishing session on blockchain...', 'info');

        // Llamar al nuevo endpoint con PIN
        this.sessionService.publishSessionWithPin(session.id, result.pin).subscribe({
          next: (response) => {
            this.loading = false;

            if (response.success) {
              ToastNotificationComponent.show('Session published successfully on blockchain!', 'success');
              // Refresh the session list
              this.fetchSessions();
            }
          },
          error: (error) => {
            this.loading = false;
            let errorMessage = 'Failed to publish session';

            // Extraer mensaje de error desde diferentes estructuras
            const backendMessage = error.error?.errors?.[0]?.message ||
              error.error?.message ||
              error.message || '';

            // Primero verificar el código de estado HTTP
            if (error.status === 401) {
              errorMessage = 'Authentication failed. Please log in again';
            } else if (error.status === 403) {
              errorMessage = 'You do not have permission to publish this session. Only FMO_LMO users can publish sessions';
            } else if (error.status === 404) {
              errorMessage = 'Session not found. It may have been deleted';
            } else if (error.status === 409) {
              errorMessage = 'Session conflict. The session may have been modified. Please reload and try again';
            } else if (error.status === 400) {
              // Para errores 400, detectar el tipo específico de validación
              if (backendMessage.includes('Must create at least D-1') ||
                backendMessage.includes('Delivery day must be in the future') ||
                backendMessage.toLowerCase().includes('d-1')) {
                errorMessage = 'Cannot publish yet: Sessions must be published at least 24 hours before the scheduled date';
              } else if (backendMessage.includes('Only APPROVED sessions can be published')) {
                errorMessage = 'Cannot publish yet: Session must be in APPROVED status to be published';
              } else if (backendMessage.includes('Cannot publish session without bids')) {
                errorMessage = 'Cannot publish yet: Session must have at least one bid before publishing';
              } else if (backendMessage.includes('Market must be activated on blockchain')) {
                errorMessage = 'Cannot publish yet: Market must be activated on blockchain first';
              } else if (backendMessage.includes('Session must have flexibility requests')) {
                errorMessage = 'Cannot publish yet: Session must have configured flexibility requests';
              } else if (backendMessage.includes('Failed to verify PIN') || backendMessage.includes('Invalid PIN')) {
                errorMessage = 'Incorrect or expired PIN. Please try again';
              } else if (backendMessage.includes('PIN must be 6 digits')) {
                errorMessage = 'PIN must be exactly 6 digits';
              } else if (backendMessage) {
                errorMessage = `Validation error: ${backendMessage}`;
              }
            } else if (error.status === 500 || error.status === 502 || error.status === 503) {
              errorMessage = 'Server error. Please try again later or contact support';
            } else if (backendMessage) {
              // Si no es ningún código conocido pero hay mensaje, usarlo
              errorMessage = backendMessage;
            }

            ToastNotificationComponent.show(errorMessage, 'error', 7000);
          }
        });
      }
    });
  }

  deleteSession(session: Session): void {
    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      width: '500px',
      maxWidth: '95vw',
      data: {
        title: 'Delete Session',
        message: `Are you sure you want to delete the session "${session.name}"? This action cannot be undone.`,
        confirmText: 'Delete',
        cancelText: 'Cancel',
        type: 'danger'
      } as ConfirmationDialogData
    });

    dialogRef.afterClosed().subscribe((result: ConfirmationDialogResult) => {
      if (result?.confirmed) {
        this.sessionService.deleteSession(session.id).subscribe({
          next: (response) => {
            if (response.success) {
              ToastNotificationComponent.show('Session deleted successfully', 'success');
              this.fetchSessions();
            }
          },
          error: (error) => {
            ToastNotificationComponent.show('Failed to delete session', 'error');
          }
        });
      }
    });
  }

  trackBySessionId(index: number, session: Session): string {
    return session.id;
  }

  formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  formatDateTime(date: Date): string {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  getStatusDisplayName(status: string): string {
    return this.sessionService.getStatusDisplayName(status);
  }

  getStatusColor(status: string): string {
    return this.sessionService.getStatusColor(status);
  }

  getFilteredSessions(): Session[] {
    let filteredSessions = this.sessions;

    // FMO_LMO can see APPROVED, PUBLISHED, ACTIVE, OFFERS_CLOSED and CANCELLED sessions
    if (this.currentUserRole === 'FMO_LMO') {
      filteredSessions = this.sessions.filter(session =>
        session.status === 'APPROVED' ||
        session.status === 'PUBLISHED' ||
        session.status === 'ACTIVE' ||
        session.status === 'OFFERS_CLOSED' ||
        session.status === 'IN_DELIVERY' ||
        session.status === 'SETTLEMENT_PENDING' ||
        session.status === 'SETTLED' ||
        session.status === 'COMPLETED' ||
        session.status === 'CANCELLED'
      );
    }

    // Apply status filter if present
    if (this.statusFilter) {
      return filteredSessions.filter(session => session.status === this.statusFilter);
    }

    return filteredSessions;
  }

  canEditSession(session: Session): boolean {
    return session.status === 'DRAFT' && this.currentUserRole === 'FRP' && !this.isMarketDeactivated;
  }

  canPublishSession(session: Session): boolean {
    return session.status === 'APPROVED' && this.currentUserRole === 'FMO_LMO' && !this.isMarketDeactivated;
  }

  canDeleteSession(session: Session): boolean {
    return session.status === 'DRAFT' && this.currentUserRole === 'FRP' && !this.isMarketDeactivated;
  }

  canApproveSession(session: Session): boolean {
    return session.status === 'DRAFT' && this.currentUserRole === 'FRP' && !this.isMarketDeactivated;
  }

  canRevertSession(session: Session): boolean {
    return session.status === 'APPROVED' && this.currentUserRole === 'FRP' && !this.isMarketDeactivated;
  }

  canOpenOffersPeriod(session: Session): boolean {
    return session.status === 'PUBLISHED' && this.currentUserRole === 'FMO_LMO' && !this.isMarketDeactivated;
  }

  canCloseOffersPeriod(session: Session): boolean {
    return session.status === 'ACTIVE' && this.currentUserRole === 'FMO_LMO' && !this.isMarketDeactivated;
  }

  canCreateOffer(session: Session): boolean {
    return session.status === 'ACTIVE' && this.currentUserRole === 'FSP' && !this.isMarketDeactivated;
  }

  canReturnTokens(session: Session): boolean {
    const isFMOLMO = this.currentUserRole === 'FMO_LMO';
    const isCancelled = session.status === 'CANCELLED';
    const isAutoCancelledForLateClosure = (session.cancelReason?.includes('offers period was not closed at least 2 hours')) ?? false;
    const tokensNotReturned = !session.tokensReturned;

    // Debug logging
    if (isCancelled) {
    }

    return isFMOLMO && isCancelled && isAutoCancelledForLateClosure && tokensNotReturned && !this.isMarketDeactivated;
  }

  getStatusBorderColor(status: string): string {
    const colorMap: { [key: string]: string } = {
      'DRAFT': '#FF9800',           // Naranja suave - En progreso
      'APPROVED': '#03A9F4',        // Azul cielo - Aprobado
      'PUBLISHED': '#9C27B0',       // Púrpura - Publicado en blockchain
      'ACTIVE': '#4CAF50',          // Verde brillante - Activo
      'OFFERS_CLOSED': '#607D8B',   // Gris oscuro - Cerrado
      'CANCELLED': '#f44336',        // Rojo - Cancelado
      'IN_DELIVERY': '#ffc107e6',        // Yellow - In Delivery
      'SETTLEMENT_PENDING': '#ff5722e6',        // Naranja fuerte - Settlement Pending
      'SETTLED': '#ffc107e6',
      'COMPLETED': '#ffc107e6',
    };
    return colorMap[status] || '#757575'; // Gris por defecto
  }

  openOffersPeriod(session: Session): void {
    if (!this.canOpenOffersPeriod(session)) {
      ToastNotificationComponent.show('Only Market Owners (FMO_LMO) can open offers period for PUBLISHED sessions', 'error');
      return;
    }

    // Open PIN dialog for blockchain authentication
    const dialogRef = this.dialog.open(PublishSessionDialogComponent, {
      width: '600px',
      maxWidth: '95vw',
      data: {
        sessionName: session.name,
        action: 'open_offers' // Custom action to differentiate from publish
      },
      disableClose: true,
      autoFocus: true
    });

    dialogRef.afterClosed().subscribe((result: PublishSessionDialogResult) => {
      if (result?.confirmed && result.pin) {
        this.loading = true;
        ToastNotificationComponent.show('Opening offers period on blockchain...', 'info');

        this.sessionService.openOffersPeriod(session.id, result.pin).subscribe({
          next: (response) => {
            this.loading = false;

            if (response.success) {
              ToastNotificationComponent.show('Offers period opened successfully on blockchain!', 'success');
              // Refresh the session list
              this.fetchSessions();
            }
          },
          error: (error) => {
            this.loading = false;
            let errorMessage = 'Failed to open offers period';
            if (error.error?.detail) {
              errorMessage = error.error.detail;
            } else if (error.error?.message) {
              errorMessage = error.error.message;
            } else if (error.message) {
              errorMessage = error.message;
            }

            ToastNotificationComponent.show(errorMessage, 'error');
          }
        });
      }
    });
  }

  closeOffersPeriod(session: Session): void {
    if (!this.canCloseOffersPeriod(session)) {
      ToastNotificationComponent.show('Only Market Owners (FMO_LMO) can close offers period for ACTIVE sessions', 'error');
      return;
    }

    // Open PIN dialog for blockchain authentication
    const dialogRef = this.dialog.open(PublishSessionDialogComponent, {
      width: '600px',
      maxWidth: '95vw',
      data: {
        sessionName: session.name,
        action: 'close_offers' // Custom action to differentiate from publish
      },
      disableClose: true,
      autoFocus: true
    });

    dialogRef.afterClosed().subscribe((result: PublishSessionDialogResult) => {
      if (result?.confirmed && result.pin) {
        this.loading = true;
        ToastNotificationComponent.show('Closing offers period on blockchain...', 'info');

        this.sessionService.closeOffersPeriod(session.id, result.pin).subscribe({
          next: (response) => {
            this.loading = false;

            if (response.success) {
              ToastNotificationComponent.show('Offers period closed successfully on blockchain!', 'success');
              // Refresh the session list
              this.fetchSessions();
            }
          },
          error: (error) => {
            this.loading = false;
            let errorMessage = 'Failed to close offers period';
            if (error.error?.detail) {
              errorMessage = error.error.detail;
            } else if (error.error?.message) {
              errorMessage = error.error.message;
            } else if (error.message) {
              errorMessage = error.message;
            }

            ToastNotificationComponent.show(errorMessage, 'error');
          }
        });
      }
    });
  }

  revertSessionToDraft(session: Session): void {
    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      width: '500px',
      maxWidth: '95vw',
      data: {
        title: 'Revert to Draft',
        message: `Are you sure you want to revert "${session.name}" to DRAFT status? This will allow modifications but will require re-approval before publishing.`,
        confirmText: 'Revert',
        cancelText: 'Cancel',
        type: 'warning'
      } as ConfirmationDialogData
    });

    dialogRef.afterClosed().subscribe((result: ConfirmationDialogResult) => {
      if (result?.confirmed) {
        this.loading = true;
        this.sessionService.revertSessionToDraft(session.id).subscribe({
          next: (response) => {
            this.loading = false;
            if (response.success) {
              ToastNotificationComponent.show(
                'Session reverted to DRAFT successfully!',
                'success'
              );
              this.fetchSessions();
            }
          },
          error: (error) => {
            this.loading = false;
            let message = 'Failed to revert session';
            if (error.status === 404) {
              message = 'Session not found. It may have been deleted.';
            } else if (error.status === 403) {
              message = 'You do not have permission to revert this session.';
            } else if (error.status === 409) {
              message = 'The session has been modified. Please reload and try again.';
            } else if (error.error?.message) {
              message = error.error.message;
            }

            ToastNotificationComponent.show(message, 'error');
            this.fetchSessions();
          }
        });
      }
    });
  }

  returnTokens(session: Session): void {
    if (!this.canReturnTokens(session)) {
      ToastNotificationComponent.show('Only FSP can return tokens for CANCELLED sessions', 'error');
      return;
    }

    // Open PIN dialog for blockchain authentication
    const dialogRef = this.dialog.open(PublishSessionDialogComponent, {
      width: '600px',
      maxWidth: '95vw',
      data: {
        sessionName: session.name,
        action: 'return_tokens' // Custom action to differentiate from publish/open/close
      },
      disableClose: true,
      autoFocus: true
    });

    dialogRef.afterClosed().subscribe((result: PublishSessionDialogResult) => {
      if (result?.confirmed && result.pin) {
        this.loading = true;
        ToastNotificationComponent.show('Returning tokens on blockchain...', 'info');

        this.sessionService.returnTokens(session.id, result.pin).subscribe({
          next: (response: any) => {
            this.loading = false;

            if (response.success || response) {
              ToastNotificationComponent.show('Tokens returned successfully!', 'success');
              // Refresh the session list
              this.fetchSessions();
            }
          },
          error: (error: any) => {
            this.loading = false;
            let errorMessage = 'Failed to return tokens';
            if (error.error?.detail) {
              errorMessage = error.error.detail;
            } else if (error.error?.message) {
              errorMessage = error.error.message;
            } else if (error.message) {
              errorMessage = error.message;
            }

            ToastNotificationComponent.show(errorMessage, 'error');
          }
        });
      }
    });
  }

  getPageTitle(): string {
    if (!this.statusFilter) return 'Market Sessions';
    return `Market Sessions - ${this.sessionService.getStatusDisplayName(this.statusFilter)}`;
  }
}
