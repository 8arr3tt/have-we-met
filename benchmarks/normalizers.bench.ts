import { bench, describe } from 'vitest'
import {
  trim,
  lowercase,
  uppercase,
  normalizeWhitespace,
  alphanumericOnly,
  numericOnly,
} from '../src/core/normalizers/basic'
import { normalizeName } from '../src/core/normalizers/name'
import { normalizeEmail } from '../src/core/normalizers/email'
import { normalizePhone } from '../src/core/normalizers/phone'
import { normalizeAddress } from '../src/core/normalizers/address'
import { normalizeDate } from '../src/core/normalizers/date'

/**
 * Performance Benchmarks for Data Normalizers
 *
 * Target Performance (from Phase 3 plan):
 * - Basic normalizers: < 0.001ms per operation
 * - Name normalizer: < 0.5ms
 * - Email normalizer: < 0.1ms
 * - Phone normalizer: < 1ms
 * - Address normalizer: < 2ms
 * - Date normalizer: < 0.5ms
 */

// Test data sets
const testData = {
  names: [
    '  JOHN   DOE  ',
    'DR. JANE SMITH',
    'Mr. Robert Johnson Jr.',
    "Mary-Jane O'Connor",
    'Jean-Claude Van Damme',
  ],
  emails: [
    ' John.Doe+Newsletter@EXAMPLE.COM ',
    'jane.smith@company.com',
    'bob+work@example.co.uk',
    'user123@domain.com',
  ],
  phones: [
    '555-123-4567',
    '(555) 987-6543',
    '+1 555 111 2222',
    '555.123.4567',
    '1-555-123-4567',
  ],
  addresses: [
    '123 MAIN STREET, ANYTOWN, CALIFORNIA 90210',
    '456 Oak Avenue Apt 2B, Portland, OR 97201',
    '789 Elm Blvd, Seattle, WA 98101',
    '321 Park Place #5, New York, NY 10001',
  ],
  dates: [
    '01/15/1985',
    '2024-01-30',
    'January 15, 1985',
    '1/15/85',
    '2024-12-31',
  ],
  strings: [
    '  hello  world  ',
    'UPPERCASE TEXT',
    'lowercase text',
    'Mixed Case Text!',
    'abc123def456',
  ],
}

// Basic Normalizers
describe('Basic Normalizers Performance', () => {
  bench('trim: single string', () => {
    trim('  hello world  ')
  })

  bench('trim: batch 1000 strings', () => {
    for (let i = 0; i < 1000; i++) {
      trim(testData.strings[i % testData.strings.length])
    }
  })

  bench('lowercase: single string', () => {
    lowercase('HELLO WORLD')
  })

  bench('lowercase: batch 1000 strings', () => {
    for (let i = 0; i < 1000; i++) {
      lowercase(testData.strings[i % testData.strings.length])
    }
  })

  bench('uppercase: single string', () => {
    uppercase('hello world')
  })

  bench('normalizeWhitespace: single string', () => {
    normalizeWhitespace('  hello   world  ')
  })

  bench('normalizeWhitespace: batch 1000 strings', () => {
    for (let i = 0; i < 1000; i++) {
      normalizeWhitespace(testData.strings[i % testData.strings.length])
    }
  })

  bench('alphanumericOnly: single string', () => {
    alphanumericOnly('abc-123-def-456')
  })

  bench('numericOnly: single string', () => {
    numericOnly('555-123-4567')
  })
})

// Name Normalizer
describe('Name Normalizer Performance', () => {
  bench('normalizeName: simple name', () => {
    normalizeName('John Smith')
  })

  bench('normalizeName: name with title and suffix', () => {
    normalizeName('Dr. Robert Johnson Jr.')
  })

  bench('normalizeName: complex name', () => {
    normalizeName('  MR.   JOHN    Q.   DOE   JR.  ')
  })

  bench('normalizeName: name with special characters', () => {
    normalizeName("Mary-Jane O'Connor")
  })

  bench('normalizeName: batch 1000 names', () => {
    for (let i = 0; i < 1000; i++) {
      normalizeName(testData.names[i % testData.names.length])
    }
  })

  bench('normalizeName: with components output', () => {
    normalizeName('Dr. John Smith Jr.', { outputFormat: 'components' })
  })
})

// Email Normalizer
describe('Email Normalizer Performance', () => {
  bench('normalizeEmail: simple email', () => {
    normalizeEmail('john@example.com')
  })

  bench('normalizeEmail: email with plus-addressing', () => {
    normalizeEmail('john+work@example.com', { removePlusAddressing: true })
  })

  bench('normalizeEmail: complex email', () => {
    normalizeEmail(' John.Doe+Newsletter@EXAMPLE.COM ')
  })

  bench('normalizeEmail: batch 1000 emails', () => {
    for (let i = 0; i < 1000; i++) {
      normalizeEmail(testData.emails[i % testData.emails.length])
    }
  })

  bench('normalizeEmail: with validation', () => {
    normalizeEmail('john@example.com', { validate: true })
  })
})

// Phone Normalizer
describe('Phone Normalizer Performance', () => {
  bench('normalizePhone: simple US phone', () => {
    normalizePhone('555-123-4567', { defaultCountry: 'US' })
  })

  bench('normalizePhone: formatted US phone', () => {
    normalizePhone('(555) 123-4567', { defaultCountry: 'US' })
  })

  bench('normalizePhone: international phone', () => {
    normalizePhone('+44 20 7123 4567')
  })

  bench('normalizePhone: batch 1000 phones', () => {
    for (let i = 0; i < 1000; i++) {
      normalizePhone(testData.phones[i % testData.phones.length], {
        defaultCountry: 'US',
      })
    }
  })

  bench('normalizePhone: with validation', () => {
    normalizePhone('555-123-4567', { defaultCountry: 'US', validate: true })
  })

  bench('normalizePhone: components output', () => {
    normalizePhone('555-123-4567', {
      defaultCountry: 'US',
      outputFormat: 'components',
    })
  })
})

// Address Normalizer
describe('Address Normalizer Performance', () => {
  bench('normalizeAddress: simple address', () => {
    normalizeAddress('123 Main St, Anytown, CA 90210')
  })

  bench('normalizeAddress: complex address', () => {
    normalizeAddress('123 MAIN STREET APT 4B, ANYTOWN, CALIFORNIA 90210')
  })

  bench('normalizeAddress: with full state name', () => {
    normalizeAddress('456 Oak Avenue, Portland, Oregon 97201')
  })

  bench('normalizeAddress: batch 1000 addresses', () => {
    for (let i = 0; i < 1000; i++) {
      normalizeAddress(testData.addresses[i % testData.addresses.length])
    }
  })

  bench('normalizeAddress: components output', () => {
    normalizeAddress('123 Main St, Anytown, CA 90210', {
      outputFormat: 'components',
    })
  })
})

// Date Normalizer
describe('Date Normalizer Performance', () => {
  bench('normalizeDate: ISO format', () => {
    normalizeDate('2024-01-30')
  })

  bench('normalizeDate: US format', () => {
    normalizeDate('01/30/2024')
  })

  bench('normalizeDate: natural format', () => {
    normalizeDate('January 30, 2024')
  })

  bench('normalizeDate: two-digit year', () => {
    normalizeDate('01/30/24')
  })

  bench('normalizeDate: batch 1000 dates', () => {
    for (let i = 0; i < 1000; i++) {
      normalizeDate(testData.dates[i % testData.dates.length])
    }
  })

  bench('normalizeDate: with partial date handling', () => {
    normalizeDate('2024-01', { partialDates: 'impute' })
  })

  bench('normalizeDate: components output', () => {
    normalizeDate('2024-01-30', { outputFormat: 'components' })
  })
})

// Cross-normalizer comparison
describe('Normalizer Comparison', () => {
  bench('All basic normalizers on single string', () => {
    const str = '  HELLO   WORLD  '
    trim(str)
    lowercase(str)
    uppercase(str)
    normalizeWhitespace(str)
    alphanumericOnly(str)
    numericOnly(str)
  })

  bench('All field normalizers on sample data', () => {
    normalizeName('Dr. John Smith Jr.')
    normalizeEmail('john+work@example.com')
    normalizePhone('555-123-4567', { defaultCountry: 'US' })
    normalizeAddress('123 Main St, Anytown, CA 90210')
    normalizeDate('01/30/2024')
  })

  bench('Batch: 100 full normalizations', () => {
    for (let i = 0; i < 100; i++) {
      normalizeName(testData.names[i % testData.names.length])
      normalizeEmail(testData.emails[i % testData.emails.length])
      normalizePhone(testData.phones[i % testData.phones.length], {
        defaultCountry: 'US',
      })
      normalizeAddress(testData.addresses[i % testData.addresses.length])
      normalizeDate(testData.dates[i % testData.dates.length])
    }
  })
})

// Real-world scenario benchmarks
describe('Real-world Scenarios', () => {
  bench('Customer record normalization (name + email + phone)', () => {
    normalizeName('  JOHN   DOE  ')
    normalizeEmail(' John.Doe+Newsletter@EXAMPLE.COM ')
    normalizePhone('555.123.4567', { defaultCountry: 'US' })
  })

  bench('Patient record normalization (name + DOB + address)', () => {
    normalizeName('DR. JANE SMITH')
    normalizeDate('01/15/1985')
    normalizeAddress('123 MAIN STREET, ANYTOWN, CALIFORNIA 90210')
  })

  bench('Batch: 100 customer records', () => {
    for (let i = 0; i < 100; i++) {
      const idx = i % testData.names.length
      normalizeName(testData.names[idx])
      normalizeEmail(testData.emails[idx % testData.emails.length])
      normalizePhone(testData.phones[idx % testData.phones.length], {
        defaultCountry: 'US',
      })
    }
  })
})
