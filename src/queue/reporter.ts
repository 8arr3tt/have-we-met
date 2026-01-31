/**
 * Queue reporting utilities
 * @module queue/reporter
 */

import type { QueueItem, ReviewQueue } from './types.js'
import { QueueMetrics } from './metrics.js'

/**
 * Summary report for queue overview
 */
export interface QueueSummaryReport {
  /** Total items in queue */
  total: number
  /** Items awaiting review */
  pending: number
  /** Items currently being reviewed */
  reviewing: number
  /** Items confirmed as matches */
  confirmed: number
  /** Items rejected as non-matches */
  rejected: number
  /** Items merged */
  merged: number
  /** Items expired */
  expired: number
  /** Average wait time in milliseconds */
  avgWaitTime: number
  /** Oldest pending item age in milliseconds */
  oldestPendingAge?: number
  /** Decisions in last 24 hours */
  decisionsLast24h: number
}

/**
 * Detailed report with all queue items
 */
export interface QueueDetailedReport<T extends Record<string, unknown>> {
  /** Summary statistics */
  summary: QueueSummaryReport
  /** All queue items */
  items: QueueItem<T>[]
  /** Age distribution */
  ageDistribution: {
    lessThan1h: number
    between1And24h: number
    between1And7d: number
    moreThan7d: number
  }
}

/**
 * Per-reviewer statistics
 */
export interface ReviewerReport {
  /** Reviewer identifier */
  reviewerId: string
  /** Total decisions made */
  totalDecisions: number
  /** Confirmed decisions */
  confirmed: number
  /** Rejected decisions */
  rejected: number
  /** Merged decisions */
  merged: number
  /** Average decision time in milliseconds */
  avgDecisionTime: number
  /** Confirm/reject ratio */
  confirmRatio: number
}

/**
 * QueueReporter class for generating queue reports
 */
export class QueueReporter<T extends Record<string, unknown>> {
  constructor(private readonly queue: ReviewQueue<T>) {}

  /**
   * Generate a high-level queue summary
   */
  async generateSummary(): Promise<QueueSummaryReport> {
    const stats = await this.queue.stats()
    const now = new Date()

    const oldestPendingAge = stats.oldestPending
      ? now.getTime() - stats.oldestPending.getTime()
      : undefined

    return {
      total: stats.total,
      pending: stats.byStatus.pending,
      reviewing: stats.byStatus.reviewing,
      confirmed: stats.byStatus.confirmed,
      rejected: stats.byStatus.rejected,
      merged: stats.byStatus.merged,
      expired: stats.byStatus.expired,
      avgWaitTime: stats.avgWaitTime,
      oldestPendingAge,
      decisionsLast24h: stats.throughput?.last24h ?? 0,
    }
  }

  /**
   * Generate a comprehensive queue report
   */
  async generateDetailedReport(): Promise<QueueDetailedReport<T>> {
    const summary = await this.generateSummary()
    const { items } = await this.queue.list({ limit: 10000 })
    const metrics = QueueMetrics.calculate(items)

    return {
      summary,
      items,
      ageDistribution: metrics.ageDistribution,
    }
  }

  /**
   * Generate per-reviewer statistics
   */
  async generateReviewerReport(reviewerId: string): Promise<ReviewerReport> {
    const { items } = await this.queue.list({ limit: 10000 })

    // Filter items decided by this reviewer
    const reviewerItems = items.filter((item) => item.decidedBy === reviewerId)

    let confirmed = 0
    let rejected = 0
    let merged = 0
    let totalDecisionTime = 0

    for (const item of reviewerItems) {
      if (item.decision) {
        switch (item.decision.action) {
          case 'confirm':
            confirmed++
            break
          case 'reject':
            rejected++
            break
          case 'merge':
            merged++
            break
        }
      }

      if (item.decidedAt) {
        totalDecisionTime += item.decidedAt.getTime() - item.createdAt.getTime()
      }
    }

    const totalDecisions = reviewerItems.length
    const avgDecisionTime =
      totalDecisions > 0 ? totalDecisionTime / totalDecisions : 0
    const confirmRatio = confirmed + rejected > 0 ? confirmed / (confirmed + rejected) : 0

    return {
      reviewerId,
      totalDecisions,
      confirmed,
      rejected,
      merged,
      avgDecisionTime,
      confirmRatio,
    }
  }

  /**
   * Export queue items to CSV format
   */
  exportToCsv(items: QueueItem<T>[]): string {
    if (items.length === 0) {
      return 'id,status,createdAt,decidedAt,decidedBy,priority\n'
    }

    const headers = ['id', 'status', 'createdAt', 'decidedAt', 'decidedBy', 'priority']
    const rows = items.map((item) => {
      return [
        item.id,
        item.status,
        item.createdAt.toISOString(),
        item.decidedAt?.toISOString() ?? '',
        item.decidedBy ?? '',
        item.priority?.toString() ?? '0',
      ].join(',')
    })

    return [headers.join(','), ...rows].join('\n')
  }

  /**
   * Export queue items to JSON format
   */
  exportToJson(items: QueueItem<T>[]): string {
    return JSON.stringify(items, null, 2)
  }
}
