/**
 * Fluent builder for configuring merge strategies
 * @module builder/merge-builder
 */

import type {
  MergeStrategy,
  MergeConfig,
  FieldMergeConfig,
  FieldMergeOptions,
  ConflictResolution,
  CustomMergeFunction,
  SourceRecord,
} from '../merge/types.js'
import {
  DEFAULT_MERGE_CONFIG,
  MERGE_STRATEGIES,
  NUMERIC_STRATEGIES,
} from '../merge/types.js'
import type { SchemaDefinition, FieldType } from '../types/schema.js'

/**
 * Error thrown when merge builder configuration is invalid
 */
export class MergeBuilderError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MergeBuilderError'
  }
}

/**
 * Field types considered numeric
 */
const NUMERIC_FIELD_TYPES: FieldType[] = ['number']

/**
 * Fluent builder for configuring field-level merge strategies.
 *
 * @typeParam T - The record type being merged
 *
 * @example
 * ```typescript
 * merge
 *   .field('firstName').strategy('preferLonger')
 *   .field('email').strategy('preferNewer')
 *   .field('phone').strategy('preferNonNull')
 * ```
 */
export class FieldMergeBuilder<T extends Record<string, unknown>> {
  private config: Partial<FieldMergeConfig> = {}
  /** @internal Reference to parent builder for chaining */
  public readonly _parent: MergeBuilder<T>

  constructor(parent: MergeBuilder<T>, fieldPath: string) {
    this._parent = parent
    this.config.field = fieldPath
  }

  /**
   * Set the merge strategy for this field.
   *
   * @param strategy - The merge strategy to use
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * .field('firstName').strategy('preferLonger')
   * ```
   */
  strategy(strategy: MergeStrategy): this {
    this.config.strategy = strategy
    return this
  }

  /**
   * Set a custom merge function for this field.
   * Automatically sets strategy to 'custom'.
   *
   * @param fn - Custom merge function
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * .field('fullName').custom((values, records) => {
   *   // Custom logic to determine the best full name
   *   return values.find(v => v.includes(' ')) || values[0]
   * })
   * ```
   */
  custom<V>(fn: (values: V[], records: SourceRecord[]) => V): this {
    this.config.strategy = 'custom'
    this.config.customMerge = fn as CustomMergeFunction
    return this
  }

  /**
   * Set options for this field's merge strategy.
   *
   * @param opts - Strategy-specific options
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * .field('tags').strategy('concatenate').options({ removeDuplicates: true })
   * ```
   */
  options(opts: FieldMergeOptions): this {
    this.config.options = opts
    return this
  }

  /**
   * Configure the next field and finalize this field's configuration.
   *
   * @param fieldPath - Path to the next field (supports dot notation)
   * @returns A new FieldMergeBuilder for the specified field
   */
  field(fieldPath: keyof T | string): FieldMergeBuilder<T> {
    // Note: finalize() is called by parent.field() via finalizePendingField()
    return this._parent.field(fieldPath)
  }

  /**
   * Return to the parent MergeBuilder.
   *
   * @returns The parent MergeBuilder
   */
  done(): MergeBuilder<T> {
    this._parent.finalizePendingField()
    return this._parent
  }

  /**
   * Finalize the field configuration and add it to the parent.
   * @internal
   */
  finalize(): void {
    if (this.config.field && this.config.strategy) {
      this._parent.addFieldConfig(this.config as FieldMergeConfig)
    }
  }

  /**
   * Get the current configuration for testing purposes.
   * @internal
   */
  getConfig(): Partial<FieldMergeConfig> {
    return { ...this.config }
  }
}

/**
 * Fluent builder for configuring merge strategies.
 *
 * @typeParam T - The record type being merged
 *
 * @example
 * ```typescript
 * const mergeConfig = new MergeBuilder<Person>()
 *   .timestampField('updatedAt')
 *   .defaultStrategy('preferNonNull')
 *   .onConflict('useDefault')
 *   .field('firstName').strategy('preferLonger')
 *   .field('lastName').strategy('preferLonger')
 *   .field('email').strategy('preferNewer')
 *   .field('phone').strategy('preferNonNull')
 *   .field('addresses').strategy('union')
 *   .build()
 * ```
 */
export class MergeBuilder<T extends Record<string, unknown>> {
  private fieldStrategies: FieldMergeConfig[] = []
  private defaultMergeStrategy: MergeStrategy =
    DEFAULT_MERGE_CONFIG.defaultStrategy
  private timestampFieldName?: string
  private provenanceTracking: boolean = DEFAULT_MERGE_CONFIG.trackProvenance
  private conflictResolutionMode: ConflictResolution =
    DEFAULT_MERGE_CONFIG.conflictResolution
  private schema?: SchemaDefinition<T>
  /** @internal Track the current pending field builder for finalization */
  private _pendingFieldBuilder?: FieldMergeBuilder<T>

  constructor(schema?: SchemaDefinition<T>) {
    this.schema = schema
  }

  /**
   * Set the schema for validation purposes.
   * @internal
   */
  setSchema(schema: SchemaDefinition<T>): this {
    this.schema = schema
    return this
  }

  /**
   * Set the default merge strategy for fields without explicit configuration.
   *
   * @param strategy - The default strategy to use
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * .defaultStrategy('preferNonNull')
   * ```
   */
  defaultStrategy(strategy: MergeStrategy): this {
    this.validateStrategy(strategy)
    this.defaultMergeStrategy = strategy
    return this
  }

  /**
   * Set the timestamp field used for temporal strategies (preferNewer, preferOlder).
   *
   * @param field - Field path to the timestamp field
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * .timestampField('updatedAt')
   * ```
   */
  timestampField(field: keyof T | string): this {
    this.timestampFieldName = String(field)
    return this
  }

  /**
   * Enable or disable provenance tracking.
   *
   * @param enabled - Whether to track provenance (default: true)
   * @returns This builder for chaining
   */
  trackProvenance(enabled: boolean): this {
    this.provenanceTracking = enabled
    return this
  }

  /**
   * Set the conflict resolution mode.
   *
   * @param mode - How to handle conflicts
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * .onConflict('useDefault')  // Use default strategy when conflicts occur
   * .onConflict('error')       // Throw an error on conflict
   * .onConflict('markConflict') // Mark field as conflicted without resolving
   * ```
   */
  onConflict(mode: ConflictResolution): this {
    this.validateConflictResolution(mode)
    this.conflictResolutionMode = mode
    return this
  }

  /**
   * Start configuring a field's merge strategy.
   *
   * @param fieldPath - Path to the field (supports dot notation for nested fields)
   * @returns A FieldMergeBuilder for configuring the field
   *
   * @example
   * ```typescript
   * .field('firstName').strategy('preferLonger')
   * .field('address.city').strategy('preferNewer')
   * ```
   */
  field(fieldPath: keyof T | string): FieldMergeBuilder<T> {
    // Finalize any pending field builder before creating a new one
    this.finalizePendingField()

    const path = String(fieldPath)
    this.validateFieldPath(path)
    const fieldBuilder = new FieldMergeBuilder<T>(this, path)
    this._pendingFieldBuilder = fieldBuilder
    return fieldBuilder
  }

  /**
   * Finalize any pending field builder.
   * @internal
   */
  finalizePendingField(): void {
    if (this._pendingFieldBuilder) {
      this._pendingFieldBuilder.finalize()
      this._pendingFieldBuilder = undefined
    }
  }

  /**
   * Add a field configuration to the builder.
   * @internal
   */
  addFieldConfig(config: FieldMergeConfig): void {
    // Check for duplicate field paths
    const existingIndex = this.fieldStrategies.findIndex(
      (fs) => fs.field === config.field
    )
    if (existingIndex !== -1) {
      // Replace existing configuration
      this.fieldStrategies[existingIndex] = config
    } else {
      this.fieldStrategies.push(config)
    }
  }

  /**
   * Build and return the merge configuration.
   *
   * @returns The complete merge configuration
   * @throws {MergeBuilderError} If configuration is invalid
   */
  build(): MergeConfig {
    // Finalize any pending field builder before building
    this.finalizePendingField()

    // Validate the complete configuration
    this.validate()

    return {
      fieldStrategies: [...this.fieldStrategies],
      defaultStrategy: this.defaultMergeStrategy,
      timestampField: this.timestampFieldName,
      trackProvenance: this.provenanceTracking,
      conflictResolution: this.conflictResolutionMode,
    }
  }

  /**
   * Validate a strategy name.
   * @internal
   */
  private validateStrategy(strategy: MergeStrategy): void {
    if (!MERGE_STRATEGIES.includes(strategy)) {
      throw new MergeBuilderError(
        `Invalid merge strategy '${strategy}'. Valid strategies are: ${MERGE_STRATEGIES.join(', ')}`
      )
    }
  }

  /**
   * Validate a conflict resolution mode.
   * @internal
   */
  private validateConflictResolution(mode: ConflictResolution): void {
    const validModes: ConflictResolution[] = [
      'error',
      'useDefault',
      'markConflict',
    ]
    if (!validModes.includes(mode)) {
      throw new MergeBuilderError(
        `Invalid conflict resolution mode '${mode}'. Valid modes are: ${validModes.join(', ')}`
      )
    }
  }

  /**
   * Validate a field path against the schema.
   * @internal
   */
  private validateFieldPath(fieldPath: string): void {
    if (!this.schema) return // Skip validation if no schema

    const rootField = fieldPath.split('.')[0]
    if (!(rootField in this.schema)) {
      const availableFields = Object.keys(this.schema).join(', ')
      throw new MergeBuilderError(
        `Field '${rootField}' does not exist in schema. Available fields: ${availableFields}`
      )
    }
  }

  /**
   * Validate the complete configuration.
   * @internal
   */
  private validate(): void {
    // Validate default strategy
    this.validateStrategy(this.defaultMergeStrategy)

    // Validate each field strategy
    for (const fieldConfig of this.fieldStrategies) {
      // Check strategy is valid
      this.validateStrategy(fieldConfig.strategy)

      // Check custom strategy has custom function
      if (fieldConfig.strategy === 'custom' && !fieldConfig.customMerge) {
        throw new MergeBuilderError(
          `Field '${fieldConfig.field}' uses 'custom' strategy but no custom merge function was provided. ` +
            `Use .custom(fn) instead of .strategy('custom').`
        )
      }

      // Check numeric strategies against schema
      if (this.schema && NUMERIC_STRATEGIES.includes(fieldConfig.strategy)) {
        const rootField = fieldConfig.field.split('.')[0]
        const fieldDef = this.schema[rootField as keyof T]
        if (fieldDef && !NUMERIC_FIELD_TYPES.includes(fieldDef.type)) {
          throw new MergeBuilderError(
            `Strategy '${fieldConfig.strategy}' requires a numeric field, but '${rootField}' has type '${fieldDef.type}'. ` +
              `Numeric strategies (average, sum, min, max) can only be used with number fields.`
          )
        }
      }
    }

    // Check for duplicate field paths
    const fieldPaths = this.fieldStrategies.map((fs) => fs.field)
    const seen = new Set<string>()
    for (const path of fieldPaths) {
      if (seen.has(path)) {
        throw new MergeBuilderError(
          `Duplicate field configuration for '${path}'. Each field can only be configured once.`
        )
      }
      seen.add(path)
    }
  }
}

/**
 * Create a new MergeBuilder instance.
 *
 * @typeParam T - The record type being merged
 * @param schema - Optional schema for validation
 * @returns A new MergeBuilder instance
 */
export function createMergeBuilder<T extends Record<string, unknown>>(
  schema?: SchemaDefinition<T>
): MergeBuilder<T> {
  return new MergeBuilder<T>(schema)
}
