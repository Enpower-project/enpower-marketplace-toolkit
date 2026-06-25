import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
  ) { }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if route is marked as public
    const isPublic = this.reflector.getAllAndOverride<boolean>('isPublic', [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException('Access token is required');
    }

    // Decode JWT payload to populate req.user with at least sub and roles
    // This is a lightweight, non-verifying decode suitable for dev/testing
    try {
      // If a previous middleware already populated user, keep it
      if (!request['user']) {
        const parts = token.split('.');
        if (parts.length >= 2) {
          const payloadRaw = parts[1]
            .replace(/-/g, '+')
            .replace(/_/g, '/');
          const pad = 4 - (payloadRaw.length % 4);
          const payloadPadded = pad === 4 ? payloadRaw : payloadRaw + '='.repeat(pad);
          const payloadJson = Buffer.from(payloadPadded, 'base64').toString('utf8');
          const payload = JSON.parse(payloadJson);
          request['user'] = payload;
        } else {
          // Fallback minimal shape
          request['user'] = { sub: 'demo-user-id', realm_access: { roles: [] } };
        }
      }
    } catch (error) {
      // If decoding fails, still allow, but with minimal shape
      request['user'] = request['user'] || { sub: 'demo-user-id', realm_access: { roles: [] } };
    }

    return true;
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}