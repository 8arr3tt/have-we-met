import { describe, it, expect } from 'vitest'
import {
  normalizeAddress,
  parseAddressComponents,
  abbreviateState,
  abbreviateStreetType,
  formatUKPostcode,
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

describe('UK Address Support', () => {
  describe('formatUKPostcode', () => {
    it('should format valid UK postcodes', () => {
      expect(formatUKPostcode('SW1A1AA')).toBe('SW1A 1AA')
      expect(formatUKPostcode('sw1a1aa')).toBe('SW1A 1AA')
      expect(formatUKPostcode('SW1A 1AA')).toBe('SW1A 1AA')
      expect(formatUKPostcode('m1 1aa')).toBe('M1 1AA')
      expect(formatUKPostcode('M11AA')).toBe('M1 1AA')
    })

    it('should handle various UK postcode formats', () => {
      expect(formatUKPostcode('W1A 0AX')).toBe('W1A 0AX')
      expect(formatUKPostcode('M1 1AA')).toBe('M1 1AA')
      expect(formatUKPostcode('B33 8TH')).toBe('B33 8TH')
      expect(formatUKPostcode('CR2 6XH')).toBe('CR2 6XH')
      expect(formatUKPostcode('DN55 1PT')).toBe('DN55 1PT')
      expect(formatUKPostcode('EC1A 1BB')).toBe('EC1A 1BB')
      expect(formatUKPostcode('GIR 0AA')).toBe('GIR 0AA') // Special Girobank postcode
    })

    it('should handle postcodes without spaces', () => {
      expect(formatUKPostcode('W1A0AX')).toBe('W1A 0AX')
      expect(formatUKPostcode('EC1A1BB')).toBe('EC1A 1BB')
    })

    it('should handle postcodes with extra spaces', () => {
      expect(formatUKPostcode('W1A  0AX')).toBe('W1A 0AX')
      expect(formatUKPostcode('  SW1A 1AA  ')).toBe('SW1A 1AA')
    })

    it('should return null for invalid postcodes', () => {
      expect(formatUKPostcode('invalid')).toBeNull()
      expect(formatUKPostcode('123')).toBeNull()
      expect(formatUKPostcode('AAAA AAAA')).toBeNull()
      expect(formatUKPostcode('')).toBeNull()
    })

    it('should return null for US ZIP codes', () => {
      expect(formatUKPostcode('90210')).toBeNull()
      expect(formatUKPostcode('12345-6789')).toBeNull()
    })
  })

  describe('abbreviateState with UK counties', () => {
    it('should abbreviate UK county names', () => {
      expect(abbreviateState('Greater London')).toBe('London')
      expect(abbreviateState('Berkshire')).toBe('Berks')
      expect(abbreviateState('Buckinghamshire')).toBe('Bucks')
      expect(abbreviateState('Cambridgeshire')).toBe('Cambs')
      expect(abbreviateState('Hampshire')).toBe('Hants')
      expect(abbreviateState('Hertfordshire')).toBe('Herts')
    })

    it('should handle Scottish counties', () => {
      expect(abbreviateState('Aberdeenshire')).toBe('Aberdeens')
      expect(abbreviateState('East Lothian')).toBe('E Loth')
      expect(abbreviateState('West Lothian')).toBe('W Loth')
    })

    it('should handle Welsh counties', () => {
      expect(abbreviateState('Carmarthenshire')).toBe('Carmarthen')
      expect(abbreviateState('Pembrokeshire')).toBe('Pembs')
    })

    it('should handle case-insensitive UK county names', () => {
      expect(abbreviateState('greater london')).toBe('London')
      expect(abbreviateState('BERKSHIRE')).toBe('Berks')
    })
  })

  describe('parseAddressComponents with UK addresses', () => {
    it('should parse simple UK address with postcode', () => {
      const result = parseAddressComponents('10 Downing Street, London, SW1A 2AA')
      expect(result.streetNumber).toBe('10')
      expect(result.streetName).toBe('Downing')
      expect(result.city).toBe('London')
      expect(result.postalCode).toBe('SW1A 2AA')
      expect(result.country).toBe('GB')
    })

    it('should parse UK address with county', () => {
      const result = parseAddressComponents('123 High Street, Cambridge, Cambridgeshire, CB1 2AA')
      expect(result.streetNumber).toBe('123')
      expect(result.city).toBe('Cambridgeshire')
      expect(result.state).toBe('Cambridge')
      expect(result.postalCode).toBe('CB1 2AA')
      expect(result.country).toBe('GB')
    })

    it('should parse UK address with Flat', () => {
      const result = parseAddressComponents('Flat 2, 45 Baker Street, London, NW1 6XE')
      expect(result.unit).toBe('2')
      expect(result.streetNumber).toBe('45')
      expect(result.streetName).toBe('Baker')
      expect(result.city).toBe('London')
      expect(result.postalCode).toBe('NW1 6XE')
      expect(result.country).toBe('GB')
    })

    it('should handle various UK postcode formats', () => {
      expect(parseAddressComponents('10 Main St, London, W1A 0AX').postalCode).toBe('W1A 0AX')
      expect(parseAddressComponents('10 Main St, London, M1 1AA').postalCode).toBe('M1 1AA')
      expect(parseAddressComponents('10 Main St, London, B33 8TH').postalCode).toBe('B33 8TH')
      expect(parseAddressComponents('10 Main St, London, CR2 6XH').postalCode).toBe('CR2 6XH')
      expect(parseAddressComponents('10 Main St, London, DN55 1PT').postalCode).toBe('DN55 1PT')
    })

    it('should handle UK postcodes without spaces', () => {
      const result = parseAddressComponents('10 Main St, London, SW1A2AA')
      expect(result.postalCode).toBe('SW1A 2AA')
      expect(result.country).toBe('GB')
    })

    it('should handle lowercase UK postcodes', () => {
      const result = parseAddressComponents('10 Main St, London, sw1a 2aa')
      expect(result.postalCode).toBe('SW1A 2AA')
      expect(result.country).toBe('GB')
    })

    it('should parse UK address without city', () => {
      const result = parseAddressComponents('10 Main Street, SW1A 2AA')
      expect(result.streetNumber).toBe('10')
      expect(result.postalCode).toBe('SW1A 2AA')
      expect(result.country).toBe('GB')
    })
  })

  describe('normalizeAddress with UK addresses', () => {
    it('should normalize UK address with proper formatting', () => {
      const result = normalizeAddress('10 downing street, london, sw1a 2aa')
      expect(result).toContain('10 Downing St')
      expect(result).toContain('London')
      expect(result).toContain('SW1A 2AA')
    })

    it('should normalize UK address with county', () => {
      const result = normalizeAddress('123 high street, oxford, oxfordshire, ox1 1aa')
      expect(result).toContain('123 High St')
      expect(result).toContain('OX1 1AA')
    })

    it('should handle UK-specific street types', () => {
      expect(normalizeAddress('10 Abbey Road, London, NW8 9AY')).toContain('Abbey Rd')
      expect(normalizeAddress('10 Park Lane, London, W1K 7AA')).toContain('Park Ln')
      expect(normalizeAddress('10 Kings Close, London, W1A 1AA')).toContain('Kings Cl')
      expect(normalizeAddress('10 Victoria Crescent, London, W1A 1AA')).toContain('Victoria Cres')
    })

    it('should abbreviate UK county names in addresses', () => {
      const result = normalizeAddress('123 Main St, Reading, Berkshire, RG1 1AA', {
        abbreviateStates: true,
      })
      expect(result).toContain('Berks')
    })

    it('should handle Flat designation (UK-specific)', () => {
      const result = normalizeAddress('Flat 3, 45 Park Road, London, NW1 6XE')
      expect(result).toContain('#3')
      expect(result).toContain('45 Park Rd')
    })

    it('should return components for UK address', () => {
      const result = normalizeAddress('10 Downing Street, London, SW1A 2AA', {
        outputFormat: 'components',
      }) as AddressComponents

      expect(result.streetNumber).toBe('10')
      expect(result.streetName).toBe('Downing')
      expect(result.city).toBe('London')
      expect(result.postalCode).toBe('SW1A 2AA')
      expect(result.country).toBe('GB')
    })

    it('should normalize messy UK address', () => {
      const result = normalizeAddress(
        '  FLAT  2,  123  HIGH  STREET,  CAMBRIDGE,  CAMBRIDGESHIRE,  cb1  2aa  '
      )
      expect(result).toContain('#2')
      expect(result).toContain('123 High St')
      expect(result).toContain('Cambridge')
      expect(result).toContain('CB1 2AA')
    })

    it('should handle UK address with multiple commas', () => {
      const result = normalizeAddress('10 Downing Street, Westminster, London, Greater London, SW1A 2AA')
      expect(result).toContain('10 Downing St')
      expect(result).toContain('SW1A 2AA')
    })
  })
})
