import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { MemoryCache, createMemoryCache, createNoOpCache } from './memory-cache.js'

describe('MemoryCache', () => {
  let cache: MemoryCache

  beforeEach(() => {
    vi.useFakeTimers()
    cache = new MemoryCache({ pruneIntervalMs: 0 })
  })

  afterEach(() => {
    cache.dispose()
    vi.useRealTimers()
  })

  describe('basic operations', () => {
    it('stores and retrieves values', async () => {
      await cache.set('key1', 'value1', 60)
      const entry = await cache.get<string>('key1')

      expect(entry).not.toBeNull()
      expect(entry?.value).toBe('value1')
      expect(entry?.isStale).toBe(false)
    })

    it('returns null for missing keys', async () => {
      const entry = await cache.get('nonexistent')
      expect(entry).toBeNull()
    })

    it('deletes entries', async () => {
      await cache.set('key1', 'value1', 60)
      const deleted = await cache.delete('key1')
      expect(deleted).toBe(true)

      const entry = await cache.get('key1')
      expect(entry).toBeNull()
    })

    it('returns false when deleting nonexistent key', async () => {
      const deleted = await cache.delete('nonexistent')
      expect(deleted).toBe(false)
    })

    it('clears all entries', async () => {
      await cache.set('key1', 'value1', 60)
      await cache.set('key2', 'value2', 60)
      await cache.clear()

      expect(await cache.get('key1')).toBeNull()
      expect(await cache.get('key2')).toBeNull()
    })

    it('checks if key exists', async () => {
      await cache.set('key1', 'value1', 60)

      expect(await cache.has('key1')).toBe(true)
      expect(await cache.has('nonexistent')).toBe(false)
    })

    it('retrieves multiple values', async () => {
      await cache.set('key1', 'value1', 60)
      await cache.set('key2', 'value2', 60)

      const results = await cache.getMany<string>(['key1', 'key2', 'key3'])

      expect(results.get('key1')?.value).toBe('value1')
      expect(results.get('key2')?.value).toBe('value2')
      expect(results.get('key3')).toBeNull()
    })

    it('sets multiple values', async () => {
      await cache.setMany([
        { key: 'key1', value: 'value1', ttlSeconds: 60 },
        { key: 'key2', value: 'value2', ttlSeconds: 60 },
      ])

      expect((await cache.get<string>('key1'))?.value).toBe('value1')
      expect((await cache.get<string>('key2'))?.value).toBe('value2')
    })

    it('lists all keys', async () => {
      await cache.set('user:1', 'data1', 60)
      await cache.set('user:2', 'data2', 60)
      await cache.set('item:1', 'data3', 60)

      const allKeys = await cache.keys()
      expect(allKeys).toHaveLength(3)
      expect(allKeys).toContain('user:1')
      expect(allKeys).toContain('user:2')
      expect(allKeys).toContain('item:1')
    })

    it('lists keys matching pattern', async () => {
      await cache.set('user:1', 'data1', 60)
      await cache.set('user:2', 'data2', 60)
      await cache.set('item:1', 'data3', 60)

      const userKeys = await cache.keys('user:*')
      expect(userKeys).toHaveLength(2)
      expect(userKeys).toContain('user:1')
      expect(userKeys).toContain('user:2')
    })
  })

  describe('TTL expiration', () => {
    it('respects TTL expiration', async () => {
      await cache.set('key1', 'value1', 5)

      vi.advanceTimersByTime(4000)
      expect(await cache.get('key1')).not.toBeNull()

      vi.advanceTimersByTime(2000)
      expect(await cache.get('key1')).toBeNull()
    })

    it('supports stale entries', async () => {
      cache = new MemoryCache({ defaultStaleWindowSeconds: 30, pruneIntervalMs: 0 })

      await cache.set('key1', 'value1', 5)

      vi.advanceTimersByTime(6000)

      const entry = await cache.get('key1')
      expect(entry).toBeNull()

      const staleEntry = await cache.getWithOptions<string>('key1', { allowStale: true })
      expect(staleEntry).not.toBeNull()
      expect(staleEntry?.value).toBe('value1')
      expect(staleEntry?.isStale).toBe(true)

      cache.dispose()
    })

    it('removes entries beyond stale window', async () => {
      cache = new MemoryCache({ defaultStaleWindowSeconds: 10, pruneIntervalMs: 0 })

      await cache.set('key1', 'value1', 5)

      vi.advanceTimersByTime(16000)

      const entry = await cache.getWithOptions<string>('key1', { allowStale: true })
      expect(entry).toBeNull()

      cache.dispose()
    })

    it('prunes expired entries', async () => {
      cache = new MemoryCache({ defaultStaleWindowSeconds: 5, pruneIntervalMs: 0 })

      await cache.set('key1', 'value1', 5)
      await cache.set('key2', 'value2', 60)

      vi.advanceTimersByTime(11000)

      const pruned = await cache.prune()
      expect(pruned).toBe(1)

      expect(await cache.get('key1')).toBeNull()
      expect(await cache.get('key2')).not.toBeNull()

      cache.dispose()
    })
  })

  describe('LRU eviction', () => {
    it('evicts LRU entries when full', async () => {
      cache = new MemoryCache({ maxSize: 3, pruneIntervalMs: 0 })

      await cache.set('key1', 'value1', 60)
      await cache.set('key2', 'value2', 60)
      await cache.set('key3', 'value3', 60)
      await cache.set('key4', 'value4', 60)

      expect(await cache.get('key1')).toBeNull()
      expect(await cache.get('key2')).not.toBeNull()
      expect(await cache.get('key3')).not.toBeNull()
      expect(await cache.get('key4')).not.toBeNull()

      cache.dispose()
    })

    it('updates LRU order on access', async () => {
      cache = new MemoryCache({ maxSize: 3, pruneIntervalMs: 0 })

      await cache.set('key1', 'value1', 60)
      await cache.set('key2', 'value2', 60)
      await cache.set('key3', 'value3', 60)

      await cache.get('key1')

      await cache.set('key4', 'value4', 60)

      expect(await cache.get('key1')).not.toBeNull()
      expect(await cache.get('key2')).toBeNull()
      expect(await cache.get('key3')).not.toBeNull()
      expect(await cache.get('key4')).not.toBeNull()

      cache.dispose()
    })

    it('calls onEviction callback', async () => {
      const onEviction = vi.fn()
      cache = new MemoryCache({ maxSize: 2, onEviction, pruneIntervalMs: 0 })

      await cache.set('key1', 'value1', 60)
      await cache.set('key2', 'value2', 60)
      await cache.set('key3', 'value3', 60)

      expect(onEviction).toHaveBeenCalledWith('key1', 'lru')

      cache.dispose()
    })

    it('calls onEviction for expired entries', async () => {
      const onEviction = vi.fn()
      cache = new MemoryCache({ onEviction, defaultStaleWindowSeconds: 0, pruneIntervalMs: 0 })

      await cache.set('key1', 'value1', 1)

      vi.advanceTimersByTime(2000)
      await cache.get('key1')

      expect(onEviction).toHaveBeenCalledWith('key1', 'expired')

      cache.dispose()
    })
  })

  describe('statistics', () => {
    it('tracks cache hits', async () => {
      await cache.set('key1', 'value1', 60)
      await cache.get('key1')
      await cache.get('key1')

      const stats = cache.getStats()
      expect(stats.hits).toBe(2)
    })

    it('tracks cache misses', async () => {
      await cache.get('nonexistent')
      await cache.get('another')

      const stats = cache.getStats()
      expect(stats.misses).toBe(2)
    })

    it('calculates hit rate', async () => {
      await cache.set('key1', 'value1', 60)
      await cache.get('key1')
      await cache.get('key1')
      await cache.get('nonexistent')

      const stats = cache.getStats()
      expect(stats.hitRate).toBeCloseTo(0.666, 2)
    })

    it('tracks cache size', async () => {
      await cache.set('key1', 'value1', 60)
      await cache.set('key2', 'value2', 60)

      const stats = cache.getStats()
      expect(stats.size).toBe(2)
    })

    it('tracks oldest entry', async () => {
      const now = new Date()
      vi.setSystemTime(now)

      await cache.set('key1', 'value1', 60)

      vi.advanceTimersByTime(1000)
      await cache.set('key2', 'value2', 60)

      const stats = cache.getStats()
      expect(stats.oldestEntry?.getTime()).toBe(now.getTime())
    })

    it('tracks evictions in extended stats', async () => {
      cache = new MemoryCache({ maxSize: 2, pruneIntervalMs: 0 })

      await cache.set('key1', 'value1', 60)
      await cache.set('key2', 'value2', 60)
      await cache.set('key3', 'value3', 60)

      const stats = cache.getExtendedStats()
      expect(stats.evictions).toBe(1)

      cache.dispose()
    })

    it('tracks expirations in extended stats', async () => {
      cache = new MemoryCache({ defaultStaleWindowSeconds: 0, pruneIntervalMs: 0 })

      await cache.set('key1', 'value1', 1)

      vi.advanceTimersByTime(2000)
      await cache.get('key1')

      const stats = cache.getExtendedStats()
      expect(stats.expirations).toBe(1)

      cache.dispose()
    })

    it('resets stats on clear', async () => {
      await cache.set('key1', 'value1', 60)
      await cache.get('key1')
      await cache.get('nonexistent')

      await cache.clear()

      const stats = cache.getStats()
      expect(stats.hits).toBe(0)
      expect(stats.misses).toBe(0)
      expect(stats.size).toBe(0)
    })
  })

  describe('extended options', () => {
    it('respects updateAccess option', async () => {
      cache = new MemoryCache({ maxSize: 3, pruneIntervalMs: 0 })

      await cache.set('key1', 'value1', 60)
      await cache.set('key2', 'value2', 60)
      await cache.set('key3', 'value3', 60)

      await cache.getWithOptions('key1', { updateAccess: false })

      await cache.set('key4', 'value4', 60)

      expect(await cache.get('key1')).toBeNull()

      cache.dispose()
    })

    it('supports custom TTL per entry', async () => {
      await cache.setWithOptions('key1', 'value1', { ttlSeconds: 5 })
      await cache.setWithOptions('key2', 'value2', { ttlSeconds: 60 })

      vi.advanceTimersByTime(6000)

      expect(await cache.get('key1')).toBeNull()
      expect(await cache.get('key2')).not.toBeNull()
    })

    it('supports custom stale window per entry', async () => {
      await cache.setWithOptions('key1', 'value1', { ttlSeconds: 5, staleWindowSeconds: 30 })

      vi.advanceTimersByTime(6000)

      const entry = await cache.getWithOptions<string>('key1', { allowStale: true })
      expect(entry?.isStale).toBe(true)
      expect(entry?.value).toBe('value1')
    })

    it('returns extended entry info', async () => {
      await cache.set('key1', 'value1', 60)
      await cache.get('key1')

      const entry = await cache.getWithOptions<string>('key1')

      expect(entry).not.toBeNull()
      expect(entry?.key).toBe('key1')
      expect(entry?.accessCount).toBe(2)
      expect(entry?.lastAccessedAt).toBeInstanceOf(Date)
    })
  })

  describe('size tracking', () => {
    it('tracks total bytes when enabled', async () => {
      cache = new MemoryCache({ trackSize: true, pruneIntervalMs: 0 })

      await cache.setWithOptions('key1', 'value1', { ttlSeconds: 60, sizeBytes: 100 })
      await cache.setWithOptions('key2', 'value2', { ttlSeconds: 60, sizeBytes: 200 })

      const stats = cache.getExtendedStats()
      expect(stats.totalBytes).toBe(300)

      cache.dispose()
    })

    it('updates total bytes on overwrite', async () => {
      cache = new MemoryCache({ trackSize: true, pruneIntervalMs: 0 })

      await cache.setWithOptions('key1', 'value1', { ttlSeconds: 60, sizeBytes: 100 })
      await cache.setWithOptions('key1', 'value2', { ttlSeconds: 60, sizeBytes: 200 })

      const stats = cache.getExtendedStats()
      expect(stats.totalBytes).toBe(200)

      cache.dispose()
    })

    it('evicts when maxTotalBytes exceeded', async () => {
      cache = new MemoryCache({
        trackSize: true,
        maxTotalBytes: 250,
        maxSize: 100,
        pruneIntervalMs: 0,
      })

      await cache.setWithOptions('key1', 'value1', { ttlSeconds: 60, sizeBytes: 100 })
      await cache.setWithOptions('key2', 'value2', { ttlSeconds: 60, sizeBytes: 100 })
      await cache.setWithOptions('key3', 'value3', { ttlSeconds: 60, sizeBytes: 100 })

      expect(await cache.get('key1')).toBeNull()
      expect(await cache.get('key2')).not.toBeNull()
      expect(await cache.get('key3')).not.toBeNull()

      cache.dispose()
    })
  })

  describe('auto pruning', () => {
    it('runs prune on interval', async () => {
      cache = new MemoryCache({
        pruneIntervalMs: 1000,
        defaultStaleWindowSeconds: 0,
      })

      await cache.set('key1', 'value1', 1)

      vi.advanceTimersByTime(2000)

      expect(await cache.has('key1')).toBe(false)

      cache.dispose()
    })
  })
})

describe('createMemoryCache', () => {
  it('creates a MemoryCache instance', () => {
    const cache = createMemoryCache()
    expect(cache).toBeInstanceOf(MemoryCache)
    cache.dispose()
  })

  it('accepts configuration', () => {
    const cache = createMemoryCache({ maxSize: 50, defaultTtlSeconds: 120 })
    expect(cache.getExtendedStats().maxSize).toBe(50)
    cache.dispose()
  })
})

describe('createNoOpCache', () => {
  it('creates a no-op cache', async () => {
    const cache = createNoOpCache()

    await cache.set('key', 'value', 60)
    expect(await cache.get('key')).toBeNull()
    expect(await cache.has('key')).toBe(false)
    expect(await cache.delete('key')).toBe(false)

    const stats = cache.getStats()
    expect(stats.hits).toBe(0)
    expect(stats.misses).toBe(0)
    expect(stats.size).toBe(0)
  })

  it('handles batch operations', async () => {
    const cache = createNoOpCache()

    await cache.setMany([{ key: 'k1', value: 'v1', ttlSeconds: 60 }])
    const results = await cache.getMany(['k1', 'k2'])

    expect(results.get('k1')).toBeNull()
    expect(results.get('k2')).toBeNull()
  })

  it('returns empty keys and zero prune count', async () => {
    const cache = createNoOpCache()

    expect(await cache.keys()).toEqual([])
    expect(await cache.prune()).toBe(0)
  })
})
