import { describe, it, expect } from 'vitest'
import {
  CompositeBlockingStrategy,
  StandardBlockingStrategy,
  SortedNeighbourhoodStrategy,
} from '../../../src/core/blocking'

interface Person {
  id: string
  firstName: string
  lastName: string
  email?: string
  birthYear?: number
  dateOfBirth?: Date | string
}

describe('CompositeBlockingStrategy', () => {
  describe('constructor', () => {
    it('requires at least one strategy', () => {
      expect(() => {
        new CompositeBlockingStrategy<Person>({
          strategies: [],
        })
      }).toThrow('CompositeBlockingStrategy requires at least one strategy')
    })

    it('defaults to union mode', () => {
      const strategy = new CompositeBlockingStrategy<Person>({
        strategies: [new StandardBlockingStrategy({ field: 'lastName' })],
      })

      expect(strategy.name).toContain('union')
    })

    it('accepts explicit mode configuration', () => {
      const unionStrategy = new CompositeBlockingStrategy<Person>({
        strategies: [new StandardBlockingStrategy({ field: 'lastName' })],
        mode: 'union',
      })

      const intersectionStrategy = new CompositeBlockingStrategy<Person>({
        strategies: [new StandardBlockingStrategy({ field: 'lastName' })],
        mode: 'intersection',
      })

      expect(unionStrategy.name).toContain('union')
      expect(intersectionStrategy.name).toContain('intersection')
    })
  })

  describe('union mode', () => {
    it('combines blocks from all strategies', () => {
      const strategy = new CompositeBlockingStrategy<Person>({
        strategies: [
          new StandardBlockingStrategy({
            field: 'lastName',
            transform: 'firstLetter',
          }),
          new StandardBlockingStrategy({ field: 'birthYear' }),
        ],
        mode: 'union',
      })

      const records: Person[] = [
        { id: '1', firstName: 'John', lastName: 'Smith', birthYear: 1990 },
        { id: '2', firstName: 'Jane', lastName: 'Smith', birthYear: 1985 },
        { id: '3', firstName: 'Bob', lastName: 'Jones', birthYear: 1990 },
      ]

      const blocks = strategy.generateBlocks(records)

      // Should have blocks from both strategies
      // Strategy 0: lastName first letter (S, J)
      // Strategy 1: birthYear (1990, 1985)
      expect(blocks.size).toBe(4) // s0:lastname:s, s0:lastname:j, s1:birthyear:1990, s1:birthyear:1985
    })

    it('compares record pairs if they match ANY strategy', () => {
      const strategy = new CompositeBlockingStrategy<Person>({
        strategies: [
          new StandardBlockingStrategy({
            field: 'lastName',
            transform: 'firstLetter',
          }),
          new StandardBlockingStrategy({ field: 'birthYear' }),
        ],
        mode: 'union',
      })

      const records: Person[] = [
        { id: '1', firstName: 'John', lastName: 'Smith', birthYear: 1990 },
        { id: '2', firstName: 'Jane', lastName: 'Smith', birthYear: 1985 },
        { id: '3', firstName: 'Bob', lastName: 'Jones', birthYear: 1990 },
      ]

      const blocks = strategy.generateBlocks(records)

      // Record 1 and 2 should be in same block (both have lastName starting with S)
      const block1 = blocks.get('s0:lastname:s')
      expect(block1).toHaveLength(2)
      expect(block1).toContainEqual(records[0])
      expect(block1).toContainEqual(records[1])

      // Record 1 and 3 should be in same block (both have birthYear 1990)
      const block2 = blocks.get('s1:birthyear:1990')
      expect(block2).toHaveLength(2)
      expect(block2).toContainEqual(records[0])
      expect(block2).toContainEqual(records[2])
    })

    it('increases comparisons vs single strategy', () => {
      const singleStrategy = new StandardBlockingStrategy<Person>({
        field: 'lastName',
        transform: 'firstLetter',
      })

      const compositeStrategy = new CompositeBlockingStrategy<Person>({
        strategies: [
          new StandardBlockingStrategy({
            field: 'lastName',
            transform: 'firstLetter',
          }),
          new StandardBlockingStrategy({ field: 'birthYear' }),
        ],
        mode: 'union',
      })

      const records: Person[] = [
        { id: '1', firstName: 'John', lastName: 'Smith', birthYear: 1990 },
        { id: '2', firstName: 'Jane', lastName: 'Anderson', birthYear: 1985 },
        { id: '3', firstName: 'Bob', lastName: 'Brown', birthYear: 1990 },
      ]

      const singleBlocks = singleStrategy.generateBlocks(records)
      const compositeBlocks = compositeStrategy.generateBlocks(records)

      // Single strategy creates 3 separate blocks (S, A, B)
      expect(singleBlocks.size).toBe(3)

      // Composite strategy creates more blocks (from both strategies)
      expect(compositeBlocks.size).toBeGreaterThan(singleBlocks.size)
    })

    it('improves recall by catching matches from different strategies', () => {
      const strategy = new CompositeBlockingStrategy<Person>({
        strategies: [
          // Strategy 1: Block on Soundex of last name
          new StandardBlockingStrategy({
            field: 'lastName',
            transform: 'soundex',
          }),
          // Strategy 2: Block on birth year
          new StandardBlockingStrategy({ field: 'birthYear' }),
        ],
        mode: 'union',
      })

      const records: Person[] = [
        { id: '1', firstName: 'John', lastName: 'Smith', birthYear: 1990 },
        { id: '2', firstName: 'Jane', lastName: 'Smyth', birthYear: 1985 }, // Similar name, different year
        { id: '3', firstName: 'Bob', lastName: 'Johnson', birthYear: 1990 }, // Different name, same year
      ]

      const blocks = strategy.generateBlocks(records)

      // Record 1 and 2 should be in same block (Soundex match: Smith/Smyth)
      const soundexBlock = blocks.get('s0:lastname:s530')
      expect(soundexBlock).toBeDefined()
      expect(soundexBlock).toHaveLength(2)

      // Record 1 and 3 should be in same block (same birth year)
      const yearBlock = blocks.get('s1:birthyear:1990')
      expect(yearBlock).toBeDefined()
      expect(yearBlock).toHaveLength(2)
    })

    it('handles more than two strategies', () => {
      const strategy = new CompositeBlockingStrategy<Person>({
        strategies: [
          new StandardBlockingStrategy({
            field: 'lastName',
            transform: 'firstLetter',
          }),
          new StandardBlockingStrategy({
            field: 'firstName',
            transform: 'firstLetter',
          }),
          new StandardBlockingStrategy({ field: 'birthYear' }),
        ],
        mode: 'union',
      })

      const records: Person[] = [
        { id: '1', firstName: 'John', lastName: 'Smith', birthYear: 1990 },
        { id: '2', firstName: 'Jane', lastName: 'Smith', birthYear: 1985 },
      ]

      const blocks = strategy.generateBlocks(records)

      // Should have blocks from all three strategies
      expect(blocks.size).toBeGreaterThan(0)
      // Records should be together in the lastName block
      expect(blocks.get('s0:lastname:s')).toHaveLength(2)
    })
  })

  describe('intersection mode', () => {
    it('only keeps blocks present in ALL strategies', () => {
      const strategy = new CompositeBlockingStrategy<Person>({
        strategies: [
          new StandardBlockingStrategy({
            field: 'lastName',
            transform: 'firstLetter',
          }),
          new StandardBlockingStrategy({ field: 'birthYear' }),
        ],
        mode: 'intersection',
      })

      const records: Person[] = [
        { id: '1', firstName: 'John', lastName: 'Smith', birthYear: 1990 },
        { id: '2', firstName: 'Jane', lastName: 'Smith', birthYear: 1990 }, // Same lastName first letter AND same year
        { id: '3', firstName: 'Bob', lastName: 'Smith', birthYear: 1985 }, // Same lastName first letter but different year
        { id: '4', firstName: 'Alice', lastName: 'Jones', birthYear: 1990 }, // Different lastName first letter but same year
      ]

      const blocks = strategy.generateBlocks(records)

      // Only records 1 and 2 should be in a block together (they match on BOTH strategies)
      const intersectionBlock = Array.from(blocks.values()).find(
        (b) => b.length === 2
      )
      expect(intersectionBlock).toBeDefined()
      expect(intersectionBlock).toContainEqual(records[0])
      expect(intersectionBlock).toContainEqual(records[1])

      // Records 3 and 4 should each be in separate blocks or not in any block
      const singleRecordBlocks = Array.from(blocks.values()).filter(
        (b) => b.length === 1
      )
      expect(singleRecordBlocks.length).toBeGreaterThanOrEqual(2)
    })

    it('only compares record pairs matching ALL strategies', () => {
      const strategy = new CompositeBlockingStrategy<Person>({
        strategies: [
          new StandardBlockingStrategy({
            field: 'lastName',
            transform: 'firstLetter',
          }),
          new StandardBlockingStrategy({ field: 'birthYear' }),
        ],
        mode: 'intersection',
      })

      const records: Person[] = [
        { id: '1', firstName: 'John', lastName: 'Smith', birthYear: 1990 },
        { id: '2', firstName: 'Jane', lastName: 'Smyth', birthYear: 1990 }, // Both S and 1990
        { id: '3', firstName: 'Bob', lastName: 'Smith', birthYear: 1985 }, // S but different year
      ]

      const blocks = strategy.generateBlocks(records)

      // Records 1 and 2 should be together
      const matchingBlock = Array.from(blocks.values()).find(
        (b) => b.length === 2
      )
      expect(matchingBlock).toBeDefined()
      expect(matchingBlock).toContainEqual(records[0])
      expect(matchingBlock).toContainEqual(records[1])
    })

    it('reduces comparisons vs union mode', () => {
      const records: Person[] = [
        { id: '1', firstName: 'John', lastName: 'Smith', birthYear: 1990 },
        { id: '2', firstName: 'Jane', lastName: 'Smith', birthYear: 1985 },
        { id: '3', firstName: 'Bob', lastName: 'Jones', birthYear: 1990 },
        { id: '4', firstName: 'Alice', lastName: 'Smith', birthYear: 1990 },
      ]

      const unionStrategy = new CompositeBlockingStrategy<Person>({
        strategies: [
          new StandardBlockingStrategy({
            field: 'lastName',
            transform: 'firstLetter',
          }),
          new StandardBlockingStrategy({ field: 'birthYear' }),
        ],
        mode: 'union',
      })

      const intersectionStrategy = new CompositeBlockingStrategy<Person>({
        strategies: [
          new StandardBlockingStrategy({
            field: 'lastName',
            transform: 'firstLetter',
          }),
          new StandardBlockingStrategy({ field: 'birthYear' }),
        ],
        mode: 'intersection',
      })

      const unionBlocks = unionStrategy.generateBlocks(records)
      const intersectionBlocks = intersectionStrategy.generateBlocks(records)

      // Count total records in blocks (accounting for duplicates in union mode)
      const unionRecordCount = Array.from(unionBlocks.values()).reduce(
        (sum, block) => sum + block.length,
        0
      )
      const intersectionRecordCount = Array.from(
        intersectionBlocks.values()
      ).reduce((sum, block) => sum + block.length, 0)

      // Intersection should have fewer or equal records in blocks
      expect(intersectionRecordCount).toBeLessThanOrEqual(unionRecordCount)
    })

    it('reduces recall but improves precision', () => {
      const strategy = new CompositeBlockingStrategy<Person>({
        strategies: [
          new StandardBlockingStrategy({
            field: 'lastName',
            transform: 'soundex',
          }),
          new StandardBlockingStrategy({ field: 'birthYear' }),
        ],
        mode: 'intersection',
      })

      const records: Person[] = [
        { id: '1', firstName: 'John', lastName: 'Smith', birthYear: 1990 },
        { id: '2', firstName: 'Jane', lastName: 'Smyth', birthYear: 1990 }, // Soundex match AND same year
        { id: '3', firstName: 'Bob', lastName: 'Smythe', birthYear: 1985 }, // Soundex match but different year
      ]

      const blocks = strategy.generateBlocks(records)

      // Only records 1 and 2 should be in a block together
      const mainBlock = Array.from(blocks.values()).find((b) => b.length === 2)
      expect(mainBlock).toBeDefined()
      expect(mainBlock).toContainEqual(records[0])
      expect(mainBlock).toContainEqual(records[1])

      // Record 3 will not be compared with 1 or 2 despite Soundex match
      const record3Blocks = Array.from(blocks.values()).filter((b) =>
        b.includes(records[2])
      )
      expect(record3Blocks.every((b) => b.length === 1)).toBe(true)
    })

    it('handles three or more strategies', () => {
      const strategy = new CompositeBlockingStrategy<Person>({
        strategies: [
          new StandardBlockingStrategy({
            field: 'lastName',
            transform: 'firstLetter',
          }),
          new StandardBlockingStrategy({
            field: 'firstName',
            transform: 'firstLetter',
          }),
          new StandardBlockingStrategy({ field: 'birthYear' }),
        ],
        mode: 'intersection',
      })

      const records: Person[] = [
        { id: '1', firstName: 'John', lastName: 'Smith', birthYear: 1990 },
        { id: '2', firstName: 'Jane', lastName: 'Smith', birthYear: 1990 }, // S, J, 1990
        { id: '3', firstName: 'Jack', lastName: 'Smith', birthYear: 1990 }, // S, J, 1990
      ]

      const blocks = strategy.generateBlocks(records)

      // Records 2 and 3 should be together (both J, S, 1990)
      const matchingBlock = Array.from(blocks.values()).find(
        (b) => b.includes(records[1]) && b.includes(records[2])
      )
      expect(matchingBlock).toBeDefined()
    })
  })

  describe('edge cases', () => {
    it('handles empty block sets', () => {
      const strategy = new CompositeBlockingStrategy<Partial<Person>>({
        strategies: [
          new StandardBlockingStrategy({
            field: 'lastName',
            nullStrategy: 'skip',
          }),
          new StandardBlockingStrategy({
            field: 'birthYear',
            nullStrategy: 'skip',
          }),
        ],
        mode: 'union',
      })

      const records: Partial<Person>[] = [
        { id: '1', firstName: 'John' }, // No lastName or birthYear
        { id: '2', firstName: 'Jane' }, // No lastName or birthYear
      ]

      const blocks = strategy.generateBlocks(records)

      // All records skipped due to null values
      expect(blocks.size).toBe(0)
    })

    it('handles empty record array', () => {
      const strategy = new CompositeBlockingStrategy<Person>({
        strategies: [
          new StandardBlockingStrategy({ field: 'lastName' }),
          new StandardBlockingStrategy({ field: 'birthYear' }),
        ],
      })

      const blocks = strategy.generateBlocks([])
      expect(blocks.size).toBe(0)
    })

    it('handles single strategy (passthrough)', () => {
      const singleStrategy = new StandardBlockingStrategy<Person>({
        field: 'lastName',
        transform: 'firstLetter',
      })

      const compositeStrategy = new CompositeBlockingStrategy<Person>({
        strategies: [singleStrategy],
      })

      const records: Person[] = [
        { id: '1', firstName: 'John', lastName: 'Smith' },
        { id: '2', firstName: 'Jane', lastName: 'Smith' },
        { id: '3', firstName: 'Bob', lastName: 'Jones' },
      ]

      const singleBlocks = singleStrategy.generateBlocks(records)
      const compositeBlocks = compositeStrategy.generateBlocks(records)

      // Should produce same results
      expect(compositeBlocks.size).toBe(singleBlocks.size)
    })

    it('handles strategies with no overlapping blocks', () => {
      const strategy = new CompositeBlockingStrategy<Person>({
        strategies: [
          new StandardBlockingStrategy({ field: 'lastName' }),
          new StandardBlockingStrategy({ field: 'birthYear' }),
        ],
        mode: 'intersection',
      })

      const records: Person[] = [
        { id: '1', firstName: 'John', lastName: 'Smith', birthYear: 1990 },
        { id: '2', firstName: 'Jane', lastName: 'Jones', birthYear: 1985 },
        { id: '3', firstName: 'Bob', lastName: 'Brown', birthYear: 1980 },
      ]

      const blocks = strategy.generateBlocks(records)

      // No records match on both strategies, so each record is in its own block
      expect(Array.from(blocks.values()).every((b) => b.length === 1)).toBe(
        true
      )
    })

    it('handles single record', () => {
      const strategy = new CompositeBlockingStrategy<Person>({
        strategies: [
          new StandardBlockingStrategy({ field: 'lastName' }),
          new StandardBlockingStrategy({ field: 'birthYear' }),
        ],
      })

      const records: Person[] = [
        { id: '1', firstName: 'John', lastName: 'Smith', birthYear: 1990 },
      ]

      const blocks = strategy.generateBlocks(records)
      expect(blocks.size).toBeGreaterThan(0)
    })
  })

  describe('strategy combinations', () => {
    it('combines standard and sorted neighbourhood strategies', () => {
      const strategy = new CompositeBlockingStrategy<Person>({
        strategies: [
          new StandardBlockingStrategy({
            field: 'lastName',
            transform: 'soundex',
          }),
          new SortedNeighbourhoodStrategy({
            sortBy: 'birthYear',
            windowSize: 2,
          }),
        ],
        mode: 'union',
      })

      const records: Person[] = [
        { id: '1', firstName: 'John', lastName: 'Smith', birthYear: 1990 },
        { id: '2', firstName: 'Jane', lastName: 'Smyth', birthYear: 1985 },
        { id: '3', firstName: 'Bob', lastName: 'Jones', birthYear: 1988 },
      ]

      const blocks = strategy.generateBlocks(records)

      // Should have blocks from both strategies
      expect(blocks.size).toBeGreaterThan(0)
    })

    it('combines multiple standard strategies with different transforms', () => {
      const strategy = new CompositeBlockingStrategy<Person>({
        strategies: [
          new StandardBlockingStrategy({
            field: 'lastName',
            transform: 'soundex',
          }),
          new StandardBlockingStrategy({
            field: 'lastName',
            transform: 'metaphone',
          }),
          new StandardBlockingStrategy({
            field: 'lastName',
            transform: 'firstLetter',
          }),
        ],
        mode: 'union',
      })

      const records: Person[] = [
        { id: '1', firstName: 'John', lastName: 'Smith' },
        { id: '2', firstName: 'Jane', lastName: 'Smyth' },
      ]

      const blocks = strategy.generateBlocks(records)

      // Multiple phonetic encodings increase chance of matching
      expect(blocks.size).toBeGreaterThan(0)
    })
  })

  describe('strategy naming', () => {
    it('generates name for union mode', () => {
      const strategy = new CompositeBlockingStrategy<Person>({
        strategies: [
          new StandardBlockingStrategy({ field: 'lastName' }),
          new StandardBlockingStrategy({ field: 'birthYear' }),
        ],
        mode: 'union',
      })

      expect(strategy.name).toBe(
        'composite:union:[standard:lastName+standard:birthYear]'
      )
    })

    it('generates name for intersection mode', () => {
      const strategy = new CompositeBlockingStrategy<Person>({
        strategies: [
          new StandardBlockingStrategy({ field: 'lastName' }),
          new StandardBlockingStrategy({ field: 'birthYear' }),
        ],
        mode: 'intersection',
      })

      expect(strategy.name).toBe(
        'composite:intersection:[standard:lastName+standard:birthYear]'
      )
    })

    it('includes all strategy names', () => {
      const strategy = new CompositeBlockingStrategy<Person>({
        strategies: [
          new StandardBlockingStrategy({
            field: 'lastName',
            transform: 'soundex',
          }),
          new SortedNeighbourhoodStrategy({
            sortBy: 'birthYear',
            windowSize: 5,
          }),
          new StandardBlockingStrategy({
            field: 'firstName',
            transform: 'firstLetter',
          }),
        ],
        mode: 'union',
      })

      expect(strategy.name).toContain('standard:lastName:soundex')
      expect(strategy.name).toContain('sorted-neighbourhood:birthYear:w5')
      expect(strategy.name).toContain('standard:firstName:firstLetter')
    })
  })

  describe('performance', () => {
    it('scales with number of strategies', () => {
      const records: Person[] = Array.from({ length: 100 }, (_, i) => ({
        id: String(i),
        firstName: `First${i}`,
        lastName: `Last${i % 10}`,
        birthYear: 1980 + (i % 20),
      }))

      const twoStrategies = new CompositeBlockingStrategy<Person>({
        strategies: [
          new StandardBlockingStrategy({ field: 'lastName' }),
          new StandardBlockingStrategy({ field: 'birthYear' }),
        ],
      })

      const threeStrategies = new CompositeBlockingStrategy<Person>({
        strategies: [
          new StandardBlockingStrategy({ field: 'lastName' }),
          new StandardBlockingStrategy({ field: 'birthYear' }),
          new StandardBlockingStrategy({
            field: 'firstName',
            transform: 'firstLetter',
          }),
        ],
      })

      // Just verify both complete successfully
      const blocks1 = twoStrategies.generateBlocks(records)
      const blocks2 = threeStrategies.generateBlocks(records)

      // Both should produce valid results
      expect(blocks1.size).toBeGreaterThan(0)
      expect(blocks2.size).toBeGreaterThan(0)
    })

    it('handles large datasets efficiently', () => {
      const records: Person[] = Array.from({ length: 1000 }, (_, i) => ({
        id: String(i),
        firstName: `First${i}`,
        lastName: `Last${i % 50}`,
        birthYear: 1980 + (i % 30),
      }))

      const strategy = new CompositeBlockingStrategy<Person>({
        strategies: [
          new StandardBlockingStrategy({
            field: 'lastName',
            transform: 'firstLetter',
          }),
          new StandardBlockingStrategy({ field: 'birthYear' }),
        ],
        mode: 'union',
      })

      const start = Date.now()
      const blocks = strategy.generateBlocks(records)
      const time = Date.now() - start

      expect(blocks.size).toBeGreaterThan(0)
      expect(time).toBeLessThan(1000) // Should complete in less than 1 second
    })
  })
})
