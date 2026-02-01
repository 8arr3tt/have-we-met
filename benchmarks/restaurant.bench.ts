/**
 * Restaurant Benchmark Suite
 *
 * Benchmarks the have-we-met library against Fodors-Zagat style restaurant datasets.
 * Tests entity matching performance for business entities with addresses.
 */

import { describe, bench } from 'vitest'
import {
  runBenchmark,
  runComparisonBenchmark,
  createMatchingFunction,
  generateComparisonReport,
  type BenchmarkResult,
} from './infrastructure'
import {
  generateSyntheticRestaurantData,
  normalizePhone,
  normalizeAddress,
  analyzeRestaurantDataset,
  type RestaurantRecord,
} from './datasets/restaurant/loader'
import {
  exactMatch,
  levenshtein,
  jaroWinkler,
} from '../src/core/comparators'
import { StandardBlockingStrategy } from '../src/core/blocking/strategies/standard-blocking'
import { firstLetter } from '../src/core/blocking/transforms'

// Generate datasets of various sizes
const smallDataset = generateSyntheticRestaurantData({ recordCount: 300, duplicateRate: 0.3, corruptionProbability: 0.25 })
const mediumDataset = generateSyntheticRestaurantData({ recordCount: 600, duplicateRate: 0.3, corruptionProbability: 0.25 })
const largeDataset = generateSyntheticRestaurantData({ recordCount: 1000, duplicateRate: 0.3, corruptionProbability: 0.25 })

// Phone normalizing exact match comparator
const phoneExact = (a: unknown, b: unknown): number => {
  if (a == null || b == null) return a === b ? 1 : 0
  const normA = normalizePhone(String(a))
  const normB = normalizePhone(String(b))
  return normA === normB && normA.length > 0 ? 1 : 0
}

// Address normalizing Levenshtein comparator
const addressLevenshtein = (a: unknown, b: unknown): number => {
  if (a == null || b == null) return a === b ? 1 : 0
  const normA = normalizeAddress(String(a))
  const normB = normalizeAddress(String(b))
  return levenshtein(normA, normB)
}

// Matching function using Jaro-Winkler for names
const jaroWinklerMatcher = createMatchingFunction<RestaurantRecord>([
  { field: 'name', comparator: (a, b) => jaroWinkler(a, b), weight: 30 },
  { field: 'addr', comparator: addressLevenshtein, weight: 25 },
  { field: 'city', comparator: (a, b) => exactMatch(a, b, { caseSensitive: false }), weight: 15 },
  { field: 'phone', comparator: phoneExact, weight: 20 },
  { field: 'type', comparator: (a, b) => levenshtein(a, b), weight: 10 },
])

// Matching function using Levenshtein for names
const levenshteinMatcher = createMatchingFunction<RestaurantRecord>([
  { field: 'name', comparator: (a, b) => levenshtein(a, b), weight: 30 },
  { field: 'addr', comparator: addressLevenshtein, weight: 25 },
  { field: 'city', comparator: (a, b) => exactMatch(a, b, { caseSensitive: false }), weight: 15 },
  { field: 'phone', comparator: phoneExact, weight: 20 },
  { field: 'type', comparator: (a, b) => levenshtein(a, b), weight: 10 },
])

// Matching function with exact city match requirement
const strictCityMatcher = createMatchingFunction<RestaurantRecord>([
  { field: 'name', comparator: (a, b) => jaroWinkler(a, b), weight: 35 },
  { field: 'addr', comparator: addressLevenshtein, weight: 30 },
  { field: 'city', comparator: (a, b) => exactMatch(a, b, { caseSensitive: false }), weight: 20 },
  { field: 'phone', comparator: phoneExact, weight: 15 },
])

// Blocking function using city
function cityBlocking(records: RestaurantRecord[]): Map<string, RestaurantRecord[]> {
  const strategy = new StandardBlockingStrategy<RestaurantRecord>({
    field: 'city',
    nullStrategy: 'skip',
    normalizeKeys: true,
  })
  return strategy.generateBlocks(records)
}

// Blocking function using first letter of name
function nameFirstLetterBlocking(records: RestaurantRecord[]): Map<string, RestaurantRecord[]> {
  const strategy = new StandardBlockingStrategy<RestaurantRecord>({
    field: 'name',
    transform: firstLetter,
    nullStrategy: 'skip',
  })
  return strategy.generateBlocks(records)
}

// Combined blocking: city + first letter of name
function combinedBlocking(records: RestaurantRecord[]): Map<string, RestaurantRecord[]> {
  const strategy = new StandardBlockingStrategy<RestaurantRecord>({
    fields: ['city', 'name'],
    transforms: [undefined, firstLetter],
    nullStrategy: 'skip',
  })
  return strategy.generateBlocks(records)
}

describe('Restaurant Benchmarks - Algorithm Comparison', () => {
  bench('Jaro-Winkler matcher (300 records)', async () => {
    await runBenchmark(
      { name: 'Jaro-Winkler (300)', warmupRuns: 0, measurementRuns: 1 },
      { dataset: smallDataset, matchingFn: jaroWinklerMatcher, threshold: 0.7 }
    )
  })

  bench('Levenshtein matcher (300 records)', async () => {
    await runBenchmark(
      { name: 'Levenshtein (300)', warmupRuns: 0, measurementRuns: 1 },
      { dataset: smallDataset, matchingFn: levenshteinMatcher, threshold: 0.7 }
    )
  })

  bench('Strict city matcher (300 records)', async () => {
    await runBenchmark(
      { name: 'Strict City (300)', warmupRuns: 0, measurementRuns: 1 },
      { dataset: smallDataset, matchingFn: strictCityMatcher, threshold: 0.7 }
    )
  })
})

describe('Restaurant Benchmarks - Blocking Strategies', () => {
  bench('No blocking (300 records)', async () => {
    await runBenchmark(
      { name: 'No Blocking (300)', warmupRuns: 0, measurementRuns: 1 },
      { dataset: smallDataset, matchingFn: jaroWinklerMatcher, threshold: 0.7 }
    )
  })

  bench('City blocking (300 records)', async () => {
    await runBenchmark(
      { name: 'City Blocking (300)', warmupRuns: 0, measurementRuns: 1 },
      {
        dataset: smallDataset,
        matchingFn: jaroWinklerMatcher,
        blockingFn: cityBlocking,
        threshold: 0.7,
      }
    )
  })

  bench('Name first letter blocking (300 records)', async () => {
    await runBenchmark(
      { name: 'Name First Letter (300)', warmupRuns: 0, measurementRuns: 1 },
      {
        dataset: smallDataset,
        matchingFn: jaroWinklerMatcher,
        blockingFn: nameFirstLetterBlocking,
        threshold: 0.7,
      }
    )
  })

  bench('Combined blocking (300 records)', async () => {
    await runBenchmark(
      { name: 'Combined Blocking (300)', warmupRuns: 0, measurementRuns: 1 },
      {
        dataset: smallDataset,
        matchingFn: jaroWinklerMatcher,
        blockingFn: combinedBlocking,
        threshold: 0.7,
      }
    )
  })
})

describe('Restaurant Benchmarks - Scalability', () => {
  bench('600 records with city blocking', async () => {
    await runBenchmark(
      { name: 'Scalability 600', warmupRuns: 0, measurementRuns: 1 },
      {
        dataset: mediumDataset,
        matchingFn: jaroWinklerMatcher,
        blockingFn: cityBlocking,
        threshold: 0.7,
      }
    )
  })

  bench('1000 records with city blocking', async () => {
    await runBenchmark(
      { name: 'Scalability 1000', warmupRuns: 0, measurementRuns: 1 },
      {
        dataset: largeDataset,
        matchingFn: jaroWinklerMatcher,
        blockingFn: cityBlocking,
        threshold: 0.7,
      }
    )
  })
})

/**
 * Runs comprehensive restaurant benchmarks and generates a report.
 */
export async function runRestaurantBenchmarks(): Promise<{
  results: BenchmarkResult[]
  report: string
}> {
  console.log('Running Restaurant Benchmark Suite...\n')

  // Analyze the datasets
  console.log('Dataset Analysis:')
  console.log(`Small dataset: ${smallDataset.records.length} records, ${smallDataset.truePairs?.length} true pairs`)
  console.log(`Medium dataset: ${mediumDataset.records.length} records, ${mediumDataset.truePairs?.length} true pairs`)
  console.log(`Large dataset: ${largeDataset.records.length} records, ${largeDataset.truePairs?.length} true pairs`)
  console.log('')

  const analysis = analyzeRestaurantDataset(smallDataset)
  console.log('Field null rates:', analysis.nullRates)
  console.log('Unique values per field:', analysis.uniqueValues)
  console.log('')

  const results: BenchmarkResult[] = []

  // Algorithm comparison benchmarks
  console.log('Running algorithm comparison benchmarks...')

  const algorithmConfigs = [
    {
      name: 'Jaro-Winkler (name)',
      matchingFn: jaroWinklerMatcher,
      threshold: 0.7,
    },
    {
      name: 'Levenshtein (name)',
      matchingFn: levenshteinMatcher,
      threshold: 0.7,
    },
    {
      name: 'Strict City Match',
      matchingFn: strictCityMatcher,
      threshold: 0.7,
    },
  ]

  const algorithmResults = await runComparisonBenchmark(
    mediumDataset,
    algorithmConfigs,
    { warmupRuns: 1, measurementRuns: 3, collectMemory: true }
  )
  results.push(...algorithmResults)

  // Blocking strategy benchmarks
  console.log('Running blocking strategy benchmarks...')

  const blockingConfigs = [
    {
      name: 'No Blocking',
      matchingFn: jaroWinklerMatcher,
      threshold: 0.7,
    },
    {
      name: 'City Blocking',
      matchingFn: jaroWinklerMatcher,
      blockingFn: cityBlocking,
      threshold: 0.7,
    },
    {
      name: 'Name First Letter',
      matchingFn: jaroWinklerMatcher,
      blockingFn: nameFirstLetterBlocking,
      threshold: 0.7,
    },
    {
      name: 'Combined (City + Name)',
      matchingFn: jaroWinklerMatcher,
      blockingFn: combinedBlocking,
      threshold: 0.7,
    },
  ]

  const blockingResults = await runComparisonBenchmark(
    mediumDataset,
    blockingConfigs,
    { warmupRuns: 1, measurementRuns: 3, collectMemory: true }
  )
  results.push(...blockingResults)

  // Threshold analysis benchmark
  console.log('Running threshold analysis benchmark...')

  const thresholdResult = await runBenchmark(
    { name: 'Threshold Analysis', warmupRuns: 1, measurementRuns: 3 },
    {
      dataset: mediumDataset,
      matchingFn: jaroWinklerMatcher,
      blockingFn: cityBlocking,
      analyzeThresholds: true,
      thresholdRange: { min: 0.5, max: 0.95, step: 0.05 },
    }
  )
  results.push(thresholdResult)

  // Scalability benchmarks
  console.log('Running scalability benchmarks...')

  for (const dataset of [smallDataset, mediumDataset, largeDataset]) {
    const result = await runBenchmark(
      {
        name: `Scalability ${dataset.records.length}`,
        warmupRuns: 1,
        measurementRuns: 3,
        collectMemory: true,
      },
      {
        dataset,
        matchingFn: jaroWinklerMatcher,
        blockingFn: cityBlocking,
        threshold: 0.7,
      }
    )
    results.push(result)
  }

  // Generate report
  const report = generateComparisonReport('Restaurant Benchmark Results', results, {
    includeTimestamp: true,
  })

  console.log('\nBenchmarks complete!')

  return { results, report }
}

// Export for direct execution
export {
  smallDataset,
  mediumDataset,
  largeDataset,
  jaroWinklerMatcher,
  levenshteinMatcher,
  strictCityMatcher,
  cityBlocking,
  nameFirstLetterBlocking,
  combinedBlocking,
  phoneExact,
  addressLevenshtein,
}
