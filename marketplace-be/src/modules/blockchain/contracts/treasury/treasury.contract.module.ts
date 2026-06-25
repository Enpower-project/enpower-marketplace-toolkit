import { Module } from '@nestjs/common';
import { TreasuryContractService } from './treasury.contract.service';
import { TreasuryContractController } from './treasury.contract.controller';
import { BlockchainProviderService } from '../../core/blockchain-provider.service';
import { BlockchainConfigService } from '../../core/blockchain-config.service';
import { ContractFactoryService } from '../../core/contract-factory.service';

@Module({
  controllers: [TreasuryContractController],
  providers: [
    TreasuryContractService,
    BlockchainProviderService,
    BlockchainConfigService,
    ContractFactoryService,
  ],
  exports: [TreasuryContractService],
})
export class TreasuryContractModule {}
