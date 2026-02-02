import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  TypeORMMergeAdapter,
  TypeORMProvenanceAdapter,
  createTypeORMMergeAdapter,
  createTypeORMProvenanceAdapter,
} from '../../../src/adapters/typeorm/typeorm-merge-adapter'
import { QueryError, NotFoundError } from '../../../src/adapters/adapter-error'
import type { Provenance, MergeConfig } from '../../../src/merge/types'

type TestRecord = {
  id: string
  name: string
  email: string
}

const createMockRepository = () => {
  const mockQueryBuilder = {
    where: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    orWhere: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    getMany: vi.fn().mockResolvedValue([]),
    getOne: vi.fn().mockResolvedValue(null),
    getCount: vi.fn().mockResolvedValue(0),
  }

  return {
    find: vi.fn().mockResolvedValue([]),
    findOne: vi.fn().mockResolvedValue(null),
    count: vi.fn().mockResolvedValue(0),
    save: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({ affected: 1 }),
    delete: vi.fn().mockResolvedValue({ affected: 1 }),
    insert: vi.fn().mockResolvedValue({}),
    createQueryBuilder: vi.fn().mockReturnValue(mockQueryBuilder),
    manager: {
      connection: {
        transaction: vi.fn(),
      },
    },
  }
}

describe('TypeORMProvenanceAdapter', () => {
  let mockRepository: ReturnType<typeof createMockRepository>
  let adapter: TypeORMProvenanceAdapter

  beforeEach(() => {
    mockRepository = createMockRepository()
    adapter = new TypeORMProvenanceAdapter(mockRepository as unknown as any)
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
    it('creates new provenance when not exists', async () => {
      const provenance = createTestProvenance()
      mockRepository.findOne.mockResolvedValue(null)
      mockRepository.save.mockResolvedValue({})

      await adapter.save(provenance)

      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          goldenRecordId: 'golden-1',
          mergedAt: provenance.mergedAt,
        })
      )
    })

    it('updates existing provenance', async () => {
      const provenance = createTestProvenance()
      mockRepository.findOne.mockResolvedValue({ goldenRecordId: 'golden-1' })
      mockRepository.update.mockResolvedValue({ affected: 1 })

      await adapter.save(provenance)

      expect(mockRepository.update).toHaveBeenCalledWith(
        { goldenRecordId: 'golden-1' },
        expect.objectContaining({
          goldenRecordId: 'golden-1',
        })
      )
    })

    it('handles database errors', async () => {
      const provenance = createTestProvenance()
      mockRepository.findOne.mockRejectedValue(new Error('Database error'))

      await expect(adapter.save(provenance)).rejects.toThrow(QueryError)
    })
  })

  describe('get', () => {
    it('returns provenance when found', async () => {
      const provenance = createTestProvenance()
      mockRepository.findOne.mockResolvedValue({
        goldenRecordId: 'golden-1',
        sourceRecordIds: JSON.stringify(['rec-1', 'rec-2']),
        mergedAt: '2023-06-01T00:00:00.000Z',
        fieldSources: JSON.stringify(provenance.fieldSources),
        strategyUsed: JSON.stringify(provenance.strategyUsed),
        unmerged: false,
      })

      const result = await adapter.get('golden-1')

      expect(result).not.toBeNull()
      expect(result!.goldenRecordId).toBe('golden-1')
    })

    it('returns null when not found', async () => {
      mockRepository.findOne.mockResolvedValue(null)

      const result = await adapter.get('non-existent')

      expect(result).toBeNull()
    })
  })

  describe('getBySourceId', () => {
    it('finds provenance records containing source ID', async () => {
      const provenance = createTestProvenance()
      const mockQueryBuilder = mockRepository.createQueryBuilder()
      mockQueryBuilder.getMany.mockResolvedValue([
        {
          goldenRecordId: 'golden-1',
          sourceRecordIds: JSON.stringify(['rec-1', 'rec-2']),
          mergedAt: '2023-06-01T00:00:00.000Z',
          fieldSources: JSON.stringify(provenance.fieldSources),
          strategyUsed: JSON.stringify(provenance.strategyUsed),
          unmerged: false,
        },
      ])

      const results = await adapter.getBySourceId('rec-1')

      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'p.sourceRecordIds LIKE :sourceId',
        { sourceId: '%rec-1%' }
      )
      expect(results).toHaveLength(1)
    })
  })

  describe('markUnmerged', () => {
    it('updates provenance with unmerge info', async () => {
      mockRepository.update.mockResolvedValue({ affected: 1 })

      await adapter.markUnmerged('golden-1', {
        unmergedAt: new Date('2023-07-01'),
        unmergedBy: 'admin',
        reason: 'Incorrect match',
      })

      expect(mockRepository.update).toHaveBeenCalledWith(
        { goldenRecordId: 'golden-1' },
        expect.objectContaining({
          unmerged: true,
          unmergedBy: 'admin',
          unmergeReason: 'Incorrect match',
        })
      )
    })

    it('throws NotFoundError when record not found', async () => {
      mockRepository.update.mockResolvedValue({ affected: 0 })

      await expect(
        adapter.markUnmerged('non-existent', { unmergedAt: new Date() })
      ).rejects.toThrow(NotFoundError)
    })
  })

  describe('delete', () => {
    it('deletes provenance record', async () => {
      mockRepository.delete.mockResolvedValue({ affected: 1 })

      const result = await adapter.delete('golden-1')

      expect(result).toBe(true)
    })

    it('returns false when record does not exist', async () => {
      mockRepository.delete.mockResolvedValue({ affected: 0 })

      const result = await adapter.delete('non-existent')

      expect(result).toBe(false)
    })
  })

  describe('exists', () => {
    it('returns true when provenance exists', async () => {
      mockRepository.count.mockResolvedValue(1)

      const result = await adapter.exists('golden-1')

      expect(result).toBe(true)
    })

    it('returns false when provenance does not exist', async () => {
      mockRepository.count.mockResolvedValue(0)

      const result = await adapter.exists('non-existent')

      expect(result).toBe(false)
    })
  })

  describe('count', () => {
    it('counts all provenance records by default', async () => {
      mockRepository.count.mockResolvedValue(10)

      const result = await adapter.count()

      expect(mockRepository.count).toHaveBeenCalledWith({
        where: { unmerged: false },
      })
      expect(result).toBe(10)
    })

    it('includes unmerged when requested', async () => {
      mockRepository.count.mockResolvedValue(15)

      const result = await adapter.count(true)

      expect(mockRepository.count).toHaveBeenCalledWith(undefined)
      expect(result).toBe(15)
    })
  })
})

describe('TypeORMMergeAdapter', () => {
  let mockRepository: ReturnType<typeof createMockRepository>
  let adapter: TypeORMMergeAdapter<TestRecord>

  beforeEach(() => {
    mockRepository = createMockRepository()
    adapter = new TypeORMMergeAdapter<TestRecord>(
      mockRepository as unknown as any
    )
  })

  describe('constructor', () => {
    it('creates adapter without provenance when no repository provided', () => {
      expect(adapter.provenance).toBeUndefined()
    })

    it('creates adapter with provenance when repository provided', () => {
      const provenanceRepo = createMockRepository()
      const adapterWithProvenance = new TypeORMMergeAdapter<TestRecord>(
        mockRepository as unknown as any,
        'id',
        {},
        provenanceRepo as unknown as any
      )
      expect(adapterWithProvenance.provenance).toBeInstanceOf(
        TypeORMProvenanceAdapter
      )
    })
  })

  describe('archive', () => {
    it('archives records with timestamp', async () => {
      mockRepository.update.mockResolvedValue({ affected: 2 })

      await adapter.archive(['rec-1', 'rec-2'], {
        reason: 'merged',
        mergedIntoId: 'golden-1',
      })

      expect(mockRepository.update).toHaveBeenCalledWith(
        { id: { $in: ['rec-1', 'rec-2'] } },
        expect.objectContaining({
          archivedAt: expect.any(Date),
          archivedReason: 'merged',
          mergedIntoId: 'golden-1',
        })
      )
    })

    it('uses default reason when not specified', async () => {
      mockRepository.update.mockResolvedValue({ affected: 1 })

      await adapter.archive(['rec-1'])

      expect(mockRepository.update).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          archivedReason: 'merged',
        })
      )
    })

    it('handles empty array', async () => {
      await adapter.archive([])
      expect(mockRepository.update).not.toHaveBeenCalled()
    })

    it('handles database errors', async () => {
      mockRepository.update.mockRejectedValue(new Error('Database error'))

      await expect(adapter.archive(['rec-1'])).rejects.toThrow(QueryError)
    })
  })

  describe('restore', () => {
    it('restores archived records', async () => {
      const records = [
        { id: 'rec-1', name: 'John', email: 'john@test.com' },
        { id: 'rec-2', name: 'Jane', email: 'jane@test.com' },
      ]
      mockRepository.update.mockResolvedValue({ affected: 2 })
      mockRepository.find.mockResolvedValue(records)

      const result = await adapter.restore(['rec-1', 'rec-2'])

      expect(mockRepository.update).toHaveBeenCalledWith(expect.anything(), {
        archivedAt: null,
        archivedReason: null,
        mergedIntoId: null,
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
      mockRepository.find.mockResolvedValue([
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

      expect(mockRepository.find).toHaveBeenCalledWith({
        where: {
          id: { $in: ['rec-1'] },
          archivedAt: { $ne: null },
        },
      })
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
      const mockQueryBuilder = mockRepository.createQueryBuilder()
      mockQueryBuilder.getMany.mockResolvedValue([{ id: 'rec-1' }])

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
      mockRepository.find.mockResolvedValue([
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

      expect(mockRepository.find).toHaveBeenCalledWith({
        where: {
          mergedIntoId: 'golden-1',
          archivedAt: { $ne: null },
        },
      })
      expect(result).toHaveLength(1)
    })
  })

  describe('permanentlyDeleteArchived', () => {
    it('permanently deletes archived records', async () => {
      mockRepository.delete.mockResolvedValue({ affected: 2 })

      await adapter.permanentlyDeleteArchived(['rec-1', 'rec-2'])

      expect(mockRepository.delete).toHaveBeenCalledWith({
        id: { $in: ['rec-1', 'rec-2'] },
        archivedAt: { $ne: null },
      })
    })

    it('does nothing for empty array', async () => {
      await adapter.permanentlyDeleteArchived([])
      expect(mockRepository.delete).not.toHaveBeenCalled()
    })
  })

  describe('countArchived', () => {
    it('counts all archived records', async () => {
      mockRepository.count.mockResolvedValue(5)

      const result = await adapter.countArchived()

      expect(mockRepository.count).toHaveBeenCalledWith({
        where: { archivedAt: { $ne: null } },
      })
      expect(result).toBe(5)
    })

    it('counts archived records for specific golden record', async () => {
      mockRepository.count.mockResolvedValue(2)

      const result = await adapter.countArchived('golden-1')

      expect(mockRepository.count).toHaveBeenCalledWith({
        where: {
          archivedAt: { $ne: null },
          mergedIntoId: 'golden-1',
        },
      })
      expect(result).toBe(2)
    })
  })
})

describe('factory functions', () => {
  it('createTypeORMMergeAdapter creates adapter', () => {
    const mockRepository = createMockRepository()
    const adapter = createTypeORMMergeAdapter<TestRecord>(
      mockRepository as unknown as any
    )
    expect(adapter).toBeInstanceOf(TypeORMMergeAdapter)
  })

  it('createTypeORMProvenanceAdapter creates adapter', () => {
    const mockRepository = createMockRepository()
    const adapter = createTypeORMProvenanceAdapter(
      mockRepository as unknown as any
    )
    expect(adapter).toBeInstanceOf(TypeORMProvenanceAdapter)
  })
})
