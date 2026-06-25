import { Injectable, Logger } from '@nestjs/common';
import { ethers } from 'ethers';
import { ContractFactoryService } from '../../core/contract-factory.service';
import { OfferCollateralInfoDto } from './dto/treasury.dto';
import * as TreasuryABI from '../../../../contracts/Treasury.json';

/**
 * TreasuryContractService
 *
 * Service for interacting with the Treasury smart contract.
 * Manages collateral deposits from FSPs and settlement payments.
 */
@Injectable()
export class TreasuryContractService {
  private readonly logger = new Logger(TreasuryContractService.name);
  private contract: ethers.Contract;

  // Role hashes
  private readonly SESSION_CONTRACT = ethers.keccak256(ethers.toUtf8Bytes('SESSION_CONTRACT'));
  private readonly FRP_ROLE = ethers.keccak256(ethers.toUtf8Bytes('FRP_ROLE'));
  private readonly TREASURY_MANAGER = ethers.keccak256(ethers.toUtf8Bytes('TREASURY_MANAGER'));

  constructor(private contractFactory: ContractFactoryService) {
    this.initializeContract();
  }

  private initializeContract(): void {
    try {
      this.contract = this.contractFactory.createContract('TREASURY', TreasuryABI.abi);
      this.logger.log('Treasury contract initialized');
    } catch (error) {
      this.logger.error('Failed to initialize Treasury contract', error);      
      // Mensaje genérico para todos los errores de blockchain
      throw new Error('The blockchain transaction could not be completed. Please contact the administrator.');
    }
  }

  /**
   * Deposit FLEX tokens to Treasury
   * @param amount - Amount in wei
   * @returns Transaction object
   */
  async deposit(amount: string): Promise<ethers.ContractTransactionResponse> {
    try {
      this.logger.log(`Depositing ${amount} tokens to Treasury`);
      const tx = await this.contract.deposit(amount);
      this.logger.log(`Deposit transaction sent: ${tx.hash}`);
      return tx;
    } catch (error) {
      this.logger.error('Failed to deposit to Treasury', error);      
      // Mensaje genérico para todos los errores de blockchain
      throw new Error('The blockchain transaction could not be completed. Please contact the administrator.');
    }
  }

  /**
   * Withdraw FLEX tokens from Treasury
   * @param amount - Amount in wei
   * @returns Transaction object
   */
  async withdraw(amount: string): Promise<ethers.ContractTransactionResponse> {
    try {
      this.logger.log(`Withdrawing ${amount} tokens from Treasury`);
      const tx = await this.contract.withdraw(amount);
      this.logger.log(`Withdraw transaction sent: ${tx.hash}`);
      return tx;
    } catch (error) {
      this.logger.error('Failed to withdraw from Treasury', error);      
      // Mensaje genérico para todos los errores de blockchain
      throw new Error('The blockchain transaction could not be completed. Please contact the administrator.');
    }
  }

  /**
   * FRP deposits payment for settled session
   * @param sessionId - Session ID
   * @param amount - Amount in wei
   * @returns Transaction object
   */
  async depositPaymentForSession(
    sessionId: number,
    amount: string,
  ): Promise<ethers.ContractTransactionResponse> {
    try {
      this.logger.log(`FRP depositing ${amount} for session ${sessionId}`);
      const tx = await this.contract.depositPaymentForSession(sessionId, amount);
      this.logger.log(`Deposit payment transaction sent: ${tx.hash}`);
      return tx;
    } catch (error) {
      this.logger.error(`Failed to deposit payment for session ${sessionId}`, error);      
      // Mensaje genérico para todos los errores de blockchain
      throw new Error('The blockchain transaction could not be completed. Please contact the administrator.');
    }
  }

  /**
   * Get balance of an account
   * @param account - Address to check
   * @returns Balance in wei
   */
  async getBalance(account: string): Promise<string> {
    try {
      const balance: bigint = await this.contract.balances(account);
      return balance.toString();
    } catch (error) {
      this.logger.error(`Failed to get balance for ${account}`, error);      
      // Mensaje genérico para todos los errores de blockchain
      throw new Error('The blockchain transaction could not be completed. Please contact the administrator.');
    }
  }

  /**
   * Get available balance (excluding locked collateral)
   * @param account - Address to check
   * @returns Available balance in wei
   */
  async getAvailableBalance(account: string): Promise<string> {
    try {
      const balance: bigint = await this.contract.getAvailableBalance(account);
      return balance.toString();
    } catch (error) {
      this.logger.error(`Failed to get available balance for ${account}`, error);      
      // Mensaje genérico para todos los errores de blockchain
      throw new Error('The blockchain transaction could not be completed. Please contact the administrator.');
    }
  }

  /**
   * Get total collateral deposited by an account
   * @param account - Address to check
   * @returns Collateral deposited in wei
   */
  async getCollateralDeposited(account: string): Promise<string> {
    try {
      const collateral: bigint = await this.contract.collateralDeposited(account);
      return collateral.toString();
    } catch (error) {
      this.logger.error(`Failed to get collateral deposited for ${account}`, error);      
      // Mensaje genérico para todos los errores de blockchain
      throw new Error('The blockchain transaction could not be completed. Please contact the administrator.');
    }
  }

  /**
   * Get locked collateral for an account
   * @param account - Address to check
   * @returns Locked collateral in wei
   */
  async getCollateralLocked(account: string): Promise<string> {
    try {
      const locked: bigint = await this.contract.collateralLocked(account);
      return locked.toString();
    } catch (error) {
      this.logger.error(`Failed to get locked collateral for ${account}`, error);      
      // Mensaje genérico para todos los errores de blockchain
      throw new Error('The blockchain transaction could not be completed. Please contact the administrator.');
    }
  }

  /**
   * Get collateral info for a specific offer
   * @param sessionContract - MarketSession contract address
   * @param sessionId - Session ID
   * @param offerId - Offer ID
   * @returns Offer collateral information
   */
  async getOfferCollateral(
    sessionContract: string,
    sessionId: number,
    offerId: number,
  ): Promise<OfferCollateralInfoDto> {
    try {
      const collateral = await this.contract.getOfferCollateral(sessionContract, sessionId, offerId);
      return {
        sessionContract: collateral.sessionContract,
        sessionId: Number(collateral.sessionId),
        offerId: Number(collateral.offerId),
        fsp: collateral.fsp,
        collateralAmount: collateral.collateralAmount.toString(),
        feeAmount: collateral.feeAmount.toString(),
        released: collateral.released,
      };
    } catch (error) {
      this.logger.error(
        `Failed to get offer collateral for session contract ${sessionContract}, session ${sessionId}, offer ${offerId}`,
        error,
      );      
      // Mensaje genérico para todos los errores de blockchain
      throw new Error('The blockchain transaction could not be completed. Please contact the administrator.');
    }
  }

  /**
   * Grant SESSION_CONTRACT role to a session address
   * @param sessionAddress - Address of the MarketSession contract
   * @returns Transaction object
   */
  async grantSessionContractRole(
    sessionAddress: string,
  ): Promise<ethers.ContractTransactionResponse> {
    try {
      this.logger.log(`Granting SESSION_CONTRACT role to ${sessionAddress}`);
      const tx = await this.contract.grantRole(this.SESSION_CONTRACT, sessionAddress);
      this.logger.log(`Grant SESSION_CONTRACT role transaction sent: ${tx.hash}`);
      return tx;
    } catch (error) {
      this.logger.error(`Failed to grant SESSION_CONTRACT role to ${sessionAddress}`, error);      
      // Mensaje genérico para todos los errores de blockchain
      throw new Error('The blockchain transaction could not be completed. Please contact the administrator.');
    }
  }

  /**
   * Grant FRP_ROLE to an FRP address
   * @param frpAddress - Address of the FRP
   * @returns Transaction object
   */
  async grantFRPRole(frpAddress: string): Promise<ethers.ContractTransactionResponse> {
    try {
      this.logger.log(`Granting FRP_ROLE to ${frpAddress}`);
      const tx = await this.contract.grantRole(this.FRP_ROLE, frpAddress);
      this.logger.log(`Grant FRP_ROLE transaction sent: ${tx.hash}`);
      return tx;
    } catch (error) {
      this.logger.error(`Failed to grant FRP_ROLE to ${frpAddress}`, error);      
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

  /**
   * Check if an address has the SESSION_CONTRACT role
   * @param sessionAddress - Address to check
   * @returns Boolean indicating if address has SESSION_CONTRACT role
   */
  async hasSessionContractRole(sessionAddress: string): Promise<boolean> {
    try {
      const hasRole = await this.contract.hasRole(this.SESSION_CONTRACT, sessionAddress);
      return hasRole;
    } catch (error) {
      this.logger.error(`Failed to check SESSION_CONTRACT role for ${sessionAddress}`, error);      
      // Mensaje genérico para todos los errores de blockchain
      throw new Error('The blockchain transaction could not be completed. Please contact the administrator.');
    }
  }

  /**
   * Check if an address has the DEFAULT_ADMIN_ROLE
   * @param address - Address to check
   * @returns Boolean indicating if address has DEFAULT_ADMIN_ROLE
   */
  async hasAdminRole(address: string): Promise<boolean> {
    try {
      const DEFAULT_ADMIN_ROLE = '0x0000000000000000000000000000000000000000000000000000000000000000';
      const hasRole = await this.contract.hasRole(DEFAULT_ADMIN_ROLE, address);
      return hasRole;
    } catch (error) {
      this.logger.error(`Failed to check DEFAULT_ADMIN_ROLE for ${address}`, error);      
      // Mensaje genérico para todos los errores de blockchain
      throw new Error('The blockchain transaction could not be completed. Please contact the administrator.');
    }
  }

  /**
   * Get the admin signer address from the contract factory
   * @returns Admin signer address
   */
  getAdminSignerAddress(): string {
    return (this.contract.runner as ethers.Wallet).address;
  }
}
