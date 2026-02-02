import { describe, it, expect } from 'vitest'
import {
  preferNewer,
  preferOlder,
} from '../../../../src/merge/strategies/temporal-strategies.js'
import type { SourceRecord } from '../../../../src/merge/types.js'

const createRecord = (
  data: Record<string, unknown>,
  updatedAt: Date,
  createdAt?: Date
): SourceRecord => ({
  id: `rec-${Math.random().toString(36).slice(2)}`,
  record: data,
  createdAt: createdAt ?? updatedAt,
  updatedAt,
})

describe('Temporal Strategies', () => {
  describe('preferNewer', () => {
    it('returns value from record with latest timestamp', () => {
      const records = [
        createRecord({ name: 'Old' }, new Date('2024-01-01')),
        createRecord({ name: 'New' }, new Date('2024-06-01')),
        createRecord({ name: 'Middle' }, new Date('2024-03-01')),
      ]
      expect(preferNewer(['Old', 'New', 'Middle'], records)).toBe('New')
    })

    it('uses specified date field from record data', () => {
      const records = [
        createRecord(
          { name: 'Old', modifiedDate: new Date('2024-06-01') },
          new Date('2024-01-01')
        ),
        createRecord(
          { name: 'New', modifiedDate: new Date('2024-01-01') },
          new Date('2024-06-01')
        ),
      ]
      expect(
        preferNewer(['Old', 'New'], records, { dateField: 'modifiedDate' })
      ).toBe('Old')
    })

    it('handles missing timestamps gracefully', () => {
      const records = [
        createRecord({ name: 'A' }, new Date('2024-01-01')),
        {
          id: 'no-date',
          record: { name: 'B' },
          createdAt: null as any,
          updatedAt: null as any,
        },
      ]
      expect(preferNewer(['A', 'B'], records)).toBe('A')
    })

    it('handles equal timestamps (returns first encountered)', () => {
      const sameDate = new Date('2024-01-01')
      const records = [
        createRecord({ name: 'First' }, sameDate),
        createRecord({ name: 'Second' }, sameDate),
      ]
      expect(preferNewer(['First', 'Second'], records)).toBe('First')
    })

    it('skips null values', () => {
      const records = [
        createRecord({ name: 'Old' }, new Date('2024-01-01')),
        createRecord({ name: 'Newer' }, new Date('2024-06-01')),
      ]
      expect(preferNewer([null, 'Newer'], records)).toBe('Newer')
    })

    it('skips undefined values', () => {
      const records = [
        createRecord({ name: 'Old' }, new Date('2024-01-01')),
        createRecord({ name: 'Newer' }, new Date('2024-06-01')),
      ]
      expect(preferNewer([undefined, 'Newer'], records)).toBe('Newer')
    })

    it('handles empty array', () => {
      expect(preferNewer([], [])).toBeUndefined()
    })

    it('handles single value', () => {
      const records = [createRecord({ name: 'Only' }, new Date('2024-01-01'))]
      expect(preferNewer(['Only'], records)).toBe('Only')
    })

    it('falls back to first non-null when no valid timestamps', () => {
      const records = [
        { id: '1', record: {}, createdAt: null as any, updatedAt: null as any },
        { id: '2', record: {}, createdAt: null as any, updatedAt: null as any },
      ]
      expect(preferNewer([null, 'Value'], records)).toBe('Value')
    })

    it('handles mismatch between values and records length', () => {
      const records = [createRecord({}, new Date())]
      expect(preferNewer(['A', 'B', 'C'], records)).toBe('A')
    })

    it('handles date strings in custom date field', () => {
      const records = [
        createRecord({ modDate: '2024-01-01' }, new Date('2024-06-01')),
        createRecord({ modDate: '2024-12-01' }, new Date('2024-01-01')),
      ]
      expect(
        preferNewer(['Old', 'New'], records, { dateField: 'modDate' })
      ).toBe('New')
    })

    it('handles numeric timestamps in custom date field', () => {
      const records = [
        createRecord(
          { timestamp: Date.parse('2024-01-01') },
          new Date('2024-06-01')
        ),
        createRecord(
          { timestamp: Date.parse('2024-12-01') },
          new Date('2024-01-01')
        ),
      ]
      expect(
        preferNewer(['Old', 'New'], records, { dateField: 'timestamp' })
      ).toBe('New')
    })

    it('handles invalid date in custom field', () => {
      const records = [
        createRecord({ modDate: 'invalid-date' }, new Date('2024-01-01')),
        createRecord({ modDate: '2024-06-01' }, new Date('2024-01-01')),
      ]
      expect(preferNewer(['A', 'B'], records, { dateField: 'modDate' })).toBe(
        'B'
      )
    })

    it('handles nested date field path', () => {
      const records = [
        createRecord({ meta: { updated: new Date('2024-01-01') } }, new Date()),
        createRecord({ meta: { updated: new Date('2024-06-01') } }, new Date()),
      ]
      expect(
        preferNewer(['Old', 'New'], records, { dateField: 'meta.updated' })
      ).toBe('New')
    })

    it('respects nullHandling: include', () => {
      const records = [
        createRecord({}, new Date('2024-01-01')),
        createRecord({}, new Date('2024-06-01')),
      ]
      expect(
        preferNewer([null, 'Value'], records, { nullHandling: 'include' })
      ).toBe('Value')
    })
  })

  describe('preferOlder', () => {
    it('returns value from record with earliest timestamp', () => {
      const records = [
        createRecord({ name: 'New' }, new Date('2024-06-01')),
        createRecord({ name: 'Old' }, new Date('2024-01-01')),
        createRecord({ name: 'Middle' }, new Date('2024-03-01')),
      ]
      expect(preferOlder(['New', 'Old', 'Middle'], records)).toBe('Old')
    })

    it('uses specified date field from record data', () => {
      const records = [
        createRecord(
          { name: 'Newer', originalDate: new Date('2024-06-01') },
          new Date('2024-01-01')
        ),
        createRecord(
          { name: 'Older', originalDate: new Date('2024-01-01') },
          new Date('2024-06-01')
        ),
      ]
      expect(
        preferOlder(['Newer', 'Older'], records, { dateField: 'originalDate' })
      ).toBe('Older')
    })

    it('handles missing timestamps gracefully', () => {
      const records = [
        createRecord({ name: 'A' }, new Date('2024-06-01')),
        {
          id: 'no-date',
          record: { name: 'B' },
          createdAt: null as any,
          updatedAt: null as any,
        },
      ]
      expect(preferOlder(['A', 'B'], records)).toBe('A')
    })

    it('handles equal timestamps (returns first encountered)', () => {
      const sameDate = new Date('2024-01-01')
      const records = [
        createRecord({ name: 'First' }, sameDate),
        createRecord({ name: 'Second' }, sameDate),
      ]
      expect(preferOlder(['First', 'Second'], records)).toBe('First')
    })

    it('skips null values', () => {
      const records = [
        createRecord({ name: 'Newer' }, new Date('2024-06-01')),
        createRecord({ name: 'Older' }, new Date('2024-01-01')),
      ]
      expect(preferOlder([null, 'Older'], records)).toBe('Older')
    })

    it('handles empty array', () => {
      expect(preferOlder([], [])).toBeUndefined()
    })

    it('handles single value', () => {
      const records = [createRecord({ name: 'Only' }, new Date('2024-01-01'))]
      expect(preferOlder(['Only'], records)).toBe('Only')
    })

    it('falls back to first non-null when no valid timestamps', () => {
      const records = [
        { id: '1', record: {}, createdAt: null as any, updatedAt: null as any },
        { id: '2', record: {}, createdAt: null as any, updatedAt: null as any },
      ]
      expect(preferOlder([null, 'Value'], records)).toBe('Value')
    })

    it('handles mismatch between values and records length', () => {
      const records = [createRecord({}, new Date())]
      expect(preferOlder(['A', 'B', 'C'], records)).toBe('A')
    })

    it('handles nested date field path', () => {
      const records = [
        createRecord({ meta: { created: new Date('2024-06-01') } }, new Date()),
        createRecord({ meta: { created: new Date('2024-01-01') } }, new Date()),
      ]
      expect(
        preferOlder(['Newer', 'Older'], records, { dateField: 'meta.created' })
      ).toBe('Older')
    })
  })
})
