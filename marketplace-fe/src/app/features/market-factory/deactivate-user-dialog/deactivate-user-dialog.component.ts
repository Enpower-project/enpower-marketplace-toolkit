import { Component, Inject } from '@angular/core';
import { MatDialogTitle, MatDialogContent, MatDialogRef, MatDialogModule, MAT_DIALOG_DATA } from "@angular/material/dialog";
import { MatIcon } from "@angular/material/icon";
import { MatButton } from "@angular/material/button";
import { UserStatusService } from '../../../core/services/auth/user-status.service';

export interface DeactivateUserDialogData {
  userId: string,
  username: string
}

@Component({
  selector: 'app-deactivate-user-dialog',
  imports: [MatDialogModule, MatDialogTitle, MatDialogContent, MatIcon, MatButton],
  templateUrl: './deactivate-user-dialog.component.html',
  styleUrl: './deactivate-user-dialog.component.css',
})
export class DeactivateUserDialogComponent {

  constructor(
    public dialogRef: MatDialogRef<DeactivateUserDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: DeactivateUserDialogData,
    public userStatusService: UserStatusService
  ) { }

  close(): void {
    this.dialogRef.close();
  }

  deactivateUser() {
    this.userStatusService.deactivateUser(this.data.userId).subscribe({
      next: () => {
        console.log('User sucessfully deactivated!');
        this.dialogRef.close(true);
      },
      error: (err) => {
        console.error('Failed to deactivate user', err);
      }
    })
  }
}
