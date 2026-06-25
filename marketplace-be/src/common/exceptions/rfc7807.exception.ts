import { HttpException, HttpStatus } from '@nestjs/common';

export class RFC7807Exception extends HttpException {
  constructor(
    type: string,
    title: string,
    status: number,
    detail?: string,
    instance?: string,
    additionalProperties?: Record<string, any>
  ) {
    const response = {
      type,
      title,
      status,
      detail,
      instance,
      ...additionalProperties
    };

    super(response, status);
  }

  static badRequest(title: string, detail?: string, additionalProperties?: Record<string, any>): RFC7807Exception {
    return new RFC7807Exception(
      'https://httpstatuses.com/400',
      title,
      HttpStatus.BAD_REQUEST,
      detail,
      additionalProperties?.instance,
      additionalProperties
    );
  }

  static unauthorized(title: string, detail?: string, additionalProperties?: Record<string, any>): RFC7807Exception {
    return new RFC7807Exception(
      'https://httpstatuses.com/401',
      title,
      HttpStatus.UNAUTHORIZED,
      detail,
      additionalProperties?.instance,
      additionalProperties
    );
  }

  static forbidden(title: string, detail?: string, additionalProperties?: Record<string, any>): RFC7807Exception {
    return new RFC7807Exception(
      'https://httpstatuses.com/403',
      title,
      HttpStatus.FORBIDDEN,
      detail,
      additionalProperties?.instance,
      additionalProperties
    );
  }

  static notFound(title: string, detail?: string, additionalProperties?: Record<string, any>): RFC7807Exception {
    return new RFC7807Exception(
      'https://httpstatuses.com/404',
      title,
      HttpStatus.NOT_FOUND,
      detail,
      additionalProperties?.instance,
      additionalProperties
    );
  }

  static conflict(title: string, detail?: string, additionalProperties?: Record<string, any>): RFC7807Exception {
    return new RFC7807Exception(
      'https://httpstatuses.com/409',
      title,
      HttpStatus.CONFLICT,
      detail,
      additionalProperties?.instance,
      additionalProperties
    );
  }

  static unprocessableEntity(title: string, detail?: string, additionalProperties?: Record<string, any>): RFC7807Exception {
    return new RFC7807Exception(
      'https://httpstatuses.com/422',
      title,
      HttpStatus.UNPROCESSABLE_ENTITY,
      detail,
      additionalProperties?.instance,
      additionalProperties
    );
  }

  static internalServerError(title: string, detail?: string, additionalProperties?: Record<string, any>): RFC7807Exception {
    return new RFC7807Exception(
      'https://httpstatuses.com/500',
      title,
      HttpStatus.INTERNAL_SERVER_ERROR,
      detail,
      additionalProperties?.instance,
      additionalProperties
    );
  }
}