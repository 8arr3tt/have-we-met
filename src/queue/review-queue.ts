/**
 * Review queue implementation for human-in-the-loop matching
 * @module queue/review-queue
 */

import { v4 as uuidv4 } from 'uuid'
import type {
  QueueAdapter,
  QueueItem,
  AddQueueItemRequest,
  ListQueueOptions,
  QueueItemList,
  ConfirmDecision,
  RejectDecision,
  MergeDecision,
  QueueStatus,
  QueueStats,
  CleanupOptions,
  StatsOptions,
  ReviewQueue as IReviewQueue,
  QueueFilter,
} from './types.js'
import {
  validateQueueItem,
  validateStatusTransition,
  validateQueueDecision,
} from './validation.js'
import { QueueItemNotFoundError, QueueOperationError } from './queue-error.js'
import { QueueMetrics, type AgeDistribution } from './metrics.js'

/**
 * Default configuration options
 */
const DEFAULT_PRIORITY = 0
const DEFAULT_LIMIT = 50
const DEFAULT_ORDER_BY = 'createdAt'
const DEFAULT_ORDER_DIRECTION = 'asc'

/**
 * ReviewQueue implementation
 */
export class ReviewQueue<T extends Record<string, unknown>> implements IReviewQueue<T> {
  constructor(private readonly adapter: QueueAdapter<T>) {}

  /**
   * Add a new item to the review queue
   */
  async add(item: AddQueueItemRequest<T>): Promise<QueueItem<T>> {
    // Validate the item
    validateQueueItem(item)

    // Create the queue item
    const now = new Date()
    const queueItem: QueueItem<T> = {
      id: uuidv4(),
      candidateRecord: item.candidateRecord,
      potentialMatches: item.potentialMatches,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      context: item.context,
      priority: item.priority ?? DEFAULT_PRIORITY,
      tags: item.tags,
    }

    // Persist via adapter
    try {
      return await this.adapter.insertQueueItem(queueItem)
    } catch (error) {
      throw new QueueOperationError('add', (error as Error).message, { item })
    }
  }

  /**
   * Batch add multiple items to the queue
   */
  async addBatch(items: AddQueueItemRequest<T>[]): Promise<QueueItem<T>[]> {
    // Validate all items first
    for (let i = 0; i < items.length; i++) {
      try {
        validateQueueItem(items[i])
      } catch (error) {
        throw new QueueOperationError('addBatch', `Validation failed for item at index ${i}`, {
          index: i,
          error: (error as Error).message,
        })
      }
    }

    // Create queue items
    const now = new Date()
    const queueItems: QueueItem<T>[] = items.map((item) => ({
      id: uuidv4(),
      candidateRecord: item.candidateRecord,
      potentialMatches: item.potentialMatches,
      status: 'pending' as const,
      createdAt: now,
      updatedAt: now,
      context: item.context,
      priority: item.priority ?? DEFAULT_PRIORITY,
      tags: item.tags,
    }))

    // Persist via adapter
    try {
      return await this.adapter.batchInsertQueueItems(queueItems)
    } catch (error) {
      throw new QueueOperationError('addBatch', (error as Error).message, { count: items.length })
    }
  }

  /**
   * List queue items with filtering and pagination
   */
  async list(options: ListQueueOptions = {}): Promise<QueueItemList<T>> {
    // Build filter from options
    const filter: QueueFilter = {
      status: options.status,
      tags: options.tags,
      since: options.since,
      until: options.until,
      limit: options.limit ?? DEFAULT_LIMIT,
      offset: options.offset ?? 0,
      orderBy: {
        field: options.orderBy ?? DEFAULT_ORDER_BY,
        direction: options.orderDirection ?? DEFAULT_ORDER_DIRECTION,
      },
    }

    try {
      // Get items and total count
      const [items, total] = await Promise.all([
        this.adapter.findQueueItems(filter),
        this.adapter.countQueueItems({
          status: filter.status,
          tags: filter.tags,
          since: filter.since,
          until: filter.until,
        }),
      ])

      // Calculate hasMore
      const offset = filter.offset ?? 0
      const hasMore = offset + items.length < total

      return {
        items,
        total,
        hasMore,
      }
    } catch (error) {
      throw new QueueOperationError('list', (error as Error).message, { options })
    }
  }

  /**
   * Get a single queue item by ID
   */
  async get(id: string): Promise<QueueItem<T> | null> {
    try {
      return await this.adapter.findQueueItemById(id)
    } catch (error) {
      throw new QueueOperationError('get', (error as Error).message, { id })
    }
  }

  /**
   * Confirm a match (record is duplicate)
   */
  async confirm(id: string, decision: ConfirmDecision): Promise<QueueItem<T>> {
    // Get the item
    const item = await this.adapter.findQueueItemById(id)
    if (!item) {
      throw new QueueItemNotFoundError(id)
    }

    // Validate status transition
    validateStatusTransition(item.status, 'confirmed')

    // Validate decision
    const queueDecision = {
      action: 'confirm' as const,
      selectedMatchId: decision.selectedMatchId,
      notes: decision.notes,
      confidence: decision.confidence,
    }
    validateQueueDecision(queueDecision)

    // Update the item
    const now = new Date()
    try {
      return await this.adapter.updateQueueItem(id, {
        status: 'confirmed',
        decision: queueDecision,
        decidedAt: now,
        decidedBy: decision.decidedBy,
        updatedAt: now,
      })
    } catch (error) {
      throw new QueueOperationError('confirm', (error as Error).message, { id, decision })
    }
  }

  /**
   * Reject a match (record is not duplicate)
   */
  async reject(id: string, decision: RejectDecision): Promise<QueueItem<T>> {
    // Get the item
    const item = await this.adapter.findQueueItemById(id)
    if (!item) {
      throw new QueueItemNotFoundError(id)
    }

    // Validate status transition
    validateStatusTransition(item.status, 'rejected')

    // Validate decision
    const queueDecision = {
      action: 'reject' as const,
      notes: decision.notes,
      confidence: decision.confidence,
    }
    validateQueueDecision(queueDecision)

    // Update the item
    const now = new Date()
    try {
      return await this.adapter.updateQueueItem(id, {
        status: 'rejected',
        decision: queueDecision,
        decidedAt: now,
        decidedBy: decision.decidedBy,
        updatedAt: now,
      })
    } catch (error) {
      throw new QueueOperationError('reject', (error as Error).message, { id, decision })
    }
  }

  /**
   * Merge records (confirm and execute merge)
   */
  async merge(id: string, decision: MergeDecision): Promise<QueueItem<T>> {
    // Get the item
    const item = await this.adapter.findQueueItemById(id)
    if (!item) {
      throw new QueueItemNotFoundError(id)
    }

    // Validate status transition
    validateStatusTransition(item.status, 'merged')

    // Validate decision
    const queueDecision = {
      action: 'merge' as const,
      selectedMatchId: decision.selectedMatchId,
      notes: decision.notes,
      confidence: decision.confidence,
    }
    validateQueueDecision(queueDecision)

    // Update the item (actual merge execution deferred to Phase 8)
    const now = new Date()
    try {
      return await this.adapter.updateQueueItem(id, {
        status: 'merged',
        decision: queueDecision,
        decidedAt: now,
        decidedBy: decision.decidedBy,
        updatedAt: now,
      })
    } catch (error) {
      throw new QueueOperationError('merge', (error as Error).message, { id, decision })
    }
  }

  /**
   * Update queue item status (e.g., mark as reviewing)
   */
  async updateStatus(id: string, status: QueueStatus): Promise<QueueItem<T>> {
    // Get the item
    const item = await this.adapter.findQueueItemById(id)
    if (!item) {
      throw new QueueItemNotFoundError(id)
    }

    // Validate status transition
    validateStatusTransition(item.status, status)

    // Update the item
    const now = new Date()
    try {
      return await this.adapter.updateQueueItem(id, {
        status,
        updatedAt: now,
      })
    } catch (error) {
      throw new QueueOperationError('updateStatus', (error as Error).message, { id, status })
    }
  }

  /**
   * Delete a queue item
   */
  async delete(id: string): Promise<void> {
    // Check if item exists
    const item = await this.adapter.findQueueItemById(id)
    if (!item) {
      throw new QueueItemNotFoundError(id)
    }

    try {
      await this.adapter.deleteQueueItem(id)
    } catch (error) {
      throw new QueueOperationError('delete', (error as Error).message, { id })
    }
  }

  /**
   * Get queue statistics and metrics
   */
  async stats(options: StatsOptions = {}): Promise<QueueStats> {
    try {
      // Build filter
      const filter: QueueFilter = {
        status: options.status,
        since: options.since,
        until: options.until,
      }

      // Get all items matching filter
      const items = await this.adapter.findQueueItems({
        ...filter,
        limit: undefined, // No limit for stats
      })

      // Calculate total
      const total = items.length

      // Calculate count by status
      const byStatus: Record<QueueStatus, number> = {
        pending: 0,
        reviewing: 0,
        confirmed: 0,
        rejected: 0,
        merged: 0,
        expired: 0,
      }

      for (const item of items) {
        byStatus[item.status]++
      }

      // Calculate average wait time (time from creation to decision)
      let totalWaitTime = 0
      let decidedCount = 0

      for (const item of items) {
        if (item.decidedAt) {
          totalWaitTime += item.decidedAt.getTime() - item.createdAt.getTime()
          decidedCount++
        }
      }

      const avgWaitTime = decidedCount > 0 ? totalWaitTime / decidedCount : 0

      // Calculate average decision time (for items that transitioned through 'reviewing')
      // Note: This is simplified as we don't track status change history
      // In a real implementation, you'd need status change tracking
      const avgDecisionTime = avgWaitTime // Simplified

      // Find oldest pending item
      const pendingItems = items.filter((item) => item.status === 'pending')
      const oldestPending =
        pendingItems.length > 0
          ? pendingItems.reduce((oldest, item) =>
              item.createdAt < oldest.createdAt ? item : oldest,
            ).createdAt
          : undefined

      // Calculate throughput (decisions made in time periods)
      const now = new Date()
      const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000)
      const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      const last30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

      let throughputLast24h = 0
      let throughputLast7d = 0
      let throughputLast30d = 0

      for (const item of items) {
        if (item.decidedAt) {
          if (item.decidedAt >= last24h) {
            throughputLast24h++
          }
          if (item.decidedAt >= last7d) {
            throughputLast7d++
          }
          if (item.decidedAt >= last30d) {
            throughputLast30d++
          }
        }
      }

      return {
        total,
        byStatus,
        avgWaitTime,
        avgDecisionTime,
        oldestPending,
        throughput: {
          last24h: throughputLast24h,
          last7d: throughputLast7d,
          last30d: throughputLast30d,
        },
      }
    } catch (error) {
      throw new QueueOperationError('stats', (error as Error).message, { options })
    }
  }

  /**
   * Clear old queue items based on criteria
   */
  async cleanup(options: CleanupOptions): Promise<number> {
    try {
      // Build filter
      const filter: QueueFilter = {
        status: options.status,
        until: options.olderThan,
        limit: options.limit,
      }

      // Find items to delete
      const items = await this.adapter.findQueueItems(filter)

      // Delete items
      let deletedCount = 0
      for (const item of items) {
        await this.adapter.deleteQueueItem(item.id)
        deletedCount++
      }

      return deletedCount
    } catch (error) {
      throw new QueueOperationError('cleanup', (error as Error).message, { options })
    }
  }

  /**
   * Get aging report - items grouped by age
   */
  async getAgingReport(): Promise<AgeDistribution> {
    try {
      const items = await this.adapter.findQueueItems({
        limit: undefined,
      })

      return QueueMetrics.calculateAgeDistribution(items)
    } catch (error) {
      throw new QueueOperationError('getAgingReport', (error as Error).message, {})
    }
  }

  /**
   * Get priority report - items by priority level
   */
  async getPriorityReport(): Promise<Record<number, number>> {
    try {
      const items = await this.adapter.findQueueItems({
        limit: undefined,
      })

      const priorityCount: Record<number, number> = {}

      for (const item of items) {
        const priority = item.priority ?? DEFAULT_PRIORITY
        priorityCount[priority] = (priorityCount[priority] ?? 0) + 1
      }

      return priorityCount
    } catch (error) {
      throw new QueueOperationError('getPriorityReport', (error as Error).message, {})
    }
  }

  /**
   * Get reviewer report - statistics per reviewer
   */
  async getReviewerReport(): Promise<
    Record<
      string,
      {
        totalDecisions: number
        confirmed: number
        rejected: number
        merged: number
      }
    >
  > {
    try {
      const items = await this.adapter.findQueueItems({
        limit: undefined,
      })

      const reviewerStats: Record<
        string,
        {
          totalDecisions: number
          confirmed: number
          rejected: number
          merged: number
        }
      > = {}

      for (const item of items) {
        if (item.decidedBy && item.decision) {
          if (!reviewerStats[item.decidedBy]) {
            reviewerStats[item.decidedBy] = {
              totalDecisions: 0,
              confirmed: 0,
              rejected: 0,
              merged: 0,
            }
          }

          reviewerStats[item.decidedBy].totalDecisions++

          switch (item.decision.action) {
            case 'confirm':
              reviewerStats[item.decidedBy].confirmed++
              break
            case 'reject':
              reviewerStats[item.decidedBy].rejected++
              break
            case 'merge':
              reviewerStats[item.decidedBy].merged++
              break
          }
        }
      }

      return reviewerStats
    } catch (error) {
      throw new QueueOperationError('getReviewerReport', (error as Error).message, {})
    }
  }

  /**
   * Get decision accuracy metrics
   */
  async getDecisionAccuracy(): Promise<{
    totalDecisions: number
    confirmed: number
    rejected: number
    confirmRatio: number
  }> {
    try {
      const items = await this.adapter.findQueueItems({
        limit: undefined,
      })

      let totalDecisions = 0
      let confirmed = 0
      let rejected = 0

      for (const item of items) {
        if (item.decision) {
          totalDecisions++
          if (item.decision.action === 'confirm') {
            confirmed++
          } else if (item.decision.action === 'reject') {
            rejected++
          }
        }
      }

      const confirmRatio = totalDecisions > 0 ? confirmed / totalDecisions : 0

      return {
        totalDecisions,
        confirmed,
        rejected,
        confirmRatio,
      }
    } catch (error) {
      throw new QueueOperationError('getDecisionAccuracy', (error as Error).message, {})
    }
  }
}
