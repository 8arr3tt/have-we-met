/**
 * NHS Number Validator
 * Validates UK National Health Service numbers using format and modulus 11 checksum validation
 * @module services/plugins/validators/nhs-number-validator
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
 * Validates the modulus 11 checksum for an NHS number.
 *
 * The NHS number checksum algorithm:
 * 1. Multiply each of the first 9 digits by their weight (10, 9, 8, 7, 6, 5, 4, 3, 2)
 * 2. Sum the products
 * 3. Take modulo 11 of the sum
 * 4. Subtract from 11 to get the check digit
 * 5. If result is 11, check digit is 0
 * 6. If result is 10, the number is invalid
 * 7. The check digit should match the 10th digit
 */
export function validateNHSChecksum(digits: string): boolean {
  if (digits.length !== 10) {
    return false
  }

  const weights = [10, 9, 8, 7, 6, 5, 4, 3, 2]
  let sum = 0

  for (let i = 0; i < 9; i++) {
    const digit = parseInt(digits[i], 10)
    if (isNaN(digit)) {
      return false
    }
    sum += digit * weights[i]
  }

  const remainder = sum % 11
  let checkDigit = 11 - remainder

  if (checkDigit === 11) {
    checkDigit = 0
  }

  // If check digit would be 10, the number is invalid (no valid check digit)
  if (checkDigit === 10) {
    return false
  }

  const actualCheckDigit = parseInt(digits[9], 10)
  return checkDigit === actualCheckDigit
}

/**
 * Normalizes an NHS number by removing all whitespace and formatting characters
 */
export function normalizeNHSNumber(value: unknown): string {
  if (value === null || value === undefined) {
    return ''
  }
  return String(value).replace(/[\s\-]/g, '')
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
 * NHS Number Validator service plugin.
 *
 * Validates UK NHS numbers using:
 * - Format validation (must be exactly 10 digits)
 * - Modulus 11 checksum validation
 *
 * Returns a normalized value (spaces removed) on success.
 *
 * @example
 * ```typescript
 * const result = await nhsNumberValidator.execute({
 *   field: 'nhsNumber',
 *   value: '943 476 5919'
 * }, context)
 *
 * if (result.success && result.data?.valid) {
 *   console.log(result.data.details?.normalizedValue) // '9434765919'
 * }
 * ```
 */
export const nhsNumberValidator: ValidationService = {
  name: 'nhs-number-validator',
  type: 'validation',
  description: 'Validates UK NHS numbers using modulus 11 checksum',

  async execute(
    input: ValidationInput,
    _context: ServiceContext,
  ): Promise<ServiceResult<ValidationOutput>> {
    const startedAt = new Date()
    const { value } = input
    const normalized = normalizeNHSNumber(value)
    const checks: ValidationCheck[] = []

    // Check for empty value
    if (!normalized) {
      checks.push({
        name: 'presence',
        passed: false,
        message: 'NHS number is required',
      })

      return createSuccessResult({
        valid: false,
        details: { checks },
        invalidReason: 'NHS number is required',
      }, startedAt)
    }

    // Format check - must be exactly 10 digits
    const formatValid = /^\d{10}$/.test(normalized)
    checks.push({
      name: 'format',
      passed: formatValid,
      message: formatValid
        ? 'Valid 10-digit format'
        : `Must be exactly 10 digits (got ${normalized.length} character${normalized.length === 1 ? '' : 's'})`,
    })

    if (!formatValid) {
      // Check if it contains non-digit characters
      if (/\D/.test(normalized)) {
        return createSuccessResult({
          valid: false,
          details: { checks },
          invalidReason: 'NHS number must contain only digits',
          suggestions: ['Remove any letters or special characters'],
        }, startedAt)
      }

      return createSuccessResult({
        valid: false,
        details: { checks },
        invalidReason: 'NHS number must be exactly 10 digits',
        suggestions: normalized.length < 10
          ? ['Check if any digits are missing']
          : ['Check if there are extra digits'],
      }, startedAt)
    }

    // Checksum validation using modulus 11 algorithm
    const checksumValid = validateNHSChecksum(normalized)
    checks.push({
      name: 'checksum',
      passed: checksumValid,
      message: checksumValid
        ? 'Valid modulus 11 checksum'
        : 'Invalid checksum',
    })

    if (!checksumValid) {
      return createSuccessResult({
        valid: false,
        details: {
          checks,
          normalizedValue: normalized,
        },
        invalidReason: 'Invalid NHS number checksum',
        suggestions: ['Verify the number was entered correctly'],
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
      // Test with a known valid NHS number
      // Using 943 476 5919 which has a valid checksum
      const testResult = validateNHSChecksum('9434765919')

      const completedAt = new Date()
      return {
        healthy: testResult === true,
        responseTimeMs: completedAt.getTime() - startedAt.getTime(),
        checkedAt: completedAt,
        details: {
          algorithm: 'modulus-11',
          testPassed: testResult,
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

/**
 * Creates an NHS number validator with custom configuration
 */
export interface NHSNumberValidatorOptions {
  /** Custom name for the validator instance */
  name?: string

  /** Custom description */
  description?: string
}

/**
 * Factory function to create an NHS number validator with custom options
 */
export function createNHSNumberValidator(
  options: NHSNumberValidatorOptions = {},
): ValidationService {
  return {
    ...nhsNumberValidator,
    name: options.name ?? nhsNumberValidator.name,
    description: options.description ?? nhsNumberValidator.description,
  }
}
