/**
 * NINO Validator Tests
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  ninoValidator,
  createNINOValidator,
  normalizeNINO,
  formatNINO,
  parseNINO,
  hasValidFirstLetter,
  hasValidSecondLetter,
  hasValidPrefix,
  hasValidSuffix,
  isAdministrativeNINO,
} from './nino-validator.js'
import type { ServiceContext } from '../../types.js'
import type { ResolverConfig } from '../../../types/config.js'

const createMockContext = (): ServiceContext => ({
  record: {},
  config: {} as unknown as ResolverConfig,
  metadata: {
    correlationId: 'test-123',
    startedAt: new Date(),
  },
})

describe('NINO Validator', () => {
  describe('normalizeNINO', () => {
    it('removes spaces and uppercases', () => {
      expect(normalizeNINO('ab 12 34 56 c')).toBe('AB123456C')
      expect(normalizeNINO('AB 12 34 56 C')).toBe('AB123456C')
    })

    it('handles no spaces', () => {
      expect(normalizeNINO('AB123456C')).toBe('AB123456C')
    })

    it('handles null and undefined', () => {
      expect(normalizeNINO(null)).toBe('')
      expect(normalizeNINO(undefined)).toBe('')
    })

    it('handles mixed case', () => {
      expect(normalizeNINO('aB123456c')).toBe('AB123456C')
    })
  })

  describe('formatNINO', () => {
    it('formats 9 characters as AA 11 22 33 B', () => {
      expect(formatNINO('AB123456C')).toBe('AB 12 34 56 C')
    })

    it('returns original if not 9 characters', () => {
      expect(formatNINO('AB1234')).toBe('AB1234')
      expect(formatNINO('AB123456CD')).toBe('AB123456CD')
    })

    it('normalizes before formatting', () => {
      expect(formatNINO('ab 12 34 56 c')).toBe('AB 12 34 56 C')
    })
  })

  describe('parseNINO', () => {
    it('parses valid NINO with spaces', () => {
      const parsed = parseNINO('AB 12 34 56 C')

      expect(parsed).not.toBeNull()
      expect(parsed?.prefix).toBe('AB')
      expect(parsed?.numbers).toBe('123456')
      expect(parsed?.suffix).toBe('C')
      expect(parsed?.firstLetter).toBe('A')
      expect(parsed?.secondLetter).toBe('B')
    })

    it('parses valid NINO without spaces', () => {
      const parsed = parseNINO('AB123456C')

      expect(parsed).not.toBeNull()
      expect(parsed?.prefix).toBe('AB')
    })

    it('parses lowercase NINO', () => {
      const parsed = parseNINO('ab123456c')

      expect(parsed).not.toBeNull()
      expect(parsed?.prefix).toBe('AB')
      expect(parsed?.suffix).toBe('C')
    })

    it('returns null for invalid format', () => {
      expect(parseNINO('invalid')).toBeNull()
      expect(parseNINO('AB1234567')).toBeNull()
      expect(parseNINO('ABC12345D')).toBeNull()
      expect(parseNINO('1B123456C')).toBeNull()
    })
  })

  describe('hasValidFirstLetter', () => {
    it('accepts valid first letters', () => {
      const validLetters = 'ABCEGHJ KLMNOPRSTWXYZ'.replace(' ', '').split('')
      validLetters.forEach((letter) => {
        expect(hasValidFirstLetter(letter)).toBe(true)
      })
    })

    it('rejects invalid first letters (D, F, I, Q, U, V)', () => {
      expect(hasValidFirstLetter('D')).toBe(false)
      expect(hasValidFirstLetter('F')).toBe(false)
      expect(hasValidFirstLetter('I')).toBe(false)
      expect(hasValidFirstLetter('Q')).toBe(false)
      expect(hasValidFirstLetter('U')).toBe(false)
      expect(hasValidFirstLetter('V')).toBe(false)
    })

    it('is case insensitive', () => {
      expect(hasValidFirstLetter('a')).toBe(true)
      expect(hasValidFirstLetter('d')).toBe(false)
    })
  })

  describe('hasValidSecondLetter', () => {
    it('accepts valid second letters', () => {
      const validLetters = 'ABCEGHJ KLMNPRSTWXYZ'.replace(' ', '').split('')
      validLetters.forEach((letter) => {
        expect(hasValidSecondLetter(letter)).toBe(true)
      })
    })

    it('rejects invalid second letters (D, F, I, O, Q, U, V)', () => {
      expect(hasValidSecondLetter('D')).toBe(false)
      expect(hasValidSecondLetter('F')).toBe(false)
      expect(hasValidSecondLetter('I')).toBe(false)
      expect(hasValidSecondLetter('O')).toBe(false)
      expect(hasValidSecondLetter('Q')).toBe(false)
      expect(hasValidSecondLetter('U')).toBe(false)
      expect(hasValidSecondLetter('V')).toBe(false)
    })
  })

  describe('hasValidPrefix', () => {
    it('accepts valid prefixes', () => {
      expect(hasValidPrefix('AB')).toBe(true)
      expect(hasValidPrefix('JG')).toBe(true)
      expect(hasValidPrefix('NE')).toBe(true)
    })

    it('rejects invalid prefixes (BG, GB, KN, NK, NT, TN, ZZ)', () => {
      expect(hasValidPrefix('BG')).toBe(false)
      expect(hasValidPrefix('GB')).toBe(false)
      expect(hasValidPrefix('KN')).toBe(false)
      expect(hasValidPrefix('NK')).toBe(false)
      expect(hasValidPrefix('NT')).toBe(false)
      expect(hasValidPrefix('TN')).toBe(false)
      expect(hasValidPrefix('ZZ')).toBe(false)
    })

    it('rejects administrative prefixes (OO)', () => {
      expect(hasValidPrefix('OO')).toBe(false)
    })
  })

  describe('hasValidSuffix', () => {
    it('accepts valid suffixes (A, B, C, D)', () => {
      expect(hasValidSuffix('A')).toBe(true)
      expect(hasValidSuffix('B')).toBe(true)
      expect(hasValidSuffix('C')).toBe(true)
      expect(hasValidSuffix('D')).toBe(true)
    })

    it('rejects invalid suffixes', () => {
      expect(hasValidSuffix('E')).toBe(false)
      expect(hasValidSuffix('X')).toBe(false)
      expect(hasValidSuffix('1')).toBe(false)
    })

    it('is case insensitive', () => {
      expect(hasValidSuffix('a')).toBe(true)
      expect(hasValidSuffix('b')).toBe(true)
    })
  })

  describe('isAdministrativeNINO', () => {
    it('identifies administrative prefixes', () => {
      expect(isAdministrativeNINO('OO')).toBe(true)
    })

    it('returns false for regular prefixes', () => {
      expect(isAdministrativeNINO('AB')).toBe(false)
      expect(isAdministrativeNINO('JG')).toBe(false)
    })
  })

  describe('ninoValidator.execute', () => {
    let context: ServiceContext

    beforeEach(() => {
      context = createMockContext()
    })

    it('validates correct NINO with spaces', async () => {
      const result = await ninoValidator.execute(
        { field: 'nino', value: 'AB 12 34 56 C' },
        context
      )

      expect(result.success).toBe(true)
      expect(result.data?.valid).toBe(true)
      expect(result.data?.details?.normalizedValue).toBe('AB123456C')
      expect(result.data?.details?.confidence).toBe(1.0)
    })

    it('validates correct NINO without spaces', async () => {
      const result = await ninoValidator.execute(
        { field: 'nino', value: 'AB123456C' },
        context
      )

      expect(result.success).toBe(true)
      expect(result.data?.valid).toBe(true)
    })

    it('validates lowercase NINO', async () => {
      const result = await ninoValidator.execute(
        { field: 'nino', value: 'ab123456c' },
        context
      )

      expect(result.success).toBe(true)
      expect(result.data?.valid).toBe(true)
      expect(result.data?.details?.normalizedValue).toBe('AB123456C')
    })

    it('rejects empty values', async () => {
      const result = await ninoValidator.execute(
        { field: 'nino', value: '' },
        context
      )

      expect(result.success).toBe(true)
      expect(result.data?.valid).toBe(false)
      expect(result.data?.invalidReason).toBe(
        'National Insurance Number is required'
      )
    })

    it('rejects invalid format', async () => {
      const result = await ninoValidator.execute(
        { field: 'nino', value: 'invalid' },
        context
      )

      expect(result.success).toBe(true)
      expect(result.data?.valid).toBe(false)
      expect(result.data?.invalidReason).toBe('Invalid NINO format')
      expect(result.data?.suggestions).toBeDefined()
    })

    it('rejects invalid first letter (D, F, I, Q, U, V)', async () => {
      const invalidFirstLetters = ['D', 'F', 'I', 'Q', 'U', 'V']

      for (const letter of invalidFirstLetters) {
        const result = await ninoValidator.execute(
          { field: 'nino', value: `${letter}B123456C` },
          context
        )

        expect(result.data?.valid).toBe(false)
        expect(result.data?.invalidReason).toContain(letter)
      }
    })

    it('rejects invalid second letter (D, F, I, O, Q, U, V)', async () => {
      const invalidSecondLetters = ['D', 'F', 'I', 'O', 'Q', 'U', 'V']

      for (const letter of invalidSecondLetters) {
        const result = await ninoValidator.execute(
          { field: 'nino', value: `A${letter}123456C` },
          context
        )

        expect(result.data?.valid).toBe(false)
        expect(result.data?.invalidReason).toContain(letter)
      }
    })

    it('rejects invalid prefixes (BG, GB, KN, NK, NT, TN, ZZ)', async () => {
      const invalidPrefixes = ['BG', 'GB', 'KN', 'NK', 'NT', 'TN', 'ZZ']

      for (const prefix of invalidPrefixes) {
        const result = await ninoValidator.execute(
          { field: 'nino', value: `${prefix}123456C` },
          context
        )

        expect(result.data?.valid).toBe(false)
        expect(result.data?.invalidReason).toContain(prefix)
      }
    })

    it('rejects administrative prefixes (OO)', async () => {
      const result = await ninoValidator.execute(
        { field: 'nino', value: 'OO123456C' },
        context
      )

      expect(result.success).toBe(true)
      expect(result.data?.valid).toBe(false)
      expect(result.data?.invalidReason).toContain('OO')
      expect(result.data?.invalidReason).toContain('administrative')
    })

    it('rejects invalid suffix (not A, B, C, D)', async () => {
      const result = await ninoValidator.execute(
        { field: 'nino', value: 'AB123456X' },
        context
      )

      expect(result.success).toBe(true)
      expect(result.data?.valid).toBe(false)
      expect(result.data?.invalidReason).toContain('X')
    })

    it('returns validation checks detail', async () => {
      const result = await ninoValidator.execute(
        { field: 'nino', value: 'AB123456C' },
        context
      )

      expect(result.success).toBe(true)
      expect(result.data?.details?.checks).toBeDefined()
      expect(result.data?.details?.checks).toContainEqual(
        expect.objectContaining({ name: 'format', passed: true })
      )
      expect(result.data?.details?.checks).toContainEqual(
        expect.objectContaining({ name: 'first-letter', passed: true })
      )
      expect(result.data?.details?.checks).toContainEqual(
        expect.objectContaining({ name: 'second-letter', passed: true })
      )
      expect(result.data?.details?.checks).toContainEqual(
        expect.objectContaining({ name: 'suffix', passed: true })
      )
    })

    it('tracks timing information', async () => {
      const result = await ninoValidator.execute(
        { field: 'nino', value: 'AB123456C' },
        context
      )

      expect(result.timing).toBeDefined()
      expect(result.timing.startedAt).toBeInstanceOf(Date)
      expect(result.timing.completedAt).toBeInstanceOf(Date)
    })
  })

  describe('createNINOValidator with options', () => {
    let context: ServiceContext

    beforeEach(() => {
      context = createMockContext()
    })

    it('creates validator with default options', () => {
      const validator = createNINOValidator()

      expect(validator.name).toBe('nino-validator')
      expect(validator.type).toBe('validation')
    })

    it('creates validator with custom name', () => {
      const validator = createNINOValidator({ name: 'custom-nino' })

      expect(validator.name).toBe('custom-nino')
    })

    it('allows temporary NINOs when configured', async () => {
      const validator = createNINOValidator({ allowTemporary: true })

      const result = await validator.execute(
        { field: 'nino', value: 'TN123456C' },
        context
      )

      expect(result.success).toBe(true)
      expect(result.data?.valid).toBe(true)
    })

    it('allows administrative NINOs when configured', async () => {
      const validator = createNINOValidator({ allowAdministrative: true })

      const result = await validator.execute(
        { field: 'nino', value: 'OO123456C' },
        context
      )

      expect(result.success).toBe(true)
      expect(result.data?.valid).toBe(true)
    })
  })

  describe('ninoValidator.healthCheck', () => {
    it('returns healthy status', async () => {
      const result = await ninoValidator.healthCheck!()

      expect(result.healthy).toBe(true)
      expect(result.checkedAt).toBeInstanceOf(Date)
      expect(result.responseTimeMs).toBeGreaterThanOrEqual(0)
      expect(result.details?.validNINOTestPassed).toBe(true)
      expect(result.details?.invalidPrefixTestPassed).toBe(true)
      expect(result.details?.invalidSuffixTestPassed).toBe(true)
    })
  })

  describe('edge cases', () => {
    let context: ServiceContext

    beforeEach(() => {
      context = createMockContext()
    })

    it('handles whitespace-only input', async () => {
      const result = await ninoValidator.execute(
        { field: 'nino', value: '   ' },
        context
      )

      expect(result.success).toBe(true)
      expect(result.data?.valid).toBe(false)
      expect(result.data?.invalidReason).toBe(
        'National Insurance Number is required'
      )
    })

    it('handles extra whitespace in NINO', async () => {
      const result = await ninoValidator.execute(
        { field: 'nino', value: 'AB  12  34  56  C' },
        context
      )

      expect(result.success).toBe(true)
      expect(result.data?.valid).toBe(true)
    })

    it('normalizes to uppercase without spaces', async () => {
      const result = await ninoValidator.execute(
        { field: 'nino', value: 'ab 12 34 56 c' },
        context
      )

      expect(result.success).toBe(true)
      expect(result.data?.valid).toBe(true)
      expect(result.data?.details?.normalizedValue).toBe('AB123456C')
    })

    it('provides helpful suggestions for invalid NINOs', async () => {
      const result = await ninoValidator.execute(
        { field: 'nino', value: 'DB123456C' },
        context
      )

      expect(result.success).toBe(true)
      expect(result.data?.valid).toBe(false)
      expect(result.data?.suggestions).toBeDefined()
      expect(result.data?.suggestions?.length).toBeGreaterThan(0)
    })

    it('validates all valid suffix letters', async () => {
      const validSuffixes = ['A', 'B', 'C', 'D']

      for (const suffix of validSuffixes) {
        const result = await ninoValidator.execute(
          { field: 'nino', value: `AB123456${suffix}` },
          context
        )

        expect(result.data?.valid).toBe(true)
      }
    })
  })
})
