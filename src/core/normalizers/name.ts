import { registerNormalizer } from './registry'
import type { NormalizerFunction } from './types'

/**
 * Components of a parsed name.
 */
export interface NameComponents {
  /** Title (Mr., Mrs., Dr., etc.) */
  title?: string
  /** First/given name */
  first?: string
  /** Middle name(s) */
  middle?: string[]
  /** Last/family/surname */
  last?: string
  /** Suffix (Jr., Sr., III, PhD, etc.) */
  suffix?: string
  /** Full normalized name */
  full?: string
}

/**
 * Options for name normalization.
 */
export interface NameNormalizerOptions {
  /** Whether to preserve casing (default: false, converts to Title Case) */
  preserveCase?: boolean
  /** Whether to extract and separate titles (default: true) */
  extractTitles?: boolean
  /** Whether to extract and separate suffixes (default: true) */
  extractSuffixes?: boolean
  /** Whether to normalize whitespace (default: true) */
  normalizeWhitespace?: boolean
  /** Format for output: 'components' or 'full' (default: 'full') */
  outputFormat?: 'components' | 'full'
}

/**
 * Common titles that appear before names.
 */
const TITLES = [
  'mr',
  'mrs',
  'ms',
  'miss',
  'dr',
  'prof',
  'professor',
  'rev',
  'reverend',
  'hon',
  'honorable',
  'capt',
  'captain',
  'lt',
  'lieutenant',
  'col',
  'colonel',
  'gen',
  'general',
  'sgt',
  'sergeant',
  'maj',
  'major',
  'sir',
  'dame',
  'lord',
  'lady',
]

/**
 * Common suffixes that appear after names.
 */
const SUFFIXES = [
  'jr',
  'sr',
  'ii',
  'iii',
  'iv',
  'v',
  'vi',
  'phd',
  'md',
  'dds',
  'dmd',
  'jd',
  'mba',
  'ma',
  'ms',
  'bs',
  'ba',
  'esq',
  'esquire',
  'cpa',
  'pe',
  'rn',
  'lpn',
]

/**
 * Particles that should remain lowercase in names (unless at start).
 */
const LOWERCASE_PARTICLES = [
  'von',
  'van',
  'de',
  'del',
  'della',
  'di',
  'da',
  'le',
  'la',
]

/**
 * Applies title case to a word with special handling for certain patterns.
 */
function toTitleCase(word: string): string {
  if (!word) return word

  // Handle particles that should stay lowercase (unless first word)
  const lowerWord = word.toLowerCase()
  if (LOWERCASE_PARTICLES.includes(lowerWord)) {
    return lowerWord
  }

  // Handle special patterns
  // Mc prefix (e.g., McDonald, McBride)
  if (/^mc/i.test(word) && word.length > 2) {
    return 'Mc' + word.charAt(2).toUpperCase() + word.slice(3).toLowerCase()
  }

  // Mac prefix (e.g., MacGregor, MacLeod)
  if (/^mac/i.test(word) && word.length > 3) {
    return 'Mac' + word.charAt(3).toUpperCase() + word.slice(4).toLowerCase()
  }

  // O' prefix (e.g., O'Brien, O'Connor)
  if (/^o'/i.test(word) && word.length > 2) {
    return "O'" + word.charAt(2).toUpperCase() + word.slice(3).toLowerCase()
  }

  // Hyphenated names (e.g., Jean-Claude)
  if (word.includes('-')) {
    return word.split('-').map(toTitleCase).join('-')
  }

  // Default: capitalize first letter, lowercase rest
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
}

/**
 * Normalizes whitespace in a string.
 */
function normalizeWhitespaceInString(str: string): string {
  return str.trim().replace(/\s+/g, ' ')
}

/**
 * Checks if a word is a title.
 */
function isTitle(word: string): boolean {
  const normalized = word.toLowerCase().replace(/\.$/, '')
  return TITLES.includes(normalized)
}

/**
 * Checks if a word is a suffix.
 */
function isSuffix(word: string): boolean {
  const normalized = word.toLowerCase().replace(/\.$/, '')
  return SUFFIXES.includes(normalized)
}

/**
 * Formats a title with proper casing and period.
 */
function formatTitle(title: string): string {
  const normalized = title.toLowerCase().replace(/\.$/, '')

  // Full words don't typically get periods
  if (
    [
      'professor',
      'reverend',
      'honorable',
      'captain',
      'lieutenant',
      'colonel',
      'general',
      'sergeant',
      'major',
      'sir',
      'dame',
      'lord',
      'lady',
      'esquire',
    ].includes(normalized)
  ) {
    return toTitleCase(normalized)
  }

  // Abbreviated titles get periods
  return toTitleCase(normalized) + '.'
}

/**
 * Formats a suffix with proper casing and period.
 */
function formatSuffix(suffix: string): string {
  const normalized = suffix.toLowerCase().replace(/\.$/, '')

  // Roman numerals stay uppercase
  if (['ii', 'iii', 'iv', 'v', 'vi'].includes(normalized)) {
    return normalized.toUpperCase()
  }

  // Academic degrees stay uppercase without periods
  if (
    [
      'phd',
      'md',
      'dds',
      'dmd',
      'jd',
      'mba',
      'ma',
      'ms',
      'bs',
      'ba',
      'cpa',
      'pe',
      'rn',
      'lpn',
    ].includes(normalized)
  ) {
    return normalized.toUpperCase()
  }

  // Jr/Sr get title case with period
  if (['jr', 'sr'].includes(normalized)) {
    return toTitleCase(normalized) + '.'
  }

  // Esquire doesn't get period
  if (normalized === 'esquire') {
    return toTitleCase(normalized)
  }

  return suffix
}

/**
 * Parses a name string into its components.
 *
 * @param name - The name string to parse
 * @returns Parsed name components
 *
 * @example
 * ```typescript
 * parseNameComponents('Dr. John Smith Jr.')
 * // { title: 'Dr.', first: 'John', last: 'Smith', suffix: 'Jr.' }
 * ```
 */
export function parseNameComponents(name: string): NameComponents {
  if (!name || typeof name !== 'string') {
    return {}
  }

  // Normalize whitespace
  const normalized = normalizeWhitespaceInString(name)

  // Check if result is empty after normalization
  if (!normalized) {
    return {}
  }

  // Split into words
  let words = normalized.split(/\s+/)

  const components: NameComponents = {}

  // Extract title (first word if it's a title)
  if (words.length > 0 && isTitle(words[0])) {
    components.title = formatTitle(words[0])
    words = words.slice(1)
  }

  // Extract suffixes (last words if they're suffixes)
  // Collect suffixes in order from right to left
  const suffixes: string[] = []
  while (words.length > 0 && isSuffix(words[words.length - 1])) {
    suffixes.unshift(formatSuffix(words[words.length - 1]))
    words = words.slice(0, -1)
  }
  if (suffixes.length > 0) {
    components.suffix = suffixes.join(' ')
  }

  // Parse remaining name parts
  if (words.length === 0) {
    // No name parts left
    return components
  } else if (words.length === 1) {
    // Single word - treat as last name
    components.last = words[0]
  } else if (words.length === 2) {
    // Two words - first and last
    components.first = words[0]
    components.last = words[1]
  } else {
    // Three or more words - first, middle(s), and last
    components.first = words[0]
    components.last = words[words.length - 1]
    components.middle = words.slice(1, -1)
  }

  return components
}

/**
 * Normalizes a name into standardized components or full format.
 *
 * @param value - The name value to normalize
 * @param options - Optional configuration for normalization
 * @returns Normalized name (string or components), or null if input is invalid
 *
 * @example
 * ```typescript
 * normalizeName('JOHN SMITH')
 * // 'John Smith'
 *
 * normalizeName('dr. john q. smith jr.', { outputFormat: 'components' })
 * // { title: 'Dr.', first: 'John', middle: ['Q.'], last: 'Smith', suffix: 'Jr.' }
 *
 * normalizeName('  mary   jane   watson  ')
 * // 'Mary Jane Watson'
 * ```
 */
export const normalizeName: NormalizerFunction<NameNormalizerOptions> = (
  value: unknown,
  options?: NameNormalizerOptions
): string | NameComponents | null => {
  if (value == null) return null

  const str = String(value).trim()
  if (!str) return null

  // Set defaults
  const opts: Required<NameNormalizerOptions> = {
    preserveCase: options?.preserveCase ?? false,
    extractTitles: options?.extractTitles ?? true,
    extractSuffixes: options?.extractSuffixes ?? true,
    normalizeWhitespace: options?.normalizeWhitespace ?? true,
    outputFormat: options?.outputFormat ?? 'full',
  }

  // Normalize whitespace if enabled
  const normalized = opts.normalizeWhitespace
    ? normalizeWhitespaceInString(str)
    : str

  // Parse components
  const components = parseNameComponents(normalized)

  // Apply casing if not preserving
  if (!opts.preserveCase) {
    if (components.first) {
      components.first = toTitleCase(components.first)
    }
    if (components.middle) {
      components.middle = components.middle.map((m, idx) => {
        // Don't apply title case to particles that aren't at the start
        if (idx > 0 && LOWERCASE_PARTICLES.includes(m.toLowerCase())) {
          return m.toLowerCase()
        }
        return toTitleCase(m)
      })
    }
    if (components.last) {
      // Handle compound last names with particles
      const lastParts = components.last.split(/\s+/)
      components.last = lastParts
        .map((part, idx) => {
          // Particles in last names stay lowercase unless first
          if (idx > 0 && LOWERCASE_PARTICLES.includes(part.toLowerCase())) {
            return part.toLowerCase()
          }
          return toTitleCase(part)
        })
        .join(' ')
    }
  }

  // Remove title if not extracting
  if (!opts.extractTitles && components.title) {
    delete components.title
  }

  // Remove suffix if not extracting
  if (!opts.extractSuffixes && components.suffix) {
    delete components.suffix
  }

  // Build full name
  const parts: string[] = []
  if (components.title) parts.push(components.title)
  if (components.first) parts.push(components.first)
  if (components.middle) parts.push(...components.middle)
  if (components.last) parts.push(components.last)
  if (components.suffix) parts.push(components.suffix)

  components.full = parts.join(' ')

  // Return based on output format
  return opts.outputFormat === 'components' ? components : components.full
}

// Auto-register the name normalizer
registerNormalizer('name', normalizeName)
