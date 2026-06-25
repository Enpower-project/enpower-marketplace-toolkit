import { Injectable } from '@angular/core';
import { EventService, EventListener } from 'hateoas-utils';
import { AuthEvents } from '../../enums/auth-events.enum';
import { FirstLoginService } from './first-login.service';
import { KeycloakService } from '../keycloak/keycloak.service';
import { getKeycloakInstance } from '../keycloak/keycloak-init';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class UserStatusService extends EventListener {

  constructor(
    eventService: EventService,
    private readonly firstLoginService: FirstLoginService,
    private readonly keycloakService: KeycloakService,
    private readonly http: HttpClient
  ) {
    super(eventService);
    this.initializeEventListeners();
  }

  private initializeEventListeners(): void {
    // Escucha eventos de autenticación exitosa
    this.fmap.set(AuthEvents.AUTH_SUCCESS, this.handleAuthSuccess.bind(this));

    // Escucha cuando Keycloak está listo
    this.fmap.set(AuthEvents.KEYCLOAK_READY, this.handleKeycloakReady.bind(this));

    this.eventSubscribe();
  }

  private handleKeycloakReady(payload: any): void {
    if (payload.authenticated) {
      this.handleAuthSuccess(payload);
    }
  }

  private handleAuthSuccess(payload: any): void {
    const keycloak = getKeycloakInstance();
    if (!keycloak || !keycloak.tokenParsed) {
      return;
    }

    const userId = keycloak.tokenParsed.sub;
    const email = keycloak.tokenParsed['email'];
    const roles = keycloak.tokenParsed.realm_access?.roles || [];
    // Solo procesar usuarios con rol market_owner que podrían necesitar completar el primer login
    if (roles.includes('market_owner') && userId && email) {
      this.checkAndHandleFirstLoginStatus(userId, email);
    }
  }

  private checkAndHandleFirstLoginStatus(userId: string, email: string): void {
    // Iniciar el proceso de primer login para verificar el estado actual
    this.firstLoginService.initiateFirstLogin(email).subscribe({
      next: (response) => {
        if (response.success && response.data?.status) {
          const status = response.data.status;

          // Si necesita cambio de contraseña, no hacemos nada aquí 
          // ya que Keycloak ya maneja esto automáticamente
          if (status.needsPasswordChange) {
          }

          // Si necesita completar perfil, podríamos redirigir a un componente
          // o mostrar un modal para completar el perfil
          if (status.needsProfileCompletion) {
            this.handleProfileCompletionNeeded(userId);
          }
        }
      },
      error: (error) => {
      }
    });
  }

  private handleProfileCompletionNeeded(userId: string): void {
    // Aquí podrías emitir un evento para mostrar un modal o redirigir
    // a una página de completar perfil
    this.eventService.broadcast({
      action: 'PROFILE_COMPLETION_NEEDED',
      payload: { userId }
    });
  }

  /**
   * Método público para completar el perfil del usuario
   */
  completeUserProfile(profileData: any): void {
    const keycloak = getKeycloakInstance();
    if (!keycloak || !keycloak.tokenParsed?.sub) {
      return;
    }

    const userId = keycloak.tokenParsed.sub;

    this.firstLoginService.completeProfile(userId, profileData).subscribe({
      next: (response) => {
        // Emitir evento de perfil completado
        this.eventService.broadcast({
          action: 'PROFILE_COMPLETED',
          payload: { userId, response }
        });
      },
      error: (error) => {
        // Emitir evento de error
        this.eventService.broadcast({
          action: 'PROFILE_COMPLETION_ERROR',
          payload: { userId, error }
        });
      }
    });
  }

  /**
   * Método público para cambiar contraseña del usuario
   */
  changeUserPassword(passwordData: any): void {
    const keycloak = getKeycloakInstance();
    if (!keycloak || !keycloak.tokenParsed?.sub) {
      return;
    }

    const userId = keycloak.tokenParsed.sub;

    this.firstLoginService.changePassword(userId, passwordData).subscribe({
      next: (response) => {
        // Emitir evento de contraseña cambiada
        this.eventService.broadcast({
          action: 'PASSWORD_CHANGED',
          payload: { userId, response }
        });
      },
      error: (error) => {
        // Emitir evento de error
        this.eventService.broadcast({
          action: 'PASSWORD_CHANGE_ERROR',
          payload: { userId, error }
        });
      }
    });
  }

  deactivateUser(userId: string) {
    return this.http.put(`${environment.apiUrl}/auth/user/${userId}/deactivate`, {})
  }

  reactivateUser(userId: string) {
    return this.http.put(`${environment.apiUrl}/auth/user/${userId}/reactivate`, {})
  }
}
