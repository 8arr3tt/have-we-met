/**
 * Customer Matching Example
 *
 * This example demonstrates how to use normalizers to match customer records
 * across different data sources with inconsistent formatting.
 *
 * Scenario: An e-commerce company wants to deduplicate customer records from:
 * - Web form submissions (messy, inconsistent formatting)
 * - CRM database (clean, structured data)
 * - Email marketing platform (various formats)
 *
 * Normalizers help standardize:
 * - Names (titles, casing, whitespace)
 * - Emails (casing, plus-addressing)
 * - Phone numbers (formatting, country codes)
 */

import { HaveWeMet } from '../../src'

// Customer record interface
interface Customer {
  id: string
  fullName: string
  email: string
  phone: string
  createdAt: string
}

// Configure resolver with normalizers
const customerResolver = HaveWeMet.create<Customer>()
  .schema((s) =>
    s
      // Name normalizer: handles titles, casing, extra whitespace
      .field('fullName')
      .type('name')
      .normalizer('name', {
        extractTitles: true,
        extractSuffixes: true,
        normalizeWhitespace: true,
      })

      // Email normalizer: lowercase, trim, remove plus-addressing
      .field('email')
      .type('email')
      .normalizer('email', {
        removePlusAddressing: true, // john+newsletter@example.com → john@example.com
        normalizeDomain: true,
      })

      // Phone normalizer: standardize to E.164 format
      .field('phone')
      .type('phone')
      .normalizer('phone', {
        defaultCountry: 'US', // Assume US if no country code
        validate: true,
      })
  )
  .matching((m) =>
    m
      // Name: Use Jaro-Winkler for fuzzy matching (handles typos)
      .field('fullName')
      .strategy('jaro-winkler')
      .weight(35)

      // Email: Exact match after normalization (highly distinctive)
      .field('email')
      .strategy('exact')
      .weight(40)

      // Phone: Exact match after normalization (highly distinctive)
      .field('phone')
      .strategy('exact')
      .weight(25)
  )
  .thresholds({
    noMatch: 25, // Below 25: different customers
    definiteMatch: 80, // Above 80: same customer
    // Between 25-80: review (manual review)
  })
  .build()

// Sample data: Messy web form submissions
const webFormSubmissions: Customer[] = [
  {
    id: 'web-1',
    fullName: '  JOHN   DOE  ', // Extra whitespace, all caps
    email: ' John.Doe+Newsletter@EXAMPLE.COM ', // Plus-addressing, mixed case
    phone: '555.123.4567', // Dots instead of standard format
    createdAt: '2024-01-15',
  },
  {
    id: 'web-2',
    fullName: 'DR. JANE SMITH', // Title prefix, all caps
    email: 'jane@example.com',
    phone: '(555) 987-6543', // Parentheses format
    createdAt: '2024-01-20',
  },
  {
    id: 'web-3',
    fullName: 'Robert Johnson Jr.', // Suffix
    email: 'bob+work@company.com', // Plus-addressing
    phone: '555-111-2222',
    createdAt: '2024-01-25',
  },
]

// Sample data: Clean CRM database records
const crmDatabase: Customer[] = [
  {
    id: 'crm-101',
    fullName: 'John Doe',
    email: 'john.doe@example.com', // No plus-addressing
    phone: '+15551234567', // E.164 format
    createdAt: '2023-12-01',
  },
  {
    id: 'crm-102',
    fullName: 'Jane Smith',
    email: 'jane@example.com',
    phone: '+15559876543',
    createdAt: '2023-11-15',
  },
  {
    id: 'crm-103',
    fullName: 'Robert Johnson',
    email: 'robert.johnson@company.com',
    phone: '+15551112222',
    createdAt: '2023-10-10',
  },
]

// Match web submissions against CRM database
console.log('='.repeat(80))
console.log('Customer Matching with Normalizers - Example')
console.log('='.repeat(80))
console.log()

webFormSubmissions.forEach((submission) => {
  console.log(`Checking web submission: ${submission.id}`)
  console.log(`  Raw Name:  "${submission.fullName}"`)
  console.log(`  Raw Email: "${submission.email}"`)
  console.log(`  Raw Phone: "${submission.phone}"`)
  console.log()

  const result = customerResolver.resolve(submission, crmDatabase)

  console.log(`  Result: ${result.outcome.toUpperCase()}`)

  if (result.outcome === 'match') {
    console.log(`  ✓ Matched with: ${result.bestMatch!.record.id}`)
    console.log(`  ✓ Confidence: ${result.bestMatch!.score.total.toFixed(1)}%`)
    console.log(`  ✓ Existing Customer (merged)`)
  } else if (result.outcome === 'review') {
    console.log(`  ? Potential matches found:`)
    result.candidates.forEach((candidate) => {
      console.log(
        `    - ${candidate.record.id}: ${candidate.score.total.toFixed(1)}%`
      )
    })
    console.log(`  ? Requires manual review`)
  } else {
    console.log(`  ✓ New customer (create record)`)
  }

  console.log()
  console.log('-'.repeat(80))
  console.log()
})

// Additional example: Show the power of normalization
console.log('='.repeat(80))
console.log('Normalization Impact')
console.log('='.repeat(80))
console.log()

const messyInput: Customer = {
  id: 'test-1',
  fullName: '  MR.   JOHN    Q.   DOE   JR.  ',
  email: ' JOHN.DOE+SPAM@EXAMPLE.COM ',
  phone: '1-555-123-4567',
  createdAt: '2024-01-30',
}

const cleanCandidate: Customer = {
  id: 'test-2',
  fullName: 'John Q. Doe Jr.',
  email: 'john.doe@example.com',
  phone: '(555) 123-4567',
  createdAt: '2023-06-15',
}

console.log('Input (messy):')
console.log(`  Name:  "${messyInput.fullName}"`)
console.log(`  Email: "${messyInput.email}"`)
console.log(`  Phone: "${messyInput.phone}"`)
console.log()

console.log('Candidate (clean):')
console.log(`  Name:  "${cleanCandidate.fullName}"`)
console.log(`  Email: "${cleanCandidate.email}"`)
console.log(`  Phone: "${cleanCandidate.phone}"`)
console.log()

const matchResult = customerResolver.resolve(messyInput, [cleanCandidate])

console.log('Result:')
console.log(`  Outcome: ${matchResult.outcome.toUpperCase()}`)
if (matchResult.bestMatch) {
  console.log(`  Score: ${matchResult.bestMatch.score.total.toFixed(1)}%`)
  console.log()
  console.log(
    '  ✓ Normalizers successfully matched these records despite formatting differences!'
  )
}
console.log()

// Best practices summary
console.log('='.repeat(80))
console.log('Best Practices')
console.log('='.repeat(80))
console.log()
console.log('1. Name Normalizer:')
console.log('   - Use for personal names')
console.log('   - Enable title/suffix extraction')
console.log('   - Pair with Jaro-Winkler for typo tolerance')
console.log()
console.log('2. Email Normalizer:')
console.log('   - Always lowercase and trim')
console.log('   - Remove plus-addressing for matching')
console.log('   - Use exact match after normalization')
console.log()
console.log('3. Phone Normalizer:')
console.log('   - Specify default country code')
console.log('   - Use E.164 format for consistency')
console.log('   - Use exact match after normalization')
console.log()
console.log('4. Field Weights:')
console.log('   - Email: 40% (highly distinctive)')
console.log('   - Name: 35% (moderate distinctiveness)')
console.log('   - Phone: 25% (can change)')
console.log()
console.log('5. Thresholds:')
console.log('   - No Match: < 25%')
console.log('   - Review: 25-80% (manual review)')
console.log('   - Definite Match: > 80%')
console.log()
