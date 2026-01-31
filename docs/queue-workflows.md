# Queue Workflows

This guide covers common review queue workflows and patterns for implementing human-in-the-loop identity resolution.

## Table of Contents

- [Daily Review Workflow](#daily-review-workflow)
- [Batch Import with Auto-Queue](#batch-import-with-auto-queue)
- [Priority-Based Review](#priority-based-review)
- [Team-Based Review](#team-based-review)
- [Automated Cleanup](#automated-cleanup)
- [Integration Patterns](#integration-patterns)

## Daily Review Workflow

### Basic Review Process

A typical daily review workflow for processing queue items:

```typescript
async function dailyQueueReview(resolver: Resolver<Customer>, reviewerId: string) {
  // Get pending items, oldest first
  const result = await resolver.queue.list({
    status: 'pending',
    limit: 50,
    orderBy: 'createdAt',
    orderDirection: 'asc'
  })

  console.log(`Processing ${result.items.length} of ${result.total} pending items`)

  for (const item of result.items) {
    // Mark as reviewing
    await resolver.queue.updateStatus(item.id, 'reviewing')

    // Present to reviewer (UI integration)
    const decision = await presentToReviewer(item)

    // Process decision
    if (decision.action === 'confirm') {
      await resolver.queue.confirm(item.id, {
        selectedMatchId: decision.matchId,
        notes: decision.notes,
        decidedBy: reviewerId,
        confidence: decision.confidence
      })
      console.log(`✓ Confirmed match for ${item.id}`)
    } else if (decision.action === 'reject') {
      await resolver.queue.reject(item.id, {
        notes: decision.notes,
        decidedBy: reviewerId,
        confidence: decision.confidence
      })
      console.log(`✗ Rejected match for ${item.id}`)
    } else if (decision.action === 'skip') {
      // Return to pending for later review
      await resolver.queue.updateStatus(item.id, 'pending')
      console.log(`⊗ Skipped ${item.id}`)
    }
  }

  console.log('Daily review complete')
}
```

### Time-Boxed Review Session

Implement a review session with a time limit:

```typescript
async function timedReviewSession(
  resolver: Resolver<Customer>,
  reviewerId: string,
  durationMinutes: number
) {
  const startTime = Date.now()
  const endTime = startTime + durationMinutes * 60 * 1000
  let processed = 0
  let confirmed = 0
  let rejected = 0

  while (Date.now() < endTime) {
    // Get next pending item
    const result = await resolver.queue.list({
      status: 'pending',
      limit: 1,
      orderBy: 'priority',
      orderDirection: 'desc'
    })

    if (result.items.length === 0) {
      console.log('No more items to review')
      break
    }

    const item = result.items[0]
    await resolver.queue.updateStatus(item.id, 'reviewing')

    try {
      const decision = await presentToReviewer(item)

      if (decision.action === 'confirm') {
        await resolver.queue.confirm(item.id, {
          selectedMatchId: decision.matchId,
          decidedBy: reviewerId
        })
        confirmed++
      } else {
        await resolver.queue.reject(item.id, {
          decidedBy: reviewerId
        })
        rejected++
      }

      processed++
    } catch (error) {
      // Return to pending if error occurs
      await resolver.queue.updateStatus(item.id, 'pending')
      console.error(`Error processing ${item.id}:`, error)
    }
  }

  console.log(`Session complete: ${processed} processed (${confirmed} confirmed, ${rejected} rejected)`)
  return { processed, confirmed, rejected }
}
```

## Batch Import with Auto-Queue

### Importing with Automatic Queueing

Import records and automatically queue potential matches:

```typescript
async function importCustomersWithReview(
  resolver: Resolver<Customer>,
  customers: Customer[],
  importSource: string
) {
  const stats = {
    processed: 0,
    noMatch: 0,
    definiteMatch: 0,
    queued: 0,
    errors: 0
  }

  for (const customer of customers) {
    try {
      // Resolve with auto-queue enabled
      const result = await resolver.resolve(customer, {
        autoQueue: true,
        queueContext: {
          source: importSource,
          userId: 'system',
          metadata: {
            importTimestamp: new Date(),
            batchId: `import-${Date.now()}`
          }
        }
      })

      stats.processed++

      if (result.outcome === 'no-match') {
        stats.noMatch++
        // Insert as new record
        await insertNewCustomer(customer)
      } else if (result.outcome === 'definite-match') {
        stats.definiteMatch++
        // Handle automatic merge or update
        await handleDefiniteMatch(customer, result.matches[0])
      } else if (result.outcome === 'review') {
        stats.queued++
        // Already queued automatically
      }
    } catch (error) {
      console.error(`Error importing customer:`, error)
      stats.errors++
    }
  }

  console.log('Import complete:', stats)
  return stats
}
```

### Batch Resolution with Manual Queue Control

More control over what gets queued:

```typescript
async function batchResolveWithSelectiveQueue(
  resolver: Resolver<Customer>,
  records: Customer[]
) {
  // Resolve all records
  const results = await resolver.resolveBatch(records)

  // Filter for high-confidence potential matches
  const highConfidenceReviews = results.filter(result => {
    if (result.outcome !== 'review') return false

    // Only queue if highest match score is above threshold
    const highestScore = Math.max(...result.matches.map(m => m.score))
    return highestScore > 30 // Custom threshold
  })

  // Queue high-confidence items with priority
  const queueItems = highConfidenceReviews.map(result => ({
    candidateRecord: result.candidateRecord,
    potentialMatches: result.matches,
    priority: calculatePriority(result),
    tags: ['batch-import', 'high-confidence'],
    context: {
      source: 'selective-import',
      metadata: { batchId: Date.now() }
    }
  }))

  await resolver.queue.addBatch(queueItems)

  console.log(`Queued ${queueItems.length} high-confidence items`)
}

function calculatePriority(result: any): number {
  const highestScore = Math.max(...result.matches.map(m => m.score))
  // Higher score = higher priority
  return Math.floor(highestScore)
}
```

## Priority-Based Review

### Smart Prioritization

Assign priorities based on business rules:

```typescript
async function addWithSmartPriority(
  resolver: Resolver<Customer>,
  candidateRecord: Customer,
  potentialMatches: any[]
) {
  let priority = 0
  const tags: string[] = []

  // VIP customers get highest priority
  if (candidateRecord.vipStatus) {
    priority += 10
    tags.push('vip')
  }

  // Recent activity increases priority
  const daysSinceLastActivity = getDaysSince(candidateRecord.lastActivityDate)
  if (daysSinceLastActivity < 7) {
    priority += 5
    tags.push('recent-activity')
  }

  // High-value customers
  if (candidateRecord.lifetimeValue > 10000) {
    priority += 3
    tags.push('high-value')
  }

  // Multiple potential matches increase priority
  if (potentialMatches.length > 2) {
    priority += 2
    tags.push('multiple-matches')
  }

  // High match scores increase priority
  const highestScore = Math.max(...potentialMatches.map(m => m.score))
  if (highestScore > 40) {
    priority += 2
    tags.push('high-confidence')
  }

  await resolver.queue.add({
    candidateRecord,
    potentialMatches,
    priority,
    tags,
    context: {
      source: 'smart-import',
      metadata: { priorityCalculation: priority }
    }
  })

  console.log(`Added with priority ${priority}, tags: ${tags.join(', ')}`)
}
```

### Processing by Priority

Always review highest priority items first:

```typescript
async function processHighPriorityItems(
  resolver: Resolver<Customer>,
  reviewerId: string,
  minPriority: number = 5
) {
  const result = await resolver.queue.list({
    status: 'pending',
    orderBy: 'priority',
    orderDirection: 'desc',
    limit: 100
  })

  const highPriorityItems = result.items.filter(item =>
    (item.priority ?? 0) >= minPriority
  )

  console.log(`Processing ${highPriorityItems.length} high-priority items`)

  for (const item of highPriorityItems) {
    console.log(`Priority ${item.priority}: ${item.id}`)
    // Process item...
  }
}
```

## Team-Based Review

### Assigning to Reviewers

Distribute queue items across team members:

```typescript
async function assignToReviewer(
  resolver: Resolver<Customer>,
  reviewerId: string,
  count: number
) {
  const items = await resolver.queue.list({
    status: 'pending',
    limit: count,
    orderBy: 'createdAt',
    orderDirection: 'asc'
  })

  for (const item of items.items) {
    await resolver.queue.updateStatus(item.id, 'reviewing')

    // Store assignment (could be in queue context or separate system)
    await recordAssignment(item.id, reviewerId)
  }

  console.log(`Assigned ${items.items.length} items to ${reviewerId}`)
  return items.items
}
```

### Load Balancing

Balance workload across reviewers:

```typescript
async function balanceQueueLoad(
  resolver: Resolver<Customer>,
  reviewers: string[]
) {
  const stats = await resolver.queue.stats()
  const pendingCount = stats.byStatus.pending

  const itemsPerReviewer = Math.ceil(pendingCount / reviewers.length)

  for (const reviewerId of reviewers) {
    await assignToReviewer(resolver, reviewerId, itemsPerReviewer)
  }

  console.log(`Balanced ${pendingCount} items across ${reviewers.length} reviewers`)
}
```

### Reviewer Performance Tracking

Track individual reviewer statistics:

```typescript
async function getReviewerPerformance(
  resolver: Resolver<Customer>,
  reviewerId: string,
  since: Date
) {
  // Get all decided items by this reviewer
  const decided = await resolver.queue.list({
    status: ['confirmed', 'rejected'],
    since,
    limit: 10000
  })

  const reviewerItems = decided.items.filter(
    item => item.decidedBy === reviewerId
  )

  const confirmed = reviewerItems.filter(i => i.status === 'confirmed').length
  const rejected = reviewerItems.filter(i => i.status === 'rejected').length
  const total = reviewerItems.length

  const avgDecisionTime = reviewerItems.reduce((sum, item) => {
    if (item.decidedAt && item.createdAt) {
      return sum + (item.decidedAt.getTime() - item.createdAt.getTime())
    }
    return sum
  }, 0) / total

  return {
    reviewerId,
    total,
    confirmed,
    rejected,
    confirmRate: confirmed / total,
    avgDecisionTimeMs: avgDecisionTime,
    avgDecisionTimeMinutes: avgDecisionTime / 1000 / 60
  }
}
```

## Automated Cleanup

### Daily Cleanup Job

Remove old decided items:

```typescript
async function dailyCleanup(resolver: Resolver<Customer>) {
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)

  // Archive before deleting (optional)
  const toArchive = await resolver.queue.list({
    status: ['confirmed', 'rejected', 'expired'],
    until: ninetyDaysAgo,
    limit: 10000
  })

  if (toArchive.items.length > 0) {
    await archiveQueueItems(toArchive.items)
  }

  // Clean up old items
  const removed = await resolver.queue.cleanup({
    olderThan: ninetyDaysAgo,
    status: ['confirmed', 'rejected', 'expired'],
    limit: 10000
  })

  console.log(`Archived ${toArchive.items.length}, removed ${removed} items`)
  return { archived: toArchive.items.length, removed }
}
```

### Expire Stale Items

Automatically expire items that have been pending too long:

```typescript
async function expireStaleItems(
  resolver: Resolver<Customer>,
  maxAgeDays: number = 30
) {
  const cutoffDate = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000)

  const staleItems = await resolver.queue.list({
    status: 'pending',
    until: cutoffDate,
    limit: 1000
  })

  let expired = 0
  for (const item of staleItems.items) {
    try {
      await resolver.queue.updateStatus(item.id, 'expired')
      expired++
    } catch (error) {
      console.error(`Error expiring ${item.id}:`, error)
    }
  }

  console.log(`Expired ${expired} stale items older than ${maxAgeDays} days`)
  return expired
}
```

## Integration Patterns

### API Endpoint for Reviews

Build a REST API for queue operations:

```typescript
import express from 'express'

const router = express.Router()

// Get pending items for review
router.get('/queue/pending', async (req, res) => {
  const { limit = 10, offset = 0 } = req.query

  const result = await resolver.queue.list({
    status: 'pending',
    limit: Number(limit),
    offset: Number(offset),
    orderBy: 'priority',
    orderDirection: 'desc'
  })

  res.json(result)
})

// Get single queue item
router.get('/queue/:id', async (req, res) => {
  const item = await resolver.queue.get(req.params.id)

  if (!item) {
    return res.status(404).json({ error: 'Queue item not found' })
  }

  res.json(item)
})

// Make decision
router.post('/queue/:id/decide', async (req, res) => {
  const { action, matchId, notes, confidence } = req.body
  const reviewerId = req.user.email

  try {
    let result
    if (action === 'confirm') {
      result = await resolver.queue.confirm(req.params.id, {
        selectedMatchId: matchId,
        notes,
        confidence,
        decidedBy: reviewerId
      })
    } else if (action === 'reject') {
      result = await resolver.queue.reject(req.params.id, {
        notes,
        confidence,
        decidedBy: reviewerId
      })
    } else {
      return res.status(400).json({ error: 'Invalid action' })
    }

    res.json(result)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Get queue statistics
router.get('/queue/stats', async (req, res) => {
  const stats = await resolver.queue.stats()
  res.json(stats)
})
```

### Background Job Processing

Process queue items in background jobs:

```typescript
// Using a job queue like Bull or BullMQ
import Queue from 'bull'

const reviewQueue = new Queue('review-queue')

// Producer: Add job when item needs review
reviewQueue.add('process-queue-item', {
  queueItemId: 'item-123'
})

// Consumer: Process queue items
reviewQueue.process('process-queue-item', async (job) => {
  const { queueItemId } = job.data

  const item = await resolver.queue.get(queueItemId)
  if (!item) return

  // Automatic processing logic or notification
  await notifyReviewer(item)
})
```

### Webhook Integration

Trigger webhooks when items are added or decided:

```typescript
async function addWithWebhook(
  resolver: Resolver<Customer>,
  item: any,
  webhookUrl: string
) {
  const queueItem = await resolver.queue.add(item)

  // Notify via webhook
  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event: 'queue.item.added',
      queueItemId: queueItem.id,
      candidateRecord: queueItem.candidateRecord,
      matchCount: queueItem.potentialMatches.length
    })
  })

  return queueItem
}
```

### Real-Time Updates

Use WebSockets for real-time queue updates:

```typescript
import { Server } from 'socket.io'

function setupQueueWebSocket(io: Server, resolver: Resolver<Customer>) {
  io.on('connection', (socket) => {
    console.log('Reviewer connected')

    // Send queue stats on connect
    resolver.queue.stats().then(stats => {
      socket.emit('queue:stats', stats)
    })

    // Handle review actions
    socket.on('queue:decide', async (data) => {
      try {
        const { itemId, action, matchId, notes } = data

        let result
        if (action === 'confirm') {
          result = await resolver.queue.confirm(itemId, {
            selectedMatchId: matchId,
            notes,
            decidedBy: socket.id
          })
        } else {
          result = await resolver.queue.reject(itemId, { notes, decidedBy: socket.id })
        }

        socket.emit('queue:decided', result)

        // Broadcast updated stats to all clients
        const stats = await resolver.queue.stats()
        io.emit('queue:stats', stats)
      } catch (error) {
        socket.emit('queue:error', { error: error.message })
      }
    })
  })
}
```

## Best Practices

### Review Session Management

- Process items in manageable batches (10-50 at a time)
- Use time-boxed sessions to prevent reviewer fatigue
- Update status to 'reviewing' to claim items
- Return to 'pending' if reviewer needs to skip

### Priority Management

- Assign meaningful priorities based on business impact
- Use tags for flexible categorization
- Review high-priority items first
- Regularly rebalance priorities if needed

### Team Coordination

- Assign items to specific reviewers to avoid conflicts
- Track reviewer performance for workload balancing
- Provide clear guidelines for decision-making
- Regular training on complex cases

### Quality Assurance

- Sample reviewed items for quality checks
- Track confidence scores to identify uncertain decisions
- Provide detailed notes for future reference
- Use decisions as training data for model improvement

### Performance

- Implement pagination for large queues
- Use indexes on status, priority, and createdAt
- Batch operations when possible
- Regular cleanup to prevent unbounded growth

## Next Steps

- [Review Queue Overview](./review-queue.md): Core concepts and API reference
- [Queue Metrics](./queue-metrics.md): Monitoring and analytics
- [Queue UI Guide](./queue-ui-guide.md): Building review interfaces
