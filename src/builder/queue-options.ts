/**
 * Configuration options for the review queue
 * @module builder/queue-options
 */

/**
 * Threshold configuration for queue alerts
 */
export interface AlertThresholds {
  /** Maximum queue size before alerting (default: 1000) */
  maxQueueSize?: number

  /** Maximum age in milliseconds before alerting (default: 7 days) */
  maxAge?: number

  /** Minimum throughput (decisions per day) before alerting (default: 10) */
  minThroughput?: number
}

/**
 * Configuration options for the review queue.
 * Applied when configuring a database adapter that supports queue operations.
 */
export interface QueueOptions {
  /**
   * Auto-expire items after this many milliseconds.
   * Items that remain pending beyond this duration will be marked as expired.
   * Default: 30 days (2592000000 ms)
   */
  autoExpireAfter?: number

  /**
   * Default priority for new queue items.
   * Higher numbers indicate higher priority.
   * Default: 0
   */
  defaultPriority?: number

  /**
   * Enable detailed metrics tracking.
   * When enabled, additional statistics are calculated and stored.
   * Default: true
   */
  enableMetrics?: boolean

  /**
   * Alert threshold configuration.
   * Used to detect and warn about queue health issues.
   */
  alertThresholds?: AlertThresholds
}

/**
 * Default queue configuration values
 */
export const DEFAULT_QUEUE_OPTIONS: Required<QueueOptions> = {
  autoExpireAfter: 30 * 24 * 60 * 60 * 1000, // 30 days
  defaultPriority: 0,
  enableMetrics: true,
  alertThresholds: {
    maxQueueSize: 1000,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    minThroughput: 10,
  },
}

/**
 * Merges user-provided queue options with defaults
 * @param options - User-provided options
 * @returns Complete queue options with defaults applied
 */
export function mergeQueueOptions(
  options?: QueueOptions
): Required<QueueOptions> {
  if (!options) {
    return DEFAULT_QUEUE_OPTIONS
  }

  return {
    autoExpireAfter:
      options.autoExpireAfter ?? DEFAULT_QUEUE_OPTIONS.autoExpireAfter,
    defaultPriority:
      options.defaultPriority ?? DEFAULT_QUEUE_OPTIONS.defaultPriority,
    enableMetrics: options.enableMetrics ?? DEFAULT_QUEUE_OPTIONS.enableMetrics,
    alertThresholds: {
      maxQueueSize:
        options.alertThresholds?.maxQueueSize ??
        DEFAULT_QUEUE_OPTIONS.alertThresholds.maxQueueSize,
      maxAge:
        options.alertThresholds?.maxAge ??
        DEFAULT_QUEUE_OPTIONS.alertThresholds.maxAge,
      minThroughput:
        options.alertThresholds?.minThroughput ??
        DEFAULT_QUEUE_OPTIONS.alertThresholds.minThroughput,
    },
  }
}
