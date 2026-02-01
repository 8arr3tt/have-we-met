# Review Queue

The review queue is the human-in-the-loop component of have-we-met's identity resolution workflow. When the matching engine identifies potential matches (scores between the lower and upper thresholds), these ambiguous cases require human judgment and are queued for manual review.

## Overview

### The Three-Tier Outcome System

have-we-met uses a three-tier matching system:

1. **No Match** (score below lower threshold): Records are definitively different
2. **Definite Match** (score above upper threshold): Records are definitively duplicates
3. **Potential Match** (score between thresholds): Requires human review

The review queue handles the third category, preserving all context needed for informed human decisions.

### When to Use the Review Queue

Use the review queue when:

- Match scores fall in the ambiguous range between thresholds
- You want to maintain high precision and recall
- Human judgment can add value to the matching decision
- You need an audit trail of matching decisions
- Complex rules require case-by-case evaluation

### Key Features

- **Full context preservation**: Stores records, scores, explanations, and metadata
- **Status lifecycle tracking**: Pending → Reviewing → Confirmed/Rejected/Merged
- **Flexible persistence**: Works with Prisma, Drizzle, or TypeORM
- **Batch operations**: Efficient bulk processing
- **Metrics and reporting**: Track queue health and reviewer performance
- **Priority and tagging**: Organize and prioritize queue items

## Queue Item Lifecycle

### Status Transitions

```
pending ──────> reviewing ──────> confirmed
   │               │                    ↓
   │               │               (final state)
   │               ↓
   └──────────> rejected
                    ↓
               (final state)

pending ──────> merged
                   ↓
              (final state)

pending ──────> expired
                   ↓
              (final state)
```

Valid transitions:
- `pending` → `reviewing`, `confirmed`, `rejected`, `merged`, `expired`
- `reviewing` → `confirmed`, `rejected`, `pending` (reviewer abandons)
- `confirmed`, `rejected`, `merged`, `expired` are final states (cannot transition)

### Queue Item Structure

```typescript
interface QueueItem<T> {
  id: string                    // Unique identifier
  candidateRecord: T            // Record being evaluated
  potentialMatches: Array<{     // Possible matches with scores
    record: T
    score: number
    outcome: 'potential-match'
    explanation: MatchExplanation
  }>
  status: QueueStatus           // Current lifecycle status
  createdAt: Date               // When added to queue
  updatedAt: Date               // When last modified
  decidedAt?: Date              // When decision was made
  decidedBy?: string            // Who made the decision
  decision?: QueueDecision      // The decision details
  context?: QueueContext        // Additional metadata
  priority?: number             // Priority level (higher = more urgent)
  tags?: string[]               // Categorization tags
}
```

## Queue Operations

### Adding Items to the Queue

#### Manual Addition

```typescript
const resolver = HaveWeMet
  .schema({ /* ... */ })
  .matching(match => /* ... */)
  .thresholds({ noMatch: 20, definiteMatch: 45 })
  .adapter(prismaAdapter(prisma))
  .build()

// Check for matches
const result = await resolver.resolve(newRecord)

// Add potential matches to queue
if (result.outcome === 'review') {
  const queueItem = await resolver.queue.add({
    candidateRecord: newRecord,
    potentialMatches: result.matches,
    context: {
      source: 'customer-import',
      userId: 'admin',
      metadata: { batchId: '2024-01-15-001' }
    },
    priority: 1,
    tags: ['customer', 'import']
  })

  console.log(`Added to queue: ${queueItem.id}`)
}
```

#### Automatic Queueing

```typescript
// Enable autoQueue to automatically add potential matches
const results = await resolver.resolve(newRecord, {
  autoQueue: true,
  queueContext: {
    source: 'api-import',
    userId: req.user.id
  }
})

// If outcome is 'review', it's automatically queued
if (results.outcome === 'review') {
  console.log('Automatically added to queue')
}
```

#### Batch Addition

```typescript
const items = records.map(record => ({
  candidateRecord: record,
  potentialMatches: [...], // from matching results
  context: { source: 'bulk-import' }
}))

const queueItems = await resolver.queue.addBatch(items)
console.log(`Added ${queueItems.length} items to queue`)
```

### Listing and Filtering

```typescript
// List pending items
const pending = await resolver.queue.list({
  status: 'pending',
  limit: 10,
  orderBy: 'createdAt',
  orderDirection: 'asc'
})

console.log(`${pending.total} pending items, showing ${pending.items.length}`)
console.log(`Has more: ${pending.hasMore}`)

// Filter by multiple criteria
const highPriority = await resolver.queue.list({
  status: ['pending', 'reviewing'],
  tags: ['customer'],
  since: new Date('2024-01-01'),
  orderBy: 'priority',
  orderDirection: 'desc',
  limit: 20
})

// Pagination
const page2 = await resolver.queue.list({
  status: 'pending',
  limit: 10,
  offset: 10
})
```

### Retrieving a Single Item

```typescript
const item = await resolver.queue.get('queue-item-id')

if (item) {
  console.log('Candidate:', item.candidateRecord)
  console.log('Potential matches:', item.potentialMatches.length)
  console.log('Status:', item.status)
} else {
  console.log('Queue item not found')
}
```

### Making Decisions

#### Confirming a Match

```typescript
// Confirm that the candidate matches one of the potential matches
const confirmed = await resolver.queue.confirm('queue-item-id', {
  selectedMatchId: 'match-record-id',
  notes: 'Same person, verified by email and phone',
  confidence: 0.95,
  decidedBy: 'reviewer@example.com'
})

console.log('Status:', confirmed.status) // 'confirmed'
console.log('Decided at:', confirmed.decidedAt)
```

#### Rejecting a Match

```typescript
// Reject all potential matches (not a duplicate)
const rejected = await resolver.queue.reject('queue-item-id', {
  notes: 'Different person with similar name',
  confidence: 0.9,
  decidedBy: 'reviewer@example.com'
})

console.log('Status:', rejected.status) // 'rejected'
```

#### Merging Records

```typescript
// Confirm match and trigger merge
const merged = await resolver.queue.merge('queue-item-id', {
  selectedMatchId: 'match-record-id',
  notes: 'Merging customer records',
  confidence: 1.0,
  decidedBy: 'admin@example.com',
})

console.log('Status:', merged.status) // 'merged'
// The merge uses the configured merge strategies from the builder
```

When `.merge()` is called on a queue item:

1. The queue item is marked as `merged`
2. The configured merge strategies are applied to create a golden record
3. Source records are archived (preserved for potential unmerge)
4. Provenance is created linking the queue item to the merge
5. The golden record is persisted to the database

See [Golden Record](./golden-record.md) for merge configuration details.

### Updating Status

```typescript
// Mark item as being reviewed
await resolver.queue.updateStatus('queue-item-id', 'reviewing')

// Mark as pending if reviewer abandons
await resolver.queue.updateStatus('queue-item-id', 'pending')
```

### Deleting Items

```typescript
// Remove item from queue (use sparingly)
await resolver.queue.delete('queue-item-id')
```

### Cleanup and Maintenance

```typescript
// Remove old completed items
const removed = await resolver.queue.cleanup({
  olderThan: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), // 90 days ago
  status: ['confirmed', 'rejected', 'expired'],
  limit: 1000
})

console.log(`Removed ${removed} old items`)
```

## Queue Statistics

```typescript
// Get comprehensive queue statistics
const stats = await resolver.queue.stats()

console.log(`Total items: ${stats.total}`)
console.log(`Pending: ${stats.byStatus.pending}`)
console.log(`Reviewing: ${stats.byStatus.reviewing}`)
console.log(`Confirmed: ${stats.byStatus.confirmed}`)
console.log(`Rejected: ${stats.byStatus.rejected}`)
console.log(`Average wait time: ${stats.avgWaitTime}ms`)
console.log(`Average decision time: ${stats.avgDecisionTime}ms`)

if (stats.throughput) {
  console.log(`Throughput (last 24h): ${stats.throughput.last24h} decisions`)
  console.log(`Throughput (last 7d): ${stats.throughput.last7d} decisions`)
  console.log(`Throughput (last 30d): ${stats.throughput.last30d} decisions`)
}

if (stats.oldestPending) {
  console.log(`Oldest pending item: ${stats.oldestPending}`)
}
```

## Configuration Options

### Queue-Specific Configuration

Configure queue behavior when setting up the adapter:

```typescript
const resolver = HaveWeMet
  .schema({ /* ... */ })
  .matching(/* ... */)
  .adapter(prismaAdapter(prisma, {
    tableName: 'customers',
    queue: {
      autoExpireAfter: 30 * 24 * 60 * 60 * 1000, // 30 days in ms
      defaultPriority: 0,
      enableMetrics: true
    }
  }))
  .build()
```

Configuration options:
- `autoExpireAfter`: Automatically expire items older than this duration (milliseconds)
- `defaultPriority`: Default priority for new queue items (higher = more urgent)
- `enableMetrics`: Enable detailed metrics tracking

## Best Practices

### Prioritization

Use priority levels to ensure important items are reviewed first:

```typescript
await resolver.queue.add({
  candidateRecord: vipCustomer,
  potentialMatches: matches,
  priority: 10, // High priority
  tags: ['vip', 'urgent']
})
```

### Tagging

Use tags to categorize and filter queue items:

```typescript
// Tag by data source
tags: ['crm-import', 'customer']

// Tag by urgency
tags: ['urgent', 'requires-manager-approval']

// Tag by record type
tags: ['individual', 'business']
```

### Context Preservation

Always include relevant context:

```typescript
context: {
  source: 'api-import',
  userId: req.user.id,
  batchId: importJob.id,
  metadata: {
    importTimestamp: new Date(),
    sourceSystem: 'salesforce',
    recordType: 'lead'
  }
}
```

### Decision Quality

Provide detailed notes to improve future matching:

```typescript
await resolver.queue.confirm(itemId, {
  selectedMatchId: matchId,
  notes: 'Verified by phone number match and employment history',
  confidence: 0.95,
  decidedBy: reviewerEmail
})
```

### Regular Cleanup

Implement periodic cleanup to prevent unbounded growth:

```typescript
// Run daily cleanup job
async function dailyQueueCleanup() {
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)

  const removed = await resolver.queue.cleanup({
    olderThan: ninetyDaysAgo,
    status: ['confirmed', 'rejected', 'expired'],
    limit: 10000
  })

  console.log(`Cleaned up ${removed} old queue items`)
}
```

### Error Handling

```typescript
try {
  await resolver.queue.confirm(itemId, {
    selectedMatchId: matchId,
    decidedBy: reviewerId
  })
} catch (error) {
  if (error instanceof QueueItemNotFoundError) {
    console.error('Queue item not found')
  } else if (error instanceof InvalidStatusTransitionError) {
    console.error('Item already decided or invalid state')
  } else {
    console.error('Queue operation failed:', error)
  }
}
```

## Error Types

- `QueueError`: Base error class for all queue errors
- `QueueItemNotFoundError`: Queue item with given ID doesn't exist
- `InvalidStatusTransitionError`: Attempted invalid status transition
- `QueueOperationError`: Generic queue operation failure
- `QueueValidationError`: Invalid queue item data

## Merge Integration

The review queue integrates with the golden record merge system. When a reviewer confirms a match and chooses to merge:

### Queue Merge Workflow

```typescript
// Reviewer confirms a match should be merged
const merged = await resolver.queue.merge('queue-item-id', {
  selectedMatchId: 'match-record-id',
  notes: 'Same customer, verified by support ticket',
  decidedBy: 'reviewer@example.com',
})

// Result includes merge details
console.log('Queue status:', merged.status)  // 'merged'
console.log('Golden record ID:', merged.decision?.mergeResult?.goldenRecordId)
```

### Merge Configuration

Configure merge strategies when setting up the resolver:

```typescript
const resolver = HaveWeMet.create<Customer>()
  .schema(schema => { /* ... */ })
  .matching(match => { /* ... */ })
  .merge(merge => merge
    .timestampField('updatedAt')
    .defaultStrategy('preferNonNull')
    .field('firstName').strategy('preferLonger')
    .field('lastName').strategy('preferLonger')
    .field('email').strategy('preferNewer')
    .field('phone').strategy('preferNonNull')
  )
  .adapter(prismaAdapter(prisma, { tableName: 'customers' }))
  .build()
```

When a queue merge occurs:
1. Candidate record and selected match are merged using configured strategies
2. Golden record is created and persisted
3. Source records are archived
4. Provenance links the merge to the queue item
5. Queue item status becomes `merged`

### Unmerging Queue-Triggered Merges

If a queue-triggered merge was incorrect:

```typescript
const provenance = await provenanceStore.get(goldenRecordId)

// Check if this merge came from queue
if (provenance.queueItemId) {
  console.log('Originated from queue item:', provenance.queueItemId)
}

// Unmerge to restore original records
await unmergeExecutor.unmerge({
  goldenRecordId,
  unmergedBy: 'admin',
  reason: 'Queue decision was incorrect - false positive',
})
```

See [Golden Record](./golden-record.md), [Provenance](./provenance.md), and [Unmerge](./unmerge.md) for complete merge documentation.

## Next Steps

- [Queue Workflows](./queue-workflows.md): Common workflow patterns
- [Queue Metrics](./queue-metrics.md): Metrics, statistics, and monitoring
- [Queue UI Guide](./queue-ui-guide.md): Building review interfaces
- [Database Adapters](./database-adapters.md): Queue persistence details
- [Migration Guide](./migration-guide.md): Adding queue to existing databases
- [Golden Record](./golden-record.md): Merge configuration and workflows
