# Golden Record

A golden record (also called a master record or canonical record) is the single, authoritative representation of an entity that consolidates data from multiple source records. When the identity resolution system confirms that multiple records represent the same entity, those records can be merged into a cohesive golden record.

## Overview

### Why Golden Records?

When matching identifies duplicates, you face a choice:

1. **Keep separate**: Maintain duplicate records with linking metadata
2. **Merge**: Consolidate into a single golden record with full history

Golden records provide:

- **Single source of truth**: One authoritative record per entity
- **Data completeness**: Combine partial data from multiple sources
- **Audit trail**: Track which source records contributed each field
- **Reversibility**: Unmerge if a match was incorrect

### When to Merge vs. Keep Separate

**Merge when:**

- You need a unified view for downstream systems
- Source records represent the same entity with complementary data
- You want to reduce data redundancy
- Your workflow benefits from consolidated records

**Keep separate when:**

- Regulatory requirements mandate preserving original records
- Different systems need to maintain their own records
- Match confidence is not high enough
- Source records may need to be updated independently

## Quick Start

### Basic Merge Configuration

```typescript
import { HaveWeMet } from 'have-we-met'
import { prismaAdapter } from 'have-we-met/adapters/prisma'

const resolver = HaveWeMet.create<Customer>()
  .schema((schema) => {
    schema
      .field('firstName', { type: 'name', component: 'first' })
      .field('lastName', { type: 'name', component: 'last' })
      .field('email', { type: 'email' })
      .field('phone', { type: 'phone' })
      .field('addresses', { type: 'array' })
      .field('createdAt', { type: 'date' })
      .field('updatedAt', { type: 'date' })
  })
  .blocking((block) => block.onField('lastName', { transform: 'soundex' }))
  .matching((match) => {
    match
      .field('email')
      .strategy('exact')
      .weight(20)
      .field('firstName')
      .strategy('jaro-winkler')
      .weight(10)
      .field('lastName')
      .strategy('jaro-winkler')
      .weight(10)
      .thresholds({ noMatch: 20, definiteMatch: 45 })
  })
  .merge((merge) =>
    merge
      .timestampField('updatedAt')
      .defaultStrategy('preferNonNull')
      .onConflict('useDefault')
      .field('firstName')
      .strategy('preferLonger')
      .field('lastName')
      .strategy('preferLonger')
      .field('email')
      .strategy('preferNewer')
      .field('phone')
      .strategy('preferNonNull')
      .field('addresses')
      .strategy('union')
  )
  .adapter(prismaAdapter(prisma, { tableName: 'customers' }))
  .build()
```

### Executing a Merge

```typescript
import { MergeExecutor, createMergeBuilder } from 'have-we-met/merge'

// Create source records
const sourceRecords = [
  {
    id: 'rec-001',
    record: {
      firstName: 'Jon',
      lastName: 'Smith',
      email: 'jon.smith@oldmail.com',
      phone: '+1-555-0100',
      addresses: ['123 Main St'],
      createdAt: new Date('2023-01-01'),
      updatedAt: new Date('2023-06-01'),
    },
    createdAt: new Date('2023-01-01'),
    updatedAt: new Date('2023-06-01'),
  },
  {
    id: 'rec-002',
    record: {
      firstName: 'Jonathan',
      lastName: 'Smith',
      email: 'jonathan.smith@newmail.com',
      phone: null,
      addresses: ['456 Oak Ave'],
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
    },
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  },
]

// Execute the merge
const result = await executor.merge({
  sourceRecords,
  mergedBy: 'admin-user',
})

// The golden record
console.log(result.goldenRecord)
// {
//   firstName: 'Jonathan',    // preferLonger selected this
//   lastName: 'Smith',
//   email: 'jonathan.smith@newmail.com',  // preferNewer selected this
//   phone: '+1-555-0100',     // preferNonNull selected this
//   addresses: ['123 Main St', '456 Oak Ave'],  // union combined these
//   ...
// }
```

## Merge Builder API

The merge builder provides a fluent API for configuring merge strategies.

### MergeBuilder Methods

#### `timestampField(field: string)`

Sets the field used for temporal strategies (`preferNewer`, `preferOlder`).

```typescript
.merge(merge => merge
  .timestampField('updatedAt')  // Use updatedAt for age-based decisions
)
```

#### `defaultStrategy(strategy: MergeStrategy)`

Sets the default strategy for fields without explicit configuration.

```typescript
.merge(merge => merge
  .defaultStrategy('preferNonNull')  // Default for unconfigured fields
)
```

Available strategies:

- `preferFirst`, `preferLast`
- `preferNewer`, `preferOlder`
- `preferNonNull`
- `preferLonger`, `preferShorter`
- `concatenate`, `union`
- `mostFrequent`
- `average`, `sum`, `min`, `max`
- `custom`

See [Merge Strategies](./merge-strategies.md) for detailed descriptions.

#### `onConflict(mode: ConflictResolution)`

Determines how conflicts are handled when a strategy cannot decide.

```typescript
.merge(merge => merge
  .onConflict('useDefault')  // Use default strategy for conflicts
)
```

Modes:

- `'useDefault'` - Apply the default strategy to resolve
- `'error'` - Throw an error when conflict cannot be resolved
- `'markConflict'` - Mark the conflict without resolving

#### `trackProvenance(enabled: boolean)`

Enables or disables provenance tracking (default: `true`).

```typescript
.merge(merge => merge
  .trackProvenance(true)  // Track field-level attribution
)
```

#### `field(fieldPath: string)`

Starts configuring a specific field's merge strategy.

```typescript
.merge(merge => merge
  .field('email').strategy('preferNewer')
  .field('address.city').strategy('preferNonNull')  // Supports dot notation
)
```

### FieldMergeBuilder Methods

#### `strategy(strategy: MergeStrategy)`

Sets the merge strategy for the field.

```typescript
.field('firstName').strategy('preferLonger')
```

#### `custom<V>(fn: (values: V[], records: SourceRecord[]) => V)`

Sets a custom merge function for the field.

```typescript
.field('fullName').custom((values, records) => {
  // Custom logic: prefer the most complete name
  return values.reduce((best, current) => {
    const currentParts = (current || '').split(' ').length
    const bestParts = (best || '').split(' ').length
    return currentParts > bestParts ? current : best
  }, '')
})
```

#### `options(opts: FieldMergeOptions)`

Sets options for the merge strategy.

```typescript
.field('tags').strategy('concatenate').options({
  removeDuplicates: true,
  separator: ','
})

.field('lastModified').strategy('preferNewer').options({
  dateField: 'lastModified'  // Override global timestampField
})
```

Available options:

- `separator?: string` - Separator for concatenate strategy
- `dateField?: string` - Date field for temporal strategies
- `nullHandling?: 'skip' | 'include' | 'preferNull'` - How to handle null values
- `removeDuplicates?: boolean` - Remove duplicates when concatenating

## Merge Result

The merge operation returns a comprehensive result:

```typescript
interface MergeResult<T> {
  goldenRecord: T // The merged record
  goldenRecordId: string // ID of the golden record
  provenance: Provenance // Field-level attribution
  sourceRecords: SourceRecord<T>[] // Original records
  conflicts: MergeConflict[] // Any conflicts encountered
  stats: MergeStats // Merge statistics
}
```

### Accessing Provenance

```typescript
const result = await executor.merge({ sourceRecords, mergedBy: 'admin' })

// Which source contributed each field?
for (const [field, attribution] of Object.entries(
  result.provenance.fieldSources
)) {
  console.log(
    `${field}: from ${attribution.sourceRecordId} (${attribution.strategyApplied})`
  )
}

// Output:
// firstName: from rec-002 (preferLonger)
// lastName: from rec-001 (preferFirst)
// email: from rec-002 (preferNewer)
// phone: from rec-001 (preferNonNull)
```

### Handling Conflicts

```typescript
if (result.conflicts.length > 0) {
  for (const conflict of result.conflicts) {
    console.log(`Conflict in ${conflict.field}:`)
    console.log(`  Values: ${JSON.stringify(conflict.values)}`)
    console.log(`  Resolution: ${conflict.resolution}`)
    console.log(`  Final value: ${conflict.resolvedValue}`)
  }
}
```

## Best Practices

### 1. Choose Appropriate Strategies

Match strategies to your data semantics:

| Field Type | Recommended Strategy          | Reason                                 |
| ---------- | ----------------------------- | -------------------------------------- |
| Names      | `preferLonger`                | "Jonathan" is more complete than "Jon" |
| Email      | `preferNewer`                 | Most recent email is likely current    |
| Phone      | `preferNonNull`               | Any phone is better than none          |
| Addresses  | `union`                       | Keep all known addresses               |
| Dates      | `preferOlder` for birth dates | Original date is correct               |
| Counts     | `max` or `sum`                | Depends on semantics                   |

### 2. Configure Timestamp Field

Always set `timestampField` when using temporal strategies:

```typescript
.merge(merge => merge
  .timestampField('updatedAt')  // Required for preferNewer/preferOlder
  .field('email').strategy('preferNewer')
)
```

### 3. Enable Provenance Tracking

Keep provenance enabled for audit and unmerge capabilities:

```typescript
.merge(merge => merge
  .trackProvenance(true)  // Default, but be explicit
)
```

### 4. Handle Edge Cases

Consider null handling for each field:

```typescript
.field('middleName').strategy('preferNonNull').options({
  nullHandling: 'skip'  // Skip null values, use first non-null
})
```

### 5. Test Your Configuration

Validate merge results match expectations:

```typescript
// In tests
const result = await executor.merge({ sourceRecords, mergedBy: 'test' })

expect(result.goldenRecord.firstName).toBe('Jonathan') // preferLonger
expect(result.goldenRecord.phone).toBe('+1-555-0100') // preferNonNull
expect(result.goldenRecord.addresses).toHaveLength(2) // union
```

## Integration with Review Queue

Merges can be triggered from review queue decisions:

```typescript
// When a reviewer confirms a match and requests merge
await resolver.queue.merge('queue-item-id', {
  selectedMatchId: 'match-record-id',
  notes: 'Confirmed duplicate, merging records',
  decidedBy: 'reviewer@example.com',
})

// The queue merge handler executes the merge using configured strategies
// Provenance includes the queue item reference for audit
```

See [Review Queue](./review-queue.md) for complete queue integration details.

## Error Handling

```typescript
import {
  MergeValidationError,
  MergeConflictError,
  SourceRecordNotFoundError,
} from 'have-we-met/merge'

try {
  const result = await executor.merge({ sourceRecords, mergedBy: 'admin' })
} catch (error) {
  if (error instanceof MergeValidationError) {
    console.error('Invalid merge configuration:', error.message)
  } else if (error instanceof MergeConflictError) {
    console.error('Unresolvable conflict:', error.field, error.values)
  } else if (error instanceof SourceRecordNotFoundError) {
    console.error('Source record not found:', error.recordId)
  }
}
```

## Next Steps

- [Merge Strategies](./merge-strategies.md): Detailed guide to all built-in strategies
- [Provenance](./provenance.md): Audit trail and field attribution
- [Unmerge](./unmerge.md): Reversing incorrect merges
- [Review Queue](./review-queue.md): Human-in-the-loop workflows
