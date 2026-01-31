/**
 * Queue UI Integration Example
 *
 * This example demonstrates how to structure queue data for UI integration:
 * 1. Formatting queue items for display
 * 2. Field-by-field comparison structure
 * 3. Decision form data structure
 * 4. Context and explanation presentation
 */

import { HaveWeMet } from '../../src'
import type { DatabaseAdapter, QueueAdapter } from '../../src/adapters/types'
import type { QueueItem } from '../../src/queue/types'

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
  company?: string
  address?: string
}

/**
 * UI-friendly representation of a queue item
 */
interface QueueItemForUI {
  id: string
  status: string
  priority: number
  createdAt: string
  ageInMinutes: number
  candidate: Record<string, unknown>
  potentialMatches: Array<{
    matchId: string
    score: number
    confidence: 'low' | 'medium' | 'high'
    record: Record<string, unknown>
    fieldComparisons: FieldComparison[]
  }>
  context: {
    source?: string
    batchId?: string
    userId?: string
    metadata?: Record<string, unknown>
  }
  tags: string[]
}

/**
 * Field-by-field comparison for UI display
 */
interface FieldComparison {
  fieldName: string
  candidateValue: unknown
  matchValue: unknown
  similarity: number
  isDifferent: boolean
  highlightLevel: 'exact' | 'similar' | 'different'
}

/**
 * Decision form data structure
 */
interface DecisionFormData {
  queueItemId: string
  action: 'confirm' | 'reject' | 'merge'
  selectedMatchId?: string
  notes: string
  confidence: number
  reviewerId: string
}

async function queueUIIntegrationExample() {
  console.log('=== Queue UI Integration Example ===\n')

  // Setup
  const adapter = createMockAdapter<Customer>()

  // Add existing customer
  await adapter.insert({
    id: 'c1',
    firstName: 'John',
    lastName: 'Smith',
    email: 'john.smith@example.com',
    phone: '+1-555-0100',
    company: 'Acme Corporation',
    address: '123 Main St, New York, NY',
  })

  const resolver = HaveWeMet.schema<Customer>({
    firstName: { type: 'string', weight: 1.0 },
    lastName: { type: 'string', weight: 1.5 },
    email: { type: 'string', weight: 2.0 },
    phone: { type: 'string', weight: 1.0 },
    company: { type: 'string', weight: 0.5 },
    address: { type: 'string', weight: 0.5 },
  })
    .blocking((block) => block.exact('email').phonetic('lastName'))
    .matching((match) =>
      match
        .field('firstName').using('jaro-winkler', { weight: 1.0 })
        .field('lastName').using('jaro-winkler', { weight: 1.5 })
        .field('email').using('exact', { weight: 2.0 })
        .field('phone').using('exact', { weight: 1.0 })
        .field('company').using('levenshtein', { weight: 0.5 })
    )
    .thresholds({ noMatch: 20, definiteMatch: 50 })
    .adapter(adapter)
    .build()

  // Create a potential match and add to queue
  const candidate = {
    firstName: 'Jon',
    lastName: 'Smith',
    email: 'jon.smith@different.com',
    phone: '+1-555-0100',
    company: 'Acme Corp',
    address: '123 Main Street, New York, NY',
  }

  const result = await resolver.resolveWithDatabase(candidate, { autoQueue: true })
  console.log('Added item to queue\n')

  // Step 1: Fetch queue items for UI
  console.log('Step 1: Fetching queue items formatted for UI...')
  const queueList = await resolver.queue.list({
    status: 'pending',
    limit: 10,
  })

  const uiItems = queueList.items.map(formatQueueItemForUI)
  console.log(`Formatted ${uiItems.length} items for UI\n`)

  // Step 2: Display detailed queue item
  if (uiItems.length > 0) {
    const item = uiItems[0]

    console.log('Step 2: Queue Item UI Data Structure:')
    console.log('=====================================\n')

    console.log('Header Section:')
    console.log(`  Queue ID: ${item.id}`)
    console.log(`  Status: ${item.status}`)
    console.log(`  Priority: ${'★'.repeat(item.priority + 1)}`)
    console.log(`  Age: ${item.ageInMinutes} minutes ago`)
    console.log(`  Tags: ${item.tags.join(', ')}`)
    console.log()

    console.log('Context Section:')
    console.log(`  Source: ${item.context.source || 'Unknown'}`)
    console.log(`  Batch ID: ${item.context.batchId || 'N/A'}`)
    console.log(`  Imported by: ${item.context.userId || 'System'}`)
    console.log()

    console.log('Candidate Record:')
    console.log(JSON.stringify(item.candidate, null, 2))
    console.log()

    console.log('Potential Matches:')
    for (let i = 0; i < item.potentialMatches.length; i++) {
      const match = item.potentialMatches[i]
      console.log(`\n  Match ${i + 1}:`)
      console.log(`  Score: ${match.score.toFixed(2)} (${match.confidence} confidence)`)
      console.log(`  Record ID: ${match.matchId}`)
      console.log()

      console.log('  Field-by-Field Comparison:')
      console.log('  ┌─────────────────┬──────────────────────────────┬──────────────────────────────┬────────────┐')
      console.log('  │ Field           │ Candidate                    │ Existing                     │ Match      │')
      console.log('  ├─────────────────┼──────────────────────────────┼──────────────────────────────┼────────────┤')

      for (const field of match.fieldComparisons) {
        const highlight = getHighlightSymbol(field.highlightLevel)
        const candidateStr = String(field.candidateValue || '').padEnd(28).substring(0, 28)
        const matchStr = String(field.matchValue || '').padEnd(28).substring(0, 28)
        const fieldNameStr = field.fieldName.padEnd(15).substring(0, 15)

        console.log(`  │ ${fieldNameStr} │ ${candidateStr} │ ${matchStr} │ ${highlight.padEnd(10)} │`)
      }

      console.log('  └─────────────────┴──────────────────────────────┴──────────────────────────────┴────────────┘')
    }
    console.log()
  }

  // Step 3: Decision form structure
  console.log('Step 3: Decision Form Data Structure:')
  console.log('======================================\n')

  const exampleDecisions: DecisionFormData[] = [
    {
      queueItemId: uiItems[0]?.id || 'q1',
      action: 'confirm',
      selectedMatchId: 'c1',
      notes: 'Same person - phone number matches, name is a typo',
      confidence: 0.9,
      reviewerId: 'reviewer-alice',
    },
    {
      queueItemId: uiItems[0]?.id || 'q1',
      action: 'reject',
      notes: 'Different people - email addresses completely different',
      confidence: 0.85,
      reviewerId: 'reviewer-alice',
    },
    {
      queueItemId: uiItems[0]?.id || 'q1',
      action: 'merge',
      selectedMatchId: 'c1',
      notes: 'Confirmed duplicate - merge into existing record',
      confidence: 0.95,
      reviewerId: 'reviewer-alice',
    },
  ]

  console.log('Example Decision Forms:\n')
  for (const decision of exampleDecisions) {
    console.log(`Action: ${decision.action.toUpperCase()}`)
    console.log(`  Queue Item: ${decision.queueItemId}`)
    if (decision.selectedMatchId) {
      console.log(`  Selected Match: ${decision.selectedMatchId}`)
    }
    console.log(`  Reviewer: ${decision.reviewerId}`)
    console.log(`  Confidence: ${(decision.confidence * 100).toFixed(0)}%`)
    console.log(`  Notes: ${decision.notes}`)
    console.log()
  }

  // Step 4: API endpoint examples
  console.log('Step 4: Example API Endpoints for UI:')
  console.log('======================================\n')

  console.log('GET /api/queue/items')
  console.log('  - List pending queue items')
  console.log('  - Query params: status, limit, offset, orderBy')
  console.log('  - Returns: QueueItemForUI[]')
  console.log()

  console.log('GET /api/queue/items/:id')
  console.log('  - Get detailed queue item')
  console.log('  - Returns: QueueItemForUI with full field comparisons')
  console.log()

  console.log('POST /api/queue/items/:id/confirm')
  console.log('  - Confirm match decision')
  console.log('  - Body: { selectedMatchId, notes, confidence, reviewerId }')
  console.log('  - Returns: Updated queue item')
  console.log()

  console.log('POST /api/queue/items/:id/reject')
  console.log('  - Reject match decision')
  console.log('  - Body: { notes, confidence, reviewerId }')
  console.log('  - Returns: Updated queue item')
  console.log()

  console.log('POST /api/queue/items/:id/merge')
  console.log('  - Merge records decision')
  console.log('  - Body: { selectedMatchId, notes, confidence, reviewerId }')
  console.log('  - Returns: Updated queue item + merged record')
  console.log()

  console.log('GET /api/queue/stats')
  console.log('  - Get queue statistics')
  console.log('  - Returns: Queue metrics for dashboard')
  console.log()

  // Step 5: React component structure example
  console.log('Step 5: Example React Component Structure:')
  console.log('===========================================\n')

  console.log(`
// QueueReviewPage.tsx
export function QueueReviewPage() {
  return (
    <div>
      <QueueStats />
      <QueueFilters />
      <QueueItemList items={queueItems} onSelectItem={handleSelectItem} />
    </div>
  )
}

// QueueItemDetailModal.tsx
export function QueueItemDetailModal({ item }: { item: QueueItemForUI }) {
  return (
    <Modal>
      <QueueItemHeader item={item} />
      <CandidateRecordPanel record={item.candidate} />
      <PotentialMatchesList matches={item.potentialMatches} />
      <DecisionForm itemId={item.id} onDecide={handleDecision} />
    </Modal>
  )
}

// FieldComparisonTable.tsx
export function FieldComparisonTable({ comparisons }: { comparisons: FieldComparison[] }) {
  return (
    <table>
      <thead>
        <tr>
          <th>Field</th>
          <th>Candidate</th>
          <th>Existing</th>
          <th>Similarity</th>
        </tr>
      </thead>
      <tbody>
        {comparisons.map(field => (
          <tr key={field.fieldName} className={getHighlightClass(field.highlightLevel)}>
            <td>{field.fieldName}</td>
            <td>{field.candidateValue}</td>
            <td>{field.matchValue}</td>
            <td>{(field.similarity * 100).toFixed(0)}%</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// DecisionForm.tsx
export function DecisionForm({ itemId, onDecide }: DecisionFormProps) {
  const [notes, setNotes] = useState('')
  const [confidence, setConfidence] = useState(0.8)

  return (
    <form>
      <textarea value={notes} onChange={e => setNotes(e.target.value)} />
      <input type="range" min="0" max="1" step="0.05" value={confidence} />
      <button onClick={() => onDecide({ action: 'confirm', notes, confidence })}>
        Confirm Match
      </button>
      <button onClick={() => onDecide({ action: 'reject', notes, confidence })}>
        Reject Match
      </button>
    </form>
  )
}
`)

  console.log('=== Example Complete ===')
}

/**
 * Format queue item for UI display
 */
function formatQueueItemForUI(item: QueueItem<Customer>): QueueItemForUI {
  const ageInMinutes = Math.floor((Date.now() - item.createdAt.getTime()) / 60000)

  return {
    id: item.id,
    status: item.status,
    priority: item.priority || 0,
    createdAt: item.createdAt.toISOString(),
    ageInMinutes,
    candidate: item.candidateRecord,
    potentialMatches: item.potentialMatches.map((match) => ({
      matchId: match.record.id || 'unknown',
      score: match.score,
      confidence: getConfidenceLevel(match.score),
      record: match.record,
      fieldComparisons: createFieldComparisons(item.candidateRecord, match.record, match.explanation),
    })),
    context: {
      source: item.context?.source,
      batchId: item.context?.batchId,
      userId: item.context?.userId,
      metadata: item.context?.metadata,
    },
    tags: item.tags || [],
  }
}

/**
 * Create field-by-field comparisons
 */
function createFieldComparisons(
  candidate: Customer,
  match: Customer,
  explanation: any
): FieldComparison[] {
  const fields: (keyof Customer)[] = ['firstName', 'lastName', 'email', 'phone', 'company', 'address']

  return fields.map((fieldName) => {
    const candidateValue = candidate[fieldName]
    const matchValue = match[fieldName]

    const fieldScore = explanation.fieldScores?.find((fs: any) => fs.field === fieldName)
    const similarity = fieldScore?.score || 0

    const isDifferent = candidateValue !== matchValue
    const highlightLevel = getHighlightLevel(similarity, isDifferent)

    return {
      fieldName,
      candidateValue,
      matchValue,
      similarity,
      isDifferent,
      highlightLevel,
    }
  })
}

/**
 * Get confidence level based on score
 */
function getConfidenceLevel(score: number): 'low' | 'medium' | 'high' {
  if (score < 25) return 'low'
  if (score < 40) return 'medium'
  return 'high'
}

/**
 * Get highlight level for field comparison
 */
function getHighlightLevel(
  similarity: number,
  isDifferent: boolean
): 'exact' | 'similar' | 'different' {
  if (!isDifferent || similarity >= 0.95) return 'exact'
  if (similarity >= 0.7) return 'similar'
  return 'different'
}

/**
 * Get visual symbol for highlight level
 */
function getHighlightSymbol(level: 'exact' | 'similar' | 'different'): string {
  switch (level) {
    case 'exact':
      return '✓ Exact'
    case 'similar':
      return '≈ Similar'
    case 'different':
      return '✗ Different'
  }
}

// Run the example
queueUIIntegrationExample().catch((error) => {
  console.error('Error running example:', error)
  process.exit(1)
})
