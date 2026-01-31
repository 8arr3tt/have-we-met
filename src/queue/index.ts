/**
 * Queue module - Review queue for human-in-the-loop matching
 * @module queue
 */

// Types
export type {
  QueueStatus,
  QueueContext,
  QueueDecision,
  QueueItem,
  AddQueueItemRequest,
  ListQueueOptions,
  QueueItemList,
  ConfirmDecision,
  RejectDecision,
  MergeDecision,
  QueueStats,
  CleanupOptions,
  StatsOptions,
  ReviewQueue as IReviewQueue,
  QueueFilter,
  QueueAdapter,
} from './types.js'

// Errors
export {
  QueueError,
  QueueItemNotFoundError,
  InvalidStatusTransitionError,
  QueueOperationError,
  QueueValidationError,
} from './queue-error.js'

// Validation
export {
  validateQueueItem,
  validateStatusTransition,
  validateQueueDecision,
  validateCompleteQueueItem,
} from './validation.js'

// Implementation
export { ReviewQueue } from './review-queue.js'

// Metrics
export { QueueMetrics, type AgeDistribution } from './metrics.js'

// Reporting
export {
  QueueReporter,
  type QueueSummaryReport,
  type QueueDetailedReport,
  type ReviewerReport,
} from './reporter.js'

// Alerts
export {
  QueueAlerts,
  type AlertSeverity,
  type QueueAlert,
} from './alerts.js'
