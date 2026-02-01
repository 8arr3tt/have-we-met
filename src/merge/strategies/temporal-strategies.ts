/**
 * Temporal merge strategies: preferNewer, preferOlder
 * @module merge/strategies/temporal-strategies
 */

import type { StrategyFunction, SourceRecord, FieldMergeOptions } from '../types.js'

/**
 * Gets a timestamp value from a record using the specified field path
 */
function getTimestamp(record: SourceRecord, dateField?: string): Date | null {
  if (dateField) {
    // Get value from nested path if specified
    const value = getNestedValue(record.record, dateField)
    if (value instanceof Date) return value
    if (typeof value === 'string' || typeof value === 'number') {
      const date = new Date(value)
      if (!isNaN(date.getTime())) return date
    }
    return null
  }
  // Default to updatedAt from the record metadata
  return record.updatedAt instanceof Date ? record.updatedAt : null
}

/**
 * Gets a nested value from an object using dot notation
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.')
  let current: unknown = obj
  for (const part of parts) {
    if (current === null || current === undefined) return undefined
    if (typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

/**
 * Determines if a value should be skipped based on nullHandling
 */
function isSkippableValue(
  value: unknown,
  nullHandling: FieldMergeOptions['nullHandling'] = 'skip',
): boolean {
  if (value === undefined) return true
  if (nullHandling === 'include') return false
  return value === null
}

/**
 * Returns the value from the record with the most recent timestamp.
 * Uses the record's updatedAt by default, or a custom date field if specified.
 *
 * @param values - Array of values from source records
 * @param records - Source records with timestamp metadata
 * @param options - Strategy options including dateField override
 * @returns The value from the newest record, or undefined if no valid timestamps
 *
 * @example
 * ```typescript
 * // Using default updatedAt timestamps
 * const records = [
 *   { id: '1', record: { name: 'Old' }, createdAt: new Date('2024-01-01'), updatedAt: new Date('2024-01-01') },
 *   { id: '2', record: { name: 'New' }, createdAt: new Date('2024-01-01'), updatedAt: new Date('2024-06-01') },
 * ]
 * preferNewer(['Old', 'New'], records) // 'New'
 *
 * // Using custom date field
 * preferNewer(['Old', 'New'], records, { dateField: 'modifiedDate' })
 * ```
 */
export const preferNewer: StrategyFunction = (
  values: unknown[],
  records: SourceRecord[],
  options?: FieldMergeOptions,
): unknown => {
  if (!values || values.length === 0) return undefined
  if (!records || records.length === 0) return undefined
  if (values.length !== records.length) {
    // Mismatch between values and records, fall back to preferFirst behavior
    return values.find((v) => !isSkippableValue(v, options?.nullHandling))
  }

  let newestIndex = -1
  let newestTime: number | null = null

  for (let i = 0; i < records.length; i++) {
    const value = values[i]
    if (isSkippableValue(value, options?.nullHandling)) continue

    const timestamp = getTimestamp(records[i], options?.dateField)
    if (timestamp === null) continue

    const time = timestamp.getTime()
    if (newestTime === null || time > newestTime) {
      newestTime = time
      newestIndex = i
    }
  }

  // If no valid timestamps found, return the first non-null value
  if (newestIndex === -1) {
    return values.find((v) => !isSkippableValue(v, options?.nullHandling))
  }

  return values[newestIndex]
}

/**
 * Returns the value from the record with the oldest timestamp.
 * Uses the record's updatedAt by default, or a custom date field if specified.
 *
 * @param values - Array of values from source records
 * @param records - Source records with timestamp metadata
 * @param options - Strategy options including dateField override
 * @returns The value from the oldest record, or undefined if no valid timestamps
 *
 * @example
 * ```typescript
 * // Using default updatedAt timestamps
 * const records = [
 *   { id: '1', record: { name: 'Old' }, createdAt: new Date('2024-01-01'), updatedAt: new Date('2024-01-01') },
 *   { id: '2', record: { name: 'New' }, createdAt: new Date('2024-01-01'), updatedAt: new Date('2024-06-01') },
 * ]
 * preferOlder(['Old', 'New'], records) // 'Old'
 *
 * // Using custom date field
 * preferOlder(['Old', 'New'], records, { dateField: 'originalDate' })
 * ```
 */
export const preferOlder: StrategyFunction = (
  values: unknown[],
  records: SourceRecord[],
  options?: FieldMergeOptions,
): unknown => {
  if (!values || values.length === 0) return undefined
  if (!records || records.length === 0) return undefined
  if (values.length !== records.length) {
    // Mismatch between values and records, fall back to preferFirst behavior
    return values.find((v) => !isSkippableValue(v, options?.nullHandling))
  }

  let oldestIndex = -1
  let oldestTime: number | null = null

  for (let i = 0; i < records.length; i++) {
    const value = values[i]
    if (isSkippableValue(value, options?.nullHandling)) continue

    const timestamp = getTimestamp(records[i], options?.dateField)
    if (timestamp === null) continue

    const time = timestamp.getTime()
    if (oldestTime === null || time < oldestTime) {
      oldestTime = time
      oldestIndex = i
    }
  }

  // If no valid timestamps found, return the first non-null value
  if (oldestIndex === -1) {
    return values.find((v) => !isSkippableValue(v, options?.nullHandling))
  }

  return values[oldestIndex]
}
