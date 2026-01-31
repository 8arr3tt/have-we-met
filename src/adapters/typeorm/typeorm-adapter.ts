import type { DatabaseAdapter, AdapterConfig, QueryOptions, FilterCriteria } from '../types'
import { BaseAdapter } from '../base-adapter'
import { QueryError, TransactionError, NotFoundError } from '../adapter-error'

type Repository<T> = {
  find: (options?: unknown) => Promise<T[]>
  findOne: (options?: unknown) => Promise<T | null>
  count: (options?: unknown) => Promise<number>
  save: (entity: unknown) => Promise<T>
  update: (criteria: unknown, partialEntity: unknown) => Promise<unknown>
  delete: (criteria: unknown) => Promise<unknown>
  insert: (entities: unknown) => Promise<unknown>
  manager: {
    connection: {
      transaction: <R>(callback: (manager: EntityManager) => Promise<R>) => Promise<R>
    }
  }
}

type EntityManager = {
  getRepository: <T>(target: unknown) => Repository<T>
}

export class TypeORMAdapter<T extends Record<string, unknown>>
  extends BaseAdapter<T>
  implements DatabaseAdapter<T>
{
  private readonly repository: Repository<T>
  private readonly entityTarget: unknown

  constructor(repository: Repository<T>, config: AdapterConfig, entityTarget?: unknown) {
    super(config)
    this.repository = repository
    this.entityTarget = entityTarget
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
            where[field] = { $ne: operatorCondition.value }
            break
          case 'gt':
            where[field] = { $gt: operatorCondition.value }
            break
          case 'gte':
            where[field] = { $gte: operatorCondition.value }
            break
          case 'lt':
            where[field] = { $lt: operatorCondition.value }
            break
          case 'lte':
            where[field] = { $lte: operatorCondition.value }
            break
          case 'in':
            where[field] = { $in: operatorCondition.value }
            break
          case 'like':
            where[field] = { $like: `%${operatorCondition.value}%` }
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

      const findOptions: Record<string, unknown> = {
        where,
        take: normalized.limit,
        skip: normalized.offset,
      }

      if (normalized.orderBy) {
        findOptions.order = {
          [this.mapFieldToColumn(normalized.orderBy.field)]: normalized.orderBy.direction.toUpperCase(),
        }
      }

      if (normalized.fields.length > 0) {
        const select: Record<string, boolean> = {}
        for (const field of normalized.fields) {
          select[this.mapFieldToColumn(field)] = true
        }
        findOptions.select = select
      }

      const results = await this.repository.find(findOptions)
      return results.map((record) => this.mapRecordFromDatabase(record as Record<string, unknown>))
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
      const results = await this.repository.find({
        where: {
          [this.config.primaryKey]: { $in: ids },
        },
      })

      return results.map((record) => this.mapRecordFromDatabase(record as Record<string, unknown>))
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

      const findOptions: Record<string, unknown> = {
        take: normalized.limit,
        skip: normalized.offset,
      }

      if (normalized.orderBy) {
        findOptions.order = {
          [this.mapFieldToColumn(normalized.orderBy.field)]: normalized.orderBy.direction.toUpperCase(),
        }
      }

      if (normalized.fields.length > 0) {
        const select: Record<string, boolean> = {}
        for (const field of normalized.fields) {
          select[this.mapFieldToColumn(field)] = true
        }
        findOptions.select = select
      }

      const results = await this.repository.find(findOptions)
      return results.map((record) => this.mapRecordFromDatabase(record as Record<string, unknown>))
    } catch (error) {
      throw new QueryError('Failed to find all records', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  async count(filter?: FilterCriteria): Promise<number> {
    try {
      const where = filter ? this.buildWhereClause(filter) : undefined
      const result = await this.repository.count(where ? { where } : undefined)
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
      const result = await this.repository.save(mapped)
      return this.mapRecordFromDatabase(result as Record<string, unknown>)
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

      const updateResult = await this.repository.update(
        { [this.config.primaryKey]: id },
        mapped
      )

      const affected = (updateResult as { affected?: number }).affected
      if (affected === 0) {
        throw new NotFoundError(`Record with id '${id}' not found`, { id })
      }

      const updated = await this.repository.findOne({
        where: { [this.config.primaryKey]: id },
      })

      if (!updated) {
        throw new NotFoundError(`Record with id '${id}' not found after update`, { id })
      }

      return this.mapRecordFromDatabase(updated as Record<string, unknown>)
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
      const deleteResult = await this.repository.delete({
        [this.config.primaryKey]: id,
      })

      const affected = (deleteResult as { affected?: number }).affected
      if (affected === 0) {
        throw new NotFoundError(`Record with id '${id}' not found`, { id })
      }
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error
      }

      throw new QueryError('Failed to delete record', {
        id,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  async transaction<R>(callback: (adapter: DatabaseAdapter<T>) => Promise<R>): Promise<R> {
    try {
      return await this.repository.manager.connection.transaction(
        async (entityManager: EntityManager) => {
          const txRepository = entityManager.getRepository<T>(
            this.entityTarget || (this.repository as unknown)
          )

          const txAdapter = new TypeORMAdapter<T>(
            txRepository,
            {
              tableName: this.config.tableName,
              primaryKey: this.config.primaryKey,
              fieldMapping: this.config.fieldMapping,
              usePreparedStatements: this.config.usePreparedStatements,
              poolConfig: this.config.poolConfig,
            },
            this.entityTarget
          )

          return await callback(txAdapter)
        }
      )
    } catch (error) {
      if (error instanceof TransactionError) {
        throw error
      }
      throw new TransactionError('Transaction failed', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  async batchInsert(records: T[]): Promise<T[]> {
    this.validateRecords(records)

    try {
      const mapped = records.map((record) => this.mapRecordToDatabase(record))

      await this.repository.insert(mapped)

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
