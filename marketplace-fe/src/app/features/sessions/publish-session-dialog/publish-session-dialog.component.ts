import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';

export interface PublishSessionDialogData {
  sessionName: string;
  action?: 'publish' | 'open_offers' | 'close_offers' | 'return_tokens'; // Tipo de acción: publicar, abrir/cerrar período de ofertas, o devolver tokens
}

export interface PublishSessionDialogResult {
  confirmed: boolean;
  pin?: string;
}

@Component({
  selector: 'app-publish-session-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule
  ],
  templateUrl: './publish-session-dialog.component.html',
  styleUrl: './publish-session-dialog.component.css'
})
export class PublishSessionDialogComponent {
  pin: string = '';
  pinError: string = '';
  showPin: boolean = false;

  constructor(
    public dialogRef: MatDialogRef<PublishSessionDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: PublishSessionDialogData
  ) {}

  onCancel(): void {
    this.dialogRef.close({ confirmed: false });
  }

  onConfirm(): void {
    // Validate PIN
    if (!this.pin) {
      this.pinError = 'PIN is required';
      return;
    }

    if (this.pin.length !== 6) {
      this.pinError = 'PIN must be exactly 6 digits';
      return;
    }

    if (!/^\d{6}$/.test(this.pin)) {
      this.pinError = 'PIN must contain only numbers';
      return;
    }

    // Clear error and close with result
    this.pinError = '';
    this.dialogRef.close({ confirmed: true, pin: this.pin });
  }

  onPinInput(): void {
    // Clear error when user starts typing
    if (this.pinError) {
      this.pinError = '';
    }
  }

  togglePinVisibility(): void {
    this.showPin = !this.showPin;
  }
}
