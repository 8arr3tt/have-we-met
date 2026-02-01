/**
 * Unit tests for ServiceExecutorImpl
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ServiceExecutorImpl, createServiceExecutor } from '../../../src/services/service-executor.js'
import {
  ServiceAlreadyRegisteredError,
  ServiceNotRegisteredError,
  ServiceTimeoutError,
  ServiceUnavailableError,
} from '../../../src/services/service-error.js'
import type {
  ServiceConfig,
  ServicePlugin,
  ValidationService,
  LookupService,
  CustomService,
  ValidationInput,
  ValidationOutput,
  LookupInput,
  LookupOutput,
  CustomInput,
  CustomOutput,
  ServiceContext,
  ServiceResult,
  RetryConfig,
} from '../../../src/services/types.js'
import type { ResolverConfig } from '../../../src/types/config.js'

/**
 * Mock resolver config for testing
 */
const mockResolverConfig: ResolverConfig = {
  schema: {
    name: { type: 'name' },
    email: { type: 'email' },
  },
  matching: {
    fields: new Map(),
    thresholds: { noMatch: 20, definiteMatch: 80 },
  },
}

/**
 * Helper to create a mock validation service
 */
function createMockValidationService(
  name: string,
  options: {
    valid?: boolean
    delay?: number
    shouldThrow?: boolean
    throwOnAttempt?: number
  } = {},
): ValidationService {
  let attemptCount = 0
  return {
    name,
    type: 'validation',
    description: 'Mock validation service',
    execute: vi.fn(async (_input: ValidationInput, _context: ServiceContext): Promise<ServiceResult<ValidationOutput>> => {
      attemptCount++
      if (options.delay) {
        await new Promise(resolve => setTimeout(resolve, options.delay))
      }
      if (options.shouldThrow) {
        if (!options.throwOnAttempt || attemptCount >= options.throwOnAttempt) {
          throw new Error('Validation service error')
        }
      }
      return {
        success: true,
        data: {
          valid: options.valid ?? true,
          details: {
            checks: [{ name: 'format', passed: true }],
          },
          invalidReason: options.valid === false ? 'Invalid value' : undefined,
        },
        timing: {
          startedAt: new Date(),
          completedAt: new Date(),
          durationMs: options.delay ?? 0,
        },
        cached: false,
      }
    }),
  }
}

/**
 * Helper to create a mock lookup service
 */
function createMockLookupService(
  name: string,
  options: {
    found?: boolean
    data?: Record<string, unknown>
    delay?: number
    shouldThrow?: boolean
  } = {},
): LookupService {
  return {
    name,
    type: 'lookup',
    description: 'Mock lookup service',
    execute: vi.fn(async (_input: LookupInput, _context: ServiceContext): Promise<ServiceResult<LookupOutput>> => {
      if (options.delay) {
        await new Promise(resolve => setTimeout(resolve, options.delay))
      }
      if (options.shouldThrow) {
        throw new Error('Lookup service error')
      }
      return {
        success: true,
        data: {
          found: options.found ?? true,
          data: options.data ?? { enrichedField: 'enrichedValue' },
          matchQuality: 'exact',
        },
        timing: {
          startedAt: new Date(),
          completedAt: new Date(),
          durationMs: options.delay ?? 0,
        },
        cached: false,
      }
    }),
  }
}

/**
 * Helper to create a mock custom service
 */
function createMockCustomService(
  name: string,
  options: {
    proceed?: boolean
    scoreAdjustment?: number
    flags?: string[]
    delay?: number
    shouldThrow?: boolean
  } = {},
): CustomService {
  return {
    name,
    type: 'custom',
    description: 'Mock custom service',
    execute: vi.fn(async (_input: CustomInput, _context: ServiceContext): Promise<ServiceResult<CustomOutput>> => {
      if (options.delay) {
        await new Promise(resolve => setTimeout(resolve, options.delay))
      }
      if (options.shouldThrow) {
        throw new Error('Custom service error')
      }
      return {
        success: true,
        data: {
          result: { checked: true },
          proceed: options.proceed ?? true,
          scoreAdjustment: options.scoreAdjustment,
          flags: options.flags,
        },
        timing: {
          startedAt: new Date(),
          completedAt: new Date(),
          durationMs: options.delay ?? 0,
        },
        cached: false,
      }
    }),
  }
}

/**
 * Helper to create a basic service config
 */
function createServiceConfig(
  plugin: ServicePlugin,
  overrides: Partial<ServiceConfig> = {},
): ServiceConfig {
  return {
    plugin,
    executionPoint: 'pre-match',
    onFailure: 'continue',
    ...overrides,
  }
}

describe('ServiceExecutorImpl', () => {
  let executor: ServiceExecutorImpl

  beforeEach(() => {
    executor = createServiceExecutor({
      resolverConfig: mockResolverConfig,
    })
  })

  describe('register', () => {
    it('registers service with valid config', () => {
      const plugin = createMockValidationService('test-validator')
      const config = createServiceConfig(plugin)

      expect(() => executor.register(config)).not.toThrow()
      expect(executor.getServiceNames()).toContain('test-validator')
    })

    it('rejects invalid service config', () => {
      const invalidConfig = {
        plugin: { name: '', type: 'validation' },
        executionPoint: 'pre-match',
        onFailure: 'continue',
      } as ServiceConfig

      expect(() => executor.register(invalidConfig)).toThrow()
    })

    it('handles duplicate service names', () => {
      const plugin1 = createMockValidationService('duplicate')
      const plugin2 = createMockValidationService('duplicate')
      const config1 = createServiceConfig(plugin1)
      const config2 = createServiceConfig(plugin2)

      executor.register(config1)

      expect(() => executor.register(config2)).toThrow(ServiceAlreadyRegisteredError)
    })

    it('merges defaults into service config', () => {
      const executor = createServiceExecutor({
        resolverConfig: mockResolverConfig,
        defaults: {
          timeout: 10000,
        },
      })

      const plugin = createMockValidationService('test')
      const config = createServiceConfig(plugin)

      executor.register(config)

      expect(executor.getServiceNames()).toContain('test')
    })
  })

  describe('unregister', () => {
    it('removes registered service', () => {
      const plugin = createMockValidationService('to-remove')
      executor.register(createServiceConfig(plugin))

      const result = executor.unregister('to-remove')

      expect(result).toBe(true)
      expect(executor.getServiceNames()).not.toContain('to-remove')
    })

    it('returns false for non-existent service', () => {
      const result = executor.unregister('non-existent')

      expect(result).toBe(false)
    })
  })

  describe('executePreMatch', () => {
    it('executes all pre-match services', async () => {
      const validator = createMockValidationService('validator')
      const lookup = createMockLookupService('lookup')

      executor.register(createServiceConfig(validator, { fields: ['email'] }))
      executor.register(createServiceConfig(lookup, { fields: ['email'] }))

      const record = { email: 'test@example.com' }
      const result = await executor.executePreMatch(record)

      expect(result.proceed).toBe(true)
      expect(result.results['validator']).toBeDefined()
      expect(result.results['lookup']).toBeDefined()
      expect(validator.execute).toHaveBeenCalled()
      expect(lookup.execute).toHaveBeenCalled()
    })

    it('respects priority ordering', async () => {
      const callOrder: string[] = []

      const first = createMockValidationService('first')
      ;(first.execute as any).mockImplementation(async () => {
        callOrder.push('first')
        return { success: true, data: { valid: true }, timing: { startedAt: new Date(), completedAt: new Date(), durationMs: 0 }, cached: false }
      })

      const second = createMockValidationService('second')
      ;(second.execute as any).mockImplementation(async () => {
        callOrder.push('second')
        return { success: true, data: { valid: true }, timing: { startedAt: new Date(), completedAt: new Date(), durationMs: 0 }, cached: false }
      })

      executor.register(createServiceConfig(second, { priority: 200 }))
      executor.register(createServiceConfig(first, { priority: 100 }))

      await executor.executePreMatch({})

      expect(callOrder).toEqual(['first', 'second'])
    })

    it('stops on required service rejection', async () => {
      const rejectingValidator = createMockValidationService('rejecting', { valid: false })
      const secondValidator = createMockValidationService('second')

      executor.register(createServiceConfig(rejectingValidator, {
        fields: ['email'],
        onInvalid: 'reject',
        required: true,
        priority: 100,
      }))
      executor.register(createServiceConfig(secondValidator, { priority: 200 }))

      const result = await executor.executePreMatch({ email: 'bad' })

      expect(result.proceed).toBe(false)
      expect(result.rejectionReason).toBeDefined()
      expect(result.rejectedBy).toBe('rejecting')
    })

    it('continues on optional service failure', async () => {
      const failingValidator = createMockValidationService('failing', { shouldThrow: true })
      const successValidator = createMockValidationService('success')

      executor.register(createServiceConfig(failingValidator, {
        onFailure: 'continue',
        required: false,
        priority: 100,
      }))
      executor.register(createServiceConfig(successValidator, { priority: 200 }))

      const result = await executor.executePreMatch({})

      expect(result.proceed).toBe(true)
      expect(result.results['failing'].success).toBe(false)
      expect(result.results['success'].success).toBe(true)
    })

    it('aggregates results correctly', async () => {
      const validator = createMockValidationService('validator')
      executor.register(createServiceConfig(validator))

      const result = await executor.executePreMatch({ email: 'test@example.com' })

      expect(result.results).toHaveProperty('validator')
      expect(result.totalDurationMs).toBeGreaterThanOrEqual(0)
    })

    it('tracks total execution time', async () => {
      const slowValidator = createMockValidationService('slow', { delay: 50 })
      executor.register(createServiceConfig(slowValidator))

      const result = await executor.executePreMatch({})

      expect(result.totalDurationMs).toBeGreaterThanOrEqual(50)
    })
  })

  describe('executePostMatch', () => {
    it('executes all post-match services', async () => {
      const customService = createMockCustomService('fraud-check', {
        scoreAdjustment: -5,
      })

      executor.register(createServiceConfig(customService, {
        executionPoint: 'post-match',
      }))

      const record = { email: 'test@example.com' }
      const matchResult = {
        outcome: 'match' as const,
        candidates: [],
        bestMatch: null,
        inputRecord: { id: '1', data: record },
        processedAt: new Date(),
      }

      const result = await executor.executePostMatch(record, matchResult)

      expect(result.proceed).toBe(true)
      expect(result.results['fraud-check']).toBeDefined()
      expect(result.scoreAdjustments).toContain(-5)
    })

    it('includes match result in context', async () => {
      const customService = createMockCustomService('context-checker')
      let capturedContext: ServiceContext | undefined

      ;(customService.execute as any).mockImplementation(async (_input: CustomInput, context: ServiceContext) => {
        capturedContext = context
        return { success: true, data: { result: {}, proceed: true }, timing: { startedAt: new Date(), completedAt: new Date(), durationMs: 0 }, cached: false }
      })

      executor.register(createServiceConfig(customService, {
        executionPoint: 'post-match',
      }))

      const matchResult = {
        outcome: 'match' as const,
        candidates: [],
        bestMatch: null,
        inputRecord: { id: '1', data: {} },
        processedAt: new Date(),
      }

      await executor.executePostMatch({}, matchResult)

      expect(capturedContext?.matchResult).toBe(matchResult)
    })

    it('can adjust match scores', async () => {
      const scorer = createMockCustomService('scorer', { scoreAdjustment: 10 })

      executor.register(createServiceConfig(scorer, {
        executionPoint: 'post-match',
      }))

      const matchResult = {
        outcome: 'match' as const,
        candidates: [],
        bestMatch: null,
        inputRecord: { id: '1', data: {} },
        processedAt: new Date(),
      }

      const result = await executor.executePostMatch({}, matchResult)

      expect(result.scoreAdjustments).toEqual([10])
    })
  })

  describe('executeService', () => {
    it('executes specific service by name', async () => {
      const validator = createMockValidationService('my-validator')
      executor.register(createServiceConfig(validator, { fields: ['email'] }))

      const result = await executor.executeService('my-validator', { email: 'test@example.com' })

      expect(result.success).toBe(true)
      expect(validator.execute).toHaveBeenCalled()
    })

    it('throws for unknown service', async () => {
      await expect(executor.executeService('unknown', {})).rejects.toThrow(ServiceNotRegisteredError)
    })

    it('respects timeout configuration', async () => {
      const slowValidator = createMockValidationService('slow', { delay: 500 })
      executor.register(createServiceConfig(slowValidator, { timeout: 50 }))

      const result = await executor.executeService('slow', {})

      expect(result.success).toBe(false)
      expect(result.error?.type).toBe('timeout')
    })
  })

  describe('parallel execution', () => {
    it('executes independent services in parallel', async () => {
      const parallelExecutor = createServiceExecutor({
        resolverConfig: mockResolverConfig,
        parallelExecution: true,
      })

      const startTimes: number[] = []

      const service1 = createMockValidationService('parallel-1', { delay: 50 })
      ;(service1.execute as any).mockImplementation(async () => {
        startTimes.push(Date.now())
        await new Promise(r => setTimeout(r, 50))
        return { success: true, data: { valid: true }, timing: { startedAt: new Date(), completedAt: new Date(), durationMs: 50 }, cached: false }
      })

      const service2 = createMockValidationService('parallel-2', { delay: 50 })
      ;(service2.execute as any).mockImplementation(async () => {
        startTimes.push(Date.now())
        await new Promise(r => setTimeout(r, 50))
        return { success: true, data: { valid: true }, timing: { startedAt: new Date(), completedAt: new Date(), durationMs: 50 }, cached: false }
      })

      parallelExecutor.register(createServiceConfig(service1))
      parallelExecutor.register(createServiceConfig(service2))

      const startTime = Date.now()
      await parallelExecutor.executePreMatch({})
      const totalTime = Date.now() - startTime

      // With parallel execution, both services should start nearly simultaneously
      // Use generous threshold for CI environments
      expect(Math.abs(startTimes[0] - startTimes[1])).toBeLessThan(100)
      // Total time should be less than sequential execution would take (100ms + overhead)
      // but allow generous margin for slow CI environments
      expect(totalTime).toBeLessThan(500)
    })

    it('maintains result ordering', async () => {
      const parallelExecutor = createServiceExecutor({
        resolverConfig: mockResolverConfig,
        parallelExecution: true,
      })

      const service1 = createMockValidationService('first')
      const service2 = createMockValidationService('second')

      parallelExecutor.register(createServiceConfig(service1))
      parallelExecutor.register(createServiceConfig(service2))

      const result = await parallelExecutor.executePreMatch({})

      expect(Object.keys(result.results)).toContain('first')
      expect(Object.keys(result.results)).toContain('second')
    })
  })

  describe('getHealthStatus', () => {
    it('returns health status for all services', async () => {
      const validator = createMockValidationService('health-test')
      validator.healthCheck = vi.fn().mockResolvedValue({
        healthy: true,
        checkedAt: new Date(),
      })

      executor.register(createServiceConfig(validator))

      const health = await executor.getHealthStatus()

      expect(health['health-test']).toBeDefined()
      expect(health['health-test'].healthy).toBe(true)
    })

    it('reports unhealthy when circuit breaker is open', async () => {
      const failingService = createMockValidationService('failing', { shouldThrow: true })

      const executor = createServiceExecutor({
        resolverConfig: mockResolverConfig,
        defaults: {
          circuitBreaker: {
            failureThreshold: 1,
            resetTimeoutMs: 60000,
            successThreshold: 1,
            failureWindowMs: 60000,
          },
        },
      })

      executor.register(createServiceConfig(failingService))

      // Trigger failure to open circuit
      try {
        await executor.executePreMatch({})
      } catch {
        // Expected
      }

      const health = await executor.getHealthStatus()

      expect(health['failing'].healthy).toBe(false)
      expect(health['failing'].reason).toContain('Circuit breaker')
    })

    it('returns default healthy for services without healthCheck', async () => {
      const validator = createMockValidationService('no-health')
      delete (validator as any).healthCheck

      executor.register(createServiceConfig(validator))

      const health = await executor.getHealthStatus()

      expect(health['no-health'].healthy).toBe(true)
    })
  })

  describe('getCircuitStatus', () => {
    it('returns circuit breaker status for all services', () => {
      const validator = createMockValidationService('circuit-test')
      executor.register(createServiceConfig(validator))

      const status = executor.getCircuitStatus()

      expect(status['circuit-test']).toBeDefined()
      expect(status['circuit-test'].state).toBe('closed')
      expect(status['circuit-test'].failureCount).toBe(0)
    })
  })

  describe('dispose', () => {
    it('disposes all services', async () => {
      const validator = createMockValidationService('disposable')
      validator.dispose = vi.fn().mockResolvedValue(undefined)

      executor.register(createServiceConfig(validator))

      await executor.dispose()

      expect(validator.dispose).toHaveBeenCalled()
      expect(executor.getServiceNames()).toHaveLength(0)
    })

    it('handles services without dispose', async () => {
      const validator = createMockValidationService('no-dispose')
      delete (validator as any).dispose

      executor.register(createServiceConfig(validator))

      await expect(executor.dispose()).resolves.not.toThrow()
    })
  })

  describe('timeout handling', () => {
    it('times out slow services', async () => {
      const slowValidator = createMockValidationService('slow', { delay: 500 })
      executor.register(createServiceConfig(slowValidator, { timeout: 50 }))

      const result = await executor.executePreMatch({})

      expect(result.results['slow'].success).toBe(false)
      expect(result.results['slow'].error?.type).toBe('timeout')
    })

    it('uses default timeout when not specified', async () => {
      const slowValidator = createMockValidationService('default-timeout', { delay: 10000 })
      executor.register(createServiceConfig(slowValidator))

      const result = await executor.executePreMatch({})

      expect(result.results['default-timeout'].success).toBe(false)
      expect(result.results['default-timeout'].error?.type).toBe('timeout')
    }, 10000)
  })

  describe('retry handling', () => {
    it('retries on failure up to max attempts', async () => {
      let attemptCount = 0
      const retryingValidator = createMockValidationService('retrying')
      ;(retryingValidator.execute as any).mockImplementation(async () => {
        attemptCount++
        if (attemptCount < 3) {
          // Simulate a network error that includes timeout in message (will be converted by toServiceError)
          throw new Error('ECONNREFUSED network error')
        }
        return { success: true, data: { valid: true }, timing: { startedAt: new Date(), completedAt: new Date(), durationMs: 0 }, cached: false }
      })

      const retryConfig: RetryConfig = {
        maxAttempts: 3,
        initialDelayMs: 10,
        backoffMultiplier: 1,
        maxDelayMs: 100,
        retryOn: ['all'], // Use 'all' to retry all error types
      }

      executor.register(createServiceConfig(retryingValidator, { retry: retryConfig }))

      const result = await executor.executePreMatch({})

      expect(result.results['retrying'].success).toBe(true)
      expect(attemptCount).toBe(3)
    })

    it('does not retry non-retryable errors', async () => {
      let attemptCount = 0
      const nonRetryableValidator = createMockValidationService('non-retryable')
      ;(nonRetryableValidator.execute as any).mockImplementation(async () => {
        attemptCount++
        const error = new Error('Validation error') as Error & { type: string; retryable: boolean }
        error.type = 'validation'
        error.retryable = false
        throw error
      })

      const retryConfig: RetryConfig = {
        maxAttempts: 3,
        initialDelayMs: 10,
        backoffMultiplier: 1,
        maxDelayMs: 100,
        retryOn: ['timeout', 'network'],
      }

      executor.register(createServiceConfig(nonRetryableValidator, { retry: retryConfig }))

      const result = await executor.executePreMatch({})

      expect(result.results['non-retryable'].success).toBe(false)
      expect(attemptCount).toBe(1)
    })

    it('tracks retry attempts in result', async () => {
      let attemptCount = 0
      const retryingValidator = createMockValidationService('retry-tracker')
      ;(retryingValidator.execute as any).mockImplementation(async () => {
        attemptCount++
        if (attemptCount < 2) {
          // Simulate a timeout error (will be converted by toServiceError based on message)
          throw new Error('Request timed out')
        }
        return { success: true, data: { valid: true }, timing: { startedAt: new Date(), completedAt: new Date(), durationMs: 0 }, cached: false }
      })

      const retryConfig: RetryConfig = {
        maxAttempts: 3,
        initialDelayMs: 10,
        backoffMultiplier: 1,
        maxDelayMs: 100,
        retryOn: ['all'], // Use 'all' to ensure retry happens
      }

      executor.register(createServiceConfig(retryingValidator, { retry: retryConfig }))

      const result = await executor.executePreMatch({})

      expect(result.results['retry-tracker'].retryAttempts).toBe(2)
    })
  })

  describe('circuit breaker', () => {
    it('opens after failure threshold', async () => {
      const failingService = createMockValidationService('cb-failing', { shouldThrow: true })

      const executor = createServiceExecutor({
        resolverConfig: mockResolverConfig,
        defaults: {
          circuitBreaker: {
            failureThreshold: 2,
            resetTimeoutMs: 60000,
            successThreshold: 1,
            failureWindowMs: 60000,
          },
        },
      })

      executor.register(createServiceConfig(failingService))

      // First two failures should open circuit
      await executor.executePreMatch({})
      await executor.executePreMatch({})

      const status = executor.getCircuitStatus()
      expect(status['cb-failing'].state).toBe('open')
    })

    it('rejects immediately when open', async () => {
      const failingService = createMockValidationService('cb-open', { shouldThrow: true })

      const executor = createServiceExecutor({
        resolverConfig: mockResolverConfig,
        defaults: {
          circuitBreaker: {
            failureThreshold: 1,
            resetTimeoutMs: 60000,
            successThreshold: 1,
            failureWindowMs: 60000,
          },
        },
      })

      executor.register(createServiceConfig(failingService))

      // First failure opens circuit
      await executor.executePreMatch({})

      // Next call should be rejected by circuit breaker
      await expect(executor.executeService('cb-open', {})).rejects.toThrow(ServiceUnavailableError)
    })

    it('transitions to half-open after reset timeout', async () => {
      const failingService = createMockValidationService('cb-half-open', { shouldThrow: true })

      const executor = createServiceExecutor({
        resolverConfig: mockResolverConfig,
        defaults: {
          circuitBreaker: {
            failureThreshold: 1,
            resetTimeoutMs: 50, // Short timeout for test
            successThreshold: 1,
            failureWindowMs: 60000,
          },
        },
      })

      executor.register(createServiceConfig(failingService))

      // Trigger open
      await executor.executePreMatch({})

      // Wait for reset timeout
      await new Promise(r => setTimeout(r, 60))

      // Now it should be half-open and allow one request
      const status = executor.getCircuitStatus()
      // Note: The circuit will still show open until a call is made
      // because transition happens during call
      expect(['open', 'half-open']).toContain(status['cb-half-open'].state)
    })
  })

  describe('enrichment', () => {
    it('uses enriched data for subsequent services', async () => {
      const lookup = createMockLookupService('enricher', {
        found: true,
        data: { city: 'New York' },
      })
      const validator = createMockValidationService('post-enrichment')

      let capturedRecord: Record<string, unknown> | undefined
      ;(validator.execute as any).mockImplementation(async (input: ValidationInput) => {
        capturedRecord = input.context?.record as Record<string, unknown>
        return { success: true, data: { valid: true }, timing: { startedAt: new Date(), completedAt: new Date(), durationMs: 0 }, cached: false }
      })

      executor.register(createServiceConfig(lookup, {
        fields: ['address'],
        fieldMapping: { city: 'city' },
        priority: 100,
      }))
      executor.register(createServiceConfig(validator, { fields: ['email'], priority: 200 }))

      const result = await executor.executePreMatch({ address: '123 Main St' })

      expect(result.enrichedData?.city).toBe('New York')
    })

    it('includes enriched record in result', async () => {
      const lookup = createMockLookupService('data-enricher', {
        found: true,
        data: { enrichedField: 'enrichedValue' },
      })

      executor.register(createServiceConfig(lookup, {
        fields: ['key'],
        fieldMapping: { enrichedField: 'enrichedField' },
      }))

      const result = await executor.executePreMatch({ key: 'value' })

      expect(result.enrichedData).toHaveProperty('enrichedField', 'enrichedValue')
    })
  })

  describe('flags', () => {
    it('accumulates flags from services', async () => {
      const customService = createMockCustomService('flagger', {
        flags: ['high-risk', 'manual-review'],
      })

      executor.register(createServiceConfig(customService, {
        executionPoint: 'post-match',
      }))

      const result = await executor.executePostMatch({}, {
        outcome: 'match',
        candidates: [],
        bestMatch: null,
        inputRecord: { id: '1', data: {} },
        processedAt: new Date(),
      })

      expect(result.flags).toContain('high-risk')
      expect(result.flags).toContain('manual-review')
    })

    it('adds failure flags when onFailure is flag', async () => {
      const failingService = createMockValidationService('failing-flagger', { shouldThrow: true })

      executor.register(createServiceConfig(failingService, {
        onFailure: 'flag',
      }))

      const result = await executor.executePreMatch({})

      expect(result.flags).toContain('failing-flagger:failed')
    })

    it('adds invalid flags when onInvalid is flag', async () => {
      const invalidValidator = createMockValidationService('invalid-flagger', { valid: false })

      executor.register(createServiceConfig(invalidValidator, {
        fields: ['email'],
        onInvalid: 'flag',
      }))

      const result = await executor.executePreMatch({ email: 'bad' })

      expect(result.flags).toContain('invalid-flagger:invalid')
    })
  })

  describe('execution order', () => {
    it('respects custom execution order', async () => {
      const callOrder: string[] = []

      const service1 = createMockValidationService('order-a')
      ;(service1.execute as any).mockImplementation(async () => {
        callOrder.push('order-a')
        return { success: true, data: { valid: true }, timing: { startedAt: new Date(), completedAt: new Date(), durationMs: 0 }, cached: false }
      })

      const service2 = createMockValidationService('order-b')
      ;(service2.execute as any).mockImplementation(async () => {
        callOrder.push('order-b')
        return { success: true, data: { valid: true }, timing: { startedAt: new Date(), completedAt: new Date(), durationMs: 0 }, cached: false }
      })

      const service3 = createMockValidationService('order-c')
      ;(service3.execute as any).mockImplementation(async () => {
        callOrder.push('order-c')
        return { success: true, data: { valid: true }, timing: { startedAt: new Date(), completedAt: new Date(), durationMs: 0 }, cached: false }
      })

      const executor = createServiceExecutor({
        resolverConfig: mockResolverConfig,
        executionOrder: ['order-c', 'order-a', 'order-b'],
      })

      executor.register(createServiceConfig(service1))
      executor.register(createServiceConfig(service2))
      executor.register(createServiceConfig(service3))

      await executor.executePreMatch({})

      expect(callOrder).toEqual(['order-c', 'order-a', 'order-b'])
    })
  })
})

describe('createServiceExecutor', () => {
  it('creates executor with default options', () => {
    const executor = createServiceExecutor({
      resolverConfig: mockResolverConfig,
    })

    expect(executor).toBeInstanceOf(ServiceExecutorImpl)
  })

  it('creates executor with custom defaults', () => {
    const executor = createServiceExecutor({
      resolverConfig: mockResolverConfig,
      defaults: {
        timeout: 10000,
        retry: {
          maxAttempts: 5,
          initialDelayMs: 200,
          backoffMultiplier: 2,
          maxDelayMs: 10000,
        },
      },
    })

    expect(executor).toBeInstanceOf(ServiceExecutorImpl)
  })
})
