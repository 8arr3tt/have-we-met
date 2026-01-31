import { describe, it, expect, beforeEach, vi } from 'vitest'
import { DrizzleQueueAdapter } from '../../../src/adapters/drizzle/drizzle-queue-adapter'
import type { QueueItem, QueueFilter } from '../../../src/queue/types'
import { NotFoundError } from '../../../src/adapters/adapter-error'

type TestRecord = {
  id: string
  name: string
  email: string
}

describe('DrizzleQueueAdapter', () => {
  let mockDb: any
  let mockTable: any
  let mockOperators: any
  let adapter: DrizzleQueueAdapter<TestRecord>

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
    mockOperators = {
      eq: vi.fn((col, val) => ({ col, op: 'eq', val })),
      inArray: vi.fn((col, val) => ({ col, op: 'in', val })),
      arrayContains: vi.fn((col, val) => ({ col, op: 'contains', val })),
      gte: vi.fn((col, val) => ({ col, op: 'gte', val })),
      lte: vi.fn((col, val) => ({ col, op: 'lte', val })),
      and: vi.fn((...conditions) => ({ op: 'and', conditions })),
      asc: vi.fn((col) => ({ col, dir: 'asc' })),
      desc: vi.fn((col) => ({ col, dir: 'desc' })),
      count: vi.fn(() => ({ fn: 'count' })),
    }

    mockTable = {
      id: { name: 'id' },
      status: { name: 'status' },
      tags: { name: 'tags' },
      createdAt: { name: 'createdAt' },
      priority: { name: 'priority' },
    }

    const mockQuery = {
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      offset: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
    }

    mockDb = {
      select: vi.fn(() => ({
        from: vi.fn(() => mockQuery),
      })),
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([]),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({
            returning: vi.fn().mockResolvedValue([]),
          })),
        })),
      })),
      delete: vi.fn(() => ({
        where: vi.fn().mockResolvedValue(undefined),
      })),
    }

    adapter = new DrizzleQueueAdapter<TestRecord>(mockDb, mockTable, mockOperators)
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

      const mockReturning = vi.fn().mockResolvedValue([serialized])
      const mockValues = vi.fn().mockReturnValue({ returning: mockReturning })
      mockDb.insert = vi.fn().mockReturnValue({ values: mockValues })

      const result = await adapter.insertQueueItem(item)

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
      const mockReturning = vi.fn().mockResolvedValue([
        {
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
        },
      ])
      const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning })
      const mockSet = vi.fn().mockReturnValue({ where: mockWhere })
      mockDb.update = vi.fn().mockReturnValue({ set: mockSet })

      const result = await adapter.updateQueueItem('queue-1', updates)

      expect(result.status).toBe('confirmed')
      expect(mockOperators.eq).toHaveBeenCalled()
    })

    it('throws NotFoundError if no rows updated', async () => {
      mockDb.update().set().where().returning.mockResolvedValue([])

      await expect(adapter.updateQueueItem('nonexistent', { status: 'confirmed' })).rejects.toThrow(
        NotFoundError
      )
    })
  })

  describe('findQueueItems', () => {
    it('finds items by status', async () => {
      const filter: QueueFilter = { status: 'pending' }
      const mockResult = [
        {
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
        },
      ]

      const mockQuery = {
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        offset: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        then: vi.fn((resolve) => resolve(mockResult)),
      }

      mockDb.select = vi.fn(() => ({
        from: vi.fn(() => mockQuery),
      }))

      const results = await adapter.findQueueItems(filter)

      expect(mockOperators.inArray).toHaveBeenCalled()
      expect(results[0].status).toBe('pending')
    })
  })

  describe('batchInsertQueueItems', () => {
    it('inserts multiple items efficiently', async () => {
      const items = [createMockQueueItem(), { ...createMockQueueItem(), id: 'queue-2' }]
      const mockReturning = vi.fn().mockResolvedValue(
        items.map((item) => ({
          ...item,
          candidateRecord: JSON.stringify(item.candidateRecord),
          potentialMatches: JSON.stringify(item.potentialMatches),
        }))
      )
      const mockValues = vi.fn().mockReturnValue({ returning: mockReturning })
      mockDb.insert = vi.fn().mockReturnValue({ values: mockValues })

      const results = await adapter.batchInsertQueueItems(items)

      expect(results).toHaveLength(2)
    })

    it('returns empty array for empty input', async () => {
      const results = await adapter.batchInsertQueueItems([])

      expect(results).toEqual([])
    })
  })
})
