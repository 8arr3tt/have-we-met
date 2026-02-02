/**
 * String merge strategies: preferLonger, preferShorter
 * @module merge/strategies/string-strategies
 */

import type {
  StrategyFunction,
  SourceRecord,
  FieldMergeOptions,
} from '../types.js'

/**
 * Converts a value to a string for length comparison.
 * Returns null if the value cannot be meaningfully converted.
 */
function toComparableString(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean')
    return String(value)
  if (Array.isArray(value)) return null
  if (typeof value === 'object') return null
  return String(value)
}

/**
 * Returns the longest string value from the input array.
 * Skips null, undefined, and non-string values.
 * On equal lengths, prefers the first occurrence.
 *
 * @param values - Array of values from source records
 * @param records - Source records (not used, but required by interface)
 * @param options - Strategy options
 * @returns The longest string value, or undefined if no valid strings
 *
 * @example
 * ```typescript
 * preferLonger(['a', 'abc', 'ab']) // 'abc'
 * preferLonger(['same', 'same', 'x']) // 'same' (first of equal length)
 * preferLonger([null, 'value']) // 'value'
 * preferLonger([123, 12345]) // '12345' (numbers converted to strings)
 * ```
 */
export const preferLonger: StrategyFunction = (
  values: unknown[],
  _records: SourceRecord[],
  _options?: FieldMergeOptions
): unknown => {
  if (!values || values.length === 0) return undefined

  let longest: string | null = null
  let longestLength = -1

  for (const value of values) {
    const str = toComparableString(value)
    if (str === null) continue

    if (str.length > longestLength) {
      longest = str
      longestLength = str.length
    }
  }

  return longest ?? undefined
}

/**
 * Returns the shortest non-empty string value from the input array.
 * Skips null, undefined, empty strings, and non-string values.
 * On equal lengths, prefers the first occurrence.
 *
 * @param values - Array of values from source records
 * @param records - Source records (not used, but required by interface)
 * @param options - Strategy options
 * @returns The shortest non-empty string value, or undefined if no valid strings
 *
 * @example
 * ```typescript
 * preferShorter(['abc', 'a', 'ab']) // 'a'
 * preferShorter(['same', 'same', 'longer']) // 'same' (first of equal length)
 * preferShorter(['', 'value']) // 'value' (ignores empty string)
 * preferShorter([null, 'v']) // 'v'
 * ```
 */
export const preferShorter: StrategyFunction = (
  values: unknown[],
  _records: SourceRecord[],
  _options?: FieldMergeOptions
): unknown => {
  if (!values || values.length === 0) return undefined

  let shortest: string | null = null
  let shortestLength = Infinity

  for (const value of values) {
    const str = toComparableString(value)
    if (str === null) continue
    // Skip empty strings
    if (str.length === 0) continue

    if (str.length < shortestLength) {
      shortest = str
      shortestLength = str.length
    }
  }

  return shortest ?? undefined
}
