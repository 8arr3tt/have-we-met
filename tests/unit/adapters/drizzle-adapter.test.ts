import { describe, it, expect, beforeEach, vi } from 'vitest'
import { DrizzleAdapter, drizzleAdapter } from '../../../src/adapters/drizzle'
import { QueryError, TransactionError, NotFoundError } from '../../../src/adapters/adapter-error'
import type { AdapterConfig } from '../../../src/adapters/types'

type TestRecord = {
  id: string
  firstName: string
  lastName: string
  email: string
  age: number
}

const createMockDrizzleDB = () => {
  let mockQueryResult: any[] = []

  const createMockQuery = () => {
    const query: any = {
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      offset: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
    }

    // Make the query thenable
    query.then = function (onResolve: any) {
      return Promise.resolve(mockQueryResult).then(onResolve)
    }

    return query
  }

  const db: any = {
    select: vi.fn().mockImplementation(() => ({
      from: vi.fn().mockImplementation(() => createMockQuery()),
    })),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn(),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn(),
        }),
      }),
    }),
    delete: vi.fn().mockReturnValue({
      where: vi.fn(),
    }),
    transaction: vi.fn(),
    _setMockQueryResult: (result: any[]) => {
      mockQueryResult = result
    },
  }

  return db
}

const createMockTable = () => ({
  id: { name: 'id' },
  firstName: { name: 'firstName' },
  lastName: { name: 'lastName' },
  email: { name: 'email' },
  age: { name: 'age' },
})

const createMockOperators = () => ({
  eq: vi.fn((col, val) => ({ type: 'eq', col, val })),
  ne: vi.fn((col, val) => ({ type: 'ne', col, val })),
  gt: vi.fn((col, val) => ({ type: 'gt', col, val })),
  gte: vi.fn((col, val) => ({ type: 'gte', col, val })),
  lt: vi.fn((col, val) => ({ type: 'lt', col, val })),
  lte: vi.fn((col, val) => ({ type: 'lte', col, val })),
  inArray: vi.fn((col, vals) => ({ type: 'in', col, vals })),
  like: vi.fn((col, pattern) => ({ type: 'like', col, pattern })),
  and: vi.fn((...conditions) => ({ type: 'and', conditions })),
  asc: vi.fn((col) => ({ type: 'asc', col })),
  desc: vi.fn((col) => ({ type: 'desc', col })),
  count: vi.fn(() => ({ type: 'count' })),
}) as any

describe('DrizzleAdapter', () => {
  let mockDb: ReturnType<typeof createMockDrizzleDB>
  let mockTable: ReturnType<typeof createMockTable>
  let mockOperators: ReturnType<typeof createMockOperators>
  let adapter: DrizzleAdapter<TestRecord>
  const config: AdapterConfig = { tableName: 'testRecords' }

  beforeEach(() => {
    mockDb = createMockDrizzleDB()
    mockTable = createMockTable()
    mockOperators = createMockOperators()
    adapter = new DrizzleAdapter<TestRecord>(
      mockDb as any,
      mockTable as any,
      config,
      mockOperators as any
    )
  })

  describe('constructor', () => {
    it('creates adapter with valid config', () => {
      expect(adapter).toBeInstanceOf(DrizzleAdapter)
    })

    it('throws error for missing column', async () => {
      const blockingKeys = new Map([['invalidField', 'value']])
      await expect(adapter.findByBlockingKeys(blockingKeys)).rejects.toThrow(QueryError)
    })
  })

  describe('findByBlockingKeys', () => {
    it('finds records by single blocking key', async () => {
      const mockRecords = [
        { id: '1', firstName: 'John', lastName: 'Smith', email: 'john@test.com', age: 30 },
        { id: '2', firstName: 'Jane', lastName: 'Smith', email: 'jane@test.com', age: 28 },
      ]

      mockDb._setMockQueryResult(mockRecords)

      const blockingKeys = new Map([['lastName', 'Smith']])
      const results = await adapter.findByBlockingKeys(blockingKeys)

      expect(mockOperators.eq).toHaveBeenCalledWith(mockTable.lastName, 'Smith')
      expect(results).toEqual(mockRecords)
    })

    it('finds records by multiple blocking keys', async () => {
      const mockRecords = [
        { id: '1', firstName: 'John', lastName: 'Smith', email: 'john@test.com', age: 30 },
      ]

      mockDb._setMockQueryResult(mockRecords)

      const blockingKeys = new Map([
        ['lastName', 'Smith'],
        ['age', 30],
      ])
      const results = await adapter.findByBlockingKeys(blockingKeys)

      expect(mockOperators.eq).toHaveBeenCalledWith(mockTable.lastName, 'Smith')
      expect(mockOperators.eq).toHaveBeenCalledWith(mockTable.age, 30)
      expect(mockOperators.and).toHaveBeenCalled()
      expect(results).toEqual(mockRecords)
    })

    it('returns empty array when no matches', async () => {
      mockDb._setMockQueryResult([])

      const blockingKeys = new Map([['lastName', 'Nonexistent']])
      const results = await adapter.findByBlockingKeys(blockingKeys)

      expect(results).toEqual([])
    })

    it('respects limit and offset', async () => {
      mockDb._setMockQueryResult([])

      const blockingKeys = new Map([['lastName', 'Smith']])
      const results = await adapter.findByBlockingKeys(blockingKeys, { limit: 10, offset: 5 })

      expect(results).toEqual([])
    })

    it('applies orderBy option', async () => {
      mockDb._setMockQueryResult([])

      const blockingKeys = new Map([['lastName', 'Smith']])
      await adapter.findByBlockingKeys(blockingKeys, {
        orderBy: { field: 'firstName', direction: 'asc' },
      })

      expect(mockOperators.asc).toHaveBeenCalledWith(mockTable.firstName)
    })

    it('applies orderBy desc', async () => {
      mockDb._setMockQueryResult([])

      const blockingKeys = new Map([['lastName', 'Smith']])
      await adapter.findByBlockingKeys(blockingKeys, {
        orderBy: { field: 'age', direction: 'desc' },
      })

      expect(mockOperators.desc).toHaveBeenCalledWith(mockTable.age)
    })

    it('handles database errors', async () => {
      mockDb.select.mockImplementation(() => {
        throw new Error('Database error')
      })

      const blockingKeys = new Map([['lastName', 'Smith']])
      await expect(adapter.findByBlockingKeys(blockingKeys)).rejects.toThrow(QueryError)
    })
  })

  describe('findByIds', () => {
    it('finds multiple records by ID', async () => {
      const mockRecords = [
        { id: '1', firstName: 'John', lastName: 'Smith', email: 'john@test.com', age: 30 },
        { id: '2', firstName: 'Jane', lastName: 'Doe', email: 'jane@test.com', age: 28 },
      ]

      mockDb._setMockQueryResult(mockRecords)

      const results = await adapter.findByIds(['1', '2'])

      expect(mockOperators.inArray).toHaveBeenCalledWith(mockTable.id, ['1', '2'])
      expect(results).toEqual(mockRecords)
    })

    it('handles non-existent IDs gracefully', async () => {
      mockDb._setMockQueryResult([])

      const results = await adapter.findByIds(['999'])

      expect(results).toEqual([])
    })

    it('throws error for empty IDs array', async () => {
      await expect(adapter.findByIds([])).rejects.toThrow()
    })

    it('throws error for non-string IDs', async () => {
      await expect(adapter.findByIds([123] as any)).rejects.toThrow()
    })
  })

  describe('findAll', () => {
    it('retrieves all records with default options', async () => {
      const mockRecords = [
        { id: '1', firstName: 'John', lastName: 'Smith', email: 'john@test.com', age: 30 },
      ]

      mockDb._setMockQueryResult(mockRecords)

      const results = await adapter.findAll()

      expect(results).toEqual(mockRecords)
    })

    it('applies pagination options', async () => {
      mockDb._setMockQueryResult([])

      const results = await adapter.findAll({ limit: 50, offset: 100 })

      expect(results).toEqual([])
    })

    it('applies orderBy option', async () => {
      mockDb._setMockQueryResult([])

      await adapter.findAll({
        orderBy: { field: 'lastName', direction: 'desc' },
      })

      expect(mockOperators.desc).toHaveBeenCalledWith(mockTable.lastName)
    })
  })

  describe('count', () => {
    it('counts all records without filter', async () => {
      mockDb._setMockQueryResult([{ count: 42 }])

      const result = await adapter.count()

      expect(mockOperators.count).toHaveBeenCalled()
      expect(result).toBe(42)
    })

    it('counts records with filter', async () => {
      mockDb._setMockQueryResult([{ count: 5 }])

      const result = await adapter.count({ lastName: 'Smith' })

      expect(mockOperators.eq).toHaveBeenCalledWith(mockTable.lastName, 'Smith')
      expect(result).toBe(5)
    })

    it('handles filter operators', async () => {
      mockDb._setMockQueryResult([{ count: 3 }])

      const result = await adapter.count({
        age: { operator: 'gt', value: 25 },
      })

      expect(mockOperators.gt).toHaveBeenCalledWith(mockTable.age, 25)
      expect(result).toBe(3)
    })

    it('returns 0 when no count result', async () => {
      mockDb._setMockQueryResult([])

      const result = await adapter.count()

      expect(result).toBe(0)
    })
  })

  describe('insert', () => {
    it('inserts a new record', async () => {
      const newRecord = {
        id: '1',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@test.com',
        age: 30,
      }

      const insertResult = mockDb.insert(mockTable)
      const valuesResult = insertResult.values(newRecord)
      valuesResult.returning.mockResolvedValue([newRecord])

      const result = await adapter.insert(newRecord)

      expect(mockDb.insert).toHaveBeenCalledWith(mockTable)
      expect(insertResult.values).toHaveBeenCalledWith(newRecord)
      expect(valuesResult.returning).toHaveBeenCalled()
      expect(result).toEqual(newRecord)
    })

    it('throws error when insert returns no record', async () => {
      const newRecord = {
        id: '1',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@test.com',
        age: 30,
      }

      const insertResult = mockDb.insert(mockTable)
      const valuesResult = insertResult.values(newRecord)
      valuesResult.returning.mockResolvedValue([])

      await expect(adapter.insert(newRecord)).rejects.toThrow(QueryError)
    })

    it('handles database errors during insert', async () => {
      const newRecord = {
        id: '1',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@test.com',
        age: 30,
      }

      mockDb.insert.mockImplementation(() => {
        throw new Error('Unique constraint failed')
      })

      await expect(adapter.insert(newRecord)).rejects.toThrow(QueryError)
    })
  })

  describe('update', () => {
    it('updates an existing record', async () => {
      const updatedRecord = {
        id: '1',
        firstName: 'John',
        lastName: 'Smith',
        email: 'john.smith@test.com',
        age: 31,
      }

      const updateResult = mockDb.update(mockTable)
      const setResult = updateResult.set({ email: 'john.smith@test.com', age: 31 })
      const whereResult = setResult.where(mockOperators.eq(mockTable.id, '1'))
      whereResult.returning.mockResolvedValue([updatedRecord])

      const result = await adapter.update('1', { email: 'john.smith@test.com', age: 31 })

      expect(mockOperators.eq).toHaveBeenCalledWith(mockTable.id, '1')
      expect(updateResult.set).toHaveBeenCalledWith({ email: 'john.smith@test.com', age: 31 })
      expect(whereResult.returning).toHaveBeenCalled()
      expect(result).toEqual(updatedRecord)
    })

    it('throws NotFoundError for non-existent record', async () => {
      const updateResult = mockDb.update(mockTable)
      const setResult = updateResult.set({ email: 'new@test.com' })
      const whereResult = setResult.where(mockOperators.eq(mockTable.id, '999'))
      whereResult.returning.mockResolvedValue([])

      await expect(adapter.update('999', { email: 'new@test.com' })).rejects.toThrow(
        NotFoundError
      )
    })

    it('handles other database errors', async () => {
      mockDb.update.mockImplementation(() => {
        throw new Error('Constraint violation')
      })

      await expect(adapter.update('1', { email: 'new@test.com' })).rejects.toThrow(QueryError)
    })
  })

  describe('delete', () => {
    it('deletes a record', async () => {
      const deleteResult = mockDb.delete(mockTable)
      deleteResult.where.mockResolvedValue(undefined)

      await adapter.delete('1')

      expect(mockDb.delete).toHaveBeenCalledWith(mockTable)
      expect(mockOperators.eq).toHaveBeenCalledWith(mockTable.id, '1')
      expect(deleteResult.where).toHaveBeenCalled()
    })

    it('handles errors during delete', async () => {
      mockDb.delete.mockImplementation(() => {
        throw new Error('Delete failed')
      })

      await expect(adapter.delete('999')).rejects.toThrow(QueryError)
    })
  })

  describe('transaction', () => {
    it('commits successful transaction', async () => {
      const mockTxDb = createMockDrizzleDB()
      const insertResult = mockTxDb.insert(mockTable)
      const valuesResult = insertResult.values({
        id: '1',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@test.com',
        age: 30,
      })
      valuesResult.returning.mockResolvedValue([
        {
          id: '1',
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@test.com',
          age: 30,
        },
      ])

      mockDb.transaction.mockImplementation(async (callback) => {
        return await callback(mockTxDb as any)
      })

      const result = await adapter.transaction(async (txAdapter) => {
        const record = await txAdapter.insert({
          id: '1',
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@test.com',
          age: 30,
        })
        return record
      })

      expect(result).toHaveProperty('id', '1')
      expect(mockDb.transaction).toHaveBeenCalled()
    })

    it('rolls back failed transaction', async () => {
      mockDb.transaction.mockRejectedValue(new Error('Transaction failed'))

      await expect(
        adapter.transaction(async () => {
          throw new Error('Operation failed')
        })
      ).rejects.toThrow(TransactionError)
    })

    it('allows nested operations in transaction', async () => {
      const mockTxDb = createMockDrizzleDB()
      const insertResult = mockTxDb.insert(mockTable)
      const valuesResult = insertResult.values({
        id: '1',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@test.com',
        age: 30,
      })
      valuesResult.returning.mockResolvedValue([
        {
          id: '1',
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@test.com',
          age: 30,
        },
      ])

      const deleteResult = mockTxDb.delete(mockTable)
      deleteResult.where.mockResolvedValue(undefined)

      mockDb.transaction.mockImplementation(async (callback) => {
        return await callback(mockTxDb as any)
      })

      const result = await adapter.transaction(async (txAdapter) => {
        await txAdapter.insert({
          id: '1',
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@test.com',
          age: 30,
        })
        await txAdapter.delete('2')
        return 'success'
      })

      expect(result).toBe('success')
    })
  })

  describe('batchInsert', () => {
    it('inserts multiple records efficiently', async () => {
      const records = [
        { id: '1', firstName: 'John', lastName: 'Doe', email: 'john@test.com', age: 30 },
        { id: '2', firstName: 'Jane', lastName: 'Smith', email: 'jane@test.com', age: 28 },
      ]

      const insertResult = mockDb.insert(mockTable)
      const valuesResult = insertResult.values(records)
      valuesResult.returning.mockResolvedValue(records)

      const results = await adapter.batchInsert(records)

      expect(insertResult.values).toHaveBeenCalledWith(records)
      expect(valuesResult.returning).toHaveBeenCalled()
      expect(results).toEqual(records)
    })

    it('throws error for empty records array', async () => {
      await expect(adapter.batchInsert([])).rejects.toThrow()
    })

    it('handles database errors during batch insert', async () => {
      mockDb.insert.mockImplementation(() => {
        throw new Error('Batch insert failed')
      })

      const records = [
        { id: '1', firstName: 'John', lastName: 'Doe', email: 'john@test.com', age: 30 },
      ]

      await expect(adapter.batchInsert(records)).rejects.toThrow(QueryError)
    })
  })

  describe('batchUpdate', () => {
    it('updates multiple records efficiently', async () => {
      const updates = [
        { id: '1', updates: { email: 'john.new@test.com' } },
        { id: '2', updates: { age: 29 } },
      ]

      const mockTxDb = createMockDrizzleDB()

      // Setup first update
      const updateResult1 = mockTxDb.update(mockTable)
      const setResult1 = updateResult1.set({ email: 'john.new@test.com' })
      const whereResult1 = setResult1.where(mockOperators.eq(mockTable.id, '1'))
      whereResult1.returning.mockResolvedValueOnce([
        {
          id: '1',
          firstName: 'John',
          lastName: 'Doe',
          email: 'john.new@test.com',
          age: 30,
        },
      ])

      // Setup second update
      const updateResult2 = mockTxDb.update(mockTable)
      const setResult2 = updateResult2.set({ age: 29 })
      const whereResult2 = setResult2.where(mockOperators.eq(mockTable.id, '2'))
      whereResult2.returning.mockResolvedValueOnce([
        {
          id: '2',
          firstName: 'Jane',
          lastName: 'Smith',
          email: 'jane@test.com',
          age: 29,
        },
      ])

      mockDb.transaction.mockImplementation(async (callback) => {
        return await callback(mockTxDb as any)
      })

      const results = await adapter.batchUpdate(updates)

      expect(results).toHaveLength(2)
      expect(results[0]).toHaveProperty('email', 'john.new@test.com')
      expect(results[1]).toHaveProperty('age', 29)
    })

    it('returns empty array for empty updates', async () => {
      const results = await adapter.batchUpdate([])

      expect(results).toEqual([])
      expect(mockDb.transaction).not.toHaveBeenCalled()
    })

    it('handles errors during batch update', async () => {
      mockDb.transaction.mockRejectedValue(new Error('Batch update failed'))

      const updates = [{ id: '1', updates: { email: 'new@test.com' } }]

      await expect(adapter.batchUpdate(updates)).rejects.toThrow(QueryError)
    })
  })

  describe('field mapping', () => {
    it('maps schema fields to database columns', async () => {
      const configWithMapping: AdapterConfig = {
        tableName: 'testRecords',
        fieldMapping: {
          firstName: 'first_name',
          lastName: 'last_name',
        },
      }

      const tableWithMapping = {
        id: { name: 'id' },
        first_name: { name: 'first_name' },
        last_name: { name: 'last_name' },
        email: { name: 'email' },
        age: { name: 'age' },
      }

      const adapterWithMapping = new DrizzleAdapter<TestRecord>(
        mockDb as any,
        tableWithMapping as any,
        configWithMapping,
        mockOperators as any
      )

      mockDb._setMockQueryResult([])

      const blockingKeys = new Map([['firstName', 'John']])
      await adapterWithMapping.findByBlockingKeys(blockingKeys)

      expect(mockOperators.eq).toHaveBeenCalledWith(tableWithMapping.first_name, 'John')
    })
  })

  describe('filter operators', () => {
    it('handles equality operator', async () => {
      mockDb._setMockQueryResult([])

      const blockingKeys = new Map([['age', { operator: 'eq', value: 30 }]])
      await adapter.findByBlockingKeys(blockingKeys as any)

      expect(mockOperators.eq).toHaveBeenCalledWith(mockTable.age, 30)
    })

    it('handles not equal operator', async () => {
      mockDb._setMockQueryResult([{ count: 10 }])

      await adapter.count({ age: { operator: 'ne', value: 30 } })

      expect(mockOperators.ne).toHaveBeenCalledWith(mockTable.age, 30)
    })

    it('handles greater than operator', async () => {
      mockDb._setMockQueryResult([{ count: 10 }])

      await adapter.count({ age: { operator: 'gt', value: 25 } })

      expect(mockOperators.gt).toHaveBeenCalledWith(mockTable.age, 25)
    })

    it('handles IN operator', async () => {
      mockDb._setMockQueryResult([{ count: 5 }])

      await adapter.count({ age: { operator: 'in', value: [25, 30, 35] } })

      expect(mockOperators.inArray).toHaveBeenCalledWith(mockTable.age, [25, 30, 35])
    })

    it('handles LIKE operator', async () => {
      mockDb._setMockQueryResult([{ count: 3 }])

      await adapter.count({ email: { operator: 'like', value: '@test.com' } })

      expect(mockOperators.like).toHaveBeenCalledWith(mockTable.email, '@test.com')
    })

    it('throws error for IN operator with non-array value', async () => {
      const blockingKeys = new Map([['age', { operator: 'in', value: 30 }]])
      await expect(adapter.findByBlockingKeys(blockingKeys as any)).rejects.toThrow(QueryError)
    })
  })

  describe('factory function', () => {
    it('creates adapter via factory function', () => {
      const factoryAdapter = drizzleAdapter<TestRecord>(
        mockDb as any,
        mockTable as any,
        config,
        mockOperators as any
      )

      expect(factoryAdapter).toBeInstanceOf(DrizzleAdapter)
    })
  })
})
