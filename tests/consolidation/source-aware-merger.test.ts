import { describe, it, expect, beforeEach } from 'vitest'
import {
  SourceAwareMerger,
  createSourceAwareMerger,
  type SourceAwareRecord,
  type SourceAwareMergeConfig,
} from '../../src/consolidation/source-aware-merger'
import type { ConsolidationSource, MappedRecord } from '../../src/consolidation/types'
import type { DatabaseAdapter } from '../../src/adapters/types'

// Test types
interface Customer {
  email: string
  firstName: string
  lastName: string
  phone?: string
  address?: string
  vip?: boolean
}

// Mock adapter
const mockAdapter: DatabaseAdapter<Customer> = {
  findById: async () => null,
  findAll: async () => [],
  findByIds: async () => [],
  create: async (record) => record,
  createMany: async (records) => records,
  update: async (id, record) => record,
  delete: async () => {},
  count: async () => 0,
  query: async () => [],
}

describe('SourceAwareMerger', () => {
  let merger: SourceAwareMerger<Customer>

  beforeEach(() => {
    merger = new SourceAwareMerger<Customer>({
      defaultStrategy: 'preferFirst',
      useSourcePriority: true,
      priorityMode: 'priority-first',
      trackProvenance: true,
    })
  })

  describe('constructor', () => {
    it('should create merger with default config', () => {
      const m = new SourceAwareMerger<Customer>({})
      const config = m.getConfig()

      expect(config.useSourcePriority).toBe(true)
      expect(config.priorityMode).toBe('priority-first')
      expect(config.trackProvenance).toBe(true)
    })

    it('should accept custom config', () => {
      const m = new SourceAwareMerger<Customer>({
        useSourcePriority: false,
        priorityMode: 'priority-only',
        defaultStrategy: 'preferNonNull',
      })
      const config = m.getConfig()

      expect(config.useSourcePriority).toBe(false)
      expect(config.priorityMode).toBe('priority-only')
      expect(config.defaultStrategy).toBe('preferNonNull')
    })
  })

  describe('mergeWithSourcePriority', () => {
    it('should require at least 2 records', async () => {
      const sources: ConsolidationSource<Customer, Customer>[] = [
        {
          sourceId: 'crm',
          name: 'CRM',
          adapter: mockAdapter,
          mapping: {
            email: { sourceField: 'email' },
            firstName: { sourceField: 'firstName' },
            lastName: { sourceField: 'lastName' },
            phone: { sourceField: 'phone' },
            address: { sourceField: 'address' },
            vip: { sourceField: 'vip' },
          },
          priority: 10,
        },
      ]

      const records: MappedRecord<Customer>[] = [
        {
          record: { email: 'test@example.com', firstName: 'John', lastName: 'Doe' },
          sourceId: 'crm',
          sourceRecordId: '1',
          originalRecord: {},
        },
      ]

      await expect(
        merger.mergeWithSourcePriority({ records, sources })
      ).rejects.toThrow('At least 2 records required')
    })

    it('should merge records without conflicts', async () => {
      const sources: ConsolidationSource<Customer, Customer>[] = [
        {
          sourceId: 'crm',
          name: 'CRM',
          adapter: mockAdapter,
          mapping: {
            email: { sourceField: 'email' },
            firstName: { sourceField: 'firstName' },
            lastName: { sourceField: 'lastName' },
            phone: { sourceField: 'phone' },
            address: { sourceField: 'address' },
            vip: { sourceField: 'vip' },
          },
          priority: 10,
        },
        {
          sourceId: 'billing',
          name: 'Billing',
          adapter: mockAdapter,
          mapping: {
            email: { sourceField: 'email' },
            firstName: { sourceField: 'firstName' },
            lastName: { sourceField: 'lastName' },
            phone: { sourceField: 'phone' },
            address: { sourceField: 'address' },
            vip: { sourceField: 'vip' },
          },
          priority: 5,
        },
      ]

      const records: MappedRecord<Customer>[] = [
        {
          record: {
            email: 'john@example.com',
            firstName: 'John',
            lastName: 'Doe',
            phone: '555-1234',
          },
          sourceId: 'crm',
          sourceRecordId: '1',
          originalRecord: {},
        },
        {
          record: {
            email: 'john@example.com',
            firstName: 'John',
            lastName: 'Doe',
            address: '123 Main St',
          },
          sourceId: 'billing',
          sourceRecordId: '2',
          originalRecord: {},
        },
      ]

      const result = await merger.mergeWithSourcePriority({ records, sources })

      expect(result.goldenRecord.email).toBe('john@example.com')
      expect(result.goldenRecord.firstName).toBe('John')
      expect(result.goldenRecord.lastName).toBe('Doe')
      expect(result.goldenRecord.phone).toBe('555-1234')
      expect(result.goldenRecord.address).toBe('123 Main St')
      expect(result.conflicts).toHaveLength(0)
    })

    it('should resolve conflicts using source priority', async () => {
      const sources: ConsolidationSource<Customer, Customer>[] = [
        {
          sourceId: 'crm',
          name: 'CRM',
          adapter: mockAdapter,
          mapping: {
            email: { sourceField: 'email' },
            firstName: { sourceField: 'firstName' },
            lastName: { sourceField: 'lastName' },
            phone: { sourceField: 'phone' },
            address: { sourceField: 'address' },
            vip: { sourceField: 'vip' },
          },
          priority: 10,
        },
        {
          sourceId: 'billing',
          name: 'Billing',
          adapter: mockAdapter,
          mapping: {
            email: { sourceField: 'email' },
            firstName: { sourceField: 'firstName' },
            lastName: { sourceField: 'lastName' },
            phone: { sourceField: 'phone' },
            address: { sourceField: 'address' },
            vip: { sourceField: 'vip' },
          },
          priority: 5,
        },
      ]

      const records: MappedRecord<Customer>[] = [
        {
          record: {
            email: 'john.doe@example.com',
            firstName: 'John',
            lastName: 'Doe',
          },
          sourceId: 'crm',
          sourceRecordId: '1',
          originalRecord: {},
        },
        {
          record: {
            email: 'johndoe@example.com',
            firstName: 'John',
            lastName: 'Doe',
          },
          sourceId: 'billing',
          sourceRecordId: '2',
          originalRecord: {},
        },
      ]

      const result = await merger.mergeWithSourcePriority({ records, sources })

      // CRM has higher priority (10 > 5)
      expect(result.goldenRecord.email).toBe('john.doe@example.com')
      expect(result.conflicts).toHaveLength(1)
      expect(result.conflicts[0].field).toBe('email')
      expect(result.conflicts[0].resolution).toBe('auto')
      expect(result.conflicts[0].resolutionReason).toContain('highest priority')
      expect(result.conflicts[0].resolutionReason).toContain('crm')
    })

    it('should use strategy as tiebreaker with priority-first mode', async () => {
      const merger = new SourceAwareMerger<Customer>({
        defaultStrategy: 'preferLonger',
        useSourcePriority: true,
        priorityMode: 'priority-first',
        trackProvenance: true,
      })

      const sources: ConsolidationSource<Customer, Customer>[] = [
        {
          sourceId: 'crm',
          name: 'CRM',
          adapter: mockAdapter,
          mapping: {
            email: { sourceField: 'email' },
            firstName: { sourceField: 'firstName' },
            lastName: { sourceField: 'lastName' },
            phone: { sourceField: 'phone' },
            address: { sourceField: 'address' },
            vip: { sourceField: 'vip' },
          },
          priority: 10,
        },
        {
          sourceId: 'billing',
          name: 'Billing',
          adapter: mockAdapter,
          mapping: {
            email: { sourceField: 'email' },
            firstName: { sourceField: 'firstName' },
            lastName: { sourceField: 'lastName' },
            phone: { sourceField: 'phone' },
            address: { sourceField: 'address' },
            vip: { sourceField: 'vip' },
          },
          priority: 10, // Same priority
        },
      ]

      const records: MappedRecord<Customer>[] = [
        {
          record: {
            email: 'john@example.com',
            firstName: 'John',
            lastName: 'Doe',
          },
          sourceId: 'crm',
          sourceRecordId: '1',
          originalRecord: {},
        },
        {
          record: {
            email: 'johnathan.doe@example.com',
            firstName: 'John',
            lastName: 'Doe',
          },
          sourceId: 'billing',
          sourceRecordId: '2',
          originalRecord: {},
        },
      ]

      const result = await merger.mergeWithSourcePriority({ records, sources })

      // Same priority, should use strategy (preferLonger)
      expect(result.goldenRecord.email).toBe('johnathan.doe@example.com')
      expect(result.conflicts).toHaveLength(1)
      expect(result.conflicts[0].resolutionReason).toContain('applied strategy')
    })

    it('should use priority-only mode', async () => {
      const merger = new SourceAwareMerger<Customer>({
        defaultStrategy: 'preferNonNull',
        useSourcePriority: true,
        priorityMode: 'priority-only',
        trackProvenance: true,
      })

      const sources: ConsolidationSource<Customer, Customer>[] = [
        {
          sourceId: 'crm',
          name: 'CRM',
          adapter: mockAdapter,
          mapping: {
            email: { sourceField: 'email' },
            firstName: { sourceField: 'firstName' },
            lastName: { sourceField: 'lastName' },
            phone: { sourceField: 'phone' },
            address: { sourceField: 'address' },
            vip: { sourceField: 'vip' },
          },
          priority: 5,
        },
        {
          sourceId: 'billing',
          name: 'Billing',
          adapter: mockAdapter,
          mapping: {
            email: { sourceField: 'email' },
            firstName: { sourceField: 'firstName' },
            lastName: { sourceField: 'lastName' },
            phone: { sourceField: 'phone' },
            address: { sourceField: 'address' },
            vip: { sourceField: 'vip' },
          },
          priority: 10,
        },
      ]

      const records: MappedRecord<Customer>[] = [
        {
          record: {
            email: null as any, // CRM has null
            firstName: 'John',
            lastName: 'Doe',
          },
          sourceId: 'crm',
          sourceRecordId: '1',
          originalRecord: {},
        },
        {
          record: {
            email: 'john@example.com', // Billing has value
            firstName: 'John',
            lastName: 'Doe',
          },
          sourceId: 'billing',
          sourceRecordId: '2',
          originalRecord: {},
        },
      ]

      const result = await merger.mergeWithSourcePriority({ records, sources })

      // Priority-only mode: billing has higher priority (10 > 5)
      // Even though preferNonNull strategy would prefer the non-null value
      expect(result.goldenRecord.email).toBe('john@example.com')
    })

    it('should use priority-fallback mode', async () => {
      const merger = new SourceAwareMerger<Customer>({
        defaultStrategy: 'preferLonger',
        useSourcePriority: true,
        priorityMode: 'priority-fallback',
        trackProvenance: true,
      })

      const sources: ConsolidationSource<Customer, Customer>[] = [
        {
          sourceId: 'crm',
          name: 'CRM',
          adapter: mockAdapter,
          mapping: {
            email: { sourceField: 'email' },
            firstName: { sourceField: 'firstName' },
            lastName: { sourceField: 'lastName' },
            phone: { sourceField: 'phone' },
            address: { sourceField: 'address' },
            vip: { sourceField: 'vip' },
          },
          priority: 5,
        },
        {
          sourceId: 'billing',
          name: 'Billing',
          adapter: mockAdapter,
          mapping: {
            email: { sourceField: 'email' },
            firstName: { sourceField: 'firstName' },
            lastName: { sourceField: 'lastName' },
            phone: { sourceField: 'phone' },
            address: { sourceField: 'address' },
            vip: { sourceField: 'vip' },
          },
          priority: 10,
        },
      ]

      const records: MappedRecord<Customer>[] = [
        {
          record: {
            email: 'short@ex.com',
            firstName: 'John',
            lastName: 'Doe',
          },
          sourceId: 'billing', // Higher priority but shorter
          sourceRecordId: '2',
          originalRecord: {},
        },
        {
          record: {
            email: 'verylongemail@example.com',
            firstName: 'John',
            lastName: 'Doe',
          },
          sourceId: 'crm', // Lower priority but longer
          sourceRecordId: '1',
          originalRecord: {},
        },
      ]

      const result = await merger.mergeWithSourcePriority({ records, sources })

      // Priority-fallback: strategy first (preferLonger)
      expect(result.goldenRecord.email).toBe('verylongemail@example.com')
      expect(result.conflicts).toHaveLength(1)
      expect(result.conflicts[0].resolutionReason).toContain('strategy')
    })

    it('should track source provenance', async () => {
      const sources: ConsolidationSource<Customer, Customer>[] = [
        {
          sourceId: 'crm',
          name: 'CRM',
          adapter: mockAdapter,
          mapping: {
            email: { sourceField: 'email' },
            firstName: { sourceField: 'firstName' },
            lastName: { sourceField: 'lastName' },
            phone: { sourceField: 'phone' },
            address: { sourceField: 'address' },
            vip: { sourceField: 'vip' },
          },
          priority: 10,
        },
        {
          sourceId: 'billing',
          name: 'Billing',
          adapter: mockAdapter,
          mapping: {
            email: { sourceField: 'email' },
            firstName: { sourceField: 'firstName' },
            lastName: { sourceField: 'lastName' },
            phone: { sourceField: 'phone' },
            address: { sourceField: 'address' },
            vip: { sourceField: 'vip' },
          },
          priority: 5,
        },
      ]

      const records: MappedRecord<Customer>[] = [
        {
          record: {
            email: 'john@example.com',
            firstName: 'John',
            lastName: 'Doe',
            phone: '555-1234',
          },
          sourceId: 'crm',
          sourceRecordId: '1',
          originalRecord: {},
        },
        {
          record: {
            email: 'john@example.com',
            firstName: 'John',
            lastName: 'Doe',
            address: '123 Main St',
          },
          sourceId: 'billing',
          sourceRecordId: '2',
          originalRecord: {},
        },
      ]

      const result = await merger.mergeWithSourcePriority({ records, sources })

      expect(result.sourceProvenance.sourceIds).toEqual(['crm', 'billing'])
      expect(result.sourceProvenance.sourceProvenance?.email).toBe('crm')
      expect(result.sourceProvenance.sourceProvenance?.phone).toBe('crm')
      expect(result.sourceProvenance.sourceProvenance?.address).toBe('billing')
    })

    it('should handle records with no priority', async () => {
      const sources: ConsolidationSource<Customer, Customer>[] = [
        {
          sourceId: 'crm',
          name: 'CRM',
          adapter: mockAdapter,
          mapping: {
            email: { sourceField: 'email' },
            firstName: { sourceField: 'firstName' },
            lastName: { sourceField: 'lastName' },
            phone: { sourceField: 'phone' },
            address: { sourceField: 'address' },
            vip: { sourceField: 'vip' },
          },
          // No priority specified
        },
        {
          sourceId: 'billing',
          name: 'Billing',
          adapter: mockAdapter,
          mapping: {
            email: { sourceField: 'email' },
            firstName: { sourceField: 'firstName' },
            lastName: { sourceField: 'lastName' },
            phone: { sourceField: 'phone' },
            address: { sourceField: 'address' },
            vip: { sourceField: 'vip' },
          },
          // No priority specified
        },
      ]

      const records: MappedRecord<Customer>[] = [
        {
          record: {
            email: 'crm@example.com',
            firstName: 'John',
            lastName: 'Doe',
          },
          sourceId: 'crm',
          sourceRecordId: '1',
          originalRecord: {},
        },
        {
          record: {
            email: 'billing@example.com',
            firstName: 'John',
            lastName: 'Doe',
          },
          sourceId: 'billing',
          sourceRecordId: '2',
          originalRecord: {},
        },
      ]

      const result = await merger.mergeWithSourcePriority({ records, sources })

      // Both have priority 0, should use strategy
      expect(result.goldenRecord.email).toBeDefined()
      expect(result.conflicts).toHaveLength(1)
    })

    it('should disable source priority when useSourcePriority is false', async () => {
      const merger = new SourceAwareMerger<Customer>({
        defaultStrategy: 'preferNonNull',
        useSourcePriority: false,
        trackProvenance: true,
      })

      const sources: ConsolidationSource<Customer, Customer>[] = [
        {
          sourceId: 'crm',
          name: 'CRM',
          adapter: mockAdapter,
          mapping: {
            email: { sourceField: 'email' },
            firstName: { sourceField: 'firstName' },
            lastName: { sourceField: 'lastName' },
            phone: { sourceField: 'phone' },
            address: { sourceField: 'address' },
            vip: { sourceField: 'vip' },
          },
          priority: 100, // Very high priority
        },
        {
          sourceId: 'billing',
          name: 'Billing',
          adapter: mockAdapter,
          mapping: {
            email: { sourceField: 'email' },
            firstName: { sourceField: 'firstName' },
            lastName: { sourceField: 'lastName' },
            phone: { sourceField: 'phone' },
            address: { sourceField: 'address' },
            vip: { sourceField: 'vip' },
          },
          priority: 1,
        },
      ]

      const records: MappedRecord<Customer>[] = [
        {
          record: {
            email: null as any,
            firstName: 'John',
            lastName: 'Doe',
          },
          sourceId: 'crm',
          sourceRecordId: '1',
          originalRecord: {},
        },
        {
          record: {
            email: 'john@example.com',
            firstName: 'John',
            lastName: 'Doe',
          },
          sourceId: 'billing',
          sourceRecordId: '2',
          originalRecord: {},
        },
      ]

      const result = await merger.mergeWithSourcePriority({ records, sources })

      // Priority disabled, should use strategy (preferNonNull)
      expect(result.goldenRecord.email).toBe('john@example.com')
    })

    it('should handle nested fields', async () => {
      interface CustomerWithNested {
        email: string
        name: {
          first: string
          last: string
        }
        address?: {
          street: string
          city: string
        }
      }

      const merger = new SourceAwareMerger<CustomerWithNested>({
        defaultStrategy: 'preferFirst',
        useSourcePriority: true,
        priorityMode: 'priority-first',
        trackProvenance: true,
      })

      const sources: ConsolidationSource<CustomerWithNested, CustomerWithNested>[] = [
        {
          sourceId: 'crm',
          name: 'CRM',
          adapter: mockAdapter as any,
          mapping: {
            email: { sourceField: 'email' },
            name: { sourceField: 'name' },
            address: { sourceField: 'address' },
          },
          priority: 10,
        },
        {
          sourceId: 'billing',
          name: 'Billing',
          adapter: mockAdapter as any,
          mapping: {
            email: { sourceField: 'email' },
            name: { sourceField: 'name' },
            address: { sourceField: 'address' },
          },
          priority: 5,
        },
      ]

      const records: MappedRecord<CustomerWithNested>[] = [
        {
          record: {
            email: 'john@example.com',
            name: { first: 'John', last: 'Doe' },
            address: { street: '123 Main St', city: 'NYC' },
          },
          sourceId: 'crm',
          sourceRecordId: '1',
          originalRecord: {},
        },
        {
          record: {
            email: 'john@example.com',
            name: { first: 'John', last: 'Doe' },
            address: { street: '456 Oak Ave', city: 'LA' },
          },
          sourceId: 'billing',
          sourceRecordId: '2',
          originalRecord: {},
        },
      ]

      const result = await merger.mergeWithSourcePriority({ records, sources })

      expect(result.goldenRecord.email).toBe('john@example.com')
      expect(result.goldenRecord.name.first).toBe('John')
      expect(result.goldenRecord.address?.city).toBe('NYC') // CRM has higher priority
    })

    it('should include merge metadata', async () => {
      const sources: ConsolidationSource<Customer, Customer>[] = [
        {
          sourceId: 'crm',
          name: 'CRM',
          adapter: mockAdapter,
          mapping: {
            email: { sourceField: 'email' },
            firstName: { sourceField: 'firstName' },
            lastName: { sourceField: 'lastName' },
            phone: { sourceField: 'phone' },
            address: { sourceField: 'address' },
            vip: { sourceField: 'vip' },
          },
          priority: 10,
        },
        {
          sourceId: 'billing',
          name: 'Billing',
          adapter: mockAdapter,
          mapping: {
            email: { sourceField: 'email' },
            firstName: { sourceField: 'firstName' },
            lastName: { sourceField: 'lastName' },
            phone: { sourceField: 'phone' },
            address: { sourceField: 'address' },
            vip: { sourceField: 'vip' },
          },
          priority: 5,
        },
      ]

      const records: MappedRecord<Customer>[] = [
        {
          record: {
            email: 'john@example.com',
            firstName: 'John',
            lastName: 'Doe',
          },
          sourceId: 'crm',
          sourceRecordId: '1',
          originalRecord: {},
        },
        {
          record: {
            email: 'john@example.com',
            firstName: 'John',
            lastName: 'Doe',
          },
          sourceId: 'billing',
          sourceRecordId: '2',
          originalRecord: {},
        },
      ]

      const result = await merger.mergeWithSourcePriority({
        records,
        sources,
        mergedBy: 'test-user',
        queueItemId: 'queue-123',
      })

      expect(result.provenance.mergedBy).toBe('test-user')
      expect(result.provenance.queueItemId).toBe('queue-123')
      expect(result.provenance.mergedAt).toBeInstanceOf(Date)
      expect(result.provenance.sourceRecordIds).toHaveLength(2)
    })
  })

  describe('createSourceAwareMerger', () => {
    it('should create a new merger instance', () => {
      const merger = createSourceAwareMerger<Customer>({
        defaultStrategy: 'preferNonNull',
        useSourcePriority: true,
      })

      expect(merger).toBeInstanceOf(SourceAwareMerger)
      const config = merger.getConfig()
      expect(config.defaultStrategy).toBe('preferNonNull')
      expect(config.useSourcePriority).toBe(true)
    })
  })
})
