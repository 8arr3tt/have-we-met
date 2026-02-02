import { HaveWeMet } from '../../src/index'
import { TypeORMAdapter } from '../../src/adapters/typeorm/typeorm-adapter'

type Contact = {
  id: string
  firstName: string
  lastName: string
  email: string
  phone?: string
  company?: string
  title?: string
  address?: string
  city?: string
  state?: string
  zipCode?: string
  country?: string
  notes?: string
  source?: string
  createdAt: Date
  updatedAt: Date
}

async function contactMergingExample() {
  console.log('=== TypeORM Adapter Example: Contact Merging ===\n')

  const repository = null as unknown

  const adapter = new TypeORMAdapter<Contact>(repository, {
    tableName: 'contacts',
    primaryKey: 'id',
  })

  const resolver = HaveWeMet.schema<Contact>({
    id: { type: 'string' },
    firstName: { type: 'string', weight: 2 },
    lastName: { type: 'string', weight: 3 },
    email: { type: 'string', weight: 3 },
    phone: { type: 'string', weight: 2, optional: true },
    company: { type: 'string', weight: 2, optional: true },
    title: { type: 'string', weight: 1, optional: true },
    address: { type: 'string', weight: 1, optional: true },
    city: { type: 'string', weight: 1, optional: true },
    state: { type: 'string', weight: 1, optional: true },
    zipCode: { type: 'string', weight: 1, optional: true },
    country: { type: 'string', weight: 1, optional: true },
    notes: { type: 'string', weight: 0, optional: true },
    source: { type: 'string', weight: 0, optional: true },
    createdAt: { type: 'date', weight: 0 },
    updatedAt: { type: 'date', weight: 0 },
  })
    .blocking((block) =>
      block
        .on('lastName')
        .on('email')
        .on('phone')
        .on('company')
        .onSoundex('lastName')
    )
    .matching((match) =>
      match
        .compareWith('firstName', 'jaro-winkler', { threshold: 0.85 })
        .compareWith('lastName', 'jaro-winkler', { threshold: 0.9 })
        .compareWith('email', 'exact')
        .compareWith('phone', 'exact')
        .compareWith('company', 'jaro-winkler', { threshold: 0.85 })
        .compareWith('title', 'levenshtein', { threshold: 0.8 })
        .compareWith('address', 'levenshtein', { threshold: 0.8 })
        .compareWith('city', 'exact')
        .compareWith('state', 'exact')
        .compareWith('zipCode', 'exact')
        .compareWith('country', 'exact')
    )
    .thresholds({
      noMatch: 20,
      definiteMatch: 55,
    })
    .adapter(adapter)
    .build()

  console.log('Scenario 1: Import new contact, check for duplicates\n')

  const newContact: Contact = {
    id: 'contact-789',
    firstName: 'Michael',
    lastName: 'Williams',
    email: 'michael.williams@company.com',
    phone: '555-0300',
    company: 'Tech Solutions Inc',
    title: 'Senior Developer',
    address: '789 Tech Drive',
    city: 'San Francisco',
    state: 'CA',
    zipCode: '94102',
    country: 'USA',
    source: 'LinkedIn',
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  try {
    const matches = await resolver.resolveWithDatabase(newContact, {
      useBlocking: true,
      maxFetchSize: 1000,
    })

    console.log(`Found ${matches.length} potential matches:`)
    for (const match of matches) {
      console.log(
        `  - ${match.outcome} (score: ${match.score}): ${match.recordId || 'N/A'}`
      )
    }

    if (matches.length === 0) {
      console.log('No duplicates found - safe to add contact')
    } else {
      const definiteMatches = matches.filter(
        (m) => m.outcome === 'definiteMatch'
      )
      if (definiteMatches.length > 0) {
        console.log('Definite match found - contact likely already exists')
      } else {
        console.log('Potential matches found - manual review recommended')
      }
    }
  } catch (error) {
    console.log('Note: This example requires a configured TypeORM repository')
    console.log(
      `Error: ${error instanceof Error ? error.message : String(error)}`
    )
  }

  console.log('\n---\n')
  console.log('Scenario 2: Batch process contacts from CRM import\n')

  try {
    const deduplicationResult = await resolver.deduplicateBatchFromDatabase({
      batchSize: 1000,
      persistResults: false,
    })

    console.log('Batch Processing Results:')
    console.log(
      `  Total contacts processed: ${deduplicationResult.totalRecords}`
    )
    console.log(`  Definite duplicates: ${deduplicationResult.definiteMatches}`)
    console.log(
      `  Potential duplicates: ${deduplicationResult.potentialMatches}`
    )
    console.log(`  Unique contacts: ${deduplicationResult.noMatches}`)

    const totalDuplicates =
      deduplicationResult.definiteMatches + deduplicationResult.potentialMatches
    const cleanupOpportunity = Math.round(
      (totalDuplicates / deduplicationResult.totalRecords) * 100
    )
    console.log(`  Database cleanup opportunity: ${cleanupOpportunity}%`)
  } catch (error) {
    console.log('Note: This example requires a configured TypeORM repository')
    console.log(
      `Error: ${error instanceof Error ? error.message : String(error)}`
    )
  }

  console.log('\n---\n')
  console.log('Scenario 3: Merge duplicate contacts with data preservation\n')

  try {
    await adapter.transaction(async (txAdapter) => {
      const duplicates = await txAdapter.findByBlockingKeys(
        new Map([['email', 'michael.williams@company.com']])
      )

      if (duplicates.length > 1) {
        console.log(`Found ${duplicates.length} duplicate contacts to merge`)

        const sortedByDate = duplicates.sort(
          (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
        )
        const [oldest, ...newer] = sortedByDate

        console.log(
          `Primary (oldest) contact: ${oldest.id} (${oldest.createdAt})`
        )
        console.log(`Merging into it: ${newer.map((r) => r.id).join(', ')}`)

        const mergedContact: Contact = {
          ...oldest,
          phone: oldest.phone || newer[0]?.phone,
          company: oldest.company || newer[0]?.company,
          title: newest(newer, oldest).title || oldest.title,
          address: newest(newer, oldest).address || oldest.address,
          city: newest(newer, oldest).city || oldest.city,
          state: newest(newer, oldest).state || oldest.state,
          zipCode: newest(newer, oldest).zipCode || oldest.zipCode,
          notes: [oldest.notes, ...newer.map((n) => n.notes)]
            .filter(Boolean)
            .join(' | '),
          updatedAt: new Date(),
        }

        await txAdapter.update(oldest.id, mergedContact)

        for (const duplicate of newer) {
          await txAdapter.delete(duplicate.id)
        }

        console.log('Contacts merged successfully!')
        console.log('Preserved data from all duplicate records')
      } else {
        console.log('No duplicate contacts found to merge')
      }
    })
  } catch (error) {
    console.log('Note: This example requires a configured TypeORM repository')
    console.log(
      `Error: ${error instanceof Error ? error.message : String(error)}`
    )
  }

  console.log('\n---\n')
  console.log('Scenario 4: TypeORM Entity Configuration\n')

  console.log('Example TypeORM entity definition:')
  console.log(`
import { Entity, Column, PrimaryColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm'

@Entity('contacts')
export class ContactEntity {
  @PrimaryColumn('varchar', { length: 255 })
  id!: string

  @Column('varchar', { length: 255 })
  firstName!: string

  @Column('varchar', { length: 255 })
  lastName!: string

  @Column('varchar', { length: 255 })
  email!: string

  @Column('varchar', { length: 20, nullable: true })
  phone?: string

  @Column('varchar', { length: 255, nullable: true })
  company?: string

  @Column('varchar', { length: 255, nullable: true })
  title?: string

  @Column('varchar', { length: 500, nullable: true })
  address?: string

  @Column('varchar', { length: 100, nullable: true })
  city?: string

  @Column('varchar', { length: 2, nullable: true })
  state?: string

  @Column('varchar', { length: 10, nullable: true })
  zipCode?: string

  @Column('varchar', { length: 100, nullable: true })
  country?: string

  @Column('text', { nullable: true })
  notes?: string

  @Column('varchar', { length: 100, nullable: true })
  source?: string

  @CreateDateColumn()
  createdAt!: Date

  @UpdateDateColumn()
  updatedAt!: Date
}

// Repository setup
import { DataSource } from 'typeorm'

const dataSource = new DataSource({
  type: 'postgres',
  host: 'localhost',
  port: 5432,
  username: 'user',
  password: 'password',
  database: 'crm',
  entities: [ContactEntity],
  synchronize: false,
})

await dataSource.initialize()
const repository = dataSource.getRepository(ContactEntity)

const adapter = new TypeORMAdapter(repository, {
  tableName: 'contacts',
  primaryKey: 'id'
})
`)

  console.log('\n---\n')
  console.log('Scenario 5: Recommended database indexes\n')

  console.log(
    'For optimal performance, create these indexes on your contacts table:'
  )
  console.log('')
  console.log('-- Index for lastName blocking')
  console.log('CREATE INDEX idx_contacts_lastname ON contacts(last_name);')
  console.log('')
  console.log('-- Index for email blocking')
  console.log('CREATE INDEX idx_contacts_email ON contacts(email);')
  console.log('')
  console.log('-- Index for phone blocking')
  console.log('CREATE INDEX idx_contacts_phone ON contacts(phone);')
  console.log('')
  console.log('-- Index for company blocking')
  console.log('CREATE INDEX idx_contacts_company ON contacts(company);')
  console.log('')
  console.log('-- Index for Soundex blocking (requires pre-computed column)')
  console.log('ALTER TABLE contacts ADD COLUMN soundex_lastname VARCHAR(4);')
  console.log(
    'CREATE INDEX idx_contacts_soundex_lastname ON contacts(soundex_lastname);'
  )
  console.log('')
  console.log('-- Composite index for combined blocking')
  console.log(
    'CREATE INDEX idx_contacts_lastname_company ON contacts(last_name, company);'
  )

  console.log('\n=== Example Complete ===')
}

function newest<T>(newer: T[], oldest: T): T {
  return newer.length > 0 ? newer[newer.length - 1] : oldest
}

if (import.meta.url === `file://${process.argv[1]}`) {
  contactMergingExample().catch(console.error)
}

export { contactMergingExample }
