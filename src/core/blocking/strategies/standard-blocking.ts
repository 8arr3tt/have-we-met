import type { BlockingStrategy, BlockSet, BlockKey } from '../types'
import type { BlockTransform, FirstNOptions } from '../transforms'
import { applyTransform } from '../transforms'

/**
 * Strategy for handling null/undefined values in blocking fields.
 */
export type NullStrategy = 'skip' | 'block' | 'compare'

/**
 * Configuration for single-field standard blocking.
 */
export interface SingleFieldBlockConfig {
  /** The field to block on */
  field: string
  /** Optional transform to apply to the field value */
  transform?: BlockTransform
  /** Options for the transform (e.g., n for firstN) */
  transformOptions?: FirstNOptions
  /** How to handle null/undefined values (default: 'skip') */
  nullStrategy?: NullStrategy
  /** Whether to normalize block keys (lowercase, trim) (default: true) */
  normalizeKeys?: boolean
}

/**
 * Configuration for multi-field standard blocking.
 */
export interface MultiFieldBlockConfig {
  /** The fields to block on */
  fields: string[]
  /** Optional transforms to apply to each field (must match length of fields) */
  transforms?: Array<BlockTransform | undefined>
  /** Options for transforms */
  transformOptions?: Array<FirstNOptions | undefined>
  /** How to handle null/undefined values (default: 'skip') */
  nullStrategy?: NullStrategy
  /** Whether to normalize block keys (lowercase, trim) (default: true) */
  normalizeKeys?: boolean
}

/**
 * Combined configuration for standard blocking.
 */
export type StandardBlockConfig = SingleFieldBlockConfig | MultiFieldBlockConfig

/**
 * Standard blocking strategy that groups records by exact field values.
 * Optionally applies transformations to field values before blocking.
 *
 * This is the most common and straightforward blocking approach.
 *
 * @example
 * ```typescript
 * // Block on first letter of last name
 * const strategy = new StandardBlockingStrategy({
 *   field: 'lastName',
 *   transform: 'firstLetter'
 * })
 *
 * // Block on Soundex of last name
 * const strategy = new StandardBlockingStrategy({
 *   field: 'lastName',
 *   transform: 'soundex'
 * })
 *
 * // Multi-field blocking
 * const strategy = new StandardBlockingStrategy({
 *   fields: ['lastName', 'birthYear'],
 *   transforms: ['firstLetter', 'identity']
 * })
 * ```
 */
export class StandardBlockingStrategy<T = unknown> implements BlockingStrategy<T> {
  readonly name: string
  private config: StandardBlockConfig

  constructor(config: StandardBlockConfig) {
    this.config = config
    this.name = this.generateStrategyName()
  }

  /**
   * Generates blocks from records based on field values.
   *
   * @param records - Array of records to group into blocks
   * @returns Map of block keys to arrays of records
   */
  generateBlocks(records: Array<T>): BlockSet<T> {
    const blocks = new Map<BlockKey, Array<T>>()
    const nullStrategy = this.config.nullStrategy ?? 'skip'
    const normalizeKeys = this.config.normalizeKeys ?? true

    for (const record of records) {
      const blockKey = this.generateBlockKey(record)

      // Handle null/undefined block keys
      if (blockKey === null) {
        if (nullStrategy === 'skip') {
          continue // Skip this record
        } else if (nullStrategy === 'block') {
          // Add to special __NULL__ block
          const nullKey = '__NULL__'
          if (!blocks.has(nullKey)) {
            blocks.set(nullKey, [])
          }
          blocks.get(nullKey)!.push(record)
          continue
        } else if (nullStrategy === 'compare') {
          // Add to special __COMPARE_ALL__ block (will be compared with all records)
          const compareKey = '__COMPARE_ALL__'
          if (!blocks.has(compareKey)) {
            blocks.set(compareKey, [])
          }
          blocks.get(compareKey)!.push(record)
          continue
        }
      }

      // Normalize the key if configured
      const finalKey = normalizeKeys ? this.normalizeKey(blockKey!) : blockKey!

      // Add record to block
      if (!blocks.has(finalKey)) {
        blocks.set(finalKey, [])
      }
      blocks.get(finalKey)!.push(record)
    }

    return blocks
  }

  /**
   * Generates a block key for a single record.
   *
   * @param record - The record to generate a key for
   * @returns Block key or null if the field is null/undefined
   */
  private generateBlockKey(record: T): BlockKey | null {
    if (this.isSingleFieldConfig(this.config)) {
      return this.generateSingleFieldKey(record, this.config)
    } else {
      return this.generateMultiFieldKey(record, this.config)
    }
  }

  /**
   * Generates a block key for single-field configuration.
   *
   * @param record - The record to generate a key for
   * @param config - Single field configuration
   * @returns Block key or null
   */
  private generateSingleFieldKey(
    record: T,
    config: SingleFieldBlockConfig
  ): BlockKey | null {
    const value = this.getFieldValue(record, config.field)

    // Apply transform if configured
    let transformedValue: string | null
    if (config.transform) {
      transformedValue = applyTransform(value, config.transform, config.transformOptions)
    } else {
      transformedValue = value == null ? null : String(value)
    }

    if (transformedValue === null) {
      return null
    }

    // Format: field:value
    return `${config.field}:${transformedValue}`
  }

  /**
   * Generates a composite block key for multi-field configuration.
   *
   * @param record - The record to generate a key for
   * @param config - Multi-field configuration
   * @returns Block key or null if any required field is null
   */
  private generateMultiFieldKey(
    record: T,
    config: MultiFieldBlockConfig
  ): BlockKey | null {
    const keyParts: string[] = []

    for (let i = 0; i < config.fields.length; i++) {
      const field = config.fields[i]
      const transform = config.transforms?.[i]
      const transformOptions = config.transformOptions?.[i]

      const value = this.getFieldValue(record, field)

      // Apply transform if configured
      let transformedValue: string | null
      if (transform) {
        transformedValue = applyTransform(value, transform, transformOptions)
      } else {
        transformedValue = value == null ? null : String(value)
      }

      // If any field is null, the entire key is null
      if (transformedValue === null) {
        return null
      }

      keyParts.push(`${field}:${transformedValue}`)
    }

    // Format: field1:value1|field2:value2|...
    return keyParts.join('|')
  }

  /**
   * Normalizes a block key by trimming and converting to lowercase.
   *
   * @param key - The key to normalize
   * @returns Normalized key
   */
  private normalizeKey(key: BlockKey): BlockKey {
    return key.trim().toLowerCase()
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
   * Type guard to check if config is single-field.
   *
   * @param config - Configuration to check
   * @returns True if single-field config
   */
  private isSingleFieldConfig(
    config: StandardBlockConfig
  ): config is SingleFieldBlockConfig {
    return 'field' in config
  }

  /**
   * Generates a descriptive name for this strategy based on configuration.
   *
   * @returns Strategy name
   */
  private generateStrategyName(): string {
    if (this.isSingleFieldConfig(this.config)) {
      const transformName = this.getTransformName(this.config.transform)
      return `standard:${this.config.field}${transformName ? `:${transformName}` : ''}`
    } else {
      const fieldNames = this.config.fields.join('+')
      return `standard:${fieldNames}`
    }
  }

  /**
   * Gets a readable name for a transform.
   *
   * @param transform - The transform to name
   * @returns Transform name or empty string
   */
  private getTransformName(transform: BlockTransform | undefined): string {
    if (!transform) return ''
    if (typeof transform === 'function') return 'custom'
    return transform
  }
}
