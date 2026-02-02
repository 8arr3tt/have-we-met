import { describe, it, expect } from 'vitest'
import {
  normalizeDate,
  parseDateComponents,
  isValidDate,
  type DateComponents,
} from '../../../src/core/normalizers/date'

describe('isValidDate', () => {
  it('should validate correct dates', () => {
    expect(isValidDate(2024, 1, 30)).toBe(true)
    expect(isValidDate(2024, 12, 31)).toBe(true)
    expect(isValidDate(2024, 6, 15)).toBe(true)
  })

  it('should validate leap year dates', () => {
    expect(isValidDate(2024, 2, 29)).toBe(true) // 2024 is leap year
    expect(isValidDate(2000, 2, 29)).toBe(true) // 2000 is leap year (divisible by 400)
  })

  it('should reject invalid leap year dates', () => {
    expect(isValidDate(2023, 2, 29)).toBe(false) // 2023 is not leap year
    expect(isValidDate(1900, 2, 29)).toBe(false) // 1900 is not leap year (divisible by 100 but not 400)
  })

  it('should reject February 30', () => {
    expect(isValidDate(2024, 2, 30)).toBe(false)
  })

  it('should reject invalid months', () => {
    expect(isValidDate(2024, 0, 15)).toBe(false)
    expect(isValidDate(2024, 13, 15)).toBe(false)
    expect(isValidDate(2024, -1, 15)).toBe(false)
  })

  it('should reject invalid days', () => {
    expect(isValidDate(2024, 1, 0)).toBe(false)
    expect(isValidDate(2024, 1, 32)).toBe(false)
    expect(isValidDate(2024, 4, 31)).toBe(false) // April has 30 days
    expect(isValidDate(2024, 6, 31)).toBe(false) // June has 30 days
  })

  it('should validate different month lengths', () => {
    expect(isValidDate(2024, 1, 31)).toBe(true) // January has 31 days
    expect(isValidDate(2024, 4, 30)).toBe(true) // April has 30 days
    expect(isValidDate(2024, 2, 28)).toBe(true) // February has 28/29 days
  })
})

describe('parseDateComponents', () => {
  describe('ISO format', () => {
    it('should parse full ISO dates (YYYY-MM-DD)', () => {
      const result = parseDateComponents('2024-01-30')
      expect(result).toEqual({
        year: 2024,
        month: 1,
        day: 30,
        isPartial: false,
      })
    })

    it('should parse partial ISO dates (YYYY-MM)', () => {
      const result = parseDateComponents('2024-01')
      expect(result).toEqual({
        year: 2024,
        month: 1,
        day: undefined,
        isPartial: true,
      })
    })

    it('should parse year-only ISO dates (YYYY)', () => {
      const result = parseDateComponents('2024')
      expect(result).toEqual({
        year: 2024,
        month: undefined,
        day: undefined,
        isPartial: true,
      })
    })

    it('should reject invalid ISO dates', () => {
      expect(parseDateComponents('2024-02-30')).toBeNull() // Feb 30 doesn't exist
      expect(parseDateComponents('2024-13-01')).toBeNull() // Month 13 doesn't exist
    })
  })

  describe('US format (MM/DD/YYYY)', () => {
    it('should parse US format dates', () => {
      const result = parseDateComponents('01/30/2024')
      expect(result).toEqual({
        year: 2024,
        month: 1,
        day: 30,
        isPartial: false,
      })
    })

    it('should parse US format with single-digit month/day', () => {
      const result = parseDateComponents('1/5/2024')
      expect(result).toEqual({
        year: 2024,
        month: 1,
        day: 5,
        isPartial: false,
      })
    })

    it('should parse US format with two-digit year', () => {
      const result = parseDateComponents('01/30/24')
      expect(result).toEqual({
        year: 2024,
        month: 1,
        day: 30,
        isPartial: false,
      })
    })

    it('should parse ambiguous dates as MM/DD by default', () => {
      const result = parseDateComponents('03/04/2024')
      expect(result?.month).toBe(3)
      expect(result?.day).toBe(4)
    })

    it('should respect inputFormat hint for MM/DD/YYYY', () => {
      const result = parseDateComponents('03/04/2024', 'MM/DD/YYYY')
      expect(result?.month).toBe(3)
      expect(result?.day).toBe(4)
    })
  })

  describe('EU format (DD/MM/YYYY)', () => {
    it('should auto-detect DD/MM when day > 12', () => {
      const result = parseDateComponents('30/01/2024')
      expect(result).toEqual({
        year: 2024,
        month: 1,
        day: 30,
        isPartial: false,
      })
    })

    it('should respect inputFormat hint for DD/MM/YYYY', () => {
      const result = parseDateComponents('04/03/2024', 'DD/MM/YYYY')
      expect(result?.month).toBe(3)
      expect(result?.day).toBe(4)
    })

    it('should parse dot format (DD.MM.YYYY)', () => {
      const result = parseDateComponents('30.01.2024')
      expect(result).toEqual({
        year: 2024,
        month: 1,
        day: 30,
        isPartial: false,
      })
    })

    it('should parse dot format with two-digit year', () => {
      const result = parseDateComponents('30.01.24')
      expect(result).toEqual({
        year: 2024,
        month: 1,
        day: 30,
        isPartial: false,
      })
    })
  })

  describe('Natural format', () => {
    it('should parse "January 30, 2024" format', () => {
      const result = parseDateComponents('January 30, 2024')
      expect(result).toEqual({
        year: 2024,
        month: 1,
        day: 30,
        isPartial: false,
      })
    })

    it('should parse "Jan 30 2024" format (no comma)', () => {
      const result = parseDateComponents('Jan 30 2024')
      expect(result).toEqual({
        year: 2024,
        month: 1,
        day: 30,
        isPartial: false,
      })
    })

    it('should parse "30 January 2024" format', () => {
      const result = parseDateComponents('30 January 2024')
      expect(result).toEqual({
        year: 2024,
        month: 1,
        day: 30,
        isPartial: false,
      })
    })

    it('should parse abbreviated month names', () => {
      expect(parseDateComponents('Jan 15, 2024')?.month).toBe(1)
      expect(parseDateComponents('Feb 15, 2024')?.month).toBe(2)
      expect(parseDateComponents('Mar 15, 2024')?.month).toBe(3)
      expect(parseDateComponents('Apr 15, 2024')?.month).toBe(4)
      expect(parseDateComponents('May 15, 2024')?.month).toBe(5)
      expect(parseDateComponents('Jun 15, 2024')?.month).toBe(6)
      expect(parseDateComponents('Jul 15, 2024')?.month).toBe(7)
      expect(parseDateComponents('Aug 15, 2024')?.month).toBe(8)
      expect(parseDateComponents('Sep 15, 2024')?.month).toBe(9)
      expect(parseDateComponents('Oct 15, 2024')?.month).toBe(10)
      expect(parseDateComponents('Nov 15, 2024')?.month).toBe(11)
      expect(parseDateComponents('Dec 15, 2024')?.month).toBe(12)
    })

    it('should parse full month names', () => {
      expect(parseDateComponents('January 15, 2024')?.month).toBe(1)
      expect(parseDateComponents('February 15, 2024')?.month).toBe(2)
      expect(parseDateComponents('December 25, 2024')?.month).toBe(12)
    })

    it('should handle case-insensitive month names', () => {
      expect(parseDateComponents('JANUARY 15, 2024')?.month).toBe(1)
      expect(parseDateComponents('january 15, 2024')?.month).toBe(1)
      expect(parseDateComponents('JaNuArY 15, 2024')?.month).toBe(1)
    })

    it('should reject invalid natural dates', () => {
      expect(parseDateComponents('January 32, 2024')).toBeNull()
      expect(parseDateComponents('February 30, 2024')).toBeNull()
      expect(parseDateComponents('NotAMonth 15, 2024')).toBeNull()
    })
  })

  describe('Edge cases', () => {
    it('should handle null input', () => {
      expect(parseDateComponents(null as any)).toBeNull()
    })

    it('should handle empty string', () => {
      expect(parseDateComponents('')).toBeNull()
    })

    it('should handle whitespace-only string', () => {
      expect(parseDateComponents('   ')).toBeNull()
    })

    it('should handle invalid formats', () => {
      expect(parseDateComponents('not-a-date')).toBeNull()
      expect(parseDateComponents('2024/01/30')).toBeNull() // Wrong separator for ISO
      expect(parseDateComponents('13/32/2024')).toBeNull() // Invalid date
    })
  })
})

describe('normalizeDate', () => {
  describe('ISO format', () => {
    it('should normalize ISO dates', () => {
      expect(normalizeDate('2024-01-30')).toBe('2024-01-30')
    })

    it('should normalize partial ISO dates (preserve by default)', () => {
      expect(normalizeDate('2024-01')).toBe('2024-01')
      expect(normalizeDate('2024')).toBe('2024')
    })
  })

  describe('US format', () => {
    it('should normalize US format dates to ISO', () => {
      expect(normalizeDate('01/30/2024')).toBe('2024-01-30')
      expect(normalizeDate('1/5/2024')).toBe('2024-01-05')
    })

    it('should handle two-digit years', () => {
      expect(normalizeDate('01/30/24')).toBe('2024-01-30')
    })
  })

  describe('EU format', () => {
    it('should normalize EU format dates to ISO', () => {
      expect(normalizeDate('30/01/2024')).toBe('2024-01-30')
    })

    it('should normalize dot format to ISO', () => {
      expect(normalizeDate('30.01.2024')).toBe('2024-01-30')
    })
  })

  describe('Natural format', () => {
    it('should normalize natural format dates to ISO', () => {
      expect(normalizeDate('January 30, 2024')).toBe('2024-01-30')
      expect(normalizeDate('Jan 30 2024')).toBe('2024-01-30')
      expect(normalizeDate('30 January 2024')).toBe('2024-01-30')
    })
  })

  describe('Date objects', () => {
    it('should normalize Date objects to ISO', () => {
      const date = new Date('2024-01-30T12:00:00Z')
      const result = normalizeDate(date)
      expect(result).toBe('2024-01-30')
    })

    it('should handle invalid Date objects', () => {
      const invalidDate = new Date('invalid')
      expect(normalizeDate(invalidDate)).toBeNull()
    })
  })

  describe('Unix timestamps', () => {
    it('should normalize Unix timestamps (seconds)', () => {
      // January 30, 2024 12:00:00 UTC
      const timestamp = 1706616000
      expect(normalizeDate(timestamp)).toBe('2024-01-30')
    })

    it('should normalize Unix timestamps (milliseconds)', () => {
      // January 30, 2024 12:00:00 UTC
      const timestamp = 1706616000000
      expect(normalizeDate(timestamp)).toBe('2024-01-30')
    })
  })

  describe('Partial date handling', () => {
    it('should preserve partial dates by default', () => {
      expect(normalizeDate('2024-01')).toBe('2024-01')
      expect(normalizeDate('2024')).toBe('2024')
    })

    it('should reject partial dates when option is set', () => {
      expect(normalizeDate('2024-01', { partialDates: 'reject' })).toBeNull()
      expect(normalizeDate('2024', { partialDates: 'reject' })).toBeNull()
    })

    it('should impute missing values when option is set', () => {
      expect(normalizeDate('2024-01', { partialDates: 'impute' })).toBe(
        '2024-01-01'
      )
      expect(normalizeDate('2024', { partialDates: 'impute' })).toBe(
        '2024-01-01'
      )
    })

    it('should use custom impute value', () => {
      expect(
        normalizeDate('2024-03', { partialDates: 'impute', imputeValue: 15 })
      ).toBe('2024-03-15')
    })

    it('should validate after imputation', () => {
      // February 31 doesn't exist even after imputation
      expect(
        normalizeDate('2024-02', { partialDates: 'impute', imputeValue: 31 })
      ).toBeNull()
    })
  })

  describe('Output format', () => {
    it('should return ISO string by default', () => {
      const result = normalizeDate('01/30/2024')
      expect(result).toBe('2024-01-30')
    })

    it('should return components when requested', () => {
      const result = normalizeDate('01/30/2024', {
        outputFormat: 'components',
      }) as DateComponents

      expect(result.year).toBe(2024)
      expect(result.month).toBe(1)
      expect(result.day).toBe(30)
      expect(result.iso).toBe('2024-01-30')
      expect(result.isPartial).toBe(false)
    })

    it('should return partial components when requested', () => {
      const result = normalizeDate('2024-01', {
        outputFormat: 'components',
      }) as DateComponents

      expect(result.year).toBe(2024)
      expect(result.month).toBe(1)
      expect(result.day).toBeUndefined()
      expect(result.iso).toBe('2024-01')
      expect(result.isPartial).toBe(true)
    })
  })

  describe('Invalid dates', () => {
    it('should reject February 30', () => {
      expect(normalizeDate('2024-02-30')).toBeNull()
      expect(normalizeDate('02/30/2024')).toBeNull()
      expect(normalizeDate('February 30, 2024')).toBeNull()
    })

    it('should reject invalid months', () => {
      expect(normalizeDate('2024-13-01')).toBeNull()
      expect(
        normalizeDate('01/32/2024', { inputFormat: 'MM/DD/YYYY' })
      ).toBeNull() // Invalid day
      expect(normalizeDate('2024-00-15')).toBeNull() // Month 0
    })

    it('should reject invalid days', () => {
      expect(normalizeDate('2024-01-32')).toBeNull()
      expect(normalizeDate('01/32/2024')).toBeNull()
    })

    it('should reject non-leap year Feb 29', () => {
      expect(normalizeDate('2023-02-29')).toBeNull()
      expect(normalizeDate('02/29/2023')).toBeNull()
    })

    it('should accept leap year Feb 29', () => {
      expect(normalizeDate('2024-02-29')).toBe('2024-02-29')
      expect(normalizeDate('02/29/2024')).toBe('2024-02-29')
    })
  })

  describe('Edge cases', () => {
    it('should handle null input', () => {
      expect(normalizeDate(null)).toBeNull()
    })

    it('should handle undefined input', () => {
      expect(normalizeDate(undefined)).toBeNull()
    })

    it('should handle empty string', () => {
      expect(normalizeDate('')).toBeNull()
    })

    it('should handle whitespace-only string', () => {
      expect(normalizeDate('   ')).toBeNull()
    })

    it('should coerce non-string/non-date input', () => {
      const result = normalizeDate({
        toString: () => '2024-01-30',
      })
      expect(result).toBe('2024-01-30')
    })
  })

  describe('Input format hints', () => {
    it('should respect MM/DD/YYYY hint for ambiguous dates', () => {
      expect(normalizeDate('03/04/2024', { inputFormat: 'MM/DD/YYYY' })).toBe(
        '2024-03-04'
      )
    })

    it('should respect DD/MM/YYYY hint for ambiguous dates', () => {
      expect(normalizeDate('03/04/2024', { inputFormat: 'DD/MM/YYYY' })).toBe(
        '2024-04-03'
      )
    })
  })

  describe('Month boundaries', () => {
    it('should handle 31-day months', () => {
      expect(normalizeDate('01/31/2024')).toBe('2024-01-31') // January
      expect(normalizeDate('03/31/2024')).toBe('2024-03-31') // March
      expect(normalizeDate('05/31/2024')).toBe('2024-05-31') // May
      expect(normalizeDate('07/31/2024')).toBe('2024-07-31') // July
      expect(normalizeDate('08/31/2024')).toBe('2024-08-31') // August
      expect(normalizeDate('10/31/2024')).toBe('2024-10-31') // October
      expect(normalizeDate('12/31/2024')).toBe('2024-12-31') // December
    })

    it('should handle 30-day months', () => {
      expect(normalizeDate('04/30/2024')).toBe('2024-04-30') // April
      expect(normalizeDate('06/30/2024')).toBe('2024-06-30') // June
      expect(normalizeDate('09/30/2024')).toBe('2024-09-30') // September
      expect(normalizeDate('11/30/2024')).toBe('2024-11-30') // November
    })

    it('should reject day 31 for 30-day months', () => {
      expect(normalizeDate('04/31/2024')).toBeNull() // April
      expect(normalizeDate('06/31/2024')).toBeNull() // June
      expect(normalizeDate('09/31/2024')).toBeNull() // September
      expect(normalizeDate('11/31/2024')).toBeNull() // November
    })
  })

  describe('Leap year edge cases', () => {
    it('should handle century leap years correctly', () => {
      expect(normalizeDate('02/29/2000')).toBe('2000-02-29') // 2000 is leap (divisible by 400)
      expect(normalizeDate('02/29/1900')).toBeNull() // 1900 is not leap (divisible by 100, not 400)
    })
  })

  describe('Idempotency', () => {
    it('should be idempotent (normalizing twice gives same result)', () => {
      const input = '01/30/2024'
      const first = normalizeDate(input)
      const second = normalizeDate(first as string)
      expect(first).toBe(second)
    })
  })
})
