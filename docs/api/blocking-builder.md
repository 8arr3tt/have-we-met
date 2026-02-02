# Blocking Builder API Reference

The Blocking Builder configures strategies to reduce the comparison space from O(n²) by grouping records into blocks that share common characteristics.

## Entry Point

Access the blocking builder through the resolver builder chain:

```typescript
import { HaveWeMet } from 'have-we-met';

const resolver = HaveWeMet
  .create<Person>()
  .schema(/* ... */)
  .blocking(block => block
    .onField('lastName', { transform: 'soundex' })
    .onField('dateOfBirth', { transform: 'year' })
  )
  .matching(/* ... */)
  .build();
```

## BlockingBuilder<T>

Main builder class for configuring blocking strategies.

### Methods

#### `onField<K>(field: K, options?): this`

Configure standard blocking on a single field.

**Parameters:**
- `field: K` - Field name to block on (type-safe from your record type)
- `options?: object`
  - `transform?: BlockTransform` - Transform to apply to field value
  - `transformOptions?: FirstNOptions` - Options for 'firstN' transform
  - `nullStrategy?: NullStrategy` - How to handle null values
  - `normalizeKeys?: boolean` - Whether to normalize block keys

**Returns:** `BlockingBuilder<T>` for chaining

**Example:**
```typescript
block => block
  .onField('lastName', { transform: 'soundex' })
  .onField('email')  // No transform = exact value blocking
  .onField('firstName', { transform: 'firstN', transformOptions: { n: 2 } })
```

#### `onFields(fields: Array<keyof T & string>, options?): this`

Configure standard blocking on multiple fields (composite key).

**Parameters:**
- `fields: Array<keyof T & string>` - Array of field names
- `options?: object`
  - `transforms?: BlockTransform[]` - Transform for each field (parallel array)
  - `transformOptions?: FirstNOptions[]` - Options for each transform
  - `nullStrategy?: NullStrategy` - How to handle null values
  - `normalizeKeys?: boolean` - Whether to normalize block keys

**Returns:** `BlockingBuilder<T>` for chaining

**Example:**
```typescript
block => block
  .onFields(['lastName', 'dateOfBirth'], {
    transforms: ['soundex', 'year']
  })
```

#### `sortedNeighbourhood<K>(field, options): this`

Configure sorted neighbourhood blocking with a sliding window.

**Parameters:**
- `field: K | K[] | SortField | SortField[]` - Field(s) to sort by
- `options: object` (required)
  - `windowSize: number` - Size of the sliding window (required)
  - `transform?: BlockTransform` - Transform to apply before sorting
  - `transformOptions?: FirstNOptions` - Options for 'firstN' transform
  - `order?: SortOrder` - Sort order (`'asc'` or `'desc'`, default: `'asc'`)
  - `nullStrategy?: NullStrategy` - How to handle null values

**Returns:** `BlockingBuilder<T>` for chaining

**Example:**
```typescript
block => block
  .sortedNeighbourhood('lastName', {
    windowSize: 10,
    transform: 'soundex'
  })

// Multiple sort fields
block => block
  .sortedNeighbourhood(
    [
      { field: 'lastName', order: 'asc' },
      { field: 'firstName', order: 'asc' }
    ],
    { windowSize: 15 }
  )
```

#### `composite(mode, configurator): this`

Configure multiple blocking strategies to run together.

**Parameters:**
- `mode: 'union' | 'intersection'` - How to combine strategy results
  - `'union'`: Include pairs matched by ANY strategy (more comparisons, higher recall)
  - `'intersection'`: Include pairs matched by ALL strategies (fewer comparisons, higher precision)
- `configurator: (builder: CompositeBlockingBuilder<T>) => void` - Configuration callback

**Returns:** `BlockingBuilder<T>` for chaining

**Example:**
```typescript
block => block
  .composite('union', comp => comp
    .onField('lastName', { transform: 'soundex' })
    .onField('email')
    .sortedNeighbourhood('dateOfBirth', { windowSize: 5 })
  )
```

#### `nullStrategy(strategy: NullStrategy): this`

Set the default null handling strategy for all blocking operations.

**Parameters:**
- `strategy: NullStrategy` - One of: `'skip'`, `'separate-block'`, `'match-all'`

**Returns:** `BlockingBuilder<T>` for chaining

**Example:**
```typescript
block => block
  .nullStrategy('skip')  // Records with null values won't be blocked
  .onField('lastName', { transform: 'soundex' })
```

#### `build(): BlockingConfig<T>`

Build and return the final blocking configuration.

**Returns:** `BlockingConfig<T>` - The complete blocking configuration

---

## CompositeBlockingBuilder<T>

Builder for configuring multiple blocking strategies within a composite.

### Methods

#### `onField<K>(field: K, options?): this`

Add a standard blocking strategy on a single field.

**Parameters:** Same as `BlockingBuilder.onField()`

**Returns:** `CompositeBlockingBuilder<T>` for chaining

#### `onFields(fields, options?): this`

Add a standard blocking strategy on multiple fields.

**Parameters:** Same as `BlockingBuilder.onFields()`

**Returns:** `CompositeBlockingBuilder<T>` for chaining

#### `sortedNeighbourhood<K>(field, options): this`

Add a sorted neighbourhood strategy.

**Parameters:** Same as `BlockingBuilder.sortedNeighbourhood()`

**Returns:** `CompositeBlockingBuilder<T>` for chaining

#### `getStrategies(): BlockingStrategy<T>[]`

Get the array of configured strategies.

**Returns:** `BlockingStrategy<T>[]` - Array of blocking strategies

---

## Block Transforms

Transforms convert field values before grouping into blocks.

| Transform | Description | Example |
|-----------|-------------|---------|
| `'identity'` | No transformation (exact value) | `"Smith"` → `"Smith"` |
| `'firstLetter'` | First character | `"Smith"` → `"S"` |
| `'firstN'` | First N characters | `"Smith"` (n=3) → `"Smi"` |
| `'soundex'` | Soundex phonetic encoding | `"Smith"` → `"S530"` |
| `'metaphone'` | Metaphone phonetic encoding | `"Smith"` → `"SM0"` |
| `'year'` | Extract year from date | `"1990-05-15"` → `"1990"` |
| Custom function | `(value: unknown) => string` | Any custom logic |

**Example with custom transform:**
```typescript
block => block
  .onField('phone', {
    transform: (value) => {
      if (typeof value !== 'string') return '';
      // Block by area code
      return value.replace(/\D/g, '').substring(0, 3);
    }
  })
```

---

## Null Strategies

| Strategy | Behavior |
|----------|----------|
| `'skip'` | Records with null values are excluded from blocking |
| `'separate-block'` | All records with null values go into a single block together |
| `'match-all'` | Records with null values are compared against all other records |

---

## BlockingConfig Type

```typescript
interface BlockingConfig<T> {
  strategies: BlockingStrategy<T>[];
  compositeMode?: 'union' | 'intersection';
  defaultNullStrategy?: NullStrategy;
}

interface BlockingStrategy<T> {
  type: 'standard' | 'sorted-neighbourhood' | 'composite';
  fields: Array<keyof T & string>;
  transforms?: BlockTransform[];
  transformOptions?: FirstNOptions[];
  windowSize?: number;  // For sorted neighbourhood
  sortOrder?: SortOrder;
  nullStrategy?: NullStrategy;
}
```

---

## Strategy Selection Guide

| Strategy | Use Case | Pros | Cons |
|----------|----------|------|------|
| Standard (single field) | Simple blocking on one attribute | Fast, simple | May miss matches if field differs |
| Standard (multi-field) | Composite blocking keys | Better precision | Requires all fields to match |
| Sorted Neighbourhood | Gradual variation in sort key | Good for typos | Requires sorting overhead |
| Composite Union | Maximize recall | Catches more matches | More comparisons |
| Composite Intersection | Maximize precision | Fewer comparisons | May miss matches |

---

## Performance Characteristics

| Dataset Size | Recommended Approach |
|--------------|---------------------|
| < 10,000 | Single field blocking sufficient |
| 10,000 - 100,000 | Composite blocking recommended |
| > 100,000 | Composite union with multiple strategies |

**Blocking Effectiveness:**
- Good blocking reduces comparisons by 95-99%
- Target: 100-1000 comparisons per record instead of n comparisons

---

## Complete Example

```typescript
import { HaveWeMet } from 'have-we-met';

interface Customer {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  zipCode: string;
}

const resolver = HaveWeMet
  .create<Customer>()
  .schema(/* ... */)
  .blocking(block => block
    // Use composite blocking for comprehensive coverage
    .composite('union', comp => comp
      // Block by phonetic last name (catches spelling variations)
      .onField('lastName', { transform: 'soundex' })

      // Block by exact email (high-precision matches)
      .onField('email')

      // Block by phone (high-precision matches)
      .onField('phone')

      // Block by zip + first letter of last name
      .onFields(['zipCode', 'lastName'], {
        transforms: ['identity', 'firstLetter']
      })

      // Sorted neighbourhood for date variations
      .sortedNeighbourhood('dateOfBirth', {
        windowSize: 7,
        transform: 'identity'
      })
    )

    // Skip records with null blocking values
    .nullStrategy('skip')
  )
  .matching(/* ... */)
  .build();
```

---

## Blocking Statistics

The resolver provides blocking statistics after batch operations:

```typescript
const result = resolver.deduplicateBatch(records);

console.log(result.stats);
// {
//   totalRecords: 100000,
//   totalBlocks: 8500,
//   averageBlockSize: 11.8,
//   maxBlockSize: 45,
//   pairsGenerated: 52000,
//   pairsReduced: 4999948000,
//   reductionRatio: 0.99999
// }
```

---

## Related

- [Blocking Overview](../blocking/overview.md) - Detailed blocking concepts
- [Blocking Strategies](../blocking/strategies.md) - Strategy deep-dive
- [Transform Reference](../blocking/transforms.md) - All available transforms
- [Blocking Tuning](../blocking/tuning.md) - Performance optimization
