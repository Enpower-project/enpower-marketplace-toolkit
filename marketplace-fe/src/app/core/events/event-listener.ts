import { Subscription } from 'rxjs';
import { EventService, EVENTS_EXCLUDED_FROM_LOG } from './event.service';

/**
 * Base class for anything that reacts to the application event bus.
 *
 * Subclasses register a handler per action in `fmap`, then call
 * `eventSubscribe()`. Actions without a registered handler are ignored.
 *
 *   constructor(eventService: EventService) {
 *     super(eventService);
 *     this.fmap.set('SOME_ACTION', this.onSomeAction.bind(this));
 *     this.eventSubscribe();
 *   }
 */
export class EventListener {
  subscriptions = new Subscription();
  fmap: Map<string, Function> = new Map<string, Function>();

  constructor(public eventService: EventService) { }

  eventSubscribe(): void {
    console.debug('Event subscription in class:', this.constructor?.name);
    const subscription = this.eventService.message.subscribe({
      next: res => {
        if (!res.action) {
          return;
        }
        const handler = this.fmap.get(res.action);
        if (handler) {
          if (!EVENTS_EXCLUDED_FROM_LOG.includes(res.action)) {
            console.debug('received message', res);
          }
          handler(res.payload);
        }
      },
      error: error => console.log('error', error)
    });
    this.subscriptions.add(subscription);
  }

  // Name kept as originally published, so existing callers need no change.
  unsubcribe(): void {
    this.subscriptions.unsubscribe();
  }
}
