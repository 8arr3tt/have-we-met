# Drizzle Adapter Guide

This guide covers everything you need to know about using **have-we-met** with Drizzle ORM.

## Overview

The Drizzle adapter provides integration with Drizzle ORM, a lightweight, type-safe query builder for TypeScript. Drizzle offers excellent performance and supports PostgreSQL, MySQL, and SQLite.

## Installation

```bash
npm install have-we-met drizzle-orm
npm install -D drizzle-kit

# Choose your database driver
npm install pg              # PostgreSQL
npm install mysql2          # MySQL
npm install better-sqlite3  # SQLite
```

## Quick Start

### 1. Define Your Schema

Create your Drizzle schema (e.g., `src/db/schema.ts`):

```typescript
import { pgTable, uuid, varchar, integer, timestamp, index } from 'drizzle-orm/pg-core'

export const patients = pgTable('patients', {
  id: uuid('id').primaryKey().defaultRandom(),
  firstName: varchar('first_name', { length: 255 }).notNull(),
  lastName: varchar('last_name', { length: 255 }).notNull(),
  dateOfBirth: timestamp('date_of_birth').notNull(),
  ssn: varchar('ssn', { length: 11 }),
  medicalRecordNumber: varchar('medical_record_number', { length: 50 }).notNull(),
  phone: varchar('phone', { length: 20 }),
  email: varchar('email', { length: 255 }),
  address: varchar('address', { length: 500 }),
  city: varchar('city', { length: 100 }),
  state: varchar('state', { length: 2 }),
  zipCode: varchar('zip_code', { length: 10 }),
  insuranceId: varchar('insurance_id', { length: 50 }),

  // Pre-computed blocking keys
  soundexLastName: varchar('soundex_lastname', { length: 4 }),
  birthYear: integer('birth_year'),

  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  lastNameIdx: index('idx_patients_lastname').on(table.lastName),
  mrnIdx: index('idx_patients_mrn').on(table.medicalRecordNumber),
  ssnIdx: index('idx_patients_ssn').on(table.ssn),
  soundexIdx: index('idx_patients_soundex').on(table.soundexLastName),
  birthYearIdx: index('idx_patients_birth_year').on(table.birthYear),
  compositeIdx: index('idx_patients_lastname_year').on(table.lastName, table.birthYear),
}))

export type Patient = typeof patients.$inferSelect
export type NewPatient = typeof patients.$inferInsert
```

### 2. Configure Database Connection

```typescript
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema'

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'password',
  database: 'healthcare',
  max: 20  // Connection pool size
})

export const db = drizzle(pool, { schema })
```

### 3. Configure have-we-met

```typescript
import { HaveWeMet } from 'have-we-met'
import { drizzleAdapter } from 'have-we-met/adapters/drizzle'
import { db } from './db/connection'
import { patients } from './db/schema'

type Patient = {
  id: string
  firstName: string
  lastName: string
  dateOfBirth: Date
  ssn?: string
  medicalRecordNumber: string
  phone?: string
  email?: string
}

const resolver = HaveWeMet.create<Patient>()
  .schema(schema => {
    schema
      .field('firstName', { type: 'name', component: 'first' })
      .field('lastName', { type: 'name', component: 'last' })
      .field('dateOfBirth', { type: 'date' })
      .field('ssn', { type: 'string' })
      .field('medicalRecordNumber', { type: 'string' })
      .field('phone', { type: 'phone' })
      .field('email', { type: 'email' })
  })
  .blocking(block => block
    .onField('lastName', { transform: 'soundex' })
    .onField('medicalRecordNumber')
    .onField('ssn')
  )
  .matching(match => {
    match
      .field('ssn').strategy('exact').weight(25)
      .field('medicalRecordNumber').strategy('exact').weight(20)
      .field('firstName').strategy('jaro-winkler').weight(10).threshold(0.85)
      .field('lastName').strategy('jaro-winkler').weight(10).threshold(0.85)
      .field('dateOfBirth').strategy('exact').weight(15)
      .field('phone').strategy('exact').weight(10)
      .field('email').strategy('exact').weight(10)
      .thresholds({ noMatch: 30, definiteMatch: 70 })
  })
  .adapter(drizzleAdapter(db, patients, { tableName: 'patients' }))
  .build()
```

## Multi-Database Support

### PostgreSQL

```typescript
import { drizzle } from 'drizzle-orm/node-postgres'
import { pgTable, uuid, varchar } from 'drizzle-orm/pg-core'
import { Pool } from 'pg'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
})

const db = drizzle(pool)
```

### MySQL

```typescript
import { drizzle } from 'drizzle-orm/mysql2'
import { mysqlTable, varchar, int } from 'drizzle-orm/mysql-core'
import mysql from 'mysql2/promise'

const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  database: 'mydb'
})

const db = drizzle(pool)

export const patients = mysqlTable('patients', {
  id: varchar('id', { length: 36 }).primaryKey(),
  firstName: varchar('first_name', { length: 255 }),
  lastName: varchar('last_name', { length: 255 }),
  // ...
})
```

### SQLite

```typescript
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'
import Database from 'better-sqlite3'

const sqlite = new Database('dev.db')
const db = drizzle(sqlite)

export const patients = sqliteTable('patients', {
  id: text('id').primaryKey(),
  firstName: text('first_name'),
  lastName: text('last_name'),
  // ...
})
```

## Configuration Options

### Basic Configuration

```typescript
const adapter = drizzleAdapter(db, patients, {
  tableName: 'patients',
  primaryKey: 'id'  // default: 'id'
})
```

### Field Mapping

Map schema fields to database columns:

```typescript
const adapter = drizzleAdapter(db, patients, {
  tableName: 'patients',
  fieldMapping: {
    firstName: 'first_name',
    lastName: 'last_name',
    medicalRecordNumber: 'medical_record_number',
    dateOfBirth: 'date_of_birth'
  }
})
```

## Usage Examples

### Resolve a Single Record

```typescript
const newPatient = {
  firstName: 'Sarah',
  lastName: 'Johnson',
  dateOfBirth: new Date('1978-05-15'),
  ssn: '123-45-6789',
  medicalRecordNumber: 'MRN-2024-001',
  phone: '555-0200',
  email: 'sarah.johnson@example.com'
}

const matches = await resolver.resolveWithDatabase(newPatient, {
  useBlocking: true,
  maxFetchSize: 500
})

console.log(`Found ${matches.length} potential matches`)
matches.forEach(match => {
  if (match.outcome === 'definite-match') {
    console.log(`Duplicate patient found: ${match.record.id}`)
    console.log(`Score: ${match.score.totalScore}`)
  }
})
```

### Batch Deduplication

```typescript
const result = await resolver.deduplicateBatchFromDatabase({
  batchSize: 1000,
  persistResults: false
})

console.log(`Processed ${result.totalProcessed} patients`)
console.log(`Found ${result.duplicateGroupsFound} duplicate groups`)
console.log(`Total duplicates: ${result.totalDuplicates}`)
console.log(`Completed in ${result.durationMs}ms`)
```

### Transactions for Merging

```typescript
import { drizzleAdapter } from 'have-we-met/adapters/drizzle'
import { eq } from 'drizzle-orm'

const adapter = drizzleAdapter(db, patients, { tableName: 'patients' })

const mergedPatient = await adapter.transaction(async (txAdapter) => {
  // Find duplicates
  const duplicates = await txAdapter.findByBlockingKeys(
    new Map([['medicalRecordNumber', 'MRN-2024-001']])
  )

  if (duplicates.length <= 1) {
    return duplicates[0]
  }

  const [primary, ...others] = duplicates

  // Merge data - take most complete information
  const mergedData = {
    ...primary,
    phone: others.find(p => p.phone)?.phone || primary.phone,
    email: others.find(p => p.email)?.email || primary.email,
    address: others.find(p => p.address)?.address || primary.address
  }

  // Update primary record
  const updated = await txAdapter.update(primary.id, mergedData)

  // Delete duplicates
  for (const duplicate of others) {
    await txAdapter.delete(duplicate.id)
  }

  return updated
})

console.log(`Merged into patient: ${mergedPatient.id}`)
```

### Direct Drizzle Queries

You can also use Drizzle directly alongside the adapter:

```typescript
import { eq, and, like } from 'drizzle-orm'

// Complex query with Drizzle
const recentPatients = await db
  .select()
  .from(patients)
  .where(
    and(
      eq(patients.state, 'IL'),
      like(patients.lastName, 'Smith%')
    )
  )
  .limit(100)

// Then check each for duplicates
for (const patient of recentPatients) {
  const matches = await resolver.resolveWithDatabase(patient)
  // Handle matches
}
```

## Performance Optimization

### Create Indexes

Define indexes in your schema:

```typescript
import { pgTable, index } from 'drizzle-orm/pg-core'

export const patients = pgTable('patients', {
  // ... column definitions
}, (table) => ({
  // Single-column indexes
  lastNameIdx: index('idx_patients_lastname').on(table.lastName),
  mrnIdx: index('idx_patients_mrn').on(table.medicalRecordNumber),
  ssnIdx: index('idx_patients_ssn').on(table.ssn),
  phoneIdx: index('idx_patients_phone').on(table.phone),

  // Pre-computed blocking key indexes
  soundexIdx: index('idx_patients_soundex').on(table.soundexLastName),
  birthYearIdx: index('idx_patients_birth_year').on(table.birthYear),

  // Composite indexes
  compositeIdx: index('idx_patients_lastname_year').on(table.lastName, table.birthYear),
}))
```

Generate migrations:

```bash
npx drizzle-kit generate:pg
npx drizzle-kit push:pg
```

### Pre-compute Blocking Keys

Add computed columns and update them on insert:

```typescript
import { soundex } from 'have-we-met/utils'

async function insertPatient(patient: NewPatient) {
  const soundexLastName = soundex(patient.lastName)
  const birthYear = patient.dateOfBirth.getFullYear()

  return db.insert(patients).values({
    ...patient,
    soundexLastName,
    birthYear
  })
}
```

### Use Prepared Statements

Drizzle supports prepared statements for better performance:

```typescript
import { eq } from 'drizzle-orm'

const findByMRN = db
  .select()
  .from(patients)
  .where(eq(patients.medicalRecordNumber, sql.placeholder('mrn')))
  .prepare('find_by_mrn')

// Reuse prepared statement
const results = await findByMRN.execute({ mrn: 'MRN-2024-001' })
```

### Connection Pooling

Configure appropriate pool size based on your workload:

```typescript
const pool = new Pool({
  max: 20,              // Maximum pool size
  min: 5,               // Minimum pool size
  idleTimeoutMillis: 30000,  // Close idle connections after 30s
  connectionTimeoutMillis: 2000  // Fail after 2s if no connection available
})
```

## Database-Specific Features

### PostgreSQL

Take advantage of PostgreSQL-specific features:

```typescript
import { sql } from 'drizzle-orm'

// Full-text search
const searchResults = await db
  .select()
  .from(patients)
  .where(sql`to_tsvector('english', first_name || ' ' || last_name) @@ to_tsquery('english', ${searchTerm})`)

// Trigram similarity (requires pg_trgm extension)
const similarNames = await db
  .select()
  .from(patients)
  .where(sql`similarity(last_name, ${targetName}) > 0.6`)
  .orderBy(sql`similarity(last_name, ${targetName}) DESC`)
```

### MySQL

```typescript
// MySQL full-text search
const searchResults = await db
  .select()
  .from(patients)
  .where(sql`MATCH(first_name, last_name) AGAINST(${searchTerm} IN BOOLEAN MODE)`)
```

### SQLite

```typescript
// SQLite has limited features but is great for development
const db = drizzle(new Database(':memory:'))  // In-memory database for tests
```

## Error Handling

```typescript
import { ConnectionError, QueryError, TransactionError } from 'have-we-met/adapters'

try {
  const matches = await resolver.resolveWithDatabase(patient)
} catch (error) {
  if (error instanceof ConnectionError) {
    console.error('Database connection failed:', error.message)
    // Retry logic
  } else if (error instanceof QueryError) {
    console.error('Query failed:', error.message)
    console.error('Context:', error.context)
  } else if (error instanceof TransactionError) {
    console.error('Transaction rolled back:', error.message)
  }
}
```

## Testing

### Unit Tests with Mock Database

```typescript
import { describe, it, expect, vi } from 'vitest'
import { DrizzleAdapter } from 'have-we-met/adapters/drizzle'

describe('Patient Matching', () => {
  const mockDb = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    execute: vi.fn()
  }

  const adapter = new DrizzleAdapter(mockDb, patients, { tableName: 'patients' })

  it('finds patients by medical record number', async () => {
    mockDb.execute.mockResolvedValue([
      { id: '1', medicalRecordNumber: 'MRN-001', firstName: 'John', lastName: 'Doe' }
    ])

    const results = await adapter.findByBlockingKeys(
      new Map([['medicalRecordNumber', 'MRN-001']])
    )

    expect(results).toHaveLength(1)
  })
})
```

### Integration Tests

```typescript
import { drizzle } from 'drizzle-orm/better-sqlite3'
import Database from 'better-sqlite3'

describe('Integration: Patient Deduplication', () => {
  let db: ReturnType<typeof drizzle>
  let adapter: DrizzleAdapter<Patient>

  beforeAll(() => {
    const sqlite = new Database(':memory:')
    db = drizzle(sqlite)

    // Create table
    sqlite.exec(`
      CREATE TABLE patients (
        id TEXT PRIMARY KEY,
        first_name TEXT,
        last_name TEXT,
        medical_record_number TEXT
      )
    `)

    adapter = drizzleAdapter(db, patients, { tableName: 'patients' })
  })

  it('identifies duplicate patients', async () => {
    // Insert test data
    await db.insert(patients).values([
      { id: '1', firstName: 'Sarah', lastName: 'Johnson', medicalRecordNumber: 'MRN-001' },
      { id: '2', firstName: 'Sara', lastName: 'Johnson', medicalRecordNumber: 'MRN-002' }
    ])

    const result = await resolver.deduplicateBatchFromDatabase()
    expect(result.duplicateGroupsFound).toBeGreaterThan(0)
  })
})
```

## Common Patterns

### Incremental Processing

```typescript
async function processNewPatients() {
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)

  const newPatients = await db
    .select()
    .from(patients)
    .where(gte(patients.createdAt, yesterday))

  for (const patient of newPatients) {
    const matches = await resolver.resolveWithDatabase(patient)

    if (matches.some(m => m.outcome === 'definite-match')) {
      console.log(`Duplicate found for patient ${patient.id}`)
      // Handle duplicate
    }
  }
}
```

### Bulk Import

```typescript
async function bulkImport(newPatients: NewPatient[]) {
  const stats = { imported: 0, duplicates: 0 }

  for (const patient of newPatients) {
    const matches = await resolver.resolveWithDatabase(patient)

    if (!matches.some(m => m.outcome === 'definite-match')) {
      await db.insert(patients).values(patient)
      stats.imported++
    } else {
      stats.duplicates++
    }
  }

  return stats
}
```

## Troubleshooting

### Query Performance

Use Drizzle's query logging:

```typescript
const db = drizzle(pool, {
  logger: true  // Log all queries
})
```

Or custom logger:

```typescript
const db = drizzle(pool, {
  logger: {
    logQuery(query, params) {
      console.log('Query:', query)
      console.log('Params:', params)
    }
  }
})
```

### Connection Issues

```typescript
// Test connection
try {
  await db.select().from(patients).limit(1)
  console.log('Database connected')
} catch (error) {
  console.error('Connection failed:', error)
}
```

### Migration Issues

```bash
# Generate migration
npx drizzle-kit generate:pg

# Apply migration
npx drizzle-kit push:pg

# Check migration status
npx drizzle-kit introspect:pg
```

## Next Steps

- [Database Performance Guide](../database-performance.md) - Optimization techniques
- [Migration Guide](../migration-guide.md) - Deduplicate existing databases
- [Complete Example](../../examples/database-adapters/drizzle-example.ts) - Full working example

## Resources

- [Drizzle Documentation](https://orm.drizzle.team/docs/overview)
- [Drizzle Kit (Migrations)](https://orm.drizzle.team/kit-docs/overview)
- [Performance Best Practices](https://orm.drizzle.team/docs/performance)
