# Performance Optimization Guide

This guide provides benchmark-backed recommendations for optimizing CPU usage, memory consumption, and overall throughput in identity resolution workloads.

## Table of Contents

- [Performance Characteristics](#performance-characteristics)
- [Memory Optimization](#memory-optimization)
- [CPU Optimization](#cpu-optimization)
- [Throughput Optimization](#throughput-optimization)
- [Incremental Matching](#incremental-matching)
- [Monitoring and Alerting](#monitoring-and-alerting)

---

## Performance Characteristics

### Complexity Analysis

Identity resolution has different complexity profiles depending on configuration:

| Approach | Complexity | 10k Records | 100k Records |
|----------|------------|-------------|--------------|
| No blocking | O(n²) | ~50M pairs | ~5B pairs |
| With blocking | O(n × b) | ~400k pairs | ~4M pairs |

Where `b` = average block size (typically 5-50 depending on strategy).

### Benchmark Reference Points

From scalability benchmarks on AMD Ryzen 7 7800X3D with 32GB RAM:

| Records | Soundex Blocking | Time | Throughput |
|---------|------------------|------|------------|
| 1,000 | ~35,000 pairs | 48ms | ~730,000 pairs/sec |
| 5,000 | ~175,000 pairs | 1.1s | ~159,000 pairs/sec |
| 10,000 | ~400,000 pairs | 4.4s | ~91,000 pairs/sec |

### Scaling Behavior

With Soundex blocking, time scales approximately as O(n^1.68):

| Scale Factor | Records | Time Increase |
|--------------|---------|---------------|
| 1x | 1,000 | baseline |
| 5x | 5,000 | 24x slower |
| 10x | 10,000 | 92x slower |

This sub-quadratic scaling is due to effective blocking.

---

## Memory Optimization

### Memory Usage by Scale

From benchmark measurements:

| Records | Heap Before | Heap After | Delta |
|---------|-------------|------------|-------|
| 500 | 45 MB | 52 MB | +7 MB |
| 1,000 | 52 MB | 68 MB | +16 MB |
| 2,000 | 68 MB | 112 MB | +44 MB |
| 10,000 | ~100 MB | ~350 MB | ~250 MB |

**Rule of thumb:** ~3-5 MB per 1,000 records (varies by record complexity).

### Memory Reduction Techniques

#### Technique 1: Stream Large Datasets

For datasets exceeding available memory, use database adapters with streaming:

```typescript
// Instead of loading all records into memory
const resolver = HaveWeMet.create()
  .schema(/* ... */)
  .adapter(prismaAdapter(prisma))  // Streams from database
  .build()

// Process in batches
const batchSize = 10000
for (let offset = 0; offset < totalRecords; offset += batchSize) {
  const batch = await fetchBatch(offset, batchSize)
  const results = await resolver.deduplicateBatch(batch)
  await processResults(results)
}
```

#### Technique 2: Reduce Record Size

Only include fields needed for matching:

```typescript
// Bad: Loading entire record
const records = await db.users.findMany()

// Good: Load only matching fields
const records = await db.users.findMany({
  select: {
    id: true,
    firstName: true,
    lastName: true,
    email: true,
    dateOfBirth: true
    // Exclude: address_history, preferences, etc.
  }
})
```

**Impact:** Can reduce memory usage by 50-80% if records have many unused fields.

#### Technique 3: Process and Discard

Don't accumulate results in memory:

```typescript
// Bad: Accumulating all results
const allResults = []
for (const batch of batches) {
  const results = resolver.deduplicateBatch(batch)
  allResults.push(results)  // Memory keeps growing
}

// Good: Process and discard
for (const batch of batches) {
  const results = resolver.deduplicateBatch(batch)
  await persistResults(results)  // Write to database
  // Results garbage collected after this iteration
}
```

#### Technique 4: Limit Block Size

Large blocks consume more memory. Add secondary blocking keys:

```typescript
// Single field may create large blocks
.blocking(block => block
  .onField('lastName', { transform: 'soundex' })
)

// Multi-field creates smaller blocks
.blocking(block => block
  .onFields(['lastName', 'birthYear'], {
    transforms: ['soundex', 'identity']
  })
)
```

### Memory Targets by Dataset Size

| Records | Target Peak Memory | Recommended Approach |
|---------|-------------------|---------------------|
| <10,000 | 500 MB | In-memory processing |
| 10,000-50,000 | 1-2 GB | In-memory with optimization |
| 50,000-100,000 | 2-4 GB | Consider batching |
| >100,000 | N/A | Database adapter required |

---

## CPU Optimization

### Algorithm Performance Comparison

String similarity algorithm performance from Febrl benchmarks:

| Algorithm | Pairs/sec | Relative Speed |
|-----------|-----------|----------------|
| Exact match | ~800,000 | Fastest |
| Jaro-Winkler | ~406,000 | Fast |
| Soundex+JW | ~362,000 | Fast |
| Levenshtein | ~344,000 | Moderate |
| Metaphone | ~300,000 | Slower |

**Recommendation:** Use Jaro-Winkler for name fields (best speed/accuracy balance).

### CPU Reduction Techniques

#### Technique 1: Use Faster Algorithms Where Possible

```typescript
// For identifiers: use exact match (fastest)
.field('email').strategy('exact').weight(20)
.field('phone').strategy('exact').weight(15)

// For names: use Jaro-Winkler (good balance)
.field('firstName').strategy('jaro-winkler').weight(10)

// Avoid Levenshtein for short strings (slower, no accuracy gain)
// Use Levenshtein only for addresses/longer text
.field('address').strategy('levenshtein').weight(10)
```

#### Technique 2: Minimize Field Comparisons

Each field comparison has CPU cost. Only include discriminating fields:

```typescript
// Bad: Too many weak fields
.matching(match => match
  .field('email').strategy('exact').weight(20)
  .field('firstName').strategy('jaro-winkler').weight(10)
  .field('lastName').strategy('jaro-winkler').weight(10)
  .field('middleName').strategy('jaro-winkler').weight(5)  // Often empty
  .field('suffix').strategy('exact').weight(2)  // Rarely helps
  .field('salutation').strategy('exact').weight(1)  // Not discriminating
  .field('gender').strategy('exact').weight(1)  // Only 2 values
)

// Good: Focus on discriminating fields
.matching(match => match
  .field('email').strategy('exact').weight(25)
  .field('firstName').strategy('jaro-winkler').weight(12)
  .field('lastName').strategy('jaro-winkler').weight(15)
  .field('dateOfBirth').strategy('exact').weight(13)
)
```

#### Technique 3: Use Field Thresholds to Short-Circuit

Field thresholds prevent unnecessary score calculations:

```typescript
// Without threshold: calculates contribution even for 0.3 similarity
.field('firstName').strategy('jaro-winkler').weight(10)

// With threshold: skips contribution if similarity < 0.85
.field('firstName').strategy('jaro-winkler').weight(10).threshold(0.85)
```

**Impact:** Can reduce CPU by 10-20% on datasets with many partial matches.

#### Technique 4: Optimize Blocking Transforms

Blocking transform choice affects CPU:

| Transform | Speed (per 10k records) |
|-----------|-------------------------|
| firstLetter | ~17ms |
| soundex | ~38ms |
| metaphone | ~44ms |
| Custom function | Varies |

```typescript
// Fastest
.onField('lastName', { transform: 'firstLetter' })

// Good balance
.onField('lastName', { transform: 'soundex' })

// Avoid if speed critical
.onField('lastName', { transform: 'metaphone' })
```

#### Technique 5: Cache Normalized Values

If normalizing repeatedly, cache results:

```typescript
// Bad: Normalizing same values repeatedly
const normalizedRecords = records.map(r => ({
  ...r,
  normalizedName: normalizeName(r.name),  // Called every time
  normalizedPhone: normalizePhone(r.phone)
}))

// Good: Normalize once during ingest
await db.records.update({
  data: {
    normalizedName: normalizeName(record.name),
    normalizedPhone: normalizePhone(record.phone)
  }
})
// Then match against normalized fields
```

---

## Throughput Optimization

### Throughput Reference Points

From benchmark data (Soundex blocking, Jaro-Winkler matching):

| Dataset Size | Throughput |
|--------------|------------|
| 1k records | ~21 runs/second |
| 5k records | ~0.9 runs/second |
| 10k records | ~0.23 runs/second |

### Throughput Optimization Techniques

#### Technique 1: Batch Processing

Process records in optimal batch sizes:

```typescript
// Optimal batch size depends on memory and dataset
const OPTIMAL_BATCH_SIZE = 5000  // Tune based on your environment

async function processLargeDataset(records: Record[]) {
  const results = []

  for (let i = 0; i < records.length; i += OPTIMAL_BATCH_SIZE) {
    const batch = records.slice(i, i + OPTIMAL_BATCH_SIZE)
    const batchResults = await resolver.deduplicateBatch(batch)
    results.push(batchResults)
  }

  return results
}
```

**Batch size guidelines:**

| Available Memory | Recommended Batch Size |
|------------------|----------------------|
| 2 GB | 2,000-3,000 |
| 4 GB | 5,000-7,000 |
| 8 GB | 10,000-15,000 |
| 16+ GB | 20,000+ |

#### Technique 2: Parallel Processing by Block

For very large datasets, parallelize by blocking key:

```typescript
// Generate blocks first
const blocks = blockingStrategy.generateBlocks(allRecords)

// Process blocks in parallel (Node.js worker threads)
const { Worker } = require('worker_threads')

const workers = []
for (const [blockKey, blockRecords] of blocks) {
  if (blockRecords.length > 100) {  // Only parallelize large blocks
    workers.push(new Worker('./match-worker.js', {
      workerData: { blockKey, records: blockRecords }
    }))
  }
}

await Promise.all(workers.map(w => new Promise(resolve => w.on('exit', resolve))))
```

#### Technique 3: Index-Based Lookup for Real-Time

For real-time matching against existing records:

```typescript
// Pre-build index for fast lookup
const index = await resolver.buildIndex(existingRecords)

// Real-time matching uses index (O(log n) lookup)
const matches = await resolver.matchAgainstIndex(newRecord, index)
```

#### Technique 4: Reduce Comparison Radius

For incremental matching, only compare within a window:

```typescript
// Bad: Compare new record against all existing
const matches = resolver.resolve(newRecord, allExistingRecords)

// Good: Compare against recent records only (if domain allows)
const recentRecords = await db.records.findMany({
  where: { createdAt: { gt: oneWeekAgo } },
  take: 10000
})
const matches = resolver.resolve(newRecord, recentRecords)
```

---

## Incremental Matching

For production systems that continuously receive new records.

### Strategy 1: New vs Existing

Compare only new records against existing corpus:

```typescript
async function processNewRecords(newRecords: Record[]) {
  // Get existing records (or use database adapter)
  const existingRecords = await db.records.findMany({
    where: { processed: true }
  })

  for (const newRecord of newRecords) {
    // Only compare new record against existing
    const matches = resolver.resolve(newRecord, existingRecords)

    if (matches.length > 0) {
      await handleMatches(newRecord, matches)
    }

    // Mark as processed
    await db.records.update({
      where: { id: newRecord.id },
      data: { processed: true }
    })
  }
}
```

**Complexity:** O(m × n) where m = new records, n = existing records
**vs Full Batch:** O((m + n)²) - significant savings when m << n

### Strategy 2: Sliding Window

For time-series data, only match within a time window:

```typescript
async function processWithSlidingWindow(newRecord: Record) {
  const windowDays = 90  // Match against records from last 90 days

  const windowStart = new Date()
  windowStart.setDate(windowStart.getDate() - windowDays)

  const windowRecords = await db.records.findMany({
    where: {
      createdAt: { gt: windowStart }
    }
  })

  return resolver.resolve(newRecord, windowRecords)
}
```

**When to use:**
- Data has temporal relevance (e.g., customer interactions)
- Duplicates unlikely to span long time periods
- Performance is critical

### Strategy 3: Block-Based Incremental

Only load records from the same block:

```typescript
async function processBlockBased(newRecord: Record) {
  // Compute blocking key for new record
  const blockKey = computeSoundex(newRecord.lastName)

  // Load only records in the same block
  const blockRecords = await db.records.findMany({
    where: {
      lastNameSoundex: blockKey  // Pre-computed during ingest
    }
  })

  return resolver.resolve(newRecord, blockRecords)
}
```

**Prerequisites:**
- Store blocking keys during ingest
- Index on blocking key columns

---

## Monitoring and Alerting

### Key Performance Metrics

Track these metrics in production:

| Metric | What to Monitor | Alert Threshold |
|--------|-----------------|-----------------|
| Matching time | P50, P95, P99 latency | P95 > 5s |
| Throughput | Records processed per minute | < 50% of baseline |
| Memory usage | Peak heap size | > 80% of available |
| Block size | Max block size | > 10,000 records |
| Queue depth | Pending match jobs | Growing continuously |

### Monitoring Implementation

```typescript
interface MatchingMetrics {
  timestamp: Date
  recordCount: number
  pairCount: number
  duration: number
  peakMemory: number
  maxBlockSize: number
}

async function matchWithMetrics(records: Record[]): Promise<MatchingMetrics> {
  const startTime = performance.now()
  const startMemory = process.memoryUsage().heapUsed

  const results = await resolver.deduplicateBatch(records)

  const endTime = performance.now()
  const endMemory = process.memoryUsage().heapUsed

  return {
    timestamp: new Date(),
    recordCount: records.length,
    pairCount: calculatePairsCompared(results),
    duration: endTime - startTime,
    peakMemory: Math.max(startMemory, endMemory),
    maxBlockSize: getMaxBlockSize(results)
  }
}

function checkAlerts(metrics: MatchingMetrics) {
  if (metrics.duration > 5000) {
    alert('Matching latency exceeded 5 seconds')
  }
  if (metrics.peakMemory > 0.8 * totalMemory) {
    alert('Memory usage exceeded 80%')
  }
  if (metrics.maxBlockSize > 10000) {
    alert('Large block detected - consider tuning blocking strategy')
  }
}
```

### Performance Dashboards

Track these trends over time:

1. **Latency trend** - Should be stable; increases indicate scaling issues
2. **Memory trend** - Should correlate with data volume
3. **Throughput trend** - Should be stable; drops indicate problems
4. **Block distribution** - Should remain balanced over time

### Capacity Planning

Based on benchmark data, estimate capacity:

| Daily Records | Required Processing Time | Recommended Spec |
|---------------|--------------------------|------------------|
| 1,000 | < 1 minute | Any modern CPU |
| 10,000 | ~5 minutes | 4+ cores, 8GB RAM |
| 100,000 | ~1 hour | 8+ cores, 16GB RAM |
| 1,000,000 | ~10 hours | Distributed processing |

---

## Summary

### Performance Checklist

- [ ] Choose fastest algorithm for each field type
- [ ] Enable blocking (minimum 90% pair reduction)
- [ ] Use field thresholds to short-circuit
- [ ] Stream large datasets through database adapter
- [ ] Process in optimal batch sizes
- [ ] Monitor latency, memory, and throughput
- [ ] Set up alerts for performance degradation

### Quick Wins

| Optimization | Expected Impact |
|--------------|-----------------|
| Enable Soundex blocking | 8-10x speedup |
| Use exact match for identifiers | 2x faster than fuzzy |
| Add field thresholds | 10-20% CPU reduction |
| Batch processing | Memory stability |
| Incremental matching | O(m×n) vs O(n²) |

### Performance Targets by Use Case

| Use Case | Latency Target | Throughput Target |
|----------|----------------|-------------------|
| Real-time lookup | < 100ms | 100+ queries/sec |
| Batch deduplication | < 10 min | 10k+ records/min |
| Large migration | < 24 hours | 1M+ records/day |

### Next Steps

- [Threshold Optimization](threshold-optimization.md) - Tune match thresholds
- [Blocking Optimization](blocking-optimization.md) - Optimize blocking strategies
- [Database Performance](../database-performance.md) - Database adapter optimization
- [Scalability Results](../../benchmarks/results/scalability-results.md) - Detailed benchmark data
