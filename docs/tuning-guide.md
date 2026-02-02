# Tuning Guide

This guide helps you tune weights and thresholds for your specific use case. Probabilistic matching is not "one size fits all" - the optimal configuration depends on your data characteristics, domain requirements, and tolerance for false positives vs false negatives.

## Table of Contents

- [Quick Start](#quick-start)
- [Understanding Your Data](#understanding-your-data)
- [Choosing Field Weights](#choosing-field-weights)
- [Setting Thresholds](#setting-thresholds)
- [Using Match Explanations](#using-match-explanations)
- [Iterative Tuning Process](#iterative-tuning-process)
- [Common Scenarios](#common-scenarios)
- [Troubleshooting](#troubleshooting)

## Quick Start

If you're just getting started, use these defaults and tune from there:

```typescript
const resolver = HaveWeMet.create<YourType>()
  .schema(schema => /* your schema */)
  .matching(match => match
    // Unique identifiers: 20-25
    .field('email').strategy('exact').weight(20)

    // Strong identifiers: 15-20
    .field('phone').strategy('exact').weight(15)

    // Names: 10-15 with threshold
    .field('firstName').strategy('jaro-winkler').weight(10).threshold(0.85)
    .field('lastName').strategy('jaro-winkler').weight(10).threshold(0.85)

    // Dates: 8-12
    .field('dateOfBirth').strategy('exact').weight(10)

    // Default thresholds (adjust based on max score)
    .thresholds({ noMatch: 20, definiteMatch: 45 })
  )
  .build()
```

## Understanding Your Data

Before tuning, understand your data characteristics:

### 1. Field Completeness

How often is each field populated?

```typescript
// Example: Calculate field completeness
const dataset = [
  /* your records */
]
const fieldCounts = {
  email: 0,
  phone: 0,
  firstName: 0,
  lastName: 0,
}

dataset.forEach((record) => {
  if (record.email) fieldCounts.email++
  if (record.phone) fieldCounts.phone++
  if (record.firstName) fieldCounts.firstName++
  if (record.lastName) fieldCounts.lastName++
})

// If email is only 60% complete, don't rely on it as your primary identifier
```

**Impact on weighting:**

- Fields with low completeness need lower weights
- Can't rely on a field that's often missing
- Consider using `threshold` to ensure missing fields don't contribute

### 2. Field Uniqueness

How discriminating is each field?

```typescript
// Example: Check uniqueness
const emailCounts = new Map()
dataset.forEach((record) => {
  const count = emailCounts.get(record.email) || 0
  emailCounts.set(record.email, count + 1)
})

const duplicateEmails = Array.from(emailCounts.entries()).filter(
  ([_, count]) => count > 1
)

console.log(`${duplicateEmails.length} emails are shared by multiple records`)
```

**Impact on weighting:**

- Highly unique fields (one value per person) → high weight
- Common values (many "John Smith"s) → lower weight
- Non-unique fields still help when combined

### 3. Data Quality

How clean is your data?

```typescript
// Check for quality issues
const issues = {
  typos: 0, // "Smoth" instead of "Smith"
  formatting: 0, // "+1-555-0100" vs "+15550100"
  abbreviations: 0, // "St" vs "Street"
  nulls: 0,
}

// Run checks and identify patterns
```

**Impact on configuration:**

- Clean data → can use higher thresholds
- Messy data → use fuzzy matching with lower thresholds
- Apply normalizers before matching

## Choosing Field Weights

Weights should reflect how useful a field is for distinguishing between entities.

### Weight Selection Framework

Ask these questions for each field:

1. **How unique is this field in my dataset?**
   - Unique (email, SSN): 20-25
   - Moderately unique (phone): 15-20
   - Common (first name): 10-15
   - Very common (city): 5-8

2. **How reliable is this field?**
   - Always accurate → higher weight
   - Prone to errors → lower weight
   - Frequently missing → lower weight

3. **How important is this field in my domain?**
   - Critical identifier → higher weight
   - Supporting evidence → lower weight

### Weight Guidelines by Field Type

#### Email Addresses

**Recommended weight: 20-25**

```typescript
.field('email').strategy('exact').weight(20)
```

Why:

- Highly unique (one email = one person in most cases)
- Standardized format
- Rarely changes within a dataset

Exceptions:

- Shared emails (family accounts): weight 15
- Work emails that change: weight 15
- Low-quality data with typos: weight 15

#### Phone Numbers

**Recommended weight: 15-20**

```typescript
.field('phone').strategy('exact').weight(15)
```

Why:

- Good uniqueness
- Can be shared (family landlines)
- Changes more often than email

Considerations:

- Mobile vs landline
- International formats
- Use normalizers to standardize format

#### Names (First/Last)

**Recommended weight: 10-15**

```typescript
.field('firstName').strategy('jaro-winkler').weight(10).threshold(0.85)
.field('lastName').strategy('jaro-winkler').weight(10).threshold(0.85)
```

Why:

- Not unique (many "John Smith"s)
- Prone to nicknames, typos
- Powerful when combined with other fields

Considerations:

- Always use threshold (0.85-0.90)
- Use jaro-winkler for typos
- Consider soundex as supporting evidence

#### Date of Birth

**Recommended weight: 8-12**

```typescript
.field('dateOfBirth').strategy('exact').weight(10)
```

Why:

- Moderately discriminating
- Relatively stable
- Standard format

Considerations:

- Typos in entry (day/month swapped)
- Year-only matches
- Consider fuzzy matching for dates with known issues

#### Address Fields

**Recommended weight: 8-12 for full address, 5-8 for city**

```typescript
.field('addressLine1').strategy('jaro-winkler').weight(10).threshold(0.85)
.field('city').strategy('jaro-winkler').weight(5)
```

Why:

- Full addresses are moderately unique
- Cities are common
- Prone to abbreviations and typos

Considerations:

- Use normalizers for standardization
- "St" vs "Street", "Ave" vs "Avenue"
- ZIP code can be more reliable than city name

#### Weak Signals

**Recommended weight: 5-8**

Examples: Gender, country, job title

```typescript
.field('country').strategy('exact').weight(5)
```

Why:

- Very common values
- Useful for ruling out non-matches
- Minimal individual discriminating power

## Setting Thresholds

Thresholds control the three-tier outcome classification.

### Calculate Your Max Score

```typescript
// Sum all weights
const maxScore = 20 + 15 + 10 + 10 + 10 // = 65 for example above
```

### Choose Based on Use Case

#### High Precision (Avoid False Positives)

**Use when:** False matches are costly (financial, legal, healthcare)

```typescript
.thresholds({
  noMatch: 25,        // 38% of max (65)
  definiteMatch: 55   // 85% of max
})
```

Effect:

- Most matches go to review
- Very few false positives in definite matches
- High confidence when auto-merging
- More manual work

#### High Recall (Avoid False Negatives)

**Use when:** Missing matches is costly (marketing, customer service)

```typescript
.thresholds({
  noMatch: 15,        // 23% of max (65)
  definiteMatch: 40   // 62% of max
})
```

Effect:

- Fewer matches sent to review
- More auto-merging
- Risk of false positives increases
- Less manual work

#### Balanced Approach

**Use when:** Both false positives and false negatives have moderate cost

```typescript
.thresholds({
  noMatch: 20,        // 31% of max (65)
  definiteMatch: 45   // 69% of max
})
```

Effect:

- Reasonable review queue
- Good balance of precision and recall
- Most common starting point

### Threshold Rules of Thumb

1. **noMatch threshold:**
   - Start at 15-25% of max possible score
   - Should filter obvious non-matches
   - Too high: miss potential matches
   - Too low: waste time reviewing obvious non-matches

2. **definiteMatch threshold:**
   - Start at 60-75% of max possible score
   - Should require strong evidence
   - Too high: too much manual review
   - Too low: false positives in auto-merges

3. **Gap between thresholds:**
   - Minimum 20-25 point gap
   - This is your "potential match" range
   - Too small: under-utilizes human review
   - Too large: overwhelms review queue

## Using Match Explanations

Match explanations are your most valuable tuning tool.

### Analyze False Positives

When you find records marked as "definite match" that shouldn't be:

```typescript
const results = resolver.resolve(newRecord, existingRecords)
const falsePositive = results.find(r =>
  r.outcome === 'definite-match' && /* you know it's wrong */
)

console.log(falsePositive.explanation)
```

Look for:

- Which fields contributed most to the score?
- Are certain fields over-weighted?
- Did low-similarity fields contribute when they shouldn't?

**Fix:** Reduce weights or increase field thresholds for problematic fields.

### Analyze False Negatives

When you find records marked as "no match" that should match:

```typescript
const results = resolver.resolve(newRecord, existingRecords)
const falseNegative = results.find(r =>
  r.outcome === 'no-match' && /* you know it should match */
)

console.log(falseNegative.explanation)
```

Look for:

- Are important fields not contributing due to thresholds?
- Are field weights too low?
- Is data quality causing similarity scores to be low?

**Fix:**

- Increase weights for discriminating fields
- Lower field thresholds (but risk false positives)
- Apply normalizers to improve data quality

### Analyze Potential Matches

Potential matches show you the edge cases:

```typescript
const potentialMatches = results.filter((r) => r.outcome === 'potential-match')

potentialMatches.forEach((match) => {
  console.log(match.explanation)
  // Manually verify: is this a match or not?
})
```

If most potential matches are:

- **True matches:** Increase definiteMatch threshold (too conservative)
- **Non-matches:** Decrease noMatch threshold (too aggressive)
- **Mixed:** Your thresholds are well-calibrated

## Iterative Tuning Process

### Step 1: Start with Defaults

Use the recommended starting weights and thresholds.

### Step 2: Run on Sample Data

```typescript
// Use a sample where you know the ground truth
const testRecords = [
  /* known matches and non-matches */
]

const results = resolver.deduplicateBatch(testRecords)
```

### Step 3: Calculate Metrics

```typescript
let truePositives = 0
let falsePositives = 0
let trueNegatives = 0
let falseNegatives = 0

results.results.forEach(result => {
  result.matches.forEach(match => {
    const isActualMatch = /* check your ground truth */
    const isPredictedMatch = match.outcome === 'definite-match'

    if (isActualMatch && isPredictedMatch) truePositives++
    if (!isActualMatch && isPredictedMatch) falsePositives++
    if (!isActualMatch && !isPredictedMatch) trueNegatives++
    if (isActualMatch && !isPredictedMatch) falseNegatives++
  })
})

const precision = truePositives / (truePositives + falsePositives)
const recall = truePositives / (truePositives + falseNegatives)
const f1Score = 2 * (precision * recall) / (precision + recall)

console.log({ precision, recall, f1Score })
```

### Step 4: Analyze Errors

Review explanations for false positives and false negatives.

### Step 5: Adjust Configuration

Based on your findings:

- Adjust field weights
- Adjust field thresholds
- Adjust outcome thresholds
- Add or remove fields

### Step 6: Repeat

Run again on your test set and measure improvement.

### Step 7: Validate on New Data

Test on a different sample to ensure you haven't overfit.

## Common Scenarios

### Scenario 1: Customer Deduplication (E-commerce)

**Characteristics:**

- Email is very reliable
- Names prone to typos
- Phone and address change frequently
- Need high precision (avoid merging different customers)

**Configuration:**

```typescript
.matching(match => match
  .field('email').strategy('exact').weight(25)
  .field('phone').strategy('exact').weight(10)  // Lower: changes often
  .field('firstName').strategy('jaro-winkler').weight(8).threshold(0.90)
  .field('lastName').strategy('jaro-winkler').weight(8).threshold(0.90)
  .field('billingZip').strategy('exact').weight(7)
  .thresholds({ noMatch: 20, definiteMatch: 50 })
)
```

**Rationale:**

- High email weight (most reliable)
- High thresholds (avoid false merges)
- ZIP code helps but addresses change

### Scenario 2: Patient Matching (Healthcare)

**Characteristics:**

- Multiple identifiers (MRN, SSN)
- Critical accuracy (HIPAA compliance)
- Names, DOB very important
- Need very high precision

**Configuration:**

```typescript
.matching(match => match
  .field('mrn').strategy('exact').weight(30)  // Medical record number
  .field('ssn').strategy('exact').weight(30)  // Social security
  .field('lastName').strategy('jaro-winkler').weight(12).threshold(0.92)
  .field('firstName').strategy('jaro-winkler').weight(12).threshold(0.92)
  .field('dateOfBirth').strategy('exact').weight(15)
  .field('gender').strategy('exact').weight(5)
  .thresholds({ noMatch: 30, definiteMatch: 70 })
)
```

**Rationale:**

- Very high weights for identifiers
- Very high thresholds (safety-critical)
- High name thresholds
- Gender helps rule out false positives

### Scenario 3: Marketing Lead Deduplication

**Characteristics:**

- Email most reliable
- Names inconsistent (company contacts)
- Want high recall (don't want to spam same person twice)
- False positives less critical

**Configuration:**

```typescript
.matching(match => match
  .field('email').strategy('exact').weight(25)
  .field('phone').strategy('exact').weight(12)
  .field('firstName').strategy('jaro-winkler').weight(8).threshold(0.80)
  .field('lastName').strategy('jaro-winkler').weight(8).threshold(0.80)
  .field('company').strategy('jaro-winkler').weight(10).threshold(0.85)
  .thresholds({ noMatch: 15, definiteMatch: 40 })
)
```

**Rationale:**

- Lower thresholds (favor recall)
- Company name helps (same person likely at same company)
- Lower name thresholds (nicknames, informal names)

### Scenario 4: Contact List Merging

**Characteristics:**

- Merging multiple sources with different quality
- No single reliable identifier
- Need to rely on combinations
- Moderate precision needs

**Configuration:**

```typescript
.matching(match => match
  .field('email').strategy('exact').weight(18)
  .field('phone').strategy('exact').weight(15)
  .field('firstName').strategy('jaro-winkler').weight(12).threshold(0.85)
  .field('lastName').strategy('jaro-winkler').weight(12).threshold(0.85)
  .field('company').strategy('jaro-winkler').weight(10).threshold(0.80)
  .field('city').strategy('jaro-winkler').weight(5)
  .thresholds({ noMatch: 20, definiteMatch: 45 })
)
```

**Rationale:**

- Balanced weights across multiple fields
- No single field dominates
- City provides weak supporting evidence
- Standard thresholds

## Troubleshooting

### Problem: Too Many False Positives

**Symptoms:** Records being merged that shouldn't be

**Causes & Fixes:**

1. **Weights too high for unreliable fields**
   - Review field quality
   - Reduce weights for fields with errors

2. **definiteMatch threshold too low**
   - Increase to require more evidence
   - Move more matches to review

3. **Missing field thresholds**
   - Add thresholds to fuzzy fields
   - Prevent weak similarities from contributing

4. **Data quality issues**
   - Apply normalizers
   - Clean data before matching

### Problem: Too Many False Negatives

**Symptoms:** Missing matches that should be found

**Causes & Fixes:**

1. **Field thresholds too high**
   - Lower thresholds on fuzzy fields
   - Allow more variation

2. **Weights too low**
   - Increase weights for important fields
   - Ensure key fields contribute meaningfully

3. **noMatch threshold too high**
   - Lower threshold to catch more candidates
   - More will go to review, but fewer missed

4. **Wrong comparison strategy**
   - Use jaro-winkler for names (not exact)
   - Use fuzzy matching for addresses
   - Consider phonetic matching

### Problem: Too Many Potential Matches

**Symptoms:** Review queue is overwhelming

**Causes & Fixes:**

1. **Threshold gap too large**
   - Narrow the gap between noMatch and definiteMatch
   - More auto-classification, less review

2. **Insufficient field discriminating power**
   - Add more fields to configuration
   - Increase weights on unique fields

3. **Poor data quality**
   - Apply normalizers
   - Clean data improves confidence

### Problem: Too Few Potential Matches

**Symptoms:** Most records auto-classified, but errors occur

**Causes & Fixes:**

1. **Threshold gap too small**
   - Widen gap to create review zone
   - Capture edge cases for verification

2. **Over-confident configuration**
   - Review false positive rate
   - Consider being more conservative

## Next Steps

- **Examples:** See [Examples](examples.md) for complete configurations
- **Probabilistic Matching:** See [Probabilistic Matching](probabilistic-matching.md) for conceptual background
- **Blocking:** See [Blocking Strategies](blocking/overview.md) to improve performance
- **Normalizers:** See [Normalizers](normalizers/overview.md) to improve data quality before matching
