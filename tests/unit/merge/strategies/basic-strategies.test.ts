import { describe, it, expect } from 'vitest'
import {
  preferFirst,
  preferLast,
  preferNonNull,
} from '../../../../src/merge/strategies/basic-strategies.js'
import type { SourceRecord } from '../../../../src/merge/types.js'

const createRecord = (data: Record<string, unknown>): SourceRecord => ({
  id: `rec-${Math.random().toString(36).slice(2)}`,
  record: data,
  createdAt: new Date(),
  updatedAt: new Date(),
})

const createRecords = (count: number): SourceRecord[] =>
  Array.from({ length: count }, () => createRecord({}))

describe('Basic Strategies', () => {
  describe('preferFirst', () => {
    it('returns first value', () => {
      const records = createRecords(3)
      expect(preferFirst(['a', 'b', 'c'], records)).toBe('a')
    })

    it('skips undefined values', () => {
      const records = createRecords(3)
      expect(preferFirst([undefined, 'second', 'third'], records)).toBe(
        'second'
      )
    })

    it('skips null values by default', () => {
      const records = createRecords(3)
      expect(preferFirst([null, 'second', 'third'], records)).toBe('second')
    })

    it('handles all undefined values', () => {
      const records = createRecords(3)
      expect(
        preferFirst([undefined, undefined, undefined], records)
      ).toBeUndefined()
    })

    it('handles empty array', () => {
      expect(preferFirst([], [])).toBeUndefined()
    })

    it('returns first falsy non-null value', () => {
      const records = createRecords(3)
      expect(preferFirst([0, 'second'], records)).toBe(0)
      expect(preferFirst([false, 'second'], records)).toBe(false)
      expect(preferFirst(['', 'second'], records)).toBe('')
    })

    it('respects nullHandling: include', () => {
      const records = createRecords(3)
      expect(
        preferFirst([null, 'second'], records, { nullHandling: 'include' })
      ).toBe(null)
    })

    it('respects nullHandling: preferNull', () => {
      const records = createRecords(3)
      expect(
        preferFirst(['first', null, 'third'], records, {
          nullHandling: 'preferNull',
        })
      ).toBe(null)
    })

    it('handles objects and arrays', () => {
      const records = createRecords(2)
      const obj = { key: 'value' }
      const arr = [1, 2, 3]
      expect(preferFirst([obj, 'second'], records)).toBe(obj)
      expect(preferFirst([arr, 'second'], records)).toBe(arr)
    })

    it('handles numbers', () => {
      const records = createRecords(3)
      expect(preferFirst([42, 43, 44], records)).toBe(42)
    })
  })

  describe('preferLast', () => {
    it('returns last value', () => {
      const records = createRecords(3)
      expect(preferLast(['a', 'b', 'c'], records)).toBe('c')
    })

    it('skips undefined values from end', () => {
      const records = createRecords(3)
      expect(preferLast(['first', 'second', undefined], records)).toBe('second')
    })

    it('skips null values from end by default', () => {
      const records = createRecords(3)
      expect(preferLast(['first', 'second', null], records)).toBe('second')
    })

    it('handles all undefined values', () => {
      const records = createRecords(3)
      expect(
        preferLast([undefined, undefined, undefined], records)
      ).toBeUndefined()
    })

    it('handles empty array', () => {
      expect(preferLast([], [])).toBeUndefined()
    })

    it('handles single value', () => {
      const records = createRecords(1)
      expect(preferLast(['only'], records)).toBe('only')
    })

    it('respects nullHandling: include', () => {
      const records = createRecords(3)
      expect(
        preferLast(['first', null], records, { nullHandling: 'include' })
      ).toBe(null)
    })

    it('handles mixed values', () => {
      const records = createRecords(5)
      expect(
        preferLast([null, undefined, 'middle', undefined, null], records)
      ).toBe('middle')
    })
  })

  describe('preferNonNull', () => {
    it('returns first truthy value', () => {
      const records = createRecords(3)
      expect(preferNonNull(['a', 'b', 'c'], records)).toBe('a')
    })

    it('skips empty strings', () => {
      const records = createRecords(3)
      expect(preferNonNull(['', 'valid', 'other'], records)).toBe('valid')
    })

    it('skips whitespace-only strings', () => {
      const records = createRecords(3)
      expect(preferNonNull(['   ', 'valid', 'other'], records)).toBe('valid')
    })

    it('skips null values', () => {
      const records = createRecords(3)
      expect(preferNonNull([null, 'valid', 'other'], records)).toBe('valid')
    })

    it('skips undefined values', () => {
      const records = createRecords(3)
      expect(preferNonNull([undefined, 'valid', 'other'], records)).toBe(
        'valid'
      )
    })

    it('handles all null values', () => {
      const records = createRecords(3)
      expect(preferNonNull([null, null, null], records)).toBeUndefined()
    })

    it('handles empty array', () => {
      expect(preferNonNull([], [])).toBeUndefined()
    })

    it('returns non-empty falsy values', () => {
      const records = createRecords(3)
      expect(preferNonNull([null, 0, 'third'], records)).toBe(0)
      expect(preferNonNull([null, false, 'third'], records)).toBe(false)
    })

    it('handles objects', () => {
      const records = createRecords(2)
      const obj = { key: 'value' }
      expect(preferNonNull([null, obj], records)).toBe(obj)
    })

    it('handles arrays', () => {
      const records = createRecords(2)
      const arr = [1, 2, 3]
      expect(preferNonNull([null, arr], records)).toBe(arr)
    })

    it('handles empty arrays and objects', () => {
      const records = createRecords(3)
      expect(preferNonNull([null, [], {}], records)).toEqual([])
    })

    it('respects nullHandling: include (returns first non-undefined)', () => {
      const records = createRecords(3)
      const result = preferNonNull([undefined, null, 'value'], records, {
        nullHandling: 'include',
      })
      // Note: preferNonNull still skips null, empty string even with include
      // unless specifically enabled - it falls back to looking for truthy values
      expect(result).toBe('value')
    })

    it('handles mixed empty values', () => {
      const records = createRecords(5)
      expect(
        preferNonNull([null, undefined, '', '   ', 'valid'], records)
      ).toBe('valid')
    })
  })
})
