/**
 * Patient Matching Example
 *
 * This example demonstrates how to use normalizers to match patient records
 * in a healthcare setting where accurate identity resolution is critical.
 *
 * Scenario: A hospital needs to match patient records across:
 * - Registration desk (manual entry, prone to typos)
 * - Electronic Health Records (EHR) system
 * - Lab results (different date formats)
 *
 * Normalizers help standardize:
 * - Names (titles like Dr., suffixes, casing)
 * - Dates of birth (multiple date formats)
 * - Addresses (abbreviations, casing)
 *
 * Note: In production healthcare systems, additional identifiers like
 * Medical Record Number (MRN) and SSN would also be used.
 */

import { HaveWeMet } from '../../src'

// Patient record interface
interface Patient {
  id: string
  fullName: string
  dateOfBirth: string
  address: string
  phone: string
}

// Configure resolver with normalizers for patient matching
const patientResolver = HaveWeMet.create<Patient>()
  .schema((s) =>
    s
      // Name normalizer: critical for patient identification
      .field('fullName')
      .type('name')
      .normalizer('name', {
        extractTitles: true, // Handle Dr., Mr., Mrs., etc.
        extractSuffixes: true, // Handle Jr., Sr., III, etc.
        normalizeWhitespace: true,
      })

      // Date normalizer: standardize to ISO 8601 (YYYY-MM-DD)
      .field('dateOfBirth')
      .type('date')
      .normalizer('date', {
        inputFormat: 'MM/DD/YYYY', // Common US format
        partialDates: 'reject', // Require full dates in healthcare
        outputFormat: 'iso',
      })

      // Address normalizer: handle variations in street addresses
      .field('address')
      .type('address')
      .normalizer('address', {
        abbreviateStreetTypes: true, // Street → St, Avenue → Ave
        abbreviateStates: true, // California → CA
        normalizeCase: true,
      })

      // Phone normalizer: standardize phone numbers
      .field('phone')
      .type('phone')
      .normalizer('phone', {
        defaultCountry: 'US',
        validate: true,
      })
  )
  .matching((m) =>
    m
      // Name: High weight, use Jaro-Winkler for typos
      .field('fullName')
      .strategy('jaro-winkler')
      .weight(40)

      // Date of birth: Very high weight (highly distinctive)
      .field('dateOfBirth')
      .strategy('exact')
      .weight(35)

      // Address: Medium weight, use Levenshtein for variations
      .field('address')
      .strategy('levenshtein')
      .threshold(0.8) // Allow 20% difference
      .weight(15)

      // Phone: Lower weight (can change over time)
      .field('phone')
      .strategy('exact')
      .weight(10)
  )
  .thresholds({
    noMatch: 30, // Below 30: different patients
    definiteMatch: 85, // Above 85: same patient (high confidence for healthcare)
    // Between 30-85: review (requires verification)
  })
  .build()

// Sample data: Registration desk entries (manual, prone to errors)
const registrationEntries: Patient[] = [
  {
    id: 'reg-001',
    fullName: '  SMITH,  JOHN   A.  ', // Last name first, extra whitespace
    dateOfBirth: '01/15/1985', // MM/DD/YYYY format
    address: '123 MAIN STREET, ANYTOWN, CALIFORNIA 90210', // All caps, full state
    phone: '555.123.4567', // Dots
  },
  {
    id: 'reg-002',
    fullName: 'Dr. Jane Mary Doe', // Title prefix, middle name
    dateOfBirth: '03/22/1978',
    address: '456 Oak Ave Apt 2B, Portland, OR 97201',
    phone: '(555) 987-6543',
  },
  {
    id: 'reg-003',
    fullName: 'JOHNSON, ROBERT JR.', // Suffix
    dateOfBirth: '11/30/1992',
    address: '789 Elm Boulevard, Seattle, Washington 98101',
    phone: '555-111-2222',
  },
]

// Sample data: EHR system records (clean, structured)
const ehrRecords: Patient[] = [
  {
    id: 'ehr-12345',
    fullName: 'John A. Smith',
    dateOfBirth: '1985-01-15', // ISO format
    address: '123 Main St, Anytown, CA 90210',
    phone: '+15551234567', // E.164
  },
  {
    id: 'ehr-12346',
    fullName: 'Jane Mary Doe',
    dateOfBirth: '1978-03-22',
    address: '456 Oak Ave Apt 2B, Portland, OR 97201',
    phone: '+15559876543',
  },
  {
    id: 'ehr-12347',
    fullName: 'Robert Johnson Jr.',
    dateOfBirth: '1992-11-30',
    address: '789 Elm Blvd, Seattle, WA 98101',
    phone: '+15551112222',
  },
]

// Match registration entries against EHR system
console.log('='.repeat(80))
console.log('Patient Matching with Normalizers - Healthcare Example')
console.log('='.repeat(80))
console.log()

registrationEntries.forEach((entry) => {
  console.log(`Processing registration: ${entry.id}`)
  console.log(`  Name: "${entry.fullName}"`)
  console.log(`  DOB:  "${entry.dateOfBirth}"`)
  console.log(`  Addr: "${entry.address}"`)
  console.log()

  const result = patientResolver.resolve(entry, ehrRecords)

  console.log(`  Result: ${result.outcome.toUpperCase()}`)

  if (result.outcome === 'match') {
    console.log(
      `  ✓ Matched with existing patient: ${result.bestMatch!.record.id}`
    )
    console.log(`  ✓ Confidence: ${result.bestMatch!.score.total.toFixed(1)}%`)
    console.log(`  ✓ Action: Update existing patient record`)
  } else if (result.outcome === 'review') {
    console.log(`  ⚠ Potential matches found (VERIFY):`)
    result.candidates.forEach((candidate) => {
      console.log(
        `    - ${candidate.record.id}: ${candidate.score.total.toFixed(1)}%`
      )
    })
    console.log(`  ⚠ Action: Manual verification required`)
  } else {
    console.log(`  ✓ New patient detected`)
    console.log(`  ✓ Action: Create new patient record`)
  }

  console.log()
  console.log('-'.repeat(80))
  console.log()
})

// Example: Show normalization impact on date formats
console.log('='.repeat(80))
console.log('Date Format Normalization')
console.log('='.repeat(80))
console.log()

const dateVariations = [
  { format: 'MM/DD/YYYY', value: '01/15/1985' },
  { format: 'ISO 8601', value: '1985-01-15' },
  { format: 'M/D/YY', value: '1/15/85' },
  { format: 'Natural', value: 'January 15, 1985' },
]

console.log('All these date formats normalize to: 1985-01-15')
console.log()
dateVariations.forEach((variation) => {
  console.log(`  ${variation.format.padEnd(15)}: "${variation.value}"`)
})
console.log()
console.log('→ This allows exact matching regardless of input format')
console.log()

// Example: Show address normalization
console.log('='.repeat(80))
console.log('Address Normalization')
console.log('='.repeat(80))
console.log()

const addressVariations = [
  '123 MAIN STREET, ANYTOWN, CALIFORNIA 90210',
  '123 Main St, Anytown, CA 90210',
  '123 main street, anytown, ca 90210',
]

console.log('All these addresses normalize to similar format:')
console.log()
addressVariations.forEach((addr, idx) => {
  console.log(`  Input ${idx + 1}: "${addr}"`)
})
console.log()
console.log('→ Fuzzy matching can then identify these as the same address')
console.log()

// Critical scenario: Near-miss detection
console.log('='.repeat(80))
console.log('Critical: Near-Miss Detection')
console.log('='.repeat(80))
console.log()

const similarPatients: Patient[] = [
  {
    id: 'patient-A',
    fullName: 'John Smith',
    dateOfBirth: '1985-01-15',
    address: '123 Main St, Anytown, CA 90210',
    phone: '555-123-4567',
  },
  {
    id: 'patient-B',
    fullName: 'John Smith',
    dateOfBirth: '1985-01-16', // One day different!
    address: '456 Oak Ave, Portland, OR 97201',
    phone: '555-987-6543',
  },
]

const queryPatient: Patient = {
  id: 'query',
  fullName: 'John Smith',
  dateOfBirth: '1985-01-15',
  address: '123 Main St, Anytown, CA 90210',
  phone: '555-123-4567',
}

const nearMissResult = patientResolver.resolve(queryPatient, similarPatients)

console.log('Query Patient:')
console.log(`  Name: ${queryPatient.fullName}`)
console.log(`  DOB:  ${queryPatient.dateOfBirth}`)
console.log()

console.log('Candidate A (Same DOB):')
console.log(`  Name: ${similarPatients[0].fullName}`)
console.log(`  DOB:  ${similarPatients[0].dateOfBirth}`)
console.log()

console.log('Candidate B (Different DOB by 1 day):')
console.log(`  Name: ${similarPatients[1].fullName}`)
console.log(`  DOB:  ${similarPatients[1].dateOfBirth}`)
console.log()

console.log('Result:')
console.log(`  Matched with: ${nearMissResult.bestMatch?.record.id || 'none'}`)
console.log(`  → Date normalization + exact matching prevents false positives!`)
console.log()

// Best practices for healthcare
console.log('='.repeat(80))
console.log('Healthcare Best Practices')
console.log('='.repeat(80))
console.log()
console.log('1. High Match Threshold:')
console.log('   - Set definiteMatch > 85% to reduce false positives')
console.log('   - Patient safety requires high confidence')
console.log()
console.log('2. Date of Birth:')
console.log('   - Use exact match (after normalization)')
console.log('   - High weight (35%+)')
console.log('   - Reject partial dates in healthcare')
console.log()
console.log('3. Name Matching:')
console.log('   - Use fuzzy matching (Jaro-Winkler)')
console.log('   - Handle titles (Dr., Mr., Mrs.)')
console.log('   - Handle suffixes (Jr., Sr., III)')
console.log()
console.log('4. Address Matching:')
console.log('   - Use fuzzy matching (Levenshtein)')
console.log('   - Normalize abbreviations')
console.log('   - Lower weight (addresses change)')
console.log()
console.log('5. Manual Review:')
console.log('   - Always flag potential matches for verification')
console.log('   - Never auto-merge in healthcare without review')
console.log('   - Maintain audit trail of all matches')
console.log()
console.log('6. Additional Identifiers:')
console.log('   - In production, also match on:')
console.log('     • Medical Record Number (MRN)')
console.log('     • Social Security Number (SSN)')
console.log('     • Insurance ID')
console.log('     • Photo ID verification')
console.log()
