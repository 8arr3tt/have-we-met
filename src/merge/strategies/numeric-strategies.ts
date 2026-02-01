/**
 * Numeric merge strategies: mostFrequent, average, sum, min, max
 * @module merge/strategies/numeric-strategies
 */

import type { StrategyFunction, SourceRecord, FieldMergeOptions } from '../types.js'

/**
 * Converts a value to a number if possible.
 * Returns null for non-numeric values.
 */
function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'number') {
    if (isNaN(value) || !isFinite(value)) return null
    return value
  }
  if (typeof value === 'string') {
    const num = parseFloat(value)
    if (isNaN(num) || !isFinite(num)) return null
    return num
  }
  return null
}

/**
 * Extracts valid numeric values from an array
 */
function extractNumbers(values: unknown[]): number[] {
  const numbers: number[] = []
  for (const value of values) {
    const num = toNumber(value)
    if (num !== null) {
      numbers.push(num)
    }
  }
  return numbers
}

/**
 * Returns the most frequently occurring value from the input array.
 * Works with any value type, not just numbers.
 * On ties, returns the first value that achieved the highest frequency.
 *
 * @param values - Array of values from source records
 * @param records - Source records (not used, but required by interface)
 * @param options - Strategy options
 * @returns The most frequent value, or undefined if no valid values
 *
 * @example
 * ```typescript
 * mostFrequent([1, 2, 2, 3]) // 2
 * mostFrequent(['a', 'b', 'a']) // 'a'
 * mostFrequent([1, 2, 3]) // 1 (tie: returns first)
 * mostFrequent([null, 'value', 'value']) // 'value'
 * ```
 */
export const mostFrequent: StrategyFunction = (
  values: unknown[],
  _records: SourceRecord[],
  _options?: FieldMergeOptions,
): unknown => {
  if (!values || values.length === 0) return undefined

  // Filter out null and undefined
  const validValues = values.filter((v) => v !== null && v !== undefined)
  if (validValues.length === 0) return undefined

  // Count frequencies using a Map for proper value comparison
  const frequencies = new Map<unknown, { count: number; firstIndex: number }>()

  for (let i = 0; i < validValues.length; i++) {
    const value = validValues[i]
    // For primitive values, use them directly as keys
    // For objects, convert to JSON for comparison
    const key =
      typeof value === 'object' ? JSON.stringify(value) : value

    if (!frequencies.has(key)) {
      frequencies.set(key, { count: 1, firstIndex: i })
    } else {
      const existing = frequencies.get(key)!
      frequencies.set(key, { count: existing.count + 1, firstIndex: existing.firstIndex })
    }
  }

  // Find the most frequent
  let maxCount = 0
  let maxFirstIndex = Infinity
  let result: unknown = undefined

  for (const [_key, { count, firstIndex }] of frequencies) {
    if (count > maxCount || (count === maxCount && firstIndex < maxFirstIndex)) {
      maxCount = count
      maxFirstIndex = firstIndex
      result = validValues[firstIndex]
    }
  }

  return result
}

/**
 * Returns the arithmetic mean of all numeric values.
 * Non-numeric values are skipped.
 * Returns undefined if no valid numeric values exist.
 *
 * @param values - Array of values from source records
 * @param records - Source records (not used, but required by interface)
 * @param options - Strategy options
 * @returns The average of numeric values, or undefined if none valid
 *
 * @example
 * ```typescript
 * average([10, 20, 30]) // 20
 * average([1, 2, 'three', 4]) // 2.333... (skips 'three')
 * average(['a', 'b']) // undefined (no numeric values)
 * average([100]) // 100 (single value)
 * ```
 */
export const average: StrategyFunction = (
  values: unknown[],
  _records: SourceRecord[],
  _options?: FieldMergeOptions,
): number | undefined => {
  if (!values || values.length === 0) return undefined

  const numbers = extractNumbers(values)
  if (numbers.length === 0) return undefined

  const sum = numbers.reduce((acc, num) => acc + num, 0)
  return sum / numbers.length
}

/**
 * Returns the sum of all numeric values.
 * Non-numeric values are skipped.
 * Returns undefined if no valid numeric values exist.
 *
 * @param values - Array of values from source records
 * @param records - Source records (not used, but required by interface)
 * @param options - Strategy options
 * @returns The sum of numeric values, or undefined if none valid
 *
 * @example
 * ```typescript
 * sum([10, 20, 30]) // 60
 * sum([1, 2, 'three', 4]) // 7 (skips 'three')
 * sum(['a', 'b']) // undefined (no numeric values)
 * sum([100]) // 100 (single value)
 * ```
 */
export const sum: StrategyFunction = (
  values: unknown[],
  _records: SourceRecord[],
  _options?: FieldMergeOptions,
): number | undefined => {
  if (!values || values.length === 0) return undefined

  const numbers = extractNumbers(values)
  if (numbers.length === 0) return undefined

  return numbers.reduce((acc, num) => acc + num, 0)
}

/**
 * Returns the minimum numeric value.
 * Non-numeric values are skipped.
 * Returns undefined if no valid numeric values exist.
 *
 * @param values - Array of values from source records
 * @param records - Source records (not used, but required by interface)
 * @param options - Strategy options
 * @returns The minimum numeric value, or undefined if none valid
 *
 * @example
 * ```typescript
 * min([10, 5, 20]) // 5
 * min([100, 'fifty', 25]) // 25 (skips 'fifty')
 * min(['a', 'b']) // undefined (no numeric values)
 * min([42]) // 42 (single value)
 * min([-5, 0, 5]) // -5
 * ```
 */
export const min: StrategyFunction = (
  values: unknown[],
  _records: SourceRecord[],
  _options?: FieldMergeOptions,
): number | undefined => {
  if (!values || values.length === 0) return undefined

  const numbers = extractNumbers(values)
  if (numbers.length === 0) return undefined

  return Math.min(...numbers)
}

/**
 * Returns the maximum numeric value.
 * Non-numeric values are skipped.
 * Returns undefined if no valid numeric values exist.
 *
 * @param values - Array of values from source records
 * @param records - Source records (not used, but required by interface)
 * @param options - Strategy options
 * @returns The maximum numeric value, or undefined if none valid
 *
 * @example
 * ```typescript
 * max([10, 5, 20]) // 20
 * max([100, 'fifty', 25]) // 100 (skips 'fifty')
 * max(['a', 'b']) // undefined (no numeric values)
 * max([42]) // 42 (single value)
 * max([-5, 0, 5]) // 5
 * ```
 */
export const max: StrategyFunction = (
  values: unknown[],
  _records: SourceRecord[],
  _options?: FieldMergeOptions,
): number | undefined => {
  if (!values || values.length === 0) return undefined

  const numbers = extractNumbers(values)
  if (numbers.length === 0) return undefined

  return Math.max(...numbers)
}
