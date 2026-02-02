/**
 * Tests for retry utilities
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  withRetry,
  withRetryDetailed,
  createRetryable,
  calculateRetryDelay,
  shouldRetryError,
  RetryTracker,
  DEFAULT_RETRY_CONFIG,
} from './retry.js'
import {
  ServiceTimeoutError,
  ServiceNetworkError,
  ServiceError,
} from '../service-error.js'

describe('Retry', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('calculateRetryDelay', () => {
    it('calculates exponential backoff', () => {
      const config = {
        initialDelayMs: 100,
        backoffMultiplier: 2,
        maxDelayMs: 10000,
        maxAttempts: 5,
      }

      // Note: jitter adds ±20%, so we check the base calculation
      vi.spyOn(Math, 'random').mockReturnValue(0.5) // No jitter (0.5 -> 0 jitter)

      const delay1 = calculateRetryDelay(1, config)
      const delay2 = calculateRetryDelay(2, config)
      const delay3 = calculateRetryDelay(3, config)

      expect(delay1).toBe(100) // 100 * 2^0 = 100
      expect(delay2).toBe(200) // 100 * 2^1 = 200
      expect(delay3).toBe(400) // 100 * 2^2 = 400
    })

    it('respects max delay cap', () => {
      const config = {
        initialDelayMs: 1000,
        backoffMultiplier: 10,
        maxDelayMs: 5000,
        maxAttempts: 5,
      }

      vi.spyOn(Math, 'random').mockReturnValue(0.5)

      const delay = calculateRetryDelay(3, config) // Would be 100000 without cap
      expect(delay).toBe(5000)
    })

    it('adds jitter to delay', () => {
      const config = {
        initialDelayMs: 1000,
        backoffMultiplier: 2,
        maxDelayMs: 10000,
        maxAttempts: 5,
      }

      // With random = 0, jitter is -20%
      vi.spyOn(Math, 'random').mockReturnValue(0)
      const delayMin = calculateRetryDelay(1, config)
      expect(delayMin).toBe(800) // 1000 - 200

      // With random = 1, jitter is +20%
      vi.spyOn(Math, 'random').mockReturnValue(1)
      const delayMax = calculateRetryDelay(1, config)
      expect(delayMax).toBe(1200) // 1000 + 200
    })
  })

  describe('shouldRetryError', () => {
    it('retries timeout errors when configured', () => {
      const error = new ServiceTimeoutError('test', 1000)
      expect(
        shouldRetryError(error, {
          ...DEFAULT_RETRY_CONFIG,
          retryOn: ['timeout'],
        })
      ).toBe(true)
    })

    it('retries network errors when configured', () => {
      const error = new ServiceNetworkError('test', 'connection failed')
      expect(
        shouldRetryError(error, {
          ...DEFAULT_RETRY_CONFIG,
          retryOn: ['network'],
        })
      ).toBe(true)
    })

    it('retries server errors when configured', () => {
      const error = new ServiceError('Server error', 'ERR', 'unknown', true)
      expect(
        shouldRetryError(error, {
          ...DEFAULT_RETRY_CONFIG,
          retryOn: ['server'],
        })
      ).toBe(true)
    })

    it('retries all errors when configured with "all"', () => {
      const error = new Error('any error')
      expect(
        shouldRetryError(error, { ...DEFAULT_RETRY_CONFIG, retryOn: ['all'] })
      ).toBe(true)
    })

    it('does not retry errors marked as not retryable', () => {
      const error = new ServiceError('Non-retryable', 'ERR', 'timeout', false)
      expect(
        shouldRetryError(error, {
          ...DEFAULT_RETRY_CONFIG,
          retryOn: ['timeout'],
        })
      ).toBe(false)
    })

    it('does not retry unknown error types when not in retryOn', () => {
      const error = new Error('unknown error')
      expect(
        shouldRetryError(error, {
          ...DEFAULT_RETRY_CONFIG,
          retryOn: ['timeout'],
        })
      ).toBe(false)
    })

    it('uses retryable flag when error type not matched', () => {
      const error = new ServiceError('Custom', 'ERR', 'validation', true)
      // Not in retryOn but marked retryable
      expect(
        shouldRetryError(error, {
          ...DEFAULT_RETRY_CONFIG,
          retryOn: ['timeout'],
        })
      ).toBe(true)
    })
  })

  describe('withRetry', () => {
    it('succeeds on first attempt without retry', async () => {
      const fn = vi.fn().mockResolvedValue('success')

      const result = await withRetry(fn, DEFAULT_RETRY_CONFIG)

      expect(result).toBe('success')
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('retries on failure up to max attempts', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new ServiceTimeoutError('test', 1000))
        .mockRejectedValueOnce(new ServiceTimeoutError('test', 1000))
        .mockResolvedValue('success')

      const resultPromise = withRetry(fn, {
        ...DEFAULT_RETRY_CONFIG,
        maxAttempts: 3,
      })

      // First retry delay
      await vi.advanceTimersByTimeAsync(
        DEFAULT_RETRY_CONFIG.initialDelayMs * 1.5
      )
      // Second retry delay
      await vi.advanceTimersByTimeAsync(DEFAULT_RETRY_CONFIG.initialDelayMs * 3)

      const result = await resultPromise
      expect(result).toBe('success')
      expect(fn).toHaveBeenCalledTimes(3)
    })

    it('throws last error after max attempts exhausted', async () => {
      const error = new ServiceTimeoutError('test', 1000)
      const fn = vi.fn().mockRejectedValue(error)

      const resultPromise = withRetry(fn, {
        ...DEFAULT_RETRY_CONFIG,
        maxAttempts: 3,
      })

      // Attach the rejection handler BEFORE advancing timers
      const errorPromise = resultPromise.catch((e) => e)

      // Advance through all retries
      await vi.advanceTimersByTimeAsync(DEFAULT_RETRY_CONFIG.maxDelayMs * 3)

      const thrownError = await errorPromise
      expect(thrownError).toBe(error)
      expect(fn).toHaveBeenCalledTimes(3)
    })

    it('only retries configured error types', async () => {
      const validationError = new ServiceError(
        'Invalid',
        'ERR',
        'validation',
        false
      )
      const fn = vi.fn().mockRejectedValue(validationError)

      await expect(
        withRetry(fn, {
          ...DEFAULT_RETRY_CONFIG,
          maxAttempts: 3,
          retryOn: ['timeout'],
        })
      ).rejects.toThrow(validationError)

      expect(fn).toHaveBeenCalledTimes(1) // No retry
    })

    it('calls onRetry callback before each retry', async () => {
      const onRetry = vi.fn()
      const error = new ServiceTimeoutError('test', 1000)
      const fn = vi
        .fn()
        .mockRejectedValueOnce(error)
        .mockResolvedValue('success')

      const resultPromise = withRetry(fn, {
        ...DEFAULT_RETRY_CONFIG,
        maxAttempts: 3,
        onRetry,
      })

      await vi.advanceTimersByTimeAsync(DEFAULT_RETRY_CONFIG.maxDelayMs)

      await resultPromise

      expect(onRetry).toHaveBeenCalledTimes(1)
      expect(onRetry).toHaveBeenCalledWith(error, 1, expect.any(Number))
    })

    it('uses custom shouldRetry function when provided', async () => {
      const customError = new Error('custom')
      const fn = vi
        .fn()
        .mockRejectedValueOnce(customError)
        .mockResolvedValue('success')

      const shouldRetry = vi.fn().mockReturnValue(true)

      const resultPromise = withRetry(fn, {
        ...DEFAULT_RETRY_CONFIG,
        maxAttempts: 3,
        shouldRetry,
      })

      await vi.advanceTimersByTimeAsync(DEFAULT_RETRY_CONFIG.maxDelayMs)

      await resultPromise

      expect(shouldRetry).toHaveBeenCalledWith(customError, 1)
    })

    it('aborts when signal is aborted', async () => {
      const controller = new AbortController()
      const fn = vi
        .fn()
        .mockRejectedValue(new ServiceTimeoutError('test', 1000))

      const resultPromise = withRetry(fn, {
        ...DEFAULT_RETRY_CONFIG,
        maxAttempts: 5,
        signal: controller.signal,
      })

      // Attach the rejection handler BEFORE advancing timers
      const errorPromise = resultPromise.catch((e) => e)

      // Abort after first failure
      await vi.advanceTimersByTimeAsync(1)
      controller.abort()
      await vi.advanceTimersByTimeAsync(DEFAULT_RETRY_CONFIG.maxDelayMs)

      const error = await errorPromise
      expect((error as Error).message).toContain('aborted')
    })

    it('does not wait between attempts when already aborted', async () => {
      const controller = new AbortController()
      controller.abort()

      const fn = vi.fn().mockRejectedValue(new Error('fail'))

      await expect(
        withRetry(fn, {
          ...DEFAULT_RETRY_CONFIG,
          signal: controller.signal,
        })
      ).rejects.toThrow('aborted')

      expect(fn).not.toHaveBeenCalled()
    })
  })

  describe('withRetryDetailed', () => {
    it('returns detailed result on success', async () => {
      const fn = vi.fn().mockResolvedValue('success')

      const result = await withRetryDetailed(fn, DEFAULT_RETRY_CONFIG)

      expect(result.result).toBe('success')
      expect(result.attempts).toBe(1)
      expect(result.totalDurationMs).toBeGreaterThanOrEqual(0)
      expect(result.attemptDetails).toHaveLength(1)
      expect(result.attemptDetails[0].success).toBe(true)
      expect(result.attemptDetails[0].attempt).toBe(1)
    })

    it('tracks retry count in metadata', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new ServiceTimeoutError('test', 1000))
        .mockResolvedValue('success')

      const resultPromise = withRetryDetailed(fn, {
        ...DEFAULT_RETRY_CONFIG,
        maxAttempts: 3,
      })

      await vi.advanceTimersByTimeAsync(DEFAULT_RETRY_CONFIG.maxDelayMs)

      const result = await resultPromise

      expect(result.attempts).toBe(2)
      expect(result.attemptDetails).toHaveLength(2)
      expect(result.attemptDetails[0].success).toBe(false)
      expect(result.attemptDetails[0].error).toBeInstanceOf(ServiceTimeoutError)
      expect(result.attemptDetails[1].success).toBe(true)
    })

    it('includes delay information in attempt details', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5)

      const fn = vi
        .fn()
        .mockRejectedValueOnce(new ServiceTimeoutError('test', 1000))
        .mockResolvedValue('success')

      const resultPromise = withRetryDetailed(fn, {
        ...DEFAULT_RETRY_CONFIG,
        maxAttempts: 3,
        initialDelayMs: 100,
      })

      await vi.advanceTimersByTimeAsync(200)

      const result = await resultPromise

      expect(result.attemptDetails[0].delayBeforeNextMs).toBe(100)
      expect(result.attemptDetails[1].delayBeforeNextMs).toBe(0) // Last attempt
    })

    it('throws with attempt details on failure', async () => {
      const error = new ServiceTimeoutError('test', 1000)
      const fn = vi.fn().mockRejectedValue(error)

      const resultPromise = withRetryDetailed(fn, {
        ...DEFAULT_RETRY_CONFIG,
        maxAttempts: 2,
      })

      // Attach the rejection handler BEFORE advancing timers
      const errorPromise = resultPromise.catch((e) => e)

      await vi.advanceTimersByTimeAsync(DEFAULT_RETRY_CONFIG.maxDelayMs * 2)

      const err = await errorPromise
      const errorWithDetails = err as Error & {
        attempts: number
        attemptDetails: unknown[]
      }
      expect(errorWithDetails.attempts).toBe(2)
      expect(errorWithDetails.attemptDetails).toHaveLength(2)
    })
  })

  describe('createRetryable', () => {
    it('creates a retryable function', async () => {
      const fn = vi.fn((a: number, b: number) => Promise.resolve(a + b))

      const retryable = createRetryable(fn, DEFAULT_RETRY_CONFIG)
      const result = await retryable(1, 2)

      expect(result).toBe(3)
      expect(fn).toHaveBeenCalledWith(1, 2)
    })

    it('retries with all arguments preserved', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new ServiceTimeoutError('test', 1000))
        .mockImplementation((a: number, b: number) => Promise.resolve(a + b))

      const retryable = createRetryable(fn, {
        ...DEFAULT_RETRY_CONFIG,
        maxAttempts: 3,
      })

      const resultPromise = retryable(5, 10)

      await vi.advanceTimersByTimeAsync(DEFAULT_RETRY_CONFIG.maxDelayMs)

      const result = await resultPromise

      expect(result).toBe(15)
      expect(fn).toHaveBeenCalledTimes(2)
      expect(fn).toHaveBeenCalledWith(5, 10)
    })
  })

  describe('RetryTracker', () => {
    it('starts with zero attempts', () => {
      const tracker = new RetryTracker(DEFAULT_RETRY_CONFIG)
      expect(tracker.attemptCount).toBe(0)
      expect(tracker.canRetry).toBe(true)
      expect(tracker.lastError).toBeUndefined()
      expect(tracker.allErrors).toHaveLength(0)
    })

    it('tracks attempt count', () => {
      const tracker = new RetryTracker({
        ...DEFAULT_RETRY_CONFIG,
        maxAttempts: 3,
      })

      tracker.recordAttempt()
      expect(tracker.attemptCount).toBe(1)
      expect(tracker.canRetry).toBe(true)

      tracker.recordAttempt()
      expect(tracker.attemptCount).toBe(2)
      expect(tracker.canRetry).toBe(true)

      tracker.recordAttempt()
      expect(tracker.attemptCount).toBe(3)
      expect(tracker.canRetry).toBe(false)
    })

    it('tracks errors', () => {
      const tracker = new RetryTracker(DEFAULT_RETRY_CONFIG)
      const error1 = new Error('error1')
      const error2 = new Error('error2')

      tracker.recordAttempt()
      tracker.recordFailure(error1)

      expect(tracker.lastError).toBe(error1)
      expect(tracker.allErrors).toEqual([error1])

      tracker.recordAttempt()
      tracker.recordFailure(error2)

      expect(tracker.lastError).toBe(error2)
      expect(tracker.allErrors).toEqual([error1, error2])
    })

    it('returns retry delay on failure', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5)

      const tracker = new RetryTracker({
        ...DEFAULT_RETRY_CONFIG,
        maxAttempts: 3,
        initialDelayMs: 100,
      })

      tracker.recordAttempt()
      const delay = tracker.recordFailure(new ServiceTimeoutError('test', 1000))

      expect(delay).toBe(100) // First attempt delay
    })

    it('returns 0 delay when no more retries', () => {
      const tracker = new RetryTracker({
        ...DEFAULT_RETRY_CONFIG,
        maxAttempts: 1,
      })

      tracker.recordAttempt()
      const delay = tracker.recordFailure(new ServiceTimeoutError('test', 1000))

      expect(delay).toBe(0)
      expect(tracker.canRetry).toBe(false)
    })

    it('returns 0 delay for non-retryable errors', () => {
      const tracker = new RetryTracker({
        ...DEFAULT_RETRY_CONFIG,
        maxAttempts: 3,
        retryOn: ['timeout'],
      })

      tracker.recordAttempt()
      const delay = tracker.recordFailure(
        new ServiceError('Validation', 'ERR', 'validation', false)
      )

      expect(delay).toBe(0)
    })

    it('can be reset', () => {
      const tracker = new RetryTracker(DEFAULT_RETRY_CONFIG)

      tracker.recordAttempt()
      tracker.recordFailure(new Error('fail'))
      tracker.recordAttempt()

      tracker.reset()

      expect(tracker.attemptCount).toBe(0)
      expect(tracker.allErrors).toHaveLength(0)
      expect(tracker.canRetry).toBe(true)
    })

    it('tracks elapsed time', async () => {
      vi.useRealTimers()

      const tracker = new RetryTracker(DEFAULT_RETRY_CONFIG)
      expect(tracker.elapsedMs).toBe(0)

      tracker.recordAttempt()

      await new Promise((resolve) => setTimeout(resolve, 50))

      expect(tracker.elapsedMs).toBeGreaterThanOrEqual(40)
    })
  })
})
