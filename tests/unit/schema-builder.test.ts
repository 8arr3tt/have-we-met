import { describe, it, expect } from 'vitest'
import { SchemaBuilder } from '../../src/builder/schema-builder'
import type { FieldDefinition, SchemaDefinition } from '../../src/types'

interface TestPerson {
  firstName: string
  lastName: string
  email: string
  phone?: string
  age?: number
}

describe('SchemaBuilder', () => {
  describe('field', () => {
    it('adds a field to the schema', () => {
      const builder = new SchemaBuilder<TestPerson>()
      builder.field('firstName', { type: 'name', component: 'first' })

      const schema = builder.build()

      expect(schema.firstName).toBeDefined()
      expect(schema.firstName?.type).toBe('name')
      expect(schema.firstName?.component).toBe('first')
    })

    it('supports method chaining', () => {
      const builder = new SchemaBuilder<TestPerson>()
      const result = builder.field('firstName', { type: 'name' })

      expect(result).toBe(builder)
    })

    it('adds multiple fields via chaining', () => {
      const builder = new SchemaBuilder<TestPerson>()
      builder
        .field('firstName', { type: 'name', component: 'first' })
        .field('lastName', { type: 'name', component: 'last' })
        .field('email', { type: 'email' })

      const schema = builder.build()

      expect(schema.firstName?.type).toBe('name')
      expect(schema.lastName?.type).toBe('name')
      expect(schema.email?.type).toBe('email')
    })

    it('adds field with all configuration options', () => {
      const normalizer = (value: unknown) => value
      const builder = new SchemaBuilder<TestPerson>()
      builder.field('firstName', {
        type: 'name',
        component: 'first',
        required: true,
        normalizer: 'lowercase',
        customNormalizer: normalizer,
      })

      const schema = builder.build()

      expect(schema.firstName?.type).toBe('name')
      expect(schema.firstName?.component).toBe('first')
      expect(schema.firstName?.required).toBe(true)
      expect(schema.firstName?.normalizer).toBe('lowercase')
      expect(schema.firstName?.customNormalizer).toBe(normalizer)
    })

    it('overwrites field if defined multiple times', () => {
      const builder = new SchemaBuilder<TestPerson>()
      builder
        .field('firstName', { type: 'string' })
        .field('firstName', { type: 'name', component: 'first' })

      const schema = builder.build()

      expect(schema.firstName?.type).toBe('name')
      expect(schema.firstName?.component).toBe('first')
    })
  })

  describe('build', () => {
    it('returns an empty schema when no fields are defined', () => {
      const builder = new SchemaBuilder<TestPerson>()
      const schema = builder.build()

      expect(schema).toEqual({})
    })

    it('returns a complete schema definition', () => {
      const builder = new SchemaBuilder<TestPerson>()
      builder
        .field('firstName', { type: 'name', component: 'first' })
        .field('lastName', { type: 'name', component: 'last' })
        .field('email', { type: 'email' })

      const schema = builder.build()

      expect(Object.keys(schema)).toHaveLength(3)
      expect(schema.firstName).toBeDefined()
      expect(schema.lastName).toBeDefined()
      expect(schema.email).toBeDefined()
    })

    it('returns a new object each time (immutability)', () => {
      const builder = new SchemaBuilder<TestPerson>()
      builder.field('firstName', { type: 'name' })

      const schema1 = builder.build()
      const schema2 = builder.build()

      expect(schema1).not.toBe(schema2)
      expect(schema1).toEqual(schema2)
    })

    it('does not mutate built schema when builder is modified', () => {
      const builder = new SchemaBuilder<TestPerson>()
      builder.field('firstName', { type: 'name' })

      const schema1 = builder.build()

      builder.field('lastName', { type: 'name' })
      const schema2 = builder.build()

      expect(Object.keys(schema1)).toHaveLength(1)
      expect(Object.keys(schema2)).toHaveLength(2)
    })
  })

  describe('type safety', () => {
    it('allows valid field names from type', () => {
      const builder = new SchemaBuilder<TestPerson>()
      builder.field('firstName', { type: 'name' })
      builder.field('lastName', { type: 'name' })
      builder.field('email', { type: 'email' })
      builder.field('phone', { type: 'phone' })
      builder.field('age', { type: 'number' })

      const schema = builder.build()

      expect(schema.firstName).toBeDefined()
      expect(schema.lastName).toBeDefined()
      expect(schema.email).toBeDefined()
      expect(schema.phone).toBeDefined()
      expect(schema.age).toBeDefined()
    })
  })

  describe('all field types', () => {
    it('supports string type', () => {
      const builder = new SchemaBuilder<{ name: string }>()
      builder.field('name', { type: 'string' })

      const schema = builder.build()
      expect(schema.name?.type).toBe('string')
    })

    it('supports name type', () => {
      const builder = new SchemaBuilder<{ name: string }>()
      builder.field('name', { type: 'name' })

      const schema = builder.build()
      expect(schema.name?.type).toBe('name')
    })

    it('supports email type', () => {
      const builder = new SchemaBuilder<{ email: string }>()
      builder.field('email', { type: 'email' })

      const schema = builder.build()
      expect(schema.email?.type).toBe('email')
    })

    it('supports phone type', () => {
      const builder = new SchemaBuilder<{ phone: string }>()
      builder.field('phone', { type: 'phone' })

      const schema = builder.build()
      expect(schema.phone?.type).toBe('phone')
    })

    it('supports date type', () => {
      const builder = new SchemaBuilder<{ dob: Date }>()
      builder.field('dob', { type: 'date' })

      const schema = builder.build()
      expect(schema.dob?.type).toBe('date')
    })

    it('supports address type', () => {
      const builder = new SchemaBuilder<{ address: string }>()
      builder.field('address', { type: 'address' })

      const schema = builder.build()
      expect(schema.address?.type).toBe('address')
    })

    it('supports number type', () => {
      const builder = new SchemaBuilder<{ age: number }>()
      builder.field('age', { type: 'number' })

      const schema = builder.build()
      expect(schema.age?.type).toBe('number')
    })

    it('supports custom type', () => {
      const builder = new SchemaBuilder<{ custom: any }>()
      builder.field('custom', { type: 'custom' })

      const schema = builder.build()
      expect(schema.custom?.type).toBe('custom')
    })
  })

  describe('practical usage', () => {
    it('works with realistic person schema', () => {
      const builder = new SchemaBuilder<TestPerson>()
      const schema = builder
        .field('firstName', {
          type: 'name',
          component: 'first',
          required: true,
        })
        .field('lastName', {
          type: 'name',
          component: 'last',
          required: true,
        })
        .field('email', {
          type: 'email',
          required: true,
        })
        .field('phone', {
          type: 'phone',
          required: false,
        })
        .field('age', {
          type: 'number',
        })
        .build()

      expect(schema.firstName?.type).toBe('name')
      expect(schema.firstName?.required).toBe(true)
      expect(schema.lastName?.type).toBe('name')
      expect(schema.email?.type).toBe('email')
      expect(schema.phone?.type).toBe('phone')
      expect(schema.phone?.required).toBe(false)
      expect(schema.age?.type).toBe('number')
    })
  })
})
