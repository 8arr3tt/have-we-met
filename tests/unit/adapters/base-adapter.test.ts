import { describe, it, expect, beforeEach } from 'vitest'
import { BaseAdapter } from '../../../src/adapters/base-adapter'
import { ValidationError } from '../../../src/adapters/adapter-error'
import type {
  DatabaseAdapter,
  AdapterConfig,
  QueryOptions,
  FilterCriteria,
} from '../../../src/adapters/types'

class TestAdapter<T extends Record<string, unknown>> extends BaseAdapter<T> {
  async findByBlockingKeys(
    _blockingKeys: Map<string, unknown>,
    _options?: QueryOptions
  ): Promise<T[]> {
    return []
  }

  async findByIds(_ids: string[]): Promise<T[]> {
    return []
  }

  async findAll(_options?: QueryOptions): Promise<T[]> {
    return []
  }

  async count(_filter?: FilterCriteria): Promise<number> {
    return 0
  }

  async insert(record: T): Promise<T> {
    return record
  }

  async update(_id: string, updates: Partial<T>): Promise<T> {
    return updates as T
  }

  async delete(_id: string): Promise<void> {
    return
  }

  async transaction<R>(
    callback: (adapter: DatabaseAdapter<T>) => Promise<R>
  ): Promise<R> {
    return callback(this)
  }

  async batchInsert(records: T[]): Promise<T[]> {
    return records
  }

  async batchUpdate(
    updates: Array<{ id: string; updates: Partial<T> }>
  ): Promise<T[]> {
    return updates.map((u) => u.updates as T)
  }

  public testMapFieldToColumn(fieldName: string): string {
    return this.mapFieldToColumn(fieldName)
  }

  public testMapColumnToField(columnName: string): string {
    return this.mapColumnToField(columnName)
  }

  public testMapRecordToDatabase(record: T): Record<string, unknown> {
    return this.mapRecordToDatabase(record)
  }

  public testMapRecordFromDatabase(record: Record<string, unknown>): T {
    return this.mapRecordFromDatabase(record)
  }

  public testMapBlockingKeysToFilter(
    blockingKeys: Map<string, unknown>
  ): FilterCriteria {
    return this.mapBlockingKeysToFilter(blockingKeys)
  }

  public testNormalizeQueryOptions(
    options?: QueryOptions
  ): Omit<Required<QueryOptions>, 'orderBy'> & Pick<QueryOptions, 'orderBy'> {
    return this.normalizeQueryOptions(options)
  }

  public testValidateIds(ids: string[]): void {
    return this.validateIds(ids)
  }

  public testValidateRecords(records: T[]): void {
    return this.validateRecords(records)
  }
}

describe('BaseAdapter', () => {
  describe('constructor and configuration', () => {
    it('validates adapter config on construction', () => {
      const config: AdapterConfig = { tableName: 'users' }
      const adapter = new TestAdapter(config)
      expect(adapter).toBeDefined()
    })

    it('throws on missing tableName', () => {
      expect(() => {
        new TestAdapter({} as AdapterConfig)
      }).toThrow(ValidationError)
    })

    it('throws on empty tableName', () => {
      expect(() => {
        new TestAdapter({ tableName: '   ' })
      }).toThrow(ValidationError)
    })

    it('throws on invalid tableName type', () => {
      expect(() => {
        new TestAdapter({ tableName: 123 as unknown as string })
      }).toThrow(ValidationError)
    })

    it('throws on invalid primaryKey type', () => {
      expect(() => {
        new TestAdapter({
          tableName: 'users',
          primaryKey: 123 as unknown as string,
        })
      }).toThrow(ValidationError)
    })

    it('throws on invalid fieldMapping type', () => {
      expect(() => {
        new TestAdapter({
          tableName: 'users',
          fieldMapping: 'invalid' as unknown as Record<string, string>,
        })
      }).toThrow(ValidationError)
    })

    it('throws on invalid usePreparedStatements type', () => {
      expect(() => {
        new TestAdapter({
          tableName: 'users',
          usePreparedStatements: 'yes' as unknown as boolean,
        })
      }).toThrow(ValidationError)
    })

    it('sets default values for optional config fields', () => {
      const config: AdapterConfig = { tableName: 'users' }
      const adapter = new TestAdapter(config)
      expect(adapter['config'].primaryKey).toBe('id')
      expect(adapter['config'].fieldMapping).toEqual({})
      expect(adapter['config'].usePreparedStatements).toBe(true)
      expect(adapter['config'].poolConfig).toEqual({})
    })

    it('preserves custom config values', () => {
      const config: AdapterConfig = {
        tableName: 'customers',
        primaryKey: 'customer_id',
        fieldMapping: { firstName: 'first_name' },
        usePreparedStatements: false,
        poolConfig: { min: 2, max: 10 },
      }
      const adapter = new TestAdapter(config)
      expect(adapter['config'].tableName).toBe('customers')
      expect(adapter['config'].primaryKey).toBe('customer_id')
      expect(adapter['config'].fieldMapping).toEqual({
        firstName: 'first_name',
      })
      expect(adapter['config'].usePreparedStatements).toBe(false)
      expect(adapter['config'].poolConfig).toEqual({ min: 2, max: 10 })
    })
  })

  describe('field mapping', () => {
    let adapter: TestAdapter<Record<string, unknown>>

    beforeEach(() => {
      const config: AdapterConfig = {
        tableName: 'users',
        fieldMapping: {
          firstName: 'first_name',
          lastName: 'last_name',
          dateOfBirth: 'dob',
        },
      }
      adapter = new TestAdapter(config)
    })

    it('maps schema fields to database columns', () => {
      expect(adapter.testMapFieldToColumn('firstName')).toBe('first_name')
      expect(adapter.testMapFieldToColumn('lastName')).toBe('last_name')
      expect(adapter.testMapFieldToColumn('dateOfBirth')).toBe('dob')
    })

    it('returns field name unchanged if not in mapping', () => {
      expect(adapter.testMapFieldToColumn('email')).toBe('email')
      expect(adapter.testMapFieldToColumn('phone')).toBe('phone')
    })

    it('maps database columns to schema fields', () => {
      expect(adapter.testMapColumnToField('first_name')).toBe('firstName')
      expect(adapter.testMapColumnToField('last_name')).toBe('lastName')
      expect(adapter.testMapColumnToField('dob')).toBe('dateOfBirth')
    })

    it('returns column name unchanged if not in reverse mapping', () => {
      expect(adapter.testMapColumnToField('email')).toBe('email')
      expect(adapter.testMapColumnToField('phone')).toBe('phone')
    })

    it('maps record to database format', () => {
      const record = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
      }
      const mapped = adapter.testMapRecordToDatabase(record)
      expect(mapped).toEqual({
        first_name: 'John',
        last_name: 'Doe',
        email: 'john@example.com',
      })
    })

    it('maps record from database format', () => {
      const record = {
        first_name: 'John',
        last_name: 'Doe',
        email: 'john@example.com',
      }
      const mapped = adapter.testMapRecordFromDatabase(record)
      expect(mapped).toEqual({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
      })
    })
  })

  describe('blocking keys to filter conversion', () => {
    it('converts blocking keys to filter criteria', () => {
      const config: AdapterConfig = { tableName: 'users' }
      const adapter = new TestAdapter(config)

      const blockingKeys = new Map([
        ['lastName', 'Smith'],
        ['dobYear', '1985'],
      ])
      const filter = adapter.testMapBlockingKeysToFilter(blockingKeys)
      expect(filter).toEqual({
        lastName: 'Smith',
        dobYear: '1985',
      })
    })

    it('maps field names when converting blocking keys', () => {
      const config: AdapterConfig = {
        tableName: 'users',
        fieldMapping: { lastName: 'last_name', dobYear: 'dob_year' },
      }
      const adapter = new TestAdapter(config)

      const blockingKeys = new Map([
        ['lastName', 'Smith'],
        ['dobYear', '1985'],
      ])
      const filter = adapter.testMapBlockingKeysToFilter(blockingKeys)
      expect(filter).toEqual({
        last_name: 'Smith',
        dob_year: '1985',
      })
    })

    it('handles empty blocking keys', () => {
      const config: AdapterConfig = { tableName: 'users' }
      const adapter = new TestAdapter(config)

      const blockingKeys = new Map()
      const filter = adapter.testMapBlockingKeysToFilter(blockingKeys)
      expect(filter).toEqual({})
    })
  })

  describe('query options normalization', () => {
    let adapter: TestAdapter<Record<string, unknown>>

    beforeEach(() => {
      const config: AdapterConfig = { tableName: 'users' }
      adapter = new TestAdapter(config)
    })

    it('applies default values for undefined options', () => {
      const normalized = adapter.testNormalizeQueryOptions()
      expect(normalized.limit).toBe(1000)
      expect(normalized.offset).toBe(0)
      expect(normalized.orderBy).toBeUndefined()
      expect(normalized.fields).toEqual([])
    })

    it('preserves provided values', () => {
      const options: QueryOptions = {
        limit: 100,
        offset: 50,
        orderBy: { field: 'createdAt', direction: 'desc' },
        fields: ['id', 'name', 'email'],
      }
      const normalized = adapter.testNormalizeQueryOptions(options)
      expect(normalized).toEqual(options)
    })

    it('applies defaults for partial options', () => {
      const options: QueryOptions = { limit: 50 }
      const normalized = adapter.testNormalizeQueryOptions(options)
      expect(normalized.limit).toBe(50)
      expect(normalized.offset).toBe(0)
      expect(normalized.orderBy).toBeUndefined()
      expect(normalized.fields).toEqual([])
    })
  })

  describe('validation', () => {
    let adapter: TestAdapter<Record<string, unknown>>

    beforeEach(() => {
      const config: AdapterConfig = { tableName: 'users' }
      adapter = new TestAdapter(config)
    })

    describe('validateIds', () => {
      it('accepts valid array of string IDs', () => {
        expect(() => {
          adapter.testValidateIds(['id1', 'id2', 'id3'])
        }).not.toThrow()
      })

      it('throws on non-array input', () => {
        expect(() => {
          adapter.testValidateIds('not-an-array' as unknown as string[])
        }).toThrow(ValidationError)
      })

      it('throws on empty array', () => {
        expect(() => {
          adapter.testValidateIds([])
        }).toThrow(ValidationError)
      })

      it('throws on array with non-string elements', () => {
        expect(() => {
          adapter.testValidateIds(['id1', 123, 'id3'] as unknown as string[])
        }).toThrow(ValidationError)
      })
    })

    describe('validateRecords', () => {
      it('accepts valid array of record objects', () => {
        expect(() => {
          adapter.testValidateRecords([
            { id: '1', name: 'John' },
            { id: '2', name: 'Jane' },
          ])
        }).not.toThrow()
      })

      it('throws on non-array input', () => {
        expect(() => {
          adapter.testValidateRecords(
            'not-an-array' as unknown as Record<string, unknown>[]
          )
        }).toThrow(ValidationError)
      })

      it('throws on empty array', () => {
        expect(() => {
          adapter.testValidateRecords([])
        }).toThrow(ValidationError)
      })

      it('throws on array with non-object elements', () => {
        expect(() => {
          adapter.testValidateRecords([
            { id: '1', name: 'John' },
            'not-an-object',
          ] as unknown as Record<string, unknown>[])
        }).toThrow(ValidationError)
      })

      it('throws on array with null elements', () => {
        expect(() => {
          adapter.testValidateRecords([
            { id: '1', name: 'John' },
            null,
          ] as unknown as Record<string, unknown>[])
        }).toThrow(ValidationError)
      })
    })
  })
})
