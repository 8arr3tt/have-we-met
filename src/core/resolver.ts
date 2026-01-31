import type { ResolverConfig } from '../types/config'
import type { SchemaDefinition } from '../types/schema'
import type {
  FieldComparison,
  MatchResult,
  MatchThresholds,
} from './scoring/types'
import type {
  DeduplicationBatchOptions,
  DeduplicationBatchResult,
  DeduplicationResult,
} from './scoring/deduplication-result'
import { ScoreCalculator } from './scoring/score-calculator'
import { OutcomeClassifier } from './scoring/outcome-classifier'
import { MatchExplainer } from './scoring/explainer'
import { BlockGenerator } from './blocking/block-generator'
import type { BlockingStrategy } from './blocking/types'
import type {
  DatabaseAdapter,
  DatabaseResolveOptions,
  DatabaseDeduplicationOptions,
  MergeOptions,
  MergeResult,
} from '../adapters/types'

/**
 * Options for resolver operations
 */
export interface ResolverOptions {
  /** Maximum number of results to return */
  maxResults?: number
}

/**
 * Core resolver class that orchestrates matching, scoring, and outcome classification.
 *
 * @example
 * ```typescript
 * const resolver = HaveWeMet.create<Person>()
 *   .schema(schema => { ... })
 *   .matching(match => { ... })
 *   .thresholds({ noMatch: 20, definiteMatch: 45 })
 *   .build()
 *
 * // Find matches for a single record
 * const results = resolver.resolve(newRecord, existingRecords)
 *
 * // Batch deduplication
 * const batchResult = resolver.deduplicateBatch(records)
 * ```
 *
 * @typeParam T - The record type being matched
 */
export class Resolver<T extends Record<string, unknown> = Record<string, unknown>> {
  private schema: SchemaDefinition<T>
  private comparisons: FieldComparison[]
  private thresholds: MatchThresholds
  private blockingStrategy?: BlockingStrategy<T>
  private adapter?: DatabaseAdapter<T>
  private scoreCalculator: ScoreCalculator
  private outcomeClassifier: OutcomeClassifier
  private explainer: MatchExplainer

  constructor(config: ResolverConfig<T>) {
    this.validateConfig(config)

    this.schema = config.schema
    this.thresholds = {
      noMatch: config.matching.thresholds.noMatch,
      definiteMatch: config.matching.thresholds.definiteMatch,
    }

    this.comparisons = this.buildComparisons(config)
    this.blockingStrategy = config.blocking?.strategies?.[0]
    this.adapter = config.adapter

    this.scoreCalculator = new ScoreCalculator(this.schema)
    this.outcomeClassifier = new OutcomeClassifier()
    this.explainer = new MatchExplainer()
  }

  /**
   * Find matches for a single candidate record against a set of existing records.
   *
   * This method:
   * 1. Applies blocking (if configured) to reduce the candidate set
   * 2. Normalizes records according to schema definitions
   * 3. Calculates weighted scores for each comparison
   * 4. Classifies outcomes based on thresholds
   * 5. Generates detailed explanations for each match
   *
   * Results are sorted by score (highest first).
   *
   * @param candidateRecord - The record to find matches for
   * @param existingRecords - The dataset to search within
   * @param options - Optional configuration (e.g., maxResults)
   * @returns Array of match results with scores and explanations
   *
   * @example
   * ```typescript
   * const newRecord = {
   *   firstName: 'John',
   *   lastName: 'Smith',
   *   email: 'john@example.com'
   * }
   *
   * const results = resolver.resolve(newRecord, existingRecords)
   *
   * results.forEach(result => {
   *   console.log(result.outcome)  // 'definite-match', 'potential-match', or 'no-match'
   *   console.log(result.score.totalScore)
   *   console.log(result.explanation)
   * })
   * ```
   */
  resolve(
    candidateRecord: Record<string, unknown>,
    existingRecords: Record<string, unknown>[],
    options?: ResolverOptions
  ): MatchResult[] {
    if (existingRecords.length === 0) {
      return []
    }

    let recordsToCompare = existingRecords

    if (this.blockingStrategy) {
      const allRecords = [candidateRecord, ...existingRecords]
      const blockGenerator = new BlockGenerator()
      const blocks = blockGenerator.generateBlocks(
        allRecords,
        this.blockingStrategy
      )

      const candidatesSet = new Set<Record<string, unknown>>()

      for (const block of blocks.values()) {
        if (block.includes(candidateRecord)) {
          for (const record of block) {
            if (record !== candidateRecord) {
              candidatesSet.add(record)
            }
          }
        }
      }

      recordsToCompare = Array.from(candidatesSet)
    }

    const results: MatchResult[] = []

    for (const existingRecord of recordsToCompare) {
      const score = this.scoreCalculator.calculateScore(
        candidateRecord,
        existingRecord,
        this.comparisons
      )

      const outcome = this.outcomeClassifier.classify(score, this.thresholds)

      const result: MatchResult = {
        outcome,
        candidateRecord: existingRecord,
        score,
        explanation: '',
      }

      result.explanation = this.explainer.explain(result)

      results.push(result)
    }

    results.sort((a, b) => b.score.totalScore - a.score.totalScore)

    if (options?.maxResults && options.maxResults > 0) {
      return results.slice(0, options.maxResults)
    }

    return results
  }

  /**
   * Find all matches above a minimum score threshold.
   *
   * This is similar to `resolve()` but filters results to only include
   * matches above the specified score. Useful for finding all potential
   * duplicates without the three-tier classification.
   *
   * @param record - The record to find matches for
   * @param existingRecords - The dataset to search within
   * @param minScore - Minimum score required (defaults to noMatch threshold)
   * @returns Array of matches above the minimum score
   *
   * @example
   * ```typescript
   * // Find all matches with score >= 30
   * const matches = resolver.findMatches(newRecord, existingRecords, 30)
   * ```
   */
  findMatches(
    record: Record<string, unknown>,
    existingRecords: Record<string, unknown>[],
    minScore?: number
  ): MatchResult[] {
    const results = this.resolve(record, existingRecords)

    const threshold = minScore ?? this.thresholds.noMatch

    return results.filter((result) => result.score.totalScore >= threshold)
  }

  /**
   * Find all duplicates within a dataset using batch deduplication.
   *
   * This method:
   * 1. Applies blocking to generate candidate pairs efficiently
   * 2. Compares each pair and calculates scores
   * 3. Groups results by record
   * 4. Provides comprehensive statistics
   *
   * @param records - The dataset to deduplicate
   * @param options - Optional configuration for batch processing
   * @returns Deduplication results with matches grouped by record and statistics
   *
   * @example
   * ```typescript
   * const batchResult = resolver.deduplicateBatch(records, {
   *   maxPairsPerRecord: 10,  // Limit matches per record
   *   minScore: 25,            // Override threshold
   *   includeNoMatches: false  // Exclude records with no matches
   * })
   *
   * console.log(batchResult.stats.definiteMatchesFound)
   * console.log(batchResult.stats.comparisonsMade)
   *
   * batchResult.results.forEach(result => {
   *   if (result.hasDefiniteMatches) {
   *     console.log(`Found ${result.matchCount} duplicates for:`, result.record)
   *   }
   * })
   * ```
   */
  deduplicateBatch(
    records: Record<string, unknown>[],
    options?: DeduplicationBatchOptions
  ): DeduplicationBatchResult {
    if (records.length === 0) {
      return {
        results: [],
        stats: {
          recordsProcessed: 0,
          comparisonsMade: 0,
          definiteMatchesFound: 0,
          potentialMatchesFound: 0,
          noMatchesFound: 0,
          recordsWithMatches: 0,
          recordsWithoutMatches: 0,
        },
      }
    }

    const blockGenerator = new BlockGenerator()
    let pairs: Array<[Record<string, unknown>, Record<string, unknown>]>

    if (this.blockingStrategy) {
      const blocks = blockGenerator.generateBlocks(records, this.blockingStrategy)
      pairs = blockGenerator.generatePairs(blocks)
    } else {
      pairs = []
      for (let i = 0; i < records.length; i++) {
        for (let j = i + 1; j < records.length; j++) {
          pairs.push([records[i], records[j]])
        }
      }
    }

    const matchesByRecord = new Map<
      Record<string, unknown>,
      MatchResult[]
    >()

    for (const record of records) {
      matchesByRecord.set(record, [])
    }

    let comparisonsMade = 0
    let definiteMatchesFound = 0
    let potentialMatchesFound = 0
    let noMatchesFound = 0

    for (const [record1, record2] of pairs) {
      const score = this.scoreCalculator.calculateScore(
        record1,
        record2,
        this.comparisons
      )

      const outcome = this.outcomeClassifier.classify(score, this.thresholds)

      comparisonsMade++

      const minScore = options?.minScore ?? this.thresholds.noMatch

      if (score.totalScore >= minScore) {
        const result1: MatchResult = {
          outcome,
          candidateRecord: record2,
          score,
          explanation: '',
        }
        result1.explanation = this.explainer.explain(result1)

        const result2: MatchResult = {
          outcome,
          candidateRecord: record1,
          score,
          explanation: '',
        }
        result2.explanation = this.explainer.explain(result2)

        matchesByRecord.get(record1)!.push(result1)
        matchesByRecord.get(record2)!.push(result2)

        if (outcome === 'definite-match') {
          definiteMatchesFound++
        } else if (outcome === 'potential-match') {
          potentialMatchesFound++
        } else {
          noMatchesFound++
        }
      }
    }

    const results: DeduplicationResult[] = []
    let recordsWithMatches = 0
    let recordsWithoutMatches = 0

    for (const [record, matches] of matchesByRecord) {
      matches.sort((a, b) => b.score.totalScore - a.score.totalScore)

      let limitedMatches = matches
      if (options?.maxPairsPerRecord && options.maxPairsPerRecord > 0) {
        limitedMatches = matches.slice(0, options.maxPairsPerRecord)
      }

      const hasMatches = limitedMatches.length > 0
      if (hasMatches) {
        recordsWithMatches++
      } else {
        recordsWithoutMatches++
      }

      if (hasMatches || options?.includeNoMatches) {
        const hasDefiniteMatches = limitedMatches.some(
          (m) => m.outcome === 'definite-match'
        )
        const hasPotentialMatches = limitedMatches.some(
          (m) => m.outcome === 'potential-match'
        )

        results.push({
          record,
          matches: limitedMatches,
          hasDefiniteMatches,
          hasPotentialMatches,
          matchCount: limitedMatches.length,
        })
      }
    }

    return {
      results,
      stats: {
        recordsProcessed: records.length,
        comparisonsMade,
        definiteMatchesFound,
        potentialMatchesFound,
        noMatchesFound,
        recordsWithMatches,
        recordsWithoutMatches,
      },
    }
  }

  /**
   * Resolve a record using database adapter for efficient querying.
   *
   * This method leverages blocking strategies to efficiently query the database
   * for potential matches, then applies in-memory matching logic.
   *
   * @param candidateRecord - The record to find matches for
   * @param options - Database resolve options
   * @returns Array of match results from database records
   *
   * @throws Error if adapter is not configured
   *
   * @example
   * ```typescript
   * const results = await resolver.resolveWithDatabase(newRecord, {
   *   useBlocking: true,
   *   maxFetchSize: 1000
   * })
   *
   * results.forEach(result => {
   *   if (result.outcome === 'definite-match') {
   *     console.log('Found duplicate:', result.candidateRecord)
   *   }
   * })
   * ```
   */
  async resolveWithDatabase(
    candidateRecord: T,
    options?: DatabaseResolveOptions
  ): Promise<MatchResult[]> {
    if (!this.adapter) {
      throw new Error('Database adapter is not configured. Use .adapter() in the builder.')
    }

    const useBlocking = options?.useBlocking ?? true
    const maxFetchSize = options?.maxFetchSize ?? 1000

    let existingRecords: T[]

    if (useBlocking && this.blockingStrategy) {
      const blockGenerator = new BlockGenerator()
      const blockingKeys = blockGenerator.extractBlockingKeys(
        candidateRecord,
        this.blockingStrategy
      )

      existingRecords = await this.adapter.findByBlockingKeys(
        blockingKeys,
        { limit: maxFetchSize }
      )
    } else {
      existingRecords = await this.adapter.findAll({ limit: maxFetchSize })
    }

    return this.resolve(candidateRecord, existingRecords)
  }

  /**
   * Batch deduplicate records stored in database.
   *
   * This method processes records from the database in batches, applies blocking
   * and matching, and optionally persists results back to the database.
   *
   * @param options - Database deduplication options
   * @returns Deduplication batch result with statistics
   *
   * @throws Error if adapter is not configured
   *
   * @example
   * ```typescript
   * const result = await resolver.deduplicateBatchFromDatabase({
   *   batchSize: 1000,
   *   persistResults: true,
   *   maxRecords: 10000
   * })
   *
   * console.log(`Processed ${result.stats.recordsProcessed} records`)
   * console.log(`Found ${result.stats.definiteMatchesFound} definite matches`)
   * ```
   */
  async deduplicateBatchFromDatabase(
    options?: DatabaseDeduplicationOptions
  ): Promise<DeduplicationBatchResult> {
    if (!this.adapter) {
      throw new Error('Database adapter is not configured. Use .adapter() in the builder.')
    }

    const batchSize = options?.batchSize ?? 1000
    const maxRecords = options?.maxRecords
    const persistResults = options?.persistResults ?? false

    const totalRecords = await this.adapter.count()
    const recordsToProcess = maxRecords ? Math.min(maxRecords, totalRecords) : totalRecords

    let allResults: DeduplicationResult[] = []
    const totalStats = {
      recordsProcessed: 0,
      comparisonsMade: 0,
      definiteMatchesFound: 0,
      potentialMatchesFound: 0,
      noMatchesFound: 0,
      recordsWithMatches: 0,
      recordsWithoutMatches: 0,
    }

    for (let offset = 0; offset < recordsToProcess; offset += batchSize) {
      const limit = Math.min(batchSize, recordsToProcess - offset)
      const records = await this.adapter.findAll({ limit, offset })

      if (records.length === 0) break

      const batchResult = this.deduplicateBatch(records, {
        minScore: options?.returnExplanation === false ? this.thresholds.noMatch : undefined,
      })

      allResults = allResults.concat(batchResult.results)
      totalStats.recordsProcessed += batchResult.stats.recordsProcessed
      totalStats.comparisonsMade += batchResult.stats.comparisonsMade
      totalStats.definiteMatchesFound += batchResult.stats.definiteMatchesFound
      totalStats.potentialMatchesFound += batchResult.stats.potentialMatchesFound
      totalStats.noMatchesFound += batchResult.stats.noMatchesFound
      totalStats.recordsWithMatches += batchResult.stats.recordsWithMatches
      totalStats.recordsWithoutMatches += batchResult.stats.recordsWithoutMatches
    }

    if (persistResults) {
      const updates = allResults
        .filter((result) => result.hasDefiniteMatches)
        .map((result) => {
          const recordId = (result.record as T & { id: string }).id
          return {
            id: recordId,
            updates: { hasDuplicates: true } as unknown as Partial<T>,
          }
        })

      if (updates.length > 0) {
        await this.adapter.batchUpdate(updates)
      }
    }

    return {
      results: allResults,
      stats: totalStats,
    }
  }

  /**
   * Find and merge duplicates, persisting results to database.
   *
   * This is a preview method for Phase 8 (Golden Record) functionality.
   * Currently implements basic merging logic with transaction support.
   *
   * @param options - Merge options
   * @returns Array of merge results
   *
   * @throws Error if adapter is not configured
   *
   * @example
   * ```typescript
   * const mergeResults = await resolver.findAndMergeDuplicates({
   *   deleteAfterMerge: false,
   *   useTransaction: true
   * })
   *
   * mergeResults.forEach(result => {
   *   console.log(`Merged record ${result.mergedRecordId}`)
   *   console.log(`Source records: ${result.sourceRecordIds.join(', ')}`)
   * })
   * ```
   */
  async findAndMergeDuplicates(options?: MergeOptions): Promise<MergeResult[]> {
    if (!this.adapter) {
      throw new Error('Database adapter is not configured. Use .adapter() in the builder.')
    }

    const useTransaction = options?.useTransaction ?? true
    const deleteAfterMerge = options?.deleteAfterMerge ?? false

    const deduplicationResult = await this.deduplicateBatchFromDatabase({
      batchSize: 1000,
      persistResults: false,
    })

    const mergeResults: MergeResult[] = []

    const processedRecordIds = new Set<string>()

    for (const result of deduplicationResult.results) {
      if (!result.hasDefiniteMatches) continue

      const masterRecord = result.record as T & { id: string }
      const masterRecordId = masterRecord.id

      if (processedRecordIds.has(masterRecordId)) continue

      const duplicateIds: string[] = []
      for (const match of result.matches) {
        if (match.outcome === 'definite-match') {
          const duplicateId = (match.candidateRecord as T & { id: string }).id
          if (!processedRecordIds.has(duplicateId)) {
            duplicateIds.push(duplicateId)
            processedRecordIds.add(duplicateId)
          }
        }
      }

      if (duplicateIds.length === 0) continue

      processedRecordIds.add(masterRecordId)

      const mergeOperation = async (txAdapter: DatabaseAdapter<T>) => {
        const mergedRecord = await txAdapter.update(masterRecordId, {
          mergedCount: ((masterRecord as T & { mergedCount?: number }).mergedCount ?? 0) + duplicateIds.length,
        } as unknown as Partial<T>)

        if (deleteAfterMerge) {
          for (const duplicateId of duplicateIds) {
            await txAdapter.delete(duplicateId)
          }
        }

        return mergedRecord
      }

      if (useTransaction) {
        await this.adapter.transaction(mergeOperation)
      } else {
        await mergeOperation(this.adapter)
      }

      mergeResults.push({
        mergedRecordId: masterRecordId,
        sourceRecordIds: duplicateIds,
        fieldsMerged: duplicateIds.length,
      })
    }

    return mergeResults
  }

  private validateConfig(config: ResolverConfig<T>): void {
    if (!config.matching || config.matching.fields.size === 0) {
      throw new Error('At least one field comparison must be configured')
    }

    const { noMatch, definiteMatch } = config.matching.thresholds

    if (noMatch >= definiteMatch) {
      throw new Error(
        `Invalid thresholds: noMatch (${noMatch}) must be less than definiteMatch (${definiteMatch})`
      )
    }

    if (noMatch < 0) {
      throw new Error(`noMatch threshold must be non-negative, got ${noMatch}`)
    }
  }

  private buildComparisons(config: ResolverConfig<T>): FieldComparison[] {
    const comparisons: FieldComparison[] = []

    for (const [field, matchConfig] of config.matching.fields.entries()) {
      const fieldDef = this.schema[field as keyof T]

      if (!fieldDef) {
        throw new Error(
          `Field '${field}' is configured for matching but not defined in schema`
        )
      }

      const options: Record<string, unknown> = {}

      if (matchConfig.caseSensitive !== undefined) {
        options.caseSensitive = matchConfig.caseSensitive
      }

      if (matchConfig.strategy === 'levenshtein' && matchConfig.levenshteinOptions) {
        Object.assign(options, matchConfig.levenshteinOptions)
      } else if (matchConfig.strategy === 'jaro-winkler' && matchConfig.jaroWinklerOptions) {
        Object.assign(options, matchConfig.jaroWinklerOptions)
      } else if (matchConfig.strategy === 'soundex' && matchConfig.soundexOptions) {
        Object.assign(options, matchConfig.soundexOptions)
      } else if (matchConfig.strategy === 'metaphone' && matchConfig.metaphoneOptions) {
        Object.assign(options, matchConfig.metaphoneOptions)
      }

      comparisons.push({
        field,
        strategy: matchConfig.strategy,
        weight: matchConfig.weight,
        threshold: matchConfig.threshold,
        options: Object.keys(options).length > 0 ? options : undefined,
      })
    }

    return comparisons
  }
}
