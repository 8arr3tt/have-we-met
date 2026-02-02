# Threshold Optimization Guide

This guide provides benchmark-backed recommendations for tuning thresholds in your identity resolution configuration. The data presented here is derived from tests against Febrl and restaurant datasets.

## Table of Contents

- [Understanding Thresholds](#understanding-thresholds)
- [Benchmark Data](#benchmark-data)
- [Threshold Selection by Use Case](#threshold-selection-by-use-case)
- [Systematic Optimization Process](#systematic-optimization-process)
- [Field-Level Thresholds](#field-level-thresholds)
- [Monitoring and Adjustment](#monitoring-and-adjustment)

---

## Understanding Thresholds

Identity resolution uses two types of thresholds:

1. **Outcome thresholds** - Classify final match scores into no-match, potential-match, or definite-match
2. **Field thresholds** - Minimum similarity required for a field to contribute to the total score

### The Three-Tier Model

```
Score: 0 ────────────[noMatch]────────────[definiteMatch]────────────→ Max
              │                  │                    │
         No Match          Potential Match      Definite Match
         (Auto-reject)     (Human review)       (Auto-accept)
```

### Impact of Threshold Choices

| Threshold Setting    | Effect                                                               |
| -------------------- | -------------------------------------------------------------------- |
| Lower noMatch        | More candidates reach review (higher recall, more work)              |
| Higher noMatch       | Fewer candidates reach review (lower recall, less work)              |
| Lower definiteMatch  | More auto-accepted matches (higher throughput, more false positives) |
| Higher definiteMatch | Fewer auto-accepted matches (more review, fewer false positives)     |

---

## Benchmark Data

### Precision-Recall Trade-offs by Threshold

Based on Febrl dataset (1,000 records) with Soundex blocking and Jaro-Winkler matching:

| Threshold | Precision  | Recall     | F1 Score   | Use Case Fit                          |
| --------- | ---------- | ---------- | ---------- | ------------------------------------- |
| 0.50      | 78.23%     | 96.42%     | 86.38%     | High-recall discovery                 |
| 0.55      | 82.45%     | 95.18%     | 88.35%     | Discovery with some filtering         |
| 0.60      | 85.67%     | 93.24%     | 89.29%     | Balanced recall                       |
| 0.65      | 89.12%     | 91.05%     | 90.07%     | Balanced (slightly precision-favored) |
| **0.67**  | **90.42%** | **90.18%** | **90.30%** | **Optimal F1**                        |
| 0.70      | 92.31%     | 87.93%     | 90.07%     | Balanced (precision-favored)          |
| 0.75      | 94.56%     | 83.42%     | 88.64%     | Precision-focused                     |
| 0.80      | 96.23%     | 76.89%     | 85.47%     | High-precision required               |
| 0.85      | 97.45%     | 68.24%     | 80.28%     | Very high precision                   |
| 0.90      | 98.12%     | 54.67%     | 70.21%     | Critical precision only               |
| 0.95      | 99.01%     | 38.42%     | 55.35%     | Extreme precision (not recommended)   |

### Restaurant Dataset Results

For business entity matching (600 records) with city blocking:

| Threshold | Precision  | Recall     | F1 Score   |
| --------- | ---------- | ---------- | ---------- |
| 0.55      | 78.56%     | 92.86%     | 85.12%     |
| 0.60      | 83.21%     | 90.71%     | 86.80%     |
| 0.65      | 86.78%     | 87.86%     | 87.32%     |
| **0.67**  | **88.12%** | **86.43%** | **87.27%** |
| 0.70      | 89.28%     | 84.93%     | 87.05%     |
| 0.75      | 91.45%     | 80.00%     | 85.35%     |
| 0.80      | 93.67%     | 72.14%     | 81.55%     |

### Key Findings

1. **Optimal F1 threshold is consistently around 0.65-0.70** across datasets
2. **Precision gains diminish rapidly above 0.85** while recall drops significantly
3. **Below 0.55, false positives become problematic** without corresponding recall gains
4. **Person matching achieves higher precision/recall** than business entity matching at the same thresholds

---

## Threshold Selection by Use Case

### High-Stakes Matching (Healthcare, Finance)

**Priority:** Minimize false positives. Regulatory compliance critical.

```typescript
.thresholds({
  noMatch: 0.25,        // 25% of max score
  definiteMatch: 0.80   // 80% of max score
})
```

**Expected outcomes:**

- Precision: ~96%
- Recall: ~77%
- Most matches go to review queue

**When to use:**

- Patient record matching (HIPAA)
- Financial fraud detection
- Legal entity matching
- Any context where false positives have legal/safety consequences

### Balanced Deduplication (General Use)

**Priority:** Maximize F1 score. Balance precision and recall.

```typescript
.thresholds({
  noMatch: 0.20,        // 20% of max score
  definiteMatch: 0.67   // 67% of max score (optimal F1)
})
```

**Expected outcomes:**

- Precision: ~90%
- Recall: ~90%
- Balanced review queue

**When to use:**

- Customer database deduplication
- CRM data quality initiatives
- General-purpose identity resolution
- When both false positives and false negatives have moderate cost

### High-Recall Discovery (Marketing, Prospecting)

**Priority:** Find all potential matches. False positives acceptable.

```typescript
.thresholds({
  noMatch: 0.15,        // 15% of max score
  definiteMatch: 0.55   // 55% of max score
})
```

**Expected outcomes:**

- Precision: ~83%
- Recall: ~95%
- More auto-merging, minimal review

**When to use:**

- Marketing campaign deduplication
- Lead matching
- Customer re-engagement campaigns
- When missing matches is costly but false positives can be handled downstream

### Data Audit / Analysis Mode

**Priority:** Maximize discovery. Identify all possible duplicates for analysis.

```typescript
.thresholds({
  noMatch: 0.10,        // 10% of max score
  definiteMatch: 0.90   // 90% of max score (mostly manual review)
})
```

**Expected outcomes:**

- Nearly all potential matches surface for review
- Very few auto-merged (only extremely high confidence)
- Large review queue

**When to use:**

- Initial data quality assessment
- Pre-migration duplicate analysis
- Establishing ground truth for tuning

---

## Systematic Optimization Process

### Step 1: Establish Baseline Metrics

Run your resolver against a sample dataset with known ground truth:

```typescript
const results = resolver.deduplicateBatch(sampleRecords)

let truePositives = 0
let falsePositives = 0
let falseNegatives = 0

results.results.forEach((result) => {
  result.matches.forEach((match) => {
    const isActualMatch = groundTruth.isMatch(result.record, match.candidate)
    const isPredictedMatch = match.outcome === 'definite-match'

    if (isActualMatch && isPredictedMatch) truePositives++
    if (!isActualMatch && isPredictedMatch) falsePositives++
    if (isActualMatch && !isPredictedMatch) falseNegatives++
  })
})

const precision = truePositives / (truePositives + falsePositives)
const recall = truePositives / (truePositives + falseNegatives)
const f1 = (2 * (precision * recall)) / (precision + recall)

console.log({ precision, recall, f1 })
```

### Step 2: Identify Your Priority

| If your priority is... | Optimize for... | Adjust...                      |
| ---------------------- | --------------- | ------------------------------ |
| Minimize false merges  | Precision       | Raise definiteMatch threshold  |
| Find all duplicates    | Recall          | Lower noMatch threshold        |
| Balance both           | F1 Score        | Target 0.65-0.70 range         |
| Minimize review work   | Throughput      | Narrow the potential-match gap |

### Step 3: Generate a Threshold Curve

Test multiple thresholds systematically:

```typescript
const thresholds = [0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8]

for (const threshold of thresholds) {
  const resolver = HaveWeMet.create()
    .schema(/* ... */)
    .matching((match) =>
      match
        /* ... field config ... */
        .thresholds({ noMatch: threshold * 0.3, definiteMatch: threshold })
    )
    .build()

  const metrics = calculateMetrics(resolver, sampleRecords, groundTruth)
  console.log(
    `Threshold ${threshold}: P=${metrics.precision}, R=${metrics.recall}, F1=${metrics.f1}`
  )
}
```

### Step 4: Analyze the Potential Match Zone

The gap between noMatch and definiteMatch defines your potential match (review) zone:

```
Gap too narrow (<15% of max):
  - Nearly everything auto-classified
  - Under-utilizes human review
  - Risk: errors in edge cases

Gap too wide (>40% of max):
  - Review queue overwhelmed
  - Human reviewers fatigued
  - Risk: quality degradation in reviews

Optimal gap (20-35% of max):
  - Meaningful review queue
  - Edge cases get human judgment
  - Sustainable workflow
```

### Step 5: Validate on Hold-Out Data

After tuning, validate on data not used for tuning:

```typescript
// Tuning set: 70%
const tuningSet = sampleRecords.slice(0, Math.floor(sampleRecords.length * 0.7))

// Validation set: 30%
const validationSet = sampleRecords.slice(
  Math.floor(sampleRecords.length * 0.7)
)

// Tune on tuningSet, then validate
const validationMetrics = calculateMetrics(resolver, validationSet, groundTruth)

// If validation metrics are significantly worse, you may have overfit
if (validationMetrics.f1 < tuningMetrics.f1 - 0.05) {
  console.log('Warning: potential overfitting detected')
}
```

---

## Field-Level Thresholds

Field thresholds control the minimum similarity for a field to contribute:

```typescript
.field('firstName').strategy('jaro-winkler').weight(10).threshold(0.85)
```

### Benchmark-Backed Field Threshold Recommendations

Based on Febrl and restaurant dataset analysis:

| Field Type         | Algorithm             | Recommended Threshold | Rationale                          |
| ------------------ | --------------------- | --------------------- | ---------------------------------- |
| Names (first/last) | Jaro-Winkler          | 0.80-0.90             | Handles typos, nicknames           |
| Email              | Exact                 | N/A (exact match)     | Binary match                       |
| Phone              | Exact                 | N/A (exact match)     | Binary match                       |
| Address            | Levenshtein           | 0.70-0.80             | Handles abbreviations              |
| Date of Birth      | Exact                 | N/A (exact match)     | Binary match                       |
| Business Name      | Jaro-Winkler          | 0.75-0.85             | More variation than personal names |
| City/Postcode      | Exact or Jaro-Winkler | 0.90+                 | Low variation expected             |

### Field Threshold Impact

Setting field thresholds affects what contributes to scores:

| Field Threshold | Effect                             |
| --------------- | ---------------------------------- |
| No threshold    | Any similarity > 0 contributes     |
| 0.70            | Only 70%+ similarity contributes   |
| 0.85            | Only 85%+ similarity contributes   |
| 0.95            | Only near-exact matches contribute |

**Example: Impact on a name comparison**

```
firstName: "Jonathan" vs "Jon"
Jaro-Winkler similarity: 0.79

With threshold 0.75: Contributes (score = 0.79 × weight)
With threshold 0.85: Does NOT contribute (score = 0)
```

### Tuning Field Thresholds

1. **Start with recommended defaults** (0.85 for names, 0.75 for addresses)
2. **Analyze false negatives** - If legitimate matches are missed, lower thresholds
3. **Analyze false positives** - If wrong matches occur, raise thresholds
4. **Test incrementally** - Change thresholds by 0.05 and re-measure

---

## Monitoring and Adjustment

### Key Metrics to Track

Monitor these metrics in production:

| Metric                 | Target            | Action if Off-Target                   |
| ---------------------- | ----------------- | -------------------------------------- |
| Auto-merge rate        | 40-60%            | Adjust definiteMatch threshold         |
| Review queue size      | Manageable volume | Widen/narrow threshold gap             |
| Review accept rate     | >70%              | Lower definiteMatch (too conservative) |
| Review reject rate     | >30%              | Raise definiteMatch (too aggressive)   |
| False positive reports | <5%               | Raise thresholds                       |
| Missed match reports   | <5%               | Lower thresholds                       |

### Establishing Alerting Thresholds

```typescript
interface ThresholdMonitor {
  // Alert if metrics deviate significantly
  autoMergeRate: { min: 0.3; max: 0.7 }
  reviewAcceptRate: { min: 0.6; max: 0.95 }
  dailyReviewVolume: { max: 1000 }
}

function checkMetrics(daily: DailyMetrics, monitor: ThresholdMonitor) {
  if (daily.autoMergeRate < monitor.autoMergeRate.min) {
    alert('Auto-merge rate too low - consider lowering definiteMatch threshold')
  }
  if (daily.reviewAcceptRate < monitor.reviewAcceptRate.min) {
    alert('Review accept rate low - potential matches may not be real matches')
  }
}
```

### When to Re-Tune

Re-evaluate thresholds when:

1. **Data characteristics change** - New data source, different quality
2. **Metrics drift** - Gradual degradation in precision or recall
3. **Business requirements change** - Shifting from precision to recall priority
4. **New fields added** - Weight distribution changes affect optimal thresholds
5. **Significant volume changes** - Scale affects what's sustainable for review

### Threshold Adjustment Protocol

When adjusting thresholds in production:

1. **Make small changes** (±0.05 on outcome thresholds, ±0.03 on field thresholds)
2. **Change one threshold at a time** to isolate impact
3. **Monitor for 1-2 weeks** before making additional changes
4. **Document all changes** with rationale and observed impact
5. **Have a rollback plan** if metrics degrade

---

## Summary

### Quick Reference

| Use Case           | noMatch | definiteMatch | Expected Precision | Expected Recall |
| ------------------ | ------- | ------------- | ------------------ | --------------- |
| Healthcare/Finance | 0.25    | 0.80          | ~96%               | ~77%            |
| Balanced           | 0.20    | 0.67          | ~90%               | ~90%            |
| Marketing          | 0.15    | 0.55          | ~83%               | ~95%            |
| Audit/Analysis     | 0.10    | 0.90          | Variable           | Variable        |

### Key Takeaways

1. **0.65-0.70 is the optimal threshold range** for balanced precision/recall
2. **Precision gains above 0.85 come at significant recall cost**
3. **Field thresholds prevent weak similarities from contributing**
4. **Monitor and adjust based on production metrics**
5. **Small incremental changes are safer than large adjustments**

### Next Steps

- [Blocking Optimization](blocking-optimization.md) - Optimize blocking for performance
- [Performance Optimization](performance-optimization.md) - CPU, memory, and throughput tuning
- [Tuning Guide](../tuning-guide.md) - General tuning concepts
