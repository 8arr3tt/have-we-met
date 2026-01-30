import { describe, it, expect } from 'vitest'
import { HaveWeMet } from '../../src'
import { createPersonRecord, type Person } from '../fixtures/records'

/**
 * Full Resolution Flow Integration Tests
 *
 * These tests demonstrate the complete end-to-end usage of the have-we-met library.
 * They serve as both test coverage and usage examples for the API.
 */
describe('Full Resolution Flow', () => {
  describe('Exact Match Scenarios', () => {
    it('should identify exact matches with high confidence', () => {
      // Build a resolver with the fluent API
      const resolver = HaveWeMet.create<Person>()
        .schema((s) =>
          s
            .field('firstName', { type: 'name', component: 'first' })
            .field('lastName', { type: 'name', component: 'last' })
            .field('email', { type: 'email' })
        )
        .matching((m) =>
          m
            .field('email')
            .strategy('exact')
            .weight(50)
            .field('firstName')
            .strategy('exact')
            .weight(25)
            .field('lastName')
            .strategy('exact')
            .weight(25)
        )
        .thresholds({ noMatch: 20, definiteMatch: 75 })
        .build()

      // Create input record
      const input = createPersonRecord(
        {
          firstName: 'Jane',
          lastName: 'Smith',
          email: 'jane.smith@example.com',
        },
        'input'
      )

      // Create candidate records
      const candidates = [
        createPersonRecord(
          {
            firstName: 'Jane',
            lastName: 'Smith',
            email: 'jane.smith@example.com',
          },
          '1'
        ),
        createPersonRecord(
          {
            firstName: 'Jane',
            lastName: 'Doe',
            email: 'jane.doe@example.com',
          },
          '2'
        ),
      ]

      // Resolve
      const result = resolver.resolve(input, candidates)

      // Verify match outcome
      expect(result.outcome).toBe('match')
      expect(result.bestMatch).not.toBeNull()
      expect(result.bestMatch?.record.metadata.id).toBe('1')
      expect(result.bestMatch?.score.total).toBe(100)

      // Verify explanation
      expect(result.bestMatch?.explanation.summary).toContain('email')
      expect(result.bestMatch?.explanation.fieldComparisons).toHaveLength(3)

      // Verify all fields matched
      const emailComparison = result.bestMatch?.score.fieldComparisons.find(
        (fc) => fc.field === 'email'
      )
      expect(emailComparison?.similarity).toBe(1)
      expect(emailComparison?.weightedScore).toBe(50)
    })

    it('should return "new" outcome for no matches', () => {
      const resolver = HaveWeMet.create<Person>()
        .schema((s) =>
          s
            .field('firstName', { type: 'name', component: 'first' })
            .field('lastName', { type: 'name', component: 'last' })
            .field('email', { type: 'email' })
        )
        .matching((m) =>
          m
            .field('email')
            .strategy('exact')
            .weight(50)
            .field('firstName')
            .strategy('exact')
            .weight(25)
            .field('lastName')
            .strategy('exact')
            .weight(25)
        )
        .thresholds({ noMatch: 20, definiteMatch: 75 })
        .build()

      const input = createPersonRecord(
        {
          firstName: 'Alice',
          lastName: 'Johnson',
          email: 'alice.johnson@example.com',
        },
        'input'
      )

      const candidates = [
        createPersonRecord(
          {
            firstName: 'Bob',
            lastName: 'Williams',
            email: 'bob.williams@example.com',
          },
          '1'
        ),
        createPersonRecord(
          {
            firstName: 'Charlie',
            lastName: 'Brown',
            email: 'charlie.brown@example.com',
          },
          '2'
        ),
      ]

      const result = resolver.resolve(input, candidates)

      expect(result.outcome).toBe('new')
      expect(result.bestMatch).toBeNull()
      expect(result.candidates).toHaveLength(0)
    })

    it('should return "review" outcome for uncertain matches', () => {
      const resolver = HaveWeMet.create<Person>()
        .schema((s) =>
          s
            .field('firstName', { type: 'name', component: 'first' })
            .field('lastName', { type: 'name', component: 'last' })
            .field('email', { type: 'email' })
        )
        .matching((m) =>
          m
            .field('email')
            .strategy('exact')
            .weight(50)
            .field('firstName')
            .strategy('exact')
            .weight(25)
            .field('lastName')
            .strategy('exact')
            .weight(25)
        )
        .thresholds({ noMatch: 20, definiteMatch: 75 })
        .build()

      // Input matches on first name only (25 points)
      const input = createPersonRecord(
        {
          firstName: 'Jane',
          lastName: 'Smith',
          email: 'jane.smith@example.com',
        },
        'input'
      )

      const candidates = [
        createPersonRecord(
          {
            firstName: 'Jane',
            lastName: 'Doe',
            email: 'jane.doe@example.com',
          },
          '1'
        ),
      ]

      const result = resolver.resolve(input, candidates)

      expect(result.outcome).toBe('review')
      expect(result.bestMatch).not.toBeNull()
      expect(result.bestMatch?.record.metadata.id).toBe('1')
      expect(result.bestMatch?.score.total).toBe(25) // Only firstName matches

      // Should be in the uncertain range
      expect(result.bestMatch?.score.total).toBeGreaterThanOrEqual(20)
      expect(result.bestMatch?.score.total).toBeLessThan(75)
    })
  })

  describe('Multiple Candidates', () => {
    it('should rank candidates by score', () => {
      const resolver = HaveWeMet.create<Person>()
        .schema((s) =>
          s
            .field('firstName', { type: 'name', component: 'first' })
            .field('lastName', { type: 'name', component: 'last' })
            .field('email', { type: 'email' })
        )
        .matching((m) =>
          m
            .field('email')
            .strategy('exact')
            .weight(50)
            .field('firstName')
            .strategy('exact')
            .weight(25)
            .field('lastName')
            .strategy('exact')
            .weight(25)
        )
        .thresholds({ noMatch: 20, definiteMatch: 75 })
        .build()

      const input = createPersonRecord(
        {
          firstName: 'Jane',
          lastName: 'Smith',
          email: 'jane.smith@example.com',
        },
        'input'
      )

      const candidates = [
        // Perfect match (100 points)
        createPersonRecord(
          {
            firstName: 'Jane',
            lastName: 'Smith',
            email: 'jane.smith@example.com',
          },
          '1'
        ),
        // Email + first name match (75 points)
        createPersonRecord(
          {
            firstName: 'Jane',
            lastName: 'Doe',
            email: 'jane.smith@example.com',
          },
          '2'
        ),
        // First name only (25 points)
        createPersonRecord(
          {
            firstName: 'Jane',
            lastName: 'Johnson',
            email: 'jane.johnson@example.com',
          },
          '3'
        ),
      ]

      const result = resolver.resolve(input, candidates)

      expect(result.outcome).toBe('match')
      expect(result.candidates).toHaveLength(3)

      // Verify ranking by score
      expect(result.candidates[0].record.metadata.id).toBe('1')
      expect(result.candidates[0].score.total).toBe(100)

      expect(result.candidates[1].record.metadata.id).toBe('2')
      expect(result.candidates[1].score.total).toBe(75)

      expect(result.candidates[2].record.metadata.id).toBe('3')
      expect(result.candidates[2].score.total).toBe(25)
    })

    it('should respect maxCandidates option', () => {
      const resolver = HaveWeMet.create<Person>()
        .schema((s) =>
          s
            .field('firstName', { type: 'name', component: 'first' })
            .field('lastName', { type: 'name', component: 'last' })
            .field('email', { type: 'email' })
        )
        .matching((m) =>
          m.field('firstName').strategy('exact').weight(100)
        )
        .thresholds({ noMatch: 10, definiteMatch: 80 })
        .build()

      const input = createPersonRecord({ firstName: 'Jane' }, 'input')

      const candidates = [
        createPersonRecord({ firstName: 'Jane' }, '1'),
        createPersonRecord({ firstName: 'Jane' }, '2'),
        createPersonRecord({ firstName: 'Jane' }, '3'),
        createPersonRecord({ firstName: 'Jane' }, '4'),
        createPersonRecord({ firstName: 'Jane' }, '5'),
      ]

      const result = resolver.resolve(input, candidates, { maxCandidates: 2 })

      expect(result.candidates).toHaveLength(2)
    })
  })

  describe('Case Sensitivity', () => {
    it('should handle case-sensitive matching', () => {
      const resolver = HaveWeMet.create<Person>()
        .schema((s) => s.field('email', { type: 'email' }))
        .matching((m) =>
          m.field('email').strategy('exact').weight(100).caseSensitive(true)
        )
        .thresholds({ noMatch: 10, definiteMatch: 80 })
        .build()

      const input = createPersonRecord(
        { email: 'Jane.Smith@example.com' },
        'input'
      )
      const candidates = [
        createPersonRecord({ email: 'jane.smith@example.com' }, '1'),
      ]

      const result = resolver.resolve(input, candidates)

      expect(result.outcome).toBe('new')
      expect(result.candidates).toHaveLength(0)
    })

    it('should handle case-insensitive matching', () => {
      const resolver = HaveWeMet.create<Person>()
        .schema((s) => s.field('email', { type: 'email' }))
        .matching((m) =>
          m.field('email').strategy('exact').weight(100).caseSensitive(false)
        )
        .thresholds({ noMatch: 10, definiteMatch: 80 })
        .build()

      const input = createPersonRecord(
        { email: 'Jane.Smith@example.com' },
        'input'
      )
      const candidates = [
        createPersonRecord({ email: 'jane.smith@example.com' }, '1'),
      ]

      const result = resolver.resolve(input, candidates)

      expect(result.outcome).toBe('match')
      expect(result.bestMatch?.record.metadata.id).toBe('1')
    })
  })

  describe('Optional Fields', () => {
    it('should handle missing optional fields gracefully', () => {
      const resolver = HaveWeMet.create<Person>()
        .schema((s) =>
          s
            .field('email', { type: 'email' })
            .field('phone', { type: 'phone', required: false })
        )
        .matching((m) =>
          m
            .field('email')
            .strategy('exact')
            .weight(60)
            .field('phone')
            .strategy('exact')
            .weight(40)
        )
        .thresholds({ noMatch: 20, definiteMatch: 50 })
        .build()

      const input = createPersonRecord(
        {
          email: 'jane@example.com',
          phone: undefined,
        },
        'input'
      )

      const candidates = [
        createPersonRecord(
          {
            email: 'jane@example.com',
            phone: undefined,
          },
          '1'
        ),
      ]

      const result = resolver.resolve(input, candidates)

      expect(result.outcome).toBe('match')
      expect(result.bestMatch?.score.total).toBe(100) // Both fields match (undefined === undefined)
    })
  })

  describe('Explanation Generation', () => {
    it('should provide detailed match explanations', () => {
      const resolver = HaveWeMet.create<Person>()
        .schema((s) =>
          s
            .field('firstName', { type: 'name' })
            .field('lastName', { type: 'name' })
            .field('email', { type: 'email' })
        )
        .matching((m) =>
          m
            .field('email')
            .strategy('exact')
            .weight(50)
            .field('firstName')
            .strategy('exact')
            .weight(30)
            .field('lastName')
            .strategy('exact')
            .weight(20)
        )
        .thresholds({ noMatch: 20, definiteMatch: 75 })
        .build()

      const input = createPersonRecord(
        {
          firstName: 'Jane',
          lastName: 'Smith',
          email: 'jane.smith@example.com',
        },
        'input'
      )

      const candidates = [
        createPersonRecord(
          {
            firstName: 'Jane',
            lastName: 'Smith',
            email: 'jane.smith@example.com',
          },
          '1'
        ),
      ]

      const result = resolver.resolve(input, candidates, {
        returnExplanation: true,
      })

      expect(result.bestMatch?.explanation.summary).toBeTruthy()
      expect(result.bestMatch?.explanation.fieldComparisons).toHaveLength(3)

      const emailComp = result.bestMatch?.explanation.fieldComparisons.find(
        (fc) => fc.field === 'email'
      )
      expect(emailComp).toBeDefined()
      expect(emailComp?.similarity).toBe(1)
      expect(emailComp?.leftValue).toBe('jane.smith@example.com')
      expect(emailComp?.rightValue).toBe('jane.smith@example.com')
      expect(emailComp?.strategy).toBe('exact')
    })
  })
})
