import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { UserService } from '../../../core/services/user.service';
import { ToastNotificationComponent } from '../toast-notification/toast-notification.component';

export interface UploadFlexibilityDialogData {
  fspId: string;
  fspName: string;
  marketId: string;
}

@Component({
  selector: 'app-upload-flexibility-modal',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatIconModule,
  ],
  templateUrl: './upload-flexibility-modal.component.html',
  styleUrl: './upload-flexibility-modal.component.css',
})
export class UploadFlexibilityModalComponent {
  selectedFile: File | null = null;
  isUploading = false;
  result: { pilotType: string; days: number; message: string } | null = null;
  errorMessage: string | null = null;

  constructor(
    public dialogRef: MatDialogRef<UploadFlexibilityModalComponent>,
    @Inject(MAT_DIALOG_DATA) public data: UploadFlexibilityDialogData,
    private readonly userService: UserService,
  ) {}

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      this.selectedFile = input.files[0];
      this.errorMessage = null;
      this.result = null;
    }
  }

  upload(): void {
    if (!this.selectedFile) return;

    this.isUploading = true;
    this.errorMessage = null;
    this.result = null;

    this.userService
      .uploadFlexibilityData(this.selectedFile, this.data.fspId, this.data.marketId)
      .subscribe({
        next: (res: any) => {
          this.isUploading = false;
          this.result = res;
          ToastNotificationComponent.show(
            `${res.days} days of ${res.pilotType} pilot data loaded successfully`,
            'success',
          );
        },
        error: (err: any) => {
          this.isUploading = false;
          this.errorMessage =
            err?.error?.message ?? err?.message ?? 'Upload failed. Please check the file format.';
          ToastNotificationComponent.show(this.errorMessage ?? 'Upload failed', 'error');
        },
      });
  }

  close(): void {
    this.dialogRef.close(this.result !== null);
  }
}
