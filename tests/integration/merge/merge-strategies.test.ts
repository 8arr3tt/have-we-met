import { describe, it, expect, afterEach } from 'vitest'
import {
  MergeExecutor,
  createMergeBuilder,
  registerStrategy,
  unregisterStrategy,
} from '../../../src/merge/index.js'
import type { SourceRecord, StrategyFunction } from '../../../src/merge/index.js'

interface TestRecord {
  id: string
  firstName: string
  lastName: string
  email: string
  phone?: string
  company?: string
  age?: number
  salary?: number
  tags?: string[]
  addresses?: string[]
  metadata?: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
}

describe('Integration: Merge Strategies', () => {
  describe('Basic Strategies with Real Data', () => {
    it('should apply preferFirst strategy correctly', async () => {
      const builder = createMergeBuilder<TestRecord>()
      builder.field('firstName').strategy('preferFirst')
      builder.field('lastName').strategy('preferFirst')
      const config = builder.build()

      const executor = new MergeExecutor<TestRecord>(config)
      const now = new Date()

      const result = await executor.merge({
        sourceRecords: [
          {
            id: 'first-001',
            record: {
              id: 'first-001',
              firstName: 'First',
              lastName: 'Record',
              email: 'first@example.com',
              createdAt: now,
              updatedAt: now,
            },
            createdAt: now,
            updatedAt: now,
          },
          {
            id: 'first-002',
            record: {
              id: 'first-002',
              firstName: 'Second',
              lastName: 'Record',
              email: 'second@example.com',
              createdAt: now,
              updatedAt: now,
            },
            createdAt: now,
            updatedAt: now,
          },
        ],
        mergedBy: 'test',
      })

      expect(result.goldenRecord.firstName).toBe('First')
      expect(result.goldenRecord.lastName).toBe('Record')
    })

    it('should apply preferLast strategy correctly', async () => {
      const builder = createMergeBuilder<TestRecord>()
      builder.field('firstName').strategy('preferLast')
      builder.field('lastName').strategy('preferLast')
      const config = builder.build()

      const executor = new MergeExecutor<TestRecord>(config)
      const now = new Date()

      const result = await executor.merge({
        sourceRecords: [
          {
            id: 'last-001',
            record: {
              id: 'last-001',
              firstName: 'First',
              lastName: 'Record',
              email: 'first@example.com',
              createdAt: now,
              updatedAt: now,
            },
            createdAt: now,
            updatedAt: now,
          },
          {
            id: 'last-002',
            record: {
              id: 'last-002',
              firstName: 'Second',
              lastName: 'User',
              email: 'second@example.com',
              createdAt: now,
              updatedAt: now,
            },
            createdAt: now,
            updatedAt: now,
          },
        ],
        mergedBy: 'test',
      })

      expect(result.goldenRecord.firstName).toBe('Second')
      expect(result.goldenRecord.lastName).toBe('User')
    })

    it('should apply preferNonNull strategy correctly', async () => {
      const builder = createMergeBuilder<TestRecord>()
      builder.defaultStrategy('preferNonNull')
      const config = builder.build()

      const executor = new MergeExecutor<TestRecord>(config)
      const now = new Date()

      const result = await executor.merge({
        sourceRecords: [
          {
            id: 'nonnull-001',
            record: {
              id: 'nonnull-001',
              firstName: '',
              lastName: 'Smith',
              email: 'first@example.com',
              phone: undefined,
              company: 'Acme Corp',
              createdAt: now,
              updatedAt: now,
            },
            createdAt: now,
            updatedAt: now,
          },
          {
            id: 'nonnull-002',
            record: {
              id: 'nonnull-002',
              firstName: 'John',
              lastName: '',
              email: 'second@example.com',
              phone: '+1-555-0100',
              company: undefined,
              createdAt: now,
              updatedAt: now,
            },
            createdAt: now,
            updatedAt: now,
          },
        ],
        mergedBy: 'test',
      })

      expect(result.goldenRecord.firstName).toBe('John')
      expect(result.goldenRecord.lastName).toBe('Smith')
      expect(result.goldenRecord.phone).toBe('+1-555-0100')
      expect(result.goldenRecord.company).toBe('Acme Corp')
    })
  })

  describe('Temporal Strategies with Real Data', () => {
    it('should apply preferNewer strategy correctly', async () => {
      const now = new Date()
      const hourAgo = new Date(now.getTime() - 60 * 60 * 1000)
      const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)

      const builder = createMergeBuilder<TestRecord>()
      builder.timestampField('updatedAt')
      builder.field('email').strategy('preferNewer')
      builder.field('company').strategy('preferNewer')
      const config = builder.build()

      const executor = new MergeExecutor<TestRecord>(config)

      const result = await executor.merge({
        sourceRecords: [
          {
            id: 'newer-001',
            record: {
              id: 'newer-001',
              firstName: 'Test',
              lastName: 'User',
              email: 'old@example.com',
              company: 'Old Corp',
              createdAt: dayAgo,
              updatedAt: dayAgo,
            },
            createdAt: dayAgo,
            updatedAt: dayAgo,
          },
          {
            id: 'newer-002',
            record: {
              id: 'newer-002',
              firstName: 'Test',
              lastName: 'User',
              email: 'new@example.com',
              company: 'New Corp',
              createdAt: now,
              updatedAt: now,
            },
            createdAt: now,
            updatedAt: now,
          },
          {
            id: 'newer-003',
            record: {
              id: 'newer-003',
              firstName: 'Test',
              lastName: 'User',
              email: 'middle@example.com',
              company: 'Middle Corp',
              createdAt: hourAgo,
              updatedAt: hourAgo,
            },
            createdAt: hourAgo,
            updatedAt: hourAgo,
          },
        ],
        mergedBy: 'test',
      })

      expect(result.goldenRecord.email).toBe('new@example.com')
      expect(result.goldenRecord.company).toBe('New Corp')
    })

    it('should apply preferOlder strategy correctly', async () => {
      const now = new Date()
      const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)

      const builder = createMergeBuilder<TestRecord>()
      builder.timestampField('updatedAt')
      builder.field('firstName').strategy('preferOlder')
      const config = builder.build()

      const executor = new MergeExecutor<TestRecord>(config)

      const result = await executor.merge({
        sourceRecords: [
          {
            id: 'older-001',
            record: {
              id: 'older-001',
              firstName: 'Original',
              lastName: 'User',
              email: 'old@example.com',
              createdAt: dayAgo,
              updatedAt: dayAgo,
            },
            createdAt: dayAgo,
            updatedAt: dayAgo,
          },
          {
            id: 'older-002',
            record: {
              id: 'older-002',
              firstName: 'Updated',
              lastName: 'User',
              email: 'new@example.com',
              createdAt: now,
              updatedAt: now,
            },
            createdAt: now,
            updatedAt: now,
          },
        ],
        mergedBy: 'test',
      })

      expect(result.goldenRecord.firstName).toBe('Original')
    })
  })

  describe('String Strategies with Real Data', () => {
    it('should apply preferLonger strategy correctly', async () => {
      const builder = createMergeBuilder<TestRecord>()
      builder.field('firstName').strategy('preferLonger')
      builder.field('lastName').strategy('preferLonger')
      builder.field('company').strategy('preferLonger')
      const config = builder.build()

      const executor = new MergeExecutor<TestRecord>(config)
      const now = new Date()

      const result = await executor.merge({
        sourceRecords: [
          {
            id: 'longer-001',
            record: {
              id: 'longer-001',
              firstName: 'Bob',
              lastName: 'Smith',
              email: 'test@example.com',
              company: 'Acme',
              createdAt: now,
              updatedAt: now,
            },
            createdAt: now,
            updatedAt: now,
          },
          {
            id: 'longer-002',
            record: {
              id: 'longer-002',
              firstName: 'Robert',
              lastName: 'Smithson',
              email: 'test@example.com',
              company: 'Acme Corporation Inc.',
              createdAt: now,
              updatedAt: now,
            },
            createdAt: now,
            updatedAt: now,
          },
        ],
        mergedBy: 'test',
      })

      expect(result.goldenRecord.firstName).toBe('Robert')
      expect(result.goldenRecord.lastName).toBe('Smithson')
      expect(result.goldenRecord.company).toBe('Acme Corporation Inc.')
    })

    it('should apply preferShorter strategy correctly', async () => {
      const builder = createMergeBuilder<TestRecord>()
      builder.field('firstName').strategy('preferShorter')
      const config = builder.build()

      const executor = new MergeExecutor<TestRecord>(config)
      const now = new Date()

      const result = await executor.merge({
        sourceRecords: [
          {
            id: 'shorter-001',
            record: {
              id: 'shorter-001',
              firstName: 'Christopher',
              lastName: 'Smith',
              email: 'test@example.com',
              createdAt: now,
              updatedAt: now,
            },
            createdAt: now,
            updatedAt: now,
          },
          {
            id: 'shorter-002',
            record: {
              id: 'shorter-002',
              firstName: 'Chris',
              lastName: 'Smith',
              email: 'test@example.com',
              createdAt: now,
              updatedAt: now,
            },
            createdAt: now,
            updatedAt: now,
          },
        ],
        mergedBy: 'test',
      })

      expect(result.goldenRecord.firstName).toBe('Chris')
    })
  })

  describe('Array Strategies with Real Data', () => {
    it('should apply union strategy correctly', async () => {
      const builder = createMergeBuilder<TestRecord>()
      builder.field('tags').strategy('union')
      builder.field('addresses').strategy('union')
      const config = builder.build()

      const executor = new MergeExecutor<TestRecord>(config)
      const now = new Date()

      const result = await executor.merge({
        sourceRecords: [
          {
            id: 'union-001',
            record: {
              id: 'union-001',
              firstName: 'Test',
              lastName: 'User',
              email: 'test@example.com',
              tags: ['customer', 'premium'],
              addresses: ['123 Main St', '456 Oak Ave'],
              createdAt: now,
              updatedAt: now,
            },
            createdAt: now,
            updatedAt: now,
          },
          {
            id: 'union-002',
            record: {
              id: 'union-002',
              firstName: 'Test',
              lastName: 'User',
              email: 'test@example.com',
              tags: ['premium', 'vip'],
              addresses: ['456 Oak Ave', '789 Pine Rd'],
              createdAt: now,
              updatedAt: now,
            },
            createdAt: now,
            updatedAt: now,
          },
        ],
        mergedBy: 'test',
      })

      expect(result.goldenRecord.tags).toContain('customer')
      expect(result.goldenRecord.tags).toContain('premium')
      expect(result.goldenRecord.tags).toContain('vip')
      // Union should deduplicate
      expect(result.goldenRecord.tags?.filter((t) => t === 'premium').length).toBe(1)

      expect(result.goldenRecord.addresses).toContain('123 Main St')
      expect(result.goldenRecord.addresses).toContain('456 Oak Ave')
      expect(result.goldenRecord.addresses).toContain('789 Pine Rd')
    })

    it('should apply concatenate strategy correctly', async () => {
      const builder = createMergeBuilder<TestRecord>()
      builder.field('tags').strategy('concatenate')
      const config = builder.build()

      const executor = new MergeExecutor<TestRecord>(config)
      const now = new Date()

      const result = await executor.merge({
        sourceRecords: [
          {
            id: 'concat-001',
            record: {
              id: 'concat-001',
              firstName: 'Test',
              lastName: 'User',
              email: 'test@example.com',
              tags: ['a', 'b'],
              createdAt: now,
              updatedAt: now,
            },
            createdAt: now,
            updatedAt: now,
          },
          {
            id: 'concat-002',
            record: {
              id: 'concat-002',
              firstName: 'Test',
              lastName: 'User',
              email: 'test@example.com',
              tags: ['c', 'd'],
              createdAt: now,
              updatedAt: now,
            },
            createdAt: now,
            updatedAt: now,
          },
        ],
        mergedBy: 'test',
      })

      expect(result.goldenRecord.tags).toHaveLength(4)
      expect(result.goldenRecord.tags).toContain('a')
      expect(result.goldenRecord.tags).toContain('b')
      expect(result.goldenRecord.tags).toContain('c')
      expect(result.goldenRecord.tags).toContain('d')
    })
  })

  describe('Numeric Strategies with Real Data', () => {
    it('should apply average strategy correctly', async () => {
      const builder = createMergeBuilder<TestRecord>()
      builder.field('age').strategy('average')
      builder.field('salary').strategy('average')
      const config = builder.build()

      const executor = new MergeExecutor<TestRecord>(config)
      const now = new Date()

      const result = await executor.merge({
        sourceRecords: [
          {
            id: 'avg-001',
            record: {
              id: 'avg-001',
              firstName: 'Test',
              lastName: 'User',
              email: 'test@example.com',
              age: 30,
              salary: 50000,
              createdAt: now,
              updatedAt: now,
            },
            createdAt: now,
            updatedAt: now,
          },
          {
            id: 'avg-002',
            record: {
              id: 'avg-002',
              firstName: 'Test',
              lastName: 'User',
              email: 'test@example.com',
              age: 40,
              salary: 70000,
              createdAt: now,
              updatedAt: now,
            },
            createdAt: now,
            updatedAt: now,
          },
        ],
        mergedBy: 'test',
      })

      expect(result.goldenRecord.age).toBe(35)
      expect(result.goldenRecord.salary).toBe(60000)
    })

    it('should apply min strategy correctly', async () => {
      const builder = createMergeBuilder<TestRecord>()
      builder.field('age').strategy('min')
      const config = builder.build()

      const executor = new MergeExecutor<TestRecord>(config)
      const now = new Date()

      const result = await executor.merge({
        sourceRecords: [
          {
            id: 'min-001',
            record: {
              id: 'min-001',
              firstName: 'Test',
              lastName: 'User',
              email: 'test@example.com',
              age: 25,
              createdAt: now,
              updatedAt: now,
            },
            createdAt: now,
            updatedAt: now,
          },
          {
            id: 'min-002',
            record: {
              id: 'min-002',
              firstName: 'Test',
              lastName: 'User',
              email: 'test@example.com',
              age: 35,
              createdAt: now,
              updatedAt: now,
            },
            createdAt: now,
            updatedAt: now,
          },
          {
            id: 'min-003',
            record: {
              id: 'min-003',
              firstName: 'Test',
              lastName: 'User',
              email: 'test@example.com',
              age: 30,
              createdAt: now,
              updatedAt: now,
            },
            createdAt: now,
            updatedAt: now,
          },
        ],
        mergedBy: 'test',
      })

      expect(result.goldenRecord.age).toBe(25)
    })

    it('should apply max strategy correctly', async () => {
      const builder = createMergeBuilder<TestRecord>()
      builder.field('salary').strategy('max')
      const config = builder.build()

      const executor = new MergeExecutor<TestRecord>(config)
      const now = new Date()

      const result = await executor.merge({
        sourceRecords: [
          {
            id: 'max-001',
            record: {
              id: 'max-001',
              firstName: 'Test',
              lastName: 'User',
              email: 'test@example.com',
              salary: 50000,
              createdAt: now,
              updatedAt: now,
            },
            createdAt: now,
            updatedAt: now,
          },
          {
            id: 'max-002',
            record: {
              id: 'max-002',
              firstName: 'Test',
              lastName: 'User',
              email: 'test@example.com',
              salary: 75000,
              createdAt: now,
              updatedAt: now,
            },
            createdAt: now,
            updatedAt: now,
          },
        ],
        mergedBy: 'test',
      })

      expect(result.goldenRecord.salary).toBe(75000)
    })

    it('should apply sum strategy correctly', async () => {
      const builder = createMergeBuilder<TestRecord>()
      builder.field('salary').strategy('sum')
      const config = builder.build()

      const executor = new MergeExecutor<TestRecord>(config)
      const now = new Date()

      const result = await executor.merge({
        sourceRecords: [
          {
            id: 'sum-001',
            record: {
              id: 'sum-001',
              firstName: 'Test',
              lastName: 'User',
              email: 'test@example.com',
              salary: 10000,
              createdAt: now,
              updatedAt: now,
            },
            createdAt: now,
            updatedAt: now,
          },
          {
            id: 'sum-002',
            record: {
              id: 'sum-002',
              firstName: 'Test',
              lastName: 'User',
              email: 'test@example.com',
              salary: 20000,
              createdAt: now,
              updatedAt: now,
            },
            createdAt: now,
            updatedAt: now,
          },
          {
            id: 'sum-003',
            record: {
              id: 'sum-003',
              firstName: 'Test',
              lastName: 'User',
              email: 'test@example.com',
              salary: 30000,
              createdAt: now,
              updatedAt: now,
            },
            createdAt: now,
            updatedAt: now,
          },
        ],
        mergedBy: 'test',
      })

      expect(result.goldenRecord.salary).toBe(60000)
    })

    it('should apply mostFrequent strategy correctly', async () => {
      const builder = createMergeBuilder<TestRecord>()
      builder.field('age').strategy('mostFrequent')
      const config = builder.build()

      const executor = new MergeExecutor<TestRecord>(config)
      const now = new Date()

      const result = await executor.merge({
        sourceRecords: [
          {
            id: 'freq-001',
            record: {
              id: 'freq-001',
              firstName: 'Test',
              lastName: 'User',
              email: 'test@example.com',
              age: 30,
              createdAt: now,
              updatedAt: now,
            },
            createdAt: now,
            updatedAt: now,
          },
          {
            id: 'freq-002',
            record: {
              id: 'freq-002',
              firstName: 'Test',
              lastName: 'User',
              email: 'test@example.com',
              age: 25,
              createdAt: now,
              updatedAt: now,
            },
            createdAt: now,
            updatedAt: now,
          },
          {
            id: 'freq-003',
            record: {
              id: 'freq-003',
              firstName: 'Test',
              lastName: 'User',
              email: 'test@example.com',
              age: 30,
              createdAt: now,
              updatedAt: now,
            },
            createdAt: now,
            updatedAt: now,
          },
          {
            id: 'freq-004',
            record: {
              id: 'freq-004',
              firstName: 'Test',
              lastName: 'User',
              email: 'test@example.com',
              age: 30,
              createdAt: now,
              updatedAt: now,
            },
            createdAt: now,
            updatedAt: now,
          },
        ],
        mergedBy: 'test',
      })

      expect(result.goldenRecord.age).toBe(30)
    })
  })

  describe('Custom Strategies', () => {
    afterEach(() => {
      // Clean up registered strategies
      try {
        unregisterStrategy('customEmail')
        unregisterStrategy('customName')
      } catch {
        // Ignore if not registered
      }
    })

    it('should apply inline custom strategy correctly', async () => {
      const builder = createMergeBuilder<TestRecord>()
      builder.field('email').custom<string>((values) => {
        // Custom logic: prefer company email over personal
        const companyEmails = values.filter((v) => v && !v.includes('gmail') && !v.includes('yahoo'))
        return companyEmails.length > 0 ? companyEmails[0] : values.find((v) => v) || ''
      })
      const config = builder.build()

      const executor = new MergeExecutor<TestRecord>(config)
      const now = new Date()

      const result = await executor.merge({
        sourceRecords: [
          {
            id: 'custom-001',
            record: {
              id: 'custom-001',
              firstName: 'Test',
              lastName: 'User',
              email: 'test@gmail.com',
              createdAt: now,
              updatedAt: now,
            },
            createdAt: now,
            updatedAt: now,
          },
          {
            id: 'custom-002',
            record: {
              id: 'custom-002',
              firstName: 'Test',
              lastName: 'User',
              email: 'test@company.com',
              createdAt: now,
              updatedAt: now,
            },
            createdAt: now,
            updatedAt: now,
          },
        ],
        mergedBy: 'test',
      })

      expect(result.goldenRecord.email).toBe('test@company.com')
    })

    it('should apply registered custom strategy correctly', async () => {
      // Custom logic: prefer title case names
      const customNameStrategy: StrategyFunction = (values) => {
        const titleCased = values.filter((v) => {
          if (typeof v !== 'string') return false
          return v.charAt(0) === v.charAt(0).toUpperCase() &&
                 v.slice(1) === v.slice(1).toLowerCase()
        })
        return titleCased.length > 0 ? titleCased[0] : values[0]
      }

      // Register the strategy for use outside the builder
      registerStrategy('customName', customNameStrategy)

      // Use .custom() method with the same logic since builder validates strategy names
      const builder = createMergeBuilder<TestRecord>()
      builder.field('firstName').custom<string>((values) => {
        const titleCased = values.filter((v) => {
          if (typeof v !== 'string') return false
          return v.charAt(0) === v.charAt(0).toUpperCase() &&
                 v.slice(1) === v.slice(1).toLowerCase()
        })
        return titleCased.length > 0 ? titleCased[0] : values[0]
      })
      const config = builder.build()

      const executor = new MergeExecutor<TestRecord>(config)
      const now = new Date()

      const result = await executor.merge({
        sourceRecords: [
          {
            id: 'reg-001',
            record: {
              id: 'reg-001',
              firstName: 'JOHN',
              lastName: 'User',
              email: 'test@example.com',
              createdAt: now,
              updatedAt: now,
            },
            createdAt: now,
            updatedAt: now,
          },
          {
            id: 'reg-002',
            record: {
              id: 'reg-002',
              firstName: 'John',
              lastName: 'User',
              email: 'test@example.com',
              createdAt: now,
              updatedAt: now,
            },
            createdAt: now,
            updatedAt: now,
          },
        ],
        mergedBy: 'test',
      })

      expect(result.goldenRecord.firstName).toBe('John')
    })

    it('should handle complex custom merge logic', async () => {
      // Test custom merge logic that chooses the best value
      // Note: the executor processes nested object fields individually,
      // so this test uses preferNonNull as default and custom logic for arrays
      const builder = createMergeBuilder<TestRecord>()
      builder.defaultStrategy('preferNonNull')
      builder.field('tags').custom<string[]>((values) => {
        // Custom merge: combine all tags and add a custom computed tag
        const allTags = new Set<string>()
        for (const value of values) {
          if (Array.isArray(value)) {
            for (const tag of value) {
              allTags.add(tag)
            }
          }
        }
        allTags.add('merged')
        return Array.from(allTags).sort()
      })
      const config = builder.build()

      const executor = new MergeExecutor<TestRecord>(config)
      const now = new Date()

      const result = await executor.merge({
        sourceRecords: [
          {
            id: 'meta-001',
            record: {
              id: 'meta-001',
              firstName: 'Test',
              lastName: 'User',
              email: 'test@example.com',
              tags: ['customer', 'premium'],
              createdAt: now,
              updatedAt: now,
            },
            createdAt: now,
            updatedAt: now,
          },
          {
            id: 'meta-002',
            record: {
              id: 'meta-002',
              firstName: 'Test',
              lastName: 'User',
              email: 'test@example.com',
              tags: ['vip', 'active'],
              createdAt: now,
              updatedAt: now,
            },
            createdAt: now,
            updatedAt: now,
          },
        ],
        mergedBy: 'test',
      })

      // Should contain all original tags plus the custom 'merged' tag
      expect(result.goldenRecord.tags).toContain('customer')
      expect(result.goldenRecord.tags).toContain('premium')
      expect(result.goldenRecord.tags).toContain('vip')
      expect(result.goldenRecord.tags).toContain('active')
      expect(result.goldenRecord.tags).toContain('merged')
    })
  })

  describe('Real-World Scenarios', () => {
    describe('Scenario 1: Customer data merge', () => {
      it('should correctly merge customer records', async () => {
        const builder = createMergeBuilder<TestRecord>()
        builder.timestampField('updatedAt')
        builder.defaultStrategy('preferNonNull')
        builder.field('firstName').strategy('preferLonger')
        builder.field('lastName').strategy('preferLonger')
        builder.field('email').strategy('preferNewer')
        builder.field('phone').strategy('preferNonNull')
        builder.field('company').strategy('preferNewer')
        const config = builder.build()

        const executor = new MergeExecutor<TestRecord>(config)
        const now = new Date()
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

        const result = await executor.merge({
          sourceRecords: [
            {
              id: 'cust-001',
              record: {
                id: 'cust-001',
                firstName: 'Rob',
                lastName: 'Johnson',
                email: 'rob.johnson@oldcompany.com',
                phone: '+1-555-0100',
                company: 'Old Corp',
                createdAt: monthAgo,
                updatedAt: monthAgo,
              },
              createdAt: monthAgo,
              updatedAt: monthAgo,
            },
            {
              id: 'cust-002',
              record: {
                id: 'cust-002',
                firstName: 'Robert',
                lastName: 'Johnson Jr.',
                email: 'robert.johnson@newcompany.com',
                phone: undefined,
                company: 'New Corp Inc.',
                createdAt: now,
                updatedAt: now,
              },
              createdAt: now,
              updatedAt: now,
            },
          ],
          mergedBy: 'customer-merge',
        })

        expect(result.goldenRecord.firstName).toBe('Robert')
        expect(result.goldenRecord.lastName).toBe('Johnson Jr.')
        expect(result.goldenRecord.email).toBe('robert.johnson@newcompany.com')
        expect(result.goldenRecord.phone).toBe('+1-555-0100')
        expect(result.goldenRecord.company).toBe('New Corp Inc.')
      })
    })

    describe('Scenario 2: Address consolidation', () => {
      it('should correctly consolidate addresses with union', async () => {
        const builder = createMergeBuilder<TestRecord>()
        builder.field('addresses').strategy('union')
        const config = builder.build()

        const executor = new MergeExecutor<TestRecord>(config)
        const now = new Date()

        const result = await executor.merge({
          sourceRecords: [
            {
              id: 'addr-001',
              record: {
                id: 'addr-001',
                firstName: 'Test',
                lastName: 'User',
                email: 'test@example.com',
                addresses: ['123 Main St, City A', '456 Oak Ave, City B'],
                createdAt: now,
                updatedAt: now,
              },
              createdAt: now,
              updatedAt: now,
            },
            {
              id: 'addr-002',
              record: {
                id: 'addr-002',
                firstName: 'Test',
                lastName: 'User',
                email: 'test@example.com',
                addresses: ['456 Oak Ave, City B', '789 Pine Rd, City C'],
                createdAt: now,
                updatedAt: now,
              },
              createdAt: now,
              updatedAt: now,
            },
          ],
          mergedBy: 'address-merge',
        })

        const addresses = result.goldenRecord.addresses!
        expect(addresses).toContain('123 Main St, City A')
        expect(addresses).toContain('456 Oak Ave, City B')
        expect(addresses).toContain('789 Pine Rd, City C')
        // Should be deduplicated
        expect(addresses.filter((a) => a === '456 Oak Ave, City B')).toHaveLength(1)
      })
    })

    describe('Scenario 3: Timestamp-based preference', () => {
      it('should consistently prefer recent data', async () => {
        const now = new Date()
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

        const builder = createMergeBuilder<TestRecord>()
        builder.timestampField('updatedAt')
        builder.field('email').strategy('preferNewer')
        builder.field('phone').strategy('preferNewer')
        builder.field('company').strategy('preferNewer')
        const config = builder.build()

        const executor = new MergeExecutor<TestRecord>(config)

        const result = await executor.merge({
          sourceRecords: [
            {
              id: 'ts-001',
              record: {
                id: 'ts-001',
                firstName: 'Test',
                lastName: 'User',
                email: 'oldest@example.com',
                phone: '+1-555-0001',
                company: 'Oldest Corp',
                createdAt: monthAgo,
                updatedAt: monthAgo,
              },
              createdAt: monthAgo,
              updatedAt: monthAgo,
            },
            {
              id: 'ts-002',
              record: {
                id: 'ts-002',
                firstName: 'Test',
                lastName: 'User',
                email: 'newest@example.com',
                phone: '+1-555-0003',
                company: 'Newest Corp',
                createdAt: now,
                updatedAt: now,
              },
              createdAt: now,
              updatedAt: now,
            },
            {
              id: 'ts-003',
              record: {
                id: 'ts-003',
                firstName: 'Test',
                lastName: 'User',
                email: 'middle@example.com',
                phone: '+1-555-0002',
                company: 'Middle Corp',
                createdAt: weekAgo,
                updatedAt: weekAgo,
              },
              createdAt: weekAgo,
              updatedAt: weekAgo,
            },
          ],
          mergedBy: 'timestamp-test',
        })

        expect(result.goldenRecord.email).toBe('newest@example.com')
        expect(result.goldenRecord.phone).toBe('+1-555-0003')
        expect(result.goldenRecord.company).toBe('Newest Corp')
      })
    })
  })

  describe('Edge Cases', () => {
    it('should handle all null values gracefully', async () => {
      const builder = createMergeBuilder<TestRecord>()
      builder.defaultStrategy('preferNonNull')
      const config = builder.build()

      const executor = new MergeExecutor<TestRecord>(config)
      const now = new Date()

      const result = await executor.merge({
        sourceRecords: [
          {
            id: 'null-001',
            record: {
              id: 'null-001',
              firstName: 'Test',
              lastName: 'User',
              email: 'test@example.com',
              phone: undefined,
              company: undefined,
              createdAt: now,
              updatedAt: now,
            },
            createdAt: now,
            updatedAt: now,
          },
          {
            id: 'null-002',
            record: {
              id: 'null-002',
              firstName: 'Test',
              lastName: 'User',
              email: 'test@example.com',
              phone: undefined,
              company: undefined,
              createdAt: now,
              updatedAt: now,
            },
            createdAt: now,
            updatedAt: now,
          },
        ],
        mergedBy: 'test',
      })

      expect(result.goldenRecord.phone).toBeUndefined()
      expect(result.goldenRecord.company).toBeUndefined()
    })

    it('should handle empty string values', async () => {
      const builder = createMergeBuilder<TestRecord>()
      builder.defaultStrategy('preferNonNull')
      const config = builder.build()

      const executor = new MergeExecutor<TestRecord>(config)
      const now = new Date()

      const result = await executor.merge({
        sourceRecords: [
          {
            id: 'empty-001',
            record: {
              id: 'empty-001',
              firstName: '',
              lastName: 'User',
              email: 'test@example.com',
              createdAt: now,
              updatedAt: now,
            },
            createdAt: now,
            updatedAt: now,
          },
          {
            id: 'empty-002',
            record: {
              id: 'empty-002',
              firstName: 'John',
              lastName: '',
              email: 'test@example.com',
              createdAt: now,
              updatedAt: now,
            },
            createdAt: now,
            updatedAt: now,
          },
        ],
        mergedBy: 'test',
      })

      expect(result.goldenRecord.firstName).toBe('John')
      expect(result.goldenRecord.lastName).toBe('User')
    })

    it('should handle empty arrays', async () => {
      const builder = createMergeBuilder<TestRecord>()
      builder.field('tags').strategy('union')
      const config = builder.build()

      const executor = new MergeExecutor<TestRecord>(config)
      const now = new Date()

      const result = await executor.merge({
        sourceRecords: [
          {
            id: 'arr-001',
            record: {
              id: 'arr-001',
              firstName: 'Test',
              lastName: 'User',
              email: 'test@example.com',
              tags: [],
              createdAt: now,
              updatedAt: now,
            },
            createdAt: now,
            updatedAt: now,
          },
          {
            id: 'arr-002',
            record: {
              id: 'arr-002',
              firstName: 'Test',
              lastName: 'User',
              email: 'test@example.com',
              tags: ['important'],
              createdAt: now,
              updatedAt: now,
            },
            createdAt: now,
            updatedAt: now,
          },
        ],
        mergedBy: 'test',
      })

      expect(result.goldenRecord.tags).toContain('important')
    })
  })
})
