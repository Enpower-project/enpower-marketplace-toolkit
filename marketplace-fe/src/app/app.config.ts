import { APP_INITIALIZER, ApplicationConfig, inject, provideZoneChangeDetection, importProvidersFrom } from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { HTTP_INTERCEPTORS, HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { BlockchainService } from './core/services/blockchain/blockchain.service';
import { AuthInterceptor } from './core/services/keycloak/auth.interceptor';
import { RFC7807ErrorInterceptor } from './core/services/error/rfc7807-error.interceptor';
import { ErrorLogService } from './core/services/error/error-log.service';
import { FormErrorHandlerService } from './core/services/error/form-error-handler.service';
import { TranslateModule, TranslateService, TranslateLoader } from '@ngx-translate/core';
import { Observable, of, firstValueFrom } from 'rxjs';
import { provideAnimations } from '@angular/platform-browser/animations';
import { initializeKeycloak } from './core/services/keycloak/keycloak-init';
import { CacheService } from './core/services/cache/cache.service';

// Custom loader to load translations from JSON files
export class CustomTranslateLoader implements TranslateLoader {
  constructor(private http: HttpClient) { }

  getTranslation(lang: string): Observable<any> {
    return this.http.get(`./assets/i18n/${lang}.json`);
  }
}

export function initializeCache(cacheService: CacheService) {
  return () => {
    // Set up periodic cache pruning
    setInterval(() => {
      cacheService.pruneAll();
    }, 60 * 1000); // Every minute
  };
}

// Factory function for creating the TranslateLoader
export function createTranslateLoader(http: HttpClient): TranslateLoader {
  return new CustomTranslateLoader(http);
}

function initializeKeycloakFactory() {
  return () => {
    // Start Keycloak initialization but don't block app startup
    initializeKeycloak()
      .then((authenticated) => {
      })
      .catch((error) => {
      });

    // Immediately resolve to not block app startup
    return Promise.resolve();
  };
}

function initializeErrorServices() {
  return () => {
    // Initialize error services
    inject(ErrorLogService);
    inject(FormErrorHandlerService);
    return Promise.resolve();
  };
}

function initializeTranslation() {
  return () => {
    const translateService = inject(TranslateService);
    //   translateService.setDefaultLang('en');
    return firstValueFrom(translateService.use('en'));
  };
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient(
      withInterceptors([
        (req, next) => inject(AuthInterceptor).intercept(req, { handle: next }),
        (req, next) => inject(RFC7807ErrorInterceptor).intercept(req, { handle: next })
      ])
    ),
    importProvidersFrom(
      TranslateModule.forRoot({
        loader: {
          provide: TranslateLoader,
          useFactory: createTranslateLoader,
          deps: [HttpClient]
        },
        defaultLanguage: 'en'
      })
    ),
    // Angular Material dialogs, menus and expansion panels animate.
    provideAnimations(),
    BlockchainService,
    ErrorLogService,
    FormErrorHandlerService,
    RFC7807ErrorInterceptor,
    {
      provide: APP_INITIALIZER,
      useFactory: initializeKeycloakFactory,
      multi: true
    },
    {
      provide: APP_INITIALIZER,
      useFactory: initializeErrorServices,
      multi: true
    },
    {
      provide: APP_INITIALIZER,
      useFactory: initializeTranslation,
      multi: true
    },
    {
      provide: APP_INITIALIZER,
      useFactory: initializeCache,
      deps: [CacheService],
      multi: true
    }
  ]
};
