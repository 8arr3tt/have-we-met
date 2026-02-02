import type { ConsolidationSource } from './types'
import { ConsolidationError } from './types'

/**
 * Internal field mapping entry used by schema mapper
 */
interface MappingEntry<TInput, TOutput> {
  source: keyof TInput | string
  target: keyof TOutput | string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transform?: (value: any, record?: TInput) => any
}

/**
 * Schema mapper that transforms records from input schemas to unified output schema.
 *
 * Supports:
 * - Static field renaming (e.g., "customer_name" -> "name")
 * - Nested field access (e.g., "address.city" -> "city")
 * - Transform functions for computed fields
 * - Type coercion (string -> number, etc.)
 * - Null/undefined handling
 *
 * @example
 * ```typescript
 * const mapper = new SchemaMapper<InputType, OutputType>({
 *   mappings: [
 *     { source: 'customer_name', target: 'name' },
 *     { source: 'dob', target: 'dateOfBirth', transform: (v) => new Date(v) },
 *     { source: 'address.city', target: 'city' }
 *   ]
 * })
 *
 * const output = mapper.map(inputRecord)
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class SchemaMapper<TInput = any, TOutput = any> {
  private readonly mappings: MappingEntry<TInput, TOutput>[]
  private readonly targetFields: Set<string>

  constructor(config: { mappings: MappingEntry<TInput, TOutput>[] }) {
    this.mappings = this.normalizeMappings(config.mappings)
    this.targetFields = new Set(this.mappings.map((m) => String(m.target)))
    this.validateMappings()
  }

  /**
   * Map a single record from input schema to output schema.
   *
   * @param input Input record
   * @returns Mapped output record
   * @throws {ConsolidationError} If mapping fails
   */
  map(input: TInput): TOutput {
    if (input === null || input === undefined) {
      throw new ConsolidationError(
        'Cannot map null or undefined record',
        'MAPPING_ERROR'
      )
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const output: any = {}

    for (const mapping of this.mappings) {
      try {
        const sourceValue = this.getNestedValue(input, mapping.source)
        const transformedValue = mapping.transform
          ? mapping.transform(sourceValue, input)
          : sourceValue

        this.setNestedValue(output, mapping.target, transformedValue)
      } catch (error) {
        throw new ConsolidationError(
          `Failed to map field "${String(mapping.source)}" to "${String(mapping.target)}": ${error instanceof Error ? error.message : String(error)}`,
          'MAPPING_ERROR',
          { field: String(mapping.source), mapping }
        )
      }
    }

    return output as TOutput
  }

  /**
   * Map multiple records in batch.
   *
   * @param inputs Array of input records
   * @returns Array of mapped output records
   * @throws {ConsolidationError} If any mapping fails
   */
  mapBatch(inputs: TInput[]): TOutput[] {
    if (!Array.isArray(inputs)) {
      throw new ConsolidationError(
        'mapBatch expects an array of records',
        'MAPPING_ERROR'
      )
    }

    return inputs.map((input, index) => {
      try {
        return this.map(input)
      } catch (error) {
        throw new ConsolidationError(
          `Failed to map record at index ${index}: ${error instanceof Error ? error.message : String(error)}`,
          'MAPPING_ERROR',
          { index, record: input }
        )
      }
    })
  }

  /**
   * Get a nested value from an object using dot notation.
   *
   * @example
   * ```typescript
   * getNestedValue({ address: { city: 'NYC' } }, 'address.city') // 'NYC'
   * ```
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private getNestedValue(obj: any, path: keyof TInput | string): any {
    const pathStr = String(path)

    // Handle simple field access
    if (!pathStr.includes('.')) {
      return obj[pathStr]
    }

    // Handle nested field access
    const parts = pathStr.split('.')
    let current = obj

    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined
      }
      current = current[part]
    }

    return current
  }

  /**
   * Set a nested value in an object using dot notation.
   *
   * @example
   * ```typescript
   * setNestedValue({}, 'address.city', 'NYC') // { address: { city: 'NYC' } }
   * ```
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private setNestedValue(obj: any, path: keyof TOutput | string, value: any): void {
    const pathStr = String(path)

    // Handle simple field access
    if (!pathStr.includes('.')) {
      obj[pathStr] = value
      return
    }

    // Handle nested field access
    const parts = pathStr.split('.')
    let current = obj

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i]
      if (!(part in current)) {
        current[part] = {}
      } else if (
        typeof current[part] !== 'object' ||
        current[part] === null
      ) {
        throw new ConsolidationError(
          `Cannot set nested value: "${parts.slice(0, i + 1).join('.')}" is not an object`,
          'MAPPING_ERROR'
        )
      }
      current = current[part]
    }

    current[parts[parts.length - 1]] = value
  }

  /**
   * Normalize mapping configurations to full MappingEntry objects.
   */
  private normalizeMappings(
    configs: MappingEntry<TInput, TOutput>[]
  ): MappingEntry<TInput, TOutput>[] {
    return configs.map((config) => {
      if (typeof config === 'object' && 'source' in config && 'target' in config) {
        return config as MappingEntry<TInput, TOutput>
      }

      // Handle simple string mapping: 'field' -> { source: 'field', target: 'field' }
      if (typeof config === 'string') {
        return {
          source: config as keyof TInput,
          target: config as keyof TOutput,
        }
      }

      throw new ConsolidationError(
        `Invalid mapping configuration: ${JSON.stringify(config)}`,
        'INVALID_CONFIG'
      )
    })
  }

  /**
   * Validate mapping configuration.
   *
   * @throws {ConsolidationError} If mappings are invalid
   */
  private validateMappings(): void {
    if (this.mappings.length === 0) {
      throw new ConsolidationError(
        'At least one field mapping is required',
        'INVALID_CONFIG'
      )
    }

    // Check for duplicate target fields
    const targetCounts = new Map<string, number>()
    for (const mapping of this.mappings) {
      const target = String(mapping.target)
      targetCounts.set(target, (targetCounts.get(target) || 0) + 1)
    }

    const duplicates = Array.from(targetCounts.entries())
      .filter(([_, count]) => count > 1)
      .map(([target]) => target)

    if (duplicates.length > 0) {
      throw new ConsolidationError(
        `Duplicate target fields: ${duplicates.join(', ')}`,
        'INVALID_CONFIG'
      )
    }

    // Validate mapping structure
    for (const mapping of this.mappings) {
      if (!mapping.source) {
        throw new ConsolidationError(
          'Mapping source field is required',
          'INVALID_CONFIG'
        )
      }
      if (!mapping.target) {
        throw new ConsolidationError(
          'Mapping target field is required',
          'INVALID_CONFIG'
        )
      }
    }
  }

  /**
   * Get the list of target fields produced by this mapper.
   */
  getTargetFields(): string[] {
    return Array.from(this.targetFields)
  }

  /**
   * Check if a target field is mapped.
   */
  hasTargetField(field: keyof TOutput | string): boolean {
    return this.targetFields.has(String(field))
  }
}

/**
 * Create a schema mapper from a consolidation source configuration.
 *
 * @param source Consolidation source configuration
 * @returns SchemaMapper instance
 */
export function createSchemaMapper<
  TInput extends Record<string, unknown>,
  TOutput extends Record<string, unknown>,
>(source: ConsolidationSource<TInput, TOutput>): SchemaMapper<TInput, TOutput> {
  // Convert FieldMapping to MappingEntry array
  const mappingEntries: MappingEntry<TInput, TOutput>[] = []

  for (const [targetField, config] of Object.entries(source.mapping)) {
    const entry: MappingEntry<TInput, TOutput> = {
      source: config.sourceField || targetField,
      target: targetField as keyof TOutput,
    }

    if (config.transform) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      entry.transform = (_value: any, record?: TInput) =>
        config.transform!(record!, targetField as keyof TOutput)
    }

    mappingEntries.push(entry)
  }

  return new SchemaMapper<TInput, TOutput>({
    mappings: mappingEntries,
  })
}

/**
 * Common type coercion functions for use in transform functions.
 */
export const TypeCoercions = {
  /**
   * Coerce value to string.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  toString(value: any): string {
    if (value === null || value === undefined) {
      return ''
    }
    return String(value)
  },

  /**
   * Coerce value to number.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  toNumber(value: any): number | null {
    if (value === null || value === undefined || value === '') {
      return null
    }
    const num = Number(value)
    return isNaN(num) ? null : num
  },

  /**
   * Coerce value to boolean.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  toBoolean(value: any): boolean {
    if (value === null || value === undefined) {
      return false
    }
    if (typeof value === 'boolean') {
      return value
    }
    if (typeof value === 'string') {
      const lower = value.toLowerCase()
      return lower === 'true' || lower === '1' || lower === 'yes'
    }
    return Boolean(value)
  },

  /**
   * Coerce value to Date.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  toDate(value: any): Date | null {
    if (value === null || value === undefined || value === '') {
      return null
    }
    if (value instanceof Date) {
      return value
    }
    const date = new Date(value)
    return isNaN(date.getTime()) ? null : date
  },

  /**
   * Coerce value to array.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  toArray<T>(value: any): T[] {
    if (value === null || value === undefined) {
      return []
    }
    return Array.isArray(value) ? value : [value]
  },
}

/**
 * Common transformation functions for field mappings.
 */
export const CommonTransforms = {
  /**
   * Uppercase string value.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  uppercase: (value: any) => (value ? String(value).toUpperCase() : value),

  /**
   * Lowercase string value.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  lowercase: (value: any) => (value ? String(value).toLowerCase() : value),

  /**
   * Trim whitespace from string value.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  trim: (value: any) => (value ? String(value).trim() : value),

  /**
   * Default value if null/undefined.
   */
  defaultValue:
    <T>(defaultVal: T) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (value: any) =>
      value === null || value === undefined ? defaultVal : value,

  /**
   * Parse JSON string.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parseJSON: (value: any) => {
    if (typeof value === 'string') {
      try {
        return JSON.parse(value)
      } catch {
        return null
      }
    }
    return value
  },

  /**
   * Stringify value to JSON.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  stringifyJSON: (value: any) => {
    try {
      return JSON.stringify(value)
    } catch {
      return null
    }
  },

  /**
   * Compose multiple transforms into a single transform.
   */
  compose:
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (...transforms: ((value: any, record?: any) => any)[]) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (value: any, record?: any) => {
      let result = value
      for (const transform of transforms) {
        result = transform(result, record)
      }
      return result
    },
}
