/**
 * Tests for Phone Carrier Lookup Service
 */

import { describe, it, expect, vi } from 'vitest'
import type { ServiceContext } from '../../types.js'
import type { ResolverConfig } from '../../../types/config.js'
import {
  createPhoneCarrierLookup,
  mockPhoneCarrierLookup,
  extractPhoneNumber,
  normalizePhoneNumber,
  flattenCarrierData,
  mapCarrierFields,
  createMockCarrierProvider,
  type CarrierLookupData,
} from './phone-carrier-lookup.js'

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

describe('Phone Carrier Lookup Service', () => {
  describe('normalizePhoneNumber', () => {
    it('removes non-digit characters', () => {
      expect(normalizePhoneNumber('(555) 123-4567')).toBe('5551234567')
      expect(normalizePhoneNumber('555.123.4567')).toBe('5551234567')
      expect(normalizePhoneNumber('555 123 4567')).toBe('5551234567')
    })

    it('preserves leading + for international format', () => {
      expect(normalizePhoneNumber('+1 555 123 4567')).toBe('+15551234567')
      expect(normalizePhoneNumber('+44 20 7123 4567')).toBe('+442071234567')
    })

    it('does not add + for short numbers', () => {
      expect(normalizePhoneNumber('+123')).toBe('123')
      expect(normalizePhoneNumber('123-456')).toBe('123456')
    })

    it('handles already clean numbers', () => {
      expect(normalizePhoneNumber('5551234567')).toBe('5551234567')
      expect(normalizePhoneNumber('+15551234567')).toBe('+15551234567')
    })
  })

  describe('extractPhoneNumber', () => {
    it('extracts phone from phone field', () => {
      expect(extractPhoneNumber({ phone: '555-123-4567' })).toBe('5551234567')
    })

    it('extracts phone from phoneNumber field', () => {
      expect(extractPhoneNumber({ phoneNumber: '5551234567' })).toBe(
        '5551234567'
      )
    })

    it('extracts phone from mobile field', () => {
      expect(extractPhoneNumber({ mobile: '5551234567' })).toBe('5551234567')
    })

    it('extracts phone from telephone field', () => {
      expect(extractPhoneNumber({ telephone: '5551234567' })).toBe('5551234567')
    })

    it('extracts phone from cell field', () => {
      expect(extractPhoneNumber({ cell: '5551234567' })).toBe('5551234567')
    })

    it('extracts phone from primaryPhone field', () => {
      expect(extractPhoneNumber({ primaryPhone: '+15551234567' })).toBe(
        '+15551234567'
      )
    })

    it('returns undefined for empty input', () => {
      expect(extractPhoneNumber({})).toBeUndefined()
    })

    it('returns undefined for null values', () => {
      expect(extractPhoneNumber({ phone: null })).toBeUndefined()
    })

    it('returns undefined for empty string', () => {
      expect(extractPhoneNumber({ phone: '' })).toBeUndefined()
    })
  })

  describe('flattenCarrierData', () => {
    it('flattens carrier data', () => {
      const data: CarrierLookupData = {
        phoneNumber: '+15551234567',
        carrier: {
          name: 'Verizon',
          code: 'VZW',
          type: 'mobile',
        },
        lineType: 'mobile',
      }

      const result = flattenCarrierData(data)

      expect(result.phoneNumber).toBe('+15551234567')
      expect(result['carrier.name']).toBe('Verizon')
      expect(result['carrier.code']).toBe('VZW')
      expect(result['carrier.type']).toBe('mobile')
      expect(result.lineType).toBe('mobile')
    })

    it('flattens geographic data', () => {
      const data: CarrierLookupData = {
        geographic: {
          countryCode: 'US',
          countryName: 'United States',
          region: 'California',
          city: 'San Francisco',
          timezone: 'America/Los_Angeles',
          callingCode: '+1',
        },
      }

      const result = flattenCarrierData(data)

      expect(result['geographic.countryCode']).toBe('US')
      expect(result['geographic.countryName']).toBe('United States')
      expect(result['geographic.region']).toBe('California')
      expect(result['geographic.city']).toBe('San Francisco')
      expect(result['geographic.timezone']).toBe('America/Los_Angeles')
      expect(result['geographic.callingCode']).toBe('+1')
    })

    it('flattens validity data', () => {
      const data: CarrierLookupData = {
        validity: {
          isValid: true,
          isReachable: true,
          isFormatValid: true,
        },
      }

      const result = flattenCarrierData(data)

      expect(result['validity.isValid']).toBe(true)
      expect(result['validity.isReachable']).toBe(true)
      expect(result['validity.isFormatValid']).toBe(true)
    })

    it('includes portability data', () => {
      const data: CarrierLookupData = {
        portabilityStatus: 'ported',
        originalCarrier: 'AT&T',
      }

      const result = flattenCarrierData(data)

      expect(result.portabilityStatus).toBe('ported')
      expect(result.originalCarrier).toBe('AT&T')
    })

    it('excludes undefined values', () => {
      const data: CarrierLookupData = {
        carrier: {
          name: 'Verizon',
          code: undefined,
        },
      }

      const result = flattenCarrierData(data)

      expect(result['carrier.name']).toBe('Verizon')
      expect('carrier.code' in result).toBe(false)
    })
  })

  describe('mapCarrierFields', () => {
    it('maps carrier fields to schema fields', () => {
      const data: CarrierLookupData = {
        carrier: {
          name: 'Verizon',
          type: 'mobile',
        },
        lineType: 'mobile',
        geographic: {
          countryCode: 'US',
        },
      }

      const mapping = {
        'carrier.name': 'phone.carrier',
        lineType: 'phone.type',
        'geographic.countryCode': 'phone.country',
      }

      const result = mapCarrierFields(data, mapping)

      expect(result).toEqual({
        'phone.carrier': 'Verizon',
        'phone.type': 'mobile',
        'phone.country': 'US',
      })
    })

    it('skips missing fields', () => {
      const data: CarrierLookupData = {
        carrier: {
          name: 'Verizon',
        },
      }

      const mapping = {
        'carrier.name': 'carrier_name',
        'carrier.code': 'carrier_code',
      }

      const result = mapCarrierFields(data, mapping)

      expect(result).toEqual({
        carrier_name: 'Verizon',
      })
    })
  })

  describe('createMockCarrierProvider', () => {
    it('returns carrier data for valid phone number', async () => {
      const provider = createMockCarrierProvider()
      const result = await provider('+15551234567')

      expect(result.found).toBe(true)
      expect(result.data?.phoneNumber).toBe('+15551234567')
      expect(result.data?.carrier).toBeDefined()
      expect(result.data?.lineType).toBeDefined()
    })

    it('returns not found for short phone numbers', async () => {
      const provider = createMockCarrierProvider()
      const result = await provider('123456')

      expect(result.found).toBe(false)
    })

    it('identifies toll-free numbers', async () => {
      const provider = createMockCarrierProvider()
      const result = await provider('+18005551234')

      expect(result.found).toBe(true)
      expect(result.data?.lineType).toBe('toll_free')
      expect(result.data?.carrier?.type).toBe('toll_free')
    })

    it('includes geographic data', async () => {
      const provider = createMockCarrierProvider()
      const result = await provider('+15551234567')

      expect(result.data?.geographic?.countryCode).toBe('US')
      expect(result.data?.geographic?.callingCode).toBe('+1')
    })

    it('includes validity data', async () => {
      const provider = createMockCarrierProvider()
      const result = await provider('+15551234567')

      expect(result.data?.validity?.isValid).toBe(true)
      expect(result.data?.validity?.isFormatValid).toBe(true)
    })

    it('includes portability status', async () => {
      const provider = createMockCarrierProvider()
      const result = await provider('+15551234567')

      expect(['ported', 'not_ported']).toContain(result.data?.portabilityStatus)
    })

    it('normalizes phone number to E.164', async () => {
      const provider = createMockCarrierProvider()
      const result = await provider('5551234567')

      expect(result.data?.phoneNumber).toBe('+15551234567')
    })
  })

  describe('createPhoneCarrierLookup', () => {
    it('creates service with custom provider', () => {
      const mockProvider = vi.fn().mockResolvedValue({
        found: true,
        data: { phoneNumber: '+15551234567' },
      })

      const service = createPhoneCarrierLookup({
        provider: 'custom',
        customProvider: mockProvider,
      })

      expect(service.name).toBe('phone-carrier-lookup-custom')
      expect(service.type).toBe('lookup')
    })

    it('throws error when custom provider is missing', () => {
      expect(() =>
        createPhoneCarrierLookup({
          provider: 'custom',
        })
      ).toThrow('Custom provider requires customProvider function')
    })

    it('throws error when non-custom provider missing apiKey', () => {
      expect(() =>
        createPhoneCarrierLookup({
          provider: 'twilio',
        })
      ).toThrow("Provider 'twilio' requires apiKey")
    })

    describe('execute', () => {
      it('returns carrier data for valid phone number', async () => {
        const mockProvider = vi.fn().mockResolvedValue({
          found: true,
          data: {
            phoneNumber: '+15551234567',
            carrier: {
              name: 'Verizon',
              type: 'mobile',
            },
            lineType: 'mobile',
          },
          confidence: 0.95,
          id: 'lookup-123',
        })

        const service = createPhoneCarrierLookup({
          provider: 'custom',
          customProvider: mockProvider,
        })

        const context = createMockContext()
        const result = await service.execute(
          {
            keyFields: { phone: '+15551234567' },
          },
          context
        )

        expect(result.success).toBe(true)
        expect(result.data?.found).toBe(true)
        expect(result.data?.matchQuality).toBe('exact')
      })

      it('returns not found for missing phone number', async () => {
        const service = createPhoneCarrierLookup({
          provider: 'custom',
          customProvider: createMockCarrierProvider(),
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

        const service = createPhoneCarrierLookup({
          provider: 'custom',
          customProvider: mockProvider,
        })

        const context = createMockContext()
        const result = await service.execute(
          {
            keyFields: { phone: '+15551234567' },
          },
          context
        )

        expect(result.success).toBe(true)
        expect(result.data?.found).toBe(false)
      })

      it('excludes geographic data when includeGeographic is false', async () => {
        const mockProvider = vi.fn().mockResolvedValue({
          found: true,
          data: {
            phoneNumber: '+15551234567',
            carrier: { name: 'Verizon' },
            geographic: { countryCode: 'US' },
          },
        })

        const service = createPhoneCarrierLookup({
          provider: 'custom',
          customProvider: mockProvider,
          includeGeographic: false,
        })

        const context = createMockContext()
        const result = await service.execute(
          {
            keyFields: { phone: '+15551234567' },
          },
          context
        )

        const data = result.data?.data as Record<string, unknown>
        expect(data['geographic.countryCode']).toBeUndefined()
      })

      it('excludes portability data when includePortability is false', async () => {
        const mockProvider = vi.fn().mockResolvedValue({
          found: true,
          data: {
            phoneNumber: '+15551234567',
            portabilityStatus: 'ported',
            originalCarrier: 'AT&T',
          },
        })

        const service = createPhoneCarrierLookup({
          provider: 'custom',
          customProvider: mockProvider,
          includePortability: false,
        })

        const context = createMockContext()
        const result = await service.execute(
          {
            keyFields: { phone: '+15551234567' },
          },
          context
        )

        const data = result.data?.data as Record<string, unknown>
        expect(data.portabilityStatus).toBeUndefined()
        expect(data.originalCarrier).toBeUndefined()
      })

      it('applies field mapping when provided', async () => {
        const mockProvider = vi.fn().mockResolvedValue({
          found: true,
          data: {
            carrier: {
              name: 'Verizon',
            },
            lineType: 'mobile',
          },
        })

        const service = createPhoneCarrierLookup({
          provider: 'custom',
          customProvider: mockProvider,
          fieldMapping: {
            'carrier.name': 'network',
            lineType: 'type',
          },
        })

        const context = createMockContext()
        const result = await service.execute(
          {
            keyFields: { phone: '+15551234567' },
          },
          context
        )

        expect(result.data?.data).toEqual({
          network: 'Verizon',
          type: 'mobile',
        })
      })

      it('includes cost in metadata when provided', async () => {
        const mockProvider = vi.fn().mockResolvedValue({
          found: true,
          data: { phoneNumber: '+15551234567' },
          cost: 0.005,
        })

        const service = createPhoneCarrierLookup({
          provider: 'custom',
          customProvider: mockProvider,
        })

        const context = createMockContext()
        const result = await service.execute(
          {
            keyFields: { phone: '+15551234567' },
          },
          context
        )

        expect(result.metadata?.cost).toBe(0.005)
      })

      it('handles provider errors gracefully', async () => {
        const mockProvider = vi.fn().mockRejectedValue(new Error('API Error'))

        const service = createPhoneCarrierLookup({
          provider: 'custom',
          customProvider: mockProvider,
        })

        const context = createMockContext()
        const result = await service.execute(
          {
            keyFields: { phone: '+15551234567' },
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
          found: true,
          data: { phoneNumber: '+14155551234' },
        })

        const service = createPhoneCarrierLookup({
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
          .mockRejectedValue(new Error('Connection timeout'))

        const service = createPhoneCarrierLookup({
          provider: 'custom',
          customProvider: mockProvider,
        })

        const health = await service.healthCheck!()

        expect(health.healthy).toBe(false)
        expect(health.reason).toBe('Connection timeout')
      })
    })
  })

  describe('mockPhoneCarrierLookup', () => {
    it('is a pre-configured mock service', () => {
      expect(mockPhoneCarrierLookup.name).toBe('phone-carrier-lookup-custom')
      expect(mockPhoneCarrierLookup.type).toBe('lookup')
    })

    it('executes successfully', async () => {
      const context = createMockContext()
      const result = await mockPhoneCarrierLookup.execute(
        {
          keyFields: { phone: '+15551234567' },
        },
        context
      )

      expect(result.success).toBe(true)
      expect(result.data?.found).toBe(true)
    })
  })

  describe('non-custom providers', () => {
    it('throws error for twilio provider without custom implementation', async () => {
      const service = createPhoneCarrierLookup({
        provider: 'twilio',
        apiKey: 'test-key',
      })

      const context = createMockContext()
      const result = await service.execute(
        {
          keyFields: { phone: '+15551234567' },
        },
        context
      )

      expect(result.success).toBe(false)
      expect(result.error?.message).toContain('requires custom implementation')
    })

    it('throws error for plivo provider without custom implementation', async () => {
      const service = createPhoneCarrierLookup({
        provider: 'plivo',
        apiKey: 'test-key',
      })

      const context = createMockContext()
      const result = await service.execute(
        {
          keyFields: { phone: '+15551234567' },
        },
        context
      )

      expect(result.success).toBe(false)
    })

    it('throws error for numverify provider without custom implementation', async () => {
      const service = createPhoneCarrierLookup({
        provider: 'numverify',
        apiKey: 'test-key',
      })

      const context = createMockContext()
      const result = await service.execute(
        {
          keyFields: { phone: '+15551234567' },
        },
        context
      )

      expect(result.success).toBe(false)
    })
  })
})
