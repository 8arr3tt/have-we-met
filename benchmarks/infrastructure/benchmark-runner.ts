/**
 * Benchmark runner for executing and measuring record linkage benchmarks.
 * Provides a framework for running benchmarks with timing, memory tracking, and metrics collection.
 */

import {
  MetricsCollector,
  calculateClassificationMetrics,
  calculateThroughputMetrics,
  captureMemoryUsage,
  calculateMemoryMetrics,
  calculateBlockingMetrics,
  type ClassificationMetrics,
  type ThroughputMetrics,
  type MemoryMetrics,
  type BlockingMetrics,
  type PredictedPair,
  type TruePair,
} from './metrics-collector'
import type { LoadedDataset, DatasetRecord } from './dataset-loader'

export interface BenchmarkConfig {
  name: string
  description?: string
  warmupRuns?: number
  measurementRuns?: number
  collectMemory?: boolean
  collectGC?: boolean
  timeout?: number
}

export interface BenchmarkResult {
  name: string
  description?: string
  timestamp: string
  config: BenchmarkConfig
  classification?: ClassificationMetrics & { stdDev?: Record<string, number> }
  throughput?: ThroughputMetrics
  memory?: MemoryMetrics
  blocking?: BlockingMetrics
  thresholdAnalysis?: ThresholdAnalysis
  custom: Record<string, number | string>
  errors: string[]
  success: boolean
}

export interface ThresholdAnalysis {
  thresholds: number[]
  metricsAtThresholds: Array<{
    threshold: number
    metrics: ClassificationMetrics
  }>
  optimalThreshold: number
  optimalMetrics: ClassificationMetrics
}

export interface MatchingFunction<T extends DatasetRecord> {
  (record1: T, record2: T): number
}

export interface BlockingFunction<T extends DatasetRecord> {
  (records: T[]): Map<string, T[]>
}

export interface BenchmarkRunOptions<T extends DatasetRecord> {
  dataset: LoadedDataset<T>
  matchingFn: MatchingFunction<T>
  blockingFn?: BlockingFunction<T>
  threshold?: number
  analyzeThresholds?: boolean
  thresholdRange?: { min: number; max: number; step: number }
}

/**
 * Runs a single benchmark iteration.
 */
async function runSingleIteration<T extends DatasetRecord>(
  options: BenchmarkRunOptions<T>,
  collectMemory: boolean
): Promise<{
  predictedPairs: PredictedPair[]
  executionTimeMs: number
  pairsCompared: number
  memoryBefore?: { heapUsed: number; external: number }
  memoryAfter?: { heapUsed: number; external: number }
  blocks?: Map<string, T[]>
}> {
  const { dataset, matchingFn, blockingFn, threshold = 0.5 } = options
  const { records, truePairs } = dataset

  const memoryBefore = collectMemory ? captureMemoryUsage() : undefined

  const startTime = performance.now()

  let blocks: Map<string, T[]> | undefined
  const predictedPairs: PredictedPair[] = []
  let pairsCompared = 0

  if (blockingFn) {
    blocks = blockingFn(records)

    for (const block of blocks.values()) {
      for (let i = 0; i < block.length; i++) {
        for (let j = i + 1; j < block.length; j++) {
          const record1 = block[i]
          const record2 = block[j]
          const score = matchingFn(record1, record2)
          pairsCompared++

          predictedPairs.push({
            id1: record1.id,
            id2: record2.id,
            score,
            predicted: score >= threshold,
          })
        }
      }
    }
  } else {
    for (let i = 0; i < records.length; i++) {
      for (let j = i + 1; j < records.length; j++) {
        const record1 = records[i]
        const record2 = records[j]
        const score = matchingFn(record1, record2)
        pairsCompared++

        predictedPairs.push({
          id1: record1.id,
          id2: record2.id,
          score,
          predicted: score >= threshold,
        })
      }
    }
  }

  const executionTimeMs = performance.now() - startTime
  const memoryAfter = collectMemory ? captureMemoryUsage() : undefined

  return {
    predictedPairs,
    executionTimeMs,
    pairsCompared,
    memoryBefore,
    memoryAfter,
    blocks,
  }
}

/**
 * Runs a complete benchmark with warmup and measurement phases.
 */
export async function runBenchmark<T extends DatasetRecord>(
  config: BenchmarkConfig,
  options: BenchmarkRunOptions<T>
): Promise<BenchmarkResult> {
  const {
    name,
    description,
    warmupRuns = 1,
    measurementRuns = 3,
    collectMemory = true,
    timeout = 300000,
  } = config

  const result: BenchmarkResult = {
    name,
    description,
    timestamp: new Date().toISOString(),
    config,
    custom: {},
    errors: [],
    success: false,
  }

  const collector = new MetricsCollector()
  const truePairs: TruePair[] =
    options.dataset.truePairs?.map((p) => ({
      id1: p.id1,
      id2: p.id2,
      isMatch: p.isMatch,
    })) ?? []

  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new Error(`Benchmark timed out after ${timeout}ms`)),
        timeout
      )
    })

    const benchmarkPromise = (async () => {
      for (let i = 0; i < warmupRuns; i++) {
        await runSingleIteration(options, false)
      }

      let lastBlocks: Map<string, T[]> | undefined
      const allPredictedPairs: PredictedPair[] = []

      for (let i = 0; i < measurementRuns; i++) {
        const iterResult = await runSingleIteration(options, collectMemory)

        if (i === measurementRuns - 1) {
          allPredictedPairs.push(...iterResult.predictedPairs)
        }

        if (truePairs.length > 0) {
          const classMetrics = calculateClassificationMetrics(
            iterResult.predictedPairs,
            truePairs
          )
          collector.addClassificationRun(classMetrics)
        }

        const throughputMetrics = calculateThroughputMetrics(
          options.dataset.records.length,
          iterResult.pairsCompared,
          iterResult.executionTimeMs
        )
        collector.addThroughputRun(throughputMetrics)

        if (
          collectMemory &&
          iterResult.memoryBefore &&
          iterResult.memoryAfter
        ) {
          const memoryMetrics = calculateMemoryMetrics(
            iterResult.memoryBefore,
            iterResult.memoryAfter
          )
          collector.addMemoryRun(memoryMetrics)
        }

        lastBlocks = iterResult.blocks
      }

      if (truePairs.length > 0) {
        result.classification = collector.getAggregatedClassification()
      }

      result.throughput = collector.getAggregatedThroughput()

      if (collectMemory) {
        result.memory = collector.getAggregatedMemory()
      }

      if (lastBlocks) {
        result.blocking = calculateBlockingMetrics(
          lastBlocks as Map<string, unknown[]>,
          options.dataset.records.length
        )
      }

      if (
        options.analyzeThresholds &&
        allPredictedPairs.length > 0 &&
        truePairs.length > 0
      ) {
        const { min = 0, max = 1, step = 0.05 } = options.thresholdRange ?? {}
        const thresholds: number[] = []
        for (let t = min; t <= max; t += step) {
          thresholds.push(Math.round(t * 100) / 100)
        }

        const metricsAtThresholds: Array<{
          threshold: number
          metrics: ClassificationMetrics
        }> = []
        let optimalThreshold = min
        let optimalF1 = -1
        let optimalMetrics: ClassificationMetrics | null = null

        for (const threshold of thresholds) {
          const classifiedPairs: PredictedPair[] = allPredictedPairs.map(
            (p) => ({
              ...p,
              predicted: p.score >= threshold,
            })
          )

          const metrics = calculateClassificationMetrics(
            classifiedPairs,
            truePairs
          )
          metricsAtThresholds.push({ threshold, metrics })

          if (metrics.f1Score > optimalF1) {
            optimalF1 = metrics.f1Score
            optimalThreshold = threshold
            optimalMetrics = metrics
          }
        }

        result.thresholdAnalysis = {
          thresholds,
          metricsAtThresholds,
          optimalThreshold,
          optimalMetrics: optimalMetrics ?? {
            truePositives: 0,
            falsePositives: 0,
            trueNegatives: 0,
            falseNegatives: 0,
            precision: 0,
            recall: 0,
            f1Score: 0,
            accuracy: 0,
            specificity: 0,
          },
        }
      }

      result.success = true
    })()

    await Promise.race([benchmarkPromise, timeoutPromise])
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : String(error))
    result.success = false
  }

  return result
}

/**
 * Runs multiple benchmarks in sequence.
 */
export async function runBenchmarkSuite<T extends DatasetRecord>(
  benchmarks: Array<{
    config: BenchmarkConfig
    options: BenchmarkRunOptions<T>
  }>
): Promise<BenchmarkResult[]> {
  const results: BenchmarkResult[] = []

  for (const { config, options } of benchmarks) {
    const result = await runBenchmark(config, options)
    results.push(result)
  }

  return results
}

/**
 * Creates a comparison benchmark that tests multiple configurations against the same dataset.
 */
export async function runComparisonBenchmark<T extends DatasetRecord>(
  dataset: LoadedDataset<T>,
  configurations: Array<{
    name: string
    matchingFn: MatchingFunction<T>
    blockingFn?: BlockingFunction<T>
    threshold?: number
  }>,
  baseConfig: Partial<BenchmarkConfig> = {}
): Promise<BenchmarkResult[]> {
  const results: BenchmarkResult[] = []

  for (const config of configurations) {
    const result = await runBenchmark(
      {
        name: config.name,
        warmupRuns: 1,
        measurementRuns: 3,
        ...baseConfig,
      },
      {
        dataset,
        matchingFn: config.matchingFn,
        blockingFn: config.blockingFn,
        threshold: config.threshold,
        analyzeThresholds: true,
      }
    )
    results.push(result)
  }

  return results
}

/**
 * Creates a scalability benchmark that tests the same configuration at different dataset sizes.
 */
export async function runScalabilityBenchmark<T extends DatasetRecord>(
  datasetGenerator: (size: number) => LoadedDataset<T>,
  sizes: number[],
  matchingFn: MatchingFunction<T>,
  blockingFn?: BlockingFunction<T>,
  baseConfig: Partial<BenchmarkConfig> = {}
): Promise<Array<{ size: number; result: BenchmarkResult }>> {
  const results: Array<{ size: number; result: BenchmarkResult }> = []

  for (const size of sizes) {
    const dataset = datasetGenerator(size)
    const result = await runBenchmark(
      {
        name: `Scalability test (${size} records)`,
        warmupRuns: 1,
        measurementRuns: 3,
        ...baseConfig,
      },
      {
        dataset,
        matchingFn,
        blockingFn,
      }
    )
    results.push({ size, result })
  }

  return results
}

/**
 * Helper to create a simple matching function from field comparators.
 */
export function createMatchingFunction<T extends DatasetRecord>(
  fieldComparators: Array<{
    field: keyof T
    comparator: (a: unknown, b: unknown) => number
    weight: number
  }>
): MatchingFunction<T> {
  const totalWeight = fieldComparators.reduce((sum, fc) => sum + fc.weight, 0)

  return (record1: T, record2: T): number => {
    let weightedSum = 0

    for (const { field, comparator, weight } of fieldComparators) {
      const score = comparator(record1[field], record2[field])
      weightedSum += score * weight
    }

    return totalWeight > 0 ? weightedSum / totalWeight : 0
  }
}
