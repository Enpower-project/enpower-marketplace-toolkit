import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode } from '../enums/error-code.enum';
import { BusinessException } from './business.exception';

export class BlockchainException extends BusinessException {
  constructor(
    errorCode: ErrorCode,
    message?: string,
    public readonly txHash?: string
  ) {
    super(errorCode, undefined, undefined, undefined, message, HttpStatus.INTERNAL_SERVER_ERROR);
  }
}