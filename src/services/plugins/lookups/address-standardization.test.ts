/**
 * Tests for Address Standardization Lookup Service
 */

import { describe, it, expect, vi } from 'vitest'
import type { ServiceContext } from '../../types.js'
import type { ResolverConfig } from '../../../types/config.js'
import {
  createAddressStandardization,
  mockAddressStandardization,
  buildAddressString,
  mapAddressFields,
  determineMatchQuality,
  createMockAddressProvider,
  type StandardizedAddress,
} from './address-standardization.js'

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

describe('Address Standardization Lookup Service', () => {
  describe('buildAddressString', () => {
    it('builds address from street fields', () => {
      const result = buildAddressString({
        streetAddress: '123 Main St',
        city: 'Springfield',
        state: 'IL',
        postalCode: '62701',
      })
      expect(result).toBe('123 Main St, Springfield, IL, 62701')
    })

    it('handles alternate field names', () => {
      const result = buildAddressString({
        address: '456 Oak Ave',
        locality: 'Chicago',
        province: 'IL',
        zipCode: '60601',
      })
      expect(result).toBe('456 Oak Ave, Chicago, IL, 60601')
    })

    it('handles addressLine1 and addressLine2', () => {
      const result = buildAddressString({
        addressLine1: '789 Pine St',
        addressLine2: 'Apt 5',
        city: 'Denver',
        state: 'CO',
        zip: '80202',
      })
      expect(result).toBe('789 Pine St, Apt 5, Denver, CO, 80202')
    })

    it('includes country if provided', () => {
      const result = buildAddressString({
        street: '10 Downing St',
        city: 'London',
        country: 'UK',
      })
      expect(result).toBe('10 Downing St, London, UK')
    })

    it('returns empty string for empty input', () => {
      const result = buildAddressString({})
      expect(result).toBe('')
    })

    it('skips null and undefined values', () => {
      const result = buildAddressString({
        street: '123 Main St',
        city: null,
        state: undefined,
        postalCode: '12345',
      })
      expect(result).toBe('123 Main St, 12345')
    })

    it('skips empty string values', () => {
      const result = buildAddressString({
        street: '123 Main St',
        city: '',
        state: 'NY',
      })
      expect(result).toBe('123 Main St, NY')
    })
  })

  describe('mapAddressFields', () => {
    it('maps standardized address fields to schema fields', () => {
      const standardized: StandardizedAddress = {
        streetAddress1: '123 Main Street',
        city: 'Springfield',
        state: 'Illinois',
        postalCode: '62701',
        countryCode: 'US',
      }

      const mapping = {
        streetAddress1: 'address.street',
        city: 'address.city',
        state: 'address.state',
        postalCode: 'address.zip',
      }

      const result = mapAddressFields(standardized, mapping)

      expect(result).toEqual({
        'address.street': '123 Main Street',
        'address.city': 'Springfield',
        'address.state': 'Illinois',
        'address.zip': '62701',
      })
    })

    it('skips undefined values', () => {
      const standardized: StandardizedAddress = {
        streetAddress1: '123 Main St',
        city: 'Denver',
      }

      const mapping = {
        streetAddress1: 'street',
        city: 'city',
        state: 'state',
        postalCode: 'zip',
      }

      const result = mapAddressFields(standardized, mapping)

      expect(result).toEqual({
        street: '123 Main St',
        city: 'Denver',
      })
    })

    it('maps geocoded coordinates', () => {
      const standardized: StandardizedAddress = {
        streetAddress1: '1600 Pennsylvania Ave',
        latitude: 38.8977,
        longitude: -77.0365,
      }

      const mapping = {
        latitude: 'geo.lat',
        longitude: 'geo.lng',
      }

      const result = mapAddressFields(standardized, mapping)

      expect(result).toEqual({
        'geo.lat': 38.8977,
        'geo.lng': -77.0365,
      })
    })
  })

  describe('determineMatchQuality', () => {
    it('returns exact for high confidence', () => {
      expect(determineMatchQuality(0.95)).toBe('exact')
      expect(determineMatchQuality(0.9)).toBe('exact')
      expect(determineMatchQuality(1.0)).toBe('exact')
    })

    it('returns partial for medium confidence', () => {
      expect(determineMatchQuality(0.89)).toBe('partial')
      expect(determineMatchQuality(0.7)).toBe('partial')
      expect(determineMatchQuality(0.75)).toBe('partial')
    })

    it('returns fuzzy for low confidence', () => {
      expect(determineMatchQuality(0.69)).toBe('fuzzy')
      expect(determineMatchQuality(0.5)).toBe('fuzzy')
      expect(determineMatchQuality(0.0)).toBe('fuzzy')
    })

    it('returns partial for undefined confidence', () => {
      expect(determineMatchQuality(undefined)).toBe('partial')
    })
  })

  describe('createMockAddressProvider', () => {
    it('parses address components from string', async () => {
      const provider = createMockAddressProvider()
      const result = await provider('123 Main St, Springfield, IL, 62701')

      expect(result.found).toBe(true)
      expect(result.standardized?.streetAddress1).toBe('123 Main St')
      expect(result.standardized?.city).toBe('Springfield')
      expect(result.standardized?.state).toBe('IL')
      expect(result.standardized?.postalCode).toBe('62701')
    })

    it('returns not found for empty address', async () => {
      const provider = createMockAddressProvider()
      const result = await provider('')

      expect(result.found).toBe(false)
    })

    it('includes confidence score', async () => {
      const provider = createMockAddressProvider()
      const result = await provider('123 Main St')

      expect(result.confidence).toBe(0.85)
    })

    it('includes provider ID', async () => {
      const provider = createMockAddressProvider()
      const result = await provider('123 Main St')

      expect(result.id).toMatch(/^mock-\d+$/)
    })

    it('sets default country code', async () => {
      const provider = createMockAddressProvider()
      const result = await provider('123 Main St')

      expect(result.standardized?.countryCode).toBe('US')
    })
  })

  describe('createAddressStandardization', () => {
    it('creates service with custom provider', () => {
      const mockProvider = vi.fn().mockResolvedValue({
        found: true,
        standardized: { streetAddress1: '123 Main St' },
      })

      const service = createAddressStandardization({
        provider: 'custom',
        customProvider: mockProvider,
      })

      expect(service.name).toBe('address-standardization-custom')
      expect(service.type).toBe('lookup')
    })

    it('throws error when custom provider is missing', () => {
      expect(() =>
        createAddressStandardization({
          provider: 'custom',
        })
      ).toThrow('Custom provider requires customProvider function')
    })

    it('throws error when non-custom provider missing apiKey', () => {
      expect(() =>
        createAddressStandardization({
          provider: 'usps',
        })
      ).toThrow("Provider 'usps' requires apiKey")
    })

    describe('execute', () => {
      it('standardizes valid address', async () => {
        const mockProvider = vi.fn().mockResolvedValue({
          found: true,
          standardized: {
            streetAddress1: '123 Main Street',
            city: 'Springfield',
            state: 'IL',
            postalCode: '62701',
          },
          confidence: 0.95,
          id: 'test-123',
        })

        const service = createAddressStandardization({
          provider: 'custom',
          customProvider: mockProvider,
        })

        const context = createMockContext()
        const result = await service.execute(
          {
            keyFields: {
              street: '123 Main St',
              city: 'Springfield',
              state: 'IL',
            },
          },
          context
        )

        expect(result.success).toBe(true)
        expect(result.data?.found).toBe(true)
        expect(result.data?.data).toBeDefined()
        expect(result.data?.matchQuality).toBe('exact')
      })

      it('returns not found for empty address', async () => {
        const service = createAddressStandardization({
          provider: 'custom',
          customProvider: createMockAddressProvider(),
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

        const service = createAddressStandardization({
          provider: 'custom',
          customProvider: mockProvider,
        })

        const context = createMockContext()
        const result = await service.execute(
          {
            keyFields: { street: 'Invalid Address' },
          },
          context
        )

        expect(result.success).toBe(true)
        expect(result.data?.found).toBe(false)
      })

      it('applies field mapping when provided', async () => {
        const mockProvider = vi.fn().mockResolvedValue({
          found: true,
          standardized: {
            streetAddress1: '123 Main St',
            city: 'Denver',
            state: 'CO',
          },
          confidence: 0.9,
        })

        const service = createAddressStandardization({
          provider: 'custom',
          customProvider: mockProvider,
          fieldMapping: {
            streetAddress1: 'normalized.street',
            city: 'normalized.city',
          },
        })

        const context = createMockContext()
        const result = await service.execute(
          {
            keyFields: { street: '123 Main' },
          },
          context
        )

        expect(result.data?.data).toEqual({
          'normalized.street': '123 Main St',
          'normalized.city': 'Denver',
        })
      })

      it('includes timing information', async () => {
        const service = createAddressStandardization({
          provider: 'custom',
          customProvider: createMockAddressProvider(),
        })

        const context = createMockContext()
        const result = await service.execute(
          {
            keyFields: { street: '123 Main St' },
          },
          context
        )

        expect(result.timing).toBeDefined()
        expect(result.timing.durationMs).toBeGreaterThanOrEqual(0)
        expect(result.timing.startedAt).toBeInstanceOf(Date)
        expect(result.timing.completedAt).toBeInstanceOf(Date)
      })

      it('includes source information', async () => {
        const mockProvider = vi.fn().mockResolvedValue({
          found: true,
          standardized: { streetAddress1: '123 Main' },
          id: 'source-id-123',
        })

        const service = createAddressStandardization({
          provider: 'custom',
          customProvider: mockProvider,
        })

        const context = createMockContext()
        const result = await service.execute(
          {
            keyFields: { street: '123 Main' },
          },
          context
        )

        expect(result.data?.source?.system).toBe('custom')
        expect(result.data?.source?.recordId).toBe('source-id-123')
      })

      it('handles provider errors gracefully', async () => {
        const mockProvider = vi
          .fn()
          .mockRejectedValue(new Error('Network error'))

        const service = createAddressStandardization({
          provider: 'custom',
          customProvider: mockProvider,
        })

        const context = createMockContext()
        const result = await service.execute(
          {
            keyFields: { street: '123 Main St' },
          },
          context
        )

        expect(result.success).toBe(false)
        expect(result.error).toBeDefined()
        expect(result.error?.type).toBe('network')
      })
    })

    describe('healthCheck', () => {
      it('returns healthy when provider responds', async () => {
        const mockProvider = vi.fn().mockResolvedValue({
          found: true,
          standardized: { streetAddress1: '1600 Pennsylvania Ave' },
        })

        const service = createAddressStandardization({
          provider: 'custom',
          customProvider: mockProvider,
        })

        const health = await service.healthCheck!()

        expect(health.healthy).toBe(true)
        expect(health.responseTimeMs).toBeGreaterThanOrEqual(0)
        expect(health.details?.provider).toBe('custom')
      })

      it('returns unhealthy when provider fails', async () => {
        const mockProvider = vi
          .fn()
          .mockRejectedValue(new Error('Connection failed'))

        const service = createAddressStandardization({
          provider: 'custom',
          customProvider: mockProvider,
        })

        const health = await service.healthCheck!()

        expect(health.healthy).toBe(false)
        expect(health.reason).toBe('Connection failed')
      })
    })
  })

  describe('mockAddressStandardization', () => {
    it('is a pre-configured mock service', () => {
      expect(mockAddressStandardization.name).toBe(
        'address-standardization-custom'
      )
      expect(mockAddressStandardization.type).toBe('lookup')
    })

    it('executes successfully', async () => {
      const context = createMockContext()
      const result = await mockAddressStandardization.execute(
        {
          keyFields: { street: '123 Main St', city: 'Denver' },
        },
        context
      )

      expect(result.success).toBe(true)
      expect(result.data?.found).toBe(true)
    })
  })

  describe('non-custom providers', () => {
    it('throws error for usps provider without custom implementation', async () => {
      const service = createAddressStandardization({
        provider: 'usps',
        apiKey: 'test-key',
      })

      const context = createMockContext()
      const result = await service.execute(
        {
          keyFields: { street: '123 Main' },
        },
        context
      )

      expect(result.success).toBe(false)
      expect(result.error?.message).toContain('requires custom implementation')
    })

    it('throws error for google provider without custom implementation', async () => {
      const service = createAddressStandardization({
        provider: 'google',
        apiKey: 'test-key',
      })

      const context = createMockContext()
      const result = await service.execute(
        {
          keyFields: { street: '123 Main' },
        },
        context
      )

      expect(result.success).toBe(false)
    })

    it('throws error for loqate provider without custom implementation', async () => {
      const service = createAddressStandardization({
        provider: 'loqate',
        apiKey: 'test-key',
      })

      const context = createMockContext()
      const result = await service.execute(
        {
          keyFields: { street: '123 Main' },
        },
        context
      )

      expect(result.success).toBe(false)
    })
  })
})
