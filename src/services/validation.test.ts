/**
 * Tests for service configuration validation
 */

import { describe, it, expect } from 'vitest'
import type {
  ServicePlugin,
  ServiceConfig,
  RetryConfig,
  CacheConfig,
  CircuitBreakerConfig,
  ValidationService,
  LookupService,
  CustomService,
  ServicesConfig,
} from './types.js'
import {
  validateServicePlugin,
  validateValidationServicePlugin,
  validateLookupServicePlugin,
  validateCustomServicePlugin,
  validateRetryConfig,
  validateCacheConfig,
  validateCircuitBreakerConfig,
  validateServiceConfig,
  validateServiceDefaults,
  validateServicesConfig,
  isValidationService,
  isLookupService,
  isCustomService,
} from './validation.js'
import {
  ServiceConfigurationError,
  ServicePluginError,
} from './service-error.js'

const createMockPlugin = (
  overrides: Partial<ServicePlugin> = {}
): ServicePlugin => ({
  name: 'test-plugin',
  type: 'validation',
  execute: async () => ({
    success: true,
    timing: { startedAt: new Date(), completedAt: new Date(), durationMs: 0 },
    cached: false,
  }),
  ...overrides,
})

const createMockServiceConfig = (
  overrides: Partial<ServiceConfig> = {}
): ServiceConfig => ({
  plugin: createMockPlugin(),
  executionPoint: 'pre-match',
  onFailure: 'continue',
  ...overrides,
})

describe('validateServicePlugin', () => {
  it('validates valid service config', () => {
    const plugin = createMockPlugin()
    expect(() => validateServicePlugin(plugin)).not.toThrow()
  })

  it('rejects null plugin', () => {
    expect(() =>
      validateServicePlugin(null as unknown as ServicePlugin)
    ).toThrow(ServicePluginError)
  })

  it('rejects service without name', () => {
    expect(() => validateServicePlugin(createMockPlugin({ name: '' }))).toThrow(
      ServicePluginError
    )

    expect(() =>
      validateServicePlugin(
        createMockPlugin({ name: undefined as unknown as string })
      )
    ).toThrow(ServicePluginError)
  })

  it('rejects service name with whitespace', () => {
    expect(() =>
      validateServicePlugin(createMockPlugin({ name: ' test ' }))
    ).toThrow(ServicePluginError)

    expect(() =>
      validateServicePlugin(createMockPlugin({ name: 'test\n' }))
    ).toThrow(ServicePluginError)
  })

  it('rejects service without type', () => {
    expect(() =>
      validateServicePlugin(
        createMockPlugin({ type: undefined as unknown as 'validation' })
      )
    ).toThrow(ServicePluginError)
  })

  it('rejects invalid service type', () => {
    expect(() =>
      validateServicePlugin(
        createMockPlugin({ type: 'invalid' as 'validation' })
      )
    ).toThrow(ServicePluginError)
  })

  it('rejects service without execute function', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pluginWithoutExecute = {
      ...createMockPlugin(),
      execute: undefined,
    } as any
    expect(() => validateServicePlugin(pluginWithoutExecute)).toThrow(
      ServicePluginError
    )

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pluginWithStringExecute = {
      ...createMockPlugin(),
      execute: 'not a function',
    } as any
    expect(() => validateServicePlugin(pluginWithStringExecute)).toThrow(
      ServicePluginError
    )
  })

  it('validates optional healthCheck is function', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pluginWithStringHealthCheck = {
      ...createMockPlugin(),
      healthCheck: 'not a function',
    } as any
    expect(() => validateServicePlugin(pluginWithStringHealthCheck)).toThrow(
      ServicePluginError
    )

    expect(() =>
      validateServicePlugin(
        createMockPlugin({
          healthCheck: async () => ({ healthy: true, checkedAt: new Date() }),
        })
      )
    ).not.toThrow()
  })

  it('validates optional dispose is function', () => {
    expect(() =>
      validateServicePlugin(
        createMockPlugin({
          dispose: 'not a function' as unknown as () => Promise<void>,
        })
      )
    ).toThrow(ServicePluginError)

    expect(() =>
      validateServicePlugin(createMockPlugin({ dispose: async () => {} }))
    ).not.toThrow()
  })

  it('validates optional description is string', () => {
    expect(() =>
      validateServicePlugin(
        createMockPlugin({ description: 123 as unknown as string })
      )
    ).toThrow(ServicePluginError)

    expect(() =>
      validateServicePlugin(createMockPlugin({ description: 'A test service' }))
    ).not.toThrow()
  })
})

describe('validateValidationServicePlugin', () => {
  it('validates valid validation service', () => {
    const plugin: ValidationService = {
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
    }

    expect(() => validateValidationServicePlugin(plugin)).not.toThrow()
  })

  it('rejects non-validation type', () => {
    const plugin = createMockPlugin({ type: 'lookup' }) as ValidationService

    expect(() => validateValidationServicePlugin(plugin)).toThrow(
      ServicePluginError
    )
  })
})

describe('validateLookupServicePlugin', () => {
  it('validates valid lookup service', () => {
    const plugin: LookupService = {
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
    }

    expect(() => validateLookupServicePlugin(plugin)).not.toThrow()
  })

  it('rejects non-lookup type', () => {
    const plugin = createMockPlugin({ type: 'validation' }) as LookupService

    expect(() => validateLookupServicePlugin(plugin)).toThrow(
      ServicePluginError
    )
  })
})

describe('validateCustomServicePlugin', () => {
  it('validates valid custom service', () => {
    const plugin: CustomService = {
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
    }

    expect(() => validateCustomServicePlugin(plugin)).not.toThrow()
  })

  it('rejects non-custom type', () => {
    const plugin = createMockPlugin({ type: 'validation' }) as CustomService

    expect(() => validateCustomServicePlugin(plugin)).toThrow(
      ServicePluginError
    )
  })
})

describe('validateRetryConfig', () => {
  const validRetryConfig: RetryConfig = {
    maxAttempts: 3,
    initialDelayMs: 100,
    backoffMultiplier: 2,
    maxDelayMs: 5000,
  }

  it('validates valid retry config', () => {
    expect(() => validateRetryConfig(validRetryConfig)).not.toThrow()
  })

  it('validates config with retryOn', () => {
    expect(() =>
      validateRetryConfig({
        ...validRetryConfig,
        retryOn: ['timeout', 'network', 'server', 'all'],
      })
    ).not.toThrow()
  })

  it('rejects null config', () => {
    expect(() => validateRetryConfig(null as unknown as RetryConfig)).toThrow(
      ServiceConfigurationError
    )
  })

  it('rejects non-integer maxAttempts', () => {
    expect(() =>
      validateRetryConfig({ ...validRetryConfig, maxAttempts: 3.5 })
    ).toThrow(ServiceConfigurationError)

    expect(() =>
      validateRetryConfig({
        ...validRetryConfig,
        maxAttempts: 'three' as unknown as number,
      })
    ).toThrow(ServiceConfigurationError)
  })

  it('rejects maxAttempts less than 1', () => {
    expect(() =>
      validateRetryConfig({ ...validRetryConfig, maxAttempts: 0 })
    ).toThrow(ServiceConfigurationError)
  })

  it('rejects negative initialDelayMs', () => {
    expect(() =>
      validateRetryConfig({ ...validRetryConfig, initialDelayMs: -100 })
    ).toThrow(ServiceConfigurationError)
  })

  it('rejects non-number initialDelayMs', () => {
    expect(() =>
      validateRetryConfig({
        ...validRetryConfig,
        initialDelayMs: '100' as unknown as number,
      })
    ).toThrow(ServiceConfigurationError)
  })

  it('rejects backoffMultiplier less than 1', () => {
    expect(() =>
      validateRetryConfig({ ...validRetryConfig, backoffMultiplier: 0.5 })
    ).toThrow(ServiceConfigurationError)
  })

  it('rejects non-number backoffMultiplier', () => {
    expect(() =>
      validateRetryConfig({
        ...validRetryConfig,
        backoffMultiplier: 'two' as unknown as number,
      })
    ).toThrow(ServiceConfigurationError)
  })

  it('rejects maxDelayMs less than initialDelayMs', () => {
    expect(() =>
      validateRetryConfig({ ...validRetryConfig, maxDelayMs: 50 })
    ).toThrow(ServiceConfigurationError)
  })

  it('rejects non-array retryOn', () => {
    expect(() =>
      validateRetryConfig({
        ...validRetryConfig,
        retryOn: 'timeout' as unknown as [],
      })
    ).toThrow(ServiceConfigurationError)
  })

  it('rejects invalid retryOn values', () => {
    expect(() =>
      validateRetryConfig({
        ...validRetryConfig,
        retryOn: ['timeout', 'invalid' as 'timeout'],
      })
    ).toThrow(ServiceConfigurationError)
  })
})

describe('validateCacheConfig', () => {
  const validCacheConfig: CacheConfig = {
    enabled: true,
    ttlSeconds: 300,
  }

  it('validates valid cache config', () => {
    expect(() => validateCacheConfig(validCacheConfig)).not.toThrow()
  })

  it('validates config with optional properties', () => {
    expect(() =>
      validateCacheConfig({
        ...validCacheConfig,
        keyFn: (input) => JSON.stringify(input),
        staleOnError: true,
      })
    ).not.toThrow()
  })

  it('rejects null config', () => {
    expect(() => validateCacheConfig(null as unknown as CacheConfig)).toThrow(
      ServiceConfigurationError
    )
  })

  it('rejects non-boolean enabled', () => {
    expect(() =>
      validateCacheConfig({
        ...validCacheConfig,
        enabled: 'true' as unknown as boolean,
      })
    ).toThrow(ServiceConfigurationError)
  })

  it('rejects non-positive ttlSeconds', () => {
    expect(() =>
      validateCacheConfig({ ...validCacheConfig, ttlSeconds: 0 })
    ).toThrow(ServiceConfigurationError)

    expect(() =>
      validateCacheConfig({ ...validCacheConfig, ttlSeconds: -100 })
    ).toThrow(ServiceConfigurationError)
  })

  it('rejects non-number ttlSeconds', () => {
    expect(() =>
      validateCacheConfig({
        ...validCacheConfig,
        ttlSeconds: '300' as unknown as number,
      })
    ).toThrow(ServiceConfigurationError)
  })

  it('rejects non-function keyFn', () => {
    expect(() =>
      validateCacheConfig({
        ...validCacheConfig,
        keyFn: 'not a function' as unknown as () => string,
      })
    ).toThrow(ServiceConfigurationError)
  })

  it('rejects non-boolean staleOnError', () => {
    expect(() =>
      validateCacheConfig({
        ...validCacheConfig,
        staleOnError: 'true' as unknown as boolean,
      })
    ).toThrow(ServiceConfigurationError)
  })
})

describe('validateCircuitBreakerConfig', () => {
  const validConfig: CircuitBreakerConfig = {
    failureThreshold: 5,
    resetTimeoutMs: 30000,
    successThreshold: 2,
    failureWindowMs: 60000,
  }

  it('validates valid circuit breaker config', () => {
    expect(() => validateCircuitBreakerConfig(validConfig)).not.toThrow()
  })

  it('rejects null config', () => {
    expect(() =>
      validateCircuitBreakerConfig(null as unknown as CircuitBreakerConfig)
    ).toThrow(ServiceConfigurationError)
  })

  it('rejects non-integer failureThreshold', () => {
    expect(() =>
      validateCircuitBreakerConfig({ ...validConfig, failureThreshold: 5.5 })
    ).toThrow(ServiceConfigurationError)
  })

  it('rejects failureThreshold less than 1', () => {
    expect(() =>
      validateCircuitBreakerConfig({ ...validConfig, failureThreshold: 0 })
    ).toThrow(ServiceConfigurationError)
  })

  it('rejects non-positive resetTimeoutMs', () => {
    expect(() =>
      validateCircuitBreakerConfig({ ...validConfig, resetTimeoutMs: 0 })
    ).toThrow(ServiceConfigurationError)
  })

  it('rejects non-integer successThreshold', () => {
    expect(() =>
      validateCircuitBreakerConfig({ ...validConfig, successThreshold: 2.5 })
    ).toThrow(ServiceConfigurationError)
  })

  it('rejects successThreshold less than 1', () => {
    expect(() =>
      validateCircuitBreakerConfig({ ...validConfig, successThreshold: 0 })
    ).toThrow(ServiceConfigurationError)
  })

  it('rejects non-positive failureWindowMs', () => {
    expect(() =>
      validateCircuitBreakerConfig({ ...validConfig, failureWindowMs: -1000 })
    ).toThrow(ServiceConfigurationError)
  })
})

describe('validateServiceConfig', () => {
  it('validates valid service config', () => {
    const config = createMockServiceConfig()
    expect(() => validateServiceConfig(config)).not.toThrow()
  })

  it('rejects null config', () => {
    expect(() =>
      validateServiceConfig(null as unknown as ServiceConfig)
    ).toThrow(ServiceConfigurationError)
  })

  it('rejects missing executionPoint', () => {
    expect(() =>
      validateServiceConfig(
        createMockServiceConfig({
          executionPoint: undefined as unknown as 'pre-match',
        })
      )
    ).toThrow(ServiceConfigurationError)
  })

  it('rejects invalid executionPoint', () => {
    expect(() =>
      validateServiceConfig(
        createMockServiceConfig({ executionPoint: 'invalid' as 'pre-match' })
      )
    ).toThrow(ServiceConfigurationError)
  })

  it('validates all execution points', () => {
    for (const point of ['pre-match', 'post-match', 'both'] as const) {
      expect(() =>
        validateServiceConfig(
          createMockServiceConfig({ executionPoint: point })
        )
      ).not.toThrow()
    }
  })

  it('rejects missing onFailure', () => {
    expect(() =>
      validateServiceConfig(
        createMockServiceConfig({
          onFailure: undefined as unknown as 'continue',
        })
      )
    ).toThrow(ServiceConfigurationError)
  })

  it('rejects invalid onFailure', () => {
    expect(() =>
      validateServiceConfig(
        createMockServiceConfig({ onFailure: 'invalid' as 'continue' })
      )
    ).toThrow(ServiceConfigurationError)
  })

  it('validates all onFailure behaviors', () => {
    for (const behavior of ['reject', 'continue', 'flag'] as const) {
      expect(() =>
        validateServiceConfig(createMockServiceConfig({ onFailure: behavior }))
      ).not.toThrow()
    }
  })

  it('rejects invalid onInvalid', () => {
    expect(() =>
      validateServiceConfig(
        createMockServiceConfig({ onInvalid: 'invalid' as 'continue' })
      )
    ).toThrow(ServiceConfigurationError)
  })

  it('validates all onInvalid behaviors', () => {
    for (const behavior of ['reject', 'continue', 'flag'] as const) {
      expect(() =>
        validateServiceConfig(createMockServiceConfig({ onInvalid: behavior }))
      ).not.toThrow()
    }
  })

  it('rejects invalid onNotFound', () => {
    expect(() =>
      validateServiceConfig(
        createMockServiceConfig({ onNotFound: 'invalid' as 'continue' })
      )
    ).toThrow(ServiceConfigurationError)
  })

  it('validates all onNotFound behaviors', () => {
    for (const behavior of ['continue', 'flag'] as const) {
      expect(() =>
        validateServiceConfig(createMockServiceConfig({ onNotFound: behavior }))
      ).not.toThrow()
    }
  })

  it('rejects negative timeout', () => {
    expect(() =>
      validateServiceConfig(createMockServiceConfig({ timeout: -1000 }))
    ).toThrow(ServiceConfigurationError)

    expect(() =>
      validateServiceConfig(createMockServiceConfig({ timeout: 0 }))
    ).toThrow(ServiceConfigurationError)
  })

  it('rejects non-number timeout', () => {
    expect(() =>
      validateServiceConfig(
        createMockServiceConfig({ timeout: '5000' as unknown as number })
      )
    ).toThrow(ServiceConfigurationError)
  })

  it('rejects non-integer priority', () => {
    expect(() =>
      validateServiceConfig(createMockServiceConfig({ priority: 1.5 }))
    ).toThrow(ServiceConfigurationError)
  })

  it('rejects non-boolean required', () => {
    expect(() =>
      validateServiceConfig(
        createMockServiceConfig({ required: 'true' as unknown as boolean })
      )
    ).toThrow(ServiceConfigurationError)
  })

  it('rejects non-array fields', () => {
    expect(() =>
      validateServiceConfig(
        createMockServiceConfig({ fields: 'email' as unknown as string[] })
      )
    ).toThrow(ServiceConfigurationError)
  })

  it('rejects empty field strings', () => {
    expect(() =>
      validateServiceConfig(createMockServiceConfig({ fields: ['email', ''] }))
    ).toThrow(ServiceConfigurationError)
  })

  it('rejects non-object fieldMapping', () => {
    expect(() =>
      validateServiceConfig(
        createMockServiceConfig({
          fieldMapping: 'invalid' as unknown as Record<string, string>,
        })
      )
    ).toThrow(ServiceConfigurationError)
  })

  it('rejects empty fieldMapping values', () => {
    expect(() =>
      validateServiceConfig(
        createMockServiceConfig({ fieldMapping: { 'api.field': '' } })
      )
    ).toThrow(ServiceConfigurationError)
  })

  it('rejects non-function resultPredicate', () => {
    expect(() =>
      validateServiceConfig(
        createMockServiceConfig({
          resultPredicate: 'invalid' as unknown as () => boolean,
        })
      )
    ).toThrow(ServiceConfigurationError)
  })

  it('rejects non-object customParams', () => {
    expect(() =>
      validateServiceConfig(
        createMockServiceConfig({
          customParams: 'invalid' as unknown as Record<string, unknown>,
        })
      )
    ).toThrow(ServiceConfigurationError)
  })

  it('validates nested retry config', () => {
    expect(() =>
      validateServiceConfig(
        createMockServiceConfig({
          retry: {
            maxAttempts: 0, // Invalid
            initialDelayMs: 100,
            backoffMultiplier: 2,
            maxDelayMs: 5000,
          },
        })
      )
    ).toThrow(ServiceConfigurationError)
  })

  it('validates nested cache config', () => {
    expect(() =>
      validateServiceConfig(
        createMockServiceConfig({
          cache: {
            enabled: true,
            ttlSeconds: -100, // Invalid
          },
        })
      )
    ).toThrow(ServiceConfigurationError)
  })
})

describe('validateServiceDefaults', () => {
  it('accepts undefined defaults', () => {
    expect(() =>
      validateServiceDefaults(undefined as unknown as object)
    ).not.toThrow()
  })

  it('validates valid defaults', () => {
    expect(() =>
      validateServiceDefaults({
        timeout: 5000,
        retry: {
          maxAttempts: 3,
          initialDelayMs: 100,
          backoffMultiplier: 2,
          maxDelayMs: 5000,
        },
        cache: {
          enabled: true,
          ttlSeconds: 300,
        },
        circuitBreaker: {
          failureThreshold: 5,
          resetTimeoutMs: 30000,
          successThreshold: 2,
          failureWindowMs: 60000,
        },
      })
    ).not.toThrow()
  })

  it('rejects invalid timeout', () => {
    expect(() => validateServiceDefaults({ timeout: -1000 })).toThrow(
      ServiceConfigurationError
    )
  })

  it('validates nested retry config', () => {
    expect(() =>
      validateServiceDefaults({
        retry: {
          maxAttempts: 0, // Invalid
          initialDelayMs: 100,
          backoffMultiplier: 2,
          maxDelayMs: 5000,
        },
      })
    ).toThrow(ServiceConfigurationError)
  })
})

describe('validateServicesConfig', () => {
  it('validates valid services config', () => {
    const config: ServicesConfig = {
      services: [createMockServiceConfig()],
    }
    expect(() => validateServicesConfig(config)).not.toThrow()
  })

  it('rejects null config', () => {
    expect(() =>
      validateServicesConfig(null as unknown as ServicesConfig)
    ).toThrow(ServiceConfigurationError)
  })

  it('rejects non-array services', () => {
    expect(() =>
      validateServicesConfig({ services: {} as unknown as ServiceConfig[] })
    ).toThrow(ServiceConfigurationError)
  })

  it('rejects duplicate service names', () => {
    expect(() =>
      validateServicesConfig({
        services: [
          createMockServiceConfig(),
          createMockServiceConfig(), // Same plugin name
        ],
      })
    ).toThrow(ServiceConfigurationError)
  })

  it('validates each service config', () => {
    expect(() =>
      validateServicesConfig({
        services: [
          createMockServiceConfig({ timeout: -1 }), // Invalid
        ],
      })
    ).toThrow(ServiceConfigurationError)
  })

  it('validates cachingEnabled is boolean', () => {
    expect(() =>
      validateServicesConfig({
        services: [],
        cachingEnabled: 'true' as unknown as boolean,
      })
    ).toThrow(ServiceConfigurationError)
  })

  it('validates executionOrder is array', () => {
    expect(() =>
      validateServicesConfig({
        services: [],
        executionOrder: 'svc1,svc2' as unknown as string[],
      })
    ).toThrow(ServiceConfigurationError)
  })

  it('validates executionOrder service names exist', () => {
    expect(() =>
      validateServicesConfig({
        services: [createMockServiceConfig()],
        executionOrder: ['unknown-service'],
      })
    ).toThrow(ServiceConfigurationError)
  })

  it('validates executionOrder with valid service names', () => {
    expect(() =>
      validateServicesConfig({
        services: [createMockServiceConfig()],
        executionOrder: ['test-plugin'],
      })
    ).not.toThrow()
  })
})

describe('Service type guards', () => {
  describe('isValidationService', () => {
    it('returns true for validation service', () => {
      expect(
        isValidationService(createMockPlugin({ type: 'validation' }))
      ).toBe(true)
    })

    it('returns false for other service types', () => {
      expect(isValidationService(createMockPlugin({ type: 'lookup' }))).toBe(
        false
      )
      expect(isValidationService(createMockPlugin({ type: 'custom' }))).toBe(
        false
      )
    })
  })

  describe('isLookupService', () => {
    it('returns true for lookup service', () => {
      expect(isLookupService(createMockPlugin({ type: 'lookup' }))).toBe(true)
    })

    it('returns false for other service types', () => {
      expect(isLookupService(createMockPlugin({ type: 'validation' }))).toBe(
        false
      )
      expect(isLookupService(createMockPlugin({ type: 'custom' }))).toBe(false)
    })
  })

  describe('isCustomService', () => {
    it('returns true for custom service', () => {
      expect(isCustomService(createMockPlugin({ type: 'custom' }))).toBe(true)
    })

    it('returns false for other service types', () => {
      expect(isCustomService(createMockPlugin({ type: 'validation' }))).toBe(
        false
      )
      expect(isCustomService(createMockPlugin({ type: 'lookup' }))).toBe(false)
    })
  })
})
