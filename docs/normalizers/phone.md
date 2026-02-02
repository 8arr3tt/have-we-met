# Phone Normalizer

The phone normalizer parses and standardizes phone numbers to E.164 international format for reliable comparison. It handles various input formats, country codes, and extensions.

## Purpose

Phone numbers come in countless formats:

- `555-123-4567` (US local format)
- `(555) 123-4567` (US formatted)
- `+1 555 123 4567` (international with spaces)
- `1-555-123-4567` (US with country code)
- `+44 20 7123 4567` (UK)

The phone normalizer converts all formats to the standardized E.164 format: `+15551234567`

## Function Signature

```typescript
normalizePhone(
  value: unknown,
  options?: PhoneNormalizerOptions
): string | PhoneComponents | null
```

### Options

```typescript
interface PhoneNormalizerOptions {
  /** Default country code if not present in input (e.g., "US", "GB") */
  defaultCountry?: string
  /** Whether to extract extensions (default: true) */
  extractExtension?: boolean
  /** Format for output: 'e164' or 'components' (default: 'e164') */
  outputFormat?: 'e164' | 'components'
  /** Whether to validate phone number (default: true) */
  validate?: boolean
}
```

### Output Types

```typescript
interface PhoneComponents {
  countryCode?: string // E.164 country code (e.g., "1" for US)
  nationalNumber: string // National number without country code
  extension?: string // Extension number if present
  e164: string // Full E.164 format: +15551234567
}
```

## E.164 Format

E.164 is the international standard for phone numbers:

- **Format:** `+[country code][national number]`
- **Examples:**
  - US: `+15551234567`
  - UK: `+442071234567`
  - Germany: `+4930123456`
  - India: `+919876543210`
- **No spaces, hyphens, or parentheses**
- **Always starts with `+`**

## Configuration

### Builder API

```typescript
const resolver = HaveWeMet.create<Person>()
  .schema((s) =>
    s.field('phone').type('phone').normalizer('phone', {
      defaultCountry: 'US',
      validate: true,
      extractExtension: true,
    })
  )
  .matching(/* ... */)
  .build()
```

### Direct Definition

```typescript
.schema(s => s
  .field('phone', {
    type: 'phone',
    normalizer: 'phone',
    normalizerOptions: {
      defaultCountry: 'US'
    }
  })
)
```

## Examples

### US Phone Numbers

```typescript
import { normalizePhone } from 'have-we-met'

// US local format
normalizePhone('555-123-4567', { defaultCountry: 'US' })
// → '+15551234567'

// US formatted with parentheses
normalizePhone('(555) 123-4567', { defaultCountry: 'US' })
// → '+15551234567'

// US with country code
normalizePhone('1-555-123-4567')
// → '+15551234567'

// US with +1 prefix
normalizePhone('+1 555 123 4567')
// → '+15551234567'
```

### International Numbers

```typescript
// UK
normalizePhone('+44 20 7123 4567')
// → '+442071234567'

// Germany
normalizePhone('+49 30 123456')
// → '+4930123456'

// India
normalizePhone('+91 98765 43210')
// → '+919876543210'

// China
normalizePhone('+86 10 1234 5678')
// → '+86101234567'
```

### With Extensions

```typescript
// Extension with "ext"
normalizePhone('555-1234 ext. 567', {
  defaultCountry: 'US',
  extractExtension: true,
  outputFormat: 'components',
})
// → {
//   countryCode: '1',
//   nationalNumber: '5551234',
//   extension: '567',
//   e164: '+15551234'
// }

// Extension with "x"
normalizePhone('(555) 123-4567 x890', {
  defaultCountry: 'US',
  extractExtension: true,
})
// → '+15551234567' (extension extracted but not in E.164)
```

### Component Output

```typescript
normalizePhone('+1 (555) 123-4567', {
  outputFormat: 'components',
})
// → {
//   countryCode: '1',
//   nationalNumber: '5551234567',
//   e164: '+15551234567'
// }
```

## Country Codes

The normalizer uses the `libphonenumber-js` library, which supports all international country codes:

| Country   | Code | Example        | Normalized    |
| --------- | ---- | -------------- | ------------- |
| US/Canada | +1   | (555) 123-4567 | +15551234567  |
| UK        | +44  | 020 7123 4567  | +442071234567 |
| Germany   | +49  | 030 123456     | +4930123456   |
| France    | +33  | 01 23 45 67 89 | +33123456789  |
| India     | +91  | 98765 43210    | +919876543210 |
| China     | +86  | 10 1234 5678   | +86101234567  |
| Australia | +61  | (02) 1234 5678 | +61212345678  |
| Japan     | +81  | 03-1234-5678   | +81312345678  |

## Default Country

The `defaultCountry` option is crucial for parsing numbers without explicit country codes:

```typescript
// Without defaultCountry - may fail or guess wrong
normalizePhone('555-123-4567')
// → null (ambiguous without country)

// With defaultCountry - assumes US
normalizePhone('555-123-4567', { defaultCountry: 'US' })
// → '+15551234567'

// With defaultCountry - assumes UK
normalizePhone('020 7123 4567', { defaultCountry: 'GB' })
// → '+442071234567'
```

**Best practice:** Always specify `defaultCountry` based on your data source.

## Validation

When `validate: true` (default), the normalizer validates phone number format and length:

```typescript
// Valid US number
normalizePhone('555-123-4567', {
  defaultCountry: 'US',
  validate: true,
})
// → '+15551234567'

// Too short
normalizePhone('123', {
  defaultCountry: 'US',
  validate: true,
})
// → null

// Non-numeric
normalizePhone('not-a-phone', {
  defaultCountry: 'US',
  validate: true,
})
// → null

// Skip validation
normalizePhone('123', {
  validate: false,
})
// → Attempts to format (may succeed or fail)
```

## Edge Cases

### Null/Empty Input

```typescript
normalizePhone(null)
// → null

normalizePhone('')
// → null

normalizePhone('   ')
// → null
```

### Invalid Format

```typescript
normalizePhone('abc-def-ghij', { defaultCountry: 'US' })
// → null

normalizePhone('00000000', { defaultCountry: 'US' })
// → null (invalid US number)
```

### Already Normalized

```typescript
normalizePhone('+15551234567')
// → '+15551234567'
// (idempotent)
```

## Common Pitfalls

### ❌ Don't forget to specify defaultCountry

Without a default country, numbers without explicit country codes cannot be parsed:

```typescript
// Bad: ambiguous
normalizePhone('555-123-4567')
// → null

// Good: explicit country context
normalizePhone('555-123-4567', { defaultCountry: 'US' })
// → '+15551234567'
```

### ❌ Don't assume all numbers are valid

Always check for `null` return value:

```typescript
const normalized = normalizePhone(input, { defaultCountry: 'US' })
if (normalized === null) {
  // Handle invalid phone number
}
```

### ✅ Do use exact matching after normalization

E.164 format enables reliable exact matching:

```typescript
.schema(s => s
  .field('phone')
    .type('phone')
    .normalizer('phone', { defaultCountry: 'US' })
)
.matching(m => m
  .field('phone')
    .strategy('exact')  // Use exact after normalization
    .weight(100)
)
```

### ✅ Do handle extensions separately

Extensions are not part of E.164 format. If you need to match on extensions, store and compare them separately:

```typescript
.schema(s => s
  .field('phoneNumber')
    .type('phone')
    .normalizer('phone', { defaultCountry: 'US' })
  .field('phoneExtension')
    .type('string')
    .normalizer('trim')
)
```

## Performance

- **Average:** < 1ms per phone number
- **Complexity:** Depends on `libphonenumber-js` parsing
- **Memory:** Minimal allocation
- **Library size:** ~200KB (libphonenumber-js)

## Combining with Comparators

### Recommended: Exact Match

```typescript
const resolver = HaveWeMet.create<Person>()
  .schema((s) =>
    s.field('phone').type('phone').normalizer('phone', { defaultCountry: 'US' })
  )
  .matching((m) => m.field('phone').strategy('exact').weight(100))
  .build()
```

### Alternative: Partial Match (last N digits)

For cases where country codes might vary:

```typescript
.matching(m => m
  .field('phone')
    .strategy('levenshtein')
    .threshold(0.7)  // Allow some variation
    .weight(80)
)
```

## Integration Example

```typescript
import { HaveWeMet } from 'have-we-met'

interface Contact {
  id: string
  name: string
  phone: string
}

const resolver = HaveWeMet.create<Contact>()
  .schema((s) =>
    s
      .field('name')
      .type('name')
      .normalizer('name')
      .field('phone')
      .type('phone')
      .normalizer('phone', {
        defaultCountry: 'US',
        validate: true,
        extractExtension: false,
      })
  )
  .matching((m) =>
    m
      .field('name')
      .strategy('jaro-winkler')
      .weight(40)
      .field('phone')
      .strategy('exact')
      .weight(60)
  )
  .thresholds({ noMatch: 20, definiteMatch: 75 })
  .build()

// These will match after normalization:
const input = {
  id: 'in',
  name: 'John Smith',
  phone: '(555) 123-4567',
}

const candidates = [
  {
    id: 'c1',
    name: 'John Smith',
    phone: '+1-555-123-4567',
  },
]

const result = resolver.resolve(input, candidates)
// result.outcome → 'match'
```

## Real-World Scenarios

### Scenario 1: Multi-Region Customer Database

Handle phone numbers from different countries:

```typescript
.schema(s => s
  .field('phone')
    .type('phone')
    .normalizer('phone', {
      defaultCountry: 'US',  // Use most common region
      validate: true
    })
)
```

### Scenario 2: Contact Deduplication

Merge contacts with same phone in different formats:

```typescript
.schema(s => s
  .field('phone')
    .type('phone')
    .normalizer('phone', { defaultCountry: 'US' })
)
.matching(m => m
  .field('phone')
    .strategy('exact')
    .weight(100)
)
```

### Scenario 3: International Business Directory

Support multiple countries with region detection:

```typescript
// For US/Canada numbers
const usResolver = HaveWeMet.create<Business>()
  .schema((s) =>
    s.field('phone').type('phone').normalizer('phone', { defaultCountry: 'US' })
  )
  .build()

// For UK numbers
const ukResolver = HaveWeMet.create<Business>()
  .schema((s) =>
    s.field('phone').type('phone').normalizer('phone', { defaultCountry: 'GB' })
  )
  .build()
```

## Best Practices

### ✅ DO

- Always specify `defaultCountry` for your data source
- Use E.164 output format for consistent matching
- Enable validation to catch invalid numbers
- Use exact matching strategy after normalization

### ❌ DON'T

- Don't assume numbers without country codes will parse correctly
- Don't use fuzzy matching on normalized E.164 numbers
- Don't include extensions in the main phone field
- Don't normalize phone numbers that need to preserve original format

## Limitations

1. **Requires country context** - Cannot parse ambiguous numbers without `defaultCountry`
2. **Extension handling** - Extensions are extracted but not part of E.164 output
3. **Historical numbers** - May not validate very old or special phone numbers
4. **Premium numbers** - May not distinguish premium-rate numbers

## Dependencies

The phone normalizer uses `libphonenumber-js`, a lightweight (~200KB) JavaScript port of Google's libphonenumber library. It handles:

- International phone number parsing
- Country code detection
- Format validation
- E.164 formatting

## See Also

- [Overview](./overview.md) - Normalizer system overview
- [Custom Normalizers](./custom.md) - Creating custom normalizers
- [Email Normalizer](./email.md) - Email normalization
