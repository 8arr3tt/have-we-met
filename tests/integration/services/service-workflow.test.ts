import { describe, it, expect, beforeEach } from 'vitest'
import {
  createServiceExecutor,
  nhsNumberValidator,
  emailValidator,
  createMockLookup,
  createMockLookupWithData,
  createSuccessMock,
  stableHash,
  buildServiceContext,
} from '../../../src/services/index.js'
import { createServiceBuilder } from '../../../src/builder/service-builder.js'
import type {
  ServiceConfig,
  ServiceResult,
  ValidationOutput,
  LookupOutput,
  CustomOutput,
  CustomService,
  ServiceContext,
  HealthCheckResult,
} from '../../../src/services/index.js'
import type { ResolverConfig } from '../../../src/types/config.js'

interface PatientRecord {
  patientId?: string
  firstName: string
  lastName: string
  nhsNumber?: string
  email?: string
  dateOfBirth?: string
  address?: string
  city?: string
  postalCode?: string
}

function createResolverConfig(): ResolverConfig {
  return {
    schema: {
      patientId: { type: 'string' },
      firstName: { type: 'string' },
      lastName: { type: 'string' },
      nhsNumber: { type: 'string' },
      email: { type: 'string' },
      dateOfBirth: { type: 'string' },
      address: { type: 'string' },
      city: { type: 'string' },
      postalCode: { type: 'string' },
    },
    matchingRules: [],
    thresholds: { noMatch: 0.3, definiteMatch: 0.9 },
  }
}

function createFraudDetectionService(): CustomService {
  return {
    name: 'fraud-detection',
    type: 'custom',
    description: 'Detects potential fraud in records',

    async execute(input, _context): Promise<ServiceResult<CustomOutput>> {
      const startedAt = new Date()
      const { record, params } = input
      const threshold = (params?.riskThreshold as number) ?? 0.5

      // Simple risk score calculation
      let riskScore = 0
      const flags: string[] = []

      const email = String(record.email ?? '')
      if (email.includes('tempmail') || email.includes('throwaway')) {
        riskScore += 0.4
        flags.push('suspicious_email')
      }

      if (!record.firstName || !record.lastName) {
        riskScore += 0.2
        flags.push('missing_name')
      }

      const completedAt = new Date()
      return {
        success: true,
        data: {
          result: { riskScore, flags },
          proceed: riskScore < threshold,
          scoreAdjustment: riskScore < 0.3 ? 0.05 : riskScore > 0.5 ? -0.1 : 0,
          flags: flags.length > 0 ? flags : undefined,
        },
        timing: {
          startedAt,
          completedAt,
          durationMs: completedAt.getTime() - startedAt.getTime(),
        },
        cached: false,
      }
    },

    async healthCheck(): Promise<HealthCheckResult> {
      return { healthy: true, checkedAt: new Date() }
    },
  }
}

describe('Integration: Service Workflow', () => {
  let resolverConfig: ResolverConfig

  beforeEach(() => {
    resolverConfig = createResolverConfig()
  })

  describe('Validation Workflow', () => {
    it('validates record before matching', async () => {
      const servicesConfig = createServiceBuilder<PatientRecord>()
        .defaultTimeout(5000)
        .validate('nhsNumber')
          .using(nhsNumberValidator)
          .onInvalid('reject')
          .required(true)
        .build()

      const executor = createServiceExecutor({
        resolverConfig,
        defaults: servicesConfig.defaults,
      })

      for (const config of servicesConfig.services) {
        executor.register(config)
      }

      // Valid NHS number
      const validRecord: PatientRecord = {
        firstName: 'John',
        lastName: 'Smith',
        nhsNumber: '9434765919', // Valid checksum
      }

      const result = await executor.executePreMatch(validRecord)
      expect(result.proceed).toBe(true)
      expect(result.results['nhs-number-validator'].success).toBe(true)

      const nhsResult = result.results['nhs-number-validator'].data as ValidationOutput
      expect(nhsResult.valid).toBe(true)
      expect(nhsResult.details?.normalizedValue).toBe('9434765919')

      await executor.dispose()
    })

    it('rejects record on validation failure when configured', async () => {
      const servicesConfig = createServiceBuilder<PatientRecord>()
        .validate('nhsNumber')
          .using(nhsNumberValidator)
          .onInvalid('reject')
          .required(true)
        .build()

      const executor = createServiceExecutor({
        resolverConfig,
        defaults: servicesConfig.defaults,
      })

      for (const config of servicesConfig.services) {
        executor.register(config)
      }

      // Invalid NHS number
      const invalidRecord: PatientRecord = {
        firstName: 'Jane',
        lastName: 'Doe',
        nhsNumber: '1234567890', // Invalid checksum
      }

      const result = await executor.executePreMatch(invalidRecord)
      expect(result.proceed).toBe(false)
      expect(result.rejectionReason).toContain('Invalid NHS number checksum')
      expect(result.rejectedBy).toBe('nhs-number-validator')

      await executor.dispose()
    })

    it('continues on validation failure when configured to flag', async () => {
      const servicesConfig = createServiceBuilder<PatientRecord>()
        .validate('nhsNumber')
          .using(nhsNumberValidator)
          .onInvalid('flag')
          .required(false)
        .build()

      const executor = createServiceExecutor({
        resolverConfig,
        defaults: servicesConfig.defaults,
      })

      for (const config of servicesConfig.services) {
        executor.register(config)
      }

      const invalidRecord: PatientRecord = {
        firstName: 'Jane',
        lastName: 'Doe',
        nhsNumber: '1234567890',
      }

      const result = await executor.executePreMatch(invalidRecord)
      expect(result.proceed).toBe(true)
      expect(result.flags).toContain('nhs-number-validator:invalid')

      await executor.dispose()
    })

    it('validates multiple fields in sequence', async () => {
      const servicesConfig = createServiceBuilder<PatientRecord>()
        .validate('nhsNumber')
          .using(nhsNumberValidator)
          .onInvalid('flag')
        .validate('email')
          .using(emailValidator)
          .onInvalid('flag')
        .build()

      const executor = createServiceExecutor({
        resolverConfig,
        defaults: servicesConfig.defaults,
      })

      for (const config of servicesConfig.services) {
        executor.register(config)
      }

      const record: PatientRecord = {
        firstName: 'John',
        lastName: 'Smith',
        nhsNumber: '9434765919',
        email: 'john.smith@example.com',
      }

      const result = await executor.executePreMatch(record)
      expect(result.proceed).toBe(true)
      expect(Object.keys(result.results)).toHaveLength(2)
      expect(result.results['nhs-number-validator'].success).toBe(true)
      expect(result.results['email-validator'].success).toBe(true)

      await executor.dispose()
    })
  })

  describe('Enrichment Workflow', () => {
    it('enriches record with lookup data', async () => {
      const mockLookup = createMockLookupWithData([
        {
          input: { email: 'john@company.com' },
          output: {
            found: true,
            data: {
              firstName: 'John',
              lastName: 'Smith',
              company: 'Acme Corp',
            },
            matchQuality: 'exact',
          },
        },
      ])

      const servicesConfig = createServiceBuilder<PatientRecord>()
        .lookup('email')
          .using(mockLookup)
          .mapFields({
            firstName: 'firstName',
            lastName: 'lastName',
          })
          .onNotFound('continue')
        .build()

      const executor = createServiceExecutor({
        resolverConfig,
        defaults: servicesConfig.defaults,
      })

      for (const config of servicesConfig.services) {
        executor.register(config)
      }

      const record: PatientRecord = {
        firstName: '',
        lastName: '',
        email: 'john@company.com',
      }

      const result = await executor.executePreMatch(record)
      expect(result.proceed).toBe(true)
      expect(result.enrichedData?.firstName).toBe('John')
      expect(result.enrichedData?.lastName).toBe('Smith')

      await executor.dispose()
    })

    it('flags records when lookup returns not found', async () => {
      const mockLookup = createMockLookup({
        defaultResponse: { found: false },
      })

      const servicesConfig = createServiceBuilder<PatientRecord>()
        .lookup('email')
          .using(mockLookup)
          .onNotFound('flag')
        .build()

      const executor = createServiceExecutor({
        resolverConfig,
        defaults: servicesConfig.defaults,
      })

      for (const config of servicesConfig.services) {
        executor.register(config)
      }

      const record: PatientRecord = {
        firstName: 'Unknown',
        lastName: 'Person',
        email: 'unknown@example.com',
      }

      const result = await executor.executePreMatch(record)
      expect(result.proceed).toBe(true)
      expect(result.flags).toContain('mock-lookup:not-found')

      await executor.dispose()
    })

    it('uses enriched data for matching', async () => {
      const addressLookup = createSuccessMock({
        streetAddress: '123 Main Street',
        city: 'New York',
        postalCode: '10001',
      })

      const servicesConfig = createServiceBuilder<PatientRecord>()
        .lookup('address')
          .using(addressLookup)
          .mapFields({
            streetAddress: 'address',
            city: 'city',
            postalCode: 'postalCode',
          })
        .build()

      const executor = createServiceExecutor({
        resolverConfig,
        defaults: servicesConfig.defaults,
      })

      for (const config of servicesConfig.services) {
        executor.register(config)
      }

      const record: PatientRecord = {
        firstName: 'John',
        lastName: 'Smith',
        address: '123 main st',
      }

      const result = await executor.executePreMatch(record)
      expect(result.enrichedData?.address).toBe('123 Main Street')
      expect(result.enrichedData?.city).toBe('New York')
      expect(result.enrichedData?.postalCode).toBe('10001')

      await executor.dispose()
    })

    it('includes enriched record in result', async () => {
      const mockLookup = createSuccessMock({
        fullName: 'John Smith',
        verified: true,
      })

      const servicesConfig = createServiceBuilder<PatientRecord>()
        .lookup('email')
          .using(mockLookup)
          .mapFields({
            fullName: 'firstName', // Using fullName as firstName for demo
          })
        .build()

      const executor = createServiceExecutor({
        resolverConfig,
        defaults: servicesConfig.defaults,
      })

      for (const config of servicesConfig.services) {
        executor.register(config)
      }

      const record: PatientRecord = {
        firstName: '',
        lastName: 'Original',
        email: 'test@example.com',
      }

      const result = await executor.executePreMatch(record)
      expect(result.enrichedData).toBeDefined()
      expect(result.enrichedData?.firstName).toBe('John Smith')
      expect(result.enrichedData?.lastName).toBe('Original') // Unchanged

      await executor.dispose()
    })
  })

  describe('Custom Service Workflow', () => {
    it('executes custom post-match service', async () => {
      const fraudService = createFraudDetectionService()

      const servicesConfig = createServiceBuilder<PatientRecord>()
        .custom('fraudCheck')
          .using(fraudService)
          .params({ riskThreshold: 0.5 })
          .executeAt('post-match')
        .build()

      const executor = createServiceExecutor({
        resolverConfig,
        defaults: servicesConfig.defaults,
      })

      for (const config of servicesConfig.services) {
        executor.register(config)
      }

      const record: PatientRecord = {
        firstName: 'John',
        lastName: 'Smith',
        email: 'john@legitimate.com',
      }

      const mockMatchResult = {
        matchId: 'match-001',
        candidateId: 'candidate-001',
        score: 0.85,
        outcome: 'potential_match' as const,
        fieldScores: {},
        explanation: {
          summary: 'Test match',
          fieldContributions: [],
        },
        processingTimeMs: 10,
        calculatedAt: new Date(),
        debug: {},
      }

      const result = await executor.executePostMatch(record, mockMatchResult)
      expect(result.proceed).toBe(true)
      expect(result.results['fraud-detection'].success).toBe(true)

      const fraudResult = result.results['fraud-detection'].data as CustomOutput
      const resultData = fraudResult.result as { riskScore: number }
      expect(resultData.riskScore).toBeLessThan(0.5)

      await executor.dispose()
    })

    it('can adjust match scores', async () => {
      const fraudService = createFraudDetectionService()

      const servicesConfig = createServiceBuilder<PatientRecord>()
        .custom('fraudCheck')
          .using(fraudService)
          .params({ riskThreshold: 0.5 })
          .executeAt('post-match')
        .build()

      const executor = createServiceExecutor({
        resolverConfig,
        defaults: servicesConfig.defaults,
      })

      for (const config of servicesConfig.services) {
        executor.register(config)
      }

      const lowRiskRecord: PatientRecord = {
        firstName: 'John',
        lastName: 'Smith',
        email: 'john@company.com',
      }

      const mockMatchResult = {
        matchId: 'match-001',
        candidateId: 'candidate-001',
        score: 0.85,
        outcome: 'potential_match' as const,
        fieldScores: {},
        explanation: { summary: 'Test', fieldContributions: [] },
        processingTimeMs: 10,
        calculatedAt: new Date(),
        debug: {},
      }

      const result = await executor.executePostMatch(lowRiskRecord, mockMatchResult)
      expect(result.scoreAdjustments).toBeDefined()
      expect(result.scoreAdjustments?.[0]).toBe(0.05) // Low risk boost

      await executor.dispose()
    })

    it('can reject based on result predicate', async () => {
      const fraudService = createFraudDetectionService()

      const servicesConfig = createServiceBuilder<PatientRecord>()
        .custom('fraudCheck')
          .using(fraudService)
          .params({ riskThreshold: 0.3 })
          .executeAt('pre-match')
          .onResult((result: CustomOutput) => {
            const data = result.result as { riskScore: number }
            return data.riskScore < 0.3
          })
          .required(true)
        .build()

      const executor = createServiceExecutor({
        resolverConfig,
        defaults: servicesConfig.defaults,
      })

      for (const config of servicesConfig.services) {
        executor.register(config)
      }

      const suspiciousRecord: PatientRecord = {
        firstName: '',
        lastName: '',
        email: 'user@tempmail.com',
      }

      const result = await executor.executePreMatch(suspiciousRecord)
      expect(result.proceed).toBe(false)
      expect(result.rejectionReason).toContain('predicate returned false')

      await executor.dispose()
    })

    it('receives match result in context', async () => {
      let receivedMatchResult: unknown = null

      const customService: CustomService = {
        name: 'context-checker',
        type: 'custom',
        async execute(input, context): Promise<ServiceResult<CustomOutput>> {
          receivedMatchResult = context.matchResult
          return {
            success: true,
            data: { result: {}, proceed: true },
            timing: {
              startedAt: new Date(),
              completedAt: new Date(),
              durationMs: 0,
            },
            cached: false,
          }
        },
      }

      const servicesConfig = createServiceBuilder<PatientRecord>()
        .custom('contextCheck')
          .using(customService)
          .executeAt('post-match')
        .build()

      const executor = createServiceExecutor({
        resolverConfig,
        defaults: servicesConfig.defaults,
      })

      for (const config of servicesConfig.services) {
        executor.register(config)
      }

      const mockMatchResult = {
        matchId: 'match-abc',
        candidateId: 'candidate-xyz',
        score: 0.92,
        outcome: 'definite_match' as const,
        fieldScores: { firstName: 0.9, lastName: 0.95 },
        explanation: { summary: 'Strong match', fieldContributions: [] },
        processingTimeMs: 15,
        calculatedAt: new Date(),
        debug: {},
      }

      await executor.executePostMatch({ firstName: 'Test', lastName: 'User' }, mockMatchResult)

      expect(receivedMatchResult).toBeDefined()
      expect((receivedMatchResult as any).matchId).toBe('match-abc')
      expect((receivedMatchResult as any).score).toBe(0.92)

      await executor.dispose()
    })
  })

  describe('Combined Service Workflow', () => {
    it('validates then enriches then custom', async () => {
      const mockLookup = createSuccessMock({ verified: true })
      const fraudService = createFraudDetectionService()

      const servicesConfig = createServiceBuilder<PatientRecord>()
        .validate('nhsNumber')
          .using(nhsNumberValidator)
          .onInvalid('flag')
          .priority(1)
        .lookup('email')
          .using(mockLookup)
          .priority(2)
        .custom('fraudCheck')
          .using(fraudService)
          .priority(3)
        .build()

      const executor = createServiceExecutor({
        resolverConfig,
        defaults: servicesConfig.defaults,
      })

      for (const config of servicesConfig.services) {
        executor.register(config)
      }

      const record: PatientRecord = {
        firstName: 'John',
        lastName: 'Smith',
        nhsNumber: '9434765919',
        email: 'john@company.com',
      }

      const result = await executor.executePreMatch(record)
      expect(result.proceed).toBe(true)
      expect(Object.keys(result.results)).toHaveLength(3)
      expect(result.totalDurationMs).toBeGreaterThan(0)

      await executor.dispose()
    })

    it('includes all service results in resolution', async () => {
      const mockLookup = createSuccessMock({ enriched: true })
      const fraudService = createFraudDetectionService()

      const servicesConfig = createServiceBuilder<PatientRecord>()
        .validate('nhsNumber')
          .using(nhsNumberValidator)
          .onInvalid('flag')
        .lookup('email')
          .using(mockLookup)
        .custom('fraud')
          .using(fraudService)
        .build()

      const executor = createServiceExecutor({
        resolverConfig,
        defaults: servicesConfig.defaults,
      })

      for (const config of servicesConfig.services) {
        executor.register(config)
      }

      const record: PatientRecord = {
        firstName: 'John',
        lastName: 'Smith',
        nhsNumber: '9434765919',
        email: 'john@example.com',
      }

      const result = await executor.executePreMatch(record)

      expect(result.results['nhs-number-validator']).toBeDefined()
      expect(result.results['mock-lookup']).toBeDefined()
      expect(result.results['fraud-detection']).toBeDefined()

      // Check timing info
      for (const [, serviceResult] of Object.entries(result.results)) {
        expect(serviceResult.timing.durationMs).toBeGreaterThanOrEqual(0)
        expect(serviceResult.timing.startedAt).toBeInstanceOf(Date)
        expect(serviceResult.timing.completedAt).toBeInstanceOf(Date)
      }

      await executor.dispose()
    })

    it('handles service failures gracefully', async () => {
      const failingLookup = createMockLookup({
        failureRate: 1,
        failureError: 'network',
      })

      const servicesConfig = createServiceBuilder<PatientRecord>()
        .lookup('email')
          .using(failingLookup)
          .onFailure('flag') // Use 'flag' to add the failure flag
        .validate('nhsNumber')
          .using(nhsNumberValidator)
          .onInvalid('flag')
        .build()

      const executor = createServiceExecutor({
        resolverConfig,
        defaults: servicesConfig.defaults,
      })

      for (const config of servicesConfig.services) {
        executor.register(config)
      }

      const record: PatientRecord = {
        firstName: 'John',
        lastName: 'Smith',
        nhsNumber: '9434765919',
        email: 'john@example.com',
      }

      const result = await executor.executePreMatch(record)

      // Should still proceed because onFailure is 'flag' (not 'reject')
      expect(result.proceed).toBe(true)
      // Flags should include the failure flag
      expect(result.flags).toContain('mock-lookup:failed')
      // NHS validation should still succeed
      expect(result.results['nhs-number-validator'].success).toBe(true)

      await executor.dispose()
    })
  })

  describe('Service Health', () => {
    it('tracks service timing', async () => {
      const slowLookup = createMockLookup({
        latencyMs: 50,
        defaultResponse: { found: true },
      })

      const servicesConfig = createServiceBuilder<PatientRecord>()
        .lookup('email')
          .using(slowLookup)
        .build()

      const executor = createServiceExecutor({
        resolverConfig,
        defaults: servicesConfig.defaults,
      })

      for (const config of servicesConfig.services) {
        executor.register(config)
      }

      const result = await executor.executePreMatch({ firstName: 'Test', lastName: 'User', email: 'test@example.com' })

      expect(result.totalDurationMs).toBeGreaterThanOrEqual(50)
      expect(result.results['mock-lookup'].timing.durationMs).toBeGreaterThanOrEqual(50)

      await executor.dispose()
    })

    it('provides health status for services', async () => {
      const servicesConfig = createServiceBuilder<PatientRecord>()
        .validate('nhsNumber')
          .using(nhsNumberValidator)
        .build()

      const executor = createServiceExecutor({
        resolverConfig,
        defaults: servicesConfig.defaults,
      })

      for (const config of servicesConfig.services) {
        executor.register(config)
      }

      const healthStatus = await executor.getHealthStatus()
      expect(healthStatus['nhs-number-validator']).toBeDefined()
      expect(healthStatus['nhs-number-validator'].healthy).toBe(true)

      await executor.dispose()
    })

    it('provides circuit breaker status', async () => {
      const servicesConfig = createServiceBuilder<PatientRecord>()
        .validate('nhsNumber')
          .using(nhsNumberValidator)
        .build()

      const executor = createServiceExecutor({
        resolverConfig,
        defaults: servicesConfig.defaults,
      })

      for (const config of servicesConfig.services) {
        executor.register(config)
      }

      const circuitStatus = executor.getCircuitStatus()
      expect(circuitStatus['nhs-number-validator']).toBeDefined()
      expect(circuitStatus['nhs-number-validator'].state).toBe('closed')
      expect(circuitStatus['nhs-number-validator'].failureCount).toBe(0)

      await executor.dispose()
    })
  })
})
