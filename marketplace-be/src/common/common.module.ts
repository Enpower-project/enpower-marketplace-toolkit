import { Module } from '@nestjs/common';
import { ErrorService } from './services/error.service';
import { I18nModule } from 'nestjs-i18n';
import { RFC7807Exception } from './exceptions/rfc7807.exception';

@Module({
  imports: [
    I18nModule
  ],
  providers: [
    ErrorService,
    RFC7807Exception
  ],
  exports: [
    ErrorService,
    RFC7807Exception
  ]
})
export class CommonModule { }