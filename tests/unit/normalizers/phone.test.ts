import { describe, it, expect } from 'vitest'
import {
  normalizePhone,
  isValidPhone,
  type PhoneComponents,
} from '../../../src/core/normalizers/phone'
import { getNormalizer } from '../../../src/core/normalizers/registry'

describe('Phone Normalizer', () => {
  describe('isValidPhone', () => {
    it('should validate US phone numbers', () => {
      expect(isValidPhone('202-555-0123', 'US')).toBe(true)
      expect(isValidPhone('(202) 555-0123', 'US')).toBe(true)
      expect(isValidPhone('2025550123', 'US')).toBe(true)
      expect(isValidPhone('+1 202 555 0123')).toBe(true)
    })

    it('should validate international phone numbers', () => {
      expect(isValidPhone('+44 20 7123 4567')).toBe(true)
      expect(isValidPhone('+49 30 12345678')).toBe(true)
      expect(isValidPhone('+91 98765 43210')).toBe(true)
      expect(isValidPhone('+86 10 1234 5678')).toBe(true)
    })

    it('should validate UK phone numbers', () => {
      expect(isValidPhone('020 7123 4567', 'GB')).toBe(true)
      expect(isValidPhone('07123 456789', 'GB')).toBe(true)
      expect(isValidPhone('+44 20 7123 4567')).toBe(true)
    })

    it('should validate German phone numbers', () => {
      expect(isValidPhone('030 12345678', 'DE')).toBe(true)
      expect(isValidPhone('+49 30 12345678')).toBe(true)
    })

    it('should reject invalid phone numbers', () => {
      expect(isValidPhone('123', 'US')).toBe(false)
      expect(isValidPhone('not-a-phone', 'US')).toBe(false)
      expect(isValidPhone('555', 'US')).toBe(false)
    })

    it('should reject empty or null input', () => {
      expect(isValidPhone('', 'US')).toBe(false)
      expect(isValidPhone(null as any)).toBe(false)
      expect(isValidPhone(undefined as any)).toBe(false)
    })

    it('should handle errors gracefully in validation', () => {
      // Test the catch block in isValidPhone (lines 56-58)
      // Use extremely malformed input or invalid country code to potentially trigger errors
      expect(isValidPhone('+', 'US')).toBe(false)
      expect(isValidPhone('invalid', 'INVALID' as any)).toBe(false)
    })

    it('should handle phone numbers without country context', () => {
      expect(isValidPhone('+12025550123')).toBe(true)
      expect(isValidPhone('+442071234567')).toBe(true)
    })
  })

  describe('normalizePhone', () => {
    describe('basic normalization', () => {
      it('should normalize US phone numbers to E.164 format', () => {
        expect(normalizePhone('202-555-0123', { defaultCountry: 'US' }))
          .toBe('+12025550123')
        expect(normalizePhone('(202) 555-0123', { defaultCountry: 'US' }))
          .toBe('+12025550123')
        expect(normalizePhone('202 555 0123', { defaultCountry: 'US' }))
          .toBe('+12025550123')
      })

      it('should normalize phone numbers with country code', () => {
        expect(normalizePhone('+1 202 555 0123')).toBe('+12025550123')
        expect(normalizePhone('1-202-555-0123')).toBe('+12025550123')
        expect(normalizePhone('+1-202-555-0123')).toBe('+12025550123')
      })

      it('should handle already normalized E.164 format', () => {
        expect(normalizePhone('+12025550123')).toBe('+12025550123')
        expect(normalizePhone('+442071234567')).toBe('+442071234567')
      })

      it('should return null for null/undefined', () => {
        expect(normalizePhone(null)).toBe(null)
        expect(normalizePhone(undefined)).toBe(null)
      })

      it('should return null for empty strings', () => {
        expect(normalizePhone('')).toBe(null)
        expect(normalizePhone('   ')).toBe(null)
      })

      it('should trim whitespace', () => {
        expect(normalizePhone('  202-555-0123  ', { defaultCountry: 'US' }))
          .toBe('+12025550123')
        expect(normalizePhone('\t202-555-0123\t', { defaultCountry: 'US' }))
          .toBe('+12025550123')
      })
    })

    describe('US phone numbers', () => {
      it('should normalize various US formats', () => {
        const options = { defaultCountry: 'US' as const }
        expect(normalizePhone('2025550123', options)).toBe('+12025550123')
        expect(normalizePhone('202-555-0123', options)).toBe('+12025550123')
        expect(normalizePhone('(202) 555-0123', options)).toBe('+12025550123')
        expect(normalizePhone('202.555.0123', options)).toBe('+12025550123')
      })

      it('should handle US numbers with country code 1', () => {
        expect(normalizePhone('1-202-555-0123', { defaultCountry: 'US' }))
          .toBe('+12025550123')
        expect(normalizePhone('+1 202 555 0123'))
          .toBe('+12025550123')
      })

      it('should handle US toll-free numbers', () => {
        expect(normalizePhone('1-800-555-1234', { defaultCountry: 'US' }))
          .toBe('+18005551234')
        expect(normalizePhone('(888) 555-1234', { defaultCountry: 'US' }))
          .toBe('+18885551234')
      })
    })

    describe('international phone numbers', () => {
      it('should normalize UK phone numbers', () => {
        expect(normalizePhone('+44 20 7123 4567')).toBe('+442071234567')
        expect(normalizePhone('020 7123 4567', { defaultCountry: 'GB' }))
          .toBe('+442071234567')
        expect(normalizePhone('07123 456789', { defaultCountry: 'GB' }))
          .toBe('+447123456789')
      })

      it('should normalize German phone numbers', () => {
        expect(normalizePhone('+49 30 12345678')).toBe('+493012345678')
        expect(normalizePhone('030 12345678', { defaultCountry: 'DE' }))
          .toBe('+493012345678')
      })

      it('should normalize Indian phone numbers', () => {
        expect(normalizePhone('+91 98765 43210')).toBe('+919876543210')
        expect(normalizePhone('98765 43210', { defaultCountry: 'IN' }))
          .toBe('+919876543210')
      })

      it('should normalize Chinese phone numbers', () => {
        expect(normalizePhone('+86 10 1234 5678')).toBe('+861012345678')
      })

      it('should normalize French phone numbers', () => {
        expect(normalizePhone('+33 1 23 45 67 89')).toBe('+33123456789')
      })

      it('should normalize Australian phone numbers', () => {
        expect(normalizePhone('+61 2 1234 5678')).toBe('+61212345678')
      })
    })

    describe('phone numbers with extensions', () => {
      it('should extract extensions with "ext"', () => {
        const result = normalizePhone('202-555-0123 ext 123', {
          defaultCountry: 'US',
          outputFormat: 'components',
        }) as PhoneComponents

        expect(result.e164).toBe('+12025550123')
        expect(result.extension).toBe('123')
      })

      it('should extract extensions with "ext."', () => {
        const result = normalizePhone('202-555-0123 ext. 456', {
          defaultCountry: 'US',
          outputFormat: 'components',
        }) as PhoneComponents

        expect(result.e164).toBe('+12025550123')
        expect(result.extension).toBe('456')
      })

      it('should extract extensions with "x"', () => {
        const result = normalizePhone('202-555-0123 x789', {
          defaultCountry: 'US',
          outputFormat: 'components',
        }) as PhoneComponents

        expect(result.e164).toBe('+12025550123')
        expect(result.extension).toBe('789')
      })

      it('should not extract extension when option is false', () => {
        const result = normalizePhone('202-555-0123 ext 123', {
          defaultCountry: 'US',
          outputFormat: 'components',
          extractExtension: false,
        }) as PhoneComponents

        expect(result.e164).toBe('+12025550123')
        expect(result.extension).toBeUndefined()
      })

      it('should handle phone without extension', () => {
        const result = normalizePhone('202-555-0123', {
          defaultCountry: 'US',
          outputFormat: 'components',
        }) as PhoneComponents

        expect(result.e164).toBe('+12025550123')
        expect(result.extension).toBeUndefined()
      })
    })

    describe('various formatting', () => {
      it('should handle spaces', () => {
        expect(normalizePhone('202 555 0123', { defaultCountry: 'US' }))
          .toBe('+12025550123')
        expect(normalizePhone('+1 202 555 0123'))
          .toBe('+12025550123')
      })

      it('should handle hyphens', () => {
        expect(normalizePhone('202-555-0123', { defaultCountry: 'US' }))
          .toBe('+12025550123')
        expect(normalizePhone('+1-202-555-0123'))
          .toBe('+12025550123')
      })

      it('should handle parentheses', () => {
        expect(normalizePhone('(202) 555-0123', { defaultCountry: 'US' }))
          .toBe('+12025550123')
        expect(normalizePhone('(202)555-0123', { defaultCountry: 'US' }))
          .toBe('+12025550123')
      })

      it('should handle dots', () => {
        expect(normalizePhone('202.555.0123', { defaultCountry: 'US' }))
          .toBe('+12025550123')
      })

      it('should handle mixed formatting', () => {
        expect(normalizePhone('+1 (202) 555-0123'))
          .toBe('+12025550123')
        expect(normalizePhone('1-202-555-0123', { defaultCountry: 'US' }))
          .toBe('+12025550123')
      })

      it('should strip all non-numeric characters except +', () => {
        expect(normalizePhone('+1 (202) 555-0123'))
          .toBe('+12025550123')
        expect(normalizePhone('+44-20-7123-4567'))
          .toBe('+442071234567')
      })
    })

    describe('validation', () => {
      it('should reject invalid phone numbers by default', () => {
        expect(normalizePhone('123', { defaultCountry: 'US' })).toBe(null)
        expect(normalizePhone('not-a-phone', { defaultCountry: 'US' })).toBe(null)
        expect(normalizePhone('555', { defaultCountry: 'US' })).toBe(null)
      })

      it('should reject phone numbers that are too short', () => {
        expect(normalizePhone('12345', { defaultCountry: 'US' })).toBe(null)
        expect(normalizePhone('555-1234', { defaultCountry: 'US' })).toBe(null)
      })

      it('should reject completely non-numeric input', () => {
        expect(normalizePhone('abcdefghij', { defaultCountry: 'US' })).toBe(null)
        expect(normalizePhone('not-a-phone', { defaultCountry: 'US' })).toBe(null)
      })

      it('should skip validation when validate is false', () => {
        // Even with validate: false, libphonenumber-js will still parse
        // and reject truly invalid formats
        const result = normalizePhone('202-555-0123', {
          defaultCountry: 'US',
          validate: false,
        })
        expect(result).toBe('+12025550123')
      })

      it('should handle numbers without country code and no default', () => {
        // Without country context, fallback will try to parse
        // A 10-digit number gets treated as US by fallback
        const result = normalizePhone('202-555-0123')
        // Fallback should handle this
        expect(result).toBeTruthy()
      })
    })

    describe('options: outputFormat', () => {
      it('should return E.164 string by default', () => {
        const result = normalizePhone('202-555-0123', { defaultCountry: 'US' })
        expect(typeof result).toBe('string')
        expect(result).toBe('+12025550123')
      })

      it('should return E.164 string when outputFormat is "e164"', () => {
        const result = normalizePhone('202-555-0123', {
          defaultCountry: 'US',
          outputFormat: 'e164',
        })
        expect(typeof result).toBe('string')
        expect(result).toBe('+12025550123')
      })

      it('should return components when outputFormat is "components"', () => {
        const result = normalizePhone('202-555-0123', {
          defaultCountry: 'US',
          outputFormat: 'components',
        }) as PhoneComponents

        expect(result).toEqual({
          countryCode: '1',
          nationalNumber: '2025550123',
          e164: '+12025550123',
          country: 'US',
        })
      })

      it('should include country code in components', () => {
        const result = normalizePhone('+44 20 7123 4567', {
          outputFormat: 'components',
        }) as PhoneComponents

        expect(result.countryCode).toBe('44')
        expect(result.nationalNumber).toBe('2071234567')
        expect(result.e164).toBe('+442071234567')
        expect(result.country).toBe('GB')
      })

      it('should include extension in components when present', () => {
        const result = normalizePhone('202-555-0123 ext 999', {
          defaultCountry: 'US',
          outputFormat: 'components',
        }) as PhoneComponents

        expect(result.extension).toBe('999')
        expect(result.e164).toBe('+12025550123')
      })
    })

    describe('fallback normalization', () => {
      it('should handle malformed input with fallback', () => {
        // When libphonenumber-js can't parse, fallback should try
        // However, fallback has strict validation, so truly invalid inputs still return null
        expect(normalizePhone('123')).toBe(null) // Too short even for fallback
      })

      it('should use fallback for edge case formats', () => {
        // Test that fallback can handle basic numeric cleanup
        // Most valid phones should be handled by libphonenumber-js first
        const result = normalizePhone('2025550123', { defaultCountry: 'US' })
        expect(result).toBe('+12025550123')
      })

      it('should add US country code in fallback when missing', () => {
        // Create a number that might trigger fallback
        // Use a format that's harder for the library to parse
        const result = normalizePhone('##2025550123##', { defaultCountry: 'US' })
        // Fallback strips non-numeric and adds country code
        expect(result).toBe('+12025550123')
      })

      it('should add GB country code in fallback when missing', () => {
        // Force fallback with weird formatting
        const result = normalizePhone('##2071234567##', { defaultCountry: 'GB' })
        // Fallback should add UK country code
        expect(result).toBe('+442071234567')
      })

      it('should handle fallback without default country for international format', () => {
        // Malformed but recognizable international number
        const result = normalizePhone('##442071234567##')
        // Fallback should still parse it
        expect(result).toBe('+442071234567')
      })

      it('should return components in fallback mode', () => {
        // Force fallback with weird formatting
        const result = normalizePhone('##12025550123##', {
          outputFormat: 'components',
        }) as PhoneComponents

        expect(result).toBeDefined()
        expect(result.e164).toBe('+12025550123')
        expect(result.countryCode).toBe('1')
        expect(result.nationalNumber).toBe('2025550123')
      })

      it('should extract German country code in fallback components', () => {
        const result = normalizePhone('##493012345678##', {
          outputFormat: 'components',
        }) as PhoneComponents

        expect(result.countryCode).toBe('49')
        expect(result.nationalNumber).toBe('3012345678')
        expect(result.e164).toBe('+493012345678')
      })

      it('should extract Indian country code in fallback components', () => {
        const result = normalizePhone('##919876543210##', {
          outputFormat: 'components',
        }) as PhoneComponents

        expect(result.countryCode).toBe('91')
        expect(result.nationalNumber).toBe('9876543210')
        expect(result.e164).toBe('+919876543210')
      })

      it('should handle fallback components without recognized country code', () => {
        // A number that doesn't match known country codes in fallback
        const result = normalizePhone('##8812345678910##', {
          outputFormat: 'components',
        }) as PhoneComponents

        expect(result.e164).toBe('+8812345678910')
        expect(result.nationalNumber).toBe('8812345678910')
        // Country code won't be extracted for unrecognized patterns
        expect(result.countryCode).toBeUndefined()
      })

      it('should reject numbers that are too short in fallback', () => {
        // Less than 10 digits should be rejected
        expect(normalizePhone('##123456789##')).toBe(null)
      })

      it('should reject numbers that are too long in fallback', () => {
        // More than 15 digits should be rejected
        expect(normalizePhone('##1234567890123456##')).toBe(null)
      })

      it('should handle fallback without country code for other countries', () => {
        // Test fallback path when defaultCountry is not US/GB
        const result = normalizePhone('##493012345678##', { defaultCountry: 'DE' })
        // Fallback can't add country code for DE, but should still parse
        expect(result).toBe('+493012345678')
      })

      it('should extract UK country code 44 in fallback components', () => {
        // Test UK country code extraction (lines 206-208)
        const result = normalizePhone('##44-20-7123-4567##', {
          outputFormat: 'components',
        }) as PhoneComponents

        expect(result.countryCode).toBe('44')
        expect(result.nationalNumber).toBe('2071234567')
        expect(result.e164).toBe('+442071234567')
      })

      it('should reject input with plus but no valid digits', () => {
        // Test lines 172-174: non-numeric after cleaning
        expect(normalizePhone('+abc')).toBe(null)
        expect(normalizePhone('+---')).toBe(null)
        expect(normalizePhone('+++')).toBe(null)
      })
    })

    describe('edge cases', () => {
      it('should handle phone numbers with leading/trailing whitespace', () => {
        expect(normalizePhone('  202-555-0123  ', { defaultCountry: 'US' }))
          .toBe('+12025550123')
        expect(normalizePhone('\n202-555-0123\n', { defaultCountry: 'US' }))
          .toBe('+12025550123')
      })

      it('should handle numbers with multiple spaces', () => {
        expect(normalizePhone('202  555  0123', { defaultCountry: 'US' }))
          .toBe('+12025550123')
      })

      it('should handle coerced numbers', () => {
        // Number input should be coerced to string
        expect(normalizePhone(2025550123, { defaultCountry: 'US' }))
          .toBe('+12025550123')
      })

      it('should handle very long numbers', () => {
        // Max 15 digits per E.164 spec - use a valid format
        // Russian numbers can be long
        expect(normalizePhone('+79991234567')).toBeTruthy()
      })

      it('should reject numbers that are too long', () => {
        // More than 15 digits should fail
        expect(normalizePhone('+1234567890123456')).toBe(null)
      })

      it('should handle area codes with leading zeros', () => {
        expect(normalizePhone('020 7123 4567', { defaultCountry: 'GB' }))
          .toBe('+442071234567')
      })
    })

    describe('different countries', () => {
      it('should handle US numbers', () => {
        expect(normalizePhone('202-555-0123', { defaultCountry: 'US' }))
          .toBe('+12025550123')
      })

      it('should handle UK numbers', () => {
        expect(normalizePhone('020 7123 4567', { defaultCountry: 'GB' }))
          .toBe('+442071234567')
      })

      it('should handle German numbers', () => {
        expect(normalizePhone('030 12345678', { defaultCountry: 'DE' }))
          .toBe('+493012345678')
      })

      it('should handle Indian numbers', () => {
        expect(normalizePhone('98765 43210', { defaultCountry: 'IN' }))
          .toBe('+919876543210')
      })

      it('should handle numbers from various countries', () => {
        expect(normalizePhone('+33 1 23 45 67 89')).toBe('+33123456789') // France
        expect(normalizePhone('+39 06 1234 5678')).toBe('+390612345678') // Italy
        expect(normalizePhone('+34 91 123 45 67')).toBe('+34911234567') // Spain
        expect(normalizePhone('+81 3 1234 5678')).toBe('+81312345678') // Japan
      })
    })

    describe('complex scenarios', () => {
      it('should handle international format with extensions', () => {
        const result = normalizePhone('+1 202 555 0123 ext 123', {
          outputFormat: 'components',
        }) as PhoneComponents

        expect(result.e164).toBe('+12025550123')
        expect(result.extension).toBe('123')
        expect(result.countryCode).toBe('1')
      })

      it('should handle various formats for same number', () => {
        const formats = [
          '202-555-0123',
          '(202) 555-0123',
          '202.555.0123',
          '202 555 0123',
          '2025550123',
        ]

        formats.forEach((format) => {
          expect(normalizePhone(format, { defaultCountry: 'US' }))
            .toBe('+12025550123')
        })
      })

      it('should normalize consistently regardless of input format', () => {
        const number1 = normalizePhone('+1-202-555-0123')
        const number2 = normalizePhone('(202) 555-0123', { defaultCountry: 'US' })
        const number3 = normalizePhone('12025550123', { defaultCountry: 'US' })

        expect(number1).toBe(number2)
        expect(number2).toBe(number3)
        expect(number1).toBe('+12025550123')
      })
    })

    describe('registry integration', () => {
      it('should be registered in the normalizer registry', () => {
        const normalizer = getNormalizer('phone')
        expect(normalizer).toBeDefined()
        expect(normalizer?.('202-555-0123', { defaultCountry: 'US' }))
          .toBe('+12025550123')
      })

      it('should work with registry options', () => {
        const normalizer = getNormalizer('phone')
        const result = normalizer?.('202-555-0123', {
          defaultCountry: 'US',
          outputFormat: 'e164',
        })
        expect(result).toBe('+12025550123')
      })

      it('should return components via registry', () => {
        const normalizer = getNormalizer('phone')
        const result = normalizer?.('202-555-0123', {
          defaultCountry: 'US',
          outputFormat: 'components',
        }) as PhoneComponents

        expect(result).toHaveProperty('countryCode')
        expect(result).toHaveProperty('nationalNumber')
        expect(result).toHaveProperty('e164')
        expect(result).toHaveProperty('country')
      })

      it('should handle extensions via registry', () => {
        const normalizer = getNormalizer('phone')
        const result = normalizer?.('202-555-0123 ext 123', {
          defaultCountry: 'US',
          outputFormat: 'components',
        }) as PhoneComponents

        expect(result.extension).toBe('123')
      })
    })
  })
})
