import type {
  DatabaseAdapter,
  AdapterConfig,
  QueryOptions,
  FilterCriteria,
} from './types'
import { ValidationError } from './adapter-error'

/**
 * Abstract base class providing common functionality for database adapters.
 * Concrete adapters (Prisma, Drizzle, TypeORM) extend this class and implement
 * the database-specific methods.
 *
 * @typeParam T - The record type being stored and queried
 */
export abstract class BaseAdapter<
  T extends Record<string, unknown>,
> implements DatabaseAdapter<T> {
  protected readonly config: Required<AdapterConfig>

  /**
   * Creates a new base adapter instance.
   * Validates configuration and sets default values.
   *
   * @param config - Adapter configuration
   * @throws {ValidationError} If configuration is invalid
   */
  constructor(config: AdapterConfig) {
    this.validateConfig(config)

    this.config = {
      tableName: config.tableName,
      primaryKey: config.primaryKey ?? 'id',
      fieldMapping: config.fieldMapping ?? {},
      usePreparedStatements: config.usePreparedStatements ?? true,
      poolConfig: config.poolConfig ?? {},
      queue: config.queue ?? {},
    }
  }

  /**
   * Validates adapter configuration.
   * Ensures all required fields are present and valid.
   *
   * @param config - Configuration to validate
   * @throws {ValidationError} If configuration is invalid
   */
  protected validateConfig(config: AdapterConfig): void {
    if (!config.tableName || typeof config.tableName !== 'string') {
      throw new ValidationError(
        'Missing or invalid required field: tableName',
        {
          config,
        }
      )
    }

    if (config.tableName.trim().length === 0) {
      throw new ValidationError('tableName cannot be empty', { config })
    }

    if (
      config.primaryKey !== undefined &&
      typeof config.primaryKey !== 'string'
    ) {
      throw new ValidationError('primaryKey must be a string', { config })
    }

    if (
      config.fieldMapping !== undefined &&
      typeof config.fieldMapping !== 'object'
    ) {
      throw new ValidationError('fieldMapping must be an object', { config })
    }

    if (
      config.usePreparedStatements !== undefined &&
      typeof config.usePreparedStatements !== 'boolean'
    ) {
      throw new ValidationError('usePreparedStatements must be a boolean', {
        config,
      })
    }
  }

  /**
   * Maps a schema field name to the corresponding database column name.
   * Uses field mapping if configured, otherwise returns the field name unchanged.
   *
   * @param fieldName - Schema field name
   * @returns Database column name
   *
   * @example
   * ```typescript
   * // With fieldMapping: { firstName: 'first_name' }
   * this.mapFieldToColumn('firstName') // Returns 'first_name'
   * this.mapFieldToColumn('email') // Returns 'email'
   * ```
   */
  protected mapFieldToColumn(fieldName: string): string {
    return this.config.fieldMapping[fieldName] ?? fieldName
  }

  /**
   * Maps a database column name to the corresponding schema field name.
   * Reverses field mapping if configured, otherwise returns the column name unchanged.
   *
   * @param columnName - Database column name
   * @returns Schema field name
   *
   * @example
   * ```typescript
   * // With fieldMapping: { firstName: 'first_name' }
   * this.mapColumnToField('first_name') // Returns 'firstName'
   * this.mapColumnToField('email') // Returns 'email'
   * ```
   */
  protected mapColumnToField(columnName: string): string {
    for (const [field, column] of Object.entries(this.config.fieldMapping)) {
      if (column === columnName) {
        return field
      }
    }
    return columnName
  }

  /**
   * Maps all fields in a record from schema names to database column names.
   *
   * @param record - Record with schema field names
   * @returns Record with database column names
   */
  protected mapRecordToDatabase(record: T): Record<string, unknown> {
    const mapped: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(record)) {
      mapped[this.mapFieldToColumn(key)] = value
    }
    return mapped
  }

  /**
   * Maps all fields in a record from database column names to schema names.
   *
   * @param record - Record with database column names
   * @returns Record with schema field names
   */
  protected mapRecordFromDatabase(record: Record<string, unknown>): T {
    const mapped: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(record)) {
      mapped[this.mapColumnToField(key)] = value
    }
    return mapped as T
  }

  /**
   * Converts blocking keys map to database column-based filter criteria.
   *
   * @param blockingKeys - Map of schema field names to values
   * @returns Filter criteria with database column names
   */
  protected mapBlockingKeysToFilter(
    blockingKeys: Map<string, unknown>
  ): FilterCriteria {
    const filter: FilterCriteria = {}
    for (const [field, value] of blockingKeys.entries()) {
      const column = this.mapFieldToColumn(field)
      filter[column] = value
    }
    return filter
  }

  /**
   * Validates query options and applies defaults.
   *
   * @param options - Query options to validate
   * @returns Validated and normalized query options
   */
  protected normalizeQueryOptions(
    options?: QueryOptions
  ): Omit<Required<QueryOptions>, 'orderBy'> & Pick<QueryOptions, 'orderBy'> {
    return {
      limit: options?.limit ?? 1000,
      offset: options?.offset ?? 0,
      orderBy: options?.orderBy,
      fields: options?.fields ?? [],
    }
  }

  /**
   * Validates that an array of IDs is not empty and contains only strings.
   *
   * @param ids - Array of IDs to validate
   * @throws {ValidationError} If IDs are invalid
   */
  protected validateIds(ids: string[]): void {
    if (!Array.isArray(ids)) {
      throw new ValidationError('ids must be an array', { ids })
    }

    if (ids.length === 0) {
      throw new ValidationError('ids array cannot be empty', { ids })
    }

    if (!ids.every((id) => typeof id === 'string')) {
      throw new ValidationError('all ids must be strings', { ids })
    }
  }

  /**
   * Validates that records array is not empty and all items are objects.
   *
   * @param records - Array of records to validate
   * @throws {ValidationError} If records are invalid
   */
  protected validateRecords(records: T[]): void {
    if (!Array.isArray(records)) {
      throw new ValidationError('records must be an array', { records })
    }

    if (records.length === 0) {
      throw new ValidationError('records array cannot be empty', { records })
    }

    if (
      !records.every((record) => typeof record === 'object' && record !== null)
    ) {
      throw new ValidationError('all records must be objects', { records })
    }
  }

  abstract findByBlockingKeys(
    blockingKeys: Map<string, unknown>,
    options?: QueryOptions
  ): Promise<T[]>

  abstract findByIds(ids: string[]): Promise<T[]>

  abstract findAll(options?: QueryOptions): Promise<T[]>

  abstract count(filter?: FilterCriteria): Promise<number>

  abstract insert(record: T): Promise<T>

  abstract update(id: string, updates: Partial<T>): Promise<T>

  abstract delete(id: string): Promise<void>

  abstract transaction<R>(
    callback: (adapter: DatabaseAdapter<T>) => Promise<R>
  ): Promise<R>

  abstract batchInsert(records: T[]): Promise<T[]>

  abstract batchUpdate(
    updates: Array<{ id: string; updates: Partial<T> }>
  ): Promise<T[]>
}
