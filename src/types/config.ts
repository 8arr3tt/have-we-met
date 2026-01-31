import type { SchemaDefinition } from './schema'
import type {
  LevenshteinOptions,
  JaroWinklerOptions,
  SoundexOptions,
  MetaphoneOptions,
} from '../core/comparators'
import type { BlockingConfig as BlockingConfigType } from '../core/blocking/types'
import type { DatabaseAdapter } from '../adapters/types'

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
 * - `'exact'`: Exact match comparison
 * - `'levenshtein'`: Edit distance-based similarity (general purpose)
 * - `'jaro-winkler'`: Optimized for short strings like names (handles transpositions)
 * - `'soundex'`: Phonetic encoding for English names
 * - `'metaphone'`: Improved phonetic encoding with better pronunciation rules
 */
export type MatchingStrategy =
  | 'exact'
  | 'levenshtein'
  | 'jaro-winkler'
  | 'soundex'
  | 'metaphone'

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

  /** Options for Levenshtein distance strategy */
  levenshteinOptions?: LevenshteinOptions
  /** Options for Jaro-Winkler similarity strategy */
  jaroWinklerOptions?: JaroWinklerOptions
  /** Options for Soundex phonetic encoding strategy */
  soundexOptions?: SoundexOptions
  /** Options for Metaphone phonetic encoding strategy */
  metaphoneOptions?: MetaphoneOptions
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
 * Configuration for blocking strategies.
 * Blocking strategies reduce O(n²) comparisons by grouping records.
 * Records within the same block will be compared against each other.
 */
export type BlockingConfig<T = unknown> = BlockingConfigType<T>

/**
 * Complete configuration for a resolver instance.
 *
 * @typeParam T - The shape of the user's data object
 */
export interface ResolverConfig<T extends Record<string, unknown> = Record<string, unknown>> {
  /** Schema defining the structure of records */
  schema: SchemaDefinition<T>
  /** Configuration for the matching process */
  matching: MatchingConfig
  /** Optional blocking configuration for performance optimization */
  blocking?: BlockingConfig<T>
  /** Optional database adapter for persistent storage integration */
  adapter?: DatabaseAdapter<T>
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
