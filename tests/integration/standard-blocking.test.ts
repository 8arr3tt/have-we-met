import { describe, it, expect } from 'vitest'
import { StandardBlockingStrategy } from '../../src/core/blocking/strategies/standard-blocking'
import { BlockGenerator } from '../../src/core/blocking/block-generator'
import { MatchingEngine } from '../../src/core/engine'
import type { MatchingConfig } from '../../src/types'

interface Person {
  id: string
  firstName: string
  lastName: string
  email: string
  birthYear: number
  city: string
}

describe('Standard Blocking Integration', () => {
  const generator = new BlockGenerator()

  describe('comparison reduction', () => {
    it('reduces comparisons by 85%+ on sample dataset', () => {
      // Create a realistic dataset with 100 people
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

      for (let i = 0; i < 100; i++) {
        people.push({
          id: `${i}`,
          firstName: 'John',
          lastName: lastNames[i % lastNames.length],
          email: `person${i}@example.com`,
          birthYear: 1990,
          city: 'New York',
        })
      }

      // Block on first letter of last name
      const strategy = new StandardBlockingStrategy<Person>({
        field: 'lastName',
        transform: 'firstLetter',
      })

      const blocks = strategy.generateBlocks(people)
      const stats = generator.calculateStats(blocks)

      expect(stats.totalRecords).toBe(100)
      // With 10 names starting with 7 different letters, we get ~85% reduction
      expect(stats.reductionPercentage).toBeGreaterThan(85)
    })

    it('achieves good reduction with Soundex', () => {
      // Create dataset with similar-sounding names
      const people: Person[] = []
      const lastNames = [
        'Smith',
        'Smyth',
        'Schmidt',
        'Jones',
        'Jonas',
        'Williams',
        'Wiliams',
        'Brown',
        'Browne',
        'Miller',
      ]

      for (let i = 0; i < 100; i++) {
        people.push({
          id: `${i}`,
          firstName: 'John',
          lastName: lastNames[i % lastNames.length],
          email: `person${i}@example.com`,
          birthYear: 1990,
          city: 'New York',
        })
      }

      const strategy = new StandardBlockingStrategy<Person>({
        field: 'lastName',
        transform: 'soundex',
      })

      const blocks = strategy.generateBlocks(people)
      const stats = generator.calculateStats(blocks)

      // Soundex groups similar names, achieving 75%+ reduction
      expect(stats.reductionPercentage).toBeGreaterThan(75)
    })

    it('composite blocking provides good reduction', () => {
      const people: Person[] = []
      const lastNames = ['Smith', 'Jones', 'Williams', 'Brown', 'Miller']
      const cities = ['New York', 'Los Angeles', 'Chicago', 'Houston']

      for (let i = 0; i < 100; i++) {
        people.push({
          id: `${i}`,
          firstName: 'John',
          lastName: lastNames[i % lastNames.length],
          email: `person${i}@example.com`,
          birthYear: 1990 + (i % 5),
          city: cities[i % cities.length],
        })
      }

      const strategy = new StandardBlockingStrategy<Person>({
        fields: ['lastName', 'city'],
        transforms: ['firstLetter', 'identity'],
      })

      const blocks = strategy.generateBlocks(people)
      const stats = generator.calculateStats(blocks)

      expect(stats.reductionPercentage).toBeGreaterThan(90)
    })
  })

  describe('real-world scenarios', () => {
    it('handles person matching scenario', () => {
      const people: Person[] = [
        {
          id: '1',
          firstName: 'John',
          lastName: 'Smith',
          email: 'john.smith@example.com',
          birthYear: 1990,
          city: 'NYC',
        },
        {
          id: '2',
          firstName: 'Jon',
          lastName: 'Smith',
          email: 'jon.smith@example.com',
          birthYear: 1990,
          city: 'NYC',
        },
        {
          id: '3',
          firstName: 'John',
          lastName: 'Smyth',
          email: 'john.smyth@example.com',
          birthYear: 1990,
          city: 'NYC',
        },
        {
          id: '4',
          firstName: 'Jane',
          lastName: 'Jones',
          email: 'jane.jones@example.com',
          birthYear: 1985,
          city: 'LA',
        },
        {
          id: '5',
          firstName: 'Bob',
          lastName: 'Brown',
          email: 'bob.brown@example.com',
          birthYear: 1995,
          city: 'Chicago',
        },
      ]

      // Block on Soundex of last name to catch similar names
      const strategy = new StandardBlockingStrategy<Person>({
        field: 'lastName',
        transform: 'soundex',
      })

      const blocks = strategy.generateBlocks(people)

      // Smith and Smyth should be in the same block
      const smithBlock = Array.from(blocks.values()).find((b) => b.length === 3)
      expect(smithBlock).toBeDefined()
      expect(smithBlock).toHaveLength(3)
    })

    it('handles email domain blocking', () => {
      const people: Person[] = [
        {
          id: '1',
          firstName: 'John',
          lastName: 'Smith',
          email: 'john@company-a.com',
          birthYear: 1990,
          city: 'NYC',
        },
        {
          id: '2',
          firstName: 'Jane',
          lastName: 'Jones',
          email: 'jane@company-a.com',
          birthYear: 1985,
          city: 'LA',
        },
        {
          id: '3',
          firstName: 'Bob',
          lastName: 'Brown',
          email: 'bob@company-b.com',
          birthYear: 1995,
          city: 'Chicago',
        },
        {
          id: '4',
          firstName: 'Alice',
          lastName: 'Wilson',
          email: 'alice@company-a.com',
          birthYear: 1992,
          city: 'NYC',
        },
      ]

      const strategy = new StandardBlockingStrategy<Person>({
        field: 'email',
        transform: (value) => {
          if (!value || typeof value !== 'string') return null
          const parts = value.split('@')
          return parts.length === 2 ? parts[1] : null
        },
      })

      const blocks = strategy.generateBlocks(people)

      expect(blocks.size).toBe(2)
      expect(blocks.get('email:company-a.com')).toHaveLength(3)
      expect(blocks.get('email:company-b.com')).toHaveLength(1)
    })

    it('handles year-based blocking for birth dates', () => {
      const people: Person[] = [
        {
          id: '1',
          firstName: 'John',
          lastName: 'Smith',
          email: 'john@example.com',
          birthYear: 1990,
          city: 'NYC',
        },
        {
          id: '2',
          firstName: 'Jane',
          lastName: 'Jones',
          email: 'jane@example.com',
          birthYear: 1990,
          city: 'LA',
        },
        {
          id: '3',
          firstName: 'Bob',
          lastName: 'Brown',
          email: 'bob@example.com',
          birthYear: 1985,
          city: 'Chicago',
        },
      ]

      const strategy = new StandardBlockingStrategy<Person>({
        field: 'birthYear',
      })

      const blocks = strategy.generateBlocks(people)

      expect(blocks.size).toBe(2)
      expect(blocks.get('birthyear:1990')).toHaveLength(2)
      expect(blocks.get('birthyear:1985')).toHaveLength(1)
    })
  })

  describe('integration with matching engine', () => {
    it('works with matching engine configuration', () => {
      const matchingConfig: MatchingConfig = {
        fields: new Map([
          ['firstName', { strategy: 'levenshtein', weight: 1 }],
          ['lastName', { strategy: 'soundex', weight: 2 }],
        ]),
        thresholds: {
          noMatch: 20,
          definiteMatch: 45,
        },
      }

      const blockingStrategy = new StandardBlockingStrategy<Person>({
        field: 'lastName',
        transform: 'soundex',
      })

      const engine = new MatchingEngine<Person>(matchingConfig, undefined, {
        strategies: [blockingStrategy],
        mode: 'single',
      })

      const people: Person[] = [
        {
          id: '1',
          firstName: 'John',
          lastName: 'Smith',
          email: 'john@example.com',
          birthYear: 1990,
          city: 'NYC',
        },
        {
          id: '2',
          firstName: 'Jane',
          lastName: 'Smyth',
          email: 'jane@example.com',
          birthYear: 1990,
          city: 'LA',
        },
        {
          id: '3',
          firstName: 'Bob',
          lastName: 'Jones',
          email: 'bob@example.com',
          birthYear: 1985,
          city: 'Chicago',
        },
      ]

      const stats = engine.getBlockingStats(people)

      expect(stats).not.toBeNull()
      expect(stats!.totalRecords).toBe(3)
      expect(stats!.totalBlocks).toBeGreaterThan(0)
    })
  })

  describe('blocking effectiveness', () => {
    it('demonstrates blocking value on large dataset', () => {
      // Generate 1000 people
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
        'Hernandez',
        'Lopez',
        'Gonzalez',
        'Wilson',
        'Anderson',
        'Thomas',
        'Taylor',
        'Moore',
        'Jackson',
        'Martin',
      ]

      for (let i = 0; i < 1000; i++) {
        people.push({
          id: `${i}`,
          firstName: 'John',
          lastName: lastNames[i % lastNames.length],
          email: `person${i}@example.com`,
          birthYear: 1980 + (i % 20),
          city: 'NYC',
        })
      }

      const strategy = new StandardBlockingStrategy<Person>({
        field: 'lastName',
        transform: 'firstLetter',
      })

      const blocks = strategy.generateBlocks(people)
      const stats = generator.calculateStats(blocks)

      // Without blocking: 1000 * 999 / 2 = 499,500 comparisons
      expect(stats.comparisonsWithoutBlocking).toBe(499500)

      // With blocking should be dramatically lower
      expect(stats.comparisonsWithBlocking).toBeLessThan(60000) // < 12% of original
      expect(stats.reductionPercentage).toBeGreaterThan(88)
    })
  })

  describe('balanced distribution', () => {
    it('creates balanced blocks with good strategy', () => {
      const people: Person[] = []
      const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

      // Create 260 people (10 per letter)
      for (let i = 0; i < 260; i++) {
        const letter = letters[Math.floor(i / 10)]
        people.push({
          id: `${i}`,
          firstName: 'John',
          lastName: `${letter}ohnson${i}`,
          email: `person${i}@example.com`,
          birthYear: 1990,
          city: 'NYC',
        })
      }

      const strategy = new StandardBlockingStrategy<Person>({
        field: 'lastName',
        transform: 'firstLetter',
      })

      const blocks = strategy.generateBlocks(people)
      const stats = generator.calculateStats(blocks)

      expect(stats.totalBlocks).toBe(26)
      expect(stats.avgRecordsPerBlock).toBe(10)
      expect(stats.minBlockSize).toBe(10)
      expect(stats.maxBlockSize).toBe(10)
    })

    it('detects skewed distribution', () => {
      const people: Person[] = []

      // 90 Smiths, 5 each of two other names
      for (let i = 0; i < 90; i++) {
        people.push({
          id: `${i}`,
          firstName: 'John',
          lastName: 'Smith',
          email: `person${i}@example.com`,
          birthYear: 1990,
          city: 'NYC',
        })
      }
      for (let i = 90; i < 95; i++) {
        people.push({
          id: `${i}`,
          firstName: 'John',
          lastName: 'Jones',
          email: `person${i}@example.com`,
          birthYear: 1990,
          city: 'NYC',
        })
      }
      for (let i = 95; i < 100; i++) {
        people.push({
          id: `${i}`,
          firstName: 'John',
          lastName: 'Brown',
          email: `person${i}@example.com`,
          birthYear: 1990,
          city: 'NYC',
        })
      }

      const strategy = new StandardBlockingStrategy<Person>({
        field: 'lastName',
      })

      const blocks = strategy.generateBlocks(people)
      const stats = generator.calculateStats(blocks)

      expect(stats.maxBlockSize).toBe(90) // Skewed toward Smith
      expect(stats.minBlockSize).toBe(5)
      expect(stats.avgRecordsPerBlock).toBeCloseTo(33.33, 1)
    })
  })
})
