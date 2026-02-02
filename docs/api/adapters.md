# Database Adapters API Reference

Database adapters provide storage-agnostic persistence for the resolver, enabling efficient blocking queries, batch operations, queue persistence, and merge tracking.

## Available Adapters

| Adapter | Import           | Description              |
| ------- | ---------------- | ------------------------ |
| Prisma  | `prismaAdapter`  | For Prisma ORM projects  |
| Drizzle | `drizzleAdapter` | For Drizzle ORM projects |
| TypeORM | `typeormAdapter` | For TypeORM projects     |

## Quick Start

```typescript
import { HaveWeMet, prismaAdapter } from 'have-we-met'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const resolver = HaveWeMet.create<Customer>()
  .schema(/* ... */)
  .blocking(/* ... */)
  .matching(/* ... */)
  .adapter(
    prismaAdapter(prisma, {
      tableName: 'customers',
      idField: 'id',
    })
  )
  .build()
```

---

## DatabaseAdapter<T> Interface

The core interface that all adapters implement.

### Query Methods

#### `findByBlockingKeys(blockingKeys, options?): Promise<T[]>`

Find records matching blocking criteria. Used internally by the resolver for efficient candidate retrieval.

**Parameters:**

- `blockingKeys: Map<string, unknown>` - Key-value pairs for blocking
- `options?: QueryOptions`
  - `limit?: number` - Maximum records to return
  - `offset?: number` - Skip first N records
  - `orderBy?: OrderByClause` - Sort order

**Returns:** `Promise<T[]>`

**Example:**

```typescript
const candidates = await adapter.findByBlockingKeys(
  new Map([
    ['lastName_soundex', 'S530'],
    ['dob_year', '1990'],
  ]),
  { limit: 100 }
)
```

#### `findByIds(ids: string[]): Promise<T[]>`

Find records by their primary keys.

**Parameters:**

- `ids: string[]` - Array of record IDs

**Returns:** `Promise<T[]>`

#### `findAll(options?): Promise<T[]>`

Get all records with optional filtering and pagination.

**Parameters:**

- `options?: QueryOptions`
  - `filter?: FilterCriteria` - Filter conditions
  - `limit?: number` - Maximum records
  - `offset?: number` - Skip first N
  - `orderBy?: OrderByClause` - Sort order

**Returns:** `Promise<T[]>`

**Example:**

```typescript
const recentCustomers = await adapter.findAll({
  filter: { createdAt: { gt: new Date('2024-01-01') } },
  orderBy: { createdAt: 'desc' },
  limit: 1000,
})
```

#### `count(filter?): Promise<number>`

Count total records, optionally filtered.

**Parameters:**

- `filter?: FilterCriteria` - Optional filter conditions

**Returns:** `Promise<number>`

### Write Methods

#### `insert(record: T): Promise<T>`

Insert a new record.

**Parameters:**

- `record: T` - Record to insert

**Returns:** `Promise<T>` - Inserted record with generated ID

#### `update(id: string, updates: Partial<T>): Promise<T>`

Update an existing record.

**Parameters:**

- `id: string` - Record ID
- `updates: Partial<T>` - Fields to update

**Returns:** `Promise<T>` - Updated record

#### `delete(id: string): Promise<void>`

Delete a record.

**Parameters:**

- `id: string` - Record ID to delete

#### `batchInsert(records: T[]): Promise<T[]>`

Insert multiple records efficiently.

**Parameters:**

- `records: T[]` - Records to insert

**Returns:** `Promise<T[]>` - Inserted records

#### `batchUpdate(updates): Promise<T[]>`

Update multiple records efficiently.

**Parameters:**

- `updates: Array<{ id: string; updates: Partial<T> }>` - Update specifications

**Returns:** `Promise<T[]>` - Updated records

### Transaction Support

#### `transaction<R>(callback): Promise<R>`

Execute operations within a transaction.

**Parameters:**

- `callback: (adapter: DatabaseAdapter<T>) => Promise<R>` - Operations to execute

**Returns:** `Promise<R>` - Callback result

**Example:**

```typescript
const result = await adapter.transaction(async (txAdapter) => {
  const merged = await txAdapter.update(primaryId, mergedData)
  await txAdapter.delete(duplicateId)
  return merged
})
```

### Queue Support

#### `queue?: QueueAdapter<T>`

Optional queue adapter for review queue persistence.

---

## Prisma Adapter

### `prismaAdapter<T>(client, options): DatabaseAdapter<T>`

Create a Prisma adapter.

**Parameters:**

- `client: PrismaClient` - Prisma client instance
- `options: PrismaAdapterOptions`
  - `tableName: string` - Prisma model name (e.g., `'customer'`)
  - `idField?: string` - Primary key field (default: `'id'`)
  - `fieldMapping?: Record<string, string>` - Map schema fields to DB columns

**Returns:** `DatabaseAdapter<T>`

**Example:**

```typescript
import { prismaAdapter } from 'have-we-met'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const adapter = prismaAdapter<Customer>(prisma, {
  tableName: 'customer',
  idField: 'id',
  fieldMapping: {
    firstName: 'first_name',
    lastName: 'last_name',
  },
})
```

### Merge and Provenance Adapters

```typescript
import {
  createPrismaMergeAdapter,
  createPrismaProvenanceAdapter,
} from 'have-we-met'

// Merge adapter for golden record persistence
const mergeAdapter = createPrismaMergeAdapter(prisma, {
  tableName: 'customer',
  archiveTableName: 'customer_archive',
  idField: 'id',
})

// Provenance adapter for tracking field sources
const provenanceAdapter = createPrismaProvenanceAdapter(prisma, {
  tableName: 'provenance_records',
})
```

---

## Drizzle Adapter

### `drizzleAdapter<T>(db, options): DatabaseAdapter<T>`

Create a Drizzle adapter.

**Parameters:**

- `db: DrizzleDB` - Drizzle database instance
- `options: DrizzleAdapterOptions`
  - `table: Table` - Drizzle table definition
  - `idField?: string` - Primary key field (default: `'id'`)
  - `fieldMapping?: Record<string, string>` - Map schema fields to DB columns

**Returns:** `DatabaseAdapter<T>`

**Example:**

```typescript
import { drizzleAdapter } from 'have-we-met'
import { drizzle } from 'drizzle-orm/node-postgres'
import { customers } from './schema'

const db = drizzle(pool)

const adapter = drizzleAdapter<Customer>(db, {
  table: customers,
  idField: 'id',
})
```

### Merge and Provenance Adapters

```typescript
import {
  createDrizzleMergeAdapter,
  createDrizzleProvenanceAdapter,
} from 'have-we-met'

const mergeAdapter = createDrizzleMergeAdapter(db, {
  table: customers,
  archiveTable: customersArchive,
  idField: 'id',
})

const provenanceAdapter = createDrizzleProvenanceAdapter(db, {
  table: provenanceRecords,
})
```

---

## TypeORM Adapter

### `typeormAdapter<T>(dataSource, options): DatabaseAdapter<T>`

Create a TypeORM adapter.

**Parameters:**

- `dataSource: DataSource` - TypeORM data source
- `options: TypeORMAdapterOptions`
  - `entity: EntityTarget<T>` - TypeORM entity class
  - `idField?: string` - Primary key field (default: `'id'`)
  - `fieldMapping?: Record<string, string>` - Map schema fields to DB columns

**Returns:** `DatabaseAdapter<T>`

**Example:**

```typescript
import { typeormAdapter } from 'have-we-met'
import { DataSource } from 'typeorm'
import { Customer } from './entities/Customer'

const dataSource = new DataSource({
  /* ... */
})

const adapter = typeormAdapter<Customer>(dataSource, {
  entity: Customer,
  idField: 'id',
})
```

### Merge and Provenance Adapters

```typescript
import {
  createTypeORMMergeAdapter,
  createTypeORMProvenanceAdapter,
} from 'have-we-met'

const mergeAdapter = createTypeORMMergeAdapter(dataSource, {
  entity: Customer,
  archiveEntity: CustomerArchive,
  idField: 'id',
})

const provenanceAdapter = createTypeORMProvenanceAdapter(dataSource, {
  entity: ProvenanceRecord,
})
```

---

## Field Mapping

Field mapping translates between your schema field names and database column names:

```typescript
const adapter = prismaAdapter<Customer>(prisma, {
  tableName: 'customers',
  fieldMapping: {
    // Schema field -> Database column
    firstName: 'first_name',
    lastName: 'last_name',
    dateOfBirth: 'dob',
    'address.street': 'street_address',
    'address.city': 'city',
  },
})
```

---

## Performance Utilities

### IndexAnalyzer

Analyze and suggest database indexes for blocking fields.

```typescript
import { IndexAnalyzer } from 'have-we-met'

const analyzer = new IndexAnalyzer(blockingConfig)
const recommendations = analyzer.analyze()

console.log(recommendations)
// [
//   { field: 'lastName_soundex', type: 'btree', priority: 'high' },
//   { field: 'email', type: 'hash', priority: 'high' },
//   { field: 'dob_year', type: 'btree', priority: 'medium' }
// ]

// Generate SQL
const sql = analyzer.generateSQL('customers')
console.log(sql)
// CREATE INDEX idx_customers_lastname_soundex ON customers (last_name_soundex);
// CREATE INDEX idx_customers_email ON customers USING hash (email);
```

### QueryProfiler

Profile query performance for optimization.

```typescript
import { QueryProfiler } from 'have-we-met'

const profiler = new QueryProfiler(adapter)

// Profile a blocking query
const profile = await profiler.profileBlockingQuery({
  field: 'lastName',
  transform: 'soundex',
  sampleSize: 1000,
})

console.log(profile)
// {
//   averageLatency: 12.5,
//   p95Latency: 28.3,
//   recordsPerSecond: 8500,
//   recommendations: ['Add index on last_name_soundex']
// }
```

---

## Queue Adapter

The queue adapter extends the base adapter with review queue operations.

### QueueAdapter<T> Interface

```typescript
interface QueueAdapter<T> {
  // Add item to queue
  addQueueItem(item: AddQueueItemRequest): Promise<QueueItem>

  // Batch add items
  addQueueItems(items: AddQueueItemRequest[]): Promise<QueueItem[]>

  // Get queue item by ID
  getQueueItem(id: string): Promise<QueueItem | null>

  // List queue items with filtering
  listQueueItems(options?: ListQueueOptions): Promise<QueueItemList>

  // Update queue item status
  updateQueueItem(id: string, update: QueueItemUpdate): Promise<QueueItem>

  // Delete queue items
  deleteQueueItems(ids: string[]): Promise<number>

  // Get queue statistics
  getQueueStats(options?: StatsOptions): Promise<QueueStats>
}
```

### Usage

```typescript
const resolver = HaveWeMet.create<Customer>()
  .schema(/* ... */)
  .adapter(
    prismaAdapter(prisma, {
      tableName: 'customers',
      queue: {
        tableName: 'review_queue',
      },
    })
  )
  .build()

// Access queue through resolver
const queue = resolver.queue
await queue.add({
  /* ... */
})
```

---

## Database Schema Requirements

### Main Table

Your main table needs:

- Primary key field (default: `id`)
- All fields referenced in schema/blocking/matching configuration

### Queue Table (if using review queue)

```sql
CREATE TABLE review_queue (
  id VARCHAR(36) PRIMARY KEY,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  candidate_record JSONB NOT NULL,
  matched_record JSONB NOT NULL,
  score DECIMAL(10, 4) NOT NULL,
  explanation JSONB,
  priority INTEGER DEFAULT 0,
  tags TEXT[],
  assigned_to VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  decided_at TIMESTAMP,
  decision_type VARCHAR(20),
  decision_by VARCHAR(255),
  decision_notes TEXT
);

CREATE INDEX idx_queue_status ON review_queue (status);
CREATE INDEX idx_queue_priority ON review_queue (priority DESC);
CREATE INDEX idx_queue_created ON review_queue (created_at);
```

### Archive Table (if using merge/unmerge)

```sql
CREATE TABLE customers_archive (
  id VARCHAR(36) PRIMARY KEY,
  original_id VARCHAR(36) NOT NULL,
  merged_into VARCHAR(36) NOT NULL,
  data JSONB NOT NULL,
  merged_at TIMESTAMP DEFAULT NOW(),
  merged_by VARCHAR(255)
);

CREATE INDEX idx_archive_original ON customers_archive (original_id);
CREATE INDEX idx_archive_merged ON customers_archive (merged_into);
```

### Provenance Table (if using provenance tracking)

```sql
CREATE TABLE provenance_records (
  id VARCHAR(36) PRIMARY KEY,
  golden_record_id VARCHAR(36) NOT NULL,
  field_name VARCHAR(255) NOT NULL,
  source_record_id VARCHAR(36) NOT NULL,
  value JSONB,
  merged_at TIMESTAMP DEFAULT NOW(),
  strategy VARCHAR(50)
);

CREATE INDEX idx_provenance_golden ON provenance_records (golden_record_id);
CREATE INDEX idx_provenance_field ON provenance_records (golden_record_id, field_name);
```

---

## Complete Example

```typescript
import { HaveWeMet, prismaAdapter, IndexAnalyzer } from 'have-we-met'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// Create adapter with all features
const adapter = prismaAdapter<Patient>(prisma, {
  tableName: 'patients',
  idField: 'id',
  fieldMapping: {
    firstName: 'first_name',
    lastName: 'last_name',
    dateOfBirth: 'dob',
  },
})

// Create resolver
const resolver = HaveWeMet.create<Patient>()
  .schema(/* ... */)
  .blocking((block) =>
    block
      .onField('lastName', { transform: 'soundex' })
      .onField('dateOfBirth', { transform: 'year' })
  )
  .matching(/* ... */)
  .adapter(adapter)
  .build()

// Analyze index requirements
const analyzer = new IndexAnalyzer(resolver.getBlockingConfig())
console.log('Index recommendations:')
console.log(analyzer.generateSQL('patients'))

// Use database operations
const matches = await resolver.resolveWithDatabase(newPatient)
const duplicates = await resolver.deduplicateBatchFromDatabase({
  batchSize: 5000,
})
```

---

## Related

- [Database Adapters Guide](../database-adapters.md) - Detailed setup guide
- [Database Performance](../database-performance.md) - Optimization strategies
- [Adapter Guides](../adapter-guides/) - ORM-specific guides
- [Golden Record](../golden-record.md) - Merge adapter usage
- [Review Queue](../review-queue.md) - Queue adapter usage
