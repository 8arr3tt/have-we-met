import { describe, it, expect } from 'vitest'
import { Resolver } from '../../src/core/resolver'
import type { Record, ResolverConfig } from '../../src/types'

interface TestPerson {
  firstName: string
  lastName: string
  email: string
}

function createRecord(
  data: TestPerson,
  id: string | number = 'test-id'
): Record<TestPerson> {
  return {
    data,
    metadata: { id },
  }
}

function createTestResolver(): Resolver<TestPerson> {
  const config: ResolverConfig<TestPerson> = {
    schema: {
      firstName: { type: 'name', component: 'first' },
      lastName: { type: 'name', component: 'last' },
      email: { type: 'email' },
    },
    matching: {
      fields: new Map([
        ['email', { strategy: 'exact', weight: 50 }],
        ['firstName', { strategy: 'exact', weight: 25 }],
        ['lastName', { strategy: 'exact', weight: 25 }],
      ]),
      thresholds: { noMatch: 20, definiteMatch: 75 },
    },
  }

  return new Resolver<TestPerson>(config)
}

describe('Resolver', () => {
  describe('resolve', () => {
    it('returns "match" outcome for high-scoring candidates', () => {
      const resolver = createTestResolver()
      const input = createRecord({
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane.smith@example.com',
      })

      const candidates = [
        createRecord(
          {
            firstName: 'Jane',
            lastName: 'Smith',
            email: 'jane.smith@example.com',
          },
          '1'
        ),
      ]

      const result = resolver.resolve(input, candidates)

      expect(result.outcome).toBe('match')
      expect(result.bestMatch).not.toBeNull()
      expect(result.bestMatch?.record.metadata.id).toBe('1')
      expect(result.bestMatch?.score.total).toBe(100)
    })

    it('returns "new" outcome when no candidates match', () => {
      const resolver = createTestResolver()
      const input = createRecord({
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane.smith@example.com',
      })

      const candidates = [
        createRecord(
          {
            firstName: 'John',
            lastName: 'Doe',
            email: 'john.doe@example.com',
          },
          '1'
        ),
      ]

      const result = resolver.resolve(input, candidates)

      expect(result.outcome).toBe('new')
      expect(result.bestMatch).toBeNull()
      expect(result.candidates).toHaveLength(0)
    })

    it('returns "new" outcome when score is below noMatch threshold', () => {
      const config: ResolverConfig<TestPerson> = {
        schema: {
          firstName: { type: 'name', component: 'first' },
          lastName: { type: 'name', component: 'last' },
          email: { type: 'email' },
        },
        matching: {
          fields: new Map([
            ['email', { strategy: 'exact', weight: 50 }],
            ['firstName', { strategy: 'exact', weight: 30 }],
            ['lastName', { strategy: 'exact', weight: 20 }],
          ]),
          thresholds: { noMatch: 25, definiteMatch: 75 },
        },
      }

      const resolver = new Resolver<TestPerson>(config)
      const input = createRecord({
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane.smith@example.com',
      })

      const candidates = [
        createRecord(
          {
            firstName: 'John',
            lastName: 'Smith',
            email: 'john.doe@example.com',
          },
          '1'
        ),
      ]

      const result = resolver.resolve(input, candidates)

      expect(result.outcome).toBe('new')
      expect(result.bestMatch).not.toBeNull()
      expect(result.bestMatch?.score.total).toBe(20)
    })

    it('returns "review" outcome for uncertain matches', () => {
      const resolver = createTestResolver()
      const input = createRecord({
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane.smith@example.com',
      })

      const candidates = [
        createRecord(
          {
            firstName: 'Jane',
            lastName: 'Smith',
            email: 'different@example.com',
          },
          '1'
        ),
      ]

      const result = resolver.resolve(input, candidates)

      expect(result.outcome).toBe('review')
      expect(result.bestMatch).not.toBeNull()
      expect(result.bestMatch?.score.total).toBe(50)
    })

    it('sorts candidates by score descending', () => {
      const resolver = createTestResolver()
      const input = createRecord({
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane.smith@example.com',
      })

      const candidates = [
        createRecord(
          {
            firstName: 'Jane',
            lastName: 'Doe',
            email: 'jane.doe@example.com',
          },
          '1'
        ),
        createRecord(
          {
            firstName: 'Jane',
            lastName: 'Smith',
            email: 'jane.smith@example.com',
          },
          '2'
        ),
        createRecord(
          {
            firstName: 'Jane',
            lastName: 'Smith',
            email: 'different@example.com',
          },
          '3'
        ),
      ]

      const result = resolver.resolve(input, candidates)

      expect(result.candidates).toHaveLength(3)
      expect(result.candidates[0].record.metadata.id).toBe('2')
      expect(result.candidates[0].score.total).toBe(100)
      expect(result.candidates[1].record.metadata.id).toBe('3')
      expect(result.candidates[1].score.total).toBe(50)
      expect(result.candidates[2].record.metadata.id).toBe('1')
      expect(result.candidates[2].score.total).toBe(25)
    })

    it('respects maxCandidates option', () => {
      const resolver = createTestResolver()
      const input = createRecord({
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane.smith@example.com',
      })

      const candidates = [
        createRecord(
          {
            firstName: 'Jane',
            lastName: 'Smith',
            email: 'jane.smith@example.com',
          },
          '1'
        ),
        createRecord(
          {
            firstName: 'Jane',
            lastName: 'Smith',
            email: 'different1@example.com',
          },
          '2'
        ),
        createRecord(
          {
            firstName: 'Jane',
            lastName: 'Smith',
            email: 'different2@example.com',
          },
          '3'
        ),
      ]

      const result = resolver.resolve(input, candidates, { maxCandidates: 2 })

      expect(result.candidates).toHaveLength(2)
      expect(result.candidates[0].record.metadata.id).toBe('1')
      expect(result.candidates[1].record.metadata.id).toBe('2')
    })

    it('filters out zero-score candidates', () => {
      const resolver = createTestResolver()
      const input = createRecord({
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane.smith@example.com',
      })

      const candidates = [
        createRecord(
          {
            firstName: 'Jane',
            lastName: 'Smith',
            email: 'jane.smith@example.com',
          },
          '1'
        ),
        createRecord(
          {
            firstName: 'John',
            lastName: 'Doe',
            email: 'john.doe@example.com',
          },
          '2'
        ),
      ]

      const result = resolver.resolve(input, candidates)

      expect(result.candidates).toHaveLength(1)
      expect(result.candidates[0].record.metadata.id).toBe('1')
    })

    it('handles empty candidate list', () => {
      const resolver = createTestResolver()
      const input = createRecord({
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane.smith@example.com',
      })

      const result = resolver.resolve(input, [])

      expect(result.outcome).toBe('new')
      expect(result.candidates).toHaveLength(0)
      expect(result.bestMatch).toBeNull()
    })

    it('includes input record and timestamp in result', () => {
      const resolver = createTestResolver()
      const input = createRecord({
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane.smith@example.com',
      })

      const beforeTime = new Date()
      const result = resolver.resolve(input, [])
      const afterTime = new Date()

      expect(result.inputRecord).toBe(input)
      expect(result.processedAt.getTime()).toBeGreaterThanOrEqual(
        beforeTime.getTime()
      )
      expect(result.processedAt.getTime()).toBeLessThanOrEqual(
        afterTime.getTime()
      )
    })
  })

  describe('explanation generation', () => {
    it('generates explanation with matching fields', () => {
      const resolver = createTestResolver()
      const input = createRecord({
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane.smith@example.com',
      })

      const candidates = [
        createRecord(
          {
            firstName: 'Jane',
            lastName: 'Smith',
            email: 'jane.smith@example.com',
          },
          '1'
        ),
      ]

      const result = resolver.resolve(input, candidates)

      expect(result.bestMatch?.explanation.summary).toBe(
        'Matched on: email, firstName, lastName'
      )
      expect(result.bestMatch?.explanation.fieldComparisons).toHaveLength(3)
      expect(result.bestMatch?.explanation.appliedRules).toEqual([])
    })

    it('generates explanation for partial matches', () => {
      const resolver = createTestResolver()
      const input = createRecord({
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane.smith@example.com',
      })

      const candidates = [
        createRecord(
          {
            firstName: 'Jane',
            lastName: 'Doe',
            email: 'jane.smith@example.com',
          },
          '1'
        ),
      ]

      const result = resolver.resolve(input, candidates)

      expect(result.bestMatch?.explanation.summary).toBe(
        'Matched on: email, firstName'
      )
    })

    it('generates explanation for no matches', () => {
      const resolver = createTestResolver()
      const input = createRecord({
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane.smith@example.com',
      })

      const candidates = [
        createRecord(
          {
            firstName: 'John',
            lastName: 'Doe',
            email: 'john.doe@example.com',
          },
          '1'
        ),
      ]

      const result = resolver.resolve(input, candidates)

      expect(result.candidates).toHaveLength(0)
    })

    it('respects returnExplanation option', () => {
      const resolver = createTestResolver()
      const input = createRecord({
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane.smith@example.com',
      })

      const candidates = [
        createRecord(
          {
            firstName: 'Jane',
            lastName: 'Smith',
            email: 'jane.smith@example.com',
          },
          '1'
        ),
      ]

      const result = resolver.resolve(input, candidates, {
        returnExplanation: false,
      })

      expect(result.bestMatch?.explanation.summary).toBe('')
      expect(result.bestMatch?.explanation.fieldComparisons).toEqual([])
      expect(result.bestMatch?.explanation.appliedRules).toEqual([])
    })
  })

  describe('threshold boundary conditions', () => {
    it('treats score exactly at definiteMatch threshold as match', () => {
      const resolver = createTestResolver()
      const input = createRecord({
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'different@example.com',
      })

      const candidates = [
        createRecord(
          {
            firstName: 'Jane',
            lastName: 'Smith',
            email: 'jane.smith@example.com',
          },
          '1'
        ),
      ]

      const result = resolver.resolve(input, candidates)

      expect(result.bestMatch?.score.total).toBe(50)
      expect(result.outcome).toBe('review')
    })

    it('treats score exactly at noMatch threshold as review', () => {
      const config: ResolverConfig<TestPerson> = {
        schema: {
          firstName: { type: 'name', component: 'first' },
          lastName: { type: 'name', component: 'last' },
          email: { type: 'email' },
        },
        matching: {
          fields: new Map([
            ['email', { strategy: 'exact', weight: 50 }],
            ['firstName', { strategy: 'exact', weight: 25 }],
            ['lastName', { strategy: 'exact', weight: 25 }],
          ]),
          thresholds: { noMatch: 50, definiteMatch: 75 },
        },
      }

      const resolver = new Resolver<TestPerson>(config)
      const input = createRecord({
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'different@example.com',
      })

      const candidates = [
        createRecord(
          {
            firstName: 'Jane',
            lastName: 'Smith',
            email: 'jane.smith@example.com',
          },
          '1'
        ),
      ]

      const result = resolver.resolve(input, candidates)

      expect(result.bestMatch?.score.total).toBe(50)
      expect(result.outcome).toBe('review')
    })
  })
})
