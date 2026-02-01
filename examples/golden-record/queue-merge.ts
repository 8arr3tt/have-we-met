/**
 * Queue Merge Integration Example
 *
 * This example demonstrates the complete review queue to golden record workflow:
 * 1. Set up resolver with matching and merge configuration
 * 2. Resolve a record and add potential matches to the queue
 * 3. Review the queue item and make a merge decision
 * 4. Execute the merge from the queue decision
 * 5. Verify the golden record and provenance
 */

import {
  MergeExecutor,
  QueueMergeHandler,
  createInMemoryProvenanceStore,
  createInMemorySourceRecordArchive,
  createMergeBuilder,
} from '../../src/merge'
import type { SourceRecord, Provenance } from '../../src/merge'
import type { QueueItem, QueueAdapter, MergeDecision } from '../../src/queue/types'
import type { MatchExplanation } from '../../src/types/match'

interface Customer {
  id: string
  firstName: string
  lastName: string
  email: string
  phone?: string
  company?: string
  createdAt: Date
  updatedAt: Date
}

// In-memory queue adapter for demonstration
function createMockQueueAdapter<T extends Record<string, unknown>>(): QueueAdapter<T> {
  const items = new Map<string, QueueItem<T>>()

  return {
    insertQueueItem: async (item: QueueItem<T>) => {
      items.set(item.id, item)
      return item
    },
    updateQueueItem: async (id: string, updates: Partial<QueueItem<T>>) => {
      const item = items.get(id)
      if (!item) throw new Error(`Queue item ${id} not found`)
      const updated = { ...item, ...updates }
      items.set(id, updated)
      return updated
    },
    findQueueItems: async () => Array.from(items.values()),
    findQueueItemById: async (id: string) => items.get(id) || null,
    deleteQueueItem: async (id: string) => { items.delete(id) },
    countQueueItems: async () => items.size,
    batchInsertQueueItems: async (newItems: QueueItem<T>[]) => {
      for (const item of newItems) {
        items.set(item.id, item)
      }
      return newItems
    },
  }
}

// Simulated database for golden records
const goldenRecordsDb = new Map<string, Customer>()
const archivedRecordsDb = new Set<string>()

async function queueMergeExample() {
  console.log('=== Queue Merge Integration Example ===\n')

  // Step 1: Set up merge configuration
  console.log('Step 1: Setting up merge configuration...')
  const mergeConfig = createMergeBuilder<Customer>()
    .timestampField('updatedAt')
    .defaultStrategy('preferNonNull')
    .onConflict('useDefault')
    .field('firstName').strategy('preferLonger')
    .field('lastName').strategy('preferLonger')
    .field('email').strategy('preferNewer')
    .field('phone').strategy('preferNonNull')
    .field('company').strategy('preferNewer')
    .build()

  console.log('Merge configuration created')
  console.log()

  // Step 2: Create merge infrastructure
  console.log('Step 2: Creating merge infrastructure...')
  const mergeExecutor = new MergeExecutor<Customer>(mergeConfig)
  const provenanceStore = createInMemoryProvenanceStore()
  const sourceRecordArchive = createInMemorySourceRecordArchive<Customer>()
  const queueAdapter = createMockQueueAdapter<Customer>()

  const queueMergeHandler = new QueueMergeHandler<Customer>({
    mergeExecutor,
    provenanceStore,
    sourceRecordArchive,
    queueAdapter,
    onGoldenRecordCreate: async (record, id) => {
      console.log(`  [DB] Creating golden record ${id}`)
      goldenRecordsDb.set(id, record)
    },
    onSourceRecordsArchive: async (ids) => {
      console.log(`  [DB] Archiving source records: ${ids.join(', ')}`)
      ids.forEach((id) => archivedRecordsDb.add(id))
    },
  })

  console.log('Queue merge handler created')
  console.log()

  // Step 3: Simulate a queue item from the review queue
  console.log('Step 3: Creating a queue item (simulating resolver output)...')
  const now = new Date()
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000)

  const candidateRecord: Customer = {
    id: 'cust-new-001',
    firstName: 'Jon',
    lastName: 'Smith',
    email: 'jon.smith@company.com',
    phone: '+1-555-0100',
    company: 'Acme Corp',
    createdAt: now,
    updatedAt: now,
  }

  const existingRecord: Customer = {
    id: 'cust-existing-001',
    firstName: 'Jonathan',
    lastName: 'Smith',
    email: 'jonathan.smith@oldmail.com',
    phone: undefined,
    company: 'Acme Corporation',
    createdAt: hourAgo,
    updatedAt: hourAgo,
  }

  // Create a mock match explanation
  const matchExplanation: MatchExplanation = {
    overallScore: 42,
    fieldBreakdown: [
      {
        field: 'firstName',
        score: 8.5,
        weight: 1.0,
        comparator: 'jaro-winkler',
        similarity: 0.85,
        candidateValue: 'Jon',
        matchedValue: 'Jonathan',
      },
      {
        field: 'lastName',
        score: 15,
        weight: 1.5,
        comparator: 'jaro-winkler',
        similarity: 1.0,
        candidateValue: 'Smith',
        matchedValue: 'Smith',
      },
      {
        field: 'company',
        score: 4.5,
        weight: 0.5,
        comparator: 'levenshtein',
        similarity: 0.9,
        candidateValue: 'Acme Corp',
        matchedValue: 'Acme Corporation',
      },
    ],
    matchFactors: ['Same last name', 'Similar first name', 'Similar company'],
    noMatchFactors: ['Different email domains'],
    confidence: 0.75,
  }

  const queueItem: QueueItem<Customer> = {
    id: 'queue-item-001',
    candidateRecord,
    potentialMatches: [
      {
        record: existingRecord,
        score: 42,
        outcome: 'potential-match',
        explanation: matchExplanation,
      },
    ],
    status: 'pending',
    createdAt: now,
    updatedAt: now,
    priority: 1,
    tags: ['customer-import', 'potential-duplicate'],
    context: {
      source: 'crm-import',
      userId: 'system',
      batchId: 'batch-2024-001',
    },
  }

  // Insert into queue
  await queueAdapter.insertQueueItem(queueItem)

  console.log('Queue item created:')
  console.log(`  ID: ${queueItem.id}`)
  console.log(`  Status: ${queueItem.status}`)
  console.log(`  Candidate: ${candidateRecord.firstName} ${candidateRecord.lastName}`)
  console.log(`  Potential match: ${existingRecord.firstName} ${existingRecord.lastName}`)
  console.log(`  Match score: ${queueItem.potentialMatches[0].score}`)
  console.log()

  // Step 4: Simulate reviewer examining the queue item
  console.log('Step 4: Reviewer examines the queue item...')
  console.log()
  console.log('Candidate Record:')
  console.log(`  Name: ${candidateRecord.firstName} ${candidateRecord.lastName}`)
  console.log(`  Email: ${candidateRecord.email}`)
  console.log(`  Phone: ${candidateRecord.phone}`)
  console.log(`  Company: ${candidateRecord.company}`)
  console.log()
  console.log('Potential Match:')
  console.log(`  Name: ${existingRecord.firstName} ${existingRecord.lastName}`)
  console.log(`  Email: ${existingRecord.email}`)
  console.log(`  Phone: ${existingRecord.phone || '(none)'}`)
  console.log(`  Company: ${existingRecord.company}`)
  console.log()
  console.log('Match Explanation:')
  console.log(`  Overall Score: ${matchExplanation.overallScore}`)
  console.log(`  Confidence: ${(matchExplanation.confidence! * 100).toFixed(0)}%`)
  console.log(`  Match Factors: ${matchExplanation.matchFactors.join(', ')}`)
  console.log(`  No-Match Factors: ${matchExplanation.noMatchFactors?.join(', ') || 'None'}`)
  console.log()

  // Step 5: Check if merge is possible
  console.log('Step 5: Validating merge possibility...')
  const canMerge = queueMergeHandler.canMerge(queueItem, existingRecord.id)
  console.log(`  Can merge: ${canMerge.canMerge}`)
  if (!canMerge.canMerge) {
    console.log(`  Reason: ${canMerge.reason}`)
    return
  }
  console.log()

  // Step 6: Reviewer makes merge decision
  console.log('Step 6: Reviewer decides to merge records...')
  const mergeDecision: MergeDecision = {
    selectedMatchId: existingRecord.id,
    notes: 'Same person - Jon is a nickname for Jonathan, company name variation',
    confidence: 0.95,
    decidedBy: 'reviewer-alice',
  }

  console.log('Merge Decision:')
  console.log(`  Selected Match: ${mergeDecision.selectedMatchId}`)
  console.log(`  Confidence: ${(mergeDecision.confidence! * 100).toFixed(0)}%`)
  console.log(`  Notes: ${mergeDecision.notes}`)
  console.log(`  Decided By: ${mergeDecision.decidedBy}`)
  console.log()

  // Step 7: Execute the queue merge
  console.log('Step 7: Executing queue merge...')
  const mergeResult = await queueMergeHandler.handleMergeDecision(queueItem, mergeDecision)

  console.log('Merge executed successfully!')
  console.log()

  // Step 8: Display the golden record
  console.log('Step 8: Golden record created:')
  console.log(`  ID: ${mergeResult.goldenRecordId}`)
  console.log(`  Name: ${mergeResult.goldenRecord.firstName} ${mergeResult.goldenRecord.lastName}`)
  console.log(`  Email: ${mergeResult.goldenRecord.email}`)
  console.log(`  Phone: ${mergeResult.goldenRecord.phone}`)
  console.log(`  Company: ${mergeResult.goldenRecord.company}`)
  console.log()

  // Step 9: Verify provenance was recorded
  console.log('Step 9: Verifying provenance...')
  const provenance = await provenanceStore.get(mergeResult.goldenRecordId)
  if (provenance) {
    console.log('Provenance recorded:')
    console.log(`  Golden Record ID: ${provenance.goldenRecordId}`)
    console.log(`  Source Records: ${provenance.sourceRecordIds.join(', ')}`)
    console.log(`  Queue Item ID: ${provenance.queueItemId}`)
    console.log(`  Merged At: ${provenance.mergedAt.toISOString()}`)
    console.log(`  Merged By: ${provenance.mergedBy}`)
  }
  console.log()

  // Step 10: Verify queue item was updated
  console.log('Step 10: Verifying queue item status...')
  console.log(`  Queue Item Updated: ${mergeResult.queueItemUpdated}`)
  const updatedQueueItem = await queueAdapter.findQueueItemById(queueItem.id)
  if (updatedQueueItem) {
    console.log(`  New Status: ${updatedQueueItem.status}`)
    console.log(`  Decision: ${updatedQueueItem.decision?.action}`)
  }
  console.log()

  // Step 11: Verify database state
  console.log('Step 11: Verifying database state...')
  console.log(`  Golden records in DB: ${goldenRecordsDb.size}`)
  console.log(`  Archived source records: ${archivedRecordsDb.size}`)
  console.log(`  Source records archived: ${Array.from(archivedRecordsDb).join(', ')}`)
  console.log()

  // Step 12: Query provenance by source record
  console.log('Step 12: Querying provenance by source record...')
  const provenanceBySource = await provenanceStore.getBySourceId(existingRecord.id)
  console.log(`  Found ${provenanceBySource.length} provenance record(s) for ${existingRecord.id}`)
  if (provenanceBySource.length > 0) {
    console.log(`  Golden record created from this source: ${provenanceBySource[0].goldenRecordId}`)
  }
  console.log()

  console.log('=== Example Complete ===')
  console.log()
  console.log('Summary:')
  console.log('- Queue item was reviewed and merge decision made')
  console.log('- Source records were merged into a golden record')
  console.log('- Golden record was persisted to the database')
  console.log('- Source records were archived')
  console.log('- Provenance was recorded with queue item reference')
  console.log('- Queue item status was updated to "merged"')

  return mergeResult
}

// Run the example
queueMergeExample().catch((error) => {
  console.error('Error running example:', error)
  process.exit(1)
})
