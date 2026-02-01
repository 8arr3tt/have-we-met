# Creating Service Plugins

This guide covers how to create custom service plugins for the external services system. Service plugins allow you to integrate with third-party APIs, implement custom validation logic, or add specialized processing to the resolution workflow.

## Plugin Interface

All service plugins implement the `ServicePlugin` interface:

```typescript
interface ServicePlugin<TInput = unknown, TOutput = unknown> {
  name: string              // Unique identifier
  type: ServiceType         // 'validation' | 'lookup' | 'custom'
  description?: string      // Human-readable description

  execute(input: TInput, context: ServiceContext): Promise<ServiceResult<TOutput>>

  healthCheck?(): Promise<HealthCheckResult>
  dispose?(): Promise<void>
}
```

The `execute` method is the core of your plugin. It receives input and context, performs the operation, and returns a `ServiceResult`.

## Service Context

Every service execution receives a context object:

```typescript
interface ServiceContext {
  record: Record<string, unknown>   // The record being processed
  config: ResolverConfig            // Resolver configuration
  metadata: RequestMetadata         // Correlation ID, timestamps
  cache?: ServiceCache              // Cache interface
  logger?: Logger                   // Logging interface
  signal?: AbortSignal              // For cancellation
  matchResult?: MatchResult         // Only for post-match services
}
```

## Creating a Validation Service

Validation services verify identifier values and return validity information.

### Basic Structure

```typescript
import type {
  ValidationService,
  ValidationInput,
  ValidationOutput,
  ValidationCheck,
  ServiceResult,
  ServiceContext,
} from 'have-we-met/services'

const myValidator: ValidationService = {
  name: 'my-validator',
  type: 'validation',
  description: 'Validates my custom identifier',

  async execute(
    input: ValidationInput,
    context: ServiceContext
  ): Promise<ServiceResult<ValidationOutput>> {
    const startedAt = new Date()
    const { field, value } = input
    const checks: ValidationCheck[] = []

    // Normalize the value
    const normalized = normalizeValue(value)

    // Perform validation checks
    const formatValid = checkFormat(normalized)
    checks.push({
      name: 'format',
      passed: formatValid,
      message: formatValid ? 'Valid format' : 'Invalid format',
    })

    if (!formatValid) {
      return createResult({
        valid: false,
        details: { checks },
        invalidReason: 'Invalid format',
        suggestions: ['Check the format requirements'],
      }, startedAt)
    }

    // Additional checks...
    const checksumValid = validateChecksum(normalized)
    checks.push({
      name: 'checksum',
      passed: checksumValid,
      message: checksumValid ? 'Valid checksum' : 'Invalid checksum',
    })

    return createResult({
      valid: checksumValid,
      details: {
        checks,
        normalizedValue: normalized,
        confidence: checksumValid ? 1.0 : 0,
      },
      invalidReason: checksumValid ? undefined : 'Invalid checksum',
    }, startedAt)
  },

  async healthCheck() {
    const startedAt = new Date()
    // Test with a known valid value
    const testPassed = validateChecksum('known-valid-value')
    return {
      healthy: testPassed,
      responseTimeMs: Date.now() - startedAt.getTime(),
      checkedAt: new Date(),
    }
  },
}

function createResult(
  data: ValidationOutput,
  startedAt: Date
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
    cached: false,
  }
}
```

### Real-World Example: Credit Card Validator

```typescript
import type {
  ValidationService,
  ValidationInput,
  ValidationOutput,
  ValidationCheck,
  ServiceResult,
  ServiceContext,
} from 'have-we-met/services'

export interface CreditCardValidatorOptions {
  name?: string
  allowedNetworks?: ('visa' | 'mastercard' | 'amex' | 'discover')[]
}

export function createCreditCardValidator(
  options: CreditCardValidatorOptions = {}
): ValidationService {
  const allowedNetworks = options.allowedNetworks ?? ['visa', 'mastercard', 'amex', 'discover']

  return {
    name: options.name ?? 'credit-card-validator',
    type: 'validation',
    description: 'Validates credit card numbers using Luhn algorithm',

    async execute(input: ValidationInput, _context: ServiceContext) {
      const startedAt = new Date()
      const { value } = input
      const checks: ValidationCheck[] = []

      // Normalize: remove spaces and dashes
      const normalized = String(value ?? '').replace(/[\s\-]/g, '')

      // Check for digits only
      const digitsOnly = /^\d+$/.test(normalized)
      checks.push({
        name: 'digits',
        passed: digitsOnly,
        message: digitsOnly ? 'Contains only digits' : 'Must contain only digits',
      })

      if (!digitsOnly) {
        return createSuccessResult({
          valid: false,
          details: { checks },
          invalidReason: 'Card number must contain only digits',
        }, startedAt)
      }

      // Check length (13-19 digits for most cards)
      const validLength = normalized.length >= 13 && normalized.length <= 19
      checks.push({
        name: 'length',
        passed: validLength,
        message: validLength
          ? `Valid length (${normalized.length} digits)`
          : `Invalid length (${normalized.length} digits)`,
      })

      if (!validLength) {
        return createSuccessResult({
          valid: false,
          details: { checks },
          invalidReason: 'Invalid card number length',
        }, startedAt)
      }

      // Detect network
      const network = detectCardNetwork(normalized)
      const networkAllowed = network && allowedNetworks.includes(network)
      checks.push({
        name: 'network',
        passed: networkAllowed,
        message: network
          ? networkAllowed
            ? `Valid network: ${network}`
            : `Network not allowed: ${network}`
          : 'Unknown card network',
      })

      if (!networkAllowed) {
        return createSuccessResult({
          valid: false,
          details: { checks },
          invalidReason: network
            ? `Card network ${network} is not allowed`
            : 'Unknown card network',
        }, startedAt)
      }

      // Luhn checksum
      const luhnValid = validateLuhn(normalized)
      checks.push({
        name: 'luhn',
        passed: luhnValid,
        message: luhnValid ? 'Valid Luhn checksum' : 'Invalid checksum',
      })

      return createSuccessResult({
        valid: luhnValid,
        details: {
          checks,
          normalizedValue: maskCardNumber(normalized),
          confidence: luhnValid ? 1.0 : 0,
        },
        invalidReason: luhnValid ? undefined : 'Invalid card number',
      }, startedAt)
    },
  }
}

function detectCardNetwork(number: string): string | null {
  if (/^4/.test(number)) return 'visa'
  if (/^5[1-5]/.test(number) || /^2[2-7]/.test(number)) return 'mastercard'
  if (/^3[47]/.test(number)) return 'amex'
  if (/^6(?:011|5)/.test(number)) return 'discover'
  return null
}

function validateLuhn(number: string): boolean {
  let sum = 0
  let alternate = false

  for (let i = number.length - 1; i >= 0; i--) {
    let digit = parseInt(number[i], 10)

    if (alternate) {
      digit *= 2
      if (digit > 9) digit -= 9
    }

    sum += digit
    alternate = !alternate
  }

  return sum % 10 === 0
}

function maskCardNumber(number: string): string {
  return number.slice(0, 4) + '*'.repeat(number.length - 8) + number.slice(-4)
}
```

## Creating a Lookup Service

Lookup services fetch additional data from external sources.

### Basic Structure

```typescript
import type {
  LookupService,
  LookupInput,
  LookupOutput,
  ServiceResult,
  ServiceContext,
} from 'have-we-met/services'

const myLookup: LookupService = {
  name: 'my-lookup',
  type: 'lookup',
  description: 'Fetches additional data from external API',

  async execute(
    input: LookupInput,
    context: ServiceContext
  ): Promise<ServiceResult<LookupOutput>> {
    const startedAt = new Date()
    const { keyFields } = input

    try {
      // Call external API
      const response = await callExternalApi(keyFields, context.signal)

      if (!response.found) {
        return createResult({
          found: false,
        }, startedAt)
      }

      return createResult({
        found: true,
        data: response.data,
        matchQuality: response.confidence > 0.9 ? 'exact' : 'partial',
        source: {
          system: 'my-external-api',
          recordId: response.id,
          lastUpdated: new Date(response.updatedAt),
        },
      }, startedAt)
    } catch (error) {
      return createErrorResult(error, startedAt)
    }
  },
}

function createResult(
  data: LookupOutput,
  startedAt: Date
): ServiceResult<LookupOutput> {
  const completedAt = new Date()
  return {
    success: true,
    data,
    timing: {
      startedAt,
      completedAt,
      durationMs: completedAt.getTime() - startedAt.getTime(),
    },
    cached: false,
  }
}

function createErrorResult(
  error: unknown,
  startedAt: Date
): ServiceResult<LookupOutput> {
  const completedAt = new Date()
  return {
    success: false,
    error: {
      code: 'LOOKUP_FAILED',
      message: error instanceof Error ? error.message : String(error),
      type: 'network',
      retryable: true,
    },
    timing: {
      startedAt,
      completedAt,
      durationMs: completedAt.getTime() - startedAt.getTime(),
    },
    cached: false,
  }
}
```

### Real-World Example: Company Registry Lookup

```typescript
import type {
  LookupService,
  LookupInput,
  LookupOutput,
  ServiceResult,
  ServiceContext,
} from 'have-we-met/services'
import { ServiceNetworkError, ServiceNotFoundError } from 'have-we-met/services'

export interface CompanyRegistryConfig {
  apiKey: string
  baseUrl?: string
  country?: string
}

export function createCompanyRegistryLookup(
  config: CompanyRegistryConfig
): LookupService {
  const baseUrl = config.baseUrl ?? 'https://api.companieshouse.gov.uk'

  return {
    name: 'company-registry-lookup',
    type: 'lookup',
    description: 'Fetches company details from official registry',

    async execute(
      input: LookupInput,
      context: ServiceContext
    ): Promise<ServiceResult<LookupOutput>> {
      const startedAt = new Date()
      const companyNumber = input.keyFields.companyNumber as string

      if (!companyNumber) {
        return {
          success: true,
          data: { found: false },
          timing: createTiming(startedAt),
          cached: false,
        }
      }

      try {
        const response = await fetch(
          `${baseUrl}/company/${encodeURIComponent(companyNumber)}`,
          {
            headers: {
              Authorization: `Basic ${btoa(`${config.apiKey}:`)}`,
              Accept: 'application/json',
            },
            signal: context.signal,
          }
        )

        if (response.status === 404) {
          return {
            success: true,
            data: {
              found: false,
            },
            timing: createTiming(startedAt),
            cached: false,
          }
        }

        if (!response.ok) {
          throw new ServiceNetworkError(
            `Registry API returned ${response.status}`,
            response.status
          )
        }

        const company = await response.json()

        return {
          success: true,
          data: {
            found: true,
            data: {
              companyName: company.company_name,
              companyStatus: company.company_status,
              companyType: company.type,
              registeredAddress: formatAddress(company.registered_office_address),
              incorporationDate: company.date_of_creation,
              sicCodes: company.sic_codes,
            },
            matchQuality: 'exact',
            source: {
              system: 'companies-house',
              recordId: company.company_number,
              lastUpdated: new Date(company.last_full_members_list_date),
            },
          },
          timing: createTiming(startedAt),
          cached: false,
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          return {
            success: false,
            error: {
              code: 'TIMEOUT',
              message: 'Request was aborted',
              type: 'timeout',
              retryable: true,
            },
            timing: createTiming(startedAt),
            cached: false,
          }
        }

        return {
          success: false,
          error: {
            code: 'NETWORK_ERROR',
            message: error instanceof Error ? error.message : String(error),
            type: 'network',
            retryable: true,
            cause: error instanceof Error ? error : undefined,
          },
          timing: createTiming(startedAt),
          cached: false,
        }
      }
    },

    async healthCheck() {
      const startedAt = new Date()
      try {
        const response = await fetch(`${baseUrl}/company/00000000`, {
          headers: { Authorization: `Basic ${btoa(`${config.apiKey}:`)}` },
        })
        // 404 is expected for a non-existent company number
        return {
          healthy: response.ok || response.status === 404,
          responseTimeMs: Date.now() - startedAt.getTime(),
          checkedAt: new Date(),
        }
      } catch {
        return {
          healthy: false,
          reason: 'Failed to connect to Companies House API',
          checkedAt: new Date(),
        }
      }
    },
  }
}

function createTiming(startedAt: Date) {
  const completedAt = new Date()
  return {
    startedAt,
    completedAt,
    durationMs: completedAt.getTime() - startedAt.getTime(),
  }
}

function formatAddress(addr: Record<string, string>): string {
  const parts = [
    addr.premises,
    addr.address_line_1,
    addr.address_line_2,
    addr.locality,
    addr.region,
    addr.postal_code,
    addr.country,
  ].filter(Boolean)
  return parts.join(', ')
}
```

## Creating a Custom Service

Custom services perform arbitrary processing such as fraud detection or risk scoring.

### Basic Structure

```typescript
import type {
  CustomService,
  CustomInput,
  CustomOutput,
  ServiceResult,
  ServiceContext,
} from 'have-we-met/services'

const myCustomService: CustomService = {
  name: 'my-custom-service',
  type: 'custom',
  description: 'Performs custom processing',

  async execute(
    input: CustomInput,
    context: ServiceContext
  ): Promise<ServiceResult<CustomOutput>> {
    const startedAt = new Date()
    const { record, params } = input

    // Perform custom processing
    const result = await processRecord(record, params)

    return {
      success: true,
      data: {
        result,
        proceed: result.shouldProceed,
        scoreAdjustment: result.scoreModifier,
        flags: result.flags,
      },
      timing: createTiming(startedAt),
      cached: false,
    }
  },
}
```

### Real-World Example: Fraud Detection Service

```typescript
import type {
  CustomService,
  CustomInput,
  CustomOutput,
  ServiceResult,
  ServiceContext,
} from 'have-we-met/services'

export interface FraudDetectionConfig {
  apiKey: string
  endpoint: string
  riskThreshold?: number
}

export function createFraudDetectionService(
  config: FraudDetectionConfig
): CustomService {
  const riskThreshold = config.riskThreshold ?? 0.7

  return {
    name: 'fraud-detection',
    type: 'custom',
    description: 'Evaluates fraud risk using external ML service',

    async execute(
      input: CustomInput,
      context: ServiceContext
    ): Promise<ServiceResult<CustomOutput>> {
      const startedAt = new Date()
      const { record, params } = input

      try {
        // Extract relevant fields for fraud analysis
        const fraudCheckPayload = {
          email: record.email,
          phone: record.phone,
          ipAddress: params?.ipAddress,
          deviceFingerprint: params?.deviceFingerprint,
          transactionAmount: params?.transactionAmount,
        }

        const response = await fetch(config.endpoint, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(fraudCheckPayload),
          signal: context.signal,
        })

        if (!response.ok) {
          throw new Error(`Fraud API returned ${response.status}`)
        }

        const result = await response.json()
        const riskScore = result.riskScore as number
        const riskLevel = result.riskLevel as string
        const signals = result.signals as string[]

        // Determine flags based on risk signals
        const flags: string[] = []
        if (riskScore > 0.5) flags.push('elevated-risk')
        if (riskScore > 0.8) flags.push('high-risk')
        if (signals.includes('velocity')) flags.push('velocity-alert')
        if (signals.includes('proxy')) flags.push('proxy-detected')

        // Calculate score adjustment (penalize high-risk records)
        const scoreAdjustment = riskScore > riskThreshold
          ? -Math.round((riskScore - riskThreshold) * 20)
          : 0

        return {
          success: true,
          data: {
            result: {
              riskScore,
              riskLevel,
              signals,
              recommendation: riskScore > riskThreshold ? 'review' : 'proceed',
            },
            proceed: riskScore <= riskThreshold,
            scoreAdjustment,
            flags,
          },
          timing: createTiming(startedAt),
          cached: false,
          metadata: {
            riskScore,
            riskLevel,
          },
        }
      } catch (error) {
        context.logger?.error('Fraud detection failed', {
          error: error instanceof Error ? error.message : String(error),
        })

        // On failure, continue but flag for manual review
        return {
          success: false,
          error: {
            code: 'FRAUD_CHECK_FAILED',
            message: error instanceof Error ? error.message : String(error),
            type: 'network',
            retryable: true,
          },
          timing: createTiming(startedAt),
          cached: false,
        }
      }
    },

    async healthCheck() {
      const startedAt = new Date()
      try {
        const response = await fetch(`${config.endpoint}/health`, {
          headers: { Authorization: `Bearer ${config.apiKey}` },
        })
        return {
          healthy: response.ok,
          responseTimeMs: Date.now() - startedAt.getTime(),
          checkedAt: new Date(),
        }
      } catch {
        return {
          healthy: false,
          reason: 'Failed to connect to fraud detection service',
          checkedAt: new Date(),
        }
      }
    },
  }
}

function createTiming(startedAt: Date) {
  const completedAt = new Date()
  return {
    startedAt,
    completedAt,
    durationMs: completedAt.getTime() - startedAt.getTime(),
  }
}
```

## Handling Async Operations

### Using AbortSignal

Always respect the abort signal for cancellation:

```typescript
async execute(input, context) {
  const startedAt = new Date()

  const response = await fetch(url, {
    signal: context.signal, // Pass through abort signal
  })

  // Check if aborted during processing
  if (context.signal?.aborted) {
    return {
      success: false,
      error: {
        code: 'ABORTED',
        message: 'Operation was cancelled',
        type: 'timeout',
        retryable: false,
      },
      timing: createTiming(startedAt),
      cached: false,
    }
  }

  // Continue processing...
}
```

### Using the Logger

Use the provided logger for consistent logging:

```typescript
async execute(input, context) {
  const { logger } = context

  logger?.debug('Starting validation', { field: input.field })

  try {
    const result = await validate(input.value)
    logger?.info('Validation complete', { valid: result.valid })
    return result
  } catch (error) {
    logger?.error('Validation failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}
```

### Using the Cache

Services can use the provided cache interface:

```typescript
async execute(input, context) {
  const { cache } = context

  if (cache) {
    const cacheKey = `myservice:${JSON.stringify(input)}`
    const cached = await cache.get(cacheKey)

    if (cached && !cached.isStale) {
      return {
        success: true,
        data: cached.value,
        timing: { /* ... */ },
        cached: true, // Indicate this was from cache
      }
    }
  }

  // Perform actual operation...
  const result = await doOperation(input)

  if (cache) {
    await cache.set(cacheKey, result, 300) // Cache for 5 minutes
  }

  return {
    success: true,
    data: result,
    timing: { /* ... */ },
    cached: false,
  }
}
```

## Testing Service Plugins

### Unit Testing

```typescript
import { describe, it, expect, vi } from 'vitest'
import { myValidator } from './my-validator'
import { buildServiceContext } from 'have-we-met/services'

describe('myValidator', () => {
  const mockContext = buildServiceContext({
    record: {},
    config: { schema: {}, matchingRules: [], thresholds: { noMatch: 0.3, definiteMatch: 0.9 } },
  })

  it('validates correct values', async () => {
    const result = await myValidator.execute(
      { field: 'myField', value: 'valid-value' },
      mockContext
    )

    expect(result.success).toBe(true)
    expect(result.data?.valid).toBe(true)
    expect(result.data?.details?.normalizedValue).toBe('valid-value')
  })

  it('rejects invalid values', async () => {
    const result = await myValidator.execute(
      { field: 'myField', value: 'invalid' },
      mockContext
    )

    expect(result.success).toBe(true)
    expect(result.data?.valid).toBe(false)
    expect(result.data?.invalidReason).toBeDefined()
  })

  it('includes detailed checks', async () => {
    const result = await myValidator.execute(
      { field: 'myField', value: 'test-value' },
      mockContext
    )

    expect(result.data?.details?.checks).toHaveLength(2)
    expect(result.data?.details?.checks[0]).toHaveProperty('name')
    expect(result.data?.details?.checks[0]).toHaveProperty('passed')
  })

  it('health check returns healthy', async () => {
    const health = await myValidator.healthCheck?.()

    expect(health?.healthy).toBe(true)
    expect(health?.responseTimeMs).toBeDefined()
  })
})
```

### Integration Testing with Mock Services

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createMockLookup, createServiceExecutor } from 'have-we-met/services'

describe('Lookup Integration', () => {
  let executor: ServiceExecutor

  beforeEach(() => {
    const mockLookup = createMockLookup({
      responses: {
        'test-key': { found: true, data: { name: 'Test' } },
      },
      latencyMs: 10,
    })

    executor = createServiceExecutor({
      resolverConfig: { /* ... */ },
    })

    executor.register({
      plugin: mockLookup,
      fields: ['id'],
      executionPoint: 'pre-match',
      onFailure: 'continue',
    })
  })

  afterEach(async () => {
    await executor.dispose()
  })

  it('enriches record with lookup data', async () => {
    const result = await executor.executePreMatch({ id: 'test-key' })

    expect(result.proceed).toBe(true)
    expect(result.enrichedData?.name).toBe('Test')
  })
})
```

## Best Practices

1. **Always return ServiceResult**: Never throw exceptions from `execute()`. Wrap errors in a failure result.

2. **Include timing information**: Track start and end times for performance monitoring.

3. **Normalize input values**: Clean and normalize input before processing.

4. **Provide detailed checks**: For validation services, include individual check results.

5. **Implement health checks**: Allow monitoring of service availability.

6. **Respect abort signals**: Check for cancellation during long operations.

7. **Use appropriate error types**: Set the correct error type for proper retry handling.

8. **Cache when appropriate**: Use the cache interface for deterministic operations.

9. **Log appropriately**: Use debug for detailed info, error for failures.

10. **Clean up resources**: Implement `dispose()` if your service holds resources.

## See Also

- [External Services Overview](./external-services.md) - Introduction to external services
- [Built-in Services](./built-in-services.md) - Reference for included services
- [Service Resilience](./service-resilience.md) - Handling failures gracefully
