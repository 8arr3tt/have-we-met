import { registerNormalizer } from './registry'
import type { NormalizerFunction } from './types'

/**
 * Components of a parsed email address.
 */
export interface EmailComponents {
  /** Local part (before @) */
  localPart: string
  /** Domain name (after @) */
  domain: string
  /** Complete normalized email */
  full: string
  /** Local part without plus-addressing (e.g., user+tag → user) */
  baseName?: string
}

/**
 * Options for email normalization.
 */
export interface EmailNormalizerOptions {
  /** Whether to remove plus-addressing (user+tag@domain) (default: true) */
  removePlusAddressing?: boolean
  /** Whether to remove dots in Gmail addresses (default: false) */
  removeGmailDots?: boolean
  /** Whether to normalize domain (lowercase, trim) (default: true) */
  normalizeDomain?: boolean
  /** Format for output: 'full' or 'components' (default: 'full') */
  outputFormat?: 'full' | 'components'
  /** Whether to validate email format (default: true) */
  validate?: boolean
}

/**
 * Gmail domains that support dot removal.
 */
const GMAIL_DOMAINS = ['gmail.com', 'googlemail.com']

/**
 * Validates if a string looks like a valid email address.
 * Uses basic RFC 5322 compliance - not full spec, but catches obvious errors.
 *
 * @param email - The email string to validate
 * @returns True if the email appears valid, false otherwise
 *
 * @example
 * ```typescript
 * isValidEmail('user@example.com')  // true
 * isValidEmail('not-an-email')      // false
 * isValidEmail('user@@example.com') // false
 * ```
 */
export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== 'string') {
    return false
  }

  // Must contain exactly one @ symbol
  const atCount = (email.match(/@/g) || []).length
  if (atCount !== 1) {
    return false
  }

  const [localPart, domain] = email.split('@')

  // Both parts must exist and not be empty
  if (!localPart || !domain) {
    return false
  }

  // Local part validation (before @)
  // Allow: alphanumeric, dots, underscores, percent, plus, hyphens
  // Must not start or end with a dot
  if (
    !/^[a-zA-Z0-9][a-zA-Z0-9._+%-]*[a-zA-Z0-9]$|^[a-zA-Z0-9]$/.test(localPart)
  ) {
    return false
  }

  // Domain validation (after @)
  // Must have at least one dot (for TLD)
  if (!domain.includes('.')) {
    return false
  }

  // Domain must be valid format: alphanumeric and hyphens, with dots
  // Each part between dots must not start or end with hyphen
  const domainParts = domain.split('.')
  for (const part of domainParts) {
    if (!part || !/^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$/.test(part)) {
      return false
    }
  }

  // TLD (last part) must be at least 2 characters
  const tld = domainParts[domainParts.length - 1]
  if (tld.length < 2) {
    return false
  }

  return true
}

/**
 * Normalizes an email address for consistent matching.
 *
 * @param value - The email value to normalize
 * @param options - Optional configuration for normalization
 * @returns Normalized email (string or components), or null if input is invalid
 *
 * @example
 * ```typescript
 * normalizeEmail('John@Example.Com')
 * // 'john@example.com'
 *
 * normalizeEmail('user+tag@domain.com', { removePlusAddressing: true })
 * // 'user@domain.com'
 *
 * normalizeEmail('john.smith@gmail.com', { removeGmailDots: true })
 * // 'johnsmith@gmail.com'
 *
 * normalizeEmail('user@domain.com', { outputFormat: 'components' })
 * // { localPart: 'user', domain: 'domain.com', full: 'user@domain.com' }
 * ```
 */
export const normalizeEmail: NormalizerFunction<EmailNormalizerOptions> = (
  value: unknown,
  options?: EmailNormalizerOptions
): string | EmailComponents | null => {
  if (value == null) return null

  // Convert to string and trim whitespace
  let email = String(value).trim()
  if (!email) return null

  // Set defaults
  const opts: Required<EmailNormalizerOptions> = {
    removePlusAddressing: options?.removePlusAddressing ?? true,
    removeGmailDots: options?.removeGmailDots ?? false,
    normalizeDomain: options?.normalizeDomain ?? true,
    outputFormat: options?.outputFormat ?? 'full',
    validate: options?.validate ?? true,
  }

  // Convert to lowercase (email is case-insensitive per RFC)
  email = email.toLowerCase()

  // Validate format if enabled
  if (opts.validate && !isValidEmail(email)) {
    return null
  }

  // Split into parts
  const atIndex = email.indexOf('@')
  if (atIndex === -1) {
    return null // No @ symbol
  }

  let localPart = email.substring(0, atIndex)
  let domain = email.substring(atIndex + 1)

  // Both parts must exist
  if (!localPart || !domain) {
    return null
  }

  // Track if we removed plus-addressing for baseName
  let hadPlusAddressing = false

  // Remove plus-addressing if enabled
  if (opts.removePlusAddressing && localPart.includes('+')) {
    hadPlusAddressing = true
    const plusIndex = localPart.indexOf('+')
    localPart = localPart.substring(0, plusIndex)
  }

  // Remove dots in Gmail addresses if enabled
  if (opts.removeGmailDots && GMAIL_DOMAINS.includes(domain)) {
    localPart = localPart.replace(/\./g, '')
  }

  // Normalize domain if enabled
  if (opts.normalizeDomain) {
    domain = domain.trim().toLowerCase()
  }

  // Build components
  const components: EmailComponents = {
    localPart,
    domain,
    full: `${localPart}@${domain}`,
  }

  // Add baseName only if we actually removed plus-addressing
  if (hadPlusAddressing) {
    components.baseName = localPart
  }

  // Return based on output format
  return opts.outputFormat === 'components' ? components : components.full
}

// Auto-register the email normalizer
registerNormalizer('email', normalizeEmail)
