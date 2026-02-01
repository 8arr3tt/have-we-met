/**
 * Basic ML Matching Example
 *
 * This example demonstrates how to use the built-in pre-trained ML model
 * for identity matching. The pre-trained model is optimized for common
 * person/customer matching scenarios with fields like name, email, phone, etc.
 *
 * Topics covered:
 * 1. Loading the pre-trained ML classifier
 * 2. Making predictions on record pairs
 * 3. Understanding prediction results (probability, confidence, classification)
 * 4. Using the ML builder API
 * 5. Batch predictions for efficiency
 */

import {
  createPretrainedClassifier,
  SimpleClassifier,
  FeatureExtractor,
  mlBuilder,
  createModelFromConfig,
  MLMatchIntegrator,
  createMLIntegrator,
  formatPrediction,
  getTopFeatures,
} from '../../src/ml'

interface Person {
  firstName: string
  lastName: string
  email?: string
  phone?: string
  dateOfBirth?: string
  address?: string
}

async function basicMLMatchingExample() {
  console.log('=== Basic ML Matching Example ===\n')

  // Step 1: Load the pre-trained classifier
  console.log('Step 1: Loading pre-trained ML classifier...')
  const classifier = await createPretrainedClassifier<Person>()

  console.log(`Model: ${classifier.getMetadata().name}`)
  console.log(`Version: ${classifier.getMetadata().version}`)
  console.log(`Features: ${classifier.getMetadata().featureNames.length}`)
  console.log(`Ready: ${classifier.isReady()}`)
  console.log()

  // Step 2: Define sample records to compare
  console.log('Step 2: Defining sample records...')
  const record1: Person = {
    firstName: 'John',
    lastName: 'Smith',
    email: 'john.smith@example.com',
    phone: '+1-555-123-4567',
    dateOfBirth: '1985-03-15',
    address: '123 Main Street',
  }

  const record2Same: Person = {
    firstName: 'Jon', // Slight typo
    lastName: 'Smith',
    email: 'john.smith@example.com', // Same email
    phone: '555-123-4567', // Same phone, different format
    dateOfBirth: '1985-03-15',
    address: '123 Main St', // Abbreviated
  }

  const record3Different: Person = {
    firstName: 'Jane',
    lastName: 'Doe',
    email: 'jane.doe@company.org',
    phone: '+1-555-987-6543',
    dateOfBirth: '1990-07-22',
    address: '456 Oak Avenue',
  }

  console.log('Record 1:', JSON.stringify(record1))
  console.log('Record 2 (similar):', JSON.stringify(record2Same))
  console.log('Record 3 (different):', JSON.stringify(record3Different))
  console.log()

  // Step 3: Make predictions
  console.log('Step 3: Making ML predictions...\n')

  // Prediction for similar records
  console.log('Comparing Record 1 vs Record 2 (expected: MATCH)...')
  const prediction1 = await classifier.predict({
    record1: record1,
    record2: record2Same,
  })

  console.log(`  Probability: ${(prediction1.probability * 100).toFixed(2)}%`)
  console.log(`  Classification: ${prediction1.classification}`)
  console.log(`  Confidence: ${(prediction1.confidence * 100).toFixed(2)}%`)
  console.log()

  // Show top contributing features
  const topFeatures = getTopFeatures(prediction1.featureImportance, 5)
  console.log('  Top contributing features:')
  for (const feature of topFeatures) {
    console.log(`    - ${feature.name}: ${(feature.importance * 100).toFixed(1)}% importance`)
  }
  console.log()

  // Prediction for different records
  console.log('Comparing Record 1 vs Record 3 (expected: NON-MATCH)...')
  const prediction2 = await classifier.predict({
    record1: record1,
    record2: record3Different,
  })

  console.log(`  Probability: ${(prediction2.probability * 100).toFixed(2)}%`)
  console.log(`  Classification: ${prediction2.classification}`)
  console.log(`  Confidence: ${(prediction2.confidence * 100).toFixed(2)}%`)
  console.log()

  // Step 4: Use formatted output
  console.log('Step 4: Formatted prediction output...')
  console.log('Similar records:', formatPrediction(prediction1))
  console.log('Different records:', formatPrediction(prediction2))
  console.log()

  // Step 5: Batch predictions
  console.log('Step 5: Batch predictions for efficiency...')
  const pairs = [
    { record1: record1, record2: record2Same },
    { record1: record1, record2: record3Different },
    { record1: record2Same, record2: record3Different },
  ]

  const batchResults = await classifier.predictBatch(pairs)
  console.log(`Processed ${batchResults.length} pairs:`)
  for (let i = 0; i < batchResults.length; i++) {
    const result = batchResults[i]
    console.log(
      `  Pair ${i + 1}: ${result.prediction.classification} (${(result.prediction.probability * 100).toFixed(1)}%)`
    )
  }
  console.log()

  // Step 6: Using the ML Builder API
  console.log('Step 6: Using the ML Builder API...')
  const mlConfig = mlBuilder<Person>()
    .usePretrained()
    .mode('mlOnly')
    .matchThreshold(0.7)
    .nonMatchThreshold(0.3)
    .build()

  console.log('Builder configuration:')
  console.log(`  Use pretrained: ${mlConfig.usePretrained}`)
  console.log(`  Mode: ${mlConfig.integrationConfig.mode}`)
  console.log(`  Match threshold: ${mlConfig.modelConfig?.matchThreshold}`)
  console.log()

  // Create model from config
  const modelFromConfig = await createModelFromConfig<Person>(mlConfig)
  console.log(`Model ready: ${modelFromConfig.isReady()}`)
  console.log()

  // Step 7: Using ML Match Integrator
  console.log('Step 7: Using ML Match Integrator...')
  const integrator = createMLIntegrator<Person>(classifier, {
    mode: 'mlOnly',
    applyTo: 'all',
    timeoutMs: 5000,
    fallbackOnError: true,
  })

  console.log('Integrator configuration:')
  console.log(`  Mode: ${integrator.getConfig().mode}`)
  console.log(`  Apply to: ${integrator.getConfig().applyTo}`)
  console.log(`  Timeout: ${integrator.getConfig().timeoutMs}ms`)
  console.log()

  // Step 8: Feature extraction
  console.log('Step 8: Examining feature extraction...')
  const features = classifier.extractFeatures({
    record1: record1,
    record2: record2Same,
  })

  console.log(`Feature count: ${features.values.length}`)
  console.log('Feature values (first 10):')
  for (let i = 0; i < Math.min(10, features.names.length); i++) {
    console.log(`  ${features.names[i]}: ${features.values[i].toFixed(4)}`)
  }
  console.log()

  // Step 9: Model introspection
  console.log('Step 9: Model introspection...')
  const importance = classifier.getFeatureImportance()
  console.log('Top 5 most important features (by weight magnitude):')
  for (let i = 0; i < Math.min(5, importance.length); i++) {
    const feat = importance[i]
    console.log(`  ${feat.name}: weight=${feat.weight.toFixed(4)}, importance=${feat.importance.toFixed(4)}`)
  }
  console.log()

  console.log('=== Example Complete ===')
  console.log('\nKey takeaways:')
  console.log('- The pre-trained model is ready to use out of the box')
  console.log('- Predictions include probability, classification, and confidence')
  console.log('- Feature importance helps explain why a prediction was made')
  console.log('- Batch predictions are more efficient for multiple pairs')
  console.log('- The ML Builder API provides a fluent configuration interface')
}

// Run the example
basicMLMatchingExample().catch((error) => {
  console.error('Error running example:', error)
  process.exit(1)
})
