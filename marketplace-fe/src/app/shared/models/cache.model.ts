import { Observable } from "rxjs";

export interface CacheEntry<T>{
    data: T;
    timestamp: number;
    observable?: Observable<T>;
}

export interface CacheConfig {
  ttl?: number;
  maxSize?: number;
}