import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogContent, MatDialogActions } from '@angular/material/dialog';
import { DeactivateUserDialogData } from '../deactivate-user-dialog/deactivate-user-dialog.component';
import { UserStatusService } from '../../../core/services/auth/user-status.service';
import { MatIcon } from "@angular/material/icon";

@Component({
  selector: 'app-reactivate-user-dialog',
  imports: [MatIcon, MatDialogContent, MatDialogActions],
  templateUrl: './reactivate-user-dialog.component.html',
  styleUrl: './reactivate-user-dialog.component.css',
})
export class ReactivateUserDialogComponent {

  constructor(
    public dialogRef: MatDialogRef<ReactivateUserDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: DeactivateUserDialogData,
    public userStatusService: UserStatusService
  ) {

  }

  close(): void {
    this.dialogRef.close();
  }

  reactivateUser() {
    this.userStatusService.reactivateUser(this.data.userId).subscribe({
      next: () => {
        console.log('User sucessfully reactivated!');
        this.dialogRef.close(true);
      },
      error: (err) => {
        console.error('Failed to reactivate user', err);
      }
    })
  }

}
