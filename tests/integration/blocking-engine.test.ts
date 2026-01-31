import { describe, it, expect } from 'vitest'
import { MatchingEngine } from '../../src/core/engine'
import { BlockGenerator } from '../../src/core/blocking/block-generator'
import type { BlockingStrategy } from '../../src/core/blocking/types'
import type { MatchingConfig } from '../../src/types'

interface Person {
  id: string
  firstName: string
  lastName: string
  birthYear: number
}

describe('Blocking Integration with Matching Engine', () => {
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

  describe('blocking statistics', () => {
    it('calculates blocking stats when blocking is configured', () => {
      const strategy: BlockingStrategy<Person> = {
        name: 'lastNameFirstLetter',
        generateBlocks: (records) => {
          const blocks = new Map<string, Person[]>()
          for (const rec of records) {
            const key = rec.lastName[0].toUpperCase()
            if (!blocks.has(key)) blocks.set(key, [])
            blocks.get(key)!.push(rec)
          }
          return blocks
        },
      }

      const engine = new MatchingEngine<Person>(matchingConfig, undefined, {
        strategies: [strategy],
        mode: 'single',
      })

      const people: Person[] = [
        { id: '1', firstName: 'John', lastName: 'Smith', birthYear: 1990 },
        { id: '2', firstName: 'Jane', lastName: 'Smyth', birthYear: 1992 },
        { id: '3', firstName: 'Bob', lastName: 'Jones', birthYear: 1985 },
        { id: '4', firstName: 'Alice', lastName: 'Johnson', birthYear: 1988 },
        { id: '5', firstName: 'Charlie', lastName: 'Brown', birthYear: 1995 },
      ]

      const stats = engine.getBlockingStats(people)

      expect(stats).not.toBeNull()
      expect(stats!.totalRecords).toBe(5)
      expect(stats!.totalBlocks).toBeGreaterThan(0)
      expect(stats!.reductionPercentage).toBeGreaterThan(0)
      expect(stats!.comparisonsWithBlocking).toBeLessThan(
        stats!.comparisonsWithoutBlocking
      )
    })

    it('returns null when blocking is not configured', () => {
      const engine = new MatchingEngine<Person>(matchingConfig)

      const people: Person[] = [
        { id: '1', firstName: 'John', lastName: 'Smith', birthYear: 1990 },
        { id: '2', firstName: 'Jane', lastName: 'Smyth', birthYear: 1992 },
      ]

      const stats = engine.getBlockingStats(people)
      expect(stats).toBeNull()
    })

    it('handles empty record arrays', () => {
      const strategy: BlockingStrategy<Person> = {
        name: 'test',
        generateBlocks: () => new Map(),
      }

      const engine = new MatchingEngine<Person>(matchingConfig, undefined, {
        strategies: [strategy],
        mode: 'single',
      })

      const stats = engine.getBlockingStats([])

      expect(stats).not.toBeNull()
      expect(stats!.totalRecords).toBe(0)
      expect(stats!.totalBlocks).toBe(0)
    })
  })

  describe('block generation', () => {
    it('generates blocks with single strategy', () => {
      const generator = new BlockGenerator()

      const strategy: BlockingStrategy<Person> = {
        name: 'birthYear',
        generateBlocks: (records) => {
          const blocks = new Map<string, Person[]>()
          for (const rec of records) {
            const key = String(rec.birthYear)
            if (!blocks.has(key)) blocks.set(key, [])
            blocks.get(key)!.push(rec)
          }
          return blocks
        },
      }

      const people: Person[] = [
        { id: '1', firstName: 'John', lastName: 'Smith', birthYear: 1990 },
        { id: '2', firstName: 'Jane', lastName: 'Smyth', birthYear: 1990 },
        { id: '3', firstName: 'Bob', lastName: 'Jones', birthYear: 1985 },
      ]

      const blocks = generator.generateBlocks(people, strategy)

      expect(blocks.size).toBe(2)
      expect(blocks.get('1990')).toHaveLength(2)
      expect(blocks.get('1985')).toHaveLength(1)
    })

    it('generates blocks with composite strategy', () => {
      const generator = new BlockGenerator()

      const strategy1: BlockingStrategy<Person> = {
        name: 'lastName',
        generateBlocks: (records) => {
          const blocks = new Map<string, Person[]>()
          for (const rec of records) {
            const key = rec.lastName[0].toUpperCase()
            if (!blocks.has(key)) blocks.set(key, [])
            blocks.get(key)!.push(rec)
          }
          return blocks
        },
      }

      const strategy2: BlockingStrategy<Person> = {
        name: 'birthYear',
        generateBlocks: (records) => {
          const blocks = new Map<string, Person[]>()
          for (const rec of records) {
            const key = String(rec.birthYear)
            if (!blocks.has(key)) blocks.set(key, [])
            blocks.get(key)!.push(rec)
          }
          return blocks
        },
      }

      const people: Person[] = [
        { id: '1', firstName: 'John', lastName: 'Smith', birthYear: 1990 },
        { id: '2', firstName: 'Jane', lastName: 'Smyth', birthYear: 1990 },
        { id: '3', firstName: 'Bob', lastName: 'Jones', birthYear: 1985 },
      ]

      const blocks = generator.generateBlocksComposite(people, [strategy1, strategy2])

      expect(blocks.size).toBeGreaterThan(0)
      expect(blocks.has('lastName:S')).toBe(true)
      expect(blocks.has('birthYear:1990')).toBe(true)
    })

    it('reduces comparisons significantly', () => {
      const generator = new BlockGenerator()

      const strategy: BlockingStrategy<Person> = {
        name: 'firstLetter',
        generateBlocks: (records) => {
          const blocks = new Map<string, Person[]>()
          for (const rec of records) {
            const key = rec.lastName[0].toUpperCase()
            if (!blocks.has(key)) blocks.set(key, [])
            blocks.get(key)!.push(rec)
          }
          return blocks
        },
      }

      // Create a dataset with 26 people (one per letter)
      const people: Person[] = []
      const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
      for (let i = 0; i < 26; i++) {
        people.push({
          id: `${i}`,
          firstName: 'John',
          lastName: `${letters[i]}ohnson`,
          birthYear: 1990,
        })
      }

      const blocks = generator.generateBlocks(people, strategy)
      const stats = generator.calculateStats(blocks)

      // With 26 records in separate blocks, comparisons should be 0
      expect(stats.totalRecords).toBe(26)
      expect(stats.totalBlocks).toBe(26)
      expect(stats.comparisonsWithBlocking).toBe(0)
      expect(stats.comparisonsWithoutBlocking).toBe(325) // 26*25/2
      expect(stats.reductionPercentage).toBe(100)
    })

    it('achieves 90%+ reduction with realistic distribution', () => {
      const generator = new BlockGenerator()

      const strategy: BlockingStrategy<Person> = {
        name: 'firstLetter',
        generateBlocks: (records) => {
          const blocks = new Map<string, Person[]>()
          for (const rec of records) {
            const key = rec.lastName[0].toUpperCase()
            if (!blocks.has(key)) blocks.set(key, [])
            blocks.get(key)!.push(rec)
          }
          return blocks
        },
      }

      // Create 100 people with realistic distribution (multiple people per letter)
      const people: Person[] = []
      const commonLetters = ['S', 'M', 'J', 'B', 'W', 'H', 'C', 'R', 'T', 'A']

      for (let i = 0; i < 100; i++) {
        const letter = commonLetters[i % commonLetters.length]
        people.push({
          id: `${i}`,
          firstName: 'John',
          lastName: `${letter}mith${i}`,
          birthYear: 1990,
        })
      }

      const blocks = generator.generateBlocks(people, strategy)
      const stats = generator.calculateStats(blocks)

      expect(stats.totalRecords).toBe(100)
      // With 10 letters and 10 records per letter: 10 blocks * 45 comparisons = 450
      // Without blocking: 4950 comparisons. Reduction: 90.9%
      expect(stats.reductionPercentage).toBeGreaterThan(90)
    })
  })

  describe('record comparison with blocking', () => {
    it('compares records correctly', () => {
      const engine = new MatchingEngine<Person>(matchingConfig)

      const person1: Person = {
        id: '1',
        firstName: 'John',
        lastName: 'Smith',
        birthYear: 1990,
      }
      const person2: Person = {
        id: '2',
        firstName: 'John',
        lastName: 'Smyth',
        birthYear: 1990,
      }

      const score = engine.compare({ left: person1, right: person2 })

      expect(score.total).toBeGreaterThan(0)
      expect(score.fieldComparisons).toHaveLength(2)
    })

    it('generates pairs from blocks correctly', () => {
      const generator = new BlockGenerator()

      const strategy: BlockingStrategy<Person> = {
        name: 'birthYear',
        generateBlocks: (records) => {
          const blocks = new Map<string, Person[]>()
          for (const rec of records) {
            const key = String(rec.birthYear)
            if (!blocks.has(key)) blocks.set(key, [])
            blocks.get(key)!.push(rec)
          }
          return blocks
        },
      }

      const people: Person[] = [
        { id: '1', firstName: 'John', lastName: 'Smith', birthYear: 1990 },
        { id: '2', firstName: 'Jane', lastName: 'Smyth', birthYear: 1990 },
        { id: '3', firstName: 'Bob', lastName: 'Jones', birthYear: 1990 },
      ]

      const blocks = generator.generateBlocks(people, strategy)
      const pairs = generator.generatePairs(blocks)

      // 3 people in one block should generate 3 pairs
      expect(pairs).toHaveLength(3)
    })
  })

  describe('error handling', () => {
    it('handles missing blocking fields gracefully', () => {
      const strategy: BlockingStrategy<Partial<Person>> = {
        name: 'lastName',
        generateBlocks: (records) => {
          const blocks = new Map<string, Partial<Person>[]>()
          for (const rec of records) {
            if (!rec.lastName) continue
            const key = rec.lastName[0].toUpperCase()
            if (!blocks.has(key)) blocks.set(key, [])
            blocks.get(key)!.push(rec)
          }
          return blocks
        },
      }

      const generator = new BlockGenerator()

      const people: Partial<Person>[] = [
        { id: '1', firstName: 'John' },
        { id: '2', firstName: 'Jane', lastName: 'Smith' },
        { id: '3', firstName: 'Bob', lastName: 'Jones' },
      ]

      const blocks = generator.generateBlocks(people, strategy)

      expect(blocks.size).toBe(2)
      expect(blocks.has('S')).toBe(true)
      expect(blocks.has('J')).toBe(true)
    })
  })
})
