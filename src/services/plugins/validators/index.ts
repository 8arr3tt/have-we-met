/**
 * Built-in validation service plugins for common identifier types
 * @module services/plugins/validators
 */

// NHS Number Validator
export {
  nhsNumberValidator,
  createNHSNumberValidator,
  validateNHSChecksum,
  normalizeNHSNumber,
  type NHSNumberValidatorOptions,
} from './nhs-number-validator.js'

// Email Validator
export {
  emailValidator,
  createEmailValidator,
  validateEmailFormat,
  normalizeEmail,
  extractDomain,
  isDisposableDomain,
  type EmailValidatorOptions,
} from './email-validator.js'

// Phone Validator
export {
  phoneValidator,
  createPhoneValidator,
  getValidCountryCodes,
  isValidCountryCode,
  normalizePhoneInput,
  type PhoneValidatorOptions,
  type PhoneNumberType,
  type PhoneValidationMetadata,
} from './phone-validator.js'

// SSN Validator
export {
  ssnValidator,
  createSSNValidator,
  normalizeSSN,
  formatSSN,
  parseSSN,
  hasValidAreaNumber,
  hasValidGroupNumber,
  hasValidSerialNumber,
  isKnownInvalidSSN,
  type SSNValidatorOptions,
} from './ssn-validator.js'

// NINO Validator
export {
  ninoValidator,
  createNINOValidator,
  normalizeNINO,
  formatNINO,
  parseNINO,
  hasValidFirstLetter,
  hasValidSecondLetter,
  hasValidPrefix,
  hasValidSuffix,
  isAdministrativeNINO,
  type NINOValidatorOptions,
} from './nino-validator.js'
