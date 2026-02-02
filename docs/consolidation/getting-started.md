# Getting Started with Multi-Source Consolidation

## Table of Contents

- [Introduction](#introduction)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Your First Consolidation](#your-first-consolidation)
- [Step-by-Step Tutorial](#step-by-step-tutorial)
- [Common Patterns](#common-patterns)
- [Troubleshooting](#troubleshooting)
- [Next Steps](#next-steps)

---

## Introduction

This guide walks you through creating your first multi-source consolidation workflow with have-we-met. We'll consolidate customer records from two different databases with different schemas into a single unified customer table.

### What You'll Learn

- How to configure source adapters
- How to map different schemas to a unified format
- How to configure matching rules across schemas
- How to resolve conflicts using source priority
- How to execute consolidation and interpret results

### What You'll Build

A consolidation workflow that:

- Loads customers from a CRM database and a Billing system
- Maps both to a unified schema
- Identifies duplicate customers across systems
- Merges duplicates using source priority
- Creates golden customer records

---

## Prerequisites

### System Requirements

- **Node.js**: 18.0.0 or higher
- **Package Manager**: npm, yarn, or pnpm
- **TypeScript**: 5.0.0 or higher (optional but recommended)

### Knowledge Requirements

- Basic TypeScript/JavaScript
- Understanding of your database schema
- Familiarity with promises/async-await

### Database Requirements

This guide uses Prisma with PostgreSQL, but you can use:

- Any Prisma-supported database (PostgreSQL, MySQL, SQLite, MongoDB)
- Drizzle ORM
- TypeORM
- Custom adapter implementation

---

## Installation

### Install have-we-met

```bash
npm install have-we-met
```

### Install Database Adapter

For Prisma:

```bash
npm install @prisma/client
npm install -D prisma
```

For Drizzle:

```bash
npm install drizzle-orm
```

For TypeORM:

```bash
npm install typeorm
```

### Initialize Database (Prisma Example)

```bash
npx prisma init
```

---

## Your First Consolidation

Let's build a simple example consolidating customers from two sources.

### Step 1: Define Your Schemas

First, define the input schemas (existing databases) and the unified output schema:

```typescript
// Input Schema 1: CRM Database
interface CRMCustomer {
  id: string
  email_address: string
  first_name: string
  last_name: string
  phone?: string
  created_at: Date
}

// Input Schema 2: Billing Database
interface BillingCustomer {
  customer_id: string
  email: string
  fname: string
  lname: string
  contact_phone?: string
  signup_date: Date
}

// Unified Output Schema
interface UnifiedCustomer {
  id?: string
  email: string
  firstName: string
  lastName: string
  phone?: string
  createdAt: Date
}
```

### Step 2: Set Up Database Adapters

Configure adapters for each source database:

```typescript
import { HaveWeMet } from 'have-we-met'
import { PrismaClient } from '@prisma/client'
import { PrismaAdapter } from 'have-we-met/adapters'

const prisma = new PrismaClient()

// Create adapters
const crmAdapter = new PrismaAdapter<CRMCustomer>(prisma.crmCustomer)
const billingAdapter = new PrismaAdapter<BillingCustomer>(
  prisma.billingCustomer
)
const outputAdapter = new PrismaAdapter<UnifiedCustomer>(prisma.unifiedCustomer)
```

### Step 3: Configure Consolidation

Build your consolidation configuration:

```typescript
const consolidation = HaveWeMet.consolidation<UnifiedCustomer>()
  // Configure CRM source
  .source(
    'crm',
    (source) =>
      source
        .name('CRM Database')
        .adapter(crmAdapter)
        .mapping((map) =>
          map
            .field('email')
            .from('email_address')
            .field('firstName')
            .from('first_name')
            .field('lastName')
            .from('last_name')
            .field('phone')
            .from('phone')
            .field('createdAt')
            .from('created_at')
        )
        .priority(2) // Higher priority (more trusted)
  )

  // Configure Billing source
  .source(
    'billing',
    (source) =>
      source
        .name('Billing System')
        .adapter(billingAdapter)
        .mapping((map) =>
          map
            .field('email')
            .from('email')
            .field('firstName')
            .from('fname')
            .field('lastName')
            .from('lname')
            .field('phone')
            .from('contact_phone')
            .field('createdAt')
            .from('signup_date')
        )
        .priority(1) // Lower priority
  )

  // Configure matching
  .schema((schema) =>
    schema
      .field('email', { type: 'email' })
      .field('firstName', { type: 'name', component: 'first' })
      .field('lastName', { type: 'name', component: 'last' })
  )
  .matching((match) =>
    match
      .field('email')
      .strategy('exact')
      .weight(30)
      .field('firstName')
      .strategy('jaro-winkler')
      .weight(10)
      .threshold(0.85)
      .field('lastName')
      .strategy('jaro-winkler')
      .weight(10)
      .threshold(0.85)
  )
  .thresholds({ noMatch: 20, definiteMatch: 45 })

  // Configure matching scope
  .matchingScope('within-source-first')

  // Configure conflict resolution
  .conflictResolution((cr) =>
    cr
      .useSourcePriority(true)
      .defaultStrategy('preferNonNull')
      .fieldStrategy('createdAt', 'preferOlder')
  )

  // Set output adapter
  .outputAdapter(outputAdapter)
  .writeOutput(true)

  .build()
```

### Step 4: Execute Consolidation

Run the consolidation:

```typescript
async function main() {
  console.log('Starting consolidation...')

  const result = await consolidation.consolidate()

  console.log('Consolidation complete!')
  console.log(`Golden records: ${result.stats.goldenRecords}`)
  console.log(`Cross-source matches: ${result.stats.crossSourceMatches}`)
  console.log(`Execution time: ${result.stats.executionTimeMs}ms`)
}

main().catch(console.error)
```

### Step 5: Review Results

```typescript
// Access golden records
result.goldenRecords.forEach((customer) => {
  console.log(`${customer.firstName} ${customer.lastName} <${customer.email}>`)
})

// Review match groups
result.matchGroups.forEach((group) => {
  console.log(`Match group (score: ${group.score}):`)
  group.matches.forEach((match) => {
    console.log(`  - Source: ${match.sourceId}, ID: ${match.sourceRecordId}`)
  })
})

// Check for errors
if (result.errors.length > 0) {
  console.log('Errors encountered:')
  result.errors.forEach((err) => {
    console.log(`  ${err.sourceId}:${err.recordId} - ${err.error}`)
  })
}
```

---

## Step-by-Step Tutorial

Let's break down each component in detail.

### 1. Understanding Sources

A **source** represents a single database table or system you're consolidating from.

```typescript
.source('crm', source => source
  .name('CRM Database')           // Human-readable name
  .adapter(crmAdapter)             // Database adapter
  .mapping(map => /* ... */)       // Schema mapping
  .priority(2)                     // Source priority (optional)
  .metadata({ region: 'US' })      // Custom metadata (optional)
)
```

**Source ID**: Unique identifier used in provenance tracking and logging
**Name**: Human-readable name for display and debugging
**Adapter**: Database adapter for loading records
**Mapping**: How to transform records to unified schema
**Priority**: Trustworthiness for conflict resolution (higher = more trusted)
**Metadata**: Custom data for your application logic

### 2. Schema Mapping

Schema mapping transforms records from input schema to unified output schema.

#### Static Field Mapping

Map fields by name:

```typescript
.mapping(map => map
  .field('email').from('email_address')
  .field('firstName').from('first_name')
  .field('lastName').from('last_name')
)
```

This maps:

- `email_address` → `email`
- `first_name` → `firstName`
- `last_name` → `lastName`

#### Nested Field Access

Extract nested fields using dot notation:

```typescript
.mapping(map => map
  .field('city').from('address.city')
  .field('state').from('address.state')
  .field('zip').from('address.zipCode')
)
```

#### Transform Functions

Compute fields with custom logic:

```typescript
.mapping(map => map
  .field('fullName').transform(input =>
    `${input.first_name} ${input.last_name}`
  )
  .field('isActive').transform(input =>
    input.status === 'active' && input.verified === true
  )
)
```

#### Type Coercion

Convert types during mapping:

```typescript
.mapping(map => map
  .field('age').from('age_string').coerce('number')
  .field('createdAt').from('created_date').coerce('date')
  .field('isVerified').from('verified').coerce('boolean')
)
```

#### Required Fields

Mark fields as required:

```typescript
.mapping(map => map
  .field('email').from('email_address').required()
  .field('firstName').from('first_name').required()
  .field('lastName').from('last_name').required()
)
```

If a required field cannot be populated, the record will fail validation.

### 3. Matching Configuration

Matching configuration determines how records are compared.

#### Schema Definition

Define field types for normalization:

```typescript
.schema(schema => schema
  .field('email', { type: 'email' })
  .field('phone', { type: 'phone' })
  .field('firstName', { type: 'name', component: 'first' })
  .field('lastName', { type: 'name', component: 'last' })
  .field('zipCode', { type: 'postalCode', country: 'US' })
)
```

Field types enable automatic normalization:

- **email**: Lowercased, trimmed
- **phone**: Normalized format
- **name**: Trimmed, titlecased, nickname handling
- **postalCode**: Format validation

#### Matching Rules

Configure field-by-field matching:

```typescript
.matching(match => match
  .field('email')
    .strategy('exact')
    .weight(30)

  .field('phone')
    .strategy('exact')
    .weight(20)

  .field('firstName')
    .strategy('jaro-winkler')
    .weight(10)
    .threshold(0.85)

  .field('lastName')
    .strategy('jaro-winkler')
    .weight(10)
    .threshold(0.85)
)
```

**Strategies**:

- `exact`: Must match exactly
- `levenshtein`: Edit distance
- `jaro-winkler`: Transposition-tolerant similarity
- `soundex`: Phonetic matching
- `metaphone`: Advanced phonetic matching

**Weights**: How much each field contributes to total score
**Threshold**: Minimum similarity for field to contribute

#### Match Thresholds

Define score boundaries:

```typescript
.thresholds({
  noMatch: 20,        // Below this = different entities
  definiteMatch: 45   // Above this = same entity
})
// Between 20-45 = potential match (needs review)
```

#### Blocking Strategies

Reduce comparisons for performance:

```typescript
.blocking(block => block
  .standard('email')                    // Group by exact email
  .sortedNeighborhood('lastName', 5)    // Compare within sorted windows
)
```

### 4. Matching Scope

Choose how records are compared across sources.

#### Within-Source-First (Recommended)

```typescript
.matchingScope('within-source-first')
```

**Process**:

1. Deduplicate within CRM
2. Deduplicate within Billing
3. Match CRM records vs Billing records
4. Merge matches

**Advantages**:

- Faster (processes smaller batches)
- Preserves source-specific data quality
- Better for sources with internal duplicates

**Use when**:

- Sources have internal duplicates
- Clear source priority hierarchy
- Performance is important

#### Unified Pool

```typescript
.matchingScope('unified-pool')
```

**Process**:

1. Map all records to unified schema
2. Match all records together (within + across sources)
3. Merge matches

**Advantages**:

- More comprehensive matching
- May find matches within-source-first misses
- Better for high-quality sources

**Use when**:

- Sources have minimal internal duplicates
- Need to catch all possible duplicates
- Data quality varies significantly

### 5. Conflict Resolution

When the same entity exists in multiple sources with different values, how do you decide which value to use?

#### Use Source Priority

```typescript
.conflictResolution(cr => cr
  .useSourcePriority(true)
)
```

Higher priority sources are preferred when values conflict.

```typescript
.source('crm', source => source.priority(3))      // Wins conflicts
.source('billing', source => source.priority(2))  // Second choice
.source('legacy', source => source.priority(1))   // Last resort
```

#### Default Strategy

```typescript
.conflictResolution(cr => cr
  .defaultStrategy('preferNonNull')
)
```

Applied to all fields unless overridden by field-specific strategy.

**Available strategies**:

- `preferFirst`: Use first value encountered
- `preferLast`: Use last value encountered
- `preferNewer`: Use value with newest timestamp
- `preferOlder`: Use value with oldest timestamp
- `preferNonNull`: Use any non-null value
- `preferLonger`: Use longer string
- `preferShorter`: Use shorter string
- `concatenate`: Join strings with delimiter
- `union`: Combine arrays (unique values)
- `mostFrequent`: Use most common value
- `average`: Average of numeric values
- `sum`: Sum of numeric values
- `min`: Minimum value
- `max`: Maximum value

#### Field-Specific Strategies

Override default for specific fields:

```typescript
.conflictResolution(cr => cr
  .defaultStrategy('preferNonNull')
  .fieldStrategy('email', 'preferNewer')      // Latest email
  .fieldStrategy('createdAt', 'preferOlder')  // Earliest date
  .fieldStrategy('tags', 'union')             // Combine all tags
  .fieldStrategy('revenue', 'sum')            // Total revenue
)
```

#### Provenance Tracking

Track which source each field came from:

```typescript
.conflictResolution(cr => cr
  .trackProvenance(true)
)
```

Provenance data shows which source contributed each field value.

### 6. Output Configuration

Specify where to write golden records.

#### Set Output Adapter

```typescript
.outputAdapter(outputAdapter)
```

The output adapter writes golden records to your unified table.

#### Enable Writing

```typescript
.writeOutput(true)
```

If `false`, golden records are returned but not persisted.

### 7. Build and Execute

#### Build Configuration

```typescript
const consolidation = HaveWeMet.consolidation<UnifiedCustomer>()
  .source(/* ... */)
  .matching(/* ... */)
  .conflictResolution(/* ... */)
  .build()
```

The `build()` method validates configuration and returns a consolidation executor.

#### Execute Consolidation

```typescript
const result = await consolidation.consolidate()
```

This:

1. Loads records from all source adapters
2. Maps records to unified schema
3. Matches records (within and/or across sources)
4. Merges matches using conflict resolution
5. Writes golden records to output adapter
6. Returns results with statistics

---

## Common Patterns

### Pattern 1: Two-Source Customer Consolidation

```typescript
const result = await HaveWeMet.consolidation<Customer>()
  .source('crm', (source) =>
    source
      .adapter(crmAdapter)
      .mapping((map) =>
        map
          .field('email')
          .from('email_address')
          .field('firstName')
          .from('first_name')
          .field('lastName')
          .from('last_name')
      )
      .priority(2)
  )
  .source('billing', (source) =>
    source
      .adapter(billingAdapter)
      .mapping((map) =>
        map
          .field('email')
          .from('email')
          .field('firstName')
          .from('fname')
          .field('lastName')
          .from('lname')
      )
      .priority(1)
  )
  .matchingScope('within-source-first')
  .matching((match) =>
    match
      .field('email')
      .strategy('exact')
      .weight(30)
      .field('firstName')
      .strategy('jaro-winkler')
      .weight(10)
      .threshold(0.85)
      .field('lastName')
      .strategy('jaro-winkler')
      .weight(10)
      .threshold(0.85)
  )
  .thresholds({ noMatch: 20, definiteMatch: 45 })
  .conflictResolution((cr) =>
    cr.useSourcePriority(true).defaultStrategy('preferNonNull')
  )
  .outputAdapter(outputAdapter)
  .writeOutput(true)
  .build()
  .consolidate()
```

### Pattern 2: Multi-Source with Transform Functions

```typescript
const result = await HaveWeMet.consolidation<UnifiedRecord>()
  .source('source_a', (source) =>
    source.adapter(sourceAAdapter).mapping((map) =>
      map
        .field('fullName')
        .transform((input) => `${input.fname} ${input.lname}`)
        .field('metadata')
        .transform((input) => ({
          source: 'source_a',
          originalId: input.id,
          importedAt: new Date(),
        }))
    )
  )
  .build()
  .consolidate()
```

### Pattern 3: Tracking Multiple Source IDs

```typescript
interface UnifiedCustomer {
  id?: string
  email: string
  sourceIds: {
    crm?: string
    billing?: string
    support?: string
  }
}

const result = await HaveWeMet.consolidation<UnifiedCustomer>()
  .source('crm', (source) =>
    source.adapter(crmAdapter).mapping((map) =>
      map
        .field('email')
        .from('email')
        .field('sourceIds')
        .transform((input) => ({
          crm: input.id,
        }))
    )
  )
  .source('billing', (source) =>
    source.adapter(billingAdapter).mapping((map) =>
      map
        .field('email')
        .from('email')
        .field('sourceIds')
        .transform((input) => ({
          billing: input.customer_id,
        }))
    )
  )
  .conflictResolution((cr) =>
    cr.fieldStrategy('sourceIds', (values) => {
      // Merge all source IDs
      return values.reduce((acc, val) => ({ ...acc, ...val }), {})
    })
  )
  .build()
  .consolidate()
```

### Pattern 4: Conditional Field Mapping

```typescript
.mapping(map => map
  .field('status').transform(input => {
    if (input.is_active && input.verified) return 'active'
    if (input.is_active) return 'pending'
    return 'inactive'
  })
  .field('tier').transform(input => {
    if (input.revenue > 100000) return 'enterprise'
    if (input.revenue > 10000) return 'professional'
    return 'standard'
  })
)
```

### Pattern 5: Dry Run (No Write)

Test consolidation without writing to database:

```typescript
const result = await HaveWeMet.consolidation<Customer>()
  .source(/* ... */)
  .matching(/* ... */)
  .conflictResolution(/* ... */)
  .outputAdapter(outputAdapter)
  .writeOutput(false) // Don't write to database
  .build()
  .consolidate()

// Review results without persisting
console.log(`Would create ${result.stats.goldenRecords} records`)
result.goldenRecords.forEach((record) => {
  console.log(record)
})
```

---

## Troubleshooting

### Issue: "At least one source is required"

**Cause**: No sources configured.

**Solution**: Add at least one source:

```typescript
.source('source_id', source => source
  .name('Source Name')
  .adapter(adapter)
  .mapping(map => /* ... */)
)
```

### Issue: "outputAdapter is required when writeOutput is true"

**Cause**: Enabled writing without providing output adapter.

**Solution**: Either provide adapter or disable writing:

```typescript
.outputAdapter(outputAdapter)
.writeOutput(true)

// Or
.writeOutput(false)
```

### Issue: "name is required for source"

**Cause**: Source configured without name.

**Solution**: Add name to source:

```typescript
.source('my_source', source => source
  .name('My Source Database')  // Add this
  .adapter(adapter)
  .mapping(map => /* ... */)
)
```

### Issue: "adapter is required for source"

**Cause**: Source configured without adapter.

**Solution**: Add adapter to source:

```typescript
.source('my_source', source => source
  .name('My Source')
  .adapter(myAdapter)  // Add this
  .mapping(map => /* ... */)
)
```

### Issue: "mapping is required for source"

**Cause**: Source configured without field mapping.

**Solution**: Add mapping to source:

```typescript
.source('my_source', source => source
  .name('My Source')
  .adapter(myAdapter)
  .mapping(map => map  // Add this
    .field('email').from('email')
    .field('firstName').from('first_name')
  )
)
```

### Issue: "Must call field() before from()"

**Cause**: Called `.from()` without calling `.field()` first.

**Solution**: Chain properly:

```typescript
// Wrong
.from('email_address')

// Correct
.field('email').from('email_address')
```

### Issue: "Cannot use both from() and transform()"

**Cause**: Tried to use both static mapping and transform function on same field.

**Solution**: Use one or the other:

```typescript
// Either static mapping
.field('email').from('email_address')

// Or transform function
.field('email').transform(input => input.email_address)

// Not both
```

### Issue: "Field 'X' must have either from() or transform()"

**Cause**: Field configured but no mapping specified.

**Solution**: Add mapping:

```typescript
.field('email').from('email_address')
// Or
.field('email').transform(input => input.email_address)
```

### Issue: Low Match Rates

**Symptoms**: Few cross-source matches found.

**Debugging**:

```typescript
// Check field normalization
.schema(schema => schema
  .field('email', { type: 'email' })  // Ensures lowercase
  .field('phone', { type: 'phone' })  // Normalizes format
)

// Lower match threshold
.thresholds({ noMatch: 15, definiteMatch: 40 })  // More lenient

// Review field weights
.matching(match => match
  .field('email').strategy('exact').weight(40)  // Increase weight
)

// Enable debug logging
const result = await consolidation.consolidate({ debug: true })
```

### Issue: Too Many Matches (False Positives)

**Symptoms**: Unrelated records being matched.

**Solutions**:

```typescript
// Increase match threshold
.thresholds({ noMatch: 25, definiteMatch: 55 })  // More strict

// Require multiple fields
.matching(match => match
  .field('email').strategy('exact').weight(30)
  .field('phone').strategy('exact').weight(20)   // Add second identifier
)

// Increase field thresholds
.matching(match => match
  .field('firstName').strategy('jaro-winkler').threshold(0.9)  // Stricter
)

// Add blocking strategy
.blocking(block => block
  .standard('email')  // Only compare records with same email
)
```

### Issue: Performance Problems

**Symptoms**: Consolidation takes too long.

**Solutions**:

```typescript
// Use within-source-first (faster)
.matchingScope('within-source-first')

// Add blocking strategies
.blocking(block => block
  .standard('email')
  .sortedNeighborhood('lastName', 5)
)

// Index blocking fields in database
// CREATE INDEX idx_email ON customers(email);
// CREATE INDEX idx_last_name ON customers(last_name);

// Process in batches (if dataset is huge)
// Split sources and consolidate in chunks
```

---

## Next Steps

### Explore Advanced Features

- **[Schema Mapping Guide](./schema-mapping.md)**: Deep dive into field mapping
- **[Conflict Resolution Guide](./conflict-resolution.md)**: Advanced merge strategies
- **[Matching Scopes Guide](./matching-scopes.md)**: Within-source-first vs unified pool
- **[ETL Workflow Guide](./etl-workflow.md)**: Batch processing and optimization

### Try Examples

- `examples/consolidation/multi-source-customer.ts`: Three-source customer consolidation
- `examples/consolidation/cross-system-patient.ts`: Healthcare MPI example
- `examples/consolidation/etl-pipeline.ts`: ETL workflow with CSV, DB, and API
- `examples/consolidation/manual-workflow.ts`: No database setup required

### Read API Reference

- **[ConsolidationBuilder API](../api-reference/consolidation-builder.md)**: Complete API documentation
- **[Core API](../api/index.md)**: Schema, matching, blocking APIs

---

**Previous**: [Overview](./overview.md) | **Next**: [Schema Mapping Guide](./schema-mapping.md)
