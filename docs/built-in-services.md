# Built-in Services Reference

This document provides detailed reference for all built-in service plugins included with have-we-met.

## Validation Services

### NHS Number Validator

Validates UK National Health Service numbers using format and modulus 11 checksum validation.

```typescript
import { nhsNumberValidator, createNHSNumberValidator } from 'have-we-met/services'

// Use the default instance
.validate('nhsNumber')
  .using(nhsNumberValidator)

// Or create a custom instance
const customValidator = createNHSNumberValidator({
  name: 'custom-nhs-validator',
  description: 'NHS validator for patient records',
})
```

**Validation Checks:**

1. **presence** - Value must not be empty
2. **format** - Must be exactly 10 digits
3. **checksum** - Modulus 11 checksum must be valid

**NHS Checksum Algorithm:**

1. Multiply each of the first 9 digits by weights (10, 9, 8, 7, 6, 5, 4, 3, 2)
2. Sum the products
3. Take modulo 11 of the sum
4. Subtract from 11 to get check digit (11 becomes 0, 10 is invalid)
5. Check digit must match the 10th digit

**Example Results:**

```typescript
// Valid NHS number: 943 476 5919
{
  valid: true,
  details: {
    checks: [
      { name: 'format', passed: true, message: 'Valid 10-digit format' },
      { name: 'checksum', passed: true, message: 'Valid modulus 11 checksum' }
    ],
    normalizedValue: '9434765919',
    confidence: 1.0
  }
}

// Invalid checksum: 1234567890
{
  valid: false,
  details: { checks: [...] },
  invalidReason: 'Invalid NHS number checksum',
  suggestions: ['Verify the number was entered correctly']
}
```

**Utility Functions:**

```typescript
import { validateNHSChecksum, normalizeNHSNumber } from 'have-we-met/services'

validateNHSChecksum('9434765919') // true
normalizeNHSNumber('943 476 5919') // '9434765919'
```

---

### Email Validator

Validates email addresses using format checks with optional DNS MX lookup and disposable email detection.

```typescript
import { emailValidator, createEmailValidator } from 'have-we-met/services'

// Default validator
.validate('email')
  .using(emailValidator)

// Custom configuration
const strictValidator = createEmailValidator({
  name: 'strict-email-validator',
  checkMx: true,           // Check DNS MX records
  checkDisposable: true,   // Block disposable email domains
  requireTld: true,        // Require top-level domain
  disposableDomains: ['tempmail.com', 'throwaway.org'], // Custom blocklist
})
```

**Options:**

| Option              | Type     | Default           | Description                     |
| ------------------- | -------- | ----------------- | ------------------------------- |
| `name`              | string   | 'email-validator' | Service name                    |
| `checkMx`           | boolean  | false             | Verify domain has MX records    |
| `checkDisposable`   | boolean  | false             | Reject disposable email domains |
| `requireTld`        | boolean  | true              | Require top-level domain        |
| `disposableDomains` | string[] | (built-in list)   | Custom disposable domain list   |

**Validation Checks:**

1. **format** - Valid email format (RFC 5322 simplified)
2. **tld** - Has valid top-level domain (if `requireTld`)
3. **mx** - Domain has MX records (if `checkMx`)
4. **disposable** - Not a disposable email domain (if `checkDisposable`)

**Utility Functions:**

```typescript
import {
  validateEmailFormat,
  normalizeEmail,
  extractDomain,
  isDisposableDomain,
} from 'have-we-met/services'

validateEmailFormat('user@example.com') // true
normalizeEmail('User@Example.COM') // 'user@example.com'
extractDomain('user@example.com') // 'example.com'
isDisposableDomain('mailinator.com') // true
```

---

### Phone Validator

Validates phone numbers using libphonenumber-js for comprehensive international support.

```typescript
import { phoneValidator, createPhoneValidator } from 'have-we-met/services'

// Default validator
.validate('phone')
  .using(phoneValidator)

// Custom configuration
const ukPhoneValidator = createPhoneValidator({
  name: 'uk-phone-validator',
  defaultCountry: 'GB',
  allowedCountries: ['GB', 'IE'],
  requireCountryCode: false,
})
```

**Options:**

| Option               | Type     | Default           | Description                            |
| -------------------- | -------- | ----------------- | -------------------------------------- |
| `name`               | string   | 'phone-validator' | Service name                           |
| `defaultCountry`     | string   | 'US'              | Default country for parsing            |
| `allowedCountries`   | string[] | (all)             | Restrict to specific countries         |
| `requireCountryCode` | boolean  | false             | Require international format           |
| `validateType`       | boolean  | true              | Validate number type (mobile/landline) |

**Validation Checks:**

1. **format** - Valid phone number format
2. **country** - Country code is recognized
3. **possible** - Number is possible for the country
4. **valid** - Number passes country-specific validation

**Result Metadata:**

```typescript
{
  valid: true,
  details: {
    checks: [...],
    normalizedValue: '+447911123456', // E.164 format
    confidence: 1.0,
  },
  metadata: {
    countryCode: 'GB',
    nationalNumber: '7911123456',
    numberType: 'MOBILE',
    isValidForRegion: true,
  }
}
```

**Utility Functions:**

```typescript
import {
  getValidCountryCodes,
  isValidCountryCode,
  normalizePhoneInput,
} from 'have-we-met/services'

getValidCountryCodes() // ['US', 'GB', 'DE', ...]
isValidCountryCode('GB') // true
normalizePhoneInput('07911 123456', 'GB') // '+447911123456'
```

---

### SSN Validator

Validates US Social Security Numbers using format rules and known invalid patterns.

```typescript
import { ssnValidator, createSSNValidator } from 'have-we-met/services'

// Default validator
.validate('ssn')
  .using(ssnValidator)

// Custom configuration
const strictSsnValidator = createSSNValidator({
  name: 'strict-ssn-validator',
  checkKnownInvalid: true,  // Check against known invalid patterns
  allowAreas: true,         // Area number validation
})
```

**Options:**

| Option              | Type    | Default         | Description                           |
| ------------------- | ------- | --------------- | ------------------------------------- |
| `name`              | string  | 'ssn-validator' | Service name                          |
| `checkKnownInvalid` | boolean | true            | Check against known invalid SSNs      |
| `allowAreas`        | boolean | true            | Validate area number (first 3 digits) |

**Validation Checks:**

1. **format** - Valid XXX-XX-XXXX format (9 digits)
2. **area** - Area number not 000, 666, or 900-999
3. **group** - Group number not 00
4. **serial** - Serial number not 0000
5. **known** - Not a known invalid pattern (e.g., 123-45-6789)

**Utility Functions:**

```typescript
import {
  normalizeSSN,
  formatSSN,
  parseSSN,
  hasValidAreaNumber,
  isKnownInvalidSSN,
} from 'have-we-met/services'

normalizeSSN('123-45-6789') // '123456789'
formatSSN('123456789') // '123-45-6789'
parseSSN('123-45-6789') // { area: '123', group: '45', serial: '6789' }
hasValidAreaNumber('123') // true
hasValidAreaNumber('000') // false
isKnownInvalidSSN('123456789') // true (test number)
```

---

### NINO Validator

Validates UK National Insurance Numbers using HMRC format rules.

```typescript
import { ninoValidator, createNINOValidator } from 'have-we-met/services'

// Default validator
.validate('nino')
  .using(ninoValidator)

// Custom configuration
const customNinoValidator = createNINOValidator({
  name: 'custom-nino-validator',
  checkAdministrative: true,  // Flag administrative NINOs (TN prefix)
})
```

**Options:**

| Option                | Type    | Default          | Description                  |
| --------------------- | ------- | ---------------- | ---------------------------- |
| `name`                | string  | 'nino-validator' | Service name                 |
| `checkAdministrative` | boolean | false            | Flag administrative prefixes |

**Validation Checks:**

1. **format** - Valid format: 2 letters + 6 digits + 1 letter
2. **prefix** - Valid prefix (not D, F, I, Q, U, V)
3. **second** - Valid second letter (not O)
4. **combination** - Not reserved combination (BG, GB, NK, KN, TN, NT, ZZ)
5. **suffix** - Valid suffix letter (A, B, C, or D)

**Example:**

```typescript
// Valid NINO: AB 12 34 56 C
{
  valid: true,
  details: {
    checks: [
      { name: 'format', passed: true },
      { name: 'prefix', passed: true },
      { name: 'suffix', passed: true },
    ],
    normalizedValue: 'AB123456C',
    confidence: 1.0
  }
}
```

**Utility Functions:**

```typescript
import {
  normalizeNINO,
  formatNINO,
  parseNINO,
  hasValidFirstLetter,
  hasValidSecondLetter,
  hasValidPrefix,
  hasValidSuffix,
  isAdministrativeNINO,
} from 'have-we-met/services'

normalizeNINO('AB 12 34 56 C') // 'AB123456C'
formatNINO('AB123456C') // 'AB 12 34 56 C'
parseNINO('AB123456C') // { prefix: 'AB', numbers: '123456', suffix: 'C' }
hasValidPrefix('AB') // true
hasValidPrefix('QQ') // false
isAdministrativeNINO('TN123456A') // true
```

---

## Lookup Services

### Address Standardization

Standardizes addresses using external APIs with support for multiple providers.

```typescript
import { createAddressStandardization, mockAddressStandardization } from 'have-we-met/services'

// Use mock for development/testing
.lookup('address')
  .using(mockAddressStandardization)

// Configure with a real provider
const addressLookup = createAddressStandardization({
  provider: 'google',
  apiKey: process.env.GOOGLE_MAPS_API_KEY,
  fieldMapping: {
    'formatted_address': 'address.formatted',
    'street_number': 'address.streetNumber',
    'route': 'address.street',
    'locality': 'address.city',
    'administrative_area_level_1': 'address.state',
    'postal_code': 'address.postcode',
    'country': 'address.country',
  },
})
```

**Configuration:**

| Option           | Type   | Default | Description                                            |
| ---------------- | ------ | ------- | ------------------------------------------------------ |
| `provider`       | string | 'mock'  | Provider: 'mock', 'google', 'usps', 'loqate', 'custom' |
| `apiKey`         | string | -       | API key for the provider                               |
| `apiEndpoint`    | string | -       | Custom API endpoint                                    |
| `fieldMapping`   | object | -       | Map provider fields to schema fields                   |
| `defaultCountry` | string | 'US'    | Default country for parsing                            |

**Supported Providers:**

- `mock` - Development/testing with canned responses
- `google` - Google Maps Geocoding API
- `usps` - USPS Address Validation
- `loqate` - Loqate/PCA Predict
- `custom` - Custom provider via callback

**Result:**

```typescript
{
  found: true,
  data: {
    formatted: '123 Main St, City, ST 12345',
    streetNumber: '123',
    street: 'Main St',
    city: 'City',
    state: 'ST',
    postcode: '12345',
    country: 'US',
  },
  matchQuality: 'exact', // 'exact' | 'partial' | 'fuzzy'
  source: {
    system: 'google',
    recordId: 'ChIJ...',
    lastUpdated: Date,
  }
}
```

**Utility Functions:**

```typescript
import {
  buildAddressString,
  mapAddressFields,
  determineMatchQuality,
} from 'have-we-met/services'

buildAddressString({ street: '123 Main St', city: 'City' })
// '123 Main St, City'

mapAddressFields(apiResponse, fieldMapping)
// Transforms API response using mapping

determineMatchQuality(confidence) // 'exact' | 'partial' | 'fuzzy'
```

---

### Email Enrichment

Fetches additional data about email addresses from enrichment providers.

```typescript
import { createEmailEnrichment, mockEmailEnrichment } from 'have-we-met/services'

// Use mock for development/testing
.lookup('email')
  .using(mockEmailEnrichment)

// Configure with a real provider (e.g., Clearbit)
const emailLookup = createEmailEnrichment({
  provider: 'clearbit',
  apiKey: process.env.CLEARBIT_API_KEY,
  fieldMapping: {
    'name.fullName': 'contactName',
    'employment.name': 'company',
    'employment.title': 'jobTitle',
    'location.city': 'city',
    'linkedin.handle': 'linkedinProfile',
  },
})
```

**Configuration:**

| Option           | Type    | Default | Description                                      |
| ---------------- | ------- | ------- | ------------------------------------------------ |
| `provider`       | string  | 'mock'  | Provider: 'mock', 'clearbit', 'hunter', 'custom' |
| `apiKey`         | string  | -       | API key for the provider                         |
| `fieldMapping`   | object  | -       | Map provider fields to schema fields             |
| `includeCompany` | boolean | true    | Include company information                      |
| `includeSocial`  | boolean | false   | Include social profiles                          |

**Result:**

```typescript
{
  found: true,
  data: {
    contactName: 'John Smith',
    company: 'Acme Inc',
    jobTitle: 'Software Engineer',
    city: 'San Francisco',
    linkedinProfile: 'johnsmith',
  },
  matchQuality: 'exact',
  source: {
    system: 'clearbit',
    recordId: 'person_abc123',
  }
}
```

---

### Phone Carrier Lookup

Looks up carrier and line type information for phone numbers.

```typescript
import { createPhoneCarrierLookup, mockPhoneCarrierLookup } from 'have-we-met/services'

// Use mock for development/testing
.lookup('phone')
  .using(mockPhoneCarrierLookup)

// Configure with a real provider
const carrierLookup = createPhoneCarrierLookup({
  provider: 'twilio',
  apiKey: process.env.TWILIO_ACCOUNT_SID,
  apiSecret: process.env.TWILIO_AUTH_TOKEN,
  fieldMapping: {
    'carrier.name': 'carrierName',
    'carrier.type': 'lineType',
    'country_code': 'countryCode',
  },
})
```

**Configuration:**

| Option         | Type   | Default | Description                                   |
| -------------- | ------ | ------- | --------------------------------------------- |
| `provider`     | string | 'mock'  | Provider: 'mock', 'twilio', 'plivo', 'custom' |
| `apiKey`       | string | -       | API key/account SID                           |
| `apiSecret`    | string | -       | API secret/auth token                         |
| `fieldMapping` | object | -       | Map provider fields to schema fields          |

**Line Types:**

- `mobile` - Mobile/cellular phone
- `landline` - Fixed landline
- `voip` - Voice over IP
- `toll_free` - Toll-free number
- `premium` - Premium rate number
- `unknown` - Could not determine type

**Result:**

```typescript
{
  found: true,
  data: {
    carrierName: 'Verizon Wireless',
    lineType: 'mobile',
    countryCode: 'US',
    portability: 'ported', // 'original' | 'ported'
  },
  matchQuality: 'exact',
  source: {
    system: 'twilio',
  }
}
```

---

### Mock Lookup Service

Configurable mock service for testing lookup scenarios.

```typescript
import {
  createMockLookup,
  createMockLookupWithData,
  createSuccessMock,
  createNotFoundMock,
  createFailureMock,
  createSlowMock,
  createFlakyMock,
} from 'have-we-met/services'

// Basic mock with canned responses
const mock = createMockLookup({
  responses: {
    key1: { found: true, data: { name: 'Test' } },
    key2: { found: false },
  },
  defaultResponse: { found: false },
  latencyMs: 50,
})

// Create from data array
const dataMock = createMockLookupWithData(
  [
    { id: '1', name: 'Alice' },
    { id: '2', name: 'Bob' },
  ],
  'id' // Key field
)

// Convenience factories
const successMock = createSuccessMock({ name: 'Test' })
const notFoundMock = createNotFoundMock()
const failureMock = createFailureMock('Service unavailable')
const slowMock = createSlowMock(2000) // 2 second delay
const flakyMock = createFlakyMock(0.3) // 30% failure rate
```

**Configuration:**

| Option            | Type   | Default             | Description                   |
| ----------------- | ------ | ------------------- | ----------------------------- |
| `responses`       | object | {}                  | Map of input hash to response |
| `defaultResponse` | object | { found: false }    | Response when no match        |
| `latencyMs`       | number | 0                   | Simulated latency             |
| `failureRate`     | number | 0                   | Probability of failure (0-1)  |
| `failureError`    | Error  | ServiceNetworkError | Error to throw on failure     |

**Tracking Calls:**

```typescript
const mock = createMockLookup({ ... }) as MockLookupService

// Use the mock...
await executor.executePreMatch(record)

// Check what was called
console.log(mock.getCalls()) // Array of { input, timestamp }
console.log(mock.getCallCount()) // Number of calls
mock.clearCalls() // Reset tracking
```

---

## Service Constants

### Default Configurations

```typescript
import {
  DEFAULT_RETRY_CONFIG,
  DEFAULT_CACHE_CONFIG,
  DEFAULT_SERVICE_CONFIG,
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
} from 'have-we-met/services'

// Default retry configuration
DEFAULT_RETRY_CONFIG = {
  maxAttempts: 3,
  initialDelayMs: 100,
  backoffMultiplier: 2,
  maxDelayMs: 5000,
  retryOn: ['timeout', 'network', 'server'],
}

// Default cache configuration
DEFAULT_CACHE_CONFIG = {
  enabled: true,
  ttlSeconds: 300,
  staleOnError: true,
}

// Default service configuration
DEFAULT_SERVICE_CONFIG = {
  onFailure: 'continue',
  timeout: 5000,
  priority: 100,
  required: false,
}

// Default circuit breaker configuration
DEFAULT_CIRCUIT_BREAKER_CONFIG = {
  failureThreshold: 5,
  resetTimeoutMs: 30000,
  successThreshold: 2,
  failureWindowMs: 60000,
}
```

---

## See Also

- [External Services Overview](./external-services.md) - Introduction to external services
- [Creating Service Plugins](./service-plugins.md) - Build custom plugins
- [Service Resilience](./service-resilience.md) - Timeout, retry, circuit breaker patterns
