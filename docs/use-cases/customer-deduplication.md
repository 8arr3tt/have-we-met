# Customer Deduplication Guide

This guide demonstrates how to use have-we-met for customer data deduplication in e-commerce, retail, and CRM systems. Customer deduplication eliminates redundant records, creates unified customer profiles, and improves marketing effectiveness.

## Overview

### The Challenge

Customer databases accumulate duplicates from multiple sources:
- Website registrations with different emails
- Point-of-sale captures with typos
- CRM imports from acquired companies
- Marketing campaign sign-ups
- Support ticket creation

Duplicates lead to:
- Repeated marketing to the same customer
- Fragmented purchase history
- Inconsistent customer experience
- Inaccurate reporting and analytics

### Goals

- **High precision**: Avoid merging different customers (false positives are costly)
- **Reasonable recall**: Catch most duplicates without excessive manual review
- **Actionable results**: Auto-merge high-confidence matches, queue borderline cases

## Complete Implementation

### Step 1: Define Your Schema

```typescript
import { HaveWeMet } from 'have-we-met'
import { prismaAdapter } from 'have-we-met/adapters/prisma'
import { PrismaClient } from '@prisma/client'

interface Customer {
  id?: string
  email: string
  phone?: string
  firstName: string
  lastName: string
  billingAddress?: string
  billingCity?: string
  billingState?: string
  billingZip?: string
  shippingAddress?: string
  shippingCity?: string
  shippingZip?: string
  createdAt: Date
  updatedAt: Date
  source?: string
  loyaltyId?: string
}
```

### Step 2: Configure the Resolver

```typescript
const prisma = new PrismaClient()

const resolver = HaveWeMet.create<Customer>()
  .schema(schema => schema
    .field('email').type('email')
    .field('phone').type('phone')
    .field('firstName').type('name').component('first')
    .field('lastName').type('name').component('last')
    .field('billingAddress').type('address')
    .field('billingCity').type('string')
    .field('billingState').type('string')
    .field('billingZip').type('string')
    .field('shippingAddress').type('address')
    .field('shippingCity').type('string')
    .field('shippingZip').type('string')
    .field('createdAt').type('date')
    .field('updatedAt').type('date')
    .field('loyaltyId').type('string')
  )
  .blocking(block => block
    // Primary: Block by email domain to group corporate customers
    .onField('email', { transform: 'domain' })
    // Also block by last name soundex for customers with different emails
    .composite('union', comp => comp
      .onField('email', { transform: 'domain' })
      .onField('lastName', { transform: 'soundex' })
    )
  )
  .matching(match => match
    // Email is the most reliable identifier
    .field('email').strategy('exact').weight(25)

    // Loyalty ID is definitive when present
    .field('loyaltyId').strategy('exact').weight(30)

    // Phone helps but changes frequently
    .field('phone').strategy('exact').weight(12)

    // Names require fuzzy matching with high threshold
    .field('firstName').strategy('jaro-winkler').weight(10).threshold(0.88)
    .field('lastName').strategy('jaro-winkler').weight(10).threshold(0.90)

    // Address matching for supporting evidence
    .field('billingZip').strategy('exact').weight(8)
    .field('billingCity').strategy('jaro-winkler').weight(5).threshold(0.85)

    // Conservative thresholds for high precision
    // Max possible: 100 (if all fields match)
    // noMatch: 20 (~20% - clear non-matches)
    // definiteMatch: 55 (~55% - strong evidence required)
    .thresholds({ noMatch: 20, definiteMatch: 55 })
  )
  .merge(merge => merge
    .timestampField('updatedAt')
    .defaultStrategy('preferNonNull')

    // Names: prefer longer (more complete)
    .field('firstName').strategy('preferLonger')
    .field('lastName').strategy('preferLonger')

    // Contact info: prefer newer
    .field('email').strategy('preferNewer')
    .field('phone').strategy('preferNewer')

    // Address: prefer newer (most current)
    .field('billingAddress').strategy('preferNewer')
    .field('billingCity').strategy('preferNewer')
    .field('billingState').strategy('preferNewer')
    .field('billingZip').strategy('preferNewer')
    .field('shippingAddress').strategy('preferNewer')
    .field('shippingCity').strategy('preferNewer')
    .field('shippingZip').strategy('preferNewer')

    // Loyalty ID: prefer non-null (keep the ID if we have one)
    .field('loyaltyId').strategy('preferNonNull')

    // Track which record won each field
    .trackProvenance(true)
  )
  .adapter(prismaAdapter(prisma, { tableName: 'customers' }))
  .build()
```

### Step 3: Run Batch Deduplication

```typescript
async function deduplicateCustomers() {
  // Load all customers
  const customers = await prisma.customer.findMany()

  console.log(`Starting deduplication of ${customers.length} customers`)

  // Run batch deduplication
  const results = await resolver.deduplicateBatch(customers, {
    autoQueue: true,  // Auto-queue potential matches for review
    queueContext: {
      source: 'scheduled-dedup',
      metadata: { runDate: new Date().toISOString() }
    }
  })

  console.log('Deduplication complete:')
  console.log(`  Definite matches: ${results.definiteMatches}`)
  console.log(`  Potential matches (queued): ${results.potentialMatches}`)
  console.log(`  No matches: ${results.noMatches}`)
  console.log(`  Total comparisons: ${results.comparisons}`)

  return results
}
```

### Step 4: Process Definite Matches

```typescript
async function processDefiniteMatches(results) {
  for (const match of results.matches.filter(m => m.outcome === 'definite-match')) {
    // Review the match explanation before merging
    console.log('Match found:')
    console.log(`  Record A: ${match.recordA.email} - ${match.recordA.firstName} ${match.recordA.lastName}`)
    console.log(`  Record B: ${match.recordB.email} - ${match.recordB.firstName} ${match.recordB.lastName}`)
    console.log(`  Score: ${match.score}/${match.maxScore}`)
    console.log(`  Explanation:`)

    for (const field of match.explanation.fieldComparisons) {
      const icon = field.contributed ? '✓' : '✗'
      console.log(`    ${icon} ${field.field}: ${field.similarity.toFixed(2)} × ${field.weight} = ${field.contribution.toFixed(1)}`)
    }

    // Execute the merge
    const mergeResult = await resolver.merge([match.recordA, match.recordB], {
      mergedBy: 'automated-dedup'
    })

    console.log(`  Created golden record: ${mergeResult.goldenRecordId}`)
  }
}
```

### Step 5: Handle the Review Queue

```typescript
async function reviewPendingMatches() {
  // Get pending items from queue
  const pending = await resolver.queue.list({
    status: 'pending',
    orderBy: 'priority',
    orderDirection: 'desc',
    limit: 50
  })

  console.log(`${pending.total} items pending review`)

  for (const item of pending.items) {
    // Display for human review
    console.log('\n--- Review Item ---')
    console.log('Candidate:', item.candidateRecord)

    for (const match of item.potentialMatches) {
      console.log(`\nPotential match (score: ${match.score}):`)
      console.log('  Record:', match.record)
      console.log('  Explanation:', match.explanation.summary)
    }

    // In production, this would be UI-driven
    // For this example, we'll simulate a decision
  }
}

// Confirm a match (typically called from UI)
async function confirmMatch(itemId: string, matchId: string, reviewerId: string) {
  await resolver.queue.merge(itemId, {
    selectedMatchId: matchId,
    notes: 'Verified same customer by support ticket history',
    confidence: 0.95,
    decidedBy: reviewerId
  })
}

// Reject matches (not duplicates)
async function rejectMatch(itemId: string, reviewerId: string) {
  await resolver.queue.reject(itemId, {
    notes: 'Different customers with similar names',
    confidence: 0.9,
    decidedBy: reviewerId
  })
}
```

## Configuration Rationale

### Weight Selection

| Field | Weight | Rationale |
|-------|--------|-----------|
| loyaltyId | 30 | Definitive identifier when present |
| email | 25 | Highly unique, primary identifier |
| phone | 12 | Useful but changes frequently |
| firstName | 10 | Common but helps confirm identity |
| lastName | 10 | More discriminating than first name |
| billingZip | 8 | Geographic confirmation |
| billingCity | 5 | Weak signal, supporting evidence |

### Threshold Selection

With a maximum possible score of 100:

- **noMatch: 20** (20%): Filters obvious non-matches where few or no fields align
- **definiteMatch: 55** (55%): Requires strong evidence (email + names, or loyaltyId + supporting data)

This leaves a 35-point window for potential matches requiring human review.

### Why High Precision Matters

In customer deduplication, false positives are expensive:

- Merged customers may share payment methods incorrectly
- Order history becomes confusing
- Marketing segments become inaccurate
- Customer support loses context

The conservative definiteMatch threshold ensures only high-confidence merges happen automatically.

## Performance Considerations

### Blocking Strategy

The composite blocking strategy balances recall and performance:

```typescript
.composite('union', comp => comp
  .onField('email', { transform: 'domain' })
  .onField('lastName', { transform: 'soundex' })
)
```

- **Email domain**: Groups customers by company (e.g., all @acme.com together)
- **Last name soundex**: Catches duplicates with different emails but similar names

For 100,000 customers, this typically reduces comparisons by 95%+ compared to exhaustive matching.

### Scaling Recommendations

| Customer Count | Strategy |
|---------------|----------|
| < 10,000 | Standard blocking sufficient |
| 10,000 - 100,000 | Composite blocking recommended |
| 100,000+ | Consider sorted neighborhood with smaller window |
| 1,000,000+ | Partition by region/source before deduplication |

### Memory Management

For very large datasets, process in batches:

```typescript
async function batchDeduplication(batchSize = 10000) {
  const totalCustomers = await prisma.customer.count()

  for (let offset = 0; offset < totalCustomers; offset += batchSize) {
    const batch = await prisma.customer.findMany({
      skip: offset,
      take: batchSize,
      orderBy: { createdAt: 'asc' }
    })

    await resolver.deduplicateBatch(batch, {
      autoQueue: true
    })

    console.log(`Processed ${Math.min(offset + batchSize, totalCustomers)}/${totalCustomers}`)
  }
}
```

## PII Handling

Customer data contains Personally Identifiable Information (PII). Follow these practices:

### Data Minimization

Only include fields necessary for matching:

```typescript
// Don't include unnecessary PII
.schema(schema => schema
  .field('email').type('email')
  .field('firstName').type('name')
  .field('lastName').type('name')
  // Skip: SSN, DOB, payment info, etc.
)
```

### Audit Logging

Track who accessed and modified data:

```typescript
const mergeResult = await resolver.merge(records, {
  mergedBy: req.user.email,  // Track the person
  context: {
    ip: req.ip,
    sessionId: req.session.id
  }
})

// Provenance tracks field-level attribution
console.log(mergeResult.provenance)
```

### Access Controls

Integrate with your authorization system:

```typescript
async function reviewQueueWithAuth(userId: string) {
  // Verify user has review permissions
  if (!await hasPermission(userId, 'customer:review')) {
    throw new UnauthorizedError('Cannot access review queue')
  }

  return resolver.queue.list({ status: 'pending' })
}
```

## Monitoring and Metrics

Track deduplication effectiveness:

```typescript
async function getDeduplicationMetrics() {
  const queueStats = await resolver.queue.stats()

  return {
    // Queue health
    pendingReviews: queueStats.byStatus.pending,
    avgWaitTime: queueStats.avgWaitTime,

    // Throughput
    decisionsLast24h: queueStats.throughput?.last24h,
    decisionsLast7d: queueStats.throughput?.last7d,

    // Quality indicators
    confirmRate: queueStats.byStatus.confirmed /
      (queueStats.byStatus.confirmed + queueStats.byStatus.rejected),

    // Alert if queue is growing
    alert: queueStats.byStatus.pending > 1000 ? 'Queue backlog growing' : null
  }
}
```

## Common Adjustments

### Lower Recall (Missing Duplicates)

If you're missing duplicates:

1. Lower the noMatch threshold
2. Reduce field thresholds on names (0.85 → 0.80)
3. Add more blocking strategies (e.g., phone prefix)

### Too Many False Positives

If auto-merging incorrect matches:

1. Raise the definiteMatch threshold
2. Increase name field thresholds (0.88 → 0.92)
3. Add more discriminating fields (DOB, loyalty ID)

### Queue Overwhelmed

If too many potential matches:

1. Raise noMatch threshold (filter obvious non-matches earlier)
2. Lower definiteMatch threshold (auto-merge more)
3. Add priority scoring for high-value customers

## Next Steps

- [Tuning Guide](../tuning-guide.md): Detailed weight and threshold optimization
- [Review Queue](../review-queue.md): Building review interfaces
- [Golden Record](../golden-record.md): Merge strategy configuration
- [Database Adapters](../database-adapters.md): Prisma, Drizzle, TypeORM setup
