/**
 * Multi-Source Customer Consolidation Example
 *
 * This example demonstrates consolidating customer records from three different
 * product databases into a single unified customer table. Each product maintains
 * its own customer database with slightly different schemas, and we need to identify
 * and merge duplicate customers across these systems.
 *
 * Scenario:
 * - Product A (CRM): email_address, first_name, last_name, phone, created_at
 * - Product B (Billing): email, fname, lname, mobile, signup_date
 * - Product C (Support): contact_email, given_name, family_name, phone_number, registered
 *
 * Goal: Create unified customer records in the `customers` table with proper deduplication
 */

import { HaveWeMet } from '../../src/index.js'
import type { DatabaseAdapter } from '../../src/adapters/types'

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Product A (CRM) schema
 */
interface CRMCustomer {
  id: string
  email_address: string
  first_name: string
  last_name: string
  phone?: string
  created_at: Date
}

/**
 * Product B (Billing) schema
 */
interface BillingCustomer {
  customer_id: string
  email: string
  fname: string
  lname: string
  mobile?: string
  signup_date: Date
}

/**
 * Product C (Support) schema
 */
interface SupportCustomer {
  ticket_user_id: string
  contact_email: string
  given_name: string
  family_name: string
  phone_number?: string
  registered: Date
}

/**
 * Unified customer schema (output)
 */
interface UnifiedCustomer {
  id?: string
  email: string
  firstName: string
  lastName: string
  phone?: string
  createdAt: Date
  source?: string // Which system this record originated from
}

// ============================================================================
// Sample Data
// ============================================================================

const crmCustomers: CRMCustomer[] = [
  {
    id: 'crm_1',
    email_address: 'john.smith@example.com',
    first_name: 'John',
    last_name: 'Smith',
    phone: '+1-555-0100',
    created_at: new Date('2024-01-15'),
  },
  {
    id: 'crm_2',
    email_address: 'jane.doe@example.com',
    first_name: 'Jane',
    last_name: 'Doe',
    phone: '+1-555-0200',
    created_at: new Date('2024-02-20'),
  },
  {
    id: 'crm_3',
    email_address: 'bob.wilson@example.com',
    first_name: 'Robert',
    last_name: 'Wilson',
    created_at: new Date('2024-03-10'),
  },
]

const billingCustomers: BillingCustomer[] = [
  {
    customer_id: 'bill_1',
    email: 'john.smith@example.com', // Same as CRM john.smith
    fname: 'Jon', // Slight variation in name
    lname: 'Smith',
    mobile: '+1-555-0100',
    signup_date: new Date('2024-01-16'), // One day after CRM
  },
  {
    customer_id: 'bill_2',
    email: 'alice.brown@example.com',
    fname: 'Alice',
    lname: 'Brown',
    mobile: '+1-555-0300',
    signup_date: new Date('2024-04-05'),
  },
  {
    customer_id: 'bill_3',
    email: 'jane.doe@example.com', // Same as CRM jane.doe
    fname: 'Jane',
    lname: 'Doe',
    signup_date: new Date('2024-02-21'),
  },
]

const supportCustomers: SupportCustomer[] = [
  {
    ticket_user_id: 'sup_1',
    contact_email: 'bob.wilson@example.com', // Same as CRM bob.wilson
    given_name: 'Robert',
    family_name: 'Wilson',
    phone_number: '+1-555-0400',
    registered: new Date('2024-03-11'),
  },
  {
    ticket_user_id: 'sup_2',
    contact_email: 'alice.brown@example.com', // Same as Billing alice.brown
    given_name: 'Alice',
    family_name: 'Brown',
    phone_number: '+1-555-0300',
    registered: new Date('2024-04-06'),
  },
  {
    ticket_user_id: 'sup_3',
    contact_email: 'charlie.davis@example.com',
    given_name: 'Charlie',
    family_name: 'Davis',
    registered: new Date('2024-05-01'),
  },
]

// ============================================================================
// Mock Database Adapters
// ============================================================================
// In a real application, you would use actual database adapters like Prisma

function createMockAdapter<T>(data: T[]): DatabaseAdapter<T> {
  return {
    count: async () => data.length,
    findAll: async () => data,
    findById: async (id) => data.find((record: any) => record.id === id) ?? null,
    findByField: async (field, value) =>
      data.filter((record: any) => record[field] === value),
    create: async (record) => record,
    update: async (id, updates) => ({ ...updates, id } as T),
    delete: async () => undefined,
    findMany: async () => data,
  }
}

const crmAdapter = createMockAdapter(crmCustomers)
const billingAdapter = createMockAdapter(billingCustomers)
const supportAdapter = createMockAdapter(supportCustomers)

// Mock output adapter (would write to unified customers table)
const outputRecords: UnifiedCustomer[] = []
const outputAdapter = {
  ...createMockAdapter(outputRecords),
  create: async (record: UnifiedCustomer) => {
    outputRecords.push(record)
    return record
  },
}

// ============================================================================
// Configuration
// ============================================================================

/**
 * Configure multi-source consolidation with within-source-first matching
 *
 * This approach:
 * 1. First deduplicates within each source (CRM, Billing, Support)
 * 2. Then matches the deduplicated records across sources
 * 3. Merges matches using source priority and conflict resolution strategies
 *
 * Source Priority (highest to lowest):
 * - CRM (priority 3): Most complete and authoritative data
 * - Billing (priority 2): Financial data, good contact info
 * - Support (priority 1): May have outdated or partial data
 */
const consolidationConfig = HaveWeMet.consolidation<UnifiedCustomer>()
  // Configure CRM source (highest priority)
  .source<CRMCustomer>('crm', (source) =>
    source
      .name('CRM Database')
      .adapter(crmAdapter)
      .mapping((map) =>
        map
          // Map fields from CRM schema to unified schema
          .field('email')
          .from('email_address')
          .field('firstName')
          .from('first_name')
          .field('lastName')
          .from('last_name')
          .field('phone')
          .from('phone')
          .field('createdAt')
          .from('created_at')
          // Add source tracking
          .field('source')
          .transform(() => 'crm')
      )
      .priority(3) // Highest priority
  )

  // Configure Billing source (medium priority)
  .source<BillingCustomer>('billing', (source) =>
    source
      .name('Billing System')
      .adapter(billingAdapter)
      .mapping((map) =>
        map
          .field('email')
          .from('email')
          .field('firstName')
          .from('fname')
          .field('lastName')
          .from('lname')
          .field('phone')
          .from('mobile')
          .field('createdAt')
          .from('signup_date')
          .field('source')
          .transform(() => 'billing')
      )
      .priority(2)
  )

  // Configure Support source (lowest priority)
  .source<SupportCustomer>('support', (source) =>
    source
      .name('Support Ticketing System')
      .adapter(supportAdapter)
      .mapping((map) =>
        map
          .field('email')
          .from('contact_email')
          .field('firstName')
          .from('given_name')
          .field('lastName')
          .from('family_name')
          .field('phone')
          .from('phone_number')
          .field('createdAt')
          .from('registered')
          .field('source')
          .transform(() => 'support')
      )
      .priority(1) // Lowest priority
  )

  // Use within-source-first matching strategy
  .matchingScope('within-source-first')

  // Configure matching rules (applied after schema mapping)
  .matching((match) =>
    match
      // Email is the strongest identifier
      .field('email')
      .strategy('exact')
      .weight(25)
      // Names use fuzzy matching for typos
      .field('firstName')
      .strategy('jaro-winkler')
      .weight(12)
      .threshold(0.85)
      .field('lastName')
      .strategy('jaro-winkler')
      .weight(12)
      .threshold(0.85)
      // Phone is optional but helpful when present
      .field('phone')
      .strategy('exact')
      .weight(10)
  )

  // Set matching thresholds
  .thresholds({
    noMatch: 25, // Below this = different customers
    definiteMatch: 45, // Above this = same customer
  })

  // Configure conflict resolution
  .conflictResolution((cr) =>
    cr
      // Use source priority by default (CRM > Billing > Support)
      .useSourcePriority(true)
      // Default strategy: prefer non-null values
      .defaultStrategy('preferNonNull')
      // For createdAt, prefer the earlier date (first interaction)
      .fieldStrategy('createdAt', 'preferOlder')
      // For phone, prefer non-null (some sources may not have it)
      .fieldStrategy('phone', 'preferNonNull')
  )

  // Specify output adapter and enable writing
  .outputAdapter(outputAdapter)
  .writeOutput(true)

  // Build the configuration
  .build()

// ============================================================================
// Execution
// ============================================================================

async function runConsolidation() {
  console.log('='.repeat(80))
  console.log('Multi-Source Customer Consolidation Example')
  console.log('='.repeat(80))
  console.log()

  console.log('Input Data:')
  console.log(`- CRM: ${crmCustomers.length} customers`)
  console.log(`- Billing: ${billingCustomers.length} customers`)
  console.log(`- Support: ${supportCustomers.length} customers`)
  console.log(`- Total input records: ${crmCustomers.length + billingCustomers.length + supportCustomers.length}`)
  console.log()

  console.log('Expected Consolidation:')
  console.log('- john.smith@example.com: CRM + Billing (same person)')
  console.log('- jane.doe@example.com: CRM + Billing (same person)')
  console.log('- bob.wilson@example.com: CRM + Support (same person)')
  console.log('- alice.brown@example.com: Billing + Support (same person)')
  console.log('- charlie.davis@example.com: Support only (unique)')
  console.log()
  console.log('Expected output: 5 unified customer records')
  console.log()
  console.log('-'.repeat(80))
  console.log('Processing...')
  console.log('-'.repeat(80))
  console.log()

  // In a real application, you would execute the consolidation here
  // This would involve:
  // 1. Loading records from each source via adapters
  // 2. Mapping to unified schema
  // 3. Matching within sources
  // 4. Matching across sources
  // 5. Merging matches with source priority
  // 6. Writing golden records to output adapter

  console.log('Results:')
  console.log()
  console.log('Golden Records Created:')
  console.log()

  // Simulate consolidated results
  const goldenRecords: UnifiedCustomer[] = [
    {
      id: 'unified_1',
      email: 'john.smith@example.com',
      firstName: 'John', // From CRM (higher priority than Billing's "Jon")
      lastName: 'Smith',
      phone: '+1-555-0100',
      createdAt: new Date('2024-01-15'), // Older date preferred
      source: 'crm',
    },
    {
      id: 'unified_2',
      email: 'jane.doe@example.com',
      firstName: 'Jane',
      lastName: 'Doe',
      phone: '+1-555-0200', // From CRM
      createdAt: new Date('2024-02-20'),
      source: 'crm',
    },
    {
      id: 'unified_3',
      email: 'bob.wilson@example.com',
      firstName: 'Robert',
      lastName: 'Wilson',
      phone: '+1-555-0400', // From Support (CRM had no phone)
      createdAt: new Date('2024-03-10'), // Earlier date from CRM
      source: 'crm',
    },
    {
      id: 'unified_4',
      email: 'alice.brown@example.com',
      firstName: 'Alice',
      lastName: 'Brown',
      phone: '+1-555-0300',
      createdAt: new Date('2024-04-05'), // Billing date
      source: 'billing',
    },
    {
      id: 'unified_5',
      email: 'charlie.davis@example.com',
      firstName: 'Charlie',
      lastName: 'Davis',
      createdAt: new Date('2024-05-01'),
      source: 'support',
    },
  ]

  goldenRecords.forEach((record, index) => {
    console.log(`${index + 1}. ${record.firstName} ${record.lastName}`)
    console.log(`   Email: ${record.email}`)
    console.log(`   Phone: ${record.phone || 'N/A'}`)
    console.log(`   Created: ${record.createdAt.toISOString().split('T')[0]}`)
    console.log(`   Primary Source: ${record.source}`)
    console.log()
  })

  console.log('-'.repeat(80))
  console.log('Summary:')
  console.log('-'.repeat(80))
  console.log(`Input records: ${crmCustomers.length + billingCustomers.length + supportCustomers.length}`)
  console.log(`Output records: ${goldenRecords.length}`)
  console.log(`Duplicates found: ${crmCustomers.length + billingCustomers.length + supportCustomers.length - goldenRecords.length}`)
  console.log(`Deduplication rate: ${(((crmCustomers.length + billingCustomers.length + supportCustomers.length - goldenRecords.length) / (crmCustomers.length + billingCustomers.length + supportCustomers.length)) * 100).toFixed(1)}%`)
  console.log()
  console.log('Consolidation complete!')
}

// Run the example
runConsolidation().catch(console.error)
