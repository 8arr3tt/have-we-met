import type { MatchScore, MatchThresholds, MatchOutcome } from './types'

export class OutcomeClassifier {
  /**
   * Classifies a match score into one of three outcomes based on configured thresholds.
   *
   * The three-tier classification:
   * - `'no-match'`: Score is below the noMatch threshold
   * - `'definite-match'`: Score meets or exceeds the definiteMatch threshold
   * - `'potential-match'`: Score falls between the two thresholds (requires human review)
   *
   * @param score - The match score to classify
   * @param thresholds - The threshold configuration
   * @returns The match outcome
   */
  classify(score: MatchScore, thresholds: MatchThresholds): MatchOutcome {
    if (score.totalScore < thresholds.noMatch) {
      return 'no-match'
    }

    if (score.totalScore >= thresholds.definiteMatch) {
      return 'definite-match'
    }

    return 'potential-match'
  }
}
