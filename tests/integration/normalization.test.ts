import { describe, it, expect } from 'vitest'
import { HaveWeMet } from '../../src'
import { createPersonRecord, type Person } from '../fixtures/records'

/**
 * Normalizer Integration Tests
 *
 * Tests the integration of normalizers into the matching engine.
 * Verifies that normalizers are applied before field comparison.
 */
describe('Normalizer Integration', () => {
  describe('Named Normalizers', () => {
    it('should apply email normalizer before comparison', () => {
      const resolver = HaveWeMet.create<Person>()
        .schema((s) =>
          s.field('email', {
            type: 'email',
            normalizer: 'email',
            normalizerOptions: { removePlusAddressing: true },
          })
        )
        .matching((m) => m.field('email').strategy('exact').weight(100))
        .thresholds({ noMatch: 20, definiteMatch: 75 })
        .build()

      // Input has plus-addressing
      const input = createPersonRecord(
        { email: 'john+work@example.com' },
        'input'
      )

      // Candidate has no plus-addressing
      const candidates = [
        createPersonRecord({ email: 'john@example.com' }, '1'),
      ]

      const results = resolver.resolve(input.data, candidates.map(c => c.data))

      // Should match because email normalizer removes plus-addressing
      expect(results.length).toBeGreaterThan(0)
      expect(results[0].outcome).toBe('definite-match')
      expect(results[0].score.totalScore).toBe(100)
    })

    it('should apply name normalizer before comparison', () => {
      const resolver = HaveWeMet.create<Person>()
        .schema((s) =>
          s
            .field('firstName', {
              type: 'name',
              normalizer: 'name',
              normalizerOptions: { outputFormat: 'full' },
            })
            .field('lastName', {
              type: 'name',
              normalizer: 'name',
            })
        )
        .matching((m) =>
          m
            .field('firstName')
            .strategy('exact')
            .weight(50)
            .field('lastName')
            .strategy('exact')
            .weight(50)
        )
        .thresholds({ noMatch: 20, definiteMatch: 75 })
        .build()

      // Input has extra whitespace and different casing
      const input = createPersonRecord(
        {
          firstName: '  JOHN  ',
          lastName: '   SMITH   ',
        },
        'input'
      )

      // Candidate has normal formatting
      const candidates = [
        createPersonRecord(
          {
            firstName: 'John',
            lastName: 'Smith',
          },
          '1'
        ),
      ]

      const results = resolver.resolve(input.data, candidates.map(c => c.data))

      // Should match because name normalizer handles whitespace and casing
      expect(results.length).toBeGreaterThan(0)
      expect(results[0].outcome).toBe('definite-match')
      expect(results[0].score.totalScore).toBe(100)
    })

    it('should apply lowercase normalizer before comparison', () => {
      const resolver = HaveWeMet.create<Person>()
        .schema((s) =>
          s.field('email', {
            type: 'email',
            normalizer: 'lowercase',
          })
        )
        .matching((m) => m.field('email').strategy('exact').weight(100))
        .thresholds({ noMatch: 20, definiteMatch: 75 })
        .build()

      const input = createPersonRecord(
        { email: 'John.Smith@Example.COM' },
        'input'
      )

      const candidates = [
        createPersonRecord({ email: 'john.smith@example.com' }, '1'),
      ]

      const results = resolver.resolve(input.data, candidates.map(c => c.data))

      expect(results.length).toBeGreaterThan(0)
      expect(results[0].outcome).toBe('definite-match')
      expect(results[0].score.totalScore).toBe(100)
    })

    it('should apply trim normalizer before comparison', () => {
      const resolver = HaveWeMet.create<Person>()
        .schema((s) =>
          s.field('email', {
            type: 'email',
            normalizer: 'trim',
          })
        )
        .matching((m) => m.field('email').strategy('exact').weight(100))
        .thresholds({ noMatch: 20, definiteMatch: 75 })
        .build()

      const input = createPersonRecord(
        { email: '  john@example.com  ' },
        'input'
      )

      const candidates = [createPersonRecord({ email: 'john@example.com' }, '1')]

      const results = resolver.resolve(input.data, candidates.map(c => c.data))

      expect(results.length).toBeGreaterThan(0)
      expect(results[0].outcome).toBe('definite-match')
      expect(results[0].score.totalScore).toBe(100)
    })

    it('should handle non-existent normalizer gracefully', () => {
      const resolver = HaveWeMet.create<Person>()
        .schema((s) =>
          s.field('email', {
            type: 'email',
            normalizer: 'nonExistentNormalizer',
          })
        )
        .matching((m) => m.field('email').strategy('exact').weight(100))
        .thresholds({ noMatch: 20, definiteMatch: 75 })
        .build()

      const input = createPersonRecord({ email: 'john@example.com' }, 'input')
      const candidates = [createPersonRecord({ email: 'john@example.com' }, '1')]

      // Should not throw, should use original value
      const results = resolver.resolve(input.data, candidates.map(c => c.data))

      expect(results.length).toBeGreaterThan(0)
      expect(results[0].outcome).toBe('definite-match')
      expect(results[0].score.totalScore).toBe(100)
    })
  })

  describe('Custom Normalizers', () => {
    it('should apply custom normalizer before comparison', () => {
      // Custom normalizer that removes dashes
      const removeDashes = (value: unknown) => {
        if (value == null) return null
        return String(value).replace(/-/g, '')
      }

      const resolver = HaveWeMet.create<Person>()
        .schema((s) =>
          s.field('phone', {
            type: 'phone',
            customNormalizer: removeDashes,
          })
        )
        .matching((m) => m.field('phone').strategy('exact').weight(100))
        .thresholds({ noMatch: 20, definiteMatch: 75 })
        .build()

      const input = createPersonRecord({ phone: '555-123-4567' }, 'input')
      const candidates = [createPersonRecord({ phone: '5551234567' }, '1')]

      const results = resolver.resolve(input.data, candidates.map(c => c.data))

      expect(results.length).toBeGreaterThan(0)
      expect(results[0].outcome).toBe('definite-match')
      expect(results[0].score.totalScore).toBe(100)
    })

    it('should handle custom normalizer errors gracefully', () => {
      // Custom normalizer that throws an error
      const errorNormalizer = () => {
        throw new Error('Normalizer error')
      }

      const resolver = HaveWeMet.create<Person>()
        .schema((s) =>
          s.field('email', {
            type: 'email',
            customNormalizer: errorNormalizer,
          })
        )
        .matching((m) => m.field('email').strategy('exact').weight(100))
        .thresholds({ noMatch: 20, definiteMatch: 75 })
        .build()

      const input = createPersonRecord({ email: 'john@example.com' }, 'input')
      const candidates = [createPersonRecord({ email: 'john@example.com' }, '1')]

      // Should not throw, should use original value
      const results = resolver.resolve(input.data, candidates.map(c => c.data))

      expect(results.length).toBeGreaterThan(0)
      expect(results[0].outcome).toBe('definite-match')
      expect(results[0].score.totalScore).toBe(100)
    })

    it('should prefer custom normalizer over named normalizer', () => {
      // Custom normalizer that converts to uppercase
      const toUppercase = (value: unknown) => {
        if (value == null) return null
        return String(value).toUpperCase()
      }

      const resolver = HaveWeMet.create<Person>()
        .schema((s) =>
          s.field('email', {
            type: 'email',
            normalizer: 'lowercase', // This should be ignored
            customNormalizer: toUppercase, // This should be used
          })
        )
        .matching((m) => m.field('email').strategy('exact').weight(100))
        .thresholds({ noMatch: 20, definiteMatch: 75 })
        .build()

      const input = createPersonRecord({ email: 'john@example.com' }, 'input')
      const candidates = [
        createPersonRecord({ email: 'JOHN@EXAMPLE.COM' }, '1'),
      ]

      const results = resolver.resolve(input.data, candidates.map(c => c.data))

      // Should match because custom normalizer (uppercase) is used
      expect(results.length).toBeGreaterThan(0)
      expect(results[0].outcome).toBe('definite-match')
      expect(results[0].score.totalScore).toBe(100)
    })
  })

  describe('Normalizer Options', () => {
    it('should pass options to named normalizers', () => {
      const resolver = HaveWeMet.create<Person>()
        .schema((s) =>
          s.field('email', {
            type: 'email',
            normalizer: 'email',
            normalizerOptions: {
              removePlusAddressing: false, // Keep plus-addressing
            },
          })
        )
        .matching((m) => m.field('email').strategy('exact').weight(100))
        .thresholds({ noMatch: 20, definiteMatch: 75 })
        .build()

      const input = createPersonRecord(
        { email: 'john+work@example.com' },
        'input'
      )

      const candidates = [createPersonRecord({ email: 'john@example.com' }, '1')]

      const results = resolver.resolve(input.data, candidates.map(c => c.data))

      // Should NOT match because plus-addressing is kept
      expect(results.length).toBeGreaterThan(0)
      expect(results[0].outcome).toBe('no-match')
    })
  })

  describe('Multiple Fields with Normalizers', () => {
    it('should apply different normalizers to different fields', () => {
      const resolver = HaveWeMet.create<Person>()
        .schema((s) =>
          s
            .field('firstName', {
              type: 'name',
              normalizer: 'name',
            })
            .field('email', {
              type: 'email',
              normalizer: 'email',
              normalizerOptions: { removePlusAddressing: true },
            })
        )
        .matching((m) =>
          m
            .field('firstName')
            .strategy('exact')
            .weight(50)
            .field('email')
            .strategy('exact')
            .weight(50)
        )
        .thresholds({ noMatch: 20, definiteMatch: 75 })
        .build()

      const input = createPersonRecord(
        {
          firstName: '  JOHN  ',
          email: 'john+work@example.com',
        },
        'input'
      )

      const candidates = [
        createPersonRecord(
          {
            firstName: 'John',
            email: 'john@example.com',
          },
          '1'
        ),
      ]

      const results = resolver.resolve(input.data, candidates.map(c => c.data))

      expect(results.length).toBeGreaterThan(0)
      expect(results[0].outcome).toBe('definite-match')
      expect(results[0].score.totalScore).toBe(100)
    })
  })

  describe('Normalization with Fuzzy Matching', () => {
    it('should normalize before applying Jaro-Winkler', () => {
      const resolver = HaveWeMet.create<Person>()
        .schema((s) =>
          s.field('firstName', {
            type: 'name',
            normalizer: 'trim',
          })
        )
        .matching((m) =>
          m.field('firstName').strategy('jaro-winkler').weight(100)
        )
        .thresholds({ noMatch: 20, definiteMatch: 75 })
        .build()

      const input = createPersonRecord({ firstName: '  John  ' }, 'input')
      const candidates = [createPersonRecord({ firstName: 'John' }, '1')]

      const results = resolver.resolve(input.data, candidates.map(c => c.data))

      // After trimming, should be exact match (similarity = 1.0)
      expect(results.length).toBeGreaterThan(0)
      expect(results[0].outcome).toBe('definite-match')
      expect(results[0].score.totalScore).toBe(100)
    })

    it('should normalize before applying Levenshtein', () => {
      const resolver = HaveWeMet.create<Person>()
        .schema((s) =>
          s.field('firstName', {
            type: 'name',
            normalizer: 'lowercase',
          })
        )
        .matching((m) =>
          m.field('firstName').strategy('levenshtein').weight(100)
        )
        .thresholds({ noMatch: 20, definiteMatch: 75 })
        .build()

      const input = createPersonRecord({ firstName: 'JOHN' }, 'input')
      const candidates = [createPersonRecord({ firstName: 'john' }, '1')]

      const results = resolver.resolve(input.data, candidates.map(c => c.data))

      // After lowercasing, should be exact match (similarity = 1.0)
      expect(results.length).toBeGreaterThan(0)
      expect(results[0].outcome).toBe('definite-match')
      expect(results[0].score.totalScore).toBe(100)
    })

    it('should normalize before applying Soundex', () => {
      const resolver = HaveWeMet.create<Person>()
        .schema((s) =>
          s.field('lastName', {
            type: 'name',
            normalizer: 'trim',
          })
        )
        .matching((m) => m.field('lastName').strategy('soundex').weight(100))
        .thresholds({ noMatch: 20, definiteMatch: 75 })
        .build()

      const input = createPersonRecord({ lastName: '  Smith  ' }, 'input')
      const candidates = [
        createPersonRecord({ lastName: 'Smythe' }, '1'), // Sounds similar
      ]

      const results = resolver.resolve(input.data, candidates.map(c => c.data))

      // After trimming, Soundex should match (Smith and Smythe sound similar)
      expect(results.length).toBeGreaterThan(0)
      expect(results[0].outcome).toBe('definite-match')
      expect(results[0].score.totalScore).toBeGreaterThan(90)
    })
  })

  describe('No Normalization', () => {
    it('should work without normalizers configured', () => {
      const resolver = HaveWeMet.create<Person>()
        .schema((s) => s.field('email', { type: 'email' }))
        .matching((m) => m.field('email').strategy('exact').weight(100))
        .thresholds({ noMatch: 20, definiteMatch: 75 })
        .build()

      const input = createPersonRecord({ email: 'john@example.com' }, 'input')
      const candidates = [createPersonRecord({ email: 'john@example.com' }, '1')]

      const results = resolver.resolve(input.data, candidates.map(c => c.data))

      expect(results.length).toBeGreaterThan(0)
      expect(results[0].outcome).toBe('definite-match')
      expect(results[0].score.totalScore).toBe(100)
    })

    it('should not match when normalization would have helped', () => {
      const resolver = HaveWeMet.create<Person>()
        .schema((s) => s.field('email', { type: 'email' }))
        .matching((m) => m.field('email').strategy('exact').weight(100))
        .thresholds({ noMatch: 20, definiteMatch: 75 })
        .build()

      const input = createPersonRecord(
        { email: 'John@Example.COM' },
        'input'
      )
      const candidates = [createPersonRecord({ email: 'john@example.com' }, '1')]

      const results = resolver.resolve(input.data, candidates.map(c => c.data))

      // Should NOT match because no normalization was applied
      expect(results.length).toBeGreaterThan(0)
      expect(results[0].outcome).toBe('no-match')
    })
  })

  describe('Normalized Values in Explanation', () => {
    it('should include normalized values in field comparisons when they differ', () => {
      const resolver = HaveWeMet.create<Person>()
        .schema((s) =>
          s.field('email', {
            type: 'email',
            normalizer: 'email',
            normalizerOptions: { removePlusAddressing: true },
          })
        )
        .matching((m) => m.field('email').strategy('exact').weight(100))
        .thresholds({ noMatch: 20, definiteMatch: 75 })
        .build()

      const input = createPersonRecord(
        { email: 'John+Work@Example.COM' },
        'input'
      )

      const candidates = [
        createPersonRecord({ email: 'JOHN+Personal@example.com' }, '1'),
      ]

      const results = resolver.resolve(input.data, candidates.map(c => c.data))

      expect(results.length).toBeGreaterThan(0)
      expect(results[0].outcome).toBe('definite-match')

      // Check that normalized values are included when they differ from originals
      const emailComparison = results[0].score.fieldScores.find(
        (fc) => fc.field === 'email'
      )

      expect(emailComparison).toBeDefined()
      expect(emailComparison?.leftValue).toBe('John+Work@Example.COM')
      expect(emailComparison?.rightValue).toBe('JOHN+Personal@example.com')
      // Both normalize to the same value
      expect(emailComparison?.normalizedLeftValue).toBe('john@example.com')
      expect(emailComparison?.normalizedRightValue).toBe('john@example.com')
    })

    it('should not include normalized values when no normalization is applied', () => {
      const resolver = HaveWeMet.create<Person>()
        .schema((s) => s.field('email', { type: 'email' }))
        .matching((m) => m.field('email').strategy('exact').weight(100))
        .thresholds({ noMatch: 20, definiteMatch: 75 })
        .build()

      const input = createPersonRecord({ email: 'john@example.com' }, 'input')
      const candidates = [createPersonRecord({ email: 'john@example.com' }, '1')]

      const results = resolver.resolve(input.data, candidates.map(c => c.data))

      expect(results.length).toBeGreaterThan(0)
      expect(results[0].outcome).toBe('definite-match')

      const emailComparison = results[0].score.fieldScores.find(
        (fc) => fc.field === 'email'
      )

      expect(emailComparison).toBeDefined()
      expect(emailComparison?.normalizedLeftValue).toBeUndefined()
      expect(emailComparison?.normalizedRightValue).toBeUndefined()
    })

    it('should not include normalized value when normalization returns same value', () => {
      const resolver = HaveWeMet.create<Person>()
        .schema((s) =>
          s.field('email', {
            type: 'email',
            normalizer: 'trim',
          })
        )
        .matching((m) => m.field('email').strategy('exact').weight(100))
        .thresholds({ noMatch: 20, definiteMatch: 75 })
        .build()

      // Email with no leading/trailing whitespace
      const input = createPersonRecord({ email: 'john@example.com' }, 'input')
      const candidates = [createPersonRecord({ email: 'john@example.com' }, '1')]

      const results = resolver.resolve(input.data, candidates.map(c => c.data))

      const emailComparison = results[0].score.fieldScores.find(
        (fc) => fc.field === 'email'
      )

      expect(emailComparison?.normalizedLeftValue).toBeUndefined()
      expect(emailComparison?.normalizedRightValue).toBeUndefined()
    })
  })

  describe('Edge Cases', () => {
    it('should handle null values gracefully', () => {
      const resolver = HaveWeMet.create<Person>()
        .schema((s) =>
          s.field('email', {
            type: 'email',
            normalizer: 'email',
          })
        )
        .matching((m) => m.field('email').strategy('exact').weight(100))
        .thresholds({ noMatch: 20, definiteMatch: 75 })
        .build()

      const input = createPersonRecord({ email: null as unknown as string }, 'input')
      const candidates = [
        createPersonRecord({ email: null as unknown as string }, '1'),
      ]

      const results = resolver.resolve(input.data, candidates.map(c => c.data))

      // Both null values should match
      expect(results.length).toBeGreaterThan(0)
      expect(results[0].outcome).toBe('definite-match')
      expect(results[0].score.totalScore).toBe(100)
    })

    it('should handle undefined values gracefully', () => {
      const resolver = HaveWeMet.create<Person>()
        .schema((s) =>
          s.field('phone', {
            type: 'phone',
            normalizer: 'phone',
          })
        )
        .matching((m) => m.field('phone').strategy('exact').weight(100))
        .thresholds({ noMatch: 20, definiteMatch: 75 })
        .build()

      const input = createPersonRecord({ phone: undefined }, 'input')
      const candidates = [createPersonRecord({ phone: undefined }, '1')]

      const results = resolver.resolve(input.data, candidates.map(c => c.data))

      // Both undefined values should match
      expect(results.length).toBeGreaterThan(0)
      expect(results[0].outcome).toBe('definite-match')
      expect(results[0].score.totalScore).toBe(100)
    })

    it('should handle normalizer returning null', () => {
      // Normalizer that always returns null
      const alwaysNull = () => null

      const resolver = HaveWeMet.create<Person>()
        .schema((s) =>
          s.field('email', {
            type: 'email',
            customNormalizer: alwaysNull,
          })
        )
        .matching((m) => m.field('email').strategy('exact').weight(100))
        .thresholds({ noMatch: 20, definiteMatch: 75 })
        .build()

      const input = createPersonRecord({ email: 'john@example.com' }, 'input')
      const candidates = [createPersonRecord({ email: 'john@example.com' }, '1')]

      const results = resolver.resolve(input.data, candidates.map(c => c.data))

      // Should use original values when normalizer returns null
      expect(results.length).toBeGreaterThan(0)
      expect(results[0].outcome).toBe('definite-match')
      expect(results[0].score.totalScore).toBe(100)
    })
  })
})
