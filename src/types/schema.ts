/**
 * Supported field types for schema definitions.
 * These types influence default matching strategies and normalization.
 * - `'string'` - Generic string field
 * - `'name'` - Personal name (can have components like first/last)
 * - `'email'` - Email address
 * - `'phone'` - Phone number
 * - `'date'` - Date value
 * - `'address'` - Physical address
 * - `'number'` - Numeric field
 * - `'custom'` - Custom field with user-defined handling
 */
export type FieldType =
  | 'string'
  | 'name'
  | 'email'
  | 'phone'
  | 'date'
  | 'address'
  | 'number'
  | 'custom'

/**
 * Configuration for a single field in the schema.
 */
export interface FieldDefinition {
  /** The semantic type of this field */
  type: FieldType
  /** Sub-component of the field (e.g., 'first', 'last' for name fields) */
  component?: string
  /** Whether this field is required for matching */
  required?: boolean
  /** Named normalizer to apply before comparison */
  normalizer?: string
  /** Custom normalizer function for pre-processing values */
  customNormalizer?: (value: unknown) => unknown
}

/**
 * Maps field names to their definitions.
 * Defines the structure and types of fields in records being matched.
 *
 * @typeParam T - The shape of the user's data object
 */
export type SchemaDefinition<T extends object = object> = {
  [K in keyof T]?: FieldDefinition
}
