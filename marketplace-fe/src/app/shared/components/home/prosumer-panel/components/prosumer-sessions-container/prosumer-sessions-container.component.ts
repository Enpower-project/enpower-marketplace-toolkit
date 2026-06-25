import { NgIf, NgForOf, DatePipe, DecimalPipe } from '@angular/common';
import { AfterViewInit, Component, inject, input, Input, OnChanges, SimpleChanges } from '@angular/core';
import { Session, SessionStatus } from '../../../../../models/session.model';
import { Router } from '@angular/router';

@Component({
  selector: 'app-prosumer-sessions-container',
  imports: [
    NgIf,
    NgForOf,
    DatePipe,
    DecimalPipe
  ],
  templateUrl: './prosumer-sessions-container.component.html',
  styleUrl: './prosumer-sessions-container.component.css',
})
export class ProsumerSessionsContainerComponent {
  router = inject(Router)

  @Input() sessions: Session[] = []
  @Input() isMarketDeactivated: boolean = false
  @Input() isLoading: boolean = false

  public get filteredSessions(): Session[] {
    return this.sessions.filter((session) => session.status === SessionStatus.ACTIVE);
  }

  viewSessionBids(sessionId: string): void {
    this.router.navigate(['/prosumer-offers/session', sessionId]);
  }

  getAvailableBidsCount(session: Session): number {
    return session.bids.filter(bid => !bid.isFull).length;
  }

  getTotalBidsCount(session: Session): number {
    return session.bids.length;
  }

  onCardClick(sessionId: string): void {
    if (!this.isMarketDeactivated) {
      this.viewSessionBids(sessionId);
    }
  }

}
