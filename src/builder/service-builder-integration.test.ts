/**
 * Integration tests for service builder with resolver builder
 */

import { describe, it, expect, vi } from 'vitest'
import { HaveWeMet } from './resolver-builder.js'
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

describe('ResolverBuilder service integration', () => {
  interface TestPerson {
    [key: string]: unknown
    firstName: string
    lastName: string
    email: string
    nhsNumber: string
    address: string
  }

  it('integrates services with resolver builder', () => {
    const validator = createMockValidationService('nhs-validator')
    const emailValidator = createMockValidationService('email-validator')
    const lookup = createMockLookupService('address-lookup')
    const custom = createMockCustomService('fraud-check')

    const resolver = HaveWeMet.create<TestPerson>()
      .schema((schema) =>
        schema
          .field('firstName', { type: 'name', component: 'first' })
          .field('lastName', { type: 'name', component: 'last' })
          .field('email', { type: 'email' })
          .field('nhsNumber', { type: 'string' })
          .field('address', { type: 'string' })
      )
      .matching((match) =>
        match
          .field('email')
          .strategy('exact')
          .weight(20)
          .field('firstName')
          .strategy('jaro-winkler')
          .weight(10)
          .threshold(0.85)
          .field('lastName')
          .strategy('jaro-winkler')
          .weight(10)
          .threshold(0.85)
          .thresholds({ noMatch: 20, definiteMatch: 45 })
      )
      .services((services) =>
        services
          .defaultTimeout(5000)
          .defaultRetry({
            maxAttempts: 3,
            initialDelayMs: 100,
            backoffMultiplier: 2,
            maxDelayMs: 1000,
          })
          .caching(true)
          .validate('nhsNumber')
          .using(validator)
          .onInvalid('reject')
          .required(true)
          .validate('email')
          .using(emailValidator)
          .onInvalid('flag')
          .cache({ enabled: true, ttlSeconds: 3600 })
          .lookup('address')
          .using(lookup)
          .mapFields({
            streetAddress: 'address',
          })
          .onNotFound('continue')
          .custom('fraud-check')
          .using(custom)
          .executeAt('post-match')
          .onResult((r) => (r.result as { riskScore: number }).riskScore < 0.7)
      )
      .build()

    // Verify resolver was built successfully
    expect(resolver).toBeDefined()
  })

  it('allows services configuration to be retrieved', () => {
    const validator = createMockValidationService()

    const builder = HaveWeMet.create<TestPerson>()
      .schema((schema) =>
        schema
          .field('firstName', { type: 'name', component: 'first' })
          .field('lastName', { type: 'name', component: 'last' })
          .field('email', { type: 'email' })
          .field('nhsNumber', { type: 'string' })
          .field('address', { type: 'string' })
      )
      .matching((match) =>
        match
          .field('email')
          .strategy('exact')
          .weight(20)
          .thresholds({ noMatch: 20, definiteMatch: 45 })
      )
      .services((services) =>
        services.validate('nhsNumber').using(validator).onInvalid('reject')
      )

    const servicesConfig = builder.getServicesConfig()

    expect(servicesConfig).toBeDefined()
    expect(servicesConfig?.services).toHaveLength(1)
    expect(servicesConfig?.services[0].plugin.name).toBe('test-validator')
  })

  it('builds resolver without services configured', () => {
    const resolver = HaveWeMet.create<TestPerson>()
      .schema((schema) =>
        schema
          .field('firstName', { type: 'name', component: 'first' })
          .field('lastName', { type: 'name', component: 'last' })
          .field('email', { type: 'email' })
          .field('nhsNumber', { type: 'string' })
          .field('address', { type: 'string' })
      )
      .matching((match) =>
        match
          .field('email')
          .strategy('exact')
          .weight(20)
          .thresholds({ noMatch: 20, definiteMatch: 45 })
      )
      .build()

    expect(resolver).toBeDefined()
  })

  it('handles services builder returning void', () => {
    const validator = createMockValidationService()

    // When the callback doesn't return anything
    const resolver = HaveWeMet.create<TestPerson>()
      .schema((schema) =>
        schema
          .field('firstName', { type: 'name', component: 'first' })
          .field('lastName', { type: 'name', component: 'last' })
          .field('email', { type: 'email' })
          .field('nhsNumber', { type: 'string' })
          .field('address', { type: 'string' })
      )
      .matching((match) =>
        match
          .field('email')
          .strategy('exact')
          .weight(20)
          .thresholds({ noMatch: 20, definiteMatch: 45 })
      )
      .services((services) => {
        services.validate('nhsNumber').using(validator).done()
        // No return
      })
      .build()

    expect(resolver).toBeDefined()
  })

  it('handles services builder returning ValidationServiceBuilder', () => {
    const validator = createMockValidationService()

    // When callback returns a ValidationServiceBuilder (no done() called)
    const builder = HaveWeMet.create<TestPerson>()
      .schema((schema) =>
        schema
          .field('firstName', { type: 'name', component: 'first' })
          .field('email', { type: 'email' })
          .field('nhsNumber', { type: 'string' })
          .field('address', { type: 'string' })
      )
      .matching((match) =>
        match
          .field('email')
          .strategy('exact')
          .weight(20)
          .thresholds({ noMatch: 20, definiteMatch: 45 })
      )
      .services((services) =>
        services.validate('nhsNumber').using(validator).onInvalid('reject')
      )

    const config = builder.getServicesConfig()
    expect(config?.services).toHaveLength(1)
    expect(config?.services[0].onInvalid).toBe('reject')
  })

  it('handles services builder returning LookupServiceBuilder', () => {
    const lookup = createMockLookupService()

    const builder = HaveWeMet.create<TestPerson>()
      .schema((schema) =>
        schema
          .field('firstName', { type: 'name', component: 'first' })
          .field('email', { type: 'email' })
          .field('nhsNumber', { type: 'string' })
          .field('address', { type: 'string' })
      )
      .matching((match) =>
        match
          .field('email')
          .strategy('exact')
          .weight(20)
          .thresholds({ noMatch: 20, definiteMatch: 45 })
      )
      .services((services) =>
        services.lookup('address').using(lookup).onNotFound('flag')
      )

    const config = builder.getServicesConfig()
    expect(config?.services).toHaveLength(1)
    expect(config?.services[0].onNotFound).toBe('flag')
  })

  it('handles services builder returning CustomServiceBuilder', () => {
    const custom = createMockCustomService()

    const builder = HaveWeMet.create<TestPerson>()
      .schema((schema) =>
        schema
          .field('firstName', { type: 'name', component: 'first' })
          .field('email', { type: 'email' })
          .field('nhsNumber', { type: 'string' })
          .field('address', { type: 'string' })
      )
      .matching((match) =>
        match
          .field('email')
          .strategy('exact')
          .weight(20)
          .thresholds({ noMatch: 20, definiteMatch: 45 })
      )
      .services((services) =>
        services.custom('fraud-check').using(custom).executeAt('post-match')
      )

    const config = builder.getServicesConfig()
    expect(config?.services).toHaveLength(1)
    expect(config?.services[0].executionPoint).toBe('post-match')
  })

  it('preserves all configuration options through build', () => {
    const validator = createMockValidationService('test-validator')

    const builder = HaveWeMet.create<TestPerson>()
      .schema((schema) =>
        schema
          .field('firstName', { type: 'name', component: 'first' })
          .field('lastName', { type: 'name', component: 'last' })
          .field('email', { type: 'email' })
          .field('nhsNumber', { type: 'string' })
          .field('address', { type: 'string' })
      )
      .matching((match) =>
        match
          .field('email')
          .strategy('exact')
          .weight(20)
          .thresholds({ noMatch: 20, definiteMatch: 45 })
      )
      .services((services) =>
        services
          .defaultTimeout(10000)
          .caching(false)
          .validate('nhsNumber')
          .using(validator)
          .timeout(3000)
          .retry({
            maxAttempts: 5,
            initialDelayMs: 200,
            backoffMultiplier: 1.5,
            maxDelayMs: 2000,
          })
          .cache({ enabled: true, ttlSeconds: 600 })
          .onInvalid('flag')
          .onFailure('continue')
          .required(false)
          .priority(50)
      )

    const config = builder.getServicesConfig()

    expect(config?.defaults?.timeout).toBe(10000)
    expect(config?.cachingEnabled).toBe(false)

    const service = config?.services[0]
    expect(service?.timeout).toBe(3000)
    expect(service?.retry?.maxAttempts).toBe(5)
    expect(service?.cache?.ttlSeconds).toBe(600)
    expect(service?.onInvalid).toBe('flag')
    expect(service?.onFailure).toBe('continue')
    expect(service?.required).toBe(false)
    expect(service?.priority).toBe(50)
  })
})
