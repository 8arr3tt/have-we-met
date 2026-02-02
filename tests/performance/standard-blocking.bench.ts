import { bench, describe } from 'vitest'
import { StandardBlockingStrategy } from '../../src/core/blocking/strategies/standard-blocking'
import { BlockGenerator } from '../../src/core/blocking/block-generator'

interface Person {
  id: string
  firstName: string
  lastName: string
  email: string
  birthYear: number
  city: string
}

describe('Standard Blocking Performance', () => {
  const generator = new BlockGenerator()

  // Generate test datasets
  const generate1kPeople = () => {
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
    return people
  }

  const generate10kPeople = () => {
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
    ]
    for (let i = 0; i < 10000; i++) {
      people.push({
        id: `${i}`,
        firstName: 'John',
        lastName: lastNames[i % lastNames.length],
        email: `person${i}@example.com`,
        birthYear: 1980 + (i % 20),
        city: 'New York',
      })
    }
    return people
  }

  const generate100kPeople = () => {
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
      'Lee',
      'Perez',
      'Thompson',
      'White',
      'Harris',
    ]
    for (let i = 0; i < 100000; i++) {
      people.push({
        id: `${i}`,
        firstName: 'John',
        lastName: lastNames[i % lastNames.length],
        email: `person${i}@example.com`,
        birthYear: 1980 + (i % 20),
        city: 'New York',
      })
    }
    return people
  }

  describe('firstLetter transform', () => {
    bench('1k records', () => {
      const people = generate1kPeople()
      const strategy = new StandardBlockingStrategy<Person>({
        field: 'lastName',
        transform: 'firstLetter',
      })
      strategy.generateBlocks(people)
    })

    bench('10k records', () => {
      const people = generate10kPeople()
      const strategy = new StandardBlockingStrategy<Person>({
        field: 'lastName',
        transform: 'firstLetter',
      })
      strategy.generateBlocks(people)
    })

    bench('100k records (target: <100ms)', () => {
      const people = generate100kPeople()
      const strategy = new StandardBlockingStrategy<Person>({
        field: 'lastName',
        transform: 'firstLetter',
      })
      const start = Date.now()
      strategy.generateBlocks(people)
      const duration = Date.now() - start

      // This is a benchmark, but we'll track the duration
      // Target: <100ms for 100k records
      if (duration > 100) {
        console.warn(`⚠️  100k records took ${duration}ms (target: <100ms)`)
      }
    })
  })

  describe('soundex transform', () => {
    bench('1k records', () => {
      const people = generate1kPeople()
      const strategy = new StandardBlockingStrategy<Person>({
        field: 'lastName',
        transform: 'soundex',
      })
      strategy.generateBlocks(people)
    })

    bench('10k records', () => {
      const people = generate10kPeople()
      const strategy = new StandardBlockingStrategy<Person>({
        field: 'lastName',
        transform: 'soundex',
      })
      strategy.generateBlocks(people)
    })

    bench('100k records (target: <100ms)', () => {
      const people = generate100kPeople()
      const strategy = new StandardBlockingStrategy<Person>({
        field: 'lastName',
        transform: 'soundex',
      })
      const start = Date.now()
      strategy.generateBlocks(people)
      const duration = Date.now() - start

      if (duration > 100) {
        console.warn(`⚠️  100k records took ${duration}ms (target: <100ms)`)
      }
    })
  })

  describe('identity (no transform)', () => {
    bench('1k records', () => {
      const people = generate1kPeople()
      const strategy = new StandardBlockingStrategy<Person>({
        field: 'lastName',
      })
      strategy.generateBlocks(people)
    })

    bench('10k records', () => {
      const people = generate10kPeople()
      const strategy = new StandardBlockingStrategy<Person>({
        field: 'lastName',
      })
      strategy.generateBlocks(people)
    })

    bench('100k records (target: <100ms)', () => {
      const people = generate100kPeople()
      const strategy = new StandardBlockingStrategy<Person>({
        field: 'lastName',
      })
      const start = Date.now()
      strategy.generateBlocks(people)
      const duration = Date.now() - start

      if (duration > 100) {
        console.warn(`⚠️  100k records took ${duration}ms (target: <100ms)`)
      }
    })
  })

  describe('multi-field blocking', () => {
    bench('1k records (2 fields)', () => {
      const people = generate1kPeople()
      const strategy = new StandardBlockingStrategy<Person>({
        fields: ['lastName', 'birthYear'],
        transforms: ['firstLetter', 'identity'],
      })
      strategy.generateBlocks(people)
    })

    bench('10k records (2 fields)', () => {
      const people = generate10kPeople()
      const strategy = new StandardBlockingStrategy<Person>({
        fields: ['lastName', 'birthYear'],
        transforms: ['firstLetter', 'identity'],
      })
      strategy.generateBlocks(people)
    })

    bench('100k records (2 fields, target: <100ms)', () => {
      const people = generate100kPeople()
      const strategy = new StandardBlockingStrategy<Person>({
        fields: ['lastName', 'birthYear'],
        transforms: ['firstLetter', 'identity'],
      })
      const start = Date.now()
      strategy.generateBlocks(people)
      const duration = Date.now() - start

      if (duration > 100) {
        console.warn(`⚠️  100k records took ${duration}ms (target: <100ms)`)
      }
    })
  })

  describe('comparison reduction metrics', () => {
    bench('calculate stats for 10k records', () => {
      const people = generate10kPeople()
      const strategy = new StandardBlockingStrategy<Person>({
        field: 'lastName',
        transform: 'firstLetter',
      })
      const blocks = strategy.generateBlocks(people)
      generator.calculateStats(blocks)
    })

    bench('calculate stats for 100k records', () => {
      const people = generate100kPeople()
      const strategy = new StandardBlockingStrategy<Person>({
        field: 'lastName',
        transform: 'firstLetter',
      })
      const blocks = strategy.generateBlocks(people)
      generator.calculateStats(blocks)
    })
  })
})
