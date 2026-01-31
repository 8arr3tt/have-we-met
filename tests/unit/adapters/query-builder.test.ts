import { describe, it, expect } from 'vitest'
import { QueryBuilder } from '../../../src/adapters/query-builder'
import type { FilterCriteria } from '../../../src/adapters/types'

describe('QueryBuilder', () => {
  describe('buildBlockingQuery', () => {
    it('converts blocking keys to filter criteria', () => {
      const builder = new QueryBuilder()
      const blockingKeys = new Map([
        ['lastName', 'Smith'],
        ['dobYear', '1985'],
      ])

      const filter = builder.buildBlockingQuery(blockingKeys)

      expect(filter).toEqual({
        lastName: { operator: 'eq', value: 'Smith' },
        dobYear: { operator: 'eq', value: '1985' },
      })
    })

    it('handles multiple blocking fields', () => {
      const builder = new QueryBuilder()
      const blockingKeys = new Map([
        ['field1', 'value1'],
        ['field2', 'value2'],
        ['field3', 'value3'],
      ])

      const filter = builder.buildBlockingQuery(blockingKeys)

      expect(filter).toEqual({
        field1: { operator: 'eq', value: 'value1' },
        field2: { operator: 'eq', value: 'value2' },
        field3: { operator: 'eq', value: 'value3' },
      })
    })

    it('handles null blocking values', () => {
      const builder = new QueryBuilder()
      const blockingKeys = new Map([
        ['lastName', 'Smith'],
        ['middleName', null],
        ['firstName', 'John'],
      ])

      const filter = builder.buildBlockingQuery(blockingKeys)

      expect(filter).toEqual({
        lastName: { operator: 'eq', value: 'Smith' },
        firstName: { operator: 'eq', value: 'John' },
      })
    })

    it('handles undefined blocking values', () => {
      const builder = new QueryBuilder()
      const blockingKeys = new Map([
        ['lastName', 'Smith'],
        ['middleName', undefined],
        ['firstName', 'John'],
      ])

      const filter = builder.buildBlockingQuery(blockingKeys)

      expect(filter).toEqual({
        lastName: { operator: 'eq', value: 'Smith' },
        firstName: { operator: 'eq', value: 'John' },
      })
    })

    it('handles array values with IN operator', () => {
      const builder = new QueryBuilder()
      const blockingKeys = new Map([['status', ['active', 'pending']]])

      const filter = builder.buildBlockingQuery(blockingKeys)

      expect(filter).toEqual({
        status: { operator: 'in', value: ['active', 'pending'] },
      })
    })

    it('handles numeric values', () => {
      const builder = new QueryBuilder()
      const blockingKeys = new Map([
        ['age', 30],
        ['year', 1985],
      ])

      const filter = builder.buildBlockingQuery(blockingKeys)

      expect(filter).toEqual({
        age: { operator: 'eq', value: 30 },
        year: { operator: 'eq', value: 1985 },
      })
    })

    it('handles empty blocking keys', () => {
      const builder = new QueryBuilder()
      const blockingKeys = new Map()

      const filter = builder.buildBlockingQuery(blockingKeys)

      expect(filter).toEqual({})
    })
  })

  describe('buildWhereClause', () => {
    it('handles equality operator', () => {
      const builder = new QueryBuilder()
      const filter: FilterCriteria = {
        lastName: { operator: 'eq', value: 'Smith' },
      }

      const whereClause = builder.buildWhereClause(filter)

      expect(whereClause.get('lastName')).toEqual({
        operator: 'eq',
        value: 'Smith',
      })
    })

    it('handles IN operator for arrays', () => {
      const builder = new QueryBuilder()
      const filter: FilterCriteria = {
        status: { operator: 'in', value: ['active', 'pending'] },
      }

      const whereClause = builder.buildWhereClause(filter)

      expect(whereClause.get('status')).toEqual({
        operator: 'in',
        value: ['active', 'pending'],
      })
    })

    it('handles LIKE operator for fuzzy matches', () => {
      const builder = new QueryBuilder()
      const filter: FilterCriteria = {
        email: { operator: 'like', value: '%@example.com' },
      }

      const whereClause = builder.buildWhereClause(filter)

      expect(whereClause.get('email')).toEqual({
        operator: 'like',
        value: '%@example.com',
      })
    })

    it('combines multiple conditions', () => {
      const builder = new QueryBuilder()
      const filter: FilterCriteria = {
        lastName: { operator: 'eq', value: 'Smith' },
        age: { operator: 'gt', value: 18 },
        status: { operator: 'in', value: ['active', 'pending'] },
      }

      const whereClause = builder.buildWhereClause(filter)

      expect(whereClause.size).toBe(3)
      expect(whereClause.get('lastName')).toEqual({
        operator: 'eq',
        value: 'Smith',
      })
      expect(whereClause.get('age')).toEqual({ operator: 'gt', value: 18 })
      expect(whereClause.get('status')).toEqual({
        operator: 'in',
        value: ['active', 'pending'],
      })
    })

    it('handles simple value without operator', () => {
      const builder = new QueryBuilder()
      const filter: FilterCriteria = {
        status: 'active',
      }

      const whereClause = builder.buildWhereClause(filter)

      expect(whereClause.get('status')).toEqual({
        operator: 'eq',
        value: 'active',
      })
    })

    it('handles null and undefined values', () => {
      const builder = new QueryBuilder()
      const filter: FilterCriteria = {
        field1: null,
        field2: undefined,
        field3: { operator: 'eq', value: 'test' },
      }

      const whereClause = builder.buildWhereClause(filter)

      expect(whereClause.size).toBe(1)
      expect(whereClause.get('field3')).toEqual({
        operator: 'eq',
        value: 'test',
      })
    })

    it('handles all comparison operators', () => {
      const builder = new QueryBuilder()
      const filter: FilterCriteria = {
        field1: { operator: 'eq', value: 10 },
        field2: { operator: 'ne', value: 20 },
        field3: { operator: 'gt', value: 30 },
        field4: { operator: 'gte', value: 40 },
        field5: { operator: 'lt', value: 50 },
        field6: { operator: 'lte', value: 60 },
      }

      const whereClause = builder.buildWhereClause(filter)

      expect(whereClause.size).toBe(6)
      expect(whereClause.get('field1')?.operator).toBe('eq')
      expect(whereClause.get('field2')?.operator).toBe('ne')
      expect(whereClause.get('field3')?.operator).toBe('gt')
      expect(whereClause.get('field4')?.operator).toBe('gte')
      expect(whereClause.get('field5')?.operator).toBe('lt')
      expect(whereClause.get('field6')?.operator).toBe('lte')
    })
  })

  describe('buildOrderByClause', () => {
    it('builds order by clause for ascending order', () => {
      const builder = new QueryBuilder()
      const orderBy = { field: 'lastName', direction: 'asc' as const }

      const result = builder.buildOrderByClause(orderBy)

      expect(result).toEqual({ field: 'lastName', direction: 'asc' })
    })

    it('builds order by clause for descending order', () => {
      const builder = new QueryBuilder()
      const orderBy = { field: 'createdAt', direction: 'desc' as const }

      const result = builder.buildOrderByClause(orderBy)

      expect(result).toEqual({ field: 'createdAt', direction: 'desc' })
    })
  })

  describe('buildLimitOffsetClause', () => {
    it('builds limit and offset clause', () => {
      const builder = new QueryBuilder()
      const options = { limit: 100, offset: 50 }

      const result = builder.buildLimitOffsetClause(options)

      expect(result).toEqual({ limit: 100, offset: 50 })
    })

    it('handles limit only', () => {
      const builder = new QueryBuilder()
      const options = { limit: 25 }

      const result = builder.buildLimitOffsetClause(options)

      expect(result).toEqual({ limit: 25, offset: undefined })
    })

    it('handles offset only', () => {
      const builder = new QueryBuilder()
      const options = { offset: 10 }

      const result = builder.buildLimitOffsetClause(options)

      expect(result).toEqual({ limit: undefined, offset: 10 })
    })

    it('handles empty options', () => {
      const builder = new QueryBuilder()
      const options = {}

      const result = builder.buildLimitOffsetClause(options)

      expect(result).toEqual({ limit: undefined, offset: undefined })
    })
  })

  describe('buildQuery', () => {
    it('builds complete query with all components', () => {
      const builder = new QueryBuilder()
      const filter: FilterCriteria = {
        lastName: { operator: 'eq', value: 'Smith' },
        age: { operator: 'gt', value: 18 },
      }
      const options = {
        limit: 10,
        offset: 5,
        orderBy: { field: 'firstName', direction: 'asc' as const },
        fields: ['firstName', 'lastName', 'email'],
      }

      const query = builder.buildQuery(filter, options)

      expect(query.where.size).toBe(2)
      expect(query.orderBy).toEqual({ field: 'firstName', direction: 'asc' })
      expect(query.limit).toBe(10)
      expect(query.offset).toBe(5)
      expect(query.fields).toEqual(['firstName', 'lastName', 'email'])
    })

    it('builds query without options', () => {
      const builder = new QueryBuilder()
      const filter: FilterCriteria = {
        status: 'active',
      }

      const query = builder.buildQuery(filter)

      expect(query.where.size).toBe(1)
      expect(query.orderBy).toBeUndefined()
      expect(query.limit).toBeUndefined()
      expect(query.offset).toBeUndefined()
      expect(query.fields).toBeUndefined()
    })

    it('builds query with partial options', () => {
      const builder = new QueryBuilder()
      const filter: FilterCriteria = {
        status: 'active',
      }
      const options = { limit: 50 }

      const query = builder.buildQuery(filter, options)

      expect(query.where.size).toBe(1)
      expect(query.limit).toBe(50)
      expect(query.orderBy).toBeUndefined()
      expect(query.offset).toBeUndefined()
    })
  })

  describe('mergeFilters', () => {
    it('merges multiple filters into one', () => {
      const builder = new QueryBuilder()
      const filter1: FilterCriteria = {
        lastName: { operator: 'eq', value: 'Smith' },
      }
      const filter2: FilterCriteria = {
        age: { operator: 'gt', value: 18 },
      }

      const merged = builder.mergeFilters([filter1, filter2])

      expect(merged).toEqual({
        lastName: { operator: 'eq', value: 'Smith' },
        age: { operator: 'gt', value: 18 },
      })
    })

    it('handles overlapping fields by using last value', () => {
      const builder = new QueryBuilder()
      const filter1: FilterCriteria = {
        status: { operator: 'eq', value: 'active' },
      }
      const filter2: FilterCriteria = {
        status: { operator: 'eq', value: 'pending' },
      }

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const merged = builder.mergeFilters([filter1, filter2])

      expect(merged).toEqual({
        status: { operator: 'eq', value: 'pending' },
      })
      expect(consoleSpy).toHaveBeenCalledWith(
        "QueryBuilder: Field 'status' specified multiple times. Using last value."
      )

      consoleSpy.mockRestore()
    })

    it('handles empty filter array', () => {
      const builder = new QueryBuilder()

      const merged = builder.mergeFilters([])

      expect(merged).toEqual({})
    })

    it('handles single filter', () => {
      const builder = new QueryBuilder()
      const filter: FilterCriteria = {
        status: 'active',
      }

      const merged = builder.mergeFilters([filter])

      expect(merged).toEqual({ status: 'active' })
    })

    it('merges three or more filters', () => {
      const builder = new QueryBuilder()
      const filter1: FilterCriteria = { field1: 'value1' }
      const filter2: FilterCriteria = { field2: 'value2' }
      const filter3: FilterCriteria = { field3: 'value3' }

      const merged = builder.mergeFilters([filter1, filter2, filter3])

      expect(merged).toEqual({
        field1: 'value1',
        field2: 'value2',
        field3: 'value3',
      })
    })
  })
})
