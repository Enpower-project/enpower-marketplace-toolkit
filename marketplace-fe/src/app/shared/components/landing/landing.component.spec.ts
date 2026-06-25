import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { TranslateModule } from '@ngx-translate/core';

import { LandingComponent } from './landing.component';
import { KeycloakService } from '../../../core/services/keycloak/keycloak.service';
import { MarketAuthService } from '../../../core/services/auth/market-auth.service';
import { EventService } from 'hateoas-utils';
import { AuthEvents } from '../../../core/enums/auth-events.enum';

describe('LandingComponent', () => {
  let component: LandingComponent;
  let fixture: ComponentFixture<LandingComponent>;
  let mockKeycloakService: jasmine.SpyObj<KeycloakService>;
  let mockMarketAuthService: jasmine.SpyObj<MarketAuthService>;
  let mockRouter: jasmine.SpyObj<Router>;
  let mockEventService: jasmine.SpyObj<EventService>;

  beforeEach(async () => {
    const keycloakServiceSpy = jasmine.createSpyObj('KeycloakService', [
      'login',
      'register',
      'logout',
      'isLoggedIn',
      'getUsername',
      'getRoles'
    ]);
    const marketAuthServiceSpy = jasmine.createSpyObj('MarketAuthService', [
      'resetMarketContext',
      'isMarketContextReady',
      'handlePostLoginMarketSelection'
    ]);
    const routerSpy = jasmine.createSpyObj('Router', ['navigate']);
    const eventServiceSpy = jasmine.createSpyObj('EventService', ['emit', 'subscribe']);

    await TestBed.configureTestingModule({
      imports: [
        LandingComponent,
        NoopAnimationsModule,
        TranslateModule.forRoot()
      ],
      providers: [
        { provide: KeycloakService, useValue: keycloakServiceSpy },
        { provide: MarketAuthService, useValue: marketAuthServiceSpy },
        { provide: Router, useValue: routerSpy },
        { provide: EventService, useValue: eventServiceSpy }
      ]
    }).compileComponents();

    mockKeycloakService = TestBed.inject(KeycloakService) as jasmine.SpyObj<KeycloakService>;
    mockMarketAuthService = TestBed.inject(MarketAuthService) as jasmine.SpyObj<MarketAuthService>;
    mockRouter = TestBed.inject(Router) as jasmine.SpyObj<Router>;
    mockEventService = TestBed.inject(EventService) as jasmine.SpyObj<EventService>;

    fixture = TestBed.createComponent(LandingComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    mockKeycloakService.isLoggedIn.and.returnValue(false);
    expect(component).toBeTruthy();
  });

  describe('ngOnInit', () => {
    it('should setup event listeners and check initial auth status', () => {
      mockKeycloakService.isLoggedIn.and.returnValue(false);
      spyOn(component, 'checkInitialAuthStatus' as any);

      component.ngOnInit();

      expect(component['checkInitialAuthStatus']).toHaveBeenCalled();
    });

    it('should set initial auth status when user is logged in', () => {
      mockKeycloakService.isLoggedIn.and.returnValue(true);
      mockKeycloakService.getUsername.and.returnValue('testuser');

      component.ngOnInit();

      expect(component.isLoggedIn).toBe(true);
      expect(component.username).toBe('testuser');
    });
  });

  describe('event handlers', () => {
    beforeEach(() => {
      mockKeycloakService.isLoggedIn.and.returnValue(false);
      fixture.detectChanges();
    });


    it('should handle keycloak ready event when authenticated', () => {
      const payload = { authenticated: true, username: 'testuser' };
      mockMarketAuthService.isMarketContextReady.and.returnValue(false);
      mockMarketAuthService.handlePostLoginMarketSelection.and.returnValue(
        of({ authenticated: true, marketSelected: false })
      );

      component['onKeycloakReady'](payload);

      expect(component.isLoggedIn).toBe(true);
      expect(component.username).toBe('testuser');
    });

    it('should handle keycloak ready event when not authenticated', () => {
      const payload = { authenticated: false };

      component['onKeycloakReady'](payload);

      expect(component.isLoggedIn).toBe(false);
    });

    it('should handle auth logout event', () => {
      component.isLoggedIn = true;
      component.username = 'testuser';
      component.isAuthenticationLoading = true;
      const payload = { authenticated: false };

      component['onAuthLogout'](payload);

      expect(component.isLoggedIn).toBe(false);
      expect(component.username).toBeUndefined();
      expect(component.isAuthenticationLoading).toBe(false);
    });

    it('should handle keycloak unavailable event', () => {
      component.isLoggedIn = true;
      const payload = { authenticated: false };

      component['onKeycloakUnavailable'](payload);

      expect(component.isLoggedIn).toBe(false);
      expect(component.username).toBeUndefined();
    });
  });

  describe('authentication methods', () => {
    beforeEach(() => {
      mockKeycloakService.isLoggedIn.and.returnValue(false);
      fixture.detectChanges();
    });

    it('should call keycloak login', () => {
      component.login();

      expect(mockKeycloakService.login).toHaveBeenCalled();
      // No se activa loading ya que Keycloak maneja la redirección completa
    });

    it('should call keycloak register', () => {
      component.register();

      expect(mockKeycloakService.register).toHaveBeenCalled();
    });

    it('should call logout and reset market context', () => {
      component.logout();

      expect(mockMarketAuthService.resetMarketContext).toHaveBeenCalled();
      expect(mockKeycloakService.logout).toHaveBeenCalled();
      // Logout no activa loading state, Keycloak maneja la redirección
    });
  });

  describe('navigation methods', () => {
    beforeEach(() => {
      mockKeycloakService.isLoggedIn.and.returnValue(false);
      fixture.detectChanges();
    });

    it('should navigate prosumer to home', () => {
      mockKeycloakService.getRoles.and.returnValue(['prosumer']);

      component.goToMarkets();

      expect(mockRouter.navigate).toHaveBeenCalledWith(['/home']);
    });

    it('should navigate non-prosumer to markets-management', () => {
      mockKeycloakService.getRoles.and.returnValue(['dso']);

      component.goToMarkets();

      expect(mockRouter.navigate).toHaveBeenCalledWith(['/markets-management']);
    });
  });

  describe('handlePostAuthMarketSelection', () => {
    beforeEach(() => {
      mockKeycloakService.isLoggedIn.and.returnValue(true);
      mockKeycloakService.getUsername.and.returnValue('testuser');
    });

    it('should handle market selection when context is not ready', () => {
      mockMarketAuthService.isMarketContextReady.and.returnValue(false);
      mockMarketAuthService.handlePostLoginMarketSelection.and.returnValue(
        of({ authenticated: true, marketSelected: true })
      );
      mockKeycloakService.getRoles.and.returnValue(['prosumer']);

      component['handlePostAuthMarketSelection']();

      expect(mockMarketAuthService.handlePostLoginMarketSelection).toHaveBeenCalled();
    });

    it('should stay on landing page after successful market selection', () => {
      mockMarketAuthService.isMarketContextReady.and.returnValue(false);
      mockMarketAuthService.handlePostLoginMarketSelection.and.returnValue(
        of({ authenticated: true, marketSelected: true })
      );
      mockKeycloakService.getRoles.and.returnValue(['prosumer']);

      spyOn(console, 'log');
      component['handlePostAuthMarketSelection']();

      expect(console.log).toHaveBeenCalledWith('Landing: Market selected successfully, staying on landing page');
      expect(mockRouter.navigate).not.toHaveBeenCalled();
    });

    it('should handle market selection error', () => {
      mockMarketAuthService.isMarketContextReady.and.returnValue(false);
      mockMarketAuthService.handlePostLoginMarketSelection.and.returnValue(
        of({ authenticated: true, marketSelected: false, error: 'Selection failed' })
      );

      spyOn(console, 'error');
      component['handlePostAuthMarketSelection']();

      expect(console.error).toHaveBeenCalledWith('Landing: Market selection failed:', 'Selection failed');
    });

    it('should handle market selection observable error', () => {
      mockMarketAuthService.isMarketContextReady.and.returnValue(false);
      mockMarketAuthService.handlePostLoginMarketSelection.and.returnValue(
        throwError(() => new Error('Network error'))
      );

      spyOn(console, 'error');
      component['handlePostAuthMarketSelection']();

      expect(console.error).toHaveBeenCalledWith('Landing: Market selection error:', jasmine.any(Error));
    });

    it('should skip market selection when context is already ready', () => {
      mockMarketAuthService.isMarketContextReady.and.returnValue(true);

      spyOn(console, 'log');
      component['handlePostAuthMarketSelection']();

      expect(mockMarketAuthService.handlePostLoginMarketSelection).not.toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith('Landing: Market context already ready');
    });
  });

  describe('component integration', () => {
    it('should initialize with correct default values', () => {
      mockKeycloakService.isLoggedIn.and.returnValue(false);

      expect(component.isLoggedIn).toBe(false);
      expect(component.username).toBeUndefined();
      expect(component.isAuthenticationLoading).toBe(true);
    });

    it('should properly extend EventListener', () => {
      expect(component.fmap).toBeDefined();
      expect(typeof component.eventSubscribe).toBe('function');
    });
  });

});