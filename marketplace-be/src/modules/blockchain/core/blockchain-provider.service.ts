import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';

/**
 * QueuedWallet extends ethers.Wallet to serialize all transactions.
 * Prevents nonce collisions when multiple concurrent transactions
 * are sent from the same wallet (e.g. Hardhat automining mode).
 *
 * Key insight: ethers.js JsonRpcProvider can cache getTransactionCount
 * results, so even after await tx.wait(), the next call may get a stale
 * nonce — especially in Docker where there is network latency.
 *
 * Fix: manage nonces manually with an internal counter. The first
 * transaction fetches the nonce from the chain; subsequent ones
 * increment locally without querying the provider.
 */
export class QueuedWallet extends ethers.Wallet {
  private _txQueue: Promise<void> = Promise.resolve();
  private _managedNonce: number | null = null;

  async sendTransaction(tx: ethers.TransactionRequest): Promise<ethers.TransactionResponse> {
    return new Promise<ethers.TransactionResponse>((resolve, reject) => {
      this._txQueue = this._txQueue.then(async () => {
        try {
          // Initialize managed nonce from the chain on first use
          if (this._managedNonce === null) {
            const address = await this.getAddress();
            this._managedNonce = await this.provider!.getTransactionCount(address, 'latest');
          }

          // Strip any pre-assigned nonce and use our managed nonce
          const { nonce: _, ...txWithoutNonce } = tx as any;
          const response = await super.sendTransaction({
            ...txWithoutNonce,
            nonce: this._managedNonce,
          });

          // Wait for mining before releasing the queue
          await response.wait();

          // Increment nonce for next transaction
          this._managedNonce++;

          resolve(response);
        } catch (error) {
          // Reset nonce on failure so it is re-fetched from chain
          this._managedNonce = null;
          reject(error);
        }
      });
    });
  }
}

/**
 * BlockchainProviderService
 *
 * Manages ethers.js provider and signer instances.
 * Singleton service that provides access to blockchain connections.
 * Uses QueuedWallet to serialize transactions and prevent nonce collisions.
 */
@Injectable()
export class BlockchainProviderService {
  private readonly logger = new Logger(BlockchainProviderService.name);
  private provider!: ethers.JsonRpcProvider;
  private adminSigner!: QueuedWallet;
  // cache QueuedWallet instances by lowercase address to avoid duplicate nonces
  private signerCache: Map<string, QueuedWallet> = new Map();

  constructor(private configService: ConfigService) {
    this.initializeProvider();
  }

  /**
   * Initialize provider and admin signer from environment configuration
   */
  private initializeProvider(): void {
    const rpcUrl = this.configService.get<string>('RPC_PROVIDER_URL');
    const adminPk = this.configService.get<string>('ADMIN_PK');

    if (!rpcUrl) {
      throw new Error('RPC_PROVIDER_URL is not defined in environment variables');
    }

    if (!adminPk) {
      throw new Error('ADMIN_PK is not defined in environment variables');
    }

    try {
      this.provider = new ethers.JsonRpcProvider(rpcUrl);
      this.adminSigner = new QueuedWallet(adminPk, this.provider);
      // cache admin signer for reuse (keyed by address)
      this.signerCache.set(this.adminSigner.address.toLowerCase(), this.adminSigner);
      this.logger.log(`Provider initialized with RPC URL: ${rpcUrl}`);
      this.logger.log(`Admin signer address: ${this.adminSigner.address}`);
    } catch (error) {
      this.logger.error('Failed to initialize blockchain provider', error);
      throw error;
    }
  }

  /**
   * Get the JSON-RPC provider instance
   */
  getProvider(): ethers.JsonRpcProvider {
    return this.provider;
  }

  /**
   * Get the admin signer (QueuedWallet that serializes transactions)
   */
  getAdminSigner(): ethers.Wallet {
    return this.adminSigner;
  }

  /**
   * Create or return a cached signer for a private key
   * NOTE: always returns a QueuedWallet instance which serializes transactions
   *       to avoid nonce collisions. If the same private key is requested
   *       multiple times (e.g. admin and user wallets share the key), the
   *       same QueuedWallet object is returned so the nonce counter stays
   *       consistent.
   * @param privateKey - Private key in hex format (with or without 0x prefix)
   */
  getSigner(privateKey: string): ethers.Wallet {
    try {
      const temp = new ethers.Wallet(privateKey, this.provider);
      const address = temp.address.toLowerCase();
      if (this.signerCache.has(address)) {
        return this.signerCache.get(address)!;
      }
      const queued = new QueuedWallet(privateKey, this.provider);
      this.signerCache.set(address, queued);
      return queued;
    } catch (error) {
      this.logger.error('Failed to create signer from private key', error);
      throw new Error('Invalid private key provided');
    }
  }

  /**
   * Get current block number
   */
  async getBlockNumber(): Promise<number> {
    return await this.provider.getBlockNumber();
  }

  /**
   * Get network information
   */
  async getNetwork(): Promise<ethers.Network> {
    return await this.provider.getNetwork();
  }

  /**
   * Get gas price
   */
  async getGasPrice(): Promise<bigint> {
    const feeData = await this.provider.getFeeData();
    return feeData.gasPrice || 0n;
  }

  /**
   * Check if provider is connected
   */
  async isConnected(): Promise<boolean> {
    try {
      await this.provider.getBlockNumber();
      return true;
    } catch (error) {
      this.logger.error('Provider connection check failed', error);
      return false;
    }
  }
}
