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
