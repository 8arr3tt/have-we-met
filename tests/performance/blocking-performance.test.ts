import { describe, it, expect } from 'vitest'
import { BlockGenerator } from '../../src/core/blocking/block-generator.js'
import { StandardBlockingStrategy } from '../../src/core/blocking/strategies/standard-blocking.js'
import { SortedNeighbourhoodStrategy } from '../../src/core/blocking/strategies/sorted-neighbourhood.js'
import type { InternalRecord } from '../../src/types/record.js'

describe('Performance: Blocking Strategies', () => {
  const generateRecords = (count: number): InternalRecord[] => {
    return Array.from({ length: count }, (_, i) => ({
      id: `rec-${i}`,
      firstName: `Person${i}`,
      lastName: `Family${i % 1000}`,
      email: `person${i}@example.com`,
      dateOfBirth: `${1950 + (i % 70)}-01-01`,
    }))
  }

  it('should generate standard blocks for 10k records in <50ms', () => {
    const records = generateRecords(10000)
    const strategy = new StandardBlockingStrategy({
      field: 'lastName',
      transform: 'firstLetter',
    })
    const blockGen = new BlockGenerator()

    const start = performance.now()
    const blocks = blockGen.generateBlocks(records, strategy)
    const duration = performance.now() - start

    expect(duration).toBeLessThan(50)
    expect(blocks.size).toBeGreaterThan(0)
    console.log(`Standard blocking 10k records: ${duration.toFixed(2)}ms`)
  })

  it('should generate standard blocks for 100k records in <100ms', () => {
    const records = generateRecords(100000)
    const strategy = new StandardBlockingStrategy({
      field: 'lastName',
      transform: 'firstLetter',
    })
    const blockGen = new BlockGenerator()

    const start = performance.now()
    const blocks = blockGen.generateBlocks(records, strategy)
    const duration = performance.now() - start

    expect(duration).toBeLessThan(100)
    expect(blocks.size).toBeGreaterThan(0)
    console.log(`Standard blocking 100k records: ${duration.toFixed(0)}ms`)
  })

  it('should generate sorted neighbourhood blocks for 10k records efficiently', () => {
    const records = generateRecords(10000)
    const strategy = new SortedNeighbourhoodStrategy({
      sortBy: 'lastName',
      windowSize: 10,
    })
    const blockGen = new BlockGenerator()

    const start = performance.now()
    const blocks = blockGen.generateBlocks(records, strategy)
    const duration = performance.now() - start

    expect(duration).toBeLessThan(50)
    expect(blocks.size).toBeGreaterThan(0)
    console.log(`Sorted neighbourhood 10k records: ${duration.toFixed(2)}ms`)
  })

  it('should generate sorted neighbourhood blocks for 100k records in <500ms', () => {
    const records = generateRecords(100000)
    const strategy = new SortedNeighbourhoodStrategy({
      sortBy: 'lastName',
      windowSize: 10,
    })
    const blockGen = new BlockGenerator()

    const start = performance.now()
    const blocks = blockGen.generateBlocks(records, strategy)
    const duration = performance.now() - start

    expect(duration).toBeLessThan(500)
    expect(blocks.size).toBeGreaterThan(0)
    console.log(`Sorted neighbourhood 100k records: ${duration.toFixed(0)}ms`)
  })

  it('should generate composite blocks efficiently', () => {
    const records = generateRecords(10000)
    const strategy1 = new StandardBlockingStrategy({
      field: 'lastName',
      transform: 'firstLetter',
    })
    const strategy2 = new StandardBlockingStrategy({
      field: 'dateOfBirth',
      transform: 'year',
    })
    const blockGen = new BlockGenerator()

    const start = performance.now()
    const compositeBlocks = blockGen.generateBlocksComposite(records, [
      strategy1,
      strategy2,
    ])
    const duration = performance.now() - start

    expect(duration).toBeLessThan(100)
    expect(compositeBlocks.size).toBeGreaterThan(0)
    console.log(`Composite blocking 10k records: ${duration.toFixed(2)}ms`)
  })

  it('should efficiently calculate blocking statistics', () => {
    const records = generateRecords(10000)
    const strategy = new StandardBlockingStrategy({
      field: 'lastName',
      transform: 'soundex',
    })
    const blockGen = new BlockGenerator()

    const blocks = blockGen.generateBlocks(records, strategy)

    const start = performance.now()
    const stats = blockGen.calculateStats(blocks, records.length)
    const duration = performance.now() - start

    expect(duration).toBeLessThan(10)
    expect(stats.totalBlocks).toBeGreaterThan(0)
    expect(stats.reductionPercentage).toBeGreaterThanOrEqual(0)
    console.log(
      `Blocking stats calculation: ${duration.toFixed(2)}ms, reduction: ${stats.reductionPercentage.toFixed(2)}%`
    )
  })

  it('should maintain performance with phonetic transforms', () => {
    const records = generateRecords(50000)
    const strategy = new StandardBlockingStrategy({
      field: 'lastName',
      transform: 'metaphone',
    })
    const blockGen = new BlockGenerator()

    const start = performance.now()
    const blocks = blockGen.generateBlocks(records, strategy)
    const duration = performance.now() - start

    expect(duration).toBeLessThan(200)
    expect(blocks.size).toBeGreaterThan(0)
    console.log(`Metaphone blocking 50k records: ${duration.toFixed(0)}ms`)
  })

  it.skip('should generate pairs efficiently', () => {
    const records = generateRecords(1000)
    const strategy = new StandardBlockingStrategy({
      field: 'lastName',
      transform: 'firstLetter',
    })
    const blockGen = new BlockGenerator()

    const blocks = blockGen.generateBlocks(records, strategy)

    const start = performance.now()
    const pairs = blockGen.generatePairs(blocks)
    const duration = performance.now() - start

    expect(duration).toBeLessThan(100)
    expect(pairs.length).toBeGreaterThan(0)
    console.log(
      `Pair generation from 1k records: ${duration.toFixed(2)}ms, ${pairs.length} pairs`
    )
  })

  it.skip('should not degrade with repeated blocking operations', () => {
    const durations: number[] = []

    for (let i = 0; i < 10; i++) {
      const records = generateRecords(10000)
      const strategy = new StandardBlockingStrategy({
        field: 'lastName',
        transform: 'firstLetter',
      })
      const blockGen = new BlockGenerator()

      const start = performance.now()
      blockGen.generateBlocks(records, strategy)
      const duration = performance.now() - start
      durations.push(duration)
    }

    const firstAvg = durations.slice(0, 3).reduce((a, b) => a + b, 0) / 3
    const lastAvg = durations.slice(-3).reduce((a, b) => a + b, 0) / 3
    const degradation = ((lastAvg - firstAvg) / firstAvg) * 100

    expect(Math.abs(degradation)).toBeLessThan(30)
    console.log(
      `Blocking degradation: ${degradation.toFixed(2)}% (first: ${firstAvg.toFixed(2)}ms, last: ${lastAvg.toFixed(2)}ms)`
    )
  })
})
