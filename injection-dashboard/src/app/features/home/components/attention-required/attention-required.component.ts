import { Component, Input } from '@angular/core';
import { Router } from '@angular/router';
import { FileIngestionEntry } from '../../../../core/models/file-ingestion-entry.interface';

@Component({
  selector: 'app-attention-required',
  imports: [],
  templateUrl: './attention-required.component.html',
  styleUrl: './attention-required.component.css',
})
export class AttentionRequiredComponent {
  @Input() oldestNew: FileIngestionEntry | null = null;
  @Input() oldestTranslated: FileIngestionEntry | null = null;
  @Input() newCount: number = 0;
  @Input() errorCount: number = 0;
  @Input() translatedCount: number = 0;

  constructor(private router: Router) {}

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

  navigateWithFilter(status: string): void {
    this.router.navigate(['/archives'], { queryParams: { status } });
  }
}
