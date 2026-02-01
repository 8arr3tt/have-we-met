import { describe, it, expect } from 'vitest'
import {
  MERGE_STRATEGIES,
  NUMERIC_STRATEGIES,
  ARRAY_STRATEGIES,
  TEMPORAL_STRATEGIES,
  STRING_STRATEGIES,
  DEFAULT_MERGE_CONFIG,
} from '../../../src/merge/types.js'
import type {
  MergeStrategy,
  SourceRecord,
  FieldMergeConfig,
  MergeConfig,
  Provenance,
  MergeResult,
  MergeConflict,
  FieldProvenance,
} from '../../../src/merge/types.js'

describe('Merge Types', () => {
  describe('MergeStrategy', () => {
    it('includes all built-in strategies', () => {
      expect(MERGE_STRATEGIES).toContain('preferFirst')
      expect(MERGE_STRATEGIES).toContain('preferLast')
      expect(MERGE_STRATEGIES).toContain('preferNewer')
      expect(MERGE_STRATEGIES).toContain('preferOlder')
      expect(MERGE_STRATEGIES).toContain('preferNonNull')
      expect(MERGE_STRATEGIES).toContain('preferLonger')
      expect(MERGE_STRATEGIES).toContain('preferShorter')
      expect(MERGE_STRATEGIES).toContain('concatenate')
      expect(MERGE_STRATEGIES).toContain('union')
      expect(MERGE_STRATEGIES).toContain('mostFrequent')
      expect(MERGE_STRATEGIES).toContain('average')
      expect(MERGE_STRATEGIES).toContain('sum')
      expect(MERGE_STRATEGIES).toContain('min')
      expect(MERGE_STRATEGIES).toContain('max')
      expect(MERGE_STRATEGIES).toContain('custom')
    })

    it('has 15 built-in strategies', () => {
      expect(MERGE_STRATEGIES).toHaveLength(15)
    })

    it('categorizes numeric strategies correctly', () => {
      expect(NUMERIC_STRATEGIES).toContain('average')
      expect(NUMERIC_STRATEGIES).toContain('sum')
      expect(NUMERIC_STRATEGIES).toContain('min')
      expect(NUMERIC_STRATEGIES).toContain('max')
      expect(NUMERIC_STRATEGIES).toHaveLength(4)
    })

    it('categorizes array strategies correctly', () => {
      expect(ARRAY_STRATEGIES).toContain('concatenate')
      expect(ARRAY_STRATEGIES).toContain('union')
      expect(ARRAY_STRATEGIES).toHaveLength(2)
    })

    it('categorizes temporal strategies correctly', () => {
      expect(TEMPORAL_STRATEGIES).toContain('preferNewer')
      expect(TEMPORAL_STRATEGIES).toContain('preferOlder')
      expect(TEMPORAL_STRATEGIES).toHaveLength(2)
    })

    it('categorizes string strategies correctly', () => {
      expect(STRING_STRATEGIES).toContain('preferLonger')
      expect(STRING_STRATEGIES).toContain('preferShorter')
      expect(STRING_STRATEGIES).toHaveLength(2)
    })
  })

  describe('SourceRecord', () => {
    it('allows creating a valid source record', () => {
      const record: SourceRecord<{ name: string }> = {
        id: 'rec-001',
        record: { name: 'John' },
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-02'),
      }

      expect(record.id).toBe('rec-001')
      expect(record.record.name).toBe('John')
      expect(record.createdAt).toBeInstanceOf(Date)
      expect(record.updatedAt).toBeInstanceOf(Date)
    })
  })

  describe('FieldMergeConfig', () => {
    it('supports all required options', () => {
      const config: FieldMergeConfig = {
        field: 'email',
        strategy: 'preferNewer',
        options: {
          dateField: 'updatedAt',
          nullHandling: 'skip',
        },
      }

      expect(config.field).toBe('email')
      expect(config.strategy).toBe('preferNewer')
      expect(config.options?.dateField).toBe('updatedAt')
      expect(config.options?.nullHandling).toBe('skip')
    })

    it('supports custom merge function', () => {
      const customFn = (values: string[]) => values.join(', ')
      const config: FieldMergeConfig = {
        field: 'tags',
        strategy: 'custom',
        customMerge: customFn,
      }

      expect(config.strategy).toBe('custom')
      expect(config.customMerge).toBe(customFn)
    })

    it('supports dot notation for nested fields', () => {
      const config: FieldMergeConfig = {
        field: 'address.city',
        strategy: 'preferNonNull',
      }

      expect(config.field).toBe('address.city')
    })
  })

  describe('MergeConfig', () => {
    it('has sensible defaults', () => {
      expect(DEFAULT_MERGE_CONFIG.defaultStrategy).toBe('preferNonNull')
      expect(DEFAULT_MERGE_CONFIG.trackProvenance).toBe(true)
      expect(DEFAULT_MERGE_CONFIG.conflictResolution).toBe('useDefault')
    })

    it('allows full configuration', () => {
      const config: MergeConfig = {
        fieldStrategies: [
          { field: 'firstName', strategy: 'preferLonger' },
          { field: 'email', strategy: 'preferNewer' },
        ],
        defaultStrategy: 'preferFirst',
        timestampField: 'updatedAt',
        trackProvenance: true,
        conflictResolution: 'error',
      }

      expect(config.fieldStrategies).toHaveLength(2)
      expect(config.defaultStrategy).toBe('preferFirst')
      expect(config.timestampField).toBe('updatedAt')
      expect(config.trackProvenance).toBe(true)
      expect(config.conflictResolution).toBe('error')
    })
  })

  describe('Provenance', () => {
    it('tracks field-level attribution', () => {
      const provenance: Provenance = {
        goldenRecordId: 'golden-001',
        sourceRecordIds: ['rec-001', 'rec-002'],
        mergedAt: new Date(),
        mergedBy: 'user-123',
        queueItemId: 'queue-456',
        fieldSources: {
          firstName: {
            sourceRecordId: 'rec-001',
            strategyApplied: 'preferLonger',
            allValues: [
              { recordId: 'rec-001', value: 'Jonathan' },
              { recordId: 'rec-002', value: 'Jon' },
            ],
            hadConflict: false,
          },
        },
        strategyUsed: {
          fieldStrategies: [],
          defaultStrategy: 'preferNonNull',
          trackProvenance: true,
          conflictResolution: 'useDefault',
        },
      }

      expect(provenance.goldenRecordId).toBe('golden-001')
      expect(provenance.sourceRecordIds).toHaveLength(2)
      expect(provenance.fieldSources.firstName.sourceRecordId).toBe('rec-001')
      expect(provenance.fieldSources.firstName.allValues).toHaveLength(2)
    })

    it('supports unmerge tracking', () => {
      const provenance: Provenance = {
        goldenRecordId: 'golden-001',
        sourceRecordIds: ['rec-001', 'rec-002'],
        mergedAt: new Date('2024-01-01'),
        fieldSources: {},
        strategyUsed: {
          fieldStrategies: [],
          defaultStrategy: 'preferNonNull',
          trackProvenance: true,
          conflictResolution: 'useDefault',
        },
        unmerged: true,
        unmergedAt: new Date('2024-01-15'),
        unmergedBy: 'admin',
        unmergeReason: 'Incorrectly merged records',
      }

      expect(provenance.unmerged).toBe(true)
      expect(provenance.unmergedAt).toBeInstanceOf(Date)
      expect(provenance.unmergedBy).toBe('admin')
      expect(provenance.unmergeReason).toBe('Incorrectly merged records')
    })
  })

  describe('MergeResult', () => {
    it('contains all required information', () => {
      const result: MergeResult<{ name: string; email: string }> = {
        goldenRecord: { name: 'John Doe', email: 'john@example.com' },
        goldenRecordId: 'golden-001',
        provenance: {
          goldenRecordId: 'golden-001',
          sourceRecordIds: ['rec-001', 'rec-002'],
          mergedAt: new Date(),
          fieldSources: {},
          strategyUsed: {
            fieldStrategies: [],
            defaultStrategy: 'preferNonNull',
            trackProvenance: true,
            conflictResolution: 'useDefault',
          },
        },
        sourceRecords: [
          {
            id: 'rec-001',
            record: { name: 'John', email: 'john@example.com' },
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          {
            id: 'rec-002',
            record: { name: 'John Doe', email: '' },
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        conflicts: [],
        stats: {
          fieldsFromEachSource: { 'rec-001': 1, 'rec-002': 1 },
          conflictsResolved: 0,
          conflictsDeferred: 0,
          totalFields: 2,
        },
      }

      expect(result.goldenRecord.name).toBe('John Doe')
      expect(result.goldenRecord.email).toBe('john@example.com')
      expect(result.goldenRecordId).toBe('golden-001')
      expect(result.sourceRecords).toHaveLength(2)
      expect(result.conflicts).toHaveLength(0)
      expect(result.stats.totalFields).toBe(2)
    })
  })

  describe('MergeConflict', () => {
    it('captures conflict details', () => {
      const conflict: MergeConflict = {
        field: 'status',
        values: [
          { recordId: 'rec-001', value: 'active' },
          { recordId: 'rec-002', value: 'inactive' },
        ],
        resolution: 'auto',
        resolvedValue: 'active',
        resolutionReason: 'Used preferFirst strategy',
      }

      expect(conflict.field).toBe('status')
      expect(conflict.values).toHaveLength(2)
      expect(conflict.resolution).toBe('auto')
      expect(conflict.resolvedValue).toBe('active')
    })

    it('supports deferred resolution', () => {
      const conflict: MergeConflict = {
        field: 'category',
        values: [
          { recordId: 'rec-001', value: 'A' },
          { recordId: 'rec-002', value: 'B' },
        ],
        resolution: 'deferred',
      }

      expect(conflict.resolution).toBe('deferred')
      expect(conflict.resolvedValue).toBeUndefined()
    })
  })

  describe('FieldProvenance', () => {
    it('tracks all values from source records', () => {
      const fieldProv: FieldProvenance = {
        sourceRecordId: 'rec-002',
        strategyApplied: 'preferNewer',
        allValues: [
          { recordId: 'rec-001', value: 'old@email.com' },
          { recordId: 'rec-002', value: 'new@email.com' },
          { recordId: 'rec-003', value: 'newest@email.com' },
        ],
        hadConflict: false,
      }

      expect(fieldProv.sourceRecordId).toBe('rec-002')
      expect(fieldProv.strategyApplied).toBe('preferNewer')
      expect(fieldProv.allValues).toHaveLength(3)
      expect(fieldProv.hadConflict).toBe(false)
    })

    it('includes conflict resolution details', () => {
      const fieldProv: FieldProvenance = {
        sourceRecordId: 'rec-001',
        strategyApplied: 'preferFirst',
        allValues: [
          { recordId: 'rec-001', value: 'value1' },
          { recordId: 'rec-002', value: 'value2' },
        ],
        hadConflict: true,
        conflictResolution: 'Used default strategy (preferFirst) due to conflicting values',
      }

      expect(fieldProv.hadConflict).toBe(true)
      expect(fieldProv.conflictResolution).toContain('preferFirst')
    })
  })
})
