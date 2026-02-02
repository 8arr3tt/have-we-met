import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  MLMatchIntegrator,
  createMLIntegrator,
  isMLMatchResult,
  type MLMatchResult,
} from '../../../../src/ml/integration/resolver-integration'
import type {
  MLModel,
  MLPrediction,
  RecordPair,
  FeatureVector,
  MLModelConfig,
  ModelMetadata,
} from '../../../../src/ml/types'
import {
  DEFAULT_ML_MODEL_CONFIG,
  DEFAULT_ML_INTEGRATION_CONFIG,
} from '../../../../src/ml/types'
import type {
  MatchResult,
  MatchScore,
} from '../../../../src/core/scoring/types'
import type { MLModelWeights } from '../../../../src/ml/model-interface'

// Mock ML Model for testing
class MockMLModel<T> implements MLModel<T> {
  private config: MLModelConfig = { ...DEFAULT_ML_MODEL_CONFIG }
  private metadata: ModelMetadata = {
    name: 'MockModel',
    version: '1.0.0',
    featureNames: ['f1', 'f2', 'f3'],
  }
  private ready = true
  public predictFn: (pair: RecordPair<T>) => Promise<MLPrediction> =
    async () => ({
      probability: 0.8,
      classification: 'match',
      confidence: 0.9,
      features: { values: [0.9, 0.8, 0.7], names: ['f1', 'f2', 'f3'] },
      featureImportance: [
        { name: 'f1', value: 0.9, contribution: 0.3, importance: 0.3 },
        { name: 'f2', value: 0.8, contribution: 0.2, importance: 0.2 },
        { name: 'f3', value: 0.7, contribution: 0.1, importance: 0.1 },
      ],
    })

  getMetadata(): ModelMetadata {
    return this.metadata
  }

  getConfig(): MLModelConfig {
    return this.config
  }

  setConfig(config: Partial<MLModelConfig>): void {
    this.config = { ...this.config, ...config }
  }

  async predict(pair: RecordPair<T>): Promise<MLPrediction> {
    return this.predictFn(pair)
  }

  async predictBatch(
    pairs: RecordPair<T>[]
  ): Promise<Array<{ pair: RecordPair<T>; prediction: MLPrediction }>> {
    const results = []
    for (const pair of pairs) {
      results.push({ pair, prediction: await this.predict(pair) })
    }
    return results
  }

  extractFeatures(pair: RecordPair<T>): FeatureVector {
    return { values: [0.9, 0.8, 0.7], names: ['f1', 'f2', 'f3'] }
  }

  isReady(): boolean {
    return this.ready
  }

  setReady(ready: boolean): void {
    this.ready = ready
  }

  async loadWeights(weights: MLModelWeights): Promise<void> {
    // Mock implementation
  }

  exportWeights(): MLModelWeights {
    return {
      modelType: 'MockModel',
      version: '1.0.0',
      weights: [0.1, 0.2, 0.3],
      bias: 0.1,
      featureNames: ['f1', 'f2', 'f3'],
    }
  }
}

// Helper to create a mock MatchResult
function createMockMatchResult<T>(
  record: T,
  score: number,
  outcome: 'no-match' | 'potential-match' | 'definite-match' = 'potential-match'
): MatchResult<T> {
  return {
    outcome,
    candidateRecord: record,
    score: {
      totalScore: score,
      maxPossibleScore: 100,
      normalizedScore: score / 100,
      fieldScores: [],
    },
    explanation: 'Test match result',
  }
}

describe('MLMatchIntegrator', () => {
  let model: MockMLModel<Record<string, unknown>>
  let integrator: MLMatchIntegrator<Record<string, unknown>>

  beforeEach(() => {
    model = new MockMLModel()
    integrator = new MLMatchIntegrator(model)
  })

  describe('constructor', () => {
    it('should create integrator with default config', () => {
      const config = integrator.getConfig()
      expect(config.mode).toBe(DEFAULT_ML_INTEGRATION_CONFIG.mode)
      expect(config.mlWeight).toBe(DEFAULT_ML_INTEGRATION_CONFIG.mlWeight)
      expect(config.applyTo).toBe(DEFAULT_ML_INTEGRATION_CONFIG.applyTo)
      expect(config.timeoutMs).toBe(DEFAULT_ML_INTEGRATION_CONFIG.timeoutMs)
      expect(config.fallbackOnError).toBe(
        DEFAULT_ML_INTEGRATION_CONFIG.fallbackOnError
      )
    })

    it('should create integrator with custom config', () => {
      const customIntegrator = new MLMatchIntegrator(model, {
        mode: 'mlOnly',
        mlWeight: 0.7,
      })
      const config = customIntegrator.getConfig()
      expect(config.mode).toBe('mlOnly')
      expect(config.mlWeight).toBe(0.7)
    })
  })

  describe('getConfig/setConfig', () => {
    it('should get current configuration', () => {
      const config = integrator.getConfig()
      expect(config).toHaveProperty('mode')
      expect(config).toHaveProperty('mlWeight')
    })

    it('should update configuration', () => {
      integrator.setConfig({ mlWeight: 0.8 })
      expect(integrator.getConfig().mlWeight).toBe(0.8)
    })
  })

  describe('getModel', () => {
    it('should return the model', () => {
      expect(integrator.getModel()).toBe(model)
    })
  })

  describe('isReady', () => {
    it('should return true when model is ready', () => {
      expect(integrator.isReady()).toBe(true)
    })

    it('should return false when model is not ready', () => {
      model.setReady(false)
      expect(integrator.isReady()).toBe(false)
    })
  })

  describe('enhanceMatchResult', () => {
    const candidateRecord = { firstName: 'John', lastName: 'Doe' }
    const existingRecord = { firstName: 'John', lastName: 'Smith' }

    it('should enhance match result with ML prediction in hybrid mode', async () => {
      integrator.setConfig({ mode: 'hybrid', mlWeight: 0.5 })
      const probabilisticResult = createMockMatchResult(existingRecord, 50)

      const result = await integrator.enhanceMatchResult(
        candidateRecord,
        existingRecord,
        probabilisticResult
      )

      expect(result.mlUsed).toBe(true)
      expect(result.mlPrediction).toBeDefined()
      expect(result.mlPrediction?.probability).toBe(0.8)
      expect(result.mlScoreContribution).toBeDefined()
      expect(result.probabilisticScoreContribution).toBeDefined()
    })

    it('should use ML-only mode when configured', async () => {
      integrator.setConfig({ mode: 'mlOnly' })
      const probabilisticResult = createMockMatchResult(existingRecord, 30)

      const result = await integrator.enhanceMatchResult(
        candidateRecord,
        existingRecord,
        probabilisticResult
      )

      expect(result.mlUsed).toBe(true)
      expect(result.mlPrediction).toBeDefined()
      // In ML-only mode, score should be based on ML probability
      expect(result.score.normalizedScore).toBeCloseTo(0.8, 1)
    })

    it('should skip ML when skipML option is true', async () => {
      const probabilisticResult = createMockMatchResult(existingRecord, 50)

      const result = await integrator.enhanceMatchResult(
        candidateRecord,
        existingRecord,
        probabilisticResult,
        { skipML: true }
      )

      expect(result.mlUsed).toBe(false)
      expect(result.mlPrediction).toBeUndefined()
    })

    it('should skip ML when model is not ready', async () => {
      model.setReady(false)
      const probabilisticResult = createMockMatchResult(existingRecord, 50)

      const result = await integrator.enhanceMatchResult(
        candidateRecord,
        existingRecord,
        probabilisticResult
      )

      expect(result.mlUsed).toBe(false)
    })

    it('should only apply ML to uncertain cases when applyTo is uncertainOnly', async () => {
      integrator.setConfig({ applyTo: 'uncertainOnly' })

      // Definite match should not use ML
      const definiteResult = createMockMatchResult(
        existingRecord,
        80,
        'definite-match'
      )
      const result1 = await integrator.enhanceMatchResult(
        candidateRecord,
        existingRecord,
        definiteResult
      )
      expect(result1.mlUsed).toBe(false)

      // Potential match should use ML
      const potentialResult = createMockMatchResult(
        existingRecord,
        50,
        'potential-match'
      )
      const result2 = await integrator.enhanceMatchResult(
        candidateRecord,
        existingRecord,
        potentialResult
      )
      expect(result2.mlUsed).toBe(true)
    })

    it('should handle ML timeout gracefully when fallbackOnError is true', async () => {
      model.predictFn = async () => {
        await new Promise((resolve) => setTimeout(resolve, 100))
        return {
          probability: 0.8,
          classification: 'match',
          confidence: 0.9,
          features: { values: [], names: [] },
          featureImportance: [],
        }
      }

      integrator.setConfig({ timeoutMs: 10, fallbackOnError: true })
      const probabilisticResult = createMockMatchResult(existingRecord, 50)

      const result = await integrator.enhanceMatchResult(
        candidateRecord,
        existingRecord,
        probabilisticResult
      )

      expect(result.mlUsed).toBe(false)
      expect(result.mlError).toContain('timed out')
    })

    it('should throw error when ML fails and fallbackOnError is false', async () => {
      model.predictFn = async () => {
        throw new Error('ML prediction failed')
      }

      integrator.setConfig({ fallbackOnError: false })
      const probabilisticResult = createMockMatchResult(existingRecord, 50)

      await expect(
        integrator.enhanceMatchResult(
          candidateRecord,
          existingRecord,
          probabilisticResult
        )
      ).rejects.toThrow('ML prediction failed')
    })

    it('should include ML prediction time', async () => {
      const probabilisticResult = createMockMatchResult(existingRecord, 50)

      const result = await integrator.enhanceMatchResult(
        candidateRecord,
        existingRecord,
        probabilisticResult
      )

      expect(result.mlPredictionTimeMs).toBeDefined()
      expect(result.mlPredictionTimeMs).toBeGreaterThanOrEqual(0)
    })
  })

  describe('enhanceMatchResults', () => {
    it('should enhance multiple match results', async () => {
      const candidateRecord = { firstName: 'John' }
      const existingRecords = [
        { firstName: 'John' },
        { firstName: 'Jane' },
        { firstName: 'Jon' },
      ]
      const probabilisticResults = existingRecords.map((r, i) =>
        createMockMatchResult(r, 30 + i * 20)
      )

      const results = await integrator.enhanceMatchResults(
        candidateRecord,
        existingRecords,
        probabilisticResults
      )

      expect(results).toHaveLength(3)
      expect(results.every((r) => r.mlUsed)).toBe(true)
    })

    it('should skip all ML when skipML is true', async () => {
      const candidateRecord = { firstName: 'John' }
      const existingRecords = [{ firstName: 'John' }]
      const probabilisticResults = [
        createMockMatchResult(existingRecords[0], 50),
      ]

      const results = await integrator.enhanceMatchResults(
        candidateRecord,
        existingRecords,
        probabilisticResults,
        { skipML: true }
      )

      expect(results.every((r) => !r.mlUsed)).toBe(true)
    })

    it('should re-sort results by combined score', async () => {
      const candidateRecord = { firstName: 'John' }
      const existingRecords = [{ firstName: 'Alice' }, { firstName: 'John' }]

      // First record has higher probabilistic score but ML will boost the second
      const probabilisticResults = [
        createMockMatchResult(existingRecords[0], 70),
        createMockMatchResult(existingRecords[1], 40),
      ]

      // Configure ML to return high probability for second record
      let callCount = 0
      model.predictFn = async () => {
        callCount++
        return {
          probability: callCount === 2 ? 0.95 : 0.3,
          classification: callCount === 2 ? 'match' : 'nonMatch',
          confidence: 0.9,
          features: { values: [], names: [] },
          featureImportance: [],
        }
      }

      integrator.setConfig({ mode: 'hybrid', mlWeight: 0.6 })

      const results = await integrator.enhanceMatchResults(
        candidateRecord,
        existingRecords,
        probabilisticResults
      )

      // Results should be re-sorted by combined score
      expect(results[0].score.totalScore).toBeGreaterThanOrEqual(
        results[1].score.totalScore
      )
    })
  })

  describe('enhanceMatchResultsBatch', () => {
    it('should return results with statistics', async () => {
      const candidateRecord = { firstName: 'John' }
      const existingRecords = [{ firstName: 'John' }, { firstName: 'Jane' }]
      const probabilisticResults = existingRecords.map((r, i) =>
        createMockMatchResult(r, 50 + i * 10)
      )

      const { results, stats } = await integrator.enhanceMatchResultsBatch(
        candidateRecord,
        existingRecords,
        probabilisticResults
      )

      expect(results).toHaveLength(2)
      expect(stats.totalMatches).toBe(2)
      expect(stats.mlUsedCount).toBeGreaterThan(0)
      expect(stats.totalMLPredictionTimeMs).toBeGreaterThanOrEqual(0)
    })

    it('should batch predict for efficiency', async () => {
      let batchPredictCalled = false
      const originalPredictBatch = model.predictBatch.bind(model)
      model.predictBatch = async (pairs) => {
        batchPredictCalled = true
        return originalPredictBatch(pairs)
      }

      const candidateRecord = { firstName: 'John' }
      const existingRecords = [{ firstName: 'John' }, { firstName: 'Jane' }]
      const probabilisticResults = existingRecords.map((r) =>
        createMockMatchResult(r, 50)
      )

      await integrator.enhanceMatchResultsBatch(
        candidateRecord,
        existingRecords,
        probabilisticResults
      )

      expect(batchPredictCalled).toBe(true)
    })
  })

  describe('matchWithMLOnly', () => {
    it('should match using only ML prediction', async () => {
      const candidateRecord = { firstName: 'John' }
      const existingRecord = { firstName: 'Jon' }
      const thresholds = { noMatch: 30, definiteMatch: 70 }

      const result = await integrator.matchWithMLOnly(
        candidateRecord,
        existingRecord,
        thresholds
      )

      expect(result.mlUsed).toBe(true)
      expect(result.mlPrediction).toBeDefined()
      expect(result.score.totalScore).toBe(80) // 0.8 * 100
    })

    it('should classify outcome based on ML probability and thresholds', async () => {
      model.predictFn = async () => ({
        probability: 0.9,
        classification: 'match',
        confidence: 0.95,
        features: { values: [], names: [] },
        featureImportance: [],
      })

      const result = await integrator.matchWithMLOnly(
        { firstName: 'John' },
        { firstName: 'John' },
        { noMatch: 30, definiteMatch: 70 }
      )

      expect(result.outcome).toBe('definite-match')
    })

    it('should include ML explanation', async () => {
      const result = await integrator.matchWithMLOnly(
        { firstName: 'John' },
        { firstName: 'Jon' },
        { noMatch: 30, definiteMatch: 70 }
      )

      expect(result.explanation).toContain('ML prediction')
      expect(result.explanation).toContain('probability')
    })

    it('should throw error when ML prediction fails', async () => {
      model.predictFn = async () => {
        throw new Error('Model error')
      }

      await expect(
        integrator.matchWithMLOnly(
          { firstName: 'John' },
          { firstName: 'Jon' },
          { noMatch: 30, definiteMatch: 70 }
        )
      ).rejects.toThrow('ML prediction failed')
    })
  })

  describe('extractFeatures', () => {
    it('should extract features from a record pair', () => {
      const features = integrator.extractFeatures(
        { firstName: 'John' },
        { firstName: 'Jon' }
      )

      expect(features.values).toBeDefined()
      expect(features.names).toBeDefined()
      expect(features.values.length).toBe(features.names.length)
    })
  })

  describe('fallback mode', () => {
    it('should only use ML for potential matches in fallback mode', async () => {
      integrator.setConfig({ mode: 'fallback' })

      // Test with definite match - should not use ML for scoring
      const definiteResult = createMockMatchResult(
        { firstName: 'John' },
        80,
        'definite-match'
      )

      const result1 = await integrator.enhanceMatchResult(
        { firstName: 'John' },
        { firstName: 'John' },
        definiteResult
      )

      expect(result1.mlUsed).toBe(false)
      expect(result1.mlPrediction).toBeDefined() // Prediction still included for reference

      // Test with potential match - should use ML
      const potentialResult = createMockMatchResult(
        { firstName: 'John' },
        50,
        'potential-match'
      )

      const result2 = await integrator.enhanceMatchResult(
        { firstName: 'John' },
        { firstName: 'Jon' },
        potentialResult
      )

      expect(result2.mlUsed).toBe(true)
    })
  })
})

describe('createMLIntegrator', () => {
  it('should create an MLMatchIntegrator', () => {
    const model = new MockMLModel()
    const integrator = createMLIntegrator(model)

    expect(integrator).toBeInstanceOf(MLMatchIntegrator)
    expect(integrator.getModel()).toBe(model)
  })

  it('should accept custom configuration', () => {
    const model = new MockMLModel()
    const integrator = createMLIntegrator(model, { mlWeight: 0.7 })

    expect(integrator.getConfig().mlWeight).toBe(0.7)
  })
})

describe('isMLMatchResult', () => {
  it('should return true for MLMatchResult', () => {
    const mlResult: MLMatchResult = {
      outcome: 'potential-match',
      candidateRecord: {},
      score: {
        totalScore: 50,
        maxPossibleScore: 100,
        normalizedScore: 0.5,
        fieldScores: [],
      },
      explanation: 'Test',
      mlUsed: true,
    }

    expect(isMLMatchResult(mlResult)).toBe(true)
  })

  it('should return false for regular MatchResult', () => {
    const result: MatchResult = {
      outcome: 'potential-match',
      candidateRecord: {},
      score: {
        totalScore: 50,
        maxPossibleScore: 100,
        normalizedScore: 0.5,
        fieldScores: [],
      },
      explanation: 'Test',
    }

    expect(isMLMatchResult(result)).toBe(false)
  })
})

describe('Hybrid Mode Score Calculation', () => {
  it('should correctly blend probabilistic and ML scores', async () => {
    const model = new MockMLModel()
    model.predictFn = async () => ({
      probability: 0.6, // 60% match probability
      classification: 'uncertain',
      confidence: 0.5,
      features: { values: [], names: [] },
      featureImportance: [],
    })

    const integrator = new MLMatchIntegrator(model, {
      mode: 'hybrid',
      mlWeight: 0.4, // 40% ML, 60% probabilistic
    })

    const probabilisticResult = createMockMatchResult({ id: 1 }, 50)

    const result = await integrator.enhanceMatchResult(
      { id: 1 },
      { id: 2 },
      probabilisticResult
    )

    // Expected: 0.6 * 50 (prob) + 0.4 * 60 (ML, scaled to 100) = 30 + 24 = 54
    expect(result.mlScoreContribution).toBeCloseTo(24, 1) // 0.4 * 60
    expect(result.probabilisticScoreContribution).toBeCloseTo(30, 1) // 0.6 * 50
    expect(result.score.totalScore).toBeCloseTo(54, 1)
  })
})
