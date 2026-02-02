/**
 * Consolidation module for multi-source identity resolution
 *
 * This module provides functionality for matching and merging records from
 * multiple database tables with different schemas into a single unified output table.
 *
 * @packageDocumentation
 */

// Types
export type {
  ConsolidationSource,
  FieldMapping,
  FieldMappingConfig,
  TransformFunction,
  ConflictResolutionConfig,
  ConsolidationConfig,
  MappedRecord,
  ConsolidationMatchResult,
  ConsolidationStats,
  ConsolidationResult,
} from './types'

export {
  MatchingScope,
  ConsolidationError,
  ConsolidationConfigError,
  MappingError,
} from './types'

// Schema Mapper
export {
  SchemaMapper,
  createSchemaMapper,
  TypeCoercions,
  CommonTransforms,
} from './schema-mapper'

// Cross-Source Matcher
export type {
  CrossSourceMatcherConfig,
  MatchingOptions,
} from './cross-source-matcher'

export {
  CrossSourceMatcher,
  createCrossSourceMatcher,
} from './cross-source-matcher'
