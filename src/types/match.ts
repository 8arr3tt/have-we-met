import type { Record } from './record'

/**
 * The outcome of a match resolution.
 * - `'new'` - No matching records found, treat as new record
 * - `'match'` - High confidence match found
 * - `'review'` - Uncertain match, requires human review
 */
export type MatchOutcome = 'new' | 'match' | 'review'

/**
 * Result of comparing a single field between two records.
 * Contains the similarity score, weight contribution, and the actual values compared.
 */
export interface FieldComparison {
  /** Name of the field being compared */
  field: string
  /** Similarity score between 0 and 1 */
  similarity: number
  /** Weight assigned to this field in the matching configuration */
  weight: number
  /** Weighted contribution to total score (similarity * weight) */
  weightedScore: number
  /** Strategy used for comparison (e.g., 'exact', 'jaro-winkler') */
  strategy: string
  /** Value from the left/input record */
  leftValue: unknown
  /** Value from the right/candidate record */
  rightValue: unknown
  /** Normalized value from the left/input record (after normalizer applied) */
  normalizedLeftValue?: unknown
  /** Normalized value from the right/candidate record (after normalizer applied) */
  normalizedRightValue?: unknown
}

/**
 * Aggregate score from comparing all configured fields between two records.
 */
export interface MatchScore {
  /** Sum of all weighted field scores */
  total: number
  /** Normalized total on a 0-1 scale (total / max possible score) */
  normalizedTotal: number
  /** Breakdown of individual field comparisons */
  fieldComparisons: FieldComparison[]
}

/**
 * Human-readable explanation of why a match decision was made.
 * Useful for debugging and for presenting match decisions to end users.
 */
export interface MatchExplanation {
  /** Brief summary of the match (e.g., "High confidence match on email and phone") */
  summary: string
  /** Detailed breakdown of field comparisons */
  fieldComparisons: FieldComparison[]
  /** List of deterministic rules that matched, if any */
  appliedRules: string[]
}

/**
 * A potential match candidate with its score and explanation.
 *
 * @typeParam T - The shape of the user's data object
 */
export interface MatchCandidate<T extends object = object> {
  /** The candidate record that was compared */
  record: Record<T>
  /** Computed match score */
  score: MatchScore
  /** Human-readable explanation of the match */
  explanation: MatchExplanation
}

/**
 * Complete result of resolving an input record against a set of candidates.
 * Contains the outcome decision, ranked candidates, and processing metadata.
 *
 * @typeParam T - The shape of the user's data object
 */
export interface MatchResult<T extends object = object> {
  /** The determined outcome: new record, definite match, or needs review */
  outcome: MatchOutcome
  /** All candidates that scored above zero, sorted by score descending */
  candidates: MatchCandidate<T>[]
  /** The highest scoring candidate, or null if no candidates matched */
  bestMatch: MatchCandidate<T> | null
  /** The input record that was resolved */
  inputRecord: Record<T>
  /** Timestamp when the resolution was performed */
  processedAt: Date
}
