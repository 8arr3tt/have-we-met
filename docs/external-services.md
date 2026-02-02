# External Services

External services enable integration with third-party systems for identity verification and data enrichment. In regulated industries (healthcare, finance, government), certain identifiers have authoritative registries that can validate or enhance identity data. The external services module provides a plugin architecture to leverage these resources.

## Overview

External services are categorized into three types:

1. **Validation Services** - Verify identifier values (e.g., NHS number checksum, email format)
2. **Lookup Services** - Fetch additional data from external sources to enrich records
3. **Custom Services** - Arbitrary processing (e.g., fraud detection, risk scoring)

Services integrate into the resolution workflow at two points:

- **Pre-match**: Execute before matching to validate inputs or enrich data
- **Post-match**: Execute after matching to adjust scores or flag results

## Quick Start

```typescript
import { HaveWeMet } from 'have-we-met'
import {
  nhsNumberValidator,
  emailValidator,
  createAddressStandardization,
} from 'have-we-met/services'

const resolver = HaveWeMet.schema({
  firstName: { type: 'name', component: 'first' },
  lastName: { type: 'name', component: 'last' },
  nhsNumber: { type: 'string' },
  email: { type: 'email' },
  address: { type: 'address' },
})
  .matching((match) =>
    match
      .field('nhsNumber')
      .strategy('exact')
      .weight(25)
      .field('email')
      .strategy('exact')
      .weight(15)
      .field('firstName')
      .strategy('jaro-winkler')
      .weight(10)
      .field('lastName')
      .strategy('jaro-winkler')
      .weight(10)
  )
  .services((services) =>
    services
      .defaultTimeout(5000)
      .defaultRetry({
        maxAttempts: 3,
        initialDelayMs: 100,
        backoffMultiplier: 2,
        maxDelayMs: 1000,
      })
      .caching(true)

      // Validate NHS number before matching
      .validate('nhsNumber')
      .using(nhsNumberValidator)
      .onInvalid('reject')
      .required(true)

      // Validate email format
      .validate('email')
      .using(emailValidator)
      .onInvalid('flag')

      // Enrich address data
      .lookup('address')
      .using(createAddressStandardization({ provider: 'mock' }))
      .mapFields({
        streetAddress: 'address.street',
        city: 'address.city',
        postalCode: 'address.postcode',
      })
      .onNotFound('continue')
  )
  .thresholds({ noMatch: 20, definiteMatch: 45 })
  .build()

// Resolution includes service results
const result = await resolver.resolve(newRecord)
// result.serviceResults contains validation and lookup results
// result.enrichedRecord contains record with lookup data merged in
```

## Service Types

### Validation Services

Validation services verify identifier values against format rules, checksums, or external registries.

```typescript
interface ValidationService extends ServicePlugin<
  ValidationInput,
  ValidationOutput
> {
  type: 'validation'
}

interface ValidationInput {
  field: string // Field being validated
  value: unknown // Value to validate
  context?: Record<string, unknown>
}

interface ValidationOutput {
  valid: boolean // Whether the value is valid
  details?: {
    checks: ValidationCheck[] // Individual validation checks
    normalizedValue?: unknown // Normalized/corrected value
    confidence?: number // Confidence score (0-1)
  }
  invalidReason?: string // Why validation failed
  suggestions?: string[] // Suggestions for correction
}
```

**Built-in Validators:**

- `nhsNumberValidator` - UK NHS number (format + modulus 11 checksum)
- `emailValidator` - Email format validation with optional DNS check
- `phoneValidator` - Phone number validation using libphonenumber-js
- `ssnValidator` - US Social Security Number validation
- `ninoValidator` - UK National Insurance Number validation

### Lookup Services

Lookup services fetch additional data from external sources to enrich records before matching.

```typescript
interface LookupService extends ServicePlugin<LookupInput, LookupOutput> {
  type: 'lookup'
}

interface LookupInput {
  keyFields: Record<string, unknown> // Fields to use as lookup key
  requestedFields?: string[] // Fields to retrieve
}

interface LookupOutput {
  found: boolean // Whether a record was found
  data?: Record<string, unknown> // Retrieved data
  matchQuality?: 'exact' | 'partial' | 'fuzzy'
  source?: {
    system: string
    recordId?: string
    lastUpdated?: Date
  }
}
```

**Built-in Lookup Services:**

- `createAddressStandardization()` - Address standardization via external API
- `createEmailEnrichment()` - Email data enrichment (name, company, etc.)
- `createPhoneCarrierLookup()` - Phone carrier and line type lookup
- `createMockLookup()` - Configurable mock service for testing

### Custom Services

Custom services perform arbitrary processing such as fraud detection, risk scoring, or custom business rules.

```typescript
interface CustomService extends ServicePlugin<CustomInput, CustomOutput> {
  type: 'custom'
}

interface CustomInput {
  record: Record<string, unknown> // Complete record
  params?: Record<string, unknown> // Custom parameters
}

interface CustomOutput {
  result: unknown // Service-specific result
  proceed: boolean // Whether to continue processing
  scoreAdjustment?: number // Score adjustment
  flags?: string[] // Flags to add
}
```

## Builder API

The fluent builder API configures external services:

### ServiceBuilder

```typescript
const config = createServiceBuilder<MyRecord>()
  .defaultTimeout(5000)           // Default timeout for all services
  .defaultRetry({ ... })          // Default retry configuration
  .defaultCache({ ... })          // Default cache configuration
  .caching(true)                  // Enable/disable caching globally
  .executionOrder(['svc1', 'svc2']) // Explicit execution order
  .validate('field')...
  .lookup('field')...
  .custom('name')...
  .build()
```

### ValidationServiceBuilder

```typescript
.validate('nhsNumber')
  .using(nhsNumberValidator)      // The validator plugin
  .onInvalid('reject')            // 'reject' | 'continue' | 'flag'
  .onFailure('continue')          // Behavior if service fails
  .timeout(3000)                  // Service-specific timeout
  .retry({ maxAttempts: 2, ... }) // Service-specific retry
  .cache({ enabled: true, ttlSeconds: 3600 })
  .required(true)                 // Is this validation required?
  .priority(10)                   // Lower = earlier execution
```

### LookupServiceBuilder

```typescript
.lookup('address')
  .using(addressStandardization)  // The lookup plugin
  .mapFields({                    // Map external fields to schema
    'streetAddress': 'address.street',
    'city': 'address.city'
  })
  .withFields('postcode')         // Additional key fields
  .onNotFound('continue')         // 'continue' | 'flag'
  .onFailure('continue')          // Behavior if service fails
  .timeout(5000)
  .cache({ enabled: true, ttlSeconds: 300 })
```

### CustomServiceBuilder

```typescript
.custom('fraudCheck')
  .using(fraudDetectionService)   // The custom plugin
  .params({ riskThreshold: 0.7 }) // Custom parameters
  .executeAt('post-match')        // 'pre-match' | 'post-match' | 'both'
  .onResult(r => r.result.riskScore < 0.7) // Predicate for proceed
  .onFailure('flag')
  .timeout(10000)
```

## Behavior Configuration

### On Invalid (Validation)

Controls what happens when validation fails:

| Value        | Behavior                                 |
| ------------ | ---------------------------------------- |
| `'reject'`   | Stop processing, return rejection result |
| `'continue'` | Continue processing, ignore invalid      |
| `'flag'`     | Continue processing, add flag to result  |

### On Not Found (Lookup)

Controls what happens when lookup returns no results:

| Value        | Behavior                                |
| ------------ | --------------------------------------- |
| `'continue'` | Continue processing without enrichment  |
| `'flag'`     | Continue processing, add flag to result |

### On Failure (All Services)

Controls what happens when a service call fails:

| Value        | Behavior                                |
| ------------ | --------------------------------------- |
| `'reject'`   | Stop processing if service is required  |
| `'continue'` | Continue processing, ignore failure     |
| `'flag'`     | Continue processing, add flag to result |

## Execution Flow

```
┌─────────────────────────────────────────────────────────────┐
│                        Input Record                          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Pre-Match Services                        │
│  1. Validation services (verify identifiers)                │
│  2. Lookup services (enrich record)                         │
│  3. Custom services marked 'pre-match'                      │
└─────────────────────────────────────────────────────────────┘
                              │
                   (enriched record)
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      Matching Engine                         │
│  Compare against candidates using configured strategies     │
└─────────────────────────────────────────────────────────────┘
                              │
                      (match results)
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Post-Match Services                        │
│  1. Custom services marked 'post-match'                     │
│  2. Score adjustments applied                               │
│  3. Additional flags added                                   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     Resolution Result                        │
│  - outcome: match/no-match/potential-match/rejected         │
│  - matches: matched records with scores                     │
│  - serviceResults: results from each service                │
│  - enrichedRecord: record after lookup enrichment           │
│  - serviceFlags: flags accumulated from services            │
└─────────────────────────────────────────────────────────────┘
```

## Service Results

Service results are included in the resolution result:

```typescript
interface ResolutionResult<T> {
  outcome: 'match' | 'no-match' | 'potential-match' | 'rejected'
  matches?: MatchCandidate<T>[]

  // Service integration
  serviceResults?: Record<string, ServiceResult> // Results by service name
  enrichedRecord?: T // Record after enrichment
  serviceFlags?: string[] // Accumulated flags
}

interface ServiceResult<T = unknown> {
  success: boolean
  data?: T // Result data (if success)
  error?: ServiceErrorInfo // Error info (if failure)
  timing: {
    startedAt: Date
    completedAt: Date
    durationMs: number
  }
  cached: boolean // Whether result was from cache
  retryAttempts?: number // Number of retry attempts
  metadata?: Record<string, unknown>
}
```

## Best Practices

### Order Validation Before Lookups

Validation should typically run before lookups to avoid unnecessary external calls:

```typescript
.validate('nhsNumber')
  .using(nhsNumberValidator)
  .onInvalid('reject')
  .priority(1)              // Run first
.lookup('nhsNumber')
  .using(nhsSpineLookup)
  .priority(10)             // Run after validation
```

### Use Caching for Deterministic Services

Validation results are typically deterministic and can be cached:

```typescript
.validate('email')
  .using(emailValidator)
  .cache({ enabled: true, ttlSeconds: 86400 }) // Cache for 24 hours
```

### Configure Appropriate Timeouts

Different services need different timeouts:

```typescript
.defaultTimeout(5000)         // Reasonable default
.validate('nhsNumber')
  .using(nhsNumberValidator)
  .timeout(100)               // Local validation is fast
.lookup('address')
  .using(addressStandardization)
  .timeout(10000)             // External APIs may be slower
```

### Handle Failures Gracefully

Configure failure behavior based on business requirements:

```typescript
// Critical validation - must succeed
.validate('nhsNumber')
  .onInvalid('reject')
  .onFailure('reject')
  .required(true)

// Optional enrichment - continue if unavailable
.lookup('address')
  .onNotFound('continue')
  .onFailure('flag')
  .required(false)
```

## Error Handling

Service errors are categorized for appropriate handling:

| Error Type                    | Description                | Retryable |
| ----------------------------- | -------------------------- | --------- |
| `ServiceTimeoutError`         | Operation timed out        | Yes       |
| `ServiceNetworkError`         | Network connectivity issue | Yes       |
| `ServiceServerError`          | Server returned 5xx error  | Yes       |
| `ServiceInputValidationError` | Invalid input to service   | No        |
| `ServiceNotFoundError`        | Lookup returned no results | No        |
| `ServiceRejectedError`        | Service rejected request   | No        |
| `ServiceUnavailableError`     | Circuit breaker is open    | No        |

```typescript
import { isRetryableError, ServiceTimeoutError } from 'have-we-met/services'

try {
  const result = await executor.executePreMatch(record)
} catch (error) {
  if (isRetryableError(error)) {
    // Could retry later
  }
  if (error instanceof ServiceTimeoutError) {
    console.log(
      `Service ${error.serviceName} timed out after ${error.timeoutMs}ms`
    )
  }
}
```

## See Also

- [Service Plugins Guide](./service-plugins.md) - Creating custom service plugins
- [Built-in Services](./built-in-services.md) - Reference for all built-in services
- [Service Resilience](./service-resilience.md) - Timeout, retry, and circuit breaker patterns
