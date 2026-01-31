import type { DatabaseAdapter, AdapterConfig, QueryOptions, FilterCriteria } from '../types'
import { BaseAdapter } from '../base-adapter'
import { QueryError, TransactionError, NotFoundError } from '../adapter-error'

type DrizzleDatabase = {
  select: (fields?: Record<string, unknown>) => {
    from: (table: unknown) => DrizzleQuery
  }
  insert: (table: unknown) => {
    values: (values: unknown) => { returning: () => Promise<unknown[]> }
  }
  update: (table: unknown) => {
    set: (values: unknown) => {
      where: (condition: unknown) => { returning: () => Promise<unknown[]> }
    }
  }
  delete: (table: unknown) => {
    where: (condition: unknown) => Promise<void>
  }
  transaction: <R>(callback: (tx: DrizzleDatabase) => Promise<R>) => Promise<R>
}

type DrizzleQuery = {
  where: (condition: unknown) => DrizzleQuery
  limit: (count: number) => DrizzleQuery
  offset: (count: number) => DrizzleQuery
  orderBy: (...columns: unknown[]) => DrizzleQuery
}

type DrizzleTable = {
  [key: string]: {
    name: string
  }
}

type DrizzleOperators = {
  eq: (column: unknown, value: unknown) => unknown
  ne: (column: unknown, value: unknown) => unknown
  gt: (column: unknown, value: unknown) => unknown
  gte: (column: unknown, value: unknown) => unknown
  lt: (column: unknown, value: unknown) => unknown
  lte: (column: unknown, value: unknown) => unknown
  inArray: (column: unknown, values: unknown[]) => unknown
  like: (column: unknown, pattern: unknown) => unknown
  and: (...conditions: unknown[]) => unknown
  asc: (column: unknown) => unknown
  desc: (column: unknown) => unknown
  count: () => unknown
}

export class DrizzleAdapter<T extends Record<string, unknown>>
  extends BaseAdapter<T>
  implements DatabaseAdapter<T>
{
  private readonly db: DrizzleDatabase
  private readonly table: DrizzleTable
  private readonly operators: DrizzleOperators

  constructor(
    db: DrizzleDatabase,
    table: DrizzleTable,
    config: AdapterConfig,
    operators: DrizzleOperators
  ) {
    super(config)
    this.db = db
    this.table = table
    this.operators = operators
  }

  private getColumn(fieldName: string): unknown {
    const columnName = this.mapFieldToColumn(fieldName)
    const column = (this.table as Record<string, unknown>)[columnName]
    if (!column) {
      throw new QueryError(`Column '${columnName}' not found in table schema`, {
        columnName,
        availableColumns: Object.keys(this.table),
      })
    }
    return column
  }

  private buildWhereConditions(filter: FilterCriteria): unknown {
    const conditions: unknown[] = []

    for (const [field, condition] of Object.entries(filter)) {
      const column = this.getColumn(field)

      if (typeof condition === 'object' && condition !== null && 'operator' in condition) {
        const operatorCondition = condition as {
          operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'like'
          value: unknown
        }

        switch (operatorCondition.operator) {
          case 'eq':
            conditions.push(this.operators.eq(column, operatorCondition.value))
            break
          case 'ne':
            conditions.push(this.operators.ne(column, operatorCondition.value))
            break
          case 'gt':
            conditions.push(this.operators.gt(column, operatorCondition.value))
            break
          case 'gte':
            conditions.push(this.operators.gte(column, operatorCondition.value))
            break
          case 'lt':
            conditions.push(this.operators.lt(column, operatorCondition.value))
            break
          case 'lte':
            conditions.push(this.operators.lte(column, operatorCondition.value))
            break
          case 'in':
            if (Array.isArray(operatorCondition.value)) {
              conditions.push(this.operators.inArray(column, operatorCondition.value))
            } else {
              throw new QueryError('IN operator requires array value', {
                field,
                value: operatorCondition.value,
              })
            }
            break
          case 'like':
            conditions.push(this.operators.like(column, operatorCondition.value))
            break
        }
      } else {
        conditions.push(this.operators.eq(column, condition))
      }
    }

    return conditions.length === 1 ? conditions[0] : this.operators.and(...conditions)
  }

  private buildSelectQuery(options?: QueryOptions): Promise<Record<string, unknown>[]> {
    let query = this.db.select().from(this.table) as unknown as DrizzleQuery

    const normalized = this.normalizeQueryOptions(options)

    if (normalized.limit) {
      query = query.limit(normalized.limit)
    }

    if (normalized.offset) {
      query = query.offset(normalized.offset)
    }

    if (normalized.orderBy) {
      const column = this.getColumn(normalized.orderBy.field)
      const orderFunc =
        normalized.orderBy.direction === 'asc' ? this.operators.asc : this.operators.desc
      query = query.orderBy(orderFunc(column))
    }

    return query as unknown as Promise<Record<string, unknown>[]>
  }

  async findByBlockingKeys(
    blockingKeys: Map<string, unknown>,
    options?: QueryOptions
  ): Promise<T[]> {
    try {
      const filter = this.mapBlockingKeysToFilter(blockingKeys)
      const whereCondition = this.buildWhereConditions(filter)

      const normalized = this.normalizeQueryOptions(options)
      let query = this.db.select().from(this.table) as unknown as DrizzleQuery

      query = query.where(whereCondition)

      if (normalized.limit) {
        query = query.limit(normalized.limit)
      }

      if (normalized.offset) {
        query = query.offset(normalized.offset)
      }

      if (normalized.orderBy) {
        const column = this.getColumn(normalized.orderBy.field)
        const orderFunc =
          normalized.orderBy.direction === 'asc' ? this.operators.asc : this.operators.desc
        query = query.orderBy(orderFunc(column))
      }

      const results = (await (query as unknown as Promise<Record<string, unknown>[]>)) as Record<
        string,
        unknown
      >[]
      return results.map((record) => this.mapRecordFromDatabase(record))
    } catch (error) {
      throw new QueryError('Failed to find records by blocking keys', {
        blockingKeys: Array.from(blockingKeys.entries()),
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  async findByIds(ids: string[]): Promise<T[]> {
    this.validateIds(ids)

    try {
      const primaryKeyColumn = this.getColumn(this.config.primaryKey)
      const whereCondition = this.operators.inArray(primaryKeyColumn, ids)

      const query = this.db.select().from(this.table).where(whereCondition)

      const results = (await (query as unknown as Promise<Record<string, unknown>[]>)) as Record<
        string,
        unknown
      >[]
      return results.map((record) => this.mapRecordFromDatabase(record))
    } catch (error) {
      throw new QueryError('Failed to find records by IDs', {
        ids,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  async findAll(options?: QueryOptions): Promise<T[]> {
    try {
      const results = await this.buildSelectQuery(options)
      return results.map((record) => this.mapRecordFromDatabase(record))
    } catch (error) {
      throw new QueryError('Failed to find all records', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  async count(filter?: FilterCriteria): Promise<number> {
    try {
      let query = this.db.select({ count: this.operators.count() }).from(this.table) as unknown as DrizzleQuery

      if (filter) {
        const whereCondition = this.buildWhereConditions(filter)
        query = query.where(whereCondition)
      }

      const result = (await (query as unknown as Promise<Array<{ count: number }>>)) as Array<{
        count: number
      }>
      return result[0]?.count ?? 0
    } catch (error) {
      throw new QueryError('Failed to count records', {
        filter,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  async insert(record: T): Promise<T> {
    try {
      const mapped = this.mapRecordToDatabase(record)
      const result = (await this.db
        .insert(this.table)
        .values(mapped)
        .returning()) as Record<string, unknown>[]

      if (result.length === 0) {
        throw new QueryError('Insert did not return a record', { record })
      }

      return this.mapRecordFromDatabase(result[0])
    } catch (error) {
      throw new QueryError('Failed to insert record', {
        record,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  async update(id: string, updates: Partial<T>): Promise<T> {
    try {
      const mapped = this.mapRecordToDatabase(updates as T)
      const primaryKeyColumn = this.getColumn(this.config.primaryKey)
      const whereCondition = this.operators.eq(primaryKeyColumn, id)

      const result = (await this.db
        .update(this.table)
        .set(mapped)
        .where(whereCondition)
        .returning()) as Record<string, unknown>[]

      if (result.length === 0) {
        throw new NotFoundError(`Record with id '${id}' not found`, { id })
      }

      return this.mapRecordFromDatabase(result[0])
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error
      }

      throw new QueryError('Failed to update record', {
        id,
        updates,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  async delete(id: string): Promise<void> {
    try {
      const primaryKeyColumn = this.getColumn(this.config.primaryKey)
      const whereCondition = this.operators.eq(primaryKeyColumn, id)

      await this.db.delete(this.table).where(whereCondition)
    } catch (error) {
      throw new QueryError('Failed to delete record', {
        id,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  async transaction<R>(callback: (adapter: DatabaseAdapter<T>) => Promise<R>): Promise<R> {
    try {
      return await this.db.transaction(async (tx: DrizzleDatabase) => {
        const txAdapter = new DrizzleAdapter<T>(tx, this.table, {
          tableName: this.config.tableName,
          primaryKey: this.config.primaryKey,
          fieldMapping: this.config.fieldMapping,
          usePreparedStatements: this.config.usePreparedStatements,
          poolConfig: this.config.poolConfig,
        }, this.operators)
        return await callback(txAdapter)
      })
    } catch (error) {
      throw new TransactionError('Transaction failed', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  async batchInsert(records: T[]): Promise<T[]> {
    this.validateRecords(records)

    try {
      const mapped = records.map((record) => this.mapRecordToDatabase(record))
      const results = (await this.db
        .insert(this.table)
        .values(mapped)
        .returning()) as Record<string, unknown>[]

      return results.map((record) => this.mapRecordFromDatabase(record))
    } catch (error) {
      throw new QueryError('Failed to batch insert records', {
        recordCount: records.length,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  async batchUpdate(updates: Array<{ id: string; updates: Partial<T> }>): Promise<T[]> {
    if (updates.length === 0) {
      return []
    }

    try {
      return await this.transaction(async (txAdapter) => {
        const results: T[] = []
        for (const { id, updates: updateData } of updates) {
          const updated = await txAdapter.update(id, updateData)
          results.push(updated)
        }
        return results
      })
    } catch (error) {
      throw new QueryError('Failed to batch update records', {
        updateCount: updates.length,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
}
