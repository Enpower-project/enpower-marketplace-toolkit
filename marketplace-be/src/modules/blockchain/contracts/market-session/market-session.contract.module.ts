import { Module } from '@nestjs/common';
import { MarketSessionContractService } from './market-session.contract.service';
import { MarketSessionContractController } from './market-session.contract.controller';
import { BlockchainProviderService } from '../../core/blockchain-provider.service';
import { BlockchainConfigService } from '../../core/blockchain-config.service';
import { ContractFactoryService } from '../../core/contract-factory.service';

@Module({
  controllers: [MarketSessionContractController],
  providers: [
    MarketSessionContractService,
    BlockchainProviderService,
    BlockchainConfigService,
    ContractFactoryService,
  ],
  exports: [MarketSessionContractService],
})
export class MarketSessionContractModule {}
