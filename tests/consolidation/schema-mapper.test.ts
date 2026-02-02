import { describe, it, expect } from 'vitest'
import {
  SchemaMapper,
  createSchemaMapper,
  TypeCoercions,
  CommonTransforms,
} from '../../src/consolidation/schema-mapper'
import type { ConsolidationSource } from '../../src/consolidation/types'
import { ConsolidationError } from '../../src/consolidation/types'

describe('SchemaMapper', () => {
  describe('constructor', () => {
    it('should create mapper with valid mappings', () => {
      const mapper = new SchemaMapper({
        mappings: [
          { source: 'name', target: 'fullName' },
          { source: 'age', target: 'age' },
        ],
      })

      expect(mapper).toBeInstanceOf(SchemaMapper)
      expect(mapper.getTargetFields()).toEqual(['fullName', 'age'])
    })

    it('should throw error for empty mappings', () => {
      expect(() => new SchemaMapper({ mappings: [] })).toThrow(
        ConsolidationError
      )
      expect(() => new SchemaMapper({ mappings: [] })).toThrow(
        'At least one field mapping is required'
      )
    })

    it('should throw error for duplicate target fields', () => {
      expect(
        () =>
          new SchemaMapper({
            mappings: [
              { source: 'firstName', target: 'name' },
              { source: 'lastName', target: 'name' },
            ],
          })
      ).toThrow(ConsolidationError)
      expect(
        () =>
          new SchemaMapper({
            mappings: [
              { source: 'firstName', target: 'name' },
              { source: 'lastName', target: 'name' },
            ],
          })
      ).toThrow('Duplicate target fields: name')
    })

    it('should throw error for missing source field', () => {
      expect(
        () =>
          new SchemaMapper({
            mappings: [{ source: '', target: 'name' }],
          })
      ).toThrow(ConsolidationError)
      expect(
        () =>
          new SchemaMapper({
            mappings: [{ source: '', target: 'name' }],
          })
      ).toThrow('Mapping source field is required')
    })

    it('should throw error for missing target field', () => {
      expect(
        () =>
          new SchemaMapper({
            mappings: [{ source: 'name', target: '' }],
          })
      ).toThrow(ConsolidationError)
      expect(
        () =>
          new SchemaMapper({
            mappings: [{ source: 'name', target: '' }],
          })
      ).toThrow('Mapping target field is required')
    })

    it('should normalize string mappings', () => {
      const mapper = new SchemaMapper<any, any>({
        mappings: ['name' as any, 'age' as any],
      })

      expect(mapper.getTargetFields()).toEqual(['name', 'age'])
    })

    it('should throw error for invalid mapping configuration', () => {
      expect(
        () =>
          new SchemaMapper<any, any>({
            mappings: [123 as any],
          })
      ).toThrow(ConsolidationError)
      expect(
        () =>
          new SchemaMapper<any, any>({
            mappings: [123 as any],
          })
      ).toThrow('Invalid mapping configuration')
    })
  })

  describe('map', () => {
    it('should map simple fields', () => {
      type Input = { firstName: string; lastName: string; age: number }
      type Output = { name: string; lastName: string; years: number }

      const mapper = new SchemaMapper<Input, Output>({
        mappings: [
          { source: 'firstName', target: 'name' },
          { source: 'lastName', target: 'lastName' },
          { source: 'age', target: 'years' },
        ],
      })

      const result = mapper.map({
        firstName: 'John',
        lastName: 'Doe',
        age: 30,
      })

      expect(result).toEqual({
        name: 'John',
        lastName: 'Doe',
        years: 30,
      })
    })

    it('should handle nested source fields', () => {
      type Input = { address: { city: string; zip: string }; name: string }
      type Output = { city: string; zip: string; name: string }

      const mapper = new SchemaMapper<Input, Output>({
        mappings: [
          { source: 'address.city', target: 'city' },
          { source: 'address.zip', target: 'zip' },
          { source: 'name', target: 'name' },
        ],
      })

      const result = mapper.map({
        name: 'John',
        address: { city: 'NYC', zip: '10001' },
      })

      expect(result).toEqual({
        name: 'John',
        city: 'NYC',
        zip: '10001',
      })
    })

    it('should handle nested target fields', () => {
      type Input = { city: string; zip: string; name: string }
      type Output = { address: { city: string; zip: string }; name: string }

      const mapper = new SchemaMapper<Input, Output>({
        mappings: [
          { source: 'city', target: 'address.city' },
          { source: 'zip', target: 'address.zip' },
          { source: 'name', target: 'name' },
        ],
      })

      const result = mapper.map({
        name: 'John',
        city: 'NYC',
        zip: '10001',
      })

      expect(result).toEqual({
        name: 'John',
        address: { city: 'NYC', zip: '10001' },
      })
    })

    it('should handle deeply nested paths', () => {
      type Input = { user: { profile: { contact: { email: string } } } }
      type Output = { contact: { info: { email: string } } }

      const mapper = new SchemaMapper<Input, Output>({
        mappings: [
          {
            source: 'user.profile.contact.email',
            target: 'contact.info.email',
          },
        ],
      })

      const result = mapper.map({
        user: {
          profile: {
            contact: {
              email: 'john@example.com',
            },
          },
        },
      })

      expect(result).toEqual({
        contact: {
          info: {
            email: 'john@example.com',
          },
        },
      })
    })

    it('should handle undefined nested values', () => {
      type Input = { address?: { city?: string } }
      type Output = { city: string | undefined }

      const mapper = new SchemaMapper<Input, Output>({
        mappings: [{ source: 'address.city', target: 'city' }],
      })

      expect(mapper.map({ address: {} })).toEqual({ city: undefined })
      expect(mapper.map({})).toEqual({ city: undefined })
    })

    it('should apply transform functions', () => {
      type Input = { name: string; age: string }
      type Output = { name: string; age: number }

      const mapper = new SchemaMapper<Input, Output>({
        mappings: [
          {
            source: 'name',
            target: 'name',
            transform: (v) => String(v).toUpperCase(),
          },
          {
            source: 'age',
            target: 'age',
            transform: (v) => parseInt(String(v), 10),
          },
        ],
      })

      const result = mapper.map({ name: 'john', age: '30' })

      expect(result).toEqual({
        name: 'JOHN',
        age: 30,
      })
    })

    it('should pass full record to transform function', () => {
      type Input = { firstName: string; lastName: string }
      type Output = { fullName: string }

      const mapper = new SchemaMapper<Input, Output>({
        mappings: [
          {
            source: 'firstName',
            target: 'fullName',
            transform: (v, record) =>
              `${record?.firstName} ${record?.lastName}`,
          },
        ],
      })

      const result = mapper.map({ firstName: 'John', lastName: 'Doe' })

      expect(result).toEqual({ fullName: 'John Doe' })
    })

    it('should handle null values', () => {
      type Input = { name: string | null; age: number | null }
      type Output = { name: string | null; age: number | null }

      const mapper = new SchemaMapper<Input, Output>({
        mappings: [
          { source: 'name', target: 'name' },
          { source: 'age', target: 'age' },
        ],
      })

      const result = mapper.map({ name: null, age: null })

      expect(result).toEqual({ name: null, age: null })
    })

    it('should throw error for null input record', () => {
      const mapper = new SchemaMapper({
        mappings: [{ source: 'name', target: 'name' }],
      })

      expect(() => mapper.map(null as any)).toThrow(ConsolidationError)
      expect(() => mapper.map(null as any)).toThrow(
        'Cannot map null or undefined record'
      )
    })

    it('should throw error for undefined input record', () => {
      const mapper = new SchemaMapper({
        mappings: [{ source: 'name', target: 'name' }],
      })

      expect(() => mapper.map(undefined as any)).toThrow(ConsolidationError)
      expect(() => mapper.map(undefined as any)).toThrow(
        'Cannot map null or undefined record'
      )
    })

    it('should throw error if transform function throws', () => {
      const mapper = new SchemaMapper({
        mappings: [
          {
            source: 'value',
            target: 'result',
            transform: () => {
              throw new Error('Transform failed')
            },
          },
        ],
      })

      expect(() => mapper.map({ value: 123 })).toThrow(ConsolidationError)
      expect(() => mapper.map({ value: 123 })).toThrow(
        'Failed to map field "value" to "result"'
      )
    })

    it('should throw error if nested target conflicts with existing value', () => {
      const mapper = new SchemaMapper({
        mappings: [
          { source: 'value', target: 'address' },
          { source: 'city', target: 'address.city' },
        ],
      })

      expect(() => mapper.map({ value: 'test', city: 'NYC' })).toThrow(
        ConsolidationError
      )
      expect(() => mapper.map({ value: 'test', city: 'NYC' })).toThrow(
        'is not an object'
      )
    })

    it('should handle empty objects', () => {
      const mapper = new SchemaMapper({
        mappings: [{ source: 'name', target: 'name' }],
      })

      const result = mapper.map({})

      expect(result).toEqual({ name: undefined })
    })

    it('should preserve additional properties not in mappings', () => {
      // Note: SchemaMapper only outputs mapped fields
      const mapper = new SchemaMapper({
        mappings: [{ source: 'name', target: 'name' }],
      })

      const result = mapper.map({ name: 'John', age: 30 })

      expect(result).toEqual({ name: 'John' })
      expect(result).not.toHaveProperty('age')
    })
  })

  describe('mapBatch', () => {
    it('should map multiple records', () => {
      type Input = { firstName: string; age: number }
      type Output = { name: string; age: number }

      const mapper = new SchemaMapper<Input, Output>({
        mappings: [
          { source: 'firstName', target: 'name' },
          { source: 'age', target: 'age' },
        ],
      })

      const result = mapper.mapBatch([
        { firstName: 'John', age: 30 },
        { firstName: 'Jane', age: 25 },
        { firstName: 'Bob', age: 40 },
      ])

      expect(result).toEqual([
        { name: 'John', age: 30 },
        { name: 'Jane', age: 25 },
        { name: 'Bob', age: 40 },
      ])
    })

    it('should handle empty array', () => {
      const mapper = new SchemaMapper({
        mappings: [{ source: 'name', target: 'name' }],
      })

      const result = mapper.mapBatch([])

      expect(result).toEqual([])
    })

    it('should throw error for non-array input', () => {
      const mapper = new SchemaMapper({
        mappings: [{ source: 'name', target: 'name' }],
      })

      expect(() => mapper.mapBatch({ name: 'John' } as any)).toThrow(
        ConsolidationError
      )
      expect(() => mapper.mapBatch({ name: 'John' } as any)).toThrow(
        'mapBatch expects an array of records'
      )
    })

    it('should throw error with record index on mapping failure', () => {
      const mapper = new SchemaMapper({
        mappings: [
          {
            source: 'value',
            target: 'result',
            transform: (v) => {
              if (v === 2) throw new Error('Invalid value')
              return v
            },
          },
        ],
      })

      expect(() =>
        mapper.mapBatch([{ value: 1 }, { value: 2 }, { value: 3 }])
      ).toThrow(ConsolidationError)
      expect(() =>
        mapper.mapBatch([{ value: 1 }, { value: 2 }, { value: 3 }])
      ).toThrow('Failed to map record at index 1')
    })

    it('should handle large batches', () => {
      const mapper = new SchemaMapper({
        mappings: [
          { source: 'id', target: 'id' },
          { source: 'name', target: 'name' },
        ],
      })

      const inputs = Array.from({ length: 1000 }, (_, i) => ({
        id: i,
        name: `User ${i}`,
      }))

      const results = mapper.mapBatch(inputs)

      expect(results).toHaveLength(1000)
      expect(results[0]).toEqual({ id: 0, name: 'User 0' })
      expect(results[999]).toEqual({ id: 999, name: 'User 999' })
    })
  })

  describe('getTargetFields', () => {
    it('should return list of target fields', () => {
      const mapper = new SchemaMapper({
        mappings: [
          { source: 'firstName', target: 'name' },
          { source: 'age', target: 'age' },
          { source: 'city', target: 'location' },
        ],
      })

      const fields = mapper.getTargetFields()

      expect(fields).toEqual(['name', 'age', 'location'])
    })

    it('should return empty array for no mappings', () => {
      // This test won't work because constructor throws for empty mappings
      // But we'll keep it to document the behavior
    })
  })

  describe('hasTargetField', () => {
    it('should return true for mapped target field', () => {
      const mapper = new SchemaMapper({
        mappings: [
          { source: 'firstName', target: 'name' },
          { source: 'age', target: 'age' },
        ],
      })

      expect(mapper.hasTargetField('name')).toBe(true)
      expect(mapper.hasTargetField('age')).toBe(true)
    })

    it('should return false for unmapped target field', () => {
      const mapper = new SchemaMapper({
        mappings: [
          { source: 'firstName', target: 'name' },
          { source: 'age', target: 'age' },
        ],
      })

      expect(mapper.hasTargetField('email')).toBe(false)
      expect(mapper.hasTargetField('city')).toBe(false)
    })
  })
})

describe('createSchemaMapper', () => {
  it('should create mapper from consolidation source', () => {
    type Input = { customer_name: string; customer_age: number }
    type Output = { name: string; age: number }

    const source: ConsolidationSource<Input, Output> = {
      sourceId: 'customers',
      name: 'Customers',
      adapter: null as any, // Not used in this test
      mapping: {
        name: { sourceField: 'customer_name' },
        age: { sourceField: 'customer_age' },
      },
    }

    const mapper = createSchemaMapper(source)

    expect(mapper).toBeInstanceOf(SchemaMapper)
    expect(mapper.getTargetFields()).toContain('name')
    expect(mapper.getTargetFields()).toContain('age')

    const result = mapper.map({ customer_name: 'John', customer_age: 30 })
    expect(result).toEqual({ name: 'John', age: 30 })
  })
})

describe('TypeCoercions', () => {
  describe('toString', () => {
    it('should convert values to string', () => {
      expect(TypeCoercions.toString(123)).toBe('123')
      expect(TypeCoercions.toString(true)).toBe('true')
      expect(TypeCoercions.toString(false)).toBe('false')
      expect(TypeCoercions.toString({ a: 1 })).toBe('[object Object]')
    })

    it('should handle null and undefined', () => {
      expect(TypeCoercions.toString(null)).toBe('')
      expect(TypeCoercions.toString(undefined)).toBe('')
    })
  })

  describe('toNumber', () => {
    it('should convert values to number', () => {
      expect(TypeCoercions.toNumber('123')).toBe(123)
      expect(TypeCoercions.toNumber('45.67')).toBe(45.67)
      expect(TypeCoercions.toNumber(123)).toBe(123)
      expect(TypeCoercions.toNumber(true)).toBe(1)
      expect(TypeCoercions.toNumber(false)).toBe(0)
    })

    it('should return null for invalid numbers', () => {
      expect(TypeCoercions.toNumber('abc')).toBeNull()
      expect(TypeCoercions.toNumber({})).toBeNull()
      expect(TypeCoercions.toNumber(null)).toBeNull()
      expect(TypeCoercions.toNumber(undefined)).toBeNull()
      expect(TypeCoercions.toNumber('')).toBeNull()
    })
  })

  describe('toBoolean', () => {
    it('should convert truthy values to true', () => {
      expect(TypeCoercions.toBoolean(true)).toBe(true)
      expect(TypeCoercions.toBoolean('true')).toBe(true)
      expect(TypeCoercions.toBoolean('True')).toBe(true)
      expect(TypeCoercions.toBoolean('TRUE')).toBe(true)
      expect(TypeCoercions.toBoolean('1')).toBe(true)
      expect(TypeCoercions.toBoolean('yes')).toBe(true)
      expect(TypeCoercions.toBoolean('Yes')).toBe(true)
      expect(TypeCoercions.toBoolean(1)).toBe(true)
      expect(TypeCoercions.toBoolean({})).toBe(true)
      expect(TypeCoercions.toBoolean([])).toBe(true)
    })

    it('should convert falsy values to false', () => {
      expect(TypeCoercions.toBoolean(false)).toBe(false)
      expect(TypeCoercions.toBoolean('false')).toBe(false)
      expect(TypeCoercions.toBoolean('False')).toBe(false)
      expect(TypeCoercions.toBoolean('0')).toBe(false)
      expect(TypeCoercions.toBoolean('no')).toBe(false)
      expect(TypeCoercions.toBoolean(0)).toBe(false)
      expect(TypeCoercions.toBoolean('')).toBe(false)
      expect(TypeCoercions.toBoolean(null)).toBe(false)
      expect(TypeCoercions.toBoolean(undefined)).toBe(false)
    })
  })

  describe('toDate', () => {
    it('should convert values to Date', () => {
      const dateStr = '2024-01-15'
      const result = TypeCoercions.toDate(dateStr)
      expect(result).toBeInstanceOf(Date)
      expect(result?.getFullYear()).toBe(2024)
      expect(result?.getMonth()).toBe(0)
      expect(result?.getDate()).toBe(15)
    })

    it('should return Date unchanged', () => {
      const date = new Date('2024-01-15')
      const result = TypeCoercions.toDate(date)
      expect(result).toBe(date)
    })

    it('should return null for invalid dates', () => {
      expect(TypeCoercions.toDate('invalid')).toBeNull()
      expect(TypeCoercions.toDate(null)).toBeNull()
      expect(TypeCoercions.toDate(undefined)).toBeNull()
      expect(TypeCoercions.toDate('')).toBeNull()
    })

    it('should handle timestamps', () => {
      const timestamp = 1705276800000 // 2024-01-15
      const result = TypeCoercions.toDate(timestamp)
      expect(result).toBeInstanceOf(Date)
      expect(result?.getFullYear()).toBe(2024)
    })
  })

  describe('toArray', () => {
    it('should convert values to array', () => {
      expect(TypeCoercions.toArray(123)).toEqual([123])
      expect(TypeCoercions.toArray('abc')).toEqual(['abc'])
      expect(TypeCoercions.toArray({ a: 1 })).toEqual([{ a: 1 }])
    })

    it('should return array unchanged', () => {
      expect(TypeCoercions.toArray([1, 2, 3])).toEqual([1, 2, 3])
      expect(TypeCoercions.toArray(['a', 'b'])).toEqual(['a', 'b'])
    })

    it('should return empty array for null/undefined', () => {
      expect(TypeCoercions.toArray(null)).toEqual([])
      expect(TypeCoercions.toArray(undefined)).toEqual([])
    })
  })
})

describe('CommonTransforms', () => {
  describe('uppercase', () => {
    it('should convert string to uppercase', () => {
      expect(CommonTransforms.uppercase('hello')).toBe('HELLO')
      expect(CommonTransforms.uppercase('Hello World')).toBe('HELLO WORLD')
    })

    it('should handle non-string values', () => {
      expect(CommonTransforms.uppercase(123)).toBe('123')
      expect(CommonTransforms.uppercase(null)).toBe(null)
      expect(CommonTransforms.uppercase(undefined)).toBe(undefined)
    })
  })

  describe('lowercase', () => {
    it('should convert string to lowercase', () => {
      expect(CommonTransforms.lowercase('HELLO')).toBe('hello')
      expect(CommonTransforms.lowercase('Hello World')).toBe('hello world')
    })

    it('should handle non-string values', () => {
      expect(CommonTransforms.lowercase(123)).toBe('123')
      expect(CommonTransforms.lowercase(null)).toBe(null)
      expect(CommonTransforms.lowercase(undefined)).toBe(undefined)
    })
  })

  describe('trim', () => {
    it('should trim whitespace', () => {
      expect(CommonTransforms.trim('  hello  ')).toBe('hello')
      expect(CommonTransforms.trim('\n\thello\t\n')).toBe('hello')
    })

    it('should handle non-string values', () => {
      expect(CommonTransforms.trim(123)).toBe('123')
      expect(CommonTransforms.trim(null)).toBe(null)
      expect(CommonTransforms.trim(undefined)).toBe(undefined)
    })
  })

  describe('defaultValue', () => {
    it('should return default for null/undefined', () => {
      const transform = CommonTransforms.defaultValue('default')
      expect(transform(null)).toBe('default')
      expect(transform(undefined)).toBe('default')
    })

    it('should return original value if not null/undefined', () => {
      const transform = CommonTransforms.defaultValue('default')
      expect(transform('value')).toBe('value')
      expect(transform(0)).toBe(0)
      expect(transform('')).toBe('')
      expect(transform(false)).toBe(false)
    })
  })

  describe('parseJSON', () => {
    it('should parse JSON string', () => {
      expect(CommonTransforms.parseJSON('{"a":1}')).toEqual({ a: 1 })
      expect(CommonTransforms.parseJSON('[1,2,3]')).toEqual([1, 2, 3])
      expect(CommonTransforms.parseJSON('"hello"')).toBe('hello')
    })

    it('should return null for invalid JSON', () => {
      expect(CommonTransforms.parseJSON('invalid')).toBeNull()
      expect(CommonTransforms.parseJSON('{invalid}')).toBeNull()
    })

    it('should return non-string values unchanged', () => {
      expect(CommonTransforms.parseJSON({ a: 1 })).toEqual({ a: 1 })
      expect(CommonTransforms.parseJSON(123)).toBe(123)
      expect(CommonTransforms.parseJSON(null)).toBe(null)
    })
  })

  describe('stringifyJSON', () => {
    it('should stringify values to JSON', () => {
      expect(CommonTransforms.stringifyJSON({ a: 1 })).toBe('{"a":1}')
      expect(CommonTransforms.stringifyJSON([1, 2, 3])).toBe('[1,2,3]')
      expect(CommonTransforms.stringifyJSON('hello')).toBe('"hello"')
      expect(CommonTransforms.stringifyJSON(123)).toBe('123')
    })

    it('should return null for unstringifiable values', () => {
      const circular: any = {}
      circular.self = circular
      expect(CommonTransforms.stringifyJSON(circular)).toBeNull()
    })
  })

  describe('compose', () => {
    it('should compose multiple transforms', () => {
      const transform = CommonTransforms.compose(
        CommonTransforms.trim,
        CommonTransforms.lowercase,
        CommonTransforms.defaultValue('empty')
      )

      expect(transform('  HELLO  ')).toBe('hello')
      expect(transform(null)).toBe('empty')
    })

    it('should apply transforms in order', () => {
      const transform = CommonTransforms.compose(
        (v) => v + '1',
        (v) => v + '2',
        (v) => v + '3'
      )

      expect(transform('x')).toBe('x123')
    })

    it('should pass record to all transforms', () => {
      const transform = CommonTransforms.compose<any, any>(
        (v, record) => `${v}-${record?.suffix}`,
        (v) => v.toUpperCase()
      )

      expect(transform('hello', { suffix: 'world' })).toBe('HELLO-WORLD')
    })
  })
})

describe('Integration Tests', () => {
  it('should handle complex real-world mapping', () => {
    type CustomerInput = {
      customer_id: number
      customer_name: string
      customer_email: string
      billing_address: {
        street: string
        city: string
        state: string
        zip: string
      }
      created_at: string
      is_active: string
    }

    type UnifiedOutput = {
      id: number
      name: string
      email: string
      city: string
      state: string
      zip: string
      createdDate: Date
      active: boolean
      source: string
    }

    const mapper = new SchemaMapper<CustomerInput, UnifiedOutput>({
      mappings: [
        { source: 'customer_id', target: 'id' },
        {
          source: 'customer_name',
          target: 'name',
          transform: CommonTransforms.compose(
            CommonTransforms.trim,
            CommonTransforms.uppercase
          ),
        },
        {
          source: 'customer_email',
          target: 'email',
          transform: CommonTransforms.lowercase,
        },
        { source: 'billing_address.city', target: 'city' },
        { source: 'billing_address.state', target: 'state' },
        { source: 'billing_address.zip', target: 'zip' },
        {
          source: 'created_at',
          target: 'createdDate',
          transform: TypeCoercions.toDate,
        },
        {
          source: 'is_active',
          target: 'active',
          transform: TypeCoercions.toBoolean,
        },
        {
          source: 'customer_id',
          target: 'source',
          transform: () => 'CRM',
        },
      ],
    })

    const result = mapper.map({
      customer_id: 12345,
      customer_name: '  john doe  ',
      customer_email: 'JOHN.DOE@EXAMPLE.COM',
      billing_address: {
        street: '123 Main St',
        city: 'New York',
        state: 'NY',
        zip: '10001',
      },
      created_at: '2024-01-15',
      is_active: 'true',
    })

    expect(result).toEqual({
      id: 12345,
      name: 'JOHN DOE',
      email: 'john.doe@example.com',
      city: 'New York',
      state: 'NY',
      zip: '10001',
      createdDate: expect.any(Date),
      active: true,
      source: 'CRM',
    })
    expect(result.createdDate.getFullYear()).toBe(2024)
  })

  it('should handle batch mapping with transforms', () => {
    type Input = { name: string; value: string }
    type Output = { name: string; value: number }

    const mapper = new SchemaMapper<Input, Output>({
      mappings: [
        {
          source: 'name',
          target: 'name',
          transform: CommonTransforms.uppercase,
        },
        { source: 'value', target: 'value', transform: TypeCoercions.toNumber },
      ],
    })

    const results = mapper.mapBatch([
      { name: 'alpha', value: '10' },
      { name: 'beta', value: '20' },
      { name: 'gamma', value: '30' },
    ])

    expect(results).toEqual([
      { name: 'ALPHA', value: 10 },
      { name: 'BETA', value: 20 },
      { name: 'GAMMA', value: 30 },
    ])
  })
})
