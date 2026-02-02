import type { QueueItem, QueueFilter } from '../../queue/types.js'
import { BaseQueueAdapter } from '../queue-adapter-base.js'
import { QueryError, NotFoundError } from '../adapter-error.js'
import type { QueueOptions } from '../../builder/queue-options.js'

type PrismaClient = {
  $transaction: <R>(callback: (tx: PrismaClient) => Promise<R>) => Promise<R>
} & Record<string, Record<string, CallableFunction>>

/**
 * Prisma implementation of the queue adapter.
 * Persists review queue items using Prisma ORM.
 */
export class PrismaQueueAdapter<
  T extends Record<string, unknown>,
> extends BaseQueueAdapter<T> {
  private readonly prisma: PrismaClient
  private readonly queueTableName: string

  constructor(
    prisma: PrismaClient,
    options?: QueueOptions,
    queueTableName: string = 'reviewQueue'
  ) {
    super(options)
    this.prisma = prisma
    this.queueTableName = queueTableName
  }

  private getQueueModel() {
    const model = (this.prisma as Record<string, unknown>)[this.queueTableName]
    if (!model || typeof model !== 'object') {
      throw new QueryError(
        `Queue model '${this.queueTableName}' not found in Prisma client`,
        {
          queueTableName: this.queueTableName,
        }
      )
    }
    return model as Record<string, CallableFunction>
  }

  private buildWhereClause(filter: QueueFilter): Record<string, unknown> {
    const where: Record<string, unknown> = {}
    const normalized = this.normalizeFilter(filter)

    if (normalized.status && Array.isArray(normalized.status)) {
      where.status = { in: normalized.status }
    }

    if (normalized.tags && normalized.tags.length > 0) {
      where.tags = { hasEvery: normalized.tags }
    }

    if (normalized.since || normalized.until) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      where.createdAt = {} as any
      if (normalized.since) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(where.createdAt as any).gte = normalized.since
      }
      if (normalized.until) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(where.createdAt as any).lte = normalized.until
      }
    }

    if (normalized.priority) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      where.priority = {} as any
      if (normalized.priority.min !== undefined) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(where.priority as any).gte = normalized.priority.min
      }
      if (normalized.priority.max !== undefined) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(where.priority as any).lte = normalized.priority.max
      }
    }

    return where
  }

  async insertQueueItem(item: QueueItem<T>): Promise<QueueItem<T>> {
    this.validateQueueItem(item)

    try {
      const model = this.getQueueModel()
      const serialized = this.serializeQueueItem(item)

      const result = (await model.create({
        data: serialized,
      })) as Record<string, unknown>

      return this.deserializeQueueItem(result)
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
      const model = this.getQueueModel()
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

      const result = (await model.update({
        where: { id },
        data: serializedUpdates,
      })) as Record<string, unknown>

      return this.deserializeQueueItem(result)
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.includes('Record to update not found') ||
          error.message.includes('not found'))
      ) {
        throw new NotFoundError(`Queue item with id '${id}' not found`, { id })
      }

      throw new QueryError('Failed to update queue item', {
        id,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  async findQueueItems(filter: QueueFilter): Promise<QueueItem<T>[]> {
    try {
      const model = this.getQueueModel()
      const where = this.buildWhereClause(filter)

      const queryOptions: Record<string, unknown> = {
        where,
        take: filter.limit,
        skip: filter.offset,
      }

      if (filter.orderBy) {
        queryOptions.orderBy = {
          [filter.orderBy.field]: filter.orderBy.direction,
        }
      }

      const results = (await model.findMany(queryOptions)) as Record<
        string,
        unknown
      >[]
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
      const model = this.getQueueModel()
      const result = (await model.findUnique({
        where: { id },
      })) as Record<string, unknown> | null

      if (!result) {
        return null
      }

      return this.deserializeQueueItem(result)
    } catch (error) {
      throw new QueryError('Failed to find queue item by id', {
        id,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  async deleteQueueItem(id: string): Promise<void> {
    try {
      const model = this.getQueueModel()
      await model.delete({
        where: { id },
      })
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.includes('Record to delete does not exist') ||
          error.message.includes('not found'))
      ) {
        throw new NotFoundError(`Queue item with id '${id}' not found`, { id })
      }

      throw new QueryError('Failed to delete queue item', {
        id,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  async countQueueItems(filter?: QueueFilter): Promise<number> {
    try {
      const model = this.getQueueModel()
      const where = filter ? this.buildWhereClause(filter) : undefined

      const result = (await model.count({ where })) as number
      return result
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
      const model = this.getQueueModel()
      const serialized = items.map((item) => {
        this.validateQueueItem(item)
        return this.serializeQueueItem(item)
      })

      await model.createMany({
        data: serialized,
        skipDuplicates: false,
      })

      const ids = items.map((item) => item.id)
      const results = (await model.findMany({
        where: { id: { in: ids } },
      })) as Record<string, unknown>[]

      return results.map((row) => this.deserializeQueueItem(row))
    } catch (error) {
      throw new QueryError('Failed to batch insert queue items', {
        itemCount: items.length,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
}
