import { describe, it, expect } from 'vitest'
import { BlockGenerator } from '../../../src/core/blocking/block-generator'
import type { BlockingStrategy } from '../../../src/core/blocking/types'

interface TestRecord {
  id: string
  name: string
  age: number
}

describe('BlockGenerator', () => {
  const generator = new BlockGenerator()

  describe('generateBlocks', () => {
    it('generates blocks using a single strategy', () => {
      const records: TestRecord[] = [
        { id: '1', name: 'Alice', age: 25 },
        { id: '2', name: 'Andrew', age: 30 },
        { id: '3', name: 'Bob', age: 35 },
        { id: '4', name: 'Barbara', age: 40 },
      ]

      const strategy: BlockingStrategy<TestRecord> = {
        name: 'firstLetter',
        generateBlocks: (recs) => {
          const blocks = new Map<string, TestRecord[]>()
          for (const rec of recs) {
            const key = rec.name[0].toUpperCase()
            if (!blocks.has(key)) {
              blocks.set(key, [])
            }
            blocks.get(key)!.push(rec)
          }
          return blocks
        },
      }

      const blocks = generator.generateBlocks(records, strategy)

      expect(blocks.size).toBe(2)
      expect(blocks.get('A')).toHaveLength(2)
      expect(blocks.get('B')).toHaveLength(2)
    })

    it('handles empty record arrays', () => {
      const strategy: BlockingStrategy<TestRecord> = {
        name: 'test',
        generateBlocks: () => new Map(),
      }

      const blocks = generator.generateBlocks([], strategy)
      expect(blocks.size).toBe(0)
    })

    it('handles records with null blocking fields', () => {
      const records = [
        { id: '1', name: 'Alice', age: 25 },
        { id: '2', name: '', age: 30 },
        { id: '3', name: 'Bob', age: 35 },
      ]

      const strategy: BlockingStrategy<(typeof records)[0]> = {
        name: 'firstLetter',
        generateBlocks: (recs) => {
          const blocks = new Map<string, (typeof recs)[0][]>()
          for (const rec of recs) {
            if (!rec.name) continue
            const key = rec.name[0].toUpperCase()
            if (!blocks.has(key)) {
              blocks.set(key, [])
            }
            blocks.get(key)!.push(rec)
          }
          return blocks
        },
      }

      const blocks = generator.generateBlocks(records, strategy)
      expect(blocks.size).toBe(2)
      expect(blocks.get('A')).toHaveLength(1)
      expect(blocks.get('B')).toHaveLength(1)
    })

    it('handles all records in one block', () => {
      const records: TestRecord[] = [
        { id: '1', name: 'Alice', age: 25 },
        { id: '2', name: 'Andrew', age: 30 },
        { id: '3', name: 'Amy', age: 35 },
      ]

      const strategy: BlockingStrategy<TestRecord> = {
        name: 'sameBlock',
        generateBlocks: (recs) => {
          return new Map([['all', recs]])
        },
      }

      const blocks = generator.generateBlocks(records, strategy)
      expect(blocks.size).toBe(1)
      expect(blocks.get('all')).toHaveLength(3)
    })

    it('handles each record in separate block', () => {
      const records: TestRecord[] = [
        { id: '1', name: 'Alice', age: 25 },
        { id: '2', name: 'Bob', age: 30 },
        { id: '3', name: 'Charlie', age: 35 },
      ]

      const strategy: BlockingStrategy<TestRecord> = {
        name: 'separateBlocks',
        generateBlocks: (recs) => {
          const blocks = new Map<string, TestRecord[]>()
          recs.forEach((rec, i) => {
            blocks.set(`block-${i}`, [rec])
          })
          return blocks
        },
      }

      const blocks = generator.generateBlocks(records, strategy)
      expect(blocks.size).toBe(3)
      expect(Array.from(blocks.values()).every((b) => b.length === 1)).toBe(
        true
      )
    })
  })

  describe('generateBlocksComposite', () => {
    it('combines blocks from multiple strategies', () => {
      const records: TestRecord[] = [
        { id: '1', name: 'Alice', age: 25 },
        { id: '2', name: 'Andrew', age: 25 },
        { id: '3', name: 'Bob', age: 30 },
        { id: '4', name: 'Barbara', age: 30 },
      ]

      const strategy1: BlockingStrategy<TestRecord> = {
        name: 'firstName',
        generateBlocks: (recs) => {
          const blocks = new Map<string, TestRecord[]>()
          for (const rec of recs) {
            const key = rec.name[0].toUpperCase()
            if (!blocks.has(key)) blocks.set(key, [])
            blocks.get(key)!.push(rec)
          }
          return blocks
        },
      }

      const strategy2: BlockingStrategy<TestRecord> = {
        name: 'age',
        generateBlocks: (recs) => {
          const blocks = new Map<string, TestRecord[]>()
          for (const rec of recs) {
            const key = String(rec.age)
            if (!blocks.has(key)) blocks.set(key, [])
            blocks.get(key)!.push(rec)
          }
          return blocks
        },
      }

      const blocks = generator.generateBlocksComposite(records, [
        strategy1,
        strategy2,
      ])

      expect(blocks.size).toBeGreaterThan(0)
      expect(blocks.has('firstName:A')).toBe(true)
      expect(blocks.has('age:25')).toBe(true)
    })

    it('handles empty strategy array', () => {
      const records: TestRecord[] = [{ id: '1', name: 'Alice', age: 25 }]
      const blocks = generator.generateBlocksComposite(records, [])
      expect(blocks.size).toBe(0)
    })

    it('handles empty record array', () => {
      const strategy: BlockingStrategy<TestRecord> = {
        name: 'test',
        generateBlocks: () => new Map(),
      }
      const blocks = generator.generateBlocksComposite([], [strategy])
      expect(blocks.size).toBe(0)
    })

    it('uses single strategy directly for one strategy', () => {
      const records: TestRecord[] = [
        { id: '1', name: 'Alice', age: 25 },
        { id: '2', name: 'Andrew', age: 30 },
      ]

      const strategy: BlockingStrategy<TestRecord> = {
        name: 'firstLetter',
        generateBlocks: (recs) => {
          const blocks = new Map<string, TestRecord[]>()
          for (const rec of recs) {
            const key = rec.name[0].toUpperCase()
            if (!blocks.has(key)) blocks.set(key, [])
            blocks.get(key)!.push(rec)
          }
          return blocks
        },
      }

      const blocks = generator.generateBlocksComposite(records, [strategy])
      expect(blocks.size).toBe(1)
      expect(blocks.has('A')).toBe(true)
    })
  })

  describe('calculateStats', () => {
    it('calculates statistics for blocks', () => {
      const blocks = new Map([
        ['A', [{ id: '1' }, { id: '2' }, { id: '3' }] as TestRecord[]],
        ['B', [{ id: '4' }, { id: '5' }] as TestRecord[]],
        ['C', [{ id: '6' }] as TestRecord[]],
      ])

      const stats = generator.calculateStats(blocks)

      expect(stats.totalRecords).toBe(6)
      expect(stats.totalBlocks).toBe(3)
      expect(stats.avgRecordsPerBlock).toBe(2)
      expect(stats.minBlockSize).toBe(1)
      expect(stats.maxBlockSize).toBe(3)
      expect(stats.comparisonsWithBlocking).toBe(4) // (3*2/2) + (2*1/2) + 0 = 3 + 1 + 0
      expect(stats.comparisonsWithoutBlocking).toBe(15) // 6*5/2
      expect(stats.reductionPercentage).toBeCloseTo(73.33, 1)
    })

    it('handles empty block set', () => {
      const stats = generator.calculateStats(new Map())

      expect(stats.totalRecords).toBe(0)
      expect(stats.totalBlocks).toBe(0)
      expect(stats.avgRecordsPerBlock).toBe(0)
      expect(stats.comparisonsWithBlocking).toBe(0)
      expect(stats.comparisonsWithoutBlocking).toBe(0)
      expect(stats.reductionPercentage).toBe(0)
    })

    it('handles single block with all records', () => {
      const blocks = new Map([
        ['all', [{ id: '1' }, { id: '2' }, { id: '3' }] as TestRecord[]],
      ])

      const stats = generator.calculateStats(blocks)

      expect(stats.totalRecords).toBe(3)
      expect(stats.totalBlocks).toBe(1)
      expect(stats.comparisonsWithBlocking).toBe(3) // 3*2/2
      expect(stats.comparisonsWithoutBlocking).toBe(3) // Same as without blocking
      expect(stats.reductionPercentage).toBe(0)
    })

    it('calculates high reduction percentage', () => {
      const blocks = new Map()
      for (let i = 0; i < 100; i++) {
        blocks.set(`block-${i}`, [{ id: `${i}` }] as TestRecord[])
      }

      const stats = generator.calculateStats(blocks)

      expect(stats.totalRecords).toBe(100)
      expect(stats.comparisonsWithBlocking).toBe(0) // No pairs within blocks
      expect(stats.reductionPercentage).toBe(100)
    })
  })

  describe('generatePairs', () => {
    it('generates all unique pairs from blocks', () => {
      const blocks = new Map([
        ['A', [{ id: '1' }, { id: '2' }] as TestRecord[]],
        ['B', [{ id: '3' }, { id: '4' }] as TestRecord[]],
      ])

      const pairs = generator.generatePairs(blocks)

      expect(pairs).toHaveLength(2) // One pair per block
      expect(pairs[0][0].id).toBe('1')
      expect(pairs[0][1].id).toBe('2')
      expect(pairs[1][0].id).toBe('3')
      expect(pairs[1][1].id).toBe('4')
    })

    it('handles empty block set', () => {
      const pairs = generator.generatePairs(new Map())
      expect(pairs).toHaveLength(0)
    })

    it('handles blocks with single records', () => {
      const blocks = new Map([
        ['A', [{ id: '1' }] as TestRecord[]],
        ['B', [{ id: '2' }] as TestRecord[]],
      ])

      const pairs = generator.generatePairs(blocks)
      expect(pairs).toHaveLength(0)
    })

    it('avoids duplicate pairs from overlapping blocks', () => {
      const record1 = { id: '1', name: 'Alice', age: 25 }
      const record2 = { id: '2', name: 'Andrew', age: 30 }

      const blocks = new Map([
        ['A', [record1, record2]],
        ['age-20s', [record1, record2]],
      ])

      const pairs = generator.generatePairs(blocks)

      // Should only have one pair, not two
      expect(pairs).toHaveLength(1)
      expect(pairs[0][0].id).toBe('1')
      expect(pairs[0][1].id).toBe('2')
    })

    it('generates all pairs within a large block', () => {
      const records: TestRecord[] = []
      for (let i = 0; i < 10; i++) {
        records.push({ id: `${i}`, name: 'Test', age: 25 })
      }

      const blocks = new Map([['all', records]])
      const pairs = generator.generatePairs(blocks)

      expect(pairs).toHaveLength(45) // 10*9/2
    })
  })
})
