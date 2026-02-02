/**
 * Cache wrapper for service execution
 * @module services/cache/cache-wrapper
 */

import type { CacheConfig, ServiceCache, CacheEntry } from '../types.js'
import type {
  CacheWrappedResult,
  ExtendedServiceCache,
} from './cache-interface.js'
import { generateCacheKey } from './cache-key-generator.js'

/**
 * Options for the cache wrapper
 */
export interface CacheWrapperOptions {
  /** Cache instance to use */
  cache: ServiceCache | ExtendedServiceCache

  /** Cache configuration */
  config: CacheConfig

  /** Service name for key generation */
  serviceName: string

  /** Whether to track timing information */
  trackTiming?: boolean
}

/**
 * Wrap a function execution with caching
 *
 * Implements the cache-aside pattern:
 * 1. Check cache for existing value
 * 2. If found and not stale, return cached value
 * 3. If not found or stale, execute function
 * 4. Store result in cache
 * 5. Return result
 *
 * Also supports stale-on-error: if execution fails and a stale
 * cache entry exists, return the stale value instead of throwing.
 *
 * @example
 * ```typescript
 * const result = await withCache(
 *   'user:123',
 *   async () => fetchUser(123),
 *   config,
 *   cache
 * )
 * // result.cached indicates whether value came from cache
 * ```
 */
export async function withCache<T>(
  key: string,
  fn: () => Promise<T>,
  config: CacheConfig,
  cache: ServiceCache
): Promise<{ result: T; cached: boolean }> {
  if (!config.enabled) {
    const result = await fn()
    return { result, cached: false }
  }

  // Get fresh entry first
  const cached = await cache.get<T>(key)

  if (cached && !cached.isStale) {
    return { result: cached.value, cached: true }
  }

  // Get stale entry if staleOnError is enabled
  let staleEntry: CacheEntry<T> | null = null
  if (config.staleOnError) {
    const extendedCache = cache as ExtendedServiceCache
    if (typeof extendedCache.getWithOptions === 'function') {
      staleEntry = await extendedCache.getWithOptions<T>(key, {
        allowStale: true,
      })
    }
  }

  try {
    const result = await fn()
    await cache.set(key, result, config.ttlSeconds)
    return { result, cached: false }
  } catch (error) {
    if (config.staleOnError && staleEntry) {
      return { result: staleEntry.value, cached: true }
    }
    throw error
  }
}

/**
 * Wrap service execution with caching and full details
 *
 * Returns detailed information about cache operations including
 * timing, staleness, and cache hit/miss status.
 */
export async function withCacheDetailed<T>(
  key: string,
  fn: () => Promise<T>,
  config: CacheConfig,
  cache: ServiceCache
): Promise<CacheWrappedResult<T>> {
  const startTime = Date.now()

  if (!config.enabled) {
    const result = await fn()
    return {
      result,
      cacheDetails: {
        success: true,
        cached: false,
        stale: false,
        cacheTimeMs: Date.now() - startTime,
      },
    }
  }

  // Get fresh entry first
  const cached = await cache.get<T>(key)
  const cacheCheckTime = Date.now() - startTime

  if (cached && !cached.isStale) {
    return {
      result: cached.value,
      cacheDetails: {
        success: true,
        cached: true,
        stale: false,
        cacheTimeMs: cacheCheckTime,
      },
    }
  }

  // Get stale entry if staleOnError is enabled
  let staleEntry: CacheEntry<T> | null = null
  if (config.staleOnError) {
    const extendedCache = cache as ExtendedServiceCache
    if (typeof extendedCache.getWithOptions === 'function') {
      staleEntry = await extendedCache.getWithOptions<T>(key, {
        allowStale: true,
      })
    }
  }

  try {
    const result = await fn()

    const setStart = Date.now()
    await cache.set(key, result, config.ttlSeconds)
    const setTime = Date.now() - setStart

    return {
      result,
      cacheDetails: {
        success: true,
        cached: false,
        stale: false,
        cacheTimeMs: cacheCheckTime + setTime,
      },
    }
  } catch (error) {
    if (config.staleOnError && staleEntry) {
      return {
        result: staleEntry.value,
        cacheDetails: {
          success: true,
          cached: true,
          stale: true,
          cacheTimeMs: cacheCheckTime,
        },
      }
    }
    throw error
  }
}

/**
 * Create a cached version of an async function
 *
 * @example
 * ```typescript
 * const cachedFetch = createCachedFunction(
 *   'api-fetch',
 *   async (url: string) => fetch(url).then(r => r.json()),
 *   { enabled: true, ttlSeconds: 300, staleOnError: true },
 *   cache,
 *   (url) => url
 * )
 *
 * const data = await cachedFetch('https://api.example.com/data')
 * ```
 */
export function createCachedFunction<TArgs extends unknown[], TResult>(
  serviceName: string,
  fn: (...args: TArgs) => Promise<TResult>,
  config: CacheConfig,
  cache: ServiceCache,
  keyFn?: (...args: TArgs) => string
): (...args: TArgs) => Promise<{ result: TResult; cached: boolean }> {
  return async (...args: TArgs) => {
    const key = keyFn
      ? generateCacheKey(serviceName, keyFn(...args))
      : generateCacheKey(serviceName, args)

    return withCache(key, () => fn(...args), config, cache)
  }
}

/**
 * Create a cache wrapper instance with preset configuration
 *
 * Useful for wrapping multiple service calls with the same cache settings.
 */
export function createCacheWrapper(options: CacheWrapperOptions) {
  const { cache, config, serviceName } = options

  return {
    /**
     * Execute with caching using generated key
     */
    async execute<T>(
      input: unknown,
      fn: () => Promise<T>
    ): Promise<{ result: T; cached: boolean }> {
      const key = generateCacheKey(serviceName, input, config.keyFn)
      return withCache(key, fn, config, cache)
    },

    /**
     * Execute with caching using custom key
     */
    async executeWithKey<T>(
      key: string,
      fn: () => Promise<T>
    ): Promise<{ result: T; cached: boolean }> {
      const fullKey = `${serviceName}:${key}`
      return withCache(fullKey, fn, config, cache)
    },

    /**
     * Execute with detailed cache information
     */
    async executeDetailed<T>(
      input: unknown,
      fn: () => Promise<T>
    ): Promise<CacheWrappedResult<T>> {
      const key = generateCacheKey(serviceName, input, config.keyFn)
      return withCacheDetailed(key, fn, config, cache)
    },

    /**
     * Invalidate a cached entry
     */
    async invalidate(input: unknown): Promise<boolean> {
      const key = generateCacheKey(serviceName, input, config.keyFn)
      return cache.delete(key)
    },

    /**
     * Invalidate by custom key
     */
    async invalidateKey(key: string): Promise<boolean> {
      const fullKey = `${serviceName}:${key}`
      return cache.delete(fullKey)
    },

    /**
     * Warm the cache with a value
     */
    async warm<T>(input: unknown, value: T): Promise<void> {
      const key = generateCacheKey(serviceName, input, config.keyFn)
      await cache.set(key, value, config.ttlSeconds)
    },

    /**
     * Check if an entry is cached
     */
    async isCached(input: unknown): Promise<boolean> {
      const key = generateCacheKey(serviceName, input, config.keyFn)
      const entry = await cache.get(key)
      return entry !== null && !entry.isStale
    },

    /**
     * Get cache configuration
     */
    getConfig(): CacheConfig {
      return { ...config }
    },
  }
}

/**
 * Cache decorator for class methods
 *
 * Note: This is a higher-order function that returns a method decorator pattern.
 * Use with caution as TypeScript decorators are an experimental feature.
 *
 * @example
 * ```typescript
 * class UserService {
 *   private cache = createMemoryCache()
 *
 *   getUser = cacheMethod(
 *     'user-service',
 *     this.cache,
 *     { enabled: true, ttlSeconds: 300 },
 *     async (id: string) => this.fetchUser(id),
 *     (id) => id
 *   )
 * }
 * ```
 */
export function cacheMethod<TArgs extends unknown[], TResult>(
  serviceName: string,
  cache: ServiceCache,
  config: CacheConfig,
  method: (...args: TArgs) => Promise<TResult>,
  keyFn: (...args: TArgs) => string
): (...args: TArgs) => Promise<TResult> {
  return async (...args: TArgs): Promise<TResult> => {
    const key = generateCacheKey(serviceName, keyFn(...args))
    const { result } = await withCache(
      key,
      () => method(...args),
      config,
      cache
    )
    return result
  }
}

/**
 * Batch cache get operation
 *
 * Efficiently retrieves multiple values from cache, executing the provided
 * function only for cache misses.
 */
export async function batchWithCache<K, V>(
  keys: K[],
  cache: ServiceCache,
  config: CacheConfig,
  keyFn: (key: K) => string,
  fetchFn: (missingKeys: K[]) => Promise<Map<K, V>>
): Promise<Map<K, { value: V; cached: boolean }>> {
  const results = new Map<K, { value: V; cached: boolean }>()

  if (!config.enabled) {
    const fetched = await fetchFn(keys)
    for (const [key, value] of fetched) {
      results.set(key, { value, cached: false })
    }
    return results
  }

  const missingKeys: K[] = []

  for (const key of keys) {
    const cacheKey = keyFn(key)
    const cached = await cache.get<V>(cacheKey)

    if (cached && !cached.isStale) {
      results.set(key, { value: cached.value, cached: true })
    } else {
      missingKeys.push(key)
    }
  }

  if (missingKeys.length > 0) {
    const fetched = await fetchFn(missingKeys)

    for (const [key, value] of fetched) {
      const cacheKey = keyFn(key)
      await cache.set(cacheKey, value, config.ttlSeconds)
      results.set(key, { value, cached: false })
    }
  }

  return results
}

/**
 * Refresh a cached value in the background
 *
 * Returns the current cached value immediately while refreshing
 * the cache in the background.
 */
export async function refreshInBackground<T>(
  key: string,
  fn: () => Promise<T>,
  config: CacheConfig,
  cache: ServiceCache
): Promise<{ result: T | null; refreshing: boolean }> {
  // First try to get fresh value
  const fresh = await cache.get<T>(key)

  if (fresh && !fresh.isStale) {
    return { result: fresh.value, refreshing: false }
  }

  // Check for stale value using extended cache interface if available
  const extendedCache = cache as ExtendedServiceCache
  let stale: CacheEntry<T> | null = null

  if (typeof extendedCache.getWithOptions === 'function') {
    stale = await extendedCache.getWithOptions<T>(key, { allowStale: true })
  }

  if (!stale) {
    // No cached value at all, fetch fresh
    const result = await fn()
    await cache.set(key, result, config.ttlSeconds)
    return { result, refreshing: false }
  }

  // Have a stale value, return it and refresh in background
  void fn()
    .then((result) => cache.set(key, result, config.ttlSeconds))
    .catch(() => {})

  return { result: stale.value, refreshing: true }
}
