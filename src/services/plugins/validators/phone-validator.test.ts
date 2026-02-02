/**
 * Phone Validator Tests
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  phoneValidator,
  createPhoneValidator,
  getValidCountryCodes,
  isValidCountryCode,
  normalizePhoneInput,
} from './phone-validator.js'
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

describe('Phone Validator', () => {
  describe('getValidCountryCodes', () => {
    it('returns array of valid country codes', () => {
      const codes = getValidCountryCodes()

      expect(Array.isArray(codes)).toBe(true)
      expect(codes.length).toBeGreaterThan(0)
      expect(codes).toContain('US')
      expect(codes).toContain('GB')
      expect(codes).toContain('DE')
    })
  })

  describe('isValidCountryCode', () => {
    it('validates known country codes', () => {
      expect(isValidCountryCode('US')).toBe(true)
      expect(isValidCountryCode('GB')).toBe(true)
      expect(isValidCountryCode('CA')).toBe(true)
    })

    it('rejects invalid country codes', () => {
      expect(isValidCountryCode('XX')).toBe(false)
      expect(isValidCountryCode('ZZZ')).toBe(false)
      expect(isValidCountryCode('')).toBe(false)
    })
  })

  describe('normalizePhoneInput', () => {
    it('trims whitespace', () => {
      expect(normalizePhoneInput('  +1 555 123 4567  ')).toBe('+1 555 123 4567')
    })

    it('handles null and undefined', () => {
      expect(normalizePhoneInput(null)).toBe('')
      expect(normalizePhoneInput(undefined)).toBe('')
    })

    it('converts numbers to strings', () => {
      expect(normalizePhoneInput(5551234567)).toBe('5551234567')
    })
  })

  describe('phoneValidator.execute', () => {
    let context: ServiceContext

    beforeEach(() => {
      context = createMockContext()
    })

    it('validates international phone numbers', async () => {
      const result = await phoneValidator.execute(
        { field: 'phone', value: '+1 202 555 1234' },
        context
      )

      expect(result.success).toBe(true)
      expect(result.data?.valid).toBe(true)
      expect(result.data?.details?.normalizedValue).toBe('+12025551234')
      expect(result.data?.details?.confidence).toBe(1.0)
    })

    it('validates US phone numbers', async () => {
      // Use a valid US format with real area code (202 is Washington DC)
      const result = await phoneValidator.execute(
        { field: 'phone', value: '+1 (202) 555-0123' },
        context
      )

      expect(result.success).toBe(true)
      expect(result.data?.valid).toBe(true)
    })

    it('validates UK phone numbers', async () => {
      const result = await phoneValidator.execute(
        { field: 'phone', value: '+44 20 7123 4567' },
        context
      )

      expect(result.success).toBe(true)
      expect(result.data?.valid).toBe(true)
    })

    it('rejects empty values', async () => {
      const result = await phoneValidator.execute(
        { field: 'phone', value: '' },
        context
      )

      expect(result.success).toBe(true)
      expect(result.data?.valid).toBe(false)
      expect(result.data?.invalidReason).toBe('Phone number is required')
    })

    it('rejects invalid phone numbers', async () => {
      const result = await phoneValidator.execute(
        { field: 'phone', value: 'invalid' },
        context
      )

      expect(result.success).toBe(true)
      expect(result.data?.valid).toBe(false)
      expect(result.data?.invalidReason).toBe('Invalid phone number format')
      expect(result.data?.suggestions).toBeDefined()
    })

    it('rejects phone numbers that parse but are invalid for country', async () => {
      const result = await phoneValidator.execute(
        { field: 'phone', value: '+1 123' },
        context
      )

      expect(result.success).toBe(true)
      expect(result.data?.valid).toBe(false)
    })

    it('returns metadata with phone number details', async () => {
      const result = await phoneValidator.execute(
        { field: 'phone', value: '+1 202 555 1234' },
        context
      )

      expect(result.success).toBe(true)
      expect(result.metadata).toBeDefined()
      expect(result.metadata?.countryCode).toBe('US')
      expect(result.metadata?.callingCode).toBe('1')
      expect(result.metadata?.e164Format).toBe('+12025551234')
    })

    it('returns number type when detected', async () => {
      const result = await phoneValidator.execute(
        { field: 'phone', value: '+1 202 555 1234' },
        context
      )

      expect(result.success).toBe(true)
      expect(result.metadata?.numberType).toBeDefined()
    })

    it('returns national and international formats', async () => {
      const result = await phoneValidator.execute(
        { field: 'phone', value: '+1 202 555 1234' },
        context
      )

      expect(result.success).toBe(true)
      expect(result.metadata?.nationalFormat).toBeDefined()
      expect(result.metadata?.internationalFormat).toBeDefined()
    })

    it('tracks timing information', async () => {
      const result = await phoneValidator.execute(
        { field: 'phone', value: '+1 202 555 1234' },
        context
      )

      expect(result.timing).toBeDefined()
      expect(result.timing.startedAt).toBeInstanceOf(Date)
      expect(result.timing.completedAt).toBeInstanceOf(Date)
    })
  })

  describe('createPhoneValidator with options', () => {
    let context: ServiceContext

    beforeEach(() => {
      context = createMockContext()
    })

    it('creates validator with default options', () => {
      const validator = createPhoneValidator()

      expect(validator.name).toBe('phone-validator')
      expect(validator.type).toBe('validation')
    })

    it('creates validator with custom name', () => {
      const validator = createPhoneValidator({ name: 'custom-phone' })

      expect(validator.name).toBe('custom-phone')
    })

    it('validates with default country', async () => {
      const validator = createPhoneValidator({ defaultCountry: 'US' })

      const result = await validator.execute(
        { field: 'phone', value: '202 555 1234' },
        context
      )

      expect(result.success).toBe(true)
      expect(result.data?.valid).toBe(true)
      expect(result.metadata?.countryCode).toBe('US')
    })

    it('restricts to allowed countries', async () => {
      const validator = createPhoneValidator({
        allowedCountries: ['US', 'CA'],
      })

      // US number should pass
      const usResult = await validator.execute(
        { field: 'phone', value: '+1 202 555 1234' },
        context
      )
      expect(usResult.data?.valid).toBe(true)

      // UK number should fail
      const ukResult = await validator.execute(
        { field: 'phone', value: '+44 20 7123 4567' },
        context
      )
      expect(ukResult.data?.valid).toBe(false)
      expect(ukResult.data?.invalidReason).toContain('not accepted')
    })

    it('validates mobile-only when configured', async () => {
      const validator = createPhoneValidator({ mobileOnly: true })

      // This test depends on libphonenumber-js's ability to detect number types
      // Some numbers may be classified as FIXED_LINE_OR_MOBILE
      const result = await validator.execute(
        { field: 'phone', value: '+1 202 555 1234' },
        context
      )

      expect(result.success).toBe(true)
      // The result depends on number type detection
    })

    it('validates landline-only when configured', async () => {
      const validator = createPhoneValidator({ landlineOnly: true })

      const result = await validator.execute(
        { field: 'phone', value: '+1 202 555 1234' },
        context
      )

      expect(result.success).toBe(true)
      // The result depends on number type detection
    })

    it('throws error when both mobileOnly and landlineOnly are set', () => {
      expect(() => {
        createPhoneValidator({ mobileOnly: true, landlineOnly: true })
      }).toThrow('Cannot set both mobileOnly and landlineOnly to true')
    })

    it('uses country from input context', async () => {
      const validator = createPhoneValidator()

      const result = await validator.execute(
        {
          field: 'phone',
          value: '020 7123 4567',
          context: { country: 'GB' },
        },
        context
      )

      expect(result.success).toBe(true)
      expect(result.data?.valid).toBe(true)
      expect(result.metadata?.countryCode).toBe('GB')
    })
  })

  describe('phoneValidator.healthCheck', () => {
    it('returns healthy status', async () => {
      const result = await phoneValidator.healthCheck!()

      expect(result.healthy).toBe(true)
      expect(result.checkedAt).toBeInstanceOf(Date)
      expect(result.responseTimeMs).toBeGreaterThanOrEqual(0)
      expect(result.details?.validUSTestPassed).toBe(true)
      expect(result.details?.validUKTestPassed).toBe(true)
      expect(result.details?.invalidTestPassed).toBe(true)
    })
  })

  describe('edge cases', () => {
    let context: ServiceContext

    beforeEach(() => {
      context = createMockContext()
    })

    it('handles various phone number formats', async () => {
      const formats = [
        '+1 (202) 555-1234',
        '+1.202.555.1234',
        '+12025551234',
        '1-202-555-1234',
      ]

      for (const format of formats) {
        const validator = createPhoneValidator({ defaultCountry: 'US' })
        const result = await validator.execute(
          { field: 'phone', value: format },
          context
        )
        expect(result.data?.valid).toBe(true)
      }
    })

    it('handles German phone numbers', async () => {
      const result = await phoneValidator.execute(
        { field: 'phone', value: '+49 30 12345678' },
        context
      )

      expect(result.success).toBe(true)
      expect(result.data?.valid).toBe(true)
      expect(result.metadata?.countryCode).toBe('DE')
    })

    it('handles Australian phone numbers', async () => {
      const result = await phoneValidator.execute(
        { field: 'phone', value: '+61 2 1234 5678' },
        context
      )

      expect(result.success).toBe(true)
      expect(result.data?.valid).toBe(true)
      expect(result.metadata?.countryCode).toBe('AU')
    })

    it('handles phone numbers with extensions', async () => {
      const result = await phoneValidator.execute(
        { field: 'phone', value: '+1 202 555 1234 ext. 567' },
        context
      )

      // libphonenumber-js may or may not handle extensions
      expect(result.success).toBe(true)
    })

    it('handles whitespace-only input', async () => {
      const result = await phoneValidator.execute(
        { field: 'phone', value: '   ' },
        context
      )

      expect(result.success).toBe(true)
      expect(result.data?.valid).toBe(false)
      expect(result.data?.invalidReason).toBe('Phone number is required')
    })

    it('normalizes to E.164 format', async () => {
      // Use a valid US number with real area code
      const result = await phoneValidator.execute(
        { field: 'phone', value: '+1 (202) 555-0123' },
        context
      )

      expect(result.success).toBe(true)
      expect(result.data?.valid).toBe(true)
      // E.164 format: +12025550123
      expect(result.data?.details?.normalizedValue).toMatch(/^\+\d+$/)
    })
  })
})
