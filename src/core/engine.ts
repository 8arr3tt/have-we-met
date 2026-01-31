import type {
  FieldComparison,
  FieldMatchConfig,
  MatchingConfig,
  MatchScore,
  RecordPair,
  SchemaDefinition,
} from '../types'
import {
  exactMatch,
  levenshtein,
  jaroWinkler,
  soundex,
  metaphone,
} from './comparators'
import { getNormalizer } from './normalizers/registry'
import type { BlockingConfig, BlockingStats } from './blocking/types'
import { BlockGenerator } from './blocking/block-generator'

/**
 * Core matching engine that compares two records using configured strategies.
 * Supports optional blocking to reduce the number of comparisons.
 *
 * @typeParam T - The shape of the user's data object
 */
export class MatchingEngine<T extends object = object> {
  private blockGenerator: BlockGenerator

  constructor(
    private config: MatchingConfig,
    private schema?: SchemaDefinition<T>,
    private blockingConfig?: BlockingConfig<T>
  ) {
    this.blockGenerator = new BlockGenerator()
  }

  /**
   * Gets blocking statistics for a set of records.
   * Returns null if blocking is not configured.
   *
   * @param records - Array of records to analyze
   * @returns Blocking statistics or null
   */
  getBlockingStats(records: Array<T>): BlockingStats | null {
    if (!this.blockingConfig || this.blockingConfig.strategies.length === 0) {
      return null
    }

    const blocks = this.generateBlocks(records)
    return this.blockGenerator.calculateStats(blocks)
  }

  /**
   * Generates blocks from records using configured blocking strategies.
   * Returns an empty map if blocking is not configured.
   *
   * @param records - Array of records to block
   * @returns Block set
   */
  private generateBlocks(records: Array<T>) {
    if (!this.blockingConfig || this.blockingConfig.strategies.length === 0) {
      return new Map()
    }

    // Use composite or single strategy based on configuration
    if (
      this.blockingConfig.mode === 'composite' ||
      this.blockingConfig.mode === 'union' ||
      this.blockingConfig.strategies.length > 1
    ) {
      return this.blockGenerator.generateBlocksComposite(
        records,
        this.blockingConfig.strategies
      )
    } else {
      return this.blockGenerator.generateBlocks(
        records,
        this.blockingConfig.strategies[0]
      )
    }
  }

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

      // Apply normalization before comparison
      const normalizedLeft = this.normalizeValue(leftValue, field)
      const normalizedRight = this.normalizeValue(rightValue, field)

      const similarity = this.compareField(
        normalizedLeft,
        normalizedRight,
        fieldConfig
      )
      const weightedScore = similarity * fieldConfig.weight

      // Only include normalized values if they differ from originals
      const comparison: FieldComparison = {
        field,
        similarity,
        weight: fieldConfig.weight,
        weightedScore,
        strategy: fieldConfig.strategy,
        leftValue,
        rightValue,
      }

      if (normalizedLeft !== leftValue) {
        comparison.normalizedLeftValue = normalizedLeft
      }
      if (normalizedRight !== rightValue) {
        comparison.normalizedRightValue = normalizedRight
      }

      fieldComparisons.push(comparison)

      totalWeight += fieldConfig.weight
      totalWeightedScore += weightedScore
    }

    return {
      total: totalWeightedScore,
      normalizedTotal: totalWeight > 0 ? totalWeightedScore / totalWeight : 0,
      fieldComparisons,
    }
  }

  /**
   * Normalizes a field value using configured normalizers.
   * Applies custom normalizer or named normalizer from registry.
   * Returns the original value if normalization fails or is not configured.
   *
   * @param value - The value to normalize
   * @param fieldName - The name of the field being normalized
   * @returns Normalized value, or original value if normalization fails
   */
  private normalizeValue(value: unknown, fieldName: string): unknown {
    // Return early if no schema defined
    if (!this.schema) {
      return value
    }

    // Get field definition from schema
    const fieldDef = this.schema[fieldName as keyof T]
    if (!fieldDef) {
      return value
    }

    // Option 1: Custom normalizer function takes precedence
    if (fieldDef.customNormalizer) {
      try {
        const result = fieldDef.customNormalizer(value)
        return result !== null ? result : value
      } catch (error) {
        console.warn(
          `Custom normalizer failed for field '${fieldName}':`,
          error instanceof Error ? error.message : error
        )
        return value
      }
    }

    // Option 2: Named normalizer from registry
    if (fieldDef.normalizer) {
      const normalizerFn = getNormalizer(fieldDef.normalizer)

      if (!normalizerFn) {
        console.warn(
          `Normalizer '${fieldDef.normalizer}' not found for field '${fieldName}'. Using original value.`
        )
        return value
      }

      try {
        const result = normalizerFn(value, fieldDef.normalizerOptions)
        return result !== null ? result : value
      } catch (error) {
        console.warn(
          `Normalizer '${fieldDef.normalizer}' failed for field '${fieldName}':`,
          error instanceof Error ? error.message : error
        )
        return value
      }
    }

    // No normalization configured
    return value
  }

  private compareField(
    left: unknown,
    right: unknown,
    config: FieldMatchConfig
  ): number {
    let similarity: number

    switch (config.strategy) {
      case 'exact':
        similarity = exactMatch(left, right, {
          caseSensitive: config.caseSensitive ?? true,
        })
        break
      case 'levenshtein':
        similarity = levenshtein(left, right, config.levenshteinOptions)
        break
      case 'jaro-winkler':
        similarity = jaroWinkler(left, right, config.jaroWinklerOptions)
        break
      case 'soundex':
        similarity = soundex(left, right, config.soundexOptions)
        break
      case 'metaphone':
        similarity = metaphone(left, right, config.metaphoneOptions)
        break
      default: {
        // TypeScript exhaustiveness check
        const _exhaustive: never = config.strategy
        throw new Error(`Unknown strategy: ${_exhaustive}`)
      }
    }

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
