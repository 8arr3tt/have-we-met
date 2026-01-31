import { describe, it, expect } from 'vitest'
import { BlockingBuilder, CompositeBlockingBuilder } from './blocking-builder'
import { StandardBlockingStrategy, SortedNeighbourhoodStrategy, CompositeBlockingStrategy } from '../core/blocking'

interface TestRecord {
  id: string
  firstName: string
  lastName: string
  email: string
  dateOfBirth: string
  age: number
}

describe('BlockingBuilder', () => {
  describe('onField', () => {
    it('configures single field blocking without transform', () => {
      const builder = new BlockingBuilder<TestRecord>()
      builder.onField('lastName')

      const config = builder.build()

      expect(config.strategies).toHaveLength(1)
      expect(config.strategies[0]).toBeInstanceOf(StandardBlockingStrategy)
      expect(config.strategies[0].name).toContain('lastName')
      expect(config.mode).toBe('single')
    })

    it('configures single field blocking with transform', () => {
      const builder = new BlockingBuilder<TestRecord>()
      builder.onField('lastName', { transform: 'soundex' })

      const config = builder.build()

      expect(config.strategies).toHaveLength(1)
      expect(config.strategies[0]).toBeInstanceOf(StandardBlockingStrategy)
      expect(config.strategies[0].name).toContain('soundex')
    })

    it('configures single field blocking with firstN transform', () => {
      const builder = new BlockingBuilder<TestRecord>()
      builder.onField('email', {
        transform: 'firstN',
        transformOptions: { n: 3 },
      })

      const config = builder.build()

      expect(config.strategies).toHaveLength(1)
      expect(config.strategies[0]).toBeInstanceOf(StandardBlockingStrategy)
    })

    it('configures single field blocking with custom transform', () => {
      const builder = new BlockingBuilder<TestRecord>()
      builder.onField('email', {
        transform: (value) => {
          if (typeof value === 'string') {
            return value.split('@')[1] || null
          }
          return null
        },
      })

      const config = builder.build()

      expect(config.strategies).toHaveLength(1)
      expect(config.strategies[0]).toBeInstanceOf(StandardBlockingStrategy)
    })

    it('configures single field blocking with null strategy', () => {
      const builder = new BlockingBuilder<TestRecord>()
      builder.onField('lastName', {
        transform: 'firstLetter',
        nullStrategy: 'block',
      })

      const config = builder.build()

      expect(config.strategies).toHaveLength(1)
      expect(config.strategies[0]).toBeInstanceOf(StandardBlockingStrategy)
    })

    it('supports all standard transforms', () => {
      const transforms: Array<
        'identity' | 'firstLetter' | 'soundex' | 'metaphone' | 'year' | 'firstN'
      > = ['identity', 'firstLetter', 'soundex', 'metaphone', 'year', 'firstN']

      for (const transform of transforms) {
        const builder = new BlockingBuilder<TestRecord>()
        const options =
          transform === 'firstN' ? { transform, transformOptions: { n: 3 } } : { transform }

        builder.onField('lastName', options as never)

        const config = builder.build()
        expect(config.strategies).toHaveLength(1)
      }
    })
  })

  describe('onFields', () => {
    it('configures multi-field blocking', () => {
      const builder = new BlockingBuilder<TestRecord>()
      builder.onFields(['lastName', 'dateOfBirth'])

      const config = builder.build()

      expect(config.strategies).toHaveLength(1)
      expect(config.strategies[0]).toBeInstanceOf(StandardBlockingStrategy)
      expect(config.strategies[0].name).toContain('lastName+dateOfBirth')
    })

    it('configures multi-field blocking with transforms', () => {
      const builder = new BlockingBuilder<TestRecord>()
      builder.onFields(['lastName', 'dateOfBirth'], {
        transforms: ['firstLetter', 'year'],
      })

      const config = builder.build()

      expect(config.strategies).toHaveLength(1)
      expect(config.strategies[0]).toBeInstanceOf(StandardBlockingStrategy)
    })

    it('configures multi-field blocking with partial transforms', () => {
      const builder = new BlockingBuilder<TestRecord>()
      builder.onFields(['lastName', 'firstName', 'age'], {
        transforms: ['soundex', undefined, 'identity'],
      })

      const config = builder.build()

      expect(config.strategies).toHaveLength(1)
      expect(config.strategies[0]).toBeInstanceOf(StandardBlockingStrategy)
    })
  })

  describe('sortedNeighbourhood', () => {
    it('configures sorted neighbourhood with single field', () => {
      const builder = new BlockingBuilder<TestRecord>()
      builder.sortedNeighbourhood('lastName', { windowSize: 10 })

      const config = builder.build()

      expect(config.strategies).toHaveLength(1)
      expect(config.strategies[0]).toBeInstanceOf(SortedNeighbourhoodStrategy)
      expect(config.strategies[0].name).toContain('lastName')
      expect(config.strategies[0].name).toContain('w10')
    })

    it('configures sorted neighbourhood with transform', () => {
      const builder = new BlockingBuilder<TestRecord>()
      builder.sortedNeighbourhood('lastName', {
        windowSize: 20,
        transform: 'soundex',
      })

      const config = builder.build()

      expect(config.strategies).toHaveLength(1)
      expect(config.strategies[0]).toBeInstanceOf(SortedNeighbourhoodStrategy)
    })

    it('configures sorted neighbourhood with sort order', () => {
      const builder = new BlockingBuilder<TestRecord>()
      builder.sortedNeighbourhood('age', {
        windowSize: 5,
        order: 'desc',
      })

      const config = builder.build()

      expect(config.strategies).toHaveLength(1)
      expect(config.strategies[0]).toBeInstanceOf(SortedNeighbourhoodStrategy)
    })

    it('configures sorted neighbourhood with multiple fields', () => {
      const builder = new BlockingBuilder<TestRecord>()
      builder.sortedNeighbourhood(['lastName', 'firstName'], {
        windowSize: 15,
      })

      const config = builder.build()

      expect(config.strategies).toHaveLength(1)
      expect(config.strategies[0]).toBeInstanceOf(SortedNeighbourhoodStrategy)
      expect(config.strategies[0].name).toContain('lastName+firstName')
    })
  })

  describe('composite', () => {
    it('configures composite blocking in union mode', () => {
      const builder = new BlockingBuilder<TestRecord>()
      builder.composite('union', (comp) =>
        comp.onField('lastName', { transform: 'soundex' }).onField('dateOfBirth', { transform: 'year' })
      )

      const config = builder.build()

      expect(config.strategies).toHaveLength(1)
      expect(config.strategies[0]).toBeInstanceOf(CompositeBlockingStrategy)
      expect(config.strategies[0].name).toContain('union')
    })

    it('configures composite blocking in intersection mode', () => {
      const builder = new BlockingBuilder<TestRecord>()
      builder.composite('intersection', (comp) =>
        comp.onField('lastName', { transform: 'firstLetter' }).onField('dateOfBirth', { transform: 'year' })
      )

      const config = builder.build()

      expect(config.strategies).toHaveLength(1)
      expect(config.strategies[0]).toBeInstanceOf(CompositeBlockingStrategy)
      expect(config.strategies[0].name).toContain('intersection')
    })

    it('configures composite with multiple strategy types', () => {
      const builder = new BlockingBuilder<TestRecord>()
      builder.composite('union', (comp) =>
        comp
          .onField('lastName', { transform: 'soundex' })
          .sortedNeighbourhood('email', { windowSize: 5 })
      )

      const config = builder.build()

      expect(config.strategies).toHaveLength(1)
      expect(config.strategies[0]).toBeInstanceOf(CompositeBlockingStrategy)
    })

    it('throws error if composite has no strategies', () => {
      const builder = new BlockingBuilder<TestRecord>()

      expect(() => {
        builder.composite('union', () => {
          // Empty composite
        })
      }).toThrow('Composite blocking requires at least one strategy')
    })
  })

  describe('multiple strategies (auto-union)', () => {
    it('automatically uses union mode for multiple strategies', () => {
      const builder = new BlockingBuilder<TestRecord>()
      builder.onField('lastName', { transform: 'soundex' }).onField('dateOfBirth', { transform: 'year' })

      const config = builder.build()

      expect(config.strategies).toHaveLength(2)
      expect(config.mode).toBe('union')
    })

    it('combines standard and sorted neighbourhood strategies', () => {
      const builder = new BlockingBuilder<TestRecord>()
      builder
        .onField('lastName', { transform: 'soundex' })
        .sortedNeighbourhood('email', { windowSize: 10 })

      const config = builder.build()

      expect(config.strategies).toHaveLength(2)
      expect(config.strategies[0]).toBeInstanceOf(StandardBlockingStrategy)
      expect(config.strategies[1]).toBeInstanceOf(SortedNeighbourhoodStrategy)
      expect(config.mode).toBe('union')
    })
  })

  describe('nullStrategy', () => {
    it('sets default null strategy for all strategies', () => {
      const builder = new BlockingBuilder<TestRecord>()
      builder.nullStrategy('block').onField('lastName').onField('firstName')

      const config = builder.build()

      expect(config.nullStrategy).toBe('block')
    })

    it('allows override of null strategy per field', () => {
      const builder = new BlockingBuilder<TestRecord>()
      builder
        .nullStrategy('skip')
        .onField('lastName', { nullStrategy: 'block' })
        .onField('firstName')

      const config = builder.build()

      expect(config.nullStrategy).toBe('skip')
    })
  })

  describe('build', () => {
    it('throws error if no strategies configured', () => {
      const builder = new BlockingBuilder<TestRecord>()

      expect(() => {
        builder.build()
      }).toThrow('At least one blocking strategy must be configured')
    })

    it('returns single mode for single strategy', () => {
      const builder = new BlockingBuilder<TestRecord>()
      builder.onField('lastName')

      const config = builder.build()

      expect(config.mode).toBe('single')
    })

    it('returns union mode for multiple strategies', () => {
      const builder = new BlockingBuilder<TestRecord>()
      builder.onField('lastName').onField('firstName')

      const config = builder.build()

      expect(config.mode).toBe('union')
    })
  })

  describe('method chaining', () => {
    it('supports fluent method chaining', () => {
      const builder = new BlockingBuilder<TestRecord>()

      const result = builder
        .nullStrategy('skip')
        .onField('lastName', { transform: 'soundex' })
        .onField('dateOfBirth', { transform: 'year' })
        .sortedNeighbourhood('email', { windowSize: 5 })

      expect(result).toBe(builder)

      const config = builder.build()
      expect(config.strategies).toHaveLength(3)
    })
  })
})

describe('CompositeBlockingBuilder', () => {
  it('builds strategies for composite blocking', () => {
    const compositeBuilder = new CompositeBlockingBuilder<TestRecord>()

    compositeBuilder
      .onField('lastName', { transform: 'soundex' })
      .onField('dateOfBirth', { transform: 'year' })

    const strategies = compositeBuilder.getStrategies()

    expect(strategies).toHaveLength(2)
    expect(strategies[0]).toBeInstanceOf(StandardBlockingStrategy)
    expect(strategies[1]).toBeInstanceOf(StandardBlockingStrategy)
  })

  it('supports sorted neighbourhood in composite', () => {
    const compositeBuilder = new CompositeBlockingBuilder<TestRecord>()

    compositeBuilder
      .onField('lastName')
      .sortedNeighbourhood('email', { windowSize: 10 })

    const strategies = compositeBuilder.getStrategies()

    expect(strategies).toHaveLength(2)
    expect(strategies[0]).toBeInstanceOf(StandardBlockingStrategy)
    expect(strategies[1]).toBeInstanceOf(SortedNeighbourhoodStrategy)
  })

  it('supports multi-field blocking in composite', () => {
    const compositeBuilder = new CompositeBlockingBuilder<TestRecord>()

    compositeBuilder.onFields(['lastName', 'firstName'], {
      transforms: ['soundex', 'firstLetter'],
    })

    const strategies = compositeBuilder.getStrategies()

    expect(strategies).toHaveLength(1)
    expect(strategies[0]).toBeInstanceOf(StandardBlockingStrategy)
  })
})
