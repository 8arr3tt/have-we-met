import { describe, it, expect } from 'vitest'
import { HaveWeMet } from './resolver-builder.js'

interface TestPerson extends Record<string, unknown> {
  firstName: string
  lastName: string
  email: string
  phone: string
  age: number
  updatedAt: Date
}

describe('ResolverBuilder merge integration', () => {
  describe('.merge() method', () => {
    it('accepts merge configuration callback', () => {
      const builder = HaveWeMet.create<TestPerson>()
        .schema((schema) =>
          schema
            .field('firstName', { type: 'name', component: 'first' })
            .field('lastName', { type: 'name', component: 'last' })
            .field('email', { type: 'email' })
            .field('phone', { type: 'phone' })
            .field('age', { type: 'number' })
            .field('updatedAt', { type: 'date' })
        )
        .matching((match) =>
          match
            .field('email')
            .strategy('exact')
            .weight(20)
            .thresholds({ noMatch: 20, definiteMatch: 45 })
        )
        .merge((merge) =>
          merge
            .timestampField('updatedAt')
            .defaultStrategy('preferNonNull')
            .onConflict('useDefault')
            .field('firstName')
            .strategy('preferLonger')
            .field('lastName')
            .strategy('preferLonger')
            .field('email')
            .strategy('preferNewer')
        )

      const mergeConfig = builder.getMergeConfig()

      expect(mergeConfig).toBeDefined()
      expect(mergeConfig?.defaultStrategy).toBe('preferNonNull')
      expect(mergeConfig?.timestampField).toBe('updatedAt')
      expect(mergeConfig?.fieldStrategies).toHaveLength(3)
    })

    it('returns builder for chaining', () => {
      const builder = HaveWeMet.create<TestPerson>()
        .schema((schema) =>
          schema
            .field('firstName', { type: 'name', component: 'first' })
            .field('lastName', { type: 'name', component: 'last' })
            .field('email', { type: 'email' })
        )

      const result = builder.merge((merge) =>
        merge.field('firstName').strategy('preferLonger')
      )

      expect(result).toBe(builder)
    })

    it('can be called before or after other builder methods', () => {
      const builder1 = HaveWeMet.create<TestPerson>()
        .merge((merge) => merge.field('firstName').strategy('preferLonger'))
        .schema((schema) =>
          schema
            .field('firstName', { type: 'name', component: 'first' })
            .field('email', { type: 'email' })
        )
        .matching((match) =>
          match
            .field('email')
            .strategy('exact')
            .weight(20)
            .thresholds({ noMatch: 20, definiteMatch: 45 })
        )

      const builder2 = HaveWeMet.create<TestPerson>()
        .schema((schema) =>
          schema
            .field('firstName', { type: 'name', component: 'first' })
            .field('email', { type: 'email' })
        )
        .matching((match) =>
          match
            .field('email')
            .strategy('exact')
            .weight(20)
            .thresholds({ noMatch: 20, definiteMatch: 45 })
        )
        .merge((merge) => merge.field('firstName').strategy('preferLonger'))

      expect(builder1.getMergeConfig()).toBeDefined()
      expect(builder2.getMergeConfig()).toBeDefined()
    })

    it('validates field paths against schema when schema is available', () => {
      const builder = HaveWeMet.create<TestPerson>()
        .schema((schema) =>
          schema.field('firstName', { type: 'name', component: 'first' })
        )

      // This should not throw because schema validates at build time
      // within the merge builder
      expect(() => {
        builder.merge((merge) => merge.field('firstName').strategy('preferLonger'))
      }).not.toThrow()
    })

    it('handles FieldMergeBuilder return value', () => {
      const builder = HaveWeMet.create<TestPerson>()
        .schema((schema) =>
          schema
            .field('firstName', { type: 'name', component: 'first' })
            .field('lastName', { type: 'name', component: 'last' })
        )
        .matching((match) =>
          match
            .field('firstName')
            .strategy('exact')
            .weight(20)
            .thresholds({ noMatch: 20, definiteMatch: 45 })
        )
        // Return FieldMergeBuilder (without calling .done())
        .merge((merge) =>
          merge
            .field('firstName')
            .strategy('preferLonger')
            .field('lastName')
            .strategy('preferLonger')
        )

      const mergeConfig = builder.getMergeConfig()

      expect(mergeConfig).toBeDefined()
      expect(mergeConfig?.fieldStrategies).toHaveLength(2)
    })

    it('handles MergeBuilder return value', () => {
      const builder = HaveWeMet.create<TestPerson>()
        .schema((schema) =>
          schema.field('firstName', { type: 'name', component: 'first' })
        )
        .matching((match) =>
          match
            .field('firstName')
            .strategy('exact')
            .weight(20)
            .thresholds({ noMatch: 20, definiteMatch: 45 })
        )
        // Return MergeBuilder (calling .done())
        .merge((merge) =>
          merge.field('firstName').strategy('preferLonger').done()
        )

      const mergeConfig = builder.getMergeConfig()

      expect(mergeConfig).toBeDefined()
      expect(mergeConfig?.fieldStrategies).toHaveLength(1)
    })

    it('handles void return (no explicit return)', () => {
      const builder = HaveWeMet.create<TestPerson>()
        .schema((schema) =>
          schema.field('firstName', { type: 'name', component: 'first' })
        )
        .matching((match) =>
          match
            .field('firstName')
            .strategy('exact')
            .weight(20)
            .thresholds({ noMatch: 20, definiteMatch: 45 })
        )
        // No return statement
        .merge((merge) => {
          merge.field('firstName').strategy('preferLonger')
        })

      const mergeConfig = builder.getMergeConfig()

      expect(mergeConfig).toBeDefined()
      expect(mergeConfig?.fieldStrategies).toHaveLength(1)
    })
  })

  describe('getMergeConfig', () => {
    it('returns undefined if merge not configured', () => {
      const builder = HaveWeMet.create<TestPerson>()
        .schema((schema) =>
          schema.field('firstName', { type: 'name', component: 'first' })
        )
        .matching((match) =>
          match
            .field('firstName')
            .strategy('exact')
            .weight(20)
            .thresholds({ noMatch: 20, definiteMatch: 45 })
        )

      expect(builder.getMergeConfig()).toBeUndefined()
    })

    it('returns merge config after configuration', () => {
      const builder = HaveWeMet.create<TestPerson>()
        .schema((schema) =>
          schema.field('firstName', { type: 'name', component: 'first' })
        )
        .merge((merge) => merge.defaultStrategy('preferFirst'))

      const mergeConfig = builder.getMergeConfig()

      expect(mergeConfig).toBeDefined()
      expect(mergeConfig?.defaultStrategy).toBe('preferFirst')
    })
  })

  describe('complete workflow', () => {
    it('builds resolver with merge configuration', () => {
      const resolver = HaveWeMet.create<TestPerson>()
        .schema((schema) =>
          schema
            .field('firstName', { type: 'name', component: 'first' })
            .field('lastName', { type: 'name', component: 'last' })
            .field('email', { type: 'email' })
            .field('phone', { type: 'phone' })
            .field('age', { type: 'number' })
            .field('updatedAt', { type: 'date' })
        )
        .matching((match) =>
          match
            .field('email')
            .strategy('exact')
            .weight(20)
            .field('firstName')
            .strategy('jaro-winkler')
            .weight(10)
            .threshold(0.85)
            .thresholds({ noMatch: 20, definiteMatch: 45 })
        )
        .merge((merge) =>
          merge
            .timestampField('updatedAt')
            .defaultStrategy('preferNonNull')
            .onConflict('useDefault')
            .trackProvenance(true)
            .field('firstName')
            .strategy('preferLonger')
            .field('lastName')
            .strategy('preferLonger')
            .field('email')
            .strategy('preferNewer')
            .field('phone')
            .strategy('preferNonNull')
            .field('age')
            .strategy('max')
        )
        .build()

      expect(resolver).toBeDefined()
    })

    it('supports custom merge functions in workflow', () => {
      const builder = HaveWeMet.create<TestPerson>()
        .schema((schema) =>
          schema
            .field('firstName', { type: 'name', component: 'first' })
            .field('lastName', { type: 'name', component: 'last' })
            .field('email', { type: 'email' })
        )
        .matching((match) =>
          match
            .field('email')
            .strategy('exact')
            .weight(20)
            .thresholds({ noMatch: 20, definiteMatch: 45 })
        )
        .merge((merge) =>
          merge
            .field('firstName')
            .custom<string>((values) => {
              // Pick the value with the most capital letters (assumed to be properly formatted)
              return (
                values.reduce((best, current) => {
                  const countCaps = (s: string) =>
                    (s.match(/[A-Z]/g) || []).length
                  return countCaps(current) > countCaps(best) ? current : best
                }, values[0]) || ''
              )
            })
            .field('lastName')
            .strategy('preferLonger')
        )

      const mergeConfig = builder.getMergeConfig()

      expect(mergeConfig?.fieldStrategies.find((fs) => fs.field === 'firstName')?.strategy).toBe('custom')
      expect(typeof mergeConfig?.fieldStrategies.find((fs) => fs.field === 'firstName')?.customMerge).toBe('function')
    })
  })
})
