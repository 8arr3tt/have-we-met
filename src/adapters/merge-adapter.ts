/**
 * Merge-specific adapter interfaces for golden record operations
 * @module adapters/merge-adapter
 */

import type { Provenance, SourceRecord } from '../merge/types.js'

/**
 * Information about an archived record
 */
export interface ArchivedRecord<T extends Record<string, unknown> = Record<string, unknown>> {
  /** The record ID */
  id: string

  /** The archived record data */
  record: T

  /** When the record was archived */
  archivedAt: Date

  /** Reason for archival (e.g., 'merged') */
  archivedReason?: string

  /** ID of the golden record this was merged into (if applicable) */
  mergedIntoId?: string

  /** Original created at timestamp */
  createdAt: Date

  /** Original updated at timestamp */
  updatedAt: Date
}

/**
 * Information for marking a provenance record as unmerged
 */
export interface UnmergeInfo {
  /** When the unmerge occurred */
  unmergedAt: Date

  /** Who performed the unmerge */
  unmergedBy?: string

  /** Reason for the unmerge */
  reason?: string
}

/**
 * Interface for adapter operations related to merge provenance tracking
 */
export interface ProvenanceAdapter {
  /**
   * Saves a provenance record
   *
   * @param provenance - The provenance to save
   */
  save(provenance: Provenance): Promise<void>

  /**
   * Retrieves provenance by golden record ID
   *
   * @param goldenRecordId - The golden record ID
   * @returns The provenance or null if not found
   */
  get(goldenRecordId: string): Promise<Provenance | null>

  /**
   * Finds all provenance records that include a specific source record
   *
   * @param sourceId - The source record ID to search for
   * @returns Array of matching provenance records
   */
  getBySourceId(sourceId: string): Promise<Provenance[]>

  /**
   * Marks a provenance record as unmerged
   *
   * @param goldenRecordId - The golden record ID
   * @param info - Unmerge information
   */
  markUnmerged(goldenRecordId: string, info: UnmergeInfo): Promise<void>

  /**
   * Deletes a provenance record
   *
   * @param goldenRecordId - The golden record ID
   * @returns True if deleted, false if not found
   */
  delete(goldenRecordId: string): Promise<boolean>

  /**
   * Checks if provenance exists for a golden record
   *
   * @param goldenRecordId - The golden record ID
   * @returns True if provenance exists
   */
  exists(goldenRecordId: string): Promise<boolean>

  /**
   * Counts total provenance records
   *
   * @param includeUnmerged - Whether to include unmerged records
   * @returns Total count
   */
  count(includeUnmerged?: boolean): Promise<number>
}

/**
 * Interface for adapter operations related to merge record archival
 *
 * Merge operations need to archive source records so they can be restored
 * during unmerge operations. This interface provides the necessary methods.
 */
export interface MergeAdapter<T extends Record<string, unknown> = Record<string, unknown>> {
  /**
   * Archives records (soft delete for merge).
   * Archived records are kept in storage but marked as inactive.
   *
   * @param ids - Record IDs to archive
   * @param options - Archive options
   */
  archive(
    ids: string[],
    options?: {
      /** Reason for archival */
      reason?: string
      /** ID of the golden record these are being merged into */
      mergedIntoId?: string
    }
  ): Promise<void>

  /**
   * Restores archived records to active state.
   *
   * @param ids - Record IDs to restore
   * @returns The restored records
   */
  restore(ids: string[]): Promise<T[]>

  /**
   * Gets archived records by their IDs.
   *
   * @param ids - Record IDs to retrieve
   * @returns Array of archived records with metadata
   */
  getArchived(ids: string[]): Promise<ArchivedRecord<T>[]>

  /**
   * Checks if records are archived.
   *
   * @param ids - Record IDs to check
   * @returns Map of ID to archived status
   */
  isArchived(ids: string[]): Promise<Map<string, boolean>>

  /**
   * Gets all archived records for a given golden record.
   *
   * @param goldenRecordId - The golden record ID
   * @returns Array of archived records
   */
  getArchivedByGoldenRecord(goldenRecordId: string): Promise<ArchivedRecord<T>[]>

  /**
   * Permanently deletes archived records.
   * Use with caution - this cannot be undone.
   *
   * @param ids - Record IDs to permanently delete
   */
  permanentlyDeleteArchived(ids: string[]): Promise<void>

  /**
   * Counts archived records.
   *
   * @param goldenRecordId - Optional golden record ID to filter by
   * @returns Count of archived records
   */
  countArchived(goldenRecordId?: string): Promise<number>

  /**
   * Provenance adapter for tracking merge decisions.
   * May be undefined if the adapter doesn't support provenance tracking.
   */
  provenance?: ProvenanceAdapter
}

/**
 * Combined adapter interface that includes both standard database operations
 * and merge-specific operations.
 */
export interface DatabaseAdapterWithMerge<T extends Record<string, unknown> = Record<string, unknown>>
  extends MergeAdapter<T> {
  /**
   * Access to the provenance adapter for tracking merge decisions.
   */
  provenance?: ProvenanceAdapter
}

/**
 * Configuration options for merge adapter behavior
 */
export interface MergeAdapterConfig {
  /** Field name used for soft delete timestamp (default: 'archivedAt') */
  archivedAtField?: string

  /** Field name used for archive reason (default: 'archivedReason') */
  archivedReasonField?: string

  /** Field name used for merged into reference (default: 'mergedIntoId') */
  mergedIntoIdField?: string

  /** Table/collection name for provenance storage (default: 'provenance') */
  provenanceTable?: string

  /** Whether to track provenance (default: true) */
  trackProvenance?: boolean
}

/**
 * Default merge adapter configuration
 */
export const DEFAULT_MERGE_ADAPTER_CONFIG: Required<MergeAdapterConfig> = {
  archivedAtField: 'archivedAt',
  archivedReasonField: 'archivedReason',
  mergedIntoIdField: 'mergedIntoId',
  provenanceTable: 'provenance',
  trackProvenance: true,
}

/**
 * Converts source records to archived records format
 */
export function toArchivedRecords<T extends Record<string, unknown>>(
  sourceRecords: SourceRecord<T>[],
  goldenRecordId: string,
  reason: string = 'merged'
): ArchivedRecord<T>[] {
  const now = new Date()
  return sourceRecords.map((sr) => ({
    id: sr.id,
    record: sr.record,
    archivedAt: now,
    archivedReason: reason,
    mergedIntoId: goldenRecordId,
    createdAt: sr.createdAt,
    updatedAt: sr.updatedAt,
  }))
}

/**
 * Converts archived records back to source records format
 */
export function toSourceRecords<T extends Record<string, unknown>>(
  archivedRecords: ArchivedRecord<T>[]
): SourceRecord<T>[] {
  return archivedRecords.map((ar) => ({
    id: ar.id,
    record: ar.record,
    createdAt: ar.createdAt,
    updatedAt: ar.updatedAt,
  }))
}
