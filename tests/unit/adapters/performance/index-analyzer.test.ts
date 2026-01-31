import { describe, it, expect } from 'vitest'
import { IndexAnalyzer } from '../../../../src/adapters/performance/index-analyzer'
import type { SchemaField, QueryPattern } from '../../../../src/adapters/performance/index-analyzer'
import type { BlockingStrategy } from '../../../../src/core/blocking/types'

describe('IndexAnalyzer', () => {
  describe('constructor', () => {
    it('creates analyzer with postgresql dialect', () => {
      const analyzer = new IndexAnalyzer('postgresql')
      expect(analyzer).toBeDefined()
    })

    it('creates analyzer with mysql dialect', () => {
      const analyzer = new IndexAnalyzer('mysql')
      expect(analyzer).toBeDefined()
    })

    it('creates analyzer with sqlite dialect', () => {
      const analyzer = new IndexAnalyzer('sqlite')
      expect(analyzer).toBeDefined()
    })

    it('creates analyzer with generic dialect by default', () => {
      const analyzer = new IndexAnalyzer()
      expect(analyzer).toBeDefined()
    })
  })

  describe('analyzeBlockingStrategy', () => {
    it('recommends indexes for standard blocking', () => {
      const analyzer = new IndexAnalyzer('postgresql')
      const strategy: BlockingStrategy = {
        name: 'standard:lastName',
        generate: () => new Map([['lastName', 'Smith']]),
      }

      const recommendations = analyzer.analyzeBlockingStrategy(strategy, 'customers')

      expect(recommendations).toHaveLength(1)
      expect(recommendations[0].fields).toEqual(['lastName'])
      expect(recommendations[0].type).toBe('btree')
      expect(recommendations[0].name).toBe('idx_customers_lastName')
      expect(recommendations[0].sql).toContain('CREATE INDEX')
      expect(recommendations[0].reason).toContain('lastName')
      expect(recommendations[0].priority).toBeGreaterThan(0)
    })

    it('recommends indexes for sorted neighbourhood', () => {
      const analyzer = new IndexAnalyzer('postgresql')
      const strategy: BlockingStrategy = {
        name: 'sorted-neighbourhood:lastName:w5',
        generate: () => new Map([['lastName', 'Smith']]),
      }

      const recommendations = analyzer.analyzeBlockingStrategy(strategy, 'customers')

      expect(recommendations).toHaveLength(1)
      expect(recommendations[0].fields).toEqual(['lastName'])
      expect(recommendations[0].name).toContain('sorted')
      expect(recommendations[0].reason).toContain('sorted neighbourhood')
      expect(recommendations[0].priority).toBe(10)
    })

    it('recommends indexes for composite blocking with intersection', () => {
      const analyzer = new IndexAnalyzer('postgresql')
      const strategy: BlockingStrategy = {
        name: 'composite:intersection[standard:lastName+standard:dobYear]',
        generate: () => new Map([['lastName', 'Smith'], ['dobYear', '1985']]),
      }

      const recommendations = analyzer.analyzeBlockingStrategy(strategy, 'customers')

      expect(recommendations).toHaveLength(1)
      expect(recommendations[0].fields).toEqual(['lastName', 'dobYear'])
      expect(recommendations[0].name).toContain('composite')
      expect(recommendations[0].reason).toContain('composite intersection')
    })

    it('recommends indexes for composite blocking with union', () => {
      const analyzer = new IndexAnalyzer('postgresql')
      const strategy: BlockingStrategy = {
        name: 'composite:union[standard:lastName+standard:email]',
        generate: () => new Map(),
      }

      const recommendations = analyzer.analyzeBlockingStrategy(strategy, 'customers')

      expect(recommendations.length).toBeGreaterThan(0)
      expect(recommendations.some((r) => r.fields.includes('lastName'))).toBe(true)
      expect(recommendations.some((r) => r.fields.includes('email'))).toBe(true)
    })

    it('generates PostgreSQL-specific SQL', () => {
      const analyzer = new IndexAnalyzer('postgresql')
      const strategy: BlockingStrategy = {
        name: 'standard:email',
        generate: () => new Map([['email', 'test@example.com']]),
      }

      const recommendations = analyzer.analyzeBlockingStrategy(strategy, 'users')

      expect(recommendations[0].sql).toContain('USING btree')
      expect(recommendations[0].sql).toMatch(/CREATE INDEX .* ON users/)
    })

    it('generates MySQL-specific SQL', () => {
      const analyzer = new IndexAnalyzer('mysql')
      const strategy: BlockingStrategy = {
        name: 'standard:email',
        generate: () => new Map([['email', 'test@example.com']]),
      }

      const recommendations = analyzer.analyzeBlockingStrategy(strategy, 'users')

      expect(recommendations[0].sql).toContain('USING BTREE')
    })

    it('generates SQLite-specific SQL', () => {
      const analyzer = new IndexAnalyzer('sqlite')
      const strategy: BlockingStrategy = {
        name: 'standard:email',
        generate: () => new Map([['email', 'test@example.com']]),
      }

      const recommendations = analyzer.analyzeBlockingStrategy(strategy, 'users')

      expect(recommendations[0].sql).toContain('CREATE INDEX')
      expect(recommendations[0].sql).not.toContain('USING')
    })
  })

  describe('analyzeQueryPattern', () => {
    it('finds records by single blocking key', () => {
      const analyzer = new IndexAnalyzer('postgresql')
      const queries: QueryPattern[] = [
        { fields: ['lastName'], frequency: 1000 },
      ]

      const recommendations = analyzer.analyzeQueryPattern(queries, 'customers')

      expect(recommendations).toHaveLength(1)
      expect(recommendations[0].fields).toEqual(['lastName'])
      expect(recommendations[0].reason).toContain('1000 times')
    })

    it('finds records by multiple blocking keys', () => {
      const analyzer = new IndexAnalyzer('postgresql')
      const queries: QueryPattern[] = [
        { fields: ['lastName', 'dobYear'], frequency: 500 },
      ]

      const recommendations = analyzer.analyzeQueryPattern(queries, 'customers')

      expect(recommendations).toHaveLength(1)
      expect(recommendations[0].fields.sort()).toEqual(['dobYear', 'lastName'])
    })

    it('returns empty array when no matches', () => {
      const analyzer = new IndexAnalyzer('postgresql')
      const queries: QueryPattern[] = [
        { fields: ['lastName'], frequency: 5 },
      ]

      const recommendations = analyzer.analyzeQueryPattern(queries, 'customers')

      expect(recommendations).toHaveLength(0)
    })

    it('respects limit and offset', () => {
      const analyzer = new IndexAnalyzer('postgresql')
      const queries: QueryPattern[] = [
        { fields: ['email'], frequency: 1000 },
        { fields: ['phone'], frequency: 800 },
        { fields: ['zipCode'], frequency: 600 },
      ]

      const recommendations = analyzer.analyzeQueryPattern(queries, 'customers')

      expect(recommendations).toHaveLength(3)
      expect(recommendations[0].fields).toEqual(['email'])
      expect(recommendations[1].fields).toEqual(['phone'])
      expect(recommendations[2].fields).toEqual(['zipCode'])
    })

    it('skips queries with existing indexes', () => {
      const analyzer = new IndexAnalyzer('postgresql')
      const queries: QueryPattern[] = [
        { fields: ['lastName'], frequency: 1000 },
        { fields: ['email'], frequency: 800 },
      ]
      const existingIndexes = [['lastName']]

      const recommendations = analyzer.analyzeQueryPattern(
        queries,
        'customers',
        existingIndexes
      )

      expect(recommendations).toHaveLength(1)
      expect(recommendations[0].fields).toEqual(['email'])
    })

    it('skips low frequency queries', () => {
      const analyzer = new IndexAnalyzer('postgresql')
      const queries: QueryPattern[] = [
        { fields: ['lastName'], frequency: 5 },
        { fields: ['email'], frequency: 1000 },
      ]

      const recommendations = analyzer.analyzeQueryPattern(queries, 'customers')

      expect(recommendations).toHaveLength(1)
      expect(recommendations[0].fields).toEqual(['email'])
    })

    it('prioritizes by frequency', () => {
      const analyzer = new IndexAnalyzer('postgresql')
      const queries: QueryPattern[] = [
        { fields: ['zipCode'], frequency: 100 },
        { fields: ['email'], frequency: 10000 },
        { fields: ['lastName'], frequency: 1000 },
      ]

      const recommendations = analyzer.analyzeQueryPattern(queries, 'customers')

      expect(recommendations[0].fields).toEqual(['email'])
      expect(recommendations[0].priority).toBeGreaterThanOrEqual(recommendations[1].priority)
    })

    it('selects hash index for equality operators', () => {
      const analyzer = new IndexAnalyzer('postgresql')
      const queries: QueryPattern[] = [
        { fields: ['email'], frequency: 1000, filterOperators: ['eq'] },
      ]

      const recommendations = analyzer.analyzeQueryPattern(queries, 'customers')

      expect(recommendations[0].type).toBe('hash')
    })

    it('selects gin index for like operators on postgresql', () => {
      const analyzer = new IndexAnalyzer('postgresql')
      const queries: QueryPattern[] = [
        { fields: ['name'], frequency: 1000, filterOperators: ['like'] },
      ]

      const recommendations = analyzer.analyzeQueryPattern(queries, 'customers')

      expect(recommendations[0].type).toBe('gin')
    })

    it('selects btree index for like operators on mysql', () => {
      const analyzer = new IndexAnalyzer('mysql')
      const queries: QueryPattern[] = [
        { fields: ['name'], frequency: 1000, filterOperators: ['like'] },
      ]

      const recommendations = analyzer.analyzeQueryPattern(queries, 'customers')

      expect(recommendations[0].type).toBe('btree')
    })
  })

  describe('generateIndexSuggestions', () => {
    it('generates suggestions for standard blocking', () => {
      const analyzer = new IndexAnalyzer('postgresql')
      const schema: SchemaField[] = [
        { name: 'firstName', type: 'string' },
        { name: 'lastName', type: 'string' },
        { name: 'email', type: 'string' },
      ]
      const strategy: BlockingStrategy = {
        name: 'standard:lastName',
        generate: () => new Map([['lastName', 'Smith']]),
      }

      const suggestions = analyzer.generateIndexSuggestions(schema, strategy)

      expect(suggestions).toHaveLength(1)
      expect(suggestions[0].fields).toEqual(['lastName'])
      expect(suggestions[0].sql).toContain('CREATE INDEX')
      expect(suggestions[0].reason).toBeDefined()
      expect(suggestions[0].estimatedImprovement).toBeDefined()
    })

    it('generates suggestions for sorted neighbourhood', () => {
      const analyzer = new IndexAnalyzer('postgresql')
      const schema: SchemaField[] = [
        { name: 'lastName', type: 'string' },
      ]
      const strategy: BlockingStrategy = {
        name: 'sorted-neighbourhood:lastName:w5',
        generate: () => new Map([['lastName', 'Smith']]),
      }

      const suggestions = analyzer.generateIndexSuggestions(schema, strategy)

      expect(suggestions).toHaveLength(1)
      expect(suggestions[0].priority).toBe(10)
      expect(suggestions[0].estimatedImprovement).toContain('10-100x')
    })

    it('generates suggestions for composite blocking', () => {
      const analyzer = new IndexAnalyzer('postgresql')
      const schema: SchemaField[] = [
        { name: 'lastName', type: 'string' },
        { name: 'dobYear', type: 'string' },
      ]
      const strategy: BlockingStrategy = {
        name: 'composite:intersection[standard:lastName+standard:dobYear]',
        generate: () => new Map([['lastName', 'Smith'], ['dobYear', '1985']]),
      }

      const suggestions = analyzer.generateIndexSuggestions(schema, strategy)

      expect(suggestions).toHaveLength(1)
      expect(suggestions[0].fields).toEqual(['lastName', 'dobYear'])
    })

    it('filters out already indexed fields', () => {
      const analyzer = new IndexAnalyzer('postgresql')
      const schema: SchemaField[] = [
        { name: 'id', type: 'string', indexed: true },
        { name: 'lastName', type: 'string', indexed: false },
      ]
      const strategy: BlockingStrategy = {
        name: 'standard:id',
        generate: () => new Map([['id', '123']]),
      }

      const suggestions = analyzer.generateIndexSuggestions(schema, strategy)

      expect(suggestions).toHaveLength(0)
    })

    it('includes priority in suggestions', () => {
      const analyzer = new IndexAnalyzer('postgresql')
      const schema: SchemaField[] = [
        { name: 'lastName', type: 'string' },
      ]
      const strategy: BlockingStrategy = {
        name: 'sorted-neighbourhood:lastName:w5',
        generate: () => new Map([['lastName', 'Smith']]),
      }

      const suggestions = analyzer.generateIndexSuggestions(schema, strategy)

      expect(suggestions[0].priority).toBe(10)
    })

    it('includes estimated improvement', () => {
      const analyzer = new IndexAnalyzer('postgresql')
      const schema: SchemaField[] = [
        { name: 'lastName', type: 'string' },
      ]
      const strategy: BlockingStrategy = {
        name: 'standard:lastName',
        generate: () => new Map([['lastName', 'Smith']]),
      }

      const suggestions = analyzer.generateIndexSuggestions(schema, strategy)

      expect(suggestions[0].estimatedImprovement).toMatch(/\d+-\d+x faster/)
    })
  })

  describe('SQL generation for different databases', () => {
    it('generates PostgreSQL syntax with USING clause', () => {
      const analyzer = new IndexAnalyzer('postgresql')
      const strategy: BlockingStrategy = {
        name: 'standard:email',
        generate: () => new Map([['email', 'test@example.com']]),
      }

      const recommendations = analyzer.analyzeBlockingStrategy(strategy, 'users')

      expect(recommendations[0].sql).toMatch(/CREATE INDEX .* ON users USING btree \(email\);/)
    })

    it('generates MySQL syntax with USING clause', () => {
      const analyzer = new IndexAnalyzer('mysql')
      const strategy: BlockingStrategy = {
        name: 'standard:email',
        generate: () => new Map([['email', 'test@example.com']]),
      }

      const recommendations = analyzer.analyzeBlockingStrategy(strategy, 'users')

      expect(recommendations[0].sql).toMatch(/CREATE INDEX .* ON users \(email\) USING BTREE;/)
    })

    it('generates SQLite syntax without USING clause', () => {
      const analyzer = new IndexAnalyzer('sqlite')
      const strategy: BlockingStrategy = {
        name: 'standard:email',
        generate: () => new Map([['email', 'test@example.com']]),
      }

      const recommendations = analyzer.analyzeBlockingStrategy(strategy, 'users')

      expect(recommendations[0].sql).toMatch(/CREATE INDEX .* ON users \(email\);/)
      expect(recommendations[0].sql).not.toContain('USING')
    })

    it('handles GIN indexes for PostgreSQL', () => {
      const analyzer = new IndexAnalyzer('postgresql')
      const queries: QueryPattern[] = [
        { fields: ['name'], frequency: 1000, filterOperators: ['like'] },
      ]

      const recommendations = analyzer.analyzeQueryPattern(queries, 'customers')

      expect(recommendations[0].type).toBe('gin')
      expect(recommendations[0].sql).toContain('USING gin')
    })

    it('falls back to BTREE for MySQL GIN indexes', () => {
      const analyzer = new IndexAnalyzer('mysql')
      const queries: QueryPattern[] = [
        { fields: ['name'], frequency: 1000, filterOperators: ['like'] },
      ]

      const recommendations = analyzer.analyzeQueryPattern(queries, 'customers')

      expect(recommendations[0].sql).toContain('USING BTREE')
    })
  })

  describe('edge cases', () => {
    it('handles empty strategy name', () => {
      const analyzer = new IndexAnalyzer('postgresql')
      const strategy: BlockingStrategy = {
        name: '',
        generate: () => new Map(),
      }

      const recommendations = analyzer.analyzeBlockingStrategy(strategy, 'customers')

      expect(recommendations).toHaveLength(0)
    })

    it('handles strategy with no fields', () => {
      const analyzer = new IndexAnalyzer('postgresql')
      const strategy: BlockingStrategy = {
        name: 'unknown:strategy',
        generate: () => new Map(),
      }

      const recommendations = analyzer.analyzeBlockingStrategy(strategy, 'customers')

      expect(recommendations).toHaveLength(0)
    })

    it('handles empty query patterns', () => {
      const analyzer = new IndexAnalyzer('postgresql')

      const recommendations = analyzer.analyzeQueryPattern([], 'customers')

      expect(recommendations).toHaveLength(0)
    })

    it('handles empty schema', () => {
      const analyzer = new IndexAnalyzer('postgresql')
      const strategy: BlockingStrategy = {
        name: 'standard:lastName',
        generate: () => new Map([['lastName', 'Smith']]),
      }

      const suggestions = analyzer.generateIndexSuggestions([], strategy)

      expect(suggestions).toHaveLength(1)
    })

    it('handles field names with dots', () => {
      const analyzer = new IndexAnalyzer('postgresql')
      const strategy: BlockingStrategy = {
        name: 'standard:address.zipCode',
        generate: () => new Map([['address.zipCode', '12345']]),
      }

      const recommendations = analyzer.analyzeBlockingStrategy(strategy, 'customers')

      expect(recommendations[0].name).toBe('idx_customers_address_zipCode')
      expect(recommendations[0].name).not.toContain('.')
    })
  })
})
