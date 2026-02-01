/**
 * TypeORM merge adapter for golden record archive/restore and provenance tracking
 * @module adapters/typeorm/typeorm-merge-adapter
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

type Repository<T> = {
  find: (options?: unknown) => Promise<T[]>
  findOne: (options?: unknown) => Promise<T | null>
  count: (options?: unknown) => Promise<number>
  save: (entity: unknown) => Promise<T>
  update: (criteria: unknown, partialEntity: unknown) => Promise<unknown>
  delete: (criteria: unknown) => Promise<unknown>
  insert: (entities: unknown) => Promise<unknown>
  createQueryBuilder: (alias?: string) => QueryBuilder
  manager: {
    connection: {
      transaction: <R>(callback: (manager: EntityManager) => Promise<R>) => Promise<R>
    }
  }
}

type QueryBuilder = {
  where: (condition: string, params?: unknown) => QueryBuilder
  andWhere: (condition: string, params?: unknown) => QueryBuilder
  orWhere: (condition: string, params?: unknown) => QueryBuilder
  select: (fields: string[]) => QueryBuilder
  getMany: () => Promise<unknown[]>
  getOne: () => Promise<unknown | null>
  getCount: () => Promise<number>
}

type EntityManager = {
  getRepository: <T>(target: unknown) => Repository<T>
}

/**
 * TypeORM implementation of the provenance adapter
 */
export class TypeORMProvenanceAdapter implements ProvenanceAdapter {
  private readonly repository: Repository<Record<string, unknown>>

  constructor(repository: Repository<Record<string, unknown>>) {
    this.repository = repository
  }

  async save(provenance: Provenance): Promise<void> {
    try {
      const existing = await this.repository.findOne({
        where: { goldenRecordId: provenance.goldenRecordId },
      })

      const data = {
        goldenRecordId: provenance.goldenRecordId,
        sourceRecordIds: JSON.stringify(provenance.sourceRecordIds),
        mergedAt: provenance.mergedAt,
        mergedBy: provenance.mergedBy,
        queueItemId: provenance.queueItemId,
        fieldSources: JSON.stringify(provenance.fieldSources),
        strategyUsed: JSON.stringify(provenance.strategyUsed),
        unmerged: provenance.unmerged ?? false,
        unmergedAt: provenance.unmergedAt,
        unmergedBy: provenance.unmergedBy,
        unmergeReason: provenance.unmergeReason,
      }

      if (existing) {
        await this.repository.update(
          { goldenRecordId: provenance.goldenRecordId },
          data
        )
      } else {
        await this.repository.save(data)
      }
    } catch (error) {
      throw new QueryError('Failed to save provenance', {
        goldenRecordId: provenance.goldenRecordId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  async get(goldenRecordId: string): Promise<Provenance | null> {
    try {
      const result = await this.repository.findOne({
        where: { goldenRecordId },
      })

      if (!result) {
        return null
      }

      return this.mapToProvenance(result)
    } catch (error) {
      throw new QueryError('Failed to get provenance', {
        goldenRecordId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  async getBySourceId(sourceId: string): Promise<Provenance[]> {
    try {
      const results = await this.repository
        .createQueryBuilder('p')
        .where('p.sourceRecordIds LIKE :sourceId', { sourceId: `%${sourceId}%` })
        .getMany()

      return (results as Record<string, unknown>[])
        .map((r) => this.mapToProvenance(r))
        .filter((p) => p.sourceRecordIds.includes(sourceId))
    } catch (error) {
      throw new QueryError('Failed to get provenance by source ID', {
        sourceId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  async markUnmerged(goldenRecordId: string, info: UnmergeInfo): Promise<void> {
    try {
      const result = await this.repository.update(
        { goldenRecordId },
        {
          unmerged: true,
          unmergedAt: info.unmergedAt,
          unmergedBy: info.unmergedBy,
          unmergeReason: info.reason,
        }
      )

      const affected = (result as { affected?: number }).affected
      if (affected === 0) {
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
      const result = await this.repository.delete({ goldenRecordId })
      const affected = (result as { affected?: number }).affected
      return (affected ?? 0) > 0
    } catch (error) {
      throw new QueryError('Failed to delete provenance', {
        goldenRecordId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  async exists(goldenRecordId: string): Promise<boolean> {
    try {
      const count = await this.repository.count({
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
      const where = includeUnmerged ? undefined : { unmerged: false }
      return await this.repository.count(where ? { where } : undefined)
    } catch (error) {
      throw new QueryError('Failed to count provenance records', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  private mapToProvenance(record: Record<string, unknown>): Provenance {
    return {
      goldenRecordId: record.goldenRecordId as string,
      sourceRecordIds:
        typeof record.sourceRecordIds === 'string'
          ? JSON.parse(record.sourceRecordIds)
          : (record.sourceRecordIds as string[]),
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
 * TypeORM implementation of the merge adapter for archive/restore operations
 */
export class TypeORMMergeAdapter<T extends Record<string, unknown>> implements MergeAdapter<T> {
  private readonly repository: Repository<T>
  private readonly primaryKey: string
  private readonly config: Required<MergeAdapterConfig>
  readonly provenance?: ProvenanceAdapter

  constructor(
    repository: Repository<T>,
    primaryKey: string = 'id',
    config?: MergeAdapterConfig,
    provenanceRepository?: Repository<Record<string, unknown>>
  ) {
    this.repository = repository
    this.primaryKey = primaryKey
    this.config = { ...DEFAULT_MERGE_ADAPTER_CONFIG, ...config }

    if (provenanceRepository && this.config.trackProvenance) {
      this.provenance = new TypeORMProvenanceAdapter(provenanceRepository)
    }
  }

  async archive(
    ids: string[],
    options?: { reason?: string; mergedIntoId?: string }
  ): Promise<void> {
    if (ids.length === 0) return

    try {
      const now = new Date()

      await this.repository.update(
        { [this.primaryKey]: { $in: ids } } as unknown,
        {
          [this.config.archivedAtField]: now,
          [this.config.archivedReasonField]: options?.reason ?? 'merged',
          [this.config.mergedIntoIdField]: options?.mergedIntoId,
        } as unknown
      )
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
      await this.repository.update(
        {
          [this.primaryKey]: { $in: ids },
          [this.config.archivedAtField]: { $ne: null },
        } as unknown,
        {
          [this.config.archivedAtField]: null,
          [this.config.archivedReasonField]: null,
          [this.config.mergedIntoIdField]: null,
        } as unknown
      )

      const results = await this.repository.find({
        where: {
          [this.primaryKey]: { $in: ids },
        },
      })

      return results
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
      const results = await this.repository.find({
        where: {
          [this.primaryKey]: { $in: ids },
          [this.config.archivedAtField]: { $ne: null },
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
      const archived = await this.repository
        .createQueryBuilder('r')
        .select([`r.${this.primaryKey}`])
        .where(`r.${this.primaryKey} IN (:...ids)`, { ids })
        .andWhere(`r.${this.config.archivedAtField} IS NOT NULL`)
        .getMany()

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
      const results = await this.repository.find({
        where: {
          [this.config.mergedIntoIdField]: goldenRecordId,
          [this.config.archivedAtField]: { $ne: null },
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
      await this.repository
        .createQueryBuilder()
        .where(`${this.primaryKey} IN (:...ids)`, { ids })
        .andWhere(`${this.config.archivedAtField} IS NOT NULL`)
        .getMany()

      await this.repository.delete({
        [this.primaryKey]: { $in: ids },
        [this.config.archivedAtField]: { $ne: null },
      } as unknown)
    } catch (error) {
      throw new QueryError('Failed to permanently delete archived records', {
        ids,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  async countArchived(goldenRecordId?: string): Promise<number> {
    try {
      const where: Record<string, unknown> = {
        [this.config.archivedAtField]: { $ne: null },
      }

      if (goldenRecordId) {
        where[this.config.mergedIntoIdField] = goldenRecordId
      }

      return await this.repository.count({ where })
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
 * Creates a TypeORM merge adapter instance
 *
 * @param repository - TypeORM repository instance
 * @param primaryKey - Primary key field name (default: 'id')
 * @param config - Optional merge adapter configuration
 * @param provenanceRepository - Optional provenance repository for tracking
 * @returns A new TypeORMMergeAdapter instance
 */
export function createTypeORMMergeAdapter<T extends Record<string, unknown>>(
  repository: Repository<T>,
  primaryKey: string = 'id',
  config?: MergeAdapterConfig,
  provenanceRepository?: Repository<Record<string, unknown>>
): TypeORMMergeAdapter<T> {
  return new TypeORMMergeAdapter<T>(repository, primaryKey, config, provenanceRepository)
}

/**
 * Creates a TypeORM provenance adapter instance
 *
 * @param repository - TypeORM repository for provenance table
 * @returns A new TypeORMProvenanceAdapter instance
 */
export function createTypeORMProvenanceAdapter(
  repository: Repository<Record<string, unknown>>
): TypeORMProvenanceAdapter {
  return new TypeORMProvenanceAdapter(repository)
}
