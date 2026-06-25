import { Injectable } from '@angular/core';
import { EventService, EventListener } from 'hateoas-utils';
import { AppErrorEvent } from '../../../shared/models/error/rfc7807-error.model';

@Injectable({ 
  providedIn: 'root' 
})
export class ErrorLogService extends EventListener {
  private readonly max = 30;
  private readonly key = 'app.errors';

  constructor(eventService: EventService) {
    super(eventService);
    this.fmap.set('APP_ERROR', this.storeError.bind(this));
    this.eventSubscribe();
  }

  storeError(error: AppErrorEvent): void {
    const logs = this.getErrors();
    logs.unshift(error);
    localStorage.setItem(this.key, JSON.stringify(logs.slice(0, this.max)));
  }

  getErrors(): AppErrorEvent[] {
    try {
      return JSON.parse(localStorage.getItem(this.key) || '[]');
    } catch (e) {
      return [];
    }
  }

  clearErrors(): void {
    localStorage.removeItem(this.key);
  }
}