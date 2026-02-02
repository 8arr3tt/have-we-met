import { describe, it, expect, beforeEach, vi } from 'vitest'
import { QueueAlerts } from '../../../src/queue/alerts.js'
import type { ReviewQueue, QueueStats } from '../../../src/queue/types.js'

describe('QueueAlerts', () => {
  let mockQueue: ReviewQueue<Record<string, unknown>>
  let alerts: QueueAlerts<Record<string, unknown>>

  beforeEach(() => {
    mockQueue = {
      stats: vi.fn(),
    } as unknown as ReviewQueue<Record<string, unknown>>

    alerts = new QueueAlerts(mockQueue)
  })

  describe('checkQueueSize', () => {
    it('returns undefined when queue size below threshold', async () => {
      const mockStats: QueueStats = {
        total: 10,
        byStatus: {
          pending: 5,
          reviewing: 0,
          confirmed: 5,
          rejected: 0,
          merged: 0,
          expired: 0,
        },
        avgWaitTime: 0,
        avgDecisionTime: 0,
      }

      vi.mocked(mockQueue.stats).mockResolvedValue(mockStats)

      const result = await alerts.checkQueueSize(10)

      expect(result).toBeUndefined()
    })

    it('returns info alert when queue size exceeds threshold', async () => {
      const mockStats: QueueStats = {
        total: 20,
        byStatus: {
          pending: 15,
          reviewing: 0,
          confirmed: 5,
          rejected: 0,
          merged: 0,
          expired: 0,
        },
        avgWaitTime: 0,
        avgDecisionTime: 0,
      }

      vi.mocked(mockQueue.stats).mockResolvedValue(mockStats)

      const result = await alerts.checkQueueSize(10)

      expect(result).toBeDefined()
      expect(result?.type).toBe('queue-size')
      expect(result?.severity).toBe('warning')
      expect(result?.currentValue).toBe(15)
      expect(result?.threshold).toBe(10)
    })

    it('returns warning alert when queue size exceeds 1.5x threshold', async () => {
      const mockStats: QueueStats = {
        total: 20,
        byStatus: {
          pending: 16,
          reviewing: 0,
          confirmed: 4,
          rejected: 0,
          merged: 0,
          expired: 0,
        },
        avgWaitTime: 0,
        avgDecisionTime: 0,
      }

      vi.mocked(mockQueue.stats).mockResolvedValue(mockStats)

      const result = await alerts.checkQueueSize(10)

      expect(result?.severity).toBe('warning')
    })

    it('returns critical alert when queue size exceeds 2x threshold', async () => {
      const mockStats: QueueStats = {
        total: 30,
        byStatus: {
          pending: 25,
          reviewing: 0,
          confirmed: 5,
          rejected: 0,
          merged: 0,
          expired: 0,
        },
        avgWaitTime: 0,
        avgDecisionTime: 0,
      }

      vi.mocked(mockQueue.stats).mockResolvedValue(mockStats)

      const result = await alerts.checkQueueSize(10)

      expect(result?.severity).toBe('critical')
    })

    it('includes details in alert', async () => {
      const mockStats: QueueStats = {
        total: 20,
        byStatus: {
          pending: 15,
          reviewing: 2,
          confirmed: 3,
          rejected: 0,
          merged: 0,
          expired: 0,
        },
        avgWaitTime: 0,
        avgDecisionTime: 0,
      }

      vi.mocked(mockQueue.stats).mockResolvedValue(mockStats)

      const result = await alerts.checkQueueSize(10)

      expect(result?.details).toEqual({
        total: 20,
        pending: 15,
        reviewing: 2,
      })
    })
  })

  describe('checkAging', () => {
    it('returns undefined when no pending items', async () => {
      const mockStats: QueueStats = {
        total: 5,
        byStatus: {
          pending: 0,
          reviewing: 0,
          confirmed: 5,
          rejected: 0,
          merged: 0,
          expired: 0,
        },
        avgWaitTime: 0,
        avgDecisionTime: 0,
      }

      vi.mocked(mockQueue.stats).mockResolvedValue(mockStats)

      const result = await alerts.checkAging(24 * 60 * 60 * 1000)

      expect(result).toBeUndefined()
    })

    it('returns undefined when oldest pending below threshold', async () => {
      const now = new Date()
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)

      const mockStats: QueueStats = {
        total: 5,
        byStatus: {
          pending: 5,
          reviewing: 0,
          confirmed: 0,
          rejected: 0,
          merged: 0,
          expired: 0,
        },
        avgWaitTime: 0,
        avgDecisionTime: 0,
        oldestPending: oneHourAgo,
      }

      vi.mocked(mockQueue.stats).mockResolvedValue(mockStats)

      const result = await alerts.checkAging(24 * 60 * 60 * 1000)

      expect(result).toBeUndefined()
    })

    it('returns alert when oldest pending exceeds threshold', async () => {
      const now = new Date()
      // 1.8 days to ensure it's clearly between 1.5x and 2x threshold
      const oldDate = new Date(now.getTime() - 1.8 * 24 * 60 * 60 * 1000)

      const mockStats: QueueStats = {
        total: 5,
        byStatus: {
          pending: 5,
          reviewing: 0,
          confirmed: 0,
          rejected: 0,
          merged: 0,
          expired: 0,
        },
        avgWaitTime: 0,
        avgDecisionTime: 0,
        oldestPending: oldDate,
      }

      vi.mocked(mockQueue.stats).mockResolvedValue(mockStats)

      const result = await alerts.checkAging(24 * 60 * 60 * 1000)

      expect(result).toBeDefined()
      expect(result?.type).toBe('aging-items')
      expect(result?.severity).toBe('warning')
    })

    it('returns critical alert when age exceeds 2x threshold', async () => {
      const now = new Date()
      const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)

      const mockStats: QueueStats = {
        total: 5,
        byStatus: {
          pending: 5,
          reviewing: 0,
          confirmed: 0,
          rejected: 0,
          merged: 0,
          expired: 0,
        },
        avgWaitTime: 0,
        avgDecisionTime: 0,
        oldestPending: threeDaysAgo,
      }

      vi.mocked(mockQueue.stats).mockResolvedValue(mockStats)

      const result = await alerts.checkAging(24 * 60 * 60 * 1000)

      expect(result?.severity).toBe('critical')
    })

    it('includes details in alert', async () => {
      const now = new Date()
      const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000)

      const mockStats: QueueStats = {
        total: 5,
        byStatus: {
          pending: 5,
          reviewing: 0,
          confirmed: 0,
          rejected: 0,
          merged: 0,
          expired: 0,
        },
        avgWaitTime: 0,
        avgDecisionTime: 0,
        oldestPending: twoDaysAgo,
      }

      vi.mocked(mockQueue.stats).mockResolvedValue(mockStats)

      const result = await alerts.checkAging(24 * 60 * 60 * 1000)

      expect(result?.details).toHaveProperty('oldestPendingDate')
      expect(result?.details).toHaveProperty('pendingCount', 5)
    })
  })

  describe('checkThroughput', () => {
    it('returns undefined when throughput meets minimum', async () => {
      const mockStats: QueueStats = {
        total: 10,
        byStatus: {
          pending: 5,
          reviewing: 0,
          confirmed: 5,
          rejected: 0,
          merged: 0,
          expired: 0,
        },
        avgWaitTime: 0,
        avgDecisionTime: 0,
        throughput: {
          last24h: 10,
          last7d: 50,
          last30d: 200,
        },
      }

      vi.mocked(mockQueue.stats).mockResolvedValue(mockStats)

      const result = await alerts.checkThroughput(10)

      expect(result).toBeUndefined()
    })

    it('returns alert when throughput below minimum', async () => {
      const mockStats: QueueStats = {
        total: 10,
        byStatus: {
          pending: 5,
          reviewing: 0,
          confirmed: 5,
          rejected: 0,
          merged: 0,
          expired: 0,
        },
        avgWaitTime: 0,
        avgDecisionTime: 0,
        throughput: {
          last24h: 5,
          last7d: 30,
          last30d: 100,
        },
      }

      vi.mocked(mockQueue.stats).mockResolvedValue(mockStats)

      const result = await alerts.checkThroughput(10)

      expect(result).toBeDefined()
      expect(result?.type).toBe('low-throughput')
      expect(result?.severity).toBe('warning')
      expect(result?.currentValue).toBe(5)
      expect(result?.threshold).toBe(10)
    })

    it('returns critical alert when throughput below 50% of minimum', async () => {
      const mockStats: QueueStats = {
        total: 10,
        byStatus: {
          pending: 5,
          reviewing: 0,
          confirmed: 5,
          rejected: 0,
          merged: 0,
          expired: 0,
        },
        avgWaitTime: 0,
        avgDecisionTime: 0,
        throughput: {
          last24h: 3,
          last7d: 20,
          last30d: 80,
        },
      }

      vi.mocked(mockQueue.stats).mockResolvedValue(mockStats)

      const result = await alerts.checkThroughput(10)

      expect(result?.severity).toBe('critical')
    })

    it('handles missing throughput data', async () => {
      const mockStats: QueueStats = {
        total: 10,
        byStatus: {
          pending: 5,
          reviewing: 0,
          confirmed: 5,
          rejected: 0,
          merged: 0,
          expired: 0,
        },
        avgWaitTime: 0,
        avgDecisionTime: 0,
      }

      vi.mocked(mockQueue.stats).mockResolvedValue(mockStats)

      const result = await alerts.checkThroughput(10)

      expect(result).toBeDefined()
      expect(result?.currentValue).toBe(0)
    })
  })

  describe('checkAll', () => {
    it('runs all configured checks', async () => {
      const mockStats: QueueStats = {
        total: 20,
        byStatus: {
          pending: 15,
          reviewing: 0,
          confirmed: 5,
          rejected: 0,
          merged: 0,
          expired: 0,
        },
        avgWaitTime: 0,
        avgDecisionTime: 0,
        oldestPending: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        throughput: {
          last24h: 3,
          last7d: 20,
          last30d: 80,
        },
      }

      vi.mocked(mockQueue.stats).mockResolvedValue(mockStats)

      const result = await alerts.checkAll({
        maxQueueSize: 10,
        maxAgeMs: 24 * 60 * 60 * 1000,
        minThroughput: 10,
      })

      expect(result).toHaveLength(3)
      expect(result.map((a) => a.type)).toContain('queue-size')
      expect(result.map((a) => a.type)).toContain('aging-items')
      expect(result.map((a) => a.type)).toContain('low-throughput')
    })

    it('returns only active alerts', async () => {
      const mockStats: QueueStats = {
        total: 5,
        byStatus: {
          pending: 5,
          reviewing: 0,
          confirmed: 0,
          rejected: 0,
          merged: 0,
          expired: 0,
        },
        avgWaitTime: 0,
        avgDecisionTime: 0,
        oldestPending: new Date(Date.now() - 30 * 60 * 1000),
        throughput: {
          last24h: 10,
          last7d: 50,
          last30d: 200,
        },
      }

      vi.mocked(mockQueue.stats).mockResolvedValue(mockStats)

      const result = await alerts.checkAll({
        maxQueueSize: 10,
        maxAgeMs: 24 * 60 * 60 * 1000,
        minThroughput: 5,
      })

      expect(result).toHaveLength(0)
    })

    it('handles partial threshold configuration', async () => {
      const mockStats: QueueStats = {
        total: 20,
        byStatus: {
          pending: 15,
          reviewing: 0,
          confirmed: 5,
          rejected: 0,
          merged: 0,
          expired: 0,
        },
        avgWaitTime: 0,
        avgDecisionTime: 0,
      }

      vi.mocked(mockQueue.stats).mockResolvedValue(mockStats)

      const result = await alerts.checkAll({
        maxQueueSize: 10,
      })

      expect(result).toHaveLength(1)
      expect(result[0].type).toBe('queue-size')
    })

    it('returns empty array when no thresholds configured', async () => {
      const mockStats: QueueStats = {
        total: 20,
        byStatus: {
          pending: 15,
          reviewing: 0,
          confirmed: 5,
          rejected: 0,
          merged: 0,
          expired: 0,
        },
        avgWaitTime: 0,
        avgDecisionTime: 0,
      }

      vi.mocked(mockQueue.stats).mockResolvedValue(mockStats)

      const result = await alerts.checkAll({})

      expect(result).toHaveLength(0)
    })
  })
})
