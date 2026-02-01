/**
 * Custom Merge Strategies Example
 *
 * This example demonstrates how to create and use custom merge strategies:
 * 1. Define custom merge functions for domain-specific logic
 * 2. Register custom strategies with the strategy registry
 * 3. Use custom strategies in merge configuration
 * 4. Handle complex field types and validation
 */

import {
  MergeExecutor,
  createMergeBuilder,
  registerStrategy,
} from '../../src/merge'
import type { SourceRecord, StrategyFunction } from '../../src/merge'

interface Patient {
  id?: string
  firstName: string
  lastName: string
  dateOfBirth: string
  mrn: string // Medical Record Number
  insuranceId?: string
  primaryPhysician?: string
  allergies: string[]
  medications: string[]
  emergencyContact?: {
    name: string
    phone: string
    relationship: string
  }
  lastVisit: Date
  updatedAt: Date
}

/**
 * Custom strategy: Select the most complete emergency contact
 * Prefers contacts with all three fields filled
 */
const preferCompleteContact: StrategyFunction = (values, records) => {
  const contacts = values.filter(
    (v) => v !== null && v !== undefined
  ) as Patient['emergencyContact'][]

  if (contacts.length === 0) return undefined

  // Score each contact by completeness
  const scored = contacts.map((contact, index) => {
    let score = 0
    if (contact?.name) score++
    if (contact?.phone) score++
    if (contact?.relationship) score++
    return { contact, score, index }
  })

  // Sort by score descending, then by index for stability
  scored.sort((a, b) => b.score - a.score || a.index - b.index)

  return scored[0].contact
}

/**
 * Custom strategy: Combine allergies and medications lists with deduplication
 * Also normalizes the values (trim, lowercase for comparison)
 */
const mergeUniqueMedicalList: StrategyFunction = (values) => {
  const allItems = values
    .filter((v): v is string[] => Array.isArray(v))
    .flat()

  // Deduplicate while preserving case of first occurrence
  const seen = new Map<string, string>()
  for (const item of allItems) {
    const normalized = item.trim().toLowerCase()
    if (!seen.has(normalized)) {
      seen.set(normalized, item.trim())
    }
  }

  return Array.from(seen.values()).sort()
}

/**
 * Custom strategy: Select the most recent valid MRN
 * A valid MRN must match pattern: letters followed by digits
 */
const preferValidMRN: StrategyFunction = (values, records) => {
  const mrnPattern = /^[A-Z]+\d+$/i

  // Find MRNs that match the pattern, prefer newer records
  const validMRNs = values
    .map((mrn, index) => ({
      mrn: mrn as string,
      record: records[index],
      isValid: typeof mrn === 'string' && mrnPattern.test(mrn),
    }))
    .filter((item) => item.isValid)
    .sort((a, b) => b.record.updatedAt.getTime() - a.record.updatedAt.getTime())

  if (validMRNs.length > 0) {
    return validMRNs[0].mrn
  }

  // Fall back to first non-null value
  return values.find((v) => v !== null && v !== undefined)
}

/**
 * Custom strategy: Prefer the more recent visit, but handle invalid dates
 */
const preferRecentVisit: StrategyFunction = (values) => {
  const validDates = values
    .filter((v): v is Date => v instanceof Date && !isNaN(v.getTime()))
    .sort((a, b) => b.getTime() - a.getTime())

  return validDates.length > 0 ? validDates[0] : undefined
}

async function customStrategiesExample() {
  console.log('=== Custom Merge Strategies Example ===\n')

  // Step 1: Register custom strategies globally
  console.log('Step 1: Registering custom strategies...')
  registerStrategy('preferCompleteContact', preferCompleteContact)
  registerStrategy('mergeUniqueMedicalList', mergeUniqueMedicalList)
  registerStrategy('preferValidMRN', preferValidMRN)
  registerStrategy('preferRecentVisit', preferRecentVisit)
  console.log('Custom strategies registered:')
  console.log('  - preferCompleteContact')
  console.log('  - mergeUniqueMedicalList')
  console.log('  - preferValidMRN')
  console.log('  - preferRecentVisit')
  console.log()

  // Step 2: Configure merge with custom strategies
  console.log('Step 2: Configuring merge with custom strategies...')
  const mergeConfig = createMergeBuilder<Patient>()
    .timestampField('updatedAt')
    .defaultStrategy('preferNonNull')
    .onConflict('useDefault')
    // Standard strategies for basic fields
    .field('firstName').strategy('preferLonger')
    .field('lastName').strategy('preferLonger')
    .field('dateOfBirth').strategy('preferFirst')
    .field('insuranceId').strategy('preferNewer')
    .field('primaryPhysician').strategy('preferNonNull')
    // Use inline custom merge function for MRN
    .field('mrn').custom<string>((values, records) => {
      // Custom inline logic: prefer MRN from record with most recent visit
      const recordsWithVisits = records
        .filter((r) => r.record.lastVisit instanceof Date)
        .sort((a, b) => {
          const aVisit = (a.record as Patient).lastVisit
          const bVisit = (b.record as Patient).lastVisit
          return bVisit.getTime() - aVisit.getTime()
        })

      if (recordsWithVisits.length > 0) {
        return (recordsWithVisits[0].record as Patient).mrn
      }
      return values.find((v) => v !== null && v !== undefined) as string
    })
    // Use registered custom strategies for complex fields
    .field('allergies').custom<string[]>((values) => {
      // Combine and deduplicate
      const allItems = values.filter((v): v is string[] => Array.isArray(v)).flat()
      const seen = new Map<string, string>()
      for (const item of allItems) {
        const normalized = item.trim().toLowerCase()
        if (!seen.has(normalized)) {
          seen.set(normalized, item.trim())
        }
      }
      return Array.from(seen.values()).sort()
    })
    .field('medications').custom<string[]>((values) => {
      // Same logic for medications
      const allItems = values.filter((v): v is string[] => Array.isArray(v)).flat()
      const seen = new Map<string, string>()
      for (const item of allItems) {
        const normalized = item.trim().toLowerCase()
        if (!seen.has(normalized)) {
          seen.set(normalized, item.trim())
        }
      }
      return Array.from(seen.values()).sort()
    })
    .field('emergencyContact').custom<Patient['emergencyContact']>((values) => {
      const contacts = values.filter(
        (v) => v !== null && v !== undefined
      ) as Patient['emergencyContact'][]

      if (contacts.length === 0) return undefined

      // Score each contact by completeness
      const scored = contacts.map((contact, index) => {
        let score = 0
        if (contact?.name) score++
        if (contact?.phone) score++
        if (contact?.relationship) score++
        return { contact, score, index }
      })

      // Sort by score descending
      scored.sort((a, b) => b.score - a.score || a.index - b.index)
      return scored[0].contact
    })
    .field('lastVisit').custom<Date>((values) => {
      const validDates = values
        .filter((v): v is Date => v instanceof Date && !isNaN(v.getTime()))
        .sort((a, b) => b.getTime() - a.getTime())
      return validDates.length > 0 ? validDates[0] : undefined
    })
    .build()

  console.log('Merge configuration created with custom strategies\n')

  // Step 3: Create merge executor
  const executor = new MergeExecutor<Patient>(mergeConfig)

  // Step 4: Prepare source records
  console.log('Step 3: Preparing source records...')
  const now = new Date()
  const lastMonth = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

  const sourceRecords: SourceRecord<Patient>[] = [
    {
      id: 'patient-001',
      record: {
        firstName: 'Robert',
        lastName: 'Johnson',
        dateOfBirth: '1985-03-15',
        mrn: 'MRN12345',
        insuranceId: 'INS-OLD-001',
        primaryPhysician: 'Dr. Smith',
        allergies: ['Penicillin', 'Sulfa'],
        medications: ['Lisinopril', 'Metformin'],
        emergencyContact: {
          name: 'Sarah Johnson',
          phone: '',  // Missing phone
          relationship: 'spouse',
        },
        lastVisit: lastMonth,
        updatedAt: lastMonth,
      },
      createdAt: lastMonth,
      updatedAt: lastMonth,
    },
    {
      id: 'patient-002',
      record: {
        firstName: 'Bob',
        lastName: 'Johnson Jr.',
        dateOfBirth: '1985-03-15',
        mrn: 'MRN12345',
        insuranceId: 'INS-NEW-002',
        primaryPhysician: undefined,
        allergies: ['penicillin', 'Latex'],  // Note: different case for penicillin
        medications: ['Lisinopril', 'Atorvastatin'],  // Different med list
        emergencyContact: {
          name: 'Sarah Johnson',
          phone: '+1-555-0199',
          relationship: 'spouse',
        },
        lastVisit: now,
        updatedAt: now,
      },
      createdAt: now,
      updatedAt: now,
    },
  ]

  console.log('Source Record 1 (older):')
  console.log(`  Name: ${sourceRecords[0].record.firstName} ${sourceRecords[0].record.lastName}`)
  console.log(`  Allergies: ${sourceRecords[0].record.allergies.join(', ')}`)
  console.log(`  Emergency contact phone: "${sourceRecords[0].record.emergencyContact?.phone}"`)

  console.log('\nSource Record 2 (newer):')
  console.log(`  Name: ${sourceRecords[1].record.firstName} ${sourceRecords[1].record.lastName}`)
  console.log(`  Allergies: ${sourceRecords[1].record.allergies.join(', ')}`)
  console.log(`  Emergency contact phone: "${sourceRecords[1].record.emergencyContact?.phone}"`)
  console.log()

  // Step 5: Execute the merge
  console.log('Step 4: Executing merge with custom strategies...')
  const result = await executor.merge({
    sourceRecords,
    mergedBy: 'patient-merge-system',
  })

  // Step 6: Display results
  console.log('\nStep 5: Examining the golden record...')
  console.log('Golden Record:')
  console.log(`  Name: ${result.goldenRecord.firstName} ${result.goldenRecord.lastName}`)
  console.log(`  DOB: ${result.goldenRecord.dateOfBirth}`)
  console.log(`  MRN: ${result.goldenRecord.mrn}`)
  console.log(`  Insurance ID: ${result.goldenRecord.insuranceId}`)
  console.log(`  Primary Physician: ${result.goldenRecord.primaryPhysician}`)
  console.log()

  console.log('Merged Medical Lists (custom strategy):')
  console.log(`  Allergies: ${result.goldenRecord.allergies.join(', ')}`)
  console.log(`  Medications: ${result.goldenRecord.medications.join(', ')}`)
  console.log()

  console.log('Emergency Contact (preferCompleteContact strategy):')
  console.log(`  Name: ${result.goldenRecord.emergencyContact?.name}`)
  console.log(`  Phone: ${result.goldenRecord.emergencyContact?.phone}`)
  console.log(`  Relationship: ${result.goldenRecord.emergencyContact?.relationship}`)
  console.log()

  console.log('Visit History:')
  console.log(`  Last Visit: ${result.goldenRecord.lastVisit?.toISOString()}`)
  console.log()

  // Step 7: Highlight custom strategy effects
  console.log('Step 6: Custom strategy effects:')
  console.log()
  console.log('1. preferLonger selected:')
  console.log(`   - "Robert" (6 chars) over "Bob" (3 chars)`)
  console.log(`   - "Johnson Jr." (11 chars) over "Johnson" (7 chars)`)
  console.log()
  console.log('2. mergeUniqueMedicalList for allergies:')
  console.log('   - Combined: Penicillin, Sulfa + penicillin, Latex')
  console.log(`   - Deduplicated (case-insensitive): ${result.goldenRecord.allergies.join(', ')}`)
  console.log()
  console.log('3. preferCompleteContact for emergency contact:')
  console.log('   - Record 1 contact was missing phone')
  console.log('   - Record 2 contact had all fields complete')
  console.log('   - Selected the more complete contact')
  console.log()

  console.log('=== Example Complete ===')

  return result
}

// Run the example
customStrategiesExample().catch((error) => {
  console.error('Error running example:', error)
  process.exit(1)
})
