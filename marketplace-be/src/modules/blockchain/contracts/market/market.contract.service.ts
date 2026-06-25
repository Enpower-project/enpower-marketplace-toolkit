import { Injectable, Logger } from '@nestjs/common';
import { ethers } from 'ethers';
import { ContractFactoryService } from '../../core/contract-factory.service';
import { FlexibilityRequestInputDto, SessionInfoDto } from './dto/market.dto';
import { SessionStatus } from '../../types/blockchain.types';
import * as MarketABI from '../../../../contracts/Market.json';

/**
 * MarketContractService
 *
 * Service for interacting with Market smart contracts.
 * Handles session creation and management for specific markets.
 */
@Injectable()
export class MarketContractService {
  private readonly logger = new Logger(MarketContractService.name);

  constructor(private contractFactory: ContractFactoryService) {}

  /**
   * Get a Market contract instance at a specific address
   * @param marketAddress - Address of the Market contract
   * @returns Market contract instance
   */
  private getMarketContract(marketAddress: string): ethers.Contract {
    return this.contractFactory.createContractAt(MarketABI.abi, marketAddress);
  }

  /**
   * Create a new market session with flexibility requests
   * @param marketAddress - Address of the Market contract
   * @param deliveryDay - Timestamp of the delivery day
   * @param treasuryAddress - Treasury contract address
   * @param fmoLmoAddress - FMO/LMO address for this session
   * @param frpAddress - FRP address that requested flexibility
   * @param requests - Array of flexibility requests
   * @returns Session ID, session address, and transaction object
   */
  async createSession(
    marketAddress: string,
    deliveryDay: number,
    treasuryAddress: string,
    fmoLmoAddress: string,
    frpAddress: string,
    requests: FlexibilityRequestInputDto[],
  ): Promise<{
    sessionId: number;
    sessionAddress: string;
    tx: ethers.ContractTransactionResponse;
  }> {
    try {
      const contract = this.getMarketContract(marketAddress);

      // Convert requests to tuple format for Solidity
      const requestTuples = requests.map((req) => [
        req.hourSlot,
        req.quantity,
        req.price,
        req.flexType,
      ]);

      this.logger.log(
        `Creating session on market ${marketAddress} for delivery day ${deliveryDay}`,
      );

      const tx = await contract.createSession(
        deliveryDay,
        treasuryAddress,
        fmoLmoAddress,
        frpAddress,
        requestTuples,
      );

      this.logger.log(`Create session transaction sent: ${tx.hash}`);

      // Wait for transaction and extract sessionId and sessionAddress from events
      const receipt = await tx.wait();
      const event = receipt.logs.find((log: any) => {
        try {
          const parsed = contract.interface.parseLog(log);
          return parsed?.name === 'SessionCreated';
        } catch {
          return false;
        }
      });

      if (!event) {
        throw new Error('SessionCreated event not found in transaction receipt');
      }

      const parsedEvent = contract.interface.parseLog(event);
      const sessionId = Number(parsedEvent?.args[0]);
      const sessionAddress = parsedEvent?.args[1];

      this.logger.log(`Session created with ID: ${sessionId}, address: ${sessionAddress}`);
      return { sessionId, sessionAddress, tx };
    } catch (error) {
      this.logger.error(`Failed to create session on market ${marketAddress}`, error);      
      // Mensaje genérico para todos los errores de blockchain
      throw new Error('The blockchain transaction could not be completed. Please contact the administrator.');
    }
  }

  /**
   * Get session information
   * @param marketAddress - Address of the Market contract
   * @param sessionId - Session ID
   * @returns Session information
   */
  async getSession(marketAddress: string, sessionId: number): Promise<SessionInfoDto> {
    try {
      const contract = this.getMarketContract(marketAddress);
      const session = await contract.sessions(sessionId);

      return {
        sessionAddress: session.sessionAddress,
        deliveryDay: Number(session.deliveryDay),
        createdAt: Number(session.createdAt),
        status: Number(session.status) as SessionStatus,
      };
    } catch (error) {
      this.logger.error(
        `Failed to get session ${sessionId} on market ${marketAddress}`,
        error,
      );      
      // Mensaje genérico para todos los errores de blockchain
      throw new Error('The blockchain transaction could not be completed. Please contact the administrator.');
    }
  }

  /**
   * Get total number of sessions in a market
   * @param marketAddress - Address of the Market contract
   * @returns Session count
   */
  async getSessionCount(marketAddress: string): Promise<number> {
    try {
      const contract = this.getMarketContract(marketAddress);
      const count: bigint = await contract.sessionCount();
      return Number(count);
    } catch (error) {
      this.logger.error(`Failed to get session count for market ${marketAddress}`, error);      
      // Mensaje genérico para todos los errores de blockchain
      throw new Error('The blockchain transaction could not be completed. Please contact the administrator.');
    }
  }

  /**
   * Set participant registry for a market
   * @param marketAddress - Address of the Market contract
   * @param registryAddress - Address of ParticipantRegistry contract
   * @returns Transaction object
   */
  async setParticipantRegistry(
    marketAddress: string,
    registryAddress: string,
  ): Promise<ethers.ContractTransactionResponse> {
    try {
      const contract = this.getMarketContract(marketAddress);
      this.logger.log(
        `Setting participant registry ${registryAddress} for market ${marketAddress}`,
      );
      const tx = await contract.setParticipantRegistry(registryAddress);
      this.logger.log(`Set participant registry transaction sent: ${tx.hash}`);
      return tx;
    } catch (error) {
      this.logger.error(
        `Failed to set participant registry for market ${marketAddress}`,
        error,
      );      
      // Mensaje genérico para todos los errores de blockchain
      throw new Error('The blockchain transaction could not be completed. Please contact the administrator.');
    }
  }

  /**
   * Get market community ID
   * @param marketAddress - Address of the Market contract
   * @returns Community ID
   */
  async getCommunityId(marketAddress: string): Promise<string> {
    try {
      const contract = this.getMarketContract(marketAddress);
      return await contract.communityId();
    } catch (error) {
      this.logger.error(`Failed to get community ID for market ${marketAddress}`, error);      
      // Mensaje genérico para todos los errores de blockchain
      throw new Error('The blockchain transaction could not be completed. Please contact the administrator.');
    }
  }

  /**
   * Get market region
   * @param marketAddress - Address of the Market contract
   * @returns Region
   */
  async getRegion(marketAddress: string): Promise<string> {
    try {
      const contract = this.getMarketContract(marketAddress);
      return await contract.region();
    } catch (error) {
      this.logger.error(`Failed to get region for market ${marketAddress}`, error);      
      // Mensaje genérico para todos los errores de blockchain
      throw new Error('The blockchain transaction could not be completed. Please contact the administrator.');
    }
  }

  /**
   * Check if market is active
   * @param marketAddress - Address of the Market contract
   * @returns True if market is active
   */
  async isActive(marketAddress: string): Promise<boolean> {
    try {
      const contract = this.getMarketContract(marketAddress);
      return await contract.isActive();
    } catch (error) {
      this.logger.error(`Failed to check if market ${marketAddress} is active`, error);      
      // Mensaje genérico para todos los errores de blockchain
      throw new Error('The blockchain transaction could not be completed. Please contact the administrator.');
    }
  }
}
