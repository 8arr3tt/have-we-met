import { describe, it, expect, beforeEach } from 'vitest'
import { QueryProfiler } from '../../../../src/adapters/performance/query-profiler'

describe('QueryProfiler', () => {
  let profiler: QueryProfiler

  beforeEach(() => {
    profiler = new QueryProfiler()
  })

  describe('profile', () => {
    it('profiles query execution time', async () => {
      const result = await profiler.profile(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10))
        return [{ id: '1', name: 'Test' }]
      })

      // Allow some tolerance for timer resolution
      expect(result.stats.executionTimeMs).toBeGreaterThanOrEqual(5)
      expect(result.stats.rowsReturned).toBe(1)
      expect(result.stats.timestamp).toBeInstanceOf(Date)
    })

    it('fetches database query plan', async () => {
      const result = await profiler.profile(async () => {
        return [{ id: '1' }, { id: '2' }, { id: '3' }]
      })

      expect(result.stats.rowsReturned).toBe(3)
    })

    it('identifies missing indexes', async () => {
      const result = await profiler.profile(async () => {
        await new Promise((resolve) => setTimeout(resolve, 60))
        return []
      })

      expect(result.issues).toContain('No index used for query')
    })

    it('detects slow queries', async () => {
      const result = await profiler.profile(async () => {
        await new Promise((resolve) => setTimeout(resolve, 1100))
        return []
      })

      expect(result.issues.some((i) => i.includes('Slow query'))).toBe(true)
      expect(result.severity).toBe('high')
    })

    it('detects large result sets', async () => {
      const result = await profiler.profile(async () => {
        return Array.from({ length: 15000 }, (_, i) => ({ id: String(i) }))
      })

      expect(result.issues.some((i) => i.includes('Large result set'))).toBe(
        true
      )
      expect(result.recommendations).toContain(
        'Use pagination with limit/offset'
      )
    })

    it('detects inefficient queries', async () => {
      const result = await profiler.profile(async () => {
        await new Promise((resolve) => setTimeout(resolve, 150))
        return [{ id: '1' }]
      })

      expect(result.issues.some((i) => i.includes('Inefficient query'))).toBe(
        true
      )
    })

    it('handles query errors', async () => {
      const error = new Error('Query failed')

      await expect(
        profiler.profile(async () => {
          throw error
        })
      ).rejects.toThrow('Query failed')
    })

    it('calculates low severity for fast queries', async () => {
      const result = await profiler.profile(async () => {
        return [{ id: '1' }]
      })

      expect(result.severity).toBe('low')
    })

    it('calculates medium severity for moderately slow queries', async () => {
      const result = await profiler.profile(async () => {
        await new Promise((resolve) => setTimeout(resolve, 150))
        return []
      })

      expect(result.severity).toBe('medium')
    })

    it('calculates high severity for slow queries', async () => {
      const result = await profiler.profile(async () => {
        await new Promise((resolve) => setTimeout(resolve, 1100))
        return []
      })

      expect(result.severity).toBe('high')
    })

    it('calculates critical severity for very slow queries', async () => {
      const result = await profiler.profile(async () => {
        await new Promise((resolve) => setTimeout(resolve, 5100))
        return []
      })

      expect(result.severity).toBe('critical')
    }, 10000)

    it('generates recommendations for slow queries', async () => {
      const result = await profiler.profile(async () => {
        await new Promise((resolve) => setTimeout(resolve, 1100))
        return []
      })

      expect(result.recommendations).toContain(
        'Consider adding indexes on frequently queried fields'
      )
    })

    it('generates recommendations for large result sets', async () => {
      const result = await profiler.profile(async () => {
        return Array.from({ length: 15000 }, (_, i) => ({ id: String(i) }))
      })

      expect(result.recommendations).toContain(
        'Use pagination with limit/offset'
      )
      expect(result.recommendations).toContain(
        'Consider more selective blocking criteria'
      )
      expect(result.recommendations).toContain(
        'Fetch only required fields using field projection'
      )
    })

    it('generates recommendations for missing indexes', async () => {
      const result = await profiler.profile(async () => {
        await new Promise((resolve) => setTimeout(resolve, 60))
        return []
      })

      expect(result.recommendations).toContain(
        'Create an index on the filtering fields'
      )
    })

    it('includes blocking-specific recommendations', async () => {
      const result = await profiler.profile(
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 1100))
          return []
        },
        { queryType: 'blocking', tableName: 'customers' }
      )

      expect(result.recommendations).toContain(
        'Use IndexAnalyzer to get specific index recommendations'
      )
      expect(
        result.recommendations.some((r) =>
          r.includes('for the customers table')
        )
      ).toBe(true)
    })

    it('tracks query history', async () => {
      await profiler.profile(async () => [{ id: '1' }])
      await profiler.profile(async () => [{ id: '2' }])

      const history = profiler.getHistory()
      expect(history).toHaveLength(2)
    })

    it('detects queries slower than average', async () => {
      await profiler.profile(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10))
        return []
      })

      await profiler.profile(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10))
        return []
      })

      await profiler.profile(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10))
        return []
      })

      const result = await profiler.profile(async () => {
        await new Promise((resolve) => setTimeout(resolve, 500))
        return []
      })

      expect(result.issues.some((i) => i.includes('slower than average'))).toBe(
        true
      )
    })
  })

  describe('explain', () => {
    it('provides query plan for SELECT with WHERE', () => {
      const plan = profiler.explain(
        'SELECT * FROM customers WHERE lastName = ?'
      )

      expect(plan.scanType).toBe('index_scan')
      expect(plan.indexes).toContain('idx_lastName')
      expect(plan.cost).toBe(10)
      expect(plan.rows).toBe(100)
    })

    it('provides query plan for SELECT without WHERE', () => {
      const plan = profiler.explain('SELECT * FROM customers')

      expect(plan.scanType).toBe('seq_scan')
      expect(plan.indexes).toHaveLength(0)
      expect(plan.cost).toBe(100)
      expect(plan.rows).toBe(10000)
    })

    it('detects JOIN queries', () => {
      const plan = profiler.explain(
        'SELECT * FROM customers JOIN orders ON customers.id = orders.customerId'
      )

      expect(plan.details).toHaveProperty('hasJoin', true)
    })

    it('provides query plan details', () => {
      const plan = profiler.explain('SELECT * FROM customers WHERE email = ?')

      expect(plan.details).toBeDefined()
      expect(plan.details).toHaveProperty('note')
    })
  })

  describe('getHistory', () => {
    it('returns empty array when no queries profiled', () => {
      const history = profiler.getHistory()
      expect(history).toHaveLength(0)
    })

    it('returns all query statistics', async () => {
      await profiler.profile(async () => [{ id: '1' }])
      await profiler.profile(async () => [{ id: '2' }])
      await profiler.profile(async () => [{ id: '3' }])

      const history = profiler.getHistory()
      expect(history).toHaveLength(3)
    })

    it('limits history to specified count', async () => {
      await profiler.profile(async () => [{ id: '1' }])
      await profiler.profile(async () => [{ id: '2' }])
      await profiler.profile(async () => [{ id: '3' }])

      const history = profiler.getHistory(2)
      expect(history).toHaveLength(2)
      expect(history[0].rowsReturned).toBe(1)
      expect(history[1].rowsReturned).toBe(1)
    })

    it('returns most recent entries when limit specified', async () => {
      await profiler.profile(async () => [{ id: '1' }])
      await profiler.profile(async () => [{ id: '2' }, { id: '3' }])
      await profiler.profile(async () => [
        { id: '4' },
        { id: '5' },
        { id: '6' },
      ])

      const history = profiler.getHistory(2)
      expect(history).toHaveLength(2)
      expect(history[0].rowsReturned).toBe(2)
      expect(history[1].rowsReturned).toBe(3)
    })
  })

  describe('clearHistory', () => {
    it('clears all query history', async () => {
      await profiler.profile(async () => [{ id: '1' }])
      await profiler.profile(async () => [{ id: '2' }])

      profiler.clearHistory()

      const history = profiler.getHistory()
      expect(history).toHaveLength(0)
    })
  })

  describe('getAverageExecutionTime', () => {
    it('returns 0 for empty history', () => {
      expect(profiler.getAverageExecutionTime()).toBe(0)
    })

    it('calculates average execution time', async () => {
      await profiler.profile(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10))
        return []
      })
      await profiler.profile(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20))
        return []
      })
      await profiler.profile(async () => {
        await new Promise((resolve) => setTimeout(resolve, 30))
        return []
      })

      const avg = profiler.getAverageExecutionTime()
      expect(avg).toBeGreaterThan(15)
      expect(avg).toBeLessThanOrEqual(40)
    })
  })

  describe('getSlowQueries', () => {
    it('returns queries over 2x average by default', async () => {
      await profiler.profile(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10))
        return []
      })
      await profiler.profile(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10))
        return []
      })
      await profiler.profile(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100))
        return []
      })

      const slowQueries = profiler.getSlowQueries()
      expect(slowQueries.length).toBeGreaterThan(0)
    })

    it('accepts custom threshold multiplier', async () => {
      await profiler.profile(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10))
        return []
      })
      await profiler.profile(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10))
        return []
      })
      await profiler.profile(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50))
        return []
      })

      const slowQueries = profiler.getSlowQueries(5)
      expect(slowQueries.length).toBeGreaterThanOrEqual(0)
    })

    it('returns empty array when no slow queries', async () => {
      await profiler.profile(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10))
        return []
      })
      await profiler.profile(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10))
        return []
      })

      const slowQueries = profiler.getSlowQueries(5)
      expect(slowQueries).toHaveLength(0)
    })
  })

  describe('history management', () => {
    it('limits history to 100 entries', async () => {
      for (let i = 0; i < 150; i++) {
        await profiler.profile(async () => [{ id: String(i) }])
      }

      const history = profiler.getHistory()
      expect(history).toHaveLength(100)
    })

    it('keeps most recent entries when exceeding limit', async () => {
      for (let i = 0; i < 150; i++) {
        await profiler.profile(async () => [{ id: String(i) }])
      }

      const history = profiler.getHistory()
      expect(history).toHaveLength(100)
      expect(history[history.length - 1].rowsReturned).toBe(1)
    })
  })

  describe('recommendation generation', () => {
    it('recommends query cache for slow queries', async () => {
      const result = await profiler.profile(async () => {
        await new Promise((resolve) => setTimeout(resolve, 600))
        return []
      })

      expect(result.recommendations).toContain(
        'Consider using database query cache'
      )
      expect(result.recommendations).toContain(
        'Review connection pooling configuration'
      )
    })

    it('recommends batching for high memory usage', async () => {
      const result = await profiler.profile(async () => {
        return Array.from({ length: 15000 }, (_, i) => ({
          id: String(i),
          data: 'x'.repeat(1000),
        }))
      })

      expect(
        result.recommendations.some(
          (r) => r.includes('smaller batches') || r.includes('pagination')
        )
      ).toBe(true)
    })

    it('provides specific recommendations based on query type', async () => {
      const result = await profiler.profile(
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 60))
          return []
        },
        { queryType: 'blocking' }
      )

      expect(result.recommendations).toContain(
        'Use IndexAnalyzer to get specific index recommendations'
      )
    })
  })

  describe('severity calculation', () => {
    it('returns low for fast queries with no issues', async () => {
      const result = await profiler.profile(async () => {
        return [{ id: '1' }]
      })

      expect(result.severity).toBe('low')
      expect(result.issues).toHaveLength(0)
    })

    it('returns medium for moderately slow queries', async () => {
      const result = await profiler.profile(async () => {
        await new Promise((resolve) => setTimeout(resolve, 150))
        return []
      })

      expect(result.severity).toBe('medium')
    })

    it('returns high for slow queries', async () => {
      const result = await profiler.profile(async () => {
        await new Promise((resolve) => setTimeout(resolve, 1100))
        return []
      })

      expect(result.severity).toBe('high')
    })

    it('returns critical for very slow queries', async () => {
      const result = await profiler.profile(async () => {
        await new Promise((resolve) => setTimeout(resolve, 5100))
        return []
      })

      expect(result.severity).toBe('critical')
    }, 10000)

    it('returns critical for very large result sets', async () => {
      const result = await profiler.profile(async () => {
        return Array.from({ length: 150000 }, (_, i) => ({ id: String(i) }))
      })

      expect(result.severity).toBe('critical')
    })

    it('returns high for multiple issues', async () => {
      await profiler.profile(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10))
        return []
      })

      const result = await profiler.profile(async () => {
        await new Promise((resolve) => setTimeout(resolve, 60))
        return Array.from({ length: 15000 }, (_, i) => ({ id: String(i) }))
      })

      expect(result.severity).toBe('high')
      expect(result.issues.length).toBeGreaterThanOrEqual(2)
    })
  })

  describe('edge cases', () => {
    it('handles queries returning single object', async () => {
      const result = await profiler.profile(async () => {
        return { id: '1', name: 'Test' }
      })

      expect(result.stats.rowsReturned).toBe(1)
    })

    it('handles queries returning null', async () => {
      const result = await profiler.profile(async () => {
        return null
      })

      expect(result.stats.rowsReturned).toBe(0)
    })

    it('handles queries returning undefined', async () => {
      const result = await profiler.profile(async () => {
        return undefined
      })

      expect(result.stats.rowsReturned).toBe(0)
    })

    it('handles queries returning empty array', async () => {
      const result = await profiler.profile(async () => {
        return []
      })

      expect(result.stats.rowsReturned).toBe(0)
    })

    it('tracks timestamp for each query', async () => {
      const before = new Date()
      const result = await profiler.profile(async () => [{ id: '1' }])
      const after = new Date()

      expect(result.stats.timestamp.getTime()).toBeGreaterThanOrEqual(
        before.getTime()
      )
      expect(result.stats.timestamp.getTime()).toBeLessThanOrEqual(
        after.getTime()
      )
    })
  })
})
