import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HourlyOfferService } from '../services/hourly-offer.service';
import { BidWithOffers, CreateHourlyOfferRequest } from '../../../shared/models/hourly-offer.model';
import { ToastNotificationComponent } from '../../../shared/components/toast-notification/toast-notification.component';
import { FlexibilityService } from '../../../core/services/flexibility/flexibility.service';
import { MeasurementType } from '../../../shared/models/flexibility.model';

@Component({
  selector: 'app-create-offer-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './create-offer-modal.component.html',
  styleUrls: ['./create-offer-modal.component.css']
})
export class CreateOfferModalComponent implements OnInit {
  @Input() sessionId!: string;
  @Input() bid!: BidWithOffers;
  @Output() close = new EventEmitter<void>();
  @Output() offerCreated = new EventEmitter<void>();

  powerMw: number = 0;
  submitting = false;
  error: string | null = null;
  validationErrors: string[] = [];
  theoreticalFlexibility: number[] = [];
  hourlyMaxUserPowerMw: number = 0;

  constructor(
    private readonly hourlyOfferService: HourlyOfferService,
    private readonly flexibilityService: FlexibilityService
  ) { }

  ngOnInit(): void {
    // Initialize with a suggested value (50% of available or minimum)
    this.powerMw = Math.min(this.bid.availablePowerMw / 2, 1);

    const type: MeasurementType =
      this.bid.bidType === 'UPWARD' ? 'flexibility_upward' : 'flexibility_downward';

    this.loadHourlyFlexibility(type);
  }

  onSubmit(): void {
    this.validationErrors = [];
    this.error = null;

    // Validations
    if (!this.validateOffer()) {
      return;
    }

    this.submitting = true;

    const offerRequest: CreateHourlyOfferRequest = {
      sessionId: this.sessionId,
      hour: this.bid.hour,
      powerMw: this.powerMw
    };

    this.hourlyOfferService.createOffer(offerRequest).subscribe({
      next: (response) => {
        this.submitting = false;
        ToastNotificationComponent.show('Offer created successfully', 'success');
        this.offerCreated.emit();
      },
      error: (error) => {
        this.submitting = false;

        // Handle 409 Conflict - Duplicate offer
        if (error.status === 409) {
          ToastNotificationComponent.show(
            'You already have an offer for this hour. Please cancel your existing offer first.',
            'error',
            5000
          );
          this.error = 'Duplicate offer detected';
        } else if (error.status === 400) {
          const errorMessage = error.error?.message || 'Invalid offer data';
          ToastNotificationComponent.show(errorMessage, 'error');
          this.error = errorMessage;
        } else if (error.status === 404) {
          ToastNotificationComponent.show('Session or bid not found', 'error');
          this.error = 'Session or bid not found';
        } else {
          const errorMessage = error.error?.message || 'Failed to create offer. Please try again.';
          ToastNotificationComponent.show(errorMessage, 'error');
          this.error = errorMessage;
        }
      }
    });
  }

  validateOffer(): boolean {
    this.validationErrors = [];

    const max = this.getEffectiveMaxMw();

    if (!this.powerMw || this.powerMw <= 0) {
      this.validationErrors.push('Power must be greater than 0 KW');
    }

    if (max <= 0) {
      this.validationErrors.push(
        'Your available flexibility for this hour is 0 KW (you cannot place an offer).'
      );
    }

    if (this.powerMw > max) {
      this.validationErrors.push(
        `Power cannot exceed ${max.toFixed(3)} KW (effective maximum for this hour)`
      );
    }

    if (this.powerMw.toString().split('.')[1]?.length > 3) {
      this.validationErrors.push('Power cannot have more than 3 decimal places');
    }

    return this.validationErrors.length === 0;
  }


  onCancel(): void {
    this.close.emit();
  }

  getHourDisplay(): string {
    const start = this.bid.hour.toString().padStart(2, '0');
    const end = ((this.bid.hour + 1) % 24).toString().padStart(2, '0');
    return `${start}:00 - ${end}:00`;
  }

  calculateTotalPrice(): number {
    return this.powerMw * this.bid.pricePerMwh;
  }

  calculateCollateral(): number {
    // 5% of offer value (COLLATERAL_BPS = 500)
    return this.calculateTotalPrice() * 0.05;
  }

  calculatePlatformFee(): number {
    // 2% of offer value (PLATFORM_FEE_BPS = 200)
    return this.calculateTotalPrice() * 0.02;
  }

  calculateFlexTokens(): number {
    // 1:1 ratio with offer value
    return this.calculateTotalPrice();
  }

  getBidTypeLabel(): string {
    return this.bid.bidType === 'UPWARD' ? 'Upward' : 'Downward';
  }

  // Increase/decrease power with buttons
  increasePower(amount: number): void {
    const max = this.getEffectiveMaxMw();
    const newValue = this.powerMw + amount;

    if (newValue <= max) {
      this.powerMw = Math.round(newValue * 1000) / 1000;
    } else {
      this.powerMw = max;
    }
  }

  decreasePower(amount: number): void {
    const newValue = this.powerMw - amount;
    if (newValue >= 0) {
      this.powerMw = Math.round(newValue * 1000) / 1000;
    } else {
      this.powerMw = 0;
    }
  }


  setMaxPower(): void {
    this.powerMw = this.getEffectiveMaxMw();
  }

loadHourlyFlexibility(type: MeasurementType): void {
  this.flexibilityService.getHourlyTheoreticalFlexibility(type).subscribe({
    next: (values) => {
      this.theoreticalFlexibility = values;

      // recalcular máximo para la hora actual
      const effectiveMax = this.getEffectiveMaxMw();
      this.hourlyMaxUserPowerMw = this.getUserHourMaxMw();

      // si el valor actual supera el máximo, clamp
      if (this.powerMw > effectiveMax) {
        this.powerMw = effectiveMax;
      }

      // si es 0, opcionalmente ponerlo a 0
      if (effectiveMax <= 0) {
        this.powerMw = 0;
      }
    },
    error: (e) => {},
  });
}

  getUserHourMaxMw(): number {
    const hour = this.bid?.hour ?? 0;
    const flexibilityInHour = this.theoreticalFlexibility?.[hour];

    if (typeof flexibilityInHour !== 'number' || Number.isNaN(flexibilityInHour) || flexibilityInHour < 0) return 0;

    return Math.trunc(flexibilityInHour * 1000) / 1000;
  }

  getEffectiveMaxMw(): number {
    const userMax = this.getUserHourMaxMw();
    const bidMax = this.bid?.availablePowerMw ?? 0;

    if (userMax <= 0) return 0;
    return Math.min(bidMax, userMax);
  }
}
