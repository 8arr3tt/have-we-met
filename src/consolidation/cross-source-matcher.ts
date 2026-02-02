import type {
  ConsolidationSource,
  MappedRecord,
  ConsolidationMatchResult,
} from './types'
import { ConsolidationError, MatchingScope } from './types'
import { createSchemaMapper, SchemaMapper } from './schema-mapper'
import type { Resolver } from '../core/resolver'

/**
 * Configuration for cross-source matching
 */
export interface CrossSourceMatcherConfig<
  TOutput extends Record<string, unknown>,
> {
  /**
   * Data sources to match across
   */
  sources: Array<ConsolidationSource<Record<string, unknown>, TOutput>>

  /**
   * Resolver configured for the unified output schema
   *
   * This resolver performs the actual matching after schema mapping
   */
  resolver: Resolver<TOutput>

  /**
   * Matching scope strategy
   *
   * @default MatchingScope.WithinSourceFirst
   */
  matchingScope?: MatchingScope
}

/**
 * Options for matching operations
 */
export interface MatchingOptions {
  /**
   * Maximum number of matches to return per candidate
   */
  maxResults?: number

  /**
   * Minimum score threshold to include in results
   */
  minScore?: number
}

/**
 * Cross-source matcher that can compare records from different source schemas
 * by mapping them to a unified comparison schema.
 *
 * Supports:
 * - Within-source matching (deduplicate each source separately)
 * - Cross-source matching (find matches across different sources)
 * - Unified pool matching (treat all sources as one pool)
 * - Source provenance tracking
 *
 * @example
 * ```typescript
 * const matcher = new CrossSourceMatcher({
 *   sources: [crmSource, billingSource, legacySource],
 *   resolver: unifiedResolver,
 *   matchingScope: MatchingScope.WithinSourceFirst
 * })
 *
 * // Match a record across all sources
 * const matches = await matcher.matchRecord(record, 'crm_db')
 *
 * // Match within a single source only
 * const withinMatches = await matcher.matchWithinSource(record, 'crm_db')
 * ```
 */
export class CrossSourceMatcher<TOutput extends Record<string, unknown>> {
  private readonly sources: Array<ConsolidationSource<Record<string, unknown>, TOutput>>
  private readonly resolver: Resolver<TOutput>
  private readonly matchingScope: MatchingScope
  private readonly mappers: Map<string, SchemaMapper<Record<string, unknown>, TOutput>>

  constructor(config: CrossSourceMatcherConfig<TOutput>) {
    this.validateConfig(config)

    this.sources = config.sources
    this.resolver = config.resolver
    this.matchingScope = config.matchingScope || MatchingScope.WithinSourceFirst

    // Create schema mappers for each source
    this.mappers = new Map()
    for (const source of this.sources) {
      const mapper = createSchemaMapper(source)
      this.mappers.set(source.sourceId, mapper)
    }
  }

  /**
   * Match a single record across all sources.
   *
   * The record is first mapped to the unified schema, then compared against
   * records from all configured sources.
   *
   * @param record - Input record to match
   * @param sourceId - Source ID of the input record
   * @param options - Matching options
   * @returns Promise resolving to match results
   *
   * @example
   * ```typescript
   * const matches = await matcher.matchRecord(
   *   { customer_name: 'John Smith', email_addr: 'john@example.com' },
   *   'crm_db'
   * )
   *
   * for (const match of matches) {
   *   console.log(`Matched with source: ${match.matches[0].sourceId}`)
   *   console.log(`Score: ${match.score}`)
   * }
   * ```
   */
  async matchRecord(
    record: Record<string, unknown>,
    sourceId: string,
    options?: MatchingOptions
  ): Promise<ConsolidationMatchResult<TOutput>[]> {
    // Map the candidate record to unified schema
    const mappedCandidate = this.mapRecord(record, sourceId)

    // Load records from all sources
    const allMappedRecords: MappedRecord<TOutput>[] = []
    for (const source of this.sources) {
      const sourceRecords = await this.loadSourceRecords(source)
      allMappedRecords.push(...sourceRecords)
    }

    // Exclude the candidate record from existing records if it's already in the pool
    const existingRecords = allMappedRecords.filter(
      (r) =>
        !(r.sourceId === mappedCandidate.sourceId &&
          r.sourceRecordId === mappedCandidate.sourceRecordId)
    )

    // Perform matching
    return this.matchMappedRecord(
      mappedCandidate,
      existingRecords,
      options
    )
  }

  /**
   * Match a record only within its own source.
   *
   * Useful for within-source deduplication before cross-source matching.
   *
   * @param record - Input record to match
   * @param sourceId - Source ID of the input record
   * @param options - Matching options
   * @returns Promise resolving to match results (only from same source)
   *
   * @example
   * ```typescript
   * const withinMatches = await matcher.matchWithinSource(
   *   { customer_name: 'John Smith' },
   *   'crm_db'
   * )
   * ```
   */
  async matchWithinSource(
    record: Record<string, unknown>,
    sourceId: string,
    options?: MatchingOptions
  ): Promise<ConsolidationMatchResult<TOutput>[]> {
    // Check if source exists first (before trying to map)
    const source = this.sources.find((s) => s.sourceId === sourceId)
    if (!source) {
      throw new ConsolidationError(
        `Source not found: ${sourceId}`,
        'SOURCE_NOT_FOUND'
      )
    }

    // Map the candidate record
    const mappedCandidate = this.mapRecord(record, sourceId)

    // Load records only from the same source
    const sourceRecords = await this.loadSourceRecords(source)

    // Exclude the candidate record
    const existingRecords = sourceRecords.filter(
      (r) => r.sourceRecordId !== mappedCandidate.sourceRecordId
    )

    return this.matchMappedRecord(
      mappedCandidate,
      existingRecords,
      options
    )
  }

  /**
   * Match records across sources (excluding within-source matches).
   *
   * Useful for finding matches between different source systems.
   *
   * @param record - Input record to match
   * @param sourceId - Source ID of the input record
   * @param options - Matching options
   * @returns Promise resolving to match results (only from different sources)
   *
   * @example
   * ```typescript
   * const crossMatches = await matcher.matchCrossSources(
   *   { customer_name: 'John Smith' },
   *   'crm_db'
   * )
   *
   * // Only returns matches from billing_system, legacy_customers, etc.
   * // Excludes matches from crm_db
   * ```
   */
  async matchCrossSources(
    record: Record<string, unknown>,
    sourceId: string,
    options?: MatchingOptions
  ): Promise<ConsolidationMatchResult<TOutput>[]> {
    // Map the candidate record
    const mappedCandidate = this.mapRecord(record, sourceId)

    // Load records from all OTHER sources
    const allMappedRecords: MappedRecord<TOutput>[] = []
    for (const source of this.sources) {
      if (source.sourceId !== sourceId) {
        const sourceRecords = await this.loadSourceRecords(source)
        allMappedRecords.push(...sourceRecords)
      }
    }

    return this.matchMappedRecord(
      mappedCandidate,
      allMappedRecords,
      options
    )
  }

  /**
   * Match records in a unified pool (all sources together).
   *
   * This is equivalent to matchRecord() but makes the intent explicit.
   *
   * @param record - Input record to match
   * @param sourceId - Source ID of the input record
   * @param options - Matching options
   * @returns Promise resolving to match results
   */
  async matchUnifiedPool(
    record: Record<string, unknown>,
    sourceId: string,
    options?: MatchingOptions
  ): Promise<ConsolidationMatchResult<TOutput>[]> {
    return this.matchRecord(record, sourceId, options)
  }

  /**
   * Batch match multiple records from a single source.
   *
   * More efficient than calling matchRecord() in a loop.
   *
   * @param records - Array of input records
   * @param sourceId - Source ID of the input records
   * @param options - Matching options
   * @returns Promise resolving to array of match results (one per input record)
   *
   * @example
   * ```typescript
   * const results = await matcher.matchBatch(crmRecords, 'crm_db')
   *
   * for (let i = 0; i < results.length; i++) {
   *   console.log(`Record ${i} has ${results[i].length} matches`)
   * }
   * ```
   */
  async matchBatch(
    records: Record<string, unknown>[],
    sourceId: string,
    options?: MatchingOptions
  ): Promise<ConsolidationMatchResult<TOutput>[][]> {
    // Map all input records
    const mappedCandidates = records.map((record) =>
      this.mapRecord(record, sourceId)
    )

    // Load records from all sources (once)
    const allMappedRecords: MappedRecord<TOutput>[] = []
    for (const source of this.sources) {
      const sourceRecords = await this.loadSourceRecords(source)
      allMappedRecords.push(...sourceRecords)
    }

    // Match each candidate
    const results: ConsolidationMatchResult<TOutput>[][] = []
    for (const candidate of mappedCandidates) {
      // Exclude the candidate from existing records
      const existingRecords = allMappedRecords.filter(
        (r) =>
          !(r.sourceId === candidate.sourceId &&
            r.sourceRecordId === candidate.sourceRecordId)
      )

      const matches = this.matchMappedRecord(
        candidate,
        existingRecords,
        options
      )
      results.push(matches)
    }

    return results
  }

  /**
   * Get the matching scope strategy.
   */
  getMatchingScope(): MatchingScope {
    return this.matchingScope
  }

  /**
   * Get the list of configured sources.
   */
  getSources(): Array<ConsolidationSource<Record<string, unknown>, TOutput>> {
    return this.sources
  }

  /**
   * Get a source by ID.
   */
  getSource(sourceId: string): ConsolidationSource<Record<string, unknown>, TOutput> | undefined {
    return this.sources.find((s) => s.sourceId === sourceId)
  }

  /**
   * Map a record from input schema to unified output schema.
   *
   * @param record - Input record
   * @param sourceId - Source ID
   * @returns Mapped record with provenance
   */
  private mapRecord(
    record: Record<string, unknown>,
    sourceId: string
  ): MappedRecord<TOutput> {
    const mapper = this.mappers.get(sourceId)
    if (!mapper) {
      throw new ConsolidationError(
        `No mapper found for source: ${sourceId}`,
        'MAPPER_NOT_FOUND',
        { sourceId }
      )
    }

    try {
      const mappedRecord = mapper.map(record)
      return {
        record: mappedRecord,
        sourceId,
        originalRecord: record,
        sourceRecordId: this.extractRecordId(record),
      }
    } catch (error) {
      throw new ConsolidationError(
        `Failed to map record from source ${sourceId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        'MAPPING_ERROR',
        { sourceId, record }
      )
    }
  }

  /**
   * Load records from a source and map them to unified schema.
   *
   * @param source - Source configuration
   * @returns Promise resolving to array of mapped records
   */
  private async loadSourceRecords(
    source: ConsolidationSource<Record<string, unknown>, TOutput>
  ): Promise<MappedRecord<TOutput>[]> {
    try {
      // Load records via adapter
      const records = await source.adapter.findAll()

      // Map each record to unified schema
      const mappedRecords: MappedRecord<TOutput>[] = []
      for (const record of records) {
        try {
          const mapped = this.mapRecord(record, source.sourceId)
          mappedRecords.push(mapped)
        } catch (error) {
          // Log error but continue with other records
          console.warn(
            `Failed to map record from ${source.sourceId}:`,
            error
          )
        }
      }

      return mappedRecords
    } catch (error) {
      throw new ConsolidationError(
        `Failed to load records from source ${source.sourceId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        'SOURCE_LOAD_ERROR',
        { sourceId: source.sourceId }
      )
    }
  }

  /**
   * Perform matching for a mapped candidate record against existing records.
   *
   * @param candidate - Mapped candidate record
   * @param existingRecords - Array of existing mapped records
   * @param options - Matching options
   * @returns Array of match results
   */
  private matchMappedRecord(
    candidate: MappedRecord<TOutput>,
    existingRecords: MappedRecord<TOutput>[],
    options?: MatchingOptions
  ): ConsolidationMatchResult<TOutput>[] {
    if (existingRecords.length === 0) {
      return []
    }

    // Extract just the records for the resolver
    const existingRecordValues = existingRecords.map((r) => r.record)

    // Create a map from record JSON to MappedRecord for efficient lookup
    // This handles cases where resolver doesn't return exact object references
    const recordMap = new Map<string, MappedRecord<TOutput>>()
    for (const mappedRecord of existingRecords) {
      const key = JSON.stringify(mappedRecord.record)
      recordMap.set(key, mappedRecord)
    }

    // Use the resolver to find matches
    const matchResults = this.resolver.resolve(
      candidate.record,
      existingRecordValues,
      {
        maxResults: options?.maxResults,
      }
    )

    // Convert match results to consolidation match results
    const consolidationResults: ConsolidationMatchResult<TOutput>[] = []

    for (const matchResult of matchResults) {
      // Apply minimum score filter if specified
      if (options?.minScore !== undefined && matchResult.score.totalScore < options.minScore) {
        continue
      }

      // Find the corresponding MappedRecord using JSON key
      const matchKey = JSON.stringify(matchResult.candidateRecord)
      const matchedMappedRecord = recordMap.get(matchKey)

      if (!matchedMappedRecord) {
        // This shouldn't happen, but handle gracefully
        continue
      }

      consolidationResults.push({
        matches: [matchedMappedRecord],
        score: matchResult.score.totalScore,
        explanation: matchResult.explanation,
      })
    }

    return consolidationResults
  }

  /**
   * Extract a record ID from a record.
   *
   * Tries common ID field names: id, _id, recordId, etc.
   *
   * @param record - Input record
   * @returns Record ID (string or number)
   */
  private extractRecordId(record: Record<string, unknown>): string | number {
    // Try common ID field names
    const idFields = ['id', '_id', 'recordId', 'record_id', 'pk', 'uuid']

    for (const field of idFields) {
      const value = record[field]
      if (value !== undefined && value !== null) {
        if (typeof value === 'string' || typeof value === 'number') {
          return value
        }
      }
    }

    // Fallback: generate a pseudo-ID from record hash
    return JSON.stringify(record).slice(0, 32)
  }

  /**
   * Validate matcher configuration.
   *
   * @throws {ConsolidationError} If configuration is invalid
   */
  private validateConfig(
    config: CrossSourceMatcherConfig<TOutput>
  ): void {
    if (!config.sources || config.sources.length === 0) {
      throw new ConsolidationError(
        'At least one source is required',
        'INVALID_CONFIG'
      )
    }

    if (!config.resolver) {
      throw new ConsolidationError(
        'Resolver is required',
        'INVALID_CONFIG'
      )
    }

    // Validate source IDs are unique
    const sourceIds = new Set<string>()
    for (const source of config.sources) {
      if (sourceIds.has(source.sourceId)) {
        throw new ConsolidationError(
          `Duplicate source ID: ${source.sourceId}`,
          'INVALID_CONFIG',
          { sourceId: source.sourceId }
        )
      }
      sourceIds.add(source.sourceId)
    }

    // Validate each source has required fields
    for (const source of config.sources) {
      if (!source.sourceId) {
        throw new ConsolidationError(
          'Source must have a sourceId',
          'INVALID_CONFIG'
        )
      }
      if (!source.adapter) {
        throw new ConsolidationError(
          `Source ${source.sourceId} must have an adapter`,
          'INVALID_CONFIG',
          { sourceId: source.sourceId }
        )
      }
      if (!source.mapping || Object.keys(source.mapping).length === 0) {
        throw new ConsolidationError(
          `Source ${source.sourceId} must have field mappings`,
          'INVALID_CONFIG',
          { sourceId: source.sourceId }
        )
      }
    }
  }
}

/**
 * Create a cross-source matcher from configuration.
 *
 * @param config - Matcher configuration
 * @returns CrossSourceMatcher instance
 *
 * @example
 * ```typescript
 * const matcher = createCrossSourceMatcher({
 *   sources: [crmSource, billingSource],
 *   resolver: unifiedResolver
 * })
 * ```
 */
export function createCrossSourceMatcher<
  TOutput extends Record<string, unknown>,
>(
  config: CrossSourceMatcherConfig<TOutput>
): CrossSourceMatcher<TOutput> {
  return new CrossSourceMatcher(config)
}
