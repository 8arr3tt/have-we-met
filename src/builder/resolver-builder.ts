import type {
  SchemaDefinition,
  MatchingConfig,
  ThresholdConfig,
  BlockingConfig,
} from '../types'
import type { DatabaseAdapter } from '../adapters/types'
import type { MergeConfig } from '../merge/types.js'
import { Resolver } from '../core/resolver'
import { SchemaBuilder } from './schema-builder'
import { MatchingBuilder, FieldMatchBuilder } from './matching-builder'
import { BlockingBuilder } from './blocking-builder'
import { MergeBuilder, FieldMergeBuilder } from './merge-builder.js'

/**
 * Fluent builder for configuring and creating a Resolver instance.
 *
 * @example
 * ```typescript
 * const resolver = HaveWeMet.create<Person>()
 *   .schema(schema => {
 *     schema
 *       .field('firstName', { type: 'name', component: 'first' })
 *       .field('lastName', { type: 'name', component: 'last' })
 *       .field('email', { type: 'email' })
 *   })
 *   .matching(match => {
 *     match
 *       .field('email').strategy('exact').weight(20)
 *       .field('firstName').strategy('jaro-winkler').weight(10).threshold(0.85)
 *       .field('lastName').strategy('jaro-winkler').weight(10).threshold(0.85)
 *       .thresholds({ noMatch: 20, definiteMatch: 45 })
 *   })
 *   .build()
 * ```
 *
 * @typeParam T - The record type being matched
 */
export class ResolverBuilder<T extends Record<string, unknown> = Record<string, unknown>> {
  private schemaDefinition?: SchemaDefinition<T>
  private matchingConfig?: MatchingConfig
  private blockingConfiguration?: BlockingConfig<T>
  private databaseAdapter?: DatabaseAdapter<T>
  private mergeConfiguration?: MergeConfig

  /**
   * Configure the schema defining field types and normalizers.
   *
   * @param configurator - Callback that receives a SchemaBuilder
   * @returns This builder for chaining
   */
  schema(
    configurator: (builder: SchemaBuilder<T>) => SchemaBuilder<T> | void
  ): this {
    const builder = new SchemaBuilder<T>()
    const result = configurator(builder)
    this.schemaDefinition = (result ?? builder).build()
    return this
  }

  /**
   * Configure blocking strategies to reduce comparisons.
   *
   * Blocking can reduce O(n²) comparisons by 95-99%+ for large datasets.
   *
   * @param configurator - Callback that receives a BlockingBuilder
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * .blocking(block => block
   *   .onField('lastName', { transform: 'soundex' })
   * )
   * ```
   */
  blocking(
    configurator: (builder: BlockingBuilder<T>) => BlockingBuilder<T> | void
  ): this {
    const builder = new BlockingBuilder<T>()
    const result = configurator(builder)
    this.blockingConfiguration = (result ?? builder).build()
    return this
  }

  /**
   * Configure field comparisons and weights for probabilistic matching.
   *
   * @param configurator - Callback that receives a MatchingBuilder
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * .matching(match => {
   *   match
   *     .field('email').strategy('exact').weight(20)
   *     .field('firstName').strategy('jaro-winkler').weight(10).threshold(0.85)
   *     .field('lastName').strategy('jaro-winkler').weight(10).threshold(0.85)
   *     .thresholds({ noMatch: 20, definiteMatch: 45 })
   * })
   * ```
   */
  matching(
    configurator: (builder: MatchingBuilder) => MatchingBuilder | FieldMatchBuilder | void
  ): this {
    const builder = new MatchingBuilder()
    const result = configurator(builder)
    this.matchingConfig = (result ?? builder).build()
    return this
  }

  /**
   * Configure thresholds for three-tier outcome classification.
   *
   * @param config - Threshold configuration
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * .thresholds({ noMatch: 20, definiteMatch: 45 })
   * ```
   */
  thresholds(config: ThresholdConfig): this {
    if (!this.matchingConfig) {
      this.matchingConfig = {
        fields: new Map(),
        thresholds: config,
      }
    } else {
      this.matchingConfig.thresholds = config
    }
    return this
  }

  /**
   * Configure a database adapter for persistent storage integration.
   *
   * Database adapters enable efficient querying and deduplication of records
   * stored in databases using blocking strategies.
   *
   * @param adapter - Database adapter instance (Prisma, Drizzle, TypeORM, etc.)
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * import { prismaAdapter } from 'have-we-met/adapters/prisma'
   *
   * const resolver = HaveWeMet.create<Customer>()
   *   .schema(schema => { ... })
   *   .matching(match => { ... })
   *   .adapter(prismaAdapter(prisma, { tableName: 'customers' }))
   *   .build()
   *
   * const results = await resolver.resolveWithDatabase(newCustomer)
   * ```
   */
  adapter(adapter: DatabaseAdapter<T>): this {
    this.databaseAdapter = adapter
    return this
  }

  /**
   * Configure merge strategies for golden record creation.
   *
   * Merge strategies determine how field values from multiple source records
   * are combined when creating a golden record.
   *
   * @param configurator - Callback that receives a MergeBuilder
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * .merge(merge => merge
   *   .timestampField('updatedAt')
   *   .defaultStrategy('preferNonNull')
   *   .onConflict('useDefault')
   *   .field('firstName').strategy('preferLonger')
   *   .field('lastName').strategy('preferLonger')
   *   .field('email').strategy('preferNewer')
   *   .field('phone').strategy('preferNonNull')
   *   .field('addresses').strategy('union')
   * )
   * ```
   */
  merge(
    configurator: (
      builder: MergeBuilder<T>
    ) => MergeBuilder<T> | FieldMergeBuilder<T> | void
  ): this {
    const builder = new MergeBuilder<T>(this.schemaDefinition)
    const result = configurator(builder)

    // If result is a FieldMergeBuilder, finalize it and get parent
    if (result instanceof FieldMergeBuilder) {
      result.finalize()
      this.mergeConfiguration = result._parent.build()
    } else {
      this.mergeConfiguration = (result ?? builder).build()
    }

    return this
  }

  /**
   * Get the configured merge configuration.
   * Useful for inspecting the merge configuration before building.
   *
   * @returns The merge configuration or undefined if not configured
   */
  getMergeConfig(): MergeConfig | undefined {
    return this.mergeConfiguration
  }

  /**
   * Build and return the configured Resolver instance.
   *
   * @returns Configured Resolver ready for matching operations
   * @throws Error if schema or matching configuration is missing
   */
  build(): Resolver<T> {
    if (!this.schemaDefinition) {
      throw new Error('Schema must be configured before building')
    }
    if (!this.matchingConfig) {
      throw new Error('Matching must be configured before building')
    }

    return new Resolver<T>({
      schema: this.schemaDefinition,
      matching: this.matchingConfig,
      blocking: this.blockingConfiguration,
      adapter: this.databaseAdapter,
    })
  }
}

/**
 * Main entry point for creating a resolver using the fluent builder API.
 *
 * @example
 * ```typescript
 * import { HaveWeMet } from 'have-we-met'
 *
 * interface Person {
 *   firstName: string
 *   lastName: string
 *   email: string
 * }
 *
 * const resolver = HaveWeMet.create<Person>()
 *   .schema(schema => { ... })
 *   .matching(match => { ... })
 *   .build()
 * ```
 */
export const HaveWeMet = {
  /**
   * Create a new resolver builder.
   *
   * @typeParam T - The record type being matched
   * @returns A new ResolverBuilder instance
   */
  create<T extends Record<string, unknown> = Record<string, unknown>>(): ResolverBuilder<T> {
    return new ResolverBuilder<T>()
  },

  /**
   * Shortcut to create a builder with schema configuration.
   * Equivalent to `HaveWeMet.create<T>().schema(...)`
   *
   * @param schemaDefinition - Schema definition object with field definitions
   * @returns A ResolverBuilder with the schema configured
   */
  schema<T extends Record<string, unknown> = Record<string, unknown>>(
    schemaDefinition: SchemaDefinition<T>
  ): ResolverBuilder<T> {
    const builder = new ResolverBuilder<T>()
    builder['schemaDefinition'] = schemaDefinition
    return builder
  },
}
