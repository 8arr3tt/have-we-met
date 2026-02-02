/**
 * Queue-related type definitions for the review queue system
 * @module queue/types
 */

import type { MatchExplanation } from '../types/match.js'

/**
 * Queue item status lifecycle
 * - pending: Awaiting review
 * - reviewing: Currently being reviewed
 * - confirmed: Confirmed as match
 * - rejected: Rejected as non-match
 * - merged: Records merged
 * - expired: Auto-expired after timeout
 */
export type QueueStatus =
  | 'pending'
  | 'reviewing'
  | 'confirmed'
  | 'rejected'
  | 'merged'
  | 'expired'

/**
 * Additional context for queue items
 */
export interface QueueContext {
  /** Source of the candidate record */
  source?: string

  /** User who initiated the match check */
  userId?: string

  /** Batch ID if part of bulk import */
  batchId?: string

  /** Any custom metadata */
  metadata?: Record<string, unknown>
}

/**
 * Decision made by reviewer
 */
export interface QueueDecision {
  /** Type of decision */
  action: 'confirm' | 'reject' | 'merge'

  /** For confirm/merge: which match was selected */
  selectedMatchId?: string

  /** Reviewer's notes */
  notes?: string

  /** Confidence in decision (0-1) */
  confidence?: number
}

/**
 * A single item in the review queue requiring human decision
 */
export interface QueueItem<T extends Record<string, unknown>> {
  /** Unique queue item identifier */
  id: string

  /** The candidate record being evaluated */
  candidateRecord: T

  /** Potential matching records with scores and explanations */
  potentialMatches: Array<{
    record: T
    score: number
    outcome: 'potential-match'
    explanation: MatchExplanation
  }>

  /** Current status of the queue item */
  status: QueueStatus

  /** Timestamp when added to queue */
  createdAt: Date

  /** Timestamp when last updated */
  updatedAt: Date

  /** Timestamp when decision was made (if decided) */
  decidedAt?: Date

  /** User/system that made the decision */
  decidedBy?: string

  /** Decision made by reviewer */
  decision?: QueueDecision

  /** Additional context for the queue item */
  context?: QueueContext

  /** Priority level (higher = more urgent) */
  priority?: number

  /** Tags for categorization */
  tags?: string[]
}

/**
 * Request to add a new item to the queue
 */
export interface AddQueueItemRequest<T extends Record<string, unknown>> {
  /** The candidate record being evaluated */
  candidateRecord: T

  /** Potential matching records from resolver */
  potentialMatches: Array<{
    record: T
    score: number
    outcome: 'potential-match'
    explanation: MatchExplanation
  }>

  /** Additional context for the queue item */
  context?: QueueContext

  /** Priority level (higher = more urgent) */
  priority?: number

  /** Tags for categorization */
  tags?: string[]
}

/**
 * Options for listing queue items
 */
export interface ListQueueOptions {
  /** Filter by status (single or multiple) */
  status?: QueueStatus | QueueStatus[]

  /** Maximum number of items to return */
  limit?: number

  /** Number of items to skip */
  offset?: number

  /** Field to order by */
  orderBy?: 'createdAt' | 'priority' | 'score'

  /** Order direction */
  orderDirection?: 'asc' | 'desc'

  /** Filter by tags (items must have all specified tags) */
  tags?: string[]

  /** Filter items created since this date */
  since?: Date

  /** Filter items created until this date */
  until?: Date
}

/**
 * List of queue items with pagination metadata
 */
export interface QueueItemList<T extends Record<string, unknown>> {
  /** The queue items */
  items: QueueItem<T>[]

  /** Total count matching the filter */
  total: number

  /** Whether there are more items beyond this page */
  hasMore: boolean
}

/**
 * Decision to confirm a match
 */
export interface ConfirmDecision {
  /** Which match was selected as correct */
  selectedMatchId: string

  /** Optional reviewer notes */
  notes?: string

  /** Confidence in decision (0-1) */
  confidence?: number

  /** Who made the decision */
  decidedBy?: string
}

/**
 * Decision to reject a match
 */
export interface RejectDecision {
  /** Optional reviewer notes */
  notes?: string

  /** Confidence in decision (0-1) */
  confidence?: number

  /** Who made the decision */
  decidedBy?: string
}

/**
 * Decision to merge records
 */
export interface MergeDecision extends ConfirmDecision {
  /** Optional merge strategy identifier */
  mergeStrategy?: string
}

/**
 * Queue statistics and metrics
 */
export interface QueueStats {
  /** Total number of items in queue */
  total: number

  /** Count of items by status */
  byStatus: Record<QueueStatus, number>

  /** Average time items wait in queue (milliseconds) */
  avgWaitTime: number

  /** Average time to make a decision (milliseconds) */
  avgDecisionTime: number

  /** Oldest pending item timestamp */
  oldestPending?: Date

  /** Throughput metrics */
  throughput?: {
    /** Decisions made in last 24 hours */
    last24h: number
    /** Decisions made in last 7 days */
    last7d: number
    /** Decisions made in last 30 days */
    last30d: number
  }
}

/**
 * Options for cleaning up old queue items
 */
export interface CleanupOptions {
  /** Remove items older than this date */
  olderThan?: Date

  /** Only remove items with these statuses */
  status?: QueueStatus[]

  /** Maximum number of items to remove */
  limit?: number
}

/**
 * Options for calculating queue statistics
 */
export interface StatsOptions {
  /** Only include items with these statuses */
  status?: QueueStatus[]

  /** Only include items created since this date */
  since?: Date

  /** Only include items created until this date */
  until?: Date
}

/**
 * Review queue interface for human-in-the-loop matching
 */
export interface ReviewQueue<T extends Record<string, unknown>> {
  /**
   * Add a new item to the review queue
   * @param item - The queue item request
   * @returns The created queue item with ID and timestamps
   */
  add(item: AddQueueItemRequest<T>): Promise<QueueItem<T>>

  /**
   * Batch add multiple items to the queue
   * @param items - Array of queue item requests
   * @returns Array of created queue items
   */
  addBatch(items: AddQueueItemRequest<T>[]): Promise<QueueItem<T>[]>

  /**
   * List queue items with filtering and pagination
   * @param options - Filter, pagination, and ordering options
   * @returns List of queue items with metadata
   */
  list(options?: ListQueueOptions): Promise<QueueItemList<T>>

  /**
   * Get a single queue item by ID
   * @param id - The queue item ID
   * @returns The queue item, or null if not found
   */
  get(id: string): Promise<QueueItem<T> | null>

  /**
   * Confirm a match (record is duplicate)
   * @param id - The queue item ID
   * @param decision - The confirmation decision
   * @returns The updated queue item
   */
  confirm(id: string, decision: ConfirmDecision): Promise<QueueItem<T>>

  /**
   * Reject a match (record is not duplicate)
   * @param id - The queue item ID
   * @param decision - The rejection decision
   * @returns The updated queue item
   */
  reject(id: string, decision: RejectDecision): Promise<QueueItem<T>>

  /**
   * Merge records (confirm and execute merge)
   * @param id - The queue item ID
   * @param decision - The merge decision
   * @returns The updated queue item
   */
  merge(id: string, decision: MergeDecision): Promise<QueueItem<T>>

  /**
   * Update queue item status (e.g., mark as reviewing)
   * @param id - The queue item ID
   * @param status - The new status
   * @returns The updated queue item
   */
  updateStatus(id: string, status: QueueStatus): Promise<QueueItem<T>>

  /**
   * Delete a queue item
   * @param id - The queue item ID
   */
  delete(id: string): Promise<void>

  /**
   * Get queue statistics and metrics
   * @param options - Filter options for statistics
   * @returns Queue statistics
   */
  stats(options?: StatsOptions): Promise<QueueStats>

  /**
   * Clear old queue items based on criteria
   * @param options - Cleanup criteria
   * @returns Number of items removed
   */
  cleanup(options: CleanupOptions): Promise<number>
}

/**
 * Queue filter for adapter queries
 */
export interface QueueFilter {
  /** Filter by status (single or multiple) */
  status?: QueueStatus | QueueStatus[]

  /** Filter by tags */
  tags?: string[]

  /** Filter items created since this date */
  since?: Date

  /** Filter items created until this date */
  until?: Date

  /** Filter by priority range */
  priority?: { min?: number; max?: number }

  /** Maximum number of items to return */
  limit?: number

  /** Number of items to skip */
  offset?: number

  /** Ordering specification */
  orderBy?: { field: string; direction: 'asc' | 'desc' }
}

/**
 * Queue persistence adapter interface
 */
export interface QueueAdapter<T extends Record<string, unknown>> {
  /**
   * Insert a new queue item
   * @param item - The queue item to insert
   * @returns The inserted queue item
   */
  insertQueueItem(item: QueueItem<T>): Promise<QueueItem<T>>

  /**
   * Update an existing queue item
   * @param id - The queue item ID
   * @param updates - Partial updates to apply
   * @returns The updated queue item
   */
  updateQueueItem(
    id: string,
    updates: Partial<QueueItem<T>>
  ): Promise<QueueItem<T>>

  /**
   * Find queue items matching filter criteria
   * @param filter - Filter criteria
   * @returns Array of matching queue items
   */
  findQueueItems(filter: QueueFilter): Promise<QueueItem<T>[]>

  /**
   * Find a single queue item by ID
   * @param id - The queue item ID
   * @returns The queue item, or null if not found
   */
  findQueueItemById(id: string): Promise<QueueItem<T> | null>

  /**
   * Delete a queue item
   * @param id - The queue item ID
   */
  deleteQueueItem(id: string): Promise<void>

  /**
   * Count queue items matching filter criteria
   * @param filter - Filter criteria
   * @returns Count of matching items
   */
  countQueueItems(filter?: QueueFilter): Promise<number>

  /**
   * Batch insert multiple queue items
   * @param items - Array of queue items to insert
   * @returns Array of inserted queue items
   */
  batchInsertQueueItems(items: QueueItem<T>[]): Promise<QueueItem<T>[]>
}
