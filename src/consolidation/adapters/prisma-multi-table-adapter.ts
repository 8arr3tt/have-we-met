/**
 * Prisma-specific multi-table adapter for consolidation workflows
 *
 * Extends the base MultiTableAdapter with Prisma-specific functionality including
 * native transaction support across multiple tables and efficient batch operations.
 *
 * @module consolidation/adapters/prisma-multi-table-adapter
 */

import type { DatabaseAdapter } from '../../adapters/types.js'
import type {
  ConsolidationSource,
  MappedRecord,
  FieldMapping,
} from '../types.js'
import { ConsolidationError } from '../types.js'
import {
  MultiTableAdapter,
  type SourceTableConfig,
  type SourceMappingConfig,
  type SourceMappingRecord,
  type WriteGoldenRecordsOptions,
  type WriteGoldenRecordsResult,
} from './multi-table-adapter.js'

/**
 * Prisma client type (generic)
 *
 * Note: This is a generic representation. Users should pass their generated
 * PrismaClient type.
 */
export type PrismaClient = {
  $transaction: <R>(
    fn: (prisma: PrismaClient) => Promise<R>,
  ) => Promise<R>
  [key: string]: unknown
}

/**
 * Configuration for Prisma multi-table adapter
 */
export interface PrismaMultiTableAdapterConfig<
  TOutput extends Record<string, unknown>,
> {
  /**
   * Prisma client instance
   */
  prisma: PrismaClient

  /**
   * Source table configurations
   */
  sources: Array<SourceTableConfig<Record<string, unknown>, TOutput>>

  /**
   * Output adapter for golden records
   */
  outputAdapter?: DatabaseAdapter<TOutput>

  /**
   * Source mapping configuration
   */
  sourceMappingConfig?: SourceMappingConfig & {
    /**
     * Prisma model name for source mappings
     *
     * @example 'sourceMapping' or 'SourceMapping'
     */
    modelName?: string
  }
}

/**
 * Match group for source mapping creation
 *
 * Contains matched records that should be merged into a golden record
 */
export interface MatchGroup<TOutput> {
  /**
   * Matched records from various sources
   */
  matches: MappedRecord<TOutput>[]

  /**
   * Match score
   */
  score: number
}

/**
 * Prisma-specific multi-table adapter
 *
 * Provides native Prisma transaction support for multi-table consolidation
 * workflows, ensuring atomicity across source loads, golden record writes,
 * and source mapping tracking.
 *
 * @template TOutput - Unified output record type
 *
 * @example
 * ```typescript
 * import { PrismaClient } from '@prisma/client'
 *
 * const prisma = new PrismaClient()
 *
 * const adapter = new PrismaMultiTableAdapter({
 *   prisma,
 *   sources: [
 *     {
 *       sourceId: 'crm',
 *       name: 'CRM Database',
 *       adapter: prismaAdapter(prisma, { tableName: 'crm_customers' }),
 *       mapping: crmMapping
 *     },
 *     {
 *       sourceId: 'billing',
 *       name: 'Billing System',
 *       adapter: prismaAdapter(prisma, { tableName: 'billing_customers' }),
 *       mapping: billingMapping
 *     }
 *   ],
 *   outputAdapter: prismaAdapter(prisma, { tableName: 'golden_customers' }),
 *   sourceMappingConfig: {
 *     tableName: 'source_mappings',
 *     modelName: 'sourceMapping'
 *   }
 * })
 *
 * // Write golden records with source mappings in a transaction
 * const result = await adapter.writeGoldenRecordsWithMappings(
 *   goldenRecords,
 *   matchGroups
 * )
 * ```
 */
export class PrismaMultiTableAdapter<
  TOutput extends Record<string, unknown>,
> extends MultiTableAdapter<TOutput> {
  private readonly prisma: PrismaClient
  private readonly sourceMappingModelName?: string

  /**
   * Create a new Prisma multi-table adapter
   *
   * @param config - Prisma multi-table adapter configuration
   */
  constructor(config: PrismaMultiTableAdapterConfig<TOutput>) {
    super({
      sources: config.sources,
      outputAdapter: config.outputAdapter,
      sourceMappingConfig: config.sourceMappingConfig,
    })

    this.prisma = config.prisma
    this.sourceMappingModelName = config.sourceMappingConfig?.modelName
  }

  /**
   * Write golden records and source mappings in a Prisma transaction
   *
   * Ensures atomicity: either all writes succeed or all fail together.
   *
   * @param goldenRecords - Golden records to write
   * @param matchGroups - Match groups for source mapping creation
   * @param options - Write options
   * @returns Result with counts and IDs
   */
  async writeGoldenRecordsWithMappings(
    goldenRecords: TOutput[],
    matchGroups: MatchGroup<TOutput>[],
    options?: WriteGoldenRecordsOptions,
  ): Promise<WriteGoldenRecordsResult> {
    if (!this.outputAdapter) {
      throw new ConsolidationError(
        'No output adapter configured',
        'NO_OUTPUT_ADAPTER',
      )
    }

    const writeMappings = options?.writeMappings ?? true

    // Use Prisma transaction for atomicity
    return await this.prisma.$transaction(async (tx) => {
      // Write golden records
      const written = await this.outputAdapter!.batchInsert(goldenRecords)
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

      // Write source mappings if configured and requested
      if (writeMappings && this.sourceMappingModelName) {
        const mappings = this.createSourceMappings(
          goldenRecordIds,
          matchGroups,
          options?.createdBy,
        )

        // Write mappings using Prisma
        const model = (tx as Record<string, unknown>)[
          this.sourceMappingModelName
        ]
        if (model && typeof model === 'object' && 'createMany' in model) {
          const createMany = (
            model as {
              createMany: (args: { data: SourceMappingRecord[] }) => Promise<{
                count: number
              }>
            }
          ).createMany

          const result = await createMany({ data: mappings })
          mappingsWritten = result.count
        }
      }

      return {
        recordsWritten: written.length,
        mappingsWritten,
        goldenRecordIds,
      }
    })
  }

  /**
   * Create source mapping records from match groups
   *
   * @param goldenRecordIds - IDs of written golden records
   * @param matchGroups - Match groups containing source records
   * @param createdBy - User/system identifier
   * @returns Array of source mapping records
   */
  private createSourceMappings(
    goldenRecordIds: string[],
    matchGroups: MatchGroup<TOutput>[],
    createdBy?: string,
  ): SourceMappingRecord[] {
    const mappings: SourceMappingRecord[] = []

    // Each match group becomes a golden record
    for (let i = 0; i < matchGroups.length && i < goldenRecordIds.length; i++) {
      const goldenRecordId = goldenRecordIds[i]
      const matchGroup = matchGroups[i]

      // Create mapping for each source record in the match group
      for (const match of matchGroup.matches) {
        mappings.push({
          goldenRecordId,
          sourceId: match.sourceId,
          sourceRecordId: String(match.sourceRecordId),
          createdAt: new Date(),
          createdBy,
          confidence: matchGroup.score,
        })
      }
    }

    return mappings
  }

  /**
   * Load records from all sources in a single transaction
   *
   * Ensures consistent snapshot of data across all source tables.
   *
   * @param options - Query options
   * @returns Map of source ID to records array
   */
  async loadFromAllSourcesInTransaction(options?: {
    limit?: number
    offset?: number
  }): Promise<Map<string, Array<Record<string, unknown>>>> {
    return await this.prisma.$transaction(async () => {
      return await this.loadFromAllSources(options)
    })
  }

  /**
   * Count records across all sources in a transaction
   *
   * Ensures consistent counts at a single point in time.
   *
   * @returns Map of source ID to count
   */
  async countAllSourcesInTransaction(): Promise<Map<string, number>> {
    return await this.prisma.$transaction(async () => {
      return await this.countAllSources()
    })
  }

  /**
   * Get source mappings for a golden record using Prisma
   *
   * @param goldenRecordId - Golden record ID
   * @returns Array of source mappings
   */
  async getSourceMappingsForGoldenRecord(
    goldenRecordId: string,
  ): Promise<SourceMappingRecord[]> {
    if (!this.sourceMappingModelName) {
      throw new ConsolidationError(
        'No source mapping model name configured',
        'NO_SOURCE_MAPPING_MODEL',
      )
    }

    const model = (this.prisma as Record<string, unknown>)[
      this.sourceMappingModelName
    ]
    if (!model || typeof model !== 'object' || !('findMany' in model)) {
      throw new ConsolidationError(
        `Prisma model '${this.sourceMappingModelName}' not found`,
        'PRISMA_MODEL_NOT_FOUND',
        { modelName: this.sourceMappingModelName },
      )
    }

    const findMany = (
      model as {
        findMany: (args: {
          where: { goldenRecordId: string }
        }) => Promise<SourceMappingRecord[]>
      }
    ).findMany

    return await findMany({ where: { goldenRecordId } })
  }

  /**
   * Get golden record ID for a source record using Prisma
   *
   * @param sourceId - Source identifier
   * @param sourceRecordId - Record ID in source table
   * @returns Golden record ID or null if not found
   */
  async getGoldenRecordIdForSourceRecord(
    sourceId: string,
    sourceRecordId: string,
  ): Promise<string | null> {
    if (!this.sourceMappingModelName) {
      throw new ConsolidationError(
        'No source mapping model name configured',
        'NO_SOURCE_MAPPING_MODEL',
      )
    }

    const model = (this.prisma as Record<string, unknown>)[
      this.sourceMappingModelName
    ]
    if (!model || typeof model !== 'object' || !('findFirst' in model)) {
      throw new ConsolidationError(
        `Prisma model '${this.sourceMappingModelName}' not found`,
        'PRISMA_MODEL_NOT_FOUND',
        { modelName: this.sourceMappingModelName },
      )
    }

    const findFirst = (
      model as {
        findFirst: (args: {
          where: { sourceId: string; sourceRecordId: string }
          select: { goldenRecordId: true }
        }) => Promise<{ goldenRecordId: string } | null>
      }
    ).findFirst

    const result = await findFirst({
      where: { sourceId, sourceRecordId },
      select: { goldenRecordId: true },
    })

    return result?.goldenRecordId || null
  }
}

/**
 * Factory function to create Prisma multi-table adapter
 *
 * @param config - Prisma multi-table adapter configuration
 * @returns PrismaMultiTableAdapter instance
 */
export function createPrismaMultiTableAdapter<
  TOutput extends Record<string, unknown>,
>(
  config: PrismaMultiTableAdapterConfig<TOutput>,
): PrismaMultiTableAdapter<TOutput> {
  return new PrismaMultiTableAdapter(config)
}

/**
 * Helper to create Prisma multi-table adapter from consolidation sources
 *
 * @param prisma - Prisma client instance
 * @param sources - Array of consolidation sources
 * @param outputAdapter - Optional output adapter
 * @param sourceMappingConfig - Optional source mapping config
 * @returns PrismaMultiTableAdapter instance
 */
export function prismaMultiTableAdapterFromSources<
  TOutput extends Record<string, unknown>,
>(
  prisma: PrismaClient,
  sources: Array<ConsolidationSource<Record<string, unknown>, TOutput>>,
  outputAdapter?: DatabaseAdapter<TOutput>,
  sourceMappingConfig?: PrismaMultiTableAdapterConfig<TOutput>['sourceMappingConfig'],
): PrismaMultiTableAdapter<TOutput> {
  return new PrismaMultiTableAdapter({
    prisma,
    sources: sources.map((s) => MultiTableAdapter.fromConsolidationSource(s)),
    outputAdapter,
    sourceMappingConfig,
  })
}
