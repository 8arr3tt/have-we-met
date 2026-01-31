/**
 * Base error class for all adapter-related errors.
 * Extends Error with additional context and error codes.
 */
export class AdapterError extends Error {
  /**
   * Error code for programmatic error handling
   */
  readonly code: string

  /**
   * Additional context about the error
   */
  readonly context?: Record<string, unknown>

  constructor(message: string, code: string, context?: Record<string, unknown>) {
    super(message)
    this.name = 'AdapterError'
    this.code = code
    this.context = context

    Object.setPrototypeOf(this, AdapterError.prototype)
  }
}

/**
 * Error thrown when database connection fails.
 *
 * @example
 * ```typescript
 * throw new ConnectionError(
 *   'Failed to connect to database',
 *   { host: 'localhost', port: 5432 }
 * )
 * ```
 */
export class ConnectionError extends AdapterError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'CONNECTION_ERROR', context)
    this.name = 'ConnectionError'
    Object.setPrototypeOf(this, ConnectionError.prototype)
  }
}

/**
 * Error thrown when query execution fails.
 *
 * @example
 * ```typescript
 * throw new QueryError(
 *   'Invalid query syntax',
 *   { query: 'SELECT * FORM users', table: 'users' }
 * )
 * ```
 */
export class QueryError extends AdapterError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'QUERY_ERROR', context)
    this.name = 'QueryError'
    Object.setPrototypeOf(this, QueryError.prototype)
  }
}

/**
 * Error thrown when transaction fails.
 *
 * @example
 * ```typescript
 * throw new TransactionError(
 *   'Transaction rolled back due to constraint violation',
 *   { operation: 'insert', table: 'users', rollback: true }
 * )
 * ```
 */
export class TransactionError extends AdapterError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'TRANSACTION_ERROR', context)
    this.name = 'TransactionError'
    Object.setPrototypeOf(this, TransactionError.prototype)
  }
}

/**
 * Error thrown when adapter configuration is invalid.
 *
 * @example
 * ```typescript
 * throw new ValidationError(
 *   'Missing required field: tableName',
 *   { config: { primaryKey: 'id' } }
 * )
 * ```
 */
export class ValidationError extends AdapterError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', context)
    this.name = 'ValidationError'
    Object.setPrototypeOf(this, ValidationError.prototype)
  }
}

/**
 * Error thrown when a record is not found.
 *
 * @example
 * ```typescript
 * throw new NotFoundError(
 *   'Record not found',
 *   { id: 'user123', table: 'users' }
 * )
 * ```
 */
export class NotFoundError extends AdapterError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'NOT_FOUND_ERROR', context)
    this.name = 'NotFoundError'
    Object.setPrototypeOf(this, NotFoundError.prototype)
  }
}
