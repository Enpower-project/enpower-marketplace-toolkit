import { Module } from '@nestjs/common';
import { FlexibilityTokenService } from './flexibility-token.service';

@Module({
  providers: [FlexibilityTokenService],
  exports: [FlexibilityTokenService],
})
export class FlexibilityTokenModule {}
