import { describe, it, expect } from 'vitest'
import {
  ConsolidationBuilder,
  ConflictResolutionBuilder,
  createConsolidationBuilder,
} from '../../src/builder/consolidation-builder'
import { MatchingScope } from '../../src/consolidation/types'
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
}

interface ModernCustomer {
  email: string
  fname: string
  lname: string
  phone: string
}

interface Customer {
  email: string
  firstName: string
  lastName: string
  phone: string
  fullName?: string
}

describe('ConsolidationBuilder', () => {
  describe('source configuration', () => {
    it('should add a single source', () => {
      const adapter = createMockAdapter<LegacyCustomer>('legacy')

      const config = new ConsolidationBuilder<Customer>()
        .source('legacy', (source) =>
          source
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
            )
        )
        .build()

      expect(config.sources).toHaveLength(1)
      expect(config.sources[0].sourceId).toBe('legacy')
      expect(config.sources[0].name).toBe('Legacy Database')
      expect(config.sources[0].adapter).toBe(adapter)
    })

    it('should add multiple sources', () => {
      const legacyAdapter = createMockAdapter<LegacyCustomer>('legacy')
      const modernAdapter = createMockAdapter<ModernCustomer>('modern')

      const config = new ConsolidationBuilder<Customer>()
        .source('legacy', (source) =>
          source
            .name('Legacy Database')
            .adapter(legacyAdapter)
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
            )
        )
        .source('modern', (source) =>
          source
            .name('Modern Database')
            .adapter(modernAdapter)
            .mapping((map) =>
              map
                .field('email')
                .from('email')
                .field('firstName')
                .from('fname')
                .field('lastName')
                .from('lname')
                .field('phone')
                .from('phone')
            )
        )
        .build()

      expect(config.sources).toHaveLength(2)
      expect(config.sources[0].sourceId).toBe('legacy')
      expect(config.sources[1].sourceId).toBe('modern')
    })

    it('should throw if sourceId is empty', () => {
      expect(() => {
        new ConsolidationBuilder<Customer>().source('', (source) =>
          source
            .name('Test')
            .adapter(createMockAdapter('test'))
            .mapping((map) => map.field('email').from('email'))
        )
      }).toThrow('sourceId')
    })

    it('should throw if no sources added', () => {
      expect(() => {
        new ConsolidationBuilder<Customer>().build()
      }).toThrow('At least one source is required')
    })
  })

  describe('matching scope', () => {
    it('should default to within-source-first', () => {
      const adapter = createMockAdapter<LegacyCustomer>('legacy')

      const config = new ConsolidationBuilder<Customer>()
        .source('legacy', (source) =>
          source
            .name('Legacy')
            .adapter(adapter)
            .mapping((map) => map.field('email').from('email_address'))
        )
        .build()

      expect(config.matchingScope).toBe(MatchingScope.WithinSourceFirst)
    })

    it('should accept within-source-first string', () => {
      const adapter = createMockAdapter<LegacyCustomer>('legacy')

      const config = new ConsolidationBuilder<Customer>()
        .source('legacy', (source) =>
          source
            .name('Legacy')
            .adapter(adapter)
            .mapping((map) => map.field('email').from('email_address'))
        )
        .matchingScope('within-source-first')
        .build()

      expect(config.matchingScope).toBe(MatchingScope.WithinSourceFirst)
    })

    it('should accept unified-pool string', () => {
      const adapter = createMockAdapter<LegacyCustomer>('legacy')

      const config = new ConsolidationBuilder<Customer>()
        .source('legacy', (source) =>
          source
            .name('Legacy')
            .adapter(adapter)
            .mapping((map) => map.field('email').from('email_address'))
        )
        .matchingScope('unified-pool')
        .build()

      expect(config.matchingScope).toBe(MatchingScope.UnifiedPool)
    })

    it('should accept MatchingScope enum', () => {
      const adapter = createMockAdapter<LegacyCustomer>('legacy')

      const config = new ConsolidationBuilder<Customer>()
        .source('legacy', (source) =>
          source
            .name('Legacy')
            .adapter(adapter)
            .mapping((map) => map.field('email').from('email_address'))
        )
        .matchingScope(MatchingScope.UnifiedPool)
        .build()

      expect(config.matchingScope).toBe(MatchingScope.UnifiedPool)
    })

    it('should throw on invalid scope', () => {
      const adapter = createMockAdapter<LegacyCustomer>('legacy')

      expect(() => {
        new ConsolidationBuilder<Customer>()
          .source('legacy', (source) =>
            source
              .name('Legacy')
              .adapter(adapter)
              .mapping((map) => map.field('email').from('email_address'))
          )
          // @ts-expect-error Testing invalid input
          .matchingScope('invalid-scope')
          .build()
      }).toThrow()
    })
  })

  describe('conflict resolution', () => {
    it('should configure conflict resolution', () => {
      const adapter = createMockAdapter<LegacyCustomer>('legacy')

      const config = new ConsolidationBuilder<Customer>()
        .source('legacy', (source) =>
          source
            .name('Legacy')
            .adapter(adapter)
            .mapping((map) => map.field('email').from('email_address'))
        )
        .conflictResolution((cr) =>
          cr
            .defaultStrategy('preferNonNull')
            .useSourcePriority(true)
            .fieldStrategy('email', 'preferNewer')
        )
        .build()

      expect(config.conflictResolution).toBeDefined()
      expect(config.conflictResolution?.defaultStrategy).toBe('preferNonNull')
      expect(config.conflictResolution?.useSourcePriority).toBe(true)
      expect(config.conflictResolution?.fieldStrategies?.email).toBe(
        'preferNewer'
      )
    })

    it('should handle conflict resolution builder returned', () => {
      const adapter = createMockAdapter<LegacyCustomer>('legacy')

      const config = new ConsolidationBuilder<Customer>()
        .source('legacy', (source) =>
          source
            .name('Legacy')
            .adapter(adapter)
            .mapping((map) => map.field('email').from('email_address'))
        )
        .conflictResolution((cr) => {
          cr.defaultStrategy('preferFirst')
          return cr
        })
        .build()

      expect(config.conflictResolution?.defaultStrategy).toBe('preferFirst')
    })
  })

  describe('output adapter', () => {
    it('should set output adapter', () => {
      const inputAdapter = createMockAdapter<LegacyCustomer>('legacy')
      const outputAdapter = createMockAdapter<Customer>('output')

      const config = new ConsolidationBuilder<Customer>()
        .source('legacy', (source) =>
          source
            .name('Legacy')
            .adapter(inputAdapter)
            .mapping((map) => map.field('email').from('email_address'))
        )
        .outputAdapter(outputAdapter)
        .build()

      expect(config.outputAdapter).toBe(outputAdapter)
    })

    it('should set writeOutput flag', () => {
      const inputAdapter = createMockAdapter<LegacyCustomer>('legacy')
      const outputAdapter = createMockAdapter<Customer>('output')

      const config = new ConsolidationBuilder<Customer>()
        .source('legacy', (source) =>
          source
            .name('Legacy')
            .adapter(inputAdapter)
            .mapping((map) => map.field('email').from('email_address'))
        )
        .outputAdapter(outputAdapter)
        .writeOutput(true)
        .build()

      expect(config.writeOutput).toBe(true)
    })

    it('should throw if writeOutput is true without output adapter', () => {
      const inputAdapter = createMockAdapter<LegacyCustomer>('legacy')

      expect(() => {
        new ConsolidationBuilder<Customer>()
          .source('legacy', (source) =>
            source
              .name('Legacy')
              .adapter(inputAdapter)
              .mapping((map) => map.field('email').from('email_address'))
          )
          .writeOutput(true)
          .build()
      }).toThrow('outputAdapter is required when writeOutput is true')
    })
  })

  describe('fluent API', () => {
    it('should support method chaining', () => {
      const legacyAdapter = createMockAdapter<LegacyCustomer>('legacy')
      const modernAdapter = createMockAdapter<ModernCustomer>('modern')
      const outputAdapter = createMockAdapter<Customer>('output')

      const config = new ConsolidationBuilder<Customer>()
        .source('legacy', (source) =>
          source
            .name('Legacy Database')
            .adapter(legacyAdapter)
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
            )
            .priority(1)
        )
        .source('modern', (source) =>
          source
            .name('Modern Database')
            .adapter(modernAdapter)
            .mapping((map) =>
              map
                .field('email')
                .from('email')
                .field('firstName')
                .from('fname')
                .field('lastName')
                .from('lname')
                .field('phone')
                .from('phone')
            )
            .priority(2)
        )
        .matchingScope('within-source-first')
        .conflictResolution((cr) =>
          cr
            .defaultStrategy('preferNonNull')
            .useSourcePriority(true)
            .trackProvenance(true)
            .fieldStrategy('email', 'preferNewer')
            .fieldStrategy('phone', 'preferNonNull')
        )
        .outputAdapter(outputAdapter)
        .writeOutput(true)
        .build()

      expect(config).toBeDefined()
      expect(config.sources).toHaveLength(2)
      expect(config.matchingScope).toBe(MatchingScope.WithinSourceFirst)
      expect(config.conflictResolution?.defaultStrategy).toBe('preferNonNull')
      expect(config.outputAdapter).toBe(outputAdapter)
      expect(config.writeOutput).toBe(true)
    })
  })

  describe('createConsolidationBuilder factory', () => {
    it('should create a builder instance', () => {
      const builder = createConsolidationBuilder<Customer>()
      expect(builder).toBeInstanceOf(ConsolidationBuilder)
    })

    it('should create functional builder', () => {
      const adapter = createMockAdapter<LegacyCustomer>('legacy')

      const config = createConsolidationBuilder<Customer>()
        .source('legacy', (source) =>
          source
            .name('Legacy')
            .adapter(adapter)
            .mapping((map) => map.field('email').from('email_address'))
        )
        .build()

      expect(config.sources).toHaveLength(1)
    })
  })
})

describe('ConflictResolutionBuilder', () => {
  describe('default strategy', () => {
    it('should set default strategy', () => {
      const config = new ConflictResolutionBuilder()
        .defaultStrategy('preferNonNull')
        .build()

      expect(config.defaultStrategy).toBe('preferNonNull')
    })

    it('should accept all valid merge strategies', () => {
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
      ] as const

      for (const strategy of strategies) {
        const config = new ConflictResolutionBuilder()
          .defaultStrategy(strategy)
          .build()

        expect(config.defaultStrategy).toBe(strategy)
      }
    })

    it('should throw on invalid strategy', () => {
      expect(() => {
        new ConflictResolutionBuilder()
          // @ts-expect-error Testing invalid input
          .defaultStrategy('invalid-strategy')
      }).toThrow()
    })
  })

  describe('field strategies', () => {
    it('should set per-field strategies', () => {
      const config = new ConflictResolutionBuilder()
        .fieldStrategy('email', 'preferNewer')
        .fieldStrategy('phone', 'preferNonNull')
        .build()

      expect(config.fieldStrategies).toBeDefined()
      expect(config.fieldStrategies!.email).toBe('preferNewer')
      expect(config.fieldStrategies!.phone).toBe('preferNonNull')
    })

    it('should throw if field name is empty', () => {
      expect(() => {
        new ConflictResolutionBuilder().fieldStrategy('', 'preferNonNull')
      }).toThrow('fieldName')
    })

    it('should throw on invalid field strategy', () => {
      expect(() => {
        new ConflictResolutionBuilder()
          // @ts-expect-error Testing invalid input
          .fieldStrategy('email', 'invalid-strategy')
      }).toThrow()
    })
  })

  describe('source priority', () => {
    it('should default to true', () => {
      const config = new ConflictResolutionBuilder().build()
      expect(config.useSourcePriority).toBe(true)
    })

    it('should set source priority to false', () => {
      const config = new ConflictResolutionBuilder()
        .useSourcePriority(false)
        .build()

      expect(config.useSourcePriority).toBe(false)
    })
  })

  describe('provenance tracking', () => {
    it('should default to true', () => {
      const config = new ConflictResolutionBuilder().build()
      expect(config.trackProvenance).toBe(true)
    })

    it('should set provenance tracking to false', () => {
      const config = new ConflictResolutionBuilder()
        .trackProvenance(false)
        .build()

      expect(config.trackProvenance).toBe(false)
    })
  })

  describe('fluent API', () => {
    it('should support method chaining', () => {
      const config = new ConflictResolutionBuilder()
        .defaultStrategy('preferNonNull')
        .useSourcePriority(true)
        .trackProvenance(true)
        .fieldStrategy('email', 'preferNewer')
        .fieldStrategy('phone', 'preferNonNull')
        .fieldStrategy('address', 'preferLonger')
        .build()

      expect(config.defaultStrategy).toBe('preferNonNull')
      expect(config.useSourcePriority).toBe(true)
      expect(config.trackProvenance).toBe(true)
      expect(config.fieldStrategies).toBeDefined()
      expect(Object.keys(config.fieldStrategies!)).toHaveLength(3)
    })
  })
})
