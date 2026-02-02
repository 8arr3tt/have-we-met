# Unmerge

Unmerging reverses a golden record merge, restoring the original source records. This is essential for correcting false positives where records were incorrectly identified as duplicates.

## Overview

### When to Unmerge

Unmerge when:

- A merge was a **false positive** (records were different entities)
- Data quality issues require starting over
- Business rules change and records should be separate
- Compliance requires preserving original records

### Prerequisites

Unmerge requires:

1. **Provenance**: The merge must have been tracked
2. **Archived source records**: Original records preserved during merge
3. **Unmerge executor**: Configured with provenance store and archive

## Quick Start

### Setting Up Unmerge Infrastructure

```typescript
import {
  MergeExecutor,
  UnmergeExecutor,
  createInMemoryProvenanceStore,
  createInMemorySourceRecordArchive,
  createMergeBuilder,
} from 'have-we-met/merge'

// Create stores
const provenanceStore = createInMemoryProvenanceStore()
const sourceRecordArchive = createInMemorySourceRecordArchive<Customer>()

// Create merge executor
const mergeConfig = createMergeBuilder<Customer>()
  .timestampField('updatedAt')
  .defaultStrategy('preferNonNull')
  .build()

const mergeExecutor = new MergeExecutor<Customer>(mergeConfig)

// Create unmerge executor
const unmergeExecutor = new UnmergeExecutor<Customer>({
  provenanceStore,
  sourceRecordArchive,
  onRecordRestore: async (record) => {
    // Re-insert restored record into database
    await database.insert(record.id, record.record)
  },
  onGoldenRecordDelete: async (goldenRecordId) => {
    // Delete the golden record from database
    await database.delete(goldenRecordId)
  },
})
```

### Performing a Merge (with Unmerge Support)

```typescript
// Execute merge
const mergeResult = await mergeExecutor.merge({
  sourceRecords,
  mergedBy: 'admin',
})

// Archive source records for later unmerge
await sourceRecordArchive.archive(sourceRecords, mergeResult.goldenRecordId)

// Store provenance
await provenanceStore.save(mergeResult.provenance)

// Update database: delete sources, insert golden record
for (const sr of sourceRecords) {
  await database.delete(sr.id)
}
await database.insert(mergeResult.goldenRecordId, mergeResult.goldenRecord)
```

### Executing an Unmerge

```typescript
// Check if unmerge is possible
const canUnmerge = await unmergeExecutor.canUnmerge(goldenRecordId)

if (!canUnmerge.canUnmerge) {
  console.error('Cannot unmerge:', canUnmerge.reason)
  return
}

// Execute unmerge
const unmergeResult = await unmergeExecutor.unmerge({
  goldenRecordId: 'golden-001',
  unmergedBy: 'admin@example.com',
  reason: 'Records were different people with similar names',
})

console.log('Restored records:', unmergeResult.restoredRecords.length)
console.log('Golden record deleted:', unmergeResult.goldenRecordDeleted)
```

## Unmerge Modes

### Full Mode (Default)

Restores all source records and deletes the golden record.

```typescript
const result = await unmergeExecutor.unmerge(
  { goldenRecordId, unmergedBy: 'admin', reason: 'False positive' },
  { mode: 'full' }
)
```

**What happens:**

1. All source records restored to active state
2. Golden record deleted
3. Provenance marked as unmerged
4. Archive entries removed

### Partial Mode

Restores specific source records while keeping the golden record.

```typescript
const result = await unmergeExecutor.unmerge(
  { goldenRecordId, unmergedBy: 'admin', reason: 'Split off one record' },
  {
    mode: 'partial',
    sourceRecordIdsToRestore: ['rec-002'], // Only restore this one
    deleteGoldenRecord: false, // Keep the golden record
  }
)
```

**Use cases:**

- One source was incorrectly merged, others are correct
- Need to separate specific records while maintaining the merge

### Split Mode

Creates a new golden record from a subset of sources.

```typescript
const result = await unmergeExecutor.unmerge(
  { goldenRecordId, unmergedBy: 'admin', reason: 'Split into two groups' },
  {
    mode: 'split',
    sourceRecordIdsToRestore: ['rec-002', 'rec-003'],
    deleteGoldenRecord: false
  }
)

// Now you can merge the split records into a new golden record
await mergeExecutor.merge({
  sourceRecords: result.restoredRecords.map(r => /* ... */),
  mergedBy: 'admin',
})
```

## Checking Unmerge Feasibility

Before attempting unmerge, check if it's possible:

```typescript
const check = await unmergeExecutor.canUnmerge(goldenRecordId)

if (check.canUnmerge) {
  console.log('Unmerge is possible')
  console.log('Provenance found:', !!check.provenance)
} else {
  console.log('Cannot unmerge:', check.reason)
  // Possible reasons:
  // - "No provenance found for golden record"
  // - "Record has already been unmerged"
  // - "N source record(s) not found in archive"
}
```

## Source Record Archive

The archive stores original source records during merge for later restoration.

### SourceRecordArchive Interface

```typescript
interface SourceRecordArchive<T> {
  archive(records: SourceRecord<T>[], goldenRecordId: string): Promise<void>
  get(recordIds: string[]): Promise<SourceRecord<T>[]>
  remove(recordIds: string[]): Promise<void>
  exists(recordIds: string[]): Promise<Map<string, boolean>>
}
```

### In-Memory Archive (Testing)

```typescript
import { createInMemorySourceRecordArchive } from 'have-we-met/merge'

const archive = createInMemorySourceRecordArchive<Customer>()

// Archive records during merge
await archive.archive(sourceRecords, goldenRecordId)

// Check existence
const exists = await archive.exists(['rec-001', 'rec-002'])
console.log('rec-001 exists:', exists.get('rec-001'))

// Retrieve archived records
const archived = await archive.get(['rec-001', 'rec-002'])

// Remove after restore
await archive.remove(['rec-001', 'rec-002'])
```

### Database Archive (Production)

For production, implement archive using your database:

```typescript
class DatabaseSourceRecordArchive<T> implements SourceRecordArchive<T> {
  constructor(private db: Database) {}

  async archive(
    records: SourceRecord<T>[],
    goldenRecordId: string
  ): Promise<void> {
    for (const record of records) {
      await this.db.execute(
        `
        INSERT INTO source_record_archive (id, golden_record_id, record_data, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5)
      `,
        [
          record.id,
          goldenRecordId,
          JSON.stringify(record.record),
          record.createdAt,
          record.updatedAt,
        ]
      )
    }
  }

  async get(recordIds: string[]): Promise<SourceRecord<T>[]> {
    const rows = await this.db.query(
      `
      SELECT id, record_data, created_at, updated_at
      FROM source_record_archive
      WHERE id = ANY($1)
    `,
      [recordIds]
    )

    return rows.map((row) => ({
      id: row.id,
      record: JSON.parse(row.record_data),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }))
  }

  async remove(recordIds: string[]): Promise<void> {
    await this.db.execute(
      `
      DELETE FROM source_record_archive WHERE id = ANY($1)
    `,
      [recordIds]
    )
  }

  async exists(recordIds: string[]): Promise<Map<string, boolean>> {
    const rows = await this.db.query(
      `
      SELECT id FROM source_record_archive WHERE id = ANY($1)
    `,
      [recordIds]
    )

    const existingIds = new Set(rows.map((r) => r.id))
    const result = new Map<string, boolean>()
    for (const id of recordIds) {
      result.set(id, existingIds.has(id))
    }
    return result
  }
}
```

## Unmerge Result

```typescript
interface UnmergeResult<T> {
  restoredRecords: Array<{
    id: string
    record: T
  }>
  originalProvenance: Provenance // For audit
  goldenRecordDeleted: boolean
}
```

### Using Unmerge Result

```typescript
const result = await unmergeExecutor.unmerge({
  goldenRecordId,
  unmergedBy: 'admin',
  reason: 'False positive - different people',
})

// Log restored records
for (const restored of result.restoredRecords) {
  console.log(`Restored: ${restored.id}`)
  console.log(`  Data: ${JSON.stringify(restored.record)}`)
}

// Access original provenance for audit
console.log('Original merge was at:', result.originalProvenance.mergedAt)
console.log('Original merge by:', result.originalProvenance.mergedBy)

// Check golden record status
if (result.goldenRecordDeleted) {
  console.log('Golden record has been deleted')
}
```

## Audit Trail

Unmerge operations are tracked in provenance:

```typescript
// After unmerge, provenance is marked but not deleted
const provenance = await provenanceStore.get(goldenRecordId)

console.log('Unmerged:', provenance.unmerged) // true
console.log('Unmerged At:', provenance.unmergedAt)
console.log('Unmerged By:', provenance.unmergedBy)
console.log('Unmerge Reason:', provenance.unmergeReason)

// Query historical unmerges
const timeline = await provenanceStore.getMergeTimeline({
  includeUnmerged: true,
})

for (const entry of timeline) {
  if (entry.unmerged) {
    console.log(`${entry.goldenRecordId} was unmerged at ${entry.unmergedAt}`)
  }
}
```

## Error Handling

```typescript
import {
  UnmergeError,
  ProvenanceNotFoundError,
  SourceRecordNotFoundError,
} from 'have-we-met/merge'

try {
  await unmergeExecutor.unmerge({
    goldenRecordId,
    unmergedBy: 'admin',
  })
} catch (error) {
  if (error instanceof ProvenanceNotFoundError) {
    console.error('No provenance found - cannot unmerge')
    console.error('Golden Record ID:', error.goldenRecordId)
  } else if (error instanceof SourceRecordNotFoundError) {
    console.error('Source records missing from archive')
    console.error('Missing IDs:', error.context?.allMissing)
  } else if (error instanceof UnmergeError) {
    console.error('Unmerge failed:', error.message)
    if (error.context?.unmergedAt) {
      console.error('Already unmerged at:', error.context.unmergedAt)
    }
  }
}
```

## Best Practices

### 1. Always Archive Source Records

When merging, always archive source records:

```typescript
// After merge execution
await sourceRecordArchive.archive(sourceRecords, mergeResult.goldenRecordId)
```

### 2. Use Transactions

Wrap unmerge operations in transactions:

```typescript
await database.transaction(async (tx) => {
  const result = await unmergeExecutor.unmerge({
    goldenRecordId,
    unmergedBy: 'admin',
    reason: 'False positive',
  })

  // All database operations within transaction
  // Rollback on any failure
})
```

### 3. Document Unmerge Reasons

Always provide meaningful reasons:

```typescript
await unmergeExecutor.unmerge({
  goldenRecordId,
  unmergedBy: 'admin@example.com',
  reason:
    'Bob Williams and Robert Williams are different employees - Bob is in Engineering (E1001), Robert is new hire in Product (E2001)',
})
```

### 4. Prevent Double Unmerge

The system prevents unmerging the same record twice:

```typescript
// First unmerge succeeds
await unmergeExecutor.unmerge({ goldenRecordId, unmergedBy: 'admin' })

// Second attempt fails
const canUnmerge = await unmergeExecutor.canUnmerge(goldenRecordId)
console.log(canUnmerge.canUnmerge) // false
console.log(canUnmerge.reason) // "Record has already been unmerged"
```

### 5. Consider Re-Matching After Unmerge

After unmerge, records may need re-evaluation:

```typescript
// Unmerge
const result = await unmergeExecutor.unmerge({
  goldenRecordId,
  unmergedBy: 'admin',
  reason: 'False positive',
})

// Re-evaluate matches for restored records
for (const restored of result.restoredRecords) {
  const matches = await resolver.resolveWithDatabase(restored.record)

  if (matches.some((m) => m.outcome === 'potential-match')) {
    // Add to review queue for human decision
    await resolver.queue.add({
      candidateRecord: restored.record,
      potentialMatches: matches,
      context: { source: 'post-unmerge-review' },
    })
  }
}
```

## Recovery Scenarios

### Scenario 1: Simple False Positive

Two customer records were merged but are different people.

```typescript
// Full unmerge - restore both, delete golden record
await unmergeExecutor.unmerge(
  {
    goldenRecordId: 'golden-cust-001',
    unmergedBy: 'admin',
    reason:
      'John Smith (marketing) and John Smith (engineering) are different employees',
  },
  { mode: 'full' }
)
```

### Scenario 2: Partial Merge Correction

Three records were merged, but one shouldn't have been included.

```typescript
// Partial unmerge - restore one record, keep the golden record
await unmergeExecutor.unmerge(
  {
    goldenRecordId: 'golden-cust-001',
    unmergedBy: 'admin',
    reason: 'Third record was a different person',
  },
  {
    mode: 'partial',
    sourceRecordIdsToRestore: ['rec-003'],
    deleteGoldenRecord: false,
  }
)
```

### Scenario 3: Split and Re-Merge

Records need to be reorganized into different groups.

```typescript
// Step 1: Unmerge to restore all records
await unmergeExecutor.unmerge(
  {
    goldenRecordId: 'golden-001',
    unmergedBy: 'admin',
    reason: 'Reorganizing customer groups',
  },
  { mode: 'full' }
)

// Step 2: Retrieve restored records
const restored = await database.findByIds(['rec-001', 'rec-002', 'rec-003'])

// Step 3: Create new merges with correct groupings
await mergeExecutor.merge({
  sourceRecords: [toSourceRecord(restored[0]), toSourceRecord(restored[1])],
  mergedBy: 'admin',
})

await mergeExecutor.merge({
  sourceRecords: [toSourceRecord(restored[2])],
  mergedBy: 'admin',
})
```

## Next Steps

- [Golden Record Overview](./golden-record.md): Complete merge workflow
- [Provenance](./provenance.md): Understanding the audit trail
- [Review Queue](./review-queue.md): Human-in-the-loop workflows
