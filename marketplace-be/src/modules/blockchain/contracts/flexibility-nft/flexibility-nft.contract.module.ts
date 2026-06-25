import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FlexibilityNFTContractService } from './flexibility-nft.contract.service';
import { FlexibilityNFTContractController } from './flexibility-nft.contract.controller';
import { BlockchainProviderService } from '../../core/blockchain-provider.service';
import { BlockchainConfigService } from '../../core/blockchain-config.service';
import { ContractFactoryService } from '../../core/contract-factory.service';
import { Settlement, SettlementSchema } from '../../../settlement/schemas/settlement.schema';
import { User, UsersSchema } from '../../../../schemas/User.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Settlement.name, schema: SettlementSchema },
      { name: User.name, schema: UsersSchema },
    ]),
  ],
  controllers: [FlexibilityNFTContractController],
  providers: [
    FlexibilityNFTContractService,
    BlockchainProviderService,
    BlockchainConfigService,
    ContractFactoryService,
  ],
  exports: [FlexibilityNFTContractService],
})
export class FlexibilityNFTContractModule {}
