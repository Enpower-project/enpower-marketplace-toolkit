import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { HourlyOfferController } from './hourly-offer.controller';
import { HourlyOfferService } from './hourly-offer.service';
import { HourlyOffer, HourlyOfferSchema } from '../../schemas/HourlyOffer.schema';
import { Session, SessionSchema } from '../../schemas/Session.schema';
import { User, UsersSchema } from '../../schemas/User.schema';
import { TenantModule } from '../tenant/tenant.module';
import { WalletModule } from '../wallet/wallet.module';
import { FlexibilityModule } from '../flexibility/flexibility.module';
import { MarketSessionContractModule } from '../blockchain/contracts/market-session/market-session.contract.module';
import { FlexibilityTokenContractModule } from '../blockchain/contracts/flexibility-token/flexibility-token.contract.module';
import { TreasuryContractModule } from '../blockchain/contracts/treasury/treasury.contract.module';
import { UserService } from '../user/user.service';
import { UserModule } from '../user/user.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: HourlyOffer.name, schema: HourlyOfferSchema },
      { name: Session.name, schema: SessionSchema },
      { name: User.name, schema: UsersSchema },
    ]),
    TenantModule,
    WalletModule,
    forwardRef(() => FlexibilityModule),
    MarketSessionContractModule,
    FlexibilityTokenContractModule,
    TreasuryContractModule,
    UserModule
  ],
  controllers: [HourlyOfferController],
  providers: [HourlyOfferService],
  exports: [HourlyOfferService],
})
export class HourlyOfferModule {}
