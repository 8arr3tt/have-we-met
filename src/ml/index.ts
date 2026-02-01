/**
 * ML Matching Module
 *
 * Machine learning capabilities for identity resolution.
 */

// Core types
export type {
  MLMatchOutcome,
  RecordPair,
  FeatureVector,
  FeatureImportance,
  MLPrediction,
  BatchMLPrediction,
  ModelMetadata,
  MLModelConfig,
  TrainingExample,
  TrainingDataset,
  TrainingConfig,
  TrainingMetrics,
  TrainingResult,
  FieldFeatureConfig,
  FeatureExtractorType,
  FeatureExtractionConfig,
  CustomFeatureExtractor,
  MLIntegrationMode,
  MLIntegrationConfig,
} from './types';

// Default configurations
export {
  DEFAULT_ML_MODEL_CONFIG,
  DEFAULT_TRAINING_CONFIG,
  DEFAULT_FEATURE_EXTRACTION_CONFIG,
  DEFAULT_ML_INTEGRATION_CONFIG,
} from './types';

// Model interface
export type { MLModel, MLModelWeights, MLModelFactory } from './model-interface';
export { BaseMLModel } from './model-interface';

// Prediction utilities
export {
  createPrediction,
  createFeatureVector,
  createFeatureImportance,
  calculateFeatureImportance,
  getTopFeatures,
  filterByClassification,
  filterByMinProbability,
  filterByMinConfidence,
  sortByProbability,
  sortByConfidence,
  calculatePredictionStats,
  formatPrediction,
  createLabeledPair,
  mergeFeatureVectors,
  normalizeFeatureVector,
  isValidPrediction,
  isValidFeatureVector,
} from './prediction';

export type { PredictionStats } from './prediction';

// Validation functions
export {
  isValidMLModelConfig,
  isValidModelMetadata,
  isValidRecordPair,
  isValidMLPrediction,
  isValidTrainingConfig,
  isValidTrainingExample,
  isValidTrainingDataset,
  isValidFieldFeatureConfig,
  isValidFeatureExtractionConfig,
  isValidMLIntegrationConfig,
  mergeWithDefaultMLModelConfig,
  mergeWithDefaultTrainingConfig,
  validateMLModelConfig,
  validateTrainingConfig,
} from './validation';

export type { ValidationError, ValidationResult } from './validation';
