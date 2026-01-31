import { describe, it, expect } from 'vitest'
import {
  normalizeAddress,
  parseAddressComponents,
  abbreviateState,
  abbreviateStreetType,
  type AddressComponents,
} from '../../../src/core/normalizers/address'

describe('abbreviateState', () => {
  it('should abbreviate US state full names', () => {
    expect(abbreviateState('California')).toBe('CA')
    expect(abbreviateState('New York')).toBe('NY')
    expect(abbreviateState('Texas')).toBe('TX')
    expect(abbreviateState('Florida')).toBe('FL')
  })

  it('should handle case-insensitive state names', () => {
    expect(abbreviateState('california')).toBe('CA')
    expect(abbreviateState('CALIFORNIA')).toBe('CA')
    expect(abbreviateState('CaLiFoRnIa')).toBe('CA')
  })

  it('should abbreviate Canadian provinces', () => {
    expect(abbreviateState('Ontario')).toBe('ON')
    expect(abbreviateState('British Columbia')).toBe('BC')
    expect(abbreviateState('Quebec')).toBe('QC')
  })

  it('should return unchanged if already abbreviated', () => {
    expect(abbreviateState('CA')).toBe('CA')
    expect(abbreviateState('NY')).toBe('NY')
    expect(abbreviateState('ON')).toBe('ON')
  })

  it('should handle unknown states gracefully', () => {
    expect(abbreviateState('Unknown')).toBe('Unknown')
    expect(abbreviateState('Fake State')).toBe('Fake State')
  })

  it('should handle empty input', () => {
    expect(abbreviateState('')).toBe('')
  })
})

describe('abbreviateStreetType', () => {
  it('should abbreviate common street types', () => {
    expect(abbreviateStreetType('Street')).toBe('St')
    expect(abbreviateStreetType('Avenue')).toBe('Ave')
    expect(abbreviateStreetType('Boulevard')).toBe('Blvd')
    expect(abbreviateStreetType('Road')).toBe('Rd')
    expect(abbreviateStreetType('Drive')).toBe('Dr')
    expect(abbreviateStreetType('Lane')).toBe('Ln')
    expect(abbreviateStreetType('Court')).toBe('Ct')
    expect(abbreviateStreetType('Circle')).toBe('Cir')
  })

  it('should handle case-insensitive street types', () => {
    expect(abbreviateStreetType('street')).toBe('St')
    expect(abbreviateStreetType('AVENUE')).toBe('Ave')
    expect(abbreviateStreetType('BoUlEvArD')).toBe('Blvd')
  })

  it('should abbreviate directionals', () => {
    expect(abbreviateStreetType('North')).toBe('N')
    expect(abbreviateStreetType('South')).toBe('S')
    expect(abbreviateStreetType('East')).toBe('E')
    expect(abbreviateStreetType('West')).toBe('W')
  })

  it('should return unchanged if already abbreviated', () => {
    expect(abbreviateStreetType('St')).toBe('St')
    expect(abbreviateStreetType('Ave')).toBe('Ave')
    expect(abbreviateStreetType('Blvd')).toBe('Blvd')
  })

  it('should handle unknown street types with proper casing', () => {
    expect(abbreviateStreetType('Unknown')).toBe('Unknown')
    expect(abbreviateStreetType('CUSTOM')).toBe('Custom')
  })

  it('should handle empty input', () => {
    expect(abbreviateStreetType('')).toBe('')
  })
})

describe('parseAddressComponents', () => {
  it('should parse simple address with street, city, state, ZIP', () => {
    const result = parseAddressComponents('123 Main St, Anytown, CA 90210')
    expect(result.streetNumber).toBe('123')
    expect(result.streetName).toBe('Main')
    expect(result.street).toBe('123 Main St')
    expect(result.city).toBe('Anytown')
    expect(result.state).toBe('CA')
    expect(result.postalCode).toBe('90210')
  })

  it('should parse address with unit number', () => {
    const result = parseAddressComponents('456 Oak Ave Apt 4B, Springfield, IL 62701')
    expect(result.streetNumber).toBe('456')
    expect(result.streetName).toBe('Oak')
    expect(result.street).toBe('456 Oak Ave')
    expect(result.unit).toBe('4B')
    expect(result.city).toBe('Springfield')
    expect(result.state).toBe('IL')
    expect(result.postalCode).toBe('62701')
  })

  it('should parse address with apartment number using #', () => {
    const result = parseAddressComponents('789 Elm St #2C, Portland, OR 97201')
    expect(result.street).toBe('789 Elm St')
    expect(result.unit).toBe('2C')
    expect(result.city).toBe('Portland')
    expect(result.state).toBe('OR')
    expect(result.postalCode).toBe('97201')
  })

  it('should parse address with suite', () => {
    const result = parseAddressComponents('100 Business Blvd Suite 200, Austin, TX 78701')
    expect(result.street).toBe('100 Business Blvd')
    expect(result.unit).toBe('200')
    expect(result.city).toBe('Austin')
    expect(result.state).toBe('TX')
    expect(result.postalCode).toBe('78701')
  })

  it('should parse address with city and state combined in one part', () => {
    const result = parseAddressComponents('321 Pine Rd, Denver CO 80202')
    expect(result.street).toBe('321 Pine Rd')
    expect(result.city).toBe('Denver')
    expect(result.state).toBe('CO')
    expect(result.postalCode).toBe('80202')
  })

  it('should parse address without ZIP code', () => {
    const result = parseAddressComponents('555 Maple Dr, Seattle, WA')
    expect(result.street).toBe('555 Maple Dr')
    expect(result.city).toBe('Seattle')
    expect(result.state).toBe('WA')
    expect(result.postalCode).toBeUndefined()
  })

  it('should parse address with extended ZIP+4', () => {
    const result = parseAddressComponents('777 Park Ave, New York, NY 10021-5555')
    expect(result.street).toBe('777 Park Ave')
    expect(result.city).toBe('New York')
    expect(result.state).toBe('NY')
    expect(result.postalCode).toBe('10021-5555')
  })

  it('should parse address with newlines', () => {
    const result = parseAddressComponents('123 Main St\nAnytown, CA 90210')
    expect(result.street).toBe('123 Main St')
    expect(result.city).toBe('Anytown')
    expect(result.state).toBe('CA')
    expect(result.postalCode).toBe('90210')
  })

  it('should parse address with multiple newlines', () => {
    const result = parseAddressComponents('456 Oak Ave\nApt 4B\nSpringfield, IL 62701')
    expect(result.street).toBe('456 Oak Ave')
    expect(result.unit).toBe('4B')
    expect(result.city).toBe('Springfield')
    expect(result.state).toBe('IL')
    expect(result.postalCode).toBe('62701')
  })

  it('should handle extra whitespace', () => {
    const result = parseAddressComponents('  123   Main   St  ,  Anytown  ,  CA   90210  ')
    expect(result.street).toBe('123 Main St')
    expect(result.city).toBe('Anytown')
    expect(result.state).toBe('CA')
    expect(result.postalCode).toBe('90210')
  })

  it('should handle street address with letter suffix', () => {
    const result = parseAddressComponents('123A Main St, Anytown, CA 90210')
    expect(result.streetNumber).toBe('123A')
    expect(result.street).toBe('123A Main St')
  })

  it('should handle partial address (street only)', () => {
    const result = parseAddressComponents('123 Main St')
    expect(result.street).toBe('123 Main St')
    expect(result.city).toBeUndefined()
    expect(result.state).toBeUndefined()
  })

  it('should handle partial address (street and city)', () => {
    const result = parseAddressComponents('123 Main St, Anytown')
    expect(result.street).toBe('123 Main St')
    expect(result.city).toBe('Anytown')
    expect(result.state).toBeUndefined()
  })

  it('should handle null input', () => {
    const result = parseAddressComponents(null as any)
    expect(result).toEqual({})
  })

  it('should handle empty string', () => {
    const result = parseAddressComponents('')
    expect(result).toEqual({})
  })

  it('should handle whitespace-only string', () => {
    const result = parseAddressComponents('   ')
    expect(result).toEqual({})
  })
})

describe('normalizeAddress', () => {
  it('should normalize simple address', () => {
    const result = normalizeAddress('123 main street, anytown, california 90210')
    expect(result).toBe('123 Main St, Anytown, CA 90210')
  })

  it('should abbreviate street types by default', () => {
    const result = normalizeAddress('456 oak avenue, springfield, illinois 62701')
    expect(result).toBe('456 Oak Ave, Springfield, IL 62701')
  })

  it('should abbreviate state names by default', () => {
    const result = normalizeAddress('789 elm boulevard, portland, oregon 97201')
    expect(result).toBe('789 Elm Blvd, Portland, OR 97201')
  })

  it('should preserve street types when abbreviation disabled', () => {
    const result = normalizeAddress('123 Main Street, Anytown, CA 90210', {
      abbreviateStreetTypes: false,
    })
    expect(result).toBe('123 Main Street, Anytown, CA 90210')
  })

  it('should preserve state names when abbreviation disabled', () => {
    const result = normalizeAddress('123 Main St, Anytown, California 90210', {
      abbreviateStates: false,
    })
    expect(result).toBe('123 Main St, Anytown, California 90210')
  })

  it('should normalize casing by default', () => {
    const result = normalizeAddress('123 MAIN STREET, ANYTOWN, CA 90210')
    expect(result).toBe('123 Main St, Anytown, CA 90210')
  })

  it('should preserve original casing when disabled', () => {
    const result = normalizeAddress('123 MAIN STREET, ANYTOWN, CA 90210', {
      normalizeCase: false,
    })
    expect(result).toBe('123 MAIN St, ANYTOWN, CA 90210')
  })

  it('should handle address with apartment', () => {
    const result = normalizeAddress('456 oak avenue apt 4b, springfield, il 62701')
    expect(result).toBe('456 Oak Ave #4b, Springfield, IL 62701')
  })

  it('should handle address with suite', () => {
    const result = normalizeAddress('100 business blvd suite 200, austin, tx 78701')
    expect(result).toBe('100 Business Blvd #200, Austin, TX 78701')
  })

  it('should handle Canadian addresses', () => {
    const result = normalizeAddress('123 Main St, Toronto, Ontario M5H 2N2', {
      defaultCountry: 'CA',
    })
    expect(result).toBe('123 Main St, Toronto, ON M5H 2N2')
  })

  it('should format Canadian postal codes', () => {
    const result = normalizeAddress('123 Main St, Toronto, ON M5H2N2')
    expect(result).toBe('123 Main St, Toronto, ON M5H 2N2')
  })

  it('should handle extended ZIP+4', () => {
    const result = normalizeAddress('777 Park Ave, New York, NY 10021-5555')
    expect(result).toBe('777 Park Ave, New York, NY 10021-5555')
  })

  it('should handle address without ZIP code', () => {
    const result = normalizeAddress('555 Maple Dr, Seattle, WA')
    expect(result).toBe('555 Maple Dr, Seattle, WA')
  })

  it('should handle partial address (street and city only)', () => {
    const result = normalizeAddress('123 Main St, Anytown')
    expect(result).toBe('123 Main St, Anytown')
  })

  it('should return components format when requested', () => {
    const result = normalizeAddress('123 Main St, Anytown, CA 90210', {
      outputFormat: 'components',
    }) as AddressComponents

    expect(result.street).toBe('123 Main St')
    expect(result.streetNumber).toBe('123')
    expect(result.streetName).toBe('Main')
    expect(result.city).toBe('Anytown')
    expect(result.state).toBe('CA')
    expect(result.postalCode).toBe('90210')
    expect(result.country).toBe('US')
    expect(result.full).toBe('123 Main St, Anytown, CA 90210')
  })

  it('should return components with unit when requested', () => {
    const result = normalizeAddress('456 Oak Ave Apt 4B, Springfield, IL 62701', {
      outputFormat: 'components',
    }) as AddressComponents

    expect(result.street).toBe('456 Oak Ave')
    expect(result.unit).toBe('4B')
    expect(result.city).toBe('Springfield')
    expect(result.state).toBe('IL')
    expect(result.postalCode).toBe('62701')
  })

  it('should handle null input', () => {
    expect(normalizeAddress(null)).toBeNull()
  })

  it('should handle undefined input', () => {
    expect(normalizeAddress(undefined)).toBeNull()
  })

  it('should handle empty string', () => {
    expect(normalizeAddress('')).toBeNull()
  })

  it('should handle whitespace-only string', () => {
    expect(normalizeAddress('   ')).toBeNull()
  })

  it('should coerce non-string input', () => {
    const result = normalizeAddress({
      toString: () => '123 Main St, Anytown, CA 90210',
    })
    expect(result).toBe('123 Main St, Anytown, CA 90210')
  })

  it('should set default country', () => {
    const result = normalizeAddress('123 Main St, Anytown, CA 90210', {
      outputFormat: 'components',
    }) as AddressComponents

    expect(result.country).toBe('US')
  })

  it('should respect custom default country', () => {
    const result = normalizeAddress('123 Main St, Toronto, ON M5H 2N2', {
      defaultCountry: 'CA',
      outputFormat: 'components',
    }) as AddressComponents

    expect(result.country).toBe('CA')
  })

  it('should handle complex multi-word street names', () => {
    const result = normalizeAddress(
      '123 martin luther king jr boulevard, atlanta, georgia 30303'
    )
    expect(result).toContain('123 Martin Luther King Jr Blvd')
    expect(result).toContain('Atlanta')
    expect(result).toContain('GA')
  })

  it('should handle newline-delimited addresses', () => {
    const result = normalizeAddress('123 main st\nanytown, ca 90210')
    expect(result).toBe('123 Main St, Anytown, CA 90210')
  })

  it('should normalize multiple spaces', () => {
    const result = normalizeAddress('123   main   st,   anytown,   ca   90210')
    expect(result).toBe('123 Main St, Anytown, CA 90210')
  })

  it('should handle street address without street type', () => {
    const result = normalizeAddress('123 Main, Anytown, CA 90210')
    expect(result).toBe('123 Main, Anytown, CA 90210')
  })

  it('should handle various unit type formats', () => {
    expect(normalizeAddress('123 Main St Apartment 5, Anytown, CA 90210')).toContain('#5')
    expect(normalizeAddress('123 Main St Unit 5, Anytown, CA 90210')).toContain('#5')
    expect(normalizeAddress('123 Main St Building 5, Anytown, CA 90210')).toContain('#5')
    expect(normalizeAddress('123 Main St Floor 5, Anytown, CA 90210')).toContain('#5')
    expect(normalizeAddress('123 Main St Room 5, Anytown, CA 90210')).toContain('#5')
  })

  it('should be idempotent (normalizing twice gives same result)', () => {
    const input = '123 main street, anytown, california 90210'
    const first = normalizeAddress(input)
    const second = normalizeAddress(first as string)
    expect(first).toBe(second)
  })
})
