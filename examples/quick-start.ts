/**
 * Quick Start Example
 *
 * This example demonstrates the most basic usage of have-we-met for in-memory
 * identity resolution. It shows how to:
 * - Define a schema for your records
 * - Configure blocking to reduce comparisons
 * - Set up probabilistic matching with weighted fields
 * - Resolve a single record against a dataset
 * - Understand match results and explanations
 */

import { HaveWeMet } from '../src/index.js'

// Define the structure of our records
interface Person {
  id?: string
  firstName: string
  lastName: string
  email: string
  dateOfBirth: string
}

// Sample existing records in our system
const existingRecords: Person[] = [
  {
    id: '1',
    firstName: 'John',
    lastName: 'Smith',
    email: 'john.smith@example.com',
    dateOfBirth: '1985-03-15',
  },
  {
    id: '2',
    firstName: 'Jane',
    lastName: 'Doe',
    email: 'jane.doe@example.com',
    dateOfBirth: '1990-07-22',
  },
  {
    id: '3',
    firstName: 'Robert',
    lastName: 'Johnson',
    email: 'rob.johnson@example.com',
    dateOfBirth: '1978-11-05',
  },
]

// Configure the resolver using the fluent builder API
const resolver = HaveWeMet.create<Person>()
  .schema((schema) =>
    schema
      // Define how each field should be normalized and compared
      .field('firstName', { type: 'name', component: 'first' })
      .field('lastName', { type: 'name', component: 'last' })
      .field('email', { type: 'email' })
      .field('dateOfBirth', { type: 'date' })
  )
  // Blocking reduces comparisons by only comparing records with similar last names
  // This reduces O(n²) comparisons by 95-99%+ for large datasets
  .blocking((block) => block.onField('lastName', { transform: 'soundex' }))
  // Configure weighted matching - each field contributes to the total score
  .matching((match) =>
    match
      // Email is highly discriminating, so it gets the highest weight
      .field('email')
      .strategy('exact')
      .weight(20)
      // Names use fuzzy matching to handle typos and variations
      .field('firstName')
      .strategy('jaro-winkler')
      .weight(10)
      .threshold(0.85) // Only count if similarity is 85%+
      .field('lastName')
      .strategy('jaro-winkler')
      .weight(10)
      .threshold(0.85)
      // Date of birth should match exactly
      .field('dateOfBirth')
      .strategy('exact')
      .weight(10)
      // Set outcome thresholds
      // Below 20: no match, 20-45: potential match (review), 45+: definite match
      .thresholds({ noMatch: 20, definiteMatch: 45 })
  )
  .build()

console.log('=== Quick Start Example ===\n')

// Example 1: Exact match
console.log('Example 1: Checking for exact match...')
const exactMatch: Person = {
  firstName: 'John',
  lastName: 'Smith',
  email: 'john.smith@example.com',
  dateOfBirth: '1985-03-15',
}

const result1 = resolver.resolve(exactMatch, existingRecords)
console.log(`Outcome: ${result1[0]?.outcome}`)
console.log(`Score: ${result1[0]?.score.totalScore}`)
console.log(`Matched record: ${result1[0]?.record.id}\n`)

// Example 2: Near match (fuzzy name, same email)
console.log('Example 2: Checking near match (typo in name)...')
const nearMatch: Person = {
  firstName: 'Jon', // Typo: "Jon" instead of "John"
  lastName: 'Smyth', // Typo: "Smyth" instead of "Smith"
  email: 'john.smith@example.com',
  dateOfBirth: '1985-03-15',
}

const result2 = resolver.resolve(nearMatch, existingRecords)
console.log(`Outcome: ${result2[0]?.outcome}`)
console.log(`Score: ${result2[0]?.score.totalScore}`)
console.log('Field scores:')
result2[0]?.explanation.fieldScores.forEach((field) => {
  console.log(`  ${field.fieldName}: ${field.contributedScore} (similarity: ${field.similarity?.toFixed(2)})`)
})
console.log()

// Example 3: Potential match (ambiguous)
console.log('Example 3: Checking potential match (needs human review)...')
const potentialMatch: Person = {
  firstName: 'John',
  lastName: 'Smith',
  email: 'different.email@example.com', // Different email
  dateOfBirth: '1985-03-15',
}

const result3 = resolver.resolve(potentialMatch, existingRecords)
console.log(`Outcome: ${result3[0]?.outcome}`)
console.log(`Score: ${result3[0]?.score.totalScore}`)
console.log('This match would typically be queued for human review.\n')

// Example 4: No match
console.log('Example 4: Checking no match (new person)...')
const noMatch: Person = {
  firstName: 'Alice',
  lastName: 'Williams',
  email: 'alice.williams@example.com',
  dateOfBirth: '1995-02-10',
}

const result4 = resolver.resolve(noMatch, existingRecords)
console.log(`Outcome: ${result4[0]?.outcome}`)
console.log(`Score: ${result4[0]?.score.totalScore}`)
console.log('This is a new person - should create a new record.\n')

console.log('=== Example Complete ===')
console.log('\nKey Takeaways:')
console.log('- definite-match: High confidence match (score >= 45)')
console.log('- potential-match: Ambiguous match (score 20-45) - needs review')
console.log('- no-match: New record (score < 20)')
console.log('\nEach match includes a detailed explanation showing which fields contributed to the score.')
