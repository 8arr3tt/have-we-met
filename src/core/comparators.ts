/**
 * Options for exact match comparison.
 */
export interface ExactMatchOptions {
  /** Whether string comparison should be case-sensitive (default: true) */
  caseSensitive?: boolean
  /** Whether two null/undefined values should match (default: true) */
  nullMatchesNull?: boolean
}

/**
 * Compares two values for exact equality.
 * Returns 1 for exact match, 0 for no match.
 *
 * @param a - First value to compare
 * @param b - Second value to compare
 * @param options - Comparison options
 * @returns 1 if values match exactly, 0 otherwise
 */
export function exactMatch(
  a: unknown,
  b: unknown,
  options: ExactMatchOptions = {}
): number {
  const { caseSensitive = true, nullMatchesNull = true } = options

  // Handle null/undefined
  if (a == null && b == null) return nullMatchesNull ? 1 : 0
  if (a == null || b == null) return 0

  // String comparison
  if (typeof a === 'string' && typeof b === 'string') {
    if (caseSensitive) return a === b ? 1 : 0
    return a.toLowerCase() === b.toLowerCase() ? 1 : 0
  }

  // Date comparison
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime() ? 1 : 0
  }

  // Primitive comparison
  return a === b ? 1 : 0
}

/**
 * Options for Levenshtein distance comparison.
 */
export interface LevenshteinOptions {
  /** Whether string comparison should be case-sensitive (default: false) */
  caseSensitive?: boolean
  /** Whether to normalize whitespace before comparison (default: true) */
  normalizeWhitespace?: boolean
  /** Whether two null/undefined values should match (default: true) */
  nullMatchesNull?: boolean
}

/**
 * Calculates Levenshtein distance similarity between two values.
 *
 * Levenshtein distance measures the minimum number of single-character edits
 * (insertions, deletions, or substitutions) required to transform one string
 * into another. This function returns a normalized similarity score between
 * 0 (completely different) and 1 (identical).
 *
 * @param a - First value to compare
 * @param b - Second value to compare
 * @param options - Comparison options
 * @returns Normalized similarity score from 0 to 1
 *
 * @example
 * ```typescript
 * levenshtein('hello', 'hello')      // 1.0 (identical)
 * levenshtein('hello', 'hallo')      // 0.8 (one character different)
 * levenshtein('cat', 'category')     // ~0.375 (different lengths)
 * levenshtein('Hello', 'hello')      // 1.0 (case-insensitive by default)
 * levenshtein('Hello', 'hello', { caseSensitive: true }) // 0.8
 * ```
 */
export function levenshtein(
  a: unknown,
  b: unknown,
  options: LevenshteinOptions = {}
): number {
  const {
    caseSensitive = false,
    normalizeWhitespace = true,
    nullMatchesNull = true,
  } = options

  // Handle null/undefined
  if (a == null && b == null) return nullMatchesNull ? 1 : 0
  if (a == null || b == null) return 0

  // Coerce to strings
  let strA = String(a)
  let strB = String(b)

  // Apply case sensitivity
  if (!caseSensitive) {
    strA = strA.toLowerCase()
    strB = strB.toLowerCase()
  }

  // Normalize whitespace
  if (normalizeWhitespace) {
    strA = strA.replace(/\s+/g, ' ').trim()
    strB = strB.replace(/\s+/g, ' ').trim()
  }

  // Handle empty strings
  if (strA.length === 0 && strB.length === 0) return 1
  if (strA.length === 0 || strB.length === 0) return 0

  // Wagner-Fischer algorithm (dynamic programming)
  const lenA = strA.length
  const lenB = strB.length

  // Create distance matrix
  const matrix: number[][] = []
  for (let i = 0; i <= lenA; i++) {
    matrix[i] = [i]
  }
  for (let j = 0; j <= lenB; j++) {
    matrix[0][j] = j
  }

  // Calculate distances
  for (let i = 1; i <= lenA; i++) {
    for (let j = 1; j <= lenB; j++) {
      const cost = strA[i - 1] === strB[j - 1] ? 0 : 1
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1, // deletion
        matrix[i][j - 1] + 1, // insertion
        matrix[i - 1][j - 1] + cost // substitution
      )
    }
  }

  const distance = matrix[lenA][lenB]
  const maxLength = Math.max(lenA, lenB)

  // Normalize to 0-1 similarity score
  return 1 - distance / maxLength
}

/**
 * Options for Jaro-Winkler similarity comparison.
 */
export interface JaroWinklerOptions {
  /** Whether string comparison should be case-sensitive (default: false) */
  caseSensitive?: boolean
  /** Prefix scaling factor (default: 0.1, range: 0-0.25) */
  prefixScale?: number
  /** Maximum prefix length to consider (default: 4) */
  maxPrefixLength?: number
  /** Whether two null/undefined values should match (default: true) */
  nullMatchesNull?: boolean
}

/**
 * Calculates Jaro-Winkler similarity between two values.
 *
 * Jaro-Winkler is optimized for short strings like names. It rewards common
 * prefixes and allows for character transpositions. The algorithm considers
 * matching characters within a search window and applies a bonus for common
 * prefixes up to 4 characters.
 *
 * @param a - First value to compare
 * @param b - Second value to compare
 * @param options - Comparison options
 * @returns Similarity score from 0 to 1
 *
 * @example
 * ```typescript
 * jaroWinkler('MARTHA', 'MARTHA')      // 1.0 (identical)
 * jaroWinkler('MARTHA', 'MARHTA')      // ~0.96 (transposition)
 * jaroWinkler('DIXON', 'DICKSONX')     // ~0.81 (prefix bonus)
 * jaroWinkler('martha', 'MARTHA')      // 1.0 (case-insensitive by default)
 * jaroWinkler('martha', 'MARTHA', { caseSensitive: true }) // 0.0
 * ```
 */
export function jaroWinkler(
  a: unknown,
  b: unknown,
  options: JaroWinklerOptions = {}
): number {
  const {
    caseSensitive = false,
    prefixScale = 0.1,
    maxPrefixLength = 4,
    nullMatchesNull = true,
  } = options

  // Handle null/undefined
  if (a == null && b == null) return nullMatchesNull ? 1 : 0
  if (a == null || b == null) return 0

  // Coerce to strings
  let strA = String(a)
  let strB = String(b)

  // Apply case sensitivity
  if (!caseSensitive) {
    strA = strA.toLowerCase()
    strB = strB.toLowerCase()
  }

  // Handle empty strings
  if (strA.length === 0 && strB.length === 0) return 1
  if (strA.length === 0 || strB.length === 0) return 0

  // Handle identical strings
  if (strA === strB) return 1

  // Calculate Jaro similarity
  const jaro = calculateJaro(strA, strB)

  // Calculate common prefix length (up to maxPrefixLength)
  let prefixLength = 0
  for (let i = 0; i < Math.min(strA.length, strB.length, maxPrefixLength); i++) {
    if (strA[i] === strB[i]) {
      prefixLength++
    } else {
      break
    }
  }

  // Apply Winkler prefix bonus
  return jaro + prefixLength * prefixScale * (1 - jaro)
}

/**
 * Calculates base Jaro similarity between two strings.
 * @internal
 */
function calculateJaro(strA: string, strB: string): number {
  const lenA = strA.length
  const lenB = strB.length

  // Calculate matching window: max(len(a), len(b)) / 2 - 1
  const matchWindow = Math.floor(Math.max(lenA, lenB) / 2) - 1
  if (matchWindow < 0) return 0

  // Track which characters have been matched
  const matchedA = new Array(lenA).fill(false)
  const matchedB = new Array(lenB).fill(false)

  let matches = 0
  let transpositions = 0

  // Find matching characters within the window
  for (let i = 0; i < lenA; i++) {
    const start = Math.max(0, i - matchWindow)
    const end = Math.min(i + matchWindow + 1, lenB)

    for (let j = start; j < end; j++) {
      if (!matchedB[j] && strA[i] === strB[j]) {
        matchedA[i] = true
        matchedB[j] = true
        matches++
        break
      }
    }
  }

  // No matches found
  if (matches === 0) return 0

  // Count transpositions
  let k = 0
  for (let i = 0; i < lenA; i++) {
    if (matchedA[i]) {
      while (!matchedB[k]) k++
      if (strA[i] !== strB[k]) transpositions++
      k++
    }
  }

  // Calculate Jaro similarity
  // Jaro = (m/|a| + m/|b| + (m-t/2)/m) / 3
  return (
    (matches / lenA + matches / lenB + (matches - transpositions / 2) / matches) /
    3
  )
}

/**
 * Options for Soundex comparison.
 */
export interface SoundexOptions {
  /** Whether two null/undefined values should match (default: true) */
  nullMatchesNull?: boolean
}

/**
 * Encodes a name into its Soundex code.
 *
 * Soundex is a phonetic algorithm that encodes names by sound, grouping
 * similar-sounding names together. The algorithm produces a 4-character
 * code consisting of a letter followed by three digits.
 *
 * Encoding Rules:
 * 1. Keep the first letter
 * 2. Replace consonants with digits:
 *    - b, f, p, v → 1
 *    - c, g, j, k, q, s, x, z → 2
 *    - d, t → 3
 *    - l → 4
 *    - m, n → 5
 *    - r → 6
 * 3. Remove vowels (a, e, i, o, u) and h, w, y
 * 4. Remove duplicate adjacent digits
 * 5. Pad with zeros or truncate to 4 characters
 *
 * @param name - The name to encode
 * @returns 4-character Soundex code
 *
 * @example
 * ```typescript
 * soundexEncode('Robert')   // 'R163'
 * soundexEncode('Rupert')   // 'R163'
 * soundexEncode('Smith')    // 'S530'
 * soundexEncode('Smyth')    // 'S530'
 * ```
 */
export function soundexEncode(name: string): string {
  if (!name) return ''

  // Normalize: uppercase and keep only alphabetic characters
  const normalized = name.toUpperCase().replace(/[^A-Z]/g, '')
  if (normalized.length === 0) return ''

  // Keep the first letter
  const firstLetter = normalized[0]

  // Soundex digit mapping
  const soundexMap: Record<string, string> = {
    B: '1',
    F: '1',
    P: '1',
    V: '1',
    C: '2',
    G: '2',
    J: '2',
    K: '2',
    Q: '2',
    S: '2',
    X: '2',
    Z: '2',
    D: '3',
    T: '3',
    L: '4',
    M: '5',
    N: '5',
    R: '6',
  }

  // Convert the rest of the string to digits
  let code = firstLetter
  let prevDigit = soundexMap[firstLetter] || ''

  for (let i = 1; i < normalized.length; i++) {
    const char = normalized[i]
    const digit = soundexMap[char]

    if (digit) {
      // Only add if different from previous digit
      if (digit !== prevDigit) {
        code += digit
      }
      prevDigit = digit
    } else {
      // Vowels and h, w, y break the sequence
      prevDigit = ''
    }

    // Stop if we have enough digits
    if (code.length >= 4) break
  }

  // Pad with zeros or truncate to 4 characters
  return (code + '000').substring(0, 4)
}

/**
 * Compares two values using Soundex phonetic encoding.
 *
 * Soundex encoding groups similar-sounding names together, making it useful
 * for matching names that may be spelled differently but sound the same.
 * Returns 1 if the Soundex codes match, 0 otherwise.
 *
 * @param a - First value to compare
 * @param b - Second value to compare
 * @param options - Comparison options
 * @returns 1 if Soundex codes match, 0 otherwise
 *
 * @example
 * ```typescript
 * soundex('Robert', 'Rupert')    // 1 (both encode to R163)
 * soundex('Smith', 'Smyth')      // 1 (both encode to S530)
 * soundex('Smith', 'Jones')      // 0 (S530 vs J520)
 * soundex('Lee', 'Li')           // 1 (both encode to L000)
 * ```
 */
export function soundex(
  a: unknown,
  b: unknown,
  options: SoundexOptions = {}
): number {
  const { nullMatchesNull = true } = options

  // Handle null/undefined
  if (a == null && b == null) return nullMatchesNull ? 1 : 0
  if (a == null || b == null) return 0

  // Coerce to strings
  const strA = String(a)
  const strB = String(b)

  // Encode both strings
  const codeA = soundexEncode(strA)
  const codeB = soundexEncode(strB)

  // Handle empty codes
  if (codeA === '' && codeB === '') return 1
  if (codeA === '' || codeB === '') return 0

  // Compare codes
  return codeA === codeB ? 1 : 0
}
