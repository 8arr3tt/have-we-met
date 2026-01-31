import { describe, it, expect } from 'vitest'
import { MatchExplainer } from '../../../src/core/scoring/explainer'
import type { MatchResult } from '../../../src/core/scoring/types'

describe('MatchExplainer', () => {
  describe('explain', () => {
    it('generates explanation for definite match', () => {
      const result: MatchResult = {
        outcome: 'definite-match',
        candidateRecord: {},
        score: {
          totalScore: 50,
          maxPossibleScore: 65,
          normalizedScore: 0.769,
          fieldScores: [
            {
              field: 'email',
              similarity: 1.0,
              weight: 20,
              contribution: 20,
              threshold: 0,
              metThreshold: true,
              strategy: 'exact',
              leftValue: 'john.doe@example.com',
              rightValue: 'john.doe@example.com',
            },
            {
              field: 'firstName',
              similarity: 1.0,
              weight: 10,
              contribution: 10,
              threshold: 0.85,
              metThreshold: true,
              strategy: 'jaro-winkler',
              leftValue: 'John',
              rightValue: 'John',
            },
            {
              field: 'lastName',
              similarity: 1.0,
              weight: 10,
              contribution: 10,
              threshold: 0.85,
              metThreshold: true,
              strategy: 'jaro-winkler',
              leftValue: 'Smith',
              rightValue: 'Smith',
            },
            {
              field: 'phone',
              similarity: 1.0,
              weight: 15,
              contribution: 15,
              threshold: 0,
              metThreshold: true,
              strategy: 'exact',
              leftValue: '+1-555-0100',
              rightValue: '+1-555-0100',
            },
            {
              field: 'dateOfBirth',
              similarity: 0.5,
              weight: 10,
              contribution: 5,
              threshold: 0,
              metThreshold: true,
              strategy: 'exact',
              leftValue: '1985-03-15',
              rightValue: '1985-03-20',
            },
          ],
        },
        explanation: '',
      }

      const explainer = new MatchExplainer()
      const explanation = explainer.explain(result)

      expect(explanation).toContain('Match Outcome: Definite Match')
      expect(explanation).toContain('Score: 50.0/65.0')
      expect(explanation).toContain('Field Comparisons:')
      expect(explanation).toContain('✓ email: exact match')
      expect(explanation).toContain('john.doe@example.com')
      expect(explanation).toContain('✓ firstName:')
      expect(explanation).toContain('✓ lastName:')
      expect(explanation).toContain('✓ phone:')
    })

    it('generates explanation for potential match', () => {
      const result: MatchResult = {
        outcome: 'potential-match',
        candidateRecord: {},
        score: {
          totalScore: 38,
          maxPossibleScore: 65,
          normalizedScore: 0.585,
          fieldScores: [
            {
              field: 'email',
              similarity: 1.0,
              weight: 20,
              contribution: 20,
              threshold: 0,
              metThreshold: true,
              strategy: 'exact',
              leftValue: 'john.doe@example.com',
              rightValue: 'john.doe@example.com',
            },
            {
              field: 'firstName',
              similarity: 0.92,
              weight: 10,
              contribution: 9.2,
              threshold: 0.85,
              metThreshold: true,
              strategy: 'jaro-winkler',
              leftValue: 'John',
              rightValue: 'Jon',
            },
            {
              field: 'lastName',
              similarity: 0.88,
              weight: 10,
              contribution: 8.8,
              threshold: 0.85,
              metThreshold: true,
              strategy: 'jaro-winkler',
              leftValue: 'Smith',
              rightValue: 'Smyth',
            },
            {
              field: 'phone',
              similarity: 0.0,
              weight: 15,
              contribution: 0,
              threshold: 0,
              metThreshold: false,
              strategy: 'exact',
              leftValue: '+1-555-0100',
              rightValue: '+1-555-0200',
            },
            {
              field: 'dateOfBirth',
              similarity: 0.6,
              weight: 10,
              contribution: 0,
              threshold: 0.85,
              metThreshold: false,
              strategy: 'exact',
              leftValue: '1985-03-15',
              rightValue: '1985-03-20',
            },
          ],
        },
        explanation: '',
      }

      const explainer = new MatchExplainer()
      const explanation = explainer.explain(result)

      expect(explanation).toContain('Match Outcome: Potential Match')
      expect(explanation).toContain('Score: 38.0/65.0')
      expect(explanation).toContain('✓ email: exact match')
      expect(explanation).toContain('✓ firstName: very high similarity (0.92')
      expect(explanation).toContain('✓ lastName: high similarity (0.88')
      expect(explanation).toContain('✗ phone: no match')
      expect(explanation).toContain('✗ dateOfBirth:')
      expect(explanation).toContain('Strategy: jaro-winkler')
    })

    it('generates explanation for no match', () => {
      const result: MatchResult = {
        outcome: 'no-match',
        candidateRecord: {},
        score: {
          totalScore: 5,
          maxPossibleScore: 65,
          normalizedScore: 0.077,
          fieldScores: [
            {
              field: 'email',
              similarity: 0.0,
              weight: 20,
              contribution: 0,
              threshold: 0,
              metThreshold: false,
              strategy: 'exact',
              leftValue: 'john.doe@example.com',
              rightValue: 'jane.smith@example.com',
            },
            {
              field: 'firstName',
              similarity: 0.5,
              weight: 10,
              contribution: 5,
              threshold: 0,
              metThreshold: true,
              strategy: 'jaro-winkler',
              leftValue: 'John',
              rightValue: 'Jane',
            },
            {
              field: 'lastName',
              similarity: 0.2,
              weight: 10,
              contribution: 0,
              threshold: 0.85,
              metThreshold: false,
              strategy: 'jaro-winkler',
              leftValue: 'Smith',
              rightValue: 'Johnson',
            },
            {
              field: 'phone',
              similarity: 0.0,
              weight: 15,
              contribution: 0,
              threshold: 0,
              metThreshold: false,
              strategy: 'exact',
              leftValue: '+1-555-0100',
              rightValue: '+1-555-9999',
            },
            {
              field: 'dateOfBirth',
              similarity: 0.0,
              weight: 10,
              contribution: 0,
              threshold: 0,
              metThreshold: false,
              strategy: 'exact',
              leftValue: '1985-03-15',
              rightValue: '1990-07-20',
            },
          ],
        },
        explanation: '',
      }

      const explainer = new MatchExplainer()
      const explanation = explainer.explain(result)

      expect(explanation).toContain('Match Outcome: No Match')
      expect(explanation).toContain('Score: 5.0/65.0')
      expect(explanation).toContain('✗ email: no match')
      expect(explanation).toContain('✓ firstName: low similarity')
    })

    it('shows fields below threshold', () => {
      const result: MatchResult = {
        outcome: 'potential-match',
        candidateRecord: {},
        score: {
          totalScore: 20,
          maxPossibleScore: 30,
          normalizedScore: 0.667,
          fieldScores: [
            {
              field: 'email',
              similarity: 1.0,
              weight: 20,
              contribution: 20,
              threshold: 0,
              metThreshold: true,
              strategy: 'exact',
              leftValue: 'test@example.com',
              rightValue: 'test@example.com',
            },
            {
              field: 'name',
              similarity: 0.75,
              weight: 10,
              contribution: 0,
              threshold: 0.85,
              metThreshold: false,
              strategy: 'jaro-winkler',
              leftValue: 'John Smith',
              rightValue: 'Jon Smyth',
            },
          ],
        },
        explanation: '',
      }

      const explainer = new MatchExplainer()
      const explanation = explainer.explain(result)

      expect(explanation).toContain('✗ name:')
      expect(explanation).toContain('Below threshold: 0.75 < 0.85')
      expect(explanation).toContain('Strategy: jaro-winkler')
    })

    it('handles missing fields', () => {
      const result: MatchResult = {
        outcome: 'no-match',
        candidateRecord: {},
        score: {
          totalScore: 0,
          maxPossibleScore: 20,
          normalizedScore: 0,
          fieldScores: [
            {
              field: 'email',
              similarity: 0.0,
              weight: 20,
              contribution: 0,
              threshold: 0,
              metThreshold: false,
              strategy: 'exact',
              leftValue: undefined,
              rightValue: undefined,
            },
          ],
        },
        explanation: '',
      }

      const explainer = new MatchExplainer()
      const explanation = explainer.explain(result)

      expect(explanation).toContain('✗ email: no match')
      expect(explanation).toContain('Record A: undefined')
      expect(explanation).toContain('Record B: undefined')
    })

    it('handles null values', () => {
      const result: MatchResult = {
        outcome: 'no-match',
        candidateRecord: {},
        score: {
          totalScore: 0,
          maxPossibleScore: 20,
          normalizedScore: 0,
          fieldScores: [
            {
              field: 'middleName',
              similarity: 0.0,
              weight: 20,
              contribution: 0,
              threshold: 0,
              metThreshold: false,
              strategy: 'exact',
              leftValue: null,
              rightValue: null,
            },
          ],
        },
        explanation: '',
      }

      const explainer = new MatchExplainer()
      const explanation = explainer.explain(result)

      expect(explanation).toContain('Record A: null')
      expect(explanation).toContain('Record B: null')
    })

    it('formats scores consistently', () => {
      const result: MatchResult = {
        outcome: 'potential-match',
        candidateRecord: {},
        score: {
          totalScore: 33.456,
          maxPossibleScore: 65.789,
          normalizedScore: 0.508,
          fieldScores: [
            {
              field: 'name',
              similarity: 0.876543,
              weight: 15.3,
              contribution: 13.41,
              threshold: 0.85,
              metThreshold: true,
              strategy: 'jaro-winkler',
              leftValue: 'Test',
              rightValue: 'Tester',
            },
          ],
        },
        explanation: '',
      }

      const explainer = new MatchExplainer()
      const explanation = explainer.explain(result)

      expect(explanation).toContain('Score: 33.5/65.8')
      expect(explanation).toContain('(0.88 × 15 = 13.4)')
    })

    it('handles various value types', () => {
      const result: MatchResult = {
        outcome: 'no-match',
        candidateRecord: {},
        score: {
          totalScore: 0,
          maxPossibleScore: 80,
          normalizedScore: 0,
          fieldScores: [
            {
              field: 'age',
              similarity: 0.0,
              weight: 20,
              contribution: 0,
              threshold: 0,
              metThreshold: false,
              strategy: 'exact',
              leftValue: 25,
              rightValue: 30,
            },
            {
              field: 'active',
              similarity: 0.0,
              weight: 20,
              contribution: 0,
              threshold: 0,
              metThreshold: false,
              strategy: 'exact',
              leftValue: true,
              rightValue: false,
            },
            {
              field: 'createdAt',
              similarity: 0.0,
              weight: 20,
              contribution: 0,
              threshold: 0,
              metThreshold: false,
              strategy: 'exact',
              leftValue: new Date('2024-01-01T00:00:00.000Z'),
              rightValue: new Date('2024-12-31T00:00:00.000Z'),
            },
            {
              field: 'metadata',
              similarity: 0.0,
              weight: 20,
              contribution: 0,
              threshold: 0,
              metThreshold: false,
              strategy: 'exact',
              leftValue: { key: 'value1' },
              rightValue: { key: 'value2' },
            },
          ],
        },
        explanation: '',
      }

      const explainer = new MatchExplainer()
      const explanation = explainer.explain(result)

      expect(explanation).toContain('Record A: 25')
      expect(explanation).toContain('Record B: 30')
      expect(explanation).toContain('Record A: true')
      expect(explanation).toContain('Record B: false')
      expect(explanation).toContain('2024-01-01T00:00:00.000Z')
      expect(explanation).toContain('2024-12-31T00:00:00.000Z')
      expect(explanation).toContain('{"key":"value1"}')
      expect(explanation).toContain('{"key":"value2"}')
    })

    it('does not show strategy label for exact matches', () => {
      const result: MatchResult = {
        outcome: 'definite-match',
        candidateRecord: {},
        score: {
          totalScore: 20,
          maxPossibleScore: 20,
          normalizedScore: 1.0,
          fieldScores: [
            {
              field: 'email',
              similarity: 1.0,
              weight: 20,
              contribution: 20,
              threshold: 0,
              metThreshold: true,
              strategy: 'exact',
              leftValue: 'test@example.com',
              rightValue: 'test@example.com',
            },
          ],
        },
        explanation: '',
      }

      const explainer = new MatchExplainer()
      const explanation = explainer.explain(result)

      const emailSection = explanation.split('✓ email:')[1].split('\n\n')[0]
      expect(emailSection).not.toContain('Strategy:')
    })

    it('shows strategy label for non-exact matches', () => {
      const result: MatchResult = {
        outcome: 'potential-match',
        candidateRecord: {},
        score: {
          totalScore: 9,
          maxPossibleScore: 10,
          normalizedScore: 0.9,
          fieldScores: [
            {
              field: 'name',
              similarity: 0.9,
              weight: 10,
              contribution: 9,
              threshold: 0,
              metThreshold: true,
              strategy: 'jaro-winkler',
              leftValue: 'John',
              rightValue: 'Jon',
            },
          ],
        },
        explanation: '',
      }

      const explainer = new MatchExplainer()
      const explanation = explainer.explain(result)

      expect(explanation).toContain('Strategy: jaro-winkler')
    })

    it('categorizes similarity scores correctly', () => {
      const explainer = new MatchExplainer()

      const createResult = (similarity: number): MatchResult => ({
        outcome: 'no-match',
        candidateRecord: {},
        score: {
          totalScore: 0,
          maxPossibleScore: 10,
          normalizedScore: 0,
          fieldScores: [
            {
              field: 'test',
              similarity,
              weight: 10,
              contribution: 0,
              threshold: 0,
              metThreshold: false,
              strategy: 'jaro-winkler',
              leftValue: 'a',
              rightValue: 'b',
            },
          ],
        },
        explanation: '',
      })

      expect(explainer.explain(createResult(1.0))).toContain('exact match')
      expect(explainer.explain(createResult(0.95))).toContain('very high similarity')
      expect(explainer.explain(createResult(0.85))).toContain('high similarity')
      expect(explainer.explain(createResult(0.70))).toContain('moderate similarity')
      expect(explainer.explain(createResult(0.45))).toContain('low similarity')
      expect(explainer.explain(createResult(0.0))).toContain('no match')
    })
  })
})
