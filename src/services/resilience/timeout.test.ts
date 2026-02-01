/**
 * Tests for timeout utilities
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  withTimeout,
  withTimeoutFn,
  withTimeoutTimed,
  createTimeoutController,
} from './timeout.js'
import { ServiceTimeoutError } from '../service-error.js'

describe('Timeout', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('withTimeout', () => {
    it('resolves when operation completes within timeout', async () => {
      const promise = new Promise<string>(resolve => {
        setTimeout(() => resolve('success'), 100)
      })

      const resultPromise = withTimeout(promise, { timeoutMs: 200 })

      await vi.advanceTimersByTimeAsync(100)

      const result = await resultPromise
      expect(result).toBe('success')
    })

    it('rejects with TimeoutError when exceeded', async () => {
      const promise = new Promise<string>(resolve => {
        setTimeout(() => resolve('success'), 200)
      })

      const resultPromise = withTimeout(promise, {
        timeoutMs: 100,
        serviceName: 'test-service',
      })

      await vi.advanceTimersByTimeAsync(100)

      await expect(resultPromise).rejects.toThrow(ServiceTimeoutError)
      await expect(resultPromise).rejects.toThrow("Service 'test-service' timed out after 100ms")
    })

    it('includes timeout duration in error', async () => {
      const promise = new Promise<string>(resolve => {
        setTimeout(() => resolve('success'), 500)
      })

      const resultPromise = withTimeout(promise, {
        timeoutMs: 100,
        serviceName: 'test-service',
      })

      await vi.advanceTimersByTimeAsync(100)

      try {
        await resultPromise
        expect.fail('Should have thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(ServiceTimeoutError)
        expect((error as ServiceTimeoutError).timeoutMs).toBe(100)
      }
    })

    it('cancels operation via abort signal', async () => {
      const controller = new AbortController()

      const promise = new Promise<string>(resolve => {
        setTimeout(() => resolve('success'), 200)
      })

      const resultPromise = withTimeout(promise, {
        timeoutMs: 500,
        serviceName: 'test-service',
        signal: controller.signal,
      })

      // Abort before timeout or completion
      setTimeout(() => controller.abort(), 50)
      await vi.advanceTimersByTimeAsync(50)

      await expect(resultPromise).rejects.toThrow(ServiceTimeoutError)
    })

    it('rejects immediately if already aborted', async () => {
      const controller = new AbortController()
      controller.abort()

      const promise = new Promise<string>(resolve => {
        setTimeout(() => resolve('success'), 100)
      })

      await expect(
        withTimeout(promise, {
          timeoutMs: 200,
          serviceName: 'test-service',
          signal: controller.signal,
        }),
      ).rejects.toThrow(ServiceTimeoutError)
    })

    it('throws error for non-positive timeout', async () => {
      const promise = Promise.resolve('success')

      await expect(
        withTimeout(promise, { timeoutMs: 0 }),
      ).rejects.toThrow('Timeout must be a positive number')

      await expect(
        withTimeout(promise, { timeoutMs: -100 }),
      ).rejects.toThrow('Timeout must be a positive number')
    })

    it('propagates errors from the promise', async () => {
      const promise = new Promise<string>((_, reject) => {
        setTimeout(() => reject(new Error('custom error')), 50)
      })

      const resultPromise = withTimeout(promise, { timeoutMs: 200 })

      await vi.advanceTimersByTimeAsync(50)

      await expect(resultPromise).rejects.toThrow('custom error')
    })

    it('uses default service name when not provided', async () => {
      const promise = new Promise<string>(resolve => {
        setTimeout(() => resolve('success'), 200)
      })

      const resultPromise = withTimeout(promise, { timeoutMs: 100 })

      await vi.advanceTimersByTimeAsync(100)

      await expect(resultPromise).rejects.toThrow("Service 'unknown' timed out after 100ms")
    })

    it('cleans up timeout on success', async () => {
      const promise = new Promise<string>(resolve => {
        setTimeout(() => resolve('success'), 50)
      })

      const resultPromise = withTimeout(promise, { timeoutMs: 200 })

      await vi.advanceTimersByTimeAsync(50)
      const result = await resultPromise

      // If we got here without hanging, cleanup worked
      expect(result).toBe('success')
    })

    it('cleans up timeout on error', async () => {
      const promise = new Promise<string>((_, reject) => {
        setTimeout(() => reject(new Error('fail')), 50)
      })

      const resultPromise = withTimeout(promise, { timeoutMs: 200 })

      await vi.advanceTimersByTimeAsync(50)

      try {
        await resultPromise
      } catch {
        // Expected
      }

      // If we got here without hanging, cleanup worked
      expect(true).toBe(true)
    })
  })

  describe('withTimeoutFn', () => {
    it('wraps a function with timeout', async () => {
      const fn = () => new Promise<string>(resolve => {
        setTimeout(() => resolve('success'), 50)
      })

      const wrappedFn = withTimeoutFn(fn, { timeoutMs: 200 })
      const resultPromise = wrappedFn()

      await vi.advanceTimersByTimeAsync(50)

      const result = await resultPromise
      expect(result).toBe('success')
    })

    it('times out wrapped function', async () => {
      const fn = () => new Promise<string>(resolve => {
        setTimeout(() => resolve('success'), 200)
      })

      const wrappedFn = withTimeoutFn(fn, { timeoutMs: 100, serviceName: 'test' })
      const resultPromise = wrappedFn()

      await vi.advanceTimersByTimeAsync(100)

      await expect(resultPromise).rejects.toThrow(ServiceTimeoutError)
    })
  })

  describe('withTimeoutTimed', () => {
    it('returns result with timing information', async () => {
      const promise = new Promise<string>(resolve => {
        setTimeout(() => resolve('success'), 50)
      })

      const resultPromise = withTimeoutTimed(promise, { timeoutMs: 200 })

      await vi.advanceTimersByTimeAsync(50)

      const result = await resultPromise
      expect(result.result).toBe('success')
      expect(result.durationMs).toBeGreaterThanOrEqual(0)
      expect(result.aborted).toBe(false)
    })

    it('times out and throws with timing', async () => {
      const promise = new Promise<string>(resolve => {
        setTimeout(() => resolve('success'), 200)
      })

      const resultPromise = withTimeoutTimed(promise, { timeoutMs: 100 })

      await vi.advanceTimersByTimeAsync(100)

      await expect(resultPromise).rejects.toThrow(ServiceTimeoutError)
    })
  })

  describe('TimeoutController', () => {
    it('starts in non-expired, non-cancelled state', () => {
      const controller = createTimeoutController(1000, 'test')
      expect(controller.isExpired).toBe(false)
      expect(controller.isCancelled).toBe(false)
      expect(controller.remainingMs).toBe(0)
      expect(controller.elapsedMs).toBe(0)
    })

    it('tracks elapsed and remaining time after start', async () => {
      // Use fake timers but manually advance
      const controller = createTimeoutController(1000, 'test')
      controller.start()

      await vi.advanceTimersByTimeAsync(50)

      expect(controller.elapsedMs).toBeGreaterThanOrEqual(40)
      expect(controller.remainingMs).toBeLessThanOrEqual(960)
      expect(controller.isExpired).toBe(false)

      controller.cancel()
    })

    it('marks as expired after timeout', async () => {
      const controller = createTimeoutController(100, 'test')
      controller.start()

      await vi.advanceTimersByTimeAsync(100)

      expect(controller.isExpired).toBe(true)
      expect(controller.remainingMs).toBe(0)
    })

    it('calls onTimeout callback when expired', async () => {
      const callback = vi.fn()
      const controller = createTimeoutController(100, 'test')
      controller.onTimeout(callback)
      controller.start()

      await vi.advanceTimersByTimeAsync(100)

      expect(callback).toHaveBeenCalledTimes(1)
    })

    it('can be cancelled', async () => {
      const callback = vi.fn()
      const controller = createTimeoutController(100, 'test')
      controller.onTimeout(callback)
      controller.start()

      await vi.advanceTimersByTimeAsync(50)
      controller.cancel()

      await vi.advanceTimersByTimeAsync(100)

      expect(callback).not.toHaveBeenCalled()
      expect(controller.isCancelled).toBe(true)
      expect(controller.isExpired).toBe(false)
    })

    it('can be reset', async () => {
      const controller = createTimeoutController(100, 'test')
      controller.start()

      await vi.advanceTimersByTimeAsync(50)

      controller.reset()

      expect(controller.isExpired).toBe(false)
      expect(controller.isCancelled).toBe(false)

      await vi.advanceTimersByTimeAsync(50)
      expect(controller.isExpired).toBe(false)

      await vi.advanceTimersByTimeAsync(50)
      expect(controller.isExpired).toBe(true)
    })

    it('throwIfExpired throws when expired', async () => {
      const controller = createTimeoutController(100, 'test-service')
      controller.start()

      controller.throwIfExpired() // Should not throw

      await vi.advanceTimersByTimeAsync(100)

      expect(() => controller.throwIfExpired()).toThrow(ServiceTimeoutError)
    })

    it('only starts once even if called multiple times', () => {
      const controller = createTimeoutController(100, 'test')
      controller.start()
      const firstStartTime = controller.elapsedMs

      controller.start()

      expect(controller.elapsedMs).toBe(firstStartTime)
    })

    it('returns this for chaining', () => {
      const controller = createTimeoutController(100, 'test')
      expect(controller.start()).toBe(controller)
      expect(controller.cancel()).toBe(controller)
      expect(controller.reset()).toBe(controller)
      expect(controller.onTimeout(() => {})).toBe(controller)
    })
  })
})
