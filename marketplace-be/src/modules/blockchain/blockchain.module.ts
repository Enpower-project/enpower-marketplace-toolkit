import { Module, Global } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import { BlockchainService } from './blockchain.service';
import { Market, MarketSchema } from '../../schemas/Market.schema';
import { FlexibilityTokenModule } from '../flexibility-token/flexibility-token.module';

// Core services
import { BlockchainProviderService } from './core/blockchain-provider.service';
import { BlockchainConfigService } from './core/blockchain-config.service';
import { ContractFactoryService } from './core/contract-factory.service';

// Contract modules
import { FlexibilityTokenContractModule } from './contracts/flexibility-token/flexibility-token.contract.module';
import { ParticipantRegistryContractModule } from './contracts/participant-registry/participant-registry.contract.module';
import { TreasuryContractModule } from './contracts/treasury/treasury.contract.module';
import { FlexibilityNFTContractModule } from './contracts/flexibility-nft/flexibility-nft.contract.module';
import { MarketFactoryContractModule } from './contracts/market-factory/market-factory.contract.module';
import { MarketContractModule } from './contracts/market/market.contract.module';
import { MarketSessionContractModule } from './contracts/market-session/market-session.contract.module';
import { DisputeResolutionContractModule } from './contracts/dispute-resolution/dispute-resolution.contract.module';

// Contract services (for direct export)
import { FlexibilityTokenContractService } from './contracts/flexibility-token/flexibility-token.contract.service';
import { ParticipantRegistryContractService } from './contracts/participant-registry/participant-registry.contract.service';
import { TreasuryContractService } from './contracts/treasury/treasury.contract.service';
import { FlexibilityNFTContractService } from './contracts/flexibility-nft/flexibility-nft.contract.service';
import { MarketFactoryContractService } from './contracts/market-factory/market-factory.contract.service';
import { MarketContractService } from './contracts/market/market.contract.service';
import { MarketSessionContractService } from './contracts/market-session/market-session.contract.service';
import { DisputeResolutionContractService } from './contracts/dispute-resolution/dispute-resolution.contract.service';

/**
 * BlockchainModule
 *
 * Main module for blockchain interactions.
 * Organized by smart contract with dedicated services for each contract.
 *
 * @Global decorator makes services available throughout the application
 */
@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Market.name, schema: MarketSchema }
    ]),
    FlexibilityTokenModule,
    ConfigModule,
    // Import all contract modules
    FlexibilityTokenContractModule,
    ParticipantRegistryContractModule,
    TreasuryContractModule,
    FlexibilityNFTContractModule,
    MarketFactoryContractModule,
    MarketContractModule,
    MarketSessionContractModule,
    DisputeResolutionContractModule,
  ],
  providers: [
    // Legacy service (mantener compatibilidad)
    BlockchainService,
    // Core services
    BlockchainProviderService,
    BlockchainConfigService,
    ContractFactoryService,
    // Contract services
    FlexibilityTokenContractService,
    ParticipantRegistryContractService,
    TreasuryContractService,
    FlexibilityNFTContractService,
    MarketFactoryContractService,
    MarketContractService,
    MarketSessionContractService,
    DisputeResolutionContractService,
  ],
  exports: [
    // Legacy service (mantener compatibilidad)
    BlockchainService,
    // Export core services
    BlockchainProviderService,
    BlockchainConfigService,
    ContractFactoryService,
    // Export all contract services
    FlexibilityTokenContractService,
    ParticipantRegistryContractService,
    TreasuryContractService,
    FlexibilityNFTContractService,
    MarketFactoryContractService,
    MarketContractService,
    MarketSessionContractService,
    DisputeResolutionContractService,
  ],
})
export class BlockchainModule {}