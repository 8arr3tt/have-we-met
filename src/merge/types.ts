/**
 * Merge-related type definitions for the golden record system
 * @module merge/types
 */

/**
 * Built-in merge strategies for field values.
 * Each strategy determines how to select or combine values from multiple source records.
 *
 * - `preferFirst` - Use value from first source record
 * - `preferLast` - Use value from last source record
 * - `preferNewer` - Use value from most recently updated record
 * - `preferOlder` - Use value from oldest record
 * - `preferNonNull` - Use first non-null/non-empty value
 * - `preferLonger` - Use longer string value
 * - `preferShorter` - Use shorter string value
 * - `concatenate` - Combine values (for arrays)
 * - `union` - Unique values from all records (for arrays)
 * - `mostFrequent` - Use most common value across sources
 * - `average` - Average numeric values
 * - `sum` - Sum numeric values
 * - `min` - Minimum numeric value
 * - `max` - Maximum numeric value
 * - `custom` - User-provided function
 */
export type MergeStrategy =
  | 'preferFirst'
  | 'preferLast'
  | 'preferNewer'
  | 'preferOlder'
  | 'preferNonNull'
  | 'preferLonger'
  | 'preferShorter'
  | 'concatenate'
  | 'union'
  | 'mostFrequent'
  | 'average'
  | 'sum'
  | 'min'
  | 'max'
  | 'custom'

/**
 * Array of all built-in merge strategy names
 */
export const MERGE_STRATEGIES: MergeStrategy[] = [
  'preferFirst',
  'preferLast',
  'preferNewer',
  'preferOlder',
  'preferNonNull',
  'preferLonger',
  'preferShorter',
  'concatenate',
  'union',
  'mostFrequent',
  'average',
  'sum',
  'min',
  'max',
  'custom',
]

/**
 * Strategies that require numeric field values
 */
export const NUMERIC_STRATEGIES: MergeStrategy[] = ['average', 'sum', 'min', 'max']

/**
 * Strategies that operate on arrays
 */
export const ARRAY_STRATEGIES: MergeStrategy[] = ['concatenate', 'union']

/**
 * Strategies that require timestamp fields
 */
export const TEMPORAL_STRATEGIES: MergeStrategy[] = ['preferNewer', 'preferOlder']

/**
 * Strategies that operate on strings
 */
export const STRING_STRATEGIES: MergeStrategy[] = ['preferLonger', 'preferShorter']

/**
 * A source record with metadata used during merge operations
 */
export interface SourceRecord<T extends Record<string, unknown> = Record<string, unknown>> {
  /** Unique identifier for the source record */
  id: string

  /** The record data */
  record: T

  /** When the record was created */
  createdAt: Date

  /** When the record was last updated */
  updatedAt: Date
}

/**
 * Options for configuring merge strategies
 */
export interface FieldMergeOptions {
  /** Separator for concatenate strategy */
  separator?: string

  /** Date field to use for preferNewer/preferOlder (overrides global timestampField) */
  dateField?: string

  /** How to handle null values */
  nullHandling?: 'skip' | 'include' | 'preferNull'

  /** Whether to remove duplicates when concatenating */
  removeDuplicates?: boolean
}

/**
 * Custom merge function signature
 */
export type CustomMergeFunction<T = unknown> = (
  values: T[],
  records: SourceRecord[],
  options?: FieldMergeOptions,
) => T

/**
 * Configuration for a single field's merge strategy
 */
export interface FieldMergeConfig {
  /** Field path (supports dot notation for nested fields) */
  field: string

  /** Strategy to apply */
  strategy: MergeStrategy

  /** Custom merge function (required if strategy is 'custom') */
  customMerge?: CustomMergeFunction

  /** Options for the merge strategy */
  options?: FieldMergeOptions
}

/**
 * How to handle conflicts during merge
 * - `error` - Throw an error when conflict cannot be resolved
 * - `useDefault` - Use the default strategy to resolve conflict
 * - `markConflict` - Mark the conflict in the result without resolving
 */
export type ConflictResolution = 'error' | 'useDefault' | 'markConflict'

/**
 * Overall merge configuration
 */
export interface MergeConfig {
  /** Field-specific merge strategies */
  fieldStrategies: FieldMergeConfig[]

  /** Default strategy for fields without explicit config */
  defaultStrategy: MergeStrategy

  /** Field to use for determining record age (for temporal strategies) */
  timestampField?: string

  /** Whether to track provenance (default: true) */
  trackProvenance: boolean

  /** Conflict resolution mode (default: 'useDefault') */
  conflictResolution: ConflictResolution
}

/**
 * Default merge configuration
 */
export const DEFAULT_MERGE_CONFIG: Omit<MergeConfig, 'fieldStrategies'> = {
  defaultStrategy: 'preferNonNull',
  trackProvenance: true,
  conflictResolution: 'useDefault',
}

/**
 * Attribution for a single field value in the merged record
 */
export interface FieldProvenance {
  /** Source record ID that contributed this field's value */
  sourceRecordId: string

  /** Strategy applied to select this value */
  strategyApplied: MergeStrategy

  /** Original values from all source records */
  allValues: Array<{
    recordId: string
    value: unknown
  }>

  /** Whether there was a conflict during merge */
  hadConflict: boolean

  /** Conflict resolution notes if applicable */
  conflictResolution?: string
}

/**
 * Tracks which source records contributed to each field in the golden record
 */
export interface Provenance {
  /** Golden record ID */
  goldenRecordId: string

  /** IDs of source records that were merged */
  sourceRecordIds: string[]

  /** Timestamp of merge operation */
  mergedAt: Date

  /** User/system that performed the merge */
  mergedBy?: string

  /** Queue item ID if merge originated from review queue */
  queueItemId?: string

  /** Field-level attribution */
  fieldSources: Record<string, FieldProvenance>

  /** Merge strategy configuration used */
  strategyUsed: MergeConfig

  /** Whether this merge has been unmerged */
  unmerged?: boolean

  /** Timestamp when unmerged (if applicable) */
  unmergedAt?: Date

  /** User/system that performed the unmerge */
  unmergedBy?: string

  /** Reason for unmerge */
  unmergeReason?: string
}

/**
 * A conflict that occurred during merge
 */
export interface MergeConflict {
  /** Field path */
  field: string

  /** Values that conflicted */
  values: Array<{ recordId: string; value: unknown }>

  /** How the conflict was resolved */
  resolution: 'auto' | 'manual' | 'deferred'

  /** Final value chosen (undefined if deferred) */
  resolvedValue?: unknown

  /** Reason for resolution */
  resolutionReason?: string
}

/**
 * Statistics about a merge operation
 */
export interface MergeStats {
  /** Count of fields contributed by each source record */
  fieldsFromEachSource: Record<string, number>

  /** Number of conflicts that were automatically resolved */
  conflictsResolved: number

  /** Number of conflicts that were deferred */
  conflictsDeferred: number

  /** Total number of fields merged */
  totalFields: number

  /** Time taken to perform the merge (milliseconds) */
  mergeTimeMs?: number
}

/**
 * Result of a merge operation
 */
export interface MergeResult<T extends Record<string, unknown>> {
  /** The merged golden record */
  goldenRecord: T

  /** ID of the golden record */
  goldenRecordId: string

  /** Provenance tracking data */
  provenance: Provenance

  /** Original source records (for audit/unmerge) */
  sourceRecords: SourceRecord<T>[]

  /** Any conflicts encountered during merge */
  conflicts: MergeConflict[]

  /** Statistics about the merge */
  stats: MergeStats
}

/**
 * Request to perform a merge operation
 */
export interface MergeRequest<T extends Record<string, unknown>> {
  /** Source records to merge */
  sourceRecords: SourceRecord<T>[]

  /** Optional: specify which record ID becomes the golden record ID */
  targetRecordId?: string

  /** Optional: override merge configuration for this operation */
  configOverrides?: Partial<MergeConfig>

  /** User/system performing the merge */
  mergedBy?: string

  /** Queue item ID if merge originated from review queue */
  queueItemId?: string
}

/**
 * Request to unmerge a golden record
 */
export interface UnmergeRequest {
  /** Golden record ID to unmerge */
  goldenRecordId: string

  /** User/system performing unmerge */
  unmergedBy?: string

  /** Reason for unmerge */
  reason?: string
}

/**
 * Result of an unmerge operation
 */
export interface UnmergeResult<T extends Record<string, unknown>> {
  /** Restored source records */
  restoredRecords: Array<{
    id: string
    record: T
  }>

  /** Original provenance (for audit) */
  originalProvenance: Provenance

  /** Whether the golden record was deleted */
  goldenRecordDeleted: boolean
}

/**
 * Context object for tracking state during merge operations
 */
export interface MergeContext<T extends Record<string, unknown> = Record<string, unknown>> {
  /** The merge configuration being used */
  config: MergeConfig

  /** Source records being merged */
  sourceRecords: SourceRecord<T>[]

  /** Current field being processed */
  currentField?: string

  /** Accumulated field provenance */
  fieldSources: Record<string, FieldProvenance>

  /** Accumulated conflicts */
  conflicts: MergeConflict[]

  /** Start time of merge operation */
  startTime: Date

  /** Whether provenance tracking is enabled */
  trackProvenance: boolean
}

/**
 * Strategy function signature for applying merge strategies
 */
export type StrategyFunction<T = unknown> = (
  values: T[],
  records: SourceRecord[],
  options?: FieldMergeOptions,
) => T | undefined

/**
 * Result from applying a strategy to a field
 */
export interface StrategyResult {
  /** The selected/computed value */
  value: unknown

  /** ID of the source record that contributed this value (if applicable) */
  sourceRecordId?: string

  /** Whether a conflict occurred */
  hadConflict: boolean

  /** Details about the conflict if one occurred */
  conflictDetails?: string
}
