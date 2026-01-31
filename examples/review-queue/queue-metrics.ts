/**
 * Queue Metrics and Reporting Example
 *
 * This example demonstrates:
 * 1. Adding multiple items to the queue
 * 2. Generating queue statistics and metrics
 * 3. Using alerts to monitor queue health
 * 4. Creating summary and detailed reports
 */

import { HaveWeMet } from '../../src'
import type { DatabaseAdapter, QueueAdapter } from '../../src/adapters/types'
import type { QueueItem } from '../../src/queue/types'
import { QueueMetrics } from '../../src/queue/metrics'
import { QueueReporter } from '../../src/queue/reporter'
import { QueueAlerts } from '../../src/queue/alerts'

// Simple mock adapter for examples
function createMockAdapter<T extends Record<string, unknown>>(): DatabaseAdapter<T> {
  const records: T[] = []
  const queueItems: QueueItem<T>[] = []

  return {
    insert: async (record: T) => {
      const id = (record as any).id || `id-${Date.now()}-${Math.random()}`
      const newRecord = { ...record, id } as T
      records.push(newRecord)
      return newRecord
    },
    update: async () => ({} as T),
    delete: async () => {},
    findById: async (id: string) => records.find((r) => (r as any).id === id) || null,
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
      findQueueItemById: async (id: string) => queueItems.find((i) => i.id === id) || null,
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
}

async function queueMetricsExample() {
  console.log('=== Queue Metrics and Reporting Example ===\n')

  const adapter = createMockAdapter<Customer>()
  const resolver = HaveWeMet.schema<Customer>({
    firstName: { type: 'string', weight: 1.0 },
    lastName: { type: 'string', weight: 1.5 },
    email: { type: 'string', weight: 2.0 },
    phone: { type: 'string', weight: 1.0 },
  })
    .blocking((block) => block.exact('email'))
    .matching((match) =>
      match
        .field('firstName').using('jaro-winkler', { weight: 1.0 })
        .field('lastName').using('jaro-winkler', { weight: 1.5 })
        .field('email').using('exact', { weight: 2.0 })
    )
    .thresholds({ noMatch: 20, definiteMatch: 50 })
    .adapter(adapter)
    .build()

  // Step 1: Add several items to the queue
  console.log('Step 1: Adding items to queue...')

  const queueItems = [
    {
      candidateRecord: { firstName: 'Alice', lastName: 'Johnson', email: 'a.johnson@example.com' },
      potentialMatches: [{
        record: { id: 'c1', firstName: 'Alicia', lastName: 'Johnson', email: 'alicia.j@example.com' },
        score: 35,
        outcome: 'potential-match' as const,
        explanation: { totalScore: 35, fieldScores: [], missingFields: [] },
      }],
      priority: 2,
      tags: ['high-priority', 'import'],
    },
    {
      candidateRecord: { firstName: 'Bob', lastName: 'Smith', email: 'bob.smith@example.com' },
      potentialMatches: [{
        record: { id: 'c2', firstName: 'Robert', lastName: 'Smith', email: 'r.smith@example.com' },
        score: 30,
        outcome: 'potential-match' as const,
        explanation: { totalScore: 30, fieldScores: [], missingFields: [] },
      }],
      priority: 1,
      tags: ['import'],
    },
    {
      candidateRecord: { firstName: 'Carol', lastName: 'White', email: 'carol.w@example.com' },
      potentialMatches: [{
        record: { id: 'c3', firstName: 'Caroline', lastName: 'White', email: 'caroline.white@example.com' },
        score: 38,
        outcome: 'potential-match' as const,
        explanation: { totalScore: 38, fieldScores: [], missingFields: [] },
      }],
      priority: 0,
      tags: ['import', 'review-needed'],
    },
  ]

  for (const item of queueItems) {
    await resolver.queue.add(item)
  }
  console.log(`Added ${queueItems.length} items to queue\n`)

  // Simulate some aging by waiting and making some decisions
  console.log('Step 2: Simulating reviewer activity...')

  // Get the first item and confirm it
  const firstItems = await resolver.queue.list({ status: 'pending', limit: 1 })
  if (firstItems.items.length > 0) {
    const item = firstItems.items[0]
    await resolver.queue.confirm(item.id, {
      selectedMatchId: item.potentialMatches[0].record.id!,
      notes: 'Confirmed match',
      decidedBy: 'reviewer-alice',
    })
    console.log('  - Confirmed 1 item')
  }

  // Get the second item and reject it
  const pendingItems = await resolver.queue.list({ status: 'pending', limit: 1 })
  if (pendingItems.items.length > 0) {
    const item = pendingItems.items[0]
    await resolver.queue.reject(item.id, {
      notes: 'Not a match',
      decidedBy: 'reviewer-bob',
    })
    console.log('  - Rejected 1 item')
  }
  console.log()

  // Step 3: Get queue statistics
  console.log('Step 3: Retrieving queue statistics...')
  const stats = await resolver.queue.stats()

  console.log('Queue Statistics:')
  console.log(`  Total items: ${stats.total}`)
  console.log('  By status:')
  console.log(`    - Pending: ${stats.byStatus.pending || 0}`)
  console.log(`    - Reviewing: ${stats.byStatus.reviewing || 0}`)
  console.log(`    - Confirmed: ${stats.byStatus.confirmed || 0}`)
  console.log(`    - Rejected: ${stats.byStatus.rejected || 0}`)
  console.log(`    - Merged: ${stats.byStatus.merged || 0}`)
  console.log(`    - Expired: ${stats.byStatus.expired || 0}`)
  console.log(`  Average wait time: ${stats.avgWaitTime.toFixed(2)}ms`)
  console.log(`  Average decision time: ${stats.avgDecisionTime.toFixed(2)}ms`)

  if (stats.oldestPending) {
    const ageMs = Date.now() - stats.oldestPending.getTime()
    console.log(`  Oldest pending: ${(ageMs / 1000).toFixed(2)}s ago`)
  }

  if (stats.throughput) {
    console.log('  Throughput:')
    console.log(`    - Last 24h: ${stats.throughput.last24h} decisions`)
    console.log(`    - Last 7d: ${stats.throughput.last7d} decisions`)
    console.log(`    - Last 30d: ${stats.throughput.last30d} decisions`)
  }
  console.log()

  // Step 4: Use QueueMetrics for detailed analysis
  console.log('Step 4: Generating detailed metrics...')
  const allItems = await resolver.queue.list({ limit: 100 })
  const metrics = new QueueMetrics()

  const detailedMetrics = metrics.calculate(allItems.items)
  console.log('Detailed Metrics:')
  console.log(`  Total analyzed: ${detailedMetrics.total}`)
  console.log(`  Status breakdown:`, detailedMetrics.byStatus)

  const ageDistribution = metrics.calculateAgeDistribution(allItems.items)
  console.log('  Age distribution:')
  console.log(`    - < 1 hour: ${ageDistribution['<1h']}`)
  console.log(`    - 1-24 hours: ${ageDistribution['1-24h']}`)
  console.log(`    - 1-7 days: ${ageDistribution['1-7d']}`)
  console.log(`    - > 7 days: ${ageDistribution['>7d']}`)
  console.log()

  // Step 5: Generate reports
  console.log('Step 5: Generating queue reports...')
  const reporter = new QueueReporter(resolver.queue)

  const summary = await reporter.generateSummary()
  console.log('Summary Report:')
  console.log(summary)
  console.log()

  const reviewerReport = await reporter.generateReviewerReport('reviewer-alice')
  console.log('Reviewer Report (reviewer-alice):')
  console.log(reviewerReport)
  console.log()

  // Step 6: Check for alerts
  console.log('Step 6: Checking for queue health alerts...')
  const alerts = new QueueAlerts(resolver.queue)

  // Check if queue is too large
  const sizeAlerts = await alerts.checkQueueSize(5)
  if (sizeAlerts.length > 0) {
    console.log('Queue Size Alerts:')
    for (const alert of sizeAlerts) {
      console.log(`  [${alert.severity}] ${alert.message}`)
    }
  } else {
    console.log('  ✓ Queue size is healthy')
  }

  // Check if items are aging
  const agingAlerts = await alerts.checkAging(24 * 60 * 60 * 1000) // 24 hours
  if (agingAlerts.length > 0) {
    console.log('Aging Alerts:')
    for (const alert of agingAlerts) {
      console.log(`  [${alert.severity}] ${alert.message}`)
    }
  } else {
    console.log('  ✓ No items aging beyond threshold')
  }

  // Check throughput
  const throughputAlerts = await alerts.checkThroughput(10) // 10 decisions per day minimum
  if (throughputAlerts.length > 0) {
    console.log('Throughput Alerts:')
    for (const alert of throughputAlerts) {
      console.log(`  [${alert.severity}] ${alert.message}`)
    }
  } else {
    console.log('  ✓ Throughput is acceptable')
  }
  console.log()

  // Step 7: Export queue data
  console.log('Step 7: Exporting queue data...')
  const csvData = await reporter.exportToCsv(allItems.items)
  console.log('CSV Export (first 200 chars):')
  console.log(csvData.substring(0, 200) + '...\n')

  const jsonData = await reporter.exportToJson(allItems.items)
  console.log('JSON Export (item count):')
  console.log(`Exported ${JSON.parse(jsonData).length} items\n`)

  console.log('=== Example Complete ===')
}

// Run the example
queueMetricsExample().catch((error) => {
  console.error('Error running example:', error)
  process.exit(1)
})
