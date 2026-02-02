/**
 * Batch Review Example
 *
 * This example demonstrates:
 * 1. Processing queue items in batches
 * 2. Efficient review workflows for high-volume queues
 * 3. Bulk decision operations
 * 4. Prioritization strategies
 */

import { HaveWeMet } from '../../src'
import type { DatabaseAdapter, QueueAdapter } from '../../src/adapters/types'
import type { QueueItem } from '../../src/queue/types'

// Simple mock adapter for examples
function createMockAdapter<
  T extends Record<string, unknown>,
>(): DatabaseAdapter<T> {
  const records: T[] = []
  const queueItems: QueueItem<T>[] = []

  return {
    insert: async (record: T) => {
      const id = (record as any).id || `id-${Date.now()}-${Math.random()}`
      const newRecord = { ...record, id } as T
      records.push(newRecord)
      return newRecord
    },
    update: async () => ({}) as T,
    delete: async () => {},
    findById: async (id: string) =>
      records.find((r) => (r as any).id === id) || null,
    findAll: async () => records,
    count: async () => records.length,
    batchInsert: async (batch: T[]) => batch,
    batchUpdate: async () => [],
    batchDelete: async () => 0,
    findByBlockingKeys: async () => records,
    transaction: async (fn: any) => fn(),
    queue: {
      insertQueueItem: async (item: QueueItem<T>) => {
        queueItems.push(item)
        return item
      },
      updateQueueItem: async (id: string, updates: Partial<QueueItem<T>>) => {
        const item = queueItems.find((i) => i.id === id)
        if (!item) throw new Error('Item not found')
        Object.assign(item, updates)
        return item
      },
      findQueueItems: async () => queueItems,
      findQueueItemById: async (id: string) =>
        queueItems.find((i) => i.id === id) || null,
      deleteQueueItem: async (id: string) => {
        const index = queueItems.findIndex((i) => i.id === id)
        if (index >= 0) queueItems.splice(index, 1)
      },
      countQueueItems: async () => queueItems.length,
      batchInsertQueueItems: async (items: QueueItem<T>[]) => {
        queueItems.push(...items)
        return items
      },
    } as QueueAdapter<T>,
  }
}

interface Customer {
  id?: string
  firstName: string
  lastName: string
  email: string
  phone?: string
  company?: string
}

async function batchReviewExample() {
  console.log('=== Batch Review Example ===\n')

  const adapter = createMockAdapter<Customer>()
  const resolver = HaveWeMet.schema<Customer>({
    firstName: { type: 'string', weight: 1.0 },
    lastName: { type: 'string', weight: 1.5 },
    email: { type: 'string', weight: 2.0 },
    phone: { type: 'string', weight: 1.0 },
    company: { type: 'string', weight: 0.5 },
  })
    .blocking((block) => block.exact('email').phonetic('lastName'))
    .matching((match) =>
      match
        .field('firstName')
        .using('jaro-winkler', { weight: 1.0 })
        .field('lastName')
        .using('jaro-winkler', { weight: 1.5 })
        .field('email')
        .using('exact', { weight: 2.0 })
        .field('phone')
        .using('exact', { weight: 1.0 })
    )
    .thresholds({ noMatch: 20, definiteMatch: 50 })
    .adapter(adapter)
    .build()

  // Step 1: Add many items to the queue in batch
  console.log('Step 1: Adding multiple items to queue in batch...')

  const queueItemsToAdd = Array.from({ length: 20 }, (_, i) => ({
    candidateRecord: {
      firstName: `Customer${i}`,
      lastName: `LastName${i}`,
      email: `customer${i}@example.com`,
      phone: `+1-555-0${i.toString().padStart(3, '0')}`,
      company: i % 2 === 0 ? 'Acme Corp' : 'Tech Inc',
    },
    potentialMatches: [
      {
        record: {
          id: `existing-${i}`,
          firstName: `Customer${i}`,
          lastName: `LastName${i}`,
          email: `customer${i}@old-domain.com`,
          phone: `+1-555-0${i.toString().padStart(3, '0')}`,
        },
        score: 30 + Math.random() * 15,
        outcome: 'potential-match' as const,
        explanation: { totalScore: 30, fieldScores: [], missingFields: [] },
      },
    ],
    priority: Math.floor(Math.random() * 3), // 0-2
    tags: i % 3 === 0 ? ['high-priority', 'import'] : ['import'],
    context: {
      source: 'bulk-import',
      batchId: 'batch-001',
      metadata: { index: i },
    },
  }))

  const addedItems = await resolver.queue.addBatch(queueItemsToAdd)
  console.log(`Added ${addedItems.length} items to queue\n`)

  // Step 2: Retrieve queue with prioritization
  console.log('Step 2: Fetching queue items by priority...')

  // Fetch high-priority items first
  const highPriorityItems = await resolver.queue.list({
    status: 'pending',
    tags: ['high-priority'],
    orderBy: 'priority',
    orderDirection: 'desc',
    limit: 5,
  })

  console.log(`High-priority items: ${highPriorityItems.items.length}`)
  for (const item of highPriorityItems.items) {
    console.log(
      `  - ${item.id}: priority ${item.priority}, tags: ${item.tags?.join(', ')}`
    )
  }
  console.log()

  // Step 3: Process batch of items with simulated review decisions
  console.log('Step 3: Batch processing queue items...')

  const batchSize = 10
  let processedCount = 0
  let confirmedCount = 0
  let rejectedCount = 0

  while (true) {
    const batch = await resolver.queue.list({
      status: 'pending',
      limit: batchSize,
      orderBy: 'priority',
      orderDirection: 'desc',
    })

    if (batch.items.length === 0) {
      console.log('No more pending items to process')
      break
    }

    console.log(`Processing batch of ${batch.items.length} items...`)

    for (const item of batch.items) {
      // Simulate review logic based on match score
      const bestMatch = item.potentialMatches[0]
      const decision = simulateReviewDecision(item, bestMatch.score)

      if (decision === 'confirm') {
        await resolver.queue.confirm(item.id, {
          selectedMatchId: bestMatch.record.id!,
          notes: `Auto-confirmed based on score ${bestMatch.score.toFixed(2)}`,
          confidence: 0.8,
          decidedBy: 'batch-reviewer',
        })
        confirmedCount++
      } else if (decision === 'reject') {
        await resolver.queue.reject(item.id, {
          notes: `Auto-rejected based on score ${bestMatch.score.toFixed(2)}`,
          confidence: 0.7,
          decidedBy: 'batch-reviewer',
        })
        rejectedCount++
      } else {
        // Mark as reviewing for manual review
        await resolver.queue.updateStatus(item.id, 'reviewing')
      }

      processedCount++
    }

    console.log(`  Processed ${batch.items.length} items`)

    // In a real system, you might add a small delay or check for cancellation
    if (processedCount >= 20) {
      break // Limit for demo purposes
    }
  }

  console.log()
  console.log('Batch processing summary:')
  console.log(`  Total processed: ${processedCount}`)
  console.log(`  Confirmed: ${confirmedCount}`)
  console.log(`  Rejected: ${rejectedCount}`)
  console.log(
    `  Marked for manual review: ${processedCount - confirmedCount - rejectedCount}`
  )
  console.log()

  // Step 4: Check remaining items requiring manual review
  console.log('Step 4: Items requiring manual review...')
  const manualReviewItems = await resolver.queue.list({
    status: 'reviewing',
  })
  console.log(`Items marked for manual review: ${manualReviewItems.total}`)

  if (manualReviewItems.items.length > 0) {
    console.log('Sample items:')
    for (const item of manualReviewItems.items.slice(0, 3)) {
      console.log(
        `  - ${item.id}: score ${item.potentialMatches[0].score.toFixed(2)}`
      )
    }
  }
  console.log()

  // Step 5: Generate processing statistics
  console.log('Step 5: Queue statistics after batch processing...')
  const stats = await resolver.queue.stats()

  console.log('Queue Statistics:')
  console.log(`  Total items: ${stats.total}`)
  console.log('  By status:')
  console.log(`    - Pending: ${stats.byStatus.pending || 0}`)
  console.log(`    - Reviewing: ${stats.byStatus.reviewing || 0}`)
  console.log(`    - Confirmed: ${stats.byStatus.confirmed || 0}`)
  console.log(`    - Rejected: ${stats.byStatus.rejected || 0}`)
  console.log(`  Average decision time: ${stats.avgDecisionTime.toFixed(2)}ms`)

  if (stats.throughput) {
    console.log(
      `  Throughput (last 24h): ${stats.throughput.last24h} decisions`
    )
  }
  console.log()

  // Step 6: Cleanup old decided items
  console.log('Step 6: Cleaning up old decided items...')
  const cutoffDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // 30 days ago
  const cleanedCount = await resolver.queue.cleanup({
    olderThan: cutoffDate,
    status: ['confirmed', 'rejected'],
    limit: 100,
  })
  console.log(`Cleaned up ${cleanedCount} old items\n`)

  console.log('=== Example Complete ===')
}

/**
 * Simulates a review decision based on match score
 * In a real system, this would be human judgment or ML-based
 */
function simulateReviewDecision(
  item: QueueItem<Customer>,
  score: number
): 'confirm' | 'reject' | 'manual' {
  // High scores (> 40): likely to confirm
  if (score > 40) {
    return Math.random() > 0.2 ? 'confirm' : 'manual'
  }

  // Low scores (< 25): likely to reject
  if (score < 25) {
    return Math.random() > 0.2 ? 'reject' : 'manual'
  }

  // Medium scores: require manual review
  return 'manual'
}

// Run the example
batchReviewExample().catch((error) => {
  console.error('Error running example:', error)
  process.exit(1)
})
