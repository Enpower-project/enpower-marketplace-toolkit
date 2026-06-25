import { Component, Inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { InvitationService } from '../../../core/services/invitation/invitation.service';
import { UserRole, SendInvitationRequest } from '../../models/invitation.model';
import { TranslateModule } from '@ngx-translate/core';
import { ToastNotificationComponent } from '../toast-notification/toast-notification.component';
import { ConfirmationDialogComponent, ConfirmationDialogData, ConfirmationDialogResult } from '../confirmation-dialog/confirmation-dialog.component';
import { debounceTime, distinctUntilChanged, Subject, takeUntil } from 'rxjs';

export interface InviteUserDialogData {
  marketId: string;
  marketName: string;
  hasFRP: boolean; // Whether market already has an FRP
}

@Component({
  selector: 'app-invite-user-modal',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatIconModule,
    TranslateModule
  ],
  templateUrl: './invite-user-modal.component.html',
  styleUrl: './invite-user-modal.component.css'
})
export class InviteUserModalComponent implements OnInit, OnDestroy {
  inviteForm: FormGroup;
  loading = false;
  isInitializing = true; // Loader inicial
  selectedRole: UserRole | null = null;
  roleSelectionAttempted = false;
  removingFRP = false;
  
  // User access check
  checkingUserAccess = false;
  userAlreadyHasAccess = false;
  userAccessMessage = '';
  
  private destroy$ = new Subject<void>();

  // Make UserRole enum available in template
  UserRole = UserRole;

  // Available roles for invitation
  availableRoles: { value: UserRole; label: string; disabled: boolean }[] = [];

  constructor(
    private fb: FormBuilder,
    private invitationService: InvitationService,
    public dialogRef: MatDialogRef<InviteUserModalComponent>,
    private dialog: MatDialog,
    @Inject(MAT_DIALOG_DATA) public data: InviteUserDialogData
  ) {
    // Setup available roles
    this.availableRoles = [
      {
        value: UserRole.FRP,
        label: 'FRP (Flexibility Requesting Party)',
        disabled: data.hasFRP // Disable FRP if market already has one
      },
      {
        value: UserRole.FSP,
        label: 'FSP (Flexibility Service Provider)',
        disabled: false
      }
    ];

    this.inviteForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]]
    });
  }

  ngOnInit(): void {
    // Simular carga inicial del modal durante 2 segundos
    setTimeout(() => {
      this.isInitializing = false;
    }, 2000);

    // Subscribe to email changes to check if user already has access
    this.inviteForm.get('email')?.valueChanges
      .pipe(
        debounceTime(500),
        distinctUntilChanged(),
        takeUntil(this.destroy$)
      )
      .subscribe(email => {
        this.checkUserAccess(email);
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Check if the user already has access to this market
   */
  checkUserAccess(email: string): void {
    // Reset state
    this.userAlreadyHasAccess = false;
    this.userAccessMessage = '';

    // Validate email format first
    if (!email || !this.inviteForm.get('email')?.valid) {
      return;
    }

    this.checkingUserAccess = true;
    this.invitationService.checkUserMarketAccess(this.data.marketId, email)
      .subscribe({
        next: (response) => {
          this.checkingUserAccess = false;
          
          if (response.hasAccess) {
            this.userAlreadyHasAccess = true;
            this.userAccessMessage = `This user already has access to ${this.data.marketName}`;
          } else if (response.userExists) {
            this.userAlreadyHasAccess = false;
            this.userAccessMessage = `User will be granted access to ${this.data.marketName}`;
          } else {
            this.userAlreadyHasAccess = false;
            this.userAccessMessage = '';
          }
        },
        error: (error) => {
          this.checkingUserAccess = false;
        }
      });
  }

  get email() {
    return this.inviteForm.get('email');
  }

  selectRole(role: UserRole): void {
    this.selectedRole = role;
    this.roleSelectionAttempted = true;
  }

  onSubmit(): void {
    this.roleSelectionAttempted = true;

    // Validate role selection
    if (!this.selectedRole) {
      return;
    }

    // Block submission if user already has access
    if (this.userAlreadyHasAccess) {
      ToastNotificationComponent.show(
        `Cannot send invitation: ${this.userAccessMessage}`,
        'error'
      );
      return;
    }

    if (this.inviteForm.valid) {
      this.loading = true;

      const request: SendInvitationRequest = {
        email: this.inviteForm.value.email,
        role: this.selectedRole,
        marketId: this.data.marketId
      };

      this.invitationService.sendInvitation(request).subscribe({
        next: (response) => {
          this.loading = false;
          ToastNotificationComponent.show(response.message || 'Invitation sent successfully!', 'success');
          this.dialogRef.close({ success: true, invitation: response.data });
        },
        error: (error) => {
          this.loading = false;
          
          // Extract error message from different possible error formats (RFC7807 and others)
          const errorContent = error.error?.detail || 
                               error.error?.errors?.[0]?.message || 
                               error.error?.message || 
                               error.error?.error || 
                               error.message || 
                               '';
          
          let errorMessage: string;
          
          // Check specific error types based on message content
          if (errorContent.toLowerCase().includes('pending invitation')) {
            errorMessage = 'This user already has a pending invitation for this market';
          } else if (errorContent.toLowerCase().includes('already has an frp') || 
                     (error.status === 409 && errorContent.toLowerCase().includes('frp'))) {
            errorMessage = 'This market already has an FRP assigned';
          } else if (errorContent.toLowerCase().includes('already has market access') ||
                     errorContent.toLowerCase().includes('already has access')) {
            errorMessage = 'This user already has access to this market';
          } else if (error.status === 409) {
            // Generic 409 conflict - use the actual error message
            errorMessage = errorContent || 'A conflict occurred. Please check the details and try again.';
          } else {
            errorMessage = errorContent || 'Failed to send invitation';
          }
          
          ToastNotificationComponent.show(errorMessage, 'error');
        }
      });
    }
  }

  onCancel(): void {
    this.dialogRef.close({ success: false });
  }

  removeFRP(): void {
    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      width: '420px',
      data: {
        title: 'Remove FRP from Market',
        message: 'Are you sure you want to remove the FRP from this market? You can invite a new FRP afterwards.',
        confirmText: 'Remove',
        cancelText: 'Cancel',
        type: 'warning'
      } as ConfirmationDialogData
    });

    dialogRef.afterClosed().subscribe((result: ConfirmationDialogResult) => {
      if (!result?.confirmed) return;

      this.removingFRP = true;
      this.invitationService.removeFRPFromMarket(this.data.marketId).subscribe({
        next: (response) => {
          this.removingFRP = false;
          this.data.hasFRP = false;
          ToastNotificationComponent.show(
            response.message || 'FRP removed successfully. You can now invite a new FRP.',
            'success'
          );
        },
        error: (error) => {
          this.removingFRP = false;
          ToastNotificationComponent.show(
            error.error?.message || error.error?.error || 'Failed to remove FRP from market',
            'error'
          );
        }
      });
    });
  }
}
