import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode } from '../enums/error-code.enum';
import { BusinessException } from './business.exception';

export class ValidationException extends BusinessException {
  constructor(
    errorCode: ErrorCode,
    entity: string,
    property: string,
    invalidValue?: any,
    message?: string
  ) {
    super(errorCode, entity, property, invalidValue, message, HttpStatus.BAD_REQUEST);
  }
}