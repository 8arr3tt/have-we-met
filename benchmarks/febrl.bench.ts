/**
 * Febrl Benchmark Suite
 *
 * Benchmarks the have-we-met library against Febrl synthetic datasets.
 * Tests probabilistic matching performance with different configurations.
 */

import { describe, bench } from 'vitest'
import {
  runBenchmark,
  runComparisonBenchmark,
  createMatchingFunction,
  generateComparisonReport,
  generateScalabilityReport,
  type BenchmarkConfig,
  type BenchmarkResult,
} from './infrastructure'
import {
  generateSyntheticFebrlData,
  type FebrlRecord,
  getDefaultFebrlMatchingConfig,
  analyzeFebrlDataset,
} from './datasets/febrl/loader'
import {
  exactMatch,
  levenshtein,
  jaroWinkler,
  soundex,
  soundexEncode,
} from '../src/core/comparators'
import { StandardBlockingStrategy } from '../src/core/blocking/strategies/standard-blocking'
import { soundexTransform, firstLetter } from '../src/core/blocking/transforms'

// Generate datasets of various sizes
const smallDataset = generateSyntheticFebrlData({ recordCount: 500, duplicateRate: 0.5, corruptionProbability: 0.3 })
const mediumDataset = generateSyntheticFebrlData({ recordCount: 1000, duplicateRate: 0.5, corruptionProbability: 0.3 })
const largeDataset = generateSyntheticFebrlData({ recordCount: 2000, duplicateRate: 0.5, corruptionProbability: 0.3 })

// Matching function using Jaro-Winkler for names
const jaroWinklerMatcher = createMatchingFunction<FebrlRecord>([
  { field: 'given_name', comparator: (a, b) => jaroWinkler(a, b), weight: 15 },
  { field: 'surname', comparator: (a, b) => jaroWinkler(a, b), weight: 20 },
  { field: 'date_of_birth', comparator: (a, b) => exactMatch(a, b), weight: 15 },
  { field: 'soc_sec_id', comparator: (a, b) => exactMatch(a, b), weight: 25 },
  { field: 'postcode', comparator: (a, b) => exactMatch(a, b), weight: 10 },
  { field: 'address_1', comparator: (a, b) => levenshtein(a, b), weight: 10 },
  { field: 'suburb', comparator: (a, b) => levenshtein(a, b), weight: 5 },
])

// Matching function using Levenshtein for names
const levenshteinMatcher = createMatchingFunction<FebrlRecord>([
  { field: 'given_name', comparator: (a, b) => levenshtein(a, b), weight: 15 },
  { field: 'surname', comparator: (a, b) => levenshtein(a, b), weight: 20 },
  { field: 'date_of_birth', comparator: (a, b) => exactMatch(a, b), weight: 15 },
  { field: 'soc_sec_id', comparator: (a, b) => exactMatch(a, b), weight: 25 },
  { field: 'postcode', comparator: (a, b) => exactMatch(a, b), weight: 10 },
  { field: 'address_1', comparator: (a, b) => levenshtein(a, b), weight: 10 },
  { field: 'suburb', comparator: (a, b) => levenshtein(a, b), weight: 5 },
])

// Matching function using Soundex for names (phonetic)
const soundexMatcher = createMatchingFunction<FebrlRecord>([
  { field: 'given_name', comparator: (a, b) => soundex(a, b), weight: 10 },
  { field: 'surname', comparator: (a, b) => soundex(a, b), weight: 15 },
  { field: 'given_name', comparator: (a, b) => jaroWinkler(a, b), weight: 10 },
  { field: 'surname', comparator: (a, b) => jaroWinkler(a, b), weight: 15 },
  { field: 'date_of_birth', comparator: (a, b) => exactMatch(a, b), weight: 15 },
  { field: 'soc_sec_id', comparator: (a, b) => exactMatch(a, b), weight: 20 },
  { field: 'postcode', comparator: (a, b) => exactMatch(a, b), weight: 10 },
  { field: 'address_1', comparator: (a, b) => levenshtein(a, b), weight: 5 },
])

// Blocking function using Soundex on surname
function soundexBlocking(records: FebrlRecord[]): Map<string, FebrlRecord[]> {
  const strategy = new StandardBlockingStrategy<FebrlRecord>({
    field: 'surname',
    transform: soundexTransform,
    nullStrategy: 'skip',
  })
  return strategy.generateBlocks(records)
}

// Blocking function using first letter of surname
function firstLetterBlocking(records: FebrlRecord[]): Map<string, FebrlRecord[]> {
  const strategy = new StandardBlockingStrategy<FebrlRecord>({
    field: 'surname',
    transform: firstLetter,
    nullStrategy: 'skip',
  })
  return strategy.generateBlocks(records)
}

// Blocking function using postcode
function postcodeBlocking(records: FebrlRecord[]): Map<string, FebrlRecord[]> {
  const strategy = new StandardBlockingStrategy<FebrlRecord>({
    field: 'postcode',
    nullStrategy: 'skip',
  })
  return strategy.generateBlocks(records)
}

// Combined blocking: Soundex(surname) + postcode
function combinedBlocking(records: FebrlRecord[]): Map<string, FebrlRecord[]> {
  const strategy = new StandardBlockingStrategy<FebrlRecord>({
    fields: ['surname', 'postcode'],
    transforms: [soundexTransform, undefined],
    nullStrategy: 'skip',
  })
  return strategy.generateBlocks(records)
}

describe('Febrl Benchmarks - Algorithm Comparison', () => {
  bench('Jaro-Winkler matcher (500 records)', async () => {
    await runBenchmark(
      { name: 'Jaro-Winkler (500)', warmupRuns: 0, measurementRuns: 1 },
      { dataset: smallDataset, matchingFn: jaroWinklerMatcher, threshold: 0.7 }
    )
  })

  bench('Levenshtein matcher (500 records)', async () => {
    await runBenchmark(
      { name: 'Levenshtein (500)', warmupRuns: 0, measurementRuns: 1 },
      { dataset: smallDataset, matchingFn: levenshteinMatcher, threshold: 0.7 }
    )
  })

  bench('Soundex+JW hybrid matcher (500 records)', async () => {
    await runBenchmark(
      { name: 'Soundex+JW (500)', warmupRuns: 0, measurementRuns: 1 },
      { dataset: smallDataset, matchingFn: soundexMatcher, threshold: 0.7 }
    )
  })
})

describe('Febrl Benchmarks - Blocking Strategies', () => {
  bench('No blocking (500 records)', async () => {
    await runBenchmark(
      { name: 'No Blocking (500)', warmupRuns: 0, measurementRuns: 1 },
      { dataset: smallDataset, matchingFn: jaroWinklerMatcher, threshold: 0.7 }
    )
  })

  bench('Soundex blocking (500 records)', async () => {
    await runBenchmark(
      { name: 'Soundex Blocking (500)', warmupRuns: 0, measurementRuns: 1 },
      {
        dataset: smallDataset,
        matchingFn: jaroWinklerMatcher,
        blockingFn: soundexBlocking,
        threshold: 0.7,
      }
    )
  })

  bench('First letter blocking (500 records)', async () => {
    await runBenchmark(
      { name: 'First Letter Blocking (500)', warmupRuns: 0, measurementRuns: 1 },
      {
        dataset: smallDataset,
        matchingFn: jaroWinklerMatcher,
        blockingFn: firstLetterBlocking,
        threshold: 0.7,
      }
    )
  })

  bench('Postcode blocking (500 records)', async () => {
    await runBenchmark(
      { name: 'Postcode Blocking (500)', warmupRuns: 0, measurementRuns: 1 },
      {
        dataset: smallDataset,
        matchingFn: jaroWinklerMatcher,
        blockingFn: postcodeBlocking,
        threshold: 0.7,
      }
    )
  })

  bench('Combined blocking (500 records)', async () => {
    await runBenchmark(
      { name: 'Combined Blocking (500)', warmupRuns: 0, measurementRuns: 1 },
      {
        dataset: smallDataset,
        matchingFn: jaroWinklerMatcher,
        blockingFn: combinedBlocking,
        threshold: 0.7,
      }
    )
  })
})

describe('Febrl Benchmarks - Scalability', () => {
  bench('1000 records with blocking', async () => {
    await runBenchmark(
      { name: 'Scalability 1000', warmupRuns: 0, measurementRuns: 1 },
      {
        dataset: mediumDataset,
        matchingFn: jaroWinklerMatcher,
        blockingFn: soundexBlocking,
        threshold: 0.7,
      }
    )
  })

  bench('2000 records with blocking', async () => {
    await runBenchmark(
      { name: 'Scalability 2000', warmupRuns: 0, measurementRuns: 1 },
      {
        dataset: largeDataset,
        matchingFn: jaroWinklerMatcher,
        blockingFn: soundexBlocking,
        threshold: 0.7,
      }
    )
  })
})

/**
 * Runs comprehensive Febrl benchmarks and generates a report.
 * Call this function directly to generate the results file.
 */
export async function runFebrlBenchmarks(): Promise<{
  results: BenchmarkResult[]
  report: string
}> {
  console.log('Running Febrl Benchmark Suite...\n')

  // Analyze the datasets
  console.log('Dataset Analysis:')
  console.log(`Small dataset: ${smallDataset.records.length} records, ${smallDataset.truePairs?.length} true pairs`)
  console.log(`Medium dataset: ${mediumDataset.records.length} records, ${mediumDataset.truePairs?.length} true pairs`)
  console.log(`Large dataset: ${largeDataset.records.length} records, ${largeDataset.truePairs?.length} true pairs`)
  console.log('')

  const analysis = analyzeFebrlDataset(smallDataset)
  console.log('Field null rates:', analysis.nullRates)
  console.log('Unique values per field:', analysis.uniqueValues)
  console.log('')

  const results: BenchmarkResult[] = []

  // Algorithm comparison benchmarks
  console.log('Running algorithm comparison benchmarks...')

  const algorithmConfigs = [
    {
      name: 'Jaro-Winkler',
      matchingFn: jaroWinklerMatcher,
      threshold: 0.7,
    },
    {
      name: 'Levenshtein',
      matchingFn: levenshteinMatcher,
      threshold: 0.7,
    },
    {
      name: 'Soundex+JW Hybrid',
      matchingFn: soundexMatcher,
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
      name: 'Soundex Blocking',
      matchingFn: jaroWinklerMatcher,
      blockingFn: soundexBlocking,
      threshold: 0.7,
    },
    {
      name: 'First Letter Blocking',
      matchingFn: jaroWinklerMatcher,
      blockingFn: firstLetterBlocking,
      threshold: 0.7,
    },
    {
      name: 'Postcode Blocking',
      matchingFn: jaroWinklerMatcher,
      blockingFn: postcodeBlocking,
      threshold: 0.7,
    },
    {
      name: 'Combined Blocking',
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
      blockingFn: soundexBlocking,
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
        blockingFn: soundexBlocking,
        threshold: 0.7,
      }
    )
    results.push(result)
  }

  // Generate report
  const report = generateComparisonReport('Febrl Benchmark Results', results, {
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
  soundexMatcher,
  soundexBlocking,
  firstLetterBlocking,
  postcodeBlocking,
  combinedBlocking,
}
