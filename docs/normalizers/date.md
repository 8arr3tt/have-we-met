# Date Normalizer

The date normalizer parses various date formats and converts them to ISO 8601 standard format for consistent comparison. It handles partial dates, ambiguous formats, and multiple input types.

## Purpose

Dates come in countless formats:

- `2024-01-30` (ISO 8601)
- `01/30/2024` (US format)
- `30/01/2024` (EU format)
- `January 30, 2024` (natural language)
- `1706630400` (Unix timestamp)
- `2024-01` (partial: year-month)
- `2024` (partial: year only)

The date normalizer provides consistent ISO 8601 output: `YYYY-MM-DD`

## Function Signature

```typescript
normalizeDate(
  value: unknown,
  options?: DateNormalizerOptions
): string | DateComponents | null
```

### Options

```typescript
interface DateNormalizerOptions {
  /** How to handle partial dates: 'preserve', 'reject', 'impute' (default: 'preserve') */
  partialDates?: 'preserve' | 'reject' | 'impute'
  /** Value to impute for missing day/month (default: 1) */
  imputeValue?: number
  /** Input format hint (e.g., 'MM/DD/YYYY', 'DD/MM/YYYY') (default: auto-detect) */
  inputFormat?: string
  /** Format for output: 'iso' or 'components' (default: 'iso') */
  outputFormat?: 'iso' | 'components'
}
```

### Output Types

```typescript
interface DateComponents {
  year?: number
  month?: number        // 1-12
  day?: number          // 1-31
  iso?: string          // ISO 8601: YYYY-MM-DD
  isPartial: boolean    // True if month or day is missing
}
```

## ISO 8601 Format

ISO 8601 is the international standard for date representation:

- **Full date:** `YYYY-MM-DD` (e.g., `2024-01-30`)
- **Year-month:** `YYYY-MM` (e.g., `2024-01`)
- **Year only:** `YYYY` (e.g., `2024`)
- **Always uses:** 4-digit year, 2-digit month, 2-digit day
- **Always ordered:** Year, month, day (largest to smallest)

## Configuration

### Builder API

```typescript
const resolver = HaveWeMet.create<Person>()
  .schema(s => s
    .field('dateOfBirth')
      .type('date')
      .normalizer('date', {
        partialDates: 'preserve',
        inputFormat: 'MM/DD/YYYY'
      })
  )
  .matching(/* ... */)
  .build()
```

### Direct Definition

```typescript
.schema(s => s
  .field('dateOfBirth', {
    type: 'date',
    normalizer: 'date',
    normalizerOptions: {
      outputFormat: 'iso'
    }
  })
)
```

## Examples

### ISO Format (Recommended Input)

```typescript
import { normalizeDate } from 'have-we-met'

// Already ISO format
normalizeDate('2024-01-30')
// → '2024-01-30'

// Partial dates
normalizeDate('2024-01')
// → '2024-01'

normalizeDate('2024')
// → '2024'
```

### US Format (MM/DD/YYYY)

```typescript
normalizeDate('01/30/2024')
// → '2024-01-30'

normalizeDate('1/30/24')
// → '2024-01-30'

normalizeDate('01-30-2024')
// → '2024-01-30'
```

### EU Format (DD/MM/YYYY)

```typescript
// With format hint
normalizeDate('30/01/2024', { inputFormat: 'DD/MM/YYYY' })
// → '2024-01-30'

// Auto-detection (day > 12)
normalizeDate('30/01/2024')
// → '2024-01-30' (30 > 12, must be DD/MM)
```

### Natural Language

```typescript
normalizeDate('January 30, 2024')
// → '2024-01-30'

normalizeDate('Jan 30 2024')
// → '2024-01-30'

normalizeDate('30 January 2024')
// → '2024-01-30'
```

### Unix Timestamps

```typescript
// Seconds since epoch
normalizeDate(1706630400)
// → '2024-01-30'

// Milliseconds since epoch
normalizeDate(1706630400000)
// → '2024-01-30'
```

### Date Objects

```typescript
normalizeDate(new Date('2024-01-30'))
// → '2024-01-30'

normalizeDate(new Date(2024, 0, 30))  // Month is 0-indexed in JS
// → '2024-01-30'
```

### Partial Dates

```typescript
// Preserve partial dates (default)
normalizeDate('2024-01', { partialDates: 'preserve' })
// → '2024-01'

normalizeDate('2024', { partialDates: 'preserve' })
// → '2024'

// Reject partial dates
normalizeDate('2024-01', { partialDates: 'reject' })
// → null

// Impute missing values
normalizeDate('2024-01', { partialDates: 'impute' })
// → '2024-01-01'

normalizeDate('2024', { partialDates: 'impute' })
// → '2024-01-01'

// Custom impute value
normalizeDate('2024-01', {
  partialDates: 'impute',
  imputeValue: 15
})
// → '2024-01-15'
```

### Component Output

```typescript
normalizeDate('01/30/2024', { outputFormat: 'components' })
// → {
//   year: 2024,
//   month: 1,
//   day: 30,
//   iso: '2024-01-30',
//   isPartial: false
// }

normalizeDate('2024-01', { outputFormat: 'components' })
// → {
//   year: 2024,
//   month: 1,
//   iso: '2024-01',
//   isPartial: true
// }
```

## Format Detection

The normalizer uses the following detection strategy:

1. **Try ISO format first** (`YYYY-MM-DD`) - Most unambiguous
2. **Check for month names** - January, Jan, etc.
3. **Use format hint** if provided
4. **Detect MM/DD vs DD/MM:**
   - If day > 12, must be DD/MM
   - If format hint provided, use it
   - Default to MM/DD (US format)

### Ambiguous Format Example

```typescript
// Ambiguous: Could be Jan 5 or May 1
normalizeDate('01/05/2024')
// → '2024-01-05' (defaults to MM/DD)

// Explicit format hint
normalizeDate('01/05/2024', { inputFormat: 'DD/MM/YYYY' })
// → '2024-05-01'

// Unambiguous (day > 12)
normalizeDate('25/01/2024')
// → '2024-01-25' (must be DD/MM)
```

## Two-Digit Year Handling

Two-digit years are interpreted as 20XX (current century):

```typescript
normalizeDate('01/30/24')
// → '2024-01-30'

normalizeDate('12/25/99')
// → '2099-12-25'
```

## Validation

The normalizer validates dates to catch invalid values:

```typescript
// Valid date
normalizeDate('2024-02-29')  // Leap year
// → '2024-02-29'

// Invalid date (Feb 30 doesn't exist)
normalizeDate('2024-02-30')
// → null

// Invalid date (Month 13 doesn't exist)
normalizeDate('2024-13-01')
// → null

// Invalid date (Day 32 doesn't exist)
normalizeDate('2024-01-32')
// → null

// Invalid leap year
normalizeDate('2023-02-29')
// → null
```

## Edge Cases

### Null/Empty Input

```typescript
normalizeDate(null)
// → null

normalizeDate('')
// → null

normalizeDate('   ')
// → null
```

### Invalid Format

```typescript
normalizeDate('not-a-date')
// → null

normalizeDate('99/99/9999')
// → null
```

### Already Normalized

```typescript
normalizeDate('2024-01-30')
// → '2024-01-30'
// (idempotent)
```

## Common Pitfalls

### ❌ Don't rely on ambiguous format detection

Always provide a format hint for ambiguous dates:

```typescript
// Bad: ambiguous
normalizeDate('01/05/2024')
// → Could be Jan 5 or May 1

// Good: explicit hint
normalizeDate('01/05/2024', { inputFormat: 'DD/MM/YYYY' })
// → '2024-05-01'
```

### ❌ Don't forget about partial dates

Decide how to handle partial dates for your use case:

```typescript
// For exact matching, reject partials
normalizeDate('2024', { partialDates: 'reject' })
// → null

// For fuzzy matching, preserve or impute
normalizeDate('2024', { partialDates: 'impute' })
// → '2024-01-01'
```

### ✅ Do use ISO 8601 input when possible

ISO format is unambiguous and always correctly parsed:

```typescript
// Best: ISO format input
normalizeDate('2024-01-30')
// → Always correct
```

### ✅ Do use exact matching after normalization

ISO format enables reliable exact matching:

```typescript
.schema(s => s
  .field('dateOfBirth')
    .type('date')
    .normalizer('date')
)
.matching(m => m
  .field('dateOfBirth')
    .strategy('exact')
    .weight(100)
)
```

## Performance

- **Average:** < 0.5ms per date
- **Complexity:** O(n) where n is the length of the date string
- **Memory:** Minimal allocation

## Combining with Comparators

### Recommended: Exact Match

```typescript
const resolver = HaveWeMet.create<Person>()
  .schema(s => s
    .field('dateOfBirth')
      .type('date')
      .normalizer('date', {
        partialDates: 'impute',
        inputFormat: 'MM/DD/YYYY'
      })
  )
  .matching(m => m
    .field('dateOfBirth')
      .strategy('exact')
      .weight(100)
  )
  .build()
```

### Alternative: Year-Only Matching

For partial date matching, extract and compare components:

```typescript
.schema(s => s
  .field('birthYear')
    .type('string')
    .customNormalizer(value => {
      const normalized = normalizeDate(value, { outputFormat: 'components' })
      return normalized?.year?.toString() || null
    })
)
.matching(m => m
  .field('birthYear')
    .strategy('exact')
    .weight(50)
)
```

## Integration Example

```typescript
import { HaveWeMet } from 'have-we-met'

interface Patient {
  id: string
  fullName: string
  dateOfBirth: string
}

const resolver = HaveWeMet.create<Patient>()
  .schema(s => s
    .field('fullName')
      .type('name')
      .normalizer('name')
    .field('dateOfBirth')
      .type('date')
      .normalizer('date', {
        partialDates: 'reject',
        inputFormat: 'MM/DD/YYYY'
      })
  )
  .matching(m => m
    .field('fullName')
      .strategy('jaro-winkler')
      .weight(60)
    .field('dateOfBirth')
      .strategy('exact')
      .weight(40)
  )
  .thresholds({ noMatch: 20, definiteMatch: 80 })
  .build()

// These will match after normalization:
const input = {
  id: 'in',
  fullName: 'John Smith',
  dateOfBirth: '01/15/1985'
}

const candidates = [
  {
    id: 'c1',
    fullName: 'John Smith',
    dateOfBirth: '1985-01-15'
  }
]

const result = resolver.resolve(input, candidates)
// result.outcome → 'match'
```

## Real-World Scenarios

### Scenario 1: Patient Records

Strict date matching for healthcare:

```typescript
.schema(s => s
  .field('dateOfBirth')
    .type('date')
    .normalizer('date', {
      partialDates: 'reject',  // Require full dates
      validate: true
    })
)
```

### Scenario 2: Historical Records

Allow partial dates for incomplete data:

```typescript
.schema(s => s
  .field('eventDate')
    .type('date')
    .normalizer('date', {
      partialDates: 'preserve',  // Keep year-only dates
      imputeValue: 1
    })
)
```

### Scenario 3: Multi-Source Data

Handle different date formats from various sources:

```typescript
// For US source
const usNormalizer = (value: unknown) =>
  normalizeDate(value, { inputFormat: 'MM/DD/YYYY' })

// For EU source
const euNormalizer = (value: unknown) =>
  normalizeDate(value, { inputFormat: 'DD/MM/YYYY' })

.schema(s => s
  .field('date')
    .type('date')
    .customNormalizer(value => {
      // Try both formats
      return usNormalizer(value) || euNormalizer(value)
    })
)
```

## Best Practices

### ✅ DO

- Use ISO 8601 format for input data when possible
- Provide format hints for ambiguous dates
- Validate dates to catch errors
- Use exact matching after normalization
- Handle partial dates appropriately for your use case

### ❌ DON'T

- Don't rely on automatic format detection for ambiguous dates
- Don't use two-digit years in new data
- Don't ignore validation errors
- Don't use fuzzy matching on dates (except for special cases)

## Limitations

1. **Format ambiguity** - Cannot perfectly detect MM/DD vs DD/MM without hints
2. **Two-digit years** - Assumed to be 20XX (may not be correct for all cases)
3. **Locale-specific** - Month names support is limited to English
4. **No timezone handling** - Dates only, no time or timezone support

## See Also

- [Overview](./overview.md) - Normalizer system overview
- [Custom Normalizers](./custom.md) - Creating custom normalizers
- [Name Normalizer](./name.md) - Name normalization
