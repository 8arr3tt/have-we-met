/**
 * Types for multi-source consolidation
 *
 * Supports matching and merging records from multiple database tables with different schemas
 * into a single unified output table.
 */

import type { MergeStrategy } from '../merge/types'
import type { DatabaseAdapter } from '../adapters/types'

/**
 * Transformation function that converts an input field value to an output field value
 *
 * @template TInput - Input record type
 * @template TOutput - Output record type
 * @param input - The full input record
 * @param fieldName - The output field name being computed
 * @returns The value for the output field
 *
 * @example
 * ```typescript
 * // Compute full name from first and last
 * const fullNameTransform: TransformFunction<Person, Customer> = (input, fieldName) => {
 *   return `${input.firstName} ${input.lastName}`
 * }
 * ```
 */
export type TransformFunction<TInput, TOutput> = (
  input: TInput,
  fieldName: keyof TOutput
) => TOutput[keyof TOutput]

/**
 * Configuration for mapping a single field from input to output schema
 *
 * Supports both static field mapping (rename) and computed fields (transform function).
 *
 * @template TInput - Input record type
 * @template TOutput - Output record type
 */
export interface FieldMappingConfig<TInput, TOutput> {
  /**
   * Static field mapping: specify input field path to copy from
   *
   * Supports nested field access via dot notation (e.g., 'address.city')
   *
   * Mutually exclusive with `transform`.
   *
   * @example
   * ```typescript
   * // Simple field rename
   * { sourceField: 'email' }
   *
   * // Nested field extraction
   * { sourceField: 'contact.email' }
   * ```
   */
  sourceField?: string

  /**
   * Computed field: provide function to compute output value
   *
   * Mutually exclusive with `sourceField`.
   *
   * @example
   * ```typescript
   * {
   *   transform: (input) => `${input.firstName} ${input.lastName}`
   * }
   * ```
   */
  transform?: TransformFunction<TInput, TOutput>

  /**
   * Optional type coercion for the mapped value
   *
   * @example
   * ```typescript
   * // Convert string to number
   * { sourceField: 'age', coerce: 'number' }
   * ```
   */
  coerce?: 'string' | 'number' | 'boolean' | 'date'

  /**
   * Whether this field is required in the output
   *
   * If true, mapping will fail if the field cannot be populated.
   *
   * @default false
   */
  required?: boolean
}

/**
 * Complete field mapping configuration from input to output schema
 *
 * Maps each field in the output schema to a source in the input schema
 *
 * @template TInput - Input record type
 * @template TOutput - Output record type
 *
 * @example
 * ```typescript
 * const mapping: FieldMapping<LegacyCustomer, Customer> = {
 *   email: { sourceField: 'email_address' },
 *   firstName: { sourceField: 'first_name' },
 *   lastName: { sourceField: 'last_name' },
 *   fullName: {
 *     transform: (input) => `${input.first_name} ${input.last_name}`
 *   }
 * }
 * ```
 */
export type FieldMapping<TInput, TOutput> = {
  [K in keyof TOutput]: FieldMappingConfig<TInput, TOutput>
}

/**
 * Configuration for a single data source
 *
 * Defines where to load records from and how to map them to the unified output schema
 *
 * @template TInput - Input record type for this source
 * @template TOutput - Unified output record type
 */
export interface ConsolidationSource<
  TInput extends Record<string, unknown>,
  TOutput extends Record<string, unknown>,
> {
  /**
   * Unique identifier for this source
   *
   * Used in provenance tracking and logging
   *
   * @example 'crm_db', 'billing_system', 'legacy_customers'
   */
  sourceId: string

  /**
   * Human-readable name for this source
   *
   * @example 'CRM Database', 'Billing System', 'Legacy Customer Table'
   */
  name: string

  /**
   * Database adapter for loading records from this source
   *
   * The adapter should be configured to read from the appropriate table/collection
   */
  adapter: DatabaseAdapter<TInput>

  /**
   * Field mapping configuration
   *
   * Maps fields from input schema to unified output schema
   */
  mapping: FieldMapping<TInput, TOutput>

  /**
   * Optional priority for this source in conflict resolution
   *
   * Higher priority sources are preferred when fields conflict.
   * If not specified, all sources have equal priority (0).
   *
   * @default 0
   */
  priority?: number

  /**
   * Optional metadata for this source
   *
   * Can be used for custom logic in transformation or conflict resolution
   */
  metadata?: Record<string, unknown>
}

/**
 * Matching scope determines how records are compared across sources
 */
export enum MatchingScope {
  /**
   * First deduplicate within each source, then match across sources
   *
   * More efficient for large datasets with many duplicates within sources
   */
  WithinSourceFirst = 'within-source-first',

  /**
   * Match across all sources in a unified pool
   *
   * May find matches that within-source-first misses, but slower
   */
  UnifiedPool = 'unified-pool',
}

/**
 * Configuration for conflict resolution when merging records from multiple sources
 */
export interface ConflictResolutionConfig {
  /**
   * Default merge strategy for fields not specified in fieldStrategies
   *
   * @default 'preferFirst'
   */
  defaultStrategy?: MergeStrategy

  /**
   * Per-field merge strategies
   *
   * Overrides defaultStrategy for specific fields
   *
   * @example
   * ```typescript
   * {
   *   email: 'preferNonNull',
   *   phone: 'preferNewer',
   *   tags: 'union'
   * }
   * ```
   */
  fieldStrategies?: Record<string, MergeStrategy>

  /**
   * Whether to use source priority for conflict resolution
   *
   * If true, higher priority sources are preferred for conflicting fields
   * If false, only merge strategies are used
   *
   * @default true
   */
  useSourcePriority?: boolean

  /**
   * Whether to track provenance (source attribution) for merged fields
   *
   * @default true
   */
  trackProvenance?: boolean
}

/**
 * Complete configuration for multi-source consolidation
 *
 * @template TOutput - Unified output record type
 */
export interface ConsolidationConfig<TOutput extends Record<string, unknown>> {
  /**
   * List of data sources to consolidate
   *
   * Each source defines where to load records from and how to map them
   */
  sources: Array<ConsolidationSource<Record<string, unknown>, TOutput>>

  /**
   * Matching scope strategy
   *
   * @default MatchingScope.WithinSourceFirst
   */
  matchingScope?: MatchingScope

  /**
   * Conflict resolution configuration
   */
  conflictResolution?: ConflictResolutionConfig

  /**
   * Optional output adapter for writing golden records
   *
   * If not provided, golden records are returned but not persisted
   */
  outputAdapter?: DatabaseAdapter<TOutput>

  /**
   * Whether to write golden records to output adapter
   *
   * @default false
   */
  writeOutput?: boolean
}

/**
 * Mapped record with source provenance
 *
 * @template TOutput - Output record type
 */
export interface MappedRecord<TOutput> {
  /**
   * The record mapped to output schema
   */
  record: TOutput

  /**
   * Source ID this record came from
   */
  sourceId: string

  /**
   * Original record before mapping (for debugging and provenance)
   */
  originalRecord: unknown

  /**
   * Internal ID from source system
   */
  sourceRecordId: string | number
}

/**
 * Result of matching records across sources
 */
export interface ConsolidationMatchResult<TOutput> {
  /**
   * Matched records from various sources
   */
  matches: MappedRecord<TOutput>[]

  /**
   * Match score
   */
  score: number

  /**
   * Explanation of the match
   */
  explanation?: string
}

/**
 * Statistics from consolidation execution
 */
export interface ConsolidationStats {
  /**
   * Per-source statistics
   */
  sources: {
    [sourceId: string]: {
      /**
       * Number of records loaded from this source
       */
      recordsLoaded: number

      /**
       * Number of records that failed mapping
       */
      mappingErrors: number

      /**
       * Number of duplicates found within this source
       */
      duplicatesWithinSource: number
    }
  }

  /**
   * Total records loaded across all sources
   */
  totalRecords: number

  /**
   * Total golden records created
   */
  goldenRecords: number

  /**
   * Number of records matched across different sources
   */
  crossSourceMatches: number

  /**
   * Records that didn't match anything
   */
  uniqueRecords: number

  /**
   * Execution time in milliseconds
   */
  executionTimeMs: number
}

/**
 * Result of consolidation execution
 */
export interface ConsolidationResult<TOutput> {
  /**
   * Golden records created from consolidation
   */
  goldenRecords: TOutput[]

  /**
   * Match groups (which source records were merged into each golden record)
   */
  matchGroups: ConsolidationMatchResult<TOutput>[]

  /**
   * Statistics from consolidation
   */
  stats: ConsolidationStats

  /**
   * Any errors encountered (non-fatal)
   */
  errors: Array<{
    sourceId: string
    recordId: string | number
    error: string
  }>
}

/**
 * Error thrown during consolidation operations
 */
export class ConsolidationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'ConsolidationError'
  }
}

/**
 * Validation error for consolidation configuration
 */
export class ConsolidationConfigError extends ConsolidationError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'CONSOLIDATION_CONFIG_ERROR', details)
    this.name = 'ConsolidationConfigError'
  }
}

/**
 * Error during schema mapping
 */
export class MappingError extends ConsolidationError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'MAPPING_ERROR', details)
    this.name = 'MappingError'
  }
}
