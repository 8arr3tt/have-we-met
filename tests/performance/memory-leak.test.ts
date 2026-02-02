import { describe, it, expect } from 'vitest'
import { HaveWeMet } from '../../src/index.js'
import type { InternalRecord } from '../../src/types/record.js'

describe.skip('Performance: Memory Leak Detection', () => {
  const forceGC = () => {
    if (global.gc) {
      global.gc()
    }
  }

  it('should not leak memory during repeated batch operations', async () => {
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

    const generateBatch = (size: number, offset: number) => {
      return Array.from({ length: size }, (_, i) => ({
        id: `rec-${offset + i}`,
        firstName: `Person${offset + i}`,
        lastName: `Family${(offset + i) % 100}`,
        email: `person${offset + i}@example.com`,
      }))
    }

    forceGC()
    const memBaseline = process.memoryUsage().heapUsed

    for (let i = 0; i < 5; i++) {
      const batch = generateBatch(1000, i * 1000)
      await resolver.deduplicateBatch(batch)
    }

    forceGC()
    const memAfter = process.memoryUsage().heapUsed
    const memIncrease = (memAfter - memBaseline) / 1024 / 1024 // MB

    expect(memIncrease).toBeLessThan(50) // Should not grow significantly
    console.log(
      `Memory increase after 5x1k batches: ${memIncrease.toFixed(2)}MB`
    )
  })

  it('should not leak memory during repeated single matches', async () => {
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

    const existingRecords: InternalRecord[] = Array.from(
      { length: 1000 },
      (_, i) => ({
        id: `existing-${i}`,
        firstName: `Person${i}`,
        lastName: `Family${i % 100}`,
        email: `person${i}@example.com`,
      })
    )

    forceGC()
    const memBaseline = process.memoryUsage().heapUsed

    for (let i = 0; i < 1000; i++) {
      const newRecord: InternalRecord = {
        id: `new-${i}`,
        firstName: `NewPerson${i}`,
        lastName: `NewFamily${i % 100}`,
        email: `newperson${i}@example.com`,
      }
      await resolver.resolve(newRecord, existingRecords)
    }

    forceGC()
    const memAfter = process.memoryUsage().heapUsed
    const memIncrease = (memAfter - memBaseline) / 1024 / 1024 // MB

    expect(memIncrease).toBeLessThan(30) // Should not grow significantly
    console.log(
      `Memory increase after 1000 single matches: ${memIncrease.toFixed(2)}MB`
    )
  })

  it('should not leak memory with string similarity operations', async () => {
    const resolver = HaveWeMet.schema({
      firstName: { type: 'name', component: 'first' },
      lastName: { type: 'name', component: 'last' },
    })
      .matching((match) =>
        match
          .field('firstName')
          .strategy('levenshtein')
          .weight(10)
          .threshold(0.8)
          .field('lastName')
          .strategy('jaro-winkler')
          .weight(10)
          .threshold(0.8)
      )
      .thresholds({ noMatch: 10, definiteMatch: 18 })
      .build()

    const existingRecords: InternalRecord[] = Array.from(
      { length: 500 },
      (_, i) => ({
        id: `existing-${i}`,
        firstName: `PersonNameExample${i}`,
        lastName: `FamilyNameExample${i % 50}`,
      })
    )

    forceGC()
    const memBaseline = process.memoryUsage().heapUsed

    for (let i = 0; i < 500; i++) {
      const newRecord: InternalRecord = {
        id: `new-${i}`,
        firstName: `PersonNameExmple${i}`, // Typos
        lastName: `FammlyNameExmple${i % 50}`, // Typos
      }
      await resolver.resolve(newRecord, existingRecords)
    }

    forceGC()
    const memAfter = process.memoryUsage().heapUsed
    const memIncrease = (memAfter - memBaseline) / 1024 / 1024 // MB

    expect(memIncrease).toBeLessThan(25)
    console.log(
      `Memory increase after 500 fuzzy matches: ${memIncrease.toFixed(2)}MB`
    )
  })

  it('should clean up blocking structures after use', async () => {
    const resolver = HaveWeMet.schema({
      firstName: { type: 'name', component: 'first' },
      lastName: { type: 'name', component: 'last' },
    })
      .blocking((block) =>
        block
          .onField('lastName', { transform: 'soundex' })
          .onField('firstName', { transform: 'firstLetter' })
      )
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
      .build()

    forceGC()
    const memBaseline = process.memoryUsage().heapUsed

    for (let iteration = 0; iteration < 3; iteration++) {
      const batch = Array.from({ length: 5000 }, (_, i) => ({
        id: `rec-${iteration * 5000 + i}`,
        firstName: `Person${i}`,
        lastName: `Family${i % 100}`,
      }))
      await resolver.deduplicateBatch(batch)
    }

    forceGC()
    const memAfter = process.memoryUsage().heapUsed
    const memIncrease = (memAfter - memBaseline) / 1024 / 1024 // MB

    expect(memIncrease).toBeLessThan(100)
    console.log(
      `Memory increase after 3x5k batches with blocking: ${memIncrease.toFixed(2)}MB`
    )
  })
})
