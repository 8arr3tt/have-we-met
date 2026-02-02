import { registerNormalizer } from './registry'
import type { NormalizerFunction } from './types'

/**
 * Trims whitespace from both ends of a string.
 *
 * @param value - The value to trim
 * @returns Trimmed string, or null if input is null/undefined
 *
 * @example
 * ```typescript
 * trim('  hello  ') // 'hello'
 * trim('hello') // 'hello'
 * trim(null) // null
 * ```
 */
export const trim: NormalizerFunction = (value: unknown): string | null => {
  if (value == null) return null
  return String(value).trim()
}

/**
 * Converts a string to lowercase.
 *
 * @param value - The value to convert
 * @returns Lowercase string, or null if input is null/undefined
 *
 * @example
 * ```typescript
 * lowercase('HELLO') // 'hello'
 * lowercase('HeLLo') // 'hello'
 * lowercase(null) // null
 * ```
 */
export const lowercase: NormalizerFunction = (
  value: unknown
): string | null => {
  if (value == null) return null
  return String(value).toLowerCase()
}

/**
 * Converts a string to uppercase.
 *
 * @param value - The value to convert
 * @returns Uppercase string, or null if input is null/undefined
 *
 * @example
 * ```typescript
 * uppercase('hello') // 'HELLO'
 * uppercase('HeLLo') // 'HELLO'
 * uppercase(null) // null
 * ```
 */
export const uppercase: NormalizerFunction = (
  value: unknown
): string | null => {
  if (value == null) return null
  return String(value).toUpperCase()
}

/**
 * Normalizes whitespace by collapsing multiple consecutive spaces into a single space
 * and trimming leading/trailing whitespace.
 *
 * @param value - The value to normalize
 * @returns String with normalized whitespace, or null if input is null/undefined
 *
 * @example
 * ```typescript
 * normalizeWhitespace('hello    world') // 'hello world'
 * normalizeWhitespace('  hello  world  ') // 'hello world'
 * normalizeWhitespace('hello\n\nworld') // 'hello world'
 * normalizeWhitespace(null) // null
 * ```
 */
export const normalizeWhitespace: NormalizerFunction = (
  value: unknown
): string | null => {
  if (value == null) return null
  return String(value).trim().replace(/\s+/g, ' ')
}

/**
 * Removes all non-alphanumeric characters, keeping only letters and numbers.
 *
 * @param value - The value to process
 * @returns String with only alphanumeric characters, or null if input is null/undefined
 *
 * @example
 * ```typescript
 * alphanumericOnly('hello-world') // 'helloworld'
 * alphanumericOnly('test@123') // 'test123'
 * alphanumericOnly('hello!!!') // 'hello'
 * alphanumericOnly(null) // null
 * ```
 */
export const alphanumericOnly: NormalizerFunction = (
  value: unknown
): string | null => {
  if (value == null) return null
  return String(value).replace(/[^a-zA-Z0-9]/g, '')
}

/**
 * Removes all non-numeric characters, keeping only digits.
 *
 * @param value - The value to process
 * @returns String with only numeric characters, or null if input is null/undefined
 *
 * @example
 * ```typescript
 * numericOnly('123-456-7890') // '1234567890'
 * numericOnly('$1,234.56') // '123456'
 * numericOnly('abc123def') // '123'
 * numericOnly(null) // null
 * ```
 */
export const numericOnly: NormalizerFunction = (
  value: unknown
): string | null => {
  if (value == null) return null
  return String(value).replace(/\D/g, '')
}

// Auto-register basic normalizers
registerNormalizer('trim', trim)
registerNormalizer('lowercase', lowercase)
registerNormalizer('uppercase', uppercase)
registerNormalizer('normalizeWhitespace', normalizeWhitespace)
registerNormalizer('alphanumericOnly', alphanumericOnly)
registerNormalizer('numericOnly', numericOnly)
