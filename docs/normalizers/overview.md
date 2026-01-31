# Normalizers Overview

Normalizers are data preprocessing functions that transform raw, messy data into clean, standardized formats optimized for matching. They are a critical component of the identity resolution pipeline, as string similarity algorithms work best with normalized inputs.

## Why Use Normalizers?

Consider trying to match these email addresses without normalization:

```typescript
'John+work@Example.COM'  vs  'john@example.com'
```

Without normalization, these would fail an exact match comparison despite representing the same person. With email normalization (lowercase, trim, plus-addressing removal), they match perfectly.

**Benefits of normalization:**

- **Improved match accuracy** - Reduces false negatives caused by formatting differences
- **Consistent scoring** - Produces more reliable similarity scores across records
- **Better thresholds** - Enables more precise threshold configuration
- **Reduced noise** - Removes irrelevant variations (whitespace, casing, punctuation)

## How Normalizers Work

Normalizers are applied **before** field comparison in the matching pipeline:

```
Raw Input → Normalizer(s) → Normalized Value → Comparator → Similarity Score
```

### Integration with Matching Engine

When you configure a normalizer for a field, the matching engine automatically applies it before comparing values:

```typescript
const resolver = HaveWeMet.create<Person>()
  .schema(s => s
    .field('email')
      .type('email')
      .normalizer('email', { removePlusAddressing: true })
  )
  .matching(m => m
    .field('email')
      .strategy('exact')
      .weight(100)
  )
  .build()

// Input: 'John+work@Example.COM'
// Normalized to: 'john@example.com'
// Compared against: 'john@example.com'
// Result: Exact match!
```

## Built-in Normalizers

### Field-Specific Normalizers

These normalizers are designed for specific data types:

- **`name`** - Parse and standardize personal names (titles, casing, components)
- **`email`** - Normalize email addresses (lowercase, trim, plus-addressing)
- **`phone`** - Normalize phone numbers to E.164 format
- **`address`** - Parse and standardize physical addresses
- **`date`** - Parse various date formats to ISO 8601

### Basic String Normalizers

Simple transformations for general use:

- **`trim`** - Remove leading/trailing whitespace
- **`lowercase`** - Convert to lowercase
- **`uppercase`** - Convert to uppercase
- **`normalizeWhitespace`** - Collapse multiple spaces to one
- **`alphanumericOnly`** - Remove non-alphanumeric characters
- **`numericOnly`** - Remove non-numeric characters

## Configuring Normalizers

### Schema Configuration (Recommended)

Configure normalizers in your schema definition:

```typescript
const resolver = HaveWeMet.create<Person>()
  .schema(s => s
    .field('firstName')
      .type('name')
      .normalizer('name', { preserveCase: false, outputFormat: 'full' })

    .field('email')
      .type('email')
      .normalizer('email', { removePlusAddressing: true })

    .field('phone')
      .type('phone')
      .normalizer('phone', { defaultCountry: 'US' })
  )
  .matching(/* ... */)
  .build()
```

### Direct Field Definition (Alternative)

You can also use the direct definition syntax:

```typescript
.schema(s => s
  .field('email', {
    type: 'email',
    normalizer: 'email',
    normalizerOptions: { removePlusAddressing: true }
  })
)
```

### Custom Normalizers

For domain-specific logic, provide your own normalizer function:

```typescript
.schema(s => s
  .field('username')
    .type('string')
    .customNormalizer(value => {
      if (!value) return null
      return value.toString().toLowerCase().replace(/[^a-z0-9]/g, '')
    })
)
```

See the [Custom Normalizer Guide](./custom.md) for detailed information.

## When to Use Normalizers

### Always Normalize

- **Email addresses** - Always use `email` normalizer for consistent matching
- **Phone numbers** - Always use `phone` normalizer to handle format variations
- **Names** - Use `name` normalizer for proper casing and component parsing
- **Dates** - Use `date` normalizer to handle format variations

### Sometimes Normalize

- **Addresses** - Use `address` normalizer if you need component parsing
- **IDs/Codes** - Use `uppercase` or `alphanumericOnly` for consistent formatting
- **Free text** - Use `trim` and `normalizeWhitespace` to clean up input

### Rarely Normalize

- **Pre-normalized data** - If your data source already normalizes values
- **Case-sensitive fields** - If casing is semantically meaningful
- **Exact format requirements** - If the exact format matters for matching

## Performance Considerations

### Normalization Cost

Normalizers add processing overhead before comparison:

- **Basic normalizers** (trim, lowercase): < 0.001ms per value
- **Simple normalizers** (email, name): < 0.5ms per value
- **Complex normalizers** (phone, address, date): 0.5-2ms per value

### Optimization Strategies

**For real-time matching:**
- Normalizers add < 5ms latency (acceptable for most use cases)
- Use simpler normalizers when possible
- Consider pre-computing normalized values

**For batch processing:**
- Normalization overhead is amortized across many comparisons
- Blocking strategies (Phase 4) reduce total comparison count
- Parallel processing can offset normalization cost

### Pre-computed Normalization

For high-volume systems, consider storing normalized values:

```typescript
// Option 1: Normalize on-the-fly (current approach)
const result = resolver.resolve(input, candidates)

// Option 2: Pre-compute and store (future enhancement)
const normalizedInput = {
  email: normalizeEmail(input.email),
  phone: normalizePhone(input.phone),
  // ...
}
```

## Normalizer Selection Guide

### Common Use Cases

**Customer Data Matching:**
```typescript
.schema(s => s
  .field('firstName').type('name').normalizer('name')
  .field('lastName').type('name').normalizer('name')
  .field('email').type('email').normalizer('email', { removePlusAddressing: true })
  .field('phone').type('phone').normalizer('phone', { defaultCountry: 'US' })
)
```

**Patient Record Matching:**
```typescript
.schema(s => s
  .field('fullName').type('name').normalizer('name')
  .field('dateOfBirth').type('date').normalizer('date', { outputFormat: 'iso' })
  .field('address').type('address').normalizer('address')
  .field('ssn').type('string').normalizer('numericOnly')
)
```

**Contact Deduplication:**
```typescript
.schema(s => s
  .field('name').type('name').normalizer('name')
  .field('email').type('email').normalizer('email')
  .field('phone').type('phone').normalizer('phone', { defaultCountry: 'US' })
  .field('company').type('string').normalizer('trim')
)
```

## Combining Normalizers with Comparators

### Recommended Pairings

| Field Type | Normalizer | Comparator | Rationale |
|------------|------------|------------|-----------|
| Email | `email` | `exact` | Normalized emails should match exactly |
| Phone | `phone` | `exact` | E.164 format enables exact matching |
| Name | `name` | `jaro-winkler` | Handles typos after normalization |
| Address | `address` | `levenshtein` | Handles abbreviation variations |
| Date | `date` | `exact` | ISO format enables exact matching |
| ID/Code | `alphanumericOnly` | `exact` | Removes noise for exact match |

### Example Configuration

```typescript
const resolver = HaveWeMet.create<Person>()
  .schema(s => s
    .field('email').type('email').normalizer('email')
    .field('firstName').type('name').normalizer('name')
    .field('phone').type('phone').normalizer('phone', { defaultCountry: 'US' })
  )
  .matching(m => m
    .field('email')
      .strategy('exact')
      .weight(40)
    .field('firstName')
      .strategy('jaro-winkler')
      .jaroWinklerOptions({ prefixScale: 0.1 })
      .weight(30)
    .field('phone')
      .strategy('exact')
      .weight(30)
  )
  .thresholds({ noMatch: 20, definiteMatch: 75 })
  .build()
```

## Error Handling

Normalizers are designed to be fault-tolerant:

- **Never throw errors** - Return `null` for invalid input instead
- **Graceful degradation** - If normalization fails, original value is used
- **Warning logs** - Engine logs warnings for normalization failures
- **Matching continues** - Errors don't break the matching process

```typescript
// If email normalizer fails, original value is used
const resolver = HaveWeMet.create<Person>()
  .schema(s => s
    .field('email').type('email').normalizer('email')
  )
  .build()

// Input: 'invalid-email' (no @)
// Normalized to: null (invalid format)
// Comparison: null vs 'john@example.com'
// Result: No match (as expected)
```

## Best Practices

### DO

✅ **Use field-specific normalizers** - `email`, `phone`, `name` for their respective fields

✅ **Configure options** - Customize normalizer behavior for your use case

✅ **Test with real data** - Verify normalizers work with your actual data variations

✅ **Document custom normalizers** - Explain what your custom normalizers do

✅ **Handle null gracefully** - Always return `null` for invalid/null input

### DON'T

❌ **Don't over-normalize** - Preserve meaningful information

❌ **Don't chain too many normalizers** - Keep it simple (single normalizer per field)

❌ **Don't normalize in comparators** - Normalization belongs in the schema

❌ **Don't throw errors** - Return `null` instead for fault tolerance

❌ **Don't ignore edge cases** - Test with malformed, null, and unusual input

## Next Steps

- **Learn about specific normalizers**: Browse the reference documentation for each normalizer
- **Explore custom normalizers**: Read the [Custom Normalizer Guide](./custom.md)
- **See examples**: Check out the examples in the integration tests

## Reference Documentation

- [Name Normalizer](./name.md)
- [Email Normalizer](./email.md)
- [Phone Normalizer](./phone.md)
- [Address Normalizer](./address.md)
- [Date Normalizer](./date.md)
- [Custom Normalizers](./custom.md)
