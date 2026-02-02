# Batch Migration Guide

This guide demonstrates how to use have-we-met for large-scale data migration and consolidation projects. Batch migration involves deduplicating and merging records from multiple source systems into a unified target system.

## Overview

### The Challenge

Data migration projects face unique challenges:

- **Multiple sources**: CRM, ERP, legacy systems, acquired company data
- **Inconsistent formats**: Different field names, date formats, phone formats
- **Varying quality**: Some sources pristine, others full of errors
- **Volume**: Millions of records requiring efficient processing
- **Accountability**: Need to track where every record came from

### Goals

- **Complete deduplication**: No duplicates in the target system
- **Data preservation**: Don't lose valuable information during merge
- **Traceability**: Track every record's origin through provenance
- **Scalability**: Handle millions of records in reasonable time
- **Recoverability**: Ability to undo mistakes

## Migration Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Migration Pipeline                            │
└─────────────────────────────────────────────────────────────────────┘

  ┌──────────┐  ┌──────────┐  ┌──────────┐
  │  CRM     │  │  Legacy  │  │ Acquired │
  │  System  │  │  System  │  │ Company  │
  └────┬─────┘  └────┬─────┘  └────┬─────┘
       │             │             │
       ▼             ▼             ▼
  ┌────────────────────────────────────────┐
  │          1. Extract & Normalize         │
  │  - Map fields to common schema          │
  │  - Apply normalizers                    │
  │  - Tag with source system               │
  └─────────────────┬──────────────────────┘
                    │
                    ▼
  ┌────────────────────────────────────────┐
  │          2. Batch Deduplication         │
  │  - Block similar records                │
  │  - Score all pairs                      │
  │  - Classify: match/no-match/potential   │
  └─────────────────┬──────────────────────┘
                    │
       ┌────────────┼────────────┐
       ▼            ▼            ▼
  ┌─────────┐  ┌─────────┐  ┌─────────┐
  │ Definite│  │Potential│  │   No    │
  │ Matches │  │ Matches │  │ Matches │
  └────┬────┘  └────┬────┘  └────┬────┘
       │            │            │
       ▼            ▼            ▼
  ┌─────────┐  ┌─────────┐  ┌─────────┐
  │Auto-    │  │ Review  │  │ Direct  │
  │Merge    │  │ Queue   │  │ Import  │
  └────┬────┘  └────┬────┘  └────┬────┘
       │            │            │
       └────────────┼────────────┘
                    │
                    ▼
  ┌────────────────────────────────────────┐
  │          3. Load to Target              │
  │  - Golden records created               │
  │  - Provenance stored                    │
  │  - Source links maintained              │
  └────────────────────────────────────────┘
```

## Complete Implementation

### Step 1: Define Common Schema

```typescript
import { HaveWeMet } from 'have-we-met'
import { prismaAdapter } from 'have-we-met/adapters/prisma'

// Unified schema for all source systems
interface UnifiedPerson {
  id?: string
  sourceSystem: 'crm' | 'legacy' | 'acquired'
  sourceId: string

  // Core identifiers
  email?: string
  phone?: string
  alternatePhone?: string

  // Name fields
  firstName: string
  middleName?: string
  lastName: string
  suffix?: string

  // Address
  addressLine1?: string
  addressLine2?: string
  city?: string
  state?: string
  postalCode?: string
  country?: string

  // Dates
  dateOfBirth?: string
  createdAt: Date
  updatedAt: Date

  // Metadata
  accountType?: string
  status?: string
  tags?: string[]
}
```

### Step 2: Create Source Extractors

```typescript
// CRM Extractor
async function extractFromCRM(): AsyncGenerator<UnifiedPerson> {
  const batchSize = 1000
  let offset = 0

  while (true) {
    const records = await crmDb.query(`
      SELECT * FROM contacts
      ORDER BY id
      LIMIT ${batchSize} OFFSET ${offset}
    `)

    if (records.length === 0) break

    for (const record of records) {
      yield normalizeCRMRecord(record)
    }

    offset += batchSize
  }
}

function normalizeCRMRecord(record: CRMContact): UnifiedPerson {
  return {
    sourceSystem: 'crm',
    sourceId: record.contact_id,
    email: record.email_address?.toLowerCase().trim(),
    phone: normalizePhone(record.phone_number),
    firstName: normalizeName(record.first_name),
    lastName: normalizeName(record.last_name),
    addressLine1: record.street_address,
    city: record.city,
    state: record.state_province,
    postalCode: normalizePostalCode(record.zip_code),
    country: record.country || 'US',
    createdAt: new Date(record.created_date),
    updatedAt: new Date(record.modified_date),
    accountType: record.account_type,
    status: record.status
  }
}

// Legacy System Extractor
async function extractFromLegacy(): AsyncGenerator<UnifiedPerson> {
  const batchSize = 1000
  let offset = 0

  while (true) {
    const records = await legacyDb.query(`
      SELECT * FROM CUSTOMER_MASTER
      ORDER BY CUST_ID
      OFFSET ${offset} ROWS FETCH NEXT ${batchSize} ROWS ONLY
    `)

    if (records.length === 0) break

    for (const record of records) {
      yield normalizeLegacyRecord(record)
    }

    offset += batchSize
  }
}

function normalizeLegacyRecord(record: LegacyCustomer): UnifiedPerson {
  // Legacy system uses YYYYMMDD dates
  const dob = record.DOB
    ? `${record.DOB.slice(0,4)}-${record.DOB.slice(4,6)}-${record.DOB.slice(6,8)}`
    : undefined

  return {
    sourceSystem: 'legacy',
    sourceId: record.CUST_ID,
    email: record.EMAIL?.toLowerCase().trim(),
    phone: normalizePhone(record.PHONE1),
    alternatePhone: normalizePhone(record.PHONE2),
    firstName: normalizeName(record.FNAME),
    lastName: normalizeName(record.LNAME),
    middleName: normalizeName(record.MI),
    addressLine1: record.ADDR1,
    addressLine2: record.ADDR2,
    city: record.CITY,
    state: record.STATE,
    postalCode: normalizePostalCode(record.ZIP),
    country: 'US',
    dateOfBirth: dob,
    createdAt: new Date(record.CREATE_DT),
    updatedAt: new Date(record.UPDATE_DT),
    status: mapLegacyStatus(record.STATUS_CD)
  }
}

// Acquired Company Extractor
async function extractFromAcquired(): AsyncGenerator<UnifiedPerson> {
  // Similar pattern for acquired company data
  // ...
}
```

### Step 3: Configure the Resolver

```typescript
const prisma = new PrismaClient()

const resolver = HaveWeMet.create<UnifiedPerson>()
  .schema(schema => schema
    .field('email').type('email')
    .field('phone').type('phone')
    .field('alternatePhone').type('phone')
    .field('firstName').type('name').component('first')
    .field('middleName').type('name').component('middle')
    .field('lastName').type('name').component('last')
    .field('dateOfBirth').type('date')
    .field('addressLine1').type('address')
    .field('city').type('string')
    .field('state').type('string')
    .field('postalCode').type('string')
    .field('country').type('string')
    .field('createdAt').type('date')
    .field('updatedAt').type('date')
    .field('sourceSystem').type('string')
    .field('sourceId').type('string')
  )
  .blocking(block => block
    // Composite blocking for maximum recall during migration
    .composite('union', comp => comp
      // Primary: Last name soundex + birth year
      .onFields(['lastName', 'dateOfBirth'], {
        transforms: {
          lastName: 'soundex',
          dateOfBirth: 'year'
        }
      })
      // Secondary: Email domain
      .onField('email', { transform: 'domain' })
      // Tertiary: Phone area code
      .onField('phone', { transform: 'firstN', n: 3 })
    )
  )
  .matching(match => match
    // Email is highly reliable
    .field('email').strategy('exact').weight(25)

    // Phone numbers
    .field('phone').strategy('exact').weight(15)
    .field('alternatePhone').strategy('exact').weight(10)

    // Names with fuzzy matching
    .field('firstName').strategy('jaro-winkler').weight(12).threshold(0.88)
    .field('lastName').strategy('jaro-winkler').weight(15).threshold(0.90)
    .field('middleName').strategy('jaro-winkler').weight(5).threshold(0.85)

    // Date of birth - exact match
    .field('dateOfBirth').strategy('exact').weight(15)

    // Address matching
    .field('postalCode').strategy('exact').weight(8)
    .field('city').strategy('jaro-winkler').weight(5).threshold(0.85)
    .field('state').strategy('exact').weight(3)

    // Balanced thresholds for migration
    // Max: ~113, noMatch: 25, definiteMatch: 60
    .thresholds({ noMatch: 25, definiteMatch: 60 })
  )
  .merge(merge => merge
    .timestampField('updatedAt')
    .defaultStrategy('preferNonNull')

    // Names: prefer longer (more complete)
    .field('firstName').strategy('preferLonger')
    .field('middleName').strategy('preferLonger')
    .field('lastName').strategy('preferLonger')

    // Contact: prefer most recent
    .field('email').strategy('preferNewer')
    .field('phone').strategy('preferNewer')
    .field('alternatePhone').strategy('preferNonNull')

    // Address: prefer most recent
    .field('addressLine1').strategy('preferNewer')
    .field('addressLine2').strategy('preferNewer')
    .field('city').strategy('preferNewer')
    .field('state').strategy('preferNewer')
    .field('postalCode').strategy('preferNewer')

    // Metadata: custom logic
    .field('tags').strategy('union')
    .field('status').custom((values, records) => {
      // Prefer 'active' over other statuses
      if (values.includes('active')) return 'active'
      return values.find(v => v) || 'unknown'
    })

    // Always track provenance
    .trackProvenance(true)
  )
  .adapter(prismaAdapter(prisma, {
    tableName: 'unified_persons',
    queue: {
      autoExpireAfter: 90 * 24 * 60 * 60 * 1000,  // 90 days
      defaultPriority: 0
    }
  }))
  .build()
```

### Step 4: Run the Migration

```typescript
interface MigrationStats {
  extracted: number
  definiteMatches: number
  potentialMatches: number
  noMatches: number
  merged: number
  errors: number
  duration: number
}

async function runMigration(): Promise<MigrationStats> {
  const startTime = Date.now()
  const stats: MigrationStats = {
    extracted: 0,
    definiteMatches: 0,
    potentialMatches: 0,
    noMatches: 0,
    merged: 0,
    errors: 0,
    duration: 0
  }

  console.log('Starting migration...')

  // Phase 1: Extract and stage all records
  console.log('\n--- Phase 1: Extraction ---')
  const allRecords: UnifiedPerson[] = []

  for await (const record of extractFromCRM()) {
    allRecords.push(record)
    stats.extracted++
    if (stats.extracted % 10000 === 0) {
      console.log(`Extracted ${stats.extracted} records...`)
    }
  }
  console.log(`CRM extraction complete: ${stats.extracted} records`)

  const crmCount = stats.extracted
  for await (const record of extractFromLegacy()) {
    allRecords.push(record)
    stats.extracted++
    if ((stats.extracted - crmCount) % 10000 === 0) {
      console.log(`Extracted ${stats.extracted} records...`)
    }
  }
  console.log(`Legacy extraction complete: ${stats.extracted - crmCount} additional records`)

  const legacyCount = stats.extracted
  for await (const record of extractFromAcquired()) {
    allRecords.push(record)
    stats.extracted++
  }
  console.log(`Acquired extraction complete: ${stats.extracted - legacyCount} additional records`)

  console.log(`\nTotal extracted: ${stats.extracted} records`)

  // Phase 2: Batch deduplication
  console.log('\n--- Phase 2: Deduplication ---')
  const batchSize = 10000

  for (let i = 0; i < allRecords.length; i += batchSize) {
    const batch = allRecords.slice(i, i + batchSize)
    console.log(`Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(allRecords.length/batchSize)}...`)

    try {
      const results = await resolver.deduplicateBatch(batch, {
        autoQueue: true,
        queueContext: {
          source: 'batch-migration',
          metadata: {
            batchNumber: Math.floor(i/batchSize) + 1,
            migrationDate: new Date().toISOString()
          }
        }
      })

      stats.definiteMatches += results.definiteMatches
      stats.potentialMatches += results.potentialMatches
      stats.noMatches += results.noMatches

      // Auto-merge definite matches
      for (const match of results.matches.filter(m => m.outcome === 'definite-match')) {
        try {
          await resolver.merge([match.recordA, match.recordB], {
            mergedBy: 'migration-system'
          })
          stats.merged++
        } catch (error) {
          console.error('Merge error:', error)
          stats.errors++
        }
      }
    } catch (error) {
      console.error(`Batch error at ${i}:`, error)
      stats.errors++
    }
  }

  // Phase 3: Import unique records
  console.log('\n--- Phase 3: Import Unique Records ---')
  // Records with no matches go directly to target
  // (This is handled by the adapter automatically)

  stats.duration = Date.now() - startTime

  console.log('\n=== Migration Complete ===')
  console.log(`Total extracted: ${stats.extracted}`)
  console.log(`Definite matches: ${stats.definiteMatches}`)
  console.log(`Potential matches (queued): ${stats.potentialMatches}`)
  console.log(`No matches (unique): ${stats.noMatches}`)
  console.log(`Records merged: ${stats.merged}`)
  console.log(`Errors: ${stats.errors}`)
  console.log(`Duration: ${(stats.duration / 1000 / 60).toFixed(2)} minutes`)

  return stats
}
```

### Step 5: Process the Review Queue

```typescript
async function processReviewQueue() {
  const stats = {
    reviewed: 0,
    confirmed: 0,
    rejected: 0,
    skipped: 0
  }

  // Get queue statistics
  const queueStats = await resolver.queue.stats()
  console.log(`Queue contains ${queueStats.byStatus.pending} pending items`)

  // Process in batches
  while (true) {
    const batch = await resolver.queue.list({
      status: 'pending',
      orderBy: 'priority',
      orderDirection: 'desc',
      limit: 100
    })

    if (batch.items.length === 0) break

    for (const item of batch.items) {
      stats.reviewed++

      // Auto-decision logic for bulk processing
      const decision = evaluateMatch(item)

      if (decision.action === 'confirm') {
        await resolver.queue.merge(item.id, {
          selectedMatchId: decision.matchId,
          notes: decision.reason,
          confidence: decision.confidence,
          decidedBy: 'migration-auto-review'
        })
        stats.confirmed++
      } else if (decision.action === 'reject') {
        await resolver.queue.reject(item.id, {
          notes: decision.reason,
          confidence: decision.confidence,
          decidedBy: 'migration-auto-review'
        })
        stats.rejected++
      } else {
        // Leave for manual review
        stats.skipped++
      }

      if (stats.reviewed % 100 === 0) {
        console.log(`Reviewed ${stats.reviewed} items...`)
      }
    }
  }

  console.log('\n=== Review Queue Processing Complete ===')
  console.log(`Total reviewed: ${stats.reviewed}`)
  console.log(`Auto-confirmed: ${stats.confirmed}`)
  console.log(`Auto-rejected: ${stats.rejected}`)
  console.log(`Left for manual: ${stats.skipped}`)
}

interface MatchDecision {
  action: 'confirm' | 'reject' | 'manual'
  matchId?: string
  reason: string
  confidence: number
}

function evaluateMatch(item: QueueItem<UnifiedPerson>): MatchDecision {
  const candidate = item.candidateRecord
  const match = item.potentialMatches[0]

  if (!match) {
    return { action: 'reject', reason: 'No matches', confidence: 1 }
  }

  const normalizedScore = match.score / match.explanation.maxScore

  // High confidence - auto-confirm
  if (normalizedScore > 0.75 && hasStrongIdentifierMatch(match)) {
    return {
      action: 'confirm',
      matchId: match.record.id,
      reason: 'High score with identifier match',
      confidence: 0.9
    }
  }

  // Same source system - likely not the same person
  if (candidate.sourceSystem === match.record.sourceSystem) {
    return {
      action: 'reject',
      reason: 'Same source system - likely distinct records',
      confidence: 0.8
    }
  }

  // Low confidence - auto-reject
  if (normalizedScore < 0.45) {
    return {
      action: 'reject',
      reason: 'Score too low for probable match',
      confidence: 0.85
    }
  }

  // Uncertain - leave for manual review
  return {
    action: 'manual',
    reason: 'Requires human judgment',
    confidence: 0.5
  }
}

function hasStrongIdentifierMatch(match: MatchCandidate<UnifiedPerson>): boolean {
  const explanation = match.explanation

  // Check if email or phone contributed to score
  const emailMatch = explanation.fieldComparisons.find(
    fc => fc.field === 'email' && fc.contributed && fc.similarity === 1
  )
  const phoneMatch = explanation.fieldComparisons.find(
    fc => fc.field === 'phone' && fc.contributed && fc.similarity === 1
  )

  return !!(emailMatch || phoneMatch)
}
```

## Performance Optimization

### Parallel Processing

```typescript
import { cpus } from 'os'
import { Worker, isMainThread, parentPort, workerData } from 'worker_threads'

async function parallelMigration(records: UnifiedPerson[]) {
  const numWorkers = cpus().length
  const chunkSize = Math.ceil(records.length / numWorkers)

  const workers = []
  const results = []

  for (let i = 0; i < numWorkers; i++) {
    const start = i * chunkSize
    const end = Math.min(start + chunkSize, records.length)
    const chunk = records.slice(start, end)

    workers.push(runWorker(chunk))
  }

  const workerResults = await Promise.all(workers)

  // Aggregate results
  return workerResults.reduce((acc, result) => ({
    definiteMatches: acc.definiteMatches + result.definiteMatches,
    potentialMatches: acc.potentialMatches + result.potentialMatches,
    noMatches: acc.noMatches + result.noMatches
  }), { definiteMatches: 0, potentialMatches: 0, noMatches: 0 })
}

function runWorker(records: UnifiedPerson[]): Promise<BatchResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(__filename, {
      workerData: { records }
    })

    worker.on('message', resolve)
    worker.on('error', reject)
    worker.on('exit', code => {
      if (code !== 0) reject(new Error(`Worker exited with code ${code}`))
    })
  })
}

if (!isMainThread) {
  const { records } = workerData
  // Process chunk and send result back
  resolver.deduplicateBatch(records).then(result => {
    parentPort?.postMessage(result)
  })
}
```

### Memory Management

```typescript
async function* streamedMigration(
  sources: AsyncGenerator<UnifiedPerson>[],
  batchSize: number = 5000
): AsyncGenerator<BatchResult> {
  let batch: UnifiedPerson[] = []

  for (const source of sources) {
    for await (const record of source) {
      batch.push(record)

      if (batch.length >= batchSize) {
        yield await resolver.deduplicateBatch(batch, { autoQueue: true })
        batch = []

        // Allow GC to run
        await new Promise(resolve => setImmediate(resolve))
      }
    }
  }

  // Process remaining records
  if (batch.length > 0) {
    yield await resolver.deduplicateBatch(batch, { autoQueue: true })
  }
}

async function runStreamedMigration() {
  const sources = [
    extractFromCRM(),
    extractFromLegacy(),
    extractFromAcquired()
  ]

  let totalStats = {
    batches: 0,
    definiteMatches: 0,
    potentialMatches: 0,
    noMatches: 0
  }

  for await (const batchResult of streamedMigration(sources)) {
    totalStats.batches++
    totalStats.definiteMatches += batchResult.definiteMatches
    totalStats.potentialMatches += batchResult.potentialMatches
    totalStats.noMatches += batchResult.noMatches

    console.log(`Batch ${totalStats.batches} complete`)
  }

  return totalStats
}
```

### Database Optimization

```typescript
// Prisma batch operations
async function bulkInsertGoldenRecords(records: UnifiedPerson[]) {
  const batchSize = 1000

  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize)

    await prisma.unifiedPerson.createMany({
      data: batch,
      skipDuplicates: true
    })
  }
}

// Transaction for merge operations
async function transactionalMerge(
  sourceRecords: SourceRecord<UnifiedPerson>[],
  mergedBy: string
) {
  return prisma.$transaction(async (tx) => {
    // Create golden record
    const golden = await tx.unifiedPerson.create({
      data: mergeRecords(sourceRecords)
    })

    // Archive source records
    await tx.archivedPerson.createMany({
      data: sourceRecords.map(sr => ({
        ...sr.record,
        goldenRecordId: golden.id,
        archivedAt: new Date()
      }))
    })

    // Create provenance
    await tx.provenance.create({
      data: {
        goldenRecordId: golden.id,
        sourceRecordIds: sourceRecords.map(sr => sr.id),
        mergedBy,
        mergedAt: new Date()
      }
    })

    // Update source mappings
    await tx.sourceMapping.createMany({
      data: sourceRecords.map(sr => ({
        sourceSystem: sr.record.sourceSystem,
        sourceId: sr.record.sourceId,
        goldenRecordId: golden.id
      }))
    })

    return golden
  })
}
```

## Validation and Reconciliation

### Pre-Migration Validation

```typescript
async function validateMigrationReadiness() {
  const issues: string[] = []

  // Check source connectivity
  try {
    await crmDb.query('SELECT 1')
  } catch {
    issues.push('CRM database not accessible')
  }

  try {
    await legacyDb.query('SELECT 1 FROM DUAL')
  } catch {
    issues.push('Legacy database not accessible')
  }

  // Check target schema
  const tables = await prisma.$queryRaw`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
  `
  if (!tables.find(t => t.table_name === 'unified_persons')) {
    issues.push('Target table unified_persons does not exist')
  }

  // Check for required indexes
  // ...

  return {
    ready: issues.length === 0,
    issues
  }
}
```

### Post-Migration Reconciliation

```typescript
async function reconcileMigration() {
  // Count source records
  const crmCount = await crmDb.query('SELECT COUNT(*) as cnt FROM contacts')
  const legacyCount = await legacyDb.query('SELECT COUNT(*) as cnt FROM CUSTOMER_MASTER')

  // Count target records
  const goldenCount = await prisma.unifiedPerson.count()
  const archivedCount = await prisma.archivedPerson.count()
  const queueCount = await resolver.queue.stats()

  // Calculate expected vs actual
  const totalSource = crmCount + legacyCount
  const totalTarget = goldenCount + archivedCount + queueCount.byStatus.pending

  console.log('\n=== Reconciliation Report ===')
  console.log(`Source Records:`)
  console.log(`  CRM: ${crmCount}`)
  console.log(`  Legacy: ${legacyCount}`)
  console.log(`  Total: ${totalSource}`)
  console.log(`\nTarget Records:`)
  console.log(`  Golden Records: ${goldenCount}`)
  console.log(`  Archived (merged): ${archivedCount}`)
  console.log(`  Pending Review: ${queueCount.byStatus.pending}`)
  console.log(`  Total Accounted: ${totalTarget}`)
  console.log(`\nDifference: ${totalSource - totalTarget}`)

  // Identify missing records
  if (totalSource !== totalTarget) {
    console.log('\nInvestigating discrepancy...')
    // Query for records not in target
    // ...
  }
}
```

## Rollback and Recovery

### Creating Checkpoints

```typescript
async function createCheckpoint(name: string) {
  const checkpoint = {
    name,
    timestamp: new Date(),
    goldenRecordCount: await prisma.unifiedPerson.count(),
    archivedCount: await prisma.archivedPerson.count(),
    queueStats: await resolver.queue.stats()
  }

  await prisma.migrationCheckpoint.create({
    data: checkpoint
  })

  console.log(`Checkpoint '${name}' created`)
  return checkpoint
}
```

### Rollback to Checkpoint

```typescript
async function rollbackToCheckpoint(name: string) {
  const checkpoint = await prisma.migrationCheckpoint.findUnique({
    where: { name }
  })

  if (!checkpoint) {
    throw new Error(`Checkpoint '${name}' not found`)
  }

  console.log(`Rolling back to checkpoint '${name}' from ${checkpoint.timestamp}`)

  // Delete records created after checkpoint
  await prisma.unifiedPerson.deleteMany({
    where: { createdAt: { gt: checkpoint.timestamp } }
  })

  await prisma.archivedPerson.deleteMany({
    where: { archivedAt: { gt: checkpoint.timestamp } }
  })

  // Restore queue state
  await resolver.queue.cleanup({
    olderThan: checkpoint.timestamp,
    status: ['confirmed', 'rejected', 'merged']
  })

  console.log('Rollback complete')
}
```

### Unmerge Incorrectly Merged Records

```typescript
async function undoMerge(goldenRecordId: string, reason: string) {
  const provenance = await prisma.provenance.findUnique({
    where: { goldenRecordId },
    include: { sourceRecords: true }
  })

  if (!provenance) {
    throw new Error('Provenance not found for golden record')
  }

  // Restore original records
  await prisma.$transaction(async (tx) => {
    // Restore archived records
    for (const sourceRecord of provenance.sourceRecords) {
      await tx.unifiedPerson.create({
        data: {
          ...sourceRecord,
          id: undefined,  // Generate new ID
          restoredFrom: goldenRecordId,
          restoredAt: new Date()
        }
      })
    }

    // Delete golden record
    await tx.unifiedPerson.delete({
      where: { id: goldenRecordId }
    })

    // Mark provenance as undone
    await tx.provenance.update({
      where: { goldenRecordId },
      data: {
        undoneAt: new Date(),
        undoneReason: reason
      }
    })
  })

  console.log(`Unmerge complete for ${goldenRecordId}`)
}
```

## Monitoring Progress

```typescript
async function monitorMigration() {
  const interval = 30000  // 30 seconds

  while (true) {
    const queueStats = await resolver.queue.stats()
    const goldenCount = await prisma.unifiedPerson.count()
    const memUsage = process.memoryUsage()

    console.log(`\n[${new Date().toISOString()}] Migration Status:`)
    console.log(`  Golden Records: ${goldenCount}`)
    console.log(`  Queue Pending: ${queueStats.byStatus.pending}`)
    console.log(`  Queue Processing: ${queueStats.byStatus.reviewing}`)
    console.log(`  Memory: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`)

    await new Promise(resolve => setTimeout(resolve, interval))
  }
}
```

## Next Steps

- [Blocking Strategies](../blocking/overview.md): Optimize for your data volume
- [Golden Record](../golden-record.md): Configure merge strategies
- [Provenance](../provenance.md): Audit trail configuration
- [Tuning Guide](../tuning-guide.md): Optimize weights and thresholds
