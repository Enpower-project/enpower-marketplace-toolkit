import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MarketFactoryContractService } from './market-factory.contract.service';
import { MarketFactoryContractController } from './market-factory.contract.controller';
import { BlockchainProviderService } from '../../core/blockchain-provider.service';
import { BlockchainConfigService } from '../../core/blockchain-config.service';
import { ContractFactoryService } from '../../core/contract-factory.service';
import { WalletModule } from '../../../wallet/wallet.module';
import { ParticipantRegistryContractModule } from '../participant-registry/participant-registry.contract.module';
import { FlexibilityTokenContractModule } from '../flexibility-token/flexibility-token.contract.module';
import { Market, MarketSchema } from '../../../../schemas/Market.schema';
import { User, UsersSchema } from '../../../../schemas/User.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Market.name, schema: MarketSchema },
      { name: User.name, schema: UsersSchema }
    ]),
    forwardRef(() => WalletModule),
    ParticipantRegistryContractModule,
    FlexibilityTokenContractModule,

  ],
  controllers: [MarketFactoryContractController],
  providers: [
    MarketFactoryContractService,
    BlockchainProviderService,
    BlockchainConfigService,
    ContractFactoryService,
  ],
  exports: [MarketFactoryContractService],
})
export class MarketFactoryContractModule {}
