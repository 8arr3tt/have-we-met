// Main entry point
export { HaveWeMet, ResolverBuilder } from './builder/resolver-builder'

// Core classes
export { Resolver } from './core/resolver'
export { MatchingEngine } from './core/engine'

// Builders
export { SchemaBuilder } from './builder/schema-builder'
export { MatchingBuilder, FieldMatchBuilder } from './builder/matching-builder'

// Comparators
export { exactMatch, type ExactMatchOptions } from './core/comparators'

// Types - Records
export type { RecordId, RecordMetadata, Record, RecordPair } from './types'

// Types - Match Results
export type {
  MatchOutcome,
  FieldComparison,
  MatchScore,
  MatchExplanation,
  MatchCandidate,
  MatchResult,
} from './types'

// Types - Configuration
export type {
  ThresholdConfig,
  MatchingStrategy,
  FieldMatchConfig,
  MatchingConfig,
  BlockingConfig,
  ResolverConfig,
  ResolverOptions,
} from './types'

// Types - Schema
export type { FieldType, FieldDefinition, SchemaDefinition } from './types'
