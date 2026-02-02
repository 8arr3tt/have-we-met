/**
 * Phone Carrier Lookup Service
 * Provides carrier information and line type for phone numbers
 * @module services/plugins/lookups/phone-carrier-lookup
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
 * Supported phone carrier lookup providers
 */
export type PhoneCarrierProvider = 'twilio' | 'plivo' | 'numverify' | 'custom'

/**
 * Phone number line type
 */
export type PhoneLineType =
  | 'mobile'
  | 'landline'
  | 'voip'
  | 'toll_free'
  | 'premium'
  | 'unknown'

/**
 * Phone number portability status
 */
export type PortabilityStatus = 'ported' | 'not_ported' | 'unknown'

/**
 * Carrier lookup result data
 */
export interface CarrierLookupData {
  /** Phone number in E.164 format */
  phoneNumber?: string

  /** Carrier/network information */
  carrier?: {
    /** Carrier name */
    name?: string

    /** Carrier code/ID */
    code?: string

    /** Mobile country code */
    mcc?: string

    /** Mobile network code */
    mnc?: string

    /** Carrier type (mobile, landline, etc.) */
    type?: PhoneLineType
  }

  /** Line type */
  lineType?: PhoneLineType

  /** Portability status */
  portabilityStatus?: PortabilityStatus

  /** Original carrier (before porting) */
  originalCarrier?: string

  /** Geographic information */
  geographic?: {
    /** Country code (ISO 3166-1 alpha-2) */
    countryCode?: string

    /** Country name */
    countryName?: string

    /** Region/state */
    region?: string

    /** City */
    city?: string

    /** Timezone */
    timezone?: string

    /** Calling code (e.g., +1, +44) */
    callingCode?: string
  }

  /** Validity information */
  validity?: {
    /** Is the number valid */
    isValid?: boolean

    /** Is the number reachable */
    isReachable?: boolean

    /** Number format is correct */
    isFormatValid?: boolean
  }
}

/**
 * Provider response interface
 */
export interface CarrierLookupResponse {
  /** Whether data was found */
  found: boolean

  /** Lookup data */
  data?: CarrierLookupData

  /** Confidence score (0-1) */
  confidence?: number

  /** Provider-specific lookup ID */
  id?: string

  /** Cost of this lookup (in provider's currency) */
  cost?: number

  /** Provider-specific metadata */
  metadata?: Record<string, unknown>
}

/**
 * Custom provider function type
 */
export type CustomCarrierProvider = (
  phoneNumber: string,
  signal?: AbortSignal
) => Promise<CarrierLookupResponse>

/**
 * Configuration for the phone carrier lookup service
 */
export interface PhoneCarrierLookupConfig {
  /** Provider to use */
  provider: PhoneCarrierProvider

  /** API key (required for most providers) */
  apiKey?: string

  /** API secret/token (for providers that require it) */
  apiSecret?: string

  /** Custom API endpoint */
  apiEndpoint?: string

  /** Custom provider function (when provider is 'custom') */
  customProvider?: CustomCarrierProvider

  /** Field mapping from lookup data to schema fields */
  fieldMapping?: Record<string, string>

  /** Default country code for parsing phone numbers */
  defaultCountryCode?: string

  /** Request timeout in milliseconds */
  requestTimeoutMs?: number

  /** Include geographic information */
  includeGeographic?: boolean

  /** Include portability information */
  includePortability?: boolean
}

/**
 * Default configuration
 */
export const DEFAULT_CARRIER_CONFIG: Partial<PhoneCarrierLookupConfig> = {
  provider: 'custom',
  defaultCountryCode: 'US',
  requestTimeoutMs: 5000,
  includeGeographic: true,
  includePortability: true,
}

/**
 * Extract phone number from key fields
 */
export function extractPhoneNumber(
  keyFields: Record<string, unknown>
): string | undefined {
  const phoneFields = [
    'phone',
    'phoneNumber',
    'mobile',
    'telephone',
    'tel',
    'cell',
    'primaryPhone',
  ]

  for (const field of phoneFields) {
    const value = keyFields[field]
    if (value !== undefined && value !== null && value !== '') {
      return normalizePhoneNumber(String(value))
    }
  }

  return undefined
}

/**
 * Normalize phone number (remove non-digit characters except +)
 */
export function normalizePhoneNumber(phone: string): string {
  // Keep only digits and leading +
  const hasPlus = phone.startsWith('+')
  const digits = phone.replace(/\D/g, '')

  if (hasPlus && digits.length >= 10) {
    return `+${digits}`
  }

  return digits
}

/**
 * Flatten carrier lookup data for field mapping
 */
export function flattenCarrierData(
  data: CarrierLookupData
): Record<string, unknown> {
  const flat: Record<string, unknown> = {}

  if (data.phoneNumber) flat.phoneNumber = data.phoneNumber
  if (data.lineType) flat.lineType = data.lineType
  if (data.portabilityStatus) flat.portabilityStatus = data.portabilityStatus
  if (data.originalCarrier) flat.originalCarrier = data.originalCarrier

  if (data.carrier) {
    flat['carrier.name'] = data.carrier.name
    flat['carrier.code'] = data.carrier.code
    flat['carrier.mcc'] = data.carrier.mcc
    flat['carrier.mnc'] = data.carrier.mnc
    flat['carrier.type'] = data.carrier.type
  }

  if (data.geographic) {
    flat['geographic.countryCode'] = data.geographic.countryCode
    flat['geographic.countryName'] = data.geographic.countryName
    flat['geographic.region'] = data.geographic.region
    flat['geographic.city'] = data.geographic.city
    flat['geographic.timezone'] = data.geographic.timezone
    flat['geographic.callingCode'] = data.geographic.callingCode
  }

  if (data.validity) {
    flat['validity.isValid'] = data.validity.isValid
    flat['validity.isReachable'] = data.validity.isReachable
    flat['validity.isFormatValid'] = data.validity.isFormatValid
  }

  // Remove undefined values
  return Object.fromEntries(
    Object.entries(flat).filter(([_, v]) => v !== undefined)
  )
}

/**
 * Map carrier data fields to schema fields
 */
export function mapCarrierFields(
  data: CarrierLookupData,
  fieldMapping: Record<string, string>
): Record<string, unknown> {
  const flat = flattenCarrierData(data)
  const result: Record<string, unknown> = {}

  for (const [sourceField, targetField] of Object.entries(fieldMapping)) {
    const value = flat[sourceField]
    if (value !== undefined) {
      result[targetField] = value
    }
  }

  return result
}

/**
 * Determine match quality from confidence score
 */
function determineMatchQuality(confidence?: number): LookupMatchQuality {
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
  cached: boolean = false,
  metadata?: Record<string, unknown>
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
    metadata,
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
 * Mock carrier data for common US carriers
 */
const MOCK_US_CARRIERS: Record<string, { name: string; type: PhoneLineType }> =
  {
    '1200': { name: 'Verizon Wireless', type: 'mobile' },
    '1201': { name: 'AT&T Mobility', type: 'mobile' },
    '1202': { name: 'T-Mobile US', type: 'mobile' },
    '1203': { name: 'US Cellular', type: 'mobile' },
    '1204': { name: 'Comcast', type: 'landline' },
    '1205': { name: 'Google Voice', type: 'voip' },
    '1800': { name: 'Toll Free', type: 'toll_free' },
    '1888': { name: 'Toll Free', type: 'toll_free' },
    '1877': { name: 'Toll Free', type: 'toll_free' },
    '1866': { name: 'Toll Free', type: 'toll_free' },
  }

/**
 * Mock provider for testing and development
 */
export function createMockCarrierProvider(): CustomCarrierProvider {
  return async (phoneNumber: string): Promise<CarrierLookupResponse> => {
    // Simulate network latency
    await new Promise((resolve) => setTimeout(resolve, 10))

    const normalized = normalizePhoneNumber(phoneNumber)

    if (normalized.length < 10) {
      return { found: false }
    }

    // Determine carrier from area code (mock logic)
    const areaCode = normalized.slice(-10, -7)
    const prefix = normalized.slice(-10, -6)

    // Check for toll-free
    const tollFreeKey = `1${areaCode}`
    if (MOCK_US_CARRIERS[tollFreeKey]?.type === 'toll_free') {
      return {
        found: true,
        data: {
          phoneNumber: normalized.startsWith('+')
            ? normalized
            : `+1${normalized}`,
          carrier: {
            name: 'Toll Free',
            type: 'toll_free',
          },
          lineType: 'toll_free',
          geographic: {
            countryCode: 'US',
            countryName: 'United States',
            callingCode: '+1',
          },
          validity: {
            isValid: true,
            isFormatValid: true,
          },
        },
        confidence: 0.95,
        id: `mock-${Date.now()}`,
      }
    }

    // Simulate carrier based on prefix hash
    const prefixNum = parseInt(prefix, 10) || 0
    const carrierKeys = Object.keys(MOCK_US_CARRIERS).filter(
      (k) => MOCK_US_CARRIERS[k].type !== 'toll_free'
    )
    const carrierKey = carrierKeys[prefixNum % carrierKeys.length]
    const carrier = MOCK_US_CARRIERS[carrierKey]

    // Determine if likely mobile based on area code patterns
    const isMobile = prefixNum % 3 !== 0

    const data: CarrierLookupData = {
      phoneNumber: normalized.startsWith('+') ? normalized : `+1${normalized}`,
      carrier: {
        name: carrier?.name || 'Unknown Carrier',
        type: isMobile ? 'mobile' : 'landline',
      },
      lineType: isMobile ? 'mobile' : 'landline',
      portabilityStatus: prefixNum % 5 === 0 ? 'ported' : 'not_ported',
      geographic: {
        countryCode: 'US',
        countryName: 'United States',
        region: 'Unknown',
        callingCode: '+1',
      },
      validity: {
        isValid: true,
        isFormatValid: true,
        isReachable: true,
      },
    }

    return {
      found: true,
      data,
      confidence: 0.85,
      id: `mock-${Date.now()}`,
      metadata: { provider: 'mock' },
    }
  }
}

/**
 * Phone Carrier Lookup Service
 *
 * Looks up carrier information for phone numbers using external APIs.
 * Useful for identifying line type (mobile vs landline) for SMS verification.
 *
 * @example
 * ```typescript
 * const service = createPhoneCarrierLookup({
 *   provider: 'custom',
 *   customProvider: myCarrierApi,
 *   fieldMapping: {
 *     'carrier.name': 'phone.carrier',
 *     'lineType': 'phone.type',
 *     'geographic.countryCode': 'phone.country'
 *   }
 * })
 *
 * const result = await service.execute({
 *   keyFields: { phone: '+14155551234' }
 * }, context)
 * ```
 */
export function createPhoneCarrierLookup(
  config: PhoneCarrierLookupConfig
): LookupService {
  const mergedConfig = { ...DEFAULT_CARRIER_CONFIG, ...config }
  const serviceName = `phone-carrier-lookup-${mergedConfig.provider}`

  // Validate config
  if (mergedConfig.provider === 'custom' && !mergedConfig.customProvider) {
    throw new Error('Custom provider requires customProvider function')
  }

  if (mergedConfig.provider !== 'custom' && !mergedConfig.apiKey) {
    throw new Error(`Provider '${mergedConfig.provider}' requires apiKey`)
  }

  const executeProvider = async (
    phoneNumber: string,
    signal?: AbortSignal
  ): Promise<CarrierLookupResponse> => {
    switch (mergedConfig.provider) {
      case 'custom':
        return mergedConfig.customProvider!(phoneNumber, signal)

      case 'twilio':
      case 'plivo':
      case 'numverify':
        // For now, these providers require custom implementation
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
    description: `Looks up phone carrier information using ${mergedConfig.provider} provider`,

    async execute(
      input: LookupInput,
      context: ServiceContext
    ): Promise<ServiceResult<LookupOutput>> {
      const startedAt = new Date()

      try {
        const phoneNumber = extractPhoneNumber(input.keyFields)

        if (!phoneNumber) {
          return createSuccessResult(
            {
              found: false,
            },
            startedAt
          )
        }

        const response = await executeProvider(phoneNumber, context.signal)

        if (!response.found || !response.data) {
          return createSuccessResult(
            {
              found: false,
            },
            startedAt
          )
        }

        // Filter data based on config
        const lookupData = { ...response.data }
        if (!mergedConfig.includeGeographic) {
          delete lookupData.geographic
        }
        if (!mergedConfig.includePortability) {
          delete lookupData.portabilityStatus
          delete lookupData.originalCarrier
        }

        // Map fields if mapping is provided
        let data: Record<string, unknown>
        if (mergedConfig.fieldMapping) {
          data = mapCarrierFields(lookupData, mergedConfig.fieldMapping)
        } else {
          // Return flattened carrier data
          data = flattenCarrierData(lookupData)
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
          startedAt,
          false,
          response.cost !== undefined ? { cost: response.cost } : undefined
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
        // Test with a sample phone number
        const testNumber = '+14155551234'
        const response = await executeProvider(testNumber)

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
 * Pre-configured phone carrier lookup with mock provider (for testing)
 */
export const mockPhoneCarrierLookup = createPhoneCarrierLookup({
  provider: 'custom',
  customProvider: createMockCarrierProvider(),
})
