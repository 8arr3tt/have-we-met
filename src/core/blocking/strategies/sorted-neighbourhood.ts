import type { BlockingStrategy, BlockSet, BlockKey } from '../types'
import type { BlockTransform, FirstNOptions } from '../transforms'
import { applyTransform } from '../transforms'

/**
 * Strategy for handling null/undefined values in blocking fields.
 */
export type NullStrategy = 'skip' | 'block' | 'compare'

/**
 * Sort order for a field.
 */
export type SortOrder = 'asc' | 'desc'

/**
 * Configuration for a single sort field.
 */
export interface SortField {
  /** The field to sort by */
  field: string
  /** Optional transform to apply before sorting */
  transform?: BlockTransform
  /** Options for the transform (e.g., n for firstN) */
  transformOptions?: FirstNOptions
  /** Sort order (default: 'asc') */
  order?: SortOrder
}

/**
 * Configuration for sorted neighbourhood blocking strategy.
 */
export interface SortedNeighbourhoodConfig {
  /** Field(s) to sort by. Can be a field name, SortField config, or array of either */
  sortBy: string | SortField | Array<string | SortField>
  /** Size of the sliding window (number of records to compare within each window) */
  windowSize: number
  /** How to handle null/undefined values (default: 'skip') */
  nullStrategy?: NullStrategy
}

/**
 * Internal record wrapper for sorting.
 */
interface SortableRecord<T> {
  /** Original record */
  record: T
  /** Computed sort keys (one per sort field) */
  sortKeys: Array<string | null>
  /** Original index in the input array */
  originalIndex: number
}

/**
 * Sorted neighbourhood blocking strategy.
 *
 * Records are sorted by specified field(s) and compared within a sliding window.
 * This is useful when standard blocking is too restrictive (e.g., typos in blocking
 * field would separate matches into different blocks).
 *
 * @example
 * ```typescript
 * // Sort by last name, compare within window of 10
 * const strategy = new SortedNeighbourhoodStrategy({
 *   sortBy: 'lastName',
 *   windowSize: 10
 * })
 *
 * // Sort by Soundex of last name
 * const strategy = new SortedNeighbourhoodStrategy({
 *   sortBy: { field: 'lastName', transform: 'soundex' },
 *   windowSize: 20
 * })
 *
 * // Multi-field sort: lastName (Soundex), then year of birth
 * const strategy = new SortedNeighbourhoodStrategy({
 *   sortBy: [
 *     { field: 'lastName', transform: 'soundex' },
 *     { field: 'dateOfBirth', transform: 'year' }
 *   ],
 *   windowSize: 15
 * })
 * ```
 */
export class SortedNeighbourhoodStrategy<
  T = unknown,
> implements BlockingStrategy<T> {
  readonly name: string
  private config: SortedNeighbourhoodConfig
  private sortFields: SortField[]

  constructor(config: SortedNeighbourhoodConfig) {
    this.config = config
    this.sortFields = this.normalizeSortFields(config.sortBy)
    this.name = this.generateStrategyName()
  }

  /**
   * Generates blocks from records using sorted neighbourhood method.
   *
   * @param records - Array of records to group into blocks
   * @returns Map of block keys to arrays of records
   */
  generateBlocks(records: Array<T>): BlockSet<T> {
    const blocks = new Map<BlockKey, Array<T>>()
    const nullStrategy = this.config.nullStrategy ?? 'skip'

    // Handle empty input
    if (records.length === 0) {
      return blocks
    }

    // Create sortable records with computed sort keys
    const sortableRecords = this.createSortableRecords(records, nullStrategy)

    // Handle case where all records were filtered out (nullStrategy: 'skip')
    if (sortableRecords.length === 0) {
      return blocks
    }

    // Sort records by sort keys
    const sortedRecords = this.sortRecords(sortableRecords)

    // Generate sliding windows
    this.generateWindows(sortedRecords, blocks)

    return blocks
  }

  /**
   * Creates sortable record wrappers with computed sort keys.
   *
   * @param records - Original records
   * @param nullStrategy - How to handle null values
   * @returns Array of sortable records
   */
  private createSortableRecords(
    records: Array<T>,
    nullStrategy: NullStrategy
  ): Array<SortableRecord<T>> {
    const sortableRecords: Array<SortableRecord<T>> = []

    for (let i = 0; i < records.length; i++) {
      const record = records[i]
      const sortKeys: Array<string | null> = []
      let hasNullKey = false

      // Compute sort key for each sort field
      for (const sortField of this.sortFields) {
        const value = this.getFieldValue(record, sortField.field)

        // Apply transform if configured
        let transformedValue: string | null
        if (sortField.transform) {
          transformedValue = applyTransform(
            value,
            sortField.transform,
            sortField.transformOptions
          )
        } else {
          transformedValue = value == null ? null : String(value)
        }

        sortKeys.push(transformedValue)

        if (transformedValue === null) {
          hasNullKey = true
        }
      }

      // Handle records with null sort keys
      if (hasNullKey) {
        if (nullStrategy === 'skip') {
          continue // Skip this record
        }
        // For 'block' and 'compare', we'll keep the record but treat null as empty string for sorting
      }

      sortableRecords.push({
        record,
        sortKeys,
        originalIndex: i,
      })
    }

    return sortableRecords
  }

  /**
   * Sorts records by their sort keys.
   *
   * @param sortableRecords - Records with computed sort keys
   * @returns Sorted array of sortable records
   */
  private sortRecords(
    sortableRecords: Array<SortableRecord<T>>
  ): Array<SortableRecord<T>> {
    return sortableRecords.sort((a, b) => {
      // Compare each sort key in order
      for (let i = 0; i < this.sortFields.length; i++) {
        const sortField = this.sortFields[i]
        const order = sortField.order ?? 'asc'

        const aKey = a.sortKeys[i] ?? '' // Treat null as empty string
        const bKey = b.sortKeys[i] ?? ''

        // Compare strings
        const comparison = aKey.localeCompare(bKey)

        if (comparison !== 0) {
          return order === 'asc' ? comparison : -comparison
        }
      }

      // If all sort keys are equal, maintain stable sort using original index
      return a.originalIndex - b.originalIndex
    })
  }

  /**
   * Generates sliding windows from sorted records.
   *
   * Each record appears in multiple blocks (up to windowSize blocks).
   * This creates overlapping windows that ensure nearby records are compared.
   *
   * @param sortedRecords - Sorted array of records
   * @param blocks - Map to populate with blocks
   */
  private generateWindows(
    sortedRecords: Array<SortableRecord<T>>,
    blocks: Map<BlockKey, Array<T>>
  ): void {
    const { windowSize } = this.config
    const numRecords = sortedRecords.length

    // Handle edge case: window size larger than dataset
    if (windowSize >= numRecords) {
      // Single block containing all records
      const blockKey = 'window:0'
      blocks.set(
        blockKey,
        sortedRecords.map((sr) => sr.record)
      )
      return
    }

    // Generate sliding windows
    // Each position i starts a window of size windowSize
    const numWindows = numRecords - windowSize + 1

    for (let windowStart = 0; windowStart < numWindows; windowStart++) {
      const blockKey = `window:${windowStart}`
      const windowRecords: Array<T> = []

      // Add records in this window
      for (let j = 0; j < windowSize; j++) {
        const recordIndex = windowStart + j
        windowRecords.push(sortedRecords[recordIndex].record)
      }

      blocks.set(blockKey, windowRecords)
    }
  }

  /**
   * Gets a field value from a record, supporting nested fields with dot notation.
   *
   * @param record - The record to extract from
   * @param field - The field path (e.g., "user.address.city")
   * @returns The field value or undefined if not found
   */
  private getFieldValue(record: T, field: string): unknown {
    return field
      .split('.')
      .reduce(
        (obj: unknown, key) => (obj as Record<string, unknown>)?.[key],
        record
      )
  }

  /**
   * Normalizes the sortBy configuration into an array of SortField objects.
   *
   * @param sortBy - Raw sortBy configuration
   * @returns Normalized array of sort fields
   */
  private normalizeSortFields(
    sortBy: string | SortField | Array<string | SortField>
  ): SortField[] {
    // Convert to array
    const sortByArray = Array.isArray(sortBy) ? sortBy : [sortBy]

    // Normalize each element to SortField
    return sortByArray.map((item) => {
      if (typeof item === 'string') {
        return { field: item, order: 'asc' }
      } else {
        return { ...item, order: item.order ?? 'asc' }
      }
    })
  }

  /**
   * Generates a descriptive name for this strategy based on configuration.
   *
   * @returns Strategy name
   */
  private generateStrategyName(): string {
    const fieldNames = this.sortFields.map((sf) => sf.field).join('+')
    const windowSize = this.config.windowSize
    return `sorted-neighbourhood:${fieldNames}:w${windowSize}`
  }
}
