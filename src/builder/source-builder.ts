/**
 * Builder for configuring a single consolidation source
 */

import type {
  ConsolidationSource,
  FieldMapping,
  FieldMappingConfig,
  TransformFunction,
} from '../consolidation/types'
import type { DatabaseAdapter } from '../adapters/types'
import {
  requireNonEmptyString,
  requirePlainObject,
  requireFunction,
  requireOneOf,
} from '../utils/errors.js'

/**
 * Builder for configuring a data source
 *
 * @template TInput - Input record type for this source
 * @template TOutput - Unified output record type
 *
 * @example
 * ```typescript
 * const source = new SourceBuilder<LegacyCustomer, Customer>('legacy')
 *   .name('Legacy Customer Database')
 *   .adapter(legacyAdapter)
 *   .mapping(map => map
 *     .field('email').from('email_address')
 *     .field('firstName').from('first_name')
 *     .field('lastName').from('last_name')
 *     .field('fullName').transform((input) => `${input.first_name} ${input.last_name}`)
 *   )
 *   .priority(1)
 *   .build()
 * ```
 */
export class SourceBuilder<
  TInput extends Record<string, unknown>,
  TOutput extends Record<string, unknown>,
> {
  private sourceName?: string
  private databaseAdapter?: DatabaseAdapter<TInput>
  private fieldMapping: Partial<FieldMapping<TInput, TOutput>> = {}
  private sourcePriority = 0
  private sourceMetadata: Record<string, unknown> = {}

  constructor(private sourceId: string) {
    requireNonEmptyString(sourceId, 'sourceId')
  }

  /**
   * Set human-readable name for this source
   *
   * @param name - Source name
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * .name('CRM Database')
   * ```
   */
  name(name: string): this {
    requireNonEmptyString(name, 'name')
    this.sourceName = name
    return this
  }

  /**
   * Set database adapter for loading records from this source
   *
   * @param adapter - Database adapter instance
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * .adapter(prismaAdapter(prisma, { tableName: 'legacy_customers' }))
   * ```
   */
  adapter(adapter: DatabaseAdapter<TInput>): this {
    this.databaseAdapter = adapter
    return this
  }

  /**
   * Configure field mappings from input schema to output schema
   *
   * @param configurator - Callback that receives a FieldMappingBuilder
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * .mapping(map => map
   *   .field('email').from('email_address')
   *   .field('firstName').from('first_name')
   *   .field('fullName').transform((input) => `${input.first_name} ${input.last_name}`)
   * )
   * ```
   */
  mapping(
    configurator: (
      builder: FieldMappingBuilder<TInput, TOutput>
    ) => FieldMappingBuilder<TInput, TOutput> | void
  ): this {
    const builder = new FieldMappingBuilder<TInput, TOutput>()
    const result = configurator(builder)
    const finalBuilder = result ?? builder
    this.fieldMapping = finalBuilder.build()
    return this
  }

  /**
   * Set priority for this source in conflict resolution
   *
   * Higher priority sources are preferred when fields conflict.
   *
   * @param priority - Source priority (default: 0)
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * .priority(2) // Higher priority than default
   * ```
   */
  priority(priority: number): this {
    this.sourcePriority = priority
    return this
  }

  /**
   * Set metadata for this source
   *
   * Can be used for custom logic in transformation or conflict resolution.
   *
   * @param metadata - Source metadata
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * .metadata({ region: 'US', vintage: '2020' })
   * ```
   */
  metadata(metadata: Record<string, unknown>): this {
    requirePlainObject(metadata, 'metadata')
    this.sourceMetadata = metadata
    return this
  }

  /**
   * Build the source configuration
   *
   * @returns The complete source configuration
   * @throws {Error} If configuration is invalid
   */
  build(): ConsolidationSource<TInput, TOutput> {
    if (!this.sourceName) {
      throw new Error(`name is required for source '${this.sourceId}'`)
    }

    if (!this.databaseAdapter) {
      throw new Error(`adapter is required for source '${this.sourceId}'`)
    }

    if (Object.keys(this.fieldMapping).length === 0) {
      throw new Error(`mapping is required for source '${this.sourceId}'`)
    }

    return {
      sourceId: this.sourceId,
      name: this.sourceName,
      adapter: this.databaseAdapter,
      mapping: this.fieldMapping as FieldMapping<TInput, TOutput>,
      priority: this.sourcePriority,
      metadata: this.sourceMetadata,
    }
  }
}

/**
 * Builder for configuring field mappings
 *
 * @template TInput - Input record type
 * @template TOutput - Output record type
 *
 * @example
 * ```typescript
 * const mapping = new FieldMappingBuilder<LegacyCustomer, Customer>()
 *   .field('email').from('email_address')
 *   .field('firstName').from('first_name')
 *   .field('lastName').from('last_name')
 *   .field('fullName').transform((input) => `${input.first_name} ${input.last_name}`)
 *   .build()
 * ```
 */
export class FieldMappingBuilder<
  TInput extends Record<string, unknown>,
  TOutput extends Record<string, unknown>,
> {
  private mapping: Partial<FieldMapping<TInput, TOutput>> = {}
  private currentField?: keyof TOutput

  /**
   * Start configuring a field mapping
   *
   * @param fieldName - Output field name
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * .field('email').from('email_address')
   * ```
   */
  field(fieldName: keyof TOutput & string): this {
    requireNonEmptyString(fieldName, 'fieldName')
    this.currentField = fieldName
    if (!this.mapping[fieldName]) {
      this.mapping[fieldName] = {} as FieldMappingConfig<TInput, TOutput>
    }
    return this
  }

  /**
   * Map from a source field (static field mapping)
   *
   * Supports nested field access via dot notation (e.g., 'address.city')
   *
   * @param sourceField - Source field path
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * .field('email').from('email_address')
   * .field('city').from('address.city')
   * ```
   */
  from(sourceField: string): this {
    if (!this.currentField) {
      throw new Error('Must call field() before from()')
    }
    requireNonEmptyString(sourceField, 'sourceField')

    const config = this.mapping[this.currentField] as FieldMappingConfig<
      TInput,
      TOutput
    >
    if (config.transform) {
      throw new Error(
        `Cannot use both from() and transform() for field '${String(this.currentField)}'`
      )
    }

    config.sourceField = sourceField
    return this
  }

  /**
   * Map using a transformation function (computed field)
   *
   * @param fn - Transformation function
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * .field('fullName').transform((input) => `${input.first_name} ${input.last_name}`)
   * ```
   */
  transform(fn: TransformFunction<TInput, TOutput>): this {
    if (!this.currentField) {
      throw new Error('Must call field() before transform()')
    }
    requireFunction(fn, 'transform')

    const config = this.mapping[this.currentField] as FieldMappingConfig<
      TInput,
      TOutput
    >
    if (config.sourceField) {
      throw new Error(
        `Cannot use both from() and transform() for field '${String(this.currentField)}'`
      )
    }

    config.transform = fn
    return this
  }

  /**
   * Set type coercion for the mapped value
   *
   * @param type - Type to coerce to
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * .field('age').from('age').coerce('number')
   * ```
   */
  coerce(type: 'string' | 'number' | 'boolean' | 'date'): this {
    if (!this.currentField) {
      throw new Error('Must call field() before coerce()')
    }
    const allowedTypes = ['string', 'number', 'boolean', 'date']
    requireOneOf(type, allowedTypes, 'coerce')

    const config = this.mapping[this.currentField] as FieldMappingConfig<
      TInput,
      TOutput
    >
    config.coerce = type
    return this
  }

  /**
   * Mark this field as required in the output
   *
   * If true, mapping will fail if the field cannot be populated.
   *
   * @param required - Whether field is required (default: true)
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * .field('email').from('email_address').required()
   * ```
   */
  required(required = true): this {
    if (!this.currentField) {
      throw new Error('Must call field() before required()')
    }

    const config = this.mapping[this.currentField] as FieldMappingConfig<
      TInput,
      TOutput
    >
    config.required = required
    return this
  }

  /**
   * Build the field mapping configuration
   *
   * @returns The complete field mapping
   * @throws {Error} If configuration is invalid
   */
  build(): Partial<FieldMapping<TInput, TOutput>> {
    // Validate all fields have either sourceField or transform
    const entries = Object.keys(this.mapping).map((key) => [
      key,
      this.mapping[key as keyof TOutput],
    ])
    for (const [fieldName, config] of entries) {
      const cfg = config as FieldMappingConfig<TInput, TOutput>
      if (!cfg.sourceField && !cfg.transform) {
        throw new Error(
          `Field '${fieldName}' must have either from() or transform()`
        )
      }
    }

    return this.mapping
  }
}

/**
 * Factory function to create a source builder
 *
 * @template TInput - Input record type
 * @template TOutput - Output record type
 * @param sourceId - Unique identifier for this source
 * @returns A new SourceBuilder instance
 *
 * @example
 * ```typescript
 * import { createSourceBuilder } from 'have-we-met'
 *
 * const source = createSourceBuilder<LegacyCustomer, Customer>('legacy')
 *   .name('Legacy Database')
 *   .adapter(legacyAdapter)
 *   .mapping(map => map
 *     .field('email').from('email_address')
 *   )
 *   .build()
 * ```
 */
export function createSourceBuilder<
  TInput extends Record<string, unknown>,
  TOutput extends Record<string, unknown>,
>(sourceId: string): SourceBuilder<TInput, TOutput> {
  return new SourceBuilder<TInput, TOutput>(sourceId)
}
