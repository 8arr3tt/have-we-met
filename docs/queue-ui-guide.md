# Queue UI Guide

Guide to building user interfaces for reviewing queue items, displaying comparisons, and capturing decisions.

## Table of Contents

- [UI Architecture](#ui-architecture)
- [Queue Item Display](#queue-item-display)
- [Field Comparison](#field-comparison)
- [Decision Interface](#decision-interface)
- [Queue Management](#queue-management)
- [Example Implementations](#example-implementations)

## UI Architecture

### Core Components

A review queue UI typically consists of:

1. **Queue List**: Shows pending items with filtering and sorting
2. **Item Detail View**: Displays full comparison of candidate and potential matches
3. **Decision Form**: Captures reviewer decision (confirm/reject/skip)
4. **Queue Dashboard**: Shows statistics and health metrics
5. **Search and Filters**: Find specific queue items

### Data Flow

```typescript
// Fetch queue items
const pending = await resolver.queue.list({
  status: 'pending',
  limit: 10,
  orderBy: 'priority',
  orderDirection: 'desc'
})

// Display to user for review

// Capture decision
const decision = await captureUserDecision(item)

// Submit decision
await resolver.queue.confirm(item.id, decision)

// Refresh list
```

## Queue Item Display

### Queue List Component

Display a list of pending items with key information:

```typescript
interface QueueListProps {
  items: QueueItem<Customer>[]
  onSelectItem: (item: QueueItem<Customer>) => void
}

function QueueList({ items, onSelectItem }: QueueListProps) {
  return (
    <div className="queue-list">
      <div className="queue-header">
        <h2>Review Queue ({items.length} items)</h2>
      </div>

      {items.map(item => (
        <div
          key={item.id}
          className="queue-item"
          onClick={() => onSelectItem(item)}
        >
          <div className="item-header">
            <span className="item-id">#{item.id.slice(0, 8)}</span>
            {item.priority && item.priority > 5 && (
              <span className="priority-badge">High Priority</span>
            )}
            {item.tags?.map(tag => (
              <span key={tag} className="tag">{tag}</span>
            ))}
          </div>

          <div className="item-summary">
            <strong>{item.candidateRecord.name}</strong>
            <span className="match-count">
              {item.potentialMatches.length} potential match(es)
            </span>
          </div>

          <div className="item-meta">
            <span>Added: {formatDate(item.createdAt)}</span>
            <span>Age: {formatAge(item.createdAt)}</span>
          </div>

          <div className="match-scores">
            {item.potentialMatches.map((match, idx) => (
              <div key={idx} className="score-bar">
                <div
                  className="score-fill"
                  style={{ width: `${match.score}%` }}
                />
                <span className="score-label">{match.score}%</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
```

### Item Detail View

Show full comparison when item is selected:

```typescript
interface ItemDetailProps {
  item: QueueItem<Customer>
  onDecide: (decision: Decision) => void
}

function ItemDetailView({ item, onDecide }: ItemDetailProps) {
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null)

  return (
    <div className="item-detail">
      <div className="detail-header">
        <h2>Review Item</h2>
        <div className="item-info">
          <span>ID: {item.id}</span>
          <span>Created: {formatDateTime(item.createdAt)}</span>
          {item.context?.source && (
            <span>Source: {item.context.source}</span>
          )}
        </div>
      </div>

      <div className="comparison-section">
        <h3>Candidate Record</h3>
        <RecordCard record={item.candidateRecord} highlight={true} />

        <h3>Potential Matches ({item.potentialMatches.length})</h3>
        {item.potentialMatches.map((match, idx) => (
          <div key={idx} className="match-option">
            <div className="match-header">
              <input
                type="radio"
                name="selected-match"
                value={match.record.id}
                onChange={() => setSelectedMatchId(match.record.id)}
              />
              <span className="match-score">
                Score: {match.score}% ({match.outcome})
              </span>
            </div>

            <RecordCard record={match.record} />

            <FieldComparison
              candidate={item.candidateRecord}
              match={match.record}
              explanation={match.explanation}
            />
          </div>
        ))}
      </div>

      <DecisionForm
        item={item}
        selectedMatchId={selectedMatchId}
        onConfirm={(decision) => onDecide({ action: 'confirm', ...decision })}
        onReject={(decision) => onDecide({ action: 'reject', ...decision })}
        onSkip={() => onDecide({ action: 'skip' })}
      />
    </div>
  )
}
```

## Field Comparison

### Side-by-Side Comparison

Display candidate and match records side by side with differences highlighted:

```typescript
interface FieldComparisonProps {
  candidate: Customer
  match: Customer
  explanation: MatchExplanation
}

function FieldComparison({ candidate, match, explanation }: FieldComparisonProps) {
  const fields = Object.keys(candidate)

  return (
    <div className="field-comparison">
      <table>
        <thead>
          <tr>
            <th>Field</th>
            <th>Candidate</th>
            <th>Match</th>
            <th>Score</th>
          </tr>
        </thead>
        <tbody>
          {fields.map(field => {
            const fieldScore = explanation.fieldScores?.find(
              fs => fs.field === field
            )

            const isDifferent = candidate[field] !== match[field]

            return (
              <tr
                key={field}
                className={isDifferent ? 'field-different' : 'field-same'}
              >
                <td className="field-name">{field}</td>
                <td className="field-value">
                  {formatFieldValue(candidate[field])}
                </td>
                <td className="field-value">
                  {formatFieldValue(match[field])}
                </td>
                <td className="field-score">
                  {fieldScore ? (
                    <ScoreBadge score={fieldScore.contribution} />
                  ) : (
                    <span>-</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {explanation.reasoning && (
        <div className="match-reasoning">
          <h4>Match Explanation</h4>
          <ul>
            {explanation.reasoning.map((reason, idx) => (
              <li key={idx}>{reason}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function ScoreBadge({ score }: { score: number }) {
  let className = 'score-badge'
  if (score > 15) className += ' score-high'
  else if (score > 5) className += ' score-medium'
  else className += ' score-low'

  return <span className={className}>{score.toFixed(1)}</span>
}
```

### Highlighting Differences

Emphasize field differences to help reviewers focus:

```typescript
function FieldValue({ value1, value2 }: { value1: any; value2: any }) {
  const isDifferent = value1 !== value2

  if (!isDifferent) {
    return <span className="value-same">{String(value1)}</span>
  }

  return (
    <div className="value-different">
      <span className="value-old">{String(value1)}</span>
      <span className="value-arrow">→</span>
      <span className="value-new">{String(value2)}</span>
    </div>
  )
}
```

### Similarity Visualization

Show how similar fields are:

```typescript
function SimilarityBar({ score }: { score: number }) {
  const getColor = (score: number) => {
    if (score > 80) return '#22c55e' // green
    if (score > 50) return '#eab308' // yellow
    return '#ef4444' // red
  }

  return (
    <div className="similarity-bar">
      <div
        className="similarity-fill"
        style={{
          width: `${score}%`,
          backgroundColor: getColor(score)
        }}
      />
      <span className="similarity-label">{score}%</span>
    </div>
  )
}
```

## Decision Interface

### Decision Form

Capture reviewer's decision with supporting information:

```typescript
interface DecisionFormProps {
  item: QueueItem<Customer>
  selectedMatchId: string | null
  onConfirm: (decision: ConfirmDecision) => void
  onReject: (decision: RejectDecision) => void
  onSkip: () => void
}

function DecisionForm({
  item,
  selectedMatchId,
  onConfirm,
  onReject,
  onSkip
}: DecisionFormProps) {
  const [notes, setNotes] = useState('')
  const [confidence, setConfidence] = useState(0.8)

  const handleConfirm = () => {
    if (!selectedMatchId) {
      alert('Please select a match to confirm')
      return
    }

    onConfirm({
      selectedMatchId,
      notes,
      confidence,
      decidedBy: getCurrentUser().email
    })
  }

  const handleReject = () => {
    onReject({
      notes,
      confidence,
      decidedBy: getCurrentUser().email
    })
  }

  return (
    <div className="decision-form">
      <h3>Make Decision</h3>

      <div className="form-group">
        <label>Notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Explain your decision..."
          rows={4}
        />
      </div>

      <div className="form-group">
        <label>Confidence: {(confidence * 100).toFixed(0)}%</label>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={confidence}
          onChange={(e) => setConfidence(parseFloat(e.target.value))}
        />
      </div>

      <div className="decision-buttons">
        <button
          className="btn btn-success"
          onClick={handleConfirm}
          disabled={!selectedMatchId}
        >
          ✓ Confirm Match
        </button>

        <button
          className="btn btn-danger"
          onClick={handleReject}
        >
          ✗ Reject Match
        </button>

        <button
          className="btn btn-secondary"
          onClick={onSkip}
        >
          Skip for Now
        </button>
      </div>

      <div className="keyboard-shortcuts">
        <small>
          Shortcuts: <kbd>C</kbd> Confirm | <kbd>R</kbd> Reject | <kbd>S</kbd> Skip
        </small>
      </div>
    </div>
  )
}
```

### Keyboard Shortcuts

Improve reviewer efficiency with keyboard navigation:

```typescript
function useKeyboardShortcuts(callbacks: {
  onConfirm: () => void
  onReject: () => void
  onSkip: () => void
  onNext: () => void
  onPrevious: () => void
}) {
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Don't trigger if typing in input/textarea
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return
      }

      switch (e.key.toLowerCase()) {
        case 'c':
          callbacks.onConfirm()
          break
        case 'r':
          callbacks.onReject()
          break
        case 's':
          callbacks.onSkip()
          break
        case 'n':
        case 'arrowright':
          callbacks.onNext()
          break
        case 'p':
        case 'arrowleft':
          callbacks.onPrevious()
          break
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [callbacks])
}
```

## Queue Management

### Dashboard Component

Display queue statistics and health:

```typescript
interface DashboardProps {
  stats: QueueStats
}

function QueueDashboard({ stats }: DashboardProps) {
  return (
    <div className="queue-dashboard">
      <h2>Queue Dashboard</h2>

      <div className="stats-grid">
        <StatCard
          title="Pending"
          value={stats.byStatus.pending || 0}
          icon="📝"
          color="blue"
        />
        <StatCard
          title="Reviewing"
          value={stats.byStatus.reviewing || 0}
          icon="👁"
          color="yellow"
        />
        <StatCard
          title="Confirmed"
          value={stats.byStatus.confirmed || 0}
          icon="✓"
          color="green"
        />
        <StatCard
          title="Rejected"
          value={stats.byStatus.rejected || 0}
          icon="✗"
          color="red"
        />
      </div>

      <div className="performance-metrics">
        <h3>Performance</h3>
        <div className="metric">
          <label>Average Wait Time:</label>
          <span>{formatDuration(stats.avgWaitTime)}</span>
        </div>
        <div className="metric">
          <label>Average Decision Time:</label>
          <span>{formatDuration(stats.avgDecisionTime)}</span>
        </div>
        {stats.throughput && (
          <>
            <div className="metric">
              <label>Throughput (24h):</label>
              <span>{stats.throughput.last24h} decisions</span>
            </div>
            <div className="metric">
              <label>Throughput (7d):</label>
              <span>{stats.throughput.last7d} decisions</span>
            </div>
          </>
        )}
      </div>

      {stats.oldestPending && (
        <div className="alert alert-warning">
          ⚠️ Oldest pending item: {formatAge(stats.oldestPending)}
        </div>
      )}
    </div>
  )
}

function StatCard({ title, value, icon, color }: any) {
  return (
    <div className={`stat-card stat-${color}`}>
      <div className="stat-icon">{icon}</div>
      <div className="stat-content">
        <div className="stat-value">{value}</div>
        <div className="stat-title">{title}</div>
      </div>
    </div>
  )
}
```

### Filters and Search

Allow reviewers to find specific items:

```typescript
interface QueueFiltersProps {
  onFilterChange: (filters: FilterOptions) => void
}

function QueueFilters({ onFilterChange }: QueueFiltersProps) {
  const [status, setStatus] = useState<QueueStatus[]>(['pending'])
  const [tags, setTags] = useState<string[]>([])
  const [minPriority, setMinPriority] = useState(0)
  const [orderBy, setOrderBy] = useState<'createdAt' | 'priority'>('createdAt')

  const applyFilters = () => {
    onFilterChange({
      status,
      tags: tags.length > 0 ? tags : undefined,
      orderBy,
      orderDirection: orderBy === 'priority' ? 'desc' : 'asc'
    })
  }

  return (
    <div className="queue-filters">
      <div className="filter-group">
        <label>Status</label>
        <select
          multiple
          value={status}
          onChange={(e) => {
            const selected = Array.from(e.target.selectedOptions, opt => opt.value)
            setStatus(selected as QueueStatus[])
          }}
        >
          <option value="pending">Pending</option>
          <option value="reviewing">Reviewing</option>
          <option value="confirmed">Confirmed</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      <div className="filter-group">
        <label>Tags</label>
        <TagInput value={tags} onChange={setTags} />
      </div>

      <div className="filter-group">
        <label>Minimum Priority</label>
        <input
          type="number"
          value={minPriority}
          onChange={(e) => setMinPriority(parseInt(e.target.value))}
        />
      </div>

      <div className="filter-group">
        <label>Order By</label>
        <select value={orderBy} onChange={(e) => setOrderBy(e.target.value as any)}>
          <option value="createdAt">Date Added</option>
          <option value="priority">Priority</option>
        </select>
      </div>

      <button onClick={applyFilters}>Apply Filters</button>
    </div>
  )
}
```

## Example Implementations

### React Application

Complete React app for queue review:

```typescript
import { useState, useEffect } from 'react'
import type { Resolver, QueueItem, Customer } from 'have-we-met'

export function QueueReviewApp({ resolver }: { resolver: Resolver<Customer> }) {
  const [items, setItems] = useState<QueueItem<Customer>[]>([])
  const [selectedItem, setSelectedItem] = useState<QueueItem<Customer> | null>(null)
  const [stats, setStats] = useState<QueueStats | null>(null)

  useEffect(() => {
    loadQueueItems()
    loadStats()
  }, [])

  async function loadQueueItems() {
    const result = await resolver.queue.list({
      status: 'pending',
      limit: 50,
      orderBy: 'priority',
      orderDirection: 'desc'
    })
    setItems(result.items)
  }

  async function loadStats() {
    const queueStats = await resolver.queue.stats()
    setStats(queueStats)
  }

  async function handleDecision(item: QueueItem<Customer>, decision: Decision) {
    try {
      if (decision.action === 'confirm') {
        await resolver.queue.confirm(item.id, {
          selectedMatchId: decision.matchId!,
          notes: decision.notes,
          decidedBy: getCurrentUser().email
        })
      } else if (decision.action === 'reject') {
        await resolver.queue.reject(item.id, {
          notes: decision.notes,
          decidedBy: getCurrentUser().email
        })
      } else if (decision.action === 'skip') {
        // Just move to next item
      }

      // Reload items and stats
      await loadQueueItems()
      await loadStats()

      // Move to next item or close
      const currentIndex = items.findIndex(i => i.id === item.id)
      if (currentIndex < items.length - 1) {
        setSelectedItem(items[currentIndex + 1])
      } else {
        setSelectedItem(null)
      }
    } catch (error) {
      console.error('Error processing decision:', error)
      alert('Failed to process decision')
    }
  }

  return (
    <div className="queue-review-app">
      <header>
        <h1>Review Queue</h1>
        {stats && <QueueStats stats={stats} />}
      </header>

      <div className="app-content">
        <aside className="queue-sidebar">
          <QueueList
            items={items}
            selectedItem={selectedItem}
            onSelectItem={setSelectedItem}
          />
        </aside>

        <main className="review-panel">
          {selectedItem ? (
            <ItemDetailView
              item={selectedItem}
              onDecide={(decision) => handleDecision(selectedItem, decision)}
            />
          ) : (
            <div className="empty-state">
              <p>Select an item from the queue to review</p>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
```

### CLI Interface

Terminal-based review interface:

```typescript
import prompts from 'prompts'
import chalk from 'chalk'

async function cliReviewQueue(resolver: Resolver<Customer>) {
  while (true) {
    const result = await resolver.queue.list({
      status: 'pending',
      limit: 1,
      orderBy: 'priority',
      orderDirection: 'desc'
    })

    if (result.items.length === 0) {
      console.log(chalk.green('✓ No more items to review!'))
      break
    }

    const item = result.items[0]

    console.clear()
    console.log(chalk.bold('\n=== Review Queue Item ===\n'))
    console.log(`ID: ${item.id}`)
    console.log(`Age: ${formatAge(item.createdAt)}`)
    console.log(`Priority: ${item.priority ?? 0}`)
    console.log()

    console.log(chalk.bold('Candidate Record:'))
    console.table(item.candidateRecord)
    console.log()

    console.log(chalk.bold(`Potential Matches (${item.potentialMatches.length}):`))
    item.potentialMatches.forEach((match, idx) => {
      console.log(chalk.yellow(`\nMatch ${idx + 1} - Score: ${match.score}%`))
      console.table(match.record)
    })

    const { action } = await prompts({
      type: 'select',
      name: 'action',
      message: 'What is your decision?',
      choices: [
        { title: '✓ Confirm Match', value: 'confirm' },
        { title: '✗ Reject Match', value: 'reject' },
        { title: '→ Skip', value: 'skip' }
      ]
    })

    if (action === 'confirm') {
      const { matchIndex } = await prompts({
        type: 'number',
        name: 'matchIndex',
        message: 'Which match? (1-' + item.potentialMatches.length + ')',
        min: 1,
        max: item.potentialMatches.length
      })

      const { notes } = await prompts({
        type: 'text',
        name: 'notes',
        message: 'Notes (optional):'
      })

      const selectedMatch = item.potentialMatches[matchIndex - 1]
      await resolver.queue.confirm(item.id, {
        selectedMatchId: selectedMatch.record.id,
        notes,
        decidedBy: 'cli-reviewer'
      })

      console.log(chalk.green('✓ Match confirmed'))
    } else if (action === 'reject') {
      const { notes } = await prompts({
        type: 'text',
        name: 'notes',
        message: 'Notes (optional):'
      })

      await resolver.queue.reject(item.id, {
        notes,
        decidedBy: 'cli-reviewer'
      })

      console.log(chalk.red('✗ Match rejected'))
    } else {
      console.log(chalk.gray('→ Skipped'))
      break
    }

    await new Promise(resolve => setTimeout(resolve, 500))
  }
}
```

## Best Practices

### User Experience

- Show most important information first (match scores, key differences)
- Use color coding to highlight differences
- Provide keyboard shortcuts for efficiency
- Display clear visual hierarchy
- Include helpful tooltips and explanations

### Performance

- Implement pagination for large queues
- Lazy load detailed comparisons
- Cache frequently accessed data
- Use optimistic updates for better responsiveness
- Debounce search and filter inputs

### Accessibility

- Use semantic HTML
- Provide keyboard navigation
- Include ARIA labels
- Ensure sufficient color contrast
- Support screen readers

### Decision Quality

- Show match explanations and reasoning
- Display field-by-field scores
- Require notes for uncertain decisions
- Capture confidence levels
- Provide context (source, tags, metadata)

### Mobile Considerations

- Responsive layout for tablet/mobile review
- Touch-friendly buttons and controls
- Simplified view for smaller screens
- Swipe gestures for navigation
- Offline support for field work

## Next Steps

- [Review Queue Overview](./review-queue.md): Core concepts and operations
- [Queue Workflows](./queue-workflows.md): Workflow patterns and best practices
- [Queue Metrics](./queue-metrics.md): Monitoring and analytics
