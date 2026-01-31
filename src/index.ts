// Main entry point
export { HaveWeMet, ResolverBuilder } from './builder/resolver-builder'

// Core classes
export { Resolver } from './core/resolver'
export { MatchingEngine } from './core/engine'

// Comparators
export {
  exactMatch,
  type ExactMatchOptions,
  levenshtein,
  type LevenshteinOptions,
  jaroWinkler,
  type JaroWinklerOptions,
  soundex,
  soundexEncode,
  type SoundexOptions,
  metaphone,
  metaphoneEncode,
  type MetaphoneOptions,
} from './core/comparators'

// Types - Records
export type {
  RecordId,
  RecordMetadata,
  Record,
  RecordPair,
} from './types/record'

// Types - Matching
export type {
  MatchOutcome,
  FieldComparison,
  MatchScore,
  MatchExplanation,
  MatchCandidate,
  MatchResult,
} from './types/match'

// Types - Configuration
export type {
  ThresholdConfig,
  MatchingStrategy,
  FieldMatchConfig,
  MatchingConfig,
  BlockingConfig,
  ResolverConfig,
  ResolverOptions,
} from './types/config'

// Types - Schema
export type {
  FieldType,
  FieldDefinition,
  SchemaDefinition,
} from './types/schema'

// Builders
export { SchemaBuilder } from './builder/schema-builder'
export { MatchingBuilder, FieldMatchBuilder } from './builder/matching-builder'

// Normalizers
export {
  registerNormalizer,
  getNormalizer,
  listNormalizers,
  applyNormalizer,
  composeNormalizers,
} from './core/normalizers/registry'
export type { NormalizerFunction, NormalizerMetadata } from './core/normalizers/types'
export {
  trim,
  lowercase,
  uppercase,
  normalizeWhitespace,
  alphanumericOnly,
  numericOnly,
} from './core/normalizers/basic'
export {
  normalizeName,
  parseNameComponents,
  type NameComponents,
  type NameNormalizerOptions,
} from './core/normalizers/name'
export {
  normalizeEmail,
  isValidEmail,
  type EmailComponents,
  type EmailNormalizerOptions,
} from './core/normalizers/email'
export {
  normalizePhone,
  isValidPhone,
  type PhoneComponents,
  type PhoneNormalizerOptions,
} from './core/normalizers/phone'
export {
  normalizeAddress,
  parseAddressComponents,
  abbreviateState,
  abbreviateStreetType,
  type AddressComponents,
  type AddressNormalizerOptions,
} from './core/normalizers/address'
export {
  normalizeDate,
  parseDateComponents,
  isValidDate,
  type DateComponents,
  type DateNormalizerOptions,
} from './core/normalizers/date'
