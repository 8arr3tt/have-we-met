import type { BlockingStrategy, BlockSet, BlockKey } from '../types'

/**
 * Mode for combining multiple blocking strategies.
 */
export type CompositeMode = 'union' | 'intersection'

/**
 * Configuration for composite blocking strategy.
 */
export interface CompositeBlockingConfig<T = unknown> {
  /** Array of blocking strategies to combine */
  strategies: Array<BlockingStrategy<T>>
  /** How to combine the strategies (default: 'union') */
  mode?: CompositeMode
}

/**
 * Composite blocking strategy that combines multiple blocking strategies.
 *
 * In union mode, records are compared if they share a block in ANY strategy (higher recall, more comparisons).
 * In intersection mode, records are compared only if they share a block in ALL strategies (lower recall, fewer comparisons).
 *
 * @example
 * ```typescript
 * // Union: Block on last name OR year of birth
 * const strategy = new CompositeBlockingStrategy({
 *   strategies: [
 *     new StandardBlockingStrategy({ field: 'lastName', transform: 'soundex' }),
 *     new StandardBlockingStrategy({ field: 'dateOfBirth', transform: 'year' })
 *   ],
 *   mode: 'union'
 * })
 *
 * // Intersection: Block on last name AND year of birth
 * const strategy = new CompositeBlockingStrategy({
 *   strategies: [
 *     new StandardBlockingStrategy({ field: 'lastName', transform: 'firstLetter' }),
 *     new StandardBlockingStrategy({ field: 'dateOfBirth', transform: 'year' })
 *   ],
 *   mode: 'intersection'
 * })
 * ```
 */
export class CompositeBlockingStrategy<
  T = unknown,
> implements BlockingStrategy<T> {
  readonly name: string
  private strategies: Array<BlockingStrategy<T>>
  private mode: CompositeMode

  constructor(config: CompositeBlockingConfig<T>) {
    if (!config.strategies || config.strategies.length === 0) {
      throw new Error(
        'CompositeBlockingStrategy requires at least one strategy'
      )
    }

    this.strategies = config.strategies
    this.mode = config.mode ?? 'union'
    this.name = this.generateStrategyName()
  }

  /**
   * Generates blocks from records by combining multiple strategies.
   *
   * @param records - Array of records to group into blocks
   * @returns Map of block keys to arrays of records
   */
  generateBlocks(records: Array<T>): BlockSet<T> {
    // Handle empty input
    if (records.length === 0) {
      return new Map()
    }

    // Handle single strategy (passthrough)
    if (this.strategies.length === 1) {
      return this.strategies[0].generateBlocks(records)
    }

    // Generate blocks using each strategy
    const allBlockSets = this.strategies.map((strategy) =>
      strategy.generateBlocks(records)
    )

    // Combine based on mode
    if (this.mode === 'union') {
      return this.generateUnionBlocks(allBlockSets)
    } else {
      return this.generateIntersectionBlocks(records, allBlockSets)
    }
  }

  /**
   * Generates union blocks by combining blocks from all strategies.
   *
   * Records are compared if they appear in the same block in ANY strategy.
   * This increases recall but also increases the number of comparisons.
   *
   * @param blockSets - Array of block sets from each strategy
   * @returns Combined block set
   */
  private generateUnionBlocks(blockSets: Array<BlockSet<T>>): BlockSet<T> {
    const unionBlocks = new Map<BlockKey, Array<T>>()

    // Process each strategy's blocks
    for (
      let strategyIndex = 0;
      strategyIndex < blockSets.length;
      strategyIndex++
    ) {
      const blockSet = blockSets[strategyIndex]

      for (const [blockKey, records] of blockSet.entries()) {
        // Prefix block key with strategy index to avoid key collisions between strategies
        const prefixedKey = `s${strategyIndex}:${blockKey}`

        // Add records to the union block
        unionBlocks.set(prefixedKey, records)
      }
    }

    return unionBlocks
  }

  /**
   * Generates intersection blocks by finding records that appear in blocks across ALL strategies.
   *
   * Records are compared only if they appear in the same block in ALL strategies.
   * This reduces comparisons but also reduces recall.
   *
   * @param records - Original array of records
   * @param blockSets - Array of block sets from each strategy
   * @returns Intersection block set
   */
  private generateIntersectionBlocks(
    records: Array<T>,
    blockSets: Array<BlockSet<T>>
  ): BlockSet<T> {
    const intersectionBlocks = new Map<BlockKey, Array<T>>()

    // Build a mapping from record to block keys for each strategy
    const recordToBlockKeys = new Map<T, string[]>()

    for (const record of records) {
      const blockKeys: string[] = []

      // Find which block this record belongs to in each strategy
      for (const blockSet of blockSets) {
        let foundBlockKey: string | null = null

        for (const [blockKey, blockRecords] of blockSet.entries()) {
          if (blockRecords.includes(record)) {
            foundBlockKey = blockKey
            break
          }
        }

        if (foundBlockKey !== null) {
          blockKeys.push(foundBlockKey)
        } else {
          // Record not in any block for this strategy - can't be in intersection
          break
        }
      }

      // Only include record if it appears in a block for ALL strategies
      if (blockKeys.length === blockSets.length) {
        recordToBlockKeys.set(record, blockKeys)
      }
    }

    // Group records by their composite block key (combination of block keys from all strategies)
    for (const [record, blockKeys] of recordToBlockKeys.entries()) {
      // Create a composite key representing the intersection of all blocks
      const compositeKey = blockKeys.join('|')

      if (!intersectionBlocks.has(compositeKey)) {
        intersectionBlocks.set(compositeKey, [])
      }
      intersectionBlocks.get(compositeKey)!.push(record)
    }

    return intersectionBlocks
  }

  /**
   * Generates a descriptive name for this strategy based on configuration.
   *
   * @returns Strategy name
   */
  private generateStrategyName(): string {
    const strategyNames = this.strategies.map((s) => s.name).join('+')
    return `composite:${this.mode}:[${strategyNames}]`
  }
}
