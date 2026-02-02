/**
 * ML Type Validation Functions
 *
 * Type guards and validation functions for ML types.
 */

import type {
  FeatureExtractionConfig,
  FeatureVector,
  FieldFeatureConfig,
  MLIntegrationConfig,
  MLModelConfig,
  MLPrediction,
  ModelMetadata,
  RecordPair,
  TrainingConfig,
  TrainingDataset,
  TrainingExample,
} from './types'
import { DEFAULT_ML_MODEL_CONFIG, DEFAULT_TRAINING_CONFIG } from './types'

/**
 * Validate MLModelConfig
 */
export function isValidMLModelConfig(config: unknown): config is MLModelConfig {
  if (!config || typeof config !== 'object') {
    return false
  }

  const c = config as Record<string, unknown>

  return (
    typeof c.matchThreshold === 'number' &&
    c.matchThreshold >= 0 &&
    c.matchThreshold <= 1 &&
    typeof c.nonMatchThreshold === 'number' &&
    c.nonMatchThreshold >= 0 &&
    c.nonMatchThreshold <= 1 &&
    c.nonMatchThreshold < c.matchThreshold &&
    typeof c.includeFeatureImportance === 'boolean' &&
    typeof c.batchSize === 'number' &&
    c.batchSize > 0
  )
}

/**
 * Validate ModelMetadata
 */
export function isValidModelMetadata(
  metadata: unknown
): metadata is ModelMetadata {
  if (!metadata || typeof metadata !== 'object') {
    return false
  }

  const m = metadata as Record<string, unknown>

  return (
    typeof m.name === 'string' &&
    m.name.length > 0 &&
    typeof m.version === 'string' &&
    m.version.length > 0 &&
    Array.isArray(m.featureNames) &&
    m.featureNames.every((f) => typeof f === 'string')
  )
}

/**
 * Validate RecordPair
 */
export function isValidRecordPair<T>(pair: unknown): pair is RecordPair<T> {
  if (!pair || typeof pair !== 'object') {
    return false
  }

  const p = pair as Record<string, unknown>

  return (
    p.record1 !== undefined &&
    p.record2 !== undefined &&
    (p.label === undefined ||
      ['match', 'nonMatch', 'uncertain'].includes(p.label as string))
  )
}

/**
 * Validate FeatureVector
 */
export function isValidFeatureVector(vector: unknown): vector is FeatureVector {
  if (!vector || typeof vector !== 'object') {
    return false
  }

  const v = vector as Record<string, unknown>

  return (
    Array.isArray(v.values) &&
    v.values.every((val) => typeof val === 'number' && !isNaN(val)) &&
    Array.isArray(v.names) &&
    v.names.every((name) => typeof name === 'string') &&
    v.values.length === v.names.length
  )
}

/**
 * Validate MLPrediction
 */
export function isValidMLPrediction(
  prediction: unknown
): prediction is MLPrediction {
  if (!prediction || typeof prediction !== 'object') {
    return false
  }

  const p = prediction as Record<string, unknown>

  return (
    typeof p.probability === 'number' &&
    p.probability >= 0 &&
    p.probability <= 1 &&
    ['match', 'nonMatch', 'uncertain'].includes(p.classification as string) &&
    typeof p.confidence === 'number' &&
    p.confidence >= 0 &&
    p.confidence <= 1 &&
    isValidFeatureVector(p.features) &&
    Array.isArray(p.featureImportance)
  )
}

/**
 * Validate TrainingConfig
 */
export function isValidTrainingConfig(
  config: unknown
): config is TrainingConfig {
  if (!config || typeof config !== 'object') {
    return false
  }

  const c = config as Record<string, unknown>

  return (
    typeof c.learningRate === 'number' &&
    c.learningRate > 0 &&
    c.learningRate <= 1 &&
    typeof c.maxIterations === 'number' &&
    c.maxIterations > 0 &&
    Number.isInteger(c.maxIterations) &&
    typeof c.regularization === 'number' &&
    c.regularization >= 0 &&
    typeof c.validationSplit === 'number' &&
    c.validationSplit >= 0 &&
    c.validationSplit < 1 &&
    typeof c.earlyStoppingPatience === 'number' &&
    c.earlyStoppingPatience > 0 &&
    typeof c.minImprovement === 'number' &&
    c.minImprovement >= 0
  )
}

/**
 * Validate TrainingExample
 */
export function isValidTrainingExample<T>(
  example: unknown
): example is TrainingExample<T> {
  if (!example || typeof example !== 'object') {
    return false
  }

  const e = example as Record<string, unknown>

  return (
    isValidRecordPair(e.pair) &&
    ['match', 'nonMatch'].includes(e.label as string) &&
    (e.source === undefined || typeof e.source === 'string') &&
    (e.timestamp === undefined || e.timestamp instanceof Date)
  )
}

/**
 * Validate TrainingDataset
 */
export function isValidTrainingDataset<T>(
  dataset: unknown
): dataset is TrainingDataset<T> {
  if (!dataset || typeof dataset !== 'object') {
    return false
  }

  const d = dataset as Record<string, unknown>

  return (
    Array.isArray(d.examples) &&
    d.examples.every((e) => isValidTrainingExample(e))
  )
}

/**
 * Validate FieldFeatureConfig
 */
export function isValidFieldFeatureConfig(
  config: unknown
): config is FieldFeatureConfig {
  if (!config || typeof config !== 'object') {
    return false
  }

  const c = config as Record<string, unknown>
  const validExtractors = [
    'exact',
    'levenshtein',
    'jaroWinkler',
    'soundex',
    'metaphone',
    'numericDiff',
    'dateDiff',
    'missing',
    'custom',
  ]

  return (
    typeof c.field === 'string' &&
    c.field.length > 0 &&
    Array.isArray(c.extractors) &&
    c.extractors.every((e) => validExtractors.includes(e as string)) &&
    (c.weight === undefined ||
      (typeof c.weight === 'number' && c.weight > 0)) &&
    (c.includeMissingIndicator === undefined ||
      typeof c.includeMissingIndicator === 'boolean')
  )
}

/**
 * Validate FeatureExtractionConfig
 */
export function isValidFeatureExtractionConfig(
  config: unknown
): config is FeatureExtractionConfig {
  if (!config || typeof config !== 'object') {
    return false
  }

  const c = config as Record<string, unknown>

  return (
    Array.isArray(c.fields) &&
    c.fields.length > 0 &&
    c.fields.every((f) => isValidFieldFeatureConfig(f)) &&
    typeof c.normalize === 'boolean'
  )
}

/**
 * Validate MLIntegrationConfig
 */
export function isValidMLIntegrationConfig(
  config: unknown
): config is MLIntegrationConfig {
  if (!config || typeof config !== 'object') {
    return false
  }

  const c = config as Record<string, unknown>

  return (
    ['mlOnly', 'hybrid', 'fallback'].includes(c.mode as string) &&
    typeof c.mlWeight === 'number' &&
    c.mlWeight >= 0 &&
    c.mlWeight <= 1 &&
    ['all', 'uncertainOnly'].includes(c.applyTo as string) &&
    typeof c.timeoutMs === 'number' &&
    c.timeoutMs > 0 &&
    typeof c.fallbackOnError === 'boolean'
  )
}

/**
 * Merge partial config with defaults for MLModelConfig
 */
export function mergeWithDefaultMLModelConfig(
  partial?: Partial<MLModelConfig>
): MLModelConfig {
  return { ...DEFAULT_ML_MODEL_CONFIG, ...partial }
}

/**
 * Merge partial config with defaults for TrainingConfig
 */
export function mergeWithDefaultTrainingConfig(
  partial?: Partial<TrainingConfig>
): TrainingConfig {
  return { ...DEFAULT_TRAINING_CONFIG, ...partial }
}

/**
 * Validation error details
 */
export interface ValidationError {
  field: string
  message: string
  value?: unknown
}

/**
 * Detailed validation result
 */
export interface ValidationResult {
  valid: boolean
  errors: ValidationError[]
}

/**
 * Validate MLModelConfig with detailed error reporting
 */
export function validateMLModelConfig(config: unknown): ValidationResult {
  const errors: ValidationError[] = []

  if (!config || typeof config !== 'object') {
    return {
      valid: false,
      errors: [{ field: 'config', message: 'Config must be an object' }],
    }
  }

  const c = config as Record<string, unknown>

  if (typeof c.matchThreshold !== 'number') {
    errors.push({
      field: 'matchThreshold',
      message: 'Must be a number',
      value: c.matchThreshold,
    })
  } else if (c.matchThreshold < 0 || c.matchThreshold > 1) {
    errors.push({
      field: 'matchThreshold',
      message: 'Must be between 0 and 1',
      value: c.matchThreshold,
    })
  }

  if (typeof c.nonMatchThreshold !== 'number') {
    errors.push({
      field: 'nonMatchThreshold',
      message: 'Must be a number',
      value: c.nonMatchThreshold,
    })
  } else if (c.nonMatchThreshold < 0 || c.nonMatchThreshold > 1) {
    errors.push({
      field: 'nonMatchThreshold',
      message: 'Must be between 0 and 1',
      value: c.nonMatchThreshold,
    })
  }

  if (
    typeof c.matchThreshold === 'number' &&
    typeof c.nonMatchThreshold === 'number' &&
    c.nonMatchThreshold >= c.matchThreshold
  ) {
    errors.push({
      field: 'thresholds',
      message: 'nonMatchThreshold must be less than matchThreshold',
      value: {
        matchThreshold: c.matchThreshold,
        nonMatchThreshold: c.nonMatchThreshold,
      },
    })
  }

  if (typeof c.includeFeatureImportance !== 'boolean') {
    errors.push({
      field: 'includeFeatureImportance',
      message: 'Must be a boolean',
      value: c.includeFeatureImportance,
    })
  }

  if (typeof c.batchSize !== 'number') {
    errors.push({
      field: 'batchSize',
      message: 'Must be a number',
      value: c.batchSize,
    })
  } else if (c.batchSize <= 0 || !Number.isInteger(c.batchSize)) {
    errors.push({
      field: 'batchSize',
      message: 'Must be a positive integer',
      value: c.batchSize,
    })
  }

  return { valid: errors.length === 0, errors }
}

/**
 * Validate TrainingConfig with detailed error reporting
 */
export function validateTrainingConfig(config: unknown): ValidationResult {
  const errors: ValidationError[] = []

  if (!config || typeof config !== 'object') {
    return {
      valid: false,
      errors: [{ field: 'config', message: 'Config must be an object' }],
    }
  }

  const c = config as Record<string, unknown>

  if (typeof c.learningRate !== 'number') {
    errors.push({
      field: 'learningRate',
      message: 'Must be a number',
      value: c.learningRate,
    })
  } else if (c.learningRate <= 0 || c.learningRate > 1) {
    errors.push({
      field: 'learningRate',
      message: 'Must be between 0 (exclusive) and 1 (inclusive)',
      value: c.learningRate,
    })
  }

  if (typeof c.maxIterations !== 'number') {
    errors.push({
      field: 'maxIterations',
      message: 'Must be a number',
      value: c.maxIterations,
    })
  } else if (c.maxIterations <= 0 || !Number.isInteger(c.maxIterations)) {
    errors.push({
      field: 'maxIterations',
      message: 'Must be a positive integer',
      value: c.maxIterations,
    })
  }

  if (typeof c.regularization !== 'number') {
    errors.push({
      field: 'regularization',
      message: 'Must be a number',
      value: c.regularization,
    })
  } else if (c.regularization < 0) {
    errors.push({
      field: 'regularization',
      message: 'Must be non-negative',
      value: c.regularization,
    })
  }

  if (typeof c.validationSplit !== 'number') {
    errors.push({
      field: 'validationSplit',
      message: 'Must be a number',
      value: c.validationSplit,
    })
  } else if (c.validationSplit < 0 || c.validationSplit >= 1) {
    errors.push({
      field: 'validationSplit',
      message: 'Must be between 0 and 1 (exclusive)',
      value: c.validationSplit,
    })
  }

  if (typeof c.earlyStoppingPatience !== 'number') {
    errors.push({
      field: 'earlyStoppingPatience',
      message: 'Must be a number',
      value: c.earlyStoppingPatience,
    })
  } else if (
    c.earlyStoppingPatience <= 0 ||
    !Number.isInteger(c.earlyStoppingPatience)
  ) {
    errors.push({
      field: 'earlyStoppingPatience',
      message: 'Must be a positive integer',
      value: c.earlyStoppingPatience,
    })
  }

  if (typeof c.minImprovement !== 'number') {
    errors.push({
      field: 'minImprovement',
      message: 'Must be a number',
      value: c.minImprovement,
    })
  } else if (c.minImprovement < 0) {
    errors.push({
      field: 'minImprovement',
      message: 'Must be non-negative',
      value: c.minImprovement,
    })
  }

  return { valid: errors.length === 0, errors }
}
