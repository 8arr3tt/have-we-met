# Multi-Source Consolidation: Overview

## Table of Contents

- [What is Multi-Source Consolidation?](#what-is-multi-source-consolidation)
- [Use Cases](#use-cases)
- [Architecture Overview](#architecture-overview)
- [Key Concepts](#key-concepts)
- [When to Use Consolidation](#when-to-use-consolidation)
- [System Requirements](#system-requirements)
- [Performance Characteristics](#performance-characteristics)
- [Quick Example](#quick-example)
- [Next Steps](#next-steps)

---

## What is Multi-Source Consolidation?

Multi-source consolidation is the process of matching, deduplicating, and merging records from multiple database tables or systems with different schemas into a single unified dataset. This feature extends have-we-met's core identity resolution capabilities to handle heterogeneous data sources.

### The Challenge

Modern organizations often have:

- **Multiple product databases**: Each product has its own customer table
- **Acquired systems**: M&A brings legacy systems with incompatible schemas
- **Department silos**: Sales, support, billing each maintain separate databases
- **Multi-cloud architectures**: Data split across different cloud providers
- **Vendor systems**: External systems with their own data models

Each system has:

- Different field names (e.g., `email_address` vs `email` vs `contact_email`)
- Different data types (e.g., dates as strings vs timestamps)
- Different levels of completeness (some missing optional fields)
- Different data quality (some more trusted than others)

### The Solution

have-we-met's consolidation feature provides:

1. **Schema Mapping**: Transform records from different schemas to a unified format
2. **Cross-Source Matching**: Compare records across schema boundaries
3. **Source-Aware Merging**: Resolve conflicts using source priority and merge strategies
4. **Provenance Tracking**: Maintain records of which sources contributed to each golden record
5. **Flexible Workflows**: Support both within-source-first and unified pool matching

---

## Use Cases

### 1. SaaS Multi-Product Consolidation

**Scenario**: SaaS company has 3 products (CRM, Analytics, Support), each with its own customer database. Need unified customer view for:

- Cross-selling campaigns
- Unified billing
- Customer 360 dashboards

**Sources**:

- Product A database (PostgreSQL)
- Product B database (PostgreSQL)
- Product C database (MongoDB)

**Challenges**:

- Field naming differs (e.g., `email_address`, `email`, `contact_email`)
- Some fields only in certain products (e.g., `support_tier` only in Support DB)
- Different data completeness (CRM has most complete profiles)
- Need to preserve all source IDs for linking back

**Solution**:

```typescript
const result = await HaveWeMet.consolidation<UnifiedCustomer>()
  .source('crm', source => source
    .adapter(crmAdapter)
    .mapping(map => map
      .field('email').from('email_address')
      .field('firstName').from('first_name')
      .field('lastName').from('last_name')
    )
    .priority(3) // Most trusted source
  )
  .source('analytics', source => /* ... */)
  .source('support', source => /* ... */)
  .matchingScope('within-source-first')
  .conflictResolution(cr => cr
    .useSourcePriority(true)
    .defaultStrategy('preferNonNull')
  )
  .build()
  .consolidate()
```

### 2. Healthcare Master Patient Index (MPI)

**Scenario**: Hospital network with 3 facilities, each using different EHR systems. Need Master Patient Index for:

- Coordinated care across facilities
- Preventing duplicate medical records
- HIPAA-compliant patient matching

**Sources**:

- Hospital A (Epic)
- Hospital B (Cerner)
- Hospital C (Meditech)

**Challenges**:

- Conservative matching required (false positives are dangerous)
- Optional SSN (some patients don't provide it)
- Nickname variations (Mike vs Michael)
- Dates in different formats
- Must match across all facilities comprehensively

**Solution**:

```typescript
const result = await HaveWeMet.consolidation<MasterPatient>()
  .source('hospital_a', source => /* ... */)
  .source('hospital_b', source => /* ... */)
  .source('hospital_c', source => /* ... */)
  .matchingScope('unified') // Match across all facilities
  .schema(schema => schema
    .field('ssn', { type: 'string', optional: true })
    .field('dateOfBirth', { type: 'date' })
    .field('lastName', { type: 'name', component: 'last' })
    .field('firstName', { type: 'name', component: 'first' })
  )
  .matching(match => match
    .field('ssn').strategy('exact').weight(30)
    .field('dateOfBirth').strategy('exact').weight(20)
    .field('lastName').strategy('jaro-winkler').weight(15).threshold(0.9)
    .field('firstName').strategy('jaro-winkler').weight(12).threshold(0.85)
  )
  .thresholds({ noMatch: 30, definiteMatch: 60 }) // Conservative
  .build()
  .consolidate()
```

### 3. E-commerce Product Catalog Consolidation

**Scenario**: E-commerce aggregator pulling products from 50+ vendor APIs. Need unified catalog for:

- Price comparison
- Unified search
- Duplicate detection (same product from multiple vendors)

**Sources**:

- Vendor A API (REST)
- Vendor B CSV feed
- Vendor C database

**Challenges**:

- Each vendor uses different SKU format
- Product names vary (e.g., "Apple iPhone 15 Pro" vs "iPhone 15 Pro 128GB")
- Prices in different currencies
- Image URLs from different CDNs
- Need lowest price for each product

**Solution**:

```typescript
const result = await HaveWeMet.consolidation<UnifiedProduct>()
  .source('vendor_a', source => source
    .adapter(vendorAAdapter)
    .mapping(map => map
      .field('sku').from('product_id')
      .field('name').from('title')
      .field('price').from('price_usd').coerce('number')
    )
  )
  .source('vendor_b', source => /* ... */)
  .source('vendor_c', source => /* ... */)
  .matchingScope('unified')
  .matching(match => match
    .field('sku').strategy('exact').weight(30)
    .field('name').strategy('jaro-winkler').weight(20).threshold(0.85)
    .field('brand').strategy('exact').weight(15)
  )
  .conflictResolution(cr => cr
    .fieldStrategy('price', 'min') // Lowest price
    .fieldStrategy('inStock', 'union') // Any vendor has stock
    .fieldStrategy('description', 'preferLonger')
  )
  .build()
  .consolidate()
```

### 4. Post-Merger Integration

**Scenario**: Company A acquires Company B. Both have customer databases. Need consolidated view for:

- Identifying overlapping customers
- Migrating to unified system
- Preventing duplicate communications

**Sources**:

- Company A database (current system)
- Company B database (legacy system being retired)

**Challenges**:

- Company A data is authoritative (more recent, more complete)
- Company B has customers not in Company A
- Need to preserve Company B IDs for migration tracking
- Some customers exist in both (shared clients)

**Solution**:

```typescript
const result = await HaveWeMet.consolidation<Customer>()
  .source('company_a', source => source
    .adapter(companyAAdapter)
    .mapping(map => /* ... */)
    .priority(2) // Authoritative source
  )
  .source('company_b', source => source
    .adapter(companyBAdapter)
    .mapping(map => /* ... */)
    .priority(1) // Legacy source
  )
  .matchingScope('within-source-first')
  .conflictResolution(cr => cr
    .useSourcePriority(true) // Company A wins conflicts
    .defaultStrategy('preferNonNull')
  )
  .build()
  .consolidate()
```

### 5. ETL Pipeline / Data Migration

**Scenario**: Migrating from multiple legacy systems to new unified system. Sources include:

- CSV files (historical data)
- Legacy PostgreSQL database
- REST API (current system)

**Challenges**:

- One-time batch operation (not ongoing)
- Need comprehensive error reporting
- Must track which records came from which source
- Transaction rollback if any step fails

**Solution**: See [ETL Workflow Guide](./etl-workflow.md) for complete example.

---

## Architecture Overview

### Component Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     ConsolidationExecutor                       │
│                                                                 │
│  Orchestrates the full consolidation workflow                  │
└──────────┬──────────────────────────────────────┬──────────────┘
           │                                       │
           │ Uses                                  │ Uses
           │                                       │
┌──────────▼───────────┐              ┌───────────▼──────────────┐
│   SchemaMapper       │              │  CrossSourceMatcher      │
│                      │              │                          │
│  Maps records from   │              │  Matches records across  │
│  input schemas to    │◄─────────────┤  different schemas       │
│  unified output      │              │                          │
└──────────────────────┘              └───────────┬──────────────┘
                                                  │
                                                  │ Uses
                                                  │
                                       ┌──────────▼──────────────┐
                                       │  SourceAwareMerger      │
                                       │                         │
                                       │  Merges matched records │
                                       │  with source priority   │
                                       └─────────────────────────┘
```

### Data Flow: Within-Source-First

```
┌─────────┐    ┌─────────┐    ┌─────────┐
│ Source A│    │ Source B│    │ Source C│
│  (CRM)  │    │(Billing)│    │(Support)│
└────┬────┘    └────┬────┘    └────┬────┘
     │              │              │
     │ Load         │ Load         │ Load
     │              │              │
┌────▼─────┐   ┌───▼──────┐   ┌──▼───────┐
│ Mapped   │   │ Mapped   │   │ Mapped   │
│ Records  │   │ Records  │   │ Records  │
│ (Schema A│   │ (Schema B│   │ (Schema C│
│  → Output)│  │  → Output)│  │  → Output)│
└────┬─────┘   └───┬──────┘   └──┬───────┘
     │             │              │
     │ Dedupe      │ Dedupe       │ Dedupe
     │ Within      │ Within       │ Within
     │             │              │
┌────▼─────┐   ┌───▼──────┐   ┌──▼───────┐
│ Deduped  │   │ Deduped  │   │ Deduped  │
│ Source A │   │ Source B │   │ Source C │
└────┬─────┘   └───┬──────┘   └──┬───────┘
     │             │              │
     └─────────────┼──────────────┘
                   │
                   │ Match Across Sources
                   │
            ┌──────▼───────┐
            │ Cross-Source │
            │   Matches    │
            └──────┬───────┘
                   │
                   │ Merge with Source Priority
                   │
            ┌──────▼───────┐
            │   Golden     │
            │   Records    │
            └──────────────┘
```

### Data Flow: Unified Pool

```
┌─────────┐    ┌─────────┐    ┌─────────┐
│ Source A│    │ Source B│    │ Source C│
└────┬────┘    └────┬────┘    └────┬────┘
     │              │              │
     │ Load & Map   │ Load & Map   │ Load & Map
     │              │              │
     └──────────────┼──────────────┘
                    │
             ┌──────▼────────┐
             │  All Records  │
             │  Unified Pool │
             │  (Same Schema)│
             └──────┬────────┘
                    │
                    │ Match All Together
                    │
             ┌──────▼────────┐
             │    Matches    │
             │  (incl. within│
             │   & cross)    │
             └──────┬────────┘
                    │
                    │ Merge with Source Priority
                    │
             ┌──────▼────────┐
             │    Golden     │
             │    Records    │
             └───────────────┘
```

---

## Key Concepts

### 1. Schema Mapping

**Problem**: Different sources use different field names and structures.

**Solution**: Define mappings from each source's schema to a unified output schema.

**Example**:

```typescript
// Source A schema
interface SourceA {
  email_address: string
  first_name: string
  last_name: string
}

// Source B schema
interface SourceB {
  contact_email: string
  fname: string
  lname: string
}

// Unified output schema
interface Output {
  email: string
  firstName: string
  lastName: string
}

// Mapping for Source A
.source('source_a', source => source
  .mapping(map => map
    .field('email').from('email_address')
    .field('firstName').from('first_name')
    .field('lastName').from('last_name')
  )
)

// Mapping for Source B
.source('source_b', source => source
  .mapping(map => map
    .field('email').from('contact_email')
    .field('firstName').from('fname')
    .field('lastName').from('lname')
  )
)
```

**See**: [Schema Mapping Guide](./schema-mapping.md)

### 2. Matching Scopes

**Problem**: How to compare records when you have multiple sources?

**Two Strategies**:

#### Within-Source-First

1. Deduplicate within each source independently
2. Match the deduplicated records across sources
3. Merge matches

**When to use**:

- Sources have internal duplicates
- Clear source priority hierarchy
- Want to preserve source-specific data quality

#### Unified Pool

1. Map all records to unified schema
2. Match all records together (within and across sources)
3. Merge matches

**When to use**:

- Sources have minimal internal duplicates
- Need comprehensive cross-source matching
- Must catch all potential duplicates

**See**: [Matching Scopes Guide](./matching-scopes.md)

### 3. Source Priority

**Problem**: When the same field has different values in different sources, which do you trust?

**Solution**: Assign priority to each source. Higher priority sources are preferred when resolving conflicts.

**Example**:

```typescript
.source('crm', source => source.priority(3))       // Most trusted
.source('billing', source => source.priority(2))   // Medium trust
.source('legacy', source => source.priority(1))    // Least trusted
```

**Priority Modes**:

- **priority-first**: Always use highest priority source's value
- **priority-fallback**: Use highest priority non-null value
- **priority-only**: Only consider highest priority source (ignore others)

**See**: [Conflict Resolution Guide](./conflict-resolution.md)

### 4. Merge Strategies

**Problem**: Source priority alone isn't enough for all fields. Sometimes you want field-specific logic.

**Solution**: Configure merge strategies per field.

**Example**:

```typescript
.conflictResolution(cr => cr
  .defaultStrategy('preferNonNull')           // Default: any non-null value
  .fieldStrategy('email', 'preferNewer')      // Email: newest value
  .fieldStrategy('createdAt', 'preferOlder')  // Created: earliest date
  .fieldStrategy('tags', 'union')             // Tags: combine all unique
)
```

**Available Strategies**: `preferFirst`, `preferLast`, `preferNewer`, `preferOlder`, `preferNonNull`, `preferLonger`, `preferShorter`, `concatenate`, `union`, `mostFrequent`, `average`, `sum`, `min`, `max`, custom functions.

**See**: [Conflict Resolution Guide](./conflict-resolution.md)

### 5. Provenance Tracking

**Problem**: Need to know which source system each field value came from.

**Solution**: Consolidation automatically tracks provenance.

**What's Tracked**:

- Which source records were merged into each golden record
- Which source each field value came from
- Original source IDs for linking back to source systems

**Example Provenance**:

```typescript
{
  goldenRecord: {
    id: '123',
    email: 'user@example.com',  // From CRM
    phone: '+1234567890',        // From Billing
    address: '123 Main St'       // From Support
  },
  provenance: {
    email: { sourceId: 'crm', sourceRecordId: 'crm-456' },
    phone: { sourceId: 'billing', sourceRecordId: 'bill-789' },
    address: { sourceId: 'support', sourceRecordId: 'sup-012' }
  }
}
```

---

## When to Use Consolidation

### Use Consolidation When:

✅ **Multiple tables/databases with different schemas**

- Product A customer table, Product B customer table
- Legacy system + new system
- Department silos (sales DB, support DB, billing DB)

✅ **Need unified view across systems**

- Customer 360
- Master Patient Index (MPI)
- Product catalog from multiple vendors

✅ **Data quality varies by source**

- Some sources more trusted than others
- Need source priority for conflict resolution

✅ **Cross-system matching required**

- Same person in multiple systems
- Same product from multiple vendors

✅ **ETL / Data Migration**

- One-time consolidation from multiple sources
- Ongoing synchronization pipelines

### Use Standard Resolution When:

✅ **Single table/database**

- Deduplicating within one table
- All records have same schema

✅ **Simple matching requirements**

- Just finding duplicates
- No cross-schema concerns

✅ **Real-time matching at point of entry**

- New record vs existing records
- Single source of truth

---

## System Requirements

### Minimum Requirements

- **Node.js**: 18.0.0 or higher
- **TypeScript**: 5.0.0 or higher (if using TypeScript)
- **Memory**: 512 MB available RAM (for small datasets)
- **Disk**: Minimal (depends on dataset size)

### Recommended for Production

- **Node.js**: 20.0.0 or higher
- **Memory**: 2 GB+ available RAM
- **CPU**: Multi-core processor (for parallel processing)
- **Database**: Indexed fields for blocking strategies

### Supported Databases

- **Prisma**: PostgreSQL, MySQL, SQLite, SQL Server, MongoDB
- **Drizzle**: PostgreSQL, MySQL, SQLite
- **TypeORM**: PostgreSQL, MySQL, MariaDB, SQLite, MSSQL, Oracle
- **Custom**: Implement `DatabaseAdapter` interface

---

## Performance Characteristics

### Scalability

| Dataset Size | Sources | Records/Source | Within-Source-First | Unified Pool | Memory Usage |
| ------------ | ------- | -------------- | ------------------- | ------------ | ------------ |
| Small        | 2-3     | 1k-10k         | <1s                 | <2s          | <100 MB      |
| Medium       | 3-5     | 10k-50k        | <10s                | <20s         | <500 MB      |
| Large        | 3-5     | 50k-100k       | <30s                | <60s         | <1 GB        |
| Very Large   | 5+      | 100k+          | <2m                 | <5m          | 1-2 GB       |

### Performance Factors

**Blocking Strategies**: Reduce comparison count from O(n²) to O(n·k) where k << n

- Standard blocking: 96-99% reduction in comparisons
- Sorted neighbourhood: 95-98% reduction

**Matching Scope**:

- Within-source-first: 40-60% faster (processes smaller batches)
- Unified pool: More comprehensive (may find additional matches)

**Schema Mapping Overhead**:

- ~5-10% overhead for field mapping
- ~10-20% overhead for transform functions
- Negligible overhead for static field mapping

**Database Adapter Performance**:

- Batch loading: Essential for 10k+ records
- Indexed blocking fields: 10x-100x faster blocking queries
- Transaction support: Ensures consistency, slight performance cost

### Optimization Tips

1. **Use Within-Source-First** when possible (faster)
2. **Index blocking fields** in source databases
3. **Batch size**: 1,000-10,000 records per batch
4. **Memory management**: Process in chunks for very large datasets
5. **Database connections**: Pool connections, use batch operations

**See**: [ETL Workflow Guide](./etl-workflow.md#performance-optimization)

---

## Quick Example

Here's a complete example consolidating customer records from two databases:

```typescript
import { HaveWeMet } from 'have-we-met'
import { PrismaAdapter } from 'have-we-met/adapters'

// Define unified output schema
interface UnifiedCustomer {
  id?: string
  email: string
  firstName: string
  lastName: string
  phone?: string
  createdAt?: Date
}

// Configure consolidation
const result = await HaveWeMet.consolidation<UnifiedCustomer>()
  // Source 1: CRM Database
  .source(
    'crm',
    (source) =>
      source
        .name('CRM Database')
        .adapter(new PrismaAdapter(prisma.crmCustomer))
        .mapping((map) =>
          map
            .field('email')
            .from('email_address')
            .field('firstName')
            .from('first_name')
            .field('lastName')
            .from('last_name')
            .field('phone')
            .from('phone_number')
            .field('createdAt')
            .from('created_at')
        )
        .priority(2) // CRM is more trusted
  )

  // Source 2: Billing Database
  .source(
    'billing',
    (source) =>
      source
        .name('Billing System')
        .adapter(new PrismaAdapter(prisma.billingCustomer))
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
        )
        .priority(1) // Billing is less trusted
  )

  // Configure matching
  .schema((schema) =>
    schema
      .field('email', { type: 'email' })
      .field('firstName', { type: 'name', component: 'first' })
      .field('lastName', { type: 'name', component: 'last' })
      .field('phone', { type: 'phone' })
  )
  .matching((match) =>
    match
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
  .thresholds({ noMatch: 25, definiteMatch: 50 })

  // Matching strategy
  .matchingScope('within-source-first')

  // Conflict resolution
  .conflictResolution(
    (cr) =>
      cr
        .useSourcePriority(true) // Use source priority
        .defaultStrategy('preferNonNull') // Default: any non-null
        .fieldStrategy('email', 'preferNewer') // Latest email
        .fieldStrategy('createdAt', 'preferOlder') // Earliest date
  )

  // Output configuration
  .outputAdapter(new PrismaAdapter(prisma.unifiedCustomer))
  .writeOutput(true)

  // Build and execute
  .build()
  .consolidate()

// Results
console.log(`Golden records: ${result.stats.goldenRecords}`)
console.log(`Cross-source matches: ${result.stats.crossSourceMatches}`)
console.log(`Unique records: ${result.stats.uniqueRecords}`)
console.log(`Execution time: ${result.stats.executionTimeMs}ms`)

// Access golden records
result.goldenRecords.forEach((record) => {
  console.log(`${record.firstName} ${record.lastName} <${record.email}>`)
})
```

**Output**:

```
Golden records: 8,234
Cross-source matches: 1,542
Unique records: 6,692
Execution time: 4,231ms

John Smith <john@example.com>
Jane Doe <jane@example.com>
...
```

---

## Next Steps

### Getting Started

1. **Read the [Getting Started Guide](./getting-started.md)**: Step-by-step tutorial
2. **Review the [Examples](../../examples/consolidation/)**: Practical code examples
3. **Try the [Manual Workflow](../../examples/consolidation/manual-workflow.ts)**: Test without database setup

### Deep Dives

- **[Schema Mapping Guide](./schema-mapping.md)**: Field mapping, transformations, type coercion
- **[Conflict Resolution Guide](./conflict-resolution.md)**: Source priority, merge strategies, provenance
- **[Matching Scopes Guide](./matching-scopes.md)**: Within-source-first vs unified pool
- **[ETL Workflow Guide](./etl-workflow.md)**: Batch processing, transactions, optimization

### Reference

- **[API Reference](../api-reference/consolidation-builder.md)**: Complete API documentation
- **[Core API Reference](../api/index.md)**: Schema, matching, blocking APIs

### Support

- **GitHub Issues**: Report bugs and request features
- **Documentation**: This docs directory
- **Examples**: See `examples/consolidation/`

---

**Next**: [Getting Started Guide](./getting-started.md)
