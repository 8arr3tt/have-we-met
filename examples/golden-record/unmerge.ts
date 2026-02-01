/**
 * Unmerge Example
 *
 * This example demonstrates how to undo a merge and restore source records:
 * 1. Create source records and execute a merge
 * 2. Store provenance and archive source records
 * 3. Discover the merge was incorrect
 * 4. Execute an unmerge operation
 * 5. Verify source records are restored
 */

import {
  MergeExecutor,
  UnmergeExecutor,
  createInMemoryProvenanceStore,
  createInMemorySourceRecordArchive,
  createMergeBuilder,
} from '../../src/merge'
import type { SourceRecord, Provenance } from '../../src/merge'

interface Employee {
  id: string
  firstName: string
  lastName: string
  email: string
  department: string
  employeeId: string
  hireDate: Date
  updatedAt: Date
}

// Simulated database
const employeesDb = new Map<string, Employee>()

async function unmergeExample() {
  console.log('=== Unmerge Example ===\n')

  // Step 1: Set up merge and unmerge infrastructure
  console.log('Step 1: Setting up merge/unmerge infrastructure...')
  const provenanceStore = createInMemoryProvenanceStore()
  const sourceRecordArchive = createInMemorySourceRecordArchive<Employee>()

  const mergeConfig = createMergeBuilder<Employee>()
    .timestampField('updatedAt')
    .defaultStrategy('preferNonNull')
    .onConflict('useDefault')
    .field('firstName').strategy('preferLonger')
    .field('lastName').strategy('preferLonger')
    .field('email').strategy('preferNewer')
    .field('department').strategy('preferNewer')
    .field('employeeId').strategy('preferFirst')
    .field('hireDate').strategy('preferOlder')
    .build()

  const mergeExecutor = new MergeExecutor<Employee>(mergeConfig)

  // Track deleted golden records
  const deletedGoldenRecords: string[] = []

  const unmergeExecutor = new UnmergeExecutor<Employee>({
    provenanceStore,
    sourceRecordArchive,
    onRecordRestore: async (record) => {
      console.log(`  [DB] Restoring record ${record.id}`)
      employeesDb.set(record.id, record.record)
    },
    onGoldenRecordDelete: async (goldenRecordId) => {
      console.log(`  [DB] Deleting golden record ${goldenRecordId}`)
      employeesDb.delete(goldenRecordId)
      deletedGoldenRecords.push(goldenRecordId)
    },
  })

  console.log('Infrastructure created')
  console.log()

  // Step 2: Create source records
  console.log('Step 2: Creating source records to merge...')
  const now = new Date()
  const yearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000)

  const sourceRecords: SourceRecord<Employee>[] = [
    {
      id: 'emp-001',
      record: {
        id: 'emp-001',
        firstName: 'Bob',
        lastName: 'Williams',
        email: 'bob.williams@company.com',
        department: 'Engineering',
        employeeId: 'E1001',
        hireDate: yearAgo,
        updatedAt: yearAgo,
      },
      createdAt: yearAgo,
      updatedAt: yearAgo,
    },
    {
      id: 'emp-002',
      record: {
        id: 'emp-002',
        firstName: 'Robert',
        lastName: 'Williams',
        email: 'robert.williams@company.com',
        department: 'Product',
        employeeId: 'E2001',
        hireDate: now,
        updatedAt: now,
      },
      createdAt: now,
      updatedAt: now,
    },
  ]

  // Add to database
  for (const sr of sourceRecords) {
    employeesDb.set(sr.id, sr.record)
  }

  console.log('Source Record 1 (Bob):')
  console.log(`  ID: ${sourceRecords[0].id}`)
  console.log(`  Name: ${sourceRecords[0].record.firstName} ${sourceRecords[0].record.lastName}`)
  console.log(`  Email: ${sourceRecords[0].record.email}`)
  console.log(`  Department: ${sourceRecords[0].record.department}`)
  console.log(`  Employee ID: ${sourceRecords[0].record.employeeId}`)

  console.log('\nSource Record 2 (Robert):')
  console.log(`  ID: ${sourceRecords[1].id}`)
  console.log(`  Name: ${sourceRecords[1].record.firstName} ${sourceRecords[1].record.lastName}`)
  console.log(`  Email: ${sourceRecords[1].record.email}`)
  console.log(`  Department: ${sourceRecords[1].record.department}`)
  console.log(`  Employee ID: ${sourceRecords[1].record.employeeId}`)
  console.log()

  // Step 3: Execute the merge (incorrectly)
  console.log('Step 3: Executing merge (this will turn out to be incorrect)...')
  const mergeResult = await mergeExecutor.merge({
    sourceRecords,
    targetRecordId: 'golden-emp-001',
    mergedBy: 'auto-merge-system',
  })

  // Archive source records and update database
  await sourceRecordArchive.archive(sourceRecords, mergeResult.goldenRecordId)
  employeesDb.delete('emp-001')
  employeesDb.delete('emp-002')
  employeesDb.set(mergeResult.goldenRecordId, mergeResult.goldenRecord)

  // Store provenance
  await provenanceStore.save(mergeResult.provenance)

  console.log('Merge completed!')
  console.log('Golden Record:')
  console.log(`  ID: ${mergeResult.goldenRecordId}`)
  console.log(`  Name: ${mergeResult.goldenRecord.firstName} ${mergeResult.goldenRecord.lastName}`)
  console.log(`  Email: ${mergeResult.goldenRecord.email}`)
  console.log(`  Department: ${mergeResult.goldenRecord.department}`)
  console.log(`  Employee ID: ${mergeResult.goldenRecord.employeeId}`)
  console.log()

  console.log('Database state after merge:')
  console.log(`  Total records: ${employeesDb.size}`)
  console.log(`  Records: ${Array.from(employeesDb.keys()).join(', ')}`)
  console.log()

  // Step 4: Realize the merge was incorrect
  console.log('Step 4: Discovering the merge was incorrect...')
  console.log()
  console.log('  Analysis:')
  console.log('  - Bob Williams (E1001) - Senior engineer, hired a year ago')
  console.log('  - Robert Williams (E2001) - New product manager, just hired')
  console.log('  - These are different people with similar names!')
  console.log('  - Employee IDs are completely different')
  console.log('  - Departments are different')
  console.log()
  console.log('  CONCLUSION: This merge was a FALSE POSITIVE')
  console.log()

  // Step 5: Check if we can unmerge
  console.log('Step 5: Checking if unmerge is possible...')
  const canUnmerge = await unmergeExecutor.canUnmerge(mergeResult.goldenRecordId)
  console.log(`  Can unmerge: ${canUnmerge.canUnmerge}`)
  if (!canUnmerge.canUnmerge) {
    console.log(`  Reason: ${canUnmerge.reason}`)
    return
  }
  console.log(`  Provenance found: Yes`)
  console.log(`  Source records in archive: ${canUnmerge.provenance?.sourceRecordIds.length}`)
  console.log()

  // Step 6: Execute the unmerge
  console.log('Step 6: Executing unmerge operation...')
  const unmergeResult = await unmergeExecutor.unmerge(
    {
      goldenRecordId: mergeResult.goldenRecordId,
      unmergedBy: 'admin-review',
      reason: 'False positive - Bob Williams and Robert Williams are different employees',
    },
    { mode: 'full' }
  )

  console.log()
  console.log('Unmerge completed!')
  console.log(`  Golden record deleted: ${unmergeResult.goldenRecordDeleted}`)
  console.log(`  Records restored: ${unmergeResult.restoredRecords.length}`)
  console.log()

  // Step 7: Verify source records were restored
  console.log('Step 7: Verifying restored source records...')
  for (const restored of unmergeResult.restoredRecords) {
    console.log(`\nRestored Record:`)
    console.log(`  ID: ${restored.id}`)
    console.log(`  Name: ${restored.record.firstName} ${restored.record.lastName}`)
    console.log(`  Email: ${restored.record.email}`)
    console.log(`  Department: ${restored.record.department}`)
    console.log(`  Employee ID: ${restored.record.employeeId}`)
  }
  console.log()

  // Step 8: Check database state
  console.log('Step 8: Final database state...')
  console.log(`  Total records: ${employeesDb.size}`)
  console.log(`  Records: ${Array.from(employeesDb.keys()).join(', ')}`)
  console.log()

  // Step 9: Verify provenance was updated
  console.log('Step 9: Verifying provenance audit trail...')
  const updatedProvenance = await provenanceStore.get(mergeResult.goldenRecordId)
  if (updatedProvenance) {
    console.log('Provenance record (marked as unmerged):')
    console.log(`  Golden Record ID: ${updatedProvenance.goldenRecordId}`)
    console.log(`  Merged At: ${updatedProvenance.mergedAt.toISOString()}`)
    console.log(`  Merged By: ${updatedProvenance.mergedBy}`)
    console.log(`  Unmerged: ${updatedProvenance.unmerged}`)
    console.log(`  Unmerged At: ${updatedProvenance.unmergedAt?.toISOString()}`)
    console.log(`  Unmerged By: ${updatedProvenance.unmergedBy}`)
    console.log(`  Unmerge Reason: ${updatedProvenance.unmergeReason}`)
  }
  console.log()

  // Step 10: Demonstrate that unmerging again would fail
  console.log('Step 10: Verifying unmerge can only happen once...')
  const canUnmergeAgain = await unmergeExecutor.canUnmerge(mergeResult.goldenRecordId)
  console.log(`  Can unmerge again: ${canUnmergeAgain.canUnmerge}`)
  console.log(`  Reason: ${canUnmergeAgain.reason}`)
  console.log()

  console.log('=== Example Complete ===')
  console.log()
  console.log('Summary:')
  console.log('- Two employee records were incorrectly merged')
  console.log('- The golden record was created and source records archived')
  console.log('- After discovering the false positive, unmerge was executed')
  console.log('- Source records were restored to the database')
  console.log('- Golden record was deleted')
  console.log('- Provenance maintains complete audit trail')
  console.log('- Cannot unmerge the same record twice')

  return unmergeResult
}

// Run the example
unmergeExample().catch((error) => {
  console.error('Error running example:', error)
  process.exit(1)
})
