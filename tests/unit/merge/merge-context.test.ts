import { describe, it, expect, beforeEach } from 'vitest'
import {
  createMergeContext,
  recordFieldProvenance,
  recordConflict,
  setCurrentField,
  calculateStats,
} from '../../../src/merge/merge-context.js'
import type {
  MergeConfig,
  SourceRecord,
  FieldProvenance,
  MergeConflict,
} from '../../../src/merge/types.js'

interface TestRecord {
  firstName: string
  lastName: string
  email: string
}

function createTestConfig(overrides?: Partial<MergeConfig>): MergeConfig {
  return {
    fieldStrategies: [],
    defaultStrategy: 'preferNonNull',
    trackProvenance: true,
    conflictResolution: 'useDefault',
    ...overrides,
  }
}

function createSourceRecord(
  id: string,
  record: TestRecord
): SourceRecord<TestRecord> {
  return {
    id,
    record,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  }
}

describe('merge-context', () => {
  describe('createMergeContext', () => {
    it('creates context with correct initial state', () => {
      const config = createTestConfig()
      const sourceRecords = [
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
      ]

      const context = createMergeContext(config, sourceRecords)

      expect(context.config).toBe(config)
      expect(context.sourceRecords).toBe(sourceRecords)
      expect(context.currentField).toBeUndefined()
      expect(context.fieldSources).toEqual({})
      expect(context.conflicts).toEqual([])
      expect(context.startTime).toBeInstanceOf(Date)
      expect(context.trackProvenance).toBe(true)
    })

    it('inherits trackProvenance from config', () => {
      const config = createTestConfig({ trackProvenance: false })
      const sourceRecords = [
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
      ]

      const context = createMergeContext(config, sourceRecords)

      expect(context.trackProvenance).toBe(false)
    })
  })

  describe('recordFieldProvenance', () => {
    it('records provenance when tracking is enabled', () => {
      const config = createTestConfig({ trackProvenance: true })
      const sourceRecords = [
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
      ]
      const context = createMergeContext(config, sourceRecords)

      const provenance: FieldProvenance = {
        sourceRecordId: 'rec-1',
        strategyApplied: 'preferFirst',
        allValues: [
          { recordId: 'rec-1', value: 'John' },
          { recordId: 'rec-2', value: 'Jane' },
        ],
        hadConflict: false,
      }

      recordFieldProvenance(context, 'firstName', provenance)

      expect(context.fieldSources.firstName).toBe(provenance)
    })

    it('does not record provenance when tracking is disabled', () => {
      const config = createTestConfig({ trackProvenance: false })
      const sourceRecords = [
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
      ]
      const context = createMergeContext(config, sourceRecords)

      const provenance: FieldProvenance = {
        sourceRecordId: 'rec-1',
        strategyApplied: 'preferFirst',
        allValues: [
          { recordId: 'rec-1', value: 'John' },
          { recordId: 'rec-2', value: 'Jane' },
        ],
        hadConflict: false,
      }

      recordFieldProvenance(context, 'firstName', provenance)

      expect(context.fieldSources.firstName).toBeUndefined()
    })

    it('records multiple field provenances', () => {
      const config = createTestConfig()
      const sourceRecords = [
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
      ]
      const context = createMergeContext(config, sourceRecords)

      const prov1: FieldProvenance = {
        sourceRecordId: 'rec-1',
        strategyApplied: 'preferFirst',
        allValues: [
          { recordId: 'rec-1', value: 'John' },
          { recordId: 'rec-2', value: 'Jane' },
        ],
        hadConflict: false,
      }

      const prov2: FieldProvenance = {
        sourceRecordId: 'rec-2',
        strategyApplied: 'preferLast',
        allValues: [
          { recordId: 'rec-1', value: 'Doe' },
          { recordId: 'rec-2', value: 'Smith' },
        ],
        hadConflict: false,
      }

      recordFieldProvenance(context, 'firstName', prov1)
      recordFieldProvenance(context, 'lastName', prov2)

      expect(Object.keys(context.fieldSources)).toHaveLength(2)
      expect(context.fieldSources.firstName.sourceRecordId).toBe('rec-1')
      expect(context.fieldSources.lastName.sourceRecordId).toBe('rec-2')
    })
  })

  describe('recordConflict', () => {
    it('records a conflict', () => {
      const config = createTestConfig()
      const sourceRecords = [
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
      ]
      const context = createMergeContext(config, sourceRecords)

      const conflict: MergeConflict = {
        field: 'firstName',
        values: [
          { recordId: 'rec-1', value: 'John' },
          { recordId: 'rec-2', value: 'Jane' },
        ],
        resolution: 'auto',
        resolvedValue: 'John',
        resolutionReason: 'Used preferFirst strategy',
      }

      recordConflict(context, conflict)

      expect(context.conflicts).toHaveLength(1)
      expect(context.conflicts[0]).toBe(conflict)
    })

    it('records multiple conflicts', () => {
      const config = createTestConfig()
      const sourceRecords = [
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
      ]
      const context = createMergeContext(config, sourceRecords)

      const conflict1: MergeConflict = {
        field: 'firstName',
        values: [
          { recordId: 'rec-1', value: 'John' },
          { recordId: 'rec-2', value: 'Jane' },
        ],
        resolution: 'auto',
        resolvedValue: 'John',
      }

      const conflict2: MergeConflict = {
        field: 'lastName',
        values: [
          { recordId: 'rec-1', value: 'Doe' },
          { recordId: 'rec-2', value: 'Smith' },
        ],
        resolution: 'deferred',
      }

      recordConflict(context, conflict1)
      recordConflict(context, conflict2)

      expect(context.conflicts).toHaveLength(2)
    })
  })

  describe('setCurrentField', () => {
    it('sets the current field', () => {
      const config = createTestConfig()
      const sourceRecords = [
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
      ]
      const context = createMergeContext(config, sourceRecords)

      setCurrentField(context, 'firstName')
      expect(context.currentField).toBe('firstName')

      setCurrentField(context, 'lastName')
      expect(context.currentField).toBe('lastName')
    })

    it('clears the current field', () => {
      const config = createTestConfig()
      const sourceRecords = [
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
      ]
      const context = createMergeContext(config, sourceRecords)

      setCurrentField(context, 'firstName')
      setCurrentField(context, undefined)

      expect(context.currentField).toBeUndefined()
    })
  })

  describe('calculateStats', () => {
    it('calculates basic stats', () => {
      const config = createTestConfig()
      const sourceRecords = [
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
      ]
      const context = createMergeContext(config, sourceRecords)

      const stats = calculateStats(context)

      expect(stats.fieldsFromEachSource).toEqual({
        'rec-1': 0,
        'rec-2': 0,
      })
      expect(stats.conflictsResolved).toBe(0)
      expect(stats.conflictsDeferred).toBe(0)
      expect(stats.totalFields).toBe(0)
      expect(stats.mergeTimeMs).toBeDefined()
      expect(stats.mergeTimeMs).toBeGreaterThanOrEqual(0)
    })

    it('counts fields from each source', () => {
      const config = createTestConfig()
      const sourceRecords = [
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
      ]
      const context = createMergeContext(config, sourceRecords)

      // Simulate field provenance records
      recordFieldProvenance(context, 'firstName', {
        sourceRecordId: 'rec-1',
        strategyApplied: 'preferFirst',
        allValues: [],
        hadConflict: false,
      })
      recordFieldProvenance(context, 'lastName', {
        sourceRecordId: 'rec-2',
        strategyApplied: 'preferLast',
        allValues: [],
        hadConflict: false,
      })
      recordFieldProvenance(context, 'email', {
        sourceRecordId: 'rec-1',
        strategyApplied: 'preferFirst',
        allValues: [],
        hadConflict: false,
      })

      const stats = calculateStats(context)

      expect(stats.fieldsFromEachSource['rec-1']).toBe(2)
      expect(stats.fieldsFromEachSource['rec-2']).toBe(1)
      expect(stats.totalFields).toBe(3)
    })

    it('counts resolved and deferred conflicts', () => {
      const config = createTestConfig()
      const sourceRecords = [
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
      ]
      const context = createMergeContext(config, sourceRecords)

      recordConflict(context, {
        field: 'firstName',
        values: [],
        resolution: 'auto',
        resolvedValue: 'John',
      })
      recordConflict(context, {
        field: 'lastName',
        values: [],
        resolution: 'deferred',
      })
      recordConflict(context, {
        field: 'email',
        values: [],
        resolution: 'manual',
        resolvedValue: 'john@example.com',
      })

      const stats = calculateStats(context)

      expect(stats.conflictsResolved).toBe(2) // auto + manual
      expect(stats.conflictsDeferred).toBe(1)
    })

    it('tracks merge time', async () => {
      const config = createTestConfig()
      const sourceRecords = [
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
      ]
      const context = createMergeContext(config, sourceRecords)

      // Simulate some processing time
      await new Promise((resolve) => setTimeout(resolve, 5))

      const stats = calculateStats(context)

      expect(stats.mergeTimeMs).toBeGreaterThanOrEqual(5)
    })
  })
})
