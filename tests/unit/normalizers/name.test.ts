import { describe, it, expect } from 'vitest'
import {
  normalizeName,
  parseNameComponents,
  type NameComponents,
} from '../../../src/core/normalizers/name'
import { getNormalizer } from '../../../src/core/normalizers/registry'

describe('Name Normalizer', () => {
  describe('parseNameComponents', () => {
    it('should parse simple two-part names', () => {
      expect(parseNameComponents('John Smith')).toEqual({
        first: 'John',
        last: 'Smith',
      })
    })

    it('should parse names with titles', () => {
      expect(parseNameComponents('Dr. Jane Doe')).toEqual({
        title: 'Dr.',
        first: 'Jane',
        last: 'Doe',
      })

      expect(parseNameComponents('Mr. John Smith')).toEqual({
        title: 'Mr.',
        first: 'John',
        last: 'Smith',
      })

      expect(parseNameComponents('Professor Alice Johnson')).toEqual({
        title: 'Professor',
        first: 'Alice',
        last: 'Johnson',
      })
    })

    it('should parse names with suffixes', () => {
      expect(parseNameComponents('John Smith Jr.')).toEqual({
        first: 'John',
        last: 'Smith',
        suffix: 'Jr.',
      })

      expect(parseNameComponents('Robert Jones Sr.')).toEqual({
        first: 'Robert',
        last: 'Jones',
        suffix: 'Sr.',
      })

      expect(parseNameComponents('John Smith III')).toEqual({
        first: 'John',
        last: 'Smith',
        suffix: 'III',
      })

      expect(parseNameComponents('Jane Doe Esquire')).toEqual({
        first: 'Jane',
        last: 'Doe',
        suffix: 'Esquire',
      })
    })

    it('should parse names with middle names', () => {
      expect(parseNameComponents('Mary Jane Watson')).toEqual({
        first: 'Mary',
        middle: ['Jane'],
        last: 'Watson',
      })

      expect(parseNameComponents('John Quincy Adams')).toEqual({
        first: 'John',
        middle: ['Quincy'],
        last: 'Adams',
      })

      expect(parseNameComponents('Mary Ann Elizabeth Smith')).toEqual({
        first: 'Mary',
        middle: ['Ann', 'Elizabeth'],
        last: 'Smith',
      })
    })

    it('should parse names with both title and suffix', () => {
      expect(parseNameComponents('Dr. John Smith PhD')).toEqual({
        title: 'Dr.',
        first: 'John',
        last: 'Smith',
        suffix: 'PHD',
      })

      expect(parseNameComponents('Mr. Robert Jones Jr.')).toEqual({
        title: 'Mr.',
        first: 'Robert',
        last: 'Jones',
        suffix: 'Jr.',
      })
    })

    it('should parse names with multiple suffixes', () => {
      expect(parseNameComponents('John Smith Jr. PhD')).toEqual({
        first: 'John',
        last: 'Smith',
        suffix: 'Jr. PHD',
      })

      expect(parseNameComponents('Jane Doe MD MBA')).toEqual({
        first: 'Jane',
        last: 'Doe',
        suffix: 'MD MBA',
      })
    })

    it('should handle single-word names', () => {
      expect(parseNameComponents('Madonna')).toEqual({
        last: 'Madonna',
      })

      expect(parseNameComponents('Cher')).toEqual({
        last: 'Cher',
      })
    })

    it('should handle hyphenated names', () => {
      expect(parseNameComponents('Jean-Claude Van Damme')).toEqual({
        first: 'Jean-Claude',
        middle: ['Van'],
        last: 'Damme',
      })

      expect(parseNameComponents('Mary-Kate Olsen')).toEqual({
        first: 'Mary-Kate',
        last: 'Olsen',
      })
    })

    it('should handle names with apostrophes', () => {
      expect(parseNameComponents("Patrick O'Brien")).toEqual({
        first: 'Patrick',
        last: "O'Brien",
      })

      expect(parseNameComponents("D'Angelo Russell")).toEqual({
        first: "D'Angelo",
        last: 'Russell',
      })
    })

    it('should handle compound last names with particles', () => {
      expect(parseNameComponents('Ludwig van Beethoven')).toEqual({
        first: 'Ludwig',
        middle: ['van'],
        last: 'Beethoven',
      })

      expect(parseNameComponents('Leonardo da Vinci')).toEqual({
        first: 'Leonardo',
        middle: ['da'],
        last: 'Vinci',
      })
    })

    it('should handle empty or null input', () => {
      expect(parseNameComponents('')).toEqual({})
      expect(parseNameComponents('   ')).toEqual({})
    })

    it('should normalize whitespace', () => {
      expect(parseNameComponents('John    Smith')).toEqual({
        first: 'John',
        last: 'Smith',
      })

      expect(parseNameComponents('  Mary   Jane   Watson  ')).toEqual({
        first: 'Mary',
        middle: ['Jane'],
        last: 'Watson',
      })
    })
  })

  describe('normalizeName', () => {
    describe('basic normalization', () => {
      it('should normalize simple names to title case', () => {
        expect(normalizeName('john smith')).toBe('John Smith')
        expect(normalizeName('JOHN SMITH')).toBe('John Smith')
        expect(normalizeName('JoHn SmItH')).toBe('John Smith')
      })

      it('should handle names with titles', () => {
        expect(normalizeName('dr. jane doe')).toBe('Dr. Jane Doe')
        expect(normalizeName('MR. JOHN SMITH')).toBe('Mr. John Smith')
        expect(normalizeName('professor alice johnson')).toBe('Professor Alice Johnson')
      })

      it('should handle names with suffixes', () => {
        expect(normalizeName('john smith jr.')).toBe('John Smith Jr.')
        expect(normalizeName('ROBERT JONES SR.')).toBe('Robert Jones Sr.')
        expect(normalizeName('john smith iii')).toBe('John Smith III')
      })

      it('should handle middle names', () => {
        expect(normalizeName('mary jane watson')).toBe('Mary Jane Watson')
        expect(normalizeName('JOHN QUINCY ADAMS')).toBe('John Quincy Adams')
      })

      it('should handle whitespace normalization', () => {
        expect(normalizeName('  john    smith  ')).toBe('John Smith')
        expect(normalizeName('mary   jane   watson')).toBe('Mary Jane Watson')
      })

      it('should return null for null/undefined', () => {
        expect(normalizeName(null)).toBe(null)
        expect(normalizeName(undefined)).toBe(null)
      })

      it('should return null for empty strings', () => {
        expect(normalizeName('')).toBe(null)
        expect(normalizeName('   ')).toBe(null)
      })

      it('should coerce non-string inputs', () => {
        expect(normalizeName(123)).toBe('123')
      })
    })

    describe('special name patterns', () => {
      it('should handle Mc/Mac prefix names', () => {
        expect(normalizeName('mcdonald')).toBe('McDonald')
        expect(normalizeName('MACGREGOR')).toBe('MacGregor')
        expect(normalizeName('mcbride')).toBe('McBride')
      })

      it("should handle O' prefix names", () => {
        expect(normalizeName("o'brien")).toBe("O'Brien")
        expect(normalizeName("O'CONNOR")).toBe("O'Connor")
        expect(normalizeName("patrick o'neill")).toBe("Patrick O'Neill")
      })

      it('should handle hyphenated names', () => {
        expect(normalizeName('jean-claude van damme')).toBe('Jean-Claude van Damme')
        expect(normalizeName('MARY-KATE OLSEN')).toBe('Mary-Kate Olsen')
      })

      it('should handle particles in names', () => {
        expect(normalizeName('ludwig van beethoven')).toBe('Ludwig van Beethoven')
        expect(normalizeName('LEONARDO DA VINCI')).toBe('Leonardo da Vinci')
        expect(normalizeName('vincent van gogh')).toBe('Vincent van Gogh')
      })

      it('should handle compound last names', () => {
        expect(normalizeName('juan de la cruz')).toBe('Juan de la Cruz')
        expect(normalizeName('maria del carmen')).toBe('Maria del Carmen')
      })

      it('should handle particles in compound last names', () => {
        // Particle is treated as middle name in three-word names
        const result = normalizeName('maria von habsburg', { outputFormat: 'components' }) as NameComponents
        expect(result.first).toBe('Maria')
        expect(result.middle).toEqual(['von'])
        expect(result.last).toBe('Habsburg')
      })
    })

    describe('additional edge cases', () => {
      it('should handle esquire suffix', () => {
        expect(normalizeName('john smith esquire')).toBe('John Smith Esquire')
      })
    })

    describe('options: preserveCase', () => {
      it('should preserve original casing when preserveCase is true', () => {
        expect(normalizeName('JOHN SMITH', { preserveCase: true })).toBe('JOHN SMITH')
        expect(normalizeName('john smith', { preserveCase: true })).toBe('john smith')
        expect(normalizeName('JoHn SmItH', { preserveCase: true })).toBe('JoHn SmItH')
      })
    })

    describe('options: extractTitles', () => {
      it('should include titles by default', () => {
        expect(normalizeName('dr. john smith')).toBe('Dr. John Smith')
      })

      it('should exclude titles when extractTitles is false', () => {
        expect(normalizeName('dr. john smith', { extractTitles: false })).toBe('John Smith')
        expect(normalizeName('mr. robert jones', { extractTitles: false })).toBe('Robert Jones')
      })
    })

    describe('options: extractSuffixes', () => {
      it('should include suffixes by default', () => {
        expect(normalizeName('john smith jr.')).toBe('John Smith Jr.')
      })

      it('should exclude suffixes when extractSuffixes is false', () => {
        expect(normalizeName('john smith jr.', { extractSuffixes: false })).toBe('John Smith')
        expect(normalizeName('jane doe phd', { extractSuffixes: false })).toBe('Jane Doe')
      })
    })

    describe('options: normalizeWhitespace', () => {
      it('should normalize whitespace by default', () => {
        expect(normalizeName('john    smith')).toBe('John Smith')
      })

      it('should preserve whitespace when normalizeWhitespace is false', () => {
        const result = normalizeName('john    smith', { normalizeWhitespace: false })
        // Should still parse correctly but may have extra spaces
        expect(result).toBeTruthy()
      })
    })

    describe('options: outputFormat', () => {
      it('should return full name string by default', () => {
        const result = normalizeName('dr. john smith jr.')
        expect(typeof result).toBe('string')
        expect(result).toBe('Dr. John Smith Jr.')
      })

      it('should return components when outputFormat is "components"', () => {
        const result = normalizeName('dr. john quincy smith jr.', {
          outputFormat: 'components',
        }) as NameComponents

        expect(result).toEqual({
          title: 'Dr.',
          first: 'John',
          middle: ['Quincy'],
          last: 'Smith',
          suffix: 'Jr.',
          full: 'Dr. John Quincy Smith Jr.',
        })
      })

      it('should return components for simple names', () => {
        const result = normalizeName('john smith', {
          outputFormat: 'components',
        }) as NameComponents

        expect(result).toEqual({
          first: 'John',
          last: 'Smith',
          full: 'John Smith',
        })
      })

      it('should return components with middle names', () => {
        const result = normalizeName('mary jane watson', {
          outputFormat: 'components',
        }) as NameComponents

        expect(result).toEqual({
          first: 'Mary',
          middle: ['Jane'],
          last: 'Watson',
          full: 'Mary Jane Watson',
        })
      })
    })

    describe('complex real-world names', () => {
      it('should handle full formal names', () => {
        expect(normalizeName('Dr. Martin Luther King Jr.'))
          .toBe('Dr. Martin Luther King Jr.')
      })

      it('should handle academic titles', () => {
        expect(normalizeName('professor john doe phd'))
          .toBe('Professor John Doe PHD')
      })

      it('should handle military titles', () => {
        expect(normalizeName('captain james t. kirk'))
          .toBe('Captain James T. Kirk')
      })

      it('should handle multiple middle names', () => {
        expect(normalizeName('john fitzgerald kennedy'))
          .toBe('John Fitzgerald Kennedy')
      })

      it('should handle names with mixed formatting', () => {
        expect(normalizeName('  DR.   john   QUINCY   smith   JR.  '))
          .toBe('Dr. John Quincy Smith Jr.')
      })
    })

    describe('edge cases', () => {
      it('should handle single names', () => {
        expect(normalizeName('madonna')).toBe('Madonna')
        expect(normalizeName('cher')).toBe('Cher')
      })

      it('should handle names that are only titles', () => {
        expect(normalizeName('dr.')).toBe('Dr.')
        expect(normalizeName('mr.')).toBe('Mr.')
      })

      it('should handle names that are only suffixes', () => {
        expect(normalizeName('jr.')).toBe('Jr.')
        expect(normalizeName('phd')).toBe('PHD')
      })

      it('should handle unicode characters', () => {
        expect(normalizeName('josé garcía')).toBe('José García')
        expect(normalizeName('françois martin')).toBe('François Martin')
      })

      it('should handle very long names', () => {
        const longName = 'pablo diego josé francisco de paula juan nepomuceno maría de los remedios cipriano de la santísima trinidad ruiz picasso'
        const result = normalizeName(longName)
        expect(result).toBeTruthy()
        expect(typeof result).toBe('string')
      })
    })

    describe('registry integration', () => {
      it('should be registered in the normalizer registry', () => {
        const normalizer = getNormalizer('name')
        expect(normalizer).toBeDefined()
        expect(normalizer?.('john smith')).toBe('John Smith')
      })

      it('should work with registry options', () => {
        const normalizer = getNormalizer('name')
        const result = normalizer?.('dr. john smith', { outputFormat: 'components' }) as NameComponents
        expect(result).toHaveProperty('first')
        expect(result).toHaveProperty('last')
      })
    })
  })
})
