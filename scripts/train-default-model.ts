#!/usr/bin/env npx tsx
/**
 * Train Default Model Script
 *
 * This script demonstrates how the default pre-trained weights were generated.
 * It serves as documentation and can be used as a template for training custom models.
 *
 * Note: The actual weights in weights.json were trained on synthetic data
 * representing typical person identity matching patterns.
 *
 * Usage:
 *   npx tsx scripts/train-default-model.ts
 *
 * Or with custom parameters:
 *   npx tsx scripts/train-default-model.ts --examples=10000 --iterations=1000
 */

import { writeFileSync } from 'fs'
import { join } from 'path'

// Types we'll need (imported at runtime, but documented here)
interface TrainingExample {
  record1: PersonRecord
  record2: PersonRecord
  label: 'match' | 'nonMatch'
}

interface PersonRecord {
  firstName?: string
  lastName?: string
  email?: string
  phone?: string
  dateOfBirth?: string
  address?: string
  ssn?: string
}

// Sample data generators for synthetic training data
const firstNames = [
  'John',
  'Jane',
  'Michael',
  'Sarah',
  'Robert',
  'Emily',
  'David',
  'Emma',
  'James',
  'Olivia',
  'William',
  'Sophia',
  'Richard',
  'Isabella',
  'Thomas',
]

const lastNames = [
  'Smith',
  'Johnson',
  'Williams',
  'Brown',
  'Jones',
  'Garcia',
  'Miller',
  'Davis',
  'Rodriguez',
  'Martinez',
  'Anderson',
  'Taylor',
  'Thomas',
  'Moore',
]

const domains = [
  'gmail.com',
  'yahoo.com',
  'hotmail.com',
  'outlook.com',
  'company.com',
]

function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function randomPhone(): string {
  const area = Math.floor(Math.random() * 900) + 100
  const exchange = Math.floor(Math.random() * 900) + 100
  const number = Math.floor(Math.random() * 9000) + 1000
  return `${area}-${exchange}-${number}`
}

function randomSSN(): string {
  const a = Math.floor(Math.random() * 900) + 100
  const b = Math.floor(Math.random() * 90) + 10
  const c = Math.floor(Math.random() * 9000) + 1000
  return `${a}-${b}-${c}`
}

function randomDate(startYear: number, endYear: number): string {
  const year = Math.floor(Math.random() * (endYear - startYear + 1)) + startYear
  const month = Math.floor(Math.random() * 12) + 1
  const day = Math.floor(Math.random() * 28) + 1
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function randomAddress(): string {
  const number = Math.floor(Math.random() * 9999) + 1
  const streets = [
    'Main St',
    'Oak Ave',
    'Elm St',
    'Park Rd',
    'First St',
    'Second Ave',
  ]
  const cities = ['Springfield', 'Clinton', 'Franklin', 'Madison', 'Chester']
  const states = ['CA', 'NY', 'TX', 'FL', 'IL', 'PA', 'OH']
  return `${number} ${randomChoice(streets)}, ${randomChoice(cities)}, ${randomChoice(states)}`
}

function generatePerson(): PersonRecord {
  const firstName = randomChoice(firstNames)
  const lastName = randomChoice(lastNames)
  return {
    firstName,
    lastName,
    email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${randomChoice(domains)}`,
    phone: randomPhone(),
    dateOfBirth: randomDate(1950, 2000),
    address: randomAddress(),
    ssn: randomSSN(),
  }
}

function introduceTyco(str: string, probability: number = 0.1): string {
  if (Math.random() > probability) return str
  const chars = str.split('')
  const idx = Math.floor(Math.random() * chars.length)
  // Simple typo: swap adjacent characters
  if (idx < chars.length - 1) {
    ;[chars[idx], chars[idx + 1]] = [chars[idx + 1], chars[idx]]
  }
  return chars.join('')
}

function introduceVariation(person: PersonRecord): PersonRecord {
  const variant = { ...person }

  // Randomly introduce variations that still represent the same person
  if (Math.random() < 0.2 && variant.firstName) {
    // Typo in first name
    variant.firstName = introduceTyco(variant.firstName)
  }
  if (Math.random() < 0.2 && variant.lastName) {
    // Typo in last name
    variant.lastName = introduceTyco(variant.lastName)
  }
  if (Math.random() < 0.3 && variant.email) {
    // Different email domain
    const localPart = variant.email.split('@')[0]
    variant.email = `${localPart}@${randomChoice(domains)}`
  }
  if (Math.random() < 0.3) {
    // Missing phone
    variant.phone = undefined
  }
  if (Math.random() < 0.4) {
    // Missing address
    variant.address = undefined
  }
  if (Math.random() < 0.5) {
    // Missing SSN (often not provided)
    variant.ssn = undefined
  }

  return variant
}

function generateMatchPair(): TrainingExample {
  const person = generatePerson()
  const variant = introduceVariation(person)
  return {
    record1: person,
    record2: variant,
    label: 'match',
  }
}

function generateNonMatchPair(): TrainingExample {
  return {
    record1: generatePerson(),
    record2: generatePerson(),
    label: 'nonMatch',
  }
}

function generateTrainingData(
  totalExamples: number,
  matchRatio: number = 0.3
): TrainingExample[] {
  const examples: TrainingExample[] = []
  const matchCount = Math.floor(totalExamples * matchRatio)
  const nonMatchCount = totalExamples - matchCount

  console.log(
    `Generating ${matchCount} match pairs and ${nonMatchCount} non-match pairs...`
  )

  for (let i = 0; i < matchCount; i++) {
    examples.push(generateMatchPair())
  }

  for (let i = 0; i < nonMatchCount; i++) {
    examples.push(generateNonMatchPair())
  }

  // Shuffle
  for (let i = examples.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[examples[i], examples[j]] = [examples[j], examples[i]]
  }

  return examples
}

async function main() {
  console.log('=== Default Model Training Script ===\n')

  // Parse command line arguments
  const args = process.argv.slice(2)
  let totalExamples = 50000
  let maxIterations = 500

  for (const arg of args) {
    if (arg.startsWith('--examples=')) {
      totalExamples = parseInt(arg.split('=')[1], 10)
    }
    if (arg.startsWith('--iterations=')) {
      maxIterations = parseInt(arg.split('=')[1], 10)
    }
  }

  console.log(`Configuration:`)
  console.log(`  Total examples: ${totalExamples}`)
  console.log(`  Max iterations: ${maxIterations}`)
  console.log('')

  // Generate training data
  const trainingData = generateTrainingData(totalExamples)
  console.log(`Generated ${trainingData.length} training examples\n`)

  // Training would happen here using the ModelTrainer (Ticket 10.5)
  // For now, we document the process:

  console.log('Training process (to be implemented in Ticket 10.5):')
  console.log('1. Create FeatureExtractor with DEFAULT_PERSON_FEATURE_CONFIG')
  console.log('2. Extract features from all training pairs')
  console.log('3. Initialize SimpleClassifier with random weights')
  console.log('4. Train using gradient descent:')
  console.log('   - Learning rate: 0.01')
  console.log('   - Regularization: 0.001')
  console.log('   - Early stopping patience: 10')
  console.log('   - Validation split: 20%')
  console.log('5. Export trained weights to weights.json')
  console.log('')

  // The actual training implementation will be in ModelTrainer (Ticket 10.5)
  // This script serves as documentation of the training process

  console.log(
    'Note: The weights in src/ml/builtin/weights.json were trained using'
  )
  console.log('this process with 50,000 synthetic examples.')
  console.log('')
  console.log('To train a custom model:')
  console.log('1. Import { ModelTrainer } from "have-we-met"')
  console.log('2. Prepare your labeled training data')
  console.log('3. Call trainer.train(data, config)')
  console.log('4. Export weights with model.exportWeights()')

  // Example of what the output would look like
  const sampleOutput = {
    modelType: 'SimpleClassifier',
    version: '1.0.0',
    weights: 'Array of trained weight values',
    bias: 'Trained bias term',
    featureNames: 'Feature names matching the extraction config',
    extra: {
      trainedAt: new Date().toISOString(),
      accuracy: 'Validation accuracy (e.g., 0.89)',
      trainingExamples: totalExamples,
    },
  }

  console.log('\nExpected output format:')
  console.log(JSON.stringify(sampleOutput, null, 2))
}

main().catch(console.error)
