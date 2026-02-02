import { describe, it, expect, beforeEach } from 'vitest'
import {
  InMemoryProvenanceStore,
  createInMemoryProvenanceStore,
} from '../../../../src/merge/provenance/provenance-store.js'
import type { Provenance, MergeConfig } from '../../../../src/merge/types.js'

function createMergeConfig(): MergeConfig {
  return {
    fieldStrategies: [],
    defaultStrategy: 'preferNonNull',
    trackProvenance: true,
    conflictResolution: 'useDefault',
  }
}

function createProvenance(
  goldenRecordId: string,
  sourceRecordIds: string[],
  overrides?: Partial<Provenance>
): Provenance {
  return {
    goldenRecordId,
    sourceRecordIds,
    mergedAt: new Date('2024-06-15T10:00:00Z'),
    fieldSources: {
      firstName: {
        sourceRecordId: sourceRecordIds[0],
        strategyApplied: 'preferFirst',
        allValues: sourceRecordIds.map((id) => ({
          recordId: id,
          value: 'Test',
        })),
        hadConflict: false,
      },
    },
    strategyUsed: createMergeConfig(),
    ...overrides,
  }
}

describe('InMemoryProvenanceStore', () => {
  let store: InMemoryProvenanceStore

  beforeEach(() => {
    store = new InMemoryProvenanceStore()
  })

  describe('save', () => {
    it('saves provenance to database', async () => {
      const provenance = createProvenance('golden-1', ['rec-1', 'rec-2'])

      await store.save(provenance)

      const retrieved = await store.get('golden-1')
      expect(retrieved).toEqual(provenance)
    })

    it('updates existing provenance', async () => {
      const provenance1 = createProvenance('golden-1', ['rec-1', 'rec-2'])
      const provenance2 = createProvenance(
        'golden-1',
        ['rec-1', 'rec-2', 'rec-3'],
        {
          mergedBy: 'user-updated',
        }
      )

      await store.save(provenance1)
      await store.save(provenance2)

      const retrieved = await store.get('golden-1')
      expect(retrieved?.sourceRecordIds).toHaveLength(3)
      expect(retrieved?.mergedBy).toBe('user-updated')
    })

    it('indexes source record IDs', async () => {
      const provenance = createProvenance('golden-1', ['rec-1', 'rec-2'])

      await store.save(provenance)

      const goldenIds = await store.findGoldenRecordsBySource('rec-1')
      expect(goldenIds).toContain('golden-1')
    })
  })

  describe('get', () => {
    it('retrieves provenance by golden record ID', async () => {
      const provenance = createProvenance('golden-1', ['rec-1', 'rec-2'], {
        mergedBy: 'user-123',
      })
      await store.save(provenance)

      const retrieved = await store.get('golden-1')

      expect(retrieved).toEqual(provenance)
    })

    it('returns null for non-existent golden record', async () => {
      const retrieved = await store.get('non-existent')

      expect(retrieved).toBeNull()
    })

    it('returns a copy of the provenance (immutability)', async () => {
      const provenance = createProvenance('golden-1', ['rec-1', 'rec-2'])
      await store.save(provenance)

      const retrieved1 = await store.get('golden-1')
      const retrieved2 = await store.get('golden-1')

      expect(retrieved1).toEqual(retrieved2)
      expect(retrieved1).not.toBe(retrieved2) // Different object references
    })
  })

  describe('getBySourceId', () => {
    beforeEach(async () => {
      await store.save(
        createProvenance('golden-1', ['rec-1', 'rec-2'], {
          mergedAt: new Date('2024-06-15T10:00:00Z'),
        })
      )
      await store.save(
        createProvenance('golden-2', ['rec-2', 'rec-3'], {
          mergedAt: new Date('2024-06-16T10:00:00Z'),
        })
      )
      await store.save(
        createProvenance('golden-3', ['rec-3', 'rec-4'], {
          mergedAt: new Date('2024-06-17T10:00:00Z'),
        })
      )
    })

    it('finds provenance by source record ID', async () => {
      const results = await store.getBySourceId('rec-2')

      expect(results).toHaveLength(2)
      const goldenIds = results.map((p) => p.goldenRecordId)
      expect(goldenIds).toContain('golden-1')
      expect(goldenIds).toContain('golden-2')
    })

    it('returns empty array for non-existent source', async () => {
      const results = await store.getBySourceId('non-existent')

      expect(results).toEqual([])
    })

    it('sorts by merge date descending by default', async () => {
      const results = await store.getBySourceId('rec-2')

      expect(results[0].goldenRecordId).toBe('golden-2') // newer first
      expect(results[1].goldenRecordId).toBe('golden-1')
    })

    it('supports ascending sort order', async () => {
      const results = await store.getBySourceId('rec-2', { sortOrder: 'asc' })

      expect(results[0].goldenRecordId).toBe('golden-1') // older first
      expect(results[1].goldenRecordId).toBe('golden-2')
    })

    it('handles multiple source links', async () => {
      // rec-3 is in both golden-2 and golden-3
      const results = await store.getBySourceId('rec-3')

      expect(results).toHaveLength(2)
    })

    it('supports pagination with limit', async () => {
      const results = await store.getBySourceId('rec-2', { limit: 1 })

      expect(results).toHaveLength(1)
    })

    it('supports pagination with offset', async () => {
      const results = await store.getBySourceId('rec-2', { offset: 1 })

      expect(results).toHaveLength(1)
      expect(results[0].goldenRecordId).toBe('golden-1')
    })

    it('excludes unmerged records by default', async () => {
      await store.markUnmerged('golden-1', { unmergedAt: new Date() })

      const results = await store.getBySourceId('rec-2')

      expect(results).toHaveLength(1)
      expect(results[0].goldenRecordId).toBe('golden-2')
    })

    it('includes unmerged records when requested', async () => {
      await store.markUnmerged('golden-1', { unmergedAt: new Date() })

      const results = await store.getBySourceId('rec-2', {
        includeUnmerged: true,
      })

      expect(results).toHaveLength(2)
    })
  })

  describe('markUnmerged', () => {
    it('marks provenance as unmerged', async () => {
      const provenance = createProvenance('golden-1', ['rec-1', 'rec-2'])
      await store.save(provenance)

      await store.markUnmerged('golden-1', {
        unmergedAt: new Date('2024-06-20T10:00:00Z'),
        unmergedBy: 'user-456',
        reason: 'Incorrect merge',
      })

      const retrieved = await store.get('golden-1')
      expect(retrieved?.unmerged).toBe(true)
      expect(retrieved?.unmergedAt).toEqual(new Date('2024-06-20T10:00:00Z'))
      expect(retrieved?.unmergedBy).toBe('user-456')
      expect(retrieved?.unmergeReason).toBe('Incorrect merge')
    })

    it('throws if provenance not found', async () => {
      await expect(
        store.markUnmerged('non-existent', { unmergedAt: new Date() })
      ).rejects.toThrow('Provenance not found')
    })
  })

  describe('delete', () => {
    it('deletes provenance record', async () => {
      const provenance = createProvenance('golden-1', ['rec-1', 'rec-2'])
      await store.save(provenance)

      const deleted = await store.delete('golden-1')

      expect(deleted).toBe(true)
      expect(await store.get('golden-1')).toBeNull()
    })

    it('returns false for non-existent record', async () => {
      const deleted = await store.delete('non-existent')

      expect(deleted).toBe(false)
    })

    it('removes from source index', async () => {
      const provenance = createProvenance('golden-1', ['rec-1', 'rec-2'])
      await store.save(provenance)

      await store.delete('golden-1')

      const goldenIds = await store.findGoldenRecordsBySource('rec-1')
      expect(goldenIds).not.toContain('golden-1')
    })
  })

  describe('exists', () => {
    it('returns true for existing provenance', async () => {
      await store.save(createProvenance('golden-1', ['rec-1', 'rec-2']))

      expect(await store.exists('golden-1')).toBe(true)
    })

    it('returns false for non-existent provenance', async () => {
      expect(await store.exists('non-existent')).toBe(false)
    })
  })

  describe('getFieldHistory', () => {
    it('gets field history for a golden record', async () => {
      const provenance = createProvenance('golden-1', ['rec-1', 'rec-2'], {
        fieldSources: {
          firstName: {
            sourceRecordId: 'rec-1',
            strategyApplied: 'preferLonger',
            allValues: [
              { recordId: 'rec-1', value: 'Jonathan' },
              { recordId: 'rec-2', value: 'John' },
            ],
            hadConflict: true,
          },
        },
      })
      await store.save(provenance)

      const history = await store.getFieldHistory('golden-1', 'firstName')

      expect(history).toHaveLength(1)
      expect(history[0].sourceRecordId).toBe('rec-1')
      expect(history[0].value).toBe('Jonathan')
      expect(history[0].strategyApplied).toBe('preferLonger')
    })

    it('returns empty array for non-existent golden record', async () => {
      const history = await store.getFieldHistory('non-existent', 'firstName')

      expect(history).toEqual([])
    })

    it('returns empty array for non-existent field', async () => {
      await store.save(createProvenance('golden-1', ['rec-1', 'rec-2']))

      const history = await store.getFieldHistory(
        'golden-1',
        'nonExistentField'
      )

      expect(history).toEqual([])
    })
  })

  describe('getMergeTimeline', () => {
    beforeEach(async () => {
      await store.save(
        createProvenance('golden-1', ['rec-1', 'rec-2'], {
          mergedAt: new Date('2024-06-15T10:00:00Z'),
          mergedBy: 'user-1',
        })
      )
      await store.save(
        createProvenance('golden-2', ['rec-3', 'rec-4'], {
          mergedAt: new Date('2024-06-16T10:00:00Z'),
          mergedBy: 'user-2',
        })
      )
      await store.save(
        createProvenance('golden-3', ['rec-5', 'rec-6'], {
          mergedAt: new Date('2024-06-17T10:00:00Z'),
          mergedBy: 'user-3',
        })
      )
    })

    it('gets merge timeline', async () => {
      const timeline = await store.getMergeTimeline()

      expect(timeline).toHaveLength(3)
    })

    it('sorts by merge date descending by default', async () => {
      const timeline = await store.getMergeTimeline()

      expect(timeline[0].goldenRecordId).toBe('golden-3')
      expect(timeline[1].goldenRecordId).toBe('golden-2')
      expect(timeline[2].goldenRecordId).toBe('golden-1')
    })

    it('supports ascending sort order', async () => {
      const timeline = await store.getMergeTimeline({ sortOrder: 'asc' })

      expect(timeline[0].goldenRecordId).toBe('golden-1')
      expect(timeline[2].goldenRecordId).toBe('golden-3')
    })

    it('includes source record IDs', async () => {
      const timeline = await store.getMergeTimeline()

      expect(timeline[0].sourceRecordIds).toEqual(['rec-5', 'rec-6'])
    })

    it('includes mergedBy', async () => {
      const timeline = await store.getMergeTimeline()

      expect(timeline[0].mergedBy).toBe('user-3')
    })

    it('supports pagination with limit', async () => {
      const timeline = await store.getMergeTimeline({ limit: 2 })

      expect(timeline).toHaveLength(2)
    })

    it('supports pagination with offset', async () => {
      const timeline = await store.getMergeTimeline({ offset: 1, limit: 1 })

      expect(timeline).toHaveLength(1)
      expect(timeline[0].goldenRecordId).toBe('golden-2')
    })

    it('excludes unmerged records by default', async () => {
      await store.markUnmerged('golden-2', { unmergedAt: new Date() })

      const timeline = await store.getMergeTimeline()

      expect(timeline).toHaveLength(2)
      expect(timeline.map((t) => t.goldenRecordId)).not.toContain('golden-2')
    })

    it('includes unmerged records when requested', async () => {
      await store.markUnmerged('golden-2', { unmergedAt: new Date() })

      const timeline = await store.getMergeTimeline({ includeUnmerged: true })

      expect(timeline).toHaveLength(3)
      const unmergedEntry = timeline.find(
        (t) => t.goldenRecordId === 'golden-2'
      )
      expect(unmergedEntry?.unmerged).toBe(true)
    })
  })

  describe('findGoldenRecordsBySource', () => {
    it('finds all merges involving a source record', async () => {
      await store.save(createProvenance('golden-1', ['rec-1', 'rec-2']))
      await store.save(createProvenance('golden-2', ['rec-1', 'rec-3']))
      await store.save(createProvenance('golden-3', ['rec-4', 'rec-5']))

      const goldenIds = await store.findGoldenRecordsBySource('rec-1')

      expect(goldenIds).toHaveLength(2)
      expect(goldenIds).toContain('golden-1')
      expect(goldenIds).toContain('golden-2')
    })

    it('returns empty array for non-existent source', async () => {
      const goldenIds = await store.findGoldenRecordsBySource('non-existent')

      expect(goldenIds).toEqual([])
    })

    it('excludes unmerged golden records', async () => {
      await store.save(createProvenance('golden-1', ['rec-1', 'rec-2']))
      await store.save(createProvenance('golden-2', ['rec-1', 'rec-3']))
      await store.markUnmerged('golden-1', { unmergedAt: new Date() })

      const goldenIds = await store.findGoldenRecordsBySource('rec-1')

      expect(goldenIds).toHaveLength(1)
      expect(goldenIds).toContain('golden-2')
    })
  })

  describe('count', () => {
    it('counts total provenance records', async () => {
      await store.save(createProvenance('golden-1', ['rec-1']))
      await store.save(createProvenance('golden-2', ['rec-2']))
      await store.save(createProvenance('golden-3', ['rec-3']))

      const count = await store.count()

      expect(count).toBe(3)
    })

    it('excludes unmerged by default', async () => {
      await store.save(createProvenance('golden-1', ['rec-1']))
      await store.save(createProvenance('golden-2', ['rec-2']))
      await store.markUnmerged('golden-1', { unmergedAt: new Date() })

      const count = await store.count()

      expect(count).toBe(1)
    })

    it('includes unmerged when requested', async () => {
      await store.save(createProvenance('golden-1', ['rec-1']))
      await store.save(createProvenance('golden-2', ['rec-2']))
      await store.markUnmerged('golden-1', { unmergedAt: new Date() })

      const count = await store.count(true)

      expect(count).toBe(2)
    })
  })

  describe('clear', () => {
    it('clears all provenance records', async () => {
      await store.save(createProvenance('golden-1', ['rec-1']))
      await store.save(createProvenance('golden-2', ['rec-2']))

      await store.clear()

      expect(await store.count()).toBe(0)
      expect(await store.get('golden-1')).toBeNull()
      expect(await store.get('golden-2')).toBeNull()
    })

    it('clears source index', async () => {
      await store.save(createProvenance('golden-1', ['rec-1']))

      await store.clear()

      const goldenIds = await store.findGoldenRecordsBySource('rec-1')
      expect(goldenIds).toEqual([])
    })
  })

  describe('getAll', () => {
    it('returns all provenance records', async () => {
      await store.save(createProvenance('golden-1', ['rec-1']))
      await store.save(createProvenance('golden-2', ['rec-2']))

      const all = store.getAll()

      expect(all).toHaveLength(2)
    })

    it('returns empty array when store is empty', () => {
      const all = store.getAll()

      expect(all).toEqual([])
    })
  })
})

describe('createInMemoryProvenanceStore', () => {
  it('creates a new InMemoryProvenanceStore instance', () => {
    const store = createInMemoryProvenanceStore()

    expect(store).toBeInstanceOf(InMemoryProvenanceStore)
  })
})
