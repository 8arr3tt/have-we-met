# Multi-Source Consolidation Examples

This directory contains comprehensive examples demonstrating how to use have-we-met's multi-source consolidation feature to match, deduplicate, and merge records from multiple database tables or systems with different schemas.

## What is Multi-Source Consolidation?

Multi-source consolidation allows you to:

- **Match records across different schemas**: Compare records from systems with different field names and structures
- **Deduplicate across sources**: Identify the same entity (customer, patient, product) across multiple databases
- **Merge with source priority**: Resolve conflicts using configurable rules and source trustworthiness
- **Track provenance**: Maintain records of which source systems contributed to each golden record
- **Create unified views**: Build master data indexes from disparate sources

## Examples Overview

### 1. Multi-Source Customer Consolidation
**File**: `multi-source-customer.ts`

**Scenario**: Three product databases (CRM, Billing, Support) need to be consolidated into a single customer table.

**Key Features**:
- Within-source-first matching strategy
- Source priority-based conflict resolution
- Field-level merge strategies
- Schema mapping with different field names

**Use Case**: SaaS company with separate databases per product wanting unified customer view

**Run**:
```bash
npx tsx examples/consolidation/multi-source-customer.ts
```

### 2. Cross-System Patient Matching
**File**: `cross-system-patient.ts`

**Scenario**: Hospital network creating a Master Patient Index (MPI) from three hospital systems.

**Key Features**:
- Unified pool matching strategy (healthcare-appropriate)
- Conservative thresholds for high-stakes matching
- Nickname handling (Mike vs Michael)
- Optional field handling (SSN may be missing)
- Cross-system identifier tracking

**Use Case**: Healthcare network enabling coordinated care across facilities

**Run**:
```bash
npx tsx examples/consolidation/cross-system-patient.ts
```

### 3. ETL Pipeline Example
**File**: `etl-pipeline.ts`

**Scenario**: Extract contacts from CSV file (legacy), PostgreSQL database (current), and REST API (CRM), transform to unified schema, and load into new database.

**Key Features**:
- Three different data sources (CSV, database, API)
- Custom adapter implementations
- Tag enrichment from source metadata
- Union merge strategy for combining tags
- Metadata tracking for all source IDs

**Use Case**: Data migration, system consolidation, creating single source of truth

**Run**:
```bash
npx tsx examples/consolidation/etl-pipeline.ts
```

### 4. Manual Workflow (No Database)
**File**: `manual-workflow.ts`

**Scenario**: Consolidate product catalog from three vendors without database adapters, using direct API.

**Key Features**:
- No database setup required
- Direct use of SchemaMapper and CrossSourceMatcher
- Step-by-step control over consolidation process
- Perfect for prototyping and testing

**Use Case**: Custom integrations, one-off scripts, testing, non-database sources

**Run**:
```bash
npx tsx examples/consolidation/manual-workflow.ts
```

## Matching Strategies

### Within-Source-First
```typescript
.matchingScope('within-source-first')
```

**How it works**:
1. Deduplicate within each source separately
2. Match the deduplicated records across sources
3. Merge matches using source priority

**When to use**:
- Sources have internal duplicates
- Want to preserve source-specific data quality
- Clear source priority hierarchy exists
- Multi-stage deduplication makes sense

**Examples**: Multi-source customer consolidation, ETL pipeline

### Unified Pool
```typescript
.matchingScope('unified')
```

**How it works**:
1. Map all records from all sources to unified schema
2. Compare all records together in one pool
3. Merge matches using source priority

**When to use**:
- Sources have minimal internal duplicates
- Need comprehensive cross-source matching
- Data quality varies significantly
- Must catch all potential duplicates

**Examples**: Healthcare MPI, product catalog consolidation

## Source Priority

Source priority determines which values are preferred when merging conflicting data:

```typescript
.source('high_quality_db', source => source
  .priority(3)  // Highest priority - most trusted
)
.source('medium_quality_db', source => source
  .priority(2)  // Medium priority
)
.source('legacy_system', source => source
  .priority(1)  // Lowest priority - least trusted
)
```

**Priority Modes**:
- **priority-first**: Always use highest priority source's value
- **priority-fallback**: Use highest priority non-null value
- **priority-only**: Only consider highest priority source (ignore others)

## Schema Mapping

### Static Field Mapping
Map fields by name:
```typescript
.mapping(map => map
  .field('email').from('email_address')
  .field('firstName').from('first_name')
)
```

### Nested Field Access
Extract nested fields:
```typescript
.mapping(map => map
  .field('city').from('address.city')
  .field('country').from('address.country')
)
```

### Transform Functions
Compute fields with custom logic:
```typescript
.mapping(map => map
  .field('fullName').transform(input =>
    `${input.first_name} ${input.last_name}`
  )
  .field('isActive').transform(input =>
    input.status === 'active'
  )
)
```

## Conflict Resolution

### Use Source Priority
```typescript
.conflictResolution(cr => cr
  .useSourcePriority(true)  // Prefer higher priority sources
)
```

### Default Strategy
```typescript
.conflictResolution(cr => cr
  .defaultStrategy('preferNonNull')  // Prefer any non-null value
)
```

### Field-Specific Strategies
```typescript
.conflictResolution(cr => cr
  .fieldStrategy('email', 'preferNewer')      // Latest email
  .fieldStrategy('createdAt', 'preferOlder')  // Earliest date
  .fieldStrategy('tags', 'union')             // Combine all tags
)
```

### Custom Merge Strategy
```typescript
.fieldStrategy('metadata', (values) => {
  // Custom logic to merge metadata objects
  return values.reduce((acc, val) => ({ ...acc, ...val }), {})
})
```

## Available Merge Strategies

| Strategy | Description | Use Case |
|----------|-------------|----------|
| `preferFirst` | Use first value | Arbitrary preference |
| `preferLast` | Use last value | Arbitrary preference |
| `preferNewer` | Use newest by date | Time-sensitive data |
| `preferOlder` | Use oldest by date | Historical records |
| `preferNonNull` | Use any non-null | Fill in missing data |
| `preferLonger` | Use longer string | More detailed text |
| `preferShorter` | Use shorter string | Concise text |
| `concatenate` | Join strings | Combine descriptions |
| `union` | Unique array items | Tags, categories |
| `mostFrequent` | Most common value | Voting/consensus |
| `average` | Numeric average | Ratings, scores |
| `sum` | Numeric sum | Quantities, totals |
| `min` | Minimum value | Lowest price |
| `max` | Maximum value | Highest capacity |

## Configuration Patterns

### Enterprise SaaS (B2B)
```typescript
const config = HaveWeMet.consolidation<Customer>()
  .matchingScope('within-source-first')
  .matching(match => match
    .field('email').strategy('exact').weight(30)
    .field('companyDomain').strategy('exact').weight(20)
    .field('companyName').strategy('jaro-winkler').weight(15)
  )
  .thresholds({ noMatch: 30, definiteMatch: 50 })
  .conflictResolution(cr => cr
    .useSourcePriority(true)
    .defaultStrategy('preferNonNull')
    .fieldStrategy('revenue', 'max')
    .fieldStrategy('employees', 'max')
  )
```

### Healthcare (HIPAA-compliant)
```typescript
const config = HaveWeMet.consolidation<Patient>()
  .matchingScope('unified')
  .matching(match => match
    .field('ssn').strategy('exact').weight(30)
    .field('dateOfBirth').strategy('exact').weight(20)
    .field('lastName').strategy('jaro-winkler').weight(15)
    .field('firstName').strategy('jaro-winkler').weight(12)
  )
  .thresholds({ noMatch: 30, definiteMatch: 60 })  // Conservative
  .conflictResolution(cr => cr
    .useSourcePriority(true)
    .fieldStrategy('firstVisit', 'preferOlder')
    .fieldStrategy('lastVisit', 'preferNewer')
  )
```

### E-commerce (Product Catalog)
```typescript
const config = HaveWeMet.consolidation<Product>()
  .matchingScope('unified')
  .matching(match => match
    .field('sku').strategy('exact').weight(30)
    .field('name').strategy('jaro-winkler').weight(20)
    .field('brand').strategy('exact').weight(15)
  )
  .thresholds({ noMatch: 25, definiteMatch: 45 })
  .conflictResolution(cr => cr
    .fieldStrategy('price', 'min')  // Lowest price
    .fieldStrategy('inStock', 'union')  // Any in stock
    .fieldStrategy('description', 'preferLonger')
  )
```

## Common Patterns

### Tracking Multiple Source IDs
```typescript
interface UnifiedRecord {
  id?: string
  // ... other fields
  sourceIds: {
    systemA?: string
    systemB?: string
    systemC?: string
  }
}

.source('systemA', source => source
  .mapping(map => map
    .field('sourceIds').transform(input => ({
      systemA: input.id
    }))
  )
)
```

### Metadata Enrichment
```typescript
.mapping(map => map
  .field('metadata').transform(input => ({
    source: 'crm',
    importedAt: new Date(),
    dataQuality: calculateQuality(input),
    originalId: input.id
  }))
)
```

### Conditional Field Mapping
```typescript
.mapping(map => map
  .field('status').transform(input => {
    if (input.is_active && input.verified) return 'active'
    if (input.is_active) return 'pending'
    return 'inactive'
  })
)
```

## Running the Examples

### Prerequisites
```bash
npm install
npm run build
```

### Run All Examples
```bash
npx tsx examples/consolidation/multi-source-customer.ts
npx tsx examples/consolidation/cross-system-patient.ts
npx tsx examples/consolidation/etl-pipeline.ts
npx tsx examples/consolidation/manual-workflow.ts
```

### Run with TypeScript
```bash
npm run dev  # Watch mode for development
```

## Next Steps

- **Read the documentation**: See `docs/consolidation/` for comprehensive guides
- **Try with your data**: Adapt these examples to your schemas
- **Start with manual workflow**: Test matching logic without database setup
- **Add database adapters**: Use Prisma/Drizzle/TypeORM adapters for production
- **Tune thresholds**: Adjust matching thresholds based on your data
- **Monitor review queue**: Handle potential matches that need human review

## Documentation

- [Consolidation Overview](../../docs/consolidation/overview.md)
- [Getting Started Guide](../../docs/consolidation/getting-started.md)
- [Schema Mapping Guide](../../docs/consolidation/schema-mapping.md)
- [Conflict Resolution Guide](../../docs/consolidation/conflict-resolution.md)
- [Matching Scopes Guide](../../docs/consolidation/matching-scopes.md)
- [ETL Workflow Guide](../../docs/consolidation/etl-workflow.md)
- [API Reference](../../docs/api-reference/consolidation-builder.md)

## Support

- GitHub Issues: https://github.com/8arr3tt/have-we-met/issues
- Documentation: `docs/consolidation/`
- Examples: This directory

---

**Note**: These examples use mock adapters and simulated data for demonstration. In production, you would use actual database adapters (Prisma, Drizzle, TypeORM) and real data sources.
