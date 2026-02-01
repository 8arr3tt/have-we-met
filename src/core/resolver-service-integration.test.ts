/**
 * Integration tests for resolver service integration
 * @module core/resolver-service-integration.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { HaveWeMet } from '../builder/resolver-builder.js'
import type {
  ValidationService,
  LookupService,
  CustomService,
  ServiceResult,
  ValidationOutput,
  LookupOutput,
  CustomOutput,
} from '../services/types.js'

function createTiming() {
  const now = new Date()
  return {
    startedAt: now,
    completedAt: now,
    durationMs: 1,
  }
}

function createMockValidationService(
  name: string,
  options: {
    valid?: boolean
    normalizedValue?: unknown
    invalidReason?: string
    shouldFail?: boolean
    errorMessage?: string
  } = {}
): ValidationService {
  const { valid = true, normalizedValue, invalidReason, shouldFail = false, errorMessage } = options

  return {
    name,
    type: 'validation',
    description: `Mock validation service: ${name}`,
    execute: vi.fn().mockImplementation(async () => {
      if (shouldFail) {
        throw new Error(errorMessage ?? 'Service execution failed')
      }
      return {
        success: true,
        data: {
          valid,
          details: {
            checks: [{ name: 'mock-check', passed: valid, message: 'Mock check' }],
            normalizedValue,
            confidence: valid ? 1.0 : 0.0,
          },
          invalidReason: valid ? undefined : invalidReason,
        } as ValidationOutput,
        timing: createTiming(),
        cached: false,
      } as ServiceResult<ValidationOutput>
    }),
  }
}

function createMockLookupService(
  name: string,
  options: {
    found?: boolean
    data?: Record<string, unknown>
    shouldFail?: boolean
    errorMessage?: string
  } = {}
): LookupService {
  const { found = true, data = {}, shouldFail = false, errorMessage } = options

  return {
    name,
    type: 'lookup',
    description: `Mock lookup service: ${name}`,
    execute: vi.fn().mockImplementation(async () => {
      if (shouldFail) {
        throw new Error(errorMessage ?? 'Lookup service failed')
      }
      return {
        success: true,
        data: {
          found,
          data: found ? data : undefined,
          matchQuality: found ? 'exact' : undefined,
          source: found ? { system: 'mock', recordId: 'mock-123' } : undefined,
        } as LookupOutput,
        timing: createTiming(),
        cached: false,
      } as ServiceResult<LookupOutput>
    }),
  }
}

function createMockCustomService(
  name: string,
  options: {
    proceed?: boolean
    scoreAdjustment?: number
    flags?: string[]
    result?: unknown
    shouldFail?: boolean
    errorMessage?: string
  } = {}
): CustomService {
  const {
    proceed = true,
    scoreAdjustment,
    flags,
    result = { status: 'ok' },
    shouldFail = false,
    errorMessage,
  } = options

  return {
    name,
    type: 'custom',
    description: `Mock custom service: ${name}`,
    execute: vi.fn().mockImplementation(async () => {
      if (shouldFail) {
        throw new Error(errorMessage ?? 'Custom service failed')
      }
      return {
        success: true,
        data: {
          result,
          proceed,
          scoreAdjustment,
          flags,
        } as CustomOutput,
        timing: createTiming(),
        cached: false,
      } as ServiceResult<CustomOutput>
    }),
  }
}

interface TestPerson {
  id?: string
  firstName: string
  lastName: string
  email: string
  phone?: string
  ssn?: string
}

describe('Resolver Service Integration', () => {
  describe('pre-match services', () => {
    it('executes validation service before matching', async () => {
      const validator = createMockValidationService('email-validator')

      const resolver = HaveWeMet.create<TestPerson>()
        .schema((schema) =>
          schema
            .field('firstName', { type: 'name', component: 'first' })
            .field('lastName', { type: 'name', component: 'last' })
            .field('email', { type: 'email' }),
        )
        .matching((match) =>
          match
            .field('email')
            .strategy('exact')
            .weight(20)
            .thresholds({ noMatch: 10, definiteMatch: 40 }),
        )
        .services((services) =>
          services
            .validate('email')
            .using(validator)
            .onInvalid('continue'),
        )
        .build()

      const candidateRecord = {
        firstName: 'John',
        lastName: 'Smith',
        email: 'john@example.com',
      }

      const existingRecords = [
        { firstName: 'John', lastName: 'Smith', email: 'john@example.com' },
        { firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com' },
      ]

      const result = await resolver.resolveWithServices(candidateRecord, existingRecords)

      expect(result.rejected).toBe(false)
      expect(result.serviceResults).toBeDefined()
      expect(result.serviceResults!['email-validator']).toBeDefined()
      expect(result.serviceResults!['email-validator'].success).toBe(true)
      expect(validator.execute).toHaveBeenCalled()
    })

    it('rejects record on validation failure when configured', async () => {
      const validator = createMockValidationService('email-validator', {
        valid: false,
        invalidReason: 'Invalid email format',
      })

      const resolver = HaveWeMet.create<TestPerson>()
        .schema((schema) =>
          schema
            .field('firstName', { type: 'name', component: 'first' })
            .field('lastName', { type: 'name', component: 'last' })
            .field('email', { type: 'email' }),
        )
        .matching((match) =>
          match
            .field('email')
            .strategy('exact')
            .weight(20)
            .thresholds({ noMatch: 10, definiteMatch: 40 }),
        )
        .services((services) =>
          services
            .validate('email')
            .using(validator)
            .onInvalid('reject')
            .required(true),
        )
        .build()

      const result = await resolver.resolveWithServices(
        { firstName: 'John', lastName: 'Smith', email: 'invalid-email' },
        [{ firstName: 'John', lastName: 'Smith', email: 'john@example.com' }],
      )

      expect(result.rejected).toBe(true)
      expect(result.rejectionReason).toContain('Invalid email format')
      expect(result.matches).toHaveLength(0)
    })

    it('continues on validation failure when configured', async () => {
      const validator = createMockValidationService('email-validator', {
        valid: false,
        invalidReason: 'Invalid email',
      })

      const resolver = HaveWeMet.create<TestPerson>()
        .schema((schema) =>
          schema
            .field('firstName', { type: 'name', component: 'first' })
            .field('lastName', { type: 'name', component: 'last' })
            .field('email', { type: 'email' }),
        )
        .matching((match) =>
          match
            .field('email')
            .strategy('exact')
            .weight(20)
            .thresholds({ noMatch: 10, definiteMatch: 40 }),
        )
        .services((services) =>
          services
            .validate('email')
            .using(validator)
            .onInvalid('continue'),
        )
        .build()

      const result = await resolver.resolveWithServices(
        { firstName: 'John', lastName: 'Smith', email: 'john@example.com' },
        [{ firstName: 'John', lastName: 'Smith', email: 'john@example.com' }],
      )

      expect(result.rejected).toBe(false)
      expect(result.matches.length).toBeGreaterThan(0)
    })

    it('adds flag on validation failure when configured', async () => {
      const validator = createMockValidationService('email-validator', {
        valid: false,
        invalidReason: 'Invalid email',
      })

      const resolver = HaveWeMet.create<TestPerson>()
        .schema((schema) =>
          schema
            .field('firstName', { type: 'name', component: 'first' })
            .field('lastName', { type: 'name', component: 'last' })
            .field('email', { type: 'email' }),
        )
        .matching((match) =>
          match
            .field('email')
            .strategy('exact')
            .weight(20)
            .thresholds({ noMatch: 10, definiteMatch: 40 }),
        )
        .services((services) =>
          services
            .validate('email')
            .using(validator)
            .onInvalid('flag'),
        )
        .build()

      const result = await resolver.resolveWithServices(
        { firstName: 'John', lastName: 'Smith', email: 'john@example.com' },
        [{ firstName: 'John', lastName: 'Smith', email: 'john@example.com' }],
      )

      expect(result.rejected).toBe(false)
      expect(result.serviceFlags).toContain('email-validator:invalid')
    })

    it('uses enriched data from lookup service for matching', async () => {
      const lookup = createMockLookupService('address-lookup', {
        found: true,
        data: {
          normalizedEmail: 'john@example.com',
          addressVerified: true,
        },
      })

      const resolver = HaveWeMet.create<TestPerson>()
        .schema((schema) =>
          schema
            .field('firstName', { type: 'name', component: 'first' })
            .field('lastName', { type: 'name', component: 'last' })
            .field('email', { type: 'email' }),
        )
        .matching((match) =>
          match
            .field('email')
            .strategy('exact')
            .weight(20)
            .thresholds({ noMatch: 10, definiteMatch: 40 }),
        )
        .services((services) =>
          services
            .lookup('email')
            .using(lookup)
            .mapFields({ normalizedEmail: 'email' })
            .onNotFound('continue'),
        )
        .build()

      const result = await resolver.resolveWithServices(
        { firstName: 'John', lastName: 'Smith', email: 'JOHN@EXAMPLE.COM' },
        [{ firstName: 'John', lastName: 'Smith', email: 'john@example.com' }],
      )

      expect(result.rejected).toBe(false)
      expect(lookup.execute).toHaveBeenCalled()
      // Enriched record should have the normalized email
      expect(result.enrichedRecord?.email).toBe('john@example.com')
    })

    it('includes enriched record in result', async () => {
      const lookup = createMockLookupService('enrichment-service', {
        found: true,
        data: {
          extraField: 'enriched-value',
        },
      })

      const resolver = HaveWeMet.create<TestPerson>()
        .schema((schema) =>
          schema
            .field('firstName', { type: 'name', component: 'first' })
            .field('lastName', { type: 'name', component: 'last' })
            .field('email', { type: 'email' }),
        )
        .matching((match) =>
          match
            .field('email')
            .strategy('exact')
            .weight(20)
            .thresholds({ noMatch: 10, definiteMatch: 40 }),
        )
        .services((services) =>
          services
            .lookup('email')
            .using(lookup)
            .mapFields({ extraField: 'extraField' }),
        )
        .build()

      const result = await resolver.resolveWithServices(
        { firstName: 'John', lastName: 'Smith', email: 'john@example.com' },
        [{ firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com' }],
      )

      expect(result.enrichedRecord).toBeDefined()
      expect((result.enrichedRecord as Record<string, unknown>)?.extraField).toBe('enriched-value')
    })
  })

  describe('post-match services', () => {
    it('executes custom service after matching', async () => {
      const customService = createMockCustomService('fraud-check', {
        proceed: true,
        result: { riskScore: 0.2 },
      })

      const resolver = HaveWeMet.create<TestPerson>()
        .schema((schema) =>
          schema
            .field('firstName', { type: 'name', component: 'first' })
            .field('lastName', { type: 'name', component: 'last' })
            .field('email', { type: 'email' }),
        )
        .matching((match) =>
          match
            .field('email')
            .strategy('exact')
            .weight(20)
            .thresholds({ noMatch: 10, definiteMatch: 40 }),
        )
        .services((services) =>
          services
            .custom('fraud-check')
            .using(customService)
            .executeAt('post-match'),
        )
        .build()

      const result = await resolver.resolveWithServices(
        { firstName: 'John', lastName: 'Smith', email: 'john@example.com' },
        [{ firstName: 'John', lastName: 'Smith', email: 'john@example.com' }],
      )

      expect(result.rejected).toBe(false)
      expect(customService.execute).toHaveBeenCalled()
      expect(result.serviceResults!['fraud-check']).toBeDefined()
    })

    it('can adjust match scores from post-match service', async () => {
      const customService = createMockCustomService('score-adjuster', {
        proceed: true,
        scoreAdjustment: 10,
        result: { reason: 'bonus for verified user' },
      })

      const resolver = HaveWeMet.create<TestPerson>()
        .schema((schema) =>
          schema
            .field('firstName', { type: 'name', component: 'first' })
            .field('lastName', { type: 'name', component: 'last' })
            .field('email', { type: 'email' }),
        )
        .matching((match) =>
          match
            .field('email')
            .strategy('exact')
            .weight(20)
            .thresholds({ noMatch: 10, definiteMatch: 40 }),
        )
        .services((services) =>
          services
            .custom('score-adjuster')
            .using(customService)
            .executeAt('post-match'),
        )
        .build()

      const result = await resolver.resolveWithServices(
        { firstName: 'John', lastName: 'Smith', email: 'john@example.com' },
        [{ firstName: 'John', lastName: 'Smith', email: 'john@example.com' }],
      )

      expect(result.rejected).toBe(false)
      // Score should be adjusted
      const originalScore = 20 // exact match on email with weight 20
      const adjustedScore = result.matches[0].score.totalScore
      expect(adjustedScore).toBe(originalScore + 10)
    })

    it('can reject based on post-match service result', async () => {
      const customService = createMockCustomService('fraud-detector', {
        proceed: false,
        result: { riskScore: 0.9, reason: 'High fraud risk' },
      })

      const resolver = HaveWeMet.create<TestPerson>()
        .schema((schema) =>
          schema
            .field('firstName', { type: 'name', component: 'first' })
            .field('lastName', { type: 'name', component: 'last' })
            .field('email', { type: 'email' }),
        )
        .matching((match) =>
          match
            .field('email')
            .strategy('exact')
            .weight(20)
            .thresholds({ noMatch: 10, definiteMatch: 40 }),
        )
        .services((services) =>
          services
            .custom('fraud-detector')
            .using(customService)
            .executeAt('post-match')
            .required(true),
        )
        .build()

      const result = await resolver.resolveWithServices(
        { firstName: 'John', lastName: 'Smith', email: 'john@example.com' },
        [{ firstName: 'John', lastName: 'Smith', email: 'john@example.com' }],
      )

      expect(result.rejected).toBe(true)
      expect(result.rejectionReason).toContain('proceed')
      expect(result.matches).toHaveLength(0)
    })

    it('receives match result in context for post-match services', async () => {
      let receivedInput: unknown

      const customService: CustomService = {
        name: 'context-checker',
        type: 'custom',
        description: 'Checks the context received',
        execute: vi.fn().mockImplementation(async (input) => {
          receivedInput = input
          return {
            success: true,
            data: { result: {}, proceed: true } as CustomOutput,
            timing: createTiming(),
            cached: false,
          }
        }),
      }

      const resolver = HaveWeMet.create<TestPerson>()
        .schema((schema) =>
          schema
            .field('firstName', { type: 'name', component: 'first' })
            .field('lastName', { type: 'name', component: 'last' })
            .field('email', { type: 'email' }),
        )
        .matching((match) =>
          match
            .field('email')
            .strategy('exact')
            .weight(20)
            .thresholds({ noMatch: 10, definiteMatch: 40 }),
        )
        .services((services) =>
          services
            .custom('context-checker')
            .using(customService)
            .executeAt('post-match'),
        )
        .build()

      await resolver.resolveWithServices(
        { firstName: 'John', lastName: 'Smith', email: 'john@example.com' },
        [{ firstName: 'John', lastName: 'Smith', email: 'john@example.com' }],
      )

      expect(customService.execute).toHaveBeenCalled()
      expect(receivedInput).toBeDefined()
    })
  })

  describe('service results', () => {
    it('includes all service results in resolution', async () => {
      const validator = createMockValidationService('validator-1')
      const lookup = createMockLookupService('lookup-1')
      const custom = createMockCustomService('custom-1')

      const resolver = HaveWeMet.create<TestPerson>()
        .schema((schema) =>
          schema
            .field('firstName', { type: 'name', component: 'first' })
            .field('lastName', { type: 'name', component: 'last' })
            .field('email', { type: 'email' }),
        )
        .matching((match) =>
          match
            .field('email')
            .strategy('exact')
            .weight(20)
            .thresholds({ noMatch: 10, definiteMatch: 40 }),
        )
        .services((services) =>
          services
            .validate('email')
            .using(validator)
            .lookup('firstName')
            .using(lookup)
            .custom('custom-1')
            .using(custom)
            .executeAt('post-match'),
        )
        .build()

      const result = await resolver.resolveWithServices(
        { firstName: 'John', lastName: 'Smith', email: 'john@example.com' },
        [{ firstName: 'John', lastName: 'Smith', email: 'john@example.com' }],
      )

      expect(result.serviceResults).toBeDefined()
      expect(Object.keys(result.serviceResults!)).toContain('validator-1')
      expect(Object.keys(result.serviceResults!)).toContain('lookup-1')
      expect(Object.keys(result.serviceResults!)).toContain('custom-1')
    })

    it('accumulates flags from multiple services', async () => {
      const custom1 = createMockCustomService('custom-1', {
        proceed: true,
        flags: ['flag-from-custom-1'],
      })
      const custom2 = createMockCustomService('custom-2', {
        proceed: true,
        flags: ['flag-from-custom-2', 'another-flag'],
      })

      const resolver = HaveWeMet.create<TestPerson>()
        .schema((schema) =>
          schema
            .field('firstName', { type: 'name', component: 'first' })
            .field('lastName', { type: 'name', component: 'last' })
            .field('email', { type: 'email' }),
        )
        .matching((match) =>
          match
            .field('email')
            .strategy('exact')
            .weight(20)
            .thresholds({ noMatch: 10, definiteMatch: 40 }),
        )
        .services((services) =>
          services
            .custom('custom-1')
            .using(custom1)
            .executeAt('pre-match')
            .custom('custom-2')
            .using(custom2)
            .executeAt('post-match'),
        )
        .build()

      const result = await resolver.resolveWithServices(
        { firstName: 'John', lastName: 'Smith', email: 'john@example.com' },
        [{ firstName: 'John', lastName: 'Smith', email: 'john@example.com' }],
      )

      expect(result.serviceFlags).toBeDefined()
      expect(result.serviceFlags).toContain('flag-from-custom-1')
      expect(result.serviceFlags).toContain('flag-from-custom-2')
      expect(result.serviceFlags).toContain('another-flag')
    })

    it('tracks service execution time', async () => {
      const validator = createMockValidationService('slow-validator')

      const resolver = HaveWeMet.create<TestPerson>()
        .schema((schema) =>
          schema
            .field('firstName', { type: 'name', component: 'first' })
            .field('lastName', { type: 'name', component: 'last' })
            .field('email', { type: 'email' }),
        )
        .matching((match) =>
          match
            .field('email')
            .strategy('exact')
            .weight(20)
            .thresholds({ noMatch: 10, definiteMatch: 40 }),
        )
        .services((services) =>
          services.validate('email').using(validator),
        )
        .build()

      const result = await resolver.resolveWithServices(
        { firstName: 'John', lastName: 'Smith', email: 'john@example.com' },
        [{ firstName: 'John', lastName: 'Smith', email: 'john@example.com' }],
      )

      expect(result.serviceExecutionTimeMs).toBeDefined()
      expect(result.serviceExecutionTimeMs).toBeGreaterThanOrEqual(0)
    })
  })

  describe('without services', () => {
    it('resolve() works without services', () => {
      const resolver = HaveWeMet.create<TestPerson>()
        .schema((schema) =>
          schema
            .field('firstName', { type: 'name', component: 'first' })
            .field('lastName', { type: 'name', component: 'last' })
            .field('email', { type: 'email' }),
        )
        .matching((match) =>
          match
            .field('email')
            .strategy('exact')
            .weight(20)
            .thresholds({ noMatch: 10, definiteMatch: 20 }),
        )
        .build()

      const results = resolver.resolve(
        { firstName: 'John', lastName: 'Smith', email: 'john@example.com' },
        [{ firstName: 'John', lastName: 'Smith', email: 'john@example.com' }],
      )

      expect(results).toHaveLength(1)
      expect(results[0].outcome).toBe('definite-match')
    })

    it('resolveWithServices() works without services configured', async () => {
      const resolver = HaveWeMet.create<TestPerson>()
        .schema((schema) =>
          schema
            .field('firstName', { type: 'name', component: 'first' })
            .field('lastName', { type: 'name', component: 'last' })
            .field('email', { type: 'email' }),
        )
        .matching((match) =>
          match
            .field('email')
            .strategy('exact')
            .weight(20)
            .thresholds({ noMatch: 10, definiteMatch: 20 }),
        )
        .build()

      const result = await resolver.resolveWithServices(
        { firstName: 'John', lastName: 'Smith', email: 'john@example.com' },
        [{ firstName: 'John', lastName: 'Smith', email: 'john@example.com' }],
      )

      expect(result.rejected).toBe(false)
      expect(result.matches).toHaveLength(1)
      expect(result.matches[0].outcome).toBe('definite-match')
      expect(result.serviceResults).toBeUndefined()
    })

    it('can skip services with skipServices option', async () => {
      const validator = createMockValidationService('should-not-run')

      const resolver = HaveWeMet.create<TestPerson>()
        .schema((schema) =>
          schema
            .field('firstName', { type: 'name', component: 'first' })
            .field('lastName', { type: 'name', component: 'last' })
            .field('email', { type: 'email' }),
        )
        .matching((match) =>
          match
            .field('email')
            .strategy('exact')
            .weight(20)
            .thresholds({ noMatch: 10, definiteMatch: 40 }),
        )
        .services((services) =>
          services.validate('email').using(validator),
        )
        .build()

      const result = await resolver.resolveWithServices(
        { firstName: 'John', lastName: 'Smith', email: 'john@example.com' },
        [{ firstName: 'John', lastName: 'Smith', email: 'john@example.com' }],
        { skipServices: true },
      )

      expect(validator.execute).not.toHaveBeenCalled()
      expect(result.rejected).toBe(false)
      expect(result.matches).toHaveLength(1)
    })
  })

  describe('service error handling', () => {
    it('handles service failures gracefully with onFailure: continue', async () => {
      const failingValidator = createMockValidationService('failing-validator', {
        shouldFail: true,
        errorMessage: 'Service is down',
      })

      const resolver = HaveWeMet.create<TestPerson>()
        .schema((schema) =>
          schema
            .field('firstName', { type: 'name', component: 'first' })
            .field('lastName', { type: 'name', component: 'last' })
            .field('email', { type: 'email' }),
        )
        .matching((match) =>
          match
            .field('email')
            .strategy('exact')
            .weight(20)
            .thresholds({ noMatch: 10, definiteMatch: 40 }),
        )
        .services((services) =>
          services
            .validate('email')
            .using(failingValidator)
            .onFailure('continue'),
        )
        .build()

      const result = await resolver.resolveWithServices(
        { firstName: 'John', lastName: 'Smith', email: 'john@example.com' },
        [{ firstName: 'John', lastName: 'Smith', email: 'john@example.com' }],
      )

      // Should continue despite service failure
      expect(result.rejected).toBe(false)
      expect(result.matches.length).toBeGreaterThan(0)
    })

    it('rejects on service failure with onFailure: reject and required: true', async () => {
      const failingValidator = createMockValidationService('failing-validator', {
        shouldFail: true,
        errorMessage: 'Service is down',
      })

      const resolver = HaveWeMet.create<TestPerson>()
        .schema((schema) =>
          schema
            .field('firstName', { type: 'name', component: 'first' })
            .field('lastName', { type: 'name', component: 'last' })
            .field('email', { type: 'email' }),
        )
        .matching((match) =>
          match
            .field('email')
            .strategy('exact')
            .weight(20)
            .thresholds({ noMatch: 10, definiteMatch: 40 }),
        )
        .services((services) =>
          services
            .validate('email')
            .using(failingValidator)
            .onFailure('reject')
            .required(true),
        )
        .build()

      const result = await resolver.resolveWithServices(
        { firstName: 'John', lastName: 'Smith', email: 'john@example.com' },
        [{ firstName: 'John', lastName: 'Smith', email: 'john@example.com' }],
      )

      expect(result.rejected).toBe(true)
      expect(result.rejectionReason).toContain('Service is down')
    })
  })

  describe('hasServices property', () => {
    it('returns false when no services configured', () => {
      const resolver = HaveWeMet.create<TestPerson>()
        .schema((schema) =>
          schema
            .field('firstName', { type: 'name', component: 'first' })
            .field('lastName', { type: 'name', component: 'last' })
            .field('email', { type: 'email' }),
        )
        .matching((match) =>
          match
            .field('email')
            .strategy('exact')
            .weight(20)
            .thresholds({ noMatch: 10, definiteMatch: 40 }),
        )
        .build()

      expect(resolver.hasServices).toBe(false)
    })

    it('returns true when services are configured', () => {
      const validator = createMockValidationService('test-validator')

      const resolver = HaveWeMet.create<TestPerson>()
        .schema((schema) =>
          schema
            .field('firstName', { type: 'name', component: 'first' })
            .field('lastName', { type: 'name', component: 'last' })
            .field('email', { type: 'email' }),
        )
        .matching((match) =>
          match
            .field('email')
            .strategy('exact')
            .weight(20)
            .thresholds({ noMatch: 10, definiteMatch: 40 }),
        )
        .services((services) =>
          services.validate('email').using(validator),
        )
        .build()

      expect(resolver.hasServices).toBe(true)
    })
  })

  describe('service health and circuit status', () => {
    it('can get service health status', async () => {
      const validator: ValidationService = {
        name: 'health-check-validator',
        type: 'validation',
        description: 'Validator with health check',
        execute: vi.fn().mockResolvedValue({
          success: true,
          data: { valid: true } as ValidationOutput,
          timing: createTiming(),
          cached: false,
        }),
        healthCheck: vi.fn().mockResolvedValue({
          healthy: true,
          checkedAt: new Date(),
        }),
      }

      const resolver = HaveWeMet.create<TestPerson>()
        .schema((schema) =>
          schema
            .field('firstName', { type: 'name', component: 'first' })
            .field('lastName', { type: 'name', component: 'last' })
            .field('email', { type: 'email' }),
        )
        .matching((match) =>
          match
            .field('email')
            .strategy('exact')
            .weight(20)
            .thresholds({ noMatch: 10, definiteMatch: 40 }),
        )
        .services((services) =>
          services.validate('email').using(validator),
        )
        .build()

      const healthStatus = await resolver.getServiceHealthStatus()

      expect(healthStatus['health-check-validator']).toBeDefined()
      expect(healthStatus['health-check-validator'].healthy).toBe(true)
    })

    it('throws when getting health status without services', async () => {
      const resolver = HaveWeMet.create<TestPerson>()
        .schema((schema) =>
          schema
            .field('firstName', { type: 'name', component: 'first' })
            .field('lastName', { type: 'name', component: 'last' })
            .field('email', { type: 'email' }),
        )
        .matching((match) =>
          match
            .field('email')
            .strategy('exact')
            .weight(20)
            .thresholds({ noMatch: 10, definiteMatch: 40 }),
        )
        .build()

      await expect(resolver.getServiceHealthStatus()).rejects.toThrow(
        'Services are not configured',
      )
    })

    it('can get circuit breaker status', () => {
      const validator = createMockValidationService('circuit-test-validator')

      const resolver = HaveWeMet.create<TestPerson>()
        .schema((schema) =>
          schema
            .field('firstName', { type: 'name', component: 'first' })
            .field('lastName', { type: 'name', component: 'last' })
            .field('email', { type: 'email' }),
        )
        .matching((match) =>
          match
            .field('email')
            .strategy('exact')
            .weight(20)
            .thresholds({ noMatch: 10, definiteMatch: 40 }),
        )
        .services((services) =>
          services.validate('email').using(validator),
        )
        .build()

      const circuitStatus = resolver.getServiceCircuitStatus()

      expect(circuitStatus['circuit-test-validator']).toBeDefined()
      expect(circuitStatus['circuit-test-validator'].state).toBe('closed')
    })

    it('throws when getting circuit status without services', () => {
      const resolver = HaveWeMet.create<TestPerson>()
        .schema((schema) =>
          schema
            .field('firstName', { type: 'name', component: 'first' })
            .field('lastName', { type: 'name', component: 'last' })
            .field('email', { type: 'email' }),
        )
        .matching((match) =>
          match
            .field('email')
            .strategy('exact')
            .weight(20)
            .thresholds({ noMatch: 10, definiteMatch: 40 }),
        )
        .build()

      expect(() => resolver.getServiceCircuitStatus()).toThrow(
        'Services are not configured',
      )
    })
  })

  describe('disposeServices', () => {
    it('disposes all services', async () => {
      const disposeFn = vi.fn()
      const validator: ValidationService = {
        name: 'disposable-validator',
        type: 'validation',
        execute: vi.fn().mockResolvedValue({
          success: true,
          data: { valid: true } as ValidationOutput,
          timing: createTiming(),
          cached: false,
        }),
        dispose: disposeFn,
      }

      const resolver = HaveWeMet.create<TestPerson>()
        .schema((schema) =>
          schema
            .field('firstName', { type: 'name', component: 'first' })
            .field('lastName', { type: 'name', component: 'last' })
            .field('email', { type: 'email' }),
        )
        .matching((match) =>
          match
            .field('email')
            .strategy('exact')
            .weight(20)
            .thresholds({ noMatch: 10, definiteMatch: 40 }),
        )
        .services((services) =>
          services.validate('email').using(validator),
        )
        .build()

      await resolver.disposeServices()

      expect(disposeFn).toHaveBeenCalled()
    })

    it('does nothing when no services configured', async () => {
      const resolver = HaveWeMet.create<TestPerson>()
        .schema((schema) =>
          schema
            .field('firstName', { type: 'name', component: 'first' })
            .field('lastName', { type: 'name', component: 'last' })
            .field('email', { type: 'email' }),
        )
        .matching((match) =>
          match
            .field('email')
            .strategy('exact')
            .weight(20)
            .thresholds({ noMatch: 10, definiteMatch: 40 }),
        )
        .build()

      // Should not throw
      await expect(resolver.disposeServices()).resolves.toBeUndefined()
    })
  })

  describe('empty records', () => {
    it('handles empty existing records', async () => {
      const validator = createMockValidationService('test-validator')

      const resolver = HaveWeMet.create<TestPerson>()
        .schema((schema) =>
          schema
            .field('firstName', { type: 'name', component: 'first' })
            .field('lastName', { type: 'name', component: 'last' })
            .field('email', { type: 'email' }),
        )
        .matching((match) =>
          match
            .field('email')
            .strategy('exact')
            .weight(20)
            .thresholds({ noMatch: 10, definiteMatch: 40 }),
        )
        .services((services) =>
          services.validate('email').using(validator),
        )
        .build()

      const result = await resolver.resolveWithServices(
        { firstName: 'John', lastName: 'Smith', email: 'john@example.com' },
        [],
      )

      expect(result.rejected).toBe(false)
      expect(result.matches).toHaveLength(0)
      // Pre-match services should still run
      expect(validator.execute).toHaveBeenCalled()
    })
  })
})
