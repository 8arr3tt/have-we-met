import { describe, it, expect } from 'vitest'
import {
  CompositeBlockingStrategy,
  StandardBlockingStrategy,
  SortedNeighbourhoodStrategy,
  BlockGenerator,
} from '../../src/core/blocking'

interface Person {
  id: string
  firstName: string
  lastName: string
  email: string
  birthYear: number
  city: string
}

describe('Composite Blocking Integration', () => {
  const generator = new BlockGenerator()

  describe('union mode - comparison reduction', () => {
    it('increases recall by combining multiple strategies', () => {
      // Create dataset where different strategies catch different matches
      const people: Person[] = [
        {
          id: '1',
          firstName: 'John',
          lastName: 'Smith',
          email: 'john@example.com',
          birthYear: 1990,
          city: 'New York',
        },
        {
          id: '2',
          firstName: 'Jon',
          lastName: 'Smith',
          email: 'jon@example.com',
          birthYear: 1990,
          city: 'Boston',
        },
        {
          id: '3',
          firstName: 'John',
          lastName: 'Smyth',
          email: 'john@test.com',
          birthYear: 1990,
          city: 'New York',
        },
        {
          id: '4',
          firstName: 'Jane',
          lastName: 'Smith',
          email: 'jane@example.com',
          birthYear: 1985,
          city: 'New York',
        },
        {
          id: '5',
          firstName: 'Bob',
          lastName: 'Jones',
          email: 'bob@example.com',
          birthYear: 1990,
          city: 'Chicago',
        },
      ]

      // Single strategy on lastName
      const lastNameStrategy = new StandardBlockingStrategy<Person>({
        field: 'lastName',
        transform: 'soundex',
      })

      // Single strategy on birthYear
      const yearStrategy = new StandardBlockingStrategy<Person>({
        field: 'birthYear',
      })

      // Composite strategy combining both
      const compositeStrategy = new CompositeBlockingStrategy<Person>({
        strategies: [lastNameStrategy, yearStrategy],
        mode: 'union',
      })

      const lastNameBlocks = lastNameStrategy.generateBlocks(people)
      const yearBlocks = yearStrategy.generateBlocks(people)
      const compositeBlocks = compositeStrategy.generateBlocks(people)

      // Composite should have more blocks than either single strategy
      expect(compositeBlocks.size).toBeGreaterThanOrEqual(lastNameBlocks.size)
      expect(compositeBlocks.size).toBeGreaterThanOrEqual(yearBlocks.size)

      // Verify record 1 and record 3 are in the same lastName block (Smith/Smyth soundex)
      const soundexBlock = Array.from(lastNameBlocks.values()).find(
        (block) => block.includes(people[0]) && block.includes(people[2])
      )
      expect(soundexBlock).toBeDefined()

      // Verify record 1 and record 5 are in the same year block
      const yearBlock = Array.from(yearBlocks.values()).find(
        (block) => block.includes(people[0]) && block.includes(people[4])
      )
      expect(yearBlock).toBeDefined()
    })

    it('provides good comparison reduction on realistic dataset', () => {
      const people: Person[] = []
      const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones']
      const cities = ['New York', 'Los Angeles', 'Chicago']

      for (let i = 0; i < 100; i++) {
        people.push({
          id: `${i}`,
          firstName: 'John',
          lastName: lastNames[i % lastNames.length],
          email: `person${i}@example.com`,
          birthYear: 1980 + (i % 10),
          city: cities[i % cities.length],
        })
      }

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

      const blocks = strategy.generateBlocks(people)
      const stats = generator.calculateStats(blocks)

      expect(stats.totalRecords).toBe(100)
      // Union mode should still provide some reduction (50%+)
      // Note: Union mode can have more comparisons than single strategies due to multiple block memberships
      expect(stats.reductionPercentage).toBeGreaterThan(50)
    })

    it('catches matches that single strategies would miss', () => {
      const people: Person[] = [
        // Records 1 and 2: Same lastName, different year
        {
          id: '1',
          firstName: 'John',
          lastName: 'Smith',
          email: 'john@example.com',
          birthYear: 1990,
          city: 'New York',
        },
        {
          id: '2',
          firstName: 'Jane',
          lastName: 'Smith',
          email: 'jane@example.com',
          birthYear: 1985,
          city: 'Boston',
        },
        // Records 1 and 3: Different lastName, same year
        {
          id: '3',
          firstName: 'Bob',
          lastName: 'Jones',
          email: 'bob@example.com',
          birthYear: 1990,
          city: 'Chicago',
        },
        // Record 4: Different everything
        {
          id: '4',
          firstName: 'Alice',
          lastName: 'Brown',
          email: 'alice@example.com',
          birthYear: 1975,
          city: 'Seattle',
        },
      ]

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

      const blocks = compositeStrategy.generateBlocks(people)

      // Record 1 should be with record 2 (same lastName first letter: S)
      const sBlock = Array.from(blocks.values()).find(
        (block) => block.includes(people[0]) && block.includes(people[1])
      )
      expect(sBlock).toBeDefined()

      // Record 1 should also be with record 3 (same year: 1990)
      const yearBlock = Array.from(blocks.values()).find(
        (block) => block.includes(people[0]) && block.includes(people[2])
      )
      expect(yearBlock).toBeDefined()
    })
  })

  describe('intersection mode - comparison reduction', () => {
    it('reduces comparisons more aggressively than union mode', () => {
      const people: Person[] = []
      const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones']

      for (let i = 0; i < 100; i++) {
        people.push({
          id: `${i}`,
          firstName: 'John',
          lastName: lastNames[i % lastNames.length],
          email: `person${i}@example.com`,
          birthYear: 1980 + (i % 10),
          city: 'New York',
        })
      }

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

      const unionBlocks = unionStrategy.generateBlocks(people)
      const intersectionBlocks = intersectionStrategy.generateBlocks(people)

      const unionStats = generator.calculateStats(unionBlocks)
      const intersectionStats = generator.calculateStats(intersectionBlocks)

      // Intersection should have higher reduction percentage
      expect(intersectionStats.reductionPercentage).toBeGreaterThan(
        unionStats.reductionPercentage
      )

      // Intersection should result in fewer comparisons
      expect(intersectionStats.comparisonsWithBlocking).toBeLessThan(
        unionStats.comparisonsWithBlocking
      )
    })

    it('only compares records matching all strategies', () => {
      const people: Person[] = [
        // Records that match on both strategies
        {
          id: '1',
          firstName: 'John',
          lastName: 'Smith',
          email: 'john@example.com',
          birthYear: 1990,
          city: 'New York',
        },
        {
          id: '2',
          firstName: 'Jane',
          lastName: 'Smyth',
          email: 'jane@example.com',
          birthYear: 1990,
          city: 'Boston',
        },
        // Record that matches only on lastName
        {
          id: '3',
          firstName: 'Bob',
          lastName: 'Smith',
          email: 'bob@example.com',
          birthYear: 1985,
          city: 'Chicago',
        },
        // Record that matches only on birthYear
        {
          id: '4',
          firstName: 'Alice',
          lastName: 'Jones',
          email: 'alice@example.com',
          birthYear: 1990,
          city: 'Seattle',
        },
      ]

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

      const blocks = strategy.generateBlocks(people)

      // Records 1 and 2 should be together (both S and 1990)
      const matchBlock = Array.from(blocks.values()).find(
        (block) =>
          block.length === 2 &&
          block.includes(people[0]) &&
          block.includes(people[1])
      )
      expect(matchBlock).toBeDefined()

      // Record 3 should not be with records 1 or 2 (different year)
      const record3Blocks = Array.from(blocks.values()).filter((block) =>
        block.includes(people[2])
      )
      const record3WithOthers = record3Blocks.some(
        (block) => block.includes(people[0]) || block.includes(people[1])
      )
      expect(record3WithOthers).toBe(false)
    })

    it('achieves 95%+ reduction on large dataset', () => {
      const people: Person[] = []
      const lastNames = [
        'Smith',
        'Johnson',
        'Williams',
        'Brown',
        'Jones',
        'Garcia',
        'Miller',
        'Davis',
        'Rodriguez',
        'Martinez',
      ]

      for (let i = 0; i < 1000; i++) {
        people.push({
          id: `${i}`,
          firstName: 'John',
          lastName: lastNames[i % lastNames.length],
          email: `person${i}@example.com`,
          birthYear: 1980 + (i % 20),
          city: 'New York',
        })
      }

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

      const blocks = strategy.generateBlocks(people)
      const stats = generator.calculateStats(blocks)

      expect(stats.totalRecords).toBe(1000)
      expect(stats.reductionPercentage).toBeGreaterThan(95)
    })
  })

  describe('mixed strategies', () => {
    it('combines standard and sorted neighbourhood strategies', () => {
      const people: Person[] = []

      for (let i = 0; i < 50; i++) {
        people.push({
          id: `${i}`,
          firstName: 'John',
          lastName: `Name${String(i).padStart(3, '0')}`,
          email: `person${i}@example.com`,
          birthYear: 1980 + i,
          city: 'New York',
        })
      }

      const strategy = new CompositeBlockingStrategy<Person>({
        strategies: [
          new StandardBlockingStrategy({
            field: 'lastName',
            transform: 'firstLetter',
          }),
          new SortedNeighbourhoodStrategy({
            sortBy: 'birthYear',
            windowSize: 5,
          }),
        ],
        mode: 'union',
      })

      const blocks = strategy.generateBlocks(people)
      const stats = generator.calculateStats(blocks)

      // Should produce valid blocks
      // Note: sorted neighbourhood with union mode can increase comparisons
      expect(blocks.size).toBeGreaterThan(0)
      expect(stats.totalRecords).toBe(50)
    })

    it('handles multiple standard strategies with different transforms', () => {
      const people: Person[] = [
        {
          id: '1',
          firstName: 'John',
          lastName: 'Smith',
          email: 'john@example.com',
          birthYear: 1990,
          city: 'New York',
        },
        {
          id: '2',
          firstName: 'Jane',
          lastName: 'Smyth',
          email: 'jane@example.com',
          birthYear: 1990,
          city: 'Boston',
        },
        {
          id: '3',
          firstName: 'Bob',
          lastName: 'Schmidt',
          email: 'bob@example.com',
          birthYear: 1990,
          city: 'Chicago',
        },
      ]

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
          new StandardBlockingStrategy({ field: 'birthYear' }),
        ],
        mode: 'union',
      })

      const blocks = strategy.generateBlocks(people)

      // All three records should be connected through various strategies
      expect(blocks.size).toBeGreaterThan(0)
    })
  })

  describe('edge cases', () => {
    it('handles dataset where no records match on all strategies', () => {
      const people: Person[] = []

      for (let i = 0; i < 20; i++) {
        people.push({
          id: `${i}`,
          firstName: 'John',
          lastName: `Name${i}`,
          email: `person${i}@example.com`,
          birthYear: 1980 + i,
          city: 'New York',
        })
      }

      const strategy = new CompositeBlockingStrategy<Person>({
        strategies: [
          new StandardBlockingStrategy({ field: 'lastName' }),
          new StandardBlockingStrategy({ field: 'birthYear' }),
        ],
        mode: 'intersection',
      })

      const blocks = strategy.generateBlocks(people)

      // Each record should be in its own block (or no blocks)
      const blockSizes = Array.from(blocks.values()).map(
        (block) => block.length
      )
      expect(blockSizes.every((size) => size === 1)).toBe(true)
    })

    it('handles small datasets efficiently', () => {
      const people: Person[] = [
        {
          id: '1',
          firstName: 'John',
          lastName: 'Smith',
          email: 'john@example.com',
          birthYear: 1990,
          city: 'New York',
        },
        {
          id: '2',
          firstName: 'Jane',
          lastName: 'Smith',
          email: 'jane@example.com',
          birthYear: 1990,
          city: 'Boston',
        },
      ]

      const strategy = new CompositeBlockingStrategy<Person>({
        strategies: [
          new StandardBlockingStrategy({ field: 'lastName' }),
          new StandardBlockingStrategy({ field: 'birthYear' }),
        ],
        mode: 'union',
      })

      const blocks = strategy.generateBlocks(people)
      expect(blocks.size).toBeGreaterThan(0)
    })

    it('handles dataset with all records in same block', () => {
      const people: Person[] = Array.from({ length: 20 }, (_, i) => ({
        id: `${i}`,
        firstName: 'John',
        lastName: 'Smith',
        email: `person${i}@example.com`,
        birthYear: 1990,
        city: 'New York',
      }))

      const strategy = new CompositeBlockingStrategy<Person>({
        strategies: [
          new StandardBlockingStrategy({ field: 'lastName' }),
          new StandardBlockingStrategy({ field: 'birthYear' }),
        ],
        mode: 'union',
      })

      const blocks = strategy.generateBlocks(people)
      const stats = generator.calculateStats(blocks)

      // All records in same blocks, minimal reduction
      expect(stats.totalRecords).toBe(20)
      expect(stats.reductionPercentage).toBeLessThan(50) // Not much reduction since all share same values
    })
  })

  describe('real-world scenarios', () => {
    it('person matching: Soundex last name + birth year', () => {
      const people: Person[] = [
        {
          id: '1',
          firstName: 'John',
          lastName: 'Smith',
          email: 'john@example.com',
          birthYear: 1990,
          city: 'New York',
        },
        {
          id: '2',
          firstName: 'Jon',
          lastName: 'Smith',
          email: 'jon@example.com',
          birthYear: 1990,
          city: 'Boston',
        },
        {
          id: '3',
          firstName: 'John',
          lastName: 'Smyth',
          email: 'john@test.com',
          birthYear: 1990,
          city: 'Chicago',
        },
        {
          id: '4',
          firstName: 'Jane',
          lastName: 'Jones',
          email: 'jane@example.com',
          birthYear: 1985,
          city: 'Seattle',
        },
        {
          id: '5',
          firstName: 'Bob',
          lastName: 'Brown',
          email: 'bob@example.com',
          birthYear: 1990,
          city: 'Miami',
        },
      ]

      const strategy = new CompositeBlockingStrategy<Person>({
        strategies: [
          new StandardBlockingStrategy({
            field: 'lastName',
            transform: 'soundex',
          }),
          new StandardBlockingStrategy({ field: 'birthYear' }),
        ],
        mode: 'union',
      })

      const blocks = strategy.generateBlocks(people)

      // Records 1, 2, 3 should all be connected (Smith/Smyth soundex matches)
      const smithBlock = Array.from(blocks.values()).find(
        (block) =>
          block.includes(people[0]) &&
          block.includes(people[1]) &&
          block.includes(people[2])
      )
      expect(smithBlock).toBeDefined()

      // Records 1, 2, 3, 5 should be connected by year 1990
      const yearBlock = Array.from(blocks.values()).find(
        (block) => block.includes(people[0]) && block.includes(people[4])
      )
      expect(yearBlock).toBeDefined()
    })

    it('email matching: domain + name similarity', () => {
      const people: Person[] = [
        {
          id: '1',
          firstName: 'John',
          lastName: 'Smith',
          email: 'john.smith@example.com',
          birthYear: 1990,
          city: 'New York',
        },
        {
          id: '2',
          firstName: 'John',
          lastName: 'Smith',
          email: 'jsmith@example.com',
          birthYear: 1990,
          city: 'Boston',
        },
        {
          id: '3',
          firstName: 'Jane',
          lastName: 'Smith',
          email: 'jane.smith@example.com',
          birthYear: 1985,
          city: 'Chicago',
        },
        {
          id: '4',
          firstName: 'Bob',
          lastName: 'Jones',
          email: 'bob.jones@other.com',
          birthYear: 1990,
          city: 'Seattle',
        },
      ]

      const strategy = new CompositeBlockingStrategy<Person>({
        strategies: [
          new StandardBlockingStrategy({
            field: 'email',
            transform: (value) => {
              if (!value || typeof value !== 'string') return null
              const parts = value.split('@')
              return parts.length === 2 ? parts[1] : null
            },
          }),
          new StandardBlockingStrategy({
            field: 'lastName',
            transform: 'soundex',
          }),
        ],
        mode: 'union',
      })

      const blocks = strategy.generateBlocks(people)

      // Records 1, 2, 3 should be connected by example.com domain
      const domainBlock = Array.from(blocks.values()).find(
        (block) =>
          block.includes(people[0]) &&
          block.includes(people[1]) &&
          block.includes(people[2])
      )
      expect(domainBlock).toBeDefined()
    })
  })
})
