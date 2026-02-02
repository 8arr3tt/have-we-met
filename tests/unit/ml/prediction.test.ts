import { describe, it, expect } from 'vitest'
import {
  createPrediction,
  createFeatureVector,
  createFeatureImportance,
  calculateFeatureImportance,
  getTopFeatures,
  filterByClassification,
  filterByMinProbability,
  filterByMinConfidence,
  sortByProbability,
  sortByConfidence,
  calculatePredictionStats,
  formatPrediction,
  createLabeledPair,
  mergeFeatureVectors,
  normalizeFeatureVector,
  isValidPrediction,
  isValidFeatureVector,
} from '../../../src/ml/prediction'
import type {
  BatchMLPrediction,
  FeatureVector,
  MLPrediction,
} from '../../../src/ml/types'

describe('Prediction Utilities', () => {
  describe('createPrediction', () => {
    it('should create a valid prediction', () => {
      const features: FeatureVector = {
        values: [0.9, 0.8],
        names: ['f1', 'f2'],
      }
      const prediction = createPrediction(0.85, 'match', 0.7, features, [])

      expect(prediction.probability).toBe(0.85)
      expect(prediction.classification).toBe('match')
      expect(prediction.confidence).toBe(0.7)
      expect(prediction.features).toBe(features)
    })

    it('should work without feature importance', () => {
      const features: FeatureVector = { values: [0.5], names: ['f1'] }
      const prediction = createPrediction(0.5, 'uncertain', 0.3, features)

      expect(prediction.featureImportance).toEqual([])
    })
  })

  describe('createFeatureVector', () => {
    it('should create a valid feature vector', () => {
      const vector = createFeatureVector([0.9, 0.8, 0.7], ['f1', 'f2', 'f3'])

      expect(vector.values).toEqual([0.9, 0.8, 0.7])
      expect(vector.names).toEqual(['f1', 'f2', 'f3'])
    })

    it('should include metadata when provided', () => {
      const vector = createFeatureVector([0.5], ['score'], { normalized: true })

      expect(vector.metadata?.normalized).toBe(true)
    })

    it('should throw when lengths do not match', () => {
      expect(() => createFeatureVector([0.9, 0.8], ['f1'])).toThrow(
        'Feature values length (2) must match names length (1)'
      )
    })
  })

  describe('createFeatureImportance', () => {
    it('should create feature importance with positive contribution', () => {
      const importance = createFeatureImportance('emailMatch', 1.0, 0.5)

      expect(importance.name).toBe('emailMatch')
      expect(importance.value).toBe(1.0)
      expect(importance.contribution).toBe(0.5)
      expect(importance.importance).toBe(0.5)
    })

    it('should calculate absolute importance for negative contributions', () => {
      const importance = createFeatureImportance('cityMismatch', 0.0, -0.3)

      expect(importance.contribution).toBe(-0.3)
      expect(importance.importance).toBe(0.3)
    })
  })

  describe('calculateFeatureImportance', () => {
    it('should calculate importance from weights', () => {
      const vector: FeatureVector = {
        values: [1.0, 0.5, 0.0],
        names: ['f1', 'f2', 'f3'],
      }
      const weights = [0.5, 0.3, -0.2]

      const importance = calculateFeatureImportance(vector, weights)

      expect(importance).toHaveLength(3)
      // Should be sorted by absolute importance
      expect(importance[0].name).toBe('f1') // 1.0 * 0.5 = 0.5
      expect(importance[1].name).toBe('f2') // 0.5 * 0.3 = 0.15
    })

    it('should throw when lengths do not match', () => {
      const vector: FeatureVector = {
        values: [0.9, 0.8],
        names: ['f1', 'f2'],
      }
      const weights = [0.5]

      expect(() => calculateFeatureImportance(vector, weights)).toThrow(
        'Feature vector length (2) must match weights length (1)'
      )
    })
  })

  describe('getTopFeatures', () => {
    it('should return top N features', () => {
      const importance = [
        { name: 'f1', value: 1, contribution: 0.5, importance: 0.5 },
        { name: 'f2', value: 0.5, contribution: 0.3, importance: 0.3 },
        { name: 'f3', value: 0.2, contribution: 0.1, importance: 0.1 },
      ]

      const top2 = getTopFeatures(importance, 2)
      expect(top2).toHaveLength(2)
      expect(top2[0].name).toBe('f1')
      expect(top2[1].name).toBe('f2')
    })

    it('should handle N larger than array', () => {
      const importance = [
        { name: 'f1', value: 1, contribution: 0.5, importance: 0.5 },
      ]

      const top5 = getTopFeatures(importance, 5)
      expect(top5).toHaveLength(1)
    })
  })

  describe('filterByClassification', () => {
    const predictions: BatchMLPrediction<{ id: number }>[] = [
      {
        pair: { record1: { id: 1 }, record2: { id: 2 } },
        prediction: {
          probability: 0.9,
          classification: 'match',
          confidence: 0.8,
          features: { values: [], names: [] },
          featureImportance: [],
        },
      },
      {
        pair: { record1: { id: 3 }, record2: { id: 4 } },
        prediction: {
          probability: 0.5,
          classification: 'uncertain',
          confidence: 0.3,
          features: { values: [], names: [] },
          featureImportance: [],
        },
      },
      {
        pair: { record1: { id: 5 }, record2: { id: 6 } },
        prediction: {
          probability: 0.1,
          classification: 'nonMatch',
          confidence: 0.9,
          features: { values: [], names: [] },
          featureImportance: [],
        },
      },
    ]

    it('should filter by match', () => {
      const matches = filterByClassification(predictions, 'match')
      expect(matches).toHaveLength(1)
      expect(matches[0].pair.record1.id).toBe(1)
    })

    it('should filter by nonMatch', () => {
      const nonMatches = filterByClassification(predictions, 'nonMatch')
      expect(nonMatches).toHaveLength(1)
    })

    it('should filter by uncertain', () => {
      const uncertain = filterByClassification(predictions, 'uncertain')
      expect(uncertain).toHaveLength(1)
    })
  })

  describe('filterByMinProbability', () => {
    const predictions: BatchMLPrediction<{ id: number }>[] = [
      {
        pair: { record1: { id: 1 }, record2: { id: 2 } },
        prediction: {
          probability: 0.9,
          classification: 'match',
          confidence: 0.8,
          features: { values: [], names: [] },
          featureImportance: [],
        },
      },
      {
        pair: { record1: { id: 3 }, record2: { id: 4 } },
        prediction: {
          probability: 0.5,
          classification: 'uncertain',
          confidence: 0.3,
          features: { values: [], names: [] },
          featureImportance: [],
        },
      },
    ]

    it('should filter by minimum probability', () => {
      const filtered = filterByMinProbability(predictions, 0.7)
      expect(filtered).toHaveLength(1)
      expect(filtered[0].prediction.probability).toBe(0.9)
    })
  })

  describe('filterByMinConfidence', () => {
    const predictions: BatchMLPrediction<{ id: number }>[] = [
      {
        pair: { record1: { id: 1 }, record2: { id: 2 } },
        prediction: {
          probability: 0.9,
          classification: 'match',
          confidence: 0.8,
          features: { values: [], names: [] },
          featureImportance: [],
        },
      },
      {
        pair: { record1: { id: 3 }, record2: { id: 4 } },
        prediction: {
          probability: 0.5,
          classification: 'uncertain',
          confidence: 0.3,
          features: { values: [], names: [] },
          featureImportance: [],
        },
      },
    ]

    it('should filter by minimum confidence', () => {
      const filtered = filterByMinConfidence(predictions, 0.5)
      expect(filtered).toHaveLength(1)
      expect(filtered[0].prediction.confidence).toBe(0.8)
    })
  })

  describe('sortByProbability', () => {
    const predictions: BatchMLPrediction<{ id: number }>[] = [
      {
        pair: { record1: { id: 1 }, record2: { id: 2 } },
        prediction: {
          probability: 0.5,
          classification: 'uncertain',
          confidence: 0.3,
          features: { values: [], names: [] },
          featureImportance: [],
        },
      },
      {
        pair: { record1: { id: 3 }, record2: { id: 4 } },
        prediction: {
          probability: 0.9,
          classification: 'match',
          confidence: 0.8,
          features: { values: [], names: [] },
          featureImportance: [],
        },
      },
    ]

    it('should sort descending by default', () => {
      const sorted = sortByProbability(predictions)
      expect(sorted[0].prediction.probability).toBe(0.9)
      expect(sorted[1].prediction.probability).toBe(0.5)
    })

    it('should sort ascending when specified', () => {
      const sorted = sortByProbability(predictions, true)
      expect(sorted[0].prediction.probability).toBe(0.5)
      expect(sorted[1].prediction.probability).toBe(0.9)
    })

    it('should not mutate original array', () => {
      const original = [...predictions]
      sortByProbability(predictions)
      expect(predictions).toEqual(original)
    })
  })

  describe('sortByConfidence', () => {
    const predictions: BatchMLPrediction<{ id: number }>[] = [
      {
        pair: { record1: { id: 1 }, record2: { id: 2 } },
        prediction: {
          probability: 0.5,
          classification: 'uncertain',
          confidence: 0.3,
          features: { values: [], names: [] },
          featureImportance: [],
        },
      },
      {
        pair: { record1: { id: 3 }, record2: { id: 4 } },
        prediction: {
          probability: 0.9,
          classification: 'match',
          confidence: 0.8,
          features: { values: [], names: [] },
          featureImportance: [],
        },
      },
    ]

    it('should sort descending by default', () => {
      const sorted = sortByConfidence(predictions)
      expect(sorted[0].prediction.confidence).toBe(0.8)
    })

    it('should sort ascending when specified', () => {
      const sorted = sortByConfidence(predictions, true)
      expect(sorted[0].prediction.confidence).toBe(0.3)
    })
  })

  describe('calculatePredictionStats', () => {
    it('should calculate statistics for predictions', () => {
      const predictions: BatchMLPrediction<{ id: number }>[] = [
        {
          pair: { record1: { id: 1 }, record2: { id: 2 } },
          prediction: {
            probability: 0.9,
            classification: 'match',
            confidence: 0.8,
            features: { values: [], names: [] },
            featureImportance: [],
          },
        },
        {
          pair: { record1: { id: 3 }, record2: { id: 4 } },
          prediction: {
            probability: 0.5,
            classification: 'uncertain',
            confidence: 0.3,
            features: { values: [], names: [] },
            featureImportance: [],
          },
        },
        {
          pair: { record1: { id: 5 }, record2: { id: 6 } },
          prediction: {
            probability: 0.1,
            classification: 'nonMatch',
            confidence: 0.9,
            features: { values: [], names: [] },
            featureImportance: [],
          },
        },
      ]

      const stats = calculatePredictionStats(predictions)

      expect(stats.total).toBe(3)
      expect(stats.matchCount).toBe(1)
      expect(stats.nonMatchCount).toBe(1)
      expect(stats.uncertainCount).toBe(1)
      expect(stats.avgProbability).toBeCloseTo(0.5, 5)
      expect(stats.avgConfidence).toBeCloseTo(0.667, 2)
      expect(stats.minProbability).toBe(0.1)
      expect(stats.maxProbability).toBe(0.9)
    })

    it('should handle empty array', () => {
      const stats = calculatePredictionStats([])

      expect(stats.total).toBe(0)
      expect(stats.matchCount).toBe(0)
      expect(stats.avgProbability).toBe(0)
    })
  })

  describe('formatPrediction', () => {
    it('should format prediction as human-readable string', () => {
      const prediction: MLPrediction = {
        probability: 0.85,
        classification: 'match',
        confidence: 0.7,
        features: { values: [0.9], names: ['emailSimilarity'] },
        featureImportance: [
          {
            name: 'emailSimilarity',
            value: 0.9,
            contribution: 0.45,
            importance: 0.45,
          },
        ],
      }

      const formatted = formatPrediction(prediction)

      expect(formatted).toContain('Classification: match')
      expect(formatted).toContain('Probability: 85.0%')
      expect(formatted).toContain('Confidence: 70.0%')
      expect(formatted).toContain('emailSimilarity')
    })

    it('should handle empty feature importance', () => {
      const prediction: MLPrediction = {
        probability: 0.5,
        classification: 'uncertain',
        confidence: 0.3,
        features: { values: [], names: [] },
        featureImportance: [],
      }

      const formatted = formatPrediction(prediction)

      expect(formatted).toContain('Classification: uncertain')
      expect(formatted).not.toContain('Top Features:')
    })
  })

  describe('createLabeledPair', () => {
    it('should create a labeled pair', () => {
      const pair = createLabeledPair(
        { name: 'John' },
        { name: 'John' },
        'match'
      )

      expect(pair.record1.name).toBe('John')
      expect(pair.record2.name).toBe('John')
      expect(pair.label).toBe('match')
    })
  })

  describe('mergeFeatureVectors', () => {
    it('should merge two vectors', () => {
      const v1: FeatureVector = { values: [0.9, 0.8], names: ['f1', 'f2'] }
      const v2: FeatureVector = { values: [0.7], names: ['f3'] }

      const merged = mergeFeatureVectors(v1, v2)

      expect(merged.values).toEqual([0.9, 0.8, 0.7])
      expect(merged.names).toEqual(['f1', 'f2', 'f3'])
    })

    it('should merge metadata', () => {
      const v1: FeatureVector = {
        values: [0.9],
        names: ['f1'],
        metadata: { source: 'a' },
      }
      const v2: FeatureVector = {
        values: [0.8],
        names: ['f2'],
        metadata: { type: 'b' },
      }

      const merged = mergeFeatureVectors(v1, v2)

      expect(merged.metadata?.source).toBe('a')
      expect(merged.metadata?.type).toBe('b')
    })
  })

  describe('normalizeFeatureVector', () => {
    it('should normalize values to 0-1 range', () => {
      const vector: FeatureVector = {
        values: [0, 50, 100],
        names: ['f1', 'f2', 'f3'],
      }

      const normalized = normalizeFeatureVector(vector)

      expect(normalized.values[0]).toBe(0)
      expect(normalized.values[1]).toBe(0.5)
      expect(normalized.values[2]).toBe(1)
    })

    it('should handle constant values', () => {
      const vector: FeatureVector = {
        values: [5, 5, 5],
        names: ['f1', 'f2', 'f3'],
      }

      const normalized = normalizeFeatureVector(vector)

      expect(normalized.values).toEqual([0.5, 0.5, 0.5])
    })

    it('should add normalization metadata', () => {
      const vector: FeatureVector = {
        values: [10, 20],
        names: ['f1', 'f2'],
      }

      const normalized = normalizeFeatureVector(vector)

      expect(normalized.metadata?.normalized).toBe(true)
      expect(normalized.metadata?.originalMin).toBe(10)
      expect(normalized.metadata?.originalMax).toBe(20)
    })
  })

  describe('isValidPrediction', () => {
    it('should return true for valid prediction', () => {
      const prediction: MLPrediction = {
        probability: 0.85,
        classification: 'match',
        confidence: 0.7,
        features: { values: [0.9], names: ['f1'] },
        featureImportance: [],
      }

      expect(isValidPrediction(prediction)).toBe(true)
    })

    it('should return false for invalid probability', () => {
      const prediction = {
        probability: 1.5, // Out of range
        classification: 'match',
        confidence: 0.7,
        features: { values: [0.9], names: ['f1'] },
        featureImportance: [],
      }

      expect(isValidPrediction(prediction)).toBe(false)
    })

    it('should return false for invalid classification', () => {
      const prediction = {
        probability: 0.85,
        classification: 'invalid',
        confidence: 0.7,
        features: { values: [0.9], names: ['f1'] },
        featureImportance: [],
      }

      expect(isValidPrediction(prediction)).toBe(false)
    })

    it('should return false for null', () => {
      expect(isValidPrediction(null)).toBe(false)
    })
  })

  describe('isValidFeatureVector', () => {
    it('should return true for valid vector', () => {
      const vector: FeatureVector = {
        values: [0.9, 0.8],
        names: ['f1', 'f2'],
      }

      expect(isValidFeatureVector(vector)).toBe(true)
    })

    it('should return false for mismatched lengths', () => {
      const vector = {
        values: [0.9, 0.8],
        names: ['f1'],
      }

      expect(isValidFeatureVector(vector)).toBe(false)
    })

    it('should return false for non-numeric values', () => {
      const vector = {
        values: ['a', 'b'],
        names: ['f1', 'f2'],
      }

      expect(isValidFeatureVector(vector)).toBe(false)
    })
  })
})
