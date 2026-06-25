import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
  ConflictException,
} from '@nestjs/common';
import { Response } from 'express';
import { BusinessException } from '../exceptions/business.exception';
import { ErrorCode } from '../enums/error-code.enum';

interface RFC7807Error {
  entity?: string;
  property?: string;
  errorCode: string;
  message: string;
  invalidValue?: any;
}

interface RFC7807Response {
  title: string;
  status: number;
  detail: string;
  errors?: RFC7807Error[];
  instance?: string;
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest();

    let status: HttpStatus;
    let rfc7807Response: RFC7807Response;

    if (exception instanceof BusinessException) {
      status = exception.getStatus();
      rfc7807Response = this.handleBusinessException(exception, request.url);
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      rfc7807Response = this.handleHttpException(exception, request.url);
    } else {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      rfc7807Response = this.handleUnknownException(exception, request.url);
    }

    // Log del error para debugging
    this.logger.error(
      `${request.method} ${request.url} - Status: ${status}`,
      exception instanceof Error ? exception.stack : exception
    );

    response.status(status).json(rfc7807Response);
  }

  private handleBusinessException(
    exception: BusinessException,
    instance: string
  ): RFC7807Response {
    const error: RFC7807Error = {
      entity: exception.entity,
      property: exception.property,
      errorCode: exception.errorCode,
      message: exception.message,
      invalidValue: exception.invalidValue,
    };

    return {
      title: this.getTitle(exception.getStatus()),
      status: exception.getStatus(),
      detail: 'Error en la operación solicitada.',
      errors: [error],
      instance,
    };
  }

  private handleHttpException(
    exception: HttpException,
    instance: string
  ): RFC7807Response {
    const response = exception.getResponse();
    const status = exception.getStatus();

    // Manejar errores de validación de class-validator
    if (status === HttpStatus.BAD_REQUEST && typeof response === 'object') {
      const validationResponse = response as any;
      if (validationResponse.message && Array.isArray(validationResponse.message)) {
        return this.handleValidationErrors(validationResponse.message, instance);
      }
    }

    // Manejar errores específicos con códigos de error apropiados
    const errorCode = this.getErrorCodeFromStatus(status);
    const errorMessage = typeof response === 'string' ? response : exception.message;

    const error: RFC7807Error = {
      errorCode,
      message: errorMessage,
    };

    return {
      title: this.getTitle(status),
      status,
      detail: errorMessage,
      errors: [error],
      instance,
    };
  }

  private handleValidationErrors(
    validationErrors: string[],
    instance: string
  ): RFC7807Response {
    const errors: RFC7807Error[] = validationErrors.map(error => ({
      errorCode: ErrorCode.INVALID_DATA,
      message: error,
    }));

    return {
      title: 'Validation Error',
      status: HttpStatus.BAD_REQUEST,
      detail: 'Hay errores en los datos enviados.',
      errors,
      instance,
    };
  }

  private handleUnknownException(
    exception: unknown,
    instance: string
  ): RFC7807Response {
    return {
      title: 'Internal Server Error',
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      detail: 'Ha ocurrido un error interno del servidor.',
      errors: [{
        errorCode: ErrorCode.INTERNAL_ERROR,
        message: 'Error interno del servidor',
      }],
      instance,
    };
  }

  private getErrorCodeFromStatus(status: HttpStatus): ErrorCode {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return ErrorCode.INVALID_DATA;
      case HttpStatus.UNAUTHORIZED:
        return ErrorCode.UNAUTHORIZED;
      case HttpStatus.FORBIDDEN:
        return ErrorCode.FORBIDDEN;
      case HttpStatus.NOT_FOUND:
        return ErrorCode.NOT_FOUND;
      case HttpStatus.CONFLICT:
        return ErrorCode.ALREADY_EXISTS;
      case HttpStatus.INTERNAL_SERVER_ERROR:
        return ErrorCode.INTERNAL_ERROR;
      default:
        return ErrorCode.INTERNAL_ERROR;
    }
  }

  private getDetailFromStatus(status: HttpStatus): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return 'La solicitud contiene datos inválidos.';
      case HttpStatus.UNAUTHORIZED:
        return 'No está autorizado para realizar esta operación.';
      case HttpStatus.FORBIDDEN:
        return 'No tiene permisos para acceder a este recurso.';
      case HttpStatus.NOT_FOUND:
        return 'El recurso solicitado no fue encontrado.';
      case HttpStatus.CONFLICT:
        return 'El recurso ya existe o hay un conflicto con el estado actual.';
      case HttpStatus.INTERNAL_SERVER_ERROR:
        return 'Ha ocurrido un error interno del servidor.';
      default:
        return 'Ha ocurrido un error en la operación solicitada.';
    }
  }

  private getTitle(status: HttpStatus): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return 'Bad Request';
      case HttpStatus.UNAUTHORIZED:
        return 'Unauthorized';
      case HttpStatus.FORBIDDEN:
        return 'Forbidden';
      case HttpStatus.NOT_FOUND:
        return 'Not Found';
      case HttpStatus.CONFLICT:
        return 'Conflict';
      case HttpStatus.INTERNAL_SERVER_ERROR:
        return 'Internal Server Error';
      default:
        return 'Error';
    }
  }
}