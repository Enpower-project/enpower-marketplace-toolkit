import { Injectable } from '@angular/core';
import {
  HttpInterceptor,
  HttpRequest,
  HttpHandler,
  HttpEvent,
  HttpErrorResponse
} from '@angular/common/http';
import { Observable, from, throwError, of } from 'rxjs';
import { mergeMap, finalize, catchError, retry } from 'rxjs/operators';
import { KeycloakService } from './keycloak.service';
import { EventService } from 'hateoas-utils';
import { INFINITE_LOADER_EVENT } from '../../../shared/enums/const';
import { waitForKeycloakInit } from './keycloak-init';

@Injectable({ providedIn: 'root' })
export class AuthInterceptor implements HttpInterceptor {
  private isRefreshing = false;

  constructor(
    private keycloakService: KeycloakService,
    private eventService: EventService
  ) { }

  /**
   * Intercepts every outgoing HTTP request to inject the Bearer token and manage
   * the global loading indicator. On 401 responses a single token refresh is
   * attempted before forcing a logout.
   */
  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    const excludedUrls = [
      '/auth/register',
      '/auth/login',
      '/assets/',
    ];

    if (excludedUrls.some(url => req.url.includes(url))) {
      return next.handle(req);
    }

    this.eventService.broadcast({
      action: INFINITE_LOADER_EVENT.START_INFINITE_LOADER,
      payload: req.method
    });

    return from(waitForKeycloakInit()).pipe(
      mergeMap((authenticated) => {
        if (!authenticated) {
          return next.handle(req);
        }

        return from(this.keycloakService.updateToken(70)).pipe(
          mergeMap(() => {
            const token = this.keycloakService.getToken();
            const authReq = token
              ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
              : req;
            return next.handle(authReq);
          }),
          catchError(() => {
            const existingToken = this.keycloakService.getToken();
            const authReq = existingToken
              ? req.clone({ setHeaders: { Authorization: `Bearer ${existingToken}` } })
              : req;
            return next.handle(authReq);
          })
        );
      }),
      catchError((error: any) => {
        if (!(error instanceof HttpErrorResponse)) {
          return throwError(() => error);
        }

        if (error.status === 401 && !this.isRefreshing) {
          this.isRefreshing = true;

          return from(this.keycloakService.updateToken(-1)).pipe(
            mergeMap((refreshed) => {
              this.isRefreshing = false;

              if (refreshed) {
                const newToken = this.keycloakService.getToken();
                if (newToken) {
                  const retryReq = req.clone({
                    setHeaders: { Authorization: `Bearer ${newToken}` }
                  });
                  return next.handle(retryReq);
                }
              }

              this.handleSessionExpired();
              return throwError(() => new Error('Session expired. Please login again.'));
            }),
            catchError(() => {
              this.isRefreshing = false;
              this.handleSessionExpired();
              return throwError(() => new Error('Session expired. Please login again.'));
            })
          );
        }

        return throwError(() => error);
      }),
      finalize(() => {
        this.eventService.broadcast({
          action: INFINITE_LOADER_EVENT.STOP_INFINITE_LOADER,
          payload: req.method
        });
        this.isRefreshing = false;
      })
    );
  }

  /**
   * Handles session expiration by forcing logout and redirecting to login
   */
  private handleSessionExpired(): void {
    // Broadcast session expired event
    this.eventService.broadcast({
      action: 'SESSION_EXPIRED',
      payload: { message: 'Your session has expired. Please login again.' }
    });

    // Force logout after a short delay to allow the event to be processed
    setTimeout(() => {
      this.keycloakService.logout();
    }, 500);
  }
}

