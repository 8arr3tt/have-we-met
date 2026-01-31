# Blocking Strategy Selection Guide

This guide helps you choose the right blocking strategy for your specific use case. Follow the decision trees and consider the factors outlined below.

## Quick Selection Tool

Answer these questions to find your recommended strategy:

### 1. What's your dataset size?

- **< 1,000 records** → No blocking needed (or simple firstLetter for practice)
- **1,000 - 10,000 records** → Standard blocking (soundex)
- **10,000 - 100,000 records** → Standard or sorted neighbourhood
- **100,000+ records** → ⚠️ Blocking critical - proceed to question 2

### 2. What's your data quality?

- **High** (consistent formatting, few typos) → Standard blocking (soundex)
- **Medium** (some variations, occasional typos) → Sorted neighbourhood
- **Low** (inconsistent, many typos) → Composite union

### 3. What's more important?

- **Speed** → Standard (firstLetter or soundex)
- **Recall** (finding all matches) → Sorted neighbourhood or composite union
- **Precision** (minimizing false positives) → Standard (soundex)

## Decision Tree

```
START
│
├─ Dataset < 10k records?
│  └─ YES → Standard (soundex) or no blocking
│
├─ Speed critical?
│  └─ YES → Standard (firstLetter)
│
├─ High recall required?
│  ├─ YES → Is data quality high?
│  │  ├─ YES → Sorted neighbourhood
│  │  └─ NO → Composite union
│  │
│  └─ NO → Standard (soundex)
│
├─ Multiple important fields?
│  └─ YES → Composite union
│
└─ DEFAULT → Standard (soundex)
```

## Detailed Selection Criteria

### By Dataset Size

#### Small (< 10,000 records)

**Recommendation:** Simple standard blocking or no blocking

```typescript
.blocking(block => block
  .onField('lastName', { transform: 'firstLetter' })
)
```

**Rationale:**
- O(n²) comparisons are still manageable
- Simple strategy reduces complexity
- Focus on matching quality over performance

#### Medium (10,000 - 100,000 records)

**Recommendation:** Standard blocking with soundex

```typescript
.blocking(block => block
  .onField('lastName', { transform: 'soundex' })
)
```

**Rationale:**
- 99% reduction in comparisons
- Fast block generation (<50ms)
- Good balance of recall and speed

#### Large (100,000 - 1,000,000 records)

**Recommendation:** Strategy depends on recall needs

**High recall:**
```typescript
.blocking(block => block
  .composite('union', comp => comp
    .onField('lastName', { transform: 'soundex' })
    .onField('dateOfBirth', { transform: 'year' })
  )
)
```

**Balanced:**
```typescript
.blocking(block => block
  .onField('lastName', { transform: 'soundex' })
)
```

**Speed-critical:**
```typescript
.blocking(block => block
  .onField('lastName', { transform: 'firstLetter' })
)
```

#### Very Large (1,000,000+ records)

**Recommendation:** Multi-field standard blocking

```typescript
.blocking(block => block
  .onFields(['lastName', 'country', 'birthYear'], {
    transforms: ['soundex', 'identity', 'identity']
  })
)
```

**Rationale:**
- Tighter blocks reduce comparisons further
- Composite keys create more selective blocks
- Consider database indexing strategies

### By Data Quality

#### High Quality Data

**Characteristics:**
- Consistent formatting
- Few typos or variations
- Standardized fields

**Recommendation:** Standard blocking

```typescript
.blocking(block => block
  .onField('lastName', { transform: 'soundex' })
)
```

**Why:** Standard blocking works well when data is clean. Soundex handles minor variations.

#### Medium Quality Data

**Characteristics:**
- Some formatting variations
- Occasional typos
- Mostly consistent

**Recommendation:** Sorted neighbourhood or composite

```typescript
// Option 1: Sorted neighbourhood
.blocking(block => block
  .sortedNeighbourhood('lastName', {
    windowSize: 10,
    transform: 'soundex'
  })
)

// Option 2: Composite with fallback
.blocking(block => block
  .composite('union', comp => comp
    .onField('lastName', { transform: 'soundex' })
    .sortedNeighbourhood('email', { windowSize: 5 })
  )
)
```

**Why:** Sorted neighbourhood catches variations that standard blocking misses.

#### Low Quality Data

**Characteristics:**
- Inconsistent formatting
- Many typos
- Missing or incomplete data

**Recommendation:** Composite union with multiple strategies

```typescript
.blocking(block => block
  .composite('union', comp => comp
    .onField('lastName', { transform: 'soundex' })
    .onField('firstName', { transform: 'firstLetter' })
    .onField('dateOfBirth', { transform: 'year' })
    .sortedNeighbourhood('email', { windowSize: 10 })
  )
)
```

**Why:** Multiple strategies provide fallback matching when one field fails.

### By Field Characteristics

#### Highly Unique Fields (IDs, Emails)

**Recommendation:** Sorted neighbourhood with small window

```typescript
.blocking(block => block
  .sortedNeighbourhood('email', { windowSize: 5 })
)
```

**Why:** Exact matching is too strict; sorted neighbourhood catches typos.

#### Phonetic Fields (Names)

**Recommendation:** Soundex or Metaphone

```typescript
.blocking(block => block
  .onField('lastName', { transform: 'soundex' })
)

// Or for more accuracy:
.blocking(block => block
  .onField('lastName', { transform: 'metaphone' })
)
```

**Why:** Phonetic algorithms group similar-sounding names together.

#### Categorical Fields (Country, State)

**Recommendation:** Identity (exact match)

```typescript
.blocking(block => block
  .onField('country', { transform: 'identity' })
)
```

**Why:** Categories have few variations; exact matching is sufficient.

#### Date Fields

**Recommendation:** Year extraction

```typescript
.blocking(block => block
  .onField('dateOfBirth', { transform: 'year' })
)
```

**Why:** Year provides reasonable grouping without being too broad.

#### Text Fields with Variations

**Recommendation:** First few characters or soundex

```typescript
// Option 1: First 3 characters
.blocking(block => block
  .onField('companyName', {
    transform: 'firstN',
    transformOptions: { n: 3 }
  })
)

// Option 2: Soundex
.blocking(block => block
  .onField('companyName', { transform: 'soundex' })
)
```

**Why:** Balances specificity with tolerance for variations.

## Common Scenarios and Recommendations

### Person Matching

**Scenario:** Deduplicate customer records across systems

**Basic:**
```typescript
.blocking(block => block
  .onField('lastName', { transform: 'soundex' })
)
```

**Advanced:**
```typescript
.blocking(block => block
  .composite('union', comp => comp
    .onField('lastName', { transform: 'soundex' })
    .onField('dateOfBirth', { transform: 'year' })
  )
)
```

**Rationale:**
- Soundex handles name variations and typos
- Birth year provides fallback for name changes
- Union mode ensures maximum recall

### Address Matching

**Scenario:** Find duplicate addresses in a mailing list

**Recommended:**
```typescript
.blocking(block => block
  .onFields(['postcode', 'street'], {
    transforms: ['identity', 'firstLetter']
  })
)
```

**Rationale:**
- Postcode narrows location precisely
- First letter of street handles minor variations
- Composite key creates tight, specific blocks

### Company Matching

**Scenario:** Match organizations across databases

**Recommended:**
```typescript
.blocking(block => block
  .composite('union', comp => comp
    .onField('name', { transform: 'soundex' })
    .onField('country', { transform: 'identity' })
  )
)
```

**Rationale:**
- Soundex handles company name variations
- Country provides geographic grouping
- Union mode catches matches via either field

### Email Deduplication

**Scenario:** Find duplicate or similar email addresses

**Recommended:**
```typescript
.blocking(block => block
  .composite('union', comp => comp
    // Block on domain
    .onField('email', {
      transform: (email) => email?.split('@')[1] || null
    })
    // Sorted neighbourhood for typos
    .sortedNeighbourhood('email', { windowSize: 5 })
  )
)
```

**Rationale:**
- Domain blocking groups same-organization emails
- Sorted neighbourhood catches typos
- Small window (5) is sufficient for emails

### Product Matching

**Scenario:** Match products across catalogs

**Recommended:**
```typescript
.blocking(block => block
  .composite('union', comp => comp
    .onField('brand', { transform: 'soundex' })
    .onField('category', { transform: 'identity' })
    .onField('sku', {
      transform: 'firstN',
      transformOptions: { n: 4 }
    })
  )
)
```

**Rationale:**
- Brand with soundex handles variations
- Category provides natural grouping
- SKU prefix helps with similar products

## Performance Considerations

### Optimizing for Speed

**Goal:** Minimize block generation time

**Strategy:**
1. Use simple transforms (firstLetter > soundex > metaphone)
2. Avoid sorted neighbourhood if possible
3. Use single-field blocking
4. Prefer union over intersection mode

**Example:**
```typescript
.blocking(block => block
  .onField('lastName', { transform: 'firstLetter' })
)
```

**Result:**
- Fastest generation time (~17ms for 100k records)
- Still achieves 96%+ reduction

### Optimizing for Recall

**Goal:** Find maximum number of true matches

**Strategy:**
1. Use composite union mode
2. Include multiple complementary fields
3. Use phonetic transforms (soundex, metaphone)
4. Add sorted neighbourhood as fallback

**Example:**
```typescript
.blocking(block => block
  .composite('union', comp => comp
    .onField('lastName', { transform: 'soundex' })
    .onField('firstName', { transform: 'firstLetter' })
    .onField('dateOfBirth', { transform: 'year' })
    .sortedNeighbourhood('email', { windowSize: 10 })
  )
)
```

**Result:**
- Maximum recall across multiple fields
- Higher comparison count (but still 90%+ reduction)

### Optimizing for Precision

**Goal:** Minimize false positive comparisons

**Strategy:**
1. Use tighter blocks (soundex or multi-field)
2. Avoid overly broad blocks (firstLetter with high-frequency initial)
3. Consider intersection mode for very large datasets
4. Use composite keys for specificity

**Example:**
```typescript
.blocking(block => block
  .onFields(['lastName', 'birthYear', 'country'], {
    transforms: ['soundex', 'identity', 'identity']
  })
)
```

**Result:**
- Fewer, more specific blocks
- Lower false positive rate
- Highest comparison reduction

## Testing Your Strategy

### Measuring Effectiveness

After implementing a blocking strategy, measure:

1. **Block count** - Total number of blocks created
2. **Block size distribution** - Min, max, average records per block
3. **Comparison reduction** - Percentage vs exhaustive comparison
4. **Recall** - Percentage of true matches found
5. **Precision** - Percentage of comparisons that are true matches

### Analyzing Block Distribution

```typescript
// Example stats from your blocking:
Total records: 100,000
Total blocks: 1,200
Average records per block: 83
Min block size: 1
Max block size: 450
Comparisons: 50 million (vs 5 billion)
Reduction: 99%
```

**Good distribution:**
- Blocks are relatively balanced
- Max block size < 10% of average
- Comparison reduction > 95%

**Poor distribution:**
- One or few blocks with thousands of records
- Many blocks with only 1-2 records
- Comparison reduction < 90%

### Tuning Based on Results

**If blocks are too large:**
- Use more specific transform (firstLetter → soundex)
- Add more fields (single → multi-field)
- Reduce window size (sorted neighbourhood)

**If recall is too low:**
- Use broader transform (soundex → firstLetter)
- Switch to composite union
- Add sorted neighbourhood
- Increase window size

**If performance is too slow:**
- Simplify transform (soundex → firstLetter)
- Reduce number of strategies
- Avoid sorted neighbourhood
- Switch to single-field blocking

## Migration Path

### Starting Point: No Blocking

```typescript
.matching(match => /* ... */)
.build()
```

**Problem:** Dataset grew to 50k records, matching takes hours.

### Step 1: Add Simple Blocking

```typescript
.blocking(block => block
  .onField('lastName', { transform: 'firstLetter' })
)
.matching(match => /* ... */)
.build()
```

**Result:** 96% reduction, but some matches missed.

### Step 2: Improve with Phonetic Transform

```typescript
.blocking(block => block
  .onField('lastName', { transform: 'soundex' })
)
.matching(match => /* ... */)
.build()
```

**Result:** 99% reduction, better recall.

### Step 3: Add Fallback Field

```typescript
.blocking(block => block
  .composite('union', comp => comp
    .onField('lastName', { transform: 'soundex' })
    .onField('dateOfBirth', { transform: 'year' })
  )
)
.matching(match => /* ... */)
.build()
```

**Result:** Maximum recall, 94% reduction, slight performance cost.

## Summary

### Quick Recommendations

| Scenario | Recommended Strategy |
|----------|---------------------|
| General person matching | Standard (soundex on lastName) |
| High recall person matching | Composite (soundex + birthYear) |
| Address matching | Multi-field (postcode + street) |
| Email deduplication | Composite (domain + sorted) |
| Company matching | Composite (name soundex + country) |
| Speed-critical | Standard (firstLetter) |
| Recall-critical | Composite union + sorted neighbourhood |

### Decision Factors Priority

1. **Dataset size** - Most important (determines if blocking is needed)
2. **Data quality** - Affects strategy choice
3. **Recall vs speed** - Determines complexity
4. **Field characteristics** - Informs transform selection

### Next Steps

- [Transforms Reference](transforms.md) - Learn about available transforms
- [Tuning Guide](tuning.md) - Optimize your chosen strategy
- [Strategies Guide](strategies.md) - Deep dive into each strategy
- [Overview](overview.md) - Understand blocking fundamentals

## Need Help?

If you're unsure which strategy to choose:

1. Start with standard soundex blocking
2. Measure recall and performance
3. Adjust based on results:
   - Low recall? → Add more strategies (composite)
   - Too slow? → Simplify transform
   - Poor distribution? → Change field or transform

Remember: **Standard soundex blocking is the default choice for 90% of use cases.**
