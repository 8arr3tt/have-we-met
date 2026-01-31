import type { FieldType } from '../../types/schema'

/**
 * Normalizer function signature.
 * Accepts a value and optional configuration, returns normalized value or null.
 *
 * @template TOptions - Type of options object
 * @param value - The raw value to normalize
 * @param options - Optional configuration for this normalizer
 * @returns Normalized value, or null if normalization fails
 *
 * @example
 * ```typescript
 * const trimNormalizer: NormalizerFunction = (value) => {
 *   if (value == null) return null
 *   return String(value).trim()
 * }
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type NormalizerFunction<TOptions = any> = (
  value: unknown,
  options?: TOptions
) => unknown | null

/**
 * Metadata about a normalizer for introspection and documentation.
 */
export interface NormalizerMetadata {
  /** Unique name of the normalizer */
  name: string
  /** Description of what the normalizer does */
  description: string
  /** Field types this normalizer is designed for */
  supportedTypes: FieldType[]
}
