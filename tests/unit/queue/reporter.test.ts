import { describe, it, expect, beforeEach, vi } from 'vitest'
import { QueueReporter } from '../../../src/queue/reporter.js'
import type {
  ReviewQueue,
  QueueItem,
  QueueStats,
} from '../../../src/queue/types.js'

describe('QueueReporter', () => {
  let mockQueue: ReviewQueue<Record<string, unknown>>
  let reporter: QueueReporter<Record<string, unknown>>

  const createMockItem = (
    overrides: Partial<QueueItem<Record<string, unknown>>> = {}
  ): QueueItem<Record<string, unknown>> => {
    const now = new Date()
    return {
      id: '1',
      candidateRecord: { name: 'Test' },
      potentialMatches: [
        {
          record: { name: 'Match' },
          score: 50,
          outcome: 'potential-match',
          explanation: {
            totalScore: 50,
            fieldScores: [],
            outcome: 'potential-match',
          },
        },
      ],
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      ...overrides,
    }
  }

  beforeEach(() => {
    mockQueue = {
      stats: vi.fn(),
      list: vi.fn(),
    } as unknown as ReviewQueue<Record<string, unknown>>

    reporter = new QueueReporter(mockQueue)
  })

  describe('generateSummary', () => {
    it('generates summary report from queue stats', async () => {
      const mockStats: QueueStats = {
        total: 100,
        byStatus: {
          pending: 50,
          reviewing: 10,
          confirmed: 20,
          rejected: 15,
          merged: 5,
          expired: 0,
        },
        avgWaitTime: 3600000,
        avgDecisionTime: 1800000,
        oldestPending: new Date('2024-01-01'),
        throughput: {
          last24h: 10,
          last7d: 50,
          last30d: 200,
        },
      }

      vi.mocked(mockQueue.stats).mockResolvedValue(mockStats)

      const result = await reporter.generateSummary()

      expect(result.total).toBe(100)
      expect(result.pending).toBe(50)
      expect(result.reviewing).toBe(10)
      expect(result.confirmed).toBe(20)
      expect(result.rejected).toBe(15)
      expect(result.merged).toBe(5)
      expect(result.expired).toBe(0)
      expect(result.avgWaitTime).toBe(3600000)
      expect(result.decisionsLast24h).toBe(10)
      expect(result.oldestPendingAge).toBeGreaterThan(0)
    })

    it('handles queue with no pending items', async () => {
      const mockStats: QueueStats = {
        total: 10,
        byStatus: {
          pending: 0,
          reviewing: 0,
          confirmed: 5,
          rejected: 5,
          merged: 0,
          expired: 0,
        },
        avgWaitTime: 3600000,
        avgDecisionTime: 1800000,
        throughput: {
          last24h: 10,
          last7d: 10,
          last30d: 10,
        },
      }

      vi.mocked(mockQueue.stats).mockResolvedValue(mockStats)

      const result = await reporter.generateSummary()

      expect(result.pending).toBe(0)
      expect(result.oldestPendingAge).toBeUndefined()
    })
  })

  describe('generateDetailedReport', () => {
    it('generates detailed report with items and age distribution', async () => {
      const mockStats: QueueStats = {
        total: 2,
        byStatus: {
          pending: 2,
          reviewing: 0,
          confirmed: 0,
          rejected: 0,
          merged: 0,
          expired: 0,
        },
        avgWaitTime: 0,
        avgDecisionTime: 0,
        throughput: {
          last24h: 0,
          last7d: 0,
          last30d: 0,
        },
      }

      const mockItems = [
        createMockItem({ id: '1' }),
        createMockItem({ id: '2' }),
      ]

      vi.mocked(mockQueue.stats).mockResolvedValue(mockStats)
      vi.mocked(mockQueue.list).mockResolvedValue({
        items: mockItems,
        total: 2,
        hasMore: false,
      })

      const result = await reporter.generateDetailedReport()

      expect(result.summary.total).toBe(2)
      expect(result.items).toHaveLength(2)
      expect(result.ageDistribution).toBeDefined()
    })
  })

  describe('generateReviewerReport', () => {
    it('generates per-reviewer statistics', async () => {
      const now = new Date()
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)

      const mockItems = [
        createMockItem({
          decidedBy: 'reviewer1',
          decidedAt: now,
          createdAt: oneHourAgo,
          decision: {
            action: 'confirm',
            selectedMatchId: 'match1',
          },
        }),
        createMockItem({
          decidedBy: 'reviewer1',
          decidedAt: now,
          createdAt: oneHourAgo,
          decision: {
            action: 'reject',
          },
        }),
        createMockItem({
          decidedBy: 'reviewer2',
          decidedAt: now,
          createdAt: oneHourAgo,
          decision: {
            action: 'merge',
            selectedMatchId: 'match2',
          },
        }),
      ]

      vi.mocked(mockQueue.list).mockResolvedValue({
        items: mockItems,
        total: 3,
        hasMore: false,
      })

      const result = await reporter.generateReviewerReport('reviewer1')

      expect(result.reviewerId).toBe('reviewer1')
      expect(result.totalDecisions).toBe(2)
      expect(result.confirmed).toBe(1)
      expect(result.rejected).toBe(1)
      expect(result.merged).toBe(0)
      expect(result.avgDecisionTime).toBe(60 * 60 * 1000)
      expect(result.confirmRatio).toBe(0.5)
    })

    it('handles reviewer with no decisions', async () => {
      vi.mocked(mockQueue.list).mockResolvedValue({
        items: [],
        total: 0,
        hasMore: false,
      })

      const result = await reporter.generateReviewerReport('reviewer1')

      expect(result.reviewerId).toBe('reviewer1')
      expect(result.totalDecisions).toBe(0)
      expect(result.confirmed).toBe(0)
      expect(result.rejected).toBe(0)
      expect(result.merged).toBe(0)
      expect(result.avgDecisionTime).toBe(0)
      expect(result.confirmRatio).toBe(0)
    })

    it('calculates confirm ratio correctly', async () => {
      const now = new Date()
      const mockItems = [
        createMockItem({
          decidedBy: 'reviewer1',
          decidedAt: now,
          decision: {
            action: 'confirm',
            selectedMatchId: 'match1',
          },
        }),
        createMockItem({
          decidedBy: 'reviewer1',
          decidedAt: now,
          decision: {
            action: 'confirm',
            selectedMatchId: 'match2',
          },
        }),
        createMockItem({
          decidedBy: 'reviewer1',
          decidedAt: now,
          decision: {
            action: 'reject',
          },
        }),
      ]

      vi.mocked(mockQueue.list).mockResolvedValue({
        items: mockItems,
        total: 3,
        hasMore: false,
      })

      const result = await reporter.generateReviewerReport('reviewer1')

      expect(result.confirmRatio).toBeCloseTo(2 / 3)
    })
  })

  describe('exportToCsv', () => {
    it('exports items to CSV format', () => {
      const items = [
        createMockItem({
          id: 'item1',
          status: 'pending',
          createdAt: new Date('2024-01-01T10:00:00Z'),
          priority: 5,
        }),
        createMockItem({
          id: 'item2',
          status: 'confirmed',
          createdAt: new Date('2024-01-01T11:00:00Z'),
          decidedAt: new Date('2024-01-01T12:00:00Z'),
          decidedBy: 'reviewer1',
          priority: 10,
        }),
      ]

      const result = reporter.exportToCsv(items)

      expect(result).toContain(
        'id,status,createdAt,decidedAt,decidedBy,priority'
      )
      expect(result).toContain('item1,pending,2024-01-01T10:00:00.000Z,,,5')
      expect(result).toContain(
        'item2,confirmed,2024-01-01T11:00:00.000Z,2024-01-01T12:00:00.000Z,reviewer1,10'
      )
    })

    it('handles empty array', () => {
      const result = reporter.exportToCsv([])

      expect(result).toBe('id,status,createdAt,decidedAt,decidedBy,priority\n')
    })

    it('handles items with missing optional fields', () => {
      const items = [
        createMockItem({
          id: 'item1',
          status: 'pending',
          createdAt: new Date('2024-01-01T10:00:00Z'),
        }),
      ]

      const result = reporter.exportToCsv(items)

      expect(result).toContain('item1,pending,2024-01-01T10:00:00.000Z,,,0')
    })
  })

  describe('exportToJson', () => {
    it('exports items to JSON format', () => {
      const items = [
        createMockItem({
          id: 'item1',
          status: 'pending',
        }),
      ]

      const result = reporter.exportToJson(items)
      const parsed = JSON.parse(result)

      expect(parsed).toHaveLength(1)
      expect(parsed[0].id).toBe('item1')
      expect(parsed[0].status).toBe('pending')
    })

    it('handles empty array', () => {
      const result = reporter.exportToJson([])

      expect(result).toBe('[]')
    })

    it('formats with indentation', () => {
      const items = [createMockItem({ id: 'item1' })]

      const result = reporter.exportToJson(items)

      expect(result).toContain('  ')
    })
  })
})
