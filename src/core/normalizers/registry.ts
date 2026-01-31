import type { NormalizerFunction } from './types'

/**
 * Central registry of normalizer functions.
 * Maps normalizer names to their implementation functions.
 */
const normalizerRegistry = new Map<string, NormalizerFunction>()

/**
 * Registers a normalizer function with a given name.
 * If a normalizer with the same name already exists, it will be overwritten
 * and a warning will be logged.
 *
 * @param name - Unique identifier for the normalizer
 * @param fn - The normalizer function to register
 *
 * @example
 * ```typescript
 * registerNormalizer('uppercase', (value) => {
 *   if (value == null) return null
 *   return String(value).toUpperCase()
 * })
 * ```
 */
export function registerNormalizer(
  name: string,
  fn: NormalizerFunction
): void {
  if (normalizerRegistry.has(name)) {
    console.warn(
      `Normalizer '${name}' is already registered. Overwriting with new implementation.`
    )
  }
  normalizerRegistry.set(name, fn)
}

/**
 * Retrieves a registered normalizer function by name.
 *
 * @param name - The name of the normalizer to retrieve
 * @returns The normalizer function, or undefined if not found
 *
 * @example
 * ```typescript
 * const normalizer = getNormalizer('trim')
 * if (normalizer) {
 *   const result = normalizer('  hello  ') // 'hello'
 * }
 * ```
 */
export function getNormalizer(name: string): NormalizerFunction | undefined {
  return normalizerRegistry.get(name)
}

/**
 * Lists all registered normalizer names.
 * Useful for introspection and debugging.
 *
 * @returns Array of all registered normalizer names
 *
 * @example
 * ```typescript
 * const normalizers = listNormalizers()
 * console.log(normalizers) // ['trim', 'lowercase', 'uppercase', ...]
 * ```
 */
export function listNormalizers(): string[] {
  return Array.from(normalizerRegistry.keys())
}

/**
 * Applies a named normalizer to a value.
 * Returns the original value if the normalizer is not found or if normalization fails.
 *
 * @param value - The value to normalize
 * @param normalizerName - Name of the normalizer to apply
 * @param options - Optional configuration for the normalizer
 * @returns Normalized value, or original value if normalization fails
 *
 * @example
 * ```typescript
 * const normalized = applyNormalizer('  HELLO  ', 'trim')
 * console.log(normalized) // 'HELLO'
 * ```
 */
export function applyNormalizer(
  value: unknown,
  normalizerName: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  options?: any
): unknown {
  const normalizer = getNormalizer(normalizerName)

  if (!normalizer) {
    console.warn(`Normalizer '${normalizerName}' not found. Using original value.`)
    return value
  }

  try {
    const result = normalizer(value, options)
    // If normalization returns null, use the original value
    return result !== null ? result : value
  } catch (error) {
    console.warn(
      `Normalizer '${normalizerName}' failed:`,
      error instanceof Error ? error.message : error
    )
    return value
  }
}

/**
 * Composes multiple normalizers into a single function that applies them in sequence.
 * Each normalizer receives the output of the previous one.
 *
 * @param normalizers - Array of normalizer functions or names to compose
 * @returns A new normalizer function that applies all normalizers in order
 *
 * @example
 * ```typescript
 * const trimAndLowercase = composeNormalizers('trim', 'lowercase')
 * const result = trimAndLowercase('  HELLO  ') // 'hello'
 * ```
 */
export function composeNormalizers(
  ...normalizers: (string | NormalizerFunction)[]
): NormalizerFunction {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (value: unknown, options?: any) => {
    let result = value

    for (const normalizer of normalizers) {
      if (result === null || result === undefined) {
        return null
      }

      if (typeof normalizer === 'string') {
        result = applyNormalizer(result, normalizer, options)
      } else {
        try {
          result = normalizer(result, options)
        } catch (error) {
          console.warn('Normalizer in composition failed:', error)
          return null
        }
      }
    }

    return result
  }
}

/**
 * Clears all registered normalizers.
 * Primarily useful for testing.
 *
 * @internal
 */
export function clearNormalizers(): void {
  normalizerRegistry.clear()
}
