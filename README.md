# have-we-met

> Identity resolution library for Node.js - Match, deduplicate, and merge records with confidence

[![npm version](https://img.shields.io/npm/v/have-we-met.svg)](https://www.npmjs.com/package/have-we-met)
[![Build Status](https://img.shields.io/github/actions/workflow/status/8arr3tt/have-we-met/ci.yml?branch=master)](https://github.com/8arr3tt/have-we-met/actions)
[![Coverage](https://img.shields.io/codecov/c/github/8arr3tt/have-we-met)](https://codecov.io/gh/8arr3tt/have-we-met)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org/)

**have-we-met** helps you identify, match, and merge duplicate records across datasets. Built for production use in healthcare, finance, CRM, and any domain where data quality matters.

## Features

- 🎯 **Three Matching Paradigms**: Deterministic rules, probabilistic scoring, and ML-based matching
- 🔀 **Multi-Source Consolidation**: Match and merge records from multiple databases with different schemas
- ⚡ **Blazing Fast**: Blocking strategies reduce O(n²) to linear time - process 100k records in seconds
- 🔧 **Flexible Configuration**: Fluent API with full TypeScript support and type inference
- 💾 **Database Native**: First-class adapters for Prisma, Drizzle, and TypeORM
- 👥 **Human-in-the-Loop**: Built-in review queue for ambiguous matches
- 🔄 **Golden Record Management**: Configurable merge strategies with full provenance tracking
- 🧠 **ML Integration**: Pre-trained models included, train custom models from your data
- 🔌 **Extensible**: Plugin architecture for external validation and data enrichment services
- 📊 **Production Ready**: Comprehensive error handling, metrics, and monitoring

## Quick Start

### Installation

```bash
npm install have-we-met
```

### Basic Usage

```typescript
import { HaveWeMet } from 'have-we-met'

interface Person {
  firstName: string
  lastName: string
  email: string
  dateOfBirth: string
}

// Configure the resolver
const resolver = HaveWeMet.create<Person>()
  .schema((schema) =>
    schema
      .field('firstName', { type: 'name', component: 'first' })
      .field('lastName', { type: 'name', component: 'last' })
      .field('email', { type: 'email' })
      .field('dateOfBirth', { type: 'date' })
  )
  // Blocking reduces comparisons by 95-99%
  .blocking((block) =>
    block.onField('lastName', { transform: 'soundex' })
  )
  // Weighted probabilistic matching
  .matching((match) =>
    match
      .field('email').strategy('exact').weight(20)
      .field('firstName').strategy('jaro-winkler').weight(10).threshold(0.85)
      .field('lastName').strategy('jaro-winkler').weight(10).threshold(0.85)
      .field('dateOfBirth').strategy('exact').weight(10)
      .thresholds({ noMatch: 20, definiteMatch: 45 })
  )
  .build()

// Find matches
const results = resolver.resolve(newRecord, existingRecords)

// Three possible outcomes:
// - definite-match: High confidence match (score >= 45)
// - potential-match: Needs human review (score 20-45)
// - no-match: New record (score < 20)

results.forEach(result => {
  console.log(result.outcome)         // 'definite-match' | 'potential-match' | 'no-match'
  console.log(result.score.totalScore) // Numeric score
  console.log(result.explanation)      // Field-by-field breakdown
})
```

**[See full quick start example →](examples/quick-start.ts)**

## Key Use Cases

### 1. Real-Time Duplicate Detection

Check for duplicates at the point of entry (e.g., new customer registration):

```typescript
import { prismaAdapter } from 'have-we-met/adapters/prisma'

const resolver = HaveWeMet.create<Customer>()
  .schema((schema) => /* ... */)
  .blocking((block) => /* ... */)
  .matching((match) => /* ... */)
  .adapter(prismaAdapter(prisma, { tableName: 'customers' }))
  .build()

// Check database for matches before inserting
const matches = await resolver.resolveWithDatabase(newCustomer)

if (matches[0]?.outcome === 'definite-match') {
  return { error: 'Customer already exists', id: matches[0].record.id }
}

// Safe to create new record
await prisma.customer.create({ data: newCustomer })
```

**[See database integration example →](examples/database-integration.ts)**

### 2. Batch Deduplication

Clean up legacy data or deduplicate imported datasets:

```typescript
// Find all duplicates in a dataset
const result = resolver.deduplicateBatch(records)

console.log(`Found ${result.stats.definiteMatchesFound} duplicates`)
console.log(`${result.stats.potentialMatchesFound} need human review`)

// Batch deduplicate from database
const dbResult = await resolver.deduplicateBatchFromDatabase({
  batchSize: 1000,
  persistResults: true
})
```

**[See batch deduplication example →](examples/batch-deduplication.ts)**

### 3. Human Review Workflow

Queue ambiguous matches for human review:

```typescript
// Auto-queue potential matches
const results = await resolver.resolve(newRecord, {
  autoQueue: true,
  queueContext: { source: 'import', userId: 'admin' }
})

// Review queue items
const pending = await resolver.queue.list({ status: 'pending', limit: 10 })

// Make decisions
await resolver.queue.confirm(itemId, {
  selectedMatchId: matchId,
  notes: 'Verified by phone number',
  decidedBy: 'reviewer@example.com'
})

// Monitor queue health
const stats = await resolver.queue.stats()
console.log(`Pending: ${stats.byStatus.pending}`)
```

**[See review queue example →](examples/review-queue.ts)**

### 4. ML-Enhanced Matching

Combine rule-based and ML matching for best accuracy:

```typescript
const resolver = HaveWeMet.create<Person>()
  .schema((schema) => /* ... */)
  .blocking((block) => /* ... */)
  .matching((match) => /* ... */)
  .ml((ml) =>
    ml
      .usePretrained()         // Use built-in model
      .mode('hybrid')          // Combine ML + probabilistic
      .mlWeight(0.4)           // 40% ML, 60% probabilistic
  )
  .build()

// Results include ML predictions
results.forEach(result => {
  console.log(result.mlPrediction?.probability)  // 0.92 (92% match)
  console.log(result.mlPrediction?.confidence)   // 'high'
})
```

**[See ML matching example →](examples/ml-matching.ts)**

### 5. Multi-Source Consolidation

Match and merge records from multiple databases with different schemas:

```typescript
// Consolidate customers from 3 product databases
const result = await HaveWeMet.consolidation<UnifiedCustomer>()
  .source('crm', source => source
    .adapter(crmAdapter)
    .mapping(map => map
      .field('email').from('email_address')
      .field('firstName').from('first_name')
      .field('lastName').from('last_name')
    )
    .priority(2) // CRM is most trusted
  )
  .source('billing', source => source
    .adapter(billingAdapter)
    .mapping(map => map
      .field('email').from('contact_email')
      .field('firstName').from('fname')
      .field('lastName').from('lname')
    )
    .priority(1)
  )
  .source('support', source => source
    .adapter(supportAdapter)
    .mapping(map => map
      .field('email').from('email')
      .field('firstName').from('first')
      .field('lastName').from('last')
    )
    .priority(1)
  )
  .matchingScope('within-source-first')
  .conflictResolution(cr => cr
    .useSourcePriority(true)
    .defaultStrategy('preferNonNull')
    .fieldStrategy('email', 'preferNewer')
  )
  .outputAdapter(unifiedAdapter)
  .build()
  .consolidate()

console.log(`Created ${result.stats.goldenRecords} unified records`)
console.log(`Found ${result.stats.crossSourceMatches} cross-source matches`)
```

**[See consolidation examples →](examples/consolidation/)**

## Why have-we-met?

### The Problem

Every organization accumulates duplicate records over time:
- Multiple customer accounts for the same person
- Patient records split across systems
- Vendor duplicates with slight variations in names
- Legacy data imports with inconsistent formats

Manual deduplication doesn't scale. Simple exact-match queries miss fuzzy duplicates. You need intelligent matching that handles:
- Typos and spelling variations
- Different email addresses
- Formatting differences
- Incomplete data
- Ambiguous cases requiring human judgment

### The Solution

**have-we-met** provides production-grade identity resolution:

✅ **Handles Fuzzy Matches**: Uses advanced string similarity algorithms (Jaro-Winkler, Levenshtein, phonetic encoding)

✅ **Scales to Millions**: Blocking strategies reduce O(n²) complexity to near-linear performance

✅ **Works with Your Database**: Native adapters query your database efficiently without loading everything into memory

✅ **Learns from Feedback**: ML models improve over time by learning from human review decisions

✅ **Production Ready**: Built for real-world use with error handling, monitoring, and comprehensive testing

## Matching Paradigms

### Deterministic Matching

Rules-based matching where specific field combinations definitively identify a match:

```typescript
// If SSN matches exactly, it's the same person
if (record1.ssn === record2.ssn) {
  return 'definite-match'
}
```

**Best for**: Unique identifiers, high-confidence business rules

### Probabilistic Matching

Weighted scoring across multiple fields based on Fellegi-Sunter theory:

```typescript
// Each field contributes to total score
email match:       +20 points
phone match:       +15 points
name fuzzy match:  +10 points
address mismatch:  -5 points
-------------------------
Total:             40 points (potential match)
```

**Best for**: General identity resolution, tunable for your data

### ML-Based Matching

Machine learning models that learn patterns from data:

```typescript
// ML model considers complex patterns
ML prediction: 87% match probability
Features: email domain similarity, name nickname patterns,
          address component overlap, temporal patterns
```

**Best for**: Complex patterns, learning from historical decisions

## Blocking Strategies

Blocking is essential for scaling to large datasets. Instead of comparing every record to every other record (O(n²)), blocking groups similar records together:

```typescript
// Without blocking: 100k records = 5 billion comparisons
// With blocking: 100k records = 50 million comparisons (99% reduction!)

.blocking((block) =>
  block
    .onField('lastName', { transform: 'soundex' })  // Group by phonetic codes
    .onField('dateOfBirth', { transform: 'year' })  // Group by birth year
)
```

**Result**: Process 100k records in seconds instead of hours.

**[Learn more about blocking →](docs/blocking/overview.md)**

## Database Adapters

Work directly with your existing database:

### Prisma

```typescript
import { PrismaClient } from '@prisma/client'
import { prismaAdapter } from 'have-we-met/adapters/prisma'

const prisma = new PrismaClient()
const resolver = HaveWeMet.create<Customer>()
  .adapter(prismaAdapter(prisma, { tableName: 'customers' }))
  .build()
```

### Drizzle

```typescript
import { drizzle } from 'drizzle-orm/node-postgres'
import { drizzleAdapter } from 'have-we-met/adapters/drizzle'

const db = drizzle(pool)
const resolver = HaveWeMet.create<Customer>()
  .adapter(drizzleAdapter(db, { table: customersTable }))
  .build()
```

### TypeORM

```typescript
import { DataSource } from 'typeorm'
import { typeormAdapter } from 'have-we-met/adapters/typeorm'

const dataSource = new DataSource({...})
const resolver = HaveWeMet.create<Customer>()
  .adapter(typeormAdapter(dataSource, { entity: Customer }))
  .build()
```

**[Database adapter documentation →](docs/database-adapters.md)**

## Documentation

### Getting Started
- [Quick Start Guide](examples/quick-start.ts)
- [Installation & Setup](docs/installation.md)
- [Core Concepts](docs/concepts.md)

### Matching
- [Probabilistic Matching](docs/probabilistic-matching.md)
- [Tuning Guide](docs/tuning-guide.md) - Configure weights and thresholds
- [String Similarity Algorithms](docs/algorithms/string-similarity.md)
- [Examples and Recipes](docs/examples.md)

### Blocking
- [Blocking Overview](docs/blocking/overview.md)
- [Blocking Strategies](docs/blocking/strategies.md)
- [Selection Guide](docs/blocking/selection-guide.md)
- [Tuning Guide](docs/blocking/tuning.md)

### Data Preparation
- [Normalizers Overview](docs/normalizers/overview.md)
- [Name Normalizer](docs/normalizers/name.md)
- [Email Normalizer](docs/normalizers/email.md)
- [Phone Normalizer](docs/normalizers/phone.md)
- [Address Normalizer](docs/normalizers/address.md)
- [Date Normalizer](docs/normalizers/date.md)
- [Custom Normalizers](docs/normalizers/custom.md)

### Database Integration
- [Database Adapters](docs/database-adapters.md)
- [Prisma Adapter](docs/adapter-guides/prisma.md)
- [Drizzle Adapter](docs/adapter-guides/drizzle.md)
- [TypeORM Adapter](docs/adapter-guides/typeorm.md)
- [Performance Optimization](docs/database-performance.md)
- [Migration Guide](docs/migration-guide.md)

### Human Review
- [Review Queue Overview](docs/review-queue.md)
- [Queue Workflows](docs/queue-workflows.md)
- [Queue Metrics](docs/queue-metrics.md)
- [Queue UI Guide](docs/queue-ui-guide.md)

### Golden Record
- [Golden Record Overview](docs/golden-record.md)
- [Merge Strategies](docs/merge-strategies.md)
- [Provenance Tracking](docs/provenance.md)
- [Unmerge Operations](docs/unmerge.md)

### ML Matching
- [ML Matching Overview](docs/ml-matching/overview.md)
- [Getting Started](docs/ml-matching/getting-started.md)
- [Feature Extraction](docs/ml-matching/feature-extraction.md)
- [Custom Models](docs/ml-matching/custom-models.md)
- [Training Guide](docs/ml-matching/training.md)
- [Feedback Loop](docs/ml-matching/feedback-loop.md)

### External Services
- [External Services Overview](docs/external-services.md)
- [Service Plugins Guide](docs/service-plugins.md)
- [Built-in Services](docs/built-in-services.md)
- [Service Resilience](docs/service-resilience.md)

### API Reference
- [API Documentation](docs/README.md)
- [Schema Builder](docs/api-reference/schema-builder.md)
- [Matching Builder](docs/api-reference/matching-builder.md)
- [Blocking Builder](docs/api-reference/blocking-builder.md)
- [Resolver](docs/api-reference/resolver.md)

## Performance

**have-we-met** is designed for production scale:

| Dataset Size | Batch Deduplication Time | Memory Usage | Comparison Reduction |
|-------------|--------------------------|--------------|---------------------|
| 10k records | ~1 second | < 100MB | 97% |
| 100k records | ~15 seconds | < 500MB | 98% |
| 1M records | ~3 minutes | < 2GB | 99%+ |

- **Real-time matching**: < 100ms per query
- **ML predictions**: < 10ms per comparison
- **Blocking efficiency**: 95-99%+ comparison reduction

**[See benchmark results →](docs/benchmarks/BENCHMARK-RESULTS.md)**

## Requirements

- **Node.js**: 18+ (ESM and CommonJS supported)
- **TypeScript**: 5.0+ (optional, but recommended)
- **Database**: Optional, but recommended for production use
  - Prisma 5+
  - Drizzle ORM 0.28+
  - TypeORM 0.3+

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT © Matt Barrett

## Support

- 📖 [Documentation](docs/README.md)
- 💬 [GitHub Discussions](https://github.com/8arr3tt/have-we-met/discussions)
- 🐛 [Issue Tracker](https://github.com/8arr3tt/have-we-met/issues)

## Roadmap

See [PLAN.md](PLAN.md) for the full development roadmap.

**Current Version**: 0.1.0 (Initial Release)

**Completed Features**:
- ✅ Core matching engine (deterministic, probabilistic, ML)
- ✅ String similarity algorithms (Levenshtein, Jaro-Winkler, Soundex, Metaphone)
- ✅ Data normalizers (name, email, phone, address, date)
- ✅ Blocking strategies (standard, sorted neighbourhood)
- ✅ Database adapters (Prisma, Drizzle, TypeORM)
- ✅ Review queue with human-in-the-loop workflow
- ✅ Golden record management with provenance
- ✅ External service integration
- ✅ ML matching with pre-trained models
- ✅ Comprehensive documentation and examples

**Future Plans**:
- Multi-language name handling
- Additional phonetic algorithms for non-English names
- UI components for review queue
- CLI tool for batch operations
- Performance visualization

## Acknowledgments

Built with inspiration from:
- Fellegi-Sunter record linkage theory
- Duke (Java deduplication engine)
- Python Record Linkage Toolkit
- Dedupe.io

---

**Made with ❤️ for data quality**
