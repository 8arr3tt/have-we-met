/**
 * Service cache interface and extended types
 * @module services/cache/cache-interface
 */

import type { CacheEntry, CacheStats, ServiceCache } from '../types.js'

/**
 * Extended cache entry with additional metadata for LRU tracking
 */
export interface ExtendedCacheEntry<T> extends CacheEntry<T> {
  /** Key for this entry */
  key: string

  /** Size in bytes (estimated) */
  sizeBytes?: number

  /** Access count for analytics */
  accessCount: number

  /** Last access time for LRU eviction */
  lastAccessedAt: Date

  /** Stale window extension in seconds (optional) */
  staleWindowSeconds?: number
}

/**
 * Extended cache statistics with additional metrics
 */
export interface ExtendedCacheStats extends CacheStats {
  /** Total bytes stored (estimated) */
  totalBytes?: number

  /** Maximum capacity in entries */
  maxSize: number

  /** Number of evictions performed */
  evictions: number

  /** Number of expired entries removed */
  expirations: number

  /** Average entry age in milliseconds */
  averageAgeMs?: number
}

/**
 * Options for cache operations
 */
export interface CacheSetOptions {
  /** Override default TTL for this entry */
  ttlSeconds?: number

  /** Stale window extension after TTL expires */
  staleWindowSeconds?: number

  /** Size hint for this entry in bytes */
  sizeBytes?: number
}

/**
 * Options for cache retrieval
 */
export interface CacheGetOptions {
  /** Allow returning stale entries */
  allowStale?: boolean

  /** Update last access time */
  updateAccess?: boolean
}

/**
 * Extended service cache interface with additional capabilities
 */
export interface ExtendedServiceCache extends ServiceCache {
  /** Get entry with extended options */
  getWithOptions<T>(key: string, options?: CacheGetOptions): Promise<ExtendedCacheEntry<T> | null>

  /** Set entry with extended options */
  setWithOptions<T>(key: string, value: T, options: CacheSetOptions): Promise<void>

  /** Check if a key exists without retrieving */
  has(key: string): Promise<boolean>

  /** Get multiple values at once */
  getMany<T>(keys: string[]): Promise<Map<string, CacheEntry<T> | null>>

  /** Set multiple values at once */
  setMany<T>(entries: Array<{ key: string; value: T; ttlSeconds: number }>): Promise<void>

  /** Get extended statistics */
  getExtendedStats(): ExtendedCacheStats

  /** Prune expired entries */
  prune(): Promise<number>

  /** Get all keys matching a pattern */
  keys(pattern?: string): Promise<string[]>
}

/**
 * Configuration for the memory cache
 */
export interface MemoryCacheConfig {
  /** Maximum number of entries */
  maxSize: number

  /** Default TTL in seconds */
  defaultTtlSeconds: number

  /** Default stale window in seconds after TTL */
  defaultStaleWindowSeconds?: number

  /** Prune interval in milliseconds (0 to disable) */
  pruneIntervalMs?: number

  /** Event handler for evictions */
  onEviction?: (key: string, reason: 'lru' | 'expired' | 'manual') => void

  /** Enable size tracking (requires sizeBytes in set options) */
  trackSize?: boolean

  /** Maximum total size in bytes (requires trackSize) */
  maxTotalBytes?: number
}

/**
 * Default memory cache configuration
 */
export const DEFAULT_MEMORY_CACHE_CONFIG: MemoryCacheConfig = {
  maxSize: 1000,
  defaultTtlSeconds: 300,
  defaultStaleWindowSeconds: 60,
  pruneIntervalMs: 60000,
  trackSize: false,
}

/**
 * Cache operation result
 */
export interface CacheOperationResult {
  /** Whether the operation succeeded */
  success: boolean

  /** Whether the value was from cache */
  cached: boolean

  /** Whether the value was stale */
  stale: boolean

  /** Time spent in cache operation (ms) */
  cacheTimeMs: number
}

/**
 * Result from cache-wrapped execution
 */
export interface CacheWrappedResult<T> {
  /** The result value */
  result: T

  /** Cache operation details */
  cacheDetails: CacheOperationResult
}
