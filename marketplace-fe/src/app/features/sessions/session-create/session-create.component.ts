import { Component, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { DateAdapter, MAT_DATE_FORMATS, MAT_DATE_LOCALE, MatNativeDateModule } from '@angular/material/core';
import { MatStepperModule, MatStepper } from '@angular/material/stepper';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { SessionService } from '../../../core/services/session/session.service';
import { SessionDraft, BidType } from '../../../shared/models/session.model';
import { ToastNotificationComponent } from '../../../shared/components/toast-notification/toast-notification.component';
import { FormErrorHandlerService } from '../../../core/services/error/form-error-handler.service';
import { ErrorLogService } from '../../../core/services/error/error-log.service';
import { EventService, EventListener } from 'hateoas-utils';
import { AppErrorEvent } from '../../../shared/models/error/rfc7807-error.model';
import { Subscription } from 'rxjs';
import { CustomDateAdapter } from '../../../shared/utils/custom-date-adapter';

export const MY_DATE_FORMATS = {
  parse: { dateInput: 'dd/MM/yyyy' },
  display: {
    dateInput: 'dd/MM/yyyy',
    monthYearLabel: 'MMM yyyy',
    dateA11yLabel: 'dd/MM/yyyy',
    monthYearA11yLabel: 'MMMM yyyy',
  },
};

@Component({
  selector: 'app-session-create',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatInputModule,
    MatFormFieldModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatStepperModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatTooltipModule
  ],
  providers: [
  { provide: DateAdapter, useClass: CustomDateAdapter },
  { provide: MAT_DATE_FORMATS, useValue: MY_DATE_FORMATS }
],
  templateUrl: './session-create.component.html',
  styleUrl: './session-create.component.css'
})
export class SessionCreateComponent extends EventListener implements OnInit, OnDestroy {
  @ViewChild('stepper') stepper!: MatStepper;

  basicInfoForm: FormGroup;
  bidForm: FormGroup;
  bulkBidForm: FormGroup;
  sessionDraft: SessionDraft;
  timeSlots: any[] = [];
  selectedHour: number | null = null;
  minDate = new Date();
  saving = false;
  checkingDate = false;
  dateAlreadyExists = false;
  formSubmitted = false;
  selectedSessionDate: Date | null = null;
  bidsFormSubmitted = false;
  existingSessionDates: Set<string> = new Set();
  dateClass = (date: Date): string => {
    return this.getDateClass(date);
  };
  private errorSubscription?: Subscription;

  // Bulk configuration
  showBulkConfig = false;
  bulkSelectionMode = false;
  selectedSlots: Set<number> = new Set();
  quickViewMode = false;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private sessionService: SessionService,
    private formErrorHandler: FormErrorHandlerService,
    private errorLogService: ErrorLogService,
    eventService: EventService
  ) {
    super(eventService);
    this.fmap.set('APP_ERROR', this.handleAppError.bind(this));
    this.sessionDraft = this.sessionService.createEmptySessionDraft();

    // Calculate day after tomorrow BEFORE creating the form
    const dayAfterTomorrow = new Date();
    dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);

    this.basicInfoForm = this.fb.group({
      name: ['', [Validators.required, Validators.maxLength(100)]],
      description: ['', [Validators.maxLength(500)]],
      sessionDate: [dayAfterTomorrow, Validators.required]  // ← Use dayAfterTomorrow
    });

    this.bidForm = this.fb.group({
      powerMw: ['', [Validators.required, Validators.min(0.001)]],
      pricePerMwh: ['', [Validators.required, Validators.min(0.01)]],
      bidType: ['UPWARD', Validators.required]
    });

    this.bulkBidForm = this.fb.group({
      powerMw: ['', [Validators.required, Validators.min(0.001)]],
      pricePerMwh: ['', [Validators.required, Validators.min(0.01)]],
      bidType: ['UPWARD', Validators.required]
    });
  }

  ngOnInit(): void {
    // Subscribe to error events
    this.eventSubscribe();

    // Initialize time slots
    this.timeSlots = this.sessionService.generateTimeSlots();

    // Set minDate to day after tomorrow
    const dayAfterTomorrow = new Date();
    dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);
    this.minDate = dayAfterTomorrow;

    this.basicInfoForm.get('sessionDate')?.valueChanges.subscribe((newDate: Date) => {
      this.selectedSessionDate = newDate;
    });

    // Set initial selected date
    this.selectedSessionDate = this.basicInfoForm.get('sessionDate')?.value;

    // Load existing sessions to mark dates in calendar
    this.loadExistingSessionDates();
  }

  ngOnDestroy(): void {
    this.unsubcribe();
    if (this.errorSubscription) {
      this.errorSubscription.unsubscribe();
    }
  }

  // Error handling methods
  private handleAppError(errorEvent: AppErrorEvent): void {
    // Only handle errors when we're in a saving state
    if (!this.saving && !this.checkingDate) return;

    this.saving = false;
    this.checkingDate = false;

    // Handle validation errors - only apply to form, no toast
    if (errorEvent.status === 422 && errorEvent.errors && errorEvent.errors.length > 0) {
      this.formErrorHandler.applyValidationErrorsToForm(this.basicInfoForm, errorEvent.errors);
      this.formSubmitted = true;
      return;
    }

    // Handle specific error types with toast
    let errorMessage = this.getErrorMessage(errorEvent);
    ToastNotificationComponent.show(errorMessage, 'error');
  }

  private getErrorMessage(errorEvent: AppErrorEvent): string {
    switch (errorEvent.status) {
      case 400:
        return errorEvent.detail || 'Invalid request. Please check your input and try again.';
      case 401:
        return 'Your session has expired. Please log in again.';
      case 403:
        return 'You do not have permission to perform this action.';
      case 404:
        return 'The requested resource was not found.';
      case 409:
        return errorEvent.detail || 'A session with this date already exists.';
      case 422:
        return errorEvent.detail || 'Validation failed. Please check your input.';
      case 428:
        return 'Please select a market before creating a session.';
      case 500:
        return 'A server error occurred. Please try again later.';
      case 503:
        return 'The service is temporarily unavailable. Please try again later.';
      default:
        if (errorEvent.status === 0) {
          return 'Network error. Please check your internet connection.';
        }
        return errorEvent.detail || errorEvent.title || 'An unexpected error occurred.';
    }
  }

  // Load existing session dates for calendar highlighting
  private loadExistingSessionDates(): void {
    this.sessionService.getSessions().subscribe({
      next: (response) => {
        if (response.success && response.data) {
          this.existingSessionDates = new Set(
            response.data.map(session =>
              new Date(session.sessionDate).toISOString().split('T')[0]
            )
          );
        }
      },
      error: (error) => {
      }
    });
  }

  getDateClass(date: Date): string {
    const dateStr = new Date(date).toISOString().split('T')[0];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const dayAfterTomorrow = new Date(today);
    dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);
    
    const checkDate = new Date(date);
    checkDate.setHours(0, 0, 0, 0);
    
    // Mark the currently selected date
    if (this.selectedSessionDate) {
      const selectedDate = new Date(this.selectedSessionDate);
      selectedDate.setHours(0, 0, 0, 0);
      
      if (checkDate.getTime() === selectedDate.getTime()) {
        return 'first-selectable';
      }
    }
    
    if (this.existingSessionDates.has(dateStr)) {
      return 'has-session';
    }
    
    // Disable today and tomorrow
    if (checkDate < dayAfterTomorrow) {
      return 'past-date';
    }
    
    return '';
  }

  // Navigation methods
  goBack(): void {
    this.router.navigate(['/market-sessions'], {
      queryParams: { status: 'DRAFT' }
    });
  }

  // Basic info methods
  formatSelectedDate(): string {
    const sessionDate = this.basicInfoForm.get('sessionDate')?.value;
    if (!sessionDate) return '';

    return new Date(sessionDate).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  checkDateAvailability(): void {
    // Mark form as submitted to show validation errors
    this.formSubmitted = true;

    // Validate basic info form
    if (!this.basicInfoForm.valid) {
      ToastNotificationComponent.show(
        'Please complete all required fields before continuing',
        'error'
      );
      return;
    }

    const sessionDate = this.basicInfoForm.get('sessionDate')?.value;
    if (!sessionDate) return;

    this.checkingDate = true;
    this.dateAlreadyExists = false;

    const selectedDateStr = new Date(sessionDate).toISOString().split('T')[0];

    this.sessionService.getSessions().subscribe({
      next: (response) => {
        this.checkingDate = false;
        if (response.success && response.data) {
          // Check if any session has the same date
          const existingSession = response.data.find(session => {
            const sessionDateStr = new Date(session.sessionDate).toISOString().split('T')[0];
            return sessionDateStr === selectedDateStr;
          });

          if (existingSession) {
            this.dateAlreadyExists = true;
          } else {
            // Date is available, update draft and proceed to next step
            this.updateDraftWithBasicInfo();
            this.stepper.next();
          }
        } else {
          // No sessions found, date is available
          this.updateDraftWithBasicInfo();
          this.stepper.next();
        }
      },
      error: (error) => {
        this.checkingDate = false;
        let errorMessage = 'Failed to verify date availability';

        if (error.status === 0) {
          errorMessage = 'Network error. Please check your internet connection';
        } else if (error.status === 401 || error.status === 403) {
          errorMessage = 'You do not have permission to check session availability';
        } else if (error.status === 428) {
          errorMessage = 'Please select a market first';
        } else if (error.status >= 500) {
          errorMessage = 'Server error. Please try again later';
        } else if (error.error?.message) {
          errorMessage = error.error.message;
        }

        ToastNotificationComponent.show(errorMessage, 'error');
      }
    });
  }

  // Check bids before proceeding to review step
  checkBidsBeforeReview(): void {
    this.bidsFormSubmitted = true;

    if (this.getBidsCount() === 0) {
      ToastNotificationComponent.show(
        'Please add at least one time slot bid before continuing',
        'error'
      );
      return;
    }

    // Update draft with basic info before proceeding to review
    this.updateDraftWithBasicInfo();

    // If validation passes, proceed to next step
    if (this.stepper) {
      this.stepper.next();
    }
  }

  // Update session draft with basic info from form
  private updateDraftWithBasicInfo(): void {
    this.sessionDraft.name = this.basicInfoForm.get('name')?.value;
    this.sessionDraft.description = this.basicInfoForm.get('description')?.value;
    this.sessionDraft.sessionDate = this.basicInfoForm.get('sessionDate')?.value;
  }

  // Time slots methods
  selectTimeSlot(hour: number): void {
    this.selectedHour = hour;

    // Load existing bid data if available
    const existingBid = this.sessionDraft.bids.get(hour);
    if (existingBid) {
      this.bidForm.patchValue(existingBid);
    } else {
      this.bidForm.reset({
        powerMw: '',
        pricePerMwh: '',
        bidType: 'UPWARD'
      });
    }
  }

  clearSelectedSlot(): void {
    this.selectedHour = null;
    this.bidForm.reset({
      powerMw: '',
      pricePerMwh: '',
      bidType: 'UPWARD'
    });
  }

  saveBid(): void {
    if (this.bidForm.valid && this.selectedHour !== null) {
      const bidData = {
        hour: this.selectedHour,
        powerMw: this.bidForm.get('powerMw')?.value,
        pricePerMwh: this.bidForm.get('pricePerMwh')?.value,
        bidType: this.bidForm.get('bidType')?.value as BidType
      };

      this.sessionDraft.bids.set(this.selectedHour, bidData);
      this.updateTimeSlots();
      this.clearSelectedSlot();
    }
  }

  removeBid(): void {
    if (this.selectedHour !== null) {
      this.sessionDraft.bids.delete(this.selectedHour);
      this.updateTimeSlots();
      this.clearSelectedSlot();
    }
  }

  hasCurrentBid(): boolean {
    return this.selectedHour !== null && this.sessionDraft.bids.has(this.selectedHour);
  }

  updateTimeSlots(): void {
    this.timeSlots = this.timeSlots.map(slot => ({
      ...slot,
      hasData: this.sessionDraft.bids.has(slot.hour),
      bid: this.sessionDraft.bids.get(slot.hour) as any
    }));
  }

  getSelectedTimeSlotDisplay(): string {
    if (this.selectedHour === null) return '';
    const slot = this.timeSlots.find(s => s.hour === this.selectedHour);
    return slot ? slot.displayTime : '';
  }

  trackByHour(index: number, slot: any): number {
    return slot.hour;
  }

  // Bulk Configuration Methods
  toggleBulkConfig(): void {
    this.showBulkConfig = !this.showBulkConfig;
    if (!this.showBulkConfig) {
      this.bulkSelectionMode = false;
      this.selectedSlots.clear();
    }
  }

  toggleBulkSelectionMode(): void {
    this.bulkSelectionMode = !this.bulkSelectionMode;
    if (!this.bulkSelectionMode) {
      this.selectedSlots.clear();
    }
  }

  toggleSlotSelection(hour: number): void {
    if (this.selectedSlots.has(hour)) {
      this.selectedSlots.delete(hour);
    } else {
      this.selectedSlots.add(hour);
    }
  }

  isSlotSelected(hour: number): boolean {
    return this.selectedSlots.has(hour);
  }

  selectAllSlots(): void {
    this.timeSlots.forEach(slot => this.selectedSlots.add(slot.hour));
  }

  selectEmptySlots(): void {
    this.selectedSlots.clear();
    this.timeSlots.forEach(slot => {
      if (!this.sessionDraft.bids.has(slot.hour)) {
        this.selectedSlots.add(slot.hour);
      }
    });
  }

  clearSlotSelection(): void {
    this.selectedSlots.clear();
  }

  applyBulkBid(): void {
    if (!this.bulkBidForm.valid || this.selectedSlots.size === 0) return;

    const bidData = {
      powerMw: this.bulkBidForm.get('powerMw')?.value,
      pricePerMwh: this.bulkBidForm.get('pricePerMwh')?.value,
      bidType: this.bulkBidForm.get('bidType')?.value as BidType
    };

    this.selectedSlots.forEach(hour => {
      this.sessionDraft.bids.set(hour, { ...bidData, hour });
    });

    this.updateTimeSlots();
    this.selectedSlots.clear();
    this.bulkSelectionMode = false;

    ToastNotificationComponent.show(
      `Bid applied to ${this.selectedSlots.size || 'selected'} time slots`,
      'success'
    );
  }

  applyToAllSlots(): void {
    if (!this.bulkBidForm.valid) return;

    const bidData = {
      powerMw: this.bulkBidForm.get('powerMw')?.value,
      pricePerMwh: this.bulkBidForm.get('pricePerMwh')?.value,
      bidType: this.bulkBidForm.get('bidType')?.value as BidType
    };

    this.timeSlots.forEach(slot => {
      this.sessionDraft.bids.set(slot.hour, { ...bidData, hour: slot.hour });
    });

    this.updateTimeSlots();
    this.showBulkConfig = false;

    ToastNotificationComponent.show(
      'Bid applied to all 24 time slots',
      'success'
    );
  }

  clearAllBids(): void {
    this.sessionDraft.bids.clear();
    this.updateTimeSlots();
    ToastNotificationComponent.show('All bids cleared', 'info');
  }

  toggleQuickViewMode(): void {
    this.quickViewMode = !this.quickViewMode;
    this.selectedHour = null;
  }

  getSlotsByPeriod(period: 'morning' | 'afternoon' | 'evening' | 'night'): any[] {
    const ranges: Record<string, [number, number]> = {
      'night': [0, 6],
      'morning': [6, 12],
      'afternoon': [12, 18],
      'evening': [18, 24]
    };
    const [start, end] = ranges[period];
    return this.timeSlots.filter(slot => slot.hour >= start && slot.hour < end);
  }

  getBidsForPeriod(period: 'morning' | 'afternoon' | 'evening' | 'night'): number {
    return this.getSlotsByPeriod(period).filter(slot => slot.hasData).length;
  }

  // Summary methods
  getBidsCount(): number {
    return this.sessionDraft.bids.size;
  }

  getTotalPower(): number {
    let total = 0;
    this.sessionDraft.bids.forEach(bid => {
      total += bid.powerMw;
    });
    return total;
  }

  getAveragePricePerMwh(): number {
    if (this.sessionDraft.bids.size === 0) return 0;

    let total = 0;
    this.sessionDraft.bids.forEach(bid => {
      total += bid.pricePerMwh;
    });
    return total / this.sessionDraft.bids.size;
  }

  getOrderedBids(): any[] {
    return Array.from(this.sessionDraft.bids.values()).sort((a, b) => a.hour - b.hour);
  }

  getTimeSlotDisplay(hour: number): string {
    const slot = this.timeSlots.find(s => s.hour === hour);
    return slot ? slot.displayTime : '';
  }

  getBidTypeName(bidType?: BidType): string {
    if (!bidType) return '';
    return this.sessionService.getBidTypeName(bidType);
  }

  // Save methods
  saveDraft(): void {
    // Mark form as submitted to show validation errors
    this.formSubmitted = true;

    // Check if basic info form is valid
    if (!this.basicInfoForm.valid) {
      ToastNotificationComponent.show(
        'Please complete all required fields before saving',
        'error'
      );
      // Scroll to first step if needed
      if (this.stepper) {
        this.stepper.selectedIndex = 0;
      }
      return;
    }

    // Check if there are bids
    if (this.sessionDraft.bids.size === 0) {
      ToastNotificationComponent.show(
        'Please add at least one time slot bid before saving',
        'error'
      );
      return;
    }

    // Update draft with basic info
    this.sessionDraft.name = this.basicInfoForm.get('name')?.value;
    this.sessionDraft.description = this.basicInfoForm.get('description')?.value;
    this.sessionDraft.sessionDate = this.basicInfoForm.get('sessionDate')?.value;

    // Validate draft
    const errors = this.sessionService.validateSessionDraft(this.sessionDraft);
    if (errors.length > 0) {
      return;
    }

    this.saving = true;

    // Convert bids to backend format
    const bidsArray = Array.from(this.sessionDraft.bids.values());

    // Convert bids to FlexibilityRequests for blockchain
    const flexibilityRequests = bidsArray.map(bid => ({
      hourSlot: bid.hour,
      quantity: this.convertMwToWei(bid.powerMw),
      price: this.convertPriceToWei(bid.pricePerMwh),
      flexType: bid.bidType === 'UPWARD' ? 0 : 1 // 0=UPWARD, 1=DOWNWARD
    }));

    // Prepare request with ALL data
    // Use local date getters to avoid UTC offset shifting the date by one day
    const sessionDate = new Date(this.sessionDraft.sessionDate);
    const year = sessionDate.getFullYear();
    const month = String(sessionDate.getMonth() + 1).padStart(2, '0');
    const day = String(sessionDate.getDate()).padStart(2, '0');
    const sessionDateStr = `${year}-${month}-${day}`; // YYYY-MM-DD in local time

    const createRequest = {
      name: this.sessionDraft.name,
      description: this.sessionDraft.description,
      sessionDate: sessionDateStr,
      bids: bidsArray,
      flexibilityRequests: flexibilityRequests // NEW - blockchain data
    };

    this.sessionService.createSession(createRequest).subscribe({
      next: (response) => {
        this.saving = false;
        if (response.success) {
          ToastNotificationComponent.show(
            'Session saved as draft successfully!',
            'success'
          );
          // Redirect to sessions list with DRAFT filter
          this.router.navigate(['/market-sessions'], {
            queryParams: { status: 'DRAFT' }
          });
        }
      },
      error: (error) => {
        this.saving = false;
        // Handle RFC7807 errors (already handled by interceptor)
        if (error.error?.title && error.error?.status) {
          // Error will be handled by handleAppError via event
          return;
        }

        // Handle specific HTTP errors
        let errorMessage = 'Failed to save session';

        if (error.status === 428) {
          errorMessage = 'Please select a market before creating a session';
        } else if (error.status === 409) {
          errorMessage = 'A session with this date already exists in this market';
        } else if (error.status === 422) {
          // Validation errors are handled by handleAppError, no toast needed
          return;
        } else if (error.status === 400) {
          // Handle blockchain errors
          if (error.error?.message?.includes('blockchain')) {
            errorMessage = 'Blockchain error: ' + (error.error.message || 'Failed to create session on blockchain');
          } else if (error.error?.message?.includes('contract')) {
            errorMessage = 'Smart contract error: Unable to create session';
          } else {
            errorMessage = error.error?.message || 'Invalid request. Please check your input';
          }
        } else if (error.status === 500) {
          if (error.error?.message?.includes('blockchain')) {
            errorMessage = 'Blockchain service is currently unavailable. Please try again later';
          } else if (error.error?.message?.includes('database')) {
            errorMessage = 'Database error. Please try again later';
          } else {
            errorMessage = 'Server error. Please try again later';
          }
        } else if (error.status === 0) {
          errorMessage = 'Network error. Please check your internet connection and try again';
        } else if (error.error?.message) {
          errorMessage = error.error.message;
        }

        ToastNotificationComponent.show(errorMessage, 'error');
      }
    });
  }

  // Conversion methods
  private convertMwToWei(mw: number): string {
    return (BigInt(Math.floor(mw * 1e6)) * BigInt(1e12)).toString();
  }

  private convertPriceToWei(price: number): string {
    return (BigInt(Math.floor(price * 1e6)) * BigInt(1e12)).toString();
  }
}
