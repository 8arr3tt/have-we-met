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
  DeduplicationStats,
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
import { ReviewQueue } from '../queue/review-queue.js'
import type {
  ReviewQueue as IReviewQueue,
  QueueItem,
  MergeDecision,
} from '../queue/types.js'
import { QueueError } from '../queue/queue-error.js'
import { matchResultToQueueItem } from './queue-resolver-integration.js'
import type {
  MergeConfig,
  SourceRecord,
  MergeResult as MergeResultFull,
} from '../merge/types.js'
import { MergeExecutor } from '../merge/merge-executor.js'
import {
  InMemoryProvenanceStore,
  type ProvenanceStore,
} from '../merge/provenance/provenance-store.js'
import {
  InMemorySourceRecordArchive,
  UnmergeExecutor,
  type SourceRecordArchive,
} from '../merge/unmerge.js'
import {
  QueueMergeHandler,
  type QueueMergeResult,
} from '../merge/queue-merge-handler.js'
import type {
  ServicesConfig,
  ServiceResult,
  HealthCheckResult,
  CircuitBreakerStatus,
} from '../services/types.js'
import {
  ServiceExecutorImpl,
  createServiceExecutor,
} from '../services/service-executor.js'
import type { MLIntegrationConfig, FeatureVector } from '../ml/types.js'
import type { MLModel } from '../ml/model-interface.js'
import {
  MLMatchIntegrator,
  type MLMatchResult,
  type MLMatchOptions,
  type MLMatchStats,
} from '../ml/integration/resolver-integration.js'
import {
  createModelFromConfig,
  type MLBuilderConfig,
} from '../ml/integration/builder-integration.js'

/**
 * Options for resolver operations
 */
export interface ResolverOptions {
  /** Maximum number of results to return */
  maxResults?: number
  /** Automatically add potential matches to review queue */
  autoQueue?: boolean
  /** Context to include with queued items */
  queueContext?: Partial<import('../queue/types.js').QueueContext>
  /** Whether to skip external service execution */
  skipServices?: boolean
  /** Whether to skip ML matching */
  skipML?: boolean
}

/**
 * Options for ML-enhanced resolution
 */
export interface MLResolverOptions extends ResolverOptions, MLMatchOptions {}

/**
 * Extended match result that includes service execution information
 */
export interface MatchResultWithServices extends MatchResult {
  /** Results from external services */
  serviceResults?: Record<string, ServiceResult>
  /** Record after enrichment from lookup services */
  enrichedRecord?: Record<string, unknown>
  /** Flags added by services */
  serviceFlags?: string[]
}

/**
 * Resolution result returned by resolve methods when services are configured
 */
export interface ResolutionResult<T = unknown> {
  /** The match results */
  matches: MatchResultWithServices[]
  /** Results from external services */
  serviceResults?: Record<string, ServiceResult>
  /** Record after enrichment from lookup services */
  enrichedRecord?: T
  /** Flags accumulated from services */
  serviceFlags?: string[]
  /** Whether resolution was rejected by a service */
  rejected: boolean
  /** Rejection reason (if rejected) */
  rejectionReason?: string
  /** Service that caused rejection (if rejected) */
  rejectedBy?: string
  /** Total service execution time in milliseconds */
  serviceExecutionTimeMs?: number
}

/**
 * Options for direct merge operations
 */
export interface DirectMergeOptions {
  /** ID to use for the golden record (defaults to first source record ID) */
  targetRecordId?: string
  /** User/system performing the merge */
  mergedBy?: string
  /** Whether to persist the golden record via adapter */
  persist?: boolean
  /** Whether to archive source records after merge */
  archiveSourceRecords?: boolean
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
export class Resolver<
  T extends Record<string, unknown> = Record<string, unknown>,
> {
  private schema: SchemaDefinition<T>
  private comparisons: FieldComparison[]
  private thresholds: MatchThresholds
  private blockingStrategy?: BlockingStrategy<T>
  private adapter?: DatabaseAdapter<T>
  private scoreCalculator: ScoreCalculator
  private outcomeClassifier: OutcomeClassifier
  private explainer: MatchExplainer
  private _queue?: IReviewQueue<T>
  private _mergeConfig?: MergeConfig
  private _mergeExecutor?: MergeExecutor<T>
  private _provenanceStore?: ProvenanceStore
  private _sourceRecordArchive?: SourceRecordArchive<T>
  private _queueMergeHandler?: QueueMergeHandler<T>
  private _unmergeExecutor?: UnmergeExecutor<T>
  private _serviceExecutor?: ServiceExecutorImpl
  private _servicesConfig?: ServicesConfig
  private _mlIntegrator?: MLMatchIntegrator<T>
  private _mlConfig?: MLIntegrationConfig

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

    // Initialize queue if adapter has queue support
    if (this.adapter?.queue) {
      this._queue = new ReviewQueue<T>(this.adapter.queue)
    }

    // Initialize service executor if services are configured
    if (config.services) {
      this._servicesConfig = config.services
      this._serviceExecutor = createServiceExecutor({
        resolverConfig: config,
        defaults: config.services.defaults,
        cachingEnabled: config.services.cachingEnabled,
        executionOrder: config.services.executionOrder,
      })

      // Register all configured services
      for (const serviceConfig of config.services.services) {
        this._serviceExecutor.register(serviceConfig)
      }
    }

    // Store ML configuration for lazy initialization
    // ML model is created asynchronously, so we initialize it on first use
    if (config.ml) {
      this._mlBuilderConfig = config.ml
    }
  }

  // ML builder configuration (used for lazy initialization)
  private _mlBuilderConfig?: MLBuilderConfig<T>

  /**
   * Initialize ML from builder configuration.
   * Called lazily on first ML use to handle async model creation.
   */
  private async initializeMLFromConfig(): Promise<void> {
    if (!this._mlBuilderConfig || this._mlIntegrator) {
      return
    }

    const model = await createModelFromConfig<T>(this._mlBuilderConfig)
    this._mlIntegrator = new MLMatchIntegrator<T>(
      model,
      this._mlBuilderConfig.integrationConfig
    )
    this._mlConfig = this._mlIntegrator.getConfig()
  }

  /**
   * Access to the review queue for human-in-the-loop matching.
   *
   * The queue is only available when a database adapter with queue support
   * is configured.
   *
   * @throws QueueError if adapter is not configured or doesn't support queue
   *
   * @example
   * ```typescript
   * const resolver = HaveWeMet
   *   .schema({ ... })
   *   .matching(...)
   *   .adapter(prismaAdapter(prisma))
   *   .build()
   *
   * // Add to queue manually
   * await resolver.queue.add({
   *   candidateRecord: newRecord,
   *   potentialMatches: matches.filter(m => m.outcome === 'potential-match')
   * })
   *
   * // List pending items
   * const pending = await resolver.queue.list({ status: 'pending' })
   * ```
   */
  get queue(): IReviewQueue<T> {
    if (!this._queue) {
      throw new QueueError(
        'Queue is not available. Ensure you have configured a database adapter with queue support.',
        'QUEUE_NOT_AVAILABLE'
      )
    }
    return this._queue
  }

  /**
   * Check if external services are configured for this resolver.
   *
   * @returns True if services are configured
   */
  get hasServices(): boolean {
    return this._serviceExecutor !== undefined
  }

  /**
   * Get the services configuration for this resolver.
   *
   * @returns The services configuration or undefined if not configured
   */
  getServicesConfig(): ServicesConfig | undefined {
    return this._servicesConfig
  }

  /**
   * Get health status for all configured external services.
   *
   * @returns Promise resolving to health status for each service
   * @throws Error if services are not configured
   *
   * @example
   * ```typescript
   * const healthStatus = await resolver.getServiceHealthStatus()
   * for (const [name, status] of Object.entries(healthStatus)) {
   *   console.log(`${name}: ${status.healthy ? 'healthy' : 'unhealthy'}`)
   * }
   * ```
   */
  async getServiceHealthStatus(): Promise<Record<string, HealthCheckResult>> {
    if (!this._serviceExecutor) {
      throw new Error(
        'Services are not configured. Use .services() in the builder.'
      )
    }
    return this._serviceExecutor.getHealthStatus()
  }

  /**
   * Get circuit breaker status for all configured external services.
   *
   * @returns Circuit breaker status for each service
   * @throws Error if services are not configured
   *
   * @example
   * ```typescript
   * const circuitStatus = resolver.getServiceCircuitStatus()
   * for (const [name, status] of Object.entries(circuitStatus)) {
   *   console.log(`${name}: ${status.state}`)
   * }
   * ```
   */
  getServiceCircuitStatus(): Record<string, CircuitBreakerStatus> {
    if (!this._serviceExecutor) {
      throw new Error(
        'Services are not configured. Use .services() in the builder.'
      )
    }
    return this._serviceExecutor.getCircuitStatus()
  }

  /**
   * Dispose all external services and cleanup resources.
   *
   * Call this when shutting down the application to properly cleanup
   * connections and resources held by external services.
   *
   * @example
   * ```typescript
   * // During application shutdown
   * await resolver.disposeServices()
   * ```
   */
  async disposeServices(): Promise<void> {
    if (this._serviceExecutor) {
      await this._serviceExecutor.dispose()
    }
  }

  // ==================== ML MATCHING ====================

  /**
   * Configure ML matching for the resolver.
   *
   * @param model - The ML model to use for matching
   * @param config - Optional ML integration configuration
   *
   * @example
   * ```typescript
   * import { createPretrainedClassifier } from 'have-we-met'
   *
   * const classifier = await createPretrainedClassifier()
   * resolver.configureML(classifier, {
   *   mode: 'hybrid',
   *   mlWeight: 0.4,
   * })
   * ```
   */
  configureML(model: MLModel<T>, config?: Partial<MLIntegrationConfig>): void {
    this._mlIntegrator = new MLMatchIntegrator<T>(model, config)
    this._mlConfig = this._mlIntegrator.getConfig()
  }

  /**
   * Check if ML matching is configured.
   * Note: This returns true if ML is configured via builder even if not yet initialized.
   */
  get hasML(): boolean {
    return (
      (this._mlIntegrator !== undefined && this._mlIntegrator.isReady()) ||
      this._mlBuilderConfig !== undefined
    )
  }

  /**
   * Check if ML matching is configured via the builder API.
   * This indicates ML was set up through the fluent builder.
   */
  get hasMLConfig(): boolean {
    return this._mlBuilderConfig !== undefined
  }

  /**
   * Get the ML integration configuration.
   */
  getMLConfig(): MLIntegrationConfig | undefined {
    return this._mlConfig
  }

  /**
   * Get the ML model (if configured).
   */
  getMLModel(): MLModel<T> | undefined {
    return this._mlIntegrator?.getModel()
  }

  /**
   * Update the ML integration configuration.
   *
   * @param config - Partial configuration to update
   */
  setMLConfig(config: Partial<MLIntegrationConfig>): void {
    if (!this._mlIntegrator) {
      throw new Error(
        'ML is not configured. Call configureML() first or use .ml() in the builder.'
      )
    }
    this._mlIntegrator.setConfig(config)
    this._mlConfig = this._mlIntegrator.getConfig()
  }

  /**
   * Find matches using ML-enhanced matching.
   *
   * This method:
   * 1. Performs standard probabilistic matching
   * 2. Enhances results with ML predictions based on configured mode
   * 3. Returns results with ML prediction details
   *
   * @param candidateRecord - The record to find matches for
   * @param existingRecords - The dataset to search within
   * @param options - Optional ML-specific configuration
   * @returns Promise resolving to ML-enhanced match results
   *
   * @throws Error if ML is not configured
   *
   * @example
   * ```typescript
   * const results = await resolver.resolveWithML(newRecord, existingRecords)
   *
   * results.forEach(result => {
   *   console.log(result.outcome)
   *   console.log(result.mlUsed)
   *   if (result.mlPrediction) {
   *     console.log(result.mlPrediction.probability)
   *     console.log(result.mlPrediction.featureImportance)
   *   }
   * })
   * ```
   */
  async resolveWithML(
    candidateRecord: T,
    existingRecords: T[],
    options?: MLResolverOptions
  ): Promise<MLMatchResult<T>[]> {
    // Lazily initialize ML from builder config if needed
    if (!this._mlIntegrator && this._mlBuilderConfig) {
      await this.initializeMLFromConfig()
    }

    if (!this._mlIntegrator) {
      throw new Error(
        'ML is not configured. Call configureML() first or use .ml() in the builder.'
      )
    }

    // First perform standard probabilistic matching
    const probabilisticResults = this.executeMatching(
      candidateRecord as Record<string, unknown>,
      existingRecords as Record<string, unknown>[],
      options
    ) as MatchResult<T>[]

    // Apply blocking to get the actual records that were compared
    let recordsToCompare = existingRecords
    if (this.blockingStrategy) {
      const allRecords = [candidateRecord, ...existingRecords]
      const blockGenerator = new BlockGenerator()
      const blocks = blockGenerator.generateBlocks(
        allRecords,
        this.blockingStrategy
      )

      const candidatesSet = new Set<T>()
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

    // Enhance results with ML predictions
    return this._mlIntegrator.enhanceMatchResults(
      candidateRecord,
      recordsToCompare,
      probabilisticResults,
      {
        ...options,
        skipML: options?.skipML,
      }
    )
  }

  /**
   * Find matches using ML-enhanced matching with batch optimization.
   *
   * This method is more efficient for comparing against many records
   * as it batches ML predictions.
   *
   * @param candidateRecord - The record to find matches for
   * @param existingRecords - The dataset to search within
   * @param options - Optional ML-specific configuration
   * @returns Promise resolving to ML-enhanced results with statistics
   *
   * @example
   * ```typescript
   * const { results, stats } = await resolver.resolveWithMLBatch(
   *   newRecord,
   *   existingRecords
   * )
   *
   * console.log(`ML used for ${stats.mlUsedCount} of ${stats.totalMatches} matches`)
   * console.log(`Average ML time: ${stats.avgMLPredictionTimeMs}ms`)
   * ```
   */
  async resolveWithMLBatch(
    candidateRecord: T,
    existingRecords: T[],
    options?: MLResolverOptions
  ): Promise<{ results: MLMatchResult<T>[]; stats: MLMatchStats }> {
    // Lazily initialize ML from builder config if needed
    if (!this._mlIntegrator && this._mlBuilderConfig) {
      await this.initializeMLFromConfig()
    }

    if (!this._mlIntegrator) {
      throw new Error(
        'ML is not configured. Call configureML() first or use .ml() in the builder.'
      )
    }

    // First perform standard probabilistic matching
    const probabilisticResults = this.executeMatching(
      candidateRecord as Record<string, unknown>,
      existingRecords as Record<string, unknown>[],
      options
    ) as MatchResult<T>[]

    // Apply blocking to get the actual records that were compared
    let recordsToCompare = existingRecords
    if (this.blockingStrategy) {
      const allRecords = [candidateRecord, ...existingRecords]
      const blockGenerator = new BlockGenerator()
      const blocks = blockGenerator.generateBlocks(
        allRecords,
        this.blockingStrategy
      )

      const candidatesSet = new Set<T>()
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

    // Enhance results with ML predictions using batch processing
    return this._mlIntegrator.enhanceMatchResultsBatch(
      candidateRecord,
      recordsToCompare,
      probabilisticResults,
      options
    )
  }

  /**
   * Find matches using ML-only mode (no probabilistic scoring).
   *
   * This method bypasses the probabilistic matching engine entirely
   * and relies solely on the ML model for match predictions.
   *
   * @param candidateRecord - The record to find matches for
   * @param existingRecords - The dataset to search within
   * @param options - Optional configuration
   * @returns Promise resolving to ML match results
   *
   * @throws Error if ML is not configured
   *
   * @example
   * ```typescript
   * const results = await resolver.resolveMLOnly(newRecord, existingRecords)
   *
   * results.forEach(result => {
   *   // Result is based entirely on ML prediction
   *   console.log(result.mlPrediction?.probability)
   *   console.log(result.mlPrediction?.featureImportance)
   * })
   * ```
   */
  async resolveMLOnly(
    candidateRecord: T,
    existingRecords: T[],
    options?: ResolverOptions
  ): Promise<MLMatchResult<T>[]> {
    // Lazily initialize ML from builder config if needed
    if (!this._mlIntegrator && this._mlBuilderConfig) {
      await this.initializeMLFromConfig()
    }

    if (!this._mlIntegrator) {
      throw new Error(
        'ML is not configured. Call configureML() first or use .ml() in the builder.'
      )
    }

    // Apply blocking if configured
    let recordsToCompare = existingRecords
    if (this.blockingStrategy) {
      const allRecords = [candidateRecord, ...existingRecords]
      const blockGenerator = new BlockGenerator()
      const blocks = blockGenerator.generateBlocks(
        allRecords,
        this.blockingStrategy
      )

      const candidatesSet = new Set<T>()
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

    // Match each record using ML-only
    const results: MLMatchResult<T>[] = []

    for (const existingRecord of recordsToCompare) {
      const result = await this._mlIntegrator.matchWithMLOnly(
        candidateRecord,
        existingRecord,
        this.thresholds
      )
      results.push(result)
    }

    // Sort by score and apply max results
    results.sort((a, b) => b.score.totalScore - a.score.totalScore)

    if (options?.maxResults && options.maxResults > 0) {
      return results.slice(0, options.maxResults)
    }

    return results
  }

  /**
   * Extract ML features from a record pair without making a prediction.
   *
   * Useful for debugging, understanding what features the ML model sees,
   * and for pre-computing features for batch operations.
   *
   * @param candidateRecord - First record in the pair
   * @param existingRecord - Second record in the pair
   * @returns Feature vector with names and values
   *
   * @throws Error if ML is not configured
   *
   * @example
   * ```typescript
   * const features = resolver.extractMLFeatures(record1, record2)
   *
   * console.log('Feature names:', features.names)
   * console.log('Feature values:', features.values)
   *
   * // Inspect individual features
   * features.names.forEach((name, i) => {
   *   console.log(`${name}: ${features.values[i]}`)
   * })
   * ```
   */
  extractMLFeatures(candidateRecord: T, existingRecord: T): FeatureVector {
    if (!this._mlIntegrator) {
      throw new Error(
        'ML is not configured. Call configureML() first, use .ml() in the builder, ' +
          'or call an async ML method (resolveWithML, resolveMLOnly) first to initialize.'
      )
    }

    return this._mlIntegrator.extractFeatures(candidateRecord, existingRecord)
  }

  /**
   * Initialize and ensure ML is ready for use.
   *
   * This method is useful when you need to ensure ML is initialized before
   * calling synchronous methods like extractMLFeatures().
   *
   * @throws Error if ML is not configured
   *
   * @example
   * ```typescript
   * await resolver.ensureMLReady()
   * const features = resolver.extractMLFeatures(record1, record2)
   * ```
   */
  async ensureMLReady(): Promise<void> {
    if (!this._mlIntegrator && this._mlBuilderConfig) {
      await this.initializeMLFromConfig()
    }

    if (!this._mlIntegrator) {
      throw new Error(
        'ML is not configured. Call configureML() first or use .ml() in the builder.'
      )
    }
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
   * Note: This is the synchronous version that does not execute external services.
   * Use `resolveWithServices()` for the full service-integrated workflow.
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
    return this.executeMatching(candidateRecord, existingRecords, options)
  }

  /**
   * Find matches with full external service integration.
   *
   * This async method:
   * 1. Executes pre-match services (validation, enrichment)
   * 2. If pre-match services pass, performs matching
   * 3. Executes post-match services (fraud detection, scoring adjustments)
   * 4. Returns comprehensive results with service information
   *
   * @param candidateRecord - The record to find matches for
   * @param existingRecords - The dataset to search within
   * @param options - Optional configuration
   * @returns Promise resolving to resolution result with matches and service info
   *
   * @example
   * ```typescript
   * const result = await resolver.resolveWithServices(newRecord, existingRecords)
   *
   * if (result.rejected) {
   *   console.log(`Resolution rejected by ${result.rejectedBy}: ${result.rejectionReason}`)
   * } else {
   *   console.log(`Found ${result.matches.length} matches`)
   *   console.log(`Service execution time: ${result.serviceExecutionTimeMs}ms`)
   *
   *   if (result.enrichedRecord) {
   *     console.log('Record was enriched:', result.enrichedRecord)
   *   }
   * }
   * ```
   */
  async resolveWithServices(
    candidateRecord: Record<string, unknown>,
    existingRecords: Record<string, unknown>[],
    options?: ResolverOptions
  ): Promise<ResolutionResult<T>> {
    // If services are not configured or skipped, fall back to basic resolve
    if (!this._serviceExecutor || options?.skipServices) {
      const matches = this.executeMatching(
        candidateRecord,
        existingRecords,
        options
      )
      return {
        matches,
        rejected: false,
      }
    }

    const startTime = Date.now()
    let processedRecord = candidateRecord
    let allServiceResults: Record<string, ServiceResult> = {}
    let allFlags: string[] = []
    let allScoreAdjustments: number[] = []

    // Execute pre-match services
    const preMatchResult =
      await this._serviceExecutor.executePreMatch(candidateRecord)
    allServiceResults = { ...preMatchResult.results }
    if (preMatchResult.flags) {
      allFlags = [...preMatchResult.flags]
    }

    if (!preMatchResult.proceed) {
      return {
        matches: [],
        serviceResults: allServiceResults,
        rejected: true,
        rejectionReason: preMatchResult.rejectionReason,
        rejectedBy: preMatchResult.rejectedBy,
        serviceFlags: allFlags.length > 0 ? allFlags : undefined,
        serviceExecutionTimeMs: Date.now() - startTime,
      }
    }

    // Use enriched data if available
    if (preMatchResult.enrichedData) {
      processedRecord = preMatchResult.enrichedData
    }

    // Execute matching with enriched record
    let matches = this.executeMatching(
      processedRecord,
      existingRecords,
      options
    )

    // Execute post-match services if there are matches
    if (matches.length > 0) {
      // For post-match services, we pass the best match result
      const bestMatch = matches[0]
      const postMatchResult = await this._serviceExecutor.executePostMatch(
        processedRecord,
        bestMatch
      )

      // Merge service results
      allServiceResults = { ...allServiceResults, ...postMatchResult.results }
      if (postMatchResult.flags) {
        allFlags = [...allFlags, ...postMatchResult.flags]
      }
      if (postMatchResult.scoreAdjustments) {
        allScoreAdjustments = [
          ...allScoreAdjustments,
          ...postMatchResult.scoreAdjustments,
        ]
      }

      if (!postMatchResult.proceed) {
        return {
          matches: [],
          serviceResults: allServiceResults,
          enrichedRecord: processedRecord as T,
          rejected: true,
          rejectionReason: postMatchResult.rejectionReason,
          rejectedBy: postMatchResult.rejectedBy,
          serviceFlags: allFlags.length > 0 ? allFlags : undefined,
          serviceExecutionTimeMs: Date.now() - startTime,
        }
      }

      // Apply score adjustments from post-match services
      if (allScoreAdjustments.length > 0) {
        const totalAdjustment = allScoreAdjustments.reduce((a, b) => a + b, 0)
        matches = matches.map((match) => ({
          ...match,
          score: {
            ...match.score,
            totalScore: match.score.totalScore + totalAdjustment,
          },
        }))

        // Re-sort by adjusted score
        matches.sort((a, b) => b.score.totalScore - a.score.totalScore)

        // Re-classify outcomes based on adjusted scores
        matches = matches.map((match) => ({
          ...match,
          outcome: this.outcomeClassifier.classify(
            match.score,
            this.thresholds
          ),
        }))
      }
    }

    // Add service results to each match result
    const matchesWithServices: MatchResultWithServices[] = matches.map(
      (match) => ({
        ...match,
        serviceResults: allServiceResults,
        enrichedRecord: processedRecord,
        serviceFlags: allFlags.length > 0 ? allFlags : undefined,
      })
    )

    return {
      matches: matchesWithServices,
      serviceResults: allServiceResults,
      enrichedRecord:
        processedRecord !== candidateRecord
          ? (processedRecord as T)
          : undefined,
      rejected: false,
      serviceFlags: allFlags.length > 0 ? allFlags : undefined,
      serviceExecutionTimeMs: Date.now() - startTime,
    }
  }

  /**
   * Internal method that performs the actual matching logic.
   * Used by both resolve() and resolveWithServices().
   */
  private executeMatching(
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

    let finalResults = results
    if (options?.maxResults && options.maxResults > 0) {
      finalResults = results.slice(0, options.maxResults)
    }

    // Auto-queue potential matches if enabled
    // Note: This is done synchronously to ensure queueing happens before return
    // In production, this could be made async with proper error handling
    if (options?.autoQueue && this._queue) {
      const potentialMatches = finalResults.filter(
        (result) => result.outcome === 'potential-match'
      )

      if (potentialMatches.length > 0) {
        const queueItem = matchResultToQueueItem(
          candidateRecord as T,
          potentialMatches,
          options.queueContext
        )

        // Queue asynchronously without blocking
        // Fire and forget pattern - errors logged but don't disrupt flow
        void this._queue.add(queueItem).catch((error) => {
          console.error('Failed to auto-queue potential matches:', error)
        })
      }
    }

    return finalResults
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
      const blocks = blockGenerator.generateBlocks(
        records,
        this.blockingStrategy
      )
      pairs = blockGenerator.generatePairs(blocks)
    } else {
      pairs = []
      for (let i = 0; i < records.length; i++) {
        for (let j = i + 1; j < records.length; j++) {
          pairs.push([records[i], records[j]])
        }
      }
    }

    const matchesByRecord = new Map<Record<string, unknown>, MatchResult[]>()

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

    const stats: DeduplicationStats & { queuedCount?: number } = {
      recordsProcessed: records.length,
      comparisonsMade,
      definiteMatchesFound,
      potentialMatchesFound,
      noMatchesFound,
      recordsWithMatches,
      recordsWithoutMatches,
    }

    // Auto-queue potential matches if enabled
    if (options?.autoQueue && this._queue) {
      const queueItems = results
        .filter((result) => result.hasPotentialMatches)
        .map((result) => {
          const potentialMatches = result.matches.filter(
            (m) => m.outcome === 'potential-match'
          )
          return matchResultToQueueItem(
            result.record as T,
            potentialMatches,
            options.queueContext
          )
        })

      if (queueItems.length > 0) {
        // Queue asynchronously without blocking
        void this._queue
          .addBatch(queueItems)
          .then((queued) => {
            stats.queuedCount = queued.length
          })
          .catch((error) => {
            console.error('Failed to auto-queue potential matches:', error)
            stats.queuedCount = 0
          })
      }
    }

    return {
      results,
      stats,
    }
  }

  /**
   * Resolve a record using database adapter for efficient querying.
   *
   * This method leverages blocking strategies to efficiently query the database
   * for potential matches, then applies in-memory matching logic.
   *
   * Note: This is the synchronous version that does not execute external services.
   * Use `resolveWithDatabaseAndServices()` for the full service-integrated workflow.
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
      throw new Error(
        'Database adapter is not configured. Use .adapter() in the builder.'
      )
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

      existingRecords = await this.adapter.findByBlockingKeys(blockingKeys, {
        limit: maxFetchSize,
      })
    } else {
      existingRecords = await this.adapter.findAll({ limit: maxFetchSize })
    }

    // Pass through autoQueue and queueContext options
    return this.resolve(candidateRecord, existingRecords, {
      autoQueue: options?.autoQueue,
      queueContext: options?.queueContext,
    })
  }

  /**
   * Resolve a record using database adapter with full external service integration.
   *
   * This method:
   * 1. Executes pre-match services (validation, enrichment)
   * 2. Queries database for candidates using blocking strategies
   * 3. Performs matching with (potentially enriched) record
   * 4. Executes post-match services
   * 5. Returns comprehensive results with service information
   *
   * @param candidateRecord - The record to find matches for
   * @param options - Database resolve options
   * @returns Promise resolving to resolution result with matches and service info
   *
   * @throws Error if adapter is not configured
   *
   * @example
   * ```typescript
   * const result = await resolver.resolveWithDatabaseAndServices(newRecord, {
   *   useBlocking: true,
   *   maxFetchSize: 1000
   * })
   *
   * if (result.rejected) {
   *   console.log(`Record rejected: ${result.rejectionReason}`)
   * } else {
   *   console.log(`Found ${result.matches.length} matches`)
   *   console.log(`Service time: ${result.serviceExecutionTimeMs}ms`)
   * }
   * ```
   */
  async resolveWithDatabaseAndServices(
    candidateRecord: T,
    options?: DatabaseResolveOptions & { skipServices?: boolean }
  ): Promise<ResolutionResult<T>> {
    if (!this.adapter) {
      throw new Error(
        'Database adapter is not configured. Use .adapter() in the builder.'
      )
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

      existingRecords = await this.adapter.findByBlockingKeys(blockingKeys, {
        limit: maxFetchSize,
      })
    } else {
      existingRecords = await this.adapter.findAll({ limit: maxFetchSize })
    }

    return this.resolveWithServices(candidateRecord, existingRecords, {
      autoQueue: options?.autoQueue,
      queueContext: options?.queueContext,
      skipServices: options?.skipServices,
    })
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
      throw new Error(
        'Database adapter is not configured. Use .adapter() in the builder.'
      )
    }

    const batchSize = options?.batchSize ?? 1000
    const maxRecords = options?.maxRecords
    const persistResults = options?.persistResults ?? false

    const totalRecords = await this.adapter.count()
    const recordsToProcess = maxRecords
      ? Math.min(maxRecords, totalRecords)
      : totalRecords

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
        minScore:
          options?.returnExplanation === false
            ? this.thresholds.noMatch
            : undefined,
        autoQueue: options?.autoQueue,
        queueContext: options?.queueContext,
      })

      allResults = allResults.concat(batchResult.results)
      totalStats.recordsProcessed += batchResult.stats.recordsProcessed
      totalStats.comparisonsMade += batchResult.stats.comparisonsMade
      totalStats.definiteMatchesFound += batchResult.stats.definiteMatchesFound
      totalStats.potentialMatchesFound +=
        batchResult.stats.potentialMatchesFound
      totalStats.noMatchesFound += batchResult.stats.noMatchesFound
      totalStats.recordsWithMatches += batchResult.stats.recordsWithMatches
      totalStats.recordsWithoutMatches +=
        batchResult.stats.recordsWithoutMatches
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
      throw new Error(
        'Database adapter is not configured. Use .adapter() in the builder.'
      )
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
          mergedCount:
            ((masterRecord as T & { mergedCount?: number }).mergedCount ?? 0) +
            duplicateIds.length,
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

  /**
   * Configure merge settings for the resolver.
   * This must be called before using merge methods.
   *
   * @param mergeConfig - The merge configuration
   *
   * @example
   * ```typescript
   * resolver.configureMerge({
   *   defaultStrategy: 'preferNonNull',
   *   fieldStrategies: [
   *     { field: 'email', strategy: 'preferNewer' },
   *     { field: 'name', strategy: 'preferLonger' },
   *   ],
   *   trackProvenance: true,
   *   conflictResolution: 'useDefault',
   * })
   * ```
   */
  configureMerge(mergeConfig: MergeConfig): void {
    this._mergeConfig = mergeConfig
    this._mergeExecutor = new MergeExecutor<T>(mergeConfig, this.schema)
    this._provenanceStore = new InMemoryProvenanceStore()
    this._sourceRecordArchive = new InMemorySourceRecordArchive<T>()
    this._unmergeExecutor = new UnmergeExecutor<T>({
      provenanceStore: this._provenanceStore,
      sourceRecordArchive: this._sourceRecordArchive,
      onRecordRestore: this.adapter
        ? async (record) => {
            await this.adapter!.insert(record.record)
          }
        : undefined,
      onGoldenRecordDelete: this.adapter
        ? async (id) => {
            await this.adapter!.delete(id)
          }
        : undefined,
    })

    // Initialize queue merge handler if queue adapter is available
    if (this.adapter?.queue) {
      this._queueMergeHandler = new QueueMergeHandler<T>({
        mergeExecutor: this._mergeExecutor,
        provenanceStore: this._provenanceStore,
        sourceRecordArchive: this._sourceRecordArchive,
        queueAdapter: this.adapter.queue,
        onGoldenRecordCreate: async (record, id) => {
          if (this.adapter) {
            await this.adapter.insert({ ...record, id } as T)
          }
        },
        onSourceRecordsArchive: async (ids) => {
          if (this.adapter) {
            // Mark records as archived (soft delete) or delete them
            for (const id of ids) {
              await this.adapter.update(id, {
                _archived: true,
                _archivedAt: new Date(),
              } as unknown as Partial<T>)
            }
          }
        },
      })
    }
  }

  /**
   * Get the merge configuration
   */
  getMergeConfig(): MergeConfig | undefined {
    return this._mergeConfig
  }

  /**
   * Get the provenance store for querying merge provenance
   */
  getProvenanceStore(): ProvenanceStore | undefined {
    return this._provenanceStore
  }

  /**
   * Get the source record archive
   */
  getSourceRecordArchive(): SourceRecordArchive<T> | undefined {
    return this._sourceRecordArchive
  }

  /**
   * Merge source records into a golden record using configured strategies.
   *
   * This method executes a merge operation on the provided source records,
   * applying the configured field-level merge strategies to produce a single
   * golden record.
   *
   * @param sourceRecords - Records to merge (must have id, createdAt, updatedAt)
   * @param options - Merge options
   * @returns The merge result containing the golden record and provenance
   * @throws Error if merge is not configured
   *
   * @example
   * ```typescript
   * const result = await resolver.merge([
   *   { id: 'rec-001', record: record1, createdAt: new Date(), updatedAt: new Date() },
   *   { id: 'rec-002', record: record2, createdAt: new Date(), updatedAt: new Date() },
   * ], {
   *   mergedBy: 'admin-user',
   *   persist: true,
   * })
   *
   * console.log(result.goldenRecord)
   * console.log(result.provenance.fieldSources)
   * ```
   */
  async merge(
    sourceRecords: SourceRecord<T>[],
    options?: DirectMergeOptions
  ): Promise<MergeResultFull<T>> {
    if (!this._mergeExecutor) {
      throw new Error(
        'Merge is not configured. Call configureMerge() or use .merge() in the builder.'
      )
    }

    const mergeResult = await this._mergeExecutor.merge({
      sourceRecords,
      targetRecordId: options?.targetRecordId,
      mergedBy: options?.mergedBy,
    })

    // Archive source records in memory for potential unmerge
    if (this._sourceRecordArchive) {
      await this._sourceRecordArchive.archive(
        sourceRecords,
        mergeResult.goldenRecordId
      )
    }

    // Save provenance
    if (this._provenanceStore) {
      await this._provenanceStore.save(mergeResult.provenance)
    }

    // Persist golden record if requested
    if (options?.persist && this.adapter) {
      await this.adapter.insert({
        ...mergeResult.goldenRecord,
        id: mergeResult.goldenRecordId,
      } as T)
    }

    // Archive source records in database if requested
    if (options?.archiveSourceRecords && this.adapter) {
      for (const record of sourceRecords) {
        await this.adapter.update(record.id, {
          _archived: true,
          _archivedAt: new Date(),
          _mergedInto: mergeResult.goldenRecordId,
        } as unknown as Partial<T>)
      }
    }

    return mergeResult
  }

  /**
   * Execute a merge from a review queue decision.
   *
   * This method handles the complete merge workflow when a reviewer
   * makes a merge decision in the review queue:
   * 1. Extracts source records from the queue item
   * 2. Executes the merge
   * 3. Persists the golden record
   * 4. Archives source records
   * 5. Stores provenance
   * 6. Updates queue item status
   *
   * @param queueItem - The queue item containing candidate and potential matches
   * @param decision - The merge decision from the reviewer
   * @returns The merge result with queue integration details
   * @throws Error if merge or queue is not configured
   *
   * @example
   * ```typescript
   * // Get a queue item
   * const queueItem = await resolver.queue.get('queue-item-123')
   *
   * // Execute merge from queue decision
   * const result = await resolver.mergeFromQueue(queueItem, {
   *   selectedMatchId: 'match-456',
   *   decidedBy: 'reviewer@example.com',
   *   notes: 'Confirmed as duplicate based on matching SSN',
   *   confidence: 0.95,
   * })
   *
   * console.log(result.goldenRecordId)
   * console.log(result.queueItemUpdated)
   * ```
   */
  async mergeFromQueue(
    queueItem: QueueItem<T>,
    decision: MergeDecision
  ): Promise<QueueMergeResult<T>> {
    if (!this._queueMergeHandler) {
      throw new Error(
        'Queue merge handler is not configured. Ensure merge is configured and adapter has queue support.'
      )
    }

    return this._queueMergeHandler.handleMergeDecision(queueItem, decision)
  }

  /**
   * Unmerge a previously merged golden record.
   *
   * This method reverses a merge operation by:
   * 1. Retrieving provenance data
   * 2. Restoring archived source records
   * 3. Optionally deleting the golden record
   * 4. Updating provenance to mark as unmerged
   *
   * @param goldenRecordId - ID of the golden record to unmerge
   * @param options - Unmerge options
   * @returns The unmerge result with restored records
   * @throws Error if merge is not configured or record cannot be unmerged
   *
   * @example
   * ```typescript
   * const result = await resolver.unmerge('golden-123', {
   *   unmergedBy: 'admin',
   *   reason: 'Incorrectly matched records',
   * })
   *
   * console.log(`Restored ${result.restoredRecords.length} records`)
   * ```
   */
  async unmerge(
    goldenRecordId: string,
    options?: { unmergedBy?: string; reason?: string }
  ): Promise<import('../merge/types.js').UnmergeResult<T>> {
    if (!this._unmergeExecutor) {
      throw new Error(
        'Unmerge executor is not configured. Call configureMerge() first.'
      )
    }

    return this._unmergeExecutor.unmerge({
      goldenRecordId,
      unmergedBy: options?.unmergedBy,
      reason: options?.reason,
    })
  }

  /**
   * Check if a golden record can be unmerged
   *
   * @param goldenRecordId - ID of the golden record to check
   * @returns Object indicating if unmerge is possible and why not
   */
  async canUnmerge(goldenRecordId: string): Promise<{
    canUnmerge: boolean
    reason?: string
  }> {
    if (!this._unmergeExecutor) {
      return {
        canUnmerge: false,
        reason: 'Unmerge executor is not configured',
      }
    }

    return this._unmergeExecutor.canUnmerge(goldenRecordId)
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

      if (
        matchConfig.strategy === 'levenshtein' &&
        matchConfig.levenshteinOptions
      ) {
        Object.assign(options, matchConfig.levenshteinOptions)
      } else if (
        matchConfig.strategy === 'jaro-winkler' &&
        matchConfig.jaroWinklerOptions
      ) {
        Object.assign(options, matchConfig.jaroWinklerOptions)
      } else if (
        matchConfig.strategy === 'soundex' &&
        matchConfig.soundexOptions
      ) {
        Object.assign(options, matchConfig.soundexOptions)
      } else if (
        matchConfig.strategy === 'metaphone' &&
        matchConfig.metaphoneOptions
      ) {
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
