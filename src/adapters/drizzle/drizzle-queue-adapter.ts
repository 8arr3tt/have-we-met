import type { QueueItem, QueueFilter } from '../../queue/types.js'
import { BaseQueueAdapter } from '../queue-adapter-base.js'
import { QueryError, NotFoundError } from '../adapter-error.js'
import type { QueueOptions } from '../../builder/queue-options.js'

type DrizzleDatabase = {
  select: (fields?: Record<string, unknown>) => {
    from: (table: unknown) => DrizzleQuery
  }
  insert: (table: unknown) => {
    values: (values: unknown) => { returning: () => Promise<unknown[]> }
  }
  update: (table: unknown) => {
    set: (values: unknown) => {
      where: (condition: unknown) => { returning: () => Promise<unknown[]> }
    }
  }
  delete: (table: unknown) => {
    where: (condition: unknown) => Promise<void>
  }
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
  and: (...conditions: unknown[]) => unknown
  asc: (column: unknown) => unknown
  desc: (column: unknown) => unknown
  count: () => unknown
}

/**
 * Drizzle implementation of the queue adapter.
 * Persists review queue items using Drizzle ORM.
 */
export class DrizzleQueueAdapter<
  T extends Record<string, unknown>,
> extends BaseQueueAdapter<T> {
  private readonly db: DrizzleDatabase
  private readonly queueTable: DrizzleTable
  private readonly operators: DrizzleOperators

  constructor(
    db: DrizzleDatabase,
    queueTable: DrizzleTable,
    operators: DrizzleOperators,
    options?: QueueOptions
  ) {
    super(options)
    this.db = db
    this.queueTable = queueTable
    this.operators = operators
  }

  private getColumn(fieldName: string): unknown {
    const column = (this.queueTable as Record<string, unknown>)[fieldName]
    if (!column) {
      throw new QueryError(
        `Column '${fieldName}' not found in queue table schema`,
        {
          fieldName,
          availableColumns: Object.keys(this.queueTable),
        }
      )
    }
    return column
  }

  private buildWhereConditions(filter: QueueFilter): unknown {
    const conditions: unknown[] = []
    const normalized = this.normalizeFilter(filter)

    if (normalized.status && Array.isArray(normalized.status)) {
      const statusColumn = this.getColumn('status')
      conditions.push(this.operators.inArray(statusColumn, normalized.status))
    }

    if (normalized.tags && normalized.tags.length > 0) {
      const tagsColumn = this.getColumn('tags')
      conditions.push(this.operators.arrayContains(tagsColumn, normalized.tags))
    }

    if (normalized.since) {
      const createdAtColumn = this.getColumn('createdAt')
      conditions.push(this.operators.gte(createdAtColumn, normalized.since))
    }

    if (normalized.until) {
      const createdAtColumn = this.getColumn('createdAt')
      conditions.push(this.operators.lte(createdAtColumn, normalized.until))
    }

    if (normalized.priority?.min !== undefined) {
      const priorityColumn = this.getColumn('priority')
      conditions.push(
        this.operators.gte(priorityColumn, normalized.priority.min)
      )
    }

    if (normalized.priority?.max !== undefined) {
      const priorityColumn = this.getColumn('priority')
      conditions.push(
        this.operators.lte(priorityColumn, normalized.priority.max)
      )
    }

    return conditions.length === 0
      ? undefined
      : conditions.length === 1
        ? conditions[0]
        : this.operators.and(...conditions)
  }

  async insertQueueItem(item: QueueItem<T>): Promise<QueueItem<T>> {
    this.validateQueueItem(item)

    try {
      const serialized = this.serializeQueueItem(item)
      const result = (await this.db
        .insert(this.queueTable)
        .values(serialized)
        .returning()) as Record<string, unknown>[]

      if (result.length === 0) {
        throw new QueryError('Insert did not return a queue item', {
          itemId: item.id,
        })
      }

      return this.deserializeQueueItem(result[0])
    } catch (error) {
      throw new QueryError('Failed to insert queue item', {
        itemId: item.id,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  async updateQueueItem(
    id: string,
    updates: Partial<QueueItem<T>>
  ): Promise<QueueItem<T>> {
    try {
      const serializedUpdates: Record<string, unknown> = {}

      if (updates.status !== undefined) {
        serializedUpdates.status = updates.status
      }
      if (updates.candidateRecord !== undefined) {
        serializedUpdates.candidateRecord = JSON.stringify(
          updates.candidateRecord
        )
      }
      if (updates.potentialMatches !== undefined) {
        serializedUpdates.potentialMatches = JSON.stringify(
          updates.potentialMatches
        )
      }
      if (updates.decidedAt !== undefined) {
        serializedUpdates.decidedAt = updates.decidedAt
      }
      if (updates.decidedBy !== undefined) {
        serializedUpdates.decidedBy = updates.decidedBy
      }
      if (updates.decision !== undefined) {
        serializedUpdates.decision = JSON.stringify(updates.decision)
      }
      if (updates.context !== undefined) {
        serializedUpdates.context = JSON.stringify(updates.context)
      }
      if (updates.priority !== undefined) {
        serializedUpdates.priority = updates.priority
      }
      if (updates.tags !== undefined) {
        serializedUpdates.tags = updates.tags
      }

      serializedUpdates.updatedAt = new Date()

      const idColumn = this.getColumn('id')
      const whereCondition = this.operators.eq(idColumn, id)

      const result = (await this.db
        .update(this.queueTable)
        .set(serializedUpdates)
        .where(whereCondition)
        .returning()) as Record<string, unknown>[]

      if (result.length === 0) {
        throw new NotFoundError(`Queue item with id '${id}' not found`, { id })
      }

      return this.deserializeQueueItem(result[0])
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error
      }

      throw new QueryError('Failed to update queue item', {
        id,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  async findQueueItems(filter: QueueFilter): Promise<QueueItem<T>[]> {
    try {
      let query = this.db
        .select()
        .from(this.queueTable) as unknown as DrizzleQuery

      const whereCondition = this.buildWhereConditions(filter)
      if (whereCondition) {
        query = query.where(whereCondition)
      }

      if (filter.limit) {
        query = query.limit(filter.limit)
      }

      if (filter.offset) {
        query = query.offset(filter.offset)
      }

      if (filter.orderBy) {
        const column = this.getColumn(filter.orderBy.field)
        const orderFunc =
          filter.orderBy.direction === 'asc'
            ? this.operators.asc
            : this.operators.desc
        query = query.orderBy(orderFunc(column))
      }

      const results = (await (query as unknown as Promise<
        Record<string, unknown>[]
      >)) as Record<string, unknown>[]
      return results.map((row) => this.deserializeQueueItem(row))
    } catch (error) {
      throw new QueryError('Failed to find queue items', {
        filter,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  async findQueueItemById(id: string): Promise<QueueItem<T> | null> {
    try {
      const idColumn = this.getColumn('id')
      const whereCondition = this.operators.eq(idColumn, id)

      const query = this.db.select().from(this.queueTable).where(whereCondition)

      const results = (await (query as unknown as Promise<
        Record<string, unknown>[]
      >)) as Record<string, unknown>[]

      if (results.length === 0) {
        return null
      }

      return this.deserializeQueueItem(results[0])
    } catch (error) {
      throw new QueryError('Failed to find queue item by id', {
        id,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  async deleteQueueItem(id: string): Promise<void> {
    try {
      const idColumn = this.getColumn('id')
      const whereCondition = this.operators.eq(idColumn, id)

      await this.db.delete(this.queueTable).where(whereCondition)
    } catch (error) {
      throw new QueryError('Failed to delete queue item', {
        id,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  async countQueueItems(filter?: QueueFilter): Promise<number> {
    try {
      let query = this.db
        .select({ count: this.operators.count() })
        .from(this.queueTable) as unknown as DrizzleQuery

      if (filter) {
        const whereCondition = this.buildWhereConditions(filter)
        if (whereCondition) {
          query = query.where(whereCondition)
        }
      }

      const result = (await (query as unknown as Promise<
        Array<{ count: number }>
      >)) as Array<{
        count: number
      }>
      return result[0]?.count ?? 0
    } catch (error) {
      throw new QueryError('Failed to count queue items', {
        filter,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  async batchInsertQueueItems(items: QueueItem<T>[]): Promise<QueueItem<T>[]> {
    if (items.length === 0) {
      return []
    }

    try {
      const serialized = items.map((item) => {
        this.validateQueueItem(item)
        return this.serializeQueueItem(item)
      })

      const results = (await this.db
        .insert(this.queueTable)
        .values(serialized)
        .returning()) as Record<string, unknown>[]

      return results.map((row) => this.deserializeQueueItem(row))
    } catch (error) {
      throw new QueryError('Failed to batch insert queue items', {
        itemCount: items.length,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
}
