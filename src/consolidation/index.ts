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

// Source-Aware Merger
export type {
  SourceAwareRecord,
  SourceAwareMergeConfig,
  SourceAwareProvenance,
} from './source-aware-merger'

export {
  SourceAwareMerger,
  createSourceAwareMerger,
} from './source-aware-merger'

// Consolidation Executor
export type {
  ExecuteOptions,
} from './consolidation-executor'

export {
  ConsolidationExecutor,
  createConsolidationExecutor,
} from './consolidation-executor'

// Multi-Table Adapters
export type {
  SourceTableConfig,
  SourceMappingConfig,
  SourceMappingRecord,
  LoadOptions,
  WriteGoldenRecordsOptions,
  WriteGoldenRecordsResult,
  PrismaClient,
  PrismaMultiTableAdapterConfig,
  MatchGroup,
} from './adapters'

export {
  MultiTableAdapter,
  createMultiTableAdapter,
  PrismaMultiTableAdapter,
  createPrismaMultiTableAdapter,
  prismaMultiTableAdapterFromSources,
} from './adapters'
