// Main entry point
export { HaveWeMet, ResolverBuilder } from './builder/resolver-builder'

// Core classes
export { Resolver } from './core/resolver'
export { MatchingEngine } from './core/engine'

// Comparators
export { exactMatch, type ExactMatchOptions } from './core/comparators'

// Types - Records
export type {
  RecordId,
  RecordMetadata,
  Record,
  RecordPair,
} from './types/record'

// Types - Matching
export type {
  MatchOutcome,
  FieldComparison,
  MatchScore,
  MatchExplanation,
  MatchCandidate,
  MatchResult,
} from './types/match'

// Types - Configuration
export type {
  ThresholdConfig,
  MatchingStrategy,
  FieldMatchConfig,
  MatchingConfig,
  BlockingConfig,
  ResolverConfig,
  ResolverOptions,
} from './types/config'

// Types - Schema
export type {
  FieldType,
  FieldDefinition,
  SchemaDefinition,
} from './types/schema'

// Builders
export { SchemaBuilder } from './builder/schema-builder'
export { MatchingBuilder, FieldMatchBuilder } from './builder/matching-builder'
