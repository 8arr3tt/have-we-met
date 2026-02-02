/**
 * Tests for Email Enrichment Lookup Service
 */

import { describe, it, expect, vi } from 'vitest'
import type { ServiceContext } from '../../types.js'
import type { ResolverConfig } from '../../../types/config.js'
import {
  createEmailEnrichment,
  mockEmailEnrichment,
  extractEmail,
  flattenEnrichedData,
  mapEnrichedFields,
  createMockEmailEnrichmentProvider,
  type EnrichedEmailData,
} from './email-enrichment.js'

function createMockContext(
  keyFields: Record<string, unknown> = {}
): ServiceContext {
  return {
    record: keyFields,
    config: {} as ResolverConfig,
    metadata: {
      correlationId: 'test-correlation-id',
      startedAt: new Date(),
    },
  }
}

describe('Email Enrichment Lookup Service', () => {
  describe('extractEmail', () => {
    it('extracts email from email field', () => {
      expect(extractEmail({ email: 'john@example.com' })).toBe(
        'john@example.com'
      )
    })

    it('extracts email from emailAddress field', () => {
      expect(extractEmail({ emailAddress: 'jane@example.com' })).toBe(
        'jane@example.com'
      )
    })

    it('extracts email from mail field', () => {
      expect(extractEmail({ mail: 'test@example.com' })).toBe(
        'test@example.com'
      )
    })

    it('extracts email from primaryEmail field', () => {
      expect(extractEmail({ primaryEmail: 'primary@example.com' })).toBe(
        'primary@example.com'
      )
    })

    it('normalizes email to lowercase', () => {
      expect(extractEmail({ email: 'John.Doe@Example.COM' })).toBe(
        'john.doe@example.com'
      )
    })

    it('trims whitespace', () => {
      expect(extractEmail({ email: '  john@example.com  ' })).toBe(
        'john@example.com'
      )
    })

    it('returns undefined for empty input', () => {
      expect(extractEmail({})).toBeUndefined()
    })

    it('returns undefined for non-email values', () => {
      expect(extractEmail({ email: 'not-an-email' })).toBeUndefined()
      expect(extractEmail({ email: null })).toBeUndefined()
      expect(extractEmail({ email: 123 })).toBeUndefined()
    })

    it('finds email-like values in any field', () => {
      expect(extractEmail({ contact: 'user@domain.org' })).toBe(
        'user@domain.org'
      )
    })
  })

  describe('flattenEnrichedData', () => {
    it('flattens person data', () => {
      const data: EnrichedEmailData = {
        email: 'john@example.com',
        person: {
          fullName: 'John Doe',
          firstName: 'John',
          lastName: 'Doe',
          title: 'Engineer',
        },
      }

      const result = flattenEnrichedData(data)

      expect(result.email).toBe('john@example.com')
      expect(result['person.fullName']).toBe('John Doe')
      expect(result['person.firstName']).toBe('John')
      expect(result['person.lastName']).toBe('Doe')
      expect(result['person.title']).toBe('Engineer')
    })

    it('flattens company data', () => {
      const data: EnrichedEmailData = {
        company: {
          name: 'Acme Corp',
          domain: 'acme.com',
          industry: 'Technology',
          size: '100-500',
        },
      }

      const result = flattenEnrichedData(data)

      expect(result['company.name']).toBe('Acme Corp')
      expect(result['company.domain']).toBe('acme.com')
      expect(result['company.industry']).toBe('Technology')
      expect(result['company.size']).toBe('100-500')
    })

    it('flattens social data', () => {
      const data: EnrichedEmailData = {
        social: {
          linkedin: 'https://linkedin.com/in/johndoe',
          twitter: '@johndoe',
          github: 'johndoe',
        },
      }

      const result = flattenEnrichedData(data)

      expect(result['social.linkedin']).toBe('https://linkedin.com/in/johndoe')
      expect(result['social.twitter']).toBe('@johndoe')
      expect(result['social.github']).toBe('johndoe')
    })

    it('flattens email metadata', () => {
      const data: EnrichedEmailData = {
        emailMetadata: {
          isFreeProvider: true,
          isDisposable: false,
          isRoleBased: false,
          deliverabilityScore: 0.95,
        },
      }

      const result = flattenEnrichedData(data)

      expect(result['emailMetadata.isFreeProvider']).toBe(true)
      expect(result['emailMetadata.isDisposable']).toBe(false)
      expect(result['emailMetadata.deliverabilityScore']).toBe(0.95)
    })

    it('excludes undefined values', () => {
      const data: EnrichedEmailData = {
        person: {
          firstName: 'John',
          lastName: undefined,
        },
      }

      const result = flattenEnrichedData(data)

      expect(result['person.firstName']).toBe('John')
      expect('person.lastName' in result).toBe(false)
    })
  })

  describe('mapEnrichedFields', () => {
    it('maps enriched fields to schema fields', () => {
      const data: EnrichedEmailData = {
        person: {
          firstName: 'John',
          lastName: 'Doe',
        },
        company: {
          name: 'Acme',
        },
      }

      const mapping = {
        'person.firstName': 'first_name',
        'person.lastName': 'last_name',
        'company.name': 'employer',
      }

      const result = mapEnrichedFields(data, mapping)

      expect(result).toEqual({
        first_name: 'John',
        last_name: 'Doe',
        employer: 'Acme',
      })
    })

    it('skips missing fields', () => {
      const data: EnrichedEmailData = {
        person: {
          firstName: 'John',
        },
      }

      const mapping = {
        'person.firstName': 'first_name',
        'person.lastName': 'last_name',
      }

      const result = mapEnrichedFields(data, mapping)

      expect(result).toEqual({
        first_name: 'John',
      })
    })
  })

  describe('createMockEmailEnrichmentProvider', () => {
    it('returns enriched data for valid email', async () => {
      const provider = createMockEmailEnrichmentProvider()
      const result = await provider('john.doe@acme.com')

      expect(result.found).toBe(true)
      expect(result.data?.person?.firstName).toBe('John')
      expect(result.data?.person?.lastName).toBe('Doe')
    })

    it('generates name from email local part', async () => {
      const provider = createMockEmailEnrichmentProvider()
      const result = await provider('jane_smith@example.com')

      expect(result.data?.person?.firstName).toBe('Jane')
      expect(result.data?.person?.lastName).toBe('Smith')
    })

    it('identifies free email providers', async () => {
      const provider = createMockEmailEnrichmentProvider()
      const result = await provider('user@gmail.com')

      expect(result.data?.emailMetadata?.isFreeProvider).toBe(true)
    })

    it('includes company data for non-free providers', async () => {
      const provider = createMockEmailEnrichmentProvider()
      const result = await provider('user@acme.com')

      expect(result.data?.company?.name).toBe('Acme')
      expect(result.data?.company?.domain).toBe('acme.com')
    })

    it('does not include company data for free providers', async () => {
      const provider = createMockEmailEnrichmentProvider()
      const result = await provider('user@gmail.com')

      expect(result.data?.company).toBeUndefined()
    })

    it('identifies role-based emails', async () => {
      const provider = createMockEmailEnrichmentProvider()

      const supportResult = await provider('support@company.com')
      expect(supportResult.data?.emailMetadata?.isRoleBased).toBe(true)

      const infoResult = await provider('info@company.com')
      expect(infoResult.data?.emailMetadata?.isRoleBased).toBe(true)
    })

    it('identifies disposable emails', async () => {
      const provider = createMockEmailEnrichmentProvider()
      const result = await provider('user@tempmail.com')

      expect(result.data?.emailMetadata?.isDisposable).toBe(true)
      expect(result.confidence).toBeLessThan(0.7)
    })

    it('returns not found for invalid email format', async () => {
      const provider = createMockEmailEnrichmentProvider()
      const result = await provider('invalid-email')

      expect(result.found).toBe(false)
    })
  })

  describe('createEmailEnrichment', () => {
    it('creates service with custom provider', () => {
      const mockProvider = vi.fn().mockResolvedValue({
        found: true,
        data: { email: 'test@example.com' },
      })

      const service = createEmailEnrichment({
        provider: 'custom',
        customProvider: mockProvider,
      })

      expect(service.name).toBe('email-enrichment-custom')
      expect(service.type).toBe('lookup')
    })

    it('throws error when custom provider is missing', () => {
      expect(() =>
        createEmailEnrichment({
          provider: 'custom',
        })
      ).toThrow('Custom provider requires customProvider function')
    })

    it('throws error when non-custom provider missing apiKey', () => {
      expect(() =>
        createEmailEnrichment({
          provider: 'clearbit',
        })
      ).toThrow("Provider 'clearbit' requires apiKey")
    })

    describe('execute', () => {
      it('enriches valid email', async () => {
        const mockProvider = vi.fn().mockResolvedValue({
          found: true,
          data: {
            email: 'john@acme.com',
            person: {
              firstName: 'John',
              lastName: 'Doe',
            },
            company: {
              name: 'Acme Corp',
            },
          },
          confidence: 0.9,
          id: 'enrich-123',
        })

        const service = createEmailEnrichment({
          provider: 'custom',
          customProvider: mockProvider,
        })

        const context = createMockContext()
        const result = await service.execute(
          {
            keyFields: { email: 'john@acme.com' },
          },
          context
        )

        expect(result.success).toBe(true)
        expect(result.data?.found).toBe(true)
        expect(result.data?.matchQuality).toBe('exact')
      })

      it('returns not found for missing email', async () => {
        const service = createEmailEnrichment({
          provider: 'custom',
          customProvider: createMockEmailEnrichmentProvider(),
        })

        const context = createMockContext()
        const result = await service.execute(
          {
            keyFields: {},
          },
          context
        )

        expect(result.success).toBe(true)
        expect(result.data?.found).toBe(false)
      })

      it('handles provider not found response', async () => {
        const mockProvider = vi.fn().mockResolvedValue({
          found: false,
        })

        const service = createEmailEnrichment({
          provider: 'custom',
          customProvider: mockProvider,
        })

        const context = createMockContext()
        const result = await service.execute(
          {
            keyFields: { email: 'unknown@example.com' },
          },
          context
        )

        expect(result.success).toBe(true)
        expect(result.data?.found).toBe(false)
      })

      it('excludes company data when includeCompany is false', async () => {
        const mockProvider = vi.fn().mockResolvedValue({
          found: true,
          data: {
            email: 'john@acme.com',
            person: { firstName: 'John' },
            company: { name: 'Acme' },
          },
        })

        const service = createEmailEnrichment({
          provider: 'custom',
          customProvider: mockProvider,
          includeCompany: false,
        })

        const context = createMockContext()
        const result = await service.execute(
          {
            keyFields: { email: 'john@acme.com' },
          },
          context
        )

        const data = result.data?.data as Record<string, unknown>
        expect(data['company.name']).toBeUndefined()
      })

      it('excludes social data when includeSocial is false', async () => {
        const mockProvider = vi.fn().mockResolvedValue({
          found: true,
          data: {
            email: 'john@acme.com',
            social: { linkedin: 'https://linkedin.com/in/john' },
          },
        })

        const service = createEmailEnrichment({
          provider: 'custom',
          customProvider: mockProvider,
          includeSocial: false,
        })

        const context = createMockContext()
        const result = await service.execute(
          {
            keyFields: { email: 'john@acme.com' },
          },
          context
        )

        const data = result.data?.data as Record<string, unknown>
        expect(data['social.linkedin']).toBeUndefined()
      })

      it('applies field mapping when provided', async () => {
        const mockProvider = vi.fn().mockResolvedValue({
          found: true,
          data: {
            person: {
              firstName: 'John',
              lastName: 'Doe',
            },
          },
        })

        const service = createEmailEnrichment({
          provider: 'custom',
          customProvider: mockProvider,
          fieldMapping: {
            'person.firstName': 'givenName',
            'person.lastName': 'familyName',
          },
        })

        const context = createMockContext()
        const result = await service.execute(
          {
            keyFields: { email: 'john@example.com' },
          },
          context
        )

        expect(result.data?.data).toEqual({
          givenName: 'John',
          familyName: 'Doe',
        })
      })

      it('includes rate limit info in metadata', async () => {
        const mockProvider = vi.fn().mockResolvedValue({
          found: true,
          data: { email: 'john@example.com' },
          rateLimitRemaining: 99,
        })

        const service = createEmailEnrichment({
          provider: 'custom',
          customProvider: mockProvider,
        })

        const context = createMockContext()
        const result = await service.execute(
          {
            keyFields: { email: 'john@example.com' },
          },
          context
        )

        expect(result.metadata?.rateLimitRemaining).toBe(99)
      })

      it('handles provider errors gracefully', async () => {
        const mockProvider = vi.fn().mockRejectedValue(new Error('API Error'))

        const service = createEmailEnrichment({
          provider: 'custom',
          customProvider: mockProvider,
        })

        const context = createMockContext()
        const result = await service.execute(
          {
            keyFields: { email: 'john@example.com' },
          },
          context
        )

        expect(result.success).toBe(false)
        expect(result.error?.type).toBe('network')
      })
    })

    describe('healthCheck', () => {
      it('returns healthy when provider responds', async () => {
        const mockProvider = vi.fn().mockResolvedValue({
          found: false,
        })

        const service = createEmailEnrichment({
          provider: 'custom',
          customProvider: mockProvider,
        })

        const health = await service.healthCheck!()

        expect(health.healthy).toBe(true)
        expect(health.responseTimeMs).toBeGreaterThanOrEqual(0)
      })

      it('returns unhealthy when provider fails', async () => {
        const mockProvider = vi
          .fn()
          .mockRejectedValue(new Error('Connection refused'))

        const service = createEmailEnrichment({
          provider: 'custom',
          customProvider: mockProvider,
        })

        const health = await service.healthCheck!()

        expect(health.healthy).toBe(false)
        expect(health.reason).toBe('Connection refused')
      })
    })
  })

  describe('mockEmailEnrichment', () => {
    it('is a pre-configured mock service', () => {
      expect(mockEmailEnrichment.name).toBe('email-enrichment-custom')
      expect(mockEmailEnrichment.type).toBe('lookup')
    })

    it('executes successfully', async () => {
      const context = createMockContext()
      const result = await mockEmailEnrichment.execute(
        {
          keyFields: { email: 'john.doe@company.com' },
        },
        context
      )

      expect(result.success).toBe(true)
      expect(result.data?.found).toBe(true)
    })
  })

  describe('non-custom providers', () => {
    it('throws error for clearbit provider without custom implementation', async () => {
      const service = createEmailEnrichment({
        provider: 'clearbit',
        apiKey: 'test-key',
      })

      const context = createMockContext()
      const result = await service.execute(
        {
          keyFields: { email: 'test@example.com' },
        },
        context
      )

      expect(result.success).toBe(false)
      expect(result.error?.message).toContain('requires custom implementation')
    })

    it('throws error for hunter provider without custom implementation', async () => {
      const service = createEmailEnrichment({
        provider: 'hunter',
        apiKey: 'test-key',
      })

      const context = createMockContext()
      const result = await service.execute(
        {
          keyFields: { email: 'test@example.com' },
        },
        context
      )

      expect(result.success).toBe(false)
    })

    it('throws error for fullcontact provider without custom implementation', async () => {
      const service = createEmailEnrichment({
        provider: 'fullcontact',
        apiKey: 'test-key',
      })

      const context = createMockContext()
      const result = await service.execute(
        {
          keyFields: { email: 'test@example.com' },
        },
        context
      )

      expect(result.success).toBe(false)
    })
  })
})
