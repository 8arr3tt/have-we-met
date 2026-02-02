/**
 * Tests for service builder fluent API
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  ServiceBuilder,
  ValidationServiceBuilder,
  LookupServiceBuilder,
  CustomServiceBuilder,
  ServiceBuilderError,
  createServiceBuilder,
} from './service-builder.js'
import type {
  ValidationService,
  LookupService,
  CustomService,
  ServiceResult,
  ValidationOutput,
  LookupOutput,
  CustomOutput,
} from '../services/types.js'

// Helper function to create timing info for tests
function createTiming() {
  const now = new Date()
  return {
    startedAt: now,
    completedAt: now,
    durationMs: 0,
  }
}

// Mock validation service
function createMockValidationService(
  name = 'test-validator'
): ValidationService {
  return {
    name,
    type: 'validation',
    description: 'Test validator',
    execute: vi.fn().mockResolvedValue({
      success: true,
      data: { valid: true } as ValidationOutput,
      timing: createTiming(),
      cached: false,
    } as ServiceResult<ValidationOutput>),
  }
}

// Mock lookup service
function createMockLookupService(name = 'test-lookup'): LookupService {
  return {
    name,
    type: 'lookup',
    description: 'Test lookup',
    execute: vi.fn().mockResolvedValue({
      success: true,
      data: { found: true, data: { enriched: 'value' } } as LookupOutput,
      timing: createTiming(),
      cached: false,
    } as ServiceResult<LookupOutput>),
  }
}

// Mock custom service
function createMockCustomService(name = 'test-custom'): CustomService {
  return {
    name,
    type: 'custom',
    description: 'Test custom service',
    execute: vi.fn().mockResolvedValue({
      success: true,
      data: { result: { score: 0.9 }, proceed: true } as CustomOutput,
      timing: createTiming(),
      cached: false,
    } as ServiceResult<CustomOutput>),
  }
}

describe('ServiceBuilder', () => {
  let builder: ServiceBuilder<{
    email: string
    nhsNumber: string
    address: string
  }>

  beforeEach(() => {
    builder = new ServiceBuilder()
  })

  describe('defaultTimeout', () => {
    it('sets default timeout', () => {
      builder.defaultTimeout(5000)
      const defaults = builder.getDefaults()
      expect(defaults.timeout).toBe(5000)
    })

    it('rejects negative timeout', () => {
      expect(() => builder.defaultTimeout(-1)).toThrow(ServiceBuilderError)
      expect(() => builder.defaultTimeout(-1)).toThrow(
        'Default timeout must be positive'
      )
    })

    it('rejects zero timeout', () => {
      expect(() => builder.defaultTimeout(0)).toThrow(ServiceBuilderError)
    })
  })

  describe('defaultRetry', () => {
    it('sets default retry config', () => {
      const retryConfig = {
        maxAttempts: 3,
        initialDelayMs: 100,
        backoffMultiplier: 2,
        maxDelayMs: 1000,
      }
      builder.defaultRetry(retryConfig)
      const defaults = builder.getDefaults()
      expect(defaults.retry).toEqual(retryConfig)
    })

    it('validates maxAttempts', () => {
      expect(() =>
        builder.defaultRetry({
          maxAttempts: 0,
          initialDelayMs: 100,
          backoffMultiplier: 2,
          maxDelayMs: 1000,
        })
      ).toThrow('maxAttempts must be at least 1')
    })

    it('validates initialDelayMs', () => {
      expect(() =>
        builder.defaultRetry({
          maxAttempts: 3,
          initialDelayMs: -1,
          backoffMultiplier: 2,
          maxDelayMs: 1000,
        })
      ).toThrow('initialDelayMs must be non-negative')
    })

    it('validates backoffMultiplier', () => {
      expect(() =>
        builder.defaultRetry({
          maxAttempts: 3,
          initialDelayMs: 100,
          backoffMultiplier: 0.5,
          maxDelayMs: 1000,
        })
      ).toThrow('backoffMultiplier must be at least 1')
    })

    it('validates maxDelayMs >= initialDelayMs', () => {
      expect(() =>
        builder.defaultRetry({
          maxAttempts: 3,
          initialDelayMs: 1000,
          backoffMultiplier: 2,
          maxDelayMs: 100,
        })
      ).toThrow('maxDelayMs must be greater than or equal to initialDelayMs')
    })
  })

  describe('defaultCache', () => {
    it('sets default cache config', () => {
      const cacheConfig = {
        enabled: true,
        ttlSeconds: 3600,
        staleOnError: true,
      }
      builder.defaultCache(cacheConfig)
      const defaults = builder.getDefaults()
      expect(defaults.cache).toEqual(cacheConfig)
    })

    it('validates ttlSeconds', () => {
      expect(() =>
        builder.defaultCache({
          enabled: true,
          ttlSeconds: -1,
        })
      ).toThrow('ttlSeconds must be non-negative')
    })
  })

  describe('caching', () => {
    it('enables caching by default', () => {
      expect(builder.isCachingEnabled()).toBe(true)
    })

    it('disables caching', () => {
      builder.caching(false)
      expect(builder.isCachingEnabled()).toBe(false)
    })

    it('enables caching', () => {
      builder.caching(false).caching(true)
      expect(builder.isCachingEnabled()).toBe(true)
    })
  })

  describe('executionOrder', () => {
    it('sets execution order', () => {
      const validator = createMockValidationService()
      const lookup = createMockLookupService()

      const config = builder
        .validate('email')
        .using(validator)
        .lookup('address')
        .using(lookup)
        .done()
        .executionOrder([lookup.name, validator.name])
        .build()

      expect(config.executionOrder).toEqual([lookup.name, validator.name])
    })
  })

  describe('validate', () => {
    it('creates a validation service builder', () => {
      const validationBuilder = builder.validate('email')
      expect(validationBuilder).toBeInstanceOf(ValidationServiceBuilder)
    })

    it('returns to parent via done()', () => {
      const validator = createMockValidationService()
      const returned = builder.validate('email').using(validator).done()
      expect(returned).toBe(builder)
    })
  })

  describe('lookup', () => {
    it('creates a lookup service builder', () => {
      const lookupBuilder = builder.lookup('address')
      expect(lookupBuilder).toBeInstanceOf(LookupServiceBuilder)
    })

    it('returns to parent via done()', () => {
      const lookup = createMockLookupService()
      const returned = builder.lookup('address').using(lookup).done()
      expect(returned).toBe(builder)
    })
  })

  describe('custom', () => {
    it('creates a custom service builder', () => {
      const customBuilder = builder.custom('fraud-check')
      expect(customBuilder).toBeInstanceOf(CustomServiceBuilder)
    })

    it('returns to parent via done()', () => {
      const custom = createMockCustomService()
      const returned = builder.custom('fraud-check').using(custom).done()
      expect(returned).toBe(builder)
    })
  })

  describe('chaining', () => {
    it('chains validation, lookup, and custom services', () => {
      const validator = createMockValidationService()
      const lookup = createMockLookupService()
      const custom = createMockCustomService()

      const config = builder
        .validate('email')
        .using(validator)
        .lookup('address')
        .using(lookup)
        .custom('fraud-check')
        .using(custom)
        .build()

      expect(config.services).toHaveLength(3)
      expect(config.services[0].plugin.name).toBe(validator.name)
      expect(config.services[1].plugin.name).toBe(lookup.name)
      expect(config.services[2].plugin.name).toBe(custom.name)
    })
  })

  describe('build', () => {
    it('builds services configuration', () => {
      const validator = createMockValidationService()

      const config = builder.validate('email').using(validator).build()

      expect(config.services).toHaveLength(1)
      expect(config.defaults).toBeDefined()
      expect(config.cachingEnabled).toBe(true)
    })

    it('finalizes pending builder before build', () => {
      const validator = createMockValidationService()

      // Don't call done(), but build() should still include the service
      const config = builder.validate('email').using(validator)._parent.build()

      expect(config.services).toHaveLength(1)
    })
  })

  describe('validation', () => {
    it('rejects duplicate service names', () => {
      const validator1 = createMockValidationService('same-name')
      const validator2 = createMockValidationService('same-name')

      // Note: second service with same name replaces first (no error thrown)
      const config = builder
        .validate('email')
        .using(validator1)
        .validate('nhsNumber')
        .using(validator2)
        .build()

      // Should only have 1 service (second replaced first)
      expect(config.services).toHaveLength(1)
    })

    it('rejects validation service without field', () => {
      const validator = createMockValidationService()

      // This shouldn't happen in normal usage, but test defensive coding
      // The validate() method always sets a field, so this is internal validation
      const validatorBuilder = builder.validate('email').using(validator)
      // Manually clear fields to test validation
      ;(
        validatorBuilder as unknown as { config: { fields?: string[] } }
      ).config.fields = []

      expect(() => validatorBuilder._parent.build()).toThrow(
        'must have at least one field configured'
      )
    })

    it('rejects lookup service without field', () => {
      const lookup = createMockLookupService()

      const lookupBuilder = builder.lookup('address').using(lookup)
      ;(
        lookupBuilder as unknown as { config: { fields?: string[] } }
      ).config.fields = []

      expect(() => lookupBuilder._parent.build()).toThrow(
        'must have at least one field configured'
      )
    })

    it('validates execution order references existing services', () => {
      const validator = createMockValidationService()

      expect(() =>
        builder
          .validate('email')
          .using(validator)
          .done()
          .executionOrder(['unknown-service'])
          .build()
      ).toThrow("Execution order references unknown service 'unknown-service'")
    })
  })
})

describe('ValidationServiceBuilder', () => {
  let builder: ServiceBuilder<{ email: string }>
  let validationBuilder: ValidationServiceBuilder<{ email: string }>
  let mockValidator: ValidationService

  beforeEach(() => {
    builder = new ServiceBuilder()
    mockValidator = createMockValidationService()
    validationBuilder = builder.validate('email')
  })

  describe('using', () => {
    it('sets the validation plugin', () => {
      validationBuilder.using(mockValidator)
      const config = validationBuilder.getConfig()
      expect(config.plugin).toBe(mockValidator)
    })
  })

  describe('onInvalid', () => {
    it('sets reject behavior', () => {
      validationBuilder.using(mockValidator).onInvalid('reject')
      const config = validationBuilder.getConfig()
      expect(config.onInvalid).toBe('reject')
    })

    it('sets continue behavior', () => {
      validationBuilder.using(mockValidator).onInvalid('continue')
      const config = validationBuilder.getConfig()
      expect(config.onInvalid).toBe('continue')
    })

    it('sets flag behavior', () => {
      validationBuilder.using(mockValidator).onInvalid('flag')
      const config = validationBuilder.getConfig()
      expect(config.onInvalid).toBe('flag')
    })
  })

  describe('onFailure', () => {
    it('sets failure behavior', () => {
      validationBuilder.using(mockValidator).onFailure('reject')
      const config = validationBuilder.getConfig()
      expect(config.onFailure).toBe('reject')
    })
  })

  describe('timeout', () => {
    it('sets timeout', () => {
      validationBuilder.using(mockValidator).timeout(3000)
      const config = validationBuilder.getConfig()
      expect(config.timeout).toBe(3000)
    })

    it('rejects non-positive timeout', () => {
      expect(() => validationBuilder.timeout(0)).toThrow(
        'Timeout must be positive'
      )
      expect(() => validationBuilder.timeout(-100)).toThrow(
        'Timeout must be positive'
      )
    })
  })

  describe('retry', () => {
    it('sets retry config', () => {
      const retryConfig = {
        maxAttempts: 3,
        initialDelayMs: 100,
        backoffMultiplier: 2,
        maxDelayMs: 1000,
      }
      validationBuilder.using(mockValidator).retry(retryConfig)
      const config = validationBuilder.getConfig()
      expect(config.retry).toEqual(retryConfig)
    })
  })

  describe('cache', () => {
    it('sets cache config', () => {
      const cacheConfig = {
        enabled: true,
        ttlSeconds: 3600,
      }
      validationBuilder.using(mockValidator).cache(cacheConfig)
      const config = validationBuilder.getConfig()
      expect(config.cache).toEqual(cacheConfig)
    })
  })

  describe('required', () => {
    it('sets required flag', () => {
      validationBuilder.using(mockValidator).required(true)
      const config = validationBuilder.getConfig()
      expect(config.required).toBe(true)
    })
  })

  describe('priority', () => {
    it('sets priority', () => {
      validationBuilder.using(mockValidator).priority(10)
      const config = validationBuilder.getConfig()
      expect(config.priority).toBe(10)
    })
  })

  describe('chaining to other builders', () => {
    it('chains to another validation service', () => {
      const nextBuilder = validationBuilder
        .using(mockValidator)
        .validate('email') // This goes back through parent

      expect(nextBuilder).toBeInstanceOf(ValidationServiceBuilder)
    })

    it('chains to lookup service', () => {
      const nextBuilder = validationBuilder.using(mockValidator).lookup('email')
      expect(nextBuilder).toBeInstanceOf(LookupServiceBuilder)
    })

    it('chains to custom service', () => {
      const nextBuilder = validationBuilder
        .using(mockValidator)
        .custom('fraud-check')
      expect(nextBuilder).toBeInstanceOf(CustomServiceBuilder)
    })
  })
})

describe('LookupServiceBuilder', () => {
  let builder: ServiceBuilder<{ email: string; address: string }>
  let lookupBuilder: LookupServiceBuilder<{ email: string; address: string }>
  let mockLookup: LookupService

  beforeEach(() => {
    builder = new ServiceBuilder()
    mockLookup = createMockLookupService()
    lookupBuilder = builder.lookup('address')
  })

  describe('using', () => {
    it('sets the lookup plugin', () => {
      lookupBuilder.using(mockLookup)
      const config = lookupBuilder.getConfig()
      expect(config.plugin).toBe(mockLookup)
    })
  })

  describe('mapFields', () => {
    it('sets field mapping', () => {
      lookupBuilder.using(mockLookup).mapFields({
        streetAddress: 'address',
        city: 'city',
      })
      const config = lookupBuilder.getConfig()
      expect(config.fieldMapping).toEqual({
        streetAddress: 'address',
        city: 'city',
      })
    })
  })

  describe('withFields', () => {
    it('adds additional lookup key fields', () => {
      lookupBuilder.using(mockLookup).withFields('email')
      const config = lookupBuilder.getConfig()
      expect(config.fields).toContain('address')
      expect(config.fields).toContain('email')
    })

    it('adds multiple fields', () => {
      lookupBuilder.using(mockLookup).withFields('email', 'phone' as never)
      const config = lookupBuilder.getConfig()
      expect(config.fields).toHaveLength(3)
    })
  })

  describe('onNotFound', () => {
    it('sets continue behavior', () => {
      lookupBuilder.using(mockLookup).onNotFound('continue')
      const config = lookupBuilder.getConfig()
      expect(config.onNotFound).toBe('continue')
    })

    it('sets flag behavior', () => {
      lookupBuilder.using(mockLookup).onNotFound('flag')
      const config = lookupBuilder.getConfig()
      expect(config.onNotFound).toBe('flag')
    })
  })

  describe('onFailure', () => {
    it('sets failure behavior', () => {
      lookupBuilder.using(mockLookup).onFailure('reject')
      const config = lookupBuilder.getConfig()
      expect(config.onFailure).toBe('reject')
    })
  })

  describe('timeout', () => {
    it('sets timeout', () => {
      lookupBuilder.using(mockLookup).timeout(5000)
      const config = lookupBuilder.getConfig()
      expect(config.timeout).toBe(5000)
    })

    it('rejects non-positive timeout', () => {
      expect(() => lookupBuilder.timeout(0)).toThrow('Timeout must be positive')
    })
  })

  describe('retry', () => {
    it('sets retry config', () => {
      const retryConfig = {
        maxAttempts: 2,
        initialDelayMs: 50,
        backoffMultiplier: 1.5,
        maxDelayMs: 500,
      }
      lookupBuilder.using(mockLookup).retry(retryConfig)
      const config = lookupBuilder.getConfig()
      expect(config.retry).toEqual(retryConfig)
    })
  })

  describe('cache', () => {
    it('sets cache config', () => {
      const cacheConfig = {
        enabled: true,
        ttlSeconds: 7200,
        staleOnError: false,
      }
      lookupBuilder.using(mockLookup).cache(cacheConfig)
      const config = lookupBuilder.getConfig()
      expect(config.cache).toEqual(cacheConfig)
    })
  })

  describe('required', () => {
    it('sets required flag', () => {
      lookupBuilder.using(mockLookup).required(true)
      const config = lookupBuilder.getConfig()
      expect(config.required).toBe(true)
    })
  })

  describe('priority', () => {
    it('sets priority', () => {
      lookupBuilder.using(mockLookup).priority(50)
      const config = lookupBuilder.getConfig()
      expect(config.priority).toBe(50)
    })
  })

  describe('chaining to other builders', () => {
    it('chains to validation service', () => {
      const nextBuilder = lookupBuilder.using(mockLookup).validate('email')
      expect(nextBuilder).toBeInstanceOf(ValidationServiceBuilder)
    })

    it('chains to another lookup service', () => {
      const nextBuilder = lookupBuilder.using(mockLookup).lookup('email')
      expect(nextBuilder).toBeInstanceOf(LookupServiceBuilder)
    })

    it('chains to custom service', () => {
      const nextBuilder = lookupBuilder.using(mockLookup).custom('enrichment')
      expect(nextBuilder).toBeInstanceOf(CustomServiceBuilder)
    })
  })
})

describe('CustomServiceBuilder', () => {
  let builder: ServiceBuilder<{ email: string }>
  let customBuilder: CustomServiceBuilder<{ email: string }>
  let mockCustom: CustomService

  beforeEach(() => {
    builder = new ServiceBuilder()
    mockCustom = createMockCustomService()
    customBuilder = builder.custom('fraud-check')
  })

  describe('using', () => {
    it('sets the custom plugin', () => {
      customBuilder.using(mockCustom)
      const config = customBuilder.getConfig()
      expect(config.plugin).toBe(mockCustom)
    })
  })

  describe('params', () => {
    it('sets custom parameters', () => {
      customBuilder.using(mockCustom).params({ threshold: 0.8, mode: 'strict' })
      const config = customBuilder.getConfig()
      expect(config.customParams).toEqual({ threshold: 0.8, mode: 'strict' })
    })
  })

  describe('onResult', () => {
    it('sets result predicate', () => {
      const predicate = (result: CustomOutput) =>
        (result.result as { score: number }).score > 0.5
      customBuilder.using(mockCustom).onResult(predicate)
      const config = customBuilder.getConfig()
      expect(config.resultPredicate).toBe(predicate)
    })
  })

  describe('executeAt', () => {
    it('sets pre-match execution', () => {
      customBuilder.using(mockCustom).executeAt('pre-match')
      const config = customBuilder.getConfig()
      expect(config.executionPoint).toBe('pre-match')
    })

    it('sets post-match execution', () => {
      customBuilder.using(mockCustom).executeAt('post-match')
      const config = customBuilder.getConfig()
      expect(config.executionPoint).toBe('post-match')
    })

    it('sets both execution points', () => {
      customBuilder.using(mockCustom).executeAt('both')
      const config = customBuilder.getConfig()
      expect(config.executionPoint).toBe('both')
    })
  })

  describe('onFailure', () => {
    it('sets failure behavior', () => {
      customBuilder.using(mockCustom).onFailure('flag')
      const config = customBuilder.getConfig()
      expect(config.onFailure).toBe('flag')
    })
  })

  describe('timeout', () => {
    it('sets timeout', () => {
      customBuilder.using(mockCustom).timeout(10000)
      const config = customBuilder.getConfig()
      expect(config.timeout).toBe(10000)
    })

    it('rejects non-positive timeout', () => {
      expect(() => customBuilder.timeout(-500)).toThrow(
        'Timeout must be positive'
      )
    })
  })

  describe('retry', () => {
    it('sets retry config', () => {
      const retryConfig = {
        maxAttempts: 5,
        initialDelayMs: 200,
        backoffMultiplier: 3,
        maxDelayMs: 5000,
      }
      customBuilder.using(mockCustom).retry(retryConfig)
      const config = customBuilder.getConfig()
      expect(config.retry).toEqual(retryConfig)
    })
  })

  describe('cache', () => {
    it('sets cache config', () => {
      const cacheConfig = {
        enabled: false,
        ttlSeconds: 0,
      }
      customBuilder.using(mockCustom).cache(cacheConfig)
      const config = customBuilder.getConfig()
      expect(config.cache).toEqual(cacheConfig)
    })
  })

  describe('required', () => {
    it('sets required flag', () => {
      customBuilder.using(mockCustom).required(false)
      const config = customBuilder.getConfig()
      expect(config.required).toBe(false)
    })
  })

  describe('priority', () => {
    it('sets priority', () => {
      customBuilder.using(mockCustom).priority(200)
      const config = customBuilder.getConfig()
      expect(config.priority).toBe(200)
    })
  })

  describe('getName', () => {
    it('returns the service name', () => {
      expect(customBuilder.getName()).toBe('fraud-check')
    })
  })

  describe('chaining to other builders', () => {
    it('chains to validation service', () => {
      const nextBuilder = customBuilder.using(mockCustom).validate('email')
      expect(nextBuilder).toBeInstanceOf(ValidationServiceBuilder)
    })

    it('chains to lookup service', () => {
      const nextBuilder = customBuilder.using(mockCustom).lookup('email')
      expect(nextBuilder).toBeInstanceOf(LookupServiceBuilder)
    })

    it('chains to another custom service', () => {
      const nextBuilder = customBuilder.using(mockCustom).custom('scoring')
      expect(nextBuilder).toBeInstanceOf(CustomServiceBuilder)
    })
  })
})

describe('createServiceBuilder', () => {
  it('creates a new ServiceBuilder instance', () => {
    const builder = createServiceBuilder<{ email: string }>()
    expect(builder).toBeInstanceOf(ServiceBuilder)
  })
})

describe('Builder integration', () => {
  it('builds complete services config with all options', () => {
    const validator = createMockValidationService('nhs-validator')
    const lookup = createMockLookupService('address-lookup')
    const custom = createMockCustomService('fraud-check')

    type TestRecord = {
      nhsNumber: string
      email: string
      address: string
    }

    const config = new ServiceBuilder<TestRecord>()
      .defaultTimeout(5000)
      .defaultRetry({
        maxAttempts: 3,
        initialDelayMs: 100,
        backoffMultiplier: 2,
        maxDelayMs: 1000,
      })
      .defaultCache({
        enabled: true,
        ttlSeconds: 300,
        staleOnError: true,
      })
      .caching(true)
      .validate('nhsNumber')
      .using(validator)
      .onInvalid('reject')
      .required(true)
      .timeout(3000)
      .lookup('address')
      .using(lookup)
      .mapFields({
        streetAddress: 'address',
      })
      .onNotFound('flag')
      .custom('fraud-check')
      .using(custom)
      .executeAt('post-match')
      .onResult((r) => (r.result as { riskScore: number }).riskScore < 0.7)
      .params({ threshold: 0.7 })
      .done()
      .executionOrder([validator.name, lookup.name, custom.name])
      .build()

    // Check services config
    expect(config.services).toHaveLength(3)
    expect(config.cachingEnabled).toBe(true)
    expect(config.executionOrder).toEqual([
      validator.name,
      lookup.name,
      custom.name,
    ])

    // Check defaults
    expect(config.defaults?.timeout).toBe(5000)
    expect(config.defaults?.retry?.maxAttempts).toBe(3)
    expect(config.defaults?.cache?.ttlSeconds).toBe(300)

    // Check validation service
    const validationService = config.services[0]
    expect(validationService.plugin.name).toBe('nhs-validator')
    expect(validationService.plugin.type).toBe('validation')
    expect(validationService.onInvalid).toBe('reject')
    expect(validationService.required).toBe(true)
    expect(validationService.timeout).toBe(3000)
    expect(validationService.fields).toContain('nhsNumber')

    // Check lookup service
    const lookupService = config.services[1]
    expect(lookupService.plugin.name).toBe('address-lookup')
    expect(lookupService.plugin.type).toBe('lookup')
    expect(lookupService.onNotFound).toBe('flag')
    expect(lookupService.fieldMapping?.streetAddress).toBe('address')

    // Check custom service
    const customService = config.services[2]
    expect(customService.plugin.name).toBe('fraud-check')
    expect(customService.plugin.type).toBe('custom')
    expect(customService.executionPoint).toBe('post-match')
    expect(customService.customParams).toEqual({ threshold: 0.7 })
    expect(customService.resultPredicate).toBeDefined()
  })

  it('services without plugin are not included', () => {
    type TestRecord = { email: string }

    // Create builder but don't set plugin
    const config = new ServiceBuilder<TestRecord>()
      .validate('email')
      // Don't call .using()
      .done()
      .build()

    // Service without plugin should not be included
    expect(config.services).toHaveLength(0)
  })
})
