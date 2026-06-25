import { Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { HourlyOfferService } from '../services/hourly-offer.service';
import { SessionWithBids, BidWithOffers, HourlyOffer } from '../../../shared/models/hourly-offer.model';
import { CreateOfferModalComponent } from '../create-offer-modal/create-offer-modal.component';
import { PinModalComponent } from '../pin-modal/pin-modal.component';
import { ToastNotificationComponent } from '../../../shared/components/toast-notification/toast-notification.component';
import { MatDialog } from '@angular/material/dialog';
import { ConfirmationDialogComponent, ConfirmationDialogResult } from '../../../shared/components/confirmation-dialog/confirmation-dialog.component';

@Component({
  selector: 'app-session-bids-view',
  standalone: true,
  imports: [CommonModule, MatIconModule, CreateOfferModalComponent, PinModalComponent],
  templateUrl: './session-bids-view.component.html',
  styleUrls: ['./session-bids-view.component.css']
})
export class SessionBidsViewComponent implements OnInit {
  @ViewChild(PinModalComponent) pinModal?: PinModalComponent;

  sessionWithBids: SessionWithBids | null = null;
  loading = false;
  error: string | null = null;

  // Modal state
  showCreateOfferModal = false;
  selectedBid: BidWithOffers | null = null;
  showPinModal = false;
  selectedOfferForPublish: HourlyOffer | null = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private hourlyOfferService: HourlyOfferService,
    private dialog: MatDialog
  ) { }

  ngOnInit(): void {
    const sessionId = this.route.snapshot.paramMap.get('id');
    if (sessionId) {
      this.loadSessionWithBids(sessionId);
    } else {
      this.error = 'No session ID provided';
    }
  }

  loadSessionWithBids(sessionId: string): void {
    this.loading = true;
    this.error = null;
    this.hourlyOfferService.getSessionWithBidsAndOffers(sessionId).subscribe({
      next: (response) => {
        if (response && response.data) {
          this.sessionWithBids = response.data;
        } else {
          this.error = 'No session data received';
        }
        this.loading = false;
      },
      error: (error) => {
        // Show more specific error message
        if (error.status === 404) {
          this.error = 'Session not found';
        } else if (error.status === 403) {
          this.error = 'You do not have permission to view this session';
        } else if (error.status === 500) {
          this.error = 'Server error loading session';
        } else {
          this.error = error.error?.message || error.message || 'Error loading session details';
        }

        this.loading = false;
      }
    });
  }

  openCreateOfferModal(bid: BidWithOffers): void {
    if (bid.isFull) {
      return; // No permitir crear offers para bids llenas
    }
    this.selectedBid = bid;
    this.showCreateOfferModal = true;
  }

  closeCreateOfferModal(): void {
    this.showCreateOfferModal = false;
    this.selectedBid = null;
  }

  onOfferCreated(): void {
    this.showCreateOfferModal = false;
    this.selectedBid = null;
    // Recargar la sesión para ver la nueva offer
    if (this.sessionWithBids) {
      this.loadSessionWithBids(this.sessionWithBids.id);
    }
  }

  cancelOffer(offer: HourlyOffer): void {
    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      width: '420px',
      data: {
        title: 'Cancel Offer',
        message: `Are you sure you want to cancel the offer for the hour from ${offer.hour}:00 to ${offer.hour + 1}:00`,
        confirmText: 'Cancel Offer',
        cancelText: 'No',
        confirmColor: 'warn'
      }
    })

    dialogRef.afterClosed().subscribe((result: ConfirmationDialogResult) => {
      if (!result!.confirmed) return;

      this.loading = true;
      this.hourlyOfferService.cancelOffer(offer.id).subscribe({
        next: () => {
          ToastNotificationComponent.show('Offer cancelled successfully', 'success');
          // Reload the session
          if (this.sessionWithBids) {
            this.loadSessionWithBids(this.sessionWithBids.id);
          }
        },
        error: (error) => {
          const errorMessage = error.error?.message || 'Error cancelling the offer';
          ToastNotificationComponent.show(errorMessage, 'error');
        }
      });

    })
  }

  goBack(): void {
    this.router.navigate(['/prosumer-offers']);
  }

  getBidTypeLabel(bidType: string): string {
    return bidType === 'UPWARD' ? 'Upward' : 'Downward';
  }

  getBidTypeClass(bidType: string): string {
    return bidType === 'UPWARD' ? 'bid-demand' : 'bid-supply';
  }

  getStatusClass(status: string): string {
    const statusMap: { [key: string]: string } = {
      'PENDING': 'status-pending',
      'ACCEPTED': 'status-accepted',
      'REJECTED': 'status-rejected',
      'CANCELLED': 'status-cancelled'
    };
    return statusMap[status] || 'status-pending';
  }

  getStatusLabel(status: string): string {
    const labelMap: { [key: string]: string } = {
      'PENDING': 'Pending',
      'ACCEPTED': 'Accepted',
      'REJECTED': 'Rejected',
      'CANCELLED': 'Cancelled'
    };
    return labelMap[status] || status;
  }

  getAvailabilityPercentage(bid: BidWithOffers): number {
    return (bid.availablePowerMw / bid.powerMw) * 100;
  }

  getHourDisplay(hour: number): string {
    const start = hour.toString().padStart(2, '0');
    const end = ((hour + 1) % 24).toString().padStart(2, '0');
    return `${start}:00 - ${end}:00`;
  }

  isMyOffer(offer: HourlyOffer): boolean {
    // Aquí deberías verificar si el offer pertenece al usuario actual
    // Por ahora retornamos true para permitir cancelar
    return true; // TODO: Implementar verificación de usuario
  }

  // Financial calculations for selected offer
  getOfferValue(): number {
    if (!this.selectedOfferForPublish) return 0;
    return this.selectedOfferForPublish.powerMw * this.selectedOfferForPublish.pricePerMwh;
  }

  getCollateral(): number {
    return this.getOfferValue() * 0.05; // 5%
  }

  getPlatformFee(): number {
    return this.getOfferValue() * 0.02; // 2%
  }

  getFlexTokens(): number {
    return this.getOfferValue(); // 1:1 ratio
  }

  openPublishOfferModal(offer: HourlyOffer): void {
    this.selectedOfferForPublish = offer;
    this.showPinModal = true;
  }

  closePinModal(): void {
    this.showPinModal = false;
    this.selectedOfferForPublish = null;
  }

  onPinSubmitted(pin: string): void {
    if (!this.selectedOfferForPublish) {
      return;
    }

    if (this.pinModal) {
      this.pinModal.setSubmitting(true);
    }

    this.hourlyOfferService.publishOffer(this.selectedOfferForPublish.id, pin).subscribe({
      next: () => {
        if (this.pinModal) {
          this.pinModal.setSubmitting(false);
          this.pinModal.clearPin();
        }
        this.closePinModal();
        ToastNotificationComponent.show('Offer successfully published to blockchain!', 'success', 5000);
        // Reload the session
        if (this.sessionWithBids) {
          this.loadSessionWithBids(this.sessionWithBids.id);
        }
      },
      error: (error) => {
        if (this.pinModal) {
          this.pinModal.setSubmitting(false);
        }

        let errorMessage = 'Error publishing offer to blockchain';

        // Try multiple paths to extract the error message
        if (error.error?.detail) {
          // RFC7807 format
          errorMessage = error.error.detail;
        } else if (error.error?.message) {
          // Standard message
          errorMessage = error.error.message;
        } else if (error.error?.errors?.[0]) {
          // Errors array
          errorMessage = error.error.errors[0].message;
        } else if (error.message) {
          // Direct message
          errorMessage = error.message;
        }
        ToastNotificationComponent.show(errorMessage, 'error', 5000);

        if (this.pinModal) {
          this.pinModal.setError(errorMessage);
        }
      }
    });
  }
}
