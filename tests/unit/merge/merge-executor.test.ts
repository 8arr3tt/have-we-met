import { describe, it, expect, beforeEach } from 'vitest'
import {
  MergeExecutor,
  MergeConflictError,
  registerBuiltInStrategies,
  clearStrategies,
} from '../../../src/merge/index.js'
import type {
  SourceRecord,
  MergeConfig,
  MergeRequest,
  FieldMergeConfig,
} from '../../../src/merge/types.js'

interface TestRecord {
  firstName: string
  lastName: string
  email: string
  phone?: string
  age?: number
  addresses?: string[]
  metadata?: {
    source: string
    verified: boolean
  }
}

function createSourceRecord<T extends Record<string, unknown>>(
  id: string,
  record: T,
  options?: { createdAt?: Date; updatedAt?: Date }
): SourceRecord<T> {
  return {
    id,
    record,
    createdAt: options?.createdAt ?? new Date('2024-01-01'),
    updatedAt: options?.updatedAt ?? new Date('2024-01-01'),
  }
}

describe('MergeExecutor', () => {
  beforeEach(() => {
    clearStrategies()
    registerBuiltInStrategies()
  })

  describe('constructor', () => {
    it('creates executor with default config', () => {
      const executor = new MergeExecutor<TestRecord>({})

      const config = executor.getConfig()
      expect(config.defaultStrategy).toBe('preferNonNull')
      expect(config.trackProvenance).toBe(true)
      expect(config.conflictResolution).toBe('useDefault')
    })

    it('creates executor with custom config', () => {
      const executor = new MergeExecutor<TestRecord>({
        defaultStrategy: 'preferFirst',
        trackProvenance: false,
        conflictResolution: 'error',
      })

      const config = executor.getConfig()
      expect(config.defaultStrategy).toBe('preferFirst')
      expect(config.trackProvenance).toBe(false)
      expect(config.conflictResolution).toBe('error')
    })

    it('creates executor with field strategies', () => {
      const fieldStrategies: FieldMergeConfig[] = [
        { field: 'firstName', strategy: 'preferLonger' },
        { field: 'email', strategy: 'preferNewer' },
      ]

      const executor = new MergeExecutor<TestRecord>({ fieldStrategies })

      const config = executor.getConfig()
      expect(config.fieldStrategies).toHaveLength(2)
      expect(config.fieldStrategies[0].field).toBe('firstName')
      expect(config.fieldStrategies[1].field).toBe('email')
    })

    it('stores schema when provided', () => {
      const schema = {
        firstName: { type: 'name' as const },
        email: { type: 'email' as const },
      }

      const executor = new MergeExecutor<TestRecord>({}, schema)

      expect(executor.getSchema()).toEqual(schema)
    })
  })

  describe('merge', () => {
    it('merges two records with configured strategies', async () => {
      const executor = new MergeExecutor<TestRecord>({
        fieldStrategies: [
          { field: 'firstName', strategy: 'preferLonger' },
          { field: 'lastName', strategy: 'preferFirst' },
        ],
      })

      const record1 = createSourceRecord('rec-1', {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
      })

      const record2 = createSourceRecord('rec-2', {
        firstName: 'Jonathan',
        lastName: 'Smith',
        email: 'jonathan@example.com',
      })

      const result = await executor.merge({ sourceRecords: [record1, record2] })

      expect(result.goldenRecord.firstName).toBe('Jonathan') // longer
      expect(result.goldenRecord.lastName).toBe('Doe') // first
      expect(result.goldenRecordId).toBe('rec-1') // uses first record ID by default
    })

    it('merges multiple records (3+)', async () => {
      const executor = new MergeExecutor<TestRecord>({
        defaultStrategy: 'preferFirst',
      })

      const records = [
        createSourceRecord('rec-1', {
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@example.com',
        }),
        createSourceRecord('rec-2', {
          firstName: 'Jane',
          lastName: 'Smith',
          email: 'jane@example.com',
        }),
        createSourceRecord('rec-3', {
          firstName: 'Bob',
          lastName: 'Johnson',
          email: 'bob@example.com',
        }),
      ]

      const result = await executor.merge({ sourceRecords: records })

      expect(result.goldenRecord.firstName).toBe('John')
      expect(result.goldenRecord.lastName).toBe('Doe')
      expect(result.goldenRecord.email).toBe('john@example.com')
      expect(result.sourceRecords).toHaveLength(3)
    })

    it('applies correct strategy per field', async () => {
      const executor = new MergeExecutor<TestRecord>({
        fieldStrategies: [
          { field: 'firstName', strategy: 'preferLonger' },
          { field: 'lastName', strategy: 'preferShorter' },
          { field: 'email', strategy: 'preferLast' },
        ],
      })

      const record1 = createSourceRecord('rec-1', {
        firstName: 'John',
        lastName: 'Fitzgerald',
        email: 'john@a.com',
      })

      const record2 = createSourceRecord('rec-2', {
        firstName: 'Jonathan',
        lastName: 'Doe',
        email: 'jonathan@b.com',
      })

      const result = await executor.merge({ sourceRecords: [record1, record2] })

      expect(result.goldenRecord.firstName).toBe('Jonathan') // longer
      expect(result.goldenRecord.lastName).toBe('Doe') // shorter
      expect(result.goldenRecord.email).toBe('jonathan@b.com') // last
    })

    it('uses default strategy for unconfigured fields', async () => {
      const executor = new MergeExecutor<TestRecord>({
        defaultStrategy: 'preferLast',
        fieldStrategies: [{ field: 'firstName', strategy: 'preferFirst' }],
      })

      const record1 = createSourceRecord('rec-1', {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
      })

      const record2 = createSourceRecord('rec-2', {
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane@example.com',
      })

      const result = await executor.merge({ sourceRecords: [record1, record2] })

      expect(result.goldenRecord.firstName).toBe('John') // explicit preferFirst
      expect(result.goldenRecord.lastName).toBe('Smith') // default preferLast
      expect(result.goldenRecord.email).toBe('jane@example.com') // default preferLast
    })

    it('handles nested fields', async () => {
      const executor = new MergeExecutor<TestRecord>({
        defaultStrategy: 'preferNonNull',
      })

      const record1 = createSourceRecord('rec-1', {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        metadata: {
          source: 'crm',
          verified: true,
        },
      })

      const record2 = createSourceRecord('rec-2', {
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane@example.com',
        metadata: {
          source: 'web',
          verified: false,
        },
      })

      const result = await executor.merge({ sourceRecords: [record1, record2] })

      expect(result.goldenRecord.metadata).toBeDefined()
      expect(result.goldenRecord.metadata?.source).toBe('crm')
      expect(result.goldenRecord.metadata?.verified).toBe(true)
    })

    it('tracks provenance for each field', async () => {
      const executor = new MergeExecutor<TestRecord>({
        trackProvenance: true,
        defaultStrategy: 'preferFirst',
      })

      const record1 = createSourceRecord('rec-1', {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
      })

      const record2 = createSourceRecord('rec-2', {
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane@example.com',
      })

      const result = await executor.merge({ sourceRecords: [record1, record2] })

      expect(result.provenance.fieldSources).toBeDefined()
      expect(result.provenance.fieldSources.firstName).toBeDefined()
      expect(result.provenance.fieldSources.firstName.sourceRecordId).toBe(
        'rec-1'
      )
      expect(result.provenance.fieldSources.firstName.strategyApplied).toBe(
        'preferFirst'
      )
      expect(result.provenance.fieldSources.firstName.allValues).toHaveLength(2)
    })

    it('returns all source records in result', async () => {
      const executor = new MergeExecutor<TestRecord>({})

      const record1 = createSourceRecord('rec-1', {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
      })

      const record2 = createSourceRecord('rec-2', {
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane@example.com',
      })

      const result = await executor.merge({ sourceRecords: [record1, record2] })

      expect(result.sourceRecords).toHaveLength(2)
      expect(result.sourceRecords[0].id).toBe('rec-1')
      expect(result.sourceRecords[1].id).toBe('rec-2')
    })

    it('uses targetRecordId when provided', async () => {
      const executor = new MergeExecutor<TestRecord>({})

      const record1 = createSourceRecord('rec-1', {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
      })

      const record2 = createSourceRecord('rec-2', {
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane@example.com',
      })

      const result = await executor.merge({
        sourceRecords: [record1, record2],
        targetRecordId: 'custom-golden-id',
      })

      expect(result.goldenRecordId).toBe('custom-golden-id')
    })

    it('includes mergedBy in provenance', async () => {
      const executor = new MergeExecutor<TestRecord>({})

      const result = await executor.merge({
        sourceRecords: [
          createSourceRecord('rec-1', {
            firstName: 'John',
            lastName: 'Doe',
            email: 'john@example.com',
          }),
          createSourceRecord('rec-2', {
            firstName: 'Jane',
            lastName: 'Smith',
            email: 'jane@example.com',
          }),
        ],
        mergedBy: 'user-123',
      })

      expect(result.provenance.mergedBy).toBe('user-123')
    })

    it('includes queueItemId in provenance', async () => {
      const executor = new MergeExecutor<TestRecord>({})

      const result = await executor.merge({
        sourceRecords: [
          createSourceRecord('rec-1', {
            firstName: 'John',
            lastName: 'Doe',
            email: 'john@example.com',
          }),
          createSourceRecord('rec-2', {
            firstName: 'Jane',
            lastName: 'Smith',
            email: 'jane@example.com',
          }),
        ],
        queueItemId: 'queue-456',
      })

      expect(result.provenance.queueItemId).toBe('queue-456')
    })

    it('applies config overrides for single merge', async () => {
      const executor = new MergeExecutor<TestRecord>({
        defaultStrategy: 'preferFirst',
      })

      const record1 = createSourceRecord('rec-1', {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
      })

      const record2 = createSourceRecord('rec-2', {
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane@example.com',
      })

      const result = await executor.merge({
        sourceRecords: [record1, record2],
        configOverrides: { defaultStrategy: 'preferLast' },
      })

      expect(result.goldenRecord.firstName).toBe('Jane') // overridden to preferLast
      expect(result.goldenRecord.lastName).toBe('Smith')
    })
  })

  describe('conflict handling', () => {
    it('detects conflicts when values are different', async () => {
      const executor = new MergeExecutor<TestRecord>({
        conflictResolution: 'useDefault',
        defaultStrategy: 'preferFirst',
      })

      const record1 = createSourceRecord('rec-1', {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
      })

      const record2 = createSourceRecord('rec-2', {
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane@example.com',
      })

      const result = await executor.merge({ sourceRecords: [record1, record2] })

      // Conflicts should be recorded for differing values
      expect(result.conflicts.length).toBeGreaterThan(0)
      expect(result.conflicts.some((c) => c.field === 'firstName')).toBe(true)
    })

    it('applies conflict resolution mode: error', async () => {
      const executor = new MergeExecutor<TestRecord>({
        conflictResolution: 'error',
        defaultStrategy: 'preferFirst',
      })

      const record1 = createSourceRecord('rec-1', {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
      })

      const record2 = createSourceRecord('rec-2', {
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane@example.com',
      })

      await expect(
        executor.merge({ sourceRecords: [record1, record2] })
      ).rejects.toThrow(MergeConflictError)
    })

    it('applies conflict resolution mode: useDefault', async () => {
      const executor = new MergeExecutor<TestRecord>({
        conflictResolution: 'useDefault',
        defaultStrategy: 'preferFirst',
      })

      const record1 = createSourceRecord('rec-1', {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
      })

      const record2 = createSourceRecord('rec-2', {
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane@example.com',
      })

      const result = await executor.merge({ sourceRecords: [record1, record2] })

      // Should resolve without throwing
      expect(result.goldenRecord.firstName).toBe('John')
      expect(result.conflicts.some((c) => c.resolution === 'auto')).toBe(true)
    })

    it('applies conflict resolution mode: markConflict', async () => {
      const executor = new MergeExecutor<TestRecord>({
        conflictResolution: 'markConflict',
        defaultStrategy: 'preferFirst',
      })

      const record1 = createSourceRecord('rec-1', {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
      })

      const record2 = createSourceRecord('rec-2', {
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane@example.com',
      })

      const result = await executor.merge({ sourceRecords: [record1, record2] })

      // Should not throw, but mark conflicts as deferred
      expect(result.conflicts.some((c) => c.resolution === 'deferred')).toBe(
        true
      )
    })

    it('records conflict details', async () => {
      const executor = new MergeExecutor<TestRecord>({
        conflictResolution: 'useDefault',
        defaultStrategy: 'preferFirst',
      })

      const record1 = createSourceRecord('rec-1', {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
      })

      const record2 = createSourceRecord('rec-2', {
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane@example.com',
      })

      const result = await executor.merge({ sourceRecords: [record1, record2] })

      const firstNameConflict = result.conflicts.find(
        (c) => c.field === 'firstName'
      )
      expect(firstNameConflict).toBeDefined()
      expect(firstNameConflict?.values).toHaveLength(2)
      expect(firstNameConflict?.values.map((v) => v.value)).toContain('John')
      expect(firstNameConflict?.values.map((v) => v.value)).toContain('Jane')
    })

    it('does not report conflict when values are the same', async () => {
      const executor = new MergeExecutor<TestRecord>({
        conflictResolution: 'useDefault',
        defaultStrategy: 'preferFirst',
      })

      const record1 = createSourceRecord('rec-1', {
        firstName: 'John',
        lastName: 'Doe',
        email: 'same@example.com',
      })

      const record2 = createSourceRecord('rec-2', {
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'same@example.com', // same value
      })

      const result = await executor.merge({ sourceRecords: [record1, record2] })

      // Email should not be a conflict
      expect(result.conflicts.find((c) => c.field === 'email')).toBeUndefined()
    })
  })

  describe('edge cases', () => {
    it('handles empty field values', async () => {
      const executor = new MergeExecutor<TestRecord>({
        defaultStrategy: 'preferNonNull',
      })

      const record1 = createSourceRecord('rec-1', {
        firstName: 'John',
        lastName: '',
        email: 'john@example.com',
      })

      const record2 = createSourceRecord('rec-2', {
        firstName: '',
        lastName: 'Smith',
        email: 'jane@example.com',
      })

      const result = await executor.merge({ sourceRecords: [record1, record2] })

      expect(result.goldenRecord.firstName).toBe('John')
      expect(result.goldenRecord.lastName).toBe('Smith')
    })

    it('handles null values according to config', async () => {
      const executor = new MergeExecutor<TestRecord>({
        defaultStrategy: 'preferNonNull',
      })

      const record1 = createSourceRecord('rec-1', {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        phone: undefined,
      })

      const record2 = createSourceRecord('rec-2', {
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane@example.com',
        phone: '555-1234',
      })

      const result = await executor.merge({ sourceRecords: [record1, record2] })

      expect(result.goldenRecord.phone).toBe('555-1234')
    })

    it('handles records with different field sets', async () => {
      const executor = new MergeExecutor<TestRecord>({
        defaultStrategy: 'preferNonNull',
      })

      const record1 = createSourceRecord('rec-1', {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
      })

      const record2 = createSourceRecord('rec-2', {
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane@example.com',
        phone: '555-1234',
        age: 30,
      })

      const result = await executor.merge({ sourceRecords: [record1, record2] })

      expect(result.goldenRecord.phone).toBe('555-1234')
      expect(result.goldenRecord.age).toBe(30)
    })

    it('handles arrays with union strategy', async () => {
      const executor = new MergeExecutor<TestRecord>({
        fieldStrategies: [{ field: 'addresses', strategy: 'union' }],
      })

      const record1 = createSourceRecord('rec-1', {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        addresses: ['123 Main St', '456 Oak Ave'],
      })

      const record2 = createSourceRecord('rec-2', {
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane@example.com',
        addresses: ['456 Oak Ave', '789 Pine Rd'],
      })

      const result = await executor.merge({ sourceRecords: [record1, record2] })

      expect(result.goldenRecord.addresses).toContain('123 Main St')
      expect(result.goldenRecord.addresses).toContain('456 Oak Ave')
      expect(result.goldenRecord.addresses).toContain('789 Pine Rd')
      // Union should deduplicate
      expect(
        result.goldenRecord.addresses?.filter((a) => a === '456 Oak Ave')
      ).toHaveLength(1)
    })

    it('handles arrays with concatenate strategy', async () => {
      const executor = new MergeExecutor<TestRecord>({
        fieldStrategies: [{ field: 'addresses', strategy: 'concatenate' }],
      })

      const record1 = createSourceRecord('rec-1', {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        addresses: ['123 Main St'],
      })

      const record2 = createSourceRecord('rec-2', {
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane@example.com',
        addresses: ['456 Oak Ave'],
      })

      const result = await executor.merge({ sourceRecords: [record1, record2] })

      expect(result.goldenRecord.addresses).toEqual([
        '123 Main St',
        '456 Oak Ave',
      ])
    })
  })

  describe('temporal strategies', () => {
    it('preferNewer uses record with latest timestamp', async () => {
      const executor = new MergeExecutor<TestRecord>({
        fieldStrategies: [{ field: 'email', strategy: 'preferNewer' }],
      })

      const record1 = createSourceRecord(
        'rec-1',
        {
          firstName: 'John',
          lastName: 'Doe',
          email: 'old@example.com',
        },
        { updatedAt: new Date('2024-01-01') }
      )

      const record2 = createSourceRecord(
        'rec-2',
        {
          firstName: 'Jane',
          lastName: 'Smith',
          email: 'new@example.com',
        },
        { updatedAt: new Date('2024-06-01') }
      )

      const result = await executor.merge({ sourceRecords: [record1, record2] })

      expect(result.goldenRecord.email).toBe('new@example.com')
    })

    it('preferOlder uses record with earliest timestamp', async () => {
      const executor = new MergeExecutor<TestRecord>({
        fieldStrategies: [{ field: 'email', strategy: 'preferOlder' }],
      })

      const record1 = createSourceRecord(
        'rec-1',
        {
          firstName: 'John',
          lastName: 'Doe',
          email: 'old@example.com',
        },
        { updatedAt: new Date('2024-01-01') }
      )

      const record2 = createSourceRecord(
        'rec-2',
        {
          firstName: 'Jane',
          lastName: 'Smith',
          email: 'new@example.com',
        },
        { updatedAt: new Date('2024-06-01') }
      )

      const result = await executor.merge({ sourceRecords: [record1, record2] })

      expect(result.goldenRecord.email).toBe('old@example.com')
    })
  })

  describe('numeric strategies', () => {
    it('uses average strategy for numeric fields', async () => {
      const executor = new MergeExecutor<TestRecord>({
        fieldStrategies: [{ field: 'age', strategy: 'average' }],
      })

      const record1 = createSourceRecord('rec-1', {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        age: 30,
      })

      const record2 = createSourceRecord('rec-2', {
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane@example.com',
        age: 40,
      })

      const result = await executor.merge({ sourceRecords: [record1, record2] })

      expect(result.goldenRecord.age).toBe(35)
    })

    it('uses sum strategy for numeric fields', async () => {
      const executor = new MergeExecutor<TestRecord>({
        fieldStrategies: [{ field: 'age', strategy: 'sum' }],
      })

      const record1 = createSourceRecord('rec-1', {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        age: 30,
      })

      const record2 = createSourceRecord('rec-2', {
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane@example.com',
        age: 40,
      })

      const result = await executor.merge({ sourceRecords: [record1, record2] })

      expect(result.goldenRecord.age).toBe(70)
    })

    it('uses min/max strategies for numeric fields', async () => {
      const executorMin = new MergeExecutor<TestRecord>({
        fieldStrategies: [{ field: 'age', strategy: 'min' }],
      })

      const executorMax = new MergeExecutor<TestRecord>({
        fieldStrategies: [{ field: 'age', strategy: 'max' }],
      })

      const records = [
        createSourceRecord('rec-1', {
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@example.com',
          age: 30,
        }),
        createSourceRecord('rec-2', {
          firstName: 'Jane',
          lastName: 'Smith',
          email: 'jane@example.com',
          age: 40,
        }),
      ]

      const resultMin = await executorMin.merge({ sourceRecords: records })
      const resultMax = await executorMax.merge({ sourceRecords: records })

      expect(resultMin.goldenRecord.age).toBe(30)
      expect(resultMax.goldenRecord.age).toBe(40)
    })
  })

  describe('custom strategies', () => {
    it('supports custom merge function', async () => {
      const executor = new MergeExecutor<TestRecord>({
        fieldStrategies: [
          {
            field: 'firstName',
            strategy: 'custom',
            customMerge: (values: unknown[]) => {
              // Custom logic: uppercase the longest value
              const strings = values.filter(
                (v) => typeof v === 'string'
              ) as string[]
              if (strings.length === 0) return undefined
              const longest = strings.reduce((a, b) =>
                a.length >= b.length ? a : b
              )
              return longest.toUpperCase()
            },
          },
        ],
      })

      const record1 = createSourceRecord('rec-1', {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
      })

      const record2 = createSourceRecord('rec-2', {
        firstName: 'Jonathan',
        lastName: 'Smith',
        email: 'jonathan@example.com',
      })

      const result = await executor.merge({ sourceRecords: [record1, record2] })

      expect(result.goldenRecord.firstName).toBe('JONATHAN')
    })
  })

  describe('statistics', () => {
    it('tracks fields from each source', async () => {
      const executor = new MergeExecutor<TestRecord>({
        defaultStrategy: 'preferFirst',
      })

      const record1 = createSourceRecord('rec-1', {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
      })

      const record2 = createSourceRecord('rec-2', {
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane@example.com',
      })

      const result = await executor.merge({ sourceRecords: [record1, record2] })

      expect(result.stats.fieldsFromEachSource).toBeDefined()
      expect(result.stats.fieldsFromEachSource['rec-1']).toBeDefined()
      expect(result.stats.fieldsFromEachSource['rec-2']).toBeDefined()
    })

    it('counts conflicts resolved', async () => {
      const executor = new MergeExecutor<TestRecord>({
        conflictResolution: 'useDefault',
        defaultStrategy: 'preferFirst',
      })

      const record1 = createSourceRecord('rec-1', {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
      })

      const record2 = createSourceRecord('rec-2', {
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane@example.com',
      })

      const result = await executor.merge({ sourceRecords: [record1, record2] })

      expect(result.stats.conflictsResolved).toBeGreaterThan(0)
    })

    it('counts conflicts deferred', async () => {
      const executor = new MergeExecutor<TestRecord>({
        conflictResolution: 'markConflict',
        defaultStrategy: 'preferFirst',
      })

      const record1 = createSourceRecord('rec-1', {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
      })

      const record2 = createSourceRecord('rec-2', {
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane@example.com',
      })

      const result = await executor.merge({ sourceRecords: [record1, record2] })

      expect(result.stats.conflictsDeferred).toBeGreaterThan(0)
    })

    it('tracks total fields merged', async () => {
      const executor = new MergeExecutor<TestRecord>({})

      const record1 = createSourceRecord('rec-1', {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
      })

      const record2 = createSourceRecord('rec-2', {
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane@example.com',
      })

      const result = await executor.merge({ sourceRecords: [record1, record2] })

      expect(result.stats.totalFields).toBeGreaterThanOrEqual(3)
    })

    it('tracks merge time', async () => {
      const executor = new MergeExecutor<TestRecord>({})

      const record1 = createSourceRecord('rec-1', {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
      })

      const record2 = createSourceRecord('rec-2', {
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane@example.com',
      })

      const result = await executor.merge({ sourceRecords: [record1, record2] })

      expect(result.stats.mergeTimeMs).toBeDefined()
      expect(result.stats.mergeTimeMs).toBeGreaterThanOrEqual(0)
    })
  })

  describe('performance', () => {
    it('merges 2 records in < 10ms', async () => {
      const executor = new MergeExecutor<TestRecord>({})

      const record1 = createSourceRecord('rec-1', {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
      })

      const record2 = createSourceRecord('rec-2', {
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane@example.com',
      })

      const start = performance.now()
      await executor.merge({ sourceRecords: [record1, record2] })
      const elapsed = performance.now() - start

      expect(elapsed).toBeLessThan(10)
    })

    it('merges 10 records in < 50ms', async () => {
      const executor = new MergeExecutor<TestRecord>({})

      const records = Array.from({ length: 10 }, (_, i) =>
        createSourceRecord(`rec-${i}`, {
          firstName: `First${i}`,
          lastName: `Last${i}`,
          email: `user${i}@example.com`,
        })
      )

      const start = performance.now()
      await executor.merge({ sourceRecords: records })
      const elapsed = performance.now() - start

      expect(elapsed).toBeLessThan(50)
    })

    it('merges 100 records in < 500ms', async () => {
      const executor = new MergeExecutor<TestRecord>({})

      const records = Array.from({ length: 100 }, (_, i) =>
        createSourceRecord(`rec-${i}`, {
          firstName: `First${i}`,
          lastName: `Last${i}`,
          email: `user${i}@example.com`,
        })
      )

      const start = performance.now()
      await executor.merge({ sourceRecords: records })
      const elapsed = performance.now() - start

      expect(elapsed).toBeLessThan(500)
    })
  })
})
