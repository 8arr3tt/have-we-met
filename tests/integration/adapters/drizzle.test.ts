import { describe, it, expect, beforeEach } from 'vitest'
import { DrizzleAdapter } from '../../../src/adapters/drizzle/drizzle-adapter'
import type { AdapterConfig } from '../../../src/adapters/types'

type TestRecord = {
  id: string
  firstName: string
  lastName: string
  email: string
  dobYear?: number
}

class MockDrizzleOperators {
  eq = (column: { name: string }, value: unknown) => ({
    type: 'eq',
    column: column.name,
    value,
  })
  ne = (column: { name: string }, value: unknown) => ({
    type: 'ne',
    column: column.name,
    value,
  })
  gt = (column: { name: string }, value: unknown) => ({
    type: 'gt',
    column: column.name,
    value,
  })
  gte = (column: { name: string }, value: unknown) => ({
    type: 'gte',
    column: column.name,
    value,
  })
  lt = (column: { name: string }, value: unknown) => ({
    type: 'lt',
    column: column.name,
    value,
  })
  lte = (column: { name: string }, value: unknown) => ({
    type: 'lte',
    column: column.name,
    value,
  })
  inArray = (column: { name: string }, values: unknown[]) => ({
    type: 'in',
    column: column.name,
    values,
  })
  like = (column: { name: string }, pattern: unknown) => ({
    type: 'like',
    column: column.name,
    pattern,
  })
  and = (...conditions: unknown[]) => ({ type: 'and', conditions })
  asc = (column: { name: string }) => ({
    column: column.name,
    direction: 'asc',
  })
  desc = (column: { name: string }) => ({
    column: column.name,
    direction: 'desc',
  })
  count = () => ({ type: 'count' })
}

class MockDrizzleQuery {
  private records: Record<string, unknown>[]
  private whereCondition?: unknown
  private limitValue?: number
  private offsetValue?: number
  private orderByValue?: { column: string; direction: string }
  private selectFields?: Record<string, unknown>

  constructor(
    records: Record<string, unknown>[],
    selectFields?: Record<string, unknown>
  ) {
    this.records = records
    this.selectFields = selectFields
  }

  where(condition: unknown): MockDrizzleQuery {
    this.whereCondition = condition
    return this
  }

  limit(count: number): MockDrizzleQuery {
    this.limitValue = count
    return this
  }

  offset(count: number): MockDrizzleQuery {
    this.offsetValue = count
    return this
  }

  orderBy(
    ...args: Array<{ column: string; direction: string }>
  ): MockDrizzleQuery {
    if (args.length > 0) {
      this.orderByValue = args[0]
    }
    return this
  }

  private matchesCondition(
    record: Record<string, unknown>,
    condition: unknown
  ): boolean {
    if (!condition) return true

    const cond = condition as {
      type: string
      column?: string
      value?: unknown
      values?: unknown[]
      pattern?: unknown
      conditions?: unknown[]
    }

    if (cond.type === 'and' && cond.conditions) {
      return cond.conditions.every((c) => this.matchesCondition(record, c))
    }

    if (!cond.column) return true

    const recordValue = record[cond.column]

    switch (cond.type) {
      case 'eq':
        return recordValue === cond.value
      case 'ne':
        return recordValue !== cond.value
      case 'gt':
        return recordValue > cond.value
      case 'gte':
        return recordValue >= cond.value
      case 'lt':
        return recordValue < cond.value
      case 'lte':
        return recordValue <= cond.value
      case 'in':
        return cond.values?.includes(recordValue) ?? false
      case 'like':
        return String(recordValue).includes(String(cond.pattern))
      default:
        return true
    }
  }

  then<TResult1 = Record<string, unknown>[], TResult2 = never>(
    onfulfilled?:
      | ((value: Record<string, unknown>[]) => TResult1 | PromiseLike<TResult1>)
      | null
      | undefined,
    onrejected?:
      | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
      | null
      | undefined
  ): Promise<TResult1 | TResult2> {
    try {
      let results = [...this.records]

      if (this.whereCondition) {
        results = results.filter((record) =>
          this.matchesCondition(record, this.whereCondition)
        )
      }

      if (this.orderByValue) {
        results.sort((a, b) => {
          const aVal = a[this.orderByValue!.column] ?? ''
          const bVal = b[this.orderByValue!.column] ?? ''
          if (aVal < bVal)
            return this.orderByValue!.direction === 'asc' ? -1 : 1
          if (aVal > bVal)
            return this.orderByValue!.direction === 'asc' ? 1 : -1
          return 0
        })
      }

      if (this.offsetValue) {
        results = results.slice(this.offsetValue)
      }

      if (this.limitValue) {
        results = results.slice(0, this.limitValue)
      }

      if (this.selectFields && 'count' in this.selectFields) {
        const countResult = [{ count: results.length }]
        return Promise.resolve(countResult).then(
          onfulfilled,
          onrejected
        ) as Promise<TResult1 | TResult2>
      }

      return Promise.resolve(results).then(onfulfilled, onrejected) as Promise<
        TResult1 | TResult2
      >
    } catch (error) {
      return Promise.reject(error).then(onfulfilled, onrejected) as Promise<
        TResult1 | TResult2
      >
    }
  }
}

class MockDrizzleDatabase {
  private records: Map<string, Record<string, unknown>> = new Map()

  select(fields?: Record<string, unknown>) {
    return {
      from: () =>
        new MockDrizzleQuery(Array.from(this.records.values()), fields),
    }
  }

  insert() {
    return {
      values: (values: unknown) => ({
        returning: async () => {
          const valuesArray = Array.isArray(values) ? values : [values]
          const results: Record<string, unknown>[] = []

          for (const value of valuesArray) {
            const record = value as Record<string, unknown>
            const id = record.id as string
            this.records.set(id, record)
            results.push(record)
          }

          return results
        },
      }),
    }
  }

  update() {
    return {
      set: (values: Record<string, unknown>) => ({
        where: (condition: {
          type: string
          column: string
          value: unknown
        }) => ({
          returning: async () => {
            if (condition.type === 'eq') {
              const id = condition.value as string
              const existing = this.records.get(id)
              if (!existing) {
                return []
              }
              const updated = { ...existing, ...values }
              this.records.set(id, updated)
              return [updated]
            }
            return []
          },
        }),
      }),
    }
  }

  delete() {
    return {
      where: async (condition: {
        type: string
        column: string
        value: unknown
      }) => {
        if (condition.type === 'eq') {
          const id = condition.value as string
          this.records.delete(id)
        }
      },
    }
  }

  async transaction<R>(
    callback: (tx: MockDrizzleDatabase) => Promise<R>
  ): Promise<R> {
    const txDb = new MockDrizzleDatabase()
    txDb.records = new Map(this.records)

    try {
      const result = await callback(txDb)
      this.records = txDb.records
      return result
    } catch (error) {
      throw error
    }
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

const mockTable = {
  id: { name: 'id' },
  firstName: { name: 'firstName' },
  lastName: { name: 'lastName' },
  email: { name: 'email' },
  dobYear: { name: 'dobYear' },
}

describe('Integration: Drizzle Adapter', () => {
  let db: MockDrizzleDatabase
  let adapter: DrizzleAdapter<TestRecord>
  let operators: MockDrizzleOperators
  const config: AdapterConfig = {
    tableName: 'testRecords',
    primaryKey: 'id',
  }

  beforeEach(() => {
    db = new MockDrizzleDatabase()
    operators = new MockDrizzleOperators()
    adapter = new DrizzleAdapter<TestRecord>(
      db as unknown as Parameters<
        (typeof DrizzleAdapter<TestRecord>)['prototype']['constructor']
      >[0],
      mockTable as unknown as Parameters<
        (typeof DrizzleAdapter<TestRecord>)['prototype']['constructor']
      >[1],
      config,
      operators as unknown as Parameters<
        (typeof DrizzleAdapter<TestRecord>)['prototype']['constructor']
      >[3]
    )

    db.seed([
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

  describe('works with PostgreSQL-style queries', () => {
    it('finds records by blocking keys', async () => {
      const blockingKeys = new Map([
        ['lastName', 'Smith'],
        ['dobYear', 1985],
      ])

      const results = await adapter.findByBlockingKeys(blockingKeys)

      expect(results).toHaveLength(1)
      expect(results[0].firstName).toBe('John')
    })

    it('handles complex WHERE conditions', async () => {
      const blockingKeys = new Map([['lastName', 'Smith']])

      const results = await adapter.findByBlockingKeys(blockingKeys)

      expect(results).toHaveLength(2)
      expect(results.every((r) => r.lastName === 'Smith')).toBe(true)
    })
  })

  describe('CRUD operations', () => {
    it('inserts a record', async () => {
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

    it('updates a record', async () => {
      const updated = await adapter.update('1', {
        email: 'newemail@example.com',
      })

      expect(updated.email).toBe('newemail@example.com')
      expect(updated.firstName).toBe('John')
    })

    it('deletes a record', async () => {
      await adapter.delete('1')

      const records = await adapter.findAll()
      expect(records).toHaveLength(3)
      expect(records.every((r) => r.id !== '1')).toBe(true)
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
    it('commits on success', async () => {
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

  describe('batch operations', () => {
    it('batch inserts efficiently', async () => {
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

    it('batch updates efficiently', async () => {
      const updates = [
        { id: '1', updates: { email: 'john.new@example.com' } },
        { id: '2', updates: { email: 'jane.new@example.com' } },
      ]

      const results = await adapter.batchUpdate(updates)

      expect(results).toHaveLength(2)
      expect(results[0].email).toBe('john.new@example.com')
      expect(results[1].email).toBe('jane.new@example.com')
    })
  })

  describe('resolves patients from database', () => {
    it('finds matching patients using blocking keys', async () => {
      const blockingKeys = new Map([['dobYear', 1985]])

      const results = await adapter.findByBlockingKeys(blockingKeys)

      expect(results).toHaveLength(2)
      expect(results.every((r) => r.dobYear === 1985)).toBe(true)
    })

    it('handles pagination for large result sets', async () => {
      const page1 = await adapter.findAll({ limit: 2, offset: 0 })
      const page2 = await adapter.findAll({ limit: 2, offset: 2 })

      expect(page1).toHaveLength(2)
      expect(page2).toHaveLength(2)
      expect(page1[0].id).not.toBe(page2[0].id)
    })
  })

  describe('batch processes efficiently', () => {
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

    it('handles ordering by different fields', async () => {
      const results = await adapter.findAll({
        orderBy: { field: 'firstName', direction: 'asc' },
      })

      expect(results[0].firstName).toBe('Alice')
      expect(results[results.length - 1].firstName).toBe('John')
    })

    it('handles descending order', async () => {
      const results = await adapter.findAll({
        orderBy: { field: 'firstName', direction: 'desc' },
      })

      expect(results[0].firstName).toBe('John')
      expect(results[results.length - 1].firstName).toBe('Alice')
    })
  })

  describe('error handling', () => {
    it('throws NotFoundError when updating non-existent record', async () => {
      await expect(
        adapter.update('999', { email: 'test@example.com' })
      ).rejects.toThrow('not found')
    })

    it('throws QueryError on invalid column name', async () => {
      const badConfig: AdapterConfig = {
        tableName: 'testRecords',
        primaryKey: 'id',
        fieldMapping: { invalidField: 'nonexistent' },
      }

      const badAdapter = new DrizzleAdapter<TestRecord>(
        db as unknown as Parameters<
          (typeof DrizzleAdapter<TestRecord>)['prototype']['constructor']
        >[0],
        mockTable as unknown as Parameters<
          (typeof DrizzleAdapter<TestRecord>)['prototype']['constructor']
        >[1],
        badConfig,
        operators as unknown as Parameters<
          (typeof DrizzleAdapter<TestRecord>)['prototype']['constructor']
        >[3]
      )

      await expect(
        badAdapter.findByBlockingKeys(new Map([['invalidField', 'test']]))
      ).rejects.toThrow()
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

    it('combines limit and offset', async () => {
      const results = await adapter.findAll({ limit: 1, offset: 1 })
      expect(results).toHaveLength(1)
      expect(results[0].id).toBe('2')
    })
  })
})
