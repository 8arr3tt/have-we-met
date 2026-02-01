# Provenance Tracking

Provenance tracking maintains a complete audit trail of merge operations, recording which source records contributed each field value to a golden record. This enables accountability, compliance, debugging, and the ability to unmerge records if needed.

## Overview

### What is Provenance?

Provenance answers the question: "Where did this data come from?"

For every field in a golden record, provenance tracks:
- Which source record contributed the value
- What strategy was used to select it
- What other values were considered
- Whether there was a conflict

### Why Track Provenance?

1. **Audit Trail**: Know exactly how each golden record was created
2. **Compliance**: Meet regulatory requirements for data lineage
3. **Debugging**: Investigate unexpected merge results
4. **Unmerge Support**: Restore original records if a merge was incorrect
5. **Accountability**: Track who performed each merge and when

## Provenance Data Model

### Provenance Structure

```typescript
interface Provenance {
  goldenRecordId: string        // ID of the merged golden record
  sourceRecordIds: string[]     // IDs of all source records
  mergedAt: Date                // When the merge occurred
  mergedBy?: string             // User/system that performed merge
  queueItemId?: string          // Review queue reference (if applicable)
  fieldSources: Record<string, FieldProvenance>  // Per-field attribution
  strategyUsed: MergeConfig     // Configuration used for merge

  // Unmerge tracking
  unmerged?: boolean            // Whether this has been unmerged
  unmergedAt?: Date             // When unmerge occurred
  unmergedBy?: string           // Who performed unmerge
  unmergeReason?: string        // Why it was unmerged
}
```

### Field-Level Attribution

```typescript
interface FieldProvenance {
  sourceRecordId: string        // Which record contributed this value
  strategyApplied: MergeStrategy // Strategy used to select
  allValues: Array<{            // All values that were considered
    recordId: string
    value: unknown
  }>
  hadConflict: boolean          // Whether strategy faced a conflict
  conflictResolution?: string   // How conflict was resolved
}
```

## Using Provenance

### Accessing Provenance from Merge Result

```typescript
const result = await executor.merge({
  sourceRecords,
  mergedBy: 'admin-user',
})

// Top-level provenance
console.log('Golden Record ID:', result.provenance.goldenRecordId)
console.log('Source Records:', result.provenance.sourceRecordIds)
console.log('Merged At:', result.provenance.mergedAt)
console.log('Merged By:', result.provenance.mergedBy)

// Field-level provenance
for (const [field, attribution] of Object.entries(result.provenance.fieldSources)) {
  console.log(`\nField: ${field}`)
  console.log(`  Value from: ${attribution.sourceRecordId}`)
  console.log(`  Strategy: ${attribution.strategyApplied}`)
  console.log(`  Had conflict: ${attribution.hadConflict}`)
  console.log(`  All values considered:`)
  for (const v of attribution.allValues) {
    console.log(`    - ${v.recordId}: ${JSON.stringify(v.value)}`)
  }
}
```

### Example Output

```
Golden Record ID: golden-001
Source Records: rec-001, rec-002
Merged At: 2024-01-15T10:30:00.000Z
Merged By: admin-user

Field: firstName
  Value from: rec-002
  Strategy: preferLonger
  Had conflict: false
  All values considered:
    - rec-001: "Jon"
    - rec-002: "Jonathan"

Field: email
  Value from: rec-002
  Strategy: preferNewer
  Had conflict: false
  All values considered:
    - rec-001: "jon@oldmail.com"
    - rec-002: "jonathan@newmail.com"

Field: phone
  Value from: rec-001
  Strategy: preferNonNull
  Had conflict: false
  All values considered:
    - rec-001: "+1-555-0100"
    - rec-002: null
```

## Provenance Store

The provenance store persists provenance data for later retrieval.

### In-Memory Store (Testing/Development)

```typescript
import { createInMemoryProvenanceStore } from 'have-we-met/merge'

const provenanceStore = createInMemoryProvenanceStore()

// Save provenance
await provenanceStore.save(result.provenance)

// Retrieve by golden record ID
const provenance = await provenanceStore.get('golden-001')

// Find all golden records that include a source record
const related = await provenanceStore.getBySourceId('rec-001')
```

### ProvenanceStore Interface

```typescript
interface ProvenanceStore {
  // Core operations
  save(provenance: Provenance): Promise<void>
  get(goldenRecordId: string): Promise<Provenance | null>
  delete(goldenRecordId: string): Promise<boolean>
  exists(goldenRecordId: string): Promise<boolean>

  // Query operations
  getBySourceId(sourceRecordId: string, options?: QueryOptions): Promise<Provenance[]>
  findGoldenRecordsBySource(sourceRecordId: string): Promise<string[]>
  getMergeTimeline(options?: QueryOptions): Promise<MergeTimelineEntry[]>
  getFieldHistory(goldenRecordId: string, field: string): Promise<FieldHistoryEntry[]>

  // Unmerge support
  markUnmerged(goldenRecordId: string, info: UnmergeInfo): Promise<void>

  // Maintenance
  count(includeUnmerged?: boolean): Promise<number>
  clear(): Promise<void>
}
```

## Querying Provenance

### Find Related Merges

```typescript
// Find all golden records that include a specific source record
const goldenRecordIds = await provenanceStore.findGoldenRecordsBySource('rec-001')

// Get full provenance for each
for (const id of goldenRecordIds) {
  const provenance = await provenanceStore.get(id)
  console.log(`Golden ${id} merged at ${provenance.mergedAt}`)
}
```

### Get Merge Timeline

```typescript
// Get chronological list of all merges
const timeline = await provenanceStore.getMergeTimeline({
  limit: 100,
  sortOrder: 'desc',  // Most recent first
  includeUnmerged: false
})

for (const entry of timeline) {
  console.log(`${entry.mergedAt}: ${entry.sourceRecordIds.join(' + ')} → ${entry.goldenRecordId}`)
}
```

### Get Field History

```typescript
// Track how a field's value evolved
const history = await provenanceStore.getFieldHistory('golden-001', 'email')

for (const entry of history) {
  console.log(`${entry.mergedAt}: ${entry.value} (from ${entry.sourceRecordId}, ${entry.strategyApplied})`)
}
```

### Query with Filters

```typescript
// Get recent merges involving a source record
const merges = await provenanceStore.getBySourceId('rec-001', {
  limit: 10,
  sortOrder: 'desc',
  includeUnmerged: true  // Include unmerged for audit
})
```

## Database Persistence

For production use, provenance should be persisted to your database.

### Prisma Schema Example

```prisma
model Provenance {
  id              String   @id @default(uuid())
  goldenRecordId  String   @unique
  sourceRecordIds String[]
  mergedAt        DateTime
  mergedBy        String?
  queueItemId     String?
  fieldSources    Json
  strategyUsed    Json
  unmerged        Boolean  @default(false)
  unmergedAt      DateTime?
  unmergedBy      String?
  unmergeReason   String?

  @@index([goldenRecordId])
  @@index([mergedAt])
  @@index([unmerged])
}

// For efficient source record lookups
model ProvenanceSourceLink {
  id             String @id @default(uuid())
  provenanceId   String
  sourceRecordId String

  @@unique([provenanceId, sourceRecordId])
  @@index([sourceRecordId])
}
```

### Example Database Queries

```sql
-- Find all golden records containing a source record
SELECT p.goldenRecordId, p.mergedAt, p.mergedBy
FROM Provenance p
JOIN ProvenanceSourceLink psl ON p.id = psl.provenanceId
WHERE psl.sourceRecordId = 'rec-001'
  AND p.unmerged = false
ORDER BY p.mergedAt DESC;

-- Get merge timeline
SELECT goldenRecordId, mergedAt, sourceRecordIds, mergedBy
FROM Provenance
WHERE unmerged = false
ORDER BY mergedAt DESC
LIMIT 100;

-- Count active merges
SELECT COUNT(*) FROM Provenance WHERE unmerged = false;
```

## Best Practices

### 1. Always Enable Provenance

Keep provenance tracking enabled (it's on by default):

```typescript
.merge(merge => merge
  .trackProvenance(true)
)
```

### 2. Store Provenance Persistently

Use database storage for production:

```typescript
// After merge
await provenanceStore.save(result.provenance)

// Integrate with your database adapter
const adapter = prismaAdapter(prisma, {
  tableName: 'customers',
  provenance: {
    enabled: true,
    tableName: 'customer_provenance'
  }
})
```

### 3. Include Meaningful Context

Record who performed merges and why:

```typescript
const result = await executor.merge({
  sourceRecords,
  mergedBy: 'user@example.com',  // Identify the actor
  queueItemId: 'queue-123',      // Link to review queue
})
```

### 4. Query Before Merge

Check if records are already part of golden records:

```typescript
// Check if source record is already merged
const existingMerges = await provenanceStore.findGoldenRecordsBySource(recordId)

if (existingMerges.length > 0) {
  console.log('Record already merged into:', existingMerges)
  // Handle accordingly
}
```

### 5. Retain Provenance After Unmerge

Don't delete provenance when unmerging - mark as unmerged:

```typescript
// Provenance is marked, not deleted
await provenanceStore.markUnmerged(goldenRecordId, {
  unmergedAt: new Date(),
  unmergedBy: 'admin',
  reason: 'Incorrect match identified'
})

// Can still query historical provenance
const history = await provenanceStore.get(goldenRecordId)
console.log('Was unmerged:', history.unmerged)
```

## Compliance Considerations

### Data Lineage Requirements

Many regulations require tracking data lineage:

- **GDPR**: Right to explanation for automated decisions
- **CCPA**: Data source transparency
- **HIPAA**: Protected health information tracking
- **Financial regulations**: Audit trail requirements

Provenance helps meet these requirements by:
- Recording the source of each field value
- Tracking who made merge decisions
- Maintaining complete audit history
- Enabling data restoration via unmerge

### Retention Policies

Consider how long to retain provenance:

```typescript
// Cleanup old provenance (be careful!)
const cutoffDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) // 1 year

// Only clean up if regulations allow
const toDelete = await provenanceStore.getMergeTimeline({
  includeUnmerged: true,
  sortOrder: 'asc',
})

for (const entry of toDelete) {
  if (entry.mergedAt < cutoffDate) {
    // Archive before deleting
    await archiveProvenance(entry.goldenRecordId)
    await provenanceStore.delete(entry.goldenRecordId)
  }
}
```

## Next Steps

- [Golden Record Overview](./golden-record.md): Complete merge workflow
- [Merge Strategies](./merge-strategies.md): Strategy reference
- [Unmerge](./unmerge.md): Restore source records using provenance
