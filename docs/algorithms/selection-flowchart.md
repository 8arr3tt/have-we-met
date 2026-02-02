# Algorithm Selection Flowchart

This guide provides visual decision trees to help you select the right algorithms for your identity resolution use case.

## Primary Algorithm Selection

```
START: What type of field are you matching?
│
├─► Unique Identifier (SSN, email, account #)
│   └─► Use: EXACT
│       Weight: 20-30
│       No threshold needed
│
├─► Person Name (first, last, middle)
│   └─► Use: JARO-WINKLER
│       Weight: 10-20
│       Threshold: 0.85-0.95
│       Add: SOUNDEX or METAPHONE as supporting (weight: 3-8)
│
├─► Business/Organization Name
│   │
│   ├─► Short names (<20 chars, e.g., "Joe's Diner")
│   │   └─► Use: JARO-WINKLER
│   │       Weight: 25-35
│   │       Threshold: 0.80-0.90
│   │
│   └─► Long names (>20 chars, e.g., "International Business Machines")
│       └─► Use: LEVENSHTEIN
│           Weight: 25-35
│           Threshold: 0.75-0.85
│
├─► Address
│   │
│   ├─► Full address
│   │   └─► Use: LEVENSHTEIN
│   │       Weight: 15-25
│   │       Threshold: 0.75-0.85
│   │       Pre-process: Normalize abbreviations (St→Street)
│   │
│   └─► Street name only
│       └─► Use: JARO-WINKLER
│           Weight: 10-15
│           Threshold: 0.80-0.90
│
├─► Date
│   └─► Use: EXACT (after normalization)
│       Weight: 10-15
│       Pre-process: Parse to standard format
│
├─► Phone Number
│   └─► Use: EXACT (after normalization)
│       Weight: 15-25
│       Pre-process: Remove formatting, country code normalization
│
└─► General Text
    │
    ├─► Short text (<50 chars)
    │   └─► Use: JARO-WINKLER
    │       Weight: varies
    │       Threshold: 0.80-0.90
    │
    └─► Long text (>50 chars)
        └─► Use: LEVENSHTEIN
            Weight: varies
            Threshold: 0.70-0.85
```

## Blocking Strategy Selection

```
START: How large is your dataset?
│
├─► Small (<5,000 records)
│   └─► Blocking OPTIONAL but recommended
│       Use simple blocking: first letter of primary name field
│
├─► Medium (5,000-50,000 records)
│   │
│   │   What are you matching?
│   │   │
│   │   ├─► People
│   │   │   └─► Block on: SOUNDEX(lastName)
│   │   │       ~90% pair reduction
│   │   │       ~1% recall loss
│   │   │
│   │   ├─► Businesses
│   │   │   └─► Block on: city or region
│   │   │       ~96% pair reduction
│   │   │       <1% recall loss (businesses rarely match across cities)
│   │   │
│   │   └─► Mixed/Other
│   │       └─► Block on: first letter of primary field
│   │           ~80% pair reduction
│   │
└─► Large (>50,000 records)
    │
    │   BLOCKING REQUIRED
    │   │
    │   ├─► People
    │   │   │
    │   │   ├─► Maximum coverage needed
    │   │   │   └─► Composite: SOUNDEX(lastName) UNION first_letter(firstName)
    │   │   │       ~85% pair reduction
    │   │   │       Minimal recall loss
    │   │   │
    │   │   └─► Speed is priority
    │   │       └─► Single: SOUNDEX(lastName) or postcode
    │   │           ~90-99% pair reduction
    │   │
    │   └─► Businesses
    │       │
    │       ├─► Same geographic region
    │       │   └─► Block on: first_letter(name) + type/category
    │       │
    │       └─► Multi-region
    │           └─► Block on: city/region REQUIRED
    │               Consider: composite with first_letter(name)
```

## Threshold Selection

```
START: What is your tolerance for errors?
│
├─► False positives are EXPENSIVE
│   (e.g., merging wrong accounts, HIPAA violations)
│   │
│   └─► HIGH PRECISION configuration
│       │
│       ├─► Field thresholds: 0.90-0.95
│       ├─► Overall definiteMatch: 70-85
│       ├─► Overall noMatch: 35-50
│       │
│       └─► Expected: Precision ~97%, Recall ~65-75%
│
├─► False negatives are EXPENSIVE
│   (e.g., missing duplicates in audit, compliance review)
│   │
│   └─► HIGH RECALL configuration
│       │
│       ├─► Field thresholds: 0.75-0.85
│       ├─► Overall definiteMatch: 50-60
│       ├─► Overall noMatch: 15-25
│       │
│       └─► Expected: Precision ~78%, Recall ~92-96%
│
└─► BALANCED (most use cases)
    │
    └─► BALANCED configuration
        │
        ├─► Field thresholds: 0.85-0.90
        ├─► Overall definiteMatch: 55-70
        ├─► Overall noMatch: 25-35
        │
        └─► Expected: Precision ~90%, Recall ~88%
```

## Phonetic Algorithm Selection

```
START: Do you need phonetic matching?
│
├─► NO - Skip phonetic algorithms
│   └─► Phonetic matching is optional supporting evidence
│
└─► YES
    │
    ├─► For BLOCKING
    │   │
    │   ├─► Maximum recall
    │   │   └─► Use: SOUNDEX
    │   │       More collisions = fewer missed matches
    │   │
    │   └─► Better precision
    │       └─► Use: METAPHONE with maxLength: 5-6
    │           Fewer collisions = fewer false blocks
    │
    └─► For SCORING (supporting evidence)
        │
        ├─► Simple/fast
        │   └─► Use: SOUNDEX
        │       Weight: 3-6
        │       Binary: adds points only if codes match
        │
        └─► More accurate
            └─► Use: METAPHONE
                Weight: 4-8
                Binary: adds points only if codes match
```

## Complete Example: Person Matching

```
SCENARIO: Deduplicating customer database with 25,000 records
          Balance between precision and recall needed

STEP 1: Select blocking
├─► Dataset: 25,000 records → Medium/Large
├─► Entity: People
└─► Choice: SOUNDEX on lastName
    Rationale: ~90% pair reduction, minimal recall loss

STEP 2: Select primary algorithms
├─► firstName: JARO-WINKLER (name field, <20 chars)
├─► lastName: JARO-WINKLER (name field, <20 chars)
├─► email: EXACT (unique identifier)
├─► dateOfBirth: EXACT (date, after normalization)
└─► address: LEVENSHTEIN (address field)

STEP 3: Add phonetic support
└─► lastName: add METAPHONE with low weight

STEP 4: Configure weights (total ~100)
├─► email: 20 (strong identifier)
├─► lastName: 20 (JW) + 5 (MP) = 25
├─► firstName: 15
├─► dateOfBirth: 15
├─► address: 15
└─► Total potential: 90 points

STEP 5: Configure thresholds
├─► Balanced configuration
├─► noMatch: 25
├─► definiteMatch: 60
└─► Field thresholds: 0.85-0.90

RESULT:
.blocking(b => b.soundex('lastName'))
.matching(m => m
  .field('firstName').strategy('jaro-winkler').weight(15).threshold(0.88)
  .field('lastName').strategy('jaro-winkler').weight(20).threshold(0.90)
  .field('lastName').strategy('metaphone').weight(5)
  .field('email').strategy('exact').weight(20)
  .field('dateOfBirth').strategy('exact').weight(15)
  .field('address').strategy('levenshtein').weight(15).threshold(0.80)
)
.thresholds({ noMatch: 25, definiteMatch: 60 })
```

## Complete Example: Business Matching

```
SCENARIO: Matching restaurant listings across sources
          600 records, city-based operation

STEP 1: Select blocking
├─► Dataset: 600 records → Small/Medium
├─► Entity: Restaurants
└─► Choice: EXACT on city
    Rationale: Restaurants rarely match across cities, 96% reduction

STEP 2: Select primary algorithms
├─► name: JARO-WINKLER (business name, handles "Joe's" vs "Joes")
├─► address: LEVENSHTEIN (full address)
├─► city: EXACT (location)
└─► phone: EXACT (identifier)

STEP 3: Configure weights (total ~100)
├─► name: 30 (primary identifier)
├─► address: 25 (strong discriminator)
├─► phone: 25 (unique when present)
└─► city: 15 (location verification)

STEP 4: Configure thresholds
├─► Balanced with slight precision bias
├─► noMatch: 40
├─► definiteMatch: 70
└─► Field thresholds: 0.80-0.85

RESULT:
.blocking(b => b.exact('city'))
.matching(m => m
  .field('name').strategy('jaro-winkler').weight(30).threshold(0.82)
  .field('address').strategy('levenshtein').weight(25).threshold(0.78)
  .field('phone').strategy('exact').weight(25)
  .field('city').strategy('exact').weight(15)
)
.thresholds({ noMatch: 40, definiteMatch: 70 })
```

## Quick Decision Tables

### When to Use Each Algorithm

| Scenario | Algorithm | Why |
|----------|-----------|-----|
| SSN, NHS Number, account ID | Exact | Unique identifiers need exact match |
| First name, last name | Jaro-Winkler | Optimized for short name strings |
| Full street address | Levenshtein | Good for longer text with insertions/deletions |
| Restaurant/business name | Jaro-Winkler | Handles punctuation variations |
| Company legal name | Levenshtein | Often longer, more formal |
| Email address | Exact | Usually canonical format |
| Phone number | Exact | After normalization |
| Date of birth | Exact | After parsing to standard format |
| City/state | Exact | Geographic fields are discrete |

### Threshold Quick Reference

| Use Case | noMatch | definiteMatch | Field Threshold |
|----------|---------|---------------|-----------------|
| High-stakes (medical, financial) | 35-50 | 70-85 | 0.90-0.95 |
| General deduplication | 25-35 | 55-70 | 0.85-0.90 |
| Discovery/audit | 15-25 | 45-60 | 0.75-0.85 |

### Blocking Strategy Quick Reference

| Dataset Size | Entity Type | Recommended Blocking |
|--------------|-------------|---------------------|
| <5k | Any | Optional: first letter |
| 5k-50k | People | Soundex(lastName) |
| 5k-50k | Business | city or region |
| >50k | People | Soundex(lastName) or composite |
| >50k | Business | city + first_letter(name) |

---

## See Also

- [Algorithm Comparison](comparison.md) - Detailed benchmark data
- [String Similarity Algorithms](string-similarity.md) - Algorithm documentation
- [Blocking Overview](../blocking/overview.md) - Blocking strategy details
- [Tuning Guide](../tuning-guide.md) - Threshold optimization
