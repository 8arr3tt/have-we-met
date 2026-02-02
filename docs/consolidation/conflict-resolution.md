# Conflict Resolution Guide

## Table of Contents

- [Introduction](#introduction)
- [Source Priority](#source-priority)
- [Merge Strategies](#merge-strategies)
- [Field-Specific Strategies](#field-specific-strategies)
- [Provenance Tracking](#provenance-tracking)
- [Advanced Patterns](#advanced-patterns)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

---

## Introduction

When consolidating records from multiple sources, you'll frequently encounter conflicting values for the same field. Conflict resolution determines which value to use in the final golden record.

### The Conflict Problem

Consider a customer that exists in both CRM and Billing systems:

```typescript
// CRM Record
{
  email: "user@example.com",
  phone: "+1-555-0100",
  address: "123 Main St"
}

// Billing Record
{
  email: "user@example.com",
  phone: "+1-555-0200",      // Different phone!
  address: "456 Oak Ave"       // Different address!
}

// Unified Record - which values to use?
{
  email: "user@example.com",
  phone: ???,                  // Which phone?
  address: ???                 // Which address?
}
```

have-we-met provides flexible conflict resolution through:

1. **Source Priority**: Trust some sources more than others
2. **Merge Strategies**: Field-specific logic for resolving conflicts
3. **Provenance Tracking**: Record which source contributed each value

---

## Source Priority

Source priority assigns a trustworthiness level to each data source. Higher priority sources are preferred when resolving conflicts.

### Setting Source Priority

```typescript
.source('crm', source => source
  .priority(3)  // Highest priority - most trusted
)

.source('billing', source => source
  .priority(2)  // Medium priority
)

.source('legacy', source => source
  .priority(1)  // Lowest priority - least trusted
)

.source('no_priority', source => source
  // No priority set - defaults to 0
)
```

**Priority Scale**:

- Higher numbers = higher priority
- Default = 0
- Can use any integer (positive, negative, or zero)
- Common range: 1-5 for simplicity

### How Source Priority Works

When source priority is enabled, conflicts are resolved by preferring values from higher priority sources:

```typescript
.conflictResolution(cr => cr
  .useSourcePriority(true)  // Enable source priority
)

// Example conflict:
// CRM (priority 3): phone = "+1-555-0100"
// Billing (priority 2): phone = "+1-555-0200"
// Legacy (priority 1): phone = "+1-555-0300"
//
// Result: phone = "+1-555-0100" (from CRM, highest priority)
```

### Disabling Source Priority

```typescript
.conflictResolution(cr => cr
  .useSourcePriority(false)  // Ignore source priority
)

// With priority disabled, merge strategies alone determine the winner
```

### Priority with Merge Strategies

Source priority and merge strategies work together:

```typescript
.conflictResolution(cr => cr
  .useSourcePriority(true)
  .defaultStrategy('preferNonNull')

  // Priority applies first, then merge strategy
)

// Example:
// CRM (priority 3): phone = null
// Billing (priority 2): phone = "+1-555-0200"
//
// With useSourcePriority(true) + preferNonNull:
// Result: phone = "+1-555-0200" (CRM has priority but value is null)
```

### Determining Priority Levels

**Factors to Consider**:

- **Data Completeness**: Sources with more complete data get higher priority
- **Data Freshness**: Systems with more recent data get higher priority
- **Data Accuracy**: Systems with better data quality get higher priority
- **Update Frequency**: Frequently updated systems get higher priority
- **Business Logic**: Critical systems get higher priority

**Example Scenarios**:

```typescript
// Scenario 1: SaaS Multi-Product
.source('crm', source => source.priority(3))        // Master customer database
.source('analytics', source => source.priority(2))  // Usage data
.source('support', source => source.priority(1))    // Support tickets

// Scenario 2: Post-Merger Integration
.source('company_a', source => source.priority(2))  // Acquiring company (current)
.source('company_b', source => source.priority(1))  // Acquired company (legacy)

// Scenario 3: E-commerce
.source('primary_db', source => source.priority(3))  // Primary e-commerce DB
.source('marketplace', source => source.priority(2)) // Marketplace API
.source('vendor_feeds', source => source.priority(1)) // Vendor CSV feeds
```

---

## Merge Strategies

Merge strategies define how to combine conflicting values for a field.

### Available Strategies

#### preferFirst

Use the first value encountered:

```typescript
.defaultStrategy('preferFirst')

// Values: ["value1", "value2", "value3"]
// Result: "value1"
```

**Use when**: Order matters (e.g., sources processed in priority order)

#### preferLast

Use the last value encountered:

```typescript
.defaultStrategy('preferLast')

// Values: ["value1", "value2", "value3"]
// Result: "value3"
```

**Use when**: Latest processed value should win

#### preferNewer

Use the value with the most recent timestamp:

```typescript
.defaultStrategy('preferNewer')

// Values with timestamps:
// ["2024-01-15", "2024-03-20", "2024-02-10"]
// Result: "2024-03-20"
```

**Use when**: Timestamp fields exist, newer data is more accurate

#### preferOlder

Use the value with the oldest timestamp:

```typescript
.defaultStrategy('preferOlder')

// Values with timestamps:
// ["2024-01-15", "2024-03-20", "2024-02-10"]
// Result: "2024-01-15"
```

**Use when**: First-seen value is authoritative (e.g., creation dates)

#### preferNonNull

Use any non-null value:

```typescript
.defaultStrategy('preferNonNull')

// Values: [null, "value2", "value3"]
// Result: "value2"

// All null: [null, null, null]
// Result: null
```

**Use when**: Any data is better than missing data

#### preferLonger

Use the longer string:

```typescript
.defaultStrategy('preferLonger')

// Values: ["John", "Jonathan", "Jon"]
// Result: "Jonathan"
```

**Use when**: Longer strings are more detailed/complete

#### preferShorter

Use the shorter string:

```typescript
.defaultStrategy('preferShorter')

// Values: ["John", "Jonathan", "Jon"]
// Result: "Jon"
```

**Use when**: Shorter strings are more concise/preferred

#### concatenate

Join all values with a delimiter:

```typescript
.defaultStrategy('concatenate')

// Values: ["value1", "value2", "value3"]
// Result: "value1, value2, value3"
```

**Use when**: Want to preserve all values as text

#### union

Combine arrays with unique values:

```typescript
.defaultStrategy('union')

// Values: [["tag1", "tag2"], ["tag2", "tag3"], ["tag3", "tag4"]]
// Result: ["tag1", "tag2", "tag3", "tag4"]
```

**Use when**: Combining arrays (tags, categories, etc.)

#### mostFrequent

Use the most common value:

```typescript
.defaultStrategy('mostFrequent')

// Values: ["value1", "value2", "value1", "value1", "value2"]
// Result: "value1" (appears 3 times)
```

**Use when**: Voting/consensus approach

#### average

Average numeric values:

```typescript
.defaultStrategy('average')

// Values: [10, 20, 30]
// Result: 20
```

**Use when**: Averaging ratings, scores, or measurements

#### sum

Sum numeric values:

```typescript
.defaultStrategy('sum')

// Values: [10, 20, 30]
// Result: 60
```

**Use when**: Totaling quantities, revenues, etc.

#### min

Use minimum value:

```typescript
.defaultStrategy('min')

// Values: [10, 20, 30]
// Result: 10
```

**Use when**: Want lowest value (e.g., lowest price)

#### max

Use maximum value:

```typescript
.defaultStrategy('max')

// Values: [10, 20, 30]
// Result: 30
```

**Use when**: Want highest value (e.g., highest capacity)

### Default Strategy

Set a default strategy applied to all fields:

```typescript
.conflictResolution(cr => cr
  .defaultStrategy('preferNonNull')
)
```

This applies to any field not explicitly configured with a field-specific strategy.

---

## Field-Specific Strategies

Override the default strategy for specific fields:

### Basic Field Strategy

```typescript
.conflictResolution(cr => cr
  .defaultStrategy('preferNonNull')        // Default for all fields
  .fieldStrategy('email', 'preferNewer')   // Email: use newest
  .fieldStrategy('createdAt', 'preferOlder') // Created: use earliest
  .fieldStrategy('tags', 'union')          // Tags: combine all
)
```

### Multiple Field Strategies

```typescript
.conflictResolution(cr => cr
  .defaultStrategy('preferNonNull')

  // Contact info: prefer newer
  .fieldStrategy('email', 'preferNewer')
  .fieldStrategy('phone', 'preferNewer')

  // Historical dates: prefer older
  .fieldStrategy('createdAt', 'preferOlder')
  .fieldStrategy('firstPurchase', 'preferOlder')

  // Arrays: combine all
  .fieldStrategy('tags', 'union')
  .fieldStrategy('categories', 'union')

  // Metrics: sum or average
  .fieldStrategy('totalRevenue', 'sum')
  .fieldStrategy('averageRating', 'average')

  // Text: prefer longer
  .fieldStrategy('description', 'preferLonger')
  .fieldStrategy('bio', 'preferLonger')
)
```

### Custom Merge Functions

Create custom merge logic for complex scenarios:

```typescript
.conflictResolution(cr => cr
  .fieldStrategy('metadata', (values) => {
    // Custom logic: merge all metadata objects
    return values.reduce((acc, val) => ({ ...acc, ...val }), {})
  })

  .fieldStrategy('preferences', (values) => {
    // Custom logic: deep merge preferences
    return deepMerge(...values)
  })
)
```

### Conditional Strategy Selection

```typescript
.conflictResolution(cr => cr
  .fieldStrategy('phone', (values, context) => {
    // Use different strategy based on context
    if (context.sourceIds.includes('crm')) {
      return values.find(v => v.sourceId === 'crm')?.value
    }
    return values[0]?.value
  })
)
```

---

## Provenance Tracking

Provenance tracks which source each field value came from.

### Enabling Provenance

```typescript
.conflictResolution(cr => cr
  .trackProvenance(true)  // Enable provenance tracking (default)
)
```

### Provenance Data Structure

```typescript
interface ProvenanceInfo {
  // Field-level provenance
  fieldProvenance: {
    [fieldName: string]: {
      sourceId: string // Which source this value came from
      sourceRecordId: string // Source record ID
      selectedAt: Date // When this value was selected
      reason: string // Why this value was selected
    }
  }

  // Record-level provenance
  recordProvenance: {
    sourceRecords: Array<{
      sourceId: string
      sourceRecordId: string
      priority: number
    }>
    mergedAt: Date
    matchScore: number
  }
}
```

### Accessing Provenance

```typescript
const result = await consolidation.consolidate()

result.goldenRecords.forEach((record, index) => {
  const provenance = result.provenance[index]

  console.log(`Golden Record: ${record.email}`)
  console.log('Field Sources:')

  Object.entries(provenance.fieldProvenance).forEach(([field, info]) => {
    console.log(`  ${field}: from ${info.sourceId} (${info.reason})`)
  })
})

// Output:
// Golden Record: user@example.com
// Field Sources:
//   email: from crm (source priority)
//   phone: from billing (preferNonNull)
//   address: from crm (source priority)
```

### Storing Provenance

Store provenance in the unified record:

```typescript
interface UnifiedCustomer {
  id?: string
  email: string
  phone?: string

  // Provenance fields
  _provenance?: {
    emailSource?: string
    phoneSource?: string
  }
}

.source('crm', source => source
  .mapping(map => map
    .field('email').from('email')
    .field('phone').from('phone')
    .field('_provenance').transform(input => ({
      emailSource: 'crm',
      phoneSource: 'crm'
    }))
  )
)

.conflictResolution(cr => cr
  .trackProvenance(true)
  .fieldStrategy('_provenance', (values) => {
    // Merge provenance from all sources
    return values.reduce((acc, val) => ({ ...acc, ...val }), {})
  })
)
```

### Disabling Provenance

```typescript
.conflictResolution(cr => cr
  .trackProvenance(false)  // Disable provenance (slight performance gain)
)
```

---

## Advanced Patterns

### Pattern 1: Priority-Based Fallback

Use source priority with fallback to non-null:

```typescript
.conflictResolution(cr => cr
  .useSourcePriority(true)
  .defaultStrategy('preferNonNull')
)

// Resolution process:
// 1. Try highest priority source value
// 2. If null, try next priority source
// 3. Continue until non-null value found
// 4. If all null, result is null
```

### Pattern 2: Field-Specific Priority

Different fields trust different sources:

```typescript
.conflictResolution(cr => cr
  .useSourcePriority(true)

  // Email: trust CRM most
  // (Uses default source priority)

  // Revenue: trust Billing most
  .fieldStrategy('revenue', (values) => {
    const billingValue = values.find(v => v.sourceId === 'billing')
    return billingValue?.value || values[0]?.value
  })

  // Support tier: trust Support system most
  .fieldStrategy('supportTier', (values) => {
    const supportValue = values.find(v => v.sourceId === 'support')
    return supportValue?.value || values[0]?.value
  })
)
```

### Pattern 3: Weighted Voting

Combine values using weighted voting:

```typescript
.conflictResolution(cr => cr
  .fieldStrategy('status', (values, context) => {
    // Count votes, weighted by source priority
    const votes: Record<string, number> = {}

    values.forEach(v => {
      const weight = context.sources[v.sourceId].priority || 1
      votes[v.value] = (votes[v.value] || 0) + weight
    })

    // Return value with most votes
    return Object.entries(votes)
      .sort(([, a], [, b]) => b - a)[0][0]
  })
)
```

### Pattern 4: Timestamp-Based Resolution

Use custom timestamp logic:

```typescript
.conflictResolution(cr => cr
  .fieldStrategy('email', (values) => {
    // Find value with newest updatedAt timestamp
    return values
      .filter(v => v.metadata?.updatedAt)
      .sort((a, b) =>
        b.metadata.updatedAt.getTime() - a.metadata.updatedAt.getTime()
      )[0]?.value || values[0]?.value
  })
)
```

### Pattern 5: Data Quality Scoring

Select based on data quality score:

```typescript
.conflictResolution(cr => cr
  .fieldStrategy('address', (values) => {
    // Compute quality score for each value
    const scored = values.map(v => ({
      value: v.value,
      score: computeAddressQuality(v.value)
    }))

    // Return highest quality address
    return scored.sort((a, b) => b.score - a.score)[0].value
  })
)

function computeAddressQuality(address: string): number {
  let score = 0
  if (address.includes(',')) score += 10  // Has multiple components
  if (/\d{5}/.test(address)) score += 20  // Has zip code
  if (/\d+/.test(address)) score += 15    // Has street number
  return score
}
```

### Pattern 6: Composite Field Merging

Merge nested objects intelligently:

```typescript
interface Customer {
  name: string
  contact: {
    email?: string
    phone?: string
    address?: string
  }
}

.conflictResolution(cr => cr
  .fieldStrategy('contact', (values) => {
    // Merge contact objects field by field
    const merged: any = {}

    // For each contact field, prefer non-null
    values.forEach(v => {
      if (v.value) {
        if (v.value.email && !merged.email) merged.email = v.value.email
        if (v.value.phone && !merged.phone) merged.phone = v.value.phone
        if (v.value.address && !merged.address) merged.address = v.value.address
      }
    })

    return merged
  })
)
```

### Pattern 7: Array Deduplication with Priority

Combine arrays but prioritize values from higher priority sources:

```typescript
.conflictResolution(cr => cr
  .fieldStrategy('tags', (values, context) => {
    // Collect all tags with their source priority
    const tagMap = new Map<string, number>()

    values.forEach(v => {
      const priority = context.sources[v.sourceId].priority || 0
      v.value?.forEach((tag: string) => {
        const existing = tagMap.get(tag) || 0
        tagMap.set(tag, Math.max(existing, priority))
      })
    })

    // Sort by priority (tags from higher priority sources first)
    return Array.from(tagMap.entries())
      .sort(([, a], [, b]) => b - a)
      .map(([tag]) => tag)
  })
)
```

### Pattern 8: Conflict Detection and Flagging

Flag records with conflicts for human review:

```typescript
interface UnifiedCustomer {
  email: string
  phone?: string
  _hasConflicts?: boolean
  _conflicts?: string[]
}

.conflictResolution(cr => cr
  .defaultStrategy('preferNonNull')

  .fieldStrategy('_hasConflicts', (values, context) => {
    // Check if any fields had conflicts
    return context.conflicts.length > 0
  })

  .fieldStrategy('_conflicts', (values, context) => {
    // List fields that had conflicts
    return context.conflicts.map(c => c.fieldName)
  })
)
```

---

## Best Practices

### 1. Define Clear Source Hierarchy

Establish clear priority based on data quality:

```typescript
// Good: Clear hierarchy
.source('crm', source => source.priority(3))        // Master data
.source('billing', source => source.priority(2))    // Financial data
.source('legacy', source => source.priority(1))     // Historical data

// Bad: All same priority
.source('crm', source => source.priority(1))
.source('billing', source => source.priority(1))
.source('legacy', source => source.priority(1))
```

### 2. Use Appropriate Strategies

Match strategy to data type and use case:

```typescript
.conflictResolution(cr => cr
  // Strings: prefer longer (more detail)
  .fieldStrategy('description', 'preferLonger')

  // Dates: prefer older (creation) or newer (updates)
  .fieldStrategy('createdAt', 'preferOlder')
  .fieldStrategy('updatedAt', 'preferNewer')

  // Arrays: union (combine all)
  .fieldStrategy('tags', 'union')

  // Numbers: sum (totals) or average (ratings)
  .fieldStrategy('totalRevenue', 'sum')
  .fieldStrategy('rating', 'average')
)
```

### 3. Handle Null Values

Be explicit about null handling:

```typescript
.conflictResolution(cr => cr
  .defaultStrategy('preferNonNull')  // Skip null values

  // Or use custom logic
  .fieldStrategy('phone', (values) => {
    const nonNull = values.filter(v => v.value != null)
    return nonNull[0]?.value || null
  })
)
```

### 4. Document Priority Decisions

Add comments explaining priority choices:

```typescript
.source('crm', source => source
  .priority(3)  // CRM is source of truth for customer data
)

.source('billing', source => source
  .priority(2)  // Billing has accurate financial data but may lag on profile updates
)

.source('support', source => source
  .priority(1)  // Support data may be outdated or incomplete
)
```

### 5. Test Conflict Resolution

Test with sample conflicting data:

```typescript
function testConflictResolution() {
  const conflicts = [
    {
      field: 'phone',
      values: [
        { sourceId: 'crm', priority: 3, value: '+1-555-0100' },
        { sourceId: 'billing', priority: 2, value: '+1-555-0200' },
      ],
    },
  ]

  // Expected: '+1-555-0100' (CRM has higher priority)
}
```

### 6. Monitor Conflict Rates

Track how often conflicts occur:

```typescript
const result = await consolidation.consolidate()

const conflictStats = {
  totalRecords: result.stats.goldenRecords,
  recordsWithConflicts: result.goldenRecords.filter((r) => r._hasConflicts)
    .length,
  conflictRate: 0,
}

conflictStats.conflictRate =
  (conflictStats.recordsWithConflicts / conflictStats.totalRecords) * 100

console.log(`Conflict rate: ${conflictStats.conflictRate.toFixed(1)}%`)
```

### 7. Use Provenance for Auditing

Enable provenance to audit merge decisions:

```typescript
.conflictResolution(cr => cr
  .trackProvenance(true)
)

// Later, review provenance
result.goldenRecords.forEach((record, index) => {
  const provenance = result.provenance[index]

  if (record._hasConflicts) {
    console.log(`Record ${record.id} had conflicts:`)
    console.log(provenance.fieldProvenance)
  }
})
```

### 8. Progressive Enhancement

Start simple, add complexity as needed:

```typescript
// Start with simple priority-based resolution
.conflictResolution(cr => cr
  .useSourcePriority(true)
  .defaultStrategy('preferNonNull')
)

// Later, add field-specific strategies
.conflictResolution(cr => cr
  .useSourcePriority(true)
  .defaultStrategy('preferNonNull')
  .fieldStrategy('email', 'preferNewer')
  .fieldStrategy('tags', 'union')
)
```

---

## Troubleshooting

### Issue: Unexpected Values in Golden Records

**Symptom**: Golden records contain unexpected values.

**Debugging**:

```typescript
// Enable provenance to see source selection
.conflictResolution(cr => cr
  .trackProvenance(true)
)

// Review provenance
result.goldenRecords.forEach((record, index) => {
  const provenance = result.provenance[index]
  console.log(`Record: ${record.email}`)
  console.log('Sources:')
  Object.entries(provenance.fieldProvenance).forEach(([field, info]) => {
    console.log(`  ${field}: ${info.sourceId} (${info.reason})`)
  })
})
```

### Issue: Null Values Instead of Expected Data

**Symptom**: Fields are null even though source data exists.

**Cause**: Strategy is preferring null values.

**Solution**: Use `preferNonNull` strategy:

```typescript
.conflictResolution(cr => cr
  .defaultStrategy('preferNonNull')
)
```

### Issue: Wrong Source Value Selected

**Symptom**: Lower priority source value used instead of higher priority.

**Debugging**:

```typescript
// Verify source priorities
.source('crm', source => source.priority(3))       // Check priority values
.source('billing', source => source.priority(2))

// Ensure useSourcePriority is enabled
.conflictResolution(cr => cr
  .useSourcePriority(true)  // Must be enabled
)
```

### Issue: Array Fields Not Combining

**Symptom**: Array fields (tags, categories) only show values from one source.

**Solution**: Use `union` strategy:

```typescript
.conflictResolution(cr => cr
  .fieldStrategy('tags', 'union')
  .fieldStrategy('categories', 'union')
)
```

### Issue: Numeric Fields Not Summing

**Symptom**: Numeric totals wrong (showing single source value).

**Solution**: Use `sum` strategy:

```typescript
.conflictResolution(cr => cr
  .fieldStrategy('totalRevenue', 'sum')
  .fieldStrategy('orderCount', 'sum')
)
```

### Issue: Custom Strategy Not Applied

**Symptom**: Custom merge function not being called.

**Debugging**:

```typescript
.fieldStrategy('myField', (values) => {
  console.log('Custom strategy called with:', values)
  return values[0]?.value
})

// If console.log doesn't appear, strategy isn't registered
```

**Solution**: Verify field name matches output schema:

```typescript
interface OutputSchema {
  myField: string  // Must match exactly
}

.fieldStrategy('myField', /* ... */)  // Case-sensitive
```

---

**Previous**: [Schema Mapping](./schema-mapping.md) | **Next**: [Matching Scopes](./matching-scopes.md)
