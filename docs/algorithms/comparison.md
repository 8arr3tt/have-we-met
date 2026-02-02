# Algorithm Comparison Guide

This guide provides a comprehensive comparison of all string similarity algorithms in have-we-met, backed by benchmark data to help you choose the right algorithm for your use case.

## Quick Reference

| Algorithm        | Best For                    | Performance  | Output Type      | Handles Typos | Phonetic |
| ---------------- | --------------------------- | ------------ | ---------------- | ------------- | -------- |
| **Exact**        | IDs, codes                  | 10M+ ops/sec | Binary (0/1)     | No            | No       |
| **Levenshtein**  | Addresses, general text     | 2.5M ops/sec | Continuous (0-1) | Excellent     | No       |
| **Jaro-Winkler** | Names, short strings        | 4.3M ops/sec | Continuous (0-1) | Good          | No       |
| **Soundex**      | Blocking, phonetic grouping | 5.4M ops/sec | Binary (0/1)     | No            | Yes      |
| **Metaphone**    | Improved phonetic matching  | 3.8M ops/sec | Binary (0/1)     | No            | Yes      |

---

## Detailed Comparison

### Exact Match

**Use when:** Matching unique identifiers, standardized codes, or values where any variation means no match.

| Metric           | Value                                    |
| ---------------- | ---------------------------------------- |
| Performance      | >10M ops/sec                             |
| Output           | Binary (0 = different, 1 = identical)    |
| Case sensitivity | Configurable (default: case-insensitive) |

**Best for:**

- National IDs (SSN, NHS Number, etc.)
- Email addresses (when canonical)
- Account numbers
- Postal/ZIP codes

**Example:**

```typescript
.matching(m => m
  .field('ssn').strategy('exact').weight(25)
  .field('email').strategy('exact').weight(20)
)
```

---

### Levenshtein Distance

**Use when:** Comparing general text where typos, insertions, or deletions are common.

| Metric      | Value                                                |
| ----------- | ---------------------------------------------------- |
| Performance | ~2.5M ops/sec (short strings)                        |
| Output      | Continuous (0 = completely different, 1 = identical) |
| Complexity  | O(n × m) where n, m are string lengths               |

**How it works:** Counts the minimum number of single-character edits (insertions, deletions, substitutions) to transform one string into another. The score is normalized by the maximum string length.

**Benchmark Results (Febrl dataset):**

| Metric     | Levenshtein    | Jaro-Winkler   |
| ---------- | -------------- | -------------- |
| Precision  | 91.23%         | 92.45%         |
| Recall     | 87.64%         | 89.18%         |
| F1 Score   | 89.40%         | 90.79%         |
| Throughput | 344k pairs/sec | 406k pairs/sec |

**Best for:**

- Address matching
- Company/organization names
- General text fields
- Longer strings (>20 characters)

**Limitations:**

- Transpositions count as 2 edits (use Jaro-Winkler if transpositions are common)
- Slower on very long strings (>1000 characters)
- Doesn't reward common prefixes

**Example:**

```typescript
.matching(m => m
  .field('address').strategy('levenshtein').weight(15).threshold(0.8)
  .field('companyName').strategy('levenshtein').weight(20).threshold(0.75)
)
```

---

### Jaro-Winkler Similarity

**Use when:** Matching names or short strings where prefix similarity is important.

| Metric       | Value                                                |
| ------------ | ---------------------------------------------------- |
| Performance  | ~4.3M ops/sec (short strings)                        |
| Output       | Continuous (0 = completely different, 1 = identical) |
| Prefix bonus | Up to 0.1 for common prefixes (configurable)         |

**How it works:** Computes base Jaro similarity from matching characters and transpositions, then adds a bonus for common prefixes (up to 4 characters by default).

**Benchmark Results (Febrl dataset):**

| Configuration       | Precision | Recall | F1 Score |
| ------------------- | --------- | ------ | -------- |
| Jaro-Winkler alone  | 92.45%    | 89.18% | 90.79%   |
| Soundex + JW hybrid | 93.12%    | 90.42% | 91.75%   |

**Best for:**

- First and last names
- Short text fields (<50 characters)
- Data with typos at the end of strings
- Cases where common prefixes indicate similarity

**Limitations:**

- May over-match when prefixes are common (e.g., "John" vs "Johnny")
- Not ideal for long text
- Prefix scale > 0.25 can produce counterintuitive results

**Example:**

```typescript
.matching(m => m
  .field('firstName').strategy('jaro-winkler').weight(10).threshold(0.88)
  .field('lastName').strategy('jaro-winkler').weight(15).threshold(0.92)
)
```

---

### Soundex Encoding

**Use when:** Grouping phonetically similar names for blocking or as supporting evidence.

| Metric      | Value                                       |
| ----------- | ------------------------------------------- |
| Performance | ~5.4M ops/sec                               |
| Output      | Binary (0 = different codes, 1 = same code) |
| Code format | Letter + 3 digits (e.g., "R163")            |

**How it works:** Encodes names into 4-character phonetic codes. Names that sound similar in English get the same code.

**Blocking Effectiveness (Febrl dataset):**

| Strategy           | Pair Reduction | Recall Impact |
| ------------------ | -------------- | ------------- |
| Soundex on surname | 89.52%         | -1.3%         |
| First letter       | 92.30%         | -2.9%         |
| Postcode           | 97.53%         | -17%          |

**Best for:**

- Blocking strategy for name-based matching
- Supporting evidence (low weight)
- Legacy system compatibility
- Fast phonetic grouping

**Limitations:**

- English-only phonetics
- Binary output (no gradation of similarity)
- Many false positives for common codes
- Should never be the primary matching strategy

**Example:**

```typescript
// As blocking strategy (recommended)
.blocking(b => b.soundex('lastName'))

// As supporting evidence
.matching(m => m
  .field('lastName').strategy('jaro-winkler').weight(15).threshold(0.9)
  .field('lastName').strategy('soundex').weight(5)
)
```

---

### Metaphone Encoding

**Use when:** Need more accurate phonetic matching than Soundex provides.

| Metric      | Value                                       |
| ----------- | ------------------------------------------- |
| Performance | ~3.8M ops/sec                               |
| Output      | Binary (0 = different codes, 1 = same code) |
| Code format | Variable length (default max: 4 characters) |

**How it works:** Improved phonetic algorithm that handles more English pronunciation rules (silent letters, consonant clusters, etc.).

**Comparison with Soundex:**

| Feature             | Soundex | Metaphone       |
| ------------------- | ------- | --------------- |
| Silent letters      | Limited | Better          |
| Consonant clusters  | Basic   | Better          |
| False positive rate | Higher  | Lower           |
| Performance         | Faster  | Slightly slower |

**Best for:**

- Phonetic matching when Soundex is too imprecise
- Names with complex pronunciation (e.g., "Knight" = "Night")
- Blocking with better precision than Soundex

**Limitations:**

- English-only
- Binary output
- Longer maxLength = more precision but fewer matches
- Still should not be the primary strategy

**Example:**

```typescript
// Better phonetic blocking
.blocking(b => b.metaphone('lastName'))

// As supporting evidence
.matching(m => m
  .field('lastName').strategy('jaro-winkler').weight(15).threshold(0.9)
  .field('lastName').strategy('metaphone').weight(6)
)
```

---

## Performance Comparison

All benchmarks run on AMD Ryzen 7 7800X3D, 32GB RAM, Node.js v24.

### Throughput by Algorithm

| Algorithm    | Short Strings (5-15 chars) | Medium Strings (20-50 chars) | Long Strings (100+ chars) |
| ------------ | -------------------------- | ---------------------------- | ------------------------- |
| Exact        | >10M ops/sec               | >10M ops/sec                 | >10M ops/sec              |
| Jaro-Winkler | 4.3M ops/sec               | 3.1M ops/sec                 | 1.2M ops/sec              |
| Soundex      | 5.4M ops/sec               | 5.0M ops/sec                 | 4.5M ops/sec              |
| Metaphone    | 3.8M ops/sec               | 3.5M ops/sec                 | 3.0M ops/sec              |
| Levenshtein  | 2.5M ops/sec               | 1.8M ops/sec                 | 0.4M ops/sec              |

### Real-World Matching Throughput

Benchmark: 1,000 records with Soundex blocking on surname

| Primary Algorithm | Pairs Compared | Total Time | Pairs/sec |
| ----------------- | -------------- | ---------- | --------- |
| Jaro-Winkler      | 52,340         | 142ms      | 368,591   |
| Levenshtein       | 52,340         | 168ms      | 311,548   |
| Soundex+JW Hybrid | 52,340         | 152ms      | 344,342   |

---

## Accuracy Comparison

### Person Matching (Febrl Synthetic Data)

| Algorithm         | Precision | Recall | F1 Score | Accuracy |
| ----------------- | --------- | ------ | -------- | -------- |
| Jaro-Winkler      | 92.45%    | 89.18% | 90.79%   | 99.87%   |
| Levenshtein       | 91.23%    | 87.64% | 89.40%   | 99.84%   |
| Soundex+JW Hybrid | 93.12%    | 90.42% | 91.75%   | 99.89%   |

### Restaurant Matching (Fodors-Zagat Style)

| Algorithm           | Precision | Recall | F1 Score | Accuracy |
| ------------------- | --------- | ------ | -------- | -------- |
| Jaro-Winkler (name) | 89.42%    | 85.71% | 87.53%   | 99.78%   |
| Levenshtein (name)  | 87.65%    | 83.24% | 85.39%   | 99.72%   |
| Strict city match   | 91.23%    | 78.56% | 84.41%   | 99.75%   |

---

## Recommended Combinations

### For Person/Customer Matching

```typescript
const resolver = HaveWeMet.create<Person>()
  .schema((s) =>
    s
      .field('firstName', { type: 'name' })
      .field('lastName', { type: 'name' })
      .field('email', { type: 'email' })
      .field('dateOfBirth', { type: 'date' })
      .field('ssn', { type: 'identifier' })
  )
  .blocking((b) => b.soundex('lastName'))
  .matching((m) =>
    m
      .field('firstName')
      .strategy('jaro-winkler')
      .weight(10)
      .threshold(0.88)
      .field('lastName')
      .strategy('jaro-winkler')
      .weight(15)
      .threshold(0.92)
      .field('lastName')
      .strategy('metaphone')
      .weight(5) // Supporting
      .field('email')
      .strategy('exact')
      .weight(20)
      .field('dateOfBirth')
      .strategy('exact')
      .weight(15)
      .field('ssn')
      .strategy('exact')
      .weight(25)
  )
  .thresholds({ noMatch: 30, definiteMatch: 60 })
  .build()
```

**Expected Results:** Precision ~93%, Recall ~90%, F1 ~91%

### For Business/Restaurant Matching

```typescript
const resolver = HaveWeMet.create<Business>()
  .schema((s) =>
    s
      .field('name', { type: 'text' })
      .field('address', { type: 'address' })
      .field('city', { type: 'text' })
      .field('phone', { type: 'phone' })
  )
  .blocking((b) => b.exact('city'))
  .matching((m) =>
    m
      .field('name')
      .strategy('jaro-winkler')
      .weight(30)
      .threshold(0.8)
      .field('address')
      .strategy('levenshtein')
      .weight(25)
      .threshold(0.75)
      .field('city')
      .strategy('exact')
      .weight(15)
      .field('phone')
      .strategy('exact')
      .weight(20)
  )
  .thresholds({ noMatch: 0.55, definiteMatch: 0.75 })
  .build()
```

**Expected Results:** Precision ~89%, Recall ~85%, F1 ~87%

### High-Precision Configuration

When false positives are expensive (e.g., merging financial accounts):

```typescript
.matching(m => m
  .field('email').strategy('exact').weight(25)
  .field('firstName').strategy('jaro-winkler').weight(10).threshold(0.95)
  .field('lastName').strategy('jaro-winkler').weight(15).threshold(0.95)
  .field('ssn').strategy('exact').weight(30)
)
.thresholds({ noMatch: 40, definiteMatch: 75 })
```

**Expected Results:** Precision ~97-99%, Recall ~65-75%

### High-Recall Configuration

When false negatives are expensive (e.g., finding all potential duplicates for review):

```typescript
.matching(m => m
  .field('firstName').strategy('jaro-winkler').weight(10).threshold(0.8)
  .field('lastName').strategy('jaro-winkler').weight(15).threshold(0.85)
  .field('lastName').strategy('soundex').weight(5)
  .field('email').strategy('levenshtein').weight(15).threshold(0.9)
)
.thresholds({ noMatch: 20, definiteMatch: 55 })
```

**Expected Results:** Precision ~78-85%, Recall ~92-96%

---

## Anti-Patterns

### 1. Phonetic Algorithm as Primary Strategy

```typescript
// BAD: Soundex alone has no gradation
.field('firstName').strategy('soundex').weight(20)

// GOOD: Jaro-Winkler primary, Soundex supporting
.field('firstName').strategy('jaro-winkler').weight(15).threshold(0.88)
.field('firstName').strategy('soundex').weight(5)
```

### 2. Levenshtein for Short Names

```typescript
// SUBOPTIMAL: Transpositions count as 2 edits
// "MARTHA" vs "MARHTA" = distance 2, low score
.field('firstName').strategy('levenshtein').weight(15)

// BETTER: Jaro-Winkler handles transpositions
.field('firstName').strategy('jaro-winkler').weight(15)
```

### 3. Very High Thresholds on Fuzzy Algorithms

```typescript
// BAD: Threshold 0.98 defeats the purpose of fuzzy matching
.field('firstName').strategy('jaro-winkler').weight(10).threshold(0.98)

// GOOD: Allow reasonable variation
.field('firstName').strategy('jaro-winkler').weight(10).threshold(0.88)
```

### 4. Using Both Soundex and Metaphone

```typescript
// REDUNDANT: They serve the same purpose
.field('lastName').strategy('soundex').weight(5)
.field('lastName').strategy('metaphone').weight(5)

// BETTER: Choose one
.field('lastName').strategy('metaphone').weight(6)
```

### 5. Ignoring Blocking at Scale

```typescript
// BAD at 10k+ records: O(n²) comparisons
const resolver = HaveWeMet.create<Person>()
  .matching((m) => m.field('name').strategy('jaro-winkler').weight(20))
  .build()

// GOOD: Always use blocking for large datasets
const resolver = HaveWeMet.create<Person>()
  .blocking((b) => b.soundex('lastName'))
  .matching((m) => m.field('name').strategy('jaro-winkler').weight(20))
  .build()
```

---

## Summary Table

| Use Case       | Primary Algorithm          | Supporting        | Blocking                  |
| -------------- | -------------------------- | ----------------- | ------------------------- |
| Names          | Jaro-Winkler               | Soundex/Metaphone | Soundex                   |
| Addresses      | Levenshtein                | -                 | First letter, postcode    |
| Emails         | Exact or Levenshtein       | -                 | Domain or first character |
| IDs            | Exact                      | -                 | Prefix or checksum digit  |
| Business names | Jaro-Winkler               | -                 | City/location             |
| Mixed entity   | Jaro-Winkler + Levenshtein | Metaphone         | Soundex + location        |

---

## See Also

- [Selection Flowchart](selection-flowchart.md) - Visual decision guide
- [String Similarity Algorithms](string-similarity.md) - Detailed algorithm documentation
- [Tuning Guide](../tuning-guide.md) - Threshold and weight optimization
- [Febrl Benchmark Results](../../benchmarks/results/febrl-results.md) - Full benchmark data
- [Restaurant Benchmark Results](../../benchmarks/results/restaurant-results.md) - Business matching benchmarks
