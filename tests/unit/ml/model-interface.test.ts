import { describe, it, expect } from 'vitest'
import {
  BaseMLModel,
  type MLModel,
  type MLModelWeights,
} from '../../../src/ml/model-interface'
import type {
  MLPrediction,
  MLModelConfig,
  ModelMetadata,
  RecordPair,
  FeatureVector,
} from '../../../src/ml/types'
import { DEFAULT_ML_MODEL_CONFIG } from '../../../src/ml/types'

// Concrete implementation for testing
class TestMLModel extends BaseMLModel<{ name: string }> {
  private weights: number[] = []
  private bias: number = 0

  constructor(config?: Partial<MLModelConfig>) {
    super(
      {
        name: 'test-model',
        version: '1.0.0',
        featureNames: ['nameSimilarity'],
      },
      { ...DEFAULT_ML_MODEL_CONFIG, ...config }
    )
  }

  async predict(pair: RecordPair<{ name: string }>): Promise<MLPrediction> {
    const features = this.extractFeatures(pair)
    const probability = this.computeProbability(features)
    const classification = this.classify(probability)
    const confidence = this.calculateConfidence(probability)

    return {
      probability,
      classification,
      confidence,
      features,
      featureImportance: [],
    }
  }

  extractFeatures(pair: RecordPair<{ name: string }>): FeatureVector {
    const name1 = pair.record1.name.toLowerCase()
    const name2 = pair.record2.name.toLowerCase()
    const similarity = name1 === name2 ? 1 : 0.5

    return {
      values: [similarity],
      names: ['nameSimilarity'],
    }
  }

  async loadWeights(weights: MLModelWeights): Promise<void> {
    this.weights = weights.weights
    this.bias = weights.bias
    this.ready = true
  }

  exportWeights(): MLModelWeights {
    return {
      modelType: 'test',
      version: '1.0.0',
      weights: this.weights,
      bias: this.bias,
      featureNames: ['nameSimilarity'],
    }
  }

  private computeProbability(features: FeatureVector): number {
    if (this.weights.length === 0) {
      // Default behavior: use feature value directly
      return features.values[0]
    }
    // Linear combination
    let sum = this.bias
    for (let i = 0; i < features.values.length; i++) {
      sum += features.values[i] * (this.weights[i] || 0)
    }
    // Sigmoid
    return 1 / (1 + Math.exp(-sum))
  }
}

describe('MLModel Interface', () => {
  describe('BaseMLModel', () => {
    it('should create model with default config', () => {
      const model = new TestMLModel()
      const config = model.getConfig()

      expect(config.matchThreshold).toBe(0.7)
      expect(config.nonMatchThreshold).toBe(0.3)
      expect(config.includeFeatureImportance).toBe(true)
      expect(config.batchSize).toBe(100)
    })

    it('should create model with custom config', () => {
      const model = new TestMLModel({
        matchThreshold: 0.8,
        nonMatchThreshold: 0.2,
      })
      const config = model.getConfig()

      expect(config.matchThreshold).toBe(0.8)
      expect(config.nonMatchThreshold).toBe(0.2)
    })

    it('should return metadata', () => {
      const model = new TestMLModel()
      const metadata = model.getMetadata()

      expect(metadata.name).toBe('test-model')
      expect(metadata.version).toBe('1.0.0')
      expect(metadata.featureNames).toContain('nameSimilarity')
    })

    it('should update config', () => {
      const model = new TestMLModel()
      model.setConfig({ batchSize: 50 })

      expect(model.getConfig().batchSize).toBe(50)
      // Other values unchanged
      expect(model.getConfig().matchThreshold).toBe(0.7)
    })

    it('should report ready status', () => {
      const model = new TestMLModel()
      expect(model.isReady()).toBe(false)
    })
  })

  describe('predict', () => {
    it('should predict match for identical records', async () => {
      const model = new TestMLModel()
      const prediction = await model.predict({
        record1: { name: 'John' },
        record2: { name: 'John' },
      })

      expect(prediction.probability).toBe(1)
      expect(prediction.classification).toBe('match')
    })

    it('should predict uncertain for similar records', async () => {
      const model = new TestMLModel()
      const prediction = await model.predict({
        record1: { name: 'John' },
        record2: { name: 'Jon' },
      })

      expect(prediction.probability).toBe(0.5)
      expect(prediction.classification).toBe('uncertain')
    })

    it('should include features in prediction', async () => {
      const model = new TestMLModel()
      const prediction = await model.predict({
        record1: { name: 'John' },
        record2: { name: 'John' },
      })

      expect(prediction.features.values).toHaveLength(1)
      expect(prediction.features.names).toContain('nameSimilarity')
    })
  })

  describe('predictBatch', () => {
    it('should predict on multiple pairs', async () => {
      const model = new TestMLModel()
      const results = await model.predictBatch([
        { record1: { name: 'John' }, record2: { name: 'John' } },
        { record1: { name: 'Jane' }, record2: { name: 'Jane' } },
        { record1: { name: 'John' }, record2: { name: 'Jane' } },
      ])

      expect(results).toHaveLength(3)
      expect(results[0].prediction.classification).toBe('match')
      expect(results[1].prediction.classification).toBe('match')
      expect(results[2].prediction.classification).toBe('uncertain')
    })

    it('should preserve pair information', async () => {
      const model = new TestMLModel()
      const results = await model.predictBatch([
        { record1: { name: 'Alice' }, record2: { name: 'Bob' } },
      ])

      expect(results[0].pair.record1.name).toBe('Alice')
      expect(results[0].pair.record2.name).toBe('Bob')
    })

    it('should respect batch size', async () => {
      const model = new TestMLModel({ batchSize: 2 })
      const pairs = Array.from({ length: 5 }, (_, i) => ({
        record1: { name: `Person${i}` },
        record2: { name: `Person${i}` },
      }))

      const results = await model.predictBatch(pairs)
      expect(results).toHaveLength(5)
    })
  })

  describe('extractFeatures', () => {
    it('should extract features from pair', () => {
      const model = new TestMLModel()
      const features = model.extractFeatures({
        record1: { name: 'Test' },
        record2: { name: 'Test' },
      })

      expect(features.values).toHaveLength(1)
      expect(features.names).toHaveLength(1)
      expect(features.values[0]).toBe(1)
    })
  })

  describe('loadWeights and exportWeights', () => {
    it('should load and export weights', async () => {
      const model = new TestMLModel()
      const weights: MLModelWeights = {
        modelType: 'test',
        version: '1.0.0',
        weights: [0.8],
        bias: 0.1,
        featureNames: ['nameSimilarity'],
      }

      await model.loadWeights(weights)
      expect(model.isReady()).toBe(true)

      const exported = model.exportWeights()
      expect(exported.weights).toEqual([0.8])
      expect(exported.bias).toBe(0.1)
    })

    it('should affect predictions after loading weights', async () => {
      const model = new TestMLModel()

      // Before loading weights
      const beforePrediction = await model.predict({
        record1: { name: 'Test' },
        record2: { name: 'Test' },
      })

      // Load weights that will give different result
      await model.loadWeights({
        modelType: 'test',
        version: '1.0.0',
        weights: [2.0], // High weight
        bias: -1.0, // Negative bias
        featureNames: ['nameSimilarity'],
      })

      const afterPrediction = await model.predict({
        record1: { name: 'Test' },
        record2: { name: 'Test' },
      })

      // Predictions should differ due to weights
      expect(afterPrediction.probability).not.toBe(beforePrediction.probability)
    })
  })

  describe('classification thresholds', () => {
    it('should classify as match above matchThreshold', async () => {
      const model = new TestMLModel({ matchThreshold: 0.7 })
      const prediction = await model.predict({
        record1: { name: 'John' },
        record2: { name: 'John' },
      })

      expect(prediction.probability).toBeGreaterThanOrEqual(0.7)
      expect(prediction.classification).toBe('match')
    })

    it('should classify as nonMatch below nonMatchThreshold', async () => {
      const model = new TestMLModel({
        matchThreshold: 0.9,
        nonMatchThreshold: 0.6,
      })

      // Load weights that produce low probability
      await model.loadWeights({
        modelType: 'test',
        version: '1.0.0',
        weights: [-5],
        bias: 0,
        featureNames: ['nameSimilarity'],
      })

      const prediction = await model.predict({
        record1: { name: 'John' },
        record2: { name: 'Jane' },
      })

      expect(prediction.probability).toBeLessThanOrEqual(0.6)
      expect(prediction.classification).toBe('nonMatch')
    })

    it('should classify as uncertain between thresholds', async () => {
      const model = new TestMLModel({
        matchThreshold: 0.7,
        nonMatchThreshold: 0.3,
      })

      const prediction = await model.predict({
        record1: { name: 'John' },
        record2: { name: 'Jon' }, // Similar but not identical
      })

      expect(prediction.probability).toBeGreaterThan(0.3)
      expect(prediction.probability).toBeLessThan(0.7)
      expect(prediction.classification).toBe('uncertain')
    })
  })

  describe('confidence calculation', () => {
    it('should have high confidence for strong match', async () => {
      const model = new TestMLModel()
      const prediction = await model.predict({
        record1: { name: 'John' },
        record2: { name: 'John' },
      })

      expect(prediction.confidence).toBeGreaterThan(0.5)
    })

    it('should have lower confidence near thresholds', async () => {
      const model = new TestMLModel({
        matchThreshold: 0.6,
        nonMatchThreshold: 0.4,
      })

      // Create prediction right at threshold
      await model.loadWeights({
        modelType: 'test',
        version: '1.0.0',
        weights: [0.4],
        bias: 0,
        featureNames: ['nameSimilarity'],
      })

      const prediction = await model.predict({
        record1: { name: 'John' },
        record2: { name: 'John' },
      })

      // Near threshold, confidence should be lower
      expect(prediction.confidence).toBeLessThan(1)
    })
  })

  describe('metadata immutability', () => {
    it('should return copy of metadata', () => {
      const model = new TestMLModel()
      const metadata1 = model.getMetadata()
      const metadata2 = model.getMetadata()

      expect(metadata1).not.toBe(metadata2)
      expect(metadata1).toEqual(metadata2)
    })

    it('should return copy of config', () => {
      const model = new TestMLModel()
      const config1 = model.getConfig()
      const config2 = model.getConfig()

      expect(config1).not.toBe(config2)
      expect(config1).toEqual(config2)
    })

    it('should not allow external modification of config', () => {
      const model = new TestMLModel()
      const config = model.getConfig()
      config.batchSize = 999

      expect(model.getConfig().batchSize).toBe(100)
    })
  })
})

describe('MLModelWeights', () => {
  it('should have required fields', () => {
    const weights: MLModelWeights = {
      modelType: 'logistic-regression',
      version: '1.0.0',
      weights: [0.5, 0.3, 0.2],
      bias: 0.1,
      featureNames: ['f1', 'f2', 'f3'],
    }

    expect(weights.modelType).toBe('logistic-regression')
    expect(weights.weights).toHaveLength(3)
    expect(weights.featureNames).toHaveLength(3)
  })

  it('should support extra metadata', () => {
    const weights: MLModelWeights = {
      modelType: 'logistic-regression',
      version: '1.0.0',
      weights: [0.5],
      bias: 0,
      featureNames: ['f1'],
      extra: {
        trainedOn: 'synthetic-data',
        iterations: 1000,
      },
    }

    expect(weights.extra?.trainedOn).toBe('synthetic-data')
  })
})
