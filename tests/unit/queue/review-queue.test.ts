/**
 * Unit tests for ReviewQueue
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { ReviewQueue } from '../../../src/queue/review-queue.js'
import {
  QueueItemNotFoundError,
  InvalidStatusTransitionError,
  QueueValidationError,
  QueueOperationError,
} from '../../../src/queue/queue-error.js'
import type {
  QueueAdapter,
  QueueItem,
  QueueFilter,
  AddQueueItemRequest,
} from '../../../src/queue/types.js'
import type { MatchExplanation } from '../../../src/types/match.js'

/**
 * Test record type
 */
interface TestRecord {
  id: string
  name: string
  email: string
}

/**
 * Mock queue adapter for testing
 */
class MockQueueAdapter implements QueueAdapter<TestRecord> {
  private items: Map<string, QueueItem<TestRecord>> = new Map()

  async insertQueueItem(item: QueueItem<TestRecord>): Promise<QueueItem<TestRecord>> {
    this.items.set(item.id, item)
    return item
  }

  async updateQueueItem(
    id: string,
    updates: Partial<QueueItem<TestRecord>>,
  ): Promise<QueueItem<TestRecord>> {
    const item = this.items.get(id)
    if (!item) {
      throw new Error(`Queue item not found: ${id}`)
    }

    const updated = { ...item, ...updates }
    this.items.set(id, updated)
    return updated
  }

  async findQueueItems(filter: QueueFilter): Promise<QueueItem<TestRecord>[]> {
    let items = Array.from(this.items.values())

    // Apply status filter
    if (filter.status) {
      const statuses = Array.isArray(filter.status) ? filter.status : [filter.status]
      items = items.filter((item) => statuses.includes(item.status))
    }

    // Apply tags filter
    if (filter.tags && filter.tags.length > 0) {
      items = items.filter((item) => {
        if (!item.tags) return false
        return filter.tags!.every((tag) => item.tags!.includes(tag))
      })
    }

    // Apply date filters
    if (filter.since) {
      items = items.filter((item) => item.createdAt >= filter.since!)
    }

    if (filter.until) {
      items = items.filter((item) => item.createdAt <= filter.until!)
    }

    // Apply ordering
    if (filter.orderBy) {
      const { field, direction } = filter.orderBy
      items.sort((a, b) => {
        let aVal: number | undefined
        let bVal: number | undefined

        if (field === 'createdAt') {
          aVal = a.createdAt.getTime()
          bVal = b.createdAt.getTime()
        } else if (field === 'priority') {
          aVal = a.priority ?? 0
          bVal = b.priority ?? 0
        } else if (field === 'score') {
          aVal = a.potentialMatches[0]?.score ?? 0
          bVal = b.potentialMatches[0]?.score ?? 0
        }

        if (aVal === undefined || bVal === undefined) return 0

        const comparison = aVal - bVal
        return direction === 'asc' ? comparison : -comparison
      })
    }

    // Apply pagination
    const offset = filter.offset ?? 0
    const limit = filter.limit
    if (limit !== undefined) {
      items = items.slice(offset, offset + limit)
    } else if (offset > 0) {
      items = items.slice(offset)
    }

    return items
  }

  async findQueueItemById(id: string): Promise<QueueItem<TestRecord> | null> {
    return this.items.get(id) ?? null
  }

  async deleteQueueItem(id: string): Promise<void> {
    if (!this.items.has(id)) {
      throw new Error(`Queue item not found: ${id}`)
    }
    this.items.delete(id)
  }

  async countQueueItems(filter?: QueueFilter): Promise<number> {
    if (!filter) {
      return this.items.size
    }

    const items = await this.findQueueItems({ ...filter, limit: undefined, offset: 0 })
    return items.length
  }

  async batchInsertQueueItems(items: QueueItem<TestRecord>[]): Promise<QueueItem<TestRecord>[]> {
    for (const item of items) {
      this.items.set(item.id, item)
    }
    return items
  }

  // Test helper methods
  clear(): void {
    this.items.clear()
  }

  size(): number {
    return this.items.size
  }
}

/**
 * Helper to create a test queue item request
 */
function createTestRequest(): AddQueueItemRequest<TestRecord> {
  const explanation: MatchExplanation = {
    breakdown: [
      {
        field: 'name',
        weight: 10,
        score: 8,
        reason: 'Similar',
      },
    ],
    totalScore: 8,
    totalWeight: 10,
  }

  return {
    candidateRecord: { id: '1', name: 'John Doe', email: 'john@example.com' },
    potentialMatches: [
      {
        record: { id: '2', name: 'Jon Doe', email: 'jon@example.com' },
        score: 35,
        outcome: 'potential-match',
        explanation,
      },
    ],
  }
}

describe('ReviewQueue', () => {
  let adapter: MockQueueAdapter
  let queue: ReviewQueue<TestRecord>

  beforeEach(() => {
    adapter = new MockQueueAdapter()
    queue = new ReviewQueue(adapter)
  })

  describe('add', () => {
    it('adds item to queue with pending status', async () => {
      const request = createTestRequest()

      const item = await queue.add(request)

      expect(item.id).toBeDefined()
      expect(item.status).toBe('pending')
      expect(item.candidateRecord).toEqual(request.candidateRecord)
      expect(item.potentialMatches).toEqual(request.potentialMatches)
      expect(item.createdAt).toBeInstanceOf(Date)
      expect(item.updatedAt).toBeInstanceOf(Date)
    })

    it('generates unique ID', async () => {
      const request = createTestRequest()

      const item1 = await queue.add(request)
      const item2 = await queue.add(request)

      expect(item1.id).not.toBe(item2.id)
    })

    it('sets createdAt and updatedAt timestamps', async () => {
      const request = createTestRequest()
      const before = new Date()

      const item = await queue.add(request)

      const after = new Date()
      expect(item.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime())
      expect(item.createdAt.getTime()).toBeLessThanOrEqual(after.getTime())
      expect(item.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime())
      expect(item.updatedAt.getTime()).toBeLessThanOrEqual(after.getTime())
    })

    it('validates candidateRecord is not empty', async () => {
      const request = createTestRequest()
      request.candidateRecord = {} as TestRecord

      await expect(queue.add(request)).rejects.toThrow(QueueValidationError)
    })

    it('validates potentialMatches is not empty', async () => {
      const request = createTestRequest()
      request.potentialMatches = []

      await expect(queue.add(request)).rejects.toThrow(QueueValidationError)
    })

    it('persists via adapter', async () => {
      const request = createTestRequest()

      await queue.add(request)

      expect(adapter.size()).toBe(1)
    })

    it('applies default priority if not specified', async () => {
      const request = createTestRequest()

      const item = await queue.add(request)

      expect(item.priority).toBe(0)
    })

    it('applies custom priority if specified', async () => {
      const request = createTestRequest()
      request.priority = 5

      const item = await queue.add(request)

      expect(item.priority).toBe(5)
    })

    it('stores context if provided', async () => {
      const request = createTestRequest()
      request.context = { source: 'import', userId: 'user1' }

      const item = await queue.add(request)

      expect(item.context).toEqual({ source: 'import', userId: 'user1' })
    })

    it('stores tags if provided', async () => {
      const request = createTestRequest()
      request.tags = ['import', 'customer']

      const item = await queue.add(request)

      expect(item.tags).toEqual(['import', 'customer'])
    })
  })

  describe('addBatch', () => {
    it('adds multiple items efficiently', async () => {
      const requests = [createTestRequest(), createTestRequest(), createTestRequest()]

      const items = await queue.addBatch(requests)

      expect(items).toHaveLength(3)
      expect(adapter.size()).toBe(3)
    })

    it('validates all items before persisting', async () => {
      const requests = [createTestRequest(), createTestRequest()]
      requests[1].candidateRecord = {} as TestRecord

      await expect(queue.addBatch(requests)).rejects.toThrow(QueueOperationError)
      expect(adapter.size()).toBe(0)
    })

    it('generates unique IDs for all items', async () => {
      const requests = [createTestRequest(), createTestRequest()]

      const items = await queue.addBatch(requests)

      expect(items[0].id).not.toBe(items[1].id)
    })
  })

  describe('list', () => {
    beforeEach(async () => {
      // Add test items
      await queue.add(createTestRequest())
      await queue.add({ ...createTestRequest(), priority: 5 })
      await queue.add({ ...createTestRequest(), tags: ['test'] })
    })

    it('lists all pending items', async () => {
      const result = await queue.list()

      expect(result.items.length).toBeGreaterThan(0)
      expect(result.total).toBe(3)
      expect(result.items.every((item) => item.status === 'pending')).toBe(true)
    })

    it('filters by status', async () => {
      const items = await queue.list({ status: 'pending' })
      const item = items.items[0]

      // Confirm one item
      await queue.confirm(item.id, { selectedMatchId: 'match-1' })

      const pending = await queue.list({ status: 'pending' })
      const confirmed = await queue.list({ status: 'confirmed' })

      expect(pending.total).toBe(2)
      expect(confirmed.total).toBe(1)
    })

    it('filters by tags', async () => {
      const result = await queue.list({ tags: ['test'] })

      expect(result.total).toBe(1)
      expect(result.items[0].tags).toContain('test')
    })

    it('orders by createdAt ascending', async () => {
      const result = await queue.list({ orderBy: 'createdAt', orderDirection: 'asc' })

      const timestamps = result.items.map((item) => item.createdAt.getTime())
      const sorted = [...timestamps].sort((a, b) => a - b)
      expect(timestamps).toEqual(sorted)
    })

    it('orders by priority descending', async () => {
      const result = await queue.list({ orderBy: 'priority', orderDirection: 'desc' })

      const priorities = result.items.map((item) => item.priority ?? 0)
      const sorted = [...priorities].sort((a, b) => b - a)
      expect(priorities).toEqual(sorted)
    })

    it('respects limit and offset', async () => {
      const page1 = await queue.list({ limit: 2, offset: 0 })
      const page2 = await queue.list({ limit: 2, offset: 2 })

      expect(page1.items).toHaveLength(2)
      expect(page2.items).toHaveLength(1)
      expect(page1.items[0].id).not.toBe(page2.items[0].id)
    })

    it('returns total count and hasMore flag', async () => {
      const result = await queue.list({ limit: 2 })

      expect(result.total).toBe(3)
      expect(result.hasMore).toBe(true)
    })
  })

  describe('get', () => {
    it('retrieves item by ID', async () => {
      const created = await queue.add(createTestRequest())

      const retrieved = await queue.get(created.id)

      expect(retrieved).not.toBeNull()
      expect(retrieved!.id).toBe(created.id)
    })

    it('returns null for non-existent ID', async () => {
      const result = await queue.get('non-existent-id')

      expect(result).toBeNull()
    })
  })

  describe('confirm', () => {
    it('confirms match and updates status', async () => {
      const item = await queue.add(createTestRequest())

      const confirmed = await queue.confirm(item.id, {
        selectedMatchId: 'match-1',
      })

      expect(confirmed.status).toBe('confirmed')
      expect(confirmed.decision?.action).toBe('confirm')
      expect(confirmed.decision?.selectedMatchId).toBe('match-1')
    })

    it('stores decision details', async () => {
      const item = await queue.add(createTestRequest())

      const confirmed = await queue.confirm(item.id, {
        selectedMatchId: 'match-1',
        notes: 'Looks good',
        confidence: 0.9,
        decidedBy: 'user1',
      })

      expect(confirmed.decision?.notes).toBe('Looks good')
      expect(confirmed.decision?.confidence).toBe(0.9)
      expect(confirmed.decidedBy).toBe('user1')
    })

    it('sets decidedAt timestamp', async () => {
      const item = await queue.add(createTestRequest())
      const before = new Date()

      const confirmed = await queue.confirm(item.id, {
        selectedMatchId: 'match-1',
      })

      const after = new Date()
      expect(confirmed.decidedAt).toBeInstanceOf(Date)
      expect(confirmed.decidedAt!.getTime()).toBeGreaterThanOrEqual(before.getTime())
      expect(confirmed.decidedAt!.getTime()).toBeLessThanOrEqual(after.getTime())
    })

    it('sets decidedBy field', async () => {
      const item = await queue.add(createTestRequest())

      const confirmed = await queue.confirm(item.id, {
        selectedMatchId: 'match-1',
        decidedBy: 'reviewer1',
      })

      expect(confirmed.decidedBy).toBe('reviewer1')
    })

    it('validates selectedMatchId is provided', async () => {
      const item = await queue.add(createTestRequest())

      await expect(
        queue.confirm(item.id, { selectedMatchId: '' } as any),
      ).rejects.toThrow(QueueValidationError)
    })

    it('throws if item not found', async () => {
      await expect(
        queue.confirm('non-existent', { selectedMatchId: 'match-1' }),
      ).rejects.toThrow(QueueItemNotFoundError)
    })

    it('throws if item already decided', async () => {
      const item = await queue.add(createTestRequest())
      await queue.confirm(item.id, { selectedMatchId: 'match-1' })

      await expect(
        queue.confirm(item.id, { selectedMatchId: 'match-2' }),
      ).rejects.toThrow(InvalidStatusTransitionError)
    })
  })

  describe('reject', () => {
    it('rejects match and updates status', async () => {
      const item = await queue.add(createTestRequest())

      const rejected = await queue.reject(item.id, {})

      expect(rejected.status).toBe('rejected')
      expect(rejected.decision?.action).toBe('reject')
    })

    it('stores decision details', async () => {
      const item = await queue.add(createTestRequest())

      const rejected = await queue.reject(item.id, {
        notes: 'Not a match',
        confidence: 0.8,
        decidedBy: 'user2',
      })

      expect(rejected.decision?.notes).toBe('Not a match')
      expect(rejected.decision?.confidence).toBe(0.8)
      expect(rejected.decidedBy).toBe('user2')
    })

    it('throws if item not found', async () => {
      await expect(queue.reject('non-existent', {})).rejects.toThrow(QueueItemNotFoundError)
    })

    it('throws if item already decided', async () => {
      const item = await queue.add(createTestRequest())
      await queue.reject(item.id, {})

      await expect(queue.reject(item.id, {})).rejects.toThrow(InvalidStatusTransitionError)
    })
  })

  describe('merge', () => {
    it('marks as merged and updates status', async () => {
      const item = await queue.add(createTestRequest())

      const merged = await queue.merge(item.id, {
        selectedMatchId: 'match-1',
      })

      expect(merged.status).toBe('merged')
      expect(merged.decision?.action).toBe('merge')
      expect(merged.decision?.selectedMatchId).toBe('match-1')
    })

    it('stores merge decision details', async () => {
      const item = await queue.add(createTestRequest())

      const merged = await queue.merge(item.id, {
        selectedMatchId: 'match-1',
        notes: 'Merging records',
        confidence: 0.95,
        decidedBy: 'user3',
        mergeStrategy: 'latest-wins',
      })

      expect(merged.decision?.notes).toBe('Merging records')
      expect(merged.decision?.confidence).toBe(0.95)
      expect(merged.decidedBy).toBe('user3')
    })

    it('validates selectedMatchId is provided', async () => {
      const item = await queue.add(createTestRequest())

      await expect(
        queue.merge(item.id, { selectedMatchId: '' } as any),
      ).rejects.toThrow(QueueValidationError)
    })

    it('throws if item not found', async () => {
      await expect(
        queue.merge('non-existent', { selectedMatchId: 'match-1' }),
      ).rejects.toThrow(QueueItemNotFoundError)
    })
  })

  describe('updateStatus', () => {
    it('transitions from pending to reviewing', async () => {
      const item = await queue.add(createTestRequest())

      const updated = await queue.updateStatus(item.id, 'reviewing')

      expect(updated.status).toBe('reviewing')
    })

    it('transitions from reviewing to confirmed', async () => {
      const item = await queue.add(createTestRequest())
      await queue.updateStatus(item.id, 'reviewing')

      const updated = await queue.updateStatus(item.id, 'confirmed')

      expect(updated.status).toBe('confirmed')
    })

    it('throws for invalid transition (confirmed to pending)', async () => {
      const item = await queue.add(createTestRequest())
      await queue.confirm(item.id, { selectedMatchId: 'match-1' })

      await expect(queue.updateStatus(item.id, 'pending')).rejects.toThrow(
        InvalidStatusTransitionError,
      )
    })

    it('updates updatedAt timestamp', async () => {
      const item = await queue.add(createTestRequest())
      const originalUpdatedAt = item.updatedAt

      // Wait a bit to ensure timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 10))

      const updated = await queue.updateStatus(item.id, 'reviewing')

      expect(updated.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime())
    })
  })

  describe('delete', () => {
    it('removes item from queue', async () => {
      const item = await queue.add(createTestRequest())

      await queue.delete(item.id)

      const retrieved = await queue.get(item.id)
      expect(retrieved).toBeNull()
    })

    it('throws if item not found', async () => {
      await expect(queue.delete('non-existent')).rejects.toThrow(QueueItemNotFoundError)
    })
  })

  describe('stats', () => {
    beforeEach(async () => {
      // Add and decide some items
      const item1 = await queue.add(createTestRequest())
      const item2 = await queue.add(createTestRequest())
      const item3 = await queue.add(createTestRequest())

      await queue.confirm(item1.id, { selectedMatchId: 'match-1' })
      await queue.reject(item2.id, {})
      // Leave item3 pending
    })

    it('calculates total items', async () => {
      const stats = await queue.stats()

      expect(stats.total).toBe(3)
    })

    it('calculates count by status', async () => {
      const stats = await queue.stats()

      expect(stats.byStatus.pending).toBe(1)
      expect(stats.byStatus.confirmed).toBe(1)
      expect(stats.byStatus.rejected).toBe(1)
      expect(stats.byStatus.reviewing).toBe(0)
      expect(stats.byStatus.merged).toBe(0)
      expect(stats.byStatus.expired).toBe(0)
    })

    it('calculates average wait time', async () => {
      const stats = await queue.stats()

      expect(stats.avgWaitTime).toBeGreaterThanOrEqual(0)
    })

    it('calculates average decision time', async () => {
      const stats = await queue.stats()

      expect(stats.avgDecisionTime).toBeGreaterThanOrEqual(0)
    })

    it('identifies oldest pending item', async () => {
      const stats = await queue.stats()

      expect(stats.oldestPending).toBeInstanceOf(Date)
    })

    it('calculates throughput metrics', async () => {
      const stats = await queue.stats()

      expect(stats.throughput).toBeDefined()
      expect(stats.throughput!.last24h).toBe(2)
      expect(stats.throughput!.last7d).toBe(2)
      expect(stats.throughput!.last30d).toBe(2)
    })

    it('handles empty queue', async () => {
      adapter.clear()

      const stats = await queue.stats()

      expect(stats.total).toBe(0)
      expect(stats.byStatus.pending).toBe(0)
      expect(stats.avgWaitTime).toBe(0)
      expect(stats.oldestPending).toBeUndefined()
    })
  })

  describe('cleanup', () => {
    beforeEach(async () => {
      // Add items with different statuses
      const item1 = await queue.add(createTestRequest())
      const item2 = await queue.add(createTestRequest())
      const item3 = await queue.add(createTestRequest())
      await queue.confirm(item1.id, { selectedMatchId: 'match-1' })
      await queue.reject(item2.id, {})
      // Leave item3 pending
    })

    it('removes items older than date', async () => {
      const future = new Date(Date.now() + 1000 * 60 * 60) // 1 hour from now

      const count = await queue.cleanup({
        olderThan: future,
        status: ['confirmed', 'rejected'],
      })

      expect(count).toBe(2) // Both confirmed and rejected items
      const stats = await queue.stats()
      expect(stats.total).toBe(1) // Only pending item remains
    })

    it('removes only specified statuses', async () => {
      const future = new Date(Date.now() + 1000 * 60 * 60)

      const count = await queue.cleanup({
        olderThan: future,
        status: ['confirmed'],
      })

      expect(count).toBe(1) // Only confirmed item
      const stats = await queue.stats()
      expect(stats.total).toBe(2) // Pending and rejected remain
    })

    it('respects limit', async () => {
      const future = new Date(Date.now() + 1000 * 60 * 60)

      const count = await queue.cleanup({
        olderThan: future,
        status: ['confirmed', 'rejected'],
        limit: 1,
      })

      expect(count).toBe(1)
      const stats = await queue.stats()
      expect(stats.total).toBe(2)
    })

    it('returns count of removed items', async () => {
      const future = new Date(Date.now() + 1000 * 60 * 60)

      const count = await queue.cleanup({ olderThan: future })

      expect(typeof count).toBe('number')
      expect(count).toBeGreaterThanOrEqual(0)
    })
  })
})
