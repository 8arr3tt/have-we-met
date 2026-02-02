import { describe, it, expect } from 'vitest'
import {
  normalizeEmail,
  isValidEmail,
  type EmailComponents,
} from '../../../src/core/normalizers/email'
import { getNormalizer } from '../../../src/core/normalizers/registry'

describe('Email Normalizer', () => {
  describe('isValidEmail', () => {
    it('should validate basic email formats', () => {
      expect(isValidEmail('user@example.com')).toBe(true)
      expect(isValidEmail('test@test.org')).toBe(true)
      expect(isValidEmail('john.doe@company.co.uk')).toBe(true)
    })

    it('should accept emails with plus-addressing', () => {
      expect(isValidEmail('user+tag@example.com')).toBe(true)
      expect(isValidEmail('test+work@test.org')).toBe(true)
    })

    it('should accept emails with dots in local part', () => {
      expect(isValidEmail('john.doe@example.com')).toBe(true)
      expect(isValidEmail('first.middle.last@example.com')).toBe(true)
    })

    it('should accept emails with hyphens and underscores', () => {
      expect(isValidEmail('user-name@example.com')).toBe(true)
      expect(isValidEmail('user_name@example.com')).toBe(true)
      expect(isValidEmail('user-name_test@example.com')).toBe(true)
    })

    it('should accept emails with numbers', () => {
      expect(isValidEmail('user123@example.com')).toBe(true)
      expect(isValidEmail('123user@example.com')).toBe(true)
    })

    it('should reject emails without @ symbol', () => {
      expect(isValidEmail('not-an-email')).toBe(false)
      expect(isValidEmail('userexample.com')).toBe(false)
    })

    it('should reject emails with multiple @ symbols', () => {
      expect(isValidEmail('user@@example.com')).toBe(false)
      expect(isValidEmail('user@test@example.com')).toBe(false)
    })

    it('should reject emails without domain', () => {
      expect(isValidEmail('user@')).toBe(false)
      expect(isValidEmail('@example.com')).toBe(false)
    })

    it('should reject emails without TLD', () => {
      expect(isValidEmail('user@example')).toBe(false)
      expect(isValidEmail('user@domain')).toBe(false)
    })

    it('should reject emails with single-character TLD', () => {
      expect(isValidEmail('user@domain.x')).toBe(false)
    })

    it('should reject emails with invalid characters', () => {
      expect(isValidEmail('user name@example.com')).toBe(false)
      expect(isValidEmail('user@exam ple.com')).toBe(false)
    })

    it('should reject emails starting or ending with dot in local part', () => {
      expect(isValidEmail('.user@example.com')).toBe(false)
      expect(isValidEmail('user.@example.com')).toBe(false)
    })

    it('should reject empty or null input', () => {
      expect(isValidEmail('')).toBe(false)
      expect(isValidEmail(null as any)).toBe(false)
      expect(isValidEmail(undefined as any)).toBe(false)
    })

    it('should accept single character local part', () => {
      expect(isValidEmail('a@example.com')).toBe(true)
    })
  })

  describe('normalizeEmail', () => {
    describe('basic normalization', () => {
      it('should normalize email to lowercase', () => {
        expect(normalizeEmail('John@Example.Com')).toBe('john@example.com')
        expect(normalizeEmail('TEST@TEST.COM')).toBe('test@test.com')
        expect(normalizeEmail('User@Domain.Org')).toBe('user@domain.org')
      })

      it('should trim whitespace', () => {
        expect(normalizeEmail('  user@example.com  ')).toBe('user@example.com')
        expect(normalizeEmail('\tuser@example.com\t')).toBe('user@example.com')
        expect(normalizeEmail(' john@domain.com ')).toBe('john@domain.com')
      })

      it('should handle already normalized emails', () => {
        expect(normalizeEmail('user@example.com')).toBe('user@example.com')
        expect(normalizeEmail('test@test.org')).toBe('test@test.org')
      })

      it('should return null for null/undefined', () => {
        expect(normalizeEmail(null)).toBe(null)
        expect(normalizeEmail(undefined)).toBe(null)
      })

      it('should return null for empty strings', () => {
        expect(normalizeEmail('')).toBe(null)
        expect(normalizeEmail('   ')).toBe(null)
      })

      it('should coerce non-string inputs', () => {
        // Numbers don't become valid emails, so will return null after validation
        expect(normalizeEmail(123)).toBe(null)
      })
    })

    describe('plus-addressing', () => {
      it('should remove plus-addressing by default', () => {
        expect(normalizeEmail('user+tag@example.com')).toBe('user@example.com')
        expect(normalizeEmail('john+work@domain.com')).toBe('john@domain.com')
        expect(normalizeEmail('test+spam+filter@test.org')).toBe(
          'test@test.org'
        )
      })

      it('should preserve plus-addressing when option is false', () => {
        expect(
          normalizeEmail('user+tag@example.com', {
            removePlusAddressing: false,
          })
        ).toBe('user+tag@example.com')
        expect(
          normalizeEmail('john+work@domain.com', {
            removePlusAddressing: false,
          })
        ).toBe('john+work@domain.com')
      })

      it('should handle emails without plus-addressing', () => {
        expect(normalizeEmail('user@example.com')).toBe('user@example.com')
        expect(normalizeEmail('john.doe@example.com')).toBe(
          'john.doe@example.com'
        )
      })
    })

    describe('Gmail dot normalization', () => {
      it('should not remove dots by default', () => {
        expect(normalizeEmail('john.smith@gmail.com')).toBe(
          'john.smith@gmail.com'
        )
        expect(normalizeEmail('first.last@gmail.com')).toBe(
          'first.last@gmail.com'
        )
      })

      it('should remove dots in Gmail addresses when enabled', () => {
        expect(
          normalizeEmail('john.smith@gmail.com', { removeGmailDots: true })
        ).toBe('johnsmith@gmail.com')
        expect(
          normalizeEmail('first.last@gmail.com', { removeGmailDots: true })
        ).toBe('firstlast@gmail.com')
        expect(
          normalizeEmail('a.b.c.d@gmail.com', { removeGmailDots: true })
        ).toBe('abcd@gmail.com')
      })

      it('should remove dots in googlemail.com addresses when enabled', () => {
        expect(
          normalizeEmail('john.smith@googlemail.com', { removeGmailDots: true })
        ).toBe('johnsmith@googlemail.com')
      })

      it('should not remove dots in non-Gmail addresses', () => {
        expect(
          normalizeEmail('john.smith@example.com', { removeGmailDots: true })
        ).toBe('john.smith@example.com')
        expect(
          normalizeEmail('user.name@yahoo.com', { removeGmailDots: true })
        ).toBe('user.name@yahoo.com')
      })

      it('should work with both plus-addressing and dot removal', () => {
        expect(
          normalizeEmail('john.smith+work@gmail.com', {
            removePlusAddressing: true,
            removeGmailDots: true,
          })
        ).toBe('johnsmith@gmail.com')
      })
    })

    describe('validation', () => {
      it('should reject invalid emails by default', () => {
        expect(normalizeEmail('not-an-email')).toBe(null)
        expect(normalizeEmail('user@')).toBe(null)
        expect(normalizeEmail('@example.com')).toBe(null)
        expect(normalizeEmail('user@@example.com')).toBe(null)
      })

      it('should skip validation when validate is false', () => {
        // Even invalid formats will be normalized
        expect(normalizeEmail('not-an-email', { validate: false })).toBe(null)
        // But emails without @ will still fail (can't split)
        expect(normalizeEmail('user@', { validate: false })).toBe(null)
      })

      it('should reject emails without TLD', () => {
        expect(normalizeEmail('user@domain')).toBe(null)
      })

      it('should reject emails with spaces', () => {
        expect(normalizeEmail('user name@example.com')).toBe(null)
        expect(normalizeEmail('user@exam ple.com')).toBe(null)
      })
    })

    describe('options: outputFormat', () => {
      it('should return full email string by default', () => {
        const result = normalizeEmail('user@example.com')
        expect(typeof result).toBe('string')
        expect(result).toBe('user@example.com')
      })

      it('should return components when outputFormat is "components"', () => {
        const result = normalizeEmail('user@example.com', {
          outputFormat: 'components',
        }) as EmailComponents

        expect(result).toEqual({
          localPart: 'user',
          domain: 'example.com',
          full: 'user@example.com',
        })
      })

      it('should include baseName in components when plus-addressing is removed', () => {
        const result = normalizeEmail('user+tag@example.com', {
          outputFormat: 'components',
          removePlusAddressing: true,
        }) as EmailComponents

        expect(result).toEqual({
          localPart: 'user',
          domain: 'example.com',
          full: 'user@example.com',
          baseName: 'user',
        })
      })

      it('should not include baseName when plus-addressing is preserved', () => {
        const result = normalizeEmail('user+tag@example.com', {
          outputFormat: 'components',
          removePlusAddressing: false,
        }) as EmailComponents

        expect(result.baseName).toBeUndefined()
      })

      it('should include components with Gmail dot removal', () => {
        const result = normalizeEmail('john.smith@gmail.com', {
          outputFormat: 'components',
          removeGmailDots: true,
        }) as EmailComponents

        expect(result).toEqual({
          localPart: 'johnsmith',
          domain: 'gmail.com',
          full: 'johnsmith@gmail.com',
        })
      })
    })

    describe('complex scenarios', () => {
      it('should handle mixed case with plus-addressing', () => {
        expect(normalizeEmail('User+Tag@Example.COM')).toBe('user@example.com')
      })

      it('should handle whitespace with plus-addressing', () => {
        expect(normalizeEmail('  user+work@example.com  ')).toBe(
          'user@example.com'
        )
      })

      it('should handle all options together', () => {
        expect(
          normalizeEmail('  John.Smith+Work@Gmail.Com  ', {
            removePlusAddressing: true,
            removeGmailDots: true,
            normalizeDomain: true,
          })
        ).toBe('johnsmith@gmail.com')
      })

      it('should handle complex Gmail addresses', () => {
        expect(
          normalizeEmail('john.smith+newsletters+spam@gmail.com', {
            removePlusAddressing: true,
            removeGmailDots: true,
          })
        ).toBe('johnsmith@gmail.com')
      })
    })

    describe('edge cases', () => {
      it('should handle single character local parts', () => {
        expect(normalizeEmail('a@example.com')).toBe('a@example.com')
        expect(normalizeEmail('x+tag@test.org')).toBe('x@test.org')
      })

      it('should handle long domain names', () => {
        expect(normalizeEmail('user@subdomain.example.co.uk')).toBe(
          'user@subdomain.example.co.uk'
        )
      })

      it('should handle numbers in emails', () => {
        expect(normalizeEmail('user123@example456.com')).toBe(
          'user123@example456.com'
        )
      })

      it('should handle hyphens and underscores', () => {
        expect(normalizeEmail('user-name_test@example.com')).toBe(
          'user-name_test@example.com'
        )
      })

      it('should handle international TLDs', () => {
        expect(normalizeEmail('user@example.de')).toBe('user@example.de')
        expect(normalizeEmail('user@example.co.jp')).toBe('user@example.co.jp')
      })
    })

    describe('registry integration', () => {
      it('should be registered in the normalizer registry', () => {
        const normalizer = getNormalizer('email')
        expect(normalizer).toBeDefined()
        expect(normalizer?.('User@Example.Com')).toBe('user@example.com')
      })

      it('should work with registry options', () => {
        const normalizer = getNormalizer('email')
        const result = normalizer?.('user+tag@example.com', {
          removePlusAddressing: false,
        })
        expect(result).toBe('user+tag@example.com')
      })

      it('should return components via registry', () => {
        const normalizer = getNormalizer('email')
        const result = normalizer?.('user@example.com', {
          outputFormat: 'components',
        }) as EmailComponents
        expect(result).toHaveProperty('localPart')
        expect(result).toHaveProperty('domain')
        expect(result).toHaveProperty('full')
      })
    })
  })
})
