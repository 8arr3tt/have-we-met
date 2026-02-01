import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  DrizzleMergeAdapter,
  DrizzleProvenanceAdapter,
  createDrizzleMergeAdapter,
  createDrizzleProvenanceAdapter,
} from '../../../src/adapters/drizzle/drizzle-merge-adapter'
import { QueryError, NotFoundError } from '../../../src/adapters/adapter-error'
import type { Provenance, MergeConfig } from '../../../src/merge/types'

type TestRecord = {
  id: string
  name: string
  email: string
}

const createMockDrizzleDb = () => {
  const mockQuery = {
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
  }

  return {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue(mockQuery),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([]),
        onConflictDoUpdate: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    }),
    delete: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
    transaction: vi.fn(),
  }
}

const createMockTable = () => ({
  id: { name: 'id' },
  name: { name: 'name' },
  email: { name: 'email' },
  archivedAt: { name: 'archivedAt' },
  archivedReason: { name: 'archivedReason' },
  mergedIntoId: { name: 'mergedIntoId' },
  createdAt: { name: 'createdAt' },
  updatedAt: { name: 'updatedAt' },
})

const createProvenanceTable = () => ({
  goldenRecordId: { name: 'goldenRecordId' },
  sourceRecordIds: { name: 'sourceRecordIds' },
  mergedAt: { name: 'mergedAt' },
  mergedBy: { name: 'mergedBy' },
  queueItemId: { name: 'queueItemId' },
  fieldSources: { name: 'fieldSources' },
  strategyUsed: { name: 'strategyUsed' },
  unmerged: { name: 'unmerged' },
  unmergedAt: { name: 'unmergedAt' },
  unmergedBy: { name: 'unmergedBy' },
  unmergeReason: { name: 'unmergeReason' },
})

const createMockOperators = () => ({
  eq: vi.fn((col, val) => ({ col, val, op: 'eq' })),
  ne: vi.fn((col, val) => ({ col, val, op: 'ne' })),
  gt: vi.fn((col, val) => ({ col, val, op: 'gt' })),
  gte: vi.fn((col, val) => ({ col, val, op: 'gte' })),
  lt: vi.fn((col, val) => ({ col, val, op: 'lt' })),
  lte: vi.fn((col, val) => ({ col, val, op: 'lte' })),
  inArray: vi.fn((col, vals) => ({ col, vals, op: 'in' })),
  arrayContains: vi.fn((col, vals) => ({ col, vals, op: 'contains' })),
  like: vi.fn((col, val) => ({ col, val, op: 'like' })),
  and: vi.fn((...conditions) => ({ conditions, op: 'and' })),
  or: vi.fn((...conditions) => ({ conditions, op: 'or' })),
  isNull: vi.fn((col) => ({ col, op: 'isNull' })),
  isNotNull: vi.fn((col) => ({ col, op: 'isNotNull' })),
  asc: vi.fn((col) => ({ col, dir: 'asc' })),
  desc: vi.fn((col) => ({ col, dir: 'desc' })),
  count: vi.fn(() => 'count(*)'),
})

describe('DrizzleProvenanceAdapter', () => {
  let mockDb: ReturnType<typeof createMockDrizzleDb>
  let mockTable: ReturnType<typeof createProvenanceTable>
  let mockOperators: ReturnType<typeof createMockOperators>
  let adapter: DrizzleProvenanceAdapter

  beforeEach(() => {
    mockDb = createMockDrizzleDb()
    mockTable = createProvenanceTable()
    mockOperators = createMockOperators()
    adapter = new DrizzleProvenanceAdapter(
      mockDb as unknown as any,
      mockTable as unknown as any,
      mockOperators as unknown as any
    )
  })

  const createTestProvenance = (): Provenance => ({
    goldenRecordId: 'golden-1',
    sourceRecordIds: ['rec-1', 'rec-2'],
    mergedAt: new Date('2023-06-01'),
    mergedBy: 'admin',
    queueItemId: 'queue-1',
    fieldSources: {
      name: {
        sourceRecordId: 'rec-1',
        strategyApplied: 'preferNonNull',
        allValues: [],
        hadConflict: false,
      },
    },
    strategyUsed: {
      fieldStrategies: [],
      defaultStrategy: 'preferNonNull',
      trackProvenance: true,
      conflictResolution: 'useDefault',
    } as MergeConfig,
  })

  describe('save', () => {
    it('saves provenance via insert with conflict update', async () => {
      const provenance = createTestProvenance()

      await adapter.save(provenance)

      expect(mockDb.insert).toHaveBeenCalled()
    })

    it('handles database errors', async () => {
      const provenance = createTestProvenance()
      mockDb.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          onConflictDoUpdate: vi.fn().mockReturnValue({
            returning: vi.fn().mockRejectedValue(new Error('Database error')),
          }),
        }),
      })

      await expect(adapter.save(provenance)).rejects.toThrow(QueryError)
    })
  })

  describe('get', () => {
    it('returns provenance when found', async () => {
      const provenance = createTestProvenance()
      const mockResults = [
        {
          goldenRecordId: 'golden-1',
          sourceRecordIds: ['rec-1', 'rec-2'],
          mergedAt: '2023-06-01T00:00:00.000Z',
          fieldSources: JSON.stringify(provenance.fieldSources),
          strategyUsed: JSON.stringify(provenance.strategyUsed),
          unmerged: false,
        },
      ]

      const mockQuery = {
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue(mockResults),
      }
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue(mockQuery),
      })

      const result = await adapter.get('golden-1')

      expect(result).not.toBeNull()
      expect(result!.goldenRecordId).toBe('golden-1')
    })

    it('returns null when not found', async () => {
      const mockQuery = {
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      }
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue(mockQuery),
      })

      const result = await adapter.get('non-existent')

      expect(result).toBeNull()
    })
  })

  describe('getBySourceId', () => {
    it('finds provenance records containing source ID', async () => {
      const provenance = createTestProvenance()
      const mockResults = [
        {
          goldenRecordId: 'golden-1',
          sourceRecordIds: ['rec-1', 'rec-2'],
          mergedAt: '2023-06-01T00:00:00.000Z',
          fieldSources: JSON.stringify(provenance.fieldSources),
          strategyUsed: JSON.stringify(provenance.strategyUsed),
          unmerged: false,
        },
      ]

      const mockQuery = {
        where: vi.fn().mockResolvedValue(mockResults),
      }
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue(mockQuery),
      })

      const results = await adapter.getBySourceId('rec-1')

      expect(mockOperators.arrayContains).toHaveBeenCalled()
      expect(results).toHaveLength(1)
    })
  })

  describe('markUnmerged', () => {
    it('updates provenance with unmerge info', async () => {
      mockDb.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ goldenRecordId: 'golden-1' }]),
          }),
        }),
      })

      await adapter.markUnmerged('golden-1', {
        unmergedAt: new Date('2023-07-01'),
        unmergedBy: 'admin',
        reason: 'Incorrect match',
      })

      expect(mockDb.update).toHaveBeenCalled()
    })

    it('throws NotFoundError when record not found', async () => {
      mockDb.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([]),
          }),
        }),
      })

      await expect(
        adapter.markUnmerged('non-existent', { unmergedAt: new Date() })
      ).rejects.toThrow(NotFoundError)
    })
  })

  describe('delete', () => {
    it('deletes provenance record', async () => {
      const result = await adapter.delete('golden-1')

      expect(result).toBe(true)
      expect(mockDb.delete).toHaveBeenCalled()
    })
  })

  describe('exists', () => {
    it('returns true when provenance exists', async () => {
      const mockQuery = {
        where: vi.fn().mockResolvedValue([{ count: 1 }]),
      }
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue(mockQuery),
      })

      const result = await adapter.exists('golden-1')

      expect(result).toBe(true)
    })

    it('returns false when provenance does not exist', async () => {
      const mockQuery = {
        where: vi.fn().mockResolvedValue([{ count: 0 }]),
      }
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue(mockQuery),
      })

      const result = await adapter.exists('non-existent')

      expect(result).toBe(false)
    })
  })

  describe('count', () => {
    it('counts provenance records', async () => {
      const mockQuery = {
        where: vi.fn().mockResolvedValue([{ count: 10 }]),
      }
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue(mockQuery),
      })

      const result = await adapter.count()

      expect(result).toBe(10)
    })

    it('includes unmerged when requested', async () => {
      // When includeUnmerged is true, no where clause is added
      // so the query resolves directly from the from() call
      mockDb.select.mockReturnValue({
        from: vi.fn().mockResolvedValue([{ count: 15 }]),
      })

      const result = await adapter.count(true)

      expect(result).toBe(15)
    })
  })
})

describe('DrizzleMergeAdapter', () => {
  let mockDb: ReturnType<typeof createMockDrizzleDb>
  let mockTable: ReturnType<typeof createMockTable>
  let mockOperators: ReturnType<typeof createMockOperators>
  let adapter: DrizzleMergeAdapter<TestRecord>

  beforeEach(() => {
    mockDb = createMockDrizzleDb()
    mockTable = createMockTable()
    mockOperators = createMockOperators()
    adapter = new DrizzleMergeAdapter<TestRecord>(
      mockDb as unknown as any,
      mockTable as unknown as any,
      mockOperators as unknown as any
    )
  })

  describe('constructor', () => {
    it('creates adapter without provenance when no table provided', () => {
      expect(adapter.provenance).toBeUndefined()
    })

    it('creates adapter with provenance when table provided', () => {
      const provenanceTable = createProvenanceTable()
      const adapterWithProvenance = new DrizzleMergeAdapter<TestRecord>(
        mockDb as unknown as any,
        mockTable as unknown as any,
        mockOperators as unknown as any,
        'id',
        {},
        provenanceTable as unknown as any
      )
      expect(adapterWithProvenance.provenance).toBeInstanceOf(DrizzleProvenanceAdapter)
    })
  })

  describe('archive', () => {
    it('archives records with timestamp', async () => {
      await adapter.archive(['rec-1', 'rec-2'], {
        reason: 'merged',
        mergedIntoId: 'golden-1',
      })

      expect(mockDb.update).toHaveBeenCalled()
      expect(mockOperators.inArray).toHaveBeenCalled()
    })

    it('handles empty array', async () => {
      await adapter.archive([])
      expect(mockDb.update).not.toHaveBeenCalled()
    })

    it('handles database errors', async () => {
      mockDb.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockRejectedValue(new Error('Database error')),
          }),
        }),
      })

      await expect(adapter.archive(['rec-1'])).rejects.toThrow(QueryError)
    })
  })

  describe('restore', () => {
    it('restores archived records', async () => {
      const records = [
        { id: 'rec-1', name: 'John', email: 'john@test.com' },
        { id: 'rec-2', name: 'Jane', email: 'jane@test.com' },
      ]

      const mockQuery = {
        where: vi.fn().mockResolvedValue(records),
      }
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue(mockQuery),
      })

      const result = await adapter.restore(['rec-1', 'rec-2'])

      expect(mockDb.update).toHaveBeenCalled()
      expect(result).toEqual(records)
    })

    it('returns empty array for empty input', async () => {
      const result = await adapter.restore([])
      expect(result).toEqual([])
    })
  })

  describe('getArchived', () => {
    it('retrieves archived records', async () => {
      const now = new Date()
      const mockResults = [
        {
          id: 'rec-1',
          name: 'John',
          email: 'john@test.com',
          archivedAt: now,
          archivedReason: 'merged',
          mergedIntoId: 'golden-1',
          createdAt: new Date('2023-01-01'),
          updatedAt: new Date('2023-06-01'),
        },
      ]

      const mockQuery = {
        where: vi.fn().mockResolvedValue(mockResults),
      }
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue(mockQuery),
      })

      const result = await adapter.getArchived(['rec-1'])

      expect(mockOperators.and).toHaveBeenCalled()
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('rec-1')
    })

    it('returns empty array for empty input', async () => {
      const result = await adapter.getArchived([])
      expect(result).toEqual([])
    })
  })

  describe('isArchived', () => {
    it('checks archived status for multiple IDs', async () => {
      const mockQuery = {
        where: vi.fn().mockResolvedValue([{ id: 'rec-1' }]),
      }
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue(mockQuery),
      })

      const result = await adapter.isArchived(['rec-1', 'rec-2'])

      expect(result.get('rec-1')).toBe(true)
      expect(result.get('rec-2')).toBe(false)
    })

    it('returns empty map for empty input', async () => {
      const result = await adapter.isArchived([])
      expect(result.size).toBe(0)
    })
  })

  describe('getArchivedByGoldenRecord', () => {
    it('retrieves archived records for a golden record', async () => {
      const mockResults = [
        {
          id: 'rec-1',
          name: 'John',
          archivedAt: new Date(),
          archivedReason: 'merged',
          mergedIntoId: 'golden-1',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]

      const mockQuery = {
        where: vi.fn().mockResolvedValue(mockResults),
      }
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue(mockQuery),
      })

      const result = await adapter.getArchivedByGoldenRecord('golden-1')

      expect(mockOperators.and).toHaveBeenCalled()
      expect(result).toHaveLength(1)
    })
  })

  describe('permanentlyDeleteArchived', () => {
    it('permanently deletes archived records', async () => {
      await adapter.permanentlyDeleteArchived(['rec-1', 'rec-2'])

      expect(mockDb.delete).toHaveBeenCalled()
    })

    it('does nothing for empty array', async () => {
      await adapter.permanentlyDeleteArchived([])
      expect(mockDb.delete).not.toHaveBeenCalled()
    })
  })

  describe('countArchived', () => {
    it('counts all archived records', async () => {
      const mockQuery = {
        where: vi.fn().mockResolvedValue([{ count: 5 }]),
      }
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue(mockQuery),
      })

      const result = await adapter.countArchived()

      expect(mockOperators.isNotNull).toHaveBeenCalled()
      expect(result).toBe(5)
    })

    it('counts archived records for specific golden record', async () => {
      const mockQuery = {
        where: vi.fn().mockResolvedValue([{ count: 2 }]),
      }
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue(mockQuery),
      })

      const result = await adapter.countArchived('golden-1')

      expect(mockOperators.and).toHaveBeenCalled()
      expect(result).toBe(2)
    })
  })
})

describe('factory functions', () => {
  it('createDrizzleMergeAdapter creates adapter', () => {
    const mockDb = createMockDrizzleDb()
    const mockTable = createMockTable()
    const mockOperators = createMockOperators()

    const adapter = createDrizzleMergeAdapter<TestRecord>(
      mockDb as unknown as any,
      mockTable as unknown as any,
      mockOperators as unknown as any
    )

    expect(adapter).toBeInstanceOf(DrizzleMergeAdapter)
  })

  it('createDrizzleProvenanceAdapter creates adapter', () => {
    const mockDb = createMockDrizzleDb()
    const mockTable = createProvenanceTable()
    const mockOperators = createMockOperators()

    const adapter = createDrizzleProvenanceAdapter(
      mockDb as unknown as any,
      mockTable as unknown as any,
      mockOperators as unknown as any
    )

    expect(adapter).toBeInstanceOf(DrizzleProvenanceAdapter)
  })
})
