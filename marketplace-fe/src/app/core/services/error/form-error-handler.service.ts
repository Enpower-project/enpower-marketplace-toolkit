import { Injectable } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { EventService, EventListener } from 'hateoas-utils';
import { AppErrorEvent, ProblemDetail } from '../../../shared/models/error/rfc7807-error.model';

@Injectable({
  providedIn: 'root'
})
export class FormErrorHandlerService extends EventListener {

  constructor(eventService: EventService) {
    super(eventService);
    this.fmap.set('APP_ERROR', this.handleAppError.bind(this));
    this.eventSubscribe();
  }

  private handleAppError(errorEvent: AppErrorEvent): void {
    // This method can be extended to handle specific form error scenarios
  }

  applyValidationErrorsToForm(form: FormGroup, errors: ProblemDetail[]): void {
    // Clear existing custom errors first
    this.clearCustomErrors(form);

    // Apply new validation errors
    errors.forEach((error) => {
      const control = form.get(error.property);
      if (control) {
        const currentErrors = control.errors || {};
        currentErrors[error.errorCode] = {
          message: error.message,
          invalidValue: error.invalidValue
        };
        control.setErrors(currentErrors);
      }
    });
  }

  private clearCustomErrors(form: FormGroup): void {
    Object.keys(form.controls).forEach(key => {
      const control = form.get(key);
      if (control && control.errors) {
        // Remove only custom error codes (those starting with 'error.')
        const errors = control.errors;
        const filteredErrors: any = {};
        let hasValidationErrors = false;

        Object.keys(errors).forEach(errorKey => {
          if (!errorKey.startsWith('error.')) {
            filteredErrors[errorKey] = errors[errorKey];
            hasValidationErrors = true;
          }
        });

        control.setErrors(hasValidationErrors ? filteredErrors : null);
      }
    });
  }

  getErrorMessage(entity: string, property: string, errorCode: string): string {
    // This would typically use Angular's i18n service
    // For now, return a formatted message
    return `${entity}.${property}.${errorCode}`;
  }
}