import { parsePhoneNumber, isValidPhoneNumber, type CountryCode } from 'libphonenumber-js'
import { registerNormalizer } from './registry'
import type { NormalizerFunction } from './types'

/**
 * Components of a parsed phone number.
 */
export interface PhoneComponents {
  /** E.164 country code (e.g., "1" for US) */
  countryCode?: string
  /** National number without country code */
  nationalNumber: string
  /** Extension number if present */
  extension?: string
  /** Full E.164 format: +15551234567 */
  e164: string
  /** Country ISO code (e.g., "US") */
  country?: string
}

/**
 * Options for phone normalization.
 */
export interface PhoneNormalizerOptions {
  /** Default country code if not present in input (e.g., "US", "GB") */
  defaultCountry?: CountryCode
  /** Whether to extract extensions (default: true) */
  extractExtension?: boolean
  /** Format for output: 'e164' or 'components' (default: 'e164') */
  outputFormat?: 'e164' | 'components'
  /** Whether to validate phone number (default: true) */
  validate?: boolean
}

/**
 * Validates if a string looks like a phone number.
 *
 * @param phone - The phone string to validate
 * @param country - Optional country code for validation context
 * @returns True if the phone appears valid, false otherwise
 *
 * @example
 * ```typescript
 * isValidPhone('555-123-4567', 'US')  // true
 * isValidPhone('+44 20 7123 4567')    // true
 * isValidPhone('123')                  // false
 * ```
 */
export function isValidPhone(phone: string, country?: CountryCode): boolean {
  if (!phone || typeof phone !== 'string') {
    return false
  }

  try {
    return isValidPhoneNumber(phone, country)
  } catch {
    return false
  }
}

/**
 * Normalizes a phone number to E.164 format.
 *
 * @param value - The phone number value to normalize
 * @param options - Optional configuration for normalization
 * @returns Normalized phone (string or components), or null if input is invalid
 *
 * @example
 * ```typescript
 * normalizePhone('555-123-4567', { defaultCountry: 'US' })
 * // '+15551234567'
 *
 * normalizePhone('(555) 123-4567', { defaultCountry: 'US' })
 * // '+15551234567'
 *
 * normalizePhone('+44 20 7123 4567')
 * // '+442071234567'
 *
 * normalizePhone('555-1234 ext 567', {
 *   defaultCountry: 'US',
 *   outputFormat: 'components'
 * })
 * // {
 * //   countryCode: '1',
 * //   nationalNumber: '5551234',
 * //   extension: '567',
 * //   e164: '+15551234',
 * //   country: 'US'
 * // }
 * ```
 */
export const normalizePhone: NormalizerFunction<PhoneNormalizerOptions> = (
  value: unknown,
  options?: PhoneNormalizerOptions
): string | PhoneComponents | null => {
  if (value == null) return null

  // Convert to string and trim whitespace
  const phoneStr = String(value).trim()
  if (!phoneStr) return null

  // Set defaults
  const opts = {
    defaultCountry: options?.defaultCountry,
    extractExtension: options?.extractExtension ?? true,
    outputFormat: options?.outputFormat ?? 'e164' as const,
    validate: options?.validate ?? true,
  }

  try {
    // Parse the phone number
    const phoneNumber = parsePhoneNumber(phoneStr, opts.defaultCountry)

    // Validate if enabled
    if (opts.validate && !phoneNumber.isValid()) {
      return null
    }

    // Build components
    const components: PhoneComponents = {
      countryCode: phoneNumber.countryCallingCode,
      nationalNumber: phoneNumber.nationalNumber,
      e164: phoneNumber.format('E.164'),
      country: phoneNumber.country,
    }

    // Extract extension if enabled and present
    if (opts.extractExtension && phoneNumber.ext) {
      components.extension = phoneNumber.ext
    }

    // Return based on output format
    return opts.outputFormat === 'components' ? components : components.e164
  } catch {
    // If parsing fails, try fallback approach
    return fallbackNormalize(phoneStr, opts)
  }
}

/**
 * Fallback normalization when libphonenumber-js fails.
 * Provides basic parsing for simple cases.
 *
 * @param phoneStr - The phone string to normalize
 * @param options - Normalization options
 * @returns Normalized phone or null
 */
function fallbackNormalize(
  phoneStr: string,
  options: {
    defaultCountry?: CountryCode
    extractExtension: boolean
    outputFormat: 'e164' | 'components'
    validate: boolean
  }
): string | PhoneComponents | null {
  // Strip all non-numeric characters except +
  let cleaned = phoneStr.replace(/[^\d+]/g, '')

  // Must have some digits
  if (!cleaned || cleaned === '+') {
    return null
  }

  // Check if it starts with +
  const hasPlus = cleaned.startsWith('+')
  if (hasPlus) {
    cleaned = cleaned.substring(1)
  }

  // Must be numeric now
  if (!/^\d+$/.test(cleaned)) {
    return null
  }

  // Validate length (typical phone numbers: 10-15 digits)
  if (cleaned.length < 10 || cleaned.length > 15) {
    return null
  }

  // If no + and we have a default country, try to add country code
  if (!hasPlus && options.defaultCountry) {
    // For US, add country code 1
    if (options.defaultCountry === 'US' && cleaned.length === 10) {
      cleaned = '1' + cleaned
    }
    // For UK, add country code 44
    else if (options.defaultCountry === 'GB' && cleaned.length === 10) {
      cleaned = '44' + cleaned
    }
    // For other countries, we can't reliably add country code in fallback
  }

  // Format as E.164
  const e164 = '+' + cleaned

  if (options.outputFormat === 'components') {
    // Try to extract country code (first 1-3 digits)
    let countryCode: string | undefined
    let nationalNumber = cleaned

    // Common country codes
    if (cleaned.startsWith('1') && cleaned.length >= 11) {
      countryCode = '1'
      nationalNumber = cleaned.substring(1)
    } else if (cleaned.startsWith('44') && cleaned.length >= 10) {
      countryCode = '44'
      nationalNumber = cleaned.substring(2)
    } else if (cleaned.startsWith('49') && cleaned.length >= 10) {
      countryCode = '49'
      nationalNumber = cleaned.substring(2)
    } else if (cleaned.startsWith('91') && cleaned.length >= 10) {
      countryCode = '91'
      nationalNumber = cleaned.substring(2)
    }

    return {
      countryCode,
      nationalNumber,
      e164,
    }
  }

  return e164
}

// Auto-register the phone normalizer
registerNormalizer('phone', normalizePhone)
