/**
 * Tests for circuit breaker
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  CircuitBreaker,
  createCircuitBreaker,
  withCircuitBreaker,
  createCircuitBreakerRegistry,
} from './circuit-breaker.js'
import { ServiceUnavailableError } from '../service-error.js'

describe('CircuitBreaker', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('initial state', () => {
    it('starts in closed state', () => {
      const breaker = createCircuitBreaker()

      expect(breaker.state).toBe('closed')
      expect(breaker.isClosed).toBe(true)
      expect(breaker.isOpen).toBe(false)
      expect(breaker.isHalfOpen).toBe(false)
    })

    it('has zero failure count initially', () => {
      const breaker = createCircuitBreaker()

      expect(breaker.failureCount).toBe(0)
      expect(breaker.halfOpenSuccessCount).toBe(0)
    })

    it('allows execution when closed', () => {
      const breaker = createCircuitBreaker()

      expect(breaker.canExecute()).toBe(true)
    })
  })

  describe('failure tracking', () => {
    it('opens after failure threshold', () => {
      const breaker = createCircuitBreaker({
        failureThreshold: 3,
        failureWindowMs: 60000,
      })

      breaker.recordFailure(new Error('fail 1'))
      expect(breaker.state).toBe('closed')

      breaker.recordFailure(new Error('fail 2'))
      expect(breaker.state).toBe('closed')

      breaker.recordFailure(new Error('fail 3'))
      expect(breaker.state).toBe('open')
    })

    it('rejects immediately when open', async () => {
      const breaker = createCircuitBreaker({
        failureThreshold: 1,
        serviceName: 'test-service',
      })

      breaker.recordFailure(new Error('fail'))
      expect(breaker.isOpen).toBe(true)

      await expect(
        breaker.execute(() => Promise.resolve('should not run'))
      ).rejects.toThrow(ServiceUnavailableError)

      await expect(
        breaker.execute(() => Promise.resolve('should not run'))
      ).rejects.toThrow("Service 'test-service' is unavailable")
    })

    it('tracks failures only within time window', async () => {
      const breaker = createCircuitBreaker({
        failureThreshold: 3,
        failureWindowMs: 1000,
      })

      breaker.recordFailure(new Error('fail 1'))
      breaker.recordFailure(new Error('fail 2'))

      // Wait for failures to expire
      await vi.advanceTimersByTimeAsync(1500)

      expect(breaker.failureCount).toBe(0)

      breaker.recordFailure(new Error('fail 3'))
      expect(breaker.state).toBe('closed')
      expect(breaker.failureCount).toBe(1)
    })

    it('tracks last failure time', () => {
      const breaker = createCircuitBreaker()
      expect(breaker.lastFailureTime).toBeUndefined()

      const now = new Date()
      vi.setSystemTime(now)

      breaker.recordFailure(new Error('fail'))

      expect(breaker.lastFailureTime).toEqual(now)
    })
  })

  describe('half-open state', () => {
    it('transitions to half-open after reset timeout', async () => {
      const breaker = createCircuitBreaker({
        failureThreshold: 1,
        resetTimeoutMs: 1000,
      })

      breaker.recordFailure(new Error('fail'))
      expect(breaker.state).toBe('open')

      await vi.advanceTimersByTimeAsync(1000)

      expect(breaker.state).toBe('half-open')
      expect(breaker.canExecute()).toBe(true)
    })

    it('closes after success threshold in half-open', async () => {
      const breaker = createCircuitBreaker({
        failureThreshold: 1,
        resetTimeoutMs: 1000,
        successThreshold: 2,
      })

      breaker.recordFailure(new Error('fail'))
      await vi.advanceTimersByTimeAsync(1000)
      expect(breaker.state).toBe('half-open')

      breaker.recordSuccess()
      expect(breaker.state).toBe('half-open')

      breaker.recordSuccess()
      expect(breaker.state).toBe('closed')
    })

    it('reopens on failure in half-open', async () => {
      const breaker = createCircuitBreaker({
        failureThreshold: 1,
        resetTimeoutMs: 1000,
      })

      breaker.recordFailure(new Error('fail'))
      await vi.advanceTimersByTimeAsync(1000)
      expect(breaker.state).toBe('half-open')

      breaker.recordFailure(new Error('fail again'))
      expect(breaker.state).toBe('open')
    })
  })

  describe('execute', () => {
    it('executes function when circuit is closed', async () => {
      const breaker = createCircuitBreaker()
      const fn = vi.fn().mockResolvedValue('success')

      const result = await breaker.execute(fn)

      expect(result).toBe('success')
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('records success after successful execution', async () => {
      const breaker = createCircuitBreaker()

      await breaker.execute(() => Promise.resolve('success'))

      expect(breaker.failureCount).toBe(0)
    })

    it('records failure after failed execution', async () => {
      const breaker = createCircuitBreaker({ failureThreshold: 5 })

      try {
        await breaker.execute(() => Promise.reject(new Error('fail')))
      } catch {
        // Expected
      }

      expect(breaker.failureCount).toBe(1)
    })

    it('propagates errors from function', async () => {
      const breaker = createCircuitBreaker()
      const error = new Error('custom error')

      await expect(
        breaker.execute(() => Promise.reject(error))
      ).rejects.toThrow(error)
    })

    it('includes reset time in ServiceUnavailableError', async () => {
      vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'))

      const breaker = createCircuitBreaker({
        failureThreshold: 1,
        resetTimeoutMs: 30000,
        serviceName: 'test',
      })

      breaker.recordFailure(new Error('fail'))

      try {
        await breaker.execute(() => Promise.resolve('should not run'))
        expect.fail('Should have thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(ServiceUnavailableError)
        const unavailableError = error as ServiceUnavailableError
        expect(unavailableError.resetAt).toEqual(
          new Date('2024-01-01T00:00:30.000Z')
        )
      }
    })
  })

  describe('executeWithFallback', () => {
    it('returns main result when successful', async () => {
      const breaker = createCircuitBreaker()

      const result = await breaker.executeWithFallback(
        () => Promise.resolve('main'),
        () => 'fallback'
      )

      expect(result).toBe('main')
    })

    it('returns fallback when circuit is open', async () => {
      const breaker = createCircuitBreaker({ failureThreshold: 1 })
      breaker.recordFailure(new Error('fail'))

      const result = await breaker.executeWithFallback(
        () => Promise.resolve('main'),
        () => 'fallback'
      )

      expect(result).toBe('fallback')
    })

    it('returns fallback when execution fails', async () => {
      const breaker = createCircuitBreaker()

      const result = await breaker.executeWithFallback(
        () => Promise.reject(new Error('fail')),
        (error) => `fallback: ${error?.message}`
      )

      expect(result).toBe('fallback: fail')
    })

    it('passes error to fallback function', async () => {
      const breaker = createCircuitBreaker()
      const fallback = vi.fn().mockReturnValue('fallback')

      await breaker.executeWithFallback(
        () => Promise.reject(new Error('main error')),
        fallback
      )

      expect(fallback).toHaveBeenCalledWith(expect.any(Error))
      expect(fallback.mock.calls[0][0].message).toBe('main error')
    })

    it('passes ServiceUnavailableError to fallback when open', async () => {
      const breaker = createCircuitBreaker({ failureThreshold: 1 })
      breaker.recordFailure(new Error('fail'))

      const fallback = vi.fn().mockReturnValue('fallback')

      await breaker.executeWithFallback(() => Promise.resolve('main'), fallback)

      expect(fallback).toHaveBeenCalledWith(expect.any(ServiceUnavailableError))
    })
  })

  describe('callbacks', () => {
    it('calls onStateChange when state changes', () => {
      const onStateChange = vi.fn()
      const breaker = createCircuitBreaker({
        failureThreshold: 1,
        onStateChange,
      })

      breaker.recordFailure(new Error('fail'))

      expect(onStateChange).toHaveBeenCalledWith('closed', 'open', breaker)
    })

    it('calls onFailure when failure is recorded', () => {
      const onFailure = vi.fn()
      const breaker = createCircuitBreaker({ onFailure })

      const error = new Error('fail')
      breaker.recordFailure(error)

      expect(onFailure).toHaveBeenCalledWith(error, 1, breaker)
    })

    it('calls onSuccess when success is recorded', () => {
      const onSuccess = vi.fn()
      const breaker = createCircuitBreaker({ onSuccess })

      breaker.recordSuccess()

      expect(onSuccess).toHaveBeenCalledWith(0, breaker)
    })

    it('uses custom isFailure function', async () => {
      const isFailure = vi.fn().mockReturnValue(false)
      const breaker = createCircuitBreaker({
        failureThreshold: 1,
        isFailure,
      })

      breaker.recordFailure(new Error('ignored'))

      expect(isFailure).toHaveBeenCalled()
      expect(breaker.failureCount).toBe(0)
      expect(breaker.state).toBe('closed')
    })
  })

  describe('manual controls', () => {
    it('trip opens the circuit', () => {
      const breaker = createCircuitBreaker()
      expect(breaker.isClosed).toBe(true)

      breaker.trip()

      expect(breaker.isOpen).toBe(true)
    })

    it('reset closes the circuit', async () => {
      const breaker = createCircuitBreaker({ failureThreshold: 1 })
      breaker.recordFailure(new Error('fail'))
      expect(breaker.isOpen).toBe(true)

      breaker.reset()

      expect(breaker.isClosed).toBe(true)
      expect(breaker.failureCount).toBe(0)
    })

    it('forceHalfOpen transitions to half-open', () => {
      const breaker = createCircuitBreaker()

      breaker.forceHalfOpen()

      expect(breaker.isHalfOpen).toBe(true)
    })
  })

  describe('getStatus', () => {
    it('provides state for health checks', async () => {
      vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'))

      const breaker = createCircuitBreaker({ failureThreshold: 3 })

      breaker.recordFailure(new Error('fail 1'))
      vi.advanceTimersByTime(100)
      breaker.recordFailure(new Error('fail 2'))

      const status = breaker.getStatus()

      expect(status.state).toBe('closed')
      expect(status.failureCount).toBe(2)
      expect(status.successCount).toBe(0)
      expect(status.lastStateChange).toBeDefined()
      expect(status.lastFailureTime).toBeDefined()
    })
  })
})

describe('withCircuitBreaker', () => {
  it('wraps function with circuit breaker', async () => {
    const fn = vi.fn((x: number) => Promise.resolve(x * 2))

    const wrapped = withCircuitBreaker(fn, { failureThreshold: 3 })

    const result = await wrapped(5)

    expect(result).toBe(10)
    expect(fn).toHaveBeenCalledWith(5)
  })

  it('exposes breaker for inspection', () => {
    const fn = (x: number) => Promise.resolve(x)
    const wrapped = withCircuitBreaker(fn, {})

    expect(wrapped.breaker).toBeInstanceOf(CircuitBreaker)
    expect(wrapped.breaker.state).toBe('closed')
  })

  it('tracks failures across calls', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fail'))
    const wrapped = withCircuitBreaker(fn, { failureThreshold: 2 })

    await wrapped().catch(() => {})
    expect(wrapped.breaker.state).toBe('closed')

    await wrapped().catch(() => {})
    expect(wrapped.breaker.state).toBe('open')
  })
})

describe('CircuitBreakerRegistry', () => {
  it('creates new breaker for unknown service', () => {
    const registry = createCircuitBreakerRegistry()

    const breaker = registry.get('service-a')

    expect(breaker).toBeInstanceOf(CircuitBreaker)
    expect(breaker.serviceName).toBe('service-a')
  })

  it('returns same breaker for same service name', () => {
    const registry = createCircuitBreakerRegistry()

    const breaker1 = registry.get('service-a')
    const breaker2 = registry.get('service-a')

    expect(breaker1).toBe(breaker2)
  })

  it('applies default config to new breakers', () => {
    const registry = createCircuitBreakerRegistry({
      failureThreshold: 10,
    })

    const breaker = registry.get('service-a')

    // Record 9 failures (should not open with threshold of 10)
    for (let i = 0; i < 9; i++) {
      breaker.recordFailure(new Error(`fail ${i}`))
    }
    expect(breaker.state).toBe('closed')

    // 10th failure should open
    breaker.recordFailure(new Error('fail 10'))
    expect(breaker.state).toBe('open')
  })

  it('allows config override for specific breaker', () => {
    const registry = createCircuitBreakerRegistry({
      failureThreshold: 10,
    })

    const breaker = registry.get('service-a', { failureThreshold: 2 })

    breaker.recordFailure(new Error('fail 1'))
    breaker.recordFailure(new Error('fail 2'))

    expect(breaker.state).toBe('open')
  })

  it('tracks registered breakers', () => {
    const registry = createCircuitBreakerRegistry()

    expect(registry.size).toBe(0)
    expect(registry.has('service-a')).toBe(false)

    registry.get('service-a')
    registry.get('service-b')

    expect(registry.size).toBe(2)
    expect(registry.has('service-a')).toBe(true)
    expect(registry.has('service-b')).toBe(true)
  })

  it('removes breakers', () => {
    const registry = createCircuitBreakerRegistry()
    registry.get('service-a')

    expect(registry.remove('service-a')).toBe(true)
    expect(registry.has('service-a')).toBe(false)

    expect(registry.remove('service-a')).toBe(false)
  })

  it('gets all breaker status', async () => {
    vi.useFakeTimers()

    const registry = createCircuitBreakerRegistry({ failureThreshold: 1 })
    const breakerA = registry.get('service-a')
    registry.get('service-b') // Create but don't trigger failure

    breakerA.recordFailure(new Error('fail'))
    // service-b stays closed

    const status = registry.getAllStatus()

    expect(status['service-a'].state).toBe('open')
    expect(status['service-b'].state).toBe('closed')

    vi.useRealTimers()
  })

  it('resets all breakers', () => {
    const registry = createCircuitBreakerRegistry({ failureThreshold: 1 })
    const breakerA = registry.get('service-a')
    const breakerB = registry.get('service-b')

    breakerA.recordFailure(new Error('fail'))
    breakerB.recordFailure(new Error('fail'))

    expect(breakerA.isOpen).toBe(true)
    expect(breakerB.isOpen).toBe(true)

    registry.resetAll()

    expect(breakerA.isClosed).toBe(true)
    expect(breakerB.isClosed).toBe(true)
  })

  it('gets open circuits', () => {
    const registry = createCircuitBreakerRegistry({ failureThreshold: 1 })
    registry.get('service-a').recordFailure(new Error('fail'))
    registry.get('service-b') // stays closed
    registry.get('service-c').recordFailure(new Error('fail'))

    const open = registry.getOpenCircuits()

    expect(open).toContain('service-a')
    expect(open).not.toContain('service-b')
    expect(open).toContain('service-c')
  })

  it('clears all breakers', () => {
    const registry = createCircuitBreakerRegistry()
    registry.get('service-a')
    registry.get('service-b')

    registry.clear()

    expect(registry.size).toBe(0)
    expect(registry.has('service-a')).toBe(false)
  })
})
