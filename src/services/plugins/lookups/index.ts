/**
 * Built-in lookup service plugins for data enrichment
 * @module services/plugins/lookups
 */

// Address Standardization
export {
  createAddressStandardization,
  mockAddressStandardization,
  buildAddressString,
  mapAddressFields,
  determineMatchQuality,
  createMockAddressProvider,
  type AddressProvider,
  type StandardizedAddress,
  type AddressProviderResponse,
  type CustomAddressProvider,
  type AddressStandardizationConfig,
  DEFAULT_ADDRESS_CONFIG,
} from './address-standardization.js'

// Email Enrichment
export {
  createEmailEnrichment,
  mockEmailEnrichment,
  extractEmail,
  flattenEnrichedData,
  mapEnrichedFields,
  createMockEmailEnrichmentProvider,
  type EmailEnrichmentProvider,
  type EnrichedEmailData,
  type EmailEnrichmentResponse,
  type CustomEmailEnrichmentProvider,
  type EmailEnrichmentConfig,
  DEFAULT_EMAIL_ENRICHMENT_CONFIG,
} from './email-enrichment.js'

// Phone Carrier Lookup
export {
  createPhoneCarrierLookup,
  mockPhoneCarrierLookup,
  extractPhoneNumber,
  normalizePhoneNumber,
  flattenCarrierData,
  mapCarrierFields,
  createMockCarrierProvider,
  type PhoneCarrierProvider,
  type PhoneLineType,
  type PortabilityStatus,
  type CarrierLookupData,
  type CarrierLookupResponse,
  type CustomCarrierProvider,
  type PhoneCarrierLookupConfig,
  DEFAULT_CARRIER_CONFIG,
} from './phone-carrier-lookup.js'

// Mock Lookup Service
export {
  createMockLookup,
  createMockLookupWithData,
  createSuccessMock,
  createNotFoundMock,
  createFailureMock,
  createSlowMock,
  createRandomLatencyMock,
  createFlakyMock,
  type MockLookupConfig,
  type MockLookupCallEntry,
  type MockLookupService,
  DEFAULT_MOCK_CONFIG,
} from './mock-lookup-service.js'
