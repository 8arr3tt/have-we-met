/**
 * Fluent builder API for multi-source consolidation
 *
 * Provides type-safe configuration for consolidating records from multiple database tables
 * with different schemas into a single unified output table.
 */

import type {
  ConsolidationConfig,
  ConsolidationSource,
  ConflictResolutionConfig,
  MatchingScope,
} from '../consolidation/types'
import type { DatabaseAdapter } from '../adapters/types'
import type { MergeStrategy } from '../merge/types'
import { MatchingScope as MS } from '../consolidation/types'
import { SourceBuilder } from './source-builder'
import { requireNonEmptyString, requireOneOf } from '../utils/errors.js'

/**
 * Main builder for configuring multi-source consolidation
 *
 * @template TOutput - Unified output record type
 *
 * @example
 * ```typescript
 * const config = new ConsolidationBuilder<Customer>()
 *   .source('crm', source => source
 *     .name('CRM Database')
 *     .adapter(crmAdapter)
 *     .mapping(map => map
 *       .field('email').from('email_address')
 *       .field('firstName').from('first_name')
 *       .field('lastName').from('last_name')
 *     )
 *     .priority(2)
 *   )
 *   .source('billing', source => source
 *     .name('Billing System')
 *     .adapter(billingAdapter)
 *     .mapping(map => map
 *       .field('email').from('email')
 *       .field('firstName').from('fname')
 *       .field('lastName').from('lname')
 *     )
 *     .priority(1)
 *   )
 *   .matchingScope('within-source-first')
 *   .conflictResolution(cr => cr
 *     .defaultStrategy('preferNonNull')
 *     .useSourcePriority(true)
 *     .fieldStrategy('email', 'preferNewer')
 *   )
 *   .outputAdapter(outputAdapter)
 *   .writeOutput(true)
 *   .build()
 * ```
 */
export class ConsolidationBuilder<TOutput extends Record<string, unknown>> {
  private sources: Array<
    ConsolidationSource<Record<string, unknown>, TOutput>
  > = []
  private scope: MatchingScope = MS.WithinSourceFirst
  private conflictResolutionConfig: ConflictResolutionConfig = {}
  private outputDatabaseAdapter?: DatabaseAdapter<TOutput>
  private shouldWriteOutput = false

  /**
   * Add a data source to consolidate
   *
   * @param sourceId - Unique identifier for this source
   * @param configurator - Callback that receives a SourceBuilder
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * .source('legacy_db', source => source
   *   .name('Legacy Customer Database')
   *   .adapter(legacyAdapter)
   *   .mapping(map => map
   *     .field('email').from('old_email_field')
   *     .field('firstName').from('fname')
   *   )
   *   .priority(1)
   * )
   * ```
   */
  source<TInput extends Record<string, unknown>>(
    sourceId: string,
    configurator: (
      builder: SourceBuilder<TInput, TOutput>
    ) => SourceBuilder<TInput, TOutput> | void
  ): this {
    requireNonEmptyString(sourceId, 'sourceId')

    const builder = new SourceBuilder<TInput, TOutput>(sourceId)
    const result = configurator(builder)
    const finalBuilder = result ?? builder
    const sourceConfig = finalBuilder.build()

    this.sources.push(
      sourceConfig as ConsolidationSource<Record<string, unknown>, TOutput>
    )
    return this
  }

  /**
   * Set the matching scope strategy
   *
   * - `'within-source-first'`: Deduplicate within each source, then match across sources (faster)
   * - `'unified-pool'`: Match across all sources in a unified pool (may find more matches)
   *
   * @param scope - Matching scope ('within-source-first' or 'unified-pool')
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * .matchingScope('within-source-first')
   * ```
   */
  matchingScope(
    scope: 'within-source-first' | 'unified-pool' | MatchingScope
  ): this {
    if (
      scope === 'unified-pool' ||
      (scope as MatchingScope) === MS.UnifiedPool
    ) {
      this.scope = MS.UnifiedPool
    } else if (
      scope === 'within-source-first' ||
      (scope as MatchingScope) === MS.WithinSourceFirst
    ) {
      this.scope = MS.WithinSourceFirst
    } else {
      throw new Error(`Invalid matching scope: ${String(scope)}`)
    }
    return this
  }

  /**
   * Configure conflict resolution for merging records from multiple sources
   *
   * @param configurator - Callback that receives a ConflictResolutionBuilder
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * .conflictResolution(cr => cr
   *   .defaultStrategy('preferNonNull')
   *   .useSourcePriority(true)
   *   .fieldStrategy('email', 'preferNewer')
   *   .fieldStrategy('phone', 'preferNonNull')
   * )
   * ```
   */
  conflictResolution(
    configurator: (
      builder: ConflictResolutionBuilder
    ) => ConflictResolutionBuilder | void
  ): this {
    const builder = new ConflictResolutionBuilder()
    const result = configurator(builder)
    const finalBuilder = result ?? builder
    this.conflictResolutionConfig = finalBuilder.build()
    return this
  }

  /**
   * Set the output adapter for writing golden records
   *
   * @param adapter - Database adapter for output table
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * .outputAdapter(outputAdapter)
   * ```
   */
  outputAdapter(adapter: DatabaseAdapter<TOutput>): this {
    this.outputDatabaseAdapter = adapter
    return this
  }

  /**
   * Whether to write golden records to the output adapter
   *
   * @param write - Whether to write output (default: false)
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * .writeOutput(true)
   * ```
   */
  writeOutput(write: boolean): this {
    this.shouldWriteOutput = write
    return this
  }

  /**
   * Build the consolidation configuration
   *
   * @returns The complete consolidation configuration
   * @throws {Error} If configuration is invalid
   */
  build(): ConsolidationConfig<TOutput> {
    if (this.sources.length === 0) {
      throw new Error('At least one source is required for consolidation')
    }

    if (this.shouldWriteOutput && !this.outputDatabaseAdapter) {
      throw new Error('outputAdapter is required when writeOutput is true')
    }

    return {
      sources: this.sources,
      matchingScope: this.scope,
      conflictResolution: this.conflictResolutionConfig,
      outputAdapter: this.outputDatabaseAdapter,
      writeOutput: this.shouldWriteOutput,
    }
  }
}

/**
 * Builder for configuring conflict resolution
 *
 * @example
 * ```typescript
 * const config = new ConflictResolutionBuilder()
 *   .defaultStrategy('preferNonNull')
 *   .useSourcePriority(true)
 *   .trackProvenance(true)
 *   .fieldStrategy('email', 'preferNewer')
 *   .fieldStrategy('phone', 'preferNonNull')
 *   .build()
 * ```
 */
export class ConflictResolutionBuilder {
  private config: ConflictResolutionConfig = {
    useSourcePriority: true,
    trackProvenance: true,
  }

  /**
   * Set the default merge strategy for fields not specified in fieldStrategies
   *
   * @param strategy - Default merge strategy
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * .defaultStrategy('preferNonNull')
   * ```
   */
  defaultStrategy(strategy: MergeStrategy): this {
    const allowedStrategies: readonly MergeStrategy[] = [
      'preferFirst',
      'preferLast',
      'preferNewer',
      'preferOlder',
      'preferNonNull',
      'preferLonger',
      'preferShorter',
      'concatenate',
      'union',
      'mostFrequent',
      'average',
      'sum',
      'min',
      'max',
    ] as const
    requireOneOf(strategy, allowedStrategies, 'defaultStrategy')
    this.config.defaultStrategy = strategy
    return this
  }

  /**
   * Set per-field merge strategy
   *
   * @param fieldName - Field name
   * @param strategy - Merge strategy for this field
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * .fieldStrategy('email', 'preferNewer')
   * .fieldStrategy('phone', 'preferNonNull')
   * ```
   */
  fieldStrategy(fieldName: string, strategy: MergeStrategy): this {
    requireNonEmptyString(fieldName, 'fieldName')
    const allowedStrategies: readonly MergeStrategy[] = [
      'preferFirst',
      'preferLast',
      'preferNewer',
      'preferOlder',
      'preferNonNull',
      'preferLonger',
      'preferShorter',
      'concatenate',
      'union',
      'mostFrequent',
      'average',
      'sum',
      'min',
      'max',
    ] as const
    requireOneOf(strategy, allowedStrategies, 'fieldStrategy')

    if (!this.config.fieldStrategies) {
      this.config.fieldStrategies = {}
    }
    this.config.fieldStrategies[fieldName] = strategy
    return this
  }

  /**
   * Whether to use source priority for conflict resolution
   *
   * If true, higher priority sources are preferred for conflicting fields.
   * If false, only merge strategies are used.
   *
   * @param use - Whether to use source priority (default: true)
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * .useSourcePriority(true)
   * ```
   */
  useSourcePriority(use: boolean): this {
    this.config.useSourcePriority = use
    return this
  }

  /**
   * Whether to track provenance (source attribution) for merged fields
   *
   * @param track - Whether to track provenance (default: true)
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * .trackProvenance(true)
   * ```
   */
  trackProvenance(track: boolean): this {
    this.config.trackProvenance = track
    return this
  }

  /**
   * Build the conflict resolution configuration
   *
   * @returns The complete conflict resolution configuration
   */
  build(): ConflictResolutionConfig {
    return this.config
  }
}

/**
 * Factory function to create a consolidation builder
 *
 * @template TOutput - Unified output record type
 * @returns A new ConsolidationBuilder instance
 *
 * @example
 * ```typescript
 * import { createConsolidationBuilder } from 'have-we-met'
 *
 * const config = createConsolidationBuilder<Customer>()
 *   .source('crm', source => source
 *     .name('CRM Database')
 *     .adapter(crmAdapter)
 *     .mapping(map => map
 *       .field('email').from('email_address')
 *     )
 *   )
 *   .build()
 * ```
 */
export function createConsolidationBuilder<
  TOutput extends Record<string, unknown>,
>(): ConsolidationBuilder<TOutput> {
  return new ConsolidationBuilder<TOutput>()
}
