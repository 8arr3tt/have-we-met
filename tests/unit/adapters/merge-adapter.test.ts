import { describe, it, expect } from 'vitest'
import {
  DEFAULT_MERGE_ADAPTER_CONFIG,
  toArchivedRecords,
  toSourceRecords,
} from '../../../src/adapters/merge-adapter'
import type { SourceRecord } from '../../../src/merge/types'
import type { ArchivedRecord } from '../../../src/adapters/merge-adapter'

describe('merge-adapter types and utilities', () => {
  describe('DEFAULT_MERGE_ADAPTER_CONFIG', () => {
    it('has correct default values', () => {
      expect(DEFAULT_MERGE_ADAPTER_CONFIG).toEqual({
        archivedAtField: 'archivedAt',
        archivedReasonField: 'archivedReason',
        mergedIntoIdField: 'mergedIntoId',
        provenanceTable: 'provenance',
        trackProvenance: true,
      })
    })
  })

  describe('toArchivedRecords', () => {
    it('converts source records to archived records', () => {
      const sourceRecords: SourceRecord<{ name: string }>[] = [
        {
          id: 'rec-1',
          record: { name: 'John' },
          createdAt: new Date('2023-01-01'),
          updatedAt: new Date('2023-06-01'),
        },
        {
          id: 'rec-2',
          record: { name: 'Jane' },
          createdAt: new Date('2023-02-01'),
          updatedAt: new Date('2023-07-01'),
        },
      ]

      const archivedRecords = toArchivedRecords(sourceRecords, 'golden-1', 'merged')

      expect(archivedRecords).toHaveLength(2)
      expect(archivedRecords[0]).toMatchObject({
        id: 'rec-1',
        record: { name: 'John' },
        archivedReason: 'merged',
        mergedIntoId: 'golden-1',
        createdAt: new Date('2023-01-01'),
        updatedAt: new Date('2023-06-01'),
      })
      expect(archivedRecords[0].archivedAt).toBeInstanceOf(Date)
    })

    it('uses default reason when not specified', () => {
      const sourceRecords: SourceRecord<{ name: string }>[] = [
        {
          id: 'rec-1',
          record: { name: 'John' },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]

      const archivedRecords = toArchivedRecords(sourceRecords, 'golden-1')

      expect(archivedRecords[0].archivedReason).toBe('merged')
    })

    it('handles empty array', () => {
      const archivedRecords = toArchivedRecords([], 'golden-1')
      expect(archivedRecords).toEqual([])
    })
  })

  describe('toSourceRecords', () => {
    it('converts archived records back to source records', () => {
      const archivedRecords: ArchivedRecord<{ name: string }>[] = [
        {
          id: 'rec-1',
          record: { name: 'John' },
          archivedAt: new Date(),
          archivedReason: 'merged',
          mergedIntoId: 'golden-1',
          createdAt: new Date('2023-01-01'),
          updatedAt: new Date('2023-06-01'),
        },
        {
          id: 'rec-2',
          record: { name: 'Jane' },
          archivedAt: new Date(),
          archivedReason: 'merged',
          mergedIntoId: 'golden-1',
          createdAt: new Date('2023-02-01'),
          updatedAt: new Date('2023-07-01'),
        },
      ]

      const sourceRecords = toSourceRecords(archivedRecords)

      expect(sourceRecords).toHaveLength(2)
      expect(sourceRecords[0]).toEqual({
        id: 'rec-1',
        record: { name: 'John' },
        createdAt: new Date('2023-01-01'),
        updatedAt: new Date('2023-06-01'),
      })
    })

    it('handles empty array', () => {
      const sourceRecords = toSourceRecords([])
      expect(sourceRecords).toEqual([])
    })
  })
})
