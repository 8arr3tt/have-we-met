# TypeORM Adapter Guide

This guide covers everything you need to know about using **have-we-met** with TypeORM.

## Overview

The TypeORM adapter provides integration with TypeORM, a mature and feature-rich ORM for TypeScript and JavaScript. TypeORM supports a wide range of databases and offers both Active Record and Data Mapper patterns.

## Installation

```bash
npm install have-we-met typeorm reflect-metadata

# Choose your database driver
npm install pg              # PostgreSQL
npm install mysql2          # MySQL
npm install sqlite3         # SQLite
npm install mssql           # SQL Server
npm install mongodb         # MongoDB
```

## Quick Start

### 1. Define Your Entity

Create your TypeORM entity (e.g., `src/entities/Contact.ts`):

```typescript
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm'

@Entity('contacts')
@Index(['lastName'])
@Index(['email'])
@Index(['phone'])
@Index(['company'])
@Index(['soundexLastName'])
@Index(['lastName', 'email'])
export class Contact {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column()
  firstName: string

  @Column()
  @Index()
  lastName: string

  @Column({ unique: true })
  email: string

  @Column({ nullable: true })
  phone?: string

  @Column({ nullable: true })
  company?: string

  @Column({ nullable: true })
  title?: string

  @Column({ nullable: true })
  address?: string

  @Column({ nullable: true })
  city?: string

  @Column({ nullable: true, length: 2 })
  state?: string

  @Column({ nullable: true })
  zipCode?: string

  @Column({ nullable: true })
  country?: string

  @Column({ type: 'text', nullable: true })
  notes?: string

  @Column({ nullable: true })
  source?: string

  // Pre-computed blocking keys
  @Column({ nullable: true, length: 4 })
  soundexLastName?: string

  @CreateDateColumn()
  createdAt: Date

  @UpdateDateColumn()
  updatedAt: Date
}
```

### 2. Configure TypeORM Connection

Create your data source configuration (e.g., `src/db/data-source.ts`):

```typescript
import { DataSource } from 'typeorm'
import { Contact } from '../entities/Contact'

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: 'localhost',
  port: 5432,
  username: 'postgres',
  password: 'password',
  database: 'crm',
  entities: [Contact],
  synchronize: true,  // Set to false in production
  logging: false,
  maxQueryExecutionTime: 1000,  // Log slow queries
  extra: {
    max: 20,  // Connection pool size
  }
})

// Initialize connection
await AppDataSource.initialize()
```

### 3. Configure have-we-met

```typescript
import { HaveWeMet } from 'have-we-met'
import { typeormAdapter } from 'have-we-met/adapters/typeorm'
import { AppDataSource } from './db/data-source'
import { Contact } from './entities/Contact'

const contactRepository = AppDataSource.getRepository(Contact)

const resolver = HaveWeMet.create<Contact>()
  .schema(schema => {
    schema
      .field('firstName', { type: 'name', component: 'first' })
      .field('lastName', { type: 'name', component: 'last' })
      .field('email', { type: 'email' })
      .field('phone', { type: 'phone' })
      .field('company', { type: 'string' })
  })
  .blocking(block => block
    .onField('lastName', { transform: 'soundex' })
    .onField('email')
    .onField('company')
  )
  .matching(match => {
    match
      .field('email').strategy('exact').weight(20)
      .field('firstName').strategy('jaro-winkler').weight(10).threshold(0.85)
      .field('lastName').strategy('jaro-winkler').weight(10).threshold(0.85)
      .field('phone').strategy('exact').weight(10)
      .field('company').strategy('jaro-winkler').weight(10).threshold(0.85)
      .thresholds({ noMatch: 20, definiteMatch: 55 })
  })
  .adapter(typeormAdapter(contactRepository))
  .build()
```

## Entity Patterns

### Data Mapper Pattern (Recommended)

```typescript
// Recommended approach - separation of concerns
const repository = AppDataSource.getRepository(Contact)
const adapter = typeormAdapter(repository)

// All database operations through repository
const contacts = await repository.find({ where: { company: 'ACME Corp' } })
```

### Active Record Pattern

```typescript
import { BaseEntity } from 'typeorm'

@Entity()
export class Contact extends BaseEntity {
  // ... columns

  // Can use static methods
  static async findByEmail(email: string) {
    return this.findOne({ where: { email } })
  }
}

// Usage
const contact = await Contact.findByEmail('test@example.com')
```

## Configuration Options

### Basic Configuration

```typescript
const adapter = typeormAdapter(repository, {
  tableName: 'contacts',
  primaryKey: 'id'  // default: 'id'
})
```

### With Entity Manager

You can also use EntityManager directly:

```typescript
import { typeormAdapter } from 'have-we-met/adapters/typeorm'

const entityManager = AppDataSource.manager
const adapter = typeormAdapter(entityManager.getRepository(Contact))
```

## Usage Examples

### Resolve a Single Record

```typescript
const newContact = {
  firstName: 'Michael',
  lastName: 'Williams',
  email: 'michael.williams@company.com',
  phone: '555-0300',
  company: 'Tech Solutions Inc',
  title: 'Senior Developer'
}

const matches = await resolver.resolveWithDatabase(newContact, {
  useBlocking: true,
  maxFetchSize: 1000
})

console.log(`Found ${matches.length} potential matches`)
for (const match of matches) {
  if (match.outcome === 'definite-match') {
    console.log(`Duplicate contact: ${match.record.id}`)
    console.log(`Score: ${match.score.totalScore}`)
  } else if (match.outcome === 'potential-match') {
    console.log(`Potential duplicate: ${match.record.id} (requires review)`)
  }
}
```

### Batch Deduplication

```typescript
const result = await resolver.deduplicateBatchFromDatabase({
  batchSize: 1000,
  persistResults: false
})

console.log(`Processed: ${result.totalProcessed} contacts`)
console.log(`Duplicate groups: ${result.duplicateGroupsFound}`)
console.log(`Total duplicates: ${result.totalDuplicates}`)
console.log(`Duration: ${result.durationMs}ms`)

// Process results
result.results.forEach(group => {
  console.log(`Master contact: ${group.masterRecordId}`)
  console.log(`Duplicates: ${group.duplicateIds.join(', ')}`)
})
```

### Merge Duplicates with Transactions

```typescript
const adapter = typeormAdapter(contactRepository)

const mergedContact = await adapter.transaction(async (txAdapter) => {
  // Find duplicates
  const duplicates = await txAdapter.findByBlockingKeys(
    new Map([['email', 'michael.williams@company.com']])
  )

  if (duplicates.length <= 1) {
    return duplicates[0]
  }

  const [primary, ...others] = duplicates

  // Merge logic - combine data from all sources
  const mergedData = {
    ...primary,
    // Take most complete data
    phone: others.find(c => c.phone)?.phone || primary.phone,
    address: others.find(c => c.address)?.address || primary.address,
    title: others.find(c => c.title)?.title || primary.title,
    notes: [primary.notes, ...others.map(c => c.notes)]
      .filter(Boolean)
      .join('\n---\n')
  }

  // Update primary record
  const updated = await txAdapter.update(primary.id, mergedData)

  // Delete duplicates
  for (const duplicate of others) {
    await txAdapter.delete(duplicate.id)
  }

  return updated
})

console.log(`Merged into contact: ${mergedContact.id}`)
```

### Using Query Builder

Combine TypeORM's QueryBuilder with the adapter:

```typescript
import { Like } from 'typeorm'

// Find contacts from specific company
const companyContacts = await contactRepository.find({
  where: {
    company: Like('%Tech%')
  },
  order: {
    lastName: 'ASC'
  },
  take: 100
})

// Check each for duplicates
for (const contact of companyContacts) {
  const matches = await resolver.resolveWithDatabase(contact)
  if (matches.some(m => m.outcome === 'definite-match')) {
    console.log(`Duplicate found: ${contact.id}`)
  }
}
```

## Performance Optimization

### Create Indexes

Use decorators to define indexes:

```typescript
@Entity()
@Index(['lastName', 'email'])  // Composite index
@Index(['company'])
export class Contact {
  @Column()
  @Index()  // Single-column index
  lastName: string

  @Column()
  @Index()
  email: string

  @Column()
  @Index()
  soundexLastName: string
}
```

Or create them manually:

```sql
-- Single-column indexes
CREATE INDEX idx_contacts_lastname ON contacts(last_name);
CREATE INDEX idx_contacts_email ON contacts(email);
CREATE INDEX idx_contacts_phone ON contacts(phone);
CREATE INDEX idx_contacts_company ON contacts(company);

-- Pre-computed blocking keys
CREATE INDEX idx_contacts_soundex ON contacts(soundex_last_name);

-- Composite indexes
CREATE INDEX idx_contacts_lastname_email ON contacts(last_name, email);
```

### Pre-compute Blocking Keys

Use subscribers to auto-compute blocking keys:

```typescript
import { EntitySubscriberInterface, EventSubscriber, InsertEvent, UpdateEvent } from 'typeorm'
import { soundex } from 'have-we-met/utils'
import { Contact } from '../entities/Contact'

@EventSubscriber()
export class ContactSubscriber implements EntitySubscriberInterface<Contact> {
  listenTo() {
    return Contact
  }

  beforeInsert(event: InsertEvent<Contact>) {
    if (event.entity.lastName) {
      event.entity.soundexLastName = soundex(event.entity.lastName)
    }
  }

  beforeUpdate(event: UpdateEvent<Contact>) {
    if (event.entity?.lastName) {
      event.entity.soundexLastName = soundex(event.entity.lastName)
    }
  }
}
```

Register the subscriber:

```typescript
export const AppDataSource = new DataSource({
  // ... other options
  subscribers: [ContactSubscriber]
})
```

### Query Caching

Enable query caching for frequently accessed data:

```typescript
const contacts = await contactRepository.find({
  where: { company: 'ACME Corp' },
  cache: {
    id: 'contacts_acme',
    milliseconds: 60000  // Cache for 1 minute
  }
})
```

### Connection Pooling

Configure connection pool size:

```typescript
export const AppDataSource = new DataSource({
  type: 'postgres',
  extra: {
    max: 20,              // Maximum connections
    min: 5,               // Minimum connections
    idleTimeoutMillis: 30000,  // Close idle after 30s
    connectionTimeoutMillis: 2000
  }
})
```

### Logging and Performance Monitoring

```typescript
export const AppDataSource = new DataSource({
  logging: ['query', 'error', 'warn'],
  maxQueryExecutionTime: 1000,  // Log queries > 1 second
  logger: 'advanced-console'
})
```

## Database-Specific Features

### PostgreSQL

```typescript
export const AppDataSource = new DataSource({
  type: 'postgres',
  // ... other options
  extra: {
    // PostgreSQL-specific options
    statement_timeout: 30000,
    idle_in_transaction_session_timeout: 30000
  }
})
```

Full-text search:

```typescript
import { Raw } from 'typeorm'

const results = await contactRepository.find({
  where: {
    firstName: Raw(alias => `to_tsvector('english', ${alias}) @@ to_tsquery('english', :query)`, {
      query: 'john'
    })
  }
})
```

### MySQL

```typescript
export const AppDataSource = new DataSource({
  type: 'mysql',
  charset: 'utf8mb4',  // Support for Unicode
  // ... other options
})
```

### SQLite

```typescript
export const AppDataSource = new DataSource({
  type: 'sqlite',
  database: 'dev.db',
  // ... other options
})
```

### SQL Server

```typescript
export const AppDataSource = new DataSource({
  type: 'mssql',
  options: {
    encrypt: true,
    trustServerCertificate: true
  }
})
```

## Error Handling

```typescript
import { ConnectionError, QueryError, TransactionError } from 'have-we-met/adapters'
import { QueryFailedError } from 'typeorm'

try {
  const matches = await resolver.resolveWithDatabase(contact)
} catch (error) {
  if (error instanceof ConnectionError) {
    console.error('Database connection failed:', error.message)
  } else if (error instanceof QueryError) {
    console.error('Query execution failed:', error.message)
  } else if (error instanceof TransactionError) {
    console.error('Transaction rolled back:', error.message)
  } else if (error instanceof QueryFailedError) {
    // TypeORM-specific error
    console.error('TypeORM query failed:', error.message)
  }
}
```

## Testing

### Unit Tests with Mock Repository

```typescript
import { describe, it, expect, vi } from 'vitest'
import { TypeORMAdapter } from 'have-we-met/adapters/typeorm'
import type { Repository } from 'typeorm'

describe('Contact Matching', () => {
  const mockRepository = {
    find: vi.fn(),
    findByIds: vi.fn(),
    save: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
    manager: {
      transaction: vi.fn()
    }
  } as unknown as Repository<Contact>

  const adapter = new TypeORMAdapter(mockRepository)

  it('finds contacts by email', async () => {
    mockRepository.find.mockResolvedValue([
      { id: '1', email: 'test@example.com', firstName: 'John', lastName: 'Doe' }
    ])

    const results = await adapter.findByBlockingKeys(
      new Map([['email', 'test@example.com']])
    )

    expect(results).toHaveLength(1)
  })
})
```

### Integration Tests

```typescript
import { DataSource } from 'typeorm'

describe('Integration: Contact Deduplication', () => {
  let dataSource: DataSource
  let repository: Repository<Contact>

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'sqlite',
      database: ':memory:',
      entities: [Contact],
      synchronize: true
    })
    await dataSource.initialize()
    repository = dataSource.getRepository(Contact)
  })

  afterAll(async () => {
    await dataSource.destroy()
  })

  beforeEach(async () => {
    await repository.clear()
  })

  it('identifies duplicate contacts', async () => {
    // Insert test data
    await repository.save([
      { firstName: 'Michael', lastName: 'Williams', email: 'mike@company.com' },
      { firstName: 'Mike', lastName: 'Williams', email: 'mike@company.com' }
    ])

    const result = await resolver.deduplicateBatchFromDatabase()
    expect(result.duplicateGroupsFound).toBeGreaterThan(0)
  })
})
```

## Common Patterns

### Incremental Processing

```typescript
import { MoreThan } from 'typeorm'

async function processNewContacts() {
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)

  const newContacts = await contactRepository.find({
    where: {
      createdAt: MoreThan(yesterday)
    }
  })

  for (const contact of newContacts) {
    const matches = await resolver.resolveWithDatabase(contact)

    if (matches.some(m => m.outcome === 'definite-match')) {
      console.log(`Duplicate contact: ${contact.id}`)
      // Handle duplicate
    }
  }
}
```

### Bulk Import

```typescript
async function bulkImport(contacts: Partial<Contact>[]) {
  const stats = { imported: 0, duplicates: 0, errors: 0 }

  for (const contact of contacts) {
    try {
      const matches = await resolver.resolveWithDatabase(contact)
      const isDuplicate = matches.some(m => m.outcome === 'definite-match')

      if (!isDuplicate) {
        await contactRepository.save(contact)
        stats.imported++
      } else {
        stats.duplicates++
      }
    } catch (error) {
      console.error('Error:', error)
      stats.errors++
    }
  }

  return stats
}
```

## Migrations

Create and run migrations:

```bash
# Generate migration
npx typeorm migration:generate -d src/db/data-source.ts -n AddBlockingKeys

# Run migrations
npx typeorm migration:run -d src/db/data-source.ts

# Revert migration
npx typeorm migration:revert -d src/db/data-source.ts
```

Example migration:

```typescript
import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddBlockingKeys1234567890 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE contacts ADD COLUMN soundex_last_name VARCHAR(4)
    `)
    await queryRunner.query(`
      CREATE INDEX idx_contacts_soundex ON contacts(soundex_last_name)
    `)
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX idx_contacts_soundex`)
    await queryRunner.query(`ALTER TABLE contacts DROP COLUMN soundex_last_name`)
  }
}
```

## Troubleshooting

### Slow Queries

Enable query logging:

```typescript
export const AppDataSource = new DataSource({
  logging: true,
  maxQueryExecutionTime: 1000
})
```

### Connection Pool Exhausted

```typescript
// Check active connections
const activeConnections = AppDataSource.driver.master.pool?._allConnections?.length
console.log(`Active connections: ${activeConnections}`)

// Increase pool size if needed
extra: {
  max: 50  // Increase from default 10
}
```

### Transaction Deadlocks

Use transaction isolation levels:

```typescript
await contactRepository.manager.transaction('READ COMMITTED', async (manager) => {
  // Your transaction logic
})
```

## Next Steps

- [Database Performance Guide](../database-performance.md) - Optimization techniques
- [Migration Guide](../migration-guide.md) - Deduplicate existing databases
- [Complete Example](../../examples/database-adapters/typeorm-example.ts) - Full working example

## Resources

- [TypeORM Documentation](https://typeorm.io)
- [TypeORM Migrations](https://typeorm.io/migrations)
- [Connection Options](https://typeorm.io/data-source-options)
