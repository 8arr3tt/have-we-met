# have-we-met v0.1.0 Release Notes

**Release Date:** February 2, 2026

We're excited to announce the first public release of **have-we-met**, an open-source identity resolution library for Node.js that helps organizations match, deduplicate, and merge records across datasets.

---

## Overview

**have-we-met** provides a flexible, production-ready solution for identity resolution challenges. Whether you're deduplicating customer records, matching patient data across healthcare systems, or consolidating entities from multiple databases, this library offers the tools you need.

### Key Features

✅ **Three Matching Paradigms**: Deterministic rules, probabilistic scoring (Fellegi-Sunter), and ML-based matching
✅ **Schema-Agnostic**: Works with any data structure
✅ **Blocking Strategies**: Efficiently handle large datasets (100k+ records)
✅ **Human Review Queue**: Built-in workflow for uncertain matches
✅ **Golden Record Management**: 14 merge strategies with provenance tracking
✅ **Multi-Source Consolidation**: Match and merge across multiple database tables
✅ **Database Adapters**: Prisma, Drizzle, TypeORM support
✅ **External Services**: Validation and lookup plugins with resilience patterns
✅ **Machine Learning**: Pre-trained models and feedback loop for continuous improvement
✅ **Production-Ready**: <100ms real-time matching, <60s batch processing of 100k records

---

## What's New in v0.1.0

### 1. Core Matching Engine

The foundation of identity resolution with three complementary approaches:

**Deterministic Matching**
Define exact field combinations that definitively identify matches:

```typescript
const resolver = HaveWeMet.schema({
  ssn: { type: 'string' },
  dob: { type: 'date' },
})
  .matching((match) =>
    match
      .field('ssn')
      .strategy('exact')
      .weight(25)
      .field('dob')
      .strategy('exact')
      .weight(25)
  )
  .thresholds({ noMatch: 10, definiteMatch: 45 })
  .build()
```

**Probabilistic Matching**
Weighted scoring across fields with fuzzy matching algorithms (Levenshtein, Jaro-Winkler, Soundex, Metaphone):

```typescript
.matching(match => match
  .field('email').strategy('exact').weight(20)
  .field('firstName').strategy('jaro-winkler').weight(10).threshold(0.85)
  .field('lastName').strategy('jaro-winkler').weight(10).threshold(0.85)
)
```

**ML-Based Matching**
Pre-trained models learn complex patterns. Ships with a person/customer matching model achieving >85% accuracy:

```typescript
.ml(ml => ml
  .mode('hybrid')
  .threshold(0.75)
  .feature('firstName', f => f.similarity('jaro-winkler'))
  .feature('lastName', f => f.similarity('jaro-winkler'))
  .feature('email', f => f.exactMatch())
)
```

### 2. Blocking Strategies

Avoid O(n²) comparisons by grouping records intelligently:

- **Standard Blocking**: Group by exact field values (postcode, year of birth, phonetic codes)
- **Sorted Neighbourhood**: Sort records and compare within sliding windows
- **Composite Blocking**: Combine strategies with union/intersection modes

**Performance**: Reduces comparisons by 96-99%+, block generation in <100ms for 100k records.

### 3. Data Normalizers

Clean and standardize data before matching:

- **Name**: Parse components (first, middle, last, suffix), handle titles, normalize casing
- **Email**: Lowercase, handle plus-addressing, extract domain
- **Phone**: Parse to international format via libphonenumber-js
- **Address**: Parse components (street, city, state, postal code) - US/Canada support
- **Date**: Multi-format parsing, handle partial dates
- **Custom**: Register domain-specific normalizers

### 4. Database Integration

Work seamlessly with your existing database:

**Adapters for Major ORMs**:

- Prisma
- Drizzle
- TypeORM

**Capabilities**:

- Query optimization with blocking strategies
- Transaction support for atomic merges
- Index recommendations via IndexAnalyzer
- Performance profiling via QueryProfiler

```typescript
const resolver = HaveWeMet.schema({
  /* ... */
})
  .matching(/* ... */)
  .adapter(prismaAdapter(prisma))
  .build()

const result = await resolver.resolveWithDatabase({ email: 'john@example.com' })
```

### 5. Human Review Queue

Not all matches are certain. The review queue provides workflow for human judgment:

**Queue Operations**:

- Add matches requiring review (single or batch)
- List pending items with filtering and sorting
- Confirm, reject, or merge matches
- Track metrics: throughput, wait times, reviewer stats

**Auto-Queueing**:

```typescript
const resolver = HaveWeMet.schema({
  /* ... */
})
  .matching({
    /* ... */
  })
  .queue({ autoQueue: true })
  .build()

// Potential matches automatically added to queue
const result = await resolver.resolve(newRecord)
```

### 6. Golden Record Management

Merge duplicate records with confidence:

**14 Built-in Strategies**:

- `preferFirst`, `preferLast`: Position-based
- `preferNewer`, `preferOlder`: Timestamp-based
- `preferNonNull`, `preferLonger`, `preferShorter`: Value-based
- `concatenate`, `union`: Combining values
- `mostFrequent`: Statistical
- `average`, `sum`, `min`, `max`: Numeric

**Provenance Tracking**: Every field in a golden record tracks which source records contributed.

**Unmerge Support**: Restore original records if a match was incorrect.

```typescript
const resolver = HaveWeMet.schema({
  /* ... */
})
  .matching({
    /* ... */
  })
  .merge((merge) =>
    merge
      .field('email')
      .strategy('preferNewer')
      .field('phone')
      .strategy('preferNonNull')
      .field('address')
      .strategy('preferLonger')
  )
  .build()
```

### 7. Multi-Source Consolidation

**NEW in v0.1.0**: Match and merge records from multiple database tables with different schemas.

**Use Cases**:

- Consolidate customer data across product databases
- Match patient records across hospital systems
- Build unified entity view from disparate sources

**Schema Mapping**:
Transform records from source schemas to unified output:

```typescript
const consolidation = Consolidation.output<UnifiedCustomer>()
  .source('crm', (crm) =>
    crm
      .adapter(prismaAdapter(prisma.crmCustomer))
      .map((map) =>
        map
          .field('customerId', 'id')
          .field('fullName', 'name')
          .field('emailAddress', 'email')
      )
  )
  .source('billing', (billing) =>
    billing
      .adapter(prismaAdapter(prisma.billingAccount))
      .map((map) =>
        map
          .field('accountId', 'id')
          .field('accountName', 'name')
          .field('contactEmail', 'email')
      )
  )
  .build()
```

**Two Matching Scopes**:

- **Within-Source-First**: Deduplicate each source, then match across (faster, better provenance)
- **Unified Pool**: Match all records together (simpler, fewer false negatives)

**Source Priority**:
Configure which source is authoritative for conflict resolution:

```typescript
.conflictResolution(conflict => conflict
  .sourcePriority(['crm', 'billing', 'legacy'])
  .field('email').useSourcePriority()
  .field('phone').strategy('preferNewer')
)
```

**Performance**: 30k records across 3 sources consolidate in <30s (within-source-first).

### 8. External Services

Integrate validation and lookup services:

**Built-in Validators**:

- NHS number (UK)
- Email format
- Phone format
- SSN (US)
- NINO (UK)

**Built-in Lookup Services**:

- Address enrichment
- Email enrichment
- Phone carrier lookup

**Resilience Patterns**:

- Configurable timeouts
- Retry with exponential backoff
- Circuit breaker prevents cascading failures
- LRU caching reduces redundant calls

```typescript
const resolver = HaveWeMet.schema({
  /* ... */
})
  .matching({
    /* ... */
  })
  .services((service) =>
    service.validation('nhs', (v) =>
      v.field('nhsNumber').validator(nhsNumberValidator()).timeout(2000)
    )
  )
  .build()
```

### 9. Machine Learning

Zero external ML dependencies - pure TypeScript implementation:

**SimpleClassifier Model**:

- Logistic regression with L2 regularization
- Pre-trained on person/customer data (>85% accuracy)
- Predictions in <10ms

**Feature Extractors** (8 built-in):

- `exactMatch`, `similarity`, `lengthDifference`
- `missingField`, `fieldPresence`, `normalizedLength`
- `numericDifference`, `dateProximity`

**Feedback Loop**:

```typescript
const collector = new FeedbackCollector(resolver)

// Collect decisions from review queue
const decisions = await queue.list({ status: 'confirmed' })
collector.addQueueDecisions(decisions)

// Export for training
const dataset = collector.exportTrainingDataset()
const trainer = new ModelTrainer()
const newModel = await trainer.train(dataset)
```

**Integration Modes**:

- `hybrid`: Use ML alongside probabilistic matching
- `mlOnly`: Use ML exclusively for match decisions
- `fallback`: Try probabilistic, fall back to ML if uncertain

### 10. Benchmarks & Documentation

**Standard Datasets**:

- Febrl (synthetic identity data)
- Fodors-Zagat (restaurant matching)
- Scalability tests (10k, 100k, 1M records)

**Comprehensive Documentation**:

- API Reference (complete method signatures and examples)
- Use Case Guides (customer deduplication, patient matching, real-time lookup, batch migration)
- Tuning Guides (threshold optimization, blocking optimization, performance)
- Algorithm Selection Guide (decision tree for choosing algorithms)
- Multi-Source Consolidation Guides (7 guides, 7000+ lines)

---

## Performance Highlights

| Metric                    | Target | Achieved         |
| ------------------------- | ------ | ---------------- |
| Real-time matching        | <100ms | ✅ <50ms typical |
| Batch processing (100k)   | <60s   | ✅ ~40s          |
| Memory usage (100k batch) | <1GB   | ✅ ~600MB        |
| ML predictions            | <10ms  | ✅ ~5ms          |
| Blocking (100k)           | <100ms | ✅ ~50ms         |
| Multi-source (30k × 3)    | <30s   | ✅ ~25s          |

---

## Getting Started

### Installation

```bash
npm install have-we-met
```

### Quick Start

```typescript
import { HaveWeMet } from 'have-we-met'

const resolver = HaveWeMet.schema({
  firstName: { type: 'name', component: 'first' },
  lastName: { type: 'name', component: 'last' },
  email: { type: 'email' },
  phone: { type: 'phone' },
})
  .blocking((block) => block.onField('lastName', { transform: 'soundex' }))
  .matching((match) =>
    match
      .field('email')
      .strategy('exact')
      .weight(20)
      .field('phone')
      .strategy('exact')
      .weight(15)
      .field('firstName')
      .strategy('jaro-winkler')
      .weight(10)
      .threshold(0.85)
      .field('lastName')
      .strategy('jaro-winkler')
      .weight(10)
      .threshold(0.85)
  )
  .thresholds({ noMatch: 20, definiteMatch: 45 })
  .build()

// Check for matches
const result = await resolver.resolve({
  firstName: 'John',
  lastName: 'Smith',
  email: 'john.smith@example.com',
  phone: '+1-555-123-4567',
})

// result.outcome: 'new' | 'match' | 'review'
// result.matches: Array<{ record, score, explanation }>
```

### Examples

See the `examples/` directory for practical, runnable examples:

- `quick-start.ts`: Basic matching
- `batch-deduplication.ts`: Batch processing
- `database-integration.ts`: Prisma adapter
- `ml-matching.ts`: ML integration
- `review-queue.ts`: Queue workflow
- `consolidation/`: Multi-source consolidation (4 examples)

---

## Known Limitations

These limitations are acknowledged and planned for future releases:

1. **Address Parsing**: Currently supports US/Canada only. International support (UK, EU, APAC) planned for v0.2.0.
2. **Name Handling**: Optimized for English names. Multi-language support (Chinese, Arabic, Indian names) planned.
3. **Phonetic Algorithms**: Soundex and Metaphone are English-only. Additional algorithms planned.
4. **ML Models**: SimpleClassifier included. Advanced models (neural networks, ensemble methods) planned for v1.1.0.

---

## Breaking Changes

This is the initial release, so no breaking changes from previous versions.

Future releases will follow semantic versioning:

- **Patch (0.1.x)**: Bug fixes, documentation updates
- **Minor (0.x.0)**: New features, backward compatible
- **Major (x.0.0)**: Breaking API changes

---

## Upgrade Guide

Not applicable for initial release.

---

## Requirements

- **Node.js**: 18.0.0 or higher (18, 20, 22 tested)
- **TypeScript**: 5.0+ recommended (not required)
- **Database**: Optional (Prisma, Drizzle, or TypeORM if using adapters)

---

## Dependencies

**Runtime**:

- `libphonenumber-js` (phone number parsing)

**Peer Dependencies** (optional):

- `@prisma/client` (if using Prisma adapter)
- `drizzle-orm` (if using Drizzle adapter)
- `typeorm` (if using TypeORM adapter)

---

## Testing

- **4327 tests** passing
- **96%+ code coverage** across all modules
- **Comprehensive edge case testing**: null handling, empty inputs, extreme values
- **Performance regression tests**: Automated benchmarks
- **Multi-platform CI**: Windows, macOS, Linux
- **Multi-version CI**: Node.js 18, 20, 22

---

## Documentation

Full documentation available at:

- GitHub: https://github.com/8arr3tt/have-we-met
- API Reference: `docs/api-reference/`
- Guides: `docs/guides/`
- Consolidation: `docs/consolidation/`
- Benchmarks: `docs/benchmarks/`

---

## Community

- **Issues**: https://github.com/8arr3tt/have-we-met/issues
- **Discussions**: https://github.com/8arr3tt/have-we-met/discussions
- **License**: MIT

---

## Acknowledgments

Built with:

- TypeScript
- Vitest (testing)
- tsup (bundling)
- ESLint & Prettier (code quality)
- libphonenumber-js (phone parsing)

Inspired by identity resolution research:

- Fellegi-Sunter probabilistic record linkage theory
- FEBRL (Freely Extensible Biomedical Record Linkage) dataset
- dedupe.io and similar open-source projects

---

## What's Next

Planned for future releases:

- **v0.2.0**: International address parsing, additional phonetic algorithms
- **v0.3.0**: Advanced ML models, ensemble methods
- **v1.0.0**: API stabilization, production hardening
- **v1.1.0**: UI components, visualization tools, CLI

We welcome community feedback, feature requests, and contributions!

---

## Credits

**Author**: Matt Barrett
**Repository**: https://github.com/8arr3tt/have-we-met
**License**: MIT

---

_Thank you for using have-we-met! We're excited to see what you build._
