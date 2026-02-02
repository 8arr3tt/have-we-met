import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  MultiTableAdapter,
  createMultiTableAdapter,
  type SourceTableConfig,
} from '../../../src/consolidation/adapters/multi-table-adapter'
import type { DatabaseAdapter } from '../../../src/adapters/types'
import { ConsolidationError } from '../../../src/consolidation/types'

// Mock adapters
function createMockAdapter<
  T extends Record<string, unknown>,
>(): DatabaseAdapter<T> {
  return {
    findAll: vi.fn(async () => []),
    findByIds: vi.fn(async () => []),
    findByBlockingKeys: vi.fn(async () => []),
    count: vi.fn(async () => 0),
    insert: vi.fn(async (record) => ({ ...record, id: 'mock-id' }) as T),
    update: vi.fn(async (id, updates) => ({ id, ...updates }) as T),
    delete: vi.fn(async () => {}),
    transaction: vi.fn(async (callback) => callback({} as DatabaseAdapter<T>)),
    batchInsert: vi.fn(async (records) =>
      records.map((r, i) => ({ ...r, id: `mock-id-${i}` }) as T)
    ),
    batchUpdate: vi.fn(async (updates) =>
      updates.map((u) => ({ id: u.id, ...u.updates }) as T)
    ),
  }
}

type CustomerInput = {
  cust_id: string
  first_name: string
  last_name: string
  email_address: string
}

type CustomerOutput = {
  id?: string
  firstName: string
  lastName: string
  email: string
}

describe('MultiTableAdapter', () => {
  let crmAdapter: DatabaseAdapter<CustomerInput>
  let billingAdapter: DatabaseAdapter<CustomerInput>
  let outputAdapter: DatabaseAdapter<CustomerOutput>

  beforeEach(() => {
    crmAdapter = createMockAdapter<CustomerInput>()
    billingAdapter = createMockAdapter<CustomerInput>()
    outputAdapter = createMockAdapter<CustomerOutput>()
  })

  describe('constructor', () => {
    it('should create multi-table adapter with valid config', () => {
      const adapter = new MultiTableAdapter({
        sources: [
          {
            sourceId: 'crm',
            name: 'CRM Database',
            adapter: crmAdapter,
            mapping: {
              firstName: { sourceField: 'first_name' },
              lastName: { sourceField: 'last_name' },
              email: { sourceField: 'email_address' },
            },
          },
        ],
        outputAdapter,
      })

      expect(adapter).toBeDefined()
      expect(adapter.getSourceIds()).toEqual(['crm'])
    })

    it('should throw error if no sources provided', () => {
      expect(
        () =>
          new MultiTableAdapter({
            sources: [],
            outputAdapter,
          })
      ).toThrow(ConsolidationError)
      expect(
        () =>
          new MultiTableAdapter({
            sources: [],
            outputAdapter,
          })
      ).toThrow('At least one source table configuration is required')
    })

    it('should throw error if duplicate source IDs provided', () => {
      expect(
        () =>
          new MultiTableAdapter({
            sources: [
              {
                sourceId: 'crm',
                name: 'CRM 1',
                adapter: crmAdapter,
                mapping: {},
              },
              {
                sourceId: 'crm',
                name: 'CRM 2',
                adapter: billingAdapter,
                mapping: {},
              },
            ],
            outputAdapter,
          })
      ).toThrow(ConsolidationError)
      expect(
        () =>
          new MultiTableAdapter({
            sources: [
              {
                sourceId: 'crm',
                name: 'CRM 1',
                adapter: crmAdapter,
                mapping: {},
              },
              {
                sourceId: 'crm',
                name: 'CRM 2',
                adapter: billingAdapter,
                mapping: {},
              },
            ],
            outputAdapter,
          })
      ).toThrow('Duplicate source IDs found')
    })
  })

  describe('getSourceIds', () => {
    it('should return all source IDs', () => {
      const adapter = new MultiTableAdapter({
        sources: [
          {
            sourceId: 'crm',
            name: 'CRM Database',
            adapter: crmAdapter,
            mapping: {},
          },
          {
            sourceId: 'billing',
            name: 'Billing System',
            adapter: billingAdapter,
            mapping: {},
          },
        ],
        outputAdapter,
      })

      expect(adapter.getSourceIds()).toEqual(['crm', 'billing'])
    })

    it('should return empty array if no sources', () => {
      // This won't happen due to constructor validation, but test the method
      const adapter = new MultiTableAdapter({
        sources: [
          {
            sourceId: 'crm',
            name: 'CRM',
            adapter: crmAdapter,
            mapping: {},
          },
        ],
        outputAdapter,
      })

      expect(adapter.getSourceIds()).toHaveLength(1)
    })
  })

  describe('getSource', () => {
    it('should return source config by ID', () => {
      const adapter = new MultiTableAdapter({
        sources: [
          {
            sourceId: 'crm',
            name: 'CRM Database',
            adapter: crmAdapter,
            mapping: {},
            priority: 1,
          },
        ],
        outputAdapter,
      })

      const source = adapter.getSource('crm')
      expect(source).toBeDefined()
      expect(source?.sourceId).toBe('crm')
      expect(source?.name).toBe('CRM Database')
      expect(source?.priority).toBe(1)
    })

    it('should return undefined for unknown source ID', () => {
      const adapter = new MultiTableAdapter({
        sources: [
          {
            sourceId: 'crm',
            name: 'CRM Database',
            adapter: crmAdapter,
            mapping: {},
          },
        ],
        outputAdapter,
      })

      expect(adapter.getSource('unknown')).toBeUndefined()
    })
  })

  describe('loadFromSource', () => {
    it('should load records from specific source', async () => {
      const mockRecords = [
        {
          cust_id: '1',
          first_name: 'John',
          last_name: 'Doe',
          email_address: 'john@example.com',
        },
      ]
      vi.mocked(crmAdapter.findAll).mockResolvedValue(mockRecords)

      const adapter = new MultiTableAdapter({
        sources: [
          {
            sourceId: 'crm',
            name: 'CRM Database',
            adapter: crmAdapter,
            mapping: {},
          },
        ],
        outputAdapter,
      })

      const records = await adapter.loadFromSource('crm')
      expect(records).toEqual(mockRecords)
      expect(crmAdapter.findAll).toHaveBeenCalledWith(undefined)
    })

    it('should pass query options to adapter', async () => {
      vi.mocked(crmAdapter.findAll).mockResolvedValue([])

      const adapter = new MultiTableAdapter({
        sources: [
          {
            sourceId: 'crm',
            name: 'CRM Database',
            adapter: crmAdapter,
            mapping: {},
          },
        ],
        outputAdapter,
      })

      await adapter.loadFromSource('crm', { limit: 100, offset: 50 })
      expect(crmAdapter.findAll).toHaveBeenCalledWith({
        limit: 100,
        offset: 50,
      })
    })

    it('should throw error for unknown source ID', async () => {
      const adapter = new MultiTableAdapter({
        sources: [
          {
            sourceId: 'crm',
            name: 'CRM Database',
            adapter: crmAdapter,
            mapping: {},
          },
        ],
        outputAdapter,
      })

      await expect(adapter.loadFromSource('unknown')).rejects.toThrow(
        ConsolidationError
      )
      await expect(adapter.loadFromSource('unknown')).rejects.toThrow(
        "Source 'unknown' not found"
      )
    })

    it('should wrap adapter errors', async () => {
      vi.mocked(crmAdapter.findAll).mockRejectedValue(
        new Error('Database error')
      )

      const adapter = new MultiTableAdapter({
        sources: [
          {
            sourceId: 'crm',
            name: 'CRM Database',
            adapter: crmAdapter,
            mapping: {},
          },
        ],
        outputAdapter,
      })

      await expect(adapter.loadFromSource('crm')).rejects.toThrow(
        ConsolidationError
      )
      await expect(adapter.loadFromSource('crm')).rejects.toThrow(
        "Failed to load records from source 'crm'"
      )
    })
  })

  describe('loadFromAllSources', () => {
    it('should load records from all sources', async () => {
      const crmRecords = [
        {
          cust_id: '1',
          first_name: 'John',
          last_name: 'Doe',
          email_address: 'john@crm.com',
        },
      ]
      const billingRecords = [
        {
          cust_id: '2',
          first_name: 'Jane',
          last_name: 'Smith',
          email_address: 'jane@billing.com',
        },
      ]

      vi.mocked(crmAdapter.findAll).mockResolvedValue(crmRecords)
      vi.mocked(billingAdapter.findAll).mockResolvedValue(billingRecords)

      const adapter = new MultiTableAdapter({
        sources: [
          {
            sourceId: 'crm',
            name: 'CRM Database',
            adapter: crmAdapter,
            mapping: {},
          },
          {
            sourceId: 'billing',
            name: 'Billing System',
            adapter: billingAdapter,
            mapping: {},
          },
        ],
        outputAdapter,
      })

      const results = await adapter.loadFromAllSources()
      expect(results.size).toBe(2)
      expect(results.get('crm')).toEqual(crmRecords)
      expect(results.get('billing')).toEqual(billingRecords)
    })

    it('should load only from specified source IDs', async () => {
      const crmRecords = [
        {
          cust_id: '1',
          first_name: 'John',
          last_name: 'Doe',
          email_address: 'john@crm.com',
        },
      ]

      vi.mocked(crmAdapter.findAll).mockResolvedValue(crmRecords)
      vi.mocked(billingAdapter.findAll).mockResolvedValue([])

      const adapter = new MultiTableAdapter({
        sources: [
          {
            sourceId: 'crm',
            name: 'CRM Database',
            adapter: crmAdapter,
            mapping: {},
          },
          {
            sourceId: 'billing',
            name: 'Billing System',
            adapter: billingAdapter,
            mapping: {},
          },
        ],
        outputAdapter,
      })

      const results = await adapter.loadFromAllSources({
        sourceIds: ['crm'],
      })
      expect(results.size).toBe(1)
      expect(results.get('crm')).toEqual(crmRecords)
      expect(billingAdapter.findAll).not.toHaveBeenCalled()
    })

    it('should pass query options to all sources', async () => {
      vi.mocked(crmAdapter.findAll).mockResolvedValue([])
      vi.mocked(billingAdapter.findAll).mockResolvedValue([])

      const adapter = new MultiTableAdapter({
        sources: [
          {
            sourceId: 'crm',
            name: 'CRM Database',
            adapter: crmAdapter,
            mapping: {},
          },
          {
            sourceId: 'billing',
            name: 'Billing System',
            adapter: billingAdapter,
            mapping: {},
          },
        ],
        outputAdapter,
      })

      await adapter.loadFromAllSources({ limit: 50 })
      expect(crmAdapter.findAll).toHaveBeenCalledWith({ limit: 50 })
      expect(billingAdapter.findAll).toHaveBeenCalledWith({ limit: 50 })
    })
  })

  describe('countInSource', () => {
    it('should count records in specific source', async () => {
      vi.mocked(crmAdapter.count).mockResolvedValue(42)

      const adapter = new MultiTableAdapter({
        sources: [
          {
            sourceId: 'crm',
            name: 'CRM Database',
            adapter: crmAdapter,
            mapping: {},
          },
        ],
        outputAdapter,
      })

      const count = await adapter.countInSource('crm')
      expect(count).toBe(42)
      expect(crmAdapter.count).toHaveBeenCalled()
    })

    it('should throw error for unknown source ID', async () => {
      const adapter = new MultiTableAdapter({
        sources: [
          {
            sourceId: 'crm',
            name: 'CRM Database',
            adapter: crmAdapter,
            mapping: {},
          },
        ],
        outputAdapter,
      })

      await expect(adapter.countInSource('unknown')).rejects.toThrow(
        ConsolidationError
      )
    })

    it('should wrap adapter errors', async () => {
      vi.mocked(crmAdapter.count).mockRejectedValue(new Error('Database error'))

      const adapter = new MultiTableAdapter({
        sources: [
          {
            sourceId: 'crm',
            name: 'CRM Database',
            adapter: crmAdapter,
            mapping: {},
          },
        ],
        outputAdapter,
      })

      await expect(adapter.countInSource('crm')).rejects.toThrow(
        ConsolidationError
      )
    })
  })

  describe('countAllSources', () => {
    it('should count records in all sources', async () => {
      vi.mocked(crmAdapter.count).mockResolvedValue(100)
      vi.mocked(billingAdapter.count).mockResolvedValue(200)

      const adapter = new MultiTableAdapter({
        sources: [
          {
            sourceId: 'crm',
            name: 'CRM Database',
            adapter: crmAdapter,
            mapping: {},
          },
          {
            sourceId: 'billing',
            name: 'Billing System',
            adapter: billingAdapter,
            mapping: {},
          },
        ],
        outputAdapter,
      })

      const counts = await adapter.countAllSources()
      expect(counts.size).toBe(2)
      expect(counts.get('crm')).toBe(100)
      expect(counts.get('billing')).toBe(200)
    })
  })

  describe('writeGoldenRecords', () => {
    it('should write golden records to output adapter', async () => {
      const goldenRecords: CustomerOutput[] = [
        { firstName: 'John', lastName: 'Doe', email: 'john@example.com' },
        { firstName: 'Jane', lastName: 'Smith', email: 'jane@example.com' },
      ]

      vi.mocked(outputAdapter.transaction).mockImplementation(
        async (callback) => {
          const mockAdapter = {
            ...outputAdapter,
            batchInsert: vi
              .fn()
              .mockResolvedValue(
                goldenRecords.map((r, i) => ({ ...r, id: `golden-${i}` }))
              ),
          }
          return callback(mockAdapter)
        }
      )

      const adapter = new MultiTableAdapter({
        sources: [
          {
            sourceId: 'crm',
            name: 'CRM Database',
            adapter: crmAdapter,
            mapping: {},
          },
        ],
        outputAdapter,
      })

      const result = await adapter.writeGoldenRecords(goldenRecords)
      expect(result.recordsWritten).toBe(2)
      expect(result.goldenRecordIds).toEqual(['golden-0', 'golden-1'])
    })

    it('should throw error if no output adapter configured', async () => {
      const adapter = new MultiTableAdapter({
        sources: [
          {
            sourceId: 'crm',
            name: 'CRM Database',
            adapter: crmAdapter,
            mapping: {},
          },
        ],
      })

      await expect(adapter.writeGoldenRecords([])).rejects.toThrow(
        ConsolidationError
      )
      await expect(adapter.writeGoldenRecords([])).rejects.toThrow(
        'No output adapter configured'
      )
    })

    it('should use transaction by default', async () => {
      const goldenRecords: CustomerOutput[] = [
        { firstName: 'John', lastName: 'Doe', email: 'john@example.com' },
      ]

      vi.mocked(outputAdapter.transaction).mockImplementation(
        async (callback) => {
          const mockAdapter = {
            ...outputAdapter,
            batchInsert: vi
              .fn()
              .mockResolvedValue([{ ...goldenRecords[0], id: 'golden-1' }]),
          }
          return callback(mockAdapter)
        }
      )

      const adapter = new MultiTableAdapter({
        sources: [
          {
            sourceId: 'crm',
            name: 'CRM Database',
            adapter: crmAdapter,
            mapping: {},
          },
        ],
        outputAdapter,
      })

      await adapter.writeGoldenRecords(goldenRecords)
      expect(outputAdapter.transaction).toHaveBeenCalled()
    })

    it('should skip transaction if useTransaction is false', async () => {
      const goldenRecords: CustomerOutput[] = [
        { firstName: 'John', lastName: 'Doe', email: 'john@example.com' },
      ]

      vi.mocked(outputAdapter.batchInsert).mockResolvedValue([
        { ...goldenRecords[0], id: 'golden-1' },
      ])

      const adapter = new MultiTableAdapter({
        sources: [
          {
            sourceId: 'crm',
            name: 'CRM Database',
            adapter: crmAdapter,
            mapping: {},
          },
        ],
        outputAdapter,
      })

      await adapter.writeGoldenRecords(goldenRecords, {
        useTransaction: false,
      })
      expect(outputAdapter.transaction).not.toHaveBeenCalled()
      expect(outputAdapter.batchInsert).toHaveBeenCalledWith(goldenRecords)
    })

    it('should throw error if golden record missing ID after insert', async () => {
      const goldenRecords: CustomerOutput[] = [
        { firstName: 'John', lastName: 'Doe', email: 'john@example.com' },
      ]

      // Return record without ID
      vi.mocked(outputAdapter.batchInsert).mockResolvedValue([
        { firstName: 'John', lastName: 'Doe', email: 'john@example.com' },
      ])

      const adapter = new MultiTableAdapter({
        sources: [
          {
            sourceId: 'crm',
            name: 'CRM Database',
            adapter: crmAdapter,
            mapping: {},
          },
        ],
        outputAdapter,
      })

      await expect(
        adapter.writeGoldenRecords(goldenRecords, { useTransaction: false })
      ).rejects.toThrow(ConsolidationError)
      await expect(
        adapter.writeGoldenRecords(goldenRecords, { useTransaction: false })
      ).rejects.toThrow('Golden record missing ID after insert')
    })
  })

  describe('factory functions', () => {
    it('should create adapter using createMultiTableAdapter', () => {
      const adapter = createMultiTableAdapter({
        sources: [
          {
            sourceId: 'crm',
            name: 'CRM Database',
            adapter: crmAdapter,
            mapping: {},
          },
        ],
        outputAdapter,
      })

      expect(adapter).toBeInstanceOf(MultiTableAdapter)
      expect(adapter.getSourceIds()).toEqual(['crm'])
    })
  })

  describe('static helpers', () => {
    it('should convert ConsolidationSource to SourceTableConfig', () => {
      const consolidationSource = {
        sourceId: 'crm',
        name: 'CRM Database',
        adapter: crmAdapter,
        mapping: {
          firstName: { sourceField: 'first_name' },
        },
        priority: 1,
      }

      const config =
        MultiTableAdapter.fromConsolidationSource(consolidationSource)

      expect(config.sourceId).toBe('crm')
      expect(config.name).toBe('CRM Database')
      expect(config.adapter).toBe(crmAdapter)
      expect(config.priority).toBe(1)
    })

    it('should create adapter from consolidation sources', () => {
      const sources = [
        {
          sourceId: 'crm',
          name: 'CRM Database',
          adapter: crmAdapter,
          mapping: {},
        },
        {
          sourceId: 'billing',
          name: 'Billing System',
          adapter: billingAdapter,
          mapping: {},
        },
      ]

      const adapter = MultiTableAdapter.fromConsolidationSources(
        sources,
        outputAdapter
      )

      expect(adapter).toBeInstanceOf(MultiTableAdapter)
      expect(adapter.getSourceIds()).toEqual(['crm', 'billing'])
    })
  })
})
