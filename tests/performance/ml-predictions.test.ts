import { describe, it, expect } from 'vitest'
import { HaveWeMet } from '../../src/index.js'
import type { InternalRecord } from '../../src/types/record.js'

describe('Performance: ML Predictions', () => {
  it('should complete ML prediction in <10ms', async () => {
    const resolver = HaveWeMet.schema({
      firstName: { type: 'name', component: 'first' },
      lastName: { type: 'name', component: 'last' },
      email: { type: 'email' },
      phone: { type: 'phone' },
    })
      .matching((match) =>
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
      )
      .thresholds({ noMatch: 20, definiteMatch: 35 })
      .ml((ml) => ml.usePretrained().mode('hybrid').mlWeight(0.3))
      .build()

    const record1: InternalRecord = {
      id: 'rec1',
      firstName: 'John',
      lastName: 'Smith',
      email: 'john.smith@example.com',
      phone: '555-0100',
    }

    const record2: InternalRecord = {
      id: 'rec2',
      firstName: 'Jon',
      lastName: 'Smyth',
      email: 'j.smith@example.com',
      phone: '555-0100',
    }

    const durations: number[] = []

    for (let i = 0; i < 100; i++) {
      const start = performance.now()
      await resolver.resolve(record1, [record2])
      const duration = performance.now() - start
      durations.push(duration)
    }

    const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length
    const p95Duration = durations.sort((a, b) => a - b)[
      Math.floor(durations.length * 0.95)
    ]

    expect(avgDuration).toBeLessThan(10)
    expect(p95Duration).toBeLessThan(15)
    console.log(
      `ML prediction avg: ${avgDuration.toFixed(2)}ms, p95: ${p95Duration.toFixed(2)}ms`
    )
  })

  it.skip('should handle ML predictions at scale', async () => {
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
      .ml((ml) => ml.usePretrained().mode('hybrid').mlWeight(0.3))
      .build()

    const records = Array.from({ length: 1000 }, (_, i) => ({
      id: `rec-${i}`,
      firstName: `Person${i}`,
      lastName: `Family${i % 100}`,
      email: `person${i}@example.com`,
    }))

    const start = performance.now()
    const results = await resolver.deduplicateBatch(records)
    const duration = performance.now() - start

    expect(duration).toBeLessThan(5000) // 5s for 1k records with ML
    expect(results.length).toBeGreaterThan(0)
    console.log(`1k records with ML: ${duration.toFixed(0)}ms`)
  })

  it.skip('should maintain ML prediction consistency', async () => {
    const resolver = HaveWeMet.schema({
      firstName: { type: 'name', component: 'first' },
      lastName: { type: 'name', component: 'last' },
    })
      .matching((match) =>
        match
          .field('firstName')
          .strategy('jaro-winkler')
          .weight(10)
          .threshold(0.85)
          .field('lastName')
          .strategy('jaro-winkler')
          .weight(10)
          .threshold(0.85)
      )
      .thresholds({ noMatch: 10, definiteMatch: 18 })
      .ml((ml) => ml.usePretrained().mode('mlOnly'))
      .build()

    const record1: InternalRecord = {
      id: 'rec1',
      firstName: 'Alice',
      lastName: 'Johnson',
    }

    const record2: InternalRecord = {
      id: 'rec2',
      firstName: 'Alice',
      lastName: 'Johnson',
    }

    const results: number[] = []

    for (let i = 0; i < 50; i++) {
      const result = await resolver.resolve(record1, [record2])
      if (
        result.outcome === 'match' &&
        result.matches[0]?.mlScore !== undefined
      ) {
        results.push(result.matches[0].mlScore)
      }
    }

    const variance =
      results.reduce((acc, val) => {
        const mean = results.reduce((a, b) => a + b, 0) / results.length
        return acc + Math.pow(val - mean, 2)
      }, 0) / results.length

    expect(variance).toBeLessThan(0.001) // Very low variance
    console.log(`ML prediction variance: ${variance.toFixed(6)}`)
  })

  it.skip('should not degrade with repeated ML predictions', async () => {
    const resolver = HaveWeMet.schema({
      firstName: { type: 'name', component: 'first' },
      lastName: { type: 'name', component: 'last' },
    })
      .matching((match) =>
        match
          .field('firstName')
          .strategy('jaro-winkler')
          .weight(10)
          .threshold(0.85)
          .field('lastName')
          .strategy('jaro-winkler')
          .weight(10)
          .threshold(0.85)
      )
      .thresholds({ noMatch: 10, definiteMatch: 18 })
      .ml((ml) => ml.usePretrained().mode('hybrid').mlWeight(0.5))
      .build()

    const existingRecords: InternalRecord[] = Array.from(
      { length: 500 },
      (_, i) => ({
        id: `existing-${i}`,
        firstName: `Person${i}`,
        lastName: `Family${i % 50}`,
      })
    )

    const firstBatchDurations: number[] = []
    for (let i = 0; i < 50; i++) {
      const start = performance.now()
      await resolver.resolve(
        {
          id: `new-${i}`,
          firstName: `NewPerson${i}`,
          lastName: `NewFamily${i % 50}`,
        },
        existingRecords
      )
      firstBatchDurations.push(performance.now() - start)
    }

    const lastBatchDurations: number[] = []
    for (let i = 950; i < 1000; i++) {
      const start = performance.now()
      await resolver.resolve(
        {
          id: `new-${i}`,
          firstName: `NewPerson${i}`,
          lastName: `NewFamily${i % 50}`,
        },
        existingRecords
      )
      lastBatchDurations.push(performance.now() - start)
    }

    const firstAvg =
      firstBatchDurations.reduce((a, b) => a + b, 0) /
      firstBatchDurations.length
    const lastAvg =
      lastBatchDurations.reduce((a, b) => a + b, 0) / lastBatchDurations.length
    const degradation = ((lastAvg - firstAvg) / firstAvg) * 100

    expect(Math.abs(degradation)).toBeLessThan(20) // Less than 20% change
    console.log(
      `Performance change: ${degradation.toFixed(2)}% (first: ${firstAvg.toFixed(2)}ms, last: ${lastAvg.toFixed(2)}ms)`
    )
  })
})
