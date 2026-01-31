/**
 * Validation functions for queue operations
 * @module queue/validation
 */

import type { QueueItem, QueueStatus, QueueDecision, AddQueueItemRequest } from './types.js'
import { QueueValidationError, InvalidStatusTransitionError } from './queue-error.js'

/**
 * Valid status transitions in the queue lifecycle
 */
const VALID_TRANSITIONS: Record<QueueStatus, QueueStatus[]> = {
  pending: ['reviewing', 'confirmed', 'rejected', 'merged', 'expired'],
  reviewing: ['confirmed', 'rejected', 'merged', 'pending', 'expired'],
  confirmed: [], // Final state
  rejected: [], // Final state
  merged: [], // Final state
  expired: [], // Final state
}

/**
 * Validates a queue item request before adding to queue
 * @param item - The queue item request to validate
 * @throws {QueueValidationError} If validation fails
 */
export function validateQueueItem<T extends Record<string, unknown>>(
  item: AddQueueItemRequest<T>,
): void {
  // Validate candidateRecord is not empty
  if (!item.candidateRecord || Object.keys(item.candidateRecord).length === 0) {
    throw new QueueValidationError(
      'candidateRecord',
      'candidateRecord must not be empty',
      { candidateRecord: item.candidateRecord },
    )
  }

  // Validate potentialMatches is a non-empty array
  if (!Array.isArray(item.potentialMatches)) {
    throw new QueueValidationError(
      'potentialMatches',
      'potentialMatches must be an array',
      { potentialMatches: item.potentialMatches },
    )
  }

  if (item.potentialMatches.length === 0) {
    throw new QueueValidationError(
      'potentialMatches',
      'potentialMatches must not be empty',
      { potentialMatches: item.potentialMatches },
    )
  }

  // Validate each potential match has required fields
  for (let i = 0; i < item.potentialMatches.length; i++) {
    const match = item.potentialMatches[i]

    if (!match.record || Object.keys(match.record).length === 0) {
      throw new QueueValidationError(
        'potentialMatches',
        `potentialMatches[${i}].record must not be empty`,
        { index: i, match },
      )
    }

    if (typeof match.score !== 'number') {
      throw new QueueValidationError(
        'potentialMatches',
        `potentialMatches[${i}].score must be a number`,
        { index: i, match },
      )
    }

    if (match.outcome !== 'potential-match') {
      throw new QueueValidationError(
        'potentialMatches',
        `potentialMatches[${i}].outcome must be 'potential-match'`,
        { index: i, match },
      )
    }

    if (!match.explanation) {
      throw new QueueValidationError(
        'potentialMatches',
        `potentialMatches[${i}].explanation is required`,
        { index: i, match },
      )
    }
  }

  // Validate priority if provided
  if (item.priority !== undefined && typeof item.priority !== 'number') {
    throw new QueueValidationError(
      'priority',
      'priority must be a number',
      { priority: item.priority },
    )
  }

  // Validate tags if provided
  if (item.tags !== undefined) {
    if (!Array.isArray(item.tags)) {
      throw new QueueValidationError('tags', 'tags must be an array', { tags: item.tags })
    }

    for (let i = 0; i < item.tags.length; i++) {
      if (typeof item.tags[i] !== 'string') {
        throw new QueueValidationError('tags', `tags[${i}] must be a string`, {
          index: i,
          tag: item.tags[i],
        })
      }
    }
  }
}

/**
 * Validates a status transition is allowed
 * @param from - Current status
 * @param to - Target status
 * @throws {InvalidStatusTransitionError} If transition is not valid
 */
export function validateStatusTransition(from: QueueStatus, to: QueueStatus): void {
  const validTransitions = VALID_TRANSITIONS[from]

  if (!validTransitions.includes(to)) {
    if (validTransitions.length === 0) {
      throw new InvalidStatusTransitionError(from, to, `'${from}' is a final state`)
    }

    throw new InvalidStatusTransitionError(
      from,
      to,
      `allowed transitions: ${validTransitions.join(', ')}`,
    )
  }
}

/**
 * Validates a queue decision based on action type
 * @param decision - The decision to validate
 * @throws {QueueValidationError} If validation fails
 */
export function validateQueueDecision(decision: QueueDecision): void {
  // Validate action is provided
  if (!decision.action) {
    throw new QueueValidationError('decision.action', 'action is required', { decision })
  }

  // Validate action is valid
  const validActions = ['confirm', 'reject', 'merge']
  if (!validActions.includes(decision.action)) {
    throw new QueueValidationError(
      'decision.action',
      `action must be one of: ${validActions.join(', ')}`,
      { decision },
    )
  }

  // Validate selectedMatchId is provided for confirm and merge
  if ((decision.action === 'confirm' || decision.action === 'merge') && !decision.selectedMatchId) {
    throw new QueueValidationError(
      'decision.selectedMatchId',
      `selectedMatchId is required for action '${decision.action}'`,
      { decision },
    )
  }

  // Validate confidence if provided
  if (decision.confidence !== undefined) {
    if (typeof decision.confidence !== 'number') {
      throw new QueueValidationError('decision.confidence', 'confidence must be a number', {
        decision,
      })
    }

    if (decision.confidence < 0 || decision.confidence > 1) {
      throw new QueueValidationError('decision.confidence', 'confidence must be between 0 and 1', {
        decision,
      })
    }
  }
}

/**
 * Validates a complete queue item (internal validation)
 * @param item - The queue item to validate
 * @throws {QueueValidationError} If validation fails
 */
export function validateCompleteQueueItem<T extends Record<string, unknown>>(
  item: QueueItem<T>,
): void {
  // Validate ID
  if (!item.id || typeof item.id !== 'string') {
    throw new QueueValidationError('id', 'id must be a non-empty string', { item })
  }

  // Validate candidateRecord
  if (!item.candidateRecord || Object.keys(item.candidateRecord).length === 0) {
    throw new QueueValidationError('candidateRecord', 'candidateRecord must not be empty', {
      item,
    })
  }

  // Validate potentialMatches
  if (!Array.isArray(item.potentialMatches) || item.potentialMatches.length === 0) {
    throw new QueueValidationError('potentialMatches', 'potentialMatches must be a non-empty array', {
      item,
    })
  }

  // Validate status
  const validStatuses: QueueStatus[] = [
    'pending',
    'reviewing',
    'confirmed',
    'rejected',
    'merged',
    'expired',
  ]
  if (!validStatuses.includes(item.status)) {
    throw new QueueValidationError(
      'status',
      `status must be one of: ${validStatuses.join(', ')}`,
      { item },
    )
  }

  // Validate timestamps
  if (!(item.createdAt instanceof Date)) {
    throw new QueueValidationError('createdAt', 'createdAt must be a Date', { item })
  }

  if (!(item.updatedAt instanceof Date)) {
    throw new QueueValidationError('updatedAt', 'updatedAt must be a Date', { item })
  }

  // Validate decidedAt if present
  if (item.decidedAt !== undefined && !(item.decidedAt instanceof Date)) {
    throw new QueueValidationError('decidedAt', 'decidedAt must be a Date', { item })
  }

  // Validate decision if present
  if (item.decision !== undefined) {
    validateQueueDecision(item.decision)
  }

  // Validate decision is present for final states
  const finalStates: QueueStatus[] = ['confirmed', 'rejected', 'merged']
  if (finalStates.includes(item.status) && !item.decision) {
    throw new QueueValidationError(
      'decision',
      `decision is required for status '${item.status}'`,
      { item },
    )
  }
}
