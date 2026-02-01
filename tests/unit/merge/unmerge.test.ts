import { describe, it, expect, beforeEach } from 'vitest'
import {
  UnmergeExecutor,
  InMemorySourceRecordArchive,
  createUnmergeExecutor,
  createInMemorySourceRecordArchive,
} from '../../../src/merge/unmerge.js'
import {
  InMemoryProvenanceStore,
  createInMemoryProvenanceStore,
  ProvenanceNotFoundError,
  UnmergeError,
  SourceRecordNotFoundError,
} from '../../../src/merge/index.js'
import type { SourceRecord, Provenance, MergeConfig } from '../../../src/merge/types.js'

interface TestRecord {
  firstName: string
  lastName: string
  email: string
  phone?: string
}

function createSourceRecord<T extends Record<string, unknown>>(
  id: string,
  record: T,
  options?: { createdAt?: Date; updatedAt?: Date },
): SourceRecord<T> {
  return {
    id,
    record,
    createdAt: options?.createdAt ?? new Date('2024-01-01'),
    updatedAt: options?.updatedAt ?? new Date('2024-01-01'),
  }
}

function createProvenance(
  goldenRecordId: string,
  sourceRecordIds: string[],
  options?: {
    mergedBy?: string
    queueItemId?: string
    unmerged?: boolean
    unmergedAt?: Date
    unmergedBy?: string
  },
): Provenance {
  const config: MergeConfig = {
    fieldStrategies: [],
    defaultStrategy: 'preferFirst',
    trackProvenance: true,
    conflictResolution: 'useDefault',
  }

  return {
    goldenRecordId,
    sourceRecordIds,
    mergedAt: new Date('2024-01-15'),
    mergedBy: options?.mergedBy,
    queueItemId: options?.queueItemId,
    fieldSources: {
      firstName: {
        sourceRecordId: sourceRecordIds[0],
        strategyApplied: 'preferFirst',
        allValues: sourceRecordIds.map((id) => ({ recordId: id, value: `Name-${id}` })),
        hadConflict: false,
      },
    },
    strategyUsed: config,
    unmerged: options?.unmerged,
    unmergedAt: options?.unmergedAt,
    unmergedBy: options?.unmergedBy,
  }
}

describe('UnmergeExecutor', () => {
  let provenanceStore: InMemoryProvenanceStore
  let sourceRecordArchive: InMemorySourceRecordArchive<TestRecord>
  let restoredRecords: SourceRecord<TestRecord>[]
  let deletedGoldenRecordIds: string[]

  beforeEach(() => {
    provenanceStore = createInMemoryProvenanceStore()
    sourceRecordArchive = createInMemorySourceRecordArchive<TestRecord>()
    restoredRecords = []
    deletedGoldenRecordIds = []
  })

  function createExecutor() {
    return createUnmergeExecutor<TestRecord>({
      provenanceStore,
      sourceRecordArchive,
      onRecordRestore: async (record) => {
        restoredRecords.push(record)
      },
      onGoldenRecordDelete: async (id) => {
        deletedGoldenRecordIds.push(id)
      },
    })
  }

  describe('constructor', () => {
    it('creates executor with required dependencies', () => {
      const executor = createExecutor()
      expect(executor).toBeDefined()
      expect(executor.getProvenanceStore()).toBe(provenanceStore)
      expect(executor.getSourceRecordArchive()).toBe(sourceRecordArchive)
    })

    it('creates executor using class constructor', () => {
      const executor = new UnmergeExecutor<TestRecord>({
        provenanceStore,
        sourceRecordArchive,
      })
      expect(executor).toBeDefined()
    })
  })

  describe('unmerge', () => {
    it('restores source records', async () => {
      const executor = createExecutor()

      const sourceRecord1 = createSourceRecord('rec-1', {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
      })

      const sourceRecord2 = createSourceRecord('rec-2', {
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane@example.com',
      })

      // Set up provenance
      const provenance = createProvenance('golden-1', ['rec-1', 'rec-2'])
      await provenanceStore.save(provenance)

      // Archive source records
      await sourceRecordArchive.archive([sourceRecord1, sourceRecord2], 'golden-1')

      // Unmerge
      const result = await executor.unmerge({
        goldenRecordId: 'golden-1',
        unmergedBy: 'admin',
        reason: 'Incorrect match',
      })

      expect(result.restoredRecords).toHaveLength(2)
      expect(result.restoredRecords.map((r) => r.id)).toContain('rec-1')
      expect(result.restoredRecords.map((r) => r.id)).toContain('rec-2')
      expect(restoredRecords).toHaveLength(2)
    })

    it('deletes golden record in full mode', async () => {
      const executor = createExecutor()

      const sourceRecord1 = createSourceRecord('rec-1', {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
      })

      await provenanceStore.save(createProvenance('golden-1', ['rec-1']))
      await sourceRecordArchive.archive([sourceRecord1], 'golden-1')

      const result = await executor.unmerge({
        goldenRecordId: 'golden-1',
      })

      expect(result.goldenRecordDeleted).toBe(true)
      expect(deletedGoldenRecordIds).toContain('golden-1')
    })

    it('updates provenance with unmerge info', async () => {
      const executor = createExecutor()

      const sourceRecord1 = createSourceRecord('rec-1', {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
      })

      await provenanceStore.save(createProvenance('golden-1', ['rec-1']))
      await sourceRecordArchive.archive([sourceRecord1], 'golden-1')

      await executor.unmerge({
        goldenRecordId: 'golden-1',
        unmergedBy: 'admin',
        reason: 'Test reason',
      })

      const updatedProvenance = await provenanceStore.get('golden-1')
      expect(updatedProvenance?.unmerged).toBe(true)
      expect(updatedProvenance?.unmergedBy).toBe('admin')
      expect(updatedProvenance?.unmergeReason).toBe('Test reason')
      expect(updatedProvenance?.unmergedAt).toBeDefined()
    })

    it('throws if no provenance found', async () => {
      const executor = createExecutor()

      await expect(
        executor.unmerge({ goldenRecordId: 'non-existent' }),
      ).rejects.toThrow(ProvenanceNotFoundError)
    })

    it('throws if source records not found in archive', async () => {
      const executor = createExecutor()

      // Provenance exists but no archived records
      await provenanceStore.save(createProvenance('golden-1', ['rec-1', 'rec-2']))

      await expect(executor.unmerge({ goldenRecordId: 'golden-1' })).rejects.toThrow(
        SourceRecordNotFoundError,
      )
    })

    it('throws if already unmerged', async () => {
      const executor = createExecutor()

      const provenance = createProvenance('golden-1', ['rec-1'], {
        unmerged: true,
        unmergedAt: new Date(),
        unmergedBy: 'previous-admin',
      })
      await provenanceStore.save(provenance)

      await expect(executor.unmerge({ goldenRecordId: 'golden-1' })).rejects.toThrow(UnmergeError)
    })

    it('handles partial source record availability', async () => {
      const executor = createExecutor()

      const sourceRecord1 = createSourceRecord('rec-1', {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
      })

      await provenanceStore.save(createProvenance('golden-1', ['rec-1', 'rec-2']))
      // Only archive rec-1, not rec-2
      await sourceRecordArchive.archive([sourceRecord1], 'golden-1')

      await expect(executor.unmerge({ goldenRecordId: 'golden-1' })).rejects.toThrow(
        SourceRecordNotFoundError,
      )
    })

    it('removes records from archive after restoration', async () => {
      const executor = createExecutor()

      const sourceRecord1 = createSourceRecord('rec-1', {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
      })

      await provenanceStore.save(createProvenance('golden-1', ['rec-1']))
      await sourceRecordArchive.archive([sourceRecord1], 'golden-1')

      expect(sourceRecordArchive.size()).toBe(1)

      await executor.unmerge({ goldenRecordId: 'golden-1' })

      expect(sourceRecordArchive.size()).toBe(0)
    })

    it('returns original provenance in result', async () => {
      const executor = createExecutor()

      const sourceRecord1 = createSourceRecord('rec-1', {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
      })

      const provenance = createProvenance('golden-1', ['rec-1'], {
        mergedBy: 'original-user',
        queueItemId: 'queue-123',
      })
      await provenanceStore.save(provenance)
      await sourceRecordArchive.archive([sourceRecord1], 'golden-1')

      const result = await executor.unmerge({ goldenRecordId: 'golden-1' })

      expect(result.originalProvenance.goldenRecordId).toBe('golden-1')
      expect(result.originalProvenance.mergedBy).toBe('original-user')
      expect(result.originalProvenance.queueItemId).toBe('queue-123')
    })
  })

  describe('unmerge modes', () => {
    it('full restore deletes golden record', async () => {
      const executor = createExecutor()

      const sourceRecord1 = createSourceRecord('rec-1', {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
      })

      await provenanceStore.save(createProvenance('golden-1', ['rec-1']))
      await sourceRecordArchive.archive([sourceRecord1], 'golden-1')

      const result = await executor.unmerge({ goldenRecordId: 'golden-1' }, { mode: 'full' })

      expect(result.goldenRecordDeleted).toBe(true)
      expect(result.restoredRecords).toHaveLength(1)
    })

    it('partial restore keeps golden record by default', async () => {
      const executor = createExecutor()

      const sourceRecord1 = createSourceRecord('rec-1', {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
      })

      const sourceRecord2 = createSourceRecord('rec-2', {
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane@example.com',
      })

      await provenanceStore.save(createProvenance('golden-1', ['rec-1', 'rec-2']))
      await sourceRecordArchive.archive([sourceRecord1, sourceRecord2], 'golden-1')

      const result = await executor.unmerge(
        { goldenRecordId: 'golden-1' },
        { mode: 'partial', sourceRecordIdsToRestore: ['rec-1'] },
      )

      expect(result.goldenRecordDeleted).toBe(false)
      expect(result.restoredRecords).toHaveLength(1)
      expect(result.restoredRecords[0].id).toBe('rec-1')
    })

    it('split mode keeps golden record by default', async () => {
      const executor = createExecutor()

      const sourceRecord1 = createSourceRecord('rec-1', {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
      })

      const sourceRecord2 = createSourceRecord('rec-2', {
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane@example.com',
      })

      await provenanceStore.save(createProvenance('golden-1', ['rec-1', 'rec-2']))
      await sourceRecordArchive.archive([sourceRecord1, sourceRecord2], 'golden-1')

      const result = await executor.unmerge(
        { goldenRecordId: 'golden-1' },
        { mode: 'split', sourceRecordIdsToRestore: ['rec-2'] },
      )

      expect(result.goldenRecordDeleted).toBe(false)
      expect(result.restoredRecords).toHaveLength(1)
      expect(result.restoredRecords[0].id).toBe('rec-2')
    })

    it('partial mode requires source record IDs', async () => {
      const executor = createExecutor()

      const sourceRecord1 = createSourceRecord('rec-1', {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
      })

      await provenanceStore.save(createProvenance('golden-1', ['rec-1']))
      await sourceRecordArchive.archive([sourceRecord1], 'golden-1')

      await expect(
        executor.unmerge({ goldenRecordId: 'golden-1' }, { mode: 'partial' }),
      ).rejects.toThrow(UnmergeError)
    })

    it('rejects invalid source record IDs in partial mode', async () => {
      const executor = createExecutor()

      const sourceRecord1 = createSourceRecord('rec-1', {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
      })

      await provenanceStore.save(createProvenance('golden-1', ['rec-1']))
      await sourceRecordArchive.archive([sourceRecord1], 'golden-1')

      await expect(
        executor.unmerge(
          { goldenRecordId: 'golden-1' },
          { mode: 'partial', sourceRecordIdsToRestore: ['rec-999'] },
        ),
      ).rejects.toThrow(UnmergeError)
    })

    it('allows explicit golden record deletion override', async () => {
      const executor = createExecutor()

      const sourceRecord1 = createSourceRecord('rec-1', {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
      })

      const sourceRecord2 = createSourceRecord('rec-2', {
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane@example.com',
      })

      await provenanceStore.save(createProvenance('golden-1', ['rec-1', 'rec-2']))
      await sourceRecordArchive.archive([sourceRecord1, sourceRecord2], 'golden-1')

      const result = await executor.unmerge(
        { goldenRecordId: 'golden-1' },
        { mode: 'partial', sourceRecordIdsToRestore: ['rec-1'], deleteGoldenRecord: true },
      )

      expect(result.goldenRecordDeleted).toBe(true)
    })
  })

  describe('canUnmerge', () => {
    it('returns true when unmerge is possible', async () => {
      const executor = createExecutor()

      const sourceRecord1 = createSourceRecord('rec-1', {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
      })

      await provenanceStore.save(createProvenance('golden-1', ['rec-1']))
      await sourceRecordArchive.archive([sourceRecord1], 'golden-1')

      const result = await executor.canUnmerge('golden-1')

      expect(result.canUnmerge).toBe(true)
      expect(result.provenance).toBeDefined()
    })

    it('returns false when no provenance exists', async () => {
      const executor = createExecutor()

      const result = await executor.canUnmerge('non-existent')

      expect(result.canUnmerge).toBe(false)
      expect(result.reason).toContain('No provenance found')
    })

    it('returns false when already unmerged', async () => {
      const executor = createExecutor()

      const provenance = createProvenance('golden-1', ['rec-1'], {
        unmerged: true,
        unmergedAt: new Date(),
      })
      await provenanceStore.save(provenance)

      const result = await executor.canUnmerge('golden-1')

      expect(result.canUnmerge).toBe(false)
      expect(result.reason).toContain('already been unmerged')
    })

    it('returns false when source records missing from archive', async () => {
      const executor = createExecutor()

      await provenanceStore.save(createProvenance('golden-1', ['rec-1', 'rec-2']))
      // No archived records

      const result = await executor.canUnmerge('golden-1')

      expect(result.canUnmerge).toBe(false)
      expect(result.reason).toContain('not found in archive')
    })
  })

  describe('audit trail', () => {
    it('records unmerge event in provenance', async () => {
      const executor = createExecutor()

      const sourceRecord1 = createSourceRecord('rec-1', {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
      })

      await provenanceStore.save(createProvenance('golden-1', ['rec-1']))
      await sourceRecordArchive.archive([sourceRecord1], 'golden-1')

      await executor.unmerge({
        goldenRecordId: 'golden-1',
        unmergedBy: 'admin',
        reason: 'Data quality issue',
      })

      const provenance = await provenanceStore.get('golden-1')
      expect(provenance?.unmerged).toBe(true)
      expect(provenance?.unmergedAt).toBeInstanceOf(Date)
      expect(provenance?.unmergedBy).toBe('admin')
      expect(provenance?.unmergeReason).toBe('Data quality issue')
    })

    it('links to original merge via provenance', async () => {
      const executor = createExecutor()

      const sourceRecord1 = createSourceRecord('rec-1', {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
      })

      const originalProvenance = createProvenance('golden-1', ['rec-1'], {
        mergedBy: 'original-merger',
        queueItemId: 'queue-item-1',
      })
      await provenanceStore.save(originalProvenance)
      await sourceRecordArchive.archive([sourceRecord1], 'golden-1')

      const result = await executor.unmerge({ goldenRecordId: 'golden-1' })

      // Original provenance is returned for audit
      expect(result.originalProvenance.mergedBy).toBe('original-merger')
      expect(result.originalProvenance.queueItemId).toBe('queue-item-1')

      // Updated provenance in store has both merge and unmerge info
      const storedProvenance = await provenanceStore.get('golden-1')
      expect(storedProvenance?.mergedBy).toBe('original-merger')
      expect(storedProvenance?.unmerged).toBe(true)
    })

    it('stores unmerge reason', async () => {
      const executor = createExecutor()

      const sourceRecord1 = createSourceRecord('rec-1', {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
      })

      await provenanceStore.save(createProvenance('golden-1', ['rec-1']))
      await sourceRecordArchive.archive([sourceRecord1], 'golden-1')

      await executor.unmerge({
        goldenRecordId: 'golden-1',
        reason: 'Customer requested separation of records',
      })

      const provenance = await provenanceStore.get('golden-1')
      expect(provenance?.unmergeReason).toBe('Customer requested separation of records')
    })
  })

  describe('edge cases', () => {
    it('works without callbacks', async () => {
      const executor = new UnmergeExecutor<TestRecord>({
        provenanceStore,
        sourceRecordArchive,
        // No callbacks
      })

      const sourceRecord1 = createSourceRecord('rec-1', {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
      })

      await provenanceStore.save(createProvenance('golden-1', ['rec-1']))
      await sourceRecordArchive.archive([sourceRecord1], 'golden-1')

      const result = await executor.unmerge({ goldenRecordId: 'golden-1' })

      expect(result.restoredRecords).toHaveLength(1)
      expect(result.goldenRecordDeleted).toBe(true)
    })

    it('handles unmerge with many source records', async () => {
      const executor = createExecutor()

      const sourceRecords: SourceRecord<TestRecord>[] = []
      for (let i = 0; i < 10; i++) {
        sourceRecords.push(
          createSourceRecord(`rec-${i}`, {
            firstName: `First${i}`,
            lastName: `Last${i}`,
            email: `user${i}@example.com`,
          }),
        )
      }

      const sourceRecordIds = sourceRecords.map((r) => r.id)
      await provenanceStore.save(createProvenance('golden-1', sourceRecordIds))
      await sourceRecordArchive.archive(sourceRecords, 'golden-1')

      const result = await executor.unmerge({ goldenRecordId: 'golden-1' })

      expect(result.restoredRecords).toHaveLength(10)
    })

    it('preserves source record data integrity', async () => {
      const executor = createExecutor()

      const sourceRecord1 = createSourceRecord('rec-1', {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        phone: '555-1234',
      })

      await provenanceStore.save(createProvenance('golden-1', ['rec-1']))
      await sourceRecordArchive.archive([sourceRecord1], 'golden-1')

      const result = await executor.unmerge({ goldenRecordId: 'golden-1' })

      expect(result.restoredRecords[0].record.firstName).toBe('John')
      expect(result.restoredRecords[0].record.lastName).toBe('Doe')
      expect(result.restoredRecords[0].record.email).toBe('john@example.com')
      expect(result.restoredRecords[0].record.phone).toBe('555-1234')
    })
  })
})

describe('InMemorySourceRecordArchive', () => {
  let archive: InMemorySourceRecordArchive<TestRecord>

  beforeEach(() => {
    archive = createInMemorySourceRecordArchive<TestRecord>()
  })

  describe('archive', () => {
    it('stores records with golden record ID', async () => {
      const record = createSourceRecord('rec-1', {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
      })

      await archive.archive([record], 'golden-1')

      expect(archive.size()).toBe(1)
    })

    it('stores multiple records', async () => {
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
      ]

      await archive.archive(records, 'golden-1')

      expect(archive.size()).toBe(2)
    })
  })

  describe('get', () => {
    it('retrieves archived records by ID', async () => {
      const record = createSourceRecord('rec-1', {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
      })

      await archive.archive([record], 'golden-1')

      const retrieved = await archive.get(['rec-1'])

      expect(retrieved).toHaveLength(1)
      expect(retrieved[0].id).toBe('rec-1')
      expect(retrieved[0].record.firstName).toBe('John')
    })

    it('returns empty array for non-existent IDs', async () => {
      const retrieved = await archive.get(['non-existent'])
      expect(retrieved).toHaveLength(0)
    })

    it('retrieves multiple records', async () => {
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
      ]

      await archive.archive(records, 'golden-1')

      const retrieved = await archive.get(['rec-1', 'rec-2'])

      expect(retrieved).toHaveLength(2)
    })
  })

  describe('remove', () => {
    it('removes records from archive', async () => {
      const record = createSourceRecord('rec-1', {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
      })

      await archive.archive([record], 'golden-1')
      expect(archive.size()).toBe(1)

      await archive.remove(['rec-1'])
      expect(archive.size()).toBe(0)
    })

    it('handles removing non-existent IDs gracefully', async () => {
      await archive.remove(['non-existent'])
      expect(archive.size()).toBe(0)
    })
  })

  describe('exists', () => {
    it('returns map of ID existence', async () => {
      const record = createSourceRecord('rec-1', {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
      })

      await archive.archive([record], 'golden-1')

      const existenceMap = await archive.exists(['rec-1', 'rec-2'])

      expect(existenceMap.get('rec-1')).toBe(true)
      expect(existenceMap.get('rec-2')).toBe(false)
    })
  })

  describe('clear', () => {
    it('removes all records', async () => {
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
      ]

      await archive.archive(records, 'golden-1')
      expect(archive.size()).toBe(2)

      archive.clear()
      expect(archive.size()).toBe(0)
    })
  })
})

describe('performance', () => {
  it('unmerge completes in < 50ms', async () => {
    const provenanceStore = createInMemoryProvenanceStore()
    const sourceRecordArchive = createInMemorySourceRecordArchive<TestRecord>()
    const executor = createUnmergeExecutor<TestRecord>({
      provenanceStore,
      sourceRecordArchive,
    })

    const sourceRecords: SourceRecord<TestRecord>[] = []
    for (let i = 0; i < 10; i++) {
      sourceRecords.push(
        createSourceRecord(`rec-${i}`, {
          firstName: `First${i}`,
          lastName: `Last${i}`,
          email: `user${i}@example.com`,
        }),
      )
    }

    const sourceRecordIds = sourceRecords.map((r) => r.id)
    await provenanceStore.save({
      goldenRecordId: 'golden-1',
      sourceRecordIds,
      mergedAt: new Date(),
      fieldSources: {},
      strategyUsed: {
        fieldStrategies: [],
        defaultStrategy: 'preferFirst',
        trackProvenance: true,
        conflictResolution: 'useDefault',
      },
    })
    await sourceRecordArchive.archive(sourceRecords, 'golden-1')

    const start = performance.now()
    await executor.unmerge({ goldenRecordId: 'golden-1' })
    const elapsed = performance.now() - start

    expect(elapsed).toBeLessThan(50)
  })
})
