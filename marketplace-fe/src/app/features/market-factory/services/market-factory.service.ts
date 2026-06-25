import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { tap, map } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';
import { Market, CreateMarketRequest, UpdateMarketRequest, MyMarketsResponse } from '../../../shared/models/market-place/market-model';
import { EventService } from 'hateoas-utils';
import { MarketEvents } from '../enums/market-enums';
import { MarketUser } from '../interfaces/market-user';
import { MarketByIdResponse } from '../interfaces/market-by-id-response';
import { CacheService } from '../../../core/services/cache/cache.service';
import { MarketActivateResponse } from '../interfaces/market-activate-response';
import { MarketActivationResponse } from '../market-activation-warning-modal/market-activation-warning-modal.component';

@Injectable({
  providedIn: 'root'
})
export class MarketFactoryService {
  private readonly baseUrl = `${environment.apiGatewayUrl}/market-factory`;
  private readonly CACHE_NAMESPACE = 'market-factories';

  constructor(
    private http: HttpClient,
    private eventService: EventService,
    private cacheService: CacheService
  ) {
    this.cacheService.registerCache(this.CACHE_NAMESPACE, {
      ttl: 10 * 60 * 1000, // 10 minutes
      maxSize: 50
    });
  }

  createMarketWithOwner(marketData: CreateMarketRequest): Observable<Market> {
    return this.http.post<any>(`${this.baseUrl}/market-with-owner`, marketData).pipe(
      map(response => {
        const market = response.data?.market || response;
        return market;
      }),
      tap(market => {
        // Clear market caches when new market is created
        this.cacheService.clearNamespace(this.CACHE_NAMESPACE);
        this.cacheService.clearNamespace('market-selection'); // Also clear market selection cache

        this.eventService.broadcast({ action: MarketEvents.MARKET_CREATED, payload: market });
      })
    );
  }

  getMarkets(): Observable<Market[]> {
    return this.http.get<Market[]>(`${this.baseUrl}/list`);
  }

  // New method to get user's markets
  getMyMarkets(): Observable<MyMarketsResponse> {
    return this.http.get<MyMarketsResponse>(`${this.baseUrl}/my-markets`);
  }

  // Manteniamo per compatibilità se necessario
  createMarket(marketData: CreateMarketRequest): Observable<Market> {
    return this.createMarketWithOwner(marketData);
  }

  updateMarket(marketId: string, marketData: UpdateMarketRequest): Observable<Market> {
    return this.http.put<any>(`${this.baseUrl}/markets/${marketId}`, marketData).pipe(
      map(response => {
        const market = response.data?.market || response;
        return market;
      }),
      tap(market => {
        // Invalidate specific market and public markets list
        this.cacheService.invalidate(this.CACHE_NAMESPACE, marketId);
        this.cacheService.invalidate(this.CACHE_NAMESPACE, 'public-markets');
        this.cacheService.clearNamespace('market-selection');

        this.eventService.broadcast({ action: MarketEvents.MARKET_UPDATED, payload: market });
      })
    );
  }

  getMarketById(marketId: string): Observable<Market> {

    const key = marketId

    // Note: This endpoint might not be implemented in the backend
    // This method is kept as a fallback for cases where navigation state is not available
    const source$ = this.http.get<MarketByIdResponse>(`${this.baseUrl}/markets/${marketId}?populate=marketOwner`).pipe(
      map(response => {
        // Handle both wrapped and direct responses
        const market = response.data?.market || response;
        return market;
      })
    );

    return this.cacheService.get(
      this.CACHE_NAMESPACE,
      key,
      source$
    )
  }

  delete(market: Market): Observable<any> {
    return this.http.delete(`${this.baseUrl}/${market._id}`).pipe(
      tap(() => {
        // Clear all market caches when a market is deleted
        this.cacheService.clearNamespace(this.CACHE_NAMESPACE);
        this.cacheService.clearNamespace('market-selection');
      })
    );
  }

  // Get pending markets for acceptance
  getPendingMarketsByEmail(email: string): Observable<any> {
    return this.http.get(`${this.baseUrl}/pending-acceptance/${email}`);
  }

  // Accept a market
  acceptMarket(marketId: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/market-acceptation/${marketId}`, {}).pipe(
      tap(response => {
        if (response) {
          // Clear caches when accepting a market
          this.cacheService.invalidate(this.CACHE_NAMESPACE, marketId);
          this.cacheService.clearNamespace('market-selection');

          this.eventService.broadcast({ action: MarketEvents.MARKET_ACCEPTED, payload: response });
        }
      })
    );
  }

  // Reject a market
  rejectMarket(marketId: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/market-rejection/${marketId}`, {}).pipe(
      tap(response => {
        if (response) {
          // Clear caches when rejecting a market
          this.cacheService.clearNamespace(this.CACHE_NAMESPACE);
          this.cacheService.clearNamespace('market-selection');

          this.eventService.broadcast({ action: MarketEvents.MARKET_REJECTED, payload: response });
        }
      })
    );
  }

  // Activate a market on blockchain
  activateMarket(marketId: string): Observable<MarketActivationResponse> {
    return this.http.post<MarketActivationResponse>(`${this.baseUrl}/activate-market/${marketId}`, {}).pipe(
      tap(response => {
        if (response && response.success) {
          // Invalidate market cache when activated
          this.cacheService.invalidate(this.CACHE_NAMESPACE, marketId);
          this.cacheService.invalidate(this.CACHE_NAMESPACE, 'public-markets');

          this.eventService.broadcast({ action: MarketEvents.MARKET_ACTIVATED, payload: response });
        }
      })
    );
  }

  deactivateMarket(marketId: string): Observable<MarketActivationResponse> {
    return this.http.post<MarketActivationResponse>(`${this.baseUrl}/deactivate-market/${marketId}`, {}).pipe(
      tap(response => {
        if (response && response.success) {
          // Invalidate market cache when deactivated
          this.cacheService.invalidate(this.CACHE_NAMESPACE, marketId);
          this.cacheService.invalidate(this.CACHE_NAMESPACE, 'public-markets');
          this.cacheService.clearNamespace('market-selection');
          localStorage.removeItem('enpower_market_names_cache');
          this.eventService.broadcast({ action: MarketEvents.MARKET_DEACTIVATED, payload: response });
        }
      })
    );
  }


  // Activate a market on blockchain with PIN verification
  activateMarketWithPin(marketId: string, pin: string): Observable<any> {
    return this.http.post<any>(`${this.baseUrl}/${marketId}/activate-market-with-pin`, { pin }).pipe(
      tap(response => {
        if (response && response.success) {
          // Invalidate market cache when activated
          this.cacheService.invalidate(this.CACHE_NAMESPACE, marketId);
          this.cacheService.invalidate(this.CACHE_NAMESPACE, 'public-markets');

          this.eventService.broadcast({ action: MarketEvents.MARKET_ACTIVATED, payload: response });
        }
      })
    );
  }

  // Request activation PIN for market owner
  requestActivationPin(marketId: string): Observable<any> {
    return this.http.post<any>(`${this.baseUrl}/request-activation-pin/${marketId}`, {});
  }

  // Get public markets available for subscription (prosumers)
  getPublicMarkets(): Observable<{ success: boolean; data: Market[]; message: string }> {
    const key = 'public-markets';

    const source$ = this.http.get<{ success: boolean; data: Market[]; message: string }>(
      `${this.baseUrl}/public-markets`
    )

    return this.cacheService.get(
      this.CACHE_NAMESPACE,
      key,
      source$
    )
  }

  // Subscribe to a market (prosumers)
  subscribeToMarket(marketId: string): Observable<{
    success: boolean;
    message: string;
    marketId: string;
    marketName: string;
    requiresTokenRefresh?: boolean;
  }> {
    return this.http.post<any>(`${this.baseUrl}/subscribe/${marketId}`, {}).pipe(
      tap(response => {
        if (response && response.success) {
          // Clear market selection cache when subscribing
          this.cacheService.clearNamespace('market-selection');
          this.cacheService.invalidate(this.CACHE_NAMESPACE, 'public-markets');

          this.eventService.broadcast({
            action: MarketEvents.MARKET_SUBSCRIBED,
            payload: { marketId, marketName: response.marketName }
          });
        }
      })
    );
  }

  // Assign users to a market
  assignUsersToMarket(marketId: string, userIds: string[]): Observable<any> {
    return this.http.post(`${this.baseUrl}/markets/${marketId}/users`, { userIds });
  }

  // Remove users from a market
  removeUsersFromMarket(marketId: string, userIds: string[]): Observable<any> {
    return this.http.post(`${this.baseUrl}/markets/${marketId}/users/remove`, { userIds });
  }

  // Get users in a market
  getUsersInMarket(marketId: string): Observable<{ users: MarketUser[]; count: number }> {

    return this.http
      .get<{ success?: boolean; data?: { users: MarketUser[]; count: number }; users?: MarketUser[]; count?: number }>(
        `${this.baseUrl}/markets/${marketId}/users`
      )
      .pipe(

        map((resp) => {
          // Normalize backend response shape to a consistent structure
          if (resp?.data?.users) {
            return { users: resp.data.users, count: resp.data.count ?? resp.data.users.length };
          }
          // Fallbacks in case of unwrapped or different shapes
          const users = (resp as any)?.users || [];
          const count = (resp as any)?.count ?? users.length ?? 0;
          return { users, count };
        })
      );
  }

  // Set all users in a market (replace)
  setUsersInMarket(marketId: string, userIds: string[]): Observable<any> {
    return this.http.put(`${this.baseUrl}/markets/${marketId}/users`, { userIds });
  }
}
