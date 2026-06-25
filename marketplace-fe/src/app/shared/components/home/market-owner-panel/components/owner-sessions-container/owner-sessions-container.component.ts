import { Component, EventEmitter, inject, Input, OnInit, Output } from '@angular/core';
import { Router } from '@angular/router';
import { Session, SessionStatus } from '../../../../../models/session.model';
import { MatIcon } from "@angular/material/icon";
import { MatCardActions, MatCardContent, MatCardSubtitle, MatCardTitle, MatCardHeader, MatCard } from "@angular/material/card";
import { MatChip } from "@angular/material/chips";
import { DecimalPipe, NgClass, NgFor, NgIf, SlicePipe } from '@angular/common';
import { SessionStatusPipe } from '../../../../../pipes/session-status-pipe';
import { StatusDisplaynamePipe } from '../../../../../pipes/status-displayname-pipe';
import { ToastNotificationComponent } from '../../../../toast-notification/toast-notification.component';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { KeycloakService } from '../../../../../../core/services/keycloak/keycloak.service';
import { SessionService } from '../../../../../../core/services/session/session.service';
import { Subscription } from 'rxjs';
import { PublishSessionDialogComponent, PublishSessionDialogResult } from '../../../../../../features/sessions/publish-session-dialog/publish-session-dialog.component';

@Component({
  selector: 'app-owner-sessions-container',
  imports: [
    MatIcon,
    MatCardActions,
    NgIf,
    NgFor, 
    MatCardContent,
    MatChip,
    MatCardSubtitle,
    MatCardTitle,
    MatCardHeader,
    MatCard,
    MatDialogModule,
    DecimalPipe,
    SlicePipe,
    SessionStatusPipe,
    StatusDisplaynamePipe
  ],
  templateUrl: './owner-sessions-container.component.html',
  styleUrl: './owner-sessions-container.component.css',
})
export class OwnerSessionsContainerComponent implements OnInit {
  router = inject(Router)
  keycloak = inject(KeycloakService);
  private sessionService = inject(SessionService);
  private dialog = inject(MatDialog);

  @Input() sessions: Session[] = [];
  @Input() isLoading: boolean = false;
  @Input() isMarketDeactivated: boolean = false;
  @Output() sessionsUpdated = new EventEmitter<void>();

  currentUserRole: string = '';

  ngOnInit() {
    const roles = this.keycloak.getRoles();
    this.currentUserRole = roles.find(role => ['FRP', 'FSP', 'FMO_LMO'].includes(role)) || '';
  }

  private reloadSessions(): void {
    this.sessionsUpdated.emit();
  }

  getFilteredSessions(): Session[] {
    return this.sessions.filter(session =>
      session.status === SessionStatus.APPROVED ||
      session.status === SessionStatus.PUBLISHED ||
      session.status === SessionStatus.ACTIVE
    );
  }

  trackBySessionId(index: number, session: Session): string {
    return session.id;
  }

  viewSession(session: Session): void {
    this.router.navigate(['/market-sessions', session.id]);
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

  canPublishSession(session: Session): boolean {
    return session.status === SessionStatus.APPROVED && this.currentUserRole === 'FMO_LMO' && !this.isMarketDeactivated;
  }

  canOpenOffersPeriod(session: Session): boolean {
    return session.status === SessionStatus.PUBLISHED && this.currentUserRole === 'FMO_LMO' && !this.isMarketDeactivated;
  }

  canCloseOffersPeriod(session: Session): boolean {
    return session.status === SessionStatus.ACTIVE && this.currentUserRole === 'FMO_LMO' && !this.isMarketDeactivated;
  }

  openOffersPeriod(session: Session): void {
    if (!this.canOpenOffersPeriod(session)) {
      ToastNotificationComponent.show('Only Market Owners (FMO_LMO) can open offers period for PUBLISHED sessions', 'error');
      return;
    }

    const dialogRef = this.dialog.open(PublishSessionDialogComponent, {
      width: '600px',
      maxWidth: '95vw',
      data: {
        sessionName: session.name,
        action: 'open_offers'
      },
      disableClose: true,
      autoFocus: true
    });

    dialogRef.afterClosed().subscribe((result: PublishSessionDialogResult) => {
      if (result?.confirmed && result.pin) {
        this.isLoading = true;
        ToastNotificationComponent.show('Opening offers period on blockchain...', 'info');

        this.sessionService.openOffersPeriod(session.id, result.pin).subscribe({
          next: (response) => {
            this.isLoading = false;

            if (response.success) {
              ToastNotificationComponent.show('Offers period opened successfully on blockchain!', 'success');
              this.reloadSessions();
            }
          },
          error: (error) => {
            this.isLoading = false;
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
        this.isLoading = true;
        ToastNotificationComponent.show('Closing offers period on blockchain...', 'info');

        this.sessionService.closeOffersPeriod(session.id, result.pin).subscribe({
          next: (response) => {
            this.isLoading = false;

            if (response.success) {
              ToastNotificationComponent.show('Offers period closed successfully on blockchain!', 'success');
              this.reloadSessions();
            }
          },
          error: (error) => {
            this.isLoading = false;
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
          this.isLoading = true;
          ToastNotificationComponent.show('Publishing session on blockchain...', 'info');
  
          // Llamar al nuevo endpoint con PIN
          this.sessionService.publishSessionWithPin(session.id, result.pin).subscribe({
            next: (response) => {
              this.isLoading = false;
  
              if (response.success) {
                ToastNotificationComponent.show('Session published successfully on blockchain!', 'success');
                this.reloadSessions();
              }
            },
            error: (error) => {
              this.isLoading = false;
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

}
