import { Injectable } from '@angular/core';
import { ethers } from 'ethers';
import { environment } from '../../../../../environments/environment';

/**
 * BlockchainProviderService
 *
 * Manages ethers.js provider for frontend read-only operations.
 * For write operations, use backend API.
 */
@Injectable({
  providedIn: 'root'
})
export class BlockchainProviderService {
  
  private provider;

  constructor() {
    this.initializeProvider();
    this.provider = new ethers.JsonRpcProvider();
  }

  private initializeProvider(): void {
    const rpcUrl = environment.rpcProviderUrl || 'http://127.0.0.1:8545';
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
  }

  /**
   * Get the JSON-RPC provider instance
   */
  getProvider(): ethers.JsonRpcProvider {
    return this.provider;
  }

  /**
   * Get current block number
   */
  async getBlockNumber(): Promise<number> {
    try {
      return await this.provider.getBlockNumber();
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get network information
   */
  async getNetwork(): Promise<ethers.Network> {
    try {
      return await this.provider.getNetwork();
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get gas price
   */
  async getGasPrice(): Promise<bigint> {
    try {
      const feeData = await this.provider.getFeeData();
      return feeData.gasPrice || 0n;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Check if provider is connected
   */
  async isConnected(): Promise<boolean> {
    try {
      await this.provider.getBlockNumber();
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Convert ether amount to wei
   */
  static toWei(etherAmount: string | number): string {
    return ethers.parseEther(etherAmount.toString()).toString();
  }

  /**
   * Convert wei amount to ether
   */
  static toEther(weiAmount: string | bigint): string {
    return ethers.formatEther(weiAmount);
  }
}
