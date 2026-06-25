import { Component, inject, Input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';

@Component({
  selector: 'app-confirm-delete-dialog',
  imports: [MatDialogModule, MatButtonModule, FormsModule],
  templateUrl: './confirm-delete-dialog.component.html',
  styleUrl: './confirm-delete-dialog.component.css',
})
export class ConfirmDeleteDialogComponent { 
  dialogRef = inject(MatDialogRef<ConfirmDeleteDialogComponent>);
  data = inject(MAT_DIALOG_DATA);

  confirmationText = signal('');

  get isConfirmed(): boolean {
    return this.confirmationText() === 'DELETE';
  }

  onCancel(): void {
    this.dialogRef.close(false);
  }

  onConfirm(): void {
    if (this.isConfirmed) this.dialogRef.close(true);
  }
}
