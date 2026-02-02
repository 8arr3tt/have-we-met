import { describe, it, expect, beforeEach } from 'vitest'
import {
  ProvenanceTracker,
  createProvenanceTracker,
} from '../../../../src/merge/provenance/provenance-tracker.js'
import type {
  SourceRecord,
  MergeConfig,
  MergeConflict,
} from '../../../../src/merge/types.js'

interface TestRecord {
  firstName: string
  lastName: string
  email: string
}

function createSourceRecord(
  id: string,
  record: TestRecord,
  options?: { createdAt?: Date; updatedAt?: Date }
): SourceRecord<TestRecord> {
  return {
    id,
    record,
    createdAt: options?.createdAt ?? new Date('2024-01-01'),
    updatedAt: options?.updatedAt ?? new Date('2024-01-01'),
  }
}

function createMergeConfig(overrides?: Partial<MergeConfig>): MergeConfig {
  return {
    fieldStrategies: [],
    defaultStrategy: 'preferNonNull',
    trackProvenance: true,
    conflictResolution: 'useDefault',
    ...overrides,
  }
}

describe('ProvenanceTracker', () => {
  let tracker: ProvenanceTracker<TestRecord>
  let sourceRecords: SourceRecord<TestRecord>[]
  let config: MergeConfig

  beforeEach(() => {
    tracker = new ProvenanceTracker<TestRecord>()
    sourceRecords = [
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
    config = createMergeConfig()
  })

  describe('startMerge', () => {
    it('starts tracking a merge operation', () => {
      tracker.startMerge(sourceRecords, config)

      expect(tracker.isInProgress()).toBe(true)
    })

    it('accepts optional mergedBy and queueItemId', () => {
      tracker.startMerge(sourceRecords, config, {
        mergedBy: 'user-123',
        queueItemId: 'queue-456',
      })

      const provenance = tracker.finalize('golden-1')
      expect(provenance.mergedBy).toBe('user-123')
      expect(provenance.queueItemId).toBe('queue-456')
    })

    it('throws if merge already in progress', () => {
      tracker.startMerge(sourceRecords, config)

      expect(() => tracker.startMerge(sourceRecords, config)).toThrow(
        'Cannot start a new merge while one is in progress'
      )
    })
  })

  describe('recordFieldSelection', () => {
    beforeEach(() => {
      tracker.startMerge(sourceRecords, config)
    })

    it('tracks field selections during merge', () => {
      const allValues = [
        { recordId: 'rec-1', value: 'John' },
        { recordId: 'rec-2', value: 'Jane' },
      ]

      tracker.recordFieldSelection(
        'firstName',
        'rec-1',
        'preferFirst',
        allValues
      )

      const fieldProv = tracker.getFieldProvenance('firstName')
      expect(fieldProv).toBeDefined()
      expect(fieldProv?.sourceRecordId).toBe('rec-1')
      expect(fieldProv?.strategyApplied).toBe('preferFirst')
    })

    it('records which strategy was applied', () => {
      tracker.recordFieldSelection('email', 'rec-2', 'preferNewer', [
        { recordId: 'rec-1', value: 'john@example.com' },
        { recordId: 'rec-2', value: 'jane@example.com' },
      ])

      const fieldProv = tracker.getFieldProvenance('email')
      expect(fieldProv?.strategyApplied).toBe('preferNewer')
    })

    it('tracks all values considered', () => {
      const allValues = [
        { recordId: 'rec-1', value: 'John' },
        { recordId: 'rec-2', value: 'Jane' },
      ]

      tracker.recordFieldSelection(
        'firstName',
        'rec-1',
        'preferLonger',
        allValues
      )

      const fieldProv = tracker.getFieldProvenance('firstName')
      expect(fieldProv?.allValues).toHaveLength(2)
      expect(fieldProv?.allValues).toEqual(allValues)
    })

    it('records conflicts and resolutions', () => {
      tracker.recordFieldSelection(
        'firstName',
        'rec-1',
        'preferFirst',
        [
          { recordId: 'rec-1', value: 'John' },
          { recordId: 'rec-2', value: 'Jane' },
        ],
        true, // hadConflict
        'Auto-resolved using preferFirst strategy'
      )

      const fieldProv = tracker.getFieldProvenance('firstName')
      expect(fieldProv?.hadConflict).toBe(true)
      expect(fieldProv?.conflictResolution).toBe(
        'Auto-resolved using preferFirst strategy'
      )
    })

    it('throws if no merge in progress', () => {
      const newTracker = new ProvenanceTracker<TestRecord>()

      expect(() =>
        newTracker.recordFieldSelection('firstName', 'rec-1', 'preferFirst', [])
      ).toThrow('No merge in progress')
    })
  })

  describe('recordConflict', () => {
    beforeEach(() => {
      tracker.startMerge(sourceRecords, config)
    })

    it('records conflicts during merge', () => {
      const conflict: MergeConflict = {
        field: 'firstName',
        values: [
          { recordId: 'rec-1', value: 'John' },
          { recordId: 'rec-2', value: 'Jane' },
        ],
        resolution: 'auto',
        resolvedValue: 'John',
        resolutionReason: 'Auto-resolved using preferFirst',
      }

      tracker.recordConflict(conflict)

      const conflicts = tracker.getConflicts()
      expect(conflicts).toHaveLength(1)
      expect(conflicts[0]).toEqual(conflict)
    })

    it('records multiple conflicts', () => {
      tracker.recordConflict({
        field: 'firstName',
        values: [
          { recordId: 'rec-1', value: 'John' },
          { recordId: 'rec-2', value: 'Jane' },
        ],
        resolution: 'auto',
        resolvedValue: 'John',
      })

      tracker.recordConflict({
        field: 'lastName',
        values: [
          { recordId: 'rec-1', value: 'Doe' },
          { recordId: 'rec-2', value: 'Smith' },
        ],
        resolution: 'deferred',
      })

      const conflicts = tracker.getConflicts()
      expect(conflicts).toHaveLength(2)
    })

    it('throws if no merge in progress', () => {
      const newTracker = new ProvenanceTracker<TestRecord>()

      expect(() =>
        newTracker.recordConflict({
          field: 'firstName',
          values: [],
          resolution: 'auto',
          resolvedValue: 'test',
        })
      ).toThrow('No merge in progress')
    })
  })

  describe('updateFieldSelection', () => {
    beforeEach(() => {
      tracker.startMerge(sourceRecords, config)
      tracker.recordFieldSelection('firstName', 'rec-1', 'preferFirst', [
        { recordId: 'rec-1', value: 'John' },
        { recordId: 'rec-2', value: 'Jane' },
      ])
    })

    it('updates existing field selection', () => {
      tracker.updateFieldSelection('firstName', {
        hadConflict: true,
        conflictResolution: 'Manual override',
      })

      const fieldProv = tracker.getFieldProvenance('firstName')
      expect(fieldProv?.hadConflict).toBe(true)
      expect(fieldProv?.conflictResolution).toBe('Manual override')
      // Original values should be preserved
      expect(fieldProv?.sourceRecordId).toBe('rec-1')
    })

    it('throws if field not previously recorded', () => {
      expect(() =>
        tracker.updateFieldSelection('nonexistent', { hadConflict: true })
      ).toThrow("Field 'nonexistent' has not been recorded yet")
    })
  })

  describe('finalize', () => {
    beforeEach(() => {
      tracker.startMerge(sourceRecords, config, {
        mergedBy: 'user-123',
        queueItemId: 'queue-456',
      })

      tracker.recordFieldSelection('firstName', 'rec-1', 'preferLonger', [
        { recordId: 'rec-1', value: 'John' },
        { recordId: 'rec-2', value: 'Jane' },
      ])

      tracker.recordFieldSelection('lastName', 'rec-2', 'preferFirst', [
        { recordId: 'rec-1', value: 'Doe' },
        { recordId: 'rec-2', value: 'Smith' },
      ])

      tracker.recordFieldSelection('email', 'rec-1', 'preferNonNull', [
        { recordId: 'rec-1', value: 'john@example.com' },
        { recordId: 'rec-2', value: 'jane@example.com' },
      ])
    })

    it('creates complete provenance object', () => {
      const provenance = tracker.finalize('golden-123')

      expect(provenance).toBeDefined()
      expect(provenance.goldenRecordId).toBe('golden-123')
      expect(provenance.sourceRecordIds).toEqual(['rec-1', 'rec-2'])
      expect(provenance.mergedBy).toBe('user-123')
      expect(provenance.queueItemId).toBe('queue-456')
      expect(provenance.mergedAt).toBeInstanceOf(Date)
    })

    it('includes all field sources', () => {
      const provenance = tracker.finalize('golden-123')

      expect(provenance.fieldSources).toBeDefined()
      expect(Object.keys(provenance.fieldSources)).toContain('firstName')
      expect(Object.keys(provenance.fieldSources)).toContain('lastName')
      expect(Object.keys(provenance.fieldSources)).toContain('email')
    })

    it('includes strategy configuration used', () => {
      const provenance = tracker.finalize('golden-123')

      expect(provenance.strategyUsed).toBeDefined()
      expect(provenance.strategyUsed.defaultStrategy).toBe('preferNonNull')
    })

    it('resets tracker state after finalize', () => {
      tracker.finalize('golden-123')

      expect(tracker.isInProgress()).toBe(false)
    })

    it('throws if no merge in progress', () => {
      const newTracker = new ProvenanceTracker<TestRecord>()

      expect(() => newTracker.finalize('golden-123')).toThrow(
        'No merge in progress'
      )
    })
  })

  describe('cancel', () => {
    it('cancels the current merge without creating provenance', () => {
      tracker.startMerge(sourceRecords, config)
      tracker.recordFieldSelection('firstName', 'rec-1', 'preferFirst', [])

      tracker.cancel()

      expect(tracker.isInProgress()).toBe(false)
    })

    it('allows starting a new merge after cancel', () => {
      tracker.startMerge(sourceRecords, config)
      tracker.cancel()

      expect(() => tracker.startMerge(sourceRecords, config)).not.toThrow()
    })
  })

  describe('getStats', () => {
    it('returns null if no merge in progress', () => {
      expect(tracker.getStats()).toBeNull()
    })

    it('returns current statistics', () => {
      tracker.startMerge(sourceRecords, config)
      tracker.recordFieldSelection('firstName', 'rec-1', 'preferFirst', [])
      tracker.recordFieldSelection('lastName', 'rec-2', 'preferLast', [])
      tracker.recordConflict({
        field: 'email',
        values: [],
        resolution: 'auto',
        resolvedValue: 'test',
      })

      const stats = tracker.getStats()

      expect(stats).not.toBeNull()
      expect(stats?.fieldsTracked).toBe(2)
      expect(stats?.conflictsRecorded).toBe(1)
      expect(stats?.sourceRecordCount).toBe(2)
      expect(stats?.elapsedMs).toBeGreaterThanOrEqual(0)
    })
  })

  describe('getContributionsBySource', () => {
    it('returns empty map if no merge in progress', () => {
      const contributions = tracker.getContributionsBySource()
      expect(contributions.size).toBe(0)
    })

    it('returns field contributions by source record', () => {
      tracker.startMerge(sourceRecords, config)
      tracker.recordFieldSelection('firstName', 'rec-1', 'preferFirst', [])
      tracker.recordFieldSelection('lastName', 'rec-1', 'preferFirst', [])
      tracker.recordFieldSelection('email', 'rec-2', 'preferLast', [])

      const contributions = tracker.getContributionsBySource()

      expect(contributions.get('rec-1')).toBe(2)
      expect(contributions.get('rec-2')).toBe(1)
    })

    it('includes all source records even with zero contributions', () => {
      tracker.startMerge(sourceRecords, config)
      tracker.recordFieldSelection('firstName', 'rec-1', 'preferFirst', [])

      const contributions = tracker.getContributionsBySource()

      expect(contributions.has('rec-1')).toBe(true)
      expect(contributions.has('rec-2')).toBe(true)
      expect(contributions.get('rec-1')).toBe(1)
      expect(contributions.get('rec-2')).toBe(0)
    })
  })

  describe('isInProgress', () => {
    it('returns false initially', () => {
      expect(tracker.isInProgress()).toBe(false)
    })

    it('returns true after startMerge', () => {
      tracker.startMerge(sourceRecords, config)
      expect(tracker.isInProgress()).toBe(true)
    })

    it('returns false after finalize', () => {
      tracker.startMerge(sourceRecords, config)
      tracker.finalize('golden-123')
      expect(tracker.isInProgress()).toBe(false)
    })

    it('returns false after cancel', () => {
      tracker.startMerge(sourceRecords, config)
      tracker.cancel()
      expect(tracker.isInProgress()).toBe(false)
    })
  })
})

describe('createProvenanceTracker', () => {
  it('creates a new ProvenanceTracker instance', () => {
    const tracker = createProvenanceTracker<TestRecord>()

    expect(tracker).toBeInstanceOf(ProvenanceTracker)
    expect(tracker.isInProgress()).toBe(false)
  })
})
