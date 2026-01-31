import type { MatchResult, FieldScore } from './types'

export class MatchExplainer {
  /**
   * Generates a human-readable explanation of how a match score was calculated.
   *
   * The explanation includes:
   * - Overall match outcome and score
   * - Field-by-field breakdown showing:
   *   - Values from both records
   *   - Similarity scores
   *   - Weight and contribution
   *   - Whether thresholds were met
   *
   * @param result - The match result to explain
   * @returns A formatted string explanation
   */
  explain(result: MatchResult): string {
    const lines: string[] = []

    lines.push(this.formatOutcome(result))
    lines.push('')
    lines.push('Field Comparisons:')

    for (const fieldScore of result.score.fieldScores) {
      lines.push(this.formatFieldScore(fieldScore))
    }

    return lines.join('\n')
  }

  /**
   * Formats the overall outcome and score summary.
   */
  private formatOutcome(result: MatchResult): string {
    const outcomeLabel = this.getOutcomeLabel(result.outcome)
    const score = result.score.totalScore.toFixed(1)
    const maxScore = result.score.maxPossibleScore.toFixed(1)

    return `Match Outcome: ${outcomeLabel} (Score: ${score}/${maxScore})`
  }

  /**
   * Converts outcome code to human-readable label.
   */
  private getOutcomeLabel(outcome: string): string {
    switch (outcome) {
      case 'no-match':
        return 'No Match'
      case 'definite-match':
        return 'Definite Match'
      case 'potential-match':
        return 'Potential Match'
      default:
        return outcome
    }
  }

  /**
   * Formats a single field score with all details.
   */
  private formatFieldScore(fieldScore: FieldScore): string {
    const lines: string[] = []

    const indicator = fieldScore.metThreshold ? '✓' : '✗'
    const similarity = fieldScore.similarity.toFixed(2)
    const weight = fieldScore.weight.toFixed(0)
    const contribution = fieldScore.contribution.toFixed(1)

    const similarityLabel = this.getSimilarityLabel(fieldScore.similarity)

    lines.push(
      `${indicator} ${fieldScore.field}: ${similarityLabel} (${similarity} × ${weight} = ${contribution})`
    )

    lines.push(
      `  Record A: ${this.formatValue(fieldScore.leftValue)}`
    )
    lines.push(
      `  Record B: ${this.formatValue(fieldScore.rightValue)}`
    )

    if (fieldScore.strategy !== 'exact') {
      lines.push(`  Strategy: ${fieldScore.strategy}`)
    }

    if (!fieldScore.metThreshold && fieldScore.threshold > 0) {
      lines.push(
        `  Below threshold: ${fieldScore.similarity.toFixed(2)} < ${fieldScore.threshold.toFixed(2)}`
      )
    }

    lines.push('')

    return lines.join('\n')
  }

  /**
   * Generates a descriptive label for the similarity score.
   */
  private getSimilarityLabel(similarity: number): string {
    if (similarity === 1.0) {
      return 'exact match'
    }
    if (similarity >= 0.9) {
      return 'very high similarity'
    }
    if (similarity >= 0.8) {
      return 'high similarity'
    }
    if (similarity >= 0.6) {
      return 'moderate similarity'
    }
    if (similarity >= 0.4) {
      return 'low similarity'
    }
    return 'no match'
  }

  /**
   * Formats a field value for display in the explanation.
   */
  private formatValue(value: unknown): string {
    if (value === null) {
      return 'null'
    }
    if (value === undefined) {
      return 'undefined'
    }
    if (typeof value === 'string') {
      return `"${value}"`
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value)
    }
    if (value instanceof Date) {
      return value.toISOString()
    }
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value)
      } catch {
        return '[object]'
      }
    }
    return String(value)
  }
}
