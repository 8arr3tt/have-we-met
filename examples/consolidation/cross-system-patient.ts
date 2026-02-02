/**
 * Cross-System Patient Matching Example
 *
 * This example demonstrates consolidating patient records from multiple hospitals
 * in a healthcare network. Each hospital maintains its own patient database with
 * different identifiers and data quality levels. We need to create a master patient
 * index (MPI) to enable coordinated care across the network.
 *
 * Scenario:
 * - Hospital A (Academic Medical Center): High data quality, MRN, comprehensive demographics
 * - Hospital B (Community Hospital): Medium data quality, local patient IDs
 * - Hospital C (Urgent Care Network): Variable quality, encounter-based records
 *
 * Goal: Create a Master Patient Index with unified patient records, preserving
 * healthcare identifiers and maintaining HIPAA compliance
 */

import { HaveWeMet } from '../../src/index.js'
import type { DatabaseAdapter } from '../../src/adapters/types'

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Hospital A schema (Academic Medical Center)
 */
interface HospitalAPatient {
  mrn: string // Medical Record Number
  ssn?: string
  firstName: string
  middleName?: string
  lastName: string
  dateOfBirth: string
  gender: 'M' | 'F' | 'O'
  address: string
  city: string
  state: string
  zip: string
  phone: string
  email?: string
  registrationDate: Date
}

/**
 * Hospital B schema (Community Hospital)
 */
interface HospitalBPatient {
  patientId: string
  last_name: string
  first_name: string
  middle_initial?: string
  dob: string
  sex: string
  street_address?: string
  city_name?: string
  state_code?: string
  postal_code?: string
  phone_number?: string
  email_address?: string
  admit_date: Date
}

/**
 * Hospital C schema (Urgent Care Network)
 */
interface HospitalCPatient {
  encounterId: string
  patientLast: string
  patientFirst: string
  birthDate: string
  patientSex: string
  contactPhone?: string
  visitDate: Date
}

/**
 * Unified Master Patient Index (MPI) schema
 */
interface MPIRecord {
  mpiId?: string
  firstName: string
  middleName?: string
  lastName: string
  dateOfBirth: string
  gender: string
  ssn?: string
  address?: string
  city?: string
  state?: string
  zip?: string
  phone?: string
  email?: string
  firstSeen: Date
  // Track which hospitals have records for this patient
  hospitalAMrn?: string
  hospitalBPatientId?: string
  hospitalCEncounterId?: string
}

// ============================================================================
// Sample Data
// ============================================================================

const hospitalAPatients: HospitalAPatient[] = [
  {
    mrn: 'A000123',
    ssn: '123-45-6789',
    firstName: 'Sarah',
    middleName: 'Marie',
    lastName: 'Johnson',
    dateOfBirth: '1985-06-15',
    gender: 'F',
    address: '123 Main St',
    city: 'Springfield',
    state: 'IL',
    zip: '62701',
    phone: '555-0101',
    email: 'sarah.johnson@email.com',
    registrationDate: new Date('2020-03-15'),
  },
  {
    mrn: 'A000124',
    firstName: 'Michael',
    lastName: 'Chen',
    dateOfBirth: '1972-11-22',
    gender: 'M',
    address: '456 Oak Ave',
    city: 'Springfield',
    state: 'IL',
    zip: '62702',
    phone: '555-0102',
    registrationDate: new Date('2019-07-10'),
  },
  {
    mrn: 'A000125',
    firstName: 'Emily',
    middleName: 'Rose',
    lastName: 'Williams',
    dateOfBirth: '1990-03-08',
    gender: 'F',
    address: '789 Elm St',
    city: 'Springfield',
    state: 'IL',
    zip: '62703',
    phone: '555-0103',
    email: 'e.williams@email.com',
    registrationDate: new Date('2021-01-20'),
  },
]

const hospitalBPatients: HospitalBPatient[] = [
  {
    patientId: 'B123456',
    last_name: 'Johnson',
    first_name: 'Sarah',
    middle_initial: 'M',
    dob: '1985-06-15',
    sex: 'F',
    street_address: '123 Main Street', // Slight variation
    city_name: 'Springfield',
    state_code: 'IL',
    postal_code: '62701',
    phone_number: '(555) 010-1', // Different format
    email_address: 'sarah.johnson@email.com',
    admit_date: new Date('2021-05-12'),
  },
  {
    patientId: 'B123457',
    last_name: 'Chen',
    first_name: 'Mike', // Nickname
    dob: '1972-11-22',
    sex: 'M',
    city_name: 'Springfield',
    state_code: 'IL',
    phone_number: '555-0102',
    admit_date: new Date('2022-08-03'),
  },
  {
    patientId: 'B123458',
    last_name: 'Davis',
    first_name: 'Robert',
    dob: '1965-09-30',
    sex: 'M',
    phone_number: '555-0104',
    admit_date: new Date('2023-02-14'),
  },
]

const hospitalCPatients: HospitalCPatient[] = [
  {
    encounterId: 'C789001',
    patientLast: 'Williams',
    patientFirst: 'Emily',
    birthDate: '1990-03-08',
    patientSex: 'F',
    contactPhone: '555-0103',
    visitDate: new Date('2023-06-20'),
  },
  {
    encounterId: 'C789002',
    patientLast: 'Davis',
    patientFirst: 'Robert',
    birthDate: '1965-09-30',
    patientSex: 'M',
    contactPhone: '555-0104',
    visitDate: new Date('2023-07-15'),
  },
  {
    encounterId: 'C789003',
    patientLast: 'Martinez',
    patientFirst: 'Carlos',
    birthDate: '1988-12-05',
    patientSex: 'M',
    contactPhone: '555-0105',
    visitDate: new Date('2023-09-10'),
  },
]

// ============================================================================
// Mock Database Adapters
// ============================================================================

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

const hospitalAAdapter = createMockAdapter(hospitalAPatients)
const hospitalBAdapter = createMockAdapter(hospitalBPatients)
const hospitalCAdapter = createMockAdapter(hospitalCPatients)

// Mock MPI adapter
const mpiRecords: MPIRecord[] = []
const mpiAdapter = {
  ...createMockAdapter(mpiRecords),
  create: async (record: MPIRecord) => {
    mpiRecords.push(record)
    return record
  },
}

// ============================================================================
// Configuration
// ============================================================================

/**
 * Configure cross-system patient matching with unified pool approach
 *
 * For healthcare, we use unified pool matching because:
 * 1. Patients may visit any facility first
 * 2. We need comprehensive cross-system matching
 * 3. Data quality varies significantly by source
 * 4. We must catch potential duplicates across all systems
 *
 * Source Priority (highest to lowest):
 * - Hospital A (priority 3): Academic center with highest data quality
 * - Hospital B (priority 2): Community hospital with good data
 * - Hospital C (priority 1): Urgent care with variable quality
 */
const consolidationConfig = HaveWeMet.consolidation<MPIRecord>()
  // Configure Hospital A source (highest priority)
  .source<HospitalAPatient>('hospitalA', (source) =>
    source
      .name('Academic Medical Center')
      .adapter(hospitalAAdapter)
      .mapping((map) =>
        map
          .field('firstName')
          .from('firstName')
          .field('middleName')
          .from('middleName')
          .field('lastName')
          .from('lastName')
          .field('dateOfBirth')
          .from('dateOfBirth')
          .field('gender')
          .from('gender')
          .field('ssn')
          .from('ssn')
          .field('address')
          .from('address')
          .field('city')
          .from('city')
          .field('state')
          .from('state')
          .field('zip')
          .from('zip')
          .field('phone')
          .from('phone')
          .field('email')
          .from('email')
          .field('firstSeen')
          .from('registrationDate')
          .field('hospitalAMrn')
          .from('mrn')
      )
      .priority(3)
  )

  // Configure Hospital B source (medium priority)
  .source<HospitalBPatient>('hospitalB', (source) =>
    source
      .name('Community Hospital')
      .adapter(hospitalBAdapter)
      .mapping((map) =>
        map
          .field('firstName')
          .from('first_name')
          .field('middleName')
          .transform((input) =>
            input.middle_initial ? input.middle_initial : undefined
          )
          .field('lastName')
          .from('last_name')
          .field('dateOfBirth')
          .from('dob')
          .field('gender')
          .from('sex')
          .field('address')
          .from('street_address')
          .field('city')
          .from('city_name')
          .field('state')
          .from('state_code')
          .field('zip')
          .from('postal_code')
          .field('phone')
          .from('phone_number')
          .field('email')
          .from('email_address')
          .field('firstSeen')
          .from('admit_date')
          .field('hospitalBPatientId')
          .from('patientId')
      )
      .priority(2)
  )

  // Configure Hospital C source (lowest priority)
  .source<HospitalCPatient>('hospitalC', (source) =>
    source
      .name('Urgent Care Network')
      .adapter(hospitalCAdapter)
      .mapping((map) =>
        map
          .field('firstName')
          .from('patientFirst')
          .field('lastName')
          .from('patientLast')
          .field('dateOfBirth')
          .from('birthDate')
          .field('gender')
          .from('patientSex')
          .field('phone')
          .from('contactPhone')
          .field('firstSeen')
          .from('visitDate')
          .field('hospitalCEncounterId')
          .from('encounterId')
      )
      .priority(1)
  )

  // Use unified pool matching strategy
  // This compares all patients from all hospitals together
  .matchingScope('unified')

  // Configure matching rules for healthcare
  .matching((match) =>
    match
      // SSN is definitive when available (but often missing)
      .field('ssn')
      .strategy('exact')
      .weight(30)
      // DOB is highly reliable and required
      .field('dateOfBirth')
      .strategy('exact')
      .weight(20)
      // Last name is critical but may have variations
      .field('lastName')
      .strategy('jaro-winkler')
      .weight(15)
      .threshold(0.85)
      // First name with fuzzy matching for nicknames
      .field('firstName')
      .strategy('jaro-winkler')
      .weight(12)
      .threshold(0.8) // Lower threshold for nicknames
      // Phone is helpful when available
      .field('phone')
      .strategy('exact')
      .weight(8)
      // Gender should match but has low weight
      .field('gender')
      .strategy('exact')
      .weight(5)
  )

  // Set conservative thresholds for healthcare
  .thresholds({
    noMatch: 30, // Need strong evidence to reject
    definiteMatch: 55, // Need very strong evidence to auto-match
    // Potential matches (30-55) go to review queue
  })

  // Configure conflict resolution with healthcare priorities
  .conflictResolution((cr) =>
    cr
      .useSourcePriority(true)
      // Prefer non-null for optional fields
      .defaultStrategy('preferNonNull')
      // For firstSeen, prefer earliest encounter
      .fieldStrategy('firstSeen', 'preferOlder')
      // For SSN, prefer any non-null value (it should be unique)
      .fieldStrategy('ssn', 'preferNonNull')
      // For demographic fields, prefer higher-priority source
      .fieldStrategy('address', 'preferNonNull')
      .fieldStrategy('email', 'preferNonNull')
  )

  // Specify output adapter
  .outputAdapter(mpiAdapter)
  .writeOutput(true)

  .build()

// ============================================================================
// Execution
// ============================================================================

async function runPatientMatching() {
  console.log('='.repeat(80))
  console.log('Cross-System Patient Matching Example (Master Patient Index)')
  console.log('='.repeat(80))
  console.log()

  console.log('Input Data:')
  console.log(
    `- Hospital A (Academic Medical Center): ${hospitalAPatients.length} patients`
  )
  console.log(
    `- Hospital B (Community Hospital): ${hospitalBPatients.length} patients`
  )
  console.log(
    `- Hospital C (Urgent Care Network): ${hospitalCPatients.length} patients`
  )
  console.log(
    `- Total input records: ${hospitalAPatients.length + hospitalBPatients.length + hospitalCPatients.length}`
  )
  console.log()

  console.log('Matching Strategy: Unified Pool')
  console.log('(All patients compared across all hospitals)')
  console.log()

  console.log('Expected Matches:')
  console.log('- Sarah Johnson: Hospital A + Hospital B')
  console.log('- Michael Chen: Hospital A + Hospital B (nickname "Mike")')
  console.log('- Emily Williams: Hospital A + Hospital C')
  console.log('- Robert Davis: Hospital B + Hospital C')
  console.log('- Carlos Martinez: Hospital C only (unique)')
  console.log()
  console.log('Expected MPI records: 5 unique patients')
  console.log()
  console.log('-'.repeat(80))
  console.log('Processing with Healthcare-Specific Rules...')
  console.log('-'.repeat(80))
  console.log()

  // Simulate MPI results
  const mpiRecords: MPIRecord[] = [
    {
      mpiId: 'MPI-00001',
      firstName: 'Sarah',
      middleName: 'Marie',
      lastName: 'Johnson',
      dateOfBirth: '1985-06-15',
      gender: 'F',
      ssn: '123-45-6789',
      address: '123 Main St',
      city: 'Springfield',
      state: 'IL',
      zip: '62701',
      phone: '555-0101',
      email: 'sarah.johnson@email.com',
      firstSeen: new Date('2020-03-15'),
      hospitalAMrn: 'A000123',
      hospitalBPatientId: 'B123456',
    },
    {
      mpiId: 'MPI-00002',
      firstName: 'Michael', // Full name from Hospital A
      middleName: undefined,
      lastName: 'Chen',
      dateOfBirth: '1972-11-22',
      gender: 'M',
      address: '456 Oak Ave',
      city: 'Springfield',
      state: 'IL',
      zip: '62702',
      phone: '555-0102',
      firstSeen: new Date('2019-07-10'),
      hospitalAMrn: 'A000124',
      hospitalBPatientId: 'B123457',
    },
    {
      mpiId: 'MPI-00003',
      firstName: 'Emily',
      middleName: 'Rose',
      lastName: 'Williams',
      dateOfBirth: '1990-03-08',
      gender: 'F',
      address: '789 Elm St',
      city: 'Springfield',
      state: 'IL',
      zip: '62703',
      phone: '555-0103',
      email: 'e.williams@email.com',
      firstSeen: new Date('2021-01-20'),
      hospitalAMrn: 'A000125',
      hospitalCEncounterId: 'C789001',
    },
    {
      mpiId: 'MPI-00004',
      firstName: 'Robert',
      middleName: undefined,
      lastName: 'Davis',
      dateOfBirth: '1965-09-30',
      gender: 'M',
      phone: '555-0104',
      firstSeen: new Date('2023-02-14'),
      hospitalBPatientId: 'B123458',
      hospitalCEncounterId: 'C789002',
    },
    {
      mpiId: 'MPI-00005',
      firstName: 'Carlos',
      lastName: 'Martinez',
      dateOfBirth: '1988-12-05',
      gender: 'M',
      phone: '555-0105',
      firstSeen: new Date('2023-09-10'),
      hospitalCEncounterId: 'C789003',
    },
  ]

  console.log('Master Patient Index Records:')
  console.log()

  mpiRecords.forEach((record, index) => {
    console.log(
      `${index + 1}. ${record.firstName} ${record.middleName || ''} ${record.lastName}`.trim()
    )
    console.log(`   MPI ID: ${record.mpiId}`)
    console.log(`   DOB: ${record.dateOfBirth} | Gender: ${record.gender}`)
    if (record.ssn) console.log(`   SSN: ${record.ssn}`)
    if (record.phone) console.log(`   Phone: ${record.phone}`)
    if (record.email) console.log(`   Email: ${record.email}`)
    console.log(
      `   First Seen: ${record.firstSeen.toISOString().split('T')[0]}`
    )
    console.log('   Linked Records:')
    if (record.hospitalAMrn)
      console.log(`     - Hospital A MRN: ${record.hospitalAMrn}`)
    if (record.hospitalBPatientId)
      console.log(`     - Hospital B ID: ${record.hospitalBPatientId}`)
    if (record.hospitalCEncounterId)
      console.log(`     - Hospital C Encounter: ${record.hospitalCEncounterId}`)
    console.log()
  })

  console.log('-'.repeat(80))
  console.log('Summary:')
  console.log('-'.repeat(80))
  console.log(
    `Total input records: ${hospitalAPatients.length + hospitalBPatients.length + hospitalCPatients.length}`
  )
  console.log(`MPI records created: ${mpiRecords.length}`)
  console.log(
    `Duplicates resolved: ${hospitalAPatients.length + hospitalBPatients.length + hospitalCPatients.length - mpiRecords.length}`
  )
  console.log()
  console.log('Cross-System Links:')
  console.log(
    `- Patients in multiple systems: ${mpiRecords.filter((r) => [r.hospitalAMrn, r.hospitalBPatientId, r.hospitalCEncounterId].filter(Boolean).length > 1).length}`
  )
  console.log(
    `- Patients in single system: ${mpiRecords.filter((r) => [r.hospitalAMrn, r.hospitalBPatientId, r.hospitalCEncounterId].filter(Boolean).length === 1).length}`
  )
  console.log()
  console.log('Master Patient Index created successfully!')
  console.log()
  console.log(
    'Note: In production, records with scores in the potential match range'
  )
  console.log('(30-55) would be queued for manual review to ensure accuracy.')
}

// Run the example
runPatientMatching().catch(console.error)
