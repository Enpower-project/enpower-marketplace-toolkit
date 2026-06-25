import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';
import { CacheService } from '../cache/cache.service';

export interface WalletInfo {
  address: string;
  binding: 'SELF' | 'MARKET';
  hasWallet: boolean;
}

export interface WalletCreationResult {
  pin: string;
  commonSecretEncrypted: string;
  privateKeyEncrypted: string;
  publicAddress: string;
}

export interface WalletBalance {
  address: string;
  balance: string;
  unit: string;
}

export interface TokenBalance {
  address: string;
  tokenBalance: string;
  tokenSymbol: string;
}

export interface NetworkInfo {
  name: string;
  chainId: string;
  blockNumber: number;
  rpcUrl: string;
}

export interface Transaction {
  hash: string;
  from: string;
  to: string;
  value: string;
  gasUsed?: string;
  gasPrice?: string | null;
  transactionLog: string;
  timestamp: number;
  date: string;
  status: string;
}

export interface Pagination {
  currentPage: number;
  totalPages: number;
  totalTransactions: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface TransactionResponse {
  address: string;
  transactions: Transaction[];
  pagination: Pagination;
}

export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data?: T;
}

@Injectable({
  providedIn: 'root'
})
export class WalletService {
  private apiUrl = environment.apiGatewayUrl;
  private readonly CACHE_NAMESPACE = 'wallets';

  constructor(private http: HttpClient, private cacheService: CacheService) {
    this.cacheService.registerCache(this.CACHE_NAMESPACE, {
    ttl: 2 * 60 * 1000, // 2 minutes - wallet data changes frequently
    maxSize: 50
  });
   }

  /**
   * Get wallet information for current authenticated user
   */
  getWallet(): Observable<ApiResponse<WalletInfo>> {
    return this.http.get<ApiResponse<WalletInfo>>(`${this.apiUrl}/wallet`);
  }

  createSelfWallet(): Observable<ApiResponse<WalletCreationResult>> {
  return this.http.post<ApiResponse<WalletCreationResult>>(`${this.apiUrl}/wallet/self`, {}).pipe(
    tap(() => {
      // Clear all wallet cache when a new wallet is created
      this.cacheService.clearNamespace(this.CACHE_NAMESPACE);
    })
  );
}
  /**
   * Create a MARKET wallet for market owners
   */
  createMarketWallet(marketId: string): Observable<ApiResponse<WalletCreationResult>> {
  return this.http.post<ApiResponse<WalletCreationResult>>(`${this.apiUrl}/wallet/market`, { marketId }).pipe(
    tap(() => {
      this.cacheService.clearNamespace(this.CACHE_NAMESPACE);
      this.cacheService.invalidate(this.CACHE_NAMESPACE, marketId);
    })
  );
}

  /**
   * Verify user's PIN
   */
  verifyPin(pin: string, marketId?: string): Observable<ApiResponse<{ valid: boolean }>> {
    const body = marketId ? { pin, marketId } : { pin };
    return this.http.post<ApiResponse<{ valid: boolean }>>(`${this.apiUrl}/wallet/verify-pin`, body);
  }

  /**
   * Get wallet balance
   */
  getWalletBalance(): Observable<ApiResponse<WalletBalance>> {
    return this.http.get<ApiResponse<WalletBalance>>(`${this.apiUrl}/wallet/balance`);
  }

  /**
   * Get flexibility token balance
   */
  getTokenBalance(): Observable<ApiResponse<TokenBalance>> {
    return this.http.get<ApiResponse<TokenBalance>>(`${this.apiUrl}/wallet/token-balance`);
  }

  /**
   * Get network information
   */
  getNetworkInfo(): Observable<ApiResponse<NetworkInfo>> {
    return this.http.get<ApiResponse<NetworkInfo>>(`${this.apiUrl}/wallet/network-info`);
  }

  /**
   * Get market wallet information by market ID
   */
  getMarketWallet(marketId: string): Observable<ApiResponse<WalletInfo>> {
    const key = marketId

    const source$ = this.http.get<ApiResponse<WalletInfo>>(`${this.apiUrl}/wallet/market/${marketId}`)
  
    return this.cacheService.get(
      this.CACHE_NAMESPACE,
      key,
      source$
    )
  }

  /**
   * Invite user to access market wallet
   */
  inviteUserToMarketWallet(marketId: string, invitedUserId: string, ownerPin: string): Observable<ApiResponse<any>> {
  return this.http.post<ApiResponse<any>>(`${this.apiUrl}/wallet/invite`, {
    marketId,
    invitedUserId,
    ownerPin
  }).pipe(
    tap(() => {
      // Invalidate market wallet cache when sharing access
      this.cacheService.invalidate(this.CACHE_NAMESPACE, marketId);
    })
  );
}

  /**
   * Get wallet transaction history
   */
  getWalletTransactionHistory(page: number = 1, limit: number = 20, status: string = '', search: string = ''): Observable<ApiResponse<TransactionResponse>> {

    const key = `Transactions-${page}-${limit}-${status}-${search}`;

    const params = new HttpParams()
      .set('page', page.toString())
      .set('limit', limit.toString())
      .set('status', status)
      .set('search', search);

    const source$ = this.http.get<ApiResponse<TransactionResponse>>(`${this.apiUrl}/wallet/transactions`, { params });
  
    return this.cacheService.get(
      this.CACHE_NAMESPACE,
      key,
      source$
    )
  }

  getWalletTransactionHistoryForAdmin(page: number = 1, limit: number = 20, status: string = '', search: string = ''): Observable<ApiResponse<TransactionResponse>> {

    const key = `Transactions-admin-${page}-${limit}-${status}-${search}`;

    const params = new HttpParams()
      .set('page', page.toString())
      .set('limit', limit.toString())
      .set('status', status)
      .set('search', search);

    const source$ = this.http.get<ApiResponse<TransactionResponse>>(`${this.apiUrl}/wallet/transactions/admin`, { params });
  
    return this.cacheService.get(
      this.CACHE_NAMESPACE,
      key,
      source$
    )
  }

  getWalletTransactionHistoryForMarket(page: number = 1, limit: number = 20, status: string = '', search: string = ''): Observable<ApiResponse<TransactionResponse>> {

    const key = `Transactions-market-${page}-${limit}-${status}-${search}`;

    const params = new HttpParams()
      .set('page', page.toString())
      .set('limit', limit.toString())
      .set('status', status)
      .set('search', search);

    const source$ = this.http.get<ApiResponse<TransactionResponse>>(`${this.apiUrl}/wallet/transactions/market`, { params });
  
    return this.cacheService.get(
      this.CACHE_NAMESPACE,
      key,
      source$
    )
  }

  /**
   * Get FLEX token balance for a specific address
   */
  getFlexBalance(address: string): Observable<string> {
    return this.http.get<{ statusCode: number; data: { balance: string } }>(
      `${environment.apiUrl}/blockchain/flexibility-token/balance/${address}`
    ).pipe(
      map(response => response.data.balance)
    );
  }
}
