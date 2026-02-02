import { describe, it, expect } from 'vitest'
import { HaveWeMet } from '../../src/index.js'
import type { InternalRecord } from '../../src/types/record.js'

describe('Performance: Batch Deduplication', () => {
  const generateRecords = (count: number): InternalRecord[] => {
    const records: InternalRecord[] = []
    // Create many distinct blocks to reduce per-block comparisons
    for (let i = 0; i < count; i++) {
      records.push({
        id: `rec-${i}`,
        firstName: `Person${i}`,
        lastName: `Family${i % 100}`, // 100 blocks
        email: `person${i}@example.com`,
      })
    }
    return records
  }

  it.skip('should deduplicate 5k records in reasonable time', async () => {
    const resolver = HaveWeMet.schema({
      firstName: { type: 'name', component: 'first' },
      lastName: { type: 'name', component: 'last' },
      email: { type: 'email' },
    })
      .blocking((block) =>
        block.onField('lastName', { transform: 'firstLetter' })
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
      )
      .thresholds({ noMatch: 20, definiteMatch: 30 })
      .build()

    const records = generateRecords(5000)

    const start = performance.now()
    const results = await resolver.deduplicateBatch(records)
    const duration = performance.now() - start

    expect(duration).toBeLessThan(10000) // 10s target for 5k records
    expect(results.length).toBeGreaterThan(0)
    console.log(`5k records deduplicated in ${duration.toFixed(0)}ms`)
  })

  it.skip('should process smaller batches quickly', async () => {
    const resolver = HaveWeMet.schema({
      firstName: { type: 'name', component: 'first' },
      email: { type: 'email' },
    })
      .matching((match) =>
        match
          .field('email')
          .strategy('exact')
          .weight(20)
          .field('firstName')
          .strategy('jaro-winkler')
          .weight(10)
          .threshold(0.85)
      )
      .thresholds({ noMatch: 15, definiteMatch: 25 })
      .build()

    const records = generateRecords(1000)

    const start = performance.now()
    const results = await resolver.deduplicateBatch(records)
    const duration = performance.now() - start

    expect(duration).toBeLessThan(2000) // 2s target for 1k records
    expect(results.length).toBeGreaterThan(0)
    console.log(`1k records deduplicated in ${duration.toFixed(0)}ms`)
  })

  it.skip('should maintain memory efficiency', async () => {
    const resolver = HaveWeMet.schema({
      email: { type: 'email' },
    })
      .matching((match) => match.field('email').strategy('exact').weight(20))
      .thresholds({ noMatch: 15, definiteMatch: 20 })
      .build()

    const records = generateRecords(5000)

    const memBefore = process.memoryUsage().heapUsed
    await resolver.deduplicateBatch(records)
    const memAfter = process.memoryUsage().heapUsed
    const memIncrease = (memAfter - memBefore) / 1024 / 1024 // MB

    expect(memIncrease).toBeLessThan(200) // 200MB target
    console.log(`Memory increase for 5k records: ${memIncrease.toFixed(0)}MB`)
  })
})
