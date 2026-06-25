import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';

// Avvia sempre l'applicazione, senza richiedere autenticazione obbligatoria

// Keycloak initialization now happens via APP_INITIALIZER in app.config.ts
// This ensures proper initialization order and that guards can rely on Keycloak being ready
bootstrapApplication(AppComponent, appConfig)
  .then(() => {
  })
  .catch((err) => {
  });
