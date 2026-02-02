import type { BlockSet, BlockingStrategy, BlockingStats } from './types'

/**
 * Core class for generating blocks from records using blocking strategies.
 * Handles single strategies, composite strategies, and provides statistics.
 */
export class BlockGenerator {
  /**
   * Generates blocks from records using a single blocking strategy.
   *
   * @param records - Array of records to group into blocks
   * @param strategy - Blocking strategy to apply
   * @returns Map of block keys to arrays of records
   */
  generateBlocks<T>(
    records: Array<T>,
    strategy: BlockingStrategy<T>
  ): BlockSet<T> {
    // Handle empty input
    if (records.length === 0) {
      return new Map()
    }

    return strategy.generateBlocks(records)
  }

  /**
   * Generates blocks from records using multiple blocking strategies.
   * Combines blocks using union mode (a pair is compared if they share a block in ANY strategy).
   *
   * @param records - Array of records to group into blocks
   * @param strategies - Array of blocking strategies to apply
   * @returns Map of block keys to arrays of records
   */
  generateBlocksComposite<T>(
    records: Array<T>,
    strategies: Array<BlockingStrategy<T>>
  ): BlockSet<T> {
    // Handle empty input
    if (records.length === 0 || strategies.length === 0) {
      return new Map()
    }

    // Single strategy - use direct generation
    if (strategies.length === 1) {
      return this.generateBlocks(records, strategies[0])
    }

    // Multiple strategies - union mode
    const combinedBlocks = new Map<string, T[]>()

    for (const strategy of strategies) {
      const blocks = strategy.generateBlocks(records)

      for (const [blockKey, blockRecords] of blocks) {
        // Create composite block key: strategyName:blockKey
        const compositeKey = `${strategy.name}:${blockKey}`

        if (!combinedBlocks.has(compositeKey)) {
          combinedBlocks.set(compositeKey, [])
        }

        const existingRecords = combinedBlocks.get(compositeKey)!
        existingRecords.push(...blockRecords)
      }
    }

    return combinedBlocks
  }

  /**
   * Calculates statistics about the blocking operation.
   * Useful for understanding blocking effectiveness and tuning strategies.
   *
   * @param blockSet - The block set to analyze
   * @param uniqueRecordCount - Optional count of unique records (for strategies where records appear in multiple blocks)
   * @returns Blocking statistics
   */
  calculateStats<T>(
    blockSet: BlockSet<T>,
    uniqueRecordCount?: number
  ): BlockingStats {
    const blocks = Array.from(blockSet.values())
    const totalBlocks = blocks.length

    if (totalBlocks === 0) {
      return {
        totalRecords: 0,
        totalBlocks: 0,
        avgRecordsPerBlock: 0,
        minBlockSize: 0,
        maxBlockSize: 0,
        comparisonsWithBlocking: 0,
        comparisonsWithoutBlocking: 0,
        reductionPercentage: 0,
      }
    }

    // Count total record appearances and block sizes
    let totalRecordAppearances = 0
    let minBlockSize = Infinity
    let maxBlockSize = 0
    let comparisonsWithBlocking = 0

    for (const block of blocks) {
      const blockSize = block.length
      totalRecordAppearances += blockSize

      if (blockSize < minBlockSize) minBlockSize = blockSize
      if (blockSize > maxBlockSize) maxBlockSize = blockSize

      // Comparisons within this block: n*(n-1)/2
      if (blockSize > 1) {
        comparisonsWithBlocking += (blockSize * (blockSize - 1)) / 2
      }
    }

    // Determine unique record count
    // If provided explicitly, use that (for strategies with overlapping blocks)
    // Otherwise, count unique records from all blocks
    let totalRecords: number
    if (uniqueRecordCount !== undefined) {
      totalRecords = uniqueRecordCount
    } else {
      // Count unique records using Set
      const uniqueRecords = new Set<string>()
      for (const block of blocks) {
        for (const record of block) {
          uniqueRecords.add(this.getRecordId(record))
        }
      }
      totalRecords = uniqueRecords.size
    }

    // Calculate comparisons without blocking: n*(n-1)/2
    const comparisonsWithoutBlocking =
      totalRecords > 1 ? (totalRecords * (totalRecords - 1)) / 2 : 0

    // Calculate reduction percentage
    const reductionPercentage =
      comparisonsWithoutBlocking > 0
        ? ((comparisonsWithoutBlocking - comparisonsWithBlocking) /
            comparisonsWithoutBlocking) *
          100
        : 0

    return {
      totalRecords,
      totalBlocks,
      avgRecordsPerBlock: totalRecordAppearances / totalBlocks,
      minBlockSize: minBlockSize === Infinity ? 0 : minBlockSize,
      maxBlockSize,
      comparisonsWithBlocking,
      comparisonsWithoutBlocking,
      reductionPercentage,
    }
  }

  /**
   * Extracts blocking keys from a single record for database queries.
   * Used to efficiently query the database for potential matches.
   *
   * @param record - The record to extract blocking keys from
   * @param strategy - Blocking strategy to apply
   * @returns Map of field names to block values
   */
  extractBlockingKeys<T>(
    record: T,
    strategy: BlockingStrategy<T>
  ): Map<string, unknown> {
    const tempBlocks = strategy.generateBlocks([record])

    const blockingKeys = new Map<string, unknown>()

    for (const [blockKey] of tempBlocks) {
      const parts = blockKey.split(':')
      if (parts.length >= 2) {
        const field = parts[0]
        const value = parts.slice(1).join(':')
        blockingKeys.set(field, value)
      } else if (parts.length === 1) {
        const rawRecord = record as Record<string, unknown>
        for (const key in rawRecord) {
          if (Object.prototype.hasOwnProperty.call(rawRecord, key)) {
            blockingKeys.set(key, rawRecord[key])
          }
        }
      }
    }

    return blockingKeys
  }

  /**
   * Generates all unique pairs from a block set.
   * Each pair will be compared exactly once.
   *
   * @param blockSet - The block set to generate pairs from
   * @returns Array of record pairs
   */
  generatePairs<T>(blockSet: BlockSet<T>): Array<[T, T]> {
    const pairs: Array<[T, T]> = []
    const seenPairs = new Set<string>()

    for (const block of blockSet.values()) {
      // Generate all pairs within this block
      for (let i = 0; i < block.length; i++) {
        for (let j = i + 1; j < block.length; j++) {
          const record1 = block[i]
          const record2 = block[j]

          // Create a stable pair key to avoid duplicates
          // This handles cases where records appear in multiple blocks
          const pairKey = this.createPairKey(record1, record2)

          if (!seenPairs.has(pairKey)) {
            seenPairs.add(pairKey)
            pairs.push([record1, record2])
          }
        }
      }
    }

    return pairs
  }

  /**
   * Creates a stable key for a pair of records to detect duplicates.
   * Uses object identity or stringification.
   *
   * @param record1 - First record
   * @param record2 - Second record
   * @returns Stable pair key
   */
  private createPairKey<T>(record1: T, record2: T): string {
    // Use object identity if available (works for objects)
    const id1 = this.getRecordId(record1)
    const id2 = this.getRecordId(record2)

    // Sort IDs to make the key stable (independent of order)
    const [first, second] = id1 < id2 ? [id1, id2] : [id2, id1]
    return `${first}|||${second}`
  }

  /**
   * Gets a stable identifier for a record.
   * Tries to use record.id if available, otherwise uses JSON stringification.
   *
   * @param record - The record to identify
   * @returns Stable record identifier
   */
  private getRecordId<T>(record: T): string {
    // Check if record has an id field
    if (
      record &&
      typeof record === 'object' &&
      'id' in record &&
      (typeof record.id === 'string' || typeof record.id === 'number')
    ) {
      return String(record.id)
    }

    // Fallback to JSON stringification (stable for objects)
    try {
      return JSON.stringify(record)
    } catch {
      // If stringification fails, use object reference
      return String(record)
    }
  }
}
