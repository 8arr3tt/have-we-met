# Blocking Strategies - Detailed Guide

This guide provides in-depth explanations of each blocking strategy, including use cases, configuration options, performance characteristics, and code examples.

## Table of Contents

- [Standard Blocking](#standard-blocking)
- [Sorted Neighbourhood](#sorted-neighbourhood)
- [Composite Blocking](#composite-blocking)
- [Strategy Comparison](#strategy-comparison)

---

## Standard Blocking

Standard blocking groups records by exact field values (optionally transformed). This is the most common and straightforward approach.

### How It Works

1. Extract field value from each record
2. Apply optional transform (e.g., soundex, firstLetter)
3. Generate block key from transformed value
4. Group all records with the same block key

### Single Field Blocking

Block on a single field value:

```typescript
// Block on first letter of last name
.blocking(block => block
  .onField('lastName', { transform: 'firstLetter' })
)

// Block on Soundex encoding of last name
.blocking(block => block
  .onField('lastName', { transform: 'soundex' })
)

// Block on birth year
.blocking(block => block
  .onField('dateOfBirth', { transform: 'year' })
)

// Block on exact email domain
.blocking(block => block
  .onField('email', {
    transform: (email) => email?.split('@')[1] || null
  })
)
```

### Multi-Field Blocking

Block on multiple fields creating a composite key:

```typescript
// Block on last name first letter + birth year
.blocking(block => block
  .onFields(['lastName', 'dateOfBirth'], {
    transforms: ['firstLetter', 'year']
  })
)

// Block on soundex(lastName) + country
.blocking(block => block
  .onFields(['lastName', 'country'], {
    transforms: ['soundex', 'identity']
  })
)
```

**Block Key Format:**
- Single field: `field:value` (e.g., `lastName:S`)
- Multi-field: `field1:value1|field2:value2` (e.g., `lastName:S|birthYear:1990`)

### Null Handling

Control how null/undefined values are handled:

```typescript
.blocking(block => block
  .onField('lastName', {
    transform: 'soundex',
    nullStrategy: 'skip'  // 'skip' | 'block' | 'compare'
  })
)
```

| Strategy | Behavior |
|----------|----------|
| `skip` (default) | Records with null values are skipped entirely |
| `block` | Null values are grouped together in a `__NULL__` block |
| `compare` | Null records are compared against all other records |

### Key Normalization

By default, block keys are normalized (lowercase, trimmed) for case-insensitive matching:

```typescript
.blocking(block => block
  .onField('lastName', {
    transform: 'firstLetter',
    normalizeKeys: true  // Default: true
  })
)
```

With normalization: `lastName:s` and `lastName:S` become the same block.
Without normalization: They remain separate blocks.

### Performance Characteristics

From benchmarks with 100,000 records:

| Transform | Generation Time | Blocks Created | Avg Records/Block | Comparison Reduction |
|-----------|-----------------|----------------|-------------------|---------------------|
| firstLetter | 17ms | ~26 | ~3,846 | 96% |
| soundex | 38ms | ~1,200 | ~83 | 99% |
| metaphone | 44ms | ~1,500 | ~67 | 99% |
| year | 22ms | ~80 | ~1,250 | 98% |

### Best Use Cases

✅ **Good for:**
- High-quality, consistent data
- Fields with natural groupings (countries, years, categories)
- Speed-critical applications
- Large datasets (100k+ records)

❌ **Not ideal for:**
- Highly noisy data with many typos
- Fields with inconsistent formatting
- Maximum recall scenarios (use composite instead)

### Example: Person Matching

```typescript
import { HaveWeMet } from 'have-we-met'

interface Person {
  firstName: string
  lastName: string
  dateOfBirth: string
}

const resolver = HaveWeMet
  .schema<Person>({
    firstName: { type: 'string' },
    lastName: { type: 'string' },
    dateOfBirth: { type: 'date' }
  })
  .blocking(block => block
    .onField('lastName', { transform: 'soundex' })
  )
  .matching(/* ... */)
  .build()
```

**Result:**
- 100k records → ~1,200 blocks
- ~83 records per block
- 99% reduction in comparisons
- 38ms block generation time

---

## Sorted Neighbourhood

Sorted neighbourhood sorts records by a key and compares within a sliding window. This catches matches that standard blocking might miss due to typos or variations.

### How It Works

1. Sort all records by specified field(s)
2. Apply optional transform before sorting
3. Create overlapping windows of size N
4. Each record is compared with its N-1 neighbors

### Basic Configuration

```typescript
// Sort by last name, window of 10
.blocking(block => block
  .sortedNeighbourhood('lastName', { windowSize: 10 })
)

// Sort by Soundex of last name
.blocking(block => block
  .sortedNeighbourhood('lastName', {
    windowSize: 20,
    transform: 'soundex'
  })
)

// Sort descending (newest first)
.blocking(block => block
  .sortedNeighbourhood('dateOfBirth', {
    windowSize: 15,
    transform: 'year',
    order: 'desc'
  })
)
```

### Multi-Field Sorting

Sort by multiple fields in priority order:

```typescript
.blocking(block => block
  .sortedNeighbourhood(
    [
      { field: 'lastName', transform: 'soundex', order: 'asc' },
      { field: 'dateOfBirth', transform: 'year', order: 'asc' }
    ],
    { windowSize: 10 }
  )
)
```

Records are sorted by:
1. Soundex of last name (primary)
2. Birth year (secondary, for ties)

### Window Size Selection

Window size determines how many neighboring records are compared:

| Window Size | Comparisons per Record | Use Case |
|-------------|------------------------|----------|
| 5 | 4 | Clean data, minor variations |
| 10 | 9 | **Recommended default** |
| 20 | 19 | Noisy data, high recall needs |
| 50+ | 49+ | Extreme recall, accept slower performance |

### How Windows Work

For a sorted list `[A, B, C, D, E]` with window size 3:

```
Window 0: [A, B, C]  →  Compare: A-B, A-C, B-C
Window 1: [B, C, D]  →  Compare: B-C, B-D, C-D
Window 2: [C, D, E]  →  Compare: C-D, C-E, D-E
```

Notice that B-C and C-D are compared twice (overlapping windows). This ensures no pairs are missed.

### Performance Characteristics

From benchmarks with 100,000 records:

| Window Size | Generation Time | Total Windows | Comparisons | Reduction |
|-------------|-----------------|---------------|-------------|-----------|
| 5 | 51ms | 99,996 | ~500k | 99.99% |
| 10 | 53ms | 99,991 | ~1M | 99.98% |
| 20 | 71ms | 99,981 | ~2M | 99.96% |

### Comparison with Standard Blocking

**Scenario:** Two records with a typo in last name

```
Record 1: John Smith, DOB: 1985-03-15
Record 2: John Smyth, DOB: 1985-03-20
```

**Standard blocking (soundex):**
```
Block "S530": John Smith
Block "S530": John Smyth
✅ Matched (both have same soundex)
```

**Standard blocking (firstLetter):**
```
Block "S": John Smith
Block "S": John Smyth
✅ Matched (both start with S)
```

**Standard blocking (exact):**
```
Block "Smith": John Smith
Block "Smyth": John Smyth
❌ Not matched (different blocks)
```

**Sorted neighbourhood:**
```
Sorted: [..., John Smith, John Smyth, ...]
Window: [John Smith, John Smyth, ...]
✅ Matched (neighbors in sorted order)
```

Sorted neighbourhood catches matches missed by exact standard blocking.

### Best Use Cases

✅ **Good for:**
- Noisy data with typos and variations
- When standard blocking is too restrictive
- Fields that sort meaningfully (names, dates, addresses)
- High-recall requirements

❌ **Not ideal for:**
- Fields without natural sort order (UUIDs, random IDs)
- Very large datasets where sorting is expensive
- Speed-critical applications (use standard blocking instead)

### Example: Email Deduplication

```typescript
interface Contact {
  email: string
  name: string
}

const resolver = HaveWeMet
  .schema<Contact>({
    email: { type: 'string' },
    name: { type: 'string' }
  })
  .blocking(block => block
    .sortedNeighbourhood('email', { windowSize: 5 })
  )
  .matching(/* ... */)
  .build()
```

**Why this works:**
- Similar emails sort together: `john.smith@example.com`, `john.smyth@example.com`
- Small window (5) is sufficient for email variations
- Catches typos that exact blocking would miss

---

## Composite Blocking

Composite blocking combines multiple strategies for better recall/precision tradeoff. Records are compared if they match in ANY strategy (union) or ALL strategies (intersection).

### Union Mode (Default)

Records are compared if they share a block in **ANY** strategy:

```typescript
.blocking(block => block
  .composite('union', comp => comp
    .onField('lastName', { transform: 'soundex' })
    .onField('dateOfBirth', { transform: 'year' })
  )
)
```

**Result:** Records are compared if they have:
- Same soundex(lastName), OR
- Same birth year, OR
- Both

**Effect:**
- ✅ Higher recall (catches more matches)
- ⚠️ More comparisons
- ⚠️ Lower precision (more false positives to review)

### Intersection Mode

Records are compared only if they share a block in **ALL** strategies:

```typescript
.blocking(block => block
  .composite('intersection', comp => comp
    .onField('lastName', { transform: 'firstLetter' })
    .onField('dateOfBirth', { transform: 'year' })
  )
)
```

**Result:** Records are compared only if they have:
- Same first letter of last name, AND
- Same birth year

**Effect:**
- ⚠️ Lower recall (misses some matches)
- ✅ Fewer comparisons
- ✅ Higher precision (fewer false positives)

### Choosing Union vs Intersection

| Mode | Recall | Comparisons | Use Case |
|------|--------|-------------|----------|
| Union | Higher | More | Default choice, maximum matching |
| Intersection | Lower | Fewer | Very large datasets, speed critical |

**Recommendation:** Use union mode unless you have a specific need for intersection.

### Combining Different Strategy Types

Mix standard and sorted neighbourhood:

```typescript
.blocking(block => block
  .composite('union', comp => comp
    .onField('lastName', { transform: 'soundex' })
    .sortedNeighbourhood('email', { windowSize: 5 })
  )
)
```

**Result:** Records are compared if they have:
- Same soundex(lastName), OR
- Are neighbors when sorted by email

This provides fallback matching when one strategy misses a match.

### Performance Characteristics

From benchmarks with 100,000 records:

| Configuration | Generation Time | Comparison Reduction |
|---------------|-----------------|---------------------|
| Union (2 strategies) | 60ms | 94% |
| Union (3 strategies) | 95ms | 90% |
| Intersection (2 strategies) | 2,377ms | 99.5% |

**Note:** Intersection mode is currently slower due to record-to-block mapping overhead. Use union mode for most cases.

### Best Use Cases

✅ **Good for:**
- Maximum recall requirements
- Multi-field matching scenarios
- When no single field is reliable
- Combining complementary strategies

❌ **Not ideal for:**
- Simple scenarios where single strategy suffices
- Speed-critical applications (use single strategy instead)
- Very large datasets with intersection mode

### Example: Person Matching with Maximum Recall

```typescript
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
  .blocking(block => block
    .composite('union', comp => comp
      // Match on last name similarity
      .onField('lastName', { transform: 'soundex' })
      // OR match on birth year
      .onField('dateOfBirth', { transform: 'year' })
      // OR match on email similarity
      .sortedNeighbourhood('email', { windowSize: 10 })
    )
  )
  .matching(/* ... */)
  .build()
```

**Result:** Catches matches via:
1. Similar last names (even with typos)
2. Same birth year (even if name is completely different)
3. Similar email addresses (sorted neighbourhood)

This maximizes recall at the cost of more comparisons.

---

## Strategy Comparison

### Quick Reference Table

| Strategy | Generation Time | Comparison Reduction | Recall | Best For |
|----------|-----------------|---------------------|--------|----------|
| Standard (firstLetter) | Fastest (17ms) | 96% | Medium | Speed-critical, simple matching |
| Standard (soundex) | Fast (38ms) | 99% | High | Name matching with typos |
| Standard (metaphone) | Fast (44ms) | 99% | High | Advanced phonetic matching |
| Sorted neighbourhood | Medium (53ms) | 99.9% | Very High | Noisy data, high recall |
| Composite (union) | Medium (60ms) | 94% | Maximum | Multi-field, maximum recall |
| Composite (intersection) | Slow (2,377ms) | 99.5% | Lower | Very large datasets, precision |

### Decision Tree

```
Start: What's your dataset size?

< 10k records
  └─> No blocking needed (or use simple firstLetter)

10k-100k records
  └─> Is speed or recall more important?
      ├─> Speed: Standard (firstLetter or soundex)
      └─> Recall: Sorted neighbourhood or composite union

100k+ records
  └─> What's your data quality?
      ├─> High quality: Standard (soundex)
      ├─> Low quality: Sorted neighbourhood
      └─> Mixed: Composite union
```

### Performance vs Recall Tradeoff

```
Recall
  ↑
  │   Composite Union
  │   ↗
  │  Sorted Neighbourhood
  │  ↗
  │ Standard (soundex)
  │ ↗
  │Standard (firstLetter)
  │
  └──────────────────────→ Speed
     Fast            Slow
```

### Real-World Scenario Recommendations

#### Person Matching
```typescript
// Recommended: Soundex for balance
.blocking(block => block
  .onField('lastName', { transform: 'soundex' })
)

// High recall: Composite
.blocking(block => block
  .composite('union', comp => comp
    .onField('lastName', { transform: 'soundex' })
    .onField('dateOfBirth', { transform: 'year' })
  )
)
```

#### Address Matching
```typescript
// Recommended: Postcode + street
.blocking(block => block
  .onFields(['postcode', 'street'], {
    transforms: ['identity', 'firstLetter']
  })
)
```

#### Email Deduplication
```typescript
// Recommended: Domain + sorted neighbourhood
.blocking(block => block
  .composite('union', comp => comp
    .onField('email', {
      transform: (email) => email?.split('@')[1] || null
    })
    .sortedNeighbourhood('email', { windowSize: 5 })
  )
)
```

#### Company/Organization Matching
```typescript
// Recommended: Soundex + country
.blocking(block => block
  .onFields(['name', 'country'], {
    transforms: ['soundex', 'identity']
  })
)
```

## Next Steps

- [Selection Guide](selection-guide.md) - Interactive guide to choosing the right strategy
- [Transforms Reference](transforms.md) - Complete reference for all block transforms
- [Tuning Guide](tuning.md) - Optimize performance for your specific data
- [Overview](overview.md) - High-level introduction to blocking

## Summary

- **Standard blocking** is the default choice for most scenarios
- **Sorted neighbourhood** excels with noisy data and high recall needs
- **Composite union** maximizes recall by combining strategies
- **Composite intersection** reduces comparisons but lowers recall (use sparingly)
- Choose based on your dataset size, data quality, and recall requirements
