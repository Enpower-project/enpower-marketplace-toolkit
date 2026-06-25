import { Component, EventEmitter, inject, Input, Output } from '@angular/core';
import { FileIngestionEntry } from '../../../../core/models/file-ingestion-entry.interface';
import { StatusHistoryItem } from '../../../../core/models/status-history-item.interface';
import { DatePipe } from '@angular/common';
import { StatusHistoryItemsListComponent } from "../status-history-items-list/status-history-items-list.component";
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { ChangeStatusDialogComponent } from '../change-status-dialog/change-status-dialog.component';
import { UpdateStatusRequest } from '../../../../core/models/update-status-request.interface';

@Component({
  selector: 'app-archive-details-body',
  imports: [DatePipe, StatusHistoryItemsListComponent, MatDialogModule],
  templateUrl: './archive-details-body.component.html',
  styleUrl: './archive-details-body.component.css',
})
export class ArchiveDetailsBodyComponent {
  @Input() entry!: FileIngestionEntry;
  @Input() statusHistoryItems!: StatusHistoryItem[];
  @Output() statusChanged = new EventEmitter<UpdateStatusRequest>();

  dialog = inject(MatDialog);

  onChangeStatus() {
    const dialogRef = this.dialog.open(ChangeStatusDialogComponent, {
      width: '30em',
      data: { status: this.entry?.status }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.statusChanged.emit(result);
      }
    });
  }
}
