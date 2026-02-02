# ConsolidationBuilder API Reference

## Table of Contents

- [Overview](#overview)
- [ConsolidationBuilder Class](#consolidationbuilder-class)
- [SourceBuilder Class](#sourcebuilder-class)
- [FieldMappingBuilder Class](#fieldmappingbuilder-class)
- [ConflictResolutionBuilder Class](#conflictresolutionbuilder-class)
- [Type Definitions](#type-definitions)
- [Factory Functions](#factory-functions)
- [Complete Examples](#complete-examples)

---

## Overview

The ConsolidationBuilder API provides a fluent, type-safe interface for configuring multi-source consolidation workflows. This reference documents all classes, methods, and types.

### Import

```typescript
import { HaveWeMet } from 'have-we-met'
// Or
import { ConsolidationBuilder, createConsolidationBuilder } from 'have-we-met'
```

### Basic Usage

```typescript
const config = HaveWeMet.consolidation<OutputType>()
  .source('source_id', source => /* configure source */)
  .matching(match => /* configure matching */)
  .conflictResolution(cr => /* configure conflict resolution */)
  .build()

const result = await config.consolidate()
```

---

## ConsolidationBuilder Class

Main builder class for configuring multi-source consolidation.

### Constructor

```typescript
new ConsolidationBuilder<TOutput extends Record<string, unknown>>()
```

**Type Parameters**:
- `TOutput`: Unified output record type

**Example**:
```typescript
interface UnifiedCustomer {
  id?: string
  email: string
  firstName: string
  lastName: string
}

const builder = new ConsolidationBuilder<UnifiedCustomer>()
```

### Methods

#### source()

Add a data source to consolidate.

```typescript
source<TInput extends Record<string, unknown>>(
  sourceId: string,
  configurator: (builder: SourceBuilder<TInput, TOutput>) => SourceBuilder<TInput, TOutput> | void
): this
```

**Parameters**:
- `sourceId` (string): Unique identifier for this source
- `configurator` (function): Callback that receives and configures a SourceBuilder

**Returns**: `this` (for chaining)

**Throws**:
- Error if `sourceId` is empty or not a string
- Error from SourceBuilder if source configuration is invalid

**Example**:
```typescript
.source('crm', source => source
  .name('CRM Database')
  .adapter(crmAdapter)
  .mapping(map => map
    .field('email').from('email_address')
    .field('firstName').from('first_name')
    .field('lastName').from('last_name')
  )
  .priority(2)
)
```

#### matchingScope()

Set the matching scope strategy.

```typescript
matchingScope(
  scope: 'within-source-first' | 'unified-pool' | MatchingScope
): this
```

**Parameters**:
- `scope`: Matching scope strategy
  - `'within-source-first'`: Deduplicate within sources first, then match across
  - `'unified-pool'`: Match all records together in unified pool

**Returns**: `this` (for chaining)

**Default**: `'within-source-first'`

**Throws**:
- Error if scope is not one of the allowed values

**Example**:
```typescript
.matchingScope('within-source-first')
// Or
.matchingScope('unified-pool')
```

#### schema()

Configure schema for field normalization.

```typescript
schema(
  configurator: (builder: SchemaBuilder<TOutput>) => SchemaBuilder<TOutput> | void
): this
```

**Parameters**:
- `configurator` (function): Callback that receives and configures a SchemaBuilder

**Returns**: `this` (for chaining)

**Example**:
```typescript
.schema(schema => schema
  .field('email', { type: 'email' })
  .field('phone', { type: 'phone' })
  .field('firstName', { type: 'name', component: 'first' })
  .field('lastName', { type: 'name', component: 'last' })
)
```

**See**: [Core API Reference](./index.md#schemabuilder) for SchemaBuilder documentation

#### matching()

Configure field-by-field matching rules.

```typescript
matching(
  configurator: (builder: MatchingBuilder<TOutput>) => MatchingBuilder<TOutput> | void
): this
```

**Parameters**:
- `configurator` (function): Callback that receives and configures a MatchingBuilder

**Returns**: `this` (for chaining)

**Example**:
```typescript
.matching(match => match
  .field('email').strategy('exact').weight(30)
  .field('firstName').strategy('jaro-winkler').weight(10).threshold(0.85)
  .field('lastName').strategy('jaro-winkler').weight(10).threshold(0.85)
  .field('phone').strategy('exact').weight(20)
)
```

**See**: [Core API Reference](./index.md#matchingbuilder) for MatchingBuilder documentation

#### thresholds()

Set matching score thresholds.

```typescript
thresholds(thresholds: {
  noMatch: number
  definiteMatch: number
}): this
```

**Parameters**:
- `thresholds.noMatch` (number): Score below this = no match
- `thresholds.definiteMatch` (number): Score above this = definite match
- Between these values = potential match (needs review)

**Returns**: `this` (for chaining)

**Example**:
```typescript
.thresholds({
  noMatch: 20,        // Below 20 = different entities
  definiteMatch: 45   // Above 45 = same entity
})
// Between 20-45 = potential match
```

#### blocking()

Configure blocking strategies to reduce comparisons.

```typescript
blocking(
  configurator: (builder: BlockingBuilder<TOutput>) => BlockingBuilder<TOutput> | void
): this
```

**Parameters**:
- `configurator` (function): Callback that receives and configures a BlockingBuilder

**Returns**: `this` (for chaining)

**Example**:
```typescript
.blocking(block => block
  .standard('email')                    // Exact email groups
  .sortedNeighborhood('lastName', 10)   // Sorted windows
)
```

**See**: [Core API Reference](./index.md#blockingbuilder) for BlockingBuilder documentation

#### conflictResolution()

Configure conflict resolution for merging records.

```typescript
conflictResolution(
  configurator: (builder: ConflictResolutionBuilder) => ConflictResolutionBuilder | void
): this
```

**Parameters**:
- `configurator` (function): Callback that receives and configures a ConflictResolutionBuilder

**Returns**: `this` (for chaining)

**Example**:
```typescript
.conflictResolution(cr => cr
  .useSourcePriority(true)
  .defaultStrategy('preferNonNull')
  .fieldStrategy('email', 'preferNewer')
  .fieldStrategy('createdAt', 'preferOlder')
  .fieldStrategy('tags', 'union')
)
```

#### outputAdapter()

Set the output adapter for writing golden records.

```typescript
outputAdapter(adapter: DatabaseAdapter<TOutput>): this
```

**Parameters**:
- `adapter` (DatabaseAdapter): Database adapter for output table

**Returns**: `this` (for chaining)

**Example**:
```typescript
import { PrismaAdapter } from 'have-we-met/adapters'

.outputAdapter(new PrismaAdapter(prisma.unifiedCustomers))
```

#### writeOutput()

Whether to write golden records to the output adapter.

```typescript
writeOutput(write: boolean): this
```

**Parameters**:
- `write` (boolean): Whether to write output

**Returns**: `this` (for chaining)

**Default**: `false`

**Example**:
```typescript
.writeOutput(true)   // Write to database
.writeOutput(false)  // Dry run (no write)
```

#### build()

Build and validate the consolidation configuration.

```typescript
build(): ConsolidationConfig<TOutput>
```

**Returns**: `ConsolidationConfig<TOutput>` - Complete consolidation configuration

**Throws**:
- Error if no sources are configured
- Error if `writeOutput(true)` but no `outputAdapter` provided
- Error from individual builders if their configuration is invalid

**Example**:
```typescript
const config = builder.build()
```

---

## SourceBuilder Class

Builder for configuring a single data source.

### Constructor

```typescript
new SourceBuilder<TInput extends Record<string, unknown>, TOutput extends Record<string, unknown>>(
  sourceId: string
)
```

**Type Parameters**:
- `TInput`: Input record type for this source
- `TOutput`: Unified output record type

**Parameters**:
- `sourceId` (string): Unique identifier for this source

**Throws**:
- Error if `sourceId` is empty or not a string

### Methods

#### name()

Set human-readable name for this source.

```typescript
name(name: string): this
```

**Parameters**:
- `name` (string): Source name

**Returns**: `this` (for chaining)

**Required**: Yes

**Example**:
```typescript
.name('CRM Database')
```

#### adapter()

Set database adapter for loading records from this source.

```typescript
adapter(adapter: DatabaseAdapter<TInput>): this
```

**Parameters**:
- `adapter` (DatabaseAdapter): Database adapter instance

**Returns**: `this` (for chaining)

**Required**: Yes

**Example**:
```typescript
import { PrismaAdapter } from 'have-we-met/adapters'

.adapter(new PrismaAdapter(prisma.crmCustomers))
```

#### mapping()

Configure field mappings from input schema to output schema.

```typescript
mapping(
  configurator: (builder: FieldMappingBuilder<TInput, TOutput>) => FieldMappingBuilder<TInput, TOutput> | void
): this
```

**Parameters**:
- `configurator` (function): Callback that receives and configures a FieldMappingBuilder

**Returns**: `this` (for chaining)

**Required**: Yes

**Example**:
```typescript
.mapping(map => map
  .field('email').from('email_address')
  .field('firstName').from('first_name')
  .field('lastName').from('last_name')
  .field('fullName').transform(input =>
    `${input.first_name} ${input.last_name}`
  )
)
```

#### priority()

Set priority for this source in conflict resolution.

```typescript
priority(priority: number): this
```

**Parameters**:
- `priority` (number): Source priority (higher = more trusted)

**Returns**: `this` (for chaining)

**Default**: `0`

**Example**:
```typescript
.priority(3)  // Highest priority
.priority(2)  // Medium priority
.priority(1)  // Lowest priority
```

#### metadata()

Set custom metadata for this source.

```typescript
metadata(metadata: Record<string, unknown>): this
```

**Parameters**:
- `metadata` (object): Source metadata

**Returns**: `this` (for chaining)

**Example**:
```typescript
.metadata({
  region: 'US',
  vintage: '2024',
  dataQuality: 'high'
})
```

#### build()

Build the source configuration.

```typescript
build(): ConsolidationSource<TInput, TOutput>
```

**Returns**: `ConsolidationSource<TInput, TOutput>` - Complete source configuration

**Throws**:
- Error if `name` is not set
- Error if `adapter` is not set
- Error if `mapping` is not set or empty

---

## FieldMappingBuilder Class

Builder for configuring field mappings from input to output schema.

### Constructor

```typescript
new FieldMappingBuilder<TInput extends Record<string, unknown>, TOutput extends Record<string, unknown>>()
```

**Type Parameters**:
- `TInput`: Input record type
- `TOutput`: Output record type

### Methods

#### field()

Start configuring a field mapping.

```typescript
field(fieldName: keyof TOutput & string): this
```

**Parameters**:
- `fieldName` (string): Output field name

**Returns**: `this` (for chaining)

**Example**:
```typescript
.field('email')
```

#### from()

Map from a source field (static field mapping).

```typescript
from(sourceField: string): this
```

**Parameters**:
- `sourceField` (string): Source field path (supports dot notation for nested fields)

**Returns**: `this` (for chaining)

**Must be preceded by**: `field()`

**Mutually exclusive with**: `transform()`

**Example**:
```typescript
.field('email').from('email_address')
.field('city').from('address.city')  // Nested field
```

#### transform()

Map using a transformation function (computed field).

```typescript
transform(fn: TransformFunction<TInput, TOutput>): this
```

**Parameters**:
- `fn` (function): Transformation function
  - Signature: `(input: TInput, fieldName: keyof TOutput) => TOutput[keyof TOutput]`
  - `input`: Full source record
  - `fieldName`: Output field name being computed
  - Returns: Value for output field

**Returns**: `this` (for chaining)

**Must be preceded by**: `field()`

**Mutually exclusive with**: `from()`

**Example**:
```typescript
.field('fullName').transform(input =>
  `${input.first_name} ${input.last_name}`
)

.field('isActive').transform(input =>
  input.status === 'active'
)
```

#### coerce()

Set type coercion for the mapped value.

```typescript
coerce(type: 'string' | 'number' | 'boolean' | 'date'): this
```

**Parameters**:
- `type`: Target type for coercion
  - `'string'`: Convert to string
  - `'number'`: Convert to number
  - `'boolean'`: Convert to boolean
  - `'date'`: Convert to Date object

**Returns**: `this` (for chaining)

**Must be preceded by**: `field()` and (`from()` or `transform()`)

**Example**:
```typescript
.field('age').from('age_string').coerce('number')
.field('createdAt').from('created_date').coerce('date')
.field('isActive').from('active_flag').coerce('boolean')
```

**Coercion Rules**:

**To string**:
- `123` → `"123"`
- `true` → `"true"`
- `null` → `null` (preserved)

**To number**:
- `"42"` → `42`
- `"3.14"` → `3.14`
- `"invalid"` → `NaN`
- `true` → `1`, `false` → `0`
- `null` → `null` (preserved)

**To boolean**:
- `"true"`, `"yes"`, `1` → `true`
- `"false"`, `"no"`, `0` → `false`
- `null` → `null` (preserved)

**To date**:
- `"2024-01-15"` → `Date` object
- `1705315800000` → `Date` object (Unix timestamp)
- `"invalid"` → `Invalid Date`
- `null` → `null` (preserved)

#### required()

Mark this field as required in the output.

```typescript
required(required: boolean = true): this
```

**Parameters**:
- `required` (boolean): Whether field is required

**Returns**: `this` (for chaining)

**Default**: `false`

**Must be preceded by**: `field()` and (`from()` or `transform()`)

**Example**:
```typescript
.field('email').from('email_address').required()
.field('firstName').from('first_name').required()
.field('phone').from('phone_number')  // Optional (not required)
```

**Behavior**: If a required field cannot be populated, the record mapping fails and the record is skipped.

#### build()

Build the field mapping configuration.

```typescript
build(): Partial<FieldMapping<TInput, TOutput>>
```

**Returns**: `Partial<FieldMapping<TInput, TOutput>>` - Complete field mapping

**Throws**:
- Error if any field doesn't have either `from()` or `transform()`

---

## ConflictResolutionBuilder Class

Builder for configuring conflict resolution.

### Constructor

```typescript
new ConflictResolutionBuilder()
```

### Methods

#### defaultStrategy()

Set the default merge strategy for all fields.

```typescript
defaultStrategy(strategy: MergeStrategy): this
```

**Parameters**:
- `strategy` (MergeStrategy): Default merge strategy

**Returns**: `this` (for chaining)

**Default**: `'preferFirst'`

**Available Strategies**:
- `'preferFirst'`: Use first value
- `'preferLast'`: Use last value
- `'preferNewer'`: Use newest value (by timestamp)
- `'preferOlder'`: Use oldest value (by timestamp)
- `'preferNonNull'`: Use any non-null value
- `'preferLonger'`: Use longer string
- `'preferShorter'`: Use shorter string
- `'concatenate'`: Join strings with delimiter
- `'union'`: Combine arrays (unique values)
- `'mostFrequent'`: Use most common value
- `'average'`: Average numeric values
- `'sum'`: Sum numeric values
- `'min'`: Minimum value
- `'max'`: Maximum value

**Example**:
```typescript
.defaultStrategy('preferNonNull')
```

#### fieldStrategy()

Set per-field merge strategy.

```typescript
fieldStrategy(fieldName: string, strategy: MergeStrategy): this
```

**Parameters**:
- `fieldName` (string): Field name
- `strategy` (MergeStrategy): Merge strategy for this field

**Returns**: `this` (for chaining)

**Example**:
```typescript
.fieldStrategy('email', 'preferNewer')
.fieldStrategy('createdAt', 'preferOlder')
.fieldStrategy('tags', 'union')
.fieldStrategy('revenue', 'sum')
```

**Custom Merge Function**:
```typescript
.fieldStrategy('metadata', (values) => {
  // Custom logic: merge all metadata objects
  return values.reduce((acc, val) => ({ ...acc, ...val }), {})
})
```

#### useSourcePriority()

Whether to use source priority for conflict resolution.

```typescript
useSourcePriority(use: boolean): this
```

**Parameters**:
- `use` (boolean): Whether to use source priority

**Returns**: `this` (for chaining)

**Default**: `true`

**Example**:
```typescript
.useSourcePriority(true)   // Higher priority sources preferred
.useSourcePriority(false)  // Only merge strategies used
```

**Behavior**:
- `true`: Higher priority source values preferred, then merge strategy applied
- `false`: Source priority ignored, only merge strategy used

#### trackProvenance()

Whether to track provenance (source attribution) for merged fields.

```typescript
trackProvenance(track: boolean): this
```

**Parameters**:
- `track` (boolean): Whether to track provenance

**Returns**: `this` (for chaining)

**Default**: `true`

**Example**:
```typescript
.trackProvenance(true)   // Track field sources
.trackProvenance(false)  // Don't track (slight performance gain)
```

#### build()

Build the conflict resolution configuration.

```typescript
build(): ConflictResolutionConfig
```

**Returns**: `ConflictResolutionConfig` - Complete conflict resolution configuration

---

## Type Definitions

### ConsolidationSource

Configuration for a single data source.

```typescript
interface ConsolidationSource<TInput extends Record<string, unknown>, TOutput extends Record<string, unknown>> {
  sourceId: string
  name: string
  adapter: DatabaseAdapter<TInput>
  mapping: FieldMapping<TInput, TOutput>
  priority?: number
  metadata?: Record<string, unknown>
}
```

**Properties**:
- `sourceId`: Unique identifier for this source
- `name`: Human-readable name
- `adapter`: Database adapter for loading records
- `mapping`: Field mapping configuration
- `priority`: Source priority (higher = more trusted), default `0`
- `metadata`: Custom metadata

### FieldMapping

Complete field mapping from input to output schema.

```typescript
type FieldMapping<TInput, TOutput> = {
  [K in keyof TOutput]: FieldMappingConfig<TInput, TOutput>
}
```

### FieldMappingConfig

Configuration for mapping a single field.

```typescript
interface FieldMappingConfig<TInput, TOutput> {
  sourceField?: string
  transform?: TransformFunction<TInput, TOutput>
  coerce?: 'string' | 'number' | 'boolean' | 'date'
  required?: boolean
}
```

**Properties**:
- `sourceField`: Source field path (mutually exclusive with `transform`)
- `transform`: Transformation function (mutually exclusive with `sourceField`)
- `coerce`: Type coercion
- `required`: Whether field is required

**Rules**:
- Must have either `sourceField` or `transform`
- Cannot have both `sourceField` and `transform`

### TransformFunction

Transformation function for computed fields.

```typescript
type TransformFunction<TInput, TOutput> = (
  input: TInput,
  fieldName: keyof TOutput
) => TOutput[keyof TOutput]
```

**Parameters**:
- `input`: Full source record
- `fieldName`: Output field name being computed

**Returns**: Value for output field

### MatchingScope

Enum for matching scope strategies.

```typescript
enum MatchingScope {
  WithinSourceFirst = 'within-source-first',
  UnifiedPool = 'unified-pool'
}
```

### ConflictResolutionConfig

Configuration for conflict resolution.

```typescript
interface ConflictResolutionConfig {
  defaultStrategy?: MergeStrategy
  fieldStrategies?: Record<string, MergeStrategy>
  useSourcePriority?: boolean
  trackProvenance?: boolean
}
```

**Properties**:
- `defaultStrategy`: Default merge strategy, default `'preferFirst'`
- `fieldStrategies`: Per-field merge strategies
- `useSourcePriority`: Use source priority, default `true`
- `trackProvenance`: Track provenance, default `true`

### MergeStrategy

Type for merge strategies.

```typescript
type MergeStrategy =
  | 'preferFirst'
  | 'preferLast'
  | 'preferNewer'
  | 'preferOlder'
  | 'preferNonNull'
  | 'preferLonger'
  | 'preferShorter'
  | 'concatenate'
  | 'union'
  | 'mostFrequent'
  | 'average'
  | 'sum'
  | 'min'
  | 'max'
```

### ConsolidationConfig

Complete consolidation configuration.

```typescript
interface ConsolidationConfig<TOutput extends Record<string, unknown>> {
  sources: Array<ConsolidationSource<Record<string, unknown>, TOutput>>
  matchingScope?: MatchingScope
  conflictResolution?: ConflictResolutionConfig
  outputAdapter?: DatabaseAdapter<TOutput>
  writeOutput?: boolean
}
```

**Properties**:
- `sources`: List of data sources
- `matchingScope`: Matching scope strategy, default `'within-source-first'`
- `conflictResolution`: Conflict resolution configuration
- `outputAdapter`: Output database adapter (required if `writeOutput` is `true`)
- `writeOutput`: Whether to write output, default `false`

### ConsolidationResult

Result of consolidation execution.

```typescript
interface ConsolidationResult<TOutput> {
  goldenRecords: TOutput[]
  matchGroups: ConsolidationMatchResult<TOutput>[]
  stats: ConsolidationStats
  errors: Array<{
    sourceId: string
    recordId: string | number
    error: string
  }>
}
```

**Properties**:
- `goldenRecords`: Golden records created from consolidation
- `matchGroups`: Match groups (which source records were merged)
- `stats`: Statistics from consolidation
- `errors`: Non-fatal errors encountered

### ConsolidationStats

Statistics from consolidation execution.

```typescript
interface ConsolidationStats {
  sources: {
    [sourceId: string]: {
      recordsLoaded: number
      mappingErrors: number
      duplicatesWithinSource: number
    }
  }
  totalRecords: number
  goldenRecords: number
  crossSourceMatches: number
  uniqueRecords: number
  executionTimeMs: number
}
```

**Properties**:
- `sources`: Per-source statistics
- `totalRecords`: Total records loaded across all sources
- `goldenRecords`: Total golden records created
- `crossSourceMatches`: Records matched across different sources
- `uniqueRecords`: Records that didn't match anything
- `executionTimeMs`: Execution time in milliseconds

### MappedRecord

Mapped record with source provenance.

```typescript
interface MappedRecord<TOutput> {
  record: TOutput
  sourceId: string
  originalRecord: unknown
  sourceRecordId: string | number
}
```

**Properties**:
- `record`: Record mapped to output schema
- `sourceId`: Source ID this record came from
- `originalRecord`: Original record before mapping
- `sourceRecordId`: Internal ID from source system

---

## Factory Functions

### createConsolidationBuilder()

Factory function to create a consolidation builder.

```typescript
function createConsolidationBuilder<TOutput extends Record<string, unknown>>(): ConsolidationBuilder<TOutput>
```

**Type Parameters**:
- `TOutput`: Unified output record type

**Returns**: `ConsolidationBuilder<TOutput>`

**Example**:
```typescript
import { createConsolidationBuilder } from 'have-we-met'

const builder = createConsolidationBuilder<Customer>()
```

### createSourceBuilder()

Factory function to create a source builder.

```typescript
function createSourceBuilder<TInput extends Record<string, unknown>, TOutput extends Record<string, unknown>>(
  sourceId: string
): SourceBuilder<TInput, TOutput>
```

**Type Parameters**:
- `TInput`: Input record type
- `TOutput`: Output record type

**Parameters**:
- `sourceId` (string): Unique identifier for this source

**Returns**: `SourceBuilder<TInput, TOutput>`

**Example**:
```typescript
import { createSourceBuilder } from 'have-we-met'

const sourceBuilder = createSourceBuilder<CRMCustomer, UnifiedCustomer>('crm')
```

---

## Complete Examples

### Example 1: Basic Two-Source Consolidation

```typescript
import { HaveWeMet } from 'have-we-met'
import { PrismaClient } from '@prisma/client'
import { PrismaAdapter } from 'have-we-met/adapters'

const prisma = new PrismaClient()

interface CRMCustomer {
  id: string
  email_address: string
  first_name: string
  last_name: string
}

interface BillingCustomer {
  customer_id: string
  email: string
  fname: string
  lname: string
}

interface UnifiedCustomer {
  id?: string
  email: string
  firstName: string
  lastName: string
}

const result = await HaveWeMet.consolidation<UnifiedCustomer>()
  .source<CRMCustomer>('crm', source => source
    .name('CRM Database')
    .adapter(new PrismaAdapter(prisma.crmCustomer))
    .mapping(map => map
      .field('email').from('email_address')
      .field('firstName').from('first_name')
      .field('lastName').from('last_name')
    )
    .priority(2)
  )

  .source<BillingCustomer>('billing', source => source
    .name('Billing System')
    .adapter(new PrismaAdapter(prisma.billingCustomer))
    .mapping(map => map
      .field('email').from('email')
      .field('firstName').from('fname')
      .field('lastName').from('lname')
    )
    .priority(1)
  )

  .schema(schema => schema
    .field('email', { type: 'email' })
    .field('firstName', { type: 'name', component: 'first' })
    .field('lastName', { type: 'name', component: 'last' })
  )

  .matching(match => match
    .field('email').strategy('exact').weight(30)
    .field('firstName').strategy('jaro-winkler').weight(10).threshold(0.85)
    .field('lastName').strategy('jaro-winkler').weight(10).threshold(0.85)
  )

  .thresholds({ noMatch: 20, definiteMatch: 45 })

  .matchingScope('within-source-first')

  .conflictResolution(cr => cr
    .useSourcePriority(true)
    .defaultStrategy('preferNonNull')
  )

  .outputAdapter(new PrismaAdapter(prisma.unifiedCustomer))
  .writeOutput(true)

  .build()
  .consolidate()

console.log(`Created ${result.stats.goldenRecords} golden records`)
```

### Example 2: Transform Functions and Field Strategies

```typescript
interface SourceRecord {
  id: string
  email: string
  fname: string
  lname: string
  tags_csv: string
  created_date: string
}

interface OutputRecord {
  id?: string
  email: string
  fullName: string
  tags: string[]
  createdAt: Date
}

const result = await HaveWeMet.consolidation<OutputRecord>()
  .source<SourceRecord>('source', source => source
    .name('Source Database')
    .adapter(adapter)
    .mapping(map => map
      .field('email').from('email')

      // Computed field
      .field('fullName').transform(input =>
        `${input.fname} ${input.lname}`
      )

      // Parse CSV to array
      .field('tags').transform(input =>
        input.tags_csv.split(',').map(t => t.trim())
      )

      // Coerce string to date
      .field('createdAt').from('created_date').coerce('date')
    )
  )

  .conflictResolution(cr => cr
    .fieldStrategy('tags', 'union')  // Combine all tags
    .fieldStrategy('createdAt', 'preferOlder')  // Earliest date
  )

  .outputAdapter(outputAdapter)
  .writeOutput(true)

  .build()
  .consolidate()
```

### Example 3: Healthcare MPI with Conservative Matching

```typescript
interface Patient {
  id?: string
  ssn?: string
  dateOfBirth: Date
  firstName: string
  lastName: string
}

const result = await HaveWeMet.consolidation<Patient>()
  .source('hospital_a', source => source
    .adapter(hospitalAAdapter)
    .mapping(map => map
      .field('ssn').from('social_security_number')
      .field('dateOfBirth').from('dob').coerce('date')
      .field('firstName').from('first_name')
      .field('lastName').from('last_name')
    )
    .priority(3)
  )

  .source('hospital_b', source => source
    .adapter(hospitalBAdapter)
    .mapping(map => map
      .field('ssn').from('patient_ssn')
      .field('dateOfBirth').from('birth_date').coerce('date')
      .field('firstName').from('fname')
      .field('lastName').from('lname')
    )
    .priority(2)
  )

  .schema(schema => schema
    .field('ssn', { type: 'string', optional: true })
    .field('dateOfBirth', { type: 'date' })
    .field('firstName', { type: 'name', component: 'first' })
    .field('lastName', { type: 'name', component: 'last' })
  )

  .matching(match => match
    .field('ssn').strategy('exact').weight(30)
    .field('dateOfBirth').strategy('exact').weight(20)
    .field('lastName').strategy('jaro-winkler').weight(15).threshold(0.9)
    .field('firstName').strategy('jaro-winkler').weight(12).threshold(0.85)
  )

  .thresholds({ noMatch: 30, definiteMatch: 60 })  // Conservative

  .matchingScope('unified-pool')  // Comprehensive matching

  .conflictResolution(cr => cr
    .useSourcePriority(true)
    .trackProvenance(true)
  )

  .outputAdapter(outputAdapter)
  .writeOutput(true)

  .build()
  .consolidate()
```

---

**Previous**: [ETL Workflow](../consolidation/etl-workflow.md) | **Next**: [Core API Reference](./index.md)
