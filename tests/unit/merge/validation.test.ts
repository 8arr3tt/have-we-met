import { describe, it, expect } from 'vitest'
import {
  validateMergeConfig,
  validateFieldStrategy,
  validateSourceRecords,
  validateFieldPathsAgainstSchema,
  validateStrategyFieldTypeCompatibility,
  validateMergeRequest,
  isNullOrUndefined,
  isEmpty,
  getNestedValue,
  setNestedValue,
} from '../../../src/merge/validation.js'
import {
  MergeValidationError,
  InsufficientSourceRecordsError,
  CustomStrategyMissingError,
  InvalidStrategyError,
  StrategyTypeMismatchError,
} from '../../../src/merge/merge-error.js'
import type { MergeConfig, FieldMergeConfig, SourceRecord } from '../../../src/merge/types.js'
import type { SchemaDefinition } from '../../../src/types/schema.js'

describe('validateMergeConfig', () => {
  const validConfig: MergeConfig = {
    fieldStrategies: [
      { field: 'firstName', strategy: 'preferLonger' },
      { field: 'email', strategy: 'preferNonNull' },
    ],
    defaultStrategy: 'preferFirst',
    trackProvenance: true,
    conflictResolution: 'useDefault',
  }

  it('validates a valid merge config', () => {
    expect(() => validateMergeConfig(validConfig)).not.toThrow()
  })

  it('rejects missing defaultStrategy', () => {
    const config = { ...validConfig, defaultStrategy: undefined as unknown as string }

    expect(() => validateMergeConfig(config as MergeConfig)).toThrow(MergeValidationError)
    expect(() => validateMergeConfig(config as MergeConfig)).toThrow('defaultStrategy is required')
  })

  it('rejects invalid defaultStrategy', () => {
    const config = { ...validConfig, defaultStrategy: 'invalidStrategy' as MergeConfig['defaultStrategy'] }

    expect(() => validateMergeConfig(config)).toThrow(MergeValidationError)
    expect(() => validateMergeConfig(config)).toThrow('invalid strategy')
  })

  it('rejects non-array fieldStrategies', () => {
    const config = { ...validConfig, fieldStrategies: 'not-an-array' as unknown as FieldMergeConfig[] }

    expect(() => validateMergeConfig(config)).toThrow(MergeValidationError)
    expect(() => validateMergeConfig(config)).toThrow('must be an array')
  })

  it('rejects duplicate field paths', () => {
    const config: MergeConfig = {
      ...validConfig,
      fieldStrategies: [
        { field: 'email', strategy: 'preferFirst' },
        { field: 'email', strategy: 'preferLast' },
      ],
    }

    expect(() => validateMergeConfig(config)).toThrow(MergeValidationError)
    expect(() => validateMergeConfig(config)).toThrow('duplicate field paths')
  })

  it('rejects invalid conflictResolution', () => {
    const config = { ...validConfig, conflictResolution: 'invalid' as MergeConfig['conflictResolution'] }

    expect(() => validateMergeConfig(config)).toThrow(MergeValidationError)
    expect(() => validateMergeConfig(config)).toThrow("invalid mode 'invalid'")
  })

  it('validates all field strategies', () => {
    const config: MergeConfig = {
      ...validConfig,
      fieldStrategies: [
        { field: 'name', strategy: 'custom' }, // Missing customMerge
      ],
    }

    expect(() => validateMergeConfig(config)).toThrow(CustomStrategyMissingError)
  })
})

describe('validateFieldStrategy', () => {
  it('validates a valid field strategy', () => {
    const strategy: FieldMergeConfig = {
      field: 'email',
      strategy: 'preferNonNull',
    }

    expect(() => validateFieldStrategy(strategy)).not.toThrow()
  })

  it('validates field strategy with options', () => {
    const strategy: FieldMergeConfig = {
      field: 'updatedAt',
      strategy: 'preferNewer',
      options: {
        dateField: 'lastModified',
        nullHandling: 'skip',
      },
    }

    expect(() => validateFieldStrategy(strategy)).not.toThrow()
  })

  it('rejects empty field path', () => {
    const strategy = { field: '', strategy: 'preferFirst' } as FieldMergeConfig

    expect(() => validateFieldStrategy(strategy)).toThrow(MergeValidationError)
    expect(() => validateFieldStrategy(strategy)).toThrow('non-empty string')
  })

  it('rejects missing strategy', () => {
    const strategy = { field: 'name' } as FieldMergeConfig

    expect(() => validateFieldStrategy(strategy)).toThrow(MergeValidationError)
    expect(() => validateFieldStrategy(strategy)).toThrow('strategy is required')
  })

  it('rejects invalid strategy', () => {
    const strategy = { field: 'name', strategy: 'invalidStrategy' } as FieldMergeConfig

    expect(() => validateFieldStrategy(strategy)).toThrow(InvalidStrategyError)
  })

  it('rejects custom strategy without custom function', () => {
    const strategy: FieldMergeConfig = {
      field: 'special',
      strategy: 'custom',
    }

    expect(() => validateFieldStrategy(strategy)).toThrow(CustomStrategyMissingError)
  })

  it('accepts custom strategy with custom function', () => {
    const strategy: FieldMergeConfig = {
      field: 'special',
      strategy: 'custom',
      customMerge: (values) => values[0],
    }

    expect(() => validateFieldStrategy(strategy)).not.toThrow()
  })

  it('rejects non-function customMerge', () => {
    const strategy = {
      field: 'special',
      strategy: 'custom',
      customMerge: 'not-a-function',
    } as unknown as FieldMergeConfig

    expect(() => validateFieldStrategy(strategy)).toThrow(MergeValidationError)
    expect(() => validateFieldStrategy(strategy)).toThrow('must be a function')
  })

  it('validates invalid nullHandling option', () => {
    const strategy: FieldMergeConfig = {
      field: 'name',
      strategy: 'preferNonNull',
      options: {
        nullHandling: 'invalid' as 'skip',
      },
    }

    expect(() => validateFieldStrategy(strategy)).toThrow(MergeValidationError)
    expect(() => validateFieldStrategy(strategy)).toThrow('invalid value')
  })

  it('validates invalid separator type', () => {
    const strategy = {
      field: 'tags',
      strategy: 'concatenate',
      options: {
        separator: 123,
      },
    } as unknown as FieldMergeConfig

    expect(() => validateFieldStrategy(strategy)).toThrow(MergeValidationError)
    expect(() => validateFieldStrategy(strategy)).toThrow('separator must be a string')
  })
})

describe('validateSourceRecords', () => {
  const createValidRecords = (): SourceRecord<{ name: string }>[] => [
    {
      id: 'rec-001',
      record: { name: 'John' },
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'rec-002',
      record: { name: 'Jane' },
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]

  it('validates valid source records', () => {
    expect(() => validateSourceRecords(createValidRecords())).not.toThrow()
  })

  it('rejects fewer than 2 records', () => {
    const records = [createValidRecords()[0]]

    expect(() => validateSourceRecords(records)).toThrow(InsufficientSourceRecordsError)
    expect(() => validateSourceRecords(records)).toThrow('at least 2 source records')
  })

  it('rejects empty array', () => {
    expect(() => validateSourceRecords([])).toThrow(InsufficientSourceRecordsError)
    expect(() => validateSourceRecords([])).toThrow('got 0')
  })

  it('rejects null/undefined', () => {
    expect(() => validateSourceRecords(null as unknown as SourceRecord[])).toThrow(
      InsufficientSourceRecordsError,
    )
  })

  it('rejects record with missing id', () => {
    const records = [
      { id: 'rec-001', record: { name: 'John' }, createdAt: new Date(), updatedAt: new Date() },
      { id: '', record: { name: 'Jane' }, createdAt: new Date(), updatedAt: new Date() },
    ]

    expect(() => validateSourceRecords(records)).toThrow(MergeValidationError)
    expect(() => validateSourceRecords(records)).toThrow('non-empty string')
  })

  it('rejects record with non-object record data', () => {
    const records = [
      { id: 'rec-001', record: { name: 'John' }, createdAt: new Date(), updatedAt: new Date() },
      { id: 'rec-002', record: null, createdAt: new Date(), updatedAt: new Date() },
    ] as unknown as SourceRecord[]

    expect(() => validateSourceRecords(records)).toThrow(MergeValidationError)
    expect(() => validateSourceRecords(records)).toThrow('must be an object')
  })

  it('rejects record with non-Date createdAt', () => {
    const records = [
      { id: 'rec-001', record: { name: 'John' }, createdAt: new Date(), updatedAt: new Date() },
      { id: 'rec-002', record: { name: 'Jane' }, createdAt: 'not-a-date', updatedAt: new Date() },
    ] as unknown as SourceRecord[]

    expect(() => validateSourceRecords(records)).toThrow(MergeValidationError)
    expect(() => validateSourceRecords(records)).toThrow('createdAt must be a Date')
  })

  it('rejects record with non-Date updatedAt', () => {
    const records = [
      { id: 'rec-001', record: { name: 'John' }, createdAt: new Date(), updatedAt: new Date() },
      {
        id: 'rec-002',
        record: { name: 'Jane' },
        createdAt: new Date(),
        updatedAt: '2024-01-01',
      },
    ] as unknown as SourceRecord[]

    expect(() => validateSourceRecords(records)).toThrow(MergeValidationError)
    expect(() => validateSourceRecords(records)).toThrow('updatedAt must be a Date')
  })

  it('rejects duplicate record IDs', () => {
    const records = [
      { id: 'rec-001', record: { name: 'John' }, createdAt: new Date(), updatedAt: new Date() },
      { id: 'rec-001', record: { name: 'Jane' }, createdAt: new Date(), updatedAt: new Date() },
    ]

    expect(() => validateSourceRecords(records)).toThrow(MergeValidationError)
    expect(() => validateSourceRecords(records)).toThrow('duplicate record IDs')
  })

  it('accepts more than 2 records', () => {
    const records = [
      { id: 'rec-001', record: { name: 'John' }, createdAt: new Date(), updatedAt: new Date() },
      { id: 'rec-002', record: { name: 'Jane' }, createdAt: new Date(), updatedAt: new Date() },
      { id: 'rec-003', record: { name: 'Bob' }, createdAt: new Date(), updatedAt: new Date() },
    ]

    expect(() => validateSourceRecords(records)).not.toThrow()
  })
})

describe('validateFieldPathsAgainstSchema', () => {
  interface TestRecord {
    firstName: string
    lastName: string
    email: string
    address: { city: string }
  }

  const schema: SchemaDefinition<TestRecord> = {
    firstName: { type: 'name' },
    lastName: { type: 'name' },
    email: { type: 'email' },
    address: { type: 'custom' },
  }

  it('validates field paths that exist in schema', () => {
    const fieldStrategies: FieldMergeConfig[] = [
      { field: 'firstName', strategy: 'preferLonger' },
      { field: 'email', strategy: 'preferNonNull' },
    ]

    expect(() => validateFieldPathsAgainstSchema(fieldStrategies, schema)).not.toThrow()
  })

  it('validates nested field paths (checks root field)', () => {
    const fieldStrategies: FieldMergeConfig[] = [{ field: 'address.city', strategy: 'preferNonNull' }]

    expect(() => validateFieldPathsAgainstSchema(fieldStrategies, schema)).not.toThrow()
  })

  it('rejects field paths not in schema', () => {
    const fieldStrategies: FieldMergeConfig[] = [{ field: 'unknownField', strategy: 'preferFirst' }]

    expect(() => validateFieldPathsAgainstSchema(fieldStrategies, schema)).toThrow(
      MergeValidationError,
    )
    expect(() => validateFieldPathsAgainstSchema(fieldStrategies, schema)).toThrow(
      "does not exist in schema",
    )
  })

  it('includes available fields in error message', () => {
    const fieldStrategies: FieldMergeConfig[] = [{ field: 'missing', strategy: 'preferFirst' }]

    try {
      validateFieldPathsAgainstSchema(fieldStrategies, schema)
      expect.fail('Should have thrown')
    } catch (error) {
      expect((error as MergeValidationError).message).toContain('firstName')
      expect((error as MergeValidationError).message).toContain('lastName')
      expect((error as MergeValidationError).message).toContain('email')
    }
  })
})

describe('validateStrategyFieldTypeCompatibility', () => {
  interface TestRecord {
    name: string
    age: number
    tags: string[]
  }

  const schema: SchemaDefinition<TestRecord> = {
    name: { type: 'string' },
    age: { type: 'number' },
    tags: { type: 'custom' },
  }

  it('allows numeric strategies on numeric fields', () => {
    const fieldStrategies: FieldMergeConfig[] = [
      { field: 'age', strategy: 'average' },
      { field: 'age', strategy: 'sum' },
      { field: 'age', strategy: 'min' },
      { field: 'age', strategy: 'max' },
    ]

    expect(() => validateStrategyFieldTypeCompatibility(fieldStrategies, schema)).not.toThrow()
  })

  it('rejects numeric strategies on non-numeric fields', () => {
    const fieldStrategies: FieldMergeConfig[] = [{ field: 'name', strategy: 'average' }]

    expect(() => validateStrategyFieldTypeCompatibility(fieldStrategies, schema)).toThrow(
      StrategyTypeMismatchError,
    )
  })

  it('provides detailed error message for type mismatch', () => {
    const fieldStrategies: FieldMergeConfig[] = [{ field: 'name', strategy: 'sum' }]

    try {
      validateStrategyFieldTypeCompatibility(fieldStrategies, schema)
      expect.fail('Should have thrown')
    } catch (error) {
      const e = error as StrategyTypeMismatchError
      expect(e.strategy).toBe('sum')
      expect(e.field).toBe('name')
      expect(e.expectedType).toBe('number')
      expect(e.actualType).toBe('string')
    }
  })

  it('allows string strategies on any field', () => {
    const fieldStrategies: FieldMergeConfig[] = [{ field: 'name', strategy: 'preferLonger' }]

    expect(() => validateStrategyFieldTypeCompatibility(fieldStrategies, schema)).not.toThrow()
  })

  it('skips validation for fields not in schema', () => {
    const fieldStrategies: FieldMergeConfig[] = [{ field: 'unknown', strategy: 'average' }]

    // Should not throw - field validation is handled by validateFieldPathsAgainstSchema
    expect(() => validateStrategyFieldTypeCompatibility(fieldStrategies, schema)).not.toThrow()
  })
})

describe('validateMergeRequest', () => {
  const validConfig: MergeConfig = {
    fieldStrategies: [{ field: 'name', strategy: 'preferLonger' }],
    defaultStrategy: 'preferFirst',
    trackProvenance: true,
    conflictResolution: 'useDefault',
  }

  const validRecords: SourceRecord<{ name: string }>[] = [
    { id: 'rec-001', record: { name: 'John' }, createdAt: new Date(), updatedAt: new Date() },
    { id: 'rec-002', record: { name: 'Jane' }, createdAt: new Date(), updatedAt: new Date() },
  ]

  it('validates a complete valid merge request', () => {
    expect(() => validateMergeRequest(validRecords, validConfig)).not.toThrow()
  })

  it('validates with schema', () => {
    const schema: SchemaDefinition<{ name: string }> = {
      name: { type: 'name' },
    }

    expect(() => validateMergeRequest(validRecords, validConfig, schema)).not.toThrow()
  })

  it('validates config errors', () => {
    const badConfig = { ...validConfig, defaultStrategy: '' as MergeConfig['defaultStrategy'] }

    expect(() => validateMergeRequest(validRecords, badConfig)).toThrow(MergeValidationError)
  })

  it('validates source records errors', () => {
    const badRecords = [validRecords[0]] // Only 1 record

    expect(() => validateMergeRequest(badRecords, validConfig)).toThrow(
      InsufficientSourceRecordsError,
    )
  })

  it('validates field paths against schema when provided', () => {
    const configWithUnknownField: MergeConfig = {
      ...validConfig,
      fieldStrategies: [{ field: 'unknownField', strategy: 'preferFirst' }],
    }
    const schema: SchemaDefinition<{ name: string }> = {
      name: { type: 'name' },
    }

    expect(() => validateMergeRequest(validRecords, configWithUnknownField, schema)).toThrow(
      MergeValidationError,
    )
  })
})

describe('isNullOrUndefined', () => {
  it('returns true for null', () => {
    expect(isNullOrUndefined(null)).toBe(true)
  })

  it('returns true for undefined', () => {
    expect(isNullOrUndefined(undefined)).toBe(true)
  })

  it('returns false for empty string', () => {
    expect(isNullOrUndefined('')).toBe(false)
  })

  it('returns false for zero', () => {
    expect(isNullOrUndefined(0)).toBe(false)
  })

  it('returns false for false', () => {
    expect(isNullOrUndefined(false)).toBe(false)
  })

  it('returns false for empty array', () => {
    expect(isNullOrUndefined([])).toBe(false)
  })

  it('returns false for empty object', () => {
    expect(isNullOrUndefined({})).toBe(false)
  })
})

describe('isEmpty', () => {
  it('returns true for null', () => {
    expect(isEmpty(null)).toBe(true)
  })

  it('returns true for undefined', () => {
    expect(isEmpty(undefined)).toBe(true)
  })

  it('returns true for empty string', () => {
    expect(isEmpty('')).toBe(true)
  })

  it('returns true for whitespace-only string', () => {
    expect(isEmpty('   ')).toBe(true)
    expect(isEmpty('\t\n')).toBe(true)
  })

  it('returns true for empty array', () => {
    expect(isEmpty([])).toBe(true)
  })

  it('returns false for non-empty string', () => {
    expect(isEmpty('hello')).toBe(false)
  })

  it('returns false for non-empty array', () => {
    expect(isEmpty([1, 2, 3])).toBe(false)
  })

  it('returns false for zero', () => {
    expect(isEmpty(0)).toBe(false)
  })

  it('returns false for false', () => {
    expect(isEmpty(false)).toBe(false)
  })

  it('returns false for empty object', () => {
    // Empty objects are not considered empty for merge purposes
    expect(isEmpty({})).toBe(false)
  })
})

describe('getNestedValue', () => {
  it('gets a top-level value', () => {
    const obj = { name: 'John' }
    expect(getNestedValue(obj, 'name')).toBe('John')
  })

  it('gets a nested value', () => {
    const obj = { address: { city: 'New York' } }
    expect(getNestedValue(obj, 'address.city')).toBe('New York')
  })

  it('gets a deeply nested value', () => {
    const obj = { level1: { level2: { level3: 'deep' } } }
    expect(getNestedValue(obj, 'level1.level2.level3')).toBe('deep')
  })

  it('returns undefined for missing path', () => {
    const obj = { name: 'John' }
    expect(getNestedValue(obj, 'missing')).toBeUndefined()
  })

  it('returns undefined for missing nested path', () => {
    const obj = { address: { city: 'New York' } }
    expect(getNestedValue(obj, 'address.country')).toBeUndefined()
  })

  it('returns undefined for null in path', () => {
    const obj = { address: null }
    expect(getNestedValue(obj as Record<string, unknown>, 'address.city')).toBeUndefined()
  })

  it('handles arrays', () => {
    const obj = { items: ['a', 'b', 'c'] }
    expect(getNestedValue(obj, 'items')).toEqual(['a', 'b', 'c'])
  })

  it('handles primitive in path', () => {
    const obj = { name: 'John' }
    expect(getNestedValue(obj, 'name.length')).toBeUndefined()
  })
})

describe('setNestedValue', () => {
  it('sets a top-level value', () => {
    const obj: Record<string, unknown> = {}
    setNestedValue(obj, 'name', 'John')
    expect(obj.name).toBe('John')
  })

  it('sets a nested value', () => {
    const obj: Record<string, unknown> = {}
    setNestedValue(obj, 'address.city', 'New York')
    expect((obj.address as Record<string, unknown>).city).toBe('New York')
  })

  it('sets a deeply nested value', () => {
    const obj: Record<string, unknown> = {}
    setNestedValue(obj, 'level1.level2.level3', 'deep')
    expect(
      ((obj.level1 as Record<string, unknown>).level2 as Record<string, unknown>).level3,
    ).toBe('deep')
  })

  it('creates intermediate objects', () => {
    const obj: Record<string, unknown> = {}
    setNestedValue(obj, 'a.b.c', 'value')
    expect(obj.a).toBeTypeOf('object')
    expect((obj.a as Record<string, unknown>).b).toBeTypeOf('object')
  })

  it('overwrites existing values', () => {
    const obj: Record<string, unknown> = { name: 'John' }
    setNestedValue(obj, 'name', 'Jane')
    expect(obj.name).toBe('Jane')
  })

  it('overwrites intermediate non-objects', () => {
    const obj: Record<string, unknown> = { address: 'string-value' }
    setNestedValue(obj, 'address.city', 'New York')
    expect((obj.address as Record<string, unknown>).city).toBe('New York')
  })

  it('handles null intermediate values', () => {
    const obj: Record<string, unknown> = { address: null }
    setNestedValue(obj, 'address.city', 'New York')
    expect((obj.address as Record<string, unknown>).city).toBe('New York')
  })
})
