import { Component, Output, EventEmitter, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { ToastNotificationComponent } from '../../../shared/components/toast-notification/toast-notification.component';

@Component({
  selector: 'app-pin-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule],
  templateUrl: './pin-modal.component.html',
  styleUrls: ['./pin-modal.component.css']
})
export class PinModalComponent {
  @Input() title: string = 'Enter PIN';
  @Input() message: string = 'Please enter your PIN to authorize this transaction';
  @Input() offerValue: number = 0;
  @Input() collateral: number = 0;
  @Input() platformFee: number = 0;
  @Input() flexTokens: number = 0;
  @Output() close = new EventEmitter<void>();
  @Output() pinSubmitted = new EventEmitter<string>();

  pin: string = '';
  submitting = false;
  error: string | null = null;
  showPin = false;

  onSubmit(): void {
    this.error = null;

    // Validation
    if (!this.pin || this.pin.trim().length === 0) {
      this.error = 'PIN is required';
      ToastNotificationComponent.show('PIN is required', 'error');
      return;
    }

    if (this.pin.length !== 6) {
      this.error = 'PIN must be exactly 6 digits';
      ToastNotificationComponent.show('PIN must be exactly 6 digits', 'error');
      return;
    }

    if (!/^\d{6}$/.test(this.pin)) {
      this.error = 'PIN must contain only numbers';
      ToastNotificationComponent.show('PIN must contain only numbers', 'error');
      return;
    }

    this.pinSubmitted.emit(this.pin);
  }

  onCancel(): void {
    this.close.emit();
  }

  togglePinVisibility(): void {
    this.showPin = !this.showPin;
  }

  onPinInput(event: any): void {
    // Only allow numeric characters
    let value = event.target.value.replace(/[^0-9]/g, '');
    
    // Limit to 6 digits
    if (value.length > 6) {
      value = value.substring(0, 6);
    }
    
    this.pin = value;
    event.target.value = value;
  }

  setSubmitting(value: boolean): void {
    this.submitting = value;
  }

  setError(message: string): void {
    this.error = message;
  }

  clearPin(): void {
    this.pin = '';
  }
}
