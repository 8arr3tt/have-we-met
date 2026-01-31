import type { DatabaseAdapter, AdapterConfig, QueryOptions, FilterCriteria } from '../types'
import { BaseAdapter } from '../base-adapter'
import { QueryError, TransactionError, NotFoundError } from '../adapter-error'

type PrismaClient = {
  $transaction: <R>(callback: (tx: PrismaClient) => Promise<R>) => Promise<R>
} & Record<string, Record<string, CallableFunction>>

export class PrismaAdapter<T extends Record<string, unknown>>
  extends BaseAdapter<T>
  implements DatabaseAdapter<T>
{
  private readonly prisma: PrismaClient
  private readonly modelName: string

  constructor(prisma: PrismaClient, config: AdapterConfig) {
    super(config)
    this.prisma = prisma
    this.modelName = config.tableName
  }

  private getModel() {
    const model = (this.prisma as Record<string, unknown>)[this.modelName]
    if (!model || typeof model !== 'object') {
      throw new QueryError(`Model '${this.modelName}' not found in Prisma client`, {
        modelName: this.modelName,
      })
    }
    return model as Record<string, CallableFunction>
  }

  private buildWhereClause(filter: FilterCriteria): Record<string, unknown> {
    const where: Record<string, unknown> = {}

    for (const [field, condition] of Object.entries(filter)) {
      if (typeof condition === 'object' && condition !== null && 'operator' in condition) {
        const operatorCondition = condition as {
          operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'like'
          value: unknown
        }

        switch (operatorCondition.operator) {
          case 'eq':
            where[field] = operatorCondition.value
            break
          case 'ne':
            where[field] = { not: operatorCondition.value }
            break
          case 'gt':
            where[field] = { gt: operatorCondition.value }
            break
          case 'gte':
            where[field] = { gte: operatorCondition.value }
            break
          case 'lt':
            where[field] = { lt: operatorCondition.value }
            break
          case 'lte':
            where[field] = { lte: operatorCondition.value }
            break
          case 'in':
            where[field] = { in: operatorCondition.value }
            break
          case 'like':
            where[field] = { contains: operatorCondition.value }
            break
        }
      } else {
        where[field] = condition
      }
    }

    return where
  }

  async findByBlockingKeys(
    blockingKeys: Map<string, unknown>,
    options?: QueryOptions
  ): Promise<T[]> {
    try {
      const filter = this.mapBlockingKeysToFilter(blockingKeys)
      const where = this.buildWhereClause(filter)
      const normalized = this.normalizeQueryOptions(options)

      const model = this.getModel()
      const queryOptions: Record<string, unknown> = {
        where,
        take: normalized.limit,
        skip: normalized.offset,
      }

      if (normalized.orderBy) {
        queryOptions.orderBy = {
          [this.mapFieldToColumn(normalized.orderBy.field)]: normalized.orderBy.direction,
        }
      }

      if (normalized.fields.length > 0) {
        const select: Record<string, boolean> = {}
        for (const field of normalized.fields) {
          select[this.mapFieldToColumn(field)] = true
        }
        queryOptions.select = select
      }

      const results = (await model.findMany(queryOptions)) as Record<string, unknown>[]
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
      const model = this.getModel()
      const results = (await model.findMany({
        where: {
          [this.config.primaryKey]: { in: ids },
        },
      })) as Record<string, unknown>[]

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
      const normalized = this.normalizeQueryOptions(options)
      const model = this.getModel()

      const queryOptions: Record<string, unknown> = {
        take: normalized.limit,
        skip: normalized.offset,
      }

      if (normalized.orderBy) {
        queryOptions.orderBy = {
          [this.mapFieldToColumn(normalized.orderBy.field)]: normalized.orderBy.direction,
        }
      }

      if (normalized.fields.length > 0) {
        const select: Record<string, boolean> = {}
        for (const field of normalized.fields) {
          select[this.mapFieldToColumn(field)] = true
        }
        queryOptions.select = select
      }

      const results = (await model.findMany(queryOptions)) as Record<string, unknown>[]
      return results.map((record) => this.mapRecordFromDatabase(record))
    } catch (error) {
      throw new QueryError('Failed to find all records', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  async count(filter?: FilterCriteria): Promise<number> {
    try {
      const model = this.getModel()
      const where = filter ? this.buildWhereClause(filter) : undefined

      const result = (await model.count({ where })) as number
      return result
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
      const model = this.getModel()

      const result = (await model.create({ data: mapped })) as Record<string, unknown>
      return this.mapRecordFromDatabase(result)
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
      const model = this.getModel()

      const result = (await model.update({
        where: { [this.config.primaryKey]: id },
        data: mapped,
      })) as Record<string, unknown>

      return this.mapRecordFromDatabase(result)
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.includes('Record to update not found') ||
          error.message.includes('not found'))
      ) {
        throw new NotFoundError(`Record with id '${id}' not found`, { id })
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
      const model = this.getModel()
      await model.delete({
        where: { [this.config.primaryKey]: id },
      })
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.includes('Record to delete does not exist') ||
          error.message.includes('not found'))
      ) {
        throw new NotFoundError(`Record with id '${id}' not found`, { id })
      }

      throw new QueryError('Failed to delete record', {
        id,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  async transaction<R>(callback: (adapter: DatabaseAdapter<T>) => Promise<R>): Promise<R> {
    try {
      return await this.prisma.$transaction(async (tx: PrismaClient) => {
        const txAdapter = new PrismaAdapter<T>(tx, {
          tableName: this.config.tableName,
          primaryKey: this.config.primaryKey,
          fieldMapping: this.config.fieldMapping,
          usePreparedStatements: this.config.usePreparedStatements,
          poolConfig: this.config.poolConfig,
        })
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
      const model = this.getModel()

      await model.createMany({
        data: mapped,
        skipDuplicates: false,
      })

      const primaryKeyField = this.config.primaryKey
      const ids = records
        .map((r) => r[primaryKeyField] as string)
        .filter((id): id is string => id !== undefined)

      if (ids.length === records.length) {
        return await this.findByIds(ids)
      }

      const lastRecords = await this.findAll({
        limit: records.length,
        orderBy: { field: primaryKeyField, direction: 'desc' },
      })

      return lastRecords.reverse()
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
