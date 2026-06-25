import { Module } from '@nestjs/common';
import { MarketContractService } from './market.contract.service';
import { MarketContractController } from './market.contract.controller';
import { BlockchainProviderService } from '../../core/blockchain-provider.service';
import { BlockchainConfigService } from '../../core/blockchain-config.service';
import { ContractFactoryService } from '../../core/contract-factory.service';

@Module({
  controllers: [MarketContractController],
  providers: [
    MarketContractService,
    BlockchainProviderService,
    BlockchainConfigService,
    ContractFactoryService,
  ],
  exports: [MarketContractService],
})
export class MarketContractModule {}
