import type {
  FieldComparison,
  FieldScore,
  MatchScore,
  ComparatorOptions,
} from './types'
import {
  exactMatch,
  levenshtein,
  jaroWinkler,
  soundex,
  metaphone,
} from '../comparators'
import type {
  ExactMatchOptions,
  LevenshteinOptions,
  JaroWinklerOptions,
  SoundexOptions,
  MetaphoneOptions,
} from '../comparators'
import type { SchemaDefinition } from '../../types/schema'
import { applyNormalizer } from '../normalizers/registry'

export class ScoreCalculator {
  private schema?: SchemaDefinition<Record<string, unknown>>

  constructor(schema?: SchemaDefinition<Record<string, unknown>>) {
    this.schema = schema
  }
  /**
   * Calculates a weighted match score by comparing two records across multiple fields.
   *
   * @param record1 - First record to compare
   * @param record2 - Second record to compare
   * @param comparisons - Array of field comparison configurations
   * @returns Detailed match score with field-by-field breakdown
   */
  calculateScore(
    record1: Record<string, unknown>,
    record2: Record<string, unknown>,
    comparisons: FieldComparison[]
  ): MatchScore {
    const fieldScores: FieldScore[] = []
    let totalScore = 0
    let maxPossibleScore = 0

    for (const comparison of comparisons) {
      const leftValue = this.getFieldValue(record1, comparison.field)
      const rightValue = this.getFieldValue(record2, comparison.field)

      // Apply normalization
      const normalizedLeft = this.normalizeValue(leftValue, comparison.field)
      const normalizedRight = this.normalizeValue(rightValue, comparison.field)

      // Handle missing fields: if both are undefined, treat as a match by default
      let similarity: number
      if (normalizedLeft === undefined && normalizedRight === undefined) {
        const options = comparison.options as
          | { nullMatchesNull?: boolean }
          | undefined
        if (options?.nullMatchesNull === false) {
          similarity = 0
        } else {
          // Default behavior: undefined === undefined is a match
          similarity = 1
        }
      } else {
        similarity = this.compareValues(
          normalizedLeft,
          normalizedRight,
          comparison.strategy,
          comparison.options
        )
      }

      const threshold = comparison.threshold ?? 0
      const metThreshold = similarity >= threshold

      const contribution = metThreshold ? similarity * comparison.weight : 0

      const fieldScore: FieldScore = {
        field: comparison.field,
        similarity,
        weight: comparison.weight,
        contribution,
        threshold,
        metThreshold,
        strategy: comparison.strategy,
        leftValue,
        rightValue,
      }

      // Only include normalized values if they differ from originals
      if (normalizedLeft !== leftValue) {
        fieldScore.normalizedLeftValue = normalizedLeft
      }
      if (normalizedRight !== rightValue) {
        fieldScore.normalizedRightValue = normalizedRight
      }

      fieldScores.push(fieldScore)

      totalScore += contribution
      maxPossibleScore += comparison.weight
    }

    const normalizedScore =
      maxPossibleScore > 0 ? totalScore / maxPossibleScore : 0

    return {
      totalScore,
      maxPossibleScore,
      normalizedScore,
      fieldScores,
    }
  }

  /**
   * Retrieves a field value from a record, supporting dot notation for nested fields.
   *
   * @param record - The record to extract the value from
   * @param field - The field path (supports dot notation like "address.city")
   * @returns The field value, or undefined if not found
   */
  private getFieldValue(
    record: Record<string, unknown>,
    field: string
  ): unknown {
    return field
      .split('.')
      .reduce(
        (obj: unknown, key) => (obj as Record<string, unknown>)?.[key],
        record
      )
  }

  /**
   * Normalizes a field value using configured normalizers.
   *
   * @param value - The value to normalize
   * @param fieldName - The field name
   * @returns Normalized value, or original value if normalization fails or isn't configured
   */
  private normalizeValue(value: unknown, fieldName: string): unknown {
    if (!this.schema || value === undefined || value === null) {
      return value
    }

    const fieldDef = this.schema[fieldName as keyof typeof this.schema]
    if (!fieldDef) {
      return value
    }

    try {
      if (fieldDef.customNormalizer) {
        const result = fieldDef.customNormalizer(value)
        return result !== null ? result : value
      } else if (fieldDef.normalizer) {
        const result = applyNormalizer(
          value,
          fieldDef.normalizer,
          fieldDef.normalizerOptions
        )
        return result !== null ? result : value
      }
    } catch {
      // If normalizer fails, use original value
      return value
    }

    return value
  }

  /**
   * Compares two values using the specified comparison strategy.
   *
   * @param left - First value to compare
   * @param right - Second value to compare
   * @param strategy - Comparison strategy to use
   * @param options - Strategy-specific options
   * @returns Similarity score between 0 and 1
   */
  private compareValues(
    left: unknown,
    right: unknown,
    strategy: string,
    options?: ComparatorOptions
  ): number {
    switch (strategy) {
      case 'exact':
        return exactMatch(left, right, options as ExactMatchOptions)
      case 'levenshtein':
        return levenshtein(left, right, options as LevenshteinOptions)
      case 'jaro-winkler':
        return jaroWinkler(left, right, options as JaroWinklerOptions)
      case 'soundex':
        return soundex(left, right, options as SoundexOptions)
      case 'metaphone':
        return metaphone(left, right, options as MetaphoneOptions)
      default:
        throw new Error(`Unknown comparison strategy: ${strategy}`)
    }
  }
}
