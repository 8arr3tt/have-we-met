# Blocking Strategy Optimization Guide

This guide provides benchmark-backed recommendations for optimizing blocking strategies. Blocking is the most impactful optimization for identity resolution performance, reducing O(n²) comparisons to near-linear complexity.

## Table of Contents

- [Why Blocking Matters](#why-blocking-matters)
- [Benchmark Data](#benchmark-data)
- [Strategy Selection by Scale](#strategy-selection-by-scale)
- [Blocking Strategy Trade-offs](#blocking-strategy-trade-offs)
- [Optimization Techniques](#optimization-techniques)
- [Monitoring and Tuning](#monitoring-and-tuning)

---

## Why Blocking Matters

Without blocking, comparing n records requires n × (n-1) / 2 comparisons:

| Records   | Pairs Without Blocking |
| --------- | ---------------------- |
| 1,000     | 499,500                |
| 10,000    | 49,995,000             |
| 100,000   | 4,999,950,000          |
| 1,000,000 | ~500 billion           |

With effective blocking, this drops by 90-99%+:

| Records | Pairs With Blocking | Reduction |
| ------- | ------------------- | --------- |
| 1,000   | ~35,000             | ~93%      |
| 10,000  | ~400,000            | ~99.2%    |
| 100,000 | ~5,000,000          | ~99.9%    |

**Key insight:** At 10,000 records, Soundex blocking provides an **8.7x speedup** over no blocking.

---

## Benchmark Data

### Strategy Performance Comparison (10k Records)

From scalability benchmarks on synthetic Febrl-like data:

| Strategy                         | Time   | Speedup    | Pairs Compared | Reduction |
| -------------------------------- | ------ | ---------- | -------------- | --------- |
| No blocking                      | 33.9s  | 1x         | 49,995,000     | 0%        |
| First letter                     | 10.9s  | 3.1x       | ~16,000,000    | ~68%      |
| Soundex (surname)                | 3.9s   | **8.7x**   | ~400,000       | ~99.2%    |
| Postcode                         | 26ms   | **1,307x** | ~13,000        | ~99.97%   |
| Composite (Soundex + Postcode)   | 4.0s   | 8.5x       | ~410,000       | ~99.2%    |
| Sorted neighbourhood (window=10) | 0.07ms | N/A\*      | ~100,000       | fixed     |

\*Sorted neighbourhood generates a fixed number of pairs (n × window), making direct comparison less meaningful.

### Recall Impact by Strategy

Blocking reduces comparisons but may miss matches if records fall in different blocks:

| Strategy                      | Precision | Recall | F1 Score |
| ----------------------------- | --------- | ------ | -------- |
| No Blocking                   | 92.45%    | 89.18% | 90.79%   |
| Soundex Blocking              | 92.31%    | 87.93% | 90.07%   |
| First Letter                  | 91.87%    | 86.24% | 88.97%   |
| Postcode                      | 89.45%    | 72.16% | 79.90%   |
| Combined (Soundex + Postcode) | 93.78%    | 68.42% | 79.14%   |

**Key finding:** Soundex blocking achieves **89.5% pair reduction with only 1.3% recall loss** compared to no blocking.

### Restaurant Entity Matching Results

For business entities with city blocking:

| Strategy               | Precision | Recall | Reduction |
| ---------------------- | --------- | ------ | --------- |
| No Blocking            | 89.42%    | 85.71% | 0%        |
| City Blocking          | 89.28%    | 84.93% | 95.97%    |
| Name First Letter      | 88.56%    | 82.14% | 96.16%    |
| Combined (City + Name) | 90.12%    | 72.86% | 99.19%    |

**Key finding:** City blocking provides **96% reduction with <1% recall loss** for restaurant matching.

---

## Strategy Selection by Scale

### Small Datasets (<1,000 records)

**Recommendation:** Blocking is optional but still beneficial.

```typescript
// Simple first-letter blocking is sufficient
.blocking(block => block
  .onField('lastName', { transform: 'firstLetter' })
)
```

**Expected performance:**

- Without blocking: ~500ms for full comparison
- With blocking: ~50ms

### Medium Datasets (1,000-10,000 records)

**Recommendation:** Soundex blocking is optimal.

```typescript
// Soundex provides best balance of reduction and recall
.blocking(block => block
  .onField('lastName', { transform: 'soundex' })
)
```

**Expected performance:**

- Without blocking: ~34 seconds at 10k
- With Soundex: ~4 seconds (8.7x faster)

### Large Datasets (10,000-100,000 records)

**Recommendation:** Soundex blocking required. Consider composite strategies.

```typescript
// Option 1: Soundex alone
.blocking(block => block
  .onField('lastName', { transform: 'soundex' })
)

// Option 2: Composite for better recall coverage
.blocking(block => block
  .composite('union', comp => comp
    .onField('lastName', { transform: 'soundex' })
    .onField('dateOfBirth', { transform: 'year' })
  )
)
```

**Expected performance at 100k:**

- Without blocking: Not feasible (~5 billion pairs)
- With Soundex: ~5 million pairs, processable in minutes

### Very Large Datasets (100,000+ records)

**Recommendation:** Database adapters with streaming. Multi-field blocking essential.

```typescript
// Multi-field blocking for maximum reduction
.blocking(block => block
  .onFields(['lastName', 'birthYear'], {
    transforms: ['soundex', 'identity']
  })
)

// Or use database adapter for streaming
.adapter(prismaAdapter(prisma))
```

**Considerations:**

- Memory becomes a constraint
- Consider incremental matching (new records vs existing)
- Distributed processing by blocking key for massive scale

---

## Blocking Strategy Trade-offs

### Soundex Blocking

**Best for:** Person name matching

| Aspect              | Value                        |
| ------------------- | ---------------------------- |
| Pair reduction      | ~89-93%                      |
| Recall preservation | 97-99% of no-blocking recall |
| Speed               | ~40ms per 1,000 records      |
| Handles typos       | Yes (phonetic)               |

```typescript
.blocking(block => block
  .onField('lastName', { transform: 'soundex' })
)
```

**Strengths:**

- Excellent recall for phonetically similar names
- Good distribution (avoids skewed blocks)
- Fast computation

**Weaknesses:**

- Only works for name-like fields
- Same Soundex code for very different names possible
- English-centric (may not work well for non-English names)

### First Letter Blocking

**Best for:** Simple use cases, supplementary blocking

| Aspect              | Value                             |
| ------------------- | --------------------------------- |
| Pair reduction      | ~68-75% (26 blocks max)           |
| Recall preservation | 95-97% of no-blocking recall      |
| Speed               | ~17ms per 1,000 records (fastest) |
| Handles typos       | No                                |

```typescript
.blocking(block => block
  .onField('lastName', { transform: 'firstLetter' })
)
```

**Strengths:**

- Very fast
- Simple to understand
- Predictable behavior

**Weaknesses:**

- Creates unbalanced blocks (S, M, J are common)
- Misses matches with first-letter typos
- Limited reduction (26 blocks max for A-Z)

### Postcode/Geographic Blocking

**Best for:** Location-bound entities (restaurants, businesses)

| Aspect              | Value     |
| ------------------- | --------- |
| Pair reduction      | 97-99%+   |
| Recall preservation | 85-95%    |
| Speed               | Very fast |
| Handles typos       | No        |

```typescript
.blocking(block => block
  .onField('postcode')
)
```

**Strengths:**

- Excellent reduction for location-bound data
- Natural blocking key for many use cases
- Very fast (exact match grouping)

**Weaknesses:**

- Misses matches across postcodes (people move, data entry errors)
- Not useful for global/non-geographic matching
- Recall impact can be significant

### Composite Blocking (Union)

**Best for:** Maximizing recall across multiple criteria

| Aspect              | Value                              |
| ------------------- | ---------------------------------- |
| Pair reduction      | Depends on strategies combined     |
| Recall preservation | Best (catch matches via any field) |
| Speed               | Slower (runs multiple strategies)  |
| Handles typos       | Depends on components              |

```typescript
.blocking(block => block
  .composite('union', comp => comp
    .onField('lastName', { transform: 'soundex' })
    .onField('email', { transform: e => e?.split('@')[1] })
    .onField('dateOfBirth', { transform: 'year' })
  )
)
```

**Strengths:**

- Catches matches that single-field blocking would miss
- Flexible: combine any strategies
- Good for messy data with multiple identifying fields

**Weaknesses:**

- Increases total pairs (union of all blocks)
- More complex to tune
- Performance overhead of running multiple strategies

### Sorted Neighbourhood

**Best for:** Streaming scenarios, predictable pair counts

| Aspect              | Value                  |
| ------------------- | ---------------------- |
| Pair reduction      | Fixed (n × window)     |
| Recall preservation | Depends on window size |
| Speed               | Very fast              |
| Handles typos       | Within window          |

```typescript
.blocking(block => block
  .sortedNeighbourhood('lastName', {
    windowSize: 10,
    transform: 'soundex'
  })
)
```

**Strengths:**

- Predictable pair count
- Handles typos within window
- Good for streaming/incremental matching

**Weaknesses:**

- May miss matches outside window
- Window size is a critical parameter
- Sorted order affects which matches are found

---

## Optimization Techniques

### Technique 1: Choose the Right Primary Field

Select the field with the best combination of:

- **High cardinality** (many unique values)
- **Good data quality** (few nulls, few typos)
- **Discriminating power** (separates non-matches)

| Field Type           | Blocking Effectiveness      |
| -------------------- | --------------------------- |
| Surname              | Excellent for people        |
| City                 | Excellent for businesses    |
| Email domain         | Good supplementary          |
| Date of birth (year) | Good supplementary          |
| Postcode             | Excellent if location-bound |
| First name           | Poor (too common)           |
| Gender               | Poor (only 2-3 values)      |

### Technique 2: Use Multi-Field Composite Keys

When single-field blocking isn't sufficient:

```typescript
// Combine surname and birth year for tighter blocking
.blocking(block => block
  .onFields(['lastName', 'birthYear'], {
    transforms: ['soundex', 'identity']
  })
)
```

**Expected impact:**

- Further reduces pairs within each Soundex group
- Splits large blocks (e.g., all "Smith" by year)
- Slight recall risk if birth year has errors

### Technique 3: Union Strategies for Maximum Recall

For messy data where matches might be found via different fields:

```typescript
.blocking(block => block
  .composite('union', comp => comp
    .onField('lastName', { transform: 'soundex' })
    .onField('email', { transform: e => e?.split('@')[1] })
  )
)
```

**Expected impact:**

- Catches matches missed by surname alone
- Increases total pairs (union of blocks)
- Best recall at cost of more comparisons

### Technique 4: Adaptive Strategy Selection

Select strategy based on dataset characteristics:

```typescript
function selectBlockingStrategy(records: Record[]) {
  const size = records.length

  if (size < 1000) {
    // Small: simple blocking
    return { field: 'lastName', transform: 'firstLetter' }
  } else if (size < 10000) {
    // Medium: Soundex
    return { field: 'lastName', transform: 'soundex' }
  } else {
    // Large: multi-field
    return {
      fields: ['lastName', 'birthYear'],
      transforms: ['soundex', 'identity'],
    }
  }
}
```

### Technique 5: Domain-Specific Blocking

Match your blocking strategy to your domain:

| Domain            | Recommended Strategy                |
| ----------------- | ----------------------------------- |
| Customer (B2C)    | Soundex on surname                  |
| Business (B2B)    | City + company name prefix          |
| Healthcare        | SSN prefix or DOB + surname Soundex |
| Restaurant/Retail | City (mandatory)                    |
| E-commerce        | Email domain or phone area code     |

---

## Monitoring and Tuning

### Key Metrics to Track

| Metric                  | Target            | What It Tells You      |
| ----------------------- | ----------------- | ---------------------- |
| Pair reduction          | >90%              | Blocking effectiveness |
| Block count             | 0.5-5% of records | Granularity            |
| Max block size          | <5x average       | Balance                |
| Recall (vs no blocking) | >95%              | Matches not missed     |
| Block generation time   | <100ms per 10k    | Overhead acceptable    |

### Gathering Blocking Statistics

```typescript
const blocks = blockingStrategy.generateBlocks(records)

const blockSizes = Array.from(blocks.values()).map((b) => b.length)
const totalBlocks = blocks.size
const avgBlockSize = blockSizes.reduce((a, b) => a + b, 0) / totalBlocks
const maxBlockSize = Math.max(...blockSizes)

const totalRecords = records.length
const comparisonsWithout = (totalRecords * (totalRecords - 1)) / 2
const comparisonsWith = blockSizes.reduce(
  (sum, size) => sum + (size * (size - 1)) / 2,
  0
)
const reduction =
  ((comparisonsWithout - comparisonsWith) / comparisonsWithout) * 100

console.log({
  totalBlocks,
  avgBlockSize: avgBlockSize.toFixed(2),
  maxBlockSize,
  reduction: reduction.toFixed(2) + '%',
})
```

### Identifying Problems

| Symptom               | Likely Cause        | Solution                                             |
| --------------------- | ------------------- | ---------------------------------------------------- |
| Low reduction (<90%)  | Blocking too broad  | Use more specific transform (soundex vs firstLetter) |
| Poor recall           | Blocking too narrow | Use union composite or larger window                 |
| Skewed blocks         | Poor field choice   | Add secondary field or use soundex                   |
| Slow block generation | Complex transform   | Use simpler transform or cache results               |
| Too many blocks       | Over-blocking       | Simplify strategy                                    |

### When to Re-Tune

Re-evaluate blocking when:

1. **Dataset grows significantly** - Strategy that worked at 10k may not work at 100k
2. **Data distribution changes** - New data source with different characteristics
3. **Recall drops** - Matches being missed that weren't before
4. **Performance degrades** - Blocking overhead becoming significant

### A/B Testing Strategies

Compare strategies empirically:

```typescript
const strategies = {
  baseline: (block) => block.onField('lastName', { transform: 'soundex' }),
  candidate: (block) =>
    block.composite('union', (comp) =>
      comp
        .onField('lastName', { transform: 'soundex' })
        .onField('email', { transform: (e) => e?.split('@')[1] })
    ),
}

for (const [name, configure] of Object.entries(strategies)) {
  const resolver = HaveWeMet.create()
    .schema(/* ... */)
    .blocking(configure)
    .matching(/* ... */)
    .build()

  const start = performance.now()
  const results = resolver.deduplicateBatch(sampleRecords)
  const elapsed = performance.now() - start

  const metrics = calculateMetrics(results, groundTruth)
  console.log(
    `${name}: time=${elapsed}ms, recall=${metrics.recall}, precision=${metrics.precision}`
  )
}
```

---

## Summary

### Quick Reference

| Dataset Size   | Recommended Strategy           | Expected Reduction |
| -------------- | ------------------------------ | ------------------ |
| <1,000         | First letter (optional)        | ~70%               |
| 1,000-10,000   | Soundex on surname             | ~93%               |
| 10,000-100,000 | Soundex + secondary field      | ~99%               |
| 100,000+       | Multi-field + database adapter | ~99.9%             |

### Key Takeaways

1. **Soundex blocking on surname** is the best default for person matching (8.7x speedup, <2% recall loss)
2. **City blocking** is optimal for business/restaurant matching (96% reduction, <1% recall loss)
3. **Composite union strategies** maximize recall at the cost of more comparisons
4. **Multi-field blocking** essential for large datasets (100k+)
5. **Monitor block distribution** - skewed blocks indicate suboptimal strategy

### Decision Flowchart

```
Is dataset > 1,000 records?
├── No → Blocking optional (first-letter if desired)
└── Yes → What type of entities?
    ├── People → Soundex on surname
    │   └── Dataset > 10k? → Add secondary field (birth year, postcode)
    ├── Businesses → Block on city
    │   └── Multi-city? → Add company name prefix
    └── Unknown → Start with Soundex, measure recall
```

### Next Steps

- [Threshold Optimization](threshold-optimization.md) - Tune match thresholds
- [Performance Optimization](performance-optimization.md) - CPU, memory, throughput
- [Blocking Strategies](../blocking/strategies.md) - Detailed strategy reference
- [Blocking Selection Guide](../blocking/selection-guide.md) - Choosing your strategy
