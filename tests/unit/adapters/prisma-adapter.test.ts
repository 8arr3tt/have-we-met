import { describe, it, expect, beforeEach, vi } from 'vitest'
import { PrismaAdapter, prismaAdapter } from '../../../src/adapters/prisma'
import {
  QueryError,
  TransactionError,
  NotFoundError,
} from '../../../src/adapters/adapter-error'
import type { AdapterConfig } from '../../../src/adapters/types'

type TestRecord = {
  id: string
  firstName: string
  lastName: string
  email: string
  age: number
}

const createMockPrismaClient = () => {
  return {
    testRecords: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
      createMany: vi.fn(),
    },
    $transaction: vi.fn(),
  }
}

describe('PrismaAdapter', () => {
  let mockPrisma: ReturnType<typeof createMockPrismaClient>
  let adapter: PrismaAdapter<TestRecord>
  const config: AdapterConfig = { tableName: 'testRecords' }

  beforeEach(() => {
    mockPrisma = createMockPrismaClient()
    adapter = new PrismaAdapter<TestRecord>(
      mockPrisma as unknown as any,
      config
    )
  })

  describe('constructor', () => {
    it('creates adapter with valid config', () => {
      expect(adapter).toBeInstanceOf(PrismaAdapter)
    })

    it('throws error for missing model', async () => {
      const invalidPrisma = { nonExistent: {} }
      const invalidAdapter = new PrismaAdapter<TestRecord>(
        invalidPrisma as unknown as any,
        { tableName: 'invalidModel' }
      )

      await expect(invalidAdapter.findAll()).rejects.toThrow(QueryError)
    })
  })

  describe('findByBlockingKeys', () => {
    it('finds records by single blocking key', async () => {
      const mockRecords = [
        {
          id: '1',
          firstName: 'John',
          lastName: 'Smith',
          email: 'john@test.com',
          age: 30,
        },
        {
          id: '2',
          firstName: 'Jane',
          lastName: 'Smith',
          email: 'jane@test.com',
          age: 28,
        },
      ]
      mockPrisma.testRecords.findMany.mockResolvedValue(mockRecords)

      const blockingKeys = new Map([['lastName', 'Smith']])
      const results = await adapter.findByBlockingKeys(blockingKeys)

      expect(mockPrisma.testRecords.findMany).toHaveBeenCalledWith({
        where: { lastName: 'Smith' },
        take: 1000,
        skip: 0,
      })
      expect(results).toEqual(mockRecords)
    })

    it('finds records by multiple blocking keys', async () => {
      const mockRecords = [
        {
          id: '1',
          firstName: 'John',
          lastName: 'Smith',
          email: 'john@test.com',
          age: 30,
        },
      ]
      mockPrisma.testRecords.findMany.mockResolvedValue(mockRecords)

      const blockingKeys = new Map([
        ['lastName', 'Smith'],
        ['age', 30],
      ])
      const results = await adapter.findByBlockingKeys(blockingKeys)

      expect(mockPrisma.testRecords.findMany).toHaveBeenCalledWith({
        where: { lastName: 'Smith', age: 30 },
        take: 1000,
        skip: 0,
      })
      expect(results).toEqual(mockRecords)
    })

    it('returns empty array when no matches', async () => {
      mockPrisma.testRecords.findMany.mockResolvedValue([])

      const blockingKeys = new Map([['lastName', 'Nonexistent']])
      const results = await adapter.findByBlockingKeys(blockingKeys)

      expect(results).toEqual([])
    })

    it('respects limit and offset', async () => {
      mockPrisma.testRecords.findMany.mockResolvedValue([])

      const blockingKeys = new Map([['lastName', 'Smith']])
      await adapter.findByBlockingKeys(blockingKeys, { limit: 10, offset: 5 })

      expect(mockPrisma.testRecords.findMany).toHaveBeenCalledWith({
        where: { lastName: 'Smith' },
        take: 10,
        skip: 5,
      })
    })

    it('applies orderBy option', async () => {
      mockPrisma.testRecords.findMany.mockResolvedValue([])

      const blockingKeys = new Map([['lastName', 'Smith']])
      await adapter.findByBlockingKeys(blockingKeys, {
        orderBy: { field: 'firstName', direction: 'asc' },
      })

      expect(mockPrisma.testRecords.findMany).toHaveBeenCalledWith({
        where: { lastName: 'Smith' },
        take: 1000,
        skip: 0,
        orderBy: { firstName: 'asc' },
      })
    })

    it('applies field selection', async () => {
      mockPrisma.testRecords.findMany.mockResolvedValue([])

      const blockingKeys = new Map([['lastName', 'Smith']])
      await adapter.findByBlockingKeys(blockingKeys, {
        fields: ['id', 'firstName', 'lastName'],
      })

      expect(mockPrisma.testRecords.findMany).toHaveBeenCalledWith({
        where: { lastName: 'Smith' },
        take: 1000,
        skip: 0,
        select: { id: true, firstName: true, lastName: true },
      })
    })

    it('handles database errors', async () => {
      mockPrisma.testRecords.findMany.mockRejectedValue(
        new Error('Database error')
      )

      const blockingKeys = new Map([['lastName', 'Smith']])
      await expect(adapter.findByBlockingKeys(blockingKeys)).rejects.toThrow(
        QueryError
      )
    })
  })

  describe('findByIds', () => {
    it('finds multiple records by ID', async () => {
      const mockRecords = [
        {
          id: '1',
          firstName: 'John',
          lastName: 'Smith',
          email: 'john@test.com',
          age: 30,
        },
        {
          id: '2',
          firstName: 'Jane',
          lastName: 'Doe',
          email: 'jane@test.com',
          age: 28,
        },
      ]
      mockPrisma.testRecords.findMany.mockResolvedValue(mockRecords)

      const results = await adapter.findByIds(['1', '2'])

      expect(mockPrisma.testRecords.findMany).toHaveBeenCalledWith({
        where: { id: { in: ['1', '2'] } },
      })
      expect(results).toEqual(mockRecords)
    })

    it('handles non-existent IDs gracefully', async () => {
      mockPrisma.testRecords.findMany.mockResolvedValue([])

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
        {
          id: '1',
          firstName: 'John',
          lastName: 'Smith',
          email: 'john@test.com',
          age: 30,
        },
      ]
      mockPrisma.testRecords.findMany.mockResolvedValue(mockRecords)

      const results = await adapter.findAll()

      expect(mockPrisma.testRecords.findMany).toHaveBeenCalledWith({
        take: 1000,
        skip: 0,
      })
      expect(results).toEqual(mockRecords)
    })

    it('applies pagination options', async () => {
      mockPrisma.testRecords.findMany.mockResolvedValue([])

      await adapter.findAll({ limit: 50, offset: 100 })

      expect(mockPrisma.testRecords.findMany).toHaveBeenCalledWith({
        take: 50,
        skip: 100,
      })
    })

    it('applies orderBy option', async () => {
      mockPrisma.testRecords.findMany.mockResolvedValue([])

      await adapter.findAll({
        orderBy: { field: 'lastName', direction: 'desc' },
      })

      expect(mockPrisma.testRecords.findMany).toHaveBeenCalledWith({
        take: 1000,
        skip: 0,
        orderBy: { lastName: 'desc' },
      })
    })

    it('applies field selection', async () => {
      mockPrisma.testRecords.findMany.mockResolvedValue([])

      await adapter.findAll({ fields: ['id', 'email'] })

      expect(mockPrisma.testRecords.findMany).toHaveBeenCalledWith({
        take: 1000,
        skip: 0,
        select: { id: true, email: true },
      })
    })
  })

  describe('count', () => {
    it('counts all records without filter', async () => {
      mockPrisma.testRecords.count.mockResolvedValue(42)

      const result = await adapter.count()

      expect(mockPrisma.testRecords.count).toHaveBeenCalledWith({
        where: undefined,
      })
      expect(result).toBe(42)
    })

    it('counts records with filter', async () => {
      mockPrisma.testRecords.count.mockResolvedValue(5)

      const result = await adapter.count({ lastName: 'Smith' })

      expect(mockPrisma.testRecords.count).toHaveBeenCalledWith({
        where: { lastName: 'Smith' },
      })
      expect(result).toBe(5)
    })

    it('handles filter operators', async () => {
      mockPrisma.testRecords.count.mockResolvedValue(3)

      const result = await adapter.count({
        age: { operator: 'gt', value: 25 },
      })

      expect(mockPrisma.testRecords.count).toHaveBeenCalledWith({
        where: { age: { gt: 25 } },
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
      mockPrisma.testRecords.create.mockResolvedValue(newRecord)

      const result = await adapter.insert(newRecord)

      expect(mockPrisma.testRecords.create).toHaveBeenCalledWith({
        data: newRecord,
      })
      expect(result).toEqual(newRecord)
    })

    it('handles database errors during insert', async () => {
      mockPrisma.testRecords.create.mockRejectedValue(
        new Error('Unique constraint failed')
      )

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
      mockPrisma.testRecords.update.mockResolvedValue(updatedRecord)

      const result = await adapter.update('1', {
        email: 'john.smith@test.com',
        age: 31,
      })

      expect(mockPrisma.testRecords.update).toHaveBeenCalledWith({
        where: { id: '1' },
        data: { email: 'john.smith@test.com', age: 31 },
      })
      expect(result).toEqual(updatedRecord)
    })

    it('throws NotFoundError for non-existent record', async () => {
      mockPrisma.testRecords.update.mockRejectedValue(
        new Error('Record to update not found')
      )

      await expect(
        adapter.update('999', { email: 'new@test.com' })
      ).rejects.toThrow(NotFoundError)
    })

    it('handles other database errors', async () => {
      mockPrisma.testRecords.update.mockRejectedValue(
        new Error('Constraint violation')
      )

      await expect(
        adapter.update('1', { email: 'new@test.com' })
      ).rejects.toThrow(QueryError)
    })
  })

  describe('delete', () => {
    it('deletes a record', async () => {
      mockPrisma.testRecords.delete.mockResolvedValue({
        id: '1',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@test.com',
        age: 30,
      })

      await adapter.delete('1')

      expect(mockPrisma.testRecords.delete).toHaveBeenCalledWith({
        where: { id: '1' },
      })
    })

    it('throws NotFoundError for non-existent record', async () => {
      mockPrisma.testRecords.delete.mockRejectedValue(
        new Error('Record to delete does not exist')
      )

      await expect(adapter.delete('999')).rejects.toThrow(NotFoundError)
    })
  })

  describe('transaction', () => {
    it('commits successful transaction', async () => {
      const mockTx = createMockPrismaClient()
      mockTx.testRecords.create.mockResolvedValue({
        id: '1',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@test.com',
        age: 30,
      })

      mockPrisma.$transaction.mockImplementation(async (callback) => {
        return await callback(mockTx)
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
      expect(mockPrisma.$transaction).toHaveBeenCalled()
    })

    it('rolls back failed transaction', async () => {
      mockPrisma.$transaction.mockRejectedValue(new Error('Transaction failed'))

      await expect(
        adapter.transaction(async () => {
          throw new Error('Operation failed')
        })
      ).rejects.toThrow(TransactionError)
    })

    it('allows nested operations in transaction', async () => {
      const mockTx = createMockPrismaClient()
      mockTx.testRecords.create.mockResolvedValue({
        id: '1',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@test.com',
        age: 30,
      })
      mockTx.testRecords.delete.mockResolvedValue({
        id: '2',
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane@test.com',
        age: 28,
      })

      mockPrisma.$transaction.mockImplementation(async (callback) => {
        return await callback(mockTx)
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
        {
          id: '1',
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@test.com',
          age: 30,
        },
        {
          id: '2',
          firstName: 'Jane',
          lastName: 'Smith',
          email: 'jane@test.com',
          age: 28,
        },
      ]

      mockPrisma.testRecords.createMany.mockResolvedValue({ count: 2 })
      mockPrisma.testRecords.findMany.mockResolvedValue(records)

      const results = await adapter.batchInsert(records)

      expect(mockPrisma.testRecords.createMany).toHaveBeenCalledWith({
        data: records,
        skipDuplicates: false,
      })
      expect(results).toEqual(records)
    })

    it('throws error for empty records array', async () => {
      await expect(adapter.batchInsert([])).rejects.toThrow()
    })

    it('handles records without pre-assigned IDs', async () => {
      const records = [
        {
          id: undefined,
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@test.com',
          age: 30,
        },
        {
          id: undefined,
          firstName: 'Jane',
          lastName: 'Smith',
          email: 'jane@test.com',
          age: 28,
        },
      ] as any

      const insertedRecords = [
        {
          id: '1',
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@test.com',
          age: 30,
        },
        {
          id: '2',
          firstName: 'Jane',
          lastName: 'Smith',
          email: 'jane@test.com',
          age: 28,
        },
      ]

      mockPrisma.testRecords.createMany.mockResolvedValue({ count: 2 })
      mockPrisma.testRecords.findMany.mockResolvedValue(insertedRecords)

      const results = await adapter.batchInsert(records)

      expect(results).toHaveLength(2)
    })

    it('handles database errors during batch insert', async () => {
      mockPrisma.testRecords.createMany.mockRejectedValue(
        new Error('Batch insert failed')
      )

      const records = [
        {
          id: '1',
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@test.com',
          age: 30,
        },
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

      const mockTx = createMockPrismaClient()
      mockTx.testRecords.update
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

      mockPrisma.$transaction.mockImplementation(async (callback) => {
        return await callback(mockTx)
      })

      const results = await adapter.batchUpdate(updates)

      expect(results).toHaveLength(2)
      expect(results[0]).toHaveProperty('email', 'john.new@test.com')
      expect(results[1]).toHaveProperty('age', 29)
    })

    it('returns empty array for empty updates', async () => {
      const results = await adapter.batchUpdate([])

      expect(results).toEqual([])
      expect(mockPrisma.$transaction).not.toHaveBeenCalled()
    })

    it('handles errors during batch update', async () => {
      mockPrisma.$transaction.mockRejectedValue(
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

      const adapterWithMapping = new PrismaAdapter<TestRecord>(
        mockPrisma as unknown as any,
        configWithMapping
      )

      mockPrisma.testRecords.findMany.mockResolvedValue([])

      const blockingKeys = new Map([['firstName', 'John']])
      await adapterWithMapping.findByBlockingKeys(blockingKeys)

      expect(mockPrisma.testRecords.findMany).toHaveBeenCalledWith({
        where: { first_name: 'John' },
        take: 1000,
        skip: 0,
      })
    })
  })

  describe('filter operators', () => {
    it('handles equality operator', async () => {
      mockPrisma.testRecords.findMany.mockResolvedValue([])

      const blockingKeys = new Map([['age', { operator: 'eq', value: 30 }]])
      await adapter.findByBlockingKeys(blockingKeys as any)

      expect(mockPrisma.testRecords.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { age: 30 },
        })
      )
    })

    it('handles not equal operator', async () => {
      mockPrisma.testRecords.count.mockResolvedValue(10)

      await adapter.count({ age: { operator: 'ne', value: 30 } })

      expect(mockPrisma.testRecords.count).toHaveBeenCalledWith({
        where: { age: { not: 30 } },
      })
    })

    it('handles greater than operator', async () => {
      mockPrisma.testRecords.count.mockResolvedValue(10)

      await adapter.count({ age: { operator: 'gt', value: 25 } })

      expect(mockPrisma.testRecords.count).toHaveBeenCalledWith({
        where: { age: { gt: 25 } },
      })
    })

    it('handles IN operator', async () => {
      mockPrisma.testRecords.count.mockResolvedValue(5)

      await adapter.count({ age: { operator: 'in', value: [25, 30, 35] } })

      expect(mockPrisma.testRecords.count).toHaveBeenCalledWith({
        where: { age: { in: [25, 30, 35] } },
      })
    })

    it('handles LIKE operator', async () => {
      mockPrisma.testRecords.count.mockResolvedValue(3)

      await adapter.count({ email: { operator: 'like', value: '@test.com' } })

      expect(mockPrisma.testRecords.count).toHaveBeenCalledWith({
        where: { email: { contains: '@test.com' } },
      })
    })
  })

  describe('factory function', () => {
    it('creates adapter via factory function', () => {
      const factoryAdapter = prismaAdapter<TestRecord>(
        mockPrisma as unknown as any,
        config
      )

      expect(factoryAdapter).toBeInstanceOf(PrismaAdapter)
    })
  })
})
