/**
 * Circuit breaker pattern implementation for fault tolerance
 * @module services/resilience/circuit-breaker
 */

import type {
  CircuitBreakerConfig,
  CircuitState,
  CircuitBreakerStatus,
} from '../types.js'
import { ServiceUnavailableError } from '../service-error.js'

/**
 * Default circuit breaker configuration
 */
export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  resetTimeoutMs: 30000,
  successThreshold: 2,
  failureWindowMs: 60000,
}

/**
 * Extended circuit breaker configuration with callbacks (all base config properties optional for input)
 */
export interface ExtendedCircuitBreakerConfig extends CircuitBreakerConfig {
  /** Callback when circuit state changes */
  onStateChange?: (
    from: CircuitState,
    to: CircuitState,
    breaker: CircuitBreaker
  ) => void

  /** Callback when a failure is recorded */
  onFailure?: (
    error: Error,
    failureCount: number,
    breaker: CircuitBreaker
  ) => void

  /** Callback when a success is recorded */
  onSuccess?: (successCount: number, breaker: CircuitBreaker) => void

  /** Custom function to determine if an error should count as a failure */
  isFailure?: (error: Error) => boolean

  /** Service name for error messages */
  serviceName?: string
}

/**
 * Failure record for tracking failures within a time window
 */
interface FailureRecord {
  timestamp: Date
  error: Error
}

/**
 * Circuit breaker implementation for protecting against cascading failures
 *
 * The circuit breaker has three states:
 * - closed: Normal operation, requests pass through
 * - open: Requests are immediately rejected
 * - half-open: A limited number of requests are allowed through to test recovery
 *
 * @example
 * ```typescript
 * const breaker = new CircuitBreaker({
 *   failureThreshold: 5,
 *   resetTimeoutMs: 30000,
 *   successThreshold: 2,
 *   failureWindowMs: 60000,
 *   serviceName: 'external-api'
 * })
 *
 * try {
 *   const result = await breaker.execute(() => fetchFromExternalApi())
 * } catch (error) {
 *   if (error instanceof ServiceUnavailableError) {
 *     // Circuit is open, use fallback
 *   }
 * }
 * ```
 */
/** Input config type with all base properties optional */
export type CircuitBreakerInput = Partial<ExtendedCircuitBreakerConfig>

export class CircuitBreaker {
  private config: ExtendedCircuitBreakerConfig
  private _state: CircuitState = 'closed'
  private failureRecords: FailureRecord[] = []
  private successCount = 0
  private _lastStateChange: Date = new Date()
  private _lastFailureTime?: Date

  constructor(config: CircuitBreakerInput = {}) {
    this.config = {
      ...DEFAULT_CIRCUIT_BREAKER_CONFIG,
      ...config,
    }
  }

  /** Current circuit state */
  get state(): CircuitState {
    // Check if we should transition from open to half-open
    if (this._state === 'open' && this.shouldAttemptReset()) {
      this.transitionTo('half-open')
    }
    return this._state
  }

  /** Number of failures in the current window */
  get failureCount(): number {
    this.cleanupOldFailures()
    return this.failureRecords.length
  }

  /** Number of consecutive successes in half-open state */
  get halfOpenSuccessCount(): number {
    return this.successCount
  }

  /** Timestamp of the last state change */
  get lastStateChange(): Date {
    return this._lastStateChange
  }

  /** Timestamp of the last failure */
  get lastFailureTime(): Date | undefined {
    return this._lastFailureTime
  }

  /** Whether the circuit is open */
  get isOpen(): boolean {
    return this.state === 'open'
  }

  /** Whether the circuit is closed */
  get isClosed(): boolean {
    return this.state === 'closed'
  }

  /** Whether the circuit is half-open */
  get isHalfOpen(): boolean {
    return this.state === 'half-open'
  }

  /** Service name */
  get serviceName(): string {
    return this.config.serviceName ?? 'unknown'
  }

  /**
   * Get the current status of the circuit breaker
   */
  getStatus(): CircuitBreakerStatus {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastStateChange: this._lastStateChange,
      lastFailureTime: this._lastFailureTime,
    }
  }

  /**
   * Check if the circuit allows execution
   *
   * @returns Whether a request can proceed
   */
  canExecute(): boolean {
    const state = this.state
    return state === 'closed' || state === 'half-open'
  }

  /**
   * Execute a function through the circuit breaker
   *
   * @param fn - The async function to execute
   * @returns The result of the function
   * @throws ServiceUnavailableError if the circuit is open
   *
   * @example
   * ```typescript
   * const result = await breaker.execute(async () => {
   *   return fetch('https://api.example.com/data')
   * })
   * ```
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if circuit allows execution
    if (!this.canExecute()) {
      const resetAt = new Date(
        this._lastStateChange.getTime() + this.config.resetTimeoutMs
      )
      throw new ServiceUnavailableError(this.serviceName, 'open', resetAt)
    }

    try {
      const result = await fn()
      this.recordSuccess()
      return result
    } catch (error) {
      this.recordFailure(
        error instanceof Error ? error : new Error(String(error))
      )
      throw error
    }
  }

  /**
   * Execute a function through the circuit breaker with a fallback
   *
   * @param fn - The async function to execute
   * @param fallback - Fallback function to call if circuit is open or execution fails
   * @returns The result from either the main function or fallback
   *
   * @example
   * ```typescript
   * const result = await breaker.executeWithFallback(
   *   () => fetchFromExternalApi(),
   *   () => getCachedData()
   * )
   * ```
   */
  async executeWithFallback<T>(
    fn: () => Promise<T>,
    fallback: (error?: Error) => Promise<T> | T
  ): Promise<T> {
    // Check if circuit allows execution
    if (!this.canExecute()) {
      const resetAt = new Date(
        this._lastStateChange.getTime() + this.config.resetTimeoutMs
      )
      const error = new ServiceUnavailableError(
        this.serviceName,
        'open',
        resetAt
      )
      return fallback(error)
    }

    try {
      const result = await fn()
      this.recordSuccess()
      return result
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      this.recordFailure(err)
      return fallback(err)
    }
  }

  /**
   * Record a successful execution
   */
  recordSuccess(): void {
    if (this._state === 'half-open') {
      this.successCount++
      this.config.onSuccess?.(this.successCount, this)

      if (this.successCount >= this.config.successThreshold) {
        this.transitionTo('closed')
      }
    } else if (this._state === 'closed') {
      // In closed state, success clears the failure records
      this.failureRecords = []
      this.config.onSuccess?.(0, this)
    }
  }

  /**
   * Record a failed execution
   *
   * @param error - The error that occurred
   */
  recordFailure(error: Error): void {
    // Check if this error should count as a failure
    if (this.config.isFailure && !this.config.isFailure(error)) {
      return
    }

    this._lastFailureTime = new Date()

    if (this._state === 'half-open') {
      // Any failure in half-open state opens the circuit
      this.config.onFailure?.(error, 1, this)
      this.transitionTo('open')
      return
    }

    if (this._state === 'closed') {
      // Clean up old failures first
      this.cleanupOldFailures()

      // Add new failure
      this.failureRecords.push({
        timestamp: new Date(),
        error,
      })

      this.config.onFailure?.(error, this.failureRecords.length, this)

      // Check if we've exceeded the threshold
      if (this.failureRecords.length >= this.config.failureThreshold) {
        this.transitionTo('open')
      }
    }
  }

  /**
   * Manually trip the circuit breaker (open it)
   */
  trip(): void {
    if (this._state !== 'open') {
      this.transitionTo('open')
    }
  }

  /**
   * Manually reset the circuit breaker (close it)
   */
  reset(): void {
    this.failureRecords = []
    this.successCount = 0
    this._lastFailureTime = undefined
    if (this._state !== 'closed') {
      this.transitionTo('closed')
    }
  }

  /**
   * Force transition to half-open state (for testing)
   */
  forceHalfOpen(): void {
    this.transitionTo('half-open')
  }

  /**
   * Check if the circuit should attempt to reset (transition to half-open)
   */
  private shouldAttemptReset(): boolean {
    if (this._state !== 'open') {
      return false
    }

    const timeSinceStateChange = Date.now() - this._lastStateChange.getTime()
    return timeSinceStateChange >= this.config.resetTimeoutMs
  }

  /**
   * Transition to a new state
   */
  private transitionTo(newState: CircuitState): void {
    const oldState = this._state
    if (oldState === newState) {
      return
    }

    this._state = newState
    this._lastStateChange = new Date()

    // Reset state-specific counters
    if (newState === 'closed') {
      this.failureRecords = []
      this.successCount = 0
    } else if (newState === 'half-open') {
      this.successCount = 0
    }

    this.config.onStateChange?.(oldState, newState, this)
  }

  /**
   * Remove failures outside the time window
   */
  private cleanupOldFailures(): void {
    const windowStart = Date.now() - this.config.failureWindowMs
    this.failureRecords = this.failureRecords.filter(
      (record) => record.timestamp.getTime() > windowStart
    )
  }
}

/**
 * Create a circuit breaker instance
 *
 * @param config - Circuit breaker configuration
 * @returns A new circuit breaker instance
 *
 * @example
 * ```typescript
 * const breaker = createCircuitBreaker({
 *   failureThreshold: 5,
 *   resetTimeoutMs: 30000,
 *   serviceName: 'external-api'
 * })
 * ```
 */
export function createCircuitBreaker(
  config: CircuitBreakerInput = {}
): CircuitBreaker {
  return new CircuitBreaker(config)
}

/**
 * Wrap a function with circuit breaker protection
 *
 * @param fn - The async function to protect
 * @param config - Circuit breaker configuration
 * @returns A protected function
 *
 * @example
 * ```typescript
 * const protectedFetch = withCircuitBreaker(
 *   (url: string) => fetch(url),
 *   { failureThreshold: 5, serviceName: 'api' }
 * )
 * const result = await protectedFetch('https://api.example.com')
 * ```
 */
export function withCircuitBreaker<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  config: CircuitBreakerInput = {}
): {
  (...args: TArgs): Promise<TResult>
  breaker: CircuitBreaker
} {
  const breaker = new CircuitBreaker(config)

  const wrapped = (...args: TArgs): Promise<TResult> => {
    return breaker.execute(() => fn(...args))
  }

  wrapped.breaker = breaker
  return wrapped
}

/**
 * Circuit breaker registry for managing multiple circuit breakers
 */
export class CircuitBreakerRegistry {
  private breakers = new Map<string, CircuitBreaker>()
  private defaultConfig: CircuitBreakerInput

  constructor(defaultConfig: CircuitBreakerInput = {}) {
    this.defaultConfig = defaultConfig
  }

  /**
   * Get or create a circuit breaker for a service
   *
   * @param name - Service name
   * @param config - Optional configuration override
   * @returns The circuit breaker
   */
  get(name: string, config?: CircuitBreakerInput): CircuitBreaker {
    let breaker = this.breakers.get(name)

    if (!breaker) {
      breaker = new CircuitBreaker({
        ...this.defaultConfig,
        ...config,
        serviceName: name,
      })
      this.breakers.set(name, breaker)
    }

    return breaker
  }

  /**
   * Check if a breaker exists for a service
   */
  has(name: string): boolean {
    return this.breakers.has(name)
  }

  /**
   * Remove a circuit breaker
   */
  remove(name: string): boolean {
    return this.breakers.delete(name)
  }

  /**
   * Get status of all circuit breakers
   */
  getAllStatus(): Record<string, CircuitBreakerStatus> {
    const status: Record<string, CircuitBreakerStatus> = {}
    for (const [name, breaker] of this.breakers) {
      status[name] = breaker.getStatus()
    }
    return status
  }

  /**
   * Reset all circuit breakers
   */
  resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.reset()
    }
  }

  /**
   * Get names of all open circuits
   */
  getOpenCircuits(): string[] {
    const open: string[] = []
    for (const [name, breaker] of this.breakers) {
      if (breaker.isOpen) {
        open.push(name)
      }
    }
    return open
  }

  /**
   * Get number of registered breakers
   */
  get size(): number {
    return this.breakers.size
  }

  /**
   * Clear all breakers
   */
  clear(): void {
    this.breakers.clear()
  }
}

/**
 * Create a circuit breaker registry
 *
 * @param defaultConfig - Default configuration for new breakers
 * @returns A new registry instance
 */
export function createCircuitBreakerRegistry(
  defaultConfig: CircuitBreakerInput = {}
): CircuitBreakerRegistry {
  return new CircuitBreakerRegistry(defaultConfig)
}
