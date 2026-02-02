import type {
  SchemaDefinition,
  MatchingConfig,
  ThresholdConfig,
  BlockingConfig,
} from '../types'
import type { DatabaseAdapter } from '../adapters/types'
import type { MergeConfig } from '../merge/types.js'
import type { ServicesConfig } from '../services/types.js'
import { Resolver } from '../core/resolver'
import { SchemaBuilder } from './schema-builder'
import { MatchingBuilder, FieldMatchBuilder } from './matching-builder'
import { BlockingBuilder } from './blocking-builder'
import { MergeBuilder, FieldMergeBuilder } from './merge-builder.js'
import {
  ServiceBuilder,
  ValidationServiceBuilder,
  LookupServiceBuilder,
  CustomServiceBuilder,
  type ServiceBuilderResult,
} from './service-builder.js'
import {
  MLBuilder,
  FieldFeatureBuilder,
  type MLBuilderConfig,
  type MLBuilderResult,
} from '../ml/integration/builder-integration.js'

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
export class ResolverBuilder<
  T extends Record<string, unknown> = Record<string, unknown>,
> {
  private schemaDefinition?: SchemaDefinition<T>
  private matchingConfig?: MatchingConfig
  private blockingConfiguration?: BlockingConfig<T>
  private databaseAdapter?: DatabaseAdapter<T>
  private mergeConfiguration?: MergeConfig
  private servicesConfiguration?: ServicesConfig
  private mlConfiguration?: MLBuilderConfig<T>

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
    configurator: (
      builder: MatchingBuilder
    ) => MatchingBuilder | FieldMatchBuilder | void
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
   * Configure external services for validation, enrichment, and custom processing.
   *
   * External services integrate with third-party systems for identity verification
   * and data enrichment. Services can run before matching (pre-match) or after
   * matching (post-match).
   *
   * @param configurator - Callback that receives a ServiceBuilder
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * .services(services => services
   *   .defaultTimeout(5000)
   *   .defaultRetry({ maxAttempts: 3, initialDelayMs: 100, backoffMultiplier: 2, maxDelayMs: 1000 })
   *   .caching(true)
   *
   *   .validate('nhsNumber')
   *     .using(nhsNumberValidator)
   *     .onInvalid('reject')
   *     .required(true)
   *
   *   .validate('email')
   *     .using(emailValidator)
   *     .onInvalid('flag')
   *     .cache({ enabled: true, ttlSeconds: 3600 })
   *
   *   .lookup('address')
   *     .using(addressStandardization)
   *     .mapFields({
   *       'streetAddress': 'address.street',
   *       'city': 'address.city',
   *       'postalCode': 'address.postcode'
   *     })
   *     .onNotFound('continue')
   *
   *   .custom('fraudCheck')
   *     .using(fraudDetectionService)
   *     .executeAt('post-match')
   *     .onResult(r => r.result.riskScore < 0.7)
   * )
   * ```
   */
  services(
    configurator: (builder: ServiceBuilder<T>) => ServiceBuilderResult<T>
  ): this {
    const builder = new ServiceBuilder<T>()
    const result = configurator(builder)

    // Handle different return types
    if (result instanceof ValidationServiceBuilder) {
      result.finalize()
      this.servicesConfiguration = result._parent.build()
    } else if (result instanceof LookupServiceBuilder) {
      result.finalize()
      this.servicesConfiguration = result._parent.build()
    } else if (result instanceof CustomServiceBuilder) {
      result.finalize()
      this.servicesConfiguration = result._parent.build()
    } else {
      this.servicesConfiguration = (result ?? builder).build()
    }

    return this
  }

  /**
   * Get the configured services configuration.
   * Useful for inspecting the services configuration before building.
   *
   * @returns The services configuration or undefined if not configured
   */
  getServicesConfig(): ServicesConfig | undefined {
    return this.servicesConfiguration
  }

  /**
   * Configure ML matching for enhanced identity resolution.
   *
   * ML matching can work alongside probabilistic matching (hybrid mode),
   * replace it entirely (mlOnly mode), or provide a fallback for uncertain
   * probabilistic results (fallback mode).
   *
   * @param configurator - Callback that receives an MLBuilder
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * // Use built-in pre-trained model with hybrid mode
   * .ml(ml => ml
   *   .usePretrained()
   *   .mode('hybrid')
   *   .mlWeight(0.4)  // 40% ML, 60% probabilistic
   * )
   *
   * // Use custom model with ML-only mode
   * .ml(ml => ml
   *   .model(myTrainedClassifier)
   *   .mode('mlOnly')
   *   .matchThreshold(0.8)
   * )
   *
   * // Configure custom feature extraction
   * .ml(ml => ml
   *   .usePretrained()
   *   .mode('hybrid')
   *   .field('firstName').forName().weight(1.2)
   *   .field('email').forIdentifier().weight(1.5)
   *   .field('dateOfBirth').forDate()
   * )
   * ```
   */
  ml(configurator: (builder: MLBuilder<T>) => MLBuilderResult<T>): this {
    const builder = new MLBuilder<T>()
    const result = configurator(builder)

    // Handle different return types
    if (result instanceof FieldFeatureBuilder) {
      result.finalize()
      this.mlConfiguration = result.parent.build()
    } else if (result instanceof MLBuilder) {
      this.mlConfiguration = result.build()
    } else {
      this.mlConfiguration = builder.build()
    }

    return this
  }

  /**
   * Get the configured ML configuration.
   * Useful for inspecting the ML configuration before building.
   *
   * @returns The ML configuration or undefined if not configured
   */
  getMLConfig(): MLBuilderConfig<T> | undefined {
    return this.mlConfiguration
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
      services: this.servicesConfiguration,
      ml: this.mlConfiguration,
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
  create<
    T extends Record<string, unknown> = Record<string, unknown>,
  >(): ResolverBuilder<T> {
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
