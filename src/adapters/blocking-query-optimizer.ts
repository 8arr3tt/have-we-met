import type { BlockingStrategy } from '../core/blocking/types'

/**
 * Database dialect for generating database-specific index recommendations.
 */
export type DatabaseDialect = 'postgresql' | 'mysql' | 'sqlite' | 'generic'

/**
 * Index recommendation for optimizing blocking queries.
 */
export interface IndexRecommendation {
  /** Fields to include in the index */
  fields: string[]
  /** Type of index (btree, hash, etc.) */
  type: 'btree' | 'hash' | 'gin' | 'gist'
  /** Whether the index should be unique */
  unique: boolean
  /** Suggested index name */
  name: string
  /** SQL statement to create the index (database-specific) */
  sql: string
  /** Reason for this recommendation */
  reason: string
  /** Estimated performance improvement (1-10 scale) */
  priority: number
}

/**
 * Query cost estimation result.
 */
export interface QueryCostEstimate {
  /** Estimated number of database rows scanned */
  estimatedRowsScanned: number
  /** Estimated query execution time in milliseconds */
  estimatedTimeMs: number
  /** Whether an index would help */
  needsIndex: boolean
  /** Recommended indexes for this query */
  recommendedIndexes: IndexRecommendation[]
}

/**
 * Field selection recommendation for blocking.
 */
export interface FieldSelectionRecommendation {
  /** Recommended fields to use for blocking */
  recommendedFields: string[]
  /** Cardinality estimate for each field (unique values / total records) */
  estimatedCardinality: Record<string, number>
  /** Expected block size reduction */
  expectedReduction: number
  /** Explanation of the recommendation */
  explanation: string
}

/**
 * BlockingQueryOptimizer analyzes blocking strategies and provides recommendations
 * for database indexes, query optimization, and field selection.
 *
 * @example
 * ```typescript
 * const optimizer = new BlockingQueryOptimizer('postgresql')
 *
 * // Get index recommendations for a blocking strategy
 * const recommendations = optimizer.recommendIndexes(blockingStrategy, 'customers')
 *
 * // Estimate query cost
 * const cost = optimizer.estimateQueryCost(
 *   new Map([['lastName', 'Smith']]),
 *   1000000 // total records in table
 * )
 * ```
 */
export class BlockingQueryOptimizer {
  private dialect: DatabaseDialect

  constructor(dialect: DatabaseDialect = 'generic') {
    this.dialect = dialect
  }

  /**
   * Recommends database indexes for a blocking strategy.
   * Analyzes the strategy configuration and suggests optimal indexes.
   *
   * @param strategy - Blocking strategy to optimize
   * @param tableName - Database table name for index creation
   * @returns Array of index recommendations
   *
   * @example
   * ```typescript
   * const strategy = new StandardBlockingStrategy({ field: 'lastName', transform: 'soundex' })
   * const recommendations = optimizer.recommendIndexes(strategy, 'customers')
   * // Returns indexes for lastName field
   * ```
   */
  recommendIndexes(
    strategy: BlockingStrategy,
    tableName: string
  ): IndexRecommendation[] {
    const recommendations: IndexRecommendation[] = []
    const strategyName = strategy.name

    if (strategyName.startsWith('standard:')) {
      recommendations.push(
        ...this.recommendIndexesForStandard(strategy, tableName)
      )
    } else if (strategyName.startsWith('sorted-neighbourhood:')) {
      recommendations.push(
        ...this.recommendIndexesForSortedNeighbourhood(strategy, tableName)
      )
    } else if (strategyName.startsWith('composite:')) {
      recommendations.push(
        ...this.recommendIndexesForComposite(strategy, tableName)
      )
    }

    return recommendations
  }

  /**
   * Recommends indexes for standard blocking strategy.
   *
   * @param strategy - Standard blocking strategy
   * @param tableName - Table name
   * @returns Index recommendations
   */
  private recommendIndexesForStandard(
    strategy: BlockingStrategy,
    tableName: string
  ): IndexRecommendation[] {
    const recommendations: IndexRecommendation[] = []
    const fields = this.extractFieldsFromStrategyName(strategy.name)

    for (const field of fields) {
      const indexName = `idx_${tableName}_${field.replaceAll('.', '_')}`
      const sql = this.generateIndexSQL(tableName, [field], indexName, 'btree')

      recommendations.push({
        fields: [field],
        type: 'btree',
        unique: false,
        name: indexName,
        sql,
        reason: `Optimize blocking queries on ${field}`,
        priority: 9,
      })
    }

    return recommendations
  }

  /**
   * Recommends indexes for sorted neighbourhood strategy.
   *
   * @param strategy - Sorted neighbourhood strategy
   * @param tableName - Table name
   * @returns Index recommendations
   */
  private recommendIndexesForSortedNeighbourhood(
    strategy: BlockingStrategy,
    tableName: string
  ): IndexRecommendation[] {
    const recommendations: IndexRecommendation[] = []
    const fields = this.extractFieldsFromStrategyName(strategy.name)

    if (fields.length > 0) {
      const indexName = `idx_${tableName}_${fields.map((f) => f.replaceAll('.', '_')).join('_')}_sorted`
      const sql = this.generateIndexSQL(tableName, fields, indexName, 'btree')

      recommendations.push({
        fields,
        type: 'btree',
        unique: false,
        name: indexName,
        sql,
        reason: `Optimize sorted neighbourhood queries with ORDER BY on ${fields.join(', ')}`,
        priority: 10,
      })
    }

    return recommendations
  }

  /**
   * Recommends indexes for composite blocking strategy.
   *
   * @param strategy - Composite blocking strategy
   * @param tableName - Table name
   * @returns Index recommendations
   */
  private recommendIndexesForComposite(
    strategy: BlockingStrategy,
    tableName: string
  ): IndexRecommendation[] {
    const recommendations: IndexRecommendation[] = []
    const fields = this.extractFieldsFromStrategyName(strategy.name)

    if (strategy.name.includes('intersection') && fields.length > 1) {
      const indexName = `idx_${tableName}_${fields.map((f) => f.replaceAll('.', '_')).join('_')}_composite`
      const sql = this.generateIndexSQL(tableName, fields, indexName, 'btree')

      recommendations.push({
        fields,
        type: 'btree',
        unique: false,
        name: indexName,
        sql,
        reason: `Optimize composite intersection queries on ${fields.join(' AND ')}`,
        priority: 8,
      })
    } else {
      for (const field of fields) {
        const indexName = `idx_${tableName}_${field.replaceAll('.', '_')}`
        const sql = this.generateIndexSQL(
          tableName,
          [field],
          indexName,
          'btree'
        )

        recommendations.push({
          fields: [field],
          type: 'btree',
          unique: false,
          name: indexName,
          sql,
          reason: `Optimize composite union queries on ${field}`,
          priority: 7,
        })
      }
    }

    return recommendations
  }

  /**
   * Extracts field names from a strategy name.
   * Parses strategy naming convention to identify blocking fields.
   *
   * @param strategyName - Strategy name
   * @returns Array of field names
   */
  private extractFieldsFromStrategyName(strategyName: string): string[] {
    if (strategyName.startsWith('composite:')) {
      const bracketStart = strategyName.indexOf('[')
      const bracketEnd = strategyName.lastIndexOf(']')

      if (bracketStart === -1 || bracketEnd === -1) {
        return []
      }

      const innerStrategies = strategyName.slice(bracketStart + 1, bracketEnd)
      const fields: string[] = []

      const strategies = innerStrategies.split('+')
      for (const strategy of strategies) {
        const strategyFields = this.extractFieldsFromSingleStrategy(
          strategy.trim()
        )
        fields.push(...strategyFields)
      }

      return [...new Set(fields)]
    }

    return this.extractFieldsFromSingleStrategy(strategyName)
  }

  /**
   * Extracts field names from a single (non-composite) strategy name.
   *
   * @param strategyName - Single strategy name
   * @returns Array of field names
   */
  private extractFieldsFromSingleStrategy(strategyName: string): string[] {
    if (strategyName.startsWith('sorted-neighbourhood:')) {
      const parts = strategyName.split(':w')
      if (parts.length > 0) {
        const fieldPart = parts[0].replace('sorted-neighbourhood:', '')
        if (fieldPart.includes('+')) {
          return fieldPart.split('+')
        }
        return [fieldPart]
      }
      return []
    }

    if (strategyName.startsWith('standard:')) {
      const withoutPrefix = strategyName.substring('standard:'.length)
      const parts = withoutPrefix.split(':')

      if (parts[0].includes('+')) {
        return parts[0].split('+')
      }

      return [parts[0]]
    }

    return []
  }

  /**
   * Generates SQL for creating an index.
   *
   * @param tableName - Table name
   * @param fields - Field names
   * @param indexName - Index name
   * @param indexType - Index type
   * @returns SQL CREATE INDEX statement
   */
  private generateIndexSQL(
    tableName: string,
    fields: string[],
    indexName: string,
    indexType: 'btree' | 'hash' | 'gin' | 'gist'
  ): string {
    const fieldList = fields.join(', ')

    switch (this.dialect) {
      case 'postgresql':
        return `CREATE INDEX ${indexName} ON ${tableName} USING ${indexType} (${fieldList});`
      case 'mysql':
        return `CREATE INDEX ${indexName} ON ${tableName} (${fieldList}) USING ${indexType.toUpperCase()};`
      case 'sqlite':
        return `CREATE INDEX ${indexName} ON ${tableName} (${fieldList});`
      default:
        return `CREATE INDEX ${indexName} ON ${tableName} (${fieldList});`
    }
  }

  /**
   * Estimates the cost of a query based on blocking keys and record count.
   *
   * @param blockingKeys - Blocking keys for the query
   * @param totalRecordCount - Total number of records in the table
   * @param hasIndex - Whether an index exists on blocking fields
   * @returns Query cost estimation
   *
   * @example
   * ```typescript
   * const cost = optimizer.estimateQueryCost(
   *   new Map([['lastName', 'Smith']]),
   *   1000000,
   *   true
   * )
   * // Returns estimated rows scanned and execution time
   * ```
   */
  estimateQueryCost(
    blockingKeys: Map<string, unknown>,
    totalRecordCount: number,
    hasIndex = false
  ): QueryCostEstimate {
    const numBlockingFields = blockingKeys.size

    if (numBlockingFields === 0) {
      return {
        estimatedRowsScanned: totalRecordCount,
        estimatedTimeMs: this.estimateFullScanTime(totalRecordCount),
        needsIndex: true,
        recommendedIndexes: [],
      }
    }

    let estimatedRowsScanned: number
    let estimatedTimeMs: number

    if (hasIndex) {
      estimatedRowsScanned = Math.ceil(
        totalRecordCount / Math.pow(10, numBlockingFields)
      )
      estimatedTimeMs = Math.max(1, estimatedRowsScanned * 0.001)
    } else {
      estimatedRowsScanned = totalRecordCount
      estimatedTimeMs = this.estimateFullScanTime(totalRecordCount)
    }

    return {
      estimatedRowsScanned,
      estimatedTimeMs,
      needsIndex: !hasIndex && totalRecordCount > 10000,
      recommendedIndexes: [],
    }
  }

  /**
   * Estimates full table scan time based on record count.
   *
   * @param recordCount - Number of records
   * @returns Estimated time in milliseconds
   */
  private estimateFullScanTime(recordCount: number): number {
    return Math.max(10, recordCount * 0.01)
  }

  /**
   * Selects the best blocking fields for performance based on cardinality estimates.
   *
   * @param fieldCardinalities - Map of field names to their cardinality (uniqueness ratio)
   * @param maxFields - Maximum number of fields to select
   * @returns Field selection recommendation
   *
   * @example
   * ```typescript
   * const cardinalities = {
   *   email: 0.95,      // Very unique
   *   lastName: 0.01,   // Low uniqueness
   *   firstName: 0.005, // Very low uniqueness
   *   zipCode: 0.001    // Extremely low uniqueness
   * }
   * const recommendation = optimizer.selectBestBlockingFields(cardinalities, 2)
   * // Returns: { recommendedFields: ['email', 'lastName'], ... }
   * ```
   */
  selectBestBlockingFields(
    fieldCardinalities: Record<string, number>,
    maxFields = 3
  ): FieldSelectionRecommendation {
    const fields = Object.entries(fieldCardinalities)
      .sort((a, b) => {
        const cardinalityScore = b[1] - a[1]
        return cardinalityScore
      })
      .slice(0, maxFields)

    const recommendedFields = fields.map(([field]) => field)
    const estimatedCardinality = Object.fromEntries(fields)

    const expectedReduction =
      fields.reduce((acc, [, cardinality]) => acc * (1 - cardinality), 1) * 100

    let explanation = `Selected ${recommendedFields.length} field(s) with best cardinality: `
    explanation += recommendedFields
      .map(
        (field) => `${field} (${(fieldCardinalities[field] * 100).toFixed(1)}%)`
      )
      .join(', ')
    explanation += `. Expected to reduce comparisons by ~${(100 - expectedReduction).toFixed(1)}%.`

    return {
      recommendedFields,
      estimatedCardinality,
      expectedReduction: 100 - expectedReduction,
      explanation,
    }
  }
}
