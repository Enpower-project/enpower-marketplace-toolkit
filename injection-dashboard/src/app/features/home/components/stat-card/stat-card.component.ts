import { Component, Input } from '@angular/core';
import { NgClass, DecimalPipe } from '@angular/common';

@Component({
  selector: 'app-stat-card',
  imports: [NgClass, DecimalPipe],
  templateUrl: './stat-card.component.html',
  styleUrl: './stat-card.component.css',
})
export class StatCardComponent {
  @Input() title!: string;
  @Input() count: number | null = null;
  @Input() badge?: string;
  @Input() subtext?: string;
  @Input() variant: 'default' | 'error' = 'default';
  @Input() accentColor: string = '#005FB8';
}
