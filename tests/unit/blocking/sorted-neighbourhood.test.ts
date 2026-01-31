import { describe, it, expect } from 'vitest'
import { SortedNeighbourhoodStrategy } from '../../../src/core/blocking/strategies/sorted-neighbourhood'

interface Person {
  id: string
  firstName: string
  lastName: string
  email?: string
  birthYear?: number
  dateOfBirth?: Date | string
  city?: string
}

describe('SortedNeighbourhoodStrategy', () => {
  describe('sorting', () => {
    it('sorts records by single field', () => {
      const strategy = new SortedNeighbourhoodStrategy<Person>({
        sortBy: 'lastName',
        windowSize: 2,
      })

      const records: Person[] = [
        { id: '1', firstName: 'John', lastName: 'Smith' },
        { id: '2', firstName: 'Alice', lastName: 'Anderson' },
        { id: '3', firstName: 'Bob', lastName: 'Jones' },
      ]

      const blocks = strategy.generateBlocks(records)

      // With windowSize=2 and 3 records, we should have 2 windows
      expect(blocks.size).toBe(2)

      // Window 0: Anderson, Jones (sorted order)
      const window0 = blocks.get('window:0')
      expect(window0).toHaveLength(2)
      expect(window0?.[0].lastName).toBe('Anderson')
      expect(window0?.[1].lastName).toBe('Jones')

      // Window 1: Jones, Smith (sorted order)
      const window1 = blocks.get('window:1')
      expect(window1).toHaveLength(2)
      expect(window1?.[0].lastName).toBe('Jones')
      expect(window1?.[1].lastName).toBe('Smith')
    })

    it('sorts records by multiple fields', () => {
      const strategy = new SortedNeighbourhoodStrategy<Person>({
        sortBy: [
          { field: 'lastName' },
          { field: 'firstName' },
        ],
        windowSize: 2,
      })

      const records: Person[] = [
        { id: '1', firstName: 'John', lastName: 'Smith' },
        { id: '2', firstName: 'Alice', lastName: 'Smith' },
        { id: '3', firstName: 'Bob', lastName: 'Smith' },
      ]

      const blocks = strategy.generateBlocks(records)

      // All have same lastName, so sorted by firstName: Alice, Bob, John
      const window0 = blocks.get('window:0')
      expect(window0?.[0].firstName).toBe('Alice')
      expect(window0?.[1].firstName).toBe('Bob')

      const window1 = blocks.get('window:1')
      expect(window1?.[0].firstName).toBe('Bob')
      expect(window1?.[1].firstName).toBe('John')
    })

    it('applies transforms before sorting', () => {
      const strategy = new SortedNeighbourhoodStrategy<Person>({
        sortBy: {
          field: 'lastName',
          transform: 'soundex',
        },
        windowSize: 2,
      })

      const records: Person[] = [
        { id: '1', firstName: 'John', lastName: 'Smith' },
        { id: '2', firstName: 'Jane', lastName: 'Smyth' },
        { id: '3', firstName: 'Bob', lastName: 'Jones' },
      ]

      const blocks = strategy.generateBlocks(records)

      // Smith and Smyth have same Soundex (S530), Jones is J520
      // So sorted order should be: Jones (J520), Smith (S530), Smyth (S530)
      const window0 = blocks.get('window:0')
      expect(window0?.[0].lastName).toBe('Jones')
      expect(['Smith', 'Smyth']).toContain(window0?.[1].lastName)
    })

    it('supports ascending and descending order', () => {
      const strategyAsc = new SortedNeighbourhoodStrategy<Person>({
        sortBy: { field: 'birthYear', order: 'asc' },
        windowSize: 2,
      })

      const strategyDesc = new SortedNeighbourhoodStrategy<Person>({
        sortBy: { field: 'birthYear', order: 'desc' },
        windowSize: 2,
      })

      const records: Person[] = [
        { id: '1', firstName: 'John', lastName: 'Smith', birthYear: 1990 },
        { id: '2', firstName: 'Jane', lastName: 'Doe', birthYear: 1985 },
        { id: '3', firstName: 'Bob', lastName: 'Jones', birthYear: 1995 },
      ]

      const blocksAsc = strategyAsc.generateBlocks(records)
      const window0Asc = blocksAsc.get('window:0')
      expect(window0Asc?.[0].birthYear).toBe(1985)
      expect(window0Asc?.[1].birthYear).toBe(1990)

      const blocksDesc = strategyDesc.generateBlocks(records)
      const window0Desc = blocksDesc.get('window:0')
      expect(window0Desc?.[0].birthYear).toBe(1995)
      expect(window0Desc?.[1].birthYear).toBe(1990)
    })

    it('handles null values in sort field', () => {
      const strategy = new SortedNeighbourhoodStrategy<Partial<Person>>({
        sortBy: 'lastName',
        windowSize: 2,
        nullStrategy: 'block',
      })

      const records: Partial<Person>[] = [
        { id: '1', firstName: 'John', lastName: 'Smith' },
        { id: '2', firstName: 'Jane' }, // No lastName
        { id: '3', firstName: 'Bob', lastName: 'Jones' },
      ]

      const blocks = strategy.generateBlocks(records)

      // Should sort nulls as empty strings (to beginning)
      // Order: empty string, Jones, Smith
      expect(blocks.size).toBe(2)

      const window0 = blocks.get('window:0')
      expect(window0?.[0].id).toBe('2') // null record
      expect(window0?.[1].lastName).toBe('Jones')
    })

    it('maintains stable sort for equal values', () => {
      const strategy = new SortedNeighbourhoodStrategy<Person>({
        sortBy: 'lastName',
        windowSize: 3,
      })

      const records: Person[] = [
        { id: '1', firstName: 'John', lastName: 'Smith' },
        { id: '2', firstName: 'Jane', lastName: 'Smith' },
        { id: '3', firstName: 'Bob', lastName: 'Smith' },
      ]

      const blocks = strategy.generateBlocks(records)

      // All should be in same window, maintaining original order
      const window0 = blocks.get('window:0')
      expect(window0).toHaveLength(3)
      expect(window0?.[0].id).toBe('1')
      expect(window0?.[1].id).toBe('2')
      expect(window0?.[2].id).toBe('3')
    })
  })

  describe('windowing', () => {
    it('generates sliding windows of specified size', () => {
      const strategy = new SortedNeighbourhoodStrategy<Person>({
        sortBy: 'id',
        windowSize: 3,
      })

      const records: Person[] = [
        { id: '1', firstName: 'A', lastName: 'Last' },
        { id: '2', firstName: 'B', lastName: 'Last' },
        { id: '3', firstName: 'C', lastName: 'Last' },
        { id: '4', firstName: 'D', lastName: 'Last' },
        { id: '5', firstName: 'E', lastName: 'Last' },
      ]

      const blocks = strategy.generateBlocks(records)

      // 5 records with window size 3 = 3 windows (5 - 3 + 1)
      expect(blocks.size).toBe(3)

      // Window 0: records 1, 2, 3
      const window0 = blocks.get('window:0')
      expect(window0?.map((r) => r.id)).toEqual(['1', '2', '3'])

      // Window 1: records 2, 3, 4
      const window1 = blocks.get('window:1')
      expect(window1?.map((r) => r.id)).toEqual(['2', '3', '4'])

      // Window 2: records 3, 4, 5
      const window2 = blocks.get('window:2')
      expect(window2?.map((r) => r.id)).toEqual(['3', '4', '5'])
    })

    it('ensures overlapping windows', () => {
      const strategy = new SortedNeighbourhoodStrategy<Person>({
        sortBy: 'id',
        windowSize: 2,
      })

      const records: Person[] = [
        { id: '1', firstName: 'A', lastName: 'Last' },
        { id: '2', firstName: 'B', lastName: 'Last' },
        { id: '3', firstName: 'C', lastName: 'Last' },
      ]

      const blocks = strategy.generateBlocks(records)

      // 3 records with window size 2 = 2 windows
      expect(blocks.size).toBe(2)

      // Record 2 should appear in both windows
      const window0 = blocks.get('window:0')
      const window1 = blocks.get('window:1')

      expect(window0?.some((r) => r.id === '2')).toBe(true)
      expect(window1?.some((r) => r.id === '2')).toBe(true)

      // Record 1 only in window 0
      expect(window0?.some((r) => r.id === '1')).toBe(true)
      expect(window1?.some((r) => r.id === '1')).toBe(false)

      // Record 3 only in window 1
      expect(window0?.some((r) => r.id === '3')).toBe(false)
      expect(window1?.some((r) => r.id === '3')).toBe(true)
    })

    it('handles window larger than dataset', () => {
      const strategy = new SortedNeighbourhoodStrategy<Person>({
        sortBy: 'id',
        windowSize: 10,
      })

      const records: Person[] = [
        { id: '1', firstName: 'A', lastName: 'Last' },
        { id: '2', firstName: 'B', lastName: 'Last' },
        { id: '3', firstName: 'C', lastName: 'Last' },
      ]

      const blocks = strategy.generateBlocks(records)

      // Window size larger than dataset creates single block with all records
      expect(blocks.size).toBe(1)
      const window0 = blocks.get('window:0')
      expect(window0).toHaveLength(3)
    })

    it('handles window size of 1', () => {
      const strategy = new SortedNeighbourhoodStrategy<Person>({
        sortBy: 'id',
        windowSize: 1,
      })

      const records: Person[] = [
        { id: '1', firstName: 'A', lastName: 'Last' },
        { id: '2', firstName: 'B', lastName: 'Last' },
        { id: '3', firstName: 'C', lastName: 'Last' },
      ]

      const blocks = strategy.generateBlocks(records)

      // Window size of 1 means each record is in its own block
      expect(blocks.size).toBe(3)
      expect(blocks.get('window:0')?.[0].id).toBe('1')
      expect(blocks.get('window:1')?.[0].id).toBe('2')
      expect(blocks.get('window:2')?.[0].id).toBe('3')
    })

    it('each record appears in correct number of windows', () => {
      const strategy = new SortedNeighbourhoodStrategy<Person>({
        sortBy: 'id',
        windowSize: 3,
      })

      const records: Person[] = [
        { id: '1', firstName: 'A', lastName: 'Last' },
        { id: '2', firstName: 'B', lastName: 'Last' },
        { id: '3', firstName: 'C', lastName: 'Last' },
        { id: '4', firstName: 'D', lastName: 'Last' },
        { id: '5', firstName: 'E', lastName: 'Last' },
      ]

      const blocks = strategy.generateBlocks(records)

      // Count how many windows each record appears in
      const recordCounts = new Map<string, number>()

      for (const block of blocks.values()) {
        for (const record of block) {
          recordCounts.set(record.id, (recordCounts.get(record.id) || 0) + 1)
        }
      }

      // First record: in 1 window (window 0)
      expect(recordCounts.get('1')).toBe(1)

      // Second record: in 2 windows (windows 0, 1)
      expect(recordCounts.get('2')).toBe(2)

      // Third record (middle): in 3 windows (windows 0, 1, 2)
      expect(recordCounts.get('3')).toBe(3)

      // Fourth record: in 2 windows (windows 1, 2)
      expect(recordCounts.get('4')).toBe(2)

      // Fifth record: in 1 window (window 2)
      expect(recordCounts.get('5')).toBe(1)
    })
  })

  describe('null handling', () => {
    it('skips records with null sort field when strategy is skip', () => {
      const strategy = new SortedNeighbourhoodStrategy<Partial<Person>>({
        sortBy: 'lastName',
        windowSize: 2,
        nullStrategy: 'skip',
      })

      const records: Partial<Person>[] = [
        { id: '1', firstName: 'John', lastName: 'Smith' },
        { id: '2', firstName: 'Jane' }, // No lastName
        { id: '3', firstName: 'Bob', lastName: 'Jones' },
      ]

      const blocks = strategy.generateBlocks(records)

      // Only 2 records with non-null lastName
      // Total records in all blocks should be 4 (2 records × 2 windows, overlapping)
      let totalRecords = 0
      for (const block of blocks.values()) {
        totalRecords += block.length
      }

      // With 2 records and window size 2, we get 1 window with 2 records
      expect(blocks.size).toBe(1)
      expect(blocks.get('window:0')).toHaveLength(2)

      // Null record should not appear
      for (const block of blocks.values()) {
        expect(block.every((r) => r.lastName != null)).toBe(true)
      }
    })

    it('includes null values when strategy is block', () => {
      const strategy = new SortedNeighbourhoodStrategy<Partial<Person>>({
        sortBy: 'lastName',
        windowSize: 2,
        nullStrategy: 'block',
      })

      const records: Partial<Person>[] = [
        { id: '1', firstName: 'John', lastName: 'Smith' },
        { id: '2', firstName: 'Jane' }, // No lastName
        { id: '3', firstName: 'Bob', lastName: 'Jones' },
      ]

      const blocks = strategy.generateBlocks(records)

      // All 3 records should be included
      const allRecords = new Set<string>()
      for (const block of blocks.values()) {
        for (const record of block) {
          allRecords.add(record.id)
        }
      }

      expect(allRecords.size).toBe(3)
      expect(allRecords.has('1')).toBe(true)
      expect(allRecords.has('2')).toBe(true)
      expect(allRecords.has('3')).toBe(true)
    })

    it('handles all records with null values', () => {
      const strategy = new SortedNeighbourhoodStrategy<Partial<Person>>({
        sortBy: 'lastName',
        windowSize: 2,
        nullStrategy: 'skip',
      })

      const records: Partial<Person>[] = [
        { id: '1', firstName: 'John' },
        { id: '2', firstName: 'Jane' },
        { id: '3', firstName: 'Bob' },
      ]

      const blocks = strategy.generateBlocks(records)

      // All records skipped, no blocks
      expect(blocks.size).toBe(0)
    })
  })

  describe('edge cases', () => {
    it('handles empty record array', () => {
      const strategy = new SortedNeighbourhoodStrategy<Person>({
        sortBy: 'lastName',
        windowSize: 5,
      })

      const blocks = strategy.generateBlocks([])
      expect(blocks.size).toBe(0)
    })

    it('handles single record', () => {
      const strategy = new SortedNeighbourhoodStrategy<Person>({
        sortBy: 'lastName',
        windowSize: 5,
      })

      const records: Person[] = [{ id: '1', firstName: 'John', lastName: 'Smith' }]

      const blocks = strategy.generateBlocks(records)

      // Single record creates 1 window
      expect(blocks.size).toBe(1)
      expect(blocks.get('window:0')).toHaveLength(1)
    })

    it('handles two records with window size 2', () => {
      const strategy = new SortedNeighbourhoodStrategy<Person>({
        sortBy: 'lastName',
        windowSize: 2,
      })

      const records: Person[] = [
        { id: '1', firstName: 'John', lastName: 'Smith' },
        { id: '2', firstName: 'Jane', lastName: 'Jones' },
      ]

      const blocks = strategy.generateBlocks(records)

      // 2 records with window size 2 creates 1 window
      expect(blocks.size).toBe(1)
      expect(blocks.get('window:0')).toHaveLength(2)
    })

    it('handles missing nested fields', () => {
      interface NestedPerson {
        id: string
        user?: {
          profile?: {
            lastName?: string
          }
        }
      }

      const strategy = new SortedNeighbourhoodStrategy<NestedPerson>({
        sortBy: 'user.profile.lastName',
        windowSize: 2,
        nullStrategy: 'skip',
      })

      const records: NestedPerson[] = [
        { id: '1', user: { profile: { lastName: 'Smith' } } },
        { id: '2', user: {} },
        { id: '3', user: { profile: { lastName: 'Jones' } } },
      ]

      const blocks = strategy.generateBlocks(records)

      // Only 2 records with non-null nested field
      expect(blocks.size).toBe(1)
      expect(blocks.get('window:0')).toHaveLength(2)
    })
  })

  describe('transform integration', () => {
    it('works with year transform', () => {
      const strategy = new SortedNeighbourhoodStrategy<Person>({
        sortBy: {
          field: 'dateOfBirth',
          transform: 'year',
        },
        windowSize: 2,
      })

      const records: Person[] = [
        { id: '1', firstName: 'John', lastName: 'Smith', dateOfBirth: new Date('1995-06-15') },
        { id: '2', firstName: 'Jane', lastName: 'Doe', dateOfBirth: new Date('1985-03-20') },
        { id: '3', firstName: 'Bob', lastName: 'Jones', dateOfBirth: new Date('1990-11-30') },
      ]

      const blocks = strategy.generateBlocks(records)

      // Sorted by year: 1985, 1990, 1995
      const window0 = blocks.get('window:0')
      expect(window0?.[0].id).toBe('2') // 1985
      expect(window0?.[1].id).toBe('3') // 1990
    })

    it('works with firstLetter transform', () => {
      const strategy = new SortedNeighbourhoodStrategy<Person>({
        sortBy: {
          field: 'lastName',
          transform: 'firstLetter',
        },
        windowSize: 2,
      })

      const records: Person[] = [
        { id: '1', firstName: 'John', lastName: 'Smith' },
        { id: '2', firstName: 'Alice', lastName: 'Anderson' },
        { id: '3', firstName: 'Bob', lastName: 'Jones' },
      ]

      const blocks = strategy.generateBlocks(records)

      // Sorted by first letter: A, J, S
      const window0 = blocks.get('window:0')
      expect(window0?.[0].lastName).toBe('Anderson')
      expect(window0?.[1].lastName).toBe('Jones')
    })

    it('works with custom transform', () => {
      const strategy = new SortedNeighbourhoodStrategy<Person>({
        sortBy: {
          field: 'email',
          transform: (value) => {
            if (!value || typeof value !== 'string') return null
            const domain = value.split('@')[1]
            return domain || null
          },
        },
        windowSize: 2,
      })

      const records: Person[] = [
        { id: '1', firstName: 'John', lastName: 'Smith', email: 'john@zzz.com' },
        { id: '2', firstName: 'Jane', lastName: 'Doe', email: 'jane@aaa.com' },
        { id: '3', firstName: 'Bob', lastName: 'Jones', email: 'bob@mmm.com' },
      ]

      const blocks = strategy.generateBlocks(records)

      // Sorted by domain: aaa.com, mmm.com, zzz.com
      const window0 = blocks.get('window:0')
      expect(window0?.[0].email).toBe('jane@aaa.com')
      expect(window0?.[1].email).toBe('bob@mmm.com')
    })
  })

  describe('strategy naming', () => {
    it('generates name for single field', () => {
      const strategy = new SortedNeighbourhoodStrategy<Person>({
        sortBy: 'lastName',
        windowSize: 10,
      })

      expect(strategy.name).toBe('sorted-neighbourhood:lastName:w10')
    })

    it('generates name for multiple fields', () => {
      const strategy = new SortedNeighbourhoodStrategy<Person>({
        sortBy: [
          { field: 'lastName' },
          { field: 'firstName' },
        ],
        windowSize: 20,
      })

      expect(strategy.name).toBe('sorted-neighbourhood:lastName+firstName:w20')
    })

    it('generates name with string array', () => {
      const strategy = new SortedNeighbourhoodStrategy<Person>({
        sortBy: ['lastName', 'firstName'],
        windowSize: 15,
      })

      expect(strategy.name).toBe('sorted-neighbourhood:lastName+firstName:w15')
    })
  })

  describe('performance characteristics', () => {
    it('handles 1000 records efficiently', () => {
      const strategy = new SortedNeighbourhoodStrategy<Person>({
        sortBy: 'lastName',
        windowSize: 10,
      })

      const records: Person[] = []
      for (let i = 0; i < 1000; i++) {
        records.push({
          id: String(i),
          firstName: `First${i}`,
          lastName: `Last${i % 100}`, // Create some overlap
        })
      }

      const start = performance.now()
      const blocks = strategy.generateBlocks(records)
      const duration = performance.now() - start

      expect(blocks.size).toBeGreaterThan(0)
      expect(duration).toBeLessThan(100) // Should be fast for 1k records
    })

    it('properly reduces comparison space', () => {
      const strategy = new SortedNeighbourhoodStrategy<Person>({
        sortBy: 'id',
        windowSize: 10,
      })

      const records: Person[] = []
      for (let i = 0; i < 100; i++) {
        records.push({
          id: String(i).padStart(3, '0'), // Ensure lexicographic sort
          firstName: `First${i}`,
          lastName: `Last${i}`,
        })
      }

      const blocks = strategy.generateBlocks(records)

      // Count total comparisons within blocks
      let totalComparisons = 0
      for (const block of blocks.values()) {
        // Comparisons within a block: n*(n-1)/2
        const n = block.length
        totalComparisons += (n * (n - 1)) / 2
      }

      // Without blocking: 100*99/2 = 4,950 comparisons
      const withoutBlocking = (100 * 99) / 2

      // With window size 10: (100 - 10 + 1) windows * (10 * 9 / 2) = 91 * 45 = 4,095 comparisons
      // But due to deduplication in generatePairs, actual unique comparisons would be less
      // The comparisons within blocks should be around 4,095
      expect(totalComparisons).toBeLessThan(withoutBlocking)

      // Calculate reduction percentage
      const reduction = (1 - totalComparisons / withoutBlocking) * 100
      // Window size 10 gives us ~17% reduction in raw comparisons (before deduplication)
      // The real power of sorted neighbourhood is catching matches that standard blocking misses
      expect(reduction).toBeGreaterThan(0) // Should reduce comparisons
      expect(totalComparisons).toBeLessThan(5000) // Less than without blocking
    })
  })
})
