import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { I18nService } from 'nestjs-i18n';

@Injectable()
export class LanguageInterceptor implements NestInterceptor {
  constructor(private readonly i18n: I18nService) { }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();

    // Get language from header, query param, or default to 'en'
    const language =
      request.headers['accept-language'] ||
      request.headers['language'] ||
      request.query.lang ||
      'en';

    // Set the language in the I18n service context
    request.i18nLang = language.split(',')[0].split('-')[0]; // Get primary language code

    return next.handle();
  }
}