/**
 * ML Workflow Integration Tests
 *
 * Tests the complete ML matching workflow from configuration through prediction,
 * including builder API, integrator patterns, and batch processing.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createPretrainedClassifier,
  SimpleClassifier,
  FeatureExtractor,
  mlBuilder,
  createModelFromConfig,
  MLMatchIntegrator,
  createMLIntegrator,
  formatPrediction,
  getTopFeatures,
  isMLMatchResult,
} from '../../../src/ml';
import type {
  MLPrediction,
  RecordPair,
  FeatureExtractionConfig,
  MLBuilderConfig,
} from '../../../src/ml';
import type { MatchResult, MatchOutcome } from '../../../src/core/scoring/types';

interface Customer {
  id?: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  dateOfBirth?: string;
  address?: string;
}

function createMockProbabilisticResult<T>(
  candidateRecord: T,
  totalScore: number,
  maxScore: number = 100
): MatchResult<T> {
  const normalizedScore = totalScore / maxScore;
  let outcome: MatchOutcome;

  if (normalizedScore >= 0.65) {
    outcome = 'definite-match';
  } else if (normalizedScore < 0.3) {
    outcome = 'no-match';
  } else {
    outcome = 'potential-match';
  }

  return {
    outcome,
    candidateRecord,
    score: {
      totalScore,
      maxPossibleScore: maxScore,
      normalizedScore,
      fieldScores: [],
    },
    explanation: `Score: ${totalScore}/${maxScore}`,
  };
}

describe('ML Workflow Integration', () => {
  describe('Pre-trained Classifier Workflow', () => {
    it('should load and use pre-trained classifier', async () => {
      const classifier = await createPretrainedClassifier<Customer>();

      expect(classifier.isReady()).toBe(true);
      expect(classifier.getMetadata().name).toBeDefined();
      expect(classifier.getMetadata().featureNames.length).toBeGreaterThan(0);
    });

    it('should make predictions with pre-trained classifier', async () => {
      const classifier = await createPretrainedClassifier<Customer>();

      const pair: RecordPair<Customer> = {
        record1: { firstName: 'John', lastName: 'Smith', email: 'john@example.com' },
        record2: { firstName: 'John', lastName: 'Smith', email: 'john@example.com' },
      };

      const prediction = await classifier.predict(pair);

      expect(prediction.probability).toBeGreaterThanOrEqual(0);
      expect(prediction.probability).toBeLessThanOrEqual(1);
      expect(['match', 'nonMatch', 'uncertain']).toContain(prediction.classification);
      expect(prediction.confidence).toBeGreaterThanOrEqual(0);
      expect(prediction.features).toBeDefined();
    });

    it('should handle similar but not identical records', async () => {
      const classifier = await createPretrainedClassifier<Customer>();

      const pair: RecordPair<Customer> = {
        record1: { firstName: 'John', lastName: 'Smith', email: 'john.smith@example.com' },
        record2: { firstName: 'Jon', lastName: 'Smith', email: 'john.smith@example.com' },
      };

      const prediction = await classifier.predict(pair);

      // Similar records should have reasonable probability
      expect(prediction.probability).toBeGreaterThan(0.3);
    });

    it('should handle clearly different records', async () => {
      const classifier = await createPretrainedClassifier<Customer>();

      const pair: RecordPair<Customer> = {
        record1: { firstName: 'John', lastName: 'Smith', email: 'john@example.com' },
        record2: { firstName: 'Alice', lastName: 'Jones', email: 'alice@different.org' },
      };

      const prediction = await classifier.predict(pair);

      // Different records should have lower probability than identical records
      const identicalPair: RecordPair<Customer> = {
        record1: { firstName: 'John', lastName: 'Smith', email: 'john@example.com' },
        record2: { firstName: 'John', lastName: 'Smith', email: 'john@example.com' },
      };
      const identicalPrediction = await classifier.predict(identicalPair);

      // Different records should score lower than identical records
      expect(prediction.probability).toBeLessThan(identicalPrediction.probability);
    });
  });

  describe('Custom Classifier Workflow', () => {
    let featureExtractor: FeatureExtractor<Customer>;
    let classifier: SimpleClassifier<Customer>;

    beforeEach(() => {
      const config: FeatureExtractionConfig = {
        fields: [
          { field: 'firstName', extractors: ['jaroWinkler', 'soundex', 'exact'], weight: 1.2 },
          { field: 'lastName', extractors: ['jaroWinkler', 'soundex', 'exact'], weight: 1.2 },
          { field: 'email', extractors: ['exact', 'levenshtein'], weight: 1.5 },
          { field: 'phone', extractors: ['exact', 'levenshtein'], weight: 1.0 },
        ],
        normalize: true,
      };

      featureExtractor = new FeatureExtractor<Customer>(config);
      classifier = new SimpleClassifier<Customer>({ featureExtractor });
    });

    it('should extract features from record pairs', () => {
      const pair: RecordPair<Customer> = {
        record1: { firstName: 'John', lastName: 'Smith', email: 'john@example.com' },
        record2: { firstName: 'John', lastName: 'Smith', email: 'john@example.com' },
      };

      const features = featureExtractor.extract(pair);

      expect(features.values.length).toBe(features.names.length);
      expect(features.names).toContain('firstName_jaroWinkler');
      expect(features.names).toContain('email_exact');
    });

    it('should load custom weights', async () => {
      const featureNames = featureExtractor.getFeatureNames();
      const weights = featureNames.map(() => Math.random() * 2 - 1);

      classifier.setWeightsAndBias(weights, -0.5);

      expect(classifier.isReady()).toBe(true);
      expect(classifier.getWeights().length).toBe(weights.length);
    });

    it('should export and reimport weights', async () => {
      const featureNames = featureExtractor.getFeatureNames();
      const weights = featureNames.map((_, i) => (i % 2 === 0 ? 0.5 : -0.3));

      classifier.setWeightsAndBias(weights, -0.2);
      const exported = classifier.exportWeights();

      const newClassifier = new SimpleClassifier<Customer>({ featureExtractor });
      await newClassifier.loadWeights(exported);

      expect(newClassifier.isReady()).toBe(true);
      expect(newClassifier.getWeights()).toEqual(weights);
      expect(newClassifier.getBias()).toBe(-0.2);
    });

    it('should provide feature importance', async () => {
      const featureNames = featureExtractor.getFeatureNames();
      const weights = featureNames.map((_, i) => i * 0.1);

      classifier.setWeightsAndBias(weights, 0);

      const importance = classifier.getFeatureImportance();

      expect(importance.length).toBe(featureNames.length);
      // Should be sorted by importance (absolute weight) descending
      for (let i = 1; i < importance.length; i++) {
        expect(importance[i - 1].importance).toBeGreaterThanOrEqual(importance[i].importance);
      }
    });
  });

  describe('MLBuilder Workflow', () => {
    it('should build configuration with usePretrained', () => {
      const config = mlBuilder<Customer>()
        .usePretrained()
        .mode('hybrid')
        .mlWeight(0.4)
        .build();

      expect(config.usePretrained).toBe(true);
      expect(config.integrationConfig.mode).toBe('hybrid');
      expect(config.integrationConfig.mlWeight).toBe(0.4);
    });

    it('should build configuration with custom fields', () => {
      const config = mlBuilder<Customer>()
        .field('firstName')
        .forName()
        .weight(1.2)
        .field('email')
        .forIdentifier()
        .weight(1.5)
        .field('dateOfBirth')
        .forDate()
        .done()
        .mode('mlOnly')
        .build();

      expect(config.featureConfig?.fields.length).toBe(3);
      expect(config.integrationConfig.mode).toBe('mlOnly');
    });

    it('should build configuration with helper methods', () => {
      const config = mlBuilder<Customer>()
        .nameFields(['firstName', 'lastName'])
        .identifierFields(['email', 'phone'])
        .mode('hybrid')
        .mlWeight(0.5)
        .build();

      expect(config.featureConfig?.fields.length).toBe(4);
    });

    it('should create model from builder config', async () => {
      const config = mlBuilder<Customer>()
        .usePretrained()
        .matchThreshold(0.7)
        .nonMatchThreshold(0.3)
        .build();

      const model = await createModelFromConfig<Customer>(config);

      expect(model.isReady()).toBe(true);
    });

    it('should validate ML weight bounds', () => {
      expect(() => {
        mlBuilder<Customer>().mlWeight(-0.1);
      }).toThrow('ML weight must be between 0 and 1');

      expect(() => {
        mlBuilder<Customer>().mlWeight(1.5);
      }).toThrow('ML weight must be between 0 and 1');
    });
  });

  describe('MLMatchIntegrator Workflow', () => {
    let classifier: SimpleClassifier<Customer>;
    let integrator: MLMatchIntegrator<Customer>;

    beforeEach(async () => {
      classifier = await createPretrainedClassifier<Customer>();
      integrator = createMLIntegrator(classifier, {
        mode: 'hybrid',
        mlWeight: 0.5,
        applyTo: 'all',
        timeoutMs: 5000,
        fallbackOnError: true,
      });
    });

    it('should enhance match result in hybrid mode', async () => {
      const candidate: Customer = {
        firstName: 'John',
        lastName: 'Smith',
        email: 'john@example.com',
      };

      const existing: Customer = {
        firstName: 'Jon',
        lastName: 'Smith',
        email: 'john@example.com',
      };

      const probResult = createMockProbabilisticResult(existing, 45, 100);
      const enhanced = await integrator.enhanceMatchResult(
        candidate,
        existing,
        probResult
      );

      expect(enhanced.mlUsed).toBe(true);
      expect(enhanced.mlPrediction).toBeDefined();
      expect(enhanced.mlScoreContribution).toBeDefined();
      expect(enhanced.probabilisticScoreContribution).toBeDefined();
      expect(isMLMatchResult(enhanced)).toBe(true);
    });

    it('should enhance multiple results', async () => {
      const candidate: Customer = { firstName: 'John', lastName: 'Smith' };

      const existingRecords: Customer[] = [
        { firstName: 'John', lastName: 'Smith', email: 'john@a.com' },
        { firstName: 'Jon', lastName: 'Smyth', email: 'jon@b.com' },
        { firstName: 'Jane', lastName: 'Doe', email: 'jane@c.com' },
      ];

      const probResults = existingRecords.map((r, i) =>
        createMockProbabilisticResult(r, 60 - i * 20, 100)
      );

      const enhanced = await integrator.enhanceMatchResults(
        candidate,
        existingRecords,
        probResults
      );

      expect(enhanced.length).toBe(3);
      enhanced.forEach((r) => {
        expect(r.mlUsed).toBe(true);
      });
    });

    it('should provide batch statistics', async () => {
      const candidate: Customer = { firstName: 'John', lastName: 'Smith' };

      const existingRecords: Customer[] = [
        { firstName: 'John', lastName: 'Smith' },
        { firstName: 'Jane', lastName: 'Doe' },
      ];

      const probResults = existingRecords.map((r) =>
        createMockProbabilisticResult(r, 50, 100)
      );

      const { results, stats } = await integrator.enhanceMatchResultsBatch(
        candidate,
        existingRecords,
        probResults
      );

      expect(stats.totalMatches).toBe(2);
      expect(stats.mlUsedCount).toBeGreaterThan(0);
      expect(stats.avgMLPredictionTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should support ML-only matching', async () => {
      const candidate: Customer = {
        firstName: 'John',
        lastName: 'Smith',
        email: 'john@example.com',
      };

      const existing: Customer = {
        firstName: 'John',
        lastName: 'Smith',
        email: 'john@example.com',
      };

      const result = await integrator.matchWithMLOnly(
        candidate,
        existing,
        { noMatch: 30, definiteMatch: 65 }
      );

      expect(result.mlUsed).toBe(true);
      expect(result.mlPrediction).toBeDefined();
      expect(result.score.totalScore).toBe(result.mlPrediction!.probability * 100);
    });

    it('should skip ML when requested', async () => {
      const candidate: Customer = { firstName: 'John', lastName: 'Smith' };
      const existing: Customer = { firstName: 'John', lastName: 'Smith' };

      const probResult = createMockProbabilisticResult(existing, 50, 100);
      const enhanced = await integrator.enhanceMatchResult(
        candidate,
        existing,
        probResult,
        { skipML: true }
      );

      expect(enhanced.mlUsed).toBe(false);
    });

    it('should override configuration per call', async () => {
      const candidate: Customer = { firstName: 'John', lastName: 'Smith' };
      const existing: Customer = { firstName: 'John', lastName: 'Smith' };

      const probResult = createMockProbabilisticResult(existing, 50, 100);

      // Original config is hybrid with 0.5 weight
      // Override to mlOnly for this call
      const enhanced = await integrator.enhanceMatchResult(
        candidate,
        existing,
        probResult,
        { mode: 'mlOnly', mlWeight: 1.0 }
      );

      expect(enhanced.mlUsed).toBe(true);
      // In mlOnly mode, score should be based entirely on ML
      expect(enhanced.mlScoreContribution).toBeUndefined();
    });
  });

  describe('Fallback Mode Workflow', () => {
    let classifier: SimpleClassifier<Customer>;
    let integrator: MLMatchIntegrator<Customer>;

    beforeEach(async () => {
      classifier = await createPretrainedClassifier<Customer>();
      integrator = createMLIntegrator(classifier, {
        mode: 'fallback',
        applyTo: 'uncertainOnly',
        fallbackOnError: true,
      });
    });

    it('should use ML only for uncertain results', async () => {
      const candidate: Customer = { firstName: 'John', lastName: 'Smith' };
      const existing: Customer = { firstName: 'John', lastName: 'Smith' };

      // High score = definite match - should NOT use ML
      const definiteResult = createMockProbabilisticResult(existing, 75, 100);
      const enhancedDefinite = await integrator.enhanceMatchResult(
        candidate,
        existing,
        definiteResult
      );
      expect(enhancedDefinite.mlUsed).toBe(false);

      // Medium score = potential match - SHOULD use ML
      const potentialResult = createMockProbabilisticResult(existing, 45, 100);
      const enhancedPotential = await integrator.enhanceMatchResult(
        candidate,
        existing,
        potentialResult
      );
      expect(enhancedPotential.mlUsed).toBe(true);

      // Low score = no match - should NOT use ML
      const noMatchResult = createMockProbabilisticResult(existing, 10, 100);
      const enhancedNoMatch = await integrator.enhanceMatchResult(
        candidate,
        existing,
        noMatchResult
      );
      expect(enhancedNoMatch.mlUsed).toBe(false);
    });
  });

  describe('Batch Predictions', () => {
    it('should process multiple pairs efficiently', async () => {
      const classifier = await createPretrainedClassifier<Customer>();

      const pairs: RecordPair<Customer>[] = Array.from({ length: 10 }, (_, i) => ({
        record1: { firstName: `Person${i}`, lastName: 'Test', email: `person${i}@test.com` },
        record2: { firstName: `Person${i}`, lastName: 'Test', email: `person${i}@test.com` },
      }));

      const startTime = performance.now();
      const results = await classifier.predictBatch(pairs);
      const endTime = performance.now();

      expect(results.length).toBe(10);
      results.forEach((r) => {
        expect(r.prediction.probability).toBeGreaterThanOrEqual(0);
        expect(r.prediction.probability).toBeLessThanOrEqual(1);
      });

      // Should complete in reasonable time (less than 1 second for 10 pairs)
      expect(endTime - startTime).toBeLessThan(1000);
    });
  });

  describe('Feature Vector Operations', () => {
    it('should extract and format features consistently', async () => {
      const classifier = await createPretrainedClassifier<Customer>();

      const pair: RecordPair<Customer> = {
        record1: { firstName: 'John', lastName: 'Smith' },
        record2: { firstName: 'John', lastName: 'Smith' },
      };

      const features1 = classifier.extractFeatures(pair);
      const features2 = classifier.extractFeatures(pair);

      // Same pair should produce same features
      expect(features1.values).toEqual(features2.values);
      expect(features1.names).toEqual(features2.names);
    });

    it('should handle missing fields gracefully', async () => {
      const classifier = await createPretrainedClassifier<Customer>();

      const pair: RecordPair<Customer> = {
        record1: { firstName: 'John', lastName: 'Smith' },
        record2: { firstName: 'John', lastName: 'Smith', email: 'john@example.com' },
      };

      // Should not throw
      const features = classifier.extractFeatures(pair);
      expect(features.values.length).toBe(features.names.length);
    });
  });

  describe('Prediction Formatting', () => {
    it('should format predictions for display', async () => {
      const classifier = await createPretrainedClassifier<Customer>();

      const pair: RecordPair<Customer> = {
        record1: { firstName: 'John', lastName: 'Smith' },
        record2: { firstName: 'John', lastName: 'Smith' },
      };

      const prediction = await classifier.predict(pair);
      const formatted = formatPrediction(prediction);

      expect(typeof formatted).toBe('string');
      expect(formatted.length).toBeGreaterThan(0);
    });

    it('should get top contributing features', async () => {
      const classifier = await createPretrainedClassifier<Customer>();
      classifier.setConfig({ includeFeatureImportance: true });

      const pair: RecordPair<Customer> = {
        record1: { firstName: 'John', lastName: 'Smith' },
        record2: { firstName: 'John', lastName: 'Smith' },
      };

      const prediction = await classifier.predict(pair);
      const topFeatures = getTopFeatures(prediction.featureImportance, 3);

      expect(topFeatures.length).toBeLessThanOrEqual(3);
      // Should be sorted by importance descending
      for (let i = 1; i < topFeatures.length; i++) {
        expect(topFeatures[i - 1].importance).toBeGreaterThanOrEqual(
          topFeatures[i].importance
        );
      }
    });
  });
});
