import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { InvitationService } from '../../../core/services/invitation/invitation.service';
import { InvitationDetails, AcceptInvitationRequest } from '../../models/invitation.model';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-accept-invitation',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatIconModule,
    TranslateModule
  ],
  templateUrl: './accept-invitation.component.html',
  styleUrl: './accept-invitation.component.css'
})
export class AcceptInvitationComponent implements OnInit {
  invitationToken: string = '';
  invitation: InvitationDetails | null = null;
  acceptForm: FormGroup;
  loading = false;
  loadingInvitation = true;
  errorMessage = '';
  successMessage = '';
  invitationError = false;
  userExists = false; // Track if user already exists

  hidePassword = true;
  hideConfirmPassword = true;

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private invitationService: InvitationService
  ) {
    this.acceptForm = this.fb.group({
      username: ['', [Validators.required, Validators.minLength(3), Validators.pattern(/^[a-zA-Z0-9_-]+$/)]],
      firstName: ['', [Validators.required, Validators.minLength(2)]],
      lastName: ['', [Validators.required, Validators.minLength(2)]],
      password: ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', [Validators.required]]
    });

    // Add custom validator to confirmPassword field
    this.acceptForm.get('confirmPassword')?.setValidators([
      Validators.required,
      this.matchPassword.bind(this)
    ]);

    // Revalidate confirmPassword when password changes
    this.acceptForm.get('password')?.valueChanges.subscribe(() => {
      this.acceptForm.get('confirmPassword')?.updateValueAndValidity();
    });
  }

  // Custom validator to check if passwords match
  matchPassword(control: any) {
    const password = this.acceptForm?.get('password')?.value;
    const confirmPassword = control.value;
    
    if (!confirmPassword) {
      return null; // Don't validate if empty (required validator will handle this)
    }
    
    if (password !== confirmPassword) {
      return { passwordMismatch: true };
    }
    
    return null;
  }

  goToHome(): void {
    this.router.navigate(['/']);
  }

  ngOnInit(): void {
    this.invitationToken = this.route.snapshot.paramMap.get('token') || '';
    if (this.invitationToken) {
      this.loadInvitation();
    } else {
      this.invitationError = true;
      this.loadingInvitation = false;
      this.errorMessage = 'Invalid invitation link';
    }
  }

  loadInvitation(): void {
    this.loadingInvitation = true;
    this.invitationService.getInvitationByToken(this.invitationToken).subscribe({
      next: (response) => {
        this.invitation = response.data;
        this.loadingInvitation = false;
        this.userExists = response.data.userExists || false;

        if (!this.invitation.isValid) {
          this.invitationError = true;
          this.errorMessage = this.invitation.isExpired
            ? 'This invitation has expired'
            : 'This invitation is no longer valid';
        }
      },
      error: (error) => {
        this.loadingInvitation = false;
        this.invitationError = true;
        this.errorMessage = error.error?.message || 'Failed to load invitation details';
      }
    });
  }

  get username() {
    return this.acceptForm.get('username');
  }

  get firstName() {
    return this.acceptForm.get('firstName');
  }

  get lastName() {
    return this.acceptForm.get('lastName');
  }

  get password() {
    return this.acceptForm.get('password');
  }

  get confirmPassword() {
    return this.acceptForm.get('confirmPassword');
  }

  onSubmit(): void {
    // Debug: log form state
    if (!this.invitation) return;

    // If user exists, we don't need the form
    if (this.userExists || this.acceptForm.valid) {
      this.loading = true;
      this.errorMessage = '';
      this.successMessage = '';

      const request: AcceptInvitationRequest = this.userExists 
        ? {} // Empty object for existing users
        : {
            username: this.acceptForm.value.username,
            firstName: this.acceptForm.value.firstName,
            lastName: this.acceptForm.value.lastName,
            password: this.acceptForm.value.password
          };

      this.invitationService.acceptInvitation(this.invitationToken, request).subscribe({
        next: (response) => {
          this.loading = false;
          this.successMessage = response.message;

          // Redirect to login after 3 seconds without query params
          setTimeout(() => {
            this.router.navigate(['/login']);
          }, 3000);
        },
        error: (error) => {
          this.loading = false;
          // Mostrar directamente lo que viene del backend
          let errorMsg = 'Failed to accept invitation';
          
          // Intenta múltiples formas de extraer el mensaje
          if (error.error?.message) {
            errorMsg = error.error.message;
          } else if (error.error?.error) {
            errorMsg = error.error.error;
          } else if (error.error?.detail) {
            errorMsg = error.error.detail;
          } else if (typeof error.error === 'object' && error.error?.errors) {
            // Podría ser un objeto con errors
            errorMsg = Object.values(error.error.errors)[0] as string || errorMsg;
          }if (!this.userExists) {
      // Mark all fields as touched to show validation errors (only for new users)
          } else if (error.statusText) {
            errorMsg = error.statusText;
          }
          this.errorMessage = errorMsg;
        }
      });
    } else {
      // Mark all fields as touched to show validation errors
      Object.keys(this.acceptForm.controls).forEach(key => {
        const control = this.acceptForm.get(key);
        control?.markAsTouched();
      });
    }
  }
}
