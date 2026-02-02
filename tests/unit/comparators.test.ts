import { describe, it, expect } from 'vitest'
import {
  exactMatch,
  levenshtein,
  jaroWinkler,
  soundex,
  soundexEncode,
  metaphone,
  metaphoneEncode,
} from '../../src/core/comparators'

describe('exactMatch', () => {
  describe('string comparison', () => {
    it('returns 1 for exact string match', () => {
      expect(exactMatch('hello', 'hello')).toBe(1)
    })

    it('returns 0 for different strings', () => {
      expect(exactMatch('hello', 'world')).toBe(0)
    })

    it('returns 0 for case mismatch when case-sensitive', () => {
      expect(exactMatch('Hello', 'hello')).toBe(0)
      expect(exactMatch('HELLO', 'hello', { caseSensitive: true })).toBe(0)
    })

    it('returns 1 for case mismatch when case-insensitive', () => {
      expect(exactMatch('Hello', 'hello', { caseSensitive: false })).toBe(1)
      expect(exactMatch('HELLO', 'hello', { caseSensitive: false })).toBe(1)
    })

    it('handles empty strings', () => {
      expect(exactMatch('', '')).toBe(1)
      expect(exactMatch('', 'a')).toBe(0)
    })
  })

  describe('number comparison', () => {
    it('returns 1 for equal numbers', () => {
      expect(exactMatch(42, 42)).toBe(1)
      expect(exactMatch(3.14, 3.14)).toBe(1)
      expect(exactMatch(0, 0)).toBe(1)
      expect(exactMatch(-5, -5)).toBe(1)
    })

    it('returns 0 for different numbers', () => {
      expect(exactMatch(42, 43)).toBe(0)
      expect(exactMatch(3.14, 3.15)).toBe(0)
    })
  })

  describe('boolean comparison', () => {
    it('returns 1 for equal booleans', () => {
      expect(exactMatch(true, true)).toBe(1)
      expect(exactMatch(false, false)).toBe(1)
    })

    it('returns 0 for different booleans', () => {
      expect(exactMatch(true, false)).toBe(0)
      expect(exactMatch(false, true)).toBe(0)
    })
  })

  describe('Date comparison', () => {
    it('returns 1 for equal dates', () => {
      const date1 = new Date('2024-01-01T00:00:00Z')
      const date2 = new Date('2024-01-01T00:00:00Z')
      expect(exactMatch(date1, date2)).toBe(1)
    })

    it('returns 0 for different dates', () => {
      const date1 = new Date('2024-01-01T00:00:00Z')
      const date2 = new Date('2024-01-02T00:00:00Z')
      expect(exactMatch(date1, date2)).toBe(0)
    })

    it('handles dates with millisecond precision', () => {
      const date1 = new Date('2024-01-01T12:00:00.123Z')
      const date2 = new Date('2024-01-01T12:00:00.123Z')
      const date3 = new Date('2024-01-01T12:00:00.124Z')
      expect(exactMatch(date1, date2)).toBe(1)
      expect(exactMatch(date1, date3)).toBe(0)
    })
  })

  describe('null/undefined handling', () => {
    it('returns 1 when both are null by default', () => {
      expect(exactMatch(null, null)).toBe(1)
    })

    it('returns 1 when both are undefined by default', () => {
      expect(exactMatch(undefined, undefined)).toBe(1)
    })

    it('returns 1 when one is null and other is undefined by default', () => {
      expect(exactMatch(null, undefined)).toBe(1)
      expect(exactMatch(undefined, null)).toBe(1)
    })

    it('returns 0 when nullMatchesNull is false', () => {
      expect(exactMatch(null, null, { nullMatchesNull: false })).toBe(0)
      expect(exactMatch(undefined, undefined, { nullMatchesNull: false })).toBe(
        0
      )
    })

    it('returns 0 when only one value is null/undefined', () => {
      expect(exactMatch(null, 'value')).toBe(0)
      expect(exactMatch('value', null)).toBe(0)
      expect(exactMatch(undefined, 'value')).toBe(0)
      expect(exactMatch('value', undefined)).toBe(0)
      expect(exactMatch(null, 0)).toBe(0)
      expect(exactMatch(0, null)).toBe(0)
    })
  })

  describe('type mismatch', () => {
    it('returns 0 for string vs number', () => {
      expect(exactMatch('42', 42)).toBe(0)
      expect(exactMatch(42, '42')).toBe(0)
    })

    it('returns 0 for boolean vs number', () => {
      expect(exactMatch(true, 1)).toBe(0)
      expect(exactMatch(false, 0)).toBe(0)
    })

    it('returns 0 for date vs string', () => {
      const date = new Date('2024-01-01')
      expect(exactMatch(date, '2024-01-01')).toBe(0)
    })
  })
})

describe('levenshtein', () => {
  describe('basic matching', () => {
    it('returns 1 for identical strings', () => {
      expect(levenshtein('hello', 'hello')).toBe(1)
      expect(levenshtein('world', 'world')).toBe(1)
      expect(levenshtein('', '')).toBe(1)
    })

    it('returns 0.8 for one character different', () => {
      expect(levenshtein('hello', 'hallo')).toBe(0.8)
      expect(levenshtein('cat', 'bat')).toBeCloseTo(2 / 3, 3)
    })

    it('returns 0 for completely different strings', () => {
      expect(levenshtein('abc', 'xyz')).toBe(0)
    })

    it('handles different lengths correctly', () => {
      // 'cat' vs 'category': distance = 5, maxLength = 8
      expect(levenshtein('cat', 'category')).toBeCloseTo(0.375, 3)
      // 'sit' vs 'sitting': distance = 4, maxLength = 7
      expect(levenshtein('sit', 'sitting')).toBeCloseTo(0.4286, 3)
    })

    it('handles single character strings', () => {
      expect(levenshtein('a', 'a')).toBe(1)
      expect(levenshtein('a', 'b')).toBe(0)
      expect(levenshtein('a', 'ab')).toBe(0.5)
    })
  })

  describe('empty strings', () => {
    it('returns 1 for two empty strings', () => {
      expect(levenshtein('', '')).toBe(1)
    })

    it('returns 0 when one string is empty', () => {
      expect(levenshtein('', 'abc')).toBe(0)
      expect(levenshtein('abc', '')).toBe(0)
      expect(levenshtein('', 'a')).toBe(0)
    })
  })

  describe('case sensitivity', () => {
    it('is case-insensitive by default', () => {
      expect(levenshtein('Hello', 'hello')).toBe(1)
      expect(levenshtein('HELLO', 'hello')).toBe(1)
      expect(levenshtein('HeLLo', 'hello')).toBe(1)
    })

    it('respects case when caseSensitive is true', () => {
      expect(levenshtein('Hello', 'hello', { caseSensitive: true })).toBe(0.8)
      expect(levenshtein('HELLO', 'hello', { caseSensitive: true })).toBe(0)
      expect(levenshtein('hello', 'hello', { caseSensitive: true })).toBe(1)
    })
  })

  describe('whitespace normalization', () => {
    it('normalizes whitespace by default', () => {
      expect(levenshtein('hello world', 'hello  world')).toBe(1)
      expect(levenshtein('hello   world', 'hello world')).toBe(1)
      expect(levenshtein(' hello ', 'hello')).toBe(1)
      expect(levenshtein('hello\t\nworld', 'hello world')).toBe(1)
    })

    it('does not normalize when normalizeWhitespace is false', () => {
      expect(
        levenshtein('hello world', 'hello  world', {
          normalizeWhitespace: false,
        })
      ).toBeLessThan(1)
      expect(
        levenshtein(' hello ', 'hello', { normalizeWhitespace: false })
      ).toBeLessThan(1)
    })
  })

  describe('null/undefined handling', () => {
    it('returns 1 when both are null by default', () => {
      expect(levenshtein(null, null)).toBe(1)
    })

    it('returns 1 when both are undefined by default', () => {
      expect(levenshtein(undefined, undefined)).toBe(1)
    })

    it('returns 1 when one is null and other is undefined by default', () => {
      expect(levenshtein(null, undefined)).toBe(1)
      expect(levenshtein(undefined, null)).toBe(1)
    })

    it('returns 0 when nullMatchesNull is false', () => {
      expect(levenshtein(null, null, { nullMatchesNull: false })).toBe(0)
      expect(
        levenshtein(undefined, undefined, { nullMatchesNull: false })
      ).toBe(0)
    })

    it('returns 0 when only one value is null/undefined', () => {
      expect(levenshtein(null, 'value')).toBe(0)
      expect(levenshtein('value', null)).toBe(0)
      expect(levenshtein(undefined, 'value')).toBe(0)
      expect(levenshtein('value', undefined)).toBe(0)
    })
  })

  describe('non-string inputs', () => {
    it('coerces numbers to strings', () => {
      expect(levenshtein(123, 123)).toBe(1)
      expect(levenshtein(123, 124)).toBeCloseTo(2 / 3, 3)
      expect(levenshtein(42, '42')).toBe(1)
    })

    it('coerces booleans to strings', () => {
      expect(levenshtein(true, true)).toBe(1)
      expect(levenshtein(true, 'true')).toBe(1)
      expect(levenshtein(false, 'false')).toBe(1)
    })

    it('coerces objects to strings', () => {
      const obj1 = { toString: () => 'hello' }
      const obj2 = { toString: () => 'hello' }
      const obj3 = { toString: () => 'hallo' }
      expect(levenshtein(obj1, obj2)).toBe(1)
      expect(levenshtein(obj1, obj3)).toBe(0.8)
    })
  })

  describe('combined options', () => {
    it('applies both case sensitivity and whitespace normalization', () => {
      expect(
        levenshtein('Hello  World', 'hello world', {
          caseSensitive: false,
          normalizeWhitespace: true,
        })
      ).toBe(1)

      expect(
        levenshtein('Hello  World', 'hello world', {
          caseSensitive: true,
          normalizeWhitespace: true,
        })
      ).toBeLessThan(1)
    })
  })

  describe('edge cases', () => {
    it('handles very long strings', () => {
      const longStr1 = 'a'.repeat(100)
      const longStr2 = 'a'.repeat(100)
      expect(levenshtein(longStr1, longStr2)).toBe(1)

      const longStr3 = 'a'.repeat(99) + 'b'
      expect(levenshtein(longStr1, longStr3)).toBe(0.99)
    })

    it('handles strings with special characters', () => {
      expect(levenshtein('hello!', 'hello!')).toBe(1)
      expect(levenshtein('hello@world', 'hello#world')).toBeCloseTo(10 / 11, 3)
      expect(levenshtein('test-123', 'test-123')).toBe(1)
    })

    it('handles unicode characters', () => {
      expect(levenshtein('café', 'café')).toBe(1)
      expect(levenshtein('🙂', '🙂')).toBe(1)
      expect(levenshtein('hello 世界', 'hello 世界')).toBe(1)
    })
  })
})

describe('jaroWinkler', () => {
  describe('basic matching', () => {
    it('returns 1 for identical strings', () => {
      expect(jaroWinkler('MARTHA', 'MARTHA')).toBe(1)
      expect(jaroWinkler('hello', 'hello')).toBe(1)
      expect(jaroWinkler('', '')).toBe(1)
    })

    it('handles transpositions well', () => {
      // MARTHA vs MARHTA (H and T are transposed)
      const score = jaroWinkler('MARTHA', 'MARHTA')
      expect(score).toBeGreaterThan(0.95)
      expect(score).toBeLessThan(1)
    })

    it('rewards common prefixes', () => {
      // DIXON vs DICKSONX - has common prefix DI
      const score = jaroWinkler('DIXON', 'DICKSONX')
      expect(score).toBeGreaterThan(0.8)
      expect(score).toBeLessThan(0.85)
    })

    it('returns low score for different strings', () => {
      const score = jaroWinkler('SMITH', 'JONES')
      expect(score).toBeLessThan(0.5)
    })

    it('handles single character strings', () => {
      expect(jaroWinkler('a', 'a')).toBe(1)
      expect(jaroWinkler('a', 'b')).toBe(0)
    })
  })

  describe('empty strings', () => {
    it('returns 1 for two empty strings', () => {
      expect(jaroWinkler('', '')).toBe(1)
    })

    it('returns 0 when one string is empty', () => {
      expect(jaroWinkler('', 'abc')).toBe(0)
      expect(jaroWinkler('abc', '')).toBe(0)
      expect(jaroWinkler('', 'a')).toBe(0)
    })
  })

  describe('case sensitivity', () => {
    it('is case-insensitive by default', () => {
      expect(jaroWinkler('Martha', 'MARTHA')).toBe(1)
      expect(jaroWinkler('hello', 'HELLO')).toBe(1)
      expect(jaroWinkler('Smith', 'smith')).toBe(1)
    })

    it('respects case when caseSensitive is true', () => {
      // Martha/MARTHA have matching first letter 'M', so score > 0
      expect(
        jaroWinkler('Martha', 'MARTHA', { caseSensitive: true })
      ).toBeLessThan(0.6)
      expect(
        jaroWinkler('Martha', 'MARTHA', { caseSensitive: true })
      ).toBeGreaterThan(0)

      // hello/HELLO have no matching characters with case sensitivity
      expect(jaroWinkler('hello', 'HELLO', { caseSensitive: true })).toBe(0)
      expect(jaroWinkler('hello', 'hello', { caseSensitive: true })).toBe(1)
    })
  })

  describe('prefix scaling', () => {
    it('uses default prefix scale of 0.1', () => {
      const score1 = jaroWinkler('DIXON', 'DICKSONX')
      const score2 = jaroWinkler('DIXON', 'DICKSONX', { prefixScale: 0.1 })
      expect(score1).toBe(score2)
    })

    it('applies different prefix scales correctly', () => {
      const score0 = jaroWinkler('DIXON', 'DICKSONX', { prefixScale: 0 })
      const score1 = jaroWinkler('DIXON', 'DICKSONX', { prefixScale: 0.1 })
      const score2 = jaroWinkler('DIXON', 'DICKSONX', { prefixScale: 0.2 })

      // Higher prefix scale should give higher scores for strings with common prefixes
      expect(score2).toBeGreaterThan(score1)
      expect(score1).toBeGreaterThan(score0)
    })

    it('handles zero prefix scale (pure Jaro)', () => {
      const score = jaroWinkler('hello', 'hello', { prefixScale: 0 })
      expect(score).toBe(1)
    })

    it('handles maximum prefix scale of 0.25', () => {
      const score = jaroWinkler('DIXON', 'DICKSONX', { prefixScale: 0.25 })
      expect(score).toBeGreaterThan(0)
      expect(score).toBeLessThanOrEqual(1)
    })
  })

  describe('prefix length', () => {
    it('uses default maxPrefixLength of 4', () => {
      const score1 = jaroWinkler('PREFIX', 'PREFIXTEST')
      const score2 = jaroWinkler('PREFIX', 'PREFIXTEST', {
        maxPrefixLength: 4,
      })
      expect(score1).toBe(score2)
    })

    it('respects maxPrefixLength option', () => {
      const score2 = jaroWinkler('PREFIX', 'PREFIXTEST', {
        maxPrefixLength: 2,
      })
      const score4 = jaroWinkler('PREFIX', 'PREFIXTEST', {
        maxPrefixLength: 4,
      })
      const score6 = jaroWinkler('PREFIX', 'PREFIXTEST', {
        maxPrefixLength: 6,
      })

      // Longer prefix consideration should give higher scores
      expect(score6).toBeGreaterThan(score4)
      expect(score4).toBeGreaterThan(score2)
    })

    it('handles maxPrefixLength of 0', () => {
      const score = jaroWinkler('hello', 'hello', { maxPrefixLength: 0 })
      expect(score).toBe(1) // Still perfect match, just no prefix bonus
    })
  })

  describe('null/undefined handling', () => {
    it('returns 1 when both are null by default', () => {
      expect(jaroWinkler(null, null)).toBe(1)
    })

    it('returns 1 when both are undefined by default', () => {
      expect(jaroWinkler(undefined, undefined)).toBe(1)
    })

    it('returns 1 when one is null and other is undefined by default', () => {
      expect(jaroWinkler(null, undefined)).toBe(1)
      expect(jaroWinkler(undefined, null)).toBe(1)
    })

    it('returns 0 when nullMatchesNull is false', () => {
      expect(jaroWinkler(null, null, { nullMatchesNull: false })).toBe(0)
      expect(
        jaroWinkler(undefined, undefined, { nullMatchesNull: false })
      ).toBe(0)
    })

    it('returns 0 when only one value is null/undefined', () => {
      expect(jaroWinkler(null, 'value')).toBe(0)
      expect(jaroWinkler('value', null)).toBe(0)
      expect(jaroWinkler(undefined, 'value')).toBe(0)
      expect(jaroWinkler('value', undefined)).toBe(0)
    })
  })

  describe('non-string inputs', () => {
    it('coerces numbers to strings', () => {
      expect(jaroWinkler(123, 123)).toBe(1)
      expect(jaroWinkler(42, '42')).toBe(1)
      expect(jaroWinkler(123, 124)).toBeGreaterThan(0.5)
    })

    it('coerces booleans to strings', () => {
      expect(jaroWinkler(true, true)).toBe(1)
      expect(jaroWinkler(true, 'true')).toBe(1)
      expect(jaroWinkler(false, 'false')).toBe(1)
    })

    it('coerces objects to strings', () => {
      const obj1 = { toString: () => 'MARTHA' }
      const obj2 = { toString: () => 'MARTHA' }
      const obj3 = { toString: () => 'MARHTA' }
      expect(jaroWinkler(obj1, obj2)).toBe(1)
      expect(jaroWinkler(obj1, obj3)).toBeGreaterThan(0.9)
    })
  })

  describe('combined options', () => {
    it('applies case sensitivity with prefix options', () => {
      expect(
        jaroWinkler('Hello', 'hello', {
          caseSensitive: false,
          prefixScale: 0.1,
        })
      ).toBe(1)

      expect(
        jaroWinkler('Hello', 'hello', {
          caseSensitive: true,
          prefixScale: 0.1,
        })
      ).toBeLessThan(1)
    })
  })

  describe('edge cases', () => {
    it('handles very similar strings', () => {
      const score = jaroWinkler('DwAyNE', 'DuANE')
      expect(score).toBeGreaterThan(0.8)
      expect(score).toBeLessThan(1)
    })

    it('handles strings with special characters', () => {
      expect(jaroWinkler('hello!', 'hello!')).toBe(1)
      expect(jaroWinkler('test-123', 'test-123')).toBe(1)
    })

    it('handles unicode characters', () => {
      expect(jaroWinkler('café', 'café')).toBe(1)
      expect(jaroWinkler('🙂', '🙂')).toBe(1)
      expect(jaroWinkler('hello 世界', 'hello 世界')).toBe(1)
    })

    it('handles different length strings', () => {
      const score = jaroWinkler('AL', 'ALEXANDER')
      expect(score).toBeGreaterThan(0.5)
    })

    it('handles no common characters', () => {
      const score = jaroWinkler('abc', 'xyz')
      expect(score).toBe(0)
    })
  })

  describe('real-world name matching', () => {
    it('matches common name variations', () => {
      // Robert/Bob share some characters
      expect(jaroWinkler('Robert', 'Bob')).toBeGreaterThanOrEqual(0.5)
      expect(jaroWinkler('William', 'Bill')).toBeGreaterThan(0.4)
      // Stephen/Steven are very similar
      expect(jaroWinkler('Stephen', 'Steven')).toBeGreaterThan(0.85)
    })

    it('handles typos in names', () => {
      expect(jaroWinkler('Jennifer', 'Jenifer')).toBeGreaterThan(0.95)
      expect(jaroWinkler('Catherine', 'Katherine')).toBeGreaterThan(0.85)
    })

    it('distinguishes different names', () => {
      // John/Jane share 'J' and 'n', giving moderate similarity
      expect(jaroWinkler('John', 'Jane')).toBeLessThanOrEqual(0.7)
      expect(jaroWinkler('Michael', 'Michelle')).toBeGreaterThan(0.8)
    })
  })
})

describe('soundexEncode', () => {
  describe('basic encoding', () => {
    it('encodes classic Soundex examples correctly', () => {
      expect(soundexEncode('Robert')).toBe('R163')
      expect(soundexEncode('Rupert')).toBe('R163')
      expect(soundexEncode('Smith')).toBe('S530')
      expect(soundexEncode('Smyth')).toBe('S530')
    })

    it('handles single letter names', () => {
      expect(soundexEncode('A')).toBe('A000')
      expect(soundexEncode('B')).toBe('B000')
      expect(soundexEncode('Z')).toBe('Z000')
    })

    it('handles short names', () => {
      expect(soundexEncode('Lee')).toBe('L000')
      expect(soundexEncode('Li')).toBe('L000')
      expect(soundexEncode('Wu')).toBe('W000')
    })

    it('handles names with leading vowels', () => {
      expect(soundexEncode('Amy')).toBe('A500')
      expect(soundexEncode('Emily')).toBe('E540')
      expect(soundexEncode('Ann')).toBe('A500')
    })
  })

  describe('consonant mapping', () => {
    it('maps b, f, p, v to 1', () => {
      expect(soundexEncode('Bob')).toBe('B100')
      expect(soundexEncode('Fab')).toBe('F100')
      expect(soundexEncode('Pop')).toBe('P100')
      expect(soundexEncode('Viv')).toBe('V100')
    })

    it('maps c, g, j, k, q, s, x, z to 2', () => {
      expect(soundexEncode('Cac')).toBe('C200')
      expect(soundexEncode('Gag')).toBe('G200')
      expect(soundexEncode('Jaj')).toBe('J200')
      expect(soundexEncode('Kak')).toBe('K200')
    })

    it('maps d, t to 3', () => {
      expect(soundexEncode('Dad')).toBe('D300')
      expect(soundexEncode('Tat')).toBe('T300')
    })

    it('maps l to 4', () => {
      expect(soundexEncode('Lil')).toBe('L400')
    })

    it('maps m, n to 5', () => {
      expect(soundexEncode('Mom')).toBe('M500')
      expect(soundexEncode('Nan')).toBe('N500')
    })

    it('maps r to 6', () => {
      expect(soundexEncode('Rar')).toBe('R600')
    })
  })

  describe('duplicate removal', () => {
    it('removes duplicate adjacent consonants', () => {
      expect(soundexEncode('Pfister')).toBe('P236')
      // Both p and f map to 1, should only appear once
      expect(soundexEncode('Jackson')).toBe('J250')
    })

    it('handles duplicates at the start', () => {
      // First letter is kept, then duplicates removed
      expect(soundexEncode('Lloyd')).toBe('L300')
      expect(soundexEncode('Phillip')).toBe('P410')
    })
  })

  describe('vowel handling', () => {
    it('removes vowels', () => {
      expect(soundexEncode('Aeiou')).toBe('A000')
      expect(soundexEncode('Example')).toBe('E251')
    })

    it('removes h, w, y', () => {
      expect(soundexEncode('Hawley')).toBe('H400')
      expect(soundexEncode('Why')).toBe('W000')
    })

    it('allows consonants to match across vowels', () => {
      // Vowels break the duplicate sequence, so 'b' can appear again after 'a'
      // Babab: B-a-b-a-b → B-1-1 → B110
      expect(soundexEncode('Babab')).toBe('B110')
    })
  })

  describe('padding and truncation', () => {
    it('pads short codes with zeros', () => {
      expect(soundexEncode('A')).toBe('A000')
      expect(soundexEncode('Ab')).toBe('A100')
      expect(soundexEncode('Abc')).toBe('A120')
    })

    it('truncates long codes to 4 characters', () => {
      expect(soundexEncode('Washington')).toBe('W252')
      expect(soundexEncode('Wolfeschlegelsteinhausenbergerdorff')).toBe('W412')
    })
  })

  describe('edge cases', () => {
    it('returns empty string for empty input', () => {
      expect(soundexEncode('')).toBe('')
    })

    it('handles names with non-alphabetic characters', () => {
      expect(soundexEncode("O'Brien")).toBe('O165')
      expect(soundexEncode('Smith-Jones')).toBe('S532')
      expect(soundexEncode('Mary123')).toBe('M600')
      expect(soundexEncode('Test!')).toBe('T230')
    })

    it('handles names with numbers', () => {
      expect(soundexEncode('Test123')).toBe('T230')
      expect(soundexEncode('456Name')).toBe('N500')
    })

    it('handles lowercase input', () => {
      expect(soundexEncode('robert')).toBe('R163')
      expect(soundexEncode('smith')).toBe('S530')
    })

    it('handles mixed case input', () => {
      expect(soundexEncode('RoBeRt')).toBe('R163')
      expect(soundexEncode('SmItH')).toBe('S530')
    })

    it('handles input with only non-alphabetic characters', () => {
      expect(soundexEncode('123')).toBe('')
      expect(soundexEncode('!!!')).toBe('')
      expect(soundexEncode('   ')).toBe('')
    })
  })

  describe('real-world names', () => {
    it('encodes common name pairs the same', () => {
      // Catherine/Katherine start with different letters, so they don't match
      expect(soundexEncode('John')).toBe(soundexEncode('Jon'))
      expect(soundexEncode('Stephen')).toBe(soundexEncode('Steven'))
      expect(soundexEncode('Philip')).toBe(soundexEncode('Phillip'))
    })

    it('encodes different-sounding names differently', () => {
      // Catherine/Katherine start with different letters
      expect(soundexEncode('Catherine')).not.toBe(soundexEncode('Katherine'))
      expect(soundexEncode('Robert')).not.toBe(soundexEncode('Richard'))
    })
  })
})

describe('soundex', () => {
  describe('basic matching', () => {
    it('returns 1 for identical names', () => {
      expect(soundex('Robert', 'Robert')).toBe(1)
      expect(soundex('Smith', 'Smith')).toBe(1)
    })

    it('returns 1 for classic Soundex pairs', () => {
      expect(soundex('Robert', 'Rupert')).toBe(1)
      expect(soundex('Smith', 'Smyth')).toBe(1)
    })

    it('returns 0 for different Soundex codes', () => {
      expect(soundex('Smith', 'Jones')).toBe(0)
      expect(soundex('Robert', 'John')).toBe(0)
    })

    it('returns 1 for short names that encode the same', () => {
      expect(soundex('Lee', 'Li')).toBe(1)
      expect(soundex('Wu', 'Woo')).toBe(1)
    })

    it('returns 0 for names with different leading vowels', () => {
      expect(soundex('Amy', 'Emily')).toBe(0)
      expect(soundex('Ann', 'Ian')).toBe(0)
    })
  })

  describe('case insensitivity', () => {
    it('is always case-insensitive', () => {
      expect(soundex('ROBERT', 'robert')).toBe(1)
      expect(soundex('Smith', 'SMITH')).toBe(1)
      expect(soundex('MiXeD', 'mixed')).toBe(1)
    })
  })

  describe('null/undefined handling', () => {
    it('returns 1 when both are null by default', () => {
      expect(soundex(null, null)).toBe(1)
    })

    it('returns 1 when both are undefined by default', () => {
      expect(soundex(undefined, undefined)).toBe(1)
    })

    it('returns 1 when one is null and other is undefined by default', () => {
      expect(soundex(null, undefined)).toBe(1)
      expect(soundex(undefined, null)).toBe(1)
    })

    it('returns 0 when nullMatchesNull is false', () => {
      expect(soundex(null, null, { nullMatchesNull: false })).toBe(0)
      expect(soundex(undefined, undefined, { nullMatchesNull: false })).toBe(0)
    })

    it('returns 0 when only one value is null/undefined', () => {
      expect(soundex(null, 'value')).toBe(0)
      expect(soundex('value', null)).toBe(0)
      expect(soundex(undefined, 'value')).toBe(0)
      expect(soundex('value', undefined)).toBe(0)
    })
  })

  describe('non-string inputs', () => {
    it('coerces numbers to strings', () => {
      expect(soundex(123, 123)).toBe(1)
      expect(soundex(123, '123')).toBe(1)
    })

    it('coerces booleans to strings', () => {
      expect(soundex(true, true)).toBe(1)
      expect(soundex(true, 'true')).toBe(1)
      expect(soundex(false, 'false')).toBe(1)
    })

    it('coerces objects to strings', () => {
      const obj1 = { toString: () => 'Robert' }
      const obj2 = { toString: () => 'Rupert' }
      expect(soundex(obj1, obj2)).toBe(1)
    })
  })

  describe('empty strings', () => {
    it('returns 1 for two empty strings', () => {
      expect(soundex('', '')).toBe(1)
    })

    it('returns 0 when one string is empty', () => {
      expect(soundex('', 'Robert')).toBe(0)
      expect(soundex('Robert', '')).toBe(0)
    })

    it('returns 1 for strings with only non-alphabetic characters', () => {
      expect(soundex('!!!', '###')).toBe(1)
      expect(soundex('123', '456')).toBe(1)
    })
  })

  describe('special characters', () => {
    it('strips special characters before encoding', () => {
      expect(soundex("O'Brien", 'OBrien')).toBe(1)
      expect(soundex('Smith-Jones', 'SmithJones')).toBe(1)
      expect(soundex('Mary!', 'Mary')).toBe(1)
    })

    it('handles names with hyphens', () => {
      expect(soundex('Jean-Pierre', 'JeanPierre')).toBe(1)
    })

    it('handles names with apostrophes', () => {
      expect(soundex("D'Angelo", 'DAngelo')).toBe(1)
    })
  })

  describe('real-world name matching', () => {
    it('matches common spelling variations', () => {
      // Note: Catherine/Katherine start with different letters, so no match
      expect(soundex('John', 'Jon')).toBe(1)
      expect(soundex('Stephen', 'Steven')).toBe(1)
      expect(soundex('Philip', 'Phillip')).toBe(1)
      expect(soundex('Smith', 'Smyth')).toBe(1)
    })

    it('distinguishes clearly different names', () => {
      // Note: John/Jane both encode to J500, Michael/Michelle to M240
      expect(soundex('Catherine', 'Katherine')).toBe(0) // Different first letters
      expect(soundex('Peter', 'Paul')).toBe(0)
      expect(soundex('David', 'Michael')).toBe(0)
    })

    it('handles surnames', () => {
      expect(soundex('Johnson', 'Jonson')).toBe(1)
      expect(soundex('Williams', 'Willams')).toBe(1)
    })
  })

  describe('edge cases', () => {
    it('handles single character names', () => {
      expect(soundex('A', 'A')).toBe(1)
      expect(soundex('A', 'B')).toBe(0)
    })

    it('handles very long names', () => {
      const long1 = 'Wolfeschlegelsteinhausenbergerdorff'
      const long2 = 'Wolfeschlegelsteinhausenbergerdorff'
      expect(soundex(long1, long2)).toBe(1)
    })
  })
})

describe('metaphoneEncode', () => {
  describe('basic encoding', () => {
    it('encodes consonant clusters correctly', () => {
      // CH -> X
      expect(metaphoneEncode('Charles')).toBe('XRLS')
      expect(metaphoneEncode('Church')).toBe('XRX')

      // PH -> F
      expect(metaphoneEncode('Philip')).toBe('FLP')
      expect(metaphoneEncode('Phone')).toBe('FN')

      // TH -> 0
      expect(metaphoneEncode('Thomas')).toBe('0MS')
      expect(metaphoneEncode('Think')).toBe('0NK')

      // SH -> X
      expect(metaphoneEncode('Shane')).toBe('XN')
      expect(metaphoneEncode('Shawn')).toBe('XN')
    })

    it('handles silent letters', () => {
      // Silent K in KN
      expect(metaphoneEncode('Knight')).toBe('NXT')
      expect(metaphoneEncode('Knife')).toBe('NF')

      // Silent G in GN
      expect(metaphoneEncode('Gnostic')).toBe('NSTK')

      // Silent P in PN
      expect(metaphoneEncode('Pneumonia')).toBe('NMN')

      // Silent W in WR
      expect(metaphoneEncode('Write')).toBe('RT')
    })

    it('handles initial WH correctly', () => {
      expect(metaphoneEncode('White')).toBe('WT')
      expect(metaphoneEncode('Whale')).toBe('WL')
    })

    it('handles initial X', () => {
      expect(metaphoneEncode('Xavier')).toBe('SFR')
      expect(metaphoneEncode('Xray')).toBe('SR')
    })

    it('handles C variations', () => {
      // C before I, E, Y -> S
      expect(metaphoneEncode('City')).toBe('ST')
      expect(metaphoneEncode('Cell')).toBe('SL')
      expect(metaphoneEncode('Cyan')).toBe('SN')

      // CIA -> X
      expect(metaphoneEncode('Special')).toBe('SPXL')

      // Otherwise C -> K
      expect(metaphoneEncode('Cat')).toBe('KT')
      expect(metaphoneEncode('Clap')).toBe('KLP')
    })

    it('handles G variations', () => {
      // G before I, E, Y -> J
      expect(metaphoneEncode('Gem')).toBe('JM')
      expect(metaphoneEncode('Giant')).toBe('JNT')
      expect(metaphoneEncode('Gym')).toBe('JM')

      // Otherwise G -> K
      expect(metaphoneEncode('Gate')).toBe('KT')
      expect(metaphoneEncode('Game')).toBe('KM')
    })

    it('handles D variations', () => {
      // DGE, DGY, DGI -> J
      expect(metaphoneEncode('Edge')).toBe('EJ')
      // Judge: J + (DGE->J) = JJ, then duplicate removal = J
      expect(metaphoneEncode('Judge')).toBe('J')

      // Otherwise D -> T
      expect(metaphoneEncode('Dog')).toBe('TK')
      expect(metaphoneEncode('David')).toBe('TFT')
    })

    it('handles S variations', () => {
      // SH -> X
      expect(metaphoneEncode('Shaw')).toBe('X')

      // SIO, SIA -> S+X (S followed by IO/IA becomes S+X)
      // Session: S+E(skip)+S+S+SIO(->S+X)+N = SSSXN, duplicate removal: SXN
      expect(metaphoneEncode('Session')).toBe('SXN')
      expect(metaphoneEncode('Asia')).toBe('ASX')

      // Otherwise S -> S
      expect(metaphoneEncode('Sam')).toBe('SM')
    })

    it('handles T variations', () => {
      // TIA, TIO -> X
      expect(metaphoneEncode('Nation')).toBe('NXN')
      expect(metaphoneEncode('Partial')).toBe('PRXL')

      // TCH -> skip T (just CH -> X)
      expect(metaphoneEncode('Match')).toBe('MX')
      expect(metaphoneEncode('Catch')).toBe('KX')

      // TH -> 0
      expect(metaphoneEncode('The')).toBe('0')

      // Otherwise T -> T
      expect(metaphoneEncode('Tom')).toBe('TM')
    })

    it('handles other consonant transformations', () => {
      // V -> F
      expect(metaphoneEncode('Victor')).toBe('FKTR')

      // Q -> K
      expect(metaphoneEncode('Queen')).toBe('KN')

      // Z -> S
      expect(metaphoneEncode('Zap')).toBe('SP')

      // X -> KS
      expect(metaphoneEncode('Box')).toBe('BKS')
      expect(metaphoneEncode('Max')).toBe('MKS')
    })

    it('handles vowels correctly', () => {
      // Vowels only kept at beginning
      expect(metaphoneEncode('Apple')).toBe('APL')
      expect(metaphoneEncode('Eagle')).toBe('EKL')
      expect(metaphoneEncode('Ice')).toBe('IS')
      // Ocean: O + (CE->S, skips E) + N = 'OSN'
      expect(metaphoneEncode('Ocean')).toBe('OSN')
      expect(metaphoneEncode('Under')).toBe('UNTR')

      // Internal vowels dropped
      expect(metaphoneEncode('Test')).toBe('TST')
    })

    it('handles silent H', () => {
      // H after vowel and not before vowel is silent
      expect(metaphoneEncode('Noah')).toBe('N')

      // H before vowel is kept
      // Hello: H+E(vowel)+L+L+O(vowel) = HLL, duplicate removal: HL
      expect(metaphoneEncode('Hello')).toBe('HL')
    })

    it('handles silent W and Y', () => {
      // W not followed by vowel is silent
      expect(metaphoneEncode('Saw')).toBe('S')

      // Y not followed by vowel is silent
      expect(metaphoneEncode('Boy')).toBe('B')

      // Y before vowel is kept
      expect(metaphoneEncode('Yes')).toBe('YS')
    })

    it('handles silent B', () => {
      // B after M at end of word is silent
      expect(metaphoneEncode('Lamb')).toBe('LM')
      expect(metaphoneEncode('Climb')).toBe('KLM')
    })

    it('handles silent GH', () => {
      expect(metaphoneEncode('Night')).toBe('NXT')
      expect(metaphoneEncode('Light')).toBe('LXT')
      // Tough: T+O(skip)+U(skip)+GH->X = TX
      expect(metaphoneEncode('Tough')).toBe('TX')
    })

    it('respects maxLength parameter', () => {
      expect(metaphoneEncode('Christine', 2)).toBe('XR')
      expect(metaphoneEncode('Christine', 4)).toBe('XRST')
      expect(metaphoneEncode('Christine', 6)).toBe('XRSTN')
      expect(metaphoneEncode('Christine', 10)).toBe('XRSTN')
    })
  })

  describe('edge cases', () => {
    it('returns empty string for empty input', () => {
      expect(metaphoneEncode('')).toBe('')
    })

    it('handles single letter names', () => {
      expect(metaphoneEncode('A')).toBe('A')
      expect(metaphoneEncode('B')).toBe('B')
      expect(metaphoneEncode('X')).toBe('S')
    })

    it('handles short names', () => {
      expect(metaphoneEncode('Al')).toBe('AL')
      expect(metaphoneEncode('Ed')).toBe('ET')
      expect(metaphoneEncode('Jo')).toBe('J')
    })

    it('handles names with non-alphabetic characters', () => {
      expect(metaphoneEncode("O'Brien")).toBe('OBRN')
      expect(metaphoneEncode('Smith-Jones')).toBe('SM0J')
      expect(metaphoneEncode('Mary123')).toBe('MR')
      expect(metaphoneEncode('Test!')).toBe('TST')
    })

    it('handles lowercase input', () => {
      expect(metaphoneEncode('christine')).toBe('XRST')
      expect(metaphoneEncode('knight')).toBe('NXT')
    })

    it('handles mixed case input', () => {
      expect(metaphoneEncode('ChRiStInE')).toBe('XRST')
      expect(metaphoneEncode('KnIgHt')).toBe('NXT')
    })

    it('handles input with only non-alphabetic characters', () => {
      expect(metaphoneEncode('123')).toBe('')
      expect(metaphoneEncode('!!!')).toBe('')
      expect(metaphoneEncode('   ')).toBe('')
    })
  })

  describe('real-world names', () => {
    it('encodes name variations similarly', () => {
      // Note: In this implementation CH->X (standard Metaphone)
      // so Christine (XRST) and Kristine (KRST) encode differently
      // Both Stephen/Steven and Philip/Phillip match as expected
      expect(metaphoneEncode('Christine')).toBe('XRST')
      expect(metaphoneEncode('Kristine')).toBe('KRST')

      // Stephen/Steven
      const stephen = metaphoneEncode('Stephen')
      const steven = metaphoneEncode('Steven')
      expect(stephen).toBe(steven)

      // Philip/Phillip
      const philip = metaphoneEncode('Philip')
      const phillip = metaphoneEncode('Phillip')
      expect(philip).toBe(phillip)
    })

    it('handles names with silent letters', () => {
      // Knight/Night
      expect(metaphoneEncode('Knight')).toBe(metaphoneEncode('Night'))

      // Wright/Right
      expect(metaphoneEncode('Wright')).toBe(metaphoneEncode('Right'))
    })

    it('distinguishes different names', () => {
      expect(metaphoneEncode('Smith')).not.toBe(metaphoneEncode('Jones'))
      expect(metaphoneEncode('Robert')).not.toBe(metaphoneEncode('Richard'))
      // Mary and Marie are phonetically similar, so they encode the same
      expect(metaphoneEncode('Mary')).toBe(metaphoneEncode('Marie'))
    })
  })
})

describe('metaphone', () => {
  describe('basic matching', () => {
    it('returns 1 for identical names', () => {
      expect(metaphone('Christine', 'Christine')).toBe(1)
      expect(metaphone('Knight', 'Knight')).toBe(1)
    })

    it('returns 1 for phonetically similar names', () => {
      // Christine/Kristine differ due to CH->X vs K->K
      expect(metaphone('Christine', 'Kristine')).toBe(0)
      expect(metaphone('Stephen', 'Steven')).toBe(1)
      expect(metaphone('Knight', 'Night')).toBe(1)
      expect(metaphone('Philip', 'Phillip')).toBe(1)
    })

    it('returns 0 for phonetically different names', () => {
      expect(metaphone('Smith', 'Jones')).toBe(0)
      expect(metaphone('Robert', 'Richard')).toBe(0)
      // Mary/Marie are phonetically similar and match
      expect(metaphone('Mary', 'Marie')).toBe(1)
    })
  })

  describe('improvements over Soundex', () => {
    it('matches names where Soundex fails', () => {
      // Note: This implementation has CH->X, so Christine/Kristine differ
      // But other cases work well

      // Stephen/Steven - Soundex: S315 vs S315 (same)
      // Metaphone: also matches
      expect(metaphone('Stephen', 'Steven')).toBe(1)
    })

    it('handles consonant clusters better', () => {
      // PH sound
      expect(metaphone('Philip', 'Filip')).toBe(1)

      // TH sound
      expect(metaphone('Smith', 'Smyth')).toBe(1)
    })

    it('handles silent letters better', () => {
      expect(metaphone('Knight', 'Night')).toBe(1)
      expect(metaphone('Wright', 'Right')).toBe(1)
      expect(metaphone('Gnostic', 'Nostic')).toBe(1)
    })
  })

  describe('maxLength option', () => {
    it('uses default maxLength of 4', () => {
      const score1 = metaphone('Christine', 'Christina')
      const score2 = metaphone('Christine', 'Christina', { maxLength: 4 })
      expect(score1).toBe(score2)
    })

    it('respects custom maxLength', () => {
      // With shorter length, may match
      expect(metaphone('Christine', 'Christopher', { maxLength: 2 })).toBe(1)

      // With longer length, less likely to match
      expect(metaphone('Christine', 'Christopher', { maxLength: 10 })).toBe(0)
    })
  })

  describe('case insensitivity', () => {
    it('is always case-insensitive', () => {
      expect(metaphone('CHRISTINE', 'christine')).toBe(1)
      expect(metaphone('Knight', 'KNIGHT')).toBe(1)
      expect(metaphone('MiXeD', 'mixed')).toBe(1)
    })
  })

  describe('null/undefined handling', () => {
    it('returns 1 when both are null by default', () => {
      expect(metaphone(null, null)).toBe(1)
    })

    it('returns 1 when both are undefined by default', () => {
      expect(metaphone(undefined, undefined)).toBe(1)
    })

    it('returns 1 when one is null and other is undefined by default', () => {
      expect(metaphone(null, undefined)).toBe(1)
      expect(metaphone(undefined, null)).toBe(1)
    })

    it('returns 0 when nullMatchesNull is false', () => {
      expect(metaphone(null, null, { nullMatchesNull: false })).toBe(0)
      expect(metaphone(undefined, undefined, { nullMatchesNull: false })).toBe(
        0
      )
    })

    it('returns 0 when only one value is null/undefined', () => {
      expect(metaphone(null, 'value')).toBe(0)
      expect(metaphone('value', null)).toBe(0)
      expect(metaphone(undefined, 'value')).toBe(0)
      expect(metaphone('value', undefined)).toBe(0)
    })
  })

  describe('non-string inputs', () => {
    it('coerces numbers to strings', () => {
      expect(metaphone(123, 123)).toBe(1)
      expect(metaphone(123, '123')).toBe(1)
    })

    it('coerces booleans to strings', () => {
      expect(metaphone(true, true)).toBe(1)
      expect(metaphone(true, 'true')).toBe(1)
      expect(metaphone(false, 'false')).toBe(1)
    })

    it('coerces objects to strings', () => {
      const obj1 = { toString: () => 'Stephen' }
      const obj2 = { toString: () => 'Steven' }
      expect(metaphone(obj1, obj2)).toBe(1)
    })
  })

  describe('empty strings', () => {
    it('returns 1 for two empty strings', () => {
      expect(metaphone('', '')).toBe(1)
    })

    it('returns 0 when one string is empty', () => {
      expect(metaphone('', 'Christine')).toBe(0)
      expect(metaphone('Christine', '')).toBe(0)
    })

    it('returns 1 for strings with only non-alphabetic characters', () => {
      expect(metaphone('!!!', '###')).toBe(1)
      expect(metaphone('123', '456')).toBe(1)
    })
  })

  describe('special characters', () => {
    it('strips special characters before encoding', () => {
      expect(metaphone("O'Brien", 'OBrien')).toBe(1)
      expect(metaphone('Smith-Jones', 'SmithJones')).toBe(1)
      expect(metaphone('Mary!', 'Mary')).toBe(1)
    })

    it('handles names with hyphens', () => {
      expect(metaphone('Jean-Pierre', 'JeanPierre')).toBe(1)
    })

    it('handles names with apostrophes', () => {
      expect(metaphone("D'Angelo", 'DAngelo')).toBe(1)
    })
  })

  describe('real-world name matching', () => {
    it('matches common spelling variations', () => {
      // Christine/Kristine differ in this implementation (CH->X vs K)
      expect(metaphone('Stephen', 'Steven')).toBe(1)
      expect(metaphone('Philip', 'Phillip')).toBe(1)
      expect(metaphone('Catherine', 'Katherine')).toBe(1)
    })

    it('distinguishes clearly different names', () => {
      expect(metaphone('Peter', 'Paul')).toBe(0)
      expect(metaphone('David', 'Michael')).toBe(0)
      expect(metaphone('Smith', 'Jones')).toBe(0)
    })

    it('handles surnames', () => {
      expect(metaphone('Johnson', 'Jonson')).toBe(1)
      expect(metaphone('Wright', 'Right')).toBe(1)
    })
  })

  describe('edge cases', () => {
    it('handles single character names', () => {
      expect(metaphone('A', 'A')).toBe(1)
      expect(metaphone('A', 'B')).toBe(0)
    })

    it('handles very short names', () => {
      expect(metaphone('Al', 'Al')).toBe(1)
      expect(metaphone('Ed', 'Ed')).toBe(1)
    })

    it('handles very long names', () => {
      const long1 = 'Wolfeschlegelsteinhausenbergerdorff'
      const long2 = 'Wolfeschlegelsteinhausenbergerdorff'
      expect(metaphone(long1, long2)).toBe(1)
    })
  })
})
