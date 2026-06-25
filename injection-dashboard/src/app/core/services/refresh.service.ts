import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class RefreshService {
  refreshTrigger = signal<number>(0);

  triggerRefresh(): void {
    this.refreshTrigger.set(this.refreshTrigger() + 1);
  }

}
