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
      const results = resolver.resolve(
        input.data,
        candidates.map((c) => c.data)
      )

      // Verify match outcome
      expect(results.length).toBeGreaterThan(0)
      expect(results[0].outcome).toBe('definite-match')
      expect(results[0].candidateRecord).toBeDefined()
      expect(results[0].score.totalScore).toBe(100)

      // Verify explanation
      expect(results[0].explanation).toContain('email')

      // Verify all fields matched
      const emailComparison = results[0].score.fieldScores.find(
        (fc) => fc.field === 'email'
      )
      expect(emailComparison?.similarity).toBe(1)
      expect(emailComparison?.contribution).toBe(50)
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

      const results = resolver.resolve(
        input.data,
        candidates.map((c) => c.data)
      )

      expect(results.length).toBeGreaterThan(0)
      expect(results[0].outcome).toBe('no-match')
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

      const results = resolver.resolve(
        input.data,
        candidates.map((c) => c.data)
      )

      expect(results.length).toBeGreaterThan(0)
      expect(results[0].outcome).toBe('potential-match')
      expect(results[0].score.totalScore).toBe(25) // Only firstName matches

      // Should be in the uncertain range
      expect(results[0].score.totalScore).toBeGreaterThanOrEqual(20)
      expect(results[0].score.totalScore).toBeLessThan(75)
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

      const results = resolver.resolve(
        input.data,
        candidates.map((c) => c.data)
      )

      expect(results.length).toBe(3)
      expect(results[0].outcome).toBe('definite-match')

      // Verify ranking by score
      expect(results[0].score.totalScore).toBe(100)
      expect(results[1].score.totalScore).toBe(75)
      expect(results[2].score.totalScore).toBe(25)
    })

    it('should respect maxCandidates option', () => {
      const resolver = HaveWeMet.create<Person>()
        .schema((s) =>
          s
            .field('firstName', { type: 'name', component: 'first' })
            .field('lastName', { type: 'name', component: 'last' })
            .field('email', { type: 'email' })
        )
        .matching((m) => m.field('firstName').strategy('exact').weight(100))
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

      const results = resolver.resolve(
        input.data,
        candidates.map((c) => c.data),
        { maxResults: 2 }
      )

      expect(results).toHaveLength(2)
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

      const results = resolver.resolve(
        input.data,
        candidates.map((c) => c.data)
      )

      expect(results.length).toBeGreaterThan(0)
      expect(results[0].outcome).toBe('no-match')
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

      const results = resolver.resolve(
        input.data,
        candidates.map((c) => c.data)
      )

      expect(results.length).toBeGreaterThan(0)
      expect(results[0].outcome).toBe('definite-match')
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

      const results = resolver.resolve(
        input.data,
        candidates.map((c) => c.data)
      )

      expect(results.length).toBeGreaterThan(0)
      expect(results[0].outcome).toBe('definite-match')
      expect(results[0].score.totalScore).toBe(100) // Both fields match (undefined === undefined)
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

      const results = resolver.resolve(
        input.data,
        candidates.map((c) => c.data)
      )

      expect(results.length).toBeGreaterThan(0)
      expect(results[0].explanation).toBeTruthy()
      expect(results[0].score.fieldScores).toHaveLength(3)

      const emailComp = results[0].score.fieldScores.find(
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
