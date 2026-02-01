import { describe, it, expect } from 'vitest';
import {
  DEFAULT_ML_MODEL_CONFIG,
  DEFAULT_TRAINING_CONFIG,
  DEFAULT_FEATURE_EXTRACTION_CONFIG,
  DEFAULT_ML_INTEGRATION_CONFIG,
} from '../../../src/ml/types';
import type {
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
  MLIntegrationMode,
  MLIntegrationConfig,
} from '../../../src/ml/types';

describe('ML Types', () => {
  describe('MLMatchOutcome', () => {
    it('should accept valid outcome values', () => {
      const outcomes: MLMatchOutcome[] = ['match', 'nonMatch', 'uncertain'];
      expect(outcomes).toHaveLength(3);
    });
  });

  describe('RecordPair', () => {
    it('should create a valid record pair', () => {
      const pair: RecordPair<{ name: string }> = {
        record1: { name: 'John' },
        record2: { name: 'Jon' },
      };
      expect(pair.record1.name).toBe('John');
      expect(pair.record2.name).toBe('Jon');
    });

    it('should support optional label', () => {
      const labeledPair: RecordPair<{ name: string }> = {
        record1: { name: 'John' },
        record2: { name: 'Jon' },
        label: 'match',
      };
      expect(labeledPair.label).toBe('match');
    });
  });

  describe('FeatureVector', () => {
    it('should create a valid feature vector', () => {
      const vector: FeatureVector = {
        values: [0.9, 0.8, 1.0],
        names: ['nameSimilarity', 'emailSimilarity', 'exactMatch'],
      };
      expect(vector.values).toHaveLength(3);
      expect(vector.names).toHaveLength(3);
    });

    it('should support optional metadata', () => {
      const vector: FeatureVector = {
        values: [0.9],
        names: ['score'],
        metadata: { normalized: true },
      };
      expect(vector.metadata?.normalized).toBe(true);
    });
  });

  describe('FeatureImportance', () => {
    it('should create valid feature importance', () => {
      const importance: FeatureImportance = {
        name: 'emailSimilarity',
        value: 0.95,
        contribution: 0.475,
        importance: 0.475,
      };
      expect(importance.name).toBe('emailSimilarity');
      expect(importance.importance).toBe(Math.abs(importance.contribution));
    });

    it('should handle negative contributions', () => {
      const importance: FeatureImportance = {
        name: 'cityMismatch',
        value: 0.0,
        contribution: -0.2,
        importance: 0.2,
      };
      expect(importance.contribution).toBeLessThan(0);
      expect(importance.importance).toBeGreaterThan(0);
    });
  });

  describe('MLPrediction', () => {
    it('should create a valid prediction', () => {
      const prediction: MLPrediction = {
        probability: 0.85,
        classification: 'match',
        confidence: 0.75,
        features: {
          values: [0.9, 0.8],
          names: ['f1', 'f2'],
        },
        featureImportance: [],
      };
      expect(prediction.probability).toBe(0.85);
      expect(prediction.classification).toBe('match');
    });
  });

  describe('BatchMLPrediction', () => {
    it('should create a batch prediction result', () => {
      const result: BatchMLPrediction<{ id: number }> = {
        pair: {
          record1: { id: 1 },
          record2: { id: 2 },
        },
        prediction: {
          probability: 0.7,
          classification: 'match',
          confidence: 0.6,
          features: { values: [0.7], names: ['score'] },
          featureImportance: [],
        },
      };
      expect(result.pair.record1.id).toBe(1);
      expect(result.prediction.probability).toBe(0.7);
    });
  });

  describe('ModelMetadata', () => {
    it('should create valid metadata', () => {
      const metadata: ModelMetadata = {
        name: 'person-matcher',
        version: '1.0.0',
        featureNames: ['nameSimilarity', 'emailSimilarity'],
      };
      expect(metadata.name).toBe('person-matcher');
      expect(metadata.featureNames).toHaveLength(2);
    });

    it('should support optional fields', () => {
      const metadata: ModelMetadata = {
        name: 'person-matcher',
        version: '1.0.0',
        trainedAt: new Date('2026-01-01'),
        accuracy: 0.92,
        trainingExamples: 10000,
        featureNames: ['f1'],
        extra: { source: 'synthetic' },
      };
      expect(metadata.accuracy).toBe(0.92);
      expect(metadata.trainedAt).toBeInstanceOf(Date);
    });
  });

  describe('DEFAULT_ML_MODEL_CONFIG', () => {
    it('should have valid default values', () => {
      expect(DEFAULT_ML_MODEL_CONFIG.matchThreshold).toBe(0.7);
      expect(DEFAULT_ML_MODEL_CONFIG.nonMatchThreshold).toBe(0.3);
      expect(DEFAULT_ML_MODEL_CONFIG.includeFeatureImportance).toBe(true);
      expect(DEFAULT_ML_MODEL_CONFIG.batchSize).toBe(100);
    });

    it('should have matchThreshold > nonMatchThreshold', () => {
      expect(DEFAULT_ML_MODEL_CONFIG.matchThreshold).toBeGreaterThan(
        DEFAULT_ML_MODEL_CONFIG.nonMatchThreshold
      );
    });
  });

  describe('TrainingExample', () => {
    it('should create a valid training example', () => {
      const example: TrainingExample<{ name: string }> = {
        pair: {
          record1: { name: 'John' },
          record2: { name: 'John' },
        },
        label: 'match',
      };
      expect(example.label).toBe('match');
    });

    it('should support optional fields', () => {
      const example: TrainingExample<{ name: string }> = {
        pair: {
          record1: { name: 'John' },
          record2: { name: 'Jane' },
        },
        label: 'nonMatch',
        source: 'human-review',
        timestamp: new Date(),
      };
      expect(example.source).toBe('human-review');
    });
  });

  describe('TrainingDataset', () => {
    it('should create a valid dataset', () => {
      const dataset: TrainingDataset<{ name: string }> = {
        examples: [
          {
            pair: { record1: { name: 'A' }, record2: { name: 'A' } },
            label: 'match',
          },
          {
            pair: { record1: { name: 'A' }, record2: { name: 'B' } },
            label: 'nonMatch',
          },
        ],
      };
      expect(dataset.examples).toHaveLength(2);
    });

    it('should support metadata', () => {
      const dataset: TrainingDataset<{ name: string }> = {
        examples: [],
        metadata: {
          name: 'test-dataset',
          description: 'Test training data',
          createdAt: new Date(),
          matchCount: 500,
          nonMatchCount: 500,
        },
      };
      expect(dataset.metadata?.matchCount).toBe(500);
    });
  });

  describe('DEFAULT_TRAINING_CONFIG', () => {
    it('should have valid default values', () => {
      expect(DEFAULT_TRAINING_CONFIG.learningRate).toBe(0.01);
      expect(DEFAULT_TRAINING_CONFIG.maxIterations).toBe(1000);
      expect(DEFAULT_TRAINING_CONFIG.regularization).toBe(0.001);
      expect(DEFAULT_TRAINING_CONFIG.validationSplit).toBe(0.2);
      expect(DEFAULT_TRAINING_CONFIG.earlyStoppingPatience).toBe(10);
      expect(DEFAULT_TRAINING_CONFIG.minImprovement).toBe(0.001);
    });
  });

  describe('TrainingMetrics', () => {
    it('should create valid metrics', () => {
      const metrics: TrainingMetrics = {
        iteration: 100,
        trainingLoss: 0.15,
        trainingAccuracy: 0.92,
        validationLoss: 0.18,
        validationAccuracy: 0.89,
      };
      expect(metrics.iteration).toBe(100);
      expect(metrics.trainingAccuracy).toBe(0.92);
    });
  });

  describe('TrainingResult', () => {
    it('should create a successful result', () => {
      const result: TrainingResult = {
        success: true,
        weights: [0.5, 0.3, 0.2],
        bias: 0.1,
        finalMetrics: {
          iteration: 500,
          trainingLoss: 0.1,
          trainingAccuracy: 0.95,
        },
        history: [],
        trainingTimeMs: 5000,
        earlyStopped: false,
      };
      expect(result.success).toBe(true);
      expect(result.weights).toHaveLength(3);
    });

    it('should create a failed result', () => {
      const result: TrainingResult = {
        success: false,
        finalMetrics: {
          iteration: 0,
          trainingLoss: Infinity,
          trainingAccuracy: 0,
        },
        history: [],
        trainingTimeMs: 100,
        earlyStopped: false,
        error: 'Training diverged',
      };
      expect(result.success).toBe(false);
      expect(result.error).toBe('Training diverged');
    });
  });

  describe('FieldFeatureConfig', () => {
    it('should create valid field config', () => {
      const config: FieldFeatureConfig = {
        field: 'email',
        extractors: ['exact', 'levenshtein'],
      };
      expect(config.field).toBe('email');
      expect(config.extractors).toHaveLength(2);
    });

    it('should support optional weight and missing indicator', () => {
      const config: FieldFeatureConfig = {
        field: 'name',
        extractors: ['jaroWinkler', 'soundex'],
        weight: 2.0,
        includeMissingIndicator: true,
      };
      expect(config.weight).toBe(2.0);
      expect(config.includeMissingIndicator).toBe(true);
    });
  });

  describe('FeatureExtractorType', () => {
    it('should accept all valid extractor types', () => {
      const types: FeatureExtractorType[] = [
        'exact',
        'levenshtein',
        'jaroWinkler',
        'soundex',
        'metaphone',
        'numericDiff',
        'dateDiff',
        'missing',
        'custom',
      ];
      expect(types).toHaveLength(9);
    });
  });

  describe('FeatureExtractionConfig', () => {
    it('should create valid config', () => {
      const config: FeatureExtractionConfig = {
        fields: [
          { field: 'name', extractors: ['jaroWinkler'] },
          { field: 'email', extractors: ['exact', 'levenshtein'] },
        ],
        normalize: true,
      };
      expect(config.fields).toHaveLength(2);
      expect(config.normalize).toBe(true);
    });

    it('should support custom extractors', () => {
      const config: FeatureExtractionConfig = {
        fields: [{ field: 'custom', extractors: ['custom'] }],
        normalize: false,
        customExtractors: {
          myExtractor: (v1, v2) => (v1 === v2 ? 1 : 0),
        },
      };
      expect(config.customExtractors?.myExtractor).toBeDefined();
    });
  });

  describe('DEFAULT_FEATURE_EXTRACTION_CONFIG', () => {
    it('should have normalize as true', () => {
      expect(DEFAULT_FEATURE_EXTRACTION_CONFIG.normalize).toBe(true);
    });
  });

  describe('MLIntegrationMode', () => {
    it('should accept valid modes', () => {
      const modes: MLIntegrationMode[] = ['mlOnly', 'hybrid', 'fallback'];
      expect(modes).toHaveLength(3);
    });
  });

  describe('MLIntegrationConfig', () => {
    it('should create valid config', () => {
      const config: MLIntegrationConfig = {
        mode: 'hybrid',
        mlWeight: 0.6,
        applyTo: 'all',
        timeoutMs: 3000,
        fallbackOnError: true,
      };
      expect(config.mode).toBe('hybrid');
      expect(config.mlWeight).toBe(0.6);
    });
  });

  describe('DEFAULT_ML_INTEGRATION_CONFIG', () => {
    it('should have valid defaults', () => {
      expect(DEFAULT_ML_INTEGRATION_CONFIG.mode).toBe('hybrid');
      expect(DEFAULT_ML_INTEGRATION_CONFIG.mlWeight).toBe(0.5);
      expect(DEFAULT_ML_INTEGRATION_CONFIG.applyTo).toBe('all');
      expect(DEFAULT_ML_INTEGRATION_CONFIG.timeoutMs).toBe(5000);
      expect(DEFAULT_ML_INTEGRATION_CONFIG.fallbackOnError).toBe(true);
    });
  });
});
