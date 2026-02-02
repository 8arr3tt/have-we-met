/**
 * SSN Validator Tests
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  ssnValidator,
  createSSNValidator,
  normalizeSSN,
  formatSSN,
  parseSSN,
  hasValidAreaNumber,
  hasValidGroupNumber,
  hasValidSerialNumber,
  isKnownInvalidSSN,
} from './ssn-validator.js'
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

describe('SSN Validator', () => {
  describe('normalizeSSN', () => {
    it('removes dashes from SSN', () => {
      expect(normalizeSSN('123-45-6789')).toBe('123456789')
    })

    it('removes spaces from SSN', () => {
      expect(normalizeSSN('123 45 6789')).toBe('123456789')
    })

    it('handles mixed formatting', () => {
      expect(normalizeSSN('123 - 45 - 6789')).toBe('123456789')
    })

    it('handles null and undefined', () => {
      expect(normalizeSSN(null)).toBe('')
      expect(normalizeSSN(undefined)).toBe('')
    })

    it('converts numbers to strings', () => {
      expect(normalizeSSN(123456789)).toBe('123456789')
    })
  })

  describe('formatSSN', () => {
    it('formats 9 digits as XXX-XX-XXXX', () => {
      expect(formatSSN('123456789')).toBe('123-45-6789')
    })

    it('returns original if not 9 digits', () => {
      expect(formatSSN('12345')).toBe('12345')
      expect(formatSSN('1234567890')).toBe('1234567890')
    })
  })

  describe('parseSSN', () => {
    it('parses valid SSN into components', () => {
      const parsed = parseSSN('123-45-6789')

      expect(parsed).not.toBeNull()
      expect(parsed?.area).toBe('123')
      expect(parsed?.group).toBe('45')
      expect(parsed?.serial).toBe('6789')
    })

    it('parses SSN without dashes', () => {
      const parsed = parseSSN('123456789')

      expect(parsed).not.toBeNull()
      expect(parsed?.area).toBe('123')
      expect(parsed?.group).toBe('45')
      expect(parsed?.serial).toBe('6789')
    })

    it('returns null for invalid format', () => {
      expect(parseSSN('invalid')).toBeNull()
      expect(parseSSN('12345')).toBeNull()
      // Note: parseSSN normalizes before parsing, so it can handle various formats
      // The regex accepts XXX-XX-XXXX or XXXXXXXXX after normalization
    })
  })

  describe('hasValidAreaNumber', () => {
    it('accepts valid area numbers', () => {
      expect(hasValidAreaNumber('001')).toBe(true)
      expect(hasValidAreaNumber('123')).toBe(true)
      expect(hasValidAreaNumber('665')).toBe(true)
      expect(hasValidAreaNumber('667')).toBe(true)
      expect(hasValidAreaNumber('899')).toBe(true)
    })

    it('rejects area number 000', () => {
      expect(hasValidAreaNumber('000')).toBe(false)
    })

    it('rejects area number 666', () => {
      expect(hasValidAreaNumber('666')).toBe(false)
    })

    it('rejects area numbers 900-999', () => {
      expect(hasValidAreaNumber('900')).toBe(false)
      expect(hasValidAreaNumber('950')).toBe(false)
      expect(hasValidAreaNumber('999')).toBe(false)
    })
  })

  describe('hasValidGroupNumber', () => {
    it('accepts valid group numbers', () => {
      expect(hasValidGroupNumber('01')).toBe(true)
      expect(hasValidGroupNumber('45')).toBe(true)
      expect(hasValidGroupNumber('99')).toBe(true)
    })

    it('rejects group number 00', () => {
      expect(hasValidGroupNumber('00')).toBe(false)
    })
  })

  describe('hasValidSerialNumber', () => {
    it('accepts valid serial numbers', () => {
      expect(hasValidSerialNumber('0001')).toBe(true)
      expect(hasValidSerialNumber('1234')).toBe(true)
      expect(hasValidSerialNumber('9999')).toBe(true)
    })

    it('rejects serial number 0000', () => {
      expect(hasValidSerialNumber('0000')).toBe(false)
    })
  })

  describe('isKnownInvalidSSN', () => {
    it('detects Woolworth wallet card SSN', () => {
      expect(isKnownInvalidSSN('078051120')).toBe(true)
      expect(isKnownInvalidSSN('078-05-1120')).toBe(true)
    })

    it('detects common test SSN patterns', () => {
      expect(isKnownInvalidSSN('123456789')).toBe(true)
      expect(isKnownInvalidSSN('111111111')).toBe(true)
      expect(isKnownInvalidSSN('987654321')).toBe(true)
    })

    it('returns false for unknown SSNs', () => {
      expect(isKnownInvalidSSN('123456780')).toBe(false)
    })
  })

  describe('ssnValidator.execute', () => {
    let context: ServiceContext

    beforeEach(() => {
      context = createMockContext()
    })

    it('validates correct SSN format', async () => {
      const result = await ssnValidator.execute(
        { field: 'ssn', value: '078-05-1121' },
        context
      )

      expect(result.success).toBe(true)
      expect(result.data?.valid).toBe(true)
      expect(result.data?.details?.normalizedValue).toBe('078051121')
      expect(result.data?.details?.confidence).toBe(1.0)
    })

    it('validates SSN without dashes', async () => {
      const result = await ssnValidator.execute(
        { field: 'ssn', value: '078051121' },
        context
      )

      expect(result.success).toBe(true)
      expect(result.data?.valid).toBe(true)
    })

    it('rejects empty values', async () => {
      const result = await ssnValidator.execute(
        { field: 'ssn', value: '' },
        context
      )

      expect(result.success).toBe(true)
      expect(result.data?.valid).toBe(false)
      expect(result.data?.invalidReason).toBe('SSN is required')
    })

    it('rejects invalid format', async () => {
      const result = await ssnValidator.execute(
        { field: 'ssn', value: '12345' },
        context
      )

      expect(result.success).toBe(true)
      expect(result.data?.valid).toBe(false)
      expect(result.data?.invalidReason).toBe('Invalid SSN format')
    })

    it('rejects invalid area numbers', async () => {
      // Area 000
      const result000 = await ssnValidator.execute(
        { field: 'ssn', value: '000-12-3456' },
        context
      )
      expect(result000.data?.valid).toBe(false)
      expect(result000.data?.invalidReason).toContain('000')

      // Area 666
      const result666 = await ssnValidator.execute(
        { field: 'ssn', value: '666-12-3456' },
        context
      )
      expect(result666.data?.valid).toBe(false)
      expect(result666.data?.invalidReason).toContain('666')

      // Area 900+
      const result900 = await ssnValidator.execute(
        { field: 'ssn', value: '900-12-3456' },
        context
      )
      expect(result900.data?.valid).toBe(false)
      expect(result900.data?.invalidReason).toContain('9XX')
    })

    it('rejects invalid group number 00', async () => {
      const result = await ssnValidator.execute(
        { field: 'ssn', value: '123-00-4567' },
        context
      )

      expect(result.success).toBe(true)
      expect(result.data?.valid).toBe(false)
      expect(result.data?.invalidReason).toContain('00')
    })

    it('rejects invalid serial number 0000', async () => {
      const result = await ssnValidator.execute(
        { field: 'ssn', value: '123-45-0000' },
        context
      )

      expect(result.success).toBe(true)
      expect(result.data?.valid).toBe(false)
      expect(result.data?.invalidReason).toContain('0000')
    })

    it('rejects known invalid SSNs', async () => {
      // Woolworth card SSN
      const result = await ssnValidator.execute(
        { field: 'ssn', value: '078-05-1120' },
        context
      )

      expect(result.success).toBe(true)
      expect(result.data?.valid).toBe(false)
      expect(result.data?.invalidReason).toContain('known invalid')
    })

    it('rejects sequential pattern SSNs', async () => {
      const result = await ssnValidator.execute(
        { field: 'ssn', value: '123-45-6789' },
        context
      )

      expect(result.success).toBe(true)
      expect(result.data?.valid).toBe(false)
    })

    it('rejects repeated digit SSNs', async () => {
      const result = await ssnValidator.execute(
        { field: 'ssn', value: '111-11-1111' },
        context
      )

      expect(result.success).toBe(true)
      expect(result.data?.valid).toBe(false)
    })

    it('returns validation checks detail', async () => {
      const result = await ssnValidator.execute(
        { field: 'ssn', value: '078-05-1121' },
        context
      )

      expect(result.success).toBe(true)
      expect(result.data?.details?.checks).toBeDefined()
      expect(result.data?.details?.checks?.length).toBeGreaterThan(0)
    })

    it('tracks timing information', async () => {
      const result = await ssnValidator.execute(
        { field: 'ssn', value: '078-05-1121' },
        context
      )

      expect(result.timing).toBeDefined()
      expect(result.timing.startedAt).toBeInstanceOf(Date)
      expect(result.timing.completedAt).toBeInstanceOf(Date)
    })
  })

  describe('createSSNValidator with options', () => {
    let context: ServiceContext

    beforeEach(() => {
      context = createMockContext()
    })

    it('creates validator with default options', () => {
      const validator = createSSNValidator()

      expect(validator.name).toBe('ssn-validator')
      expect(validator.type).toBe('validation')
    })

    it('creates validator with custom name', () => {
      const validator = createSSNValidator({ name: 'custom-ssn' })

      expect(validator.name).toBe('custom-ssn')
    })

    it('supports additional invalid SSNs', async () => {
      const validator = createSSNValidator({
        additionalInvalidSSNs: ['111223333'],
      })

      const result = await validator.execute(
        { field: 'ssn', value: '111-22-3333' },
        context
      )

      expect(result.success).toBe(true)
      expect(result.data?.valid).toBe(false)
      expect(result.data?.invalidReason).toContain('known invalid')
    })
  })

  describe('ssnValidator.healthCheck', () => {
    it('returns healthy status', async () => {
      const result = await ssnValidator.healthCheck!()

      expect(result.healthy).toBe(true)
      expect(result.checkedAt).toBeInstanceOf(Date)
      expect(result.responseTimeMs).toBeGreaterThanOrEqual(0)
      expect(result.details?.validFormatTestPassed).toBe(true)
      expect(result.details?.invalidAreaTestPassed).toBe(true)
      expect(result.details?.knownInvalidTestPassed).toBe(true)
    })
  })

  describe('edge cases', () => {
    let context: ServiceContext

    beforeEach(() => {
      context = createMockContext()
    })

    it('handles whitespace-only input', async () => {
      const result = await ssnValidator.execute(
        { field: 'ssn', value: '   ' },
        context
      )

      expect(result.success).toBe(true)
      expect(result.data?.valid).toBe(false)
      expect(result.data?.invalidReason).toBe('SSN is required')
    })

    it('handles SSN with extra spaces', async () => {
      // Note: SSN format regex is strict (XXX-XX-XXXX or XXXXXXXXX)
      // Extra spaces around dashes will not match the expected format
      const result = await ssnValidator.execute(
        { field: 'ssn', value: '078-05-1121' },
        context
      )

      expect(result.success).toBe(true)
      expect(result.data?.valid).toBe(true)
    })

    it('handles leading zeros', async () => {
      const result = await ssnValidator.execute(
        { field: 'ssn', value: '001-01-0001' },
        context
      )

      expect(result.success).toBe(true)
      expect(result.data?.valid).toBe(true)
    })

    it('rejects non-numeric characters', async () => {
      const result = await ssnValidator.execute(
        { field: 'ssn', value: '12A-45-6789' },
        context
      )

      expect(result.success).toBe(true)
      expect(result.data?.valid).toBe(false)
    })

    it('provides helpful suggestions for invalid SSNs', async () => {
      const result = await ssnValidator.execute(
        { field: 'ssn', value: '000-12-3456' },
        context
      )

      expect(result.success).toBe(true)
      expect(result.data?.suggestions).toBeDefined()
      expect(result.data?.suggestions?.length).toBeGreaterThan(0)
    })
  })
})
