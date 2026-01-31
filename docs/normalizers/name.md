# Name Normalizer

The name normalizer parses and standardizes personal names for matching. It handles titles, suffixes, multiple middle names, compound surnames, and proper casing.

## Purpose

Names come in many formats and variations. The name normalizer provides:

- **Title extraction** - Identifies and separates titles (Dr., Mrs., Prof., etc.)
- **Suffix extraction** - Identifies and separates suffixes (Jr., PhD, III, etc.)
- **Component parsing** - Splits names into first, middle, and last components
- **Casing normalization** - Converts to Title Case with special handling for McGregor, O'Brien, etc.
- **Whitespace normalization** - Removes extra spaces and normalizes formatting

## Use Cases

- Matching customer records with name variations
- Deduplicating contact lists with inconsistent name formats
- Standardizing names from different data sources
- Handling names with titles, suffixes, or multiple components

## Function Signature

```typescript
normalizeName(
  value: unknown,
  options?: NameNormalizerOptions
): string | NameComponents | null
```

### Options

```typescript
interface NameNormalizerOptions {
  /** Whether to preserve casing (default: false, converts to Title Case) */
  preserveCase?: boolean
  /** Whether to extract and separate titles (default: true) */
  extractTitles?: boolean
  /** Whether to extract and separate suffixes (default: true) */
  extractSuffixes?: boolean
  /** Whether to normalize whitespace (default: true) */
  normalizeWhitespace?: boolean
  /** Format for output: 'components' or 'full' (default: 'full') */
  outputFormat?: 'components' | 'full'
}
```

### Output Types

```typescript
interface NameComponents {
  title?: string           // Mr., Mrs., Dr., etc.
  first?: string          // First/given name
  middle?: string[]       // Middle name(s)
  last?: string           // Last/family/surname
  suffix?: string         // Jr., Sr., III, PhD, etc.
  full?: string           // Full normalized name
}
```

## Configuration

### Builder API

```typescript
const resolver = HaveWeMet.create<Person>()
  .schema(s => s
    .field('fullName')
      .type('name')
      .normalizer('name', {
        preserveCase: false,
        extractTitles: true,
        extractSuffixes: true,
        outputFormat: 'full'
      })
  )
  .matching(/* ... */)
  .build()
```

### Direct Definition

```typescript
.schema(s => s
  .field('fullName', {
    type: 'name',
    normalizer: 'name',
    normalizerOptions: {
      outputFormat: 'full'
    }
  })
)
```

## Examples

### Basic Normalization

```typescript
import { normalizeName } from 'have-we-met'

// Simple name
normalizeName('john smith')
// → 'John Smith'

// Extra whitespace
normalizeName('  JOHN    SMITH  ')
// → 'John Smith'

// Mixed casing
normalizeName('JoHn sMiTh')
// → 'John Smith'
```

### With Titles

```typescript
normalizeName('Dr. Jane Doe')
// → 'Jane Doe'

normalizeName('Prof. Robert Smith')
// → 'Robert Smith'

normalizeName('dr jane doe', { extractTitles: false })
// → 'Dr Jane Doe'
```

### With Suffixes

```typescript
normalizeName('John Smith Jr.')
// → 'John Smith Jr.'

normalizeName('Dr. John Smith PhD')
// → 'John Smith PhD'

normalizeName('Robert Brown III')
// → 'Robert Brown III'
```

### Middle Names

```typescript
normalizeName('Mary Jane Watson')
// → 'Mary Jane Watson'

normalizeName('John Paul George Ringo')
// → 'John Paul George Ringo'
```

### Component Output

```typescript
normalizeName('Dr. John Michael Smith Jr.', {
  outputFormat: 'components'
})
// → {
//   title: 'Dr.',
//   first: 'John',
//   middle: ['Michael'],
//   last: 'Smith',
//   suffix: 'Jr.',
//   full: 'John Michael Smith Jr.'
// }
```

### Special Cases

```typescript
// Compound surnames (hyphenated)
normalizeName('Jean-Claude Van Damme')
// → 'Jean-Claude Van Damme'

// Names with apostrophes
normalizeName("Patrick O'Brien")
// → "Patrick O'Brien"

// Scottish/Irish names
normalizeName('ANGUS MCGREGOR')
// → 'Angus McGregor'

// Preserve original casing
normalizeName('JOHN SMITH', { preserveCase: true })
// → 'JOHN SMITH'
```

## Recognized Patterns

### Titles

**Common titles:**
- Mr., Mrs., Ms., Miss
- Dr., Prof., Rev.

**Academic:**
- PhD, MD, DDS, Esq.

**Military:**
- Capt., Lt., Col., Gen., Sgt., Maj.

Titles are case-insensitive and the trailing period is optional.

### Suffixes

**Generational:**
- Jr., Sr., II, III, IV, V, etc.

**Academic:**
- PhD, MD, DDS, JD, MBA, etc.

**Professional:**
- Esq., CPA, PE, etc.

## Parsing Logic

The name normalizer uses the following logic:

1. **Extract titles** - Remove recognized titles from the beginning
2. **Extract suffixes** - Remove recognized suffixes from the end
3. **Split components** - Split remaining text by whitespace
4. **Assign components:**
   - Single token → last name only
   - Two tokens → first + last
   - Three+ tokens → first + middle(s) + last
5. **Apply casing** - Convert to Title Case (unless `preserveCase: true`)
6. **Format output** - Return full string or components object

## Edge Cases

### Null/Empty Input

```typescript
normalizeName(null)
// → null

normalizeName('')
// → null

normalizeName('   ')
// → null
```

### Single Name

```typescript
normalizeName('Madonna')
// → 'Madonna'

normalizeName('Prince')
// → 'Prince'
```

### Very Long Names

```typescript
normalizeName('Pablo Diego José Francisco de Paula Juan Nepomuceno María de los Remedios Cipriano de la Santísima Trinidad Ruiz y Picasso')
// → 'Pablo Diego José Francisco De Paula Juan Nepomuceno María De Los Remedios Cipriano De La Santísima Trinidad Ruiz Y Picasso'
```

## Common Pitfalls

### ❌ Don't rely on perfect parsing

Name parsing is inherently ambiguous. The normalizer handles common patterns well but may not correctly parse all cultural naming conventions.

```typescript
// Ambiguous: Is "Lee" a middle name or last name?
normalizeName('John Lee Smith')
// → 'John Lee Smith' (treats Lee as middle name)

// Better: Use separate first/last fields if available
```

### ❌ Don't expect perfect title/suffix detection

Less common titles or suffixes may not be recognized.

```typescript
normalizeName('Baron John Smith')
// → 'Baron John Smith' (Baron not recognized as title)
```

### ✅ Do preserve meaningful casing when needed

```typescript
// If name casing is meaningful (e.g., company names), preserve it
normalizeName('eBay Inc', { preserveCase: true })
// → 'eBay Inc'
```

## Performance

- **Average:** < 0.5ms per name
- **Complexity:** O(n) where n is the length of the input string
- **Memory:** Minimal allocation (string operations only)

## Combining with Comparators

### Recommended Pairings

**For fuzzy matching:**
```typescript
.schema(s => s
  .field('fullName')
    .type('name')
    .normalizer('name')
)
.matching(m => m
  .field('fullName')
    .strategy('jaro-winkler')
    .jaroWinklerOptions({ prefixScale: 0.1 })
    .threshold(0.85)
    .weight(100)
)
```

**For exact matching:**
```typescript
.schema(s => s
  .field('fullName')
    .type('name')
    .normalizer('name')
)
.matching(m => m
  .field('fullName')
    .strategy('exact')
    .weight(100)
)
```

**For phonetic matching:**
```typescript
.schema(s => s
  .field('lastName')
    .type('name')
    .normalizer('name')
)
.matching(m => m
  .field('lastName')
    .strategy('metaphone')
    .weight(50)
)
```

## Integration Example

```typescript
import { HaveWeMet } from 'have-we-met'

interface Customer {
  id: string
  fullName: string
}

const resolver = HaveWeMet.create<Customer>()
  .schema(s => s
    .field('fullName')
      .type('name')
      .normalizer('name', {
        extractTitles: true,
        extractSuffixes: true,
        preserveCase: false
      })
  )
  .matching(m => m
    .field('fullName')
      .strategy('jaro-winkler')
      .threshold(0.85)
      .weight(100)
  )
  .thresholds({ noMatch: 20, definiteMatch: 80 })
  .build()

// These will match after normalization:
const input = { id: 'in', fullName: '  DR. JOHN SMITH  ' }
const candidate = { id: 'c1', fullName: 'john smith' }

const result = resolver.resolve(input, [candidate])
// result.outcome → 'match'
// result.bestMatch.score.total → 100
```

## Limitations

1. **Cultural names** - Primarily designed for Western naming conventions (English-speaking countries)
2. **Parsing ambiguity** - Cannot perfectly parse all name formats
3. **Title/suffix coverage** - May not recognize uncommon or regional titles
4. **Order assumptions** - Assumes "First Middle Last" order (not universal)

For international names or specialized requirements, consider using a custom normalizer tailored to your specific needs.

## See Also

- [Overview](./overview.md) - Normalizer system overview
- [Custom Normalizers](./custom.md) - Creating custom normalizers
- [Email Normalizer](./email.md) - Email normalization
