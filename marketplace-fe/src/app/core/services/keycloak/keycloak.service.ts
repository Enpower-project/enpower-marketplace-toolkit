// src/app/core/services/keycloak/keycloak.service.ts
import { Injectable } from '@angular/core';
import { getKeycloakInstance, login, logout, isAuthenticated, getToken, setAuthStatusCallback, clearTokenRefresh } from './keycloak-init';
import { map, Observable } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { EventService } from '../../events';
import { AuthEvents, AuthEventPayload } from '../../enums/auth-events.enum';

@Injectable({ providedIn: 'root' })
export class KeycloakService {
  private callbacksEnabled = true;

  constructor(
    private http: HttpClient,
    private eventService: EventService
  ) {
    // Configura il callback per ricevere aggiornamenti dallo stato di Keycloak
    setAuthStatusCallback((authenticated: boolean) => {
      // Only broadcast events when callbacks are enabled
      if (this.callbacksEnabled) {
        this.broadcastAuthEvent(authenticated);
      }
    });

    // Controlla lo stato iniziale
    this.checkInitialAuthStatus();
  }

  private checkInitialAuthStatus(): void {
    // Single check without polling - more reliable
    const keycloakInstance = getKeycloakInstance();
    const currentStatus = isAuthenticated();

    if (keycloakInstance) {
      this.callbacksEnabled = true; // Re-enable callbacks after page load
      this.eventService.broadcast({
        action: AuthEvents.KEYCLOAK_READY,
        payload: this.createAuthPayload(currentStatus)
      });
      // Don't call broadcastAuthEvent here - it will be handled by the callback or the KEYCLOAK_READY event
    } else {
      // Wait a short time for Keycloak to initialize, then check once more
      setTimeout(() => {
        const keycloakInstance = getKeycloakInstance();
        const currentStatus = isAuthenticated();

        if (keycloakInstance) {
          this.callbacksEnabled = true; // Re-enable callbacks after page load
          this.eventService.broadcast({
            action: AuthEvents.KEYCLOAK_READY,
            payload: this.createAuthPayload(currentStatus)
          });
          // Don't call broadcastAuthEvent here - it will be handled by KEYCLOAK_READY event
        } else {
          this.callbacksEnabled = true; // Re-enable callbacks even if Keycloak unavailable
          this.eventService.broadcast({
            action: AuthEvents.KEYCLOAK_UNAVAILABLE,
            payload: { authenticated: false, error: 'Keycloak not available' }
          });
        }
      }, 1000);
    }
  }

  private broadcastAuthEvent(authenticated: boolean): void {
    const payload = this.createAuthPayload(authenticated);

    if (authenticated) {
      this.eventService.broadcast({
        action: AuthEvents.AUTH_SUCCESS,
        payload: payload
      });
    } else {
      this.eventService.broadcast({
        action: AuthEvents.AUTH_FAILED,
        payload: payload
      });
    }
  }

  private createAuthPayload(authenticated: boolean): AuthEventPayload {
    const keycloak = getKeycloakInstance();
    return {
      authenticated,
      username: authenticated ? keycloak?.tokenParsed?.['preferred_username'] : undefined,
      roles: authenticated ? keycloak?.tokenParsed?.realm_access?.roles : undefined,
      token: authenticated ? keycloak?.token : undefined
    };
  }

  getWalletByUsername(username: string): Observable<string | null> {
    return this.http.get(`${environment.apiGatewayUrl}/wallet/${encodeURIComponent(username.trim())}`, { responseType: 'text' })
      .pipe(
        map(res => res || null)
      );
  }

  getUserAddress(username: string): Observable<string | null> {
    return this.http.get<{ wallet: string }>(`${environment.apiGatewayUrl}/users/${encodeURIComponent(username.trim())}/wallet`)
      .pipe(
        map(res => res.wallet || null)
      );
  }

  getRoles(): string[] {
    const keycloak = getKeycloakInstance();
    return keycloak?.tokenParsed?.realm_access?.roles || [];
  }

  login(): void {
    this.callbacksEnabled = false; // Disable callbacks during login process
    login();
  }

  logout(): void {
    this.callbacksEnabled = false; // Disable callbacks during logout process
    
    // Clear token refresh interval
    clearTokenRefresh();
    
    // Call backend logout endpoint first to clean up server-side context
    // This ensures the current_market context is cleared before Keycloak logout
    this.http.post(`${environment.apiGatewayUrl}/auth/logout`, {})
      .subscribe({
        next: () => {
          logout();
        },
        error: (error) => {
          // Even if backend logout fails, proceed with Keycloak logout
          logout();
        }
      });
  }

  register(): void {
    const keycloak = getKeycloakInstance();
    if (keycloak) {
      keycloak.register();
    }
  }

  isLoggedIn(): boolean {

    return isAuthenticated();
  }

  getUsername(): string | undefined {
    const keycloak = getKeycloakInstance();
    return keycloak?.tokenParsed?.['preferred_username'];
  }

  getUserEmail(): string | undefined {
    const keycloak = getKeycloakInstance();
    return keycloak?.tokenParsed?.['email'];
  }

  hasRole(role: string): boolean {
    const keycloak = getKeycloakInstance();
    return keycloak?.tokenParsed?.realm_access?.roles?.includes(role) ?? false;
  }

  getToken(): string | undefined {
    return getToken();
  }

  updateToken(minValidity: number): Promise<boolean> {
    const keycloak = getKeycloakInstance();
    if (keycloak) {
      return keycloak.updateToken(minValidity);
    }
    return Promise.resolve(false);
  }

  assignRole(username: string, role: string): Observable<any> {
    return this.http.post<any>(`${environment.apiGatewayUrl}/keycloak/assign-role`, { username, role });
  }
}
