import { Injectable } from '@angular/core';
import { Observable, of, Subject } from 'rxjs';
import { tap, shareReplay, catchError } from 'rxjs/operators';
import { CacheConfig, CacheEntry } from '../../../shared/models/cache.model';

@Injectable({
  providedIn: 'root'
})
export class CacheService {
  private readonly DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes
  private readonly DEFAULT_MAX_SIZE = 100;

  private caches = new Map<string, Map<string, CacheEntry<any>>>();
  private cacheConfigs = new Map<string, CacheConfig>();
  private invalidation$ = new Subject<{ namespace: string; key?: string }>();

  /**
   * Register a cache namespace with custom configuration
   */
  registerCache(namespace: string, config?: CacheConfig): void {
    if (!this.caches.has(namespace)) {
      this.caches.set(namespace, new Map());
    }
    
    this.cacheConfigs.set(namespace, {
      ttl: config?.ttl ?? this.DEFAULT_TTL,
      maxSize: config?.maxSize ?? this.DEFAULT_MAX_SIZE
    });
  }

  /**
   * Get cached data or execute the provided observable
   */
  get<T>(
    namespace: string,
    key: string,
    source$: Observable<T>,
    forceRefresh: boolean = false
  ): Observable<T> {
    // Ensure namespace exists
    if (!this.caches.has(namespace)) {
      this.registerCache(namespace);
    }

    const cache = this.caches.get(namespace)!;
    const config = this.cacheConfigs.get(namespace)!;
    const cached = cache.get(key);
    const now = Date.now();

    // Return cached data if valid and not forcing refresh
    if (!forceRefresh && cached && (now - cached.timestamp) < config.ttl!) {
      if (cached.observable) {
        return cached.observable;
      }
      return of(cached.data);
    }

    // If there's already a pending request, return it
    if (cached?.observable) {
      return cached.observable;
    }

    // Create new request with caching
    const request$ = source$.pipe(
      tap(data => {
        // Enforce max size by removing oldest entries
        if (cache.size >= config.maxSize!) {
          const oldestKey = this.findOldestEntry(cache);
          if (oldestKey) {
            cache.delete(oldestKey);
          }
        }

        // Store in cache
        cache.set(key, {
          data,
          timestamp: Date.now(),
          observable: undefined
        });
      }),
      catchError(error => {
        // Remove failed request from cache
        cache.delete(key);
        throw error;
      }),
      shareReplay(1)
    );

    // Store the observable to prevent duplicate requests
    cache.set(key, {
      data: cached?.data,
      timestamp: cached?.timestamp || now,
      observable: request$
    });

    return request$;
  }

  /**
   * Set data directly in cache (useful for optimistic updates)
   */
  set<T>(namespace: string, key: string, data: T): void {
    if (!this.caches.has(namespace)) {
      this.registerCache(namespace);
    }

    const cache = this.caches.get(namespace)!;
    cache.set(key, {
      data,
      timestamp: Date.now(),
      observable: undefined
    });
  }

  /**
   * Check if a key exists in cache and is still valid
   */
  has(namespace: string, key: string): boolean {
    const cache = this.caches.get(namespace);
    if (!cache) return false;

    const cached = cache.get(key);
    if (!cached) return false;

    const config = this.cacheConfigs.get(namespace);
    const now = Date.now();
    
    return (now - cached.timestamp) < (config?.ttl ?? this.DEFAULT_TTL);
  }

  /**
   * Get cached data without making a request (returns undefined if not cached)
   */
  peek<T>(namespace: string, key: string): T | undefined {
    const cache = this.caches.get(namespace);
    if (!cache) return undefined;

    const cached = cache.get(key);
    if (!cached) return undefined;

    const config = this.cacheConfigs.get(namespace);
    const now = Date.now();
    
    if ((now - cached.timestamp) >= (config?.ttl ?? this.DEFAULT_TTL)) {
      cache.delete(key);
      return undefined;
    }

    return cached.data;
  }

  /**
   * Invalidate a specific cache entry
   */
  invalidate(namespace: string, key?: string): void {
    const cache = this.caches.get(namespace);
    if (!cache) return;

    if (key) {
      cache.delete(key);
      this.invalidation$.next({ namespace, key });
    } else {
      cache.clear();
      this.invalidation$.next({ namespace });
    }
  }

  /**
   * Clear all caches in a namespace
   */
  clearNamespace(namespace: string): void {
    this.caches.get(namespace)?.clear();
    this.invalidation$.next({ namespace });
  }

  /**
   * Clear all caches
   */
  clearAll(): void {
    this.caches.clear();
    this.cacheConfigs.clear();
  }

  /**
   * Prune expired entries in a namespace
   */
  pruneNamespace(namespace: string): void {
    const cache = this.caches.get(namespace);
    const config = this.cacheConfigs.get(namespace);
    
    if (!cache || !config) return;

    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, entry] of cache.entries()) {
      if (now - entry.timestamp > config.ttl!) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach(key => cache.delete(key));
  }

  /**
   * Prune all expired entries across all namespaces
   */
  pruneAll(): void {
    for (const namespace of this.caches.keys()) {
      this.pruneNamespace(namespace);
    }
  }

  /**
   * Get observable for cache invalidation events
   */
  onInvalidation(): Observable<{ namespace: string; key?: string }> {
    return this.invalidation$.asObservable();
  }

  /**
   * Get cache statistics for debugging
   */
  getStats(namespace: string): { size: number; keys: string[] } | null {
    const cache = this.caches.get(namespace);
    if (!cache) return null;

    return {
      size: cache.size,
      keys: Array.from(cache.keys())
    };
  }

  private findOldestEntry(cache: Map<string, CacheEntry<any>>): string | null {
    let oldestKey: string | null = null;
    let oldestTimestamp = Infinity;

    for (const [key, entry] of cache.entries()) {
      if (entry.timestamp < oldestTimestamp) {
        oldestTimestamp = entry.timestamp;
        oldestKey = key;
      }
    }

    return oldestKey;
  }
}