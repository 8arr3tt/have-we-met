/**
 * Mock Lookup Service
 * Configurable mock service for testing and development
 * @module services/plugins/lookups/mock-lookup-service
 */

import type {
  LookupService,
  LookupInput,
  LookupOutput,
  LookupMatchQuality,
  ServiceResult,
  ServiceContext,
  HealthCheckResult,
} from '../../types.js'
import { ServiceNetworkError, ServiceServerError, ServiceTimeoutError } from '../../service-error.js'
import { stableHash } from '../../cache/cache-key-generator.js'

/**
 * Configuration for the mock lookup service
 */
export interface MockLookupConfig {
  /** Service name */
  name?: string

  /** Service description */
  description?: string

  /** Simulated latency in milliseconds */
  latencyMs?: number

  /** Simulated latency range (random between min and max) */
  latencyRange?: { min: number; max: number }

  /** Failure rate (0-1) - probability of simulated failure */
  failureRate?: number

  /** Specific error to throw on failure */
  failureError?: 'network' | 'timeout' | 'server'

  /** Canned responses keyed by input hash */
  responses?: Map<string, LookupOutput>

  /** Response function for dynamic responses */
  responseFn?: (input: LookupInput) => LookupOutput | Promise<LookupOutput>

  /** Default response if no match found */
  defaultResponse?: LookupOutput

  /** Default match quality */
  defaultMatchQuality?: LookupMatchQuality

  /** Whether to track call history */
  trackCalls?: boolean

  /** Maximum number of concurrent calls (for testing concurrency) */
  maxConcurrentCalls?: number

  /** Simulated rate limit (calls per minute) */
  rateLimitPerMinute?: number
}

/**
 * Call history entry
 */
export interface MockLookupCallEntry {
  /** Input that was provided */
  input: LookupInput

  /** Timestamp of the call */
  timestamp: Date

  /** Whether the call succeeded */
  success: boolean

  /** Response returned (if success) */
  response?: LookupOutput

  /** Error message (if failure) */
  error?: string

  /** Duration in milliseconds */
  durationMs: number
}

/**
 * Default mock configuration
 */
export const DEFAULT_MOCK_CONFIG: MockLookupConfig = {
  name: 'mock-lookup',
  description: 'Mock lookup service for testing',
  latencyMs: 10,
  failureRate: 0,
  trackCalls: true,
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Creates a successful service result
 */
function createSuccessResult(
  data: LookupOutput,
  startedAt: Date,
  cached: boolean = false,
): ServiceResult<LookupOutput> {
  const completedAt = new Date()
  return {
    success: true,
    data,
    timing: {
      startedAt,
      completedAt,
      durationMs: completedAt.getTime() - startedAt.getTime(),
    },
    cached,
  }
}

/**
 * Creates a failure service result
 */
function createFailureResult(
  error: Error,
  startedAt: Date,
  errorType: 'network' | 'timeout' | 'unknown' = 'network',
): ServiceResult<LookupOutput> {
  const completedAt = new Date()
  return {
    success: false,
    error: {
      code: error.name,
      message: error.message,
      type: errorType,
      retryable: errorType !== 'unknown',
    },
    timing: {
      startedAt,
      completedAt,
      durationMs: completedAt.getTime() - startedAt.getTime(),
    },
    cached: false,
  }
}

/**
 * Mock Lookup Service
 *
 * A configurable mock service for testing lookup service behavior.
 * Supports simulated latency, failures, canned responses, and call tracking.
 *
 * @example
 * ```typescript
 * // Create a mock with canned responses
 * const responses = new Map([
 *   ['user@example.com', { found: true, data: { name: 'Test User' } }],
 * ])
 *
 * const mock = createMockLookup({
 *   responses,
 *   latencyMs: 50,
 *   defaultResponse: { found: false }
 * })
 *
 * // Use in tests
 * const result = await mock.execute({ keyFields: { email: 'user@example.com' } }, context)
 * expect(result.data?.found).toBe(true)
 *
 * // Check call history
 * expect(mock.getCallHistory()).toHaveLength(1)
 * ```
 */
export interface MockLookupService extends LookupService {
  /** Get call history */
  getCallHistory(): MockLookupCallEntry[]

  /** Clear call history */
  clearCallHistory(): void

  /** Get number of calls */
  getCallCount(): number

  /** Get last call entry */
  getLastCall(): MockLookupCallEntry | undefined

  /** Reset all state */
  reset(): void

  /** Update configuration */
  updateConfig(config: Partial<MockLookupConfig>): void

  /** Add a canned response */
  addResponse(key: string | Record<string, unknown>, response: LookupOutput): void

  /** Remove a canned response */
  removeResponse(key: string | Record<string, unknown>): boolean

  /** Set failure rate */
  setFailureRate(rate: number): void

  /** Set latency */
  setLatency(ms: number): void
}

/**
 * Create a mock lookup service
 */
export function createMockLookup(config: MockLookupConfig = {}): MockLookupService {
  let mergedConfig = { ...DEFAULT_MOCK_CONFIG, ...config }
  const callHistory: MockLookupCallEntry[] = []
  let currentConcurrentCalls = 0
  const callTimestamps: number[] = []

  const getLatency = (): number => {
    if (mergedConfig.latencyRange) {
      const { min, max } = mergedConfig.latencyRange
      return Math.floor(Math.random() * (max - min + 1)) + min
    }
    return mergedConfig.latencyMs ?? 0
  }

  const shouldFail = (): boolean => {
    const rate = mergedConfig.failureRate ?? 0
    return Math.random() < rate
  }

  const checkRateLimit = (): boolean => {
    if (!mergedConfig.rateLimitPerMinute) return true

    const now = Date.now()
    const oneMinuteAgo = now - 60000

    // Remove old timestamps
    while (callTimestamps.length > 0 && callTimestamps[0] < oneMinuteAgo) {
      callTimestamps.shift()
    }

    return callTimestamps.length < mergedConfig.rateLimitPerMinute
  }

  const getInputKey = (input: LookupInput): string => {
    return stableHash(input.keyFields)
  }

  const findResponse = async (input: LookupInput): Promise<LookupOutput> => {
    // Check canned responses first
    if (mergedConfig.responses) {
      const key = getInputKey(input)
      const response = mergedConfig.responses.get(key)
      if (response) {
        return response
      }
    }

    // Check response function
    if (mergedConfig.responseFn) {
      return mergedConfig.responseFn(input)
    }

    // Return default response
    return (
      mergedConfig.defaultResponse ?? {
        found: false,
      }
    )
  }

  const recordCall = (
    input: LookupInput,
    success: boolean,
    startedAt: Date,
    response?: LookupOutput,
    error?: string,
  ): void => {
    if (!mergedConfig.trackCalls) return

    callHistory.push({
      input,
      timestamp: startedAt,
      success,
      response,
      error,
      durationMs: Date.now() - startedAt.getTime(),
    })
  }

  const service: MockLookupService = {
    name: mergedConfig.name ?? 'mock-lookup',
    type: 'lookup',
    description: mergedConfig.description ?? 'Mock lookup service for testing',

    async execute(
      input: LookupInput,
      _context: ServiceContext,
    ): Promise<ServiceResult<LookupOutput>> {
      const startedAt = new Date()
      const serviceName = this.name

      try {
        // Check rate limit
        if (!checkRateLimit()) {
          const error = new ServiceServerError(
            serviceName,
            'Rate limit exceeded',
            429,
          )
          recordCall(input, false, startedAt, undefined, error.message)
          return createFailureResult(error, startedAt, 'network')
        }

        // Record call timestamp for rate limiting
        callTimestamps.push(Date.now())

        // Check concurrent calls
        if (
          mergedConfig.maxConcurrentCalls &&
          currentConcurrentCalls >= mergedConfig.maxConcurrentCalls
        ) {
          const error = new ServiceServerError(
            serviceName,
            'Too many concurrent calls',
            503,
          )
          recordCall(input, false, startedAt, undefined, error.message)
          return createFailureResult(error, startedAt, 'network')
        }

        currentConcurrentCalls++

        try {
          // Simulate latency
          const latency = getLatency()
          if (latency > 0) {
            await sleep(latency)
          }

          // Check for simulated failure
          if (shouldFail()) {
            let error: Error
            switch (mergedConfig.failureError) {
              case 'timeout':
                error = new ServiceTimeoutError(serviceName, latency)
                recordCall(input, false, startedAt, undefined, error.message)
                return createFailureResult(error, startedAt, 'timeout')

              case 'server':
                error = new ServiceServerError(serviceName, 'Simulated server error', 500)
                recordCall(input, false, startedAt, undefined, error.message)
                return createFailureResult(error, startedAt, 'network')

              case 'network':
              default:
                error = new ServiceNetworkError(serviceName, 'Simulated network failure')
                recordCall(input, false, startedAt, undefined, error.message)
                return createFailureResult(error, startedAt, 'network')
            }
          }

          // Get response
          const response = await findResponse(input)

          // Add match quality if not present
          const finalResponse: LookupOutput = {
            ...response,
            matchQuality: response.matchQuality ?? mergedConfig.defaultMatchQuality ?? 'partial',
          }

          recordCall(input, true, startedAt, finalResponse)
          return createSuccessResult(finalResponse, startedAt)
        } finally {
          currentConcurrentCalls--
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        recordCall(input, false, startedAt, undefined, errorMessage)
        return createFailureResult(
          error instanceof Error ? error : new Error(errorMessage),
          startedAt,
          'unknown',
        )
      }
    },

    async healthCheck(): Promise<HealthCheckResult> {
      const startedAt = new Date()
      const latency = getLatency()

      if (latency > 0) {
        await sleep(latency)
      }

      const completedAt = new Date()

      // Check if service should fail
      if (shouldFail()) {
        return {
          healthy: false,
          reason: 'Simulated health check failure',
          checkedAt: completedAt,
        }
      }

      return {
        healthy: true,
        responseTimeMs: completedAt.getTime() - startedAt.getTime(),
        checkedAt: completedAt,
        details: {
          callCount: callHistory.length,
          failureRate: mergedConfig.failureRate,
          latencyMs: mergedConfig.latencyMs,
        },
      }
    },

    getCallHistory(): MockLookupCallEntry[] {
      return [...callHistory]
    },

    clearCallHistory(): void {
      callHistory.length = 0
    },

    getCallCount(): number {
      return callHistory.length
    },

    getLastCall(): MockLookupCallEntry | undefined {
      return callHistory[callHistory.length - 1]
    },

    reset(): void {
      callHistory.length = 0
      callTimestamps.length = 0
      currentConcurrentCalls = 0
    },

    updateConfig(newConfig: Partial<MockLookupConfig>): void {
      mergedConfig = { ...mergedConfig, ...newConfig }
      if (newConfig.name) {
        (service as { name: string }).name = newConfig.name
      }
      if (newConfig.description) {
        (service as { description: string }).description = newConfig.description
      }
    },

    addResponse(key: string | Record<string, unknown>, response: LookupOutput): void {
      if (!mergedConfig.responses) {
        mergedConfig.responses = new Map()
      }

      const keyStr = typeof key === 'string' ? key : stableHash(key)
      mergedConfig.responses.set(keyStr, response)
    },

    removeResponse(key: string | Record<string, unknown>): boolean {
      if (!mergedConfig.responses) return false

      const keyStr = typeof key === 'string' ? key : stableHash(key)
      return mergedConfig.responses.delete(keyStr)
    },

    setFailureRate(rate: number): void {
      mergedConfig.failureRate = Math.max(0, Math.min(1, rate))
    },

    setLatency(ms: number): void {
      mergedConfig.latencyMs = Math.max(0, ms)
      mergedConfig.latencyRange = undefined
    },
  }

  return service
}

/**
 * Create a mock lookup that returns specific data for specific inputs
 */
export function createMockLookupWithData(
  data: Array<{ input: Record<string, unknown>; output: LookupOutput }>,
  defaultResponse?: LookupOutput,
): MockLookupService {
  const responses = new Map<string, LookupOutput>()

  for (const { input, output } of data) {
    const key = stableHash(input)
    responses.set(key, output)
  }

  return createMockLookup({
    responses,
    defaultResponse: defaultResponse ?? { found: false },
  })
}

/**
 * Create a mock lookup that always succeeds with provided data
 */
export function createSuccessMock(
  data: Record<string, unknown>,
  matchQuality: LookupMatchQuality = 'exact',
): MockLookupService {
  return createMockLookup({
    defaultResponse: {
      found: true,
      data,
      matchQuality,
      source: {
        system: 'mock',
        recordId: 'mock-id',
      },
    },
  })
}

/**
 * Create a mock lookup that always returns not found
 */
export function createNotFoundMock(): MockLookupService {
  return createMockLookup({
    defaultResponse: { found: false },
  })
}

/**
 * Create a mock lookup that always fails
 */
export function createFailureMock(
  errorType: 'network' | 'timeout' | 'server' = 'network',
): MockLookupService {
  return createMockLookup({
    failureRate: 1,
    failureError: errorType,
  })
}

/**
 * Create a mock lookup with configurable latency
 */
export function createSlowMock(
  latencyMs: number,
  defaultResponse?: LookupOutput,
): MockLookupService {
  return createMockLookup({
    latencyMs,
    defaultResponse: defaultResponse ?? { found: false },
  })
}

/**
 * Create a mock lookup with random latency
 */
export function createRandomLatencyMock(
  minMs: number,
  maxMs: number,
  defaultResponse?: LookupOutput,
): MockLookupService {
  return createMockLookup({
    latencyRange: { min: minMs, max: maxMs },
    defaultResponse: defaultResponse ?? { found: false },
  })
}

/**
 * Create a mock lookup that fails intermittently
 */
export function createFlakyMock(
  failureRate: number,
  defaultResponse?: LookupOutput,
): MockLookupService {
  return createMockLookup({
    failureRate,
    defaultResponse: defaultResponse ?? { found: false },
  })
}
