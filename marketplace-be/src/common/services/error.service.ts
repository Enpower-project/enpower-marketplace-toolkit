import { Injectable } from '@nestjs/common';
import { RFC7807Exception } from '../exceptions/rfc7807.exception';
import { I18nService } from 'nestjs-i18n';

@Injectable()
export class ErrorService {
  constructor(private readonly i18n: I18nService) { }

  createBadRequestError(title: string, lang?: string, detail?: string): RFC7807Exception {
    return RFC7807Exception.badRequest(
      title,
      detail,
      { lang, timestamp: new Date().toISOString() }
    );
  }

  createUnauthorizedError(title: string, lang?: string, detail?: string): RFC7807Exception {
    return RFC7807Exception.unauthorized(
      title,
      detail,
      { lang, timestamp: new Date().toISOString() }
    );
  }

  createForbiddenError(title: string, lang?: string, detail?: string): RFC7807Exception {
    return RFC7807Exception.forbidden(
      title,
      detail,
      { lang, timestamp: new Date().toISOString() }
    );
  }

  createNotFoundError(title: string, lang?: string, detail?: string): RFC7807Exception {
    return RFC7807Exception.notFound(
      title,
      detail,
      { lang, timestamp: new Date().toISOString() }
    );
  }

  createConflictError(title: string, lang?: string, detail?: string): RFC7807Exception {
    return RFC7807Exception.conflict(
      title,
      detail,
      { lang, timestamp: new Date().toISOString() }
    );
  }

  createUnprocessableEntityError(title: string, lang?: string, detail?: string): RFC7807Exception {
    return RFC7807Exception.unprocessableEntity(
      title,
      detail,
      { lang, timestamp: new Date().toISOString() }
    );
  }

  createInternalServerError(title: string, detail?: string): RFC7807Exception {
    return RFC7807Exception.internalServerError(
      title,
      detail,
      { timestamp: new Date().toISOString() }
    );
  }

  createUserNotFoundError(lang?: string): RFC7807Exception {
    const title = this.i18n.translate('common.errors.user_not_found', { lang });
    return this.createNotFoundError(title, lang);
  }

  createWalletNotFoundError(lang?: string): RFC7807Exception {
    const title = this.i18n.translate('common.errors.wallet_not_found', { lang });
    return this.createNotFoundError(title, lang);
  }

  createInvalidPinError(lang?: string): RFC7807Exception {
    const title = this.i18n.translate('common.errors.invalid_pin', { lang });
    return this.createBadRequestError(title, lang);
  }

  createBlockchainError(detail: string, lang?: string): RFC7807Exception {
    const title = this.i18n.translate('common.errors.blockchain_error', { lang });
    return this.createInternalServerError(title, detail);
  }

  createContractError(detail: string, lang?: string): RFC7807Exception {
    const title = this.i18n.translate('common.errors.contract_error', { lang });
    return this.createInternalServerError(title, detail);
  }
}