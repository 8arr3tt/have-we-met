/**
 * ML Matching Types
 *
 * Core type definitions for the machine learning matching system.
 */

/**
 * Classification outcome from ML model
 */
export type MLMatchOutcome = 'match' | 'nonMatch' | 'uncertain'

/**
 * A pair of records to be compared by the ML model
 */
export interface RecordPair<T> {
  /** First record in the pair */
  record1: T
  /** Second record in the pair */
  record2: T
  /** Optional label for training data */
  label?: MLMatchOutcome
}

/**
 * Feature vector representing extracted features from a record pair
 */
export interface FeatureVector {
  /** Feature values as a numeric array */
  values: number[]
  /** Feature names corresponding to values */
  names: string[]
  /** Optional metadata about the extraction */
  metadata?: Record<string, unknown>
}

/**
 * Importance of a feature in the prediction
 */
export interface FeatureImportance {
  /** Feature name */
  name: string
  /** Feature value that was used */
  value: number
  /** Contribution to the prediction (can be positive or negative) */
  contribution: number
  /** Absolute importance (magnitude of contribution) */
  importance: number
}

/**
 * Result of an ML prediction
 */
export interface MLPrediction {
  /** Probability of match (0-1) */
  probability: number
  /** Classification based on thresholds */
  classification: MLMatchOutcome
  /** Confidence in the prediction (0-1) */
  confidence: number
  /** Features used for prediction */
  features: FeatureVector
  /** Feature importance/contribution breakdown */
  featureImportance: FeatureImportance[]
}

/**
 * Batch prediction result
 */
export interface BatchMLPrediction<T> {
  /** The record pair that was evaluated */
  pair: RecordPair<T>
  /** The prediction result */
  prediction: MLPrediction
}

/**
 * Metadata about an ML model
 */
export interface ModelMetadata {
  /** Model name/identifier */
  name: string
  /** Model version */
  version: string
  /** When the model was trained */
  trainedAt?: Date
  /** Training accuracy */
  accuracy?: number
  /** Number of training examples used */
  trainingExamples?: number
  /** Feature names the model expects */
  featureNames: string[]
  /** Additional metadata */
  extra?: Record<string, unknown>
}

/**
 * Configuration for ML model behavior
 */
export interface MLModelConfig {
  /** Threshold above which to classify as match (default: 0.7) */
  matchThreshold: number
  /** Threshold below which to classify as non-match (default: 0.3) */
  nonMatchThreshold: number
  /** Whether to include feature importance in predictions (default: true) */
  includeFeatureImportance: boolean
  /** Batch size for batch predictions (default: 100) */
  batchSize: number
}

/**
 * Default ML model configuration
 */
export const DEFAULT_ML_MODEL_CONFIG: MLModelConfig = {
  matchThreshold: 0.7,
  nonMatchThreshold: 0.3,
  includeFeatureImportance: true,
  batchSize: 100,
}

/**
 * Training data point
 */
export interface TrainingExample<T> {
  /** Record pair */
  pair: RecordPair<T>
  /** Known label */
  label: 'match' | 'nonMatch'
  /** Optional source information */
  source?: string
  /** Optional timestamp */
  timestamp?: Date
}

/**
 * Training dataset
 */
export interface TrainingDataset<T> {
  /** Training examples */
  examples: TrainingExample<T>[]
  /** Dataset metadata */
  metadata?: {
    name?: string
    description?: string
    createdAt?: Date
    matchCount?: number
    nonMatchCount?: number
  }
}

/**
 * Training configuration
 */
export interface TrainingConfig {
  /** Learning rate (default: 0.01) */
  learningRate: number
  /** Maximum iterations (default: 1000) */
  maxIterations: number
  /** L2 regularization strength (default: 0.001) */
  regularization: number
  /** Validation split ratio (default: 0.2) */
  validationSplit: number
  /** Early stopping patience (default: 10) */
  earlyStoppingPatience: number
  /** Minimum improvement to reset patience (default: 0.001) */
  minImprovement: number
  /** Random seed for reproducibility */
  seed?: number
}

/**
 * Default training configuration
 */
export const DEFAULT_TRAINING_CONFIG: TrainingConfig = {
  learningRate: 0.01,
  maxIterations: 1000,
  regularization: 0.001,
  validationSplit: 0.2,
  earlyStoppingPatience: 10,
  minImprovement: 0.001,
}

/**
 * Training metrics for a single iteration
 */
export interface TrainingMetrics {
  /** Iteration number */
  iteration: number
  /** Training loss */
  trainingLoss: number
  /** Training accuracy */
  trainingAccuracy: number
  /** Validation loss (if validation split used) */
  validationLoss?: number
  /** Validation accuracy (if validation split used) */
  validationAccuracy?: number
}

/**
 * Final training result
 */
export interface TrainingResult {
  /** Whether training succeeded */
  success: boolean
  /** Trained weights (if successful) */
  weights?: number[]
  /** Bias term (if successful) */
  bias?: number
  /** Final metrics */
  finalMetrics: TrainingMetrics
  /** History of all iterations */
  history: TrainingMetrics[]
  /** Total training time in milliseconds */
  trainingTimeMs: number
  /** Whether early stopping was triggered */
  earlyStopped: boolean
  /** Error message if training failed */
  error?: string
}

/**
 * Feature extraction configuration for a field
 */
export interface FieldFeatureConfig {
  /** Field name in the record */
  field: string
  /** Feature extractors to use */
  extractors: FeatureExtractorType[]
  /** Optional weight multiplier for this field's features */
  weight?: number
  /** Whether to include missing value indicator */
  includeMissingIndicator?: boolean
}

/**
 * Built-in feature extractor types
 */
export type FeatureExtractorType =
  | 'exact'
  | 'levenshtein'
  | 'jaroWinkler'
  | 'soundex'
  | 'metaphone'
  | 'numericDiff'
  | 'dateDiff'
  | 'missing'
  | 'custom'

/**
 * Configuration for feature extraction
 */
export interface FeatureExtractionConfig {
  /** Field configurations */
  fields: FieldFeatureConfig[]
  /** Whether to normalize all features to 0-1 (default: true) */
  normalize: boolean
  /** Custom feature extractor functions */
  customExtractors?: Record<string, CustomFeatureExtractor>
}

/**
 * Custom feature extractor function
 */
export type CustomFeatureExtractor = (
  value1: unknown,
  value2: unknown
) => number

/**
 * Default feature extraction configuration
 */
export const DEFAULT_FEATURE_EXTRACTION_CONFIG: Partial<FeatureExtractionConfig> =
  {
    normalize: true,
  }

/**
 * ML integration mode
 */
export type MLIntegrationMode = 'mlOnly' | 'hybrid' | 'fallback'

/**
 * ML integration configuration for resolver
 */
export interface MLIntegrationConfig {
  /** Integration mode */
  mode: MLIntegrationMode
  /** Weight of ML score in hybrid mode (0-1, default: 0.5) */
  mlWeight: number
  /** Whether to use ML for all comparisons or only uncertain cases */
  applyTo: 'all' | 'uncertainOnly'
  /** Timeout for ML predictions in milliseconds (default: 5000) */
  timeoutMs: number
  /** Whether to fallback to probabilistic on ML failure */
  fallbackOnError: boolean
}

/**
 * Default ML integration configuration
 */
export const DEFAULT_ML_INTEGRATION_CONFIG: MLIntegrationConfig = {
  mode: 'hybrid',
  mlWeight: 0.5,
  applyTo: 'all',
  timeoutMs: 5000,
  fallbackOnError: true,
}
