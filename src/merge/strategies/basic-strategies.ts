/**
 * Basic merge strategies: preferFirst, preferLast, preferNonNull
 * @module merge/strategies/basic-strategies
 */

import type { StrategyFunction, SourceRecord, FieldMergeOptions } from '../types.js'

/**
 * Determines if a value should be considered "empty" based on null handling options
 */
function shouldSkipValue(
  value: unknown,
  nullHandling: FieldMergeOptions['nullHandling'] = 'skip',
): boolean {
  if (value === undefined) return true
  if (nullHandling === 'include') return false
  if (nullHandling === 'preferNull') return value !== null
  // Default 'skip' behavior: skip null and undefined
  return value === null
}

/**
 * Returns the first non-undefined value from the input array.
 * Respects null handling options for how to treat null values.
 *
 * @param values - Array of values from source records
 * @param records - Source records (not used, but required by interface)
 * @param options - Strategy options including nullHandling
 * @returns The first non-undefined value, or undefined if all values are undefined
 *
 * @example
 * ```typescript
 * preferFirst([undefined, 'first', 'second']) // 'first'
 * preferFirst(['a', 'b', 'c']) // 'a'
 * preferFirst([undefined, undefined]) // undefined
 * preferFirst([null, 'value'], records, { nullHandling: 'include' }) // null
 * ```
 */
export const preferFirst: StrategyFunction = (
  values: unknown[],
  _records: SourceRecord[],
  options?: FieldMergeOptions,
): unknown => {
  if (!values || values.length === 0) return undefined

  for (const value of values) {
    if (!shouldSkipValue(value, options?.nullHandling)) {
      return value
    }
  }

  return undefined
}

/**
 * Returns the last non-undefined value from the input array.
 * Iterates from the end to find the last valid value.
 *
 * @param values - Array of values from source records
 * @param records - Source records (not used, but required by interface)
 * @param options - Strategy options including nullHandling
 * @returns The last non-undefined value, or undefined if all values are undefined
 *
 * @example
 * ```typescript
 * preferLast(['first', 'second', undefined]) // 'second'
 * preferLast(['a', 'b', 'c']) // 'c'
 * preferLast([undefined, undefined]) // undefined
 * ```
 */
export const preferLast: StrategyFunction = (
  values: unknown[],
  _records: SourceRecord[],
  options?: FieldMergeOptions,
): unknown => {
  if (!values || values.length === 0) return undefined

  for (let i = values.length - 1; i >= 0; i--) {
    if (!shouldSkipValue(values[i], options?.nullHandling)) {
      return values[i]
    }
  }

  return undefined
}

/**
 * Returns the first "truthy" value from the input array.
 * By default, skips null, undefined, empty strings, and false.
 * Use nullHandling options to control behavior.
 *
 * @param values - Array of values from source records
 * @param records - Source records (not used, but required by interface)
 * @param options - Strategy options including nullHandling
 * @returns The first truthy value, or undefined if no truthy value exists
 *
 * @example
 * ```typescript
 * preferNonNull([null, '', 'valid']) // 'valid'
 * preferNonNull([0, false, 'value']) // 'value' (skips falsy values by default)
 * preferNonNull(['first', 'second']) // 'first'
 * preferNonNull([null, null]) // undefined
 * ```
 */
export const preferNonNull: StrategyFunction = (
  values: unknown[],
  _records: SourceRecord[],
  options?: FieldMergeOptions,
): unknown => {
  if (!values || values.length === 0) return undefined

  for (const value of values) {
    // For preferNonNull, we want to skip "empty" values
    if (value === undefined) continue
    if (value === null) continue

    // Also skip empty strings
    if (typeof value === 'string' && value.trim() === '') continue

    // Include the value if it passes all checks
    return value
  }

  // If nullHandling is 'include', return the first non-undefined value (including null)
  if (options?.nullHandling === 'include') {
    for (const value of values) {
      if (value !== undefined) return value
    }
  }

  return undefined
}
