/**
 * Queue-specific error classes
 * @module queue/queue-error
 */

import type { QueueStatus } from './types.js'

/**
 * Base error class for all queue-related errors
 */
export class QueueError extends Error {
  /** Error code for programmatic handling */
  public readonly code: string

  /** Additional error context */
  public readonly context?: Record<string, unknown>

  constructor(message: string, code: string, context?: Record<string, unknown>) {
    super(message)
    this.name = 'QueueError'
    this.code = code
    this.context = context

    // Maintains proper stack trace for where error was thrown (Node.js specific)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (typeof (Error as any).captureStackTrace === 'function') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(Error as any).captureStackTrace(this, this.constructor)
    }
  }
}

/**
 * Error thrown when a queue item is not found
 */
export class QueueItemNotFoundError extends QueueError {
  constructor(id: string) {
    super(`Queue item not found: ${id}`, 'QUEUE_ITEM_NOT_FOUND', { id })
    this.name = 'QueueItemNotFoundError'
  }
}

/**
 * Error thrown when attempting an invalid status transition
 */
export class InvalidStatusTransitionError extends QueueError {
  constructor(from: QueueStatus, to: QueueStatus, reason?: string) {
    const message = reason
      ? `Invalid status transition from '${from}' to '${to}': ${reason}`
      : `Invalid status transition from '${from}' to '${to}'`

    super(message, 'INVALID_STATUS_TRANSITION', { from, to, reason })
    this.name = 'InvalidStatusTransitionError'
  }
}

/**
 * Error thrown when a queue operation fails
 */
export class QueueOperationError extends QueueError {
  constructor(operation: string, reason: string, context?: Record<string, unknown>) {
    super(`Queue operation '${operation}' failed: ${reason}`, 'QUEUE_OPERATION_FAILED', {
      operation,
      reason,
      ...context,
    })
    this.name = 'QueueOperationError'
  }
}

/**
 * Error thrown when queue item data is invalid
 */
export class QueueValidationError extends QueueError {
  constructor(field: string, reason: string, context?: Record<string, unknown>) {
    super(`Queue validation failed for '${field}': ${reason}`, 'QUEUE_VALIDATION_ERROR', {
      field,
      reason,
      ...context,
    })
    this.name = 'QueueValidationError'
  }
}
