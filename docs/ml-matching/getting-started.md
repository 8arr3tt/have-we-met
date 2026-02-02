# ML Matching: Getting Started

This guide gets you up and running with ML matching in minutes using the pre-trained model.

## Quick Start

### 1. Basic ML Matching with Builder API

The simplest way to add ML matching is through the builder API:

```typescript
import { HaveWeMet } from 'have-we-met'

interface Person {
  firstName: string
  lastName: string
  email?: string
  phone?: string
  dateOfBirth?: string
}

const resolver = HaveWeMet.create<Person>()
  .schema((schema) => {
    schema
      .field('firstName', { type: 'name', component: 'first' })
      .field('lastName', { type: 'name', component: 'last' })
      .field('email', { type: 'email' })
      .field('phone', { type: 'phone' })
      .field('dateOfBirth', { type: 'date' })
  })
  .blocking((block) => block.onField('lastName', { transform: 'soundex' }))
  .matching((match) => {
    match
      .field('email')
      .strategy('exact')
      .weight(20)
      .field('firstName')
      .strategy('jaro-winkler')
      .weight(10)
      .field('lastName')
      .strategy('jaro-winkler')
      .weight(10)
      .field('dateOfBirth')
      .strategy('exact')
      .weight(10)
      .thresholds({ noMatch: 20, definiteMatch: 45 })
  })
  // Add ML matching in hybrid mode
  .ml(
    (ml) =>
      ml
        .usePretrained() // Use built-in pre-trained model
        .mode('hybrid') // Combine ML with probabilistic
        .mlWeight(0.4) // 40% ML, 60% probabilistic
  )
  .build()
```

### 2. Direct Model Usage

For more control, use the ML APIs directly:

```typescript
import { createPretrainedClassifier } from 'have-we-met/ml'

// Load the pre-trained classifier
const classifier = await createPretrainedClassifier<Person>()

// Define two records to compare
const record1 = {
  firstName: 'John',
  lastName: 'Smith',
  email: 'john.smith@example.com',
  dateOfBirth: '1985-03-15',
}

const record2 = {
  firstName: 'Jon', // Typo
  lastName: 'Smith',
  email: 'john.smith@example.com', // Same
  dateOfBirth: '1985-03-15',
}

// Make a prediction
const prediction = await classifier.predict({
  record1,
  record2,
})

console.log(prediction.probability) // 0.92 (92% match probability)
console.log(prediction.classification) // 'match'
console.log(prediction.confidence) // 0.87 (87% confident)
```

### 3. Understanding Predictions

Each prediction includes:

```typescript
interface MLPrediction {
  probability: number // Match probability (0-1)
  classification: 'match' | 'nonMatch' | 'uncertain'
  confidence: number // Model confidence (0-1)
  features: FeatureVector // Extracted features
  featureImportance: FeatureImportance[] // What contributed to the decision
}
```

Inspect feature importance to understand why a prediction was made:

```typescript
import { getTopFeatures } from 'have-we-met/ml'

const topFeatures = getTopFeatures(prediction.featureImportance, 5)
for (const feature of topFeatures) {
  console.log(`${feature.name}: ${(feature.importance * 100).toFixed(1)}%`)
}

// Output:
// email_exact: 28.5%
// lastName_jaroWinkler: 18.2%
// firstName_jaroWinkler: 15.1%
// dateOfBirth_exact: 12.8%
// firstName_soundex: 10.4%
```

## Hybrid Mode Configuration

Hybrid mode combines ML predictions with probabilistic scores:

```typescript
.ml(ml => ml
  .usePretrained()
  .mode('hybrid')
  .mlWeight(0.4)              // 40% ML weight
  .applyTo('all')             // Apply to all comparisons
  .timeout(5000)              // 5 second timeout
  .fallbackOnError(true)      // Use probabilistic if ML fails
  .matchThreshold(0.7)        // ML match threshold
  .nonMatchThreshold(0.3)     // ML non-match threshold
)
```

The final score is calculated as:

```
finalScore = (1 - mlWeight) × probabilisticScore + mlWeight × mlScore
```

With `mlWeight: 0.4`:

- A probabilistic score of 75 and ML probability of 0.90 (scaled to 90)
- Final: `0.6 × 75 + 0.4 × 90 = 45 + 36 = 81`

## Fallback Mode

Use ML only for uncertain cases:

```typescript
.ml(ml => ml
  .usePretrained()
  .mode('fallback')
  .applyTo('uncertainOnly')
)
```

This configuration:

- Uses probabilistic results for definite matches and no-matches
- Uses ML predictions only for potential matches (uncertain cases)
- Reduces ML computation while helping with difficult decisions

## ML-Only Mode

Trust ML completely:

```typescript
.ml(ml => ml
  .usePretrained()
  .mode('mlOnly')
  .matchThreshold(0.75)      // Higher threshold for more precision
  .nonMatchThreshold(0.25)
)
```

## Batch Predictions

Process multiple pairs efficiently:

```typescript
const pairs = [
  { record1: recordA, record2: recordB },
  { record1: recordA, record2: recordC },
  { record1: recordA, record2: recordD },
]

const batchResults = await classifier.predictBatch(pairs)

for (const result of batchResults) {
  console.log(
    `${result.prediction.classification}: ${result.prediction.probability}`
  )
}
```

## Model Introspection

Examine what the model learned:

```typescript
// Get feature importance by weight magnitude
const importance = classifier.getFeatureImportance()
console.log('Top features:')
for (const { name, weight, importance } of importance.slice(0, 5)) {
  console.log(`  ${name}: weight=${weight.toFixed(3)}`)
}

// Get model metadata
const metadata = classifier.getMetadata()
console.log(`Model: ${metadata.name} v${metadata.version}`)
console.log(`Features: ${metadata.featureNames.length}`)
console.log(`Accuracy: ${metadata.accuracy}`)
```

## Error Handling

ML predictions can fail (timeout, invalid data). Configure fallback behavior:

```typescript
.ml(ml => ml
  .usePretrained()
  .mode('hybrid')
  .timeout(3000)              // 3 second timeout
  .fallbackOnError(true)      // Fall back to probabilistic on error
)
```

With `fallbackOnError: true`, if ML prediction fails:

- The result will have `mlUsed: false`
- The `mlError` field will contain the error message
- Probabilistic score will be used instead

## Next Steps

- [Feature Extraction](feature-extraction.md) - Customize feature extraction
- [Custom Models](custom-models.md) - Train your own models
- [Training Guide](training.md) - Model training best practices
