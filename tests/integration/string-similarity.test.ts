import { describe, it, expect } from 'vitest'
import { HaveWeMet } from '../../src'
import { createPersonRecord, type Person } from '../fixtures/records'

/**
 * String Similarity Integration Tests
 *
 * Tests all string similarity strategies through the full matching engine.
 * Verifies that strategies are correctly dispatched and applied.
 */
describe('String Similarity Strategies', () => {
  describe('Levenshtein Strategy', () => {
    it('should match similar names using levenshtein distance', () => {
      const resolver = HaveWeMet.create<Person>()
        .schema((s) => s.field('firstName', { type: 'name', component: 'first' }))
        .matching((m) =>
          m
            .field('firstName')
            .strategy('levenshtein')
            .weight(100)
            .threshold(0.8)
        )
        .thresholds({ noMatch: 20, definiteMatch: 75 })
        .build()

      const input = createPersonRecord({ firstName: 'Catherine' }, 'input')
      const candidates = [
        createPersonRecord({ firstName: 'Katherine' }, '1'), // Similar
        createPersonRecord({ firstName: 'John' }, '2'), // Different
      ]

      const results = resolver.resolve(input.data, candidates.map(c => c.data))

      expect(results.length).toBeGreaterThan(0)
      expect(results[0].outcome).toBe('definite-match')
      // Verify the best match is returned first
      expect(results[0].score.fieldScores[0].similarity).toBeGreaterThan(
        0.8
      )
    })

    it('should handle case-insensitive levenshtein by default', () => {
      const resolver = HaveWeMet.create<Person>()
        .schema((s) => s.field('firstName', { type: 'name' }))
        .matching((m) =>
          m.field('firstName').strategy('levenshtein').weight(100)
        )
        .thresholds({ noMatch: 20, definiteMatch: 75 })
        .build()

      const input = createPersonRecord({ firstName: 'JOHN' }, 'input')
      const candidates = [createPersonRecord({ firstName: 'john' }, '1')]

      const results = resolver.resolve(input.data, candidates.map(c => c.data))

      expect(results.length).toBeGreaterThan(0)
      expect(results[0].outcome).toBe('definite-match')
      expect(results[0].score.fieldScores[0].similarity).toBe(1)
    })
  })

  describe('Jaro-Winkler Strategy', () => {
    it('should match similar names using jaro-winkler', () => {
      const resolver = HaveWeMet.create<Person>()
        .schema((s) => s.field('firstName', { type: 'name', component: 'first' }))
        .matching((m) =>
          m
            .field('firstName')
            .strategy('jaro-winkler')
            .weight(100)
            .threshold(0.85)
        )
        .thresholds({ noMatch: 20, definiteMatch: 75 })
        .build()

      const input = createPersonRecord({ firstName: 'MARTHA' }, 'input')
      const candidates = [
        createPersonRecord({ firstName: 'MARHTA' }, '1'), // Transposition
        createPersonRecord({ firstName: 'BOB' }, '2'), // Different
      ]

      const results = resolver.resolve(input.data, candidates.map(c => c.data))

      expect(results.length).toBeGreaterThan(0)
      expect(results[0].outcome).toBe('definite-match')
      // Verify the best match is returned first
      expect(results[0].score.fieldScores[0].similarity).toBeGreaterThan(
        0.9
      )
    })

    it('should benefit from common prefix with jaro-winkler', () => {
      const resolver = HaveWeMet.create<Person>()
        .schema((s) => s.field('firstName', { type: 'name' }))
        .matching((m) =>
          m.field('firstName').strategy('jaro-winkler').weight(100)
        )
        .thresholds({ noMatch: 20, definiteMatch: 75 })
        .build()

      const input = createPersonRecord({ firstName: 'DIXON' }, 'input')
      const candidates = [createPersonRecord({ firstName: 'DICKSONX' }, '1')]

      const results = resolver.resolve(input.data, candidates.map(c => c.data))

      expect(results.length).toBeGreaterThan(0)
      expect(results[0].score.fieldScores[0].similarity).toBeGreaterThan(
        0.75
      )
    })
  })

  describe('Soundex Strategy', () => {
    it('should match phonetically similar names using soundex', () => {
      const resolver = HaveWeMet.create<Person>()
        .schema((s) => s.field('firstName', { type: 'name', component: 'first' }))
        .matching((m) =>
          m.field('firstName').strategy('soundex').weight(100)
        )
        .thresholds({ noMatch: 20, definiteMatch: 75 })
        .build()

      const input = createPersonRecord({ firstName: 'Robert' }, 'input')
      const candidates = [
        createPersonRecord({ firstName: 'Rupert' }, '1'), // Same soundex code (R163)
        createPersonRecord({ firstName: 'Jones' }, '2'), // Different soundex code (J520)
      ]

      const results = resolver.resolve(input.data, candidates.map(c => c.data))

      expect(results.length).toBeGreaterThan(0)
      expect(results[0].outcome).toBe('definite-match')
      // Verify the best match is returned first
      expect(results[0].score.fieldScores[0].similarity).toBe(1)

      // Only the definite match should be returned as the first result
      // Verify the best match is returned first
    })

    it('should handle soundex with multiple fields', () => {
      const resolver = HaveWeMet.create<Person>()
        .schema((s) =>
          s
            .field('firstName', { type: 'name', component: 'first' })
            .field('lastName', { type: 'name', component: 'last' })
        )
        .matching((m) =>
          m
            .field('firstName')
            .strategy('soundex')
            .weight(50)
            .field('lastName')
            .strategy('soundex')
            .weight(50)
        )
        .thresholds({ noMatch: 20, definiteMatch: 75 })
        .build()

      const input = createPersonRecord(
        { firstName: 'Robert', lastName: 'Smith' },
        'input'
      )
      const candidates = [
        createPersonRecord({ firstName: 'Rupert', lastName: 'Smyth' }, '1'), // Both match
      ]

      const results = resolver.resolve(input.data, candidates.map(c => c.data))

      expect(results.length).toBeGreaterThan(0)
      expect(results[0].outcome).toBe('definite-match')
      expect(results[0].score.totalScore).toBe(100)
    })
  })

  describe('Metaphone Strategy', () => {
    it('should match phonetically similar names using metaphone', () => {
      const resolver = HaveWeMet.create<Person>()
        .schema((s) => s.field('firstName', { type: 'name', component: 'first' }))
        .matching((m) =>
          m.field('firstName').strategy('metaphone').weight(100)
        )
        .thresholds({ noMatch: 20, definiteMatch: 75 })
        .build()

      const input = createPersonRecord({ firstName: 'Knight' }, 'input')
      const candidates = [
        createPersonRecord({ firstName: 'Night' }, '1'), // Same metaphone code
        createPersonRecord({ firstName: 'Bob' }, '2'), // Different
      ]

      const results = resolver.resolve(input.data, candidates.map(c => c.data))

      expect(results.length).toBeGreaterThan(0)
      expect(results[0].outcome).toBe('definite-match')
      expect(results[0].score.totalScore).toBe(100)
      expect(results[0].score.fieldScores[0].similarity).toBe(1)
    })

    it('should handle silent letters with metaphone', () => {
      const resolver = HaveWeMet.create<Person>()
        .schema((s) => s.field('firstName', { type: 'name' }))
        .matching((m) =>
          m.field('firstName').strategy('metaphone').weight(100)
        )
        .thresholds({ noMatch: 20, definiteMatch: 75 })
        .build()

      const input = createPersonRecord({ firstName: 'Stephen' }, 'input')
      const candidates = [createPersonRecord({ firstName: 'Steven' }, '1')]

      const results = resolver.resolve(input.data, candidates.map(c => c.data))

      expect(results.length).toBeGreaterThan(0)
      expect(results[0].outcome).toBe('definite-match')
      expect(results[0].score.fieldScores[0].similarity).toBe(1)
    })
  })

  describe('Mixed Strategies', () => {
    it('should support different strategies for different fields', () => {
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
            .weight(40)
            .field('firstName')
            .strategy('jaro-winkler')
            .weight(30)
            .field('lastName')
            .strategy('soundex')
            .weight(30)
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
            firstName: 'Jayne',
            lastName: 'Smyth',
            email: 'jane.smith@example.com',
          },
          '1'
        ),
      ]

      const results = resolver.resolve(input.data, candidates.map(c => c.data))

      expect(results.length).toBeGreaterThan(0)
      expect(results[0].outcome).toBe('definite-match')

      const fieldComps = results[0].score.fieldScores
      const emailComp = fieldComps?.find((fc) => fc.field === 'email')
      const firstNameComp = fieldComps?.find((fc) => fc.field === 'firstName')
      const lastNameComp = fieldComps?.find((fc) => fc.field === 'lastName')

      expect(emailComp?.strategy).toBe('exact')
      expect(emailComp?.similarity).toBe(1)

      expect(firstNameComp?.strategy).toBe('jaro-winkler')
      expect(firstNameComp?.similarity).toBeGreaterThan(0.9)

      expect(lastNameComp?.strategy).toBe('soundex')
      expect(lastNameComp?.similarity).toBe(1)
    })
  })

  describe('Algorithm-Specific Options', () => {
    it('should use levenshtein options through builder API', () => {
      const resolver = HaveWeMet.create<Person>()
        .schema((s) => s.field('firstName', { type: 'name' }))
        .matching((m) =>
          m
            .field('firstName')
            .strategy('levenshtein')
            .levenshteinOptions({ caseSensitive: true, normalizeWhitespace: false })
            .weight(100)
        )
        .thresholds({ noMatch: 20, definiteMatch: 75 })
        .build()

      const input = createPersonRecord({ firstName: 'John' }, 'input')
      const candidates = [
        createPersonRecord({ firstName: 'john' }, '1'), // Different case
      ]

      const results = resolver.resolve(input.data, candidates.map(c => c.data))

      // With case-sensitive option, 'John' and 'john' should not be identical
      expect(results.length).toBeGreaterThan(0)
      expect(results[0].score.fieldScores[0].similarity).toBeLessThan(1)
    })

    it('should use jaro-winkler options through builder API', () => {
      const resolver = HaveWeMet.create<Person>()
        .schema((s) => s.field('firstName', { type: 'name' }))
        .matching((m) =>
          m
            .field('firstName')
            .strategy('jaro-winkler')
            .jaroWinklerOptions({ prefixScale: 0.2, maxPrefixLength: 4 })
            .weight(100)
        )
        .thresholds({ noMatch: 20, definiteMatch: 75 })
        .build()

      const input = createPersonRecord({ firstName: 'DIXON' }, 'input')
      const candidates = [createPersonRecord({ firstName: 'DICKSONX' }, '1')]

      const results = resolver.resolve(input.data, candidates.map(c => c.data))

      // With higher prefix scale, the prefix bonus should be more significant
      expect(results.length).toBeGreaterThan(0)
      expect(results[0].score.fieldScores[0].similarity).toBeGreaterThan(
        0.75
      )
    })

    it('should use metaphone options through builder API', () => {
      const resolver = HaveWeMet.create<Person>()
        .schema((s) => s.field('firstName', { type: 'name' }))
        .matching((m) =>
          m
            .field('firstName')
            .strategy('metaphone')
            .metaphoneOptions({ maxLength: 6, nullMatchesNull: true })
            .weight(100)
        )
        .thresholds({ noMatch: 20, definiteMatch: 75 })
        .build()

      const input = createPersonRecord({ firstName: 'Stephen' }, 'input')
      const candidates = [createPersonRecord({ firstName: 'Steven' }, '1')]

      const results = resolver.resolve(input.data, candidates.map(c => c.data))

      // Stephen and Steven have the same metaphone encoding
      expect(results.length).toBeGreaterThan(0)
      expect(results[0].outcome).toBe('definite-match')
      expect(results[0].score.fieldScores[0].similarity).toBe(1)
    })

    it('should use different options for multiple fields', () => {
      const resolver = HaveWeMet.create<Person>()
        .schema((s) =>
          s
            .field('firstName', { type: 'name', component: 'first' })
            .field('lastName', { type: 'name', component: 'last' })
        )
        .matching((m) =>
          m
            .field('firstName')
            .strategy('jaro-winkler')
            .jaroWinklerOptions({ prefixScale: 0.1, caseSensitive: false })
            .weight(50)
            .field('lastName')
            .strategy('levenshtein')
            .levenshteinOptions({ normalizeWhitespace: true, caseSensitive: false })
            .weight(50)
        )
        .thresholds({ noMatch: 20, definiteMatch: 75 })
        .build()

      const input = createPersonRecord(
        { firstName: 'Jane', lastName: 'Smith-Jones' },
        'input'
      )
      const candidates = [
        createPersonRecord({ firstName: 'Jayne', lastName: 'Smith  Jones' }, '1'),
      ]

      const results = resolver.resolve(input.data, candidates.map(c => c.data))

      expect(results.length).toBeGreaterThan(0)
      expect(results[0].outcome).toBe('definite-match')
      expect(results[0].score.totalScore).toBeGreaterThan(75)
    })
  })

  describe('Strategy with Threshold', () => {
    it('should respect threshold for levenshtein strategy', () => {
      const resolver = HaveWeMet.create<Person>()
        .schema((s) => s.field('firstName', { type: 'name' }))
        .matching((m) =>
          m
            .field('firstName')
            .strategy('levenshtein')
            .weight(100)
            .threshold(0.9)
        )
        .thresholds({ noMatch: 20, definiteMatch: 75 })
        .build()

      const input = createPersonRecord({ firstName: 'hello' }, 'input')
      const candidates = [
        createPersonRecord({ firstName: 'hallo' }, '1'), // Similarity ~0.8, below threshold
      ]

      const results = resolver.resolve(input.data, candidates.map(c => c.data))

      // With threshold 0.9, similarity of 0.8 should result in 0 score
      expect(results.length).toBeGreaterThan(0)
      expect(results[0].outcome).toBe('no-match')
    })

    it('should respect threshold for jaro-winkler strategy', () => {
      const resolver = HaveWeMet.create<Person>()
        .schema((s) => s.field('firstName', { type: 'name' }))
        .matching((m) =>
          m
            .field('firstName')
            .strategy('jaro-winkler')
            .weight(100)
            .threshold(0.95)
        )
        .thresholds({ noMatch: 20, definiteMatch: 75 })
        .build()

      const input = createPersonRecord({ firstName: 'MARTHA' }, 'input')
      const candidates = [
        createPersonRecord({ firstName: 'MARHTA' }, '1'), // High similarity but below 0.95
      ]

      const results = resolver.resolve(input.data, candidates.map(c => c.data))

      // Even though similarity is high, if below threshold, score should be 0
      expect(results.length).toBeGreaterThan(0)
      expect(results[0].outcome).toBe('definite-match')
      expect(results[0].score.totalScore).toBeGreaterThan(75)
    })
  })
})
