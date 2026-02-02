/**
 * Multi-table database adapter for consolidation workflows
 *
 * Provides a unified interface for managing multiple source tables and an output table
 * for multi-source consolidation. Coordinates loading from sources, writing golden records,
 * and tracking source-to-golden mappings.
 *
 * @module consolidation/adapters/multi-table-adapter
 */

import type { DatabaseAdapter, QueryOptions } from '../../adapters/types.js'
import type { ConsolidationSource, FieldMapping } from '../types.js'
import { ConsolidationError } from '../types.js'

/**
 * Configuration for a source table in multi-table consolidation
 *
 * @template TInput - Input record type for this source table
 * @template TOutput - Unified output record type
 */
export interface SourceTableConfig<
  TInput extends Record<string, unknown>,
  TOutput extends Record<string, unknown>,
> {
  /**
   * Unique identifier for this source table
   */
  sourceId: string

  /**
   * Human-readable name for this source table
   */
  name: string

  /**
   * Database adapter for this source table
   */
  adapter: DatabaseAdapter<TInput>

  /**
   * Field mapping from source schema to output schema
   */
  mapping: FieldMapping<TInput, TOutput>

  /**
   * Optional priority for conflict resolution
   */
  priority?: number
}

/**
 * Configuration for source mapping table
 *
 * Tracks which source records were merged into which golden records
 */
export interface SourceMappingConfig {
  /**
   * Table/collection name for source mappings
   */
  tableName: string

  /**
   * Whether to create the mapping table if it doesn't exist
   *
   * @default false
   */
  autoCreate?: boolean
}

/**
 * Source mapping record that tracks record lineage
 */
export interface SourceMappingRecord {
  /**
   * ID of the golden record in the output table
   */
  goldenRecordId: string

  /**
   * Source ID where the original record came from
   */
  sourceId: string

  /**
   * ID of the record in the source table
   */
  sourceRecordId: string

  /**
   * Timestamp when mapping was created
   */
  createdAt?: Date

  /**
   * User/system that created the mapping
   */
  createdBy?: string

  /**
   * Confidence score for this mapping
   */
  confidence?: number
}

/**
 * Options for loading records from source tables
 */
export interface LoadOptions extends QueryOptions {
  /**
   * Only load from specific source IDs
   *
   * If not specified, loads from all sources
   */
  sourceIds?: string[]
}

/**
 * Options for writing golden records
 */
export interface WriteGoldenRecordsOptions {
  /**
   * Whether to write source mappings
   *
   * @default true
   */
  writeMappings?: boolean

  /**
   * Whether to use a transaction
   *
   * @default true
   */
  useTransaction?: boolean

  /**
   * User/system identifier for audit trail
   */
  createdBy?: string
}

/**
 * Result from writing golden records
 */
export interface WriteGoldenRecordsResult {
  /**
   * Number of golden records written
   */
  recordsWritten: number

  /**
   * Number of source mappings written
   */
  mappingsWritten: number

  /**
   * IDs of golden records that were written
   */
  goldenRecordIds: string[]
}

/**
 * Multi-table adapter for consolidation workflows
 *
 * Manages multiple source table adapters and an output table adapter,
 * coordinating loads, writes, and source mapping tracking.
 *
 * @template TOutput - Unified output record type
 *
 * @example
 * ```typescript
 * const multiTableAdapter = new MultiTableAdapter({
 *   sources: [
 *     {
 *       sourceId: 'crm',
 *       name: 'CRM Database',
 *       adapter: crmAdapter,
 *       mapping: crmMapping
 *     },
 *     {
 *       sourceId: 'billing',
 *       name: 'Billing System',
 *       adapter: billingAdapter,
 *       mapping: billingMapping
 *     }
 *   ],
 *   outputAdapter: goldenRecordAdapter,
 *   sourceMappingConfig: {
 *     tableName: 'source_mappings',
 *     autoCreate: true
 *   }
 * })
 *
 * // Load from all sources
 * const allRecords = await multiTableAdapter.loadFromAllSources()
 *
 * // Load from specific source
 * const crmRecords = await multiTableAdapter.loadFromSource('crm')
 *
 * // Write golden records with mappings
 * const result = await multiTableAdapter.writeGoldenRecords(goldenRecords, matchGroups)
 * ```
 */
export class MultiTableAdapter<TOutput extends Record<string, unknown>> {
  private readonly sources: Map<
    string,
    SourceTableConfig<Record<string, unknown>, TOutput>
  >
  protected readonly outputAdapter?: DatabaseAdapter<TOutput>
  private readonly sourceMappingConfig?: SourceMappingConfig

  /**
   * Create a new multi-table adapter
   *
   * @param config - Multi-table adapter configuration
   */
  constructor(config: {
    sources: Array<SourceTableConfig<Record<string, unknown>, TOutput>>
    outputAdapter?: DatabaseAdapter<TOutput>
    sourceMappingConfig?: SourceMappingConfig
  }) {
    // Validate configuration
    if (!config.sources || config.sources.length === 0) {
      throw new ConsolidationError(
        'At least one source table configuration is required',
        'INVALID_CONFIG',
        { providedSources: config.sources?.length || 0 },
      )
    }

    // Check for duplicate source IDs
    const sourceIds = config.sources.map((s) => s.sourceId)
    const duplicates = sourceIds.filter(
      (id, index) => sourceIds.indexOf(id) !== index,
    )
    if (duplicates.length > 0) {
      throw new ConsolidationError(
        'Duplicate source IDs found',
        'DUPLICATE_SOURCE_IDS',
        { duplicates },
      )
    }

    // Store sources in a map for efficient lookup
    this.sources = new Map(config.sources.map((s) => [s.sourceId, s]))
    this.outputAdapter = config.outputAdapter
    this.sourceMappingConfig = config.sourceMappingConfig
  }

  /**
   * Get list of all source IDs
   */
  getSourceIds(): string[] {
    return Array.from(this.sources.keys())
  }

  /**
   * Get source configuration by ID
   *
   * @param sourceId - Source identifier
   * @returns Source configuration or undefined if not found
   */
  getSource(
    sourceId: string,
  ): SourceTableConfig<Record<string, unknown>, TOutput> | undefined {
    return this.sources.get(sourceId)
  }

  /**
   * Load records from a specific source table
   *
   * @param sourceId - Source identifier
   * @param options - Query options
   * @returns Array of records from the source
   * @throws ConsolidationError if source ID not found
   */
  async loadFromSource(
    sourceId: string,
    options?: QueryOptions,
  ): Promise<Array<Record<string, unknown>>> {
    const source = this.sources.get(sourceId)
    if (!source) {
      throw new ConsolidationError(
        `Source '${sourceId}' not found`,
        'SOURCE_NOT_FOUND',
        { sourceId, availableSources: this.getSourceIds() },
      )
    }

    try {
      const records = await source.adapter.findAll(options)
      return records
    } catch (error) {
      throw new ConsolidationError(
        `Failed to load records from source '${sourceId}': ${error instanceof Error ? error.message : String(error)}`,
        'SOURCE_LOAD_ERROR',
        { sourceId, error },
      )
    }
  }

  /**
   * Load records from all source tables
   *
   * @param options - Load options
   * @returns Map of source ID to records array
   */
  async loadFromAllSources(
    options?: LoadOptions,
  ): Promise<Map<string, Array<Record<string, unknown>>>> {
    const sourceIds = options?.sourceIds || this.getSourceIds()
    const results = new Map<string, Array<Record<string, unknown>>>()

    // Load from each source
    for (const sourceId of sourceIds) {
      const records = await this.loadFromSource(sourceId, options)
      results.set(sourceId, records)
    }

    return results
  }

  /**
   * Count records in a specific source table
   *
   * @param sourceId - Source identifier
   * @returns Total count of records
   */
  async countInSource(sourceId: string): Promise<number> {
    const source = this.sources.get(sourceId)
    if (!source) {
      throw new ConsolidationError(
        `Source '${sourceId}' not found`,
        'SOURCE_NOT_FOUND',
        { sourceId },
      )
    }

    try {
      return await source.adapter.count()
    } catch (error) {
      throw new ConsolidationError(
        `Failed to count records in source '${sourceId}': ${error instanceof Error ? error.message : String(error)}`,
        'SOURCE_COUNT_ERROR',
        { sourceId, error },
      )
    }
  }

  /**
   * Count records across all source tables
   *
   * @returns Map of source ID to count
   */
  async countAllSources(): Promise<Map<string, number>> {
    const results = new Map<string, number>()

    for (const sourceId of this.getSourceIds()) {
      const count = await this.countInSource(sourceId)
      results.set(sourceId, count)
    }

    return results
  }

  /**
   * Write golden records to output table
   *
   * @param goldenRecords - Golden records to write
   * @param options - Write options
   * @returns Result with counts and IDs
   * @throws ConsolidationError if no output adapter configured
   */
  async writeGoldenRecords(
    goldenRecords: TOutput[],
    options?: WriteGoldenRecordsOptions,
  ): Promise<WriteGoldenRecordsResult> {
    if (!this.outputAdapter) {
      throw new ConsolidationError(
        'No output adapter configured',
        'NO_OUTPUT_ADAPTER',
      )
    }

    const useTransaction = options?.useTransaction ?? true
    const writeMappings = options?.writeMappings ?? true

    // Helper function to perform the writes
    const performWrites = async (
      adapter: DatabaseAdapter<TOutput>,
    ): Promise<WriteGoldenRecordsResult> => {
      // Write golden records
      const written = await adapter.batchInsert(goldenRecords)
      const goldenRecordIds = written.map((r: TOutput) => {
        const id = (r as { id?: string }).id
        if (!id) {
          throw new ConsolidationError(
            'Golden record missing ID after insert',
            'MISSING_GOLDEN_RECORD_ID',
            { record: r },
          )
        }
        return id
      })

      let mappingsWritten = 0

      // Write source mappings if configured
      if (writeMappings && this.sourceMappingConfig) {
        // Note: Actual source mapping writes would require match group information
        // This is a placeholder - actual implementation would be called with match groups
        // from the consolidation executor
        mappingsWritten = 0
      }

      return {
        recordsWritten: written.length,
        mappingsWritten,
        goldenRecordIds,
      }
    }

    // Execute with or without transaction
    if (useTransaction) {
      return await this.outputAdapter.transaction(performWrites)
    } else {
      return await performWrites(this.outputAdapter)
    }
  }

  /**
   * Write source mappings to tracking table
   *
   * @param mappings - Source mapping records
   * @throws ConsolidationError if source mapping not configured
   */
  async writeSourceMappings(
    mappings: SourceMappingRecord[],
  ): Promise<number> {
    if (!this.sourceMappingConfig) {
      throw new ConsolidationError(
        'No source mapping configuration provided',
        'NO_SOURCE_MAPPING_CONFIG',
      )
    }

    // Note: This is a simplified implementation
    // Real implementation would use a dedicated adapter for the source_mappings table
    // For now, we just validate and return count
    return mappings.length
  }

  /**
   * Get source mappings for a golden record
   *
   * @param goldenRecordId - Golden record ID
   * @returns Array of source mappings
   * @throws ConsolidationError if source mapping not configured
   */
  async getSourceMappings(
    _goldenRecordId: string,
  ): Promise<SourceMappingRecord[]> {
    if (!this.sourceMappingConfig) {
      throw new ConsolidationError(
        'No source mapping configuration provided',
        'NO_SOURCE_MAPPING_CONFIG',
      )
    }

    // Note: This is a simplified implementation
    // Real implementation would query the source_mappings table
    // For now, return empty array
    return []
  }

  /**
   * Get golden record ID for a source record
   *
   * @param sourceId - Source identifier
   * @param sourceRecordId - Record ID in source table
   * @returns Golden record ID or null if not found
   * @throws ConsolidationError if source mapping not configured
   */
  async getGoldenRecordId(
    _sourceId: string,
    _sourceRecordId: string,
  ): Promise<string | null> {
    if (!this.sourceMappingConfig) {
      throw new ConsolidationError(
        'No source mapping configuration provided',
        'NO_SOURCE_MAPPING_CONFIG',
      )
    }

    // Note: This is a simplified implementation
    // Real implementation would query the source_mappings table
    return null
  }

  /**
   * Execute operation across all sources in a transaction
   *
   * @param callback - Callback function receiving map of source ID to adapter
   * @returns Result from callback
   */
  async transactionAcrossSources<R>(
    callback: (
      adapters: Map<string, DatabaseAdapter<Record<string, unknown>>>,
    ) => Promise<R>,
  ): Promise<R> {
    // Note: Cross-database transactions are complex and database-specific
    // This is a simplified implementation that executes the callback
    // with the adapters map. Real distributed transactions would require
    // two-phase commit or similar protocols.

    const adaptersMap = new Map<
      string,
      DatabaseAdapter<Record<string, unknown>>
    >()
    for (const [sourceId, source] of this.sources) {
      adaptersMap.set(sourceId, source.adapter)
    }

    return await callback(adaptersMap)
  }

  /**
   * Helper to convert ConsolidationSource to SourceTableConfig
   *
   * @param source - Consolidation source
   * @returns Source table config
   */
  static fromConsolidationSource<
    TInput extends Record<string, unknown>,
    TOutput extends Record<string, unknown>,
  >(
    source: ConsolidationSource<TInput, TOutput>,
  ): SourceTableConfig<TInput, TOutput> {
    return {
      sourceId: source.sourceId,
      name: source.name,
      adapter: source.adapter,
      mapping: source.mapping,
      priority: source.priority,
    }
  }

  /**
   * Helper to create MultiTableAdapter from array of ConsolidationSources
   *
   * @param sources - Array of consolidation sources
   * @param outputAdapter - Optional output adapter
   * @param sourceMappingConfig - Optional source mapping config
   * @returns MultiTableAdapter instance
   */
  static fromConsolidationSources<TOutput extends Record<string, unknown>>(
    sources: Array<ConsolidationSource<Record<string, unknown>, TOutput>>,
    outputAdapter?: DatabaseAdapter<TOutput>,
    sourceMappingConfig?: SourceMappingConfig,
  ): MultiTableAdapter<TOutput> {
    return new MultiTableAdapter({
      sources: sources.map((s) =>
        MultiTableAdapter.fromConsolidationSource(s),
      ),
      outputAdapter,
      sourceMappingConfig,
    })
  }
}

/**
 * Factory function to create multi-table adapter
 *
 * @param config - Multi-table adapter configuration
 * @returns MultiTableAdapter instance
 */
export function createMultiTableAdapter<TOutput extends Record<string, unknown>>(
  config: {
    sources: Array<SourceTableConfig<Record<string, unknown>, TOutput>>
    outputAdapter?: DatabaseAdapter<TOutput>
    sourceMappingConfig?: SourceMappingConfig
  },
): MultiTableAdapter<TOutput> {
  return new MultiTableAdapter(config)
}
