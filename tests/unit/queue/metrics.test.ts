import { describe, it, expect } from 'vitest'
import { QueueMetrics } from '../../../src/queue/metrics.js'
import type { QueueItem } from '../../../src/queue/types.js'

describe('QueueMetrics', () => {
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

  describe('calculate', () => {
    it('calculates comprehensive statistics for empty queue', () => {
      const result = QueueMetrics.calculate([])

      expect(result.total).toBe(0)
      expect(result.byStatus.pending).toBe(0)
      expect(result.avgWaitTime).toBe(0)
      expect(result.oldestPending).toBeUndefined()
    })

    it('calculates comprehensive statistics for queue with items', () => {
      const items = [
        createMockItem({ status: 'pending' }),
        createMockItem({ status: 'pending' }),
        createMockItem({ status: 'confirmed' }),
      ]

      const result = QueueMetrics.calculate(items)

      expect(result.total).toBe(3)
      expect(result.byStatus.pending).toBe(2)
      expect(result.byStatus.confirmed).toBe(1)
    })
  })

  describe('groupByStatus', () => {
    it('groups items by status', () => {
      const items = [
        createMockItem({ status: 'pending' }),
        createMockItem({ status: 'pending' }),
        createMockItem({ status: 'reviewing' }),
        createMockItem({ status: 'confirmed' }),
        createMockItem({ status: 'rejected' }),
        createMockItem({ status: 'merged' }),
      ]

      const result = QueueMetrics.groupByStatus(items)

      expect(result.pending).toBe(2)
      expect(result.reviewing).toBe(1)
      expect(result.confirmed).toBe(1)
      expect(result.rejected).toBe(1)
      expect(result.merged).toBe(1)
      expect(result.expired).toBe(0)
    })

    it('handles empty array', () => {
      const result = QueueMetrics.groupByStatus([])

      expect(result.pending).toBe(0)
      expect(result.reviewing).toBe(0)
      expect(result.confirmed).toBe(0)
      expect(result.rejected).toBe(0)
      expect(result.merged).toBe(0)
      expect(result.expired).toBe(0)
    })
  })

  describe('calculateWaitTime', () => {
    it('calculates average wait time for decided items', () => {
      const now = new Date()
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000)

      const items = [
        createMockItem({
          createdAt: oneHourAgo,
          decidedAt: now,
        }),
        createMockItem({
          createdAt: twoHoursAgo,
          decidedAt: now,
        }),
      ]

      const result = QueueMetrics.calculateWaitTime(items)

      const expectedAvg = (60 * 60 * 1000 + 2 * 60 * 60 * 1000) / 2
      expect(result).toBe(expectedAvg)
    })

    it('returns 0 for items without decisions', () => {
      const items = [createMockItem(), createMockItem()]

      const result = QueueMetrics.calculateWaitTime(items)

      expect(result).toBe(0)
    })

    it('returns 0 for empty array', () => {
      const result = QueueMetrics.calculateWaitTime([])

      expect(result).toBe(0)
    })

    it('only counts decided items', () => {
      const now = new Date()
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)

      const items = [
        createMockItem({
          createdAt: oneHourAgo,
          decidedAt: now,
        }),
        createMockItem({
          createdAt: oneHourAgo,
        }),
      ]

      const result = QueueMetrics.calculateWaitTime(items)

      expect(result).toBe(60 * 60 * 1000)
    })
  })

  describe('calculateDecisionTime', () => {
    it('calculates average decision time', () => {
      const now = new Date()
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)

      const items = [
        createMockItem({
          createdAt: oneHourAgo,
          decidedAt: now,
        }),
      ]

      const result = QueueMetrics.calculateDecisionTime(items)

      expect(result).toBe(60 * 60 * 1000)
    })
  })

  describe('calculateThroughput', () => {
    it('counts decisions made within time period', () => {
      const now = new Date()
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)
      const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000)

      const items = [
        createMockItem({ decidedAt: now }),
        createMockItem({ decidedAt: oneHourAgo }),
        createMockItem({ decidedAt: twoDaysAgo }),
        createMockItem(), // No decision
      ]

      const result = QueueMetrics.calculateThroughput(
        items,
        24 * 60 * 60 * 1000
      )

      expect(result).toBe(2)
    })

    it('returns 0 for empty array', () => {
      const result = QueueMetrics.calculateThroughput([], 24 * 60 * 60 * 1000)

      expect(result).toBe(0)
    })

    it('returns 0 when no decisions in period', () => {
      const now = new Date()
      const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000)

      const items = [createMockItem({ decidedAt: twoDaysAgo })]

      const result = QueueMetrics.calculateThroughput(
        items,
        24 * 60 * 60 * 1000
      )

      expect(result).toBe(0)
    })
  })

  describe('calculateAgeDistribution', () => {
    it('distributes items into age buckets', () => {
      const now = new Date()
      const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000)
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000)
      const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)
      const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000)

      const items = [
        createMockItem({ createdAt: thirtyMinutesAgo }),
        createMockItem({ createdAt: twoHoursAgo }),
        createMockItem({ createdAt: threeDaysAgo }),
        createMockItem({ createdAt: tenDaysAgo }),
      ]

      const result = QueueMetrics.calculateAgeDistribution(items)

      expect(result.lessThan1h).toBe(1)
      expect(result.between1And24h).toBe(1)
      expect(result.between1And7d).toBe(1)
      expect(result.moreThan7d).toBe(1)
    })

    it('handles empty array', () => {
      const result = QueueMetrics.calculateAgeDistribution([])

      expect(result.lessThan1h).toBe(0)
      expect(result.between1And24h).toBe(0)
      expect(result.between1And7d).toBe(0)
      expect(result.moreThan7d).toBe(0)
    })

    it('handles all items in single bucket', () => {
      const now = new Date()
      const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000)

      const items = [
        createMockItem({ createdAt: thirtyMinutesAgo }),
        createMockItem({ createdAt: thirtyMinutesAgo }),
      ]

      const result = QueueMetrics.calculateAgeDistribution(items)

      expect(result.lessThan1h).toBe(2)
      expect(result.between1And24h).toBe(0)
      expect(result.between1And7d).toBe(0)
      expect(result.moreThan7d).toBe(0)
    })
  })

  describe('findOldestPending', () => {
    it('finds oldest pending item', () => {
      const now = new Date()
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000)

      const items = [
        createMockItem({ status: 'pending', createdAt: oneHourAgo }),
        createMockItem({ status: 'pending', createdAt: twoHoursAgo }),
        createMockItem({ status: 'confirmed', createdAt: new Date(0) }),
      ]

      const result = QueueMetrics.findOldestPending(items)

      expect(result).toEqual(twoHoursAgo)
    })

    it('returns undefined when no pending items', () => {
      const items = [
        createMockItem({ status: 'confirmed' }),
        createMockItem({ status: 'rejected' }),
      ]

      const result = QueueMetrics.findOldestPending(items)

      expect(result).toBeUndefined()
    })

    it('returns undefined for empty array', () => {
      const result = QueueMetrics.findOldestPending([])

      expect(result).toBeUndefined()
    })

    it('handles single pending item', () => {
      const now = new Date()
      const items = [createMockItem({ status: 'pending', createdAt: now })]

      const result = QueueMetrics.findOldestPending(items)

      expect(result).toEqual(now)
    })
  })
})
