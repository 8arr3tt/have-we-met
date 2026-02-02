import { describe, it, expect } from 'vitest'
import { ScoreCalculator } from '../../../src/core/scoring/score-calculator'
import type { FieldComparison } from '../../../src/core/scoring/types'

describe('ScoreCalculator', () => {
  const calculator = new ScoreCalculator()

  describe('calculateScore', () => {
    it('calculates weighted score for multiple fields', () => {
      const record1 = {
        email: 'john.doe@example.com',
        firstName: 'John',
        lastName: 'Smith',
      }
      const record2 = {
        email: 'john.doe@example.com',
        firstName: 'Jon',
        lastName: 'Smith',
      }

      const comparisons: FieldComparison[] = [
        { field: 'email', strategy: 'exact', weight: 20 },
        { field: 'firstName', strategy: 'jaro-winkler', weight: 10 },
        { field: 'lastName', strategy: 'exact', weight: 10 },
      ]

      const result = calculator.calculateScore(record1, record2, comparisons)

      expect(result.totalScore).toBeGreaterThan(0)
      expect(result.maxPossibleScore).toBe(40)
      expect(result.normalizedScore).toBeGreaterThan(0)
      expect(result.normalizedScore).toBeLessThanOrEqual(1)
      expect(result.fieldScores).toHaveLength(3)

      const emailScore = result.fieldScores.find((f) => f.field === 'email')
      expect(emailScore?.similarity).toBe(1)
      expect(emailScore?.contribution).toBe(20)

      const lastNameScore = result.fieldScores.find(
        (f) => f.field === 'lastName'
      )
      expect(lastNameScore?.similarity).toBe(1)
      expect(lastNameScore?.contribution).toBe(10)

      const firstNameScore = result.fieldScores.find(
        (f) => f.field === 'firstName'
      )
      expect(firstNameScore?.similarity).toBeGreaterThan(0.9)
      expect(firstNameScore?.contribution).toBeGreaterThan(9)
    })

    it('applies field thresholds correctly', () => {
      const record1 = { name: 'John', age: 30 }
      const record2 = { name: 'Jon', age: 30 }

      const comparisons: FieldComparison[] = [
        {
          field: 'name',
          strategy: 'jaro-winkler',
          weight: 10,
          threshold: 0.95,
        },
        { field: 'age', strategy: 'exact', weight: 5 },
      ]

      const result = calculator.calculateScore(record1, record2, comparisons)

      const nameScore = result.fieldScores.find((f) => f.field === 'name')
      expect(nameScore?.similarity).toBeLessThan(0.95)
      expect(nameScore?.metThreshold).toBe(false)
      expect(nameScore?.contribution).toBe(0)

      const ageScore = result.fieldScores.find((f) => f.field === 'age')
      expect(ageScore?.similarity).toBe(1)
      expect(ageScore?.metThreshold).toBe(true)
      expect(ageScore?.contribution).toBe(5)

      expect(result.totalScore).toBe(5)
    })

    it('handles missing fields', () => {
      const record1 = { name: 'John' }
      const record2 = { name: 'John' }

      const comparisons: FieldComparison[] = [
        { field: 'name', strategy: 'exact', weight: 10 },
        { field: 'email', strategy: 'exact', weight: 20 },
      ]

      const result = calculator.calculateScore(record1, record2, comparisons)

      const nameScore = result.fieldScores.find((f) => f.field === 'name')
      expect(nameScore?.similarity).toBe(1)
      expect(nameScore?.contribution).toBe(10)

      const emailScore = result.fieldScores.find((f) => f.field === 'email')
      expect(emailScore?.leftValue).toBeUndefined()
      expect(emailScore?.rightValue).toBeUndefined()
      // undefined === undefined is treated as a match by default
      expect(emailScore?.similarity).toBe(1)
      expect(emailScore?.contribution).toBe(20)
    })

    it('handles null values per comparator options', () => {
      const record1 = { name: null, email: null }
      const record2 = { name: null, email: 'test@example.com' }

      const comparisons: FieldComparison[] = [
        {
          field: 'name',
          strategy: 'exact',
          weight: 10,
          options: { nullMatchesNull: true },
        },
        {
          field: 'email',
          strategy: 'exact',
          weight: 20,
          options: { nullMatchesNull: false },
        },
      ]

      const result = calculator.calculateScore(record1, record2, comparisons)

      const nameScore = result.fieldScores.find((f) => f.field === 'name')
      expect(nameScore?.similarity).toBe(1)
      expect(nameScore?.contribution).toBe(10)

      const emailScore = result.fieldScores.find((f) => f.field === 'email')
      expect(emailScore?.similarity).toBe(0)
      expect(emailScore?.contribution).toBe(0)
    })

    it('calculates max possible score correctly', () => {
      const comparisons: FieldComparison[] = [
        { field: 'a', strategy: 'exact', weight: 10 },
        { field: 'b', strategy: 'exact', weight: 25 },
        { field: 'c', strategy: 'exact', weight: 15 },
      ]

      const result = calculator.calculateScore({}, {}, comparisons)

      expect(result.maxPossibleScore).toBe(50)
    })

    it('provides detailed field breakdown', () => {
      const record1 = { email: 'john@example.com' }
      const record2 = { email: 'john@example.com' }

      const comparisons: FieldComparison[] = [
        { field: 'email', strategy: 'exact', weight: 20 },
      ]

      const result = calculator.calculateScore(record1, record2, comparisons)

      expect(result.fieldScores).toHaveLength(1)
      const fieldScore = result.fieldScores[0]

      expect(fieldScore).toHaveProperty('field')
      expect(fieldScore).toHaveProperty('similarity')
      expect(fieldScore).toHaveProperty('weight')
      expect(fieldScore).toHaveProperty('contribution')
      expect(fieldScore).toHaveProperty('threshold')
      expect(fieldScore).toHaveProperty('metThreshold')
      expect(fieldScore).toHaveProperty('strategy')
      expect(fieldScore).toHaveProperty('leftValue')
      expect(fieldScore).toHaveProperty('rightValue')

      expect(fieldScore.field).toBe('email')
      expect(fieldScore.similarity).toBe(1)
      expect(fieldScore.weight).toBe(20)
      expect(fieldScore.contribution).toBe(20)
      expect(fieldScore.threshold).toBe(0)
      expect(fieldScore.metThreshold).toBe(true)
      expect(fieldScore.strategy).toBe('exact')
      expect(fieldScore.leftValue).toBe('john@example.com')
      expect(fieldScore.rightValue).toBe('john@example.com')
    })

    it('supports nested field access via dot notation', () => {
      const record1 = {
        user: {
          profile: {
            name: 'John',
          },
        },
      }
      const record2 = {
        user: {
          profile: {
            name: 'John',
          },
        },
      }

      const comparisons: FieldComparison[] = [
        { field: 'user.profile.name', strategy: 'exact', weight: 10 },
      ]

      const result = calculator.calculateScore(record1, record2, comparisons)

      const fieldScore = result.fieldScores[0]
      expect(fieldScore.similarity).toBe(1)
      expect(fieldScore.leftValue).toBe('John')
      expect(fieldScore.rightValue).toBe('John')
      expect(fieldScore.contribution).toBe(10)
    })

    it('handles different comparison strategies', () => {
      const record1 = { name: 'Robert' }
      const record2 = { name: 'Rupert' }

      const strategies = [
        'exact',
        'levenshtein',
        'jaro-winkler',
        'soundex',
        'metaphone',
      ] as const

      for (const strategy of strategies) {
        const comparisons: FieldComparison[] = [
          { field: 'name', strategy, weight: 10 },
        ]

        const result = calculator.calculateScore(record1, record2, comparisons)

        expect(result.fieldScores[0].strategy).toBe(strategy)
        expect(result.fieldScores[0].similarity).toBeGreaterThanOrEqual(0)
        expect(result.fieldScores[0].similarity).toBeLessThanOrEqual(1)
      }
    })

    it('handles empty comparisons array', () => {
      const result = calculator.calculateScore({ a: 1 }, { a: 1 }, [])

      expect(result.totalScore).toBe(0)
      expect(result.maxPossibleScore).toBe(0)
      expect(result.normalizedScore).toBe(0)
      expect(result.fieldScores).toHaveLength(0)
    })

    it('calculates normalized score correctly', () => {
      const record1 = { a: 'test', b: 'value' }
      const record2 = { a: 'test', b: 'different' }

      const comparisons: FieldComparison[] = [
        { field: 'a', strategy: 'exact', weight: 20 },
        { field: 'b', strategy: 'exact', weight: 10 },
      ]

      const result = calculator.calculateScore(record1, record2, comparisons)

      expect(result.totalScore).toBe(20)
      expect(result.maxPossibleScore).toBe(30)
      expect(result.normalizedScore).toBeCloseTo(20 / 30, 5)
    })

    it('throws error for unknown strategy', () => {
      const comparisons: FieldComparison[] = [
        { field: 'name', strategy: 'invalid-strategy' as any, weight: 10 },
      ]

      expect(() => {
        calculator.calculateScore(
          { name: 'test' },
          { name: 'test' },
          comparisons
        )
      }).toThrow('Unknown comparison strategy: invalid-strategy')
    })
  })
})
