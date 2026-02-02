# Feedback Loop

The feedback loop collects human review decisions and converts them into training data, enabling continuous model improvement over time.

## Overview

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Records   │────▶│  ML Model   │────▶│  Potential  │
└─────────────┘     └─────────────┘     │   Matches   │
                          ▲              └──────┬──────┘
                          │                     │
                    ┌─────┴─────┐               ▼
                    │  Retrain  │         ┌─────────────┐
                    │   Model   │         │   Review    │
                    └─────┬─────┘         │    Queue    │
                          │               └──────┬──────┘
                          │                     │
                    ┌─────┴─────┐               ▼
                    │  Training │         ┌─────────────┐
                    │   Data    │◀────────│   Human     │
                    └───────────┘         │  Decisions  │
                                          └─────────────┘
```

Human reviewers confirm or reject potential matches, which become labeled training examples. The model can then be retrained to learn from these decisions.

## Collecting Feedback

### From Review Queue

The `FeedbackCollector` integrates with the review queue:

```typescript
import { FeedbackCollector, createFeedbackCollector } from 'have-we-met/ml'

// Create a collector
const collector = createFeedbackCollector<Person>()

// Collect feedback from decided queue items
const decidedItems = await queue.list({ status: 'confirmed' })
const feedbackItems = collector.collectFromQueueItems(decidedItems)

console.log(`Collected ${feedbackItems.length} feedback items`)
```

### From Individual Decisions

Process queue items one at a time:

```typescript
// After a queue decision is made
const queueItem = await queue.get(itemId)
const feedback = collector.collectFromQueueItem(queueItem)

if (feedback) {
  console.log(`Label: ${feedback.label}`)
  console.log(`Source: ${feedback.source}`)
  console.log(`Quality confidence: ${feedback.quality.confidence}`)
}
```

### Manual Labeling

Add labels directly without going through the queue:

```typescript
// Add a known match
collector.addFeedback(
  { record1: customerA, record2: customerB },
  'match',
  'manual',
  { confidence: 0.95, isExpert: true }
)

// Add a known non-match
collector.addFeedback(
  { record1: customerA, record2: differentPerson },
  'nonMatch',
  'manual',
  { confidence: 0.99, isExpert: true }
)
```

### Importing Historical Data

Load existing labeled pairs:

```typescript
// Import from your labeled dataset
const labeledPairs = [
  { record1: rec1, record2: rec2, label: 'match' as const, confidence: 0.9 },
  {
    record1: rec1,
    record2: rec3,
    label: 'nonMatch' as const,
    confidence: 0.95,
  },
  // ...
]

const imported = collector.importFeedback(labeledPairs)
console.log(`Imported ${imported.length} examples`)
```

## Feedback Quality

Not all feedback is equal. The collector tracks quality metrics:

```typescript
interface FeedbackQuality {
  confidence: number // Reviewer's confidence (0-1)
  matchScore: number // Original match score from resolution
  decisionTimeMs?: number // Time spent on the decision
  isExpert?: boolean // Whether reviewer is a domain expert
  reviewIteration?: number // Number of times this pair was reviewed
}
```

### Filtering by Quality

Filter out low-quality feedback before training:

```typescript
const highQualityFeedback = collector.getFeedback({
  minConfidence: 0.8, // High confidence decisions only
  minDecisionTimeMs: 5000, // Spent at least 5 seconds
  expertOnly: true, // Expert reviewers only
  sources: ['queue-confirm', 'queue-reject'], // Queue decisions only
})
```

### Available Filters

| Filter                            | Description                                |
| --------------------------------- | ------------------------------------------ |
| `minConfidence`                   | Minimum confidence score                   |
| `minMatchScore` / `maxMatchScore` | Original match score range                 |
| `sources`                         | Specific feedback sources                  |
| `label`                           | Only matches or non-matches                |
| `expertOnly`                      | Only expert decisions                      |
| `minDecisionTimeMs`               | Filter quick (possibly careless) decisions |
| `since` / `until`                 | Date range                                 |
| `limit`                           | Maximum items to return                    |

## Exporting Training Data

### As Training Dataset

```typescript
import { TrainingDataset } from 'have-we-met/ml'

// Export with quality filters
const trainingDataset = collector.exportAsTrainingDataset({
  filter: {
    minConfidence: 0.75,
    minDecisionTimeMs: 3000,
  },
  balance: true, // Balance match/non-match ratio
  seed: 42, // Reproducible balancing
})

console.log(`Training examples: ${trainingDataset.examples.length}`)
console.log(`Matches: ${trainingDataset.metadata?.matchCount}`)
console.log(`Non-matches: ${trainingDataset.metadata?.nonMatchCount}`)
```

### As Training Examples

Get raw examples without dataset wrapper:

```typescript
const examples = collector.exportAsTrainingExamples({
  filter: { minConfidence: 0.8 },
})
```

## Feedback Statistics

Monitor your feedback collection:

```typescript
const stats = collector.getStats()

console.log('Feedback Statistics:')
console.log(`  Total: ${stats.total}`)
console.log(`  Matches: ${stats.byLabel.match}`)
console.log(`  Non-matches: ${stats.byLabel.nonMatch}`)
console.log(`  Match ratio: ${(stats.matchRatio * 100).toFixed(1)}%`)
console.log(`  Balanced: ${stats.isBalanced}`)
console.log(`  Average confidence: ${(stats.avgConfidence * 100).toFixed(1)}%`)

console.log('\nBy source:')
for (const [source, count] of Object.entries(stats.bySource)) {
  if (count > 0) {
    console.log(`  ${source}: ${count}`)
  }
}

console.log(`\nDate range: ${stats.oldestFeedback} to ${stats.newestFeedback}`)
```

## Training from Feedback

### Full Workflow

```typescript
import {
  FeedbackCollector,
  ModelTrainer,
  FeatureExtractor,
  SimpleClassifier,
} from 'have-we-met/ml'

// 1. Collect feedback over time
const collector = new FeedbackCollector<Person>()

// Process queue decisions as they come in
const decidedItems = await queue.list({
  status: ['confirmed', 'rejected'],
  since: lastTrainingDate,
})
collector.collectFromQueueItems(decidedItems)

// 2. Check if we have enough data
const stats = collector.getStats()
if (stats.total < 500) {
  console.log('Need more feedback before retraining')
  return
}

if (!stats.isBalanced) {
  console.log('Warning: Dataset is imbalanced, will balance during export')
}

// 3. Export as training data
const dataset = collector.exportAsTrainingDataset({
  filter: {
    minConfidence: 0.75,
  },
  balance: true,
  seed: Date.now(),
})

// 4. Train new model
const featureExtractor = FeatureExtractor.forPersonMatching<Person>()
const trainer = new ModelTrainer<Person>({
  featureExtractor,
  config: {
    validationSplit: 0.2,
    earlyStoppingPatience: 15,
  },
})

const { classifier, result } = await trainer.trainClassifier(dataset)

// 5. Evaluate improvement
if (result.success) {
  const accuracy =
    result.finalMetrics.validationAccuracy ??
    result.finalMetrics.trainingAccuracy
  console.log(`New model accuracy: ${(accuracy * 100).toFixed(1)}%`)

  // Compare with existing model
  if (accuracy > currentModelAccuracy + 0.02) {
    // At least 2% improvement
    console.log('New model is better, deploying...')
    await deployModel(classifier)
  } else {
    console.log('New model not significantly better, keeping current')
  }
}
```

### Incremental Updates

Add to existing training data:

```typescript
import { mergeTrainingDatasets } from 'have-we-met/ml'

// Load existing training data
const existingDataset = loadTrainingDataset('training-data-v1.json')

// Get new feedback
const newFeedback = collector.exportAsTrainingDataset({
  filter: { since: lastUpdateDate },
})

// Merge datasets
const combinedDataset = mergeTrainingDatasets(existingDataset, newFeedback)

// Retrain on combined data
const { classifier } = await trainer.trainClassifier(combinedDataset)
```

## Feedback Sources

The collector tracks where feedback came from:

| Source          | Description                        |
| --------------- | ---------------------------------- |
| `queue-confirm` | Match confirmed in review queue    |
| `queue-reject`  | Match rejected in review queue     |
| `queue-merge`   | Records merged from review queue   |
| `manual`        | Directly added via `addFeedback()` |
| `synthetic`     | Programmatically generated         |
| `import`        | Imported from external data        |

Use sources to weight training data:

```typescript
// Trust queue decisions more than synthetic data
const qualityWeightedExamples = collector.getFeedback().map((f) => ({
  ...f,
  weight: f.source.startsWith('queue-') ? 1.0 : 0.5,
}))
```

## Converting Queue Decisions

Utility functions for quick conversions:

```typescript
import {
  queueDecisionToTrainingExample,
  queueDecisionsToTrainingExamples,
} from 'have-we-met/ml'

// Single conversion
const example = queueDecisionToTrainingExample(queueItem)

// Batch conversion
const examples = queueDecisionsToTrainingExamples(queueItems)
```

## Best Practices

### 1. Collect Continuously

Don't wait to start collecting:

```typescript
// Set up automatic collection after queue decisions
queue.onDecision((queueItem) => {
  collector.collectFromQueueItem(queueItem)
  persistCollector(collector) // Save to database
})
```

### 2. Filter Low-Quality Feedback

Fast decisions may be mistakes:

```typescript
const goodFeedback = collector.exportAsTrainingDataset({
  filter: {
    minDecisionTimeMs: 5000, // At least 5 seconds
    minConfidence: 0.7,
  },
})
```

### 3. Monitor Balance

Imbalanced data biases the model:

```typescript
const stats = collector.getStats()
if (stats.matchRatio < 0.3 || stats.matchRatio > 0.7) {
  console.warn('Dataset is significantly imbalanced')
}
```

### 4. Version Everything

Track what data trained which model:

```typescript
// Save dataset version with model
const modelVersion = {
  trainedAt: new Date(),
  feedbackCount: stats.total,
  oldestFeedback: stats.oldestFeedback,
  newestFeedback: stats.newestFeedback,
  accuracy: result.finalMetrics.validationAccuracy,
}
```

### 5. Handle Edge Cases

The collector tracks edge case decisions:

```typescript
// Get uncertain cases that were decided
const edgeCases = collector.getFeedback({
  minMatchScore: 0.4, // Original score was uncertain
  maxMatchScore: 0.6,
})

// These are valuable training examples!
console.log(`Edge cases collected: ${edgeCases.length}`)
```

### 6. Periodic Retraining

Set up a retraining schedule:

```typescript
async function weeklyRetrain() {
  const stats = collector.getStats({
    since: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last week
  })

  if (stats.total >= 100) {
    console.log(`Retraining with ${stats.total} new examples`)
    await trainAndDeploy()
  } else {
    console.log(`Only ${stats.total} new examples, skipping retrain`)
  }
}
```

## Feedback Storage

The collector stores feedback in memory. For production, persist to your database:

```typescript
// Serialize feedback
const feedbackJson = JSON.stringify(collector.getFeedback())

// Save to database
await db.save('ml_feedback', feedbackJson)

// Restore later
const savedFeedback = await db.load('ml_feedback')
const collector = createFeedbackCollector()
for (const item of JSON.parse(savedFeedback)) {
  collector.addFeedback(item.pair, item.label, item.source, item.quality)
}
```
