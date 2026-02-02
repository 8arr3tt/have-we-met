/**
 * Basic Review Queue Example
 *
 * This example demonstrates the fundamental queue workflow:
 * 1. Resolve a record that produces potential matches
 * 2. Add the result to the review queue
 * 3. List pending queue items
 * 4. Review and make decisions (confirm or reject)
 */

import { HaveWeMet } from '../../src'
import type { DatabaseAdapter, QueueAdapter } from '../../src/adapters/types'
import type { QueueItem } from '../../src/queue/types'

interface Customer {
  id?: string
  firstName: string
  lastName: string
  email: string
  phone?: string
  company?: string
}

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

async function basicQueueExample() {
  console.log('=== Basic Review Queue Example ===\n')

  // Create resolver with queue-enabled adapter
  const adapter = createMockAdapter<Customer>()
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
        .field('company')
        .using('levenshtein', { weight: 0.5 })
    )
    .thresholds({ noMatch: 20, definiteMatch: 50 })
    .adapter(adapter)
    .build()

  // Step 1: Add some existing customers to the database
  console.log('Step 1: Adding existing customers...')
  const existingCustomers: Customer[] = [
    {
      id: 'cust-1',
      firstName: 'John',
      lastName: 'Smith',
      email: 'john.smith@example.com',
      phone: '+1-555-0100',
      company: 'Acme Corp',
    },
    {
      id: 'cust-2',
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane.doe@example.com',
      phone: '+1-555-0200',
      company: 'Tech Inc',
    },
  ]

  for (const customer of existingCustomers) {
    await adapter.insert(customer)
  }
  console.log(`Added ${existingCustomers.length} existing customers\n`)

  // Step 2: Resolve a new candidate that produces potential matches
  console.log('Step 2: Resolving new candidate record...')
  const candidateRecord: Customer = {
    firstName: 'Jon', // Similar to "John"
    lastName: 'Smith',
    email: 'jon.smith@example.com', // Different email
    phone: '+1-555-0100', // Same phone
    company: 'Acme Corporation', // Similar company
  }

  const result = await resolver.resolveWithDatabase(candidateRecord)
  console.log(`Found ${result.matches.length} matches`)
  console.log(`Outcome: ${result.matches[0]?.outcome || 'no-match'}\n`)

  if (
    result.matches.length === 0 ||
    result.matches[0].outcome !== 'potential-match'
  ) {
    console.log('No potential matches to queue')
    return
  }

  // Step 3: Add to review queue
  console.log('Step 3: Adding to review queue...')
  const queueItem = await resolver.queue.add({
    candidateRecord,
    potentialMatches: result.matches,
    context: {
      source: 'customer-import',
      userId: 'admin',
      metadata: { importBatch: 'batch-001' },
    },
    priority: 1,
    tags: ['import', 'customer'],
  })
  console.log(`Queue item created: ${queueItem.id}`)
  console.log(`Status: ${queueItem.status}`)
  console.log(`Created at: ${queueItem.createdAt.toISOString()}\n`)

  // Step 4: List pending queue items
  console.log('Step 4: Listing pending queue items...')
  const queueList = await resolver.queue.list({
    status: 'pending',
    limit: 10,
  })
  console.log(`Found ${queueList.total} pending items`)
  console.log(`Showing ${queueList.items.length} items\n`)

  // Step 5: Get detailed queue item for review
  console.log('Step 5: Retrieving queue item for review...')
  const itemToReview = await resolver.queue.get(queueItem.id)
  if (!itemToReview) {
    console.log('Queue item not found')
    return
  }

  console.log('Candidate Record:')
  console.log(JSON.stringify(itemToReview.candidateRecord, null, 2))
  console.log('\nPotential Matches:')
  for (const match of itemToReview.potentialMatches) {
    console.log(`  - Score: ${match.score}, Record:`)
    console.log(`    ${JSON.stringify(match.record, null, 2)}`)
  }
  console.log()

  // Step 6a: Simulate reviewer confirming the match
  console.log('Step 6a: Confirming match (records are duplicates)...')
  const confirmedItem = await resolver.queue.confirm(queueItem.id, {
    selectedMatchId: itemToReview.potentialMatches[0].record.id!,
    notes: 'Same person - phone number matches, name is just a typo',
    confidence: 0.9,
    decidedBy: 'reviewer-alice',
  })
  console.log(`Status after confirm: ${confirmedItem.status}`)
  console.log(`Decided at: ${confirmedItem.decidedAt?.toISOString()}`)
  console.log(`Decision: ${confirmedItem.decision?.action}\n`)

  // Alternative: Step 6b: Reject the match (commented out)
  /*
  console.log('Step 6b: Rejecting match (records are not duplicates)...')
  const rejectedItem = await resolver.queue.reject(queueItem.id, {
    notes: 'Different people - email addresses are completely different',
    confidence: 0.95,
    decidedBy: 'reviewer-alice',
  })
  console.log(`Status after reject: ${rejectedItem.status}`)
  */

  // Step 7: Check queue statistics
  console.log('Step 7: Checking queue statistics...')
  const stats = await resolver.queue.stats()
  console.log('Queue Statistics:')
  console.log(`  Total items: ${stats.total}`)
  console.log(`  By status:`)
  console.log(`    - Pending: ${stats.byStatus.pending || 0}`)
  console.log(`    - Confirmed: ${stats.byStatus.confirmed || 0}`)
  console.log(`    - Rejected: ${stats.byStatus.rejected || 0}`)
  console.log(`  Average wait time: ${stats.avgWaitTime}ms`)
  console.log(`  Average decision time: ${stats.avgDecisionTime}ms\n`)

  console.log('=== Example Complete ===')
}

// Run the example
basicQueueExample().catch((error) => {
  console.error('Error running example:', error)
  process.exit(1)
})
