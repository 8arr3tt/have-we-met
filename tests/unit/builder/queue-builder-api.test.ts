import { describe, it, expect, beforeEach, vi } from 'vitest'
import { HaveWeMet } from '../../../src/builder/resolver-builder'
import type { QueueOptions } from '../../../src/builder/queue-options'
import { mergeQueueOptions } from '../../../src/builder/queue-options'

describe('Queue Builder API', () => {
  interface TestRecord {
    id?: string
    firstName: string
    lastName: string
    email: string
  }

  describe('Queue availability', () => {
    it('queue is available when adapter configured', () => {
      const mockAdapter = createMockAdapter()

      const resolver = HaveWeMet.create<TestRecord>()
        .schema((schema) => {
          schema
            .field('firstName', { type: 'name', component: 'first' })
            .field('lastName', { type: 'name', component: 'last' })
            .field('email', { type: 'email' })
        })
        .matching((match) => {
          match
            .field('email')
            .strategy('exact')
            .weight(20)
            .thresholds({ noMatch: 20, definiteMatch: 45 })
        })
        .adapter(mockAdapter)
        .build()

      expect(resolver.queue).toBeDefined()
      expect(typeof resolver.queue.add).toBe('function')
      expect(typeof resolver.queue.list).toBe('function')
      expect(typeof resolver.queue.get).toBe('function')
      expect(typeof resolver.queue.confirm).toBe('function')
      expect(typeof resolver.queue.reject).toBe('function')
    })

    it('queue throws error when accessed without adapter', () => {
      const resolver = HaveWeMet.create<TestRecord>()
        .schema((schema) => {
          schema
            .field('firstName', { type: 'name', component: 'first' })
            .field('lastName', { type: 'name', component: 'last' })
            .field('email', { type: 'email' })
        })
        .matching((match) => {
          match
            .field('email')
            .strategy('exact')
            .weight(20)
            .thresholds({ noMatch: 20, definiteMatch: 45 })
        })
        .build()

      // Queue should throw when accessed without adapter
      expect(() => resolver.queue).toThrow('Queue is not available')
    })
  })

  describe('Queue configuration via adapter', () => {
    it('applies default queue options when not specified', () => {
      const mockAdapter = createMockAdapter()

      HaveWeMet.create<TestRecord>()
        .schema((schema) => {
          schema
            .field('firstName', { type: 'name', component: 'first' })
            .field('lastName', { type: 'name', component: 'last' })
            .field('email', { type: 'email' })
        })
        .matching((match) => {
          match
            .field('email')
            .strategy('exact')
            .weight(20)
            .thresholds({ noMatch: 20, definiteMatch: 45 })
        })
        .adapter(mockAdapter)
        .build()

      // Queue adapter should have been created with default options
      expect(mockAdapter.queue).toBeDefined()
      const options = mockAdapter.queue!.getOptions()
      expect(options.autoExpireAfter).toBe(30 * 24 * 60 * 60 * 1000) // 30 days
      expect(options.defaultPriority).toBe(0)
      expect(options.enableMetrics).toBe(true)
    })

    it('applies custom queue options via adapter config', () => {
      const queueOptions: QueueOptions = {
        autoExpireAfter: 7 * 24 * 60 * 60 * 1000, // 7 days
        defaultPriority: 5,
        enableMetrics: false,
        alertThresholds: {
          maxQueueSize: 500,
          maxAge: 3 * 24 * 60 * 60 * 1000, // 3 days
          minThroughput: 20,
        },
      }

      const mockAdapter = createMockAdapter(queueOptions)

      HaveWeMet.create<TestRecord>()
        .schema((schema) => {
          schema
            .field('firstName', { type: 'name', component: 'first' })
            .field('lastName', { type: 'name', component: 'last' })
            .field('email', { type: 'email' })
        })
        .matching((match) => {
          match
            .field('email')
            .strategy('exact')
            .weight(20)
            .thresholds({ noMatch: 20, definiteMatch: 45 })
        })
        .adapter(mockAdapter)
        .build()

      const options = mockAdapter.queue!.getOptions()
      expect(options.autoExpireAfter).toBe(7 * 24 * 60 * 60 * 1000)
      expect(options.defaultPriority).toBe(5)
      expect(options.enableMetrics).toBe(false)
      expect(options.alertThresholds.maxQueueSize).toBe(500)
      expect(options.alertThresholds.maxAge).toBe(3 * 24 * 60 * 60 * 1000)
      expect(options.alertThresholds.minThroughput).toBe(20)
    })

    it('applies partial queue options with defaults for missing fields', () => {
      const queueOptions: QueueOptions = {
        defaultPriority: 10,
      }

      const mockAdapter = createMockAdapter(queueOptions)

      HaveWeMet.create<TestRecord>()
        .schema((schema) => {
          schema
            .field('firstName', { type: 'name', component: 'first' })
            .field('lastName', { type: 'name', component: 'last' })
            .field('email', { type: 'email' })
        })
        .matching((match) => {
          match
            .field('email')
            .strategy('exact')
            .weight(20)
            .thresholds({ noMatch: 20, definiteMatch: 45 })
        })
        .adapter(mockAdapter)
        .build()

      const options = mockAdapter.queue!.getOptions()
      expect(options.defaultPriority).toBe(10)
      expect(options.autoExpireAfter).toBe(30 * 24 * 60 * 60 * 1000) // default
      expect(options.enableMetrics).toBe(true) // default
    })
  })

  describe('Type safety', () => {
    it('builder enforces correct configuration order', () => {
      // This test verifies type-level constraints
      // If this compiles, the type system is working correctly

      const mockAdapter = createMockAdapter()

      // Valid: schema -> matching -> adapter -> build
      const resolver = HaveWeMet.create<TestRecord>()
        .schema((schema) => {
          schema.field('email', { type: 'email' })
        })
        .matching((match) => {
          match
            .field('email')
            .strategy('exact')
            .weight(20)
            .thresholds({ noMatch: 20, definiteMatch: 45 })
        })
        .adapter(mockAdapter)
        .build()

      expect(resolver).toBeDefined()
    })
  })

  describe('Queue options in real-world scenarios', () => {
    it('configures queue for high-throughput system', () => {
      const queueOptions: QueueOptions = {
        autoExpireAfter: 24 * 60 * 60 * 1000, // 1 day (faster expiry)
        defaultPriority: 0,
        enableMetrics: true,
        alertThresholds: {
          maxQueueSize: 10000, // larger threshold
          maxAge: 12 * 60 * 60 * 1000, // 12 hours
          minThroughput: 100, // higher throughput expected
        },
      }

      const mockAdapter = createMockAdapter(queueOptions)

      const resolver = HaveWeMet.create<TestRecord>()
        .schema((schema) => {
          schema.field('email', { type: 'email' })
        })
        .matching((match) => {
          match
            .field('email')
            .strategy('exact')
            .weight(20)
            .thresholds({ noMatch: 20, definiteMatch: 45 })
        })
        .adapter(mockAdapter)
        .build()

      expect(resolver.queue).toBeDefined()
      const options = mockAdapter.queue!.getOptions()
      expect(options.alertThresholds.maxQueueSize).toBe(10000)
      expect(options.alertThresholds.minThroughput).toBe(100)
    })

    it('configures queue for low-priority background processing', () => {
      const queueOptions: QueueOptions = {
        autoExpireAfter: 90 * 24 * 60 * 60 * 1000, // 90 days (longer retention)
        defaultPriority: -5, // low priority
        enableMetrics: false, // save overhead
        alertThresholds: {
          maxQueueSize: 50000, // allow large backlog
          maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
          minThroughput: 5, // low throughput acceptable
        },
      }

      const mockAdapter = createMockAdapter(queueOptions)

      const resolver = HaveWeMet.create<TestRecord>()
        .schema((schema) => {
          schema.field('email', { type: 'email' })
        })
        .matching((match) => {
          match
            .field('email')
            .strategy('exact')
            .weight(20)
            .thresholds({ noMatch: 20, definiteMatch: 45 })
        })
        .adapter(mockAdapter)
        .build()

      expect(resolver.queue).toBeDefined()
      const options = mockAdapter.queue!.getOptions()
      expect(options.defaultPriority).toBe(-5)
      expect(options.enableMetrics).toBe(false)
      expect(options.autoExpireAfter).toBe(90 * 24 * 60 * 60 * 1000)
    })
  })
})

// Mock adapter factory
function createMockAdapter<T extends Record<string, unknown>>(
  queueOptions?: QueueOptions
) {
  const mockQueueAdapter = {
    getOptions: vi.fn(() => {
      return mergeQueueOptions(queueOptions)
    }),
    insertQueueItem: vi.fn(),
    updateQueueItem: vi.fn(),
    findQueueItems: vi.fn(),
    findQueueItemById: vi.fn(),
    deleteQueueItem: vi.fn(),
    countQueueItems: vi.fn(),
    batchInsertQueueItems: vi.fn(),
  }

  return {
    queue: mockQueueAdapter,
    findByBlockingKeys: vi.fn(async () => []),
    findByIds: vi.fn(async () => []),
    findAll: vi.fn(async () => []),
    count: vi.fn(async () => 0),
    insert: vi.fn(async (record: T) => record),
    update: vi.fn(async (id: string, updates: Partial<T>) => ({
      id,
      ...updates,
    })),
    delete: vi.fn(async () => {}),
    transaction: vi.fn(async (callback) => callback({} as any)),
    batchInsert: vi.fn(async (records: T[]) => records),
    batchUpdate: vi.fn(async () => []),
  }
}
