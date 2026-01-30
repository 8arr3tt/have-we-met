import { describe, it, expect } from 'vitest'
import { exactMatch } from '../../src/core/comparators'

describe('exactMatch', () => {
  describe('string comparison', () => {
    it('returns 1 for exact string match', () => {
      expect(exactMatch('hello', 'hello')).toBe(1)
    })

    it('returns 0 for different strings', () => {
      expect(exactMatch('hello', 'world')).toBe(0)
    })

    it('returns 0 for case mismatch when case-sensitive', () => {
      expect(exactMatch('Hello', 'hello')).toBe(0)
      expect(exactMatch('HELLO', 'hello', { caseSensitive: true })).toBe(0)
    })

    it('returns 1 for case mismatch when case-insensitive', () => {
      expect(exactMatch('Hello', 'hello', { caseSensitive: false })).toBe(1)
      expect(exactMatch('HELLO', 'hello', { caseSensitive: false })).toBe(1)
    })

    it('handles empty strings', () => {
      expect(exactMatch('', '')).toBe(1)
      expect(exactMatch('', 'a')).toBe(0)
    })
  })

  describe('number comparison', () => {
    it('returns 1 for equal numbers', () => {
      expect(exactMatch(42, 42)).toBe(1)
      expect(exactMatch(3.14, 3.14)).toBe(1)
      expect(exactMatch(0, 0)).toBe(1)
      expect(exactMatch(-5, -5)).toBe(1)
    })

    it('returns 0 for different numbers', () => {
      expect(exactMatch(42, 43)).toBe(0)
      expect(exactMatch(3.14, 3.15)).toBe(0)
    })
  })

  describe('boolean comparison', () => {
    it('returns 1 for equal booleans', () => {
      expect(exactMatch(true, true)).toBe(1)
      expect(exactMatch(false, false)).toBe(1)
    })

    it('returns 0 for different booleans', () => {
      expect(exactMatch(true, false)).toBe(0)
      expect(exactMatch(false, true)).toBe(0)
    })
  })

  describe('Date comparison', () => {
    it('returns 1 for equal dates', () => {
      const date1 = new Date('2024-01-01T00:00:00Z')
      const date2 = new Date('2024-01-01T00:00:00Z')
      expect(exactMatch(date1, date2)).toBe(1)
    })

    it('returns 0 for different dates', () => {
      const date1 = new Date('2024-01-01T00:00:00Z')
      const date2 = new Date('2024-01-02T00:00:00Z')
      expect(exactMatch(date1, date2)).toBe(0)
    })

    it('handles dates with millisecond precision', () => {
      const date1 = new Date('2024-01-01T12:00:00.123Z')
      const date2 = new Date('2024-01-01T12:00:00.123Z')
      const date3 = new Date('2024-01-01T12:00:00.124Z')
      expect(exactMatch(date1, date2)).toBe(1)
      expect(exactMatch(date1, date3)).toBe(0)
    })
  })

  describe('null/undefined handling', () => {
    it('returns 1 when both are null by default', () => {
      expect(exactMatch(null, null)).toBe(1)
    })

    it('returns 1 when both are undefined by default', () => {
      expect(exactMatch(undefined, undefined)).toBe(1)
    })

    it('returns 1 when one is null and other is undefined by default', () => {
      expect(exactMatch(null, undefined)).toBe(1)
      expect(exactMatch(undefined, null)).toBe(1)
    })

    it('returns 0 when nullMatchesNull is false', () => {
      expect(exactMatch(null, null, { nullMatchesNull: false })).toBe(0)
      expect(exactMatch(undefined, undefined, { nullMatchesNull: false })).toBe(0)
    })

    it('returns 0 when only one value is null/undefined', () => {
      expect(exactMatch(null, 'value')).toBe(0)
      expect(exactMatch('value', null)).toBe(0)
      expect(exactMatch(undefined, 'value')).toBe(0)
      expect(exactMatch('value', undefined)).toBe(0)
      expect(exactMatch(null, 0)).toBe(0)
      expect(exactMatch(0, null)).toBe(0)
    })
  })

  describe('type mismatch', () => {
    it('returns 0 for string vs number', () => {
      expect(exactMatch('42', 42)).toBe(0)
      expect(exactMatch(42, '42')).toBe(0)
    })

    it('returns 0 for boolean vs number', () => {
      expect(exactMatch(true, 1)).toBe(0)
      expect(exactMatch(false, 0)).toBe(0)
    })

    it('returns 0 for date vs string', () => {
      const date = new Date('2024-01-01')
      expect(exactMatch(date, '2024-01-01')).toBe(0)
    })
  })
})
