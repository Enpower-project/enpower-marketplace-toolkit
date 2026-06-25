import { Injectable, Logger } from '@nestjs/common';
import { ethers } from 'ethers';
import { ContractFactoryService } from '../../core/contract-factory.service';
import { MarketInfoDto } from './dto/market-factory.dto';
import * as MarketFactoryABI from '../../../../contracts/MarketFactory.json';

/**
 * MarketFactoryContractService
 *
 * Service for interacting with the MarketFactory smart contract.
 * Handles market creation and management.
 */
@Injectable()
export class MarketFactoryContractService {
  private readonly logger = new Logger(MarketFactoryContractService.name);
  private contract: ethers.Contract;

  // Role hash
  private readonly MARKETPLACE_ADMIN = ethers.keccak256(
    ethers.toUtf8Bytes('MARKETPLACE_ADMIN'),
  );

  constructor(private contractFactory: ContractFactoryService) {
    this.initializeContract();
  }

  private initializeContract(): void {
    try {
      this.contract = this.contractFactory.createContract(
        'MARKET_FACTORY',
        MarketFactoryABI.abi,
      );
      this.logger.log('MarketFactory contract initialized');
    } catch (error) {
      this.logger.error('Failed to initialize MarketFactory contract', error);
      throw error;
    }
  }

  /**
   * Create a new market
   * @param communityId - Community identifier
   * @param region - Geographic region
   * @param ownerAddress - Address of the market owner (FMO/LMO)
   * @returns Market ID and transaction object
   */
  async createMarket(
    communityId: string,
    region: string,
    ownerAddress: string,
  ): Promise<{ marketId: number; tx: ethers.ContractTransactionResponse }> {
    try {
      this.logger.log(
        `Creating market for community ${communityId} in region ${region} with owner ${ownerAddress}`,
      );
      const tx = await this.contract.createMarket(communityId, region, ownerAddress);
      this.logger.log(`Create market transaction sent: ${tx.hash}`);

      // Wait for transaction and extract marketId from events
      const receipt = await tx.wait();
      const event = receipt.logs.find((log: any) => {
        try {
          const parsed = this.contract.interface.parseLog(log);
          return parsed && parsed.name === 'MarketCreated';
        } catch {
          return false;
        }
      });

      if (!event) {
        throw new Error('MarketCreated event not found in transaction receipt');
      }

      const parsedEvent = this.contract.interface.parseLog(event);
      const marketId = Number(parsedEvent?.args[0]);

      this.logger.log(`Market created with ID: ${marketId}`);
      return { marketId, tx };
    } catch (error) {
      this.logger.error('Failed to create market', error);
      
      // Mensaje genérico para todos los errores de blockchain
      throw new Error('The blockchain transaction could not be completed. Please contact the administrator.');
    }
  }

  /**
   * Deactivate a market
   * @param marketId - ID of the market to deactivate
   * @returns Transaction object
   */
  async deactivateMarket(marketId: number): Promise<ethers.ContractTransactionResponse> {
    try {
      this.logger.log(`Deactivating market ${marketId}`);
      const tx = await this.contract.deactivateMarket(marketId);
      this.logger.log(`Deactivate market transaction sent: ${tx.hash}`);
      return tx;
    } catch (error) {
      this.logger.error(`Failed to deactivate market ${marketId}`, error);
      
      // Mensaje genérico para todos los errores de blockchain
      throw new Error('The blockchain transaction could not be completed. Please contact the administrator.');
    }
  }

  /**
   * Reactivate a market
   * @param marketId - ID of the market to reactivate
   * @returns Transaction object
   */
  async reactivateMarket(marketId: number): Promise<ethers.ContractTransactionResponse> {
    try {
      this.logger.log(`Reactivating market ${marketId}`);
      const tx = await this.contract.reactivateMarket(marketId);
      this.logger.log(`Reactivate market transaction sent: ${tx.hash}`);
      return tx;
    } catch (error) {
      this.logger.error(`Failed to reactivate market ${marketId}`, error);
      
      // Mensaje genérico para todos los errores de blockchain
      throw new Error('The blockchain transaction could not be completed. Please contact the administrator.');
    }
  }

  /**
   * Get market information
   * @param marketId - ID of the market
   * @returns Market information
   */
  async getMarket(marketId: number): Promise<MarketInfoDto> {
    try {
      const market = await this.contract.markets(marketId);
      return {
        marketAddress: market.marketAddress,
        communityId: market.communityId,
        region: market.region,
        owner: market.owner,
        isActive: market.isActive,
        createdAt: Number(market.createdAt),
      };
    } catch (error) {
      this.logger.error(`Failed to get market ${marketId}`, error);
      
      // Mensaje genérico para todos los errores de blockchain
      throw new Error('The blockchain transaction could not be completed. Please contact the administrator.');
    }
  }

  /**
   * Get total number of markets created
   * @returns Market count
   */
  async getMarketCount(): Promise<number> {
    try {
      const count: bigint = await this.contract.marketCount();
      return Number(count);
    } catch (error) {
      this.logger.error('Failed to get market count', error);
      throw error;
    }
  }

  /**
   * Grant MARKETPLACE_ADMIN role to an address
   * @param address - Address to grant role
   * @returns Transaction object
   */
  async grantMarketplaceAdmin(
    address: string,
  ): Promise<ethers.ContractTransactionResponse> {
    try {
      this.logger.log(`Granting MARKETPLACE_ADMIN role to ${address}`);
      const tx = await this.contract.grantRole(this.MARKETPLACE_ADMIN, address);
      this.logger.log(`Grant MARKETPLACE_ADMIN role transaction sent: ${tx.hash}`);
      return tx;
    } catch (error) {
      this.logger.error(`Failed to grant MARKETPLACE_ADMIN role to ${address}`, error);
      
      // Mensaje genérico para todos los errores de blockchain
      throw new Error('The blockchain transaction could not be completed. Please contact the administrator.');
    }
  }

  /**
   * Revoke MARKETPLACE_ADMIN role from an address
   * @param address - Address to revoke role from
   * @returns Transaction object
   */
  async revokeMarketplaceAdmin(
    address: string,
  ): Promise<ethers.ContractTransactionResponse> {
    try {
      this.logger.log(`Revoking MARKETPLACE_ADMIN role from ${address}`);
      const tx = await this.contract.revokeRole(this.MARKETPLACE_ADMIN, address);
      this.logger.log(`Revoke MARKETPLACE_ADMIN role transaction sent: ${tx.hash}`);
      return tx;
    } catch (error) {
      this.logger.error(`Failed to revoke MARKETPLACE_ADMIN role from ${address}`, error);
      
      // Mensaje genérico para todos los errores de blockchain
      throw new Error('The blockchain transaction could not be completed. Please contact the administrator.');
    }
  }

  /**
   * Create a new market using a custom user wallet (for PIN-authenticated users)
   * @param communityId - Community identifier (MongoDB marketId)
   * @param region - Geographic region
   * @param ownerAddress - Address of the market owner (FMO/LMO)
   * @param userWallet - User's wallet for signing the transaction
   * @returns Market ID, market address, and transaction hash
   */
  async createMarketWithUserWallet(
    communityId: string,
    region: string,
    ownerAddress: string,
    userWallet: ethers.Wallet,
  ): Promise<{ marketId: number; marketAddress: string; txHash: string }> {
    try {
      this.logger.log(
        `Creating market for community ${communityId} in region ${region} with owner ${ownerAddress} using user wallet`,
      );

      // Create contract instance with user's wallet instead of admin wallet
      const userMarketFactory = this.contractFactory.createContractWithSigner(
        'MARKET_FACTORY',
        MarketFactoryABI.abi,
        userWallet,
      );

      // Call createMarket
      const tx = await userMarketFactory.createMarket(communityId, region, ownerAddress);
      this.logger.log(`Create market transaction sent: ${tx.hash}`);

      // Wait for transaction and extract marketId and marketAddress from events
      const receipt = await tx.wait();
      const event = receipt.logs.find((log: any) => {
        try {
          const parsed = userMarketFactory.interface.parseLog(log);
          return parsed && parsed.name === 'MarketCreated';
        } catch {
          return false;
        }
      });

      if (!event) {
        throw new Error('MarketCreated event not found in transaction receipt');
      }

      const parsedEvent = userMarketFactory.interface.parseLog(event);
      const marketId = Number(parsedEvent?.args[0]); // First arg is marketId
      const marketAddress = parsedEvent?.args[1]; // Second arg is marketAddress

      this.logger.log(`Market created with ID: ${marketId}, Address: ${marketAddress}`);
      return { marketId, marketAddress, txHash: tx.hash };
    } catch (error) {
      this.logger.error('Failed to create market with user wallet', error);
      
      // Mensaje genérico para todos los errores de blockchain
      throw new Error('The blockchain transaction could not be completed. Please contact the administrator.');
    }
  }

  /**
   * Get contract address
   */
  getContractAddress(): string {
    return this.contract.target as string;
  }
}
