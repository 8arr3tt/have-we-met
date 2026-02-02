import { registerNormalizer } from './registry'
import type { NormalizerFunction } from './types'

/**
 * Components of a parsed date.
 */
export interface DateComponents {
  /** Year (4 digits) */
  year?: number
  /** Month (1-12) */
  month?: number
  /** Day (1-31) */
  day?: number
  /** ISO 8601 format: YYYY-MM-DD, YYYY-MM, or YYYY */
  iso?: string
  /** True if month or day is missing */
  isPartial: boolean
}

/**
 * Options for date normalization.
 */
export interface DateNormalizerOptions {
  /** How to handle partial dates: 'preserve', 'reject', 'impute' (default: 'preserve') */
  partialDates?: 'preserve' | 'reject' | 'impute'
  /** Value to impute for missing day/month (default: 1) */
  imputeValue?: number
  /** Input format hint (e.g., 'MM/DD/YYYY', 'DD/MM/YYYY') (default: auto-detect) */
  inputFormat?: string
  /** Format for output: 'iso' or 'components' (default: 'iso') */
  outputFormat?: 'iso' | 'components'
}

/**
 * Month name mappings (case-insensitive).
 */
const MONTH_NAMES: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  sept: 9,
  oct: 10,
  nov: 11,
  dec: 12,
}

/**
 * Validates if a date is valid (checks month/day ranges and leap years).
 *
 * @param year - The year (4 digits)
 * @param month - The month (1-12)
 * @param day - The day (1-31)
 * @returns True if the date is valid, false otherwise
 *
 * @example
 * ```typescript
 * isValidDate(2024, 2, 29)  // true (leap year)
 * isValidDate(2023, 2, 29)  // false (not leap year)
 * isValidDate(2024, 2, 30)  // false (Feb never has 30 days)
 * isValidDate(2024, 13, 1)  // false (month out of range)
 * ```
 */
export function isValidDate(year: number, month: number, day: number): boolean {
  // Check month range
  if (month < 1 || month > 12) {
    return false
  }

  // Days in each month (non-leap year)
  const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

  // Check for leap year
  const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
  if (isLeapYear && month === 2) {
    daysInMonth[1] = 29
  }

  // Check day range
  if (day < 1 || day > daysInMonth[month - 1]) {
    return false
  }

  return true
}

/**
 * Pads a number with leading zeros.
 *
 * @param num - The number to pad
 * @param length - The target length
 * @returns The padded string
 */
function pad(num: number, length: number): string {
  return String(num).padStart(length, '0')
}

/**
 * Parses a date string and returns components.
 *
 * @param dateString - The date string to parse
 * @param inputFormat - Optional format hint
 * @returns Parsed date components
 *
 * @example
 * ```typescript
 * parseDateComponents('2024-01-30')
 * // { year: 2024, month: 1, day: 30, isPartial: false }
 *
 * parseDateComponents('01/30/2024')
 * // { year: 2024, month: 1, day: 30, isPartial: false }
 *
 * parseDateComponents('January 30, 2024')
 * // { year: 2024, month: 1, day: 30, isPartial: false }
 *
 * parseDateComponents('2024-01')
 * // { year: 2024, month: 1, isPartial: true }
 *
 * parseDateComponents('2024')
 * // { year: 2024, isPartial: true }
 * ```
 */
export function parseDateComponents(
  dateString: string,
  inputFormat?: string
): DateComponents | null {
  if (!dateString || typeof dateString !== 'string') {
    return null
  }

  const str = dateString.trim()
  if (!str) return null

  let year: number | undefined
  let month: number | undefined
  let day: number | undefined

  // Try ISO format first: YYYY-MM-DD, YYYY-MM, or YYYY
  const isoMatch = str.match(/^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/)
  if (isoMatch) {
    year = parseInt(isoMatch[1], 10)
    month = isoMatch[2] ? parseInt(isoMatch[2], 10) : undefined
    day = isoMatch[3] ? parseInt(isoMatch[3], 10) : undefined

    // Validate if complete
    if (year !== undefined && month !== undefined && day !== undefined) {
      if (!isValidDate(year, month, day)) {
        return null
      }
    }

    return {
      year,
      month,
      day,
      isPartial: month === undefined || day === undefined,
    }
  }

  // Try natural format: "January 30, 2024" or "Jan 30 2024" or "30 January 2024"
  const naturalMatch1 = str.match(/^([a-z]+)\s+(\d{1,2}),?\s+(\d{4})$/i)
  if (naturalMatch1) {
    const monthName = naturalMatch1[1].toLowerCase()
    month = MONTH_NAMES[monthName]
    day = parseInt(naturalMatch1[2], 10)
    year = parseInt(naturalMatch1[3], 10)

    if (month !== undefined && isValidDate(year, month, day)) {
      return { year, month, day, isPartial: false }
    }
  }

  // Try natural format: "30 January 2024"
  const naturalMatch2 = str.match(/^(\d{1,2})\s+([a-z]+)\s+(\d{4})$/i)
  if (naturalMatch2) {
    day = parseInt(naturalMatch2[1], 10)
    const monthName = naturalMatch2[2].toLowerCase()
    month = MONTH_NAMES[monthName]
    year = parseInt(naturalMatch2[3], 10)

    if (month !== undefined && isValidDate(year, month, day)) {
      return { year, month, day, isPartial: false }
    }
  }

  // Try slash format: MM/DD/YYYY, DD/MM/YYYY, or MM/DD/YY, DD/MM/YY
  const slashMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (slashMatch) {
    const part1 = parseInt(slashMatch[1], 10)
    const part2 = parseInt(slashMatch[2], 10)
    let yearPart = parseInt(slashMatch[3], 10)

    // Handle two-digit years (assume 2000s)
    if (yearPart < 100) {
      yearPart += 2000
    }

    // Determine if MM/DD or DD/MM based on format hint or heuristics
    if (inputFormat === 'DD/MM/YYYY') {
      day = part1
      month = part2
      year = yearPart
    } else if (inputFormat === 'MM/DD/YYYY') {
      month = part1
      day = part2
      year = yearPart
    } else {
      // Auto-detect: if first part > 12, it must be DD/MM
      if (part1 > 12) {
        day = part1
        month = part2
        year = yearPart
      } else if (part2 > 12) {
        // Second part > 12, must be MM/DD
        month = part1
        day = part2
        year = yearPart
      } else {
        // Ambiguous - default to US format (MM/DD)
        month = part1
        day = part2
        year = yearPart
      }
    }

    if (isValidDate(year, month, day)) {
      return { year, month, day, isPartial: false }
    }
  }

  // Try dot format: DD.MM.YYYY (common in Europe)
  const dotMatch = str.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/)
  if (dotMatch) {
    day = parseInt(dotMatch[1], 10)
    month = parseInt(dotMatch[2], 10)
    let yearPart = parseInt(dotMatch[3], 10)

    // Handle two-digit years
    if (yearPart < 100) {
      yearPart += 2000
    }

    if (isValidDate(yearPart, month, day)) {
      return { year: yearPart, month, day, isPartial: false }
    }
  }

  // Try just year: "2024"
  const yearMatch = str.match(/^(\d{4})$/)
  if (yearMatch) {
    year = parseInt(yearMatch[1], 10)
    return { year, isPartial: true }
  }

  return null
}

/**
 * Normalizes a date value to ISO 8601 format.
 *
 * @param value - The date value to normalize (string, Date object, or Unix timestamp)
 * @param options - Optional configuration for normalization
 * @returns Normalized date (ISO string or components), or null if input is invalid
 *
 * @example
 * ```typescript
 * normalizeDate('01/30/2024')
 * // '2024-01-30'
 *
 * normalizeDate('January 30, 2024')
 * // '2024-01-30'
 *
 * normalizeDate('2024-01')
 * // '2024-01' (partial date preserved)
 *
 * normalizeDate('2024-01', { partialDates: 'impute' })
 * // '2024-01-01' (missing day imputed)
 *
 * normalizeDate('2024', { partialDates: 'reject' })
 * // null (partial date rejected)
 *
 * normalizeDate(new Date('2024-01-30'))
 * // '2024-01-30'
 *
 * normalizeDate(1706630400, { outputFormat: 'components' })
 * // { year: 2024, month: 1, day: 30, iso: '2024-01-30', isPartial: false }
 * ```
 */
export const normalizeDate: NormalizerFunction<DateNormalizerOptions> = (
  value: unknown,
  options?: DateNormalizerOptions
): string | DateComponents | null => {
  if (value == null) return null

  // Set defaults
  const opts: Required<DateNormalizerOptions> = {
    partialDates: options?.partialDates ?? 'preserve',
    imputeValue: options?.imputeValue ?? 1,
    inputFormat: options?.inputFormat ?? '',
    outputFormat: options?.outputFormat ?? 'iso',
  }

  let components: DateComponents | null = null

  // Handle Date objects
  if (value instanceof Date) {
    if (isNaN(value.getTime())) {
      return null // Invalid date
    }
    components = {
      year: value.getFullYear(),
      month: value.getMonth() + 1, // JS months are 0-indexed
      day: value.getDate(),
      isPartial: false,
    }
  }
  // Handle Unix timestamps (numbers)
  else if (typeof value === 'number') {
    // Assume seconds if < 10000000000, otherwise milliseconds
    const timestamp = value < 10000000000 ? value * 1000 : value
    const date = new Date(timestamp)
    if (isNaN(date.getTime())) {
      return null
    }
    components = {
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate(),
      isPartial: false,
    }
  }
  // Handle strings
  else {
    const dateStr = String(value).trim()
    if (!dateStr) return null

    components = parseDateComponents(dateStr, opts.inputFormat)
  }

  if (!components) return null

  // Handle partial dates
  if (components.isPartial) {
    if (opts.partialDates === 'reject') {
      return null
    } else if (opts.partialDates === 'impute') {
      // Impute missing values
      if (components.month === undefined) {
        components.month = opts.imputeValue
      }
      if (components.day === undefined) {
        components.day = opts.imputeValue
      }
      components.isPartial = false

      // Validate after imputation
      if (
        components.year !== undefined &&
        components.month !== undefined &&
        components.day !== undefined
      ) {
        if (!isValidDate(components.year, components.month, components.day)) {
          return null
        }
      }
    }
    // else 'preserve' - keep as partial
  }

  // Build ISO string
  if (components.year !== undefined) {
    if (components.month !== undefined && components.day !== undefined) {
      components.iso = `${components.year}-${pad(components.month, 2)}-${pad(components.day, 2)}`
    } else if (components.month !== undefined) {
      components.iso = `${components.year}-${pad(components.month, 2)}`
    } else {
      components.iso = `${components.year}`
    }
  }

  // Return based on output format
  return opts.outputFormat === 'components'
    ? components
    : components.iso || null
}

// Auto-register the date normalizer
registerNormalizer('date', normalizeDate)
