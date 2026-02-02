# Matching Scopes Guide

## Table of Contents

- [Introduction](#introduction)
- [Within-Source-First Strategy](#within-source-first-strategy)
- [Unified Pool Strategy](#unified-pool-strategy)
- [Comparison and Trade-offs](#comparison-and-trade-offs)
- [Performance Characteristics](#performance-characteristics)
- [Choosing the Right Strategy](#choosing-the-right-strategy)
- [Advanced Patterns](#advanced-patterns)
- [Best Practices](#best-practices)

---

## Introduction

Matching scope determines how records are compared when consolidating from multiple sources. have-we-met provides two strategies, each optimized for different scenarios.

### The Matching Challenge

When consolidating from multiple sources, you face a choice:

```
Source A: 1,000 records
Source B: 1,000 records
Source C: 1,000 records
Total: 3,000 records

How to match?

Option 1: Within-Source-First
- Dedupe within A (1,000 comparisons)
- Dedupe within B (1,000 comparisons)
- Dedupe within C (1,000 comparisons)
- Match across A-B-C (fewer comparisons)

Option 2: Unified Pool
- Match all 3,000 records together
- Single comparison pool
- More comprehensive but more expensive
```

### Two Strategies

1. **Within-Source-First**: Deduplicate within each source, then match across sources
2. **Unified Pool**: Match all records together in a single pool

---

## Within-Source-First Strategy

### Overview

Within-source-first processes each source independently, then matches the deduplicated results across sources.

```typescript
.matchingScope('within-source-first')
```

### How It Works

```
┌─────────────────────────────────────────────────────┐
│ Phase 1: Within-Source Deduplication                │
└─────────────────────────────────────────────────────┘

Source A (CRM)           Source B (Billing)      Source C (Support)
1,000 records            800 records             600 records
      ↓                       ↓                       ↓
  Dedupe                  Dedupe                  Dedupe
      ↓                       ↓                       ↓
850 unique               700 unique              550 unique

┌─────────────────────────────────────────────────────┐
│ Phase 2: Cross-Source Matching                      │
└─────────────────────────────────────────────────────┘

850 (CRM) + 700 (Billing) + 550 (Support) = 2,100 records
      ↓
  Match across sources
      ↓
1,500 golden records
```

### Process Details

**Phase 1: Within-Source Deduplication**

```typescript
// For each source independently:
// 1. Load all records from source
// 2. Map to unified schema
// 3. Find duplicates within source
// 4. Merge duplicates (using source's own data)
// 5. Output: deduplicated records from this source
```

**Phase 2: Cross-Source Matching**

```typescript
// 1. Take deduplicated records from all sources
// 2. Compare records across sources
// 3. Find matches between sources
// 4. Merge matches using source priority
// 5. Output: final golden records
```

### Configuration Example

```typescript
const result = await HaveWeMet.consolidation<Customer>()
  .source('crm', (source) =>
    source
      .adapter(crmAdapter)
      .mapping((map) =>
        map
          .field('email')
          .from('email_address')
          .field('firstName')
          .from('first_name')
          .field('lastName')
          .from('last_name')
      )
      .priority(3)
  )

  .source('billing', (source) =>
    source
      .adapter(billingAdapter)
      .mapping((map) =>
        map
          .field('email')
          .from('email')
          .field('firstName')
          .from('fname')
          .field('lastName')
          .from('lname')
      )
      .priority(2)
  )

  .source('support', (source) =>
    source
      .adapter(supportAdapter)
      .mapping((map) =>
        map
          .field('email')
          .from('contact_email')
          .field('firstName')
          .from('given_name')
          .field('lastName')
          .from('family_name')
      )
      .priority(1)
  )

  // Use within-source-first strategy
  .matchingScope('within-source-first')

  .matching((match) =>
    match
      .field('email')
      .strategy('exact')
      .weight(30)
      .field('firstName')
      .strategy('jaro-winkler')
      .weight(10)
      .threshold(0.85)
      .field('lastName')
      .strategy('jaro-winkler')
      .weight(10)
      .threshold(0.85)
  )
  .thresholds({ noMatch: 20, definiteMatch: 45 })

  .conflictResolution((cr) =>
    cr.useSourcePriority(true).defaultStrategy('preferNonNull')
  )

  .build()
  .consolidate()
```

### Advantages

**Performance**: Faster for large datasets

- Processes smaller batches
- Reduces total comparisons
- More memory efficient

**Source Isolation**: Maintains source integrity

- Deduplicates using source-specific rules
- Preserves source data quality
- Easier to debug issues

**Incremental Processing**: Can process sources separately

- Add new sources without reprocessing old ones
- Update one source without touching others
- Suitable for streaming/incremental updates

### Disadvantages

**Potential Missed Matches**: May miss some duplicates

- If duplicate exists in both A and B, but each appears unique within its source
- Example: CRM has "John Smith" and "J. Smith", Billing has "John Smith"
  - Within-source: CRM creates 2 records, Billing creates 1 record
  - Cross-source: May only match one of CRM's records with Billing
  - Result: "J. Smith" from CRM might not match

**Two-Phase Complexity**: More complex logic

- Different matching rules for within-source vs cross-source
- Harder to reason about results
- Debugging requires checking both phases

### When to Use

Use within-source-first when:

✅ Sources have significant internal duplicates
✅ Performance is critical (large datasets)
✅ Sources have clear priority hierarchy
✅ Source data quality varies (want to dedupe high-quality source independently)
✅ Incremental processing needed

**Example Scenarios**:

- SaaS multi-product consolidation (each product has its own dupes)
- Post-merger integration (both companies have internal dupes)
- ETL pipelines (process each source separately)

---

## Unified Pool Strategy

### Overview

Unified pool matches all records together in a single comparison pool, treating within-source and cross-source matches equally.

```typescript
.matchingScope('unified-pool')
```

### How It Works

```
┌─────────────────────────────────────────────────────┐
│ Single-Phase: Unified Matching                      │
└─────────────────────────────────────────────────────┘

Source A (CRM)           Source B (Billing)      Source C (Support)
1,000 records            800 records             600 records
      ↓                       ↓                       ↓
    Map                     Map                     Map
      ↓                       ↓                       ↓
      └───────────────────────┴───────────────────────┘
                            ↓
                  Unified Pool (2,400 records)
                            ↓
              Match all records together
         (within-source + cross-source)
                            ↓
                  1,500 golden records
```

### Process Details

**Single Phase: Unified Matching**

```typescript
// 1. Load records from all sources
// 2. Map each record to unified schema
// 3. Put all records in single pool
// 4. Find all duplicates (regardless of source)
// 5. Merge matches using source priority
// 6. Output: final golden records
```

### Configuration Example

```typescript
const result = await HaveWeMet.consolidation<Patient>()
  .source('hospital_a', (source) =>
    source
      .adapter(hospitalAAdapter)
      .mapping((map) =>
        map
          .field('ssn')
          .from('social_security_number')
          .field('dateOfBirth')
          .from('dob')
          .field('firstName')
          .from('first_name')
          .field('lastName')
          .from('last_name')
      )
      .priority(3)
  )

  .source('hospital_b', (source) =>
    source
      .adapter(hospitalBAdapter)
      .mapping((map) =>
        map
          .field('ssn')
          .from('ssn')
          .field('dateOfBirth')
          .from('date_of_birth')
          .field('firstName')
          .from('fname')
          .field('lastName')
          .from('lname')
      )
      .priority(2)
  )

  .source('hospital_c', (source) =>
    source
      .adapter(hospitalCAdapter)
      .mapping((map) =>
        map
          .field('ssn')
          .from('patient_ssn')
          .field('dateOfBirth')
          .from('birth_date')
          .field('firstName')
          .from('given_name')
          .field('lastName')
          .from('family_name')
      )
      .priority(1)
  )

  // Use unified pool strategy
  .matchingScope('unified-pool')

  .schema((schema) =>
    schema
      .field('ssn', { type: 'string', optional: true })
      .field('dateOfBirth', { type: 'date' })
      .field('firstName', { type: 'name', component: 'first' })
      .field('lastName', { type: 'name', component: 'last' })
  )

  .matching((match) =>
    match
      .field('ssn')
      .strategy('exact')
      .weight(30)
      .field('dateOfBirth')
      .strategy('exact')
      .weight(20)
      .field('lastName')
      .strategy('jaro-winkler')
      .weight(15)
      .threshold(0.9)
      .field('firstName')
      .strategy('jaro-winkler')
      .weight(12)
      .threshold(0.85)
  )
  .thresholds({ noMatch: 30, definiteMatch: 60 }) // Conservative for healthcare

  .conflictResolution((cr) =>
    cr.useSourcePriority(true).defaultStrategy('preferNonNull')
  )

  .build()
  .consolidate()
```

### Advantages

**Comprehensive Matching**: Finds all duplicates

- No distinction between within-source and cross-source
- Same matching rules applied uniformly
- Catches duplicates that within-source-first might miss

**Simpler Logic**: Single matching phase

- Same rules for all comparisons
- Easier to understand and debug
- More predictable results

**Better for Clean Data**: Optimal when sources have few internal duplicates

- No wasted effort on within-source deduplication
- Directly finds cross-source matches

### Disadvantages

**Performance**: Slower for large datasets

- More total comparisons
- Larger memory footprint
- Single large batch instead of smaller batches

**Source Data Quality**: Treats all sources equally during matching

- Can't isolate high-quality source deduplication
- Lower-quality source data affects all matching

**No Incremental Processing**: Must process all sources together

- Can't add sources incrementally
- Updating one source requires reprocessing all

### When to Use

Use unified pool when:

✅ Sources have minimal internal duplicates
✅ Comprehensive matching is critical (can't miss any duplicates)
✅ Data quality is consistent across sources
✅ Dataset size is manageable (< 100k records per source)
✅ Accuracy more important than performance

**Example Scenarios**:

- Healthcare Master Patient Index (must catch all duplicates)
- Fraud detection (comprehensive matching required)
- Compliance/regulatory (can't miss duplicates)
- High-quality data sources (e.g., verified customer lists)

---

## Comparison and Trade-offs

### Side-by-Side Comparison

| Aspect               | Within-Source-First | Unified Pool       |
| -------------------- | ------------------- | ------------------ |
| **Speed**            | ⚡⚡⚡ Faster       | ⚡⚡ Slower        |
| **Memory**           | 💾💾 Efficient      | 💾💾💾 More memory |
| **Completeness**     | 🎯🎯 May miss some  | 🎯🎯🎯 Finds all   |
| **Complexity**       | 🔧🔧🔧 Two-phase    | 🔧🔧 Single-phase  |
| **Incremental**      | ✅ Supported        | ❌ Not supported   |
| **Source Isolation** | ✅ Maintained       | ❌ Mixed           |
| **Debugging**        | 🔍🔍🔍 Complex      | 🔍🔍 Simpler       |

### Performance Comparison

#### Small Dataset (3 sources × 1,000 records each)

```
Within-Source-First:
- Phase 1: ~3,000 comparisons (1,000 per source)
- Phase 2: ~500,000 comparisons
- Total: ~503,000 comparisons
- Time: ~2 seconds

Unified Pool:
- Single Phase: ~4.5 million comparisons
- Time: ~4 seconds
```

#### Medium Dataset (3 sources × 10,000 records each)

```
Within-Source-First:
- Phase 1: ~300,000 comparisons (100k per source)
- Phase 2: ~50 million comparisons
- Total: ~50.3 million comparisons
- Time: ~25 seconds

Unified Pool:
- Single Phase: ~450 million comparisons
- Time: ~60 seconds
```

#### Large Dataset (3 sources × 50,000 records each)

```
Within-Source-First:
- Phase 1: ~7.5 million comparisons
- Phase 2: ~1.25 billion comparisons
- Total: ~1.26 billion comparisons
- Time: ~3 minutes

Unified Pool:
- Single Phase: ~11.25 billion comparisons
- Time: ~10 minutes
```

Note: These are theoretical comparisons. Real-world performance depends on blocking strategies, which dramatically reduce comparisons.

### Matching Completeness

#### Within-Source-First Potential Miss

```typescript
// Source A (CRM) - Internal duplicates
Record 1: { email: "john.smith@example.com", name: "John Smith" }
Record 2: { email: "j.smith@example.com", name: "J. Smith" }

// Source B (Billing)
Record 3: { email: "john.smith@example.com", name: "John Smith" }

// Within-Source-First Processing:
// Phase 1: Dedupe within sources
//   - Source A: May not match Record 1 & 2 (different emails)
//   - Result: Both records pass through
// Phase 2: Match across sources
//   - Record 1 (CRM) matches Record 3 (Billing) ✓
//   - Record 2 (CRM) doesn't match anything ✗
// Outcome: Creates 2 golden records (should be 1)

// Unified Pool Processing:
// Single Phase: Match all records
//   - Record 1 matches Record 3 (exact email)
//   - Record 2 matches Record 1 & 3 (name similarity)
//   - All three matched together
// Outcome: Creates 1 golden record ✓
```

#### Unified Pool Comprehensive Match

```typescript
// Same data as above

// Unified Pool sees all three records together:
Record 1: john.smith@example.com, John Smith (CRM)
Record 2: j.smith@example.com, J. Smith (CRM)
Record 3: john.smith@example.com, John Smith (Billing)

// Matching:
// Record 1 ↔ Record 3: Score 50 (exact email + name match)
// Record 1 ↔ Record 2: Score 35 (name similarity, different email)
// Record 2 ↔ Record 3: Score 35 (name similarity, different email)

// With threshold = 45 (definite match):
// Record 1 & 3 matched (score 50)
// Record 2 potential match (score 35)

// Result: 1 definite golden record + 1 potential match for review
```

---

## Performance Characteristics

### Blocking Strategies Impact

Blocking strategies dramatically improve performance for both scopes:

```typescript
// Without blocking
.matchingScope('within-source-first')
// 10k records per source = 300 million comparisons

// With email blocking
.blocking(block => block.standard('email'))
// Groups records by email
// Average 2 records per email = ~20k comparisons (99.99% reduction!)

// With multiple blocking strategies
.blocking(block => block
  .standard('email')
  .sortedNeighborhood('lastName', 10)
)
// Even more efficient
```

### Memory Usage

**Within-Source-First**:

```typescript
// Peak memory usage occurs during cross-source matching
// Memory ≈ (deduplicated_records_A + deduplicated_records_B + deduplicated_records_C) × record_size

// Example: 3 sources, 50k records each, 70% duplication rate
// Deduplicated: 15k + 15k + 15k = 45k records
// Memory: ~45k × 1KB = ~45 MB
```

**Unified Pool**:

```typescript
// Peak memory usage is all records at once
// Memory ≈ total_records × record_size

// Example: 3 sources, 50k records each
// Total: 150k records
// Memory: ~150k × 1KB = ~150 MB
```

### CPU Utilization

Both strategies benefit from parallel processing:

```typescript
// Within-source-first: Phase 1 can be parallelized
// Process each source on separate CPU core
// Phase 2 uses all cores for cross-source matching

// Unified pool: Single phase uses all cores
// Comparison operations parallelized
```

---

## Choosing the Right Strategy

### Decision Tree

```
Do sources have significant internal duplicates?
│
├─ Yes → Use Within-Source-First
│         ├─ Each source needs deduplication
│         └─ Example: Product databases with their own dupes
│
└─ No → Consider other factors
          │
          ├─ Is comprehensive matching critical?
          │  ├─ Yes → Use Unified Pool
          │  │         └─ Example: Healthcare MPI
          │  │
          │  └─ No → Is performance critical?
          │            ├─ Yes → Use Within-Source-First
          │            │         └─ Example: Large ETL pipeline
          │            │
          │            └─ No → Use Unified Pool
          │                      └─ Simpler, more predictable
```

### Scenario-Based Recommendations

#### Scenario 1: SaaS Multi-Product (CRM, Billing, Support)

```typescript
// Recommendation: Within-Source-First
// Reason:
// - Each product has internal duplicates
// - Clear priority hierarchy (CRM > Billing > Support)
// - Good performance for large customer bases

.matchingScope('within-source-first')
```

#### Scenario 2: Healthcare Master Patient Index

```typescript
// Recommendation: Unified Pool
// Reason:
// - Must catch all possible duplicates (patient safety)
// - False negatives are dangerous
// - Sources typically have clean data (few internal dupes)

.matchingScope('unified-pool')
.thresholds({ noMatch: 30, definiteMatch: 60 })  // Conservative
```

#### Scenario 3: E-commerce Product Catalog (Multiple Vendors)

```typescript
// Recommendation: Unified Pool
// Reason:
// - Vendors typically don't have internal duplicates
// - Need to find same product across vendors
// - Moderate dataset size

.matchingScope('unified-pool')
```

#### Scenario 4: Post-Merger Integration

```typescript
// Recommendation: Within-Source-First
// Reason:
// - Both companies have their own duplicates
// - Clear priority (acquiring company > acquired company)
// - Performance matters for large customer bases

.matchingScope('within-source-first')
```

#### Scenario 5: Contact List Consolidation (CSV, Excel, Database)

```typescript
// Recommendation: Within-Source-First
// Reason:
// - CSVs and spreadsheets often have duplicates
// - Different data quality per source
// - Need to dedupe messy data sources independently

.matchingScope('within-source-first')
```

---

## Advanced Patterns

### Pattern 1: Hybrid Approach

Combine both strategies for optimal results:

```typescript
// Step 1: Use within-source-first for initial consolidation
const phase1 = await HaveWeMet.consolidation<Customer>()
  .source('crm' /* ... */)
  .source('billing' /* ... */)
  .matchingScope('within-source-first')
  .build()
  .consolidate()

// Step 2: Use unified pool on results for comprehensive matching
const phase2 = await HaveWeMet.resolve<Customer>()
  .records(phase1.goldenRecords)
  .matchingScope('unified') // Standard resolver uses unified by default
  .build()
  .resolve()
```

### Pattern 2: Source-Specific Thresholds

Use different thresholds for within-source vs cross-source:

```typescript
// Within-source: stricter (less tolerance for differences)
const withinSourceThresholds = { noMatch: 25, definiteMatch: 50 }

// Cross-source: looser (account for schema differences)
const crossSourceThresholds = { noMatch: 20, definiteMatch: 45 }

// Note: Current API doesn't support this directly
// Workaround: Run two separate consolidations
```

### Pattern 3: Incremental Source Addition

Add new sources without reprocessing existing ones:

```typescript
// Only works with within-source-first

// Initial consolidation
const initial = await HaveWeMet.consolidation<Customer>()
  .source('crm', /* ... */)
  .source('billing', /* ... */)
  .matchingScope('within-source-first')
  .build()
  .consolidate()

// Later: Add new source
const withNewSource = await HaveWeMet.consolidation<Customer>()
  .source('existing_unified', source => source
    .adapter(new PrismaAdapter(prisma.unifiedCustomer))
    .mapping(map => map
      .field('email').from('email')
      .field('firstName').from('firstName')
      .field('lastName').from('lastName')
    )
    .priority(3)
  )
  .source('new_support', source => source
    .adapter(supportAdapter)
    .mapping(map => /* ... */)
    .priority(2)
  )
  .matchingScope('within-source-first')
  .build()
  .consolidate()
```

### Pattern 4: Monitoring and Metrics

Track matching effectiveness by scope:

```typescript
const result = await consolidation.consolidate()

const metrics = {
  scope: 'within-source-first',

  // Phase 1 metrics
  withinSourceDuplicates:
    result.stats.sources['crm'].duplicatesWithinSource +
    result.stats.sources['billing'].duplicatesWithinSource +
    result.stats.sources['support'].duplicatesWithinSource,

  // Phase 2 metrics
  crossSourceMatches: result.stats.crossSourceMatches,

  // Overall efficiency
  totalRecords: result.stats.totalRecords,
  goldenRecords: result.stats.goldenRecords,
  deduplicationRate:
    (
      ((result.stats.totalRecords - result.stats.goldenRecords) /
        result.stats.totalRecords) *
      100
    ).toFixed(1) + '%',
}

console.log(metrics)
```

---

## Best Practices

### 1. Start with Within-Source-First

Default to within-source-first unless you have specific reasons to use unified pool:

```typescript
// Safe default
.matchingScope('within-source-first')
```

### 2. Test Both Strategies

Compare results to find best fit for your data:

```typescript
// Test within-source-first
const result1 = await config
  .matchingScope('within-source-first')
  .build()
  .consolidate()

// Test unified pool
const result2 = await config.matchingScope('unified-pool').build().consolidate()

// Compare
console.log('Within-Source-First:', result1.stats.goldenRecords, 'records')
console.log('Unified Pool:', result2.stats.goldenRecords, 'records')
console.log(
  'Difference:',
  Math.abs(result1.stats.goldenRecords - result2.stats.goldenRecords)
)
```

### 3. Use Blocking Strategies

Essential for both scopes to maintain performance:

```typescript
.blocking(block => block
  .standard('email')              // Exact email groups
  .sortedNeighborhood('lastName', 10)  // Sorted windows
)
```

### 4. Monitor Performance

Track execution time to ensure acceptable performance:

```typescript
const startTime = Date.now()
const result = await consolidation.consolidate()
const duration = Date.now() - startTime

console.log(`Execution time: ${duration}ms`)
console.log(
  `Records/second: ${(result.stats.totalRecords / (duration / 1000)).toFixed(0)}`
)
```

### 5. Document Strategy Choice

Explain why you chose a particular strategy:

```typescript
// Within-source-first chosen because:
// 1. Each product database has internal duplicates
// 2. Performance critical (millions of records)
// 3. Clear source priority hierarchy
// 4. Need incremental updates
.matchingScope('within-source-first')
```

### 6. Consider Hybrid Approaches

For complex scenarios, combine strategies:

```typescript
// Use within-source-first for bulk consolidation
// Then unified pool for final pass on uncertain matches
```

---

**Previous**: [Conflict Resolution](./conflict-resolution.md) | **Next**: [ETL Workflow](./etl-workflow.md)
