/**
 * Custom Model Example
 *
 * This example demonstrates how to configure and use custom ML models
 * with custom feature extraction for domain-specific matching scenarios.
 *
 * Topics covered:
 * 1. Creating custom feature extraction configuration
 * 2. Building a SimpleClassifier with custom features
 * 3. Loading custom weights
 * 4. Using the FieldFeatureBuilder for per-field configuration
 * 5. Creating classifiers for specific entity types
 */

import {
  SimpleClassifier,
  FeatureExtractor,
  featureConfig,
  mlBuilder,
  createModelFromConfig,
} from '../../src/ml'
import type { FieldFeatureConfig, FeatureExtractionConfig, MLModelWeights } from '../../src/ml'

interface Patient {
  patientId?: string
  firstName: string
  lastName: string
  dateOfBirth: string
  ssn?: string
  mrn?: string
  address?: string
  phone?: string
}

interface Company {
  companyId?: string
  legalName: string
  tradingName?: string
  registrationNumber: string
  taxId?: string
  address?: string
  country?: string
}

async function customModelExample() {
  console.log('=== Custom Model Example ===\n')

  // Step 1: Create custom feature extraction configuration
  console.log('Step 1: Creating custom feature extraction configuration...')

  const patientFeatureConfig: FeatureExtractionConfig = {
    fields: [
      {
        field: 'firstName',
        extractors: ['jaroWinkler', 'soundex', 'metaphone', 'exact'],
        weight: 1.2,
        includeMissingIndicator: true,
      },
      {
        field: 'lastName',
        extractors: ['jaroWinkler', 'soundex', 'metaphone', 'exact'],
        weight: 1.2,
        includeMissingIndicator: true,
      },
      {
        field: 'dateOfBirth',
        extractors: ['exact', 'dateDiff'],
        weight: 1.5,
        includeMissingIndicator: true,
      },
      {
        field: 'ssn',
        extractors: ['exact', 'levenshtein'],
        weight: 2.0, // High weight for SSN
        includeMissingIndicator: true,
      },
      {
        field: 'mrn',
        extractors: ['exact'],
        weight: 2.0, // High weight for MRN
        includeMissingIndicator: true,
      },
      {
        field: 'phone',
        extractors: ['exact', 'levenshtein'],
        weight: 1.3,
        includeMissingIndicator: true,
      },
    ],
    normalize: true,
  }

  console.log('Feature configuration:')
  console.log(`  Fields configured: ${patientFeatureConfig.fields.length}`)
  for (const field of patientFeatureConfig.fields) {
    console.log(`    - ${field.field}: extractors=[${field.extractors.join(', ')}], weight=${field.weight}`)
  }
  console.log()

  // Step 2: Create FeatureExtractor
  console.log('Step 2: Creating FeatureExtractor...')
  const featureExtractor = new FeatureExtractor<Patient>(patientFeatureConfig)

  console.log(`Feature count: ${featureExtractor.getFeatureCount()}`)
  console.log('Feature names:')
  const featureNames = featureExtractor.getFeatureNames()
  for (let i = 0; i < Math.min(10, featureNames.length); i++) {
    console.log(`  ${i + 1}. ${featureNames[i]}`)
  }
  if (featureNames.length > 10) {
    console.log(`  ... and ${featureNames.length - 10} more`)
  }
  console.log()

  // Step 3: Extract features from a patient pair
  console.log('Step 3: Extracting features from patient records...')

  const patient1: Patient = {
    patientId: 'P001',
    firstName: 'Robert',
    lastName: 'Johnson',
    dateOfBirth: '1975-06-15',
    ssn: '123-45-6789',
    mrn: 'MRN123456',
    phone: '+1-555-123-4567',
  }

  const patient2: Patient = {
    patientId: 'P002',
    firstName: 'Bob', // Nickname
    lastName: 'Johnson',
    dateOfBirth: '1975-06-15',
    ssn: '123-45-6789', // Same SSN
    mrn: 'MRN123456', // Same MRN
    phone: '555-123-4567', // Same phone, different format
  }

  const features = featureExtractor.extract({
    record1: patient1,
    record2: patient2,
  })

  console.log(`Extracted ${features.values.length} features`)
  console.log('Sample features:')
  for (let i = 0; i < Math.min(8, features.names.length); i++) {
    console.log(`  ${features.names[i]}: ${features.values[i].toFixed(4)}`)
  }
  console.log()

  // Step 4: Create SimpleClassifier with custom feature extractor
  console.log('Step 4: Creating SimpleClassifier with custom configuration...')

  const classifier = new SimpleClassifier<Patient>({
    featureExtractor: featureExtractor,
    modelConfig: {
      matchThreshold: 0.75,
      nonMatchThreshold: 0.25,
      includeFeatureImportance: true,
    },
  })

  console.log(`Classifier feature count: ${classifier.getFeatureCount()}`)
  console.log(`Ready: ${classifier.isReady()}`)
  console.log()

  // Step 5: Load custom weights
  console.log('Step 5: Loading custom weights...')

  // In practice, these would come from training or a saved model file
  const customWeights: MLModelWeights = {
    modelType: 'SimpleClassifier',
    version: '1.0.0',
    weights: featureNames.map((_, i) => {
      // Simulate trained weights - higher for exact matches, SSN, MRN
      if (featureNames[i].includes('_exact')) return 0.8
      if (featureNames[i].includes('ssn_')) return 1.5
      if (featureNames[i].includes('mrn_')) return 1.5
      if (featureNames[i].includes('jaroWinkler')) return 0.5
      if (featureNames[i].includes('soundex')) return 0.3
      if (featureNames[i].includes('missing')) return -0.2
      return 0.3
    }),
    bias: -2.0,
    featureNames: featureNames,
    extra: {
      trainedAt: new Date().toISOString(),
      accuracy: 0.92,
      modelName: 'PatientMatcherV1',
    },
  }

  await classifier.loadWeights(customWeights)
  console.log(`Ready after loading weights: ${classifier.isReady()}`)
  console.log()

  // Step 6: Make predictions
  console.log('Step 6: Making predictions...')

  const prediction = await classifier.predict({
    record1: patient1,
    record2: patient2,
  })

  console.log('Prediction for similar patients:')
  console.log(`  Probability: ${(prediction.probability * 100).toFixed(2)}%`)
  console.log(`  Classification: ${prediction.classification}`)
  console.log(`  Confidence: ${(prediction.confidence * 100).toFixed(2)}%`)
  console.log()

  // Show feature importance
  console.log('Top 5 contributing features:')
  const sortedImportance = [...prediction.featureImportance]
    .sort((a, b) => b.importance - a.importance)
    .slice(0, 5)
  for (const feat of sortedImportance) {
    console.log(`  ${feat.name}: ${(feat.importance * 100).toFixed(1)}%`)
  }
  console.log()

  // Step 7: Using MLBuilder for custom configuration
  console.log('Step 7: Using MLBuilder for custom model configuration...')

  const mlConfig = mlBuilder<Patient>()
    .field('firstName')
    .forName()
    .weight(1.2)
    .field('lastName')
    .forName()
    .weight(1.2)
    .field('dateOfBirth')
    .forDate()
    .weight(1.5)
    .field('ssn')
    .forIdentifier()
    .weight(2.0)
    .field('mrn')
    .forIdentifier()
    .weight(2.0)
    .field('phone')
    .forIdentifier()
    .weight(1.3)
    .mode('mlOnly')
    .matchThreshold(0.75)
    .build()

  console.log('MLBuilder configuration:')
  console.log(`  Mode: ${mlConfig.integrationConfig.mode}`)
  console.log(`  Fields configured: ${mlConfig.featureConfig?.fields.length}`)
  console.log()

  // Step 8: Create classifier for companies
  console.log('Step 8: Creating classifier for a different entity type (Company)...')

  const companyConfig = mlBuilder<Company>()
    .field('legalName')
    .extractors(['jaroWinkler', 'levenshtein', 'exact'])
    .weight(1.5)
    .field('tradingName')
    .extractors(['jaroWinkler', 'exact'])
    .weight(1.0)
    .field('registrationNumber')
    .forIdentifier()
    .weight(2.0)
    .field('taxId')
    .forIdentifier()
    .weight(2.0)
    .field('address')
    .extractors(['jaroWinkler', 'levenshtein'])
    .weight(0.8)
    .field('country')
    .extractors(['exact'])
    .weight(1.0)
    .mode('hybrid')
    .mlWeight(0.6)
    .build()

  console.log('Company classifier configuration:')
  console.log(`  Mode: ${companyConfig.integrationConfig.mode}`)
  console.log(`  ML Weight: ${companyConfig.integrationConfig.mlWeight}`)
  console.log(`  Fields: ${companyConfig.featureConfig?.fields.map((f) => f.field).join(', ')}`)
  console.log()

  // Step 9: Using helper methods for quick setup
  console.log('Step 9: Quick setup with helper methods...')

  const quickConfig = mlBuilder<Patient>()
    .nameFields(['firstName', 'lastName'])
    .identifierFields(['ssn', 'mrn'])
    .dateFields(['dateOfBirth'])
    .stringFields(['address'])
    .mode('hybrid')
    .mlWeight(0.5)
    .build()

  console.log('Quick configuration:')
  console.log(`  Fields configured: ${quickConfig.featureConfig?.fields.length}`)
  for (const field of quickConfig.featureConfig?.fields ?? []) {
    console.log(`    - ${field.field}: [${field.extractors.join(', ')}]`)
  }
  console.log()

  // Step 10: Export weights for saving
  console.log('Step 10: Exporting model weights...')
  const exportedWeights = classifier.exportWeights()

  console.log('Exported weights:')
  console.log(`  Model type: ${exportedWeights.modelType}`)
  console.log(`  Version: ${exportedWeights.version}`)
  console.log(`  Weights count: ${exportedWeights.weights.length}`)
  console.log(`  Bias: ${exportedWeights.bias.toFixed(4)}`)
  if (exportedWeights.extra) {
    console.log(`  Trained at: ${exportedWeights.extra.trainedAt}`)
    console.log(`  Accuracy: ${exportedWeights.extra.accuracy}`)
  }
  console.log()

  console.log('=== Example Complete ===')
  console.log('\nKey takeaways:')
  console.log('- Custom feature configs let you tailor ML to your domain')
  console.log('- Field weights control feature importance')
  console.log('- Different extractors capture different similarity signals')
  console.log('- The MLBuilder API simplifies configuration')
  console.log('- Weights can be exported/imported for persistence')
}

// Run the example
customModelExample().catch((error) => {
  console.error('Error running example:', error)
  process.exit(1)
})
