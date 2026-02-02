/**
 * Central error classes and validation utilities for have-we-met library
 * @module utils/errors
 */

/**
 * Base error class for all have-we-met errors
 */
export class HaveWeMetError extends Error {
  /** Error code for programmatic error handling */
  public readonly code: string

  /** Additional error context */
  public readonly context?: Record<string, unknown>

  constructor(
    message: string,
    code: string,
    context?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'HaveWeMetError'
    this.code = code
    this.context = context

    // Maintains proper stack trace (Node.js specific)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (typeof (Error as any).captureStackTrace === 'function') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(Error as any).captureStackTrace(this, this.constructor)
    }
  }
}

/**
 * Error thrown when a required parameter is missing
 */
export class MissingParameterError extends HaveWeMetError {
  public readonly parameterName: string

  constructor(parameterName: string, context?: Record<string, unknown>) {
    super(
      `Missing required parameter: '${parameterName}'`,
      'MISSING_PARAMETER',
      { parameterName, ...context }
    )
    this.name = 'MissingParameterError'
    this.parameterName = parameterName
  }
}

/**
 * Error thrown when a parameter value is invalid
 */
export class InvalidParameterError extends HaveWeMetError {
  public readonly parameterName: string
  public readonly value: unknown
  public readonly reason: string

  constructor(
    parameterName: string,
    value: unknown,
    reason: string,
    context?: Record<string, unknown>
  ) {
    super(
      `Invalid parameter '${parameterName}': ${reason}`,
      'INVALID_PARAMETER',
      { parameterName, value, reason, ...context }
    )
    this.name = 'InvalidParameterError'
    this.parameterName = parameterName
    this.value = value
    this.reason = reason
  }
}

/**
 * Error thrown when configuration is invalid
 */
export class ConfigurationError extends HaveWeMetError {
  public readonly field?: string

  constructor(message: string, field?: string, context?: Record<string, unknown>) {
    super(message, 'CONFIGURATION_ERROR', { field, ...context })
    this.name = 'ConfigurationError'
    this.field = field
  }
}

/**
 * Error thrown when a builder method is called in invalid sequence
 */
export class BuilderSequenceError extends HaveWeMetError {
  public readonly method: string

  constructor(method: string, message: string, context?: Record<string, unknown>) {
    super(
      `Builder sequence error in ${method}: ${message}`,
      'BUILDER_SEQUENCE_ERROR',
      { method, ...context }
    )
    this.name = 'BuilderSequenceError'
    this.method = method
  }
}

/**
 * Error thrown when feature is not configured
 */
export class NotConfiguredError extends HaveWeMetError {
  public readonly feature: string

  constructor(feature: string, guidance: string, context?: Record<string, unknown>) {
    super(
      `Feature '${feature}' is not configured. ${guidance}`,
      'NOT_CONFIGURED',
      { feature, guidance, ...context }
    )
    this.name = 'NotConfiguredError'
    this.feature = feature
  }
}

// ==================== VALIDATION UTILITIES ====================

/**
 * Validates that a value is not null or undefined
 */
export function requireNonNull<T>(
  value: T | null | undefined,
  parameterName: string
): T {
  if (value === null || value === undefined) {
    throw new MissingParameterError(parameterName)
  }
  return value
}

/**
 * Validates that a number is positive (> 0)
 */
export function requirePositive(value: number, parameterName: string): number {
  if (typeof value !== 'number' || isNaN(value)) {
    throw new InvalidParameterError(
      parameterName,
      value,
      'must be a number'
    )
  }
  if (value <= 0) {
    throw new InvalidParameterError(
      parameterName,
      value,
      'must be positive (> 0)'
    )
  }
  return value
}

/**
 * Validates that a number is non-negative (>= 0)
 */
export function requireNonNegative(value: number, parameterName: string): number {
  if (typeof value !== 'number' || isNaN(value)) {
    throw new InvalidParameterError(
      parameterName,
      value,
      'must be a number'
    )
  }
  if (value < 0) {
    throw new InvalidParameterError(
      parameterName,
      value,
      'must be non-negative (>= 0)'
    )
  }
  return value
}

/**
 * Validates that a number is within a specific range (inclusive)
 */
export function requireInRange(
  value: number,
  min: number,
  max: number,
  parameterName: string
): number {
  if (typeof value !== 'number' || isNaN(value)) {
    throw new InvalidParameterError(
      parameterName,
      value,
      'must be a number'
    )
  }
  if (value < min || value > max) {
    throw new InvalidParameterError(
      parameterName,
      value,
      `must be between ${min} and ${max} (inclusive)`
    )
  }
  return value
}

/**
 * Validates that an array is non-empty
 */
export function requireNonEmptyArray<T>(
  value: T[],
  parameterName: string
): T[] {
  if (!Array.isArray(value)) {
    throw new InvalidParameterError(
      parameterName,
      value,
      'must be an array'
    )
  }
  if (value.length === 0) {
    throw new InvalidParameterError(
      parameterName,
      value,
      'must not be empty'
    )
  }
  return value
}

/**
 * Validates that a string is non-empty
 */
export function requireNonEmptyString(value: string, parameterName: string): string {
  if (typeof value !== 'string') {
    throw new InvalidParameterError(
      parameterName,
      value,
      'must be a string'
    )
  }
  if (value.trim().length === 0) {
    throw new InvalidParameterError(
      parameterName,
      value,
      'must not be empty'
    )
  }
  return value
}

/**
 * Validates that a value is one of the allowed options
 */
export function requireOneOf<T>(
  value: T,
  allowedValues: readonly T[],
  parameterName: string
): T {
  if (!allowedValues.includes(value)) {
    throw new InvalidParameterError(
      parameterName,
      value,
      `must be one of: ${allowedValues.join(', ')}`
    )
  }
  return value
}

/**
 * Validates that an object is a valid plain object (not null, not array)
 */
export function requirePlainObject(
  value: unknown,
  parameterName: string
): Record<string, unknown> {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new InvalidParameterError(
      parameterName,
      value,
      'must be a plain object'
    )
  }
  return value as Record<string, unknown>
}

/**
 * Validates that a function is provided
 */
export function requireFunction(
  value: unknown,
  parameterName: string
): (...args: unknown[]) => unknown {
  if (typeof value !== 'function') {
    throw new InvalidParameterError(
      parameterName,
      value,
      'must be a function'
    )
  }
  return value as (...args: unknown[]) => unknown
}

/**
 * Validates that two numbers satisfy a less-than relationship
 */
export function requireLessThan(
  value: number,
  otherValue: number,
  parameterName: string,
  otherParameterName: string
): void {
  if (value >= otherValue) {
    throw new ConfigurationError(
      `${parameterName} (${value}) must be less than ${otherParameterName} (${otherValue})`
    )
  }
}

/**
 * Check if an error is a have-we-met error
 */
export function isHaveWeMetError(error: unknown): error is HaveWeMetError {
  return error instanceof HaveWeMetError
}
