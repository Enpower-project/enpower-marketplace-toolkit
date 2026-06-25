import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ethers } from 'ethers';
import { ConfigService } from '@nestjs/config';

import { TransactionCache, TransactionCacheDocument, TransactionStatus } from '../../schemas/TransactionCache.schema';
import { WalletService } from '../wallet/wallet.service';

type CaptureInput = {
  transactionHash?: string;
  transactionLog: string;
  transaction?: any;
  from?: string;
  to?: string;
  status?: TransactionStatus;
  userId?: string;
  marketId?: string;
};

@Injectable()
export class TransactionHistoryService {
  private readonly logger = new Logger(TransactionHistoryService.name);
  private readonly provider: ethers.JsonRpcProvider;

  constructor(
    @InjectModel(TransactionCache.name)
    private readonly txCacheModel: Model<TransactionCacheDocument>,
    private readonly configService: ConfigService,
    private readonly walletService: WalletService,
  ) {
    this.provider = new ethers.JsonRpcProvider(this.configService.get<string>('RPC_PROVIDER_URL'));
  }

  /**
   * Captures a blockchain transaction and persists enriched metadata to the cache.
   * When a `transactionHash` is provided the transaction is fetched from the chain and enriched with
   * block timestamp, gas data, and receipt status. When only raw `transaction` data is provided
   * (i.e. the transaction was reverted before broadcast) a failed record is stored directly.
   * Skips silently if neither a hash nor transaction data is present.
   */
  async captureAndEnrichTx(input: CaptureInput): Promise<void> {
    const { transactionHash, transactionLog, transaction, from, to, status, userId, marketId } = input;

    // If no transactionHash AND no transaction data, skip
    if (!transactionHash && !transaction) {
      this.logger.warn(`[SKIP] captureAndEnrichTx without transactionHash or transaction data`);
      return;
    }

    // Case 1: We have a transactionHash (successful tx sent to blockchain)
    if (transactionHash) {
      await this.captureOnChainTx(transactionHash, transactionLog, userId, marketId);
      return;
    }

    // Case 2: We have transaction data but no hash (reverted before being sent)
    if (transaction && from && to) {
      await this.captureFailedTx(transaction, transactionLog, from, to, status);
      return;
    }
  }

  private async captureOnChainTx(
    transactionHash: string,
    transactionLog: string,
    userId?: string,
    marketId?: string,
  ): Promise<void> {
    let walletAddress = '';
    try {
      if (userId) {
        walletAddress = (await this.walletService.getWallet(userId, marketId)) ?? '';
      }
    } catch (e) {
      this.logger.warn(`[WARN] Could not resolve walletAddress for tx=${transactionHash}: ${String(e?.message ?? e)}`);
    }

    const tx = await this.provider.getTransaction(transactionHash);
    if (!tx) {
      await this.upsertMinimal(transactionHash, transactionLog, walletAddress);
      this.logger.warn(`[PENDING] tx not found yet txHash=${transactionHash} (stored minimal)`);
      return;
    }

    const receipt = await this.provider.getTransactionReceipt(transactionHash).catch(() => null);
    const block = tx.blockNumber != null ? await this.provider.getBlock(tx.blockNumber).catch(() => null) : null;

    const enriched = {
      transactionHash,
      transactionLog,
      timestamp: block?.timestamp ?? Math.floor(Date.now() / 1000),
      from: (tx.from ?? '').toLowerCase(),
      to: (tx.to ?? '').toLowerCase(),
      gasPrice: tx.gasPrice?.toString(),
      gasUsed: receipt?.gasUsed?.toString(),
      status:
        receipt?.status == null
          ? undefined
          : receipt.status === 1
            ? TransactionStatus.ACCEPTED
            : TransactionStatus.REVERTED,
    };

    await this.txCacheModel.updateOne(
      { transactionHash },
      { $setOnInsert: enriched },
      { upsert: true },
    );

    this.logger.log(
      `[OK] cached txHash=${transactionHash} from=${enriched.from} to=${enriched.to} status=${enriched.status ?? 'pending'}`,
    );
  }

  private async captureFailedTx(
    transaction: any,
    transactionLog: string,
    from: string,
    to: string,
    status?: TransactionStatus,
  ): Promise<void> {
    const doc = {
      transactionLog,
      timestamp: Math.floor(Date.now() / 1000),
      from: (from ?? '').toLowerCase(),
      to: (to ?? '').toLowerCase(),
      transaction, // Store the raw transaction data
      status: status ?? TransactionStatus.REVERTED,
    };

    const result = await this.txCacheModel.create(doc);

    this.logger.log(
      `[OK] cached failed tx from=${doc.from} to=${doc.to} status=REVERTED log="${transactionLog}" docId=${result._id}`,
    );
  }

  private async upsertMinimal(transactionHash: string, transactionLog: string, walletAddress: string): Promise<void> {
    await this.txCacheModel.updateOne(
      { transactionHash },
      {
        $setOnInsert: {
          transactionHash,
          transactionLog,
          timestamp: Math.floor(Date.now() / 1000),
          from: walletAddress ? walletAddress.toLowerCase() : '',
          to: '',
        },
      },
      { upsert: true },
    );
  }
}