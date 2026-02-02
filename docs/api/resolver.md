# Resolver API Reference

The Resolver is the core class that orchestrates matching, scoring, and outcome classification. It provides methods for single-record resolution, batch deduplication, database operations, ML matching, and external service integration.

## Creating a Resolver

Build a resolver using the fluent builder API:

```typescript
import { HaveWeMet } from 'have-we-met'

const resolver = HaveWeMet.create<Person>()
  .schema(/* ... */)
  .blocking(/* ... */)
  .matching(/* ... */)
  .thresholds({ noMatch: 20, definiteMatch: 45 })
  .build()
```

---

## Core Matching Methods

### `resolve(candidateRecord, existingRecords, options?): MatchResult[]`

Find matches for a single record against a set of existing records. This is a synchronous method that does not invoke external services.

**Parameters:**

- `candidateRecord: Record<string, unknown>` - The record to match
- `existingRecords: Record<string, unknown>[]` - Records to compare against
- `options?: ResolverOptions`
  - `minScore?: number` - Minimum score to include in results
  - `maxResults?: number` - Maximum number of results to return

**Returns:** `MatchResult[]` - Array of matches sorted by score (descending)

**Example:**

```typescript
const newCustomer = {
  email: 'john.doe@example.com',
  firstName: 'John',
  lastName: 'Doe',
}

const matches = resolver.resolve(newCustomer, existingCustomers)

if (matches.length > 0 && matches[0].outcome === 'definite-match') {
  console.log('Found existing customer:', matches[0].record)
}
```

### `findMatches(record, existingRecords, minScore?): MatchResult[]`

Find all matches above a minimum score threshold.

**Parameters:**

- `record: Record<string, unknown>` - The record to match
- `existingRecords: Record<string, unknown>[]` - Records to compare against
- `minScore?: number` - Minimum score threshold (default: 0)

**Returns:** `MatchResult[]` - Array of matches above the threshold

**Example:**

```typescript
const allMatches = resolver.findMatches(record, records, 15)
```

### `resolveWithServices(candidateRecord, existingRecords, options?): Promise<ResolutionResult<T>>`

Find matches with full external service integration (validation, lookup, enrichment).

**Parameters:**

- `candidateRecord: Record<string, unknown>` - The record to match
- `existingRecords: Record<string, unknown>[]` - Records to compare against
- `options?: ResolverOptions` - Same as `resolve()`

**Returns:** `Promise<ResolutionResult<T>>`

**Example:**

```typescript
const result = await resolver.resolveWithServices(newRecord, existingRecords)

console.log(result.matches) // Match results
console.log(result.validationResults) // Service validation outcomes
console.log(result.enrichedRecord) // Record after enrichment services
```

---

## Batch Deduplication

### `deduplicateBatch(records, options?): DeduplicationBatchResult`

Find all duplicates within a dataset using blocking strategies.

**Parameters:**

- `records: Record<string, unknown>[]` - Array of records to deduplicate
- `options?: DeduplicationBatchOptions`
  - `includeStats?: boolean` - Include blocking statistics
  - `minScore?: number` - Minimum score to consider a match
  - `progressCallback?: (progress: Progress) => void` - Progress reporting

**Returns:** `DeduplicationBatchResult`

**Example:**

```typescript
const result = resolver.deduplicateBatch(allRecords, {
  includeStats: true,
  minScore: 20,
  progressCallback: (p) => console.log(`${p.processed}/${p.total}`),
})

console.log(`Found ${result.duplicatePairs.length} duplicate pairs`)
console.log(
  `Blocking reduced comparisons by ${result.stats.reductionRatio * 100}%`
)
```

---

## Database Operations

These methods require a database adapter to be configured.

### `resolveWithDatabase(candidateRecord, options?): Promise<MatchResult[]>`

Resolve a record using the database adapter for efficient blocking queries.

**Parameters:**

- `candidateRecord: T` - The record to match
- `options?: DatabaseResolveOptions`
  - `minScore?: number` - Minimum score threshold
  - `maxResults?: number` - Maximum results to return
  - `blockingOnly?: boolean` - Only use blocking (no full comparison)

**Returns:** `Promise<MatchResult[]>`

**Example:**

```typescript
const resolver = HaveWeMet.create<Customer>()
  .schema(/* ... */)
  .blocking(/* ... */)
  .matching(/* ... */)
  .adapter(prismaAdapter(prisma))
  .build()

const matches = await resolver.resolveWithDatabase(newCustomer)
```

### `resolveWithDatabaseAndServices(candidateRecord, options?): Promise<ResolutionResult<T>>`

Resolve with database and external services.

**Parameters:**

- `candidateRecord: T` - The record to match
- `options?: DatabaseResolveOptions & { skipServices?: boolean }`

**Returns:** `Promise<ResolutionResult<T>>`

### `deduplicateBatchFromDatabase(options?): Promise<DeduplicationBatchResult>`

Batch deduplicate records directly from the database.

**Parameters:**

- `options?: DatabaseDeduplicationOptions`
  - `batchSize?: number` - Records to process per batch (default: 1000)
  - `filter?: FilterCriteria` - Filter records to process
  - `includeStats?: boolean` - Include blocking statistics

**Returns:** `Promise<DeduplicationBatchResult>`

**Example:**

```typescript
const result = await resolver.deduplicateBatchFromDatabase({
  batchSize: 5000,
  filter: { createdAt: { gt: new Date('2024-01-01') } },
})
```

### `findAndMergeDuplicates(options?): Promise<MergeResult[]>`

Find and automatically merge duplicates with persistence.

**Parameters:**

- `options?: MergeOptions`
  - `dryRun?: boolean` - Preview without making changes
  - `minScore?: number` - Minimum score for automatic merge

**Returns:** `Promise<MergeResult[]>`

---

## ML Matching Methods

These methods require ML to be configured via `.ml()` builder method.

### `configureML(model, config?): void`

Configure ML matching on an existing resolver.

**Parameters:**

- `model: MLModel<T>` - The ML model to use
- `config?: Partial<MLIntegrationConfig>`
  - `mode?: 'hybrid' | 'mlOnly' | 'fallback'`
  - `mlWeight?: number` - Weight for ML in hybrid mode (0-1)
  - `matchThreshold?: number` - ML match threshold

### `resolveWithML(candidateRecord, existingRecords, options?): Promise<MLMatchResult<T>[]>`

Find matches with ML enhancement.

**Parameters:**

- `candidateRecord: T` - Record to match
- `existingRecords: T[]` - Records to compare against
- `options?: MLResolverOptions`

**Returns:** `Promise<MLMatchResult<T>[]>`

**Example:**

```typescript
const resolver = HaveWeMet.create<Person>()
  .schema(/* ... */)
  .matching(/* ... */)
  .ml((ml) => ml.usePretrained().mode('hybrid').mlWeight(0.3))
  .build()

const matches = await resolver.resolveWithML(newPerson, existingPeople)

for (const match of matches) {
  console.log(`Score: ${match.score}, ML Score: ${match.mlScore}`)
}
```

### `resolveMLOnly(candidateRecord, existingRecords, options?): Promise<MLMatchResult<T>[]>`

Find matches using ML-only mode (bypasses probabilistic scoring).

**Parameters:** Same as `resolveWithML()`

**Returns:** `Promise<MLMatchResult<T>[]>`

### `resolveWithMLBatch(candidateRecord, existingRecords, options?): Promise<BatchMLResult<T>>`

Find matches with batched ML predictions for better performance.

**Parameters:** Same as `resolveWithML()`

**Returns:** `Promise<{ results: MLMatchResult<T>[]; stats: MLMatchStats }>`

### `extractMLFeatures(candidateRecord, existingRecord): FeatureVector`

Extract ML features from a record pair for inspection.

**Parameters:**

- `candidateRecord: T` - First record
- `existingRecord: T` - Second record

**Returns:** `FeatureVector` - Extracted features

### `ensureMLReady(): Promise<void>`

Initialize and ensure ML is ready for predictions.

---

## Service Methods

### `getServiceHealthStatus(): Promise<Record<string, HealthCheckResult>>`

Get health status for all configured external services.

**Returns:** `Promise<Record<string, HealthCheckResult>>`

**Example:**

```typescript
const health = await resolver.getServiceHealthStatus()
console.log(health)
// { 'email-validator': { status: 'healthy', latency: 45 }, ... }
```

### `getServiceCircuitStatus(): Record<string, CircuitBreakerStatus>`

Get circuit breaker status for all services.

**Returns:** `Record<string, CircuitBreakerStatus>`

### `disposeServices(): Promise<void>`

Dispose services and cleanup resources.

---

## Queue Access

### `get queue(): IReviewQueue<T>`

Access the review queue for human-in-the-loop matching.

**Returns:** `IReviewQueue<T>`

**Example:**

```typescript
// Add potential match to review queue
await resolver.queue.add({
  candidateRecord: newRecord,
  matchedRecord: existingRecord,
  score: 35,
  reason: 'Score between thresholds',
})

// List pending reviews
const pending = await resolver.queue.list({ status: 'pending' })

// Process a review decision
await resolver.queue.confirm(itemId, { reviewer: 'admin' })
```

---

## Properties

### `hasServices: boolean`

Check if external services are configured.

### `hasML: boolean`

Check if ML matching is configured.

### `hasMLConfig: boolean`

Check if ML was set up through the builder API.

### `getServicesConfig(): ServicesConfig | undefined`

Get the current services configuration.

### `getMLConfig(): MLIntegrationConfig | undefined`

Get the current ML integration configuration.

### `getMLModel(): MLModel<T> | undefined`

Get the configured ML model.

---

## Result Types

### MatchResult

```typescript
interface MatchResult {
  /** The matching record */
  record: Record<string, unknown>

  /** Overall match score */
  score: number

  /** Match classification */
  outcome: 'no-match' | 'potential-match' | 'definite-match'

  /** Detailed field-by-field breakdown */
  explanation: MatchExplanation
}
```

### MatchExplanation

```typescript
interface MatchExplanation {
  /** Individual field scores */
  fieldScores: Map<string, FieldScore>

  /** Factors that increased the score */
  positiveFactors: string[]

  /** Factors that decreased the score */
  negativeFactors: string[]
}

interface FieldScore {
  field: string
  similarity: number // 0-1 similarity score
  weight: number // Configured weight
  contribution: number // Weighted contribution to total
  strategy: string // Algorithm used
}
```

### MLMatchResult

```typescript
interface MLMatchResult<T> extends MatchResult {
  /** ML prediction score (0-1) */
  mlScore: number

  /** ML confidence level */
  mlConfidence: number

  /** Combined score in hybrid mode */
  combinedScore?: number
}
```

### ResolutionResult

```typescript
interface ResolutionResult<T> {
  /** Match results */
  matches: MatchResult[]

  /** Validation service results */
  validationResults?: Record<string, ValidationResult>

  /** Lookup service results */
  lookupResults?: Record<string, LookupResult>

  /** Record after enrichment */
  enrichedRecord?: T

  /** Service execution timings */
  timing?: Record<string, number>
}
```

### DeduplicationBatchResult

```typescript
interface DeduplicationBatchResult {
  /** Pairs of duplicate records */
  duplicatePairs: Array<{
    record1: Record<string, unknown>
    record2: Record<string, unknown>
    score: number
    outcome: MatchOutcome
  }>

  /** Blocking statistics (if includeStats: true) */
  stats?: {
    totalRecords: number
    totalBlocks: number
    averageBlockSize: number
    maxBlockSize: number
    pairsGenerated: number
    pairsReduced: number
    reductionRatio: number
  }
}
```

---

## Complete Example

```typescript
import { HaveWeMet, prismaAdapter } from 'have-we-met'
import { PrismaClient } from '@prisma/client'

interface Patient {
  id: string
  mrn: string
  firstName: string
  lastName: string
  dateOfBirth: string
  ssn?: string
  email?: string
  phone?: string
}

const prisma = new PrismaClient()

const resolver = HaveWeMet.create<Patient>()
  .schema((schema) =>
    schema
      .field('mrn')
      .type('string')
      .required()
      .field('firstName')
      .type('name')
      .component('first')
      .normalizer('name')
      .field('lastName')
      .type('name')
      .component('last')
      .normalizer('name')
      .field('dateOfBirth')
      .type('date')
      .normalizer('date')
      .field('ssn')
      .type('string')
      .required(false)
      .field('email')
      .type('email')
      .normalizer('email')
      .field('phone')
      .type('phone')
      .normalizer('phone')
  )
  .blocking((block) =>
    block.composite('union', (comp) =>
      comp
        .onField('ssn')
        .onField('mrn')
        .onField('lastName', { transform: 'soundex' })
        .onFields(['dateOfBirth', 'lastName'], {
          transforms: ['year', 'firstLetter'],
        })
    )
  )
  .matching((match) =>
    match
      .field('ssn')
      .strategy('exact')
      .weight(30)
      .field('mrn')
      .strategy('exact')
      .weight(25)
      .field('firstName')
      .strategy('jaro-winkler')
      .weight(10)
      .threshold(0.85)
      .field('lastName')
      .strategy('jaro-winkler')
      .weight(12)
      .threshold(0.85)
      .field('dateOfBirth')
      .strategy('exact')
      .weight(15)
      .field('email')
      .strategy('exact')
      .weight(10)
      .field('phone')
      .strategy('exact')
      .weight(8)
      .thresholds({ noMatch: 25, definiteMatch: 55 })
  )
  .adapter(prismaAdapter(prisma))
  .ml((ml) => ml.usePretrained().mode('fallback'))
  .build()

// Resolve a new patient
async function checkForDuplicates(newPatient: Patient) {
  const matches = await resolver.resolveWithDatabase(newPatient)

  for (const match of matches) {
    if (match.outcome === 'definite-match') {
      return { isDuplicate: true, existingPatient: match.record }
    }

    if (match.outcome === 'potential-match') {
      // Queue for human review
      await resolver.queue.add({
        candidateRecord: newPatient,
        matchedRecord: match.record,
        score: match.score,
        explanation: match.explanation,
      })
    }
  }

  return { isDuplicate: false }
}
```

---

## Related

- [Schema Builder](./schema-builder.md) - Define record schema
- [Matching Builder](./matching-builder.md) - Configure comparisons
- [Blocking Builder](./blocking-builder.md) - Set up blocking
- [Adapters](./adapters.md) - Database integration
- [Review Queue](../review-queue.md) - Human review workflow
- [ML Matching](../ml-matching/overview.md) - Machine learning integration
