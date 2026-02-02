/**
 * Phone Number Validator
 * Validates phone numbers using libphonenumber-js for format validation,
 * country code validation, and number type detection
 * @module services/plugins/validators/phone-validator
 */

import {
  parsePhoneNumberFromString,
  isValidPhoneNumber,
  CountryCode,
  getCountries,
  PhoneNumber,
} from 'libphonenumber-js'
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
 * Phone number type as detected by libphonenumber-js
 */
export type PhoneNumberType =
  | 'MOBILE'
  | 'FIXED_LINE'
  | 'FIXED_LINE_OR_MOBILE'
  | 'PREMIUM_RATE'
  | 'TOLL_FREE'
  | 'SHARED_COST'
  | 'VOIP'
  | 'PERSONAL_NUMBER'
  | 'PAGER'
  | 'UAN'
  | 'VOICEMAIL'
  | 'UNKNOWN'

/**
 * Additional metadata returned by phone validation
 */
export interface PhoneValidationMetadata {
  /** Country code (e.g., 'US', 'GB') */
  countryCode?: string

  /** International calling code (e.g., '1', '44') */
  callingCode?: string

  /** Detected number type (mobile, landline, etc.) */
  numberType?: PhoneNumberType

  /** Whether the number could be a mobile number */
  isPossibleMobile?: boolean

  /** Whether the number could be a landline */
  isPossibleLandline?: boolean

  /** National format (e.g., '(555) 123-4567') */
  nationalFormat?: string

  /** International format (e.g., '+1 555 123 4567') */
  internationalFormat?: string

  /** E.164 format (e.g., '+15551234567') */
  e164Format?: string
}

/**
 * Gets all valid country codes from libphonenumber-js
 */
export function getValidCountryCodes(): CountryCode[] {
  return getCountries()
}

/**
 * Checks if a country code is valid
 */
export function isValidCountryCode(code: string): code is CountryCode {
  return getValidCountryCodes().includes(code as CountryCode)
}

/**
 * Normalizes a phone number value to a string
 */
export function normalizePhoneInput(value: unknown): string {
  if (value === null || value === undefined) {
    return ''
  }
  return String(value).trim()
}

/**
 * Extracts phone number metadata from a parsed phone number
 */
function extractMetadata(phoneNumber: PhoneNumber): PhoneValidationMetadata {
  const numberType = phoneNumber.getType() as PhoneNumberType | undefined

  return {
    countryCode: phoneNumber.country,
    callingCode: phoneNumber.countryCallingCode,
    numberType: numberType ?? 'UNKNOWN',
    isPossibleMobile:
      numberType === 'MOBILE' ||
      numberType === 'FIXED_LINE_OR_MOBILE' ||
      numberType === undefined,
    isPossibleLandline:
      numberType === 'FIXED_LINE' ||
      numberType === 'FIXED_LINE_OR_MOBILE' ||
      numberType === undefined,
    nationalFormat: phoneNumber.formatNational(),
    internationalFormat: phoneNumber.formatInternational(),
    e164Format: phoneNumber.format('E.164'),
  }
}

/**
 * Creates a successful service result
 */
function createSuccessResult(
  data: ValidationOutput,
  startedAt: Date,
  cached: boolean = false,
  metadata?: PhoneValidationMetadata
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
    metadata: metadata as Record<string, unknown>,
  }
}

/**
 * Phone validator configuration options
 */
export interface PhoneValidatorOptions {
  /** Custom name for the validator instance */
  name?: string

  /** Custom description */
  description?: string

  /** Default country code if none is provided in the number (e.g., 'US', 'GB') */
  defaultCountry?: CountryCode

  /** Restrict validation to specific countries (empty = all countries) */
  allowedCountries?: CountryCode[]

  /** Only accept mobile numbers */
  mobileOnly?: boolean

  /** Only accept landline numbers */
  landlineOnly?: boolean
}

/**
 * Default phone validator options
 */
const DEFAULT_OPTIONS: Required<
  Omit<
    PhoneValidatorOptions,
    'name' | 'description' | 'allowedCountries' | 'defaultCountry'
  >
> = {
  mobileOnly: false,
  landlineOnly: false,
}

/**
 * Creates a phone validator with the given options.
 *
 * @example
 * ```typescript
 * // Basic phone validation
 * const basicValidator = createPhoneValidator()
 *
 * // US-only phone validation
 * const usValidator = createPhoneValidator({
 *   defaultCountry: 'US',
 *   allowedCountries: ['US']
 * })
 *
 * // Mobile-only validation
 * const mobileValidator = createPhoneValidator({
 *   mobileOnly: true
 * })
 *
 * const result = await mobileValidator.execute({
 *   field: 'phone',
 *   value: '+1 555 123 4567'
 * }, context)
 * ```
 */
export function createPhoneValidator(
  options: PhoneValidatorOptions = {}
): ValidationService {
  const {
    name = 'phone-validator',
    description = 'Validates phone numbers using libphonenumber-js',
    defaultCountry,
    allowedCountries,
    mobileOnly = DEFAULT_OPTIONS.mobileOnly,
    landlineOnly = DEFAULT_OPTIONS.landlineOnly,
  } = options

  // Validate that mobileOnly and landlineOnly aren't both set
  if (mobileOnly && landlineOnly) {
    throw new Error('Cannot set both mobileOnly and landlineOnly to true')
  }

  // Convert allowed countries to a Set for faster lookup
  const allowedCountrySet = allowedCountries ? new Set(allowedCountries) : null

  return {
    name,
    type: 'validation',
    description,

    async execute(
      input: ValidationInput,
      _context: ServiceContext
    ): Promise<ServiceResult<ValidationOutput>> {
      const startedAt = new Date()
      const { value, context: inputContext } = input
      const rawValue = normalizePhoneInput(value)
      const checks: ValidationCheck[] = []

      // Check for empty value
      if (!rawValue) {
        checks.push({
          name: 'presence',
          passed: false,
          message: 'Phone number is required',
        })

        return createSuccessResult(
          {
            valid: false,
            details: { checks },
            invalidReason: 'Phone number is required',
          },
          startedAt
        )
      }

      // Determine country code from context or default
      const countryFromContext = inputContext?.country as
        | CountryCode
        | undefined
      const effectiveDefaultCountry = countryFromContext ?? defaultCountry

      // Try to parse the phone number
      let phoneNumber: PhoneNumber | undefined
      try {
        phoneNumber = parsePhoneNumberFromString(
          rawValue,
          effectiveDefaultCountry
        )
      } catch {
        // Parsing failed, will be handled below
      }

      // Format check - can we parse this as a phone number?
      const canParse = phoneNumber !== undefined
      checks.push({
        name: 'format',
        passed: canParse,
        message: canParse
          ? 'Valid phone number format'
          : 'Cannot parse as a phone number',
      })

      if (!canParse || !phoneNumber) {
        return createSuccessResult(
          {
            valid: false,
            details: { checks },
            invalidReason: 'Invalid phone number format',
            suggestions: [
              'Include the country code (e.g., +1 for US)',
              'Remove any letters or invalid characters',
              'Check that the number has the correct number of digits',
            ],
          },
          startedAt
        )
      }

      // Validity check - is this a valid phone number?
      const isValid = phoneNumber.isValid()
      checks.push({
        name: 'validity',
        passed: isValid,
        message: isValid
          ? 'Phone number is valid for the detected country'
          : 'Phone number is not valid for the detected country',
      })

      if (!isValid) {
        const metadata = extractMetadata(phoneNumber)
        return createSuccessResult(
          {
            valid: false,
            details: {
              checks,
              normalizedValue: rawValue,
            },
            invalidReason: `Phone number is not valid${metadata.countryCode ? ` for ${metadata.countryCode}` : ''}`,
            suggestions: [
              'Check that all digits are correct',
              'Verify the country code is correct',
            ],
          },
          startedAt,
          false,
          metadata
        )
      }

      const metadata = extractMetadata(phoneNumber)

      // Country restriction check
      if (allowedCountrySet && metadata.countryCode) {
        const countryAllowed = allowedCountrySet.has(
          metadata.countryCode as CountryCode
        )
        checks.push({
          name: 'country',
          passed: countryAllowed,
          message: countryAllowed
            ? `Country ${metadata.countryCode} is allowed`
            : `Country ${metadata.countryCode} is not in the allowed list`,
        })

        if (!countryAllowed) {
          return createSuccessResult(
            {
              valid: false,
              details: {
                checks,
                normalizedValue: metadata.e164Format ?? rawValue,
              },
              invalidReason: `Phone numbers from ${metadata.countryCode} are not accepted`,
              suggestions: [
                `Please provide a phone number from: ${Array.from(allowedCountrySet).join(', ')}`,
              ],
            },
            startedAt,
            false,
            metadata
          )
        }
      }

      // Number type check (mobile/landline)
      if (mobileOnly) {
        const isMobile =
          metadata.isPossibleMobile && metadata.numberType !== 'FIXED_LINE'
        checks.push({
          name: 'type',
          passed: !!isMobile,
          message: isMobile
            ? 'Phone number is a mobile number'
            : `Phone number type (${metadata.numberType}) is not mobile`,
        })

        if (!isMobile) {
          return createSuccessResult(
            {
              valid: false,
              details: {
                checks,
                normalizedValue: metadata.e164Format ?? rawValue,
              },
              invalidReason: 'Only mobile phone numbers are accepted',
              suggestions: ['Please provide a mobile phone number'],
            },
            startedAt,
            false,
            metadata
          )
        }
      }

      if (landlineOnly) {
        const isLandline =
          metadata.isPossibleLandline && metadata.numberType !== 'MOBILE'
        checks.push({
          name: 'type',
          passed: !!isLandline,
          message: isLandline
            ? 'Phone number is a landline number'
            : `Phone number type (${metadata.numberType}) is not a landline`,
        })

        if (!isLandline) {
          return createSuccessResult(
            {
              valid: false,
              details: {
                checks,
                normalizedValue: metadata.e164Format ?? rawValue,
              },
              invalidReason: 'Only landline phone numbers are accepted',
              suggestions: ['Please provide a landline phone number'],
            },
            startedAt,
            false,
            metadata
          )
        }
      }

      // All checks passed
      return createSuccessResult(
        {
          valid: true,
          details: {
            checks,
            normalizedValue: metadata.e164Format ?? rawValue,
            confidence: 1.0,
          },
        },
        startedAt,
        false,
        metadata
      )
    },

    async healthCheck(): Promise<HealthCheckResult> {
      const startedAt = new Date()

      try {
        // Test with known valid and invalid phone numbers
        const validUSNumber = isValidPhoneNumber('+12025551234', 'US')
        const validUKNumber = isValidPhoneNumber('+442071234567', 'GB')
        const invalidNumber = !isValidPhoneNumber('invalid', 'US')

        const testPassed = validUSNumber && validUKNumber && invalidNumber

        const completedAt = new Date()
        return {
          healthy: testPassed,
          responseTimeMs: completedAt.getTime() - startedAt.getTime(),
          checkedAt: completedAt,
          details: {
            validUSTestPassed: validUSNumber,
            validUKTestPassed: validUKNumber,
            invalidTestPassed: invalidNumber,
            defaultCountry,
            allowedCountries,
            mobileOnly,
            landlineOnly,
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
 * Default phone validator instance with standard settings.
 *
 * @example
 * ```typescript
 * const result = await phoneValidator.execute({
 *   field: 'phone',
 *   value: '+1 (555) 123-4567'
 * }, context)
 *
 * if (result.success && result.data?.valid) {
 *   console.log('E.164 format:', result.metadata?.e164Format) // '+15551234567'
 *   console.log('Number type:', result.metadata?.numberType) // 'FIXED_LINE_OR_MOBILE'
 * }
 * ```
 */
export const phoneValidator: ValidationService = createPhoneValidator()
