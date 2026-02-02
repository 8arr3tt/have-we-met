/**
 * Database Integration Example
 *
 * This example demonstrates how to integrate have-we-met with a database using
 * the Prisma adapter. The same patterns apply to Drizzle and TypeORM adapters.
 *
 * Key features:
 * - Resolve new records against database records
 * - Use blocking strategies for efficient database queries
 * - Batch deduplicate entire database tables
 * - Persist results back to the database
 *
 * Note: This example uses a mock adapter for demonstration. In production,
 * you would use a real Prisma/Drizzle/TypeORM client.
 */

import { HaveWeMet } from '../src/index.js'
import type { DatabaseAdapter } from '../src/adapters/types.js'

// Example Prisma schema:
// model Customer {
//   id           String   @id @default(uuid())
//   firstName    String
//   lastName     String
//   email        String
//   phone        String?
//   dateOfBirth  String
//   createdAt    DateTime @default(now())
//   updatedAt    DateTime @updatedAt
// }

interface Customer {
  id: string
  firstName: string
  lastName: string
  email: string
  phone?: string
  dateOfBirth: string
  createdAt?: Date
  updatedAt?: Date
}

// Mock adapter for demonstration (in production, use prismaAdapter(prisma, {...}))
const createMockAdapter = (): DatabaseAdapter<Customer> => {
  const mockData: Customer[] = [
    {
      id: '1',
      firstName: 'Alice',
      lastName: 'Anderson',
      email: 'alice@example.com',
      phone: '+1-555-0100',
      dateOfBirth: '1990-05-15',
    },
    {
      id: '2',
      firstName: 'Bob',
      lastName: 'Brown',
      email: 'bob@example.com',
      dateOfBirth: '1985-08-22',
    },
    {
      id: '3',
      firstName: 'Charlie',
      lastName: 'Chen',
      email: 'charlie@example.com',
      phone: '+1-555-0300',
      dateOfBirth: '1992-03-10',
    },
  ]

  return {
    create: async (record: Omit<Customer, 'id'>) => {
      const newRecord = { ...record, id: String(mockData.length + 1) }
      mockData.push(newRecord)
      return newRecord
    },
    findById: async (id: string) => mockData.find((r) => r.id === id) || null,
    findByIds: async (ids: string[]) =>
      mockData.filter((r) => ids.includes(r.id)),
    findAll: async (options?: { limit?: number; offset?: number }) => {
      const { limit = mockData.length, offset = 0 } = options || {}
      return mockData.slice(offset, offset + limit)
    },
    query: async (conditions: any) => {
      // Simple mock query - in production, this translates to SQL WHERE clauses
      return mockData
    },
    update: async (id: string, updates: Partial<Customer>) => {
      const record = mockData.find((r) => r.id === id)
      if (!record) return null
      Object.assign(record, updates)
      return record
    },
    delete: async (id: string) => {
      const index = mockData.findIndex((r) => r.id === id)
      if (index === -1) return false
      mockData.splice(index, 1)
      return true
    },
    transaction: async <T>(fn: () => Promise<T>) => fn(),
    count: async () => mockData.length,
  } as DatabaseAdapter<Customer>
}

const adapter = createMockAdapter()

// Configure resolver with database adapter
const resolver = HaveWeMet.create<Customer>()
  .schema((schema) =>
    schema
      .field('firstName', { type: 'name', component: 'first' })
      .field('lastName', { type: 'name', component: 'last' })
      .field('email', { type: 'email' })
      .field('phone', { type: 'phone' })
      .field('dateOfBirth', { type: 'date' })
  )
  // Blocking is critical for database performance
  // This translates to SQL WHERE clauses to reduce query size
  .blocking((block) =>
    block
      .onField('lastName', { transform: 'firstLetter' })
      .onField('dateOfBirth', { transform: 'year' })
  )
  .matching((match) =>
    match
      .field('email')
      .strategy('exact')
      .weight(25)
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
      .field('dateOfBirth')
      .strategy('exact')
      .weight(10)
      .thresholds({ noMatch: 30, definiteMatch: 50 })
  )
  .adapter(adapter)
  .build()

console.log('=== Database Integration Example ===\n')

// Example 1: Check for existing customer before creating
console.log('Example 1: Check for existing customer before insert...\n')

const newCustomer: Omit<Customer, 'id'> = {
  firstName: 'Alice',
  lastName: 'Anderson',
  email: 'alice@example.com',
  phone: '+1-555-0100',
  dateOfBirth: '1990-05-15',
}

;(async () => {
  try {
    // Query database for potential matches using blocking
    const matches = await resolver.resolveWithDatabase(newCustomer)

    if (matches.length > 0 && matches[0].outcome === 'definite-match') {
      console.log('✓ Found existing customer:')
      console.log(`  ID: ${matches[0].record.id}`)
      console.log(
        `  Name: ${matches[0].record.firstName} ${matches[0].record.lastName}`
      )
      console.log(`  Email: ${matches[0].record.email}`)
      console.log(`  Match score: ${matches[0].score.totalScore}`)
      console.log(
        '\n  Action: Use existing record instead of creating duplicate\n'
      )
    } else if (matches.length > 0 && matches[0].outcome === 'potential-match') {
      console.log('⚠ Found potential match (needs review):')
      console.log(`  ID: ${matches[0].record.id}`)
      console.log(
        `  Name: ${matches[0].record.firstName} ${matches[0].record.lastName}`
      )
      console.log(`  Match score: ${matches[0].score.totalScore}`)
      console.log('\n  Action: Queue for human review before proceeding\n')
    } else {
      console.log('✓ No existing customer found')
      console.log('  Action: Safe to create new record\n')
    }

    // Example 2: Batch deduplicate database table
    console.log('Example 2: Batch deduplicate database table...\n')

    const dedupeResult = await resolver.deduplicateBatchFromDatabase({
      batchSize: 1000, // Process in chunks to manage memory
      persistResults: false, // Set to true to update database
    })

    console.log('Deduplication results:')
    console.log(`  Total records: ${dedupeResult.stats.totalRecords}`)
    console.log(
      `  Definite matches: ${dedupeResult.stats.definiteMatchesFound}`
    )
    console.log(
      `  Potential matches: ${dedupeResult.stats.potentialMatchesFound}`
    )
    console.log(`  Comparisons: ${dedupeResult.stats.totalComparisons}`)

    if (dedupeResult.stats.totalRecords > 1) {
      const theoreticalComparisons =
        (dedupeResult.stats.totalRecords *
          (dedupeResult.stats.totalRecords - 1)) /
        2
      const reduction = (
        (1 - dedupeResult.stats.totalComparisons / theoreticalComparisons) *
        100
      ).toFixed(1)
      console.log(`  Comparison reduction: ${reduction}% (thanks to blocking!)`)
    }
    console.log()

    // Example 3: Database query optimization
    console.log('Example 3: Understanding database query optimization...\n')

    console.log('Without blocking:')
    console.log('  SELECT * FROM customers')
    console.log('  Then compare ALL records in memory (O(n²) complexity)')
    console.log()

    console.log(
      'With blocking on lastName (firstLetter) and dateOfBirth (year):'
    )
    console.log('  SELECT * FROM customers')
    console.log(`  WHERE SUBSTRING(lastName, 1, 1) = 'A'`)
    console.log(`  AND YEAR(dateOfBirth) = 1990`)
    console.log('  Only compare records in matching blocks (95-99% reduction!)')
    console.log()

    console.log('=== Best Practices ===\n')
    console.log('1. Add database indexes on blocking fields:')
    console.log('   - Index on lastName for text-based blocking')
    console.log('   - Index on dateOfBirth for date-based blocking')
    console.log('   - Composite indexes for multi-field blocking')
    console.log()
    console.log('2. Choose appropriate batch sizes:')
    console.log('   - Small datasets (< 10k): batchSize 1000-5000')
    console.log('   - Large datasets (> 100k): batchSize 5000-10000')
    console.log('   - Monitor memory usage and adjust accordingly')
    console.log()
    console.log('3. Use transactions for consistency:')
    console.log('   - Set persistResults: true for atomic updates')
    console.log('   - Database adapter handles transaction management')
    console.log()
    console.log('4. Test blocking strategies:')
    console.log('   - Balance between recall (finding matches) and performance')
    console.log('   - Use blocking stats to tune your configuration')
    console.log()

    // Production usage example
    console.log('=== Production Code Example ===\n')
    console.log('```typescript')
    console.log('// Real Prisma adapter usage:')
    console.log("import { PrismaClient } from '@prisma/client'")
    console.log("import { prismaAdapter } from 'have-we-met/adapters/prisma'")
    console.log()
    console.log('const prisma = new PrismaClient()')
    console.log()
    console.log('const resolver = HaveWeMet.create<Customer>()')
    console.log('  .schema((schema) => /* ... */)')
    console.log('  .blocking((block) => /* ... */)')
    console.log('  .matching((match) => /* ... */)')
    console.log('  .adapter(prismaAdapter(prisma, {')
    console.log("    tableName: 'customers',")
    console.log("    idField: 'id',")
    console.log('  }))')
    console.log('  .build()')
    console.log()
    console.log('// Use in API endpoint')
    console.log("app.post('/customers', async (req, res) => {")
    console.log('  const customerData = req.body')
    console.log()
    console.log('  // Check for duplicates before creating')
    console.log(
      '  const matches = await resolver.resolveWithDatabase(customerData)'
    )
    console.log()
    console.log("  if (matches[0]?.outcome === 'definite-match') {")
    console.log('    return res.status(409).json({')
    console.log("      error: 'Customer already exists',")
    console.log('      existingId: matches[0].record.id')
    console.log('    })')
    console.log('  }')
    console.log()
    console.log('  // Safe to create new customer')
    console.log('  const newCustomer = await prisma.customer.create({')
    console.log('    data: customerData')
    console.log('  })')
    console.log()
    console.log('  res.json(newCustomer)')
    console.log('})')
    console.log('```')
  } catch (error) {
    console.error('Error:', error)
  }
})()
