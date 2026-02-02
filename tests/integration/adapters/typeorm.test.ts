import { describe, it, expect, beforeEach } from 'vitest'
import { TypeORMAdapter } from '../../../src/adapters/typeorm/typeorm-adapter'
import type { AdapterConfig } from '../../../src/adapters/types'

type TestRecord = {
  id: string
  firstName: string
  lastName: string
  email: string
  dobYear?: number
}

class MockEntityManager {
  private records: Map<string, Record<string, unknown>>

  constructor(records: Map<string, Record<string, unknown>>) {
    this.records = records
  }

  getRepository<T>() {
    return new MockRepository<T>(this.records)
  }
}

class MockRepository<T> {
  private records: Map<string, Record<string, unknown>>

  constructor(records: Map<string, Record<string, unknown>>) {
    this.records = records
  }

  manager = {
    connection: {
      transaction: async <R>(
        callback: (entityManager: MockEntityManager) => Promise<R>
      ): Promise<R> => {
        const txRecords = new Map(this.records)
        const entityManager = new MockEntityManager(txRecords)

        try {
          const result = await callback(entityManager)
          this.records = txRecords
          return result
        } catch (error) {
          throw error
        }
      },
    },
  }

  private matchesWhere(
    record: Record<string, unknown>,
    where: Record<string, unknown>
  ): boolean {
    for (const [key, value] of Object.entries(where)) {
      if (typeof value === 'object' && value !== null) {
        if ('$in' in value && Array.isArray(value.$in)) {
          if (!value.$in.includes(record[key])) return false
        } else if ('$ne' in value) {
          if (record[key] === value.$ne) return false
        } else if ('$gt' in value) {
          if (!(record[key] > value.$gt)) return false
        } else if ('$gte' in value) {
          if (!(record[key] >= value.$gte)) return false
        } else if ('$lt' in value) {
          if (!(record[key] < value.$lt)) return false
        } else if ('$lte' in value) {
          if (!(record[key] <= value.$lte)) return false
        } else if ('$like' in value) {
          const pattern = String(value.$like).replace(/%/g, '')
          if (!String(record[key]).includes(pattern)) return false
        }
      } else {
        if (record[key] !== value) return false
      }
    }
    return true
  }

  async find(options?: {
    where?: Record<string, unknown>
    take?: number
    skip?: number
    order?: Record<string, string>
    select?: Record<string, boolean>
  }): Promise<T[]> {
    let results = Array.from(this.records.values())

    if (options?.where) {
      results = results.filter((record) =>
        this.matchesWhere(record, options.where!)
      )
    }

    if (options?.order) {
      const [field, direction] = Object.entries(options.order)[0]
      results.sort((a, b) => {
        const aVal = a[field] ?? ''
        const bVal = b[field] ?? ''
        if (aVal < bVal) return direction === 'ASC' ? -1 : 1
        if (aVal > bVal) return direction === 'ASC' ? 1 : -1
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
        for (const [key, include] of Object.entries(options.select!)) {
          if (include) {
            selected[key] = record[key]
          }
        }
        return selected
      })
    }

    return results as T[]
  }

  async findOne(options?: {
    where?: Record<string, unknown>
  }): Promise<T | null> {
    const results = await this.find(options)
    return results.length > 0 ? results[0] : null
  }

  async count(options?: { where?: Record<string, unknown> }): Promise<number> {
    const results = await this.find(options)
    return results.length
  }

  async save(entity: unknown): Promise<T> {
    const record = entity as Record<string, unknown>
    const id = record.id as string
    this.records.set(id, record)
    return record as T
  }

  async update(
    criteria: Record<string, unknown>,
    partialEntity: Record<string, unknown>
  ): Promise<{ affected?: number }> {
    const id = criteria.id as string
    const existing = this.records.get(id)

    if (!existing) {
      return { affected: 0 }
    }

    const updated = { ...existing, ...partialEntity }
    this.records.set(id, updated)
    return { affected: 1 }
  }

  async delete(
    criteria: Record<string, unknown>
  ): Promise<{ affected?: number }> {
    const id = criteria.id as string
    const existed = this.records.has(id)

    if (!existed) {
      return { affected: 0 }
    }

    this.records.delete(id)
    return { affected: 1 }
  }

  async insert(
    entities: Record<string, unknown>[]
  ): Promise<{ identifiers: Array<{ id: string }> }> {
    for (const entity of entities) {
      const id = entity.id as string
      this.records.set(id, entity)
    }
    return { identifiers: entities.map((e) => ({ id: e.id as string })) }
  }

  clear() {
    this.records.clear()
  }

  seed(records: Record<string, unknown>[]) {
    for (const record of records) {
      const id = record.id as string
      this.records.set(id, record)
    }
  }
}

describe('Integration: TypeORM Adapter', () => {
  let records: Map<string, Record<string, unknown>>
  let repository: MockRepository<TestRecord>
  let adapter: TypeORMAdapter<TestRecord>
  const config: AdapterConfig = {
    tableName: 'testRecords',
    primaryKey: 'id',
  }

  beforeEach(() => {
    records = new Map()
    repository = new MockRepository<TestRecord>(records)
    adapter = new TypeORMAdapter<TestRecord>(
      repository as unknown as Parameters<
        (typeof TypeORMAdapter<TestRecord>)['prototype']['constructor']
      >[0],
      config
    )

    repository.seed([
      {
        id: '1',
        firstName: 'John',
        lastName: 'Smith',
        email: 'john@example.com',
        dobYear: 1985,
      },
      {
        id: '2',
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane@example.com',
        dobYear: 1990,
      },
      {
        id: '3',
        firstName: 'Bob',
        lastName: 'Jones',
        email: 'bob@example.com',
        dobYear: 1985,
      },
      {
        id: '4',
        firstName: 'Alice',
        lastName: 'Brown',
        email: 'alice@example.com',
        dobYear: 1988,
      },
    ])
  })

  describe('works with entities', () => {
    it('finds records using entity where clause', async () => {
      const blockingKeys = new Map([['lastName', 'Smith']])

      const results = await adapter.findByBlockingKeys(blockingKeys)

      expect(results).toHaveLength(2)
      expect(results.every((r) => r.lastName === 'Smith')).toBe(true)
    })

    it('handles complex where conditions', async () => {
      const blockingKeys = new Map([
        ['lastName', 'Smith'],
        ['dobYear', 1985],
      ])

      const results = await adapter.findByBlockingKeys(blockingKeys)

      expect(results).toHaveLength(1)
      expect(results[0].firstName).toBe('John')
    })
  })

  describe('resolves contacts from database', () => {
    it('finds matching contacts by blocking keys', async () => {
      const blockingKeys = new Map([['dobYear', 1985]])

      const results = await adapter.findByBlockingKeys(blockingKeys)

      expect(results).toHaveLength(2)
      expect(results.every((r) => r.dobYear === 1985)).toBe(true)
    })

    it('returns empty array when no matches found', async () => {
      const blockingKeys = new Map([['lastName', 'Nonexistent']])

      const results = await adapter.findByBlockingKeys(blockingKeys)

      expect(results).toHaveLength(0)
    })
  })

  describe('batch processes efficiently', () => {
    it('batch inserts multiple records', async () => {
      const newRecords: TestRecord[] = [
        {
          id: '10',
          firstName: 'Test1',
          lastName: 'User',
          email: 'test1@example.com',
        },
        {
          id: '11',
          firstName: 'Test2',
          lastName: 'User',
          email: 'test2@example.com',
        },
        {
          id: '12',
          firstName: 'Test3',
          lastName: 'User',
          email: 'test3@example.com',
        },
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

    it('handles large batch inserts', async () => {
      const largeRecords: TestRecord[] = Array.from(
        { length: 100 },
        (_, i) => ({
          id: `batch-${i}`,
          firstName: `First${i}`,
          lastName: `Last${i}`,
          email: `user${i}@example.com`,
          dobYear: 1980 + (i % 40),
        })
      )

      const results = await adapter.batchInsert(largeRecords)

      expect(results).toHaveLength(100)
    })
  })

  describe('CRUD operations', () => {
    it('inserts using save()', async () => {
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

    it('updates using update()', async () => {
      const updated = await adapter.update('1', {
        email: 'newemail@example.com',
      })

      expect(updated.email).toBe('newemail@example.com')
      expect(updated.firstName).toBe('John')
    })

    it('deletes using delete()', async () => {
      await adapter.delete('1')

      const results = await adapter.findAll()
      expect(results).toHaveLength(3)
      expect(results.every((r) => r.id !== '1')).toBe(true)
    })

    it('counts records', async () => {
      const count = await adapter.count({ lastName: 'Smith' })
      expect(count).toBe(2)
    })

    it('finds records by IDs', async () => {
      const results = await adapter.findByIds(['1', '3'])

      expect(results).toHaveLength(2)
      expect(results.map((r) => r.id).sort()).toEqual(['1', '3'])
    })
  })

  describe('transactions', () => {
    it('uses EntityManager in transaction', async () => {
      const result = await adapter.transaction(async (txAdapter) => {
        await txAdapter.update('1', { email: 'updated@example.com' })
        await txAdapter.delete('2')
        return { success: true }
      })

      expect(result.success).toBe(true)

      const allRecords = await adapter.findAll()
      expect(allRecords).toHaveLength(3)

      const updated = await adapter.findByIds(['1'])
      expect(updated[0].email).toBe('updated@example.com')
    })

    it('rolls back on error', async () => {
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

  describe('error handling', () => {
    it('throws NotFoundError when updating non-existent record', async () => {
      await expect(
        adapter.update('999', { email: 'test@example.com' })
      ).rejects.toThrow('not found')
    })

    it('throws NotFoundError when deleting non-existent record', async () => {
      await expect(adapter.delete('999')).rejects.toThrow('not found')
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

    it('respects orderBy option ascending', async () => {
      const results = await adapter.findAll({
        orderBy: { field: 'firstName', direction: 'asc' },
      })

      expect(results[0].firstName).toBe('Alice')
      expect(results[results.length - 1].firstName).toBe('John')
    })

    it('respects orderBy option descending', async () => {
      const results = await adapter.findAll({
        orderBy: { field: 'firstName', direction: 'desc' },
      })

      expect(results[0].firstName).toBe('John')
      expect(results[results.length - 1].firstName).toBe('Alice')
    })

    it('respects fields option for projection', async () => {
      const results = await adapter.findAll({ fields: ['id', 'firstName'] })

      expect(results).toHaveLength(4)
      expect(results[0]).toHaveProperty('id')
      expect(results[0]).toHaveProperty('firstName')
    })

    it('combines multiple query options', async () => {
      const results = await adapter.findAll({
        limit: 2,
        offset: 1,
        orderBy: { field: 'firstName', direction: 'asc' },
      })

      expect(results).toHaveLength(2)
      expect(results[0].firstName).toBe('Bob')
    })
  })

  describe('filter criteria operators', () => {
    it('handles equality operator', async () => {
      const blockingKeys = new Map([['lastName', 'Smith']])
      const results = await adapter.findByBlockingKeys(blockingKeys)

      expect(results).toHaveLength(2)
      expect(results.every((r) => r.lastName === 'Smith')).toBe(true)
    })

    it('handles IN operator', async () => {
      const results = await adapter.findByIds(['1', '3'])

      expect(results).toHaveLength(2)
      expect(results.map((r) => r.id).sort()).toEqual(['1', '3'])
    })
  })
})
