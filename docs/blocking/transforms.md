# Block Transforms Reference

Block transforms modify field values to create block keys. This guide provides a complete reference for all available transforms, their use cases, and examples.

## Table of Contents

- [Transform Overview](#transform-overview)
- [Standard Transforms](#standard-transforms)
- [Custom Transforms](#custom-transforms)
- [Transform Comparison](#transform-comparison)
- [Best Practices](#best-practices)

---

## Transform Overview

A block transform is a function that converts a field value into a block key component:

```typescript
Input: 'Smith'
Transform: soundex
Output: 'S530'
```

Multiple records with the same transformed value are grouped into the same block.

### Available Transforms

| Transform       | Description                   | Use Case                       |
| --------------- | ----------------------------- | ------------------------------ |
| `identity`      | Use value as-is               | Categorical fields, IDs        |
| `firstLetter`   | Extract first character       | Quick grouping, speed-critical |
| `soundex`       | Phonetic encoding (Soundex)   | Name matching with typos       |
| `metaphone`     | Phonetic encoding (Metaphone) | Advanced name matching         |
| `year`          | Extract year from date        | Date-based grouping            |
| `firstN`        | First N characters            | Partial matching               |
| Custom function | User-defined logic            | Domain-specific needs          |

---

## Standard Transforms

### identity

Uses the field value as-is, without transformation.

**Syntax:**

```typescript
.onField('country', { transform: 'identity' })
```

**Behavior:**

```
Input:  "United States"  →  Output: "united states" (normalized)
Input:  "Canada"         →  Output: "canada"
Input:  123              →  Output: "123"
Input:  null             →  Output: null (filtered by nullStrategy)
```

**Use Cases:**

- ✅ Categorical fields (country, state, category)
- ✅ Standardized codes (ISO codes, postal codes)
- ✅ Fields with exact values
- ❌ Free-text fields with variations

**Performance:**

- Fastest transform (just converts to string)
- Minimal overhead

**Example:**

```typescript
interface Person {
  name: string
  country: string
}

.blocking(block => block
  .onField('country', { transform: 'identity' })
)

// Result: All US records in one block, all Canada records in another
```

---

### firstLetter

Extracts the first character and converts to uppercase.

**Syntax:**

```typescript
.onField('lastName', { transform: 'firstLetter' })
```

**Behavior:**

```
Input:  "Smith"          →  Output: "S"
Input:  "smith"          →  Output: "S"
Input:  "O'Brien"        →  Output: "O"
Input:  ""               →  Output: null
Input:  null             →  Output: null
```

**Use Cases:**

- ✅ Very large datasets (100k+) where speed is critical
- ✅ Initial grouping before more specific matching
- ✅ High-quality data with consistent spelling
- ⚠️ Produces unbalanced blocks (letter frequency variation)
- ❌ Noisy data with many typos

**Performance:**

- Very fast (~17ms for 100k records)
- Creates ~26 blocks (one per letter)
- Average 3,800+ records per block
- 96% comparison reduction

**Block Distribution:**

```
Block "S": ~15,000 records  ⚠️ Unbalanced
Block "X": ~50 records
```

**Example:**

```typescript
.blocking(block => block
  .onField('lastName', { transform: 'firstLetter' })
)

// John Smith → Block "S"
// Jane Smyth → Block "S"
// Bob Jones  → Block "J"
```

**When to Use:**

- Dataset > 100k records and speed is critical
- Combined with other strategies in composite mode
- As a first pass before more expensive matching

---

### soundex

Encodes strings using the Soundex phonetic algorithm. Similar-sounding names receive the same code.

**Syntax:**

```typescript
.onField('lastName', { transform: 'soundex' })
```

**Behavior:**

```
Input:  "Smith"          →  Output: "S530"
Input:  "Smyth"          →  Output: "S530"  (same as Smith!)
Input:  "Schmidt"        →  Output: "S530"  (same as Smith!)
Input:  "Johnson"        →  Output: "J525"
Input:  "Jonson"         →  Output: "J525"  (same as Johnson!)
Input:  ""               →  Output: null
Input:  null             →  Output: null
```

**Algorithm Details:**

- Keeps first letter
- Encodes consonants to digits (0-6)
- Removes vowels
- Result is first letter + 3 digits (e.g., S530)

**Use Cases:**

- ✅ **Name matching** (last names, first names)
- ✅ Noisy data with spelling variations
- ✅ Phonetic similarity more important than exact spelling
- ✅ Default choice for most person-matching scenarios
- ❌ Non-phonetic data (IDs, codes, numbers)

**Performance:**

- Fast (~38ms for 100k records)
- Creates ~1,200 blocks
- Average ~83 records per block
- 99% comparison reduction

**Block Distribution:**

- Well balanced across blocks
- Minimal skewness

**Soundex Limitations:**

```
"Robert" → R163
"Rupert" → R163  ✅ Similar names, same code

"Lee"    → L000
"Leigh"  → L200  ⚠️ Same pronunciation, different codes

"Smith"  → S530
"Smythe" → S530  ✅ Variations match
```

**Example:**

```typescript
interface Person {
  firstName: string
  lastName: string
}

.blocking(block => block
  .onField('lastName', { transform: 'soundex' })
)

// John Smith  → Block "S530"
// Jane Smyth  → Block "S530"  ✅ Matched despite typo
// Bob Schmidt → Block "S530"  ✅ Matched despite variation
// Mary Jones  → Block "J525"
```

**When to Use:**

- **Default choice** for person matching
- Any scenario with name variations or typos
- When phonetic similarity matters more than spelling

---

### metaphone

Encodes strings using the Metaphone phonetic algorithm. More accurate than Soundex for English names.

**Syntax:**

```typescript
.onField('lastName', { transform: 'metaphone' })
```

**Behavior:**

```
Input:  "Smith"          →  Output: "SM0"
Input:  "Smyth"          →  Output: "SM0"
Input:  "Schmidt"        →  Output: "SXMT"  (different from Smith)
Input:  "Johnson"        →  Output: "JNSN"
Input:  "Jonson"         →  Output: "JNSN"
Input:  ""               →  Output: null
Input:  null             →  Output: null
```

**Metaphone vs Soundex:**

| Input   | Soundex | Metaphone |
| ------- | ------- | --------- |
| Smith   | S530    | SM0       |
| Smyth   | S530    | SM0       |
| Schmidt | S530    | SXMT      |
| Knight  | K523    | NXT       |
| Night   | N230    | NXT       |

Metaphone handles consonant combinations and silent letters better than Soundex.

**Use Cases:**

- ✅ English name matching with high accuracy needs
- ✅ When Soundex produces too many false positives
- ✅ Corporate name matching
- ⚠️ Slightly slower than Soundex
- ❌ Non-English names (Soundex may be better)

**Performance:**

- Fast (~44ms for 100k records)
- Creates ~1,500 blocks
- Average ~67 records per block
- 99% comparison reduction

**Example:**

```typescript
.blocking(block => block
  .onField('companyName', { transform: 'metaphone' })
)

// "Acme Corporation"  → Block "AKMP"
// "ACME Corp."        → Block "AKMP"  ✅ Matched
// "Smithson & Sons"   → Block "SM0SN"
```

**When to Use:**

- More accurate phonetic matching needed
- English-language names and companies
- When Soundex groups too many unrelated names

---

### year

Extracts the year from date values.

**Syntax:**

```typescript
.onField('dateOfBirth', { transform: 'year' })
```

**Behavior:**

```
Input:  new Date("1990-05-15")  →  Output: "1990"
Input:  "1990-05-15"            →  Output: "1990"
Input:  "May 15, 1990"          →  Output: "1990"
Input:  1650000000000           →  Output: "2022" (timestamp)
Input:  "invalid"               →  Output: null
Input:  null                    →  Output: null
```

**Supported Input Formats:**

- JavaScript Date objects
- ISO 8601 strings (YYYY-MM-DD)
- Timestamps (milliseconds since epoch)
- Any format parseable by `new Date()`

**Use Cases:**

- ✅ Date of birth matching
- ✅ Registration/creation date grouping
- ✅ Any date field where year-level grouping makes sense
- ❌ Fields requiring month/day precision

**Performance:**

- Fast (~22ms for 100k records)
- Creates ~80 blocks (typical birth year range)
- Average ~1,250 records per block
- 98% comparison reduction

**Block Distribution:**

- Relatively balanced
- Skews toward common birth years

**Example:**

```typescript
interface Person {
  name: string
  dateOfBirth: Date
}

.blocking(block => block
  .onField('dateOfBirth', { transform: 'year' })
)

// John (born 1990-05-15) → Block "1990"
// Jane (born 1990-12-20) → Block "1990"  ✅ Same block
// Bob  (born 1991-01-05) → Block "1991"
```

**When to Use:**

- Complement to name matching
- Narrow down person matching by age group
- Multi-field composite blocking

---

### firstN

Extracts the first N characters from a string.

**Syntax:**

```typescript
.onField('companyName', {
  transform: 'firstN',
  transformOptions: { n: 3 }
})
```

**Behavior:**

```
// With n = 3:
Input:  "Acme Corporation"  →  Output: "ACM"
Input:  "ACME Corp"         →  Output: "ACM"
Input:  "A"                 →  Output: "A"
Input:  ""                  →  Output: null
Input:  null                →  Output: null

// With n = 5:
Input:  "Smith"             →  Output: "SMITH"
Input:  "Smithson"          →  Output: "SMITH"
```

**Use Cases:**

- ✅ Prefix matching on codes or IDs
- ✅ Company names with common prefixes
- ✅ Product SKUs with category prefixes
- ✅ When soundex is too loose but exact is too strict
- ⚠️ Requires tuning N for your data

**Choosing N:**

| N   | Use Case            | Example                          |
| --- | ------------------- | -------------------------------- |
| 2   | Very broad grouping | "Smith", "Smyth", "Small" → "SM" |
| 3   | **Default choice**  | "Smith", "Smyth" → "SMI", "SMY"  |
| 4-5 | Specific matching   | "Smith" → "SMIT"                 |
| 6+  | Near-exact matching | May as well use identity         |

**Performance:**

- Very fast (~20ms for 100k records)
- Block count depends on N
- Smaller N = fewer, larger blocks

**Example:**

```typescript
interface Product {
  sku: string
  name: string
}

.blocking(block => block
  .onField('sku', {
    transform: 'firstN',
    transformOptions: { n: 4 }
  })
)

// SKU: "ELEC-12345" → Block "ELEC"
// SKU: "ELEC-67890" → Block "ELEC"  ✅ Same category
// SKU: "FOOD-11111" → Block "FOOD"
```

**When to Use:**

- Fields with structured prefixes
- Tuning needed between exact and phonetic
- Custom grouping logic

---

## Custom Transforms

Define your own transform logic using a function:

**Syntax:**

```typescript
.onField('email', {
  transform: (value) => {
    if (typeof value !== 'string') return null
    const domain = value.split('@')[1]
    return domain || null
  }
})
```

**Requirements:**

- Function accepts `value: unknown`
- Returns `string | null`
- Returns `null` for invalid/unusable values
- Should handle null/undefined input gracefully

### Example: Email Domain Extraction

```typescript
.onField('email', {
  transform: (email) => {
    if (typeof email !== 'string') return null
    const parts = email.split('@')
    return parts.length === 2 ? parts[1].toLowerCase() : null
  }
})

// "john@example.com"   → "example.com"
// "jane@example.com"   → "example.com"  ✅ Same block
// "bob@other.com"      → "other.com"
// "invalid"            → null (filtered)
```

### Example: Postcode Prefix

```typescript
.onField('postcode', {
  transform: (postcode) => {
    if (typeof postcode !== 'string') return null
    // Extract first part of UK postcode (e.g., "SW1A 2AA" → "SW1A")
    const prefix = postcode.trim().split(/\s+/)[0]
    return prefix.toUpperCase()
  }
})

// "SW1A 2AA" → "SW1A"
// "SW1A 1AA" → "SW1A"  ✅ Same area
// "E1 6AN"   → "E1"
```

### Example: Normalized Company Name

```typescript
.onField('companyName', {
  transform: (name) => {
    if (typeof name !== 'string') return null
    return name
      .toLowerCase()
      .replace(/\b(inc|corp|ltd|llc|limited)\b/g, '')
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 10) || null
  }
})

// "Acme Corporation"     → "acme"
// "ACME Corp."           → "acme"  ✅ Normalized
// "Acme, Inc."           → "acme"  ✅ Same
```

### Example: Phone Area Code

```typescript
.onField('phone', {
  transform: (phone) => {
    if (typeof phone !== 'string') return null
    const digits = phone.replace(/\D/g, '')
    // Extract first 3 digits (US area code)
    return digits.length >= 3 ? digits.slice(0, 3) : null
  }
})

// "+1-555-123-4567"  → "555"
// "(555) 987-6543"   → "555"  ✅ Same area code
// "555-246-8135"     → "555"  ✅ Same area code
```

### Best Practices for Custom Transforms

1. **Handle null/undefined:**

   ```typescript
   if (value == null) return null
   ```

2. **Type checking:**

   ```typescript
   if (typeof value !== 'string') return null
   ```

3. **Normalize output:**

   ```typescript
   return result.toLowerCase().trim()
   ```

4. **Return null for invalid:**

   ```typescript
   return result || null // Empty string → null
   ```

5. **Handle errors:**
   ```typescript
   try {
     // transform logic
   } catch (error) {
     return null
   }
   ```

---

## Transform Comparison

### Performance Comparison (100k records)

| Transform    | Generation Time | Blocks Created | Records/Block | Reduction |
| ------------ | --------------- | -------------- | ------------- | --------- |
| identity     | ~15ms           | Varies         | Varies        | Varies    |
| firstLetter  | ~17ms           | ~26            | ~3,846        | 96%       |
| soundex      | ~38ms           | ~1,200         | ~83           | 99%       |
| metaphone    | ~44ms           | ~1,500         | ~67           | 99%       |
| year         | ~22ms           | ~80            | ~1,250        | 98%       |
| firstN (n=3) | ~20ms           | ~17,576\*      | ~6            | 99.9%     |
| Custom       | Varies          | Varies         | Varies        | Varies    |

\*Theoretical max for 3 letters (26³)

### Accuracy Comparison (Names)

Test: Match names with single-character typos

| Transform        | Recall | Precision | F1 Score |
| ---------------- | ------ | --------- | -------- |
| identity (exact) | 60%    | 100%      | 0.75     |
| firstLetter      | 95%    | 45%       | 0.61     |
| soundex          | 92%    | 78%       | 0.85     |
| metaphone        | 94%    | 82%       | 0.88     |
| firstN (n=3)     | 85%    | 70%       | 0.77     |

**Metaphone has the best balance of recall and precision for English names.**

### Use Case Matrix

| Transform   | Names | Dates | IDs | Companies | Addresses |
| ----------- | ----- | ----- | --- | --------- | --------- |
| identity    | ❌    | ❌    | ✅  | ❌        | ⚠️        |
| firstLetter | ⚠️    | ❌    | ❌  | ⚠️        | ❌        |
| soundex     | ✅    | ❌    | ❌  | ✅        | ❌        |
| metaphone   | ✅    | ❌    | ❌  | ✅        | ⚠️        |
| year        | ❌    | ✅    | ❌  | ❌        | ❌        |
| firstN      | ⚠️    | ❌    | ✅  | ⚠️        | ⚠️        |
| Custom      | ✅    | ✅    | ✅  | ✅        | ✅        |

---

## Best Practices

### General Guidelines

1. **Start simple:** Use `soundex` for names as a default
2. **Match field type:** `year` for dates, `identity` for categories
3. **Consider data quality:** Noisier data needs more forgiving transforms
4. **Test and measure:** Validate recall and performance with your data
5. **Combine strategically:** Use composite blocking for multiple fields

### Transform Selection by Field Type

| Field Type    | Recommended Transform | Alternative                |
| ------------- | --------------------- | -------------------------- |
| Person name   | `soundex`             | `metaphone`, `firstLetter` |
| Company name  | `soundex`             | `metaphone`, custom        |
| Date          | `year`                | custom (month/year)        |
| Email         | custom (domain)       | sorted neighbourhood       |
| Phone         | custom (area code)    | sorted neighbourhood       |
| Address       | custom (postcode)     | `firstN` on street         |
| Country/State | `identity`            | -                          |
| Category      | `identity`            | -                          |
| Product SKU   | `firstN`              | custom                     |

### Common Mistakes to Avoid

❌ **Using identity on free-text fields:**

```typescript
// Bad: Misses typos and variations
.onField('lastName', { transform: 'identity' })
```

✅ **Use phonetic transform instead:**

```typescript
// Good: Handles variations
.onField('lastName', { transform: 'soundex' })
```

❌ **Using soundex on non-phonetic data:**

```typescript
// Bad: Soundex doesn't make sense for dates
.onField('dateOfBirth', { transform: 'soundex' })
```

✅ **Use appropriate transform:**

```typescript
// Good: Extract year from dates
.onField('dateOfBirth', { transform: 'year' })
```

❌ **Too narrow blocking:**

```typescript
// Bad: Creates 1,000,000 blocks (one per record)
.onField('id', { transform: 'identity' })
```

✅ **Block on meaningful fields:**

```typescript
// Good: Groups records meaningfully
.onField('lastName', { transform: 'soundex' })
```

### Testing Transforms

Test your transforms with sample data:

```typescript
import { applyTransform } from 'have-we-met'

// Test soundex transform
console.log(applyTransform('Smith', 'soundex')) // "S530"
console.log(applyTransform('Smyth', 'soundex')) // "S530" ✅

// Test year transform
console.log(applyTransform('1990-05-15', 'year')) // "1990"
console.log(applyTransform(new Date(1990, 4, 15), 'year')) // "1990" ✅

// Test custom transform
const emailDomain = (email: unknown) => {
  if (typeof email !== 'string') return null
  return email.split('@')[1] || null
}

console.log(emailDomain('john@example.com')) // "example.com" ✅
console.log(emailDomain('invalid')) // null ✅
```

## Summary

- **soundex** is the default choice for name matching (99% reduction, good balance)
- **metaphone** provides better accuracy for English names
- **firstLetter** is fastest but least accurate
- **year** is ideal for date fields
- **firstN** works well for structured codes/SKUs
- **Custom transforms** handle domain-specific requirements
- Choose transforms based on field type, data quality, and performance needs

## Next Steps

- [Selection Guide](selection-guide.md) - Choose the right overall strategy
- [Strategies Guide](strategies.md) - Understand how transforms fit into strategies
- [Tuning Guide](tuning.md) - Optimize transform selection for your data
- [Overview](overview.md) - Understand blocking fundamentals
