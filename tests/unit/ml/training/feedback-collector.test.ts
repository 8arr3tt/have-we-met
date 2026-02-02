/**
 * FeedbackCollector Unit Tests
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  FeedbackCollector,
  createFeedbackCollector,
  queueDecisionToTrainingExample,
  queueDecisionsToTrainingExamples,
} from '../../../../src/ml/training/feedback-collector'
import type {
  FeedbackItem,
  FeedbackSource,
  FeedbackFilter,
} from '../../../../src/ml/training/feedback-collector'
import type { QueueItem, QueueDecision } from '../../../../src/queue/types'

// Test record type
interface TestRecord {
  id: string
  name: string
  email: string
}

// Helper to create mock queue items
function createMockQueueItem(
  overrides: Partial<QueueItem<TestRecord>> = {}
): QueueItem<TestRecord> {
  const now = new Date()
  const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000)

  return {
    id: 'queue-1',
    candidateRecord: { id: '1', name: 'John Doe', email: 'john@example.com' },
    potentialMatches: [
      {
        record: { id: '2', name: 'John D', email: 'johnd@example.com' },
        score: 0.75,
        outcome: 'potential-match' as const,
        explanation: {
          matchScore: 0.75,
          maxScore: 1,
          outcome: 'potential-match' as const,
          fields: [],
          thresholds: { noMatch: 0.3, definiteMatch: 0.7 },
          timestamp: now,
        },
      },
    ],
    status: 'confirmed',
    createdAt: fiveMinutesAgo,
    updatedAt: fiveMinutesAgo,
    decidedAt: now,
    decidedBy: 'reviewer-1',
    decision: {
      action: 'confirm',
      selectedMatchId: '2',
      confidence: 0.9,
    },
    ...overrides,
  }
}

describe('FeedbackCollector', () => {
  let collector: FeedbackCollector<TestRecord>

  beforeEach(() => {
    collector = new FeedbackCollector<TestRecord>()
  })

  describe('constructor', () => {
    it('should create collector with default options', () => {
      const c = new FeedbackCollector()
      expect(c.size).toBe(0)
      expect(c.isEmpty).toBe(true)
    })

    it('should accept custom options', () => {
      const c = new FeedbackCollector<TestRecord>({
        defaultConfidence: 0.7,
        defaultMatchScore: 0.6,
        normalizeScores: true,
        maxScore: 100,
      })
      expect(c.size).toBe(0)
    })
  })

  describe('addFeedback', () => {
    it('should add a match feedback item', () => {
      const pair = {
        record1: { id: '1', name: 'John', email: 'john@example.com' },
        record2: { id: '2', name: 'John', email: 'john@example.com' },
      }

      const item = collector.addFeedback(pair, 'match')

      expect(item.id).toMatch(/^feedback-/)
      expect(item.pair).toEqual(pair)
      expect(item.label).toBe('match')
      expect(item.source).toBe('manual')
      expect(item.quality.confidence).toBe(0.8) // default
      expect(item.collectedAt).toBeInstanceOf(Date)
    })

    it('should add a nonMatch feedback item', () => {
      const pair = {
        record1: { id: '1', name: 'John', email: 'john@example.com' },
        record2: { id: '2', name: 'Jane', email: 'jane@example.com' },
      }

      const item = collector.addFeedback(pair, 'nonMatch', 'queue-reject')

      expect(item.label).toBe('nonMatch')
      expect(item.source).toBe('queue-reject')
    })

    it('should accept custom quality metrics', () => {
      const pair = {
        record1: { id: '1', name: 'John', email: 'john@example.com' },
        record2: { id: '2', name: 'John', email: 'john@example.com' },
      }

      const item = collector.addFeedback(pair, 'match', 'manual', {
        confidence: 0.95,
        matchScore: 0.85,
        decisionTimeMs: 5000,
        isExpert: true,
        reviewIteration: 2,
      })

      expect(item.quality.confidence).toBe(0.95)
      expect(item.quality.matchScore).toBe(0.85)
      expect(item.quality.decisionTimeMs).toBe(5000)
      expect(item.quality.isExpert).toBe(true)
      expect(item.quality.reviewIteration).toBe(2)
    })

    it('should store queue item ID when provided', () => {
      const pair = {
        record1: { id: '1', name: 'John', email: 'john@example.com' },
        record2: { id: '2', name: 'John', email: 'john@example.com' },
      }

      const item = collector.addFeedback(
        pair,
        'match',
        'queue-confirm',
        {},
        'queue-123'
      )

      expect(item.queueItemId).toBe('queue-123')
    })

    it('should increment collector size', () => {
      const pair = {
        record1: { id: '1', name: 'John', email: 'john@example.com' },
        record2: { id: '2', name: 'John', email: 'john@example.com' },
      }

      expect(collector.size).toBe(0)
      collector.addFeedback(pair, 'match')
      expect(collector.size).toBe(1)
      collector.addFeedback(pair, 'nonMatch')
      expect(collector.size).toBe(2)
      expect(collector.isEmpty).toBe(false)
    })
  })

  describe('addFeedbackBatch', () => {
    it('should add multiple feedback items', () => {
      const items = collector.addFeedbackBatch([
        {
          pair: {
            record1: { id: '1', name: 'John', email: 'john@example.com' },
            record2: { id: '2', name: 'John', email: 'john@example.com' },
          },
          label: 'match',
        },
        {
          pair: {
            record1: { id: '3', name: 'Jane', email: 'jane@example.com' },
            record2: { id: '4', name: 'Janet', email: 'janet@example.com' },
          },
          label: 'nonMatch',
          source: 'import',
          quality: { confidence: 0.7 },
        },
      ])

      expect(items.length).toBe(2)
      expect(collector.size).toBe(2)
      expect(items[0].label).toBe('match')
      expect(items[1].label).toBe('nonMatch')
      expect(items[1].source).toBe('import')
      expect(items[1].quality.confidence).toBe(0.7)
    })
  })

  describe('importFeedback', () => {
    it('should import external feedback data', () => {
      const items = collector.importFeedback([
        {
          record1: { id: '1', name: 'John', email: 'john@example.com' },
          record2: { id: '2', name: 'John', email: 'john@example.com' },
          label: 'match',
          confidence: 0.95,
        },
        {
          record1: { id: '3', name: 'Jane', email: 'jane@example.com' },
          record2: { id: '4', name: 'Janet', email: 'janet@example.com' },
          label: 'nonMatch',
        },
      ])

      expect(items.length).toBe(2)
      expect(items[0].source).toBe('import')
      expect(items[0].quality.confidence).toBe(0.95)
      expect(items[1].quality.confidence).toBe(0.8) // default
    })
  })

  describe('collectFromQueueItem', () => {
    it('should collect from a confirmed queue item', () => {
      const queueItem = createMockQueueItem()

      const feedback = collector.collectFromQueueItem(queueItem)

      expect(feedback).not.toBeNull()
      expect(feedback!.label).toBe('match')
      expect(feedback!.source).toBe('queue-confirm')
      expect(feedback!.pair.record1.id).toBe('1')
      expect(feedback!.pair.record2.id).toBe('2')
      expect(feedback!.quality.confidence).toBe(0.9)
      expect(feedback!.quality.matchScore).toBe(0.75)
      expect(feedback!.queueItemId).toBe('queue-1')
    })

    it('should collect from a rejected queue item', () => {
      const queueItem = createMockQueueItem({
        status: 'rejected',
        decision: {
          action: 'reject',
          confidence: 0.85,
        },
      })

      const feedback = collector.collectFromQueueItem(queueItem)

      expect(feedback).not.toBeNull()
      expect(feedback!.label).toBe('nonMatch')
      expect(feedback!.source).toBe('queue-reject')
    })

    it('should collect from a merged queue item', () => {
      const queueItem = createMockQueueItem({
        status: 'merged',
        decision: {
          action: 'merge',
          selectedMatchId: '2',
          confidence: 0.95,
        },
      })

      const feedback = collector.collectFromQueueItem(queueItem)

      expect(feedback).not.toBeNull()
      expect(feedback!.label).toBe('match')
      expect(feedback!.source).toBe('queue-merge')
    })

    it('should return null for queue item without decision', () => {
      const queueItem = createMockQueueItem({
        decision: undefined,
      })

      const feedback = collector.collectFromQueueItem(queueItem)

      expect(feedback).toBeNull()
    })

    it('should calculate decision time from timestamps', () => {
      const now = new Date()
      const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000)

      const queueItem = createMockQueueItem({
        updatedAt: fiveMinutesAgo,
        decidedAt: now,
      })

      const feedback = collector.collectFromQueueItem(queueItem)

      expect(feedback).not.toBeNull()
      expect(feedback!.quality.decisionTimeMs).toBe(5 * 60 * 1000)
    })

    it('should use default confidence when not provided in decision', () => {
      const queueItem = createMockQueueItem({
        decision: {
          action: 'confirm',
          selectedMatchId: '2',
          // no confidence
        },
      })

      const feedback = collector.collectFromQueueItem(queueItem)

      expect(feedback).not.toBeNull()
      expect(feedback!.quality.confidence).toBe(0.8) // default
    })

    it('should use custom candidate record when provided', () => {
      const queueItem = createMockQueueItem()
      const customCandidate: TestRecord = {
        id: '99',
        name: 'Custom',
        email: 'custom@example.com',
      }

      const feedback = collector.collectFromQueueItem(
        queueItem,
        customCandidate
      )

      expect(feedback).not.toBeNull()
      expect(feedback!.pair.record1.id).toBe('99')
    })

    it('should handle rejection with multiple potential matches', () => {
      const queueItem = createMockQueueItem({
        status: 'rejected',
        potentialMatches: [
          {
            record: { id: '2', name: 'John D', email: 'johnd@example.com' },
            score: 0.75,
            outcome: 'potential-match' as const,
            explanation: {} as any,
          },
          {
            record: { id: '3', name: 'Johnny', email: 'johnny@example.com' },
            score: 0.65,
            outcome: 'potential-match' as const,
            explanation: {} as any,
          },
        ],
        decision: {
          action: 'reject',
          confidence: 0.8,
        },
      })

      // First call adds all rejection pairs
      const feedback = collector.collectFromQueueItem(queueItem)

      // Should have added 2 feedback items (one for each potential match)
      expect(collector.size).toBe(2)
      expect(feedback).not.toBeNull()
      expect(feedback!.label).toBe('nonMatch')
    })
  })

  describe('collectFromQueueItems', () => {
    it('should collect from multiple queue items', () => {
      const items = [
        createMockQueueItem({ id: 'q1' }),
        createMockQueueItem({
          id: 'q2',
          status: 'rejected',
          decision: { action: 'reject' },
        }),
        createMockQueueItem({
          id: 'q3',
          decision: undefined, // should be skipped
        }),
      ]

      const feedback = collector.collectFromQueueItems(items)

      // First item: 1 match, Second item: 1 non-match per potential match, Third: skipped
      expect(feedback.length).toBe(2)
      expect(collector.size).toBe(2)
    })
  })

  describe('getFeedback', () => {
    beforeEach(() => {
      // Add some test data
      collector.addFeedback(
        {
          record1: { id: '1', name: 'John', email: 'john@example.com' },
          record2: { id: '2', name: 'John', email: 'john@example.com' },
        },
        'match',
        'queue-confirm',
        { confidence: 0.9, matchScore: 0.8 }
      )
      collector.addFeedback(
        {
          record1: { id: '3', name: 'Jane', email: 'jane@example.com' },
          record2: { id: '4', name: 'Janet', email: 'janet@example.com' },
        },
        'nonMatch',
        'queue-reject',
        { confidence: 0.7, matchScore: 0.4 }
      )
      collector.addFeedback(
        {
          record1: { id: '5', name: 'Bob', email: 'bob@example.com' },
          record2: { id: '6', name: 'Bob', email: 'bob@example.com' },
        },
        'match',
        'manual',
        { confidence: 0.95, matchScore: 0.95, isExpert: true }
      )
    })

    it('should return all feedback when no filter', () => {
      const items = collector.getFeedback()
      expect(items.length).toBe(3)
    })

    it('should filter by minimum confidence', () => {
      const items = collector.getFeedback({ minConfidence: 0.85 })
      expect(items.length).toBe(2)
      items.forEach((item) => {
        expect(item.quality.confidence).toBeGreaterThanOrEqual(0.85)
      })
    })

    it('should filter by match score range', () => {
      const items = collector.getFeedback({
        minMatchScore: 0.5,
        maxMatchScore: 0.9,
      })
      expect(items.length).toBe(1)
      expect(items[0].quality.matchScore).toBe(0.8)
    })

    it('should filter by source', () => {
      const items = collector.getFeedback({
        sources: ['queue-confirm', 'queue-reject'],
      })
      expect(items.length).toBe(2)
    })

    it('should filter by label', () => {
      const items = collector.getFeedback({ label: 'match' })
      expect(items.length).toBe(2)
    })

    it('should filter expert only', () => {
      const items = collector.getFeedback({ expertOnly: true })
      expect(items.length).toBe(1)
      expect(items[0].quality.isExpert).toBe(true)
    })

    it('should respect limit', () => {
      const items = collector.getFeedback({ limit: 2 })
      expect(items.length).toBe(2)
    })

    it('should sort by collection date (newest first)', () => {
      const items = collector.getFeedback()
      for (let i = 1; i < items.length; i++) {
        expect(items[i - 1].collectedAt.getTime()).toBeGreaterThanOrEqual(
          items[i].collectedAt.getTime()
        )
      }
    })
  })

  describe('getFeedbackById', () => {
    it('should return feedback item by ID', () => {
      const added = collector.addFeedback(
        {
          record1: { id: '1', name: 'John', email: 'john@example.com' },
          record2: { id: '2', name: 'John', email: 'john@example.com' },
        },
        'match'
      )

      const retrieved = collector.getFeedbackById(added.id)

      expect(retrieved).not.toBeNull()
      expect(retrieved!.id).toBe(added.id)
    })

    it('should return null for non-existent ID', () => {
      const retrieved = collector.getFeedbackById('non-existent')
      expect(retrieved).toBeNull()
    })
  })

  describe('removeFeedback', () => {
    it('should remove feedback item by ID', () => {
      const added = collector.addFeedback(
        {
          record1: { id: '1', name: 'John', email: 'john@example.com' },
          record2: { id: '2', name: 'John', email: 'john@example.com' },
        },
        'match'
      )

      expect(collector.size).toBe(1)
      const removed = collector.removeFeedback(added.id)
      expect(removed).toBe(true)
      expect(collector.size).toBe(0)
    })

    it('should return false for non-existent ID', () => {
      const removed = collector.removeFeedback('non-existent')
      expect(removed).toBe(false)
    })
  })

  describe('clear', () => {
    it('should remove all feedback', () => {
      collector.addFeedback(
        {
          record1: { id: '1', name: 'John', email: 'john@example.com' },
          record2: { id: '2', name: 'John', email: 'john@example.com' },
        },
        'match'
      )
      collector.addFeedback(
        {
          record1: { id: '3', name: 'Jane', email: 'jane@example.com' },
          record2: { id: '4', name: 'Janet', email: 'janet@example.com' },
        },
        'nonMatch'
      )

      expect(collector.size).toBe(2)
      collector.clear()
      expect(collector.size).toBe(0)
      expect(collector.isEmpty).toBe(true)
    })
  })

  describe('getStats', () => {
    beforeEach(() => {
      collector.addFeedback(
        {
          record1: { id: '1', name: 'John', email: 'john@example.com' },
          record2: { id: '2', name: 'John', email: 'john@example.com' },
        },
        'match',
        'queue-confirm',
        { confidence: 0.9 }
      )
      collector.addFeedback(
        {
          record1: { id: '3', name: 'Jane', email: 'jane@example.com' },
          record2: { id: '4', name: 'Janet', email: 'janet@example.com' },
        },
        'nonMatch',
        'queue-reject',
        { confidence: 0.7 }
      )
      collector.addFeedback(
        {
          record1: { id: '5', name: 'Bob', email: 'bob@example.com' },
          record2: { id: '6', name: 'Bob', email: 'bob@example.com' },
        },
        'match',
        'manual',
        { confidence: 0.8 }
      )
    })

    it('should calculate basic statistics', () => {
      const stats = collector.getStats()

      expect(stats.total).toBe(3)
      expect(stats.byLabel.match).toBe(2)
      expect(stats.byLabel.nonMatch).toBe(1)
      expect(stats.bySource['queue-confirm']).toBe(1)
      expect(stats.bySource['queue-reject']).toBe(1)
      expect(stats.bySource['manual']).toBe(1)
    })

    it('should calculate average confidence', () => {
      const stats = collector.getStats()
      expect(stats.avgConfidence).toBeCloseTo(0.8, 2) // (0.9 + 0.7 + 0.8) / 3
    })

    it('should calculate match ratio', () => {
      const stats = collector.getStats()
      expect(stats.matchRatio).toBeCloseTo(0.667, 2) // 2/3
    })

    it('should determine if dataset is balanced', () => {
      const stats = collector.getStats()
      expect(stats.isBalanced).toBe(false) // 2:1 ratio is not balanced
    })

    it('should track oldest and newest feedback', () => {
      const stats = collector.getStats()
      expect(stats.oldestFeedback).toBeInstanceOf(Date)
      expect(stats.newestFeedback).toBeInstanceOf(Date)
    })

    it('should respect filter when calculating stats', () => {
      const stats = collector.getStats({ label: 'match' })
      expect(stats.total).toBe(2)
      expect(stats.byLabel.match).toBe(2)
      expect(stats.byLabel.nonMatch).toBe(0)
    })
  })

  describe('exportAsTrainingDataset', () => {
    beforeEach(() => {
      collector.addFeedback(
        {
          record1: { id: '1', name: 'John', email: 'john@example.com' },
          record2: { id: '2', name: 'John', email: 'john@example.com' },
        },
        'match',
        'queue-confirm'
      )
      collector.addFeedback(
        {
          record1: { id: '3', name: 'Jane', email: 'jane@example.com' },
          record2: { id: '4', name: 'Janet', email: 'janet@example.com' },
        },
        'nonMatch',
        'queue-reject'
      )
    })

    it('should export all feedback as training dataset', () => {
      const dataset = collector.exportAsTrainingDataset()

      expect(dataset.examples.length).toBe(2)
      expect(dataset.metadata?.matchCount).toBe(1)
      expect(dataset.metadata?.nonMatchCount).toBe(1)
    })

    it('should apply filter before export', () => {
      const dataset = collector.exportAsTrainingDataset({
        filter: { label: 'match' },
      })

      expect(dataset.examples.length).toBe(1)
      expect(dataset.examples[0].label).toBe('match')
    })

    it('should balance dataset when requested', () => {
      // Add more matches to unbalance
      collector.addFeedback(
        {
          record1: { id: '5', name: 'Bob', email: 'bob@example.com' },
          record2: { id: '6', name: 'Bob', email: 'bob@example.com' },
        },
        'match'
      )
      collector.addFeedback(
        {
          record1: { id: '7', name: 'Alice', email: 'alice@example.com' },
          record2: { id: '8', name: 'Alice', email: 'alice@example.com' },
        },
        'match'
      )

      const unbalanced = collector.exportAsTrainingDataset()
      expect(
        unbalanced.examples.filter((e) => e.label === 'match').length
      ).toBe(3)
      expect(
        unbalanced.examples.filter((e) => e.label === 'nonMatch').length
      ).toBe(1)

      const balanced = collector.exportAsTrainingDataset({
        balance: true,
        seed: 42,
      })
      expect(balanced.examples.filter((e) => e.label === 'match').length).toBe(
        1
      )
      expect(
        balanced.examples.filter((e) => e.label === 'nonMatch').length
      ).toBe(1)
    })

    it('should preserve training example structure', () => {
      const dataset = collector.exportAsTrainingDataset()

      for (const example of dataset.examples) {
        expect(example.pair).toBeDefined()
        expect(example.pair.record1).toBeDefined()
        expect(example.pair.record2).toBeDefined()
        expect(example.label).toMatch(/^(match|nonMatch)$/)
        expect(example.source).toBeDefined()
        expect(example.timestamp).toBeInstanceOf(Date)
      }
    })
  })

  describe('exportAsTrainingExamples', () => {
    it('should export as array of training examples', () => {
      collector.addFeedback(
        {
          record1: { id: '1', name: 'John', email: 'john@example.com' },
          record2: { id: '2', name: 'John', email: 'john@example.com' },
        },
        'match'
      )
      collector.addFeedback(
        {
          record1: { id: '3', name: 'Jane', email: 'jane@example.com' },
          record2: { id: '4', name: 'Janet', email: 'janet@example.com' },
        },
        'nonMatch'
      )

      const examples = collector.exportAsTrainingExamples()

      expect(examples.length).toBe(2)
      expect(examples[0].pair).toBeDefined()
      expect(examples[0].label).toBeDefined()
    })
  })

  describe('score normalization', () => {
    it('should normalize scores when configured', () => {
      const normalizing = new FeedbackCollector<TestRecord>({
        normalizeScores: true,
        maxScore: 100,
      })

      const queueItem = createMockQueueItem({
        potentialMatches: [
          {
            record: { id: '2', name: 'John D', email: 'johnd@example.com' },
            score: 75, // out of 100
            outcome: 'potential-match' as const,
            explanation: {} as any,
          },
        ],
      })

      const feedback = normalizing.collectFromQueueItem(queueItem)

      expect(feedback).not.toBeNull()
      expect(feedback!.quality.matchScore).toBe(0.75) // normalized to 0-1
    })

    it('should clamp scores to 0-1 range', () => {
      const normalizing = new FeedbackCollector<TestRecord>({
        normalizeScores: true,
        maxScore: 100,
      })

      const queueItem = createMockQueueItem({
        potentialMatches: [
          {
            record: { id: '2', name: 'John D', email: 'johnd@example.com' },
            score: 150, // over max
            outcome: 'potential-match' as const,
            explanation: {} as any,
          },
        ],
      })

      const feedback = normalizing.collectFromQueueItem(queueItem)

      expect(feedback).not.toBeNull()
      expect(feedback!.quality.matchScore).toBe(1) // clamped to 1
    })
  })
})

describe('createFeedbackCollector', () => {
  it('should create a collector with default options', () => {
    const collector = createFeedbackCollector<TestRecord>()
    expect(collector).toBeInstanceOf(FeedbackCollector)
    expect(collector.size).toBe(0)
  })

  it('should create a collector with custom options', () => {
    const collector = createFeedbackCollector<TestRecord>({
      defaultConfidence: 0.6,
    })

    const pair = {
      record1: { id: '1', name: 'John', email: 'john@example.com' },
      record2: { id: '2', name: 'John', email: 'john@example.com' },
    }

    const item = collector.addFeedback(pair, 'match')
    expect(item.quality.confidence).toBe(0.6)
  })
})

describe('queueDecisionToTrainingExample', () => {
  it('should convert a queue item to a training example', () => {
    const queueItem = createMockQueueItem()

    const example = queueDecisionToTrainingExample(queueItem)

    expect(example).not.toBeNull()
    expect(example!.pair).toBeDefined()
    expect(example!.label).toBe('match')
    expect(example!.source).toBe('queue-confirm')
  })

  it('should return null for invalid queue item', () => {
    const queueItem = createMockQueueItem({ decision: undefined })

    const example = queueDecisionToTrainingExample(queueItem)

    expect(example).toBeNull()
  })
})

describe('queueDecisionsToTrainingExamples', () => {
  it('should convert multiple queue items to training examples', () => {
    const queueItems = [
      createMockQueueItem({ id: 'q1' }),
      createMockQueueItem({
        id: 'q2',
        status: 'rejected',
        decision: { action: 'reject' },
      }),
    ]

    const examples = queueDecisionsToTrainingExamples(queueItems)

    expect(examples.length).toBe(2)
    // Check labels are present (order may vary)
    const labels = examples.map(ex => ex.label)
    expect(labels).toContain('match')
    expect(labels).toContain('nonMatch')
  })

  it('should skip invalid queue items', () => {
    const queueItems = [
      createMockQueueItem({ id: 'q1' }),
      createMockQueueItem({ id: 'q2', decision: undefined }),
    ]

    const examples = queueDecisionsToTrainingExamples(queueItems)

    expect(examples.length).toBe(1)
  })
})

describe('FeedbackFilter date filters', () => {
  let collector: FeedbackCollector<TestRecord>

  beforeEach(() => {
    collector = new FeedbackCollector<TestRecord>()

    // Mock dates
    const now = new Date()
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000)

    // Add items with different timestamps by manually modifying collectedAt
    const item1 = collector.addFeedback(
      {
        record1: { id: '1', name: 'John', email: 'john@example.com' },
        record2: { id: '2', name: 'John', email: 'john@example.com' },
      },
      'match'
    )
    ;(item1 as any).collectedAt = twoDaysAgo

    const item2 = collector.addFeedback(
      {
        record1: { id: '3', name: 'Jane', email: 'jane@example.com' },
        record2: { id: '4', name: 'Janet', email: 'janet@example.com' },
      },
      'nonMatch'
    )
    ;(item2 as any).collectedAt = yesterday

    const item3 = collector.addFeedback(
      {
        record1: { id: '5', name: 'Bob', email: 'bob@example.com' },
        record2: { id: '6', name: 'Bob', email: 'bob@example.com' },
      },
      'match'
    )
    ;(item3 as any).collectedAt = now
  })

  it('should filter by since date', () => {
    // Use a slightly earlier cutoff to account for timing differences
    const yesterday = new Date(Date.now() - 25 * 60 * 60 * 1000)
    const items = collector.getFeedback({ since: yesterday })
    expect(items.length).toBe(2)
  })

  it('should filter by until date', () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const items = collector.getFeedback({ until: yesterday })
    expect(items.length).toBe(2)
  })
})

describe('FeedbackFilter decision time filter', () => {
  it('should filter out quick decisions', () => {
    const collector = new FeedbackCollector<TestRecord>()

    collector.addFeedback(
      {
        record1: { id: '1', name: 'John', email: 'john@example.com' },
        record2: { id: '2', name: 'John', email: 'john@example.com' },
      },
      'match',
      'manual',
      { decisionTimeMs: 1000 } // 1 second
    )
    collector.addFeedback(
      {
        record1: { id: '3', name: 'Jane', email: 'jane@example.com' },
        record2: { id: '4', name: 'Janet', email: 'janet@example.com' },
      },
      'nonMatch',
      'manual',
      { decisionTimeMs: 5000 } // 5 seconds
    )

    const items = collector.getFeedback({ minDecisionTimeMs: 3000 })
    expect(items.length).toBe(1)
    expect(items[0].quality.decisionTimeMs).toBe(5000)
  })
})
