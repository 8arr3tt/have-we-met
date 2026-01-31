import { describe, it, expect } from 'vitest'
import type {
  QueueStatus,
  QueueItem,
  QueueDecision,
  AddQueueItemRequest,
} from '../../../src/queue/types.js'

describe('Queue Types', () => {
  describe('QueueStatus', () => {
    it('includes all valid statuses', () => {
      const validStatuses: QueueStatus[] = [
        'pending',
        'reviewing',
        'confirmed',
        'rejected',
        'merged',
        'expired',
      ]

      validStatuses.forEach((status) => {
        expect(status).toBeDefined()
      })
    })
  })

  describe('QueueItem', () => {
    it('has all required fields', () => {
      const queueItem: QueueItem<{ id: string; name: string }> = {
        id: 'queue-123',
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
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      expect(queueItem.id).toBe('queue-123')
      expect(queueItem.candidateRecord.name).toBe('John Doe')
      expect(queueItem.potentialMatches).toHaveLength(1)
      expect(queueItem.status).toBe('pending')
      expect(queueItem.createdAt).toBeInstanceOf(Date)
      expect(queueItem.updatedAt).toBeInstanceOf(Date)
    })

    it('supports optional fields', () => {
      const queueItem: QueueItem<{ id: string }> = {
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
        decidedBy: 'user-123',
        decision: {
          action: 'confirm',
          selectedMatchId: 'match-1',
          notes: 'These are the same person',
          confidence: 0.95,
        },
        context: {
          source: 'customer-import',
          userId: 'admin',
          batchId: 'batch-123',
          metadata: { importedFrom: 'csv' },
        },
        priority: 10,
        tags: ['urgent', 'customer'],
      }

      expect(queueItem.decidedAt).toBeInstanceOf(Date)
      expect(queueItem.decidedBy).toBe('user-123')
      expect(queueItem.decision?.action).toBe('confirm')
      expect(queueItem.context?.source).toBe('customer-import')
      expect(queueItem.priority).toBe(10)
      expect(queueItem.tags).toEqual(['urgent', 'customer'])
    })
  })

  describe('QueueDecision', () => {
    it('supports all action types', () => {
      const confirmDecision: QueueDecision = {
        action: 'confirm',
        selectedMatchId: 'match-1',
      }

      const rejectDecision: QueueDecision = {
        action: 'reject',
        notes: 'Not the same person',
      }

      const mergeDecision: QueueDecision = {
        action: 'merge',
        selectedMatchId: 'match-1',
        notes: 'Merging records',
      }

      expect(confirmDecision.action).toBe('confirm')
      expect(rejectDecision.action).toBe('reject')
      expect(mergeDecision.action).toBe('merge')
    })

    it('supports optional fields', () => {
      const decision: QueueDecision = {
        action: 'confirm',
        selectedMatchId: 'match-1',
        notes: 'Test notes',
        confidence: 0.85,
      }

      expect(decision.notes).toBe('Test notes')
      expect(decision.confidence).toBe(0.85)
    })
  })

  describe('AddQueueItemRequest', () => {
    it('has required fields', () => {
      const request: AddQueueItemRequest<{ id: string }> = {
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
      }

      expect(request.candidateRecord).toBeDefined()
      expect(request.potentialMatches).toHaveLength(1)
    })

    it('supports optional fields', () => {
      const request: AddQueueItemRequest<{ id: string }> = {
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
        context: { source: 'test' },
        priority: 5,
        tags: ['test'],
      }

      expect(request.context).toBeDefined()
      expect(request.priority).toBe(5)
      expect(request.tags).toEqual(['test'])
    })
  })
})
