import { describe, it, expect } from 'vitest'
import { OutcomeClassifier } from '../../../src/core/scoring/outcome-classifier'
import type {
  MatchScore,
  MatchThresholds,
} from '../../../src/core/scoring/types'

describe('OutcomeClassifier', () => {
  const classifier = new OutcomeClassifier()

  const createScore = (totalScore: number): MatchScore => ({
    totalScore,
    maxPossibleScore: 100,
    normalizedScore: totalScore / 100,
    fieldScores: [],
  })

  const thresholds: MatchThresholds = {
    noMatch: 20,
    definiteMatch: 45,
  }

  describe('classify', () => {
    it('returns no-match below threshold', () => {
      expect(classifier.classify(createScore(0), thresholds)).toBe('no-match')
      expect(classifier.classify(createScore(10), thresholds)).toBe('no-match')
      expect(classifier.classify(createScore(19), thresholds)).toBe('no-match')
      expect(classifier.classify(createScore(19.9), thresholds)).toBe(
        'no-match'
      )
    })

    it('returns definite-match above threshold', () => {
      expect(classifier.classify(createScore(45), thresholds)).toBe(
        'definite-match'
      )
      expect(classifier.classify(createScore(50), thresholds)).toBe(
        'definite-match'
      )
      expect(classifier.classify(createScore(100), thresholds)).toBe(
        'definite-match'
      )
    })

    it('returns potential-match in between', () => {
      expect(classifier.classify(createScore(20), thresholds)).toBe(
        'potential-match'
      )
      expect(classifier.classify(createScore(25), thresholds)).toBe(
        'potential-match'
      )
      expect(classifier.classify(createScore(30), thresholds)).toBe(
        'potential-match'
      )
      expect(classifier.classify(createScore(40), thresholds)).toBe(
        'potential-match'
      )
      expect(classifier.classify(createScore(44.9), thresholds)).toBe(
        'potential-match'
      )
    })

    it('handles edge cases at exact threshold values', () => {
      expect(classifier.classify(createScore(20), thresholds)).toBe(
        'potential-match'
      )
      expect(classifier.classify(createScore(45), thresholds)).toBe(
        'definite-match'
      )

      expect(classifier.classify(createScore(19.999999), thresholds)).toBe(
        'no-match'
      )
      expect(classifier.classify(createScore(20.000001), thresholds)).toBe(
        'potential-match'
      )
      expect(classifier.classify(createScore(44.999999), thresholds)).toBe(
        'potential-match'
      )
      expect(classifier.classify(createScore(45.000001), thresholds)).toBe(
        'definite-match'
      )
    })

    it('works with different threshold configurations', () => {
      const strictThresholds: MatchThresholds = {
        noMatch: 30,
        definiteMatch: 70,
      }

      expect(classifier.classify(createScore(29), strictThresholds)).toBe(
        'no-match'
      )
      expect(classifier.classify(createScore(30), strictThresholds)).toBe(
        'potential-match'
      )
      expect(classifier.classify(createScore(50), strictThresholds)).toBe(
        'potential-match'
      )
      expect(classifier.classify(createScore(70), strictThresholds)).toBe(
        'definite-match'
      )
    })

    it('works with lenient thresholds', () => {
      const lenientThresholds: MatchThresholds = {
        noMatch: 10,
        definiteMatch: 30,
      }

      expect(classifier.classify(createScore(5), lenientThresholds)).toBe(
        'no-match'
      )
      expect(classifier.classify(createScore(15), lenientThresholds)).toBe(
        'potential-match'
      )
      expect(classifier.classify(createScore(35), lenientThresholds)).toBe(
        'definite-match'
      )
    })

    it('works with very narrow threshold range', () => {
      const narrowThresholds: MatchThresholds = {
        noMatch: 40,
        definiteMatch: 41,
      }

      expect(classifier.classify(createScore(39), narrowThresholds)).toBe(
        'no-match'
      )
      expect(classifier.classify(createScore(40), narrowThresholds)).toBe(
        'potential-match'
      )
      expect(classifier.classify(createScore(40.5), narrowThresholds)).toBe(
        'potential-match'
      )
      expect(classifier.classify(createScore(41), narrowThresholds)).toBe(
        'definite-match'
      )
    })

    it('handles zero thresholds', () => {
      const zeroThresholds: MatchThresholds = {
        noMatch: 0,
        definiteMatch: 50,
      }

      expect(classifier.classify(createScore(0), zeroThresholds)).toBe(
        'potential-match'
      )
      expect(classifier.classify(createScore(25), zeroThresholds)).toBe(
        'potential-match'
      )
      expect(classifier.classify(createScore(50), zeroThresholds)).toBe(
        'definite-match'
      )
    })

    it('handles negative scores', () => {
      expect(classifier.classify(createScore(-10), thresholds)).toBe('no-match')
      expect(classifier.classify(createScore(-1), thresholds)).toBe('no-match')
    })
  })
})
