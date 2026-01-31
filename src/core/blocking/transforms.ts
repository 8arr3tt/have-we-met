import { soundexEncode, metaphoneEncode } from '../comparators'

/**
 * Standard block transformations for generating block keys.
 * These transforms modify field values to create broader or narrower blocks.
 */
export type BlockTransform =
  | 'identity' // Use value as-is
  | 'firstLetter' // Extract first character
  | 'soundex' // Phonetic encoding via Soundex
  | 'metaphone' // Phonetic encoding via Metaphone
  | 'year' // Extract year from date
  | 'firstN' // First N characters (requires parameter)
  | ((value: unknown) => string | null) // Custom transform function

/**
 * Options for the firstN transform.
 */
export interface FirstNOptions {
  /** Number of characters to extract */
  n: number
}

/**
 * Applies a transformation to a value to generate a block key component.
 *
 * @param value - The value to transform
 * @param transform - The transformation to apply
 * @param options - Optional transform-specific options
 * @returns Transformed string, or null if the value cannot be transformed
 */
export function applyTransform(
  value: unknown,
  transform: BlockTransform,
  options?: FirstNOptions
): string | null {
  // Handle null/undefined
  if (value == null) {
    return null
  }

  // Handle custom transform functions
  if (typeof transform === 'function') {
    try {
      return transform(value)
    } catch (error) {
      console.warn('Custom transform function failed:', error)
      return null
    }
  }

  // Handle standard transforms
  switch (transform) {
    case 'identity':
      return String(value)

    case 'firstLetter':
      return firstLetter(value)

    case 'soundex':
      return soundexTransform(value)

    case 'metaphone':
      return metaphoneTransform(value)

    case 'year':
      return yearTransform(value)

    case 'firstN':
      if (!options?.n) {
        console.warn('firstN transform requires options.n parameter')
        return null
      }
      return firstN(value, options.n)

    default: {
      // TypeScript exhaustiveness check
      const _exhaustive: never = transform
      console.warn(`Unknown transform: ${_exhaustive}`)
      return null
    }
  }
}

/**
 * Extracts the first letter from a value.
 * Converts to uppercase for case-insensitive blocking.
 *
 * @param value - The value to extract from
 * @returns First letter in uppercase, or null if not possible
 */
export function firstLetter(value: unknown): string | null {
  if (value == null) return null

  const str = String(value).trim()
  if (str.length === 0) return null

  return str[0].toUpperCase()
}

/**
 * Extracts the first N characters from a value.
 * Converts to uppercase for case-insensitive blocking.
 *
 * @param value - The value to extract from
 * @param n - Number of characters to extract
 * @returns First N characters in uppercase, or null if not possible
 */
export function firstN(value: unknown, n: number): string | null {
  if (value == null) return null
  if (n <= 0) return null

  const str = String(value).trim()
  if (str.length === 0) return null

  return str.substring(0, n).toUpperCase()
}

/**
 * Encodes a value using Soundex phonetic algorithm.
 * Groups similar-sounding names together.
 *
 * @param value - The value to encode
 * @returns Soundex code, or null if not possible
 */
export function soundexTransform(value: unknown): string | null {
  if (value == null) return null

  const str = String(value).trim()
  if (str.length === 0) return null

  const code = soundexEncode(str)
  return code || null
}

/**
 * Encodes a value using Metaphone phonetic algorithm.
 * Provides improved phonetic encoding over Soundex.
 *
 * @param value - The value to encode
 * @returns Metaphone code, or null if not possible
 */
export function metaphoneTransform(value: unknown): string | null {
  if (value == null) return null

  const str = String(value).trim()
  if (str.length === 0) return null

  const code = metaphoneEncode(str)
  return code || null
}

/**
 * Extracts the year from a date value.
 * Supports Date objects, ISO strings, and timestamps.
 *
 * @param value - The date value to extract from
 * @returns Year as string, or null if not a valid date
 */
export function yearTransform(value: unknown): string | null {
  if (value == null) return null

  let date: Date | null = null

  // Handle Date objects
  if (value instanceof Date) {
    date = value
  }
  // Handle strings (ISO format, etc.)
  else if (typeof value === 'string') {
    const parsed = new Date(value)
    if (!isNaN(parsed.getTime())) {
      date = parsed
    }
  }
  // Handle timestamps (numbers)
  else if (typeof value === 'number') {
    const parsed = new Date(value)
    if (!isNaN(parsed.getTime())) {
      date = parsed
    }
  }

  if (!date || isNaN(date.getTime())) {
    return null
  }

  return String(date.getFullYear())
}
