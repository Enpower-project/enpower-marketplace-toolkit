import { HttpStatus } from '@nestjs/common';
import { BusinessException } from './business.exception';
import { ErrorCode } from '../enums/error-code.enum';

export class BadRequestException extends BusinessException {
  constructor(message: string, property?: string, invalidValue?: any) {
    super(
      ErrorCode.INVALID_DATA,
      'request',
      property,
      invalidValue,
      message,
      HttpStatus.BAD_REQUEST
    );
  }
}

export class UnauthorizedException extends BusinessException {
  constructor(message: string = 'Authentication required') {
    super(
      ErrorCode.UNAUTHORIZED,
      'authentication',
      undefined,
      undefined,
      message,
      HttpStatus.UNAUTHORIZED
    );
  }
}

export class ForbiddenException extends BusinessException {
  constructor(resource: string, action?: string) {
    super(
      ErrorCode.FORBIDDEN,
      resource,
      'action',
      action,
      `Access denied to ${resource}`,
      HttpStatus.FORBIDDEN
    );
  }
}

export class NotFoundException extends BusinessException {
  constructor(entity: string, identifier?: string | number) {
    super(
      ErrorCode.NOT_FOUND,
      entity,
      'id',
      identifier,
      `${entity} not found`,
      HttpStatus.NOT_FOUND
    );
  }
}

export class ConflictException extends BusinessException {
  constructor(entity: string, property: string, value: any) {
    super(
      ErrorCode.ALREADY_EXISTS,
      entity,
      property,
      value,
      `${entity} already exists`,
      HttpStatus.CONFLICT
    );
  }
}

export class UnprocessableEntityException extends BusinessException {
  constructor(entity: string, reason: string, invalidData?: any) {
    super(
      ErrorCode.UNPROCESSABLE_ENTITY,
      entity,
      'data',
      invalidData,
      reason,
      HttpStatus.UNPROCESSABLE_ENTITY
    );
  }
}

export class TooManyRequestsException extends BusinessException {
  constructor(limit: number, windowMs: number) {
    super(
      ErrorCode.TOO_MANY_REQUESTS,
      'request',
      'limit',
      limit,
      `Rate limit exceeded: ${limit} requests per ${windowMs}ms`,
      HttpStatus.TOO_MANY_REQUESTS
    );
  }
}

export class ServiceUnavailableException extends BusinessException {
  constructor(service: string, reason?: string) {
    super(
      ErrorCode.SERVICE_UNAVAILABLE,
      service,
      undefined,
      undefined,
      reason || `${service} is temporarily unavailable`,
      HttpStatus.SERVICE_UNAVAILABLE
    );
  }
}