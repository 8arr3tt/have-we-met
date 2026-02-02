# Schema Mapping Guide

## Table of Contents

- [Introduction](#introduction)
- [Basic Field Mapping](#basic-field-mapping)
- [Transform Functions](#transform-functions)
- [Type Coercion](#type-coercion)
- [Nested Field Access](#nested-field-access)
- [Required vs Optional Fields](#required-vs-optional-fields)
- [Advanced Patterns](#advanced-patterns)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

---

## Introduction

Schema mapping is the process of transforming records from a source schema to your unified output schema. Since different systems use different field names, data types, and structures, schema mapping provides a flexible way to normalize heterogeneous data.

### Why Schema Mapping?

Different systems may represent the same data differently:

```typescript
// Source A: CRM
{
  email_address: "user@example.com",
  first_name: "John",
  last_name: "Smith"
}

// Source B: Billing
{
  email: "user@example.com",
  fname: "John",
  lname: "Smith"
}

// Unified Output
{
  email: "user@example.com",
  firstName: "John",
  lastName: "Smith"
}
```

Schema mapping transforms both sources to the unified format.

### Mapping Types

have-we-met supports three types of field mapping:

1. **Static Field Mapping**: Simple field renaming
2. **Transform Functions**: Computed fields with custom logic
3. **Nested Field Access**: Extract fields from nested objects

---

## Basic Field Mapping

### Simple Field Renaming

The most common mapping: rename a field from source to output.

```typescript
.mapping(map => map
  .field('email').from('email_address')
  .field('firstName').from('first_name')
  .field('lastName').from('last_name')
)
```

This maps:

- Source `email_address` → Output `email`
- Source `first_name` → Output `firstName`
- Source `last_name` → Output `lastName`

### Same-Name Fields

If source and output field names are identical, you still need to specify the mapping:

```typescript
.mapping(map => map
  .field('email').from('email')  // Same name, still required
  .field('phone').from('phone')
)
```

### Multiple Sources, Same Output

Different sources can map different fields to the same output field:

```typescript
// Source A: CRM
.source('crm', source => source
  .mapping(map => map
    .field('email').from('email_address')  // CRM uses 'email_address'
  )
)

// Source B: Billing
.source('billing', source => source
  .mapping(map => map
    .field('email').from('contact_email')  // Billing uses 'contact_email'
  )
)

// Both map to unified 'email' field
```

### Mapping with Type Hints

Provide TypeScript type hints for better type safety:

```typescript
interface SourceSchema {
  email_address: string
  first_name: string
  last_name: string
  age_years: number
}

interface OutputSchema {
  email: string
  firstName: string
  lastName: string
  age: number
}

.source<SourceSchema>('my_source', source => source
  .mapping(map => map
    .field('email').from('email_address')       // TypeScript ensures 'email_address' exists
    .field('firstName').from('first_name')
    .field('lastName').from('last_name')
    .field('age').from('age_years')
  )
)
```

---

## Transform Functions

Transform functions compute output fields using custom logic.

### Basic Transform

Compute a field from one or more source fields:

```typescript
.mapping(map => map
  .field('fullName').transform(input =>
    `${input.first_name} ${input.last_name}`
  )
)
```

The `transform` function receives:

- `input`: The full source record
- `fieldName`: The output field name being computed

### Transform with Conditional Logic

```typescript
.mapping(map => map
  .field('status').transform(input => {
    if (input.is_active && input.email_verified) {
      return 'active'
    } else if (input.is_active) {
      return 'pending'
    } else {
      return 'inactive'
    }
  })
)
```

### Transform with Null Handling

```typescript
.mapping(map => map
  .field('displayName').transform(input => {
    if (input.nickname) {
      return input.nickname
    } else if (input.first_name && input.last_name) {
      return `${input.first_name} ${input.last_name}`
    } else if (input.first_name) {
      return input.first_name
    } else {
      return 'Unknown'
    }
  })
)
```

### Transform with Array Operations

```typescript
.mapping(map => map
  .field('tags').transform(input => {
    // Convert comma-separated string to array
    if (typeof input.tags === 'string') {
      return input.tags.split(',').map(t => t.trim())
    }
    return input.tags || []
  })

  .field('primaryEmail').transform(input => {
    // Extract first email from array
    if (Array.isArray(input.emails) && input.emails.length > 0) {
      return input.emails[0]
    }
    return null
  })
)
```

### Transform with Date Operations

```typescript
.mapping(map => map
  .field('age').transform(input => {
    if (input.date_of_birth) {
      const dob = new Date(input.date_of_birth)
      const now = new Date()
      return now.getFullYear() - dob.getFullYear()
    }
    return null
  })

  .field('accountAge').transform(input => {
    if (input.created_at) {
      const created = new Date(input.created_at)
      const now = new Date()
      const diffMs = now.getTime() - created.getTime()
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
      return diffDays
    }
    return null
  })
)
```

### Transform with Object Merging

```typescript
.mapping(map => map
  .field('metadata').transform(input => ({
    source: 'crm',
    importedAt: new Date(),
    originalId: input.id,
    dataQuality: input.verified ? 'high' : 'low',
    customFields: input.custom_data || {}
  }))
)
```

### Transform with External Functions

```typescript
// External helper function
function normalizePhone(phone: string | null): string | null {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 10) {
    return `+1${digits}`
  } else if (digits.length === 11 && digits[0] === '1') {
    return `+${digits}`
  }
  return phone
}

.mapping(map => map
  .field('phone').transform(input =>
    normalizePhone(input.phone_number)
  )
)
```

### Transform with Type Assertions

```typescript
interface SourceRecord {
  user_type: 'customer' | 'prospect' | 'lead'
  subscription_tier?: 'free' | 'pro' | 'enterprise'
}

.mapping(map => map
  .field('accountType').transform((input: SourceRecord) => {
    if (input.user_type === 'customer') {
      return input.subscription_tier || 'free'
    } else {
      return 'prospect'
    }
  })
)
```

---

## Type Coercion

Type coercion converts values from one type to another during mapping.

### String Coercion

Convert any value to string:

```typescript
.mapping(map => map
  .field('userId').from('user_id').coerce('string')
  .field('accountNumber').from('account_num').coerce('string')
)
```

**Examples**:

- `123` → `"123"`
- `true` → `"true"`
- `null` → `null` (preserved)

### Number Coercion

Convert strings or booleans to numbers:

```typescript
.mapping(map => map
  .field('age').from('age_string').coerce('number')
  .field('revenue').from('revenue_str').coerce('number')
)
```

**Examples**:

- `"42"` → `42`
- `"3.14"` → `3.14`
- `"invalid"` → `NaN`
- `true` → `1`
- `false` → `0`
- `null` → `null` (preserved)

### Boolean Coercion

Convert strings or numbers to booleans:

```typescript
.mapping(map => map
  .field('isActive').from('active_flag').coerce('boolean')
  .field('verified').from('is_verified').coerce('boolean')
)
```

**Examples**:

- `"true"` → `true`
- `"false"` → `false`
- `1` → `true`
- `0` → `false`
- `"yes"` → `true`
- `"no"` → `false`
- `null` → `null` (preserved)

### Date Coercion

Convert strings or numbers to Date objects:

```typescript
.mapping(map => map
  .field('createdAt').from('created_date').coerce('date')
  .field('updatedAt').from('updated_timestamp').coerce('date')
)
```

**Examples**:

- `"2024-01-15"` → `Date(2024-01-15)`
- `"2024-01-15T10:30:00Z"` → `Date(...)`
- `1705315800000` → `Date(...)` (Unix timestamp)
- `"invalid"` → `Invalid Date`
- `null` → `null` (preserved)

### Combining Transform and Coerce

```typescript
.mapping(map => map
  .field('age')
    .transform(input => input.age_string || '0')
    .coerce('number')

  .field('createdAt')
    .transform(input => input.created_date || input.signup_date)
    .coerce('date')
)
```

---

## Nested Field Access

Extract fields from nested objects using dot notation.

### Simple Nested Access

```typescript
interface SourceSchema {
  user: {
    email: string
    profile: {
      firstName: string
      lastName: string
    }
  }
  address: {
    city: string
    state: string
  }
}

.mapping(map => map
  .field('email').from('user.email')
  .field('firstName').from('user.profile.firstName')
  .field('lastName').from('user.profile.lastName')
  .field('city').from('address.city')
  .field('state').from('address.state')
)
```

### Array Access

```typescript
interface SourceSchema {
  emails: string[]
  addresses: Array<{
    type: string
    city: string
  }>
}

.mapping(map => map
  .field('primaryEmail').from('emails[0]')
  .field('homeCity').from('addresses[0].city')
)
```

### Deep Nesting

```typescript
.mapping(map => map
  .field('companyName').from('employment.current.company.name')
  .field('jobTitle').from('employment.current.position.title')
)
```

### Null-Safe Access

If nested fields might be missing, use transform functions for null-safe access:

```typescript
.mapping(map => map
  .field('city').transform(input =>
    input.address?.city || input.billing_address?.city || null
  )

  .field('companyName').transform(input =>
    input.employment?.current?.company?.name || 'Unemployed'
  )
)
```

### Flattening Nested Objects

```typescript
interface SourceSchema {
  contact: {
    email: string
    phone: string
    address: {
      street: string
      city: string
      state: string
      zip: string
    }
  }
}

interface OutputSchema {
  email: string
  phone: string
  street: string
  city: string
  state: string
  zip: string
}

.mapping(map => map
  .field('email').from('contact.email')
  .field('phone').from('contact.phone')
  .field('street').from('contact.address.street')
  .field('city').from('contact.address.city')
  .field('state').from('contact.address.state')
  .field('zip').from('contact.address.zip')
)
```

---

## Required vs Optional Fields

### Marking Required Fields

Mark fields as required to enforce validation:

```typescript
.mapping(map => map
  .field('email').from('email_address').required()
  .field('firstName').from('first_name').required()
  .field('lastName').from('last_name').required()
  .field('phone').from('phone_number')  // Optional (no .required())
)
```

If a required field is missing or null in the source record, the mapping will fail and the record will be skipped.

### Handling Optional Fields

```typescript
.mapping(map => map
  .field('email').from('email_address').required()
  .field('phone').from('phone_number')  // Optional - can be null/undefined
  .field('middleName').from('middle_name')  // Optional
)
```

### Required with Transform

```typescript
.mapping(map => map
  .field('fullName')
    .transform(input => {
      if (!input.first_name || !input.last_name) {
        throw new Error('first_name and last_name are required for fullName')
      }
      return `${input.first_name} ${input.last_name}`
    })
    .required()
)
```

### Default Values for Missing Fields

```typescript
.mapping(map => map
  .field('status').transform(input =>
    input.status || 'pending'  // Default to 'pending' if missing
  )

  .field('tags').transform(input =>
    input.tags || []  // Default to empty array
  )

  .field('metadata').transform(input =>
    input.metadata || {}  // Default to empty object
  )
)
```

---

## Advanced Patterns

### Pattern 1: Multi-Field Computed Value

Compute a field from multiple source fields:

```typescript
.mapping(map => map
  .field('matchScore').transform(input => {
    let score = 0
    if (input.email_verified) score += 30
    if (input.phone_verified) score += 20
    if (input.address_verified) score += 20
    if (input.identity_verified) score += 30
    return score
  })
)
```

### Pattern 2: Source-Specific Metadata

Add metadata identifying the source:

```typescript
.source('crm', source => source
  .mapping(map => map
    .field('email').from('email')
    .field('sourceInfo').transform(input => ({
      sourceSystem: 'crm',
      sourceId: input.id,
      importedAt: new Date(),
      dataQuality: 'high'
    }))
  )
)
```

### Pattern 3: Cross-Field Validation

Validate relationships between fields:

```typescript
.mapping(map => map
  .field('country').from('country_code')
  .field('zipCode').transform(input => {
    const zip = input.postal_code
    const country = input.country_code

    // Validate US zip codes
    if (country === 'US' && zip && !/^\d{5}(-\d{4})?$/.test(zip)) {
      throw new Error(`Invalid US zip code: ${zip}`)
    }

    return zip
  })
)
```

### Pattern 4: Preserving Multiple Source IDs

Track IDs from all source systems:

```typescript
interface UnifiedRecord {
  id?: string
  email: string
  sourceIds: {
    crm?: string
    billing?: string
    support?: string
  }
}

.source('crm', source => source
  .mapping(map => map
    .field('email').from('email')
    .field('sourceIds').transform(input => ({
      crm: input.id
    }))
  )
)

.source('billing', source => source
  .mapping(map => map
    .field('email').from('email')
    .field('sourceIds').transform(input => ({
      billing: input.customer_id
    }))
  )
)

.conflictResolution(cr => cr
  .fieldStrategy('sourceIds', (values) => {
    // Merge all source IDs
    return values.reduce((acc, val) => ({ ...acc, ...val }), {})
  })
)
```

### Pattern 5: Tag Enrichment

Add source-specific tags:

```typescript
.source('crm', source => source
  .mapping(map => map
    .field('email').from('email')
    .field('tags').transform(input => {
      const tags = input.tags || []
      return [...tags, 'crm-customer']
    })
  )
)

.source('billing', source => source
  .mapping(map => map
    .field('email').from('email')
    .field('tags').transform(input => {
      const tags = input.categories || []
      return [...tags, 'paying-customer']
    })
  )
)

.conflictResolution(cr => cr
  .fieldStrategy('tags', 'union')  // Combine all tags
)
```

### Pattern 6: Data Quality Scoring

Compute data quality score during mapping:

```typescript
.mapping(map => map
  .field('dataQualityScore').transform(input => {
    let score = 0
    let maxScore = 0

    // Email (30 points)
    maxScore += 30
    if (input.email && input.email_verified) score += 30
    else if (input.email) score += 15

    // Phone (20 points)
    maxScore += 20
    if (input.phone && input.phone_verified) score += 20
    else if (input.phone) score += 10

    // Address (25 points)
    maxScore += 25
    if (input.address && input.address_verified) score += 25
    else if (input.address) score += 12

    // Name (25 points)
    maxScore += 25
    if (input.first_name && input.last_name) score += 25
    else if (input.first_name || input.last_name) score += 12

    return Math.round((score / maxScore) * 100)
  })
)
```

### Pattern 7: Hierarchical Data Flattening

Flatten hierarchical data into flat structure:

```typescript
interface SourceSchema {
  customer: {
    personal: {
      name: { first: string; last: string }
      contact: {
        email: string
        phone: string
      }
    }
    business: {
      company: string
      title: string
    }
  }
}

interface OutputSchema {
  firstName: string
  lastName: string
  email: string
  phone: string
  company: string
  title: string
}

.mapping(map => map
  .field('firstName').from('customer.personal.name.first')
  .field('lastName').from('customer.personal.name.last')
  .field('email').from('customer.personal.contact.email')
  .field('phone').from('customer.personal.contact.phone')
  .field('company').from('customer.business.company')
  .field('title').from('customer.business.title')
)
```

### Pattern 8: JSON String Parsing

Parse JSON strings into objects:

```typescript
.mapping(map => map
  .field('metadata').transform(input => {
    if (typeof input.metadata_json === 'string') {
      try {
        return JSON.parse(input.metadata_json)
      } catch {
        return {}
      }
    }
    return input.metadata_json || {}
  })

  .field('preferences').transform(input => {
    if (typeof input.preferences === 'string') {
      try {
        return JSON.parse(input.preferences)
      } catch {
        return { notifications: true }
      }
    }
    return input.preferences || { notifications: true }
  })
)
```

---

## Best Practices

### 1. Keep Mappings Simple

Prefer simple field mappings over complex transforms when possible:

```typescript
// Good: Simple and clear
.field('email').from('email_address')

// Avoid: Unnecessarily complex
.field('email').transform(input => input.email_address)
```

### 2. Use Transform for Logic, Not Renaming

Use transforms only when you need computation:

```typescript
// Good: Use from() for simple mapping
.field('email').from('email_address')

// Good: Use transform() for computation
.field('fullName').transform(input =>
  `${input.first_name} ${input.last_name}`
)

// Bad: Using transform for simple mapping
.field('email').transform(input => input.email_address)
```

### 3. Handle Null Values Explicitly

Always handle potential null/undefined values:

```typescript
// Good: Explicit null handling
.field('phone').transform(input =>
  input.phone_number || input.mobile_phone || null
)

// Risky: Might throw if nested field is undefined
.field('city').from('address.city')

// Better: Null-safe with transform
.field('city').transform(input =>
  input.address?.city || null
)
```

### 4. Validate Required Fields

Use `.required()` for fields that must be present:

```typescript
.mapping(map => map
  .field('email').from('email_address').required()
  .field('firstName').from('first_name').required()
  .field('lastName').from('last_name').required()
  .field('phone').from('phone_number')  // Optional
)
```

### 5. Document Complex Transforms

Add comments for complex transformation logic:

```typescript
.mapping(map => map
  // Compute tier based on revenue and employee count
  // Enterprise: $100k+ revenue OR 50+ employees
  // Professional: $10k+ revenue OR 10+ employees
  // Standard: Everyone else
  .field('tier').transform(input => {
    if (input.revenue > 100000 || input.employees > 50) {
      return 'enterprise'
    } else if (input.revenue > 10000 || input.employees > 10) {
      return 'professional'
    } else {
      return 'standard'
    }
  })
)
```

### 6. Use Type Coercion Carefully

Coercion can hide data quality issues. Use sparingly:

```typescript
// Risky: Coercion hides invalid data
.field('age').from('age_string').coerce('number')
// If age_string = "invalid", this becomes NaN

// Better: Validate before coercing
.field('age').transform(input => {
  const parsed = parseInt(input.age_string, 10)
  if (isNaN(parsed) || parsed < 0 || parsed > 150) {
    throw new Error(`Invalid age: ${input.age_string}`)
  }
  return parsed
})
```

### 7. Normalize Data Early

Normalize data during mapping, not later:

```typescript
.mapping(map => map
  // Good: Normalize during mapping
  .field('email').transform(input =>
    input.email_address.toLowerCase().trim()
  )

  .field('phone').transform(input =>
    normalizePhoneNumber(input.phone_number)
  )
)
```

### 8. Use Helper Functions

Extract complex logic into reusable functions:

```typescript
// Helper functions
function normalizeEmail(email: string | null): string | null {
  if (!email) return null
  return email.toLowerCase().trim()
}

function normalizePhone(phone: string | null): string | null {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  return digits.length === 10 ? `+1${digits}` : phone
}

function computeFullName(first: string, last: string, middle?: string): string {
  return middle
    ? `${first} ${middle} ${last}`
    : `${first} ${last}`
}

// Use in mapping
.mapping(map => map
  .field('email').transform(input =>
    normalizeEmail(input.email_address)
  )
  .field('phone').transform(input =>
    normalizePhone(input.phone_number)
  )
  .field('fullName').transform(input =>
    computeFullName(input.first_name, input.last_name, input.middle_name)
  )
)
```

### 9. Test Mappings Independently

Test mapping logic before integration:

```typescript
// Test helper function
function testMapping() {
  const sampleInput = {
    email_address: 'USER@EXAMPLE.COM  ',
    first_name: 'John',
    last_name: 'Smith',
  }

  const mapping = {
    email: normalizeEmail(sampleInput.email_address),
    firstName: sampleInput.first_name,
    lastName: sampleInput.last_name,
  }

  console.log(mapping)
  // { email: 'user@example.com', firstName: 'John', lastName: 'Smith' }
}
```

### 10. Handle Errors Gracefully

Catch and handle errors in transform functions:

```typescript
.field('metadata').transform(input => {
  try {
    return JSON.parse(input.metadata_json)
  } catch (error) {
    console.error(`Failed to parse metadata for record ${input.id}:`, error)
    return {}  // Return default value
  }
})
```

---

## Troubleshooting

### Issue: "Must call field() before from()"

**Cause**: Called `.from()` without calling `.field()` first.

**Solution**:

```typescript
// Wrong
.from('email_address')

// Correct
.field('email').from('email_address')
```

### Issue: "Cannot use both from() and transform()"

**Cause**: Tried to use both static mapping and transform function on same field.

**Solution**: Use one or the other:

```typescript
// Either
.field('email').from('email_address')

// Or
.field('email').transform(input => input.email_address)

// Not both
```

### Issue: "Field 'X' must have either from() or transform()"

**Cause**: Called `.field()` but didn't specify mapping.

**Solution**: Add mapping:

```typescript
.field('email').from('email_address')
// Or
.field('email').transform(input => input.email_address)
```

### Issue: Nested Field Returns Undefined

**Cause**: Nested field doesn't exist in source record.

**Solution**: Use null-safe access:

```typescript
// Instead of
.field('city').from('address.city')

// Use
.field('city').transform(input =>
  input.address?.city || null
)
```

### Issue: Transform Function Throws Error

**Cause**: Source field is missing or has unexpected type.

**Solution**: Add null checking:

```typescript
// Before
.field('fullName').transform(input =>
  `${input.first_name} ${input.last_name}`
)

// After
.field('fullName').transform(input => {
  if (!input.first_name || !input.last_name) {
    return null  // Or throw error if required
  }
  return `${input.first_name} ${input.last_name}`
})
```

### Issue: Coercion Produces NaN or Invalid Date

**Cause**: Source value cannot be coerced to target type.

**Solution**: Validate before coercing:

```typescript
// Before
.field('age').from('age_string').coerce('number')

// After
.field('age').transform(input => {
  const age = parseInt(input.age_string, 10)
  if (isNaN(age)) {
    throw new Error(`Invalid age: ${input.age_string}`)
  }
  return age
})
```

### Issue: Required Field Causes Record to Skip

**Cause**: Required field is null/undefined in source.

**Solution**: Either make field optional or provide default:

```typescript
// Option 1: Make optional
.field('phone').from('phone_number')  // Remove .required()

// Option 2: Provide default
.field('phone').transform(input =>
  input.phone_number || 'N/A'
).required()
```

### Issue: Type Errors with Transform Functions

**Cause**: TypeScript can't infer types correctly.

**Solution**: Add explicit type annotations:

```typescript
interface SourceRecord {
  first_name: string
  last_name: string
}

.field('fullName').transform((input: SourceRecord) =>
  `${input.first_name} ${input.last_name}`
)
```

---

**Previous**: [Getting Started](./getting-started.md) | **Next**: [Conflict Resolution](./conflict-resolution.md)
