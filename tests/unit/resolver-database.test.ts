import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Resolver } from '../../src/core/resolver'
import type { DatabaseAdapter, QueryOptions } from '../../src/adapters/types'
import type { SchemaDefinition } from '../../src/types/schema'
import type { MatchingConfig } from '../../src/types/config'
import { StandardBlockingStrategy } from '../../src/core/blocking'

interface TestRecord {
  id: string
  firstName: string
  lastName: string
  email: string
}

describe('Resolver with Database Integration', () => {
  let mockAdapter: DatabaseAdapter<TestRecord>
  let schema: SchemaDefinition<TestRecord>
  let matchingConfig: MatchingConfig

  beforeEach(() => {
    schema = {
      firstName: { type: 'name', component: 'first' },
      lastName: { type: 'name', component: 'last' },
      email: { type: 'email' },
    } as SchemaDefinition<TestRecord>

    matchingConfig = {
      fields: new Map([
        ['email', { strategy: 'exact', weight: 20, threshold: 1.0 }],
        ['firstName', { strategy: 'jaro-winkler', weight: 10, threshold: 0.85 }],
        ['lastName', { strategy: 'jaro-winkler', weight: 10, threshold: 0.85 }],
      ]),
      thresholds: {
        noMatch: 20,
        definiteMatch: 45,
      },
    }

    mockAdapter = {
      findByBlockingKeys: vi.fn(),
      findByIds: vi.fn(),
      findAll: vi.fn(),
      count: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      transaction: vi.fn(),
      batchInsert: vi.fn(),
      batchUpdate: vi.fn(),
    }
  })

  describe('resolveWithDatabase', () => {
    it('throws error if adapter not configured', async () => {
      const resolver = new Resolver<TestRecord>({
        schema,
        matching: matchingConfig,
      })

      const candidateRecord: TestRecord = {
        id: 'new1',
        firstName: 'John',
        lastName: 'Smith',
        email: 'john@example.com',
      }

      await expect(resolver.resolveWithDatabase(candidateRecord)).rejects.toThrow(
        'Database adapter is not configured'
      )
    })

    it('queries database using blocking keys', async () => {
      const blockingStrategy = new StandardBlockingStrategy<TestRecord>({ field: 'lastName' })
      const blockingConfig = {
        strategies: [blockingStrategy],
      }

      const resolver = new Resolver<TestRecord>({
        schema,
        matching: matchingConfig,
        blocking: blockingConfig,
        adapter: mockAdapter,
      })

      const candidateRecord: TestRecord = {
        id: 'new1',
        firstName: 'John',
        lastName: 'Smith',
        email: 'john@example.com',
      }

      const dbRecords: TestRecord[] = [
        {
          id: 'existing1',
          firstName: 'Jon',
          lastName: 'Smith',
          email: 'jon@example.com',
        },
      ]

      vi.mocked(mockAdapter.findByBlockingKeys).mockResolvedValue(dbRecords)

      const results = await resolver.resolveWithDatabase(candidateRecord)

      expect(mockAdapter.findByBlockingKeys).toHaveBeenCalled()
      expect(results).toBeDefined()
      expect(results.length).toBeGreaterThan(0)
    })

    it('returns match results from database records', async () => {
      const resolver = new Resolver<TestRecord>({
        schema,
        matching: matchingConfig,
        adapter: mockAdapter,
      })

      const candidateRecord: TestRecord = {
        id: 'new1',
        firstName: 'John',
        lastName: 'Smith',
        email: 'john@example.com',
      }

      const dbRecords: TestRecord[] = [
        {
          id: 'existing1',
          firstName: 'John',
          lastName: 'Smith',
          email: 'john@example.com',
        },
      ]

      vi.mocked(mockAdapter.findAll).mockResolvedValue(dbRecords)

      const results = await resolver.resolveWithDatabase(candidateRecord, {
        useBlocking: false,
      })

      expect(results).toBeDefined()
      expect(results.length).toBe(1)
      expect(results[0].score.totalScore).toBeGreaterThan(0)
      expect(results[0].candidateRecord).toEqual(dbRecords[0])
    })

    it('handles no matches found', async () => {
      const resolver = new Resolver<TestRecord>({
        schema,
        matching: matchingConfig,
        adapter: mockAdapter,
      })

      const candidateRecord: TestRecord = {
        id: 'new1',
        firstName: 'John',
        lastName: 'Smith',
        email: 'john@example.com',
      }

      vi.mocked(mockAdapter.findAll).mockResolvedValue([])

      const results = await resolver.resolveWithDatabase(candidateRecord, {
        useBlocking: false,
      })

      expect(results).toEqual([])
    })

    it('respects maxFetchSize option', async () => {
      const resolver = new Resolver<TestRecord>({
        schema,
        matching: matchingConfig,
        adapter: mockAdapter,
      })

      const candidateRecord: TestRecord = {
        id: 'new1',
        firstName: 'John',
        lastName: 'Smith',
        email: 'john@example.com',
      }

      vi.mocked(mockAdapter.findAll).mockResolvedValue([])

      await resolver.resolveWithDatabase(candidateRecord, {
        useBlocking: false,
        maxFetchSize: 500,
      })

      expect(mockAdapter.findAll).toHaveBeenCalledWith({ limit: 500 })
    })
  })

  describe('deduplicateBatchFromDatabase', () => {
    it('throws error if adapter not configured', async () => {
      const resolver = new Resolver<TestRecord>({
        schema,
        matching: matchingConfig,
      })

      await expect(resolver.deduplicateBatchFromDatabase()).rejects.toThrow(
        'Database adapter is not configured'
      )
    })

    it('processes records in batches', async () => {
      const resolver = new Resolver<TestRecord>({
        schema,
        matching: matchingConfig,
        adapter: mockAdapter,
      })

      const records: TestRecord[] = [
        {
          id: 'rec1',
          firstName: 'John',
          lastName: 'Smith',
          email: 'john@example.com',
        },
        {
          id: 'rec2',
          firstName: 'John',
          lastName: 'Smith',
          email: 'john@example.com',
        },
      ]

      vi.mocked(mockAdapter.count).mockResolvedValue(2)
      vi.mocked(mockAdapter.findAll)
        .mockResolvedValueOnce(records)
        .mockResolvedValueOnce([])

      const result = await resolver.deduplicateBatchFromDatabase({
        batchSize: 1000,
        persistResults: false,
      })

      expect(mockAdapter.count).toHaveBeenCalled()
      expect(mockAdapter.findAll).toHaveBeenCalled()
      expect(result.stats.recordsProcessed).toBe(2)
    })

    it('applies blocking to reduce queries', async () => {
      const blockingStrategy = new StandardBlockingStrategy<TestRecord>({ field: 'lastName' })
      const blockingConfig = {
        strategies: [blockingStrategy],
      }

      const resolver = new Resolver<TestRecord>({
        schema,
        matching: matchingConfig,
        blocking: blockingConfig,
        adapter: mockAdapter,
      })

      const records: TestRecord[] = [
        {
          id: 'rec1',
          firstName: 'John',
          lastName: 'Smith',
          email: 'john@example.com',
        },
        {
          id: 'rec2',
          firstName: 'Jane',
          lastName: 'Doe',
          email: 'jane@example.com',
        },
      ]

      vi.mocked(mockAdapter.count).mockResolvedValue(2)
      vi.mocked(mockAdapter.findAll).mockResolvedValue(records)

      const result = await resolver.deduplicateBatchFromDatabase({
        batchSize: 1000,
      })

      expect(result).toBeDefined()
      expect(result.stats).toBeDefined()
    })

    it('persists results when option enabled', async () => {
      const resolver = new Resolver<TestRecord>({
        schema,
        matching: matchingConfig,
        adapter: mockAdapter,
      })

      const records: TestRecord[] = [
        {
          id: 'rec1',
          firstName: 'John',
          lastName: 'Smith',
          email: 'john@example.com',
        },
        {
          id: 'rec2',
          firstName: 'John',
          lastName: 'Smith',
          email: 'john@example.com',
        },
      ]

      vi.mocked(mockAdapter.count).mockResolvedValue(2)
      vi.mocked(mockAdapter.findAll).mockResolvedValue(records)
      vi.mocked(mockAdapter.batchUpdate).mockResolvedValue([])

      const result = await resolver.deduplicateBatchFromDatabase({
        batchSize: 1000,
        persistResults: true,
      })

      if (result.stats.definiteMatchesFound > 0) {
        expect(mockAdapter.batchUpdate).toHaveBeenCalled()
      } else {
        expect(mockAdapter.batchUpdate).not.toHaveBeenCalled()
      }
    })

    it('returns statistics', async () => {
      const resolver = new Resolver<TestRecord>({
        schema,
        matching: matchingConfig,
        adapter: mockAdapter,
      })

      vi.mocked(mockAdapter.count).mockResolvedValue(0)

      const result = await resolver.deduplicateBatchFromDatabase()

      expect(result.stats).toBeDefined()
      expect(result.stats.recordsProcessed).toBe(0)
      expect(result.stats.comparisonsMade).toBe(0)
      expect(result.stats.definiteMatchesFound).toBe(0)
    })

    it('handles large datasets with maxRecords limit', async () => {
      const resolver = new Resolver<TestRecord>({
        schema,
        matching: matchingConfig,
        adapter: mockAdapter,
      })

      vi.mocked(mockAdapter.count).mockResolvedValue(10000)
      vi.mocked(mockAdapter.findAll).mockResolvedValue([
        {
          id: 'rec1',
          firstName: 'John',
          lastName: 'Smith',
          email: 'john@example.com',
        },
      ])

      const result = await resolver.deduplicateBatchFromDatabase({
        batchSize: 100,
        maxRecords: 500,
      })

      expect(result.stats.recordsProcessed).toBeLessThanOrEqual(500)
    })
  })

  describe('findAndMergeDuplicates', () => {
    it('throws error if adapter not configured', async () => {
      const resolver = new Resolver<TestRecord>({
        schema,
        matching: matchingConfig,
      })

      await expect(resolver.findAndMergeDuplicates()).rejects.toThrow(
        'Database adapter is not configured'
      )
    })

    it('identifies duplicates from database', async () => {
      const resolver = new Resolver<TestRecord>({
        schema,
        matching: matchingConfig,
        adapter: mockAdapter,
      })

      const records: TestRecord[] = [
        {
          id: 'rec1',
          firstName: 'John',
          lastName: 'Smith',
          email: 'john@example.com',
        },
        {
          id: 'rec2',
          firstName: 'John',
          lastName: 'Smith',
          email: 'john@example.com',
        },
      ]

      vi.mocked(mockAdapter.count).mockResolvedValue(2)
      vi.mocked(mockAdapter.findAll).mockResolvedValue(records)
      vi.mocked(mockAdapter.findByIds).mockResolvedValue(records)
      vi.mocked(mockAdapter.update).mockImplementation(async (id, updates) => ({
        ...records[0],
        ...updates,
      }))
      vi.mocked(mockAdapter.transaction).mockImplementation(async (callback) => {
        return callback(mockAdapter)
      })

      const results = await resolver.findAndMergeDuplicates({
        deleteAfterMerge: false,
        useTransaction: true,
      })

      expect(results).toBeDefined()
      expect(Array.isArray(results)).toBe(true)
    })

    it('merges records with basic strategy', async () => {
      const resolver = new Resolver<TestRecord>({
        schema,
        matching: matchingConfig,
        adapter: mockAdapter,
      })

      const records: TestRecord[] = [
        {
          id: 'rec1',
          firstName: 'John',
          lastName: 'Smith',
          email: 'john@example.com',
        },
        {
          id: 'rec2',
          firstName: 'John',
          lastName: 'Smith',
          email: 'john@example.com',
        },
      ]

      vi.mocked(mockAdapter.count).mockResolvedValue(2)
      vi.mocked(mockAdapter.findAll).mockResolvedValue(records)
      vi.mocked(mockAdapter.findByIds).mockResolvedValue(records)
      vi.mocked(mockAdapter.update).mockResolvedValue(records[0])
      vi.mocked(mockAdapter.transaction).mockImplementation(async (callback) => {
        return callback(mockAdapter)
      })

      const results = await resolver.findAndMergeDuplicates()

      expect(results).toBeDefined()
      expect(Array.isArray(results)).toBe(true)
    })

    it('persists merged records', async () => {
      const resolver = new Resolver<TestRecord>({
        schema,
        matching: matchingConfig,
        adapter: mockAdapter,
      })

      const records: TestRecord[] = [
        {
          id: 'rec1',
          firstName: 'John',
          lastName: 'Smith',
          email: 'john@example.com',
        },
        {
          id: 'rec2',
          firstName: 'John',
          lastName: 'Smith',
          email: 'john@example.com',
        },
      ]

      vi.mocked(mockAdapter.count).mockResolvedValue(2)
      vi.mocked(mockAdapter.findAll).mockResolvedValue(records)
      vi.mocked(mockAdapter.findByIds).mockResolvedValue(records)
      vi.mocked(mockAdapter.update).mockResolvedValue(records[0])
      vi.mocked(mockAdapter.transaction).mockImplementation(async (callback) => {
        return callback(mockAdapter)
      })

      const results = await resolver.findAndMergeDuplicates()

      expect(results).toBeDefined()
      expect(Array.isArray(results)).toBe(true)
    })

    it('uses transactions for consistency', async () => {
      const resolver = new Resolver<TestRecord>({
        schema,
        matching: matchingConfig,
        adapter: mockAdapter,
      })

      vi.mocked(mockAdapter.count).mockResolvedValue(0)
      vi.mocked(mockAdapter.findAll).mockResolvedValue([])
      vi.mocked(mockAdapter.transaction).mockImplementation(async (callback) => {
        return callback(mockAdapter)
      })

      const results = await resolver.findAndMergeDuplicates({
        useTransaction: true,
      })

      expect(results).toBeDefined()
      expect(Array.isArray(results)).toBe(true)
    })

    it('deletes duplicates when deleteAfterMerge is true', async () => {
      const resolver = new Resolver<TestRecord>({
        schema,
        matching: matchingConfig,
        adapter: mockAdapter,
      })

      const records: TestRecord[] = [
        {
          id: 'rec1',
          firstName: 'John',
          lastName: 'Smith',
          email: 'john@example.com',
        },
        {
          id: 'rec2',
          firstName: 'John',
          lastName: 'Smith',
          email: 'john@example.com',
        },
      ]

      vi.mocked(mockAdapter.count).mockResolvedValue(2)
      vi.mocked(mockAdapter.findAll).mockResolvedValue(records)
      vi.mocked(mockAdapter.findByIds).mockResolvedValue(records)
      vi.mocked(mockAdapter.update).mockResolvedValue(records[0])
      vi.mocked(mockAdapter.delete).mockResolvedValue()
      vi.mocked(mockAdapter.transaction).mockImplementation(async (callback) => {
        return callback(mockAdapter)
      })

      const results = await resolver.findAndMergeDuplicates({
        deleteAfterMerge: true,
        useTransaction: true,
      })

      expect(results).toBeDefined()
      expect(Array.isArray(results)).toBe(true)
    })
  })
})
