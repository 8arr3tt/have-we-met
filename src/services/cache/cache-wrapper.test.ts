import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { CacheConfig } from '../types.js'
import { MemoryCache } from './memory-cache.js'
import {
  withCache,
  withCacheDetailed,
  createCachedFunction,
  createCacheWrapper,
  cacheMethod,
  batchWithCache,
  refreshInBackground,
} from './cache-wrapper.js'

describe('withCache', () => {
  let cache: MemoryCache
  let config: CacheConfig

  beforeEach(() => {
    cache = new MemoryCache({ pruneIntervalMs: 0 })
    config = {
      enabled: true,
      ttlSeconds: 60,
      staleOnError: true,
    }
  })

  afterEach(() => {
    cache.dispose()
  })

  it('returns cached value on hit', async () => {
    const fn = vi.fn().mockResolvedValue('value')

    await cache.set('key', 'cached-value', 60)

    const result = await withCache('key', fn, config, cache)

    expect(result.result).toBe('cached-value')
    expect(result.cached).toBe(true)
    expect(fn).not.toHaveBeenCalled()
  })

  it('executes function on cache miss', async () => {
    const fn = vi.fn().mockResolvedValue('new-value')

    const result = await withCache('key', fn, config, cache)

    expect(result.result).toBe('new-value')
    expect(result.cached).toBe(false)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('stores result in cache after execution', async () => {
    const fn = vi.fn().mockResolvedValue('new-value')

    await withCache('key', fn, config, cache)

    const cached = await cache.get<string>('key')
    expect(cached?.value).toBe('new-value')
  })

  it('returns stale value on error when configured', async () => {
    vi.useFakeTimers()

    // Need a cache with stale window configured
    cache.dispose()
    cache = new MemoryCache({
      defaultStaleWindowSeconds: 60,
      pruneIntervalMs: 0,
    })

    await cache.set('key', 'stale-value', 1)

    vi.advanceTimersByTime(2000)

    const fn = vi.fn().mockRejectedValue(new Error('fetch failed'))

    const result = await withCache('key', fn, config, cache)

    expect(result.result).toBe('stale-value')
    expect(result.cached).toBe(true)

    vi.useRealTimers()
  })

  it('throws error when no stale value available', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fetch failed'))

    await expect(withCache('key', fn, config, cache)).rejects.toThrow(
      'fetch failed'
    )
  })

  it('throws error when staleOnError is disabled', async () => {
    vi.useFakeTimers()

    // Need a cache with stale window configured
    cache.dispose()
    cache = new MemoryCache({
      defaultStaleWindowSeconds: 60,
      pruneIntervalMs: 0,
    })

    config.staleOnError = false
    await cache.set('key', 'stale-value', 1)

    vi.advanceTimersByTime(2000)

    const fn = vi.fn().mockRejectedValue(new Error('fetch failed'))

    await expect(withCache('key', fn, config, cache)).rejects.toThrow(
      'fetch failed'
    )

    vi.useRealTimers()
  })

  it('bypasses cache when disabled', async () => {
    config.enabled = false
    await cache.set('key', 'cached-value', 60)

    const fn = vi.fn().mockResolvedValue('fresh-value')

    const result = await withCache('key', fn, config, cache)

    expect(result.result).toBe('fresh-value')
    expect(result.cached).toBe(false)
    expect(fn).toHaveBeenCalled()
  })

  it('does not return stale value for fresh cache check', async () => {
    vi.useFakeTimers()

    cache = new MemoryCache({
      defaultStaleWindowSeconds: 30,
      pruneIntervalMs: 0,
    })

    await cache.set('key', 'value', 5)

    vi.advanceTimersByTime(6000)

    const fn = vi.fn().mockResolvedValue('fresh-value')

    const result = await withCache('key', fn, config, cache)

    expect(result.result).toBe('fresh-value')
    expect(result.cached).toBe(false)
    expect(fn).toHaveBeenCalled()

    cache.dispose()
    vi.useRealTimers()
  })
})

describe('withCacheDetailed', () => {
  let cache: MemoryCache
  let config: CacheConfig

  beforeEach(() => {
    cache = new MemoryCache({ pruneIntervalMs: 0 })
    config = {
      enabled: true,
      ttlSeconds: 60,
      staleOnError: true,
    }
  })

  afterEach(() => {
    cache.dispose()
  })

  it('returns cache details on hit', async () => {
    await cache.set('key', 'cached-value', 60)

    const result = await withCacheDetailed(
      'key',
      async () => 'new-value',
      config,
      cache
    )

    expect(result.result).toBe('cached-value')
    expect(result.cacheDetails.cached).toBe(true)
    expect(result.cacheDetails.stale).toBe(false)
    expect(result.cacheDetails.success).toBe(true)
    expect(result.cacheDetails.cacheTimeMs).toBeGreaterThanOrEqual(0)
  })

  it('returns cache details on miss', async () => {
    const result = await withCacheDetailed(
      'key',
      async () => 'new-value',
      config,
      cache
    )

    expect(result.result).toBe('new-value')
    expect(result.cacheDetails.cached).toBe(false)
    expect(result.cacheDetails.stale).toBe(false)
    expect(result.cacheDetails.success).toBe(true)
  })

  it('returns stale indicator when using stale value', async () => {
    vi.useFakeTimers()

    // Need a cache with stale window configured
    cache.dispose()
    cache = new MemoryCache({
      defaultStaleWindowSeconds: 60,
      pruneIntervalMs: 0,
    })

    await cache.set('key', 'stale-value', 1)

    vi.advanceTimersByTime(2000)

    const result = await withCacheDetailed(
      'key',
      async () => {
        throw new Error('fail')
      },
      config,
      cache
    )

    expect(result.result).toBe('stale-value')
    expect(result.cacheDetails.cached).toBe(true)
    expect(result.cacheDetails.stale).toBe(true)

    vi.useRealTimers()
  })

  it('tracks timing information', async () => {
    // Don't use setTimeout in the test function, just ensure cacheTimeMs is tracked
    const result = await withCacheDetailed(
      'key',
      async () => 'value',
      config,
      cache
    )

    expect(result.cacheDetails.cacheTimeMs).toBeGreaterThanOrEqual(0)
  })

  it('handles disabled cache', async () => {
    config.enabled = false

    const result = await withCacheDetailed(
      'key',
      async () => 'value',
      config,
      cache
    )

    expect(result.result).toBe('value')
    expect(result.cacheDetails.cached).toBe(false)
    expect(result.cacheDetails.success).toBe(true)
  })
})

describe('createCachedFunction', () => {
  let cache: MemoryCache
  let config: CacheConfig

  beforeEach(() => {
    cache = new MemoryCache({ pruneIntervalMs: 0 })
    config = { enabled: true, ttlSeconds: 60, staleOnError: false }
  })

  afterEach(() => {
    cache.dispose()
  })

  it('creates a cached function', async () => {
    const fn = vi.fn(async (id: number) => `user-${id}`)
    const cachedFn = createCachedFunction('user-lookup', fn, config, cache)

    const result1 = await cachedFn(123)
    expect(result1.result).toBe('user-123')
    expect(result1.cached).toBe(false)

    const result2 = await cachedFn(123)
    expect(result2.result).toBe('user-123')
    expect(result2.cached).toBe(true)

    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('uses custom key function', async () => {
    const fn = vi.fn(
      async (opts: { id: number; extra: string }) => `user-${opts.id}`
    )
    const cachedFn = createCachedFunction(
      'user-lookup',
      fn,
      config,
      cache,
      (opts) => `id-${opts.id}`
    )

    await cachedFn({ id: 1, extra: 'a' })
    await cachedFn({ id: 1, extra: 'b' })

    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('caches different inputs separately', async () => {
    const fn = vi.fn(async (id: number) => `user-${id}`)
    const cachedFn = createCachedFunction('user-lookup', fn, config, cache)

    await cachedFn(1)
    await cachedFn(2)
    await cachedFn(1)

    expect(fn).toHaveBeenCalledTimes(2)
  })
})

describe('createCacheWrapper', () => {
  let cache: MemoryCache
  let config: CacheConfig

  beforeEach(() => {
    cache = new MemoryCache({ pruneIntervalMs: 0 })
    config = { enabled: true, ttlSeconds: 60, staleOnError: false }
  })

  afterEach(() => {
    cache.dispose()
  })

  it('creates a wrapper with execute method', async () => {
    const wrapper = createCacheWrapper({
      cache,
      config,
      serviceName: 'test-service',
    })

    const fn = vi.fn().mockResolvedValue('value')

    const result = await wrapper.execute({ id: 1 }, fn)
    expect(result.result).toBe('value')
    expect(result.cached).toBe(false)

    const result2 = await wrapper.execute({ id: 1 }, fn)
    expect(result2.cached).toBe(true)

    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('supports executeWithKey method', async () => {
    const wrapper = createCacheWrapper({
      cache,
      config,
      serviceName: 'test-service',
    })

    const fn = vi.fn().mockResolvedValue('value')

    await wrapper.executeWithKey('custom-key', fn)

    const cached = await cache.get('test-service:custom-key')
    expect(cached).not.toBeNull()
  })

  it('supports executeDetailed method', async () => {
    const wrapper = createCacheWrapper({
      cache,
      config,
      serviceName: 'test-service',
    })

    const result = await wrapper.executeDetailed({ id: 1 }, async () => 'value')

    expect(result.cacheDetails).toBeDefined()
    expect(result.cacheDetails.cached).toBe(false)
  })

  it('supports invalidate method', async () => {
    const wrapper = createCacheWrapper({
      cache,
      config,
      serviceName: 'test-service',
    })

    await wrapper.execute({ id: 1 }, async () => 'value')
    expect(await wrapper.isCached({ id: 1 })).toBe(true)

    await wrapper.invalidate({ id: 1 })
    expect(await wrapper.isCached({ id: 1 })).toBe(false)
  })

  it('supports invalidateKey method', async () => {
    const wrapper = createCacheWrapper({
      cache,
      config,
      serviceName: 'test-service',
    })

    await wrapper.executeWithKey('my-key', async () => 'value')
    await wrapper.invalidateKey('my-key')

    const cached = await cache.get('test-service:my-key')
    expect(cached).toBeNull()
  })

  it('supports warm method', async () => {
    const wrapper = createCacheWrapper({
      cache,
      config,
      serviceName: 'test-service',
    })

    await wrapper.warm({ id: 1 }, 'pre-warmed-value')

    const fn = vi.fn().mockResolvedValue('new-value')
    const result = await wrapper.execute({ id: 1 }, fn)

    expect(result.result).toBe('pre-warmed-value')
    expect(fn).not.toHaveBeenCalled()
  })

  it('supports isCached method', async () => {
    const wrapper = createCacheWrapper({
      cache,
      config,
      serviceName: 'test-service',
    })

    expect(await wrapper.isCached({ id: 1 })).toBe(false)

    await wrapper.execute({ id: 1 }, async () => 'value')

    expect(await wrapper.isCached({ id: 1 })).toBe(true)
  })

  it('returns config copy', () => {
    const wrapper = createCacheWrapper({
      cache,
      config,
      serviceName: 'test-service',
    })

    const returnedConfig = wrapper.getConfig()
    expect(returnedConfig).toEqual(config)
    expect(returnedConfig).not.toBe(config)
  })
})

describe('cacheMethod', () => {
  let cache: MemoryCache
  let config: CacheConfig

  beforeEach(() => {
    cache = new MemoryCache({ pruneIntervalMs: 0 })
    config = { enabled: true, ttlSeconds: 60, staleOnError: false }
  })

  afterEach(() => {
    cache.dispose()
  })

  it('creates a cached method', async () => {
    const originalMethod = vi.fn(async (id: string) => `user-${id}`)
    const cachedMethod = cacheMethod(
      'user-service',
      cache,
      config,
      originalMethod,
      (id) => id
    )

    const result1 = await cachedMethod('abc')
    expect(result1).toBe('user-abc')

    const result2 = await cachedMethod('abc')
    expect(result2).toBe('user-abc')

    expect(originalMethod).toHaveBeenCalledTimes(1)
  })

  it('caches different keys separately', async () => {
    const originalMethod = vi.fn(async (id: string) => `user-${id}`)
    const cachedMethod = cacheMethod(
      'user-service',
      cache,
      config,
      originalMethod,
      (id) => id
    )

    await cachedMethod('a')
    await cachedMethod('b')

    expect(originalMethod).toHaveBeenCalledTimes(2)
  })
})

describe('batchWithCache', () => {
  let cache: MemoryCache
  let config: CacheConfig

  beforeEach(() => {
    cache = new MemoryCache({ pruneIntervalMs: 0 })
    config = { enabled: true, ttlSeconds: 60, staleOnError: false }
  })

  afterEach(() => {
    cache.dispose()
  })

  it('returns all cached values when available', async () => {
    await cache.set('user:1', 'user-1', 60)
    await cache.set('user:2', 'user-2', 60)

    const fetchFn = vi.fn().mockResolvedValue(new Map())

    const results = await batchWithCache(
      [1, 2],
      cache,
      config,
      (id) => `user:${id}`,
      fetchFn
    )

    expect(results.get(1)?.value).toBe('user-1')
    expect(results.get(1)?.cached).toBe(true)
    expect(results.get(2)?.value).toBe('user-2')
    expect(results.get(2)?.cached).toBe(true)
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('fetches only missing keys', async () => {
    await cache.set('user:1', 'user-1-cached', 60)

    const fetchFn = vi.fn().mockResolvedValue(
      new Map([
        [2, 'user-2-fetched'],
        [3, 'user-3-fetched'],
      ])
    )

    const results = await batchWithCache(
      [1, 2, 3],
      cache,
      config,
      (id) => `user:${id}`,
      fetchFn
    )

    expect(results.get(1)?.value).toBe('user-1-cached')
    expect(results.get(1)?.cached).toBe(true)
    expect(results.get(2)?.value).toBe('user-2-fetched')
    expect(results.get(2)?.cached).toBe(false)
    expect(results.get(3)?.value).toBe('user-3-fetched')
    expect(results.get(3)?.cached).toBe(false)

    expect(fetchFn).toHaveBeenCalledWith([2, 3])
  })

  it('caches fetched values', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Map([
        [1, 'user-1'],
        [2, 'user-2'],
      ])
    )

    await batchWithCache([1, 2], cache, config, (id) => `user:${id}`, fetchFn)

    expect((await cache.get('user:1'))?.value).toBe('user-1')
    expect((await cache.get('user:2'))?.value).toBe('user-2')
  })

  it('bypasses cache when disabled', async () => {
    config.enabled = false
    await cache.set('user:1', 'cached', 60)

    const fetchFn = vi.fn().mockResolvedValue(new Map([[1, 'fetched']]))

    const results = await batchWithCache(
      [1],
      cache,
      config,
      (id) => `user:${id}`,
      fetchFn
    )

    expect(results.get(1)?.value).toBe('fetched')
    expect(results.get(1)?.cached).toBe(false)
    expect(fetchFn).toHaveBeenCalledWith([1])
  })
})

describe('refreshInBackground', () => {
  let cache: MemoryCache
  let config: CacheConfig

  beforeEach(() => {
    cache = new MemoryCache({ pruneIntervalMs: 0 })
    config = { enabled: true, ttlSeconds: 60, staleOnError: false }
  })

  afterEach(() => {
    cache.dispose()
  })

  it('returns fresh value when no cache', async () => {
    const fn = vi.fn().mockResolvedValue('fresh-value')

    const result = await refreshInBackground('key', fn, config, cache)

    expect(result.result).toBe('fresh-value')
    expect(result.refreshing).toBe(false)
    expect(fn).toHaveBeenCalled()
  })

  it('returns cached value when fresh', async () => {
    await cache.set('key', 'cached-value', 60)

    const fn = vi.fn().mockResolvedValue('fresh-value')

    const result = await refreshInBackground('key', fn, config, cache)

    expect(result.result).toBe('cached-value')
    expect(result.refreshing).toBe(false)
    expect(fn).not.toHaveBeenCalled()
  })

  it('returns stale value and triggers background refresh', async () => {
    vi.useFakeTimers()

    cache = new MemoryCache({
      defaultStaleWindowSeconds: 60,
      pruneIntervalMs: 0,
    })
    await cache.set('key', 'stale-value', 1)

    vi.advanceTimersByTime(2000)

    const fn = vi.fn().mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 100))
      return 'fresh-value'
    })

    const result = await refreshInBackground('key', fn, config, cache)

    expect(result.result).toBe('stale-value')
    expect(result.refreshing).toBe(true)
    expect(fn).toHaveBeenCalled()

    cache.dispose()
    vi.useRealTimers()
  })

  it('handles background refresh error silently', async () => {
    vi.useFakeTimers()

    cache = new MemoryCache({
      defaultStaleWindowSeconds: 60,
      pruneIntervalMs: 0,
    })
    await cache.set('key', 'stale-value', 1)

    vi.advanceTimersByTime(2000)

    const fn = vi.fn().mockRejectedValue(new Error('refresh failed'))

    const result = await refreshInBackground('key', fn, config, cache)

    expect(result.result).toBe('stale-value')
    expect(result.refreshing).toBe(true)

    await vi.runAllTimersAsync()

    cache.dispose()
    vi.useRealTimers()
  })

  it('caches fresh value after fetch', async () => {
    const fn = vi.fn().mockResolvedValue('fresh-value')

    await refreshInBackground('key', fn, config, cache)

    const cached = await cache.get<string>('key')
    expect(cached?.value).toBe('fresh-value')
  })
})
