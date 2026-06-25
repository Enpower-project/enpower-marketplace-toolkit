import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap, catchError } from 'rxjs';
import { throwError } from 'rxjs';
import { TransactionHistoryService } from '../modules/transaction-history/transaction-history.service';

type LogDictionary = Record<string, string>

@Injectable()
export class TxHashCaptureInterceptor implements NestInterceptor {
  private readonly logger = new Logger(TxHashCaptureInterceptor.name);

  private readonly logMsg: LogDictionary = {
    "publish-with-pin": "Publish session",
    "activate-market-with-pin": "Activate market",
    "open-offers": "Open offers period",
    "close-offers": "Close offers period",
    "publish": "Publish offer",
    "submit-measurement-data": "Submit Settlement Measurement Data",
    "submit": "Submit Settlement",
    "execute": "Execute Settlement",
    "deposit-frp-payment" : "Deposit FLEX tokens",
    "request-frp-payment": "Request FLEX tokens"
  }

  constructor(private readonly txHistory: TransactionHistoryService) { }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const route = `${req.method} ${req.originalUrl}`;
    const userId = req.user?.sub ?? req.user?.id ?? 'anonymous';

    this.logger.debug(
      `[IN] ${route} user=${userId} hasBody=${req.body != null}`,
    );

    return next.handle().pipe(
      tap((resBody) => {
        this.captureTransaction(resBody, route, false);
      }),
      catchError((error) => {
        this.logger.debug(`[ERROR_CAUGHT] route=${route} error type=${typeof error}`);
        this.captureTransaction(error, route, true);
        return throwError(() => error);
      }),
    );
  }

  private captureTransaction(body: any, route: string, isError: boolean = false): void {
    const transactionHash = this.extractTransactionHash(body);
    const transaction = this.extractTransactionData(body);
    const from = this.extractFrom(body);
    const to = this.extractTo(body);
    
    this.logger.debug(
      `[CAPTURE_ATTEMPT] route=${route} transactionHash=${transactionHash} hasTransaction=${!!transaction} from=${from} to=${to}`,
    );
    
    if (!transactionHash && !transaction) {
      this.logger.debug(`[SKIP] ${route} No transactionHash or transaction data found in ${isError ? 'error' : 'success'} response`);
      return;
    }

    const path = route.split(' ')[1];
    const pathWithoutQuery = path.split('?')[0];
    const parts = pathWithoutQuery.split('/');
    const lastRouterPart = parts[parts.length - 1];
    
    const transactionLog = this.logMsg[lastRouterPart] ?? `Transaction on ${lastRouterPart}`;
    
    this.logger.log(
      `[PERSISTING] route=${route} transactionHash=${transactionHash || 'N/A'} from=${from} to=${to} status=${isError ? 'REVERTED' : 'ACCEPTED'}`,
    );

    void this.txHistory
      .captureAndEnrichTx({
        transactionHash: transactionHash || undefined,
        transactionLog,
        transaction: transaction || undefined,
        from: from || undefined,
        to: to || undefined,
        status: isError ? 0 : 1,
      })
      .then(() => {
        this.logger.log(
          `[OK] Persisted tx route=${route} transactionHash=${transactionHash || 'N/A'} log="${transactionLog}" (${isError ? 'reverted' : 'success'})`,
        );
      })
      .catch((err) => {
        this.logger.error(
          `[ERR] Failed to persist tx route=${route} transactionHash=${transactionHash || 'N/A'} - ${String(err?.message ?? err)}`,
          err?.stack,
        );
      });
  }

  private extractTransactionHash(data: any): string | null {
    if (!data) return null;
    return data.transactionHash ?? data?.data?.transactionHash ?? null;
  }

  private extractTransactionData(data: any): any {
    if (!data) return null;
    
    // Direct transaction property
    if (data.transaction) {
      return data.transaction;
    }
    
    // Nested in response
    if (data?.response?.data?.transaction) {
      return data.response.data.transaction;
    }

    // Extract from error message string (for wrapped errors)
    const errorMessage = data?.message || data?.toString?.() || '';
    const transactionMatch = errorMessage.match(/transaction=\{\s*"data":\s*"(0x[a-f0-9]+)",\s*"from":\s*"(0x[a-f0-9]+)",\s*"to":\s*"(0x[a-f0-9]+)"/i);
    
    if (transactionMatch) {
      return {
        data: transactionMatch[1],
        from: transactionMatch[2],
        to: transactionMatch[3],
      };
    }
    
    return null;
  }

  private extractFrom(data: any): string | null {
    if (!data) return null;
    
    // Direct property
    if (data.from) return data.from;
    
    // Nested in transaction
    if (data.transaction?.from) return data.transaction.from;
    
    // In response
    if (data.response?.data?.from) return data.response.data.from;
    if (data.response?.data?.transaction?.from) return data.response.data.transaction.from;

    // Extract from error message
    const errorMessage = data?.message || data?.toString?.() || '';
    const fromMatch = errorMessage.match(/"from":\s*"(0x[a-f0-9]+)"/i);
    if (fromMatch) return fromMatch[1];
    
    return null;
  }

  private extractTo(data: any): string | null {
    if (!data) return null;
    
    // Direct property
    if (data.to) return data.to;
    
    // Nested in transaction
    if (data.transaction?.to) return data.transaction.to;
    
    // In response
    if (data.response?.data?.to) return data.response.data.to;
    if (data.response?.data?.transaction?.to) return data.response.data.transaction.to;

    // Extract from error message
    const errorMessage = data?.message || data?.toString?.() || '';
    const toMatch = errorMessage.match(/"to":\s*"(0x[a-f0-9]+)"/i);
    if (toMatch) return toMatch[1];
    
    return null;
  }
}