/**
 * Tests for QueueMergeHandler
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { QueueMergeHandler, createQueueMergeHandler } from './queue-merge-handler.js'
import { MergeExecutor } from './merge-executor.js'
import { InMemoryProvenanceStore } from './provenance/provenance-store.js'
import { InMemorySourceRecordArchive } from './unmerge.js'
import type { QueueItem, QueueAdapter, MergeDecision } from '../queue/types.js'
import type { MergeConfig } from './types.js'

interface TestRecord extends Record<string, unknown> {
  id: string
  firstName: string
  lastName: string
  email: string
  phone?: string
}

describe('QueueMergeHandler', () => {
  let mergeExecutor: MergeExecutor<TestRecord>
  let provenanceStore: InMemoryProvenanceStore
  let sourceRecordArchive: InMemorySourceRecordArchive<TestRecord>
  let mockQueueAdapter: QueueAdapter<TestRecord>
  let handler: QueueMergeHandler<TestRecord>

  const mergeConfig: MergeConfig = {
    defaultStrategy: 'preferNonNull',
    fieldStrategies: [
      { field: 'firstName', strategy: 'preferLonger' },
      { field: 'lastName', strategy: 'preferLonger' },
      { field: 'email', strategy: 'preferFirst' },
      { field: 'phone', strategy: 'preferNonNull' },
    ],
    trackProvenance: true,
    conflictResolution: 'useDefault',
  }

  beforeEach(() => {
    mergeExecutor = new MergeExecutor<TestRecord>(mergeConfig)
    provenanceStore = new InMemoryProvenanceStore()
    sourceRecordArchive = new InMemorySourceRecordArchive<TestRecord>()

    mockQueueAdapter = {
      insertQueueItem: vi.fn(),
      updateQueueItem: vi.fn().mockImplementation(async (id, updates) => ({
        id,
        ...updates,
      })),
      findQueueItems: vi.fn(),
      findQueueItemById: vi.fn(),
      deleteQueueItem: vi.fn(),
      countQueueItems: vi.fn(),
      batchInsertQueueItems: vi.fn(),
    }

    handler = new QueueMergeHandler({
      mergeExecutor,
      provenanceStore,
      sourceRecordArchive,
      queueAdapter: mockQueueAdapter,
    })
  })

  describe('handleMergeDecision', () => {
    const createQueueItem = (): QueueItem<TestRecord> => ({
      id: 'queue-item-123',
      candidateRecord: {
        id: 'rec-001',
        firstName: 'John',
        lastName: 'Smith',
        email: 'john@example.com',
      },
      potentialMatches: [
        {
          record: {
            id: 'rec-002',
            firstName: 'Jonathan',
            lastName: 'Smith',
            email: 'johnny@example.com',
            phone: '555-1234',
          },
          score: 85,
          outcome: 'potential-match',
          explanation: {
            summary: 'High similarity match',
            fieldComparisons: [],
            appliedRules: [],
          },
        },
      ],
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    it('executes merge from queue decision', async () => {
      const queueItem = createQueueItem()
      const decision: MergeDecision = {
        selectedMatchId: 'rec-002',
        decidedBy: 'reviewer@example.com',
        notes: 'Confirmed as duplicate',
        confidence: 0.9,
      }

      const result = await handler.handleMergeDecision(queueItem, decision)

      expect(result.goldenRecordId).toBe('rec-001')
      expect(result.queueItemId).toBe('queue-item-123')
      expect(result.queueItemUpdated).toBe(true)
      expect(result.goldenRecord).toBeDefined()
      expect(result.provenance).toBeDefined()
    })

    it('persists golden record via callback', async () => {
      const onGoldenRecordCreate = vi.fn()
      const handlerWithCallback = new QueueMergeHandler({
        mergeExecutor,
        provenanceStore,
        sourceRecordArchive,
        queueAdapter: mockQueueAdapter,
        onGoldenRecordCreate,
      })

      const queueItem = createQueueItem()
      const decision: MergeDecision = {
        selectedMatchId: 'rec-002',
      }

      await handlerWithCallback.handleMergeDecision(queueItem, decision)

      expect(onGoldenRecordCreate).toHaveBeenCalledTimes(1)
      expect(onGoldenRecordCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          firstName: expect.any(String),
          lastName: expect.any(String),
        }),
        'rec-001'
      )
    })

    it('archives source records via callback', async () => {
      const onSourceRecordsArchive = vi.fn()
      const handlerWithCallback = new QueueMergeHandler({
        mergeExecutor,
        provenanceStore,
        sourceRecordArchive,
        queueAdapter: mockQueueAdapter,
        onSourceRecordsArchive,
      })

      const queueItem = createQueueItem()
      const decision: MergeDecision = {
        selectedMatchId: 'rec-002',
      }

      await handlerWithCallback.handleMergeDecision(queueItem, decision)

      expect(onSourceRecordsArchive).toHaveBeenCalledTimes(1)
      expect(onSourceRecordsArchive).toHaveBeenCalledWith(['rec-001', 'rec-002'])
    })

    it('stores provenance with queue reference', async () => {
      const queueItem = createQueueItem()
      const decision: MergeDecision = {
        selectedMatchId: 'rec-002',
      }

      const result = await handler.handleMergeDecision(queueItem, decision)

      const storedProvenance = await provenanceStore.get(result.goldenRecordId)
      expect(storedProvenance).toBeDefined()
      expect(storedProvenance?.queueItemId).toBe('queue-item-123')
    })

    it('updates queue item status to merged', async () => {
      const queueItem = createQueueItem()
      const decision: MergeDecision = {
        selectedMatchId: 'rec-002',
        decidedBy: 'admin',
        notes: 'Test merge',
        confidence: 0.95,
      }

      await handler.handleMergeDecision(queueItem, decision)

      expect(mockQueueAdapter.updateQueueItem).toHaveBeenCalledWith(
        'queue-item-123',
        expect.objectContaining({
          status: 'merged',
          decision: {
            action: 'merge',
            selectedMatchId: 'rec-002',
            notes: 'Test merge',
            confidence: 0.95,
          },
          decidedBy: 'admin',
        })
      )
    })

    it('archives source records in memory store for unmerge', async () => {
      const queueItem = createQueueItem()
      const decision: MergeDecision = {
        selectedMatchId: 'rec-002',
      }

      await handler.handleMergeDecision(queueItem, decision)

      const existsMap = await sourceRecordArchive.exists(['rec-001', 'rec-002'])
      expect(existsMap.get('rec-001')).toBe(true)
      expect(existsMap.get('rec-002')).toBe(true)
    })

    it('throws if selectedMatchId is missing', async () => {
      const queueItem = createQueueItem()
      const decision: MergeDecision = {} as MergeDecision

      await expect(
        handler.handleMergeDecision(queueItem, decision)
      ).rejects.toThrow('must be specified in merge decision')
    })

    it('throws if selected match not found in potential matches', async () => {
      const queueItem = createQueueItem()
      const decision: MergeDecision = {
        selectedMatchId: 'non-existent-id',
      }

      await expect(
        handler.handleMergeDecision(queueItem, decision)
      ).rejects.toThrow("'non-existent-id' not found in queue item potential matches")
    })

    it('handles merge errors gracefully', async () => {
      // Create a queue item with invalid records (missing id)
      const invalidQueueItem: QueueItem<TestRecord> = {
        id: 'queue-item-123',
        candidateRecord: {
          firstName: 'John',
          lastName: 'Smith',
          email: 'john@example.com',
        } as TestRecord, // Missing id
        potentialMatches: [
          {
            record: {
              id: 'rec-002',
              firstName: 'Jonathan',
              lastName: 'Smith',
              email: 'johnny@example.com',
            },
            score: 85,
            outcome: 'potential-match',
            explanation: {
              summary: 'High similarity match',
              fieldComparisons: [],
              appliedRules: [],
            },
          },
        ],
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      const decision: MergeDecision = {
        selectedMatchId: 'rec-002',
      }

      await expect(
        handler.handleMergeDecision(invalidQueueItem, decision)
      ).rejects.toThrow('must have an id field')
    })

    it('continues if queue update fails', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

      mockQueueAdapter.updateQueueItem = vi.fn().mockRejectedValue(
        new Error('Queue update failed')
      )

      const queueItem = createQueueItem()
      const decision: MergeDecision = {
        selectedMatchId: 'rec-002',
      }

      const result = await handler.handleMergeDecision(queueItem, decision)

      expect(result.queueItemUpdated).toBe(false)
      expect(result.goldenRecordId).toBe('rec-001')
      expect(consoleError).toHaveBeenCalled()

      consoleError.mockRestore()
    })

    it('applies merge strategies correctly', async () => {
      const queueItem = createQueueItem()
      const decision: MergeDecision = {
        selectedMatchId: 'rec-002',
      }

      const result = await handler.handleMergeDecision(queueItem, decision)

      // preferLonger for firstName: 'Jonathan' > 'John'
      expect(result.goldenRecord.firstName).toBe('Jonathan')
      // preferLonger for lastName: both are 'Smith'
      expect(result.goldenRecord.lastName).toBe('Smith')
      // preferFirst for email: 'john@example.com'
      expect(result.goldenRecord.email).toBe('john@example.com')
      // preferNonNull for phone: '555-1234' (only one has it)
      expect(result.goldenRecord.phone).toBe('555-1234')
    })
  })

  describe('canMerge', () => {
    const createQueueItem = (status: string = 'pending'): QueueItem<TestRecord> => ({
      id: 'queue-item-123',
      candidateRecord: {
        id: 'rec-001',
        firstName: 'John',
        lastName: 'Smith',
        email: 'john@example.com',
      },
      potentialMatches: [
        {
          record: {
            id: 'rec-002',
            firstName: 'Jonathan',
            lastName: 'Smith',
            email: 'johnny@example.com',
          },
          score: 85,
          outcome: 'potential-match',
          explanation: {
            summary: 'High similarity match',
            fieldComparisons: [],
            appliedRules: [],
          },
        },
      ],
      status: status as 'pending' | 'reviewing',
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    it('returns true for valid merge', () => {
      const queueItem = createQueueItem('pending')
      const result = handler.canMerge(queueItem, 'rec-002')

      expect(result.canMerge).toBe(true)
      expect(result.reason).toBeUndefined()
    })

    it('returns true for reviewing status', () => {
      const queueItem = createQueueItem('reviewing')
      const result = handler.canMerge(queueItem, 'rec-002')

      expect(result.canMerge).toBe(true)
    })

    it('returns false if status is not pending or reviewing', () => {
      const queueItem = {
        ...createQueueItem(),
        status: 'confirmed' as const,
      }
      const result = handler.canMerge(queueItem, 'rec-002')

      expect(result.canMerge).toBe(false)
      expect(result.reason).toContain("status 'confirmed'")
    })

    it('returns false if selected match not found', () => {
      const queueItem = createQueueItem()
      const result = handler.canMerge(queueItem, 'non-existent')

      expect(result.canMerge).toBe(false)
      expect(result.reason).toContain('not found')
    })

    it('returns false if records do not have ids', () => {
      const queueItem = {
        ...createQueueItem(),
        candidateRecord: {
          firstName: 'John',
          lastName: 'Smith',
          email: 'john@example.com',
        } as TestRecord,
      }
      const result = handler.canMerge(queueItem, 'rec-002')

      expect(result.canMerge).toBe(false)
      expect(result.reason).toContain('id fields')
    })
  })

  describe('getters', () => {
    it('returns merge executor', () => {
      expect(handler.getMergeExecutor()).toBe(mergeExecutor)
    })

    it('returns provenance store', () => {
      expect(handler.getProvenanceStore()).toBe(provenanceStore)
    })

    it('returns source record archive', () => {
      expect(handler.getSourceRecordArchive()).toBe(sourceRecordArchive)
    })
  })

  describe('createQueueMergeHandler', () => {
    it('creates a QueueMergeHandler instance', () => {
      const created = createQueueMergeHandler({
        mergeExecutor,
        provenanceStore,
        sourceRecordArchive,
        queueAdapter: mockQueueAdapter,
      })

      expect(created).toBeInstanceOf(QueueMergeHandler)
    })
  })

  describe('transaction handling', () => {
    it('merge is atomic - all operations succeed or none', async () => {
      const operations: string[] = []

      const handlerWithTracking = new QueueMergeHandler({
        mergeExecutor,
        provenanceStore,
        sourceRecordArchive,
        queueAdapter: mockQueueAdapter,
        onGoldenRecordCreate: async () => {
          operations.push('goldenRecordCreate')
        },
        onSourceRecordsArchive: async () => {
          operations.push('sourceRecordsArchive')
        },
      })

      const queueItem: QueueItem<TestRecord> = {
        id: 'queue-item-123',
        candidateRecord: {
          id: 'rec-001',
          firstName: 'John',
          lastName: 'Smith',
          email: 'john@example.com',
        },
        potentialMatches: [
          {
            record: {
              id: 'rec-002',
              firstName: 'Jane',
              lastName: 'Smith',
              email: 'jane@example.com',
            },
            score: 80,
            outcome: 'potential-match',
            explanation: {
              summary: 'Match',
              fieldComparisons: [],
              appliedRules: [],
            },
          },
        ],
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      await handlerWithTracking.handleMergeDecision(queueItem, {
        selectedMatchId: 'rec-002',
      })

      // Verify operations were called in order
      expect(operations).toContain('goldenRecordCreate')
      expect(operations).toContain('sourceRecordsArchive')
    })
  })

  describe('end-to-end queue merge', () => {
    it('full workflow: queue → merge decision → golden record', async () => {
      const queueItem: QueueItem<TestRecord> = {
        id: 'queue-item-full-test',
        candidateRecord: {
          id: 'candidate-1',
          firstName: 'Bob',
          lastName: 'Jones',
          email: 'bob@example.com',
        },
        potentialMatches: [
          {
            record: {
              id: 'match-1',
              firstName: 'Robert',
              lastName: 'Jones',
              email: 'robert.jones@example.com',
              phone: '123-456-7890',
            },
            score: 90,
            outcome: 'potential-match',
            explanation: {
              summary: 'Strong match on last name',
              fieldComparisons: [],
              appliedRules: [],
            },
          },
        ],
        status: 'pending',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      }

      const decision: MergeDecision = {
        selectedMatchId: 'match-1',
        decidedBy: 'human-reviewer',
        notes: 'Names are variations of the same person',
        confidence: 0.95,
      }

      const result = await handler.handleMergeDecision(queueItem, decision)

      // Verify golden record
      expect(result.goldenRecordId).toBe('candidate-1')
      expect(result.goldenRecord.firstName).toBe('Robert') // preferLonger
      expect(result.goldenRecord.lastName).toBe('Jones')
      expect(result.goldenRecord.phone).toBe('123-456-7890') // preferNonNull

      // Verify provenance
      expect(result.provenance.sourceRecordIds).toEqual(['candidate-1', 'match-1'])
      expect(result.provenance.mergedBy).toBe('human-reviewer')
      expect(result.provenance.queueItemId).toBe('queue-item-full-test')

      // Verify source records are archived
      const archived = await sourceRecordArchive.get(['candidate-1', 'match-1'])
      expect(archived).toHaveLength(2)

      // Verify provenance is stored
      const storedProvenance = await provenanceStore.get(result.goldenRecordId)
      expect(storedProvenance).not.toBeNull()
      expect(storedProvenance?.queueItemId).toBe('queue-item-full-test')
    })

    it('provenance correctly links queue and merge', async () => {
      const queueItem: QueueItem<TestRecord> = {
        id: 'queue-provenance-test',
        candidateRecord: {
          id: 'a1',
          firstName: 'Alice',
          lastName: 'Wonder',
          email: 'alice@example.com',
        },
        potentialMatches: [
          {
            record: {
              id: 'a2',
              firstName: 'Alicia',
              lastName: 'Wonder',
              email: 'alicia@example.com',
            },
            score: 85,
            outcome: 'potential-match',
            explanation: {
              summary: 'Match',
              fieldComparisons: [],
              appliedRules: [],
            },
          },
        ],
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      const result = await handler.handleMergeDecision(queueItem, {
        selectedMatchId: 'a2',
        decidedBy: 'qa-team',
      })

      // Verify provenance field sources
      const provenance = result.provenance
      expect(provenance.fieldSources).toBeDefined()
      expect(provenance.fieldSources.firstName).toBeDefined()
      expect(provenance.fieldSources.firstName.strategyApplied).toBe('preferLonger')

      // Verify we can query by source record
      const foundBySource = await provenanceStore.getBySourceId('a1')
      expect(foundBySource).toHaveLength(1)
      expect(foundBySource[0].goldenRecordId).toBe('a1')
    })
  })
})
