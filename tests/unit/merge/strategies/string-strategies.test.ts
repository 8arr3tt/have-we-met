import { describe, it, expect } from 'vitest'
import {
  preferLonger,
  preferShorter,
} from '../../../../src/merge/strategies/string-strategies.js'
import type { SourceRecord } from '../../../../src/merge/types.js'

const createRecords = (count: number): SourceRecord[] =>
  Array.from({ length: count }, () => ({
    id: `rec-${Math.random().toString(36).slice(2)}`,
    record: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  }))

describe('String Strategies', () => {
  describe('preferLonger', () => {
    it('returns longest string', () => {
      const records = createRecords(3)
      expect(preferLonger(['a', 'abc', 'ab'], records)).toBe('abc')
    })

    it('handles equal lengths (prefers first)', () => {
      const records = createRecords(3)
      expect(preferLonger(['abc', 'def', 'ghi'], records)).toBe('abc')
    })

    it('handles null values', () => {
      const records = createRecords(3)
      expect(preferLonger([null, 'value', 'a'], records)).toBe('value')
    })

    it('handles undefined values', () => {
      const records = createRecords(3)
      expect(preferLonger([undefined, 'value'], records)).toBe('value')
    })

    it('handles all null values', () => {
      const records = createRecords(3)
      expect(preferLonger([null, null, null], records)).toBeUndefined()
    })

    it('handles empty array', () => {
      expect(preferLonger([], [])).toBeUndefined()
    })

    it('converts numbers to strings', () => {
      const records = createRecords(2)
      expect(preferLonger([123, 12345], records)).toBe('12345')
    })

    it('converts booleans to strings', () => {
      const records = createRecords(2)
      expect(preferLonger([true, false], records)).toBe('false') // 'false' is longer than 'true'
    })

    it('skips arrays', () => {
      const records = createRecords(2)
      expect(preferLonger([[1, 2, 3], 'text'], records)).toBe('text')
    })

    it('skips objects', () => {
      const records = createRecords(2)
      expect(preferLonger([{ key: 'value' }, 'text'], records)).toBe('text')
    })

    it('handles empty strings', () => {
      const records = createRecords(3)
      expect(preferLonger(['', 'a', ''], records)).toBe('a')
    })

    it('handles single value', () => {
      const records = createRecords(1)
      expect(preferLonger(['only'], records)).toBe('only')
    })

    it('handles mixed types', () => {
      const records = createRecords(4)
      expect(preferLonger([null, 42, 'abc', undefined], records)).toBe('abc')
    })

    it('handles unicode strings', () => {
      const records = createRecords(2)
      expect(preferLonger(['🎉', '🎉🎊'], records)).toBe('🎉🎊')
    })
  })

  describe('preferShorter', () => {
    it('returns shortest non-empty string', () => {
      const records = createRecords(3)
      expect(preferShorter(['abc', 'a', 'ab'], records)).toBe('a')
    })

    it('handles equal lengths (prefers first)', () => {
      const records = createRecords(3)
      expect(preferShorter(['abc', 'def', 'xyz'], records)).toBe('abc')
    })

    it('ignores empty strings', () => {
      const records = createRecords(3)
      expect(preferShorter(['', 'value', 'a'], records)).toBe('a')
    })

    it('handles null values', () => {
      const records = createRecords(3)
      expect(preferShorter([null, 'value', 'a'], records)).toBe('a')
    })

    it('handles undefined values', () => {
      const records = createRecords(3)
      expect(preferShorter([undefined, 'value', 'a'], records)).toBe('a')
    })

    it('handles all null/empty values', () => {
      const records = createRecords(3)
      expect(preferShorter([null, '', null], records)).toBeUndefined()
    })

    it('handles empty array', () => {
      expect(preferShorter([], [])).toBeUndefined()
    })

    it('converts numbers to strings', () => {
      const records = createRecords(2)
      expect(preferShorter([12345, 1], records)).toBe('1')
    })

    it('skips arrays', () => {
      const records = createRecords(2)
      expect(preferShorter([[1, 2, 3], 'ab'], records)).toBe('ab')
    })

    it('skips objects', () => {
      const records = createRecords(2)
      expect(preferShorter([{ key: 'value' }, 'ab'], records)).toBe('ab')
    })

    it('handles single value', () => {
      const records = createRecords(1)
      expect(preferShorter(['only'], records)).toBe('only')
    })

    it('handles single empty string', () => {
      const records = createRecords(1)
      expect(preferShorter([''], records)).toBeUndefined()
    })

    it('handles mixed types', () => {
      const records = createRecords(4)
      expect(preferShorter([null, 'abcdef', 12, undefined], records)).toBe('12')
    })

    it('handles unicode strings', () => {
      const records = createRecords(2)
      expect(preferShorter(['🎉🎊', '🎉'], records)).toBe('🎉')
    })

    it('handles whitespace strings', () => {
      const records = createRecords(3)
      // Whitespace strings have length > 0, so they're considered
      expect(preferShorter(['   ', 'ab', 'a'], records)).toBe('a')
    })
  })
})
