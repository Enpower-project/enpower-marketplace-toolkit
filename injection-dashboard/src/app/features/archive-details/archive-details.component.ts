import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FileIngestionEntry } from '../../core/models/file-ingestion-entry.interface';
import { FileIngestionEntriesService } from '../../core/services/file-ingestion-entries.service';
import { NgClass } from '@angular/common';
import { StatusBadgePipe } from '../archive/pipes/statusBadge-pipe';
import { MatTooltip, MatTooltipModule } from '@angular/material/tooltip';
import { ArchiveDetailsBodyComponent } from "./components/archive-details-body/archive-details-body.component";
import { StatusHistoryItem } from '../../core/models/status-history-item.interface';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { ConfirmDeleteDialogComponent } from './components/confirm-delete-dialog/confirm-delete-dialog.component';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ChangeStatusDialogComponent } from './components/change-status-dialog/change-status-dialog.component';
import { UpdateStatusRequest } from '../../core/models/update-status-request.interface';


@Component({
  selector: 'app-archive-details',
  imports: [NgClass, StatusBadgePipe, MatTooltipModule, MatDialogModule, ArchiveDetailsBodyComponent, MatSnackBarModule],
  templateUrl: './archive-details.component.html',
  styleUrl: './archive-details.component.css',
})
export class ArchiveDetailsComponent {
  route = inject(ActivatedRoute)
  router = inject(Router)
  entryService = inject(FileIngestionEntriesService)
  snackBar = inject(MatSnackBar)

  dialog = inject(MatDialog)
  isLoading = signal(false)
  entry = signal<FileIngestionEntry | undefined>(undefined)
  statusHistoryItems = signal<StatusHistoryItem[]>([])
  entryId = signal('')

  constructor() {
    this.entryId.set(this.route.snapshot.params['entryId'])
    this.loadEntry();
  }

  loadEntry() {
    this.isLoading.set(true);
    this.entryService.getById(this.entryId()).subscribe({
      next: (response) => {
        this.entry.set(response)
        this.getStatusHistoryItems()
      },
      error: (error) => {
        console.log('There was an error getting the entry: ' + error);
      }
    })
  }

  getStatusHistoryItems() {
  this.entryService.getStatusHistoryItemsFromUrl(this.entry()?._links!['statusHistoryItems'].href!).subscribe({
    next: (response) => {
      const sorted = [...response].sort((a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
      this.statusHistoryItems.set(sorted);
      this.isLoading.set(false);
    },
    error: (error) => {
      console.log('There was an error getting the history items: ' + error);
    }
  })
}

  private extractFileName(contentDisposition: string | null, fallback: string): string {
    if (!contentDisposition) return fallback;
    const match = contentDisposition.split('filename=')[1]?.replace(/"/g, '').trim();
    return match ?? fallback;
  }

  private triggerDownload(blob: Blob, fileName: string): void {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    window.URL.revokeObjectURL(url);
  }

  onDownloadTranslated(): void {
    this.entryService.downloadTranslatedFile(this.entryId()).subscribe({
      next: (response) => {
        const fileName = this.extractFileName(
          response.headers.get('Content-Disposition'),
          'translated_file.csv'
        );
        this.triggerDownload(response.body!, fileName);
      },
      error: () => {
        this.snackBar.open('The translated file could not be downloaded', 'Close', {
          duration: 3000,
          panelClass: ['snack-error']
        });
      }
    });
  }

  onDownloadOriginal(): void {
    this.entryService.downloadOriginalFile(this.entryId()).subscribe({
      next: (response) => {
        const fileName = this.extractFileName(
          response.headers.get('Content-Disposition'),
          'original_file.csv'
        );
        this.triggerDownload(response.body!, fileName);
      },
      error: () => {
        this.snackBar.open('The original file could not be downloaded', 'Close', {
          duration: 3000,
          panelClass: ['snack-error']
        });
      }
    });
  }

  onDelete() {
    const dialogRef = this.dialog.open(ConfirmDeleteDialogComponent, {
      width: '30em',
      data: { entryId: this.entryId() }
    })

    dialogRef.afterClosed().subscribe(confirmed => {
      if (confirmed) {
        this.entryService.delete(this.entryId()).subscribe({
          next: () => {
            this.snackBar.open('Entry deleted successfully', 'Close', {
              duration: 3000,
              panelClass: ['snack-success']
            });
            this.router.navigate(['/archives'])
          },
          error: (err) => {
            this.snackBar.open('Failed to delete entry. Please try again.', 'Close', {
              duration: 4000,
              panelClass: ['snack-error']
            });
            console.error('Delete failed', err)
          }
        })
      }
    })
  }

  onStatusChanged(request: UpdateStatusRequest): void {
    this.entryService.updateStatus(this.entryId(), request).subscribe({
      next: (updated) => {
        this.entry.set(updated);
        this.loadEntry();
        this.snackBar.open('Status updated successfully', 'Close', {
          duration: 3000,
          panelClass: ['snack-success']
        });
      },
      error: () => {
        this.snackBar.open('Failed to update status', 'Close', {
          duration: 3000,
          panelClass: ['snack-error']
        });
      }
    });
  }

}
