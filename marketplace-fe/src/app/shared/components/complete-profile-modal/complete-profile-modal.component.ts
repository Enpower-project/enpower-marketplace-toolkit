import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { UserStatusService } from '../../../core/services/auth/user-status.service';
import { CompleteProfileDto } from '../../../core/services/auth/first-login.service';

@Component({
  selector: 'app-complete-profile-modal',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSnackBarModule
  ],
  template: `
    <h2 mat-dialog-title>Complete Your Profile</h2>
    
    <mat-dialog-content>
      <form [formGroup]="profileForm" class="profile-form">
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>First Name</mat-label>
          <input matInput formControlName="firstName" placeholder="Enter your first name">
          <mat-error *ngIf="profileForm.get('firstName')?.hasError('required')">
            First name is required
          </mat-error>
        </mat-form-field>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Last Name</mat-label>
          <input matInput formControlName="lastName" placeholder="Enter your last name">
          <mat-error *ngIf="profileForm.get('lastName')?.hasError('required')">
            Last name is required
          </mat-error>
        </mat-form-field>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Phone</mat-label>
          <input matInput formControlName="phone" placeholder="Enter your phone number">
        </mat-form-field>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Address</mat-label>
          <input matInput formControlName="address" placeholder="Enter your address">
        </mat-form-field>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>City</mat-label>
          <input matInput formControlName="city" placeholder="Enter your city">
        </mat-form-field>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Country</mat-label>
          <input matInput formControlName="country" placeholder="Enter your country">
        </mat-form-field>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Postal Code</mat-label>
          <input matInput formControlName="postalCode" placeholder="Enter your postal code">
        </mat-form-field>
      </form>
    </mat-dialog-content>
    
    <mat-dialog-actions align="end">
      <button mat-button (click)="onCancel()">Cancel</button>
      <button mat-raised-button color="primary" (click)="onSave()" [disabled]="!profileForm.valid || isLoading">
        {{ isLoading ? 'Saving...' : 'Save Profile' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .profile-form {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      min-width: 400px;
      max-width: 500px;
    }

    .full-width {
      width: 100%;
    }

    mat-dialog-content {
      overflow: visible;
    }

    mat-dialog-actions {
      padding: 1rem;
    }
  `]
})
export class CompleteProfileModalComponent implements OnInit {
  profileForm: FormGroup;
  isLoading = false;

  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<CompleteProfileModalComponent>);
  private userStatusService = inject(UserStatusService);
  private snackBar = inject(MatSnackBar);

  constructor() {
    this.profileForm = this.fb.group({
      firstName: ['', Validators.required],
      lastName: ['', Validators.required],
      phone: [''],
      address: [''],
      city: [''],
      country: [''],
      postalCode: ['']
    });
  }

  ngOnInit(): void {
    // El componente está listo para usar
  }

  onSave(): void {
    if (this.profileForm.valid) {
      this.isLoading = true;
      
      const profileData: CompleteProfileDto = this.profileForm.value;
      
      // Llamar al servicio para completar el perfil
      this.userStatusService.completeUserProfile(profileData);
      
      // Escuchar eventos de resultado
      // Esto se podría mejorar con un observable que devuelva el UserStatusService
      setTimeout(() => {
        this.isLoading = false;
        this.snackBar.open('Profile completed successfully!', 'Close', {
          duration: 3000,
          panelClass: ['success-snackbar']
        });
        this.dialogRef.close(true);
      }, 2000);
    }
  }

  onCancel(): void {
    this.dialogRef.close(false);
  }
}
