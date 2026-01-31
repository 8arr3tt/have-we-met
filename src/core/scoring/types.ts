import type { MatchingStrategy } from '../../types/config'

/**
 * Configuration for a single field comparison in probabilistic matching.
 */
export interface FieldComparison {
  /** The field name to compare */
  field: string
  /** The comparison strategy to use (e.g., 'exact', 'jaro-winkler') */
  strategy: MatchingStrategy
  /** Weight assigned to this field (contribution = similarity × weight) */
  weight: number
  /** Optional minimum similarity threshold (0-1) for this field to contribute */
  threshold?: number
  /** Additional options for the comparator */
  options?: ComparatorOptions
}

/** Options passed to comparators */
export type ComparatorOptions = Record<string, unknown>

/**
 * Detailed scoring information for a single field comparison.
 */
export interface FieldScore {
  /** The field name that was compared */
  field: string
  /** Similarity score from the comparator (0-1) */
  similarity: number
  /** Weight assigned to this field */
  weight: number
  /** Actual contribution to total score (similarity × weight, or 0 if below threshold) */
  contribution: number
  /** Minimum similarity threshold required (defaults to 0) */
  threshold: number
  /** Whether the similarity met the threshold requirement */
  metThreshold: boolean
  /** The comparison strategy used */
  strategy: MatchingStrategy
  /** Value from the left (candidate) record */
  leftValue?: unknown
  /** Value from the right (existing) record */
  rightValue?: unknown
  /** Normalized left value (only included if different from leftValue) */
  normalizedLeftValue?: unknown
  /** Normalized right value (only included if different from rightValue) */
  normalizedRightValue?: unknown
}

/**
 * Complete scoring result for a record comparison.
 */
export interface MatchScore {
  /** Sum of all field contributions */
  totalScore: number
  /** Sum of all field weights */
  maxPossibleScore: number
  /** Normalized score on 0-1 scale (totalScore / maxPossibleScore) */
  normalizedScore: number
  /** Detailed breakdown for each field comparison */
  fieldScores: FieldScore[]
}

/**
 * Three-tier outcome classification for matches.
 *
 * - `no-match`: Score below noMatch threshold - insufficient evidence
 * - `potential-match`: Score between thresholds - requires human review
 * - `definite-match`: Score above definiteMatch threshold - strong evidence
 */
export type MatchOutcome = 'no-match' | 'definite-match' | 'potential-match'

/**
 * Complete result for a single match comparison.
 *
 * @typeParam T - The type of the candidate record
 */
export interface MatchResult<T = unknown> {
  /** The outcome classification based on thresholds */
  outcome: MatchOutcome
  /** The candidate record that was matched against */
  candidateRecord: T
  /** Detailed scoring information */
  score: MatchScore
  /** Human-readable explanation of the match */
  explanation: string
}

/**
 * Threshold configuration for three-tier outcome classification.
 *
 * Scores are classified as:
 * - score < noMatch → 'no-match'
 * - score >= definiteMatch → 'definite-match'
 * - otherwise → 'potential-match'
 */
export interface MatchThresholds {
  /** Scores below this are classified as 'no-match' */
  noMatch: number
  /** Scores at or above this are classified as 'definite-match' */
  definiteMatch: number
}
