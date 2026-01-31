import { describe, it, expect, beforeEach, vi } from 'vitest'
import { TypeORMQueueAdapter } from '../../../src/adapters/typeorm/typeorm-queue-adapter'
import type { QueueItem, QueueFilter } from '../../../src/queue/types'
import { NotFoundError } from '../../../src/adapters/adapter-error'

type TestRecord = {
  id: string
  name: string
  email: string
}

describe('TypeORMQueueAdapter', () => {
  let mockRepository: any
  let adapter: TypeORMQueueAdapter<TestRecord>

  const createMockQueueItem = (): QueueItem<TestRecord> => ({
    id: 'queue-1',
    candidateRecord: { id: 'rec-1', name: 'John Doe', email: 'john@example.com' },
    potentialMatches: [
      {
        record: { id: 'rec-2', name: 'Jon Doe', email: 'jon@example.com' },
        score: 35,
        outcome: 'potential-match' as const,
        explanation: {
          totalScore: 35,
          fieldScores: [{ field: 'name', score: 20, method: 'levenshtein', details: {} }],
          outcome: 'potential-match' as const,
        },
      },
    ],
    status: 'pending',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    priority: 0,
    tags: [],
  })

  beforeEach(() => {
    mockRepository = {
      find: vi.fn(),
      findOne: vi.fn(),
      count: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      insert: vi.fn(),
    }
    adapter = new TypeORMQueueAdapter<TestRecord>(mockRepository)
  })

  describe('insertQueueItem', () => {
    it('inserts queue item with all fields', async () => {
      const item = createMockQueueItem()
      const serialized = {
        id: item.id,
        candidateRecord: JSON.stringify(item.candidateRecord),
        potentialMatches: JSON.stringify(item.potentialMatches),
        status: item.status,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        decidedAt: null,
        decidedBy: null,
        decision: null,
        context: null,
        priority: 0,
        tags: [],
      }

      mockRepository.save.mockResolvedValue(serialized)

      const result = await adapter.insertQueueItem(item)

      expect(mockRepository.save).toHaveBeenCalled()
      expect(result.id).toBe(item.id)
      expect(result.status).toBe('pending')
    })

    it('validates queue item before insertion', async () => {
      const invalidItem = { ...createMockQueueItem(), potentialMatches: [] }

      await expect(adapter.insertQueueItem(invalidItem)).rejects.toThrow()
    })
  })

  describe('updateQueueItem', () => {
    it('updates status', async () => {
      const updates = { status: 'confirmed' as const }
      mockRepository.update.mockResolvedValue({ affected: 1 })
      mockRepository.findOne.mockResolvedValue({
        id: 'queue-1',
        status: 'confirmed',
        candidateRecord: '{}',
        potentialMatches: '[]',
        createdAt: new Date(),
        updatedAt: new Date(),
        decidedAt: null,
        decidedBy: null,
        decision: null,
        context: null,
        priority: 0,
        tags: [],
      })

      const result = await adapter.updateQueueItem('queue-1', updates)

      expect(mockRepository.update).toHaveBeenCalledWith(
        { id: 'queue-1' },
        expect.objectContaining({ status: 'confirmed', updatedAt: expect.any(Date) })
      )
      expect(result.status).toBe('confirmed')
    })

    it('throws NotFoundError if item not found', async () => {
      mockRepository.update.mockResolvedValue({ affected: 0 })

      await expect(adapter.updateQueueItem('nonexistent', { status: 'confirmed' })).rejects.toThrow(
        NotFoundError
      )
    })
  })

  describe('findQueueItems', () => {
    it('finds items by status', async () => {
      const filter: QueueFilter = { status: 'pending' }
      mockRepository.find.mockResolvedValue([
        {
          id: 'queue-1',
          status: 'pending',
          candidateRecord: JSON.stringify({ id: 'rec-1', name: 'John' }),
          potentialMatches: JSON.stringify([]),
          createdAt: new Date(),
          updatedAt: new Date(),
          decidedAt: null,
          decidedBy: null,
          decision: null,
          context: null,
          priority: 0,
          tags: [],
        },
      ])

      const results = await adapter.findQueueItems(filter)

      expect(mockRepository.find).toHaveBeenCalledWith({
        where: { status: { $in: ['pending'] } },
        take: undefined,
        skip: undefined,
      })
      expect(results).toHaveLength(1)
      expect(results[0].status).toBe('pending')
    })

    it('applies limit and offset', async () => {
      const filter: QueueFilter = { limit: 10, offset: 20 }
      mockRepository.find.mockResolvedValue([])

      await adapter.findQueueItems(filter)

      expect(mockRepository.find).toHaveBeenCalledWith({
        where: {},
        take: 10,
        skip: 20,
      })
    })

    it('orders by field and direction', async () => {
      const filter: QueueFilter = { orderBy: { field: 'createdAt', direction: 'desc' } }
      mockRepository.find.mockResolvedValue([])

      await adapter.findQueueItems(filter)

      expect(mockRepository.find).toHaveBeenCalledWith({
        where: {},
        take: undefined,
        skip: undefined,
        order: { createdAt: 'DESC' },
      })
    })
  })

  describe('findQueueItemById', () => {
    it('retrieves item by ID', async () => {
      mockRepository.findOne.mockResolvedValue({
        id: 'queue-1',
        status: 'pending',
        candidateRecord: JSON.stringify({ id: 'rec-1' }),
        potentialMatches: JSON.stringify([]),
        createdAt: new Date(),
        updatedAt: new Date(),
        decidedAt: null,
        decidedBy: null,
        decision: null,
        context: null,
        priority: 0,
        tags: [],
      })

      const result = await adapter.findQueueItemById('queue-1')

      expect(result).not.toBeNull()
      expect(result?.id).toBe('queue-1')
    })

    it('returns null for non-existent ID', async () => {
      mockRepository.findOne.mockResolvedValue(null)

      const result = await adapter.findQueueItemById('nonexistent')

      expect(result).toBeNull()
    })
  })

  describe('deleteQueueItem', () => {
    it('deletes item by ID', async () => {
      mockRepository.delete.mockResolvedValue({ affected: 1 })

      await adapter.deleteQueueItem('queue-1')

      expect(mockRepository.delete).toHaveBeenCalledWith({ id: 'queue-1' })
    })

    it('throws NotFoundError if item not found', async () => {
      mockRepository.delete.mockResolvedValue({ affected: 0 })

      await expect(adapter.deleteQueueItem('nonexistent')).rejects.toThrow(NotFoundError)
    })
  })

  describe('countQueueItems', () => {
    it('counts all items', async () => {
      mockRepository.count.mockResolvedValue(42)

      const count = await adapter.countQueueItems()

      expect(count).toBe(42)
    })

    it('counts items by status', async () => {
      const filter: QueueFilter = { status: 'pending' }
      mockRepository.count.mockResolvedValue(10)

      const count = await adapter.countQueueItems(filter)

      expect(count).toBe(10)
      expect(mockRepository.count).toHaveBeenCalledWith({
        where: { status: { $in: ['pending'] } },
      })
    })
  })

  describe('batchInsertQueueItems', () => {
    it('inserts multiple items efficiently', async () => {
      const items = [createMockQueueItem(), { ...createMockQueueItem(), id: 'queue-2' }]
      mockRepository.insert.mockResolvedValue({})
      mockRepository.find.mockResolvedValue(
        items.map((item) => ({
          ...item,
          candidateRecord: JSON.stringify(item.candidateRecord),
          potentialMatches: JSON.stringify(item.potentialMatches),
        }))
      )

      const results = await adapter.batchInsertQueueItems(items)

      expect(mockRepository.insert).toHaveBeenCalled()
      expect(results).toHaveLength(2)
    })

    it('returns empty array for empty input', async () => {
      const results = await adapter.batchInsertQueueItems([])

      expect(results).toEqual([])
      expect(mockRepository.insert).not.toHaveBeenCalled()
    })
  })
})
