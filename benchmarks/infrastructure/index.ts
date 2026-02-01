/**
 * Benchmark infrastructure for have-we-met.
 * Provides utilities for loading datasets, running benchmarks, collecting metrics, and generating reports.
 */

export {
  // Dataset loading
  parseCSV,
  parseJSON,
  parseFebrl,
  parsePairsFile,
  loadDataset,
  createLoadedDataset,
  generateAllPairs,
  createPairLookup,
  isPairMatch,
  type DatasetRecord,
  type LabeledPair,
  type LoadedDataset,
  type DatasetMetadata,
  type CSVParseOptions,
  type JSONParseOptions,
  type FebrlParseOptions,
} from './dataset-loader'

export {
  // Metrics collection
  calculateClassificationMetrics,
  calculateMetricsAtThresholds,
  findOptimalThreshold,
  calculateThroughputMetrics,
  captureMemoryUsage,
  calculateMemoryMetrics,
  calculateBlockingMetrics,
  aggregateMetrics,
  formatConfusionMatrix,
  MetricsCollector,
  type ClassificationMetrics,
  type ThroughputMetrics,
  type MemoryMetrics,
  type BenchmarkMetrics,
  type BlockingMetrics,
  type PredictedPair,
  type TruePair,
} from './metrics-collector'

export {
  // Benchmark execution
  runBenchmark,
  runBenchmarkSuite,
  runComparisonBenchmark,
  runScalabilityBenchmark,
  createMatchingFunction,
  type BenchmarkConfig,
  type BenchmarkResult,
  type ThresholdAnalysis,
  type MatchingFunction,
  type BlockingFunction,
  type BenchmarkRunOptions,
} from './benchmark-runner'

export {
  // Report generation
  generateMarkdownReport,
  generateJSONReport,
  generateComparisonReport,
  generateScalabilityReport,
  generateDatasetSummary,
  type ReportOptions,
  type ComparisonReport,
} from './report-generator'
