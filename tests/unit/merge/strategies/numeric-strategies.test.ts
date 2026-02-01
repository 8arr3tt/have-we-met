import { describe, it, expect } from 'vitest'
import {
  mostFrequent,
  average,
  sum,
  min,
  max,
} from '../../../../src/merge/strategies/numeric-strategies.js'
import type { SourceRecord } from '../../../../src/merge/types.js'

const createRecords = (count: number): SourceRecord[] =>
  Array.from({ length: count }, () => ({
    id: `rec-${Math.random().toString(36).slice(2)}`,
    record: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  }))

describe('Numeric Strategies', () => {
  describe('mostFrequent', () => {
    it('returns mode', () => {
      const records = createRecords(4)
      expect(mostFrequent([1, 2, 2, 3], records)).toBe(2)
    })

    it('handles ties (returns first)', () => {
      const records = createRecords(3)
      expect(mostFrequent([1, 2, 3], records)).toBe(1)
    })

    it('handles string values', () => {
      const records = createRecords(3)
      expect(mostFrequent(['a', 'b', 'a'], records)).toBe('a')
    })

    it('handles non-numeric values', () => {
      const records = createRecords(4)
      expect(mostFrequent(['cat', 'dog', 'cat', 'bird'], records)).toBe('cat')
    })

    it('handles null values', () => {
      const records = createRecords(4)
      expect(mostFrequent([null, 'value', 'value', null], records)).toBe('value')
    })

    it('handles undefined values', () => {
      const records = createRecords(3)
      expect(mostFrequent([undefined, 'value', 'value'], records)).toBe('value')
    })

    it('handles all null values', () => {
      const records = createRecords(3)
      expect(mostFrequent([null, null, null], records)).toBeUndefined()
    })

    it('handles empty array', () => {
      expect(mostFrequent([], [])).toBeUndefined()
    })

    it('handles single value', () => {
      const records = createRecords(1)
      expect(mostFrequent([42], records)).toBe(42)
    })

    it('handles mixed types', () => {
      const records = createRecords(5)
      expect(mostFrequent([1, '1', 1, '1', 1], records)).toBe(1)
    })

    it('handles boolean values', () => {
      const records = createRecords(5)
      expect(mostFrequent([true, false, true, true, false], records)).toBe(true)
    })

    it('handles object values with same structure', () => {
      const records = createRecords(3)
      const result = mostFrequent([{ id: 1 }, { id: 1 }, { id: 2 }], records)
      expect(result).toEqual({ id: 1 })
    })

    it('tie-breaks by first occurrence', () => {
      const records = createRecords(6)
      // 'a' and 'b' both appear twice, 'a' comes first
      expect(mostFrequent(['a', 'b', 'a', 'b', 'c', 'd'], records)).toBe('a')
    })
  })

  describe('average', () => {
    it('returns mean', () => {
      const records = createRecords(3)
      expect(average([10, 20, 30], records)).toBe(20)
    })

    it('ignores non-numeric values', () => {
      const records = createRecords(4)
      expect(average([1, 2, 'three', 4], records)).toBeCloseTo(7 / 3)
    })

    it('handles all non-numeric values', () => {
      const records = createRecords(2)
      expect(average(['a', 'b'], records)).toBeUndefined()
    })

    it('handles single value', () => {
      const records = createRecords(1)
      expect(average([100], records)).toBe(100)
    })

    it('handles empty array', () => {
      expect(average([], [])).toBeUndefined()
    })

    it('handles null values', () => {
      const records = createRecords(3)
      expect(average([null, 10, 20], records)).toBe(15)
    })

    it('handles undefined values', () => {
      const records = createRecords(3)
      expect(average([undefined, 10, 20], records)).toBe(15)
    })

    it('handles negative numbers', () => {
      const records = createRecords(3)
      expect(average([-10, 0, 10], records)).toBe(0)
    })

    it('handles decimal numbers', () => {
      const records = createRecords(3)
      expect(average([1.5, 2.5, 3.0], records)).toBeCloseTo(2.333, 2)
    })

    it('handles numeric strings', () => {
      const records = createRecords(3)
      expect(average(['10', '20', '30'], records)).toBe(20)
    })

    it('handles NaN and Infinity', () => {
      const records = createRecords(3)
      expect(average([10, NaN, 20], records)).toBe(15)
      expect(average([10, Infinity, 20], records)).toBe(15)
    })

    it('handles mixed valid and invalid', () => {
      const records = createRecords(5)
      expect(average([10, null, 'text', undefined, 20], records)).toBe(15)
    })
  })

  describe('sum', () => {
    it('returns sum', () => {
      const records = createRecords(3)
      expect(sum([10, 20, 30], records)).toBe(60)
    })

    it('ignores non-numeric values', () => {
      const records = createRecords(4)
      expect(sum([1, 2, 'three', 4], records)).toBe(7)
    })

    it('handles all non-numeric values', () => {
      const records = createRecords(2)
      expect(sum(['a', 'b'], records)).toBeUndefined()
    })

    it('handles single value', () => {
      const records = createRecords(1)
      expect(sum([100], records)).toBe(100)
    })

    it('handles empty array', () => {
      expect(sum([], [])).toBeUndefined()
    })

    it('handles null values', () => {
      const records = createRecords(3)
      expect(sum([null, 10, 20], records)).toBe(30)
    })

    it('handles negative numbers', () => {
      const records = createRecords(3)
      expect(sum([-10, 5, 10], records)).toBe(5)
    })

    it('handles decimal numbers', () => {
      const records = createRecords(3)
      expect(sum([0.1, 0.2, 0.3], records)).toBeCloseTo(0.6)
    })

    it('handles numeric strings', () => {
      const records = createRecords(3)
      expect(sum(['10', '20', '30'], records)).toBe(60)
    })

    it('handles zero', () => {
      const records = createRecords(3)
      expect(sum([0, 0, 0], records)).toBe(0)
    })
  })

  describe('min', () => {
    it('returns minimum', () => {
      const records = createRecords(3)
      expect(min([10, 5, 20], records)).toBe(5)
    })

    it('ignores non-numeric values', () => {
      const records = createRecords(3)
      expect(min([100, 'fifty', 25], records)).toBe(25)
    })

    it('handles all non-numeric values', () => {
      const records = createRecords(2)
      expect(min(['a', 'b'], records)).toBeUndefined()
    })

    it('handles single value', () => {
      const records = createRecords(1)
      expect(min([42], records)).toBe(42)
    })

    it('handles empty array', () => {
      expect(min([], [])).toBeUndefined()
    })

    it('handles negative numbers', () => {
      const records = createRecords(3)
      expect(min([-5, 0, 5], records)).toBe(-5)
    })

    it('handles null values', () => {
      const records = createRecords(3)
      expect(min([null, 10, 5], records)).toBe(5)
    })

    it('handles decimal numbers', () => {
      const records = createRecords(3)
      expect(min([1.5, 0.5, 2.5], records)).toBe(0.5)
    })

    it('handles numeric strings', () => {
      const records = createRecords(3)
      expect(min(['100', '50', '25'], records)).toBe(25)
    })

    it('handles zero as minimum', () => {
      const records = createRecords(3)
      expect(min([10, 0, 5], records)).toBe(0)
    })

    it('handles large numbers', () => {
      const records = createRecords(3)
      expect(min([1e10, 1e5, 1e8], records)).toBe(1e5)
    })
  })

  describe('max', () => {
    it('returns maximum', () => {
      const records = createRecords(3)
      expect(max([10, 5, 20], records)).toBe(20)
    })

    it('ignores non-numeric values', () => {
      const records = createRecords(3)
      expect(max([100, 'fifty', 25], records)).toBe(100)
    })

    it('handles all non-numeric values', () => {
      const records = createRecords(2)
      expect(max(['a', 'b'], records)).toBeUndefined()
    })

    it('handles single value', () => {
      const records = createRecords(1)
      expect(max([42], records)).toBe(42)
    })

    it('handles empty array', () => {
      expect(max([], [])).toBeUndefined()
    })

    it('handles negative numbers', () => {
      const records = createRecords(3)
      expect(max([-5, 0, 5], records)).toBe(5)
    })

    it('handles null values', () => {
      const records = createRecords(3)
      expect(max([null, 10, 5], records)).toBe(10)
    })

    it('handles decimal numbers', () => {
      const records = createRecords(3)
      expect(max([1.5, 0.5, 2.5], records)).toBe(2.5)
    })

    it('handles numeric strings', () => {
      const records = createRecords(3)
      expect(max(['100', '50', '25'], records)).toBe(100)
    })

    it('handles zero as maximum', () => {
      const records = createRecords(3)
      expect(max([-10, 0, -5], records)).toBe(0)
    })

    it('handles large numbers', () => {
      const records = createRecords(3)
      expect(max([1e10, 1e5, 1e8], records)).toBe(1e10)
    })
  })
})
