import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Market, MarketSchema } from 'src/schemas/Market.schema';
import { User, UsersSchema } from 'src/schemas/User.schema';
import { MarketFactoryService } from './market-factory.service';
import { MarketFactoryController } from './market-factory.controller';
import { AuthModule } from '../auth/auth.module';
import { UserModule } from '../user/user.module';
import { EmailModule } from '../email/email.module';
import { TenantModule } from '../tenant/tenant.module';
import { WalletModule } from '../wallet/wallet.module';
import { BlockchainModule } from '../blockchain/blockchain.module';
import { FlexibilityTokenModule } from '../flexibility-token/flexibility-token.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Market.name, schema: MarketSchema },
      { name: User.name, schema: UsersSchema }
    ]),
    AuthModule,
    UserModule,
    EmailModule,
    TenantModule,
    forwardRef(() => WalletModule),
    BlockchainModule,
    FlexibilityTokenModule,

  ],
  providers: [MarketFactoryService],
  exports: [MarketFactoryService, MongooseModule],
  controllers: [MarketFactoryController],
})
export class MarketFactoryModule { }
