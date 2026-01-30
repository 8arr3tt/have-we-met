/**
 * Type alias for record identifiers.
 * Supports both string (UUIDs, slugs) and numeric (auto-increment) identifiers.
 */
export type RecordId = string | number

/**
 * Metadata associated with a record.
 * Contains system-level information about the record's identity and lifecycle.
 */
export interface RecordMetadata {
  /** Unique identifier for this record */
  id: RecordId
  /** Source system or dataset this record originated from */
  source?: string
  /** When the record was first created */
  createdAt?: Date
  /** When the record was last updated */
  updatedAt?: Date
  /** Version number for optimistic concurrency control */
  version?: number
}

/**
 * A record wrapping user data with system metadata.
 * This is the primary data structure that flows through the matching engine.
 *
 * @typeParam T - The shape of the user's data object
 */
export interface Record<T extends object = object> {
  /** The actual user data being matched */
  data: T
  /** System metadata for the record */
  metadata: RecordMetadata
}

/**
 * A pair of records being compared by the matching engine.
 * Used internally during the comparison process.
 *
 * @typeParam T - The shape of the user's data object
 */
export interface RecordPair<T extends object = object> {
  /** The first record in the comparison (typically the input record) */
  left: Record<T>
  /** The second record in the comparison (typically the candidate record) */
  right: Record<T>
}
