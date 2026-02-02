/**
 * Core validation utility tests
 * @module tests/edge-cases
 */

import { describe, it, expect } from 'vitest'
import {
  requirePositive,
  requireNonNegative,
  requireInRange,
  requireNonEmptyArray,
  requireNonEmptyString,
  requireOneOf,
  requirePlainObject,
  requireFunction,
  requireLessThan,
  InvalidParameterError,
  ConfigurationError,
  MissingParameterError,
} from '../../src/utils/errors.js'

describe('Validation Utilities', () => {
  describe('requirePositive()', () => {
    it('should throw error for zero', () => {
      expect(() => requirePositive(0, 'value')).toThrow(InvalidParameterError)
    })

    it('should throw error for negative number', () => {
      expect(() => requirePositive(-5, 'value')).toThrow(InvalidParameterError)
    })

    it('should throw error for NaN', () => {
      expect(() => requirePositive(NaN, 'value')).toThrow(InvalidParameterError)
    })

    it('should throw error for non-number', () => {
      // @ts-expect-error - testing invalid input
      expect(() => requirePositive('10', 'value')).toThrow(InvalidParameterError)
    })

    it('should accept positive numbers', () => {
      expect(requirePositive(1, 'value')).toBe(1)
      expect(requirePositive(0.1, 'value')).toBe(0.1)
      expect(requirePositive(1000000, 'value')).toBe(1000000)
    })
  })

  describe('requireInRange()', () => {
    it('should throw error for value below range', () => {
      expect(() => requireInRange(-0.1, 0, 1, 'value')).toThrow(
        InvalidParameterError
      )
    })

    it('should throw error for value above range', () => {
      expect(() => requireInRange(1.1, 0, 1, 'value')).toThrow(
        InvalidParameterError
      )
    })

    it('should accept value at min boundary', () => {
      expect(requireInRange(0, 0, 1, 'value')).toBe(0)
    })

    it('should accept value at max boundary', () => {
      expect(requireInRange(1, 0, 1, 'value')).toBe(1)
    })

    it('should accept value in middle', () => {
      expect(requireInRange(0.5, 0, 1, 'value')).toBe(0.5)
    })
  })

  describe('requireNonEmptyArray()', () => {
    it('should throw error for empty array', () => {
      expect(() => requireNonEmptyArray([], 'items')).toThrow(
        InvalidParameterError
      )
    })

    it('should throw error for non-array', () => {
      // @ts-expect-error - testing invalid input
      expect(() => requireNonEmptyArray('not an array', 'items')).toThrow(
        InvalidParameterError
      )
    })

    it('should accept non-empty array', () => {
      const arr = [1, 2, 3]
      expect(requireNonEmptyArray(arr, 'items')).toEqual(arr)
    })
  })

  describe('requireNonEmptyString()', () => {
    it('should throw error for empty string', () => {
      expect(() => requireNonEmptyString('', 'name')).toThrow(
        InvalidParameterError
      )
    })

    it('should throw error for whitespace-only string', () => {
      expect(() => requireNonEmptyString('   ', 'name')).toThrow(
        InvalidParameterError
      )
    })

    it('should throw error for non-string', () => {
      // @ts-expect-error - testing invalid input
      expect(() => requireNonEmptyString(123, 'name')).toThrow(
        InvalidParameterError
      )
    })

    it('should accept non-empty string', () => {
      expect(requireNonEmptyString('hello', 'name')).toBe('hello')
      expect(requireNonEmptyString('  hello  ', 'name')).toBe('  hello  ')
    })
  })

  describe('requireOneOf()', () => {
    it('should throw error for value not in list', () => {
      expect(() => requireOneOf('invalid', ['a', 'b', 'c'], 'option')).toThrow(
        InvalidParameterError
      )
    })

    it('should accept value in list', () => {
      expect(requireOneOf('b', ['a', 'b', 'c'], 'option')).toBe('b')
    })

    it('should work with numbers', () => {
      expect(requireOneOf(2, [1, 2, 3], 'number')).toBe(2)
      expect(() => requireOneOf(4, [1, 2, 3], 'number')).toThrow(
        InvalidParameterError
      )
    })
  })

  describe('requirePlainObject()', () => {
    it('should throw error for null', () => {
      expect(() => requirePlainObject(null, 'config')).toThrow(
        InvalidParameterError
      )
    })

    it('should throw error for array', () => {
      expect(() => requirePlainObject([], 'config')).toThrow(InvalidParameterError)
    })

    it('should throw error for primitive', () => {
      expect(() => requirePlainObject('string', 'config')).toThrow(
        InvalidParameterError
      )
    })

    it('should accept plain object', () => {
      const obj = { key: 'value' }
      expect(requirePlainObject(obj, 'config')).toEqual(obj)
    })

    it('should accept empty object', () => {
      const obj = {}
      expect(requirePlainObject(obj, 'config')).toEqual(obj)
    })
  })

  describe('requireFunction()', () => {
    it('should throw error for non-function', () => {
      expect(() => requireFunction('not a function', 'callback')).toThrow(
        InvalidParameterError
      )
      expect(() => requireFunction({}, 'callback')).toThrow(InvalidParameterError)
      expect(() => requireFunction(null, 'callback')).toThrow(
        InvalidParameterError
      )
    })

    it('should accept function', () => {
      const fn = () => {}
      expect(requireFunction(fn, 'callback')).toBe(fn)
    })

    it('should accept arrow function', () => {
      const fn = (x: number) => x * 2
      expect(requireFunction(fn, 'callback')).toBe(fn)
    })
  })

  describe('requireLessThan()', () => {
    it('should throw error when value >= other', () => {
      expect(() => requireLessThan(5, 5, 'a', 'b')).toThrow(ConfigurationError)
      expect(() => requireLessThan(6, 5, 'a', 'b')).toThrow(ConfigurationError)
    })

    it('should not throw when value < other', () => {
      expect(() => requireLessThan(4, 5, 'a', 'b')).not.toThrow()
    })
  })

  describe('Error message quality', () => {
    it('should include parameter name in error message', () => {
      try {
        requirePositive(0, 'weight')
        expect.fail('should have thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(InvalidParameterError)
        if (error instanceof InvalidParameterError) {
          expect(error.message).toContain('weight')
          expect(error.parameterName).toBe('weight')
        }
      }
    })

    it('should include reason in error message', () => {
      try {
        requireInRange(2, 0, 1, 'threshold')
        expect.fail('should have thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(InvalidParameterError)
        if (error instanceof InvalidParameterError) {
          expect(error.message).toContain('between 0 and 1')
        }
      }
    })

    it('should include allowed values in error message', () => {
      try {
        requireOneOf('x', ['a', 'b', 'c'], 'option')
        expect.fail('should have thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(InvalidParameterError)
        if (error instanceof InvalidParameterError) {
          expect(error.message).toContain('a, b, c')
        }
      }
    })

    it('should have error codes', () => {
      try {
        requirePositive(0, 'value')
        expect.fail('should have thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(InvalidParameterError)
        if (error instanceof InvalidParameterError) {
          expect(error.code).toBe('INVALID_PARAMETER')
        }
      }
    })
  })
})
