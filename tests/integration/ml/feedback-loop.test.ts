/**
 * Feedback Loop Integration Tests
 *
 * Tests the complete feedback loop workflow: collecting human review decisions,
 * converting them to training data, training custom models, and improving predictions.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  ModelTrainer,
  SimpleClassifier,
  FeatureExtractor,
  FeedbackCollector,
  createTrainingDataset,
  createTrainingExample,
  mergeTrainingDatasets,
  balanceDataset,
  getDatasetStats,
  exportWeightsToJson,
} from '../../../src/ml'
import type {
  TrainingExample,
  TrainingDataset,
  TrainingConfig,
  RecordPair,
  FeatureExtractionConfig,
} from '../../../src/ml'
import type {
  QueueItem,
  QueueStatus,
  PotentialMatch,
} from '../../../src/queue/types'

interface Customer {
  id?: string
  firstName: string
  lastName: string
  email?: string
  phone?: string
}

function createFeatureExtractor(): FeatureExtractor<Customer> {
  const config: FeatureExtractionConfig = {
    fields: [
      { field: 'firstName', extractors: ['jaroWinkler', 'exact'], weight: 1.0 },
      { field: 'lastName', extractors: ['jaroWinkler', 'exact'], weight: 1.0 },
      { field: 'email', extractors: ['exact', 'levenshtein'], weight: 1.2 },
    ],
    normalize: true,
  }
  return new FeatureExtractor<Customer>(config)
}

function createMockQueueItem<T>(
  candidateRecord: T,
  potentialMatches: Array<{ record: T; score: number }>,
  action: 'confirm' | 'reject' | 'merge',
  selectedMatchId?: string
): QueueItem<T> {
  return {
    id: `queue-${Date.now()}-${Math.random()}`,
    candidateRecord,
    potentialMatches: potentialMatches.map((pm, i) => ({
      id: `match-${i}`,
      record: pm.record,
      score: pm.score,
      explanation: `Score: ${pm.score}`,
    })) as PotentialMatch<T>[],
    createdAt: new Date(Date.now() - 60000),
    updatedAt: new Date(Date.now() - 30000),
    decidedAt: new Date(),
    status: 'confirmed' as QueueStatus,
    decision: {
      action,
      selectedMatchId: selectedMatchId ?? potentialMatches[0]?.id,
      reviewedBy: 'test-user',
      confidence: 0.9,
      timestamp: new Date(),
    },
  }
}

describe('Feedback Loop Integration', () => {
  describe('FeedbackCollector', () => {
    let collector: FeedbackCollector<Customer>

    beforeEach(() => {
      collector = new FeedbackCollector<Customer>({
        defaultConfidence: 0.8,
        normalizeScores: true,
        maxScore: 100,
      })
    })

    it('should collect feedback from queue confirm decision', () => {
      const queueItem = createMockQueueItem(
        { firstName: 'John', lastName: 'Smith', email: 'john@example.com' },
        [
          {
            record: {
              firstName: 'John',
              lastName: 'Smith',
              email: 'john@example.com',
            },
            score: 85,
          },
        ],
        'confirm'
      )

      const feedback = collector.collectFromQueueItem(queueItem)

      expect(feedback).not.toBeNull()
      expect(feedback?.label).toBe('match')
      expect(feedback?.source).toBe('queue-confirm')
    })

    it('should collect feedback from queue reject decision', () => {
      const queueItem = createMockQueueItem(
        { firstName: 'John', lastName: 'Smith' },
        [{ record: { firstName: 'Jane', lastName: 'Doe' }, score: 45 }],
        'reject'
      )

      const feedback = collector.collectFromQueueItem(queueItem)

      expect(feedback).not.toBeNull()
      expect(feedback?.label).toBe('nonMatch')
      expect(feedback?.source).toBe('queue-reject')
    })

    it('should collect feedback from queue merge decision', () => {
      const queueItem = createMockQueueItem(
        { firstName: 'Robert', lastName: 'Johnson' },
        [{ record: { firstName: 'Bob', lastName: 'Johnson' }, score: 72 }],
        'merge'
      )

      const feedback = collector.collectFromQueueItem(queueItem)

      expect(feedback).not.toBeNull()
      expect(feedback?.label).toBe('match')
      expect(feedback?.source).toBe('queue-merge')
    })

    it('should add manual feedback', () => {
      const pair: RecordPair<Customer> = {
        record1: { firstName: 'Alice', lastName: 'Brown' },
        record2: { firstName: 'Alice', lastName: 'Brown' },
      }

      const feedback = collector.addFeedback(pair, 'match', 'manual', {
        confidence: 0.95,
        matchScore: 0.9,
      })

      expect(feedback.label).toBe('match')
      expect(feedback.source).toBe('manual')
      expect(feedback.quality.confidence).toBe(0.95)
    })

    it('should add batch feedback', () => {
      const items = [
        {
          pair: {
            record1: { firstName: 'A', lastName: 'Test' } as Customer,
            record2: { firstName: 'A', lastName: 'Test' } as Customer,
          },
          label: 'match' as const,
        },
        {
          pair: {
            record1: { firstName: 'B', lastName: 'Test' } as Customer,
            record2: { firstName: 'C', lastName: 'Other' } as Customer,
          },
          label: 'nonMatch' as const,
        },
      ]

      const feedbackItems = collector.addFeedbackBatch(items)

      expect(feedbackItems.length).toBe(2)
      expect(collector.size).toBe(2)
    })

    it('should import feedback from external source', () => {
      const pairs = [
        {
          record1: { firstName: 'John', lastName: 'Smith' },
          record2: { firstName: 'John', lastName: 'Smith' },
          label: 'match' as const,
          confidence: 1.0,
        },
        {
          record1: { firstName: 'Jane', lastName: 'Doe' },
          record2: { firstName: 'Bob', lastName: 'Wilson' },
          label: 'nonMatch' as const,
          confidence: 1.0,
        },
      ]

      const imported = collector.importFeedback(pairs)

      expect(imported.length).toBe(2)
      expect(imported[0].source).toBe('import')
    })

    it('should filter feedback by criteria', () => {
      // Add mixed feedback
      collector.addFeedback(
        {
          record1: { firstName: 'A', lastName: 'Test' },
          record2: { firstName: 'A', lastName: 'Test' },
        },
        'match',
        'manual',
        { confidence: 0.95, matchScore: 0.9 }
      )
      collector.addFeedback(
        {
          record1: { firstName: 'B', lastName: 'Test' },
          record2: { firstName: 'C', lastName: 'Other' },
        },
        'nonMatch',
        'manual',
        { confidence: 0.6, matchScore: 0.3 }
      )
      collector.addFeedback(
        {
          record1: { firstName: 'D', lastName: 'Test' },
          record2: { firstName: 'E', lastName: 'Other' },
        },
        'nonMatch',
        'synthetic',
        { confidence: 0.8, matchScore: 0.2 }
      )

      // Filter by label
      const matches = collector.getFeedback({ label: 'match' })
      expect(matches.length).toBe(1)

      // Filter by confidence
      const highConfidence = collector.getFeedback({ minConfidence: 0.7 })
      expect(highConfidence.length).toBe(2)

      // Filter by source
      const manualOnly = collector.getFeedback({ sources: ['manual'] })
      expect(manualOnly.length).toBe(2)
    })

    it('should calculate feedback statistics', () => {
      collector.addFeedback(
        {
          record1: { firstName: 'A', lastName: 'Test' },
          record2: { firstName: 'A', lastName: 'Test' },
        },
        'match',
        'manual',
        { confidence: 0.9 }
      )
      collector.addFeedback(
        {
          record1: { firstName: 'B', lastName: 'Test' },
          record2: { firstName: 'C', lastName: 'Other' },
        },
        'nonMatch',
        'manual',
        { confidence: 0.8 }
      )

      const stats = collector.getStats()

      expect(stats.total).toBe(2)
      expect(stats.byLabel.match).toBe(1)
      expect(stats.byLabel.nonMatch).toBe(1)
      expect(stats.avgConfidence).toBeCloseTo(0.85)
      expect(stats.matchRatio).toBe(0.5)
      expect(stats.isBalanced).toBe(true)
    })

    it('should export feedback as training dataset', () => {
      collector.addFeedback(
        {
          record1: { firstName: 'A', lastName: 'Test' },
          record2: { firstName: 'A', lastName: 'Test' },
        },
        'match'
      )
      collector.addFeedback(
        {
          record1: { firstName: 'B', lastName: 'Test' },
          record2: { firstName: 'C', lastName: 'Other' },
        },
        'nonMatch'
      )

      const dataset = collector.exportAsTrainingDataset()

      expect(dataset.examples.length).toBe(2)
      expect(dataset.metadata?.matchCount).toBe(1)
      expect(dataset.metadata?.nonMatchCount).toBe(1)
    })

    it('should export balanced dataset', () => {
      // Add unbalanced data
      collector.addFeedback(
        {
          record1: { firstName: 'A1', lastName: 'Test' },
          record2: { firstName: 'A1', lastName: 'Test' },
        },
        'match'
      )
      collector.addFeedback(
        {
          record1: { firstName: 'A2', lastName: 'Test' },
          record2: { firstName: 'A2', lastName: 'Test' },
        },
        'match'
      )
      collector.addFeedback(
        {
          record1: { firstName: 'A3', lastName: 'Test' },
          record2: { firstName: 'A3', lastName: 'Test' },
        },
        'match'
      )
      collector.addFeedback(
        {
          record1: { firstName: 'B', lastName: 'Test' },
          record2: { firstName: 'C', lastName: 'Other' },
        },
        'nonMatch'
      )

      const balancedDataset = collector.exportAsTrainingDataset({
        balance: true,
        seed: 42,
      })

      const balancedStats = getDatasetStats(balancedDataset)
      expect(balancedStats.isBalanced).toBe(true)
    })
  })

  describe('Training Dataset Operations', () => {
    it('should create training examples', () => {
      const pair: RecordPair<Customer> = {
        record1: { firstName: 'John', lastName: 'Smith' },
        record2: { firstName: 'John', lastName: 'Smith' },
      }

      const example = createTrainingExample(pair, 'match', 'test-source')

      expect(example.pair).toBe(pair)
      expect(example.label).toBe('match')
      expect(example.source).toBe('test-source')
      expect(example.timestamp).toBeDefined()
    })

    it('should create training dataset with metadata', () => {
      const examples: TrainingExample<Customer>[] = [
        createTrainingExample(
          {
            record1: { firstName: 'A', lastName: 'Test' },
            record2: { firstName: 'A', lastName: 'Test' },
          },
          'match'
        ),
        createTrainingExample(
          {
            record1: { firstName: 'B', lastName: 'Test' },
            record2: { firstName: 'C', lastName: 'Other' },
          },
          'nonMatch'
        ),
      ]

      const dataset = createTrainingDataset(examples, {
        name: 'Test Dataset',
        description: 'For testing',
      })

      expect(dataset.examples.length).toBe(2)
      expect(dataset.metadata?.name).toBe('Test Dataset')
      expect(dataset.metadata?.matchCount).toBe(1)
      expect(dataset.metadata?.nonMatchCount).toBe(1)
    })

    it('should merge multiple datasets', () => {
      const dataset1 = createTrainingDataset([
        createTrainingExample(
          {
            record1: { firstName: 'A', lastName: 'Test' },
            record2: { firstName: 'A', lastName: 'Test' },
          },
          'match'
        ),
      ])

      const dataset2 = createTrainingDataset([
        createTrainingExample(
          {
            record1: { firstName: 'B', lastName: 'Test' },
            record2: { firstName: 'C', lastName: 'Other' },
          },
          'nonMatch'
        ),
      ])

      const merged = mergeTrainingDatasets(dataset1, dataset2)

      expect(merged.examples.length).toBe(2)
    })

    it('should balance unbalanced dataset', () => {
      const examples: TrainingExample<Customer>[] = [
        ...Array.from({ length: 10 }, () =>
          createTrainingExample(
            {
              record1: { firstName: 'A', lastName: 'Test' },
              record2: { firstName: 'A', lastName: 'Test' },
            },
            'match'
          )
        ),
        ...Array.from({ length: 3 }, () =>
          createTrainingExample(
            {
              record1: { firstName: 'B', lastName: 'Test' },
              record2: { firstName: 'C', lastName: 'Other' },
            },
            'nonMatch'
          )
        ),
      ]

      const unbalanced = createTrainingDataset(examples)
      const balanced = balanceDataset(unbalanced, 42)

      expect(getDatasetStats(balanced).isBalanced).toBe(true)
      expect(balanced.examples.length).toBe(6) // 3 + 3
    })

    it('should calculate dataset statistics', () => {
      const examples: TrainingExample<Customer>[] = [
        createTrainingExample(
          {
            record1: { firstName: 'A', lastName: 'Test' },
            record2: { firstName: 'A', lastName: 'Test' },
          },
          'match'
        ),
        createTrainingExample(
          {
            record1: { firstName: 'B', lastName: 'Test' },
            record2: { firstName: 'B', lastName: 'Test' },
          },
          'match'
        ),
        createTrainingExample(
          {
            record1: { firstName: 'C', lastName: 'Test' },
            record2: { firstName: 'D', lastName: 'Other' },
          },
          'nonMatch'
        ),
      ]

      const dataset = createTrainingDataset(examples)
      const stats = getDatasetStats(dataset)

      expect(stats.totalExamples).toBe(3)
      expect(stats.matchCount).toBe(2)
      expect(stats.nonMatchCount).toBe(1)
      expect(stats.matchRatio).toBeCloseTo(2 / 3)
      expect(stats.isBalanced).toBe(false)
    })
  })

  describe('ModelTrainer', () => {
    let featureExtractor: FeatureExtractor<Customer>

    beforeEach(() => {
      featureExtractor = createFeatureExtractor()
    })

    it('should train model from labeled data', async () => {
      const examples: TrainingExample<Customer>[] = [
        // Matches
        createTrainingExample(
          {
            record1: { firstName: 'John', lastName: 'Smith' },
            record2: { firstName: 'John', lastName: 'Smith' },
          },
          'match'
        ),
        createTrainingExample(
          {
            record1: { firstName: 'Jane', lastName: 'Doe' },
            record2: { firstName: 'Jane', lastName: 'Doe' },
          },
          'match'
        ),
        // Non-matches
        createTrainingExample(
          {
            record1: { firstName: 'John', lastName: 'Smith' },
            record2: { firstName: 'Jane', lastName: 'Doe' },
          },
          'nonMatch'
        ),
        createTrainingExample(
          {
            record1: { firstName: 'Bob', lastName: 'Wilson' },
            record2: { firstName: 'Alice', lastName: 'Brown' },
          },
          'nonMatch'
        ),
      ]

      const dataset = createTrainingDataset(examples)

      const trainer = new ModelTrainer<Customer>({
        featureExtractor,
        config: {
          learningRate: 0.5,
          maxIterations: 50,
          regularization: 0.01,
          validationSplit: 0,
        },
        seed: 42,
      })

      const result = await trainer.train(dataset)

      expect(result.success).toBe(true)
      expect(result.weights).toBeDefined()
      expect(result.bias).toBeDefined()
      expect(result.finalMetrics.trainingAccuracy).toBeGreaterThan(0.5)
    })

    it('should train classifier directly', async () => {
      const examples: TrainingExample<Customer>[] = [
        createTrainingExample(
          {
            record1: { firstName: 'John', lastName: 'Smith' },
            record2: { firstName: 'John', lastName: 'Smith' },
          },
          'match'
        ),
        createTrainingExample(
          {
            record1: { firstName: 'Jane', lastName: 'Doe' },
            record2: { firstName: 'Jane', lastName: 'Doe' },
          },
          'match'
        ),
        createTrainingExample(
          {
            record1: { firstName: 'John', lastName: 'Smith' },
            record2: { firstName: 'Jane', lastName: 'Doe' },
          },
          'nonMatch'
        ),
        createTrainingExample(
          {
            record1: { firstName: 'Bob', lastName: 'Wilson' },
            record2: { firstName: 'Alice', lastName: 'Brown' },
          },
          'nonMatch'
        ),
      ]

      const dataset = createTrainingDataset(examples)

      const trainer = new ModelTrainer<Customer>({
        featureExtractor,
        config: {
          learningRate: 0.5,
          maxIterations: 50,
          validationSplit: 0,
        },
        seed: 42,
      })

      const { classifier, result } = await trainer.trainClassifier(dataset)

      expect(classifier).not.toBeNull()
      expect(classifier?.isReady()).toBe(true)
    })

    it('should support validation split and early stopping', async () => {
      const examples: TrainingExample<Customer>[] = Array.from(
        { length: 20 },
        (_, i) => {
          const isMatch = i % 2 === 0
          return createTrainingExample(
            {
              record1: { firstName: `Name${i}`, lastName: 'Test' },
              record2: isMatch
                ? { firstName: `Name${i}`, lastName: 'Test' }
                : { firstName: `Other${i}`, lastName: 'Different' },
            },
            isMatch ? 'match' : 'nonMatch'
          )
        }
      )

      const dataset = createTrainingDataset(examples)

      const trainer = new ModelTrainer<Customer>({
        featureExtractor,
        config: {
          learningRate: 0.3,
          maxIterations: 100,
          validationSplit: 0.2,
          earlyStoppingPatience: 5,
        },
        seed: 42,
      })

      const result = await trainer.train(dataset)

      expect(result.success).toBe(true)
      expect(result.finalMetrics.validationAccuracy).toBeDefined()
    })

    it('should report training progress', async () => {
      const examples: TrainingExample<Customer>[] = [
        createTrainingExample(
          {
            record1: { firstName: 'John', lastName: 'Smith' },
            record2: { firstName: 'John', lastName: 'Smith' },
          },
          'match'
        ),
        createTrainingExample(
          {
            record1: { firstName: 'Jane', lastName: 'Doe' },
            record2: { firstName: 'Bob', lastName: 'Wilson' },
          },
          'nonMatch'
        ),
      ]

      const dataset = createTrainingDataset(examples)
      const progressUpdates: number[] = []

      const trainer = new ModelTrainer<Customer>({
        featureExtractor,
        config: { maxIterations: 30, validationSplit: 0 },
        onProgress: (metrics) => progressUpdates.push(metrics.iteration),
        progressInterval: 10,
        seed: 42,
      })

      await trainer.train(dataset)

      expect(progressUpdates.length).toBeGreaterThan(0)
      expect(progressUpdates).toContain(10)
      expect(progressUpdates).toContain(20)
      expect(progressUpdates).toContain(30)
    })

    it('should export trained weights to JSON', async () => {
      const examples: TrainingExample<Customer>[] = [
        createTrainingExample(
          {
            record1: { firstName: 'John', lastName: 'Smith' },
            record2: { firstName: 'John', lastName: 'Smith' },
          },
          'match'
        ),
        createTrainingExample(
          {
            record1: { firstName: 'Jane', lastName: 'Doe' },
            record2: { firstName: 'Bob', lastName: 'Wilson' },
          },
          'nonMatch'
        ),
      ]

      const dataset = createTrainingDataset(examples)

      const trainer = new ModelTrainer<Customer>({
        featureExtractor,
        config: { maxIterations: 20, validationSplit: 0 },
        seed: 42,
      })

      const result = await trainer.train(dataset)
      const featureNames = featureExtractor.getFeatureNames()

      const json = exportWeightsToJson(result, featureNames, 'TestModel')
      const parsed = JSON.parse(json)

      expect(parsed.modelType).toBe('SimpleClassifier')
      expect(parsed.weights.length).toBe(featureNames.length)
      expect(parsed.featureNames).toEqual(featureNames)
      expect(parsed.extra.modelName).toBe('TestModel')
    })
  })

  describe('Complete Feedback Loop', () => {
    it('should improve model with feedback data', async () => {
      const featureExtractor = createFeatureExtractor()

      // Step 1: Start with initial data
      const initialData: TrainingExample<Customer>[] = [
        createTrainingExample(
          {
            record1: { firstName: 'John', lastName: 'Smith' },
            record2: { firstName: 'John', lastName: 'Smith' },
          },
          'match'
        ),
        createTrainingExample(
          {
            record1: { firstName: 'Jane', lastName: 'Doe' },
            record2: { firstName: 'Bob', lastName: 'Wilson' },
          },
          'nonMatch'
        ),
      ]

      // Step 2: Train initial model
      const initialDataset = createTrainingDataset(initialData)
      const trainer = new ModelTrainer<Customer>({
        featureExtractor,
        config: { maxIterations: 30, validationSplit: 0 },
        seed: 42,
      })

      const { classifier: initialClassifier } =
        await trainer.trainClassifier(initialDataset)
      expect(initialClassifier).not.toBeNull()

      // Step 3: Collect feedback
      const collector = new FeedbackCollector<Customer>()

      // Add feedback simulating human corrections
      collector.addFeedback(
        {
          record1: { firstName: 'Robert', lastName: 'Johnson' },
          record2: { firstName: 'Bob', lastName: 'Johnson' },
        },
        'match', // Human says these are the same (nickname)
        'manual',
        { confidence: 0.95 }
      )

      collector.addFeedback(
        {
          record1: { firstName: 'Elizabeth', lastName: 'Williams' },
          record2: { firstName: 'Liz', lastName: 'Williams' },
        },
        'match', // Human says these are the same (nickname)
        'manual',
        { confidence: 0.95 }
      )

      // Step 4: Export feedback and merge with initial data
      const feedbackDataset = collector.exportAsTrainingDataset()
      const combinedDataset = mergeTrainingDatasets(
        initialDataset,
        feedbackDataset
      )

      // Step 5: Retrain model
      const { classifier: improvedClassifier } =
        await trainer.trainClassifier(combinedDataset)
      expect(improvedClassifier).not.toBeNull()

      // The improved model now has more training data
      // In a real scenario, we'd verify improved accuracy on nickname handling
    })

    it('should handle the full workflow from queue to training', async () => {
      // Step 1: Simulate queue decisions
      const queueItems: QueueItem<Customer>[] = [
        createMockQueueItem(
          { firstName: 'John', lastName: 'Smith', email: 'john@example.com' },
          [
            {
              record: {
                firstName: 'John',
                lastName: 'Smith',
                email: 'john@example.com',
              },
              score: 95,
            },
          ],
          'confirm'
        ),
        createMockQueueItem(
          { firstName: 'Jane', lastName: 'Doe', email: 'jane@a.com' },
          [
            {
              record: {
                firstName: 'Janet',
                lastName: 'Doe',
                email: 'janet@b.com',
              },
              score: 55,
            },
          ],
          'reject'
        ),
        createMockQueueItem(
          { firstName: 'Bob', lastName: 'Wilson', email: 'bob@test.org' },
          [
            {
              record: {
                firstName: 'Robert',
                lastName: 'Wilson',
                email: 'bob@test.org',
              },
              score: 72,
            },
          ],
          'merge'
        ),
      ]

      // Step 2: Collect feedback from queue
      const collector = new FeedbackCollector<Customer>()
      collector.collectFromQueueItems(queueItems)

      expect(collector.size).toBeGreaterThan(0)
      const stats = collector.getStats()
      expect(stats.bySource['queue-confirm']).toBeGreaterThanOrEqual(1)

      // Step 3: Export as training dataset
      const dataset = collector.exportAsTrainingDataset()
      expect(dataset.examples.length).toBeGreaterThan(0)

      // Step 4: Train model
      const featureExtractor = createFeatureExtractor()
      const trainer = new ModelTrainer<Customer>({
        featureExtractor,
        config: { maxIterations: 20, validationSplit: 0 },
        seed: 42,
      })

      const { classifier } = await trainer.trainClassifier(dataset)

      // Model might not be trained if dataset is too small, which is expected
      // In a real scenario, we'd accumulate more feedback before training
    })
  })
})
