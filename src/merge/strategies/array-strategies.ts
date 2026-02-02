/**
 * Array merge strategies: concatenate, union
 * @module merge/strategies/array-strategies
 */

import type {
  StrategyFunction,
  SourceRecord,
  FieldMergeOptions,
} from '../types.js'

/**
 * Normalizes a value to an array.
 * Non-array values are wrapped in an array.
 * Null/undefined values result in empty arrays.
 */
function toArray(value: unknown): unknown[] {
  if (value === null || value === undefined) return []
  if (Array.isArray(value)) return value
  return [value]
}

/**
 * Checks if two values are equal for deduplication purposes.
 * Handles primitives and simple object comparison.
 */
function areEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a === null || b === null) return false
  if (a === undefined || b === undefined) return false

  // Handle Date comparison
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime()
  }

  // Handle object comparison (shallow)
  if (typeof a === 'object' && typeof b === 'object') {
    const aKeys = Object.keys(a as object)
    const bKeys = Object.keys(b as object)
    if (aKeys.length !== bKeys.length) return false
    for (const key of aKeys) {
      if (
        (a as Record<string, unknown>)[key] !==
        (b as Record<string, unknown>)[key]
      ) {
        return false
      }
    }
    return true
  }

  return false
}

/**
 * Concatenates all values from source records into a single array.
 * Non-array values are treated as single-element arrays.
 * Can optionally remove duplicates.
 *
 * @param values - Array of values from source records
 * @param records - Source records (not used, but required by interface)
 * @param options - Strategy options including removeDuplicates
 * @returns Combined array of all values
 *
 * @example
 * ```typescript
 * concatenate([['a', 'b'], ['c', 'd']]) // ['a', 'b', 'c', 'd']
 * concatenate(['single', ['array']]) // ['single', 'array']
 * concatenate([[1, 2], [2, 3]], records, { removeDuplicates: true }) // [1, 2, 3]
 * concatenate([null, ['value']]) // ['value']
 * ```
 */
export const concatenate: StrategyFunction = (
  values: unknown[],
  _records: SourceRecord[],
  options?: FieldMergeOptions
): unknown[] => {
  if (!values || values.length === 0) return []

  const result: unknown[] = []

  for (const value of values) {
    const arr = toArray(value)
    for (const item of arr) {
      if (item === null || item === undefined) continue

      if (options?.removeDuplicates) {
        // Check if item already exists in result
        const exists = result.some((existing) => areEqual(existing, item))
        if (!exists) {
          result.push(item)
        }
      } else {
        result.push(item)
      }
    }
  }

  return result
}

/**
 * Creates a union of all unique values from source records.
 * Non-array values are treated as single-element arrays.
 * Uses shallow equality comparison for deduplication.
 *
 * @param values - Array of values from source records
 * @param records - Source records (not used, but required by interface)
 * @param options - Strategy options
 * @returns Array of unique values from all sources
 *
 * @example
 * ```typescript
 * union([['a', 'b'], ['b', 'c']]) // ['a', 'b', 'c']
 * union(['single', ['single', 'other']]) // ['single', 'other']
 * union([[1, 2], [2, 3], [3, 4]]) // [1, 2, 3, 4]
 * union([null, ['value']]) // ['value']
 * ```
 */
export const union: StrategyFunction = (
  values: unknown[],
  _records: SourceRecord[],
  _options?: FieldMergeOptions
): unknown[] => {
  if (!values || values.length === 0) return []

  const result: unknown[] = []

  for (const value of values) {
    const arr = toArray(value)
    for (const item of arr) {
      if (item === null || item === undefined) continue

      // Check if item already exists using shallow equality
      const exists = result.some((existing) => areEqual(existing, item))
      if (!exists) {
        result.push(item)
      }
    }
  }

  return result
}
