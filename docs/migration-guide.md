# Migration Guide: Deduplicating Existing Databases

This guide covers strategies for deduplicating existing databases with **have-we-met**, including incremental migration, handling large datasets, and ensuring data integrity.

## Overview

Deduplicating an existing database is different from preventing duplicates going forward. You need to:

1. Analyze your current dataset
2. Choose an appropriate migration strategy
3. Handle edge cases and conflicts
4. Verify results
5. Clean up duplicates safely

## Pre-Migration Planning

### 1. Assess Your Dataset

Before starting, understand your data:

```typescript
// Count total records
const totalRecords = await adapter.count()

// Estimate duplicate rate (sample)
const sample = await adapter.findAll({ limit: 1000 })
const sampleResult = resolver.deduplicateBatch(sample)
const duplicateRate = sampleResult.totalDuplicates / sampleResult.totalProcessed

console.log(`Total records: ${totalRecords}`)
console.log(`Estimated duplicate rate: ${(duplicateRate * 100).toFixed(2)}%`)
console.log(`Estimated duplicates: ${Math.round(totalRecords * duplicateRate)}`)
```

### 2. Backup Your Database

**Critical:** Always backup before deduplication:

```bash
# PostgreSQL
pg_dump -U postgres -d mydb > backup_$(date +%Y%m%d).sql

# MySQL
mysqldump -u root -p mydb > backup_$(date +%Y%m%d).sql

# SQLite
sqlite3 mydb.db ".backup backup_$(date +%Y%m%d).db"
```

### 3. Create Required Indexes

Performance is critical for large datasets:

```sql
-- Essential indexes
CREATE INDEX idx_customers_lastname ON customers(last_name);
CREATE INDEX idx_customers_email ON customers(email);
CREATE INDEX idx_customers_phone ON customers(phone);

-- Pre-computed blocking keys
ALTER TABLE customers ADD COLUMN soundex_lastname VARCHAR(4);
CREATE INDEX idx_customers_soundex ON customers(soundex_lastname);

-- Update existing records
UPDATE customers SET soundex_lastname = SOUNDEX(last_name);
```

### 4. Choose a Strategy

| Strategy             | Best For                | Downtime | Risk   |
| -------------------- | ----------------------- | -------- | ------ |
| Offline (full)       | Small datasets (< 100k) | Hours    | Low    |
| Online (incremental) | Large datasets          | Minimal  | Medium |
| Shadow (parallel)    | Critical systems        | None     | Low    |
| Hybrid               | Medium datasets         | Minutes  | Low    |

## Strategy 1: Offline Migration (Full)

Best for: Small to medium datasets, can afford downtime

### Steps

1. **Take application offline** to prevent new inserts
2. **Run full deduplication**
3. **Review and merge duplicates**
4. **Verify data integrity**
5. **Bring application online**

### Implementation

```typescript
async function offlineMigration() {
  console.log('Starting offline migration...')

  // Step 1: Mark application as offline
  await setMaintenanceMode(true)

  try {
    // Step 2: Run full deduplication
    console.log('Running deduplication...')
    const result = await resolver.deduplicateBatchFromDatabase({
      batchSize: 1000,
      persistResults: false, // Don't auto-merge yet
    })

    console.log(`Found ${result.duplicateGroupsFound} duplicate groups`)
    console.log(`Total duplicates: ${result.totalDuplicates}`)

    // Step 3: Review high-confidence matches
    const highConfidence = result.results.filter((r) => r.score >= 70)
    console.log(`High confidence duplicates: ${highConfidence.length}`)

    // Step 4: Merge duplicates
    let merged = 0
    for (const group of highConfidence) {
      await mergeDuplicateGroup(group)
      merged++

      if (merged % 100 === 0) {
        console.log(`Merged ${merged}/${highConfidence.length} groups`)
      }
    }

    // Step 5: Verify
    const verification = await verifyDataIntegrity()
    console.log('Verification:', verification)

    console.log('Migration complete!')
  } finally {
    // Step 6: Bring application back online
    await setMaintenanceMode(false)
  }
}

async function mergeDuplicateGroup(group: {
  masterRecordId: string
  duplicateIds: string[]
}) {
  await adapter.transaction(async (tx) => {
    // Get all records in group
    const records = await tx.findByIds([
      group.masterRecordId,
      ...group.duplicateIds,
    ])

    // Merge strategy: take most complete data
    const merged = mergeRecords(records)

    // Update master record
    await tx.update(group.masterRecordId, merged)

    // Delete duplicates
    for (const duplicateId of group.duplicateIds) {
      await tx.delete(duplicateId)
    }
  })
}

function mergeRecords(records: any[]): any {
  const merged = { ...records[0] }

  // Take most complete non-null values
  for (const record of records) {
    for (const [key, value] of Object.entries(record)) {
      if (value != null && merged[key] == null) {
        merged[key] = value
      }
    }
  }

  return merged
}
```

## Strategy 2: Online Migration (Incremental)

Best for: Large datasets, cannot afford downtime

### Concept

Process records in batches while application remains online:

1. Add `dedup_status` column to track progress
2. Process records in batches
3. Handle new records separately
4. Gradually merge duplicates

### Schema Changes

```sql
-- Add tracking columns
ALTER TABLE customers ADD COLUMN dedup_status VARCHAR(20) DEFAULT 'pending';
ALTER TABLE customers ADD COLUMN dedup_checked_at TIMESTAMP;
ALTER TABLE customers ADD COLUMN dedup_master_id VARCHAR(36);

CREATE INDEX idx_customers_dedup_status ON customers(dedup_status);
```

### Implementation

```typescript
async function incrementalMigration() {
  const batchSize = 1000
  let processedTotal = 0

  while (true) {
    // Get next batch of unprocessed records
    const batch = await db.query(`
      SELECT * FROM customers
      WHERE dedup_status = 'pending'
      LIMIT ${batchSize}
    `)

    if (batch.length === 0) {
      console.log('Migration complete!')
      break
    }

    // Process batch
    for (const record of batch) {
      await processRecordForDuplication(record)
      processedTotal++

      if (processedTotal % 100 === 0) {
        console.log(`Processed ${processedTotal} records`)
      }
    }

    // Small delay to avoid overloading database
    await sleep(100)
  }
}

async function processRecordForDuplication(record: any) {
  // Check for duplicates
  const matches = await resolver.resolveWithDatabase(record, {
    useBlocking: true,
  })

  const definiteMatch = matches.find((m) => m.outcome === 'definite-match')

  if (definiteMatch) {
    // Mark as duplicate, link to master
    await db.query(
      `
      UPDATE customers
      SET dedup_status = 'duplicate',
          dedup_master_id = $1,
          dedup_checked_at = NOW()
      WHERE id = $2
    `,
      [definiteMatch.record.id, record.id]
    )
  } else {
    // Mark as unique
    await db.query(
      `
      UPDATE customers
      SET dedup_status = 'unique',
          dedup_checked_at = NOW()
      WHERE id = $1
    `,
      [record.id]
    )
  }
}
```

### Merge Phase

After identification is complete, merge in batches:

```typescript
async function mergeIdentifiedDuplicates() {
  const duplicateGroups = await db.query(`
    SELECT dedup_master_id, array_agg(id) as duplicate_ids
    FROM customers
    WHERE dedup_status = 'duplicate'
    GROUP BY dedup_master_id
  `)

  for (const group of duplicateGroups) {
    await adapter.transaction(async (tx) => {
      const records = await tx.findByIds([
        group.dedup_master_id,
        ...group.duplicate_ids,
      ])
      const merged = mergeRecords(records)

      await tx.update(group.dedup_master_id, merged)

      for (const duplicateId of group.duplicate_ids) {
        await tx.delete(duplicateId)
      }
    })

    console.log(
      `Merged group: master ${group.dedup_master_id}, ${group.duplicate_ids.length} duplicates`
    )
  }
}
```

## Strategy 3: Shadow Migration (Parallel)

Best for: Critical systems, zero downtime required

### Concept

1. Clone production data to staging
2. Run deduplication on staging
3. Verify results
4. Apply changes to production in maintenance window

### Implementation

```bash
# 1. Clone production to staging
pg_dump -U postgres -d production | psql -U postgres -d staging

# 2. Run deduplication on staging
npm run migrate:deduplicate -- --database=staging

# 3. Generate migration script
npm run migrate:generate-script -- --database=staging --output=migration.sql
```

```typescript
async function generateMigrationScript(outputFile: string) {
  const duplicateGroups = await getStagingDuplicates()

  const script = ['BEGIN;', '']

  for (const group of duplicateGroups) {
    const records = await findRecords(group)
    const merged = mergeRecords(records)

    // Generate UPDATE statement
    script.push(`UPDATE customers SET`)
    script.push(`  first_name = '${escaped(merged.firstName)}',`)
    script.push(`  last_name = '${escaped(merged.lastName)}',`)
    script.push(`  email = '${escaped(merged.email)}'`)
    script.push(`WHERE id = '${group.masterRecordId}';`)
    script.push('')

    // Generate DELETE statements
    for (const duplicateId of group.duplicateIds) {
      script.push(`DELETE FROM customers WHERE id = '${duplicateId}';`)
    }
    script.push('')
  }

  script.push('COMMIT;')

  await fs.writeFile(outputFile, script.join('\n'))
  console.log(`Migration script written to ${outputFile}`)
}
```

## Strategy 4: Hybrid Approach

Best for: Medium datasets (100k-1M records)

### Concept

1. Offline deduplication for old data (no recent activity)
2. Online processing for active data
3. Scheduled merging during low-traffic periods

### Implementation

```typescript
async function hybridMigration() {
  // Phase 1: Offline - Process old, inactive records
  console.log('Phase 1: Processing inactive records...')
  const inactiveThreshold = new Date()
  inactiveThreshold.setMonth(inactiveThreshold.getMonth() - 6)

  const inactiveRecords = await db.query(
    `
    SELECT * FROM customers
    WHERE updated_at < $1
  `,
    [inactiveThreshold]
  )

  const inactiveResult = resolver.deduplicateBatch(inactiveRecords)
  await mergeGroups(inactiveResult.results.filter((r) => r.score >= 70))

  // Phase 2: Online - Process active records incrementally
  console.log('Phase 2: Processing active records...')
  await incrementalMigration()

  // Phase 3: Scheduled - Merge during low-traffic
  console.log('Phase 3: Scheduling merge operations...')
  schedulePeriodicMerges()
}

function schedulePeriodicMerges() {
  // Run merges daily at 2 AM
  cron.schedule('0 2 * * *', async () => {
    console.log('Running scheduled merge...')

    const pendingMerges = await db.query(`
      SELECT * FROM customers
      WHERE dedup_status = 'duplicate'
      LIMIT 1000
    `)

    await mergeIdentifiedDuplicates()
  })
}
```

## Handling Edge Cases

### Conflicting Data

When merging, conflicts may occur:

```typescript
function mergeRecordsWithConflicts(records: any[]): {
  merged: any
  conflicts: any[]
} {
  const merged = { ...records[0] }
  const conflicts = []

  for (const key of Object.keys(records[0])) {
    const values = records.map((r) => r[key]).filter((v) => v != null)
    const uniqueValues = [...new Set(values)]

    if (uniqueValues.length > 1) {
      // Conflict: multiple different non-null values
      conflicts.push({
        field: key,
        values: uniqueValues,
      })

      // Resolution strategy: take most common value
      const valueCounts = values.reduce((acc, val) => {
        acc[val] = (acc[val] || 0) + 1
        return acc
      }, {})

      const mostCommon = Object.entries(valueCounts).sort(
        ([, a], [, b]) => (b as number) - (a as number)
      )[0][0]

      merged[key] = mostCommon
    } else if (uniqueValues.length === 1) {
      merged[key] = uniqueValues[0]
    }
  }

  return { merged, conflicts }
}
```

### Foreign Key Constraints

Update references before deleting:

```typescript
async function mergeWithForeignKeys(masterId: string, duplicateIds: string[]) {
  await adapter.transaction(async (tx) => {
    // Update all foreign key references
    await db.query(
      `
      UPDATE orders SET customer_id = $1
      WHERE customer_id = ANY($2)
    `,
      [masterId, duplicateIds]
    )

    await db.query(
      `
      UPDATE invoices SET customer_id = $1
      WHERE customer_id = ANY($2)
    `,
      [masterId, duplicateIds]
    )

    // Now safe to delete duplicates
    for (const duplicateId of duplicateIds) {
      await tx.delete(duplicateId)
    }
  })
}
```

### Audit Trail

Maintain a record of merges:

```sql
CREATE TABLE dedup_audit (
  id SERIAL PRIMARY KEY,
  master_id VARCHAR(36),
  duplicate_ids TEXT[],
  merged_at TIMESTAMP DEFAULT NOW(),
  merged_by VARCHAR(255),
  conflict_count INT,
  conflicts JSONB
);
```

```typescript
async function auditedMerge(group: any) {
  const { merged, conflicts } = mergeRecordsWithConflicts(group.records)

  await db.query(
    `
    INSERT INTO dedup_audit (master_id, duplicate_ids, conflict_count, conflicts)
    VALUES ($1, $2, $3, $4)
  `,
    [
      group.masterRecordId,
      group.duplicateIds,
      conflicts.length,
      JSON.stringify(conflicts),
    ]
  )

  // Proceed with merge
  await mergeDuplicateGroup(group)
}
```

## Data Integrity Verification

### Pre-Migration Counts

```typescript
const preMigration = {
  totalRecords: await adapter.count(),
  totalEmails: await db.query('SELECT COUNT(DISTINCT email) FROM customers'),
  totalPhones: await db.query('SELECT COUNT(DISTINCT phone) FROM customers'),
}
```

### Post-Migration Validation

```typescript
async function verifyDataIntegrity() {
  const postMigration = {
    totalRecords: await adapter.count(),
    totalEmails: await db.query('SELECT COUNT(DISTINCT email) FROM customers'),
    totalPhones: await db.query('SELECT COUNT(DISTINCT phone) FROM customers'),
  }

  console.log('Verification:')
  console.log(
    `Records: ${preMigration.totalRecords} → ${postMigration.totalRecords}`
  )
  console.log(
    `Reduction: ${preMigration.totalRecords - postMigration.totalRecords} (${((1 - postMigration.totalRecords / preMigration.totalRecords) * 100).toFixed(2)}%)`
  )

  // Ensure no orphaned foreign keys
  const orphanedOrders = await db.query(`
    SELECT COUNT(*) FROM orders o
    LEFT JOIN customers c ON o.customer_id = c.id
    WHERE c.id IS NULL
  `)

  if (orphanedOrders[0].count > 0) {
    throw new Error(`Found ${orphanedOrders[0].count} orphaned orders!`)
  }

  console.log('✓ No orphaned foreign keys')
  return true
}
```

## Rollback Strategy

### Soft Delete

Instead of hard deleting, use soft deletes:

```sql
ALTER TABLE customers ADD COLUMN deleted_at TIMESTAMP;
CREATE INDEX idx_customers_deleted_at ON customers(deleted_at);
```

```typescript
async function softDeleteDuplicates(group: any) {
  await adapter.transaction(async (tx) => {
    // Update master
    const merged = mergeRecords(group.records)
    await tx.update(group.masterRecordId, merged)

    // Soft delete duplicates
    for (const duplicateId of group.duplicateIds) {
      await db.query(
        `
        UPDATE customers
        SET deleted_at = NOW()
        WHERE id = $1
      `,
        [duplicateId]
      )
    }
  })
}

// Rollback if needed
async function rollbackMerge(masterId: string) {
  await db.query(
    `
    UPDATE customers
    SET deleted_at = NULL
    WHERE dedup_master_id = $1
  `,
    [masterId]
  )
}
```

### Permanent Cleanup

After verification period (e.g., 30 days):

```sql
DELETE FROM customers
WHERE deleted_at < NOW() - INTERVAL '30 days';
```

## Performance Tips

### Parallel Batch Processing

```typescript
async function parallelBatchMigration() {
  const totalRecords = await adapter.count()
  const batchSize = 1000
  const concurrency = 4

  const numBatches = Math.ceil(totalRecords / batchSize)
  const batches = Array.from({ length: numBatches }, (_, i) => i)

  for (let i = 0; i < batches.length; i += concurrency) {
    const chunk = batches.slice(i, i + concurrency)

    await Promise.all(
      chunk.map(async (batchNum) => {
        const offset = batchNum * batchSize
        const batch = await adapter.findAll({ limit: batchSize, offset })

        for (const record of batch) {
          await processRecordForDuplication(record)
        }
      })
    )

    console.log(
      `Progress: ${Math.min((i + concurrency) * batchSize, totalRecords)}/${totalRecords}`
    )
  }
}
```

### Progress Tracking

```typescript
class MigrationProgress {
  private total: number
  private processed: number = 0
  private startTime: number = Date.now()

  constructor(total: number) {
    this.total = total
  }

  increment() {
    this.processed++

    if (this.processed % 100 === 0) {
      this.report()
    }
  }

  report() {
    const elapsed = Date.now() - this.startTime
    const rate = this.processed / (elapsed / 1000)
    const remaining = (this.total - this.processed) / rate
    const percentage = ((this.processed / this.total) * 100).toFixed(2)

    console.log(`Progress: ${this.processed}/${this.total} (${percentage}%)`)
    console.log(`Rate: ${Math.round(rate)} records/sec`)
    console.log(`ETA: ${Math.round(remaining / 60)} minutes`)
  }
}
```

## Monitoring

### Track Migration Metrics

```typescript
const metrics = {
  recordsProcessed: 0,
  duplicateGroupsFound: 0,
  recordsMerged: 0,
  conflictsDetected: 0,
  errors: 0,
  duration: 0,
}

// Export metrics for monitoring
setInterval(() => {
  console.log(JSON.stringify(metrics))
}, 10000)
```

## Complete Migration Script

```typescript
async function completeMigration(
  strategy: 'offline' | 'online' | 'shadow' | 'hybrid'
) {
  console.log(`Starting ${strategy} migration...`)

  // Pre-flight checks
  await verifyIndexes()
  await createBackup()

  try {
    switch (strategy) {
      case 'offline':
        await offlineMigration()
        break
      case 'online':
        await incrementalMigration()
        break
      case 'shadow':
        await shadowMigration()
        break
      case 'hybrid':
        await hybridMigration()
        break
    }

    // Verification
    await verifyDataIntegrity()

    console.log('Migration completed successfully!')
  } catch (error) {
    console.error('Migration failed:', error)
    console.log('Initiating rollback...')
    await rollback()
  }
}
```

## Next Steps

- [Database Performance](./database-performance.md) - Optimize for best performance
- [Prisma Adapter](./adapter-guides/prisma.md) - Prisma-specific migration examples
- [Drizzle Adapter](./adapter-guides/drizzle.md) - Drizzle-specific migration examples
- [TypeORM Adapter](./adapter-guides/typeorm.md) - TypeORM-specific migration examples
