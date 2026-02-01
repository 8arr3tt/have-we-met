/**
 * Retry utility for wrapping async operations with retry logic
 * @module services/resilience/retry
 */

import type { RetryConfig } from '../types.js'
import { ServiceError, isRetryableError } from '../service-error.js'

/**
 * Extended retry configuration with additional options
 */
export interface ExtendedRetryConfig extends RetryConfig {
  /** Custom function to determine if an error should be retried */
  shouldRetry?: (error: Error, attempt: number) => boolean

  /** Callback called before each retry attempt */
  onRetry?: (error: Error, attempt: number, delayMs: number) => void

  /** Abort signal for cancellation */
  signal?: AbortSignal
}

/**
 * Result from a retried operation
 */
export interface RetryResult<T> {
  /** The result value */
  result: T

  /** Number of attempts made (1 = success on first try) */
  attempts: number

  /** Total duration including retries in milliseconds */
  totalDurationMs: number

  /** Details of each attempt */
  attemptDetails: AttemptDetail[]
}

/**
 * Details of a single attempt
 */
export interface AttemptDetail {
  /** Attempt number (1-based) */
  attempt: number

  /** Duration of this attempt in milliseconds */
  durationMs: number

  /** Whether this attempt succeeded */
  success: boolean

  /** Error if the attempt failed */
  error?: Error

  /** Delay before the next attempt (0 for last attempt) */
  delayBeforeNextMs: number
}

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelayMs: 100,
  backoffMultiplier: 2,
  maxDelayMs: 5000,
  retryOn: ['timeout', 'network', 'server'],
}

/**
 * Sleep utility with abort signal support
 */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('Sleep aborted'))
      return
    }

    const timeoutId = setTimeout(resolve, ms)

    if (signal && 'addEventListener' in signal) {
      const abortHandler = () => {
        clearTimeout(timeoutId)
        reject(new Error('Sleep aborted'))
      }
      ;(signal as unknown as EventTarget).addEventListener('abort', abortHandler, { once: true })
    }
  })
}

/**
 * Calculate delay with exponential backoff and jitter
 *
 * @param attempt - Current attempt number (1-based)
 * @param config - Retry configuration
 * @returns Delay in milliseconds
 */
export function calculateRetryDelay(attempt: number, config: RetryConfig): number {
  // Calculate base delay with exponential backoff
  let delay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt - 1)

  // Cap at maximum delay
  delay = Math.min(delay, config.maxDelayMs)

  // Add jitter (±20%)
  const jitter = delay * 0.2 * (Math.random() * 2 - 1)
  return Math.max(0, Math.round(delay + jitter))
}

/**
 * Determine if an error should be retried based on configuration
 *
 * @param error - The error to check
 * @param config - Retry configuration
 * @returns Whether the error should be retried
 */
export function shouldRetryError(error: Error, config: RetryConfig): boolean {
  // Always check if error explicitly says it's not retryable
  if ((error as ServiceError).retryable === false) {
    return false
  }

  const retryOn = config.retryOn ?? ['timeout', 'network', 'server']

  // 'all' means retry all errors
  if (retryOn.includes('all')) {
    return true
  }

  // Check error type
  const errorType = (error as ServiceError).type as string | undefined

  if (errorType === 'timeout' && retryOn.includes('timeout')) {
    return true
  }
  if (errorType === 'network' && retryOn.includes('network')) {
    return true
  }
  // 'unknown' type maps to 'server' category (likely server errors)
  if (errorType === 'unknown' && retryOn.includes('server')) {
    return true
  }

  // Check retryable flag
  if (isRetryableError(error)) {
    return true
  }

  return false
}

/**
 * Wraps an async function with retry logic
 *
 * @param fn - The async function to retry
 * @param config - Retry configuration
 * @returns The result of the function
 * @throws The last error if all retries fail
 *
 * @example
 * ```typescript
 * const result = await withRetry(
 *   () => fetch('https://api.example.com/data'),
 *   { maxAttempts: 3, initialDelayMs: 100, backoffMultiplier: 2, maxDelayMs: 5000 }
 * )
 * ```
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: ExtendedRetryConfig,
): Promise<T> {
  let lastError: Error | undefined
  let delay = config.initialDelayMs

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    // Check for abort
    if (config.signal?.aborted) {
      throw new Error('Retry operation aborted')
    }

    try {
      return await fn()
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))

      // Check if this is the last attempt
      if (attempt === config.maxAttempts) {
        break
      }

      // Determine if we should retry
      const shouldRetry = config.shouldRetry
        ? config.shouldRetry(lastError, attempt)
        : shouldRetryError(lastError, config)

      if (!shouldRetry) {
        break
      }

      // Calculate delay with jitter
      delay = calculateRetryDelay(attempt, config)

      // Call onRetry callback if provided
      config.onRetry?.(lastError, attempt, delay)

      // Wait before retrying
      try {
        await sleep(delay, config.signal)
      } catch {
        // Sleep was aborted
        throw new Error('Retry operation aborted')
      }
    }
  }

  throw lastError!
}

/**
 * Wraps an async function with retry logic and returns detailed result
 *
 * @param fn - The async function to retry
 * @param config - Retry configuration
 * @returns The result with retry details
 * @throws The last error if all retries fail
 *
 * @example
 * ```typescript
 * const { result, attempts, totalDurationMs } = await withRetryDetailed(
 *   () => fetch('https://api.example.com/data'),
 *   { maxAttempts: 3, initialDelayMs: 100, backoffMultiplier: 2, maxDelayMs: 5000 }
 * )
 * console.log(`Succeeded after ${attempts} attempts in ${totalDurationMs}ms`)
 * ```
 */
export async function withRetryDetailed<T>(
  fn: () => Promise<T>,
  config: ExtendedRetryConfig,
): Promise<RetryResult<T>> {
  const startTime = Date.now()
  const attemptDetails: AttemptDetail[] = []
  let lastError: Error | undefined

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    // Check for abort
    if (config.signal?.aborted) {
      throw new Error('Retry operation aborted')
    }

    const attemptStart = Date.now()

    try {
      const result = await fn()
      const durationMs = Date.now() - attemptStart

      attemptDetails.push({
        attempt,
        durationMs,
        success: true,
        delayBeforeNextMs: 0,
      })

      return {
        result,
        attempts: attempt,
        totalDurationMs: Date.now() - startTime,
        attemptDetails,
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      const durationMs = Date.now() - attemptStart

      // Check if this is the last attempt
      const isLastAttempt = attempt === config.maxAttempts

      // Determine if we should retry
      const shouldRetry = !isLastAttempt && (
        config.shouldRetry
          ? config.shouldRetry(lastError, attempt)
          : shouldRetryError(lastError, config)
      )

      // Calculate delay
      const delayBeforeNextMs = shouldRetry ? calculateRetryDelay(attempt, config) : 0

      attemptDetails.push({
        attempt,
        durationMs,
        success: false,
        error: lastError,
        delayBeforeNextMs,
      })

      if (!shouldRetry) {
        break
      }

      // Call onRetry callback if provided
      config.onRetry?.(lastError, attempt, delayBeforeNextMs)

      // Wait before retrying
      try {
        await sleep(delayBeforeNextMs, config.signal)
      } catch {
        // Sleep was aborted
        throw new Error('Retry operation aborted')
      }
    }
  }

  throw Object.assign(lastError!, {
    attempts: attemptDetails.length,
    totalDurationMs: Date.now() - startTime,
    attemptDetails,
  })
}

/**
 * Creates a retryable function wrapper
 *
 * @param fn - The async function to wrap
 * @param config - Retry configuration
 * @returns A function that executes with retry
 *
 * @example
 * ```typescript
 * const retryableFetch = createRetryable(
 *   (url: string) => fetch(url),
 *   { maxAttempts: 3 }
 * )
 * const result = await retryableFetch('https://api.example.com/data')
 * ```
 */
export function createRetryable<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  config: ExtendedRetryConfig,
): (...args: TArgs) => Promise<TResult> {
  return (...args: TArgs) => withRetry(() => fn(...args), config)
}

/**
 * Retry state tracker for manual retry management
 */
export class RetryTracker {
  private config: RetryConfig
  private attempts = 0
  private errors: Error[] = []
  private startTime?: number

  constructor(config: RetryConfig) {
    this.config = config
  }

  /** Number of attempts made */
  get attemptCount(): number {
    return this.attempts
  }

  /** Whether more retries are available */
  get canRetry(): boolean {
    return this.attempts < this.config.maxAttempts
  }

  /** Errors from all attempts */
  get allErrors(): Error[] {
    return [...this.errors]
  }

  /** Last error that occurred */
  get lastError(): Error | undefined {
    return this.errors[this.errors.length - 1]
  }

  /** Total elapsed time in milliseconds */
  get elapsedMs(): number {
    return this.startTime ? Date.now() - this.startTime : 0
  }

  /**
   * Record an attempt (call before executing the operation)
   */
  recordAttempt(): number {
    if (this.startTime === undefined) {
      this.startTime = Date.now()
    }
    return ++this.attempts
  }

  /**
   * Record a failure and get the delay before next retry
   *
   * @param error - The error that occurred
   * @returns Delay in milliseconds, or 0 if no more retries
   */
  recordFailure(error: Error): number {
    this.errors.push(error)

    if (!this.canRetry) {
      return 0
    }

    if (!shouldRetryError(error, this.config)) {
      return 0
    }

    return calculateRetryDelay(this.attempts, this.config)
  }

  /**
   * Reset the tracker state
   */
  reset(): void {
    this.attempts = 0
    this.errors = []
    this.startTime = undefined
  }
}
