# Merge Strategies

Merge strategies determine how field values are selected or combined when creating a golden record from multiple source records. Each strategy applies different logic to choose the "best" value for a field.

## Strategy Overview

| Strategy | Category | Description | Best For |
|----------|----------|-------------|----------|
| `preferFirst` | Basic | First non-undefined value | Consistent ordering |
| `preferLast` | Basic | Last non-undefined value | Most recent in order |
| `preferNonNull` | Basic | First truthy value | Optional fields |
| `preferNewer` | Temporal | From most recent record | Current contact info |
| `preferOlder` | Temporal | From oldest record | Immutable data (DOB) |
| `preferLonger` | String | Longest string value | Names, descriptions |
| `preferShorter` | String | Shortest non-empty string | Codes, abbreviations |
| `concatenate` | Array | Combine all values | Tags, categories |
| `union` | Array | Unique values only | Addresses, emails |
| `mostFrequent` | Numeric | Most common value | Categorical data |
| `average` | Numeric | Mean of values | Scores, ratings |
| `sum` | Numeric | Total of values | Counts, quantities |
| `min` | Numeric | Minimum value | Lower bounds |
| `max` | Numeric | Maximum value | Upper bounds |
| `custom` | Custom | User-defined function | Complex logic |

## Basic Strategies

### preferFirst

Returns the first non-undefined value from source records in the order they were provided.

```typescript
.field('customerId').strategy('preferFirst')
```

**Behavior:**
- Iterates through values in order
- Skips `undefined` values
- Returns first valid value found
- Respects `nullHandling` option

**Example:**
```typescript
// Source records in order: [rec-001, rec-002, rec-003]
// Values: [undefined, 'CUST-001', 'CUST-002']
// Result: 'CUST-001'
```

**Use cases:**
- Primary keys where first is authoritative
- Records processed in priority order
- Default values when order matters

### preferLast

Returns the last non-undefined value from source records.

```typescript
.field('customerId').strategy('preferLast')
```

**Behavior:**
- Iterates through values from end
- Skips `undefined` values
- Returns last valid value found

**Example:**
```typescript
// Values: ['CUST-001', 'CUST-002', undefined]
// Result: 'CUST-002'
```

**Use cases:**
- Most recent update wins
- Correction records at end
- Append-only data sources

### preferNonNull

Returns the first "truthy" value, skipping null, empty strings, and other falsy values.

```typescript
.field('phone').strategy('preferNonNull')
```

**Behavior:**
- Skips `undefined`, `null`, empty strings (`''`)
- Returns first value that passes truthy check
- More selective than `preferFirst`

**Example:**
```typescript
// Values: [null, '', '+1-555-0100', '+1-555-0200']
// Result: '+1-555-0100'
```

**Use cases:**
- Optional fields where any value is better than none
- Contact information (phone, email)
- Fallback data completion

## Temporal Strategies

Temporal strategies use record timestamps to select values from older or newer records.

### preferNewer

Returns the value from the most recently updated source record.

```typescript
.merge(merge => merge
  .timestampField('updatedAt')
  .field('email').strategy('preferNewer')
)
```

**Requirements:**
- `timestampField` must be configured
- Source records must have `updatedAt` timestamps

**Behavior:**
- Compares record timestamps
- Selects value from record with latest timestamp
- Falls back to `preferLast` if timestamps equal

**Example:**
```typescript
// Record 1: { email: 'old@example.com', updatedAt: '2023-01-01' }
// Record 2: { email: 'new@example.com', updatedAt: '2024-01-01' }
// Result: 'new@example.com'
```

**Use cases:**
- Current contact information
- Latest status updates
- Most recent preferences

### preferOlder

Returns the value from the oldest source record.

```typescript
.merge(merge => merge
  .timestampField('createdAt')
  .field('dateOfBirth').strategy('preferOlder')
)
```

**Behavior:**
- Compares record timestamps
- Selects value from record with earliest timestamp

**Example:**
```typescript
// Record 1: { dob: '1985-03-15', createdAt: '2020-01-01' }
// Record 2: { dob: '1985-03-16', createdAt: '2023-01-01' }  // Typo correction
// Result: '1985-03-15' (original is authoritative)
```

**Use cases:**
- Immutable data (birth date, creation date)
- Original source data
- Historical records

### Overriding Timestamp Field

Each field can use a different date field:

```typescript
.merge(merge => merge
  .timestampField('updatedAt')  // Global default
  .field('email').strategy('preferNewer')  // Uses updatedAt
  .field('dateOfBirth').strategy('preferOlder').options({
    dateField: 'createdAt'  // Override: use createdAt
  })
)
```

## String Strategies

### preferLonger

Returns the longest string value among all source records.

```typescript
.field('firstName').strategy('preferLonger')
```

**Behavior:**
- Compares string lengths
- Selects longest non-empty string
- Returns first on tie

**Example:**
```typescript
// Values: ['Jon', 'Jonathan', 'Johnny']
// Result: 'Jonathan' (8 characters)
```

**Use cases:**
- Names (full name vs. nickname)
- Descriptions (complete vs. abbreviated)
- Any field where more data is better

### preferShorter

Returns the shortest non-empty string value.

```typescript
.field('stateCode').strategy('preferShorter')
```

**Behavior:**
- Compares string lengths
- Ignores empty strings
- Selects shortest non-empty string

**Example:**
```typescript
// Values: ['California', 'CA', 'Calif.']
// Result: 'CA' (2 characters)
```

**Use cases:**
- Codes and abbreviations
- Normalized identifiers
- Canonical short forms

## Array Strategies

### concatenate

Combines all array values into a single array.

```typescript
.field('tags').strategy('concatenate')
```

**Behavior:**
- Flattens arrays from all sources
- Preserves duplicates by default
- Can remove duplicates with option

**Options:**
```typescript
.field('tags').strategy('concatenate').options({
  removeDuplicates: true,
  separator: ','  // For string concatenation
})
```

**Example:**
```typescript
// Values: [['vip', 'premium'], ['vip', 'enterprise']]
// Result: ['vip', 'premium', 'vip', 'enterprise']
// With removeDuplicates: ['vip', 'premium', 'enterprise']
```

**Use cases:**
- Tags and categories
- Historical records
- Audit trails

### union

Returns unique values from all source records.

```typescript
.field('emailAddresses').strategy('union')
```

**Behavior:**
- Combines all arrays
- Removes duplicates
- Preserves order of first occurrence

**Example:**
```typescript
// Values: [['home@example.com'], ['work@example.com', 'home@example.com']]
// Result: ['home@example.com', 'work@example.com']
```

**Use cases:**
- Multiple addresses
- Multiple phone numbers
- All known identifiers

## Numeric Strategies

### mostFrequent

Returns the value that appears most often across source records.

```typescript
.field('preferredLanguage').strategy('mostFrequent')
```

**Behavior:**
- Counts occurrences of each value
- Returns the mode (most common)
- First value on tie

**Example:**
```typescript
// Values: ['en', 'fr', 'en', 'en', 'de']
// Result: 'en' (appears 3 times)
```

**Use cases:**
- Categorical data
- User preferences
- Consensus values

### average

Returns the arithmetic mean of numeric values.

```typescript
.field('rating').strategy('average')
```

**Behavior:**
- Calculates mean of all values
- Ignores null/undefined
- Returns number (may have decimals)

**Example:**
```typescript
// Values: [4, 5, 3, 4]
// Result: 4 (average of 4+5+3+4 = 16/4)
```

**Use cases:**
- Ratings and scores
- Normalized metrics
- Aggregated values

### sum

Returns the total sum of numeric values.

```typescript
.field('totalPurchases').strategy('sum')
```

**Behavior:**
- Adds all numeric values
- Ignores null/undefined

**Example:**
```typescript
// Values: [100, 250, 75]
// Result: 425
```

**Use cases:**
- Counts and totals
- Accumulated values
- Aggregations

### min

Returns the minimum numeric value.

```typescript
.field('lowestPrice').strategy('min')
```

**Example:**
```typescript
// Values: [29.99, 24.99, 34.99]
// Result: 24.99
```

**Use cases:**
- Lower bounds
- Earliest dates (as timestamps)
- Minimum thresholds

### max

Returns the maximum numeric value.

```typescript
.field('highestScore').strategy('max')
```

**Example:**
```typescript
// Values: [85, 92, 78]
// Result: 92
```

**Use cases:**
- Upper bounds
- Peak values
- Maximum limits

## Custom Strategies

For complex logic not covered by built-in strategies, use custom functions.

### Basic Custom Function

```typescript
.field('displayName').custom((values, records) => {
  // Return the value with the most words
  return values.reduce((best, current) => {
    const currentWords = (current || '').split(' ').length
    const bestWords = (best || '').split(' ').length
    return currentWords > bestWords ? current : best
  }, '')
})
```

### Using Record Metadata

```typescript
.field('email').custom((values, records) => {
  // Prefer value from verified sources
  for (let i = 0; i < records.length; i++) {
    if (records[i].record.emailVerified) {
      return values[i]
    }
  }
  // Fall back to first non-null
  return values.find(v => v != null)
})
```

### Complex Business Logic

```typescript
.field('address').custom((values, records) => {
  // Complex scoring based on completeness
  let bestIndex = 0
  let bestScore = 0

  for (let i = 0; i < values.length; i++) {
    const addr = values[i]
    if (!addr) continue

    let score = 0
    if (addr.street) score += 1
    if (addr.city) score += 1
    if (addr.state) score += 1
    if (addr.zipCode) score += 1
    if (addr.country) score += 1

    if (score > bestScore) {
      bestScore = score
      bestIndex = i
    }
  }

  return values[bestIndex]
})
```

## Null Handling

Control how null and undefined values are treated:

```typescript
.field('middleName').strategy('preferFirst').options({
  nullHandling: 'skip'  // Default: skip null/undefined
})

.field('deletedAt').strategy('preferFirst').options({
  nullHandling: 'include'  // Include null as a valid value
})

.field('optOutFlag').strategy('preferFirst').options({
  nullHandling: 'preferNull'  // Prefer null over other values
})
```

**Options:**
- `'skip'` (default): Skip null and undefined, find first valid value
- `'include'`: Treat null as a valid value (can be selected)
- `'preferNull'`: Prefer null when present

## Strategy Selection Guide

### Decision Tree

```
Is the field temporal (contact info, preferences)?
├─ Yes: preferNewer (or preferOlder for immutable data)
└─ No: Continue...

Is it a string where length matters?
├─ Yes (longer is better): preferLonger
├─ Yes (shorter is better): preferShorter
└─ No: Continue...

Is it an array/collection?
├─ Yes (keep all): concatenate
├─ Yes (unique only): union
└─ No: Continue...

Is it numeric?
├─ Yes (aggregate): average, sum, min, max
├─ Yes (most common): mostFrequent
└─ No: Continue...

Is order meaningful?
├─ Yes (first wins): preferFirst
├─ Yes (last wins): preferLast
└─ No: Continue...

Default: preferNonNull
```

### Common Configurations

**Customer Data:**
```typescript
.merge(merge => merge
  .timestampField('updatedAt')
  .defaultStrategy('preferNonNull')
  .field('firstName').strategy('preferLonger')
  .field('lastName').strategy('preferLonger')
  .field('email').strategy('preferNewer')
  .field('phone').strategy('preferNonNull')
  .field('addresses').strategy('union')
)
```

**Employee Data:**
```typescript
.merge(merge => merge
  .timestampField('updatedAt')
  .defaultStrategy('preferNewer')
  .field('employeeId').strategy('preferFirst')
  .field('hireDate').strategy('preferOlder')
  .field('department').strategy('preferNewer')
  .field('salary').strategy('max')
)
```

**Product Data:**
```typescript
.merge(merge => merge
  .defaultStrategy('preferNonNull')
  .field('name').strategy('preferLonger')
  .field('description').strategy('preferLonger')
  .field('price').strategy('min')
  .field('categories').strategy('union')
  .field('rating').strategy('average')
)
```

## Next Steps

- [Golden Record Overview](./golden-record.md): Complete merge workflow
- [Provenance](./provenance.md): Track field attribution
- [Unmerge](./unmerge.md): Reverse incorrect merges
