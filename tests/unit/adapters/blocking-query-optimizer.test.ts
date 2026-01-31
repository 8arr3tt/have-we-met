import { describe, it, expect } from 'vitest'
import { BlockingQueryOptimizer } from '../../../src/adapters/blocking-query-optimizer'
import { StandardBlockingStrategy } from '../../../src/core/blocking/strategies/standard-blocking'
import { SortedNeighbourhoodStrategy } from '../../../src/core/blocking/strategies/sorted-neighbourhood'
import { CompositeBlockingStrategy } from '../../../src/core/blocking/strategies/composite-blocking'

describe('BlockingQueryOptimizer', () => {
  describe('recommendIndexes', () => {
    describe('standard blocking', () => {
      it('recommends indexes for single-field standard blocking', () => {
        const optimizer = new BlockingQueryOptimizer('postgresql')
        const strategy = new StandardBlockingStrategy({ field: 'lastName' })

        const recommendations = optimizer.recommendIndexes(strategy, 'customers')

        expect(recommendations).toHaveLength(1)
        expect(recommendations[0].fields).toEqual(['lastName'])
        expect(recommendations[0].type).toBe('btree')
        expect(recommendations[0].name).toBe('idx_customers_lastName')
        expect(recommendations[0].sql).toContain('CREATE INDEX')
        expect(recommendations[0].sql).toContain('customers')
        expect(recommendations[0].priority).toBeGreaterThan(0)
      })

      it('recommends indexes for multi-field standard blocking', () => {
        const optimizer = new BlockingQueryOptimizer('postgresql')
        const strategy = new StandardBlockingStrategy({
          fields: ['lastName', 'dobYear'],
        })

        const recommendations = optimizer.recommendIndexes(strategy, 'patients')

        expect(recommendations).toHaveLength(2)
        expect(recommendations[0].fields).toEqual(['lastName'])
        expect(recommendations[1].fields).toEqual(['dobYear'])
        expect(recommendations[0].name).toBe('idx_patients_lastName')
        expect(recommendations[1].name).toBe('idx_patients_dobYear')
      })

      it('handles nested field names in index names', () => {
        const optimizer = new BlockingQueryOptimizer('postgresql')
        const strategy = new StandardBlockingStrategy({
          field: 'user.address.city',
        })

        const recommendations = optimizer.recommendIndexes(strategy, 'records')

        expect(recommendations).toHaveLength(1)
        expect(recommendations[0].name).toBe('idx_records_user_address_city')
      })
    })

    describe('sorted neighbourhood', () => {
      it('recommends indexes for sorted neighbourhood blocking', () => {
        const optimizer = new BlockingQueryOptimizer('postgresql')
        const strategy = new SortedNeighbourhoodStrategy({
          sortBy: 'lastName',
          windowSize: 10,
        })

        const recommendations = optimizer.recommendIndexes(strategy, 'customers')

        expect(recommendations).toHaveLength(1)
        expect(recommendations[0].fields).toEqual(['lastName'])
        expect(recommendations[0].type).toBe('btree')
        expect(recommendations[0].name).toBe('idx_customers_lastName_sorted')
        expect(recommendations[0].reason).toContain('ORDER BY')
        expect(recommendations[0].priority).toBe(10)
      })

      it('recommends composite index for multi-field sorting', () => {
        const optimizer = new BlockingQueryOptimizer('postgresql')
        const strategy = new SortedNeighbourhoodStrategy({
          sortBy: [
            { field: 'lastName', transform: 'soundex' },
            { field: 'dobYear' },
          ],
          windowSize: 15,
        })

        const recommendations = optimizer.recommendIndexes(strategy, 'patients')

        expect(recommendations).toHaveLength(1)
        expect(recommendations[0].fields).toEqual(['lastName', 'dobYear'])
        expect(recommendations[0].name).toContain('sorted')
      })
    })

    describe('composite blocking', () => {
      it('recommends indexes for union mode', () => {
        const optimizer = new BlockingQueryOptimizer('mysql')
        const strategy = new CompositeBlockingStrategy({
          strategies: [
            new StandardBlockingStrategy({ field: 'lastName' }),
            new StandardBlockingStrategy({ field: 'email' }),
          ],
          mode: 'union',
        })

        const recommendations = optimizer.recommendIndexes(strategy, 'users')

        expect(recommendations.length).toBeGreaterThan(0)
        expect(recommendations.some((r) => r.fields.includes('lastName'))).toBe(
          true
        )
        expect(recommendations.some((r) => r.fields.includes('email'))).toBe(
          true
        )
      })

      it('recommends composite index for intersection mode', () => {
        const optimizer = new BlockingQueryOptimizer('postgresql')
        const strategy = new CompositeBlockingStrategy({
          strategies: [
            new StandardBlockingStrategy({ field: 'lastName' }),
            new StandardBlockingStrategy({ field: 'dobYear' }),
          ],
          mode: 'intersection',
        })

        const recommendations = optimizer.recommendIndexes(strategy, 'patients')

        expect(recommendations.length).toBeGreaterThan(0)
        const compositeIndex = recommendations.find((r) => r.fields.length > 1)
        expect(compositeIndex).toBeDefined()
        expect(compositeIndex?.fields).toContain('lastName')
        expect(compositeIndex?.fields).toContain('dobYear')
      })
    })

    describe('database dialects', () => {
      it('generates PostgreSQL-specific SQL', () => {
        const optimizer = new BlockingQueryOptimizer('postgresql')
        const strategy = new StandardBlockingStrategy({ field: 'lastName' })

        const recommendations = optimizer.recommendIndexes(strategy, 'customers')

        expect(recommendations[0].sql).toContain('USING btree')
      })

      it('generates MySQL-specific SQL', () => {
        const optimizer = new BlockingQueryOptimizer('mysql')
        const strategy = new StandardBlockingStrategy({ field: 'lastName' })

        const recommendations = optimizer.recommendIndexes(strategy, 'customers')

        expect(recommendations[0].sql).toContain('USING BTREE')
      })

      it('generates SQLite-specific SQL', () => {
        const optimizer = new BlockingQueryOptimizer('sqlite')
        const strategy = new StandardBlockingStrategy({ field: 'lastName' })

        const recommendations = optimizer.recommendIndexes(strategy, 'customers')

        expect(recommendations[0].sql).toContain('CREATE INDEX')
        expect(recommendations[0].sql).not.toContain('USING')
      })

      it('generates generic SQL for unknown dialects', () => {
        const optimizer = new BlockingQueryOptimizer('generic')
        const strategy = new StandardBlockingStrategy({ field: 'lastName' })

        const recommendations = optimizer.recommendIndexes(strategy, 'customers')

        expect(recommendations[0].sql).toContain('CREATE INDEX')
      })
    })
  })

  describe('estimateQueryCost', () => {
    it('estimates high cost for queries without indexes', () => {
      const optimizer = new BlockingQueryOptimizer()
      const blockingKeys = new Map([['lastName', 'Smith']])

      const cost = optimizer.estimateQueryCost(blockingKeys, 1000000, false)

      expect(cost.estimatedRowsScanned).toBe(1000000)
      expect(cost.estimatedTimeMs).toBeGreaterThan(0)
      expect(cost.needsIndex).toBe(true)
    })

    it('estimates low cost for queries with indexes', () => {
      const optimizer = new BlockingQueryOptimizer()
      const blockingKeys = new Map([['lastName', 'Smith']])

      const cost = optimizer.estimateQueryCost(blockingKeys, 1000000, true)

      expect(cost.estimatedRowsScanned).toBeLessThan(1000000)
      expect(cost.estimatedTimeMs).toBeLessThan(10000)
      expect(cost.needsIndex).toBe(false)
    })

    it('estimates cost based on number of blocking fields', () => {
      const optimizer = new BlockingQueryOptimizer()
      const singleFieldKeys = new Map([['lastName', 'Smith']])
      const multiFieldKeys = new Map([
        ['lastName', 'Smith'],
        ['dobYear', '1985'],
      ])

      const costSingle = optimizer.estimateQueryCost(
        singleFieldKeys,
        1000000,
        true
      )
      const costMulti = optimizer.estimateQueryCost(
        multiFieldKeys,
        1000000,
        true
      )

      expect(costMulti.estimatedRowsScanned).toBeLessThan(
        costSingle.estimatedRowsScanned
      )
    })

    it('handles empty blocking keys', () => {
      const optimizer = new BlockingQueryOptimizer()
      const blockingKeys = new Map()

      const cost = optimizer.estimateQueryCost(blockingKeys, 100000)

      expect(cost.estimatedRowsScanned).toBe(100000)
      expect(cost.needsIndex).toBe(true)
    })

    it('recommends no index for small datasets', () => {
      const optimizer = new BlockingQueryOptimizer()
      const blockingKeys = new Map([['lastName', 'Smith']])

      const cost = optimizer.estimateQueryCost(blockingKeys, 5000, false)

      expect(cost.needsIndex).toBe(false)
    })

    it('recommends index for large datasets', () => {
      const optimizer = new BlockingQueryOptimizer()
      const blockingKeys = new Map([['lastName', 'Smith']])

      const cost = optimizer.estimateQueryCost(blockingKeys, 50000, false)

      expect(cost.needsIndex).toBe(true)
    })
  })

  describe('selectBestBlockingFields', () => {
    it('selects fields with highest cardinality', () => {
      const optimizer = new BlockingQueryOptimizer()
      const cardinalities = {
        email: 0.95,
        lastName: 0.01,
        firstName: 0.005,
        zipCode: 0.001,
      }

      const recommendation = optimizer.selectBestBlockingFields(
        cardinalities,
        2
      )

      expect(recommendation.recommendedFields).toEqual(['email', 'lastName'])
      expect(recommendation.expectedReduction).toBeGreaterThan(0)
      expect(recommendation.explanation).toContain('email')
    })

    it('respects maxFields parameter', () => {
      const optimizer = new BlockingQueryOptimizer()
      const cardinalities = {
        field1: 0.9,
        field2: 0.8,
        field3: 0.7,
        field4: 0.6,
        field5: 0.5,
      }

      const recommendation = optimizer.selectBestBlockingFields(
        cardinalities,
        3
      )

      expect(recommendation.recommendedFields).toHaveLength(3)
      expect(recommendation.recommendedFields).toEqual([
        'field1',
        'field2',
        'field3',
      ])
    })

    it('calculates expected reduction correctly', () => {
      const optimizer = new BlockingQueryOptimizer()
      const cardinalities = {
        highCardinality: 0.5,
        lowCardinality: 0.1,
      }

      const recommendation = optimizer.selectBestBlockingFields(
        cardinalities,
        2
      )

      expect(recommendation.expectedReduction).toBeGreaterThan(0)
      expect(recommendation.expectedReduction).toBeLessThan(100)
    })

    it('includes cardinality estimates in result', () => {
      const optimizer = new BlockingQueryOptimizer()
      const cardinalities = {
        email: 0.95,
        lastName: 0.01,
      }

      const recommendation = optimizer.selectBestBlockingFields(
        cardinalities,
        2
      )

      expect(recommendation.estimatedCardinality).toHaveProperty('email', 0.95)
      expect(recommendation.estimatedCardinality).toHaveProperty(
        'lastName',
        0.01
      )
    })

    it('provides explanatory text', () => {
      const optimizer = new BlockingQueryOptimizer()
      const cardinalities = {
        email: 0.95,
        lastName: 0.01,
      }

      const recommendation = optimizer.selectBestBlockingFields(
        cardinalities,
        2
      )

      expect(recommendation.explanation).toContain('Selected')
      expect(recommendation.explanation).toContain('cardinality')
      expect(recommendation.explanation).toContain('reduce comparisons')
    })

    it('handles single field selection', () => {
      const optimizer = new BlockingQueryOptimizer()
      const cardinalities = {
        email: 0.9,
        lastName: 0.1,
      }

      const recommendation = optimizer.selectBestBlockingFields(
        cardinalities,
        1
      )

      expect(recommendation.recommendedFields).toEqual(['email'])
    })

    it('handles equal cardinalities', () => {
      const optimizer = new BlockingQueryOptimizer()
      const cardinalities = {
        field1: 0.5,
        field2: 0.5,
        field3: 0.5,
      }

      const recommendation = optimizer.selectBestBlockingFields(
        cardinalities,
        2
      )

      expect(recommendation.recommendedFields).toHaveLength(2)
    })
  })
})
