import { describe, it, expect } from 'vitest'
import { HaveWeMet } from './resolver-builder'

interface Person extends Record<string, unknown> {
  id: string
  firstName: string
  lastName: string
  email: string
  dateOfBirth: string
  age: number
}

describe('BlockingBuilder Integration', () => {
  describe('end-to-end with ResolverBuilder', () => {
    it('integrates blocking into resolver configuration', () => {
      const resolver = HaveWeMet.create<Person>()
        .schema((schema) =>
          schema
            .field('firstName', { type: 'name' })
            .field('lastName', { type: 'name' })
            .field('email', { type: 'email' })
        )
        .blocking((block) =>
          block.onField('lastName', { transform: 'soundex' })
        )
        .matching((match) =>
          match
            .field('firstName')
            .strategy('jaro-winkler')
            .weight(10)
            .field('lastName')
            .strategy('jaro-winkler')
            .weight(15)
            .field('email')
            .strategy('levenshtein')
            .weight(5)
            .thresholds({
              noMatch: 20,
              definiteMatch: 45,
            })
        )
        .build()

      expect(resolver).toBeDefined()
    })

    it('works without blocking configuration (optional)', () => {
      const resolver = HaveWeMet.create<Person>()
        .schema((schema) =>
          schema
            .field('firstName', { type: 'name' })
            .field('lastName', { type: 'name' })
        )
        .matching((match) =>
          match
            .field('firstName')
            .strategy('exact')
            .weight(1)
            .field('lastName')
            .strategy('exact')
            .weight(1)
            .thresholds({
              noMatch: 20,
              definiteMatch: 80,
            })
        )
        .build()

      expect(resolver).toBeDefined()
    })

    it('supports standard blocking in builder chain', () => {
      const resolver = HaveWeMet.create<Person>()
        .schema((schema) =>
          schema
            .field('lastName', { type: 'name' })
            .field('dateOfBirth', { type: 'date' })
        )
        .blocking((block) =>
          block.onFields(['lastName', 'dateOfBirth'], {
            transforms: ['firstLetter', 'year'],
          })
        )
        .matching((match) =>
          match.field('lastName').strategy('exact').weight(1).thresholds({
            noMatch: 10,
            definiteMatch: 50,
          })
        )
        .build()

      expect(resolver).toBeDefined()
    })

    it('supports sorted neighbourhood in builder chain', () => {
      const resolver = HaveWeMet.create<Person>()
        .schema((schema) =>
          schema
            .field('lastName', { type: 'name' })
            .field('email', { type: 'email' })
        )
        .blocking((block) =>
          block.sortedNeighbourhood('lastName', {
            windowSize: 10,
            transform: 'soundex',
          })
        )
        .matching((match) =>
          match
            .field('lastName')
            .strategy('jaro-winkler')
            .weight(1)
            .thresholds({
              noMatch: 20,
              definiteMatch: 80,
            })
        )
        .build()

      expect(resolver).toBeDefined()
    })

    it('supports composite blocking in builder chain', () => {
      const resolver = HaveWeMet.create<Person>()
        .schema((schema) =>
          schema
            .field('lastName', { type: 'name' })
            .field('dateOfBirth', { type: 'date' })
            .field('email', { type: 'email' })
        )
        .blocking((block) =>
          block.composite('union', (comp) =>
            comp
              .onField('lastName', { transform: 'soundex' })
              .onField('dateOfBirth', { transform: 'year' })
          )
        )
        .matching((match) =>
          match
            .field('lastName')
            .strategy('jaro-winkler')
            .weight(10)
            .field('email')
            .strategy('levenshtein')
            .weight(5)
            .thresholds({
              noMatch: 15,
              definiteMatch: 40,
            })
        )
        .build()

      expect(resolver).toBeDefined()
    })

    it('supports multiple strategies (auto-union) in builder chain', () => {
      const resolver = HaveWeMet.create<Person>()
        .schema((schema) =>
          schema
            .field('lastName', { type: 'name' })
            .field('email', { type: 'email' })
        )
        .blocking((block) =>
          block
            .onField('lastName', { transform: 'soundex' })
            .sortedNeighbourhood('email', { windowSize: 5 })
        )
        .matching((match) =>
          match.field('lastName').strategy('exact').weight(1).thresholds({
            noMatch: 20,
            definiteMatch: 80,
          })
        )
        .build()

      expect(resolver).toBeDefined()
    })
  })

  describe('blocking configuration can be placed in different positions', () => {
    it('blocking can come after schema', () => {
      const resolver = HaveWeMet.create<Person>()
        .schema((schema) => schema.field('lastName', { type: 'name' }))
        .blocking((block) => block.onField('lastName'))
        .matching((match) =>
          match
            .field('lastName')
            .strategy('exact')
            .weight(1)
            .thresholds({ noMatch: 20, definiteMatch: 80 })
        )
        .build()

      expect(resolver).toBeDefined()
    })

    it('blocking can come before matching', () => {
      const resolver = HaveWeMet.create<Person>()
        .schema((schema) => schema.field('lastName', { type: 'name' }))
        .blocking((block) => block.onField('lastName'))
        .matching((match) =>
          match
            .field('lastName')
            .strategy('exact')
            .weight(1)
            .thresholds({ noMatch: 20, definiteMatch: 80 })
        )
        .build()

      expect(resolver).toBeDefined()
    })

    it('blocking can come before thresholds', () => {
      const resolver = HaveWeMet.create<Person>()
        .schema((schema) => schema.field('lastName', { type: 'name' }))
        .matching((match) =>
          match
            .field('lastName')
            .strategy('exact')
            .weight(1)
            .thresholds({ noMatch: 20, definiteMatch: 80 })
        )
        .blocking((block) => block.onField('lastName'))
        .build()

      expect(resolver).toBeDefined()
    })
  })

  describe('type safety', () => {
    it('validates field names against schema', () => {
      const resolver = HaveWeMet.create<Person>()
        .schema((schema) =>
          schema
            .field('firstName', { type: 'name' })
            .field('lastName', { type: 'name' })
        )
        .blocking((block) => block.onField('firstName').onField('lastName'))
        .matching((match) =>
          match
            .field('firstName')
            .strategy('exact')
            .weight(1)
            .thresholds({ noMatch: 20, definiteMatch: 80 })
        )
        .build()

      expect(resolver).toBeDefined()
    })

    it('accepts arrays of field names', () => {
      const resolver = HaveWeMet.create<Person>()
        .schema((schema) =>
          schema
            .field('firstName', { type: 'name' })
            .field('lastName', { type: 'name' })
        )
        .blocking((block) => block.onFields(['firstName', 'lastName']))
        .matching((match) =>
          match
            .field('firstName')
            .strategy('exact')
            .weight(1)
            .thresholds({ noMatch: 20, definiteMatch: 80 })
        )
        .build()

      expect(resolver).toBeDefined()
    })
  })

  describe('custom transforms', () => {
    it('accepts custom transform functions', () => {
      const resolver = HaveWeMet.create<Person>()
        .schema((schema) => schema.field('email', { type: 'email' }))
        .blocking((block) =>
          block.onField('email', {
            transform: (value) => {
              if (typeof value === 'string') {
                const domain = value.split('@')[1]
                return domain || null
              }
              return null
            },
          })
        )
        .matching((match) =>
          match
            .field('email')
            .strategy('exact')
            .weight(1)
            .thresholds({ noMatch: 20, definiteMatch: 80 })
        )
        .build()

      expect(resolver).toBeDefined()
    })
  })

  describe('configurator patterns', () => {
    it('works with explicit return', () => {
      const resolver = HaveWeMet.create<Person>()
        .schema((schema) => schema.field('lastName', { type: 'name' }))
        .blocking((block) => {
          return block.onField('lastName')
        })
        .matching((match) =>
          match
            .field('lastName')
            .strategy('exact')
            .weight(1)
            .thresholds({ noMatch: 20, definiteMatch: 80 })
        )
        .build()

      expect(resolver).toBeDefined()
    })

    it('works without explicit return', () => {
      const resolver = HaveWeMet.create<Person>()
        .schema((schema) => {
          schema.field('lastName', { type: 'name' })
        })
        .blocking((block) => {
          block.onField('lastName')
        })
        .matching((match) =>
          match
            .field('lastName')
            .strategy('exact')
            .weight(1)
            .thresholds({ noMatch: 20, definiteMatch: 80 })
        )
        .build()

      expect(resolver).toBeDefined()
    })

    it('works with inline arrow function', () => {
      const resolver = HaveWeMet.create<Person>()
        .schema((schema) => schema.field('lastName', { type: 'name' }))
        .blocking((block) => block.onField('lastName'))
        .matching((match) =>
          match
            .field('lastName')
            .strategy('exact')
            .weight(1)
            .thresholds({ noMatch: 20, definiteMatch: 80 })
        )
        .build()

      expect(resolver).toBeDefined()
    })
  })
})
