# Prisma Adapter Guide

This guide covers everything you need to know about using **have-we-met** with Prisma ORM.

## Overview

The Prisma adapter provides seamless integration with Prisma Client, leveraging Prisma's type-safe query API and schema management. It's an excellent choice if you're already using Prisma or want strong TypeScript integration.

## Installation

```bash
npm install have-we-met @prisma/client
npm install -D prisma
```

## Quick Start

### 1. Define Your Prisma Schema

Create or update your `prisma/schema.prisma` file:

```prisma
datasource db {
  provider = "postgresql"  // or "mysql", "sqlite", etc.
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model Customer {
  id           String   @id @default(uuid())
  firstName    String   @map("first_name")
  lastName     String   @map("last_name")
  email        String   @unique
  phone        String?
  address      String?
  city         String?
  state        String?
  zipCode      String?  @map("zip_code")
  dobYear      Int?     @map("dob_year")

  // Pre-computed blocking keys
  soundexLastName String? @map("soundex_lastname")
  createdYear     Int?    @map("created_year")

  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")

  @@index([lastName])
  @@index([email])
  @@index([soundexLastName])
  @@index([createdYear])
  @@index([lastName, createdYear])
  @@map("customers")
}
```

### 2. Generate Prisma Client

```bash
npx prisma generate
npx prisma migrate dev --name init
```

### 3. Configure have-we-met

```typescript
import { HaveWeMet } from 'have-we-met'
import { prismaAdapter } from 'have-we-met/adapters/prisma'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

type Customer = {
  id: string
  firstName: string
  lastName: string
  email: string
  phone?: string
  dobYear?: number
}

const resolver = HaveWeMet.create<Customer>()
  .schema((schema) => {
    schema
      .field('firstName', { type: 'name', component: 'first' })
      .field('lastName', { type: 'name', component: 'last' })
      .field('email', { type: 'email' })
      .field('phone', { type: 'phone' })
      .field('dobYear', { type: 'number' })
  })
  .blocking((block) =>
    block.onField('lastName', { transform: 'soundex' }).onField('email')
  )
  .matching((match) => {
    match
      .field('email')
      .strategy('exact')
      .weight(20)
      .field('firstName')
      .strategy('jaro-winkler')
      .weight(10)
      .threshold(0.85)
      .field('lastName')
      .strategy('jaro-winkler')
      .weight(10)
      .threshold(0.85)
      .field('phone')
      .strategy('exact')
      .weight(10)
      .field('dobYear')
      .strategy('exact')
      .weight(10)
      .thresholds({ noMatch: 20, definiteMatch: 45 })
  })
  .adapter(prismaAdapter(prisma, { tableName: 'customers' }))
  .build()
```

## Configuration Options

### Basic Configuration

```typescript
const adapter = prismaAdapter(prisma, {
  tableName: 'customers',
  primaryKey: 'id', // default: 'id'
})
```

### Field Mapping

If your database column names differ from your TypeScript types:

```typescript
const adapter = prismaAdapter(prisma, {
  tableName: 'customers',
  fieldMapping: {
    firstName: 'first_name',
    lastName: 'last_name',
    dobYear: 'dob_year',
    zipCode: 'zip_code',
  },
})
```

### Connection Pooling

Prisma manages connection pooling automatically. Configure in your `schema.prisma`:

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")

  // Connection pooling configuration
  relationMode = "prisma"
}
```

Or use environment variables:

```bash
# .env
DATABASE_URL="postgresql://user:password@localhost:5432/mydb?connection_limit=10"
```

## Usage Examples

### Resolve a Single Record

```typescript
const newCustomer = {
  firstName: 'John',
  lastName: 'Smith',
  email: 'john.smith@example.com',
  phone: '555-0100',
  dobYear: 1985,
}

const matches = await resolver.resolveWithDatabase(newCustomer, {
  useBlocking: true,
  maxFetchSize: 1000,
})

console.log(`Found ${matches.length} potential matches`)
matches.forEach((match) => {
  console.log(
    `${match.outcome}: ${match.record.id} (score: ${match.score.totalScore})`
  )

  if (match.outcome === 'definite-match') {
    console.log('This is a duplicate!')
  } else if (match.outcome === 'potential-match') {
    console.log('Requires manual review')
  }
})
```

### Batch Deduplication

```typescript
const result = await resolver.deduplicateBatchFromDatabase({
  batchSize: 1000,
  persistResults: false,
  maxRecords: 10000,
})

console.log(`Processed: ${result.totalProcessed}`)
console.log(`Duplicate groups: ${result.duplicateGroupsFound}`)
console.log(`Total duplicates: ${result.totalDuplicates}`)
console.log(`Duration: ${result.durationMs}ms`)

result.results.forEach((group) => {
  console.log(`Master: ${group.masterRecordId}`)
  console.log(`Duplicates: ${group.duplicateIds.join(', ')}`)
})
```

### Merge Duplicates with Transactions

```typescript
import { prismaAdapter } from 'have-we-met/adapters/prisma'

const adapter = prismaAdapter(prisma, { tableName: 'customers' })

const mergedRecord = await adapter.transaction(async (txAdapter) => {
  // Find duplicates
  const duplicates = await txAdapter.findByBlockingKeys(
    new Map([['email', 'john.smith@example.com']])
  )

  if (duplicates.length <= 1) {
    return duplicates[0]
  }

  // Merge logic: keep first, update with best data from others
  const [primary, ...others] = duplicates

  const mergedData = {
    ...primary,
    // Take most complete data
    phone: others.find((r) => r.phone)?.phone || primary.phone,
    address: others.find((r) => r.address)?.address || primary.address,
  }

  // Update primary record
  const updated = await txAdapter.update(primary.id, mergedData)

  // Delete duplicate records
  for (const duplicate of others) {
    await txAdapter.delete(duplicate.id)
  }

  return updated
})

console.log(`Merged into record: ${mergedRecord.id}`)
```

## Performance Optimization

### Create Indexes

Indexes are critical for query performance. Create indexes on all blocking fields:

```sql
-- Standard blocking indexes
CREATE INDEX idx_customers_lastname ON customers(last_name);
CREATE INDEX idx_customers_email ON customers(email);
CREATE INDEX idx_customers_phone ON customers(phone);

-- Pre-computed blocking key indexes
CREATE INDEX idx_customers_soundex_lastname ON customers(soundex_lastname);
CREATE INDEX idx_customers_created_year ON customers(created_year);

-- Composite indexes for multi-field blocking
CREATE INDEX idx_customers_lastname_year ON customers(last_name, created_year);
CREATE INDEX idx_customers_lastname_email ON customers(last_name, email);
```

### Pre-compute Blocking Keys

For phonetic and date-based blocking, pre-compute values:

```typescript
// Before inserting
import { soundex } from 'have-we-met/utils'

const customer = {
  firstName: 'John',
  lastName: 'Smith',
  createdAt: new Date('2024-01-15'),
}

await prisma.customer.create({
  data: {
    ...customer,
    soundexLastName: soundex(customer.lastName),
    createdYear: customer.createdAt.getFullYear(),
  },
})
```

Or use Prisma middleware to automate:

```typescript
prisma.$use(async (params, next) => {
  if (params.model === 'Customer' && params.action === 'create') {
    if (params.args.data.lastName) {
      params.args.data.soundexLastName = soundex(params.args.data.lastName)
    }
    if (params.args.data.createdAt) {
      params.args.data.createdYear = params.args.data.createdAt.getFullYear()
    }
  }
  return next(params)
})
```

### Use Field Projection

Only fetch fields needed for matching:

```typescript
const matches = await resolver.resolveWithDatabase(newCustomer, {
  useBlocking: true,
  maxFetchSize: 1000,
})
// Adapter automatically projects only necessary fields
```

### Monitor Query Performance

Enable Prisma query logging:

```typescript
const prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
})
```

Or log slow queries only:

```typescript
const prisma = new PrismaClient({
  log: [{ level: 'query', emit: 'event' }],
})

prisma.$on('query', (e) => {
  if (e.duration > 100) {
    // Log queries > 100ms
    console.log(`Slow query (${e.duration}ms): ${e.query}`)
  }
})
```

## Database-Specific Considerations

### PostgreSQL

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

PostgreSQL-specific optimizations:

- Use `GIN` indexes for full-text search: `CREATE INDEX idx_customers_name_gin ON customers USING gin(to_tsvector('english', first_name || ' ' || last_name))`
- Use `pg_trgm` extension for fuzzy string matching
- Enable parallel query execution for large tables

### MySQL

```prisma
datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}
```

MySQL-specific considerations:

- InnoDB is recommended for transaction support
- Use `FULLTEXT` indexes for text search
- Consider `utf8mb4` collation for Unicode support

### SQLite

```prisma
datasource db {
  provider = "sqlite"
  url      = "file:./dev.db"
}
```

SQLite-specific considerations:

- No parallel query execution
- Limited connection pooling (single writer)
- Good for development and small datasets
- Consider WAL mode: `PRAGMA journal_mode=WAL`

## Error Handling

### Connection Errors

```typescript
import { ConnectionError } from 'have-we-met/adapters'

try {
  const matches = await resolver.resolveWithDatabase(record)
} catch (error) {
  if (error instanceof ConnectionError) {
    console.error('Database connection failed:', error.message)
    // Retry logic or fallback
  }
}
```

### Query Errors

```typescript
import { QueryError } from 'have-we-met/adapters'

try {
  const results = await adapter.findByBlockingKeys(keys)
} catch (error) {
  if (error instanceof QueryError) {
    console.error('Query failed:', error.message)
    console.error('Context:', error.context)
  }
}
```

### Transaction Errors

```typescript
import { TransactionError } from 'have-we-met/adapters'

try {
  await adapter.transaction(async (tx) => {
    // Operations
  })
} catch (error) {
  if (error instanceof TransactionError) {
    console.error('Transaction rolled back:', error.message)
  }
}
```

## Testing

### Unit Tests with Mock Prisma

```typescript
import { PrismaAdapter } from 'have-we-met/adapters/prisma'
import { mockDeep } from 'vitest-mock-extended'
import type { PrismaClient } from '@prisma/client'

describe('Customer Matching', () => {
  const mockPrisma = mockDeep<PrismaClient>()
  const adapter = new PrismaAdapter(mockPrisma, { tableName: 'customers' })

  it('finds duplicates by email', async () => {
    mockPrisma.customer.findMany.mockResolvedValue([
      {
        id: '1',
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
      },
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
import { PrismaClient } from '@prisma/client'

describe('Integration: Customer Deduplication', () => {
  let prisma: PrismaClient

  beforeAll(async () => {
    prisma = new PrismaClient()
    await prisma.$connect()
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  beforeEach(async () => {
    await prisma.customer.deleteMany()
  })

  it('identifies duplicate customers', async () => {
    // Insert test data
    await prisma.customer.createMany({
      data: [
        { firstName: 'John', lastName: 'Smith', email: 'john@example.com' },
        { firstName: 'Jon', lastName: 'Smith', email: 'john@example.com' },
      ],
    })

    // Run deduplication
    const result = await resolver.deduplicateBatchFromDatabase()

    expect(result.duplicateGroupsFound).toBeGreaterThan(0)
  })
})
```

## Common Patterns

### Incremental Deduplication

Process new records daily:

```typescript
async function dailyDeduplication() {
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)

  // Get new records from last 24 hours
  const newRecords = await prisma.customer.findMany({
    where: {
      createdAt: { gte: yesterday },
    },
  })

  // Check each against existing database
  for (const record of newRecords) {
    const matches = await resolver.resolveWithDatabase(record)

    if (matches.some((m) => m.outcome === 'definite-match')) {
      console.log(`Duplicate found for ${record.id}`)
      // Handle duplicate (flag, merge, notify)
    }
  }
}
```

### Bulk Import with Deduplication

```typescript
async function bulkImportWithDedup(records: Customer[]) {
  const stats = {
    imported: 0,
    duplicates: 0,
    errors: 0,
  }

  for (const record of records) {
    try {
      const matches = await resolver.resolveWithDatabase(record)
      const isDuplicate = matches.some((m) => m.outcome === 'definite-match')

      if (!isDuplicate) {
        await prisma.customer.create({ data: record })
        stats.imported++
      } else {
        stats.duplicates++
      }
    } catch (error) {
      console.error(`Error processing record:`, error)
      stats.errors++
    }
  }

  return stats
}
```

## Troubleshooting

### Slow Queries

**Problem:** Queries are taking too long

**Solutions:**

1. Check if indexes exist: `EXPLAIN ANALYZE` in PostgreSQL
2. Enable Prisma query logging
3. Add indexes on blocking fields
4. Reduce `maxFetchSize` to limit result set
5. Pre-compute blocking keys

### Connection Pool Exhaustion

**Problem:** "Too many connections" errors

**Solutions:**

1. Configure connection limit in `DATABASE_URL`
2. Reuse Prisma Client instance (singleton pattern)
3. Call `prisma.$disconnect()` when done
4. Use connection pooling service (PgBouncer for PostgreSQL)

### Transaction Timeouts

**Problem:** Long-running transactions fail

**Solutions:**

1. Break large operations into smaller batches
2. Increase transaction timeout in database
3. Use optimistic locking for concurrent updates
4. Process records in smaller groups

## Next Steps

- [Database Performance Guide](../database-performance.md) - Optimization techniques
- [Migration Guide](../migration-guide.md) - Deduplicate existing databases
- [Complete Example](../../examples/database-adapters/prisma-example.ts) - Full working example

## Resources

- [Prisma Documentation](https://www.prisma.io/docs)
- [Prisma Best Practices](https://www.prisma.io/docs/guides/performance-and-optimization)
- [Connection Pooling](https://www.prisma.io/docs/guides/performance-and-optimization/connection-management)
