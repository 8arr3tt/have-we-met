/**
 * Queue metrics calculation utilities
 * @module queue/metrics
 */

import type { QueueItem, QueueStatus } from './types.js'

/**
 * Age distribution buckets
 */
export interface AgeDistribution {
  /** Items less than 1 hour old */
  lessThan1h: number
  /** Items between 1-24 hours old */
  between1And24h: number
  /** Items between 1-7 days old */
  between1And7d: number
  /** Items more than 7 days old */
  moreThan7d: number
}

/**
 * QueueMetrics class for calculating queue statistics
 */
export class QueueMetrics {
  /**
   * Calculate comprehensive queue statistics from items
   */
  static calculate<T extends Record<string, unknown>>(
    items: QueueItem<T>[]
  ): {
    total: number
    byStatus: Record<QueueStatus, number>
    avgWaitTime: number
    avgDecisionTime: number
    oldestPending?: Date
    ageDistribution: AgeDistribution
  } {
    const total = items.length

    // Group by status
    const byStatus = this.groupByStatus(items)

    // Calculate wait time (time from creation to decision)
    const avgWaitTime = this.calculateWaitTime(items)

    // Calculate decision time (time from reviewing to decided)
    const avgDecisionTime = this.calculateDecisionTime(items)

    // Find oldest pending
    const oldestPending = this.findOldestPending(items)

    // Calculate age distribution
    const ageDistribution = this.calculateAgeDistribution(items)

    return {
      total,
      byStatus,
      avgWaitTime,
      avgDecisionTime,
      oldestPending,
      ageDistribution,
    }
  }

  /**
   * Group items by status
   */
  static groupByStatus<T extends Record<string, unknown>>(
    items: QueueItem<T>[]
  ): Record<QueueStatus, number> {
    const byStatus: Record<QueueStatus, number> = {
      pending: 0,
      reviewing: 0,
      confirmed: 0,
      rejected: 0,
      merged: 0,
      expired: 0,
    }

    for (const item of items) {
      byStatus[item.status]++
    }

    return byStatus
  }

  /**
   * Calculate average wait time (time in queue before decision)
   */
  static calculateWaitTime<T extends Record<string, unknown>>(
    items: QueueItem<T>[]
  ): number {
    let totalWaitTime = 0
    let decidedCount = 0

    for (const item of items) {
      if (item.decidedAt) {
        totalWaitTime += item.decidedAt.getTime() - item.createdAt.getTime()
        decidedCount++
      }
    }

    return decidedCount > 0 ? totalWaitTime / decidedCount : 0
  }

  /**
   * Calculate average decision time
   * Note: This is simplified since we don't track status change history
   */
  static calculateDecisionTime<T extends Record<string, unknown>>(
    items: QueueItem<T>[]
  ): number {
    // Simplified implementation - same as wait time
    // In a real implementation with status change tracking, this would calculate
    // the time from 'reviewing' status to decided status
    return this.calculateWaitTime(items)
  }

  /**
   * Calculate throughput (decisions made in time periods)
   */
  static calculateThroughput<T extends Record<string, unknown>>(
    items: QueueItem<T>[],
    periodMs: number
  ): number {
    const now = new Date()
    const cutoff = new Date(now.getTime() - periodMs)

    let count = 0
    for (const item of items) {
      if (item.decidedAt && item.decidedAt >= cutoff) {
        count++
      }
    }

    return count
  }

  /**
   * Calculate age distribution of items
   */
  static calculateAgeDistribution<T extends Record<string, unknown>>(
    items: QueueItem<T>[]
  ): AgeDistribution {
    const now = new Date()
    const distribution: AgeDistribution = {
      lessThan1h: 0,
      between1And24h: 0,
      between1And7d: 0,
      moreThan7d: 0,
    }

    const oneHour = 60 * 60 * 1000
    const oneDay = 24 * oneHour
    const sevenDays = 7 * oneDay

    for (const item of items) {
      const age = now.getTime() - item.createdAt.getTime()

      if (age < oneHour) {
        distribution.lessThan1h++
      } else if (age < oneDay) {
        distribution.between1And24h++
      } else if (age < sevenDays) {
        distribution.between1And7d++
      } else {
        distribution.moreThan7d++
      }
    }

    return distribution
  }

  /**
   * Find the oldest pending item
   */
  static findOldestPending<T extends Record<string, unknown>>(
    items: QueueItem<T>[]
  ): Date | undefined {
    const pendingItems = items.filter((item) => item.status === 'pending')

    if (pendingItems.length === 0) {
      return undefined
    }

    return pendingItems.reduce((oldest, item) =>
      item.createdAt < oldest.createdAt ? item : oldest
    ).createdAt
  }
}
