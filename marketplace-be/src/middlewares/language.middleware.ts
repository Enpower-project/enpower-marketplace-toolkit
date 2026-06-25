import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { getValidLanguage } from '../config/i18n.config';

@Injectable()
export class LanguageMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    // Get language from various sources
    const requestedLanguage =
      req.headers['language'] as string ||
      req.headers['accept-language'] as string ||
      (req.query.lang as string);

    // Validate and set the language
    const validLanguage = getValidLanguage(requestedLanguage);

    // Add the validated language to the request object
    (req as any).language = validLanguage;

    // Set response header to indicate the language being used
    res.setHeader('Content-Language', validLanguage);

    next();
  }
}