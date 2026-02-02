/**
 * ML Matching Example
 *
 * This example demonstrates how to use machine learning-based matching in
 * have-we-met. ML matching complements traditional probabilistic matching by:
 * - Learning patterns from historical match decisions
 * - Handling complex, non-linear relationships between fields
 * - Improving accuracy over time with feedback loops
 *
 * The library includes a pre-trained model for person/customer matching and
 * supports training custom models for domain-specific use cases.
 */

import { HaveWeMet } from '../src/index.js'

interface Person {
  id?: string
  firstName: string
  lastName: string
  email: string
  phone?: string
  dateOfBirth: string
  address?: string
}

// Sample records for demonstration
const existingRecords: Person[] = [
  {
    id: '1',
    firstName: 'Jennifer',
    lastName: 'Smith',
    email: 'jennifer.smith@example.com',
    phone: '+1-555-0100',
    dateOfBirth: '1988-06-12',
    address: '123 Main St, Boston, MA',
  },
  {
    id: '2',
    firstName: 'Michael',
    lastName: 'Johnson',
    email: 'mike.j@example.com',
    phone: '+1-555-0200',
    dateOfBirth: '1975-11-30',
    address: '456 Oak Ave, Seattle, WA',
  },
  {
    id: '3',
    firstName: 'Sarah',
    lastName: 'Williams',
    email: 'sarah.w@example.com',
    dateOfBirth: '1992-03-25',
    address: '789 Pine Rd, Austin, TX',
  },
]

console.log('=== ML Matching Example ===\n')

// ============================================================================
// Example 1: Hybrid Mode (Recommended)
// ============================================================================
// Combines ML predictions with probabilistic scoring for best results

console.log('Example 1: Hybrid Mode (ML + Probabilistic)\n')

const hybridResolver = HaveWeMet.create<Person>()
  .schema((schema) =>
    schema
      .field('firstName', { type: 'name', component: 'first' })
      .field('lastName', { type: 'name', component: 'last' })
      .field('email', { type: 'email' })
      .field('phone', { type: 'phone' })
      .field('dateOfBirth', { type: 'date' })
      .field('address', { type: 'string' })
  )
  .blocking((block) => block.onField('lastName', { transform: 'soundex' }))
  .matching((match) =>
    match
      .field('email')
      .strategy('exact')
      .weight(20)
      .field('phone')
      .strategy('exact')
      .weight(15)
      .field('firstName')
      .strategy('jaro-winkler')
      .weight(10)
      .threshold(0.85)
      .field('lastName')
      .strategy('jaro-winkler')
      .weight(10)
      .threshold(0.85)
      .field('dateOfBirth')
      .strategy('exact')
      .weight(10)
      .thresholds({ noMatch: 25, definiteMatch: 50 })
  )
  // Add ML in hybrid mode - combines both approaches
  .ml(
    (ml) =>
      ml
        .usePretrained() // Use built-in pre-trained model
        .mode('hybrid') // Combine ML with probabilistic scoring
        .mlWeight(0.4) // 40% ML prediction, 60% probabilistic score
  )
  .build()

// Test hybrid matching
const testRecord: Person = {
  firstName: 'Jenny', // Nickname for Jennifer
  lastName: 'Smith',
  email: 'jenny.smith@example.com', // Different email
  phone: '+1-555-0100', // Same phone
  dateOfBirth: '1988-06-12',
  address: '123 Main Street, Boston, MA', // Slight variation
}

const hybridResults = hybridResolver.resolve(testRecord, existingRecords)

console.log('Test Record: Jenny Smith, jenny.smith@example.com')
console.log('\nMatch Results:')
hybridResults.forEach((result, index) => {
  if (result.outcome !== 'no-match') {
    console.log(
      `\nCandidate ${index + 1}: ${result.record.firstName} ${result.record.lastName}`
    )
    console.log(`  Outcome: ${result.outcome}`)
    console.log(`  Final Score: ${result.score.totalScore}`)
    console.log(`  Probabilistic Score: ${result.score.probabilisticScore}`)
    console.log(
      `  ML Prediction: ${result.mlPrediction?.probability.toFixed(3)} (${result.mlPrediction?.classification})`
    )
    console.log(`  ML Confidence: ${result.mlPrediction?.confidence}`)
    console.log('  Top Contributing Features:')
    result.mlPrediction?.featureImportance.slice(0, 3).forEach((feature) => {
      console.log(`    - ${feature.feature}: ${feature.importance.toFixed(3)}`)
    })
  }
})

console.log('\n' + '='.repeat(70) + '\n')

// ============================================================================
// Example 2: ML-Only Mode
// ============================================================================
// Use ML predictions exclusively (useful when probabilistic rules are insufficient)

console.log('Example 2: ML-Only Mode\n')

const mlOnlyResolver = HaveWeMet.create<Person>()
  .schema((schema) =>
    schema
      .field('firstName', { type: 'name', component: 'first' })
      .field('lastName', { type: 'name', component: 'last' })
      .field('email', { type: 'email' })
      .field('phone', { type: 'phone' })
      .field('dateOfBirth', { type: 'date' })
  )
  .blocking((block) => block.onField('lastName', { transform: 'soundex' }))
  .ml((ml) =>
    ml
      .usePretrained()
      .mode('mlOnly') // Use only ML predictions
      .mlThresholds({
        noMatch: 0.3, // Below 30% probability: no match
        definiteMatch: 0.75, // Above 75% probability: definite match
      })
  )
  .build()

const mlOnlyResults = mlOnlyResolver.resolve(testRecord, existingRecords)

console.log('Test Record: Jenny Smith (same as Example 1)')
console.log('\nML-Only Match Results:')
mlOnlyResults.forEach((result, index) => {
  if (result.outcome !== 'no-match') {
    console.log(
      `\nCandidate ${index + 1}: ${result.record.firstName} ${result.record.lastName}`
    )
    console.log(`  Outcome: ${result.outcome}`)
    console.log(
      `  ML Probability: ${result.mlPrediction?.probability.toFixed(3)}`
    )
    console.log(`  ML Classification: ${result.mlPrediction?.classification}`)
  }
})

console.log('\n' + '='.repeat(70) + '\n')

// ============================================================================
// Example 3: Custom Feature Extraction
// ============================================================================
// Configure which features the ML model should use

console.log('Example 3: Custom Feature Configuration\n')

const customFeaturesResolver = HaveWeMet.create<Person>()
  .schema((schema) =>
    schema
      .field('firstName', { type: 'name', component: 'first' })
      .field('lastName', { type: 'name', component: 'last' })
      .field('email', { type: 'email' })
      .field('phone', { type: 'phone' })
      .field('dateOfBirth', { type: 'date' })
  )
  .blocking((block) => block.onField('lastName', { transform: 'soundex' }))
  .matching((match) =>
    match
      .field('email')
      .strategy('exact')
      .weight(20)
      .thresholds({ noMatch: 0, definiteMatch: 100 })
  )
  .ml((ml) =>
    ml
      .usePretrained()
      .mode('hybrid')
      .mlWeight(0.5)
      // Configure field-specific features
      .field('firstName')
      .features(['jaroWinkler', 'levenshtein', 'exact'])
      .field('lastName')
      .features(['jaroWinkler', 'soundex'])
      .field('email')
      .features(['exact', 'levenshtein'])
      .field('phone')
      .features(['exact'])
      .field('dateOfBirth')
      .features(['exact', 'yearMatch'])
  )
  .build()

console.log('Configured Features:')
console.log('  firstName: jaroWinkler, levenshtein, exact')
console.log('  lastName: jaroWinkler, soundex')
console.log('  email: exact, levenshtein')
console.log('  phone: exact')
console.log('  dateOfBirth: exact, yearMatch')
console.log('\nML model will use these features to make predictions.')

console.log('\n' + '='.repeat(70) + '\n')

// ============================================================================
// Example 4: Training Custom Models (Conceptual)
// ============================================================================

console.log('Example 4: Training Custom Models\n')
console.log('To train a custom ML model from your review queue decisions:\n')

console.log('```typescript')
console.log("import { FeedbackCollector, ModelTrainer } from 'have-we-met/ml'")
console.log()
console.log('// 1. Collect feedback from review queue decisions')
console.log('const collector = new FeedbackCollector<Person>()')
console.log()
console.log('// Get decided queue items from your resolver')
console.log('const decidedItems = await resolver.queue.list({')
console.log("  status: 'confirmed', // or 'rejected'")
console.log('  limit: 1000,')
console.log('})')
console.log()
console.log('// Convert to training data')
console.log('collector.collectFromQueueItems(decidedItems)')
console.log()
console.log('// 2. Train a new model')
console.log('const trainer = new ModelTrainer({')
console.log('  featureExtractor, // Your feature configuration')
console.log('  learningRate: 0.01,')
console.log('  regularization: 0.01,')
console.log('  maxIterations: 1000,')
console.log('})')
console.log()
console.log(
  'const { classifier: customModel } = await trainer.trainClassifier('
)
console.log('  collector.exportAsTrainingDataset()')
console.log(')')
console.log()
console.log('// 3. Use custom model')
console.log('const resolver = HaveWeMet.create<Person>()')
console.log('  .schema((schema) => /* ... */)')
console.log('  .matching((match) => /* ... */)')
console.log("  .ml((ml) => ml.useModel(customModel).mode('hybrid'))")
console.log('  .build()')
console.log('```')

console.log('\n' + '='.repeat(70) + '\n')

// ============================================================================
// Comparison and Recommendations
// ============================================================================

console.log('=== When to Use Each Mode ===\n')

console.log('Hybrid Mode (Recommended for most cases):')
console.log('  ✓ Best accuracy by combining rule-based and ML approaches')
console.log('  ✓ ML helps with edge cases where rules struggle')
console.log('  ✓ Probabilistic rules provide explainability')
console.log('  Use when: You want the best of both worlds')
console.log()

console.log('ML-Only Mode:')
console.log('  ✓ Useful when rules are hard to define')
console.log('  ✓ Can capture complex, non-linear patterns')
console.log('  ✓ Less explainable than rule-based approaches')
console.log('  Use when: Your data has complex patterns that rules miss')
console.log()

console.log('Fallback Mode:')
console.log('  ✓ Use probabilistic rules first, ML only for ambiguous cases')
console.log('  ✓ Faster (ML only runs when needed)')
console.log('  ✓ Good for production with strict latency requirements')
console.log(
  '  Use when: Performance is critical and most matches are clear-cut'
)
console.log()

console.log('Pre-trained vs Custom Models:')
console.log('  • Pre-trained: Works out-of-box for person/customer data')
console.log(
  '  • Custom: Train on your domain-specific data for better accuracy'
)
console.log(
  '  • Recommendation: Start with pre-trained, train custom after collecting'
)
console.log('    100+ human decisions from your review queue')
console.log()

console.log('=== Performance Characteristics ===\n')
console.log('  ML Prediction Time: <10ms per comparison')
console.log('  Memory Overhead: ~1-5MB for pre-trained model')
console.log('  Training Time: 10-60 seconds for 1000 examples')
console.log('  Model Size: ~100KB for pre-trained model')
