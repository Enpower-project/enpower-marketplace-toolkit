import { Component, effect, inject, signal } from '@angular/core';
import { IngestionEntryTableComponent } from "./components/ingestion-entry-table/ingestion-entry-table.component";
import { FileIngestionEntriesService } from '../../core/services/file-ingestion-entries.service';
import { RefreshService } from '../../core/services/refresh.service';
import { FileIngestionEntry } from '../../core/models/file-ingestion-entry.interface';
import { PageEvent } from '@angular/material/paginator';
import { IngestionFilterComponent } from "./components/ingestion-filter/ingestion-filter.component";
import { EntryStatus } from '../../core/models/entry-status';
import { Subject, takeUntil } from 'rxjs';
import { Sort } from '@angular/material/sort';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-archive',
  imports: [IngestionEntryTableComponent, IngestionFilterComponent],
  templateUrl: './archive.component.html',
  styleUrl: './archive.component.css',
})
export class ArchiveComponent {
  entriesService = inject(FileIngestionEntriesService)
  refreshService = inject(RefreshService)
  private route = inject(ActivatedRoute)

  loading = signal(true);
  entries = signal<FileIngestionEntry[]>([]);
  pageSize = signal(20);
  pageIndex = signal(0);
  totalElements = signal(0);

  private destroy$ = new Subject<void>();

  sortField = signal<string>('');
  sortDirection = signal<'asc' | 'desc'>('desc');

  searchTerm = signal<string>('')
  selectedStatus = signal<string | undefined>(undefined)
  dateRangeFilter = signal<{ fromDate: string; toDate: string }>({ fromDate: '', toDate: '' });

  displayedColumns: string[] = ["entryId", "offeringName", "originalFileName", "entryCreationTimestamp", "status", "actions"]

  constructor() {
    const statusParam = this.route.snapshot.queryParamMap.get('status');
    if (statusParam) {
      this.selectedStatus.set(statusParam.toUpperCase());
    }

    effect(() => {
      this.refreshService.refreshTrigger();
      this.loadFilteredEntries();
    })

    effect(() => {
      this.refreshService.refreshTrigger();
      this.loading.set(true);
      this.entriesService.getAll(this.pageIndex(), this.pageSize())
        .subscribe({
          next: (collection) => {
            this.entries.set(this.entriesService.extractItems(collection, 'file-ingestion-entries'));
            this.totalElements.set(collection.page?.totalElements || 0);
            this.loading.set(false);
          },
          error: (err) => {
            console.error(err);
            this.loading.set(false);
          }
        });
    });
  }

  onPageChange(event: PageEvent): void {
    this.pageIndex.set(event.pageIndex);
    this.pageSize.set(event.pageSize);
  }

  onDateRangeChange(dateRange: { fromDate: string; toDate: string }): void {
    this.dateRangeFilter.set(dateRange);
    this.pageIndex.set(0);
    this.loadFilteredEntries();
  }

  onSortChange(sort: Sort): void {
  if (!sort.direction) {
    this.sortField.set('');
    this.sortDirection.set('desc');
  } else {
    this.sortField.set(sort.active);
    this.sortDirection.set(sort.direction);
  }
  this.pageIndex.set(0);
  this.loadFilteredEntries();
}

  onStatusChange(status: string | undefined): void {
    this.selectedStatus.set(status);
    this.pageIndex.set(0);
    this.loadFilteredEntries();
  }

  onSearchTermsChange(filename: string): void {
    this.searchTerm.set(filename);
    this.pageIndex.set(0);
    this.loadFilteredEntries();
  }

  loadFilteredEntries(): void {
    this.loading.set(true);

    this.entriesService
      .searchByFilters(
        this.pageIndex(),
        this.pageSize(),
        this.searchTerm() || undefined,
        this.selectedStatus() || undefined,
        this.dateRangeFilter().fromDate || undefined,
        this.dateRangeFilter().toDate || undefined,
        this.sortField(),
        this.sortDirection()
      )
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (collection) => {
          this.entries.set(
            this.entriesService.extractItems(collection, 'file-ingestion-entries')
          );
          this.totalElements.set(collection.page?.totalElements || 0);
          this.loading.set(false);
        },
        error: (err) => {
          console.error(err);
          this.loading.set(false);
        }
      });
  }
}
