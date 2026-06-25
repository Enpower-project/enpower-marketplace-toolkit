// src/app/core/guards/role.guard.ts
import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { KeycloakService } from './keycloak.service';

export const roleGuard = (expectedRole: string): CanActivateFn => {
  return () => {
    const keycloakService = inject(KeycloakService);
    const router = inject(Router);

    if (keycloakService.isLoggedIn() && keycloakService.hasRole(expectedRole)) {
      return true;
    }

    router.navigate(['/']);
    return false;
  };
};
