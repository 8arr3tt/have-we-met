import { describe, it, expect, beforeEach } from 'vitest'
import { HaveWeMet } from '../../src/index.js'
import type { InternalRecord } from '../../src/types/record.js'

describe('Performance: Real-time Matching', () => {
  let existingRecords: InternalRecord[]

  beforeEach(() => {
    existingRecords = []
    for (let i = 0; i < 1000; i++) {
      existingRecords.push({
        id: `existing-${i}`,
        firstName: `Person${i}`,
        lastName: `Family${i % 100}`,
        email: `person${i}@example.com`,
        phone: `555-010${String(i).padStart(4, '0')}`
      })
    }
  })

  it('should match single record against 1k records in <100ms', async () => {
    const resolver = HaveWeMet.schema({
      firstName: { type: 'name', component: 'first' },
      lastName: { type: 'name', component: 'last' },
      email: { type: 'email' },
      phone: { type: 'phone' }
    })
      .blocking((block) =>
        block.onField('lastName', { transform: 'firstLetter' })
      )
      .matching((match) =>
        match
          .field('email').strategy('exact').weight(20)
          .field('phone').strategy('exact').weight(15)
          .field('firstName').strategy('jaro-winkler').weight(10).threshold(0.85)
      )
      .thresholds({ noMatch: 20, definiteMatch: 35 })
      .build()

    const newRecord: InternalRecord = {
      id: 'new-1',
      firstName: 'Person500',
      lastName: 'Family50',
      email: 'person500@example.com',
      phone: '555-0100500'
    }

    const start = performance.now()
    const result = await resolver.resolve(newRecord, existingRecords)
    const duration = performance.now() - start

    expect(duration).toBeLessThan(100) // 100ms target
    expect(result).toBeDefined()
    console.log(`Single match against 1k records: ${duration.toFixed(2)}ms`)
  })

  it('should maintain <100ms for 10 sequential matches', async () => {
    const resolver = HaveWeMet.schema({
      firstName: { type: 'name', component: 'first' },
      lastName: { type: 'name', component: 'last' },
      email: { type: 'email' }
    })
      .blocking((block) =>
        block.onField('lastName', { transform: 'firstLetter' })
      )
      .matching((match) =>
        match
          .field('email').strategy('exact').weight(20)
          .field('firstName').strategy('jaro-winkler').weight(10).threshold(0.85)
      )
      .thresholds({ noMatch: 20, definiteMatch: 30 })
      .build()

    const durations: number[] = []

    for (let i = 0; i < 10; i++) {
      const newRecord: InternalRecord = {
        id: `new-${i}`,
        firstName: `NewPerson${i}`,
        lastName: `NewFamily${i}`,
        email: `newperson${i}@example.com`
      }

      const start = performance.now()
      await resolver.resolve(newRecord, existingRecords)
      const duration = performance.now() - start
      durations.push(duration)
    }

    const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length
    const maxDuration = Math.max(...durations)

    expect(avgDuration).toBeLessThan(100)
    expect(maxDuration).toBeLessThan(150) // Allow some variance
    console.log(`Average: ${avgDuration.toFixed(2)}ms, Max: ${maxDuration.toFixed(2)}ms`)
  })

  it('should match quickly without blocking strategy', async () => {
    const resolver = HaveWeMet.schema({
      email: { type: 'email' }
    })
      .matching((match) =>
        match.field('email').strategy('exact').weight(20)
      )
      .thresholds({ noMatch: 15, definiteMatch: 20 })
      .build()

    const newRecord: InternalRecord = {
      id: 'new-1',
      email: 'person500@example.com'
    }

    const start = performance.now()
    const result = await resolver.resolve(newRecord, existingRecords)
    const duration = performance.now() - start

    expect(duration).toBeLessThan(200) // More lenient without blocking
    expect(result).toBeDefined()
    console.log(`Single exact match without blocking: ${duration.toFixed(2)}ms`)
  })

  it('should handle concurrent matches efficiently', async () => {
    const resolver = HaveWeMet.schema({
      firstName: { type: 'name', component: 'first' },
      lastName: { type: 'name', component: 'last' },
      email: { type: 'email' }
    })
      .blocking((block) =>
        block.onField('lastName', { transform: 'firstLetter' })
      )
      .matching((match) =>
        match
          .field('email').strategy('exact').weight(20)
          .field('firstName').strategy('jaro-winkler').weight(10).threshold(0.85)
      )
      .thresholds({ noMatch: 20, definiteMatch: 30 })
      .build()

    const newRecords = Array.from({ length: 10 }, (_, i) => ({
      id: `new-${i}`,
      firstName: `NewPerson${i}`,
      lastName: `NewFamily${i}`,
      email: `newperson${i}@example.com`
    }))

    const start = performance.now()
    await Promise.all(
      newRecords.map(record => resolver.resolve(record, existingRecords))
    )
    const duration = performance.now() - start

    expect(duration).toBeLessThan(1000) // 10 concurrent matches in 1s
    console.log(`10 concurrent matches: ${duration.toFixed(0)}ms`)
  })

  it('should perform fuzzy matching within latency budget', async () => {
    const resolver = HaveWeMet.schema({
      firstName: { type: 'name', component: 'first' },
      lastName: { type: 'name', component: 'last' },
      email: { type: 'email' }
    })
      .blocking((block) =>
        block.onField('lastName', { transform: 'soundex' })
      )
      .matching((match) =>
        match
          .field('firstName').strategy('jaro-winkler').weight(15).threshold(0.85)
          .field('lastName').strategy('levenshtein').weight(15).threshold(0.85)
          .field('email').strategy('exact').weight(10)
      )
      .thresholds({ noMatch: 20, definiteMatch: 35 })
      .build()

    const newRecord: InternalRecord = {
      id: 'new-1',
      firstName: 'Persen500', // Typo
      lastName: 'Fammily50', // Typo
      email: 'person500@example.com'
    }

    const start = performance.now()
    const result = await resolver.resolve(newRecord, existingRecords)
    const duration = performance.now() - start

    expect(duration).toBeLessThan(150) // Fuzzy matching slightly slower
    expect(result).toBeDefined()
    console.log(`Fuzzy matching: ${duration.toFixed(2)}ms`)
  })
})
