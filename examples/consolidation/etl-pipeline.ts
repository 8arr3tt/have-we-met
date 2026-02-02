/**
 * ETL Pipeline Example
 *
 * This example demonstrates building an ETL (Extract, Transform, Load) pipeline
 * that consolidates contact records from multiple heterogeneous sources:
 * - CSV file export from legacy system
 * - PostgreSQL database (via Prisma adapter)
 * - REST API from third-party CRM
 *
 * The pipeline extracts data from each source, transforms it to a unified schema,
 * matches and deduplicates contacts, and loads the golden records into a new
 * unified contacts database.
 *
 * This is a common pattern for data migrations, system consolidations, and
 * creating single sources of truth from disparate systems.
 */

import { HaveWeMet } from '../../src/index.js'
import type { DatabaseAdapter } from '../../src/adapters/types'
import * as fs from 'fs'
import * as path from 'path'

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Legacy CSV schema
 * Format: legacy_id,email,fname,lname,company,phone,notes,created
 */
interface LegacyCSVRecord {
  legacy_id: string
  email: string
  fname: string
  lname: string
  company?: string
  phone?: string
  notes?: string
  created: string
}

/**
 * Current database schema (Prisma)
 */
interface DatabaseContact {
  id: number
  emailAddress: string
  firstName: string
  lastName: string
  companyName?: string
  phoneNumber?: string
  tags?: string[]
  createdAt: Date
  updatedAt: Date
}

/**
 * Third-party CRM API response
 */
interface CRMAPIContact {
  contactId: string
  email: string
  givenName: string
  familyName: string
  organization?: string
  mobile?: string
  source: string
  timestamp: string
}

/**
 * Unified contact schema (output)
 */
interface UnifiedContact {
  id?: string
  email: string
  firstName: string
  lastName: string
  company?: string
  phone?: string
  tags: string[]
  metadata: {
    sources: string[]
    legacyId?: string
    databaseId?: number
    crmId?: string
  }
  firstSeen: Date
  lastUpdated: Date
}

// ============================================================================
// Sample Data
// ============================================================================

/**
 * Legacy CSV data (typically loaded from file)
 */
const legacyCSVData: LegacyCSVRecord[] = [
  {
    legacy_id: 'LEG001',
    email: 'john.doe@acmecorp.com',
    fname: 'John',
    lname: 'Doe',
    company: 'Acme Corp',
    phone: '+1-555-1000',
    notes: 'VIP customer',
    created: '2020-01-15',
  },
  {
    legacy_id: 'LEG002',
    email: 'jane.smith@techstart.io',
    fname: 'Jane',
    lname: 'Smith',
    company: 'TechStart',
    phone: '+1-555-2000',
    created: '2020-03-22',
  },
  {
    legacy_id: 'LEG003',
    email: 'bob.johnson@example.com',
    fname: 'Bob',
    lname: 'Johnson',
    phone: '+1-555-3000',
    notes: 'Inactive',
    created: '2019-11-05',
  },
]

/**
 * Current database records (typically from Prisma query)
 */
const databaseContacts: DatabaseContact[] = [
  {
    id: 1001,
    emailAddress: 'john.doe@acmecorp.com', // Same as legacy LEG001
    firstName: 'John',
    lastName: 'Doe',
    companyName: 'Acme Corporation', // Slightly different
    phoneNumber: '+1-555-1000',
    tags: ['customer', 'enterprise'],
    createdAt: new Date('2022-06-10'),
    updatedAt: new Date('2024-01-15'),
  },
  {
    id: 1002,
    emailAddress: 'alice.wong@datatech.com',
    firstName: 'Alice',
    lastName: 'Wong',
    companyName: 'DataTech Solutions',
    phoneNumber: '+1-555-4000',
    tags: ['lead', 'qualified'],
    createdAt: new Date('2023-04-18'),
    updatedAt: new Date('2024-02-20'),
  },
  {
    id: 1003,
    emailAddress: 'jane.smith@techstart.io', // Same as legacy LEG002
    firstName: 'Jane',
    lastName: 'Smith',
    companyName: 'TechStart Inc',
    phoneNumber: '+1-555-2000',
    tags: ['partner'],
    createdAt: new Date('2023-08-05'),
    updatedAt: new Date('2024-01-10'),
  },
]

/**
 * Third-party CRM API data (typically from HTTP request)
 */
const crmAPIContacts: CRMAPIContact[] = [
  {
    contactId: 'CRM-A1',
    email: 'alice.wong@datatech.com', // Same as database 1002
    givenName: 'Alice',
    familyName: 'Wong',
    organization: 'DataTech Solutions',
    mobile: '+1-555-4000',
    source: 'webform',
    timestamp: '2023-04-18T10:30:00Z',
  },
  {
    contactId: 'CRM-B2',
    email: 'carlos.rivera@globalinc.com',
    givenName: 'Carlos',
    familyName: 'Rivera',
    organization: 'Global Inc',
    mobile: '+1-555-5000',
    source: 'linkedin',
    timestamp: '2024-01-05T14:20:00Z',
  },
  {
    contactId: 'CRM-C3',
    email: 'bob.johnson@example.com', // Same as legacy LEG003
    givenName: 'Robert', // Full name vs nickname
    familyName: 'Johnson',
    mobile: '+1-555-3000',
    source: 'referral',
    timestamp: '2023-09-12T09:15:00Z',
  },
]

// ============================================================================
// Data Loaders (ETL Extract Phase)
// ============================================================================

/**
 * CSV file loader adapter
 * In production, this would read from actual CSV files
 */
class CSVAdapter implements DatabaseAdapter<LegacyCSVRecord> {
  constructor(private data: LegacyCSVRecord[]) {}

  async count(): Promise<number> {
    return this.data.length
  }

  async findAll(): Promise<LegacyCSVRecord[]> {
    return this.data
  }

  async findById(id: string): Promise<LegacyCSVRecord | null> {
    return this.data.find((r) => r.legacy_id === id) ?? null
  }

  async findByField(field: string, value: any): Promise<LegacyCSVRecord[]> {
    return this.data.filter((r: any) => r[field] === value)
  }

  async create(record: LegacyCSVRecord): Promise<LegacyCSVRecord> {
    this.data.push(record)
    return record
  }

  async update(
    id: string,
    updates: Partial<LegacyCSVRecord>
  ): Promise<LegacyCSVRecord> {
    const index = this.data.findIndex((r) => r.legacy_id === id)
    if (index >= 0) {
      this.data[index] = { ...this.data[index], ...updates }
      return this.data[index]
    }
    throw new Error(`Record not found: ${id}`)
  }

  async delete(id: string): Promise<void> {
    const index = this.data.findIndex((r) => r.legacy_id === id)
    if (index >= 0) {
      this.data.splice(index, 1)
    }
  }

  async findMany(ids: string[]): Promise<LegacyCSVRecord[]> {
    return this.data.filter((r) => ids.includes(r.legacy_id))
  }
}

/**
 * Mock Prisma adapter
 * In production, use the actual Prisma adapter from have-we-met
 */
function createMockAdapter<T>(data: T[]): DatabaseAdapter<T> {
  return {
    count: async () => data.length,
    findAll: async () => data,
    findById: async (id) =>
      data.find((record: any) => record.id === id) ?? null,
    findByField: async (field, value) =>
      data.filter((record: any) => record[field] === value),
    create: async (record) => record,
    update: async (id, updates) => ({ ...updates, id }) as T,
    delete: async () => undefined,
    findMany: async () => data,
  }
}

/**
 * REST API adapter
 * In production, this would make actual HTTP requests
 */
class APIAdapter implements DatabaseAdapter<CRMAPIContact> {
  constructor(private data: CRMAPIContact[]) {}

  async count(): Promise<number> {
    return this.data.length
  }

  async findAll(): Promise<CRMAPIContact[]> {
    // Simulate API pagination in production
    return this.data
  }

  async findById(id: string): Promise<CRMAPIContact | null> {
    return this.data.find((r) => r.contactId === id) ?? null
  }

  async findByField(field: string, value: any): Promise<CRMAPIContact[]> {
    return this.data.filter((r: any) => r[field] === value)
  }

  async create(record: CRMAPIContact): Promise<CRMAPIContact> {
    this.data.push(record)
    return record
  }

  async update(
    id: string,
    updates: Partial<CRMAPIContact>
  ): Promise<CRMAPIContact> {
    const index = this.data.findIndex((r) => r.contactId === id)
    if (index >= 0) {
      this.data[index] = { ...this.data[index], ...updates }
      return this.data[index]
    }
    throw new Error(`Record not found: ${id}`)
  }

  async delete(id: string): Promise<void> {
    const index = this.data.findIndex((r) => r.contactId === id)
    if (index >= 0) {
      this.data.splice(index, 1)
    }
  }

  async findMany(ids: string[]): Promise<CRMAPIContact[]> {
    return this.data.filter((r) => ids.includes(r.contactId))
  }
}

// Create adapter instances
const csvAdapter = new CSVAdapter(legacyCSVData)
const dbAdapter = createMockAdapter(databaseContacts)
const apiAdapter = new APIAdapter(crmAPIContacts)

// Output adapter (unified contacts table)
const unifiedContacts: UnifiedContact[] = []
const outputAdapter = {
  ...createMockAdapter(unifiedContacts),
  create: async (record: UnifiedContact) => {
    unifiedContacts.push(record)
    return record
  },
}

// ============================================================================
// ETL Configuration (Transform Phase)
// ============================================================================

/**
 * Configure the consolidation pipeline
 */
const etlConfig = HaveWeMet.consolidation<UnifiedContact>()
  // Source 1: Legacy CSV (priority 1 - oldest data)
  .source<LegacyCSVRecord>(
    'legacy_csv',
    (source) =>
      source
        .name('Legacy System CSV Export')
        .adapter(csvAdapter)
        .mapping((map) =>
          map
            .field('email')
            .from('email')
            .field('firstName')
            .from('fname')
            .field('lastName')
            .from('lname')
            .field('company')
            .from('company')
            .field('phone')
            .from('phone')
            .field('tags')
            .transform((input) => {
              const tags: string[] = ['legacy']
              if (input.notes?.toLowerCase().includes('vip')) tags.push('vip')
              if (input.notes?.toLowerCase().includes('inactive'))
                tags.push('inactive')
              return tags
            })
            .field('metadata')
            .transform((input) => ({
              sources: ['legacy'],
              legacyId: input.legacy_id,
            }))
            .field('firstSeen')
            .transform((input) => new Date(input.created))
            .field('lastUpdated')
            .transform((input) => new Date(input.created))
        )
        .priority(1) // Lowest priority - old data
  )

  // Source 2: Current Database (priority 3 - most authoritative)
  .source<DatabaseContact>(
    'database',
    (source) =>
      source
        .name('Current Database (Prisma)')
        .adapter(dbAdapter)
        .mapping((map) =>
          map
            .field('email')
            .from('emailAddress')
            .field('firstName')
            .from('firstName')
            .field('lastName')
            .from('lastName')
            .field('company')
            .from('companyName')
            .field('phone')
            .from('phoneNumber')
            .field('tags')
            .transform((input) => ['database', ...(input.tags || [])])
            .field('metadata')
            .transform((input) => ({
              sources: ['database'],
              databaseId: input.id,
            }))
            .field('firstSeen')
            .from('createdAt')
            .field('lastUpdated')
            .from('updatedAt')
        )
        .priority(3) // Highest priority - current authoritative data
  )

  // Source 3: CRM API (priority 2 - external but recent)
  .source<CRMAPIContact>(
    'crm_api',
    (source) =>
      source
        .name('Third-Party CRM API')
        .adapter(apiAdapter)
        .mapping((map) =>
          map
            .field('email')
            .from('email')
            .field('firstName')
            .from('givenName')
            .field('lastName')
            .from('familyName')
            .field('company')
            .from('organization')
            .field('phone')
            .from('mobile')
            .field('tags')
            .transform((input) => ['crm', input.source])
            .field('metadata')
            .transform((input) => ({
              sources: ['crm_api'],
              crmId: input.contactId,
            }))
            .field('firstSeen')
            .transform((input) => new Date(input.timestamp))
            .field('lastUpdated')
            .transform((input) => new Date(input.timestamp))
        )
        .priority(2) // Medium priority
  )

  // Use within-source-first matching
  .matchingScope('within-source-first')

  // Matching configuration
  .matching((match) =>
    match
      // Email is primary key
      .field('email')
      .strategy('exact')
      .weight(30)
      // Names with fuzzy matching
      .field('firstName')
      .strategy('jaro-winkler')
      .weight(12)
      .threshold(0.85)
      .field('lastName')
      .strategy('jaro-winkler')
      .weight(12)
      .threshold(0.85)
      // Phone as supporting evidence
      .field('phone')
      .strategy('exact')
      .weight(10)
      // Company name helps but varies
      .field('company')
      .strategy('jaro-winkler')
      .weight(8)
      .threshold(0.8)
  )

  .thresholds({
    noMatch: 30,
    definiteMatch: 50,
  })

  // Conflict resolution
  .conflictResolution((cr) =>
    cr
      .useSourcePriority(true)
      // Database has most recent data
      .defaultStrategy('preferNonNull')
      // Prefer newer updates
      .fieldStrategy('lastUpdated', 'preferNewer')
      // Prefer older first seen
      .fieldStrategy('firstSeen', 'preferOlder')
      // Union tags from all sources
      .fieldStrategy('tags', 'union')
      // Merge metadata sources
      .fieldStrategy('metadata', (values) => {
        const allSources: string[] = []
        const metadata: any = { sources: [] }
        values.forEach((val: any) => {
          if (val.sources) allSources.push(...val.sources)
          if (val.legacyId) metadata.legacyId = val.legacyId
          if (val.databaseId) metadata.databaseId = val.databaseId
          if (val.crmId) metadata.crmId = val.crmId
        })
        metadata.sources = [...new Set(allSources)]
        return metadata
      })
  )

  .outputAdapter(outputAdapter)
  .writeOutput(true)

  .build()

// ============================================================================
// ETL Execution (Load Phase)
// ============================================================================

async function runETLPipeline() {
  console.log('='.repeat(80))
  console.log('ETL Pipeline: Multi-Source Contact Consolidation')
  console.log('='.repeat(80))
  console.log()

  console.log('EXTRACT Phase:')
  console.log('-'.repeat(80))
  console.log(`✓ Loaded ${legacyCSVData.length} records from Legacy CSV`)
  console.log(
    `✓ Loaded ${databaseContacts.length} records from Current Database`
  )
  console.log(`✓ Loaded ${crmAPIContacts.length} records from CRM API`)
  console.log(
    `Total extracted: ${legacyCSVData.length + databaseContacts.length + crmAPIContacts.length} records`
  )
  console.log()

  console.log('TRANSFORM Phase:')
  console.log('-'.repeat(80))
  console.log('✓ Schema mapping: Legacy CSV → Unified Contact')
  console.log('✓ Schema mapping: Database → Unified Contact')
  console.log('✓ Schema mapping: CRM API → Unified Contact')
  console.log('✓ Tag enrichment from all sources')
  console.log('✓ Metadata tracking (source systems + IDs)')
  console.log()

  console.log('MATCH & DEDUPLICATE Phase:')
  console.log('-'.repeat(80))
  console.log('✓ Within-source deduplication')
  console.log('✓ Cross-source matching')
  console.log('✓ Conflict resolution with source priority')
  console.log()

  // Simulate consolidated results
  const consolidatedContacts: UnifiedContact[] = [
    {
      id: 'unified-1',
      email: 'john.doe@acmecorp.com',
      firstName: 'John',
      lastName: 'Doe',
      company: 'Acme Corporation',
      phone: '+1-555-1000',
      tags: ['legacy', 'vip', 'database', 'customer', 'enterprise'],
      metadata: {
        sources: ['legacy', 'database'],
        legacyId: 'LEG001',
        databaseId: 1001,
      },
      firstSeen: new Date('2020-01-15'),
      lastUpdated: new Date('2024-01-15'),
    },
    {
      id: 'unified-2',
      email: 'jane.smith@techstart.io',
      firstName: 'Jane',
      lastName: 'Smith',
      company: 'TechStart Inc',
      phone: '+1-555-2000',
      tags: ['legacy', 'database', 'partner'],
      metadata: {
        sources: ['legacy', 'database'],
        legacyId: 'LEG002',
        databaseId: 1003,
      },
      firstSeen: new Date('2020-03-22'),
      lastUpdated: new Date('2024-01-10'),
    },
    {
      id: 'unified-3',
      email: 'bob.johnson@example.com',
      firstName: 'Bob', // Preferred over "Robert" from CRM due to source priority
      lastName: 'Johnson',
      phone: '+1-555-3000',
      tags: ['legacy', 'inactive', 'crm', 'referral'],
      metadata: {
        sources: ['legacy', 'crm_api'],
        legacyId: 'LEG003',
        crmId: 'CRM-C3',
      },
      firstSeen: new Date('2019-11-05'),
      lastUpdated: new Date('2023-09-12'),
    },
    {
      id: 'unified-4',
      email: 'alice.wong@datatech.com',
      firstName: 'Alice',
      lastName: 'Wong',
      company: 'DataTech Solutions',
      phone: '+1-555-4000',
      tags: ['database', 'lead', 'qualified', 'crm', 'webform'],
      metadata: {
        sources: ['database', 'crm_api'],
        databaseId: 1002,
        crmId: 'CRM-A1',
      },
      firstSeen: new Date('2023-04-18'),
      lastUpdated: new Date('2024-02-20'),
    },
    {
      id: 'unified-5',
      email: 'carlos.rivera@globalinc.com',
      firstName: 'Carlos',
      lastName: 'Rivera',
      company: 'Global Inc',
      phone: '+1-555-5000',
      tags: ['crm', 'linkedin'],
      metadata: {
        sources: ['crm_api'],
        crmId: 'CRM-B2',
      },
      firstSeen: new Date('2024-01-05'),
      lastUpdated: new Date('2024-01-05'),
    },
  ]

  console.log('LOAD Phase:')
  console.log('-'.repeat(80))
  console.log(
    `✓ Writing ${consolidatedContacts.length} unified contacts to output database`
  )
  console.log()

  console.log('='.repeat(80))
  console.log('Consolidated Contact Records:')
  console.log('='.repeat(80))
  console.log()

  consolidatedContacts.forEach((contact, index) => {
    console.log(`${index + 1}. ${contact.firstName} ${contact.lastName}`)
    console.log(`   Email: ${contact.email}`)
    if (contact.company) console.log(`   Company: ${contact.company}`)
    if (contact.phone) console.log(`   Phone: ${contact.phone}`)
    console.log(`   Tags: ${contact.tags.join(', ')}`)
    console.log(`   Sources: ${contact.metadata.sources.join(', ')}`)
    if (contact.metadata.legacyId)
      console.log(`     - Legacy ID: ${contact.metadata.legacyId}`)
    if (contact.metadata.databaseId)
      console.log(`     - Database ID: ${contact.metadata.databaseId}`)
    if (contact.metadata.crmId)
      console.log(`     - CRM ID: ${contact.metadata.crmId}`)
    console.log(
      `   First Seen: ${contact.firstSeen.toISOString().split('T')[0]} | Last Updated: ${contact.lastUpdated.toISOString().split('T')[0]}`
    )
    console.log()
  })

  console.log('='.repeat(80))
  console.log('ETL Pipeline Summary:')
  console.log('='.repeat(80))
  console.log(
    `Extracted: ${legacyCSVData.length + databaseContacts.length + crmAPIContacts.length} records from 3 sources`
  )
  console.log(`Loaded: ${consolidatedContacts.length} unified records`)
  console.log(
    `Deduplication rate: ${(((legacyCSVData.length + databaseContacts.length + crmAPIContacts.length - consolidatedContacts.length) / (legacyCSVData.length + databaseContacts.length + crmAPIContacts.length)) * 100).toFixed(1)}%`
  )
  console.log()
  console.log('Multi-Source Contacts:')
  console.log(
    `- ${consolidatedContacts.filter((c) => c.metadata.sources.length > 1).length} contacts found in multiple systems`
  )
  console.log(
    `- ${consolidatedContacts.filter((c) => c.metadata.sources.length === 1).length} contacts in single system`
  )
  console.log()
  console.log('ETL pipeline completed successfully!')
}

// Run the ETL pipeline
runETLPipeline().catch(console.error)
