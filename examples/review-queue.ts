/**
 * Review Queue Example
 *
 * This example demonstrates the human-in-the-loop review workflow for handling
 * ambiguous matches. The review queue:
 * - Captures potential matches that need human judgment
 * - Provides context and field-by-field comparisons
 * - Tracks review decisions and throughput
 * - Feeds decisions back to improve ML models
 *
 * This is essential for regulated industries (healthcare, finance) where
 * automated decisions may not be appropriate for all matches.
 */

import { HaveWeMet } from '../src/index.js'
import type { DatabaseAdapter } from '../src/adapters/types.js'
import type { QueueItem, QueueItemStatus } from '../src/queue/types.js'

interface Patient {
  id?: string
  firstName: string
  lastName: string
  dateOfBirth: string
  nhsNumber?: string
  phone?: string
  email?: string
  address?: string
}

// Mock queue storage for demonstration
const queueStorage: QueueItem<Patient>[] = []

const createMockAdapter = (): DatabaseAdapter<Patient> => {
  const mockData: Patient[] = [
    {
      id: '1',
      firstName: 'John',
      lastName: 'Smith',
      dateOfBirth: '1980-05-15',
      nhsNumber: '4505577104',
      phone: '+44-20-7123-4567',
      address: '10 Downing Street, London',
    },
    {
      id: '2',
      firstName: 'Sarah',
      lastName: 'Johnson',
      dateOfBirth: '1975-11-22',
      phone: '+44-161-496-0000',
      address: '123 Oxford Road, Manchester',
    },
  ]

  return {
    create: async (record) => {
      const newRecord = { ...record, id: String(mockData.length + 1) }
      mockData.push(newRecord)
      return newRecord
    },
    findById: async (id) => mockData.find((r) => r.id === id) || null,
    findByIds: async (ids) => mockData.filter((r) => ids.includes(r.id)),
    findAll: async () => mockData,
    query: async () => mockData,
    update: async (id, updates) => {
      const record = mockData.find((r) => r.id === id)
      if (!record) return null
      Object.assign(record, updates)
      return record
    },
    delete: async (id) => {
      const index = mockData.findIndex((r) => r.id === id)
      if (index === -1) return false
      mockData.splice(index, 1)
      return true
    },
    transaction: async (fn) => fn(),
    count: async () => mockData.length,
    // Queue-specific methods
    createQueueItem: async (item) => {
      const newItem = { ...item, id: String(queueStorage.length + 1) }
      queueStorage.push(newItem as QueueItem<Patient>)
      return newItem as QueueItem<Patient>
    },
    findQueueItems: async (filter) => {
      let filtered = queueStorage
      if (filter.status) {
        filtered = filtered.filter((item) => item.status === filter.status)
      }
      if (filter.priority) {
        filtered = filtered.filter((item) => item.priority === filter.priority)
      }
      return filtered.slice(0, filter.limit || 10)
    },
    updateQueueItem: async (id, updates) => {
      const item = queueStorage.find((i) => i.id === id)
      if (!item) return null
      Object.assign(item, updates)
      return item
    },
    deleteQueueItem: async (id) => {
      const index = queueStorage.findIndex((i) => i.id === id)
      if (index === -1) return false
      queueStorage.splice(index, 1)
      return true
    },
    getQueueStats: async () => ({
      total: queueStorage.length,
      byStatus: {
        pending: queueStorage.filter((i) => i.status === 'pending').length,
        reviewing: queueStorage.filter((i) => i.status === 'reviewing').length,
        confirmed: queueStorage.filter((i) => i.status === 'confirmed').length,
        rejected: queueStorage.filter((i) => i.status === 'rejected').length,
        merged: queueStorage.filter((i) => i.status === 'merged').length,
        expired: queueStorage.filter((i) => i.status === 'expired').length,
      },
    }),
  } as DatabaseAdapter<Patient>
}

const adapter = createMockAdapter()

// Configure resolver with auto-queueing
const resolver = HaveWeMet.create<Patient>()
  .schema((schema) =>
    schema
      .field('firstName', { type: 'name', component: 'first' })
      .field('lastName', { type: 'name', component: 'last' })
      .field('dateOfBirth', { type: 'date' })
      .field('nhsNumber', { type: 'string' })
      .field('phone', { type: 'phone' })
      .field('email', { type: 'email' })
      .field('address', { type: 'string' })
  )
  .blocking((block) => block.onField('lastName', { transform: 'soundex' }).onField('dateOfBirth', { transform: 'year' }))
  .matching((match) =>
    match
      .field('nhsNumber')
      .strategy('exact')
      .weight(30) // NHS number is definitive
      .field('dateOfBirth')
      .strategy('exact')
      .weight(15)
      .field('firstName')
      .strategy('jaro-winkler')
      .weight(10)
      .threshold(0.85)
      .field('lastName')
      .strategy('jaro-winkler')
      .weight(10)
      .threshold(0.85)
      .field('phone')
      .strategy('exact')
      .weight(10)
      .thresholds({ noMatch: 20, definiteMatch: 50 })
  )
  .adapter(adapter)
  .build()

console.log('=== Review Queue Example ===\n')

;(async () => {
  try {
    // ========================================================================
    // Example 1: Auto-Queue Potential Matches
    // ========================================================================
    console.log('Example 1: Auto-queue potential matches during resolution\n')

    const newPatient: Patient = {
      firstName: 'Jon', // Typo: "Jon" instead of "John"
      lastName: 'Smith',
      dateOfBirth: '1980-05-15',
      phone: '+44-20-7123-9999', // Different phone
      address: '10 Downing St, London', // Similar address
      // No NHS number provided
    }

    console.log('New Patient Registration:')
    console.log(`  Name: ${newPatient.firstName} ${newPatient.lastName}`)
    console.log(`  DOB: ${newPatient.dateOfBirth}`)
    console.log(`  Phone: ${newPatient.phone}`)
    console.log()

    // Resolve with auto-queueing enabled
    const results = await resolver.resolve(newPatient, {
      autoQueue: true,
      queueContext: {
        source: 'patient-registration',
        userId: 'nurse-station-1',
        metadata: { facility: 'London General Hospital' },
      },
    })

    console.log('Resolution Results:')
    results.forEach((result) => {
      if (result.outcome === 'potential-match') {
        console.log(`  ⚠ Potential match with patient ID: ${result.record.id}`)
        console.log(`    Score: ${result.score.totalScore} (threshold: 20-50)`)
        console.log(`    Automatically queued for review`)
      }
    })
    console.log()

    // ========================================================================
    // Example 2: Review Pending Items
    // ========================================================================
    console.log('Example 2: Review pending queue items\n')

    const pendingItems = await resolver.queue.list({
      status: 'pending' as QueueItemStatus,
      orderBy: 'priority',
      orderDirection: 'desc',
      limit: 10,
    })

    console.log(`Found ${pendingItems.items.length} pending items for review:\n`)

    pendingItems.items.forEach((item, index) => {
      console.log(`Item ${index + 1} [${item.id}]:`)
      console.log(`  Priority: ${item.priority || 'normal'}`)
      console.log(`  Source: ${item.context?.source || 'unknown'}`)
      console.log(`  New Record:`)
      console.log(`    ${item.sourceRecord.firstName} ${item.sourceRecord.lastName}`)
      console.log(`    DOB: ${item.sourceRecord.dateOfBirth}`)
      console.log(`  Potential Matches: ${item.potentialMatches.length}`)
      item.potentialMatches.forEach((match, i) => {
        console.log(`    Match ${i + 1}: ${match.record.firstName} ${match.record.lastName} (score: ${match.score.totalScore})`)
      })
      console.log()
    })

    // ========================================================================
    // Example 3: Make Review Decisions
    // ========================================================================
    if (pendingItems.items.length > 0) {
      console.log('Example 3: Making review decisions\n')

      const itemToReview = pendingItems.items[0]

      // Scenario A: Confirm it's a match
      console.log('Scenario A: Confirming match (same patient)')
      console.log(`  Reviewer examined: name typo, address match, DOB match`)
      console.log(`  Decision: Confirmed match\n`)

      await resolver.queue.confirm(itemToReview.id, {
        selectedMatchId: itemToReview.potentialMatches[0].record.id!,
        notes: 'Same patient - name was typo, DOB and address match exactly',
        decidedBy: 'dr.sarah.jones@hospital.nhs.uk',
      })

      const confirmedItem = await resolver.queue.get(itemToReview.id)
      console.log(`  ✓ Queue item status: ${confirmedItem?.status}`)
      console.log(`  ✓ Decision recorded with notes`)
      console.log(`  ✓ Can now merge records if needed\n`)

      // Scenario B: Reject match (different patient)
      console.log('Scenario B: Rejecting match (different patient)')
      console.log(`  Reviewer examined: name similar but phone/NHS number don't match`)
      console.log(`  Decision: Not a match - create new record\n`)

      // Create another item for demonstration
      const anotherPatient: Patient = {
        firstName: 'Sarah',
        lastName: 'Johnston', // Similar to "Johnson"
        dateOfBirth: '1975-11-20', // Close but different
        phone: '+44-161-999-0000',
      }

      await resolver.resolve(anotherPatient, { autoQueue: true })
      const items = await resolver.queue.list({ status: 'pending' as QueueItemStatus, limit: 1 })

      if (items.items.length > 0) {
        await resolver.queue.reject(items.items[0].id, {
          notes: 'Different patient - DOB differs by 2 days, different phone number',
          decidedBy: 'dr.sarah.jones@hospital.nhs.uk',
        })
        console.log(`  ✓ Match rejected`)
        console.log(`  ✓ Safe to create new patient record\n`)
      }
    }

    // ========================================================================
    // Example 4: Queue Metrics and Monitoring
    // ========================================================================
    console.log('Example 4: Queue metrics and monitoring\n')

    const stats = await resolver.queue.stats()

    console.log('Queue Statistics:')
    console.log(`  Total items: ${stats.total}`)
    console.log(`  By status:`)
    console.log(`    Pending: ${stats.byStatus.pending}`)
    console.log(`    Reviewing: ${stats.byStatus.reviewing}`)
    console.log(`    Confirmed: ${stats.byStatus.confirmed}`)
    console.log(`    Rejected: ${stats.byStatus.rejected}`)
    console.log(`    Merged: ${stats.byStatus.merged}`)
    console.log()

    if (stats.throughput) {
      console.log('Throughput:')
      console.log(`  Last 24 hours: ${stats.throughput.last24h} decisions`)
      console.log(`  Last 7 days: ${stats.throughput.last7d} decisions`)
      console.log(`  Last 30 days: ${stats.throughput.last30d} decisions`)
      console.log()
    }

    if (stats.waitTimes) {
      console.log('Wait Times:')
      console.log(`  Average: ${stats.waitTimes.average}ms`)
      console.log(`  Median: ${stats.waitTimes.median}ms`)
      console.log(`  95th percentile: ${stats.waitTimes.p95}ms`)
      console.log()
    }

    // ========================================================================
    // Example 5: Queue Cleanup
    // ========================================================================
    console.log('Example 5: Queue cleanup and maintenance\n')

    console.log('Cleanup old decided items:')
    console.log('```typescript')
    console.log('// Remove items decided more than 90 days ago')
    console.log('const deleted = await resolver.queue.cleanup({')
    console.log('  olderThan: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),')
    console.log('  statuses: [\'confirmed\', \'rejected\'],')
    console.log('})')
    console.log('```')
    console.log()

    console.log('Mark stale items as expired:')
    console.log('```typescript')
    console.log('// Items pending more than 30 days')
    console.log('const expired = await resolver.queue.cleanup({')
    console.log('  olderThan: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),')
    console.log('  statuses: [\'pending\'],')
    console.log('  markAsExpired: true,')
    console.log('})')
    console.log('```')
    console.log()

    // ========================================================================
    // Best Practices
    // ========================================================================
    console.log('=== Best Practices ===\n')

    console.log('1. Priority Management:')
    console.log('   - Use high priority for critical records (e.g., emergency admissions)')
    console.log('   - Use normal priority for routine registrations')
    console.log('   - Use low priority for bulk data imports')
    console.log()

    console.log('2. Context and Metadata:')
    console.log('   - Always include source (where the record came from)')
    console.log('   - Include userId for audit trails')
    console.log('   - Add relevant metadata (facility, department, batch ID)')
    console.log()

    console.log('3. Review Workflow:')
    console.log('   - Assign items to specific reviewers using tags')
    console.log('   - Set items to "reviewing" status when opened')
    console.log('   - Require detailed notes for audit compliance')
    console.log('   - Use confirm/reject appropriately based on business rules')
    console.log()

    console.log('4. Monitoring:')
    console.log('   - Track queue size daily')
    console.log('   - Monitor wait times (p95 should be < 24 hours for most use cases)')
    console.log('   - Track reviewer throughput for capacity planning')
    console.log('   - Alert on growing backlogs')
    console.log()

    console.log('5. Integration with ML:')
    console.log('   - Use FeedbackCollector to gather decided items')
    console.log('   - Retrain models periodically (e.g., monthly) with new decisions')
    console.log('   - Monitor ML accuracy over time')
    console.log('   - Adjust thresholds based on review rates')
  } catch (error) {
    console.error('Error:', error)
  }
})()
