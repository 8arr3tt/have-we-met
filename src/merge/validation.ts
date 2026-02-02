/**
 * Validation functions for merge operations
 * @module merge/validation
 */

import type {
  MergeConfig,
  FieldMergeConfig,
  SourceRecord,
  MergeStrategy,
} from './types.js'
import { MERGE_STRATEGIES, NUMERIC_STRATEGIES } from './types.js'
import {
  MergeValidationError,
  InsufficientSourceRecordsError,
  CustomStrategyMissingError,
  InvalidStrategyError,
  StrategyTypeMismatchError,
} from './merge-error.js'
import type { SchemaDefinition, FieldType } from '../types/schema.js'

/**
 * Field types considered numeric
 */
const NUMERIC_FIELD_TYPES: FieldType[] = ['number']

/**
 * Validates a complete merge configuration
 * @param config - The merge configuration to validate
 * @throws {MergeValidationError} If configuration is invalid
 */
export function validateMergeConfig(config: MergeConfig): void {
  // Validate default strategy
  if (!config.defaultStrategy) {
    throw new MergeValidationError(
      'defaultStrategy',
      'defaultStrategy is required'
    )
  }

  if (!MERGE_STRATEGIES.includes(config.defaultStrategy)) {
    throw new MergeValidationError(
      'defaultStrategy',
      `invalid strategy '${config.defaultStrategy}', must be one of: ${MERGE_STRATEGIES.join(', ')}`
    )
  }

  // Validate field strategies array
  if (!Array.isArray(config.fieldStrategies)) {
    throw new MergeValidationError(
      'fieldStrategies',
      'fieldStrategies must be an array'
    )
  }

  // Validate each field strategy
  for (const fieldStrategy of config.fieldStrategies) {
    validateFieldStrategy(fieldStrategy)
  }

  // Check for duplicate field paths
  const fieldPaths = config.fieldStrategies.map((fs) => fs.field)
  const duplicates = fieldPaths.filter(
    (path, index) => fieldPaths.indexOf(path) !== index
  )
  if (duplicates.length > 0) {
    throw new MergeValidationError(
      'fieldStrategies',
      `duplicate field paths: ${[...new Set(duplicates)].join(', ')}`
    )
  }

  // Validate conflict resolution mode
  const validConflictModes = ['error', 'useDefault', 'markConflict']
  if (!validConflictModes.includes(config.conflictResolution)) {
    throw new MergeValidationError(
      'conflictResolution',
      `invalid mode '${config.conflictResolution}', must be one of: ${validConflictModes.join(', ')}`
    )
  }
}

/**
 * Validates a single field merge strategy configuration
 * @param fieldStrategy - The field strategy to validate
 * @throws {MergeValidationError | CustomStrategyMissingError} If configuration is invalid
 */
export function validateFieldStrategy(fieldStrategy: FieldMergeConfig): void {
  // Validate field path
  if (!fieldStrategy.field || typeof fieldStrategy.field !== 'string') {
    throw new MergeValidationError(
      'field',
      'field path must be a non-empty string'
    )
  }

  // Validate strategy is provided and valid
  if (!fieldStrategy.strategy) {
    throw new MergeValidationError(
      `fieldStrategies.${fieldStrategy.field}.strategy`,
      'strategy is required'
    )
  }

  if (!MERGE_STRATEGIES.includes(fieldStrategy.strategy)) {
    throw new InvalidStrategyError(fieldStrategy.strategy, {
      field: fieldStrategy.field,
    })
  }

  // Validate custom strategy has custom function
  if (fieldStrategy.strategy === 'custom' && !fieldStrategy.customMerge) {
    throw new CustomStrategyMissingError(fieldStrategy.field)
  }

  // Validate custom function is actually a function
  if (
    fieldStrategy.customMerge &&
    typeof fieldStrategy.customMerge !== 'function'
  ) {
    throw new MergeValidationError(
      `fieldStrategies.${fieldStrategy.field}.customMerge`,
      'customMerge must be a function'
    )
  }

  // Validate options if provided
  if (fieldStrategy.options) {
    validateFieldMergeOptions(
      fieldStrategy.field,
      fieldStrategy.strategy,
      fieldStrategy.options
    )
  }
}

/**
 * Validates field merge options
 * @param field - Field path for error messages
 * @param _strategy - The strategy being used (reserved for future validation)
 * @param options - The options to validate
 * @throws {MergeValidationError} If options are invalid
 */
function validateFieldMergeOptions(
  field: string,
  _strategy: MergeStrategy,
  options: FieldMergeConfig['options']
): void {
  if (!options) return

  // Validate separator for concatenate strategy
  if (
    options.separator !== undefined &&
    typeof options.separator !== 'string'
  ) {
    throw new MergeValidationError(
      `fieldStrategies.${field}.options.separator`,
      'separator must be a string'
    )
  }

  // Validate dateField for temporal strategies
  if (
    options.dateField !== undefined &&
    typeof options.dateField !== 'string'
  ) {
    throw new MergeValidationError(
      `fieldStrategies.${field}.options.dateField`,
      'dateField must be a string'
    )
  }

  // Validate nullHandling
  if (options.nullHandling !== undefined) {
    const validNullHandling = ['skip', 'include', 'preferNull']
    if (!validNullHandling.includes(options.nullHandling)) {
      throw new MergeValidationError(
        `fieldStrategies.${field}.options.nullHandling`,
        `invalid value '${options.nullHandling}', must be one of: ${validNullHandling.join(', ')}`
      )
    }
  }

  // Validate removeDuplicates
  if (
    options.removeDuplicates !== undefined &&
    typeof options.removeDuplicates !== 'boolean'
  ) {
    throw new MergeValidationError(
      `fieldStrategies.${field}.options.removeDuplicates`,
      'removeDuplicates must be a boolean'
    )
  }
}

/**
 * Validates source records for merge operation
 * @param sourceRecords - Array of source records to validate
 * @throws {InsufficientSourceRecordsError | MergeValidationError} If validation fails
 */
export function validateSourceRecords<T extends Record<string, unknown>>(
  sourceRecords: SourceRecord<T>[]
): void {
  // Must have at least 2 records to merge
  if (!sourceRecords || sourceRecords.length < 2) {
    throw new InsufficientSourceRecordsError(sourceRecords?.length ?? 0)
  }

  // Validate each source record
  for (let i = 0; i < sourceRecords.length; i++) {
    const record = sourceRecords[i]

    if (!record.id || typeof record.id !== 'string') {
      throw new MergeValidationError(
        `sourceRecords[${i}].id`,
        'id must be a non-empty string',
        { record }
      )
    }

    if (!record.record || typeof record.record !== 'object') {
      throw new MergeValidationError(
        `sourceRecords[${i}].record`,
        'record must be an object',
        { record }
      )
    }

    if (!(record.createdAt instanceof Date)) {
      throw new MergeValidationError(
        `sourceRecords[${i}].createdAt`,
        'createdAt must be a Date',
        { record }
      )
    }

    if (!(record.updatedAt instanceof Date)) {
      throw new MergeValidationError(
        `sourceRecords[${i}].updatedAt`,
        'updatedAt must be a Date',
        { record }
      )
    }
  }

  // Check for duplicate record IDs
  const ids = sourceRecords.map((r) => r.id)
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index)
  if (duplicateIds.length > 0) {
    throw new MergeValidationError(
      'sourceRecords',
      `duplicate record IDs: ${[...new Set(duplicateIds)].join(', ')}`
    )
  }
}

/**
 * Validates that field paths exist in the schema
 * @param fieldStrategies - Field strategies to validate
 * @param schema - Schema definition to validate against
 * @throws {MergeValidationError} If field path does not exist in schema
 */
export function validateFieldPathsAgainstSchema<T extends object>(
  fieldStrategies: FieldMergeConfig[],
  schema: SchemaDefinition<T>
): void {
  const schemaFields = Object.keys(schema)

  for (const fieldStrategy of fieldStrategies) {
    // Handle dot notation by checking the root field
    const rootField = fieldStrategy.field.split('.')[0]

    if (!schemaFields.includes(rootField)) {
      throw new MergeValidationError(
        `fieldStrategies.${fieldStrategy.field}`,
        `field '${rootField}' does not exist in schema. Available fields: ${schemaFields.join(', ')}`
      )
    }
  }
}

/**
 * Validates that strategies are compatible with field types
 * @param fieldStrategies - Field strategies to validate
 * @param schema - Schema definition to check field types
 * @throws {StrategyTypeMismatchError} If strategy is incompatible with field type
 */
export function validateStrategyFieldTypeCompatibility<T extends object>(
  fieldStrategies: FieldMergeConfig[],
  schema: SchemaDefinition<T>
): void {
  for (const fieldStrategy of fieldStrategies) {
    const rootField = fieldStrategy.field.split('.')[0]
    const fieldDef = schema[rootField as keyof T]

    if (!fieldDef) continue // Skip if field not in schema (caught by other validation)

    // Check numeric strategies are only used with numeric fields
    if (NUMERIC_STRATEGIES.includes(fieldStrategy.strategy)) {
      if (!NUMERIC_FIELD_TYPES.includes(fieldDef.type)) {
        throw new StrategyTypeMismatchError(
          fieldStrategy.strategy,
          fieldStrategy.field,
          'number',
          fieldDef.type
        )
      }
    }
  }
}

/**
 * Validates a complete merge request including config and source records
 * @param sourceRecords - Source records to merge
 * @param config - Merge configuration
 * @param schema - Optional schema for additional validation
 * @throws {MergeValidationError | InsufficientSourceRecordsError | StrategyTypeMismatchError} If validation fails
 */
export function validateMergeRequest<T extends Record<string, unknown>>(
  sourceRecords: SourceRecord<T>[],
  config: MergeConfig,
  schema?: SchemaDefinition<T>
): void {
  // Validate config
  validateMergeConfig(config)

  // Validate source records
  validateSourceRecords(sourceRecords)

  // If schema provided, validate field paths and type compatibility
  if (schema) {
    validateFieldPathsAgainstSchema(config.fieldStrategies, schema)
    validateStrategyFieldTypeCompatibility(config.fieldStrategies, schema)
  }
}

/**
 * Checks if a value is null or undefined
 * @param value - Value to check
 * @returns true if value is null or undefined
 */
export function isNullOrUndefined(value: unknown): value is null | undefined {
  return value === null || value === undefined
}

/**
 * Checks if a value is empty (null, undefined, empty string, or empty array)
 * @param value - Value to check
 * @returns true if value is considered empty
 */
export function isEmpty(value: unknown): boolean {
  if (isNullOrUndefined(value)) return true
  if (typeof value === 'string' && value.trim() === '') return true
  if (Array.isArray(value) && value.length === 0) return true
  return false
}

/**
 * Gets a nested value from an object using dot notation
 * @param obj - Object to get value from
 * @param path - Dot-notation path (e.g., 'address.city')
 * @returns The value at the path, or undefined if not found
 */
export function getNestedValue(
  obj: Record<string, unknown>,
  path: string
): unknown {
  const parts = path.split('.')
  let current: unknown = obj

  for (const part of parts) {
    if (current === null || current === undefined) return undefined
    if (typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[part]
  }

  return current
}

/**
 * Sets a nested value in an object using dot notation
 * @param obj - Object to set value in
 * @param path - Dot-notation path (e.g., 'address.city')
 * @param value - Value to set
 */
export function setNestedValue(
  obj: Record<string, unknown>,
  path: string,
  value: unknown
): void {
  const parts = path.split('.')
  let current: Record<string, unknown> = obj

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]
    if (
      !(part in current) ||
      typeof current[part] !== 'object' ||
      current[part] === null
    ) {
      current[part] = {}
    }
    current = current[part] as Record<string, unknown>
  }

  current[parts[parts.length - 1]] = value
}
