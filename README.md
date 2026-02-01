# have-we-met

An identity resolution library for TypeScript/JavaScript.

## Status

Currently in development. Phase 8 (Golden Record) is complete.

## Quick Start

### In-Memory Matching

```typescript
import { HaveWeMet } from 'have-we-met'

interface Person {
  firstName: string
  lastName: string
  dateOfBirth: string
  email: string
}

const resolver = HaveWeMet.create<Person>()
  .schema(schema => {
    schema
      .field('firstName', { type: 'name', component: 'first' })
      .field('lastName', { type: 'name', component: 'last' })
      .field('dateOfBirth', { type: 'date' })
      .field('email', { type: 'email' })
  })
  // Blocking reduces O(n²) comparisons by 95-99%+
  .blocking(block => block
    .onField('lastName', { transform: 'soundex' })
  )
  // Weighted scoring with configurable thresholds
  .matching(match => {
    match
      .field('email').strategy('exact').weight(20)
      .field('firstName').strategy('jaro-winkler').weight(10).threshold(0.85)
      .field('lastName').strategy('jaro-winkler').weight(10).threshold(0.85)
      .field('dateOfBirth').strategy('exact').weight(10)
      .thresholds({ noMatch: 20, definiteMatch: 45 })
  })
  .build()

// Find matches for a single record
const newRecord = { firstName: 'John', lastName: 'Smith', email: 'john@example.com', dateOfBirth: '1985-03-15' }
const results = resolver.resolve(newRecord, existingRecords)

// Results include detailed explanations
results.forEach(result => {
  console.log(result.outcome)         // 'definite-match', 'potential-match', or 'no-match'
  console.log(result.score.totalScore)  // 38
  console.log(result.explanation)     // Field-by-field breakdown
})

// Batch deduplication for finding all duplicates
const batchResult = resolver.deduplicateBatch(records)
console.log(batchResult.stats.definiteMatchesFound)  // Number of duplicates found
```

### Database Integration

```typescript
import { HaveWeMet } from 'have-we-met'
import { prismaAdapter } from 'have-we-met/adapters/prisma'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const resolver = HaveWeMet.create<Person>()
  .schema(schema => { /* ... */ })
  .blocking(block => { /* ... */ })
  .matching(match => { /* ... */ })
  .adapter(prismaAdapter(prisma, { tableName: 'customers' }))
  .build()

// Resolve against database (uses blocking for efficient queries)
const matches = await resolver.resolveWithDatabase(newRecord)

// Batch deduplicate entire database
const result = await resolver.deduplicateBatchFromDatabase({
  batchSize: 1000,
  persistResults: true
})
```

### Review Queue (Human-in-the-Loop)

```typescript
import { HaveWeMet } from 'have-we-met'
import { prismaAdapter } from 'have-we-met/adapters/prisma'

const resolver = HaveWeMet.create<Person>()
  .schema(schema => { /* ... */ })
  .blocking(block => { /* ... */ })
  .matching(match => { /* ... */ })
  .adapter(prismaAdapter(prisma, { tableName: 'customers' }))
  .build()

// Automatically queue ambiguous matches for human review
const results = await resolver.resolve(newRecord, {
  autoQueue: true,
  queueContext: { source: 'customer-import', userId: 'admin' }
})

// Review queued items
const pending = await resolver.queue.list({
  status: 'pending',
  limit: 10,
  orderBy: 'priority',
  orderDirection: 'desc'
})

// Make decisions
await resolver.queue.confirm(itemId, {
  selectedMatchId: matchId,
  notes: 'Verified by phone number',
  decidedBy: 'reviewer@example.com'
})

// Track queue health
const stats = await resolver.queue.stats()
console.log(`Pending: ${stats.byStatus.pending}`)
console.log(`Throughput: ${stats.throughput?.last24h} decisions/day`)
```

### Golden Record (Merge)

```typescript
const resolver = HaveWeMet.create<Person>()
  .schema(schema => { /* ... */ })
  .blocking(block => { /* ... */ })
  .matching(match => { /* ... */ })
  .merge(merge => merge
    .timestampField('updatedAt')
    .defaultStrategy('preferNonNull')
    .field('firstName').strategy('preferLonger')
    .field('lastName').strategy('preferLonger')
    .field('email').strategy('preferNewer')
    .field('phone').strategy('preferNonNull')
    .field('addresses').strategy('union')
  )
  .adapter(prismaAdapter(prisma, { tableName: 'customers' }))
  .build()

// Merge from review queue decision
await resolver.queue.merge(itemId, {
  selectedMatchId: matchId,
  notes: 'Same customer, merging records',
  decidedBy: 'reviewer@example.com'
})

// Direct merge operation
const result = await mergeExecutor.merge({
  sourceRecords,
  mergedBy: 'admin',
})

// Access the golden record and provenance
console.log(result.goldenRecord)
console.log(result.provenance.fieldSources)  // Which source contributed each field
```

## Documentation

### Database Adapters
- [Database Adapters](docs/database-adapters.md) - Overview of database integration
- [Prisma Adapter](docs/adapter-guides/prisma.md) - Prisma ORM integration guide
- [Drizzle Adapter](docs/adapter-guides/drizzle.md) - Drizzle ORM integration guide
- [TypeORM Adapter](docs/adapter-guides/typeorm.md) - TypeORM integration guide
- [Performance Optimization](docs/database-performance.md) - Index strategies and query optimization
- [Migration Guide](docs/migration-guide.md) - Deduplicate existing databases

### Probabilistic Matching
- [Probabilistic Matching](docs/probabilistic-matching.md) - How weighted scoring works
- [Tuning Guide](docs/tuning-guide.md) - Configure weights and thresholds for your use case
- [Examples](docs/examples.md) - Real-world configurations for common scenarios

### Review Queue
- [Review Queue Overview](docs/review-queue.md) - Human-in-the-loop review workflows
- [Queue Workflows](docs/queue-workflows.md) - Common patterns and best practices
- [Queue Metrics](docs/queue-metrics.md) - Monitoring and analytics
- [Queue UI Guide](docs/queue-ui-guide.md) - Building review interfaces

### Golden Record (Merge)
- [Golden Record Overview](docs/golden-record.md) - Merge configuration and workflows
- [Merge Strategies](docs/merge-strategies.md) - Complete guide to merge strategies
- [Provenance](docs/provenance.md) - Audit trail and field attribution
- [Unmerge](docs/unmerge.md) - Reversing incorrect merges

### Blocking Strategies
- [Blocking Overview](docs/blocking/overview.md) - Why blocking is essential for large datasets
- [Blocking Strategies](docs/blocking/strategies.md) - Standard, sorted neighbourhood, and composite blocking
- [Selection Guide](docs/blocking/selection-guide.md) - Choose the right strategy for your data
- [Transforms Reference](docs/blocking/transforms.md) - Complete guide to block transforms
- [Tuning Guide](docs/blocking/tuning.md) - Optimize performance and recall

### Algorithms
- [String Similarity Algorithms](docs/algorithms/string-similarity.md) - Comprehensive guide to fuzzy matching algorithms

### Normalizers
- [Normalizers Overview](docs/normalizers/overview.md) - Introduction to data normalization
- [Name Normalizer](docs/normalizers/name.md) - Parse and standardize personal names
- [Email Normalizer](docs/normalizers/email.md) - Normalize email addresses
- [Phone Normalizer](docs/normalizers/phone.md) - Normalize phone numbers to E.164 format
- [Address Normalizer](docs/normalizers/address.md) - Parse and standardize physical addresses
- [Date Normalizer](docs/normalizers/date.md) - Parse and normalize dates to ISO 8601
- [Custom Normalizers](docs/normalizers/custom.md) - Create your own normalizers

## License

MIT
