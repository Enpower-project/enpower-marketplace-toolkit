import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject, Subject, of } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';
import { CacheService } from '../cache/cache.service';

export interface MarketInfo {
  id: string;
  name: string;
}

export interface AvailableMarketsResponse {
  availableMarkets: string[];
  availableMarketsWithNames?: MarketInfo[];
  requiresSelection: boolean;
  message: string;
  selectedMarket?: string;
  selectedMarketName?: string;
}

export interface MarketSelectionResponse {
  success: boolean;
  message: string;
  marketId: string;
  requiresTokenRefresh: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class MarketSelectionService {
  private readonly SELECTED_MARKET_KEY = 'enpower_selected_market';
  private readonly MARKET_NAMES_CACHE_KEY = 'enpower_market_names_cache';
  private readonly CACHE_NAMESPACE = 'market-selection';

  private selectedMarketSubject = new BehaviorSubject<string | null>(null);
  public selectedMarket$ = this.selectedMarketSubject.asObservable();
  
  private marketRefreshSubject = new Subject<void>();
  public marketRefresh$ = this.marketRefreshSubject.asObservable();
  
  // Cache for market names
  private marketNamesCache = new Map<string, string>();

  constructor(private http: HttpClient, private cacheService: CacheService) {
    // DON'T initialize from localStorage on construction
    // This will be done explicitly after authentication

  }

  /**
   * Initialize service from localStorage data
   */
  private initializeFromStorage(): void {
    try {
      // MIGRATION: Check for old keys and migrate if needed
      const oldKeys = ['selectedMarket', 'selected_market', 'market', 'currentMarket'];
      
      // Restore selected market
      let savedMarket = localStorage.getItem(this.SELECTED_MARKET_KEY);
      
      // If not found, check old keys
      if (!savedMarket) {
        for (const oldKey of oldKeys) {
          const oldValue = localStorage.getItem(oldKey);
          if (oldValue) {
            savedMarket = oldValue;
            // Migrate to new key
            localStorage.setItem(this.SELECTED_MARKET_KEY, oldValue);
            localStorage.removeItem(oldKey);
            break;
          }
        }
      }
      
      if (savedMarket) {
        this.selectedMarketSubject.next(savedMarket);
      }

      // Restore market names cache
      const savedCache = localStorage.getItem(this.MARKET_NAMES_CACHE_KEY);
      if (savedCache) {
        const cacheData = JSON.parse(savedCache);
        this.marketNamesCache = new Map(Object.entries(cacheData));
      } else {
        // Check for old cache key
        const oldCacheKey = 'selectedMarketName';
        const oldCacheName = localStorage.getItem(oldCacheKey);
        if (oldCacheName && savedMarket) {
          this.marketNamesCache.set(savedMarket, oldCacheName);
          localStorage.removeItem(oldCacheKey);
          // Save to new format
          this.saveToStorage();
        }
      }
    } catch (error) {
    }
  }

  /**
   * Save current state to localStorage
   */
  private saveToStorage(): void {
    try {
      const currentMarket = this.selectedMarketSubject.value;
      if (currentMarket) {
        localStorage.setItem(this.SELECTED_MARKET_KEY, currentMarket);
      } else {
        localStorage.removeItem(this.SELECTED_MARKET_KEY);
      }

      // Save market names cache
      const cacheObject = Object.fromEntries(this.marketNamesCache);
      localStorage.setItem(this.MARKET_NAMES_CACHE_KEY, JSON.stringify(cacheObject));
    } catch (error) {
    }
  }

  getAvailableMarkets(): Observable<AvailableMarketsResponse> {
    const url = `${environment.apiGatewayUrl}/api/market/available`;
    const key = 'Available-markets'

    const source$ = this.http.get<AvailableMarketsResponse>(url).pipe(
      tap(response => {
        // Cache market names from the response
        if (response.availableMarketsWithNames) {
          response.availableMarketsWithNames.forEach(market => {
            this.marketNamesCache.set(market.id, market.name);
          });
          
          // Save only the cache, NOT the selected market
          // saveToStorage() would overwrite/remove the selected market if it's null
          try {
            const cacheObject = Object.fromEntries(this.marketNamesCache);
            localStorage.setItem(this.MARKET_NAMES_CACHE_KEY, JSON.stringify(cacheObject));
          } catch (error) {
          }
        }
      }),
      catchError(error => {
        throw error;
      })
    );

    return this.cacheService.get(
      this.CACHE_NAMESPACE,
      key,
      source$
    )
  }

  selectMarket(marketId: string): Observable<MarketSelectionResponse> {
    const url = `${environment.apiGatewayUrl}/api/market/select`;
    const payload = { selectedMarketId: marketId };
    
    return this.http.post<MarketSelectionResponse>(url, payload).pipe(
      tap(response => {
        if (response.success) {
          // Update the BehaviorSubject
          this.selectedMarketSubject.next(marketId);

          this.cacheService.invalidate(this.CACHE_NAMESPACE, 'Available-markets');
          
          // Save BOTH ID and name
          this.saveToStorage();
        }
      }),
      catchError(error => {
        throw error;
      })
    );
  }

  switchMarket(marketId: string): Observable<MarketSelectionResponse> {
  return this.http.post<MarketSelectionResponse>(`${environment.apiGatewayUrl}/api/market/switch`, {
    selectedMarketId: marketId
  }).pipe(
    tap(response => {
      if (response.success) {
        // ✅ Invalidate cache when switching markets
        this.cacheService.invalidate(this.CACHE_NAMESPACE, 'Available-markets');
      }
    })
  );
}

  getCurrentMarket(): Observable<{
    marketId: string | null;
    source: 'jwt' | 'session' | 'none';
    message: string;
  }> {
    return this.http.get<{
      marketId: string | null;
      source: 'jwt' | 'session' | 'none';
      message: string;
    }>(`${environment.apiGatewayUrl}/api/market/current`);
  }

  setSelectedMarket(marketId: string | null, marketName?: string | null): void {
    // Update BehaviorSubject
    this.selectedMarketSubject.next(marketId);
    
    // Update cache if name provided
    if (marketId && marketName) {
      this.marketNamesCache.set(marketId, marketName);
    }
    
    // Save to localStorage
    this.saveToStorage();
  }

  getSelectedMarket(): string | null {
    return this.selectedMarketSubject.value;
  }

  refreshToken(): Observable<{
    success: boolean;
    message: string;
    marketId?: string;
  }> {
    return this.http.post<{
      success: boolean;
      message: string;
      marketId?: string;
    }>(`${environment.apiGatewayUrl}/api/market/refresh-token`, {});
  }

  /**
   * Get market name from cache or return a friendly fallback
   */
  getMarketName(marketId: string): string {
    if (!marketId) return 'No Market';
    
    const cachedName = this.marketNamesCache.get(marketId);
    if (cachedName) {
      return cachedName;
    }
    
    // Fallback to ID-based name
    const shortId = marketId.substring(0, 8).toUpperCase();
    return `Market ${shortId}`;
  }

  /**
   * Check if market name is cached
   */
  hasMarketName(marketId: string): boolean {
    return this.marketNamesCache.has(marketId);
  }

  /**
   * Get all cached market names
   */
  getAllCachedMarkets(): MarketInfo[] {
    return Array.from(this.marketNamesCache.entries()).map(([id, name]) => ({
      id,
      name
    }));
  }

  /**
   * Clear all stored data (useful for logout)
   */
  clearStoredData(): void {
    try {

      localStorage.removeItem(this.SELECTED_MARKET_KEY);
      localStorage.removeItem(this.MARKET_NAMES_CACHE_KEY);
      this.selectedMarketSubject.next(null);
      this.marketNamesCache.clear();
      
      this.cacheService.clearNamespace(this.CACHE_NAMESPACE);
    } catch (error) {
    }
  }

  /**
   * Clear only the selected market (when user closes modal without selecting)
   * Keeps the cache intact
   */
  clearSelectedMarket(): void {
    try {
      localStorage.removeItem(this.SELECTED_MARKET_KEY);
      this.selectedMarketSubject.next(null);
    } catch (error) {
    }
  }

  /**
   * Check if there's a persisted market selection
   */
  hasPersistedMarket(): boolean {
    try {
      const savedMarket = localStorage.getItem(this.SELECTED_MARKET_KEY);
      return !!savedMarket;
    } catch (error) {
      return false;
    }
  }

  /**
   * Force refresh available markets (bypasses any caching)
   */
  refreshAvailableMarkets(): Observable<AvailableMarketsResponse> {
    // Clear the local cache first
    this.marketNamesCache.clear();

    this.cacheService.invalidate(this.CACHE_NAMESPACE, 'Available-markets');
    
    // Get fresh data from the server
    return this.getAvailableMarkets();
  }

  /**
   * Trigger market refresh event
   * Call this after accepting a market to notify components to reload
   */
  triggerMarketRefresh(): void {
    this.marketRefreshSubject.next();
  }
}