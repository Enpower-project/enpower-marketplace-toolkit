import { Injectable } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler, HttpEvent, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { EventService } from 'hateoas-utils';
import { RFC7807ErrorResponse, AppErrorEvent } from '../../../shared/models/error/rfc7807-error.model';

@Injectable()
export class RFC7807ErrorInterceptor implements HttpInterceptor {
  
  constructor(private eventService: EventService) {}

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    return next.handle(req).pipe(
      catchError((error: HttpErrorResponse) => {
        if (this.isRFC7807Error(error)) {
          this.handleRFC7807Error(error);
        } else {
          this.handleGenericError(error);
        }
        return throwError(() => error);
      })
    );
  }

  private isRFC7807Error(error: HttpErrorResponse): boolean {
    return error.error && 
           typeof error.error === 'object' && 
           error.error.title && 
           error.error.status;
  }

  private handleRFC7807Error(error: HttpErrorResponse): void {
    const rfc7807Error: RFC7807ErrorResponse = error.error;
    const appErrorEvent: AppErrorEvent = {
      timestamp: new Date(),
      status: rfc7807Error.status,
      title: rfc7807Error.title,
      detail: rfc7807Error.detail,
      errors: rfc7807Error.errors
    };

    this.broadcastError(appErrorEvent);
  }

  private handleGenericError(error: HttpErrorResponse): void {
    const appErrorEvent: AppErrorEvent = {
      timestamp: new Date(),
      status: error.status || 500,
      title: this.getGenericErrorTitle(error.status),
      detail: error.message || 'An unexpected error occurred',
      errors: []
    };

    this.broadcastError(appErrorEvent);
  }

  private getGenericErrorTitle(status: number): string {
    switch (status) {
      case 400:
        return 'Bad Request';
      case 401:
        return 'Unauthorized';
      case 403:
        return 'Forbidden';
      case 404:
        return 'Not Found';
      case 422:
        return 'Validation Error';
      case 500:
        return 'Internal Server Error';
      default:
        return 'Request Failed';
    }
  }

  private broadcastError(appErrorEvent: AppErrorEvent): void {
    this.eventService.broadcast({
      action: 'APP_ERROR',
      payload: appErrorEvent
    });
  }
}