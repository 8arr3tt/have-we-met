/**
 * Cache key generation utilities
 * @module services/cache/cache-key-generator
 */

/**
 * Options for cache key generation
 */
export interface CacheKeyOptions {
  /** Prefix to add to all keys */
  prefix?: string

  /** Whether to include the service name in the key */
  includeServiceName?: boolean

  /** Custom fields to include in the key (whitelist) */
  includeFields?: string[]

  /** Fields to exclude from the key (blacklist) */
  excludeFields?: string[]

  /** Maximum key length (truncate hash if exceeded) */
  maxLength?: number

  /** Custom hash function */
  hashFn?: (input: string) => string
}

/**
 * Default cache key options
 */
export const DEFAULT_CACHE_KEY_OPTIONS: CacheKeyOptions = {
  includeServiceName: true,
  maxLength: 256,
}

/**
 * Generate a stable hash from a string
 *
 * Uses FNV-1a algorithm for fast, stable hashing
 */
export function fnv1aHash(input: string): string {
  let hash = 2166136261

  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }

  return (hash >>> 0).toString(16).padStart(8, '0')
}

/**
 * Create a stable JSON string from any value
 *
 * Handles:
 * - Object key ordering (alphabetical)
 * - Circular references (error)
 * - Undefined values (skipped)
 * - Function values (skipped)
 * - Date objects (converted to ISO string)
 * - Map/Set (converted to arrays)
 */
export function stableStringify(value: unknown, seen: WeakSet<object> = new WeakSet()): string {
  if (value === null) {
    return 'null'
  }

  if (value === undefined) {
    return 'undefined'
  }

  const type = typeof value

  if (type === 'boolean' || type === 'number') {
    return String(value)
  }

  if (type === 'string') {
    return JSON.stringify(value)
  }

  if (type === 'function') {
    return '"[function]"'
  }

  if (type === 'symbol') {
    return `"[symbol:${(value as symbol).description ?? ''}]"`
  }

  if (type === 'bigint') {
    return `"${value.toString()}n"`
  }

  if (value instanceof Date) {
    return `"${value.toISOString()}"`
  }

  if (value instanceof RegExp) {
    return `"${value.toString()}"`
  }

  if (value instanceof Map) {
    const entries = Array.from(value.entries())
    return stableStringify(entries, seen)
  }

  if (value instanceof Set) {
    const entries = Array.from(value.values())
    return stableStringify(entries, seen)
  }

  if (ArrayBuffer.isView(value)) {
    return `"[TypedArray:${value.constructor.name}]"`
  }

  if (typeof value === 'object') {
    if (seen.has(value)) {
      throw new Error('Circular reference detected in cache key input')
    }

    seen.add(value)

    try {
      if (Array.isArray(value)) {
        const items = value.map((item) => stableStringify(item, seen))
        return `[${items.join(',')}]`
      }

      const obj = value as Record<string, unknown>
      const keys = Object.keys(obj).sort()
      const pairs = keys
        .filter((key) => obj[key] !== undefined && typeof obj[key] !== 'function')
        .map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key], seen)}`)

      return `{${pairs.join(',')}}`
    } finally {
      seen.delete(value)
    }
  }

  return String(value)
}

/**
 * Generate a stable hash from any input value
 */
export function stableHash(value: unknown, hashFn: (input: string) => string = fnv1aHash): string {
  const stringified = stableStringify(value)
  return hashFn(stringified)
}

/**
 * Filter object fields based on include/exclude lists
 */
function filterFields(
  input: Record<string, unknown>,
  includeFields?: string[],
  excludeFields?: string[],
): Record<string, unknown> {
  if (!includeFields && !excludeFields) {
    return input
  }

  const result: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(input)) {
    if (includeFields && !includeFields.includes(key)) {
      continue
    }

    if (excludeFields && excludeFields.includes(key)) {
      continue
    }

    result[key] = value
  }

  return result
}

/**
 * Generate a cache key from service name and input
 *
 * @example
 * ```typescript
 * const key = generateCacheKey('nhs-validator', { field: 'nhsNumber', value: '1234567890' })
 * // Returns: "nhs-validator:a1b2c3d4"
 *
 * const customKey = generateCacheKey('email-lookup', input, {
 *   customKeyFn: (input) => input.email
 * })
 * // Returns: "email-lookup:user@example.com"
 * ```
 */
export function generateCacheKey(
  serviceName: string,
  input: unknown,
  customKeyFn?: (input: unknown) => string,
): string {
  if (customKeyFn) {
    const customKey = customKeyFn(input)
    return `${serviceName}:${customKey}`
  }

  const inputHash = stableHash(input)
  return `${serviceName}:${inputHash}`
}

/**
 * Create a cache key generator function with preset options
 *
 * @example
 * ```typescript
 * const keyGen = createCacheKeyGenerator({
 *   prefix: 'app',
 *   includeFields: ['id', 'email']
 * })
 *
 * const key = keyGen('user-lookup', { id: 123, email: 'test@test.com', password: 'secret' })
 * // Returns: "app:user-lookup:hash-of-id-and-email-only"
 * ```
 */
export function createCacheKeyGenerator(
  options: CacheKeyOptions = {},
): (serviceName: string, input: unknown, customKeyFn?: (input: unknown) => string) => string {
  const mergedOptions = { ...DEFAULT_CACHE_KEY_OPTIONS, ...options }

  return (serviceName: string, input: unknown, customKeyFn?: (input: unknown) => string): string => {
    let key: string

    if (customKeyFn) {
      key = customKeyFn(input)
    } else {
      let processedInput = input

      if (
        typeof input === 'object' &&
        input !== null &&
        !Array.isArray(input) &&
        (mergedOptions.includeFields || mergedOptions.excludeFields)
      ) {
        processedInput = filterFields(input as Record<string, unknown>, mergedOptions.includeFields, mergedOptions.excludeFields)
      }

      const hashFn = mergedOptions.hashFn ?? fnv1aHash
      key = stableHash(processedInput, hashFn)
    }

    const parts: string[] = []

    if (mergedOptions.prefix) {
      parts.push(mergedOptions.prefix)
    }

    if (mergedOptions.includeServiceName !== false) {
      parts.push(serviceName)
    }

    parts.push(key)

    let result = parts.join(':')

    if (mergedOptions.maxLength && result.length > mergedOptions.maxLength) {
      const truncatedKey = stableHash(result)
      result = parts.slice(0, -1).join(':') + ':' + truncatedKey
      if (result.length > mergedOptions.maxLength) {
        result = result.slice(0, mergedOptions.maxLength)
      }
    }

    return result
  }
}

/**
 * Normalize a cache key to be safe for all cache backends
 *
 * Removes or replaces characters that might cause issues
 */
export function normalizeCacheKey(key: string): string {
  return key
    .replace(/[^\w:.-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
}

/**
 * Validate that a cache key meets requirements
 */
export function isValidCacheKey(key: string, maxLength: number = 256): boolean {
  if (!key || typeof key !== 'string') {
    return false
  }

  if (key.length > maxLength) {
    return false
  }

  if (!/^[\w:.-]+$/.test(key)) {
    return false
  }

  return true
}
