/**
 * Provenance store interface and in-memory implementation
 * @module merge/provenance/provenance-store
 */

import type { Provenance } from '../types.js'

/**
 * Information about an unmerge operation
 */
export interface UnmergeInfo {
  unmergedAt: Date
  unmergedBy?: string
  reason?: string
}

/**
 * Query options for finding provenance records
 */
export interface ProvenanceQueryOptions {
  /** Limit number of results */
  limit?: number
  /** Offset for pagination */
  offset?: number
  /** Sort order by merge date */
  sortOrder?: 'asc' | 'desc'
  /** Include unmerged records */
  includeUnmerged?: boolean
}

/**
 * Field history entry showing how a field's value evolved over merges
 */
export interface FieldHistoryEntry {
  goldenRecordId: string
  mergedAt: Date
  sourceRecordId: string
  value: unknown
  strategyApplied: string
}

/**
 * Merge timeline entry for tracking all merges involving a golden record
 */
export interface MergeTimelineEntry {
  goldenRecordId: string
  mergedAt: Date
  sourceRecordIds: string[]
  mergedBy?: string
  unmerged: boolean
  unmergedAt?: Date
}

/**
 * Interface for persisting and querying provenance data
 *
 * Implementations can use different storage backends (database, file, etc.)
 */
export interface ProvenanceStore {
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
   * @param sourceRecordId - The source record ID to search for
   * @param options - Query options
   * @returns Array of matching provenance records
   */
  getBySourceId(
    sourceRecordId: string,
    options?: ProvenanceQueryOptions
  ): Promise<Provenance[]>

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
   * Gets the field history for a specific field in a golden record
   *
   * @param goldenRecordId - The golden record ID
   * @param field - The field path
   * @returns Array of field history entries
   */
  getFieldHistory(
    goldenRecordId: string,
    field: string
  ): Promise<FieldHistoryEntry[]>

  /**
   * Gets the merge timeline showing all merge operations
   *
   * @param options - Query options
   * @returns Array of merge timeline entries
   */
  getMergeTimeline(
    options?: ProvenanceQueryOptions
  ): Promise<MergeTimelineEntry[]>

  /**
   * Finds all golden records that a source record was merged into
   *
   * @param sourceRecordId - The source record ID
   * @returns Array of golden record IDs
   */
  findGoldenRecordsBySource(sourceRecordId: string): Promise<string[]>

  /**
   * Counts total provenance records
   *
   * @param includeUnmerged - Whether to include unmerged records
   * @returns Total count
   */
  count(includeUnmerged?: boolean): Promise<number>

  /**
   * Clears all provenance records (use with caution)
   */
  clear(): Promise<void>
}

/**
 * In-memory implementation of ProvenanceStore for testing and simple use cases
 */
export class InMemoryProvenanceStore implements ProvenanceStore {
  private readonly store = new Map<string, Provenance>()
  private readonly sourceIndex = new Map<string, Set<string>>()

  async save(provenance: Provenance): Promise<void> {
    // Store by golden record ID
    this.store.set(provenance.goldenRecordId, { ...provenance })

    // Update source record index
    for (const sourceId of provenance.sourceRecordIds) {
      if (!this.sourceIndex.has(sourceId)) {
        this.sourceIndex.set(sourceId, new Set())
      }
      this.sourceIndex.get(sourceId)!.add(provenance.goldenRecordId)
    }
  }

  async get(goldenRecordId: string): Promise<Provenance | null> {
    const provenance = this.store.get(goldenRecordId)
    return provenance ? { ...provenance } : null
  }

  async getBySourceId(
    sourceRecordId: string,
    options?: ProvenanceQueryOptions
  ): Promise<Provenance[]> {
    const goldenRecordIds = this.sourceIndex.get(sourceRecordId) ?? new Set()
    let results: Provenance[] = []

    for (const goldenRecordId of goldenRecordIds) {
      const provenance = this.store.get(goldenRecordId)
      if (provenance) {
        // Filter out unmerged if not requested
        if (!options?.includeUnmerged && provenance.unmerged) {
          continue
        }
        results.push({ ...provenance })
      }
    }

    // Sort by merge date
    const sortOrder = options?.sortOrder ?? 'desc'
    results.sort((a, b) => {
      const comparison = a.mergedAt.getTime() - b.mergedAt.getTime()
      return sortOrder === 'asc' ? comparison : -comparison
    })

    // Apply pagination
    const offset = options?.offset ?? 0
    const limit = options?.limit ?? results.length
    results = results.slice(offset, offset + limit)

    return results
  }

  async markUnmerged(goldenRecordId: string, info: UnmergeInfo): Promise<void> {
    const provenance = this.store.get(goldenRecordId)
    if (!provenance) {
      throw new Error(
        `Provenance not found for golden record: ${goldenRecordId}`
      )
    }

    this.store.set(goldenRecordId, {
      ...provenance,
      unmerged: true,
      unmergedAt: info.unmergedAt,
      unmergedBy: info.unmergedBy,
      unmergeReason: info.reason,
    })
  }

  async delete(goldenRecordId: string): Promise<boolean> {
    const provenance = this.store.get(goldenRecordId)
    if (!provenance) {
      return false
    }

    // Remove from source index
    for (const sourceId of provenance.sourceRecordIds) {
      const goldenIds = this.sourceIndex.get(sourceId)
      if (goldenIds) {
        goldenIds.delete(goldenRecordId)
        if (goldenIds.size === 0) {
          this.sourceIndex.delete(sourceId)
        }
      }
    }

    // Remove from store
    this.store.delete(goldenRecordId)
    return true
  }

  async exists(goldenRecordId: string): Promise<boolean> {
    return this.store.has(goldenRecordId)
  }

  async getFieldHistory(
    goldenRecordId: string,
    field: string
  ): Promise<FieldHistoryEntry[]> {
    const provenance = this.store.get(goldenRecordId)
    if (!provenance) {
      return []
    }

    const fieldSource = provenance.fieldSources[field]
    if (!fieldSource) {
      return []
    }

    // For in-memory store, we only have the current state
    // A database implementation would track historical changes
    return [
      {
        goldenRecordId,
        mergedAt: provenance.mergedAt,
        sourceRecordId: fieldSource.sourceRecordId,
        value: fieldSource.allValues.find(
          (v) => v.recordId === fieldSource.sourceRecordId
        )?.value,
        strategyApplied: fieldSource.strategyApplied,
      },
    ]
  }

  async getMergeTimeline(
    options?: ProvenanceQueryOptions
  ): Promise<MergeTimelineEntry[]> {
    let entries: MergeTimelineEntry[] = []

    for (const provenance of this.store.values()) {
      // Filter out unmerged if not requested
      if (!options?.includeUnmerged && provenance.unmerged) {
        continue
      }

      entries.push({
        goldenRecordId: provenance.goldenRecordId,
        mergedAt: provenance.mergedAt,
        sourceRecordIds: [...provenance.sourceRecordIds],
        mergedBy: provenance.mergedBy,
        unmerged: provenance.unmerged ?? false,
        unmergedAt: provenance.unmergedAt,
      })
    }

    // Sort by merge date
    const sortOrder = options?.sortOrder ?? 'desc'
    entries.sort((a, b) => {
      const comparison = a.mergedAt.getTime() - b.mergedAt.getTime()
      return sortOrder === 'asc' ? comparison : -comparison
    })

    // Apply pagination
    const offset = options?.offset ?? 0
    const limit = options?.limit ?? entries.length
    entries = entries.slice(offset, offset + limit)

    return entries
  }

  async findGoldenRecordsBySource(sourceRecordId: string): Promise<string[]> {
    const goldenRecordIds = this.sourceIndex.get(sourceRecordId)
    if (!goldenRecordIds) {
      return []
    }

    // Filter out unmerged records
    const results: string[] = []
    for (const goldenRecordId of goldenRecordIds) {
      const provenance = this.store.get(goldenRecordId)
      if (provenance && !provenance.unmerged) {
        results.push(goldenRecordId)
      }
    }

    return results
  }

  async count(includeUnmerged: boolean = false): Promise<number> {
    if (includeUnmerged) {
      return this.store.size
    }

    let count = 0
    for (const provenance of this.store.values()) {
      if (!provenance.unmerged) {
        count++
      }
    }
    return count
  }

  async clear(): Promise<void> {
    this.store.clear()
    this.sourceIndex.clear()
  }

  /**
   * Gets all provenance records (for testing/debugging)
   */
  getAll(): Provenance[] {
    return Array.from(this.store.values()).map((p) => ({ ...p }))
  }
}

/**
 * Creates a new in-memory provenance store
 *
 * @returns A new InMemoryProvenanceStore instance
 */
export function createInMemoryProvenanceStore(): InMemoryProvenanceStore {
  return new InMemoryProvenanceStore()
}
