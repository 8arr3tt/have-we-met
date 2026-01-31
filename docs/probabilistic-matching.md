# Probabilistic Matching

Probabilistic matching is a weighted scoring approach that combines evidence from multiple field comparisons to produce an overall confidence score. Unlike deterministic matching (exact rules), probabilistic matching handles uncertainty and partial matches by accumulating weighted scores across fields.

## Table of Contents

- [Overview](#overview)
- [How Scoring Works](#how-scoring-works)
- [Three-Tier Outcomes](#three-tier-outcomes)
- [Field Comparisons](#field-comparisons)
- [Match Explanations](#match-explanations)
- [Common Patterns](#common-patterns)
- [Anti-Patterns](#anti-patterns)

## Overview

### The Challenge

Matching records in the real world is rarely exact. Consider these two person records:

```typescript
const record1 = {
  firstName: 'John',
  lastName: 'Smith',
  email: 'john.doe@example.com',
  phone: '+1-555-0100',
  dateOfBirth: '1985-03-15'
}

const record2 = {
  firstName: 'Jon',
  lastName: 'Smyth',
  email: 'john.doe@example.com',
  phone: '+1-555-0200',
  dateOfBirth: '1985-03-20'
}
```

Are these the same person? There are signs pointing both ways:
- ✅ Email matches exactly
- ⚠️ Name is similar but not exact
- ❌ Phone is different
- ❌ Date of birth is close but different

A deterministic rule like "match if email matches" would say yes, but that ignores the conflicting signals. A rule like "match if all fields match" would say no, missing this likely match.

### The Solution

Probabilistic matching accumulates evidence across all fields, weighing each piece of evidence by its importance:

```
Email match (exact):        +20 points  (high weight - emails are unique)
First name (92% similar):   +9.2 points (10 × 0.92)
Last name (88% similar):    +8.8 points (10 × 0.88)
Phone (different):          +0 points
Date of birth (different):  +0 points
──────────────────────────
Total:                      38 points out of 65 possible
```

With thresholds configured as:
- No Match: < 20 points
- Definite Match: ≥ 45 points
- Potential Match: 20-44 points

This would be classified as a **Potential Match** - enough evidence to warrant human review, but not enough for automatic merging.

## How Scoring Works

### Field Weights

Each field is assigned a weight representing its discriminating power - how useful it is for distinguishing between records.

**Recommended starting weights:**

| Field Type | Weight Range | Examples |
|------------|--------------|----------|
| Unique identifiers | 20-25 | Email, SSN, government ID |
| Strong identifiers | 15-20 | Phone number |
| Names | 10-15 | First name, last name |
| Dates | 8-12 | Date of birth |
| Addresses | 8-12 | Street address, ZIP code |
| Weaker signals | 5-8 | City, gender |

### Similarity Scores

For each field, a comparator returns a similarity score from 0 (completely different) to 1 (identical):

- **Exact match**: 1.0
- **Jaro-Winkler** (for names): 0-1 based on character similarity
- **Levenshtein**: 0-1 based on edit distance
- **Soundex/Metaphone**: 1 if codes match, 0 otherwise

### Score Contribution

A field's contribution to the total score is:

```
contribution = similarity × weight (if similarity ≥ threshold)
contribution = 0 (if similarity < threshold)
```

The threshold parameter (optional) ensures only high-quality matches contribute. For example, with a threshold of 0.85:

- Similarity 0.90 → contributes `0.90 × weight`
- Similarity 0.82 → contributes 0 (below threshold)

### Total Score

```
totalScore = sum of all field contributions
maxPossibleScore = sum of all weights
normalizedScore = totalScore / maxPossibleScore (0-1 scale)
```

## Three-Tier Outcomes

Probabilistic matching classifies results into three categories based on configurable thresholds:

### 1. No Match (Below noMatch Threshold)

**Meaning:** Not enough evidence to suggest these records are the same entity.

**Action:** Treat as separate records.

**Example:** Total score: 15 points (noMatch threshold: 20)

```
Email: different
Name: slightly similar (below threshold)
Phone: different
Result: Insufficient evidence for match
```

### 2. Potential Match (Between Thresholds)

**Meaning:** Mixed signals that warrant human review.

**Action:** Flag for manual verification. These are candidates that might be matches but need expert judgment.

**Example:** Total score: 38 points (noMatch: 20, definiteMatch: 45)

```
Email: exact match (+20)
Name: high similarity (+18)
Phone: different (0)
Result: Strong evidence but not definitive
```

### 3. Definite Match (Above definiteMatch Threshold)

**Meaning:** Strong evidence that these records represent the same entity.

**Action:** Can be automatically merged or linked.

**Example:** Total score: 63 points (definiteMatch threshold: 45)

```
Email: exact match (+20)
Name: exact match (+20)
Phone: exact match (+15)
Date of birth: different (0)
Address: high similarity (+8)
Result: Overwhelming evidence of match
```

### Setting Thresholds

**Conservative approach (high precision, fewer false positives):**
```typescript
.thresholds({ noMatch: 25, definiteMatch: 55 })
```
- More records require manual review
- Fewer automatic merges
- Lower risk of incorrect matches

**Aggressive approach (high recall, fewer false negatives):**
```typescript
.thresholds({ noMatch: 15, definiteMatch: 40 })
```
- Fewer records for manual review
- More automatic merges
- Higher risk of incorrect matches

**Balanced approach:**
```typescript
.thresholds({ noMatch: 20, definiteMatch: 45 })
```
- Reasonable manual review workload
- Good balance of automation and accuracy

**Rule of thumb:**
- `noMatch`: 15-25% of max possible score
- `definiteMatch`: 60-75% of max possible score

## Field Comparisons

### Exact Comparisons

Best for fields with standard formats:

```typescript
.field('email')
  .strategy('exact')
  .weight(20)
```

Use for: Email, ID numbers, standardized codes

### Fuzzy Comparisons

Best for fields with natural variation:

```typescript
.field('firstName')
  .strategy('jaro-winkler')
  .weight(10)
  .threshold(0.85)  // Only contribute if ≥ 85% similar
```

**Algorithm selection:**
- **Jaro-Winkler**: Names (favors prefix matches)
- **Levenshtein**: Any text (measures edit distance)
- **Soundex/Metaphone**: Phonetic matching (e.g., "Smith" vs "Smyth")

### Field Thresholds

The optional `threshold` parameter filters out low-quality matches:

```typescript
.field('lastName')
  .strategy('jaro-winkler')
  .weight(10)
  .threshold(0.85)
```

With this configuration:
- "Smith" vs "Smith" → similarity 1.00 → contributes 10 points ✓
- "Smith" vs "Smyth" → similarity 0.88 → contributes 8.8 points ✓
- "Smith" vs "Jones" → similarity 0.42 → contributes 0 points ✗

Use thresholds to prevent weak signals from polluting your scores.

## Match Explanations

Every match result includes a detailed explanation showing how the score was calculated:

```
Match Outcome: Potential Match (Score: 38.0/65)

Field Comparisons:
✓ email: exact match (1.00 × 20 = 20.0)
  Record A: "john.doe@example.com"
  Record B: "john.doe@example.com"

✓ firstName: high similarity (0.92 × 10 = 9.2)
  Record A: "John"
  Record B: "Jon"
  Strategy: jaro-winkler

✓ lastName: high similarity (0.88 × 10 = 8.8)
  Record A: "Smith"
  Record B: "Smyth"
  Strategy: jaro-winkler

✗ phone: no match (0.00 × 15 = 0.0)
  Record A: "+1-555-0100"
  Record B: "+1-555-0200"

✗ dateOfBirth: no match (0.00 × 10 = 0.0)
  Record A: "1985-03-15"
  Record B: "1985-03-20"
```

Use explanations to:
- Understand why matches were classified the way they were
- Identify patterns in false positives and false negatives
- Guide weight and threshold tuning
- Provide audit trails for compliance

## Common Patterns

### Pattern 1: Unique Identifier with Weak Signals

When you have one strong identifier (like email) supported by weaker signals:

```typescript
.matching(match => match
  .field('email').strategy('exact').weight(25)           // Strong
  .field('firstName').strategy('jaro-winkler').weight(8) // Weak support
  .field('lastName').strategy('jaro-winkler').weight(8)  // Weak support
  .thresholds({ noMatch: 15, definiteMatch: 30 })
)
```

Email match alone can create a definite match. Name similarity provides supporting evidence.

### Pattern 2: Multiple Moderate Signals

When no single field is definitive, but the combination is:

```typescript
.matching(match => match
  .field('firstName').strategy('jaro-winkler').weight(12).threshold(0.85)
  .field('lastName').strategy('jaro-winkler').weight(12).threshold(0.85)
  .field('dateOfBirth').strategy('exact').weight(12)
  .field('zipCode').strategy('exact').weight(10)
  .thresholds({ noMatch: 20, definiteMatch: 35 })
)
```

Requires at least 3 fields to align for a definite match.

### Pattern 3: Layered Confidence

Use field thresholds to create confidence tiers:

```typescript
.matching(match => match
  .field('email').strategy('exact').weight(20)
  .field('phone').strategy('exact').weight(15)
  .field('firstName').strategy('jaro-winkler').weight(10).threshold(0.90)  // High confidence only
  .field('lastName').strategy('jaro-winkler').weight(10).threshold(0.90)
  .field('city').strategy('jaro-winkler').weight(5)  // No threshold - even weak matches help
  .thresholds({ noMatch: 20, definiteMatch: 45 })
)
```

Names must be highly similar to contribute. City can contribute even with low similarity.

## Anti-Patterns

### ❌ Anti-Pattern 1: Ignoring Field Thresholds

```typescript
// DON'T: Allow weak similarities to contribute
.field('lastName').strategy('jaro-winkler').weight(15)
```

Problem: "Smith" vs "Jones" (similarity 0.42) contributes 6.3 points of false confidence.

**✅ Better:**
```typescript
.field('lastName').strategy('jaro-winkler').weight(15).threshold(0.85)
```

### ❌ Anti-Pattern 2: Over-Relying on Phonetic Algorithms

```typescript
// DON'T: Give phonetic matches high weights
.field('lastName').strategy('soundex').weight(20)
```

Problem: Soundex has many collisions. "Smith", "Sneed", "Schmitt", and "Snead" all produce the same code (S530).

**✅ Better:**
```typescript
.field('lastName').strategy('jaro-winkler').weight(15).threshold(0.85)
.field('lastName_phonetic').strategy('soundex').weight(5)  // Supporting evidence only
```

### ❌ Anti-Pattern 3: Insufficient Threshold Gap

```typescript
// DON'T: Thresholds too close together
.thresholds({ noMatch: 40, definiteMatch: 45 })
```

Problem: Only a 5-point range for "potential matches" - almost everything gets auto-classified.

**✅ Better:**
```typescript
.thresholds({ noMatch: 20, definiteMatch: 45 })  // 25-point range for review
```

### ❌ Anti-Pattern 4: Equal Weights for Unequal Fields

```typescript
// DON'T: Treat all fields equally
.field('email').strategy('exact').weight(10)
.field('city').strategy('exact').weight(10)
.field('firstName').strategy('jaro-winkler').weight(10)
```

Problem: Email is far more discriminating than city. "John" in "New York" is not unique.

**✅ Better:**
```typescript
.field('email').strategy('exact').weight(25)
.field('firstName').strategy('jaro-winkler').weight(10)
.field('city').strategy('exact').weight(5)
```

### ❌ Anti-Pattern 5: No Field Thresholds with Fuzzy Matching

```typescript
// DON'T: Accept any level of similarity
.field('firstName').strategy('jaro-winkler').weight(15)
.field('lastName').strategy('jaro-winkler').weight(15)
```

Problem: "Alice" vs "Alicia" (0.89) is good, but "Alice" vs "Bob" (0.0) should contribute nothing.

**✅ Better:**
```typescript
.field('firstName').strategy('jaro-winkler').weight(15).threshold(0.85)
.field('lastName').strategy('jaro-winkler').weight(15).threshold(0.85)
```

## Next Steps

- **Tuning:** See [Tuning Guide](tuning-guide.md) for detailed guidance on adjusting weights and thresholds
- **Examples:** See [Examples](examples.md) for real-world use cases
- **Blocking:** See [Blocking Strategies](blocking/overview.md) to scale to large datasets
- **Normalizers:** See [Normalizers](normalizers/overview.md) to improve match quality
