import { describe, it, expect } from 'vitest'
import {
  trim,
  lowercase,
  uppercase,
  normalizeWhitespace,
  alphanumericOnly,
  numericOnly,
} from '../../../src/core/normalizers/basic'
import { getNormalizer } from '../../../src/core/normalizers/registry'

describe('Basic Normalizers', () => {

  describe('trim', () => {
    it('should trim whitespace from both ends', () => {
      expect(trim('  hello  ')).toBe('hello')
      expect(trim('hello  ')).toBe('hello')
      expect(trim('  hello')).toBe('hello')
    })

    it('should handle strings without whitespace', () => {
      expect(trim('hello')).toBe('hello')
    })

    it('should return null for null input', () => {
      expect(trim(null)).toBe(null)
    })

    it('should return null for undefined input', () => {
      expect(trim(undefined)).toBe(null)
    })

    it('should handle empty strings', () => {
      expect(trim('')).toBe('')
      expect(trim('   ')).toBe('')
    })

    it('should coerce non-string inputs to strings', () => {
      expect(trim(123)).toBe('123')
      expect(trim(true)).toBe('true')
      expect(trim(false)).toBe('false')
    })

    it('should handle special characters', () => {
      expect(trim('  @#$%  ')).toBe('@#$%')
    })

    it('should handle unicode characters', () => {
      expect(trim('  héllo wörld  ')).toBe('héllo wörld')
      expect(trim('  你好  ')).toBe('你好')
      expect(trim('  emoji 🎉  ')).toBe('emoji 🎉')
    })

    it('should handle newlines and tabs', () => {
      expect(trim('\n\nhello\n\n')).toBe('hello')
      expect(trim('\t\thello\t\t')).toBe('hello')
    })

    it('should be registered in the normalizer registry', () => {
      const normalizer = getNormalizer('trim')
      expect(normalizer).toBeDefined()
      expect(normalizer?.('  test  ')).toBe('test')
    })
  })

  describe('lowercase', () => {
    it('should convert strings to lowercase', () => {
      expect(lowercase('HELLO')).toBe('hello')
      expect(lowercase('HeLLo')).toBe('hello')
      expect(lowercase('HELLO WORLD')).toBe('hello world')
    })

    it('should handle already lowercase strings', () => {
      expect(lowercase('hello')).toBe('hello')
    })

    it('should return null for null input', () => {
      expect(lowercase(null)).toBe(null)
    })

    it('should return null for undefined input', () => {
      expect(lowercase(undefined)).toBe(null)
    })

    it('should handle empty strings', () => {
      expect(lowercase('')).toBe('')
    })

    it('should coerce non-string inputs to strings', () => {
      expect(lowercase(123)).toBe('123')
      expect(lowercase(true)).toBe('true')
    })

    it('should handle special characters', () => {
      expect(lowercase('HELLO@WORLD')).toBe('hello@world')
    })

    it('should handle unicode characters', () => {
      expect(lowercase('HÉLLO WÖRLD')).toBe('héllo wörld')
      expect(lowercase('МОСКВА')).toBe('москва')
    })

    it('should be registered in the normalizer registry', () => {
      const normalizer = getNormalizer('lowercase')
      expect(normalizer).toBeDefined()
      expect(normalizer?.('TEST')).toBe('test')
    })
  })

  describe('uppercase', () => {
    it('should convert strings to uppercase', () => {
      expect(uppercase('hello')).toBe('HELLO')
      expect(uppercase('HeLLo')).toBe('HELLO')
      expect(uppercase('hello world')).toBe('HELLO WORLD')
    })

    it('should handle already uppercase strings', () => {
      expect(uppercase('HELLO')).toBe('HELLO')
    })

    it('should return null for null input', () => {
      expect(uppercase(null)).toBe(null)
    })

    it('should return null for undefined input', () => {
      expect(uppercase(undefined)).toBe(null)
    })

    it('should handle empty strings', () => {
      expect(uppercase('')).toBe('')
    })

    it('should coerce non-string inputs to strings', () => {
      expect(uppercase(123)).toBe('123')
      expect(uppercase(false)).toBe('FALSE')
    })

    it('should handle special characters', () => {
      expect(uppercase('hello@world')).toBe('HELLO@WORLD')
    })

    it('should handle unicode characters', () => {
      expect(uppercase('héllo wörld')).toBe('HÉLLO WÖRLD')
      expect(uppercase('москва')).toBe('МОСКВА')
    })

    it('should be registered in the normalizer registry', () => {
      const normalizer = getNormalizer('uppercase')
      expect(normalizer).toBeDefined()
      expect(normalizer?.('test')).toBe('TEST')
    })
  })

  describe('normalizeWhitespace', () => {
    it('should collapse multiple spaces into single space', () => {
      expect(normalizeWhitespace('hello    world')).toBe('hello world')
      expect(normalizeWhitespace('hello  world  test')).toBe('hello world test')
    })

    it('should trim leading and trailing whitespace', () => {
      expect(normalizeWhitespace('  hello world  ')).toBe('hello world')
    })

    it('should handle newlines and tabs', () => {
      expect(normalizeWhitespace('hello\n\nworld')).toBe('hello world')
      expect(normalizeWhitespace('hello\t\tworld')).toBe('hello world')
      expect(normalizeWhitespace('hello\r\nworld')).toBe('hello world')
    })

    it('should handle mixed whitespace types', () => {
      expect(normalizeWhitespace('hello \t\n world')).toBe('hello world')
    })

    it('should handle strings with normal spacing', () => {
      expect(normalizeWhitespace('hello world')).toBe('hello world')
    })

    it('should return null for null input', () => {
      expect(normalizeWhitespace(null)).toBe(null)
    })

    it('should return null for undefined input', () => {
      expect(normalizeWhitespace(undefined)).toBe(null)
    })

    it('should handle empty strings', () => {
      expect(normalizeWhitespace('')).toBe('')
      expect(normalizeWhitespace('   ')).toBe('')
    })

    it('should coerce non-string inputs to strings', () => {
      expect(normalizeWhitespace(123)).toBe('123')
    })

    it('should handle unicode characters', () => {
      expect(normalizeWhitespace('héllo    wörld')).toBe('héllo wörld')
    })

    it('should be registered in the normalizer registry', () => {
      const normalizer = getNormalizer('normalizeWhitespace')
      expect(normalizer).toBeDefined()
      expect(normalizer?.('test    value')).toBe('test value')
    })
  })

  describe('alphanumericOnly', () => {
    it('should remove non-alphanumeric characters', () => {
      expect(alphanumericOnly('hello-world')).toBe('helloworld')
      expect(alphanumericOnly('test@123')).toBe('test123')
      expect(alphanumericOnly('hello!!!')).toBe('hello')
    })

    it('should keep letters and numbers', () => {
      expect(alphanumericOnly('abc123')).toBe('abc123')
      expect(alphanumericOnly('ABC123')).toBe('ABC123')
    })

    it('should remove spaces', () => {
      expect(alphanumericOnly('hello world')).toBe('helloworld')
    })

    it('should remove special characters', () => {
      expect(alphanumericOnly('test@#$%^&*()')).toBe('test')
      expect(alphanumericOnly('user+tag@domain.com')).toBe('usertagdomaincom')
    })

    it('should return null for null input', () => {
      expect(alphanumericOnly(null)).toBe(null)
    })

    it('should return null for undefined input', () => {
      expect(alphanumericOnly(undefined)).toBe(null)
    })

    it('should handle empty strings', () => {
      expect(alphanumericOnly('')).toBe('')
    })

    it('should handle strings with only special characters', () => {
      expect(alphanumericOnly('!@#$%^&*()')).toBe('')
    })

    it('should coerce non-string inputs to strings', () => {
      expect(alphanumericOnly(123)).toBe('123')
    })

    it('should handle unicode letters', () => {
      expect(alphanumericOnly('héllo-wörld')).toBe('hllowrld')
      expect(alphanumericOnly('test-123-тест')).toBe('test123')
    })

    it('should be registered in the normalizer registry', () => {
      const normalizer = getNormalizer('alphanumericOnly')
      expect(normalizer).toBeDefined()
      expect(normalizer?.('test-123')).toBe('test123')
    })
  })

  describe('numericOnly', () => {
    it('should keep only numeric digits', () => {
      expect(numericOnly('123-456-7890')).toBe('1234567890')
      expect(numericOnly('$1,234.56')).toBe('123456')
      expect(numericOnly('abc123def')).toBe('123')
    })

    it('should handle pure numeric strings', () => {
      expect(numericOnly('123456')).toBe('123456')
    })

    it('should remove letters', () => {
      expect(numericOnly('test123test')).toBe('123')
    })

    it('should remove special characters', () => {
      expect(numericOnly('(555) 123-4567')).toBe('5551234567')
    })

    it('should return null for null input', () => {
      expect(numericOnly(null)).toBe(null)
    })

    it('should return null for undefined input', () => {
      expect(numericOnly(undefined)).toBe(null)
    })

    it('should handle empty strings', () => {
      expect(numericOnly('')).toBe('')
    })

    it('should handle strings with no digits', () => {
      expect(numericOnly('abcdef')).toBe('')
    })

    it('should coerce non-string inputs to strings', () => {
      expect(numericOnly(123)).toBe('123')
      expect(numericOnly(true)).toBe('')
    })

    it('should handle unicode characters', () => {
      expect(numericOnly('test-123-тест')).toBe('123')
    })

    it('should be registered in the normalizer registry', () => {
      const normalizer = getNormalizer('numericOnly')
      expect(normalizer).toBeDefined()
      expect(normalizer?.('test-123')).toBe('123')
    })
  })
})
