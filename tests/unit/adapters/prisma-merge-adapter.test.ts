import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  PrismaMergeAdapter,
  PrismaProvenanceAdapter,
  createPrismaMergeAdapter,
  createPrismaProvenanceAdapter,
} from '../../../src/adapters/prisma/prisma-merge-adapter'
import { QueryError, NotFoundError } from '../../../src/adapters/adapter-error'
import type { Provenance, MergeConfig } from '../../../src/merge/types'

type TestRecord = {
  id: string
  name: string
  email: string
}

const createMockPrismaClient = () => {
  return {
    testRecords: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      count: vi.fn(),
    },
    provenance: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    $transaction: vi.fn(),
  }
}

describe('PrismaProvenanceAdapter', () => {
  let mockPrisma: ReturnType<typeof createMockPrismaClient>
  let adapter: PrismaProvenanceAdapter

  beforeEach(() => {
    mockPrisma = createMockPrismaClient()
    adapter = new PrismaProvenanceAdapter(mockPrisma as unknown as any, 'provenance')
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
        allValues: [
          { recordId: 'rec-1', value: 'John' },
          { recordId: 'rec-2', value: null },
        ],
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
    it('saves provenance via upsert', async () => {
      const provenance = createTestProvenance()
      mockPrisma.provenance.upsert.mockResolvedValue({})

      await adapter.save(provenance)

      expect(mockPrisma.provenance.upsert).toHaveBeenCalledWith({
        where: { goldenRecordId: 'golden-1' },
        update: expect.objectContaining({
          sourceRecordIds: ['rec-1', 'rec-2'],
          mergedAt: provenance.mergedAt,
          mergedBy: 'admin',
        }),
        create: expect.objectContaining({
          goldenRecordId: 'golden-1',
          sourceRecordIds: ['rec-1', 'rec-2'],
          mergedAt: provenance.mergedAt,
        }),
      })
    })

    it('handles database errors', async () => {
      const provenance = createTestProvenance()
      mockPrisma.provenance.upsert.mockRejectedValue(new Error('Database error'))

      await expect(adapter.save(provenance)).rejects.toThrow(QueryError)
    })
  })

  describe('get', () => {
    it('returns provenance when found', async () => {
      const provenance = createTestProvenance()
      mockPrisma.provenance.findUnique.mockResolvedValue({
        goldenRecordId: 'golden-1',
        sourceRecordIds: ['rec-1', 'rec-2'],
        mergedAt: '2023-06-01T00:00:00.000Z',
        mergedBy: 'admin',
        queueItemId: 'queue-1',
        fieldSources: JSON.stringify(provenance.fieldSources),
        strategyUsed: JSON.stringify(provenance.strategyUsed),
        unmerged: false,
      })

      const result = await adapter.get('golden-1')

      expect(result).not.toBeNull()
      expect(result!.goldenRecordId).toBe('golden-1')
      expect(result!.sourceRecordIds).toEqual(['rec-1', 'rec-2'])
    })

    it('returns null when not found', async () => {
      mockPrisma.provenance.findUnique.mockResolvedValue(null)

      const result = await adapter.get('non-existent')

      expect(result).toBeNull()
    })
  })

  describe('getBySourceId', () => {
    it('finds provenance records containing source ID', async () => {
      const provenance = createTestProvenance()
      mockPrisma.provenance.findMany.mockResolvedValue([
        {
          goldenRecordId: 'golden-1',
          sourceRecordIds: ['rec-1', 'rec-2'],
          mergedAt: '2023-06-01T00:00:00.000Z',
          fieldSources: JSON.stringify(provenance.fieldSources),
          strategyUsed: JSON.stringify(provenance.strategyUsed),
          unmerged: false,
        },
      ])

      const results = await adapter.getBySourceId('rec-1')

      expect(mockPrisma.provenance.findMany).toHaveBeenCalledWith({
        where: {
          sourceRecordIds: { has: 'rec-1' },
        },
      })
      expect(results).toHaveLength(1)
    })
  })

  describe('markUnmerged', () => {
    it('updates provenance with unmerge info', async () => {
      mockPrisma.provenance.update.mockResolvedValue({})

      const unmergeInfo = {
        unmergedAt: new Date('2023-07-01'),
        unmergedBy: 'admin',
        reason: 'Incorrect match',
      }

      await adapter.markUnmerged('golden-1', unmergeInfo)

      expect(mockPrisma.provenance.update).toHaveBeenCalledWith({
        where: { goldenRecordId: 'golden-1' },
        data: {
          unmerged: true,
          unmergedAt: unmergeInfo.unmergedAt,
          unmergedBy: 'admin',
          unmergeReason: 'Incorrect match',
        },
      })
    })

    it('throws NotFoundError when record not found', async () => {
      mockPrisma.provenance.update.mockResolvedValue(null)

      await expect(
        adapter.markUnmerged('non-existent', { unmergedAt: new Date() })
      ).rejects.toThrow(NotFoundError)
    })
  })

  describe('delete', () => {
    it('deletes provenance record', async () => {
      mockPrisma.provenance.delete.mockResolvedValue({})

      const result = await adapter.delete('golden-1')

      expect(result).toBe(true)
      expect(mockPrisma.provenance.delete).toHaveBeenCalledWith({
        where: { goldenRecordId: 'golden-1' },
      })
    })

    it('returns false when record does not exist', async () => {
      mockPrisma.provenance.delete.mockRejectedValue(
        new Error('Record to delete does not exist')
      )

      const result = await adapter.delete('non-existent')

      expect(result).toBe(false)
    })
  })

  describe('exists', () => {
    it('returns true when provenance exists', async () => {
      mockPrisma.provenance.count.mockResolvedValue(1)

      const result = await adapter.exists('golden-1')

      expect(result).toBe(true)
    })

    it('returns false when provenance does not exist', async () => {
      mockPrisma.provenance.count.mockResolvedValue(0)

      const result = await adapter.exists('non-existent')

      expect(result).toBe(false)
    })
  })

  describe('count', () => {
    it('counts all provenance records by default', async () => {
      mockPrisma.provenance.count.mockResolvedValue(10)

      const result = await adapter.count()

      expect(mockPrisma.provenance.count).toHaveBeenCalledWith({
        where: { unmerged: false },
      })
      expect(result).toBe(10)
    })

    it('includes unmerged when requested', async () => {
      mockPrisma.provenance.count.mockResolvedValue(15)

      const result = await adapter.count(true)

      expect(mockPrisma.provenance.count).toHaveBeenCalledWith({ where: {} })
      expect(result).toBe(15)
    })
  })
})

describe('PrismaMergeAdapter', () => {
  let mockPrisma: ReturnType<typeof createMockPrismaClient>
  let adapter: PrismaMergeAdapter<TestRecord>

  beforeEach(() => {
    mockPrisma = createMockPrismaClient()
    adapter = new PrismaMergeAdapter<TestRecord>(mockPrisma as unknown as any, 'testRecords')
  })

  describe('constructor', () => {
    it('creates adapter with default config', () => {
      expect(adapter).toBeInstanceOf(PrismaMergeAdapter)
      expect(adapter.provenance).toBeInstanceOf(PrismaProvenanceAdapter)
    })

    it('accepts custom config', () => {
      const customAdapter = new PrismaMergeAdapter<TestRecord>(
        mockPrisma as unknown as any,
        'testRecords',
        'id',
        { archivedAtField: 'deletedAt', provenanceTable: 'merge_history' }
      )
      expect(customAdapter).toBeInstanceOf(PrismaMergeAdapter)
    })
  })

  describe('archive', () => {
    it('archives records with timestamp', async () => {
      mockPrisma.testRecords.updateMany.mockResolvedValue({ count: 2 })

      await adapter.archive(['rec-1', 'rec-2'], {
        reason: 'merged',
        mergedIntoId: 'golden-1',
      })

      expect(mockPrisma.testRecords.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['rec-1', 'rec-2'] } },
        data: expect.objectContaining({
          archivedAt: expect.any(Date),
          archivedReason: 'merged',
          mergedIntoId: 'golden-1',
        }),
      })
    })

    it('uses default reason when not specified', async () => {
      mockPrisma.testRecords.updateMany.mockResolvedValue({ count: 1 })

      await adapter.archive(['rec-1'])

      expect(mockPrisma.testRecords.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['rec-1'] } },
        data: expect.objectContaining({
          archivedReason: 'merged',
        }),
      })
    })

    it('handles empty array', async () => {
      await adapter.archive([])
      expect(mockPrisma.testRecords.updateMany).not.toHaveBeenCalled()
    })

    it('handles database errors', async () => {
      mockPrisma.testRecords.updateMany.mockRejectedValue(new Error('Database error'))

      await expect(adapter.archive(['rec-1'])).rejects.toThrow(QueryError)
    })
  })

  describe('restore', () => {
    it('restores archived records', async () => {
      const records = [
        { id: 'rec-1', name: 'John', email: 'john@test.com' },
        { id: 'rec-2', name: 'Jane', email: 'jane@test.com' },
      ]
      mockPrisma.testRecords.updateMany.mockResolvedValue({ count: 2 })
      mockPrisma.testRecords.findMany.mockResolvedValue(records)

      const result = await adapter.restore(['rec-1', 'rec-2'])

      expect(mockPrisma.testRecords.updateMany).toHaveBeenCalledWith({
        where: {
          id: { in: ['rec-1', 'rec-2'] },
          archivedAt: { not: null },
        },
        data: {
          archivedAt: null,
          archivedReason: null,
          mergedIntoId: null,
        },
      })
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
      mockPrisma.testRecords.findMany.mockResolvedValue([
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
      ])

      const result = await adapter.getArchived(['rec-1'])

      expect(mockPrisma.testRecords.findMany).toHaveBeenCalledWith({
        where: {
          id: { in: ['rec-1'] },
          archivedAt: { not: null },
        },
      })
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('rec-1')
      expect(result[0].archivedReason).toBe('merged')
    })

    it('returns empty array for empty input', async () => {
      const result = await adapter.getArchived([])
      expect(result).toEqual([])
    })
  })

  describe('isArchived', () => {
    it('checks archived status for multiple IDs', async () => {
      mockPrisma.testRecords.findMany.mockResolvedValue([{ id: 'rec-1' }])

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
      mockPrisma.testRecords.findMany.mockResolvedValue([
        {
          id: 'rec-1',
          name: 'John',
          archivedAt: new Date(),
          archivedReason: 'merged',
          mergedIntoId: 'golden-1',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ])

      const result = await adapter.getArchivedByGoldenRecord('golden-1')

      expect(mockPrisma.testRecords.findMany).toHaveBeenCalledWith({
        where: {
          mergedIntoId: 'golden-1',
          archivedAt: { not: null },
        },
      })
      expect(result).toHaveLength(1)
    })
  })

  describe('permanentlyDeleteArchived', () => {
    it('permanently deletes archived records', async () => {
      mockPrisma.testRecords.deleteMany.mockResolvedValue({ count: 2 })

      await adapter.permanentlyDeleteArchived(['rec-1', 'rec-2'])

      expect(mockPrisma.testRecords.deleteMany).toHaveBeenCalledWith({
        where: {
          id: { in: ['rec-1', 'rec-2'] },
          archivedAt: { not: null },
        },
      })
    })

    it('does nothing for empty array', async () => {
      await adapter.permanentlyDeleteArchived([])
      expect(mockPrisma.testRecords.deleteMany).not.toHaveBeenCalled()
    })
  })

  describe('countArchived', () => {
    it('counts all archived records', async () => {
      mockPrisma.testRecords.count.mockResolvedValue(5)

      const result = await adapter.countArchived()

      expect(mockPrisma.testRecords.count).toHaveBeenCalledWith({
        where: { archivedAt: { not: null } },
      })
      expect(result).toBe(5)
    })

    it('counts archived records for specific golden record', async () => {
      mockPrisma.testRecords.count.mockResolvedValue(2)

      const result = await adapter.countArchived('golden-1')

      expect(mockPrisma.testRecords.count).toHaveBeenCalledWith({
        where: {
          archivedAt: { not: null },
          mergedIntoId: 'golden-1',
        },
      })
      expect(result).toBe(2)
    })
  })
})

describe('factory functions', () => {
  it('createPrismaMergeAdapter creates adapter', () => {
    const mockPrisma = createMockPrismaClient()
    const adapter = createPrismaMergeAdapter<TestRecord>(
      mockPrisma as unknown as any,
      'testRecords'
    )
    expect(adapter).toBeInstanceOf(PrismaMergeAdapter)
  })

  it('createPrismaProvenanceAdapter creates adapter', () => {
    const mockPrisma = createMockPrismaClient()
    const adapter = createPrismaProvenanceAdapter(mockPrisma as unknown as any)
    expect(adapter).toBeInstanceOf(PrismaProvenanceAdapter)
  })
})
