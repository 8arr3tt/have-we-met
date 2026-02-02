import { describe, it, expect, vi } from 'vitest'
import { HaveWeMet, ResolverBuilder } from '../../src/builder/resolver-builder'
import { Resolver } from '../../src/core/resolver'
import type { SchemaBuilder } from '../../src/builder/schema-builder'
import type { MatchingBuilder } from '../../src/builder/matching-builder'
import type { DatabaseAdapter } from '../../src/adapters/types'

interface TestPerson {
  firstName: string
  lastName: string
  email: string
  phone?: string
}

describe('HaveWeMet', () => {
  describe('create', () => {
    it('returns a ResolverBuilder instance', () => {
      const builder = HaveWeMet.create()
      expect(builder).toBeInstanceOf(ResolverBuilder)
    })

    it('supports type parameter', () => {
      const builder = HaveWeMet.create<TestPerson>()
      expect(builder).toBeInstanceOf(ResolverBuilder)
    })

    it('creates independent builder instances', () => {
      const builder1 = HaveWeMet.create()
      const builder2 = HaveWeMet.create()
      expect(builder1).not.toBe(builder2)
    })
  })
})

describe('ResolverBuilder', () => {
  describe('schema', () => {
    it('accepts configurator that returns builder', () => {
      const builder = HaveWeMet.create<TestPerson>()

      const result = builder.schema((schema) => {
        return schema
          .field('firstName', { type: 'name', component: 'first' })
          .field('lastName', { type: 'name', component: 'last' })
          .field('email', { type: 'email' })
      })

      expect(result).toBe(builder)
    })

    it('accepts configurator that returns void', () => {
      const builder = HaveWeMet.create<TestPerson>()

      const result = builder.schema((schema) => {
        schema
          .field('firstName', { type: 'name', component: 'first' })
          .field('lastName', { type: 'name', component: 'last' })
          .field('email', { type: 'email' })
      })

      expect(result).toBe(builder)
    })

    it('supports method chaining', () => {
      const builder = HaveWeMet.create<TestPerson>()
      const result = builder.schema((schema) => {
        schema.field('email', { type: 'email' })
      })

      expect(result).toBeInstanceOf(ResolverBuilder)
    })

    it('stores schema configuration', () => {
      const builder = HaveWeMet.create<TestPerson>()
      builder
        .schema((schema) => {
          schema.field('email', { type: 'email' })
        })
        .matching((match) => {
          return match.field('email').strategy('exact').weight(100)
        })

      const resolver = builder.build()
      expect(resolver).toBeInstanceOf(Resolver)
    })
  })

  describe('matching', () => {
    it('accepts configurator that returns builder', () => {
      const builder = HaveWeMet.create<TestPerson>()

      const result = builder.matching((match) => {
        return match
          .field('email')
          .strategy('exact')
          .weight(50)
          .field('firstName')
          .strategy('jaro-winkler')
          .weight(25)
      })

      expect(result).toBe(builder)
    })

    it('accepts configurator that returns void', () => {
      const builder = HaveWeMet.create<TestPerson>()

      const result = builder.matching((match) => {
        match
          .field('email')
          .strategy('exact')
          .weight(50)
          .field('firstName')
          .strategy('jaro-winkler')
          .weight(25)
      })

      expect(result).toBe(builder)
    })

    it('supports method chaining', () => {
      const builder = HaveWeMet.create<TestPerson>()
      const result = builder.matching((match) => {
        match.field('email').weight(100)
      })

      expect(result).toBeInstanceOf(ResolverBuilder)
    })

    it('stores matching configuration', () => {
      const builder = HaveWeMet.create<TestPerson>()
      builder
        .schema((schema) => {
          schema.field('email', { type: 'email' })
        })
        .matching((match) => {
          return match.field('email').strategy('exact').weight(100)
        })

      const resolver = builder.build()
      expect(resolver).toBeInstanceOf(Resolver)
    })
  })

  describe('thresholds', () => {
    it('sets thresholds when no matching config exists', () => {
      const builder = HaveWeMet.create<TestPerson>()
      builder
        .schema((schema) => {
          schema.field('email', { type: 'email' })
        })
        .thresholds({ noMatch: 30, definiteMatch: 90 })
        .matching((match) => {
          return match.field('email').strategy('exact').weight(100)
        })

      const resolver = builder.build()
      expect(resolver).toBeInstanceOf(Resolver)
    })

    it('updates thresholds in existing matching config', () => {
      const builder = HaveWeMet.create<TestPerson>()
      builder
        .schema((schema) => {
          schema.field('email', { type: 'email' })
        })
        .matching((match) => {
          match
            .field('email')
            .weight(100)
            .thresholds({ noMatch: 20, definiteMatch: 80 })
        })
        .thresholds({ noMatch: 30, definiteMatch: 90 })

      const resolver = builder.build()
      expect(resolver).toBeInstanceOf(Resolver)
    })

    it('supports method chaining', () => {
      const builder = HaveWeMet.create<TestPerson>()
      const result = builder.thresholds({ noMatch: 25, definiteMatch: 85 })

      expect(result).toBe(builder)
    })
  })

  describe('build', () => {
    it('returns a Resolver instance with valid configuration', () => {
      const resolver = HaveWeMet.create<TestPerson>()
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
            .weight(50)
            .field('firstName')
            .strategy('jaro-winkler')
            .weight(25)
            .field('lastName')
            .strategy('jaro-winkler')
            .weight(25)
        })
        .build()

      expect(resolver).toBeInstanceOf(Resolver)
    })

    it('throws error when schema not configured', () => {
      const builder = HaveWeMet.create<TestPerson>().matching((match) => {
        match.field('email').weight(100)
      })

      expect(() => builder.build()).toThrow(
        'Schema must be configured before building'
      )
    })

    it('throws error when matching not configured', () => {
      const builder = HaveWeMet.create<TestPerson>().schema((schema) => {
        schema.field('email', { type: 'email' })
      })

      expect(() => builder.build()).toThrow(
        'Matching must be configured before building'
      )
    })

    it('creates functional resolver that can resolve records', () => {
      const resolver = HaveWeMet.create<TestPerson>()
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
            .weight(50)
            .field('firstName')
            .strategy('exact')
            .weight(25)
            .field('lastName')
            .strategy('exact')
            .weight(25)
            .thresholds({ noMatch: 20, definiteMatch: 75 })
        })
        .build()

      const input = {
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane@example.com',
      }

      const candidates = [
        {
          firstName: 'Jane',
          lastName: 'Smith',
          email: 'jane@example.com',
        },
      ]

      const results = resolver.resolve(input, candidates)

      expect(results).toHaveLength(1)
      expect(results[0].outcome).toBe('definite-match')
      expect(results[0].score.totalScore).toBe(100)
    })
  })

  describe('full fluent API', () => {
    it('supports complete configuration chain', () => {
      const resolver = HaveWeMet.create<TestPerson>()
        .schema((schema) => {
          schema
            .field('firstName', {
              type: 'name',
              component: 'first',
              required: true,
            })
            .field('lastName', {
              type: 'name',
              component: 'last',
              required: true,
            })
            .field('email', { type: 'email', required: true })
            .field('phone', { type: 'phone', required: false })
        })
        .matching((match) => {
          match
            .field('email')
            .strategy('exact')
            .weight(50)
            .caseSensitive(false)
            .field('firstName')
            .strategy('jaro-winkler')
            .weight(25)
            .field('lastName')
            .strategy('jaro-winkler')
            .weight(25)
            .thresholds({ noMatch: 20, definiteMatch: 75 })
        })
        .build()

      expect(resolver).toBeInstanceOf(Resolver)
    })

    it('supports thresholds shorthand', () => {
      const resolver = HaveWeMet.create<TestPerson>()
        .schema((schema) => {
          schema.field('email', { type: 'email' })
        })
        .matching((match) => {
          return match.field('email').strategy('exact').weight(100)
        })
        .thresholds({ noMatch: 30, definiteMatch: 90 })
        .build()

      expect(resolver).toBeInstanceOf(Resolver)
    })

    it('allows flexible ordering of configuration', () => {
      const resolver = HaveWeMet.create<TestPerson>()
        .thresholds({ noMatch: 25, definiteMatch: 85 })
        .schema((schema) => {
          schema.field('email', { type: 'email' })
        })
        .matching((match) => {
          return match.field('email').strategy('exact').weight(100)
        })
        .build()

      expect(resolver).toBeInstanceOf(Resolver)
    })
  })

  describe('real-world usage example', () => {
    it('creates a working person matching resolver', () => {
      const resolver = HaveWeMet.create<TestPerson>()
        .schema((schema) => {
          schema
            .field('firstName', {
              type: 'name',
              component: 'first',
              required: true,
            })
            .field('lastName', {
              type: 'name',
              component: 'last',
              required: true,
            })
            .field('email', {
              type: 'email',
              required: true,
            })
            .field('phone', {
              type: 'phone',
              required: false,
            })
        })
        .matching((match) => {
          match
            .field('email')
            .strategy('exact')
            .weight(50)
            .caseSensitive(false)
            .field('firstName')
            .strategy('exact')
            .weight(25)
            .field('lastName')
            .strategy('exact')
            .weight(25)
            .thresholds({ noMatch: 20, definiteMatch: 75 })
        })
        .build()

      const input = {
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane.smith@example.com',
        phone: '555-0100',
      }

      const candidates = [
        {
          firstName: 'Jane',
          lastName: 'Smith',
          email: 'jane.smith@example.com',
          phone: '555-0100',
        },
        {
          firstName: 'Jane',
          lastName: 'Doe',
          email: 'jane.doe@example.com',
        },
      ]

      const results = resolver.resolve(input, candidates)

      expect(results).toHaveLength(2)
      expect(results[0].outcome).toBe('definite-match')
      expect(results[0].score.totalScore).toBe(100)
      expect(results[1].outcome).toBe('potential-match')
      expect(results[1].score.totalScore).toBe(25)
    })
  })

  describe('adapter', () => {
    it('accepts database adapter', () => {
      const mockAdapter: DatabaseAdapter<TestPerson> = {
        findByBlockingKeys: vi.fn(),
        findByIds: vi.fn(),
        findAll: vi.fn(),
        count: vi.fn(),
        insert: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        transaction: vi.fn(),
        batchInsert: vi.fn(),
        batchUpdate: vi.fn(),
      }

      const builder = HaveWeMet.create<TestPerson>()
        .schema((schema) => {
          schema.field('email', { type: 'email' })
        })
        .matching((match) => {
          match
            .field('email')
            .strategy('exact')
            .weight(100)
            .thresholds({ noMatch: 20, definiteMatch: 45 })
        })
        .adapter(mockAdapter)

      const resolver = builder.build()

      expect(resolver).toBeInstanceOf(Resolver)
    })

    it('builds resolver with adapter configured', () => {
      const mockAdapter: DatabaseAdapter<TestPerson> = {
        findByBlockingKeys: vi.fn(),
        findByIds: vi.fn(),
        findAll: vi.fn(),
        count: vi.fn(),
        insert: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        transaction: vi.fn(),
        batchInsert: vi.fn(),
        batchUpdate: vi.fn(),
      }

      const resolver = HaveWeMet.create<TestPerson>()
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
            .weight(50)
            .field('firstName')
            .strategy('jaro-winkler')
            .weight(25)
            .field('lastName')
            .strategy('jaro-winkler')
            .weight(25)
            .thresholds({ noMatch: 20, definiteMatch: 45 })
        })
        .adapter(mockAdapter)
        .build()

      expect(resolver).toBeInstanceOf(Resolver)
    })

    it('allows chaining after adapter configuration', () => {
      const mockAdapter: DatabaseAdapter<TestPerson> = {
        findByBlockingKeys: vi.fn(),
        findByIds: vi.fn(),
        findAll: vi.fn(),
        count: vi.fn(),
        insert: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        transaction: vi.fn(),
        batchInsert: vi.fn(),
        batchUpdate: vi.fn(),
      }

      const builder = HaveWeMet.create<TestPerson>()
        .schema((schema) => {
          schema.field('email', { type: 'email' })
        })
        .adapter(mockAdapter)
        .matching((match) => {
          match
            .field('email')
            .strategy('exact')
            .weight(100)
            .thresholds({ noMatch: 20, definiteMatch: 45 })
        })

      const resolver = builder.build()

      expect(resolver).toBeInstanceOf(Resolver)
    })
  })
})
