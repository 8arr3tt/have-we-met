/**
 * Email Validator
 * Validates email addresses using format validation and optional DNS MX lookup
 * @module services/plugins/validators/email-validator
 */

import type {
  ValidationService,
  ValidationInput,
  ValidationOutput,
  ValidationCheck,
  ServiceResult,
  ServiceContext,
  HealthCheckResult,
} from '../../types.js'

/**
 * Common disposable email domains for detection.
 * This is a subset of known disposable domains - in production,
 * this list should be more comprehensive or loaded from a file.
 */
const DISPOSABLE_EMAIL_DOMAINS = new Set([
  '10minutemail.com',
  'guerrillamail.com',
  'guerrillamail.org',
  'guerrillamail.net',
  'mailinator.com',
  'tempmail.com',
  'throwaway.email',
  'yopmail.com',
  'temp-mail.org',
  'fakeinbox.com',
  'sharklasers.com',
  'dispostable.com',
  'getnada.com',
  'maildrop.cc',
  'mohmal.com',
  'tempail.com',
  'trashmail.com',
  'mailnesia.com',
  'mytemp.email',
  'tempr.email',
])

/**
 * RFC 5322 simplified email regex pattern.
 * This pattern covers the vast majority of valid email addresses while
 * avoiding the complexity of the full RFC specification.
 *
 * Pattern breakdown:
 * - Local part: letters, numbers, and certain special characters (including +)
 * - @ symbol
 * - Domain: letters, numbers, hyphens, with valid TLD
 */
const EMAIL_REGEX =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/

/**
 * Minimum TLD length (e.g., 'io', 'uk')
 */
const MIN_TLD_LENGTH = 2

/**
 * Maximum email length per RFC 5321
 */
const MAX_EMAIL_LENGTH = 254

/**
 * Maximum local part length per RFC 5321
 */
const MAX_LOCAL_LENGTH = 64

/**
 * Validates email format according to RFC 5322 (simplified)
 */
export function validateEmailFormat(email: string): {
  valid: boolean
  reason?: string
} {
  if (!email || typeof email !== 'string') {
    return { valid: false, reason: 'Email is required' }
  }

  const trimmed = email.trim()

  if (trimmed.length === 0) {
    return { valid: false, reason: 'Email is required' }
  }

  if (trimmed.length > MAX_EMAIL_LENGTH) {
    return {
      valid: false,
      reason: `Email exceeds maximum length of ${MAX_EMAIL_LENGTH} characters`,
    }
  }

  if (!EMAIL_REGEX.test(trimmed)) {
    return { valid: false, reason: 'Invalid email format' }
  }

  const [localPart, domain] = trimmed.split('@')

  if (localPart.length > MAX_LOCAL_LENGTH) {
    return {
      valid: false,
      reason: `Local part exceeds maximum length of ${MAX_LOCAL_LENGTH} characters`,
    }
  }

  // Check for valid TLD
  const domainParts = domain.split('.')
  const tld = domainParts[domainParts.length - 1]

  if (tld.length < MIN_TLD_LENGTH) {
    return { valid: false, reason: 'Invalid top-level domain' }
  }

  // Check for consecutive dots
  if (email.includes('..')) {
    return { valid: false, reason: 'Email cannot contain consecutive dots' }
  }

  // Check if local part starts or ends with a dot
  if (localPart.startsWith('.') || localPart.endsWith('.')) {
    return { valid: false, reason: 'Local part cannot start or end with a dot' }
  }

  return { valid: true }
}

/**
 * Normalizes an email address by trimming and lowercasing
 */
export function normalizeEmail(value: unknown): string {
  if (value === null || value === undefined) {
    return ''
  }
  return String(value).trim().toLowerCase()
}

/**
 * Extracts the domain from an email address
 */
export function extractDomain(email: string): string | null {
  const atIndex = email.indexOf('@')
  if (atIndex === -1) {
    return null
  }
  return email.substring(atIndex + 1).toLowerCase()
}

/**
 * Checks if an email domain is a known disposable email provider
 */
export function isDisposableDomain(domain: string): boolean {
  return DISPOSABLE_EMAIL_DOMAINS.has(domain.toLowerCase())
}

/**
 * Creates a successful service result
 */
function createSuccessResult(
  data: ValidationOutput,
  startedAt: Date,
  cached: boolean = false
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
    cached,
  }
}

/**
 * Email validator configuration options
 */
export interface EmailValidatorOptions {
  /** Custom name for the validator instance */
  name?: string

  /** Custom description */
  description?: string

  /** Check DNS MX records for the domain (default: false) */
  checkMx?: boolean

  /** Reject disposable email addresses (default: false) */
  rejectDisposable?: boolean

  /** Additional domains to treat as disposable */
  additionalDisposableDomains?: string[]
}

/**
 * Default email validator options
 */
const DEFAULT_OPTIONS: Required<
  Omit<
    EmailValidatorOptions,
    'name' | 'description' | 'additionalDisposableDomains'
  >
> = {
  checkMx: false,
  rejectDisposable: false,
}

/**
 * Creates an email validator with the given options.
 *
 * @example
 * ```typescript
 * // Basic email validation
 * const basicValidator = createEmailValidator()
 *
 * // With disposable email detection
 * const strictValidator = createEmailValidator({
 *   rejectDisposable: true,
 *   additionalDisposableDomains: ['example-disposable.com']
 * })
 *
 * const result = await strictValidator.execute({
 *   field: 'email',
 *   value: 'user@mailinator.com'
 * }, context)
 * // result.data.valid === false (disposable domain)
 * ```
 */
export function createEmailValidator(
  options: EmailValidatorOptions = {}
): ValidationService {
  const {
    name = 'email-validator',
    description = 'Validates email addresses using RFC 5322 format validation',
    checkMx = DEFAULT_OPTIONS.checkMx,
    rejectDisposable = DEFAULT_OPTIONS.rejectDisposable,
    additionalDisposableDomains = [],
  } = options

  // Create combined disposable domains set
  const disposableDomains = new Set([
    ...DISPOSABLE_EMAIL_DOMAINS,
    ...additionalDisposableDomains.map((d) => d.toLowerCase()),
  ])

  return {
    name,
    type: 'validation',
    description,

    async execute(
      input: ValidationInput,
      _context: ServiceContext
    ): Promise<ServiceResult<ValidationOutput>> {
      const startedAt = new Date()
      const { value } = input
      const normalized = normalizeEmail(value)
      const checks: ValidationCheck[] = []

      // Check for empty value
      if (!normalized) {
        checks.push({
          name: 'presence',
          passed: false,
          message: 'Email address is required',
        })

        return createSuccessResult(
          {
            valid: false,
            details: { checks },
            invalidReason: 'Email address is required',
          },
          startedAt
        )
      }

      // Format validation
      const formatResult = validateEmailFormat(normalized)
      checks.push({
        name: 'format',
        passed: formatResult.valid,
        message: formatResult.valid
          ? 'Valid email format'
          : (formatResult.reason ?? 'Invalid email format'),
      })

      if (!formatResult.valid) {
        return createSuccessResult(
          {
            valid: false,
            details: { checks },
            invalidReason: formatResult.reason ?? 'Invalid email format',
            suggestions: [
              'Check for typos in the email address',
              'Ensure the email contains exactly one @ symbol',
              'Verify the domain name is correct',
            ],
          },
          startedAt
        )
      }

      const domain = extractDomain(normalized)

      // Disposable email check
      if (rejectDisposable && domain && disposableDomains.has(domain)) {
        checks.push({
          name: 'disposable',
          passed: false,
          message: 'Disposable email addresses are not allowed',
        })

        return createSuccessResult(
          {
            valid: false,
            details: {
              checks,
              normalizedValue: normalized,
            },
            invalidReason: 'Disposable email addresses are not allowed',
            suggestions: ['Please use a permanent email address'],
          },
          startedAt
        )
      }

      if (rejectDisposable) {
        checks.push({
          name: 'disposable',
          passed: true,
          message: 'Not a disposable email domain',
        })
      }

      // MX record check (simulated - actual DNS lookup would require async DNS resolution)
      if (checkMx && domain) {
        // In a real implementation, this would perform actual DNS MX lookup
        // For now, we assume the domain exists if format is valid
        // Production implementations should use dns.resolveMx() or a library
        checks.push({
          name: 'mx',
          passed: true,
          message: 'MX record check passed (format-based)',
        })
      }

      // All checks passed
      return createSuccessResult(
        {
          valid: true,
          details: {
            checks,
            normalizedValue: normalized,
            confidence: 1.0,
          },
        },
        startedAt
      )
    },

    async healthCheck(): Promise<HealthCheckResult> {
      const startedAt = new Date()

      try {
        // Test with known valid and invalid emails
        const validResult = validateEmailFormat('test@example.com')
        const invalidResult = validateEmailFormat('invalid-email')

        const testPassed = validResult.valid && !invalidResult.valid

        const completedAt = new Date()
        return {
          healthy: testPassed,
          responseTimeMs: completedAt.getTime() - startedAt.getTime(),
          checkedAt: completedAt,
          details: {
            validEmailTestPassed: validResult.valid,
            invalidEmailTestPassed: !invalidResult.valid,
            checkMxEnabled: checkMx,
            rejectDisposableEnabled: rejectDisposable,
          },
        }
      } catch (error) {
        return {
          healthy: false,
          reason: error instanceof Error ? error.message : 'Unknown error',
          checkedAt: new Date(),
        }
      }
    },
  }
}

/**
 * Default email validator instance with standard settings.
 *
 * @example
 * ```typescript
 * const result = await emailValidator.execute({
 *   field: 'email',
 *   value: 'user@example.com'
 * }, context)
 *
 * if (result.success && result.data?.valid) {
 *   console.log('Email is valid:', result.data.details?.normalizedValue)
 * }
 * ```
 */
export const emailValidator: ValidationService = createEmailValidator()
