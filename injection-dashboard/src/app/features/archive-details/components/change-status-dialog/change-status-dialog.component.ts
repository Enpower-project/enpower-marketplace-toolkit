import { Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { FormsModule } from '@angular/forms';
import { StatusBadgePipe } from '../../../archive/pipes/statusBadge-pipe';
import { NgClass } from '@angular/common';
import { MatTooltip } from "@angular/material/tooltip";

@Component({
  selector: 'app-change-status-dialog',
  standalone: true,
  imports: [MatDialogModule, FormsModule, StatusBadgePipe, NgClass, MatTooltip],
  templateUrl: './change-status-dialog.component.html',
  styleUrl: './change-status-dialog.component.css'
})
export class ChangeStatusDialogComponent {
  dialogRef = inject(MatDialogRef<ChangeStatusDialogComponent>);
  data = inject(MAT_DIALOG_DATA);

  readonly availableStatuses = ['NEW', 'TRANSLATED', 'SYNCHRONIZED', 'ERROR'];

  selectedStatus: string = this.data.status;
  message: string = '';

  get isValid(): boolean {
    return this.selectedStatus !== this.data.status && this.message != '';
  }

  onCancel(): void {
    this.dialogRef.close(null);
  }

  onConfirm(): void {
    if (this.isValid) {
      this.dialogRef.close({
        newStatus: this.selectedStatus,
        message: this.message || `Status manually changed to ${this.selectedStatus}`,
        changedBy: 'MANUAL',
        source: 'UI'
      });
    }
  }
}