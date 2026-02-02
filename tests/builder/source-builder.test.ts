import { describe, it, expect } from 'vitest'
import {
  SourceBuilder,
  FieldMappingBuilder,
  createSourceBuilder,
} from '../../src/builder/source-builder'
import type { DatabaseAdapter } from '../../src/adapters/types'

// Mock adapter factory
function createMockAdapter<T>(_name: string): DatabaseAdapter<T> {
  return {
    findAll: async () => [],
    findById: async () => undefined,
    create: async (record) => record,
    update: async (id, record) => record,
    delete: async () => {},
    count: async () => 0,
    findByBlockingKey: async () => [],
  } as DatabaseAdapter<T>
}

// Test types
interface LegacyCustomer {
  email_address: string
  first_name: string
  last_name: string
  phone_number: string
  age_str: string
  address: {
    city: string
    state: string
  }
}

interface Customer {
  email: string
  firstName: string
  lastName: string
  phone: string
  fullName: string
  age: number
  city: string
}

describe('SourceBuilder', () => {
  describe('basic configuration', () => {
    it('should build a source with required fields', () => {
      const adapter = createMockAdapter<LegacyCustomer>('legacy')

      const source = new SourceBuilder<LegacyCustomer, Customer>('legacy')
        .name('Legacy Database')
        .adapter(adapter)
        .mapping((map) =>
          map
            .field('email')
            .from('email_address')
            .field('firstName')
            .from('first_name')
            .field('lastName')
            .from('last_name')
            .field('phone')
            .from('phone_number')
            .field('fullName')
            .transform((input) => `${input.first_name} ${input.last_name}`)
            .field('age')
            .from('age_str')
            .field('city')
            .from('address.city')
        )
        .build()

      expect(source.sourceId).toBe('legacy')
      expect(source.name).toBe('Legacy Database')
      expect(source.adapter).toBe(adapter)
      expect(source.mapping).toBeDefined()
    })

    it('should throw if sourceId is empty', () => {
      expect(() => {
        new SourceBuilder<LegacyCustomer, Customer>('')
      }).toThrow('sourceId')
    })

    it('should throw if name is not set', () => {
      const adapter = createMockAdapter<LegacyCustomer>('legacy')

      expect(() => {
        new SourceBuilder<LegacyCustomer, Customer>('legacy')
          .adapter(adapter)
          .mapping((map) => map.field('email').from('email_address'))
          .build()
      }).toThrow("name is required for source 'legacy'")
    })

    it('should throw if adapter is not set', () => {
      expect(() => {
        new SourceBuilder<LegacyCustomer, Customer>('legacy')
          .name('Legacy')
          .mapping((map) => map.field('email').from('email_address'))
          .build()
      }).toThrow("adapter is required for source 'legacy'")
    })

    it('should throw if mapping is not set', () => {
      const adapter = createMockAdapter<LegacyCustomer>('legacy')

      expect(() => {
        new SourceBuilder<LegacyCustomer, Customer>('legacy')
          .name('Legacy')
          .adapter(adapter)
          .build()
      }).toThrow("mapping is required for source 'legacy'")
    })
  })

  describe('priority', () => {
    it('should default to 0', () => {
      const adapter = createMockAdapter<LegacyCustomer>('legacy')

      const source = new SourceBuilder<LegacyCustomer, Customer>('legacy')
        .name('Legacy')
        .adapter(adapter)
        .mapping((map) => map.field('email').from('email_address'))
        .build()

      expect(source.priority).toBe(0)
    })

    it('should set custom priority', () => {
      const adapter = createMockAdapter<LegacyCustomer>('legacy')

      const source = new SourceBuilder<LegacyCustomer, Customer>('legacy')
        .name('Legacy')
        .adapter(adapter)
        .mapping((map) => map.field('email').from('email_address'))
        .priority(5)
        .build()

      expect(source.priority).toBe(5)
    })

    it('should accept negative priority', () => {
      const adapter = createMockAdapter<LegacyCustomer>('legacy')

      const source = new SourceBuilder<LegacyCustomer, Customer>('legacy')
        .name('Legacy')
        .adapter(adapter)
        .mapping((map) => map.field('email').from('email_address'))
        .priority(-1)
        .build()

      expect(source.priority).toBe(-1)
    })
  })

  describe('metadata', () => {
    it('should default to empty object', () => {
      const adapter = createMockAdapter<LegacyCustomer>('legacy')

      const source = new SourceBuilder<LegacyCustomer, Customer>('legacy')
        .name('Legacy')
        .adapter(adapter)
        .mapping((map) => map.field('email').from('email_address'))
        .build()

      expect(source.metadata).toEqual({})
    })

    it('should set custom metadata', () => {
      const adapter = createMockAdapter<LegacyCustomer>('legacy')

      const source = new SourceBuilder<LegacyCustomer, Customer>('legacy')
        .name('Legacy')
        .adapter(adapter)
        .mapping((map) => map.field('email').from('email_address'))
        .metadata({ region: 'US', vintage: '2020' })
        .build()

      expect(source.metadata).toEqual({ region: 'US', vintage: '2020' })
    })

    it('should throw if metadata is not an object', () => {
      const adapter = createMockAdapter<LegacyCustomer>('legacy')

      expect(() => {
        new SourceBuilder<LegacyCustomer, Customer>('legacy')
          .name('Legacy')
          .adapter(adapter)
          .mapping((map) => map.field('email').from('email_address'))
          // @ts-expect-error Testing invalid input
          .metadata('not-an-object')
      }).toThrow('metadata')
    })
  })

  describe('fluent API', () => {
    it('should support method chaining', () => {
      const adapter = createMockAdapter<LegacyCustomer>('legacy')

      const source = new SourceBuilder<LegacyCustomer, Customer>('legacy')
        .name('Legacy Database')
        .adapter(adapter)
        .priority(2)
        .metadata({ region: 'US' })
        .mapping((map) =>
          map
            .field('email')
            .from('email_address')
            .field('firstName')
            .from('first_name')
            .field('lastName')
            .from('last_name')
            .field('phone')
            .from('phone_number')
            .field('fullName')
            .transform((input) => `${input.first_name} ${input.last_name}`)
            .field('age')
            .from('age_str')
            .field('city')
            .from('address.city')
        )
        .build()

      expect(source).toBeDefined()
      expect(source.sourceId).toBe('legacy')
      expect(source.priority).toBe(2)
      expect(source.metadata.region).toBe('US')
    })

    it('should support builder returned from mapping', () => {
      const adapter = createMockAdapter<LegacyCustomer>('legacy')

      const source = new SourceBuilder<LegacyCustomer, Customer>('legacy')
        .name('Legacy')
        .adapter(adapter)
        .mapping((map) => {
          map.field('email').from('email_address')
          return map
        })
        .build()

      expect(source.mapping.email).toBeDefined()
    })
  })

  describe('createSourceBuilder factory', () => {
    it('should create a builder instance', () => {
      const builder = createSourceBuilder<LegacyCustomer, Customer>('legacy')
      expect(builder).toBeInstanceOf(SourceBuilder)
    })

    it('should create functional builder', () => {
      const adapter = createMockAdapter<LegacyCustomer>('legacy')

      const source = createSourceBuilder<LegacyCustomer, Customer>('legacy')
        .name('Legacy')
        .adapter(adapter)
        .mapping((map) => map.field('email').from('email_address'))
        .build()

      expect(source.sourceId).toBe('legacy')
    })
  })
})

describe('FieldMappingBuilder', () => {
  describe('static field mapping', () => {
    it('should map fields with from()', () => {
      const mapping = new FieldMappingBuilder<LegacyCustomer, Customer>()
        .field('email')
        .from('email_address')
        .field('firstName')
        .from('first_name')
        .field('lastName')
        .from('last_name')
        .build()

      expect(mapping.email).toBeDefined()
      expect(mapping.email!.sourceField).toBe('email_address')
      expect(mapping.firstName!.sourceField).toBe('first_name')
      expect(mapping.lastName!.sourceField).toBe('last_name')
    })

    it('should support nested field paths', () => {
      const mapping = new FieldMappingBuilder<LegacyCustomer, Customer>()
        .field('city')
        .from('address.city')
        .build()

      expect(mapping.city!.sourceField).toBe('address.city')
    })

    it('should throw if field name is empty', () => {
      expect(() => {
        new FieldMappingBuilder<LegacyCustomer, Customer>()
          // @ts-expect-error Testing invalid input
          .field('')
          .from('email')
      }).toThrow('fieldName')
    })

    it('should throw if from() called without field()', () => {
      expect(() => {
        new FieldMappingBuilder<LegacyCustomer, Customer>()
          // @ts-expect-error Testing invalid usage
          .from('email')
      }).toThrow('Must call field() before from()')
    })

    it('should throw if sourceField is empty', () => {
      expect(() => {
        new FieldMappingBuilder<LegacyCustomer, Customer>()
          .field('email')
          .from('')
      }).toThrow('sourceField')
    })
  })

  describe('transform functions', () => {
    it('should map fields with transform()', () => {
      const mapping = new FieldMappingBuilder<LegacyCustomer, Customer>()
        .field('fullName')
        .transform((input) => `${input.first_name} ${input.last_name}`)
        .build()

      expect(mapping.fullName).toBeDefined()
      expect(mapping.fullName!.transform).toBeDefined()
      expect(typeof mapping.fullName!.transform).toBe('function')
    })

    it('should execute transform function correctly', () => {
      const mapping = new FieldMappingBuilder<LegacyCustomer, Customer>()
        .field('fullName')
        .transform((input) => `${input.first_name} ${input.last_name}`)
        .build()

      const input: LegacyCustomer = {
        email_address: 'test@example.com',
        first_name: 'John',
        last_name: 'Doe',
        phone_number: '1234567890',
        age_str: '30',
        address: { city: 'NYC', state: 'NY' },
      }

      const result = mapping.fullName!.transform!(input, 'fullName')
      expect(result).toBe('John Doe')
    })

    it('should throw if transform() called without field()', () => {
      expect(() => {
        new FieldMappingBuilder<LegacyCustomer, Customer>()
          // @ts-expect-error Testing invalid usage
          .transform(() => 'test')
      }).toThrow('Must call field() before transform()')
    })

    it('should throw if transform is not a function', () => {
      expect(() => {
        new FieldMappingBuilder<LegacyCustomer, Customer>()
          // @ts-expect-error Testing invalid input
          .field('fullName')
          .transform('not-a-function')
      }).toThrow('transform')
    })
  })

  describe('mutual exclusivity', () => {
    it('should throw if both from() and transform() used', () => {
      expect(() => {
        new FieldMappingBuilder<LegacyCustomer, Customer>()
          .field('email')
          .from('email_address')
          // @ts-expect-error Testing invalid usage
          .transform(() => 'test')
      }).toThrow("Cannot use both from() and transform() for field 'email'")
    })

    it('should throw if transform() then from()', () => {
      expect(() => {
        new FieldMappingBuilder<LegacyCustomer, Customer>()
          .field('email')
          .transform(() => 'test')
          .from('email_address')
      }).toThrow("Cannot use both from() and transform() for field 'email'")
    })
  })

  describe('type coercion', () => {
    it('should set coerce for number', () => {
      const mapping = new FieldMappingBuilder<LegacyCustomer, Customer>()
        .field('age')
        .from('age_str')
        .coerce('number')
        .build()

      expect(mapping.age!.coerce).toBe('number')
    })

    it('should set coerce for string', () => {
      const mapping = new FieldMappingBuilder<LegacyCustomer, Customer>()
        .field('email')
        .from('email_address')
        .coerce('string')
        .build()

      expect(mapping.email!.coerce).toBe('string')
    })

    it('should accept all valid coercion types', () => {
      const types = ['string', 'number', 'boolean', 'date'] as const

      for (const type of types) {
        const mapping = new FieldMappingBuilder<LegacyCustomer, Customer>()
          .field('email')
          .from('email_address')
          .coerce(type)
          .build()

        expect(mapping.email!.coerce).toBe(type)
      }
    })

    it('should throw if coerce() called without field()', () => {
      expect(() => {
        new FieldMappingBuilder<LegacyCustomer, Customer>()
          // @ts-expect-error Testing invalid usage
          .coerce('number')
      }).toThrow('Must call field() before coerce()')
    })

    it('should throw on invalid coercion type', () => {
      expect(() => {
        new FieldMappingBuilder<LegacyCustomer, Customer>()
          // @ts-expect-error Testing invalid input
          .field('age')
          .from('age_str')
          .coerce('invalid-type')
      }).toThrow()
    })
  })

  describe('required fields', () => {
    it('should mark field as required', () => {
      const mapping = new FieldMappingBuilder<LegacyCustomer, Customer>()
        .field('email')
        .from('email_address')
        .required()
        .build()

      expect(mapping.email!.required).toBe(true)
    })

    it('should mark field as not required', () => {
      const mapping = new FieldMappingBuilder<LegacyCustomer, Customer>()
        .field('email')
        .from('email_address')
        .required(false)
        .build()

      expect(mapping.email!.required).toBe(false)
    })

    it('should default to undefined if not specified', () => {
      const mapping = new FieldMappingBuilder<LegacyCustomer, Customer>()
        .field('email')
        .from('email_address')
        .build()

      expect(mapping.email!.required).toBeUndefined()
    })

    it('should throw if required() called without field()', () => {
      expect(() => {
        new FieldMappingBuilder<LegacyCustomer, Customer>()
          // @ts-expect-error Testing invalid usage
          .required()
      }).toThrow('Must call field() before required()')
    })
  })

  describe('validation', () => {
    it('should throw if field has neither from() nor transform()', () => {
      expect(() => {
        new FieldMappingBuilder<LegacyCustomer, Customer>()
          .field('email')
          .build()
      }).toThrow("Field 'email' must have either from() or transform()")
    })

    it('should not throw if all fields have mapping', () => {
      expect(() => {
        new FieldMappingBuilder<LegacyCustomer, Customer>()
          .field('email')
          .from('email_address')
          .field('firstName')
          .from('first_name')
          .field('fullName')
          .transform((input) => `${input.first_name} ${input.last_name}`)
          .build()
      }).not.toThrow()
    })
  })

  describe('fluent API', () => {
    it('should support method chaining', () => {
      const mapping = new FieldMappingBuilder<LegacyCustomer, Customer>()
        .field('email')
        .from('email_address')
        .required()
        .field('firstName')
        .from('first_name')
        .required()
        .field('lastName')
        .from('last_name')
        .field('phone')
        .from('phone_number')
        .field('fullName')
        .transform((input) => `${input.first_name} ${input.last_name}`)
        .field('age')
        .from('age_str')
        .coerce('number')
        .field('city')
        .from('address.city')
        .build()

      expect(Object.keys(mapping)).toHaveLength(7)
      expect(mapping.email!.required).toBe(true)
      expect(mapping.firstName!.required).toBe(true)
      expect(mapping.fullName!.transform).toBeDefined()
      expect(mapping.age!.coerce).toBe('number')
    })

    it('should allow configuring same field multiple times (last wins)', () => {
      const mapping = new FieldMappingBuilder<LegacyCustomer, Customer>()
        .field('email')
        .from('old_field')
        .field('email')
        .from('email_address')
        .required()
        .build()

      expect(mapping.email!.sourceField).toBe('email_address')
      expect(mapping.email!.required).toBe(true)
    })
  })
})
