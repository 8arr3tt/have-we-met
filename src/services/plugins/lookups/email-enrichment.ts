/**
 * Email Enrichment Lookup Service
 * Provides additional data about email addresses from enrichment APIs
 * @module services/plugins/lookups/email-enrichment
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
 * Supported email enrichment providers
 */
export type EmailEnrichmentProvider = 'clearbit' | 'hunter' | 'fullcontact' | 'custom'

/**
 * Enriched email data
 */
export interface EnrichedEmailData {
  /** Email address that was looked up */
  email?: string

  /** Person information */
  person?: {
    /** Full name */
    fullName?: string

    /** First name */
    firstName?: string

    /** Last name */
    lastName?: string

    /** Avatar/profile photo URL */
    avatar?: string

    /** Job title */
    title?: string

    /** Role (e.g., engineering, marketing) */
    role?: string

    /** Bio/description */
    bio?: string

    /** Location (city, country) */
    location?: string

    /** Timezone */
    timezone?: string
  }

  /** Company information */
  company?: {
    /** Company name */
    name?: string

    /** Company domain */
    domain?: string

    /** Industry */
    industry?: string

    /** Company size range */
    size?: string

    /** Company type (public, private, nonprofit) */
    type?: string

    /** Founded year */
    foundedYear?: number

    /** Description */
    description?: string

    /** Logo URL */
    logo?: string

    /** Website */
    website?: string
  }

  /** Social profiles */
  social?: {
    /** LinkedIn URL */
    linkedin?: string

    /** Twitter/X handle */
    twitter?: string

    /** GitHub username */
    github?: string

    /** Facebook URL */
    facebook?: string
  }

  /** Email metadata */
  emailMetadata?: {
    /** Is this a free email provider */
    isFreeProvider?: boolean

    /** Is this a disposable email */
    isDisposable?: boolean

    /** Is this a role-based email (info@, support@, etc.) */
    isRoleBased?: boolean

    /** Email deliverability score */
    deliverabilityScore?: number

    /** Email format valid */
    isFormatValid?: boolean
  }
}

/**
 * Provider response interface
 */
export interface EmailEnrichmentResponse {
  /** Whether data was found */
  found: boolean

  /** Enriched data */
  data?: EnrichedEmailData

  /** Confidence score (0-1) */
  confidence?: number

  /** Provider-specific record ID */
  id?: string

  /** Rate limit remaining (if applicable) */
  rateLimitRemaining?: number

  /** Provider-specific metadata */
  metadata?: Record<string, unknown>
}

/**
 * Custom provider function type
 */
export type CustomEmailEnrichmentProvider = (
  email: string,
  signal?: AbortSignal,
) => Promise<EmailEnrichmentResponse>

/**
 * Configuration for the email enrichment service
 */
export interface EmailEnrichmentConfig {
  /** Provider to use */
  provider: EmailEnrichmentProvider

  /** API key (required for most providers) */
  apiKey?: string

  /** Custom API endpoint */
  apiEndpoint?: string

  /** Custom provider function (when provider is 'custom') */
  customProvider?: CustomEmailEnrichmentProvider

  /** Field mapping from enriched data to schema fields */
  fieldMapping?: Record<string, string>

  /** Whether to include company data */
  includeCompany?: boolean

  /** Whether to include social profiles */
  includeSocial?: boolean

  /** Request timeout in milliseconds */
  requestTimeoutMs?: number

  /** Respect rate limits (pause on limit) */
  respectRateLimits?: boolean
}

/**
 * Default configuration
 */
export const DEFAULT_EMAIL_ENRICHMENT_CONFIG: Partial<EmailEnrichmentConfig> = {
  provider: 'custom',
  includeCompany: true,
  includeSocial: true,
  requestTimeoutMs: 5000,
  respectRateLimits: true,
}

/**
 * Extract email from key fields
 */
export function extractEmail(keyFields: Record<string, unknown>): string | undefined {
  const emailFields = ['email', 'emailAddress', 'mail', 'e-mail', 'primaryEmail']

  for (const field of emailFields) {
    const value = keyFields[field]
    if (value !== undefined && value !== null && typeof value === 'string' && value.includes('@')) {
      return value.toLowerCase().trim()
    }
  }

  // Check if any value looks like an email
  for (const value of Object.values(keyFields)) {
    if (typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      return value.toLowerCase().trim()
    }
  }

  return undefined
}

/**
 * Flatten enriched data for field mapping
 */
export function flattenEnrichedData(data: EnrichedEmailData): Record<string, unknown> {
  const flat: Record<string, unknown> = {}

  if (data.email) flat.email = data.email

  if (data.person) {
    flat['person.fullName'] = data.person.fullName
    flat['person.firstName'] = data.person.firstName
    flat['person.lastName'] = data.person.lastName
    flat['person.avatar'] = data.person.avatar
    flat['person.title'] = data.person.title
    flat['person.role'] = data.person.role
    flat['person.bio'] = data.person.bio
    flat['person.location'] = data.person.location
    flat['person.timezone'] = data.person.timezone
  }

  if (data.company) {
    flat['company.name'] = data.company.name
    flat['company.domain'] = data.company.domain
    flat['company.industry'] = data.company.industry
    flat['company.size'] = data.company.size
    flat['company.type'] = data.company.type
    flat['company.foundedYear'] = data.company.foundedYear
    flat['company.description'] = data.company.description
    flat['company.logo'] = data.company.logo
    flat['company.website'] = data.company.website
  }

  if (data.social) {
    flat['social.linkedin'] = data.social.linkedin
    flat['social.twitter'] = data.social.twitter
    flat['social.github'] = data.social.github
    flat['social.facebook'] = data.social.facebook
  }

  if (data.emailMetadata) {
    flat['emailMetadata.isFreeProvider'] = data.emailMetadata.isFreeProvider
    flat['emailMetadata.isDisposable'] = data.emailMetadata.isDisposable
    flat['emailMetadata.isRoleBased'] = data.emailMetadata.isRoleBased
    flat['emailMetadata.deliverabilityScore'] = data.emailMetadata.deliverabilityScore
    flat['emailMetadata.isFormatValid'] = data.emailMetadata.isFormatValid
  }

  // Remove undefined values
  return Object.fromEntries(
    Object.entries(flat).filter(([_, v]) => v !== undefined),
  )
}

/**
 * Map enriched data fields to schema fields
 */
export function mapEnrichedFields(
  data: EnrichedEmailData,
  fieldMapping: Record<string, string>,
): Record<string, unknown> {
  const flat = flattenEnrichedData(data)
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
  metadata?: Record<string, unknown>,
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
  startedAt: Date,
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
 * List of common free email provider domains
 */
const FREE_EMAIL_PROVIDERS = new Set([
  'gmail.com',
  'yahoo.com',
  'hotmail.com',
  'outlook.com',
  'aol.com',
  'icloud.com',
  'mail.com',
  'protonmail.com',
  'zoho.com',
  'yandex.com',
])

/**
 * List of common role-based email prefixes
 */
const ROLE_BASED_PREFIXES = new Set([
  'info',
  'support',
  'admin',
  'sales',
  'contact',
  'help',
  'billing',
  'noreply',
  'no-reply',
  'webmaster',
  'postmaster',
])

/**
 * Mock provider for testing and development
 */
export function createMockEmailEnrichmentProvider(): CustomEmailEnrichmentProvider {
  return async (email: string): Promise<EmailEnrichmentResponse> => {
    // Simulate network latency
    await new Promise((resolve) => setTimeout(resolve, 10))

    const [localPart, domain] = email.split('@')

    if (!domain) {
      return { found: false }
    }

    // Determine email characteristics
    const isFreeProvider = FREE_EMAIL_PROVIDERS.has(domain.toLowerCase())
    const isRoleBased = ROLE_BASED_PREFIXES.has(localPart.toLowerCase())
    const isDisposable = domain.includes('tempmail') || domain.includes('throwaway')

    // Generate mock name from email local part
    const nameParts = localPart
      .replace(/[._-]/g, ' ')
      .split(' ')
      .filter((p) => p.length > 0)
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())

    const firstName = nameParts[0] || 'Unknown'
    const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : undefined

    const data: EnrichedEmailData = {
      email,
      person: {
        fullName: lastName ? `${firstName} ${lastName}` : firstName,
        firstName,
        lastName,
      },
      emailMetadata: {
        isFreeProvider,
        isDisposable,
        isRoleBased,
        isFormatValid: true,
        deliverabilityScore: isDisposable ? 0.3 : 0.95,
      },
    }

    // Add company data for non-free providers
    if (!isFreeProvider && !isDisposable) {
      const companyName = domain
        .replace(/\.(com|org|net|io|co|ai)$/, '')
        .split('.')
        .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
        .join(' ')

      data.company = {
        name: companyName,
        domain,
        website: `https://${domain}`,
      }
    }

    return {
      found: true,
      data,
      confidence: isDisposable ? 0.5 : 0.85,
      id: `mock-${Date.now()}`,
      metadata: { provider: 'mock' },
    }
  }
}

/**
 * Email Enrichment Lookup Service
 *
 * Enriches email addresses with additional data from external APIs.
 * Useful for populating profile information during identity matching.
 *
 * @example
 * ```typescript
 * const service = createEmailEnrichment({
 *   provider: 'custom',
 *   customProvider: myEnrichmentApi,
 *   fieldMapping: {
 *     'person.firstName': 'firstName',
 *     'person.lastName': 'lastName',
 *     'company.name': 'employer'
 *   }
 * })
 *
 * const result = await service.execute({
 *   keyFields: { email: 'john.doe@acme.com' }
 * }, context)
 * ```
 */
export function createEmailEnrichment(config: EmailEnrichmentConfig): LookupService {
  const mergedConfig = { ...DEFAULT_EMAIL_ENRICHMENT_CONFIG, ...config }
  const serviceName = `email-enrichment-${mergedConfig.provider}`

  // Validate config
  if (mergedConfig.provider === 'custom' && !mergedConfig.customProvider) {
    throw new Error('Custom provider requires customProvider function')
  }

  if (mergedConfig.provider !== 'custom' && !mergedConfig.apiKey) {
    throw new Error(`Provider '${mergedConfig.provider}' requires apiKey`)
  }

  const executeProvider = async (
    email: string,
    signal?: AbortSignal,
  ): Promise<EmailEnrichmentResponse> => {
    switch (mergedConfig.provider) {
      case 'custom':
        return mergedConfig.customProvider!(email, signal)

      case 'clearbit':
      case 'hunter':
      case 'fullcontact':
        // For now, these providers require custom implementation
        throw new ServiceNetworkError(
          serviceName,
          `Provider '${mergedConfig.provider}' requires custom implementation. Use 'custom' provider with customProvider function.`,
        )

      default:
        throw new Error(`Unknown provider: ${mergedConfig.provider}`)
    }
  }

  return {
    name: serviceName,
    type: 'lookup',
    description: `Enriches email addresses using ${mergedConfig.provider} provider`,

    async execute(
      input: LookupInput,
      context: ServiceContext,
    ): Promise<ServiceResult<LookupOutput>> {
      const startedAt = new Date()

      try {
        const email = extractEmail(input.keyFields)

        if (!email) {
          return createSuccessResult(
            {
              found: false,
            },
            startedAt,
          )
        }

        const response = await executeProvider(email, context.signal)

        if (!response.found || !response.data) {
          return createSuccessResult(
            {
              found: false,
            },
            startedAt,
          )
        }

        // Filter data based on config
        const enrichedData = { ...response.data }
        if (!mergedConfig.includeCompany) {
          delete enrichedData.company
        }
        if (!mergedConfig.includeSocial) {
          delete enrichedData.social
        }

        // Map fields if mapping is provided
        let data: Record<string, unknown>
        if (mergedConfig.fieldMapping) {
          data = mapEnrichedFields(enrichedData, mergedConfig.fieldMapping)
        } else {
          // Return flattened enriched data
          data = flattenEnrichedData(enrichedData)
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
          response.rateLimitRemaining !== undefined
            ? { rateLimitRemaining: response.rateLimitRemaining }
            : undefined,
        )
      } catch (error) {
        if (error instanceof ServiceNetworkError || error instanceof ServiceServerError) {
          return createFailureResult(error, startedAt)
        }

        return createFailureResult(
          new ServiceNetworkError(
            serviceName,
            error instanceof Error ? error.message : String(error),
          ),
          startedAt,
        )
      }
    },

    async healthCheck(): Promise<HealthCheckResult> {
      const startedAt = new Date()

      try {
        // Test with a sample email
        const testEmail = 'test@example.com'
        const response = await executeProvider(testEmail)

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
 * Pre-configured email enrichment with mock provider (for testing)
 */
export const mockEmailEnrichment = createEmailEnrichment({
  provider: 'custom',
  customProvider: createMockEmailEnrichmentProvider(),
})
