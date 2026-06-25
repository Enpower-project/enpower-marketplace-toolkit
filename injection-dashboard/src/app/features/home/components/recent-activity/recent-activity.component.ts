import { Component, Input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgClass } from '@angular/common';
import { FileIngestionEntry } from '../../../../core/models/file-ingestion-entry.interface';
import { EntryStatus } from '../../../../core/models/entry-status';

interface ActivityRow {
  eventType: string;
  resourceId: string;
  timestamp: string;
  status: EntryStatus;
}

@Component({
  selector: 'app-recent-activity',
  imports: [RouterLink, NgClass],
  templateUrl: './recent-activity.component.html',
  styleUrl: './recent-activity.component.css',
})
export class RecentActivityComponent {
  @Input() set entries(value: FileIngestionEntry[]) {
    this.rows = value
      .filter(e => !!e)
      .map(e => ({
        eventType: this.statusToEventType(e.status),
        resourceId: `#DFIM-${e.entryId}`,
        timestamp: this.getRelativeTime(e.updatedAt ?? e.entryCreationTimestamp),
        status: e.status,
      }))
      .sort((a, b) => this.sortByRecency(a.timestamp, b.timestamp));
  }

  rows: ActivityRow[] = [];

  private statusToEventType(status: EntryStatus): string {
    const map: Record<EntryStatus, string> = {
      [EntryStatus.NEW]: 'Entry Creation',
      [EntryStatus.TRANSLATED]: 'Schema Translation',
      [EntryStatus.ERROR]: 'Validation Error',
      [EntryStatus.SYNCHRONIZED]: 'Sync Completed',
    };
    return map[status] ?? status;
  }

  getRelativeTime(timestamp?: string): string {
    if (!timestamp) return '—';
    const diff = Date.now() - new Date(timestamp).getTime();
    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) return `${seconds} secs ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} mins ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hrs ago`;
    return `${Math.floor(hours / 24)} days ago`;
  }

  private sortByRecency(a: string, b: string): number {
    const toSeconds = (t: string): number => {
      const m = t.match(/^(\d+)\s+(secs?|mins?|hrs?|days?)/);
      if (!m) return 0;
      const n = parseInt(m[1]);
      if (m[2].startsWith('sec')) return n;
      if (m[2].startsWith('min')) return n * 60;
      if (m[2].startsWith('hr')) return n * 3600;
      return n * 86400;
    };
    return toSeconds(a) - toSeconds(b);
  }
}
