# Matching Builder API Reference

The Matching Builder configures how fields are compared and weighted to produce match scores for probabilistic matching.

## Entry Point

Access the matching builder through the resolver builder chain:

```typescript
import { HaveWeMet } from 'have-we-met'

const resolver = HaveWeMet.create<Person>()
  .schema(/* ... */)
  .matching((match) =>
    match
      .field('email')
      .strategy('exact')
      .weight(20)
      .field('firstName')
      .strategy('jaro-winkler')
      .weight(10)
      .threshold(0.85)
      .field('lastName')
      .strategy('jaro-winkler')
      .weight(10)
      .threshold(0.85)
      .thresholds({ noMatch: 20, definiteMatch: 45 })
  )
  .build()
```

## MatchingBuilder

Main builder class for configuring field comparisons and weights.

### Methods

#### `field(name: string): FieldMatchBuilder`

Start configuring a field's matching strategy.

**Parameters:**

- `name: string` - Field name to configure (supports dot notation for nested fields)

**Returns:** `FieldMatchBuilder` for chaining

**Example:**

```typescript
;(match) =>
  match
    .field('email') // Configure email matching
    .field('address.zip') // Nested field with dot notation
```

#### `thresholds(config: ThresholdConfig): this`

Set score thresholds for three-tier outcome classification.

**Parameters:**

- `config: ThresholdConfig` - Threshold configuration object

**Returns:** `MatchingBuilder` for chaining

**Example:**

```typescript
;(match) =>
  match
    .field('email')
    .strategy('exact')
    .weight(20)
    .thresholds({ noMatch: 20, definiteMatch: 45 })
```

#### `build(): MatchingConfig`

Build and return the final matching configuration.

**Returns:** `MatchingConfig` - The complete matching configuration

---

## FieldMatchBuilder

Fluent builder for configuring matching on a specific field.

### Methods

#### `strategy(strategy: MatchingStrategy): this`

Set the comparison strategy for this field.

**Parameters:**

- `strategy: MatchingStrategy` - One of: `'exact'`, `'levenshtein'`, `'jaro-winkler'`, `'soundex'`, `'metaphone'`

**Returns:** `FieldMatchBuilder` for chaining

**Example:**

```typescript
.field('email').strategy('exact')
.field('firstName').strategy('jaro-winkler')
.field('lastName').strategy('soundex')
```

#### `weight(weight: number): this`

Set the weight for this field's contribution to the overall score.

**Parameters:**

- `weight: number` - Positive number representing field importance

**Returns:** `FieldMatchBuilder` for chaining

**Example:**

```typescript
.field('ssn').strategy('exact').weight(30)      // High discriminating power
.field('firstName').strategy('jaro-winkler').weight(10)
.field('city').strategy('exact').weight(5)       // Lower weight
```

#### `threshold(threshold: number): this`

Set the field-specific similarity threshold. Values below this threshold contribute 0 to the score.

**Parameters:**

- `threshold: number` - Value between 0 and 1

**Returns:** `FieldMatchBuilder` for chaining

**Example:**

```typescript
.field('firstName')
  .strategy('jaro-winkler')
  .weight(10)
  .threshold(0.85)  // Require 85% similarity to count
```

#### `caseSensitive(caseSensitive: boolean): this`

Toggle case sensitivity for string comparisons.

**Parameters:**

- `caseSensitive: boolean` - Whether comparisons are case-sensitive

**Returns:** `FieldMatchBuilder` for chaining

**Example:**

```typescript
.field('customCode')
  .strategy('exact')
  .caseSensitive(true)  // "ABC" !== "abc"
```

#### `levenshteinOptions(options: LevenshteinOptions): this`

Set options specific to Levenshtein distance comparison.

**Parameters:**

- `options: LevenshteinOptions`
  - `caseSensitive?: boolean` - Case-sensitive comparison (default: `false`)
  - `normalizeWhitespace?: boolean` - Collapse whitespace (default: `true`)

**Returns:** `FieldMatchBuilder` for chaining

**Example:**

```typescript
.field('address')
  .strategy('levenshtein')
  .weight(10)
  .levenshteinOptions({
    caseSensitive: false,
    normalizeWhitespace: true
  })
```

#### `jaroWinklerOptions(options: JaroWinklerOptions): this`

Set options specific to Jaro-Winkler similarity.

**Parameters:**

- `options: JaroWinklerOptions`
  - `caseSensitive?: boolean` - Case-sensitive comparison (default: `false`)
  - `prefixScale?: number` - Prefix bonus scaling (default: `0.1`, max: `0.25`)
  - `maxPrefixLength?: number` - Max prefix length for bonus (default: `4`)

**Returns:** `FieldMatchBuilder` for chaining

**Example:**

```typescript
.field('firstName')
  .strategy('jaro-winkler')
  .weight(10)
  .jaroWinklerOptions({
    prefixScale: 0.1,
    maxPrefixLength: 4
  })
```

#### `soundexOptions(options: SoundexOptions): this`

Set options specific to Soundex phonetic matching.

**Parameters:**

- `options: SoundexOptions`
  - `nullMatchesNull?: boolean` - Whether null values match each other (default: `true`)

**Returns:** `FieldMatchBuilder` for chaining

**Example:**

```typescript
.field('lastName')
  .strategy('soundex')
  .weight(8)
  .soundexOptions({ nullMatchesNull: false })
```

#### `metaphoneOptions(options: MetaphoneOptions): this`

Set options specific to Metaphone phonetic matching.

**Parameters:**

- `options: MetaphoneOptions`
  - `nullMatchesNull?: boolean` - Whether null values match each other (default: `true`)

**Returns:** `FieldMatchBuilder` for chaining

**Example:**

```typescript
.field('firstName')
  .strategy('metaphone')
  .weight(8)
  .metaphoneOptions({ nullMatchesNull: false })
```

#### `field(name: string): FieldMatchBuilder`

Configure another field (returns to a new FieldMatchBuilder).

**Parameters:**

- `name: string` - Field name to configure

**Returns:** `FieldMatchBuilder` for the new field

**Example:**

```typescript
;(match) =>
  match
    .field('email')
    .strategy('exact')
    .weight(20)
    .field('phone')
    .strategy('exact')
    .weight(15)
    .field('firstName')
    .strategy('jaro-winkler')
    .weight(10)
```

#### `thresholds(config: ThresholdConfig): MatchingBuilder`

Set thresholds and return to the matching builder.

**Parameters:**

- `config: ThresholdConfig` - Threshold configuration

**Returns:** `MatchingBuilder` for continuing configuration

#### `build(): MatchingConfig`

Build and return the final matching configuration.

**Returns:** `MatchingConfig` - The complete matching configuration

---

## Matching Strategies

| Strategy         | Description             | Best For                | Score Range |
| ---------------- | ----------------------- | ----------------------- | ----------- |
| `'exact'`        | Exact string match      | Identifiers, emails     | 0 or 1      |
| `'levenshtein'`  | Edit distance           | General text, addresses | 0 to 1      |
| `'jaro-winkler'` | Character transposition | Names (short strings)   | 0 to 1      |
| `'soundex'`      | Phonetic encoding       | English names           | 0 or 1      |
| `'metaphone'`    | Phonetic encoding       | English names           | 0 or 1      |

See [Algorithm Comparison](../algorithms/comparison.md) for detailed guidance.

---

## ThresholdConfig Type

```typescript
interface ThresholdConfig {
  /** Score below which records are considered non-matches */
  noMatch: number

  /** Score above which records are definite matches */
  definiteMatch: number
}
```

Scores between `noMatch` and `definiteMatch` are classified as "potential matches" requiring human review.

---

## MatchingConfig Type

The complete matching configuration type:

```typescript
interface MatchingConfig {
  fields: Map<string, FieldMatchConfig>
  thresholds: ThresholdConfig
}

interface FieldMatchConfig {
  strategy: MatchingStrategy
  weight: number
  threshold?: number
  caseSensitive?: boolean
  options?: StrategyOptions
}
```

---

## Weight Guidelines

| Field Type                        | Recommended Weight | Rationale                       |
| --------------------------------- | ------------------ | ------------------------------- |
| Unique identifiers (SSN, email)   | 20-30              | High discriminating power       |
| Phone numbers                     | 15-20              | Good discriminator when present |
| Full name (first + last combined) | 15-20              | Moderate discriminator          |
| Individual name parts             | 8-12               | Lower due to common names       |
| Date of birth                     | 10-15              | Good discriminator              |
| Address components                | 5-10               | Many people share addresses     |
| City/State                        | 3-5                | Low discriminating power        |

---

## Threshold Guidelines

| Use Case                             | noMatch | definiteMatch |
| ------------------------------------ | ------- | ------------- |
| High precision (few false positives) | 25      | 55            |
| Balanced                             | 20      | 45            |
| High recall (few false negatives)    | 15      | 35            |

---

## Complete Example

```typescript
import { HaveWeMet } from 'have-we-met'

interface Customer {
  id: string
  email: string
  phone: string
  firstName: string
  lastName: string
  dateOfBirth: string
  ssn?: string
  address: {
    street: string
    city: string
    state: string
    zip: string
  }
}

const resolver = HaveWeMet.create<Customer>()
  .schema(/* ... */)
  .matching((match) =>
    match
      // High-value exact matches
      .field('ssn')
      .strategy('exact')
      .weight(30)

      .field('email')
      .strategy('exact')
      .weight(20)

      .field('phone')
      .strategy('exact')
      .weight(15)

      // Name matching with fuzzy algorithms
      .field('firstName')
      .strategy('jaro-winkler')
      .weight(10)
      .threshold(0.85)
      .jaroWinklerOptions({ prefixScale: 0.1 })

      .field('lastName')
      .strategy('jaro-winkler')
      .weight(12)
      .threshold(0.85)

      // Date matching
      .field('dateOfBirth')
      .strategy('exact')
      .weight(10)

      // Address matching
      .field('address.zip')
      .strategy('exact')
      .weight(5)

      .field('address.city')
      .strategy('levenshtein')
      .weight(3)
      .threshold(0.9)

      // Set classification thresholds
      .thresholds({
        noMatch: 20, // Below 20: definitely different people
        definiteMatch: 50, // Above 50: definitely same person
      })
  )
  .build()
```

---

## Match Result

The resolver returns `MatchResult` objects:

```typescript
interface MatchResult {
  /** The matching record */
  record: Record<string, unknown>

  /** Overall match score */
  score: number

  /** Match classification */
  outcome: 'no-match' | 'potential-match' | 'definite-match'

  /** Detailed field-by-field breakdown */
  explanation: MatchExplanation
}

interface MatchExplanation {
  /** Individual field scores */
  fieldScores: Map<string, FieldScore>

  /** Factors that increased the score */
  positiveFactors: string[]

  /** Factors that decreased the score */
  negativeFactors: string[]
}
```

---

## Related

- [Schema Builder](./schema-builder.md) - Define field types
- [Blocking Builder](./blocking-builder.md) - Reduce comparison space
- [Algorithm Comparison](../algorithms/comparison.md) - Choose algorithms
- [Tuning Guide](../tuning-guide.md) - Optimize weights and thresholds
