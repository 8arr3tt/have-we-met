/**
 * Drizzle merge adapter for golden record archive/restore and provenance tracking
 * @module adapters/drizzle/drizzle-merge-adapter
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

type DrizzleDatabase = {
  select: (fields?: Record<string, unknown>) => {
    from: (table: unknown) => DrizzleQuery
  }
  insert: (table: unknown) => {
    values: (values: unknown) => {
      returning: () => Promise<unknown[]>
      onConflictDoUpdate: (config: unknown) => {
        returning: () => Promise<unknown[]>
      }
    }
  }
  update: (table: unknown) => {
    set: (values: unknown) => {
      where: (condition: unknown) => { returning: () => Promise<unknown[]> }
    }
  }
  delete: (table: unknown) => {
    where: (condition: unknown) => Promise<void>
  }
  transaction: <R>(callback: (tx: DrizzleDatabase) => Promise<R>) => Promise<R>
}

type DrizzleQuery = {
  where: (condition: unknown) => DrizzleQuery
  limit: (count: number) => DrizzleQuery
  offset: (count: number) => DrizzleQuery
  orderBy: (...columns: unknown[]) => DrizzleQuery
}

type DrizzleTable = {
  [key: string]: {
    name: string
  }
}

type DrizzleOperators = {
  eq: (column: unknown, value: unknown) => unknown
  ne: (column: unknown, value: unknown) => unknown
  gt: (column: unknown, value: unknown) => unknown
  gte: (column: unknown, value: unknown) => unknown
  lt: (column: unknown, value: unknown) => unknown
  lte: (column: unknown, value: unknown) => unknown
  inArray: (column: unknown, values: unknown[]) => unknown
  arrayContains: (column: unknown, values: unknown[]) => unknown
  like: (column: unknown, pattern: unknown) => unknown
  and: (...conditions: unknown[]) => unknown
  or: (...conditions: unknown[]) => unknown
  isNull: (column: unknown) => unknown
  isNotNull: (column: unknown) => unknown
  asc: (column: unknown) => unknown
  desc: (column: unknown) => unknown
  count: () => unknown
}

/**
 * Drizzle implementation of the provenance adapter
 */
export class DrizzleProvenanceAdapter implements ProvenanceAdapter {
  private readonly db: DrizzleDatabase
  private readonly table: DrizzleTable
  private readonly operators: DrizzleOperators

  constructor(
    db: DrizzleDatabase,
    table: DrizzleTable,
    operators: DrizzleOperators
  ) {
    this.db = db
    this.table = table
    this.operators = operators
  }

  private getColumn(columnName: string): unknown {
    const column = (this.table as Record<string, unknown>)[columnName]
    if (!column) {
      throw new QueryError(`Column '${columnName}' not found in table schema`, {
        columnName,
        availableColumns: Object.keys(this.table),
      })
    }
    return column
  }

  async save(provenance: Provenance): Promise<void> {
    try {
      const goldenRecordIdCol = this.getColumn('goldenRecordId')

      await this.db
        .insert(this.table)
        .values({
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
        })
        .onConflictDoUpdate({
          target: goldenRecordIdCol,
          set: {
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
        .returning()
    } catch (error) {
      throw new QueryError('Failed to save provenance', {
        goldenRecordId: provenance.goldenRecordId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  async get(goldenRecordId: string): Promise<Provenance | null> {
    try {
      const goldenRecordIdCol = this.getColumn('goldenRecordId')
      const whereCondition = this.operators.eq(
        goldenRecordIdCol,
        goldenRecordId
      )

      const query = this.db
        .select()
        .from(this.table)
        .where(whereCondition)
        .limit(1)
      const results = (await (query as unknown as Promise<
        Record<string, unknown>[]
      >)) as Record<string, unknown>[]

      if (results.length === 0) {
        return null
      }

      return this.mapToProvenance(results[0])
    } catch (error) {
      throw new QueryError('Failed to get provenance', {
        goldenRecordId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  async getBySourceId(sourceId: string): Promise<Provenance[]> {
    try {
      const sourceRecordIdsCol = this.getColumn('sourceRecordIds')
      const whereCondition = this.operators.arrayContains(sourceRecordIdsCol, [
        sourceId,
      ])

      const query = this.db.select().from(this.table).where(whereCondition)
      const results = (await (query as unknown as Promise<
        Record<string, unknown>[]
      >)) as Record<string, unknown>[]

      return results.map((r) => this.mapToProvenance(r))
    } catch (error) {
      throw new QueryError('Failed to get provenance by source ID', {
        sourceId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  async markUnmerged(goldenRecordId: string, info: UnmergeInfo): Promise<void> {
    try {
      const goldenRecordIdCol = this.getColumn('goldenRecordId')
      const whereCondition = this.operators.eq(
        goldenRecordIdCol,
        goldenRecordId
      )

      const results = await this.db
        .update(this.table)
        .set({
          unmerged: true,
          unmergedAt: info.unmergedAt,
          unmergedBy: info.unmergedBy,
          unmergeReason: info.reason,
        })
        .where(whereCondition)
        .returning()

      if ((results as unknown[]).length === 0) {
        throw new NotFoundError(
          `Provenance not found for golden record: ${goldenRecordId}`,
          {
            goldenRecordId,
          }
        )
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
      const goldenRecordIdCol = this.getColumn('goldenRecordId')
      const whereCondition = this.operators.eq(
        goldenRecordIdCol,
        goldenRecordId
      )

      await this.db.delete(this.table).where(whereCondition)
      return true
    } catch (error) {
      throw new QueryError('Failed to delete provenance', {
        goldenRecordId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  async exists(goldenRecordId: string): Promise<boolean> {
    try {
      const goldenRecordIdCol = this.getColumn('goldenRecordId')
      const whereCondition = this.operators.eq(
        goldenRecordIdCol,
        goldenRecordId
      )

      const query = this.db
        .select({ count: this.operators.count() })
        .from(this.table)
        .where(whereCondition)
      const results = (await (query as unknown as Promise<
        Array<{ count: number }>
      >)) as Array<{
        count: number
      }>

      return (results[0]?.count ?? 0) > 0
    } catch (error) {
      throw new QueryError('Failed to check provenance existence', {
        goldenRecordId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  async count(includeUnmerged: boolean = false): Promise<number> {
    try {
      let query = this.db
        .select({ count: this.operators.count() })
        .from(this.table) as unknown as DrizzleQuery

      if (!includeUnmerged) {
        const unmergedCol = this.getColumn('unmerged')
        const whereCondition = this.operators.eq(unmergedCol, false)
        query = query.where(whereCondition)
      }

      const results = (await (query as unknown as Promise<
        Array<{ count: number }>
      >)) as Array<{
        count: number
      }>
      return results[0]?.count ?? 0
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
      unmergedAt: record.unmergedAt
        ? new Date(record.unmergedAt as string | Date)
        : undefined,
      unmergedBy: record.unmergedBy as string | undefined,
      unmergeReason: record.unmergeReason as string | undefined,
    }
  }
}

/**
 * Drizzle implementation of the merge adapter for archive/restore operations
 */
export class DrizzleMergeAdapter<
  T extends Record<string, unknown>,
> implements MergeAdapter<T> {
  private readonly db: DrizzleDatabase
  private readonly table: DrizzleTable
  private readonly operators: DrizzleOperators
  private readonly primaryKey: string
  private readonly config: Required<MergeAdapterConfig>
  readonly provenance?: ProvenanceAdapter

  constructor(
    db: DrizzleDatabase,
    table: DrizzleTable,
    operators: DrizzleOperators,
    primaryKey: string = 'id',
    config?: MergeAdapterConfig,
    provenanceTable?: DrizzleTable
  ) {
    this.db = db
    this.table = table
    this.operators = operators
    this.primaryKey = primaryKey
    this.config = { ...DEFAULT_MERGE_ADAPTER_CONFIG, ...config }

    if (provenanceTable && this.config.trackProvenance) {
      this.provenance = new DrizzleProvenanceAdapter(
        db,
        provenanceTable,
        operators
      )
    }
  }

  private getColumn(columnName: string): unknown {
    const column = (this.table as Record<string, unknown>)[columnName]
    if (!column) {
      throw new QueryError(`Column '${columnName}' not found in table schema`, {
        columnName,
        availableColumns: Object.keys(this.table),
      })
    }
    return column
  }

  async archive(
    ids: string[],
    options?: { reason?: string; mergedIntoId?: string }
  ): Promise<void> {
    if (ids.length === 0) return

    try {
      const primaryKeyCol = this.getColumn(this.primaryKey)
      const whereCondition = this.operators.inArray(primaryKeyCol, ids)
      const now = new Date()

      await this.db
        .update(this.table)
        .set({
          [this.config.archivedAtField]: now,
          [this.config.archivedReasonField]: options?.reason ?? 'merged',
          [this.config.mergedIntoIdField]: options?.mergedIntoId,
        })
        .where(whereCondition)
        .returning()
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
      const primaryKeyCol = this.getColumn(this.primaryKey)
      const archivedAtCol = this.getColumn(this.config.archivedAtField)

      const whereCondition = this.operators.and(
        this.operators.inArray(primaryKeyCol, ids),
        this.operators.isNotNull(archivedAtCol)
      )

      await this.db
        .update(this.table)
        .set({
          [this.config.archivedAtField]: null,
          [this.config.archivedReasonField]: null,
          [this.config.mergedIntoIdField]: null,
        })
        .where(whereCondition)
        .returning()

      const selectCondition = this.operators.inArray(primaryKeyCol, ids)
      const query = this.db.select().from(this.table).where(selectCondition)
      const results = (await (query as unknown as Promise<
        Record<string, unknown>[]
      >)) as Record<string, unknown>[]

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
      const primaryKeyCol = this.getColumn(this.primaryKey)
      const archivedAtCol = this.getColumn(this.config.archivedAtField)

      const whereCondition = this.operators.and(
        this.operators.inArray(primaryKeyCol, ids),
        this.operators.isNotNull(archivedAtCol)
      )

      const query = this.db.select().from(this.table).where(whereCondition)
      const results = (await (query as unknown as Promise<
        Record<string, unknown>[]
      >)) as Record<string, unknown>[]

      return results.map((r) => this.mapToArchivedRecord(r))
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
      const primaryKeyCol = this.getColumn(this.primaryKey)
      const archivedAtCol = this.getColumn(this.config.archivedAtField)

      const whereCondition = this.operators.and(
        this.operators.inArray(primaryKeyCol, ids),
        this.operators.isNotNull(archivedAtCol)
      )

      const query = this.db
        .select({ [this.primaryKey]: primaryKeyCol })
        .from(this.table)
        .where(whereCondition)
      const archived = (await (query as unknown as Promise<
        Record<string, unknown>[]
      >)) as Record<string, unknown>[]

      const archivedIds = new Set(
        archived.map((r) => r[this.primaryKey] as string)
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

  async getArchivedByGoldenRecord(
    goldenRecordId: string
  ): Promise<ArchivedRecord<T>[]> {
    try {
      const mergedIntoIdCol = this.getColumn(this.config.mergedIntoIdField)
      const archivedAtCol = this.getColumn(this.config.archivedAtField)

      const whereCondition = this.operators.and(
        this.operators.eq(mergedIntoIdCol, goldenRecordId),
        this.operators.isNotNull(archivedAtCol)
      )

      const query = this.db.select().from(this.table).where(whereCondition)
      const results = (await (query as unknown as Promise<
        Record<string, unknown>[]
      >)) as Record<string, unknown>[]

      return results.map((r) => this.mapToArchivedRecord(r))
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
      const primaryKeyCol = this.getColumn(this.primaryKey)
      const archivedAtCol = this.getColumn(this.config.archivedAtField)

      const whereCondition = this.operators.and(
        this.operators.inArray(primaryKeyCol, ids),
        this.operators.isNotNull(archivedAtCol)
      )

      await this.db.delete(this.table).where(whereCondition)
    } catch (error) {
      throw new QueryError('Failed to permanently delete archived records', {
        ids,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  async countArchived(goldenRecordId?: string): Promise<number> {
    try {
      const archivedAtCol = this.getColumn(this.config.archivedAtField)

      let whereCondition = this.operators.isNotNull(archivedAtCol)

      if (goldenRecordId) {
        const mergedIntoIdCol = this.getColumn(this.config.mergedIntoIdField)
        whereCondition = this.operators.and(
          whereCondition,
          this.operators.eq(mergedIntoIdCol, goldenRecordId)
        )
      }

      const query = this.db
        .select({ count: this.operators.count() })
        .from(this.table)
        .where(whereCondition)
      const results = (await (query as unknown as Promise<
        Array<{ count: number }>
      >)) as Array<{
        count: number
      }>

      return results[0]?.count ?? 0
    } catch (error) {
      throw new QueryError('Failed to count archived records', {
        goldenRecordId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  private mapToArchivedRecord(
    record: Record<string, unknown>
  ): ArchivedRecord<T> {
    const {
      [this.config.archivedAtField]: archivedAt,
      [this.config.archivedReasonField]: archivedReason,
      [this.config.mergedIntoIdField]: mergedIntoId,
      createdAt,
      updatedAt,
      ...rest
    } = record

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
 * Creates a Drizzle merge adapter instance
 *
 * @param db - Drizzle database instance
 * @param table - Drizzle table schema
 * @param operators - Drizzle SQL operators
 * @param primaryKey - Primary key field name (default: 'id')
 * @param config - Optional merge adapter configuration
 * @param provenanceTable - Optional provenance table schema for tracking
 * @returns A new DrizzleMergeAdapter instance
 */
export function createDrizzleMergeAdapter<T extends Record<string, unknown>>(
  db: DrizzleDatabase,
  table: DrizzleTable,
  operators: DrizzleOperators,
  primaryKey: string = 'id',
  config?: MergeAdapterConfig,
  provenanceTable?: DrizzleTable
): DrizzleMergeAdapter<T> {
  return new DrizzleMergeAdapter<T>(
    db,
    table,
    operators,
    primaryKey,
    config,
    provenanceTable
  )
}

/**
 * Creates a Drizzle provenance adapter instance
 *
 * @param db - Drizzle database instance
 * @param table - Drizzle provenance table schema
 * @param operators - Drizzle SQL operators
 * @returns A new DrizzleProvenanceAdapter instance
 */
export function createDrizzleProvenanceAdapter(
  db: DrizzleDatabase,
  table: DrizzleTable,
  operators: DrizzleOperators
): DrizzleProvenanceAdapter {
  return new DrizzleProvenanceAdapter(db, table, operators)
}
