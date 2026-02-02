/**
 * Source-aware merger for multi-source consolidation
 *
 * Extends the merge system to support:
 * - Source priority in conflict resolution
 * - Source-aware provenance tracking
 * - Hybrid priority + strategy approach
 *
 * @module consolidation/source-aware-merger
 */

import type {
  MergeConfig,
  SourceRecord,
  MergeResult,
  MergeRequest,
  MergeConflict,
  FieldProvenance,
  Provenance,
} from '../merge/types.js'
import { DEFAULT_MERGE_CONFIG } from '../merge/types.js'
import { MergeExecutor } from '../merge/merge-executor.js'
import type { ConsolidationSource, MappedRecord } from './types.js'
import { ConsolidationError } from './types.js'
import type { SchemaDefinition } from '../types/schema.js'

/**
 * Extended source record with source priority information
 */
export interface SourceAwareRecord<T extends Record<string, unknown>>
  extends SourceRecord<T> {
  /**
   * Source system identifier
   */
  sourceId: string

  /**
   * Source priority (higher = more trusted)
   */
  sourcePriority: number

  /**
   * Original record ID from source system
   */
  sourceRecordId: string | number
}

/**
 * Configuration for source-aware merging
 */
export interface SourceAwareMergeConfig extends MergeConfig {
  /**
   * Whether to use source priority for conflict resolution
   *
   * If true, higher priority sources win conflicts
   * If false, only merge strategies are used
   *
   * @default true
   */
  useSourcePriority?: boolean

  /**
   * How to combine source priority with merge strategies
   *
   * - 'priority-first': Source priority takes precedence, strategies used as tiebreaker
   * - 'priority-fallback': Use strategies first, priority only if strategy produces ties
   * - 'priority-only': Ignore strategies, use priority exclusively
   *
   * @default 'priority-first'
   */
  priorityMode?: 'priority-first' | 'priority-fallback' | 'priority-only'
}

/**
 * Extended provenance with source information
 */
export interface SourceAwareProvenance extends Provenance {
  /**
   * Source system IDs for each source record
   */
  sourceIds: string[]

  /**
   * Source-level provenance: which source contributed each field
   */
  sourceProvenance?: Record<string, string>
}

/**
 * Source-aware merger that handles conflicts using source priorities
 *
 * When multiple sources provide different values for a field:
 * 1. Check source priorities (if enabled)
 * 2. Apply merge strategy (if priority doesn't resolve)
 * 3. Track detailed provenance with source information
 *
 * @example
 * ```typescript
 * const merger = new SourceAwareMerger({
 *   defaultStrategy: 'preferNonNull',
 *   useSourcePriority: true,
 *   priorityMode: 'priority-first',
 *   trackProvenance: true
 * })
 *
 * const result = await merger.mergeWithSourcePriority({
 *   records: [crmRecord, billingRecord],
 *   sources: [crmSource, billingSource]
 * })
 * ```
 */
export class SourceAwareMerger<T extends Record<string, unknown>> {
  private readonly config: SourceAwareMergeConfig
  private readonly schema?: SchemaDefinition<T>
  private readonly baseExecutor: MergeExecutor<T>

  /**
   * Creates a new SourceAwareMerger
   *
   * @param config - Merge configuration with source-aware options
   * @param schema - Optional schema for field validation
   */
  constructor(
    config: Partial<SourceAwareMergeConfig>,
    schema?: SchemaDefinition<T>
  ) {
    this.config = {
      ...DEFAULT_MERGE_CONFIG,
      useSourcePriority: true,
      priorityMode: 'priority-first',
      ...config,
    } as SourceAwareMergeConfig

    this.schema = schema

    // Create base executor for strategy application
    this.baseExecutor = new MergeExecutor<T>(this.config, schema)
  }

  /**
   * Merge records with source priority awareness
   *
   * @param request - Merge request with mapped records and source information
   * @returns Merge result with source-aware provenance
   */
  async mergeWithSourcePriority(request: {
    records: MappedRecord<T>[]
    sources: Array<ConsolidationSource<Record<string, unknown>, T>>
    mergedBy?: string
    queueItemId?: string
  }): Promise<MergeResult<T> & { sourceProvenance: SourceAwareProvenance }> {
    const { records, sources, mergedBy, queueItemId } = request

    if (records.length < 2) {
      throw new ConsolidationError(
        'At least 2 records required for merging',
        'INSUFFICIENT_RECORDS',
        { recordCount: records.length }
      )
    }

    // Create source priority map
    const sourcePriorityMap = this.buildSourcePriorityMap(sources)

    // Convert mapped records to source-aware records
    const sourceAwareRecords = this.convertToSourceAwareRecords(
      records,
      sourcePriorityMap
    )

    // If source priority is disabled, use base executor
    if (!this.config.useSourcePriority) {
      const baseResult = await this.baseExecutor.merge({
        sourceRecords: sourceAwareRecords,
        mergedBy,
        queueItemId,
      })

      return this.enhanceWithSourceProvenance(baseResult, sourceAwareRecords)
    }

    // Apply source-aware merge logic
    return this.mergeWithPriority(
      sourceAwareRecords,
      mergedBy,
      queueItemId
    )
  }

  /**
   * Merge records using source priority
   */
  private async mergeWithPriority(
    records: SourceAwareRecord<T>[],
    mergedBy?: string,
    queueItemId?: string
  ): Promise<MergeResult<T> & { sourceProvenance: SourceAwareProvenance }> {
    // Sort records by priority (highest first)
    const sortedRecords = [...records].sort(
      (a, b) => b.sourcePriority - a.sourcePriority
    )

    // Collect all field paths
    const fieldPaths = this.collectFieldPaths(records)

    // Initialize golden record and provenance
    const goldenRecord: Record<string, unknown> = {}
    const fieldSources: Record<string, FieldProvenance> = {}
    const sourceProvenance: Record<string, string> = {}
    const conflicts: MergeConflict[] = []

    // Process each field
    for (const field of fieldPaths) {
      const result = await this.processFieldWithPriority(
        field,
        sortedRecords,
        fieldPaths
      )

      if (result.value !== undefined) {
        this.setNestedValue(goldenRecord, field, result.value)
      }

      if (result.sourceId) {
        sourceProvenance[field] = result.sourceId
      }

      if (result.provenance && this.config.trackProvenance) {
        fieldSources[field] = result.provenance
      }

      if (result.conflict) {
        conflicts.push(result.conflict)
      }
    }

    // Generate golden record ID
    const goldenRecordId = records[0]?.id || this.generateId()

    // Build provenance
    const provenance: SourceAwareProvenance = {
      goldenRecordId,
      sourceRecordIds: records.map((r) => r.id),
      sourceIds: records.map((r) => r.sourceId),
      mergedAt: new Date(),
      mergedBy,
      queueItemId,
      fieldSources,
      sourceProvenance,
      strategyUsed: this.config,
    }

    return {
      goldenRecord: goldenRecord as T,
      goldenRecordId,
      provenance,
      sourceProvenance: provenance,
      sourceRecords: records,
      conflicts,
      stats: {
        totalFields: fieldPaths.length,
        mergedFields: Object.keys(goldenRecord).length,
        conflictCount: conflicts.length,
        autoResolvedConflicts: conflicts.filter((c) => c.resolution === 'auto')
          .length,
        deferredConflicts: conflicts.filter((c) => c.resolution === 'deferred')
          .length,
      },
    }
  }

  /**
   * Process a single field with priority-aware logic
   */
  private async processFieldWithPriority(
    field: string,
    records: SourceAwareRecord<T>[],
    allFields: string[]
  ): Promise<{
    value: unknown
    sourceId?: string
    provenance?: FieldProvenance
    conflict?: MergeConflict
  }> {
    // Extract values from all records
    const fieldValues = records.map((record) => ({
      recordId: record.id,
      sourceId: record.sourceId,
      priority: record.sourcePriority,
      value: this.getNestedValue(record.record, field),
    }))

    // Filter non-null values
    const nonNullValues = fieldValues.filter(
      (fv) => fv.value !== null && fv.value !== undefined
    )

    if (nonNullValues.length === 0) {
      return { value: undefined }
    }

    if (nonNullValues.length === 1) {
      return {
        value: nonNullValues[0].value,
        sourceId: nonNullValues[0].sourceId,
      }
    }

    // Check for conflict
    const hasConflict = this.detectConflict(nonNullValues.map((fv) => fv.value))

    if (!hasConflict) {
      // All values are the same - use first
      return {
        value: nonNullValues[0].value,
        sourceId: nonNullValues[0].sourceId,
      }
    }

    // Conflict exists - apply resolution logic
    return this.resolveConflict(field, fieldValues, records)
  }

  /**
   * Resolve a conflict using priority and/or strategy
   */
  private async resolveConflict(
    field: string,
    fieldValues: Array<{
      recordId: string
      sourceId: string
      priority: number
      value: unknown
    }>,
    records: SourceAwareRecord<T>[]
  ): Promise<{
    value: unknown
    sourceId?: string
    provenance?: FieldProvenance
    conflict?: MergeConflict
  }> {
    const nonNullValues = fieldValues.filter(
      (fv) => fv.value !== null && fv.value !== undefined
    )

    const priorityMode = this.config.priorityMode || 'priority-first'

    let resolvedValue: unknown
    let sourceId: string | undefined
    let resolutionReason: string

    if (priorityMode === 'priority-only') {
      // Use priority exclusively
      const highest = nonNullValues.reduce((a, b) =>
        b.priority > a.priority ? b : a
      )
      resolvedValue = highest.value
      sourceId = highest.sourceId
      resolutionReason = `Selected from highest priority source: ${sourceId} (priority ${highest.priority})`
    } else if (priorityMode === 'priority-first') {
      // Try priority first, use strategy as tiebreaker
      const maxPriority = Math.max(...nonNullValues.map((fv) => fv.priority))
      const highestPriorityValues = nonNullValues.filter(
        (fv) => fv.priority === maxPriority
      )

      if (highestPriorityValues.length === 1) {
        // Single highest priority source - use it
        resolvedValue = highestPriorityValues[0].value
        sourceId = highestPriorityValues[0].sourceId
        resolutionReason = `Selected from highest priority source: ${sourceId} (priority ${maxPriority})`
      } else {
        // Multiple sources with same priority - use strategy
        const strategyResult = await this.applyStrategyForField(
          field,
          highestPriorityValues.map((fv) => fv.value),
          records.filter((r) =>
            highestPriorityValues.some((hpv) => hpv.recordId === r.id)
          )
        )
        resolvedValue = strategyResult.value
        sourceId = highestPriorityValues[0].sourceId
        resolutionReason = `Multiple sources with priority ${maxPriority}, applied strategy: ${strategyResult.strategy}`
      }
    } else {
      // priority-fallback: Use strategy first, priority only if strategy can't decide
      const strategyResult = await this.applyStrategyForField(
        field,
        nonNullValues.map((fv) => fv.value),
        records
      )

      if (strategyResult.value !== undefined) {
        resolvedValue = strategyResult.value
        // Find which source this value came from
        const matchingValue = nonNullValues.find(
          (fv) => fv.value === strategyResult.value
        )
        sourceId = matchingValue?.sourceId
        resolutionReason = `Resolved using strategy: ${strategyResult.strategy}`
      } else {
        // Strategy couldn't decide - use priority
        const highest = nonNullValues.reduce((a, b) =>
          b.priority > a.priority ? b : a
        )
        resolvedValue = highest.value
        sourceId = highest.sourceId
        resolutionReason = `Strategy inconclusive, used priority: ${sourceId} (priority ${highest.priority})`
      }
    }

    // Build conflict record
    const conflict: MergeConflict = {
      field,
      values: fieldValues.map((fv) => ({
        recordId: fv.recordId,
        value: fv.value,
      })),
      resolution: 'auto',
      resolvedValue,
      resolutionReason,
    }

    // Build provenance
    const provenance: FieldProvenance = {
      sourceRecordId: fieldValues.find((fv) => fv.sourceId === sourceId)
        ?.recordId || fieldValues[0].recordId,
      strategyApplied: 'source-priority',
      allValues: fieldValues.map((fv) => ({
        recordId: fv.recordId,
        value: fv.value,
      })),
      hadConflict: true,
      conflictResolution: resolutionReason,
    }

    return {
      value: resolvedValue,
      sourceId,
      provenance,
      conflict,
    }
  }

  /**
   * Apply merge strategy for a field
   */
  private async applyStrategyForField(
    field: string,
    values: unknown[],
    records: SourceRecord<T>[]
  ): Promise<{ value: unknown; strategy: string }> {
    // Get field strategy from config
    const fieldConfig = this.config.fieldStrategies?.find(
      (fs) => fs.field === field
    )
    const strategy = fieldConfig?.strategy || this.config.defaultStrategy

    try {
      // Use base executor's strategy application
      const result = await this.baseExecutor.merge({
        sourceRecords: records,
      })

      // Extract the field value from the merged result
      const value = this.getNestedValue(
        result.goldenRecord as Record<string, unknown>,
        field
      )

      return { value, strategy }
    } catch (error) {
      // Strategy failed - return undefined
      return { value: undefined, strategy }
    }
  }

  /**
   * Build source priority map from sources
   */
  private buildSourcePriorityMap(
    sources: Array<ConsolidationSource<Record<string, unknown>, T>>
  ): Map<string, number> {
    const map = new Map<string, number>()
    for (const source of sources) {
      map.set(source.sourceId, source.priority ?? 0)
    }
    return map
  }

  /**
   * Convert mapped records to source-aware records
   */
  private convertToSourceAwareRecords(
    records: MappedRecord<T>[],
    priorityMap: Map<string, number>
  ): SourceAwareRecord<T>[] {
    return records.map((record, idx) => ({
      id: typeof record.sourceRecordId === 'string'
        ? record.sourceRecordId
        : `${record.sourceId}-${record.sourceRecordId}`,
      record: record.record,
      sourceId: record.sourceId,
      sourcePriority: priorityMap.get(record.sourceId) ?? 0,
      sourceRecordId: record.sourceRecordId,
      createdAt: new Date(),
      updatedAt: new Date(),
    }))
  }

  /**
   * Enhance base merge result with source provenance
   */
  private enhanceWithSourceProvenance(
    baseResult: MergeResult<T>,
    records: SourceAwareRecord<T>[]
  ): MergeResult<T> & { sourceProvenance: SourceAwareProvenance } {
    const sourceIds = records.map((r) => r.sourceId)
    const sourceProvenance: Record<string, string> = {}

    // Build source provenance from field provenance
    for (const [field, fieldProv] of Object.entries(
      baseResult.provenance.fieldSources
    )) {
      const sourceRecord = records.find(
        (r) => r.id === fieldProv.sourceRecordId
      )
      if (sourceRecord) {
        sourceProvenance[field] = sourceRecord.sourceId
      }
    }

    const enhancedProvenance: SourceAwareProvenance = {
      ...baseResult.provenance,
      sourceIds,
      sourceProvenance,
    }

    return {
      ...baseResult,
      sourceProvenance: enhancedProvenance,
    }
  }

  /**
   * Collect all field paths from records
   */
  private collectFieldPaths(
    records: SourceAwareRecord<T>[]
  ): string[] {
    const fieldSet = new Set<string>()

    for (const record of records) {
      this.collectFieldPathsFromObject(record.record, '', fieldSet)
    }

    return Array.from(fieldSet)
  }

  /**
   * Recursively collect field paths from an object
   */
  private collectFieldPathsFromObject(
    obj: Record<string, unknown>,
    prefix: string,
    fieldSet: Set<string>
  ): void {
    for (const [key, value] of Object.entries(obj)) {
      const path = prefix ? `${prefix}.${key}` : key
      fieldSet.add(path)

      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        this.collectFieldPathsFromObject(
          value as Record<string, unknown>,
          path,
          fieldSet
        )
      }
    }
  }

  /**
   * Get nested value from object using dot notation
   */
  private getNestedValue(
    obj: Record<string, unknown>,
    path: string
  ): unknown {
    const parts = path.split('.')
    let current: unknown = obj

    for (const part of parts) {
      if (current === null || typeof current !== 'object') {
        return undefined
      }
      current = (current as Record<string, unknown>)[part]
    }

    return current
  }

  /**
   * Set nested value in object using dot notation
   */
  private setNestedValue(
    obj: Record<string, unknown>,
    path: string,
    value: unknown
  ): void {
    const parts = path.split('.')
    let current: Record<string, unknown> = obj

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i]
      if (!(part in current) || typeof current[part] !== 'object') {
        current[part] = {}
      }
      current = current[part] as Record<string, unknown>
    }

    current[parts[parts.length - 1]] = value
  }

  /**
   * Detect if values conflict (all different and non-null)
   */
  private detectConflict(values: unknown[]): boolean {
    const nonNullValues = values.filter((v) => v !== null && v !== undefined)

    if (nonNullValues.length < 2) return false

    const firstValue = nonNullValues[0]
    return !nonNullValues.every((v) => this.valuesEqual(v, firstValue))
  }

  /**
   * Compare two values for equality
   */
  private valuesEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true
    if (a === null || b === null) return false
    if (typeof a !== typeof b) return false

    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false
      return a.every((val, idx) => this.valuesEqual(val, b[idx]))
    }

    if (typeof a === 'object' && typeof b === 'object') {
      const aKeys = Object.keys(a as object)
      const bKeys = Object.keys(b as object)
      if (aKeys.length !== bKeys.length) return false
      return aKeys.every((key) =>
        this.valuesEqual(
          (a as Record<string, unknown>)[key],
          (b as Record<string, unknown>)[key]
        )
      )
    }

    return false
  }

  /**
   * Generate a unique ID
   */
  private generateId(): string {
    return `golden-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
  }

  /**
   * Get the current configuration
   */
  getConfig(): SourceAwareMergeConfig {
    return { ...this.config }
  }
}

/**
 * Factory function to create a source-aware merger
 *
 * @param config - Merge configuration
 * @param schema - Optional schema
 * @returns New SourceAwareMerger instance
 */
export function createSourceAwareMerger<T extends Record<string, unknown>>(
  config: Partial<SourceAwareMergeConfig>,
  schema?: SchemaDefinition<T>
): SourceAwareMerger<T> {
  return new SourceAwareMerger<T>(config, schema)
}
