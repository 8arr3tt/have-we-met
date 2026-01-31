import type { BlockingStrategy } from '../../core/blocking/types'
import { BlockingQueryOptimizer } from '../blocking-query-optimizer'
import type { IndexRecommendation } from '../blocking-query-optimizer'

/**
 * Database dialect for generating database-specific index recommendations.
 */
export type DatabaseDialect = 'postgresql' | 'mysql' | 'sqlite' | 'generic'

/**
 * Schema field definition for index analysis.
 */
export interface SchemaField {
  name: string
  type: string
  indexed?: boolean
}

/**
 * Query pattern for analysis.
 */
export interface QueryPattern {
  fields: string[]
  frequency: number
  filterOperators?: Array<'eq' | 'in' | 'like' | 'gt' | 'lt'>
}

/**
 * Index suggestion with SQL statements.
 */
export interface IndexSuggestion {
  indexName: string
  fields: string[]
  sql: string
  reason: string
  priority: number
  estimatedImprovement: string
}

/**
 * IndexAnalyzer analyzes database schemas and query patterns to provide
 * index recommendations for optimal performance with blocking strategies.
 *
 * @example
 * ```typescript
 * const analyzer = new IndexAnalyzer('postgresql')
 *
 * // Analyze a blocking strategy
 * const recommendations = analyzer.analyzeBlockingStrategy(
 *   blockingStrategy,
 *   'customers'
 * )
 *
 * // Generate index creation statements
 * const suggestions = analyzer.generateIndexSuggestions(
 *   schema,
 *   blockingStrategy
 * )
 *
 * // Execute the SQL
 * for (const suggestion of suggestions) {
 *   console.log(suggestion.sql)
 * }
 * ```
 */
export class IndexAnalyzer {
  private dialect: DatabaseDialect
  private optimizer: BlockingQueryOptimizer

  constructor(dialect: DatabaseDialect = 'generic') {
    this.dialect = dialect
    this.optimizer = new BlockingQueryOptimizer(dialect)
  }

  /**
   * Analyzes a blocking strategy and returns index recommendations.
   *
   * @param strategy - Blocking strategy to analyze
   * @param tableName - Database table name
   * @returns Array of index recommendations
   *
   * @example
   * ```typescript
   * const strategy = new StandardBlockingStrategy({ field: 'lastName' })
   * const recommendations = analyzer.analyzeBlockingStrategy(strategy, 'customers')
   * // Returns: [{ fields: ['lastName'], type: 'btree', ... }]
   * ```
   */
  analyzeBlockingStrategy(
    strategy: BlockingStrategy,
    tableName: string
  ): IndexRecommendation[] {
    return this.optimizer.recommendIndexes(strategy, tableName)
  }

  /**
   * Analyzes query patterns to identify slow queries and recommend indexes.
   *
   * @param queries - Array of query patterns with frequency
   * @param tableName - Database table name
   * @param existingIndexes - Currently existing index fields
   * @returns Array of index recommendations for slow queries
   *
   * @example
   * ```typescript
   * const queries = [
   *   { fields: ['lastName'], frequency: 1000 },
   *   { fields: ['email'], frequency: 500 }
   * ]
   * const slow = analyzer.analyzeQueryPattern(queries, 'customers', [])
   * // Returns indexes for frequently queried fields
   * ```
   */
  analyzeQueryPattern(
    queries: QueryPattern[],
    tableName: string,
    existingIndexes: string[][] = []
  ): IndexRecommendation[] {
    const recommendations: IndexRecommendation[] = []
    const existingIndexSet = new Set(
      existingIndexes.map((fields) => fields.sort().join(','))
    )

    const sortedQueries = queries.sort((a, b) => b.frequency - a.frequency)

    for (const query of sortedQueries) {
      const fieldKey = query.fields.sort().join(',')

      if (existingIndexSet.has(fieldKey)) {
        continue
      }

      if (query.frequency < 10) {
        continue
      }

      const indexName = `idx_${tableName}_${query.fields.map((f) => f.replaceAll('.', '_')).join('_')}`
      const indexType = this.selectIndexType(query)
      const sql = this.generateIndexSQL(tableName, query.fields, indexName, indexType)

      const priority = this.calculatePriority(query.frequency, query.fields.length)

      recommendations.push({
        fields: query.fields,
        type: indexType,
        unique: false,
        name: indexName,
        sql,
        reason: `Optimize frequent queries on ${query.fields.join(', ')} (${query.frequency} times)`,
        priority,
      })

      existingIndexSet.add(fieldKey)
    }

    return recommendations
  }

  /**
   * Generates index suggestions based on schema and blocking configuration.
   *
   * @param schema - Array of schema field definitions
   * @param blocking - Blocking strategy
   * @returns Array of index suggestions with SQL
   *
   * @example
   * ```typescript
   * const schema = [
   *   { name: 'firstName', type: 'string' },
   *   { name: 'lastName', type: 'string' },
   *   { name: 'email', type: 'string' }
   * ]
   * const suggestions = analyzer.generateIndexSuggestions(schema, blockingStrategy)
   * // Returns: [{ sql: 'CREATE INDEX ...', reason: '...', ... }]
   * ```
   */
  generateIndexSuggestions(
    schema: SchemaField[],
    blocking: BlockingStrategy
  ): IndexSuggestion[] {
    const tableName = 'records'
    const recommendations = this.analyzeBlockingStrategy(blocking, tableName)

    const suggestions: IndexSuggestion[] = recommendations.map((rec) => {
      const estimatedImprovement = this.estimateImprovement(rec.priority)

      return {
        indexName: rec.name,
        fields: rec.fields,
        sql: rec.sql,
        reason: rec.reason,
        priority: rec.priority,
        estimatedImprovement,
      }
    })

    const indexedFields = new Set(schema.filter((f) => f.indexed).map((f) => f.name))
    return suggestions.filter((s) => !s.fields.every((f) => indexedFields.has(f)))
  }

  /**
   * Selects the appropriate index type based on query pattern.
   *
   * @param query - Query pattern
   * @returns Recommended index type
   */
  private selectIndexType(query: QueryPattern): 'btree' | 'hash' | 'gin' | 'gist' {
    if (query.filterOperators?.includes('like')) {
      return this.dialect === 'postgresql' ? 'gin' : 'btree'
    }

    if (query.filterOperators?.includes('eq') && !query.filterOperators.some((op) => op === 'gt' || op === 'lt')) {
      return this.dialect === 'postgresql' || this.dialect === 'mysql' ? 'hash' : 'btree'
    }

    return 'btree'
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
        if (indexType === 'gin' || indexType === 'gist') {
          return `CREATE INDEX ${indexName} ON ${tableName} (${fieldList}) USING BTREE;`
        }
        return `CREATE INDEX ${indexName} ON ${tableName} (${fieldList}) USING ${indexType.toUpperCase()};`
      case 'sqlite':
        return `CREATE INDEX ${indexName} ON ${tableName} (${fieldList});`
      default:
        return `CREATE INDEX ${indexName} ON ${tableName} (${fieldList});`
    }
  }

  /**
   * Calculates priority score for an index recommendation.
   *
   * @param frequency - Query frequency
   * @param fieldCount - Number of fields in the index
   * @returns Priority score (1-10)
   */
  private calculatePriority(frequency: number, fieldCount: number): number {
    let priority = Math.min(10, Math.floor(frequency / 100))

    if (fieldCount > 3) {
      priority = Math.max(1, priority - 2)
    }

    return Math.max(1, priority)
  }

  /**
   * Estimates performance improvement from an index.
   *
   * @param priority - Index priority
   * @returns Human-readable improvement estimate
   */
  private estimateImprovement(priority: number): string {
    if (priority >= 9) {
      return '10-100x faster'
    } else if (priority >= 7) {
      return '5-10x faster'
    } else if (priority >= 5) {
      return '2-5x faster'
    } else {
      return '1.5-2x faster'
    }
  }
}
