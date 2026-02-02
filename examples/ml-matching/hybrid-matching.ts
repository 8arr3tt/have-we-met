/**
 * Hybrid Matching Example
 *
 * This example demonstrates how to combine ML predictions with probabilistic
 * matching for robust identity resolution. Hybrid mode leverages the strengths
 * of both approaches: rule-based transparency and ML pattern recognition.
 *
 * Topics covered:
 * 1. Configuring hybrid mode with different weights
 * 2. Understanding score combination
 * 3. Using ML for uncertain cases (fallback mode)
 * 4. Comparing outcomes across different modes
 * 5. Performance considerations
 */

import {
  createPretrainedClassifier,
  MLMatchIntegrator,
  createMLIntegrator,
  mlBuilder,
  createModelFromConfig,
} from '../../src/ml'
import type { MLMatchResult, MLMatchOptions } from '../../src/ml'
import type {
  MatchResult,
  MatchScore,
  MatchOutcome,
  FieldScore,
} from '../../src/core/scoring/types'

interface Person {
  firstName: string
  lastName: string
  email?: string
  phone?: string
  dateOfBirth?: string
  address?: string
}

function createMockProbabilisticResult<T>(
  candidateRecord: T,
  totalScore: number,
  maxScore: number = 100
): MatchResult<T> {
  const normalizedScore = totalScore / maxScore
  let outcome: MatchOutcome

  if (normalizedScore >= 0.65) {
    outcome = 'definite-match'
  } else if (normalizedScore < 0.3) {
    outcome = 'no-match'
  } else {
    outcome = 'potential-match'
  }

  return {
    outcome,
    candidateRecord,
    score: {
      totalScore,
      maxPossibleScore: maxScore,
      normalizedScore,
      fieldScores: [],
    },
    explanation: `Score: ${totalScore}/${maxScore} (${(normalizedScore * 100).toFixed(1)}%)`,
  }
}

async function hybridMatchingExample() {
  console.log('=== Hybrid Matching Example ===\n')

  // Load the pre-trained classifier
  console.log('Loading pre-trained classifier...')
  const classifier = await createPretrainedClassifier<Person>()
  console.log('Classifier ready!\n')

  // Define test records
  const record1: Person = {
    firstName: 'Michael',
    lastName: 'Williams',
    email: 'mike.williams@email.com',
    phone: '555-234-5678',
    dateOfBirth: '1982-09-20',
    address: '789 Pine Road',
  }

  const record2Similar: Person = {
    firstName: 'Mike', // Nickname
    lastName: 'Williams',
    email: 'mike.williams@email.com', // Same
    phone: '5552345678', // Same, no dashes
    dateOfBirth: '1982-09-20',
    address: '789 Pine Rd', // Abbreviated
  }

  const record3Uncertain: Person = {
    firstName: 'Michael',
    lastName: 'Williams',
    email: 'michael.w@different.org', // Different email
    phone: '555-999-8888', // Different phone
    dateOfBirth: '1982-09-20', // Same DOB
    address: '123 Other Street', // Different address
  }

  console.log('Test Records:')
  console.log('Record 1:', JSON.stringify(record1))
  console.log('Record 2 (similar):', JSON.stringify(record2Similar))
  console.log('Record 3 (uncertain):', JSON.stringify(record3Uncertain))
  console.log()

  // Step 1: Create integrators with different modes
  console.log('Step 1: Creating integrators with different modes...\n')

  const hybridIntegrator = createMLIntegrator(classifier, {
    mode: 'hybrid',
    mlWeight: 0.4, // 40% ML, 60% probabilistic
    applyTo: 'all',
    fallbackOnError: true,
  })

  const mlOnlyIntegrator = createMLIntegrator(classifier, {
    mode: 'mlOnly',
    applyTo: 'all',
    fallbackOnError: true,
  })

  const fallbackIntegrator = createMLIntegrator(classifier, {
    mode: 'fallback',
    applyTo: 'uncertainOnly',
    fallbackOnError: true,
  })

  console.log('Integrators configured:')
  console.log(
    `  Hybrid: mode=${hybridIntegrator.getConfig().mode}, mlWeight=${hybridIntegrator.getConfig().mlWeight}`
  )
  console.log(`  ML-Only: mode=${mlOnlyIntegrator.getConfig().mode}`)
  console.log(
    `  Fallback: mode=${fallbackIntegrator.getConfig().mode}, applyTo=${fallbackIntegrator.getConfig().applyTo}`
  )
  console.log()

  // Step 2: Compare modes on a high-confidence match
  console.log('Step 2: Comparing modes on HIGH-CONFIDENCE match...')
  console.log('Comparing Record 1 vs Record 2 (similar)\n')

  // Simulate a probabilistic result with high score
  const probResult1 = createMockProbabilisticResult(record2Similar, 75, 100)
  console.log(
    `Probabilistic score: ${probResult1.score.totalScore}/${probResult1.score.maxPossibleScore}`
  )
  console.log(`Probabilistic outcome: ${probResult1.outcome}`)
  console.log()

  // Hybrid mode
  const hybridResult1 = await hybridIntegrator.enhanceMatchResult(
    record1,
    record2Similar,
    probResult1
  )
  console.log('Hybrid mode result:')
  console.log(`  Combined score: ${hybridResult1.score.totalScore.toFixed(2)}`)
  console.log(`  Outcome: ${hybridResult1.outcome}`)
  console.log(`  ML used: ${hybridResult1.mlUsed}`)
  if (hybridResult1.mlPrediction) {
    console.log(
      `  ML probability: ${(hybridResult1.mlPrediction.probability * 100).toFixed(1)}%`
    )
  }
  if (hybridResult1.mlScoreContribution !== undefined) {
    console.log(
      `  ML contribution: ${hybridResult1.mlScoreContribution.toFixed(2)}`
    )
    console.log(
      `  Probabilistic contribution: ${hybridResult1.probabilisticScoreContribution?.toFixed(2)}`
    )
  }
  console.log()

  // ML-only mode
  const mlOnlyResult1 = await mlOnlyIntegrator.enhanceMatchResult(
    record1,
    record2Similar,
    probResult1
  )
  console.log('ML-only mode result:')
  console.log(`  Score: ${mlOnlyResult1.score.totalScore.toFixed(2)}`)
  console.log(`  Outcome: ${mlOnlyResult1.outcome}`)
  console.log(
    `  ML probability: ${(mlOnlyResult1.mlPrediction?.probability ?? 0 * 100).toFixed(1)}%`
  )
  console.log()

  // Fallback mode (won't use ML for definite matches)
  const fallbackResult1 = await fallbackIntegrator.enhanceMatchResult(
    record1,
    record2Similar,
    probResult1
  )
  console.log('Fallback mode result:')
  console.log(`  Score: ${fallbackResult1.score.totalScore.toFixed(2)}`)
  console.log(`  Outcome: ${fallbackResult1.outcome}`)
  console.log(
    `  ML used: ${fallbackResult1.mlUsed} (expected false - high confidence)`
  )
  console.log()

  // Step 3: Compare modes on an UNCERTAIN case
  console.log('Step 3: Comparing modes on UNCERTAIN case...')
  console.log('Comparing Record 1 vs Record 3 (uncertain)\n')

  // Simulate a probabilistic result in the uncertain zone
  const probResult2 = createMockProbabilisticResult(record3Uncertain, 45, 100)
  console.log(
    `Probabilistic score: ${probResult2.score.totalScore}/${probResult2.score.maxPossibleScore}`
  )
  console.log(`Probabilistic outcome: ${probResult2.outcome}`)
  console.log()

  // Hybrid mode
  const hybridResult2 = await hybridIntegrator.enhanceMatchResult(
    record1,
    record3Uncertain,
    probResult2
  )
  console.log('Hybrid mode result:')
  console.log(`  Combined score: ${hybridResult2.score.totalScore.toFixed(2)}`)
  console.log(`  Outcome: ${hybridResult2.outcome}`)
  if (hybridResult2.mlPrediction) {
    console.log(
      `  ML probability: ${(hybridResult2.mlPrediction.probability * 100).toFixed(1)}%`
    )
  }
  console.log()

  // Fallback mode (WILL use ML for uncertain cases)
  const fallbackResult2 = await fallbackIntegrator.enhanceMatchResult(
    record1,
    record3Uncertain,
    probResult2
  )
  console.log('Fallback mode result:')
  console.log(`  Score: ${fallbackResult2.score.totalScore.toFixed(2)}`)
  console.log(`  Outcome: ${fallbackResult2.outcome}`)
  console.log(
    `  ML used: ${fallbackResult2.mlUsed} (expected true - uncertain case)`
  )
  if (fallbackResult2.mlPrediction) {
    console.log(
      `  ML classification: ${fallbackResult2.mlPrediction.classification}`
    )
  }
  console.log()

  // Step 4: Test different ML weights
  console.log('Step 4: Testing different ML weights...\n')
  const weights = [0.0, 0.25, 0.5, 0.75, 1.0]

  console.log('ML Weight | Combined Score | Outcome')
  console.log('----------|----------------|--------')

  for (const weight of weights) {
    const testIntegrator = createMLIntegrator(classifier, {
      mode: 'hybrid',
      mlWeight: weight,
      applyTo: 'all',
    })

    const result = await testIntegrator.enhanceMatchResult(
      record1,
      record2Similar,
      probResult1
    )

    console.log(
      `   ${weight.toFixed(2)}    |     ${result.score.totalScore.toFixed(2)}      | ${result.outcome}`
    )
  }
  console.log()

  // Step 5: Using MLBuilder for hybrid configuration
  console.log('Step 5: Using MLBuilder for hybrid configuration...')

  const hybridConfig = mlBuilder<Person>()
    .usePretrained()
    .mode('hybrid')
    .mlWeight(0.35) // 35% ML, 65% probabilistic
    .applyTo('all')
    .timeout(3000)
    .fallbackOnError(true)
    .matchThreshold(0.7)
    .nonMatchThreshold(0.3)
    .build()

  console.log('Builder configuration:')
  console.log(`  Mode: ${hybridConfig.integrationConfig.mode}`)
  console.log(`  ML Weight: ${hybridConfig.integrationConfig.mlWeight}`)
  console.log(`  Apply to: ${hybridConfig.integrationConfig.applyTo}`)
  console.log(`  Timeout: ${hybridConfig.integrationConfig.timeoutMs}ms`)
  console.log(
    `  Fallback on error: ${hybridConfig.integrationConfig.fallbackOnError}`
  )
  console.log()

  // Step 6: Batch processing in hybrid mode
  console.log('Step 6: Batch processing in hybrid mode...')

  const existingRecords = [record2Similar, record3Uncertain]
  const probResults = [probResult1, probResult2]

  const { results, stats } = await hybridIntegrator.enhanceMatchResultsBatch(
    record1,
    existingRecords,
    probResults
  )

  console.log('Batch results:')
  for (let i = 0; i < results.length; i++) {
    const r = results[i]
    console.log(
      `  Record ${i + 1}: score=${r.score.totalScore.toFixed(2)}, outcome=${r.outcome}, mlUsed=${r.mlUsed}`
    )
  }
  console.log()

  console.log('Batch statistics:')
  console.log(`  Total matches: ${stats.totalMatches}`)
  console.log(`  ML used count: ${stats.mlUsedCount}`)
  console.log(`  ML failed count: ${stats.mlFailedCount}`)
  console.log(
    `  Avg ML prediction time: ${stats.avgMLPredictionTimeMs.toFixed(2)}ms`
  )
  console.log()

  // Step 7: ML-only matching without probabilistic scores
  console.log('Step 7: ML-only matching (standalone)...')

  const mlOnlyStandalone = await mlOnlyIntegrator.matchWithMLOnly(
    record1,
    record2Similar,
    { noMatch: 30, definiteMatch: 65 }
  )

  console.log('ML-only standalone result:')
  console.log(`  Score: ${mlOnlyStandalone.score.totalScore.toFixed(2)}`)
  console.log(`  Outcome: ${mlOnlyStandalone.outcome}`)
  console.log(
    `  ML prediction time: ${mlOnlyStandalone.mlPredictionTimeMs?.toFixed(2)}ms`
  )
  console.log(`  Explanation: ${mlOnlyStandalone.explanation}`)
  console.log()

  // Step 8: Override options at call time
  console.log('Step 8: Override options at call time...')

  const overrideResult = await hybridIntegrator.enhanceMatchResult(
    record1,
    record2Similar,
    probResult1,
    {
      mode: 'mlOnly', // Override to mlOnly for this call
      mlWeight: 1.0,
    }
  )

  console.log('Result with overrides:')
  console.log(`  Score: ${overrideResult.score.totalScore.toFixed(2)}`)
  console.log(`  Outcome: ${overrideResult.outcome}`)
  console.log(`  (Used mlOnly mode despite hybrid integrator)`)
  console.log()

  console.log('=== Example Complete ===')
  console.log('\nKey takeaways:')
  console.log(
    '- Hybrid mode combines ML and probabilistic scores with configurable weights'
  )
  console.log(
    '- Fallback mode uses ML only for uncertain probabilistic results'
  )
  console.log('- ML weight can be tuned based on your data characteristics')
  console.log('- Batch processing provides statistics about ML usage')
  console.log('- Options can be overridden per-call for flexibility')
}

// Run the example
hybridMatchingExample().catch((error) => {
  console.error('Error running example:', error)
  process.exit(1)
})
