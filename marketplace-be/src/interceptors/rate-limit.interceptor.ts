import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';


import { Observable } from 'rxjs';
import { TooManyRequestsException } from '../exceptions/http-exception';

@Injectable()
export class RateLimitInterceptor implements NestInterceptor {
  private requests = new Map<string, { count: number; resetTime: number }>();
  private readonly limit = 100; // requests per window
  private readonly windowMs = 60000; // 1 minute

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const clientId = this.getClientId(request);
    const now = Date.now();

    const clientData = this.requests.get(clientId);

    if (!clientData || now > clientData.resetTime) {
      this.requests.set(clientId, {
        count: 1,
        resetTime: now + this.windowMs,
      });
    } else {
      clientData.count++;
      if (clientData.count > this.limit) {
        throw new TooManyRequestsException(this.limit, this.windowMs);
      }
    }

    return next.handle();
  }



  private getClientId(request: any): string {
    return request.ip || request.connection.remoteAddress || 'unknown';
  }
}