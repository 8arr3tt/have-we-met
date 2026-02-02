import { describe, it, expect } from 'vitest'
import { StandardBlockingStrategy } from '../../../src/core/blocking/strategies/standard-blocking'

interface Person {
  id: string
  firstName: string
  lastName: string
  email?: string
  birthYear?: number
  dateOfBirth?: Date | string
}

describe('StandardBlockingStrategy', () => {
  describe('single field blocking', () => {
    it('blocks on exact field values', () => {
      const strategy = new StandardBlockingStrategy<Person>({
        field: 'lastName',
      })

      const records: Person[] = [
        { id: '1', firstName: 'John', lastName: 'Smith' },
        { id: '2', firstName: 'Jane', lastName: 'Smith' },
        { id: '3', firstName: 'Bob', lastName: 'Jones' },
      ]

      const blocks = strategy.generateBlocks(records)

      expect(blocks.size).toBe(2)
      expect(blocks.get('lastname:smith')).toHaveLength(2)
      expect(blocks.get('lastname:jones')).toHaveLength(1)
    })

    it('blocks on first letter of field', () => {
      const strategy = new StandardBlockingStrategy<Person>({
        field: 'lastName',
        transform: 'firstLetter',
      })

      const records: Person[] = [
        { id: '1', firstName: 'John', lastName: 'Smith' },
        { id: '2', firstName: 'Jane', lastName: 'Smyth' },
        { id: '3', firstName: 'Bob', lastName: 'Jones' },
        { id: '4', firstName: 'Alice', lastName: 'Johnson' },
      ]

      const blocks = strategy.generateBlocks(records)

      expect(blocks.size).toBe(2)
      expect(blocks.get('lastname:s')).toHaveLength(2)
      expect(blocks.get('lastname:j')).toHaveLength(2)
    })

    it('blocks on Soundex encoding', () => {
      const strategy = new StandardBlockingStrategy<Person>({
        field: 'lastName',
        transform: 'soundex',
      })

      const records: Person[] = [
        { id: '1', firstName: 'John', lastName: 'Smith' },
        { id: '2', firstName: 'Jane', lastName: 'Smyth' },
        { id: '3', firstName: 'Bob', lastName: 'Jones' },
      ]

      const blocks = strategy.generateBlocks(records)

      expect(blocks.size).toBe(2)
      expect(blocks.get('lastname:s530')).toHaveLength(2) // Smith and Smyth both encode to S530
      expect(blocks.get('lastname:j520')).toHaveLength(1)
    })

    it('blocks on Metaphone encoding', () => {
      const strategy = new StandardBlockingStrategy<Person>({
        field: 'lastName',
        transform: 'metaphone',
      })

      const records: Person[] = [
        { id: '1', firstName: 'John', lastName: 'Knight' },
        { id: '2', firstName: 'Jane', lastName: 'Night' },
        { id: '3', firstName: 'Bob', lastName: 'Smith' },
      ]

      const blocks = strategy.generateBlocks(records)

      expect(blocks.size).toBe(2)
      // Knight and Night should have the same Metaphone code
      const knightBlock = Array.from(blocks.values()).find(
        (b) => b.length === 2
      )
      expect(knightBlock).toBeDefined()
      expect(knightBlock).toHaveLength(2)
    })

    it('blocks on year extracted from date', () => {
      const strategy = new StandardBlockingStrategy<Person>({
        field: 'dateOfBirth',
        transform: 'year',
      })

      const records: Person[] = [
        {
          id: '1',
          firstName: 'John',
          lastName: 'Smith',
          dateOfBirth: new Date('1990-01-15'),
        },
        {
          id: '2',
          firstName: 'Jane',
          lastName: 'Smyth',
          dateOfBirth: new Date('1990-12-31'),
        },
        {
          id: '3',
          firstName: 'Bob',
          lastName: 'Jones',
          dateOfBirth: new Date('1985-06-20'),
        },
      ]

      const blocks = strategy.generateBlocks(records)

      expect(blocks.size).toBe(2)
      expect(blocks.get('dateofbirth:1990')).toHaveLength(2)
      expect(blocks.get('dateofbirth:1985')).toHaveLength(1)
    })

    it('blocks using custom transform function', () => {
      const strategy = new StandardBlockingStrategy<Person>({
        field: 'email',
        transform: (value) => {
          if (!value || typeof value !== 'string') return null
          // Extract domain from email
          const parts = value.split('@')
          return parts.length === 2 ? parts[1] : null
        },
      })

      const records: Person[] = [
        {
          id: '1',
          firstName: 'John',
          lastName: 'Smith',
          email: 'john@example.com',
        },
        {
          id: '2',
          firstName: 'Jane',
          lastName: 'Smyth',
          email: 'jane@example.com',
        },
        {
          id: '3',
          firstName: 'Bob',
          lastName: 'Jones',
          email: 'bob@other.com',
        },
      ]

      const blocks = strategy.generateBlocks(records)

      expect(blocks.size).toBe(2)
      expect(blocks.get('email:example.com')).toHaveLength(2)
      expect(blocks.get('email:other.com')).toHaveLength(1)
    })

    it('blocks using firstN transform', () => {
      const strategy = new StandardBlockingStrategy<Person>({
        field: 'lastName',
        transform: 'firstN',
        transformOptions: { n: 3 },
      })

      const records: Person[] = [
        { id: '1', firstName: 'John', lastName: 'Smith' },
        { id: '2', firstName: 'Jane', lastName: 'Smyth' },
        { id: '3', firstName: 'Bob', lastName: 'Jones' },
      ]

      const blocks = strategy.generateBlocks(records)

      // SMI, SMY, JON are all different
      expect(blocks.size).toBe(3)
      expect(blocks.get('lastname:smi')).toHaveLength(1)
      expect(blocks.get('lastname:smy')).toHaveLength(1)
      expect(blocks.get('lastname:jon')).toHaveLength(1)
    })
  })

  describe('multi-field blocking', () => {
    it('creates composite block keys', () => {
      const strategy = new StandardBlockingStrategy<Person>({
        fields: ['lastName', 'birthYear'],
      })

      const records: Person[] = [
        { id: '1', firstName: 'John', lastName: 'Smith', birthYear: 1990 },
        { id: '2', firstName: 'Jane', lastName: 'Smith', birthYear: 1990 },
        { id: '3', firstName: 'Bob', lastName: 'Smith', birthYear: 1985 },
        { id: '4', firstName: 'Alice', lastName: 'Jones', birthYear: 1990 },
      ]

      const blocks = strategy.generateBlocks(records)

      expect(blocks.size).toBe(3)
      expect(blocks.get('lastname:smith|birthyear:1990')).toHaveLength(2)
      expect(blocks.get('lastname:smith|birthyear:1985')).toHaveLength(1)
      expect(blocks.get('lastname:jones|birthyear:1990')).toHaveLength(1)
    })

    it('applies transforms to each field', () => {
      const strategy = new StandardBlockingStrategy<Person>({
        fields: ['lastName', 'dateOfBirth'],
        transforms: ['firstLetter', 'year'],
      })

      const records: Person[] = [
        {
          id: '1',
          firstName: 'John',
          lastName: 'Smith',
          dateOfBirth: new Date('1990-01-01'),
        },
        {
          id: '2',
          firstName: 'Jane',
          lastName: 'Smyth',
          dateOfBirth: new Date('1990-12-31'),
        },
        {
          id: '3',
          firstName: 'Bob',
          lastName: 'Jones',
          dateOfBirth: new Date('1990-06-15'),
        },
      ]

      const blocks = strategy.generateBlocks(records)

      expect(blocks.size).toBe(2)
      expect(blocks.get('lastname:s|dateofbirth:1990')).toHaveLength(2)
      expect(blocks.get('lastname:j|dateofbirth:1990')).toHaveLength(1)
    })

    it('handles partial transforms array', () => {
      const strategy = new StandardBlockingStrategy<Person>({
        fields: ['lastName', 'birthYear'],
        transforms: ['firstLetter', undefined],
      })

      const records: Person[] = [
        { id: '1', firstName: 'John', lastName: 'Smith', birthYear: 1990 },
        { id: '2', firstName: 'Jane', lastName: 'Smyth', birthYear: 1990 },
      ]

      const blocks = strategy.generateBlocks(records)

      expect(blocks.size).toBe(1)
      expect(blocks.get('lastname:s|birthyear:1990')).toHaveLength(2)
    })

    it('handles transforms with options', () => {
      const strategy = new StandardBlockingStrategy<Person>({
        fields: ['lastName', 'firstName'],
        transforms: ['firstN', 'firstN'],
        transformOptions: [{ n: 2 }, { n: 1 }],
      })

      const records: Person[] = [
        { id: '1', firstName: 'John', lastName: 'Smith' },
        { id: '2', firstName: 'Jane', lastName: 'Smith' },
      ]

      const blocks = strategy.generateBlocks(records)

      // Both have SM (Smith) and J (John/Jane), so they're in the same block
      expect(blocks.size).toBe(1)
      expect(blocks.get('lastname:sm|firstname:j')).toHaveLength(2)
    })
  })

  describe('null handling', () => {
    it('skips records with null blocking field when strategy is skip', () => {
      const strategy = new StandardBlockingStrategy<Partial<Person>>({
        field: 'lastName',
        nullStrategy: 'skip',
      })

      const records: Partial<Person>[] = [
        { id: '1', firstName: 'John', lastName: 'Smith' },
        { id: '2', firstName: 'Jane' }, // No lastName
        { id: '3', firstName: 'Bob', lastName: 'Jones' },
      ]

      const blocks = strategy.generateBlocks(records)

      expect(blocks.size).toBe(2)
      expect(blocks.get('lastname:smith')).toHaveLength(1)
      expect(blocks.get('lastname:jones')).toHaveLength(1)
      expect(blocks.has('__NULL__')).toBe(false)
    })

    it('groups null values together when strategy is block', () => {
      const strategy = new StandardBlockingStrategy<Partial<Person>>({
        field: 'lastName',
        nullStrategy: 'block',
      })

      const records: Partial<Person>[] = [
        { id: '1', firstName: 'John', lastName: 'Smith' },
        { id: '2', firstName: 'Jane' }, // No lastName
        { id: '3', firstName: 'Bob' }, // No lastName
        { id: '4', firstName: 'Alice', lastName: 'Jones' },
      ]

      const blocks = strategy.generateBlocks(records)

      expect(blocks.size).toBe(3)
      expect(blocks.get('__NULL__')).toHaveLength(2)
      expect(blocks.get('lastname:smith')).toHaveLength(1)
      expect(blocks.get('lastname:jones')).toHaveLength(1)
    })

    it('compares null values against all records when strategy is compare', () => {
      const strategy = new StandardBlockingStrategy<Partial<Person>>({
        field: 'lastName',
        nullStrategy: 'compare',
      })

      const records: Partial<Person>[] = [
        { id: '1', firstName: 'John', lastName: 'Smith' },
        { id: '2', firstName: 'Jane' }, // No lastName
        { id: '3', firstName: 'Bob', lastName: 'Jones' },
      ]

      const blocks = strategy.generateBlocks(records)

      expect(blocks.has('__COMPARE_ALL__')).toBe(true)
      expect(blocks.get('__COMPARE_ALL__')).toHaveLength(1)
    })

    it('handles undefined vs null consistently', () => {
      const strategy = new StandardBlockingStrategy<Partial<Person>>({
        field: 'lastName',
        nullStrategy: 'block',
      })

      const records: Partial<Person>[] = [
        { id: '1', firstName: 'John', lastName: undefined },
        { id: '2', firstName: 'Jane', lastName: '' as any },
        { id: '3', firstName: 'Bob', lastName: null as any },
      ]

      const blocks = strategy.generateBlocks(records)

      // All should be treated as null
      expect(blocks.get('__NULL__')).toHaveLength(2) // undefined and null
      expect(blocks.get('lastname:')).toHaveLength(1) // empty string
    })

    it('handles null in multi-field blocking', () => {
      const strategy = new StandardBlockingStrategy<Partial<Person>>({
        fields: ['lastName', 'birthYear'],
        nullStrategy: 'skip',
      })

      const records: Partial<Person>[] = [
        { id: '1', firstName: 'John', lastName: 'Smith', birthYear: 1990 },
        { id: '2', firstName: 'Jane', lastName: 'Smith' }, // No birthYear
        { id: '3', firstName: 'Bob', birthYear: 1990 }, // No lastName
      ]

      const blocks = strategy.generateBlocks(records)

      // Only the first record has both fields
      expect(blocks.size).toBe(1)
      expect(blocks.get('lastname:smith|birthyear:1990')).toHaveLength(1)
    })
  })

  describe('key normalization', () => {
    it('normalizes keys by default (lowercase, trim)', () => {
      const strategy = new StandardBlockingStrategy<Person>({
        field: 'lastName',
      })

      const records: Person[] = [
        { id: '1', firstName: 'John', lastName: 'Smith' },
        { id: '2', firstName: 'Jane', lastName: 'SMITH' },
        { id: '3', firstName: 'Bob', lastName: 'Smith' }, // No extra spaces
      ]

      const blocks = strategy.generateBlocks(records)

      // All should be in the same block due to normalization
      expect(blocks.size).toBe(1)
      expect(blocks.get('lastname:smith')).toHaveLength(3)
    })

    it('preserves case when normalization is disabled', () => {
      const strategy = new StandardBlockingStrategy<Person>({
        field: 'lastName',
        normalizeKeys: false,
      })

      const records: Person[] = [
        { id: '1', firstName: 'John', lastName: 'Smith' },
        { id: '2', firstName: 'Jane', lastName: 'SMITH' },
      ]

      const blocks = strategy.generateBlocks(records)

      // Different cases create different blocks
      expect(blocks.size).toBe(2)
      expect(blocks.get('lastName:Smith')).toHaveLength(1)
      expect(blocks.get('lastName:SMITH')).toHaveLength(1)
    })
  })

  describe('edge cases', () => {
    it('handles empty record array', () => {
      const strategy = new StandardBlockingStrategy<Person>({
        field: 'lastName',
      })

      const blocks = strategy.generateBlocks([])
      expect(blocks.size).toBe(0)
    })

    it('handles single record', () => {
      const strategy = new StandardBlockingStrategy<Person>({
        field: 'lastName',
      })

      const records: Person[] = [
        { id: '1', firstName: 'John', lastName: 'Smith' },
      ]

      const blocks = strategy.generateBlocks(records)
      expect(blocks.size).toBe(1)
      expect(blocks.get('lastname:smith')).toHaveLength(1)
    })

    it('handles all records in one block', () => {
      const strategy = new StandardBlockingStrategy<Person>({
        field: 'lastName',
      })

      const records: Person[] = [
        { id: '1', firstName: 'John', lastName: 'Smith' },
        { id: '2', firstName: 'Jane', lastName: 'Smith' },
        { id: '3', firstName: 'Bob', lastName: 'Smith' },
      ]

      const blocks = strategy.generateBlocks(records)
      expect(blocks.size).toBe(1)
      expect(blocks.get('lastname:smith')).toHaveLength(3)
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

      const strategy = new StandardBlockingStrategy<NestedPerson>({
        field: 'user.profile.lastName',
        nullStrategy: 'skip',
      })

      const records: NestedPerson[] = [
        { id: '1', user: { profile: { lastName: 'Smith' } } },
        { id: '2', user: {} },
        { id: '3' },
      ]

      const blocks = strategy.generateBlocks(records)
      expect(blocks.size).toBe(1)
      expect(blocks.get('user.profile.lastname:smith')).toHaveLength(1)
    })
  })

  describe('strategy naming', () => {
    it('generates name for single field without transform', () => {
      const strategy = new StandardBlockingStrategy<Person>({
        field: 'lastName',
      })

      expect(strategy.name).toBe('standard:lastName')
    })

    it('generates name for single field with transform', () => {
      const strategy = new StandardBlockingStrategy<Person>({
        field: 'lastName',
        transform: 'soundex',
      })

      expect(strategy.name).toBe('standard:lastName:soundex')
    })

    it('generates name for multi-field', () => {
      const strategy = new StandardBlockingStrategy<Person>({
        fields: ['lastName', 'birthYear'],
      })

      expect(strategy.name).toBe('standard:lastName+birthYear')
    })

    it('generates name for custom transform', () => {
      const strategy = new StandardBlockingStrategy<Person>({
        field: 'email',
        transform: (value) => String(value),
      })

      expect(strategy.name).toBe('standard:email:custom')
    })
  })

  describe('block keys stability', () => {
    it('generates deterministic keys', () => {
      const strategy = new StandardBlockingStrategy<Person>({
        field: 'lastName',
        transform: 'firstLetter',
      })

      const record: Person = { id: '1', firstName: 'John', lastName: 'Smith' }

      const blocks1 = strategy.generateBlocks([record])
      const blocks2 = strategy.generateBlocks([record])

      expect(Array.from(blocks1.keys())).toEqual(Array.from(blocks2.keys()))
    })

    it('generates stable keys across multiple runs', () => {
      const strategy = new StandardBlockingStrategy<Person>({
        fields: ['lastName', 'birthYear'],
        transforms: ['soundex', 'identity'],
      })

      const records: Person[] = [
        { id: '1', firstName: 'John', lastName: 'Smith', birthYear: 1990 },
      ]

      const keys1 = Array.from(strategy.generateBlocks(records).keys())
      const keys2 = Array.from(strategy.generateBlocks(records).keys())
      const keys3 = Array.from(strategy.generateBlocks(records).keys())

      expect(keys1).toEqual(keys2)
      expect(keys2).toEqual(keys3)
    })
  })
})
