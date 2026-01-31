# Database Performance Optimization

This guide provides comprehensive strategies for optimizing **have-we-met** performance when working with database adapters.

## Performance Targets

Expected performance with proper optimization:

| Operation | Dataset Size | Target Time | Memory Usage |
|-----------|-------------|-------------|--------------|
| Single record resolution | Any | < 50ms | < 10MB |
| Batch deduplication | 10k records | < 10 seconds | < 100MB |
| Batch deduplication | 100k records | < 2 minutes | < 500MB |
| Batch deduplication | 1M records | < 20 minutes | < 1GB |
| Blocking query | Any | < 10ms | Minimal |
| Batch insert | 1000 records | < 100ms | Minimal |

## Index Strategy

Indexes are critical for query performance. Without proper indexes, blocking queries will perform full table scans.

### Essential Indexes

Create indexes on all blocking fields:

```sql
-- Standard blocking fields
CREATE INDEX idx_customers_lastname ON customers(last_name);
CREATE INDEX idx_customers_email ON customers(email);
CREATE INDEX idx_customers_phone ON customers(phone);

-- Pre-computed blocking keys
CREATE INDEX idx_customers_soundex_lastname ON customers(soundex_lastname);
CREATE INDEX idx_customers_metaphone_lastname ON customers(metaphone_lastname);
CREATE INDEX idx_customers_dob_year ON customers(dob_year);
CREATE INDEX idx_customers_created_year ON customers(created_year);

-- Composite indexes for multi-field blocking
CREATE INDEX idx_customers_lastname_dobyear ON customers(last_name, dob_year);
CREATE INDEX idx_customers_lastname_email ON customers(last_name, email);
```

### Index Recommendations by Blocking Strategy

#### Standard Blocking

For each blocking field, create a single-column index:

```typescript
.blocking(block => block
  .onField('lastName')
  .onField('email')
)
```

```sql
CREATE INDEX idx_customers_lastname ON customers(last_name);
CREATE INDEX idx_customers_email ON customers(email);
```

#### Soundex/Metaphone Blocking

Pre-compute phonetic codes and index them:

```typescript
.blocking(block => block
  .onField('lastName', { transform: 'soundex' })
)
```

```sql
-- Add column for pre-computed value
ALTER TABLE customers ADD COLUMN soundex_lastname VARCHAR(4);

-- Create index
CREATE INDEX idx_customers_soundex_lastname ON customers(soundex_lastname);

-- Populate values (one-time)
UPDATE customers SET soundex_lastname = SOUNDEX(last_name);
```

#### Year-based Blocking

Extract and index year components:

```typescript
.blocking(block => block
  .onField('dateOfBirth', { transform: 'year' })
)
```

```sql
ALTER TABLE customers ADD COLUMN dob_year INT;
CREATE INDEX idx_customers_dob_year ON customers(dob_year);

-- Populate values
UPDATE customers SET dob_year = EXTRACT(YEAR FROM date_of_birth);
```

#### Composite Blocking

Use composite indexes when blocking on multiple fields:

```typescript
.blocking(block => block
  .composite([
    { field: 'lastName' },
    { field: 'dobYear' }
  ])
)
```

```sql
-- Order matters: most selective field first
CREATE INDEX idx_customers_composite ON customers(last_name, dob_year);
```

### Index Maintenance

#### PostgreSQL

```sql
-- Analyze table statistics for query planner
ANALYZE customers;

-- Rebuild indexes if fragmented
REINDEX TABLE customers;

-- Monitor index usage
SELECT schemaname, tablename, indexname, idx_scan, idx_tup_read, idx_tup_fetch
FROM pg_stat_user_indexes
WHERE tablename = 'customers';
```

#### MySQL

```sql
-- Analyze table
ANALYZE TABLE customers;

-- Optimize table (rebuilds indexes)
OPTIMIZE TABLE customers;

-- Check index usage
SELECT * FROM sys.schema_unused_indexes WHERE object_schema = 'mydb';
```

#### SQLite

```sql
-- Analyze database
ANALYZE;

-- Rebuild indexes
REINDEX customers;
```

## Pre-computing Blocking Keys

Pre-compute expensive transformations at insert/update time rather than query time.

### Application-Level Pre-computation

```typescript
import { soundex, metaphone } from 'have-we-met/utils'

async function insertCustomer(customer: Customer) {
  const enriched = {
    ...customer,
    soundexLastName: soundex(customer.lastName),
    metaphoneLastName: metaphone(customer.lastName),
    dobYear: customer.dateOfBirth.getFullYear(),
    createdYear: new Date().getFullYear()
  }

  return await db.customer.create({ data: enriched })
}
```

### Database Triggers

#### PostgreSQL

```sql
CREATE OR REPLACE FUNCTION update_blocking_keys()
RETURNS TRIGGER AS $$
BEGIN
  NEW.soundex_lastname = SOUNDEX(NEW.last_name);
  NEW.dob_year = EXTRACT(YEAR FROM NEW.date_of_birth);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER customer_blocking_keys
  BEFORE INSERT OR UPDATE ON customers
  FOR EACH ROW
  EXECUTE FUNCTION update_blocking_keys();
```

#### MySQL

```sql
DELIMITER $$

CREATE TRIGGER customer_blocking_keys
BEFORE INSERT ON customers
FOR EACH ROW
BEGIN
  SET NEW.soundex_lastname = SOUNDEX(NEW.last_name);
  SET NEW.dob_year = YEAR(NEW.date_of_birth);
END$$

DELIMITER ;
```

### ORM Hooks

#### Prisma

```typescript
prisma.$use(async (params, next) => {
  if (params.model === 'Customer' && (params.action === 'create' || params.action === 'update')) {
    if (params.args.data.lastName) {
      params.args.data.soundexLastName = soundex(params.args.data.lastName)
    }
    if (params.args.data.dateOfBirth) {
      params.args.data.dobYear = params.args.data.dateOfBirth.getFullYear()
    }
  }
  return next(params)
})
```

#### TypeORM

```typescript
@EventSubscriber()
export class CustomerSubscriber implements EntitySubscriberInterface<Customer> {
  listenTo() {
    return Customer
  }

  beforeInsert(event: InsertEvent<Customer>) {
    this.updateBlockingKeys(event.entity)
  }

  beforeUpdate(event: UpdateEvent<Customer>) {
    if (event.entity) {
      this.updateBlockingKeys(event.entity)
    }
  }

  private updateBlockingKeys(customer: Customer) {
    if (customer.lastName) {
      customer.soundexLastName = soundex(customer.lastName)
    }
    if (customer.dateOfBirth) {
      customer.dobYear = customer.dateOfBirth.getFullYear()
    }
  }
}
```

## Query Optimization

### Field Projection

Only fetch fields needed for matching:

```typescript
// Good: Adapter automatically projects required fields
const matches = await resolver.resolveWithDatabase(candidate)

// Avoid: Fetching unnecessary fields manually
const allCustomers = await db.customer.findMany({
  select: { id: true, firstName: true, lastName: true, email: true, notes: true, history: true }
})
```

### Limit Result Sets

Always use blocking and limit fetch size:

```typescript
const matches = await resolver.resolveWithDatabase(candidate, {
  useBlocking: true,        // Essential for performance
  maxFetchSize: 1000        // Reasonable limit
})
```

### Avoid N+1 Queries

Batch operations when possible:

```typescript
// Good: Batch fetch
const customerIds = matches.map(m => m.record.id)
const fullCustomers = await adapter.findByIds(customerIds)

// Bad: Individual fetches
for (const match of matches) {
  const customer = await adapter.findByIds([match.record.id])  // N+1 problem
}
```

## Batch Processing

### Streaming vs Loading

For large datasets, process in batches:

```typescript
async function deduplicateInBatches() {
  const batchSize = 1000
  let offset = 0
  let hasMore = true

  while (hasMore) {
    const batch = await adapter.findAll({
      limit: batchSize,
      offset: offset
    })

    if (batch.length === 0) {
      hasMore = false
      break
    }

    // Process batch
    const results = resolver.deduplicateBatch(batch)

    // Handle results
    console.log(`Processed batch ${offset / batchSize + 1}`)

    offset += batchSize
  }
}
```

### Parallel Processing

Process independent batches in parallel:

```typescript
async function parallelDeduplication() {
  const totalRecords = await adapter.count()
  const batchSize = 1000
  const numBatches = Math.ceil(totalRecords / batchSize)
  const concurrency = 4  // Process 4 batches at once

  const batches = Array.from({ length: numBatches }, (_, i) => i)

  for (let i = 0; i < batches.length; i += concurrency) {
    const chunk = batches.slice(i, i + concurrency)

    await Promise.all(chunk.map(async (batchNum) => {
      const offset = batchNum * batchSize
      const records = await adapter.findAll({ limit: batchSize, offset })
      const results = resolver.deduplicateBatch(records)
      // Handle results
    }))
  }
}
```

## Connection Pooling

### PostgreSQL (pg)

```typescript
import { Pool } from 'pg'

const pool = new Pool({
  max: 20,                    // Maximum connections
  min: 5,                     // Minimum connections
  idleTimeoutMillis: 30000,   // Close idle after 30s
  connectionTimeoutMillis: 2000,  // Fail fast if no connection
  statement_timeout: 30000    // Query timeout
})
```

### MySQL (mysql2)

```typescript
import mysql from 'mysql2/promise'

const pool = mysql.createPool({
  connectionLimit: 20,
  queueLimit: 0,             // Unlimited queue
  waitForConnections: true,
  connectTimeout: 10000
})
```

### Connection Pool Monitoring

```typescript
// Log pool statistics
setInterval(() => {
  console.log(`Pool: ${pool.totalCount} total, ${pool.idleCount} idle, ${pool.waitingCount} waiting`)
}, 10000)
```

## Memory Management

### Avoid Loading Entire Dataset

```typescript
// Bad: Loads everything into memory
const allRecords = await adapter.findAll()
const result = resolver.deduplicateBatch(allRecords)

// Good: Process in batches
const result = await resolver.deduplicateBatchFromDatabase({
  batchSize: 1000
})
```

### Clean Up Connections

```typescript
// Always close connections when done
try {
  const matches = await resolver.resolveWithDatabase(candidate)
  // Process matches
} finally {
  await prisma.$disconnect()  // Prisma
  await pool.end()            // pg Pool
  await dataSource.destroy()  // TypeORM
}
```

## Profiling and Monitoring

### Query Timing

```typescript
async function profileQuery<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const start = Date.now()
  try {
    const result = await fn()
    const duration = Date.now() - start
    console.log(`[${name}] completed in ${duration}ms`)
    return result
  } catch (error) {
    const duration = Date.now() - start
    console.error(`[${name}] failed after ${duration}ms:`, error)
    throw error
  }
}

// Usage
const matches = await profileQuery('resolveWithDatabase', () =>
  resolver.resolveWithDatabase(candidate)
)
```

### Database Query Logging

#### Prisma

```typescript
const prisma = new PrismaClient({
  log: [
    { level: 'query', emit: 'event' },
    { level: 'error', emit: 'stdout' }
  ]
})

prisma.$on('query', (e) => {
  if (e.duration > 100) {
    console.log(`Slow query (${e.duration}ms): ${e.query}`)
  }
})
```

#### TypeORM

```typescript
export const AppDataSource = new DataSource({
  logging: ['query', 'error', 'warn'],
  maxQueryExecutionTime: 1000  // Log queries > 1s
})
```

### Database EXPLAIN

Analyze query plans:

#### PostgreSQL

```sql
EXPLAIN ANALYZE
SELECT * FROM customers
WHERE soundex_lastname = 'S530'
  AND dob_year = 1985;
```

#### MySQL

```sql
EXPLAIN
SELECT * FROM customers
WHERE soundex_lastname = 'S530'
  AND dob_year = 1985;
```

### Index Usage Analysis

#### PostgreSQL

```sql
-- Check if indexes are being used
SELECT schemaname, tablename, indexname, idx_scan, idx_tup_read
FROM pg_stat_user_indexes
WHERE tablename = 'customers'
ORDER BY idx_scan DESC;

-- Find unused indexes
SELECT schemaname, tablename, indexname
FROM pg_stat_user_indexes
WHERE idx_scan = 0
  AND indexname NOT LIKE 'pg_toast%';
```

## Caching Strategies

### Query Result Caching

Cache frequently accessed blocking queries:

```typescript
import { LRUCache } from 'lru-cache'

const cache = new LRUCache<string, any[]>({
  max: 1000,
  ttl: 1000 * 60 * 5  // 5 minutes
})

async function findByBlockingKeysCached(keys: Map<string, unknown>) {
  const cacheKey = JSON.stringify(Array.from(keys.entries()))

  let results = cache.get(cacheKey)
  if (!results) {
    results = await adapter.findByBlockingKeys(keys)
    cache.set(cacheKey, results)
  }

  return results
}
```

### Pre-warming Cache

```typescript
async function prewarmCache() {
  const commonLastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones']

  for (const lastName of commonLastNames) {
    await findByBlockingKeysCached(new Map([['lastName', lastName]]))
  }

  console.log('Cache pre-warmed')
}
```

## Database-Specific Optimizations

### PostgreSQL

```sql
-- Enable parallel query execution
SET max_parallel_workers_per_gather = 4;

-- Increase work memory for sorting
SET work_mem = '256MB';

-- Use pg_trgm for fuzzy matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_customers_lastname_trgm ON customers USING gin(last_name gin_trgm_ops);

-- Analyze query performance
SELECT * FROM pg_stat_statements
WHERE query LIKE '%customers%'
ORDER BY total_exec_time DESC
LIMIT 10;
```

### MySQL

```sql
-- Enable query cache (MySQL < 8.0)
SET GLOBAL query_cache_size = 268435456;  -- 256MB

-- Optimize InnoDB
SET GLOBAL innodb_buffer_pool_size = 2147483648;  -- 2GB

-- Check slow queries
SELECT * FROM mysql.slow_log
WHERE query_time > 1
ORDER BY query_time DESC;
```

### SQLite

```sql
-- Enable WAL mode for better concurrency
PRAGMA journal_mode = WAL;

-- Increase cache size
PRAGMA cache_size = -64000;  -- 64MB

-- Analyze database
ANALYZE;
```

## Troubleshooting Performance Issues

### Issue: Slow Blocking Queries

**Symptoms:** Queries taking seconds instead of milliseconds

**Solutions:**
1. Check if indexes exist on blocking fields
2. Run EXPLAIN to verify index usage
3. Ensure blocking keys are pre-computed
4. Check database statistics are up-to-date (ANALYZE)

### Issue: High Memory Usage

**Symptoms:** Memory usage growing unbounded

**Solutions:**
1. Reduce `batchSize` in deduplication
2. Ensure connections are properly closed
3. Use streaming for very large datasets
4. Monitor connection pool size

### Issue: Connection Pool Exhausted

**Symptoms:** "Too many connections" errors

**Solutions:**
1. Increase connection pool size
2. Ensure connections are released after use
3. Reduce concurrent operations
4. Use connection pooling service (PgBouncer)

### Issue: Deadlocks

**Symptoms:** Transaction failures with deadlock errors

**Solutions:**
1. Process records in consistent order
2. Keep transactions short
3. Use appropriate isolation levels
4. Retry with exponential backoff

## Performance Checklist

- [ ] Indexes created on all blocking fields
- [ ] Pre-computed blocking keys with indexes
- [ ] Composite indexes for multi-field blocking
- [ ] Connection pooling configured appropriately
- [ ] Batch size optimized for dataset
- [ ] Query logging enabled for slow queries
- [ ] Database statistics up-to-date (ANALYZE)
- [ ] Unused indexes removed
- [ ] Memory usage monitored
- [ ] Query execution plans reviewed (EXPLAIN)
- [ ] Blocking strategy tested and validated
- [ ] Performance benchmarks documented

## Benchmarking

### Create a Benchmark Script

```typescript
async function benchmark() {
  const sizes = [100, 1000, 10000, 100000]

  for (const size of sizes) {
    console.log(`\nBenchmarking ${size} records...`)

    const start = Date.now()
    const result = await resolver.deduplicateBatchFromDatabase({
      batchSize: 1000,
      maxRecords: size
    })
    const duration = Date.now() - start

    console.log(`Duration: ${duration}ms`)
    console.log(`Records/sec: ${Math.round(size / (duration / 1000))}`)
    console.log(`Duplicates found: ${result.duplicateGroupsFound}`)
  }
}
```

## Next Steps

- [Prisma Adapter Guide](./adapter-guides/prisma.md) - Prisma-specific optimizations
- [Drizzle Adapter Guide](./adapter-guides/drizzle.md) - Drizzle-specific optimizations
- [TypeORM Adapter Guide](./adapter-guides/typeorm.md) - TypeORM-specific optimizations
- [Migration Guide](./migration-guide.md) - Deduplicate existing databases efficiently
