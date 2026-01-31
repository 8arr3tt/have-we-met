import { describe, it, expect, beforeEach, vi } from 'vitest'
import { HaveWeMet } from '../../../src/index.js'
import type { DatabaseAdapter, QueueAdapter } from '../../../src/adapters/types.js'
import type { QueueItem } from '../../../src/queue/types.js'

interface TestRecord {
  id?: string
  firstName: string
  lastName: string
  email: string
  phone?: string
}

// Mock queue adapter
function createMockQueueAdapter() {
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
    async findQueueItems(filter?: import('../../../src/queue/types.js').QueueFilter) {
      let result = [...items]

      // Filter by status
      if (filter?.status) {
        const statuses = Array.isArray(filter.status) ? filter.status : [filter.status]
        result = result.filter((item) => statuses.includes(item.status))
      }

      // Filter by tags
      if (filter?.tags && filter.tags.length > 0) {
        result = result.filter((item) =>
          filter.tags!.every((tag) => item.tags?.includes(tag))
        )
      }

      // Apply offset
      if (filter?.offset) {
        result = result.slice(filter.offset)
      }

      // Apply limit
      if (filter?.limit) {
        result = result.slice(0, filter.limit)
      }

      return result
    },
    async findQueueItemById(id: string) {
      return items.find((i) => i.id === id) || null
    },
    async deleteQueueItem(id: string) {
      const index = items.findIndex((i) => i.id === id)
      if (index >= 0) items.splice(index, 1)
    },
    async countQueueItems(filter?: import('../../../src/queue/types.js').QueueFilter) {
      let result = [...items]

      if (filter?.status) {
        const statuses = Array.isArray(filter.status) ? filter.status : [filter.status]
        result = result.filter((item) => statuses.includes(item.status))
      }

      if (filter?.tags && filter.tags.length > 0) {
        result = result.filter((item) =>
          filter.tags!.every((tag) => item.tags?.includes(tag))
        )
      }

      return result.length
    },
    async batchInsertQueueItems(queueItems: QueueItem<TestRecord>[]) {
      items.push(...queueItems)
      return queueItems
    },
  }

  return adapter
}

// Mock database adapter with queue support
function createMockAdapter(): DatabaseAdapter<TestRecord> {
  const records: TestRecord[] = []

  return {
    insert: vi.fn(async (record: TestRecord) => {
      const id = record.id || `id-${Date.now()}-${Math.random()}`
      const newRecord = { ...record, id }
      records.push(newRecord)
      return newRecord
    }),
    update: vi.fn(),
    delete: vi.fn(),
    findById: vi.fn(async (id: string) => {
      return records.find((r) => r.id === id) || null
    }),
    findAll: vi.fn(async () => records),
    count: vi.fn(async () => records.length),
    batchInsert: vi.fn(),
    batchUpdate: vi.fn(),
    batchDelete: vi.fn(),
    findByBlockingKeys: vi.fn(async () => records),
    transaction: vi.fn(),
    queue: createMockQueueAdapter(),
  }
}

describe('Performance: Queue Operations', () => {
  let adapter: ReturnType<typeof createMockAdapter<TestRecord>>
  let resolver: ReturnType<typeof HaveWeMet.schema<TestRecord>['build']>

  beforeEach(async () => {
    adapter = createMockAdapter<TestRecord>()
    resolver = HaveWeMet.schema<TestRecord>({
      firstName: { type: 'string', weight: 1.0 },
      lastName: { type: 'string', weight: 1.5 },
      email: { type: 'string', weight: 2.0 },
      phone: { type: 'string', weight: 1.0 },
    })
      .blocking((block) => {
        block.onField('email')
      })
      .matching((match) =>
        match
          .field('firstName')
          .strategy('jaro-winkler')
          .weight(1.0)
          .field('lastName')
          .strategy('jaro-winkler')
          .weight(1.5)
          .field('email')
          .strategy('exact')
          .weight(2.0)
      )
      .thresholds({ noMatch: 20, definiteMatch: 50 })
      .adapter(adapter)
      .build()
  })

  it('should add 1000 items in < 1 second', async () => {
    const itemsToAdd = Array.from({ length: 1000 }, (_, i) => ({
      candidateRecord: {
        firstName: `Person${i}`,
        lastName: `Last${i}`,
        email: `person${i}@example.com`,
        phone: `+1-555-${i.toString().padStart(4, '0')}`,
      },
      potentialMatches: [{
        record: {
          id: `r${i}`,
          firstName: `Person${i}`,
          lastName: `Last${i}`,
          email: `person${i}@old.com`,
        },
        score: 30,
        outcome: 'potential-match' as const,
        explanation: { totalScore: 30, fieldScores: [], missingFields: [] },
      }],
    }))

    const startTime = Date.now()
    const added = await resolver.queue.addBatch(itemsToAdd)
    const endTime = Date.now()

    const duration = endTime - startTime

    expect(added).toHaveLength(1000)
    expect(duration).toBeLessThan(1000)

    console.log(`Added 1000 items in ${duration}ms`)
  })

  it('should list 10000 items in < 500ms', async () => {
    const batchSize = 100
    const batches = 100

    for (let b = 0; b < batches; b++) {
      const itemsToAdd = Array.from({ length: batchSize }, (_, i) => {
        const index = b * batchSize + i
        return {
          candidateRecord: {
            firstName: `Person${index}`,
            lastName: `Last${index}`,
            email: `person${index}@example.com`,
          },
          potentialMatches: [{
            record: {
              id: `r${index}`,
              firstName: `Person${index}`,
              lastName: `Last${index}`,
              email: `person${index}@old.com`,
            },
            score: 30,
            outcome: 'potential-match' as const,
            explanation: { totalScore: 30, fieldScores: [], missingFields: [] },
          }],
        }
      })

      await resolver.queue.addBatch(itemsToAdd)
    }

    const startTime = Date.now()
    const list = await resolver.queue.list({ limit: 10000 })
    const endTime = Date.now()

    const duration = endTime - startTime

    expect(list.items.length).toBeGreaterThan(0)
    expect(duration).toBeLessThan(500)

    console.log(`Listed ${list.items.length} items in ${duration}ms`)
  })

  it('should make batch decisions on 100 items in < 200ms', async () => {
    const itemsToAdd = Array.from({ length: 100 }, (_, i) => ({
      candidateRecord: {
        firstName: `Person${i}`,
        lastName: `Last${i}`,
        email: `person${i}@example.com`,
      },
      potentialMatches: [{
        record: {
          id: `r${i}`,
          firstName: `Person${i}`,
          lastName: `Last${i}`,
          email: `person${i}@old.com`,
        },
        score: 30,
        outcome: 'potential-match' as const,
        explanation: { totalScore: 30, fieldScores: [], missingFields: [] },
      }],
    }))

    const added = await resolver.queue.addBatch(itemsToAdd)

    const startTime = Date.now()

    for (const item of added) {
      if (Math.random() > 0.5) {
        await resolver.queue.confirm(item.id, {
          selectedMatchId: `r${added.indexOf(item)}`,
          decidedBy: 'perf-test',
        })
      } else {
        await resolver.queue.reject(item.id, {
          decidedBy: 'perf-test',
        })
      }
    }

    const endTime = Date.now()
    const duration = endTime - startTime

    expect(duration).toBeLessThan(200)

    console.log(`Made 100 decisions in ${duration}ms`)
  })

  it('should calculate metrics for 10000 items in < 1 second', async () => {
    const batchSize = 100
    const batches = 100

    for (let b = 0; b < batches; b++) {
      const itemsToAdd = Array.from({ length: batchSize }, (_, i) => {
        const index = b * batchSize + i
        return {
          candidateRecord: {
            firstName: `Person${index}`,
            lastName: `Last${index}`,
            email: `person${index}@example.com`,
          },
          potentialMatches: [{
            record: {
              id: `r${index}`,
              firstName: `Person${index}`,
              lastName: `Last${index}`,
              email: `person${index}@old.com`,
            },
            score: 30,
            outcome: 'potential-match' as const,
            explanation: { totalScore: 30, fieldScores: [], missingFields: [] },
          }],
        }
      })

      await resolver.queue.addBatch(itemsToAdd)
    }

    const startTime = Date.now()
    const stats = await resolver.queue.stats()
    const endTime = Date.now()

    const duration = endTime - startTime

    expect(stats.total).toBeGreaterThan(0)
    expect(duration).toBeLessThan(1000)

    console.log(`Calculated metrics for ${stats.total} items in ${duration}ms`)
  })

  it('should handle concurrent queue operations efficiently', async () => {
    const itemsToAdd = Array.from({ length: 100 }, (_, i) => ({
      candidateRecord: {
        firstName: `Person${i}`,
        lastName: `Last${i}`,
        email: `person${i}@example.com`,
      },
      potentialMatches: [{
        record: {
          id: `r${i}`,
          firstName: `Person${i}`,
          lastName: `Last${i}`,
          email: `person${i}@old.com`,
        },
        score: 30,
        outcome: 'potential-match' as const,
        explanation: { totalScore: 30, fieldScores: [], missingFields: [] },
      }],
    }))

    const added = await resolver.queue.addBatch(itemsToAdd)

    const startTime = Date.now()

    const operations = added.map(async (item, i) => {
      if (i < 33) {
        return resolver.queue.confirm(item.id, {
          selectedMatchId: `r${i}`,
          decidedBy: 'concurrent-test',
        })
      } else if (i < 66) {
        return resolver.queue.reject(item.id, {
          decidedBy: 'concurrent-test',
        })
      } else {
        return resolver.queue.get(item.id)
      }
    })

    await Promise.all(operations)

    const endTime = Date.now()
    const duration = endTime - startTime

    expect(duration).toBeLessThan(500)

    console.log(`Completed 100 concurrent operations in ${duration}ms`)
  })

  it('should efficiently filter and paginate large queues', async () => {
    const itemsToAdd = Array.from({ length: 1000 }, (_, i) => ({
      candidateRecord: {
        firstName: `Person${i}`,
        lastName: `Last${i}`,
        email: `person${i}@example.com`,
      },
      potentialMatches: [{
        record: {
          id: `r${i}`,
          firstName: `Person${i}`,
          lastName: `Last${i}`,
          email: `person${i}@old.com`,
        },
        score: 30,
        outcome: 'potential-match' as const,
        explanation: { totalScore: 30, fieldScores: [], missingFields: [] },
      }],
      priority: i % 3,
      tags: i % 2 === 0 ? ['even', 'import'] : ['odd', 'import'],
    }))

    await resolver.queue.addBatch(itemsToAdd)

    const startTime1 = Date.now()
    const filtered = await resolver.queue.list({
      status: 'pending',
      tags: ['even'],
      limit: 50,
    })
    const endTime1 = Date.now()

    expect(filtered.items).toHaveLength(50)
    expect(endTime1 - startTime1).toBeLessThan(100)

    console.log(`Filtered and paginated in ${endTime1 - startTime1}ms`)

    const startTime2 = Date.now()
    const ordered = await resolver.queue.list({
      status: 'pending',
      orderBy: 'priority',
      orderDirection: 'desc',
      limit: 100,
    })
    const endTime2 = Date.now()

    expect(ordered.items).toHaveLength(100)
    expect(endTime2 - startTime2).toBeLessThan(100)

    console.log(`Ordered query in ${endTime2 - startTime2}ms`)
  })

  it('should handle cleanup operations efficiently', async () => {
    const itemsToAdd = Array.from({ length: 1000 }, (_, i) => ({
      candidateRecord: {
        firstName: `Person${i}`,
        lastName: `Last${i}`,
        email: `person${i}@example.com`,
      },
      potentialMatches: [{
        record: {
          id: `r${i}`,
          firstName: `Person${i}`,
          lastName: `Last${i}`,
          email: `person${i}@old.com`,
        },
        score: 30,
        outcome: 'potential-match' as const,
        explanation: { totalScore: 30, fieldScores: [], missingFields: [] },
      }],
    }))

    const added = await resolver.queue.addBatch(itemsToAdd)

    for (const item of added.slice(0, 500)) {
      await resolver.queue.confirm(item.id, {
        selectedMatchId: 'r1',
        decidedBy: 'cleanup-perf-test',
      })
    }

    const startTime = Date.now()
    const cleanedCount = await resolver.queue.cleanup({
      olderThan: new Date(Date.now() + 10000),
      status: ['confirmed'],
      limit: 500,
    })
    const endTime = Date.now()

    const duration = endTime - startTime

    expect(cleanedCount).toBeGreaterThan(0)
    expect(duration).toBeLessThan(500)

    console.log(`Cleaned ${cleanedCount} items in ${duration}ms`)
  })

  it('should maintain performance with mixed operations', async () => {
    const startTime = Date.now()

    const itemsToAdd = Array.from({ length: 500 }, (_, i) => ({
      candidateRecord: {
        firstName: `Person${i}`,
        lastName: `Last${i}`,
        email: `person${i}@example.com`,
      },
      potentialMatches: [{
        record: {
          id: `r${i}`,
          firstName: `Person${i}`,
          lastName: `Last${i}`,
          email: `person${i}@old.com`,
        },
        score: 30,
        outcome: 'potential-match' as const,
        explanation: { totalScore: 30, fieldScores: [], missingFields: [] },
      }],
    }))

    await resolver.queue.addBatch(itemsToAdd)

    await resolver.queue.list({ limit: 100 })

    const list = await resolver.queue.list({ status: 'pending', limit: 50 })

    for (const item of list.items.slice(0, 25)) {
      await resolver.queue.confirm(item.id, {
        selectedMatchId: 'r1',
        decidedBy: 'mixed-test',
      })
    }

    await resolver.queue.stats()

    for (const item of list.items.slice(25, 50)) {
      await resolver.queue.reject(item.id, {
        decidedBy: 'mixed-test',
      })
    }

    await resolver.queue.cleanup({
      olderThan: new Date(Date.now() + 10000),
      status: ['confirmed', 'rejected'],
    })

    const endTime = Date.now()
    const duration = endTime - startTime

    expect(duration).toBeLessThan(2000)

    console.log(`Completed mixed operations in ${duration}ms`)
  })
})
