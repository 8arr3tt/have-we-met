# ML Matching Overview

Machine learning provides a complementary approach to deterministic and probabilistic matching. While rule-based systems offer transparency and predictability, ML models can learn complex patterns from data that may be difficult to encode manually.

## When to Use ML Matching

**ML matching is beneficial when:**

- You have labeled training data from historical matches
- Field relationships are complex (e.g., nickname variations, address formats)
- Human reviewers have made many decisions you want to learn from
- Probabilistic rules alone miss patterns that humans recognize

**Stick with probabilistic matching when:**

- You need complete transparency for compliance/audit requirements
- Training data is limited or unreliable
- The matching criteria are well-defined and stable
- Performance is critical (ML adds latency)

## Integration Modes

ML matching supports three integration modes:

### Hybrid Mode (Recommended)

Combines ML predictions with probabilistic scores using configurable weights:

```
finalScore = (1 - mlWeight) × probabilisticScore + mlWeight × mlScore
```

This provides the best of both approaches: rule-based interpretability with ML pattern recognition.

```typescript
.ml(ml => ml
  .usePretrained()
  .mode('hybrid')
  .mlWeight(0.4)  // 40% ML, 60% probabilistic
)
```

### ML-Only Mode

Uses ML predictions exclusively. Best when you have high confidence in your trained model and want to maximize ML's pattern recognition capabilities.

```typescript
.ml(ml => ml
  .model(customTrainedModel)
  .mode('mlOnly')
)
```

### Fallback Mode

Uses ML only for uncertain probabilistic results (potential matches). This minimizes ML computation while getting help on the hardest cases.

```typescript
.ml(ml => ml
  .usePretrained()
  .mode('fallback')
  .applyTo('uncertainOnly')
)
```

## Pre-trained vs Custom Models

### Pre-trained Model

The library ships with a pre-trained model optimized for common person/customer matching:

- **Fields:** firstName, lastName, email, phone, dateOfBirth, address, ssn
- **Size:** < 50KB (suitable for npm distribution)
- **Accuracy:** > 85% on test data
- **Latency:** < 10ms per prediction

```typescript
import { createPretrainedClassifier } from 'have-we-met/ml'

const classifier = await createPretrainedClassifier()
```

### Custom Models

Train your own models for domain-specific matching:

```typescript
import { ModelTrainer, FeedbackCollector } from 'have-we-met/ml'

// Collect labeled data from human review decisions
const collector = new FeedbackCollector()
collector.collectFromQueueItems(decidedQueueItems)

// Train a custom model
const trainer = new ModelTrainer({ featureExtractor })
const { classifier } = await trainer.trainClassifier(
  collector.exportAsTrainingDataset()
)
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    ML Matching System                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │   Feature    │    │  ML Model    │    │  Integrator  │  │
│  │  Extractor   │ → │ (Classifier) │ → │   (Combine)  │  │
│  └──────────────┘    └──────────────┘    └──────────────┘  │
│         ↑                   ↑                   │           │
│         │                   │                   ↓           │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │   Record     │    │   Weights    │    │   Match      │  │
│  │    Pair      │    │   (JSON)     │    │   Result     │  │
│  └──────────────┘    └──────────────┘    └──────────────┘  │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│                    Training System                           │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │   Feedback   │    │   Model      │    │   Trained    │  │
│  │  Collector   │ → │   Trainer    │ → │   Weights    │  │
│  └──────────────┘    └──────────────┘    └──────────────┘  │
│         ↑                                                    │
│         │                                                    │
│  ┌──────────────┐                                           │
│  │   Review     │                                           │
│  │   Queue      │                                           │
│  └──────────────┘                                           │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Key Concepts

### Feature Extraction

Record pairs are converted to numerical feature vectors for ML processing:

```typescript
const features = extractor.extract({
  record1: { firstName: 'John', email: 'john@example.com' },
  record2: { firstName: 'Jon', email: 'john@example.com' }
})

// features.values: [0.91, 1.0, 0.95, 1.0, ...]
// features.names: ['firstName_jaroWinkler', 'email_exact', ...]
```

Built-in extractors include:
- **String similarity:** jaroWinkler, levenshtein, soundex, metaphone, exact
- **Numeric:** numericDiff
- **Temporal:** dateDiff
- **Indicator:** missing

### Predictions

The classifier outputs:
- **probability:** Match probability (0-1)
- **classification:** match, nonMatch, or uncertain
- **confidence:** How certain the model is (0-1)
- **featureImportance:** Which features contributed most

### Training

The ModelTrainer uses gradient descent to learn weights:
- L2 regularization prevents overfitting
- Early stopping avoids overtraining
- Validation split monitors generalization

## Performance

| Operation | Typical Latency |
|-----------|-----------------|
| Single prediction | < 1ms |
| Batch prediction (100 pairs) | < 10ms |
| Feature extraction | < 0.5ms |
| Training (1000 examples) | < 2s |

## Next Steps

- [Getting Started](getting-started.md) - Quick start guide
- [Feature Extraction](feature-extraction.md) - Configure feature extractors
- [Custom Models](custom-models.md) - Train your own models
- [Training Guide](training.md) - Model training best practices
- [Feedback Loop](feedback-loop.md) - Learn from human decisions
