import type { QueueAdapter, QueueItem, QueueFilter } from '../queue/types.js'
import { ValidationError } from './adapter-error.js'
import type { QueueOptions } from '../builder/queue-options.js'
import { mergeQueueOptions } from '../builder/queue-options.js'

/**
 * Base class for queue adapter implementations.
 * Provides common validation and serialization logic for queue persistence.
 *
 * @typeParam T - The record type being stored in queue items
 */
export abstract class BaseQueueAdapter<T extends Record<string, unknown>>
  implements QueueAdapter<T>
{
  protected readonly options: Required<QueueOptions>

  constructor(options?: QueueOptions) {
    this.options = mergeQueueOptions(options)
  }

  /**
   * Get the configured queue options
   */
  getOptions(): Required<QueueOptions> {
    return { ...this.options }
  }
  /**
   * Serialize a queue item for database storage.
   * Converts Date objects to ISO strings and ensures JSON compatibility.
   *
   * @param item - The queue item to serialize
   * @returns Serialized representation for database storage
   */
  protected serializeQueueItem(item: QueueItem<T>): Record<string, unknown> {
    return {
      id: item.id,
      candidateRecord: JSON.stringify(item.candidateRecord),
      potentialMatches: JSON.stringify(item.potentialMatches),
      status: item.status,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      decidedAt: item.decidedAt ?? null,
      decidedBy: item.decidedBy ?? null,
      decision: item.decision ? JSON.stringify(item.decision) : null,
      context: item.context ? JSON.stringify(item.context) : null,
      priority: item.priority ?? 0,
      tags: item.tags ?? [],
    }
  }

  /**
   * Deserialize a queue item from database storage.
   * Parses JSON fields and converts date strings back to Date objects.
   *
   * @param row - Database row representing a queue item
   * @returns Hydrated queue item
   */
  protected deserializeQueueItem(row: Record<string, unknown>): QueueItem<T> {
    return {
      id: row.id as string,
      candidateRecord: this.parseJson(row.candidateRecord, 'candidateRecord'),
      potentialMatches: this.parseJson(row.potentialMatches, 'potentialMatches'),
      status: row.status as QueueItem<T>['status'],
      createdAt: this.parseDate(row.createdAt, 'createdAt'),
      updatedAt: this.parseDate(row.updatedAt, 'updatedAt'),
      decidedAt: row.decidedAt ? this.parseDate(row.decidedAt, 'decidedAt') : undefined,
      decidedBy: row.decidedBy ? (row.decidedBy as string) : undefined,
      decision: row.decision ? this.parseJson(row.decision, 'decision') : undefined,
      context: row.context ? this.parseJson(row.context, 'context') : undefined,
      priority: row.priority !== undefined ? (row.priority as number) : undefined,
      tags: row.tags ? (row.tags as string[]) : undefined,
    }
  }

  /**
   * Parse JSON field from database.
   *
   * @param value - Raw value from database (string or already parsed)
   * @param fieldName - Field name for error messages
   * @returns Parsed JSON value
   */
  private parseJson<V = unknown>(value: unknown, fieldName: string): V {
    if (typeof value === 'string') {
      try {
        return JSON.parse(value) as V
      } catch (error) {
        throw new ValidationError(`Failed to parse JSON field '${fieldName}'`, {
          fieldName,
          value,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
    return value as V
  }

  /**
   * Parse date field from database.
   *
   * @param value - Raw value from database (string, Date, or number)
   * @param fieldName - Field name for error messages
   * @returns Date object
   */
  private parseDate(value: unknown, fieldName: string): Date {
    if (value instanceof Date) {
      return value
    }
    if (typeof value === 'string' || typeof value === 'number') {
      const date = new Date(value)
      if (isNaN(date.getTime())) {
        throw new ValidationError(`Invalid date value for field '${fieldName}'`, {
          fieldName,
          value,
        })
      }
      return date
    }
    throw new ValidationError(`Expected date for field '${fieldName}'`, {
      fieldName,
      value,
      type: typeof value,
    })
  }

  /**
   * Validate queue item before insertion.
   *
   * @param item - Queue item to validate
   */
  protected validateQueueItem(item: QueueItem<T>): void {
    if (!item.id) {
      throw new ValidationError('Queue item must have an id', { item })
    }
    if (!item.candidateRecord || Object.keys(item.candidateRecord).length === 0) {
      throw new ValidationError('Queue item must have a non-empty candidateRecord', { item })
    }
    if (!Array.isArray(item.potentialMatches) || item.potentialMatches.length === 0) {
      throw new ValidationError('Queue item must have at least one potential match', { item })
    }
    if (!item.status) {
      throw new ValidationError('Queue item must have a status', { item })
    }
  }

  /**
   * Normalize filter for database queries.
   * Ensures consistent handling of array vs single value status filters.
   *
   * @param filter - Queue filter
   * @returns Normalized filter
   */
  protected normalizeFilter(filter: QueueFilter): QueueFilter {
    const normalized = { ...filter }

    if (normalized.status && !Array.isArray(normalized.status)) {
      normalized.status = [normalized.status]
    }

    return normalized
  }

  abstract insertQueueItem(item: QueueItem<T>): Promise<QueueItem<T>>
  abstract updateQueueItem(
    id: string,
    updates: Partial<QueueItem<T>>,
  ): Promise<QueueItem<T>>
  abstract findQueueItems(filter: QueueFilter): Promise<QueueItem<T>[]>
  abstract findQueueItemById(id: string): Promise<QueueItem<T> | null>
  abstract deleteQueueItem(id: string): Promise<void>
  abstract countQueueItems(filter?: QueueFilter): Promise<number>
  abstract batchInsertQueueItems(items: QueueItem<T>[]): Promise<QueueItem<T>[]>
}
