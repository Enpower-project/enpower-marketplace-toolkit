import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import { WalletService } from './wallet.service';
import { WalletController } from './wallet.controller';
import { EncryptionService } from './encryption.service';
import { User, UsersSchema } from '../../schemas/User.schema';
import { Market, MarketSchema } from '../../schemas/Market.schema';
import { UserModule } from '../user/user.module';
import { MarketFactoryModule } from '../market-factory/market-factory.module';
import { EmailModule } from '../email/email.module';
import { BlockchainModule } from '../blockchain/blockchain.module';
import { TransactionCache, TransactionCacheSchema } from 'src/schemas/TransactionCache.schema';
import { ParticipantRegistryContractService } from '../blockchain/contracts/participant-registry/participant-registry.contract.service';
import { FlexibilityTokenContractService } from '../blockchain/contracts/flexibility-token/flexibility-token.contract.service';
import { TreasuryContractService } from '../blockchain/contracts/treasury/treasury.contract.service';
import { SessionService } from '../session/session.service';
import { SessionModule } from '../session/session.module';
import { Session, SessionSchema } from 'src/schemas/Session.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UsersSchema },
      { name: Market.name, schema: MarketSchema },
      { name: TransactionCache.name, schema: TransactionCacheSchema },
      { name: Session.name, schema: SessionSchema}
    ]),
    ConfigModule,
    forwardRef(() => UserModule), // Use forwardRef to avoid circular dependency
    forwardRef(() => MarketFactoryModule), // Add MarketFactoryModule
    forwardRef(() => SessionModule),
    EmailModule, // Add EmailModule
    BlockchainModule, // Add BlockchainModule for ParticipantRegistry access,
  ],
  providers: [WalletService, EncryptionService,
    ParticipantRegistryContractService,
    FlexibilityTokenContractService,
    TreasuryContractService
  ],
  controllers: [WalletController],
  exports: [WalletService, EncryptionService]
})
export class WalletModule { }