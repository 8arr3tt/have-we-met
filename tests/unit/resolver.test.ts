import { describe, it, expect, beforeEach } from 'vitest'
import { Resolver } from '../../src/core/resolver'
import type { ResolverConfig } from '../../src/types/config'
import { StandardBlockingStrategy } from '../../src/core/blocking/strategies/standard-blocking'
import {
  registerNormalizer,
  clearNormalizers,
} from '../../src/core/normalizers/registry'

interface TestPerson {
  firstName: string
  lastName: string
  email: string
  phone?: string
}

function createTestResolver(
  overrides?: Partial<ResolverConfig<TestPerson>>
): Resolver<TestPerson> {
  const config: ResolverConfig<TestPerson> = {
    schema: {
      firstName: { type: 'name', component: 'first' },
      lastName: { type: 'name', component: 'last' },
      email: { type: 'email' },
      phone: { type: 'phone' },
    },
    matching: {
      fields: new Map([
        ['email', { strategy: 'exact', weight: 20 }],
        ['firstName', { strategy: 'exact', weight: 15 }],
        ['lastName', { strategy: 'exact', weight: 15 }],
      ]),
      thresholds: { noMatch: 20, definiteMatch: 45 },
    },
    ...overrides,
  }

  return new Resolver<TestPerson>(config)
}

describe('Resolver', () => {
  beforeEach(() => {
    clearNormalizers()
    registerNormalizer('uppercase', (value) => {
      if (value == null) return null
      return String(value).toUpperCase()
    })
  })

  describe('constructor', () => {
    it('validates thresholds on construction', () => {
      expect(() => {
        new Resolver<TestPerson>({
          schema: {
            firstName: { type: 'name' },
          },
          matching: {
            fields: new Map([['firstName', { strategy: 'exact', weight: 10 }]]),
            thresholds: { noMatch: 50, definiteMatch: 30 },
          },
        })
      }).toThrow('Invalid thresholds')
    })

    it('requires at least one comparison', () => {
      expect(() => {
        new Resolver<TestPerson>({
          schema: {
            firstName: { type: 'name' },
          },
          matching: {
            fields: new Map(),
            thresholds: { noMatch: 20, definiteMatch: 45 },
          },
        })
      }).toThrow('At least one field comparison must be configured')
    })

    it('validates field names against schema', () => {
      expect(() => {
        new Resolver<TestPerson>({
          schema: {
            firstName: { type: 'name' },
          },
          matching: {
            fields: new Map([
              ['invalidField', { strategy: 'exact', weight: 10 }],
            ]),
            thresholds: { noMatch: 20, definiteMatch: 45 },
          },
        })
      }).toThrow(
        "Field 'invalidField' is configured for matching but not defined in schema"
      )
    })

    it('validates noMatch threshold is non-negative', () => {
      expect(() => {
        new Resolver<TestPerson>({
          schema: {
            firstName: { type: 'name' },
          },
          matching: {
            fields: new Map([['firstName', { strategy: 'exact', weight: 10 }]]),
            thresholds: { noMatch: -5, definiteMatch: 45 },
          },
        })
      }).toThrow('noMatch threshold must be non-negative')
    })
  })

  describe('resolve', () => {
    it('finds definite matches above threshold', () => {
      const resolver = createTestResolver()
      const candidate = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@example.com',
      }

      const existingRecords = [
        {
          firstName: 'John',
          lastName: 'Doe',
          email: 'john.doe@example.com',
        },
        {
          firstName: 'Jane',
          lastName: 'Smith',
          email: 'jane.smith@example.com',
        },
      ]

      const results = resolver.resolve(candidate, existingRecords)

      expect(results).toHaveLength(2)
      expect(results[0].outcome).toBe('definite-match')
      expect(results[0].score.totalScore).toBeGreaterThanOrEqual(45)
      expect(results[0].candidateRecord).toEqual(existingRecords[0])
    })

    it('identifies potential matches in between thresholds', () => {
      const resolver = createTestResolver()
      const candidate = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'different@example.com',
      }

      const existingRecords = [
        {
          firstName: 'John',
          lastName: 'Doe',
          email: 'john.doe@example.com',
        },
      ]

      const results = resolver.resolve(candidate, existingRecords)

      expect(results).toHaveLength(1)
      expect(results[0].outcome).toBe('potential-match')
      expect(results[0].score.totalScore).toBeGreaterThanOrEqual(20)
      expect(results[0].score.totalScore).toBeLessThan(45)
    })

    it('filters out no matches below threshold', () => {
      const resolver = createTestResolver()
      const candidate = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@example.com',
      }

      const existingRecords = [
        {
          firstName: 'Jane',
          lastName: 'Smith',
          email: 'jane.smith@example.com',
        },
      ]

      const results = resolver.resolve(candidate, existingRecords)

      expect(results).toHaveLength(1)
      expect(results[0].outcome).toBe('no-match')
      expect(results[0].score.totalScore).toBeLessThan(20)
    })

    it('applies blocking to reduce candidates', () => {
      const blockingStrategy = new StandardBlockingStrategy<
        Record<string, unknown>
      >({
        name: 'emailDomain',
        field: 'email',
        transform: (value) => {
          const email = value as string
          return email.split('@')[1]
        },
      })

      const resolver = createTestResolver({
        blocking: { strategy: blockingStrategy },
      })

      const candidate = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
      }

      const existingRecords = [
        {
          firstName: 'Jane',
          lastName: 'Smith',
          email: 'jane@example.com',
        },
        {
          firstName: 'Bob',
          lastName: 'Johnson',
          email: 'bob@different.com',
        },
      ]

      const results = resolver.resolve(candidate, existingRecords)

      expect(results.length).toBeGreaterThanOrEqual(1)
    })

    it('applies normalizers before comparison', () => {
      const resolver = createTestResolver({
        schema: {
          firstName: { type: 'name', normalizer: 'uppercase' },
          lastName: { type: 'name', normalizer: 'uppercase' },
          email: { type: 'email', normalizer: 'uppercase' },
        },
      })

      const candidate = {
        firstName: 'john',
        lastName: 'doe',
        email: 'john@example.com',
      }

      const existingRecords = [
        {
          firstName: 'JOHN',
          lastName: 'DOE',
          email: 'JOHN@EXAMPLE.COM',
        },
      ]

      const results = resolver.resolve(candidate, existingRecords)

      expect(results).toHaveLength(1)
      expect(results[0].outcome).toBe('definite-match')
    })

    it('returns results sorted by score', () => {
      const resolver = createTestResolver()
      const candidate = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@example.com',
      }

      const existingRecords = [
        {
          firstName: 'Jane',
          lastName: 'Doe',
          email: 'jane@example.com',
        },
        {
          firstName: 'John',
          lastName: 'Doe',
          email: 'john.doe@example.com',
        },
        {
          firstName: 'John',
          lastName: 'Smith',
          email: 'john@example.com',
        },
      ]

      const results = resolver.resolve(candidate, existingRecords)

      expect(results[0].candidateRecord).toEqual(existingRecords[1])
      expect(results[0].score.totalScore).toBeGreaterThanOrEqual(
        results[1].score.totalScore
      )
      expect(results[1].score.totalScore).toBeGreaterThanOrEqual(
        results[2].score.totalScore
      )
    })

    it('includes explanations in results', () => {
      const resolver = createTestResolver()
      const candidate = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@example.com',
      }

      const existingRecords = [
        {
          firstName: 'John',
          lastName: 'Doe',
          email: 'john.doe@example.com',
        },
      ]

      const results = resolver.resolve(candidate, existingRecords)

      expect(results[0].explanation).toBeTruthy()
      expect(results[0].explanation).toContain('Match Outcome')
      expect(results[0].explanation).toContain('Field Comparisons')
    })

    it('handles empty existing records', () => {
      const resolver = createTestResolver()
      const candidate = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@example.com',
      }

      const results = resolver.resolve(candidate, [])

      expect(results).toHaveLength(0)
    })

    it('handles no matches found', () => {
      const resolver = createTestResolver({
        matching: {
          fields: new Map([['email', { strategy: 'exact', weight: 50 }]]),
          thresholds: { noMatch: 40, definiteMatch: 50 },
        },
      })

      const candidate = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@example.com',
      }

      const existingRecords = [
        {
          firstName: 'Jane',
          lastName: 'Smith',
          email: 'jane.smith@example.com',
        },
      ]

      const results = resolver.resolve(candidate, existingRecords)

      expect(results).toHaveLength(1)
      expect(results[0].outcome).toBe('no-match')
    })

    it('respects maxResults option', () => {
      const resolver = createTestResolver()
      const candidate = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@example.com',
      }

      const existingRecords = [
        { firstName: 'John', lastName: 'Doe', email: 'john.doe@example.com' },
        { firstName: 'John', lastName: 'Doe', email: 'john@example.com' },
        {
          firstName: 'John',
          lastName: 'Smith',
          email: 'john.smith@example.com',
        },
        { firstName: 'Jane', lastName: 'Doe', email: 'jane.doe@example.com' },
      ]

      const results = resolver.resolve(candidate, existingRecords, {
        maxResults: 2,
      })

      expect(results).toHaveLength(2)
    })
  })

  describe('findMatches', () => {
    it('returns all matches above minimum score', () => {
      const resolver = createTestResolver()
      const candidate = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@example.com',
      }

      const existingRecords = [
        { firstName: 'John', lastName: 'Doe', email: 'john.doe@example.com' },
        { firstName: 'John', lastName: 'Doe', email: 'different@example.com' },
        { firstName: 'Jane', lastName: 'Smith', email: 'jane@example.com' },
      ]

      const results = resolver.findMatches(candidate, existingRecords, 15)

      expect(results.length).toBeGreaterThan(0)
      results.forEach((result) => {
        expect(result.score.totalScore).toBeGreaterThanOrEqual(15)
      })
    })

    it('respects minScore parameter', () => {
      const resolver = createTestResolver()
      const candidate = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@example.com',
      }

      const existingRecords = [
        { firstName: 'John', lastName: 'Doe', email: 'john.doe@example.com' },
        { firstName: 'Jane', lastName: 'Smith', email: 'jane@example.com' },
      ]

      const results = resolver.findMatches(candidate, existingRecords, 30)

      expect(results.length).toBeGreaterThan(0)
      results.forEach((result) => {
        expect(result.score.totalScore).toBeGreaterThanOrEqual(30)
      })
    })

    it('uses noMatch threshold when minScore not provided', () => {
      const resolver = createTestResolver()
      const candidate = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@example.com',
      }

      const existingRecords = [
        { firstName: 'John', lastName: 'Doe', email: 'john.doe@example.com' },
        { firstName: 'Jane', lastName: 'Smith', email: 'jane@example.com' },
      ]

      const results = resolver.findMatches(candidate, existingRecords)

      results.forEach((result) => {
        expect(result.score.totalScore).toBeGreaterThanOrEqual(20)
      })
    })
  })

  describe('deduplicateBatch', () => {
    it('finds duplicates across dataset', () => {
      const resolver = createTestResolver()
      const records = [
        { firstName: 'John', lastName: 'Doe', email: 'john.doe@example.com' },
        { firstName: 'John', lastName: 'Doe', email: 'john.doe@example.com' },
        {
          firstName: 'Jane',
          lastName: 'Smith',
          email: 'jane.smith@example.com',
        },
      ]

      const result = resolver.deduplicateBatch(records)

      expect(result.results.length).toBeGreaterThan(0)
      expect(result.stats.recordsProcessed).toBe(3)
      expect(result.stats.comparisonsMade).toBe(3)
      expect(result.stats.definiteMatchesFound).toBeGreaterThan(0)
    })

    it('applies blocking to reduce comparisons', () => {
      const blockingStrategy = new StandardBlockingStrategy<
        Record<string, unknown>
      >({
        name: 'emailDomain',
        field: 'email',
        transform: (value) => {
          const email = value as string
          return email.split('@')[1]
        },
      })

      const resolver = createTestResolver({
        blocking: { strategies: [blockingStrategy], mode: 'single' },
      })

      const records = [
        { firstName: 'John', lastName: 'Doe', email: 'john@example.com' },
        { firstName: 'Jane', lastName: 'Smith', email: 'jane@example.com' },
        { firstName: 'Bob', lastName: 'Johnson', email: 'bob@different.com' },
        { firstName: 'Alice', lastName: 'Brown', email: 'alice@example.com' },
      ]

      const result = resolver.deduplicateBatch(records)

      expect(result.stats.recordsProcessed).toBe(4)
      expect(result.stats.comparisonsMade).toBeLessThan(6)
    })

    it('respects maxPairsPerRecord option', () => {
      const resolver = createTestResolver()
      const records = [
        { firstName: 'John', lastName: 'Doe', email: 'john.doe@example.com' },
        { firstName: 'John', lastName: 'Doe', email: 'john.doe@example.com' },
        { firstName: 'John', lastName: 'Doe', email: 'john.doe@example.com' },
        { firstName: 'John', lastName: 'Doe', email: 'john.doe@example.com' },
      ]

      const result = resolver.deduplicateBatch(records, {
        maxPairsPerRecord: 2,
      })

      result.results.forEach((dedupResult) => {
        expect(dedupResult.matches.length).toBeLessThanOrEqual(2)
      })
    })

    it('respects minScore option', () => {
      const resolver = createTestResolver()
      const records = [
        { firstName: 'John', lastName: 'Doe', email: 'john.doe@example.com' },
        { firstName: 'John', lastName: 'Doe', email: 'different@example.com' },
        { firstName: 'Jane', lastName: 'Smith', email: 'jane@example.com' },
      ]

      const result = resolver.deduplicateBatch(records, { minScore: 30 })

      result.results.forEach((dedupResult) => {
        dedupResult.matches.forEach((match) => {
          expect(match.score.totalScore).toBeGreaterThanOrEqual(30)
        })
      })
    })

    it('handles includeNoMatches option', () => {
      const resolver = createTestResolver()
      const records = [
        { firstName: 'John', lastName: 'Doe', email: 'john.doe@example.com' },
        { firstName: 'Jane', lastName: 'Smith', email: 'jane@example.com' },
        { firstName: 'Bob', lastName: 'Johnson', email: 'bob@example.com' },
      ]

      const resultWithNoMatches = resolver.deduplicateBatch(records, {
        includeNoMatches: true,
      })
      const resultWithoutNoMatches = resolver.deduplicateBatch(records)

      expect(resultWithNoMatches.results.length).toBeGreaterThanOrEqual(
        resultWithoutNoMatches.results.length
      )
    })

    it('groups matches by record', () => {
      const resolver = createTestResolver()
      const records = [
        { firstName: 'John', lastName: 'Doe', email: 'john.doe@example.com' },
        { firstName: 'John', lastName: 'Doe', email: 'john.doe@example.com' },
        {
          firstName: 'Jane',
          lastName: 'Smith',
          email: 'jane.smith@example.com',
        },
      ]

      const result = resolver.deduplicateBatch(records)

      result.results.forEach((dedupResult) => {
        expect(dedupResult.record).toBeDefined()
        expect(dedupResult.matches).toBeInstanceOf(Array)
        expect(dedupResult.matchCount).toBe(dedupResult.matches.length)
      })
    })

    it('provides statistics', () => {
      const resolver = createTestResolver()
      const records = [
        { firstName: 'John', lastName: 'Doe', email: 'john.doe@example.com' },
        { firstName: 'John', lastName: 'Doe', email: 'john.doe@example.com' },
        {
          firstName: 'Jane',
          lastName: 'Smith',
          email: 'jane.smith@example.com',
        },
      ]

      const result = resolver.deduplicateBatch(records)

      expect(result.stats).toBeDefined()
      expect(result.stats.recordsProcessed).toBe(3)
      expect(result.stats.comparisonsMade).toBeGreaterThan(0)
      expect(typeof result.stats.definiteMatchesFound).toBe('number')
      expect(typeof result.stats.potentialMatchesFound).toBe('number')
      expect(typeof result.stats.noMatchesFound).toBe('number')
      expect(typeof result.stats.recordsWithMatches).toBe('number')
      expect(typeof result.stats.recordsWithoutMatches).toBe('number')
    })

    it('handles empty datasets', () => {
      const resolver = createTestResolver()

      const result = resolver.deduplicateBatch([])

      expect(result.results).toHaveLength(0)
      expect(result.stats.recordsProcessed).toBe(0)
      expect(result.stats.comparisonsMade).toBe(0)
    })

    it('handles datasets with no duplicates', () => {
      const resolver = createTestResolver()
      const records = [
        { firstName: 'John', lastName: 'Doe', email: 'john@example.com' },
        { firstName: 'Jane', lastName: 'Smith', email: 'jane@example.com' },
        { firstName: 'Bob', lastName: 'Johnson', email: 'bob@example.com' },
      ]

      const result = resolver.deduplicateBatch(records)

      expect(result.stats.recordsProcessed).toBe(3)
      expect(result.stats.comparisonsMade).toBe(3)
    })

    it('correctly identifies definite matches', () => {
      const resolver = createTestResolver()
      const records = [
        {
          firstName: 'John',
          lastName: 'Doe',
          email: 'john.doe@example.com',
          phone: '555-0100',
        },
        {
          firstName: 'John',
          lastName: 'Doe',
          email: 'john.doe@example.com',
          phone: '555-0100',
        },
      ]

      const result = resolver.deduplicateBatch(records)

      const recordWithMatches = result.results.find((r) => r.hasDefiniteMatches)
      expect(recordWithMatches).toBeDefined()
      expect(recordWithMatches!.hasDefiniteMatches).toBe(true)
    })

    it('correctly identifies potential matches', () => {
      const resolver = createTestResolver()
      const records = [
        { firstName: 'John', lastName: 'Doe', email: 'john.doe@example.com' },
        { firstName: 'John', lastName: 'Doe', email: 'different@example.com' },
      ]

      const result = resolver.deduplicateBatch(records)

      const recordWithMatches = result.results.find(
        (r) => r.hasPotentialMatches
      )
      expect(recordWithMatches).toBeDefined()
      expect(recordWithMatches!.hasPotentialMatches).toBe(true)
    })

    it('sorts matches by score within each record', () => {
      const resolver = createTestResolver()
      const records = [
        { firstName: 'John', lastName: 'Doe', email: 'john.doe@example.com' },
        { firstName: 'John', lastName: 'Doe', email: 'john.doe@example.com' },
        { firstName: 'John', lastName: 'Doe', email: 'different@example.com' },
      ]

      const result = resolver.deduplicateBatch(records)

      result.results.forEach((dedupResult) => {
        for (let i = 1; i < dedupResult.matches.length; i++) {
          expect(
            dedupResult.matches[i - 1].score.totalScore
          ).toBeGreaterThanOrEqual(dedupResult.matches[i].score.totalScore)
        }
      })
    })
  })
})
