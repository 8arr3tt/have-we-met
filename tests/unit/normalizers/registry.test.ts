import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  registerNormalizer,
  getNormalizer,
  listNormalizers,
  applyNormalizer,
  composeNormalizers,
  clearNormalizers,
} from '../../../src/core/normalizers/registry'
import type { NormalizerFunction } from '../../../src/core/normalizers/types'

describe('Normalizer Registry', () => {
  beforeEach(() => {
    clearNormalizers()
  })

  describe('registerNormalizer', () => {
    it('registers a normalizer function', () => {
      const mockNormalizer: NormalizerFunction = (value) =>
        String(value).toUpperCase()
      registerNormalizer('uppercase', mockNormalizer)

      const retrieved = getNormalizer('uppercase')
      expect(retrieved).toBe(mockNormalizer)
    })

    it('allows retrieving and calling a registered normalizer', () => {
      registerNormalizer('trim', (value) => {
        if (value == null) return null
        return String(value).trim()
      })

      const normalizer = getNormalizer('trim')
      expect(normalizer).toBeDefined()
      expect(normalizer?.('  hello  ')).toBe('hello')
    })

    it('warns when overwriting an existing normalizer', () => {
      const consoleWarnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => {})

      const first: NormalizerFunction = () => 'first'
      const second: NormalizerFunction = () => 'second'

      registerNormalizer('test', first)
      registerNormalizer('test', second)

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        "Normalizer 'test' is already registered. Overwriting with new implementation."
      )

      const retrieved = getNormalizer('test')
      expect(retrieved).toBe(second)

      consoleWarnSpy.mockRestore()
    })

    it('allows multiple normalizers with different names', () => {
      registerNormalizer('trim', (value) => String(value).trim())
      registerNormalizer('lowercase', (value) => String(value).toLowerCase())
      registerNormalizer('uppercase', (value) => String(value).toUpperCase())

      expect(getNormalizer('trim')).toBeDefined()
      expect(getNormalizer('lowercase')).toBeDefined()
      expect(getNormalizer('uppercase')).toBeDefined()
    })
  })

  describe('getNormalizer', () => {
    it('returns undefined for non-existent normalizer', () => {
      const result = getNormalizer('nonexistent')
      expect(result).toBeUndefined()
    })

    it('returns the registered normalizer function', () => {
      const mockNormalizer: NormalizerFunction = (value) => value
      registerNormalizer('identity', mockNormalizer)

      const retrieved = getNormalizer('identity')
      expect(retrieved).toBe(mockNormalizer)
    })
  })

  describe('listNormalizers', () => {
    it('returns an empty array when no normalizers are registered', () => {
      const result = listNormalizers()
      expect(result).toEqual([])
    })

    it('returns all registered normalizer names', () => {
      registerNormalizer('trim', (value) => value)
      registerNormalizer('lowercase', (value) => value)
      registerNormalizer('uppercase', (value) => value)

      const result = listNormalizers()
      expect(result).toHaveLength(3)
      expect(result).toContain('trim')
      expect(result).toContain('lowercase')
      expect(result).toContain('uppercase')
    })

    it('does not include duplicate names', () => {
      registerNormalizer('test', () => 'first')
      registerNormalizer('test', () => 'second')

      const result = listNormalizers()
      expect(result.filter((name) => name === 'test')).toHaveLength(1)
    })
  })

  describe('applyNormalizer', () => {
    it('applies a registered normalizer to a value', () => {
      registerNormalizer('trim', (value) => {
        if (value == null) return null
        return String(value).trim()
      })

      const result = applyNormalizer('  hello  ', 'trim')
      expect(result).toBe('hello')
    })

    it('passes options to the normalizer', () => {
      registerNormalizer('multiply', (value, options) => {
        const num = Number(value)
        const factor = options?.factor ?? 1
        return num * factor
      })

      const result = applyNormalizer(5, 'multiply', { factor: 3 })
      expect(result).toBe(15)
    })

    it('returns original value when normalizer is not found', () => {
      const consoleWarnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => {})

      const result = applyNormalizer('test', 'nonexistent')
      expect(result).toBe('test')
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        "Normalizer 'nonexistent' not found. Using original value."
      )

      consoleWarnSpy.mockRestore()
    })

    it('returns original value when normalizer throws an error', () => {
      const consoleWarnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => {})

      registerNormalizer('error', () => {
        throw new Error('Normalizer failed')
      })

      const result = applyNormalizer('test', 'error')
      expect(result).toBe('test')
      expect(consoleWarnSpy).toHaveBeenCalled()

      consoleWarnSpy.mockRestore()
    })

    it('returns original value when normalizer returns null', () => {
      registerNormalizer('null', () => null)

      const result = applyNormalizer('test', 'null')
      expect(result).toBe('test')
    })

    it('handles normalizers that return falsy values other than null', () => {
      registerNormalizer('zero', () => 0)
      registerNormalizer('empty', () => '')
      registerNormalizer('false', () => false)

      expect(applyNormalizer('test', 'zero')).toBe(0)
      expect(applyNormalizer('test', 'empty')).toBe('')
      expect(applyNormalizer('test', 'false')).toBe(false)
    })
  })

  describe('composeNormalizers', () => {
    beforeEach(() => {
      registerNormalizer('trim', (value) => {
        if (value == null) return null
        return String(value).trim()
      })
      registerNormalizer('lowercase', (value) => {
        if (value == null) return null
        return String(value).toLowerCase()
      })
      registerNormalizer('uppercase', (value) => {
        if (value == null) return null
        return String(value).toUpperCase()
      })
    })

    it('composes multiple normalizers by name', () => {
      const composed = composeNormalizers('trim', 'lowercase')
      const result = composed('  HELLO  ')
      expect(result).toBe('hello')
    })

    it('applies normalizers in sequence', () => {
      const composed = composeNormalizers('trim', 'uppercase')
      const result = composed('  hello  ')
      expect(result).toBe('HELLO')
    })

    it('composes normalizer functions directly', () => {
      const double: NormalizerFunction = (value) => Number(value) * 2
      const addTen: NormalizerFunction = (value) => Number(value) + 10

      const composed = composeNormalizers(double, addTen)
      const result = composed(5)
      expect(result).toBe(20) // (5 * 2) + 10
    })

    it('mixes named and function normalizers', () => {
      const addExclamation: NormalizerFunction = (value) => `${value}!`
      const composed = composeNormalizers('trim', 'lowercase', addExclamation)

      const result = composed('  HELLO  ')
      expect(result).toBe('hello!')
    })

    it('returns null if any normalizer in the chain returns null', () => {
      const returnNull: NormalizerFunction = () => null
      const composed = composeNormalizers('trim', returnNull, 'lowercase')

      const result = composed('  HELLO  ')
      expect(result).toBeNull()
    })

    it('returns null for null input', () => {
      const composed = composeNormalizers('trim', 'lowercase')
      const result = composed(null)
      expect(result).toBeNull()
    })

    it('returns null for undefined input', () => {
      const composed = composeNormalizers('trim', 'lowercase')
      const result = composed(undefined)
      expect(result).toBeNull()
    })

    it('stops processing on null intermediate result', () => {
      const spy = vi.fn((value) => String(value).toUpperCase())
      registerNormalizer('spy', spy)

      const returnNull: NormalizerFunction = () => null
      const composed = composeNormalizers('trim', returnNull, 'spy')

      composed('test')
      expect(spy).not.toHaveBeenCalled()
    })

    it('handles errors in composed normalizers', () => {
      const consoleWarnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => {})

      const throwError: NormalizerFunction = () => {
        throw new Error('Failed')
      }
      const composed = composeNormalizers('trim', throwError, 'lowercase')

      const result = composed('test')
      expect(result).toBeNull()
      expect(consoleWarnSpy).toHaveBeenCalled()

      consoleWarnSpy.mockRestore()
    })

    it('passes options to all normalizers in the chain', () => {
      registerNormalizer('withOptions', (value, options) => {
        return options?.prefix ? `${options.prefix}${value}` : value
      })

      const composed = composeNormalizers('trim', 'withOptions')
      const result = composed('  test  ', { prefix: 'PREFIX:' })
      expect(result).toBe('PREFIX:test')
    })

    it('handles empty normalizer list', () => {
      const composed = composeNormalizers()
      const result = composed('test')
      expect(result).toBe('test')
    })

    it('handles single normalizer', () => {
      const composed = composeNormalizers('trim')
      const result = composed('  test  ')
      expect(result).toBe('test')
    })
  })

  describe('clearNormalizers', () => {
    it('removes all registered normalizers', () => {
      registerNormalizer('trim', (value) => value)
      registerNormalizer('lowercase', (value) => value)

      expect(listNormalizers()).toHaveLength(2)

      clearNormalizers()

      expect(listNormalizers()).toHaveLength(0)
    })

    it('allows re-registering after clearing', () => {
      registerNormalizer('test', () => 'first')
      clearNormalizers()
      registerNormalizer('test', () => 'second')

      const normalizer = getNormalizer('test')
      expect(normalizer?.('anything')).toBe('second')
    })
  })

  describe('integration scenarios', () => {
    it('supports typical workflow: register, retrieve, apply', () => {
      registerNormalizer('email', (value) => {
        if (value == null) return null
        return String(value).trim().toLowerCase()
      })

      const normalizers = listNormalizers()
      expect(normalizers).toContain('email')

      const result = applyNormalizer('  Test@Example.COM  ', 'email')
      expect(result).toBe('test@example.com')
    })

    it('handles multiple normalizers with interdependencies', () => {
      registerNormalizer('trim', (value) => {
        if (value == null) return null
        return String(value).trim()
      })
      registerNormalizer('lowercase', (value) => {
        if (value == null) return null
        return String(value).toLowerCase()
      })
      registerNormalizer('removeSpaces', (value) => {
        if (value == null) return null
        return String(value).replace(/\s+/g, '')
      })

      const result1 = applyNormalizer('  HELLO WORLD  ', 'trim')
      const result2 = applyNormalizer(result1, 'lowercase')
      const result3 = applyNormalizer(result2, 'removeSpaces')

      expect(result3).toBe('helloworld')
    })

    it('allows building a library of reusable normalizers', () => {
      const normalizers = {
        trim: (value: unknown) => (value == null ? null : String(value).trim()),
        lowercase: (value: unknown) =>
          value == null ? null : String(value).toLowerCase(),
        uppercase: (value: unknown) =>
          value == null ? null : String(value).toUpperCase(),
        alphanumeric: (value: unknown) =>
          value == null ? null : String(value).replace(/[^a-zA-Z0-9]/g, ''),
      }

      Object.entries(normalizers).forEach(([name, fn]) => {
        registerNormalizer(name, fn)
      })

      expect(listNormalizers()).toHaveLength(4)
      expect(applyNormalizer('  hello!  ', 'trim')).toBe('hello!')
      expect(applyNormalizer('HELLO', 'lowercase')).toBe('hello')
      expect(applyNormalizer('hello', 'uppercase')).toBe('HELLO')
      expect(applyNormalizer('hello-123!', 'alphanumeric')).toBe('hello123')
    })
  })
})
