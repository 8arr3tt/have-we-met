/**
 * Email Validator Tests
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  emailValidator,
  createEmailValidator,
  validateEmailFormat,
  normalizeEmail,
  extractDomain,
  isDisposableDomain,
} from './email-validator.js'
import type { ServiceContext } from '../../types.js'

const createMockContext = (): ServiceContext => ({
  record: {},
  config: {} as any,
  metadata: {
    correlationId: 'test-123',
    startedAt: new Date(),
  },
})

describe('Email Validator', () => {
  describe('validateEmailFormat', () => {
    it('validates correct email formats', () => {
      expect(validateEmailFormat('user@example.com').valid).toBe(true)
      expect(validateEmailFormat('user.name@example.com').valid).toBe(true)
      expect(validateEmailFormat('user+tag@example.com').valid).toBe(true)
      expect(validateEmailFormat('user@subdomain.example.com').valid).toBe(true)
      expect(validateEmailFormat('a@b.io').valid).toBe(true)
    })

    it('rejects invalid email formats', () => {
      expect(validateEmailFormat('invalid').valid).toBe(false)
      expect(validateEmailFormat('@example.com').valid).toBe(false)
      expect(validateEmailFormat('user@').valid).toBe(false)
      expect(validateEmailFormat('user@@example.com').valid).toBe(false)
      // Note: 'user@example' technically matches RFC but we require a valid TLD
      // The TLD check catches this case
      expect(validateEmailFormat('user@a').valid).toBe(false)
    })

    it('rejects empty values', () => {
      expect(validateEmailFormat('').valid).toBe(false)
      expect(validateEmailFormat('   ').valid).toBe(false)
    })

    it('rejects emails exceeding maximum length', () => {
      const longLocal = 'a'.repeat(255) + '@example.com'
      expect(validateEmailFormat(longLocal).valid).toBe(false)
    })

    it('rejects emails with invalid local part length', () => {
      const longLocal = 'a'.repeat(65) + '@example.com'
      expect(validateEmailFormat(longLocal).valid).toBe(false)
    })

    it('rejects emails with consecutive dots', () => {
      expect(validateEmailFormat('user..name@example.com').valid).toBe(false)
    })

    it('rejects emails where local part starts or ends with dot', () => {
      expect(validateEmailFormat('.user@example.com').valid).toBe(false)
      expect(validateEmailFormat('user.@example.com').valid).toBe(false)
    })

    it('rejects emails with invalid TLD', () => {
      expect(validateEmailFormat('user@example.c').valid).toBe(false)
    })
  })

  describe('normalizeEmail', () => {
    it('trims whitespace and lowercases', () => {
      expect(normalizeEmail('  User@Example.COM  ')).toBe('user@example.com')
    })

    it('handles null and undefined', () => {
      expect(normalizeEmail(null)).toBe('')
      expect(normalizeEmail(undefined)).toBe('')
    })

    it('converts numbers to strings', () => {
      expect(normalizeEmail(123)).toBe('123')
    })
  })

  describe('extractDomain', () => {
    it('extracts domain from email', () => {
      expect(extractDomain('user@example.com')).toBe('example.com')
      expect(extractDomain('user@SUBDOMAIN.Example.COM')).toBe('subdomain.example.com')
    })

    it('returns null for invalid emails', () => {
      expect(extractDomain('invalid')).toBe(null)
    })
  })

  describe('isDisposableDomain', () => {
    it('detects known disposable domains', () => {
      expect(isDisposableDomain('mailinator.com')).toBe(true)
      expect(isDisposableDomain('guerrillamail.com')).toBe(true)
      expect(isDisposableDomain('10minutemail.com')).toBe(true)
    })

    it('returns false for legitimate domains', () => {
      expect(isDisposableDomain('gmail.com')).toBe(false)
      expect(isDisposableDomain('example.com')).toBe(false)
      expect(isDisposableDomain('company.co.uk')).toBe(false)
    })

    it('is case insensitive', () => {
      expect(isDisposableDomain('MAILINATOR.COM')).toBe(true)
      expect(isDisposableDomain('Mailinator.Com')).toBe(true)
    })
  })

  describe('emailValidator.execute', () => {
    let context: ServiceContext

    beforeEach(() => {
      context = createMockContext()
    })

    it('validates correct email addresses', async () => {
      const result = await emailValidator.execute(
        { field: 'email', value: 'user@example.com' },
        context,
      )

      expect(result.success).toBe(true)
      expect(result.data?.valid).toBe(true)
      expect(result.data?.details?.normalizedValue).toBe('user@example.com')
      expect(result.data?.details?.confidence).toBe(1.0)
    })

    it('normalizes email to lowercase', async () => {
      const result = await emailValidator.execute(
        { field: 'email', value: 'User@Example.COM' },
        context,
      )

      expect(result.success).toBe(true)
      expect(result.data?.valid).toBe(true)
      expect(result.data?.details?.normalizedValue).toBe('user@example.com')
    })

    it('rejects empty values', async () => {
      const result = await emailValidator.execute(
        { field: 'email', value: '' },
        context,
      )

      expect(result.success).toBe(true)
      expect(result.data?.valid).toBe(false)
      expect(result.data?.invalidReason).toBe('Email address is required')
    })

    it('rejects invalid format', async () => {
      const result = await emailValidator.execute(
        { field: 'email', value: 'invalid-email' },
        context,
      )

      expect(result.success).toBe(true)
      expect(result.data?.valid).toBe(false)
      expect(result.data?.invalidReason).toContain('Invalid email format')
      expect(result.data?.suggestions).toBeDefined()
    })

    it('returns validation checks detail', async () => {
      const result = await emailValidator.execute(
        { field: 'email', value: 'user@example.com' },
        context,
      )

      expect(result.success).toBe(true)
      expect(result.data?.details?.checks).toBeDefined()
      expect(result.data?.details?.checks).toContainEqual(
        expect.objectContaining({ name: 'format', passed: true }),
      )
    })

    it('tracks timing information', async () => {
      const result = await emailValidator.execute(
        { field: 'email', value: 'user@example.com' },
        context,
      )

      expect(result.timing).toBeDefined()
      expect(result.timing.startedAt).toBeInstanceOf(Date)
      expect(result.timing.completedAt).toBeInstanceOf(Date)
      expect(result.timing.durationMs).toBeGreaterThanOrEqual(0)
    })
  })

  describe('createEmailValidator with options', () => {
    let context: ServiceContext

    beforeEach(() => {
      context = createMockContext()
    })

    it('creates validator with default options', () => {
      const validator = createEmailValidator()

      expect(validator.name).toBe('email-validator')
      expect(validator.type).toBe('validation')
    })

    it('creates validator with custom name', () => {
      const validator = createEmailValidator({ name: 'custom-email' })

      expect(validator.name).toBe('custom-email')
    })

    it('rejects disposable emails when configured', async () => {
      const validator = createEmailValidator({ rejectDisposable: true })

      const result = await validator.execute(
        { field: 'email', value: 'user@mailinator.com' },
        context,
      )

      expect(result.success).toBe(true)
      expect(result.data?.valid).toBe(false)
      expect(result.data?.invalidReason).toBe('Disposable email addresses are not allowed')
    })

    it('allows disposable emails when not configured', async () => {
      const validator = createEmailValidator({ rejectDisposable: false })

      const result = await validator.execute(
        { field: 'email', value: 'user@mailinator.com' },
        context,
      )

      expect(result.success).toBe(true)
      expect(result.data?.valid).toBe(true)
    })

    it('supports additional disposable domains', async () => {
      const validator = createEmailValidator({
        rejectDisposable: true,
        additionalDisposableDomains: ['custom-disposable.com'],
      })

      const result = await validator.execute(
        { field: 'email', value: 'user@custom-disposable.com' },
        context,
      )

      expect(result.success).toBe(true)
      expect(result.data?.valid).toBe(false)
      expect(result.data?.invalidReason).toBe('Disposable email addresses are not allowed')
    })

    it('includes MX check when configured', async () => {
      const validator = createEmailValidator({ checkMx: true })

      const result = await validator.execute(
        { field: 'email', value: 'user@example.com' },
        context,
      )

      expect(result.success).toBe(true)
      expect(result.data?.valid).toBe(true)
      expect(result.data?.details?.checks).toContainEqual(
        expect.objectContaining({ name: 'mx', passed: true }),
      )
    })
  })

  describe('emailValidator.healthCheck', () => {
    it('returns healthy status', async () => {
      const result = await emailValidator.healthCheck!()

      expect(result.healthy).toBe(true)
      expect(result.checkedAt).toBeInstanceOf(Date)
      expect(result.responseTimeMs).toBeGreaterThanOrEqual(0)
      expect(result.details?.validEmailTestPassed).toBe(true)
      expect(result.details?.invalidEmailTestPassed).toBe(true)
    })
  })

  describe('edge cases', () => {
    let context: ServiceContext

    beforeEach(() => {
      context = createMockContext()
    })

    it('handles email with plus addressing', async () => {
      const result = await emailValidator.execute(
        { field: 'email', value: 'user+tag@example.com' },
        context,
      )

      expect(result.success).toBe(true)
      expect(result.data?.valid).toBe(true)
    })

    it('handles email with subdomain', async () => {
      const result = await emailValidator.execute(
        { field: 'email', value: 'user@mail.subdomain.example.com' },
        context,
      )

      expect(result.success).toBe(true)
      expect(result.data?.valid).toBe(true)
    })

    it('handles international TLDs', async () => {
      const result = await emailValidator.execute(
        { field: 'email', value: 'user@example.co.uk' },
        context,
      )

      expect(result.success).toBe(true)
      expect(result.data?.valid).toBe(true)
    })

    it('handles new TLDs', async () => {
      const result = await emailValidator.execute(
        { field: 'email', value: 'user@example.technology' },
        context,
      )

      expect(result.success).toBe(true)
      expect(result.data?.valid).toBe(true)
    })

    it('handles numeric local part', async () => {
      const result = await emailValidator.execute(
        { field: 'email', value: '12345@example.com' },
        context,
      )

      expect(result.success).toBe(true)
      expect(result.data?.valid).toBe(true)
    })

    it('handles email with special characters in local part', async () => {
      const result = await emailValidator.execute(
        { field: 'email', value: "user.name!#$%&'*+/=?^_`{|}~@example.com" },
        context,
      )

      expect(result.success).toBe(true)
      expect(result.data?.valid).toBe(true)
    })
  })
})
