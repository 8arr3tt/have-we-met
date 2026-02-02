/**
 * In-memory LRU cache implementation for service caching
 * @module services/cache/memory-cache
 */

import type { CacheEntry, CacheStats } from '../types.js'
import type {
  ExtendedCacheEntry,
  ExtendedCacheStats,
  ExtendedServiceCache,
  MemoryCacheConfig,
  CacheSetOptions,
  CacheGetOptions,
} from './cache-interface.js'
import { DEFAULT_MEMORY_CACHE_CONFIG } from './cache-interface.js'

/**
 * Internal cache entry with LRU tracking
 */
interface InternalEntry<T> {
  value: T
  cachedAt: Date
  expiresAt: Date
  staleUntil: Date
  sizeBytes?: number
  accessCount: number
  lastAccessedAt: Date
}

/**
 * In-memory LRU cache implementation
 *
 * Features:
 * - LRU eviction when capacity is reached
 * - TTL-based expiration with optional stale window
 * - Automatic pruning of expired entries
 * - Size tracking (optional)
 * - Statistics tracking
 */
export class MemoryCache implements ExtendedServiceCache {
  private readonly cache: Map<string, InternalEntry<unknown>> = new Map()
  private readonly config: MemoryCacheConfig
  private readonly stats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    expirations: 0,
  }
  private totalBytes = 0
  private pruneTimer?: ReturnType<typeof setInterval>

  constructor(config: Partial<MemoryCacheConfig> = {}) {
    this.config = { ...DEFAULT_MEMORY_CACHE_CONFIG, ...config }

    if (this.config.pruneIntervalMs && this.config.pruneIntervalMs > 0) {
      this.pruneTimer = setInterval(() => {
        void this.prune()
      }, this.config.pruneIntervalMs)
    }
  }

  async get<T>(key: string): Promise<CacheEntry<T> | null> {
    return this.getWithOptions<T>(key, {
      allowStale: false,
      updateAccess: true,
    })
  }

  async getWithOptions<T>(
    key: string,
    options: CacheGetOptions = {}
  ): Promise<ExtendedCacheEntry<T> | null> {
    const { allowStale = false, updateAccess = true } = options
    const entry = this.cache.get(key) as InternalEntry<T> | undefined

    if (!entry) {
      this.stats.misses++
      return null
    }

    const now = new Date()
    const isExpired = now > entry.expiresAt
    const isStale = isExpired && now <= entry.staleUntil

    if (isExpired && !isStale) {
      this.deleteEntry(key, 'expired')
      this.stats.misses++
      return null
    }

    if (isExpired && !allowStale) {
      this.stats.misses++
      return null
    }

    if (updateAccess) {
      entry.accessCount++
      entry.lastAccessedAt = now
      this.moveToEnd(key)
    }

    this.stats.hits++

    return {
      key,
      value: entry.value,
      cachedAt: entry.cachedAt,
      expiresAt: entry.expiresAt,
      isStale,
      sizeBytes: entry.sizeBytes,
      accessCount: entry.accessCount,
      lastAccessedAt: entry.lastAccessedAt,
    }
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    await this.setWithOptions(key, value, { ttlSeconds })
  }

  async setWithOptions<T>(
    key: string,
    value: T,
    options: CacheSetOptions
  ): Promise<void> {
    const ttlSeconds = options.ttlSeconds ?? this.config.defaultTtlSeconds
    const staleWindowSeconds =
      options.staleWindowSeconds ?? this.config.defaultStaleWindowSeconds ?? 0

    const now = new Date()
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000)
    const staleUntil = new Date(expiresAt.getTime() + staleWindowSeconds * 1000)

    const existingEntry = this.cache.get(key)
    if (existingEntry && this.config.trackSize && existingEntry.sizeBytes) {
      this.totalBytes -= existingEntry.sizeBytes
    }

    if (!existingEntry && this.cache.size >= this.config.maxSize) {
      this.evictLRU()
    }

    if (this.config.maxTotalBytes && options.sizeBytes) {
      while (
        this.totalBytes + options.sizeBytes > this.config.maxTotalBytes &&
        this.cache.size > 0
      ) {
        this.evictLRU()
      }
    }

    const entry: InternalEntry<T> = {
      value,
      cachedAt: now,
      expiresAt,
      staleUntil,
      sizeBytes: options.sizeBytes,
      accessCount: 0,
      lastAccessedAt: now,
    }

    this.cache.delete(key)
    this.cache.set(key, entry as InternalEntry<unknown>)

    if (this.config.trackSize && options.sizeBytes) {
      this.totalBytes += options.sizeBytes
    }
  }

  async delete(key: string): Promise<boolean> {
    return this.deleteEntry(key, 'manual')
  }

  async clear(): Promise<void> {
    this.cache.clear()
    this.totalBytes = 0
    this.stats.hits = 0
    this.stats.misses = 0
    this.stats.evictions = 0
    this.stats.expirations = 0
  }

  getStats(): CacheStats {
    const total = this.stats.hits + this.stats.misses
    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: total > 0 ? this.stats.hits / total : 0,
      size: this.cache.size,
      oldestEntry: this.getOldestEntry(),
    }
  }

  getExtendedStats(): ExtendedCacheStats {
    const basicStats = this.getStats()
    return {
      ...basicStats,
      totalBytes: this.config.trackSize ? this.totalBytes : undefined,
      maxSize: this.config.maxSize,
      evictions: this.stats.evictions,
      expirations: this.stats.expirations,
      averageAgeMs: this.calculateAverageAge(),
    }
  }

  async has(key: string): Promise<boolean> {
    const entry = this.cache.get(key)
    if (!entry) return false

    const now = new Date()
    if (now > entry.staleUntil) {
      this.deleteEntry(key, 'expired')
      return false
    }

    return true
  }

  async getMany<T>(keys: string[]): Promise<Map<string, CacheEntry<T> | null>> {
    const results = new Map<string, CacheEntry<T> | null>()
    for (const key of keys) {
      results.set(key, await this.get<T>(key))
    }
    return results
  }

  async setMany<T>(
    entries: Array<{ key: string; value: T; ttlSeconds: number }>
  ): Promise<void> {
    for (const entry of entries) {
      await this.set(entry.key, entry.value, entry.ttlSeconds)
    }
  }

  async prune(): Promise<number> {
    const now = new Date()
    let pruned = 0

    for (const [key, entry] of this.cache) {
      if (now > entry.staleUntil) {
        this.deleteEntry(key, 'expired')
        pruned++
      }
    }

    return pruned
  }

  async keys(pattern?: string): Promise<string[]> {
    const allKeys = Array.from(this.cache.keys())

    if (!pattern) {
      return allKeys
    }

    const regex = new RegExp(pattern.replace(/\*/g, '.*'))
    return allKeys.filter((key) => regex.test(key))
  }

  dispose(): void {
    if (this.pruneTimer) {
      clearInterval(this.pruneTimer)
      this.pruneTimer = undefined
    }
    this.cache.clear()
  }

  private deleteEntry(
    key: string,
    reason: 'lru' | 'expired' | 'manual'
  ): boolean {
    const entry = this.cache.get(key)
    if (!entry) return false

    if (this.config.trackSize && entry.sizeBytes) {
      this.totalBytes -= entry.sizeBytes
    }

    this.cache.delete(key)

    if (reason === 'expired') {
      this.stats.expirations++
    }

    this.config.onEviction?.(key, reason)

    return true
  }

  private evictLRU(): void {
    const firstKey = this.cache.keys().next().value
    if (firstKey !== undefined) {
      this.deleteEntry(firstKey as string, 'lru')
      this.stats.evictions++
    }
  }

  private moveToEnd(key: string): void {
    const entry = this.cache.get(key)
    if (entry) {
      this.cache.delete(key)
      this.cache.set(key, entry)
    }
  }

  private getOldestEntry(): Date | undefined {
    const firstEntry = this.cache.values().next().value as
      | InternalEntry<unknown>
      | undefined
    return firstEntry?.cachedAt
  }

  private calculateAverageAge(): number | undefined {
    if (this.cache.size === 0) return undefined

    const now = Date.now()
    let totalAge = 0

    for (const entry of this.cache.values()) {
      totalAge += now - entry.cachedAt.getTime()
    }

    return totalAge / this.cache.size
  }
}

/**
 * Create a memory cache instance with the given configuration
 */
export function createMemoryCache(
  config?: Partial<MemoryCacheConfig>
): MemoryCache {
  return new MemoryCache(config)
}

/**
 * Create a simple no-op cache for testing or disabling caching
 */
export function createNoOpCache(): ExtendedServiceCache {
  return {
    async get<T>(): Promise<CacheEntry<T> | null> {
      return null
    },
    async getWithOptions<T>(): Promise<ExtendedCacheEntry<T> | null> {
      return null
    },
    async set(): Promise<void> {},
    async setWithOptions(): Promise<void> {},
    async delete(): Promise<boolean> {
      return false
    },
    async clear(): Promise<void> {},
    getStats(): CacheStats {
      return { hits: 0, misses: 0, hitRate: 0, size: 0 }
    },
    getExtendedStats(): ExtendedCacheStats {
      return {
        hits: 0,
        misses: 0,
        hitRate: 0,
        size: 0,
        maxSize: 0,
        evictions: 0,
        expirations: 0,
      }
    },
    async has(): Promise<boolean> {
      return false
    },
    async getMany<T>(
      keys: string[]
    ): Promise<Map<string, CacheEntry<T> | null>> {
      return new Map(keys.map((k) => [k, null]))
    },
    async setMany(): Promise<void> {},
    async prune(): Promise<number> {
      return 0
    },
    async keys(): Promise<string[]> {
      return []
    },
  }
}
