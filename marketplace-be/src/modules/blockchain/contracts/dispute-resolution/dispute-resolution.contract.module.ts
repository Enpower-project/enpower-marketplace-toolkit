import { Module } from '@nestjs/common';
import { DisputeResolutionContractService } from './dispute-resolution.contract.service';
import { DisputeResolutionContractController } from './dispute-resolution.contract.controller';
import { BlockchainProviderService } from '../../core/blockchain-provider.service';
import { BlockchainConfigService } from '../../core/blockchain-config.service';
import { ContractFactoryService } from '../../core/contract-factory.service';

@Module({
  controllers: [DisputeResolutionContractController],
  providers: [
    DisputeResolutionContractService,
    BlockchainProviderService,
    BlockchainConfigService,
    ContractFactoryService,
  ],
  exports: [DisputeResolutionContractService],
})
export class DisputeResolutionContractModule {}
