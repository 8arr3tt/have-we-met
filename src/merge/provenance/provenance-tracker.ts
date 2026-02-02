/**
 * Provenance tracker for tracking merge decisions during merge operations
 * @module merge/provenance/provenance-tracker
 */

import type {
  SourceRecord,
  Provenance,
  FieldProvenance,
  MergeConflict,
  MergeConfig,
  MergeStrategy,
} from '../types.js'

/**
 * State tracked during a merge operation
 */
interface ProvenanceTrackingState<T extends Record<string, unknown>> {
  sourceRecords: SourceRecord<T>[]
  startedAt: Date
  fieldSelections: Map<string, FieldProvenance>
  conflicts: MergeConflict[]
  config: MergeConfig
  mergedBy?: string
  queueItemId?: string
}

/**
 * ProvenanceTracker - Tracks all merge decisions for audit and provenance purposes
 *
 * This class records which source records contributed which fields during a merge,
 * what strategies were applied, and how conflicts were resolved.
 *
 * @example
 * ```typescript
 * const tracker = new ProvenanceTracker<PersonRecord>()
 *
 * // Start tracking a merge operation
 * tracker.startMerge(sourceRecords, config)
 *
 * // Record field selections during merge
 * tracker.recordFieldSelection('firstName', 'rec-1', 'preferLonger', values)
 * tracker.recordFieldSelection('email', 'rec-2', 'preferNewer', values)
 *
 * // Record any conflicts
 * tracker.recordConflict({
 *   field: 'phone',
 *   values: [{ recordId: 'rec-1', value: '555-1234' }, { recordId: 'rec-2', value: '555-5678' }],
 *   resolution: 'auto',
 *   resolvedValue: '555-1234',
 *   resolutionReason: 'Auto-resolved using preferFirst strategy'
 * })
 *
 * // Finalize and get the provenance
 * const provenance = tracker.finalize('golden-record-id')
 * ```
 */
export class ProvenanceTracker<
  T extends Record<string, unknown> = Record<string, unknown>,
> {
  private state: ProvenanceTrackingState<T> | null = null

  /**
   * Starts tracking a new merge operation
   *
   * @param sourceRecords - The source records being merged
   * @param config - The merge configuration being used
   * @param options - Additional options for the merge
   * @throws Error if a merge is already in progress
   */
  startMerge(
    sourceRecords: SourceRecord<T>[],
    config: MergeConfig,
    options?: { mergedBy?: string; queueItemId?: string }
  ): void {
    if (this.state !== null) {
      throw new Error(
        'Cannot start a new merge while one is in progress. Call finalize() first.'
      )
    }

    this.state = {
      sourceRecords,
      startedAt: new Date(),
      fieldSelections: new Map(),
      conflicts: [],
      config,
      mergedBy: options?.mergedBy,
      queueItemId: options?.queueItemId,
    }
  }

  /**
   * Records a field selection decision during merge
   *
   * @param field - The field path that was merged
   * @param sourceRecordId - The ID of the source record that contributed the value
   * @param strategy - The strategy that was applied
   * @param allValues - All values that were considered from source records
   * @param hadConflict - Whether there was a conflict for this field
   * @param conflictResolution - How the conflict was resolved (if any)
   * @throws Error if no merge is in progress
   */
  recordFieldSelection(
    field: string,
    sourceRecordId: string,
    strategy: MergeStrategy,
    allValues: Array<{ recordId: string; value: unknown }>,
    hadConflict: boolean = false,
    conflictResolution?: string
  ): void {
    this.ensureMergeInProgress()

    const fieldProvenance: FieldProvenance = {
      sourceRecordId,
      strategyApplied: strategy,
      allValues,
      hadConflict,
      conflictResolution,
    }

    this.state!.fieldSelections.set(field, fieldProvenance)
  }

  /**
   * Records a conflict that occurred during merge
   *
   * @param conflict - The conflict details
   * @throws Error if no merge is in progress
   */
  recordConflict(conflict: MergeConflict): void {
    this.ensureMergeInProgress()
    this.state!.conflicts.push(conflict)
  }

  /**
   * Updates a previously recorded field selection
   *
   * @param field - The field path to update
   * @param updates - Partial updates to apply to the field provenance
   * @throws Error if no merge is in progress or field not found
   */
  updateFieldSelection(field: string, updates: Partial<FieldProvenance>): void {
    this.ensureMergeInProgress()

    const existing = this.state!.fieldSelections.get(field)
    if (!existing) {
      throw new Error(`Field '${field}' has not been recorded yet`)
    }

    this.state!.fieldSelections.set(field, { ...existing, ...updates })
  }

  /**
   * Gets the current field provenance for a specific field
   *
   * @param field - The field path to get provenance for
   * @returns The field provenance or undefined if not recorded
   */
  getFieldProvenance(field: string): FieldProvenance | undefined {
    return this.state?.fieldSelections.get(field)
  }

  /**
   * Gets all recorded conflicts
   *
   * @returns Array of merge conflicts
   */
  getConflicts(): MergeConflict[] {
    return this.state?.conflicts ?? []
  }

  /**
   * Checks if a merge is currently in progress
   *
   * @returns True if tracking a merge operation
   */
  isInProgress(): boolean {
    return this.state !== null
  }

  /**
   * Finalizes the merge tracking and creates the provenance object
   *
   * @param goldenRecordId - The ID of the resulting golden record
   * @returns The complete provenance object
   * @throws Error if no merge is in progress
   */
  finalize(goldenRecordId: string): Provenance {
    this.ensureMergeInProgress()

    const provenance: Provenance = {
      goldenRecordId,
      sourceRecordIds: this.state!.sourceRecords.map((r) => r.id),
      mergedAt: new Date(),
      mergedBy: this.state!.mergedBy,
      queueItemId: this.state!.queueItemId,
      fieldSources: Object.fromEntries(this.state!.fieldSelections),
      strategyUsed: this.state!.config,
    }

    // Reset state
    this.state = null

    return provenance
  }

  /**
   * Cancels the current merge tracking without creating provenance
   */
  cancel(): void {
    this.state = null
  }

  /**
   * Gets statistics about the current merge
   *
   * @returns Statistics or null if no merge in progress
   */
  getStats(): {
    fieldsTracked: number
    conflictsRecorded: number
    sourceRecordCount: number
    elapsedMs: number
  } | null {
    if (!this.state) return null

    return {
      fieldsTracked: this.state.fieldSelections.size,
      conflictsRecorded: this.state.conflicts.length,
      sourceRecordCount: this.state.sourceRecords.length,
      elapsedMs: Date.now() - this.state.startedAt.getTime(),
    }
  }

  /**
   * Gets the field contributions by source record
   *
   * @returns Map of source record ID to count of fields it contributed
   */
  getContributionsBySource(): Map<string, number> {
    const contributions = new Map<string, number>()

    if (!this.state) return contributions

    // Initialize counts for all source records
    for (const record of this.state.sourceRecords) {
      contributions.set(record.id, 0)
    }

    // Count contributions
    for (const fieldProv of this.state.fieldSelections.values()) {
      const current = contributions.get(fieldProv.sourceRecordId) ?? 0
      contributions.set(fieldProv.sourceRecordId, current + 1)
    }

    return contributions
  }

  /**
   * Ensures a merge is in progress, throws if not
   */
  private ensureMergeInProgress(): void {
    if (this.state === null) {
      throw new Error('No merge in progress. Call startMerge() first.')
    }
  }
}

/**
 * Creates a new ProvenanceTracker instance
 *
 * @returns A new ProvenanceTracker
 */
export function createProvenanceTracker<
  T extends Record<string, unknown> = Record<string, unknown>,
>(): ProvenanceTracker<T> {
  return new ProvenanceTracker<T>()
}
