# Custom Models

While the pre-trained model works well for common person matching, custom models can significantly improve accuracy for domain-specific use cases.

## When to Create Custom Models

Create a custom model when:

- Your fields differ from the pre-trained model (firstName, lastName, email, phone, dateOfBirth, address, ssn)
- You have domain-specific matching patterns (medical records, financial accounts, product data)
- The pre-trained model's accuracy is insufficient for your use case
- You have labeled training data from historical matches or human review

## Creating a Simple Custom Model

### 1. Configure Feature Extraction

First, define what features to extract for your record type:

```typescript
import {
  SimpleClassifier,
  FeatureExtractor,
  featureConfig
} from 'have-we-met/ml'

interface Product {
  sku: string
  name: string
  brand: string
  category: string
  price: number
}

// Build feature extraction configuration
const extractorConfig = featureConfig()
  .addExactField('sku', { weight: 2.0 })
  .addStringField('name', { weight: 1.5 })
  .addField('brand', ['exact', 'jaroWinkler'], { weight: 1.2 })
  .addField('category', ['exact'], { weight: 0.8 })
  .addNumericField('price', { weight: 0.5 })
  .build()

const featureExtractor = new FeatureExtractor<Product>(extractorConfig)
```

### 2. Create a Classifier

```typescript
// Create classifier with feature configuration
const classifier = new SimpleClassifier<Product>({
  featureExtractor,
  modelConfig: {
    matchThreshold: 0.7,
    nonMatchThreshold: 0.3,
    includeFeatureImportance: true
  }
})

console.log(`Feature count: ${classifier.getFeatureCount()}`)
console.log(`Feature names: ${classifier.getMetadata().featureNames}`)
```

### 3. Train the Model

With labeled training data:

```typescript
import { ModelTrainer, createTrainingDataset } from 'have-we-met/ml'

// Create training dataset from labeled pairs
const trainingData = createTrainingDataset([
  {
    pair: { record1: product1, record2: product2 },
    label: 'match',
    source: 'manual-review'
  },
  {
    pair: { record1: product1, record2: product3 },
    label: 'nonMatch',
    source: 'manual-review'
  },
  // ... more examples
])

// Train the model
const trainer = new ModelTrainer<Product>({
  featureExtractor,
  config: {
    learningRate: 0.01,
    maxIterations: 1000,
    validationSplit: 0.2
  }
})

const { classifier: trainedClassifier, result } = await trainer.trainClassifier(trainingData)

if (trainedClassifier) {
  console.log(`Training accuracy: ${result.finalMetrics.trainingAccuracy}`)
  console.log(`Validation accuracy: ${result.finalMetrics.validationAccuracy}`)
}
```

### 4. Use the Trained Model

```typescript
// Make predictions
const prediction = await trainedClassifier.predict({
  record1: newProduct,
  record2: existingProduct
})

console.log(`Match probability: ${prediction.probability}`)
console.log(`Classification: ${prediction.classification}`)
```

## Model Weights

### Setting Weights Manually

For quick testing or when you have expert knowledge:

```typescript
const classifier = new SimpleClassifier<Product>({
  featureExtractor
})

// Set weights directly (one weight per feature)
const weights = [
  0.8,   // sku_exact
  0.3,   // sku_missing
  0.5,   // name_jaroWinkler
  0.4,   // name_levenshtein
  0.2,   // name_exact
  0.1,   // name_missing
  // ... one for each feature
]
const bias = -0.5

classifier.setWeightsAndBias(weights, bias)
```

### Loading Weights from JSON

Save and load trained weights:

```typescript
// Export weights
const weightsData = trainedClassifier.exportWeights()
const json = JSON.stringify(weightsData, null, 2)
// Save to file or database

// Load weights
const loadedWeights = JSON.parse(savedJson)
const newClassifier = new SimpleClassifier<Product>({
  featureExtractor
})
await newClassifier.loadWeights(loadedWeights)
```

Weights file format:

```json
{
  "modelType": "SimpleClassifier",
  "version": "1.0.0",
  "weights": [0.8, 0.3, 0.5, ...],
  "bias": -0.5,
  "featureNames": ["sku_exact", "sku_missing", ...],
  "extra": {
    "trainedAt": "2026-02-01T12:00:00.000Z",
    "accuracy": 0.92,
    "trainingExamples": 5000
  }
}
```

## Using Custom Models with Builder API

```typescript
const resolver = HaveWeMet.create<Product>()
  .schema(schema => {
    schema
      .field('sku', { type: 'string' })
      .field('name', { type: 'string' })
      .field('brand', { type: 'string' })
      .field('category', { type: 'string' })
      .field('price', { type: 'number' })
  })
  .blocking(block => block.onField('category'))
  .matching(match => {
    match
      .field('sku').strategy('exact').weight(30)
      .field('name').strategy('jaro-winkler').weight(20)
      .field('brand').strategy('exact').weight(15)
      .thresholds({ noMatch: 25, definiteMatch: 50 })
  })
  // Use custom trained model
  .ml(ml => ml
    .model(trainedClassifier)   // Your trained model
    .mode('hybrid')
    .mlWeight(0.5)
  )
  .build()
```

## Custom Feature Extraction

For fields that don't fit standard extractors:

```typescript
import { CustomFeatureExtractor } from 'have-we-met/ml'

// Custom extractor for address comparison
const addressSimilarity: CustomFeatureExtractor = (v1, v2) => {
  if (v1 == null || v2 == null) return 0

  const addr1 = normalizeAddress(String(v1))
  const addr2 = normalizeAddress(String(v2))

  // Compare components separately
  const streetScore = compareStreets(addr1.street, addr2.street)
  const cityScore = addr1.city === addr2.city ? 1 : 0
  const stateScore = addr1.state === addr2.state ? 1 : 0
  const zipScore = compareZipCodes(addr1.zip, addr2.zip)

  // Weighted combination
  return 0.4 * streetScore + 0.2 * cityScore + 0.1 * stateScore + 0.3 * zipScore
}

const config = featureConfig()
  .addCustomField('address', addressSimilarity, { weight: 1.2 })
  .addNameField('name')
  .build()
```

## Model Introspection

Understand what your model learned:

```typescript
// Get feature importance by weight magnitude
const importance = classifier.getFeatureImportance()
console.log('Most important features:')
for (const { name, weight, importance } of importance.slice(0, 10)) {
  const direction = weight > 0 ? '+' : '-'
  console.log(`  ${name}: ${direction}${importance.toFixed(4)}`)
}

// Examine a specific prediction
const prediction = await classifier.predict({ record1, record2 })
console.log('\nPrediction breakdown:')
for (const feat of prediction.featureImportance.slice(0, 5)) {
  const contrib = feat.contribution > 0 ? 'increases' : 'decreases'
  console.log(`  ${feat.name}: ${contrib} match probability by ${Math.abs(feat.contribution).toFixed(3)}`)
}
```

## Model Cloning

Create copies for A/B testing or experimentation:

```typescript
const clonedClassifier = classifier.clone()

// Modify the clone without affecting the original
clonedClassifier.setConfig({
  ...clonedClassifier.getConfig(),
  matchThreshold: 0.8
})
```

## Validation

Validate model weights before use:

```typescript
import { isValidSimpleClassifierWeights } from 'have-we-met/ml'

if (!isValidSimpleClassifierWeights(loadedWeights)) {
  throw new Error('Invalid weights format')
}
```

## Best Practices

1. **Start with the pre-trained model**: Use it as a baseline and only create custom models if needed

2. **Collect sufficient training data**: Aim for at least 500-1000 labeled pairs with balanced match/non-match distribution

3. **Use validation splits**: Always hold out data to monitor overfitting

4. **Feature engineering matters**: Good features often matter more than model complexity

5. **Iterate on features**: Add/remove features based on importance analysis

6. **Test on real data**: Verify accuracy on recent, representative data

7. **Monitor in production**: Track model performance over time for drift

8. **Version your models**: Save weights with version info for reproducibility

## Example: Medical Record Matching

```typescript
interface PatientRecord {
  mrn: string
  firstName: string
  lastName: string
  dateOfBirth: string
  ssn?: string
  address: string
  phone?: string
}

const medicalExtractor = featureConfig()
  // High-value identifiers
  .addExactField('mrn', { weight: 3.0 })
  .addExactField('ssn', { weight: 2.5 })

  // Demographics
  .addNameField('firstName', { weight: 1.5 })
  .addNameField('lastName', { weight: 1.5 })
  .addDateField('dateOfBirth', { weight: 2.0 })

  // Contact info
  .addStringField('address', { weight: 1.0 })
  .addField('phone', ['exact', 'levenshtein'], { weight: 1.2 })

  .buildExtractor()

// Train on labeled patient matches from your institution
const trainer = new ModelTrainer<PatientRecord>({
  featureExtractor: medicalExtractor,
  config: {
    learningRate: 0.005,      // Lower for stability
    maxIterations: 2000,
    validationSplit: 0.25,    // More validation for medical data
    regularization: 0.01      // Prevent overfitting
  }
})
```
