# have-we-met

An identity resolution library for TypeScript/JavaScript.

## Status

Currently in development. Phase 5 (Probabilistic Matching) is complete.

## Quick Start

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

## Documentation

### Probabilistic Matching
- [Probabilistic Matching](docs/probabilistic-matching.md) - How weighted scoring works
- [Tuning Guide](docs/tuning-guide.md) - Configure weights and thresholds for your use case
- [Examples](docs/examples.md) - Real-world configurations for common scenarios

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
