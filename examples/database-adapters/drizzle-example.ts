import { HaveWeMet } from '../../src/index'
import { DrizzleAdapter } from '../../src/adapters/drizzle/drizzle-adapter'

type Patient = {
  id: string
  firstName: string
  lastName: string
  dateOfBirth: Date
  ssn?: string
  medicalRecordNumber: string
  phone?: string
  email?: string
  address?: string
  city?: string
  state?: string
  zipCode?: string
  insuranceId?: string
  lastVisit?: Date
}

async function patientMatchingExample() {
  console.log('=== Drizzle Adapter Example: Patient Matching ===\n')

  const db = null as unknown
  const patientsTable = null as unknown

  const adapter = new DrizzleAdapter<Patient>(db, patientsTable, {
    tableName: 'patients',
    primaryKey: 'id',
  })

  const resolver = HaveWeMet.schema<Patient>({
    id: { type: 'string' },
    firstName: { type: 'string', weight: 2 },
    lastName: { type: 'string', weight: 3 },
    dateOfBirth: { type: 'date', weight: 4 },
    ssn: { type: 'string', weight: 5, optional: true },
    medicalRecordNumber: { type: 'string', weight: 3 },
    phone: { type: 'string', weight: 2, optional: true },
    email: { type: 'string', weight: 2, optional: true },
    address: { type: 'string', weight: 1, optional: true },
    city: { type: 'string', weight: 1, optional: true },
    state: { type: 'string', weight: 1, optional: true },
    zipCode: { type: 'string', weight: 1, optional: true },
    insuranceId: { type: 'string', weight: 2, optional: true },
    lastVisit: { type: 'date', weight: 0, optional: true },
  })
    .blocking((block) =>
      block
        .on('lastName')
        .on('medicalRecordNumber')
        .on('ssn')
        .on('phone')
        .onSoundex('lastName')
        .onYear('dateOfBirth', 'birthYear')
    )
    .matching((match) =>
      match
        .compareWith('firstName', 'jaro-winkler', { threshold: 0.85 })
        .compareWith('lastName', 'jaro-winkler', { threshold: 0.9 })
        .compareWith('dateOfBirth', 'exact')
        .compareWith('ssn', 'exact')
        .compareWith('medicalRecordNumber', 'exact')
        .compareWith('phone', 'exact')
        .compareWith('email', 'exact')
        .compareWith('address', 'levenshtein', { threshold: 0.8 })
        .compareWith('city', 'exact')
        .compareWith('state', 'exact')
        .compareWith('zipCode', 'exact')
        .compareWith('insuranceId', 'exact')
    )
    .thresholds({
      noMatch: 30,
      definiteMatch: 70,
    })
    .adapter(adapter)
    .build()

  console.log('Scenario 1: Register new patient, check for existing records\n')

  const newPatient: Patient = {
    id: 'patient-456',
    firstName: 'Sarah',
    lastName: 'Johnson',
    dateOfBirth: new Date('1978-05-15'),
    ssn: '123-45-6789',
    medicalRecordNumber: 'MRN-2024-001',
    phone: '555-0200',
    email: 'sarah.johnson@example.com',
    address: '456 Oak Avenue',
    city: 'Chicago',
    state: 'IL',
    zipCode: '60601',
    insuranceId: 'INS-ABC-123',
  }

  try {
    const matches = await resolver.resolveWithDatabase(newPatient, {
      useBlocking: true,
      maxFetchSize: 500,
    })

    console.log(`Found ${matches.length} potential matches:`)
    for (const match of matches) {
      console.log(
        `  - ${match.outcome} (score: ${match.score}): ${match.recordId || 'N/A'}`
      )
    }
  } catch (error) {
    console.log('Note: This example requires a configured Drizzle database')
    console.log(`Error: ${error instanceof Error ? error.message : String(error)}`)
  }

  console.log('\n---\n')
  console.log('Scenario 2: Batch deduplicate patient database\n')

  try {
    const deduplicationResult = await resolver.deduplicateBatchFromDatabase({
      batchSize: 500,
      persistResults: false,
    })

    console.log('Deduplication Results:')
    console.log(`  Total records processed: ${deduplicationResult.totalRecords}`)
    console.log(`  Definite matches: ${deduplicationResult.definiteMatches}`)
    console.log(`  Potential matches: ${deduplicationResult.potentialMatches}`)
    console.log(`  No matches: ${deduplicationResult.noMatches}`)
  } catch (error) {
    console.log('Note: This example requires a configured Drizzle database')
    console.log(`Error: ${error instanceof Error ? error.message : String(error)}`)
  }

  console.log('\n---\n')
  console.log('Scenario 3: Transaction-based patient merge\n')

  try {
    await adapter.transaction(async (txAdapter) => {
      const duplicates = await txAdapter.findByBlockingKeys(
        new Map([['medicalRecordNumber', 'MRN-2024-001']])
      )

      if (duplicates.length > 1) {
        console.log(`Found ${duplicates.length} duplicate patient records`)

        const [primary, ...others] = duplicates

        console.log(`Primary patient record: ${primary.id}`)
        console.log(`Merging records: ${others.map((r) => r.id).join(', ')}`)

        const mergedPatient: Patient = {
          ...primary,
          phone: primary.phone || others[0]?.phone,
          email: primary.email || others[0]?.email,
          insuranceId: primary.insuranceId || others[0]?.insuranceId,
          lastVisit: primary.lastVisit || others[0]?.lastVisit,
        }

        await txAdapter.update(primary.id, mergedPatient)

        for (const duplicate of others) {
          await txAdapter.delete(duplicate.id)
        }

        console.log('Patient records merged successfully!')
      } else {
        console.log('No duplicate patient records found')
      }
    })
  } catch (error) {
    console.log('Note: This example requires a configured Drizzle database')
    console.log(`Error: ${error instanceof Error ? error.message : String(error)}`)
  }

  console.log('\n---\n')
  console.log('Scenario 4: Multi-database support\n')

  console.log('Drizzle supports multiple databases:')
  console.log('  - PostgreSQL: use drizzle(postgres-client)')
  console.log('  - MySQL: use drizzle(mysql2-client)')
  console.log('  - SQLite: use drizzle(better-sqlite3)')
  console.log('')
  console.log('Example setup for PostgreSQL:')
  console.log(`
import { drizzle } from 'drizzle-orm/node-postgres'
import { pgTable, varchar, timestamp, integer } from 'drizzle-orm/pg-core'
import { Pool } from 'pg'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = drizzle(pool)

const patients = pgTable('patients', {
  id: varchar('id', { length: 255 }).primaryKey(),
  firstName: varchar('first_name', { length: 255 }).notNull(),
  lastName: varchar('last_name', { length: 255 }).notNull(),
  dateOfBirth: timestamp('date_of_birth').notNull(),
  ssn: varchar('ssn', { length: 11 }),
  medicalRecordNumber: varchar('medical_record_number', { length: 255 }).notNull(),
  phone: varchar('phone', { length: 20 }),
  email: varchar('email', { length: 255 }),
  // ... other fields
})

const adapter = new DrizzleAdapter(db, patients, {
  tableName: 'patients',
  primaryKey: 'id'
})
`)

  console.log('\n---\n')
  console.log('Scenario 5: Recommended database indexes\n')

  console.log('For optimal performance, create these indexes on your patients table:')
  console.log('')
  console.log('-- Index for lastName blocking')
  console.log('CREATE INDEX idx_patients_lastname ON patients(last_name);')
  console.log('')
  console.log('-- Index for medicalRecordNumber blocking')
  console.log('CREATE INDEX idx_patients_mrn ON patients(medical_record_number);')
  console.log('')
  console.log('-- Index for SSN blocking')
  console.log('CREATE INDEX idx_patients_ssn ON patients(ssn);')
  console.log('')
  console.log('-- Index for phone blocking')
  console.log('CREATE INDEX idx_patients_phone ON patients(phone);')
  console.log('')
  console.log('-- Index for Soundex blocking (requires pre-computed column)')
  console.log('ALTER TABLE patients ADD COLUMN soundex_lastname VARCHAR(4);')
  console.log('CREATE INDEX idx_patients_soundex_lastname ON patients(soundex_lastname);')
  console.log('')
  console.log('-- Index for birth year blocking')
  console.log('ALTER TABLE patients ADD COLUMN birth_year INT;')
  console.log('CREATE INDEX idx_patients_birth_year ON patients(birth_year);')
  console.log('')
  console.log('-- Composite index for combined blocking')
  console.log(
    'CREATE INDEX idx_patients_lastname_year ON patients(last_name, birth_year);'
  )

  console.log('\n=== Example Complete ===')
}

if (import.meta.url === `file://${process.argv[1]}`) {
  patientMatchingExample().catch(console.error)
}

export { patientMatchingExample }
