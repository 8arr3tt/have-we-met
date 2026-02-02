# Email Normalizer

The email normalizer standardizes email addresses for reliable comparison. It handles casing, whitespace, plus-addressing, Gmail dot normalization, and format validation.

## Purpose

Email addresses can have many superficial differences while referring to the same inbox:

- **Case variations** - `John@Example.COM` vs `john@example.com` (emails are case-insensitive)
- **Whitespace** - `  user@domain.com  ` vs `user@domain.com`
- **Plus-addressing** - `user+tag@domain.com` vs `user@domain.com` (same inbox)
- **Gmail dots** - `john.smith@gmail.com` vs `johnsmith@gmail.com` (Gmail ignores dots)

The email normalizer provides consistent formatting for accurate matching.

## Function Signature

```typescript
normalizeEmail(
  value: unknown,
  options?: EmailNormalizerOptions
): string | EmailComponents | null
```

### Options

```typescript
interface EmailNormalizerOptions {
  /** Whether to remove plus-addressing (user+tag@domain) (default: true) */
  removePlusAddressing?: boolean
  /** Whether to normalize Gmail dots (default: false) */
  normalizeGmailDots?: boolean
  /** Whether to normalize domain (lowercase, trim) (default: true) */
  normalizeDomain?: boolean
  /** Format for output: 'full' or 'components' (default: 'full') */
  outputFormat?: 'full' | 'components'
  /** Whether to validate email format (default: true) */
  validate?: boolean
}
```

### Output Types

```typescript
interface EmailComponents {
  localPart: string // Part before @
  domain: string // Domain name
  full: string // Complete normalized email
  baseName?: string // Local part without plus-addressing
}
```

## Configuration

### Builder API

```typescript
const resolver = HaveWeMet.create<Person>()
  .schema((s) =>
    s.field('email').type('email').normalizer('email', {
      removePlusAddressing: true,
      normalizeGmailDots: false,
      validate: true,
    })
  )
  .matching(/* ... */)
  .build()
```

### Direct Definition

```typescript
.schema(s => s
  .field('email', {
    type: 'email',
    normalizer: 'email',
    normalizerOptions: {
      removePlusAddressing: true
    }
  })
)
```

## Examples

### Basic Normalization

```typescript
import { normalizeEmail } from 'have-we-met'

// Lowercase conversion
normalizeEmail('John@Example.COM')
// → 'john@example.com'

// Whitespace trimming
normalizeEmail('  user@domain.com  ')
// → 'user@domain.com'

// Combined
normalizeEmail('  USER@DOMAIN.COM  ')
// → 'user@domain.com'
```

### Plus-Addressing Removal

Plus-addressing allows users to create email aliases (e.g., `user+newsletter@domain.com`). When enabled (default), the normalizer removes the `+tag` portion:

```typescript
// Remove plus-addressing (default behavior)
normalizeEmail('john+work@example.com')
// → 'john@example.com'

normalizeEmail('user+newsletter@domain.com')
// → 'user@domain.com'

// Keep plus-addressing
normalizeEmail('john+work@example.com', {
  removePlusAddressing: false,
})
// → 'john+work@example.com'
```

### Gmail Dot Normalization

Gmail ignores dots in the local part of email addresses. When enabled, the normalizer removes these dots:

```typescript
// Gmail dot normalization (opt-in)
normalizeEmail('john.smith@gmail.com', {
  normalizeGmailDots: true,
})
// → 'johnsmith@gmail.com'

normalizeEmail('j.o.h.n@gmail.com', {
  normalizeGmailDots: true,
})
// → 'john@gmail.com'

// Only for Gmail domains
normalizeEmail('john.smith@example.com', {
  normalizeGmailDots: true,
})
// → 'john.smith@example.com' (not Gmail, dots preserved)
```

### Component Output

```typescript
normalizeEmail('John+Work@Example.COM', {
  outputFormat: 'components',
})
// → {
//   localPart: 'john',
//   domain: 'example.com',
//   full: 'john@example.com',
//   baseName: 'john'
// }
```

### Validation

```typescript
// Valid email
normalizeEmail('user@example.com', { validate: true })
// → 'user@example.com'

// Invalid email (missing @)
normalizeEmail('notanemail', { validate: true })
// → null

// Invalid email (missing domain)
normalizeEmail('user@', { validate: true })
// → null

// Skip validation
normalizeEmail('invalid', { validate: false })
// → 'invalid' (no validation, returns as-is)
```

## Validation Rules

When `validate: true` (default), the normalizer performs basic RFC 5322 validation:

✅ **Valid formats:**

- `user@domain.com`
- `first.last@example.co.uk`
- `user+tag@subdomain.example.com`
- `user_name@example-site.com`

❌ **Invalid formats:**

- `notanemail` (no @ symbol)
- `user@` (missing domain)
- `@domain.com` (missing local part)
- `user@@domain.com` (multiple @)
- `user @domain.com` (space in local part)

**Note:** This is not full RFC 5322 compliance (which is extremely complex), but catches common format errors.

## Edge Cases

### Null/Empty Input

```typescript
normalizeEmail(null)
// → null

normalizeEmail('')
// → null

normalizeEmail('   ')
// → null
```

### Already Normalized

```typescript
normalizeEmail('john@example.com')
// → 'john@example.com'
// (idempotent - normalizing twice gives same result)
```

### International Domains

```typescript
normalizeEmail('user@münchen.de')
// → 'user@münchen.de'
// (preserves international characters)
```

### Subdomains

```typescript
normalizeEmail('user@mail.company.example.com')
// → 'user@mail.company.example.com'
```

## Common Pitfalls

### ❌ Don't assume all providers support plus-addressing

While Gmail, Outlook, and many modern email providers support plus-addressing, not all do. Some email servers reject emails with `+` in the local part.

```typescript
// Safe default: remove plus-addressing for matching
normalizeEmail('user+tag@example.com', {
  removePlusAddressing: true, // default
})
```

### ❌ Don't normalize Gmail dots for non-Gmail domains

Gmail's dot-ignoring behavior is Gmail-specific. Other providers treat dots as significant.

```typescript
// Only enable for Gmail if needed
normalizeEmail('john.smith@outlook.com', {
  normalizeGmailDots: true,
})
// → 'john.smith@outlook.com' (correctly preserves dots for non-Gmail)
```

### ✅ Do use exact matching after normalization

Once normalized, emails should be compared with exact matching:

```typescript
.schema(s => s
  .field('email')
    .type('email')
    .normalizer('email')
)
.matching(m => m
  .field('email')
    .strategy('exact')  // Use exact after normalization
    .weight(100)
)
```

## Performance

- **Average:** < 0.1ms per email
- **Complexity:** O(n) where n is the length of the email string
- **Memory:** Minimal allocation

## Combining with Comparators

### Recommended: Exact Match

```typescript
const resolver = HaveWeMet.create<Person>()
  .schema((s) =>
    s
      .field('email')
      .type('email')
      .normalizer('email', { removePlusAddressing: true })
  )
  .matching((m) => m.field('email').strategy('exact').weight(100))
  .build()
```

### Alternative: Fuzzy Match (for typos)

If you want to catch email typos, you can use fuzzy matching:

```typescript
.matching(m => m
  .field('email')
    .strategy('levenshtein')
    .threshold(0.9)  // High threshold for emails
    .weight(80)
)
```

## Integration Example

```typescript
import { HaveWeMet } from 'have-we-met'

interface Customer {
  id: string
  email: string
}

const resolver = HaveWeMet.create<Customer>()
  .schema((s) =>
    s.field('email').type('email').normalizer('email', {
      removePlusAddressing: true,
      normalizeGmailDots: false,
      validate: true,
    })
  )
  .matching((m) => m.field('email').strategy('exact').weight(100))
  .thresholds({ noMatch: 20, definiteMatch: 80 })
  .build()

// These will match after normalization:
const input = { id: 'in', email: 'John+work@Example.COM' }
const candidates = [{ id: 'c1', email: 'john@example.com' }]

const result = resolver.resolve(input, candidates)
// result.outcome → 'match'
// result.bestMatch.score.total → 100
```

## Real-World Scenarios

### Scenario 1: User Registration Deduplication

Prevent users from creating multiple accounts with variations of the same email:

```typescript
.schema(s => s
  .field('email')
    .type('email')
    .normalizer('email', {
      removePlusAddressing: true,  // Catch john+tag variations
      normalizeGmailDots: true     // Catch Gmail dot variations
    })
)
```

### Scenario 2: Contact List Deduplication

Merge contacts that have the same email with different formatting:

```typescript
.schema(s => s
  .field('email')
    .type('email')
    .normalizer('email', {
      removePlusAddressing: false,  // Preserve tags (they might be meaningful)
      validate: true
    })
)
```

### Scenario 3: Marketing Campaign Matching

Match email addresses from different sources:

```typescript
.schema(s => s
  .field('email')
    .type('email')
    .normalizer('email', {
      removePlusAddressing: true,
      validate: true
    })
)
.matching(m => m
  .field('email')
    .strategy('exact')
    .weight(50)
  .field('firstName')
    .strategy('jaro-winkler')
    .weight(25)
  .field('lastName')
    .strategy('jaro-winkler')
    .weight(25)
)
```

## Best Practices

### ✅ DO

- Always normalize email addresses before matching
- Use exact matching strategy after normalization
- Enable validation to catch malformed emails
- Consider removePlusAddressing for deduplication use cases

### ❌ DON'T

- Don't enable Gmail dot normalization unless you specifically need it
- Don't use fuzzy matching with low thresholds (too many false positives)
- Don't normalize emails that need to preserve exact formatting
- Don't assume plus-addressing works universally

## See Also

- [Overview](./overview.md) - Normalizer system overview
- [Custom Normalizers](./custom.md) - Creating custom normalizers
- [Name Normalizer](./name.md) - Name normalization
