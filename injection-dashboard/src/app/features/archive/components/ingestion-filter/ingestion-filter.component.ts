import { Component, EventEmitter, Input, OnDestroy, OnInit, Output, signal } from '@angular/core';
import { EntryStatus } from '../../../../core/models/entry-status';
import { LowerCasePipe, NgClass } from '@angular/common';
import { A11yModule } from "@angular/cdk/a11y";
import { StatusBadgePipe } from '../../pipes/statusBadge-pipe';
import { debounceTime, distinctUntilChanged, Subject, takeUntil } from 'rxjs';

@Component({
  selector: 'app-ingestion-filter',
  imports: [LowerCasePipe, A11yModule, StatusBadgePipe, NgClass],
  templateUrl: './ingestion-filter.component.html',
  styleUrl: './ingestion-filter.component.css',
})
export class IngestionFilterComponent implements OnInit, OnDestroy {
  @Input() filteredResults!: number;
  @Input() set initialStatus(value: string | undefined) {
    if (value) this.selectedStatus.set(value.toLowerCase());
  }
  @Output() searchChange = new EventEmitter<string>();
  @Output() statusChange = new EventEmitter<string>();
  @Output() dateRangeChange = new EventEmitter<{ fromDate: string; toDate: string }>();

  searchTerm = signal('');
  fromDate = signal('');
  toDate = signal('');
  selectedStatus = signal<string>('all');

  private searchSubject = new Subject<string>();
  private destroy$ = new Subject<void>();

  statusList = Object.values(EntryStatus).filter(
    v => typeof v === 'string'
  ) as string[];

  ngOnInit(): void {
    this.searchSubject.pipe(
      debounceTime(400),
      distinctUntilChanged(),
      takeUntil(this.destroy$)
    ).subscribe(value => {
      this.searchChange.emit(value);
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onSearchChange(value: string): void {
    this.searchTerm.set(value);
    this.searchSubject.next(value);
  }

  onStatusChange(status: string): void {
    this.statusChange.emit(status);
  }

  onFromDateChange(date: string): void {
    this.fromDate.set(date);
    this.emitDateRange();
  }

  onCrossIconClick(){
    this.fromDate.set('');
    this.toDate.set('');
    this.emitDateRange();
  }

  onToDateChange(date: string): void {
    this.toDate.set(date);
    this.emitDateRange();
  }

  private emitDateRange(): void {
    this.dateRangeChange.emit({
      fromDate: this.fromDate(),
      toDate: this.toDate()
    });
  }
}
