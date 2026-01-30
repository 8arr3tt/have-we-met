import { describe, it, expect } from 'vitest'
import {
  MatchingBuilder,
  FieldMatchBuilder,
} from '../../src/builder/matching-builder'
import type { MatchingConfig, FieldMatchConfig } from '../../src/types'

describe('FieldMatchBuilder', () => {
  describe('strategy', () => {
    it('sets the matching strategy', () => {
      const builder = new MatchingBuilder()
      const fieldBuilder = builder.field('email')

      fieldBuilder.strategy('fuzzy')
      const config = fieldBuilder.getConfig()

      expect(config.strategy).toBe('fuzzy')
    })

    it('supports method chaining', () => {
      const builder = new MatchingBuilder()
      const fieldBuilder = builder.field('email')

      const result = fieldBuilder.strategy('exact')
      expect(result).toBe(fieldBuilder)
    })
  })

  describe('weight', () => {
    it('sets the field weight', () => {
      const builder = new MatchingBuilder()
      const fieldBuilder = builder.field('email')

      fieldBuilder.weight(50)
      const config = fieldBuilder.getConfig()

      expect(config.weight).toBe(50)
    })

    it('supports method chaining', () => {
      const builder = new MatchingBuilder()
      const fieldBuilder = builder.field('email')

      const result = fieldBuilder.weight(100)
      expect(result).toBe(fieldBuilder)
    })
  })

  describe('threshold', () => {
    it('sets the field threshold', () => {
      const builder = new MatchingBuilder()
      const fieldBuilder = builder.field('email')

      fieldBuilder.threshold(0.8)
      const config = fieldBuilder.getConfig()

      expect(config.threshold).toBe(0.8)
    })

    it('supports method chaining', () => {
      const builder = new MatchingBuilder()
      const fieldBuilder = builder.field('email')

      const result = fieldBuilder.threshold(0.9)
      expect(result).toBe(fieldBuilder)
    })
  })

  describe('caseSensitive', () => {
    it('sets the case sensitivity', () => {
      const builder = new MatchingBuilder()
      const fieldBuilder = builder.field('email')

      fieldBuilder.caseSensitive(false)
      const config = fieldBuilder.getConfig()

      expect(config.caseSensitive).toBe(false)
    })

    it('supports method chaining', () => {
      const builder = new MatchingBuilder()
      const fieldBuilder = builder.field('email')

      const result = fieldBuilder.caseSensitive(true)
      expect(result).toBe(fieldBuilder)
    })
  })

  describe('field chaining', () => {
    it('chains all configuration methods', () => {
      const builder = new MatchingBuilder()
      const fieldBuilder = builder
        .field('email')
        .strategy('fuzzy')
        .weight(50)
        .threshold(0.8)
        .caseSensitive(false)

      const config = fieldBuilder.getConfig()

      expect(config.strategy).toBe('fuzzy')
      expect(config.weight).toBe(50)
      expect(config.threshold).toBe(0.8)
      expect(config.caseSensitive).toBe(false)
    })

    it('chains to another field using .field()', () => {
      const builder = new MatchingBuilder()
      const firstNameBuilder = builder
        .field('email')
        .strategy('exact')
        .weight(50)
        .field('firstName')

      expect(firstNameBuilder).toBeInstanceOf(FieldMatchBuilder)

      const matchingConfig = firstNameBuilder.weight(25).build()

      expect(matchingConfig.fields.get('email')?.weight).toBe(50)
      expect(matchingConfig.fields.get('firstName')?.weight).toBe(25)
    })

    it('chains to thresholds using .thresholds()', () => {
      const builder = new MatchingBuilder()
      const result = builder
        .field('email')
        .strategy('exact')
        .weight(100)
        .thresholds({ noMatch: 30, definiteMatch: 90 })

      expect(result).toBeInstanceOf(MatchingBuilder)

      const config = result.build()
      expect(config.fields.get('email')?.weight).toBe(100)
      expect(config.thresholds.noMatch).toBe(30)
      expect(config.thresholds.definiteMatch).toBe(90)
    })

    it('chains to build using .build()', () => {
      const builder = new MatchingBuilder()
      const config = builder
        .field('email')
        .strategy('exact')
        .weight(100)
        .build()

      expect(config).toHaveProperty('fields')
      expect(config).toHaveProperty('thresholds')
      expect(config.fields.get('email')?.weight).toBe(100)
    })
  })

  describe('default values', () => {
    it('has default strategy of "exact"', () => {
      const builder = new MatchingBuilder()
      const fieldBuilder = builder.field('email')

      const config = fieldBuilder.getConfig()
      expect(config.strategy).toBe('exact')
    })

    it('has default weight of 1', () => {
      const builder = new MatchingBuilder()
      const fieldBuilder = builder.field('email')

      const config = fieldBuilder.getConfig()
      expect(config.weight).toBe(1)
    })

    it('has no default threshold', () => {
      const builder = new MatchingBuilder()
      const fieldBuilder = builder.field('email')

      const config = fieldBuilder.getConfig()
      expect(config.threshold).toBeUndefined()
    })

    it('has no default caseSensitive', () => {
      const builder = new MatchingBuilder()
      const fieldBuilder = builder.field('email')

      const config = fieldBuilder.getConfig()
      expect(config.caseSensitive).toBeUndefined()
    })
  })
})

describe('MatchingBuilder', () => {
  describe('field', () => {
    it('returns a FieldMatchBuilder', () => {
      const builder = new MatchingBuilder()
      const fieldBuilder = builder.field('email')

      expect(fieldBuilder).toBeInstanceOf(FieldMatchBuilder)
    })

    it('creates multiple field builders', () => {
      const builder = new MatchingBuilder()
      const config = builder
        .field('email')
        .weight(50)
        .field('firstName')
        .weight(25)
        .field('lastName')
        .weight(25)
        .build()

      expect(config.fields.size).toBe(3)
      expect(config.fields.get('email')?.weight).toBe(50)
      expect(config.fields.get('firstName')?.weight).toBe(25)
      expect(config.fields.get('lastName')?.weight).toBe(25)
    })
  })

  describe('thresholds', () => {
    it('sets threshold configuration', () => {
      const builder = new MatchingBuilder()
      builder.thresholds({ noMatch: 30, definiteMatch: 90 })

      const config = builder.build()

      expect(config.thresholds.noMatch).toBe(30)
      expect(config.thresholds.definiteMatch).toBe(90)
    })

    it('supports method chaining', () => {
      const builder = new MatchingBuilder()
      const result = builder.thresholds({ noMatch: 30, definiteMatch: 90 })

      expect(result).toBe(builder)
    })

    it('can be chained with field configuration', () => {
      const builder = new MatchingBuilder()
      const config = builder
        .field('email')
        .weight(100)
        .thresholds({ noMatch: 25, definiteMatch: 85 })
        .build()

      expect(config.fields.get('email')?.weight).toBe(100)
      expect(config.thresholds.noMatch).toBe(25)
      expect(config.thresholds.definiteMatch).toBe(85)
    })

    it('has default thresholds', () => {
      const builder = new MatchingBuilder()
      const config = builder.build()

      expect(config.thresholds.noMatch).toBe(20)
      expect(config.thresholds.definiteMatch).toBe(80)
    })
  })

  describe('build', () => {
    it('returns a MatchingConfig with fields and thresholds', () => {
      const builder = new MatchingBuilder()
      const config = builder
        .field('email')
        .strategy('exact')
        .weight(50)
        .field('firstName')
        .strategy('fuzzy')
        .weight(25)
        .thresholds({ noMatch: 30, definiteMatch: 90 })
        .build()

      expect(config.fields).toBeInstanceOf(Map)
      expect(config.fields.size).toBe(2)
      expect(config.thresholds).toEqual({ noMatch: 30, definiteMatch: 90 })
    })

    it('returns empty fields when no fields configured', () => {
      const builder = new MatchingBuilder()
      const config = builder.build()

      expect(config.fields.size).toBe(0)
    })

    it('returns immutable field map (new Map instance)', () => {
      const builder = new MatchingBuilder()
      builder.field('email').weight(50).build()

      const config1 = builder.build()
      const config2 = builder.build()

      expect(config1.fields).not.toBe(config2.fields)
      expect(config1.fields).toEqual(config2.fields)
    })

    it('returns immutable threshold config (new object)', () => {
      const builder = new MatchingBuilder()
      const config1 = builder.build()
      const config2 = builder.build()

      expect(config1.thresholds).not.toBe(config2.thresholds)
      expect(config1.thresholds).toEqual(config2.thresholds)
    })
  })

  describe('field overwriting', () => {
    it('overwrites field if configured multiple times', () => {
      const builder = new MatchingBuilder()
      const config = builder
        .field('email')
        .weight(50)
        .field('email')
        .weight(100)
        .build()

      expect(config.fields.size).toBe(1)
      expect(config.fields.get('email')?.weight).toBe(100)
    })
  })

  describe('practical usage', () => {
    it('configures a complete matching setup', () => {
      const builder = new MatchingBuilder()
      const config = builder
        .field('email')
        .strategy('exact')
        .weight(50)
        .caseSensitive(false)
        .field('firstName')
        .strategy('fuzzy')
        .weight(25)
        .threshold(0.8)
        .field('lastName')
        .strategy('fuzzy')
        .weight(25)
        .threshold(0.8)
        .thresholds({ noMatch: 20, definiteMatch: 75 })
        .build()

      expect(config.fields.size).toBe(3)

      const emailConfig = config.fields.get('email')
      expect(emailConfig?.strategy).toBe('exact')
      expect(emailConfig?.weight).toBe(50)
      expect(emailConfig?.caseSensitive).toBe(false)

      const firstNameConfig = config.fields.get('firstName')
      expect(firstNameConfig?.strategy).toBe('fuzzy')
      expect(firstNameConfig?.weight).toBe(25)
      expect(firstNameConfig?.threshold).toBe(0.8)

      const lastNameConfig = config.fields.get('lastName')
      expect(lastNameConfig?.strategy).toBe('fuzzy')
      expect(lastNameConfig?.weight).toBe(25)
      expect(lastNameConfig?.threshold).toBe(0.8)

      expect(config.thresholds.noMatch).toBe(20)
      expect(config.thresholds.definiteMatch).toBe(75)
    })
  })
})
