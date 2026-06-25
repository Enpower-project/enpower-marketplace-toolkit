import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TenantModule } from '../tenant/tenant.module';
import { UserModule } from '../user/user.module';

import { User, UsersSchema } from 'src/schemas/User.schema';
import { Session, SessionSchema } from 'src/schemas/Session.schema';
import { HourlyOffer, HourlyOfferSchema } from 'src/schemas/HourlyOffer.schema';

import { SwaggerRootRedirectController } from './swagger.controller';

@Module({
  imports: [
    TenantModule,
  ],
  controllers: [
    SwaggerRootRedirectController
  ],
  providers: [
  ],
  exports: [
  ],
})
export class SwaggerModule {}
