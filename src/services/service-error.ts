/**
 * Service-specific error classes for external services
 * @module services/service-error
 */

import type { ServiceErrorType, CircuitState } from './types.js'

/**
 * Base error class for all service-related errors
 */
export class ServiceError extends Error {
  /** Error code for programmatic handling */
  public readonly code: string

  /** Error type for categorization */
  public readonly type: ServiceErrorType

  /** Whether this error is eligible for retry */
  public readonly retryable: boolean

  /** Additional error context */
  public readonly context?: Record<string, unknown>

  constructor(
    message: string,
    code: string,
    type: ServiceErrorType,
    retryable: boolean,
    context?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'ServiceError'
    this.code = code
    this.type = type
    this.retryable = retryable
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
 * Error thrown when a service call times out
 */
export class ServiceTimeoutError extends ServiceError {
  /** Timeout duration in milliseconds */
  public readonly timeoutMs: number

  /** Service name that timed out */
  public readonly serviceName: string

  constructor(
    serviceName: string,
    timeoutMs: number,
    context?: Record<string, unknown>
  ) {
    super(
      `Service '${serviceName}' timed out after ${timeoutMs}ms`,
      'SERVICE_TIMEOUT',
      'timeout',
      true, // Timeouts are retryable
      { serviceName, timeoutMs, ...context }
    )
    this.name = 'ServiceTimeoutError'
    this.serviceName = serviceName
    this.timeoutMs = timeoutMs
  }
}

/**
 * Error thrown when a network error occurs during service call
 */
export class ServiceNetworkError extends ServiceError {
  /** Service name that experienced network error */
  public readonly serviceName: string

  /** Original network error */
  public readonly cause?: Error

  constructor(
    serviceName: string,
    message: string,
    cause?: Error,
    context?: Record<string, unknown>
  ) {
    super(
      `Network error in service '${serviceName}': ${message}`,
      'SERVICE_NETWORK_ERROR',
      'network',
      true, // Network errors are retryable
      { serviceName, originalMessage: message, ...context }
    )
    this.name = 'ServiceNetworkError'
    this.serviceName = serviceName
    this.cause = cause
  }
}

/**
 * Error thrown when input validation fails for a service
 */
export class ServiceInputValidationError extends ServiceError {
  /** Service name */
  public readonly serviceName: string

  /** Field that failed validation */
  public readonly field?: string

  /** Reason for validation failure */
  public readonly reason: string

  constructor(
    serviceName: string,
    reason: string,
    field?: string,
    context?: Record<string, unknown>
  ) {
    const fieldInfo = field ? ` for field '${field}'` : ''
    super(
      `Input validation failed${fieldInfo} in service '${serviceName}': ${reason}`,
      'SERVICE_INPUT_VALIDATION_ERROR',
      'validation',
      false, // Input validation errors are not retryable
      { serviceName, field, reason, ...context }
    )
    this.name = 'ServiceInputValidationError'
    this.serviceName = serviceName
    this.field = field
    this.reason = reason
  }
}

/**
 * Error thrown when a lookup service finds no results
 */
export class ServiceNotFoundError extends ServiceError {
  /** Service name */
  public readonly serviceName: string

  /** Lookup key that was not found */
  public readonly lookupKey?: Record<string, unknown>

  constructor(
    serviceName: string,
    lookupKey?: Record<string, unknown>,
    context?: Record<string, unknown>
  ) {
    const keyInfo = lookupKey ? ` for key ${JSON.stringify(lookupKey)}` : ''
    super(
      `No result found${keyInfo} in service '${serviceName}'`,
      'SERVICE_NOT_FOUND',
      'not_found',
      false, // Not found errors are not retryable
      { serviceName, lookupKey, ...context }
    )
    this.name = 'ServiceNotFoundError'
    this.serviceName = serviceName
    this.lookupKey = lookupKey
  }
}

/**
 * Error thrown when a service rejects the request (e.g., validation failure)
 */
export class ServiceRejectedError extends ServiceError {
  /** Service name */
  public readonly serviceName: string

  /** Reason for rejection */
  public readonly reason: string

  constructor(
    serviceName: string,
    reason: string,
    context?: Record<string, unknown>
  ) {
    super(
      `Request rejected by service '${serviceName}': ${reason}`,
      'SERVICE_REJECTED',
      'rejected',
      false, // Rejected requests are not retryable
      { serviceName, reason, ...context }
    )
    this.name = 'ServiceRejectedError'
    this.serviceName = serviceName
    this.reason = reason
  }
}

/**
 * Error thrown when a service is unavailable (circuit breaker open)
 */
export class ServiceUnavailableError extends ServiceError {
  /** Service name */
  public readonly serviceName: string

  /** Current circuit breaker state */
  public readonly circuitState: CircuitState

  /** When the circuit might reset */
  public readonly resetAt?: Date

  constructor(
    serviceName: string,
    circuitState: CircuitState,
    resetAt?: Date,
    context?: Record<string, unknown>
  ) {
    const resetInfo = resetAt ? `. May reset at ${resetAt.toISOString()}` : ''
    super(
      `Service '${serviceName}' is unavailable (circuit ${circuitState})${resetInfo}`,
      'SERVICE_UNAVAILABLE',
      'unavailable',
      false, // Circuit breaker errors are not immediately retryable
      { serviceName, circuitState, resetAt, ...context }
    )
    this.name = 'ServiceUnavailableError'
    this.serviceName = serviceName
    this.circuitState = circuitState
    this.resetAt = resetAt
  }
}

/**
 * Error thrown when a server error occurs (5xx response)
 */
export class ServiceServerError extends ServiceError {
  /** Service name */
  public readonly serviceName: string

  /** HTTP status code if applicable */
  public readonly statusCode?: number

  constructor(
    serviceName: string,
    message: string,
    statusCode?: number,
    context?: Record<string, unknown>
  ) {
    const statusInfo = statusCode ? ` (HTTP ${statusCode})` : ''
    super(
      `Server error in service '${serviceName}'${statusInfo}: ${message}`,
      'SERVICE_SERVER_ERROR',
      'unknown',
      true, // Server errors are retryable
      { serviceName, statusCode, originalMessage: message, ...context }
    )
    this.name = 'ServiceServerError'
    this.serviceName = serviceName
    this.statusCode = statusCode
  }
}

/**
 * Error thrown when service configuration is invalid
 */
export class ServiceConfigurationError extends ServiceError {
  /** Field path that has invalid configuration */
  public readonly field: string

  /** Reason for invalid configuration */
  public readonly reason: string

  constructor(
    field: string,
    reason: string,
    context?: Record<string, unknown>
  ) {
    super(
      `Invalid service configuration for '${field}': ${reason}`,
      'SERVICE_CONFIGURATION_ERROR',
      'validation',
      false, // Configuration errors are not retryable
      { field, reason, ...context }
    )
    this.name = 'ServiceConfigurationError'
    this.field = field
    this.reason = reason
  }
}

/**
 * Error thrown when a service plugin is invalid
 */
export class ServicePluginError extends ServiceError {
  /** Plugin name */
  public readonly pluginName?: string

  /** Reason for plugin error */
  public readonly reason: string

  constructor(
    reason: string,
    pluginName?: string,
    context?: Record<string, unknown>
  ) {
    const nameInfo = pluginName ? ` '${pluginName}'` : ''
    super(
      `Invalid service plugin${nameInfo}: ${reason}`,
      'SERVICE_PLUGIN_ERROR',
      'validation',
      false,
      { pluginName, reason, ...context }
    )
    this.name = 'ServicePluginError'
    this.pluginName = pluginName
    this.reason = reason
  }
}

/**
 * Error thrown when a service is not found in the executor
 */
export class ServiceNotRegisteredError extends ServiceError {
  /** Service name that was not found */
  public readonly serviceName: string

  /** Available service names */
  public readonly availableServices: string[]

  constructor(
    serviceName: string,
    availableServices: string[],
    context?: Record<string, unknown>
  ) {
    super(
      `Service '${serviceName}' is not registered. Available services: ${availableServices.join(', ') || 'none'}`,
      'SERVICE_NOT_REGISTERED',
      'validation',
      false,
      { serviceName, availableServices, ...context }
    )
    this.name = 'ServiceNotRegisteredError'
    this.serviceName = serviceName
    this.availableServices = availableServices
  }
}

/**
 * Error thrown when a service is already registered with the same name
 */
export class ServiceAlreadyRegisteredError extends ServiceError {
  /** Service name that is duplicated */
  public readonly serviceName: string

  constructor(serviceName: string, context?: Record<string, unknown>) {
    super(
      `Service '${serviceName}' is already registered`,
      'SERVICE_ALREADY_REGISTERED',
      'validation',
      false,
      { serviceName, ...context }
    )
    this.name = 'ServiceAlreadyRegisteredError'
    this.serviceName = serviceName
  }
}

/**
 * Checks if an error is a ServiceError
 */
export function isServiceError(error: unknown): error is ServiceError {
  return error instanceof ServiceError
}

/**
 * Checks if an error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof ServiceError) {
    return error.retryable
  }
  return false
}

/**
 * Creates a ServiceError from an unknown error
 */
export function toServiceError(
  error: unknown,
  serviceName: string,
  defaultType: ServiceErrorType = 'unknown'
): ServiceError {
  if (error instanceof ServiceError) {
    return error
  }

  if (error instanceof Error) {
    // Check for common error patterns
    const message = error.message.toLowerCase()

    if (message.includes('timeout') || message.includes('timed out')) {
      return new ServiceTimeoutError(serviceName, 0, {
        originalError: error.message,
      })
    }

    if (
      message.includes('network') ||
      message.includes('econnrefused') ||
      message.includes('econnreset') ||
      message.includes('enotfound')
    ) {
      return new ServiceNetworkError(serviceName, error.message, error)
    }

    return new ServiceError(
      `Service '${serviceName}' error: ${error.message}`,
      'SERVICE_ERROR',
      defaultType,
      defaultType === 'timeout' || defaultType === 'network',
      { originalError: error.message, serviceName }
    )
  }

  return new ServiceError(
    `Service '${serviceName}' error: ${String(error)}`,
    'SERVICE_ERROR',
    defaultType,
    false,
    { originalError: String(error), serviceName }
  )
}
