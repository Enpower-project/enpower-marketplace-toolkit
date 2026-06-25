import { Module } from '@nestjs/common';
import { FlexibilityTokenContractService } from './flexibility-token.contract.service';
import { FlexibilityTokenContractController } from './flexibility-token.contract.controller';
import { BlockchainProviderService } from '../../core/blockchain-provider.service';
import { BlockchainConfigService } from '../../core/blockchain-config.service';
import { ContractFactoryService } from '../../core/contract-factory.service';

@Module({
  controllers: [FlexibilityTokenContractController],
  providers: [
    FlexibilityTokenContractService,
    BlockchainProviderService,
    BlockchainConfigService,
    ContractFactoryService,
  ],
  exports: [FlexibilityTokenContractService],
})
export class FlexibilityTokenContractModule {}
