# API Reference

This section provides comprehensive reference documentation for all public APIs in the have-we-met library.

## Quick Links

| API | Description |
|-----|-------------|
| [Schema Builder](./schema-builder.md) | Define your record schema and field types |
| [Matching Builder](./matching-builder.md) | Configure field comparisons and weights |
| [Blocking Builder](./blocking-builder.md) | Set up blocking strategies for scale |
| [Resolver](./resolver.md) | Core matching and resolution operations |
| [Adapters](./adapters.md) | Database integration with Prisma, Drizzle, TypeORM |

## API Overview

### Entry Point

The library exposes a single entry point: `HaveWeMet`

```typescript
import { HaveWeMet } from 'have-we-met';

// Create a resolver using the fluent builder API
const resolver = HaveWeMet
  .create<MyRecord>()
  .schema(schema => schema
    .field('email').type('email')
    .field('firstName').type('name').component('first')
    // ...
  )
  .blocking(block => block
    .onField('email')
  )
  .matching(match => match
    .field('email').strategy('exact').weight(20)
    // ...
  )
  .thresholds({ noMatch: 20, definiteMatch: 45 })
  .build();
```

### Builder Pattern

All configuration uses a fluent builder pattern that provides:

- **Type safety**: Full TypeScript support with inference
- **Discoverability**: IDE autocomplete guides configuration
- **Validation**: Invalid configurations caught at build time
- **Composability**: Mix and match strategies as needed

### Core Concepts

**Schema Definition**
Define your record structure with semantic field types (name, email, phone, date, address) that enable automatic normalization and comparison strategies.

**Blocking Strategies**
Reduce comparison space from O(n²) by grouping records into blocks based on shared characteristics.

**Matching Configuration**
Configure how fields are compared and weighted to produce match scores.

**Thresholds**
Set score boundaries for three-tier classification:
- Below `noMatch`: Records are distinct
- Above `definiteMatch`: Records match with high confidence
- Between: Potential match requiring human review

### Module Structure

```
have-we-met/
├── HaveWeMet           # Main entry point
├── Resolver            # Core matching engine
├── SchemaBuilder       # Schema configuration
├── BlockingBuilder     # Blocking strategies
├── MatchingBuilder     # Field comparisons
├── MergeBuilder        # Golden record merging
├── ServiceBuilder      # External service integration
├── MLBuilder           # Machine learning configuration
└── Adapters
    ├── prismaAdapter   # Prisma ORM
    ├── drizzleAdapter  # Drizzle ORM
    └── typeormAdapter  # TypeORM
```

## Type Definitions

Core types are exported for use in your application:

```typescript
import type {
  // Configuration types
  SchemaDefinition,
  FieldDefinition,
  FieldType,
  MatchingConfig,
  BlockingConfig,
  ThresholdConfig,

  // Result types
  MatchResult,
  MatchOutcome,
  MatchExplanation,
  DeduplicationBatchResult,

  // Adapter types
  DatabaseAdapter,
  QueryOptions,

  // Queue types
  QueueItem,
  QueueItemStatus,

  // ML types
  MLModel,
  FeatureVector,
  MLMatchResult,
} from 'have-we-met';
```

## Related Documentation

- [Documentation Home](../README.md) - Main documentation index
- [Getting Started Guide](../examples.md) - Step-by-step introduction
- [Tuning Guide](../tuning-guide.md) - Optimize your configuration
- [Algorithm Comparison](../algorithms/comparison.md) - Choose the right algorithms
- [Use Case Guides](../use-cases/customer-deduplication.md) - Real-world examples
