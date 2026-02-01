/**
 * Basic Merge Example
 *
 * This example demonstrates the fundamental merge workflow:
 * 1. Configure merge strategies for different fields
 * 2. Create source records to merge
 * 3. Execute the merge to create a golden record
 * 4. Inspect the merge result with provenance tracking
 */

import {
  MergeExecutor,
  createInMemoryProvenanceStore,
  createMergeBuilder,
} from '../../src/merge'
import type { SourceRecord, MergeResult } from '../../src/merge'

interface Customer {
  id?: string
  firstName: string
  lastName: string
  email: string
  phone?: string
  company?: string
  addresses?: string[]
  createdAt: Date
  updatedAt: Date
}

async function basicMergeExample() {
  console.log('=== Basic Merge Example ===\n')

  // Step 1: Configure merge strategies using the fluent builder
  console.log('Step 1: Configuring merge strategies...')
  const mergeConfig = createMergeBuilder<Customer>()
    .timestampField('updatedAt')
    .defaultStrategy('preferNonNull')
    .onConflict('useDefault')
    .field('firstName').strategy('preferLonger')
    .field('lastName').strategy('preferLonger')
    .field('email').strategy('preferNewer')
    .field('phone').strategy('preferNonNull')
    .field('company').strategy('preferNewer')
    .field('addresses').strategy('union')
    .build()

  console.log('Merge configuration:')
  console.log(`  Default strategy: ${mergeConfig.defaultStrategy}`)
  console.log(`  Timestamp field: ${mergeConfig.timestampField}`)
  console.log(`  Conflict resolution: ${mergeConfig.conflictResolution}`)
  console.log(`  Field strategies:`)
  for (const fs of mergeConfig.fieldStrategies) {
    console.log(`    - ${fs.field}: ${fs.strategy}`)
  }
  console.log()

  // Step 2: Create the merge executor
  console.log('Step 2: Creating merge executor...')
  const executor = new MergeExecutor<Customer>(mergeConfig)
  console.log('Merge executor created\n')

  // Step 3: Prepare source records to merge
  console.log('Step 3: Preparing source records...')
  const now = new Date()
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000)

  const sourceRecords: SourceRecord<Customer>[] = [
    {
      id: 'rec-001',
      record: {
        firstName: 'Jon',
        lastName: 'Smith',
        email: 'jon.smith@oldmail.com',
        phone: '+1-555-0100',
        company: 'Acme Corp',
        addresses: ['123 Main St'],
        createdAt: hourAgo,
        updatedAt: hourAgo,
      },
      createdAt: hourAgo,
      updatedAt: hourAgo,
    },
    {
      id: 'rec-002',
      record: {
        firstName: 'Jonathan',
        lastName: 'Smith',
        email: 'jonathan.smith@newmail.com',
        phone: undefined,
        company: 'Acme Corporation',
        addresses: ['456 Oak Ave'],
        createdAt: now,
        updatedAt: now,
      },
      createdAt: now,
      updatedAt: now,
    },
  ]

  console.log('Source Record 1 (older):')
  console.log(JSON.stringify(sourceRecords[0].record, null, 2))
  console.log('\nSource Record 2 (newer):')
  console.log(JSON.stringify(sourceRecords[1].record, null, 2))
  console.log()

  // Step 4: Execute the merge
  console.log('Step 4: Executing merge...')
  const result: MergeResult<Customer> = await executor.merge({
    sourceRecords,
    mergedBy: 'system',
  })

  // Step 5: Display the golden record
  console.log('Step 5: Golden record created!\n')
  console.log('Golden Record:')
  console.log(JSON.stringify(result.goldenRecord, null, 2))
  console.log()

  // Step 6: Examine provenance tracking
  console.log('Step 6: Examining provenance...')
  console.log(`Golden Record ID: ${result.goldenRecordId}`)
  console.log(`Source Records: ${result.provenance.sourceRecordIds.join(', ')}`)
  console.log(`Merged At: ${result.provenance.mergedAt.toISOString()}`)
  console.log(`Merged By: ${result.provenance.mergedBy}`)
  console.log()

  console.log('Field-level provenance:')
  for (const [field, prov] of Object.entries(result.provenance.fieldSources)) {
    console.log(`  ${field}:`)
    console.log(`    Selected from: ${prov.sourceRecordId}`)
    console.log(`    Strategy: ${prov.strategyApplied}`)
    console.log(`    Had conflict: ${prov.hadConflict}`)
  }
  console.log()

  // Step 7: Examine merge statistics
  console.log('Step 7: Merge statistics...')
  console.log(`Total fields merged: ${result.stats.totalFields}`)
  console.log(`Conflicts resolved: ${result.stats.conflictsResolved}`)
  console.log(`Conflicts deferred: ${result.stats.conflictsDeferred}`)
  console.log('Fields from each source:')
  for (const [sourceId, count] of Object.entries(result.stats.fieldsFromEachSource)) {
    console.log(`  ${sourceId}: ${count} fields`)
  }
  console.log()

  // Step 8: Examine any conflicts
  console.log('Step 8: Conflicts encountered...')
  if (result.conflicts.length === 0) {
    console.log('No conflicts (all resolved automatically)')
  } else {
    for (const conflict of result.conflicts) {
      console.log(`  Field: ${conflict.field}`)
      console.log(`  Resolution: ${conflict.resolution}`)
      console.log(`  Resolved value: ${JSON.stringify(conflict.resolvedValue)}`)
      console.log(`  Reason: ${conflict.resolutionReason}`)
    }
  }
  console.log()

  console.log('=== Example Complete ===')
  console.log('\nKey takeaways:')
  console.log('- preferLonger selected "Jonathan" over "Jon"')
  console.log('- preferNewer selected the newer email and company')
  console.log('- preferNonNull selected the phone from the record that had it')
  console.log('- union combined both addresses into a single array')

  return result
}

// Run the example
basicMergeExample().catch((error) => {
  console.error('Error running example:', error)
  process.exit(1)
})
