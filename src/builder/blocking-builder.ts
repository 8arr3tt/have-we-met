import type { BlockingConfig } from '../types'
import type { BlockTransform, FirstNOptions } from '../core/blocking/transforms'
import type {
  SortField,
  SortOrder,
} from '../core/blocking/strategies/sorted-neighbourhood'
import type { NullStrategy } from '../core/blocking/strategies/standard-blocking'
import {
  StandardBlockingStrategy,
  SortedNeighbourhoodStrategy,
  CompositeBlockingStrategy,
} from '../core/blocking'
import type { BlockingStrategy } from '../core/blocking/types'

/**
 * Builder for configuring composite blocking strategies.
 * Used within the `.composite()` method to define multiple strategies.
 */
export class CompositeBlockingBuilder<T extends object = object> {
  private strategies: Array<BlockingStrategy<T>> = []

  /**
   * Adds a standard blocking strategy on a single field.
   *
   * @param field - The field to block on
   * @param options - Optional configuration
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * .composite('union', comp => comp
   *   .onField('lastName', { transform: 'soundex' })
   *   .onField('dateOfBirth', { transform: 'year' })
   * )
   * ```
   */
  onField<K extends keyof T & string>(
    field: K,
    options?: {
      transform?: BlockTransform
      transformOptions?: FirstNOptions
      nullStrategy?: NullStrategy
      normalizeKeys?: boolean
    }
  ): this {
    const strategy = new StandardBlockingStrategy<T>({
      field: field as string,
      transform: options?.transform,
      transformOptions: options?.transformOptions,
      nullStrategy: options?.nullStrategy,
      normalizeKeys: options?.normalizeKeys,
    })

    this.strategies.push(strategy)
    return this
  }

  /**
   * Adds a standard blocking strategy on multiple fields.
   *
   * @param fields - Array of fields to block on
   * @param options - Optional configuration
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * .composite('union', comp => comp
   *   .onFields(['lastName', 'firstName'], {
   *     transforms: ['soundex', 'firstLetter']
   *   })
   * )
   * ```
   */
  onFields(
    fields: Array<keyof T & string>,
    options?: {
      transforms?: Array<BlockTransform | undefined>
      transformOptions?: Array<FirstNOptions | undefined>
      nullStrategy?: NullStrategy
      normalizeKeys?: boolean
    }
  ): this {
    const strategy = new StandardBlockingStrategy<T>({
      fields: fields as string[],
      transforms: options?.transforms,
      transformOptions: options?.transformOptions,
      nullStrategy: options?.nullStrategy,
      normalizeKeys: options?.normalizeKeys,
    })

    this.strategies.push(strategy)
    return this
  }

  /**
   * Adds a sorted neighbourhood blocking strategy.
   *
   * @param field - Field(s) to sort by
   * @param options - Configuration including window size
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * .composite('union', comp => comp
   *   .sortedNeighbourhood('lastName', { windowSize: 10, transform: 'soundex' })
   * )
   * ```
   */
  sortedNeighbourhood<K extends keyof T & string>(
    field: K | K[] | SortField | SortField[],
    options: {
      windowSize: number
      transform?: BlockTransform
      transformOptions?: FirstNOptions
      order?: SortOrder
      nullStrategy?: NullStrategy
    }
  ): this {
    // Convert simple field to SortField format
    let sortBy: string | SortField | Array<string | SortField>

    if (Array.isArray(field)) {
      sortBy = field.map((f) =>
        typeof f === 'string'
          ? {
              field: f,
              transform: options.transform,
              transformOptions: options.transformOptions,
              order: options.order,
            }
          : f
      )
    } else if (typeof field === 'string') {
      sortBy = {
        field,
        transform: options.transform,
        transformOptions: options.transformOptions,
        order: options.order,
      }
    } else {
      sortBy = field
    }

    const strategy = new SortedNeighbourhoodStrategy<T>({
      sortBy,
      windowSize: options.windowSize,
      nullStrategy: options.nullStrategy,
    })

    this.strategies.push(strategy)
    return this
  }

  /**
   * Gets the configured strategies for the parent builder.
   *
   * @returns Array of blocking strategies
   */
  getStrategies(): Array<BlockingStrategy<T>> {
    return this.strategies
  }
}

/**
 * Builder for configuring blocking strategies in the fluent API.
 *
 * Blocking strategies reduce O(n²) comparisons by grouping records into blocks.
 * Records within the same block will be compared against each other.
 *
 * @typeParam T - The shape of the user's data object
 *
 * @example
 * ```typescript
 * HaveWeMet
 *   .create<Person>()
 *   .schema(/* ... *\/)
 *   .blocking(block => block
 *     .onField('lastName', { transform: 'soundex' })
 *   )
 *   .matching(/* ... *\/)
 * ```
 */
export class BlockingBuilder<T extends object = object> {
  private strategies: Array<BlockingStrategy<T>> = []
  private nullStrategyConfig?: NullStrategy

  /**
   * Configures standard blocking on a single field.
   *
   * @param field - The field to block on
   * @param options - Optional configuration
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * .blocking(block => block
   *   .onField('lastName', { transform: 'soundex' })
   * )
   * ```
   *
   * @example
   * ```typescript
   * .blocking(block => block
   *   .onField('dateOfBirth', { transform: 'year' })
   * )
   * ```
   */
  onField<K extends keyof T & string>(
    field: K,
    options?: {
      transform?: BlockTransform
      transformOptions?: FirstNOptions
      nullStrategy?: NullStrategy
      normalizeKeys?: boolean
    }
  ): this {
    const strategy = new StandardBlockingStrategy<T>({
      field: field as string,
      transform: options?.transform,
      transformOptions: options?.transformOptions,
      nullStrategy: options?.nullStrategy ?? this.nullStrategyConfig,
      normalizeKeys: options?.normalizeKeys,
    })

    this.strategies.push(strategy)
    return this
  }

  /**
   * Configures standard blocking on multiple fields (composite key).
   *
   * @param fields - Array of fields to block on
   * @param options - Optional configuration
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * .blocking(block => block
   *   .onFields(['lastName', 'dateOfBirth'], {
   *     transforms: ['firstLetter', 'year']
   *   })
   * )
   * ```
   */
  onFields(
    fields: Array<keyof T & string>,
    options?: {
      transforms?: Array<BlockTransform | undefined>
      transformOptions?: Array<FirstNOptions | undefined>
      nullStrategy?: NullStrategy
      normalizeKeys?: boolean
    }
  ): this {
    const strategy = new StandardBlockingStrategy<T>({
      fields: fields as string[],
      transforms: options?.transforms,
      transformOptions: options?.transformOptions,
      nullStrategy: options?.nullStrategy ?? this.nullStrategyConfig,
      normalizeKeys: options?.normalizeKeys,
    })

    this.strategies.push(strategy)
    return this
  }

  /**
   * Configures sorted neighbourhood blocking.
   *
   * Records are sorted by specified field(s) and compared within a sliding window.
   * This is useful when standard blocking is too restrictive (e.g., typos would
   * separate matches into different blocks).
   *
   * @param field - Field(s) to sort by
   * @param options - Configuration including window size
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * .blocking(block => block
   *   .sortedNeighbourhood('lastName', { windowSize: 10 })
   * )
   * ```
   *
   * @example
   * ```typescript
   * .blocking(block => block
   *   .sortedNeighbourhood('lastName', {
   *     windowSize: 20,
   *     transform: 'soundex'
   *   })
   * )
   * ```
   */
  sortedNeighbourhood<K extends keyof T & string>(
    field: K | K[] | SortField | SortField[],
    options: {
      windowSize: number
      transform?: BlockTransform
      transformOptions?: FirstNOptions
      order?: SortOrder
      nullStrategy?: NullStrategy
    }
  ): this {
    // Convert simple field to SortField format
    let sortBy: string | SortField | Array<string | SortField>

    if (Array.isArray(field)) {
      sortBy = field.map((f) =>
        typeof f === 'string'
          ? {
              field: f,
              transform: options.transform,
              transformOptions: options.transformOptions,
              order: options.order,
            }
          : f
      )
    } else if (typeof field === 'string') {
      sortBy = {
        field,
        transform: options.transform,
        transformOptions: options.transformOptions,
        order: options.order,
      }
    } else {
      sortBy = field
    }

    const strategy = new SortedNeighbourhoodStrategy<T>({
      sortBy,
      windowSize: options.windowSize,
      nullStrategy: options.nullStrategy ?? this.nullStrategyConfig,
    })

    this.strategies.push(strategy)
    return this
  }

  /**
   * Configures composite blocking with multiple strategies.
   *
   * In union mode, records are compared if they share a block in ANY strategy (higher recall).
   * In intersection mode, records are compared only if they share a block in ALL strategies (lower recall).
   *
   * @param mode - 'union' or 'intersection'
   * @param configurator - Function to configure strategies
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * .blocking(block => block
   *   .composite('union', comp => comp
   *     .onField('lastName', { transform: 'soundex' })
   *     .onField('dateOfBirth', { transform: 'year' })
   *   )
   * )
   * ```
   */
  composite(
    mode: 'union' | 'intersection',
    configurator: (
      builder: CompositeBlockingBuilder<T>
    ) => CompositeBlockingBuilder<T> | void
  ): this {
    const compositeBuilder = new CompositeBlockingBuilder<T>()
    const result = configurator(compositeBuilder)
    const strategies = (result ?? compositeBuilder).getStrategies()

    if (strategies.length === 0) {
      throw new Error('Composite blocking requires at least one strategy')
    }

    const compositeStrategy = new CompositeBlockingStrategy<T>({
      strategies,
      mode,
    })

    this.strategies.push(compositeStrategy)
    return this
  }

  /**
   * Sets the default null handling strategy for all blocking operations.
   *
   * @param strategy - 'skip' | 'block' | 'compare'
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * .blocking(block => block
   *   .nullStrategy('skip')
   *   .onField('lastName', { transform: 'soundex' })
   * )
   * ```
   */
  nullStrategy(strategy: NullStrategy): this {
    this.nullStrategyConfig = strategy
    return this
  }

  /**
   * Builds the blocking configuration.
   *
   * @returns Blocking configuration for the resolver
   */
  build(): BlockingConfig<T> {
    if (this.strategies.length === 0) {
      throw new Error('At least one blocking strategy must be configured')
    }

    // If multiple strategies are configured without explicit composite,
    // automatically use union mode
    const mode = this.strategies.length === 1 ? 'single' : 'union'

    return {
      strategies: this.strategies,
      mode,
      nullStrategy: this.nullStrategyConfig,
    }
  }
}
