import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { Router } from '@angular/router';
import { KeycloakService } from '../../../core/services/keycloak/keycloak.service';
import { EventService, EventListener } from '../../../core/events';
import { AuthEvents, AuthEventPayload } from '../../../core/enums/auth-events.enum';
import { MarketAuthService } from '../../../core/services/auth/market-auth.service';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
  ],
  templateUrl: './landing.component.html',
  styleUrl: './landing.component.css'
})
export class LandingComponent extends EventListener implements OnInit {
  isLoggedIn = false;
  username: string | undefined;
  isAuthenticationLoading = false;
  private marketSelectionHandled = false;

  constructor(
    private keycloakService: KeycloakService,
    private marketAuthService: MarketAuthService,
    private router: Router,
    eventService: EventService
  ) {
    super(eventService);
  }

  ngOnInit(): void {
    this.setupEventListeners();
    this.checkInitialAuthStatus();
  }

  private setupEventListeners(): void {
    this.fmap.set(AuthEvents.AUTH_SUCCESS, this.onAuthSuccess.bind(this));
    this.fmap.set(AuthEvents.AUTH_FAILED, this.onAuthFailed.bind(this));
    this.fmap.set(AuthEvents.KEYCLOAK_READY, this.onKeycloakReady.bind(this));
    this.fmap.set(AuthEvents.AUTH_LOGOUT, this.onAuthLogout.bind(this));
    this.fmap.set(AuthEvents.KEYCLOAK_UNAVAILABLE, this.onKeycloakUnavailable.bind(this));
    this.eventSubscribe();
  }

  private onAuthSuccess(payload: AuthEventPayload): void {
    this.isLoggedIn = true;
    this.username = payload.username;
    this.isAuthenticationLoading = false;

    if (!this.marketSelectionHandled) {
      this.marketSelectionHandled = true;
      this.router.navigate(['/home']);
    }
  }

  private onAuthFailed(_payload: AuthEventPayload): void {
    this.isLoggedIn = false;
    this.username = undefined;
    this.isAuthenticationLoading = false;
    this.marketSelectionHandled = false;
  }

  private onKeycloakReady(payload: AuthEventPayload): void {
    this.isLoggedIn = payload.authenticated;
    this.username = payload.username;
    this.isAuthenticationLoading = false;

    if (payload.authenticated && !this.marketSelectionHandled) {
      this.marketSelectionHandled = true;
      this.router.navigate(['/home']);
    }
  }

  private onAuthLogout(_payload: AuthEventPayload): void {
    this.isLoggedIn = false;
    this.username = undefined;
    this.marketSelectionHandled = false;
  }

  private onKeycloakUnavailable(_payload: AuthEventPayload): void {
    this.isLoggedIn = false;
    this.username = undefined;
    this.isAuthenticationLoading = false;
    this.marketSelectionHandled = false;
  }

  private checkInitialAuthStatus(): void {
    if (this.keycloakService.isLoggedIn()) {
      this.isLoggedIn = true;
      this.username = this.keycloakService.getUsername();
    }
  }

  login(): void {
    this.keycloakService.login();
  }

  logout(): void {
    this.marketSelectionHandled = false;
    this.marketAuthService.resetMarketContext();
    this.keycloakService.logout();
  }

  goToMarkets(): void {
    this.router.navigate(['/home']);
  }
}
