import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode } from '../enums/error-code.enum';

export class BusinessException extends HttpException {
  constructor(
    public readonly errorCode: ErrorCode,
    public readonly entity?: string,
    public readonly property?: string,
    public readonly invalidValue?: any,
    message?: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST
  ) {
    super(message || errorCode, status);
  }
}