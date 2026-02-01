import { describe, it, expect } from 'vitest';
import {
  isValidMLModelConfig,
  isValidModelMetadata,
  isValidRecordPair,
  isValidFeatureVector,
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
} from '../../../src/ml/validation';
import { DEFAULT_ML_MODEL_CONFIG, DEFAULT_TRAINING_CONFIG } from '../../../src/ml/types';

describe('ML Validation Functions', () => {
  describe('isValidMLModelConfig', () => {
    it('should return true for valid config', () => {
      expect(isValidMLModelConfig(DEFAULT_ML_MODEL_CONFIG)).toBe(true);
    });

    it('should return true for custom valid config', () => {
      const config = {
        matchThreshold: 0.8,
        nonMatchThreshold: 0.2,
        includeFeatureImportance: false,
        batchSize: 50,
      };
      expect(isValidMLModelConfig(config)).toBe(true);
    });

    it('should return false when thresholds are inverted', () => {
      const config = {
        matchThreshold: 0.3,
        nonMatchThreshold: 0.7, // Higher than match
        includeFeatureImportance: true,
        batchSize: 100,
      };
      expect(isValidMLModelConfig(config)).toBe(false);
    });

    it('should return false for out-of-range thresholds', () => {
      const config = {
        matchThreshold: 1.5, // Out of range
        nonMatchThreshold: 0.3,
        includeFeatureImportance: true,
        batchSize: 100,
      };
      expect(isValidMLModelConfig(config)).toBe(false);
    });

    it('should return false for negative batch size', () => {
      const config = {
        matchThreshold: 0.7,
        nonMatchThreshold: 0.3,
        includeFeatureImportance: true,
        batchSize: -1,
      };
      expect(isValidMLModelConfig(config)).toBe(false);
    });

    it('should return false for null', () => {
      expect(isValidMLModelConfig(null)).toBe(false);
    });

    it('should return false for non-object', () => {
      expect(isValidMLModelConfig('string')).toBe(false);
    });
  });

  describe('isValidModelMetadata', () => {
    it('should return true for valid metadata', () => {
      const metadata = {
        name: 'test-model',
        version: '1.0.0',
        featureNames: ['f1', 'f2'],
      };
      expect(isValidModelMetadata(metadata)).toBe(true);
    });

    it('should return true with optional fields', () => {
      const metadata = {
        name: 'test-model',
        version: '1.0.0',
        trainedAt: new Date(),
        accuracy: 0.95,
        trainingExamples: 10000,
        featureNames: ['f1'],
        extra: { source: 'test' },
      };
      expect(isValidModelMetadata(metadata)).toBe(true);
    });

    it('should return false for empty name', () => {
      const metadata = {
        name: '',
        version: '1.0.0',
        featureNames: ['f1'],
      };
      expect(isValidModelMetadata(metadata)).toBe(false);
    });

    it('should return false for non-string feature names', () => {
      const metadata = {
        name: 'test',
        version: '1.0.0',
        featureNames: [1, 2, 3],
      };
      expect(isValidModelMetadata(metadata)).toBe(false);
    });
  });

  describe('isValidRecordPair', () => {
    it('should return true for valid pair', () => {
      const pair = {
        record1: { name: 'John' },
        record2: { name: 'Jane' },
      };
      expect(isValidRecordPair(pair)).toBe(true);
    });

    it('should return true for pair with valid label', () => {
      const pair = {
        record1: { name: 'John' },
        record2: { name: 'John' },
        label: 'match',
      };
      expect(isValidRecordPair(pair)).toBe(true);
    });

    it('should return false for invalid label', () => {
      const pair = {
        record1: { name: 'John' },
        record2: { name: 'Jane' },
        label: 'invalid',
      };
      expect(isValidRecordPair(pair)).toBe(false);
    });

    it('should return false for missing record1', () => {
      const pair = {
        record2: { name: 'Jane' },
      };
      expect(isValidRecordPair(pair)).toBe(false);
    });
  });

  describe('isValidFeatureVector', () => {
    it('should return true for valid vector', () => {
      const vector = {
        values: [0.9, 0.8, 0.7],
        names: ['f1', 'f2', 'f3'],
      };
      expect(isValidFeatureVector(vector)).toBe(true);
    });

    it('should return false for mismatched lengths', () => {
      const vector = {
        values: [0.9, 0.8],
        names: ['f1'],
      };
      expect(isValidFeatureVector(vector)).toBe(false);
    });

    it('should return false for NaN values', () => {
      const vector = {
        values: [0.9, NaN],
        names: ['f1', 'f2'],
      };
      expect(isValidFeatureVector(vector)).toBe(false);
    });

    it('should return false for non-numeric values', () => {
      const vector = {
        values: ['a', 'b'],
        names: ['f1', 'f2'],
      };
      expect(isValidFeatureVector(vector)).toBe(false);
    });
  });

  describe('isValidMLPrediction', () => {
    it('should return true for valid prediction', () => {
      const prediction = {
        probability: 0.85,
        classification: 'match',
        confidence: 0.7,
        features: { values: [0.9], names: ['f1'] },
        featureImportance: [],
      };
      expect(isValidMLPrediction(prediction)).toBe(true);
    });

    it('should return false for probability > 1', () => {
      const prediction = {
        probability: 1.5,
        classification: 'match',
        confidence: 0.7,
        features: { values: [0.9], names: ['f1'] },
        featureImportance: [],
      };
      expect(isValidMLPrediction(prediction)).toBe(false);
    });

    it('should return false for invalid classification', () => {
      const prediction = {
        probability: 0.85,
        classification: 'maybe',
        confidence: 0.7,
        features: { values: [0.9], names: ['f1'] },
        featureImportance: [],
      };
      expect(isValidMLPrediction(prediction)).toBe(false);
    });
  });

  describe('isValidTrainingConfig', () => {
    it('should return true for valid config', () => {
      expect(isValidTrainingConfig(DEFAULT_TRAINING_CONFIG)).toBe(true);
    });

    it('should return false for zero learning rate', () => {
      const config = { ...DEFAULT_TRAINING_CONFIG, learningRate: 0 };
      expect(isValidTrainingConfig(config)).toBe(false);
    });

    it('should return false for negative iterations', () => {
      const config = { ...DEFAULT_TRAINING_CONFIG, maxIterations: -1 };
      expect(isValidTrainingConfig(config)).toBe(false);
    });

    it('should return false for validation split >= 1', () => {
      const config = { ...DEFAULT_TRAINING_CONFIG, validationSplit: 1.0 };
      expect(isValidTrainingConfig(config)).toBe(false);
    });
  });

  describe('isValidTrainingExample', () => {
    it('should return true for valid example', () => {
      const example = {
        pair: { record1: { name: 'A' }, record2: { name: 'A' } },
        label: 'match',
      };
      expect(isValidTrainingExample(example)).toBe(true);
    });

    it('should return false for uncertain label', () => {
      const example = {
        pair: { record1: { name: 'A' }, record2: { name: 'B' } },
        label: 'uncertain', // Not valid for training
      };
      expect(isValidTrainingExample(example)).toBe(false);
    });

    it('should return true with optional fields', () => {
      const example = {
        pair: { record1: { name: 'A' }, record2: { name: 'B' } },
        label: 'nonMatch',
        source: 'human-review',
        timestamp: new Date(),
      };
      expect(isValidTrainingExample(example)).toBe(true);
    });
  });

  describe('isValidTrainingDataset', () => {
    it('should return true for valid dataset', () => {
      const dataset = {
        examples: [
          { pair: { record1: { id: 1 }, record2: { id: 1 } }, label: 'match' },
          { pair: { record1: { id: 2 }, record2: { id: 3 } }, label: 'nonMatch' },
        ],
      };
      expect(isValidTrainingDataset(dataset)).toBe(true);
    });

    it('should return true for empty dataset', () => {
      const dataset = { examples: [] };
      expect(isValidTrainingDataset(dataset)).toBe(true);
    });

    it('should return false if any example is invalid', () => {
      const dataset = {
        examples: [
          { pair: { record1: { id: 1 }, record2: { id: 1 } }, label: 'match' },
          { pair: { record1: { id: 2 } }, label: 'nonMatch' }, // Missing record2
        ],
      };
      expect(isValidTrainingDataset(dataset)).toBe(false);
    });
  });

  describe('isValidFieldFeatureConfig', () => {
    it('should return true for valid config', () => {
      const config = {
        field: 'email',
        extractors: ['exact', 'levenshtein'],
      };
      expect(isValidFieldFeatureConfig(config)).toBe(true);
    });

    it('should return true with optional fields', () => {
      const config = {
        field: 'name',
        extractors: ['jaroWinkler'],
        weight: 2.0,
        includeMissingIndicator: true,
      };
      expect(isValidFieldFeatureConfig(config)).toBe(true);
    });

    it('should return false for empty field name', () => {
      const config = {
        field: '',
        extractors: ['exact'],
      };
      expect(isValidFieldFeatureConfig(config)).toBe(false);
    });

    it('should return false for invalid extractor', () => {
      const config = {
        field: 'email',
        extractors: ['invalid-extractor'],
      };
      expect(isValidFieldFeatureConfig(config)).toBe(false);
    });

    it('should return false for negative weight', () => {
      const config = {
        field: 'email',
        extractors: ['exact'],
        weight: -1,
      };
      expect(isValidFieldFeatureConfig(config)).toBe(false);
    });
  });

  describe('isValidFeatureExtractionConfig', () => {
    it('should return true for valid config', () => {
      const config = {
        fields: [{ field: 'name', extractors: ['jaroWinkler'] }],
        normalize: true,
      };
      expect(isValidFeatureExtractionConfig(config)).toBe(true);
    });

    it('should return false for empty fields array', () => {
      const config = {
        fields: [],
        normalize: true,
      };
      expect(isValidFeatureExtractionConfig(config)).toBe(false);
    });

    it('should return false if any field config is invalid', () => {
      const config = {
        fields: [
          { field: 'name', extractors: ['jaroWinkler'] },
          { field: '', extractors: ['exact'] }, // Invalid
        ],
        normalize: true,
      };
      expect(isValidFeatureExtractionConfig(config)).toBe(false);
    });
  });

  describe('isValidMLIntegrationConfig', () => {
    it('should return true for valid config', () => {
      const config = {
        mode: 'hybrid',
        mlWeight: 0.5,
        applyTo: 'all',
        timeoutMs: 5000,
        fallbackOnError: true,
      };
      expect(isValidMLIntegrationConfig(config)).toBe(true);
    });

    it('should return false for invalid mode', () => {
      const config = {
        mode: 'invalid',
        mlWeight: 0.5,
        applyTo: 'all',
        timeoutMs: 5000,
        fallbackOnError: true,
      };
      expect(isValidMLIntegrationConfig(config)).toBe(false);
    });

    it('should return false for mlWeight > 1', () => {
      const config = {
        mode: 'hybrid',
        mlWeight: 1.5,
        applyTo: 'all',
        timeoutMs: 5000,
        fallbackOnError: true,
      };
      expect(isValidMLIntegrationConfig(config)).toBe(false);
    });

    it('should return false for invalid applyTo', () => {
      const config = {
        mode: 'hybrid',
        mlWeight: 0.5,
        applyTo: 'some',
        timeoutMs: 5000,
        fallbackOnError: true,
      };
      expect(isValidMLIntegrationConfig(config)).toBe(false);
    });
  });

  describe('mergeWithDefaultMLModelConfig', () => {
    it('should return defaults when no partial provided', () => {
      const config = mergeWithDefaultMLModelConfig();
      expect(config).toEqual(DEFAULT_ML_MODEL_CONFIG);
    });

    it('should merge partial with defaults', () => {
      const config = mergeWithDefaultMLModelConfig({ matchThreshold: 0.9 });
      expect(config.matchThreshold).toBe(0.9);
      expect(config.nonMatchThreshold).toBe(DEFAULT_ML_MODEL_CONFIG.nonMatchThreshold);
    });

    it('should override all specified fields', () => {
      const config = mergeWithDefaultMLModelConfig({
        matchThreshold: 0.8,
        nonMatchThreshold: 0.2,
        batchSize: 50,
      });
      expect(config.matchThreshold).toBe(0.8);
      expect(config.nonMatchThreshold).toBe(0.2);
      expect(config.batchSize).toBe(50);
    });
  });

  describe('mergeWithDefaultTrainingConfig', () => {
    it('should return defaults when no partial provided', () => {
      const config = mergeWithDefaultTrainingConfig();
      expect(config).toEqual(DEFAULT_TRAINING_CONFIG);
    });

    it('should merge partial with defaults', () => {
      const config = mergeWithDefaultTrainingConfig({ learningRate: 0.1 });
      expect(config.learningRate).toBe(0.1);
      expect(config.maxIterations).toBe(DEFAULT_TRAINING_CONFIG.maxIterations);
    });
  });

  describe('validateMLModelConfig', () => {
    it('should return valid for correct config', () => {
      const result = validateMLModelConfig(DEFAULT_ML_MODEL_CONFIG);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return errors for invalid matchThreshold', () => {
      const result = validateMLModelConfig({
        ...DEFAULT_ML_MODEL_CONFIG,
        matchThreshold: 1.5,
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === 'matchThreshold')).toBe(true);
    });

    it('should return errors when thresholds are inverted', () => {
      const result = validateMLModelConfig({
        ...DEFAULT_ML_MODEL_CONFIG,
        matchThreshold: 0.3,
        nonMatchThreshold: 0.7,
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === 'thresholds')).toBe(true);
    });

    it('should return errors for invalid batchSize', () => {
      const result = validateMLModelConfig({
        ...DEFAULT_ML_MODEL_CONFIG,
        batchSize: 0,
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === 'batchSize')).toBe(true);
    });

    it('should return error for non-object input', () => {
      const result = validateMLModelConfig('not an object');
      expect(result.valid).toBe(false);
      expect(result.errors[0].field).toBe('config');
    });
  });

  describe('validateTrainingConfig', () => {
    it('should return valid for correct config', () => {
      const result = validateTrainingConfig(DEFAULT_TRAINING_CONFIG);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return errors for zero learning rate', () => {
      const result = validateTrainingConfig({
        ...DEFAULT_TRAINING_CONFIG,
        learningRate: 0,
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === 'learningRate')).toBe(true);
    });

    it('should return errors for negative maxIterations', () => {
      const result = validateTrainingConfig({
        ...DEFAULT_TRAINING_CONFIG,
        maxIterations: -10,
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === 'maxIterations')).toBe(true);
    });

    it('should return errors for validation split >= 1', () => {
      const result = validateTrainingConfig({
        ...DEFAULT_TRAINING_CONFIG,
        validationSplit: 1.0,
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === 'validationSplit')).toBe(true);
    });

    it('should return multiple errors', () => {
      const result = validateTrainingConfig({
        learningRate: 0,
        maxIterations: -1,
        regularization: -1,
        validationSplit: 2,
        earlyStoppingPatience: 0,
        minImprovement: -0.1,
      });
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
    });
  });
});
