import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { SUPPORTED_LANGUAGES, LANGUAGE_NAMES } from './config/i18n.config';
import { Public } from './decorators/public.decorator';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) { }

  @Get()
  @Public()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('languages')
  @Public()
  getSupportedLanguages() {
    return {
      supported: SUPPORTED_LANGUAGES,
      names: LANGUAGE_NAMES,
      default: 'en'
    };
  }
}