/**
 * Service caching module
 * @module services/cache
 */

// Types and interfaces
export type {
  ExtendedCacheEntry,
  ExtendedCacheStats,
  CacheSetOptions,
  CacheGetOptions,
  ExtendedServiceCache,
  MemoryCacheConfig,
  CacheOperationResult,
  CacheWrappedResult,
} from './cache-interface.js'

export { DEFAULT_MEMORY_CACHE_CONFIG } from './cache-interface.js'

// Memory cache implementation
export { MemoryCache, createMemoryCache, createNoOpCache } from './memory-cache.js'

// Cache key generation
export type { CacheKeyOptions } from './cache-key-generator.js'

export {
  DEFAULT_CACHE_KEY_OPTIONS,
  fnv1aHash,
  stableStringify,
  stableHash,
  generateCacheKey,
  createCacheKeyGenerator,
  normalizeCacheKey,
  isValidCacheKey,
} from './cache-key-generator.js'

// Cache wrapper utilities
export type { CacheWrapperOptions } from './cache-wrapper.js'

export {
  withCache,
  withCacheDetailed,
  createCachedFunction,
  createCacheWrapper,
  cacheMethod,
  batchWithCache,
  refreshInBackground,
} from './cache-wrapper.js'
