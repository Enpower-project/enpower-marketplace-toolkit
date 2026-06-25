import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * BlockchainConfigService
 *
 * Centralized configuration service for smart contract addresses.
 * Loads contract addresses from environment variables.
 */
@Injectable()
export class BlockchainConfigService {
  private readonly logger = new Logger(BlockchainConfigService.name);
  private readonly addresses: Record<string, string>;

  constructor(private configService: ConfigService) {
    this.addresses = this.loadContractAddresses();
    this.validateAddresses();
  }

  /**
   * Load contract addresses from environment variables
   */
  private loadContractAddresses(): Record<string, string> {
    return {
      FLEXIBILITY_TOKEN: this.configService.get<string>('FLEXIBILITY_TOKEN_ADDRESS', ''),
      PARTICIPANT_REGISTRY: this.configService.get<string>('PARTICIPANT_REGISTRY_ADDRESS', ''),
      TREASURY: this.configService.get<string>('TREASURY_ADDRESS', ''),
      FLEXIBILITY_NFT: this.configService.get<string>('FLEXIBILITY_NFT_ADDRESS', ''),
      MARKET_FACTORY: this.configService.get<string>('MARKET_FACTORY_ADDRESS', ''),
    };
  }

  /**
   * Validate that all required contract addresses are configured
   */
  private validateAddresses(): void {
    const missing: string[] = [];

    Object.entries(this.addresses).forEach(([name, address]) => {
      if (!address || address === '') {
        missing.push(name);
      }
    });

    if (missing.length > 0) {
      const missingList = missing.join(', ');
      this.logger.warn(`Missing contract addresses: ${missingList}`);
      this.logger.warn('Some blockchain features may not work correctly');
    } else {
      this.logger.log('All contract addresses loaded successfully');
    }
  }

  /**
   * Get contract address by name
   * @param contractName - Name of the contract (e.g., 'FLEXIBILITY_TOKEN', 'MARKET_FACTORY')
   * @returns Contract address
   * @throws Error if contract address is not configured
   */
  getAddress(contractName: string): string {
    const address = this.addresses[contractName];

    if (!address || address === '') {
      throw new Error(
        `Contract address for '${contractName}' is not configured. ` +
        `Please set ${contractName}_ADDRESS in environment variables.`
      );
    }

    return address;
  }

  /**
   * Get all configured contract addresses
   */
  getAllAddresses(): Record<string, string> {
    return { ...this.addresses };
  }

  /**
   * Check if a contract address is configured
   */
  hasAddress(contractName: string): boolean {
    const address = this.addresses[contractName];
    return !!address && address !== '';
  }

  /**
   * Get contract address safely (returns undefined if not configured)
   */
  getAddressSafe(contractName: string): string | undefined {
    const address = this.addresses[contractName];
    return address && address !== '' ? address : undefined;
  }
}
