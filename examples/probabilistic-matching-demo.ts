import { HaveWeMet } from '../src'

interface Person {
  firstName: string
  lastName: string
  email: string
  phone: string
  dateOfBirth: string
}

console.log('='.repeat(80))
console.log('Probabilistic Matching Demo')
console.log('='.repeat(80))
console.log()

const resolver = HaveWeMet.create<Person>()
  .schema((schema) => {
    schema
      .field('firstName', { type: 'name', component: 'first' })
      .field('lastName', { type: 'name', component: 'last' })
      .field('email', { type: 'email' })
      .field('phone', { type: 'phone' })
      .field('dateOfBirth', { type: 'date' })
  })
  .matching((match) => {
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
      .thresholds({ noMatch: 20, definiteMatch: 45 })
  })
  .build()

console.log('Configuration:')
console.log('  - Email: weight 20 (exact match)')
console.log('  - Phone: weight 15 (exact match)')
console.log('  - First Name: weight 10 (Jaro-Winkler, threshold 0.85)')
console.log('  - Last Name: weight 10 (Jaro-Winkler, threshold 0.85)')
console.log('  - Date of Birth: weight 10 (exact match)')
console.log('  - No Match Threshold: < 20 points')
console.log('  - Potential Match: 20-44 points')
console.log('  - Definite Match: >= 45 points')
console.log('  - Max Possible Score: 65 points')
console.log()

console.log('='.repeat(80))
console.log('Scenario 1: Single Record Matching - Definite Match')
console.log('='.repeat(80))
console.log()

const newRecord1 = {
  firstName: 'John',
  lastName: 'Smith',
  email: 'john.doe@example.com',
  phone: '+1-555-0100',
  dateOfBirth: '1985-03-15',
}

const existingRecords1 = [
  {
    firstName: 'John',
    lastName: 'Smith',
    email: 'john.doe@example.com',
    phone: '+1-555-0100',
    dateOfBirth: '1985-03-15',
  },
  {
    firstName: 'Jane',
    lastName: 'Doe',
    email: 'jane@example.com',
    phone: '+1-555-0200',
    dateOfBirth: '1990-07-20',
  },
]

console.log('New Record:', JSON.stringify(newRecord1, null, 2))
console.log()
console.log('Existing Records:', JSON.stringify(existingRecords1, null, 2))
console.log()

const results1 = resolver.resolve(newRecord1, existingRecords1)

console.log('Results:')
for (const result of results1) {
  console.log()
  console.log(`Outcome: ${result.outcome.toUpperCase()}`)
  console.log(
    `Total Score: ${result.score.totalScore}/${result.score.maxPossibleScore}`
  )
  console.log(`Normalized Score: ${result.score.normalizedScore.toFixed(2)}`)
  console.log()
  console.log('Field Breakdown:')
  for (const field of result.score.fieldScores) {
    console.log(
      `  ${field.field}: similarity=${field.similarity.toFixed(2)}, ` +
        `weight=${field.weight}, contribution=${field.contribution.toFixed(2)}, ` +
        `threshold met=${field.metThreshold}`
    )
  }
  console.log()
  console.log('Explanation:')
  console.log(result.explanation)
  console.log('-'.repeat(80))
}

console.log()
console.log('='.repeat(80))
console.log('Scenario 2: Single Record Matching - Potential Match')
console.log('='.repeat(80))
console.log()

const newRecord2 = {
  firstName: 'John',
  lastName: 'Smith',
  email: 'john.doe@example.com',
  phone: '+1-555-0100',
  dateOfBirth: '1985-03-15',
}

const existingRecords2 = [
  {
    firstName: 'Jon',
    lastName: 'Smyth',
    email: 'john.doe@example.com',
    phone: '+1-555-0200',
    dateOfBirth: '1985-03-20',
  },
]

console.log('New Record:', JSON.stringify(newRecord2, null, 2))
console.log()
console.log('Existing Records:', JSON.stringify(existingRecords2, null, 2))
console.log()

const results2 = resolver.resolve(newRecord2, existingRecords2)

console.log('Results:')
for (const result of results2) {
  console.log()
  console.log(`Outcome: ${result.outcome.toUpperCase()}`)
  console.log(
    `Total Score: ${result.score.totalScore}/${result.score.maxPossibleScore}`
  )
  console.log(`Normalized Score: ${result.score.normalizedScore.toFixed(2)}`)
  console.log()
  console.log('Field Breakdown:')
  for (const field of result.score.fieldScores) {
    console.log(
      `  ${field.field}: similarity=${field.similarity.toFixed(2)}, ` +
        `weight=${field.weight}, contribution=${field.contribution.toFixed(2)}, ` +
        `threshold met=${field.metThreshold}`
    )
  }
  console.log()
  console.log('Explanation:')
  console.log(result.explanation)
  console.log('-'.repeat(80))
}

console.log()
console.log('='.repeat(80))
console.log('Scenario 3: Batch Deduplication')
console.log('='.repeat(80))
console.log()

const batchRecords = [
  {
    firstName: 'John',
    lastName: 'Smith',
    email: 'john@example.com',
    phone: '+1-555-0100',
    dateOfBirth: '1985-03-15',
  },
  {
    firstName: 'John',
    lastName: 'Smith',
    email: 'john@example.com',
    phone: '+1-555-0100',
    dateOfBirth: '1985-03-15',
  },
  {
    firstName: 'Jane',
    lastName: 'Doe',
    email: 'jane@example.com',
    phone: '+1-555-0200',
    dateOfBirth: '1990-07-20',
  },
  {
    firstName: 'Jane',
    lastName: 'Doe',
    email: 'jane@example.com',
    phone: '+1-555-0200',
    dateOfBirth: '1990-07-20',
  },
  {
    firstName: 'Bob',
    lastName: 'Johnson',
    email: 'bob@example.com',
    phone: '+1-555-0300',
    dateOfBirth: '1978-12-05',
  },
]

console.log(`Processing ${batchRecords.length} records...`)
console.log()

const startTime = Date.now()
const batchResult = resolver.deduplicateBatch(batchRecords)
const duration = Date.now() - startTime

console.log('Statistics:')
console.log(`  Records Processed: ${batchResult.stats.recordsProcessed}`)
console.log(`  Comparisons Made: ${batchResult.stats.comparisonsMade}`)
console.log(
  `  Definite Matches Found: ${batchResult.stats.definiteMatchesFound}`
)
console.log(
  `  Potential Matches Found: ${batchResult.stats.potentialMatchesFound}`
)
console.log(`  No Matches Found: ${batchResult.stats.noMatchesFound}`)
console.log(`  Records With Matches: ${batchResult.stats.recordsWithMatches}`)
console.log(
  `  Records Without Matches: ${batchResult.stats.recordsWithoutMatches}`
)
console.log(`  Processing Time: ${duration}ms`)
console.log()

console.log('Deduplication Results:')
for (const dedupResult of batchResult.results) {
  if (dedupResult.matches.length > 0) {
    console.log()
    console.log(
      `Record: ${dedupResult.record.firstName} ${dedupResult.record.lastName}`
    )
    console.log(`  Email: ${dedupResult.record.email}`)
    console.log(`  Match Count: ${dedupResult.matchCount}`)
    console.log(`  Has Definite Matches: ${dedupResult.hasDefiniteMatches}`)
    console.log(`  Has Potential Matches: ${dedupResult.hasPotentialMatches}`)
    console.log(`  Matches:`)
    for (const match of dedupResult.matches) {
      console.log(
        `    - ${match.candidateRecord.firstName} ${match.candidateRecord.lastName} ` +
          `(${match.outcome}, score: ${match.score.totalScore})`
      )
    }
  }
}

console.log()
console.log('='.repeat(80))
console.log('Scenario 4: Tuning Weights and Thresholds')
console.log('='.repeat(80))
console.log()

console.log('Tuning Guidelines:')
console.log()
console.log('1. Start with weights based on field discriminating power:')
console.log('   - Unique identifiers (email, SSN): 20-25')
console.log('   - Strong identifiers (phone): 15-20')
console.log('   - Names: 10-15')
console.log('   - Dates: 8-12')
console.log('   - Addresses: 8-12')
console.log('   - Weaker signals: 5-8')
console.log()
console.log('2. Set thresholds conservatively:')
console.log('   - noMatch: 15-25% of max possible score')
console.log('   - definiteMatch: 60-75% of max possible score')
console.log()
console.log('3. Use explanations to refine:')
console.log('   - Review potential matches to understand false positives')
console.log('   - Adjust weights for fields that matter most in your domain')
console.log('   - Adjust thresholds to balance precision vs recall')
console.log()
console.log('4. Field thresholds for quality control:')
console.log('   - Use threshold parameter to exclude low-quality matches')
console.log(
  '   - Example: threshold 0.85 means similarity must be >= 0.85 to contribute'
)
console.log()

const highPrecisionResolver = HaveWeMet.create<Person>()
  .schema((schema) => {
    schema
      .field('firstName', { type: 'name', component: 'first' })
      .field('lastName', { type: 'name', component: 'last' })
      .field('email', { type: 'email' })
      .field('phone', { type: 'phone' })
      .field('dateOfBirth', { type: 'date' })
  })
  .matching((match) => {
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
      .threshold(0.9)
      .field('lastName')
      .strategy('jaro-winkler')
      .weight(10)
      .threshold(0.9)
      .field('dateOfBirth')
      .strategy('exact')
      .weight(10)
      .thresholds({ noMatch: 25, definiteMatch: 55 })
  })
  .build()

console.log('Example: High Precision Configuration (fewer false positives)')
console.log('  - Higher field thresholds (0.9 instead of 0.85)')
console.log('  - Higher definiteMatch threshold (55 instead of 45)')
console.log(
  '  - Result: More conservative matching, fewer errors, more manual review'
)
console.log()

const highRecallResolver = HaveWeMet.create<Person>()
  .schema((schema) => {
    schema
      .field('firstName', { type: 'name', component: 'first' })
      .field('lastName', { type: 'name', component: 'last' })
      .field('email', { type: 'email' })
      .field('phone', { type: 'phone' })
      .field('dateOfBirth', { type: 'date' })
  })
  .matching((match) => {
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
      .threshold(0.75)
      .field('lastName')
      .strategy('jaro-winkler')
      .weight(10)
      .threshold(0.75)
      .field('dateOfBirth')
      .strategy('exact')
      .weight(10)
      .thresholds({ noMatch: 15, definiteMatch: 40 })
  })
  .build()

console.log('Example: High Recall Configuration (fewer false negatives)')
console.log('  - Lower field thresholds (0.75 instead of 0.85)')
console.log('  - Lower definiteMatch threshold (40 instead of 45)')
console.log(
  '  - Result: More matches found, more false positives, less manual review needed'
)
console.log()

console.log('='.repeat(80))
console.log('Demo Complete!')
console.log('='.repeat(80))
