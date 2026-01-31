import { describe, it, expect } from 'vitest'
import { Resolver } from '../../src/core/resolver'
import type { ResolverConfig } from '../../src/types/config'
import { StandardBlockingStrategy } from '../../src/core/blocking/strategies/standard-blocking'

interface TestPerson {
  id?: number
  firstName: string
  lastName: string
  email: string
  phone?: string
}

describe('Integration: Batch Deduplication', () => {
  const createResolver = (useBlocking = false): Resolver<TestPerson> => {
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
          ['firstName', { strategy: 'jaro-winkler', weight: 10, threshold: 0.85 }],
          ['lastName', { strategy: 'jaro-winkler', weight: 10, threshold: 0.85 }],
          ['phone', { strategy: 'exact', weight: 15 }],
        ]),
        thresholds: { noMatch: 20, definiteMatch: 45 },
      },
    }

    if (useBlocking) {
      config.blocking = {
        strategies: [
          new StandardBlockingStrategy<Record<string, unknown>>({
            name: 'emailDomain',
            field: 'email',
            transform: (value) => {
              const email = value as string
              return email.split('@')[1]
            },
          }),
        ],
        mode: 'single',
      }
    }

    return new Resolver<TestPerson>(config)
  }

  describe('basic deduplication', () => {
    it('finds all duplicates in dataset', () => {
      const resolver = createResolver()
      const records: TestPerson[] = [
        { id: 1, firstName: 'John', lastName: 'Doe', email: 'john.doe@example.com', phone: '555-0100' },
        { id: 2, firstName: 'John', lastName: 'Doe', email: 'john.doe@example.com', phone: '555-0100' },
        { id: 3, firstName: 'Jane', lastName: 'Smith', email: 'jane.smith@example.com', phone: '555-0200' },
        { id: 4, firstName: 'Jane', lastName: 'Smith', email: 'jane.smith@example.com', phone: '555-0200' },
        { id: 5, firstName: 'Bob', lastName: 'Johnson', email: 'bob@example.com' },
      ]

      const result = resolver.deduplicateBatch(records)

      expect(result.stats.recordsProcessed).toBe(5)
      expect(result.stats.comparisonsMade).toBe(10)
      expect(result.stats.definiteMatchesFound).toBeGreaterThan(0)

      const johnDoeResults = result.results.filter(
        (r) => (r.record as TestPerson).firstName === 'John' && (r.record as TestPerson).lastName === 'Doe'
      )
      expect(johnDoeResults.length).toBe(2)
      johnDoeResults.forEach((dedupResult) => {
        expect(dedupResult.hasDefiniteMatches).toBe(true)
        expect(dedupResult.matchCount).toBeGreaterThan(0)
      })
    })

    it('handles dataset with no duplicates', () => {
      const resolver = createResolver()
      const records: TestPerson[] = [
        { id: 1, firstName: 'John', lastName: 'Doe', email: 'john@example.com' },
        { id: 2, firstName: 'Jane', lastName: 'Smith', email: 'jane@example.com' },
        { id: 3, firstName: 'Bob', lastName: 'Johnson', email: 'bob@example.com' },
      ]

      const result = resolver.deduplicateBatch(records)

      expect(result.stats.recordsProcessed).toBe(3)
      expect(result.stats.comparisonsMade).toBe(3)
      expect(result.results.length).toBe(0)
    })

    it('identifies potential matches separately from definite matches', () => {
      const resolver = createResolver()
      const records: TestPerson[] = [
        { id: 1, firstName: 'John', lastName: 'Doe', email: 'john.doe@example.com', phone: '555-0100' },
        { id: 2, firstName: 'John', lastName: 'Doe', email: 'john.doe@example.com', phone: '555-0100' },
        { id: 3, firstName: 'John', lastName: 'Doe', email: 'different@example.com', phone: '555-0200' },
      ]

      const result = resolver.deduplicateBatch(records)

      const definiteMatches = result.results.filter((r) => r.hasDefiniteMatches)
      const potentialMatches = result.results.filter(
        (r) => r.hasPotentialMatches && !r.hasDefiniteMatches
      )

      expect(definiteMatches.length).toBeGreaterThan(0)
      expect(potentialMatches.length).toBeGreaterThan(0)
    })
  })

  describe('with blocking strategy', () => {
    it('reduces comparisons with diverse email domains', () => {
      const resolverWithoutBlocking = createResolver(false)
      const resolverWithBlocking = createResolver(true)

      const records: TestPerson[] = [
        { id: 1, firstName: 'John', lastName: 'Doe', email: 'john@domainA.com' },
        { id: 2, firstName: 'Jane', lastName: 'Smith', email: 'jane@domainA.com' },
        { id: 3, firstName: 'Bob', lastName: 'Johnson', email: 'bob@domainB.com' },
        { id: 4, firstName: 'Alice', lastName: 'Williams', email: 'alice@domainB.com' },
        { id: 5, firstName: 'Charlie', lastName: 'Brown', email: 'charlie@domainC.com' },
        { id: 6, firstName: 'David', lastName: 'Lee', email: 'david@domainC.com' },
        { id: 7, firstName: 'Emma', lastName: 'Wilson', email: 'emma@domainD.com' },
        { id: 8, firstName: 'Frank', lastName: 'Moore', email: 'frank@domainD.com' },
      ]

      const resultWithoutBlocking = resolverWithoutBlocking.deduplicateBatch(records)
      const resultWithBlocking = resolverWithBlocking.deduplicateBatch(records)

      expect(resultWithoutBlocking.stats.comparisonsMade).toBe(28)
      expect(resultWithBlocking.stats.comparisonsMade).toBeLessThan(
        resultWithoutBlocking.stats.comparisonsMade
      )
      expect(resultWithBlocking.stats.comparisonsMade).toBeLessThanOrEqual(8)
    })

    it('still finds matches within same block', () => {
      const resolver = createResolver(true)
      const records: TestPerson[] = [
        { id: 1, firstName: 'John', lastName: 'Doe', email: 'john1@example.com' },
        { id: 2, firstName: 'John', lastName: 'Doe', email: 'john2@example.com' },
        { id: 3, firstName: 'Bob', lastName: 'Smith', email: 'bob@different.com' },
      ]

      const result = resolver.deduplicateBatch(records)

      const exampleDomainResults = result.results.filter(
        (r) => (r.record as TestPerson).email?.includes('@example.com')
      )
      expect(exampleDomainResults.length).toBeGreaterThan(0)
    })
  })

  describe('options handling', () => {
    it('respects maxPairsPerRecord limit', () => {
      const resolver = createResolver()
      const records: TestPerson[] = [
        { id: 1, firstName: 'John', lastName: 'Doe', email: 'john.doe@example.com' },
        { id: 2, firstName: 'John', lastName: 'Doe', email: 'john.doe@example.com' },
        { id: 3, firstName: 'John', lastName: 'Doe', email: 'john.doe@example.com' },
        { id: 4, firstName: 'John', lastName: 'Doe', email: 'john.doe@example.com' },
      ]

      const result = resolver.deduplicateBatch(records, { maxPairsPerRecord: 2 })

      result.results.forEach((dedupResult) => {
        expect(dedupResult.matches.length).toBeLessThanOrEqual(2)
        expect(dedupResult.matchCount).toBeLessThanOrEqual(2)
      })
    })

    it('respects minScore threshold', () => {
      const resolver = createResolver()
      const records: TestPerson[] = [
        { id: 1, firstName: 'John', lastName: 'Doe', email: 'john.doe@example.com', phone: '555-0100' },
        { id: 2, firstName: 'John', lastName: 'Doe', email: 'john.doe@example.com', phone: '555-0100' },
        { id: 3, firstName: 'John', lastName: 'Doe', email: 'different@example.com' },
      ]

      const result = resolver.deduplicateBatch(records, { minScore: 50 })

      result.results.forEach((dedupResult) => {
        dedupResult.matches.forEach((match) => {
          expect(match.score.totalScore).toBeGreaterThanOrEqual(50)
        })
      })
    })

    it('includes records with no matches when requested', () => {
      const resolver = createResolver()
      const records: TestPerson[] = [
        { id: 1, firstName: 'John', lastName: 'Doe', email: 'john@example.com' },
        { id: 2, firstName: 'Jane', lastName: 'Smith', email: 'jane@example.com' },
        { id: 3, firstName: 'Bob', lastName: 'Johnson', email: 'bob@example.com' },
      ]

      const resultWithNoMatches = resolver.deduplicateBatch(records, { includeNoMatches: true })
      const resultWithoutNoMatches = resolver.deduplicateBatch(records, { includeNoMatches: false })

      expect(resultWithNoMatches.results.length).toBe(3)
      expect(resultWithoutNoMatches.results.length).toBe(0)
    })
  })

  describe('result structure', () => {
    it('provides complete deduplication result for each record', () => {
      const resolver = createResolver()
      const records: TestPerson[] = [
        { id: 1, firstName: 'John', lastName: 'Doe', email: 'john.doe@example.com' },
        { id: 2, firstName: 'John', lastName: 'Doe', email: 'john.doe@example.com' },
      ]

      const result = resolver.deduplicateBatch(records)

      result.results.forEach((dedupResult) => {
        expect(dedupResult.record).toBeDefined()
        expect(dedupResult.matches).toBeInstanceOf(Array)
        expect(typeof dedupResult.hasDefiniteMatches).toBe('boolean')
        expect(typeof dedupResult.hasPotentialMatches).toBe('boolean')
        expect(typeof dedupResult.matchCount).toBe('number')
        expect(dedupResult.matchCount).toBe(dedupResult.matches.length)

        dedupResult.matches.forEach((match) => {
          expect(match.outcome).toBeDefined()
          expect(match.candidateRecord).toBeDefined()
          expect(match.score).toBeDefined()
          expect(match.explanation).toBeDefined()
        })
      })
    })

    it('sorts matches by score for each record', () => {
      const resolver = createResolver()
      const records: TestPerson[] = [
        { id: 1, firstName: 'John', lastName: 'Doe', email: 'john.doe@example.com', phone: '555-0100' },
        { id: 2, firstName: 'John', lastName: 'Doe', email: 'john.doe@example.com', phone: '555-0100' },
        { id: 3, firstName: 'John', lastName: 'Doe', email: 'different@example.com' },
      ]

      const result = resolver.deduplicateBatch(records)

      result.results.forEach((dedupResult) => {
        for (let i = 1; i < dedupResult.matches.length; i++) {
          expect(dedupResult.matches[i - 1].score.totalScore).toBeGreaterThanOrEqual(
            dedupResult.matches[i].score.totalScore
          )
        }
      })
    })
  })

  describe('statistics', () => {
    it('provides comprehensive statistics', () => {
      const resolver = createResolver()
      const records: TestPerson[] = [
        { id: 1, firstName: 'John', lastName: 'Doe', email: 'john.doe@example.com' },
        { id: 2, firstName: 'John', lastName: 'Doe', email: 'john.doe@example.com' },
        { id: 3, firstName: 'Jane', lastName: 'Smith', email: 'jane@example.com' },
      ]

      const result = resolver.deduplicateBatch(records)

      expect(result.stats.recordsProcessed).toBe(3)
      expect(result.stats.comparisonsMade).toBeGreaterThan(0)
      expect(typeof result.stats.definiteMatchesFound).toBe('number')
      expect(typeof result.stats.potentialMatchesFound).toBe('number')
      expect(typeof result.stats.noMatchesFound).toBe('number')
      expect(typeof result.stats.recordsWithMatches).toBe('number')
      expect(typeof result.stats.recordsWithoutMatches).toBe('number')

      expect(
        result.stats.recordsWithMatches + result.stats.recordsWithoutMatches
      ).toBe(result.stats.recordsProcessed)
    })

    it('accurately counts match types', () => {
      const resolver = createResolver()
      const records: TestPerson[] = [
        { id: 1, firstName: 'John', lastName: 'Doe', email: 'john.doe@example.com', phone: '555-0100' },
        { id: 2, firstName: 'John', lastName: 'Doe', email: 'john.doe@example.com', phone: '555-0100' },
        { id: 3, firstName: 'John', lastName: 'Doe', email: 'different@example.com' },
      ]

      const result = resolver.deduplicateBatch(records)

      expect(result.stats.definiteMatchesFound).toBeGreaterThan(0)
      expect(result.stats.potentialMatchesFound).toBeGreaterThan(0)
    })
  })

  describe('large dataset performance', () => {
    it('handles 100 records efficiently with blocking', () => {
      const resolver = createResolver(true)
      const records: TestPerson[] = []

      for (let i = 0; i < 100; i++) {
        const domain = i % 5 === 0 ? 'example.com' : `domain${i % 10}.com`
        records.push({
          id: i,
          firstName: `Person${i}`,
          lastName: `Last${i}`,
          email: `person${i}@${domain}`,
        })
      }

      records.push({ id: 100, firstName: 'Person0', lastName: 'Last0', email: 'person0@example.com' })

      const startTime = Date.now()
      const result = resolver.deduplicateBatch(records)
      const endTime = Date.now()

      expect(result.stats.recordsProcessed).toBe(101)
      expect(endTime - startTime).toBeLessThan(1000)
    })
  })
})
