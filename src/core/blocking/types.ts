/**
 * A string identifier for a block.
 * Records with the same block key are grouped together for comparison.
 */
export type BlockKey = string

/**
 * A map of block keys to arrays of records within that block.
 * Records within the same block will be compared against each other.
 */
export type BlockSet<T = unknown> = Map<BlockKey, Array<T>>

/**
 * Statistics about the blocking operation.
 */
export interface BlockingStats {
  /** Total number of records processed */
  totalRecords: number
  /** Number of unique blocks created */
  totalBlocks: number
  /** Average number of records per block */
  avgRecordsPerBlock: number
  /** Minimum records in any block */
  minBlockSize: number
  /** Maximum records in any block */
  maxBlockSize: number
  /** Number of comparisons with blocking (estimate) */
  comparisonsWithBlocking: number
  /** Number of comparisons without blocking (n*(n-1)/2) */
  comparisonsWithoutBlocking: number
  /** Percentage of comparisons reduced */
  reductionPercentage: number
}

/**
 * Interface that all blocking strategies must implement.
 * A blocking strategy determines how records are grouped into blocks.
 */
export interface BlockingStrategy<T = unknown> {
  /** Unique name for this blocking strategy */
  readonly name: string

  /**
   * Generates blocks from an array of records.
   * Records with the same block key will be compared against each other.
   *
   * @param records - Array of records to group into blocks
   * @returns Map of block keys to arrays of records
   */
  generateBlocks(records: Array<T>): BlockSet<T>
}

/**
 * Configuration for the blocking system.
 */
export interface BlockingConfig<T = unknown> {
  /** Blocking strategies to apply */
  strategies: Array<BlockingStrategy<T>>
  /** Mode for combining multiple strategies */
  mode: 'single' | 'composite' | 'union'
  /** Strategy for handling null/undefined values in blocking fields */
  nullStrategy?: 'skip' | 'block' | 'compare'
}
