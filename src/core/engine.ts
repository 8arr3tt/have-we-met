import type {
  FieldComparison,
  FieldMatchConfig,
  MatchingConfig,
  MatchScore,
  RecordPair,
} from '../types'
import { exactMatch } from './comparators'

/**
 * Core matching engine that compares two records using configured strategies.
 *
 * @typeParam T - The shape of the user's data object
 */
export class MatchingEngine<T extends object = object> {
  constructor(private config: MatchingConfig) {}

  /**
   * Compares two records and calculates a match score.
   *
   * @param pair - The pair of records to compare
   * @returns Match score with field-by-field breakdown
   */
  compare(pair: RecordPair<T>): MatchScore {
    const fieldComparisons: FieldComparison[] = []
    let totalWeight = 0
    let totalWeightedScore = 0

    for (const [field, fieldConfig] of this.config.fields) {
      const leftValue = this.getFieldValue(pair.left.data, field)
      const rightValue = this.getFieldValue(pair.right.data, field)

      const similarity = this.compareField(leftValue, rightValue, fieldConfig)
      const weightedScore = similarity * fieldConfig.weight

      fieldComparisons.push({
        field,
        similarity,
        weight: fieldConfig.weight,
        weightedScore,
        strategy: fieldConfig.strategy,
        leftValue,
        rightValue,
      })

      totalWeight += fieldConfig.weight
      totalWeightedScore += weightedScore
    }

    return {
      total: totalWeightedScore,
      normalizedTotal: totalWeight > 0 ? totalWeightedScore / totalWeight : 0,
      fieldComparisons,
    }
  }

  private compareField(
    left: unknown,
    right: unknown,
    config: FieldMatchConfig
  ): number {
    const similarity = exactMatch(left, right, {
      caseSensitive: config.caseSensitive ?? true,
    })

    if (config.threshold !== undefined && similarity < config.threshold) {
      return 0
    }

    return similarity
  }

  private getFieldValue(data: T, field: string): unknown {
    return field
      .split('.')
      .reduce(
        (obj: unknown, key) => (obj as Record<string, unknown>)?.[key],
        data
      )
  }
}
