import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';

/** A message on the application event bus: an action name and an optional payload. */
export interface IMessageProps<T> {
  action: string;
  payload?: any | T;
}

/** High-frequency actions that would flood the debug log. */
export const EVENTS_EXCLUDED_FROM_LOG: string[] = [
  'PRE_CALL_REST_API',
  'POST_CALL_REST_API',
  'START_INFINITE_LOADER',
  'STOP_INFINITE_LOADER',
  'BREADCRUMB_UPDATE',
  'BREADCRUMB_CLEAR'
];

/**
 * Application-wide event bus.
 *
 * A plain Subject: a message reaches only the listeners subscribed at the
 * moment it is broadcast, and nothing is replayed to later subscribers.
 */
@Injectable({
  providedIn: 'root'
})
export class EventService {
  private readonly _message = new Subject<IMessageProps<any>>();

  get message(): Observable<IMessageProps<any>> {
    return this._message.asObservable();
  }

  broadcast<T>(mesg: IMessageProps<T>): void {
    if (!EVENTS_EXCLUDED_FROM_LOG.includes(mesg.action)) {
      console.debug('broadcast: ', mesg);
    }
    this._message.next(mesg);
  }
}
