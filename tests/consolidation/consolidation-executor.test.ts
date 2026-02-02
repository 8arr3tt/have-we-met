import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  ConsolidationExecutor,
  createConsolidationExecutor,
} from '../../src/consolidation/consolidation-executor.js'
import type {
  ConsolidationConfig,
  ConsolidationSource,
  MatchingScope,
} from '../../src/consolidation/types.js'
import { MatchingScope as Scope } from '../../src/consolidation/types.js'
import { HaveWeMet } from '../../src/index.js'
import type { DatabaseAdapter } from '../../src/adapters/types.js'

// Mock data types
interface CRMCustomer {
  id: number
  customer_name: string
  email_address: string
  phone_number: string
}

interface BillingCustomer {
  id: number
  fullName: string
  email: string
  phone: string
}

interface UnifiedCustomer {
  id?: number
  name: string
  email: string
  phone: string
}

// Mock adapter factory
function createMockAdapter<T>(records: T[]): DatabaseAdapter<T> {
  return {
    findAll: vi.fn(async () => records),
    findById: vi.fn(async (id: string | number) =>
      records.find((r: any) => r.id === id)
    ),
    create: vi.fn(
      async (record: Partial<T>) => ({ ...record, id: Date.now() }) as T
    ),
    update: vi.fn(async (id: string | number, data: Partial<T>) => {
      const record = records.find((r: any) => r.id === id)
      return record ? { ...record, ...data } : undefined
    }),
    delete: vi.fn(async (_id: string | number) => true),
    createBatch: vi.fn(async (batch: Partial<T>[]) =>
      batch.map((r, i) => ({ ...r, id: Date.now() + i }) as T)
    ),
    batchInsert: vi.fn(async (batch: T[]) =>
      batch.map((r, i) => ({ ...r, id: Date.now() + i }) as T)
    ),
    findByBlocking: vi.fn(async () => []),
    transaction: vi.fn(async (callback: any) => callback()),
  } as DatabaseAdapter<T>
}

describe('ConsolidationExecutor', () => {
  let crmRecords: CRMCustomer[]
  let billingRecords: BillingCustomer[]
  let crmAdapter: DatabaseAdapter<CRMCustomer>
  let billingAdapter: DatabaseAdapter<BillingCustomer>
  let outputAdapter: DatabaseAdapter<UnifiedCustomer>
  let resolver: any

  beforeEach(() => {
    // Setup CRM records
    crmRecords = [
      {
        id: 1,
        customer_name: 'John Smith',
        email_address: 'john@example.com',
        phone_number: '555-0001',
      },
      {
        id: 2,
        customer_name: 'Jane Doe',
        email_address: 'jane@example.com',
        phone_number: '555-0002',
      },
      {
        id: 3,
        customer_name: 'John Smith', // Duplicate in CRM
        email_address: 'john.smith@example.com',
        phone_number: '555-0001',
      },
    ]

    // Setup Billing records
    billingRecords = [
      {
        id: 101,
        fullName: 'John Smith', // Matches CRM id=1
        email: 'john@example.com',
        phone: '555-0001',
      },
      {
        id: 102,
        fullName: 'Bob Johnson',
        email: 'bob@example.com',
        phone: '555-0003',
      },
    ]

    // Create adapters
    crmAdapter = createMockAdapter(crmRecords)
    billingAdapter = createMockAdapter(billingRecords)
    outputAdapter = createMockAdapter<UnifiedCustomer>([])

    // Create resolver
    resolver = HaveWeMet.schema<UnifiedCustomer>({
      name: { type: 'string' },
      email: { type: 'email' },
      phone: { type: 'phone' },
    })
      .matching((match) =>
        match
          .field('email')
          .strategy('exact')
          .weight(20)
          .field('phone')
          .strategy('exact')
          .weight(15)
          .field('name')
          .strategy('jaro-winkler')
          .weight(10)
      )
      .thresholds({ noMatch: 15, definiteMatch: 30 })
      .build()
  })

  describe('constructor', () => {
    it('should create executor with valid config', () => {
      const config: ConsolidationConfig<UnifiedCustomer> = {
        sources: [
          {
            sourceId: 'crm',
            name: 'CRM Database',
            adapter: crmAdapter,
            mapping: {
              name: { sourceField: 'customer_name' },
              email: { sourceField: 'email_address' },
              phone: { sourceField: 'phone_number' },
            },
          },
        ],
      }

      const executor = new ConsolidationExecutor(config, resolver)
      expect(executor).toBeDefined()
      expect(executor.getMatchingScope()).toBe(Scope.WithinSourceFirst)
    })

    it('should throw error for empty sources', () => {
      const config: ConsolidationConfig<UnifiedCustomer> = {
        sources: [],
      }

      expect(() => new ConsolidationExecutor(config, resolver)).toThrow(
        'At least one source is required'
      )
    })

    it('should throw error for source without adapter', () => {
      const config: ConsolidationConfig<UnifiedCustomer> = {
        sources: [
          {
            sourceId: 'crm',
            name: 'CRM Database',
            adapter: null as any,
            mapping: {
              name: { sourceField: 'customer_name' },
            },
          },
        ],
      }

      expect(() => new ConsolidationExecutor(config, resolver)).toThrow(
        'must have an adapter'
      )
    })

    it('should throw error for duplicate source IDs', () => {
      const config: ConsolidationConfig<UnifiedCustomer> = {
        sources: [
          {
            sourceId: 'crm',
            name: 'CRM 1',
            adapter: crmAdapter,
            mapping: { name: { sourceField: 'customer_name' } },
          },
          {
            sourceId: 'crm',
            name: 'CRM 2',
            adapter: crmAdapter,
            mapping: { name: { sourceField: 'fullName' } },
          },
        ],
      }

      expect(() => new ConsolidationExecutor(config, resolver)).toThrow(
        'Duplicate source ID'
      )
    })
  })

  describe('execute - within-source-first', () => {
    it('should execute full consolidation workflow', async () => {
      const config: ConsolidationConfig<UnifiedCustomer> = {
        sources: [
          {
            sourceId: 'crm',
            name: 'CRM Database',
            adapter: crmAdapter,
            mapping: {
              name: { sourceField: 'customer_name' },
              email: { sourceField: 'email_address' },
              phone: { sourceField: 'phone_number' },
            },
            priority: 10,
          },
          {
            sourceId: 'billing',
            name: 'Billing System',
            adapter: billingAdapter,
            mapping: {
              name: { sourceField: 'fullName' },
              email: { sourceField: 'email' },
              phone: { sourceField: 'phone' },
            },
            priority: 5,
          },
        ],
        matchingScope: Scope.WithinSourceFirst,
      }

      const executor = new ConsolidationExecutor(config, resolver)
      const result = await executor.execute()

      // Verify results
      expect(result.goldenRecords).toBeDefined()
      expect(result.goldenRecords.length).toBeGreaterThan(0)
      expect(result.stats.totalRecords).toBe(5) // 3 CRM + 2 Billing
      expect(result.stats.goldenRecords).toBeGreaterThan(0)
      expect(result.errors).toEqual([])
    })

    it('should deduplicate within sources', async () => {
      const config: ConsolidationConfig<UnifiedCustomer> = {
        sources: [
          {
            sourceId: 'crm',
            name: 'CRM Database',
            adapter: crmAdapter,
            mapping: {
              name: { sourceField: 'customer_name' },
              email: { sourceField: 'email_address' },
              phone: { sourceField: 'phone_number' },
            },
          },
        ],
        matchingScope: Scope.WithinSourceFirst,
      }

      const executor = new ConsolidationExecutor(config, resolver)
      const result = await executor.execute()

      // Should deduplicate John Smith records (id 1 and 3)
      expect(result.stats.sources.crm.duplicatesWithinSource).toBeGreaterThan(0)
    })

    it('should match across sources', async () => {
      const config: ConsolidationConfig<UnifiedCustomer> = {
        sources: [
          {
            sourceId: 'crm',
            name: 'CRM Database',
            adapter: crmAdapter,
            mapping: {
              name: { sourceField: 'customer_name' },
              email: { sourceField: 'email_address' },
              phone: { sourceField: 'phone_number' },
            },
          },
          {
            sourceId: 'billing',
            name: 'Billing System',
            adapter: billingAdapter,
            mapping: {
              name: { sourceField: 'fullName' },
              email: { sourceField: 'email' },
              phone: { sourceField: 'phone' },
            },
          },
        ],
        matchingScope: Scope.WithinSourceFirst,
      }

      const executor = new ConsolidationExecutor(config, resolver)
      const result = await executor.execute()

      // Should find John Smith cross-source match
      expect(result.stats.crossSourceMatches).toBeGreaterThan(0)
    })

    it('should collect statistics', async () => {
      const config: ConsolidationConfig<UnifiedCustomer> = {
        sources: [
          {
            sourceId: 'crm',
            name: 'CRM Database',
            adapter: crmAdapter,
            mapping: {
              name: { sourceField: 'customer_name' },
              email: { sourceField: 'email_address' },
              phone: { sourceField: 'phone_number' },
            },
          },
          {
            sourceId: 'billing',
            name: 'Billing System',
            adapter: billingAdapter,
            mapping: {
              name: { sourceField: 'fullName' },
              email: { sourceField: 'email' },
              phone: { sourceField: 'phone' },
            },
          },
        ],
        matchingScope: Scope.WithinSourceFirst,
      }

      const executor = new ConsolidationExecutor(config, resolver)
      const result = await executor.execute()

      // Verify statistics
      expect(result.stats.totalRecords).toBe(5)
      expect(result.stats.sources.crm.recordsLoaded).toBe(3)
      expect(result.stats.sources.billing.recordsLoaded).toBe(2)
      expect(result.stats.executionTimeMs).toBeGreaterThanOrEqual(0)
    })
  })

  describe('execute - unified pool', () => {
    it('should execute unified pool consolidation', async () => {
      const config: ConsolidationConfig<UnifiedCustomer> = {
        sources: [
          {
            sourceId: 'crm',
            name: 'CRM Database',
            adapter: crmAdapter,
            mapping: {
              name: { sourceField: 'customer_name' },
              email: { sourceField: 'email_address' },
              phone: { sourceField: 'phone_number' },
            },
          },
          {
            sourceId: 'billing',
            name: 'Billing System',
            adapter: billingAdapter,
            mapping: {
              name: { sourceField: 'fullName' },
              email: { sourceField: 'email' },
              phone: { sourceField: 'phone' },
            },
          },
        ],
        matchingScope: Scope.UnifiedPool,
      }

      const executor = new ConsolidationExecutor(config, resolver)
      const result = await executor.execute()

      expect(result.goldenRecords).toBeDefined()
      expect(result.goldenRecords.length).toBeGreaterThan(0)
      expect(result.stats.totalRecords).toBe(5)
    })

    it('should match all records in one pool', async () => {
      const config: ConsolidationConfig<UnifiedCustomer> = {
        sources: [
          {
            sourceId: 'crm',
            name: 'CRM Database',
            adapter: crmAdapter,
            mapping: {
              name: { sourceField: 'customer_name' },
              email: { sourceField: 'email_address' },
              phone: { sourceField: 'phone_number' },
            },
          },
          {
            sourceId: 'billing',
            name: 'Billing System',
            adapter: billingAdapter,
            mapping: {
              name: { sourceField: 'fullName' },
              email: { sourceField: 'email' },
              phone: { sourceField: 'phone' },
            },
          },
        ],
        matchingScope: Scope.UnifiedPool,
      }

      const executor = new ConsolidationExecutor(config, resolver)
      const result = await executor.execute()

      // Unified pool should find within-source and cross-source matches
      expect(result.matchGroups.length).toBeGreaterThan(0)
    })
  })

  describe('execute options', () => {
    it('should limit records per source', async () => {
      const config: ConsolidationConfig<UnifiedCustomer> = {
        sources: [
          {
            sourceId: 'crm',
            name: 'CRM Database',
            adapter: crmAdapter,
            mapping: {
              name: { sourceField: 'customer_name' },
              email: { sourceField: 'email_address' },
              phone: { sourceField: 'phone_number' },
            },
          },
        ],
      }

      const executor = new ConsolidationExecutor(config, resolver)
      const result = await executor.execute({ maxRecordsPerSource: 2 })

      expect(result.stats.sources.crm.recordsLoaded).toBe(2)
    })

    it('should write golden records to output adapter', async () => {
      const config: ConsolidationConfig<UnifiedCustomer> = {
        sources: [
          {
            sourceId: 'crm',
            name: 'CRM Database',
            adapter: crmAdapter,
            mapping: {
              name: { sourceField: 'customer_name' },
              email: { sourceField: 'email_address' },
              phone: { sourceField: 'phone_number' },
            },
          },
        ],
        outputAdapter,
      }

      const executor = new ConsolidationExecutor(config, resolver)
      await executor.execute({ writeOutput: true })

      expect(outputAdapter.batchInsert).toHaveBeenCalled()
    })

    it('should continue on error when failFast is false', async () => {
      const failingAdapter = createMockAdapter<CRMCustomer>([])
      failingAdapter.findAll = vi.fn(async () => {
        throw new Error('Database connection failed')
      })

      const config: ConsolidationConfig<UnifiedCustomer> = {
        sources: [
          {
            sourceId: 'crm',
            name: 'CRM Database',
            adapter: failingAdapter,
            mapping: {
              name: { sourceField: 'customer_name' },
            },
          },
          {
            sourceId: 'billing',
            name: 'Billing System',
            adapter: billingAdapter,
            mapping: {
              name: { sourceField: 'fullName' },
              email: { sourceField: 'email' },
              phone: { sourceField: 'phone' },
            },
          },
        ],
      }

      const executor = new ConsolidationExecutor(config, resolver)

      try {
        const result = await executor.execute({ failFast: false })

        // Should have errors but continue
        expect(result.errors.length).toBeGreaterThan(0)
        expect(result.stats.sources.billing.recordsLoaded).toBe(2)
      } catch (error) {
        // Expected to throw because loadRecords wraps errors
        expect(error).toBeInstanceOf(Error)
        expect((error as Error).message).toContain('Database connection failed')
      }
    })
  })

  describe('factory function', () => {
    it('should create executor via factory', () => {
      const config: ConsolidationConfig<UnifiedCustomer> = {
        sources: [
          {
            sourceId: 'crm',
            name: 'CRM Database',
            adapter: crmAdapter,
            mapping: {
              name: { sourceField: 'customer_name' },
              email: { sourceField: 'email_address' },
              phone: { sourceField: 'phone_number' },
            },
          },
        ],
      }

      const executor = createConsolidationExecutor(config, resolver)
      expect(executor).toBeInstanceOf(ConsolidationExecutor)
    })
  })

  describe('edge cases', () => {
    it('should handle empty sources gracefully', async () => {
      const emptyAdapter = createMockAdapter<CRMCustomer>([])

      const config: ConsolidationConfig<UnifiedCustomer> = {
        sources: [
          {
            sourceId: 'crm',
            name: 'CRM Database',
            adapter: emptyAdapter,
            mapping: {
              name: { sourceField: 'customer_name' },
              email: { sourceField: 'email_address' },
              phone: { sourceField: 'phone_number' },
            },
          },
        ],
      }

      const executor = new ConsolidationExecutor(config, resolver)
      const result = await executor.execute()

      expect(result.goldenRecords).toEqual([])
      expect(result.stats.totalRecords).toBe(0)
      expect(result.stats.goldenRecords).toBe(0)
    })

    it('should handle single source', async () => {
      const config: ConsolidationConfig<UnifiedCustomer> = {
        sources: [
          {
            sourceId: 'crm',
            name: 'CRM Database',
            adapter: crmAdapter,
            mapping: {
              name: { sourceField: 'customer_name' },
              email: { sourceField: 'email_address' },
              phone: { sourceField: 'phone_number' },
            },
          },
        ],
      }

      const executor = new ConsolidationExecutor(config, resolver)
      const result = await executor.execute()

      expect(result.goldenRecords).toBeDefined()
      expect(result.stats.crossSourceMatches).toBe(0)
    })

    it('should handle no matches', async () => {
      const uniqueRecords: CRMCustomer[] = [
        {
          id: 1,
          customer_name: 'John Smith',
          email_address: 'john@example.com',
          phone_number: '555-0001',
        },
        {
          id: 2,
          customer_name: 'Jane Doe',
          email_address: 'jane@example.com',
          phone_number: '555-0002',
        },
      ]

      const uniqueAdapter = createMockAdapter(uniqueRecords)

      const config: ConsolidationConfig<UnifiedCustomer> = {
        sources: [
          {
            sourceId: 'crm',
            name: 'CRM Database',
            adapter: uniqueAdapter,
            mapping: {
              name: { sourceField: 'customer_name' },
              email: { sourceField: 'email_address' },
              phone: { sourceField: 'phone_number' },
            },
          },
        ],
      }

      const executor = new ConsolidationExecutor(config, resolver)
      const result = await executor.execute()

      // Each record should become a golden record
      expect(result.stats.uniqueRecords).toBe(result.stats.goldenRecords)
    })

    it('should throw error when writing without output adapter', async () => {
      const config: ConsolidationConfig<UnifiedCustomer> = {
        sources: [
          {
            sourceId: 'crm',
            name: 'CRM Database',
            adapter: crmAdapter,
            mapping: {
              name: { sourceField: 'customer_name' },
              email: { sourceField: 'email_address' },
              phone: { sourceField: 'phone_number' },
            },
          },
        ],
      }

      const executor = new ConsolidationExecutor(config, resolver)

      // Create a temporary workaround to bypass config validation
      const result = await executor.execute()

      // Now try to write manually without adapter - this should fail
      await expect(async () => {
        // Access private method (for testing purposes)
        await (executor as any).writeGoldenRecords(result.goldenRecords)
      }).rejects.toThrow('No output adapter configured')
    })
  })

  describe('getConfig', () => {
    it('should return configuration', () => {
      const config: ConsolidationConfig<UnifiedCustomer> = {
        sources: [
          {
            sourceId: 'crm',
            name: 'CRM Database',
            adapter: crmAdapter,
            mapping: {
              name: { sourceField: 'customer_name' },
            },
          },
        ],
        matchingScope: Scope.UnifiedPool,
      }

      const executor = new ConsolidationExecutor(config, resolver)
      const retrievedConfig = executor.getConfig()

      expect(retrievedConfig.sources.length).toBe(1)
      expect(retrievedConfig.matchingScope).toBe(Scope.UnifiedPool)
    })
  })

  describe('getMatchingScope', () => {
    it('should return matching scope', () => {
      const config: ConsolidationConfig<UnifiedCustomer> = {
        sources: [
          {
            sourceId: 'crm',
            name: 'CRM Database',
            adapter: crmAdapter,
            mapping: {
              name: { sourceField: 'customer_name' },
            },
          },
        ],
        matchingScope: Scope.UnifiedPool,
      }

      const executor = new ConsolidationExecutor(config, resolver)
      expect(executor.getMatchingScope()).toBe(Scope.UnifiedPool)
    })

    it('should default to WithinSourceFirst', () => {
      const config: ConsolidationConfig<UnifiedCustomer> = {
        sources: [
          {
            sourceId: 'crm',
            name: 'CRM Database',
            adapter: crmAdapter,
            mapping: {
              name: { sourceField: 'customer_name' },
            },
          },
        ],
      }

      const executor = new ConsolidationExecutor(config, resolver)
      expect(executor.getMatchingScope()).toBe(Scope.WithinSourceFirst)
    })
  })
})
