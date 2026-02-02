/**
 * Model Training Example
 *
 * This example demonstrates how to train custom ML models from labeled data.
 * Training your own model allows you to capture domain-specific matching
 * patterns that the pre-trained model might not recognize.
 *
 * Topics covered:
 * 1. Creating training data from labeled pairs
 * 2. Configuring the ModelTrainer
 * 3. Training with validation and early stopping
 * 4. Evaluating model performance
 * 5. Exporting trained weights
 * 6. Collecting feedback from the review queue
 */

import {
  ModelTrainer,
  SimpleClassifier,
  FeatureExtractor,
  FeedbackCollector,
  createTrainingDataset,
  createTrainingExample,
  mergeTrainingDatasets,
  balanceDataset,
  getDatasetStats,
  exportWeightsToJson,
} from '../../src/ml'
import type {
  TrainingExample,
  TrainingDataset,
  TrainingConfig,
  RecordPair,
  TrainingMetrics,
} from '../../src/ml'

interface Customer {
  customerId?: string
  firstName: string
  lastName: string
  email: string
  phone?: string
  address?: string
  city?: string
  postalCode?: string
}

function generateSyntheticTrainingData(): {
  matches: Array<{ record1: Customer; record2: Customer }>
  nonMatches: Array<{ record1: Customer; record2: Customer }>
} {
  // Generate synthetic training pairs
  const matches: Array<{ record1: Customer; record2: Customer }> = [
    // Exact duplicates
    {
      record1: {
        firstName: 'John',
        lastName: 'Smith',
        email: 'john.smith@email.com',
        phone: '555-1234',
      },
      record2: {
        firstName: 'John',
        lastName: 'Smith',
        email: 'john.smith@email.com',
        phone: '555-1234',
      },
    },
    // Name variations
    {
      record1: {
        firstName: 'Robert',
        lastName: 'Johnson',
        email: 'bob.johnson@company.com',
      },
      record2: {
        firstName: 'Bob',
        lastName: 'Johnson',
        email: 'bob.johnson@company.com',
      },
    },
    // Typos
    {
      record1: {
        firstName: 'Michael',
        lastName: 'Williams',
        email: 'mwilliams@test.org',
      },
      record2: {
        firstName: 'Micheal',
        lastName: 'Williams',
        email: 'mwilliams@test.org',
      },
    },
    // Different formats
    {
      record1: {
        firstName: 'Sarah',
        lastName: 'Davis',
        email: 'sarah.davis@mail.net',
        phone: '+1-555-567-8901',
      },
      record2: {
        firstName: 'Sarah',
        lastName: 'Davis',
        email: 'sarah.davis@mail.net',
        phone: '5555678901',
      },
    },
    // Address variations
    {
      record1: {
        firstName: 'David',
        lastName: 'Brown',
        email: 'dbrown@example.com',
        address: '123 Main Street',
      },
      record2: {
        firstName: 'David',
        lastName: 'Brown',
        email: 'dbrown@example.com',
        address: '123 Main St',
      },
    },
    // Multiple small differences (still matches)
    {
      record1: {
        firstName: 'Jennifer',
        lastName: 'Taylor',
        email: 'jtaylor@work.com',
        city: 'New York',
      },
      record2: {
        firstName: 'Jenny',
        lastName: 'Taylor',
        email: 'jtaylor@work.com',
        city: 'New York City',
      },
    },
    // Case differences
    {
      record1: {
        firstName: 'JAMES',
        lastName: 'WILSON',
        email: 'jwilson@domain.org',
      },
      record2: {
        firstName: 'James',
        lastName: 'Wilson',
        email: 'JWILSON@DOMAIN.ORG',
      },
    },
    // Middle name omitted
    {
      record1: {
        firstName: 'Mary Elizabeth',
        lastName: 'Anderson',
        email: 'me.anderson@email.com',
      },
      record2: {
        firstName: 'Mary',
        lastName: 'Anderson',
        email: 'me.anderson@email.com',
      },
    },
  ]

  const nonMatches: Array<{ record1: Customer; record2: Customer }> = [
    // Completely different people
    {
      record1: {
        firstName: 'John',
        lastName: 'Smith',
        email: 'john.smith@email.com',
      },
      record2: {
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane.doe@other.com',
      },
    },
    // Same last name, different people
    {
      record1: {
        firstName: 'Robert',
        lastName: 'Johnson',
        email: 'robert.j@mail.com',
      },
      record2: {
        firstName: 'Alice',
        lastName: 'Johnson',
        email: 'alice.johnson@work.net',
      },
    },
    // Similar names, different emails
    {
      record1: {
        firstName: 'Michael',
        lastName: 'Williams',
        email: 'mike.w@company.org',
      },
      record2: {
        firstName: 'Michael',
        lastName: 'Williams',
        email: 'mwill@different.com',
      },
    },
    // Same email domain, different people
    {
      record1: {
        firstName: 'Sarah',
        lastName: 'Davis',
        email: 'sdavis@bigcorp.com',
      },
      record2: {
        firstName: 'Tom',
        lastName: 'Miller',
        email: 'tmiller@bigcorp.com',
      },
    },
    // Similar addresses, different people
    {
      record1: {
        firstName: 'David',
        lastName: 'Brown',
        email: 'david@email.com',
        address: '123 Main Street',
      },
      record2: {
        firstName: 'Peter',
        lastName: 'White',
        email: 'peter@mail.net',
        address: '125 Main Street',
      },
    },
    // Common name collision
    {
      record1: {
        firstName: 'James',
        lastName: 'Smith',
        email: 'james.smith1@gmail.com',
      },
      record2: {
        firstName: 'James',
        lastName: 'Smith',
        email: 'james.smith99@yahoo.com',
      },
    },
    // One field match, rest different
    {
      record1: {
        firstName: 'William',
        lastName: 'Taylor',
        email: 'wt@email.com',
        phone: '555-1111',
      },
      record2: {
        firstName: 'William',
        lastName: 'Jones',
        email: 'wj@other.com',
        phone: '555-2222',
      },
    },
    // Near-miss (very similar but different people)
    {
      record1: {
        firstName: 'Elizabeth',
        lastName: 'Anderson',
        email: 'e.anderson@mail.com',
      },
      record2: {
        firstName: 'Elisabeth',
        lastName: 'Andersen',
        email: 'ea@different.org',
      },
    },
  ]

  return { matches, nonMatches }
}

async function modelTrainingExample() {
  console.log('=== Model Training Example ===\n')

  // Step 1: Generate synthetic training data
  console.log('Step 1: Generating synthetic training data...')
  const { matches, nonMatches } = generateSyntheticTrainingData()

  console.log(`  Match pairs: ${matches.length}`)
  console.log(`  Non-match pairs: ${nonMatches.length}`)
  console.log()

  // Step 2: Convert to training examples
  console.log('Step 2: Converting to training examples...')

  const matchExamples: TrainingExample<Customer>[] = matches.map((pair) =>
    createTrainingExample(
      { record1: pair.record1, record2: pair.record2 },
      'match',
      'synthetic'
    )
  )

  const nonMatchExamples: TrainingExample<Customer>[] = nonMatches.map((pair) =>
    createTrainingExample(
      { record1: pair.record1, record2: pair.record2 },
      'nonMatch',
      'synthetic'
    )
  )

  const allExamples = [...matchExamples, ...nonMatchExamples]
  console.log(`  Total training examples: ${allExamples.length}`)
  console.log()

  // Step 3: Create training dataset
  console.log('Step 3: Creating training dataset...')

  const dataset = createTrainingDataset(allExamples, {
    name: 'Customer Matching Training Set',
    description: 'Synthetic data for customer deduplication',
  })

  const stats = getDatasetStats(dataset)
  console.log('Dataset statistics:')
  console.log(`  Total examples: ${stats.totalExamples}`)
  console.log(`  Matches: ${stats.matchCount}`)
  console.log(`  Non-matches: ${stats.nonMatchCount}`)
  console.log(`  Match ratio: ${(stats.matchRatio * 100).toFixed(1)}%`)
  console.log(`  Is balanced: ${stats.isBalanced}`)
  console.log()

  // Step 4: Create feature extractor
  console.log('Step 4: Creating feature extractor...')

  const featureExtractor = new FeatureExtractor<Customer>({
    fields: [
      {
        field: 'firstName',
        extractors: ['jaroWinkler', 'soundex', 'exact'],
        weight: 1.2,
      },
      {
        field: 'lastName',
        extractors: ['jaroWinkler', 'soundex', 'exact'],
        weight: 1.2,
      },
      { field: 'email', extractors: ['exact', 'levenshtein'], weight: 1.5 },
      { field: 'phone', extractors: ['exact', 'levenshtein'], weight: 1.3 },
      {
        field: 'address',
        extractors: ['jaroWinkler', 'levenshtein'],
        weight: 0.8,
      },
      { field: 'city', extractors: ['jaroWinkler', 'exact'], weight: 0.6 },
      { field: 'postalCode', extractors: ['exact'], weight: 0.7 },
    ],
    normalize: true,
  })

  console.log(`  Feature count: ${featureExtractor.getFeatureCount()}`)
  console.log(
    `  Feature names: ${featureExtractor.getFeatureNames().slice(0, 5).join(', ')}...`
  )
  console.log()

  // Step 5: Configure trainer
  console.log('Step 5: Configuring ModelTrainer...')

  const trainingConfig: Partial<TrainingConfig> = {
    learningRate: 0.1,
    maxIterations: 100,
    regularization: 0.01,
    validationSplit: 0.2,
    earlyStoppingPatience: 10,
    minImprovement: 0.001,
  }

  let lastMetrics: TrainingMetrics | null = null
  const trainer = new ModelTrainer<Customer>({
    config: trainingConfig,
    featureExtractor,
    onProgress: (metrics) => {
      lastMetrics = metrics
      if (metrics.iteration % 20 === 0) {
        console.log(
          `    Iteration ${metrics.iteration}: loss=${metrics.trainingLoss.toFixed(4)}, accuracy=${(metrics.trainingAccuracy * 100).toFixed(1)}%`
        )
      }
    },
    progressInterval: 10,
    seed: 42, // For reproducibility
  })

  console.log('Trainer configuration:')
  console.log(`  Learning rate: ${trainingConfig.learningRate}`)
  console.log(`  Max iterations: ${trainingConfig.maxIterations}`)
  console.log(`  Regularization: ${trainingConfig.regularization}`)
  console.log(`  Validation split: ${trainingConfig.validationSplit}`)
  console.log(
    `  Early stopping patience: ${trainingConfig.earlyStoppingPatience}`
  )
  console.log()

  // Step 6: Train the model
  console.log('Step 6: Training model...')
  const trainingResult = await trainer.train(dataset)

  console.log('\nTraining result:')
  console.log(`  Success: ${trainingResult.success}`)
  console.log(`  Training time: ${trainingResult.trainingTimeMs.toFixed(2)}ms`)
  console.log(`  Early stopped: ${trainingResult.earlyStopped}`)
  console.log(`  Final iteration: ${trainingResult.finalMetrics.iteration}`)
  console.log(
    `  Final training loss: ${trainingResult.finalMetrics.trainingLoss.toFixed(4)}`
  )
  console.log(
    `  Final training accuracy: ${(trainingResult.finalMetrics.trainingAccuracy * 100).toFixed(1)}%`
  )
  if (trainingResult.finalMetrics.validationAccuracy !== undefined) {
    console.log(
      `  Final validation accuracy: ${(trainingResult.finalMetrics.validationAccuracy * 100).toFixed(1)}%`
    )
  }
  console.log()

  // Step 7: Create classifier with trained weights
  console.log('Step 7: Creating classifier with trained weights...')

  const { classifier, result } = await trainer.trainClassifier(dataset)

  if (classifier) {
    console.log(`  Classifier ready: ${classifier.isReady()}`)
    console.log(`  Feature count: ${classifier.getFeatureCount()}`)

    // Show feature importance
    console.log('\n  Top 5 most important features:')
    const importance = classifier.getFeatureImportance().slice(0, 5)
    for (const feat of importance) {
      console.log(`    ${feat.name}: weight=${feat.weight.toFixed(4)}`)
    }
    console.log()

    // Step 8: Test the trained model
    console.log('Step 8: Testing trained model on new data...')

    const testMatch: RecordPair<Customer> = {
      record1: {
        firstName: 'Christopher',
        lastName: 'Lee',
        email: 'chris.lee@email.com',
      },
      record2: {
        firstName: 'Chris',
        lastName: 'Lee',
        email: 'chris.lee@email.com',
      },
    }

    const testNonMatch: RecordPair<Customer> = {
      record1: {
        firstName: 'Christopher',
        lastName: 'Lee',
        email: 'chris.lee@email.com',
      },
      record2: {
        firstName: 'Christopher',
        lastName: 'Wong',
        email: 'cwong@other.org',
      },
    }

    const matchPrediction = await classifier.predict(testMatch)
    const nonMatchPrediction = await classifier.predict(testNonMatch)

    console.log('  Test match pair (Chris/Christopher Lee):')
    console.log(
      `    Probability: ${(matchPrediction.probability * 100).toFixed(1)}%`
    )
    console.log(`    Classification: ${matchPrediction.classification}`)
    console.log()

    console.log('  Test non-match pair (Lee vs Wong):')
    console.log(
      `    Probability: ${(nonMatchPrediction.probability * 100).toFixed(1)}%`
    )
    console.log(`    Classification: ${nonMatchPrediction.classification}`)
    console.log()

    // Step 9: Export trained weights
    console.log('Step 9: Exporting trained weights...')

    const weightsJson = exportWeightsToJson(
      result,
      featureExtractor.getFeatureNames(),
      'CustomerMatcher'
    )

    console.log('Exported weights JSON (truncated):')
    const parsed = JSON.parse(weightsJson)
    console.log(`  modelType: ${parsed.modelType}`)
    console.log(`  version: ${parsed.version}`)
    console.log(`  weights count: ${parsed.weights.length}`)
    console.log(`  bias: ${parsed.bias.toFixed(4)}`)
    console.log(`  trainedAt: ${parsed.extra?.trainedAt}`)
    console.log(`  accuracy: ${parsed.extra?.accuracy?.toFixed(3)}`)
    console.log()
  }

  // Step 10: Using FeedbackCollector
  console.log('Step 10: Using FeedbackCollector for training data...')

  const collector = new FeedbackCollector<Customer>({
    defaultConfidence: 0.8,
    normalizeScores: true,
    maxScore: 100,
  })

  // Simulate adding feedback manually
  collector.addFeedback(
    { record1: matches[0].record1, record2: matches[0].record2 },
    'match',
    'manual',
    { confidence: 0.95, matchScore: 0.85 }
  )

  collector.addFeedback(
    { record1: nonMatches[0].record1, record2: nonMatches[0].record2 },
    'nonMatch',
    'manual',
    { confidence: 0.9, matchScore: 0.25 }
  )

  const feedbackStats = collector.getStats()
  console.log('Feedback collector stats:')
  console.log(`  Total feedback: ${feedbackStats.total}`)
  console.log(`  Matches: ${feedbackStats.byLabel.match}`)
  console.log(`  Non-matches: ${feedbackStats.byLabel.nonMatch}`)
  console.log(
    `  Avg confidence: ${(feedbackStats.avgConfidence * 100).toFixed(1)}%`
  )
  console.log()

  // Export feedback as training dataset
  const feedbackDataset = collector.exportAsTrainingDataset({ balance: true })
  console.log(
    `Exported ${feedbackDataset.examples.length} examples from feedback`
  )
  console.log()

  // Step 11: Merging datasets
  console.log('Step 11: Merging multiple training datasets...')

  const combinedDataset = mergeTrainingDatasets(dataset, feedbackDataset)
  const combinedStats = getDatasetStats(combinedDataset)

  console.log('Combined dataset:')
  console.log(`  Total examples: ${combinedStats.totalExamples}`)
  console.log(`  Match ratio: ${(combinedStats.matchRatio * 100).toFixed(1)}%`)
  console.log()

  // Balance if needed
  if (!combinedStats.isBalanced) {
    console.log('Balancing dataset...')
    const balanced = balanceDataset(combinedDataset, 42)
    const balancedStats = getDatasetStats(balanced)
    console.log(`  After balancing: ${balancedStats.totalExamples} examples`)
    console.log(
      `  Match ratio: ${(balancedStats.matchRatio * 100).toFixed(1)}%`
    )
    console.log(`  Is balanced: ${balancedStats.isBalanced}`)
  }
  console.log()

  console.log('=== Example Complete ===')
  console.log('\nKey takeaways:')
  console.log('- Training requires labeled pairs (match/non-match)')
  console.log('- Feature extraction configuration affects model quality')
  console.log('- Validation split helps detect overfitting')
  console.log('- Early stopping prevents wasted training time')
  console.log('- Trained weights can be exported and reused')
  console.log('- FeedbackCollector integrates with review queue')
}

// Run the example
modelTrainingExample().catch((error) => {
  console.error('Error running example:', error)
  process.exit(1)
})
