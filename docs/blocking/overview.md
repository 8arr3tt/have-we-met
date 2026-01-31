# Blocking Strategies - Overview

## What is Blocking?

Blocking is an optimization technique that dramatically reduces the computational complexity of matching records in large datasets. It works by grouping similar records into "blocks" and only comparing records within the same block, rather than comparing every record to every other record.

## The O(n²) Problem

Without blocking, matching n records requires O(n²) comparisons. This becomes impractical very quickly:

| Records | Comparisons (n×(n-1)/2) | Time at 1ms/comparison |
|---------|-------------------------|------------------------|
| 100     | 4,950                   | ~5 seconds             |
| 1,000   | 499,500                 | ~8 minutes             |
| 10,000  | 49,995,000              | ~14 hours              |
| 100,000 | 4,999,950,000           | **~58 days**           |

At 100,000 records, exhaustive comparison is essentially impossible. This is where blocking becomes critical.

## How Blocking Works

Blocking reduces the comparison space by:

1. **Grouping similar records** - Records that share a blocking key are placed in the same block
2. **Limiting comparisons** - Only records within the same block are compared
3. **Dramatically reducing work** - Achieves 95-99%+ reduction in comparisons

### Example: Blocking by Last Name

Instead of comparing every person in a database to every other person:

**Without blocking:**
```
Compare: John Smith vs Mary Johnson
Compare: John Smith vs Jane Smith
Compare: John Smith vs Robert Brown
...
Total: 5 billion comparisons for 100k records
```

**With blocking (first letter of last name):**
```
Block "S":
  - John Smith
  - Jane Smith

Block "J":
  - Mary Johnson

Block "B":
  - Robert Brown

Only compare within blocks:
  Compare: John Smith vs Jane Smith

Total: ~190 million comparisons (96% reduction)
```

## When to Use Blocking

### Dataset Size Thresholds

| Records | Recommendation |
|---------|----------------|
| < 1,000 | Blocking optional, may add unnecessary complexity |
| 1,000 - 10,000 | Blocking recommended for improved performance |
| 10,000+ | **Blocking essential** - required for practical performance |
| 100,000+ | **Blocking critical** - must use effective strategy |

### Performance Impact

Based on our benchmarks with 100,000 records:

| Approach | Comparisons | Generation Time | Total Time |
|----------|-------------|-----------------|------------|
| No blocking | 5 billion | 0ms | Days to weeks |
| Standard (firstLetter) | ~190 million | 17ms | Hours |
| Standard (soundex) | ~50 million | 38ms | Minutes |
| Sorted neighbourhood | ~1 million | 53ms | Seconds |

## Key Concepts

### Block Key

A string identifier for a block. Records with the same block key are grouped together.

```typescript
// Example block keys:
"lastName:S"                    // First letter of last name
"lastName:S500"                 // Soundex of last name
"lastName:S|birthYear:1990"     // Composite key
```

### Block Transform

A function that converts a field value into a block key component:

```typescript
// firstLetter: "Smith" → "S"
// soundex: "Smith" → "S530"
// year: "1990-05-15" → "1990"
```

### Recall vs Precision Tradeoff

**Recall**: What percentage of true matches are found?
**Precision**: What percentage of comparisons find true matches?

- **Broader blocks** (e.g., firstLetter): Higher recall, lower precision, more comparisons
- **Narrower blocks** (e.g., soundex): Lower recall, higher precision, fewer comparisons

The goal is to balance recall and precision for your use case.

## Blocking Strategies

### 1. Standard Blocking

Groups records by exact field values (optionally transformed).

**Best for:**
- High-quality, consistent data
- Fields with natural groupings (postcodes, countries, years)
- Speed-critical applications

```typescript
.blocking(block => block
  .onField('lastName', { transform: 'soundex' })
)
```

### 2. Sorted Neighbourhood

Sorts records and compares within a sliding window.

**Best for:**
- Noisy data with typos
- Fields where standard blocking misses matches
- When recall is more important than speed

```typescript
.blocking(block => block
  .sortedNeighbourhood('lastName', { windowSize: 10 })
)
```

### 3. Composite Blocking

Combines multiple blocking strategies.

**Best for:**
- Maximum recall across multiple fields
- Complex matching scenarios
- When a single strategy is insufficient

```typescript
.blocking(block => block
  .composite('union', comp => comp
    .onField('lastName', { transform: 'soundex' })
    .onField('dateOfBirth', { transform: 'year' })
  )
)
```

## Real-World Example

### Person Matching

**Scenario**: Match people across databases with potential name variations and typos.

**Without blocking:**
- 100,000 records = 5 billion comparisons
- Estimated time: Weeks

**With soundex blocking:**
```typescript
.blocking(block => block
  .onField('lastName', { transform: 'soundex' })
)
```

- Block generation: 38ms
- Comparisons: ~50 million (99% reduction)
- Estimated time: Minutes

**With composite blocking (maximum recall):**
```typescript
.blocking(block => block
  .composite('union', comp => comp
    .onField('lastName', { transform: 'soundex' })
    .onField('dateOfBirth', { transform: 'year' })
  )
)
```

- Block generation: 60ms
- Comparisons: ~80 million (98% reduction)
- Estimated time: Minutes
- Higher recall: Catches matches with name typos via birth year

## Trade-offs and Considerations

### Recall Loss

Blocking can miss true matches if they fall into different blocks:

```typescript
// Standard blocking on exact last name:
Block "Smith":  John Smith
Block "Smyth":  John Smyth   // Same person, different spelling!

// Solution: Use phonetic transform (soundex)
Block "S530":   John Smith, John Smyth  // Now grouped together
```

### Block Size Distribution

Unbalanced blocks reduce effectiveness:

```typescript
// Poor distribution (firstLetter on last name):
Block "S": 15,000 records  // Too large!
Block "X": 50 records      // Too small

// Better distribution (soundex):
Block "S530": 83 records   // Well balanced
Block "S532": 91 records
```

### Memory Overhead

Blocking requires storing block keys and indexes:

| Records | Memory Overhead |
|---------|----------------|
| 10,000  | ~1MB           |
| 100,000 | ~8MB           |
| 1,000,000 | ~80MB        |

Memory overhead is minimal compared to the performance gains.

## Performance Characteristics

From our benchmark results:

### Block Generation Time (100k records)

| Strategy | Time | Target | Status |
|----------|------|--------|--------|
| Standard (firstLetter) | 17ms | <50ms | ✅ 2.9x better |
| Standard (soundex) | 38ms | <100ms | ✅ 2.6x better |
| Sorted neighbourhood | 53ms | <500ms | ✅ 9.4x better |
| Composite (union) | 60ms | <200ms | ✅ 3.3x better |

### Comparison Reduction

All strategies achieve **95-99%+ reduction** in comparisons compared to exhaustive matching.

## Next Steps

- [Strategies Guide](strategies.md) - Detailed explanation of each blocking strategy
- [Selection Guide](selection-guide.md) - Choose the right strategy for your data
- [Transforms Reference](transforms.md) - Available block transforms and when to use them
- [Tuning Guide](tuning.md) - Optimize blocking performance for your use case

## Quick Start

```typescript
import { HaveWeMet } from 'have-we-met'

const resolver = HaveWeMet
  .schema<Person>({
    firstName: { type: 'string' },
    lastName: { type: 'string' },
    dateOfBirth: { type: 'date' }
  })
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

// Blocking happens automatically during matching
const matches = await resolver.findMatches(records)
```

## Summary

- **Blocking is essential** for datasets larger than 10,000 records
- **95-99%+ reduction** in comparisons across all strategies
- **Sub-100ms performance** for 100k records in most cases
- **Flexible strategies** to balance recall, precision, and speed
- **Simple API** integrates seamlessly with the matching engine

Effective blocking transforms identity resolution from impractical to practical at scale.
