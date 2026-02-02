/**
 * Report generation for benchmark results.
 * Generates markdown and JSON reports from benchmark data.
 */

import type { BenchmarkResult, ThresholdAnalysis } from './benchmark-runner'
import type {
  ClassificationMetrics,
  ThroughputMetrics,
  MemoryMetrics,
  BlockingMetrics,
} from './metrics-collector'
import type { DatasetMetadata } from './dataset-loader'

export interface ReportOptions {
  title: string
  description?: string
  includeTimestamp?: boolean
  includeConfig?: boolean
  includeThresholdAnalysis?: boolean
  includeMemory?: boolean
  includeBlocking?: boolean
  decimalPlaces?: number
}

export interface ComparisonReport {
  title: string
  results: BenchmarkResult[]
  summary: {
    bestF1: { name: string; value: number }
    bestPrecision: { name: string; value: number }
    bestRecall: { name: string; value: number }
    fastestThroughput: { name: string; value: number }
  }
}

/**
 * Formats a number to a fixed number of decimal places.
 */
function formatNumber(value: number, decimals: number = 4): string {
  return value.toFixed(decimals)
}

/**
 * Formats a percentage (0-1 value to percentage string).
 */
function formatPercent(value: number, decimals: number = 2): string {
  return `${(value * 100).toFixed(decimals)}%`
}

/**
 * Formats bytes to human-readable size.
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}

/**
 * Formats milliseconds to human-readable duration.
 */
function formatDuration(ms: number): string {
  if (ms < 1) return `${(ms * 1000).toFixed(2)} μs`
  if (ms < 1000) return `${ms.toFixed(2)} ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(2)} s`
  return `${(ms / 60000).toFixed(2)} min`
}

/**
 * Generates a markdown table from headers and rows.
 */
function generateTable(headers: string[], rows: string[][]): string {
  const separator = headers.map(() => '---').join(' | ')
  const headerRow = headers.join(' | ')
  const dataRows = rows.map((row) => row.join(' | ')).join('\n')

  return `| ${headerRow} |\n| ${separator} |\n${rows.map((row) => `| ${row.join(' | ')} |`).join('\n')}`
}

/**
 * Generates classification metrics section.
 */
function generateClassificationSection(
  metrics: ClassificationMetrics & { stdDev?: Record<string, number> },
  decimals: number
): string {
  const lines: string[] = [
    '### Classification Metrics',
    '',
    '| Metric | Value |',
    '| --- | --- |',
    `| Precision | ${formatPercent(metrics.precision)} |`,
    `| Recall | ${formatPercent(metrics.recall)} |`,
    `| F1 Score | ${formatPercent(metrics.f1Score)} |`,
    `| Accuracy | ${formatPercent(metrics.accuracy)} |`,
    `| Specificity | ${formatPercent(metrics.specificity)} |`,
    '',
    '#### Confusion Matrix',
    '',
    '|  | Predicted Positive | Predicted Negative |',
    '| --- | --- | --- |',
    `| Actual Positive | ${metrics.truePositives} (TP) | ${metrics.falseNegatives} (FN) |`,
    `| Actual Negative | ${metrics.falsePositives} (FP) | ${metrics.trueNegatives} (TN) |`,
  ]

  if (metrics.stdDev) {
    lines.push('')
    lines.push('#### Standard Deviation (across runs)')
    lines.push('')
    lines.push('| Metric | Std Dev |')
    lines.push('| --- | --- |')
    lines.push(
      `| Precision | ${formatPercent(metrics.stdDev.precision ?? 0)} |`
    )
    lines.push(`| Recall | ${formatPercent(metrics.stdDev.recall ?? 0)} |`)
    lines.push(`| F1 Score | ${formatPercent(metrics.stdDev.f1Score ?? 0)} |`)
    lines.push(`| Accuracy | ${formatPercent(metrics.stdDev.accuracy ?? 0)} |`)
  }

  return lines.join('\n')
}

/**
 * Generates throughput metrics section.
 */
function generateThroughputSection(metrics: ThroughputMetrics): string {
  return [
    '### Throughput Metrics',
    '',
    '| Metric | Value |',
    '| --- | --- |',
    `| Total Records | ${metrics.totalRecords.toLocaleString()} |`,
    `| Total Pairs Compared | ${metrics.totalPairs.toLocaleString()} |`,
    `| Execution Time | ${formatDuration(metrics.executionTimeMs)} |`,
    `| Records/Second | ${metrics.recordsPerSecond.toLocaleString(undefined, { maximumFractionDigits: 0 })} |`,
    `| Pairs/Second | ${metrics.pairsPerSecond.toLocaleString(undefined, { maximumFractionDigits: 0 })} |`,
  ].join('\n')
}

/**
 * Generates memory metrics section.
 */
function generateMemorySection(metrics: MemoryMetrics): string {
  return [
    '### Memory Metrics',
    '',
    '| Metric | Value |',
    '| --- | --- |',
    `| Heap Used (Before) | ${formatBytes(metrics.heapUsedBefore)} |`,
    `| Heap Used (After) | ${formatBytes(metrics.heapUsedAfter)} |`,
    `| Heap Delta | ${formatBytes(metrics.heapUsedDelta)} |`,
    ...(metrics.peakHeapUsed !== undefined
      ? [`| Peak Heap Used | ${formatBytes(metrics.peakHeapUsed)} |`]
      : []),
  ].join('\n')
}

/**
 * Generates blocking metrics section.
 */
function generateBlockingSection(metrics: BlockingMetrics): string {
  return [
    '### Blocking Metrics',
    '',
    '| Metric | Value |',
    '| --- | --- |',
    `| Total Blocks | ${metrics.totalBlocks.toLocaleString()} |`,
    `| Pairs Without Blocking | ${metrics.totalPairsWithoutBlocking.toLocaleString()} |`,
    `| Pairs With Blocking | ${metrics.totalPairsWithBlocking.toLocaleString()} |`,
    `| Reduction Ratio | ${formatPercent(metrics.reductionRatio)} |`,
    `| Average Block Size | ${metrics.avgBlockSize.toFixed(2)} |`,
    `| Min Block Size | ${metrics.minBlockSize} |`,
    `| Max Block Size | ${metrics.maxBlockSize} |`,
  ].join('\n')
}

/**
 * Generates threshold analysis section.
 */
function generateThresholdSection(analysis: ThresholdAnalysis): string {
  const lines: string[] = [
    '### Threshold Analysis',
    '',
    `**Optimal Threshold:** ${analysis.optimalThreshold.toFixed(2)}`,
    '',
    `At optimal threshold:`,
    `- Precision: ${formatPercent(analysis.optimalMetrics.precision)}`,
    `- Recall: ${formatPercent(analysis.optimalMetrics.recall)}`,
    `- F1 Score: ${formatPercent(analysis.optimalMetrics.f1Score)}`,
    '',
    '#### Metrics at Different Thresholds',
    '',
    '| Threshold | Precision | Recall | F1 Score |',
    '| --- | --- | --- | --- |',
  ]

  for (const { threshold, metrics } of analysis.metricsAtThresholds) {
    lines.push(
      `| ${threshold.toFixed(2)} | ${formatPercent(metrics.precision)} | ${formatPercent(metrics.recall)} | ${formatPercent(metrics.f1Score)} |`
    )
  }

  return lines.join('\n')
}

/**
 * Generates a markdown report from a single benchmark result.
 */
export function generateMarkdownReport(
  result: BenchmarkResult,
  options: ReportOptions = { title: result.name }
): string {
  const {
    title,
    description,
    includeTimestamp = true,
    includeConfig = false,
    includeThresholdAnalysis = true,
    includeMemory = true,
    includeBlocking = true,
    decimalPlaces = 4,
  } = options

  const sections: string[] = [`# ${title}`]

  if (description || result.description) {
    sections.push('', description || result.description || '')
  }

  if (includeTimestamp) {
    sections.push('', `*Generated: ${result.timestamp}*`)
  }

  if (!result.success) {
    sections.push('', '## ⚠️ Benchmark Failed', '')
    sections.push('Errors:', '')
    for (const error of result.errors) {
      sections.push(`- ${error}`)
    }
    return sections.join('\n')
  }

  if (includeConfig) {
    sections.push(
      '',
      '## Configuration',
      '',
      '| Setting | Value |',
      '| --- | --- |',
      `| Warmup Runs | ${result.config.warmupRuns} |`,
      `| Measurement Runs | ${result.config.measurementRuns} |`,
      `| Collect Memory | ${result.config.collectMemory} |`
    )
  }

  sections.push('', '## Results')

  if (result.classification) {
    sections.push(
      '',
      generateClassificationSection(result.classification, decimalPlaces)
    )
  }

  if (result.throughput) {
    sections.push('', generateThroughputSection(result.throughput))
  }

  if (includeBlocking && result.blocking) {
    sections.push('', generateBlockingSection(result.blocking))
  }

  if (includeMemory && result.memory) {
    sections.push('', generateMemorySection(result.memory))
  }

  if (includeThresholdAnalysis && result.thresholdAnalysis) {
    sections.push('', generateThresholdSection(result.thresholdAnalysis))
  }

  if (Object.keys(result.custom).length > 0) {
    sections.push(
      '',
      '### Custom Metrics',
      '',
      '| Metric | Value |',
      '| --- | --- |'
    )
    for (const [key, value] of Object.entries(result.custom)) {
      sections.push(`| ${key} | ${value} |`)
    }
  }

  return sections.join('\n')
}

/**
 * Generates a JSON report from a benchmark result.
 */
export function generateJSONReport(result: BenchmarkResult): string {
  return JSON.stringify(result, null, 2)
}

/**
 * Generates a comparison report from multiple benchmark results.
 */
export function generateComparisonReport(
  title: string,
  results: BenchmarkResult[],
  options: Partial<ReportOptions> = {}
): string {
  const { includeTimestamp = true, decimalPlaces = 4 } = options

  const sections: string[] = [`# ${title}`]

  if (includeTimestamp) {
    sections.push('', `*Generated: ${new Date().toISOString()}*`)
  }

  const successfulResults = results.filter((r) => r.success)
  const failedResults = results.filter((r) => !r.success)

  if (failedResults.length > 0) {
    sections.push('', '## Failed Benchmarks')
    for (const result of failedResults) {
      sections.push('', `### ${result.name}`, '')
      for (const error of result.errors) {
        sections.push(`- ${error}`)
      }
    }
  }

  if (successfulResults.length === 0) {
    sections.push('', 'No successful benchmarks to compare.')
    return sections.join('\n')
  }

  sections.push('', '## Summary Comparison', '')

  const hasClassification = successfulResults.some((r) => r.classification)
  const hasThroughput = successfulResults.some((r) => r.throughput)
  const hasBlocking = successfulResults.some((r) => r.blocking)

  if (hasClassification) {
    sections.push('### Classification Metrics', '')

    const headers = ['Benchmark', 'Precision', 'Recall', 'F1 Score', 'Accuracy']
    const rows: string[][] = []

    for (const result of successfulResults) {
      if (result.classification) {
        rows.push([
          result.name,
          formatPercent(result.classification.precision),
          formatPercent(result.classification.recall),
          formatPercent(result.classification.f1Score),
          formatPercent(result.classification.accuracy),
        ])
      }
    }

    sections.push(generateTable(headers, rows))
  }

  if (hasThroughput) {
    sections.push('', '### Throughput Metrics', '')

    const headers = ['Benchmark', 'Records', 'Pairs', 'Time', 'Pairs/sec']
    const rows: string[][] = []

    for (const result of successfulResults) {
      if (result.throughput) {
        rows.push([
          result.name,
          result.throughput.totalRecords.toLocaleString(),
          result.throughput.totalPairs.toLocaleString(),
          formatDuration(result.throughput.executionTimeMs),
          result.throughput.pairsPerSecond.toLocaleString(undefined, {
            maximumFractionDigits: 0,
          }),
        ])
      }
    }

    sections.push(generateTable(headers, rows))
  }

  if (hasBlocking) {
    sections.push('', '### Blocking Effectiveness', '')

    const headers = ['Benchmark', 'Blocks', 'Pairs (Blocked)', 'Reduction']
    const rows: string[][] = []

    for (const result of successfulResults) {
      if (result.blocking) {
        rows.push([
          result.name,
          result.blocking.totalBlocks.toLocaleString(),
          result.blocking.totalPairsWithBlocking.toLocaleString(),
          formatPercent(result.blocking.reductionRatio),
        ])
      }
    }

    sections.push(generateTable(headers, rows))
  }

  sections.push('', '## Best Results', '')

  const bestF1 = successfulResults.reduce(
    (best, r) =>
      r.classification && r.classification.f1Score > (best.value ?? 0)
        ? { name: r.name, value: r.classification.f1Score }
        : best,
    { name: '', value: 0 }
  )

  const bestPrecision = successfulResults.reduce(
    (best, r) =>
      r.classification && r.classification.precision > (best.value ?? 0)
        ? { name: r.name, value: r.classification.precision }
        : best,
    { name: '', value: 0 }
  )

  const bestRecall = successfulResults.reduce(
    (best, r) =>
      r.classification && r.classification.recall > (best.value ?? 0)
        ? { name: r.name, value: r.classification.recall }
        : best,
    { name: '', value: 0 }
  )

  const fastestThroughput = successfulResults.reduce(
    (best, r) =>
      r.throughput && r.throughput.pairsPerSecond > (best.value ?? 0)
        ? { name: r.name, value: r.throughput.pairsPerSecond }
        : best,
    { name: '', value: 0 }
  )

  sections.push(
    `- **Best F1 Score:** ${bestF1.name} (${formatPercent(bestF1.value)})`,
    `- **Best Precision:** ${bestPrecision.name} (${formatPercent(bestPrecision.value)})`,
    `- **Best Recall:** ${bestRecall.name} (${formatPercent(bestRecall.value)})`,
    `- **Fastest Throughput:** ${fastestThroughput.name} (${fastestThroughput.value.toLocaleString(undefined, { maximumFractionDigits: 0 })} pairs/sec)`
  )

  return sections.join('\n')
}

/**
 * Generates a scalability report showing performance at different dataset sizes.
 */
export function generateScalabilityReport(
  title: string,
  results: Array<{ size: number; result: BenchmarkResult }>,
  options: Partial<ReportOptions> = {}
): string {
  const { includeTimestamp = true } = options

  const sections: string[] = [`# ${title}`]

  if (includeTimestamp) {
    sections.push('', `*Generated: ${new Date().toISOString()}*`)
  }

  sections.push('', '## Scalability Analysis', '')

  const headers = ['Records', 'Pairs', 'Time', 'Records/sec', 'Pairs/sec']
  const rows: string[][] = []

  for (const { size, result } of results) {
    if (result.throughput) {
      rows.push([
        size.toLocaleString(),
        result.throughput.totalPairs.toLocaleString(),
        formatDuration(result.throughput.executionTimeMs),
        result.throughput.recordsPerSecond.toLocaleString(undefined, {
          maximumFractionDigits: 0,
        }),
        result.throughput.pairsPerSecond.toLocaleString(undefined, {
          maximumFractionDigits: 0,
        }),
      ])
    }
  }

  sections.push(generateTable(headers, rows))

  const hasBlocking = results.some((r) => r.result.blocking)
  if (hasBlocking) {
    sections.push('', '### Blocking Effectiveness at Scale', '')

    const blockHeaders = [
      'Records',
      'Pairs (No Block)',
      'Pairs (Blocked)',
      'Reduction',
    ]
    const blockRows: string[][] = []

    for (const { size, result } of results) {
      if (result.blocking) {
        blockRows.push([
          size.toLocaleString(),
          result.blocking.totalPairsWithoutBlocking.toLocaleString(),
          result.blocking.totalPairsWithBlocking.toLocaleString(),
          formatPercent(result.blocking.reductionRatio),
        ])
      }
    }

    sections.push(generateTable(blockHeaders, blockRows))
  }

  sections.push('', '## Complexity Analysis', '')

  if (results.length >= 2) {
    const first = results[0]
    const last = results[results.length - 1]

    if (first.result.throughput && last.result.throughput) {
      const sizeRatio = last.size / first.size
      const timeRatio =
        last.result.throughput.executionTimeMs /
        first.result.throughput.executionTimeMs

      const complexityEstimate = Math.log(timeRatio) / Math.log(sizeRatio)

      sections.push(
        `Based on the benchmark results, the algorithm appears to have approximately **O(n^${complexityEstimate.toFixed(2)})** complexity.`,
        '',
        `- Size increased by ${sizeRatio.toFixed(1)}x`,
        `- Time increased by ${timeRatio.toFixed(1)}x`
      )
    }
  }

  return sections.join('\n')
}

/**
 * Generates a dataset summary section.
 */
export function generateDatasetSummary(metadata: DatasetMetadata): string {
  return [
    '## Dataset Summary',
    '',
    '| Property | Value |',
    '| --- | --- |',
    `| Records | ${metadata.recordCount.toLocaleString()} |`,
    `| Fields | ${metadata.fieldCount} |`,
    `| True Pairs | ${metadata.truePairCount?.toLocaleString() ?? 'N/A'} |`,
    `| Format | ${metadata.format} |`,
    `| Load Time | ${formatDuration(metadata.loadTimeMs)} |`,
    '',
    '### Fields',
    '',
    metadata.fields.map((f) => `- ${f}`).join('\n'),
  ].join('\n')
}
