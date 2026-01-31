import { describe, it, expect } from 'vitest'
import {
  validateQueueItem,
  validateStatusTransition,
  validateQueueDecision,
  validateCompleteQueueItem,
} from '../../../src/queue/validation.js'
import {
  QueueValidationError,
  InvalidStatusTransitionError,
} from '../../../src/queue/queue-error.js'
import type {
  AddQueueItemRequest,
  QueueItem,
  QueueDecision,
} from '../../../src/queue/types.js'

describe('Queue Validation', () => {
  describe('validateQueueItem', () => {
    it('validates valid queue item request', () => {
      const request: AddQueueItemRequest<{ id: string; name: string }> = {
        candidateRecord: { id: 'candidate-1', name: 'John Doe' },
        potentialMatches: [
          {
            record: { id: 'match-1', name: 'John Doe' },
            score: 35,
            outcome: 'potential-match',
            explanation: {
              totalScore: 35,
              fieldScores: {},
              contributions: [],
              outcome: 'review',
            },
          },
        ],
      }

      expect(() => validateQueueItem(request)).not.toThrow()
    })

    it('rejects queue item with empty candidateRecord', () => {
      const request: AddQueueItemRequest<Record<string, unknown>> = {
        candidateRecord: {},
        potentialMatches: [
          {
            record: { id: 'match-1' },
            score: 35,
            outcome: 'potential-match',
            explanation: {
              totalScore: 35,
              fieldScores: {},
              contributions: [],
              outcome: 'review',
            },
          },
        ],
      }

      expect(() => validateQueueItem(request)).toThrow(QueueValidationError)
      expect(() => validateQueueItem(request)).toThrow('candidateRecord must not be empty')
    })

    it('rejects queue item with non-array potentialMatches', () => {
      const request = {
        candidateRecord: { id: 'candidate-1' },
        potentialMatches: 'not-an-array',
      } as unknown as AddQueueItemRequest<{ id: string }>

      expect(() => validateQueueItem(request)).toThrow(QueueValidationError)
      expect(() => validateQueueItem(request)).toThrow('potentialMatches must be an array')
    })

    it('rejects queue item with empty potentialMatches', () => {
      const request: AddQueueItemRequest<{ id: string }> = {
        candidateRecord: { id: 'candidate-1' },
        potentialMatches: [],
      }

      expect(() => validateQueueItem(request)).toThrow(QueueValidationError)
      expect(() => validateQueueItem(request)).toThrow('potentialMatches must not be empty')
    })

    it('rejects queue item with invalid match record', () => {
      const request: AddQueueItemRequest<Record<string, unknown>> = {
        candidateRecord: { id: 'candidate-1' },
        potentialMatches: [
          {
            record: {},
            score: 35,
            outcome: 'potential-match',
            explanation: {
              totalScore: 35,
              fieldScores: {},
              contributions: [],
              outcome: 'review',
            },
          },
        ],
      }

      expect(() => validateQueueItem(request)).toThrow(QueueValidationError)
      expect(() => validateQueueItem(request)).toThrow('potentialMatches[0].record must not be empty')
    })

    it('rejects queue item with invalid match score', () => {
      const request = {
        candidateRecord: { id: 'candidate-1' },
        potentialMatches: [
          {
            record: { id: 'match-1' },
            score: 'not-a-number',
            outcome: 'potential-match',
            explanation: {
              totalScore: 35,
              fieldScores: {},
              contributions: [],
              outcome: 'review',
            },
          },
        ],
      } as unknown as AddQueueItemRequest<{ id: string }>

      expect(() => validateQueueItem(request)).toThrow(QueueValidationError)
      expect(() => validateQueueItem(request)).toThrow('potentialMatches[0].score must be a number')
    })

    it('rejects queue item with invalid match outcome', () => {
      const request = {
        candidateRecord: { id: 'candidate-1' },
        potentialMatches: [
          {
            record: { id: 'match-1' },
            score: 35,
            outcome: 'definite-match',
            explanation: {
              totalScore: 35,
              fieldScores: {},
              contributions: [],
              outcome: 'review',
            },
          },
        ],
      } as unknown as AddQueueItemRequest<{ id: string }>

      expect(() => validateQueueItem(request)).toThrow(QueueValidationError)
      expect(() => validateQueueItem(request)).toThrow("potentialMatches[0].outcome must be 'potential-match'")
    })

    it('rejects queue item with missing explanation', () => {
      const request = {
        candidateRecord: { id: 'candidate-1' },
        potentialMatches: [
          {
            record: { id: 'match-1' },
            score: 35,
            outcome: 'potential-match',
          },
        ],
      } as unknown as AddQueueItemRequest<{ id: string }>

      expect(() => validateQueueItem(request)).toThrow(QueueValidationError)
      expect(() => validateQueueItem(request)).toThrow('potentialMatches[0].explanation is required')
    })

    it('rejects queue item with invalid priority', () => {
      const request = {
        candidateRecord: { id: 'candidate-1' },
        potentialMatches: [
          {
            record: { id: 'match-1' },
            score: 35,
            outcome: 'potential-match',
            explanation: {
              totalScore: 35,
              fieldScores: {},
              contributions: [],
              outcome: 'review',
            },
          },
        ],
        priority: 'high',
      } as unknown as AddQueueItemRequest<{ id: string }>

      expect(() => validateQueueItem(request)).toThrow(QueueValidationError)
      expect(() => validateQueueItem(request)).toThrow('priority must be a number')
    })

    it('rejects queue item with non-array tags', () => {
      const request = {
        candidateRecord: { id: 'candidate-1' },
        potentialMatches: [
          {
            record: { id: 'match-1' },
            score: 35,
            outcome: 'potential-match',
            explanation: {
              totalScore: 35,
              fieldScores: {},
              contributions: [],
              outcome: 'review',
            },
          },
        ],
        tags: 'not-an-array',
      } as unknown as AddQueueItemRequest<{ id: string }>

      expect(() => validateQueueItem(request)).toThrow(QueueValidationError)
      expect(() => validateQueueItem(request)).toThrow('tags must be an array')
    })

    it('rejects queue item with non-string tags', () => {
      const request = {
        candidateRecord: { id: 'candidate-1' },
        potentialMatches: [
          {
            record: { id: 'match-1' },
            score: 35,
            outcome: 'potential-match',
            explanation: {
              totalScore: 35,
              fieldScores: {},
              contributions: [],
              outcome: 'review',
            },
          },
        ],
        tags: [123],
      } as unknown as AddQueueItemRequest<{ id: string }>

      expect(() => validateQueueItem(request)).toThrow(QueueValidationError)
      expect(() => validateQueueItem(request)).toThrow('tags[0] must be a string')
    })
  })

  describe('validateStatusTransition', () => {
    it('validates transition from pending to confirmed', () => {
      expect(() => validateStatusTransition('pending', 'confirmed')).not.toThrow()
    })

    it('validates transition from pending to rejected', () => {
      expect(() => validateStatusTransition('pending', 'rejected')).not.toThrow()
    })

    it('validates transition from pending to reviewing', () => {
      expect(() => validateStatusTransition('pending', 'reviewing')).not.toThrow()
    })

    it('validates transition from reviewing to confirmed', () => {
      expect(() => validateStatusTransition('reviewing', 'confirmed')).not.toThrow()
    })

    it('validates transition from reviewing to pending', () => {
      expect(() => validateStatusTransition('reviewing', 'pending')).not.toThrow()
    })

    it('rejects invalid transition from confirmed to pending', () => {
      expect(() => validateStatusTransition('confirmed', 'pending')).toThrow(
        InvalidStatusTransitionError,
      )
      expect(() => validateStatusTransition('confirmed', 'pending')).toThrow("'confirmed' is a final state")
    })

    it('rejects invalid transition from rejected to confirmed', () => {
      expect(() => validateStatusTransition('rejected', 'confirmed')).toThrow(
        InvalidStatusTransitionError,
      )
      expect(() => validateStatusTransition('rejected', 'confirmed')).toThrow("'rejected' is a final state")
    })

    it('rejects invalid transition from merged to pending', () => {
      expect(() => validateStatusTransition('merged', 'pending')).toThrow(
        InvalidStatusTransitionError,
      )
      expect(() => validateStatusTransition('merged', 'pending')).toThrow("'merged' is a final state")
    })

    it('rejects invalid transition from pending to expired incorrectly to pending', () => {
      validateStatusTransition('pending', 'expired')
      expect(() => validateStatusTransition('expired', 'pending')).toThrow(
        InvalidStatusTransitionError,
      )
    })
  })

  describe('validateQueueDecision', () => {
    it('validates confirm decision with selectedMatchId', () => {
      const decision: QueueDecision = {
        action: 'confirm',
        selectedMatchId: 'match-1',
      }

      expect(() => validateQueueDecision(decision)).not.toThrow()
    })

    it('validates reject decision', () => {
      const decision: QueueDecision = {
        action: 'reject',
        notes: 'Not the same person',
      }

      expect(() => validateQueueDecision(decision)).not.toThrow()
    })

    it('validates merge decision with selectedMatchId', () => {
      const decision: QueueDecision = {
        action: 'merge',
        selectedMatchId: 'match-1',
      }

      expect(() => validateQueueDecision(decision)).not.toThrow()
    })

    it('rejects decision without action', () => {
      const decision = {} as QueueDecision

      expect(() => validateQueueDecision(decision)).toThrow(QueueValidationError)
      expect(() => validateQueueDecision(decision)).toThrow('action is required')
    })

    it('rejects decision with invalid action', () => {
      const decision = {
        action: 'invalid-action',
      } as unknown as QueueDecision

      expect(() => validateQueueDecision(decision)).toThrow(QueueValidationError)
      expect(() => validateQueueDecision(decision)).toThrow('action must be one of: confirm, reject, merge')
    })

    it('rejects confirm decision without selectedMatchId', () => {
      const decision: QueueDecision = {
        action: 'confirm',
      }

      expect(() => validateQueueDecision(decision)).toThrow(QueueValidationError)
      expect(() => validateQueueDecision(decision)).toThrow("selectedMatchId is required for action 'confirm'")
    })

    it('rejects merge decision without selectedMatchId', () => {
      const decision: QueueDecision = {
        action: 'merge',
      }

      expect(() => validateQueueDecision(decision)).toThrow(QueueValidationError)
      expect(() => validateQueueDecision(decision)).toThrow("selectedMatchId is required for action 'merge'")
    })

    it('rejects decision with invalid confidence type', () => {
      const decision = {
        action: 'confirm',
        selectedMatchId: 'match-1',
        confidence: 'high',
      } as unknown as QueueDecision

      expect(() => validateQueueDecision(decision)).toThrow(QueueValidationError)
      expect(() => validateQueueDecision(decision)).toThrow('confidence must be a number')
    })

    it('rejects decision with confidence out of range', () => {
      const decision: QueueDecision = {
        action: 'confirm',
        selectedMatchId: 'match-1',
        confidence: 1.5,
      }

      expect(() => validateQueueDecision(decision)).toThrow(QueueValidationError)
      expect(() => validateQueueDecision(decision)).toThrow('confidence must be between 0 and 1')
    })
  })

  describe('validateCompleteQueueItem', () => {
    it('validates valid complete queue item', () => {
      const item: QueueItem<{ id: string }> = {
        id: 'queue-123',
        candidateRecord: { id: 'candidate-1' },
        potentialMatches: [
          {
            record: { id: 'match-1' },
            score: 35,
            outcome: 'potential-match',
            explanation: {
              totalScore: 35,
              fieldScores: {},
              contributions: [],
              outcome: 'review',
            },
          },
        ],
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      expect(() => validateCompleteQueueItem(item)).not.toThrow()
    })

    it('rejects item without ID', () => {
      const item = {
        candidateRecord: { id: 'candidate-1' },
        potentialMatches: [
          {
            record: { id: 'match-1' },
            score: 35,
            outcome: 'potential-match',
            explanation: {
              totalScore: 35,
              fieldScores: {},
              contributions: [],
              outcome: 'review',
            },
          },
        ],
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as QueueItem<{ id: string }>

      expect(() => validateCompleteQueueItem(item)).toThrow(QueueValidationError)
      expect(() => validateCompleteQueueItem(item)).toThrow('id must be a non-empty string')
    })

    it('rejects item with invalid status', () => {
      const item = {
        id: 'queue-123',
        candidateRecord: { id: 'candidate-1' },
        potentialMatches: [
          {
            record: { id: 'match-1' },
            score: 35,
            outcome: 'potential-match',
            explanation: {
              totalScore: 35,
              fieldScores: {},
              contributions: [],
              outcome: 'review',
            },
          },
        ],
        status: 'invalid-status',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as QueueItem<{ id: string }>

      expect(() => validateCompleteQueueItem(item)).toThrow(QueueValidationError)
      expect(() => validateCompleteQueueItem(item)).toThrow('status must be one of:')
    })

    it('rejects item with invalid createdAt', () => {
      const item = {
        id: 'queue-123',
        candidateRecord: { id: 'candidate-1' },
        potentialMatches: [
          {
            record: { id: 'match-1' },
            score: 35,
            outcome: 'potential-match',
            explanation: {
              totalScore: 35,
              fieldScores: {},
              contributions: [],
              outcome: 'review',
            },
          },
        ],
        status: 'pending',
        createdAt: 'not-a-date',
        updatedAt: new Date(),
      } as unknown as QueueItem<{ id: string }>

      expect(() => validateCompleteQueueItem(item)).toThrow(QueueValidationError)
      expect(() => validateCompleteQueueItem(item)).toThrow('createdAt must be a Date')
    })

    it('rejects confirmed item without decision', () => {
      const item: QueueItem<{ id: string }> = {
        id: 'queue-123',
        candidateRecord: { id: 'candidate-1' },
        potentialMatches: [
          {
            record: { id: 'match-1' },
            score: 35,
            outcome: 'potential-match',
            explanation: {
              totalScore: 35,
              fieldScores: {},
              contributions: [],
              outcome: 'review',
            },
          },
        ],
        status: 'confirmed',
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      expect(() => validateCompleteQueueItem(item)).toThrow(QueueValidationError)
      expect(() => validateCompleteQueueItem(item)).toThrow("decision is required for status 'confirmed'")
    })

    it('validates confirmed item with decision', () => {
      const item: QueueItem<{ id: string }> = {
        id: 'queue-123',
        candidateRecord: { id: 'candidate-1' },
        potentialMatches: [
          {
            record: { id: 'match-1' },
            score: 35,
            outcome: 'potential-match',
            explanation: {
              totalScore: 35,
              fieldScores: {},
              contributions: [],
              outcome: 'review',
            },
          },
        ],
        status: 'confirmed',
        createdAt: new Date(),
        updatedAt: new Date(),
        decidedAt: new Date(),
        decision: {
          action: 'confirm',
          selectedMatchId: 'match-1',
        },
      }

      expect(() => validateCompleteQueueItem(item)).not.toThrow()
    })
  })
})
