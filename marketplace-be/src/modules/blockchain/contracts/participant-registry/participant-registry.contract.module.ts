import { Module } from '@nestjs/common';
import { ParticipantRegistryContractService } from './participant-registry.contract.service';
import { ParticipantRegistryContractController } from './participant-registry.contract.controller';
import { BlockchainProviderService } from '../../core/blockchain-provider.service';
import { BlockchainConfigService } from '../../core/blockchain-config.service';
import { ContractFactoryService } from '../../core/contract-factory.service';

@Module({
  controllers: [ParticipantRegistryContractController],
  providers: [
    ParticipantRegistryContractService,
    BlockchainProviderService,
    BlockchainConfigService,
    ContractFactoryService,
  ],
  exports: [ParticipantRegistryContractService],
})
export class ParticipantRegistryContractModule {}
