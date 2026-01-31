/**
 * Query execution statistics.
 */
export interface QueryStats {
  /** Query execution time in milliseconds */
  executionTimeMs: number
  /** Number of rows scanned */
  rowsScanned: number
  /** Number of rows returned */
  rowsReturned: number
  /** Whether an index was used */
  indexUsed: boolean
  /** Name of the index used, if any */
  indexName?: string
  /** Timestamp when the query was executed */
  timestamp: Date
}

/**
 * Database query plan information.
 */
export interface QueryPlan {
  /** Type of scan (seq_scan, index_scan, etc.) */
  scanType: string
  /** Estimated cost */
  cost: number
  /** Estimated rows */
  rows: number
  /** Indexes used */
  indexes: string[]
  /** Full query plan details (database-specific) */
  details: unknown
}

/**
 * Profile result containing stats and recommendations.
 */
export interface ProfileResult {
  /** Query execution statistics */
  stats: QueryStats
  /** Detected performance issues */
  issues: string[]
  /** Recommendations for improvement */
  recommendations: string[]
  /** Severity level (low, medium, high, critical) */
  severity: 'low' | 'medium' | 'high' | 'critical'
}

/**
 * QueryProfiler profiles database queries to identify performance issues
 * and provide optimization recommendations.
 *
 * @example
 * ```typescript
 * const profiler = new QueryProfiler()
 *
 * // Profile a query
 * const result = await profiler.profile(async () => {
 *   return await db.query('SELECT * FROM customers WHERE lastName = ?', ['Smith'])
 * })
 *
 * if (result.severity === 'high') {
 *   console.log('Performance issues detected:')
 *   result.issues.forEach(issue => console.log(`- ${issue}`))
 *   console.log('Recommendations:')
 *   result.recommendations.forEach(rec => console.log(`- ${rec}`))
 * }
 * ```
 */
export class QueryProfiler {
  private queryHistory: QueryStats[] = []
  private readonly maxHistorySize = 100

  /**
   * Profiles a query execution and provides performance analysis.
   *
   * @param queryFn - Async function that executes the query
   * @param metadata - Optional metadata about the query
   * @returns Profile result with stats and recommendations
   *
   * @example
   * ```typescript
   * const result = await profiler.profile(
   *   async () => adapter.findByBlockingKeys(keys),
   *   { queryType: 'blocking', tableName: 'customers' }
   * )
   * ```
   */
  async profile<T>(
    queryFn: () => Promise<T>,
    metadata?: { queryType?: string; tableName?: string }
  ): Promise<ProfileResult> {
    const startTime = Date.now()
    const startMemory = this.getMemoryUsage()

    let result: T | undefined
    let error: Error | undefined

    try {
      result = await queryFn()
    } catch (err) {
      error = err as Error
    }

    const endTime = Date.now()
    const endMemory = this.getMemoryUsage()
    const executionTimeMs = endTime - startTime
    const memoryDelta = endMemory - startMemory

    const stats: QueryStats = {
      executionTimeMs,
      rowsScanned: 0,
      rowsReturned: Array.isArray(result) ? result.length : result ? 1 : 0,
      indexUsed: false,
      timestamp: new Date(),
    }

    this.addToHistory(stats)

    const issues = this.detectIssues(stats, memoryDelta, error)
    const recommendations = this.generateRecommendations(issues, stats, metadata)
    const severity = this.calculateSeverity(issues, stats)

    if (error) {
      throw error
    }

    return {
      stats,
      issues,
      recommendations,
      severity,
    }
  }

  /**
   * Gets a simulated query plan (for databases that support EXPLAIN).
   * Note: This is a stub implementation. Real implementation would need
   * database-specific EXPLAIN functionality.
   *
   * @param query - SQL query string
   * @returns Query plan information
   *
   * @example
   * ```typescript
   * const plan = profiler.explain('SELECT * FROM customers WHERE lastName = ?')
   * console.log(`Scan type: ${plan.scanType}`)
   * console.log(`Using indexes: ${plan.indexes.join(', ')}`)
   * ```
   */
  explain(query: string): QueryPlan {
    const usesWhere = query.toLowerCase().includes('where')
    const usesJoin = query.toLowerCase().includes('join')
    const fieldMatch = usesWhere && query.match(/where\s+(\w+)\s*=/i)
    const hasIndex = fieldMatch ? fieldMatch[1] : null

    return {
      scanType: hasIndex ? 'index_scan' : 'seq_scan',
      cost: hasIndex ? 10 : 100,
      rows: hasIndex ? 100 : 10000,
      indexes: hasIndex ? [`idx_${hasIndex}`] : [],
      details: {
        note: 'This is a simulated query plan. For real plans, integrate with database EXPLAIN functionality.',
        hasWhere: usesWhere,
        hasJoin: usesJoin,
      },
    }
  }

  /**
   * Returns the query execution history.
   *
   * @param limit - Maximum number of entries to return
   * @returns Array of query statistics
   *
   * @example
   * ```typescript
   * const history = profiler.getHistory(10)
   * const avgTime = history.reduce((sum, s) => sum + s.executionTimeMs, 0) / history.length
   * console.log(`Average query time: ${avgTime}ms`)
   * ```
   */
  getHistory(limit?: number): QueryStats[] {
    const history = [...this.queryHistory]
    return limit ? history.slice(-limit) : history
  }

  /**
   * Clears the query history.
   */
  clearHistory(): void {
    this.queryHistory = []
  }

  /**
   * Calculates average query execution time from history.
   *
   * @returns Average execution time in milliseconds
   */
  getAverageExecutionTime(): number {
    if (this.queryHistory.length === 0) return 0
    const total = this.queryHistory.reduce((sum, stat) => sum + stat.executionTimeMs, 0)
    return total / this.queryHistory.length
  }

  /**
   * Identifies queries that are slower than average.
   *
   * @param threshold - Multiplier for average time (default: 2x)
   * @returns Array of slow query statistics
   *
   * @example
   * ```typescript
   * const slowQueries = profiler.getSlowQueries(3)
   * console.log(`Found ${slowQueries.length} queries over 3x average time`)
   * ```
   */
  getSlowQueries(threshold = 2): QueryStats[] {
    const avgTime = this.getAverageExecutionTime()
    return this.queryHistory.filter((stat) => stat.executionTimeMs > avgTime * threshold)
  }

  /**
   * Gets current memory usage in MB.
   */
  private getMemoryUsage(): number {
    if (typeof globalThis !== 'undefined' && 'process' in globalThis) {
      const proc = (globalThis as { process?: { memoryUsage?: () => { heapUsed: number } } }).process
      if (proc?.memoryUsage) {
        return proc.memoryUsage().heapUsed / 1024 / 1024
      }
    }
    return 0
  }

  /**
   * Adds query stats to history.
   */
  private addToHistory(stats: QueryStats): void {
    this.queryHistory.push(stats)
    if (this.queryHistory.length > this.maxHistorySize) {
      this.queryHistory.shift()
    }
  }

  /**
   * Detects performance issues from query stats.
   */
  private detectIssues(
    stats: QueryStats,
    memoryDelta: number,
    error?: Error
  ): string[] {
    const issues: string[] = []

    if (error) {
      issues.push(`Query failed with error: ${error.message}`)
    }

    if (stats.executionTimeMs > 1000) {
      issues.push(`Slow query: ${stats.executionTimeMs}ms execution time`)
    }

    if (stats.executionTimeMs > 100 && stats.rowsReturned < 10) {
      issues.push(`Inefficient query: ${stats.executionTimeMs}ms for only ${stats.rowsReturned} rows`)
    }

    if (stats.rowsReturned > 10000) {
      issues.push(`Large result set: ${stats.rowsReturned} rows returned`)
    }

    if (memoryDelta > 100) {
      issues.push(`High memory usage: ${memoryDelta.toFixed(2)}MB increase`)
    }

    if (!stats.indexUsed && stats.executionTimeMs > 50) {
      issues.push('No index used for query')
    }

    const avgTime = this.getAverageExecutionTime()
    if (avgTime > 0 && stats.executionTimeMs > avgTime * 3) {
      issues.push(`Query is ${(stats.executionTimeMs / avgTime).toFixed(1)}x slower than average`)
    }

    return issues
  }

  /**
   * Generates recommendations based on detected issues.
   */
  private generateRecommendations(
    issues: string[],
    stats: QueryStats,
    metadata?: { queryType?: string; tableName?: string }
  ): string[] {
    const recommendations: string[] = []

    if (issues.some((i) => i.includes('Slow query'))) {
      recommendations.push('Consider adding indexes on frequently queried fields')
      if (metadata?.tableName) {
        recommendations.push(`Review blocking strategy for the ${metadata.tableName} table`)
      }
    }

    if (issues.some((i) => i.includes('No index'))) {
      recommendations.push('Create an index on the filtering fields')
      if (metadata?.queryType === 'blocking') {
        recommendations.push('Use IndexAnalyzer to get specific index recommendations')
      }
    }

    if (issues.some((i) => i.includes('Large result set'))) {
      recommendations.push('Use pagination with limit/offset')
      recommendations.push('Consider more selective blocking criteria')
      recommendations.push('Fetch only required fields using field projection')
    }

    if (issues.some((i) => i.includes('High memory'))) {
      recommendations.push('Process records in smaller batches')
      recommendations.push('Use streaming/pagination for large datasets')
    }

    if (issues.some((i) => i.includes('Inefficient query'))) {
      recommendations.push('Review query logic - might be scanning unnecessary rows')
      recommendations.push('Check if indexes are being utilized')
    }

    if (stats.executionTimeMs > 500) {
      recommendations.push('Consider using database query cache')
      recommendations.push('Review connection pooling configuration')
    }

    return recommendations
  }

  /**
   * Calculates severity level based on issues and stats.
   */
  private calculateSeverity(
    issues: string[],
    stats: QueryStats
  ): 'low' | 'medium' | 'high' | 'critical' {
    if (issues.length === 0) {
      return 'low'
    }

    if (
      issues.some((i) => i.includes('failed')) ||
      stats.executionTimeMs > 5000 ||
      stats.rowsReturned > 100000
    ) {
      return 'critical'
    }

    if (
      stats.executionTimeMs > 1000 ||
      stats.rowsReturned > 10000 ||
      issues.length >= 3
    ) {
      return 'high'
    }

    if (stats.executionTimeMs > 100 || issues.length >= 2) {
      return 'medium'
    }

    return 'low'
  }
}
