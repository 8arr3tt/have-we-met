# Address Normalizer

The address normalizer parses and standardizes physical addresses for matching. It handles street addresses, cities, states, postal codes, and common abbreviations.

## Purpose

Physical addresses vary widely in format and representation:

- `123 Main Street, Anytown, California 90210`
- `123 Main St, Anytown, CA 90210`
- `123 MAIN ST APT 4B ANYTOWN CA 90210`

The address normalizer provides consistent formatting and component extraction for reliable matching.

## Important Note

⚠️ **Address parsing is inherently ambiguous and complex.** This normalizer handles common US/Canada formats well but has limitations:

- Primarily designed for US and Canadian addresses
- Uses heuristics (no single "correct" algorithm)
- Does NOT perform geocoding or USPS verification
- Does NOT validate addresses against external databases
- International addresses may require custom normalizers

## Function Signature

```typescript
normalizeAddress(
  value: unknown,
  options?: AddressNormalizerOptions
): string | AddressComponents | null
```

### Options

```typescript
interface AddressNormalizerOptions {
  /** Default country if not specified (default: "US") */
  defaultCountry?: string
  /** Whether to abbreviate street types (Street → St) (default: true) */
  abbreviateStreetTypes?: boolean
  /** Whether to abbreviate state names (default: true) */
  abbreviateStates?: boolean
  /** Whether to normalize casing (default: true) */
  normalizeCase?: boolean
  /** Format for output: 'full' or 'components' (default: 'full') */
  outputFormat?: 'full' | 'components'
}
```

### Output Types

```typescript
interface AddressComponents {
  street?: string // Street address (number + name)
  streetNumber?: string // Street number only
  streetName?: string // Street name only
  unit?: string // Apartment/unit/suite number
  city?: string // City name
  state?: string // State/province (abbreviated if US/Canada)
  postalCode?: string // ZIP/postal code (formatted)
  country?: string // Country code (ISO 3166-1 alpha-2)
  full?: string // Full normalized address
}
```

## Configuration

### Builder API

```typescript
const resolver = HaveWeMet.create<Person>()
  .schema((s) =>
    s.field('address').type('address').normalizer('address', {
      abbreviateStreetTypes: true,
      abbreviateStates: true,
      normalizeCase: true,
    })
  )
  .matching(/* ... */)
  .build()
```

### Direct Definition

```typescript
.schema(s => s
  .field('address', {
    type: 'address',
    normalizer: 'address',
    normalizerOptions: {
      abbreviateStreetTypes: true
    }
  })
)
```

## Examples

### Basic Normalization

```typescript
import { normalizeAddress } from 'have-we-met'

// Simple address
normalizeAddress('123 Main Street, Anytown, CA 90210')
// → '123 Main St, Anytown, CA 90210'

// All uppercase
normalizeAddress('123 MAIN STREET, ANYTOWN, CALIFORNIA 90210')
// → '123 Main St, Anytown, CA 90210'

// Extra whitespace
normalizeAddress('123  Main   St,  Anytown,  CA  90210')
// → '123 Main St, Anytown, CA 90210'
```

### With Apartment/Unit

```typescript
normalizeAddress('123 Main St Apt 4B, Anytown, CA 90210')
// → '123 Main St Apt 4B, Anytown, CA 90210'

normalizeAddress('123 Main Street Suite 100, Anytown, CA 90210')
// → '123 Main St Ste 100, Anytown, CA 90210'

normalizeAddress('123 Main St #2, Anytown, CA 90210')
// → '123 Main St #2, Anytown, CA 90210'
```

### State Abbreviation

```typescript
// Full state name to abbreviation
normalizeAddress('123 Main St, Anytown, California 90210')
// → '123 Main St, Anytown, CA 90210'

normalizeAddress('456 Oak Ave, Portland, Oregon 97201')
// → '456 Oak Ave, Portland, OR 97201'

// Keep abbreviations
normalizeAddress('123 Main St, Anytown, CA 90210', {
  abbreviateStates: false,
})
// → '123 Main St, Anytown, California 90210'
```

### Street Type Abbreviation

```typescript
normalizeAddress('123 Main Street, Anytown, CA 90210')
// → '123 Main St, Anytown, CA 90210'

normalizeAddress('456 Oak Avenue, Portland, OR 97201')
// → '456 Oak Ave, Portland, OR 97201'

normalizeAddress('789 Elm Boulevard, Seattle, WA 98101')
// → '789 Elm Blvd, Seattle, WA 98101'
```

### Component Output

```typescript
normalizeAddress('123 Main Street Apt 4B, Anytown, CA 90210', {
  outputFormat: 'components',
})
// → {
//   streetNumber: '123',
//   streetName: 'Main St',
//   street: '123 Main St',
//   unit: 'Apt 4B',
//   city: 'Anytown',
//   state: 'CA',
//   postalCode: '90210',
//   country: 'US',
//   full: '123 Main St Apt 4B, Anytown, CA 90210'
// }
```

### Newline-Delimited Format

```typescript
const address = `123 Main Street
Apartment 4B
Anytown, CA 90210`

normalizeAddress(address)
// → '123 Main St Apt 4B, Anytown, CA 90210'
```

## Supported Abbreviations

### Street Types

| Full Name | Abbreviation |
| --------- | ------------ |
| Street    | St           |
| Avenue    | Ave          |
| Boulevard | Blvd         |
| Road      | Rd           |
| Drive     | Dr           |
| Lane      | Ln           |
| Circle    | Cir          |
| Court     | Ct           |
| Place     | Pl           |
| Parkway   | Pkwy         |
| Highway   | Hwy          |

### Directionals

| Full Name | Abbreviation |
| --------- | ------------ |
| North     | N            |
| South     | S            |
| East      | E            |
| West      | W            |
| Northeast | NE           |
| Northwest | NW           |
| Southeast | SE           |
| Southwest | SW           |

### Unit Types

| Full Name | Abbreviation |
| --------- | ------------ |
| Apartment | Apt          |
| Suite     | Ste          |
| Building  | Bldg         |
| Floor     | Fl           |
| Room      | Rm           |
| Unit      | Unit         |

### US States

All 50 US states and DC are supported for conversion between full names and two-letter codes:

- California ↔ CA
- New York ↔ NY
- Texas ↔ TX
- Florida ↔ FL
- ... (all states)

### Canadian Provinces

Canadian provinces are also supported:

- Ontario ↔ ON
- British Columbia ↔ BC
- Quebec ↔ QC
- Alberta ↔ AB
- ... (all provinces)

## Postal Code Formatting

### US ZIP Codes

```typescript
normalizeAddress('123 Main St, Anytown, CA 90210')
// → '123 Main St, Anytown, CA 90210'

normalizeAddress('123 Main St, Anytown, CA 90210-1234')
// → '123 Main St, Anytown, CA 90210-1234'
```

### Canadian Postal Codes

```typescript
normalizeAddress('123 Main St, Toronto, ON A1B2C3')
// → '123 Main St, Toronto, ON A1B 2C3'

normalizeAddress('123 Main St, Toronto, ON A1B 2C3')
// → '123 Main St, Toronto, ON A1B 2C3'
```

## Edge Cases

### Null/Empty Input

```typescript
normalizeAddress(null)
// → null

normalizeAddress('')
// → null

normalizeAddress('   ')
// → null
```

### Partial Addresses

```typescript
// Missing city/state/ZIP
normalizeAddress('123 Main Street')
// → '123 Main St'

// Just city and state
normalizeAddress('Anytown, CA')
// → 'Anytown, CA'
```

### PO Boxes

```typescript
normalizeAddress('PO Box 123, Anytown, CA 90210')
// → 'PO Box 123, Anytown, CA 90210'
```

## Common Pitfalls

### ❌ Don't expect perfect parsing

Address parsing is ambiguous. The normalizer handles common patterns but may not correctly parse all variations:

```typescript
// Ambiguous: Is "100" part of the street name or unit number?
normalizeAddress('123 Main Street 100, Anytown, CA 90210')
// May parse incorrectly

// Better: Use structured input when available
```

### ❌ Don't use for international addresses without testing

This normalizer is optimized for US/Canada addresses. International addresses have different formats:

```typescript
// May not parse correctly:
normalizeAddress('221B Baker Street, London NW1 6XE, UK')
```

### ❌ Don't expect validation

The normalizer does NOT verify addresses against databases or geocoding services:

```typescript
// Will normalize even if address doesn't exist:
normalizeAddress('123 Fake Street, Nowhere, CA 99999')
// → '123 Fake St, Nowhere, CA 99999'
```

### ✅ Do use fuzzy matching for addresses

Addresses often have legitimate variations. Use Levenshtein or similar:

```typescript
.schema(s => s
  .field('address')
    .type('address')
    .normalizer('address')
)
.matching(m => m
  .field('address')
    .strategy('levenshtein')
    .threshold(0.8)  // Allow some variation
    .weight(100)
)
```

## Performance

- **Average:** < 2ms per address
- **Complexity:** O(n) where n is the length of the address string
- **Memory:** Minimal allocation

## Combining with Comparators

### Recommended: Fuzzy Match

```typescript
const resolver = HaveWeMet.create<Person>()
  .schema((s) =>
    s.field('address').type('address').normalizer('address', {
      abbreviateStreetTypes: true,
      abbreviateStates: true,
    })
  )
  .matching((m) =>
    m.field('address').strategy('levenshtein').threshold(0.85).weight(100)
  )
  .build()
```

### Alternative: Component Matching

Match address components separately for more control:

```typescript
.schema(s => s
  .field('streetAddress')
    .type('string')
    .normalizer('normalizeWhitespace')
  .field('city')
    .type('string')
    .normalizer('lowercase')
  .field('state')
    .type('string')
    .normalizer('uppercase')
  .field('postalCode')
    .type('string')
    .normalizer('numericOnly')
)
.matching(m => m
  .field('streetAddress')
    .strategy('levenshtein')
    .weight(40)
  .field('city')
    .strategy('exact')
    .weight(20)
  .field('state')
    .strategy('exact')
    .weight(20)
  .field('postalCode')
    .strategy('exact')
    .weight(20)
)
```

## Integration Example

```typescript
import { HaveWeMet } from 'have-we-met'

interface Customer {
  id: string
  name: string
  address: string
}

const resolver = HaveWeMet.create<Customer>()
  .schema((s) =>
    s
      .field('name')
      .type('name')
      .normalizer('name')
      .field('address')
      .type('address')
      .normalizer('address', {
        abbreviateStreetTypes: true,
        abbreviateStates: true,
        normalizeCase: true,
      })
  )
  .matching((m) =>
    m
      .field('name')
      .strategy('jaro-winkler')
      .weight(40)
      .field('address')
      .strategy('levenshtein')
      .threshold(0.85)
      .weight(60)
  )
  .thresholds({ noMatch: 20, definiteMatch: 75 })
  .build()

// These will match after normalization:
const input = {
  id: 'in',
  name: 'John Smith',
  address: '123 MAIN STREET, ANYTOWN, CALIFORNIA 90210',
}

const candidates = [
  {
    id: 'c1',
    name: 'John Smith',
    address: '123 Main St, Anytown, CA 90210',
  },
]

const result = resolver.resolve(input, candidates)
// result.outcome → 'match'
```

## Best Practices

### ✅ DO

- Use address normalization for consistency
- Combine with fuzzy matching (Levenshtein)
- Test with your actual address data
- Consider component-based matching for critical applications

### ❌ DON'T

- Don't expect perfect parsing for all formats
- Don't use for non-US/Canada addresses without testing
- Don't rely on validation (there is none)
- Don't use exact matching on full addresses

## Limitations

1. **US/Canada focus** - Primarily designed for North American addresses
2. **No validation** - Does not verify addresses exist or are deliverable
3. **No geocoding** - Does not convert to lat/long coordinates
4. **Parsing ambiguity** - Cannot perfectly parse all address formats
5. **No standardization** - Does not standardize to USPS format

## Future Enhancements

Consider these for advanced address matching:

- **External API integration** - Google Maps, USPS, etc. for validation
- **Geocoding** - Convert to coordinates for distance-based matching
- **International support** - Region-specific parsing for EU, Asia, etc.
- **USPS standardization** - Full CASS certification for US addresses

## See Also

- [Overview](./overview.md) - Normalizer system overview
- [Custom Normalizers](./custom.md) - Creating custom normalizers
- [Phone Normalizer](./phone.md) - Phone normalization
