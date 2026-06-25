import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { HttpModule } from '@nestjs/axios';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { User, UsersSchema } from '../../schemas/User.schema';
import { Market, MarketSchema } from '../../schemas/Market.schema';
import { EmailModule } from '../email/email.module';
import { WalletModule } from '../wallet/wallet.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UsersSchema },
      { name: Market.name, schema: MarketSchema },
    ]),
    HttpModule,
    EmailModule,
    forwardRef(() => WalletModule)
  ],
  controllers: [
    AuthController,
  ],
  providers: [
    AuthService,
  ],
  exports: [
    AuthService,
  ]
})
export class AuthModule { }