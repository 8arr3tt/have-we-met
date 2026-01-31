import type { FieldDefinition, SchemaDefinition, FieldType } from '../types'

export class FieldDefinitionBuilder<T extends object = object> {
  private definition: Partial<FieldDefinition> = {}

  constructor(
    private parent: SchemaBuilder<T>,
    private fieldName: keyof T & string
  ) {}

  /**
   * Sets the semantic type of this field.
   *
   * @param type - The field type (e.g., 'name', 'email', 'phone', 'date', 'address', 'string', 'number', 'custom')
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * schema(builder => builder
   *   .field('email')
   *   .type('email')
   *   .normalizer('email')
   * )
   * ```
   */
  type(type: FieldType): this {
    this.definition.type = type
    return this
  }

  /**
   * Sets the component name for composite fields (e.g., 'first', 'last' for name fields).
   *
   * @param component - The component name
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * schema(builder => builder
   *   .field('firstName')
   *   .type('name')
   *   .component('first')
   * )
   * ```
   */
  component(component: string): this {
    this.definition.component = component
    return this
  }

  /**
   * Marks this field as required for matching.
   *
   * @param required - Whether the field is required
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * schema(builder => builder
   *   .field('email')
   *   .type('email')
   *   .required(true)
   * )
   * ```
   */
  required(required: boolean = true): this {
    this.definition.required = required
    return this
  }

  /**
   * Sets a named normalizer to apply before comparison.
   *
   * Built-in normalizers:
   * - `'name'` - Parse and standardize personal names
   * - `'email'` - Normalize email addresses (lowercase, trim, plus-addressing)
   * - `'phone'` - Normalize phone numbers to E.164 format
   * - `'address'` - Parse and standardize physical addresses
   * - `'date'` - Parse and normalize dates to ISO 8601
   * - `'trim'` - Trim whitespace
   * - `'lowercase'` - Convert to lowercase
   * - `'uppercase'` - Convert to uppercase
   * - `'normalizeWhitespace'` - Collapse multiple spaces to one
   * - `'alphanumericOnly'` - Remove non-alphanumeric characters
   * - `'numericOnly'` - Remove non-numeric characters
   *
   * @param name - The name of the normalizer
   * @param options - Optional configuration for the normalizer
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * schema(builder => builder
   *   .field('email')
   *   .type('email')
   *   .normalizer('email', { removePlusAddressing: true })
   * )
   * ```
   *
   * @example
   * ```typescript
   * schema(builder => builder
   *   .field('fullName')
   *   .type('name')
   *   .normalizer('name', { preserveCase: false, outputFormat: 'full' })
   * )
   * ```
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  normalizer(name: string, options?: any): this {
    this.definition.normalizer = name
    if (options !== undefined) {
      this.definition.normalizerOptions = options
    }
    return this
  }

  /**
   * Sets options for the normalizer without changing the normalizer name.
   * Use this if you want to set options for a normalizer that was already configured.
   *
   * @param options - Configuration options for the normalizer
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * schema(builder => builder
   *   .field('phone')
   *   .type('phone')
   *   .normalizer('phone')
   *   .normalizerOptions({ defaultCountry: 'US', validate: true })
   * )
   * ```
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  normalizerOptions(options: any): this {
    this.definition.normalizerOptions = options
    return this
  }

  /**
   * Sets a custom normalizer function to apply before comparison.
   * Use this for domain-specific normalization logic.
   *
   * The function should:
   * - Accept `unknown` input and return normalized value or `null`
   * - Handle null/undefined gracefully (return null)
   * - Never throw errors (return null for invalid input)
   * - Be idempotent (normalizing twice = normalizing once)
   *
   * @param fn - The custom normalizer function
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * schema(builder => builder
   *   .field('username')
   *   .type('string')
   *   .customNormalizer(value => {
   *     if (!value) return null
   *     return value.toString().toLowerCase().replace(/[^a-z0-9]/g, '')
   *   })
   * )
   * ```
   */
  customNormalizer(fn: (value: unknown) => unknown): this {
    this.definition.customNormalizer = fn
    return this
  }

  /**
   * Configures another field in the schema.
   *
   * @param name - The field name
   * @returns A new FieldDefinitionBuilder for the specified field
   */
  field<K extends keyof T & string>(name: K): FieldDefinitionBuilder<T> {
    this.parent.setFieldDefinition(this.fieldName, this.getDefinition())
    return this.parent.field(name)
  }

  /**
   * Completes the schema configuration and returns the final schema definition.
   *
   * @returns The complete schema definition
   */
  build(): SchemaDefinition<T> {
    this.parent.setFieldDefinition(this.fieldName, this.getDefinition())
    return this.parent.build()
  }

  /**
   * Gets the current field definition (for internal use).
   *
   * @returns The field definition
   */
  getDefinition(): FieldDefinition {
    if (!this.definition.type) {
      throw new Error(`Field '${String(this.fieldName)}' must have a type`)
    }
    return this.definition as FieldDefinition
  }
}

export class SchemaBuilder<T extends object = object> {
  private schema: SchemaDefinition<T> = {} as SchemaDefinition<T>

  /**
   * Configures a field in the schema using the fluent builder pattern.
   *
   * @param name - The field name
   * @returns A FieldDefinitionBuilder for configuring the field
   *
   * @example
   * ```typescript
   * schema(builder => builder
   *   .field('email')
   *     .type('email')
   *     .normalizer('email', { removePlusAddressing: true })
   * )
   * ```
   */
  field<K extends keyof T & string>(name: K): FieldDefinitionBuilder<T>

  /**
   * Configures a field in the schema with a direct definition (backward compatible).
   *
   * @param name - The field name
   * @param definition - The field definition
   * @returns This SchemaBuilder for chaining
   *
   * @example
   * ```typescript
   * schema(builder => builder
   *   .field('email', { type: 'email', normalizer: 'email' })
   * )
   * ```
   */
  field<K extends keyof T & string>(
    name: K,
    definition: FieldDefinition
  ): this

  field<K extends keyof T & string>(
    name: K,
    definition?: FieldDefinition
  ): FieldDefinitionBuilder<T> | this {
    if (definition) {
      // Direct definition mode (backward compatible)
      ;(this.schema as Record<string, FieldDefinition>)[name] = definition
      return this
    }
    // Fluent builder mode
    return new FieldDefinitionBuilder<T>(this, name)
  }

  /**
   * Sets the field definition (for internal use by FieldDefinitionBuilder).
   *
   * @param name - The field name
   * @param definition - The field definition
   */
  setFieldDefinition<K extends keyof T & string>(
    name: K,
    definition: FieldDefinition
  ): void {
    ;(this.schema as Record<string, FieldDefinition>)[name] = definition
  }

  /**
   * Completes the schema configuration and returns the final schema definition.
   *
   * @returns The complete schema definition
   */
  build(): SchemaDefinition<T> {
    return { ...this.schema }
  }
}
