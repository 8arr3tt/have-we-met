import { describe, it, expect, beforeEach, vi } from 'vitest'
import { TypeORMAdapter, typeormAdapter } from '../../../src/adapters/typeorm'
import { QueryError, TransactionError, NotFoundError } from '../../../src/adapters/adapter-error'
import type { AdapterConfig } from '../../../src/adapters/types'

type TestRecord = {
  id: string
  firstName: string
  lastName: string
  email: string
  age: number
}

const createMockRepository = () => {
  return {
    find: vi.fn(),
    findOne: vi.fn(),
    count: vi.fn(),
    save: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    insert: vi.fn(),
    manager: {
      connection: {
        transaction: vi.fn(),
      },
    },
  }
}

describe('TypeORMAdapter', () => {
  let mockRepository: ReturnType<typeof createMockRepository>
  let adapter: TypeORMAdapter<TestRecord>
  const config: AdapterConfig = { tableName: 'testRecords' }

  beforeEach(() => {
    mockRepository = createMockRepository()
    adapter = new TypeORMAdapter<TestRecord>(mockRepository as any, config)
  })

  describe('constructor', () => {
    it('creates adapter with valid config', () => {
      expect(adapter).toBeInstanceOf(TypeORMAdapter)
    })
  })

  describe('findByBlockingKeys', () => {
    it('finds records by single blocking key', async () => {
      const mockRecords = [
        { id: '1', firstName: 'John', lastName: 'Smith', email: 'john@test.com', age: 30 },
        { id: '2', firstName: 'Jane', lastName: 'Smith', email: 'jane@test.com', age: 28 },
      ]
      mockRepository.find.mockResolvedValue(mockRecords)

      const blockingKeys = new Map([['lastName', 'Smith']])
      const results = await adapter.findByBlockingKeys(blockingKeys)

      expect(mockRepository.find).toHaveBeenCalledWith({
        where: { lastName: 'Smith' },
        take: 1000,
        skip: 0,
      })
      expect(results).toEqual(mockRecords)
    })

    it('finds records by multiple blocking keys', async () => {
      const mockRecords = [
        { id: '1', firstName: 'John', lastName: 'Smith', email: 'john@test.com', age: 30 },
      ]
      mockRepository.find.mockResolvedValue(mockRecords)

      const blockingKeys = new Map([
        ['lastName', 'Smith'],
        ['age', 30],
      ])
      const results = await adapter.findByBlockingKeys(blockingKeys)

      expect(mockRepository.find).toHaveBeenCalledWith({
        where: { lastName: 'Smith', age: 30 },
        take: 1000,
        skip: 0,
      })
      expect(results).toEqual(mockRecords)
    })

    it('returns empty array when no matches', async () => {
      mockRepository.find.mockResolvedValue([])

      const blockingKeys = new Map([['lastName', 'Nonexistent']])
      const results = await adapter.findByBlockingKeys(blockingKeys)

      expect(results).toEqual([])
    })

    it('respects limit and offset', async () => {
      mockRepository.find.mockResolvedValue([])

      const blockingKeys = new Map([['lastName', 'Smith']])
      await adapter.findByBlockingKeys(blockingKeys, { limit: 10, offset: 5 })

      expect(mockRepository.find).toHaveBeenCalledWith({
        where: { lastName: 'Smith' },
        take: 10,
        skip: 5,
      })
    })

    it('applies orderBy option', async () => {
      mockRepository.find.mockResolvedValue([])

      const blockingKeys = new Map([['lastName', 'Smith']])
      await adapter.findByBlockingKeys(blockingKeys, {
        orderBy: { field: 'firstName', direction: 'asc' },
      })

      expect(mockRepository.find).toHaveBeenCalledWith({
        where: { lastName: 'Smith' },
        take: 1000,
        skip: 0,
        order: { firstName: 'ASC' },
      })
    })

    it('applies field selection', async () => {
      mockRepository.find.mockResolvedValue([])

      const blockingKeys = new Map([['lastName', 'Smith']])
      await adapter.findByBlockingKeys(blockingKeys, {
        fields: ['id', 'firstName', 'lastName'],
      })

      expect(mockRepository.find).toHaveBeenCalledWith({
        where: { lastName: 'Smith' },
        take: 1000,
        skip: 0,
        select: { id: true, firstName: true, lastName: true },
      })
    })

    it('handles database errors', async () => {
      mockRepository.find.mockRejectedValue(new Error('Database error'))

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
      mockRepository.find.mockResolvedValue(mockRecords)

      const results = await adapter.findByIds(['1', '2'])

      expect(mockRepository.find).toHaveBeenCalledWith({
        where: { id: { $in: ['1', '2'] } },
      })
      expect(results).toEqual(mockRecords)
    })

    it('handles non-existent IDs gracefully', async () => {
      mockRepository.find.mockResolvedValue([])

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
      mockRepository.find.mockResolvedValue(mockRecords)

      const results = await adapter.findAll()

      expect(mockRepository.find).toHaveBeenCalledWith({
        take: 1000,
        skip: 0,
      })
      expect(results).toEqual(mockRecords)
    })

    it('applies pagination options', async () => {
      mockRepository.find.mockResolvedValue([])

      await adapter.findAll({ limit: 50, offset: 100 })

      expect(mockRepository.find).toHaveBeenCalledWith({
        take: 50,
        skip: 100,
      })
    })

    it('applies orderBy option', async () => {
      mockRepository.find.mockResolvedValue([])

      await adapter.findAll({
        orderBy: { field: 'lastName', direction: 'desc' },
      })

      expect(mockRepository.find).toHaveBeenCalledWith({
        take: 1000,
        skip: 0,
        order: { lastName: 'DESC' },
      })
    })

    it('applies field selection', async () => {
      mockRepository.find.mockResolvedValue([])

      await adapter.findAll({ fields: ['id', 'email'] })

      expect(mockRepository.find).toHaveBeenCalledWith({
        take: 1000,
        skip: 0,
        select: { id: true, email: true },
      })
    })
  })

  describe('count', () => {
    it('counts all records without filter', async () => {
      mockRepository.count.mockResolvedValue(42)

      const result = await adapter.count()

      expect(mockRepository.count).toHaveBeenCalledWith(undefined)
      expect(result).toBe(42)
    })

    it('counts records with filter', async () => {
      mockRepository.count.mockResolvedValue(5)

      const result = await adapter.count({ lastName: 'Smith' })

      expect(mockRepository.count).toHaveBeenCalledWith({
        where: { lastName: 'Smith' },
      })
      expect(result).toBe(5)
    })

    it('handles filter operators', async () => {
      mockRepository.count.mockResolvedValue(3)

      const result = await adapter.count({
        age: { operator: 'gt', value: 25 },
      })

      expect(mockRepository.count).toHaveBeenCalledWith({
        where: { age: { $gt: 25 } },
      })
      expect(result).toBe(3)
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
      mockRepository.save.mockResolvedValue(newRecord)

      const result = await adapter.insert(newRecord)

      expect(mockRepository.save).toHaveBeenCalledWith(newRecord)
      expect(result).toEqual(newRecord)
    })

    it('handles database errors during insert', async () => {
      mockRepository.save.mockRejectedValue(new Error('Unique constraint failed'))

      const newRecord = {
        id: '1',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@test.com',
        age: 30,
      }

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
      mockRepository.update.mockResolvedValue({ affected: 1 })
      mockRepository.findOne.mockResolvedValue(updatedRecord)

      const result = await adapter.update('1', { email: 'john.smith@test.com', age: 31 })

      expect(mockRepository.update).toHaveBeenCalledWith(
        { id: '1' },
        { email: 'john.smith@test.com', age: 31 }
      )
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { id: '1' },
      })
      expect(result).toEqual(updatedRecord)
    })

    it('throws NotFoundError when update affects no rows', async () => {
      mockRepository.update.mockResolvedValue({ affected: 0 })

      await expect(adapter.update('999', { email: 'new@test.com' })).rejects.toThrow(
        NotFoundError
      )
    })

    it('throws NotFoundError when record not found after update', async () => {
      mockRepository.update.mockResolvedValue({ affected: 1 })
      mockRepository.findOne.mockResolvedValue(null)

      await expect(adapter.update('1', { email: 'new@test.com' })).rejects.toThrow(
        NotFoundError
      )
    })

    it('handles other database errors', async () => {
      mockRepository.update.mockRejectedValue(new Error('Constraint violation'))

      await expect(adapter.update('1', { email: 'new@test.com' })).rejects.toThrow(QueryError)
    })
  })

  describe('delete', () => {
    it('deletes a record', async () => {
      mockRepository.delete.mockResolvedValue({ affected: 1 })

      await adapter.delete('1')

      expect(mockRepository.delete).toHaveBeenCalledWith({ id: '1' })
    })

    it('throws NotFoundError when delete affects no rows', async () => {
      mockRepository.delete.mockResolvedValue({ affected: 0 })

      await expect(adapter.delete('999')).rejects.toThrow(NotFoundError)
    })

    it('handles other database errors', async () => {
      mockRepository.delete.mockRejectedValue(new Error('Database error'))

      await expect(adapter.delete('1')).rejects.toThrow(QueryError)
    })
  })

  describe('transaction', () => {
    it('commits successful transaction', async () => {
      const mockTxRepository = createMockRepository()
      mockTxRepository.save.mockResolvedValue({
        id: '1',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@test.com',
        age: 30,
      })

      mockRepository.manager.connection.transaction.mockImplementation(async (callback) => {
        const mockEntityManager = {
          getRepository: vi.fn().mockReturnValue(mockTxRepository),
        }
        return await callback(mockEntityManager)
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
      expect(mockRepository.manager.connection.transaction).toHaveBeenCalled()
    })

    it('rolls back failed transaction', async () => {
      mockRepository.manager.connection.transaction.mockRejectedValue(
        new Error('Transaction failed')
      )

      await expect(
        adapter.transaction(async () => {
          throw new Error('Operation failed')
        })
      ).rejects.toThrow(TransactionError)
    })

    it('allows nested operations in transaction', async () => {
      const mockTxRepository = createMockRepository()
      mockTxRepository.save.mockResolvedValue({
        id: '1',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@test.com',
        age: 30,
      })
      mockTxRepository.delete.mockResolvedValue({ affected: 1 })

      mockRepository.manager.connection.transaction.mockImplementation(async (callback) => {
        const mockEntityManager = {
          getRepository: vi.fn().mockReturnValue(mockTxRepository),
        }
        return await callback(mockEntityManager)
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

      mockRepository.insert.mockResolvedValue({ identifiers: [{ id: '1' }, { id: '2' }] })
      mockRepository.find.mockResolvedValue(records)

      const results = await adapter.batchInsert(records)

      expect(mockRepository.insert).toHaveBeenCalledWith(records)
      expect(results).toEqual(records)
    })

    it('throws error for empty records array', async () => {
      await expect(adapter.batchInsert([])).rejects.toThrow()
    })

    it('handles records without pre-assigned IDs', async () => {
      const records = [
        { id: undefined, firstName: 'John', lastName: 'Doe', email: 'john@test.com', age: 30 },
        { id: undefined, firstName: 'Jane', lastName: 'Smith', email: 'jane@test.com', age: 28 },
      ] as any

      const insertedRecords = [
        { id: '1', firstName: 'John', lastName: 'Doe', email: 'john@test.com', age: 30 },
        { id: '2', firstName: 'Jane', lastName: 'Smith', email: 'jane@test.com', age: 28 },
      ]

      mockRepository.insert.mockResolvedValue({ identifiers: [] })
      mockRepository.find.mockResolvedValue(insertedRecords)

      const results = await adapter.batchInsert(records)

      expect(results).toHaveLength(2)
    })

    it('handles database errors during batch insert', async () => {
      mockRepository.insert.mockRejectedValue(new Error('Batch insert failed'))

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

      const mockTxRepository = createMockRepository()
      mockTxRepository.update
        .mockResolvedValueOnce({ affected: 1 })
        .mockResolvedValueOnce({ affected: 1 })
      mockTxRepository.findOne
        .mockResolvedValueOnce({
          id: '1',
          firstName: 'John',
          lastName: 'Doe',
          email: 'john.new@test.com',
          age: 30,
        })
        .mockResolvedValueOnce({
          id: '2',
          firstName: 'Jane',
          lastName: 'Smith',
          email: 'jane@test.com',
          age: 29,
        })

      mockRepository.manager.connection.transaction.mockImplementation(async (callback) => {
        const mockEntityManager = {
          getRepository: vi.fn().mockReturnValue(mockTxRepository),
        }
        return await callback(mockEntityManager)
      })

      const results = await adapter.batchUpdate(updates)

      expect(results).toHaveLength(2)
      expect(results[0]).toHaveProperty('email', 'john.new@test.com')
      expect(results[1]).toHaveProperty('age', 29)
    })

    it('returns empty array for empty updates', async () => {
      const results = await adapter.batchUpdate([])

      expect(results).toEqual([])
      expect(mockRepository.manager.connection.transaction).not.toHaveBeenCalled()
    })

    it('handles errors during batch update', async () => {
      mockRepository.manager.connection.transaction.mockRejectedValue(
        new Error('Batch update failed')
      )

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

      const adapterWithMapping = new TypeORMAdapter<TestRecord>(
        mockRepository as any,
        configWithMapping
      )

      mockRepository.find.mockResolvedValue([])

      const blockingKeys = new Map([['firstName', 'John']])
      await adapterWithMapping.findByBlockingKeys(blockingKeys)

      expect(mockRepository.find).toHaveBeenCalledWith({
        where: { first_name: 'John' },
        take: 1000,
        skip: 0,
      })
    })
  })

  describe('filter operators', () => {
    it('handles equality operator', async () => {
      mockRepository.find.mockResolvedValue([])

      const blockingKeys = new Map([['age', { operator: 'eq', value: 30 }]])
      await adapter.findByBlockingKeys(blockingKeys as any)

      expect(mockRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { age: 30 },
        })
      )
    })

    it('handles not equal operator', async () => {
      mockRepository.count.mockResolvedValue(10)

      await adapter.count({ age: { operator: 'ne', value: 30 } })

      expect(mockRepository.count).toHaveBeenCalledWith({
        where: { age: { $ne: 30 } },
      })
    })

    it('handles greater than operator', async () => {
      mockRepository.count.mockResolvedValue(10)

      await adapter.count({ age: { operator: 'gt', value: 25 } })

      expect(mockRepository.count).toHaveBeenCalledWith({
        where: { age: { $gt: 25 } },
      })
    })

    it('handles greater than or equal operator', async () => {
      mockRepository.count.mockResolvedValue(10)

      await adapter.count({ age: { operator: 'gte', value: 25 } })

      expect(mockRepository.count).toHaveBeenCalledWith({
        where: { age: { $gte: 25 } },
      })
    })

    it('handles less than operator', async () => {
      mockRepository.count.mockResolvedValue(10)

      await adapter.count({ age: { operator: 'lt', value: 40 } })

      expect(mockRepository.count).toHaveBeenCalledWith({
        where: { age: { $lt: 40 } },
      })
    })

    it('handles less than or equal operator', async () => {
      mockRepository.count.mockResolvedValue(10)

      await adapter.count({ age: { operator: 'lte', value: 40 } })

      expect(mockRepository.count).toHaveBeenCalledWith({
        where: { age: { $lte: 40 } },
      })
    })

    it('handles IN operator', async () => {
      mockRepository.count.mockResolvedValue(5)

      await adapter.count({ age: { operator: 'in', value: [25, 30, 35] } })

      expect(mockRepository.count).toHaveBeenCalledWith({
        where: { age: { $in: [25, 30, 35] } },
      })
    })

    it('handles LIKE operator', async () => {
      mockRepository.count.mockResolvedValue(3)

      await adapter.count({ email: { operator: 'like', value: '@test.com' } })

      expect(mockRepository.count).toHaveBeenCalledWith({
        where: { email: { $like: '%@test.com%' } },
      })
    })
  })

  describe('factory function', () => {
    it('creates adapter via factory function', () => {
      const factoryAdapter = typeormAdapter<TestRecord>(mockRepository as any, config)

      expect(factoryAdapter).toBeInstanceOf(TypeORMAdapter)
    })

    it('creates adapter via factory function with entity target', () => {
      const entityTarget = class TestEntity {}
      const factoryAdapter = typeormAdapter<TestRecord>(
        mockRepository as any,
        config,
        entityTarget
      )

      expect(factoryAdapter).toBeInstanceOf(TypeORMAdapter)
    })
  })
})
