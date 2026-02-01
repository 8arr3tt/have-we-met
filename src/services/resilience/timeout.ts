/**
 * Timeout utility for wrapping async operations with a timeout
 * @module services/resilience/timeout
 */

import { ServiceTimeoutError } from '../service-error.js'

/** Timer ID type for cross-environment compatibility */
type TimerId = ReturnType<typeof setTimeout>

/**
 * Options for the timeout wrapper
 */
export interface TimeoutOptions {
  /** Timeout duration in milliseconds */
  timeoutMs: number

  /** Service name for error messages */
  serviceName?: string

  /** Abort signal for external cancellation */
  signal?: AbortSignal
}

/**
 * Result from a timed operation
 */
export interface TimedResult<T> {
  /** The result value */
  result: T

  /** Duration in milliseconds */
  durationMs: number

  /** Whether the operation was aborted */
  aborted: boolean
}

/**
 * Wraps a promise with a timeout
 *
 * @param promise - The promise to wrap
 * @param options - Timeout options
 * @returns The result of the promise
 * @throws ServiceTimeoutError if the timeout is exceeded
 *
 * @example
 * ```typescript
 * const result = await withTimeout(
 *   fetch('https://api.example.com/data'),
 *   { timeoutMs: 5000, serviceName: 'example-api' }
 * )
 * ```
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  options: TimeoutOptions,
): Promise<T> {
  const { timeoutMs, serviceName = 'unknown', signal } = options

  if (timeoutMs <= 0) {
    throw new Error('Timeout must be a positive number')
  }

  // Check if already aborted
  if (signal?.aborted) {
    throw new ServiceTimeoutError(serviceName, 0, { reason: 'Operation was aborted before starting' })
  }

  return new Promise<T>((resolve, reject) => {
    let settled = false
    const timeoutIdHolder: { id: TimerId | undefined } = { id: undefined }

    const cleanup = () => {
      if (timeoutIdHolder.id !== undefined) {
        clearTimeout(timeoutIdHolder.id)
      }
      if (signal && 'removeEventListener' in signal) {
        (signal as unknown as EventTarget).removeEventListener('abort', onAbort)
      }
    }

    const onAbort = () => {
      if (settled) return
      settled = true
      cleanup()
      reject(new ServiceTimeoutError(serviceName, timeoutMs, { reason: 'Operation was aborted' }))
    }

    const onTimeout = () => {
      if (settled) return
      settled = true
      cleanup()
      reject(new ServiceTimeoutError(serviceName, timeoutMs))
    }

    const onResolve = (value: T) => {
      if (settled) return
      settled = true
      cleanup()
      resolve(value)
    }

    const onReject = (error: unknown) => {
      if (settled) return
      settled = true
      cleanup()
      reject(error)
    }

    // Set up timeout
    timeoutIdHolder.id = setTimeout(onTimeout, timeoutMs)

    // Set up abort listener
    if (signal && 'addEventListener' in signal) {
      (signal as unknown as EventTarget).addEventListener('abort', onAbort)
    }

    // Handle promise resolution/rejection
    promise.then(onResolve, onReject)
  })
}

/**
 * Wraps an async function with a timeout
 *
 * @param fn - The async function to wrap
 * @param options - Timeout options
 * @returns A function that executes with timeout
 *
 * @example
 * ```typescript
 * const timedFetch = withTimeoutFn(
 *   () => fetch('https://api.example.com/data'),
 *   { timeoutMs: 5000, serviceName: 'example-api' }
 * )
 * const result = await timedFetch()
 * ```
 */
export function withTimeoutFn<T>(
  fn: () => Promise<T>,
  options: TimeoutOptions,
): () => Promise<T> {
  return () => withTimeout(fn(), options)
}

/**
 * Wraps a promise with a timeout and returns timing information
 *
 * @param promise - The promise to wrap
 * @param options - Timeout options
 * @returns The result with timing information
 *
 * @example
 * ```typescript
 * const { result, durationMs } = await withTimeoutTimed(
 *   fetch('https://api.example.com/data'),
 *   { timeoutMs: 5000 }
 * )
 * console.log(`Request took ${durationMs}ms`)
 * ```
 */
export async function withTimeoutTimed<T>(
  promise: Promise<T>,
  options: TimeoutOptions,
): Promise<TimedResult<T>> {
  const startTime = Date.now()

  try {
    const result = await withTimeout(promise, options)
    return {
      result,
      durationMs: Date.now() - startTime,
      aborted: false,
    }
  } catch (error) {
    if (error instanceof ServiceTimeoutError && error.context?.reason === 'Operation was aborted') {
      throw Object.assign(error, { durationMs: Date.now() - startTime })
    }
    throw error
  }
}

/**
 * Creates a timeout controller for manual timeout management
 *
 * @param timeoutMs - Timeout duration in milliseconds
 * @param serviceName - Service name for error messages
 * @returns A timeout controller with start/cancel methods
 *
 * @example
 * ```typescript
 * const controller = createTimeoutController(5000, 'my-service')
 * controller.start()
 * // ... do work
 * if (success) {
 *   controller.cancel()
 * }
 * ```
 */
export function createTimeoutController(
  timeoutMs: number,
  serviceName: string = 'unknown',
): TimeoutController {
  return new TimeoutController(timeoutMs, serviceName)
}

/**
 * Controller for managing timeouts with manual control
 */
export class TimeoutController {
  private timeoutMs: number
  private serviceName: string
  private timeoutId?: TimerId
  private startTime?: number
  private _isExpired = false
  private _isCancelled = false
  private _onTimeout?: () => void

  constructor(timeoutMs: number, serviceName: string) {
    this.timeoutMs = timeoutMs
    this.serviceName = serviceName
  }

  /** Whether the timeout has expired */
  get isExpired(): boolean {
    return this._isExpired
  }

  /** Whether the timeout was cancelled */
  get isCancelled(): boolean {
    return this._isCancelled
  }

  /** Time remaining in milliseconds */
  get remainingMs(): number {
    if (this._isExpired || this._isCancelled || this.startTime === undefined) {
      return 0
    }
    const elapsed = Date.now() - this.startTime
    return Math.max(0, this.timeoutMs - elapsed)
  }

  /** Elapsed time in milliseconds */
  get elapsedMs(): number {
    if (this.startTime === undefined) {
      return 0
    }
    return Date.now() - this.startTime
  }

  /**
   * Set a callback to be called when the timeout expires
   */
  onTimeout(callback: () => void): this {
    this._onTimeout = callback
    return this
  }

  /**
   * Start the timeout
   */
  start(): this {
    if (this.timeoutId !== undefined) {
      return this
    }

    this.startTime = Date.now()
    this.timeoutId = setTimeout(() => {
      this._isExpired = true
      this._onTimeout?.()
    }, this.timeoutMs)

    return this
  }

  /**
   * Cancel the timeout
   */
  cancel(): this {
    if (this.timeoutId !== undefined) {
      clearTimeout(this.timeoutId)
      this.timeoutId = undefined
      this._isCancelled = true
    }
    return this
  }

  /**
   * Reset the timeout
   */
  reset(): this {
    this.cancel()
    this._isExpired = false
    this._isCancelled = false
    return this.start()
  }

  /**
   * Throw if the timeout has expired
   */
  throwIfExpired(): void {
    if (this._isExpired) {
      throw new ServiceTimeoutError(this.serviceName, this.timeoutMs)
    }
  }
}
