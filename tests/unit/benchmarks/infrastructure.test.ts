import { describe, it, expect, beforeEach } from 'vitest'
import {
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
  // Benchmark execution
  runBenchmark,
  createMatchingFunction,
  // Report generation
  generateMarkdownReport,
  generateJSONReport,
  generateComparisonReport,
  generateScalabilityReport,
  generateDatasetSummary,
} from '../../../benchmarks/infrastructure'
import type {
  DatasetRecord,
  ClassificationMetrics,
  PredictedPair,
  TruePair,
  BenchmarkResult,
} from '../../../benchmarks/infrastructure'

describe('Dataset Loading', () => {
  describe('parseCSV', () => {
    it('should parse CSV with header', () => {
      const csv = `id,name,email
1,John,john@example.com
2,Jane,jane@example.com`

      const records = parseCSV(csv)

      expect(records).toHaveLength(2)
      expect(records[0]).toEqual({
        id: '1',
        name: 'John',
        email: 'john@example.com',
      })
      expect(records[1]).toEqual({
        id: '2',
        name: 'Jane',
        email: 'jane@example.com',
      })
    })

    it('should parse CSV without header', () => {
      const csv = `1,John,john@example.com
2,Jane,jane@example.com`

      const records = parseCSV(csv, { hasHeader: false })

      expect(records).toHaveLength(2)
      expect(records[0]).toHaveProperty('field_0', '1')
      expect(records[0]).toHaveProperty('field_1', 'John')
    })

    it('should parse CSV with custom delimiter', () => {
      const csv = `id;name;email
1;John;john@example.com`

      const records = parseCSV(csv, { delimiter: ';' })

      expect(records).toHaveLength(1)
      expect(records[0]).toEqual({
        id: '1',
        name: 'John',
        email: 'john@example.com',
      })
    })

    it('should handle quoted fields', () => {
      const csv = `id,name,address
1,"John Smith","123 Main St, Apt 4"`

      const records = parseCSV(csv)

      expect(records[0]).toEqual({
        id: '1',
        name: 'John Smith',
        address: '123 Main St, Apt 4',
      })
    })

    it('should handle escaped quotes', () => {
      const csv = `id,name,quote
1,John,"He said ""Hello"""`

      const records = parseCSV(csv)

      expect(records[0].quote).toBe('He said "Hello"')
    })

    it('should auto-generate IDs when missing', () => {
      const csv = `name,email
John,john@example.com
Jane,jane@example.com`

      const records = parseCSV(csv)

      expect(records[0].id).toBe(1)
      expect(records[1].id).toBe(2)
    })

    it('should skip rows when configured', () => {
      const csv = `Comment line
id,name
1,John`

      const records = parseCSV(csv, { skipRows: 1 })

      expect(records).toHaveLength(1)
      expect(records[0]).toEqual({ id: '1', name: 'John' })
    })

    it('should handle empty input', () => {
      const records = parseCSV('')
      expect(records).toHaveLength(0)
    })

    it('should use custom header row', () => {
      const csv = `1,John,john@example.com`

      const records = parseCSV(csv, {
        hasHeader: false,
        headerRow: ['user_id', 'full_name', 'email_address'],
      })

      expect(records[0]).toEqual({
        user_id: '1',
        full_name: 'John',
        email_address: 'john@example.com',
        id: 1,
      })
    })
  })

  describe('parseJSON', () => {
    it('should parse JSON array', () => {
      const json = JSON.stringify([
        { id: 1, name: 'John' },
        { id: 2, name: 'Jane' },
      ])

      const { records } = parseJSON(json)

      expect(records).toHaveLength(2)
      expect(records[0]).toEqual({ id: 1, name: 'John' })
    })

    it('should parse JSON object with records field', () => {
      const json = JSON.stringify({
        records: [
          { id: 1, name: 'John' },
          { id: 2, name: 'Jane' },
        ],
        metadata: { count: 2 },
      })

      const { records } = parseJSON(json)

      expect(records).toHaveLength(2)
    })

    it('should parse records from nested path', () => {
      const json = JSON.stringify({
        data: {
          people: [
            { id: 1, name: 'John' },
            { id: 2, name: 'Jane' },
          ],
        },
      })

      const { records } = parseJSON(json, { recordsPath: 'data.people' })

      expect(records).toHaveLength(2)
    })

    it('should parse pairs from JSON', () => {
      const json = JSON.stringify({
        records: [{ id: 1 }, { id: 2 }],
        pairs: [{ id1: 1, id2: 2, isMatch: true }],
      })

      const { records, pairs } = parseJSON(json)

      expect(records).toHaveLength(2)
      expect(pairs).toHaveLength(1)
      expect(pairs![0]).toEqual({ id1: 1, id2: 2, isMatch: true })
    })

    it('should auto-generate IDs when missing', () => {
      const json = JSON.stringify([{ name: 'John' }, { name: 'Jane' }])

      const { records } = parseJSON(json)

      expect(records[0].id).toBe(1)
      expect(records[1].id).toBe(2)
    })
  })

  describe('parseFebrl', () => {
    it('should parse Febrl format with duplicates', () => {
      const csv = `rec_id,given_name,surname,org_rec
rec-0-org,John,Smith,
rec-0-dup-0,Jon,Smith,rec-0-org
rec-1-org,Jane,Doe,`

      const { records, pairs } = parseFebrl(csv)

      expect(records).toHaveLength(3)
      expect(pairs).toHaveLength(1)
      expect(pairs[0]).toEqual({
        id1: 'rec-0-org',
        id2: 'rec-0-dup-0',
        isMatch: true,
      })
    })

    it('should set id from rec_id field', () => {
      const csv = `rec_id,name
rec-123,John`

      const { records } = parseFebrl(csv)

      expect(records[0].id).toBe('rec-123')
    })

    it('should optionally exclude org_rec field', () => {
      const csv = `rec_id,name,org_rec
rec-0-org,John,`

      const { records } = parseFebrl(csv, { includeOriginalId: false })

      expect(records[0]).not.toHaveProperty('org_rec')
    })
  })

  describe('parsePairsFile', () => {
    it('should parse pairs file with header', () => {
      const content = `id1,id2
1,2
3,4`

      const pairs = parsePairsFile(content)

      expect(pairs).toHaveLength(2)
      expect(pairs[0]).toEqual({ id1: '1', id2: '2', isMatch: true })
    })

    it('should parse pairs file with match column', () => {
      const content = `id1,id2,match
1,2,true
3,4,false`

      const pairs = parsePairsFile(content)

      expect(pairs[0].isMatch).toBe(true)
      expect(pairs[1].isMatch).toBe(false)
    })

    it('should parse pairs file without header', () => {
      const content = `1,2
3,4`

      const pairs = parsePairsFile(content, { hasHeader: false })

      expect(pairs).toHaveLength(2)
    })
  })

  describe('loadDataset', () => {
    it('should load CSV dataset', () => {
      const csv = `id,name
1,John
2,Jane`

      const dataset = loadDataset('test', csv, 'csv')

      expect(dataset.name).toBe('test')
      expect(dataset.records).toHaveLength(2)
      expect(dataset.metadata.recordCount).toBe(2)
      expect(dataset.metadata.format).toBe('csv')
      expect(dataset.metadata.loadTimeMs).toBeGreaterThanOrEqual(0)
    })

    it('should load JSON dataset', () => {
      const json = JSON.stringify([{ id: 1 }, { id: 2 }])

      const dataset = loadDataset('test', json, 'json')

      expect(dataset.records).toHaveLength(2)
      expect(dataset.metadata.format).toBe('json')
    })

    it('should load Febrl dataset', () => {
      const csv = `rec_id,name,org_rec
rec-0-org,John,
rec-0-dup,Jon,rec-0-org`

      const dataset = loadDataset('test', csv, 'febrl')

      expect(dataset.records).toHaveLength(2)
      expect(dataset.truePairs).toHaveLength(1)
      expect(dataset.metadata.format).toBe('febrl')
    })

    it('should throw on unsupported format', () => {
      expect(() => loadDataset('test', '', 'xml' as 'csv')).toThrow(
        'Unsupported format'
      )
    })
  })

  describe('createLoadedDataset', () => {
    it('should create dataset with correct metadata', () => {
      const records = [
        { id: 1, name: 'John', email: 'john@example.com' },
        { id: 2, name: 'Jane', email: 'jane@example.com' },
      ]
      const pairs = [{ id1: 1, id2: 2, isMatch: true }]

      const dataset = createLoadedDataset('test', records, pairs, 'csv', 10)

      expect(dataset.name).toBe('test')
      expect(dataset.records).toBe(records)
      expect(dataset.truePairs).toBe(pairs)
      expect(dataset.metadata.recordCount).toBe(2)
      expect(dataset.metadata.fieldCount).toBe(3)
      expect(dataset.metadata.fields).toEqual(['id', 'name', 'email'])
      expect(dataset.metadata.truePairCount).toBe(1)
      expect(dataset.metadata.loadTimeMs).toBe(10)
    })
  })

  describe('generateAllPairs', () => {
    it('should generate all pairs from records', () => {
      const records = [
        { id: 1, name: 'A' },
        { id: 2, name: 'B' },
        { id: 3, name: 'C' },
      ]

      const pairs = generateAllPairs(records)

      expect(pairs).toHaveLength(3) // 3*(3-1)/2 = 3
      expect(pairs).toContainEqual([records[0], records[1]])
      expect(pairs).toContainEqual([records[0], records[2]])
      expect(pairs).toContainEqual([records[1], records[2]])
    })

    it('should handle empty records', () => {
      const pairs = generateAllPairs([])
      expect(pairs).toHaveLength(0)
    })

    it('should handle single record', () => {
      const pairs = generateAllPairs([{ id: 1 }])
      expect(pairs).toHaveLength(0)
    })
  })

  describe('createPairLookup and isPairMatch', () => {
    it('should create lookup set from pairs', () => {
      const pairs = [
        { id1: 1, id2: 2, isMatch: true },
        { id1: 3, id2: 4, isMatch: true },
      ]

      const lookup = createPairLookup(pairs)

      expect(lookup.has('1|2')).toBe(true)
      expect(lookup.has('2|1')).toBe(true)
      expect(lookup.has('3|4')).toBe(true)
      expect(lookup.has('1|3')).toBe(false)
    })

    it('should exclude non-match pairs', () => {
      const pairs = [
        { id1: 1, id2: 2, isMatch: true },
        { id1: 3, id2: 4, isMatch: false },
      ]

      const lookup = createPairLookup(pairs)

      expect(lookup.has('1|2')).toBe(true)
      expect(lookup.has('3|4')).toBe(false)
    })

    it('should check if pair is match', () => {
      const lookup = createPairLookup([{ id1: 1, id2: 2, isMatch: true }])

      expect(isPairMatch(1, 2, lookup)).toBe(true)
      expect(isPairMatch(2, 1, lookup)).toBe(true)
      expect(isPairMatch(1, 3, lookup)).toBe(false)
    })
  })
})

describe('Metrics Collection', () => {
  describe('calculateClassificationMetrics', () => {
    it('should calculate perfect classifier metrics', () => {
      const predicted: PredictedPair[] = [
        { id1: 1, id2: 2, score: 0.9, predicted: true },
        { id1: 3, id2: 4, score: 0.1, predicted: false },
      ]
      const truth: TruePair[] = [
        { id1: 1, id2: 2, isMatch: true },
        { id1: 3, id2: 4, isMatch: false },
      ]

      const metrics = calculateClassificationMetrics(predicted, truth, 2)

      expect(metrics.truePositives).toBe(1)
      expect(metrics.trueNegatives).toBe(1)
      expect(metrics.falsePositives).toBe(0)
      expect(metrics.falseNegatives).toBe(0)
      expect(metrics.precision).toBe(1)
      expect(metrics.recall).toBe(1)
      expect(metrics.f1Score).toBe(1)
      expect(metrics.accuracy).toBe(1)
    })

    it('should calculate metrics with false positives', () => {
      const predicted: PredictedPair[] = [
        { id1: 1, id2: 2, score: 0.9, predicted: true },
        { id1: 3, id2: 4, score: 0.8, predicted: true }, // False positive
      ]
      const truth: TruePair[] = [
        { id1: 1, id2: 2, isMatch: true },
        { id1: 3, id2: 4, isMatch: false },
      ]

      const metrics = calculateClassificationMetrics(predicted, truth, 2)

      expect(metrics.truePositives).toBe(1)
      expect(metrics.falsePositives).toBe(1)
      expect(metrics.precision).toBe(0.5)
      expect(metrics.recall).toBe(1)
    })

    it('should calculate metrics with false negatives', () => {
      const predicted: PredictedPair[] = [
        { id1: 1, id2: 2, score: 0.3, predicted: false }, // False negative
        { id1: 3, id2: 4, score: 0.1, predicted: false },
      ]
      const truth: TruePair[] = [
        { id1: 1, id2: 2, isMatch: true },
        { id1: 3, id2: 4, isMatch: false },
      ]

      const metrics = calculateClassificationMetrics(predicted, truth, 2)

      expect(metrics.truePositives).toBe(0)
      expect(metrics.falseNegatives).toBe(1)
      expect(metrics.precision).toBe(0)
      expect(metrics.recall).toBe(0)
    })

    it('should handle empty predictions', () => {
      const metrics = calculateClassificationMetrics([], [], 0)

      expect(metrics.precision).toBe(0)
      expect(metrics.recall).toBe(0)
      expect(metrics.f1Score).toBe(0)
    })
  })

  describe('calculateMetricsAtThresholds', () => {
    it('should calculate metrics at multiple thresholds', () => {
      const predicted = [
        { id1: 1, id2: 2, score: 0.9 },
        { id1: 3, id2: 4, score: 0.6 },
        { id1: 5, id2: 6, score: 0.3 },
      ]
      const truth: TruePair[] = [
        { id1: 1, id2: 2, isMatch: true },
        { id1: 3, id2: 4, isMatch: true },
      ]

      const results = calculateMetricsAtThresholds(predicted, truth, [0.5, 0.8])

      expect(results.get(0.5)).toBeDefined()
      expect(results.get(0.8)).toBeDefined()

      const at05 = results.get(0.5)!
      expect(at05.truePositives).toBe(2) // 1-2 and 3-4 above 0.5
      expect(at05.falsePositives).toBe(0)

      const at08 = results.get(0.8)!
      expect(at08.truePositives).toBe(1) // Only 1-2 above 0.8
      expect(at08.falseNegatives).toBe(1)
    })
  })

  describe('findOptimalThreshold', () => {
    it('should find threshold that maximizes F1', () => {
      const predicted = [
        { id1: 1, id2: 2, score: 0.9 },
        { id1: 3, id2: 4, score: 0.7 },
        { id1: 5, id2: 6, score: 0.3 },
      ]
      const truth: TruePair[] = [
        { id1: 1, id2: 2, isMatch: true },
        { id1: 3, id2: 4, isMatch: true },
        { id1: 5, id2: 6, isMatch: false },
      ]

      const { threshold, metrics } = findOptimalThreshold(
        predicted,
        truth,
        0,
        1,
        0.1
      )

      expect(threshold).toBeLessThanOrEqual(0.7)
      expect(metrics.f1Score).toBeGreaterThan(0)
    })
  })

  describe('calculateThroughputMetrics', () => {
    it('should calculate throughput metrics', () => {
      const metrics = calculateThroughputMetrics(1000, 499500, 5000)

      expect(metrics.totalRecords).toBe(1000)
      expect(metrics.totalPairs).toBe(499500)
      expect(metrics.executionTimeMs).toBe(5000)
      expect(metrics.recordsPerSecond).toBe(200)
      expect(metrics.pairsPerSecond).toBe(99900)
    })

    it('should handle zero execution time', () => {
      const metrics = calculateThroughputMetrics(100, 100, 0)

      expect(metrics.recordsPerSecond).toBe(0)
      expect(metrics.pairsPerSecond).toBe(0)
    })
  })

  describe('memory metrics', () => {
    it('should capture memory usage', () => {
      const memory = captureMemoryUsage()

      expect(memory.heapUsed).toBeGreaterThanOrEqual(0)
      expect(memory.external).toBeGreaterThanOrEqual(0)
    })

    it('should calculate memory metrics', () => {
      const before = { heapUsed: 1000000, external: 50000 }
      const after = { heapUsed: 2000000, external: 60000 }

      const metrics = calculateMemoryMetrics(before, after, 2500000)

      expect(metrics.heapUsedBefore).toBe(1000000)
      expect(metrics.heapUsedAfter).toBe(2000000)
      expect(metrics.heapUsedDelta).toBe(1000000)
      expect(metrics.externalDelta).toBe(10000)
      expect(metrics.peakHeapUsed).toBe(2500000)
    })
  })

  describe('calculateBlockingMetrics', () => {
    it('should calculate blocking effectiveness', () => {
      const blocks = new Map<string, number[]>([
        ['A', [1, 2, 3]],
        ['B', [4, 5]],
        ['C', [6]],
      ])

      const metrics = calculateBlockingMetrics(blocks, 6)

      expect(metrics.totalBlocks).toBe(3)
      expect(metrics.totalPairsWithoutBlocking).toBe(15) // 6*5/2
      expect(metrics.totalPairsWithBlocking).toBe(4) // 3+1+0
      expect(metrics.reductionRatio).toBeCloseTo(1 - 4 / 15)
      expect(metrics.avgBlockSize).toBe(2)
      expect(metrics.minBlockSize).toBe(1)
      expect(metrics.maxBlockSize).toBe(3)
    })

    it('should handle empty blocks', () => {
      const metrics = calculateBlockingMetrics(new Map(), 0)

      expect(metrics.totalBlocks).toBe(0)
      expect(metrics.reductionRatio).toBe(0)
    })
  })

  describe('aggregateMetrics', () => {
    it('should aggregate multiple runs', () => {
      const runs: ClassificationMetrics[] = [
        {
          truePositives: 10,
          falsePositives: 2,
          trueNegatives: 88,
          falseNegatives: 0,
          precision: 0.833,
          recall: 1.0,
          f1Score: 0.909,
          accuracy: 0.98,
          specificity: 0.978,
        },
        {
          truePositives: 9,
          falsePositives: 3,
          trueNegatives: 87,
          falseNegatives: 1,
          precision: 0.75,
          recall: 0.9,
          f1Score: 0.818,
          accuracy: 0.96,
          specificity: 0.967,
        },
      ]

      const aggregated = aggregateMetrics(runs)

      expect(aggregated.precision).toBeCloseTo(0.7915)
      expect(aggregated.recall).toBeCloseTo(0.95)
      expect(aggregated.stdDev.precision).toBeGreaterThan(0)
      expect(aggregated.stdDev.recall).toBeGreaterThan(0)
    })

    it('should handle empty runs', () => {
      const aggregated = aggregateMetrics([])

      expect(aggregated.precision).toBe(0)
      expect(aggregated.recall).toBe(0)
    })
  })

  describe('formatConfusionMatrix', () => {
    it('should format confusion matrix as string', () => {
      const metrics: ClassificationMetrics = {
        truePositives: 10,
        falsePositives: 2,
        trueNegatives: 85,
        falseNegatives: 3,
        precision: 0.833,
        recall: 0.769,
        f1Score: 0.8,
        accuracy: 0.95,
        specificity: 0.977,
      }

      const matrix = formatConfusionMatrix(metrics)

      expect(matrix).toContain('10')
      expect(matrix).toContain('2')
      expect(matrix).toContain('85')
      expect(matrix).toContain('3')
    })
  })

  describe('MetricsCollector', () => {
    let collector: InstanceType<typeof MetricsCollector>

    beforeEach(() => {
      collector = new MetricsCollector()
    })

    it('should collect and aggregate classification metrics', () => {
      collector.addClassificationRun({
        truePositives: 10,
        falsePositives: 2,
        trueNegatives: 88,
        falseNegatives: 0,
        precision: 0.833,
        recall: 1.0,
        f1Score: 0.909,
        accuracy: 0.98,
        specificity: 0.978,
      })

      collector.addClassificationRun({
        truePositives: 9,
        falsePositives: 3,
        trueNegatives: 87,
        falseNegatives: 1,
        precision: 0.75,
        recall: 0.9,
        f1Score: 0.818,
        accuracy: 0.96,
        specificity: 0.967,
      })

      const aggregated = collector.getAggregatedClassification()

      expect(aggregated.precision).toBeCloseTo(0.7915)
      expect(aggregated.stdDev).toBeDefined()
    })

    it('should collect and aggregate throughput metrics', () => {
      collector.addThroughputRun({
        totalRecords: 1000,
        totalPairs: 499500,
        executionTimeMs: 5000,
        recordsPerSecond: 200,
        pairsPerSecond: 99900,
        comparisonsPerSecond: 99900,
      })

      collector.addThroughputRun({
        totalRecords: 1000,
        totalPairs: 499500,
        executionTimeMs: 4000,
        recordsPerSecond: 250,
        pairsPerSecond: 124875,
        comparisonsPerSecond: 124875,
      })

      const aggregated = collector.getAggregatedThroughput()

      expect(aggregated.executionTimeMs).toBe(4500)
      expect(aggregated.pairsPerSecond).toBeCloseTo(112387.5)
    })

    it('should collect custom metrics', () => {
      collector.addCustomMetric('blockSize', 10)
      collector.addCustomMetric('blockSize', 20)
      collector.addCustomMetric('blockSize', 15)

      const custom = collector.getCustomMetrics()

      expect(custom.blockSize.avg).toBe(15)
      expect(custom.blockSize.min).toBe(10)
      expect(custom.blockSize.max).toBe(20)
    })

    it('should reset all metrics', () => {
      collector.addClassificationRun({
        truePositives: 10,
        falsePositives: 0,
        trueNegatives: 90,
        falseNegatives: 0,
        precision: 1,
        recall: 1,
        f1Score: 1,
        accuracy: 1,
        specificity: 1,
      })

      collector.reset()

      const aggregated = collector.getAggregatedClassification()
      expect(aggregated.precision).toBe(0)
    })
  })
})

describe('Benchmark Runner', () => {
  describe('createMatchingFunction', () => {
    it('should create weighted matching function', () => {
      const matchFn = createMatchingFunction<{
        id: number
        name: string
        email: string
      }>([
        {
          field: 'name',
          comparator: (a, b) => (a === b ? 1 : 0),
          weight: 2,
        },
        {
          field: 'email',
          comparator: (a, b) => (a === b ? 1 : 0),
          weight: 3,
        },
      ])

      const score1 = matchFn(
        { id: 1, name: 'John', email: 'john@example.com' },
        { id: 2, name: 'John', email: 'john@example.com' }
      )
      expect(score1).toBe(1)

      const score2 = matchFn(
        { id: 1, name: 'John', email: 'john@example.com' },
        { id: 2, name: 'John', email: 'jane@example.com' }
      )
      expect(score2).toBeCloseTo(2 / 5)

      const score3 = matchFn(
        { id: 1, name: 'John', email: 'john@example.com' },
        { id: 2, name: 'Jane', email: 'jane@example.com' }
      )
      expect(score3).toBe(0)
    })
  })

  describe('runBenchmark', () => {
    it('should run benchmark and return results', async () => {
      const dataset = createLoadedDataset(
        'test',
        [
          { id: 1, name: 'John' },
          { id: 2, name: 'John' },
          { id: 3, name: 'Jane' },
        ],
        [{ id1: 1, id2: 2, isMatch: true }],
        'custom',
        0
      )

      const result = await runBenchmark(
        {
          name: 'Test Benchmark',
          warmupRuns: 0,
          measurementRuns: 1,
        },
        {
          dataset,
          matchingFn: (a, b) => (a.name === b.name ? 1 : 0),
          threshold: 0.5,
        }
      )

      expect(result.success).toBe(true)
      expect(result.name).toBe('Test Benchmark')
      expect(result.throughput).toBeDefined()
      expect(result.throughput!.totalPairs).toBe(3) // 3*(3-1)/2
      expect(result.classification).toBeDefined()
    })

    it('should run benchmark with blocking', async () => {
      const dataset = createLoadedDataset(
        'test',
        [
          { id: 1, name: 'John', group: 'A' },
          { id: 2, name: 'John', group: 'A' },
          { id: 3, name: 'Jane', group: 'B' },
          { id: 4, name: 'Jane', group: 'B' },
        ],
        [
          { id1: 1, id2: 2, isMatch: true },
          { id1: 3, id2: 4, isMatch: true },
        ],
        'custom',
        0
      )

      const result = await runBenchmark(
        {
          name: 'Blocking Benchmark',
          warmupRuns: 0,
          measurementRuns: 1,
        },
        {
          dataset,
          matchingFn: (a, b) => (a.name === b.name ? 1 : 0),
          blockingFn: (records) => {
            const blocks = new Map<string, typeof records>()
            for (const record of records) {
              const key = record.group as string
              if (!blocks.has(key)) {
                blocks.set(key, [])
              }
              blocks.get(key)!.push(record)
            }
            return blocks
          },
          threshold: 0.5,
        }
      )

      expect(result.success).toBe(true)
      expect(result.blocking).toBeDefined()
      expect(result.blocking!.totalBlocks).toBe(2)
      expect(result.blocking!.totalPairsWithBlocking).toBe(2) // 1+1 pairs within blocks
    })

    it('should analyze thresholds when requested', async () => {
      const dataset = createLoadedDataset(
        'test',
        [
          { id: 1, name: 'John' },
          { id: 2, name: 'John' },
          { id: 3, name: 'Jane' },
        ],
        [{ id1: 1, id2: 2, isMatch: true }],
        'custom',
        0
      )

      const result = await runBenchmark(
        {
          name: 'Threshold Analysis',
          warmupRuns: 0,
          measurementRuns: 1,
        },
        {
          dataset,
          matchingFn: (a, b) => (a.name === b.name ? 1 : 0),
          analyzeThresholds: true,
          thresholdRange: { min: 0, max: 1, step: 0.5 },
        }
      )

      expect(result.success).toBe(true)
      expect(result.thresholdAnalysis).toBeDefined()
      expect(result.thresholdAnalysis!.thresholds).toContain(0)
      expect(result.thresholdAnalysis!.thresholds).toContain(0.5)
      expect(result.thresholdAnalysis!.thresholds).toContain(1)
    })

    it('should report errors in result when benchmark has issues', async () => {
      const dataset = createLoadedDataset(
        'test',
        [
          { id: 1, name: 'John' },
          { id: 2, name: 'Jane' },
        ],
        [],
        'custom',
        0
      )

      const result = await runBenchmark(
        {
          name: 'Error Test',
          warmupRuns: 0,
          measurementRuns: 1,
        },
        {
          dataset,
          matchingFn: () => {
            throw new Error('Simulated matching error')
          },
        }
      )

      expect(result.success).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
      expect(result.errors[0]).toContain('Simulated matching error')
    })
  })
})

describe('Report Generation', () => {
  const sampleResult: BenchmarkResult = {
    name: 'Sample Benchmark',
    description: 'A test benchmark',
    timestamp: '2024-01-15T10:00:00.000Z',
    config: {
      name: 'Sample Benchmark',
      warmupRuns: 1,
      measurementRuns: 3,
      collectMemory: true,
    },
    classification: {
      truePositives: 45,
      falsePositives: 5,
      trueNegatives: 940,
      falseNegatives: 10,
      precision: 0.9,
      recall: 0.818,
      f1Score: 0.857,
      accuracy: 0.985,
      specificity: 0.995,
      stdDev: {
        precision: 0.02,
        recall: 0.03,
        f1Score: 0.025,
        accuracy: 0.005,
      },
    },
    throughput: {
      totalRecords: 1000,
      totalPairs: 499500,
      executionTimeMs: 2500,
      recordsPerSecond: 400,
      pairsPerSecond: 199800,
      comparisonsPerSecond: 199800,
    },
    memory: {
      heapUsedBefore: 10000000,
      heapUsedAfter: 15000000,
      heapUsedDelta: 5000000,
      externalBefore: 1000000,
      externalAfter: 1200000,
      externalDelta: 200000,
    },
    blocking: {
      totalBlocks: 100,
      totalPairsWithoutBlocking: 499500,
      totalPairsWithBlocking: 5000,
      reductionRatio: 0.99,
      avgBlockSize: 10,
      minBlockSize: 1,
      maxBlockSize: 50,
    },
    custom: {
      customMetric1: 42,
    },
    errors: [],
    success: true,
  }

  describe('generateMarkdownReport', () => {
    it('should generate markdown report with all sections', () => {
      const report = generateMarkdownReport(sampleResult, {
        title: 'Test Report',
        includeTimestamp: true,
        includeConfig: true,
        includeThresholdAnalysis: false,
        includeMemory: true,
        includeBlocking: true,
      })

      expect(report).toContain('# Test Report')
      expect(report).toContain('Classification Metrics')
      expect(report).toContain('90.00%') // Precision
      expect(report).toContain('Throughput Metrics')
      expect(report).toContain('Memory Metrics')
      expect(report).toContain('Blocking Metrics')
      expect(report).toContain('Custom Metrics')
      expect(report).toContain('customMetric1')
    })

    it('should generate report for failed benchmark', () => {
      const failedResult: BenchmarkResult = {
        ...sampleResult,
        success: false,
        errors: ['Connection timeout', 'Database error'],
      }

      const report = generateMarkdownReport(failedResult)

      expect(report).toContain('Benchmark Failed')
      expect(report).toContain('Connection timeout')
      expect(report).toContain('Database error')
    })

    it('should optionally exclude sections', () => {
      const report = generateMarkdownReport(sampleResult, {
        title: 'Minimal Report',
        includeMemory: false,
        includeBlocking: false,
        includeConfig: false,
      })

      expect(report).not.toContain('Memory Metrics')
      expect(report).not.toContain('Blocking Metrics')
      expect(report).not.toContain('Configuration')
    })
  })

  describe('generateJSONReport', () => {
    it('should generate valid JSON report', () => {
      const report = generateJSONReport(sampleResult)
      const parsed = JSON.parse(report)

      expect(parsed.name).toBe('Sample Benchmark')
      expect(parsed.classification.precision).toBe(0.9)
      expect(parsed.throughput.totalRecords).toBe(1000)
    })
  })

  describe('generateComparisonReport', () => {
    it('should generate comparison report for multiple benchmarks', () => {
      const results: BenchmarkResult[] = [
        { ...sampleResult, name: 'Algorithm A' },
        {
          ...sampleResult,
          name: 'Algorithm B',
          classification: {
            ...sampleResult.classification!,
            f1Score: 0.9,
          },
        },
      ]

      const report = generateComparisonReport('Algorithm Comparison', results)

      expect(report).toContain('Algorithm Comparison')
      expect(report).toContain('Algorithm A')
      expect(report).toContain('Algorithm B')
      expect(report).toContain('Best F1 Score')
      expect(report).toContain('Best Precision')
    })

    it('should handle failed benchmarks in comparison', () => {
      const results: BenchmarkResult[] = [
        { ...sampleResult, name: 'Working' },
        { ...sampleResult, name: 'Failed', success: false, errors: ['Error'] },
      ]

      const report = generateComparisonReport('Mixed Results', results)

      expect(report).toContain('Failed Benchmarks')
      expect(report).toContain('Working')
    })
  })

  describe('generateScalabilityReport', () => {
    it('should generate scalability report', () => {
      const results = [
        { size: 100, result: { ...sampleResult, name: '100 records' } },
        {
          size: 1000,
          result: {
            ...sampleResult,
            name: '1000 records',
            throughput: {
              ...sampleResult.throughput!,
              totalRecords: 1000,
              executionTimeMs: 10000,
            },
          },
        },
      ]

      const report = generateScalabilityReport('Scalability Test', results)

      expect(report).toContain('Scalability Analysis')
      expect(report).toContain('Complexity Analysis')
      expect(report).toContain('100')
      expect(report).toContain('1,000')
    })
  })

  describe('generateDatasetSummary', () => {
    it('should generate dataset summary', () => {
      const metadata = {
        recordCount: 5000,
        fieldCount: 8,
        fields: [
          'id',
          'firstName',
          'lastName',
          'email',
          'phone',
          'address',
          'city',
          'state',
        ],
        truePairCount: 250,
        loadTimeMs: 150,
        format: 'csv' as const,
      }

      const summary = generateDatasetSummary(metadata)

      expect(summary).toContain('Dataset Summary')
      expect(summary).toContain('5,000')
      expect(summary).toContain('8')
      expect(summary).toContain('250')
      expect(summary).toContain('csv')
      expect(summary).toContain('firstName')
      expect(summary).toContain('email')
    })
  })
})
