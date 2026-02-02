/**
 * Metrics collection for benchmark evaluation.
 * Calculates precision, recall, F1-score, accuracy, and throughput metrics.
 */

export interface ClassificationMetrics {
  truePositives: number
  falsePositives: number
  trueNegatives: number
  falseNegatives: number
  precision: number
  recall: number
  f1Score: number
  accuracy: number
  specificity: number
}

export interface ThroughputMetrics {
  totalRecords: number
  totalPairs: number
  executionTimeMs: number
  recordsPerSecond: number
  pairsPerSecond: number
  comparisonsPerSecond: number
}

export interface MemoryMetrics {
  heapUsedBefore: number
  heapUsedAfter: number
  heapUsedDelta: number
  externalBefore: number
  externalAfter: number
  externalDelta: number
  peakHeapUsed?: number
}

export interface BenchmarkMetrics {
  classification: ClassificationMetrics
  throughput: ThroughputMetrics
  memory?: MemoryMetrics
  blocking?: BlockingMetrics
  custom: Record<string, number | string>
}

export interface BlockingMetrics {
  totalBlocks: number
  totalPairsWithoutBlocking: number
  totalPairsWithBlocking: number
  reductionRatio: number
  avgBlockSize: number
  maxBlockSize: number
  minBlockSize: number
}

export interface PredictedPair {
  id1: string | number
  id2: string | number
  score: number
  predicted: boolean
}

export interface TruePair {
  id1: string | number
  id2: string | number
  isMatch: boolean
}

/**
 * Creates a lookup key for a pair of IDs (order-independent).
 */
function pairKey(id1: string | number, id2: string | number): string {
  const sorted = [String(id1), String(id2)].sort()
  return `${sorted[0]}|${sorted[1]}`
}

/**
 * Calculates classification metrics (precision, recall, F1, accuracy).
 */
export function calculateClassificationMetrics(
  predictedPairs: PredictedPair[],
  truePairs: TruePair[],
  totalPossiblePairs?: number
): ClassificationMetrics {
  const truePairSet = new Set<string>()
  for (const pair of truePairs) {
    if (pair.isMatch) {
      truePairSet.add(pairKey(pair.id1, pair.id2))
    }
  }

  const predictedPositiveSet = new Set<string>()
  for (const pair of predictedPairs) {
    if (pair.predicted) {
      predictedPositiveSet.add(pairKey(pair.id1, pair.id2))
    }
  }

  let truePositives = 0
  let falsePositives = 0
  let falseNegatives = 0

  for (const key of predictedPositiveSet) {
    if (truePairSet.has(key)) {
      truePositives++
    } else {
      falsePositives++
    }
  }

  for (const key of truePairSet) {
    if (!predictedPositiveSet.has(key)) {
      falseNegatives++
    }
  }

  const totalPositive = truePairSet.size
  const totalNegative = totalPossiblePairs
    ? totalPossiblePairs - totalPositive
    : predictedPairs.filter((p) => !p.predicted).length

  const trueNegatives = totalNegative - falsePositives

  const precision =
    truePositives + falsePositives > 0
      ? truePositives / (truePositives + falsePositives)
      : 0

  const recall =
    truePositives + falseNegatives > 0
      ? truePositives / (truePositives + falseNegatives)
      : 0

  const f1Score =
    precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0

  const total = truePositives + trueNegatives + falsePositives + falseNegatives
  const accuracy = total > 0 ? (truePositives + trueNegatives) / total : 0

  const specificity =
    trueNegatives + falsePositives > 0
      ? trueNegatives / (trueNegatives + falsePositives)
      : 0

  return {
    truePositives,
    falsePositives,
    trueNegatives,
    falseNegatives,
    precision,
    recall,
    f1Score,
    accuracy,
    specificity,
  }
}

/**
 * Calculates metrics at multiple threshold values.
 */
export function calculateMetricsAtThresholds(
  predictedPairs: Array<{
    id1: string | number
    id2: string | number
    score: number
  }>,
  truePairs: TruePair[],
  thresholds: number[],
  totalPossiblePairs?: number
): Map<number, ClassificationMetrics> {
  const results = new Map<number, ClassificationMetrics>()

  for (const threshold of thresholds) {
    const classifiedPairs: PredictedPair[] = predictedPairs.map((pair) => ({
      ...pair,
      predicted: pair.score >= threshold,
    }))

    results.set(
      threshold,
      calculateClassificationMetrics(
        classifiedPairs,
        truePairs,
        totalPossiblePairs
      )
    )
  }

  return results
}

/**
 * Finds the optimal threshold that maximizes F1 score.
 */
export function findOptimalThreshold(
  predictedPairs: Array<{
    id1: string | number
    id2: string | number
    score: number
  }>,
  truePairs: TruePair[],
  minThreshold: number = 0,
  maxThreshold: number = 1,
  step: number = 0.05
): { threshold: number; metrics: ClassificationMetrics } {
  let bestThreshold = minThreshold
  let bestMetrics: ClassificationMetrics | null = null
  let bestF1 = -1

  for (
    let threshold = minThreshold;
    threshold <= maxThreshold;
    threshold += step
  ) {
    const classifiedPairs: PredictedPair[] = predictedPairs.map((pair) => ({
      ...pair,
      predicted: pair.score >= threshold,
    }))

    const metrics = calculateClassificationMetrics(classifiedPairs, truePairs)

    if (metrics.f1Score > bestF1) {
      bestF1 = metrics.f1Score
      bestThreshold = threshold
      bestMetrics = metrics
    }
  }

  return {
    threshold: bestThreshold,
    metrics: bestMetrics ?? {
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

/**
 * Calculates throughput metrics.
 */
export function calculateThroughputMetrics(
  totalRecords: number,
  totalPairs: number,
  executionTimeMs: number
): ThroughputMetrics {
  const executionTimeSec = executionTimeMs / 1000

  return {
    totalRecords,
    totalPairs,
    executionTimeMs,
    recordsPerSecond:
      executionTimeSec > 0 ? totalRecords / executionTimeSec : 0,
    pairsPerSecond: executionTimeSec > 0 ? totalPairs / executionTimeSec : 0,
    comparisonsPerSecond:
      executionTimeSec > 0 ? totalPairs / executionTimeSec : 0,
  }
}

/**
 * Captures current memory usage.
 */
export function captureMemoryUsage(): { heapUsed: number; external: number } {
  if (typeof process !== 'undefined' && process.memoryUsage) {
    const usage = process.memoryUsage()
    return {
      heapUsed: usage.heapUsed,
      external: usage.external,
    }
  }
  return { heapUsed: 0, external: 0 }
}

/**
 * Calculates memory metrics from before/after snapshots.
 */
export function calculateMemoryMetrics(
  before: { heapUsed: number; external: number },
  after: { heapUsed: number; external: number },
  peak?: number
): MemoryMetrics {
  return {
    heapUsedBefore: before.heapUsed,
    heapUsedAfter: after.heapUsed,
    heapUsedDelta: after.heapUsed - before.heapUsed,
    externalBefore: before.external,
    externalAfter: after.external,
    externalDelta: after.external - before.external,
    peakHeapUsed: peak,
  }
}

/**
 * Calculates blocking effectiveness metrics.
 */
export function calculateBlockingMetrics(
  blocks: Map<string, unknown[]>,
  totalRecords: number
): BlockingMetrics {
  const blockSizes = Array.from(blocks.values()).map((b) => b.length)
  const totalBlocks = blockSizes.length

  const totalPairsWithoutBlocking =
    totalRecords > 1 ? (totalRecords * (totalRecords - 1)) / 2 : 0

  let totalPairsWithBlocking = 0
  for (const size of blockSizes) {
    if (size > 1) {
      totalPairsWithBlocking += (size * (size - 1)) / 2
    }
  }

  const reductionRatio =
    totalPairsWithoutBlocking > 0
      ? 1 - totalPairsWithBlocking / totalPairsWithoutBlocking
      : 0

  const avgBlockSize =
    totalBlocks > 0
      ? blockSizes.reduce((sum, s) => sum + s, 0) / totalBlocks
      : 0

  return {
    totalBlocks,
    totalPairsWithoutBlocking,
    totalPairsWithBlocking,
    reductionRatio,
    avgBlockSize,
    maxBlockSize: blockSizes.length > 0 ? Math.max(...blockSizes) : 0,
    minBlockSize: blockSizes.length > 0 ? Math.min(...blockSizes) : 0,
  }
}

/**
 * Aggregates metrics from multiple benchmark runs.
 */
export function aggregateMetrics(
  runs: ClassificationMetrics[]
): ClassificationMetrics & { stdDev: Record<string, number> } {
  if (runs.length === 0) {
    return {
      truePositives: 0,
      falsePositives: 0,
      trueNegatives: 0,
      falseNegatives: 0,
      precision: 0,
      recall: 0,
      f1Score: 0,
      accuracy: 0,
      specificity: 0,
      stdDev: {
        precision: 0,
        recall: 0,
        f1Score: 0,
        accuracy: 0,
      },
    }
  }

  const avg = (values: number[]): number =>
    values.reduce((sum, v) => sum + v, 0) / values.length

  const stdDev = (values: number[]): number => {
    const mean = avg(values)
    const squaredDiffs = values.map((v) => Math.pow(v - mean, 2))
    return Math.sqrt(avg(squaredDiffs))
  }

  const precisions = runs.map((r) => r.precision)
  const recalls = runs.map((r) => r.recall)
  const f1Scores = runs.map((r) => r.f1Score)
  const accuracies = runs.map((r) => r.accuracy)

  return {
    truePositives: Math.round(avg(runs.map((r) => r.truePositives))),
    falsePositives: Math.round(avg(runs.map((r) => r.falsePositives))),
    trueNegatives: Math.round(avg(runs.map((r) => r.trueNegatives))),
    falseNegatives: Math.round(avg(runs.map((r) => r.falseNegatives))),
    precision: avg(precisions),
    recall: avg(recalls),
    f1Score: avg(f1Scores),
    accuracy: avg(accuracies),
    specificity: avg(runs.map((r) => r.specificity)),
    stdDev: {
      precision: stdDev(precisions),
      recall: stdDev(recalls),
      f1Score: stdDev(f1Scores),
      accuracy: stdDev(accuracies),
    },
  }
}

/**
 * Creates a confusion matrix summary string.
 */
export function formatConfusionMatrix(metrics: ClassificationMetrics): string {
  const { truePositives, falsePositives, trueNegatives, falseNegatives } =
    metrics

  return `
              Predicted
              +       -
Actual  +   ${truePositives.toString().padStart(6)}  ${falseNegatives.toString().padStart(6)}
        -   ${falsePositives.toString().padStart(6)}  ${trueNegatives.toString().padStart(6)}
`.trim()
}

/**
 * Collector class for accumulating metrics during benchmark runs.
 */
export class MetricsCollector {
  private runs: ClassificationMetrics[] = []
  private throughputRuns: ThroughputMetrics[] = []
  private memoryRuns: MemoryMetrics[] = []
  private customMetrics: Record<string, number[]> = {}

  addClassificationRun(metrics: ClassificationMetrics): void {
    this.runs.push(metrics)
  }

  addThroughputRun(metrics: ThroughputMetrics): void {
    this.throughputRuns.push(metrics)
  }

  addMemoryRun(metrics: MemoryMetrics): void {
    this.memoryRuns.push(metrics)
  }

  addCustomMetric(name: string, value: number): void {
    if (!this.customMetrics[name]) {
      this.customMetrics[name] = []
    }
    this.customMetrics[name].push(value)
  }

  getAggregatedClassification(): ClassificationMetrics & {
    stdDev: Record<string, number>
  } {
    return aggregateMetrics(this.runs)
  }

  getAggregatedThroughput(): ThroughputMetrics {
    if (this.throughputRuns.length === 0) {
      return {
        totalRecords: 0,
        totalPairs: 0,
        executionTimeMs: 0,
        recordsPerSecond: 0,
        pairsPerSecond: 0,
        comparisonsPerSecond: 0,
      }
    }

    const avg = (arr: number[]) => arr.reduce((s, v) => s + v, 0) / arr.length

    return {
      totalRecords: Math.round(
        avg(this.throughputRuns.map((r) => r.totalRecords))
      ),
      totalPairs: Math.round(avg(this.throughputRuns.map((r) => r.totalPairs))),
      executionTimeMs: avg(this.throughputRuns.map((r) => r.executionTimeMs)),
      recordsPerSecond: avg(this.throughputRuns.map((r) => r.recordsPerSecond)),
      pairsPerSecond: avg(this.throughputRuns.map((r) => r.pairsPerSecond)),
      comparisonsPerSecond: avg(
        this.throughputRuns.map((r) => r.comparisonsPerSecond)
      ),
    }
  }

  getAggregatedMemory(): MemoryMetrics | undefined {
    if (this.memoryRuns.length === 0) {
      return undefined
    }

    const avg = (arr: number[]) => arr.reduce((s, v) => s + v, 0) / arr.length

    return {
      heapUsedBefore: avg(this.memoryRuns.map((r) => r.heapUsedBefore)),
      heapUsedAfter: avg(this.memoryRuns.map((r) => r.heapUsedAfter)),
      heapUsedDelta: avg(this.memoryRuns.map((r) => r.heapUsedDelta)),
      externalBefore: avg(this.memoryRuns.map((r) => r.externalBefore)),
      externalAfter: avg(this.memoryRuns.map((r) => r.externalAfter)),
      externalDelta: avg(this.memoryRuns.map((r) => r.externalDelta)),
      peakHeapUsed: this.memoryRuns.some((r) => r.peakHeapUsed !== undefined)
        ? Math.max(...this.memoryRuns.map((r) => r.peakHeapUsed ?? 0))
        : undefined,
    }
  }

  getCustomMetrics(): Record<
    string,
    { avg: number; min: number; max: number; stdDev: number }
  > {
    const result: Record<
      string,
      { avg: number; min: number; max: number; stdDev: number }
    > = {}

    for (const [name, values] of Object.entries(this.customMetrics)) {
      if (values.length === 0) continue

      const avg = values.reduce((s, v) => s + v, 0) / values.length
      const stdDev = Math.sqrt(
        values.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / values.length
      )

      result[name] = {
        avg,
        min: Math.min(...values),
        max: Math.max(...values),
        stdDev,
      }
    }

    return result
  }

  reset(): void {
    this.runs = []
    this.throughputRuns = []
    this.memoryRuns = []
    this.customMetrics = {}
  }
}
