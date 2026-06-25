export enum AuthEvents {
  // Eventi di stato di autenticazione
  AUTH_INITIALIZED = 'auth_initialized',
  AUTH_SUCCESS = 'auth_success',
  AUTH_FAILED = 'auth_failed',
  AUTH_LOGOUT = 'auth_logout',
  AUTH_TOKEN_REFRESHED = 'auth_token_refreshed',
  AUTH_TOKEN_EXPIRED = 'auth_token_expired',
  
  // Eventi di stato di Keycloak
  KEYCLOAK_READY = 'keycloak_ready',
  KEYCLOAK_ERROR = 'keycloak_error',
  KEYCLOAK_UNAVAILABLE = 'keycloak_unavailable',
  
  // Eventi di navigazione correlati all'auth
  AUTH_REQUIRED = 'auth_required',
  AUTH_REDIRECT = 'auth_redirect'
}

export interface AuthEventPayload {
  authenticated: boolean;
  username?: string;
  roles?: string[];
  token?: string;
  error?: any;
  redirectUrl?: string;
}