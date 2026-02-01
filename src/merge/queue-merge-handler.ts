/**
 * Queue merge handler for integrating merge execution with review queue decisions
 * @module merge/queue-merge-handler
 */

import type {
  SourceRecord,
  MergeResult,
} from './types.js'
import type { MergeExecutor } from './merge-executor.js'
import type { ProvenanceStore } from './provenance/provenance-store.js'
import type { SourceRecordArchive } from './unmerge.js'
import type { QueueItem, MergeDecision, QueueAdapter } from '../queue/types.js'
import { MergeValidationError } from './merge-error.js'

/**
 * Result of a queue merge operation
 */
export interface QueueMergeResult<T extends Record<string, unknown>> extends MergeResult<T> {
  /** The queue item that triggered this merge */
  queueItemId: string

  /** Whether the queue item was updated successfully */
  queueItemUpdated: boolean
}

/**
 * Options for configuring the QueueMergeHandler
 */
export interface QueueMergeHandlerOptions<T extends Record<string, unknown>> {
  /** Merge executor for performing the actual merge */
  mergeExecutor: MergeExecutor<T>

  /** Store for persisting provenance data */
  provenanceStore: ProvenanceStore

  /** Archive for storing source records for potential unmerge */
  sourceRecordArchive: SourceRecordArchive<T>

  /** Queue adapter for updating queue items */
  queueAdapter: QueueAdapter<T>

  /** Callback to persist the golden record */
  onGoldenRecordCreate?: (record: T, id: string) => Promise<void>

  /** Callback to archive source records (soft delete/mark as merged) */
  onSourceRecordsArchive?: (recordIds: string[]) => Promise<void>
}

/**
 * Extracts record ID from a record
 */
function getRecordId<T extends Record<string, unknown>>(record: T): string {
  const id = (record as Record<string, unknown>).id
  if (typeof id === 'string') {
    return id
  }
  if (typeof id === 'number') {
    return String(id)
  }
  throw new MergeValidationError('record', 'must have an id field')
}

/**
 * QueueMergeHandler - Handles merge operations triggered from the review queue
 *
 * This handler coordinates the merge workflow when a reviewer makes a merge decision:
 * 1. Extracts source records from the queue item
 * 2. Executes the merge using the configured MergeExecutor
 * 3. Persists the golden record
 * 4. Archives source records
 * 5. Stores provenance data
 * 6. Updates the queue item status
 *
 * @example
 * ```typescript
 * const handler = new QueueMergeHandler({
 *   mergeExecutor,
 *   provenanceStore,
 *   sourceRecordArchive,
 *   queueAdapter,
 *   onGoldenRecordCreate: async (record, id) => {
 *     await database.records.create({ data: { ...record, id } })
 *   },
 *   onSourceRecordsArchive: async (ids) => {
 *     await database.records.updateMany({
 *       where: { id: { in: ids } },
 *       data: { archivedAt: new Date(), status: 'merged' }
 *     })
 *   },
 * })
 *
 * const result = await handler.handleMergeDecision(queueItem, {
 *   selectedMatchId: 'match-123',
 *   decidedBy: 'admin-user',
 *   notes: 'Confirmed as duplicate',
 * })
 * ```
 */
export class QueueMergeHandler<T extends Record<string, unknown>> {
  private readonly mergeExecutor: MergeExecutor<T>
  private readonly provenanceStore: ProvenanceStore
  private readonly sourceRecordArchive: SourceRecordArchive<T>
  private readonly queueAdapter: QueueAdapter<T>
  private readonly onGoldenRecordCreate?: (record: T, id: string) => Promise<void>
  private readonly onSourceRecordsArchive?: (recordIds: string[]) => Promise<void>

  constructor(options: QueueMergeHandlerOptions<T>) {
    this.mergeExecutor = options.mergeExecutor
    this.provenanceStore = options.provenanceStore
    this.sourceRecordArchive = options.sourceRecordArchive
    this.queueAdapter = options.queueAdapter
    this.onGoldenRecordCreate = options.onGoldenRecordCreate
    this.onSourceRecordsArchive = options.onSourceRecordsArchive
  }

  /**
   * Handle a merge decision from the review queue
   *
   * @param queueItem - The queue item containing the candidate record and potential matches
   * @param decision - The merge decision made by the reviewer
   * @returns The merge result including the golden record and provenance
   * @throws {MergeValidationError} If the decision is invalid or records are missing
   * @throws {MergeError} If the merge operation fails
   */
  async handleMergeDecision(
    queueItem: QueueItem<T>,
    decision: MergeDecision
  ): Promise<QueueMergeResult<T>> {
    // 1. Validate the decision
    if (!decision.selectedMatchId) {
      throw new MergeValidationError('selectedMatchId', 'must be specified in merge decision')
    }

    // 2. Extract source records from queue item
    const candidateRecord = queueItem.candidateRecord
    const selectedMatch = queueItem.potentialMatches.find(
      (match) => getRecordId(match.record) === decision.selectedMatchId
    )

    if (!selectedMatch) {
      throw new MergeValidationError(
        'selectedMatchId',
        `'${decision.selectedMatchId}' not found in queue item potential matches`,
        {
          queueItemId: queueItem.id,
          availableMatchIds: queueItem.potentialMatches.map((m) => getRecordId(m.record)),
        }
      )
    }

    // 3. Build source records with metadata
    const now = new Date()
    const sourceRecords: SourceRecord<T>[] = [
      {
        id: getRecordId(candidateRecord),
        record: candidateRecord,
        createdAt: queueItem.createdAt,
        updatedAt: now,
      },
      {
        id: getRecordId(selectedMatch.record),
        record: selectedMatch.record,
        createdAt: queueItem.createdAt,
        updatedAt: now,
      },
    ]

    // 4. Execute the merge
    const mergeResult = await this.mergeExecutor.merge({
      sourceRecords,
      targetRecordId: sourceRecords[0].id, // Use candidate record ID as golden record ID
      mergedBy: decision.decidedBy,
      queueItemId: queueItem.id,
    })

    // 5. Archive source records in memory store for potential unmerge
    await this.sourceRecordArchive.archive(sourceRecords, mergeResult.goldenRecordId)

    // 6. Persist the golden record if callback provided
    if (this.onGoldenRecordCreate) {
      await this.onGoldenRecordCreate(mergeResult.goldenRecord, mergeResult.goldenRecordId)
    }

    // 7. Archive source records in database if callback provided
    if (this.onSourceRecordsArchive) {
      const sourceRecordIds = sourceRecords.map((r) => r.id)
      await this.onSourceRecordsArchive(sourceRecordIds)
    }

    // 8. Store provenance with queue reference
    await this.provenanceStore.save(mergeResult.provenance)

    // 9. Update queue item status
    let queueItemUpdated = false
    try {
      await this.queueAdapter.updateQueueItem(queueItem.id, {
        status: 'merged',
        decision: {
          action: 'merge',
          selectedMatchId: decision.selectedMatchId,
          notes: decision.notes,
          confidence: decision.confidence,
        },
        decidedAt: now,
        decidedBy: decision.decidedBy,
        updatedAt: now,
      })
      queueItemUpdated = true
    } catch (error) {
      // Log but don't fail the merge if queue update fails
      console.error('Failed to update queue item status:', error)
    }

    return {
      ...mergeResult,
      queueItemId: queueItem.id,
      queueItemUpdated,
    }
  }

  /**
   * Check if a queue item can be merged
   *
   * @param queueItem - The queue item to check
   * @param selectedMatchId - The ID of the selected match
   * @returns Object indicating if merge is possible and why not if not
   */
  canMerge(
    queueItem: QueueItem<T>,
    selectedMatchId: string
  ): { canMerge: boolean; reason?: string } {
    // Check queue item status
    if (queueItem.status !== 'pending' && queueItem.status !== 'reviewing') {
      return {
        canMerge: false,
        reason: `Queue item has status '${queueItem.status}' - only 'pending' or 'reviewing' items can be merged`,
      }
    }

    // Check if selected match exists
    const selectedMatch = queueItem.potentialMatches.find(
      (match) => getRecordId(match.record) === selectedMatchId
    )

    if (!selectedMatch) {
      return {
        canMerge: false,
        reason: `Selected match '${selectedMatchId}' not found in queue item potential matches`,
      }
    }

    // Check if records have IDs
    try {
      getRecordId(queueItem.candidateRecord)
      getRecordId(selectedMatch.record)
    } catch {
      return {
        canMerge: false,
        reason: 'Records must have id fields to be merged',
      }
    }

    return { canMerge: true }
  }

  /**
   * Get the merge executor
   */
  getMergeExecutor(): MergeExecutor<T> {
    return this.mergeExecutor
  }

  /**
   * Get the provenance store
   */
  getProvenanceStore(): ProvenanceStore {
    return this.provenanceStore
  }

  /**
   * Get the source record archive
   */
  getSourceRecordArchive(): SourceRecordArchive<T> {
    return this.sourceRecordArchive
  }
}

/**
 * Create a new QueueMergeHandler instance
 */
export function createQueueMergeHandler<T extends Record<string, unknown>>(
  options: QueueMergeHandlerOptions<T>
): QueueMergeHandler<T> {
  return new QueueMergeHandler<T>(options)
}
