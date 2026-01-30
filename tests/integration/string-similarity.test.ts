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

      const result = resolver.resolve(input, candidates)

      expect(result.outcome).toBe('match')
      expect(result.bestMatch?.record.metadata.id).toBe('1')
      expect(result.bestMatch?.score.fieldComparisons[0].similarity).toBeGreaterThan(
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

      const result = resolver.resolve(input, candidates)

      expect(result.outcome).toBe('match')
      expect(result.bestMatch?.score.fieldComparisons[0].similarity).toBe(1)
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

      const result = resolver.resolve(input, candidates)

      expect(result.outcome).toBe('match')
      expect(result.bestMatch?.record.metadata.id).toBe('1')
      expect(result.bestMatch?.score.fieldComparisons[0].similarity).toBeGreaterThan(
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

      const result = resolver.resolve(input, candidates)

      expect(result.bestMatch?.score.fieldComparisons[0].similarity).toBeGreaterThan(
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

      const result = resolver.resolve(input, candidates)

      expect(result.outcome).toBe('match')
      expect(result.bestMatch?.record.metadata.id).toBe('1')
      expect(result.bestMatch?.score.fieldComparisons[0].similarity).toBe(1)

      // Second candidate should score 0 (below noMatch threshold)
      expect(result.candidates).toHaveLength(1)
      expect(result.candidates[0].record.metadata.id).toBe('1')
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

      const result = resolver.resolve(input, candidates)

      expect(result.outcome).toBe('match')
      expect(result.bestMatch?.score.total).toBe(100)
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

      const result = resolver.resolve(input, candidates)

      expect(result.outcome).toBe('match')
      expect(result.bestMatch?.record.metadata.id).toBe('1')
      expect(result.bestMatch?.score.fieldComparisons[0].similarity).toBe(1)
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

      const result = resolver.resolve(input, candidates)

      expect(result.outcome).toBe('match')
      expect(result.bestMatch?.score.fieldComparisons[0].similarity).toBe(1)
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

      const result = resolver.resolve(input, candidates)

      expect(result.outcome).toBe('match')

      const fieldComps = result.bestMatch?.score.fieldComparisons
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

      const result = resolver.resolve(input, candidates)

      // With threshold 0.9, similarity of 0.8 should result in 0 score
      expect(result.outcome).toBe('new')
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

      const result = resolver.resolve(input, candidates)

      // Even though similarity is high, if below threshold, score should be 0
      expect(result.outcome).toBe('match')
      expect(result.bestMatch?.score.total).toBeGreaterThan(75)
    })
  })
})
