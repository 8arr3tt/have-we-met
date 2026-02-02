/**
 * Auto-Queue Example
 *
 * This example demonstrates:
 * 1. Using the autoQueue option to automatically queue potential matches
 * 2. Batch import workflow with automatic queueing
 * 3. Monitoring auto-queued items
 * 4. Integration with production workflows
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

async function autoQueueExample() {
  console.log('=== Auto-Queue Example ===\n')

  // Setup: Add existing customers to database
  const adapter = createMockAdapter<Customer>()
  const existingCustomers: Customer[] = [
    {
      id: 'c1',
      firstName: 'John',
      lastName: 'Smith',
      email: 'john.smith@example.com',
      phone: '+1-555-0100',
    },
    {
      id: 'c2',
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane.doe@example.com',
      phone: '+1-555-0200',
    },
    {
      id: 'c3',
      firstName: 'Robert',
      lastName: 'Johnson',
      email: 'r.johnson@example.com',
      phone: '+1-555-0300',
    },
    {
      id: 'c4',
      firstName: 'Mary',
      lastName: 'Williams',
      email: 'mary.w@example.com',
      phone: '+1-555-0400',
    },
    {
      id: 'c5',
      firstName: 'Michael',
      lastName: 'Brown',
      email: 'michael.brown@example.com',
      phone: '+1-555-0500',
    },
  ]

  for (const customer of existingCustomers) {
    await adapter.insert(customer)
  }
  console.log(
    `Added ${existingCustomers.length} existing customers to database\n`
  )

  const resolver = HaveWeMet.schema<Customer>({
    firstName: { type: 'string', weight: 1.0 },
    lastName: { type: 'string', weight: 1.5 },
    email: { type: 'string', weight: 2.0 },
    phone: { type: 'string', weight: 1.0 },
    company: { type: 'string', weight: 0.5 },
  })
    .blocking((block) =>
      block.exact('email').phonetic('lastName').prefix('lastName', 2)
    )
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

  // Step 1: Resolve with autoQueue disabled (default)
  console.log('Step 1: Resolving without autoQueue (default behavior)...')
  const candidate1 = {
    firstName: 'Jon',
    lastName: 'Smith',
    email: 'jon.smith@newdomain.com',
    phone: '+1-555-0100',
  }

  const result1 = await resolver.resolveWithDatabase(candidate1)
  console.log(`Found ${result1.matches.length} matches`)
  if (result1.matches.length > 0) {
    console.log(`Outcome: ${result1.matches[0].outcome}`)
  }

  // Check queue - should be empty
  const queueBefore = await resolver.queue.stats()
  console.log(`Queue size before autoQueue: ${queueBefore.total}\n`)

  // Step 2: Resolve with autoQueue enabled
  console.log('Step 2: Resolving with autoQueue enabled...')
  const candidate2 = {
    firstName: 'Rob',
    lastName: 'Johnson',
    email: 'rob.johnson@example.com',
    phone: '+1-555-0301',
  }

  const result2 = await resolver.resolveWithDatabase(candidate2, {
    autoQueue: true,
    queueContext: {
      source: 'customer-import',
      userId: 'import-service',
      metadata: { importId: 'import-123' },
    },
  })

  console.log(`Found ${result2.matches.length} matches`)
  if (result2.matches.length > 0) {
    console.log(`Outcome: ${result2.matches[0].outcome}`)
    if (result2.matches[0].outcome === 'potential-match') {
      console.log('✓ Automatically added to review queue')
    }
  }

  // Check queue
  const queueAfter = await resolver.queue.stats()
  console.log(`Queue size after autoQueue: ${queueAfter.total}\n`)

  // Step 3: Batch import with autoQueue
  console.log('Step 3: Batch import with automatic queueing...')

  const importBatch: Customer[] = [
    {
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane.d@newdomain.com',
      phone: '+1-555-0200',
    },
    {
      firstName: 'Maria',
      lastName: 'Williams',
      email: 'maria.williams@example.com',
      phone: '+1-555-0401',
    },
    {
      firstName: 'Mike',
      lastName: 'Brown',
      email: 'm.brown@example.com',
      phone: '+1-555-0500',
    },
    {
      firstName: 'Alice',
      lastName: 'Davis',
      email: 'alice.davis@example.com',
      phone: '+1-555-0600',
    },
    {
      firstName: 'Charlie',
      lastName: 'Wilson',
      email: 'charlie.w@example.com',
      phone: '+1-555-0700',
    },
  ]

  console.log(`Processing batch of ${importBatch.length} records...`)

  const batchResult = await resolver.resolveBatch(importBatch, {
    autoQueue: true,
    queueContext: {
      source: 'bulk-import',
      batchId: 'batch-456',
      userId: 'import-service',
    },
  })

  console.log('\nBatch Results:')
  console.log(`  Total processed: ${batchResult.results.length}`)
  console.log(
    `  No matches: ${batchResult.results.filter((r) => r.matches.length === 0).length}`
  )
  console.log(
    `  Definite matches: ${batchResult.results.filter((r) => r.matches[0]?.outcome === 'definite-match').length}`
  )
  console.log(
    `  Potential matches: ${batchResult.results.filter((r) => r.matches[0]?.outcome === 'potential-match').length}`
  )

  if (batchResult.queuedCount !== undefined) {
    console.log(`  Auto-queued items: ${batchResult.queuedCount}`)
  }
  console.log()

  // Step 4: Review auto-queued items
  console.log('Step 4: Reviewing auto-queued items...')

  const queuedItems = await resolver.queue.list({
    status: 'pending',
    limit: 10,
    orderBy: 'createdAt',
    orderDirection: 'desc',
  })

  console.log(`Total queued items: ${queuedItems.total}`)
  console.log('\nQueued items:')

  for (const item of queuedItems.items) {
    console.log(`\n  Item ${item.id}:`)
    console.log(
      `    Candidate: ${item.candidateRecord.firstName} ${item.candidateRecord.lastName}`
    )
    console.log(`    Email: ${item.candidateRecord.email}`)
    console.log(`    Potential matches: ${item.potentialMatches.length}`)

    if (item.potentialMatches.length > 0) {
      const bestMatch = item.potentialMatches[0]
      console.log(`    Best match score: ${bestMatch.score.toFixed(2)}`)
      console.log(
        `    Best match: ${bestMatch.record.firstName} ${bestMatch.record.lastName}`
      )
    }

    if (item.context) {
      console.log(`    Source: ${item.context.source}`)
      console.log(`    Batch ID: ${item.context.batchId || 'N/A'}`)
    }

    console.log(`    Created: ${item.createdAt.toISOString()}`)
  }
  console.log()

  // Step 5: Production workflow example
  console.log('Step 5: Production workflow with autoQueue...')
  console.log(`
Production Workflow Pattern:

1. Import Service receives new customer data
2. Call resolver.resolveWithDatabase(customer, { autoQueue: true })
3. Handle outcome:
   - 'no-match': Insert as new customer
   - 'definite-match': Update existing customer or link records
   - 'potential-match': Automatically queued for human review

4. Review Service periodically processes queue:
   - Fetch pending items
   - Present to reviewers with side-by-side comparison
   - Reviewers make confirm/reject decisions
   - System acts on decisions (merge, link, or create new)

Benefits:
  ✓ No manual queueing code needed
  ✓ Consistent context captured automatically
  ✓ Seamless integration with existing workflows
  ✓ Human review only for ambiguous cases
`)

  // Final statistics
  console.log('Final Queue Statistics:')
  const finalStats = await resolver.queue.stats()
  console.log(`  Total items: ${finalStats.total}`)
  console.log(`  Pending review: ${finalStats.byStatus.pending || 0}`)
  console.log(`  Confirmed: ${finalStats.byStatus.confirmed || 0}`)
  console.log(`  Rejected: ${finalStats.byStatus.rejected || 0}`)

  if (finalStats.oldestPending) {
    const ageSeconds = (Date.now() - finalStats.oldestPending.getTime()) / 1000
    console.log(`  Oldest pending: ${ageSeconds.toFixed(1)}s ago`)
  }
  console.log()

  console.log('=== Example Complete ===')
}

// Run the example
autoQueueExample().catch((error) => {
  console.error('Error running example:', error)
  process.exit(1)
})
