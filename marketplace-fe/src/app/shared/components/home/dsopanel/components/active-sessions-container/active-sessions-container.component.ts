import { Component, inject, Input, OnInit } from '@angular/core';
import { MatCard, MatCardHeader, MatCardTitle, MatCardSubtitle, MatCardContent, MatCardActions } from "@angular/material/card";
import { MatIcon } from "@angular/material/icon";
import { MatChip } from "@angular/material/chips";
import { CommonModule, NgClass } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { Session, SessionStatus } from '../../../../../models/session.model';

@Component({
  selector: 'app-active-session-card',
  imports: [
    MatCard,
    MatCardHeader,
    MatIcon,
    MatCardTitle,
    MatCardSubtitle,
    MatChip,
    NgClass,
    MatCardContent,
    CommonModule,
    RouterModule,
    MatCardActions
  ],
  templateUrl: './active-sessions-container.component.html',
  styleUrl: './active-sessions-container.component.css',
})

export class ActiveSessionsContainerComponent{
  router = inject(Router)

  @Input() sessions: Session[] = [];
  @Input() isLoading: boolean = false;
  @Input() isMarketDeactivated: boolean = false

  getFilteredSessions(): Session[] {
    return this.sessions.filter(session => session.status === SessionStatus.ACTIVE);
  }

  trackBySessionId(index: number, session: Session): string {
    return session.id;
  }

  viewSession(session: Session): void {
    this.router.navigate(['/market-sessions', session.id]);
  }

  viewOffers(session: Session): void {
    this.router.navigate(['/offers-info', session.id]);
  }

  formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  formatDateTime(date: Date): string {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

}