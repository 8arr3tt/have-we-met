/**
 * Batch Deduplication Example
 *
 * This example demonstrates how to deduplicate an entire dataset to find all
 * duplicate records. This is useful for:
 * - Initial data cleanup of legacy systems
 * - Migration from multiple data sources
 * - Identifying duplicates in imported data
 *
 * The batch deduplication process uses blocking strategies to efficiently
 * compare large datasets (100k+ records) without O(n²) complexity.
 */

import { HaveWeMet } from '../src/index.js'

interface Customer {
  id?: string
  firstName: string
  lastName: string
  email: string
  phone?: string
  company?: string
  createdAt?: string
}

// Simulated customer dataset with duplicates
const customers: Customer[] = [
  // Duplicate set 1: John Smith
  {
    id: 'c1',
    firstName: 'John',
    lastName: 'Smith',
    email: 'john.smith@acme.com',
    phone: '+1-555-0100',
    company: 'Acme Corp',
    createdAt: '2024-01-15',
  },
  {
    id: 'c2',
    firstName: 'John',
    lastName: 'Smith',
    email: 'jsmith@acme.com', // Different email format
    phone: '+15550100', // Same phone, different format
    company: 'ACME Corporation', // Slight variation
    createdAt: '2024-03-22',
  },
  // Duplicate set 2: Sarah Johnson (typo)
  {
    id: 'c3',
    firstName: 'Sarah',
    lastName: 'Johnson',
    email: 'sarah.j@techco.com',
    phone: '+1-555-0200',
    company: 'TechCo',
    createdAt: '2024-02-10',
  },
  {
    id: 'c4',
    firstName: 'Sara', // Typo: missing 'h'
    lastName: 'Johnson',
    email: 'sarah.j@techco.com',
    phone: '+1-555-0200',
    company: 'TechCo',
    createdAt: '2024-02-18',
  },
  // Unique records
  {
    id: 'c5',
    firstName: 'Michael',
    lastName: 'Chen',
    email: 'michael.chen@example.com',
    phone: '+1-555-0300',
    company: 'Example Inc',
    createdAt: '2024-01-20',
  },
  {
    id: 'c6',
    firstName: 'Emily',
    lastName: 'Davis',
    email: 'emily.d@sample.com',
    phone: '+1-555-0400',
    company: 'Sample LLC',
    createdAt: '2024-03-05',
  },
  // Duplicate set 3: Robert Williams (partial match)
  {
    id: 'c7',
    firstName: 'Robert',
    lastName: 'Williams',
    email: 'rob@consulting.com',
    phone: '+1-555-0500',
    company: 'Williams Consulting',
    createdAt: '2024-01-08',
  },
  {
    id: 'c8',
    firstName: 'Bob', // Nickname for Robert
    lastName: 'Williams',
    email: 'robert.williams@consulting.com',
    phone: '+1-555-0500', // Same phone
    company: 'Williams Consulting',
    createdAt: '2024-02-14',
  },
]

// Configure resolver with comprehensive matching rules
const resolver = HaveWeMet.create<Customer>()
  .schema((schema) =>
    schema
      .field('firstName', { type: 'name', component: 'first' })
      .field('lastName', { type: 'name', component: 'last' })
      .field('email', { type: 'email' })
      .field('phone', { type: 'phone' })
      .field('company', { type: 'string' })
  )
  // Use multi-field blocking for better performance
  // This creates blocks based on both last name and company
  .blocking((block) =>
    block
      .onField('lastName', { transform: 'soundex' })
      .onField('company', { transform: 'firstLetter' })
  )
  // Matching configuration balancing precision and recall
  .matching((match) =>
    match
      .field('email')
      .strategy('exact')
      .weight(25) // Email is highly discriminating
      .field('phone')
      .strategy('exact')
      .weight(20) // Phone number is also strong
      .field('firstName')
      .strategy('jaro-winkler')
      .weight(8)
      .threshold(0.80) // Allow some variation
      .field('lastName')
      .strategy('jaro-winkler')
      .weight(12)
      .threshold(0.85)
      .field('company')
      .strategy('levenshtein')
      .weight(5)
      .threshold(0.75)
      .thresholds({ noMatch: 25, definiteMatch: 50 })
  )
  .build()

console.log('=== Batch Deduplication Example ===\n')
console.log(`Processing ${customers.length} customer records...\n`)

// Run batch deduplication
const batchResult = resolver.deduplicateBatch(customers)

// Display results
console.log('=== Deduplication Results ===')
console.log(`Total records processed: ${batchResult.stats.totalRecords}`)
console.log(`Total comparisons made: ${batchResult.stats.totalComparisons}`)
console.log(`Definite matches found: ${batchResult.stats.definiteMatchesFound}`)
console.log(`Potential matches found: ${batchResult.stats.potentialMatchesFound}`)
console.log(
  `Comparison reduction: ${((1 - batchResult.stats.totalComparisons / (customers.length * (customers.length - 1) / 2)) * 100).toFixed(1)}%`
)
console.log()

// Show duplicate clusters
console.log('=== Duplicate Clusters ===\n')

const clusters = new Map<string, Customer[]>()
batchResult.results.forEach((result) => {
  if (result.outcome === 'definite-match' || result.outcome === 'potential-match') {
    const sourceId = result.sourceRecord.id!
    const matchId = result.record.id!

    // Create cluster key (use lower id as key for consistency)
    const clusterKey = sourceId < matchId ? sourceId : matchId

    if (!clusters.has(clusterKey)) {
      clusters.set(clusterKey, [result.sourceRecord])
    }

    // Add matched record if not already in cluster
    const cluster = clusters.get(clusterKey)!
    if (!cluster.some((r) => r.id === result.record.id)) {
      cluster.push(result.record)
    }
  }
})

let clusterNum = 1
clusters.forEach((cluster, key) => {
  console.log(`Cluster ${clusterNum++}:`)
  cluster.forEach((record) => {
    console.log(`  - [${record.id}] ${record.firstName} ${record.lastName} | ${record.email}`)
  })

  // Show match score for the cluster
  const matchResult = batchResult.results.find(
    (r) =>
      (r.sourceRecord.id === cluster[0].id && r.record.id === cluster[1].id) ||
      (r.record.id === cluster[0].id && r.sourceRecord.id === cluster[1].id)
  )
  if (matchResult) {
    console.log(`  Score: ${matchResult.score.totalScore} (${matchResult.outcome})`)
  }
  console.log()
})

// Show records with potential matches (need review)
const potentialMatches = batchResult.results.filter((r) => r.outcome === 'potential-match')
if (potentialMatches.length > 0) {
  console.log('=== Potential Matches Requiring Review ===\n')
  potentialMatches.forEach((match) => {
    console.log(`${match.sourceRecord.id} vs ${match.record.id}:`)
    console.log(`  Score: ${match.score.totalScore}`)
    console.log(`  ${match.sourceRecord.firstName} ${match.sourceRecord.lastName} | ${match.sourceRecord.email}`)
    console.log(`  ${match.record.firstName} ${match.record.lastName} | ${match.record.email}`)
    console.log('  Field breakdown:')
    match.explanation.fieldScores.forEach((field) => {
      if (field.contributedScore > 0) {
        console.log(`    ${field.fieldName}: +${field.contributedScore}`)
      }
    })
    console.log()
  })
}

console.log('=== Next Steps ===')
console.log('1. Review potential matches manually or queue them for human review')
console.log('2. Merge definite match clusters into golden records')
console.log('3. Update your database with the consolidated records')
console.log('\nSee database-integration.ts for database adapter usage')
console.log('See review-queue.ts for human review workflow')
