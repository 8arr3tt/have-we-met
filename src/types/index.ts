export type { RecordId, RecordMetadata, Record, RecordPair } from './record'

export type {
  MatchOutcome,
  FieldComparison,
  MatchScore,
  MatchExplanation,
  MatchCandidate,
  MatchResult,
} from './match'

export type {
  ThresholdConfig,
  MatchingStrategy,
  FieldMatchConfig,
  MatchingConfig,
  BlockingConfig,
  ResolverConfig,
  ResolverOptions,
} from './config'

export type { FieldType, FieldDefinition, SchemaDefinition } from './schema'

export type {
  TransformFunction,
  FieldMappingConfig,
  FieldMapping,
  ConsolidationSource,
  ConflictResolutionConfig,
  ConsolidationConfig,
  MappedRecord,
  ConsolidationMatchResult,
  ConsolidationStats,
  ConsolidationResult,
} from '../consolidation/types'

export { MatchingScope } from '../consolidation/types'

export {
  ConsolidationError,
  ConsolidationConfigError,
  MappingError,
} from '../consolidation/types'
