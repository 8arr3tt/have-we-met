import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  PrismaMultiTableAdapter,
  createPrismaMultiTableAdapter,
  prismaMultiTableAdapterFromSources,
  type PrismaClient,
  type MatchGroup,
} from '../../../src/consolidation/adapters/prisma-multi-table-adapter'
import type { DatabaseAdapter } from '../../../src/adapters/types'
import { ConsolidationError } from '../../../src/consolidation/types'
import type { MappedRecord } from '../../../src/consolidation/types'

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

type CustomerOutput = {
  id?: string
  firstName: string
  lastName: string
  email: string
}

type CustomerInput = {
  cust_id: string
  first_name: string
  last_name: string
  email_address: string
}

describe('PrismaMultiTableAdapter', () => {
  let mockPrisma: PrismaClient
  let crmAdapter: DatabaseAdapter<CustomerInput>
  let billingAdapter: DatabaseAdapter<CustomerInput>
  let outputAdapter: DatabaseAdapter<CustomerOutput>

  beforeEach(() => {
    crmAdapter = createMockAdapter<CustomerInput>()
    billingAdapter = createMockAdapter<CustomerInput>()
    outputAdapter = createMockAdapter<CustomerOutput>()

    mockPrisma = {
      $transaction: vi.fn(async (callback) => {
        return callback(mockPrisma)
      }),
      sourceMapping: {
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
        findMany: vi.fn(async () => []),
        findFirst: vi.fn(async () => null),
      },
    } as unknown as PrismaClient
  })

  describe('constructor', () => {
    it('should create Prisma multi-table adapter', () => {
      const adapter = new PrismaMultiTableAdapter({
        prisma: mockPrisma,
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

      expect(adapter).toBeDefined()
      expect(adapter.getSourceIds()).toEqual(['crm'])
    })

    it('should support source mapping configuration', () => {
      const adapter = new PrismaMultiTableAdapter({
        prisma: mockPrisma,
        sources: [
          {
            sourceId: 'crm',
            name: 'CRM Database',
            adapter: crmAdapter,
            mapping: {},
          },
        ],
        outputAdapter,
        sourceMappingConfig: {
          tableName: 'source_mappings',
          modelName: 'sourceMapping',
        },
      })

      expect(adapter).toBeDefined()
    })
  })

  describe('writeGoldenRecordsWithMappings', () => {
    it('should write golden records and source mappings in transaction', async () => {
      const goldenRecords: CustomerOutput[] = [
        { firstName: 'John', lastName: 'Doe', email: 'john@example.com' },
      ]

      const matchGroups: MatchGroup<CustomerOutput>[] = [
        {
          matches: [
            {
              record: goldenRecords[0],
              sourceId: 'crm',
              sourceRecordId: 'crm-1',
              originalRecord: {
                cust_id: 'crm-1',
                first_name: 'John',
                last_name: 'Doe',
                email_address: 'john@example.com',
              },
            },
            {
              record: goldenRecords[0],
              sourceId: 'billing',
              sourceRecordId: 'billing-1',
              originalRecord: {
                cust_id: 'billing-1',
                first_name: 'John',
                last_name: 'Doe',
                email_address: 'john@example.com',
              },
            },
          ],
          score: 95,
        },
      ]

      vi.mocked(outputAdapter.batchInsert).mockResolvedValue([
        { ...goldenRecords[0], id: 'golden-1' },
      ])

      const adapter = new PrismaMultiTableAdapter({
        prisma: mockPrisma,
        sources: [
          {
            sourceId: 'crm',
            name: 'CRM Database',
            adapter: crmAdapter,
            mapping: {},
          },
        ],
        outputAdapter,
        sourceMappingConfig: {
          tableName: 'source_mappings',
          modelName: 'sourceMapping',
        },
      })

      const result = await adapter.writeGoldenRecordsWithMappings(
        goldenRecords,
        matchGroups
      )

      expect(result.recordsWritten).toBe(1)
      expect(result.mappingsWritten).toBe(2)
      expect(result.goldenRecordIds).toEqual(['golden-1'])
      expect(mockPrisma.$transaction).toHaveBeenCalled()
    })

    it('should skip source mappings if writeMappings is false', async () => {
      const goldenRecords: CustomerOutput[] = [
        { firstName: 'John', lastName: 'Doe', email: 'john@example.com' },
      ]

      const matchGroups: MatchGroup<CustomerOutput>[] = []

      vi.mocked(outputAdapter.batchInsert).mockResolvedValue([
        { ...goldenRecords[0], id: 'golden-1' },
      ])

      const adapter = new PrismaMultiTableAdapter({
        prisma: mockPrisma,
        sources: [
          {
            sourceId: 'crm',
            name: 'CRM Database',
            adapter: crmAdapter,
            mapping: {},
          },
        ],
        outputAdapter,
        sourceMappingConfig: {
          tableName: 'source_mappings',
          modelName: 'sourceMapping',
        },
      })

      const result = await adapter.writeGoldenRecordsWithMappings(
        goldenRecords,
        matchGroups,
        { writeMappings: false }
      )

      expect(result.recordsWritten).toBe(1)
      expect(result.mappingsWritten).toBe(0)
    })

    it('should throw error if no output adapter configured', async () => {
      const adapter = new PrismaMultiTableAdapter({
        prisma: mockPrisma,
        sources: [
          {
            sourceId: 'crm',
            name: 'CRM Database',
            adapter: crmAdapter,
            mapping: {},
          },
        ],
      })

      await expect(
        adapter.writeGoldenRecordsWithMappings([], [])
      ).rejects.toThrow(ConsolidationError)
      await expect(
        adapter.writeGoldenRecordsWithMappings([], [])
      ).rejects.toThrow('No output adapter configured')
    })

    it('should include confidence score in source mappings', async () => {
      const goldenRecords: CustomerOutput[] = [
        { firstName: 'John', lastName: 'Doe', email: 'john@example.com' },
      ]

      const matchGroups: MatchGroup<CustomerOutput>[] = [
        {
          matches: [
            {
              record: goldenRecords[0],
              sourceId: 'crm',
              sourceRecordId: 'crm-1',
              originalRecord: {},
            },
          ],
          score: 87.5,
        },
      ]

      vi.mocked(outputAdapter.batchInsert).mockResolvedValue([
        { ...goldenRecords[0], id: 'golden-1' },
      ])

      const createManySpy = vi.fn(async ({ data }) => ({ count: data.length }))
      mockPrisma = {
        $transaction: vi.fn(async (callback) => {
          const txPrisma = {
            ...mockPrisma,
            sourceMapping: {
              createMany: createManySpy,
            },
          }
          return callback(txPrisma as unknown as PrismaClient)
        }),
      } as unknown as PrismaClient

      const adapter = new PrismaMultiTableAdapter({
        prisma: mockPrisma,
        sources: [
          {
            sourceId: 'crm',
            name: 'CRM Database',
            adapter: crmAdapter,
            mapping: {},
          },
        ],
        outputAdapter,
        sourceMappingConfig: {
          tableName: 'source_mappings',
          modelName: 'sourceMapping',
        },
      })

      await adapter.writeGoldenRecordsWithMappings(goldenRecords, matchGroups)

      expect(createManySpy).toHaveBeenCalled()
      const mappings = createManySpy.mock.calls[0][0].data
      expect(mappings[0].confidence).toBe(87.5)
    })

    it('should include createdBy in source mappings when provided', async () => {
      const goldenRecords: CustomerOutput[] = [
        { firstName: 'John', lastName: 'Doe', email: 'john@example.com' },
      ]

      const matchGroups: MatchGroup<CustomerOutput>[] = [
        {
          matches: [
            {
              record: goldenRecords[0],
              sourceId: 'crm',
              sourceRecordId: 'crm-1',
              originalRecord: {},
            },
          ],
          score: 95,
        },
      ]

      vi.mocked(outputAdapter.batchInsert).mockResolvedValue([
        { ...goldenRecords[0], id: 'golden-1' },
      ])

      const createManySpy = vi.fn(async ({ data }) => ({ count: data.length }))
      mockPrisma = {
        $transaction: vi.fn(async (callback) => {
          const txPrisma = {
            ...mockPrisma,
            sourceMapping: {
              createMany: createManySpy,
            },
          }
          return callback(txPrisma as unknown as PrismaClient)
        }),
      } as unknown as PrismaClient

      const adapter = new PrismaMultiTableAdapter({
        prisma: mockPrisma,
        sources: [
          {
            sourceId: 'crm',
            name: 'CRM Database',
            adapter: crmAdapter,
            mapping: {},
          },
        ],
        outputAdapter,
        sourceMappingConfig: {
          tableName: 'source_mappings',
          modelName: 'sourceMapping',
        },
      })

      await adapter.writeGoldenRecordsWithMappings(goldenRecords, matchGroups, {
        createdBy: 'test-user',
      })

      const mappings = createManySpy.mock.calls[0][0].data
      expect(mappings[0].createdBy).toBe('test-user')
    })
  })

  describe('loadFromAllSourcesInTransaction', () => {
    it('should load from all sources in Prisma transaction', async () => {
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

      const adapter = new PrismaMultiTableAdapter({
        prisma: mockPrisma,
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

      const results = await adapter.loadFromAllSourcesInTransaction()

      expect(results.size).toBe(2)
      expect(results.get('crm')).toEqual(crmRecords)
      expect(results.get('billing')).toEqual(billingRecords)
      expect(mockPrisma.$transaction).toHaveBeenCalled()
    })

    it('should pass options to load methods', async () => {
      vi.mocked(crmAdapter.findAll).mockResolvedValue([])

      const adapter = new PrismaMultiTableAdapter({
        prisma: mockPrisma,
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

      await adapter.loadFromAllSourcesInTransaction({ limit: 100 })

      expect(crmAdapter.findAll).toHaveBeenCalledWith({ limit: 100 })
    })
  })

  describe('countAllSourcesInTransaction', () => {
    it('should count all sources in Prisma transaction', async () => {
      vi.mocked(crmAdapter.count).mockResolvedValue(100)
      vi.mocked(billingAdapter.count).mockResolvedValue(200)

      const adapter = new PrismaMultiTableAdapter({
        prisma: mockPrisma,
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

      const counts = await adapter.countAllSourcesInTransaction()

      expect(counts.size).toBe(2)
      expect(counts.get('crm')).toBe(100)
      expect(counts.get('billing')).toBe(200)
      expect(mockPrisma.$transaction).toHaveBeenCalled()
    })
  })

  describe('getSourceMappingsForGoldenRecord', () => {
    it('should get source mappings for golden record', async () => {
      const mockMappings = [
        {
          goldenRecordId: 'golden-1',
          sourceId: 'crm',
          sourceRecordId: 'crm-1',
          createdAt: new Date(),
        },
      ]

      const findManySpy = vi.fn(async () => mockMappings)
      mockPrisma = {
        ...mockPrisma,
        sourceMapping: {
          findMany: findManySpy,
        },
      } as unknown as PrismaClient

      const adapter = new PrismaMultiTableAdapter({
        prisma: mockPrisma,
        sources: [
          {
            sourceId: 'crm',
            name: 'CRM Database',
            adapter: crmAdapter,
            mapping: {},
          },
        ],
        outputAdapter,
        sourceMappingConfig: {
          tableName: 'source_mappings',
          modelName: 'sourceMapping',
        },
      })

      const mappings =
        await adapter.getSourceMappingsForGoldenRecord('golden-1')

      expect(mappings).toEqual(mockMappings)
      expect(findManySpy).toHaveBeenCalledWith({
        where: { goldenRecordId: 'golden-1' },
      })
    })

    it('should throw error if no model name configured', async () => {
      const adapter = new PrismaMultiTableAdapter({
        prisma: mockPrisma,
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
        adapter.getSourceMappingsForGoldenRecord('golden-1')
      ).rejects.toThrow(ConsolidationError)
      await expect(
        adapter.getSourceMappingsForGoldenRecord('golden-1')
      ).rejects.toThrow('No source mapping model name configured')
    })

    it('should throw error if Prisma model not found', async () => {
      // Create a Prisma client without sourceMapping model
      const prismaWithoutModel = {
        $transaction: vi.fn(async (callback) => {
          return callback(prismaWithoutModel as unknown as PrismaClient)
        }),
        // No sourceMapping model
      } as unknown as PrismaClient

      const adapter = new PrismaMultiTableAdapter({
        prisma: prismaWithoutModel,
        sources: [
          {
            sourceId: 'crm',
            name: 'CRM Database',
            adapter: crmAdapter,
            mapping: {},
          },
        ],
        outputAdapter,
        sourceMappingConfig: {
          tableName: 'source_mappings',
          modelName: 'sourceMapping',
        },
      })

      await expect(
        adapter.getSourceMappingsForGoldenRecord('golden-1')
      ).rejects.toThrow(ConsolidationError)
      await expect(
        adapter.getSourceMappingsForGoldenRecord('golden-1')
      ).rejects.toThrow("Prisma model 'sourceMapping' not found")
    })
  })

  describe('getGoldenRecordIdForSourceRecord', () => {
    it('should get golden record ID for source record', async () => {
      const findFirstSpy = vi.fn(async () => ({ goldenRecordId: 'golden-1' }))
      mockPrisma = {
        ...mockPrisma,
        sourceMapping: {
          findFirst: findFirstSpy,
        },
      } as unknown as PrismaClient

      const adapter = new PrismaMultiTableAdapter({
        prisma: mockPrisma,
        sources: [
          {
            sourceId: 'crm',
            name: 'CRM Database',
            adapter: crmAdapter,
            mapping: {},
          },
        ],
        outputAdapter,
        sourceMappingConfig: {
          tableName: 'source_mappings',
          modelName: 'sourceMapping',
        },
      })

      const goldenId = await adapter.getGoldenRecordIdForSourceRecord(
        'crm',
        'crm-1'
      )

      expect(goldenId).toBe('golden-1')
      expect(findFirstSpy).toHaveBeenCalledWith({
        where: { sourceId: 'crm', sourceRecordId: 'crm-1' },
        select: { goldenRecordId: true },
      })
    })

    it('should return null if mapping not found', async () => {
      const findFirstSpy = vi.fn(async () => null)
      mockPrisma = {
        ...mockPrisma,
        sourceMapping: {
          findFirst: findFirstSpy,
        },
      } as unknown as PrismaClient

      const adapter = new PrismaMultiTableAdapter({
        prisma: mockPrisma,
        sources: [
          {
            sourceId: 'crm',
            name: 'CRM Database',
            adapter: crmAdapter,
            mapping: {},
          },
        ],
        outputAdapter,
        sourceMappingConfig: {
          tableName: 'source_mappings',
          modelName: 'sourceMapping',
        },
      })

      const goldenId = await adapter.getGoldenRecordIdForSourceRecord(
        'crm',
        'crm-1'
      )

      expect(goldenId).toBeNull()
    })
  })

  describe('factory functions', () => {
    it('should create adapter using createPrismaMultiTableAdapter', () => {
      const adapter = createPrismaMultiTableAdapter({
        prisma: mockPrisma,
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

      expect(adapter).toBeInstanceOf(PrismaMultiTableAdapter)
    })

    it('should create adapter from consolidation sources', () => {
      const sources = [
        {
          sourceId: 'crm',
          name: 'CRM Database',
          adapter: crmAdapter,
          mapping: {},
        },
      ]

      const adapter = prismaMultiTableAdapterFromSources(
        mockPrisma,
        sources,
        outputAdapter
      )

      expect(adapter).toBeInstanceOf(PrismaMultiTableAdapter)
      expect(adapter.getSourceIds()).toEqual(['crm'])
    })
  })
})
