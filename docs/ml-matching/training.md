# Model Training Guide

This guide covers best practices for training custom ML models for identity matching.

## Training Overview

The `ModelTrainer` class trains logistic regression models using:

- **Gradient descent** optimization
- **L2 regularization** to prevent overfitting
- **Early stopping** when validation loss plateaus
- **Validation split** to monitor generalization

## Basic Training

```typescript
import {
  ModelTrainer,
  createTrainingDataset,
  createTrainingExample,
  FeatureExtractor,
} from 'have-we-met/ml'

// 1. Create feature extractor
const featureExtractor = FeatureExtractor.forPersonMatching()

// 2. Prepare training data
const examples = [
  createTrainingExample(
    { record1: john1, record2: john2 },
    'match',
    'manual-review'
  ),
  createTrainingExample(
    { record1: john1, record2: jane1 },
    'nonMatch',
    'manual-review'
  ),
  // ... more examples
]

const dataset = createTrainingDataset(examples)

// 3. Train the model
const trainer = new ModelTrainer({
  featureExtractor,
  config: {
    learningRate: 0.01,
    maxIterations: 1000,
    validationSplit: 0.2,
  },
})

const { classifier, result } = await trainer.trainClassifier(dataset)

// 4. Check results
if (classifier) {
  console.log(
    `Training accuracy: ${(result.finalMetrics.trainingAccuracy * 100).toFixed(1)}%`
  )
  console.log(
    `Validation accuracy: ${(result.finalMetrics.validationAccuracy * 100).toFixed(1)}%`
  )
  console.log(`Training time: ${result.trainingTimeMs.toFixed(0)}ms`)
  console.log(`Iterations: ${result.finalMetrics.iteration}`)
  console.log(`Early stopped: ${result.earlyStopped}`)
}
```

## Training Configuration

### Default Configuration

```typescript
const DEFAULT_TRAINING_CONFIG = {
  learningRate: 0.01, // Step size for gradient updates
  maxIterations: 1000, // Maximum training iterations
  regularization: 0.001, // L2 regularization strength
  validationSplit: 0.2, // 20% held out for validation
  earlyStoppingPatience: 10, // Stop after 10 iterations without improvement
  minImprovement: 0.001, // Minimum loss decrease to count as improvement
}
```

### Configuration Options

| Parameter               | Description                     | Recommendation                           |
| ----------------------- | ------------------------------- | ---------------------------------------- |
| `learningRate`          | Step size for weight updates    | 0.001-0.1; lower is more stable          |
| `maxIterations`         | Training iteration limit        | 500-2000 based on dataset size           |
| `regularization`        | L2 penalty strength             | 0.0001-0.01; higher prevents overfitting |
| `validationSplit`       | Fraction held for validation    | 0.2-0.3 for typical datasets             |
| `earlyStoppingPatience` | Iterations without improvement  | 5-20; higher explores more               |
| `minImprovement`        | Minimum meaningful improvement  | 0.0001-0.01                              |
| `seed`                  | Random seed for reproducibility | Set for reproducible results             |

### Tuning Tips

**High training accuracy, low validation accuracy (overfitting):**

- Increase `regularization` (e.g., 0.01)
- Decrease `maxIterations`
- Add more training data

**Low training accuracy (underfitting):**

- Decrease `regularization`
- Increase `maxIterations`
- Increase `learningRate` slightly
- Add more/better features

**Training is slow:**

- Decrease `maxIterations`
- Increase `earlyStoppingPatience` (stops sooner)
- Consider smaller training dataset

## Data Preparation

### Creating Training Examples

```typescript
import { createTrainingExample } from 'have-we-met/ml'

// From known matches
const matchExample = createTrainingExample(
  { record1: customer1, record2: customer2 },
  'match',
  'known-duplicate'
)

// From known non-matches
const nonMatchExample = createTrainingExample(
  { record1: customer1, record2: differentPerson },
  'nonMatch',
  'random-pair'
)
```

### Dataset Statistics

```typescript
import { getDatasetStats } from 'have-we-met/ml'

const stats = getDatasetStats(dataset)
console.log(`Total examples: ${stats.totalExamples}`)
console.log(`Matches: ${stats.matchCount}`)
console.log(`Non-matches: ${stats.nonMatchCount}`)
console.log(`Match ratio: ${(stats.matchRatio * 100).toFixed(1)}%`)
console.log(`Balanced: ${stats.isBalanced}`) // true if ratio is 40-60%
```

### Balancing Datasets

Imbalanced datasets (e.g., 95% non-matches) can bias the model:

```typescript
import { balanceDataset } from 'have-we-met/ml'

// Undersample majority class
const balancedDataset = balanceDataset(dataset, 42) // seed for reproducibility

const stats = getDatasetStats(balancedDataset)
console.log(
  `After balancing: ${stats.matchCount} matches, ${stats.nonMatchCount} non-matches`
)
```

### Merging Datasets

Combine data from multiple sources:

```typescript
import { mergeTrainingDatasets } from 'have-we-met/ml'

const historicalData = createTrainingDataset(historicalExamples)
const recentReviews = createTrainingDataset(reviewExamples)
const syntheticData = createTrainingDataset(syntheticExamples)

const combinedDataset = mergeTrainingDatasets(
  historicalData,
  recentReviews,
  syntheticData
)
```

## Training Progress

Monitor training in real-time:

```typescript
const trainer = new ModelTrainer({
  featureExtractor,
  config: {
    maxIterations: 1000,
  },
  onProgress: (metrics) => {
    console.log(
      `Iteration ${metrics.iteration}: ` +
        `loss=${metrics.trainingLoss.toFixed(4)}, ` +
        `acc=${(metrics.trainingAccuracy * 100).toFixed(1)}%, ` +
        `val_acc=${((metrics.validationAccuracy ?? 0) * 100).toFixed(1)}%`
    )
  },
  progressInterval: 50, // Report every 50 iterations
})
```

## Reproducibility

Use seeds for reproducible training:

```typescript
const trainer = new ModelTrainer({
  featureExtractor,
  config: {
    seed: 42, // Deterministic weight initialization and data shuffling
  },
})
```

## Exporting Trained Weights

Save weights for deployment:

```typescript
import { exportWeightsToJson } from 'have-we-met/ml'

const weightsJson = exportWeightsToJson(
  result,
  featureExtractor.getFeatureNames(),
  'CustomerMatchingModel-v1'
)

// Save to file
fs.writeFileSync('model-weights.json', weightsJson)
```

## Training from Scratch vs Fine-tuning

### Training from Scratch

When you have sufficient domain-specific data:

```typescript
// Initialize random weights
const trainer = new ModelTrainer({
  featureExtractor: domainSpecificExtractor,
  config: { maxIterations: 2000 },
})

const { classifier } = await trainer.trainClassifier(domainDataset)
```

### Starting from Pre-trained Weights

When you have limited domain data, start from pre-trained:

```typescript
// Load pre-trained model
const pretrained = await createPretrainedClassifier()
const initialWeights = pretrained.exportWeights()

// Create new classifier with same architecture
const classifier = new SimpleClassifier({
  featureExtractor: pretrained.getFeatureExtractor(),
})

// Load pre-trained weights as starting point
await classifier.loadWeights(initialWeights)

// Fine-tune on domain data (lower learning rate)
const trainer = new ModelTrainer({
  featureExtractor: pretrained.getFeatureExtractor(),
  config: {
    learningRate: 0.001, // Lower for fine-tuning
    maxIterations: 500,
  },
})

// Continue training
const { classifier: fineTuned } = await trainer.trainClassifier(domainDataset)
```

## Evaluating Model Quality

### Training Metrics

```typescript
const { result } = await trainer.trainClassifier(dataset)

// Loss: lower is better (0 is perfect)
console.log(`Final training loss: ${result.finalMetrics.trainingLoss}`)
console.log(`Final validation loss: ${result.finalMetrics.validationLoss}`)

// Accuracy: higher is better (1.0 is perfect)
console.log(`Training accuracy: ${result.finalMetrics.trainingAccuracy}`)
console.log(`Validation accuracy: ${result.finalMetrics.validationAccuracy}`)

// Check for overfitting
const overfit =
  result.finalMetrics.trainingAccuracy -
    (result.finalMetrics.validationAccuracy ?? 0) >
  0.1

if (overfit) {
  console.warn('Warning: Model may be overfitting (training >> validation)')
}
```

### Testing on Held-out Data

Always test on data the model hasn't seen:

```typescript
// Hold out 20% for final testing
const testSize = Math.floor(allExamples.length * 0.2)
const testExamples = allExamples.slice(0, testSize)
const trainExamples = allExamples.slice(testSize)

// Train on training set
const { classifier } = await trainer.trainClassifier(
  createTrainingDataset(trainExamples)
)

// Evaluate on test set
let correct = 0
for (const example of testExamples) {
  const prediction = await classifier.predict(example.pair)
  const predictedLabel =
    prediction.classification === 'match' ? 'match' : 'nonMatch'
  if (predictedLabel === example.label) {
    correct++
  }
}

const testAccuracy = correct / testExamples.length
console.log(`Test accuracy: ${(testAccuracy * 100).toFixed(1)}%`)
```

### Confusion Matrix

Understand prediction errors:

```typescript
let truePositive = 0,
  falsePositive = 0
let trueNegative = 0,
  falseNegative = 0

for (const example of testExamples) {
  const prediction = await classifier.predict(example.pair)
  const predicted = prediction.classification === 'match'
  const actual = example.label === 'match'

  if (predicted && actual) truePositive++
  else if (predicted && !actual) falsePositive++
  else if (!predicted && actual) falseNegative++
  else trueNegative++
}

console.log('Confusion Matrix:')
console.log(`  True Positives: ${truePositive}`)
console.log(`  False Positives: ${falsePositive}`)
console.log(`  True Negatives: ${trueNegative}`)
console.log(`  False Negatives: ${falseNegative}`)

const precision = truePositive / (truePositive + falsePositive)
const recall = truePositive / (truePositive + falseNegative)
const f1 = (2 * precision * recall) / (precision + recall)

console.log(`Precision: ${(precision * 100).toFixed(1)}%`)
console.log(`Recall: ${(recall * 100).toFixed(1)}%`)
console.log(`F1 Score: ${(f1 * 100).toFixed(1)}%`)
```

## Common Training Issues

### Model Doesn't Converge

- Decrease `learningRate` (e.g., 0.001)
- Increase `maxIterations`
- Check for data quality issues

### Training Takes Too Long

- Decrease `maxIterations`
- Increase `earlyStoppingPatience`
- Sample a subset of training data

### Poor Validation Accuracy

- Add more training data
- Improve feature engineering
- Balance the dataset
- Increase regularization

### Model Predicts Same Class

- Dataset is severely imbalanced - use `balanceDataset()`
- Features don't distinguish classes - improve feature extraction
- Learning rate too high - decrease it

## Best Practices

1. **Start simple**: Use default configuration first
2. **Monitor validation loss**: It's the best indicator of generalization
3. **Use reproducible seeds**: For debugging and comparison
4. **Balance your data**: Or the model will be biased
5. **Hold out test data**: Final evaluation should be on unseen data
6. **Version your datasets**: Training data changes over time
7. **Log training runs**: Track what worked and what didn't
8. **Iterate on features**: They often matter more than hyperparameters
