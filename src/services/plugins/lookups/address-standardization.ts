/**
 * Address Standardization Lookup Service
 * Provides standardized/normalized addresses from external APIs
 * @module services/plugins/lookups/address-standardization
 */

import type {
  LookupService,
  LookupInput,
  LookupOutput,
  LookupMatchQuality,
  ServiceResult,
  ServiceContext,
  HealthCheckResult,
} from '../../types.js'
import { ServiceNetworkError, ServiceServerError } from '../../service-error.js'

/**
 * Supported address standardization providers
 */
export type AddressProvider = 'usps' | 'google' | 'loqate' | 'custom'

/**
 * Standardized address components
 */
export interface StandardizedAddress {
  /** Street address line 1 */
  streetAddress1?: string

  /** Street address line 2 (apartment, suite, etc.) */
  streetAddress2?: string

  /** City name */
  city?: string

  /** State/Province/Region */
  state?: string

  /** Postal/ZIP code */
  postalCode?: string

  /** Country code (ISO 3166-1 alpha-2) */
  countryCode?: string

  /** Country name */
  countryName?: string

  /** Latitude (if geocoded) */
  latitude?: number

  /** Longitude (if geocoded) */
  longitude?: number

  /** Delivery point barcode (USPS) */
  deliveryPointBarcode?: string

  /** Plus4 code (USPS) */
  plus4Code?: string
}

/**
 * Provider response interface
 */
export interface AddressProviderResponse {
  /** Whether an address was found */
  found: boolean

  /** Standardized address components */
  standardized?: StandardizedAddress

  /** Confidence score (0-1) */
  confidence?: number

  /** Provider-specific record ID */
  id?: string

  /** Provider-specific metadata */
  metadata?: Record<string, unknown>
}

/**
 * Custom provider function type
 */
export type CustomAddressProvider = (
  address: string,
  signal?: AbortSignal
) => Promise<AddressProviderResponse>

/**
 * Configuration for the address standardization service
 */
export interface AddressStandardizationConfig {
  /** Provider to use */
  provider: AddressProvider

  /** API key (required for most providers) */
  apiKey?: string

  /** Custom API endpoint */
  apiEndpoint?: string

  /** Custom provider function (when provider is 'custom') */
  customProvider?: CustomAddressProvider

  /** Field mapping from standardized address to schema fields */
  fieldMapping?: Record<string, string>

  /** Default country code for address lookups */
  defaultCountryCode?: string

  /** Request timeout in milliseconds */
  requestTimeoutMs?: number
}

/**
 * Default configuration
 */
export const DEFAULT_ADDRESS_CONFIG: Partial<AddressStandardizationConfig> = {
  provider: 'custom',
  defaultCountryCode: 'US',
  requestTimeoutMs: 5000,
}

/**
 * Build address string from input key fields
 */
export function buildAddressString(keyFields: Record<string, unknown>): string {
  const parts: string[] = []

  const streetFields = [
    'streetAddress',
    'street',
    'address',
    'addressLine1',
    'streetAddress1',
  ]
  const street2Fields = [
    'streetAddress2',
    'addressLine2',
    'apartment',
    'unit',
    'suite',
  ]
  const cityFields = ['city', 'locality', 'town']
  const stateFields = ['state', 'province', 'region', 'administrativeArea']
  const postalFields = ['postalCode', 'zipCode', 'postcode', 'zip']
  const countryFields = ['country', 'countryCode', 'countryName']

  const findField = (fields: string[]): string | undefined => {
    for (const field of fields) {
      const value = keyFields[field]
      if (value !== undefined && value !== null && value !== '') {
        return String(value)
      }
    }
    return undefined
  }

  const street = findField(streetFields)
  const street2 = findField(street2Fields)
  const city = findField(cityFields)
  const state = findField(stateFields)
  const postal = findField(postalFields)
  const country = findField(countryFields)

  if (street) parts.push(street)
  if (street2) parts.push(street2)
  if (city) parts.push(city)
  if (state) parts.push(state)
  if (postal) parts.push(postal)
  if (country) parts.push(country)

  return parts.join(', ')
}

/**
 * Map standardized address fields to schema fields
 */
export function mapAddressFields(
  standardized: StandardizedAddress,
  fieldMapping: Record<string, string>
): Record<string, unknown> {
  const result: Record<string, unknown> = {}

  for (const [sourceField, targetField] of Object.entries(fieldMapping)) {
    const value = standardized[sourceField as keyof StandardizedAddress]
    if (value !== undefined) {
      result[targetField] = value
    }
  }

  return result
}

/**
 * Determine match quality from confidence score
 */
export function determineMatchQuality(confidence?: number): LookupMatchQuality {
  if (confidence === undefined) return 'partial'
  if (confidence >= 0.9) return 'exact'
  if (confidence >= 0.7) return 'partial'
  return 'fuzzy'
}

/**
 * Creates a successful service result
 */
function createSuccessResult(
  data: LookupOutput,
  startedAt: Date,
  cached: boolean = false
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
    cached,
  }
}

/**
 * Creates a failure service result
 */
function createFailureResult(
  error: Error,
  startedAt: Date
): ServiceResult<LookupOutput> {
  const completedAt = new Date()
  return {
    success: false,
    error: {
      code: error.name,
      message: error.message,
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

/**
 * Mock provider for testing and development
 * Returns a partially standardized address based on input
 */
export function createMockAddressProvider(): CustomAddressProvider {
  return async (address: string): Promise<AddressProviderResponse> => {
    // Simulate network latency
    await new Promise((resolve) => setTimeout(resolve, 10))

    // Parse the address string to extract components
    const parts = address.split(',').map((p) => p.trim())

    if (parts.length === 0 || !parts[0]) {
      return { found: false }
    }

    const standardized: StandardizedAddress = {
      streetAddress1: parts[0] || undefined,
      city: parts[1] || undefined,
      state: parts[2] || undefined,
      postalCode: parts[3] || undefined,
      countryCode: parts[4] || 'US',
    }

    return {
      found: true,
      standardized,
      confidence: 0.85,
      id: `mock-${Date.now()}`,
      metadata: { provider: 'mock' },
    }
  }
}

/**
 * Address Standardization Lookup Service
 *
 * Standardizes addresses using external APIs (USPS, Google, Loqate, or custom).
 * Useful for normalizing addresses before identity matching.
 *
 * @example
 * ```typescript
 * const service = createAddressStandardization({
 *   provider: 'custom',
 *   customProvider: myAddressApi,
 *   fieldMapping: {
 *     'streetAddress1': 'address.street',
 *     'city': 'address.city',
 *     'postalCode': 'address.zip'
 *   }
 * })
 *
 * const result = await service.execute({
 *   keyFields: {
 *     street: '123 Main St',
 *     city: 'Springfield',
 *     state: 'IL',
 *     zip: '62701'
 *   }
 * }, context)
 * ```
 */
export function createAddressStandardization(
  config: AddressStandardizationConfig
): LookupService {
  const mergedConfig = { ...DEFAULT_ADDRESS_CONFIG, ...config }
  const serviceName = `address-standardization-${mergedConfig.provider}`

  // Validate config
  if (mergedConfig.provider === 'custom' && !mergedConfig.customProvider) {
    throw new Error('Custom provider requires customProvider function')
  }

  if (mergedConfig.provider !== 'custom' && !mergedConfig.apiKey) {
    throw new Error(`Provider '${mergedConfig.provider}' requires apiKey`)
  }

  const executeProvider = async (
    address: string,
    signal?: AbortSignal
  ): Promise<AddressProviderResponse> => {
    switch (mergedConfig.provider) {
      case 'custom':
        return mergedConfig.customProvider!(address, signal)

      case 'usps':
      case 'google':
      case 'loqate':
        // For now, these providers require custom implementation
        // The interface is ready for real API integration
        throw new ServiceNetworkError(
          serviceName,
          `Provider '${mergedConfig.provider}' requires custom implementation. Use 'custom' provider with customProvider function.`
        )

      default:
        throw new Error(`Unknown provider: ${mergedConfig.provider}`)
    }
  }

  return {
    name: serviceName,
    type: 'lookup',
    description: `Standardizes addresses using ${mergedConfig.provider} provider`,

    async execute(
      input: LookupInput,
      context: ServiceContext
    ): Promise<ServiceResult<LookupOutput>> {
      const startedAt = new Date()

      try {
        const address = buildAddressString(input.keyFields)

        if (!address) {
          return createSuccessResult(
            {
              found: false,
            },
            startedAt
          )
        }

        const response = await executeProvider(address, context.signal)

        if (!response.found || !response.standardized) {
          return createSuccessResult(
            {
              found: false,
            },
            startedAt
          )
        }

        // Map fields if mapping is provided
        let data: Record<string, unknown>
        if (mergedConfig.fieldMapping) {
          data = mapAddressFields(
            response.standardized,
            mergedConfig.fieldMapping
          )
        } else {
          // Return raw standardized address
          data = response.standardized as Record<string, unknown>
        }

        return createSuccessResult(
          {
            found: true,
            data,
            matchQuality: determineMatchQuality(response.confidence),
            source: {
              system: mergedConfig.provider,
              recordId: response.id,
            },
          },
          startedAt
        )
      } catch (error) {
        if (
          error instanceof ServiceNetworkError ||
          error instanceof ServiceServerError
        ) {
          return createFailureResult(error, startedAt)
        }

        return createFailureResult(
          new ServiceNetworkError(
            serviceName,
            error instanceof Error ? error.message : String(error)
          ),
          startedAt
        )
      }
    },

    async healthCheck(): Promise<HealthCheckResult> {
      const startedAt = new Date()

      try {
        // Test with a sample address
        const testAddress = '1600 Pennsylvania Avenue NW, Washington, DC 20500'
        const response = await executeProvider(testAddress)

        const completedAt = new Date()
        return {
          healthy: true,
          responseTimeMs: completedAt.getTime() - startedAt.getTime(),
          checkedAt: completedAt,
          details: {
            provider: mergedConfig.provider,
            testResult: response.found ? 'found' : 'not_found',
          },
        }
      } catch (error) {
        return {
          healthy: false,
          reason: error instanceof Error ? error.message : String(error),
          checkedAt: new Date(),
          details: {
            provider: mergedConfig.provider,
          },
        }
      }
    },
  }
}

/**
 * Pre-configured address standardization with mock provider (for testing)
 */
export const mockAddressStandardization = createAddressStandardization({
  provider: 'custom',
  customProvider: createMockAddressProvider(),
})
