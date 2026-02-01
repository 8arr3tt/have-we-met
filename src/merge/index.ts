/**
 * Golden record merge module
 * @module merge
 */

// Types
export type {
  MergeStrategy,
  SourceRecord,
  FieldMergeOptions,
  CustomMergeFunction,
  FieldMergeConfig,
  ConflictResolution,
  MergeConfig,
  FieldProvenance,
  Provenance,
  MergeConflict,
  MergeStats,
  MergeResult,
  MergeRequest,
  UnmergeRequest,
  UnmergeResult,
  MergeContext,
  StrategyFunction,
  StrategyResult,
} from './types.js'

export {
  MERGE_STRATEGIES,
  NUMERIC_STRATEGIES,
  ARRAY_STRATEGIES,
  TEMPORAL_STRATEGIES,
  STRING_STRATEGIES,
  DEFAULT_MERGE_CONFIG,
} from './types.js'

// Errors
export {
  MergeError,
  MergeValidationError,
  MergeConflictError,
  MergeProvenanceError,
  UnmergeError,
  SourceRecordNotFoundError,
  InvalidStrategyError,
  StrategyTypeMismatchError,
  CustomStrategyMissingError,
  ProvenanceNotFoundError,
  InsufficientSourceRecordsError,
} from './merge-error.js'

// Validation
export {
  validateMergeConfig,
  validateFieldStrategy,
  validateSourceRecords,
  validateFieldPathsAgainstSchema,
  validateStrategyFieldTypeCompatibility,
  validateMergeRequest,
  isNullOrUndefined,
  isEmpty,
  getNestedValue,
  setNestedValue,
} from './validation.js'

// Strategies
export {
  // Registry
  registerStrategy,
  getStrategy,
  hasStrategy,
  getRegisteredStrategies,
  unregisterStrategy,
  clearStrategies,
  isBuiltInStrategy,
  registerBuiltInStrategies,
  // Basic strategies
  preferFirst,
  preferLast,
  preferNonNull,
  // Temporal strategies
  preferNewer,
  preferOlder,
  // String strategies
  preferLonger,
  preferShorter,
  // Array strategies
  concatenate,
  union,
  // Numeric strategies
  mostFrequent,
  average,
  sum,
  min,
  max,
} from './strategies/index.js'

// Merge executor
export { MergeExecutor } from './merge-executor.js'

// Merge context
export {
  createMergeContext,
  recordFieldProvenance,
  recordConflict,
  setCurrentField,
  calculateStats,
} from './merge-context.js'

// Provenance tracking
export {
  ProvenanceTracker,
  createProvenanceTracker,
  InMemoryProvenanceStore,
  createInMemoryProvenanceStore,
} from './provenance/index.js'

export type {
  ProvenanceStore,
  UnmergeInfo,
  ProvenanceQueryOptions,
  FieldHistoryEntry,
  MergeTimelineEntry,
} from './provenance/index.js'

// Unmerge executor
export {
  UnmergeExecutor,
  InMemorySourceRecordArchive,
  createUnmergeExecutor,
  createInMemorySourceRecordArchive,
} from './unmerge.js'

export type { UnmergeMode, UnmergeOptions, SourceRecordArchive } from './unmerge.js'

// Queue merge handler
export { QueueMergeHandler, createQueueMergeHandler } from './queue-merge-handler.js'

export type { QueueMergeResult, QueueMergeHandlerOptions } from './queue-merge-handler.js'

// Merge builder (re-export from builder module)
export { MergeBuilder, FieldMergeBuilder, createMergeBuilder } from '../builder/merge-builder.js'
