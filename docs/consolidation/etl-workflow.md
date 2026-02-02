# ETL Workflow Guide

## Table of Contents

- [Introduction](#introduction)
- [ETL Basics](#etl-basics)
- [Multi-Source Loading](#multi-source-loading)
- [Transaction Management](#transaction-management)
- [Error Handling](#error-handling)
- [Performance Optimization](#performance-optimization)
- [Monitoring and Logging](#monitoring-and-logging)
- [Production Patterns](#production-patterns)
- [Complete Examples](#complete-examples)

---

## Introduction

ETL (Extract, Transform, Load) workflows are a common use case for multi-source consolidation. This guide covers how to build production-ready ETL pipelines using have-we-met.

### What is ETL?

**Extract**: Load data from multiple sources (databases, APIs, files)
**Transform**: Map schemas, clean data, deduplicate, merge
**Load**: Write unified golden records to target database

### ETL with have-we-met

```typescript
// Extract: Load from multiple sources
.source('csv_file', source => source.adapter(csvAdapter))
.source('postgres_db', source => source.adapter(pgAdapter))
.source('rest_api', source => source.adapter(apiAdapter))

// Transform: Map schemas and match records
.mapping(map => /* schema mapping */)
.matching(match => /* matching rules */)
.conflictResolution(cr => /* merge logic */)

// Load: Write to target database
.outputAdapter(targetAdapter)
.writeOutput(true)
```

---

## ETL Basics

### Simple ETL Pipeline

```typescript
import { HaveWeMet } from 'have-we-met'
import { PrismaClient } from '@prisma/client'
import { PrismaAdapter } from 'have-we-met/adapters'

const prisma = new PrismaClient()

async function runETL() {
  console.log('Starting ETL pipeline...')

  // Extract, Transform, Load
  const result = await HaveWeMet.consolidation<UnifiedCustomer>()
    // Extract from sources
    .source('source_a', source => source
      .name('Source A Database')
      .adapter(new PrismaAdapter(prisma.sourceA))
      .mapping(map => map
        .field('email').from('email_address')
        .field('firstName').from('first_name')
        .field('lastName').from('last_name')
      )
      .priority(2)
    )

    .source('source_b', source => source
      .name('Source B Database')
      .adapter(new PrismaAdapter(prisma.sourceB))
      .mapping(map => map
        .field('email').from('email')
        .field('firstName').from('fname')
        .field('lastName').from('lname')
      )
      .priority(1)
    )

    // Transform: matching and conflict resolution
    .matching(match => match
      .field('email').strategy('exact').weight(30)
      .field('firstName').strategy('jaro-winkler').weight(10)
      .field('lastName').strategy('jaro-winkler').weight(10)
    )
    .thresholds({ noMatch: 20, definiteMatch: 45 })
    .conflictResolution(cr => cr
      .useSourcePriority(true)
      .defaultStrategy('preferNonNull')
    )

    // Load to target
    .outputAdapter(new PrismaAdapter(prisma.unified))
    .writeOutput(true)

    .build()
    .consolidate()

  console.log(`ETL complete: ${result.stats.goldenRecords} records created`)
  return result
}
```

### Batch Processing

Process large datasets in batches:

```typescript
async function batchETL(batchSize: number = 1000) {
  const sourceAdapter = new PrismaAdapter(prisma.source)
  const totalRecords = await sourceAdapter.count()
  const batches = Math.ceil(totalRecords / batchSize)

  console.log(`Processing ${totalRecords} records in ${batches} batches`)

  for (let i = 0; i < batches; i++) {
    const offset = i * batchSize
    console.log(`Batch ${i + 1}/${batches}...`)

    // Create batch-specific adapter
    const batchAdapter = {
      ...sourceAdapter,
      findAll: async () => {
        const allRecords = await sourceAdapter.findAll()
        return allRecords.slice(offset, offset + batchSize)
      }
    }

    // Process batch
    const result = await HaveWeMet.consolidation<Customer>()
      .source('source', source => source
        .adapter(batchAdapter)
        .mapping(map => /* ... */)
      )
      .outputAdapter(outputAdapter)
      .writeOutput(true)
      .build()
      .consolidate()

    console.log(`  Batch ${i + 1} complete: ${result.stats.goldenRecords} records`)
  }
}
```

### Incremental ETL

Process only new/updated records:

```typescript
async function incrementalETL(lastRunTimestamp: Date) {
  const result = await HaveWeMet.consolidation<Customer>()
    .source('source', source => source
      .adapter(createIncrementalAdapter(lastRunTimestamp))
      .mapping(map => /* ... */)
    )
    .outputAdapter(outputAdapter)
    .writeOutput(true)
    .build()
    .consolidate()

  return result
}

function createIncrementalAdapter<T>(since: Date) {
  return {
    ...baseAdapter,
    findAll: async () => {
      // Only fetch records updated since last run
      return prisma.source.findMany({
        where: {
          updatedAt: { gte: since }
        }
      })
    }
  }
}
```

---

## Multi-Source Loading

### Loading from Databases

```typescript
// PostgreSQL
import { PrismaAdapter } from 'have-we-met/adapters'
const pgAdapter = new PrismaAdapter(prisma.customers)

// MySQL
const mysqlAdapter = new PrismaAdapter(prisma.mysqlCustomers)

// MongoDB
const mongoAdapter = new PrismaAdapter(prisma.mongoCustomers)

// SQLite
const sqliteAdapter = new PrismaAdapter(prisma.sqliteCustomers)
```

### Loading from CSV Files

```typescript
import { parse } from 'csv-parse/sync'
import { readFileSync } from 'fs'

function createCSVAdapter<T>(filePath: string): DatabaseAdapter<T> {
  let records: T[] | null = null

  return {
    count: async () => {
      if (!records) {
        const content = readFileSync(filePath, 'utf-8')
        records = parse(content, { columns: true })
      }
      return records.length
    },

    findAll: async () => {
      if (!records) {
        const content = readFileSync(filePath, 'utf-8')
        records = parse(content, { columns: true })
      }
      return records
    },

    findById: async (id) => {
      const all = await this.findAll!()
      return all.find((r: any) => r.id === id) ?? null
    },

    findByField: async (field, value) => {
      const all = await this.findAll!()
      return all.filter((r: any) => r[field] === value)
    },

    create: async (record) => record,
    update: async (id, updates) => ({ ...updates, id } as T),
    delete: async () => undefined,
    findMany: async () => await this.findAll!()
  }
}

// Usage
.source('csv_legacy', source => source
  .adapter(createCSVAdapter('./data/legacy-customers.csv'))
  .mapping(map => /* ... */)
)
```

### Loading from REST APIs

```typescript
function createAPIAdapter<T>(
  baseURL: string,
  endpoint: string,
  apiKey: string
): DatabaseAdapter<T> {
  return {
    count: async () => {
      const response = await fetch(`${baseURL}${endpoint}/count`, {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      })
      const data = await response.json()
      return data.count
    },

    findAll: async () => {
      const response = await fetch(`${baseURL}${endpoint}`, {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      })
      return await response.json()
    },

    findById: async (id) => {
      const response = await fetch(`${baseURL}${endpoint}/${id}`, {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      })
      if (response.status === 404) return null
      return await response.json()
    },

    findByField: async (field, value) => {
      const response = await fetch(
        `${baseURL}${endpoint}?${field}=${value}`,
        { headers: { 'Authorization': `Bearer ${apiKey}` } }
      )
      return await response.json()
    },

    create: async (record) => {
      const response = await fetch(`${baseURL}${endpoint}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(record)
      })
      return await response.json()
    },

    update: async (id, updates) => {
      const response = await fetch(`${baseURL}${endpoint}/${id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updates)
      })
      return await response.json()
    },

    delete: async (id) => {
      await fetch(`${baseURL}${endpoint}/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${apiKey}` }
      })
    },

    findMany: async (filter) => {
      const params = new URLSearchParams(filter as any)
      const response = await fetch(`${baseURL}${endpoint}?${params}`, {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      })
      return await response.json()
    }
  }
}

// Usage
.source('crm_api', source => source
  .adapter(createAPIAdapter(
    'https://api.crm.example.com',
    '/customers',
    process.env.CRM_API_KEY!
  ))
  .mapping(map => /* ... */)
)
```

### Loading from Excel Files

```typescript
import * as XLSX from 'xlsx'

function createExcelAdapter<T>(filePath: string, sheetName: string): DatabaseAdapter<T> {
  let records: T[] | null = null

  function loadRecords(): T[] {
    if (!records) {
      const workbook = XLSX.readFile(filePath)
      const sheet = workbook.Sheets[sheetName]
      records = XLSX.utils.sheet_to_json(sheet)
    }
    return records
  }

  return {
    count: async () => loadRecords().length,
    findAll: async () => loadRecords(),
    findById: async (id) => loadRecords().find((r: any) => r.id === id) ?? null,
    findByField: async (field, value) =>
      loadRecords().filter((r: any) => r[field] === value),
    create: async (record) => record,
    update: async (id, updates) => ({ ...updates, id } as T),
    delete: async () => undefined,
    findMany: async () => loadRecords()
  }
}

// Usage
.source('excel_export', source => source
  .adapter(createExcelAdapter('./data/export.xlsx', 'Customers'))
  .mapping(map => /* ... */)
)
```

---

## Transaction Management

### Basic Transaction Support

```typescript
async function transactionalETL() {
  const prisma = new PrismaClient()

  try {
    await prisma.$transaction(async (tx) => {
      // Create adapters using transaction
      const sourceAdapter = new PrismaAdapter(tx.source)
      const outputAdapter = new PrismaAdapter(tx.unified)

      // Run consolidation within transaction
      const result = await HaveWeMet.consolidation<Customer>()
        .source('source', source => source
          .adapter(sourceAdapter)
          .mapping(map => /* ... */)
        )
        .outputAdapter(outputAdapter)
        .writeOutput(true)
        .build()
        .consolidate()

      console.log(`Transaction complete: ${result.stats.goldenRecords} records`)

      // Transaction commits if no error thrown
    })
  } catch (error) {
    console.error('Transaction failed, rolling back:', error)
    throw error
  }
}
```

### Two-Phase Commit

```typescript
async function twoPhaseETL() {
  // Phase 1: Consolidate to staging table
  const result = await HaveWeMet.consolidation<Customer>()
    .source('source_a', /* ... */)
    .source('source_b', /* ... */)
    .outputAdapter(new PrismaAdapter(prisma.staging))
    .writeOutput(true)
    .build()
    .consolidate()

  // Validate results
  if (result.errors.length > 0) {
    console.error('Errors in consolidation:', result.errors)
    throw new Error('Consolidation validation failed')
  }

  // Phase 2: Copy from staging to production
  await prisma.$transaction(async (tx) => {
    // Clear production table
    await tx.unified.deleteMany({})

    // Copy from staging
    const stagingRecords = await tx.staging.findMany()
    await tx.unified.createMany({ data: stagingRecords })

    console.log(`Promoted ${stagingRecords.length} records to production`)
  })
}
```

### Rollback on Error

```typescript
async function rollbackETL() {
  // Create backup
  await prisma.$transaction(async (tx) => {
    await tx.unifiedBackup.deleteMany({})
    const currentRecords = await tx.unified.findMany()
    await tx.unifiedBackup.createMany({ data: currentRecords })
  })

  try {
    // Run ETL
    const result = await HaveWeMet.consolidation<Customer>()
      .source('source', /* ... */)
      .outputAdapter(new PrismaAdapter(prisma.unified))
      .writeOutput(true)
      .build()
      .consolidate()

    console.log('ETL successful')
    return result

  } catch (error) {
    console.error('ETL failed, rolling back...')

    // Restore from backup
    await prisma.$transaction(async (tx) => {
      await tx.unified.deleteMany({})
      const backupRecords = await tx.unifiedBackup.findMany()
      await tx.unified.createMany({ data: backupRecords })
    })

    throw error
  }
}
```

---

## Error Handling

### Graceful Degradation

```typescript
async function robustETL() {
  const errors: Array<{ source: string; error: string }> = []

  const result = await HaveWeMet.consolidation<Customer>()
    .source('source_a', source => source
      .adapter(createResilientAdapter('source_a', errors))
      .mapping(map => /* ... */)
    )
    .source('source_b', source => source
      .adapter(createResilientAdapter('source_b', errors))
      .mapping(map => /* ... */)
    )
    .build()
    .consolidate()

  // Report errors but continue
  if (errors.length > 0) {
    console.warn('Errors encountered:', errors)
  }

  return { result, errors }
}

function createResilientAdapter<T>(
  sourceId: string,
  errorLog: Array<{ source: string; error: string }>
) {
  return {
    // ... other methods

    findAll: async () => {
      try {
        return await baseAdapter.findAll()
      } catch (error) {
        errorLog.push({
          source: sourceId,
          error: error instanceof Error ? error.message : String(error)
        })
        return []  // Return empty array on error
      }
    }
  }
}
```

### Retry Logic

```typescript
async function retryableETL(maxRetries: number = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`ETL attempt ${attempt}/${maxRetries}...`)

      const result = await HaveWeMet.consolidation<Customer>()
        .source('source', source => source
          .adapter(createRetryAdapter(maxRetries))
          .mapping(map => /* ... */)
        )
        .build()
        .consolidate()

      console.log('ETL successful')
      return result

    } catch (error) {
      console.error(`Attempt ${attempt} failed:`, error)

      if (attempt === maxRetries) {
        throw error
      }

      // Wait before retry (exponential backoff)
      const waitMs = Math.pow(2, attempt) * 1000
      console.log(`Waiting ${waitMs}ms before retry...`)
      await new Promise(resolve => setTimeout(resolve, waitMs))
    }
  }
}

function createRetryAdapter<T>(maxRetries: number) {
  return {
    // ... other methods

    findAll: async () => {
      for (let i = 0; i < maxRetries; i++) {
        try {
          return await baseAdapter.findAll()
        } catch (error) {
          if (i === maxRetries - 1) throw error
          await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)))
        }
      }
      throw new Error('Max retries exceeded')
    }
  }
}
```

### Error Reporting

```typescript
interface ETLReport {
  success: boolean
  recordsProcessed: number
  recordsCreated: number
  errors: Array<{
    sourceId: string
    recordId: string | number
    error: string
    timestamp: Date
  }>
  warnings: string[]
  duration: number
}

async function reportingETL(): Promise<ETLReport> {
  const startTime = Date.now()
  const errors: ETLReport['errors'] = []
  const warnings: string[] = []

  try {
    const result = await HaveWeMet.consolidation<Customer>()
      .source('source', source => /* ... */)
      .build()
      .consolidate()

    // Collect errors from result
    result.errors.forEach(err => {
      errors.push({
        sourceId: err.sourceId,
        recordId: err.recordId,
        error: err.error,
        timestamp: new Date()
      })
    })

    // Check for warnings
    if (result.stats.goldenRecords < result.stats.totalRecords * 0.5) {
      warnings.push('High deduplication rate (>50%)')
    }

    return {
      success: true,
      recordsProcessed: result.stats.totalRecords,
      recordsCreated: result.stats.goldenRecords,
      errors,
      warnings,
      duration: Date.now() - startTime
    }

  } catch (error) {
    return {
      success: false,
      recordsProcessed: 0,
      recordsCreated: 0,
      errors: [{
        sourceId: 'unknown',
        recordId: 'unknown',
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date()
      }],
      warnings,
      duration: Date.now() - startTime
    }
  }
}
```

---

## Performance Optimization

### Parallel Source Loading

```typescript
async function parallelLoadETL() {
  // Load sources in parallel
  const [sourceAData, sourceBData, sourceCData] = await Promise.all([
    loadSourceA(),
    loadSourceB(),
    loadSourceC()
  ])

  // Create in-memory adapters
  const sourceAAdapter = createMemoryAdapter(sourceAData)
  const sourceBAdapter = createMemoryAdapter(sourceBData)
  const sourceCAdapter = createMemoryAdapter(sourceCData)

  // Run consolidation
  const result = await HaveWeMet.consolidation<Customer>()
    .source('source_a', source => source.adapter(sourceAAdapter).mapping(map => /* ... */))
    .source('source_b', source => source.adapter(sourceBAdapter).mapping(map => /* ... */))
    .source('source_c', source => source.adapter(sourceCAdapter).mapping(map => /* ... */))
    .build()
    .consolidate()

  return result
}
```

### Database Indexing

```sql
-- Index blocking fields for fast lookups
CREATE INDEX idx_email ON customers(email);
CREATE INDEX idx_last_name ON customers(last_name);
CREATE INDEX idx_phone ON customers(phone);

-- Composite index for common queries
CREATE INDEX idx_name ON customers(first_name, last_name);

-- Index for incremental ETL
CREATE INDEX idx_updated_at ON customers(updated_at);
```

### Connection Pooling

```typescript
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  },
  log: ['error', 'warn'],
  // Connection pool settings
  __internal: {
    engine: {
      connection_limit: 10
    }
  }
})
```

### Batch Writing

```typescript
async function batchWriteETL(batchSize: number = 1000) {
  const result = await HaveWeMet.consolidation<Customer>()
    .source('source', source => /* ... */)
    .outputAdapter(createBatchWriteAdapter(batchSize))
    .writeOutput(true)
    .build()
    .consolidate()

  return result
}

function createBatchWriteAdapter(batchSize: number) {
  let buffer: any[] = []

  return {
    // ... other methods

    create: async (record: any) => {
      buffer.push(record)

      if (buffer.length >= batchSize) {
        await flush()
      }

      return record
    }
  }

  async function flush() {
    if (buffer.length === 0) return

    await prisma.unified.createMany({
      data: buffer,
      skipDuplicates: true
    })

    buffer = []
  }
}
```

### Memory Management

```typescript
async function memoryEfficientETL() {
  // Process in chunks to avoid memory issues
  const chunkSize = 5000

  for await (const chunk of getSourceChunks(chunkSize)) {
    const result = await HaveWeMet.consolidation<Customer>()
      .source('chunk', source => source
        .adapter(createMemoryAdapter(chunk))
        .mapping(map => /* ... */)
      )
      .outputAdapter(outputAdapter)
      .writeOutput(true)
      .build()
      .consolidate()

    console.log(`Processed chunk: ${result.stats.goldenRecords} records`)

    // Allow garbage collection
    if (global.gc) global.gc()
  }
}

async function* getSourceChunks(chunkSize: number) {
  const total = await sourceAdapter.count()
  const chunks = Math.ceil(total / chunkSize)

  for (let i = 0; i < chunks; i++) {
    const offset = i * chunkSize
    const records = await sourceAdapter.findMany({
      skip: offset,
      take: chunkSize
    })
    yield records
  }
}
```

---

## Monitoring and Logging

### Structured Logging

```typescript
import winston from 'winston'

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'etl-error.log', level: 'error' }),
    new winston.transports.File({ filename: 'etl-combined.log' })
  ]
})

async function loggedETL() {
  logger.info('ETL started', { timestamp: new Date() })

  try {
    const result = await HaveWeMet.consolidation<Customer>()
      .source('source', source => /* ... */)
      .build()
      .consolidate()

    logger.info('ETL completed', {
      timestamp: new Date(),
      stats: result.stats,
      duration: result.stats.executionTimeMs
    })

    return result

  } catch (error) {
    logger.error('ETL failed', {
      timestamp: new Date(),
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    })
    throw error
  }
}
```

### Progress Tracking

```typescript
async function progressTrackingETL() {
  const sources = ['source_a', 'source_b', 'source_c']
  const progress = {
    current: 0,
    total: sources.length,
    phases: [] as string[]
  }

  for (const sourceId of sources) {
    progress.current++
    progress.phases.push(`Loading ${sourceId}`)
    console.log(`Progress: ${progress.current}/${progress.total} - ${sourceId}`)

    // Load and process source
    // ... implementation
  }

  progress.phases.push('Matching across sources')
  console.log('Progress: Matching...')

  progress.phases.push('Writing output')
  console.log('Progress: Writing...')

  progress.phases.push('Complete')
  console.log('Progress: Complete')

  return progress
}
```

### Metrics Collection

```typescript
interface ETLMetrics {
  startTime: Date
  endTime: Date
  duration: number
  sources: {
    [sourceId: string]: {
      recordsLoaded: number
      loadTime: number
      mappingErrors: number
    }
  }
  matching: {
    comparisons: number
    matches: number
    matchTime: number
  }
  output: {
    recordsWritten: number
    writeTime: number
    errors: number
  }
}

async function metricsETL(): Promise<ETLMetrics> {
  const metrics: ETLMetrics = {
    startTime: new Date(),
    endTime: new Date(),
    duration: 0,
    sources: {},
    matching: { comparisons: 0, matches: 0, matchTime: 0 },
    output: { recordsWritten: 0, writeTime: 0, errors: 0 }
  }

  // Collect metrics during ETL
  const result = await HaveWeMet.consolidation<Customer>()
    .source('source', source => /* ... */)
    .build()
    .consolidate()

  // Populate metrics from result
  Object.entries(result.stats.sources).forEach(([sourceId, stats]) => {
    metrics.sources[sourceId] = {
      recordsLoaded: stats.recordsLoaded,
      loadTime: 0,  // Would need instrumentation
      mappingErrors: stats.mappingErrors
    }
  })

  metrics.matching.matches = result.stats.crossSourceMatches
  metrics.output.recordsWritten = result.stats.goldenRecords

  metrics.endTime = new Date()
  metrics.duration = result.stats.executionTimeMs

  return metrics
}
```

---

## Production Patterns

### Scheduled ETL Job

```typescript
import cron from 'node-cron'

// Run daily at 2 AM
cron.schedule('0 2 * * *', async () => {
  console.log('Starting scheduled ETL...')

  try {
    const result = await runETL()
    console.log('Scheduled ETL completed successfully')
    await sendSuccessNotification(result)
  } catch (error) {
    console.error('Scheduled ETL failed:', error)
    await sendErrorNotification(error)
  }
})
```

### Health Checks

```typescript
interface HealthCheck {
  status: 'healthy' | 'degraded' | 'unhealthy'
  lastRun: Date | null
  lastSuccess: Date | null
  consecutiveFailures: number
  details: string
}

let healthStatus: HealthCheck = {
  status: 'healthy',
  lastRun: null,
  lastSuccess: null,
  consecutiveFailures: 0,
  details: 'Never run'
}

async function monitoredETL() {
  healthStatus.lastRun = new Date()

  try {
    const result = await runETL()

    healthStatus.status = 'healthy'
    healthStatus.lastSuccess = new Date()
    healthStatus.consecutiveFailures = 0
    healthStatus.details = `Success: ${result.stats.goldenRecords} records`

    return result

  } catch (error) {
    healthStatus.consecutiveFailures++

    if (healthStatus.consecutiveFailures >= 3) {
      healthStatus.status = 'unhealthy'
    } else {
      healthStatus.status = 'degraded'
    }

    healthStatus.details = error instanceof Error ? error.message : String(error)

    throw error
  }
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json(healthStatus)
})
```

### Notifications

```typescript
async function notifyingETL() {
  try {
    const result = await runETL()

    // Send success notification
    await sendEmail({
      to: 'admin@example.com',
      subject: 'ETL Success',
      body: `
        ETL completed successfully
        Records processed: ${result.stats.totalRecords}
        Golden records: ${result.stats.goldenRecords}
        Duration: ${result.stats.executionTimeMs}ms
      `
    })

    return result

  } catch (error) {
    // Send error notification
    await sendEmail({
      to: 'admin@example.com',
      subject: 'ETL Failed',
      body: `
        ETL failed with error:
        ${error instanceof Error ? error.message : String(error)}
      `
    })

    // Also send to Slack/PagerDuty/etc.
    await sendSlackAlert(error)

    throw error
  }
}
```

---

## Complete Examples

### Example 1: CSV to Database ETL

```typescript
import { parse } from 'csv-parse/sync'
import { readFileSync } from 'fs'

async function csvToDatabase() {
  // Read CSV file
  const csvContent = readFileSync('./data/customers.csv', 'utf-8')
  const csvRecords = parse(csvContent, { columns: true })

  // Create CSV adapter
  const csvAdapter = createMemoryAdapter(csvRecords)

  // Run ETL
  const result = await HaveWeMet.consolidation<Customer>()
    .source('csv', source => source
      .name('CSV Import')
      .adapter(csvAdapter)
      .mapping(map => map
        .field('email').from('Email')
        .field('firstName').from('First Name')
        .field('lastName').from('Last Name')
        .field('phone').from('Phone')
      )
    )
    .outputAdapter(new PrismaAdapter(prisma.customers))
    .writeOutput(true)
    .build()
    .consolidate()

  console.log(`Imported ${result.stats.goldenRecords} customers from CSV`)
  return result
}
```

### Example 2: Multi-Database Migration

```typescript
async function multiDatabaseMigration() {
  const result = await HaveWeMet.consolidation<Customer>()
    // Source 1: MySQL
    .source('mysql', source => source
      .adapter(new PrismaAdapter(prisma.mysqlCustomers))
      .mapping(map => map
        .field('email').from('email_address')
        .field('firstName').from('first_name')
        .field('lastName').from('last_name')
      )
      .priority(3)
    )

    // Source 2: PostgreSQL
    .source('postgres', source => source
      .adapter(new PrismaAdapter(prisma.pgCustomers))
      .mapping(map => map
        .field('email').from('email')
        .field('firstName').from('fname')
        .field('lastName').from('lname')
      )
      .priority(2)
    )

    // Source 3: MongoDB
    .source('mongo', source => source
      .adapter(new PrismaAdapter(prisma.mongoCustomers))
      .mapping(map => map
        .field('email').from('contact.email')
        .field('firstName').from('contact.firstName')
        .field('lastName').from('contact.lastName')
      )
      .priority(1)
    )

    // Target: New unified PostgreSQL
    .outputAdapter(new PrismaAdapter(prisma.unifiedCustomers))
    .writeOutput(true)

    .matchingScope('within-source-first')
    .matching(match => match
      .field('email').strategy('exact').weight(30)
      .field('firstName').strategy('jaro-winkler').weight(10)
      .field('lastName').strategy('jaro-winkler').weight(10)
    )
    .thresholds({ noMatch: 20, definiteMatch: 45 })

    .conflictResolution(cr => cr
      .useSourcePriority(true)
      .defaultStrategy('preferNonNull')
    )

    .build()
    .consolidate()

  return result
}
```

### Example 3: API to Database Sync

```typescript
async function apiSync() {
  const result = await HaveWeMet.consolidation<Customer>()
    // Source 1: Existing database
    .source('database', source => source
      .adapter(new PrismaAdapter(prisma.customers))
      .mapping(map => map
        .field('email').from('email')
        .field('firstName').from('firstName')
        .field('lastName').from('lastName')
      )
      .priority(2)
    )

    // Source 2: External API
    .source('api', source => source
      .adapter(createAPIAdapter(
        'https://api.example.com',
        '/customers',
        process.env.API_KEY!
      ))
      .mapping(map => map
        .field('email').from('emailAddress')
        .field('firstName').from('givenName')
        .field('lastName').from('familyName')
      )
      .priority(1)
    )

    // Write back to database
    .outputAdapter(new PrismaAdapter(prisma.customers))
    .writeOutput(true)

    .matchingScope('within-source-first')
    .matching(match => match
      .field('email').strategy('exact').weight(30)
    )
    .thresholds({ noMatch: 20, definiteMatch: 45 })

    .conflictResolution(cr => cr
      .useSourcePriority(true)
      .fieldStrategy('updatedAt', 'preferNewer')
    )

    .build()
    .consolidate()

  return result
}
```

---

**Previous**: [Matching Scopes](./matching-scopes.md) | **Next**: [API Reference](../api-reference/consolidation-builder.md)
