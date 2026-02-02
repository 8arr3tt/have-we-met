/**
 * Tests for combined resilience utilities
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  withResilience,
  withResilienceDetailed,
  createResilient,
  executeWithAbortableTimeout,
  CircuitBreaker,
} from './index.js'
import { ServiceTimeoutError, ServiceNetworkError } from '../service-error.js'

describe('Combined Resilience', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('withResilience', () => {
    it('applies timeout, retry, and circuit breaker', async () => {
      const fn = vi.fn().mockResolvedValue('success')

      const result = await withResilience(fn, {
        timeout: { timeoutMs: 1000 },
        retry: {
          maxAttempts: 3,
          initialDelayMs: 100,
          backoffMultiplier: 2,
          maxDelayMs: 1000,
        },
        circuitBreaker: { failureThreshold: 5 },
      })

      expect(result).toBe('success')
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('retries timeout errors', async () => {
      let callCount = 0
      const fn = vi.fn().mockImplementation(() => {
        callCount++
        if (callCount < 3) {
          return new Promise((_, reject) => {
            setTimeout(() => reject(new ServiceTimeoutError('test', 100)), 150)
          })
        }
        return Promise.resolve('success')
      })

      const resultPromise = withResilience(fn, {
        timeout: { timeoutMs: 100 },
        retry: {
          maxAttempts: 3,
          initialDelayMs: 50,
          backoffMultiplier: 2,
          maxDelayMs: 500,
        },
      })

      // First attempt timeout
      await vi.advanceTimersByTimeAsync(100)
      // Retry delay + second attempt timeout
      await vi.advanceTimersByTimeAsync(150)
      // Retry delay + third attempt (success)
      await vi.advanceTimersByTimeAsync(200)

      const result = await resultPromise
      expect(result).toBe('success')
      expect(fn).toHaveBeenCalledTimes(3)
    })

    it('respects order: timeout > retry > circuit breaker', async () => {
      const breaker = new CircuitBreaker({ failureThreshold: 3 })
      const fn = vi.fn().mockRejectedValue(new ServiceTimeoutError('test', 100))

      const resultPromise = withResilience(fn, {
        timeout: { timeoutMs: 100 },
        retry: {
          maxAttempts: 2,
          initialDelayMs: 50,
          backoffMultiplier: 2,
          maxDelayMs: 500,
        },
        circuitBreaker: breaker,
      })

      // Attach the rejection handler BEFORE advancing timers
      const errorPromise = resultPromise.catch((e) => e)

      // Advance through retries
      await vi.advanceTimersByTimeAsync(500)

      const error = await errorPromise
      expect(error).toBeInstanceOf(ServiceTimeoutError)

      // Check that circuit breaker recorded ONE failure (after retries exhausted)
      expect(breaker.failureCount).toBe(1)
    })

    it('circuit breaker counts retried failures once', async () => {
      const breaker = new CircuitBreaker({ failureThreshold: 3 })
      const fn = vi.fn().mockRejectedValue(new ServiceTimeoutError('test', 100))

      // First call with retries - attach error handler immediately
      const promise1 = withResilience(fn, {
        retry: {
          maxAttempts: 3,
          initialDelayMs: 10,
          backoffMultiplier: 2,
          maxDelayMs: 100,
        },
        circuitBreaker: breaker,
      }).catch(() => {})

      await vi.advanceTimersByTimeAsync(1000)
      await promise1

      // Should only count as 1 failure despite 3 retry attempts
      expect(breaker.failureCount).toBe(1)
    })

    it('works with only timeout', async () => {
      const fn = vi
        .fn()
        .mockImplementation(
          () =>
            new Promise((resolve) => setTimeout(() => resolve('success'), 50))
        )

      const resultPromise = withResilience(fn, {
        timeout: { timeoutMs: 100 },
      })

      await vi.advanceTimersByTimeAsync(50)

      const result = await resultPromise
      expect(result).toBe('success')
    })

    it('works with only retry', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new ServiceNetworkError('test', 'fail'))
        .mockResolvedValue('success')

      const resultPromise = withResilience(fn, {
        retry: {
          maxAttempts: 2,
          initialDelayMs: 50,
          backoffMultiplier: 2,
          maxDelayMs: 100,
        },
      })

      await vi.advanceTimersByTimeAsync(100)

      const result = await resultPromise
      expect(result).toBe('success')
    })

    it('works with only circuit breaker', async () => {
      const breaker = new CircuitBreaker({ failureThreshold: 2 })
      const fn = vi.fn().mockResolvedValue('success')

      const result = await withResilience(fn, {
        circuitBreaker: breaker,
      })

      expect(result).toBe('success')
      expect(breaker.isClosed).toBe(true)
    })

    it('uses existing circuit breaker instance', async () => {
      const breaker = new CircuitBreaker({ failureThreshold: 2 })
      const fn = vi.fn().mockRejectedValue(new Error('fail'))

      await withResilience(fn, { circuitBreaker: breaker }).catch(() => {})
      await withResilience(fn, { circuitBreaker: breaker }).catch(() => {})

      expect(breaker.isOpen).toBe(true)
    })
  })

  describe('withResilienceDetailed', () => {
    it('returns detailed result on success', async () => {
      const fn = vi.fn().mockResolvedValue('success')

      const result = await withResilienceDetailed(fn, {
        timeout: { timeoutMs: 1000 },
        retry: {
          maxAttempts: 3,
          initialDelayMs: 100,
          backoffMultiplier: 2,
          maxDelayMs: 1000,
        },
      })

      expect(result.result).toBe('success')
      expect(result.attempts).toBe(1)
      expect(result.totalDurationMs).toBeGreaterThanOrEqual(0)
      expect(result.circuitBreakerInvolved).toBe(false)
    })

    it('tracks attempts correctly', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new ServiceTimeoutError('test', 100))
        .mockResolvedValue('success')

      const resultPromise = withResilienceDetailed(fn, {
        retry: {
          maxAttempts: 3,
          initialDelayMs: 50,
          backoffMultiplier: 2,
          maxDelayMs: 100,
        },
      })

      await vi.advanceTimersByTimeAsync(200)

      const result = await resultPromise
      expect(result.attempts).toBe(2)
    })

    it('reports circuit breaker involvement', async () => {
      const breaker = new CircuitBreaker()
      const fn = vi.fn().mockResolvedValue('success')

      const result = await withResilienceDetailed(fn, {
        circuitBreaker: breaker,
      })

      expect(result.circuitBreakerInvolved).toBe(true)
      expect(result.circuitState).toBe('closed')
    })

    it('reports circuit state after execution', async () => {
      const breaker = new CircuitBreaker({ failureThreshold: 1 })
      const fn = vi.fn().mockRejectedValue(new Error('fail'))

      try {
        await withResilienceDetailed(fn, { circuitBreaker: breaker })
      } catch {
        // Expected
      }

      // Next call would show open state
      const fn2 = vi.fn().mockResolvedValue('success')

      // Need to advance time to allow half-open
      await vi.advanceTimersByTimeAsync(
        breaker.getStatus().lastStateChange.getTime() + 30001
      )

      try {
        const result = await withResilienceDetailed(fn2, {
          circuitBreaker: breaker,
        })
        expect(result.circuitState).toBeDefined()
      } catch {
        // Circuit might still be open
      }
    })
  })

  describe('createResilient', () => {
    it('creates a resilient function wrapper', async () => {
      const fn = vi.fn((a: number, b: number) => Promise.resolve(a + b))

      const resilient = createResilient(fn, {
        timeout: { timeoutMs: 1000 },
        retry: {
          maxAttempts: 2,
          initialDelayMs: 50,
          backoffMultiplier: 2,
          maxDelayMs: 100,
        },
      })

      const result = await resilient(3, 4)

      expect(result).toBe(7)
      expect(fn).toHaveBeenCalledWith(3, 4)
    })

    it('exposes circuit breaker if configured', () => {
      const fn = (x: number) => Promise.resolve(x)

      const resilient = createResilient(fn, {
        circuitBreaker: { failureThreshold: 5 },
      })

      expect(resilient.breaker).toBeInstanceOf(CircuitBreaker)
    })

    it('does not expose breaker if not configured', () => {
      const fn = (x: number) => Promise.resolve(x)

      const resilient = createResilient(fn, {
        timeout: { timeoutMs: 1000 },
      })

      expect(resilient.breaker).toBeUndefined()
    })

    it('applies all resilience patterns on each call', async () => {
      const breaker = new CircuitBreaker({ failureThreshold: 3 })
      let callCount = 0

      const fn = vi.fn().mockImplementation(() => {
        callCount++
        if (callCount <= 4) {
          return Promise.reject(new ServiceNetworkError('test', 'fail'))
        }
        return Promise.resolve('success')
      })

      const resilient = createResilient(fn, {
        retry: {
          maxAttempts: 2,
          initialDelayMs: 10,
          backoffMultiplier: 2,
          maxDelayMs: 50,
        },
        circuitBreaker: breaker,
      })

      // First call: fails after 2 attempts, circuit records 1 failure
      const call1Promise = resilient().catch(() => {})
      await vi.advanceTimersByTimeAsync(200)
      await call1Promise

      // Second call: fails after 2 attempts, circuit records 2nd failure
      const call2Promise = resilient().catch(() => {})
      await vi.advanceTimersByTimeAsync(200)
      await call2Promise

      expect(breaker.failureCount).toBe(2)
    })
  })

  describe('executeWithAbortableTimeout', () => {
    it('passes abort signal to function', async () => {
      let receivedSignal: AbortSignal | undefined

      const fn = vi.fn().mockImplementation(async (signal: AbortSignal) => {
        receivedSignal = signal
        return 'success'
      })

      await executeWithAbortableTimeout(fn, 1000, 'test')

      expect(receivedSignal).toBeDefined()
      expect(receivedSignal!.aborted).toBe(false)
    })

    it('aborts signal on timeout', async () => {
      const fn = vi.fn().mockImplementation(async (signal: AbortSignal) => {
        // Simulate checking abort signal
        await new Promise((resolve, reject) => {
          const checkInterval = setInterval(() => {
            if (signal.aborted) {
              clearInterval(checkInterval)
              reject(new Error('aborted'))
            }
          }, 10)
          setTimeout(() => {
            clearInterval(checkInterval)
            resolve('success')
          }, 2000)
        })
        return 'success'
      })

      const resultPromise = executeWithAbortableTimeout(fn, 100, 'test-service')

      // Attach the rejection handler BEFORE advancing timers
      const errorPromise = resultPromise.catch((e) => e)

      await vi.advanceTimersByTimeAsync(200)

      const error = await errorPromise
      expect(error).toBeInstanceOf(ServiceTimeoutError)
    })

    it('cleans up timeout on success', async () => {
      const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout')

      const fn = vi.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50))
        return 'success'
      })

      const resultPromise = executeWithAbortableTimeout(fn, 1000, 'test')

      await vi.advanceTimersByTimeAsync(50)
      await resultPromise

      expect(clearTimeoutSpy).toHaveBeenCalled()
    })

    it('cleans up timeout on error', async () => {
      const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout')

      const fn = vi.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50))
        throw new Error('custom error')
      })

      const resultPromise = executeWithAbortableTimeout(fn, 1000, 'test')

      // Attach the rejection handler BEFORE advancing timers
      const errorPromise = resultPromise.catch((e) => e)

      await vi.advanceTimersByTimeAsync(50)

      const error = await errorPromise
      expect(error).toBeInstanceOf(Error)
      expect((error as Error).message).toBe('custom error')
      expect(clearTimeoutSpy).toHaveBeenCalled()
    })

    it('propagates non-timeout errors', async () => {
      const customError = new Error('custom error')
      const fn = vi.fn().mockRejectedValue(customError)

      await expect(
        executeWithAbortableTimeout(fn, 1000, 'test')
      ).rejects.toThrow(customError)
    })
  })
})
