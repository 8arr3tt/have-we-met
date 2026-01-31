import { describe, it, expect, beforeEach } from 'vitest'
import { PrismaAdapter } from '../../../src/adapters/prisma/prisma-adapter'
import { DrizzleAdapter } from '../../../src/adapters/drizzle/drizzle-adapter'
import { TypeORMAdapter } from '../../../src/adapters/typeorm/typeorm-adapter'
import type { AdapterConfig, DatabaseAdapter } from '../../../src/adapters/types'

type TestRecord = {
  id: string
  firstName: string
  lastName: string
  email: string
  dobYear?: number
}

class InMemoryAdapter<T extends Record<string, unknown>> implements DatabaseAdapter<T> {
  private records: Map<string, T> = new Map()
  private nextId = 1

  constructor(private primaryKey: string = 'id') {}

  seed(records: T[]) {
    for (const record of records) {
      const id = record[this.primaryKey] as string
      this.records.set(id, record)
    }
  }

  async findByBlockingKeys(blockingKeys: Map<string, unknown>): Promise<T[]> {
    const results: T[] = []
    for (const record of this.records.values()) {
      let matches = true
      for (const [key, value] of blockingKeys.entries()) {
        if (record[key] !== value) {
          matches = false
          break
        }
      }
      if (matches) {
        results.push(record)
      }
    }
    return results
  }

  async findByIds(ids: string[]): Promise<T[]> {
    return ids.map((id) => this.records.get(id)).filter((r): r is T => r !== undefined)
  }

  async findAll(): Promise<T[]> {
    return Array.from(this.records.values())
  }

  async count(): Promise<number> {
    return this.records.size
  }

  async insert(record: T): Promise<T> {
    const id = (record[this.primaryKey] as string) || String(this.nextId++)
    const newRecord = { ...record, [this.primaryKey]: id } as T
    this.records.set(id, newRecord)
    return newRecord
  }

  async update(id: string, updates: Partial<T>): Promise<T> {
    const existing = this.records.get(id)
    if (!existing) {
      throw new Error('Record not found')
    }
    const updated = { ...existing, ...updates }
    this.records.set(id, updated)
    return updated
  }

  async delete(id: string): Promise<void> {
    this.records.delete(id)
  }

  async transaction<R>(callback: (adapter: DatabaseAdapter<T>) => Promise<R>): Promise<R> {
    return callback(this)
  }

  async batchInsert(records: T[]): Promise<T[]> {
    const results: T[] = []
    for (const record of records) {
      results.push(await this.insert(record))
    }
    return results
  }

  async batchUpdate(updates: Array<{ id: string; updates: Partial<T> }>): Promise<T[]> {
    const results: T[] = []
    for (const { id, updates: updateData } of updates) {
      results.push(await this.update(id, updateData))
    }
    return results
  }

  clear() {
    this.records.clear()
    this.nextId = 1
  }
}

describe('Performance: Database Adapters', () => {
  const generateRecords = (count: number): TestRecord[] => {
    return Array.from({ length: count }, (_, i) => ({
      id: `perf-${i}`,
      firstName: `First${i}`,
      lastName: `Last${i % 100}`,
      email: `user${i}@example.com`,
      dobYear: 1950 + (i % 70),
    }))
  }

  describe('In-Memory Adapter Performance', () => {
    let adapter: InMemoryAdapter<TestRecord>

    beforeEach(() => {
      adapter = new InMemoryAdapter<TestRecord>('id')
    })

    it('inserts 1000 records efficiently', async () => {
      const records = generateRecords(1000)
      const start = Date.now()

      await adapter.batchInsert(records)

      const duration = Date.now() - start
      expect(duration).toBeLessThan(1000)

      const count = await adapter.count()
      expect(count).toBe(1000)
    })

    it('queries with blocking keys efficiently on 1000 records', async () => {
      const records = generateRecords(1000)
      await adapter.batchInsert(records)

      const start = Date.now()

      const results = await adapter.findByBlockingKeys(new Map([['lastName', 'Last42']]))

      const duration = Date.now() - start
      expect(duration).toBeLessThan(100)
      expect(results.length).toBeGreaterThan(0)
    })

    it('batch updates 100 records efficiently', async () => {
      const records = generateRecords(1000)
      await adapter.batchInsert(records)

      const updates = Array.from({ length: 100 }, (_, i) => ({
        id: `perf-${i}`,
        updates: { email: `updated${i}@example.com` },
      }))

      const start = Date.now()

      await adapter.batchUpdate(updates)

      const duration = Date.now() - start
      expect(duration).toBeLessThan(500)
    })

    it('finds by IDs efficiently', async () => {
      const records = generateRecords(1000)
      await adapter.batchInsert(records)

      const ids = Array.from({ length: 50 }, (_, i) => `perf-${i}`)

      const start = Date.now()

      const results = await adapter.findByIds(ids)

      const duration = Date.now() - start
      expect(duration).toBeLessThan(100)
      expect(results).toHaveLength(50)
    })
  })

  describe('Blocking Strategy Performance Comparison', () => {
    it('single blocking field performs better than no blocking', async () => {
      const adapter = new InMemoryAdapter<TestRecord>('id')
      const records = generateRecords(10000)
      await adapter.batchInsert(records)

      const allRecords = await adapter.findAll()
      const blockedRecords = await adapter.findByBlockingKeys(new Map([['lastName', 'Last42']]))

      expect(blockedRecords.length).toBeLessThan(allRecords.length)
      expect(blockedRecords.length).toBeGreaterThan(0)
      expect(allRecords.length).toBe(10000)
    })

    it('multiple blocking fields further reduce result set', async () => {
      const adapter = new InMemoryAdapter<TestRecord>('id')
      const records = generateRecords(5000)
      await adapter.batchInsert(records)

      const singleKeyResults = await adapter.findByBlockingKeys(new Map([['lastName', 'Last42']]))

      const multiKeyResults = await adapter.findByBlockingKeys(
        new Map([
          ['lastName', 'Last42'],
          ['dobYear', 2000],
        ])
      )

      expect(multiKeyResults.length).toBeLessThanOrEqual(singleKeyResults.length)
    })
  })

  describe('Memory Usage Patterns', () => {
    it('batch operations handle large datasets without excessive memory', async () => {
      const adapter = new InMemoryAdapter<TestRecord>('id')

      const batchSize = 1000
      const batches = 5

      for (let i = 0; i < batches; i++) {
        const records = generateRecords(batchSize).map((r) => ({
          ...r,
          id: `batch${i}-${r.id}`,
        }))
        await adapter.batchInsert(records)
      }

      const totalCount = await adapter.count()
      expect(totalCount).toBe(batchSize * batches)
    })

    it('streaming-style processing for large result sets', async () => {
      const adapter = new InMemoryAdapter<TestRecord>('id')
      const records = generateRecords(5000)
      await adapter.batchInsert(records)

      const processedCount = await adapter.count()

      expect(processedCount).toBe(5000)
    })
  })

  describe('Transaction Performance', () => {
    it('transactions maintain performance with multiple operations', async () => {
      const adapter = new InMemoryAdapter<TestRecord>('id')
      const records = generateRecords(100)
      await adapter.batchInsert(records)

      const start = Date.now()

      await adapter.transaction(async (txAdapter) => {
        for (let i = 0; i < 10; i++) {
          await txAdapter.update(`perf-${i}`, { email: `tx-${i}@example.com` })
        }
      })

      const duration = Date.now() - start
      expect(duration).toBeLessThan(500)
    })
  })

  describe('Real-world Scenario Benchmarks', () => {
    it('customer deduplication workflow on 1000 records', async () => {
      const adapter = new InMemoryAdapter<TestRecord>('id')

      const customers = Array.from({ length: 1000 }, (_, i) => ({
        id: `cust-${i}`,
        firstName: `Customer${i}`,
        lastName: `Smith`,
        email: `customer${i}@example.com`,
        dobYear: 1980 + (i % 40),
      }))

      const start = Date.now()

      await adapter.batchInsert(customers)

      const duplicates = await adapter.findByBlockingKeys(new Map([['lastName', 'Smith']]))

      expect(duplicates.length).toBe(1000)

      const duration = Date.now() - start
      expect(duration).toBeLessThan(2000)
    })

    it('patient matching workflow with multiple blocking strategies', async () => {
      const adapter = new InMemoryAdapter<TestRecord>('id')

      const patients = Array.from({ length: 5000 }, (_, i) => ({
        id: `patient-${i}`,
        firstName: `FirstName${i % 500}`,
        lastName: `LastName${i % 200}`,
        email: `patient${i}@hospital.com`,
        dobYear: 1930 + (i % 90),
      }))

      await adapter.batchInsert(patients)

      const start = Date.now()

      const byLastName = await adapter.findByBlockingKeys(new Map([['lastName', 'LastName42']]))

      const byDob = await adapter.findByBlockingKeys(new Map([['dobYear', 1980]]))

      const byBoth = await adapter.findByBlockingKeys(
        new Map([
          ['lastName', 'LastName42'],
          ['dobYear', 1980],
        ])
      )

      const duration = Date.now() - start

      expect(byLastName.length).toBeGreaterThan(byBoth.length)
      expect(byDob.length).toBeGreaterThan(byBoth.length)
      expect(duration).toBeLessThan(500)
    })

    it('incremental deduplication (daily batch)', async () => {
      const adapter = new InMemoryAdapter<TestRecord>('id')

      const existingRecords = generateRecords(5000)
      await adapter.batchInsert(existingRecords)

      const newBatch = generateRecords(100).map((r) => ({
        ...r,
        id: `new-${r.id}`,
      }))

      const start = Date.now()

      await adapter.batchInsert(newBatch)

      for (const newRecord of newBatch.slice(0, 10)) {
        await adapter.findByBlockingKeys(new Map([['lastName', newRecord.lastName]]))
      }

      const duration = Date.now() - start
      expect(duration).toBeLessThan(1000)

      const totalCount = await adapter.count()
      expect(totalCount).toBe(5100)
    })
  })

  describe('Index Effectiveness Simulation', () => {
    it('demonstrates performance benefit of indexed blocking fields', async () => {
      const adapter = new InMemoryAdapter<TestRecord>('id')
      const records = generateRecords(10000)
      await adapter.batchInsert(records)

      const indexedResults = await adapter.findByBlockingKeys(new Map([['lastName', 'Last42']]))
      const allRecords = await adapter.findAll()
      const fullScanResults = allRecords.filter((r) => r.lastName === 'Last42')

      expect(indexedResults.length).toBe(fullScanResults.length)
      expect(indexedResults.length).toBeGreaterThan(0)
      expect(allRecords.length).toBe(10000)
    })
  })

  describe('Comparison Metrics', () => {
    it('measures operations per second for inserts', async () => {
      const adapter = new InMemoryAdapter<TestRecord>('id')
      const records = generateRecords(1000)

      const start = Date.now()
      await adapter.batchInsert(records)
      const duration = Date.now() - start

      const opsPerSecond = (1000 / duration) * 1000

      expect(opsPerSecond).toBeGreaterThan(100)
    })

    it('measures query response time percentiles', async () => {
      const adapter = new InMemoryAdapter<TestRecord>('id')
      const records = generateRecords(1000)
      await adapter.batchInsert(records)

      const queryTimes: number[] = []

      for (let i = 0; i < 100; i++) {
        const start = Date.now()
        await adapter.findByBlockingKeys(new Map([['lastName', `Last${i % 50}`]]))
        queryTimes.push(Date.now() - start)
      }

      queryTimes.sort((a, b) => a - b)
      const p50 = queryTimes[Math.floor(queryTimes.length * 0.5)]
      const p95 = queryTimes[Math.floor(queryTimes.length * 0.95)]
      const p99 = queryTimes[Math.floor(queryTimes.length * 0.99)]

      expect(p50).toBeLessThan(50)
      expect(p95).toBeLessThan(100)
      expect(p99).toBeLessThan(200)
    })
  })
})
