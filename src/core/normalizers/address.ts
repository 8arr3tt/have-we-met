import { registerNormalizer } from './registry'
import type { NormalizerFunction } from './types'
import {
  US_STATES,
  US_STATE_CODES,
  CANADIAN_PROVINCES,
  CANADIAN_PROVINCE_CODES,
  STREET_TYPE_ABBREVIATIONS,
  DIRECTIONAL_ABBREVIATIONS,
  UNIT_TYPE_PATTERNS,
} from './address-data'

/**
 * Components of a parsed address.
 */
export interface AddressComponents {
  /** Full street address (number + name + type) */
  street?: string
  /** Street number only */
  streetNumber?: string
  /** Street name only (without number or type) */
  streetName?: string
  /** Apartment/unit/suite number */
  unit?: string
  /** City name */
  city?: string
  /** State/province (abbreviated if US/Canada) */
  state?: string
  /** ZIP/postal code (formatted) */
  postalCode?: string
  /** Country code (ISO 3166-1 alpha-2) */
  country?: string
  /** Full normalized address string */
  full?: string
}

/**
 * Options for address normalization.
 */
export interface AddressNormalizerOptions {
  /** Default country if not specified (default: "US") */
  defaultCountry?: string
  /** Whether to abbreviate street types (Street → St) (default: true) */
  abbreviateStreetTypes?: boolean
  /** Whether to abbreviate state names (default: true) */
  abbreviateStates?: boolean
  /** Whether to normalize casing (default: true) */
  normalizeCase?: boolean
  /** Format for output: 'full' or 'components' (default: 'full') */
  outputFormat?: 'full' | 'components'
}

/**
 * Converts a US state full name to its two-letter abbreviation.
 *
 * @param state - The state name (full or abbreviated)
 * @returns The two-letter state code, or the input if already abbreviated or not found
 *
 * @example
 * ```typescript
 * abbreviateState('California')  // 'CA'
 * abbreviateState('New York')    // 'NY'
 * abbreviateState('CA')          // 'CA'
 * abbreviateState('Unknown')     // 'Unknown'
 * ```
 */
export function abbreviateState(state: string): string {
  if (!state) return state

  const normalized = state.trim().toLowerCase()

  // Check US states
  if (US_STATES[normalized]) {
    return US_STATES[normalized]
  }

  // Check Canadian provinces
  if (CANADIAN_PROVINCES[normalized]) {
    return CANADIAN_PROVINCES[normalized]
  }

  // Check if already a valid state/province code
  const upper = state.trim().toUpperCase()
  if (US_STATE_CODES.has(upper) || CANADIAN_PROVINCE_CODES.has(upper)) {
    return upper
  }

  // Return as-is if not found
  return state.trim()
}

/**
 * Abbreviates street type names per USPS standards.
 *
 * @param streetType - The street type (full or abbreviated)
 * @returns The abbreviated street type, or the input if not found
 *
 * @example
 * ```typescript
 * abbreviateStreetType('Street')     // 'St'
 * abbreviateStreetType('Avenue')     // 'Ave'
 * abbreviateStreetType('Boulevard')  // 'Blvd'
 * abbreviateStreetType('St')         // 'St'
 * ```
 */
export function abbreviateStreetType(streetType: string): string {
  if (!streetType) return streetType

  const normalized = streetType.trim().toLowerCase()

  // Check if it's a known street type
  if (STREET_TYPE_ABBREVIATIONS[normalized]) {
    return STREET_TYPE_ABBREVIATIONS[normalized]
  }

  // Check directionals
  if (DIRECTIONAL_ABBREVIATIONS[normalized]) {
    return DIRECTIONAL_ABBREVIATIONS[normalized]
  }

  // Return as-is with proper casing
  return streetType
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

/**
 * Converts a string to Title Case.
 *
 * @param str - The string to convert
 * @returns The string in Title Case
 */
function toTitleCase(str: string): string {
  if (!str) return str
  return str
    .split(' ')
    .map((word) => {
      if (!word) return word
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    })
    .join(' ')
}

/**
 * Extracts unit/apartment number from an address string.
 *
 * @param addressStr - The address string to parse
 * @returns Object with the unit and the address with unit removed
 */
function extractUnit(addressStr: string): { unit?: string; address: string } {
  for (const pattern of UNIT_TYPE_PATTERNS) {
    const match = addressStr.match(pattern)
    if (match) {
      const unit = match[1].trim()
      const address = addressStr.replace(pattern, '').trim()
      return { unit, address }
    }
  }
  return { address: addressStr }
}

/**
 * Parses an address string into its components.
 * Handles comma-delimited and newline-delimited formats.
 *
 * @param address - The address string to parse
 * @returns Parsed address components
 *
 * @example
 * ```typescript
 * parseAddressComponents('123 Main St, Anytown, CA 90210')
 * // { streetNumber: '123', streetName: 'Main', street: '123 Main St',
 * //   city: 'Anytown', state: 'CA', postalCode: '90210' }
 *
 * parseAddressComponents('456 Oak Ave Apt 4B, Springfield, IL 62701')
 * // { streetNumber: '456', streetName: 'Oak', street: '456 Oak Ave',
 * //   unit: '4B', city: 'Springfield', state: 'IL', postalCode: '62701' }
 * ```
 */
export function parseAddressComponents(address: string): AddressComponents {
  if (!address || typeof address !== 'string') {
    return {}
  }

  let addressStr = address.trim()
  if (!addressStr) return {}

  // Normalize newlines to commas for consistent parsing
  addressStr = addressStr.replace(/\n+/g, ', ')

  // Normalize multiple spaces to single space
  addressStr = addressStr.replace(/\s+/g, ' ')

  // Split by comma
  const parts = addressStr.split(',').map((p) => p.trim()).filter(Boolean)

  if (parts.length === 0) return {}

  const components: AddressComponents = {}

  // Extract unit from first part (street address)
  let streetPart = parts[0]
  const unitExtraction = extractUnit(streetPart)
  if (unitExtraction.unit) {
    components.unit = unitExtraction.unit
    streetPart = unitExtraction.address
  }

  // Parse street address (first part)
  // Try to extract street number (starts with digits)
  const streetMatch = streetPart.match(/^(\d+[a-z]?)\s+(.+)$/i)
  if (streetMatch) {
    components.streetNumber = streetMatch[1]
    const remainder = streetMatch[2]

    // Try to split street name and type
    const streetWords = remainder.split(/\s+/)
    if (streetWords.length > 1) {
      const lastWord = streetWords[streetWords.length - 1]
      // Check if last word is a street type
      if (
        STREET_TYPE_ABBREVIATIONS[lastWord.toLowerCase()] ||
        Object.values(STREET_TYPE_ABBREVIATIONS).includes(lastWord)
      ) {
        components.streetName = streetWords.slice(0, -1).join(' ')
      } else {
        components.streetName = remainder
      }
    } else {
      components.streetName = remainder
    }
  }
  components.street = streetPart

  // Canadian postal code pattern: A1A 1A1 or A1A1A1
  const canadianPostalCodePattern = /^[A-Z]\d[A-Z]\s?\d[A-Z]\d$/i

  // Parse remaining parts based on count
  if (parts.length === 2) {
    // Format: "123 Main St, Anytown CA 90210"
    // Last part contains city, state, ZIP
    const lastPart = parts[1]
    const lastPartMatch = lastPart.match(/^(.+?)\s+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/i)
    if (lastPartMatch) {
      components.city = lastPartMatch[1].trim()
      components.state = lastPartMatch[2].toUpperCase()
      components.postalCode = lastPartMatch[3]
    } else {
      // Try without ZIP
      const cityStateMatch = lastPart.match(/^(.+?)\s+([A-Z]{2})$/i)
      if (cityStateMatch) {
        components.city = cityStateMatch[1].trim()
        components.state = cityStateMatch[2].toUpperCase()
      } else {
        // Just city
        components.city = lastPart
      }
    }
  } else if (parts.length === 3) {
    // Format: "123 Main St, Anytown, CA 90210" or "123 Main St, Toronto, ON M5H 2N2"
    components.city = parts[1]

    // Parse state and ZIP from last part
    const lastPart = parts[2]

    // Try US format: state code + ZIP
    const usStateZipMatch = lastPart.match(/^([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/i)
    if (usStateZipMatch) {
      components.state = usStateZipMatch[1].toUpperCase()
      components.postalCode = usStateZipMatch[2]
    } else {
      // Try Canadian format: state code + postal code
      const canadianStatePostalMatch = lastPart.match(/^([A-Z]{2})\s+([A-Z]\d[A-Z]\s?\d[A-Z]\d)$/i)
      if (canadianStatePostalMatch) {
        components.state = canadianStatePostalMatch[1].toUpperCase()
        components.postalCode = canadianStatePostalMatch[2]
      } else {
        // Try state name (long form) with US ZIP
        const stateLongZipMatch = lastPart.match(/^(.+?)\s+(\d{5}(?:-\d{4})?)$/i)
        if (stateLongZipMatch) {
          components.state = stateLongZipMatch[1].trim()
          components.postalCode = stateLongZipMatch[2]
        } else {
          // Try state name (long form) with Canadian postal code
          const stateLongCanadianMatch = lastPart.match(/^(.+?)\s+([A-Z]\d[A-Z]\s?\d[A-Z]\d)$/i)
          if (stateLongCanadianMatch) {
            components.state = stateLongCanadianMatch[1].trim()
            components.postalCode = stateLongCanadianMatch[2]
          } else {
            // Just state
            components.state = lastPart
          }
        }
      }
    }
  } else if (parts.length >= 4) {
    // Format: "123 Main St, Apt 4B, Anytown, CA 90210"
    // or: "123 Main St, Anytown, CA, 90210"
    // Try to identify which parts are what based on patterns

    // Check if any part looks like a unit designation (and we haven't extracted one yet)
    if (!components.unit) {
      for (let i = 1; i < parts.length - 2; i++) {
        const part = parts[i]
        // Check if this part looks like a unit designation
        for (const pattern of UNIT_TYPE_PATTERNS) {
          if (pattern.test(part)) {
            const unitMatch = part.match(pattern)
            if (unitMatch) {
              components.unit = unitMatch[1].trim()
              // Remove this part from further processing
              parts.splice(i, 1)
              break
            }
          }
        }
        if (components.unit) break
      }
    }

    // Now parse the remaining parts
    if (parts.length === 3) {
      // After removing unit, we have: street, city, state+zip
      components.city = parts[1]
      const lastPart = parts[2]

      // Try US format
      const usStateZipMatch = lastPart.match(/^([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/i)
      if (usStateZipMatch) {
        components.state = usStateZipMatch[1].toUpperCase()
        components.postalCode = usStateZipMatch[2]
      } else {
        // Try Canadian format
        const canadianMatch = lastPart.match(/^([A-Z]{2})\s+([A-Z]\d[A-Z]\s?\d[A-Z]\d)$/i)
        if (canadianMatch) {
          components.state = canadianMatch[1].toUpperCase()
          components.postalCode = canadianMatch[2]
        } else {
          components.state = lastPart
        }
      }
    } else if (parts.length === 4) {
      // Four parts: street, city, state, zip
      components.city = parts[1]
      components.state = parts[2]
      components.postalCode = parts[3]
    } else {
      // More than 4 parts - use heuristics
      // If second-to-last part looks like a state code
      const secondToLast = parts[parts.length - 2]
      if (/^[A-Z]{2}$/i.test(secondToLast.trim())) {
        components.state = secondToLast.trim().toUpperCase()
        components.city = parts[parts.length - 3]

        // Last part might be ZIP or postal code
        const lastPart = parts[parts.length - 1]
        if (/^\d{5}(?:-\d{4})?$/.test(lastPart) || canadianPostalCodePattern.test(lastPart)) {
          components.postalCode = lastPart
        }
      } else {
        // Fallback: assume last 3 parts are city, state, ZIP
        const lastPart = parts[parts.length - 1]
        if (/^\d{5}(?:-\d{4})?$/.test(lastPart) || canadianPostalCodePattern.test(lastPart)) {
          components.postalCode = lastPart
          components.state = parts[parts.length - 2]
          components.city = parts[parts.length - 3]
        } else {
          // Last two parts are city and state
          components.state = parts[parts.length - 1]
          components.city = parts[parts.length - 2]
        }
      }
    }
  }

  return components
}

/**
 * Normalizes a physical address for consistent matching.
 *
 * @param value - The address value to normalize
 * @param options - Optional configuration for normalization
 * @returns Normalized address (string or components), or null if input is invalid
 *
 * @example
 * ```typescript
 * normalizeAddress('123 main street, anytown, california 90210')
 * // '123 Main St, Anytown, CA 90210'
 *
 * normalizeAddress('456 Oak Ave Apt 4B, Springfield, IL 62701', { outputFormat: 'components' })
 * // { street: '456 Oak Ave', unit: '4B', city: 'Springfield', state: 'IL', postalCode: '62701' }
 *
 * normalizeAddress('789 Elm Boulevard, Portland, OR', { abbreviateStreetTypes: true })
 * // '789 Elm Blvd, Portland, OR'
 * ```
 */
export const normalizeAddress: NormalizerFunction<AddressNormalizerOptions> = (
  value: unknown,
  options?: AddressNormalizerOptions
): string | AddressComponents | null => {
  if (value == null) return null

  // Convert to string and trim whitespace
  const addressStr = String(value).trim()
  if (!addressStr) return null

  // Set defaults
  const opts: Required<AddressNormalizerOptions> = {
    defaultCountry: options?.defaultCountry ?? 'US',
    abbreviateStreetTypes: options?.abbreviateStreetTypes ?? true,
    abbreviateStates: options?.abbreviateStates ?? true,
    normalizeCase: options?.normalizeCase ?? true,
    outputFormat: options?.outputFormat ?? 'full',
  }

  // Parse the address
  const components = parseAddressComponents(addressStr)

  // Apply normalizations
  if (opts.normalizeCase) {
    if (components.street) {
      components.street = toTitleCase(components.street)
    }
    if (components.streetName) {
      components.streetName = toTitleCase(components.streetName)
    }
    if (components.city) {
      components.city = toTitleCase(components.city)
    }
  }

  // Abbreviate street types
  if (opts.abbreviateStreetTypes && components.street) {
    const streetWords = components.street.split(/\s+/)
    if (streetWords.length > 1) {
      const lastWord = streetWords[streetWords.length - 1]
      const abbreviated = abbreviateStreetType(lastWord)
      if (abbreviated !== lastWord) {
        streetWords[streetWords.length - 1] = abbreviated
        components.street = streetWords.join(' ')
      }
    }
  }

  // Abbreviate state names
  if (opts.abbreviateStates && components.state) {
    components.state = abbreviateState(components.state)
  }

  // Normalize postal code casing
  if (components.postalCode) {
    // Canadian postal code - format as A1B 2C3
    if (/^[A-Z]\d[A-Z]\s?\d[A-Z]\d$/i.test(components.postalCode)) {
      const cleanCode = components.postalCode.replace(/\s+/g, '').toUpperCase()
      components.postalCode = `${cleanCode.slice(0, 3)} ${cleanCode.slice(3)}`
    }
    // US ZIP codes are already in correct format (numeric only)
  }

  // Set default country if not present
  if (!components.country) {
    components.country = opts.defaultCountry
  }

  // Build full address string
  const fullParts: string[] = []

  if (components.street) {
    let streetLine = components.street
    if (components.unit) {
      streetLine += ` #${components.unit}`
    }
    fullParts.push(streetLine)
  }

  if (components.city) {
    fullParts.push(components.city)
  }

  if (components.state && components.postalCode) {
    fullParts.push(`${components.state} ${components.postalCode}`)
  } else if (components.state) {
    fullParts.push(components.state)
  } else if (components.postalCode) {
    fullParts.push(components.postalCode)
  }

  components.full = fullParts.join(', ')

  // Return based on output format
  return opts.outputFormat === 'components' ? components : components.full
}

// Auto-register the address normalizer
registerNormalizer('address', normalizeAddress)
