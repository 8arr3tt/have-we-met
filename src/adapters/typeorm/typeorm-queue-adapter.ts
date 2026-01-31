import type { QueueItem, QueueFilter } from '../../queue/types.js'
import { BaseQueueAdapter } from '../queue-adapter-base.js'
import { QueryError, NotFoundError } from '../adapter-error.js'
import type { QueueOptions } from '../../builder/queue-options.js'

type Repository<T> = {
  find: (options?: unknown) => Promise<T[]>
  findOne: (options?: unknown) => Promise<T | null>
  count: (options?: unknown) => Promise<number>
  save: (entity: unknown) => Promise<T>
  update: (criteria: unknown, partialEntity: unknown) => Promise<unknown>
  delete: (criteria: unknown) => Promise<unknown>
  insert: (entities: unknown) => Promise<unknown>
}

/**
 * TypeORM implementation of the queue adapter.
 * Persists review queue items using TypeORM.
 */
export class TypeORMQueueAdapter<T extends Record<string, unknown>> extends BaseQueueAdapter<T> {
  private readonly queueRepository: Repository<Record<string, unknown>>

  constructor(queueRepository: Repository<Record<string, unknown>>, options?: QueueOptions) {
    super(options)
    this.queueRepository = queueRepository
  }

  private buildWhereClause(filter: QueueFilter): Record<string, unknown> {
    const where: Record<string, unknown> = {}
    const normalized = this.normalizeFilter(filter)

    if (normalized.status && Array.isArray(normalized.status)) {
      where.status = { $in: normalized.status }
    }

    if (normalized.tags && normalized.tags.length > 0) {
      where.tags = { $all: normalized.tags }
    }

    if (normalized.since) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (!where.createdAt) where.createdAt = {} as any
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(where.createdAt as any).$gte = normalized.since
    }

    if (normalized.until) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (!where.createdAt) where.createdAt = {} as any
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(where.createdAt as any).$lte = normalized.until
    }

    if (normalized.priority?.min !== undefined) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (!where.priority) where.priority = {} as any
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(where.priority as any).$gte = normalized.priority.min
    }

    if (normalized.priority?.max !== undefined) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (!where.priority) where.priority = {} as any
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(where.priority as any).$lte = normalized.priority.max
    }

    return where
  }

  async insertQueueItem(item: QueueItem<T>): Promise<QueueItem<T>> {
    this.validateQueueItem(item)

    try {
      const serialized = this.serializeQueueItem(item)
      const result = await this.queueRepository.save(serialized)
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
    updates: Partial<QueueItem<T>>,
  ): Promise<QueueItem<T>> {
    try {
      const serializedUpdates: Record<string, unknown> = {}

      if (updates.status !== undefined) {
        serializedUpdates.status = updates.status
      }
      if (updates.candidateRecord !== undefined) {
        serializedUpdates.candidateRecord = JSON.stringify(updates.candidateRecord)
      }
      if (updates.potentialMatches !== undefined) {
        serializedUpdates.potentialMatches = JSON.stringify(updates.potentialMatches)
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

      const updateResult = await this.queueRepository.update({ id }, serializedUpdates)

      const affected = (updateResult as { affected?: number }).affected
      if (affected === 0) {
        throw new NotFoundError(`Queue item with id '${id}' not found`, { id })
      }

      const updated = await this.queueRepository.findOne({ where: { id } })

      if (!updated) {
        throw new NotFoundError(`Queue item with id '${id}' not found after update`, { id })
      }

      return this.deserializeQueueItem(updated)
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
      const where = this.buildWhereClause(filter)

      const findOptions: Record<string, unknown> = {
        where,
        take: filter.limit,
        skip: filter.offset,
      }

      if (filter.orderBy) {
        findOptions.order = {
          [filter.orderBy.field]: filter.orderBy.direction.toUpperCase(),
        }
      }

      const results = await this.queueRepository.find(findOptions)
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
      const result = await this.queueRepository.findOne({
        where: { id },
      })

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
      const deleteResult = await this.queueRepository.delete({ id })

      const affected = (deleteResult as { affected?: number }).affected
      if (affected === 0) {
        throw new NotFoundError(`Queue item with id '${id}' not found`, { id })
      }
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error
      }

      throw new QueryError('Failed to delete queue item', {
        id,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  async countQueueItems(filter?: QueueFilter): Promise<number> {
    try {
      const where = filter ? this.buildWhereClause(filter) : undefined
      const result = await this.queueRepository.count(where ? { where } : undefined)
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
      const serialized = items.map((item) => {
        this.validateQueueItem(item)
        return this.serializeQueueItem(item)
      })

      await this.queueRepository.insert(serialized)

      const ids = items.map((item) => item.id)
      const results = await this.queueRepository.find({
        where: { id: { $in: ids } },
      })

      return results.map((row) => this.deserializeQueueItem(row))
    } catch (error) {
      throw new QueryError('Failed to batch insert queue items', {
        itemCount: items.length,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
}
