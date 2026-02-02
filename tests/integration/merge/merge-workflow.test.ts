import { describe, it, expect, beforeEach } from 'vitest'
import {
  MergeExecutor,
  UnmergeExecutor,
  QueueMergeHandler,
  createInMemoryProvenanceStore,
  createInMemorySourceRecordArchive,
  createMergeBuilder,
} from '../../../src/merge/index.js'
import type {
  SourceRecord,
  MergeResult,
  Provenance,
  MergeConfig,
} from '../../../src/merge/index.js'
import type {
  QueueItem,
  QueueAdapter,
  MergeDecision,
} from '../../../src/queue/types.js'
import type { MatchExplanation } from '../../../src/types/match.js'

interface TestRecord {
  id: string
  firstName: string
  lastName: string
  email: string
  phone?: string
  company?: string
  addresses?: string[]
  createdAt: Date
  updatedAt: Date
}

// Mock queue adapter
function createMockQueueAdapter<
  T extends Record<string, unknown>,
>(): QueueAdapter<T> {
  const items = new Map<string, QueueItem<T>>()

  return {
    insertQueueItem: async (item: QueueItem<T>) => {
      items.set(item.id, item)
      return item
    },
    updateQueueItem: async (id: string, updates: Partial<QueueItem<T>>) => {
      const item = items.get(id)
      if (!item) throw new Error(`Queue item ${id} not found`)
      const updated = { ...item, ...updates }
      items.set(id, updated)
      return updated
    },
    findQueueItems: async () => Array.from(items.values()),
    findQueueItemById: async (id: string) => items.get(id) || null,
    deleteQueueItem: async (id: string) => {
      items.delete(id)
    },
    countQueueItems: async () => items.size,
    batchInsertQueueItems: async (newItems: QueueItem<T>[]) => {
      for (const item of newItems) {
        items.set(item.id, item)
      }
      return newItems
    },
  }
}

// Simulated database
function createMockDatabase<T extends { id: string }>() {
  const records = new Map<string, T>()
  const archived = new Set<string>()

  return {
    insert: async (record: T) => {
      records.set(record.id, record)
    },
    get: async (id: string) => records.get(id) || null,
    delete: async (id: string) => {
      records.delete(id)
    },
    archive: async (ids: string[]) => {
      for (const id of ids) {
        archived.add(id)
      }
    },
    isArchived: (id: string) => archived.has(id),
    getAll: () => Array.from(records.values()),
    size: () => records.size,
    clear: () => {
      records.clear()
      archived.clear()
    },
  }
}

describe('Integration: Merge Workflow', () => {
  let provenanceStore: ReturnType<typeof createInMemoryProvenanceStore>
  let sourceRecordArchive: ReturnType<
    typeof createInMemorySourceRecordArchive<TestRecord>
  >
  let mergeExecutor: MergeExecutor<TestRecord>
  let mergeConfig: MergeConfig
  let db: ReturnType<typeof createMockDatabase<TestRecord>>

  beforeEach(() => {
    provenanceStore = createInMemoryProvenanceStore()
    sourceRecordArchive = createInMemorySourceRecordArchive<TestRecord>()
    db = createMockDatabase<TestRecord>()

    const builder = createMergeBuilder<TestRecord>()
    builder.timestampField('updatedAt')
    builder.defaultStrategy('preferNonNull')
    builder.onConflict('useDefault')
    builder.field('firstName').strategy('preferLonger')
    builder.field('lastName').strategy('preferLonger')
    builder.field('email').strategy('preferNewer')
    builder.field('phone').strategy('preferNonNull')
    builder.field('company').strategy('preferNewer')
    builder.field('addresses').strategy('union')
    mergeConfig = builder.build()

    mergeExecutor = new MergeExecutor<TestRecord>(mergeConfig)
  })

  describe('configures merge strategies via builder', () => {
    it('should create valid merge configuration', () => {
      expect(mergeConfig.defaultStrategy).toBe('preferNonNull')
      expect(mergeConfig.timestampField).toBe('updatedAt')
      expect(mergeConfig.conflictResolution).toBe('useDefault')
      expect(mergeConfig.trackProvenance).toBe(true)
      expect(mergeConfig.fieldStrategies).toHaveLength(6)
    })

    it('should configure field-specific strategies', () => {
      const strategies = new Map(
        mergeConfig.fieldStrategies.map((fs) => [fs.field, fs.strategy])
      )

      expect(strategies.get('firstName')).toBe('preferLonger')
      expect(strategies.get('lastName')).toBe('preferLonger')
      expect(strategies.get('email')).toBe('preferNewer')
      expect(strategies.get('phone')).toBe('preferNonNull')
      expect(strategies.get('addresses')).toBe('union')
    })
  })

  describe('executes merge and persists golden record', () => {
    it('should merge two records into a golden record', async () => {
      const now = new Date()
      const hourAgo = new Date(now.getTime() - 60 * 60 * 1000)

      const sourceRecords: SourceRecord<TestRecord>[] = [
        {
          id: 'rec-001',
          record: {
            id: 'rec-001',
            firstName: 'Jon',
            lastName: 'Smith',
            email: 'jon.smith@old.com',
            phone: '+1-555-0100',
            company: 'Acme Corp',
            addresses: ['123 Main St'],
            createdAt: hourAgo,
            updatedAt: hourAgo,
          },
          createdAt: hourAgo,
          updatedAt: hourAgo,
        },
        {
          id: 'rec-002',
          record: {
            id: 'rec-002',
            firstName: 'Jonathan',
            lastName: 'Smith',
            email: 'jonathan.smith@new.com',
            phone: undefined,
            company: 'Acme Corporation',
            addresses: ['456 Oak Ave'],
            createdAt: now,
            updatedAt: now,
          },
          createdAt: now,
          updatedAt: now,
        },
      ]

      const result = await mergeExecutor.merge({
        sourceRecords,
        mergedBy: 'test',
      })

      // Verify golden record
      expect(result.goldenRecord.firstName).toBe('Jonathan') // preferLonger
      expect(result.goldenRecord.lastName).toBe('Smith')
      expect(result.goldenRecord.email).toBe('jonathan.smith@new.com') // preferNewer
      expect(result.goldenRecord.phone).toBe('+1-555-0100') // preferNonNull
      expect(result.goldenRecord.company).toBe('Acme Corporation') // preferNewer
      expect(result.goldenRecord.addresses).toContain('123 Main St') // union
      expect(result.goldenRecord.addresses).toContain('456 Oak Ave')
    })

    it('should persist golden record to database', async () => {
      const now = new Date()
      const sourceRecords: SourceRecord<TestRecord>[] = [
        {
          id: 'rec-001',
          record: {
            id: 'rec-001',
            firstName: 'Test',
            lastName: 'User',
            email: 'test@example.com',
            createdAt: now,
            updatedAt: now,
          },
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'rec-002',
          record: {
            id: 'rec-002',
            firstName: 'Test',
            lastName: 'User',
            email: 'test2@example.com',
            createdAt: now,
            updatedAt: now,
          },
          createdAt: now,
          updatedAt: now,
        },
      ]

      const result = await mergeExecutor.merge({
        sourceRecords,
        targetRecordId: 'golden-001',
        mergedBy: 'test',
      })

      // Persist to database - use goldenRecordId as the ID
      const recordWithId = {
        ...result.goldenRecord,
        id: result.goldenRecordId,
      } as TestRecord
      await db.insert(recordWithId)

      // Verify in database
      const retrieved = await db.get('golden-001')
      expect(retrieved).toBeDefined()
      expect(retrieved?.firstName).toBe('Test')
    })
  })

  describe('tracks provenance correctly', () => {
    it('should record provenance with field-level attribution', async () => {
      const now = new Date()
      const hourAgo = new Date(now.getTime() - 60 * 60 * 1000)

      const sourceRecords: SourceRecord<TestRecord>[] = [
        {
          id: 'rec-001',
          record: {
            id: 'rec-001',
            firstName: 'Jon',
            lastName: 'Smith',
            email: 'jon@old.com',
            phone: '+1-555-0100',
            createdAt: hourAgo,
            updatedAt: hourAgo,
          },
          createdAt: hourAgo,
          updatedAt: hourAgo,
        },
        {
          id: 'rec-002',
          record: {
            id: 'rec-002',
            firstName: 'Jonathan',
            lastName: 'Smith',
            email: 'jonathan@new.com',
            createdAt: now,
            updatedAt: now,
          },
          createdAt: now,
          updatedAt: now,
        },
      ]

      const result = await mergeExecutor.merge({
        sourceRecords,
        mergedBy: 'test-system',
      })

      // Store provenance
      await provenanceStore.save(result.provenance)

      // Retrieve and verify
      const provenance = await provenanceStore.get(result.goldenRecordId)

      expect(provenance).toBeDefined()
      expect(provenance?.sourceRecordIds).toContain('rec-001')
      expect(provenance?.sourceRecordIds).toContain('rec-002')
      expect(provenance?.mergedBy).toBe('test-system')

      // Check field sources
      expect(provenance?.fieldSources.firstName).toBeDefined()
      expect(provenance?.fieldSources.firstName.strategyApplied).toBe(
        'preferLonger'
      )
      expect(provenance?.fieldSources.email.strategyApplied).toBe('preferNewer')
    })

    it('should query provenance by source record ID', async () => {
      const now = new Date()
      const sourceRecords: SourceRecord<TestRecord>[] = [
        {
          id: 'source-001',
          record: {
            id: 'source-001',
            firstName: 'Test',
            lastName: 'User',
            email: 'test@example.com',
            createdAt: now,
            updatedAt: now,
          },
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'source-002',
          record: {
            id: 'source-002',
            firstName: 'Test',
            lastName: 'User',
            email: 'test2@example.com',
            createdAt: now,
            updatedAt: now,
          },
          createdAt: now,
          updatedAt: now,
        },
      ]

      const result = await mergeExecutor.merge({
        sourceRecords,
        targetRecordId: 'golden-001',
        mergedBy: 'test',
      })

      await provenanceStore.save(result.provenance)

      // Query by source ID
      const provenanceResults =
        await provenanceStore.getBySourceId('source-001')

      expect(provenanceResults).toHaveLength(1)
      expect(provenanceResults[0].goldenRecordId).toBe('golden-001')
    })

    it('should find golden records by source record', async () => {
      const now = new Date()
      const sourceRecords: SourceRecord<TestRecord>[] = [
        {
          id: 'src-a',
          record: {
            id: 'src-a',
            firstName: 'Test',
            lastName: 'User',
            email: 'test@example.com',
            createdAt: now,
            updatedAt: now,
          },
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'src-b',
          record: {
            id: 'src-b',
            firstName: 'Test',
            lastName: 'User',
            email: 'test2@example.com',
            createdAt: now,
            updatedAt: now,
          },
          createdAt: now,
          updatedAt: now,
        },
      ]

      const result = await mergeExecutor.merge({
        sourceRecords,
        targetRecordId: 'golden-xyz',
        mergedBy: 'test',
      })

      await provenanceStore.save(result.provenance)

      // Find golden records that include src-a
      const goldenRecordIds =
        await provenanceStore.findGoldenRecordsBySource('src-a')

      expect(goldenRecordIds).toContain('golden-xyz')
    })
  })

  describe('supports unmerge to restore records', () => {
    it('should unmerge and restore source records', async () => {
      const now = new Date()
      const sourceRecords: SourceRecord<TestRecord>[] = [
        {
          id: 'unmerge-001',
          record: {
            id: 'unmerge-001',
            firstName: 'Alice',
            lastName: 'Smith',
            email: 'alice@example.com',
            createdAt: now,
            updatedAt: now,
          },
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'unmerge-002',
          record: {
            id: 'unmerge-002',
            firstName: 'Alicia',
            lastName: 'Smith',
            email: 'alicia@example.com',
            createdAt: now,
            updatedAt: now,
          },
          createdAt: now,
          updatedAt: now,
        },
      ]

      // Execute merge
      const mergeResult = await mergeExecutor.merge({
        sourceRecords,
        targetRecordId: 'golden-unmerge',
        mergedBy: 'test',
      })

      // Archive source records
      await sourceRecordArchive.archive(
        sourceRecords,
        mergeResult.goldenRecordId
      )
      await provenanceStore.save(mergeResult.provenance)

      // Create unmerge executor
      const unmergeExecutor = new UnmergeExecutor<TestRecord>({
        provenanceStore,
        sourceRecordArchive,
        onRecordRestore: async (record) => {
          await db.insert(record.record)
        },
        onGoldenRecordDelete: async (id) => {
          await db.delete(id)
        },
      })

      // Execute unmerge
      const unmergeResult = await unmergeExecutor.unmerge({
        goldenRecordId: 'golden-unmerge',
        unmergedBy: 'admin',
        reason: 'False positive match',
      })

      // Verify
      expect(unmergeResult.restoredRecords).toHaveLength(2)
      expect(unmergeResult.goldenRecordDeleted).toBe(true)

      // Verify records restored in DB
      expect(await db.get('unmerge-001')).toBeDefined()
      expect(await db.get('unmerge-002')).toBeDefined()

      // Verify provenance marked as unmerged
      const provenance = await provenanceStore.get('golden-unmerge')
      expect(provenance?.unmerged).toBe(true)
      expect(provenance?.unmergeReason).toBe('False positive match')
    })

    it('should prevent double unmerge', async () => {
      const now = new Date()
      const sourceRecords: SourceRecord<TestRecord>[] = [
        {
          id: 'double-001',
          record: {
            id: 'double-001',
            firstName: 'Test',
            lastName: 'User',
            email: 'test@example.com',
            createdAt: now,
            updatedAt: now,
          },
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'double-002',
          record: {
            id: 'double-002',
            firstName: 'Test',
            lastName: 'User2',
            email: 'test2@example.com',
            createdAt: now,
            updatedAt: now,
          },
          createdAt: now,
          updatedAt: now,
        },
      ]

      const mergeResult = await mergeExecutor.merge({
        sourceRecords,
        targetRecordId: 'golden-double',
        mergedBy: 'test',
      })

      await sourceRecordArchive.archive(
        sourceRecords,
        mergeResult.goldenRecordId
      )
      await provenanceStore.save(mergeResult.provenance)

      const unmergeExecutor = new UnmergeExecutor<TestRecord>({
        provenanceStore,
        sourceRecordArchive,
      })

      // First unmerge succeeds
      await unmergeExecutor.unmerge({
        goldenRecordId: 'golden-double',
        unmergedBy: 'admin',
      })

      // Second unmerge should fail
      await expect(
        unmergeExecutor.unmerge({
          goldenRecordId: 'golden-double',
          unmergedBy: 'admin',
        })
      ).rejects.toThrow()
    })
  })

  describe('integrates with review queue', () => {
    it('should execute merge from queue decision', async () => {
      const queueAdapter = createMockQueueAdapter<TestRecord>()
      const now = new Date()
      const hourAgo = new Date(now.getTime() - 60 * 60 * 1000)

      const handler = new QueueMergeHandler<TestRecord>({
        mergeExecutor,
        provenanceStore,
        sourceRecordArchive,
        queueAdapter,
        onGoldenRecordCreate: async (record, id) => {
          await db.insert({ ...record, id } as TestRecord)
        },
        onSourceRecordsArchive: async (ids) => {
          await db.archive(ids)
        },
      })

      // Create queue item
      const candidateRecord: TestRecord = {
        id: 'queue-cand-001',
        firstName: 'Jon',
        lastName: 'Smith',
        email: 'jon@new.com',
        phone: '+1-555-0100',
        createdAt: now,
        updatedAt: now,
      }

      const existingRecord: TestRecord = {
        id: 'queue-exist-001',
        firstName: 'Jonathan',
        lastName: 'Smith',
        email: 'jonathan@old.com',
        phone: undefined,
        createdAt: hourAgo,
        updatedAt: hourAgo,
      }

      const matchExplanation: MatchExplanation = {
        overallScore: 42,
        fieldBreakdown: [],
        matchFactors: ['Same last name'],
        confidence: 0.75,
      }

      const queueItem: QueueItem<TestRecord> = {
        id: 'queue-item-001',
        candidateRecord,
        potentialMatches: [
          {
            record: existingRecord,
            score: 42,
            outcome: 'potential-match',
            explanation: matchExplanation,
          },
        ],
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      }

      await queueAdapter.insertQueueItem(queueItem)

      // Make merge decision
      const decision: MergeDecision = {
        selectedMatchId: existingRecord.id,
        notes: 'Confirmed duplicate',
        confidence: 0.95,
        decidedBy: 'reviewer',
      }

      const result = await handler.handleMergeDecision(queueItem, decision)

      // Verify result
      expect(result.goldenRecordId).toBeDefined()
      expect(result.queueItemId).toBe('queue-item-001')
      expect(result.queueItemUpdated).toBe(true)

      // Verify golden record
      expect(result.goldenRecord.firstName).toBe('Jonathan') // preferLonger
      expect(result.goldenRecord.phone).toBe('+1-555-0100') // preferNonNull from candidate

      // Verify provenance has queue item reference
      const provenance = await provenanceStore.get(result.goldenRecordId)
      expect(provenance?.queueItemId).toBe('queue-item-001')

      // Verify queue item updated
      const updatedQueueItem =
        await queueAdapter.findQueueItemById('queue-item-001')
      expect(updatedQueueItem?.status).toBe('merged')
    })

    it('should validate merge possibility before execution', async () => {
      const queueAdapter = createMockQueueAdapter<TestRecord>()
      const now = new Date()

      const handler = new QueueMergeHandler<TestRecord>({
        mergeExecutor,
        provenanceStore,
        sourceRecordArchive,
        queueAdapter,
      })

      const queueItem: QueueItem<TestRecord> = {
        id: 'validation-001',
        candidateRecord: {
          id: 'cand-001',
          firstName: 'Test',
          lastName: 'User',
          email: 'test@example.com',
          createdAt: now,
          updatedAt: now,
        },
        potentialMatches: [
          {
            record: {
              id: 'match-001',
              firstName: 'Test',
              lastName: 'User',
              email: 'test2@example.com',
              createdAt: now,
              updatedAt: now,
            },
            score: 40,
            outcome: 'potential-match',
            explanation: {
              overallScore: 40,
              fieldBreakdown: [],
              matchFactors: [],
            },
          },
        ],
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      }

      // Valid merge
      const canMerge = handler.canMerge(queueItem, 'match-001')
      expect(canMerge.canMerge).toBe(true)

      // Invalid match ID
      const cannotMerge = handler.canMerge(queueItem, 'non-existent')
      expect(cannotMerge.canMerge).toBe(false)
      expect(cannotMerge.reason).toContain('not found')
    })
  })
})

describe('Performance: Merge Operations', () => {
  let mergeExecutor: MergeExecutor<TestRecord>

  beforeEach(() => {
    const builder = createMergeBuilder<TestRecord>()
    builder.timestampField('updatedAt')
    builder.defaultStrategy('preferNonNull')
    builder.field('firstName').strategy('preferLonger')
    builder.field('lastName').strategy('preferLonger')
    builder.field('email').strategy('preferNewer')
    const mergeConfig = builder.build()

    mergeExecutor = new MergeExecutor<TestRecord>(mergeConfig)
  })

  it('merges 2 records in < 10ms', async () => {
    const now = new Date()
    const sourceRecords: SourceRecord<TestRecord>[] = [
      {
        id: 'perf-001',
        record: {
          id: 'perf-001',
          firstName: 'Test',
          lastName: 'User',
          email: 'test@example.com',
          createdAt: now,
          updatedAt: now,
        },
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'perf-002',
        record: {
          id: 'perf-002',
          firstName: 'Testing',
          lastName: 'User',
          email: 'test2@example.com',
          createdAt: now,
          updatedAt: now,
        },
        createdAt: now,
        updatedAt: now,
      },
    ]

    const startTime = Date.now()
    await mergeExecutor.merge({ sourceRecords, mergedBy: 'test' })
    const duration = Date.now() - startTime

    expect(duration).toBeLessThan(10)
  })

  it('merges 10 records in < 50ms', async () => {
    const now = new Date()
    const sourceRecords: SourceRecord<TestRecord>[] = Array.from(
      { length: 10 },
      (_, i) => ({
        id: `perf-${i}`,
        record: {
          id: `perf-${i}`,
          firstName: `Test${i}`,
          lastName: 'User',
          email: `test${i}@example.com`,
          createdAt: now,
          updatedAt: now,
        },
        createdAt: now,
        updatedAt: now,
      })
    )

    const startTime = Date.now()
    await mergeExecutor.merge({ sourceRecords, mergedBy: 'test' })
    const duration = Date.now() - startTime

    expect(duration).toBeLessThan(50)
  })

  it('tracks provenance with minimal overhead', async () => {
    const now = new Date()
    const provenanceStore = createInMemoryProvenanceStore()

    const sourceRecords: SourceRecord<TestRecord>[] = [
      {
        id: 'prov-001',
        record: {
          id: 'prov-001',
          firstName: 'Test',
          lastName: 'User',
          email: 'test@example.com',
          createdAt: now,
          updatedAt: now,
        },
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'prov-002',
        record: {
          id: 'prov-002',
          firstName: 'Testing',
          lastName: 'User',
          email: 'test2@example.com',
          createdAt: now,
          updatedAt: now,
        },
        createdAt: now,
        updatedAt: now,
      },
    ]

    const result = await mergeExecutor.merge({
      sourceRecords,
      mergedBy: 'test',
    })

    const startTime = Date.now()
    await provenanceStore.save(result.provenance)
    const provenance = await provenanceStore.get(result.goldenRecordId)
    const duration = Date.now() - startTime

    expect(provenance).toBeDefined()
    expect(duration).toBeLessThan(10)
  })

  it('unmerge completes in < 50ms', async () => {
    const now = new Date()
    const provenanceStore = createInMemoryProvenanceStore()
    const sourceRecordArchive = createInMemorySourceRecordArchive<TestRecord>()

    const sourceRecords: SourceRecord<TestRecord>[] = [
      {
        id: 'unm-001',
        record: {
          id: 'unm-001',
          firstName: 'Test',
          lastName: 'User',
          email: 'test@example.com',
          createdAt: now,
          updatedAt: now,
        },
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'unm-002',
        record: {
          id: 'unm-002',
          firstName: 'Testing',
          lastName: 'User',
          email: 'test2@example.com',
          createdAt: now,
          updatedAt: now,
        },
        createdAt: now,
        updatedAt: now,
      },
    ]

    const result = await mergeExecutor.merge({
      sourceRecords,
      targetRecordId: 'golden-unm',
      mergedBy: 'test',
    })

    await sourceRecordArchive.archive(sourceRecords, result.goldenRecordId)
    await provenanceStore.save(result.provenance)

    const unmergeExecutor = new UnmergeExecutor<TestRecord>({
      provenanceStore,
      sourceRecordArchive,
    })

    const startTime = Date.now()
    await unmergeExecutor.unmerge({
      goldenRecordId: 'golden-unm',
      unmergedBy: 'test',
    })
    const duration = Date.now() - startTime

    expect(duration).toBeLessThan(50)
  })
})
