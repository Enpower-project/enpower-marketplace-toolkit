import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SessionController } from './session.controller';
import { SessionService } from './session.service';
import { Session, SessionSchema } from '../../schemas/Session.schema';
import { Market, MarketSchema } from '../../schemas/Market.schema';
import { User, UsersSchema } from '../../schemas/User.schema';
import { BlockchainModule } from '../blockchain/blockchain.module';
import { WalletModule } from '../wallet/wallet.module';
import { SessionOfferReminderJob } from 'src/jobs/sessionOfferReminder.job';
import { EmailModule } from '../email/email.module';
import { HourlyOffer, HourlyOfferSchema } from 'src/schemas/HourlyOffer.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Session.name, schema: SessionSchema },
      { name: Market.name, schema: MarketSchema },
      { name: User.name, schema: UsersSchema },
      { name: HourlyOffer.name, schema: HourlyOfferSchema },
    ]),
    BlockchainModule,
    EmailModule,
    forwardRef(() => WalletModule),
  ],
  controllers: [SessionController],
  providers: [SessionService, SessionOfferReminderJob],
  exports: [SessionService],
})
export class SessionModule {}