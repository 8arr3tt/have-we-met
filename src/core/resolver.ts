import type {
  MatchCandidate,
  MatchExplanation,
  MatchOutcome,
  MatchResult,
  MatchScore,
  Record,
  ResolverConfig,
  ResolverOptions,
  ThresholdConfig,
} from '../types'
import { MatchingEngine } from './engine'

/**
 * Main resolver class that orchestrates matching and determines outcomes.
 *
 * @typeParam T - The shape of the user's data object
 */
export class Resolver<T extends object = object> {
  private engine: MatchingEngine<T>
  private thresholds: ThresholdConfig

  constructor(config: ResolverConfig<T>) {
    this.engine = new MatchingEngine<T>(config.matching, config.schema, config.blocking)
    this.thresholds = config.matching.thresholds
  }

  /**
   * Resolves an input record against a list of candidates.
   *
   * @param input - The record to match
   * @param candidates - List of potential matching records
   * @param options - Runtime options
   * @returns Match result with outcome, candidates, and best match
   */
  resolve(
    input: Record<T>,
    candidates: Record<T>[],
    options: ResolverOptions = {}
  ): MatchResult<T> {
    const { maxCandidates = 10, returnExplanation = true } = options

    const scoredCandidates = candidates
      .map((candidate) =>
        this.scoreCandidate(input, candidate, returnExplanation)
      )
      .filter((c) => c.score.total > 0)
      .sort((a, b) => b.score.total - a.score.total)
      .slice(0, maxCandidates)

    const outcome = this.determineOutcome(scoredCandidates)
    const bestMatch = scoredCandidates[0] ?? null

    return {
      outcome,
      candidates: scoredCandidates,
      bestMatch,
      inputRecord: input,
      processedAt: new Date(),
    }
  }

  private determineOutcome(candidates: MatchCandidate<T>[]): MatchOutcome {
    if (candidates.length === 0) return 'new'

    const bestScore = candidates[0].score.total

    if (bestScore >= this.thresholds.definiteMatch) return 'match'
    if (bestScore >= this.thresholds.noMatch) return 'review'
    return 'new'
  }

  private scoreCandidate(
    input: Record<T>,
    candidate: Record<T>,
    includeExplanation: boolean
  ): MatchCandidate<T> {
    const score = this.engine.compare({ left: input, right: candidate })

    return {
      record: candidate,
      score,
      explanation: includeExplanation
        ? this.generateExplanation(score)
        : { summary: '', fieldComparisons: [], appliedRules: [] },
    }
  }

  private generateExplanation(score: MatchScore): MatchExplanation {
    const matchingFields = score.fieldComparisons
      .filter((fc) => fc.similarity > 0)
      .map((fc) => fc.field)

    const summary =
      matchingFields.length > 0
        ? `Matched on: ${matchingFields.join(', ')}`
        : 'No matching fields'

    return {
      summary,
      fieldComparisons: score.fieldComparisons,
      appliedRules: [],
    }
  }
}
