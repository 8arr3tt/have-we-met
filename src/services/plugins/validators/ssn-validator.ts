/**
 * SSN Validator
 * Validates US Social Security Numbers using format and pattern validation
 * @module services/plugins/validators/ssn-validator
 */

import type {
  ValidationService,
  ValidationInput,
  ValidationOutput,
  ValidationCheck,
  ServiceResult,
  ServiceContext,
  HealthCheckResult,
} from '../../types.js'

/**
 * Known invalid SSN area numbers:
 * - 000: Never issued
 * - 666: Never issued (considered unlucky)
 * - 900-999: Reserved for future use (some were used for advertising, now invalid)
 */
const INVALID_AREA_NUMBERS = new Set([
  '000',
  '666',
  ...Array.from({ length: 100 }, (_, i) => String(900 + i).padStart(3, '0')),
])

/**
 * Known invalid group numbers (the middle two digits)
 * - 00: Never issued
 */
const INVALID_GROUP_NUMBERS = new Set(['00'])

/**
 * Known invalid serial numbers (the last four digits)
 * - 0000: Never issued
 */
const INVALID_SERIAL_NUMBERS = new Set(['0000'])

/**
 * Known invalid/test SSNs that have been publicly disclosed and should never be used
 * These include:
 * - SSNs used in advertisements
 * - SSNs shown on sample cards
 * - SSNs used in TV shows/movies that were actually issued
 */
const KNOWN_INVALID_SSNS = new Set([
  '078051120', // Woolworth wallet card SSN - used in advertisements
  '219099999', // Used in advertising
  '457555462', // Shown on Social Security promotional cards
  '987654320', // Common test SSN pattern
  '987654321', // Common test SSN pattern
  '123456789', // Sequential pattern - never issued
  '111111111', // Repeated digit pattern
  '222222222', // Repeated digit pattern
  '333333333', // Repeated digit pattern
  '444444444', // Repeated digit pattern
  '555555555', // Repeated digit pattern
  '666666666', // Repeated digit pattern (also invalid area)
  '777777777', // Repeated digit pattern
  '888888888', // Repeated digit pattern
  '999999999', // Repeated digit pattern
])

/**
 * SSN format regex: XXX-XX-XXXX or XXXXXXXXX
 */
const SSN_FORMAT_REGEX = /^(\d{3})-?(\d{2})-?(\d{4})$/

/**
 * Normalizes an SSN by removing dashes and spaces
 */
export function normalizeSSN(value: unknown): string {
  if (value === null || value === undefined) {
    return ''
  }
  return String(value).replace(/[\s\-]/g, '')
}

/**
 * Formats an SSN as XXX-XX-XXXX
 */
export function formatSSN(ssn: string): string {
  if (ssn.length !== 9) {
    return ssn
  }
  return `${ssn.slice(0, 3)}-${ssn.slice(3, 5)}-${ssn.slice(5, 9)}`
}

/**
 * Parses an SSN into its component parts
 */
export function parseSSN(ssn: string): {
  area: string
  group: string
  serial: string
} | null {
  const normalized = normalizeSSN(ssn)
  if (normalized.length !== 9 || !/^\d{9}$/.test(normalized)) {
    return null
  }
  return {
    area: normalized.slice(0, 3),
    group: normalized.slice(3, 5),
    serial: normalized.slice(5, 9),
  }
}

/**
 * Checks if an SSN has a valid area number
 */
export function hasValidAreaNumber(area: string): boolean {
  return !INVALID_AREA_NUMBERS.has(area)
}

/**
 * Checks if an SSN has a valid group number
 */
export function hasValidGroupNumber(group: string): boolean {
  return !INVALID_GROUP_NUMBERS.has(group)
}

/**
 * Checks if an SSN has a valid serial number
 */
export function hasValidSerialNumber(serial: string): boolean {
  return !INVALID_SERIAL_NUMBERS.has(serial)
}

/**
 * Checks if an SSN is a known invalid/test number
 */
export function isKnownInvalidSSN(ssn: string): boolean {
  return KNOWN_INVALID_SSNS.has(normalizeSSN(ssn))
}

/**
 * Creates a successful service result
 */
function createSuccessResult(
  data: ValidationOutput,
  startedAt: Date,
  cached: boolean = false,
): ServiceResult<ValidationOutput> {
  const completedAt = new Date()
  return {
    success: true,
    data,
    timing: {
      startedAt,
      completedAt,
      durationMs: completedAt.getTime() - startedAt.getTime(),
    },
    cached,
  }
}

/**
 * SSN validator configuration options
 */
export interface SSNValidatorOptions {
  /** Custom name for the validator instance */
  name?: string

  /** Custom description */
  description?: string

  /** Additional known invalid SSNs to reject */
  additionalInvalidSSNs?: string[]

  /** Whether to reject SSNs with ITIN-like patterns (9XX area) */
  rejectITINPatterns?: boolean
}

/**
 * Default SSN validator options
 */
const DEFAULT_OPTIONS: Required<Omit<SSNValidatorOptions, 'name' | 'description' | 'additionalInvalidSSNs'>> = {
  rejectITINPatterns: true,
}

/**
 * Creates an SSN validator with the given options.
 *
 * @example
 * ```typescript
 * // Basic SSN validation
 * const basicValidator = createSSNValidator()
 *
 * // With additional invalid SSNs
 * const strictValidator = createSSNValidator({
 *   additionalInvalidSSNs: ['123456780']
 * })
 *
 * const result = await strictValidator.execute({
 *   field: 'ssn',
 *   value: '123-45-6789'
 * }, context)
 * ```
 */
export function createSSNValidator(
  options: SSNValidatorOptions = {},
): ValidationService {
  const {
    name = 'ssn-validator',
    description = 'Validates US Social Security Numbers',
    additionalInvalidSSNs = [],
    rejectITINPatterns = DEFAULT_OPTIONS.rejectITINPatterns,
  } = options

  // Create combined invalid SSNs set
  const invalidSSNs = new Set([
    ...KNOWN_INVALID_SSNS,
    ...additionalInvalidSSNs.map(ssn => normalizeSSN(ssn)),
  ])

  return {
    name,
    type: 'validation',
    description,

    async execute(
      input: ValidationInput,
      _context: ServiceContext,
    ): Promise<ServiceResult<ValidationOutput>> {
      const startedAt = new Date()
      const { value } = input
      const normalized = normalizeSSN(value)
      const checks: ValidationCheck[] = []

      // Check for empty value
      if (!normalized) {
        checks.push({
          name: 'presence',
          passed: false,
          message: 'SSN is required',
        })

        return createSuccessResult({
          valid: false,
          details: { checks },
          invalidReason: 'SSN is required',
        }, startedAt)
      }

      // Format check - must be exactly 9 digits
      const formatMatch = SSN_FORMAT_REGEX.test(String(value).trim())
      const isNineDigits = /^\d{9}$/.test(normalized)

      checks.push({
        name: 'format',
        passed: formatMatch && isNineDigits,
        message: formatMatch && isNineDigits
          ? 'Valid SSN format (9 digits)'
          : 'SSN must be 9 digits in format XXX-XX-XXXX',
      })

      if (!formatMatch || !isNineDigits) {
        return createSuccessResult({
          valid: false,
          details: { checks },
          invalidReason: 'Invalid SSN format',
          suggestions: [
            'SSN must be exactly 9 digits',
            'Format should be XXX-XX-XXXX or XXXXXXXXX',
          ],
        }, startedAt)
      }

      // Parse the SSN
      const parsed = parseSSN(normalized)
      if (!parsed) {
        return createSuccessResult({
          valid: false,
          details: { checks },
          invalidReason: 'Unable to parse SSN',
        }, startedAt)
      }

      // Area number validation
      const areaValid = hasValidAreaNumber(parsed.area)
      checks.push({
        name: 'area',
        passed: areaValid,
        message: areaValid
          ? 'Valid area number'
          : `Invalid area number: ${parsed.area}`,
      })

      if (!areaValid) {
        const isITINPattern = parseInt(parsed.area, 10) >= 900

        return createSuccessResult({
          valid: false,
          details: {
            checks,
            normalizedValue: normalized,
          },
          invalidReason: isITINPattern
            ? 'Area number 9XX is reserved and not valid for SSNs'
            : 'Invalid area number (000 or 666 are not valid)',
          suggestions: isITINPattern
            ? ['This appears to be an ITIN pattern, not an SSN']
            : ['Verify the first three digits are correct'],
        }, startedAt)
      }

      // Group number validation
      const groupValid = hasValidGroupNumber(parsed.group)
      checks.push({
        name: 'group',
        passed: groupValid,
        message: groupValid
          ? 'Valid group number'
          : 'Invalid group number: 00',
      })

      if (!groupValid) {
        return createSuccessResult({
          valid: false,
          details: {
            checks,
            normalizedValue: normalized,
          },
          invalidReason: 'Group number 00 is not valid',
          suggestions: ['Verify the middle two digits are correct'],
        }, startedAt)
      }

      // Serial number validation
      const serialValid = hasValidSerialNumber(parsed.serial)
      checks.push({
        name: 'serial',
        passed: serialValid,
        message: serialValid
          ? 'Valid serial number'
          : 'Invalid serial number: 0000',
      })

      if (!serialValid) {
        return createSuccessResult({
          valid: false,
          details: {
            checks,
            normalizedValue: normalized,
          },
          invalidReason: 'Serial number 0000 is not valid',
          suggestions: ['Verify the last four digits are correct'],
        }, startedAt)
      }

      // Known invalid SSN check
      const isKnownInvalid = invalidSSNs.has(normalized)
      checks.push({
        name: 'known-invalid',
        passed: !isKnownInvalid,
        message: isKnownInvalid
          ? 'This is a known invalid/test SSN'
          : 'Not a known invalid SSN',
      })

      if (isKnownInvalid) {
        return createSuccessResult({
          valid: false,
          details: {
            checks,
            normalizedValue: normalized,
          },
          invalidReason: 'This SSN is a known invalid or test number',
          suggestions: ['This number has been publicly disclosed and cannot be used'],
        }, startedAt)
      }

      // All checks passed
      return createSuccessResult({
        valid: true,
        details: {
          checks,
          normalizedValue: normalized,
          confidence: 1.0,
        },
      }, startedAt)
    },

    async healthCheck(): Promise<HealthCheckResult> {
      const startedAt = new Date()

      try {
        // Test with known valid and invalid SSNs
        const validSSN = parseSSN('078051121') // Valid format (not the known invalid one)
        const invalidAreaParsed = parseSSN('000121234')
        const knownInvalid = isKnownInvalidSSN('078051120')

        const testPassed =
          validSSN !== null &&
          hasValidAreaNumber(validSSN.area) &&
          invalidAreaParsed !== null &&
          !hasValidAreaNumber(invalidAreaParsed.area) &&
          knownInvalid === true

        const completedAt = new Date()
        return {
          healthy: testPassed,
          responseTimeMs: completedAt.getTime() - startedAt.getTime(),
          checkedAt: completedAt,
          details: {
            validFormatTestPassed: validSSN !== null,
            invalidAreaTestPassed: invalidAreaParsed !== null && !hasValidAreaNumber(invalidAreaParsed.area),
            knownInvalidTestPassed: knownInvalid,
            rejectITINPatterns,
          },
        }
      } catch (error) {
        return {
          healthy: false,
          reason: error instanceof Error ? error.message : 'Unknown error',
          checkedAt: new Date(),
        }
      }
    },
  }
}

/**
 * Default SSN validator instance with standard settings.
 *
 * @example
 * ```typescript
 * const result = await ssnValidator.execute({
 *   field: 'ssn',
 *   value: '123-45-6789'
 * }, context)
 *
 * if (result.success && result.data?.valid) {
 *   console.log('SSN is valid')
 * } else {
 *   console.log('Invalid:', result.data?.invalidReason)
 * }
 * ```
 */
export const ssnValidator: ValidationService = createSSNValidator()
