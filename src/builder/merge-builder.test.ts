import { describe, it, expect } from 'vitest'
import {
  MergeBuilder,
  FieldMergeBuilder,
  MergeBuilderError,
  createMergeBuilder,
} from './merge-builder.js'
import type { SourceRecord } from '../merge/types.js'
import type { SchemaDefinition } from '../types/schema.js'

interface TestPerson extends Record<string, unknown> {
  firstName: string
  lastName: string
  email: string
  phone: string
  age: number
  addresses: string[]
  createdAt: Date
  updatedAt: Date
}

const testSchema: SchemaDefinition<TestPerson> = {
  firstName: { type: 'name', component: 'first' },
  lastName: { type: 'name', component: 'last' },
  email: { type: 'email' },
  phone: { type: 'phone' },
  age: { type: 'number' },
  addresses: { type: 'string' },
  createdAt: { type: 'date' },
  updatedAt: { type: 'date' },
}

describe('MergeBuilder', () => {
  describe('defaultStrategy', () => {
    it('sets default merge strategy', () => {
      const builder = new MergeBuilder<TestPerson>()
      builder.defaultStrategy('preferFirst')

      const config = builder.build()

      expect(config.defaultStrategy).toBe('preferFirst')
    })

    it('defaults to preferNonNull', () => {
      const builder = new MergeBuilder<TestPerson>()

      const config = builder.build()

      expect(config.defaultStrategy).toBe('preferNonNull')
    })

    it('throws error for invalid strategy', () => {
      const builder = new MergeBuilder<TestPerson>()

      expect(() => {
        builder.defaultStrategy('invalidStrategy' as never)
      }).toThrow(MergeBuilderError)
      expect(() => {
        builder.defaultStrategy('invalidStrategy' as never)
      }).toThrow(/Invalid merge strategy/)
    })

    it('supports all valid strategies', () => {
      const strategies = [
        'preferFirst',
        'preferLast',
        'preferNewer',
        'preferOlder',
        'preferNonNull',
        'preferLonger',
        'preferShorter',
        'concatenate',
        'union',
        'mostFrequent',
        'average',
        'sum',
        'min',
        'max',
        'custom',
      ] as const

      for (const strategy of strategies) {
        const builder = new MergeBuilder<TestPerson>()
        builder.defaultStrategy(strategy)
        const config = builder.build()
        expect(config.defaultStrategy).toBe(strategy)
      }
    })
  })

  describe('timestampField', () => {
    it('sets timestamp field', () => {
      const builder = new MergeBuilder<TestPerson>()
      builder.timestampField('updatedAt')

      const config = builder.build()

      expect(config.timestampField).toBe('updatedAt')
    })

    it('accepts string field path', () => {
      const builder = new MergeBuilder<TestPerson>()
      builder.timestampField('createdAt')

      const config = builder.build()

      expect(config.timestampField).toBe('createdAt')
    })
  })

  describe('trackProvenance', () => {
    it('enables provenance tracking by default', () => {
      const builder = new MergeBuilder<TestPerson>()

      const config = builder.build()

      expect(config.trackProvenance).toBe(true)
    })

    it('disables provenance tracking when set to false', () => {
      const builder = new MergeBuilder<TestPerson>()
      builder.trackProvenance(false)

      const config = builder.build()

      expect(config.trackProvenance).toBe(false)
    })

    it('enables provenance tracking when set to true', () => {
      const builder = new MergeBuilder<TestPerson>()
      builder.trackProvenance(false).trackProvenance(true)

      const config = builder.build()

      expect(config.trackProvenance).toBe(true)
    })
  })

  describe('onConflict', () => {
    it('sets conflict resolution mode to useDefault by default', () => {
      const builder = new MergeBuilder<TestPerson>()

      const config = builder.build()

      expect(config.conflictResolution).toBe('useDefault')
    })

    it('sets conflict resolution mode to error', () => {
      const builder = new MergeBuilder<TestPerson>()
      builder.onConflict('error')

      const config = builder.build()

      expect(config.conflictResolution).toBe('error')
    })

    it('sets conflict resolution mode to markConflict', () => {
      const builder = new MergeBuilder<TestPerson>()
      builder.onConflict('markConflict')

      const config = builder.build()

      expect(config.conflictResolution).toBe('markConflict')
    })

    it('throws error for invalid conflict resolution mode', () => {
      const builder = new MergeBuilder<TestPerson>()

      expect(() => {
        builder.onConflict('invalid' as never)
      }).toThrow(MergeBuilderError)
      expect(() => {
        builder.onConflict('invalid' as never)
      }).toThrow(/Invalid conflict resolution mode/)
    })
  })

  describe('field', () => {
    it('creates a FieldMergeBuilder', () => {
      const builder = new MergeBuilder<TestPerson>()
      const fieldBuilder = builder.field('firstName')

      expect(fieldBuilder).toBeInstanceOf(FieldMergeBuilder)
    })

    it('validates field path against schema', () => {
      const builder = new MergeBuilder<TestPerson>(testSchema)

      expect(() => {
        builder.field('nonExistentField')
      }).toThrow(MergeBuilderError)
      expect(() => {
        builder.field('nonExistentField')
      }).toThrow(/does not exist in schema/)
    })

    it('allows valid field paths', () => {
      const builder = new MergeBuilder<TestPerson>(testSchema)

      expect(() => {
        builder.field('firstName')
      }).not.toThrow()
    })

    it('skips validation when no schema provided', () => {
      const builder = new MergeBuilder<TestPerson>()

      expect(() => {
        builder.field('anyField')
      }).not.toThrow()
    })
  })

  describe('build', () => {
    it('builds complete merge configuration', () => {
      const builder = new MergeBuilder<TestPerson>()
      builder
        .defaultStrategy('preferNonNull')
        .timestampField('updatedAt')
        .trackProvenance(true)
        .onConflict('useDefault')
        .field('firstName')
        .strategy('preferLonger')
        .field('email')
        .strategy('preferNewer')

      const config = builder.build()

      expect(config.defaultStrategy).toBe('preferNonNull')
      expect(config.timestampField).toBe('updatedAt')
      expect(config.trackProvenance).toBe(true)
      expect(config.conflictResolution).toBe('useDefault')
      expect(config.fieldStrategies).toHaveLength(2)
      expect(config.fieldStrategies[0]).toEqual({
        field: 'firstName',
        strategy: 'preferLonger',
      })
      expect(config.fieldStrategies[1]).toEqual({
        field: 'email',
        strategy: 'preferNewer',
      })
    })

    it('throws error for custom strategy without function', () => {
      const builder = new MergeBuilder<TestPerson>()
      builder.field('firstName').strategy('custom')

      expect(() => {
        builder.build()
      }).toThrow(MergeBuilderError)
      expect(() => {
        builder.build()
      }).toThrow(/no custom merge function was provided/)
    })

    it('validates numeric strategy against schema', () => {
      const builder = new MergeBuilder<TestPerson>(testSchema)
      builder.field('firstName').strategy('average')

      expect(() => {
        builder.build()
      }).toThrow(MergeBuilderError)
      expect(() => {
        builder.build()
      }).toThrow(/requires a numeric field/)
    })

    it('allows numeric strategy on numeric field', () => {
      const builder = new MergeBuilder<TestPerson>(testSchema)
      builder.field('age').strategy('average')

      expect(() => {
        builder.build()
      }).not.toThrow()
    })
  })

  describe('method chaining', () => {
    it('supports fluent method chaining', () => {
      const builder = new MergeBuilder<TestPerson>()

      const result = builder
        .defaultStrategy('preferNonNull')
        .timestampField('updatedAt')
        .trackProvenance(true)
        .onConflict('useDefault')

      expect(result).toBe(builder)
    })
  })
})

describe('FieldMergeBuilder', () => {
  describe('strategy', () => {
    it('sets strategy for field', () => {
      const builder = new MergeBuilder<TestPerson>()
      builder.field('firstName').strategy('preferLonger')

      const config = builder.build()

      expect(config.fieldStrategies[0].strategy).toBe('preferLonger')
    })

    it('returns this for chaining', () => {
      const builder = new MergeBuilder<TestPerson>()
      const fieldBuilder = builder.field('firstName')

      const result = fieldBuilder.strategy('preferLonger')

      expect(result).toBe(fieldBuilder)
    })
  })

  describe('custom', () => {
    it('sets custom merge function', () => {
      const customFn = (values: string[]): string => values[0] || ''
      const builder = new MergeBuilder<TestPerson>()
      builder.field('firstName').custom(customFn)

      const config = builder.build()

      expect(config.fieldStrategies[0].strategy).toBe('custom')
      expect(config.fieldStrategies[0].customMerge).toBe(customFn)
    })

    it('supports typed custom functions', () => {
      const builder = new MergeBuilder<TestPerson>()
      builder
        .field('addresses')
        .custom<string[]>((values: string[][], _records: SourceRecord[]) => {
          return values.flat()
        })

      const config = builder.build()

      expect(config.fieldStrategies[0].strategy).toBe('custom')
      expect(typeof config.fieldStrategies[0].customMerge).toBe('function')
    })
  })

  describe('options', () => {
    it('sets options for strategy', () => {
      const builder = new MergeBuilder<TestPerson>()
      builder
        .field('addresses')
        .strategy('concatenate')
        .options({ removeDuplicates: true })

      const config = builder.build()

      expect(config.fieldStrategies[0].options).toEqual({
        removeDuplicates: true,
      })
    })

    it('sets separator option for concatenate', () => {
      const builder = new MergeBuilder<TestPerson>()
      builder
        .field('addresses')
        .strategy('concatenate')
        .options({ separator: ', ' })

      const config = builder.build()

      expect(config.fieldStrategies[0].options?.separator).toBe(', ')
    })

    it('sets dateField option for temporal strategies', () => {
      const builder = new MergeBuilder<TestPerson>()
      builder
        .field('email')
        .strategy('preferNewer')
        .options({ dateField: 'createdAt' })

      const config = builder.build()

      expect(config.fieldStrategies[0].options?.dateField).toBe('createdAt')
    })

    it('sets nullHandling option', () => {
      const builder = new MergeBuilder<TestPerson>()
      builder
        .field('phone')
        .strategy('preferNonNull')
        .options({ nullHandling: 'skip' })

      const config = builder.build()

      expect(config.fieldStrategies[0].options?.nullHandling).toBe('skip')
    })
  })

  describe('field chaining', () => {
    it('chains to next field', () => {
      const builder = new MergeBuilder<TestPerson>()
      builder
        .field('firstName')
        .strategy('preferLonger')
        .field('lastName')
        .strategy('preferLonger')
        .field('email')
        .strategy('preferNewer')

      const config = builder.build()

      expect(config.fieldStrategies).toHaveLength(3)
      expect(config.fieldStrategies.map((fs) => fs.field)).toEqual([
        'firstName',
        'lastName',
        'email',
      ])
    })

    it('finalizes current field before starting next', () => {
      const builder = new MergeBuilder<TestPerson>()
      builder
        .field('firstName')
        .strategy('preferLonger')
        .field('lastName')
        .strategy('preferShorter')

      const config = builder.build()

      expect(config.fieldStrategies[0]).toEqual({
        field: 'firstName',
        strategy: 'preferLonger',
      })
      expect(config.fieldStrategies[1]).toEqual({
        field: 'lastName',
        strategy: 'preferShorter',
      })
    })
  })

  describe('done', () => {
    it('returns to parent builder', () => {
      const builder = new MergeBuilder<TestPerson>()
      const fieldBuilder = builder.field('firstName').strategy('preferLonger')

      const result = fieldBuilder.done()

      expect(result).toBe(builder)
    })

    it('finalizes field configuration', () => {
      const builder = new MergeBuilder<TestPerson>()
      builder.field('firstName').strategy('preferLonger').done()

      const config = builder.build()

      expect(config.fieldStrategies).toHaveLength(1)
    })
  })

  describe('getConfig', () => {
    it('returns current field configuration', () => {
      const builder = new MergeBuilder<TestPerson>()
      const fieldBuilder = builder.field('firstName').strategy('preferLonger')

      const config = fieldBuilder.getConfig()

      expect(config).toEqual({
        field: 'firstName',
        strategy: 'preferLonger',
      })
    })
  })
})

describe('Builder validation', () => {
  it('rejects invalid field paths with schema', () => {
    const builder = new MergeBuilder<TestPerson>(testSchema)

    expect(() => {
      builder.field('invalidField')
    }).toThrow(/does not exist in schema/)
  })

  it('rejects numeric strategy on non-numeric field', () => {
    const builder = new MergeBuilder<TestPerson>(testSchema)
    builder.field('firstName').strategy('sum')

    expect(() => {
      builder.build()
    }).toThrow(/requires a numeric field/)
  })

  it('rejects custom strategy without function', () => {
    const builder = new MergeBuilder<TestPerson>()
    builder.field('firstName').strategy('custom')

    expect(() => {
      builder.build()
    }).toThrow(/no custom merge function was provided/)
  })

  it('provides helpful error messages', () => {
    const builder = new MergeBuilder<TestPerson>(testSchema)

    try {
      builder.field('notAField')
    } catch (error) {
      expect(error).toBeInstanceOf(MergeBuilderError)
      expect((error as Error).message).toContain('Available fields:')
    }
  })
})

describe('Builder integration', () => {
  it('integrates with resolver builder pattern', () => {
    const builder = new MergeBuilder<TestPerson>(testSchema)

    const config = builder
      .timestampField('updatedAt')
      .defaultStrategy('preferNonNull')
      .onConflict('useDefault')
      .field('firstName')
      .strategy('preferLonger')
      .field('lastName')
      .strategy('preferLonger')
      .field('email')
      .strategy('preferNewer')
      .field('phone')
      .strategy('preferNonNull')
      .field('addresses')
      .strategy('union')
      .field('age')
      .strategy('max')
      .done()
      .build()

    expect(config.fieldStrategies).toHaveLength(6)
    expect(config.defaultStrategy).toBe('preferNonNull')
    expect(config.timestampField).toBe('updatedAt')
    expect(config.conflictResolution).toBe('useDefault')
  })

  it('merge config available on built configuration', () => {
    const builder = new MergeBuilder<TestPerson>()

    const config = builder
      .field('firstName')
      .strategy('preferFirst')
      .done()
      .build()

    expect(config).toBeDefined()
    expect(config.fieldStrategies).toBeDefined()
    expect(config.defaultStrategy).toBeDefined()
    expect(config.trackProvenance).toBeDefined()
    expect(config.conflictResolution).toBeDefined()
  })

  it('handles complex configuration', () => {
    const builder = new MergeBuilder<TestPerson>(testSchema)

    const config = builder
      .timestampField('updatedAt')
      .defaultStrategy('preferNewer')
      .trackProvenance(true)
      .onConflict('markConflict')
      .field('firstName')
      .strategy('preferLonger')
      .options({ nullHandling: 'skip' })
      .field('lastName')
      .strategy('preferLonger')
      .field('email')
      .strategy('preferNewer')
      .options({ dateField: 'updatedAt' })
      .field('age')
      .strategy('average')
      .field('addresses')
      .strategy('union')
      .options({ removeDuplicates: true })
      .field('phone')
      .custom((values: (string | null)[]) => {
        return values.find((v) => v && v.startsWith('+1')) || values[0] || ''
      })
      .done()
      .build()

    expect(config.fieldStrategies).toHaveLength(6)
    expect(
      config.fieldStrategies.find((fs) => fs.field === 'firstName')?.options
        ?.nullHandling
    ).toBe('skip')
    expect(
      config.fieldStrategies.find((fs) => fs.field === 'email')?.options
        ?.dateField
    ).toBe('updatedAt')
    expect(
      config.fieldStrategies.find((fs) => fs.field === 'phone')?.strategy
    ).toBe('custom')
    expect(
      typeof config.fieldStrategies.find((fs) => fs.field === 'phone')
        ?.customMerge
    ).toBe('function')
  })
})

describe('createMergeBuilder', () => {
  it('creates a new MergeBuilder instance', () => {
    const builder = createMergeBuilder<TestPerson>()

    expect(builder).toBeInstanceOf(MergeBuilder)
  })

  it('creates builder with schema', () => {
    const builder = createMergeBuilder<TestPerson>(testSchema)

    expect(() => {
      builder.field('firstName')
    }).not.toThrow()

    expect(() => {
      builder.field('invalidField')
    }).toThrow()
  })
})

describe('Edge cases', () => {
  it('handles empty field strategies', () => {
    const builder = new MergeBuilder<TestPerson>()

    const config = builder.build()

    expect(config.fieldStrategies).toEqual([])
  })

  it('handles duplicate field configurations by replacing', () => {
    const builder = new MergeBuilder<TestPerson>()
    builder.field('firstName').strategy('preferFirst')
    builder.field('firstName').strategy('preferLast')

    const config = builder.build()

    expect(config.fieldStrategies).toHaveLength(1)
    expect(config.fieldStrategies[0].strategy).toBe('preferLast')
  })

  it('handles nested field paths', () => {
    interface NestedRecord extends Record<string, unknown> {
      address: {
        city: string
        state: string
      }
    }

    const nestedSchema: SchemaDefinition<NestedRecord> = {
      address: { type: 'string' },
    }

    const builder = new MergeBuilder<NestedRecord>(nestedSchema)
    builder.field('address.city').strategy('preferNewer')

    const config = builder.build()

    expect(config.fieldStrategies[0].field).toBe('address.city')
  })

  it('handles field path without setting strategy', () => {
    const builder = new MergeBuilder<TestPerson>()
    builder.field('firstName') // No strategy set

    const config = builder.build()

    // Field should not be added if no strategy was set
    expect(config.fieldStrategies).toHaveLength(0)
  })
})
