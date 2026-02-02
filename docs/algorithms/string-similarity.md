# String Similarity Algorithms

This guide covers the string similarity algorithms available in have-we-met for identity resolution. These algorithms enable fuzzy matching of text fields like names and addresses, where exact matching is too strict but similarity comparison is needed.

## Table of Contents

- [Overview](#overview)
- [Algorithm Comparison](#algorithm-comparison)
- [Detailed Algorithm Guides](#detailed-algorithm-guides)
  - [Levenshtein Distance](#levenshtein-distance)
  - [Jaro-Winkler Similarity](#jaro-winkler-similarity)
  - [Soundex Encoding](#soundex-encoding)
  - [Metaphone Encoding](#metaphone-encoding)
- [Selection Guide](#selection-guide)
- [Tuning Recommendations](#tuning-recommendations)
- [Common Pitfalls](#common-pitfalls)

## Overview

### Why String Similarity?

In identity resolution, records rarely match exactly. Names may have typos, addresses may be formatted differently, and data entry errors are common. String similarity algorithms enable matching despite these variations.

**When to use fuzzy matching:**

- Name matching (typos, nicknames, cultural variations)
- Address matching (formatting differences, abbreviations)
- Email or username matching with typos
- Any text field where human data entry introduces variation

**When to use exact matching:**

- Unique identifiers (IDs, account numbers)
- Standardized codes (country codes, zip codes)
- Boolean or numeric fields
- Fields where precision is critical

### How Similarity Scores Work

All algorithms return a normalized score between 0 and 1:

- **1.0**: Perfect match (identical strings)
- **0.9-0.99**: Very similar (likely the same entity)
- **0.7-0.89**: Moderately similar (review recommended)
- **0.0-0.69**: Different (likely different entities)

These scores are weighted and combined with other field comparisons to produce an overall match score that determines if records represent the same entity.

## Algorithm Comparison

| Algorithm        | Best Use Case                    | Performance | Handles Typos | Handles Transpositions | Phonetic Matching |
| ---------------- | -------------------------------- | ----------- | ------------- | ---------------------- | ----------------- |
| **Levenshtein**  | General text, addresses          | ~0.0004ms   | ✅ Excellent  | ❌ No                  | ❌ No             |
| **Jaro-Winkler** | Names, short strings             | ~0.0002ms   | ✅ Good       | ✅ Yes                 | ❌ No             |
| **Soundex**      | Name blocking, phonetic grouping | ~0.0002ms   | ❌ No         | ❌ No                  | ✅ Yes            |
| **Metaphone**    | Improved phonetic matching       | ~0.0003ms   | ❌ No         | ❌ No                  | ✅ Yes (better)   |

### Strengths and Weaknesses

**Levenshtein Distance**

- ✅ Versatile: Works well for any text
- ✅ Intuitive: Counts character edits needed
- ✅ Handles insertions, deletions, substitutions
- ❌ Slower on very long strings
- ❌ Doesn't reward common prefixes
- ❌ Transpositions count as 2 edits

**Jaro-Winkler Similarity**

- ✅ Optimized for names
- ✅ Rewards common prefixes
- ✅ Handles transpositions efficiently
- ✅ Fastest algorithm for short strings
- ❌ Less intuitive scoring
- ❌ May overweight prefix matches

**Soundex**

- ✅ Groups similar-sounding names
- ✅ Extremely fast encoding
- ✅ Good for blocking strategies
- ✅ Simple, well-understood algorithm
- ❌ English-only phonetics
- ❌ Binary output (1 or 0)
- ❌ Less accurate than Metaphone
- ❌ Many false positives

**Metaphone**

- ✅ More accurate phonetic matching
- ✅ Handles complex pronunciation rules
- ✅ Better than Soundex for most cases
- ✅ Still very fast
- ❌ English-only phonetics
- ❌ Binary output (1 or 0)
- ❌ More complex algorithm

## Detailed Algorithm Guides

### Levenshtein Distance

**How it works:** Calculates the minimum number of single-character edits (insertions, deletions, substitutions) needed to transform one string into another. The edit distance is normalized by the maximum string length to produce a 0-1 similarity score.

**When to use:**

- General-purpose text matching
- Address matching with formatting variations
- Any field where typos are common
- When you need intuitive, explainable scores

**Configuration options:**

```typescript
interface LevenshteinOptions {
  caseSensitive?: boolean // Default: false
  normalizeWhitespace?: boolean // Default: true
  nullMatchesNull?: boolean // Default: true
}
```

**Code examples:**

```typescript
import { HaveWeMet } from 'have-we-met'

// Basic name matching with Levenshtein
const resolver = HaveWeMet.create<Person>()
  .schema((s) => s.field('firstName', { type: 'name' }))
  .matching((m) =>
    m.field('firstName').strategy('levenshtein').weight(15).threshold(0.85)
  )
  .thresholds({ noMatch: 20, definiteMatch: 45 })
  .build()

// Address matching with custom options
const resolver = HaveWeMet.create<Address>()
  .schema((s) => s.field('street', { type: 'address' }))
  .matching((m) =>
    m
      .field('street')
      .strategy('levenshtein')
      .levenshteinOptions({ normalizeWhitespace: true, caseSensitive: false })
      .weight(20)
      .threshold(0.8)
  )
  .thresholds({ noMatch: 20, definiteMatch: 50 })
  .build()
```

**Direct function usage:**

```typescript
import { levenshtein } from 'have-we-met'

levenshtein('hello', 'hello') // 1.0 (identical)
levenshtein('hello', 'hallo') // 0.8 (one character different)
levenshtein('cat', 'category') // ~0.375 (different lengths)
levenshtein('Hello', 'hello') // 1.0 (case-insensitive by default)
levenshtein('Hello', 'hello', { caseSensitive: true }) // 0.8
```

**Common pitfalls:**

- Don't use on very long text (>1000 chars) without testing performance
- Remember transpositions count as 2 edits (use Jaro-Winkler if transpositions are common)
- Whitespace normalization is enabled by default (disable if whitespace is significant)

**Performance:** ~0.0004ms for short strings, ~0.1ms for 100-character strings. Suitable for real-time matching.

---

### Jaro-Winkler Similarity

**How it works:** Considers matching characters within a search window and counts transpositions. Applies a bonus for common prefixes (up to 4 characters). Optimized for short strings where prefix similarity indicates a match.

**When to use:**

- Name matching (first names, last names)
- Short text fields (< 50 characters)
- When typos often appear at the end of strings
- When prefix matching is more important than suffix matching

**Configuration options:**

```typescript
interface JaroWinklerOptions {
  caseSensitive?: boolean // Default: false
  prefixScale?: number // Default: 0.1 (range: 0-0.25)
  maxPrefixLength?: number // Default: 4
  nullMatchesNull?: boolean // Default: true
}
```

**Code examples:**

```typescript
import { HaveWeMet } from 'have-we-met'

// Name matching with Jaro-Winkler (recommended)
const resolver = HaveWeMet.create<Person>()
  .schema((s) =>
    s
      .field('firstName', { type: 'name', component: 'first' })
      .field('lastName', { type: 'name', component: 'last' })
  )
  .matching((m) =>
    m
      .field('firstName')
      .strategy('jaro-winkler')
      .weight(10)
      .threshold(0.9)
      .field('lastName')
      .strategy('jaro-winkler')
      .weight(15)
      .threshold(0.92)
  )
  .thresholds({ noMatch: 20, definiteMatch: 45 })
  .build()

// Adjust prefix scale for more/less prefix emphasis
const resolver = HaveWeMet.create<Person>()
  .schema((s) => s.field('firstName', { type: 'name' }))
  .matching((m) =>
    m
      .field('firstName')
      .strategy('jaro-winkler')
      .jaroWinklerOptions({ prefixScale: 0.15 }) // More prefix emphasis
      .weight(15)
      .threshold(0.88)
  )
  .thresholds({ noMatch: 20, definiteMatch: 45 })
  .build()
```

**Direct function usage:**

```typescript
import { jaroWinkler } from 'have-we-met'

jaroWinkler('MARTHA', 'MARTHA') // 1.0 (identical)
jaroWinkler('MARTHA', 'MARHTA') // ~0.96 (transposition handled well)
jaroWinkler('DIXON', 'DICKSONX') // ~0.81 (benefits from prefix bonus)
jaroWinkler('martha', 'MARTHA') // 1.0 (case-insensitive by default)
```

**Common pitfalls:**

- Don't use for long text (optimized for < 50 characters)
- Prefix scale > 0.25 can produce counterintuitive results
- May over-match when prefixes are common in your dataset (e.g., "John" matches "Johnny" highly)

**Performance:** ~0.0002ms per comparison. Fastest algorithm for short strings.

---

### Soundex Encoding

**How it works:** Encodes names into 4-character phonetic codes based on how they sound in English. Names that sound similar get the same code. Returns 1 if codes match, 0 if they differ (binary output).

**When to use:**

- Blocking strategy for name matching (group candidates by Soundex code)
- Supplementary evidence in multi-field matching
- When you need very fast phonetic grouping
- Legacy systems that use Soundex

**Configuration options:**

```typescript
interface SoundexOptions {
  nullMatchesNull?: boolean // Default: true
}
```

**Code examples:**

```typescript
import { HaveWeMet } from 'have-we-met'

// Using Soundex as supporting evidence
const resolver = HaveWeMet.create<Person>()
  .schema((s) =>
    s
      .field('firstName', { type: 'name', component: 'first' })
      .field('lastName', { type: 'name', component: 'last' })
  )
  .matching(
    (m) =>
      m
        .field('firstName')
        .strategy('jaro-winkler') // Primary strategy
        .weight(10)
        .threshold(0.88)
        .field('lastName')
        .strategy('soundex') // Phonetic support
        .weight(5) // Lower weight
  )
  .thresholds({ noMatch: 20, definiteMatch: 45 })
  .build()

// Using Soundex for blocking (pre-group candidates)
const resolver = HaveWeMet.create<Person>()
  .schema((s) => s.field('lastName', { type: 'name', component: 'last' }))
  .blocking((b) => b.soundex('lastName'))
  .matching((m) => m.field('lastName').strategy('jaro-winkler').weight(15))
  .thresholds({ noMatch: 20, definiteMatch: 45 })
  .build()
```

**Direct function usage:**

```typescript
import { soundex, soundexEncode } from 'have-we-met'

// Comparison function (returns 1 or 0)
soundex('Robert', 'Rupert') // 1 (both encode to R163)
soundex('Smith', 'Smyth') // 1 (both encode to S530)
soundex('Smith', 'Jones') // 0 (S530 vs J520)
soundex('Lee', 'Li') // 1 (both encode to L000)

// Encoding function (for blocking)
soundexEncode('Robert') // 'R163'
soundexEncode('Rupert') // 'R163'
soundexEncode('Smith') // 'S530'
soundexEncode('Smyth') // 'S530'
```

**Common pitfalls:**

- Binary output (1 or 0) means it can't distinguish between "very similar" and "somewhat similar"
- Many false positives (unrelated names may have same code)
- English-only: doesn't work for non-English names
- Should not be the only matching strategy (use as supporting evidence)
- Better suited for blocking than scoring

**Performance:** ~0.0002ms per encoding. Extremely fast, suitable for high-volume blocking.

---

### Metaphone Encoding

**How it works:** Improved phonetic algorithm that handles more English pronunciation rules than Soundex. Produces variable-length codes that better represent how words sound. Returns 1 if codes match, 0 if they differ (binary output).

**When to use:**

- Phonetic name matching with better accuracy than Soundex
- Blocking strategy when Soundex produces too many false positives
- Matching names with silent letters or complex pronunciation
- When you need phonetic matching but don't want Soundex's limitations

**Configuration options:**

```typescript
interface MetaphoneOptions {
  maxLength?: number // Default: 4
  nullMatchesNull?: boolean // Default: true
}
```

**Code examples:**

```typescript
import { HaveWeMet } from 'have-we-met'

// Using Metaphone for phonetic matching
const resolver = HaveWeMet.create<Person>()
  .schema((s) =>
    s
      .field('firstName', { type: 'name', component: 'first' })
      .field('lastName', { type: 'name', component: 'last' })
  )
  .matching(
    (m) =>
      m
        .field('firstName')
        .strategy('jaro-winkler') // Primary strategy
        .weight(10)
        .threshold(0.88)
        .field('lastName')
        .strategy('metaphone') // Better phonetic matching
        .weight(6) // Supporting evidence
  )
  .thresholds({ noMatch: 20, definiteMatch: 45 })
  .build()

// Longer codes for more precision
const resolver = HaveWeMet.create<Person>()
  .schema((s) => s.field('lastName', { type: 'name', component: 'last' }))
  .matching((m) =>
    m
      .field('lastName')
      .strategy('metaphone')
      .metaphoneOptions({ maxLength: 6 }) // Longer code = more precise
      .weight(8)
  )
  .thresholds({ noMatch: 20, definiteMatch: 45 })
  .build()
```

**Direct function usage:**

```typescript
import { metaphone, metaphoneEncode } from 'have-we-met'

// Comparison function (returns 1 or 0)
metaphone('Christine', 'Kristine') // 1 (similar phonetic encoding)
metaphone('Stephen', 'Steven') // 1 (similar sound)
metaphone('Knight', 'Night') // 1 (both encode to NXT)
metaphone('Smith', 'Jones') // 0 (different phonetic codes)

// Encoding function (for blocking)
metaphoneEncode('Christine') // 'XRSTN' (default maxLength: 4 -> 'XRST')
metaphoneEncode('Kristine') // 'KRSTN' (default maxLength: 4 -> 'KRST')
metaphoneEncode('Knight') // 'NXT'
metaphoneEncode('Night') // 'NXT'
```

**Common pitfalls:**

- Binary output (1 or 0) like Soundex
- English-only algorithm (doesn't work for non-English names)
- Longer maxLength = more precision but fewer matches
- Shorter maxLength = more matches but more false positives
- Should not be the only matching strategy (use as supporting evidence)

**Performance:** ~0.0003ms per encoding. Very fast, suitable for high-volume matching.

---

## Selection Guide

### Decision Tree

```
START: What are you matching?

├─ Names (first/last)
│  ├─ Primary matching → Jaro-Winkler (weight: 10-15, threshold: 0.88-0.92)
│  └─ Supporting evidence → Metaphone or Soundex (weight: 5-8)
│
├─ Addresses
│  ├─ Full address → Levenshtein (weight: 15-20, threshold: 0.8-0.85)
│  └─ Street name only → Jaro-Winkler (weight: 10-15, threshold: 0.85)
│
├─ General text (< 100 chars)
│  └─ Levenshtein (weight: 10-15, threshold: 0.85)
│
├─ Blocking strategy (pre-grouping)
│  ├─ Fast, good enough → Soundex
│  └─ More accurate → Metaphone
│
└─ Email/username
   └─ Levenshtein (weight: 10-15, threshold: 0.9)
```

### Strategy Combinations

**Recommended: Primary + Phonetic**
Use a primary strategy (Levenshtein or Jaro-Winkler) with higher weight and threshold, plus a phonetic strategy (Soundex or Metaphone) with lower weight as supporting evidence.

```typescript
.matching((m) => m
  .field('firstName')
    .strategy('jaro-winkler')
    .weight(10)
    .threshold(0.88)
  .field('lastName')
    .strategy('jaro-winkler')
    .weight(15)
    .threshold(0.92)
  .field('lastName')  // Same field, different strategy
    .strategy('metaphone')
    .weight(5)  // Lower weight = supporting evidence
)
```

**Conservative: High Thresholds**
When false positives are expensive (e.g., merging customer accounts):

```typescript
.matching((m) => m
  .field('email')
    .strategy('levenshtein')
    .weight(25)
    .threshold(0.95)  // Very strict
  .field('firstName')
    .strategy('jaro-winkler')
    .weight(10)
    .threshold(0.92)
  .field('lastName')
    .strategy('jaro-winkler')
    .weight(15)
    .threshold(0.95)  // Very strict
)
.thresholds({ noMatch: 30, definiteMatch: 60 })
```

**Aggressive: Lower Thresholds**
When false negatives are expensive (e.g., finding potential duplicates for manual review):

```typescript
.matching((m) => m
  .field('firstName')
    .strategy('jaro-winkler')
    .weight(10)
    .threshold(0.8)   // More lenient
  .field('lastName')
    .strategy('jaro-winkler')
    .weight(15)
    .threshold(0.85)  // More lenient
  .field('lastName')
    .strategy('soundex')
    .weight(5)
)
.thresholds({ noMatch: 15, definiteMatch: 50 })
```

## Tuning Recommendations

### Setting Thresholds

Field-level thresholds filter out low-similarity matches before they contribute to the overall score. General recommendations:

| Algorithm    | Conservative                  | Balanced  | Aggressive |
| ------------ | ----------------------------- | --------- | ---------- |
| Levenshtein  | 0.9+                          | 0.85      | 0.8        |
| Jaro-Winkler | 0.95+                         | 0.88-0.92 | 0.8-0.85   |
| Soundex      | 1.0 (only exact code matches) | 1.0       | 1.0        |
| Metaphone    | 1.0 (only exact code matches) | 1.0       | 1.0        |

**Threshold tuning process:**

1. Start with balanced thresholds
2. Test on a sample of your data
3. If too many false positives → increase thresholds
4. If too many false negatives → decrease thresholds
5. Iterate until satisfied

### Adjusting Weights

Weights determine how much each field contributes to the overall match score. General guidelines:

**High importance (15-25 points):**

- Unique identifiers (email, username)
- Last name (more stable than first name)
- Critical address components

**Medium importance (8-15 points):**

- First name
- Full address
- Phone number
- Date of birth

**Low importance (3-8 points):**

- Phonetic supporting evidence
- Middle name
- Secondary contact info
- Zip code

**Weight tuning process:**

1. Identify your most discriminating fields (fields that best distinguish entities)
2. Assign higher weights to discriminating fields
3. Use phonetic strategies with lower weights as supporting evidence
4. Test and adjust based on false positive/negative rates

### Combining Multiple Strategies

You can apply multiple strategies to the same field:

```typescript
.matching((m) => m
  .field('lastName')
    .strategy('jaro-winkler')
    .weight(15)
    .threshold(0.92)
  .field('lastName')  // Same field again
    .strategy('metaphone')
    .weight(5)
)
```

**When to use multiple strategies:**

- Primary strategy for scoring + phonetic strategy for supporting evidence
- Different strategies for different aspects (prefix matching + overall similarity)
- A/B testing different algorithms on the same field

**When NOT to use multiple strategies:**

- Don't use more than 2-3 strategies per field (diminishing returns)
- Don't use both Soundex and Metaphone (they're redundant)
- Don't use Levenshtein and Jaro-Winkler together (choose one)

## Common Pitfalls

### 1. Using Phonetic Algorithms as Primary Strategy

**Problem:** Soundex and Metaphone return binary scores (1 or 0), which doesn't provide granular similarity information.

**Solution:** Use phonetic algorithms as supporting evidence with lower weights, not as the primary matching strategy.

```typescript
// ❌ Bad: Soundex as primary strategy
.matching((m) => m
  .field('firstName').strategy('soundex').weight(20)
)

// ✅ Good: Jaro-Winkler primary, Soundex supporting
.matching((m) => m
  .field('firstName').strategy('jaro-winkler').weight(15).threshold(0.88)
  .field('firstName').strategy('soundex').weight(5)
)
```

### 2. Ignoring Performance on Long Strings

**Problem:** Levenshtein has O(n×m) complexity. Very long strings (>1000 chars) can be slow.

**Solution:** Use Levenshtein for short-medium strings. For long text, consider other approaches or truncate.

```typescript
// ❌ Bad: Levenshtein on full documents
.field('biography').strategy('levenshtein').weight(10)

// ✅ Good: Levenshtein on short fields
.field('firstName').strategy('levenshtein').weight(10)
.field('lastName').strategy('levenshtein').weight(15)
```

### 3. Case Sensitivity Mismatches

**Problem:** Data is inconsistent case (some uppercase, some lowercase). Case-sensitive matching fails.

**Solution:** Use case-insensitive matching (the default for Levenshtein and Jaro-Winkler).

```typescript
// ✅ Good: Case-insensitive by default
.field('firstName')
  .strategy('levenshtein')
  .weight(10)

// ⚠️  Only if you need case-sensitive
.field('firstName')
  .strategy('levenshtein')
  .options({ caseSensitive: true })
  .weight(10)
```

### 4. Thresholds Too High or Too Low

**Problem:** Thresholds too high = miss valid matches. Thresholds too low = too many false positives.

**Solution:** Test on real data. Start with recommended values and tune based on results.

```typescript
// ❌ Bad: Threshold too high (miss valid matches)
.field('firstName')
  .strategy('jaro-winkler')
  .weight(10)
  .threshold(0.98)  // Too strict for fuzzy matching

// ✅ Good: Balanced threshold
.field('firstName')
  .strategy('jaro-winkler')
  .weight(10)
  .threshold(0.88)  // Allows reasonable variation
```

### 5. Not Normalizing Data

**Problem:** Extra whitespace, different formatting causes unnecessary mismatches.

**Solution:** Enable whitespace normalization (default for Levenshtein). Consider additional preprocessing.

```typescript
// ✅ Good: Whitespace normalization enabled by default
.field('street')
  .strategy('levenshtein')
  .levenshteinOptions({ normalizeWhitespace: true })  // Default
  .weight(15)
```

### 6. Using Wrong Algorithm for Use Case

**Problem:** Using Levenshtein for names (doesn't handle transpositions well) or Jaro-Winkler for addresses (too short-string focused).

**Solution:** Follow the selection guide above.

```typescript
// ❌ Bad: Levenshtein for names with transpositions
// "MARTHA" vs "MARHTA" gets low score

// ✅ Good: Jaro-Winkler for names
.field('firstName').strategy('jaro-winkler').weight(10)

// ✅ Good: Levenshtein for addresses
.field('street').strategy('levenshtein').weight(15)
```

---

## Performance Characteristics

All algorithms have been benchmarked and exceed performance targets:

| Algorithm            | Operations/sec | Mean Time | Use Case |
| -------------------- | -------------- | --------- | -------- |
| Jaro-Winkler (short) | 4.3M ops/sec   | 0.0002ms  | Names    |
| Soundex encoding     | 5.4M ops/sec   | 0.0002ms  | Blocking |
| Levenshtein (short)  | 2.5M ops/sec   | 0.0004ms  | General  |
| Metaphone encoding   | 3.8M ops/sec   | 0.0003ms  | Phonetic |

All algorithms are suitable for real-time matching. See [Performance Report](../../benchmarks/PERFORMANCE-REPORT.md) for detailed benchmarks.

---

## Additional Resources

- [API Reference](../api/index.md) - Full API documentation
- [Benchmark Results](../../benchmarks/BENCHMARK-RESULTS.md) - Performance benchmarks
- [Algorithm Comparison](./comparison.md) - Side-by-side comparisons

---

**Questions or feedback?** Open an issue on [GitHub](https://github.com/8arr3tt/have-we-met/issues).
