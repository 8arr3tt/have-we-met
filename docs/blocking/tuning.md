# Blocking Strategy Tuning Guide

This guide helps you optimize your blocking strategies for better performance, recall, and precision. Learn how to measure effectiveness, identify problems, and adjust your configuration.

## Table of Contents

- [Measuring Effectiveness](#measuring-effectiveness)
- [Identifying Problems](#identifying-problems)
- [Tuning Strategies](#tuning-strategies)
- [Common Scenarios](#common-scenarios)
- [Advanced Techniques](#advanced-techniques)

---

## Measuring Effectiveness

### Key Metrics

Track these metrics to evaluate your blocking strategy:

#### 1. Comparison Reduction

Percentage of comparisons eliminated by blocking:

```
Comparisons without blocking: n × (n - 1) / 2
Comparisons with blocking: Sum of (block_size × (block_size - 1) / 2)
Reduction: ((without - with) / without) × 100%
```

**Targets:**
- ✅ Excellent: >99%
- ✅ Good: 95-99%
- ⚠️ Fair: 90-95%
- ❌ Poor: <90%

#### 2. Block Count

Total number of unique blocks created:

**Guidelines:**
- Too few blocks (<10): Blocking not effective
- Optimal: 0.5% - 5% of record count
- Too many blocks (>50% of records): Overhead without benefit

**Example:**
```
100,000 records:
- Good: 500 - 5,000 blocks
- 1,200 blocks (1.2%) ✅ Optimal
```

#### 3. Block Size Distribution

Statistics about records per block:

```
Average: Total records / Total blocks
Min: Smallest block size
Max: Largest block size
Std deviation: Measure of balance
```

**Healthy distribution:**
- Average: 50-500 records per block
- Max: <5x average
- Std deviation: <2x average

**Problem signs:**
- Max: >10x average (skewed)
- Many blocks with 1-2 records (over-blocking)

#### 4. Recall

Percentage of true matches found:

```
Recall = True matches found / Total true matches
```

**Measuring recall requires ground truth data (known matches).**

**Targets:**
- ✅ Excellent: >95%
- ✅ Good: 90-95%
- ⚠️ Fair: 85-90%
- ❌ Poor: <85%

#### 5. Precision

Percentage of comparisons that are true matches:

```
Precision = True matches / Total comparisons
```

**Note:** Low precision is expected in identity resolution. Focus on comparison reduction instead.

### Gathering Statistics

Most blocking strategies don't expose statistics directly during matching. To measure effectiveness:

#### Method 1: Inspect Block Set

```typescript
import { StandardBlockingStrategy } from 'have-we-met'

const strategy = new StandardBlockingStrategy({
  field: 'lastName',
  transform: 'soundex'
})

const blocks = strategy.generateBlocks(records)

// Analyze blocks
const blockSizes = Array.from(blocks.values()).map(b => b.length)
const totalBlocks = blocks.size
const avgBlockSize = blockSizes.reduce((a, b) => a + b, 0) / totalBlocks
const maxBlockSize = Math.max(...blockSizes)
const minBlockSize = Math.min(...blockSizes)

console.log('Blocking Statistics:')
console.log(`Total blocks: ${totalBlocks}`)
console.log(`Average block size: ${avgBlockSize.toFixed(2)}`)
console.log(`Max block size: ${maxBlockSize}`)
console.log(`Min block size: ${minBlockSize}`)

// Calculate comparison reduction
const totalRecords = records.length
const comparisonsWithout = (totalRecords * (totalRecords - 1)) / 2
const comparisonsWith = blockSizes.reduce(
  (sum, size) => sum + (size * (size - 1)) / 2,
  0
)
const reduction = ((comparisonsWithout - comparisonsWith) / comparisonsWithout) * 100

console.log(`Comparison reduction: ${reduction.toFixed(2)}%`)
```

#### Method 2: Custom Analysis Script

Create a script to test different blocking strategies:

```typescript
// scripts/analyze-blocking.ts
import { StandardBlockingStrategy } from 'have-we-met'
import { records } from './data'

function analyzeStrategy(strategy, name) {
  const startTime = performance.now()
  const blocks = strategy.generateBlocks(records)
  const endTime = performance.now()

  const blockSizes = Array.from(blocks.values()).map(b => b.length)
  const totalBlocks = blocks.size
  const avgBlockSize = blockSizes.reduce((a, b) => a + b, 0) / totalBlocks
  const maxBlockSize = Math.max(...blockSizes)
  const minBlockSize = Math.min(...blockSizes)

  const totalRecords = records.length
  const comparisonsWithout = (totalRecords * (totalRecords - 1)) / 2
  const comparisonsWith = blockSizes.reduce(
    (sum, size) => sum + (size * (size - 1)) / 2,
    0
  )
  const reduction = ((comparisonsWithout - comparisonsWith) / comparisonsWithout) * 100

  console.log(`\n${name}:`)
  console.log(`  Generation time: ${(endTime - startTime).toFixed(2)}ms`)
  console.log(`  Total blocks: ${totalBlocks}`)
  console.log(`  Avg block size: ${avgBlockSize.toFixed(2)}`)
  console.log(`  Min/Max block size: ${minBlockSize} / ${maxBlockSize}`)
  console.log(`  Comparison reduction: ${reduction.toFixed(2)}%`)
}

// Test different strategies
analyzeStrategy(
  new StandardBlockingStrategy({ field: 'lastName', transform: 'firstLetter' }),
  'FirstLetter'
)

analyzeStrategy(
  new StandardBlockingStrategy({ field: 'lastName', transform: 'soundex' }),
  'Soundex'
)
```

---

## Identifying Problems

### Problem 1: Low Comparison Reduction (<90%)

**Symptoms:**
- Blocking doesn't significantly reduce comparisons
- Matching still takes too long
- Many large blocks

**Possible causes:**

1. **Blocks are too broad**
   - Transform creates few blocks
   - Most records fall into same block

2. **Wrong field selected**
   - Field has low cardinality
   - Field has few unique values

**Diagnosis:**
```typescript
const blocks = strategy.generateBlocks(records)
console.log('Total blocks:', blocks.size)
console.log('Block distribution:', Array.from(blocks.values()).map(b => b.length))

// Look for:
// - Total blocks < 10 (too few)
// - One block with most records (skewed)
```

**Solutions:**

✅ **Use more specific transform:**
```typescript
// Before: Too broad
.onField('lastName', { transform: 'firstLetter' })  // 26 blocks

// After: More specific
.onField('lastName', { transform: 'soundex' })  // ~1,200 blocks
```

✅ **Add more fields (multi-field blocking):**
```typescript
// Before: Single field
.onField('lastName', { transform: 'soundex' })

// After: Composite key
.onFields(['lastName', 'birthYear'], {
  transforms: ['soundex', 'identity']
})
```

✅ **Switch to sorted neighbourhood:**
```typescript
.sortedNeighbourhood('lastName', {
  windowSize: 10,
  transform: 'soundex'
})
```

### Problem 2: Poor Recall (<85%)

**Symptoms:**
- Missing known matches
- True duplicates not being found
- Users report missed matches

**Possible causes:**

1. **Blocks are too narrow**
   - Transform is too specific
   - Records with slight variations separated

2. **Key field has typos**
   - Standard blocking can't handle variations
   - Exact matching fails

**Diagnosis:**
```typescript
// Test with known duplicate pairs
const duplicates = [
  { id: 1, lastName: 'Smith' },
  { id: 2, lastName: 'Smyth' }  // Same person, typo
]

const blocks = strategy.generateBlocks(duplicates)

// Check if they're in the same block
for (const [key, records] of blocks) {
  const ids = records.map(r => r.id)
  console.log(`Block ${key}:`, ids)
}

// If duplicates are in different blocks, recall is impacted
```

**Solutions:**

✅ **Use more forgiving transform:**
```typescript
// Before: Too specific (exact match)
.onField('lastName', { transform: 'identity' })

// After: More forgiving (phonetic)
.onField('lastName', { transform: 'soundex' })
```

✅ **Switch to sorted neighbourhood:**
```typescript
// Handles typos better than standard blocking
.sortedNeighbourhood('lastName', {
  windowSize: 10,
  transform: 'soundex'
})
```

✅ **Add composite blocking with multiple fields:**
```typescript
// Union mode: Match on ANY field
.composite('union', comp => comp
  .onField('lastName', { transform: 'soundex' })
  .onField('email', { transform: (e) => e?.split('@')[1] })
  .onField('dateOfBirth', { transform: 'year' })
)
```

✅ **Increase window size (sorted neighbourhood):**
```typescript
// Before: Small window
.sortedNeighbourhood('lastName', { windowSize: 5 })

// After: Larger window
.sortedNeighbourhood('lastName', { windowSize: 20 })
```

### Problem 3: Slow Performance

**Symptoms:**
- Block generation takes too long
- Blocking phase is bottleneck
- Performance worse than expected

**Possible causes:**

1. **Expensive transforms**
   - Complex phonetic algorithms
   - Custom functions with heavy computation

2. **Too many strategies**
   - Composite with many strategies
   - Redundant blocking

3. **Large sorted neighbourhood window**
   - Window size too large
   - Creates too many overlapping blocks

**Diagnosis:**
```typescript
const strategies = [
  { name: 'FirstLetter', strategy: new StandardBlockingStrategy(...) },
  { name: 'Soundex', strategy: new StandardBlockingStrategy(...) },
  { name: 'Sorted', strategy: new SortedNeighbourhoodStrategy(...) }
]

strategies.forEach(({ name, strategy }) => {
  const start = performance.now()
  strategy.generateBlocks(records)
  const end = performance.now()
  console.log(`${name}: ${(end - start).toFixed(2)}ms`)
})
```

**Solutions:**

✅ **Use simpler transform:**
```typescript
// Before: Slower
.onField('lastName', { transform: 'metaphone' })  // ~44ms

// After: Faster
.onField('lastName', { transform: 'soundex' })  // ~38ms

// Or even faster:
.onField('lastName', { transform: 'firstLetter' })  // ~17ms
```

✅ **Reduce composite strategies:**
```typescript
// Before: Too many strategies
.composite('union', comp => comp
  .onField('lastName', { transform: 'soundex' })
  .onField('firstName', { transform: 'soundex' })
  .onField('email', { transform: customFn })
  .sortedNeighbourhood('lastName', { windowSize: 20 })
)

// After: Keep essential strategies only
.composite('union', comp => comp
  .onField('lastName', { transform: 'soundex' })
  .onField('dateOfBirth', { transform: 'year' })
)
```

✅ **Reduce window size:**
```typescript
// Before: Large window
.sortedNeighbourhood('lastName', { windowSize: 50 })

// After: Smaller window
.sortedNeighbourhood('lastName', { windowSize: 10 })
```

✅ **Switch from sorted neighbourhood to standard:**
```typescript
// Before: Sorted (slower)
.sortedNeighbourhood('lastName', { windowSize: 10 })

// After: Standard (faster)
.onField('lastName', { transform: 'soundex' })
```

### Problem 4: Skewed Block Distribution

**Symptoms:**
- One or few blocks contain most records
- Other blocks have very few records
- Inefficient comparison reduction

**Example:**
```
Block "S": 15,000 records  ⚠️
Block "M": 8,000 records   ⚠️
Block "J": 6,000 records   ⚠️
Block "X": 50 records
Block "Z": 30 records
```

**Possible causes:**

1. **Natural data distribution**
   - Some letters/values more common (e.g., "S" for surnames)
   - Transform creates unbalanced blocks

2. **Wrong transform choice**
   - firstLetter on names (letter frequency varies)

**Diagnosis:**
```typescript
const blocks = strategy.generateBlocks(records)
const blockSizes = Array.from(blocks.values()).map(b => b.length)
blockSizes.sort((a, b) => b - a)  // Sort descending

console.log('Top 10 largest blocks:', blockSizes.slice(0, 10))
console.log('Average block size:', blockSizes.reduce((a, b) => a + b) / blockSizes.length)

// If top blocks are 5x+ larger than average, distribution is skewed
```

**Solutions:**

✅ **Use better-distributed transform:**
```typescript
// Before: Unbalanced (firstLetter)
.onField('lastName', { transform: 'firstLetter' })
// Result: 26 blocks, highly skewed

// After: Balanced (soundex)
.onField('lastName', { transform: 'soundex' })
// Result: ~1,200 blocks, well distributed
```

✅ **Add secondary field:**
```typescript
// Combine with another field to split large blocks
.onFields(['lastName', 'birthYear'], {
  transforms: ['firstLetter', 'identity']
})
// Result: "S:1990", "S:1991", etc. - splits the "S" block
```

✅ **Switch to sorted neighbourhood:**
```typescript
// Uniform distribution by design
.sortedNeighbourhood('lastName', { windowSize: 10 })
// Result: Every block has exactly 10 records
```

---

## Tuning Strategies

### Iterative Tuning Process

Follow this process to optimize your blocking strategy:

1. **Start with baseline**
   - Begin with standard soundex blocking
   - Measure comparison reduction and recall

2. **Identify bottleneck**
   - Too slow? → Simplify transform
   - Poor recall? → Add strategies or use sorted neighbourhood
   - Poor reduction? → Use more specific transform

3. **Adjust and measure**
   - Make one change at a time
   - Re-measure metrics
   - Compare to baseline

4. **Iterate**
   - Continue adjusting until targets met
   - Balance recall, precision, and speed

### Tuning by Goal

#### Goal: Maximize Speed

**Priority:** Minimize block generation time

**Strategy:**
```typescript
// Fastest: firstLetter
.onField('lastName', { transform: 'firstLetter' })

// Still fast: soundex
.onField('lastName', { transform: 'soundex' })

// Avoid:
// - Sorted neighbourhood (sorting overhead)
// - Complex composite strategies
// - Multiple transforms
```

**Tradeoff:** May sacrifice some recall

#### Goal: Maximize Recall

**Priority:** Find all true matches

**Strategy:**
```typescript
// Best: Composite union with multiple strategies
.composite('union', comp => comp
  .onField('lastName', { transform: 'soundex' })
  .onField('firstName', { transform: 'firstLetter' })
  .onField('dateOfBirth', { transform: 'year' })
  .sortedNeighbourhood('email', { windowSize: 10 })
)

// Good: Sorted neighbourhood
.sortedNeighbourhood('lastName', {
  windowSize: 20,
  transform: 'soundex'
})
```

**Tradeoff:** More comparisons, slower performance

#### Goal: Balance

**Priority:** Good recall with reasonable speed

**Strategy:**
```typescript
// Recommended: Standard soundex
.onField('lastName', { transform: 'soundex' })

// Or: Composite with 2 fields
.composite('union', comp => comp
  .onField('lastName', { transform: 'soundex' })
  .onField('dateOfBirth', { transform: 'year' })
)
```

**Result:** 99% reduction, good recall, fast

---

## Common Scenarios

### Scenario 1: Large Dataset (100k+ records), Speed Critical

**Starting point:**
```typescript
.onField('lastName', { transform: 'soundex' })
```

**Problem:** Still too slow (38ms × large dataset)

**Tuning:**
```typescript
// Step 1: Try simpler transform
.onField('lastName', { transform: 'firstLetter' })
// Result: 17ms (2x faster), but recall drops

// Step 2: If recall acceptable, done
// If not, add secondary field
.onFields(['lastName', 'country'], {
  transforms: ['firstLetter', 'identity']
})
// Result: 20ms, better blocks, restored recall
```

### Scenario 2: Noisy Data, Missing Matches

**Starting point:**
```typescript
.onField('lastName', { transform: 'soundex' })
```

**Problem:** Missing matches due to typos: "Smith" vs "Smoth"

**Tuning:**
```typescript
// Step 1: Try sorted neighbourhood
.sortedNeighbourhood('lastName', {
  windowSize: 10,
  transform: 'soundex'
})
// Result: Improved recall, slight performance cost

// Step 2: Still missing some? Increase window
.sortedNeighbourhood('lastName', {
  windowSize: 20,
  transform: 'soundex'
})
// Result: Even better recall

// Step 3: Add fallback field
.composite('union', comp => comp
  .sortedNeighbourhood('lastName', { windowSize: 20 })
  .onField('dateOfBirth', { transform: 'year' })
)
// Result: Maximum recall
```

### Scenario 3: Multiple Important Fields

**Starting point:**
```typescript
.onField('lastName', { transform: 'soundex' })
```

**Problem:** Matches missed when lastName is wrong but email is similar

**Tuning:**
```typescript
// Step 1: Add composite with key fields
.composite('union', comp => comp
  .onField('lastName', { transform: 'soundex' })
  .onField('email', {
    transform: (e) => e?.split('@')[1] || null  // Domain
  })
)
// Result: Catches matches via either field

// Step 2: Add more fields if needed
.composite('union', comp => comp
  .onField('lastName', { transform: 'soundex' })
  .onField('email', { transform: (e) => e?.split('@')[1] })
  .onField('dateOfBirth', { transform: 'year' })
)
// Result: Maximum recall across all fields
```

### Scenario 4: Unbalanced Block Distribution

**Starting point:**
```typescript
.onField('lastName', { transform: 'firstLetter' })
```

**Problem:** Block "S" has 15,000 records (too large)

**Tuning:**
```typescript
// Step 1: Use better-distributed transform
.onField('lastName', { transform: 'soundex' })
// Result: ~1,200 balanced blocks instead of 26 unbalanced

// Step 2: If still unbalanced, add secondary field
.onFields(['lastName', 'birthYear'], {
  transforms: ['soundex', 'identity']
})
// Result: Further splits large blocks
```

---

## Advanced Techniques

### Conditional Blocking

Use different strategies based on data characteristics:

```typescript
function createStrategy(records) {
  const size = records.length

  if (size < 10000) {
    // Small dataset: simple blocking
    return new StandardBlockingStrategy({
      field: 'lastName',
      transform: 'firstLetter'
    })
  } else if (size < 100000) {
    // Medium dataset: soundex
    return new StandardBlockingStrategy({
      field: 'lastName',
      transform: 'soundex'
    })
  } else {
    // Large dataset: multi-field
    return new StandardBlockingStrategy({
      fields: ['lastName', 'country'],
      transforms: ['soundex', 'identity']
    })
  }
}
```

### Adaptive Window Sizing

Adjust window size based on dataset:

```typescript
function calculateWindowSize(recordCount) {
  if (recordCount < 1000) return 5
  if (recordCount < 10000) return 10
  if (recordCount < 100000) return 15
  return 20
}

const windowSize = calculateWindowSize(records.length)

.sortedNeighbourhood('lastName', { windowSize })
```

### A/B Testing Blocking Strategies

Compare strategies empirically:

```typescript
const strategies = {
  baseline: new StandardBlockingStrategy({
    field: 'lastName',
    transform: 'soundex'
  }),
  candidate: new CompositeBlockingStrategy({
    strategies: [
      new StandardBlockingStrategy({ field: 'lastName', transform: 'soundex' }),
      new StandardBlockingStrategy({ field: 'dateOfBirth', transform: 'year' })
    ],
    mode: 'union'
  })
}

// Test both
Object.entries(strategies).forEach(([name, strategy]) => {
  const start = performance.now()
  const blocks = strategy.generateBlocks(records)
  const end = performance.now()

  // Calculate metrics
  const metrics = calculateMetrics(blocks, records)

  console.log(`${name}:`)
  console.log(`  Time: ${(end - start).toFixed(2)}ms`)
  console.log(`  Reduction: ${metrics.reduction}%`)
  console.log(`  Blocks: ${blocks.size}`)
})
```

### Monitoring in Production

Track blocking metrics over time:

```typescript
class BlockingMonitor {
  logMetrics(strategy, blocks, records) {
    const metrics = {
      timestamp: new Date().toISOString(),
      strategyName: strategy.name,
      recordCount: records.length,
      blockCount: blocks.size,
      avgBlockSize: this.calculateAvgBlockSize(blocks),
      maxBlockSize: this.calculateMaxBlockSize(blocks),
      // Send to monitoring system
    }

    this.sendToMonitoring(metrics)
  }

  detectAnomalies(metrics) {
    // Alert if metrics degrade
    if (metrics.maxBlockSize > 10000) {
      this.alert('Large block detected')
    }
  }
}
```

## Summary

### Quick Tuning Checklist

- [ ] Measure comparison reduction (target: >95%)
- [ ] Check block count (target: 0.5-5% of records)
- [ ] Analyze block size distribution (max < 5x average)
- [ ] Test recall with known duplicates (target: >90%)
- [ ] Profile block generation time (target: <100ms for 100k)
- [ ] Iterate: adjust one parameter at a time
- [ ] Re-measure after each change

### Common Adjustments

| Problem | Solution |
|---------|----------|
| Low reduction | Use more specific transform or add fields |
| Poor recall | Use phonetic transform or sorted neighbourhood |
| Too slow | Use simpler transform (firstLetter) |
| Skewed blocks | Use soundex instead of firstLetter |
| Missing typo matches | Switch to sorted neighbourhood |

### Next Steps

- [Selection Guide](selection-guide.md) - Choose initial strategy
- [Transforms Reference](transforms.md) - Understand transform options
- [Strategies Guide](strategies.md) - Learn strategy details
- [Overview](overview.md) - Understand blocking fundamentals

Remember: **Start with standard soundex blocking, measure, then tune as needed.**
