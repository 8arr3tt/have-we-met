# Database Adapters

Database adapters provide the bridge between have-we-met's matching engine and your persistent data storage. Rather than requiring you to load entire datasets into memory, adapters enable efficient querying, filtering, and writing directly to your database of choice.

## Overview

**have-we-met** supports three major ORM adapters:
- **Prisma**: Schema-first ORM with excellent TypeScript integration
- **Drizzle**: Lightweight, type-safe query builder
- **TypeORM**: Mature, decorator-based ORM with broad database support

All adapters implement a common `DatabaseAdapter<T>` interface, making it easy to switch between ORMs or even implement your own custom adapter.

## Why Use Database Adapters?

### Memory Efficiency
Instead of loading your entire dataset into memory, adapters fetch only the records needed for matching based on your blocking configuration.

### Performance
Adapters leverage database indexes and efficient queries to reduce the number of comparisons from O(n²) to manageable levels.

### Persistence
Results can be saved directly back to your database, maintaining data consistency through transactions.

### Scalability
Process millions of records by streaming batches rather than loading everything at once.

## Quick Start

### Basic Setup

```typescript
import { HaveWeMet } from 'have-we-met'
import { prismaAdapter } from 'have-we-met/adapters/prisma'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const resolver = HaveWeMet.create<Customer>()
  .schema(schema => {
    schema
      .field('firstName', { type: 'name', component: 'first' })
      .field('lastName', { type: 'name', component: 'last' })
      .field('email', { type: 'email' })
  })
  .blocking(block => block
    .onField('lastName', { transform: 'soundex' })
  )
  .matching(match => {
    match
      .field('email').strategy('exact').weight(20)
      .field('firstName').strategy('jaro-winkler').weight(10)
      .field('lastName').strategy('jaro-winkler').weight(10)
      .thresholds({ noMatch: 20, definiteMatch: 45 })
  })
  .adapter(prismaAdapter(prisma, { tableName: 'customers' }))
  .build()
```

### Resolving a Single Record

```typescript
const newCustomer = {
  firstName: 'John',
  lastName: 'Smith',
  email: 'john.smith@example.com'
}

const matches = await resolver.resolveWithDatabase(newCustomer)

matches.forEach(match => {
  console.log(`Found ${match.outcome}: ${match.record.id} (score: ${match.score.totalScore})`)
})
```

### Batch Deduplication

```typescript
const result = await resolver.deduplicateBatchFromDatabase({
  batchSize: 1000,
  persistResults: true
})

console.log(`Processed ${result.totalProcessed} records`)
console.log(`Found ${result.duplicateGroupsFound} duplicate groups`)
console.log(`Completed in ${result.durationMs}ms`)
```

## Review Queue Support

**Phase 7 Feature:** All database adapters now support the review queue for human-in-the-loop matching decisions.

### Queue Adapter Interface

When you configure an adapter, it automatically includes a `queue` property for persisting review queue items:

```typescript
const resolver = HaveWeMet.create<Customer>()
  // ... schema, blocking, matching ...
  .adapter(prismaAdapter(prisma, {
    tableName: 'customers',
    queue: {
      autoExpireAfter: 30 * 24 * 60 * 60 * 1000, // 30 days
      defaultPriority: 0,
      enableMetrics: true
    }
  }))
  .build()

// Queue is automatically available
await resolver.queue.add({
  candidateRecord: newCustomer,
  potentialMatches: matches,
  context: { source: 'import' }
})
```

### Queue Schema

The queue adapter stores items in a separate table/collection (e.g., `review_queue`):

```sql
-- Example PostgreSQL schema
CREATE TABLE review_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_record JSONB NOT NULL,
  potential_matches JSONB NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  decided_at TIMESTAMP,
  decided_by VARCHAR(255),
  decision JSONB,
  context JSONB,
  priority INTEGER DEFAULT 0,
  tags TEXT[]
);

-- Indexes for common queries
CREATE INDEX idx_queue_status ON review_queue(status);
CREATE INDEX idx_queue_created_at ON review_queue(created_at);
CREATE INDEX idx_queue_priority ON review_queue(priority);
CREATE INDEX idx_queue_status_created ON review_queue(status, created_at);
```

### Queue Operations

All adapters provide these queue-specific methods:

```typescript
interface QueueAdapter<T> {
  insertQueueItem(item: QueueItem<T>): Promise<QueueItem<T>>
  updateQueueItem(id: string, updates: Partial<QueueItem<T>>): Promise<QueueItem<T>>
  findQueueItems(filter: QueueFilter): Promise<QueueItem<T>[]>
  findQueueItemById(id: string): Promise<QueueItem<T> | null>
  deleteQueueItem(id: string): Promise<void>
  countQueueItems(filter?: QueueFilter): Promise<number>
  batchInsertQueueItems(items: QueueItem<T>[]): Promise<QueueItem<T>[]>
}
```

These methods handle JSON serialization, filtering, and efficient queries for the review queue.

See [Review Queue Documentation](./review-queue.md) for complete queue usage guide.

## Adapter Interface

All adapters implement the `DatabaseAdapter<T>` interface:

### Core Methods

#### `findByBlockingKeys(blockingKeys, options?)`
Finds records matching the blocking criteria. This is the primary method used to retrieve candidate records for matching.

```typescript
const blockingKeys = new Map([
  ['lastName', 'Smith'],
  ['dobYear', '1985']
])

const candidates = await adapter.findByBlockingKeys(blockingKeys, {
  limit: 100
})
```

#### `findByIds(ids)`
Retrieves specific records by their identifiers.

```typescript
const records = await adapter.findByIds(['id1', 'id2', 'id3'])
```

#### `findAll(options?)`
Gets all records with optional pagination and filtering. Used for batch processing.

```typescript
const records = await adapter.findAll({
  limit: 1000,
  offset: 0,
  orderBy: { field: 'createdAt', direction: 'desc' }
})
```

#### `count(filter?)`
Counts records, optionally with filter criteria.

```typescript
const total = await adapter.count()
const active = await adapter.count({ status: { operator: 'eq', value: 'active' } })
```

### CRUD Operations

#### `insert(record)`
Inserts a new record and returns it with generated fields (e.g., ID).

```typescript
const newRecord = await adapter.insert({
  firstName: 'Jane',
  lastName: 'Doe',
  email: 'jane@example.com'
})
```

#### `update(id, updates)`
Updates an existing record.

```typescript
const updated = await adapter.update('id123', {
  email: 'newemail@example.com',
  status: 'verified'
})
```

#### `delete(id)`
Deletes a record.

```typescript
await adapter.delete('id123')
```

### Batch Operations

#### `batchInsert(records)`
Inserts multiple records efficiently. Much faster than individual inserts.

```typescript
const records = [
  { firstName: 'John', lastName: 'Doe' },
  { firstName: 'Jane', lastName: 'Smith' }
]
const inserted = await adapter.batchInsert(records)
```

#### `batchUpdate(updates)`
Updates multiple records in a single operation.

```typescript
const updates = [
  { id: 'id1', updates: { status: 'merged' } },
  { id: 'id2', updates: { status: 'merged' } }
]
const updated = await adapter.batchUpdate(updates)
```

### Transactions

#### `transaction(callback)`
Executes operations within a transaction, ensuring atomicity.

```typescript
const result = await adapter.transaction(async (txAdapter) => {
  const newRecord = await txAdapter.insert(mergedRecord)
  await txAdapter.delete(oldRecordId1)
  await txAdapter.delete(oldRecordId2)
  return newRecord
})
```

## Configuration Options

### AdapterConfig

```typescript
interface AdapterConfig {
  tableName: string              // Database table/collection name
  primaryKey?: string            // Primary key field (default: 'id')
  fieldMapping?: Record<string, string>  // Map schema fields to DB columns
  usePreparedStatements?: boolean // Use prepared statements (default: true)
  poolConfig?: {
    min?: number                 // Minimum pool connections
    max?: number                 // Maximum pool connections
    idleTimeoutMs?: number       // Idle connection timeout
  }
}
```

### Example with Field Mapping

```typescript
const adapter = prismaAdapter(prisma, {
  tableName: 'customers',
  primaryKey: 'customer_id',
  fieldMapping: {
    firstName: 'first_name',      // Schema field -> DB column
    lastName: 'last_name',
    dateOfBirth: 'dob'
  }
})
```

## Resolver Database Methods

### `resolveWithDatabase(candidateRecord, options?)`

Resolve a single record against your database using blocking for efficiency.

```typescript
const matches = await resolver.resolveWithDatabase(newCustomer, {
  useBlocking: true,      // Use blocking to reduce queries (default: true)
  maxFetchSize: 1000      // Maximum records to fetch (default: 1000)
})
```

**How it works:**
1. Generates blocking keys from the candidate record
2. Queries database using `adapter.findByBlockingKeys()`
3. Applies in-memory matching to retrieved candidates
4. Returns match results sorted by score

### `deduplicateBatchFromDatabase(options?)`

Find all duplicates in your database by comparing records within blocking groups.

```typescript
const result = await resolver.deduplicateBatchFromDatabase({
  batchSize: 1000,           // Process N records at a time (default: 1000)
  persistResults: false,     // Save results to database (default: false)
  maxRecords: 10000,         // Limit processing (default: unlimited)
  returnExplanation: true    // Include detailed explanations (default: true)
})
```

**Returns:**
```typescript
interface DeduplicationBatchResult {
  totalProcessed: number          // Records processed
  duplicateGroupsFound: number    // Number of duplicate clusters
  totalDuplicates: number         // Total duplicate records
  durationMs: number              // Time taken
  results: Array<{
    masterRecordId: string
    duplicateIds: string[]
    score: number
  }>
}
```

### `findAndMergeDuplicates(options?)`

Identifies and merges duplicate records using configured merge strategies.

```typescript
const results = await resolver.findAndMergeDuplicates({
  deleteAfterMerge: false,       // Delete source records (default: false)
  useTransaction: true,          // Use transactions (default: true)
})
```

The merge uses the strategies configured via the `.merge()` builder:

```typescript
const resolver = HaveWeMet.create<Customer>()
  .schema(/* ... */)
  .matching(/* ... */)
  .merge(merge => merge
    .timestampField('updatedAt')
    .defaultStrategy('preferNonNull')
    .field('firstName').strategy('preferLonger')
    .field('email').strategy('preferNewer')
  )
  .adapter(prismaAdapter(prisma, { tableName: 'customers' }))
  .build()
```

See [Golden Record](./golden-record.md) for complete merge configuration.

## Error Handling

Adapters throw specific error types for different failure scenarios:

### AdapterError Types

```typescript
import { ConnectionError, QueryError, TransactionError, ValidationError } from 'have-we-met/adapters'

try {
  await adapter.findByBlockingKeys(keys)
} catch (error) {
  if (error instanceof ConnectionError) {
    console.error('Database connection failed:', error.message)
  } else if (error instanceof QueryError) {
    console.error('Query execution failed:', error.message, error.context)
  } else if (error instanceof TransactionError) {
    console.error('Transaction failed:', error.message)
  } else if (error instanceof ValidationError) {
    console.error('Invalid configuration:', error.message)
  }
}
```

## Best Practices

### 1. Always Use Blocking

Blocking is essential for database performance. Without it, you'll query the entire table for every record.

```typescript
// Good: Uses blocking to reduce query scope
.blocking(block => block
  .onField('lastName', { transform: 'soundex' })
)

// Bad: No blocking means full table scans
// Don't do this with large datasets!
```

### 2. Create Appropriate Indexes

Index your blocking fields for optimal query performance.

```sql
-- Standard blocking
CREATE INDEX idx_customers_lastname_soundex ON customers(soundex_lastname);

-- Sorted neighbourhood
CREATE INDEX idx_customers_sortkey ON customers(last_name, first_name);

-- Composite blocking
CREATE INDEX idx_customers_composite ON customers(last_name, dob_year);
```

See [Database Performance](./database-performance.md) for index recommendations.

### 3. Use Batch Operations

Process large datasets in batches to manage memory efficiently.

```typescript
const result = await resolver.deduplicateBatchFromDatabase({
  batchSize: 1000  // Process 1000 records at a time
})
```

### 4. Use Transactions for Consistency

When merging or updating multiple records, use transactions.

```typescript
await adapter.transaction(async (txAdapter) => {
  const merged = await txAdapter.insert(mergedRecord)
  await txAdapter.delete(duplicate1Id)
  await txAdapter.delete(duplicate2Id)
  return merged
})
```

### 5. Monitor Query Performance

Use your database's query analyzer to identify slow queries.

```typescript
// Enable query logging in development
const adapter = prismaAdapter(prisma, {
  tableName: 'customers'
})

// Profile queries to find bottlenecks
const start = Date.now()
const results = await adapter.findByBlockingKeys(keys)
console.log(`Query took ${Date.now() - start}ms`)
```

## Queue Migrations

When adding the review queue to an existing database, you'll need to create the queue table. Each adapter provides migration examples:

### Prisma Migration

```prisma
// schema.prisma
model ReviewQueue {
  id                String   @id @default(uuid())
  candidateRecord   Json
  potentialMatches  Json
  status            String
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  decidedAt         DateTime?
  decidedBy         String?
  decision          Json?
  context           Json?
  priority          Int      @default(0)
  tags              String[] @default([])

  @@index([status])
  @@index([createdAt])
  @@index([priority])
  @@index([status, createdAt])
}
```

```bash
npx prisma migrate dev --name add_review_queue
```

### Drizzle Migration

```typescript
// drizzle/schema.ts
import { pgTable, uuid, jsonb, varchar, timestamp, integer, text } from 'drizzle-orm/pg-core'

export const reviewQueue = pgTable('review_queue', {
  id: uuid('id').primaryKey().defaultRandom(),
  candidateRecord: jsonb('candidate_record').notNull(),
  potentialMatches: jsonb('potential_matches').notNull(),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  decidedAt: timestamp('decided_at'),
  decidedBy: varchar('decided_by', { length: 255 }),
  decision: jsonb('decision'),
  context: jsonb('context'),
  priority: integer('priority').default(0),
  tags: text('tags').array()
})
```

```bash
npx drizzle-kit generate
npx drizzle-kit migrate
```

### TypeORM Migration

```typescript
// migrations/xxxxx-add-review-queue.ts
import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm'

export class AddReviewQueue1234567890 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'review_queue',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'uuid_generate_v4()' },
          { name: 'candidate_record', type: 'jsonb' },
          { name: 'potential_matches', type: 'jsonb' },
          { name: 'status', type: 'varchar', length: '20', default: "'pending'" },
          { name: 'created_at', type: 'timestamp', default: 'now()' },
          { name: 'updated_at', type: 'timestamp', default: 'now()' },
          { name: 'decided_at', type: 'timestamp', isNullable: true },
          { name: 'decided_by', type: 'varchar', length: '255', isNullable: true },
          { name: 'decision', type: 'jsonb', isNullable: true },
          { name: 'context', type: 'jsonb', isNullable: true },
          { name: 'priority', type: 'integer', default: 0 },
          { name: 'tags', type: 'text[]', default: 'ARRAY[]::text[]' }
        ]
      })
    )

    await queryRunner.createIndex('review_queue', new TableIndex({
      name: 'idx_queue_status',
      columnNames: ['status']
    }))

    await queryRunner.createIndex('review_queue', new TableIndex({
      name: 'idx_queue_created_at',
      columnNames: ['created_at']
    }))
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('review_queue')
  }
}
```

```bash
npm run typeorm migration:run
```

## Golden Record Merge Support

Database adapters support the golden record merge system for creating and managing merged records.

### Merge Schema Requirements

When using merge functionality, your database needs additional tables/fields for:

1. **Provenance tracking**: Records which source records contributed to each golden record
2. **Source record archive**: Preserves original records for potential unmerge

### Prisma Provenance Schema

```prisma
model Provenance {
  id              String   @id @default(uuid())
  goldenRecordId  String   @unique
  sourceRecordIds String[]
  mergedAt        DateTime
  mergedBy        String?
  queueItemId     String?
  fieldSources    Json
  strategyUsed    Json
  unmerged        Boolean  @default(false)
  unmergedAt      DateTime?
  unmergedBy      String?
  unmergeReason   String?

  @@index([goldenRecordId])
  @@index([mergedAt])
  @@index([unmerged])
}

model SourceRecordArchive {
  id              String   @id @default(uuid())
  goldenRecordId  String
  recordData      Json
  createdAt       DateTime
  updatedAt       DateTime

  @@index([goldenRecordId])
}
```

### Drizzle Provenance Schema

```typescript
import { pgTable, uuid, jsonb, varchar, timestamp, boolean, text } from 'drizzle-orm/pg-core'

export const provenance = pgTable('provenance', {
  id: uuid('id').primaryKey().defaultRandom(),
  goldenRecordId: varchar('golden_record_id', { length: 255 }).notNull().unique(),
  sourceRecordIds: text('source_record_ids').array().notNull(),
  mergedAt: timestamp('merged_at').notNull(),
  mergedBy: varchar('merged_by', { length: 255 }),
  queueItemId: varchar('queue_item_id', { length: 255 }),
  fieldSources: jsonb('field_sources').notNull(),
  strategyUsed: jsonb('strategy_used').notNull(),
  unmerged: boolean('unmerged').default(false),
  unmergedAt: timestamp('unmerged_at'),
  unmergedBy: varchar('unmerged_by', { length: 255 }),
  unmergeReason: text('unmerge_reason'),
})

export const sourceRecordArchive = pgTable('source_record_archive', {
  id: uuid('id').primaryKey().defaultRandom(),
  goldenRecordId: varchar('golden_record_id', { length: 255 }).notNull(),
  recordData: jsonb('record_data').notNull(),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
})
```

### Using Merge with Adapters

```typescript
const resolver = HaveWeMet.create<Customer>()
  .schema(/* ... */)
  .matching(/* ... */)
  .merge(merge => merge
    .timestampField('updatedAt')
    .defaultStrategy('preferNonNull')
    .field('firstName').strategy('preferLonger')
    .field('email').strategy('preferNewer')
  )
  .adapter(prismaAdapter(prisma, {
    tableName: 'customers',
    // Merge operations use the configured strategies
  }))
  .build()

// Merge from queue
await resolver.queue.merge('queue-item-id', {
  selectedMatchId: 'match-id',
  decidedBy: 'reviewer@example.com',
})
// Creates golden record, archives sources, stores provenance
```

See [Golden Record](./golden-record.md), [Provenance](./provenance.md), and [Unmerge](./unmerge.md) for complete merge documentation.

## Next Steps

- [Prisma Adapter Guide](./adapter-guides/prisma.md) - Prisma-specific setup and examples
- [Drizzle Adapter Guide](./adapter-guides/drizzle.md) - Drizzle-specific setup and examples
- [TypeORM Adapter Guide](./adapter-guides/typeorm.md) - TypeORM-specific setup and examples
- [Database Performance](./database-performance.md) - Performance tuning and optimization
- [Migration Guide](./migration-guide.md) - Deduplicate existing databases
- [Review Queue](./review-queue.md) - Human-in-the-loop review workflows
- [Golden Record](./golden-record.md) - Merge configuration and strategies

## Examples

Complete working examples are available in the `examples/` directory:
- `examples/database-adapters/prisma-example.ts` - Customer deduplication with Prisma
- `examples/database-adapters/drizzle-example.ts` - Patient matching with Drizzle
- `examples/database-adapters/typeorm-example.ts` - Contact merging with TypeORM
- `examples/golden-record/basic-merge.ts` - Basic merge workflow
- `examples/golden-record/custom-strategies.ts` - Custom merge strategies
- `examples/golden-record/queue-merge.ts` - Queue-triggered merges
- `examples/golden-record/unmerge.ts` - Unmerge operations
