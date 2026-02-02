/**
 * Tests for service types and type utilities
 */

import { describe, it, expect } from 'vitest'
import type {
  ServicePlugin,
  ServiceContext,
  ServiceResult,
  ValidationService,
  LookupService,
  CustomService,
  ValidationInput,
  ValidationOutput,
  LookupInput,
  LookupOutput,
  CustomInput,
  CustomOutput,
  ServiceConfig,
  RetryConfig,
  CacheConfig,
  CircuitBreakerConfig,
} from './types.js'
import {
  DEFAULT_RETRY_CONFIG,
  DEFAULT_CACHE_CONFIG,
  DEFAULT_SERVICE_CONFIG,
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
} from './types.js'

describe('Service Types', () => {
  describe('ServicePlugin', () => {
    it('includes all required properties', () => {
      const plugin: ServicePlugin = {
        name: 'test-service',
        type: 'validation',
        execute: async () => ({
          success: true,
          timing: {
            startedAt: new Date(),
            completedAt: new Date(),
            durationMs: 0,
          },
          cached: false,
        }),
      }

      expect(plugin.name).toBe('test-service')
      expect(plugin.type).toBe('validation')
      expect(typeof plugin.execute).toBe('function')
    })

    it('supports optional properties', () => {
      const plugin: ServicePlugin = {
        name: 'test-service',
        type: 'validation',
        description: 'A test service',
        execute: async () => ({
          success: true,
          timing: {
            startedAt: new Date(),
            completedAt: new Date(),
            durationMs: 0,
          },
          cached: false,
        }),
        healthCheck: async () => ({
          healthy: true,
          checkedAt: new Date(),
        }),
        dispose: async () => {},
      }

      expect(plugin.description).toBe('A test service')
      expect(typeof plugin.healthCheck).toBe('function')
      expect(typeof plugin.dispose).toBe('function')
    })
  })

  describe('ServiceContext', () => {
    it('provides full execution context', () => {
      const context: ServiceContext = {
        record: { firstName: 'John', lastName: 'Doe' },
        config: {
          schema: {},
          matching: {
            fields: new Map(),
            thresholds: {
              noMatch: 20,
              definiteMatch: 80,
            },
          },
        },
        metadata: {
          correlationId: 'test-123',
          startedAt: new Date(),
        },
      }

      expect(context.record).toEqual({ firstName: 'John', lastName: 'Doe' })
      expect(context.metadata.correlationId).toBe('test-123')
    })

    it('supports optional properties', () => {
      const mockSignal = { aborted: false } as AbortSignal
      const context: ServiceContext = {
        record: {},
        config: {
          schema: {},
          matching: {
            fields: new Map(),
            thresholds: { noMatch: 20, definiteMatch: 80 },
          },
        },
        metadata: {
          correlationId: 'test-123',
          startedAt: new Date(),
        },
        logger: {
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
        },
        signal: mockSignal,
      }

      expect(context.logger).toBeDefined()
      expect(context.signal).toBeDefined()
    })
  })

  describe('ServiceResult', () => {
    it('captures success state', () => {
      const result: ServiceResult<string> = {
        success: true,
        data: 'test data',
        timing: {
          startedAt: new Date('2025-01-01T00:00:00Z'),
          completedAt: new Date('2025-01-01T00:00:01Z'),
          durationMs: 1000,
        },
        cached: false,
      }

      expect(result.success).toBe(true)
      expect(result.data).toBe('test data')
      expect(result.timing.durationMs).toBe(1000)
      expect(result.cached).toBe(false)
    })

    it('captures failure state', () => {
      const result: ServiceResult<string> = {
        success: false,
        error: {
          code: 'TEST_ERROR',
          message: 'Test error message',
          type: 'validation',
          retryable: false,
        },
        timing: {
          startedAt: new Date(),
          completedAt: new Date(),
          durationMs: 100,
        },
        cached: false,
      }

      expect(result.success).toBe(false)
      expect(result.error?.code).toBe('TEST_ERROR')
      expect(result.error?.retryable).toBe(false)
    })

    it('captures cached results', () => {
      const result: ServiceResult<string> = {
        success: true,
        data: 'cached data',
        timing: {
          startedAt: new Date(),
          completedAt: new Date(),
          durationMs: 1,
        },
        cached: true,
      }

      expect(result.cached).toBe(true)
    })

    it('tracks retry attempts', () => {
      const result: ServiceResult = {
        success: true,
        timing: {
          startedAt: new Date(),
          completedAt: new Date(),
          durationMs: 500,
        },
        cached: false,
        retryAttempts: 2,
      }

      expect(result.retryAttempts).toBe(2)
    })
  })

  describe('ValidationService', () => {
    it('extends base with validation specifics', () => {
      const service: ValidationService = {
        name: 'test-validator',
        type: 'validation',
        execute: async (
          _input: ValidationInput
        ): Promise<ServiceResult<ValidationOutput>> => ({
          success: true,
          data: {
            valid: true,
            details: {
              checks: [{ name: 'format', passed: true }],
            },
          },
          timing: {
            startedAt: new Date(),
            completedAt: new Date(),
            durationMs: 10,
          },
          cached: false,
        }),
      }

      expect(service.type).toBe('validation')
    })

    it('returns validation output with checks', async () => {
      const service: ValidationService = {
        name: 'test-validator',
        type: 'validation',
        execute: async () => ({
          success: true,
          data: {
            valid: false,
            details: {
              checks: [
                { name: 'format', passed: true, message: 'Format OK' },
                {
                  name: 'checksum',
                  passed: false,
                  message: 'Invalid checksum',
                },
              ],
            },
            invalidReason: 'Invalid checksum',
            suggestions: ['Check the last digit'],
          },
          timing: {
            startedAt: new Date(),
            completedAt: new Date(),
            durationMs: 5,
          },
          cached: false,
        }),
      }

      const result = await service.execute(
        { field: 'id', value: '123' },
        {} as ServiceContext
      )

      expect(result.success).toBe(true)
      expect(result.data?.valid).toBe(false)
      expect(result.data?.details?.checks).toHaveLength(2)
      expect(result.data?.invalidReason).toBe('Invalid checksum')
    })
  })

  describe('LookupService', () => {
    it('extends base with lookup specifics', () => {
      const service: LookupService = {
        name: 'test-lookup',
        type: 'lookup',
        execute: async (
          _input: LookupInput
        ): Promise<ServiceResult<LookupOutput>> => ({
          success: true,
          data: {
            found: true,
            data: { firstName: 'John', lastName: 'Doe' },
            matchQuality: 'exact',
          },
          timing: {
            startedAt: new Date(),
            completedAt: new Date(),
            durationMs: 100,
          },
          cached: false,
        }),
      }

      expect(service.type).toBe('lookup')
    })

    it('returns lookup output with source info', async () => {
      const service: LookupService = {
        name: 'test-lookup',
        type: 'lookup',
        execute: async () => ({
          success: true,
          data: {
            found: true,
            data: { email: 'john@example.com' },
            matchQuality: 'partial',
            source: {
              system: 'CRM',
              recordId: 'rec-123',
              lastUpdated: new Date('2025-01-01'),
            },
          },
          timing: {
            startedAt: new Date(),
            completedAt: new Date(),
            durationMs: 50,
          },
          cached: false,
        }),
      }

      const result = await service.execute(
        { keyFields: { id: '123' } },
        {} as ServiceContext
      )

      expect(result.data?.found).toBe(true)
      expect(result.data?.source?.system).toBe('CRM')
    })

    it('returns not found result', async () => {
      const service: LookupService = {
        name: 'test-lookup',
        type: 'lookup',
        execute: async () => ({
          success: true,
          data: {
            found: false,
          },
          timing: {
            startedAt: new Date(),
            completedAt: new Date(),
            durationMs: 30,
          },
          cached: false,
        }),
      }

      const result = await service.execute(
        { keyFields: { id: 'unknown' } },
        {} as ServiceContext
      )

      expect(result.data?.found).toBe(false)
      expect(result.data?.data).toBeUndefined()
    })
  })

  describe('CustomService', () => {
    it('extends base with custom specifics', () => {
      const service: CustomService = {
        name: 'fraud-check',
        type: 'custom',
        execute: async (
          _input: CustomInput
        ): Promise<ServiceResult<CustomOutput>> => ({
          success: true,
          data: {
            result: { riskScore: 0.3 },
            proceed: true,
          },
          timing: {
            startedAt: new Date(),
            completedAt: new Date(),
            durationMs: 200,
          },
          cached: false,
        }),
      }

      expect(service.type).toBe('custom')
    })

    it('returns custom output with score adjustment', async () => {
      const service: CustomService = {
        name: 'fraud-check',
        type: 'custom',
        execute: async () => ({
          success: true,
          data: {
            result: { riskScore: 0.8 },
            proceed: false,
            scoreAdjustment: -20,
            flags: ['high-risk', 'needs-review'],
          },
          timing: {
            startedAt: new Date(),
            completedAt: new Date(),
            durationMs: 150,
          },
          cached: false,
        }),
      }

      const result = await service.execute(
        { record: { email: 'test@example.com' } },
        {} as ServiceContext
      )

      expect(result.data?.proceed).toBe(false)
      expect(result.data?.scoreAdjustment).toBe(-20)
      expect(result.data?.flags).toContain('high-risk')
    })
  })
})

describe('Default Configurations', () => {
  describe('DEFAULT_RETRY_CONFIG', () => {
    it('has sensible defaults', () => {
      expect(DEFAULT_RETRY_CONFIG.maxAttempts).toBe(3)
      expect(DEFAULT_RETRY_CONFIG.initialDelayMs).toBe(100)
      expect(DEFAULT_RETRY_CONFIG.backoffMultiplier).toBe(2)
      expect(DEFAULT_RETRY_CONFIG.maxDelayMs).toBe(5000)
      expect(DEFAULT_RETRY_CONFIG.retryOn).toEqual([
        'timeout',
        'network',
        'server',
      ])
    })
  })

  describe('DEFAULT_CACHE_CONFIG', () => {
    it('has sensible defaults', () => {
      expect(DEFAULT_CACHE_CONFIG.enabled).toBe(true)
      expect(DEFAULT_CACHE_CONFIG.ttlSeconds).toBe(300)
      expect(DEFAULT_CACHE_CONFIG.staleOnError).toBe(true)
    })
  })

  describe('DEFAULT_SERVICE_CONFIG', () => {
    it('has sensible defaults', () => {
      expect(DEFAULT_SERVICE_CONFIG.onFailure).toBe('continue')
      expect(DEFAULT_SERVICE_CONFIG.timeout).toBe(5000)
      expect(DEFAULT_SERVICE_CONFIG.priority).toBe(100)
      expect(DEFAULT_SERVICE_CONFIG.required).toBe(false)
    })
  })

  describe('DEFAULT_CIRCUIT_BREAKER_CONFIG', () => {
    it('has sensible defaults', () => {
      expect(DEFAULT_CIRCUIT_BREAKER_CONFIG.failureThreshold).toBe(5)
      expect(DEFAULT_CIRCUIT_BREAKER_CONFIG.resetTimeoutMs).toBe(30000)
      expect(DEFAULT_CIRCUIT_BREAKER_CONFIG.successThreshold).toBe(2)
      expect(DEFAULT_CIRCUIT_BREAKER_CONFIG.failureWindowMs).toBe(60000)
    })
  })
})

describe('Type Compatibility', () => {
  it('ServiceConfig accepts all service types', () => {
    const validationConfig: ServiceConfig = {
      plugin: {
        name: 'validator',
        type: 'validation',
        execute: async () => ({
          success: true,
          timing: {
            startedAt: new Date(),
            completedAt: new Date(),
            durationMs: 0,
          },
          cached: false,
        }),
      },
      executionPoint: 'pre-match',
      onFailure: 'continue',
      onInvalid: 'reject',
    }

    const lookupConfig: ServiceConfig = {
      plugin: {
        name: 'lookup',
        type: 'lookup',
        execute: async () => ({
          success: true,
          timing: {
            startedAt: new Date(),
            completedAt: new Date(),
            durationMs: 0,
          },
          cached: false,
        }),
      },
      executionPoint: 'pre-match',
      onFailure: 'continue',
      onNotFound: 'flag',
      fieldMapping: {
        'api.firstName': 'firstName',
        'api.lastName': 'lastName',
      },
    }

    const customConfig: ServiceConfig = {
      plugin: {
        name: 'custom',
        type: 'custom',
        execute: async () => ({
          success: true,
          timing: {
            startedAt: new Date(),
            completedAt: new Date(),
            durationMs: 0,
          },
          cached: false,
        }),
      },
      executionPoint: 'post-match',
      onFailure: 'flag',
      resultPredicate: (result) => result.proceed,
      customParams: { threshold: 0.7 },
    }

    expect(validationConfig.plugin.type).toBe('validation')
    expect(lookupConfig.plugin.type).toBe('lookup')
    expect(customConfig.plugin.type).toBe('custom')
  })

  it('RetryConfig is properly structured', () => {
    const config: RetryConfig = {
      maxAttempts: 5,
      initialDelayMs: 200,
      backoffMultiplier: 1.5,
      maxDelayMs: 10000,
      retryOn: ['timeout', 'network'],
    }

    expect(config.maxAttempts).toBe(5)
    expect(config.retryOn).toContain('timeout')
  })

  it('CacheConfig is properly structured', () => {
    const config: CacheConfig = {
      enabled: true,
      ttlSeconds: 600,
      keyFn: (input) => JSON.stringify(input),
      staleOnError: true,
    }

    expect(config.enabled).toBe(true)
    expect(config.keyFn).toBeDefined()
  })

  it('CircuitBreakerConfig is properly structured', () => {
    const config: CircuitBreakerConfig = {
      failureThreshold: 10,
      resetTimeoutMs: 60000,
      successThreshold: 3,
      failureWindowMs: 120000,
    }

    expect(config.failureThreshold).toBe(10)
    expect(config.resetTimeoutMs).toBe(60000)
  })
})
