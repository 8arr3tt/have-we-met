/**
 * Consolidation executor that orchestrates multi-source consolidation workflows
 *
 * Coordinates:
 * - Loading records from multiple sources
 * - Schema mapping to unified output schema
 * - Cross-source matching (within-source-first or unified pool)
 * - Source-aware merging with conflict resolution
 * - Golden record generation and persistence
 * - Comprehensive statistics tracking
 *
 * @module consolidation/consolidation-executor
 */

import type {
  ConsolidationConfig,
  ConsolidationResult,
  ConsolidationStats,
  ConsolidationMatchResult,
  MappedRecord,
} from './types.js'
import {
  ConsolidationError,
  ConsolidationConfigError,
  MatchingScope,
} from './types.js'
import { CrossSourceMatcher } from './cross-source-matcher.js'
import { SourceAwareMerger } from './source-aware-merger.js'
import type { Resolver } from '../core/resolver.js'

/**
 * Options for consolidation execution
 */
export interface ExecuteOptions {
  /**
   * Whether to write golden records to output adapter
   *
   * @default false
   */
  writeOutput?: boolean

  /**
   * Maximum number of records to process from each source
   *
   * Useful for testing or incremental processing
   */
  maxRecordsPerSource?: number

  /**
   * Whether to fail fast on first error
   *
   * If false, execution continues and errors are collected
   *
   * @default false
   */
  failFast?: boolean

  /**
   * User/system identifier for audit trail
   */
  executedBy?: string
}

/**
 * Consolidation executor that orchestrates the full consolidation workflow
 *
 * Supports two matching strategies:
 * 1. Within-source-first: Deduplicate each source, then match across sources
 * 2. Unified pool: Match all records together in one pool
 *
 * @example
 * ```typescript
 * const executor = new ConsolidationExecutor({
 *   sources: [crmSource, billingSource, legacySource],
 *   matchingScope: MatchingScope.WithinSourceFirst,
 *   conflictResolution: {
 *     defaultStrategy: 'preferNonNull',
 *     useSourcePriority: true
 *   },
 *   outputAdapter: outputDbAdapter,
 *   writeOutput: true
 * }, resolver)
 *
 * const result = await executor.execute()
 * console.log(`Created ${result.stats.goldenRecords} golden records`)
 * console.log(`${result.stats.crossSourceMatches} cross-source matches`)
 * ```
 */
export class ConsolidationExecutor<TOutput extends Record<string, unknown>> {
  private readonly config: ConsolidationConfig<TOutput>
  private readonly _resolver: Resolver<TOutput>
  private readonly matcher: CrossSourceMatcher<TOutput>
  private readonly merger: SourceAwareMerger<TOutput>

  /**
   * Create a new consolidation executor
   *
   * @param config - Consolidation configuration
   * @param resolver - Resolver configured for unified output schema
   */
  constructor(
    config: ConsolidationConfig<TOutput>,
    resolver: Resolver<TOutput>
  ) {
    this.validateConfig(config)
    this.config = config
    this._resolver = resolver

    // Initialize matcher
    this.matcher = new CrossSourceMatcher({
      sources: config.sources,
      resolver,
      matchingScope: config.matchingScope,
    })

    // Initialize merger
    this.merger = new SourceAwareMerger(
      {
        defaultStrategy: config.conflictResolution?.defaultStrategy || 'preferFirst',
        fieldStrategies:
          config.conflictResolution?.fieldStrategies
            ? Object.entries(config.conflictResolution.fieldStrategies).map(
                ([field, strategy]) => ({ field, strategy })
              )
            : [],
        useSourcePriority:
          config.conflictResolution?.useSourcePriority ?? true,
        trackProvenance:
          config.conflictResolution?.trackProvenance ?? true,
      }
    )
  }

  /**
   * Execute the full consolidation workflow
   *
   * @param options - Execution options
   * @returns Consolidation result with golden records and statistics
   */
  async execute(
    options: ExecuteOptions = {}
  ): Promise<ConsolidationResult<TOutput>> {
    const startTime = Date.now()

    try {
      const {
        writeOutput = this.config.writeOutput ?? false,
        maxRecordsPerSource,
        failFast = false,
        executedBy,
      } = options

      // Determine matching strategy
      const matchingScope =
        this.config.matchingScope || MatchingScope.WithinSourceFirst

      // Execute based on matching scope
      let result: ConsolidationResult<TOutput>

      if (matchingScope === MatchingScope.WithinSourceFirst) {
        result = await this.executeWithinSourceFirst({
          maxRecordsPerSource,
          failFast,
          executedBy,
        })
      } else {
        result = await this.executeUnifiedPool({
          maxRecordsPerSource,
          failFast,
          executedBy,
        })
      }

      // Write golden records to output adapter if requested
      if (writeOutput && this.config.outputAdapter) {
        await this.writeGoldenRecords(result.goldenRecords)
      }

      // Calculate execution time
      result.stats.executionTimeMs = Date.now() - startTime

      return result
    } catch (error) {
      throw new ConsolidationError(
        `Consolidation execution failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
        'EXECUTION_ERROR',
        { error }
      )
    }
  }

  /**
   * Execute within-source-first consolidation
   *
   * Strategy:
   * 1. Deduplicate within each source
   * 2. Match deduplicated records across sources
   * 3. Merge matches with source priority
   *
   * More efficient for large datasets with many within-source duplicates
   */
  private async executeWithinSourceFirst(
    options: Omit<ExecuteOptions, 'writeOutput'>
  ): Promise<ConsolidationResult<TOutput>> {
    const errors: Array<{
      sourceId: string
      recordId: string | number
      error: string
    }> = []
    const stats: ConsolidationStats = {
      sources: {},
      totalRecords: 0,
      goldenRecords: 0,
      crossSourceMatches: 0,
      uniqueRecords: 0,
      executionTimeMs: 0,
    }

    // Phase 1: Deduplicate within each source
    const deduplicatedRecords: Map<string, MappedRecord<TOutput>[]> = new Map()

    for (const source of this.config.sources) {
      const sourceStats = {
        recordsLoaded: 0,
        mappingErrors: 0,
        duplicatesWithinSource: 0,
      }

      try {
        // Load records from source
        const records = await this.loadRecords(
          source.sourceId,
          options.maxRecordsPerSource
        )
        sourceStats.recordsLoaded = records.length
        stats.totalRecords += records.length

        // Match within source
        const withinSourceGroups = await this.deduplicateWithinSource(
          records,
          source.sourceId
        )

        // Count duplicates
        sourceStats.duplicatesWithinSource = records.length - withinSourceGroups.length

        // Store deduplicated records
        deduplicatedRecords.set(source.sourceId, withinSourceGroups)
      } catch (error) {
        sourceStats.mappingErrors++
        errors.push({
          sourceId: source.sourceId,
          recordId: 'unknown',
          error: error instanceof Error ? error.message : String(error),
        })

        if (options.failFast) {
          throw error
        }
      }

      stats.sources[source.sourceId] = sourceStats
    }

    // Phase 2: Match across sources
    const allDeduplicatedRecords = Array.from(deduplicatedRecords.values()).flat()
    const crossSourceGroups = await this.matchCrossSources(allDeduplicatedRecords)

    // Phase 3: Merge match groups into golden records
    const goldenRecords: TOutput[] = []
    const matchGroups: ConsolidationMatchResult<TOutput>[] = []

    for (const group of crossSourceGroups) {
      try {
        const mergeResult = await this.merger.mergeWithSourcePriority({
          records: group.matches,
          sources: this.config.sources,
          mergedBy: options.executedBy,
        })

        goldenRecords.push(mergeResult.goldenRecord)
        matchGroups.push(group)

        // Count cross-source matches
        const uniqueSources = new Set(group.matches.map((m) => m.sourceId))
        if (uniqueSources.size > 1) {
          stats.crossSourceMatches++
        }
      } catch (error) {
        errors.push({
          sourceId: 'merged',
          recordId: group.matches[0]?.sourceRecordId ?? 'unknown',
          error: error instanceof Error ? error.message : String(error),
        })

        if (options.failFast) {
          throw error
        }
      }
    }

    stats.goldenRecords = goldenRecords.length
    stats.uniqueRecords = goldenRecords.length - stats.crossSourceMatches

    return {
      goldenRecords,
      matchGroups,
      stats,
      errors,
    }
  }

  /**
   * Execute unified pool consolidation
   *
   * Strategy:
   * 1. Load all records from all sources
   * 2. Match all records in one unified pool
   * 3. Merge matches with source priority
   *
   * May find more matches than within-source-first but slower
   */
  private async executeUnifiedPool(
    options: Omit<ExecuteOptions, 'writeOutput'>
  ): Promise<ConsolidationResult<TOutput>> {
    const errors: Array<{
      sourceId: string
      recordId: string | number
      error: string
    }> = []
    const stats: ConsolidationStats = {
      sources: {},
      totalRecords: 0,
      goldenRecords: 0,
      crossSourceMatches: 0,
      uniqueRecords: 0,
      executionTimeMs: 0,
    }

    // Load all records from all sources
    const allRecords: MappedRecord<TOutput>[] = []

    for (const source of this.config.sources) {
      const sourceStats = {
        recordsLoaded: 0,
        mappingErrors: 0,
        duplicatesWithinSource: 0,
      }

      try {
        const records = await this.loadRecords(
          source.sourceId,
          options.maxRecordsPerSource
        )
        sourceStats.recordsLoaded = records.length
        stats.totalRecords += records.length
        allRecords.push(...records)
      } catch (error) {
        sourceStats.mappingErrors++
        errors.push({
          sourceId: source.sourceId,
          recordId: 'unknown',
          error: error instanceof Error ? error.message : String(error),
        })

        if (options.failFast) {
          throw error
        }
      }

      stats.sources[source.sourceId] = sourceStats
    }

    // Match all records in unified pool
    const matchGroups = await this.matchUnifiedPool(allRecords)

    // Merge match groups into golden records
    const goldenRecords: TOutput[] = []

    for (const group of matchGroups) {
      try {
        const mergeResult = await this.merger.mergeWithSourcePriority({
          records: group.matches,
          sources: this.config.sources,
          mergedBy: options.executedBy,
        })

        goldenRecords.push(mergeResult.goldenRecord)

        // Count cross-source matches
        const uniqueSources = new Set(group.matches.map((m) => m.sourceId))
        if (uniqueSources.size > 1) {
          stats.crossSourceMatches++
        }
      } catch (error) {
        errors.push({
          sourceId: 'merged',
          recordId: group.matches[0]?.sourceRecordId ?? 'unknown',
          error: error instanceof Error ? error.message : String(error),
        })

        if (options.failFast) {
          throw error
        }
      }
    }

    stats.goldenRecords = goldenRecords.length
    stats.uniqueRecords = goldenRecords.length - stats.crossSourceMatches

    return {
      goldenRecords,
      matchGroups,
      stats,
      errors,
    }
  }

  /**
   * Load records from a specific source
   */
  private async loadRecords(
    sourceId: string,
    maxRecords?: number
  ): Promise<MappedRecord<TOutput>[]> {
    const source = this.config.sources.find((s) => s.sourceId === sourceId)
    if (!source) {
      throw new ConsolidationError(
        `Source not found: ${sourceId}`,
        'SOURCE_NOT_FOUND'
      )
    }

    try {
      // Load from adapter
      let records = await source.adapter.findAll()

      // Limit if specified
      if (maxRecords !== undefined && maxRecords > 0) {
        records = records.slice(0, maxRecords)
      }

      // Map to unified schema
      const mapper = this.matcher['mappers'].get(sourceId)
      if (!mapper) {
        throw new ConsolidationError(
          `No mapper found for source: ${sourceId}`,
          'MAPPER_NOT_FOUND'
        )
      }

      const mappedRecords: MappedRecord<TOutput>[] = []
      for (const record of records) {
        try {
          const mapped = mapper.map(record)
          mappedRecords.push({
            record: mapped,
            sourceId,
            originalRecord: record,
            sourceRecordId: this.extractRecordId(record),
          })
        } catch (error) {
          // Log but continue
          console.warn(
            `Failed to map record from ${sourceId}:`,
            error
          )
        }
      }

      return mappedRecords
    } catch (error) {
      throw new ConsolidationError(
        `Failed to load records from source ${sourceId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        'SOURCE_LOAD_ERROR',
        { sourceId }
      )
    }
  }

  /**
   * Deduplicate records within a single source
   *
   * Returns one representative record per duplicate group
   */
  private async deduplicateWithinSource(
    records: MappedRecord<TOutput>[],
    sourceId: string
  ): Promise<MappedRecord<TOutput>[]> {
    if (records.length === 0) {
      return []
    }

    const deduplicated: MappedRecord<TOutput>[] = []
    const processedIds = new Set<string | number>()

    for (const record of records) {
      if (processedIds.has(record.sourceRecordId)) {
        continue
      }

      // Find matches within source
      const matches = await this.matcher.matchWithinSource(
        record.originalRecord as Record<string, unknown>,
        sourceId
      )

      // Mark all matched records as processed
      for (const match of matches) {
        for (const matchedRecord of match.matches) {
          processedIds.add(matchedRecord.sourceRecordId)
        }
      }

      // Mark current record as processed
      processedIds.add(record.sourceRecordId)

      // Use the first record as representative
      deduplicated.push(record)
    }

    return deduplicated
  }

  /**
   * Match records across different sources
   *
   * Groups records from different sources that match
   */
  private async matchCrossSources(
    records: MappedRecord<TOutput>[]
  ): Promise<ConsolidationMatchResult<TOutput>[]> {
    const matchGroups: ConsolidationMatchResult<TOutput>[] = []
    const processedIds = new Set<string>()

    for (const record of records) {
      const recordKey = `${record.sourceId}:${record.sourceRecordId}`
      if (processedIds.has(recordKey)) {
        continue
      }

      // Find cross-source matches
      const matches = await this.matcher.matchCrossSources(
        record.originalRecord as Record<string, unknown>,
        record.sourceId
      )

      // Build match group including the candidate
      const matchGroup: ConsolidationMatchResult<TOutput> = {
        matches: [record],
        score: 0,
        explanation: 'Cross-source match group',
      }

      // Add matches from other sources
      for (const match of matches) {
        for (const matchedRecord of match.matches) {
          const matchKey = `${matchedRecord.sourceId}:${matchedRecord.sourceRecordId}`
          if (!processedIds.has(matchKey)) {
            matchGroup.matches.push(matchedRecord)
            processedIds.add(matchKey)
          }
        }
      }

      // Mark current record as processed
      processedIds.add(recordKey)

      // Only create group if there are matches
      if (matchGroup.matches.length > 1) {
        matchGroups.push(matchGroup)
      } else {
        // Single record with no matches
        matchGroups.push({
          matches: [record],
          score: 0,
          explanation: 'No matches found',
        })
      }
    }

    return matchGroups
  }

  /**
   * Match all records in a unified pool
   *
   * Treats all records as one pool regardless of source
   */
  private async matchUnifiedPool(
    records: MappedRecord<TOutput>[]
  ): Promise<ConsolidationMatchResult<TOutput>[]> {
    const matchGroups: ConsolidationMatchResult<TOutput>[] = []
    const processedIds = new Set<string>()

    for (const record of records) {
      const recordKey = `${record.sourceId}:${record.sourceRecordId}`
      if (processedIds.has(recordKey)) {
        continue
      }

      // Find all matches (across all sources)
      const matches = await this.matcher.matchRecord(
        record.originalRecord as Record<string, unknown>,
        record.sourceId
      )

      // Build match group
      const matchGroup: ConsolidationMatchResult<TOutput> = {
        matches: [record],
        score: 0,
        explanation: 'Unified pool match group',
      }

      // Add matches
      for (const match of matches) {
        for (const matchedRecord of match.matches) {
          const matchKey = `${matchedRecord.sourceId}:${matchedRecord.sourceRecordId}`
          if (!processedIds.has(matchKey)) {
            matchGroup.matches.push(matchedRecord)
            processedIds.add(matchKey)
          }
        }
      }

      // Mark current record as processed
      processedIds.add(recordKey)

      matchGroups.push(matchGroup)
    }

    return matchGroups
  }

  /**
   * Write golden records to output adapter
   */
  private async writeGoldenRecords(
    goldenRecords: TOutput[]
  ): Promise<void> {
    if (!this.config.outputAdapter) {
      throw new ConsolidationError(
        'No output adapter configured',
        'NO_OUTPUT_ADAPTER'
      )
    }

    try {
      await this.config.outputAdapter.batchInsert(goldenRecords)
    } catch (error) {
      throw new ConsolidationError(
        `Failed to write golden records: ${
          error instanceof Error ? error.message : String(error)
        }`,
        'WRITE_ERROR',
        { error }
      )
    }
  }

  /**
   * Extract record ID from a record
   */
  private extractRecordId(record: Record<string, unknown>): string | number {
    const idFields = ['id', '_id', 'recordId', 'record_id', 'pk', 'uuid']

    for (const field of idFields) {
      const value = record[field]
      if (value !== undefined && value !== null) {
        if (typeof value === 'string' || typeof value === 'number') {
          return value
        }
      }
    }

    // Fallback: generate pseudo-ID
    return JSON.stringify(record).slice(0, 32)
  }

  /**
   * Validate consolidation configuration
   */
  private validateConfig(config: ConsolidationConfig<TOutput>): void {
    if (!config.sources || config.sources.length === 0) {
      throw new ConsolidationConfigError(
        'At least one source is required'
      )
    }

    // Validate each source
    for (const source of config.sources) {
      if (!source.sourceId) {
        throw new ConsolidationConfigError(
          'Source must have a sourceId'
        )
      }
      if (!source.adapter) {
        throw new ConsolidationConfigError(
          `Source ${source.sourceId} must have an adapter`
        )
      }
      if (!source.mapping || Object.keys(source.mapping).length === 0) {
        throw new ConsolidationConfigError(
          `Source ${source.sourceId} must have field mappings`
        )
      }
    }

    // Validate source IDs are unique
    const sourceIds = new Set<string>()
    for (const source of config.sources) {
      if (sourceIds.has(source.sourceId)) {
        throw new ConsolidationConfigError(
          `Duplicate source ID: ${source.sourceId}`
        )
      }
      sourceIds.add(source.sourceId)
    }

    // Validate output adapter if writeOutput is true
    if (config.writeOutput && !config.outputAdapter) {
      throw new ConsolidationConfigError(
        'Output adapter is required when writeOutput is true'
      )
    }
  }

  /**
   * Get configuration
   */
  getConfig(): ConsolidationConfig<TOutput> {
    return { ...this.config }
  }

  /**
   * Get matching scope
   */
  getMatchingScope(): MatchingScope {
    return this.config.matchingScope || MatchingScope.WithinSourceFirst
  }
}

/**
 * Factory function to create a consolidation executor
 *
 * @param config - Consolidation configuration
 * @param resolver - Resolver for unified schema
 * @returns ConsolidationExecutor instance
 *
 * @example
 * ```typescript
 * const executor = createConsolidationExecutor(
 *   {
 *     sources: [crmSource, billingSource],
 *     matchingScope: MatchingScope.WithinSourceFirst,
 *     conflictResolution: {
 *       useSourcePriority: true,
 *       defaultStrategy: 'preferNonNull'
 *     }
 *   },
 *   unifiedResolver
 * )
 *
 * const result = await executor.execute({ writeOutput: true })
 * ```
 */
export function createConsolidationExecutor<
  TOutput extends Record<string, unknown>,
>(
  config: ConsolidationConfig<TOutput>,
  resolver: Resolver<TOutput>
): ConsolidationExecutor<TOutput> {
  return new ConsolidationExecutor(config, resolver)
}
