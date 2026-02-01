/**
 * Service executor for orchestrating external service calls
 * @module services/service-executor
 */

import type {
  ServiceConfig,
  ServiceResult,
  ServiceExecutionResult,
  ServiceContext,
  ValidationInput,
  ValidationOutput,
  LookupInput,
  LookupOutput,
  CustomInput,
  CustomOutput,
  HealthCheckResult,
  CircuitBreakerStatus,
  CircuitBreakerConfig,
  ServiceDefaults,
  ExecutionPoint,
  ServiceTiming,
  ServiceErrorInfo,
} from './types.js'
import type { ResolverConfig } from '../types/config.js'
import type { MatchResult } from '../types/match.js'
import {
  ServiceNotRegisteredError,
  ServiceAlreadyRegisteredError,
  ServiceTimeoutError,
  ServiceUnavailableError,
  toServiceError,
} from './service-error.js'
import { validateServiceConfig } from './validation.js'
import {
  buildServiceContext,
  generateCorrelationId,
  createPrefixedLogger,
  type ExecutionContextOptions,
} from './execution-context.js'
import {
  DEFAULT_SERVICE_CONFIG,
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
} from './types.js'

/**
 * Internal state for tracking a registered service
 */
interface RegisteredService {
  config: ServiceConfig
  circuitBreaker: CircuitBreakerState
}

/**
 * Circuit breaker state tracking
 */
interface CircuitBreakerState {
  state: 'closed' | 'open' | 'half-open'
  failureCount: number
  successCount: number
  lastStateChange: Date
  lastFailureTime?: Date
  failures: Date[]
}

/**
 * Options for creating a service executor
 */
export interface ServiceExecutorOptions {
  resolverConfig: ResolverConfig
  defaults?: ServiceDefaults
  cachingEnabled?: boolean
  executionOrder?: string[]
  parallelExecution?: boolean
}

/**
 * Creates the default health check result for a healthy service
 */
function createHealthyResult(): HealthCheckResult {
  return {
    healthy: true,
    checkedAt: new Date(),
  }
}

/**
 * Creates a failed service result
 */
function createFailedResult(
  error: Error,
  timing: ServiceTiming,
  retryAttempts: number = 0,
): ServiceResult {
  const serviceError = error as { code?: string; type?: string; retryable?: boolean; context?: Record<string, unknown> }
  return {
    success: false,
    error: {
      code: serviceError.code ?? 'SERVICE_ERROR',
      message: error.message,
      type: (serviceError.type as ServiceErrorInfo['type']) ?? 'unknown',
      retryable: serviceError.retryable ?? false,
      cause: error,
      context: serviceError.context,
    },
    timing,
    cached: false,
    retryAttempts,
  }
}


/** Reference to setTimeout for environment compatibility */
const setTimeoutFn = (typeof setTimeout !== 'undefined' ? setTimeout : (fn: () => void, _ms: number) => { fn(); return 0 }) as (fn: () => void, ms: number) => ReturnType<typeof setTimeout>

/** Reference to clearTimeout for environment compatibility */
const clearTimeoutFn = (typeof clearTimeout !== 'undefined' ? clearTimeout : (_id: unknown) => {}) as (id: ReturnType<typeof setTimeout>) => void

/**
 * Sleep utility for delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeoutFn(resolve, ms))
}

/**
 * ServiceExecutorImpl orchestrates external service calls
 */
export class ServiceExecutorImpl {
  private services: Map<RegisteredService['config']['plugin']['name'], RegisteredService> = new Map()
  private resolverConfig: ResolverConfig
  private defaults: ServiceDefaults
  // Note: cachingEnabled will be used in Ticket 9.4 for service caching
  private _cachingEnabled: boolean
  private executionOrder?: string[]
  private parallelExecution: boolean

  constructor(options: ServiceExecutorOptions) {
    this.resolverConfig = options.resolverConfig
    this.defaults = options.defaults ?? {}
    this._cachingEnabled = options.cachingEnabled ?? true
    this.executionOrder = options.executionOrder
    this.parallelExecution = options.parallelExecution ?? false
  }

  /** Whether caching is enabled (used by cache layer in Ticket 9.4) */
  get cachingEnabled(): boolean {
    return this._cachingEnabled
  }

  /**
   * Register a service with the executor
   */
  register(config: ServiceConfig): void {
    validateServiceConfig(config)

    const name = config.plugin.name
    if (this.services.has(name)) {
      throw new ServiceAlreadyRegisteredError(name)
    }

    const mergedConfig = this.mergeWithDefaults(config)
    const circuitBreakerConfig = this.defaults.circuitBreaker ?? DEFAULT_CIRCUIT_BREAKER_CONFIG

    this.services.set(name, {
      config: mergedConfig,
      circuitBreaker: this.createCircuitBreakerState(circuitBreakerConfig),
    })
  }

  /**
   * Unregister a service by name
   */
  unregister(name: string): boolean {
    return this.services.delete(name)
  }

  /**
   * Execute all pre-match services
   */
  async executePreMatch(record: Record<string, unknown>): Promise<ServiceExecutionResult> {
    return this.executeServices(record, 'pre-match')
  }

  /**
   * Execute all post-match services
   */
  async executePostMatch(
    record: Record<string, unknown>,
    matchResult: MatchResult,
  ): Promise<ServiceExecutionResult> {
    return this.executeServices(record, 'post-match', matchResult)
  }

  /**
   * Execute a specific service by name
   */
  async executeService(name: string, input: unknown): Promise<ServiceResult> {
    const registered = this.services.get(name)
    if (!registered) {
      throw new ServiceNotRegisteredError(name, this.getServiceNames())
    }

    const context = buildServiceContext({
      record: input as Record<string, unknown>,
      config: this.resolverConfig,
    })

    return this.executeSingleService(registered, input, context)
  }

  /**
   * Get health status for all registered services
   */
  async getHealthStatus(): Promise<Record<string, HealthCheckResult>> {
    const results: Record<string, HealthCheckResult> = {}

    for (const [name, registered] of this.services) {
      const plugin = registered.config.plugin

      if (registered.circuitBreaker.state === 'open') {
        results[name] = {
          healthy: false,
          reason: 'Circuit breaker is open',
          checkedAt: new Date(),
          details: { circuitState: 'open' },
        }
        continue
      }

      if (plugin.healthCheck) {
        const startTime = Date.now()
        try {
          const result = await plugin.healthCheck()
          results[name] = {
            ...result,
            responseTimeMs: Date.now() - startTime,
          }
        } catch (error) {
          results[name] = {
            healthy: false,
            reason: error instanceof Error ? error.message : String(error),
            checkedAt: new Date(),
            responseTimeMs: Date.now() - startTime,
          }
        }
      } else {
        results[name] = createHealthyResult()
      }
    }

    return results
  }

  /**
   * Get circuit breaker status for all services
   */
  getCircuitStatus(): Record<string, CircuitBreakerStatus> {
    const results: Record<string, CircuitBreakerStatus> = {}

    for (const [name, registered] of this.services) {
      const cb = registered.circuitBreaker
      results[name] = {
        state: cb.state,
        failureCount: cb.failureCount,
        successCount: cb.successCount,
        lastStateChange: cb.lastStateChange,
        lastFailureTime: cb.lastFailureTime,
      }
    }

    return results
  }

  /**
   * Dispose all services and cleanup resources
   */
  async dispose(): Promise<void> {
    const disposePromises: Promise<void>[] = []

    for (const [, registered] of this.services) {
      if (registered.config.plugin.dispose) {
        disposePromises.push(registered.config.plugin.dispose())
      }
    }

    await Promise.all(disposePromises)
    this.services.clear()
  }

  /**
   * Get names of all registered services
   */
  getServiceNames(): string[] {
    return Array.from(this.services.keys())
  }

  /**
   * Execute services for a given execution point
   */
  private async executeServices(
    record: Record<string, unknown>,
    executionPoint: ExecutionPoint,
    matchResult?: MatchResult,
  ): Promise<ServiceExecutionResult> {
    const startTime = Date.now()
    const services = this.getServicesForExecutionPoint(executionPoint)

    if (services.length === 0) {
      return {
        results: {},
        proceed: true,
        totalDurationMs: 0,
      }
    }

    const results: Record<string, ServiceResult> = {}
    let proceed = true
    let rejectionReason: string | undefined
    let rejectedBy: string | undefined
    let enrichedData: Record<string, unknown> = { ...record }
    const scoreAdjustments: number[] = []
    const flags: string[] = []

    const contextOptions: ExecutionContextOptions = {
      record: enrichedData,
      config: this.resolverConfig,
      correlationId: generateCorrelationId(),
      matchResult,
    }

    if (this.parallelExecution) {
      const executeResults = await Promise.all(
        services.map(async registered => {
          const context = buildServiceContext({
            ...contextOptions,
            record: enrichedData,
          })
          const input = this.buildServiceInput(registered.config, enrichedData)
          return {
            name: registered.config.plugin.name,
            registered,
            result: await this.executeSingleService(registered, input, context),
          }
        }),
      )

      for (const { name, registered, result } of executeResults) {
        results[name] = result
        const outcome = this.handleServiceResult(
          result,
          registered.config,
          enrichedData,
          flags,
          scoreAdjustments,
        )

        if (!outcome.proceed && registered.config.required) {
          proceed = false
          rejectionReason = outcome.rejectionReason
          rejectedBy = name
          break
        }

        if (outcome.enrichedData) {
          enrichedData = outcome.enrichedData
        }
      }
    } else {
      for (const registered of services) {
        const name = registered.config.plugin.name
        const context = buildServiceContext({
          ...contextOptions,
          record: enrichedData,
        })
        const input = this.buildServiceInput(registered.config, enrichedData)

        try {
          const result = await this.executeSingleService(registered, input, context)
          results[name] = result

          const outcome = this.handleServiceResult(
            result,
            registered.config,
            enrichedData,
            flags,
            scoreAdjustments,
          )

          if (!outcome.proceed && registered.config.required) {
            proceed = false
            rejectionReason = outcome.rejectionReason
            rejectedBy = name
            break
          }

          if (outcome.enrichedData) {
            enrichedData = outcome.enrichedData
          }
        } catch (error) {
          const timing = this.createTiming(startTime)
          results[name] = createFailedResult(
            error instanceof Error ? error : new Error(String(error)),
            timing,
          )

          if (registered.config.onFailure === 'reject' && registered.config.required) {
            proceed = false
            rejectionReason = error instanceof Error ? error.message : String(error)
            rejectedBy = name
            break
          }

          if (registered.config.onFailure === 'flag') {
            flags.push(`${name}:failed`)
          }
        }
      }
    }

    return {
      results,
      proceed,
      rejectionReason,
      rejectedBy,
      enrichedData,
      scoreAdjustments: scoreAdjustments.length > 0 ? scoreAdjustments : undefined,
      flags: flags.length > 0 ? flags : undefined,
      totalDurationMs: Date.now() - startTime,
    }
  }

  /**
   * Execute a single service with all resilience patterns
   */
  private async executeSingleService(
    registered: RegisteredService,
    input: unknown,
    context: ServiceContext,
  ): Promise<ServiceResult> {
    const { config, circuitBreaker } = registered
    const plugin = config.plugin
    const timeout = config.timeout ?? this.defaults.timeout ?? DEFAULT_SERVICE_CONFIG.timeout!
    const startTime = Date.now()

    // Check circuit breaker
    if (!this.checkCircuitBreaker(circuitBreaker, this.defaults.circuitBreaker ?? DEFAULT_CIRCUIT_BREAKER_CONFIG)) {
      const cbConfig = this.defaults.circuitBreaker ?? DEFAULT_CIRCUIT_BREAKER_CONFIG
      const resetAt = new Date(circuitBreaker.lastStateChange.getTime() + cbConfig.resetTimeoutMs)
      throw new ServiceUnavailableError(plugin.name, 'open', resetAt)
    }

    // Add prefixed logger to context
    if (context.logger) {
      context = {
        ...context,
        logger: createPrefixedLogger(plugin.name, context.logger),
      }
    }

    let lastError: Error | undefined
    let finalAttempt = 1

    const retryConfig = config.retry
    const maxAttempts = retryConfig?.maxAttempts ?? 1

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      finalAttempt = attempt
      try {
        const result = await this.executeWithTimeout(
          () => plugin.execute(input, context),
          timeout,
          plugin.name,
        )

        this.recordSuccess(circuitBreaker, this.defaults.circuitBreaker ?? DEFAULT_CIRCUIT_BREAKER_CONFIG)

        return {
          ...result,
          timing: this.createTiming(startTime),
          retryAttempts: attempt,
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))

        if (attempt === maxAttempts) {
          break
        }

        const serviceError = toServiceError(lastError, plugin.name)
        if (!this.shouldRetry(serviceError, retryConfig)) {
          break
        }

        const delay = this.calculateRetryDelay(attempt, retryConfig!)
        await sleep(delay)
      }
    }

    this.recordFailure(circuitBreaker, this.defaults.circuitBreaker ?? DEFAULT_CIRCUIT_BREAKER_CONFIG)

    return createFailedResult(lastError!, this.createTiming(startTime), finalAttempt)
  }

  /**
   * Execute a function with a timeout
   * Uses globalThis for environment-agnostic timer access
   */
  private async executeWithTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number,
    serviceName: string,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timeoutId = globalThis.setTimeout(() => {
        reject(new ServiceTimeoutError(serviceName, timeoutMs))
      }, timeoutMs)

      fn()
        .then(result => {
          globalThis.clearTimeout(timeoutId)
          resolve(result)
        })
        .catch(error => {
          globalThis.clearTimeout(timeoutId)
          reject(error)
        })
    })
  }

  /**
   * Build the appropriate input for a service based on its type
   */
  private buildServiceInput(
    config: ServiceConfig,
    record: Record<string, unknown>,
  ): unknown {
    const plugin = config.plugin

    switch (plugin.type) {
      case 'validation': {
        const field = config.fields?.[0] ?? ''
        const input: ValidationInput = {
          field,
          value: record[field],
          context: { record },
        }
        return input
      }

      case 'lookup': {
        const keyFields: Record<string, unknown> = {}
        for (const field of config.fields ?? []) {
          keyFields[field] = record[field]
        }
        const input: LookupInput = {
          keyFields,
          requestedFields: config.fieldMapping ? Object.keys(config.fieldMapping) : undefined,
        }
        return input
      }

      case 'custom': {
        const input: CustomInput = {
          record,
          params: config.customParams,
        }
        return input
      }

      default:
        return record
    }
  }

  /**
   * Handle the result from a service execution
   */
  private handleServiceResult(
    result: ServiceResult,
    config: ServiceConfig,
    currentData: Record<string, unknown>,
    flags: string[],
    scoreAdjustments: number[],
  ): {
    proceed: boolean
    rejectionReason?: string
    enrichedData?: Record<string, unknown>
  } {
    const plugin = config.plugin
    const name = plugin.name

    if (!result.success) {
      if (config.onFailure === 'reject') {
        return {
          proceed: false,
          rejectionReason: result.error?.message ?? 'Service failed',
        }
      }
      if (config.onFailure === 'flag') {
        flags.push(`${name}:failed`)
      }
      return { proceed: true }
    }

    switch (plugin.type) {
      case 'validation': {
        const output = result.data as ValidationOutput
        if (!output.valid) {
          if (config.onInvalid === 'reject') {
            return {
              proceed: false,
              rejectionReason: output.invalidReason ?? 'Validation failed',
            }
          }
          if (config.onInvalid === 'flag') {
            flags.push(`${name}:invalid`)
          }
        }
        return { proceed: true }
      }

      case 'lookup': {
        const output = result.data as LookupOutput
        if (!output.found) {
          if (config.onNotFound === 'flag') {
            flags.push(`${name}:not-found`)
          }
          return { proceed: true }
        }

        if (output.data && config.fieldMapping) {
          const enrichedData = { ...currentData }
          for (const [externalField, schemaField] of Object.entries(config.fieldMapping)) {
            if (externalField in output.data) {
              enrichedData[schemaField] = output.data[externalField]
            }
          }
          return { proceed: true, enrichedData }
        }
        return { proceed: true }
      }

      case 'custom': {
        const output = result.data as CustomOutput
        if (output.scoreAdjustment !== undefined) {
          scoreAdjustments.push(output.scoreAdjustment)
        }
        if (output.flags) {
          flags.push(...output.flags)
        }

        if (config.resultPredicate && !config.resultPredicate(output)) {
          return {
            proceed: false,
            rejectionReason: 'Custom service predicate returned false',
          }
        }

        if (!output.proceed) {
          return {
            proceed: false,
            rejectionReason: 'Custom service indicated not to proceed',
          }
        }

        return { proceed: true }
      }

      default:
        return { proceed: true }
    }
  }

  /**
   * Get services for a specific execution point, sorted by priority
   */
  private getServicesForExecutionPoint(executionPoint: ExecutionPoint): RegisteredService[] {
    const services: RegisteredService[] = []

    for (const [, registered] of this.services) {
      const servicePoint = registered.config.executionPoint
      if (servicePoint === executionPoint || servicePoint === 'both') {
        services.push(registered)
      }
    }

    // Sort by execution order if specified, otherwise by priority
    if (this.executionOrder) {
      const orderMap = new Map(this.executionOrder.map((name, index) => [name, index]))
      services.sort((a, b) => {
        const aOrder = orderMap.get(a.config.plugin.name) ?? Infinity
        const bOrder = orderMap.get(b.config.plugin.name) ?? Infinity
        return aOrder - bOrder
      })
    } else {
      services.sort((a, b) => {
        const aPriority = a.config.priority ?? DEFAULT_SERVICE_CONFIG.priority!
        const bPriority = b.config.priority ?? DEFAULT_SERVICE_CONFIG.priority!
        return aPriority - bPriority
      })
    }

    return services
  }

  /**
   * Merge service config with defaults
   */
  private mergeWithDefaults(config: ServiceConfig): ServiceConfig {
    return {
      ...config,
      timeout: config.timeout ?? this.defaults.timeout ?? DEFAULT_SERVICE_CONFIG.timeout,
      retry: config.retry ?? this.defaults.retry,
      cache: config.cache ?? this.defaults.cache,
      priority: config.priority ?? DEFAULT_SERVICE_CONFIG.priority,
      required: config.required ?? DEFAULT_SERVICE_CONFIG.required,
      onFailure: config.onFailure ?? DEFAULT_SERVICE_CONFIG.onFailure!,
    }
  }

  /**
   * Create a new circuit breaker state
   */
  private createCircuitBreakerState(_config: CircuitBreakerConfig): CircuitBreakerState {
    return {
      state: 'closed',
      failureCount: 0,
      successCount: 0,
      lastStateChange: new Date(),
      failures: [],
    }
  }

  /**
   * Check if circuit breaker allows execution
   */
  private checkCircuitBreaker(
    state: CircuitBreakerState,
    config: CircuitBreakerConfig,
  ): boolean {
    const now = Date.now()

    if (state.state === 'closed') {
      return true
    }

    if (state.state === 'open') {
      const timeSinceStateChange = now - state.lastStateChange.getTime()
      if (timeSinceStateChange >= config.resetTimeoutMs) {
        state.state = 'half-open'
        state.successCount = 0
        state.lastStateChange = new Date()
        return true
      }
      return false
    }

    // half-open - allow one request
    return true
  }

  /**
   * Record a successful service call
   */
  private recordSuccess(state: CircuitBreakerState, config: CircuitBreakerConfig): void {
    if (state.state === 'half-open') {
      state.successCount++
      if (state.successCount >= config.successThreshold) {
        state.state = 'closed'
        state.failureCount = 0
        state.failures = []
        state.lastStateChange = new Date()
      }
    } else if (state.state === 'closed') {
      // Successful calls can reset failure count in closed state
      state.failureCount = 0
      state.failures = []
    }
  }

  /**
   * Record a failed service call
   */
  private recordFailure(state: CircuitBreakerState, config: CircuitBreakerConfig): void {
    const now = new Date()
    state.lastFailureTime = now

    if (state.state === 'half-open') {
      state.state = 'open'
      state.lastStateChange = now
      return
    }

    // Clean up old failures outside the window
    const windowStart = now.getTime() - config.failureWindowMs
    state.failures = state.failures.filter(f => f.getTime() > windowStart)
    state.failures.push(now)
    state.failureCount = state.failures.length

    if (state.failureCount >= config.failureThreshold) {
      state.state = 'open'
      state.lastStateChange = now
    }
  }

  /**
   * Determine if an error should be retried
   */
  private shouldRetry(
    error: Error & { type?: string; retryable?: boolean },
    retryConfig?: ServiceConfig['retry'],
  ): boolean {
    if (!retryConfig) {
      return false
    }

    if (error.retryable === false) {
      return false
    }

    const retryOn = retryConfig.retryOn ?? ['timeout', 'network', 'server']
    if (retryOn.includes('all')) {
      return true
    }

    const errorType = error.type as string | undefined
    if (errorType === 'timeout' && retryOn.includes('timeout')) {
      return true
    }
    if (errorType === 'network' && retryOn.includes('network')) {
      return true
    }
    if (errorType === 'unknown' && retryOn.includes('server')) {
      return true
    }

    return error.retryable === true
  }

  /**
   * Calculate delay before next retry attempt
   */
  private calculateRetryDelay(attempt: number, config: ServiceConfig['retry']): number {
    if (!config) {
      return 0
    }

    let delay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt - 1)
    delay = Math.min(delay, config.maxDelayMs)

    // Add jitter (±20%)
    const jitter = delay * 0.2 * (Math.random() * 2 - 1)
    return Math.max(0, delay + jitter)
  }

  /**
   * Create timing information from a start time
   */
  private createTiming(startTime: number): ServiceTiming {
    const now = new Date()
    return {
      startedAt: new Date(startTime),
      completedAt: now,
      durationMs: now.getTime() - startTime,
    }
  }
}

/**
 * Factory function to create a ServiceExecutor
 */
export function createServiceExecutor(options: ServiceExecutorOptions): ServiceExecutorImpl {
  return new ServiceExecutorImpl(options)
}
