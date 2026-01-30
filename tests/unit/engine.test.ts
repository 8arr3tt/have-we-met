import { describe, it, expect } from 'vitest'
import { MatchingEngine } from '../../src/core/engine'
import type { MatchingConfig, RecordPair } from '../../src/types'

interface TestPerson {
  firstName: string
  lastName: string
  email: string
  age?: number
}

function createPair(
  leftData: TestPerson,
  rightData: TestPerson
): RecordPair<TestPerson> {
  return {
    left: {
      data: leftData,
      metadata: { id: 'left-1' },
    },
    right: {
      data: rightData,
      metadata: { id: 'right-1' },
    },
  }
}

describe('MatchingEngine', () => {
  describe('compare', () => {
    it('calculates weighted scores for matching fields', () => {
      const config: MatchingConfig = {
        fields: new Map([
          ['email', { strategy: 'exact', weight: 50 }],
          ['firstName', { strategy: 'exact', weight: 25 }],
          ['lastName', { strategy: 'exact', weight: 25 }],
        ]),
        thresholds: { noMatch: 20, definiteMatch: 80 },
      }

      const engine = new MatchingEngine<TestPerson>(config)
      const pair = createPair(
        { firstName: 'Jane', lastName: 'Smith', email: 'jane@example.com' },
        { firstName: 'Jane', lastName: 'Smith', email: 'jane@example.com' }
      )

      const result = engine.compare(pair)

      expect(result.total).toBe(100)
      expect(result.normalizedTotal).toBe(1)
      expect(result.fieldComparisons).toHaveLength(3)
    })

    it('handles partial matches correctly', () => {
      const config: MatchingConfig = {
        fields: new Map([
          ['email', { strategy: 'exact', weight: 50 }],
          ['firstName', { strategy: 'exact', weight: 25 }],
          ['lastName', { strategy: 'exact', weight: 25 }],
        ]),
        thresholds: { noMatch: 20, definiteMatch: 80 },
      }

      const engine = new MatchingEngine<TestPerson>(config)
      const pair = createPair(
        { firstName: 'Jane', lastName: 'Smith', email: 'jane@example.com' },
        { firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com' }
      )

      const result = engine.compare(pair)

      expect(result.total).toBe(75)
      expect(result.normalizedTotal).toBe(0.75)
    })

    it('returns zero for no matches', () => {
      const config: MatchingConfig = {
        fields: new Map([
          ['email', { strategy: 'exact', weight: 50 }],
          ['firstName', { strategy: 'exact', weight: 25 }],
        ]),
        thresholds: { noMatch: 20, definiteMatch: 80 },
      }

      const engine = new MatchingEngine<TestPerson>(config)
      const pair = createPair(
        { firstName: 'Jane', lastName: 'Smith', email: 'jane@example.com' },
        { firstName: 'John', lastName: 'Doe', email: 'john@example.com' }
      )

      const result = engine.compare(pair)

      expect(result.total).toBe(0)
      expect(result.normalizedTotal).toBe(0)
    })

    it('respects case-insensitive option', () => {
      const config: MatchingConfig = {
        fields: new Map([
          ['email', { strategy: 'exact', weight: 100, caseSensitive: false }],
        ]),
        thresholds: { noMatch: 20, definiteMatch: 80 },
      }

      const engine = new MatchingEngine<TestPerson>(config)
      const pair = createPair(
        { firstName: 'Jane', lastName: 'Smith', email: 'JANE@EXAMPLE.COM' },
        { firstName: 'Jane', lastName: 'Smith', email: 'jane@example.com' }
      )

      const result = engine.compare(pair)

      expect(result.total).toBe(100)
      expect(result.normalizedTotal).toBe(1)
    })

    it('applies field threshold filtering', () => {
      const config: MatchingConfig = {
        fields: new Map([
          ['email', { strategy: 'exact', weight: 100, threshold: 1 }],
        ]),
        thresholds: { noMatch: 20, definiteMatch: 80 },
      }

      const engine = new MatchingEngine<TestPerson>(config)

      const matchPair = createPair(
        { firstName: 'Jane', lastName: 'Smith', email: 'jane@example.com' },
        { firstName: 'Jane', lastName: 'Smith', email: 'jane@example.com' }
      )
      const matchResult = engine.compare(matchPair)
      expect(matchResult.total).toBe(100)

      const noMatchPair = createPair(
        { firstName: 'Jane', lastName: 'Smith', email: 'jane@example.com' },
        { firstName: 'Jane', lastName: 'Smith', email: 'other@example.com' }
      )
      const noMatchResult = engine.compare(noMatchPair)
      expect(noMatchResult.total).toBe(0)
    })

    it('handles missing fields gracefully', () => {
      const config: MatchingConfig = {
        fields: new Map([
          ['email', { strategy: 'exact', weight: 50 }],
          ['age', { strategy: 'exact', weight: 50 }],
        ]),
        thresholds: { noMatch: 20, definiteMatch: 80 },
      }

      const engine = new MatchingEngine<TestPerson>(config)
      const pair = createPair(
        { firstName: 'Jane', lastName: 'Smith', email: 'jane@example.com' },
        { firstName: 'Jane', lastName: 'Smith', email: 'jane@example.com' }
      )

      const result = engine.compare(pair)

      expect(result.total).toBe(100)
      const ageComparison = result.fieldComparisons.find(
        (fc) => fc.field === 'age'
      )
      expect(ageComparison?.similarity).toBe(1)
      expect(ageComparison?.leftValue).toBeUndefined()
      expect(ageComparison?.rightValue).toBeUndefined()
    })

    it('records field comparison details', () => {
      const config: MatchingConfig = {
        fields: new Map([['email', { strategy: 'exact', weight: 100 }]]),
        thresholds: { noMatch: 20, definiteMatch: 80 },
      }

      const engine = new MatchingEngine<TestPerson>(config)
      const pair = createPair(
        { firstName: 'Jane', lastName: 'Smith', email: 'jane@example.com' },
        { firstName: 'Jane', lastName: 'Smith', email: 'jane@example.com' }
      )

      const result = engine.compare(pair)
      const emailComparison = result.fieldComparisons[0]

      expect(emailComparison.field).toBe('email')
      expect(emailComparison.similarity).toBe(1)
      expect(emailComparison.weight).toBe(100)
      expect(emailComparison.weightedScore).toBe(100)
      expect(emailComparison.strategy).toBe('exact')
      expect(emailComparison.leftValue).toBe('jane@example.com')
      expect(emailComparison.rightValue).toBe('jane@example.com')
    })

    it('handles empty field configuration', () => {
      const config: MatchingConfig = {
        fields: new Map(),
        thresholds: { noMatch: 20, definiteMatch: 80 },
      }

      const engine = new MatchingEngine<TestPerson>(config)
      const pair = createPair(
        { firstName: 'Jane', lastName: 'Smith', email: 'jane@example.com' },
        { firstName: 'Jane', lastName: 'Smith', email: 'jane@example.com' }
      )

      const result = engine.compare(pair)

      expect(result.total).toBe(0)
      expect(result.normalizedTotal).toBe(0)
      expect(result.fieldComparisons).toHaveLength(0)
    })
  })

  describe('error handling', () => {
    it('throws error for unknown strategy', () => {
      const config: MatchingConfig = {
        fields: new Map([
          [
            'email',
            { strategy: 'unknown' as any, weight: 100 }, // Cast to bypass TypeScript
          ],
        ]),
        thresholds: { noMatch: 20, definiteMatch: 80 },
      }

      const engine = new MatchingEngine<TestPerson>(config)
      const pair = createPair(
        { firstName: 'Jane', lastName: 'Smith', email: 'jane@example.com' },
        { firstName: 'Jane', lastName: 'Smith', email: 'jane@example.com' }
      )

      expect(() => engine.compare(pair)).toThrow('Unknown strategy: unknown')
    })
  })

  describe('nested field access', () => {
    interface NestedPerson {
      name: { first: string; last: string }
      email: string
    }

    function createNestedPair(
      leftData: NestedPerson,
      rightData: NestedPerson
    ): RecordPair<NestedPerson> {
      return {
        left: { data: leftData, metadata: { id: 'left-1' } },
        right: { data: rightData, metadata: { id: 'right-1' } },
      }
    }

    it('supports dot notation for nested fields', () => {
      const config: MatchingConfig = {
        fields: new Map([
          ['name.first', { strategy: 'exact', weight: 50 }],
          ['name.last', { strategy: 'exact', weight: 50 }],
        ]),
        thresholds: { noMatch: 20, definiteMatch: 80 },
      }

      const engine = new MatchingEngine<NestedPerson>(config)
      const pair = createNestedPair(
        { name: { first: 'Jane', last: 'Smith' }, email: 'jane@example.com' },
        { name: { first: 'Jane', last: 'Smith' }, email: 'other@example.com' }
      )

      const result = engine.compare(pair)

      expect(result.total).toBe(100)
      expect(result.normalizedTotal).toBe(1)
    })
  })
})
