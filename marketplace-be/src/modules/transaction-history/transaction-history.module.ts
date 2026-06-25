import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { TransactionCache, TransactionCacheSchema } from '../../schemas/TransactionCache.schema';
import { TransactionHistoryService } from './transaction-history.service';
import { TxHashCaptureInterceptor } from 'src/interceptors/txhash-capture.interceptor';
import { WalletModule } from '../wallet/wallet.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: TransactionCache.name, schema: TransactionCacheSchema },
    ]),
    WalletModule, // ✅ this provides WalletService (and its dependencies)
  ],
  providers: [
    TransactionHistoryService,
    TxHashCaptureInterceptor,
  ],
  exports: [
    TransactionHistoryService,
  ],
})
export class TransactionHistoryModule {}

