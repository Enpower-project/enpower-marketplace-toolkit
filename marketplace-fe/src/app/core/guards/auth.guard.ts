import { Injectable, inject } from '@angular/core';
import { CanActivate, Router, ActivatedRouteSnapshot } from '@angular/router';
import { KeycloakService } from '../services/keycloak/keycloak.service';
import { MarketAuthService } from '../services/auth/market-auth.service';
import { Observable, of, from } from 'rxjs';
import { map, catchError, switchMap } from 'rxjs/operators';
import { waitForKeycloakInit } from '../services/keycloak/keycloak-init';

@Injectable({
  providedIn: 'root'
})
export class AuthGuard implements CanActivate {
  private keycloakService = inject(KeycloakService);
  private marketAuthService = inject(MarketAuthService);
  private router = inject(Router);

  canActivate(route?: ActivatedRouteSnapshot): Observable<boolean> {
    const currentUrl = route?.routeConfig?.path || this.router.url;
    // Wait for Keycloak to be fully initialized before checking authentication
    return from(waitForKeycloakInit()).pipe(
      switchMap((authenticated) => {
        if (!authenticated) {
          this.router.navigate(['/']);
          return of(false);
        }

        const hasMarketplaceAdminRole = this.keycloakService.hasRole('MARKETPLACE_ADMIN');
        const isMarketsManagementRoute = currentUrl.includes('markets-management') || currentUrl === 'markets-management';
        const isHomeRoute = currentUrl === 'home' || currentUrl.includes('home');

        // Allow superadmins (market_crud) to access any route without market selection
        if (hasMarketplaceAdminRole) {
          return of(true);
        }

        // Check if user is a prosumer accessing home - allow access even without market context
        // The home component will handle market subscription modal
        const isProsumer = this.keycloakService.hasRole('FSP');
        const isFMO_LMO = this.keycloakService.hasRole('FMO_LMO');

        if (isProsumer && isHomeRoute) {
          return of(true);
        }
        
        // FMO_LMO users should be allowed through - app.component.ts handles their market acceptance flow
        if (isFMO_LMO) {

          return of(true);
        }

        // User is authenticated, check market context
        const marketContextReady = this.marketAuthService.isMarketContextReady();
        if (marketContextReady) {
          return of(true);
        }

        // Handle market selection - simplified flow
        return this.marketAuthService.handlePostLoginMarketSelection().pipe(
          map(result => {
            if (result.authenticated && result.marketSelected) {
              return true;
            } else {
              this.router.navigate(['/']);
              return false;
            }
          }),
          catchError((error) => {
            this.router.navigate(['/']);
            return of(false);
          })
        );
      }),
      catchError((error) => {
        this.router.navigate(['/']);
        return of(false);
      })
    );
  }
}
