/**
 * Resilience patterns for external service calls
 * @module services/resilience
 *
 * This module provides three core resilience patterns:
 * - Timeout: Bound execution time for async operations
 * - Retry: Automatic retry with exponential backoff
 * - Circuit Breaker: Prevent cascading failures
 *
 * These patterns can be used individually or combined using `withResilience()`.
 *
 * @example
 * ```typescript
 * import { withResilience, withTimeout, withRetry, CircuitBreaker } from './resilience'
 *
 * // Individual patterns
 * const result = await withTimeout(fetchData(), { timeoutMs: 5000 })
 *
 * // Combined patterns
 * const result = await withResilience(
 *   () => fetchData(),
 *   {
 *     timeout: { timeoutMs: 5000 },
 *     retry: { maxAttempts: 3 },
 *     circuitBreaker: { failureThreshold: 5 }
 *   }
 * )
 * ```
 */

// Timeout exports
export {
  withTimeout,
  withTimeoutFn,
  withTimeoutTimed,
  createTimeoutController,
  TimeoutController,
  type TimeoutOptions,
  type TimedResult,
} from './timeout.js'

// Retry exports
export {
  withRetry,
  withRetryDetailed,
  createRetryable,
  calculateRetryDelay,
  shouldRetryError,
  RetryTracker,
  DEFAULT_RETRY_CONFIG,
  type ExtendedRetryConfig,
  type RetryResult,
  type AttemptDetail,
} from './retry.js'

// Circuit breaker exports
export {
  CircuitBreaker,
  createCircuitBreaker,
  withCircuitBreaker,
  CircuitBreakerRegistry,
  createCircuitBreakerRegistry,
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
  type CircuitBreakerInput,
} from './circuit-breaker.js'

// Re-export CircuitBreakerInput as ExtendedCircuitBreakerConfig for backwards compatibility
export type { CircuitBreakerInput as ExtendedCircuitBreakerConfig } from './circuit-breaker.js'

// Re-export types from main types module
import type {
  RetryConfig,
  CircuitBreakerConfig,
  CircuitState,
  CircuitBreakerStatus,
} from '../types.js'
export type {
  RetryConfig,
  CircuitBreakerConfig,
  CircuitState,
  CircuitBreakerStatus,
}

import type { TimeoutOptions } from './timeout.js'
import type { ExtendedRetryConfig } from './retry.js'
import type { CircuitBreakerInput } from './circuit-breaker.js'
import { withTimeout } from './timeout.js'
import { withRetry } from './retry.js'
import { CircuitBreaker } from './circuit-breaker.js'
import { ServiceTimeoutError } from '../service-error.js'

/**
 * Combined resilience configuration
 */
export interface ResilienceConfig {
  /** Timeout configuration */
  timeout?: TimeoutOptions

  /** Retry configuration */
  retry?: ExtendedRetryConfig

  /** Circuit breaker configuration or instance */
  circuitBreaker?: CircuitBreakerInput | CircuitBreaker
}

/**
 * Result from a resilient operation
 */
export interface ResilienceResult<T> {
  /** The result value */
  result: T

  /** Total duration including all resilience patterns */
  totalDurationMs: number

  /** Number of retry attempts (1 = no retries) */
  attempts: number

  /** Whether the circuit breaker was involved */
  circuitBreakerInvolved: boolean

  /** Current circuit breaker state (if involved) */
  circuitState?: CircuitState
}

/**
 * Wraps an async function with all resilience patterns
 *
 * The order of application is:
 * 1. Circuit breaker check (fails fast if open)
 * 2. Retry wrapper (with timeout on each attempt)
 * 3. Record result to circuit breaker
 *
 * @param fn - The async function to protect
 * @param config - Resilience configuration
 * @returns The result of the function
 *
 * @example
 * ```typescript
 * const result = await withResilience(
 *   () => fetch('https://api.example.com/data'),
 *   {
 *     timeout: { timeoutMs: 5000, serviceName: 'api' },
 *     retry: { maxAttempts: 3, initialDelayMs: 100, backoffMultiplier: 2, maxDelayMs: 5000 },
 *     circuitBreaker: { failureThreshold: 5, resetTimeoutMs: 30000 }
 *   }
 * )
 * ```
 */
export async function withResilience<T>(
  fn: () => Promise<T>,
  config: ResilienceConfig
): Promise<T> {
  // Get or create circuit breaker
  let breaker: CircuitBreaker | undefined
  if (config.circuitBreaker) {
    breaker =
      config.circuitBreaker instanceof CircuitBreaker
        ? config.circuitBreaker
        : new CircuitBreaker(config.circuitBreaker)
  }

  // Build the operation with timeout if configured
  const timedOperation = config.timeout
    ? () => withTimeout(fn(), config.timeout!)
    : fn

  // Build the operation with retry if configured
  const retriedOperation = config.retry
    ? () => withRetry(timedOperation, config.retry!)
    : timedOperation

  // Execute through circuit breaker if configured
  if (breaker) {
    return breaker.execute(retriedOperation)
  }

  return retriedOperation()
}

/**
 * Wraps an async function with all resilience patterns and returns detailed result
 *
 * @param fn - The async function to protect
 * @param config - Resilience configuration
 * @returns The result with resilience details
 */
export async function withResilienceDetailed<T>(
  fn: () => Promise<T>,
  config: ResilienceConfig
): Promise<ResilienceResult<T>> {
  const detailedStartTime = Date.now()
  let attempts = 1
  let circuitBreakerInvolved = false
  let circuitState: CircuitState | undefined

  // Get or create circuit breaker
  let breaker: CircuitBreaker | undefined
  if (config.circuitBreaker) {
    breaker =
      config.circuitBreaker instanceof CircuitBreaker
        ? config.circuitBreaker
        : new CircuitBreaker(config.circuitBreaker)
    circuitBreakerInvolved = true
    circuitState = breaker.state
  }

  // Build the operation with timeout if configured
  const timedOperation = config.timeout
    ? () => withTimeout(fn(), config.timeout!)
    : fn

  // Build the operation with retry if configured, tracking attempts
  const retriedOperation = config.retry
    ? async (): Promise<T> => {
        let lastError: Error | undefined
        const maxAttempts = config.retry!.maxAttempts

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          attempts = attempt
          try {
            return await timedOperation()
          } catch (error) {
            lastError =
              error instanceof Error ? error : new Error(String(error))

            if (attempt === maxAttempts) {
              break
            }

            // Calculate delay
            const { calculateRetryDelay, shouldRetryError } =
              await import('./retry.js')
            if (!shouldRetryError(lastError, config.retry!)) {
              break
            }

            const delay = calculateRetryDelay(attempt, config.retry!)
            await new Promise((resolve) => setTimeout(resolve, delay))
          }
        }

        throw lastError!
      }
    : timedOperation

  // Execute through circuit breaker if configured
  let result: T
  if (breaker) {
    result = await breaker.execute(retriedOperation)
    circuitState = breaker.state
  } else {
    result = await retriedOperation()
  }

  return {
    result,
    totalDurationMs: Date.now() - detailedStartTime,
    attempts,
    circuitBreakerInvolved,
    circuitState,
  }
}

/**
 * Create a function wrapper with resilience patterns
 *
 * @param fn - The async function to wrap
 * @param config - Resilience configuration
 * @returns A resilient function wrapper
 *
 * @example
 * ```typescript
 * const resilientFetch = createResilient(
 *   (url: string) => fetch(url),
 *   {
 *     timeout: { timeoutMs: 5000 },
 *     retry: { maxAttempts: 3 },
 *     circuitBreaker: { failureThreshold: 5 }
 *   }
 * )
 *
 * const result = await resilientFetch('https://api.example.com')
 * ```
 */
export function createResilient<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  config: ResilienceConfig
): {
  (...args: TArgs): Promise<TResult>
  breaker?: CircuitBreaker
} {
  // Create circuit breaker if configured
  const breaker = config.circuitBreaker
    ? config.circuitBreaker instanceof CircuitBreaker
      ? config.circuitBreaker
      : new CircuitBreaker(config.circuitBreaker)
    : undefined

  const wrapped = (...args: TArgs): Promise<TResult> => {
    return withResilience(() => fn(...args), {
      ...config,
      circuitBreaker: breaker,
    })
  }

  if (breaker) {
    wrapped.breaker = breaker
  }

  return wrapped
}

/**
 * Execute an operation with timeout and automatic cancellation
 *
 * This is a convenience function that creates an abort controller,
 * sets up timeout, and cleans up properly.
 *
 * @param fn - Function that receives an abort signal
 * @param timeoutMs - Timeout in milliseconds
 * @param serviceName - Service name for error messages
 * @returns The result of the function
 */
export async function executeWithAbortableTimeout<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  serviceName: string = 'unknown'
): Promise<T> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fn(controller.signal)
  } catch (error) {
    if (controller.signal.aborted) {
      throw new ServiceTimeoutError(serviceName, timeoutMs)
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}
