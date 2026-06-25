import { Injectable, Logger } from '@nestjs/common';
import { ethers } from 'ethers';
import { ContractFactoryService } from '../../core/contract-factory.service';
import { BlockchainProviderService } from '../../core/blockchain-provider.service';
import * as FlexibilityTokenABI from '../../../../contracts/FlexibilityToken.json';

/**
 * FlexibilityTokenContractService
 *
 * Service for interacting with the FlexibilityToken (ERC20) smart contract.
 * Handles token operations: transfers, approvals, minting, burning, and collateral management.
 */
@Injectable()
export class FlexibilityTokenContractService {
  private readonly logger = new Logger(FlexibilityTokenContractService.name);
  private contract: ethers.Contract;

  // Role hashes (keccak256)
  private readonly MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes('MINTER_ROLE'));
  private readonly PAUSER_ROLE = ethers.keccak256(ethers.toUtf8Bytes('PAUSER_ROLE'));
  private readonly TREASURY_ROLE = ethers.keccak256(ethers.toUtf8Bytes('TREASURY_ROLE'));

  constructor(
    private contractFactory: ContractFactoryService,
    private providerService: BlockchainProviderService,
  ) {
    this.initializeContract();
  }

  private initializeContract(): void {
    try {
      this.contract = this.contractFactory.createContract(
        'FLEXIBILITY_TOKEN',
        FlexibilityTokenABI.abi,
      );
      this.logger.log('FlexibilityToken contract initialized');
    } catch (error) {
      this.logger.error('Failed to initialize FlexibilityToken contract', error);      
      // Mensaje genérico para todos los errores de blockchain
      throw new Error('The blockchain transaction could not be completed. Please contact the administrator.');
    }
  }

  /**
   * Get the token balance of an account
   * @param account - Address to check balance
   * @returns Balance in wei (as string to avoid precision loss)
   */
  async balanceOf(account: string): Promise<string> {
    try {
      const balance: bigint = await this.contract.balanceOf(account);
      return balance.toString();
    } catch (error) {
      this.logger.error(`Failed to get balance for ${account}`, error);      
      // Mensaje genérico para todos los errores de blockchain
      throw new Error('The blockchain transaction could not be completed. Please contact the administrator.');
    }
  }

  /**
   * Get total token supply
   * @returns Total supply in wei
   */
  async totalSupply(): Promise<string> {
    try {
      const supply: bigint = await this.contract.totalSupply();
      return supply.toString();
    } catch (error) {
      this.logger.error('Failed to get total supply', error);      
      // Mensaje genérico para todos los errores de blockchain
      throw new Error('The blockchain transaction could not be completed. Please contact the administrator.');
    }
  }

  /**
   * Transfer tokens to another address
   * @param to - Recipient address
   * @param amount - Amount in wei
   * @returns Transaction object
   */
  async transfer(to: string, amount: string): Promise<ethers.ContractTransactionResponse> {
    try {
      this.logger.log(`Transferring ${amount} tokens to ${to}`);
      const tx = await this.contract.transfer(to, amount);
      this.logger.log(`Transfer transaction sent: ${tx.hash}`);
      return tx;
    } catch (error) {
      this.logger.error(`Failed to transfer tokens to ${to}`, error);      
      // Mensaje genérico para todos los errores de blockchain
      throw new Error('The blockchain transaction could not be completed. Please contact the administrator.');
    }
  }

  /**
   * Approve spender to spend tokens on behalf of caller
   * @param spender - Address allowed to spend
   * @param amount - Amount in wei
   * @returns Transaction object
   */
  async approve(spender: string, amount: string): Promise<ethers.ContractTransactionResponse> {
    try {
      this.logger.log(`Approving ${spender} to spend ${amount} tokens`);
      const tx = await this.contract.approve(spender, amount);
      this.logger.log(`Approval transaction sent: ${tx.hash}`);
      return tx;
    } catch (error) {
      this.logger.error(`Failed to approve ${spender}`, error);      
      // Mensaje genérico para todos los errores de blockchain
      throw new Error('The blockchain transaction could not be completed. Please contact the administrator.');
    }
  }

  /**
   * Get allowance of spender for owner's tokens
   * @param owner - Token owner address
   * @param spender - Spender address
   * @returns Allowance in wei
   */
  async allowance(owner: string, spender: string): Promise<string> {
    try {
      const allowance: bigint = await this.contract.allowance(owner, spender);
      return allowance.toString();
    } catch (error) {
      this.logger.error(`Failed to get allowance for ${owner} -> ${spender}`, error);      
      // Mensaje genérico para todos los errores de blockchain
      throw new Error('The blockchain transaction could not be completed. Please contact the administrator.');
    }
  }

  /**
   * Mint new tokens (requires MINTER_ROLE)
   * @param to - Recipient address
   * @param amount - Amount in wei
   * @returns Transaction object
   */
  async mint(to: string, amount: string): Promise<ethers.ContractTransactionResponse> {
    try {
      this.logger.log(`Minting ${amount} tokens to ${to}`);
      const tx = await this.contract.mint(to, amount);
      this.logger.log(`Mint transaction sent: ${tx.hash}`);
      return tx;
    } catch (error) {
      this.logger.error(`Failed to mint tokens to ${to}`, error);      
      // Mensaje genérico para todos los errores de blockchain
      throw new Error('The blockchain transaction could not be completed. Please contact the administrator.');
    }
  }

  /**
   * Burn tokens from caller's balance
   * @param amount - Amount in wei
   * @returns Transaction object
   */
  async burn(amount: string): Promise<ethers.ContractTransactionResponse> {
    try {
      this.logger.log(`Burning ${amount} tokens`);
      const tx = await this.contract.burn(amount);
      this.logger.log(`Burn transaction sent: ${tx.hash}`);
      return tx;
    } catch (error) {
      this.logger.error('Failed to burn tokens', error);      
      // Mensaje genérico para todos los errores de blockchain
      throw new Error('The blockchain transaction could not be completed. Please contact the administrator.');
    }
  }

  /**
   * Pause all token transfers (requires PAUSER_ROLE)
   * @returns Transaction object
   */
  async pause(): Promise<ethers.ContractTransactionResponse> {
    try {
      this.logger.log('Pausing token contract');
      const tx = await this.contract.pause();
      this.logger.log(`Pause transaction sent: ${tx.hash}`);
      return tx;
    } catch (error) {
      this.logger.error('Failed to pause contract', error);      
      // Mensaje genérico para todos los errores de blockchain
      throw new Error('The blockchain transaction could not be completed. Please contact the administrator.');
    }
  }

  /**
   * Unpause token transfers (requires PAUSER_ROLE)
   * @returns Transaction object
   */
  async unpause(): Promise<ethers.ContractTransactionResponse> {
    try {
      this.logger.log('Unpausing token contract');
      const tx = await this.contract.unpause();
      this.logger.log(`Unpause transaction sent: ${tx.hash}`);
      return tx;
    } catch (error) {
      this.logger.error('Failed to unpause contract', error);      
      // Mensaje genérico para todos los errores de blockchain
      throw new Error('The blockchain transaction could not be completed. Please contact the administrator.');
    }
  }

  /**
   * Get available balance (balance minus locked collateral)
   * @param account - Address to check
   * @returns Available balance in wei
   */
  async availableBalance(account: string): Promise<string> {
    try {
      const available: bigint = await this.contract.availableBalance(account);
      return available.toString();
    } catch (error) {
      this.logger.error(`Failed to get available balance for ${account}`, error);      
      // Mensaje genérico para todos los errores de blockchain
      throw new Error('The blockchain transaction could not be completed. Please contact the administrator.');
    }
  }

  /**
   * Get locked collateral amount for an account
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
   * Grant MINTER_ROLE to an address
   * @param address - Address to grant role
   * @returns Transaction object
   */
  async grantMinterRole(address: string): Promise<ethers.ContractTransactionResponse> {
    try {
      this.logger.log(`Granting MINTER_ROLE to ${address}`);
      const tx = await this.contract.grantRole(this.MINTER_ROLE, address);
      this.logger.log(`Grant MINTER_ROLE transaction sent: ${tx.hash}`);
      return tx;
    } catch (error) {
      this.logger.error(`Failed to grant MINTER_ROLE to ${address}`, error);      
      // Mensaje genérico para todos los errores de blockchain
      throw new Error('The blockchain transaction could not be completed. Please contact the administrator.');
    }
  }

  /**
   * Grant TREASURY_ROLE to an address
   * @param address - Address to grant role
   * @returns Transaction object
   */
  async grantTreasuryRole(address: string): Promise<ethers.ContractTransactionResponse> {
    try {
      this.logger.log(`Granting TREASURY_ROLE to ${address}`);
      const tx = await this.contract.grantRole(this.TREASURY_ROLE, address);
      this.logger.log(`Grant TREASURY_ROLE transaction sent: ${tx.hash}`);
      return tx;
    } catch (error) {
      this.logger.error(`Failed to grant TREASURY_ROLE to ${address}`, error);      
      // Mensaje genérico para todos los errores de blockchain
      throw new Error('The blockchain transaction could not be completed. Please contact the administrator.');
    }
  }

  /**
   * Grant PAUSER_ROLE to an address
   * @param address - Address to grant role
   * @returns Transaction object
   */
  async grantPauserRole(address: string): Promise<ethers.ContractTransactionResponse> {
    try {
      this.logger.log(`Granting PAUSER_ROLE to ${address}`);
      const tx = await this.contract.grantRole(this.PAUSER_ROLE, address);
      this.logger.log(`Grant PAUSER_ROLE transaction sent: ${tx.hash}`);
      return tx;
    } catch (error) {
      this.logger.error(`Failed to grant PAUSER_ROLE to ${address}`, error);      
      // Mensaje genérico para todos los errores de blockchain
      throw new Error('The blockchain transaction could not be completed. Please contact the administrator.');
    }
  }

  /**
   * Check if address has a specific role
   * @param role - Role bytes32 hash
   * @param address - Address to check
   * @returns True if address has role
   */
  async hasRole(role: string, address: string): Promise<boolean> {
    try {
      return await this.contract.hasRole(role, address);
    } catch (error) {
      this.logger.error(`Failed to check role for ${address}`, error);      
      // Mensaje genérico para todos los errores de blockchain
      throw new Error('The blockchain transaction could not be completed. Please contact the administrator.');
    }
  }

  /**
   * Transfer tokens with a specific signer (for collateral and payments)
   * @param signer - Signer to execute the transaction
   * @param to - Recipient address
   * @param amount - Amount in wei
   * @returns Transaction object
   */
  async transferWithSigner(
    signer: ethers.Signer,
    to: string,
    amount: string,
  ): Promise<ethers.ContractTransactionResponse> {
    try {
      this.logger.log(`Transferring ${amount} tokens to ${to} with signer`);
      const contractWithSigner = this.contract.connect(signer) as any;
      const tx = await contractWithSigner.transfer(to, amount);
      this.logger.log(`Transfer transaction sent: ${tx.hash}`);
      return tx;
    } catch (error) {
      this.logger.error(`Failed to transfer tokens to ${to}`, error);      
      // Mensaje genérico para todos los errores de blockchain
      throw new Error('The blockchain transaction could not be completed. Please contact the administrator.');
    }
  }

  /**
   * Transfer tokens from one address to another with a specific signer (for collateral and payments)
   * @param signer - Signer to execute the transaction
   * @param from - Source address
   * @param to - Recipient address
   * @param amount - Amount in wei
   * @returns Transaction object
   */
  async transferFromWithSigner(
    signer: ethers.Signer,
    from: string,
    to: string,
    amount: string,
  ): Promise<ethers.ContractTransactionResponse> {
    try {
      this.logger.log(`Transferring ${amount} tokens from ${from} to ${to} with signer`);
      const contractWithSigner = this.contract.connect(signer) as any;
      const tx = await contractWithSigner.transferFrom(from, to, amount);
      this.logger.log(`TransferFrom transaction sent: ${tx.hash}`);
      return tx;
    } catch (error) {
      this.logger.error(`Failed to transferFrom ${from} to ${to}`, error);      
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
   * Convert ether amount to wei
   * @param etherAmount - Amount in ether
   * @returns Amount in wei as string
   */
  static toWei(etherAmount: string | number): string {
    return ethers.parseEther(etherAmount.toString()).toString();
  }

  /**
   * Convert wei amount to ether
   * @param weiAmount - Amount in wei
   * @returns Amount in ether as string
   */
  static toEther(weiAmount: string | bigint): string {
    return ethers.formatEther(weiAmount);
  }
}
