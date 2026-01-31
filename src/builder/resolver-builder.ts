import type {
  SchemaDefinition,
  MatchingConfig,
  ThresholdConfig,
  BlockingConfig,
} from '../types'
import { Resolver } from '../core/resolver'
import { SchemaBuilder } from './schema-builder'
import { MatchingBuilder, FieldMatchBuilder } from './matching-builder'
import { BlockingBuilder } from './blocking-builder'

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
}
