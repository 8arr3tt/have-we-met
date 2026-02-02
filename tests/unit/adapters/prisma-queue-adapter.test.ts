import { describe, it, expect, beforeEach, vi } from 'vitest'
import { PrismaQueueAdapter } from '../../../src/adapters/prisma/prisma-queue-adapter'
import type { QueueItem, QueueFilter } from '../../../src/queue/types'
import { NotFoundError } from '../../../src/adapters/adapter-error'

type TestRecord = {
  id: string
  name: string
  email: string
}

describe('PrismaQueueAdapter', () => {
  let mockPrisma: any
  let adapter: PrismaQueueAdapter<TestRecord>

  const createMockQueueItem = (): QueueItem<TestRecord> => ({
    id: 'queue-1',
    candidateRecord: {
      id: 'rec-1',
      name: 'John Doe',
      email: 'john@example.com',
    },
    potentialMatches: [
      {
        record: { id: 'rec-2', name: 'Jon Doe', email: 'jon@example.com' },
        score: 35,
        outcome: 'potential-match' as const,
        explanation: {
          totalScore: 35,
          fieldScores: [
            { field: 'name', score: 20, method: 'levenshtein', details: {} },
          ],
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
    mockPrisma = {
      reviewQueue: {
        create: vi.fn(),
        update: vi.fn(),
        findMany: vi.fn(),
        findUnique: vi.fn(),
        delete: vi.fn(),
        count: vi.fn(),
        createMany: vi.fn(),
      },
    }
    adapter = new PrismaQueueAdapter<TestRecord>(mockPrisma)
  })

  describe('insertQueueItem', () => {
    it('inserts queue item with all fields', async () => {
      const item = createMockQueueItem()
      const serializedItem = {
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

      mockPrisma.reviewQueue.create.mockResolvedValue(serializedItem)

      const result = await adapter.insertQueueItem(item)

      expect(mockPrisma.reviewQueue.create).toHaveBeenCalledWith({
        data: serializedItem,
      })
      expect(result.id).toBe(item.id)
      expect(result.status).toBe('pending')
    })

    it('serializes candidateRecord as JSON', async () => {
      const item = createMockQueueItem()
      mockPrisma.reviewQueue.create.mockResolvedValue({
        ...item,
        candidateRecord: JSON.stringify(item.candidateRecord),
        potentialMatches: JSON.stringify(item.potentialMatches),
      })

      await adapter.insertQueueItem(item)

      const call = mockPrisma.reviewQueue.create.mock.calls[0][0]
      expect(typeof call.data.candidateRecord).toBe('string')
      expect(JSON.parse(call.data.candidateRecord)).toEqual(
        item.candidateRecord
      )
    })

    it('validates queue item before insertion', async () => {
      const invalidItem = { ...createMockQueueItem(), potentialMatches: [] }

      await expect(adapter.insertQueueItem(invalidItem)).rejects.toThrow()
    })
  })

  describe('updateQueueItem', () => {
    it('updates status', async () => {
      const updates = { status: 'confirmed' as const }
      mockPrisma.reviewQueue.update.mockResolvedValue({
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

      expect(mockPrisma.reviewQueue.update).toHaveBeenCalledWith({
        where: { id: 'queue-1' },
        data: expect.objectContaining({
          status: 'confirmed',
          updatedAt: expect.any(Date),
        }),
      })
      expect(result.status).toBe('confirmed')
    })

    it('throws NotFoundError if item not found', async () => {
      mockPrisma.reviewQueue.update.mockRejectedValue(
        new Error('Record to update not found')
      )

      await expect(
        adapter.updateQueueItem('nonexistent', { status: 'confirmed' })
      ).rejects.toThrow(NotFoundError)
    })
  })

  describe('findQueueItems', () => {
    it('finds items by status', async () => {
      const filter: QueueFilter = { status: 'pending' }
      mockPrisma.reviewQueue.findMany.mockResolvedValue([
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

      expect(mockPrisma.reviewQueue.findMany).toHaveBeenCalledWith({
        where: { status: { in: ['pending'] } },
        take: undefined,
        skip: undefined,
      })
      expect(results).toHaveLength(1)
      expect(results[0].status).toBe('pending')
    })

    it('filters by tags', async () => {
      const filter: QueueFilter = { tags: ['urgent'] }
      mockPrisma.reviewQueue.findMany.mockResolvedValue([])

      await adapter.findQueueItems(filter)

      expect(mockPrisma.reviewQueue.findMany).toHaveBeenCalledWith({
        where: { tags: { hasEvery: ['urgent'] } },
        take: undefined,
        skip: undefined,
      })
    })

    it('filters by date range', async () => {
      const since = new Date('2024-01-01')
      const until = new Date('2024-12-31')
      const filter: QueueFilter = { since, until }
      mockPrisma.reviewQueue.findMany.mockResolvedValue([])

      await adapter.findQueueItems(filter)

      expect(mockPrisma.reviewQueue.findMany).toHaveBeenCalledWith({
        where: { createdAt: { gte: since, lte: until } },
        take: undefined,
        skip: undefined,
      })
    })

    it('applies limit and offset', async () => {
      const filter: QueueFilter = { limit: 10, offset: 20 }
      mockPrisma.reviewQueue.findMany.mockResolvedValue([])

      await adapter.findQueueItems(filter)

      expect(mockPrisma.reviewQueue.findMany).toHaveBeenCalledWith({
        where: {},
        take: 10,
        skip: 20,
      })
    })

    it('orders by field and direction', async () => {
      const filter: QueueFilter = {
        orderBy: { field: 'createdAt', direction: 'desc' },
      }
      mockPrisma.reviewQueue.findMany.mockResolvedValue([])

      await adapter.findQueueItems(filter)

      expect(mockPrisma.reviewQueue.findMany).toHaveBeenCalledWith({
        where: {},
        take: undefined,
        skip: undefined,
        orderBy: { createdAt: 'desc' },
      })
    })
  })

  describe('findQueueItemById', () => {
    it('retrieves item by ID', async () => {
      mockPrisma.reviewQueue.findUnique.mockResolvedValue({
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
      mockPrisma.reviewQueue.findUnique.mockResolvedValue(null)

      const result = await adapter.findQueueItemById('nonexistent')

      expect(result).toBeNull()
    })
  })

  describe('deleteQueueItem', () => {
    it('deletes item by ID', async () => {
      mockPrisma.reviewQueue.delete.mockResolvedValue({})

      await adapter.deleteQueueItem('queue-1')

      expect(mockPrisma.reviewQueue.delete).toHaveBeenCalledWith({
        where: { id: 'queue-1' },
      })
    })

    it('throws NotFoundError if item not found', async () => {
      mockPrisma.reviewQueue.delete.mockRejectedValue(
        new Error('Record to delete does not exist')
      )

      await expect(adapter.deleteQueueItem('nonexistent')).rejects.toThrow(
        NotFoundError
      )
    })
  })

  describe('countQueueItems', () => {
    it('counts all items', async () => {
      mockPrisma.reviewQueue.count.mockResolvedValue(42)

      const count = await adapter.countQueueItems()

      expect(count).toBe(42)
      expect(mockPrisma.reviewQueue.count).toHaveBeenCalledWith({
        where: undefined,
      })
    })

    it('counts items by status', async () => {
      const filter: QueueFilter = { status: 'pending' }
      mockPrisma.reviewQueue.count.mockResolvedValue(10)

      const count = await adapter.countQueueItems(filter)

      expect(count).toBe(10)
      expect(mockPrisma.reviewQueue.count).toHaveBeenCalledWith({
        where: { status: { in: ['pending'] } },
      })
    })
  })

  describe('batchInsertQueueItems', () => {
    it('inserts multiple items efficiently', async () => {
      const items = [
        createMockQueueItem(),
        { ...createMockQueueItem(), id: 'queue-2' },
      ]
      mockPrisma.reviewQueue.createMany.mockResolvedValue({ count: 2 })
      mockPrisma.reviewQueue.findMany.mockResolvedValue(
        items.map((item) => ({
          ...item,
          candidateRecord: JSON.stringify(item.candidateRecord),
          potentialMatches: JSON.stringify(item.potentialMatches),
        }))
      )

      const results = await adapter.batchInsertQueueItems(items)

      expect(mockPrisma.reviewQueue.createMany).toHaveBeenCalled()
      expect(results).toHaveLength(2)
    })

    it('returns empty array for empty input', async () => {
      const results = await adapter.batchInsertQueueItems([])

      expect(results).toEqual([])
      expect(mockPrisma.reviewQueue.createMany).not.toHaveBeenCalled()
    })
  })
})
