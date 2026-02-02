# Queue Metrics and Monitoring

Comprehensive guide to tracking, analyzing, and monitoring review queue health and performance.

## Table of Contents

- [Core Metrics](#core-metrics)
- [Queue Statistics](#queue-statistics)
- [Metrics Collection](#metrics-collection)
- [Health Monitoring](#health-monitoring)
- [Alerts and Notifications](#alerts-and-notifications)
- [Reporting](#reporting)
- [Performance Optimization](#performance-optimization)

## Core Metrics

### Queue Size Metrics

Track the number of items at each status:

```typescript
const stats = await resolver.queue.stats()

console.log('Queue Size by Status:')
console.log(`  Pending: ${stats.byStatus.pending}`)
console.log(`  Reviewing: ${stats.byStatus.reviewing}`)
console.log(`  Confirmed: ${stats.byStatus.confirmed}`)
console.log(`  Rejected: ${stats.byStatus.rejected}`)
console.log(`  Merged: ${stats.byStatus.merged}`)
console.log(`  Expired: ${stats.byStatus.expired}`)
console.log(`  Total: ${stats.total}`)
```

### Timing Metrics

Measure how long items spend in the queue:

```typescript
const stats = await resolver.queue.stats()

console.log('Timing Metrics:')
console.log(
  `  Average wait time: ${stats.avgWaitTime}ms (${formatDuration(stats.avgWaitTime)})`
)
console.log(
  `  Average decision time: ${stats.avgDecisionTime}ms (${formatDuration(stats.avgDecisionTime)})`
)

if (stats.oldestPending) {
  const age = Date.now() - stats.oldestPending.getTime()
  console.log(`  Oldest pending: ${formatDuration(age)} ago`)
}

function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60000)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) return `${days}d ${hours % 24}h`
  if (hours > 0) return `${hours}h ${minutes % 60}m`
  return `${minutes}m`
}
```

### Throughput Metrics

Track decision velocity:

```typescript
const stats = await resolver.queue.stats()

if (stats.throughput) {
  console.log('Throughput:')
  console.log(`  Last 24 hours: ${stats.throughput.last24h} decisions`)
  console.log(`  Last 7 days: ${stats.throughput.last7d} decisions`)
  console.log(`  Last 30 days: ${stats.throughput.last30d} decisions`)

  // Calculate rates
  const hourlyRate = stats.throughput.last24h / 24
  const dailyRate = stats.throughput.last7d / 7
  console.log(`  Average hourly rate: ${hourlyRate.toFixed(1)}`)
  console.log(`  Average daily rate: ${dailyRate.toFixed(1)}`)
}
```

### Decision Quality Metrics

Track decision patterns:

```typescript
async function getDecisionMetrics(resolver: Resolver<Customer>, since: Date) {
  const items = await resolver.queue.list({
    status: ['confirmed', 'rejected'],
    since,
    limit: 10000,
  })

  const confirmed = items.items.filter((i) => i.status === 'confirmed')
  const rejected = items.items.filter((i) => i.status === 'rejected')

  const confirmRate = confirmed.length / items.total
  const rejectRate = rejected.length / items.total

  // Average confidence scores
  const avgConfirmedConfidence =
    confirmed.reduce((sum, item) => sum + (item.decision?.confidence ?? 0), 0) /
    confirmed.length

  const avgRejectedConfidence =
    rejected.reduce((sum, item) => sum + (item.decision?.confidence ?? 0), 0) /
    rejected.length

  return {
    total: items.total,
    confirmed: confirmed.length,
    rejected: rejected.length,
    confirmRate,
    rejectRate,
    avgConfirmedConfidence,
    avgRejectedConfidence,
  }
}
```

## Queue Statistics

### Real-Time Stats

Get current queue state:

```typescript
async function displayCurrentStats(resolver: Resolver<Customer>) {
  const stats = await resolver.queue.stats()

  console.log('═══════════════════════════════════════')
  console.log('         QUEUE STATISTICS')
  console.log('═══════════════════════════════════════')
  console.log(`Total Items: ${stats.total}`)
  console.log('')
  console.log('By Status:')
  console.log(`  📝 Pending:   ${stats.byStatus.pending || 0}`)
  console.log(`  👁  Reviewing: ${stats.byStatus.reviewing || 0}`)
  console.log(`  ✓  Confirmed: ${stats.byStatus.confirmed || 0}`)
  console.log(`  ✗  Rejected:  ${stats.byStatus.rejected || 0}`)
  console.log(`  🔀 Merged:    ${stats.byStatus.merged || 0}`)
  console.log(`  ⏰ Expired:   ${stats.byStatus.expired || 0}`)
  console.log('')
  console.log('Performance:')
  console.log(`  Avg Wait: ${formatDuration(stats.avgWaitTime)}`)
  console.log(`  Avg Decision: ${formatDuration(stats.avgDecisionTime)}`)

  if (stats.throughput) {
    console.log('')
    console.log('Throughput:')
    console.log(`  24h: ${stats.throughput.last24h}`)
    console.log(`  7d:  ${stats.throughput.last7d}`)
    console.log(`  30d: ${stats.throughput.last30d}`)
  }

  console.log('═══════════════════════════════════════')
}
```

### Historical Trends

Track metrics over time:

```typescript
interface HistoricalMetric {
  timestamp: Date
  pending: number
  reviewing: number
  decided: number
  throughput: number
}

async function collectHistoricalMetrics(
  resolver: Resolver<Customer>
): Promise<HistoricalMetric> {
  const stats = await resolver.queue.stats()

  return {
    timestamp: new Date(),
    pending: stats.byStatus.pending || 0,
    reviewing: stats.byStatus.reviewing || 0,
    decided: (stats.byStatus.confirmed || 0) + (stats.byStatus.rejected || 0),
    throughput: stats.throughput?.last24h || 0,
  }
}

// Collect metrics every hour
async function startMetricsCollection(resolver: Resolver<Customer>) {
  const metrics: HistoricalMetric[] = []

  setInterval(
    async () => {
      const metric = await collectHistoricalMetrics(resolver)
      metrics.push(metric)

      // Keep last 30 days of hourly data
      const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000
      const filtered = metrics.filter(
        (m) => m.timestamp.getTime() > thirtyDaysAgo
      )
      metrics.length = 0
      metrics.push(...filtered)

      // Store to database or metrics service
      await storeMetric(metric)
    },
    60 * 60 * 1000
  ) // Every hour
}
```

### Age Distribution

Understand how long items stay in the queue:

```typescript
async function getAgeDistribution(resolver: Resolver<Customer>) {
  const items = await resolver.queue.list({
    status: 'pending',
    limit: 10000,
  })

  const now = Date.now()
  const buckets = {
    under_1h: 0,
    '1h_to_24h': 0,
    '1d_to_7d': 0,
    '7d_to_30d': 0,
    over_30d: 0,
  }

  for (const item of items.items) {
    const ageMs = now - item.createdAt.getTime()
    const ageHours = ageMs / (60 * 60 * 1000)
    const ageDays = ageHours / 24

    if (ageHours < 1) buckets.under_1h++
    else if (ageHours < 24) buckets['1h_to_24h']++
    else if (ageDays < 7) buckets['1d_to_7d']++
    else if (ageDays < 30) buckets['7d_to_30d']++
    else buckets.over_30d++
  }

  console.log('Age Distribution:')
  console.log(
    `  < 1 hour:    ${buckets.under_1h} (${percentage(buckets.under_1h, items.total)}%)`
  )
  console.log(
    `  1-24 hours:  ${buckets['1h_to_24h']} (${percentage(buckets['1h_to_24h'], items.total)}%)`
  )
  console.log(
    `  1-7 days:    ${buckets['1d_to_7d']} (${percentage(buckets['1d_to_7d'], items.total)}%)`
  )
  console.log(
    `  7-30 days:   ${buckets['7d_to_30d']} (${percentage(buckets['7d_to_30d'], items.total)}%)`
  )
  console.log(
    `  > 30 days:   ${buckets.over_30d} (${percentage(buckets.over_30d, items.total)}%)`
  )

  return buckets
}

function percentage(count: number, total: number): string {
  return ((count / total) * 100).toFixed(1)
}
```

## Metrics Collection

### Using QueueMetrics Class

```typescript
import { QueueMetrics } from 'have-we-met/queue'

async function calculateMetrics(resolver: Resolver<Customer>) {
  const items = await resolver.queue.list({
    limit: 10000,
  })

  const metrics = new QueueMetrics()
  const stats = metrics.calculate(items.items)

  console.log('Calculated Metrics:', stats)
}
```

### Custom Metrics

Define and track custom metrics:

```typescript
interface CustomMetrics {
  queueGrowthRate: number
  reviewerEfficiency: number
  matchQuality: number
  slaCompliance: number
}

async function calculateCustomMetrics(
  resolver: Resolver<Customer>,
  slaHours: number = 24
): Promise<CustomMetrics> {
  const stats = await resolver.queue.stats()
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)

  // Queue growth rate (items added vs decided in last 24h)
  const queueGrowthRate = stats.throughput
    ? (stats.byStatus.pending || 0) / stats.throughput.last24h
    : 0

  // Reviewer efficiency (decisions per hour)
  const reviewerEfficiency = stats.throughput
    ? stats.throughput.last24h / 24
    : 0

  // Match quality (confirm rate)
  const decided =
    (stats.byStatus.confirmed || 0) + (stats.byStatus.rejected || 0)
  const matchQuality =
    decided > 0 ? (stats.byStatus.confirmed || 0) / decided : 0

  // SLA compliance (items decided within SLA)
  const recentItems = await resolver.queue.list({
    status: ['confirmed', 'rejected'],
    since: oneDayAgo,
    limit: 1000,
  })

  const withinSla = recentItems.items.filter((item) => {
    const waitTime = item.decidedAt!.getTime() - item.createdAt.getTime()
    const waitHours = waitTime / (60 * 60 * 1000)
    return waitHours <= slaHours
  }).length

  const slaCompliance =
    recentItems.total > 0 ? withinSla / recentItems.total : 1

  return {
    queueGrowthRate,
    reviewerEfficiency,
    matchQuality,
    slaCompliance,
  }
}
```

## Health Monitoring

### Queue Health Score

Calculate overall queue health:

```typescript
async function calculateQueueHealth(
  resolver: Resolver<Customer>
): Promise<{ score: number; status: 'healthy' | 'warning' | 'critical' }> {
  const stats = await resolver.queue.stats()
  let score = 100

  // Penalize large pending queue
  const pendingCount = stats.byStatus.pending || 0
  if (pendingCount > 100) score -= 20
  else if (pendingCount > 50) score -= 10

  // Penalize old items
  if (stats.oldestPending) {
    const ageHours =
      (Date.now() - stats.oldestPending.getTime()) / (60 * 60 * 1000)
    if (ageHours > 168)
      score -= 30 // > 7 days
    else if (ageHours > 48)
      score -= 15 // > 2 days
    else if (ageHours > 24) score -= 5 // > 1 day
  }

  // Penalize low throughput
  if (stats.throughput) {
    const hourlyRate = stats.throughput.last24h / 24
    if (hourlyRate < 1) score -= 20
    else if (hourlyRate < 5) score -= 10
  }

  // Penalize high review time
  const avgDecisionHours = stats.avgDecisionTime / (60 * 60 * 1000)
  if (avgDecisionHours > 48) score -= 15
  else if (avgDecisionHours > 24) score -= 5

  let status: 'healthy' | 'warning' | 'critical'
  if (score >= 80) status = 'healthy'
  else if (score >= 60) status = 'warning'
  else status = 'critical'

  return { score: Math.max(0, score), status }
}
```

### Health Dashboard

Display comprehensive health information:

```typescript
async function displayHealthDashboard(resolver: Resolver<Customer>) {
  const stats = await resolver.queue.stats()
  const health = await calculateQueueHealth(resolver)
  const ageDistribution = await getAgeDistribution(resolver)
  const customMetrics = await calculateCustomMetrics(resolver)

  console.log('═══════════════════════════════════════')
  console.log('      QUEUE HEALTH DASHBOARD')
  console.log('═══════════════════════════════════════')
  console.log(
    `Health Score: ${health.score}/100 (${health.status.toUpperCase()})`
  )
  console.log('')
  console.log(`Pending Items: ${stats.byStatus.pending || 0}`)
  console.log(
    `Oldest Item: ${stats.oldestPending ? formatDuration(Date.now() - stats.oldestPending.getTime()) : 'N/A'}`
  )
  console.log(`Throughput (24h): ${stats.throughput?.last24h || 0} decisions`)
  console.log('')
  console.log('Custom Metrics:')
  console.log(
    `  Queue Growth Rate: ${customMetrics.queueGrowthRate.toFixed(2)}`
  )
  console.log(
    `  Reviewer Efficiency: ${customMetrics.reviewerEfficiency.toFixed(1)} decisions/hour`
  )
  console.log(
    `  Match Quality: ${(customMetrics.matchQuality * 100).toFixed(1)}%`
  )
  console.log(
    `  SLA Compliance: ${(customMetrics.slaCompliance * 100).toFixed(1)}%`
  )
  console.log('═══════════════════════════════════════')
}
```

## Alerts and Notifications

### Using QueueAlerts

```typescript
import { QueueAlerts } from 'have-we-met/queue'

async function checkQueueAlerts(resolver: Resolver<Customer>) {
  const alerts = new QueueAlerts(resolver.queue)

  // Check queue size
  const sizeAlerts = await alerts.checkQueueSize(100) // Alert if > 100 pending
  for (const alert of sizeAlerts) {
    console.log(`[${alert.severity}] ${alert.message}`)
  }

  // Check aging
  const agingAlerts = await alerts.checkAging(7 * 24 * 60 * 60 * 1000) // 7 days
  for (const alert of agingAlerts) {
    console.log(`[${alert.severity}] ${alert.message}`)
  }

  // Check throughput
  const throughputAlerts = await alerts.checkThroughput(10) // Min 10 decisions/day
  for (const alert of throughputAlerts) {
    console.log(`[${alert.severity}] ${alert.message}`)
  }
}
```

### Custom Alert Rules

Define custom alerting logic:

```typescript
interface Alert {
  severity: 'info' | 'warning' | 'critical'
  type: string
  message: string
  timestamp: Date
  metadata?: any
}

async function customAlertRules(
  resolver: Resolver<Customer>
): Promise<Alert[]> {
  const alerts: Alert[] = []
  const stats = await resolver.queue.stats()
  const pending = stats.byStatus.pending || 0

  // Alert: Queue size exceeds threshold
  if (pending > 200) {
    alerts.push({
      severity: 'critical',
      type: 'queue_size',
      message: `Queue has ${pending} pending items (critical threshold: 200)`,
      timestamp: new Date(),
      metadata: { pendingCount: pending },
    })
  } else if (pending > 100) {
    alerts.push({
      severity: 'warning',
      type: 'queue_size',
      message: `Queue has ${pending} pending items (warning threshold: 100)`,
      timestamp: new Date(),
      metadata: { pendingCount: pending },
    })
  }

  // Alert: Items aging beyond SLA
  if (stats.oldestPending) {
    const ageHours =
      (Date.now() - stats.oldestPending.getTime()) / (60 * 60 * 1000)
    if (ageHours > 72) {
      // 3 days
      alerts.push({
        severity: 'critical',
        type: 'item_aging',
        message: `Oldest item is ${ageHours.toFixed(0)} hours old (SLA: 72h)`,
        timestamp: new Date(),
        metadata: { ageHours },
      })
    }
  }

  // Alert: Low throughput
  const hourlyRate = stats.throughput ? stats.throughput.last24h / 24 : 0
  if (hourlyRate < 2) {
    alerts.push({
      severity: 'warning',
      type: 'low_throughput',
      message: `Low throughput: ${hourlyRate.toFixed(1)} decisions/hour`,
      timestamp: new Date(),
      metadata: { hourlyRate },
    })
  }

  // Alert: Queue growing faster than processed
  const customMetrics = await calculateCustomMetrics(resolver)
  if (customMetrics.queueGrowthRate > 1.5) {
    alerts.push({
      severity: 'warning',
      type: 'queue_growth',
      message: `Queue growing faster than being processed (rate: ${customMetrics.queueGrowthRate.toFixed(2)})`,
      timestamp: new Date(),
      metadata: { growthRate: customMetrics.queueGrowthRate },
    })
  }

  return alerts
}
```

### Alert Notifications

Send alerts via various channels:

```typescript
async function sendAlertNotifications(alerts: Alert[]) {
  for (const alert of alerts) {
    // Send email for critical alerts
    if (alert.severity === 'critical') {
      await sendEmail({
        to: 'ops@example.com',
        subject: `[CRITICAL] Queue Alert: ${alert.type}`,
        body: alert.message,
      })
    }

    // Post to Slack
    await postToSlack({
      channel: '#queue-alerts',
      text: `[${alert.severity.toUpperCase()}] ${alert.message}`,
      metadata: alert.metadata,
    })

    // Log to monitoring service
    await logToMonitoring({
      type: 'queue_alert',
      severity: alert.severity,
      message: alert.message,
      metadata: alert.metadata,
    })
  }
}
```

## Reporting

### Daily Summary Report

```typescript
async function generateDailySummary(
  resolver: Resolver<Customer>
): Promise<string> {
  const stats = await resolver.queue.stats()
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const decisions = await getDecisionMetrics(resolver, yesterday)

  const report = `
Queue Daily Summary - ${new Date().toISOString().split('T')[0]}

Current State:
  Pending: ${stats.byStatus.pending || 0}
  Reviewing: ${stats.byStatus.reviewing || 0}

Yesterday's Activity:
  Total Decisions: ${decisions.total}
  Confirmed: ${decisions.confirmed} (${(decisions.confirmRate * 100).toFixed(1)}%)
  Rejected: ${decisions.rejected} (${(decisions.rejectRate * 100).toFixed(1)}%)

Performance:
  Average Wait Time: ${formatDuration(stats.avgWaitTime)}
  Average Decision Time: ${formatDuration(stats.avgDecisionTime)}
  Throughput (24h): ${stats.throughput?.last24h || 0} decisions

${stats.oldestPending ? `⚠️  Oldest pending item: ${formatDuration(Date.now() - stats.oldestPending.getTime())} old` : ''}
  `.trim()

  return report
}
```

### Reviewer Performance Report

```typescript
async function generateReviewerReport(
  resolver: Resolver<Customer>,
  reviewerId: string,
  days: number = 7
): Promise<string> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const performance = await getReviewerPerformance(resolver, reviewerId, since)

  return `
Reviewer Performance Report - ${reviewerId}
Period: Last ${days} days

Activity:
  Total Decisions: ${performance.total}
  Confirmed: ${performance.confirmed}
  Rejected: ${performance.rejected}
  Confirm Rate: ${(performance.confirmRate * 100).toFixed(1)}%

Efficiency:
  Average Decision Time: ${performance.avgDecisionTimeMinutes.toFixed(1)} minutes
  Decisions per Day: ${(performance.total / days).toFixed(1)}
  `.trim()
}
```

## Performance Optimization

### Monitoring Query Performance

```typescript
async function measureQueryPerformance(resolver: Resolver<Customer>) {
  // Test list query performance
  const start = Date.now()
  const result = await resolver.queue.list({
    status: 'pending',
    limit: 100,
  })
  const duration = Date.now() - start

  console.log(`List query (100 items): ${duration}ms`)

  if (duration > 500) {
    console.warn('⚠️  Query performance degraded, consider adding indexes')
  }
}
```

### Index Recommendations

Based on common queries, ensure these indexes exist:

```sql
-- Status filtering (most common query)
CREATE INDEX idx_queue_status ON review_queue(status);

-- Date range queries
CREATE INDEX idx_queue_created_at ON review_queue(created_at);

-- Priority ordering
CREATE INDEX idx_queue_priority ON review_queue(priority);

-- Composite index for common query pattern
CREATE INDEX idx_queue_status_created ON review_queue(status, created_at);

-- Tag filtering (if using PostgreSQL arrays)
CREATE INDEX idx_queue_tags ON review_queue USING GIN(tags);
```

### Metrics Caching

Cache frequently accessed metrics:

```typescript
class CachedMetrics {
  private cache: QueueStats | null = null
  private lastUpdate = 0
  private cacheDuration = 60000 // 1 minute

  async getStats(resolver: Resolver<Customer>): Promise<QueueStats> {
    const now = Date.now()

    if (this.cache && now - this.lastUpdate < this.cacheDuration) {
      return this.cache
    }

    this.cache = await resolver.queue.stats()
    this.lastUpdate = now
    return this.cache
  }

  invalidate() {
    this.cache = null
    this.lastUpdate = 0
  }
}
```

## Best Practices

### Metrics Collection

- Collect metrics at regular intervals (hourly or daily)
- Store historical data for trend analysis
- Use appropriate granularity (don't over-sample)
- Archive old metrics to prevent database bloat

### Alerting

- Define clear thresholds for alerts
- Use severity levels (info, warning, critical)
- Avoid alert fatigue (don't over-alert)
- Provide actionable information in alerts
- Route critical alerts to on-call staff

### Reporting

- Generate daily summaries for queue health
- Track reviewer performance for workload balancing
- Include trends (improving vs degrading)
- Export data for external analytics tools
- Schedule reports to run automatically

### Performance

- Cache frequently accessed metrics
- Use database indexes for common queries
- Implement pagination for large result sets
- Monitor query performance and optimize as needed
- Consider read replicas for heavy analytics workloads

## Next Steps

- [Review Queue Overview](./review-queue.md): Core concepts and operations
- [Queue Workflows](./queue-workflows.md): Common workflow patterns
- [Queue UI Guide](./queue-ui-guide.md): Building review interfaces
