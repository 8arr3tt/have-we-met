import type { QueueAdapter, QueueFilter } from '../queue/types.js'

export type { QueueAdapter, QueueFilter }

/**
 * Core adapter interface that all database implementations must satisfy.
 * Provides storage-agnostic operations for querying, reading, writing, and managing records.
 *
 * @typeParam T - The record type being stored and queried
 *
 * @example
 * ```typescript
 * const adapter = prismaAdapter(prisma, { tableName: 'customers' })
 * const records = await adapter.findByBlockingKeys(
 *   new Map([['lastName', 'Smith'], ['dobYear', '1985']])
 * )
 * ```
 */
export interface DatabaseAdapter<T extends Record<string, unknown>> {
  /**
   * Queue adapter for review queue persistence.
   * Available when the adapter is configured to support queue operations.
   */
  queue?: QueueAdapter<T>
  /**
   * Find records matching the blocking criteria.
   * Used to efficiently retrieve candidate records for matching based on blocking keys.
   *
   * @param blockingKeys - Map of field names to block values
   * @param options - Query options (limit, offset, etc.)
   * @returns Array of matching records
   *
   * @example
   * ```typescript
   * const blockingKeys = new Map([['lastName', 'Smith']])
   * const candidates = await adapter.findByBlockingKeys(blockingKeys, { limit: 100 })
   * ```
   */
  findByBlockingKeys(
    blockingKeys: Map<string, unknown>,
    options?: QueryOptions
  ): Promise<T[]>

  /**
   * Find records by primary keys.
   * Used to retrieve specific records by their identifiers.
   *
   * @param ids - Array of record IDs
   * @returns Array of records matching the IDs
   *
   * @example
   * ```typescript
   * const records = await adapter.findByIds(['id1', 'id2', 'id3'])
   * ```
   */
  findByIds(ids: string[]): Promise<T[]>

  /**
   * Get all records (with optional filtering).
   * Used for batch processing and deduplication.
   *
   * @param options - Query options (limit, offset, orderBy, field selection)
   * @returns Array of records
   *
   * @example
   * ```typescript
   * const allRecords = await adapter.findAll({ limit: 1000, offset: 0 })
   * ```
   */
  findAll(options?: QueryOptions): Promise<T[]>

  /**
   * Count total records.
   * Used to determine batch processing size and progress tracking.
   *
   * @param filter - Optional filter criteria
   * @returns Total count of records matching the filter
   *
   * @example
   * ```typescript
   * const total = await adapter.count()
   * const filtered = await adapter.count({ status: { operator: 'eq', value: 'active' } })
   * ```
   */
  count(filter?: FilterCriteria): Promise<number>

  /**
   * Insert a new record.
   *
   * @param record - Record to insert
   * @returns The inserted record with any generated fields (e.g., ID)
   *
   * @example
   * ```typescript
   * const newRecord = await adapter.insert({ firstName: 'John', lastName: 'Doe' })
   * ```
   */
  insert(record: T): Promise<T>

  /**
   * Update an existing record.
   *
   * @param id - Record identifier
   * @param updates - Fields to update
   * @returns The updated record
   *
   * @example
   * ```typescript
   * const updated = await adapter.update('id123', { email: 'new@example.com' })
   * ```
   */
  update(id: string, updates: Partial<T>): Promise<T>

  /**
   * Delete a record.
   *
   * @param id - Record identifier
   *
   * @example
   * ```typescript
   * await adapter.delete('id123')
   * ```
   */
  delete(id: string): Promise<void>

  /**
   * Execute operations within a transaction.
   * Ensures atomicity for operations that must succeed or fail together.
   *
   * @param callback - Transaction callback receiving a transactional adapter
   * @returns Result from the callback
   *
   * @example
   * ```typescript
   * const result = await adapter.transaction(async (txAdapter) => {
   *   const record = await txAdapter.insert(newRecord)
   *   await txAdapter.delete(oldRecordId)
   *   return record
   * })
   * ```
   */
  transaction<R>(
    callback: (adapter: DatabaseAdapter<T>) => Promise<R>
  ): Promise<R>

  /**
   * Batch insert multiple records.
   * More efficient than individual inserts for large datasets.
   *
   * @param records - Records to insert
   * @returns Array of inserted records
   *
   * @example
   * ```typescript
   * const records = [{ firstName: 'John' }, { firstName: 'Jane' }]
   * const inserted = await adapter.batchInsert(records)
   * ```
   */
  batchInsert(records: T[]): Promise<T[]>

  /**
   * Batch update multiple records.
   * More efficient than individual updates for large datasets.
   *
   * @param updates - Array of {id, updates} pairs
   * @returns Array of updated records
   *
   * @example
   * ```typescript
   * const updates = [
   *   { id: 'id1', updates: { status: 'merged' } },
   *   { id: 'id2', updates: { status: 'merged' } }
   * ]
   * const updated = await adapter.batchUpdate(updates)
   * ```
   */
  batchUpdate(updates: Array<{ id: string; updates: Partial<T> }>): Promise<T[]>
}

/**
 * Query options for database operations.
 * Used to control pagination, ordering, and field selection.
 */
export interface QueryOptions {
  /** Maximum number of records to return */
  limit?: number
  /** Number of records to skip (for pagination) */
  offset?: number
  /** Field and direction for ordering results */
  orderBy?: { field: string; direction: 'asc' | 'desc' }
  /** Specific fields to retrieve (projection) */
  fields?: string[]
}

/**
 * Filter criteria for queries.
 * Supports simple equality and advanced operators.
 *
 * @example
 * ```typescript
 * const filter: FilterCriteria = {
 *   status: 'active', // Simple equality
 *   age: { operator: 'gt', value: 18 }, // Greater than
 *   email: { operator: 'like', value: '%@example.com' } // Pattern match
 * }
 * ```
 */
export interface FilterCriteria {
  [field: string]:
    | unknown
    | { operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'like'; value: unknown }
}

/**
 * Configuration options for adapter behavior.
 * Controls how the adapter interacts with the database.
 */
export interface AdapterConfig {
  /** Database table/collection name */
  tableName: string

  /** Primary key field name (default: 'id') */
  primaryKey?: string

  /** Field mapping (adapter field -> schema field) */
  fieldMapping?: Record<string, string>

  /** Whether to use prepared statements (default: true) */
  usePreparedStatements?: boolean

  /** Connection pool settings */
  poolConfig?: {
    min?: number
    max?: number
    idleTimeoutMs?: number
  }

  /** Queue configuration options */
  queue?: import('../builder/queue-options.js').QueueOptions
}

/**
 * Factory function interface for creating adapters.
 * Each ORM adapter provides a factory function that creates configured adapter instances.
 *
 * @typeParam T - The record type
 * @param client - Database client (Prisma, Drizzle, TypeORM)
 * @param config - Adapter configuration
 * @returns Configured database adapter
 */
export type AdapterFactory<T extends Record<string, unknown>> = (
  client: unknown,
  config: AdapterConfig
) => DatabaseAdapter<T>

/**
 * Options for resolving records using database adapter.
 */
export interface DatabaseResolveOptions {
  /** Use blocking to reduce query scope (default: true) */
  useBlocking?: boolean

  /** Maximum records to fetch from database (default: 1000) */
  maxFetchSize?: number

  /** Automatically add potential matches to review queue */
  autoQueue?: boolean

  /** Context to include with queued items */
  queueContext?: Partial<import('../queue/types.js').QueueContext>
}

/**
 * Options for batch deduplication from database.
 */
export interface DatabaseDeduplicationOptions {
  /** Process in batches of N records (default: 1000) */
  batchSize?: number

  /** Save results back to database (default: false) */
  persistResults?: boolean

  /** Maximum number of records to process (default: unlimited) */
  maxRecords?: number

  /** Whether to include detailed explanations in results (default: true) */
  returnExplanation?: boolean

  /** Automatically add potential matches to review queue */
  autoQueue?: boolean

  /** Context to include with queued items */
  queueContext?: Partial<import('../queue/types.js').QueueContext>
}

/**
 * Result from batch deduplication operations.
 */
export interface DeduplicationBatchResult {
  /** Total number of records processed */
  totalProcessed: number

  /** Number of duplicate groups found */
  duplicateGroupsFound: number

  /** Total number of potential duplicates identified */
  totalDuplicates: number

  /** Time taken in milliseconds */
  durationMs: number

  /** Detailed match results for each duplicate group */
  results: Array<{
    masterRecordId: string
    duplicateIds: string[]
    score: number
  }>
}

/**
 * Options for merge operations.
 */
export interface MergeOptions {
  /** Whether to delete merged records after merging (default: false) */
  deleteAfterMerge?: boolean

  /** Strategy for conflict resolution (Phase 8 feature) */
  conflictResolution?: 'manual' | 'automatic'

  /** Whether to use transactions for atomic operations (default: true) */
  useTransaction?: boolean
}

/**
 * Result from merge operations.
 */
export interface MergeResult {
  /** ID of the resulting merged record */
  mergedRecordId: string

  /** IDs of records that were merged into the master */
  sourceRecordIds: string[]

  /** Number of fields merged */
  fieldsMerged: number

  /** Any conflicts that occurred during merge */
  conflicts?: Array<{
    field: string
    values: unknown[]
    resolution: unknown
  }>
}
