import { Injectable } from '@angular/core';
import { ethers } from 'ethers';
import { BlockchainProviderService } from './blockchain-provider.service';

/**
 * ContractFactoryService
 *
 * Factory service for creating ethers.js Contract instances in frontend.
 * Contracts are read-only (connected to provider, not signer).
 */
@Injectable({
  providedIn: 'root'
})
export class ContractFactoryService {
  constructor(private providerService: BlockchainProviderService) {}

  /**
   * Create a read-only contract instance
   * @param address - Contract address
   * @param abi - Contract ABI
   * @returns Read-only contract instance
   */
  createContract<T = ethers.Contract>(address: string, abi: any): T {
    const provider = this.providerService.getProvider();

    try {
      return new ethers.Contract(address, abi, provider) as T;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Create a contract instance with custom provider
   * @param address - Contract address
   * @param abi - Contract ABI
   * @param provider - Custom provider
   * @returns Contract instance
   */
  createContractWithProvider<T = ethers.Contract>(
    address: string,
    abi: any,
    provider: ethers.Provider
  ): T {
    try {
      return new ethers.Contract(address, abi, provider) as T;
    } catch (error) {
      throw error;
    }
  }
}
