import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { getValidLanguage } from '../config/i18n.config';

export const Language = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();

    // Get language from various sources
    const language =
      request.headers['language'] ||
      request.headers['accept-language'] ||
      request.query.lang;

    return getValidLanguage(language);
  },
);