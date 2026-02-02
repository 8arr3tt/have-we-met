import { HaveWeMet } from '../../src/index'
import { PrismaAdapter } from '../../src/adapters/prisma/prisma-adapter'

type Customer = {
  id: string
  firstName: string
  lastName: string
  email: string
  phone?: string
  address?: string
  city?: string
  state?: string
  zipCode?: string
  dobYear?: number
  createdAt: Date
}

async function customerDeduplicationExample() {
  console.log('=== Prisma Adapter Example: Customer Deduplication ===\n')

  const prisma = null as unknown

  const adapter = new PrismaAdapter<Customer>(prisma, {
    tableName: 'customers',
    primaryKey: 'id',
  })

  const resolver = HaveWeMet.schema<Customer>({
    id: { type: 'string' },
    firstName: { type: 'string', weight: 2 },
    lastName: { type: 'string', weight: 3 },
    email: { type: 'string', weight: 2 },
    phone: { type: 'string', weight: 1, optional: true },
    address: { type: 'string', weight: 1, optional: true },
    city: { type: 'string', weight: 1, optional: true },
    state: { type: 'string', weight: 1, optional: true },
    zipCode: { type: 'string', weight: 1, optional: true },
    dobYear: { type: 'number', weight: 2, optional: true },
    createdAt: { type: 'date', weight: 0 },
  })
    .blocking((block) =>
      block
        .on('lastName')
        .on('email')
        .on('phone')
        .onSoundex('lastName')
        .onYear('createdAt', 'createdYear')
    )
    .matching((match) =>
      match
        .compareWith('firstName', 'jaro-winkler', { threshold: 0.85 })
        .compareWith('lastName', 'jaro-winkler', { threshold: 0.9 })
        .compareWith('email', 'exact')
        .compareWith('phone', 'exact')
        .compareWith('address', 'levenshtein', { threshold: 0.8 })
        .compareWith('city', 'exact')
        .compareWith('state', 'exact')
        .compareWith('zipCode', 'exact')
        .compareWith('dobYear', 'exact')
    )
    .thresholds({
      noMatch: 25,
      definiteMatch: 60,
    })
    .adapter(adapter)
    .build()

  console.log('Scenario 1: Add new customer, check for duplicates\n')

  const newCustomer: Customer = {
    id: 'new-123',
    firstName: 'John',
    lastName: 'Smith',
    email: 'john.smith@example.com',
    phone: '555-0100',
    address: '123 Main St',
    city: 'Springfield',
    state: 'IL',
    zipCode: '62701',
    dobYear: 1985,
    createdAt: new Date(),
  }

  try {
    const matches = await resolver.resolveWithDatabase(newCustomer, {
      useBlocking: true,
      maxFetchSize: 1000,
    })

    console.log(`Found ${matches.length} potential matches:`)
    for (const match of matches) {
      console.log(
        `  - ${match.outcome} (score: ${match.score}): ${match.recordId || 'N/A'}`
      )
    }
  } catch (error) {
    console.log('Note: This example requires a configured Prisma client')
    console.log(
      `Error: ${error instanceof Error ? error.message : String(error)}`
    )
  }

  console.log('\n---\n')
  console.log('Scenario 2: Batch deduplicate existing customer database\n')

  try {
    const deduplicationResult = await resolver.deduplicateBatchFromDatabase({
      batchSize: 1000,
      persistResults: false,
    })

    console.log('Deduplication Results:')
    console.log(
      `  Total records processed: ${deduplicationResult.totalRecords}`
    )
    console.log(`  Definite matches: ${deduplicationResult.definiteMatches}`)
    console.log(`  Potential matches: ${deduplicationResult.potentialMatches}`)
    console.log(`  No matches: ${deduplicationResult.noMatches}`)
  } catch (error) {
    console.log('Note: This example requires a configured Prisma client')
    console.log(
      `Error: ${error instanceof Error ? error.message : String(error)}`
    )
  }

  console.log('\n---\n')
  console.log('Scenario 3: Recommended database indexes\n')

  console.log(
    'For optimal performance, create these indexes on your customers table:'
  )
  console.log('')
  console.log('-- Index for lastName blocking')
  console.log('CREATE INDEX idx_customers_lastname ON customers(last_name);')
  console.log('')
  console.log('-- Index for email blocking')
  console.log('CREATE INDEX idx_customers_email ON customers(email);')
  console.log('')
  console.log('-- Index for phone blocking')
  console.log('CREATE INDEX idx_customers_phone ON customers(phone);')
  console.log('')
  console.log('-- Index for Soundex blocking (requires pre-computed column)')
  console.log('ALTER TABLE customers ADD COLUMN soundex_lastname VARCHAR(4);')
  console.log(
    'CREATE INDEX idx_customers_soundex_lastname ON customers(soundex_lastname);'
  )
  console.log('')
  console.log('-- Index for year-based blocking')
  console.log('ALTER TABLE customers ADD COLUMN created_year INT;')
  console.log(
    'CREATE INDEX idx_customers_created_year ON customers(created_year);'
  )
  console.log('')
  console.log('-- Composite index for combined blocking')
  console.log(
    'CREATE INDEX idx_customers_lastname_year ON customers(last_name, created_year);'
  )

  console.log('\n---\n')
  console.log('Scenario 4: Transaction-based duplicate merging\n')

  try {
    await adapter.transaction(async (txAdapter) => {
      const duplicates = await txAdapter.findByBlockingKeys(
        new Map([['email', 'john.smith@example.com']])
      )

      if (duplicates.length > 1) {
        console.log(`Found ${duplicates.length} duplicates to merge`)

        const [primary, ...others] = duplicates

        console.log(`Primary record: ${primary.id}`)
        console.log(`Merging records: ${others.map((r) => r.id).join(', ')}`)

        for (const duplicate of others) {
          await txAdapter.delete(duplicate.id)
        }

        console.log('Duplicates merged successfully!')
      } else {
        console.log('No duplicates found to merge')
      }
    })
  } catch (error) {
    console.log('Note: This example requires a configured Prisma client')
    console.log(
      `Error: ${error instanceof Error ? error.message : String(error)}`
    )
  }

  console.log('\n=== Example Complete ===')
}

if (import.meta.url === `file://${process.argv[1]}`) {
  customerDeduplicationExample().catch(console.error)
}

export { customerDeduplicationExample }
