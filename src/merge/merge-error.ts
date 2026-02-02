/**
 * Merge-specific error classes
 * @module merge/merge-error
 */

import type { MergeStrategy, MergeConflict } from './types.js'

/**
 * Base error class for all merge-related errors
 */
export class MergeError extends Error {
  /** Error code for programmatic handling */
  public readonly code: string

  /** Additional error context */
  public readonly context?: Record<string, unknown>

  constructor(
    message: string,
    code: string,
    context?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'MergeError'
    this.code = code
    this.context = context

    // Maintains proper stack trace for where error was thrown (Node.js specific)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (typeof (Error as any).captureStackTrace === 'function') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(Error as any).captureStackTrace(this, this.constructor)
    }
  }
}

/**
 * Error thrown when merge configuration is invalid
 */
export class MergeValidationError extends MergeError {
  constructor(
    field: string,
    reason: string,
    context?: Record<string, unknown>
  ) {
    super(
      `Merge validation failed for '${field}': ${reason}`,
      'MERGE_VALIDATION_ERROR',
      {
        field,
        reason,
        ...context,
      }
    )
    this.name = 'MergeValidationError'
  }
}

/**
 * Error thrown when a conflict cannot be resolved during merge
 */
export class MergeConflictError extends MergeError {
  /** The conflict that caused the error */
  public readonly conflict: MergeConflict

  constructor(conflict: MergeConflict) {
    super(
      `Unresolvable merge conflict for field '${conflict.field}': ${conflict.values.length} conflicting values`,
      'MERGE_CONFLICT_ERROR',
      { conflict }
    )
    this.name = 'MergeConflictError'
    this.conflict = conflict
  }
}

/**
 * Error thrown when provenance tracking fails
 */
export class MergeProvenanceError extends MergeError {
  constructor(
    operation: string,
    reason: string,
    context?: Record<string, unknown>
  ) {
    super(
      `Provenance tracking failed during '${operation}': ${reason}`,
      'MERGE_PROVENANCE_ERROR',
      {
        operation,
        reason,
        ...context,
      }
    )
    this.name = 'MergeProvenanceError'
  }
}

/**
 * Error thrown when unmerge operation fails
 */
export class UnmergeError extends MergeError {
  constructor(
    goldenRecordId: string,
    reason: string,
    context?: Record<string, unknown>
  ) {
    super(
      `Cannot unmerge record '${goldenRecordId}': ${reason}`,
      'UNMERGE_ERROR',
      {
        goldenRecordId,
        reason,
        ...context,
      }
    )
    this.name = 'UnmergeError'
  }
}

/**
 * Error thrown when a source record required for merge is not found
 */
export class SourceRecordNotFoundError extends MergeError {
  /** The ID of the missing record */
  public readonly recordId: string

  constructor(recordId: string, context?: Record<string, unknown>) {
    super(`Source record not found: ${recordId}`, 'SOURCE_RECORD_NOT_FOUND', {
      recordId,
      ...context,
    })
    this.name = 'SourceRecordNotFoundError'
    this.recordId = recordId
  }
}

/**
 * Error thrown when a merge strategy is not found or invalid
 */
export class InvalidStrategyError extends MergeError {
  /** The invalid strategy name */
  public readonly strategy: string

  constructor(strategy: string, context?: Record<string, unknown>) {
    super(`Invalid merge strategy: '${strategy}'`, 'INVALID_STRATEGY', {
      strategy,
      ...context,
    })
    this.name = 'InvalidStrategyError'
    this.strategy = strategy
  }
}

/**
 * Error thrown when a strategy is applied to an incompatible field type
 */
export class StrategyTypeMismatchError extends MergeError {
  /** The strategy that was misused */
  public readonly strategy: MergeStrategy

  /** The field path */
  public readonly field: string

  /** Expected type for this strategy */
  public readonly expectedType: string

  /** Actual type found */
  public readonly actualType: string

  constructor(
    strategy: MergeStrategy,
    field: string,
    expectedType: string,
    actualType: string,
    context?: Record<string, unknown>
  ) {
    super(
      `Strategy '${strategy}' cannot be applied to field '${field}': expected ${expectedType}, got ${actualType}`,
      'STRATEGY_TYPE_MISMATCH',
      {
        strategy,
        field,
        expectedType,
        actualType,
        ...context,
      }
    )
    this.name = 'StrategyTypeMismatchError'
    this.strategy = strategy
    this.field = field
    this.expectedType = expectedType
    this.actualType = actualType
  }
}

/**
 * Error thrown when custom strategy is specified without a custom function
 */
export class CustomStrategyMissingError extends MergeError {
  /** The field that requires a custom function */
  public readonly field: string

  constructor(field: string, context?: Record<string, unknown>) {
    super(
      `Field '${field}' uses 'custom' strategy but no customMerge function was provided`,
      'CUSTOM_STRATEGY_MISSING',
      {
        field,
        ...context,
      }
    )
    this.name = 'CustomStrategyMissingError'
    this.field = field
  }
}

/**
 * Error thrown when provenance record is not found for unmerge
 */
export class ProvenanceNotFoundError extends MergeError {
  /** The golden record ID that has no provenance */
  public readonly goldenRecordId: string

  constructor(goldenRecordId: string, context?: Record<string, unknown>) {
    super(
      `No provenance found for golden record '${goldenRecordId}'`,
      'PROVENANCE_NOT_FOUND',
      {
        goldenRecordId,
        ...context,
      }
    )
    this.name = 'ProvenanceNotFoundError'
    this.goldenRecordId = goldenRecordId
  }
}

/**
 * Error thrown when attempting to merge fewer than 2 records
 */
export class InsufficientSourceRecordsError extends MergeError {
  /** Number of records provided */
  public readonly recordCount: number

  constructor(recordCount: number, context?: Record<string, unknown>) {
    super(
      `Merge requires at least 2 source records, got ${recordCount}`,
      'INSUFFICIENT_SOURCE_RECORDS',
      {
        recordCount,
        ...context,
      }
    )
    this.name = 'InsufficientSourceRecordsError'
    this.recordCount = recordCount
  }
}
