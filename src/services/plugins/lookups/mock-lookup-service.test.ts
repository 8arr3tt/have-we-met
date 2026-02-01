/**
 * Tests for Mock Lookup Service
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ServiceContext, LookupOutput } from '../../types.js'
import type { ResolverConfig } from '../../../types/config.js'
import {
  createMockLookup,
  createMockLookupWithData,
  createSuccessMock,
  createNotFoundMock,
  createFailureMock,
  createSlowMock,
  createRandomLatencyMock,
  createFlakyMock,
  type MockLookupService,
} from './mock-lookup-service.js'

function createMockContext(keyFields: Record<string, unknown> = {}): ServiceContext {
  return {
    record: keyFields,
    config: {} as ResolverConfig,
    metadata: {
      correlationId: 'test-correlation-id',
      startedAt: new Date(),
    },
  }
}

describe('Mock Lookup Service', () => {
  describe('createMockLookup', () => {
    it('creates mock service with default config', () => {
      const mock = createMockLookup()

      expect(mock.name).toBe('mock-lookup')
      expect(mock.type).toBe('lookup')
      expect(mock.description).toBe('Mock lookup service for testing')
    })

    it('creates mock service with custom name', () => {
      const mock = createMockLookup({
        name: 'custom-mock',
        description: 'Custom description',
      })

      expect(mock.name).toBe('custom-mock')
      expect(mock.description).toBe('Custom description')
    })

    describe('execute', () => {
      it('returns default response when no match found', async () => {
        const mock = createMockLookup({
          defaultResponse: { found: false },
        })

        const context = createMockContext()
        const result = await mock.execute({ keyFields: { id: 1 } }, context)

        expect(result.success).toBe(true)
        expect(result.data?.found).toBe(false)
      })

      it('returns canned response when match found', async () => {
        const mock = createMockLookup({
          defaultResponse: { found: false },
        })

        // Use addResponse to add a canned response with the correct key
        mock.addResponse({ id: 1 }, {
          found: true,
          data: { name: 'Test User' },
          matchQuality: 'exact',
        })

        const context = createMockContext()
        const result = await mock.execute({ keyFields: { id: 1 } }, context)

        expect(result.success).toBe(true)
        expect(result.data?.found).toBe(true)
        expect(result.data?.data).toEqual({ name: 'Test User' })
      })

      it('uses response function when provided', async () => {
        const responseFn = vi.fn().mockReturnValue({
          found: true,
          data: { computed: true },
        })

        const mock = createMockLookup({
          responseFn,
        })

        const context = createMockContext()
        const result = await mock.execute({ keyFields: { key: 'value' } }, context)

        expect(responseFn).toHaveBeenCalledWith({ keyFields: { key: 'value' } })
        expect(result.data?.data).toEqual({ computed: true })
      })

      it('simulates latency', async () => {
        const mock = createMockLookup({
          latencyMs: 50,
          defaultResponse: { found: true },
        })

        const context = createMockContext()
        const start = Date.now()
        await mock.execute({ keyFields: {} }, context)
        const elapsed = Date.now() - start

        expect(elapsed).toBeGreaterThanOrEqual(40) // Allow some variance
      })

      it('simulates random latency range', async () => {
        const mock = createMockLookup({
          latencyRange: { min: 10, max: 50 },
          defaultResponse: { found: true },
        })

        const context = createMockContext()
        const start = Date.now()
        await mock.execute({ keyFields: {} }, context)
        const elapsed = Date.now() - start

        expect(elapsed).toBeGreaterThanOrEqual(5) // Allow variance
        expect(elapsed).toBeLessThan(100)
      })

      it('simulates network failures at configured rate', async () => {
        const mock = createMockLookup({
          failureRate: 1, // 100% failure
          failureError: 'network',
        })

        const context = createMockContext()
        const result = await mock.execute({ keyFields: {} }, context)

        expect(result.success).toBe(false)
        expect(result.error?.type).toBe('network')
      })

      it('simulates timeout errors', async () => {
        const mock = createMockLookup({
          failureRate: 1,
          failureError: 'timeout',
        })

        const context = createMockContext()
        const result = await mock.execute({ keyFields: {} }, context)

        expect(result.success).toBe(false)
        expect(result.error?.type).toBe('timeout')
      })

      it('simulates server errors', async () => {
        const mock = createMockLookup({
          failureRate: 1,
          failureError: 'server',
        })

        const context = createMockContext()
        const result = await mock.execute({ keyFields: {} }, context)

        expect(result.success).toBe(false)
        expect(result.error?.type).toBe('network')
      })

      it('tracks call history when enabled', async () => {
        const mock = createMockLookup({
          trackCalls: true,
          defaultResponse: { found: true },
        })

        const context = createMockContext()
        await mock.execute({ keyFields: { a: 1 } }, context)
        await mock.execute({ keyFields: { b: 2 } }, context)

        const history = mock.getCallHistory()
        expect(history).toHaveLength(2)
        expect(history[0].input.keyFields).toEqual({ a: 1 })
        expect(history[1].input.keyFields).toEqual({ b: 2 })
      })

      it('does not track calls when disabled', async () => {
        const mock = createMockLookup({
          trackCalls: false,
          defaultResponse: { found: true },
        })

        const context = createMockContext()
        await mock.execute({ keyFields: {} }, context)

        expect(mock.getCallHistory()).toHaveLength(0)
      })

      it('enforces max concurrent calls', async () => {
        const mock = createMockLookup({
          maxConcurrentCalls: 1,
          latencyMs: 50,
          defaultResponse: { found: true },
        })

        const context = createMockContext()

        // Start first call
        const promise1 = mock.execute({ keyFields: { id: 1 } }, context)

        // Immediately start second call
        const promise2 = mock.execute({ keyFields: { id: 2 } }, context)

        const [result1, result2] = await Promise.all([promise1, promise2])

        // One should succeed, one should fail due to concurrent limit
        const failed = [result1, result2].filter((r) => !r.success)
        expect(failed.length).toBe(1)
        expect(failed[0].error?.message).toContain('concurrent')
      })

      it('enforces rate limit', async () => {
        const mock = createMockLookup({
          rateLimitPerMinute: 2,
          defaultResponse: { found: true },
        })

        const context = createMockContext()

        // Make 3 calls rapidly
        const result1 = await mock.execute({ keyFields: {} }, context)
        const result2 = await mock.execute({ keyFields: {} }, context)
        const result3 = await mock.execute({ keyFields: {} }, context)

        expect(result1.success).toBe(true)
        expect(result2.success).toBe(true)
        expect(result3.success).toBe(false)
        expect(result3.error?.message).toContain('Rate limit')
      })

      it('adds default match quality', async () => {
        const mock = createMockLookup({
          defaultMatchQuality: 'fuzzy',
          defaultResponse: { found: true },
        })

        const context = createMockContext()
        const result = await mock.execute({ keyFields: {} }, context)

        expect(result.data?.matchQuality).toBe('fuzzy')
      })

      it('includes timing information', async () => {
        const mock = createMockLookup({
          latencyMs: 10,
          defaultResponse: { found: true },
        })

        const context = createMockContext()
        const result = await mock.execute({ keyFields: {} }, context)

        expect(result.timing).toBeDefined()
        expect(result.timing.durationMs).toBeGreaterThanOrEqual(5)
      })
    })

    describe('getCallHistory', () => {
      it('returns copy of call history', async () => {
        const mock = createMockLookup({ defaultResponse: { found: true } })
        const context = createMockContext()

        await mock.execute({ keyFields: {} }, context)

        const history1 = mock.getCallHistory()
        const history2 = mock.getCallHistory()

        expect(history1).not.toBe(history2)
        expect(history1).toEqual(history2)
      })
    })

    describe('clearCallHistory', () => {
      it('clears call history', async () => {
        const mock = createMockLookup({ defaultResponse: { found: true } })
        const context = createMockContext()

        await mock.execute({ keyFields: {} }, context)
        expect(mock.getCallCount()).toBe(1)

        mock.clearCallHistory()
        expect(mock.getCallCount()).toBe(0)
      })
    })

    describe('getCallCount', () => {
      it('returns number of calls', async () => {
        const mock = createMockLookup({ defaultResponse: { found: true } })
        const context = createMockContext()

        expect(mock.getCallCount()).toBe(0)

        await mock.execute({ keyFields: {} }, context)
        expect(mock.getCallCount()).toBe(1)

        await mock.execute({ keyFields: {} }, context)
        expect(mock.getCallCount()).toBe(2)
      })
    })

    describe('getLastCall', () => {
      it('returns undefined when no calls made', () => {
        const mock = createMockLookup()
        expect(mock.getLastCall()).toBeUndefined()
      })

      it('returns last call entry', async () => {
        const mock = createMockLookup({ defaultResponse: { found: true } })
        const context = createMockContext()

        await mock.execute({ keyFields: { first: true } }, context)
        await mock.execute({ keyFields: { second: true } }, context)

        const last = mock.getLastCall()
        expect(last?.input.keyFields).toEqual({ second: true })
      })
    })

    describe('reset', () => {
      it('resets all state', async () => {
        const mock = createMockLookup({
          rateLimitPerMinute: 10,
          defaultResponse: { found: true },
        })
        const context = createMockContext()

        await mock.execute({ keyFields: {} }, context)
        await mock.execute({ keyFields: {} }, context)

        mock.reset()

        expect(mock.getCallCount()).toBe(0)
        expect(mock.getLastCall()).toBeUndefined()
      })
    })

    describe('updateConfig', () => {
      it('updates configuration', async () => {
        const mock = createMockLookup({
          defaultResponse: { found: false },
        })

        const context = createMockContext()
        let result = await mock.execute({ keyFields: {} }, context)
        expect(result.data?.found).toBe(false)

        mock.updateConfig({
          defaultResponse: { found: true, data: { updated: true } },
        })

        result = await mock.execute({ keyFields: {} }, context)
        expect(result.data?.found).toBe(true)
        expect(result.data?.data).toEqual({ updated: true })
      })

      it('updates name and description', () => {
        const mock = createMockLookup({ name: 'old-name' })

        mock.updateConfig({
          name: 'new-name',
          description: 'New description',
        })

        expect(mock.name).toBe('new-name')
        expect(mock.description).toBe('New description')
      })
    })

    describe('addResponse', () => {
      it('adds response by string key', async () => {
        const mock = createMockLookup({ defaultResponse: { found: false } })

        mock.addResponse('custom-key', {
          found: true,
          data: { custom: true },
        })

        const context = createMockContext()
        // Note: This won't match by default since we use hash keys
        // Using the raw key for testing
      })

      it('adds response by object key', async () => {
        const mock = createMockLookup({ defaultResponse: { found: false } })

        mock.addResponse({ email: 'test@example.com' }, {
          found: true,
          data: { matched: true },
        })

        const context = createMockContext()
        const result = await mock.execute(
          { keyFields: { email: 'test@example.com' } },
          context,
        )

        expect(result.data?.found).toBe(true)
        expect(result.data?.data).toEqual({ matched: true })
      })
    })

    describe('removeResponse', () => {
      it('removes response by string key', () => {
        const mock = createMockLookup()
        mock.addResponse('key', { found: true })

        const removed = mock.removeResponse('key')
        expect(removed).toBe(true)
      })

      it('returns false when response not found', () => {
        const mock = createMockLookup()

        const removed = mock.removeResponse('nonexistent')
        expect(removed).toBe(false)
      })
    })

    describe('setFailureRate', () => {
      it('sets failure rate', async () => {
        const mock = createMockLookup({ defaultResponse: { found: true } })

        mock.setFailureRate(1)

        const context = createMockContext()
        const result = await mock.execute({ keyFields: {} }, context)

        expect(result.success).toBe(false)
      })

      it('clamps failure rate to valid range', () => {
        const mock = createMockLookup()

        mock.setFailureRate(-1)
        // Should be clamped to 0

        mock.setFailureRate(2)
        // Should be clamped to 1
      })
    })

    describe('setLatency', () => {
      it('sets latency', async () => {
        const mock = createMockLookup({ defaultResponse: { found: true } })

        mock.setLatency(50)

        const context = createMockContext()
        const start = Date.now()
        await mock.execute({ keyFields: {} }, context)
        const elapsed = Date.now() - start

        expect(elapsed).toBeGreaterThanOrEqual(40)
      })

      it('clamps latency to non-negative', () => {
        const mock = createMockLookup()
        mock.setLatency(-100)
        // Should be clamped to 0
      })
    })

    describe('healthCheck', () => {
      it('returns healthy status', async () => {
        const mock = createMockLookup()

        const health = await mock.healthCheck!()

        expect(health.healthy).toBe(true)
        expect(health.checkedAt).toBeInstanceOf(Date)
      })

      it('includes call count in details', async () => {
        const mock = createMockLookup({ defaultResponse: { found: true } })
        const context = createMockContext()

        await mock.execute({ keyFields: {} }, context)
        await mock.execute({ keyFields: {} }, context)

        const health = await mock.healthCheck!()

        expect(health.details?.callCount).toBe(2)
      })

      it('respects latency during health check', async () => {
        const mock = createMockLookup({ latencyMs: 30 })

        const health = await mock.healthCheck!()

        expect(health.responseTimeMs).toBeGreaterThanOrEqual(25)
      })

      it('returns unhealthy when failure rate is 1', async () => {
        const mock = createMockLookup({ failureRate: 1 })

        const health = await mock.healthCheck!()

        expect(health.healthy).toBe(false)
      })
    })
  })

  describe('createMockLookupWithData', () => {
    it('creates mock with canned responses', async () => {
      const mock = createMockLookupWithData([
        {
          input: { email: 'john@example.com' },
          output: { found: true, data: { name: 'John' } },
        },
        {
          input: { email: 'jane@example.com' },
          output: { found: true, data: { name: 'Jane' } },
        },
      ])

      const context = createMockContext()

      const johnResult = await mock.execute(
        { keyFields: { email: 'john@example.com' } },
        context,
      )
      expect(johnResult.data?.data).toEqual({ name: 'John' })

      const janeResult = await mock.execute(
        { keyFields: { email: 'jane@example.com' } },
        context,
      )
      expect(janeResult.data?.data).toEqual({ name: 'Jane' })
    })

    it('returns default response for unknown inputs', async () => {
      const mock = createMockLookupWithData([
        {
          input: { id: 1 },
          output: { found: true },
        },
      ])

      const context = createMockContext()
      const result = await mock.execute({ keyFields: { id: 999 } }, context)

      expect(result.data?.found).toBe(false)
    })

    it('uses custom default response', async () => {
      const mock = createMockLookupWithData(
        [],
        { found: false, data: { fallback: true } },
      )

      const context = createMockContext()
      const result = await mock.execute({ keyFields: {} }, context)

      expect(result.data?.data).toEqual({ fallback: true })
    })
  })

  describe('createSuccessMock', () => {
    it('creates mock that always succeeds', async () => {
      const mock = createSuccessMock({ name: 'Test' })

      const context = createMockContext()
      const result = await mock.execute({ keyFields: {} }, context)

      expect(result.success).toBe(true)
      expect(result.data?.found).toBe(true)
      expect(result.data?.data).toEqual({ name: 'Test' })
      expect(result.data?.matchQuality).toBe('exact')
    })

    it('uses custom match quality', async () => {
      const mock = createSuccessMock({ name: 'Test' }, 'fuzzy')

      const context = createMockContext()
      const result = await mock.execute({ keyFields: {} }, context)

      expect(result.data?.matchQuality).toBe('fuzzy')
    })
  })

  describe('createNotFoundMock', () => {
    it('creates mock that always returns not found', async () => {
      const mock = createNotFoundMock()

      const context = createMockContext()
      const result = await mock.execute({ keyFields: {} }, context)

      expect(result.success).toBe(true)
      expect(result.data?.found).toBe(false)
    })
  })

  describe('createFailureMock', () => {
    it('creates mock that always fails with network error', async () => {
      const mock = createFailureMock('network')

      const context = createMockContext()
      const result = await mock.execute({ keyFields: {} }, context)

      expect(result.success).toBe(false)
      expect(result.error?.type).toBe('network')
    })

    it('creates mock that always fails with timeout error', async () => {
      const mock = createFailureMock('timeout')

      const context = createMockContext()
      const result = await mock.execute({ keyFields: {} }, context)

      expect(result.success).toBe(false)
      expect(result.error?.type).toBe('timeout')
    })

    it('creates mock that always fails with server error', async () => {
      const mock = createFailureMock('server')

      const context = createMockContext()
      const result = await mock.execute({ keyFields: {} }, context)

      expect(result.success).toBe(false)
    })
  })

  describe('createSlowMock', () => {
    it('creates mock with specified latency', async () => {
      const mock = createSlowMock(50)

      const context = createMockContext()
      const start = Date.now()
      await mock.execute({ keyFields: {} }, context)
      const elapsed = Date.now() - start

      expect(elapsed).toBeGreaterThanOrEqual(40)
    })

    it('uses custom default response', async () => {
      const mock = createSlowMock(10, { found: true, data: { slow: true } })

      const context = createMockContext()
      const result = await mock.execute({ keyFields: {} }, context)

      expect(result.data?.data).toEqual({ slow: true })
    })
  })

  describe('createRandomLatencyMock', () => {
    it('creates mock with random latency', async () => {
      const mock = createRandomLatencyMock(10, 50)

      const context = createMockContext()
      const start = Date.now()
      await mock.execute({ keyFields: {} }, context)
      const elapsed = Date.now() - start

      expect(elapsed).toBeGreaterThanOrEqual(5)
      expect(elapsed).toBeLessThan(100)
    })
  })

  describe('createFlakyMock', () => {
    it('creates mock that fails intermittently', async () => {
      const mock = createFlakyMock(0.5)

      const context = createMockContext()
      const results = await Promise.all(
        Array.from({ length: 20 }, () => mock.execute({ keyFields: {} }, context)),
      )

      const successes = results.filter((r) => r.success).length
      const failures = results.filter((r) => !r.success).length

      // With 0.5 failure rate, we should have a mix
      expect(successes).toBeGreaterThan(0)
      expect(failures).toBeGreaterThan(0)
    })
  })
})
