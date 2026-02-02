# Custom Normalizers

Custom normalizers allow you to implement domain-specific data transformation logic tailored to your use case. This guide explains how to create, use, and register custom normalizers.

## When to Use Custom Normalizers

Consider creating a custom normalizer when:

- **Built-in normalizers don't fit** - Your data has unique formatting requirements
- **Domain-specific logic** - You need specialized transformation rules
- **Custom validation** - You want to reject invalid values based on business logic
- **Proprietary formats** - Your data uses company-specific or industry-specific formats
- **Data cleaning** - You need to apply specific cleaning rules before matching

## Quick Start

### Inline Custom Normalizer

The simplest way to use a custom normalizer:

```typescript
const resolver = HaveWeMet.create<Person>()
  .schema((s) =>
    s
      .field('username')
      .type('string')
      .customNormalizer((value) => {
        if (!value) return null
        return value
          .toString()
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '')
      })
  )
  .matching(/* ... */)
  .build()
```

### Registered Custom Normalizer

For reusable normalizers:

```typescript
import { registerNormalizer } from 'have-we-met'

// Register once
registerNormalizer('username', (value) => {
  if (!value) return null
  return value
    .toString()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
})

// Use anywhere
const resolver = HaveWeMet.create<Person>()
  .schema((s) => s.field('username').type('string').normalizer('username'))
  .build()
```

## Normalizer Function Signature

All normalizers must follow this pattern:

```typescript
type NormalizerFunction<TOptions = any> = (
  value: unknown,
  options?: TOptions
) => unknown | null
```

### Parameters

- **`value: unknown`** - The raw value to normalize (can be any type)
- **`options?: TOptions`** - Optional configuration object

### Return Value

- **Normalized value** - The transformed value
- **`null`** - If the value is invalid or cannot be normalized

## Normalizer Requirements

### 1. Accept `unknown` Input

Always accept `unknown` input type for defensive programming:

```typescript
✅ Good
function normalizeSSN(value: unknown): string | null {
  if (value == null) return null
  const str = String(value)
  // ...
}

❌ Bad
function normalizeSSN(value: string): string | null {
  // Assumes input is always a string
}
```

### 2. Return `null` for Invalid Input

Return `null` for null/undefined input and malformed data:

```typescript
✅ Good
function normalizeSSN(value: unknown): string | null {
  if (value == null) return null

  const str = String(value).replace(/\D/g, '')
  if (str.length !== 9) return null  // Invalid SSN

  return `${str.slice(0, 3)}-${str.slice(3, 5)}-${str.slice(5)}`
}

❌ Bad
function normalizeSSN(value: unknown): string {
  // Doesn't handle null
  return String(value).replace(/\D/g, '')
}
```

### 3. Never Throw Errors

Log warnings and return `null` instead of throwing:

```typescript
✅ Good
function normalizeCurrency(value: unknown): number | null {
  if (value == null) return null

  try {
    const num = parseFloat(String(value).replace(/[$,]/g, ''))
    if (isNaN(num)) return null
    return num
  } catch (error) {
    console.warn('Currency normalization failed:', error)
    return null
  }
}

❌ Bad
function normalizeCurrency(value: unknown): number {
  if (value == null) throw new Error('Value is null')
  return parseFloat(String(value))  // May throw
}
```

### 4. Be Idempotent

Normalizing the same value twice should produce the same result:

```typescript
✅ Good
function normalizeLowercase(value: unknown): string | null {
  if (value == null) return null
  const result = String(value).toLowerCase()
  return result
}

// normalizetwice(value) === normalize(normalize(value))
```

### 5. Be Pure Functions

No side effects - don't modify external state:

```typescript
✅ Good
function normalizeCode(value: unknown): string | null {
  if (value == null) return null
  return String(value).toUpperCase()
}

❌ Bad
let counter = 0
function normalizeCode(value: unknown): string | null {
  counter++  // Side effect!
  return String(value).toUpperCase()
}
```

## Examples

### Example 1: Social Security Number

```typescript
function normalizeSSN(value: unknown): string | null {
  if (value == null) return null

  // Remove all non-digits
  const digits = String(value).replace(/\D/g, '')

  // Validate length
  if (digits.length !== 9) return null

  // Format as XXX-XX-XXXX
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`
}

// Usage
registerNormalizer('ssn', normalizeSSN).schema((s) =>
  s.field('ssn').type('string').normalizer('ssn')
)

// Test
normalizeSSN('123-45-6789') // → '123-45-6789'
normalizeSSN('123456789') // → '123-45-6789'
normalizeSSN('123 45 6789') // → '123-45-6789'
normalizeSSN('invalid') // → null
```

### Example 2: Currency

```typescript
interface CurrencyNormalizerOptions {
  currency?: string
  precision?: number
}

function normalizeCurrency(
  value: unknown,
  options?: CurrencyNormalizerOptions
): number | null {
  if (value == null) return null

  // Remove currency symbols and commas
  const str = String(value).replace(/[$£€¥,]/g, '').trim()

  // Parse as number
  const num = parseFloat(str)
  if (isNaN(num)) return null

  // Apply precision
  const precision = options?.precision ?? 2
  return parseFloat(num.toFixed(precision))
}

// Usage
.schema(s => s
  .field('price')
    .type('number')
    .customNormalizer(value =>
      normalizeCurrency(value, { precision: 2 })
    )
)

// Test
normalizeCurrency('$1,234.56')       // → 1234.56
normalizeCurrency('€999.99')         // → 999.99
normalizeCurrency('1234.567', { precision: 2 })  // → 1234.57
```

### Example 3: Product SKU

```typescript
interface SKUNormalizerOptions {
  prefix?: string
  length?: number
}

function normalizeSKU(
  value: unknown,
  options?: SKUNormalizerOptions
): string | null {
  if (value == null) return null

  // Convert to uppercase, remove whitespace and special chars
  let sku = String(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')

  // Add prefix if specified
  if (options?.prefix && !sku.startsWith(options.prefix)) {
    sku = options.prefix + sku
  }

  // Validate length
  if (options?.length && sku.length !== options.length) {
    return null
  }

  return sku
}

// Usage
registerNormalizer('sku', normalizeSKU).schema((s) =>
  s
    .field('productSKU')
    .type('string')
    .normalizer('sku', { prefix: 'SKU-', length: 11 })
)

// Test
normalizeSKU('abc-123', { prefix: 'SKU-' }) // → 'SKU-ABC123'
normalizeSKU('ABC123', { prefix: 'SKU-' }) // → 'SKU-ABC123'
normalizeSKU('xyz', { length: 3 }) // → 'XYZ'
```

### Example 4: Medical Record Number

```typescript
function normalizeMRN(value: unknown): string | null {
  if (value == null) return null

  // Remove all non-alphanumeric
  const mrn = String(value).replace(/[^A-Z0-9]/gi, '').toUpperCase()

  // Must be 8-12 characters
  if (mrn.length < 8 || mrn.length > 12) return null

  // Must start with a letter
  if (!/^[A-Z]/.test(mrn)) return null

  return mrn
}

// Usage
.schema(s => s
  .field('medicalRecordNumber')
    .type('string')
    .customNormalizer(normalizeMRN)
)

// Test
normalizeMRN('MRN-12345678')   // → 'MRN12345678'
normalizeMRN('A12345678')      // → 'A12345678'
normalizeMRN('12345678')       // → null (doesn't start with letter)
normalizeMRN('ABC')            // → null (too short)
```

### Example 5: Email Domain Extraction

```typescript
function extractEmailDomain(value: unknown): string | null {
  if (value == null) return null

  const email = String(value).toLowerCase().trim()

  // Basic email validation
  if (!email.includes('@')) return null

  // Extract domain
  const parts = email.split('@')
  if (parts.length !== 2) return null

  return parts[1]
}

// Usage
.schema(s => s
  .field('emailDomain')
    .type('string')
    .customNormalizer(extractEmailDomain)
)

// Test
extractEmailDomain('john@example.com')     // → 'example.com'
extractEmailDomain('USER@ACME.ORG')        // → 'acme.org'
extractEmailDomain('not-an-email')         // → null
```

## Registering Normalizers

### Basic Registration

```typescript
import { registerNormalizer } from 'have-we-met'

registerNormalizer('myNormalizer', (value) => {
  // Your normalization logic
  return normalizedValue
})
```

### With TypeScript Types

```typescript
interface MyNormalizerOptions {
  option1: string
  option2?: number
}

function myNormalizer(
  value: unknown,
  options?: MyNormalizerOptions
): string | null {
  // Implementation
}

registerNormalizer('myNormalizer', myNormalizer)
```

### Overwriting Existing Normalizers

Registering a normalizer with an existing name will overwrite it (with a warning):

```typescript
registerNormalizer('email', myCustomEmailNormalizer)
// Warning: Normalizer 'email' is already registered. Overwriting.
```

## Using Registered Normalizers

### In Schema

```typescript
.schema(s => s
  .field('myField')
    .type('string')
    .normalizer('myNormalizer')
)
```

### With Options

```typescript
.schema(s => s
  .field('myField')
    .type('string')
    .normalizer('myNormalizer', { option1: 'value' })
)
```

### Listing Available Normalizers

```typescript
import { listNormalizers } from 'have-we-met'

const normalizers = listNormalizers()
console.log(normalizers)
// → ['name', 'email', 'phone', 'address', 'date', 'trim', ...]
```

## Composing Normalizers

### Sequential Composition

Apply multiple normalizations in sequence:

```typescript
import { composeNormalizers } from 'have-we-met'

const normalizer = composeNormalizers(
  (value) => String(value).trim(),
  (value) => String(value).toLowerCase(),
  (value) => String(value).replace(/[^a-z0-9]/g, '')
).schema((s) => s.field('username').type('string').customNormalizer(normalizer))
```

### Manual Composition

```typescript
.schema(s => s
  .field('username')
    .type('string')
    .customNormalizer(value => {
      // Step 1: Trim
      let result = value?.toString().trim()
      if (!result) return null

      // Step 2: Lowercase
      result = result.toLowerCase()

      // Step 3: Remove special chars
      result = result.replace(/[^a-z0-9]/g, '')

      return result || null
    })
)
```

## Testing Custom Normalizers

### Unit Tests

```typescript
import { describe, it, expect } from 'vitest'
import { normalizeSKU } from './normalizers'

describe('SKU Normalizer', () => {
  it('should normalize valid SKUs', () => {
    expect(normalizeSKU('abc-123')).toBe('ABC123')
    expect(normalizeSKU('XYZ 789')).toBe('XYZ789')
  })

  it('should handle null input', () => {
    expect(normalizeSKU(null)).toBeNull()
    expect(normalizeSKU(undefined)).toBeNull()
  })

  it('should handle empty input', () => {
    expect(normalizeSKU('')).toBeNull()
    expect(normalizeSKU('   ')).toBeNull()
  })

  it('should be idempotent', () => {
    const input = 'abc-123'
    const once = normalizeSKU(input)
    const twice = normalizeSKU(once)
    expect(once).toBe(twice)
  })
})
```

## Best Practices

### ✅ DO

- **Handle null gracefully** - Always check for null/undefined
- **Validate input** - Check for invalid formats and return null
- **Document behavior** - Use JSDoc to explain what the normalizer does
- **Test thoroughly** - Test edge cases, null values, and malformed input
- **Keep it simple** - Each normalizer should do one thing well
- **Make it reusable** - Register normalizers you'll use multiple times

### ❌ DON'T

- **Don't throw errors** - Return null instead
- **Don't modify input** - Create new values, don't mutate
- **Don't have side effects** - Keep functions pure
- **Don't over-normalize** - Preserve meaningful information
- **Don't assume types** - Always treat input as `unknown`

## Common Patterns

### Pattern 1: Null Checking

```typescript
function myNormalizer(value: unknown): string | null {
  // Always check for null/undefined first
  if (value == null) return null

  // Convert to string safely
  const str = String(value)

  // Check for empty after trimming
  const trimmed = str.trim()
  if (!trimmed) return null

  // Normalize
  return trimmed.toLowerCase()
}
```

### Pattern 2: Validation

```typescript
function myNormalizer(value: unknown): string | null {
  if (value == null) return null

  const str = String(value)

  // Validate format
  if (!/^[A-Z]{2}\d{6}$/.test(str)) {
    return null // Invalid format
  }

  return str
}
```

### Pattern 3: Options with Defaults

```typescript
interface MyNormalizerOptions {
  uppercase?: boolean
  removeSpaces?: boolean
}

function myNormalizer(
  value: unknown,
  options?: MyNormalizerOptions
): string | null {
  if (value == null) return null

  // Apply defaults
  const opts = {
    uppercase: options?.uppercase ?? true,
    removeSpaces: options?.removeSpaces ?? false,
  }

  let result = String(value)

  if (opts.uppercase) {
    result = result.toUpperCase()
  }

  if (opts.removeSpaces) {
    result = result.replace(/\s/g, '')
  }

  return result
}
```

## Advanced Examples

### Conditional Normalization

```typescript
function normalizeByCountry(
  value: unknown,
  options?: { country: string }
): string | null {
  if (value == null) return null

  const country = options?.country || 'US'

  switch (country) {
    case 'US':
      return normalizeUSPhone(value)
    case 'UK':
      return normalizeUKPhone(value)
    default:
      return String(value)
  }
}
```

### Normalization with Fallback

```typescript
function normalizeWithFallback(value: unknown): string | null {
  if (value == null) return null

  // Try primary normalization
  const primary = tryPrimaryFormat(value)
  if (primary) return primary

  // Try fallback normalization
  const fallback = tryFallbackFormat(value)
  if (fallback) return fallback

  // Give up
  return null
}
```

## See Also

- [Overview](./overview.md) - Normalizer system overview
- [Name Normalizer](./name.md) - Built-in name normalizer
- [Email Normalizer](./email.md) - Built-in email normalizer
- [Phone Normalizer](./phone.md) - Built-in phone normalizer
