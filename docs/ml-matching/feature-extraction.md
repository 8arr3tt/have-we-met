# Feature Extraction

Feature extraction converts record pairs into numerical vectors that ML models can process. Good feature engineering is critical for ML matching accuracy.

## How It Works

For each field in a record pair, the feature extractor computes similarity scores using various algorithms:

```
Record 1: { firstName: 'John', email: 'john@example.com' }
Record 2: { firstName: 'Jon',  email: 'john@example.com' }
                    ↓
Feature Extractor (jaroWinkler, soundex, exact per field)
                    ↓
Feature Vector: [0.91, 1.0, 0.0, 1.0, 1.0, 0.0, ...]
                  │    │    │    │    │    │
                  │    │    │    │    │    └─ email_missing
                  │    │    │    │    └─ email_exact
                  │    │    │    └─ firstName_missing
                  │    │    └─ firstName_exact
                  │    └─ firstName_soundex
                  └─ firstName_jaroWinkler
```

## Built-in Feature Extractors

| Extractor | Description | Best For |
|-----------|-------------|----------|
| `exact` | Binary match (0 or 1) | Identifiers, dates |
| `jaroWinkler` | String similarity (0-1) | Names, short strings |
| `levenshtein` | Edit distance (normalized 0-1) | General strings |
| `soundex` | Phonetic match (0 or 1) | English names |
| `metaphone` | Phonetic match (0 or 1) | English names |
| `numericDiff` | Normalized difference (0-1) | Numbers, ages |
| `dateDiff` | Temporal proximity (0-1) | Dates |
| `missing` | Missing value indicator (0 or 1) | Any field |

## Using the Feature Extractor

### Direct Usage

```typescript
import { FeatureExtractor } from 'have-we-met/ml'

// Define feature extraction configuration
const config = {
  fields: [
    {
      field: 'firstName',
      extractors: ['jaroWinkler', 'soundex', 'exact'],
      weight: 1.2
    },
    {
      field: 'email',
      extractors: ['levenshtein', 'exact'],
      weight: 1.5
    },
    {
      field: 'dateOfBirth',
      extractors: ['exact', 'dateDiff'],
      weight: 1.3
    }
  ],
  normalize: true
}

const extractor = new FeatureExtractor(config)

// Extract features from a record pair
const features = extractor.extract({
  record1: { firstName: 'John', email: 'john@example.com', dateOfBirth: '1985-03-15' },
  record2: { firstName: 'Jon', email: 'john@example.com', dateOfBirth: '1985-03-15' }
})

console.log(features.names)   // ['firstName_jaroWinkler', 'firstName_soundex', ...]
console.log(features.values)  // [0.91, 1.0, 0.0, ...]
```

### Builder API

Use the fluent builder for cleaner configuration:

```typescript
import { featureConfig, FeatureExtractionConfigBuilder } from 'have-we-met/ml'

const extractor = featureConfig()
  .addNameField('firstName', { weight: 1.2 })
  .addNameField('lastName', { weight: 1.2 })
  .addField('email', ['levenshtein', 'exact'], { weight: 1.5 })
  .addDateField('dateOfBirth', { weight: 1.3 })
  .addExactField('ssn', { weight: 2.0 })
  .normalize(true)
  .buildExtractor()
```

### Convenience Methods

The builder provides shortcuts for common field types:

```typescript
featureConfig()
  // Name fields: jaroWinkler + soundex + metaphone + exact
  .addNameField('firstName')
  .addNameField('lastName')

  // String fields: jaroWinkler + levenshtein + exact
  .addStringField('address')

  // Identifier fields: exact + levenshtein
  .addExactField('email')
  .addExactField('ssn')

  // Date fields: exact + dateDiff
  .addDateField('dateOfBirth')

  // Numeric fields: numericDiff + exact
  .addNumericField('age')

  .buildExtractor()
```

## ML Builder Integration

Configure features through the ML builder:

```typescript
.ml(ml => ml
  .usePretrained()
  .mode('hybrid')

  // Configure individual fields
  .field('firstName').forName().weight(1.2)
  .field('lastName').forName().weight(1.2)
  .field('email').forIdentifier().weight(1.5)
  .field('dateOfBirth').forDate().weight(1.3)

  // Or use bulk configuration
  .nameFields(['firstName', 'lastName'])
  .identifierFields(['email', 'phone', 'ssn'])
  .dateFields(['dateOfBirth'])
)
```

### Field Presets

| Method | Extractors | Default Weight |
|--------|------------|----------------|
| `.forName()` | jaroWinkler, soundex, metaphone, exact | 1.0 |
| `.forIdentifier()` | exact, levenshtein | 1.0 |
| `.forDate()` | exact, dateDiff | 1.0 |
| `.forNumeric()` | exact, numericDiff | 1.0 |

## Custom Feature Extractors

Create custom extractors for domain-specific fields:

```typescript
import { FeatureExtractor, CustomFeatureExtractor } from 'have-we-met/ml'

// Custom extractor for product codes
const productCodeSimilarity: CustomFeatureExtractor = (value1, value2) => {
  if (value1 == null || value2 == null) return 0

  const v1 = String(value1)
  const v2 = String(value2)

  // Compare prefix (category) and suffix (item number) separately
  const prefix1 = v1.slice(0, 3)
  const prefix2 = v2.slice(0, 3)
  const suffix1 = v1.slice(3)
  const suffix2 = v2.slice(3)

  const prefixMatch = prefix1 === prefix2 ? 0.5 : 0
  const suffixMatch = suffix1 === suffix2 ? 0.5 : 0

  return prefixMatch + suffixMatch
}

// Use in configuration
const extractor = new FeatureExtractor({
  fields: [
    {
      field: 'productCode',
      extractors: ['custom'],
      weight: 1.5
    }
  ],
  normalize: true,
  customExtractors: {
    productCode: productCodeSimilarity
  }
})

// Or with builder
featureConfig()
  .addCustomField('productCode', productCodeSimilarity, { weight: 1.5 })
  .buildExtractor()

// Or with ML builder
.ml(ml => ml
  .customExtractor('productCode', productCodeSimilarity)
  .field('productCode').extractors(['custom']).weight(1.5)
)
```

## Missing Value Handling

By default, each field gets a missing value indicator feature:

```typescript
const config = {
  fields: [
    {
      field: 'email',
      extractors: ['exact'],
      includeMissingIndicator: true  // default: true
    }
  ]
}
```

The missing indicator is 1 if either record has a null/undefined/empty value for the field.

To disable:

```typescript
.field('email')
  .forIdentifier()
  .includeMissing(false)
```

## Feature Weights

Weights multiply feature values to emphasize important fields:

```typescript
const config = {
  fields: [
    { field: 'ssn', extractors: ['exact'], weight: 2.0 },    // High importance
    { field: 'firstName', extractors: ['jaroWinkler'], weight: 1.0 },
    { field: 'nickname', extractors: ['jaroWinkler'], weight: 0.5 }  // Lower importance
  ]
}
```

Weights affect:
- The magnitude of feature contributions in the ML model
- Feature importance calculations in predictions

## Nested Field Access

Access nested fields using dot notation:

```typescript
const config = {
  fields: [
    { field: 'name.first', extractors: ['jaroWinkler'] },
    { field: 'name.last', extractors: ['jaroWinkler'] },
    { field: 'address.city', extractors: ['exact'] }
  ]
}

// Works with records like:
const record = {
  name: { first: 'John', last: 'Smith' },
  address: { city: 'New York', state: 'NY' }
}
```

## Feature Utilities

### Get Feature by Name

```typescript
import { getFeatureByName } from 'have-we-met/ml'

const value = getFeatureByName(features, 'email_exact')
console.log(value)  // 1.0
```

### Get All Features for a Field

```typescript
import { getFieldFeatures } from 'have-we-met/ml'

const emailFeatures = getFieldFeatures(features, 'email')
console.log(emailFeatures)
// { 'email_levenshtein': 1.0, 'email_exact': 1.0, 'email_missing': 0.0 }
```

### Compare Feature Vectors

```typescript
import { compareFeatureVectors } from 'have-we-met/ml'

const diff = compareFeatureVectors(features1, features2)
console.log(diff['firstName_jaroWinkler'])
// { value1: 0.91, value2: 0.85, diff: 0.06 }
```

### Calculate Feature Statistics

```typescript
import { calculateFeatureStats } from 'have-we-met/ml'

const stats = calculateFeatureStats(featureVectors, 'email_exact')
console.log(stats)
// { min: 0, max: 1, mean: 0.75, stdDev: 0.43 }
```

## Pre-configured Extractors

### Person Matching

```typescript
const extractor = FeatureExtractor.forPersonMatching()
```

Includes optimized configuration for:
- firstName, lastName (jaroWinkler, soundex, exact)
- email, phone (levenshtein, exact)
- dateOfBirth (exact, dateDiff)
- address (levenshtein, jaroWinkler)
- ssn (exact)

### From Field List

```typescript
const extractor = FeatureExtractor.fromFields(
  ['firstName', 'lastName', 'email'],
  ['jaroWinkler', 'exact']  // extractors to use for all fields
)
```

## Best Practices

1. **Match extractors to field types**: Use phonetic extractors for names, exact for identifiers
2. **Weight by discriminating power**: SSN should have higher weight than nickname
3. **Include missing indicators**: Helps the model understand data quality
4. **Normalize features**: Keeps all features on the same scale
5. **Use custom extractors**: When built-in extractors don't capture domain-specific patterns
6. **Test feature extraction**: Verify features look reasonable before training
