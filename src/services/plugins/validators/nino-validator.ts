/**
 * NINO Validator
 * Validates UK National Insurance Numbers using HMRC rules
 * @module services/plugins/validators/nino-validator
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
 * Invalid prefix letters for the first character.
 * D, F, I, Q, U, V are never used as the first letter.
 */
const INVALID_FIRST_LETTERS = new Set(['D', 'F', 'I', 'Q', 'U', 'V'])

/**
 * Invalid prefix letters for the second character.
 * D, F, I, O, Q, U, V are never used as the second letter.
 */
const INVALID_SECOND_LETTERS = new Set(['D', 'F', 'I', 'O', 'Q', 'U', 'V'])

/**
 * Invalid prefix combinations.
 * These two-letter prefixes are never used:
 * - BG, GB, KN, NK, NT, TN, ZZ (reserved/administrative)
 */
const INVALID_PREFIXES = new Set(['BG', 'GB', 'KN', 'NK', 'NT', 'TN', 'ZZ'])

/**
 * Temporary NINOs start with 'TN' - these are invalid for permanent records.
 * Some NINOs starting with certain prefixes are administrative:
 * - Prefixes starting with 'OO' are used for administrative purposes
 */
const ADMINISTRATIVE_PREFIXES = new Set(['OO'])

/**
 * Valid suffix letters (A, B, C, or D).
 */
const VALID_SUFFIX_LETTERS = new Set(['A', 'B', 'C', 'D'])

/**
 * NINO format regex: Two letters, six digits, one letter (optional spaces)
 * Format: AB 12 34 56 C or AB123456C
 */
const NINO_FORMAT_REGEX =
  /^([A-Za-z]{2})\s*(\d{2})\s*(\d{2})\s*(\d{2})\s*([A-Za-z])$/

/**
 * Normalizes a NINO by removing spaces and converting to uppercase
 */
export function normalizeNINO(value: unknown): string {
  if (value === null || value === undefined) {
    return ''
  }
  return String(value).replace(/\s/g, '').toUpperCase()
}

/**
 * Formats a NINO as AA 11 22 33 B (with spaces)
 */
export function formatNINO(nino: string): string {
  const normalized = normalizeNINO(nino)
  if (normalized.length !== 9) {
    return normalized
  }
  return `${normalized.slice(0, 2)} ${normalized.slice(2, 4)} ${normalized.slice(4, 6)} ${normalized.slice(6, 8)} ${normalized.slice(8, 9)}`
}

/**
 * Parses a NINO into its component parts
 */
export function parseNINO(nino: string): {
  prefix: string
  numbers: string
  suffix: string
  firstLetter: string
  secondLetter: string
} | null {
  const match = String(nino).match(NINO_FORMAT_REGEX)
  if (!match) {
    return null
  }

  const prefix = match[1].toUpperCase()
  const numbers = match[2] + match[3] + match[4]
  const suffix = match[5].toUpperCase()

  return {
    prefix,
    numbers,
    suffix,
    firstLetter: prefix[0],
    secondLetter: prefix[1],
  }
}

/**
 * Checks if the first letter is valid
 */
export function hasValidFirstLetter(letter: string): boolean {
  const upper = letter.toUpperCase()
  return /^[A-Z]$/.test(upper) && !INVALID_FIRST_LETTERS.has(upper)
}

/**
 * Checks if the second letter is valid
 */
export function hasValidSecondLetter(letter: string): boolean {
  const upper = letter.toUpperCase()
  return /^[A-Z]$/.test(upper) && !INVALID_SECOND_LETTERS.has(upper)
}

/**
 * Checks if the prefix combination is valid
 */
export function hasValidPrefix(prefix: string): boolean {
  const upper = prefix.toUpperCase()
  return !INVALID_PREFIXES.has(upper) && !ADMINISTRATIVE_PREFIXES.has(upper)
}

/**
 * Checks if the suffix is valid (A, B, C, or D)
 */
export function hasValidSuffix(suffix: string): boolean {
  return VALID_SUFFIX_LETTERS.has(suffix.toUpperCase())
}

/**
 * Checks if a NINO is an administrative number (not assigned to individuals)
 */
export function isAdministrativeNINO(prefix: string): boolean {
  return ADMINISTRATIVE_PREFIXES.has(prefix.toUpperCase())
}

/**
 * Creates a successful service result
 */
function createSuccessResult(
  data: ValidationOutput,
  startedAt: Date,
  cached: boolean = false
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
 * NINO validator configuration options
 */
export interface NINOValidatorOptions {
  /** Custom name for the validator instance */
  name?: string

  /** Custom description */
  description?: string

  /** Allow temporary NINOs (prefixes like TN) - default: false */
  allowTemporary?: boolean

  /** Allow administrative NINOs (prefixes like OO) - default: false */
  allowAdministrative?: boolean
}

/**
 * Default NINO validator options
 */
const DEFAULT_OPTIONS: Required<
  Omit<NINOValidatorOptions, 'name' | 'description'>
> = {
  allowTemporary: false,
  allowAdministrative: false,
}

/**
 * Creates a NINO validator with the given options.
 *
 * @example
 * ```typescript
 * // Basic NINO validation
 * const basicValidator = createNINOValidator()
 *
 * // Allow temporary NINOs
 * const tempValidator = createNINOValidator({
 *   allowTemporary: true
 * })
 *
 * const result = await basicValidator.execute({
 *   field: 'nino',
 *   value: 'AB 12 34 56 C'
 * }, context)
 * ```
 */
export function createNINOValidator(
  options: NINOValidatorOptions = {}
): ValidationService {
  const {
    name = 'nino-validator',
    description = 'Validates UK National Insurance Numbers using HMRC rules',
    allowTemporary = DEFAULT_OPTIONS.allowTemporary,
    allowAdministrative = DEFAULT_OPTIONS.allowAdministrative,
  } = options

  return {
    name,
    type: 'validation',
    description,

    async execute(
      input: ValidationInput,
      _context: ServiceContext
    ): Promise<ServiceResult<ValidationOutput>> {
      const startedAt = new Date()
      const { value } = input
      const normalized = normalizeNINO(value)
      const checks: ValidationCheck[] = []

      // Check for empty value
      if (!normalized) {
        checks.push({
          name: 'presence',
          passed: false,
          message: 'National Insurance Number is required',
        })

        return createSuccessResult(
          {
            valid: false,
            details: { checks },
            invalidReason: 'National Insurance Number is required',
          },
          startedAt
        )
      }

      // Parse the NINO
      const parsed = parseNINO(normalized)
      if (!parsed) {
        checks.push({
          name: 'format',
          passed: false,
          message: 'Invalid NINO format (expected: AA 11 22 33 B)',
        })

        return createSuccessResult(
          {
            valid: false,
            details: { checks },
            invalidReason: 'Invalid NINO format',
            suggestions: [
              'Format should be two letters, six digits, one letter',
              'Example: AB 12 34 56 C or AB123456C',
            ],
          },
          startedAt
        )
      }

      checks.push({
        name: 'format',
        passed: true,
        message: 'Valid NINO format',
      })

      // Check for special prefixes first (administrative/temporary)
      // These need to be checked before individual letter validation
      // because administrative prefixes like 'OO' would fail the second letter check
      const isAdminPrefix = ADMINISTRATIVE_PREFIXES.has(parsed.prefix)
      const isTempPrefix = INVALID_PREFIXES.has(parsed.prefix)

      if (isAdminPrefix) {
        const allowed = allowAdministrative
        checks.push({
          name: 'prefix',
          passed: allowed,
          message: allowed
            ? `Administrative prefix ${parsed.prefix} allowed`
            : `Invalid prefix: ${parsed.prefix} (administrative use only)`,
        })

        if (!allowed) {
          return createSuccessResult(
            {
              valid: false,
              details: {
                checks,
                normalizedValue: normalized,
              },
              invalidReason: `Prefix '${parsed.prefix}' is for administrative use only`,
              suggestions: ['This prefix is not assigned to individuals'],
            },
            startedAt
          )
        }
      } else if (isTempPrefix) {
        const allowed = allowTemporary
        checks.push({
          name: 'prefix',
          passed: allowed,
          message: allowed
            ? `Temporary/reserved prefix ${parsed.prefix} allowed`
            : `Invalid prefix: ${parsed.prefix} (reserved/not used)`,
        })

        if (!allowed) {
          return createSuccessResult(
            {
              valid: false,
              details: {
                checks,
                normalizedValue: normalized,
              },
              invalidReason: `Prefix '${parsed.prefix}' is reserved and not valid for personal NINOs`,
              suggestions: [
                `Prefixes BG, GB, KN, NK, NT, TN, ZZ are not valid`,
              ],
            },
            startedAt
          )
        }
      } else {
        // Standard prefix - validate individual letters
        // First letter validation
        const firstLetterValid = hasValidFirstLetter(parsed.firstLetter)
        checks.push({
          name: 'first-letter',
          passed: firstLetterValid,
          message: firstLetterValid
            ? `Valid first letter: ${parsed.firstLetter}`
            : `Invalid first letter: ${parsed.firstLetter} (D, F, I, Q, U, V not allowed)`,
        })

        if (!firstLetterValid) {
          return createSuccessResult(
            {
              valid: false,
              details: {
                checks,
                normalizedValue: normalized,
              },
              invalidReason: `First letter '${parsed.firstLetter}' is not valid`,
              suggestions: ['The first letter cannot be D, F, I, Q, U, or V'],
            },
            startedAt
          )
        }

        // Second letter validation
        const secondLetterValid = hasValidSecondLetter(parsed.secondLetter)
        checks.push({
          name: 'second-letter',
          passed: secondLetterValid,
          message: secondLetterValid
            ? `Valid second letter: ${parsed.secondLetter}`
            : `Invalid second letter: ${parsed.secondLetter} (D, F, I, O, Q, U, V not allowed)`,
        })

        if (!secondLetterValid) {
          return createSuccessResult(
            {
              valid: false,
              details: {
                checks,
                normalizedValue: normalized,
              },
              invalidReason: `Second letter '${parsed.secondLetter}' is not valid`,
              suggestions: [
                'The second letter cannot be D, F, I, O, Q, U, or V',
              ],
            },
            startedAt
          )
        }

        // Prefix combination is valid
        checks.push({
          name: 'prefix',
          passed: true,
          message: `Valid prefix: ${parsed.prefix}`,
        })
      }

      // Suffix validation (must be A, B, C, or D)
      const suffixValid = hasValidSuffix(parsed.suffix)
      checks.push({
        name: 'suffix',
        passed: suffixValid,
        message: suffixValid
          ? `Valid suffix: ${parsed.suffix}`
          : `Invalid suffix: ${parsed.suffix} (must be A, B, C, or D)`,
      })

      if (!suffixValid) {
        return createSuccessResult(
          {
            valid: false,
            details: {
              checks,
              normalizedValue: normalized,
            },
            invalidReason: `Suffix '${parsed.suffix}' is not valid`,
            suggestions: ['The suffix must be A, B, C, or D'],
          },
          startedAt
        )
      }

      // All checks passed
      return createSuccessResult(
        {
          valid: true,
          details: {
            checks,
            normalizedValue: normalized,
            confidence: 1.0,
          },
        },
        startedAt
      )
    },

    async healthCheck(): Promise<HealthCheckResult> {
      const startedAt = new Date()

      try {
        // Test with known valid and invalid NINOs
        const validParsed = parseNINO('AB123456C')
        const invalidPrefixParsed = parseNINO('ZZ123456A')
        const invalidSuffixParsed = parseNINO('AB123456X')

        const testPassed =
          validParsed !== null &&
          hasValidPrefix(validParsed.prefix) &&
          hasValidSuffix(validParsed.suffix) &&
          invalidPrefixParsed !== null &&
          !hasValidPrefix(invalidPrefixParsed.prefix) &&
          invalidSuffixParsed !== null &&
          !hasValidSuffix(invalidSuffixParsed.suffix)

        const completedAt = new Date()
        return {
          healthy: testPassed,
          responseTimeMs: completedAt.getTime() - startedAt.getTime(),
          checkedAt: completedAt,
          details: {
            validNINOTestPassed: validParsed !== null,
            invalidPrefixTestPassed:
              invalidPrefixParsed !== null &&
              !hasValidPrefix(invalidPrefixParsed.prefix),
            invalidSuffixTestPassed:
              invalidSuffixParsed !== null &&
              !hasValidSuffix(invalidSuffixParsed.suffix),
            allowTemporary,
            allowAdministrative,
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
 * Default NINO validator instance with standard settings.
 *
 * @example
 * ```typescript
 * const result = await ninoValidator.execute({
 *   field: 'nino',
 *   value: 'AB 12 34 56 C'
 * }, context)
 *
 * if (result.success && result.data?.valid) {
 *   console.log('NINO is valid:', result.data.details?.normalizedValue) // 'AB123456C'
 * }
 * ```
 */
export const ninoValidator: ValidationService = createNINOValidator()
