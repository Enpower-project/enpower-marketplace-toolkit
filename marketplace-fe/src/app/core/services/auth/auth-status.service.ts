import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class AuthStatusService {
  private authStatusSubject = new BehaviorSubject<boolean>(false);
  private keycloakAvailableSubject = new BehaviorSubject<boolean>(true);

  public authStatus$: Observable<boolean> = this.authStatusSubject.asObservable();
  public keycloakAvailable$: Observable<boolean> = this.keycloakAvailableSubject.asObservable();

  setAuthStatus(authenticated: boolean): void {
    this.authStatusSubject.next(authenticated);
  }

  setKeycloakAvailable(available: boolean): void {
    this.keycloakAvailableSubject.next(available);
  }

  getAuthStatus(): boolean {
    return this.authStatusSubject.value;
  }

  isKeycloakAvailable(): boolean {
    return this.keycloakAvailableSubject.value;
  }
}