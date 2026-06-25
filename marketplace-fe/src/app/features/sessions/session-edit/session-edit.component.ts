import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { DateAdapter, MAT_DATE_FORMATS, MatNativeDateModule } from '@angular/material/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { SessionService } from '../../../core/services/session/session.service';
import { KeycloakService } from '../../../core/services/keycloak/keycloak.service';
import { Session, SessionDraft, BidType, CreateBidRequest } from '../../../shared/models/session.model';
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
  selector: 'app-session-edit',
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
    MatProgressSpinnerModule,
    MatSelectModule,
    MatTooltipModule
  ],
  providers: [
    { provide: DateAdapter, useClass: CustomDateAdapter },
    { provide: MAT_DATE_FORMATS, useValue: MY_DATE_FORMATS }
  ],
  templateUrl: './session-edit.component.html',
  styleUrl: './session-edit.component.css'
})
export class SessionEditComponent extends EventListener implements OnInit, OnDestroy {
  session: Session | null = null;
  sessionForm!: FormGroup;
  bidForm!: FormGroup;
  sessionDraft!: SessionDraft;
  timeSlots: any[] = [];
  selectedHour: number | null = null;
  selectedSessionDate: Date | null = null;

  minDate = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 2);
    return d;
  })();

  loading = false;
  saving = false;
  isEditMode = false;
  currentUserRole: string = '';
  checkingDate = false;
  dateAlreadyExists = false;
  formSubmitted = false;
  private subscription = new Subscription();
  existingSessionDates: Set<string> = new Set();
  dateClass = (date: Date): string => {
    return this.getDateClass(date);
  };
  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private sessionService: SessionService,
    private keycloak: KeycloakService,
    private formErrorHandler: FormErrorHandlerService,
    private errorLogService: ErrorLogService,
    eventService: EventService
  ) {

    super(eventService);
    this.fmap.set('APP_ERROR', this.handleAppError.bind(this));

    // Initialize forms in constructor
    this.sessionForm = this.fb.group({
      name: ['', [Validators.required, Validators.maxLength(100)]],
      description: ['', [Validators.maxLength(500)]],
      sessionDate: [null, Validators.required]
    });

    this.bidForm = this.fb.group({
      powerMw: ['', [Validators.required, Validators.min(0.01)]],
      pricePerMwh: ['', [Validators.required, Validators.min(0.01)]],
      bidType: ['UPWARD', Validators.required]
    });

    const dayAfterTomorrow = new Date();
    dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);

    // Initialize session draft
    this.sessionDraft = {
      name: '',
      description: '',
      sessionDate: new Date(),
      bids: new Map<number, CreateBidRequest>()
    };

    // Initialize time slots
    this.initializeTimeSlots();
  }

  ngOnInit(): void {
    // Subscribe to error events
    this.eventSubscribe();

    // Check user role
    const roles = this.keycloak.getRoles();
    this.currentUserRole = roles.find(role => ['FRP', 'FSP', 'FMO_LMO'].includes(role)) || '';

    // Only FRP users can edit sessions
    if (this.currentUserRole !== 'FRP') {
      ToastNotificationComponent.show('Only FRP users can edit sessions', 'error');
      this.router.navigate(['/market-sessions']);
      return;
    }

    const sessionId = this.route.snapshot.paramMap.get('id');
    if (sessionId) {
      this.isEditMode = true;
      this.loadSession(sessionId);
    }

    const dayAfterTomorrow = new Date();
    dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);
    this.minDate = dayAfterTomorrow;

    this.sessionForm.get('sessionDate')?.valueChanges.subscribe((newDate: Date) => {
      this.selectedSessionDate = newDate;
    });

    // Set initial selected date
    this.selectedSessionDate = this.sessionForm.get('sessionDate')?.value;

    // Load existing sessions to mark dates in calendar
    this.loadExistingSessionDates();
  }

  ngOnDestroy(): void {
    this.unsubcribe();
    this.subscription.unsubscribe();
  }

  loadSession(sessionId: string): void {
    this.loading = true;
    this.sessionService.getSessionById(sessionId).subscribe({
      next: (response) => {
        this.loading = false;
        if (response.success && response.data) {
          this.session = response.data;

          // Check if session can be edited
          if (this.session.status !== 'DRAFT') {
            ToastNotificationComponent.show('Only DRAFT sessions can be edited', 'error');
            this.router.navigate(['/market-sessions']);
            return;
          }

          // Populate form with session data
          this.sessionForm.patchValue({
            name: this.session.name,
            description: this.session.description || '',
            sessionDate: new Date(this.session.sessionDate)
          });

          // Update draft with session data
          this.sessionDraft.name = this.session.name;
          this.sessionDraft.description = this.session.description || '';
          this.sessionDraft.sessionDate = new Date(this.session.sessionDate);

          // Load existing bids
          this.session.bids.forEach(bid => {
            this.sessionDraft.bids.set(bid.hour, {
              hour: bid.hour,
              powerMw: bid.powerMw,
              pricePerMwh: bid.pricePerMwh,
              bidType: bid.bidType
            });
          });

          this.updateTimeSlots();

          // Reload existing session dates to exclude current session
          this.loadExistingSessionDates();
        } else {
          ToastNotificationComponent.show('Failed to load session', 'error');
          this.session = null;
        }
      },
      error: (error) => {
        this.loading = false;
        // Handle RFC7807 errors (will be handled by handleAppError)
        if (error.error?.title && error.error?.status) {
          return;
        }

        let errorMessage = 'Failed to load session details';

        if (error.status === 404) {
          errorMessage = 'Session not found. It may have been deleted or you may not have access to it';
          // Redirect back to list after showing error
          setTimeout(() => this.router.navigate(['/market-sessions']), 2000);
        } else if (error.status === 403) {
          errorMessage = 'You do not have permission to view this session';
          setTimeout(() => this.router.navigate(['/market-sessions']), 2000);
        } else if (error.status === 401) {
          errorMessage = 'Your session has expired. Please log in again';
        } else if (error.status === 428) {
          errorMessage = 'Please select a market first';
        } else if (error.status === 0) {
          errorMessage = 'Network error. Please check your internet connection';
        } else if (error.status >= 500) {
          errorMessage = 'Server error. Please try again later';
        } else if (error.error?.message) {
          errorMessage = error.error.message;
        }

        ToastNotificationComponent.show(errorMessage, 'error');
        this.session = null;
      }
    });
  }

  // Error handling methods
  private handleAppError(errorEvent: AppErrorEvent): void {
    // Only handle errors during active operations
    if (!this.saving && !this.checkingDate && !this.loading) return;

    this.saving = false;
    this.checkingDate = false;
    this.loading = false;

    // Handle validation errors - only apply to form, no toast
    if (errorEvent.status === 422 && errorEvent.errors && errorEvent.errors.length > 0) {
      this.formErrorHandler.applyValidationErrorsToForm(this.sessionForm, errorEvent.errors);
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
        return 'You do not have permission to edit this session.';
      case 404:
        return 'Session not found. It may have been deleted.';
      case 409:
        return errorEvent.detail || 'A session with this date already exists.';
      case 422:
        return errorEvent.detail || 'Validation failed. Please check your input.';
      case 428:
        return 'Please select a market before editing the session.';
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
            response.data
              .filter(session => session.id !== this.session?.id) // Exclude current session
              .map(session =>
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

  if (checkDate < dayAfterTomorrow) {
    return 'past-date';
  }

  return '';
}

  initializeTimeSlots(): void {
    this.timeSlots = this.sessionService.generateTimeSlots();
    this.updateTimeSlots();
  }

  // Navigation methods
  goBack(): void {
    if (this.session?.status) {
      this.router.navigate(['/market-sessions'], {
        queryParams: { status: this.session.status }
      });
    } else {
      this.router.navigate(['/market-sessions']);
    }
  }

  formatSelectedDate(): string {
    const sessionDate = this.sessionForm?.get('sessionDate')?.value;
    if (!sessionDate) return '';

    return new Date(sessionDate).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  checkDateAvailability(): void {
    const sessionDate = this.sessionForm.get('sessionDate')?.value;
    if (!sessionDate) return;

    this.checkingDate = true;
    this.dateAlreadyExists = false;

    const selectedDateStr = new Date(sessionDate).toISOString().split('T')[0];

    this.sessionService.getSessions().subscribe({
      next: (response) => {
        this.checkingDate = false;
        if (response.success && response.data) {
          // Check if any OTHER session has the same date (excluding current session being edited)
          const existingSession = response.data.find(session => {
            const sessionDateStr = new Date(session.sessionDate).toISOString().split('T')[0];
            // Exclude the current session being edited
            return sessionDateStr === selectedDateStr && session.id !== this.session?.id;
          });

          if (existingSession) {
            this.dateAlreadyExists = true;
          }
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

  // Time slots methods
  selectTimeSlot(hour: number): void {
    this.selectedHour = hour;

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

      ToastNotificationComponent.show(
        `Bid ${this.hasCurrentBid() ? 'updated' : 'added'} for ${this.getSelectedTimeSlotDisplay()}`,
        'success'
      );
    }
  }

  removeBid(): void {
    if (this.selectedHour !== null) {
      this.sessionDraft.bids.delete(this.selectedHour);
      this.updateTimeSlots();
      ToastNotificationComponent.show('Bid removed successfully', 'success');
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

  // Summary methods
  getBidsCount(): number {
    return this.sessionDraft?.bids.size || 0;
  }

  getTotalPower(): number {
    if (!this.sessionDraft) return 0;
    let total = 0;
    this.sessionDraft.bids.forEach(bid => {
      total += bid.powerMw;
    });
    return total;
  }

  getAveragePricePerMwh(): number {
    if (!this.sessionDraft || this.sessionDraft.bids.size === 0) return 0;

    let total = 0;
    this.sessionDraft.bids.forEach(bid => {
      total += bid.pricePerMwh;
    });
    return total / this.sessionDraft.bids.size;
  }

  getBidTypeName(bidType?: BidType): string {
    if (!bidType) return '';
    return this.sessionService.getBidTypeName(bidType);
  }

  // Save methods
  saveChanges(): void {
    this.saveSession();
  }

  private saveSession(): void {
    // Mark form as submitted to show validation errors
    this.formSubmitted = true;

    // Validate form
    if (!this.sessionForm.valid) {
      ToastNotificationComponent.show(
        'Please complete all required fields before saving',
        'error'
      );
      return;
    }

    // Check if there are bids
    if (this.getBidsCount() === 0) {
      ToastNotificationComponent.show(
        'Please add at least one time slot bid before saving',
        'error'
      );
      return;
    }

    // Check if date is already taken
    if (this.dateAlreadyExists) {
      ToastNotificationComponent.show(
        'Please select a different date. A session already exists for the selected date',
        'error'
      );
      return;
    }

    // Update draft with form data
    this.sessionDraft.name = this.sessionForm.get('name')?.value;
    this.sessionDraft.description = this.sessionForm.get('description')?.value;
    this.sessionDraft.sessionDate = this.sessionForm.get('sessionDate')?.value;

    // Validate
    const errors = this.sessionService.validateSessionDraft(this.sessionDraft);
    if (errors.length > 0) {
      ToastNotificationComponent.show(errors[0], 'error');
      return;
    }

    this.saving = true;
    const request = {
      name: this.sessionDraft.name,
      description: this.sessionDraft.description || '',
      sessionDate: this.sessionDraft.sessionDate.toISOString().split('T')[0],
      bids: Array.from(this.sessionDraft.bids.values())
    };

    if (this.isEditMode && this.session) {
      // Update existing session
      this.sessionService.updateSession(this.session.id, request).subscribe({
        next: (response) => {
          this.saving = false;
          if (response.success) {
            ToastNotificationComponent.show('Session updated successfully!', 'success');
            // Redirigir con filtro de status
            this.router.navigate(['/market-sessions'], {
              queryParams: { status: this.session?.status || 'DRAFT' }
            });
          }
        },
        error: (error) => {
          this.saving = false;
          // Handle RFC7807 errors (will be handled by handleAppError)
          if (error.error?.title && error.error?.status) {
            return;
          }

          let errorMessage = 'Failed to update session';

          if (error.status === 404) {
            errorMessage = 'Session not found. It may have been deleted';
          } else if (error.status === 403) {
            errorMessage = 'You do not have permission to update this session';
          } else if (error.status === 409) {
            errorMessage = 'A session with this date already exists in this market';
          } else if (error.status === 422) {
            errorMessage = 'Validation failed. Please check all fields and try again';

            // Handle validation errors
            if (error.error?.errors && Array.isArray(error.error.errors)) {
              this.formErrorHandler.applyValidationErrorsToForm(this.sessionForm, error.error.errors);
            }
          } else if (error.status === 400) {
            // Handle blockchain errors
            if (error.error?.message?.includes('blockchain')) {
              errorMessage = 'Blockchain error: ' + (error.error.message || 'Failed to update session on blockchain');
            } else if (error.error?.message?.includes('contract')) {
              errorMessage = 'Smart contract error: Unable to update session';
            } else if (error.error?.message?.includes('status')) {
              errorMessage = 'Cannot update session: ' + (error.error.message || 'Invalid session status');
            } else {
              errorMessage = error.error?.message || 'Invalid request. Please check your input';
            }
          } else if (error.status === 428) {
            errorMessage = 'Please select a market before updating the session';
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
  }
}