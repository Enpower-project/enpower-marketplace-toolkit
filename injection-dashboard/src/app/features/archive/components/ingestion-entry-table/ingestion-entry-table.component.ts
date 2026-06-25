import { Component, EventEmitter, Input, Output } from '@angular/core';
import { MatTableModule } from '@angular/material/table';
import { FileIngestionEntry } from '../../../../core/models/file-ingestion-entry.interface';
import { DatePipe, NgClass} from '@angular/common';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSortModule, Sort, SortDirection } from '@angular/material/sort';
import { MatIcon } from '@angular/material/icon';
import { RouterLinkActive, RouterLink } from "@angular/router";

@Component({
  selector: 'app-ingestion-entry-table',
  imports: [MatTableModule, DatePipe, NgClass, MatPaginatorModule, MatSortModule, MatIcon, RouterLink],
  templateUrl: './ingestion-entry-table.component.html',
  styleUrl: './ingestion-entry-table.component.css',
})
export class IngestionEntryTableComponent {
  @Input() displayedColumns! : string[];
  @Input() dataSource! : FileIngestionEntry[];
  @Input() isLoading! : boolean;
  @Input() pageSize! : number;
  @Input() pageIndex! : number;
  @Input() totalElements! : number;
  @Input() activeSortField: string = '';
  @Input() activeSortDirection: SortDirection = '';
  @Output() pageChange = new EventEmitter<PageEvent>();
  @Output() sortChange = new EventEmitter<Sort>();

  onPageChange(event: PageEvent): void {
    this.pageChange.emit(event);
  }

  onSortChange(sort: Sort): void {
    this.sortChange.emit(sort);
  }
}
