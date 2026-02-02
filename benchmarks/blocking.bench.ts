import { bench, describe } from 'vitest'
import { StandardBlockingStrategy } from '../src/core/blocking/strategies/standard-blocking'
import { SortedNeighbourhoodStrategy } from '../src/core/blocking/strategies/sorted-neighbourhood'
import { CompositeBlockingStrategy } from '../src/core/blocking/strategies/composite-blocking'
import { BlockGenerator } from '../src/core/blocking/block-generator'
import {
  generatePersonDataset,
  comparisonsWithoutBlocking,
  type PersonRecord,
} from './blocking-helpers'

/**
 * Performance Benchmarks for Blocking Strategies
 *
 * Target Performance (from Phase 4 plan):
 * - Standard blocking (firstLetter): <50ms for 100k records, 95%+ reduction
 * - Standard blocking (soundex): <100ms for 100k records, 98%+ reduction
 * - Sorted neighbourhood (w=10): <500ms for 100k records, 99%+ reduction
 * - Composite blocking: <200ms for 100k records
 *
 * Results will be documented in inline comments after running benchmarks.
 */

// Generate test datasets of various sizes
const datasets = {
  small: generatePersonDataset({ size: 1000, duplicateRate: 0.1 }),
  medium: generatePersonDataset({ size: 10000, duplicateRate: 0.1 }),
  large: generatePersonDataset({ size: 50000, duplicateRate: 0.1 }),
  xlarge: generatePersonDataset({ size: 100000, duplicateRate: 0.1 }),
}

const blockGenerator = new BlockGenerator()

// ============================================================================
// Comparison Reduction Benchmarks
// ============================================================================

describe('Comparison Reduction', () => {
  describe('1k records', () => {
    const records = datasets.small
    const withoutBlocking = comparisonsWithoutBlocking(records.length)

    bench('baseline: no blocking', () => {
      // Simulate no blocking - would compare all pairs
      const pairs = withoutBlocking
      return pairs
    })

    bench('standard blocking: firstLetter(lastName)', () => {
      const strategy = new StandardBlockingStrategy<PersonRecord>({
        field: 'lastName',
        transform: 'firstLetter',
      })
      const blocks = strategy.generateBlocks(records)
      const stats = blockGenerator.calculateStats(blocks, records.length)
      return stats.comparisonsWithBlocking
    })

    bench('standard blocking: soundex(lastName)', () => {
      const strategy = new StandardBlockingStrategy<PersonRecord>({
        field: 'lastName',
        transform: 'soundex',
      })
      const blocks = strategy.generateBlocks(records)
      const stats = blockGenerator.calculateStats(blocks, records.length)
      return stats.comparisonsWithBlocking
    })

    bench('sorted neighbourhood: w=10', () => {
      const strategy = new SortedNeighbourhoodStrategy<PersonRecord>({
        sortBy: 'lastName',
        windowSize: 10,
      })
      const blocks = strategy.generateBlocks(records)
      const stats = blockGenerator.calculateStats(blocks, records.length)
      return stats.comparisonsWithBlocking
    })
  })

  describe('10k records', () => {
    const records = datasets.medium
    const withoutBlocking = comparisonsWithoutBlocking(records.length)

    bench('baseline: no blocking', () => {
      const pairs = withoutBlocking
      return pairs
    })

    bench('standard blocking: firstLetter(lastName)', () => {
      const strategy = new StandardBlockingStrategy<PersonRecord>({
        field: 'lastName',
        transform: 'firstLetter',
      })
      const blocks = strategy.generateBlocks(records)
      const stats = blockGenerator.calculateStats(blocks, records.length)
      return stats.comparisonsWithBlocking
    })

    bench('standard blocking: soundex(lastName)', () => {
      const strategy = new StandardBlockingStrategy<PersonRecord>({
        field: 'lastName',
        transform: 'soundex',
      })
      const blocks = strategy.generateBlocks(records)
      const stats = blockGenerator.calculateStats(blocks, records.length)
      return stats.comparisonsWithBlocking
    })

    bench('sorted neighbourhood: w=10', () => {
      const strategy = new SortedNeighbourhoodStrategy<PersonRecord>({
        sortBy: 'lastName',
        windowSize: 10,
      })
      const blocks = strategy.generateBlocks(records)
      const stats = blockGenerator.calculateStats(blocks, records.length)
      return stats.comparisonsWithBlocking
    })
  })

  describe('50k records', () => {
    const records = datasets.large

    bench('standard blocking: firstLetter(lastName)', () => {
      const strategy = new StandardBlockingStrategy<PersonRecord>({
        field: 'lastName',
        transform: 'firstLetter',
      })
      const blocks = strategy.generateBlocks(records)
      const stats = blockGenerator.calculateStats(blocks, records.length)
      return stats.comparisonsWithBlocking
    })

    bench('standard blocking: soundex(lastName)', () => {
      const strategy = new StandardBlockingStrategy<PersonRecord>({
        field: 'lastName',
        transform: 'soundex',
      })
      const blocks = strategy.generateBlocks(records)
      const stats = blockGenerator.calculateStats(blocks, records.length)
      return stats.comparisonsWithBlocking
    })

    bench('sorted neighbourhood: w=10', () => {
      const strategy = new SortedNeighbourhoodStrategy<PersonRecord>({
        sortBy: 'lastName',
        windowSize: 10,
      })
      const blocks = strategy.generateBlocks(records)
      const stats = blockGenerator.calculateStats(blocks, records.length)
      return stats.comparisonsWithBlocking
    })
  })

  describe('100k records', () => {
    const records = datasets.xlarge

    bench('standard blocking: firstLetter(lastName)', () => {
      const strategy = new StandardBlockingStrategy<PersonRecord>({
        field: 'lastName',
        transform: 'firstLetter',
      })
      const blocks = strategy.generateBlocks(records)
      const stats = blockGenerator.calculateStats(blocks, records.length)
      return stats.comparisonsWithBlocking
    })

    bench('standard blocking: soundex(lastName)', () => {
      const strategy = new StandardBlockingStrategy<PersonRecord>({
        field: 'lastName',
        transform: 'soundex',
      })
      const blocks = strategy.generateBlocks(records)
      const stats = blockGenerator.calculateStats(blocks, records.length)
      return stats.comparisonsWithBlocking
    })

    bench('sorted neighbourhood: w=10', () => {
      const strategy = new SortedNeighbourhoodStrategy<PersonRecord>({
        sortBy: 'lastName',
        windowSize: 10,
      })
      const blocks = strategy.generateBlocks(records)
      const stats = blockGenerator.calculateStats(blocks, records.length)
      return stats.comparisonsWithBlocking
    })

    bench('composite: union of 2 standard strategies', () => {
      const strategy = new CompositeBlockingStrategy<PersonRecord>({
        strategies: [
          new StandardBlockingStrategy({
            field: 'lastName',
            transform: 'soundex',
          }),
          new StandardBlockingStrategy({
            field: 'birthYear',
            transform: 'identity',
          }),
        ],
        mode: 'union',
      })
      const blocks = strategy.generateBlocks(records)
      const stats = blockGenerator.calculateStats(blocks, records.length)
      return stats.comparisonsWithBlocking
    })
  })
})

// ============================================================================
// Block Generation Time Benchmarks
// ============================================================================

describe('Block Generation Time', () => {
  describe('Standard Blocking', () => {
    bench('1k records: firstLetter(lastName)', () => {
      const strategy = new StandardBlockingStrategy<PersonRecord>({
        field: 'lastName',
        transform: 'firstLetter',
      })
      strategy.generateBlocks(datasets.small)
    })

    bench('10k records: firstLetter(lastName)', () => {
      const strategy = new StandardBlockingStrategy<PersonRecord>({
        field: 'lastName',
        transform: 'firstLetter',
      })
      strategy.generateBlocks(datasets.medium)
    })

    bench('100k records: firstLetter(lastName)', () => {
      const strategy = new StandardBlockingStrategy<PersonRecord>({
        field: 'lastName',
        transform: 'firstLetter',
      })
      strategy.generateBlocks(datasets.xlarge)
    })

    bench('1k records: soundex(lastName)', () => {
      const strategy = new StandardBlockingStrategy<PersonRecord>({
        field: 'lastName',
        transform: 'soundex',
      })
      strategy.generateBlocks(datasets.small)
    })

    bench('10k records: soundex(lastName)', () => {
      const strategy = new StandardBlockingStrategy<PersonRecord>({
        field: 'lastName',
        transform: 'soundex',
      })
      strategy.generateBlocks(datasets.medium)
    })

    bench('100k records: soundex(lastName)', () => {
      const strategy = new StandardBlockingStrategy<PersonRecord>({
        field: 'lastName',
        transform: 'soundex',
      })
      strategy.generateBlocks(datasets.xlarge)
    })

    bench('100k records: multi-field (lastName + birthYear)', () => {
      const strategy = new StandardBlockingStrategy<PersonRecord>({
        fields: ['lastName', 'birthYear'],
        transforms: ['firstLetter', 'identity'],
      })
      strategy.generateBlocks(datasets.xlarge)
    })
  })

  describe('Sorted Neighbourhood', () => {
    bench('1k records: w=10', () => {
      const strategy = new SortedNeighbourhoodStrategy<PersonRecord>({
        sortBy: 'lastName',
        windowSize: 10,
      })
      strategy.generateBlocks(datasets.small)
    })

    bench('10k records: w=10', () => {
      const strategy = new SortedNeighbourhoodStrategy<PersonRecord>({
        sortBy: 'lastName',
        windowSize: 10,
      })
      strategy.generateBlocks(datasets.medium)
    })

    bench('100k records: w=10', () => {
      const strategy = new SortedNeighbourhoodStrategy<PersonRecord>({
        sortBy: 'lastName',
        windowSize: 10,
      })
      strategy.generateBlocks(datasets.xlarge)
    })

    bench('100k records: w=20', () => {
      const strategy = new SortedNeighbourhoodStrategy<PersonRecord>({
        sortBy: 'lastName',
        windowSize: 20,
      })
      strategy.generateBlocks(datasets.xlarge)
    })

    bench(
      '100k records: multi-field sort (soundex lastName + birthYear)',
      () => {
        const strategy = new SortedNeighbourhoodStrategy<PersonRecord>({
          sortBy: [
            { field: 'lastName', transform: 'soundex' },
            { field: 'birthYear' },
          ],
          windowSize: 10,
        })
        strategy.generateBlocks(datasets.xlarge)
      }
    )
  })

  describe('Composite Blocking', () => {
    bench('1k records: union of 2 strategies', () => {
      const strategy = new CompositeBlockingStrategy<PersonRecord>({
        strategies: [
          new StandardBlockingStrategy({
            field: 'lastName',
            transform: 'soundex',
          }),
          new StandardBlockingStrategy({
            field: 'birthYear',
            transform: 'identity',
          }),
        ],
        mode: 'union',
      })
      strategy.generateBlocks(datasets.small)
    })

    bench('10k records: union of 2 strategies', () => {
      const strategy = new CompositeBlockingStrategy<PersonRecord>({
        strategies: [
          new StandardBlockingStrategy({
            field: 'lastName',
            transform: 'soundex',
          }),
          new StandardBlockingStrategy({
            field: 'birthYear',
            transform: 'identity',
          }),
        ],
        mode: 'union',
      })
      strategy.generateBlocks(datasets.medium)
    })

    bench('100k records: union of 2 strategies', () => {
      const strategy = new CompositeBlockingStrategy<PersonRecord>({
        strategies: [
          new StandardBlockingStrategy({
            field: 'lastName',
            transform: 'soundex',
          }),
          new StandardBlockingStrategy({
            field: 'birthYear',
            transform: 'identity',
          }),
        ],
        mode: 'union',
      })
      strategy.generateBlocks(datasets.xlarge)
    })

    bench('100k records: intersection of 2 strategies', () => {
      const strategy = new CompositeBlockingStrategy<PersonRecord>({
        strategies: [
          new StandardBlockingStrategy({
            field: 'lastName',
            transform: 'firstLetter',
          }),
          new StandardBlockingStrategy({
            field: 'birthYear',
            transform: 'identity',
          }),
        ],
        mode: 'intersection',
      })
      strategy.generateBlocks(datasets.xlarge)
    })
  })
})

// ============================================================================
// Block Distribution Analysis
// ============================================================================

describe('Block Distribution', () => {
  const records = datasets.xlarge

  bench('analyze: firstLetter(lastName)', () => {
    const strategy = new StandardBlockingStrategy<PersonRecord>({
      field: 'lastName',
      transform: 'firstLetter',
    })
    const blocks = strategy.generateBlocks(records)
    const stats = blockGenerator.calculateStats(blocks, records.length)

    // Log distribution for analysis (comment out during regular benchmarks)
    // console.log('firstLetter distribution:', {
    //   totalBlocks: stats.totalBlocks,
    //   avgPerBlock: stats.avgRecordsPerBlock.toFixed(2),
    //   minBlockSize: stats.minBlockSize,
    //   maxBlockSize: stats.maxBlockSize,
    //   reductionPercentage: stats.reductionPercentage.toFixed(2) + '%',
    // })

    return stats
  })

  bench('analyze: soundex(lastName)', () => {
    const strategy = new StandardBlockingStrategy<PersonRecord>({
      field: 'lastName',
      transform: 'soundex',
    })
    const blocks = strategy.generateBlocks(records)
    const stats = blockGenerator.calculateStats(blocks, records.length)

    // Log distribution for analysis
    // console.log('soundex distribution:', {
    //   totalBlocks: stats.totalBlocks,
    //   avgPerBlock: stats.avgRecordsPerBlock.toFixed(2),
    //   minBlockSize: stats.minBlockSize,
    //   maxBlockSize: stats.maxBlockSize,
    //   reductionPercentage: stats.reductionPercentage.toFixed(2) + '%',
    // })

    return stats
  })

  bench('analyze: sorted neighbourhood w=10', () => {
    const strategy = new SortedNeighbourhoodStrategy<PersonRecord>({
      sortBy: 'lastName',
      windowSize: 10,
    })
    const blocks = strategy.generateBlocks(records)
    const stats = blockGenerator.calculateStats(blocks, records.length)

    // Log distribution for analysis
    // console.log('sorted neighbourhood distribution:', {
    //   totalBlocks: stats.totalBlocks,
    //   avgPerBlock: stats.avgRecordsPerBlock.toFixed(2),
    //   minBlockSize: stats.minBlockSize,
    //   maxBlockSize: stats.maxBlockSize,
    //   reductionPercentage: stats.reductionPercentage.toFixed(2) + '%',
    // })

    return stats
  })
})

// ============================================================================
// Real-World Scenarios
// ============================================================================

describe('Real-World Scenarios', () => {
  const records = datasets.xlarge

  bench('Person matching: soundex(lastName) + birthYear', () => {
    const strategy = new StandardBlockingStrategy<PersonRecord>({
      fields: ['lastName', 'birthYear'],
      transforms: ['soundex', 'identity'],
    })
    const blocks = strategy.generateBlocks(records)
    const stats = blockGenerator.calculateStats(blocks, records.length)

    // Target: 98%+ reduction, <100ms for 100k records
    return stats
  })

  bench('Person matching: composite union (lastName OR birthYear)', () => {
    const strategy = new CompositeBlockingStrategy<PersonRecord>({
      strategies: [
        new StandardBlockingStrategy({
          field: 'lastName',
          transform: 'soundex',
        }),
        new StandardBlockingStrategy({
          field: 'birthYear',
          transform: 'identity',
        }),
      ],
      mode: 'union',
    })
    const blocks = strategy.generateBlocks(records)
    const stats = blockGenerator.calculateStats(blocks, records.length)

    // Higher recall, more comparisons than single strategy
    return stats
  })

  bench('Address matching: postcode + firstLetter(address)', () => {
    const strategy = new StandardBlockingStrategy<PersonRecord>({
      fields: ['postcode', 'address'],
      transforms: ['identity', 'firstLetter'],
    })
    const blocks = strategy.generateBlocks(records)
    const stats = blockGenerator.calculateStats(blocks, records.length)

    // Very high reduction, suitable for address deduplication
    return stats
  })

  bench('Email matching: domain extraction', () => {
    // Note: This would require a custom transform to extract domain
    // For now, we'll use a simpler approach
    const strategy = new StandardBlockingStrategy<PersonRecord>({
      field: 'email',
      transform: (value) => {
        if (typeof value === 'string' && value.includes('@')) {
          return value.split('@')[1]
        }
        return null
      },
    })
    const blocks = strategy.generateBlocks(records)
    const stats = blockGenerator.calculateStats(blocks, records.length)

    // Groups by email domain
    return stats
  })

  bench('Multi-strategy person matching: sorted neighbourhood fallback', () => {
    const strategy = new CompositeBlockingStrategy<PersonRecord>({
      strategies: [
        new StandardBlockingStrategy({
          fields: ['lastName', 'birthYear'],
          transforms: ['soundex', 'identity'],
        }),
        new SortedNeighbourhoodStrategy({
          sortBy: { field: 'lastName', transform: 'soundex' },
          windowSize: 20,
        }),
      ],
      mode: 'union',
    })
    const blocks = strategy.generateBlocks(records)
    const stats = blockGenerator.calculateStats(blocks, records.length)

    // Best recall: catches both exact matches and near-misses
    return stats
  })
})

// ============================================================================
// Strategy Comparison
// ============================================================================

describe('Strategy Comparison (100k records)', () => {
  const records = datasets.xlarge

  bench('standard: firstLetter', () => {
    const strategy = new StandardBlockingStrategy<PersonRecord>({
      field: 'lastName',
      transform: 'firstLetter',
    })
    strategy.generateBlocks(records)
  })

  bench('standard: soundex', () => {
    const strategy = new StandardBlockingStrategy<PersonRecord>({
      field: 'lastName',
      transform: 'soundex',
    })
    strategy.generateBlocks(records)
  })

  bench('standard: metaphone', () => {
    const strategy = new StandardBlockingStrategy<PersonRecord>({
      field: 'lastName',
      transform: 'metaphone',
    })
    strategy.generateBlocks(records)
  })

  bench('sorted neighbourhood: w=10', () => {
    const strategy = new SortedNeighbourhoodStrategy<PersonRecord>({
      sortBy: 'lastName',
      windowSize: 10,
    })
    strategy.generateBlocks(records)
  })

  bench('sorted neighbourhood: w=20', () => {
    const strategy = new SortedNeighbourhoodStrategy<PersonRecord>({
      sortBy: 'lastName',
      windowSize: 20,
    })
    strategy.generateBlocks(records)
  })

  bench('composite: union', () => {
    const strategy = new CompositeBlockingStrategy<PersonRecord>({
      strategies: [
        new StandardBlockingStrategy({
          field: 'lastName',
          transform: 'soundex',
        }),
        new StandardBlockingStrategy({ field: 'birthYear' }),
      ],
      mode: 'union',
    })
    strategy.generateBlocks(records)
  })

  bench('composite: intersection', () => {
    const strategy = new CompositeBlockingStrategy<PersonRecord>({
      strategies: [
        new StandardBlockingStrategy({
          field: 'lastName',
          transform: 'firstLetter',
        }),
        new StandardBlockingStrategy({ field: 'birthYear' }),
      ],
      mode: 'intersection',
    })
    strategy.generateBlocks(records)
  })
})

// ============================================================================
// Window Size Comparison
// ============================================================================

describe('Window Size Impact (10k records)', () => {
  const records = datasets.medium

  bench('sorted neighbourhood: w=5', () => {
    const strategy = new SortedNeighbourhoodStrategy<PersonRecord>({
      sortBy: 'lastName',
      windowSize: 5,
    })
    strategy.generateBlocks(records)
  })

  bench('sorted neighbourhood: w=10', () => {
    const strategy = new SortedNeighbourhoodStrategy<PersonRecord>({
      sortBy: 'lastName',
      windowSize: 10,
    })
    strategy.generateBlocks(records)
  })

  bench('sorted neighbourhood: w=20', () => {
    const strategy = new SortedNeighbourhoodStrategy<PersonRecord>({
      sortBy: 'lastName',
      windowSize: 20,
    })
    strategy.generateBlocks(records)
  })

  bench('sorted neighbourhood: w=50', () => {
    const strategy = new SortedNeighbourhoodStrategy<PersonRecord>({
      sortBy: 'lastName',
      windowSize: 50,
    })
    strategy.generateBlocks(records)
  })
})
