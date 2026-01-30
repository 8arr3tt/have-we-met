import type { SchemaDefinition } from './schema'

/**
 * Configuration for match score thresholds that determine outcomes.
 * Scores below `noMatch` result in a 'new' outcome.
 * Scores at or above `definiteMatch` result in a 'match' outcome.
 * Scores between the two result in a 'review' outcome.
 */
export interface ThresholdConfig {
  /** Scores below this threshold indicate no match (new record) */
  noMatch: number
  /** Scores at or above this threshold indicate a confirmed match */
  definiteMatch: number
}

/**
 * Available matching strategies for field comparison.
 * Currently only supports exact matching; additional strategies
 * (e.g., 'levenshtein', 'jaro-winkler', 'soundex') will be added in Phase 2.
 */
export type MatchingStrategy = 'exact'

/**
 * Configuration for how a single field should be matched.
 */
export interface FieldMatchConfig {
  /** Strategy to use for comparing this field */
  strategy: MatchingStrategy
  /** Weight of this field in the total score calculation */
  weight: number
  /** Minimum similarity score (0-1) required to count as a match */
  threshold?: number
  /** Whether string comparisons should be case-sensitive (default: true) */
  caseSensitive?: boolean
}

/**
 * Configuration for the matching process, including field configurations and thresholds.
 */
export interface MatchingConfig {
  /** Map of field names to their matching configuration */
  fields: Map<string, FieldMatchConfig>
  /** Thresholds for determining match outcomes */
  thresholds: ThresholdConfig
}

/**
 * Placeholder for blocking configuration.
 * Blocking strategies reduce O(n²) comparisons by grouping records.
 * Will be fully implemented in Phase 4.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface BlockingConfig {}

/**
 * Complete configuration for a resolver instance.
 *
 * @typeParam T - The shape of the user's data object
 */
export interface ResolverConfig<T extends object = object> {
  /** Schema defining the structure of records */
  schema: SchemaDefinition<T>
  /** Configuration for the matching process */
  matching: MatchingConfig
  /** Optional blocking configuration for performance optimization */
  blocking?: BlockingConfig
}

/**
 * Runtime options for resolver operations.
 * These can be passed to individual resolve calls to customize behavior.
 */
export interface ResolverOptions {
  /** Whether to include detailed explanations in results (default: true) */
  returnExplanation?: boolean
  /** Maximum number of candidates to return (default: 10) */
  maxCandidates?: number
}
