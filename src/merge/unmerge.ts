/**
 * Unmerge executor for restoring source records from golden records
 * @module merge/unmerge
 */

import type {
  SourceRecord,
  Provenance,
  UnmergeRequest,
  UnmergeResult,
} from './types.js'
import type { ProvenanceStore } from './provenance/provenance-store.js'
import { UnmergeError, ProvenanceNotFoundError, SourceRecordNotFoundError } from './merge-error.js'

/**
 * Unmerge mode options
 * - `full` - Delete golden record, restore all source records
 * - `partial` - Keep golden record, restore specific source records
 * - `split` - Create new golden record from subset of sources
 */
export type UnmergeMode = 'full' | 'partial' | 'split'

/**
 * Options for the unmerge operation
 */
export interface UnmergeOptions {
  /** Unmerge mode (default: 'full') */
  mode?: UnmergeMode

  /** For partial/split mode: source record IDs to restore */
  sourceRecordIdsToRestore?: string[]

  /** Whether to delete the golden record (default: true for full mode, false otherwise) */
  deleteGoldenRecord?: boolean
}

/**
 * Source record archive interface for storing/retrieving archived source records
 */
export interface SourceRecordArchive<T extends Record<string, unknown> = Record<string, unknown>> {
  /**
   * Stores source records in archive
   * @param records - Records to archive
   * @param goldenRecordId - ID of the golden record they were merged into
   */
  archive(records: SourceRecord<T>[], goldenRecordId: string): Promise<void>

  /**
   * Retrieves archived source records
   * @param recordIds - IDs of records to retrieve
   * @returns The archived source records
   */
  get(recordIds: string[]): Promise<SourceRecord<T>[]>

  /**
   * Removes records from archive after restoration
   * @param recordIds - IDs of records to remove from archive
   */
  remove(recordIds: string[]): Promise<void>

  /**
   * Checks if records exist in archive
   * @param recordIds - IDs to check
   * @returns Map of ID to existence boolean
   */
  exists(recordIds: string[]): Promise<Map<string, boolean>>
}

/**
 * In-memory implementation of source record archive for testing
 */
export class InMemorySourceRecordArchive<T extends Record<string, unknown> = Record<string, unknown>>
  implements SourceRecordArchive<T>
{
  private readonly store = new Map<string, { record: SourceRecord<T>; goldenRecordId: string }>()

  async archive(records: SourceRecord<T>[], goldenRecordId: string): Promise<void> {
    for (const record of records) {
      this.store.set(record.id, { record: { ...record }, goldenRecordId })
    }
  }

  async get(recordIds: string[]): Promise<SourceRecord<T>[]> {
    const results: SourceRecord<T>[] = []
    for (const id of recordIds) {
      const entry = this.store.get(id)
      if (entry) {
        results.push({ ...entry.record })
      }
    }
    return results
  }

  async remove(recordIds: string[]): Promise<void> {
    for (const id of recordIds) {
      this.store.delete(id)
    }
  }

  async exists(recordIds: string[]): Promise<Map<string, boolean>> {
    const result = new Map<string, boolean>()
    for (const id of recordIds) {
      result.set(id, this.store.has(id))
    }
    return result
  }

  clear(): void {
    this.store.clear()
  }

  size(): number {
    return this.store.size
  }
}

/**
 * Creates a new in-memory source record archive
 */
export function createInMemorySourceRecordArchive<
  T extends Record<string, unknown> = Record<string, unknown>,
>(): InMemorySourceRecordArchive<T> {
  return new InMemorySourceRecordArchive<T>()
}

/**
 * UnmergeExecutor - Handles unmerging golden records back into source records
 *
 * The unmerge operation reverses a merge by:
 * 1. Retrieving provenance to identify source records
 * 2. Restoring archived source records
 * 3. Optionally deleting the golden record
 * 4. Updating provenance to mark it as unmerged
 *
 * @example
 * ```typescript
 * const unmergeExecutor = new UnmergeExecutor({
 *   provenanceStore,
 *   sourceRecordArchive,
 *   onRecordRestore: async (record) => {
 *     await database.insert(record)
 *   },
 *   onGoldenRecordDelete: async (id) => {
 *     await database.delete(id)
 *   },
 * })
 *
 * const result = await unmergeExecutor.unmerge({
 *   goldenRecordId: 'golden-123',
 *   unmergedBy: 'admin',
 *   reason: 'Incorrect match identified',
 * })
 * ```
 */
export class UnmergeExecutor<T extends Record<string, unknown> = Record<string, unknown>> {
  private readonly provenanceStore: ProvenanceStore
  private readonly sourceRecordArchive: SourceRecordArchive<T>
  private readonly onRecordRestore?: (record: SourceRecord<T>) => Promise<void>
  private readonly onGoldenRecordDelete?: (goldenRecordId: string) => Promise<void>

  constructor(options: {
    provenanceStore: ProvenanceStore
    sourceRecordArchive: SourceRecordArchive<T>
    onRecordRestore?: (record: SourceRecord<T>) => Promise<void>
    onGoldenRecordDelete?: (goldenRecordId: string) => Promise<void>
  }) {
    this.provenanceStore = options.provenanceStore
    this.sourceRecordArchive = options.sourceRecordArchive
    this.onRecordRestore = options.onRecordRestore
    this.onGoldenRecordDelete = options.onGoldenRecordDelete
  }

  /**
   * Unmerges a golden record, restoring the original source records
   *
   * @param request - The unmerge request
   * @param options - Optional unmerge options
   * @returns The unmerge result with restored records
   * @throws {ProvenanceNotFoundError} If no provenance exists for the golden record
   * @throws {SourceRecordNotFoundError} If archived source records cannot be found
   * @throws {UnmergeError} If the golden record has already been unmerged
   */
  async unmerge(request: UnmergeRequest, options?: UnmergeOptions): Promise<UnmergeResult<T>> {
    const { goldenRecordId, unmergedBy, reason } = request
    const mode = options?.mode ?? 'full'

    // 1. Get provenance for golden record
    const provenance = await this.provenanceStore.get(goldenRecordId)
    if (!provenance) {
      throw new ProvenanceNotFoundError(goldenRecordId)
    }

    // Check if already unmerged
    if (provenance.unmerged) {
      throw new UnmergeError(
        goldenRecordId,
        'Record has already been unmerged',
        {
          unmergedAt: provenance.unmergedAt,
          unmergedBy: provenance.unmergedBy,
        },
      )
    }

    // 2. Determine which source records to restore
    const sourceRecordIdsToRestore = this.getSourceRecordIdsToRestore(
      provenance,
      mode,
      options?.sourceRecordIdsToRestore,
    )

    // 3. Verify all source records exist in archive
    const existenceMap = await this.sourceRecordArchive.exists(sourceRecordIdsToRestore)
    const missingRecords = sourceRecordIdsToRestore.filter((id) => !existenceMap.get(id))
    if (missingRecords.length > 0) {
      throw new SourceRecordNotFoundError(missingRecords[0], {
        allMissing: missingRecords,
        message: `${missingRecords.length} source record(s) not found in archive`,
      })
    }

    // 4. Retrieve archived source records
    const archivedRecords = await this.sourceRecordArchive.get(sourceRecordIdsToRestore)

    // 5. Restore source records
    const restoredRecords: Array<{ id: string; record: T }> = []
    for (const sourceRecord of archivedRecords) {
      if (this.onRecordRestore) {
        await this.onRecordRestore(sourceRecord)
      }
      restoredRecords.push({
        id: sourceRecord.id,
        record: sourceRecord.record,
      })
    }

    // 6. Handle golden record based on mode
    const shouldDeleteGoldenRecord = this.shouldDeleteGoldenRecord(mode, options?.deleteGoldenRecord)
    if (shouldDeleteGoldenRecord && this.onGoldenRecordDelete) {
      await this.onGoldenRecordDelete(goldenRecordId)
    }

    // 7. Remove restored records from archive
    await this.sourceRecordArchive.remove(sourceRecordIdsToRestore)

    // 8. Update provenance to mark as unmerged
    await this.provenanceStore.markUnmerged(goldenRecordId, {
      unmergedAt: new Date(),
      unmergedBy,
      reason,
    })

    return {
      restoredRecords,
      originalProvenance: provenance,
      goldenRecordDeleted: shouldDeleteGoldenRecord,
    }
  }

  /**
   * Checks if a golden record can be unmerged
   *
   * @param goldenRecordId - The golden record ID to check
   * @returns Object indicating if unmerge is possible and why not if not
   */
  async canUnmerge(goldenRecordId: string): Promise<{
    canUnmerge: boolean
    reason?: string
    provenance?: Provenance
  }> {
    const provenance = await this.provenanceStore.get(goldenRecordId)

    if (!provenance) {
      return {
        canUnmerge: false,
        reason: 'No provenance found for golden record',
      }
    }

    if (provenance.unmerged) {
      return {
        canUnmerge: false,
        reason: 'Record has already been unmerged',
        provenance,
      }
    }

    const existenceMap = await this.sourceRecordArchive.exists(provenance.sourceRecordIds)
    const missingRecords = provenance.sourceRecordIds.filter((id) => !existenceMap.get(id))

    if (missingRecords.length > 0) {
      return {
        canUnmerge: false,
        reason: `${missingRecords.length} source record(s) not found in archive`,
        provenance,
      }
    }

    return {
      canUnmerge: true,
      provenance,
    }
  }

  /**
   * Gets the provenance store
   */
  getProvenanceStore(): ProvenanceStore {
    return this.provenanceStore
  }

  /**
   * Gets the source record archive
   */
  getSourceRecordArchive(): SourceRecordArchive<T> {
    return this.sourceRecordArchive
  }

  /**
   * Determines which source record IDs to restore based on mode
   */
  private getSourceRecordIdsToRestore(
    provenance: Provenance,
    mode: UnmergeMode,
    specifiedIds?: string[],
  ): string[] {
    switch (mode) {
      case 'full':
        return [...provenance.sourceRecordIds]

      case 'partial':
      case 'split': {
        if (!specifiedIds || specifiedIds.length === 0) {
          throw new UnmergeError(
            provenance.goldenRecordId,
            `${mode} mode requires sourceRecordIdsToRestore to be specified`,
          )
        }
        // Validate specified IDs are in the provenance
        const invalidIds = specifiedIds.filter((id) => !provenance.sourceRecordIds.includes(id))
        if (invalidIds.length > 0) {
          throw new UnmergeError(
            provenance.goldenRecordId,
            `Source record IDs not found in provenance: ${invalidIds.join(', ')}`,
          )
        }
        return specifiedIds
      }

      default:
        return [...provenance.sourceRecordIds]
    }
  }

  /**
   * Determines if the golden record should be deleted
   */
  private shouldDeleteGoldenRecord(mode: UnmergeMode, explicitDelete?: boolean): boolean {
    if (explicitDelete !== undefined) {
      return explicitDelete
    }

    switch (mode) {
      case 'full':
        return true
      case 'partial':
      case 'split':
        return false
      default:
        return true
    }
  }
}

/**
 * Creates a new UnmergeExecutor instance
 */
export function createUnmergeExecutor<T extends Record<string, unknown> = Record<string, unknown>>(
  options: {
    provenanceStore: ProvenanceStore
    sourceRecordArchive: SourceRecordArchive<T>
    onRecordRestore?: (record: SourceRecord<T>) => Promise<void>
    onGoldenRecordDelete?: (goldenRecordId: string) => Promise<void>
  },
): UnmergeExecutor<T> {
  return new UnmergeExecutor<T>(options)
}
