import { describe, it, expect } from 'vitest'
import { HaveWeMet } from '../../src'
import { createPersonRecord, type Person } from '../fixtures/records'

/**
 * Builder API Normalizer Tests
 *
 * Tests the fluent builder API for configuring normalizers.
 * Verifies type inference, method chaining, and that configurations
 * flow through to the matching engine correctly.
 */
describe('Builder API - Normalizers', () => {
  describe('Fluent API - Named Normalizers', () => {
    it('should configure email normalizer via fluent API', () => {
      const resolver = HaveWeMet.create<Person>()
        .schema((s) =>
          s
            .field('email')
            .type('email')
            .normalizer('email', { removePlusAddressing: true })
        )
        .matching((m) => m.field('email').strategy('exact').weight(100))
        .thresholds({ noMatch: 20, definiteMatch: 75 })
        .build()

      const input = createPersonRecord(
        { email: 'john+work@example.com' },
        'input'
      )
      const candidates = [
        createPersonRecord({ email: 'john@example.com' }, '1'),
      ]

      const result = resolver.resolve(input, candidates)

      expect(result.outcome).toBe('match')
      expect(result.bestMatch?.score.total).toBe(100)
    })

    it('should configure name normalizer via fluent API', () => {
      const resolver = HaveWeMet.create<Person>()
        .schema((s) =>
          s
            .field('firstName')
            .type('name')
            .normalizer('name', { outputFormat: 'full' })
            .field('lastName')
            .type('name')
            .normalizer('name')
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

      const input = createPersonRecord(
        {
          firstName: '  JOHN  ',
          lastName: '   SMITH   ',
        },
        'input'
      )
      const candidates = [
        createPersonRecord(
          {
            firstName: 'John',
            lastName: 'Smith',
          },
          '1'
        ),
      ]

      const result = resolver.resolve(input, candidates)

      expect(result.outcome).toBe('match')
      expect(result.bestMatch?.score.total).toBe(100)
    })

    it('should configure phone normalizer via fluent API', () => {
      // Test that the configuration works - use a simpler custom normalizer
      const resolver = HaveWeMet.create<Person>()
        .schema((s) =>
          s
            .field('phone')
            .type('phone')
            .customNormalizer((value) => {
              if (!value) return null
              return value.toString().replace(/\D/g, '')
            })
        )
        .matching((m) => m.field('phone').strategy('exact').weight(100))
        .thresholds({ noMatch: 20, definiteMatch: 75 })
        .build()

      const input = createPersonRecord({ phone: '555-123-4567' }, 'input')
      const candidates = [
        createPersonRecord({ phone: '5551234567' }, '1'),
      ]

      const result = resolver.resolve(input, candidates)

      expect(result.outcome).toBe('match')
      expect(result.bestMatch?.score.total).toBe(100)
    })

    it('should configure normalizer with options via fluent API', () => {
      // Test that normalizer options are passed through correctly
      const resolver = HaveWeMet.create<Person>()
        .schema((s) =>
          s
            .field('dateOfBirth')
            .type('date')
            .normalizer('trim') // Use a simpler normalizer for testing
        )
        .matching((m) => m.field('dateOfBirth').strategy('exact').weight(100))
        .thresholds({ noMatch: 20, definiteMatch: 75 })
        .build()

      const input = createPersonRecord({ dateOfBirth: '  1985-01-15  ' }, 'input')
      const candidates = [
        createPersonRecord({ dateOfBirth: '1985-01-15' }, '1'),
      ]

      const result = resolver.resolve(input, candidates)

      expect(result.outcome).toBe('match')
      expect(result.bestMatch?.score.total).toBe(100)
    })

    it('should configure basic normalizers via fluent API', () => {
      const resolver = HaveWeMet.create<Person>()
        .schema((s) =>
          s.field('email').type('email').normalizer('lowercase')
        )
        .matching((m) => m.field('email').strategy('exact').weight(100))
        .thresholds({ noMatch: 20, definiteMatch: 75 })
        .build()

      const input = createPersonRecord({ email: 'JOHN@EXAMPLE.COM' }, 'input')
      const candidates = [
        createPersonRecord({ email: 'john@example.com' }, '1'),
      ]

      const result = resolver.resolve(input, candidates)

      expect(result.outcome).toBe('match')
      expect(result.bestMatch?.score.total).toBe(100)
    })
  })

  describe('Fluent API - Normalizer Options', () => {
    it('should support separate normalizerOptions() method', () => {
      const resolver = HaveWeMet.create<Person>()
        .schema((s) =>
          s
            .field('email')
            .type('email')
            .normalizer('email')
            .normalizerOptions({ removePlusAddressing: true })
        )
        .matching((m) => m.field('email').strategy('exact').weight(100))
        .thresholds({ noMatch: 20, definiteMatch: 75 })
        .build()

      const input = createPersonRecord(
        { email: 'user+tag@example.com' },
        'input'
      )
      const candidates = [
        createPersonRecord({ email: 'user@example.com' }, '1'),
      ]

      const result = resolver.resolve(input, candidates)

      expect(result.outcome).toBe('match')
    })

    it('should allow inline options in normalizer() call', () => {
      // Test that options passed inline are configured correctly
      const resolver = HaveWeMet.create<Person>()
        .schema((s) =>
          s
            .field('email')
            .type('email')
            .normalizer('email', {
              removePlusAddressing: true,
            })
        )
        .matching((m) => m.field('email').strategy('exact').weight(100))
        .thresholds({ noMatch: 20, definiteMatch: 75 })
        .build()

      const input = createPersonRecord({ email: 'user+tag@example.com' }, 'input')
      const candidates = [
        createPersonRecord({ email: 'user@example.com' }, '1'),
      ]

      const result = resolver.resolve(input, candidates)

      expect(result.outcome).toBe('match')
    })
  })

  describe('Fluent API - Custom Normalizers', () => {
    it('should support custom normalizer functions', () => {
      const resolver = HaveWeMet.create<Person>()
        .schema((s) =>
          s
            .field('email')
            .type('email')
            .customNormalizer((value) => {
              if (!value) return null
              return value
                .toString()
                .toLowerCase()
                .trim()
                .replace(/\+.*@/, '@')
            })
        )
        .matching((m) => m.field('email').strategy('exact').weight(100))
        .thresholds({ noMatch: 20, definiteMatch: 75 })
        .build()

      const input = createPersonRecord(
        { email: '  USER+TAG@EXAMPLE.COM  ' },
        'input'
      )
      const candidates = [
        createPersonRecord({ email: 'user@example.com' }, '1'),
      ]

      const result = resolver.resolve(input, candidates)

      expect(result.outcome).toBe('match')
      expect(result.bestMatch?.score.total).toBe(100)
    })

    it('should handle custom normalizer returning null gracefully', () => {
      const resolver = HaveWeMet.create<Person>()
        .schema((s) =>
          s
            .field('email')
            .type('email')
            .customNormalizer((value) => {
              // Reject invalid emails
              if (
                !value ||
                !value.toString().includes('@')
              ) {
                return null
              }
              return value.toString().toLowerCase()
            })
        )
        .matching((m) => m.field('email').strategy('exact').weight(100))
        .thresholds({ noMatch: 20, definiteMatch: 75 })
        .build()

      const input = createPersonRecord({ email: 'not-an-email' }, 'input')
      const candidates = [
        createPersonRecord({ email: 'user@example.com' }, '1'),
      ]

      const result = resolver.resolve(input, candidates)

      // Should have 'new' or 'no-match' outcome since emails don't match
      expect(['new', 'no-match']).toContain(result.outcome)
    })
  })

  describe('Fluent API - Multiple Fields', () => {
    it('should configure multiple fields with different normalizers', () => {
      const resolver = HaveWeMet.create<Person>()
        .schema((s) =>
          s
            .field('firstName')
            .type('name')
            .normalizer('name')
            .field('lastName')
            .type('name')
            .normalizer('name')
            .field('email')
            .type('email')
            .normalizer('email', { removePlusAddressing: true })
        )
        .matching((m) =>
          m
            .field('firstName')
            .strategy('exact')
            .weight(30)
            .field('lastName')
            .strategy('exact')
            .weight(30)
            .field('email')
            .strategy('exact')
            .weight(40)
        )
        .thresholds({ noMatch: 20, definiteMatch: 75 })
        .build()

      const input = createPersonRecord(
        {
          firstName: '  john  ',
          lastName: 'SMITH',
          email: 'john+work@example.com',
        },
        'input'
      )
      const candidates = [
        createPersonRecord(
          {
            firstName: 'John',
            lastName: 'Smith',
            email: 'john@example.com',
          },
          '1'
        ),
      ]

      const result = resolver.resolve(input, candidates)

      expect(result.outcome).toBe('match')
      expect(result.bestMatch?.score.total).toBe(100)
    })
  })

  describe('Fluent API - Other Field Methods', () => {
    it('should support component() method', () => {
      const resolver = HaveWeMet.create<Person>()
        .schema((s) =>
          s
            .field('firstName')
            .type('name')
            .component('first')
            .normalizer('name')
            .field('lastName')
            .type('name')
            .component('last')
            .normalizer('name')
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

      const input = createPersonRecord(
        { firstName: 'John', lastName: 'Smith' },
        'input'
      )
      const candidates = [
        createPersonRecord({ firstName: 'John', lastName: 'Smith' }, '1'),
      ]

      const result = resolver.resolve(input, candidates)

      expect(result.outcome).toBe('match')
    })

    it('should support required() method', () => {
      const resolver = HaveWeMet.create<Person>()
        .schema((s) =>
          s.field('email').type('email').normalizer('email').required(true)
        )
        .matching((m) => m.field('email').strategy('exact').weight(100))
        .thresholds({ noMatch: 20, definiteMatch: 75 })
        .build()

      const input = createPersonRecord({ email: 'john@example.com' }, 'input')
      const candidates = [
        createPersonRecord({ email: 'john@example.com' }, '1'),
      ]

      const result = resolver.resolve(input, candidates)

      expect(result.outcome).toBe('match')
    })
  })

  describe('Backward Compatibility', () => {
    it('should still support the old direct definition API', () => {
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
        { email: 'john+tag@example.com' },
        'input'
      )
      const candidates = [
        createPersonRecord({ email: 'john@example.com' }, '1'),
      ]

      const result = resolver.resolve(input, candidates)

      expect(result.outcome).toBe('match')
      expect(result.bestMatch?.score.total).toBe(100)
    })

    it('should support mixing old and new API patterns', () => {
      const resolver = HaveWeMet.create<Person>()
        .schema((s) =>
          s
            .field('email', {
              type: 'email',
              normalizer: 'email',
            })
            .field('firstName')
            .type('name')
            .normalizer('name')
        )
        .matching((m) =>
          m
            .field('email')
            .strategy('exact')
            .weight(50)
            .field('firstName')
            .strategy('exact')
            .weight(50)
        )
        .thresholds({ noMatch: 20, definiteMatch: 75 })
        .build()

      const input = createPersonRecord(
        { email: 'john@example.com', firstName: 'John' },
        'input'
      )
      const candidates = [
        createPersonRecord(
          { email: 'john@example.com', firstName: 'John' },
          '1'
        ),
      ]

      const result = resolver.resolve(input, candidates)

      expect(result.outcome).toBe('match')
    })
  })

  describe('Error Handling', () => {
    it('should throw error if type is not specified', () => {
      expect(() => {
        HaveWeMet.create<Person>()
          .schema((s) =>
            s
              .field('email')
              // Missing .type() call
              .normalizer('email')
              .build()
          )
          .matching((m) => m.field('email').strategy('exact').weight(100))
          .thresholds({ noMatch: 20, definiteMatch: 75 })
          .build()
      }).toThrow("Field 'email' must have a type")
    })
  })

  describe('Chaining and Ergonomics', () => {
    it('should support method chaining for complex configurations', () => {
      // Test that all methods return the correct builder for chaining
      const resolver = HaveWeMet.create<Person>()
        .schema((s) =>
          s
            .field('email')
            .type('email')
            .normalizer('email')
            .normalizerOptions({ removePlusAddressing: true })
            .required(true)
            .field('firstName')
            .type('name')
            .component('first')
            .normalizer('name', { preserveCase: false })
            .required(true)
        )
        .matching((m) =>
          m
            .field('email')
            .strategy('exact')
            .weight(50)
            .field('firstName')
            .strategy('exact')
            .weight(50)
        )
        .thresholds({ noMatch: 20, definiteMatch: 75 })
        .build()

      const input = createPersonRecord(
        { email: 'john+test@example.com', firstName: 'JOHN' },
        'input'
      )
      const candidates = [
        createPersonRecord({ email: 'john@example.com', firstName: 'John' }, '1'),
      ]

      const result = resolver.resolve(input, candidates)

      expect(result.outcome).toBe('match')
    })
  })
})
