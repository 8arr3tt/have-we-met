import type { MatchResult } from './types'

/**
 * Deduplication results for a single record, showing all its matches.
 *
 * @typeParam T - The type of the record
 */
export interface DeduplicationResult<T = unknown> {
  /** The record being deduplicated */
  record: T
  /** All matches found for this record */
  matches: MatchResult<T>[]
  /** Whether any matches are classified as definite matches */
  hasDefiniteMatches: boolean
  /** Whether any matches are classified as potential matches */
  hasPotentialMatches: boolean
  /** Total number of matches (definite + potential) */
  matchCount: number
}

/**
 * Options for batch deduplication operations.
 */
export interface DeduplicationBatchOptions {
  /** Maximum number of matches to return per record */
  maxPairsPerRecord?: number
  /** Minimum score threshold (overrides configured noMatch threshold) */
  minScore?: number
  /** Whether to include records with no matches in results */
  includeNoMatches?: boolean
}

/**
 * Statistics from a batch deduplication operation.
 */
export interface DeduplicationStats {
  /** Total number of records processed */
  recordsProcessed: number
  /** Total number of pairwise comparisons made */
  comparisonsMade: number
  /** Number of definite matches found */
  definiteMatchesFound: number
  /** Number of potential matches found */
  potentialMatchesFound: number
  /** Number of no-match results */
  noMatchesFound: number
  /** Number of records that have at least one match */
  recordsWithMatches: number
  /** Number of records with no matches */
  recordsWithoutMatches: number
}

/**
 * Complete result from a batch deduplication operation.
 *
 * @typeParam T - The type of the records
 */
export interface DeduplicationBatchResult<T = unknown> {
  /** Deduplication results for each record */
  results: DeduplicationResult<T>[]
  /** Aggregate statistics for the batch operation */
  stats: DeduplicationStats
}
