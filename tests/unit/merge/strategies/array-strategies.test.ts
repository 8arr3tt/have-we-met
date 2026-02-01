import { describe, it, expect } from 'vitest'
import { concatenate, union } from '../../../../src/merge/strategies/array-strategies.js'
import type { SourceRecord } from '../../../../src/merge/types.js'

const createRecords = (count: number): SourceRecord[] =>
  Array.from({ length: count }, () => ({
    id: `rec-${Math.random().toString(36).slice(2)}`,
    record: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  }))

describe('Array Strategies', () => {
  describe('concatenate', () => {
    it('combines arrays', () => {
      const records = createRecords(2)
      expect(concatenate([['a', 'b'], ['c', 'd']], records)).toEqual(['a', 'b', 'c', 'd'])
    })

    it('uses custom separator (N/A for arrays, option ignored)', () => {
      const records = createRecords(2)
      // Note: separator is not used for array concatenation
      expect(concatenate([['a', 'b'], ['c', 'd']], records, { separator: ',' })).toEqual([
        'a',
        'b',
        'c',
        'd',
      ])
    })

    it('handles non-array inputs', () => {
      const records = createRecords(2)
      expect(concatenate(['single', ['array']], records)).toEqual(['single', 'array'])
    })

    it('removes duplicates if configured', () => {
      const records = createRecords(2)
      expect(concatenate([[1, 2], [2, 3]], records, { removeDuplicates: true })).toEqual([1, 2, 3])
    })

    it('preserves duplicates by default', () => {
      const records = createRecords(2)
      expect(concatenate([[1, 2], [2, 3]], records)).toEqual([1, 2, 2, 3])
    })

    it('handles null values', () => {
      const records = createRecords(2)
      expect(concatenate([null, ['value']], records)).toEqual(['value'])
    })

    it('handles undefined values', () => {
      const records = createRecords(2)
      expect(concatenate([undefined, ['value']], records)).toEqual(['value'])
    })

    it('handles empty array input', () => {
      expect(concatenate([], [])).toEqual([])
    })

    it('handles empty arrays in input', () => {
      const records = createRecords(3)
      expect(concatenate([['a'], [], ['b']], records)).toEqual(['a', 'b'])
    })

    it('skips null/undefined items within arrays', () => {
      const records = createRecords(2)
      expect(concatenate([[1, null, 2], [undefined, 3]], records)).toEqual([1, 2, 3])
    })

    it('handles mixed scalar and array values', () => {
      const records = createRecords(3)
      expect(concatenate(['a', ['b', 'c'], 'd'], records)).toEqual(['a', 'b', 'c', 'd'])
    })

    it('handles objects as array elements', () => {
      const records = createRecords(2)
      const obj1 = { id: 1 }
      const obj2 = { id: 2 }
      expect(concatenate([[obj1], [obj2]], records)).toEqual([obj1, obj2])
    })

    it('deduplicates objects with same structure when configured', () => {
      const records = createRecords(2)
      const result = concatenate(
        [
          [{ id: 1 }, { id: 2 }],
          [{ id: 2 }, { id: 3 }],
        ],
        records,
        { removeDuplicates: true },
      )
      expect(result).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }])
    })

    it('handles Date objects', () => {
      const records = createRecords(2)
      const date1 = new Date('2024-01-01')
      const date2 = new Date('2024-02-01')
      expect(concatenate([[date1], [date2]], records)).toEqual([date1, date2])
    })

    it('handles numbers', () => {
      const records = createRecords(3)
      expect(concatenate([[1, 2], [3, 4], [5]], records)).toEqual([1, 2, 3, 4, 5])
    })

    it('handles single scalar value', () => {
      const records = createRecords(1)
      expect(concatenate(['single'], records)).toEqual(['single'])
    })
  })

  describe('union', () => {
    it('returns unique values', () => {
      const records = createRecords(2)
      expect(union([['a', 'b'], ['b', 'c']], records)).toEqual(['a', 'b', 'c'])
    })

    it('handles primitive values', () => {
      const records = createRecords(3)
      expect(union([[1, 2], [2, 3], [3, 4]], records)).toEqual([1, 2, 3, 4])
    })

    it('handles object values with shallow equality', () => {
      const records = createRecords(2)
      const result = union(
        [
          [{ id: 1 }, { id: 2 }],
          [{ id: 2 }, { id: 3 }],
        ],
        records,
      )
      expect(result).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }])
    })

    it('handles non-array inputs', () => {
      const records = createRecords(2)
      expect(union(['single', ['single', 'other']], records)).toEqual(['single', 'other'])
    })

    it('handles null values', () => {
      const records = createRecords(2)
      expect(union([null, ['value']], records)).toEqual(['value'])
    })

    it('handles undefined values', () => {
      const records = createRecords(2)
      expect(union([undefined, ['value']], records)).toEqual(['value'])
    })

    it('handles empty array input', () => {
      expect(union([], [])).toEqual([])
    })

    it('handles empty arrays in input', () => {
      const records = createRecords(3)
      expect(union([['a'], [], ['a', 'b']], records)).toEqual(['a', 'b'])
    })

    it('skips null/undefined items within arrays', () => {
      const records = createRecords(2)
      expect(union([[1, null, 2], [undefined, 2, 3]], records)).toEqual([1, 2, 3])
    })

    it('handles mixed scalar and array values', () => {
      const records = createRecords(3)
      expect(union(['a', ['a', 'b'], 'b'], records)).toEqual(['a', 'b'])
    })

    it('preserves order of first occurrence', () => {
      const records = createRecords(2)
      expect(union([['c', 'b', 'a'], ['a', 'd']], records)).toEqual(['c', 'b', 'a', 'd'])
    })

    it('handles Date objects with same timestamp', () => {
      const records = createRecords(2)
      const date1 = new Date('2024-01-01')
      const date2 = new Date('2024-01-01')
      const date3 = new Date('2024-02-01')
      expect(union([[date1], [date2, date3]], records)).toEqual([date1, date3])
    })

    it('handles boolean values', () => {
      const records = createRecords(2)
      expect(union([[true, false], [false, true]], records)).toEqual([true, false])
    })

    it('handles string numbers separately from numbers', () => {
      const records = createRecords(2)
      expect(union([[1, '1'], ['1', 2]], records)).toEqual([1, '1', 2])
    })

    it('handles nested arrays as values (not flattened)', () => {
      const records = createRecords(2)
      const nested1 = [1, 2]
      const nested2 = [1, 2]
      const nested3 = [3, 4]
      // Note: These are considered equal due to shallow comparison
      expect(union([[nested1], [nested2, nested3]], records)).toEqual([nested1, nested3])
    })
  })
})
