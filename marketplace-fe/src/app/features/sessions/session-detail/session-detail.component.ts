import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { SessionService } from '../../../core/services/session/session.service';
import { KeycloakService } from '../../../core/services/keycloak/keycloak.service';
import { Session, TimeSlot } from '../../../shared/models/session.model';
import { Subscription } from 'rxjs';
import { PublishSessionDialogComponent, PublishSessionDialogResult } from '../publish-session-dialog/publish-session-dialog.component';
import { ToastNotificationComponent } from '../../../shared/components/toast-notification/toast-notification.component';
import { HourlyOffer } from '../../../shared/models/hourly-offer.model';
import { HourlyOfferService } from '../../prosumer-offers/services/hourly-offer.service';

@Component({
  selector: 'app-session-detail',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatProgressSpinnerModule,
    MatTableModule,
    MatTooltipModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule
  ],
  templateUrl: './session-detail.component.html',
  styleUrl: './session-detail.component.css'
})
export class SessionDetailComponent implements OnInit, OnDestroy {
  session: Session | null = null;
  timeSlots: TimeSlot[] = [];
  loading = false;
  hourlyOffers: HourlyOffer[] = [];
  expandedSlots: Set<number> = new Set();
  displayedColumns: string[] = ['timeSlot', 'power', 'price', 'type', 'total'];
  private subscription = new Subscription();
  currentUserRole: string = '';

  constructor(
    private sessionService: SessionService,
    private route: ActivatedRoute,
    private router: Router,
    private dialog: MatDialog,
    private hourlyOffersService: HourlyOfferService,
    private keycloak: KeycloakService
  ) {}

  ngOnInit(): void {
    const roles = this.keycloak.getRoles();
    this.currentUserRole = roles.find(role => ['FRP', 'FSP', 'FMO_LMO'].includes(role)) || '';

    const sessionId = this.route.snapshot.paramMap.get('id');
    if (sessionId) {
      this.loadSession(sessionId);
    } else {
      this.router.navigate(['/market-sessions']);
    }
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
  }

  /** Fetches the hourly offers for the current session. */
  loadHourlyOffers(): void {
    this.loading = true;

    this.hourlyOffersService.getOffersBySession(this.session!.id).subscribe({
      next: (response) => {
        this.hourlyOffers = response;
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.session = null;
        ToastNotificationComponent.show('Failed to load session details', 'error');
      }
    });
  }

  loadSession(sessionId: string): void {
    this.loading = true;
    
    this.sessionService.getSessionById(sessionId).subscribe({
      next: (response) => {
        this.loading = false;
        if (response.success && response.data) {
          this.session = response.data;
          this.timeSlots = this.sessionService.mapSessionToTimeSlots(this.session);
          this.loadHourlyOffers()
        } else {
          this.session = null;
        }
      },
      error: (error) => {
        this.loading = false;
        this.session = null;
        ToastNotificationComponent.show('Failed to load session details', 'error');
      }
    });
  }

  goBack(): void {
    if (this.session?.status) {
      this.router.navigate(['/market-sessions'], {
        queryParams: { status: this.session.status }
      });
    } else {
      this.router.navigate(['/market-sessions']);
    }
  }

  canEditSession(): boolean {
    return this.session?.status === 'DRAFT' && this.currentUserRole === 'FRP';
  }

  canPublishSession(): boolean {
    return this.session?.status === 'APPROVED' && this.currentUserRole === 'FMO_LMO';
  }

  canOpenOffersPeriod(): boolean {
    return this.session?.status === 'PUBLISHED' && this.currentUserRole === 'FMO_LMO';
  }

  editSession(): void {
    if (this.session && this.canEditSession()) {
      this.router.navigate(['/market-sessions', this.session.id, 'edit']);
    } else {
      ToastNotificationComponent.show('Only FRP users can edit sessions', 'error');
    }
  }

  publishSession(): void {
    if (!this.session || !this.canPublishSession()) {
      ToastNotificationComponent.show('Only Market Owners (FMO_LMO) can publish sessions', 'error');
      return;
    }

    // Open custom dialog
    const dialogRef = this.dialog.open(PublishSessionDialogComponent, {
      width: '600px',
      maxWidth: '95vw',
      data: { sessionName: this.session.name },
      disableClose: true,
      autoFocus: true
    });

    dialogRef.afterClosed().subscribe((result: PublishSessionDialogResult) => {
      if (result?.confirmed && result.pin) {
        this.loading = true;
        ToastNotificationComponent.show('Publishing session on blockchain...', 'info');

        this.sessionService.publishSessionWithPin(this.session!.id, result.pin).subscribe({
          next: (response) => {
            this.loading = false;

            if (response.success) {
              this.session = response.data;
              ToastNotificationComponent.show('Session published successfully on blockchain!', 'success');
            }
          },
          error: (error) => {
            this.loading = false;
            let errorMessage = 'Failed to publish session';

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
              errorMessage = backendMessage;
            }

            ToastNotificationComponent.show(errorMessage, 'error', 7000);
          }
        });
      }
    });
  }

  openOffersPeriod(): void {
    if (!this.session || !this.canOpenOffersPeriod()) {
      ToastNotificationComponent.show('Only Market Owners (FMO_LMO) can open offers period for PUBLISHED sessions', 'error');
      return;
    }

    const dialogRef = this.dialog.open(PublishSessionDialogComponent, {
      width: '600px',
      maxWidth: '95vw',
      data: {
        sessionName: this.session.name,
        action: 'open_offers'
      },
      disableClose: true,
      autoFocus: true
    });

    dialogRef.afterClosed().subscribe((result: PublishSessionDialogResult) => {
      if (result?.confirmed && result.pin) {
        this.loading = true;
        ToastNotificationComponent.show('Opening offers period on blockchain...', 'info');
        this.sessionService.openOffersPeriod(this.session!.id, result.pin).subscribe({
          next: (response) => {
            this.loading = false;

            if (response.success) {
              this.session = response.data;
              ToastNotificationComponent.show('Offers period opened successfully on blockchain!', 'success');
            }
          },
          error: (error) => {
            this.loading = false;
            let errorMessage = 'Failed to open offers period';
            if (error.error?.message) {
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

  trackByHour(index: number, slot: TimeSlot): number {
    return slot.hour;
  }

  formatDate(dateString: string): string {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  formatDateTime(date: Date): string {
    if (!date) return 'N/A';
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

  getBidTypeName(bidType?: string): string {
    return this.sessionService.getBidTypeName(bidType as any);
  }

  getTimeSlotDisplay(hour: number): string {
    const slot = this.timeSlots.find(s => s.hour === hour);
    return slot ? slot.displayTime : `${hour}:00 - ${hour + 1}:00`;
  }

  getOffersForSlot(hour: number): HourlyOffer[] {
      return this.hourlyOffers.filter(offer => offer.hour === hour);
    }

  getTotalForBid(bid: any): number {
    if (!bid || !bid.powerMw || !bid.pricePerMwh) {
      return 0;
    }
    return bid.powerMw * bid.pricePerMwh;
  }

  getTotalOfferedPowerForSlot(hour: number): number {
    return this.getOffersForSlot(hour).reduce((sum, offer) => sum + (offer.powerMw || 0), 0);
  }

  getProgressPercentage(hour: number, bidPower: number): number {
    if (!bidPower || bidPower === 0) {
      return 0;
    }
    const totalOffered = this.getTotalOfferedPowerForSlot(hour);
    return Math.min((totalOffered / bidPower) * 100, 100);
  }

  toggleSlotExpanded(hour: number): void {
    if (this.expandedSlots.has(hour)) {
      this.expandedSlots.delete(hour);
    } else {
      this.expandedSlots.add(hour);
    }
  }

  isSlotExpanded(hour: number): boolean {
    return this.expandedSlots.has(hour);
  }

  trackByOffer(index: number, offer: HourlyOffer): string {
    return offer.id || index.toString();
  }
}