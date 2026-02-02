/**
 * Feature Extractor
 *
 * Converts record pairs into numerical feature vectors for ML models.
 */

import {
  exactMatch,
  levenshtein,
  jaroWinkler,
  soundex,
  metaphone,
} from '../core/comparators'
import type {
  FeatureVector,
  FeatureExtractionConfig,
  FieldFeatureConfig,
  FeatureExtractorType,
  CustomFeatureExtractor,
  RecordPair,
} from './types'
import { createFeatureVector } from './prediction'

/**
 * Individual feature extractor function signature
 */
export type FeatureExtractorFn = (value1: unknown, value2: unknown) => number

/**
 * Built-in feature extractors
 */
export const builtInExtractors: Record<
  FeatureExtractorType,
  FeatureExtractorFn | null
> = {
  exact: (v1, v2) => exactMatch(v1, v2, { caseSensitive: false }),
  levenshtein: (v1, v2) => levenshtein(v1, v2),
  jaroWinkler: (v1, v2) => jaroWinkler(v1, v2),
  soundex: (v1, v2) => soundex(v1, v2),
  metaphone: (v1, v2) => metaphone(v1, v2),
  numericDiff: numericDiffExtractor,
  dateDiff: dateDiffExtractor,
  missing: missingExtractor,
  custom: null, // Handled separately
}

/**
 * Extract numeric difference feature (normalized)
 */
function numericDiffExtractor(value1: unknown, value2: unknown): number {
  // Handle null/undefined
  if (value1 == null && value2 == null) return 1
  if (value1 == null || value2 == null) return 0

  // Convert to numbers
  const num1 = typeof value1 === 'number' ? value1 : parseFloat(String(value1))
  const num2 = typeof value2 === 'number' ? value2 : parseFloat(String(value2))

  // Handle invalid numbers
  if (isNaN(num1) || isNaN(num2)) return 0

  // Exact match
  if (num1 === num2) return 1

  // Normalize by the larger absolute value
  const maxAbs = Math.max(Math.abs(num1), Math.abs(num2))
  if (maxAbs === 0) return 1

  const diff = Math.abs(num1 - num2)
  // Return similarity (1 - normalized_diff), clamped to [0, 1]
  return Math.max(0, 1 - diff / maxAbs)
}

/**
 * Extract date difference feature (normalized by days)
 */
function dateDiffExtractor(value1: unknown, value2: unknown): number {
  // Handle null/undefined
  if (value1 == null && value2 == null) return 1
  if (value1 == null || value2 == null) return 0

  // Convert to dates
  const date1 = toDate(value1)
  const date2 = toDate(value2)

  // Handle invalid dates
  if (date1 === null || date2 === null) return 0

  // Calculate difference in days
  const MS_PER_DAY = 1000 * 60 * 60 * 24
  const diffDays = Math.abs(date1.getTime() - date2.getTime()) / MS_PER_DAY

  // Exact match
  if (diffDays === 0) return 1

  // Normalize: exponential decay with 365 days as the half-life
  // This gives reasonable similarity for dates within a year
  return Math.exp(-diffDays / 365)
}

/**
 * Convert value to Date
 */
function toDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value)
    return isNaN(date.getTime()) ? null : date
  }
  return null
}

/**
 * Extract missing value indicator (1 if either is missing, 0 if both present)
 */
function missingExtractor(value1: unknown, value2: unknown): number {
  const missing1 = value1 == null || value1 === ''
  const missing2 = value2 == null || value2 === ''
  return missing1 || missing2 ? 1 : 0
}

/**
 * Configuration for the FeatureExtractor class
 */
export interface FeatureExtractorOptions {
  /** Whether to normalize all features to 0-1 range (default: true) */
  normalize?: boolean
  /** Custom feature extractors */
  customExtractors?: Record<string, CustomFeatureExtractor>
  /** Default field weight (default: 1.0) */
  defaultWeight?: number
  /** Whether to include missing value indicators by default (default: true) */
  includeMissingByDefault?: boolean
}

/**
 * Default options for FeatureExtractor
 */
export const DEFAULT_FEATURE_EXTRACTOR_OPTIONS: Required<FeatureExtractorOptions> =
  {
    normalize: true,
    customExtractors: {},
    defaultWeight: 1.0,
    includeMissingByDefault: true,
  }

/**
 * Feature extraction statistics
 */
export interface FeatureExtractionStats {
  totalFeatures: number
  fieldsProcessed: number
  missingFieldCount: number
  extractionTimeMs: number
}

/**
 * Feature Extractor class
 *
 * Converts record pairs into numerical feature vectors suitable for ML models.
 */
export class FeatureExtractor<T = Record<string, unknown>> {
  private readonly options: Required<FeatureExtractorOptions>
  private readonly fieldConfigs: FieldFeatureConfig[]
  private readonly featureNames: string[]

  constructor(
    config: FeatureExtractionConfig,
    options: FeatureExtractorOptions = {}
  ) {
    this.options = { ...DEFAULT_FEATURE_EXTRACTOR_OPTIONS, ...options }
    this.fieldConfigs = config.fields
    this.featureNames = this.computeFeatureNames()

    // Validate configuration
    this.validateConfig(config)
  }

  /**
   * Validate the feature extraction configuration
   */
  private validateConfig(config: FeatureExtractionConfig): void {
    for (const field of config.fields) {
      if (!field.field) {
        throw new Error('Field configuration must have a field name')
      }
      if (!field.extractors || field.extractors.length === 0) {
        throw new Error(
          `Field "${field.field}" must have at least one extractor`
        )
      }

      for (const extractor of field.extractors) {
        if (extractor === 'custom') {
          // Custom extractors need to be provided in options or config
          const customFn =
            this.options.customExtractors[field.field] ||
            config.customExtractors?.[field.field]
          if (!customFn) {
            throw new Error(
              `Custom extractor specified for field "${field.field}" but no custom function provided`
            )
          }
        }
      }
    }
  }

  /**
   * Compute the feature names based on configuration
   */
  private computeFeatureNames(): string[] {
    const names: string[] = []

    for (const field of this.fieldConfigs) {
      for (const extractor of field.extractors) {
        names.push(`${field.field}_${extractor}`)
      }

      // Add missing indicator if configured
      if (
        field.includeMissingIndicator ??
        this.options.includeMissingByDefault
      ) {
        // Only add if not already using 'missing' extractor
        if (!field.extractors.includes('missing')) {
          names.push(`${field.field}_missing`)
        }
      }
    }

    return names
  }

  /**
   * Get the feature names in order
   */
  getFeatureNames(): string[] {
    return [...this.featureNames]
  }

  /**
   * Get the number of features that will be extracted
   */
  getFeatureCount(): number {
    return this.featureNames.length
  }

  /**
   * Get the field configurations
   */
  getFieldConfigs(): FieldFeatureConfig[] {
    return this.fieldConfigs.map((f) => ({ ...f }))
  }

  /**
   * Extract features from a record pair
   */
  extract(pair: RecordPair<T>): FeatureVector {
    const startTime = performance.now()
    const values: number[] = []
    let missingCount = 0

    for (const field of this.fieldConfigs) {
      const value1 = this.getFieldValue(pair.record1, field.field)
      const value2 = this.getFieldValue(pair.record2, field.field)
      const weight = field.weight ?? this.options.defaultWeight

      // Track missing fields
      if (value1 == null || value2 == null) {
        missingCount++
      }

      // Extract features using each configured extractor
      for (const extractorType of field.extractors) {
        let featureValue: number

        if (extractorType === 'custom') {
          // Use custom extractor
          const customFn = this.options.customExtractors[field.field]
          if (customFn) {
            featureValue = customFn(value1, value2)
          } else {
            featureValue = 0
          }
        } else {
          // Use built-in extractor
          const extractorFn = builtInExtractors[extractorType]
          if (extractorFn) {
            featureValue = extractorFn(value1, value2)
          } else {
            featureValue = 0
          }
        }

        // Apply weight
        values.push(featureValue * weight)
      }

      // Add missing indicator if configured
      if (
        field.includeMissingIndicator ??
        this.options.includeMissingByDefault
      ) {
        if (!field.extractors.includes('missing')) {
          values.push(missingExtractor(value1, value2))
        }
      }
    }

    // Normalize if configured
    const finalValues = this.options.normalize
      ? this.normalizeValues(values)
      : values

    const extractionTimeMs = performance.now() - startTime

    return createFeatureVector(finalValues, [...this.featureNames], {
      extractionTimeMs,
      fieldsProcessed: this.fieldConfigs.length,
      missingFieldCount: missingCount,
    })
  }

  /**
   * Extract features from multiple record pairs
   */
  extractBatch(pairs: RecordPair<T>[]): FeatureVector[] {
    return pairs.map((pair) => this.extract(pair))
  }

  /**
   * Get a field value from a record, supporting nested paths
   */
  private getFieldValue(record: T, fieldPath: string): unknown {
    if (record == null) return undefined

    const parts = fieldPath.split('.')
    let current: unknown = record

    for (const part of parts) {
      if (current == null || typeof current !== 'object') {
        return undefined
      }
      current = (current as Record<string, unknown>)[part]
    }

    return current
  }

  /**
   * Normalize feature values to 0-1 range
   */
  private normalizeValues(values: number[]): number[] {
    // Most features should already be in 0-1 range
    // This just clamps any outliers
    return values.map((v) => Math.max(0, Math.min(1, v)))
  }

  /**
   * Create a feature extractor from a simple field list
   */
  static fromFields<T>(
    fields: string[],
    extractorTypes: FeatureExtractorType[] = ['jaroWinkler', 'exact']
  ): FeatureExtractor<T> {
    const config: FeatureExtractionConfig = {
      fields: fields.map((field) => ({
        field,
        extractors: extractorTypes,
      })),
      normalize: true,
    }
    return new FeatureExtractor<T>(config)
  }

  /**
   * Create a feature extractor for person/customer matching
   */
  static forPersonMatching<T>(): FeatureExtractor<T> {
    const config: FeatureExtractionConfig = {
      fields: [
        {
          field: 'firstName',
          extractors: ['jaroWinkler', 'soundex', 'exact'],
          weight: 1.0,
        },
        {
          field: 'lastName',
          extractors: ['jaroWinkler', 'soundex', 'exact'],
          weight: 1.2,
        },
        {
          field: 'email',
          extractors: ['levenshtein', 'exact'],
          weight: 1.5,
        },
        {
          field: 'phone',
          extractors: ['levenshtein', 'exact'],
          weight: 1.3,
        },
        {
          field: 'dateOfBirth',
          extractors: ['exact', 'dateDiff'],
          weight: 1.4,
        },
        {
          field: 'address',
          extractors: ['levenshtein', 'jaroWinkler'],
          weight: 0.8,
        },
        {
          field: 'ssn',
          extractors: ['exact'],
          weight: 2.0,
        },
      ],
      normalize: true,
    }
    return new FeatureExtractor<T>(config)
  }
}

/**
 * Builder for creating feature extraction configurations
 */
export class FeatureExtractionConfigBuilder {
  private fields: FieldFeatureConfig[] = []
  private customExtractors: Record<string, CustomFeatureExtractor> = {}
  private normalizeFlag: boolean = true

  /**
   * Add a field with specified extractors
   */
  addField(
    field: string,
    extractors: FeatureExtractorType[],
    options: { weight?: number; includeMissingIndicator?: boolean } = {}
  ): this {
    this.fields.push({
      field,
      extractors,
      weight: options.weight,
      includeMissingIndicator: options.includeMissingIndicator,
    })
    return this
  }

  /**
   * Add a string field with default string similarity extractors
   */
  addStringField(
    field: string,
    options: { weight?: number; phonetic?: boolean } = {}
  ): this {
    const extractors: FeatureExtractorType[] = [
      'jaroWinkler',
      'levenshtein',
      'exact',
    ]
    if (options.phonetic) {
      extractors.push('soundex', 'metaphone')
    }
    return this.addField(field, extractors, { weight: options.weight })
  }

  /**
   * Add an exact match field
   */
  addExactField(field: string, options: { weight?: number } = {}): this {
    return this.addField(field, ['exact'], { weight: options.weight })
  }

  /**
   * Add a numeric field
   */
  addNumericField(field: string, options: { weight?: number } = {}): this {
    return this.addField(field, ['numericDiff', 'exact'], {
      weight: options.weight,
    })
  }

  /**
   * Add a date field
   */
  addDateField(field: string, options: { weight?: number } = {}): this {
    return this.addField(field, ['dateDiff', 'exact'], {
      weight: options.weight,
    })
  }

  /**
   * Add a name field (optimized for person names)
   */
  addNameField(field: string, options: { weight?: number } = {}): this {
    return this.addField(
      field,
      ['jaroWinkler', 'soundex', 'metaphone', 'exact'],
      {
        weight: options.weight,
      }
    )
  }

  /**
   * Add a custom extractor
   */
  addCustomExtractor(field: string, fn: CustomFeatureExtractor): this {
    this.customExtractors[field] = fn
    return this
  }

  /**
   * Add a custom field with a custom extractor function
   */
  addCustomField(
    field: string,
    fn: CustomFeatureExtractor,
    options: { weight?: number } = {}
  ): this {
    this.customExtractors[field] = fn
    return this.addField(field, ['custom'], { weight: options.weight })
  }

  /**
   * Set whether to normalize features
   */
  normalize(value: boolean): this {
    this.normalizeFlag = value
    return this
  }

  /**
   * Build the configuration
   */
  build(): FeatureExtractionConfig {
    return {
      fields: [...this.fields],
      normalize: this.normalizeFlag,
      customExtractors: { ...this.customExtractors },
    }
  }

  /**
   * Build and create a FeatureExtractor
   */
  buildExtractor<T>(): FeatureExtractor<T> {
    return new FeatureExtractor<T>(this.build(), {
      customExtractors: this.customExtractors,
    })
  }
}

/**
 * Create a new feature extraction config builder
 */
export function featureConfig(): FeatureExtractionConfigBuilder {
  return new FeatureExtractionConfigBuilder()
}

/**
 * Utility functions for feature inspection
 */

/**
 * Get feature value by name from a feature vector
 */
export function getFeatureByName(
  vector: FeatureVector,
  name: string
): number | undefined {
  const index = vector.names.indexOf(name)
  return index >= 0 ? vector.values[index] : undefined
}

/**
 * Get all features for a specific field
 */
export function getFieldFeatures(
  vector: FeatureVector,
  fieldName: string
): Record<string, number> {
  const result: Record<string, number> = {}
  for (let i = 0; i < vector.names.length; i++) {
    if (vector.names[i].startsWith(`${fieldName}_`)) {
      result[vector.names[i]] = vector.values[i]
    }
  }
  return result
}

/**
 * Compare two feature vectors and return differences
 */
export function compareFeatureVectors(
  vector1: FeatureVector,
  vector2: FeatureVector
): Record<string, { value1: number; value2: number; diff: number }> {
  const result: Record<
    string,
    { value1: number; value2: number; diff: number }
  > = {}

  // Build lookup for vector2
  const vector2Map = new Map<string, number>()
  for (let i = 0; i < vector2.names.length; i++) {
    vector2Map.set(vector2.names[i], vector2.values[i])
  }

  // Compare
  for (let i = 0; i < vector1.names.length; i++) {
    const name = vector1.names[i]
    const v1 = vector1.values[i]
    const v2 = vector2Map.get(name) ?? 0
    result[name] = {
      value1: v1,
      value2: v2,
      diff: v1 - v2,
    }
  }

  return result
}

/**
 * Calculate statistics for a feature across multiple vectors
 */
export function calculateFeatureStats(
  vectors: FeatureVector[],
  featureName: string
): { min: number; max: number; mean: number; stdDev: number } | null {
  if (vectors.length === 0) return null

  const values: number[] = []
  for (const vector of vectors) {
    const value = getFeatureByName(vector, featureName)
    if (value !== undefined) {
      values.push(value)
    }
  }

  if (values.length === 0) return null

  const min = Math.min(...values)
  const max = Math.max(...values)
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const variance =
    values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length
  const stdDev = Math.sqrt(variance)

  return { min, max, mean, stdDev }
}
