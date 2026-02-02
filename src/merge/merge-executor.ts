/**
 * Merge executor for combining source records into golden records
 * @module merge/merge-executor
 */

import type {
  MergeConfig,
  SourceRecord,
  MergeResult,
  MergeRequest,
  Provenance,
  FieldProvenance,
  MergeConflict,
  FieldMergeConfig,
  MergeStrategy,
  StrategyFunction,
  FieldMergeOptions,
  MergeContext,
} from './types.js'
import { DEFAULT_MERGE_CONFIG } from './types.js'
import {
  validateSourceRecords,
  validateMergeConfig,
  getNestedValue,
  setNestedValue,
} from './validation.js'
import { getStrategy, hasStrategy } from './strategies/index.js'
import { MergeConflictError, InvalidStrategyError } from './merge-error.js'
import {
  createMergeContext,
  recordFieldProvenance,
  recordConflict,
  setCurrentField,
  calculateStats,
} from './merge-context.js'
import type { SchemaDefinition } from '../types/schema.js'

/**
 * Generates a unique ID for the golden record
 */
function generateGoldenRecordId(
  targetRecordId?: string,
  sourceRecords?: SourceRecord[]
): string {
  if (targetRecordId) {
    return targetRecordId
  }
  if (sourceRecords && sourceRecords.length > 0) {
    return sourceRecords[0].id
  }
  return `golden-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

/**
 * Collects all field paths from source records
 */
function collectFieldPaths<T extends Record<string, unknown>>(
  sourceRecords: SourceRecord<T>[],
  schema?: SchemaDefinition<T>
): string[] {
  const fieldSet = new Set<string>()

  // If schema is provided, use schema fields
  if (schema) {
    for (const key of Object.keys(schema)) {
      fieldSet.add(key)
    }
  }

  // Also collect fields from source records
  for (const sourceRecord of sourceRecords) {
    collectFieldPathsFromObject(sourceRecord.record, '', fieldSet)
  }

  return Array.from(fieldSet)
}

/**
 * Recursively collects field paths from an object
 */
function collectFieldPathsFromObject(
  obj: Record<string, unknown>,
  prefix: string,
  fieldSet: Set<string>
): void {
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key
    fieldSet.add(path)

    // Only recurse into plain objects, not arrays or other types
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      collectFieldPathsFromObject(
        value as Record<string, unknown>,
        path,
        fieldSet
      )
    }
  }
}

/**
 * Gets the strategy configuration for a field
 */
function getFieldStrategy(
  field: string,
  config: MergeConfig
): { strategy: MergeStrategy; fieldConfig?: FieldMergeConfig } {
  // Check for explicit field configuration
  const fieldConfig = config.fieldStrategies.find((fs) => fs.field === field)
  if (fieldConfig) {
    return { strategy: fieldConfig.strategy, fieldConfig }
  }

  // Check for parent path matches (for nested fields)
  const parts = field.split('.')
  for (let i = parts.length - 1; i > 0; i--) {
    const parentPath = parts.slice(0, i).join('.')
    const parentConfig = config.fieldStrategies.find(
      (fs) => fs.field === parentPath
    )
    if (parentConfig) {
      return { strategy: parentConfig.strategy, fieldConfig: parentConfig }
    }
  }

  // Use default strategy
  return { strategy: config.defaultStrategy }
}

/**
 * Extracts field values from all source records
 */
function extractFieldValues<T extends Record<string, unknown>>(
  sourceRecords: SourceRecord<T>[],
  field: string
): { values: unknown[]; valueByRecordId: Map<string, unknown> } {
  const values: unknown[] = []
  const valueByRecordId = new Map<string, unknown>()

  for (const sourceRecord of sourceRecords) {
    const value = getNestedValue(
      sourceRecord.record as Record<string, unknown>,
      field
    )
    values.push(value)
    valueByRecordId.set(sourceRecord.id, value)
  }

  return { values, valueByRecordId }
}

/**
 * Determines which source record contributed a value
 */
function findSourceRecordForValue(
  value: unknown,
  valueByRecordId: Map<string, unknown>
): string | undefined {
  // Handle undefined case - no source contributed
  if (value === undefined) {
    return undefined
  }

  // Find the first record with a matching value
  for (const [recordId, recordValue] of valueByRecordId) {
    if (valuesEqual(value, recordValue)) {
      return recordId
    }
  }

  return undefined
}

/**
 * Compares two values for equality
 */
function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a === null || b === null) return false
  if (typeof a !== typeof b) return false

  // Arrays
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    return a.every((val, idx) => valuesEqual(val, b[idx]))
  }

  // Objects
  if (typeof a === 'object' && typeof b === 'object') {
    const aKeys = Object.keys(a as object)
    const bKeys = Object.keys(b as object)
    if (aKeys.length !== bKeys.length) return false
    return aKeys.every((key) =>
      valuesEqual(
        (a as Record<string, unknown>)[key],
        (b as Record<string, unknown>)[key]
      )
    )
  }

  return false
}

/**
 * Checks if there's a conflict (all values different and non-null)
 */
function detectConflict(values: unknown[]): boolean {
  const nonNullValues = values.filter((v) => v !== null && v !== undefined)

  // No conflict if fewer than 2 non-null values
  if (nonNullValues.length < 2) return false

  // Check if all non-null values are the same
  const firstValue = nonNullValues[0]
  const allSame = nonNullValues.every((v) => valuesEqual(v, firstValue))

  return !allSame
}

/**
 * MergeExecutor - Executes merge operations on source records
 *
 * @example
 * ```typescript
 * const executor = new MergeExecutor({
 *   defaultStrategy: 'preferNonNull',
 *   fieldStrategies: [
 *     { field: 'email', strategy: 'preferNewer' },
 *     { field: 'name', strategy: 'preferLonger' },
 *   ],
 *   trackProvenance: true,
 *   conflictResolution: 'useDefault',
 * })
 *
 * const result = await executor.merge({
 *   sourceRecords: [record1, record2],
 *   mergedBy: 'system',
 * })
 * ```
 */
export class MergeExecutor<T extends Record<string, unknown>> {
  private readonly config: MergeConfig
  private readonly schema?: SchemaDefinition<T>

  /**
   * Creates a new MergeExecutor
   *
   * @param config - Merge configuration (partial config will be merged with defaults)
   * @param schema - Optional schema for field type validation
   */
  constructor(
    config: Partial<MergeConfig> & { fieldStrategies?: FieldMergeConfig[] },
    schema?: SchemaDefinition<T>
  ) {
    this.config = {
      ...DEFAULT_MERGE_CONFIG,
      fieldStrategies: config.fieldStrategies ?? [],
      ...config,
    } as MergeConfig

    this.schema = schema

    // Validate configuration
    validateMergeConfig(this.config)
  }

  /**
   * Executes a merge operation on source records
   *
   * @param request - The merge request containing source records and options
   * @returns The merge result containing the golden record and metadata
   * @throws {InsufficientSourceRecordsError} If fewer than 2 source records provided
   * @throws {MergeValidationError} If source records are invalid
   * @throws {MergeConflictError} If conflict occurs and conflictResolution is 'error'
   */
  async merge(request: MergeRequest<T>): Promise<MergeResult<T>> {
    const {
      sourceRecords,
      targetRecordId,
      configOverrides,
      mergedBy,
      queueItemId,
    } = request

    // Validate source records
    validateSourceRecords(sourceRecords)

    // Merge config with any overrides
    const effectiveConfig: MergeConfig = configOverrides
      ? { ...this.config, ...configOverrides }
      : this.config

    // Create merge context
    const context = createMergeContext(effectiveConfig, sourceRecords)

    // Collect all field paths to process
    const fieldPaths = collectFieldPaths(sourceRecords, this.schema)

    // Initialize golden record
    const goldenRecord: Record<string, unknown> = {}

    // Process each field
    for (const field of fieldPaths) {
      setCurrentField(context, field)
      await this.processField(field, context, goldenRecord)
    }

    setCurrentField(context, undefined)

    // Generate golden record ID
    const goldenRecordId = generateGoldenRecordId(targetRecordId, sourceRecords)

    // Calculate statistics
    const stats = calculateStats(context)

    // Build provenance
    const provenance: Provenance = {
      goldenRecordId,
      sourceRecordIds: sourceRecords.map((r) => r.id),
      mergedAt: new Date(),
      mergedBy,
      queueItemId,
      fieldSources: context.fieldSources,
      strategyUsed: effectiveConfig,
    }

    return {
      goldenRecord: goldenRecord as T,
      goldenRecordId,
      provenance,
      sourceRecords,
      conflicts: context.conflicts,
      stats,
    }
  }

  /**
   * Processes a single field during merge
   */
  private async processField(
    field: string,
    context: MergeContext<T>,
    goldenRecord: Record<string, unknown>
  ): Promise<void> {
    const { values, valueByRecordId } = extractFieldValues(
      context.sourceRecords,
      field
    )

    // Get strategy for this field
    const { strategy, fieldConfig } = getFieldStrategy(field, context.config)

    // Detect potential conflict
    const hasConflict = detectConflict(values)

    // Apply strategy to get result value
    let resultValue: unknown
    let sourceRecordId: string | undefined

    try {
      if (strategy === 'custom' && fieldConfig?.customMerge) {
        // Use custom merge function
        resultValue = fieldConfig.customMerge(
          values,
          context.sourceRecords,
          fieldConfig.options
        )
      } else {
        // Use registered strategy
        resultValue = this.applyStrategy(
          strategy,
          values,
          context.sourceRecords,
          fieldConfig?.options
        )
      }

      // Find which source record contributed this value
      sourceRecordId = findSourceRecordForValue(resultValue, valueByRecordId)
    } catch (error) {
      // Handle strategy errors as conflicts
      if (hasConflict && context.config.conflictResolution === 'error') {
        const conflict: MergeConflict = {
          field,
          values: Array.from(valueByRecordId.entries()).map(
            ([recordId, value]) => ({
              recordId,
              value,
            })
          ),
          resolution: 'deferred',
        }
        throw new MergeConflictError(conflict)
      }
      throw error
    }

    // Handle conflicts based on configuration
    if (hasConflict) {
      const conflict = this.handleConflict(
        field,
        values,
        valueByRecordId,
        resultValue,
        strategy,
        context
      )

      if (conflict) {
        recordConflict(context, conflict)

        if (conflict.resolution === 'deferred') {
          // Don't set a value for deferred conflicts
          resultValue = undefined
        } else {
          resultValue = conflict.resolvedValue
        }
      }
    }

    // Set value in golden record (skip undefined to avoid overwriting with nested paths)
    if (resultValue !== undefined) {
      setNestedValue(goldenRecord, field, resultValue)
    }

    // Record provenance
    if (context.trackProvenance) {
      const fieldProvenance: FieldProvenance = {
        sourceRecordId: sourceRecordId ?? context.sourceRecords[0].id,
        strategyApplied: strategy,
        allValues: Array.from(valueByRecordId.entries()).map(
          ([recordId, value]) => ({
            recordId,
            value,
          })
        ),
        hadConflict: hasConflict,
        conflictResolution: hasConflict
          ? context.conflicts.find((c) => c.field === field)?.resolutionReason
          : undefined,
      }
      recordFieldProvenance(context, field, fieldProvenance)
    }
  }

  /**
   * Applies a strategy to values
   */
  private applyStrategy(
    strategyName: MergeStrategy,
    values: unknown[],
    records: SourceRecord[],
    options?: FieldMergeOptions
  ): unknown {
    if (!hasStrategy(strategyName)) {
      throw new InvalidStrategyError(strategyName)
    }

    const strategyFn: StrategyFunction = getStrategy(strategyName)
    return strategyFn(values, records, options)
  }

  /**
   * Handles a conflict based on configuration
   */
  private handleConflict(
    field: string,
    values: unknown[],
    valueByRecordId: Map<string, unknown>,
    resolvedValue: unknown,
    strategy: MergeStrategy,
    context: MergeContext<T>
  ): MergeConflict | null {
    const conflictValues = Array.from(valueByRecordId.entries()).map(
      ([recordId, value]) => ({
        recordId,
        value,
      })
    )

    switch (context.config.conflictResolution) {
      case 'error':
        throw new MergeConflictError({
          field,
          values: conflictValues,
          resolution: 'deferred',
        })

      case 'markConflict':
        return {
          field,
          values: conflictValues,
          resolution: 'deferred',
          resolutionReason: `Conflict deferred for manual resolution. Values: ${JSON.stringify(values)}`,
        }

      case 'useDefault':
      default:
        return {
          field,
          values: conflictValues,
          resolution: 'auto',
          resolvedValue,
          resolutionReason: `Auto-resolved using '${strategy}' strategy`,
        }
    }
  }

  /**
   * Gets the current merge configuration
   */
  getConfig(): MergeConfig {
    return { ...this.config }
  }

  /**
   * Gets the schema (if configured)
   */
  getSchema(): SchemaDefinition<T> | undefined {
    return this.schema
  }
}
