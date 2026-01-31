/**
 * Queue alerting utilities
 * @module queue/alerts
 */

import type { ReviewQueue } from './types.js'

/**
 * Alert severity levels
 */
export type AlertSeverity = 'info' | 'warning' | 'critical'

/**
 * Queue alert
 */
export interface QueueAlert {
  /** Alert type identifier */
  type: 'queue-size' | 'aging-items' | 'low-throughput'
  /** Severity level */
  severity: AlertSeverity
  /** Human-readable message */
  message: string
  /** Current value that triggered the alert */
  currentValue: number
  /** Threshold value */
  threshold: number
  /** Additional context */
  details?: Record<string, unknown>
}

/**
 * QueueAlerts class for monitoring queue health
 */
export class QueueAlerts<T extends Record<string, unknown>> {
  constructor(private readonly queue: ReviewQueue<T>) {}

  /**
   * Check if queue size exceeds threshold
   * @param threshold - Maximum acceptable queue size
   * @returns Alert if threshold exceeded, otherwise undefined
   */
  async checkQueueSize(threshold: number): Promise<QueueAlert | undefined> {
    const stats = await this.queue.stats()
    const pendingCount = stats.byStatus.pending

    if (pendingCount <= threshold) {
      return undefined
    }

    let severity: AlertSeverity = 'info'
    if (pendingCount >= threshold * 2) {
      severity = 'critical'
    } else if (pendingCount >= threshold * 1.5) {
      severity = 'warning'
    }

    return {
      type: 'queue-size',
      severity,
      message: `Queue size (${pendingCount}) exceeds threshold (${threshold})`,
      currentValue: pendingCount,
      threshold,
      details: {
        total: stats.total,
        pending: stats.byStatus.pending,
        reviewing: stats.byStatus.reviewing,
      },
    }
  }

  /**
   * Check if items exceed maximum age
   * @param maxAgeMs - Maximum acceptable age in milliseconds
   * @returns Alert if items are too old, otherwise undefined
   */
  async checkAging(maxAgeMs: number): Promise<QueueAlert | undefined> {
    const stats = await this.queue.stats()

    if (!stats.oldestPending) {
      return undefined
    }

    const now = new Date()
    const age = now.getTime() - stats.oldestPending.getTime()

    if (age <= maxAgeMs) {
      return undefined
    }

    let severity: AlertSeverity = 'info'
    if (age > maxAgeMs * 2) {
      severity = 'critical'
    } else if (age > maxAgeMs * 1.5) {
      severity = 'warning'
    }

    return {
      type: 'aging-items',
      severity,
      message: `Oldest pending item age (${Math.round(age / 1000 / 60)} minutes) exceeds threshold (${Math.round(maxAgeMs / 1000 / 60)} minutes)`,
      currentValue: age,
      threshold: maxAgeMs,
      details: {
        oldestPendingDate: stats.oldestPending.toISOString(),
        pendingCount: stats.byStatus.pending,
      },
    }
  }

  /**
   * Check if throughput is below minimum rate
   * @param minRate - Minimum decisions per day
   * @returns Alert if throughput too low, otherwise undefined
   */
  async checkThroughput(minRate: number): Promise<QueueAlert | undefined> {
    const stats = await this.queue.stats()
    const throughput = stats.throughput?.last24h ?? 0

    if (throughput >= minRate) {
      return undefined
    }

    let severity: AlertSeverity = 'info'
    if (throughput < minRate * 0.5) {
      severity = 'critical'
    } else if (throughput < minRate * 0.75) {
      severity = 'warning'
    }

    return {
      type: 'low-throughput',
      severity,
      message: `Throughput (${throughput} decisions/day) is below minimum (${minRate} decisions/day)`,
      currentValue: throughput,
      threshold: minRate,
      details: {
        last24h: stats.throughput?.last24h ?? 0,
        last7d: stats.throughput?.last7d ?? 0,
        pendingCount: stats.byStatus.pending,
      },
    }
  }

  /**
   * Run all checks and return all active alerts
   * @param thresholds - Alert thresholds configuration
   * @returns Array of active alerts
   */
  async checkAll(thresholds: {
    maxQueueSize?: number
    maxAgeMs?: number
    minThroughput?: number
  }): Promise<QueueAlert[]> {
    const alerts: QueueAlert[] = []

    if (thresholds.maxQueueSize !== undefined) {
      const alert = await this.checkQueueSize(thresholds.maxQueueSize)
      if (alert) {
        alerts.push(alert)
      }
    }

    if (thresholds.maxAgeMs !== undefined) {
      const alert = await this.checkAging(thresholds.maxAgeMs)
      if (alert) {
        alerts.push(alert)
      }
    }

    if (thresholds.minThroughput !== undefined) {
      const alert = await this.checkThroughput(thresholds.minThroughput)
      if (alert) {
        alerts.push(alert)
      }
    }

    return alerts
  }
}
