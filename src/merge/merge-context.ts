/**
 * Merge context for tracking state during merge operations
 * @module merge/merge-context
 */

import type {
  MergeConfig,
  SourceRecord,
  FieldProvenance,
  MergeConflict,
  MergeContext as IMergeContext,
  MergeStats,
} from './types.js'

/**
 * Creates a new merge context for tracking merge operation state
 *
 * @param config - The merge configuration
 * @param sourceRecords - Source records being merged
 * @returns A new MergeContext instance
 */
export function createMergeContext<T extends Record<string, unknown>>(
  config: MergeConfig,
  sourceRecords: SourceRecord<T>[]
): IMergeContext<T> {
  return {
    config,
    sourceRecords,
    currentField: undefined,
    fieldSources: {},
    conflicts: [],
    startTime: new Date(),
    trackProvenance: config.trackProvenance,
  }
}

/**
 * Records the provenance for a field in the merge context
 *
 * @param context - The merge context
 * @param field - Field path
 * @param provenance - Field provenance data
 */
export function recordFieldProvenance<T extends Record<string, unknown>>(
  context: IMergeContext<T>,
  field: string,
  provenance: FieldProvenance
): void {
  if (context.trackProvenance) {
    context.fieldSources[field] = provenance
  }
}

/**
 * Records a conflict in the merge context
 *
 * @param context - The merge context
 * @param conflict - The merge conflict
 */
export function recordConflict<T extends Record<string, unknown>>(
  context: IMergeContext<T>,
  conflict: MergeConflict
): void {
  context.conflicts.push(conflict)
}

/**
 * Sets the current field being processed
 *
 * @param context - The merge context
 * @param field - Field path currently being processed
 */
export function setCurrentField<T extends Record<string, unknown>>(
  context: IMergeContext<T>,
  field: string | undefined
): void {
  context.currentField = field
}

/**
 * Calculates merge statistics from the context
 *
 * @param context - The merge context
 * @returns Merge statistics
 */
export function calculateStats<T extends Record<string, unknown>>(
  context: IMergeContext<T>
): MergeStats {
  const endTime = new Date()
  const mergeTimeMs = endTime.getTime() - context.startTime.getTime()

  // Count fields contributed by each source
  const fieldsFromEachSource: Record<string, number> = {}
  for (const sourceRecord of context.sourceRecords) {
    fieldsFromEachSource[sourceRecord.id] = 0
  }

  for (const fieldProv of Object.values(context.fieldSources)) {
    if (
      fieldProv.sourceRecordId &&
      fieldsFromEachSource[fieldProv.sourceRecordId] !== undefined
    ) {
      fieldsFromEachSource[fieldProv.sourceRecordId]++
    }
  }

  // Count conflicts by resolution type
  let conflictsResolved = 0
  let conflictsDeferred = 0
  for (const conflict of context.conflicts) {
    if (conflict.resolution === 'deferred') {
      conflictsDeferred++
    } else {
      conflictsResolved++
    }
  }

  return {
    fieldsFromEachSource,
    conflictsResolved,
    conflictsDeferred,
    totalFields: Object.keys(context.fieldSources).length,
    mergeTimeMs,
  }
}
