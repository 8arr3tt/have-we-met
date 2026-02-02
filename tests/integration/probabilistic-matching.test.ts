import { describe, it, expect } from 'vitest'
import { HaveWeMet } from '../../src'

describe('Integration: Probabilistic Matching', () => {
  describe('single record matching scenarios', () => {
    it('identifies definite match via exact email', () => {
      const resolver = HaveWeMet.create<{
        firstName: string
        lastName: string
        email: string
        phone: string
      }>()
        .schema((schema) => {
          schema
            .field('firstName', { type: 'name', component: 'first' })
            .field('lastName', { type: 'name', component: 'last' })
            .field('email', { type: 'email' })
            .field('phone', { type: 'phone' })
        })
        .matching((match) => {
          match
            .field('email')
            .strategy('exact')
            .weight(20)
            .field('phone')
            .strategy('exact')
            .weight(15)
            .field('firstName')
            .strategy('jaro-winkler')
            .weight(10)
            .threshold(0.85)
            .field('lastName')
            .strategy('jaro-winkler')
            .weight(10)
            .threshold(0.85)
            .thresholds({ noMatch: 20, definiteMatch: 45 })
        })
        .build()

      const candidate = {
        firstName: 'John',
        lastName: 'Smith',
        email: 'john.doe@example.com',
        phone: '+1-555-0100',
      }

      const existing = [
        {
          firstName: 'John',
          lastName: 'Smith',
          email: 'john.doe@example.com',
          phone: '+1-555-0100',
        },
      ]

      const results = resolver.resolve(candidate, existing)

      expect(results).toHaveLength(1)
      expect(results[0].outcome).toBe('definite-match')
      expect(results[0].score.totalScore).toBeGreaterThanOrEqual(45)
      expect(results[0].explanation).toContain('Definite Match')
    })

    it('identifies definite match via high overall score', () => {
      const resolver = HaveWeMet.create<{
        firstName: string
        lastName: string
        email: string
        dateOfBirth: string
      }>()
        .schema((schema) => {
          schema
            .field('firstName', { type: 'name', component: 'first' })
            .field('lastName', { type: 'name', component: 'last' })
            .field('email', { type: 'email' })
            .field('dateOfBirth', { type: 'date' })
        })
        .matching((match) => {
          match
            .field('firstName')
            .strategy('jaro-winkler')
            .weight(15)
            .field('lastName')
            .strategy('exact')
            .weight(15)
            .field('email')
            .strategy('levenshtein')
            .weight(20)
            .field('dateOfBirth')
            .strategy('exact')
            .weight(10)
            .thresholds({ noMatch: 15, definiteMatch: 45 })
        })
        .build()

      const candidate = {
        firstName: 'John',
        lastName: 'Smith',
        email: 'john.smith@example.com',
        dateOfBirth: '1985-03-15',
      }

      const existing = [
        {
          firstName: 'John',
          lastName: 'Smith',
          email: 'john.smith@example.com',
          dateOfBirth: '1985-03-15',
        },
      ]

      const results = resolver.resolve(candidate, existing)

      expect(results).toHaveLength(1)
      expect(results[0].outcome).toBe('definite-match')
      expect(results[0].score.totalScore).toBeGreaterThanOrEqual(45)
      expect(results[0].score.normalizedScore).toBeGreaterThan(0.7)
    })

    it('identifies potential match with mixed signals', () => {
      const resolver = HaveWeMet.create<{
        firstName: string
        lastName: string
        email: string
        phone: string
        dateOfBirth: string
      }>()
        .schema((schema) => {
          schema
            .field('firstName', { type: 'name', component: 'first' })
            .field('lastName', { type: 'name', component: 'last' })
            .field('email', { type: 'email' })
            .field('phone', { type: 'phone' })
            .field('dateOfBirth', { type: 'date' })
        })
        .matching((match) => {
          match
            .field('email')
            .strategy('exact')
            .weight(20)
            .field('phone')
            .strategy('exact')
            .weight(15)
            .field('firstName')
            .strategy('jaro-winkler')
            .weight(10)
            .threshold(0.85)
            .field('lastName')
            .strategy('jaro-winkler')
            .weight(10)
            .threshold(0.85)
            .field('dateOfBirth')
            .strategy('exact')
            .weight(10)
            .thresholds({ noMatch: 20, definiteMatch: 45 })
        })
        .build()

      const candidate = {
        firstName: 'John',
        lastName: 'Smith',
        email: 'john.doe@example.com',
        phone: '+1-555-0100',
        dateOfBirth: '1985-03-15',
      }

      const existing = [
        {
          firstName: 'Jon',
          lastName: 'Smyth',
          email: 'john.doe@example.com',
          phone: '+1-555-0200',
          dateOfBirth: '1985-03-20',
        },
      ]

      const results = resolver.resolve(candidate, existing)

      expect(results).toHaveLength(1)
      expect(results[0].outcome).toBe('potential-match')
      expect(results[0].score.totalScore).toBeGreaterThanOrEqual(20)
      expect(results[0].score.totalScore).toBeLessThan(45)
      expect(results[0].explanation).toContain('Potential Match')
    })

    it('filters out no matches', () => {
      const resolver = HaveWeMet.create<{
        firstName: string
        lastName: string
        email: string
      }>()
        .schema((schema) => {
          schema
            .field('firstName', { type: 'name', component: 'first' })
            .field('lastName', { type: 'name', component: 'last' })
            .field('email', { type: 'email' })
        })
        .matching((match) => {
          match
            .field('email')
            .strategy('exact')
            .weight(30)
            .field('firstName')
            .strategy('jaro-winkler')
            .weight(15)
            .field('lastName')
            .strategy('jaro-winkler')
            .weight(15)
            .thresholds({ noMatch: 25, definiteMatch: 50 })
        })
        .build()

      const candidate = {
        firstName: 'John',
        lastName: 'Smith',
        email: 'john@example.com',
      }

      const existing = [
        {
          firstName: 'Jane',
          lastName: 'Johnson',
          email: 'jane@different.com',
        },
      ]

      const results = resolver.resolve(candidate, existing)

      expect(results).toHaveLength(1)
      expect(results[0].outcome).toBe('no-match')
      expect(results[0].score.totalScore).toBeLessThan(25)
    })

    it('applies blocking for performance', () => {
      const resolver = HaveWeMet.create<{
        firstName: string
        lastName: string
        email: string
      }>()
        .schema((schema) => {
          schema
            .field('firstName', { type: 'name', component: 'first' })
            .field('lastName', { type: 'name', component: 'last' })
            .field('email', { type: 'email' })
        })
        .blocking((block) => {
          block.onField('email')
        })
        .matching((match) => {
          match
            .field('email')
            .strategy('exact')
            .weight(30)
            .field('firstName')
            .strategy('jaro-winkler')
            .weight(15)
            .field('lastName')
            .strategy('jaro-winkler')
            .weight(15)
            .thresholds({ noMatch: 20, definiteMatch: 50 })
        })
        .build()

      const candidate = {
        firstName: 'John',
        lastName: 'Smith',
        email: 'john@example.com',
      }

      const existing = [
        {
          firstName: 'John',
          lastName: 'Smith',
          email: 'john@example.com',
        },
        {
          firstName: 'Jane',
          lastName: 'Doe',
          email: 'jane@different.com',
        },
        {
          firstName: 'Bob',
          lastName: 'Johnson',
          email: 'bob@another.com',
        },
      ]

      const results = resolver.resolve(candidate, existing)

      expect(results.length).toBeGreaterThan(0)
      const definiteMatch = results.find((r) => r.outcome === 'definite-match')
      expect(definiteMatch).toBeDefined()
      expect(definiteMatch!.candidateRecord).toEqual(existing[0])
    })

    it('provides detailed explanations', () => {
      const resolver = HaveWeMet.create<{
        firstName: string
        lastName: string
        email: string
      }>()
        .schema((schema) => {
          schema
            .field('firstName', { type: 'name', component: 'first' })
            .field('lastName', { type: 'name', component: 'last' })
            .field('email', { type: 'email' })
        })
        .matching((match) => {
          match
            .field('email')
            .strategy('exact')
            .weight(30)
            .field('firstName')
            .strategy('jaro-winkler')
            .weight(15)
            .field('lastName')
            .strategy('jaro-winkler')
            .weight(15)
            .thresholds({ noMatch: 20, definiteMatch: 50 })
        })
        .build()

      const candidate = {
        firstName: 'John',
        lastName: 'Smith',
        email: 'john@example.com',
      }

      const existing = [
        {
          firstName: 'Jon',
          lastName: 'Smyth',
          email: 'john@example.com',
        },
      ]

      const results = resolver.resolve(candidate, existing)

      expect(results).toHaveLength(1)
      expect(results[0].explanation).toBeTruthy()
      expect(results[0].explanation).toContain('email')
      expect(results[0].explanation).toContain('firstName')
      expect(results[0].explanation).toContain('lastName')
      expect(results[0].score.fieldScores).toHaveLength(3)
    })

    it('handles multiple candidates and returns sorted results', () => {
      const resolver = HaveWeMet.create<{
        firstName: string
        email: string
      }>()
        .schema((schema) => {
          schema
            .field('firstName', { type: 'name', component: 'first' })
            .field('email', { type: 'email' })
        })
        .matching((match) => {
          match
            .field('email')
            .strategy('exact')
            .weight(40)
            .field('firstName')
            .strategy('jaro-winkler')
            .weight(20)
            .thresholds({ noMatch: 10, definiteMatch: 50 })
        })
        .build()

      const candidate = {
        firstName: 'John',
        email: 'john@example.com',
      }

      const existing = [
        {
          firstName: 'John',
          email: 'john@example.com',
        },
        {
          firstName: 'Jon',
          email: 'john@example.com',
        },
        {
          firstName: 'Jane',
          email: 'jane@example.com',
        },
      ]

      const results = resolver.resolve(candidate, existing)

      expect(results).toHaveLength(3)
      expect(results[0].score.totalScore).toBeGreaterThanOrEqual(
        results[1].score.totalScore
      )
      expect(results[1].score.totalScore).toBeGreaterThanOrEqual(
        results[2].score.totalScore
      )
    })
  })

  describe('batch deduplication', () => {
    it('finds all duplicates in dataset', () => {
      const resolver = HaveWeMet.create<{
        firstName: string
        lastName: string
        email: string
      }>()
        .schema((schema) => {
          schema
            .field('firstName', { type: 'name', component: 'first' })
            .field('lastName', { type: 'name', component: 'last' })
            .field('email', { type: 'email' })
        })
        .matching((match) => {
          match
            .field('email')
            .strategy('exact')
            .weight(30)
            .field('firstName')
            .strategy('jaro-winkler')
            .weight(15)
            .field('lastName')
            .strategy('jaro-winkler')
            .weight(15)
            .thresholds({ noMatch: 20, definiteMatch: 50 })
        })
        .build()

      const records = [
        { firstName: 'John', lastName: 'Smith', email: 'john@example.com' },
        { firstName: 'John', lastName: 'Smith', email: 'john@example.com' },
        { firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com' },
        { firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com' },
        { firstName: 'Bob', lastName: 'Johnson', email: 'bob@example.com' },
      ]

      const result = resolver.deduplicateBatch(records)

      expect(result.stats.recordsProcessed).toBe(5)
      expect(result.stats.definiteMatchesFound).toBeGreaterThan(0)
      expect(result.results.length).toBeGreaterThan(0)

      const recordsWithDefiniteMatches = result.results.filter(
        (r) => r.hasDefiniteMatches
      )
      expect(recordsWithDefiniteMatches.length).toBeGreaterThan(0)
    })

    it('handles datasets with no duplicates', () => {
      const resolver = HaveWeMet.create<{
        firstName: string
        email: string
      }>()
        .schema((schema) => {
          schema
            .field('firstName', { type: 'name', component: 'first' })
            .field('email', { type: 'email' })
        })
        .matching((match) => {
          match
            .field('email')
            .strategy('exact')
            .weight(50)
            .field('firstName')
            .strategy('jaro-winkler')
            .weight(20)
            .thresholds({ noMatch: 30, definiteMatch: 60 })
        })
        .build()

      const records = [
        { firstName: 'John', email: 'john@example.com' },
        { firstName: 'Jane', email: 'jane@example.com' },
        { firstName: 'Bob', email: 'bob@example.com' },
      ]

      const result = resolver.deduplicateBatch(records)

      expect(result.stats.recordsProcessed).toBe(3)
      expect(result.stats.definiteMatchesFound).toBe(0)
      expect(result.stats.recordsWithMatches).toBe(0)
    })

    it('handles 100+ records efficiently with blocking', () => {
      const resolver = HaveWeMet.create<{
        firstName: string
        lastName: string
        email: string
      }>()
        .schema((schema) => {
          schema
            .field('firstName', { type: 'name', component: 'first' })
            .field('lastName', { type: 'name', component: 'last' })
            .field('email', { type: 'email' })
        })
        .blocking((block) => {
          block.onField('email')
        })
        .matching((match) => {
          match
            .field('email')
            .strategy('exact')
            .weight(30)
            .field('firstName')
            .strategy('jaro-winkler')
            .weight(15)
            .field('lastName')
            .strategy('jaro-winkler')
            .weight(15)
            .thresholds({ noMatch: 20, definiteMatch: 50 })
        })
        .build()

      const records = []
      for (let i = 0; i < 100; i++) {
        records.push({
          firstName: `Person${i}`,
          lastName: `LastName${i}`,
          email: `person${i}@example.com`,
        })
      }

      for (let i = 0; i < 10; i++) {
        records.push({
          firstName: `Person${i}`,
          lastName: `LastName${i}`,
          email: `person${i}@example.com`,
        })
      }

      const startTime = Date.now()
      const result = resolver.deduplicateBatch(records)
      const duration = Date.now() - startTime

      expect(result.stats.recordsProcessed).toBe(110)
      expect(result.stats.definiteMatchesFound).toBe(10)
      expect(duration).toBeLessThan(1000)
    })

    it('provides comprehensive statistics', () => {
      const resolver = HaveWeMet.create<{
        firstName: string
        email: string
      }>()
        .schema((schema) => {
          schema
            .field('firstName', { type: 'name', component: 'first' })
            .field('email', { type: 'email' })
        })
        .matching((match) => {
          match
            .field('email')
            .strategy('exact')
            .weight(50)
            .field('firstName')
            .strategy('jaro-winkler')
            .weight(20)
            .thresholds({ noMatch: 20, definiteMatch: 60 })
        })
        .build()

      const records = [
        { firstName: 'John', email: 'john@example.com' },
        { firstName: 'John', email: 'john@example.com' },
        { firstName: 'Jane', email: 'jane@example.com' },
      ]

      const result = resolver.deduplicateBatch(records)

      expect(result.stats).toHaveProperty('recordsProcessed')
      expect(result.stats).toHaveProperty('comparisonsMade')
      expect(result.stats).toHaveProperty('definiteMatchesFound')
      expect(result.stats).toHaveProperty('potentialMatchesFound')
      expect(result.stats).toHaveProperty('noMatchesFound')
      expect(result.stats).toHaveProperty('recordsWithMatches')
      expect(result.stats).toHaveProperty('recordsWithoutMatches')

      expect(result.stats.recordsProcessed).toBe(3)
      expect(result.stats.comparisonsMade).toBeGreaterThan(0)
    })

    it('respects maxPairsPerRecord option', () => {
      const resolver = HaveWeMet.create<{
        firstName: string
        email: string
      }>()
        .schema((schema) => {
          schema
            .field('firstName', { type: 'name', component: 'first' })
            .field('email', { type: 'email' })
        })
        .matching((match) => {
          match
            .field('email')
            .strategy('exact')
            .weight(50)
            .field('firstName')
            .strategy('jaro-winkler')
            .weight(20)
            .thresholds({ noMatch: 20, definiteMatch: 60 })
        })
        .build()

      const records = [
        { firstName: 'John', email: 'john@example.com' },
        { firstName: 'John', email: 'john@example.com' },
        { firstName: 'John', email: 'john@example.com' },
        { firstName: 'John', email: 'john@example.com' },
      ]

      const result = resolver.deduplicateBatch(records, {
        maxPairsPerRecord: 2,
      })

      for (const dedupResult of result.results) {
        expect(dedupResult.matches.length).toBeLessThanOrEqual(2)
      }
    })

    it('respects minScore option', () => {
      const resolver = HaveWeMet.create<{
        firstName: string
        email: string
      }>()
        .schema((schema) => {
          schema
            .field('firstName', { type: 'name', component: 'first' })
            .field('email', { type: 'email' })
        })
        .matching((match) => {
          match
            .field('email')
            .strategy('exact')
            .weight(50)
            .field('firstName')
            .strategy('jaro-winkler')
            .weight(20)
            .thresholds({ noMatch: 20, definiteMatch: 60 })
        })
        .build()

      const records = [
        { firstName: 'John', email: 'john@example.com' },
        { firstName: 'Jon', email: 'john@example.com' },
        { firstName: 'Jane', email: 'jane@example.com' },
      ]

      const result = resolver.deduplicateBatch(records, { minScore: 60 })

      for (const dedupResult of result.results) {
        for (const match of dedupResult.matches) {
          expect(match.score.totalScore).toBeGreaterThanOrEqual(60)
        }
      }
    })

    it('handles includeNoMatches option', () => {
      const resolver = HaveWeMet.create<{
        firstName: string
        email: string
      }>()
        .schema((schema) => {
          schema
            .field('firstName', { type: 'name', component: 'first' })
            .field('email', { type: 'email' })
        })
        .matching((match) => {
          match
            .field('email')
            .strategy('exact')
            .weight(50)
            .field('firstName')
            .strategy('jaro-winkler')
            .weight(20)
            .thresholds({ noMatch: 20, definiteMatch: 60 })
        })
        .build()

      const records = [
        { firstName: 'John', email: 'john@example.com' },
        { firstName: 'Jane', email: 'jane@example.com' },
        { firstName: 'Bob', email: 'bob@example.com' },
      ]

      const result = resolver.deduplicateBatch(records, {
        includeNoMatches: true,
      })

      expect(result.results.length).toBe(3)

      const recordsWithNoMatches = result.results.filter(
        (r) => r.matches.length === 0
      )
      expect(recordsWithNoMatches.length).toBeGreaterThan(0)
    })
  })

  describe('real-world scenarios', () => {
    it('customer deduplication scenario', () => {
      const resolver = HaveWeMet.create<{
        firstName: string
        lastName: string
        email: string
        phone: string
        company: string
      }>()
        .schema((schema) => {
          schema
            .field('firstName', { type: 'name', component: 'first' })
            .field('lastName', { type: 'name', component: 'last' })
            .field('email', { type: 'email' })
            .field('phone', { type: 'phone' })
            .field('company', { type: 'text' })
        })
        .matching((match) => {
          match
            .field('email')
            .strategy('exact')
            .weight(25)
            .field('phone')
            .strategy('exact')
            .weight(20)
            .field('firstName')
            .strategy('jaro-winkler')
            .weight(10)
            .threshold(0.85)
            .field('lastName')
            .strategy('jaro-winkler')
            .weight(10)
            .threshold(0.85)
            .field('company')
            .strategy('levenshtein')
            .weight(10)
            .threshold(0.8)
            .thresholds({ noMatch: 20, definiteMatch: 50 })
        })
        .build()

      const customers = [
        {
          firstName: 'John',
          lastName: 'Smith',
          email: 'john.smith@acme.com',
          phone: '+1-555-0100',
          company: 'Acme Corp',
        },
        {
          firstName: 'John',
          lastName: 'Smith',
          email: 'jsmith@acme.com',
          phone: '+1-555-0100',
          company: 'Acme Corporation',
        },
        {
          firstName: 'Jane',
          lastName: 'Doe',
          email: 'jane.doe@example.com',
          phone: '+1-555-0200',
          company: 'Example Inc',
        },
      ]

      const result = resolver.deduplicateBatch(customers)

      expect(result.stats.recordsProcessed).toBe(3)

      const johnSmithRecords = result.results.filter(
        (r) =>
          r.record.firstName === 'John' &&
          r.record.lastName === 'Smith' &&
          r.matches.length > 0
      )
      expect(johnSmithRecords.length).toBe(2)
    })

    it('contact list merging scenario', () => {
      const resolver = HaveWeMet.create<{
        name: string
        email: string
        phone: string
      }>()
        .schema((schema) => {
          schema
            .field('name', { type: 'name' })
            .field('email', { type: 'email' })
            .field('phone', { type: 'phone' })
        })
        .matching((match) => {
          match
            .field('email')
            .strategy('exact')
            .weight(30)
            .field('phone')
            .strategy('exact')
            .weight(25)
            .field('name')
            .strategy('jaro-winkler')
            .weight(15)
            .thresholds({ noMatch: 25, definiteMatch: 55 })
        })
        .build()

      const newContact = {
        name: 'John Smith',
        email: 'john@example.com',
        phone: '+1-555-0100',
      }

      const existingContacts = [
        {
          name: 'John Smith',
          email: 'john@example.com',
          phone: '+1-555-0100',
        },
        {
          name: 'J. Smith',
          email: 'john@example.com',
          phone: '',
        },
        {
          name: 'Jane Doe',
          email: 'jane@example.com',
          phone: '+1-555-0200',
        },
      ]

      const results = resolver.resolve(newContact, existingContacts)

      const definiteMatches = results.filter(
        (r) => r.outcome === 'definite-match'
      )
      const potentialMatches = results.filter(
        (r) => r.outcome === 'potential-match'
      )

      expect(definiteMatches.length).toBeGreaterThan(0)
      expect(results[0].candidateRecord).toEqual(existingContacts[0])
    })
  })
})
