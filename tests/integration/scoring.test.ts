import { describe, it, expect } from 'vitest'
import { ScoreCalculator, OutcomeClassifier } from '../../src/core/scoring'
import type {
  FieldComparison,
  MatchThresholds,
} from '../../src/core/scoring/types'

describe('Integration: Scoring Infrastructure', () => {
  const calculator = new ScoreCalculator()
  const classifier = new OutcomeClassifier()

  const thresholds: MatchThresholds = {
    noMatch: 20,
    definiteMatch: 45,
  }

  describe('score calculation with multiple fields', () => {
    it('identifies definite match via exact email match', () => {
      const record1 = {
        email: 'john.doe@example.com',
        firstName: 'John',
        lastName: 'Smith',
        phone: '+1-555-0100',
      }
      const record2 = {
        email: 'john.doe@example.com',
        firstName: 'John',
        lastName: 'Smith',
        phone: '+1-555-0100',
      }

      const comparisons: FieldComparison[] = [
        { field: 'email', strategy: 'exact', weight: 20 },
        { field: 'phone', strategy: 'exact', weight: 15 },
        {
          field: 'firstName',
          strategy: 'jaro-winkler',
          weight: 10,
          threshold: 0.85,
        },
        {
          field: 'lastName',
          strategy: 'jaro-winkler',
          weight: 10,
          threshold: 0.85,
        },
      ]

      const score = calculator.calculateScore(record1, record2, comparisons)
      const outcome = classifier.classify(score, thresholds)

      expect(outcome).toBe('definite-match')
      expect(score.totalScore).toBeGreaterThanOrEqual(45)

      const emailScore = score.fieldScores.find((f) => f.field === 'email')
      expect(emailScore?.similarity).toBe(1)
      expect(emailScore?.contribution).toBe(20)
    })

    it('identifies potential match with mixed signals', () => {
      const record1 = {
        email: 'john.doe@example.com',
        firstName: 'John',
        lastName: 'Smith',
        phone: '+1-555-0100',
        dateOfBirth: '1985-03-15',
      }
      const record2 = {
        email: 'john.doe@example.com',
        firstName: 'Jon',
        lastName: 'Smyth',
        phone: '+1-555-0200',
        dateOfBirth: '1985-03-20',
      }

      const comparisons: FieldComparison[] = [
        { field: 'email', strategy: 'exact', weight: 20 },
        { field: 'phone', strategy: 'exact', weight: 15 },
        {
          field: 'firstName',
          strategy: 'jaro-winkler',
          weight: 10,
          threshold: 0.85,
        },
        {
          field: 'lastName',
          strategy: 'jaro-winkler',
          weight: 10,
          threshold: 0.85,
        },
        { field: 'dateOfBirth', strategy: 'exact', weight: 10 },
      ]

      const score = calculator.calculateScore(record1, record2, comparisons)
      const outcome = classifier.classify(score, thresholds)

      expect(outcome).toBe('potential-match')
      expect(score.totalScore).toBeGreaterThanOrEqual(20)
      expect(score.totalScore).toBeLessThan(45)

      const emailScore = score.fieldScores.find((f) => f.field === 'email')
      expect(emailScore?.contribution).toBe(20)

      const phoneScore = score.fieldScores.find((f) => f.field === 'phone')
      expect(phoneScore?.contribution).toBe(0)

      const dobScore = score.fieldScores.find((f) => f.field === 'dateOfBirth')
      expect(dobScore?.contribution).toBe(0)
    })

    it('filters out no matches below threshold', () => {
      const record1 = {
        email: 'john@example.com',
        firstName: 'John',
        lastName: 'Smith',
      }
      const record2 = {
        email: 'jane@different.com',
        firstName: 'Jane',
        lastName: 'Johnson',
      }

      const comparisons: FieldComparison[] = [
        { field: 'email', strategy: 'exact', weight: 20 },
        { field: 'firstName', strategy: 'jaro-winkler', weight: 10 },
        { field: 'lastName', strategy: 'jaro-winkler', weight: 10 },
      ]

      const score = calculator.calculateScore(record1, record2, comparisons)
      const outcome = classifier.classify(score, thresholds)

      expect(outcome).toBe('no-match')
      expect(score.totalScore).toBeLessThan(20)
    })

    it('handles high similarity across multiple fields', () => {
      const record1 = {
        firstName: 'John',
        lastName: 'Smith',
        email: 'john.smith@example.com',
        phone: '+1-555-0100',
        dateOfBirth: '1985-03-15',
      }
      const record2 = {
        firstName: 'John',
        lastName: 'Smith',
        email: 'john.smith@example.com',
        phone: '+1-555-0100',
        dateOfBirth: '1985-03-15',
      }

      const comparisons: FieldComparison[] = [
        { field: 'email', strategy: 'exact', weight: 20 },
        { field: 'phone', strategy: 'exact', weight: 15 },
        { field: 'firstName', strategy: 'jaro-winkler', weight: 10 },
        { field: 'lastName', strategy: 'jaro-winkler', weight: 10 },
        { field: 'dateOfBirth', strategy: 'exact', weight: 10 },
      ]

      const score = calculator.calculateScore(record1, record2, comparisons)
      const outcome = classifier.classify(score, thresholds)

      expect(outcome).toBe('definite-match')
      expect(score.totalScore).toBe(65)
      expect(score.maxPossibleScore).toBe(65)
      expect(score.normalizedScore).toBe(1)

      for (const fieldScore of score.fieldScores) {
        expect(fieldScore.similarity).toBe(1)
        expect(fieldScore.contribution).toBe(fieldScore.weight)
      }
    })

    it('respects field thresholds in real scenario', () => {
      const record1 = {
        firstName: 'Bob',
        lastName: 'Johnson',
        dateOfBirth: '1990-05-10',
      }
      const record2 = {
        firstName: 'Robert',
        lastName: 'Johnson',
        dateOfBirth: '1990-05-12',
      }

      const comparisons: FieldComparison[] = [
        {
          field: 'firstName',
          strategy: 'jaro-winkler',
          weight: 15,
          threshold: 0.9,
        },
        { field: 'lastName', strategy: 'exact', weight: 15 },
        {
          field: 'dateOfBirth',
          strategy: 'levenshtein',
          weight: 10,
          threshold: 0.9,
        },
      ]

      const score = calculator.calculateScore(record1, record2, comparisons)

      const firstNameScore = score.fieldScores.find(
        (f) => f.field === 'firstName'
      )
      expect(firstNameScore?.metThreshold).toBe(false)
      expect(firstNameScore?.contribution).toBe(0)

      const lastNameScore = score.fieldScores.find(
        (f) => f.field === 'lastName'
      )
      expect(lastNameScore?.similarity).toBe(1)
      expect(lastNameScore?.contribution).toBe(15)

      const dobScore = score.fieldScores.find((f) => f.field === 'dateOfBirth')
      expect(dobScore?.metThreshold).toBe(true)
      expect(dobScore?.contribution).toBeGreaterThan(0)

      expect(score.totalScore).toBeGreaterThan(15)
    })

    it('handles complex nested fields scenario', () => {
      const record1 = {
        user: {
          contact: {
            email: 'test@example.com',
            phone: '555-0100',
          },
          profile: {
            firstName: 'John',
            lastName: 'Doe',
          },
        },
      }
      const record2 = {
        user: {
          contact: {
            email: 'test@example.com',
            phone: '555-0100',
          },
          profile: {
            firstName: 'John',
            lastName: 'Doe',
          },
        },
      }

      const comparisons: FieldComparison[] = [
        { field: 'user.contact.email', strategy: 'exact', weight: 25 },
        { field: 'user.contact.phone', strategy: 'exact', weight: 15 },
        {
          field: 'user.profile.firstName',
          strategy: 'jaro-winkler',
          weight: 10,
        },
        { field: 'user.profile.lastName', strategy: 'exact', weight: 10 },
      ]

      const score = calculator.calculateScore(record1, record2, comparisons)
      const outcome = classifier.classify(score, thresholds)

      expect(outcome).toBe('definite-match')

      const emailScore = score.fieldScores.find(
        (f) => f.field === 'user.contact.email'
      )
      expect(emailScore?.leftValue).toBe('test@example.com')
      expect(emailScore?.similarity).toBe(1)
      expect(emailScore?.contribution).toBe(25)

      const lastNameScore = score.fieldScores.find(
        (f) => f.field === 'user.profile.lastName'
      )
      expect(lastNameScore?.contribution).toBe(10)
    })

    it('demonstrates complete workflow from calculation to classification', () => {
      const scenarios = [
        {
          name: 'Definite match - all fields match',
          record1: { email: 'test@example.com', name: 'John' },
          record2: { email: 'test@example.com', name: 'John' },
          expectedOutcome: 'definite-match' as const,
        },
        {
          name: 'Potential match - partial match',
          record1: { email: 'john@example.com', name: 'John Smith' },
          record2: { email: 'john.smith@different.com', name: 'John Smith' },
          expectedOutcome: 'potential-match' as const,
        },
        {
          name: 'No match - different records',
          record1: { email: 'john@example.com', name: 'John' },
          record2: { email: 'jane@different.com', name: 'Jane' },
          expectedOutcome: 'no-match' as const,
        },
      ]

      const comparisons: FieldComparison[] = [
        { field: 'email', strategy: 'exact', weight: 30 },
        { field: 'name', strategy: 'jaro-winkler', weight: 20 },
      ]

      for (const scenario of scenarios) {
        const score = calculator.calculateScore(
          scenario.record1,
          scenario.record2,
          comparisons
        )
        const outcome = classifier.classify(score, thresholds)

        expect(outcome).toBe(scenario.expectedOutcome)
      }
    })
  })
})
