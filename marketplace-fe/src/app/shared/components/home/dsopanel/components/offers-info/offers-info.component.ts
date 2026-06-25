import { Component, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MatCard, MatCardHeader, MatCardTitle, MatCardSubtitle, MatCardContent } from "@angular/material/card";
import { MatIcon } from "@angular/material/icon";
import { DecimalPipe, NgFor, NgIf } from '@angular/common';
import { Session, TimeSlot } from '../../../../../models/session.model';
import { Subscription } from 'rxjs';
import { SessionService } from '../../../../../../core/services/session/session.service';
import { KeycloakService } from '../../../../../../core/services/keycloak/keycloak.service';
import { ToastNotificationComponent } from '../../../../toast-notification/toast-notification.component';
import { HourlyOffer } from '../../../../../models/hourly-offer.model';
import { HourlyOfferService } from '../../../../../../features/prosumer-offers/services/hourly-offer.service';

@Component({
  selector: 'app-offers-info.component',
  imports: [
    MatCard,
    MatCardHeader,
    MatIcon,
    MatCardTitle,
    MatCardSubtitle,
    MatCardContent,
    NgIf,
    NgFor,
    DecimalPipe
  ],
  templateUrl: './offers-info.component.html',
  styleUrl: './offers-info.component.css',
})
export class OffersInfoComponent {
  session: Session | null = null;
  hourlyOffers: HourlyOffer[] = [];
  timeSlots: TimeSlot[] = [];
  expandedSlots: Set<number> = new Set();
  loading = false;
  displayedColumns: string[] = ['timeSlot', 'power', 'price', 'type', 'total'];
  private subscription = new Subscription();
  currentUserRole: string = '';

  activatedRoute = inject(ActivatedRoute);
  sessionService = inject(SessionService);
  hourlyOffersService = inject(HourlyOfferService);
  keycloakService = inject(KeycloakService);
  router = inject(Router);

  ngOnInit(): void {
    const roles = this.keycloakService.getRoles();
    this.currentUserRole = roles.find(role => ['FRP', 'FSP', 'FMO_LMO'].includes(role)) || '';

    const sessionId = this.activatedRoute.snapshot.paramMap.get('id');
    if (sessionId) {
      this.loadSession(sessionId);
    } else {
      this.router.navigate(['/market-sessions']);
    }
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
  }

  /** Loads a session by ID and maps its time slots for display. */
  loadSession(sessionId: string): void {
    this.loading = true;

    this.sessionService.getSessionById(sessionId).subscribe({
      next: (response) => {
        this.loading = false;
        if (response.success && response.data) {
          this.session = response.data;
          this.timeSlots = this.sessionService.mapSessionToTimeSlots(this.session);
          this.loadHourlyOffers();
        } else {
          this.session = null;
        }
      },
      error: () => {
        this.loading = false;
        this.session = null;
        ToastNotificationComponent.show('Failed to load session details', 'error');
      }
    });
  }

  /** Loads the hourly offers submitted for the current session. */
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

  goBack(): void {
    if (this.session?.status) {
      this.router.navigate(['/market-sessions'], {
        queryParams: { status: this.session.status }
      });
    } else {
      this.router.navigate(['/market-sessions']);
    }
  }

  trackByHour(index: number, slot: TimeSlot): number {
    return slot.hour;
  }

  trackByOffer(index: number, offer: HourlyOffer): string {
    return offer.id || index.toString();
  }

  getBidTypeName(bidType?: string): string {
    return this.sessionService.getBidTypeName(bidType as any);
  }

  getTotalForBid(bid: any): number {
    if (!bid || !bid.powerMw || !bid.pricePerMwh) {
      return 0;
    }
    return bid.powerMw * bid.pricePerMwh;
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

  getOffersForSlot(hour: number): HourlyOffer[] {
    return this.hourlyOffers.filter(offer => offer.hour === hour);
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
}
