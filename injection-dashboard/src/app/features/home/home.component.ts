import { Component, effect, inject, signal } from '@angular/core';
import { forkJoin } from 'rxjs';
import { FileIngestionEntriesService } from '../../core/services/file-ingestion-entries.service';
import { RefreshService } from '../../core/services/refresh.service';
import { FileIngestionEntry } from '../../core/models/file-ingestion-entry.interface';
import { HateoasCollection } from '../../core/models/hateoas.interface';
import { StatCardComponent } from './components/stat-card/stat-card.component';
import { AttentionRequiredComponent } from './components/attention-required/attention-required.component';
import { RecentActivityComponent } from './components/recent-activity/recent-activity.component';
import { OfferingPerformanceComponent, OfferingStats } from './components/offering-performance/offering-performance.component';

@Component({
  selector: 'app-home',
  imports: [StatCardComponent, AttentionRequiredComponent, RecentActivityComponent, OfferingPerformanceComponent],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css',
})
export class HomeComponent {
  private entriesService = inject(FileIngestionEntriesService);
  private refreshService = inject(RefreshService);

  totalCount = signal<number | null>(null);
  newCount = signal<number | null>(null);
  synchronizedCount = signal<number | null>(null);
  errorCount = signal<number | null>(null);
  translatedCount = signal<number | null>(null);

  isLoading = signal(false);

  oldestNew = signal<FileIngestionEntry | null>(null);
  oldestTranslated = signal<FileIngestionEntry | null>(null);

  recentEntries = signal<FileIngestionEntry[]>([]);
  offerings = signal<OfferingStats[]>([]);

  constructor() {
    effect(() => {
      this.refreshService.refreshTrigger();
      this.loadAll();
    });
  }

  private loadAll(): void {
    this.isLoading.set(true);
    this.loadStats();
    this.loadAttentionRequired();
    this.loadOfferingPerformance();
  }

  private loadStats(): void {
    forkJoin({
      total: this.entriesService.searchByFilters(0, 1),
      newest: this.entriesService.searchByFilters(0, 1, undefined, 'NEW', undefined, undefined, 'entryCreationTimestamp', 'desc'),
      synchronized: this.entriesService.searchByFilters(0, 1, undefined, 'SYNCHRONIZED', undefined, undefined, 'entryCreationTimestamp', 'desc'),
      errored: this.entriesService.searchByFilters(0, 1, undefined, 'ERROR', undefined, undefined, 'entryCreationTimestamp', 'desc'),
      translated: this.entriesService.searchByFilters(0, 1, undefined, 'TRANSLATED', undefined, undefined, 'entryCreationTimestamp', 'desc'),
    }).subscribe({
      next: ({ total, newest, synchronized, errored, translated }) => {
        this.totalCount.set(total.page?.totalElements ?? 0);
        this.newCount.set(newest.page?.totalElements ?? 0);
        this.synchronizedCount.set(synchronized.page?.totalElements ?? 0);
        this.errorCount.set(errored.page?.totalElements ?? 0);
        this.translatedCount.set(translated.page?.totalElements ?? 0);

        const recent: FileIngestionEntry[] = [];
        const firstEntry = (col: HateoasCollection<FileIngestionEntry>): FileIngestionEntry | null =>
          this.entriesService.extractItems(col, 'file-ingestion-entries')[0] ?? null;

        const latestNew = firstEntry(newest);
        const latestSync = firstEntry(synchronized);
        const latestError = firstEntry(errored);
        const latestTranslated = firstEntry(translated);

        if (latestNew) recent.push(latestNew);
        if (latestSync) recent.push(latestSync);
        if (latestError) recent.push(latestError);
        if (latestTranslated) recent.push(latestTranslated);

        this.recentEntries.set(recent);
      },
      error: (err) => console.error('Stats load error', err),
    });
  }

  private loadAttentionRequired(): void {
    forkJoin({
      oldestNew: this.entriesService.searchByFilters(0, 1, undefined, 'NEW', undefined, undefined, 'entryCreationTimestamp', 'asc'),
      oldestTranslated: this.entriesService.searchByFilters(0, 1, undefined, 'TRANSLATED', undefined, undefined, 'entryCreationTimestamp', 'asc'),
    }).subscribe({
      next: ({ oldestNew, oldestTranslated }) => {
        const firstEntry = (col: HateoasCollection<FileIngestionEntry>): FileIngestionEntry | null =>
          this.entriesService.extractItems(col, 'file-ingestion-entries')[0] ?? null;
        this.oldestNew.set(firstEntry(oldestNew));
        this.oldestTranslated.set(firstEntry(oldestTranslated));
      },
      error: (err) => console.error('Attention required load error', err),
    });
  }

  private loadOfferingPerformance(): void {
    this.entriesService.searchByFilters(0, 100, undefined, undefined, undefined, undefined, 'entryCreationTimestamp', 'desc')
      .subscribe({
        next: (collection) => {
          const entries = this.entriesService.extractItems(collection, 'file-ingestion-entries');
          const total = collection.page?.totalElements ?? entries.length;

          const map = new Map<string, { total: number; errors: number }>();
          for (const entry of entries) {
            const name = entry.offeringName ?? 'Unknown';
            const existing = map.get(name) ?? { total: 0, errors: 0 };
            existing.total++;
            if (entry.status === 'ERROR') existing.errors++;
            map.set(name, existing);
          }

          const stats: OfferingStats[] = Array.from(map.entries())
            .map(([name, data]) => ({ name, ...data }))
            .sort((a, b) => b.total - a.total);

          this.offerings.set(stats);
          this.isLoading.set(false);
        },
        error: (err) => console.error('Offering performance load error', err),
      });
      
  }
}
