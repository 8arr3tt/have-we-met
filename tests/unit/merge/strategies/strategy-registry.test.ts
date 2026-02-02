import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  registerStrategy,
  getStrategy,
  hasStrategy,
  getRegisteredStrategies,
  unregisterStrategy,
  clearStrategies,
  isBuiltInStrategy,
  registerBuiltInStrategies,
} from '../../../../src/merge/strategies/index.js'
import { InvalidStrategyError } from '../../../../src/merge/merge-error.js'
import type { StrategyFunction } from '../../../../src/merge/types.js'

describe('Strategy Registry', () => {
  // Ensure strategies are registered before each test suite
  beforeEach(() => {
    // Re-register built-in strategies to ensure clean state
    registerBuiltInStrategies()
  })

  describe('with built-in strategies', () => {
    it('retrieves built-in strategies', () => {
      expect(hasStrategy('preferFirst')).toBe(true)
      expect(hasStrategy('preferLast')).toBe(true)
      expect(hasStrategy('preferNonNull')).toBe(true)
      expect(hasStrategy('preferNewer')).toBe(true)
      expect(hasStrategy('preferOlder')).toBe(true)
      expect(hasStrategy('preferLonger')).toBe(true)
      expect(hasStrategy('preferShorter')).toBe(true)
      expect(hasStrategy('concatenate')).toBe(true)
      expect(hasStrategy('union')).toBe(true)
      expect(hasStrategy('mostFrequent')).toBe(true)
      expect(hasStrategy('average')).toBe(true)
      expect(hasStrategy('sum')).toBe(true)
      expect(hasStrategy('min')).toBe(true)
      expect(hasStrategy('max')).toBe(true)
    })

    it('has 14 built-in strategies registered', () => {
      const strategies = getRegisteredStrategies()
      expect(strategies.length).toBeGreaterThanOrEqual(14)
    })

    it('getStrategy returns a function for built-in strategies', () => {
      const strategy = getStrategy('preferFirst')
      expect(typeof strategy).toBe('function')
    })

    it('throws for unknown strategies', () => {
      expect(() => getStrategy('unknownStrategy')).toThrow(InvalidStrategyError)
      expect(() => getStrategy('unknownStrategy')).toThrow(/Unknown strategy/)
    })
  })

  describe('custom strategy registration', () => {
    const customStrategyName =
      'testCustomStrategy_' + Math.random().toString(36).slice(2)

    afterEach(() => {
      unregisterStrategy(customStrategyName)
    })

    it('registers custom strategies', () => {
      const customFn: StrategyFunction = (values) => values[0]
      registerStrategy(customStrategyName, customFn)

      expect(hasStrategy(customStrategyName)).toBe(true)
      expect(getStrategy(customStrategyName)).toBe(customFn)
    })

    it('custom strategy can be executed', () => {
      const customFn: StrategyFunction = (values) =>
        values.map((v) => (typeof v === 'string' ? v.toUpperCase() : v))[0]
      registerStrategy(customStrategyName, customFn)

      const strategy = getStrategy(customStrategyName)
      expect(strategy(['hello', 'world'], [])).toBe('HELLO')
    })

    it('throws when registering empty strategy name', () => {
      const customFn: StrategyFunction = (values) => values[0]
      expect(() => registerStrategy('', customFn)).toThrow(InvalidStrategyError)
      expect(() => registerStrategy('   ', customFn)).toThrow(
        InvalidStrategyError
      )
    })

    it('unregisters strategies', () => {
      const customFn: StrategyFunction = (values) => values[0]
      registerStrategy(customStrategyName, customFn)
      expect(hasStrategy(customStrategyName)).toBe(true)

      const result = unregisterStrategy(customStrategyName)
      expect(result).toBe(true)
      expect(hasStrategy(customStrategyName)).toBe(false)
    })

    it('unregister returns false for non-existent strategy', () => {
      const result = unregisterStrategy('nonExistent_' + Math.random())
      expect(result).toBe(false)
    })

    it('overwrites existing strategy', () => {
      const fn1: StrategyFunction = () => 'first'
      const fn2: StrategyFunction = () => 'second'

      registerStrategy(customStrategyName, fn1)
      registerStrategy(customStrategyName, fn2)

      const strategy = getStrategy(customStrategyName)
      expect(strategy([], [])).toBe('second')
    })
  })

  describe('clearStrategies and registerBuiltInStrategies', () => {
    it('clearStrategies removes all strategies', () => {
      clearStrategies()
      expect(getRegisteredStrategies()).toHaveLength(0)
      expect(hasStrategy('preferFirst')).toBe(false)

      // Restore for other tests
      registerBuiltInStrategies()
    })

    it('registerBuiltInStrategies re-registers all built-in strategies', () => {
      clearStrategies()
      registerBuiltInStrategies()

      expect(hasStrategy('preferFirst')).toBe(true)
      expect(hasStrategy('preferLast')).toBe(true)
      expect(hasStrategy('preferNonNull')).toBe(true)
      expect(hasStrategy('preferNewer')).toBe(true)
      expect(hasStrategy('preferOlder')).toBe(true)
      expect(hasStrategy('preferLonger')).toBe(true)
      expect(hasStrategy('preferShorter')).toBe(true)
      expect(hasStrategy('concatenate')).toBe(true)
      expect(hasStrategy('union')).toBe(true)
      expect(hasStrategy('mostFrequent')).toBe(true)
      expect(hasStrategy('average')).toBe(true)
      expect(hasStrategy('sum')).toBe(true)
      expect(hasStrategy('min')).toBe(true)
      expect(hasStrategy('max')).toBe(true)
    })
  })

  describe('isBuiltInStrategy', () => {
    it('returns true for built-in strategies', () => {
      expect(isBuiltInStrategy('preferFirst')).toBe(true)
      expect(isBuiltInStrategy('preferLast')).toBe(true)
      expect(isBuiltInStrategy('preferNonNull')).toBe(true)
      expect(isBuiltInStrategy('preferNewer')).toBe(true)
      expect(isBuiltInStrategy('preferOlder')).toBe(true)
      expect(isBuiltInStrategy('preferLonger')).toBe(true)
      expect(isBuiltInStrategy('preferShorter')).toBe(true)
      expect(isBuiltInStrategy('concatenate')).toBe(true)
      expect(isBuiltInStrategy('union')).toBe(true)
      expect(isBuiltInStrategy('mostFrequent')).toBe(true)
      expect(isBuiltInStrategy('average')).toBe(true)
      expect(isBuiltInStrategy('sum')).toBe(true)
      expect(isBuiltInStrategy('min')).toBe(true)
      expect(isBuiltInStrategy('max')).toBe(true)
      expect(isBuiltInStrategy('custom')).toBe(true)
    })

    it('returns false for non-built-in strategies', () => {
      expect(isBuiltInStrategy('myCustomStrategy')).toBe(false)
      expect(isBuiltInStrategy('unknown')).toBe(false)
      expect(isBuiltInStrategy('')).toBe(false)
    })
  })

  describe('getRegisteredStrategies', () => {
    it('returns array of strategy names', () => {
      const strategies = getRegisteredStrategies()
      expect(Array.isArray(strategies)).toBe(true)
      expect(strategies.every((s) => typeof s === 'string')).toBe(true)
    })

    it('includes custom strategies after registration', () => {
      const customName = 'testCustom_' + Math.random().toString(36).slice(2)
      registerStrategy(customName, (values) => values[0])

      const strategies = getRegisteredStrategies()
      expect(strategies).toContain(customName)

      unregisterStrategy(customName)
    })
  })
})
