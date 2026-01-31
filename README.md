# have-we-met

An identity resolution library for TypeScript/JavaScript.

## Status

Currently in development. Phase 4 (Blocking Strategies) is complete.

## Quick Start

```typescript
import { HaveWeMet } from 'have-we-met'

interface Person {
  firstName: string
  lastName: string
  dateOfBirth: string
  email: string
}

const resolver = HaveWeMet
  .schema<Person>({
    firstName: { type: 'string' },
    lastName: { type: 'string' },
    dateOfBirth: { type: 'date' },
    email: { type: 'string' }
  })
  // Blocking reduces O(n²) comparisons by 95-99%+
  .blocking(block => block
    .onField('lastName', { transform: 'soundex' })
  )
  .matching(match => match
    .compare('firstName', { algorithm: 'jaro-winkler', weight: 3 })
    .compare('lastName', { algorithm: 'jaro-winkler', weight: 5 })
    .compare('dateOfBirth', { algorithm: 'exact', weight: 4 })
  )
  .thresholds({ noMatch: 20, definiteMatch: 45 })
  .build()

// Find matches in your dataset
const matches = await resolver.findMatches(records)
```

## Documentation

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
