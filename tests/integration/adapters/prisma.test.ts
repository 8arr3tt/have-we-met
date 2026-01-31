import { describe, it, expect, beforeEach } from 'vitest'
import { PrismaAdapter } from '../../../src/adapters/prisma/prisma-adapter'
import type { AdapterConfig } from '../../../src/adapters/types'

type TestRecord = {
  id: string
  firstName: string
  lastName: string
  email: string
  dobYear?: number
}

class MockPrismaClient {
  private records: Map<string, Record<string, unknown>> = new Map()
  private nextId = 1

  testRecords = {
    findMany: async (options?: {
      where?: Record<string, unknown>
      take?: number
      skip?: number
      orderBy?: Record<string, string>
      select?: Record<string, boolean>
    }) => {
      let results = Array.from(this.records.values())

      if (options?.where) {
        results = results.filter((record) => {
          for (const [key, value] of Object.entries(options.where)) {
            if (typeof value === 'object' && value !== null) {
              if ('in' in value && Array.isArray(value.in)) {
                if (!value.in.includes(record[key])) return false
              } else if ('not' in value) {
                if (record[key] === value.not) return false
              } else if ('contains' in value) {
                const recordValue = String(record[key] || '')
                const searchValue = String(value.contains || '')
                if (!recordValue.includes(searchValue)) return false
              } else if ('gt' in value) {
                if (!(record[key] > value.gt)) return false
              } else if ('gte' in value) {
                if (!(record[key] >= value.gte)) return false
              } else if ('lt' in value) {
                if (!(record[key] < value.lt)) return false
              } else if ('lte' in value) {
                if (!(record[key] <= value.lte)) return false
              }
            } else {
              if (record[key] !== value) return false
            }
          }
          return true
        })
      }

      if (options?.orderBy) {
        const [field, direction] = Object.entries(options.orderBy)[0]
        results.sort((a, b) => {
          const aVal = a[field] ?? ''
          const bVal = b[field] ?? ''
          if (aVal < bVal) return direction === 'asc' ? -1 : 1
          if (aVal > bVal) return direction === 'asc' ? 1 : -1
          return 0
        })
      }

      if (options?.skip) {
        results = results.slice(options.skip)
      }

      if (options?.take) {
        results = results.slice(0, options.take)
      }

      if (options?.select) {
        results = results.map((record) => {
          const selected: Record<string, unknown> = {}
          for (const [key, include] of Object.entries(options.select)) {
            if (include) {
              selected[key] = record[key]
            }
          }
          return selected
        })
      }

      return results
    },

    count: async (options?: { where?: Record<string, unknown> }) => {
      let results = Array.from(this.records.values())

      if (options?.where) {
        results = results.filter((record) => {
          for (const [key, value] of Object.entries(options.where)) {
            if (record[key] !== value) return false
          }
          return true
        })
      }

      return results.length
    },

    create: async (options: { data: Record<string, unknown> }) => {
      const id = options.data.id as string || String(this.nextId++)
      const record = { ...options.data, id }
      this.records.set(id, record)
      return record
    },

    update: async (options: {
      where: Record<string, unknown>
      data: Record<string, unknown>
    }) => {
      const id = options.where.id as string
      const existing = this.records.get(id)
      if (!existing) {
        throw new Error('Record to update not found')
      }
      const updated = { ...existing, ...options.data }
      this.records.set(id, updated)
      return updated
    },

    delete: async (options: { where: Record<string, unknown> }) => {
      const id = options.where.id as string
      if (!this.records.has(id)) {
        throw new Error('Record to delete does not exist')
      }
      this.records.delete(id)
      return { id }
    },

    createMany: async (options: { data: Record<string, unknown>[]; skipDuplicates?: boolean }) => {
      for (const data of options.data) {
        const id = data.id as string || String(this.nextId++)
        const record = { ...data, id }
        this.records.set(id, record)
      }
      return { count: options.data.length }
    },
  }

  async $transaction<R>(callback: (tx: MockPrismaClient) => Promise<R>): Promise<R> {
    const txClient = new MockPrismaClient()
    txClient.records = new Map(this.records)
    txClient.nextId = this.nextId

    try {
      const result = await callback(txClient)
      this.records = txClient.records
      this.nextId = txClient.nextId
      return result
    } catch (error) {
      throw error
    }
  }

  clear() {
    this.records.clear()
    this.nextId = 1
  }

  seed(records: Record<string, unknown>[]) {
    for (const record of records) {
      const id = record.id as string || String(this.nextId++)
      this.records.set(id, { ...record, id })
    }
  }
}

describe('Integration: Prisma Adapter', () => {
  let prisma: MockPrismaClient
  let adapter: PrismaAdapter<TestRecord>
  const config: AdapterConfig = {
    tableName: 'testRecords',
    primaryKey: 'id',
  }

  beforeEach(() => {
    prisma = new MockPrismaClient()
    adapter = new PrismaAdapter<TestRecord>(prisma as unknown as Parameters<typeof PrismaAdapter<TestRecord>['prototype']['constructor']>[0], config)
    prisma.seed([
      { id: '1', firstName: 'John', lastName: 'Smith', email: 'john@example.com', dobYear: 1985 },
      { id: '2', firstName: 'Jane', lastName: 'Smith', email: 'jane@example.com', dobYear: 1990 },
      { id: '3', firstName: 'Bob', lastName: 'Jones', email: 'bob@example.com', dobYear: 1985 },
      { id: '4', firstName: 'Alice', lastName: 'Brown', email: 'alice@example.com', dobYear: 1988 },
    ])
  })

  describe('resolves new customer against database', () => {
    it('finds matching records using blocking keys', async () => {
      const blockingKeys = new Map([
        ['lastName', 'Smith'],
        ['dobYear', 1985],
      ])

      const results = await adapter.findByBlockingKeys(blockingKeys)

      expect(results).toHaveLength(1)
      expect(results[0].firstName).toBe('John')
      expect(results[0].lastName).toBe('Smith')
    })

    it('returns empty array when no matches found', async () => {
      const blockingKeys = new Map([
        ['lastName', 'Nonexistent'],
      ])

      const results = await adapter.findByBlockingKeys(blockingKeys)

      expect(results).toHaveLength(0)
    })

    it('handles multiple blocking keys correctly', async () => {
      const blockingKeys = new Map([
        ['lastName', 'Smith'],
      ])

      const results = await adapter.findByBlockingKeys(blockingKeys)

      expect(results).toHaveLength(2)
      expect(results.every((r) => r.lastName === 'Smith')).toBe(true)
    })
  })

  describe('finds duplicates in existing customer database', () => {
    it('identifies records with same last name', async () => {
      const blockingKeys = new Map([['lastName', 'Smith']])
      const results = await adapter.findByBlockingKeys(blockingKeys)

      expect(results).toHaveLength(2)
      expect(results.map((r) => r.id)).toEqual(['1', '2'])
    })

    it('identifies records by birth year', async () => {
      const blockingKeys = new Map([['dobYear', 1985]])
      const results = await adapter.findByBlockingKeys(blockingKeys)

      expect(results).toHaveLength(2)
      expect(results.every((r) => r.dobYear === 1985)).toBe(true)
    })
  })

  describe('batch deduplicates records efficiently', () => {
    it('batch inserts multiple records', async () => {
      const newRecords: TestRecord[] = [
        { id: '10', firstName: 'Test1', lastName: 'User', email: 'test1@example.com' },
        { id: '11', firstName: 'Test2', lastName: 'User', email: 'test2@example.com' },
        { id: '12', firstName: 'Test3', lastName: 'User', email: 'test3@example.com' },
      ]

      const results = await adapter.batchInsert(newRecords)

      expect(results).toHaveLength(3)
      expect(results.every((r) => r.lastName === 'User')).toBe(true)
    })

    it('batch updates multiple records', async () => {
      const updates = [
        { id: '1', updates: { email: 'john.new@example.com' } },
        { id: '2', updates: { email: 'jane.new@example.com' } },
      ]

      const results = await adapter.batchUpdate(updates)

      expect(results).toHaveLength(2)
      expect(results[0].email).toBe('john.new@example.com')
      expect(results[1].email).toBe('jane.new@example.com')
    })

    it('handles pagination for large result sets', async () => {
      const page1 = await adapter.findAll({ limit: 2, offset: 0 })
      const page2 = await adapter.findAll({ limit: 2, offset: 2 })

      expect(page1).toHaveLength(2)
      expect(page2).toHaveLength(2)
      expect(page1[0].id).not.toBe(page2[0].id)
    })
  })

  describe('merges duplicates with transaction', () => {
    it('commits successful transaction', async () => {
      const result = await adapter.transaction(async (txAdapter) => {
        await txAdapter.update('1', { email: 'updated@example.com' })
        await txAdapter.delete('2')
        return { success: true }
      })

      expect(result.success).toBe(true)

      const records = await adapter.findAll()
      expect(records).toHaveLength(3)

      const updated = await adapter.findByIds(['1'])
      expect(updated[0].email).toBe('updated@example.com')
    })

    it('rolls back failed transaction', async () => {
      const initialCount = await adapter.count()

      try {
        await adapter.transaction(async (txAdapter) => {
          await txAdapter.update('1', { email: 'temp@example.com' })
          throw new Error('Intentional failure')
        })
      } catch (error) {
        expect(error).toBeDefined()
      }

      const finalCount = await adapter.count()
      expect(finalCount).toBe(initialCount)

      const record = await adapter.findByIds(['1'])
      expect(record[0].email).toBe('john@example.com')
    })
  })

  describe('handles connection errors gracefully', () => {
    it('throws QueryError on invalid model name', async () => {
      const badAdapter = new PrismaAdapter<TestRecord>(
        prisma as unknown as Parameters<typeof PrismaAdapter<TestRecord>['prototype']['constructor']>[0],
        { tableName: 'nonexistent', primaryKey: 'id' }
      )

      await expect(badAdapter.findAll()).rejects.toThrow()
    })

    it('throws NotFoundError when updating non-existent record', async () => {
      await expect(adapter.update('999', { email: 'test@example.com' })).rejects.toThrow(
        'not found'
      )
    })

    it('throws NotFoundError when deleting non-existent record', async () => {
      await expect(adapter.delete('999')).rejects.toThrow('not found')
    })
  })

  describe('CRUD operations', () => {
    it('inserts a new record', async () => {
      const newRecord: TestRecord = {
        id: '5',
        firstName: 'Charlie',
        lastName: 'Davis',
        email: 'charlie@example.com',
        dobYear: 1992,
      }

      const result = await adapter.insert(newRecord)

      expect(result.id).toBe('5')
      expect(result.firstName).toBe('Charlie')
    })

    it('updates an existing record', async () => {
      const updated = await adapter.update('1', { email: 'newemail@example.com' })

      expect(updated.email).toBe('newemail@example.com')
      expect(updated.firstName).toBe('John')
    })

    it('deletes a record', async () => {
      await adapter.delete('1')

      const records = await adapter.findAll()
      expect(records).toHaveLength(3)
      expect(records.every((r) => r.id !== '1')).toBe(true)
    })

    it('counts records with filter', async () => {
      const count = await adapter.count({ lastName: 'Smith' })
      expect(count).toBe(2)
    })

    it('finds records by IDs', async () => {
      const results = await adapter.findByIds(['1', '3'])

      expect(results).toHaveLength(2)
      expect(results.map((r) => r.id).sort()).toEqual(['1', '3'])
    })
  })

  describe('query options', () => {
    it('respects limit option', async () => {
      const results = await adapter.findAll({ limit: 2 })
      expect(results).toHaveLength(2)
    })

    it('respects offset option', async () => {
      const results = await adapter.findAll({ offset: 2 })
      expect(results).toHaveLength(2)
    })

    it('respects orderBy option', async () => {
      const results = await adapter.findAll({
        orderBy: { field: 'firstName', direction: 'asc' },
      })

      expect(results[0].firstName).toBe('Alice')
      expect(results[results.length - 1].firstName).toBe('John')
    })

    it('respects fields option for projection', async () => {
      const results = await adapter.findAll({ fields: ['id', 'firstName'] })

      expect(results).toHaveLength(4)
      expect(results[0]).toHaveProperty('id')
      expect(results[0]).toHaveProperty('firstName')
    })
  })
})
