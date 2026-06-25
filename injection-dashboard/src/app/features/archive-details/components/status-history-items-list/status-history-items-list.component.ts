import { Component, Input } from '@angular/core';
import { StatusHistoryItem } from '../../../../core/models/status-history-item.interface';
import { DatePipe, NgClass } from '@angular/common';
import { StatusIconPipe } from '../../pipes/status-icon-pipe';

@Component({
  selector: 'app-status-history-items-list',
  imports: [NgClass, DatePipe, StatusIconPipe],
  templateUrl: './status-history-items-list.component.html',
  styleUrl: './status-history-items-list.component.css',
})
export class StatusHistoryItemsListComponent {
  @Input() items! : StatusHistoryItem[];
 }
