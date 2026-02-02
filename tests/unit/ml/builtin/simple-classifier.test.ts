/**
 * SimpleClassifier Unit Tests
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  SimpleClassifier,
  createPersonMatchingClassifier,
  createClassifierFromFields,
  isValidSimpleClassifierWeights,
} from '../../../../src/ml/builtin/simple-classifier'
import {
  FeatureExtractor,
  featureConfig,
} from '../../../../src/ml/feature-extractor'
import type { MLModelWeights } from '../../../../src/ml/model-interface'
import type { RecordPair, FeatureVector } from '../../../../src/ml/types'

interface TestRecord {
  firstName: string
  lastName: string
  email: string
}

describe('SimpleClassifier', () => {
  let classifier: SimpleClassifier<TestRecord>
  let featureExtractor: FeatureExtractor<TestRecord>

  beforeEach(() => {
    // Create a simple feature extractor for testing
    const config = featureConfig()
      .addStringField('firstName')
      .addStringField('lastName')
      .addExactField('email')
      .build()

    featureExtractor = new FeatureExtractor<TestRecord>(config)
    classifier = new SimpleClassifier<TestRecord>({
      featureExtractor,
    })
  })

  describe('constructor', () => {
    it('should create with default configuration', () => {
      const c = new SimpleClassifier()
      expect(c.getMetadata().name).toBe('SimpleClassifier')
      expect(c.getMetadata().version).toBe('1.0.0')
      expect(c.isReady()).toBe(false)
    })

    it('should create with custom model config', () => {
      const c = new SimpleClassifier({
        modelConfig: {
          matchThreshold: 0.8,
          nonMatchThreshold: 0.2,
        },
      })
      expect(c.getConfig().matchThreshold).toBe(0.8)
      expect(c.getConfig().nonMatchThreshold).toBe(0.2)
    })

    it('should create with feature config', () => {
      const c = new SimpleClassifier<TestRecord>({
        featureConfig: featureConfig().addStringField('firstName').build(),
      })
      expect(c.getMetadata().featureNames.length).toBeGreaterThan(0)
    })

    it('should create with feature extractor', () => {
      expect(classifier.getMetadata().featureNames).toEqual(
        featureExtractor.getFeatureNames()
      )
    })
  })

  describe('setFeatureExtractor', () => {
    it('should update feature extractor', () => {
      const c = new SimpleClassifier<TestRecord>()
      c.setFeatureExtractor(featureExtractor)
      expect(c.getMetadata().featureNames).toEqual(
        featureExtractor.getFeatureNames()
      )
    })
  })

  describe('setWeightsAndBias', () => {
    it('should set weights and bias', () => {
      const featureCount = featureExtractor.getFeatureCount()
      const weights = Array(featureCount).fill(0.5)
      const bias = 0.1

      classifier.setWeightsAndBias(weights, bias)

      expect(classifier.getWeights()).toEqual(weights)
      expect(classifier.getBias()).toBe(bias)
      expect(classifier.isReady()).toBe(true)
    })

    it('should throw if weights length does not match feature count', () => {
      expect(() => classifier.setWeightsAndBias([0.1, 0.2], 0)).toThrow(
        /must match feature count/
      )
    })
  })

  describe('extractFeatures', () => {
    it('should extract features from record pair', () => {
      const pair: RecordPair<TestRecord> = {
        record1: {
          firstName: 'John',
          lastName: 'Smith',
          email: 'john@example.com',
        },
        record2: {
          firstName: 'Jon',
          lastName: 'Smith',
          email: 'john@example.com',
        },
      }

      const features = classifier.extractFeatures(pair)

      expect(features.values.length).toBe(featureExtractor.getFeatureCount())
      expect(features.names).toEqual(featureExtractor.getFeatureNames())
    })

    it('should throw if feature extractor not set', () => {
      const c = new SimpleClassifier<TestRecord>()
      const pair: RecordPair<TestRecord> = {
        record1: {
          firstName: 'John',
          lastName: 'Smith',
          email: 'john@example.com',
        },
        record2: {
          firstName: 'Jon',
          lastName: 'Smith',
          email: 'john@example.com',
        },
      }

      expect(() => c.extractFeatures(pair)).toThrow(
        /Feature extractor not configured/
      )
    })
  })

  describe('predict', () => {
    beforeEach(() => {
      const featureCount = featureExtractor.getFeatureCount()
      // Set weights that favor matches (positive weights for similarity features)
      const weights = Array(featureCount).fill(0.3)
      classifier.setWeightsAndBias(weights, -0.5)
    })

    it('should predict match for similar records', async () => {
      const pair: RecordPair<TestRecord> = {
        record1: {
          firstName: 'John',
          lastName: 'Smith',
          email: 'john@example.com',
        },
        record2: {
          firstName: 'John',
          lastName: 'Smith',
          email: 'john@example.com',
        },
      }

      const prediction = await classifier.predict(pair)

      expect(prediction.probability).toBeGreaterThan(0.5)
      expect(prediction.classification).toBe('match')
      expect(prediction.confidence).toBeGreaterThanOrEqual(0)
      expect(prediction.confidence).toBeLessThanOrEqual(1)
    })

    it('should predict non-match for dissimilar records', async () => {
      // Set weights to make dissimilar records score low
      const featureCount = featureExtractor.getFeatureCount()
      const weights = Array(featureCount).fill(2.0)
      classifier.setWeightsAndBias(weights, -10)

      const pair: RecordPair<TestRecord> = {
        record1: {
          firstName: 'John',
          lastName: 'Smith',
          email: 'john@example.com',
        },
        record2: {
          firstName: 'Jane',
          lastName: 'Doe',
          email: 'jane@different.com',
        },
      }

      const prediction = await classifier.predict(pair)

      expect(prediction.probability).toBeLessThan(0.5)
    })

    it('should include feature importance when configured', async () => {
      classifier.setConfig({ includeFeatureImportance: true })

      const pair: RecordPair<TestRecord> = {
        record1: {
          firstName: 'John',
          lastName: 'Smith',
          email: 'john@example.com',
        },
        record2: {
          firstName: 'John',
          lastName: 'Smith',
          email: 'john@example.com',
        },
      }

      const prediction = await classifier.predict(pair)

      expect(prediction.featureImportance.length).toBeGreaterThan(0)
      expect(prediction.featureImportance[0]).toHaveProperty('name')
      expect(prediction.featureImportance[0]).toHaveProperty('value')
      expect(prediction.featureImportance[0]).toHaveProperty('contribution')
      expect(prediction.featureImportance[0]).toHaveProperty('importance')
    })

    it('should not include feature importance when disabled', async () => {
      classifier.setConfig({ includeFeatureImportance: false })

      const pair: RecordPair<TestRecord> = {
        record1: {
          firstName: 'John',
          lastName: 'Smith',
          email: 'john@example.com',
        },
        record2: {
          firstName: 'John',
          lastName: 'Smith',
          email: 'john@example.com',
        },
      }

      const prediction = await classifier.predict(pair)

      expect(prediction.featureImportance).toEqual([])
    })

    it('should throw if model not ready', async () => {
      const c = new SimpleClassifier<TestRecord>({ featureExtractor })
      const pair: RecordPair<TestRecord> = {
        record1: {
          firstName: 'John',
          lastName: 'Smith',
          email: 'john@example.com',
        },
        record2: {
          firstName: 'John',
          lastName: 'Smith',
          email: 'john@example.com',
        },
      }

      await expect(c.predict(pair)).rejects.toThrow(/Model not ready/)
    })
  })

  describe('predictBatch', () => {
    beforeEach(() => {
      const featureCount = featureExtractor.getFeatureCount()
      const weights = Array(featureCount).fill(0.3)
      classifier.setWeightsAndBias(weights, -0.5)
    })

    it('should predict batch of record pairs', async () => {
      const pairs: RecordPair<TestRecord>[] = [
        {
          record1: {
            firstName: 'John',
            lastName: 'Smith',
            email: 'john@example.com',
          },
          record2: {
            firstName: 'John',
            lastName: 'Smith',
            email: 'john@example.com',
          },
        },
        {
          record1: {
            firstName: 'Jane',
            lastName: 'Doe',
            email: 'jane@example.com',
          },
          record2: {
            firstName: 'Jane',
            lastName: 'Doe',
            email: 'jane@example.com',
          },
        },
      ]

      const results = await classifier.predictBatch(pairs)

      expect(results.length).toBe(2)
      expect(results[0].pair).toBe(pairs[0])
      expect(results[0].prediction.probability).toBeDefined()
      expect(results[1].pair).toBe(pairs[1])
      expect(results[1].prediction.probability).toBeDefined()
    })

    it('should throw if model not ready', async () => {
      const c = new SimpleClassifier<TestRecord>({ featureExtractor })
      const pairs: RecordPair<TestRecord>[] = [
        {
          record1: {
            firstName: 'John',
            lastName: 'Smith',
            email: 'john@example.com',
          },
          record2: {
            firstName: 'John',
            lastName: 'Smith',
            email: 'john@example.com',
          },
        },
      ]

      await expect(c.predictBatch(pairs)).rejects.toThrow(/Model not ready/)
    })
  })

  describe('predictFromFeatures', () => {
    beforeEach(() => {
      const featureCount = featureExtractor.getFeatureCount()
      const weights = Array(featureCount).fill(0.3)
      classifier.setWeightsAndBias(weights, -0.5)
    })

    it('should predict from pre-extracted features', () => {
      const pair: RecordPair<TestRecord> = {
        record1: {
          firstName: 'John',
          lastName: 'Smith',
          email: 'john@example.com',
        },
        record2: {
          firstName: 'John',
          lastName: 'Smith',
          email: 'john@example.com',
        },
      }

      const features = classifier.extractFeatures(pair)
      const prediction = classifier.predictFromFeatures(features)

      expect(prediction.probability).toBeDefined()
      expect(prediction.classification).toBeDefined()
    })

    it('should throw if model not ready', () => {
      const c = new SimpleClassifier<TestRecord>({ featureExtractor })
      const features: FeatureVector = {
        values: [0.5, 0.5],
        names: ['a', 'b'],
      }

      expect(() => c.predictFromFeatures(features)).toThrow(/Model not ready/)
    })
  })

  describe('predictBatchFromFeatures', () => {
    beforeEach(() => {
      const featureCount = featureExtractor.getFeatureCount()
      const weights = Array(featureCount).fill(0.3)
      classifier.setWeightsAndBias(weights, -0.5)
    })

    it('should predict batch from pre-extracted features', () => {
      const pairs: RecordPair<TestRecord>[] = [
        {
          record1: {
            firstName: 'John',
            lastName: 'Smith',
            email: 'john@example.com',
          },
          record2: {
            firstName: 'John',
            lastName: 'Smith',
            email: 'john@example.com',
          },
        },
        {
          record1: {
            firstName: 'Jane',
            lastName: 'Doe',
            email: 'jane@example.com',
          },
          record2: {
            firstName: 'Jane',
            lastName: 'Doe',
            email: 'jane@example.com',
          },
        },
      ]

      const featureVectors = pairs.map((p) => classifier.extractFeatures(p))
      const predictions = classifier.predictBatchFromFeatures(featureVectors)

      expect(predictions.length).toBe(2)
      expect(predictions[0].probability).toBeDefined()
      expect(predictions[1].probability).toBeDefined()
    })
  })

  describe('loadWeights', () => {
    it('should load valid weights', async () => {
      const featureNames = featureExtractor.getFeatureNames()
      const weights: MLModelWeights = {
        modelType: 'SimpleClassifier',
        version: '1.0.0',
        weights: Array(featureNames.length).fill(0.5),
        bias: 0.1,
        featureNames,
      }

      await classifier.loadWeights(weights)

      expect(classifier.isReady()).toBe(true)
      expect(classifier.getWeights()).toEqual(weights.weights)
      expect(classifier.getBias()).toBe(weights.bias)
    })

    it('should load weights with extra metadata', async () => {
      const featureNames = featureExtractor.getFeatureNames()
      const trainedAt = new Date().toISOString()
      const weights: MLModelWeights = {
        modelType: 'SimpleClassifier',
        version: '2.0.0',
        weights: Array(featureNames.length).fill(0.5),
        bias: 0.1,
        featureNames,
        extra: {
          trainedAt,
          accuracy: 0.95,
          trainingExamples: 1000,
        },
      }

      await classifier.loadWeights(weights)

      const metadata = classifier.getMetadata()
      expect(metadata.version).toBe('2.0.0')
      expect(metadata.accuracy).toBe(0.95)
      expect(metadata.trainingExamples).toBe(1000)
      expect(metadata.trainedAt).toBeDefined()
    })

    it('should throw for invalid model type', async () => {
      const weights: MLModelWeights = {
        modelType: 'OtherModel',
        version: '1.0.0',
        weights: [0.5],
        bias: 0.1,
        featureNames: ['f1'],
      }

      await expect(classifier.loadWeights(weights)).rejects.toThrow(
        /Invalid model type/
      )
    })

    it('should throw for empty weights', async () => {
      const weights: MLModelWeights = {
        modelType: 'SimpleClassifier',
        version: '1.0.0',
        weights: [],
        bias: 0.1,
        featureNames: [],
      }

      await expect(classifier.loadWeights(weights)).rejects.toThrow(
        /non-empty array/
      )
    })

    it('should throw for NaN weights', async () => {
      const weights: MLModelWeights = {
        modelType: 'SimpleClassifier',
        version: '1.0.0',
        weights: [0.5, NaN],
        bias: 0.1,
        featureNames: ['f1', 'f2'],
      }

      await expect(classifier.loadWeights(weights)).rejects.toThrow(
        /valid numbers/
      )
    })

    it('should throw for NaN bias', async () => {
      const weights: MLModelWeights = {
        modelType: 'SimpleClassifier',
        version: '1.0.0',
        weights: [0.5],
        bias: NaN,
        featureNames: ['f1'],
      }

      await expect(classifier.loadWeights(weights)).rejects.toThrow(
        /valid number/
      )
    })

    it('should throw for mismatched feature names and weights', async () => {
      const weights: MLModelWeights = {
        modelType: 'SimpleClassifier',
        version: '1.0.0',
        weights: [0.5, 0.5],
        bias: 0.1,
        featureNames: ['f1'],
      }

      await expect(classifier.loadWeights(weights)).rejects.toThrow(
        /must match weights length/
      )
    })

    it('should throw for mismatched feature extractor feature count', async () => {
      const weights: MLModelWeights = {
        modelType: 'SimpleClassifier',
        version: '1.0.0',
        weights: [0.5, 0.5],
        bias: 0.1,
        featureNames: ['f1', 'f2'],
      }

      await expect(classifier.loadWeights(weights)).rejects.toThrow(
        /must match feature extractor/
      )
    })
  })

  describe('exportWeights', () => {
    it('should export weights', async () => {
      const featureNames = featureExtractor.getFeatureNames()
      const inputWeights: MLModelWeights = {
        modelType: 'SimpleClassifier',
        version: '1.0.0',
        weights: Array(featureNames.length).fill(0.5),
        bias: 0.1,
        featureNames,
      }

      await classifier.loadWeights(inputWeights)

      const exported = classifier.exportWeights()

      expect(exported.modelType).toBe('SimpleClassifier')
      expect(exported.weights).toEqual(inputWeights.weights)
      expect(exported.bias).toBe(inputWeights.bias)
      expect(exported.featureNames).toEqual(inputWeights.featureNames)
    })

    it('should throw if model not ready', () => {
      expect(() => classifier.exportWeights()).toThrow(/Model not ready/)
    })
  })

  describe('getFeatureImportance', () => {
    it('should return sorted feature importance', async () => {
      const featureNames = featureExtractor.getFeatureNames()
      const weights = featureNames.map((_, i) => (i + 1) * 0.1)
      const inputWeights: MLModelWeights = {
        modelType: 'SimpleClassifier',
        version: '1.0.0',
        weights,
        bias: 0.1,
        featureNames,
      }

      await classifier.loadWeights(inputWeights)

      const importance = classifier.getFeatureImportance()

      expect(importance.length).toBe(featureNames.length)
      // Should be sorted by importance descending
      for (let i = 1; i < importance.length; i++) {
        expect(importance[i - 1].importance).toBeGreaterThanOrEqual(
          importance[i].importance
        )
      }
    })

    it('should throw if model not ready', () => {
      expect(() => classifier.getFeatureImportance()).toThrow(/Model not ready/)
    })
  })

  describe('initializeWeights', () => {
    it('should initialize weights with random values', () => {
      const featureCount = 10
      classifier.initializeWeights(featureCount)

      const weights = classifier.getWeights()
      expect(weights.length).toBe(featureCount)
      expect(classifier.getBias()).toBeDefined()
      expect(classifier.isReady()).toBe(false) // Not ready until trained
    })

    it('should produce reproducible results with seed', () => {
      const featureCount = 10
      const c1 = new SimpleClassifier()
      const c2 = new SimpleClassifier()

      c1.initializeWeights(featureCount, 42)
      c2.initializeWeights(featureCount, 42)

      expect(c1.getWeights()).toEqual(c2.getWeights())
      expect(c1.getBias()).toBe(c2.getBias())
    })

    it('should produce different results with different seeds', () => {
      const featureCount = 10
      const c1 = new SimpleClassifier()
      const c2 = new SimpleClassifier()

      c1.initializeWeights(featureCount, 42)
      c2.initializeWeights(featureCount, 123)

      expect(c1.getWeights()).not.toEqual(c2.getWeights())
    })
  })

  describe('updateWeights', () => {
    it('should update weights based on gradients', () => {
      classifier.initializeWeights(featureExtractor.getFeatureCount())
      const initialWeights = classifier.getWeights()
      const initialBias = classifier.getBias()

      const gradients = initialWeights.map(() => 0.1)
      const biasGradient = 0.1
      const learningRate = 0.01

      classifier.updateWeights(gradients, biasGradient, learningRate)

      const updatedWeights = classifier.getWeights()
      const updatedBias = classifier.getBias()

      // Weights should decrease (w = w - lr * gradient)
      for (let i = 0; i < initialWeights.length; i++) {
        expect(updatedWeights[i]).toBeCloseTo(
          initialWeights[i] - learningRate * gradients[i]
        )
      }
      expect(updatedBias).toBeCloseTo(initialBias - learningRate * biasGradient)
    })

    it('should throw for mismatched gradient length', () => {
      classifier.initializeWeights(featureExtractor.getFeatureCount())

      expect(() => classifier.updateWeights([0.1, 0.2], 0.1, 0.01)).toThrow(
        /must match weights length/
      )
    })
  })

  describe('markAsReady', () => {
    it('should mark model as ready after initialization', () => {
      classifier.initializeWeights(featureExtractor.getFeatureCount())
      expect(classifier.isReady()).toBe(false)

      classifier.markAsReady()
      expect(classifier.isReady()).toBe(true)
    })

    it('should throw if no weights set', () => {
      expect(() => classifier.markAsReady()).toThrow(/no weights set/)
    })
  })

  describe('getFeatureCount', () => {
    it('should return feature extractor feature count', () => {
      expect(classifier.getFeatureCount()).toBe(
        featureExtractor.getFeatureCount()
      )
    })

    it('should return weights length if no feature extractor', async () => {
      const c = new SimpleClassifier()
      const weights: MLModelWeights = {
        modelType: 'SimpleClassifier',
        version: '1.0.0',
        weights: [0.5, 0.5, 0.5],
        bias: 0.1,
        featureNames: ['f1', 'f2', 'f3'],
      }

      await c.loadWeights(weights)
      expect(c.getFeatureCount()).toBe(3)
    })
  })

  describe('clone', () => {
    it('should create a copy with same configuration', () => {
      const featureCount = featureExtractor.getFeatureCount()
      const weights = Array(featureCount).fill(0.5)
      classifier.setWeightsAndBias(weights, 0.1)

      const cloned = classifier.clone()

      expect(cloned.getConfig()).toEqual(classifier.getConfig())
      expect(cloned.getWeights()).toEqual(classifier.getWeights())
      expect(cloned.getBias()).toBe(classifier.getBias())
      expect(cloned.isReady()).toBe(classifier.isReady())
    })

    it('should create independent copy', () => {
      const featureCount = featureExtractor.getFeatureCount()
      const weights = Array(featureCount).fill(0.5)
      classifier.setWeightsAndBias(weights, 0.1)

      const cloned = classifier.clone()

      // Modify original
      classifier.setConfig({ matchThreshold: 0.9 })

      // Clone should be unaffected
      expect(cloned.getConfig().matchThreshold).not.toBe(0.9)
    })
  })

  describe('classification thresholds', () => {
    beforeEach(() => {
      classifier.setConfig({
        matchThreshold: 0.7,
        nonMatchThreshold: 0.3,
      })
    })

    it('should classify as match above match threshold', async () => {
      // Set up weights to produce high probability
      const featureCount = featureExtractor.getFeatureCount()
      const weights = Array(featureCount).fill(0.5)
      classifier.setWeightsAndBias(weights, 2) // High bias for high probability

      const pair: RecordPair<TestRecord> = {
        record1: {
          firstName: 'John',
          lastName: 'Smith',
          email: 'john@example.com',
        },
        record2: {
          firstName: 'John',
          lastName: 'Smith',
          email: 'john@example.com',
        },
      }

      const prediction = await classifier.predict(pair)
      expect(prediction.classification).toBe('match')
    })

    it('should classify as nonMatch below nonMatch threshold', async () => {
      // Set up weights to produce low probability
      const featureCount = featureExtractor.getFeatureCount()
      const weights = Array(featureCount).fill(0.5)
      classifier.setWeightsAndBias(weights, -10) // Low bias for low probability

      const pair: RecordPair<TestRecord> = {
        record1: {
          firstName: 'John',
          lastName: 'Smith',
          email: 'john@example.com',
        },
        record2: {
          firstName: 'Jane',
          lastName: 'Doe',
          email: 'jane@different.com',
        },
      }

      const prediction = await classifier.predict(pair)
      expect(prediction.classification).toBe('nonMatch')
    })

    it('should classify as uncertain between thresholds', async () => {
      // Set up weights to produce medium probability
      const featureCount = featureExtractor.getFeatureCount()
      const weights = Array(featureCount).fill(0.1)
      classifier.setWeightsAndBias(weights, 0) // Balanced for ~0.5 probability

      const pair: RecordPair<TestRecord> = {
        record1: {
          firstName: 'John',
          lastName: 'Smith',
          email: 'john@example.com',
        },
        record2: {
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@different.com',
        },
      }

      const prediction = await classifier.predict(pair)
      // Check it's in uncertain range
      expect(prediction.probability).toBeGreaterThanOrEqual(0.3)
      expect(prediction.probability).toBeLessThanOrEqual(0.7)
      expect(prediction.classification).toBe('uncertain')
    })
  })

  describe('sigmoid function behavior', () => {
    it('should handle extreme positive values', async () => {
      const featureCount = featureExtractor.getFeatureCount()
      const weights = Array(featureCount).fill(100) // Very high weights
      classifier.setWeightsAndBias(weights, 100)

      const pair: RecordPair<TestRecord> = {
        record1: {
          firstName: 'John',
          lastName: 'Smith',
          email: 'john@example.com',
        },
        record2: {
          firstName: 'John',
          lastName: 'Smith',
          email: 'john@example.com',
        },
      }

      const prediction = await classifier.predict(pair)
      expect(prediction.probability).toBeCloseTo(1, 5)
      expect(isFinite(prediction.probability)).toBe(true)
    })

    it('should handle extreme negative values', async () => {
      const featureCount = featureExtractor.getFeatureCount()
      const weights = Array(featureCount).fill(-100) // Very negative weights
      classifier.setWeightsAndBias(weights, -100)

      const pair: RecordPair<TestRecord> = {
        record1: {
          firstName: 'John',
          lastName: 'Smith',
          email: 'john@example.com',
        },
        record2: {
          firstName: 'John',
          lastName: 'Smith',
          email: 'john@example.com',
        },
      }

      const prediction = await classifier.predict(pair)
      expect(prediction.probability).toBeCloseTo(0, 5)
      expect(isFinite(prediction.probability)).toBe(true)
    })
  })
})

describe('createPersonMatchingClassifier', () => {
  it('should create classifier with person matching features', () => {
    const classifier = createPersonMatchingClassifier<TestRecord>()
    expect(classifier.getMetadata().name).toBe('SimpleClassifier')
    expect(classifier.getMetadata().featureNames.length).toBeGreaterThan(0)
    expect(
      classifier.getMetadata().featureNames.some((n) => n.includes('firstName'))
    ).toBe(true)
    expect(
      classifier.getMetadata().featureNames.some((n) => n.includes('lastName'))
    ).toBe(true)
    expect(
      classifier.getMetadata().featureNames.some((n) => n.includes('email'))
    ).toBe(true)
  })
})

describe('createClassifierFromFields', () => {
  it('should create classifier from field list', () => {
    const classifier = createClassifierFromFields<TestRecord>([
      'firstName',
      'lastName',
      'email',
    ])
    expect(classifier.getMetadata().featureNames.length).toBeGreaterThan(0)
    expect(
      classifier.getMetadata().featureNames.some((n) => n.includes('firstName'))
    ).toBe(true)
    expect(
      classifier.getMetadata().featureNames.some((n) => n.includes('lastName'))
    ).toBe(true)
    expect(
      classifier.getMetadata().featureNames.some((n) => n.includes('email'))
    ).toBe(true)
  })
})

describe('isValidSimpleClassifierWeights', () => {
  it('should return true for valid weights', () => {
    const weights: MLModelWeights = {
      modelType: 'SimpleClassifier',
      version: '1.0.0',
      weights: [0.5, 0.3],
      bias: 0.1,
      featureNames: ['f1', 'f2'],
    }

    expect(isValidSimpleClassifierWeights(weights)).toBe(true)
  })

  it('should return false for wrong model type', () => {
    const weights = {
      modelType: 'OtherModel',
      version: '1.0.0',
      weights: [0.5],
      bias: 0.1,
      featureNames: ['f1'],
    }

    expect(isValidSimpleClassifierWeights(weights)).toBe(false)
  })

  it('should return false for null', () => {
    expect(isValidSimpleClassifierWeights(null)).toBe(false)
  })

  it('should return false for non-object', () => {
    expect(isValidSimpleClassifierWeights('string')).toBe(false)
  })

  it('should return false for NaN weights', () => {
    const weights = {
      modelType: 'SimpleClassifier',
      version: '1.0.0',
      weights: [0.5, NaN],
      bias: 0.1,
      featureNames: ['f1', 'f2'],
    }

    expect(isValidSimpleClassifierWeights(weights)).toBe(false)
  })

  it('should return false for NaN bias', () => {
    const weights = {
      modelType: 'SimpleClassifier',
      version: '1.0.0',
      weights: [0.5],
      bias: NaN,
      featureNames: ['f1'],
    }

    expect(isValidSimpleClassifierWeights(weights)).toBe(false)
  })

  it('should return false for mismatched lengths', () => {
    const weights = {
      modelType: 'SimpleClassifier',
      version: '1.0.0',
      weights: [0.5, 0.3],
      bias: 0.1,
      featureNames: ['f1'], // Only one name but two weights
    }

    expect(isValidSimpleClassifierWeights(weights)).toBe(false)
  })

  it('should return false for non-string feature names', () => {
    const weights = {
      modelType: 'SimpleClassifier',
      version: '1.0.0',
      weights: [0.5],
      bias: 0.1,
      featureNames: [123], // Not a string
    }

    expect(isValidSimpleClassifierWeights(weights)).toBe(false)
  })

  it('should return false for non-array weights', () => {
    const weights = {
      modelType: 'SimpleClassifier',
      version: '1.0.0',
      weights: 'not an array',
      bias: 0.1,
      featureNames: ['f1'],
    }

    expect(isValidSimpleClassifierWeights(weights)).toBe(false)
  })
})
