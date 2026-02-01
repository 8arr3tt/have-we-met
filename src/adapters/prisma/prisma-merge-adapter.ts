/**
 * Prisma merge adapter for golden record archive/restore and provenance tracking
 * @module adapters/prisma/prisma-merge-adapter
 */

import type { Provenance } from '../../merge/types.js'
import type {
  MergeAdapter,
  ProvenanceAdapter,
  ArchivedRecord,
  UnmergeInfo,
  MergeAdapterConfig,
} from '../merge-adapter.js'
import { DEFAULT_MERGE_ADAPTER_CONFIG } from '../merge-adapter.js'
import { QueryError, NotFoundError } from '../adapter-error.js'

type PrismaClient = {
  $transaction: <R>(callback: (tx: PrismaClient) => Promise<R>) => Promise<R>
} & Record<string, Record<string, CallableFunction>>

/**
 * Prisma implementation of the provenance adapter
 */
export class PrismaProvenanceAdapter implements ProvenanceAdapter {
  private readonly prisma: PrismaClient
  private readonly tableName: string

  constructor(prisma: PrismaClient, tableName: string = 'provenance') {
    this.prisma = prisma
    this.tableName = tableName
  }

  private getModel() {
    const model = (this.prisma as Record<string, unknown>)[this.tableName]
    if (!model || typeof model !== 'object') {
      throw new QueryError(`Model '${this.tableName}' not found in Prisma client`, {
        modelName: this.tableName,
      })
    }
    return model as Record<string, CallableFunction>
  }

  async save(provenance: Provenance): Promise<void> {
    try {
      const model = this.getModel()
      await model.upsert({
        where: { goldenRecordId: provenance.goldenRecordId },
        update: {
          sourceRecordIds: provenance.sourceRecordIds,
          mergedAt: provenance.mergedAt,
          mergedBy: provenance.mergedBy,
          queueItemId: provenance.queueItemId,
          fieldSources: JSON.stringify(provenance.fieldSources),
          strategyUsed: JSON.stringify(provenance.strategyUsed),
          unmerged: provenance.unmerged ?? false,
          unmergedAt: provenance.unmergedAt,
          unmergedBy: provenance.unmergedBy,
          unmergeReason: provenance.unmergeReason,
        },
        create: {
          goldenRecordId: provenance.goldenRecordId,
          sourceRecordIds: provenance.sourceRecordIds,
          mergedAt: provenance.mergedAt,
          mergedBy: provenance.mergedBy,
          queueItemId: provenance.queueItemId,
          fieldSources: JSON.stringify(provenance.fieldSources),
          strategyUsed: JSON.stringify(provenance.strategyUsed),
          unmerged: provenance.unmerged ?? false,
          unmergedAt: provenance.unmergedAt,
          unmergedBy: provenance.unmergedBy,
          unmergeReason: provenance.unmergeReason,
        },
      })
    } catch (error) {
      throw new QueryError('Failed to save provenance', {
        goldenRecordId: provenance.goldenRecordId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  async get(goldenRecordId: string): Promise<Provenance | null> {
    try {
      const model = this.getModel()
      const result = await model.findUnique({
        where: { goldenRecordId },
      })

      if (!result) {
        return null
      }

      return this.mapToProvenance(result as Record<string, unknown>)
    } catch (error) {
      throw new QueryError('Failed to get provenance', {
        goldenRecordId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  async getBySourceId(sourceId: string): Promise<Provenance[]> {
    try {
      const model = this.getModel()
      const results = await model.findMany({
        where: {
          sourceRecordIds: {
            has: sourceId,
          },
        },
      })

      return (results as Record<string, unknown>[]).map((r) => this.mapToProvenance(r))
    } catch (error) {
      throw new QueryError('Failed to get provenance by source ID', {
        sourceId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  async markUnmerged(goldenRecordId: string, info: UnmergeInfo): Promise<void> {
    try {
      const model = this.getModel()
      const result = await model.update({
        where: { goldenRecordId },
        data: {
          unmerged: true,
          unmergedAt: info.unmergedAt,
          unmergedBy: info.unmergedBy,
          unmergeReason: info.reason,
        },
      })

      if (!result) {
        throw new NotFoundError(`Provenance not found for golden record: ${goldenRecordId}`, {
          goldenRecordId,
        })
      }
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error
      }
      throw new QueryError('Failed to mark provenance as unmerged', {
        goldenRecordId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  async delete(goldenRecordId: string): Promise<boolean> {
    try {
      const model = this.getModel()
      await model.delete({
        where: { goldenRecordId },
      })
      return true
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.includes('Record to delete does not exist') ||
          error.message.includes('not found'))
      ) {
        return false
      }
      throw new QueryError('Failed to delete provenance', {
        goldenRecordId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  async exists(goldenRecordId: string): Promise<boolean> {
    try {
      const model = this.getModel()
      const count = await model.count({
        where: { goldenRecordId },
      })
      return count > 0
    } catch (error) {
      throw new QueryError('Failed to check provenance existence', {
        goldenRecordId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  async count(includeUnmerged: boolean = false): Promise<number> {
    try {
      const model = this.getModel()
      const where = includeUnmerged ? {} : { unmerged: false }
      return await model.count({ where })
    } catch (error) {
      throw new QueryError('Failed to count provenance records', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  private mapToProvenance(record: Record<string, unknown>): Provenance {
    return {
      goldenRecordId: record.goldenRecordId as string,
      sourceRecordIds: record.sourceRecordIds as string[],
      mergedAt: new Date(record.mergedAt as string | Date),
      mergedBy: record.mergedBy as string | undefined,
      queueItemId: record.queueItemId as string | undefined,
      fieldSources:
        typeof record.fieldSources === 'string'
          ? JSON.parse(record.fieldSources)
          : record.fieldSources,
      strategyUsed:
        typeof record.strategyUsed === 'string'
          ? JSON.parse(record.strategyUsed)
          : record.strategyUsed,
      unmerged: record.unmerged as boolean | undefined,
      unmergedAt: record.unmergedAt ? new Date(record.unmergedAt as string | Date) : undefined,
      unmergedBy: record.unmergedBy as string | undefined,
      unmergeReason: record.unmergeReason as string | undefined,
    }
  }
}

/**
 * Prisma implementation of the merge adapter for archive/restore operations
 */
export class PrismaMergeAdapter<T extends Record<string, unknown>>
  implements MergeAdapter<T>
{
  private readonly prisma: PrismaClient
  private readonly tableName: string
  private readonly primaryKey: string
  private readonly config: Required<MergeAdapterConfig>
  readonly provenance: ProvenanceAdapter

  constructor(
    prisma: PrismaClient,
    tableName: string,
    primaryKey: string = 'id',
    config?: MergeAdapterConfig
  ) {
    this.prisma = prisma
    this.tableName = tableName
    this.primaryKey = primaryKey
    this.config = { ...DEFAULT_MERGE_ADAPTER_CONFIG, ...config }
    this.provenance = new PrismaProvenanceAdapter(prisma, this.config.provenanceTable)
  }

  private getModel() {
    const model = (this.prisma as Record<string, unknown>)[this.tableName]
    if (!model || typeof model !== 'object') {
      throw new QueryError(`Model '${this.tableName}' not found in Prisma client`, {
        modelName: this.tableName,
      })
    }
    return model as Record<string, CallableFunction>
  }

  async archive(
    ids: string[],
    options?: { reason?: string; mergedIntoId?: string }
  ): Promise<void> {
    if (ids.length === 0) return

    try {
      const model = this.getModel()
      const now = new Date()

      await model.updateMany({
        where: {
          [this.primaryKey]: { in: ids },
        },
        data: {
          [this.config.archivedAtField]: now,
          [this.config.archivedReasonField]: options?.reason ?? 'merged',
          [this.config.mergedIntoIdField]: options?.mergedIntoId,
        },
      })
    } catch (error) {
      throw new QueryError('Failed to archive records', {
        ids,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  async restore(ids: string[]): Promise<T[]> {
    if (ids.length === 0) return []

    try {
      const model = this.getModel()

      await model.updateMany({
        where: {
          [this.primaryKey]: { in: ids },
          [this.config.archivedAtField]: { not: null },
        },
        data: {
          [this.config.archivedAtField]: null,
          [this.config.archivedReasonField]: null,
          [this.config.mergedIntoIdField]: null,
        },
      })

      const results = await model.findMany({
        where: {
          [this.primaryKey]: { in: ids },
        },
      })

      return results as T[]
    } catch (error) {
      throw new QueryError('Failed to restore records', {
        ids,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  async getArchived(ids: string[]): Promise<ArchivedRecord<T>[]> {
    if (ids.length === 0) return []

    try {
      const model = this.getModel()

      const results = await model.findMany({
        where: {
          [this.primaryKey]: { in: ids },
          [this.config.archivedAtField]: { not: null },
        },
      })

      return (results as Record<string, unknown>[]).map((r) => this.mapToArchivedRecord(r))
    } catch (error) {
      throw new QueryError('Failed to get archived records', {
        ids,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  async isArchived(ids: string[]): Promise<Map<string, boolean>> {
    const result = new Map<string, boolean>()
    if (ids.length === 0) return result

    try {
      const model = this.getModel()

      const archived = await model.findMany({
        where: {
          [this.primaryKey]: { in: ids },
          [this.config.archivedAtField]: { not: null },
        },
        select: { [this.primaryKey]: true },
      })

      const archivedIds = new Set(
        (archived as Record<string, unknown>[]).map((r) => r[this.primaryKey] as string)
      )

      for (const id of ids) {
        result.set(id, archivedIds.has(id))
      }

      return result
    } catch (error) {
      throw new QueryError('Failed to check archived status', {
        ids,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  async getArchivedByGoldenRecord(goldenRecordId: string): Promise<ArchivedRecord<T>[]> {
    try {
      const model = this.getModel()

      const results = await model.findMany({
        where: {
          [this.config.mergedIntoIdField]: goldenRecordId,
          [this.config.archivedAtField]: { not: null },
        },
      })

      return (results as Record<string, unknown>[]).map((r) => this.mapToArchivedRecord(r))
    } catch (error) {
      throw new QueryError('Failed to get archived records by golden record', {
        goldenRecordId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  async permanentlyDeleteArchived(ids: string[]): Promise<void> {
    if (ids.length === 0) return

    try {
      const model = this.getModel()

      await model.deleteMany({
        where: {
          [this.primaryKey]: { in: ids },
          [this.config.archivedAtField]: { not: null },
        },
      })
    } catch (error) {
      throw new QueryError('Failed to permanently delete archived records', {
        ids,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  async countArchived(goldenRecordId?: string): Promise<number> {
    try {
      const model = this.getModel()

      const where: Record<string, unknown> = {
        [this.config.archivedAtField]: { not: null },
      }

      if (goldenRecordId) {
        where[this.config.mergedIntoIdField] = goldenRecordId
      }

      return await model.count({ where })
    } catch (error) {
      throw new QueryError('Failed to count archived records', {
        goldenRecordId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  private mapToArchivedRecord(record: Record<string, unknown>): ArchivedRecord<T> {
    const { [this.config.archivedAtField]: archivedAt, [this.config.archivedReasonField]: archivedReason, [this.config.mergedIntoIdField]: mergedIntoId, createdAt, updatedAt, ...rest } = record

    return {
      id: record[this.primaryKey] as string,
      record: rest as T,
      archivedAt: new Date(archivedAt as string | Date),
      archivedReason: archivedReason as string | undefined,
      mergedIntoId: mergedIntoId as string | undefined,
      createdAt: createdAt ? new Date(createdAt as string | Date) : new Date(),
      updatedAt: updatedAt ? new Date(updatedAt as string | Date) : new Date(),
    }
  }
}

/**
 * Creates a Prisma merge adapter instance
 *
 * @param prisma - Prisma client instance
 * @param tableName - Name of the table/model
 * @param primaryKey - Primary key field name (default: 'id')
 * @param config - Optional merge adapter configuration
 * @returns A new PrismaMergeAdapter instance
 */
export function createPrismaMergeAdapter<T extends Record<string, unknown>>(
  prisma: PrismaClient,
  tableName: string,
  primaryKey: string = 'id',
  config?: MergeAdapterConfig
): PrismaMergeAdapter<T> {
  return new PrismaMergeAdapter<T>(prisma, tableName, primaryKey, config)
}

/**
 * Creates a Prisma provenance adapter instance
 *
 * @param prisma - Prisma client instance
 * @param tableName - Name of the provenance table (default: 'provenance')
 * @returns A new PrismaProvenanceAdapter instance
 */
export function createPrismaProvenanceAdapter(
  prisma: PrismaClient,
  tableName: string = 'provenance'
): PrismaProvenanceAdapter {
  return new PrismaProvenanceAdapter(prisma, tableName)
}
