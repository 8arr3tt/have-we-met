/**
 * Data Enrichment Example
 *
 * This example demonstrates how to use lookup services to enrich records
 * with additional data from external sources before matching. Enrichment
 * helps improve match quality by standardizing and augmenting data.
 *
 * Topics covered:
 * 1. Address standardization for consistent formatting
 * 2. Email enrichment to add name/company data
 * 3. Field mapping from external response to schema
 * 4. Handling not-found responses
 * 5. Using enriched data in the resolution flow
 */

import {
  createServiceBuilder,
  createServiceExecutor,
  createAddressStandardization,
  createEmailEnrichment,
  createMockLookup,
  createMockAddressProvider,
  createMockEmailEnrichmentProvider,
  stableHash,
  buildServiceContext,
} from '../../src/services'
import type { ResolverConfig } from '../../src/types/config'
import type { LookupOutput } from '../../src/services'

interface CustomerRecord {
  customerId?: string
  firstName: string
  lastName: string
  email: string
  street?: string
  city?: string
  state?: string
  postalCode?: string
  country?: string
  company?: string
  title?: string
}

async function dataEnrichmentExample() {
  console.log('=== Data Enrichment Example ===\n')

  // Minimal resolver config for the example
  const resolverConfig: ResolverConfig = {
    schema: {
      customerId: { type: 'string' },
      firstName: { type: 'string' },
      lastName: { type: 'string' },
      email: { type: 'string' },
      street: { type: 'string' },
      city: { type: 'string' },
      state: { type: 'string' },
      postalCode: { type: 'string' },
      country: { type: 'string' },
      company: { type: 'string' },
      title: { type: 'string' },
    },
    matchingRules: [],
    thresholds: { noMatch: 0.3, definiteMatch: 0.9 },
  }

  // Step 1: Create mock providers for demonstration
  console.log('Step 1: Setting up mock providers...')

  // Mock address standardization provider
  const addressProvider = createMockAddressProvider({
    responses: new Map([
      ['123 main street, new york, ny, 10001, usa', {
        success: true,
        standardized: {
          street: '123 Main Street',
          city: 'New York',
          state: 'NY',
          postalCode: '10001-0001',
          country: 'US',
        },
        confidence: 0.95,
        metadata: { addressType: 'residential' },
      }],
      ['456 oak ave, los angeles, ca, 90001, usa', {
        success: true,
        standardized: {
          street: '456 Oak Avenue',
          city: 'Los Angeles',
          state: 'CA',
          postalCode: '90001-0002',
          country: 'US',
        },
        confidence: 0.92,
        metadata: { addressType: 'commercial' },
      }],
    ]),
  })

  // Mock email enrichment provider
  const emailEnrichProvider = createMockEmailEnrichmentProvider({
    responses: new Map([
      ['john.smith@techcorp.com', {
        success: true,
        data: {
          name: { first: 'John', last: 'Smith', full: 'John Smith' },
          company: { name: 'TechCorp Inc', domain: 'techcorp.com' },
          title: 'Senior Engineer',
          socialProfiles: { linkedin: 'https://linkedin.com/in/johnsmith' },
        },
        confidence: 0.88,
      }],
      ['jane.doe@startup.io', {
        success: true,
        data: {
          name: { first: 'Jane', last: 'Doe', full: 'Jane Doe' },
          company: { name: 'Startup Inc', domain: 'startup.io' },
          title: 'Product Manager',
        },
        confidence: 0.85,
      }],
    ]),
  })

  const addressStandardization = createAddressStandardization({
    provider: 'custom',
    customProvider: addressProvider,
    fieldMapping: {
      street: 'street',
      city: 'city',
      state: 'state',
      postalCode: 'postalCode',
      country: 'country',
    },
  })

  const emailEnrichment = createEmailEnrichment({
    provider: 'custom',
    customProvider: emailEnrichProvider,
    fieldMapping: {
      'name.first': 'firstName',
      'name.last': 'lastName',
      'company.name': 'company',
      title: 'title',
    },
  })

  console.log('  Address standardization provider configured')
  console.log('  Email enrichment provider configured')
  console.log()

  // Step 2: Create service configuration using the builder
  console.log('Step 2: Configuring lookup services...')
  const servicesConfig = createServiceBuilder<CustomerRecord>()
    .defaultTimeout(5000)
    .caching(true)
    .lookup('street')
      .using(addressStandardization)
      .withFields('city', 'state', 'postalCode', 'country')
      .mapFields({
        street: 'street',
        city: 'city',
        state: 'state',
        postalCode: 'postalCode',
        country: 'country',
      })
      .onNotFound('continue')
      .onFailure('continue')
    .lookup('email')
      .using(emailEnrichment)
      .mapFields({
        'name.first': 'firstName',
        'name.last': 'lastName',
        'company.name': 'company',
        title: 'title',
      })
      .onNotFound('flag')
      .onFailure('continue')
    .build()

  console.log('Service configuration:')
  console.log(`  Services configured: ${servicesConfig.services.length}`)
  for (const svc of servicesConfig.services) {
    console.log(`    - ${svc.plugin.name} (fields: ${svc.fields?.join(', ')})`)
  }
  console.log()

  // Step 3: Create the service executor
  console.log('Step 3: Creating service executor...')
  const executor = createServiceExecutor({
    resolverConfig,
    defaults: servicesConfig.defaults,
    cachingEnabled: servicesConfig.cachingEnabled,
  })

  // Register the services
  for (const serviceConfig of servicesConfig.services) {
    executor.register(serviceConfig)
  }
  console.log(`Registered ${executor.getServiceNames().length} services\n`)

  // Step 4: Enrich a customer record
  console.log('Step 4: Enriching customer record...')
  const customerRecord: CustomerRecord = {
    firstName: 'John',
    lastName: '', // Missing - will be enriched from email
    email: 'john.smith@techcorp.com',
    street: '123 main street',
    city: 'new york',
    state: 'ny',
    postalCode: '10001',
    country: 'usa',
  }

  console.log('Input record:')
  console.log(JSON.stringify(customerRecord, null, 2))
  console.log()

  const result = await executor.executePreMatch(customerRecord)
  console.log('Enrichment result:')
  console.log(`  Proceed: ${result.proceed}`)
  console.log(`  Total duration: ${result.totalDurationMs}ms`)
  console.log()

  // Examine individual service results
  for (const [serviceName, serviceResult] of Object.entries(result.results)) {
    console.log(`  ${serviceName}:`)
    console.log(`    Success: ${serviceResult.success}`)
    console.log(`    Duration: ${serviceResult.timing.durationMs}ms`)
    if (serviceResult.data) {
      const data = serviceResult.data as LookupOutput
      console.log(`    Found: ${data.found}`)
      console.log(`    Match quality: ${data.matchQuality}`)
      if (data.data) {
        console.log(`    Retrieved data: ${JSON.stringify(data.data)}`)
      }
    }
  }
  console.log()

  // Step 5: Show enriched record
  console.log('Step 5: Enriched record data...')
  console.log('Enriched record:')
  console.log(JSON.stringify(result.enrichedData, null, 2))
  console.log()

  // Step 6: Handle record with unknown address
  console.log('Step 6: Handling record with unknown address...')
  const unknownAddressRecord: CustomerRecord = {
    firstName: 'Unknown',
    lastName: 'Customer',
    email: 'unknown@example.com',
    street: '999 Nonexistent Lane',
    city: 'Nowhere',
    state: 'XX',
    postalCode: '00000',
    country: 'Unknown',
  }

  console.log('Input record:')
  console.log(JSON.stringify(unknownAddressRecord, null, 2))
  console.log()

  const unknownResult = await executor.executePreMatch(unknownAddressRecord)
  console.log('Enrichment result:')
  console.log(`  Proceed: ${unknownResult.proceed}`) // Should proceed (onNotFound: continue)
  console.log(`  Flags: ${unknownResult.flags?.join(', ') ?? 'none'}`)
  console.log()

  // Step 7: Using mock lookup service directly for testing
  console.log('Step 7: Using mock lookup service directly...')

  // Create a mock lookup with predefined responses
  const mockResponses = new Map<string, LookupOutput>()
  mockResponses.set(stableHash({ email: 'test@company.com' }), {
    found: true,
    data: {
      firstName: 'Test',
      lastName: 'User',
      company: 'Test Company',
    },
    matchQuality: 'exact',
    source: {
      system: 'mock',
      recordId: 'test-001',
      lastUpdated: new Date(),
    },
  })

  const mockLookup = createMockLookup({
    name: 'mock-customer-lookup',
    description: 'Mock lookup for testing',
    responses: mockResponses,
    defaultResponse: { found: false },
    latencyMs: 10,
    trackCalls: true,
  })

  const mockContext = buildServiceContext({
    record: { email: 'test@company.com' },
    config: resolverConfig,
  })

  const mockResult = await mockLookup.execute(
    { keyFields: { email: 'test@company.com' } },
    mockContext,
  )

  console.log('Mock lookup result:')
  console.log(`  Found: ${mockResult.data?.found}`)
  console.log(`  Data: ${JSON.stringify(mockResult.data?.data)}`)
  console.log(`  Call count: ${mockLookup.getCallCount()}`)
  console.log()

  // Cleanup
  await executor.dispose()

  console.log('=== Example Complete ===')
  console.log('\nKey takeaways:')
  console.log('- Lookup services enrich records with external data')
  console.log('- Field mapping translates external field names to schema fields')
  console.log('- onNotFound="continue" allows processing even without enrichment')
  console.log('- onNotFound="flag" marks records that could not be enriched')
  console.log('- Enriched data is available in result.enrichedData')
  console.log('- Mock lookup services are useful for testing')
}

// Run the example
dataEnrichmentExample().catch((error) => {
  console.error('Error running example:', error)
  process.exit(1)
})
