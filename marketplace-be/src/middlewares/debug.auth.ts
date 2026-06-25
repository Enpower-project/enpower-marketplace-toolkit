import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class DebugAuthMiddleware implements NestMiddleware {
  private readonly logger = new Logger('AuthDebug');

  use(req: Request, res: Response, next: NextFunction) {
    // Log los headers de autenticación
    this.logger.debug(`Auth headers: ${JSON.stringify(req.headers.authorization)}`);
    
    // Si hay un token Bearer, simular un usuario autenticado
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      // Simular un usuario autenticado con keycloakId específico
      req['user'] = {
        sub: 'demo-keycloak-id-12345', // Este debe coincidir con un usuario en la BD
        email: 'demo@example.com',
        preferred_username: 'demo-user',
        realm_access: {
          roles: ['FMO_LMO']
        }
      };
      this.logger.debug(`Simulated user: ${JSON.stringify(req['user'])}`);
    }
    
    // Si hay un token decodificado en la solicitud (añadido por el guard de Keycloak)
    if (req['user']) {
      this.logger.debug(`User: ${JSON.stringify(req['user'])}`);
    }
    
    // Si hay roles en la solicitud
    if (req['roles']) {
      this.logger.debug(`Roles: ${JSON.stringify(req['roles'])}`);
    }
    
    next();
  }
}