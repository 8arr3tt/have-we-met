import { describe, it, expect } from 'vitest'
import {
  applyTransform,
  firstLetter,
  firstN,
  soundexTransform,
  metaphoneTransform,
  yearTransform,
} from '../../../src/core/blocking/transforms'

describe('blocking transforms', () => {
  describe('applyTransform', () => {
    it('applies identity transform', () => {
      expect(applyTransform('hello', 'identity')).toBe('hello')
      expect(applyTransform(123, 'identity')).toBe('123')
      expect(applyTransform(true, 'identity')).toBe('true')
    })

    it('applies firstLetter transform', () => {
      expect(applyTransform('Smith', 'firstLetter')).toBe('S')
      expect(applyTransform('jones', 'firstLetter')).toBe('J')
    })

    it('applies soundex transform', () => {
      expect(applyTransform('Smith', 'soundex')).toBe('S530')
      expect(applyTransform('Smyth', 'soundex')).toBe('S530')
    })

    it('applies metaphone transform', () => {
      const result = applyTransform('Knight', 'metaphone')
      expect(result).toBeTruthy()
      expect(typeof result).toBe('string')
    })

    it('applies year transform', () => {
      expect(applyTransform(new Date('2023-05-15'), 'year')).toBe('2023')
      expect(applyTransform('1990-12-31', 'year')).toBe('1990')
    })

    it('applies firstN transform with options', () => {
      expect(applyTransform('hello', 'firstN', { n: 3 })).toBe('HEL')
      expect(applyTransform('hi', 'firstN', { n: 5 })).toBe('HI')
    })

    it('handles null values', () => {
      expect(applyTransform(null, 'identity')).toBeNull()
      expect(applyTransform(undefined, 'firstLetter')).toBeNull()
      expect(applyTransform(null, 'soundex')).toBeNull()
    })

    it('handles custom transform functions', () => {
      const customTransform = (value: unknown) => {
        return String(value).toUpperCase()
      }
      expect(applyTransform('hello', customTransform)).toBe('HELLO')
    })

    it('handles failing custom transform functions', () => {
      const failingTransform = () => {
        throw new Error('Transform failed')
      }
      expect(applyTransform('test', failingTransform)).toBeNull()
    })

    it('returns null for firstN without options', () => {
      expect(applyTransform('hello', 'firstN')).toBeNull()
    })
  })

  describe('firstLetter', () => {
    it('extracts first character', () => {
      expect(firstLetter('Smith')).toBe('S')
      expect(firstLetter('jones')).toBe('J')
      expect(firstLetter('a')).toBe('A')
    })

    it('converts to uppercase', () => {
      expect(firstLetter('smith')).toBe('S')
      expect(firstLetter('JONES')).toBe('J')
    })

    it('handles strings with leading whitespace', () => {
      expect(firstLetter('  Smith')).toBe('S')
      expect(firstLetter('\tJones')).toBe('J')
    })

    it('handles empty strings', () => {
      expect(firstLetter('')).toBeNull()
      expect(firstLetter('   ')).toBeNull()
    })

    it('handles null/undefined', () => {
      expect(firstLetter(null)).toBeNull()
      expect(firstLetter(undefined)).toBeNull()
    })

    it('handles non-string values', () => {
      expect(firstLetter(123)).toBe('1')
      expect(firstLetter(true)).toBe('T')
    })
  })

  describe('firstN', () => {
    it('extracts first N characters', () => {
      expect(firstN('hello', 3)).toBe('HEL')
      expect(firstN('world', 2)).toBe('WO')
      expect(firstN('a', 1)).toBe('A')
    })

    it('converts to uppercase', () => {
      expect(firstN('hello', 3)).toBe('HEL')
      expect(firstN('World', 3)).toBe('WOR')
    })

    it('handles strings shorter than N', () => {
      expect(firstN('hi', 5)).toBe('HI')
      expect(firstN('a', 10)).toBe('A')
    })

    it('handles N = 0', () => {
      expect(firstN('hello', 0)).toBeNull()
    })

    it('handles negative N', () => {
      expect(firstN('hello', -1)).toBeNull()
    })

    it('handles empty strings', () => {
      expect(firstN('', 3)).toBeNull()
      expect(firstN('   ', 3)).toBeNull()
    })

    it('handles null/undefined', () => {
      expect(firstN(null, 3)).toBeNull()
      expect(firstN(undefined, 3)).toBeNull()
    })

    it('handles non-string values', () => {
      expect(firstN(12345, 3)).toBe('123')
      expect(firstN(true, 2)).toBe('TR')
    })
  })

  describe('soundexTransform', () => {
    it('encodes names correctly', () => {
      expect(soundexTransform('Robert')).toBe('R163')
      expect(soundexTransform('Rupert')).toBe('R163')
      expect(soundexTransform('Smith')).toBe('S530')
      expect(soundexTransform('Smyth')).toBe('S530')
    })

    it('handles case insensitivity', () => {
      expect(soundexTransform('smith')).toBe('S530')
      expect(soundexTransform('SMITH')).toBe('S530')
      expect(soundexTransform('Smith')).toBe('S530')
    })

    it('handles empty strings', () => {
      expect(soundexTransform('')).toBeNull()
      expect(soundexTransform('   ')).toBeNull()
    })

    it('handles null/undefined', () => {
      expect(soundexTransform(null)).toBeNull()
      expect(soundexTransform(undefined)).toBeNull()
    })

    it('handles non-alphabetic characters', () => {
      expect(soundexTransform('123')).toBeNull()
      expect(soundexTransform('!!!')).toBeNull()
    })

    it('handles names with non-alphabetic characters', () => {
      expect(soundexTransform("O'Brien")).toBe('O165')
      expect(soundexTransform('Mary-Jane')).toBe('M625')
    })
  })

  describe('metaphoneTransform', () => {
    it('encodes names correctly', () => {
      const result1 = metaphoneTransform('Knight')
      const result2 = metaphoneTransform('Night')
      expect(result1).toBeTruthy()
      expect(result2).toBeTruthy()
      expect(result1).toBe(result2) // Should encode to the same value
    })

    it('handles case insensitivity', () => {
      const result1 = metaphoneTransform('smith')
      const result2 = metaphoneTransform('SMITH')
      const result3 = metaphoneTransform('Smith')
      expect(result1).toBe(result2)
      expect(result2).toBe(result3)
    })

    it('handles empty strings', () => {
      expect(metaphoneTransform('')).toBeNull()
      expect(metaphoneTransform('   ')).toBeNull()
    })

    it('handles null/undefined', () => {
      expect(metaphoneTransform(null)).toBeNull()
      expect(metaphoneTransform(undefined)).toBeNull()
    })

    it('handles non-alphabetic characters', () => {
      expect(metaphoneTransform('123')).toBeNull()
      expect(metaphoneTransform('!!!')).toBeNull()
    })

    it('handles names with non-alphabetic characters', () => {
      const result = metaphoneTransform("O'Brien")
      expect(result).toBeTruthy()
    })
  })

  describe('yearTransform', () => {
    it('extracts year from Date objects', () => {
      expect(yearTransform(new Date('2023-05-15'))).toBe('2023')
      expect(yearTransform(new Date('1990-12-31'))).toBe('1990')
      expect(yearTransform(new Date('2000-01-01'))).toBe('2000')
    })

    it('extracts year from ISO strings', () => {
      expect(yearTransform('2023-05-15')).toBe('2023')
      expect(yearTransform('1990-12-31T00:00:00Z')).toBe('1990')
      expect(yearTransform('2000-01-01')).toBe('2000')
    })

    it('extracts year from timestamps', () => {
      const timestamp = new Date('2023-05-15').getTime()
      expect(yearTransform(timestamp)).toBe('2023')
    })

    it('handles various date formats', () => {
      expect(yearTransform('May 15, 2023')).toBe('2023')
      expect(yearTransform('12/31/1990')).toBe('1990')
    })

    it('handles invalid dates', () => {
      expect(yearTransform('invalid')).toBeNull()
      expect(yearTransform('not a date')).toBeNull()
    })

    it('handles null/undefined', () => {
      expect(yearTransform(null)).toBeNull()
      expect(yearTransform(undefined)).toBeNull()
    })

    it('handles empty strings', () => {
      expect(yearTransform('')).toBeNull()
    })

    it('handles invalid Date objects', () => {
      expect(yearTransform(new Date('invalid'))).toBeNull()
    })
  })
})
