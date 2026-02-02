import { describe, it, expect } from 'vitest'
import {
  fnv1aHash,
  stableStringify,
  stableHash,
  generateCacheKey,
  createCacheKeyGenerator,
  normalizeCacheKey,
  isValidCacheKey,
} from './cache-key-generator.js'

describe('fnv1aHash', () => {
  it('generates consistent hashes for same input', () => {
    const hash1 = fnv1aHash('test')
    const hash2 = fnv1aHash('test')
    expect(hash1).toBe(hash2)
  })

  it('generates different hashes for different input', () => {
    const hash1 = fnv1aHash('test1')
    const hash2 = fnv1aHash('test2')
    expect(hash1).not.toBe(hash2)
  })

  it('returns 8-character hex string', () => {
    const hash = fnv1aHash('test')
    expect(hash).toMatch(/^[0-9a-f]{8}$/)
  })

  it('handles empty string', () => {
    const hash = fnv1aHash('')
    expect(hash).toMatch(/^[0-9a-f]{8}$/)
  })

  it('handles unicode characters', () => {
    const hash = fnv1aHash('こんにちは')
    expect(hash).toMatch(/^[0-9a-f]{8}$/)
  })
})

describe('stableStringify', () => {
  describe('primitive types', () => {
    it('handles null', () => {
      expect(stableStringify(null)).toBe('null')
    })

    it('handles undefined', () => {
      expect(stableStringify(undefined)).toBe('undefined')
    })

    it('handles booleans', () => {
      expect(stableStringify(true)).toBe('true')
      expect(stableStringify(false)).toBe('false')
    })

    it('handles numbers', () => {
      expect(stableStringify(42)).toBe('42')
      expect(stableStringify(3.14)).toBe('3.14')
      expect(stableStringify(-100)).toBe('-100')
      expect(stableStringify(0)).toBe('0')
    })

    it('handles strings', () => {
      expect(stableStringify('hello')).toBe('"hello"')
      expect(stableStringify('')).toBe('""')
      expect(stableStringify('with "quotes"')).toBe('"with \\"quotes\\""')
    })

    it('handles bigint', () => {
      expect(stableStringify(BigInt(12345678901234567890n))).toBe(
        '"12345678901234567890n"'
      )
    })

    it('handles symbol', () => {
      expect(stableStringify(Symbol('test'))).toBe('"[symbol:test]"')
      expect(stableStringify(Symbol())).toBe('"[symbol:]"')
    })

    it('handles functions', () => {
      expect(stableStringify(() => {})).toBe('"[function]"')
    })
  })

  describe('objects', () => {
    it('handles empty object', () => {
      expect(stableStringify({})).toBe('{}')
    })

    it('handles simple object', () => {
      expect(stableStringify({ a: 1, b: 2 })).toBe('{"a":1,"b":2}')
    })

    it('sorts object keys alphabetically', () => {
      const result = stableStringify({ z: 1, a: 2, m: 3 })
      expect(result).toBe('{"a":2,"m":3,"z":1}')
    })

    it('generates same output regardless of key order', () => {
      const result1 = stableStringify({ a: 1, b: 2, c: 3 })
      const result2 = stableStringify({ c: 3, a: 1, b: 2 })
      expect(result1).toBe(result2)
    })

    it('handles nested objects', () => {
      const result = stableStringify({ a: { b: { c: 1 } } })
      expect(result).toBe('{"a":{"b":{"c":1}}}')
    })

    it('skips undefined values in objects', () => {
      expect(stableStringify({ a: 1, b: undefined, c: 3 })).toBe(
        '{"a":1,"c":3}'
      )
    })

    it('skips function values in objects', () => {
      expect(stableStringify({ a: 1, b: () => {}, c: 3 })).toBe('{"a":1,"c":3}')
    })
  })

  describe('arrays', () => {
    it('handles empty array', () => {
      expect(stableStringify([])).toBe('[]')
    })

    it('handles simple array', () => {
      expect(stableStringify([1, 2, 3])).toBe('[1,2,3]')
    })

    it('handles mixed array', () => {
      expect(stableStringify([1, 'two', true, null])).toBe(
        '[1,"two",true,null]'
      )
    })

    it('handles nested arrays', () => {
      expect(
        stableStringify([
          [1, 2],
          [3, 4],
        ])
      ).toBe('[[1,2],[3,4]]')
    })
  })

  describe('special objects', () => {
    it('handles Date objects', () => {
      const date = new Date('2024-01-15T10:30:00.000Z')
      expect(stableStringify(date)).toBe('"2024-01-15T10:30:00.000Z"')
    })

    it('handles RegExp objects', () => {
      expect(stableStringify(/test/gi)).toBe('"/test/gi"')
    })

    it('handles Map objects', () => {
      const map = new Map([
        ['a', 1],
        ['b', 2],
      ])
      expect(stableStringify(map)).toBe('[["a",1],["b",2]]')
    })

    it('handles Set objects', () => {
      const set = new Set([1, 2, 3])
      expect(stableStringify(set)).toBe('[1,2,3]')
    })

    it('handles TypedArrays', () => {
      expect(stableStringify(new Uint8Array([1, 2, 3]))).toBe(
        '"[TypedArray:Uint8Array]"'
      )
    })
  })

  describe('circular references', () => {
    it('throws on circular reference', () => {
      const obj: Record<string, unknown> = { a: 1 }
      obj.self = obj
      expect(() => stableStringify(obj)).toThrow('Circular reference detected')
    })

    it('handles non-circular nested objects', () => {
      const inner = { value: 1 }
      const outer = { a: inner, b: inner }
      expect(() => stableStringify(outer)).not.toThrow()
    })
  })
})

describe('stableHash', () => {
  it('generates stable keys for same input', () => {
    const hash1 = stableHash({ a: 1, b: 2 })
    const hash2 = stableHash({ b: 2, a: 1 })
    expect(hash1).toBe(hash2)
  })

  it('generates different keys for different input', () => {
    const hash1 = stableHash({ a: 1 })
    const hash2 = stableHash({ a: 2 })
    expect(hash1).not.toBe(hash2)
  })

  it('handles complex nested objects', () => {
    const input = {
      user: { name: 'John', age: 30 },
      items: [1, 2, 3],
      active: true,
    }
    const hash = stableHash(input)
    expect(hash).toMatch(/^[0-9a-f]{8}$/)
  })

  it('uses custom hash function when provided', () => {
    const customHash = (input: string) => `custom-${input.length}`
    const hash = stableHash({ a: 1 }, customHash)
    expect(hash).toMatch(/^custom-\d+$/)
  })
})

describe('generateCacheKey', () => {
  it('generates key from service name and input', () => {
    const key = generateCacheKey('my-service', { id: 123 })
    expect(key).toMatch(/^my-service:[0-9a-f]{8}$/)
  })

  it('generates consistent keys for same input', () => {
    const key1 = generateCacheKey('service', { a: 1, b: 2 })
    const key2 = generateCacheKey('service', { b: 2, a: 1 })
    expect(key1).toBe(key2)
  })

  it('generates different keys for different services', () => {
    const key1 = generateCacheKey('service1', { id: 1 })
    const key2 = generateCacheKey('service2', { id: 1 })
    expect(key1).not.toBe(key2)
  })

  it('uses custom key function when provided', () => {
    const key = generateCacheKey(
      'email-lookup',
      { email: 'test@example.com', other: 'data' },
      (input) => (input as { email: string }).email
    )
    expect(key).toBe('email-lookup:test@example.com')
  })
})

describe('createCacheKeyGenerator', () => {
  it('creates a key generator with default options', () => {
    const keyGen = createCacheKeyGenerator()
    const key = keyGen('service', { id: 1 })
    expect(key).toMatch(/^service:[0-9a-f]{8}$/)
  })

  it('adds prefix when configured', () => {
    const keyGen = createCacheKeyGenerator({ prefix: 'app' })
    const key = keyGen('service', { id: 1 })
    expect(key).toMatch(/^app:service:[0-9a-f]{8}$/)
  })

  it('excludes service name when configured', () => {
    const keyGen = createCacheKeyGenerator({ includeServiceName: false })
    const key = keyGen('service', { id: 1 })
    expect(key).not.toContain('service')
  })

  it('filters included fields', () => {
    const keyGen = createCacheKeyGenerator({ includeFields: ['id', 'type'] })
    const key1 = keyGen('service', { id: 1, type: 'a', extra: 'ignored' })
    const key2 = keyGen('service', { id: 1, type: 'a', extra: 'different' })
    expect(key1).toBe(key2)
  })

  it('filters excluded fields', () => {
    const keyGen = createCacheKeyGenerator({ excludeFields: ['timestamp'] })
    const key1 = keyGen('service', { id: 1, timestamp: 1000 })
    const key2 = keyGen('service', { id: 1, timestamp: 2000 })
    expect(key1).toBe(key2)
  })

  it('truncates long keys', () => {
    const keyGen = createCacheKeyGenerator({ maxLength: 30 })
    const key = keyGen('very-long-service-name', {
      field1: 'value1',
      field2: 'value2',
      field3: 'value3',
    })
    expect(key.length).toBeLessThanOrEqual(30)
  })

  it('uses custom hash function', () => {
    const keyGen = createCacheKeyGenerator({
      hashFn: () => 'custom-hash',
    })
    const key = keyGen('service', { id: 1 })
    expect(key).toBe('service:custom-hash')
  })

  it('supports custom key function override', () => {
    const keyGen = createCacheKeyGenerator({ prefix: 'app' })
    const key = keyGen(
      'service',
      { email: 'test@test.com' },
      (input) => (input as { email: string }).email
    )
    expect(key).toBe('app:service:test@test.com')
  })

  it('handles non-object inputs without field filtering', () => {
    const keyGen = createCacheKeyGenerator({ includeFields: ['id'] })
    const key1 = keyGen('service', 'simple-string')
    const key2 = keyGen('service', 'simple-string')
    expect(key1).toBe(key2)
  })
})

describe('normalizeCacheKey', () => {
  it('keeps valid characters', () => {
    expect(normalizeCacheKey('valid-key.123')).toBe('valid-key.123')
  })

  it('replaces invalid characters with underscore', () => {
    expect(normalizeCacheKey('key with spaces')).toBe('key_with_spaces')
    expect(normalizeCacheKey('key@special#chars')).toBe('key_special_chars')
  })

  it('collapses multiple underscores', () => {
    expect(normalizeCacheKey('key  with   spaces')).toBe('key_with_spaces')
  })

  it('removes leading and trailing underscores', () => {
    expect(normalizeCacheKey(' key ')).toBe('key')
    expect(normalizeCacheKey('__key__')).toBe('key')
  })

  it('preserves colons', () => {
    expect(normalizeCacheKey('service:key:123')).toBe('service:key:123')
  })
})

describe('isValidCacheKey', () => {
  it('validates correct keys', () => {
    expect(isValidCacheKey('service:key123')).toBe(true)
    expect(isValidCacheKey('app.cache.user-1')).toBe(true)
    expect(isValidCacheKey('simple_key')).toBe(true)
  })

  it('rejects empty keys', () => {
    expect(isValidCacheKey('')).toBe(false)
  })

  it('rejects null/undefined', () => {
    expect(isValidCacheKey(null as unknown as string)).toBe(false)
    expect(isValidCacheKey(undefined as unknown as string)).toBe(false)
  })

  it('rejects keys with invalid characters', () => {
    expect(isValidCacheKey('key with space')).toBe(false)
    expect(isValidCacheKey('key@invalid')).toBe(false)
    expect(isValidCacheKey('key/path')).toBe(false)
  })

  it('rejects keys exceeding max length', () => {
    const longKey = 'a'.repeat(300)
    expect(isValidCacheKey(longKey)).toBe(false)
    expect(isValidCacheKey(longKey, 500)).toBe(true)
  })

  it('uses custom max length', () => {
    const key50 = 'a'.repeat(50)
    expect(isValidCacheKey(key50, 40)).toBe(false)
    expect(isValidCacheKey(key50, 60)).toBe(true)
  })
})
