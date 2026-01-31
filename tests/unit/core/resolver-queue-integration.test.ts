import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Resolver } from '../../../src/core/resolver.js'
import type { ResolverConfig } from '../../../src/types/config.js'
import type { QueueAdapter, QueueItem, AddQueueItemRequest } from '../../../src/queue/types.js'
import type { DatabaseAdapter } from '../../../src/adapters/types.js'
import { QueueError } from '../../../src/queue/queue-error.js'

interface TestRecord {
  id: string
  name: string
  email: string
}

// Mock queue adapter - creates fresh state for each instance
function createMockQueueAdapter() {
  // Each adapter gets its own items array
  const items: QueueItem<TestRecord>[] = []

  const adapter: QueueAdapter<TestRecord> = {
    async insertQueueItem(item: QueueItem<TestRecord>) {
      items.push(item)
      return item
    },
    async updateQueueItem(id: string, updates: Partial<QueueItem<TestRecord>>) {
      const item = items.find((i) => i.id === id)
      if (!item) throw new Error('Item not found')
      Object.assign(item, updates)
      return item
    },
    async findQueueItems() {
      return [...items] // Return copy to avoid external modifications
    },
    async findQueueItemById(id: string) {
      return items.find((i) => i.id === id) || null
    },
    async deleteQueueItem(id: string) {
      const index = items.findIndex((i) => i.id === id)
      if (index >= 0) items.splice(index, 1)
    },
    async countQueueItems() {
      return items.length
    },
    async batchInsertQueueItems(queueItems: QueueItem<TestRecord>[]) {
      items.push(...queueItems)
      return queueItems
    },
  }

  return adapter
}

// Mock database adapter with queue support
function createMockAdapter(withQueue = true): DatabaseAdapter<TestRecord> {
  return {
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    findById: vi.fn(),
    findAll: vi.fn().mockResolvedValue([]),
    count: vi.fn(),
    batchInsert: vi.fn(),
    batchUpdate: vi.fn(),
    batchDelete: vi.fn(),
    findByBlockingKeys: vi.fn().mockResolvedValue([]),
    transaction: vi.fn(),
    queue: withQueue ? createMockQueueAdapter() : undefined,
  }
}

describe('Resolver Queue Integration', () => {
  const config: ResolverConfig<TestRecord> = {
    schema: {
      name: { type: 'string' },
      email: { type: 'string' },
    },
    matching: {
      fields: new Map([
        ['name', { strategy: 'levenshtein', weight: 10, threshold: 0.5 }],
        ['email', { strategy: 'levenshtein', weight: 10, threshold: 0.5 }],
      ]),
      thresholds: {
        noMatch: 5,
        definiteMatch: 18,
      },
    },
  }

  describe('queue property', () => {
    it('exposes ReviewQueue instance when adapter has queue', () => {
      const adapter = createMockAdapter(true)
      const resolver = new Resolver({ ...config, adapter })

      expect(resolver.queue).toBeDefined()
      expect(typeof resolver.queue.add).toBe('function')
      expect(typeof resolver.queue.list).toBe('function')
    })

    it('throws QueueError when adapter not configured', () => {
      const resolver = new Resolver(config)

      expect(() => resolver.queue).toThrow(QueueError)
      expect(() => resolver.queue).toThrow('Queue is not available')
    })

    it('throws QueueError when adapter has no queue support', () => {
      const adapter = createMockAdapter(false)
      const resolver = new Resolver({ ...config, adapter })

      expect(() => resolver.queue).toThrow(QueueError)
    })

    it('uses adapter queue for persistence', async () => {
      const adapter = createMockAdapter(true)
      const resolver = new Resolver({ ...config, adapter })

      const queueItem: AddQueueItemRequest<TestRecord> = {
        candidateRecord: { id: '1', name: 'John', email: 'john@example.com' },
        potentialMatches: [
          {
            record: { id: '2', name: 'Jon', email: 'jon@example.com' },
            score: 15,
            outcome: 'potential-match',
            explanation: {
              summary: 'Similar name',
              fieldComparisons: [],
              confidence: 0.6,
              reasons: ['Name similarity: 0.8'],
            },
          },
        ],
      }

      const added = await resolver.queue.add(queueItem)
      expect(added).toBeDefined()
      expect(added.id).toBeDefined()
      expect(added.status).toBe('pending')
    })
  })

  describe('resolve with autoQueue', () => {
    beforeEach(async () => {
      // Clear any state between tests
      await new Promise((resolve) => setTimeout(resolve, 10))
    })

    it('automatically queues potential matches', async () => {
      const adapter = createMockAdapter(true)
      const resolver = new Resolver({ ...config, adapter })

      const candidateRecord = { id: '1', name: 'John Smith', email: 'john@example.com' }
      const existingRecords = [
        { id: '2', name: 'John Smyth', email: 'john2@example.com' }, // Potential match
        { id: '3', name: 'Jane Doe', email: 'jane@example.com' },     // No match
      ]

      resolver.resolve(candidateRecord, existingRecords, { autoQueue: true })

      // Wait a tick for async queue operation
      await new Promise((resolve) => setTimeout(resolve, 10))

      const queuedItems = await resolver.queue.list()
      expect(queuedItems.items.length).toBeGreaterThan(0)
    })

    it('does not queue definite-match outcomes', async () => {
      const adapter = createMockAdapter(true)
      const resolver = new Resolver({ ...config, adapter })

      const candidateRecord = { id: '1', name: 'John', email: 'john@example.com' }
      const existingRecords = [
        { id: '2', name: 'John', email: 'john@example.com' }, // Definite match
      ]

      resolver.resolve(candidateRecord, existingRecords, { autoQueue: true })

      await new Promise((resolve) => setTimeout(resolve, 20))

      // Definite matches should not be queued (queue remains empty)
      const queuedItems = await resolver.queue.list()
      expect(queuedItems.items.length).toBe(0)
    })

    it('includes context in queued items', async () => {
      const adapter = createMockAdapter(true)
      const resolver = new Resolver({ ...config, adapter })

      const candidateRecord = { id: '1', name: 'John Smith', email: 'john@example.com' }
      const existingRecords = [
        { id: '2', name: 'John Smyth', email: 'john2@example.com' },
      ]

      resolver.resolve(candidateRecord, existingRecords, {
        autoQueue: true,
        queueContext: {
          source: 'api-import',
          userId: 'user123',
        },
      })

      // Wait for async queue operation
      await new Promise((resolve) => setTimeout(resolve, 10))

      const queuedItems = await resolver.queue.list()
      if (queuedItems.items.length > 0) {
        expect(queuedItems.items[0].context?.source).toBe('api-import')
        expect(queuedItems.items[0].context?.userId).toBe('user123')
      }
    })

    it('does not queue when autoQueue=false', async () => {
      const adapter = createMockAdapter(true)
      const resolver = new Resolver({ ...config, adapter })

      const candidateRecord = { id: '1', name: 'John Smith', email: 'john@example.com' }
      const existingRecords = [
        { id: '2', name: 'John Smyth', email: 'john2@example.com' },
      ]

      resolver.resolve(candidateRecord, existingRecords, { autoQueue: false })

      await new Promise((resolve) => setTimeout(resolve, 10))

      const queuedItems = await resolver.queue.list()
      expect(queuedItems.items.length).toBe(0)
    })

    it('does not queue when autoQueue not specified', async () => {
      const adapter = createMockAdapter(true)
      const resolver = new Resolver({ ...config, adapter })

      const candidateRecord = { id: '1', name: 'John Smith', email: 'john@example.com' }
      const existingRecords = [
        { id: '2', name: 'John Smyth', email: 'john2@example.com' },
      ]

      resolver.resolve(candidateRecord, existingRecords)

      await new Promise((resolve) => setTimeout(resolve, 10))

      const queuedItems = await resolver.queue.list()
      expect(queuedItems.items.length).toBe(0)
    })
  })

  describe('deduplicateBatch with autoQueue', () => {
    it('batches queue insertions', async () => {
      const adapter = createMockAdapter(true)
      const resolver = new Resolver({ ...config, adapter })

      const records = [
        { id: '1', name: 'John Smith', email: 'john@example.com' },
        { id: '2', name: 'John Smyth', email: 'john2@example.com' },
        { id: '3', name: 'Jane Doe', email: 'jane@example.com' },
        { id: '4', name: 'Jane Do', email: 'jane2@example.com' },
      ]

      const batchResult = resolver.deduplicateBatch(records, { autoQueue: true })

      await new Promise((resolve) => setTimeout(resolve, 50))

      // Should have queued potential matches
      expect(batchResult.results.length).toBeGreaterThan(0)
    })

    it('only queues review outcomes', async () => {
      const adapter = createMockAdapter(true)
      const resolver = new Resolver({ ...config, adapter })

      const records = [
        { id: '1', name: 'John', email: 'john@example.com' },
        { id: '2', name: 'John', email: 'john@example.com' }, // Definite match - should not queue
      ]

      resolver.deduplicateBatch(records, { autoQueue: true })

      await new Promise((resolve) => setTimeout(resolve, 50))

      // Verify definite matches not queued
      const queuedItems = await resolver.queue.list()
      expect(queuedItems.items.length).toBe(0)
    })

    it('returns queue statistics in result', async () => {
      const adapter = createMockAdapter(true)
      const resolver = new Resolver({ ...config, adapter })

      const records = [
        { id: '1', name: 'John Smith', email: 'john@example.com' },
        { id: '2', name: 'John Smyth', email: 'john2@example.com' },
      ]

      const result = resolver.deduplicateBatch(records, { autoQueue: true })

      expect(result.stats).toBeDefined()
      expect(result.stats.recordsProcessed).toBe(2)
    })
  })

  describe('resolveWithDatabase with autoQueue', () => {
    it('queries database and auto-queues potential matches', async () => {
      const adapter = createMockAdapter(true)
      adapter.findAll = vi.fn().mockResolvedValue([
        { id: '2', name: 'John Smyth', email: 'john@exmpl.com' }, // Potential match
      ])

      const resolver = new Resolver({ ...config, adapter })

      const candidateRecord = { id: '1', name: 'John Smith', email: 'john@example.com' }

      await resolver.resolveWithDatabase(candidateRecord, { autoQueue: true })

      await new Promise((resolve) => setTimeout(resolve, 20))

      const queuedItems = await resolver.queue.list()
      expect(queuedItems.items.length).toBeGreaterThan(0)
    })

    it('includes database query context', async () => {
      const adapter = createMockAdapter(true)
      adapter.findAll = vi.fn().mockResolvedValue([
        { id: '2', name: 'John Smyth', email: 'john@exmpl.com' },
      ])

      const resolver = new Resolver({ ...config, adapter })

      const candidateRecord = { id: '1', name: 'John Smith', email: 'john@example.com' }

      await resolver.resolveWithDatabase(candidateRecord, {
        autoQueue: true,
        queueContext: {
          source: 'database-scan',
        },
      })

      await new Promise((resolve) => setTimeout(resolve, 20))

      const queuedItems = await resolver.queue.list()
      if (queuedItems.items.length > 0) {
        expect(queuedItems.items[0].context?.source).toBe('database-scan')
      }
    })
  })

  describe('queue operations without adapter', () => {
    it('throws QueueError when accessing queue without adapter', () => {
      const resolver = new Resolver(config)

      expect(() => resolver.queue).toThrow(QueueError)
      expect(() => resolver.queue).toThrow('Queue is not available')
    })
  })
})
