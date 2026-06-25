import { Injectable, Logger } from '@nestjs/common';
import { ethers } from 'ethers';
import { BlockchainProviderService } from './blockchain-provider.service';
import { BlockchainConfigService } from './blockchain-config.service';

/**
 * ContractFactoryService
 *
 * Factory service for creating ethers.js Contract instances.
 * Handles contract instantiation with proper provider/signer configuration.
 */
@Injectable()
export class ContractFactoryService {
  private readonly logger = new Logger(ContractFactoryService.name);

  constructor(
    private providerService: BlockchainProviderService,
    private configService: BlockchainConfigService,
  ) {}

  /**
   * Create a contract instance with admin signer
   * @param contractName - Name of the contract (e.g., 'FLEXIBILITY_TOKEN')
   * @param abi - Contract ABI (Application Binary Interface)
   * @param address - Optional contract address (if not provided, will load from config)
   * @returns Contract instance
   */
  createContract<T = ethers.Contract>(
    contractName: string,
    abi: any,
    address?: string,
  ): T {
    const contractAddress = address || this.configService.getAddress(contractName);
    const signer = this.providerService.getAdminSigner();

    this.logger.debug(
      `Creating contract instance for ${contractName} at ${contractAddress}`
    );

    try {
      return new ethers.Contract(contractAddress, abi, signer) as T;
    } catch (error) {
      this.logger.error(
        `Failed to create contract instance for ${contractName}`,
        error,
      );
      throw error;
    }
  }

  /**
   * Create a contract instance with a custom signer
   * @param contractName - Name of the contract
   * @param abi - Contract ABI
   * @param signer - Custom signer to use
   * @param address - Optional contract address
   * @returns Contract instance
   */
  createContractWithSigner<T = ethers.Contract>(
    contractName: string,
    abi: any,
    signer: ethers.Wallet,
    address?: string,
  ): T {
    const contractAddress = address || this.configService.getAddress(contractName);

    this.logger.debug(
      `Creating contract instance for ${contractName} at ${contractAddress} with custom signer`
    );

    try {
      return new ethers.Contract(contractAddress, abi, signer) as T;
    } catch (error) {
      this.logger.error(
        `Failed to create contract instance for ${contractName} with custom signer`,
        error,
      );
      throw error;
    }
  }

  /**
   * Create a read-only contract instance (connected to provider, not signer)
   * @param contractName - Name of the contract
   * @param abi - Contract ABI
   * @param address - Optional contract address
   * @returns Read-only contract instance
   */
  createReadOnlyContract<T = ethers.Contract>(
    contractName: string,
    abi: any,
    address?: string,
  ): T {
    const contractAddress = address || this.configService.getAddress(contractName);
    const provider = this.providerService.getProvider();

    this.logger.debug(
      `Creating read-only contract instance for ${contractName} at ${contractAddress}`
    );

    try {
      return new ethers.Contract(contractAddress, abi, provider) as T;
    } catch (error) {
      this.logger.error(
        `Failed to create read-only contract instance for ${contractName}`,
        error,
      );
      throw error;
    }
  }

  /**
   * Create a contract instance at a specific address (for dynamic contracts like Market or MarketSession)
   * @param abi - Contract ABI
   * @param address - Contract address
   * @param useSigner - Whether to use admin signer (default: true)
   * @returns Contract instance
   */
  createContractAt<T = ethers.Contract>(
    abi: any,
    address: string,
    useSigner: boolean = true,
  ): T {
    const providerOrSigner = useSigner
      ? this.providerService.getAdminSigner()
      : this.providerService.getProvider();

    this.logger.debug(`Creating contract instance at ${address}`);

    try {
      return new ethers.Contract(address, abi, providerOrSigner) as T;
    } catch (error) {
      this.logger.error(`Failed to create contract instance at ${address}`, error);
      throw error;
    }
  }
}
