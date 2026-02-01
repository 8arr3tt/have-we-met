import { describe, it, expect, beforeEach } from 'vitest';
import { HaveWeMet } from '../../src';
import { SimpleClassifier } from '../../src/ml/builtin/simple-classifier';
import { FeatureExtractor } from '../../src/ml/feature-extractor';
import type { FeatureExtractionConfig } from '../../src/ml/types';

interface Person {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
}

// Create a simple feature extractor for testing
function createTestFeatureExtractor(): FeatureExtractor<Person> {
  const config: FeatureExtractionConfig = {
    fields: [
      {
        field: 'firstName',
        extractors: ['jaroWinkler', 'exact'],
      },
      {
        field: 'lastName',
        extractors: ['jaroWinkler', 'exact'],
      },
      {
        field: 'email',
        extractors: ['levenshtein', 'exact'],
      },
    ],
    normalize: true,
  };
  return new FeatureExtractor<Person>(config);
}

// Create a trained classifier for testing
async function createTrainedClassifier(): Promise<SimpleClassifier<Person>> {
  const featureExtractor = createTestFeatureExtractor();
  const classifier = new SimpleClassifier<Person>({ featureExtractor });

  // Initialize weights manually for testing
  // In a real scenario, these would come from training
  const featureCount = featureExtractor.getFeatureCount();
  const weights = Array(featureCount).fill(0.5);

  // Give more weight to email features
  const featureNames = featureExtractor.getFeatureNames();
  featureNames.forEach((name, i) => {
    if (name.includes('email')) {
      weights[i] = 1.2;
    }
    if (name.includes('lastName')) {
      weights[i] = 0.8;
    }
  });

  classifier.setWeightsAndBias(weights, -0.3);
  return classifier;
}

describe('ML Matching Integration', () => {
  let records: Person[];

  beforeEach(() => {
    records = [
      { id: '1', firstName: 'John', lastName: 'Smith', email: 'john@example.com' },
      { id: '2', firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com' },
      { id: '3', firstName: 'Jon', lastName: 'Smith', email: 'jon@example.com' },
      { id: '4', firstName: 'John', lastName: 'Smyth', email: 'john.s@example.com' },
      { id: '5', firstName: 'Alice', lastName: 'Johnson', email: 'alice@test.com' },
    ];
  });

  describe('Resolver with ML', () => {
    it('should configure ML matching on resolver', async () => {
      const resolver = HaveWeMet.create<Person>()
        .schema((s) => s
          .field('firstName').type('string')
          .field('lastName').type('string')
          .field('email').type('string')
        )
        .matching((match) =>
          match
            .field('firstName').strategy('jaro-winkler').weight(10)
            .field('lastName').strategy('jaro-winkler').weight(10)
            .field('email').strategy('exact').weight(15)
        )
        .thresholds({ noMatch: 10, definiteMatch: 30 })
        .build();

      const classifier = await createTrainedClassifier();
      resolver.configureML(classifier, { mode: 'hybrid', mlWeight: 0.5 });

      expect(resolver.hasML).toBe(true);
      expect(resolver.getMLConfig()).toBeDefined();
      expect(resolver.getMLConfig()?.mode).toBe('hybrid');
      expect(resolver.getMLConfig()?.mlWeight).toBe(0.5);
    });

    it('should resolve with ML in hybrid mode', async () => {
      const resolver = HaveWeMet.create<Person>()
        .schema((s) => s
          .field('firstName').type('string')
          .field('lastName').type('string')
          .field('email').type('string')
        )
        .matching((match) =>
          match
            .field('firstName').strategy('jaro-winkler').weight(10)
            .field('lastName').strategy('jaro-winkler').weight(10)
            .field('email').strategy('exact').weight(15)
        )
        .thresholds({ noMatch: 10, definiteMatch: 30 })
        .build();

      const classifier = await createTrainedClassifier();
      resolver.configureML(classifier, { mode: 'hybrid', mlWeight: 0.4 });

      const candidateRecord: Person = {
        id: 'new',
        firstName: 'John',
        lastName: 'Smith',
        email: 'john@example.com',
      };

      const results = await resolver.resolveWithML(candidateRecord, records);

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].mlUsed).toBe(true);
      expect(results[0].mlPrediction).toBeDefined();
      expect(results[0].mlScoreContribution).toBeDefined();
      expect(results[0].probabilisticScoreContribution).toBeDefined();
    });

    it('should resolve with ML in mlOnly mode', async () => {
      const resolver = HaveWeMet.create<Person>()
        .schema((s) => s
          .field('firstName').type('string')
          .field('lastName').type('string')
          .field('email').type('string')
        )
        .matching((match) =>
          match
            .field('firstName').strategy('jaro-winkler').weight(10)
            .field('lastName').strategy('jaro-winkler').weight(10)
            .field('email').strategy('exact').weight(15)
        )
        .thresholds({ noMatch: 10, definiteMatch: 30 })
        .build();

      const classifier = await createTrainedClassifier();
      resolver.configureML(classifier, { mode: 'mlOnly' });

      const candidateRecord: Person = {
        id: 'new',
        firstName: 'John',
        lastName: 'Smith',
        email: 'john@example.com',
      };

      const results = await resolver.resolveWithML(candidateRecord, records);

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].mlUsed).toBe(true);
      // In ML-only mode, score is based entirely on ML
      expect(results[0].mlPrediction).toBeDefined();
    });

    it('should resolve ML-only without probabilistic scoring', async () => {
      const resolver = HaveWeMet.create<Person>()
        .schema((s) => s
          .field('firstName').type('string')
          .field('lastName').type('string')
          .field('email').type('string')
        )
        .matching((match) =>
          match
            .field('firstName').strategy('jaro-winkler').weight(10)
            .field('lastName').strategy('jaro-winkler').weight(10)
            .field('email').strategy('exact').weight(15)
        )
        .thresholds({ noMatch: 10, definiteMatch: 30 })
        .build();

      const classifier = await createTrainedClassifier();
      resolver.configureML(classifier);

      const candidateRecord: Person = {
        id: 'new',
        firstName: 'John',
        lastName: 'Smith',
        email: 'john@example.com',
      };

      const results = await resolver.resolveMLOnly(candidateRecord, records);

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].mlUsed).toBe(true);
      expect(results[0].mlPrediction).toBeDefined();
      expect(results[0].score.totalScore).toBe(
        results[0].mlPrediction!.probability * 100
      );
    });

    it('should resolve with ML batch for better performance', async () => {
      const resolver = HaveWeMet.create<Person>()
        .schema((s) => s
          .field('firstName').type('string')
          .field('lastName').type('string')
          .field('email').type('string')
        )
        .matching((match) =>
          match
            .field('firstName').strategy('jaro-winkler').weight(10)
            .field('lastName').strategy('jaro-winkler').weight(10)
            .field('email').strategy('exact').weight(15)
        )
        .thresholds({ noMatch: 10, definiteMatch: 30 })
        .build();

      const classifier = await createTrainedClassifier();
      resolver.configureML(classifier, { mode: 'hybrid', mlWeight: 0.5 });

      const candidateRecord: Person = {
        id: 'new',
        firstName: 'John',
        lastName: 'Smith',
        email: 'john@example.com',
      };

      const { results, stats } = await resolver.resolveWithMLBatch(
        candidateRecord,
        records
      );

      expect(results.length).toBeGreaterThan(0);
      expect(stats.totalMatches).toBe(records.length);
      expect(stats.mlUsedCount).toBeGreaterThan(0);
      expect(stats.totalMLPredictionTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should extract ML features', async () => {
      const resolver = HaveWeMet.create<Person>()
        .schema((s) => s
          .field('firstName').type('string')
          .field('lastName').type('string')
          .field('email').type('string')
        )
        .matching((match) =>
          match
            .field('firstName').strategy('jaro-winkler').weight(10)
            .field('lastName').strategy('jaro-winkler').weight(10)
            .field('email').strategy('exact').weight(15)
        )
        .thresholds({ noMatch: 10, definiteMatch: 30 })
        .build();

      const classifier = await createTrainedClassifier();
      resolver.configureML(classifier);

      const record1: Person = { id: '1', firstName: 'John', lastName: 'Smith' };
      const record2: Person = { id: '2', firstName: 'Jon', lastName: 'Smyth' };

      const features = resolver.extractMLFeatures(record1, record2);

      expect(features.values).toBeDefined();
      expect(features.names).toBeDefined();
      expect(features.values.length).toBe(features.names.length);
      expect(features.names).toContain('firstName_jaroWinkler');
      expect(features.names).toContain('lastName_exact');
    });

    it('should update ML configuration', async () => {
      const resolver = HaveWeMet.create<Person>()
        .schema((s) => s
          .field('firstName').type('string')
          .field('lastName').type('string')
        )
        .matching((match) =>
          match
            .field('firstName').strategy('jaro-winkler').weight(10)
            .field('lastName').strategy('jaro-winkler').weight(10)
        )
        .thresholds({ noMatch: 10, definiteMatch: 30 })
        .build();

      const classifier = await createTrainedClassifier();
      resolver.configureML(classifier, { mode: 'hybrid', mlWeight: 0.3 });

      expect(resolver.getMLConfig()?.mlWeight).toBe(0.3);

      resolver.setMLConfig({ mlWeight: 0.7 });

      expect(resolver.getMLConfig()?.mlWeight).toBe(0.7);
    });

    it('should throw error when using ML methods without configuration', async () => {
      const resolver = HaveWeMet.create<Person>()
        .schema((s) => s
          .field('firstName').type('string')
          .field('lastName').type('string')
        )
        .matching((match) =>
          match
            .field('firstName').strategy('jaro-winkler').weight(10)
            .field('lastName').strategy('jaro-winkler').weight(10)
        )
        .thresholds({ noMatch: 10, definiteMatch: 30 })
        .build();

      expect(resolver.hasML).toBe(false);

      await expect(
        resolver.resolveWithML({ id: '1', firstName: 'John', lastName: 'Doe' }, records)
      ).rejects.toThrow('ML is not configured');

      await expect(
        resolver.resolveMLOnly({ id: '1', firstName: 'John', lastName: 'Doe' }, records)
      ).rejects.toThrow('ML is not configured');

      expect(() =>
        resolver.extractMLFeatures(records[0], records[1])
      ).toThrow('ML is not configured');
    });
  });

  describe('Fallback behavior', () => {
    it('should fallback to probabilistic when ML is skipped', async () => {
      const resolver = HaveWeMet.create<Person>()
        .schema((s) => s
          .field('firstName').type('string')
          .field('lastName').type('string')
          .field('email').type('string')
        )
        .matching((match) =>
          match
            .field('firstName').strategy('jaro-winkler').weight(10)
            .field('lastName').strategy('jaro-winkler').weight(10)
            .field('email').strategy('exact').weight(15)
        )
        .thresholds({ noMatch: 10, definiteMatch: 30 })
        .build();

      const classifier = await createTrainedClassifier();
      resolver.configureML(classifier, { mode: 'hybrid', mlWeight: 0.5 });

      const candidateRecord: Person = {
        id: 'new',
        firstName: 'John',
        lastName: 'Smith',
        email: 'john@example.com',
      };

      const results = await resolver.resolveWithML(candidateRecord, records, {
        skipML: true,
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results.every((r) => !r.mlUsed)).toBe(true);
    });

    it('should use fallback mode for uncertain results only', async () => {
      // Set thresholds to create a mix of outcomes
      const resolver = HaveWeMet.create<Person>()
        .schema((s) => s
          .field('firstName').type('string')
          .field('lastName').type('string')
          .field('email').type('string')
        )
        .matching((match) =>
          match
            .field('firstName').strategy('jaro-winkler').weight(10)
            .field('lastName').strategy('jaro-winkler').weight(10)
            .field('email').strategy('exact').weight(15)
        )
        .thresholds({ noMatch: 5, definiteMatch: 25 })
        .build();

      const classifier = await createTrainedClassifier();
      resolver.configureML(classifier, {
        mode: 'fallback',
        applyTo: 'uncertainOnly',
      });

      // Test records designed to produce specific outcomes BEFORE ML:
      // Record 1: exact match on all fields -> definite-match (score ~35)
      // Record 2: similar names, different email -> potential-match (score ~18)
      // Record 3: completely different -> no-match (score ~0)
      const testRecords: Person[] = [
        { id: '1', firstName: 'John', lastName: 'Smith', email: 'john@example.com' },
        { id: '2', firstName: 'Jon', lastName: 'Smyth', email: 'different@example.com' },
        { id: '3', firstName: 'Alice', lastName: 'Brown', email: 'alice@other.com' },
      ];

      const candidateRecord: Person = {
        id: 'new',
        firstName: 'John',
        lastName: 'Smith',
        email: 'john@example.com',
      };

      // First get the probabilistic results to know which were originally potential matches
      const probResults = resolver.resolve(candidateRecord, testRecords);
      const originalPotentialMatches = new Set(
        probResults
          .filter((r) => r.outcome === 'potential-match')
          .map((r) => (r.candidateRecord as Person).id)
      );
      const originalDefiniteMatches = new Set(
        probResults
          .filter((r) => r.outcome === 'definite-match')
          .map((r) => (r.candidateRecord as Person).id)
      );
      const originalNoMatches = new Set(
        probResults
          .filter((r) => r.outcome === 'no-match')
          .map((r) => (r.candidateRecord as Person).id)
      );

      // Get ML-enhanced results
      const results = await resolver.resolveWithML(candidateRecord, testRecords);

      // With applyTo: 'uncertainOnly', ML should only have been applied to
      // records that were ORIGINALLY potential matches (before ML)
      results.forEach((r) => {
        const recordId = (r.candidateRecord as Person).id;

        if (originalPotentialMatches.has(recordId)) {
          // Originally potential matches should have used ML
          expect(r.mlUsed).toBe(true);
        } else if (originalDefiniteMatches.has(recordId) || originalNoMatches.has(recordId)) {
          // Originally definite matches and no-matches should NOT have used ML
          expect(r.mlUsed).toBe(false);
        }
      });

      // Verify we had some diversity in original results
      expect(originalPotentialMatches.size).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Feature extraction', () => {
    it('should extract meaningful features from record pairs', async () => {
      const resolver = HaveWeMet.create<Person>()
        .schema((s) => s
          .field('firstName').type('string')
          .field('lastName').type('string')
          .field('email').type('string')
        )
        .matching((match) =>
          match
            .field('firstName').strategy('jaro-winkler').weight(10)
            .field('lastName').strategy('jaro-winkler').weight(10)
            .field('email').strategy('exact').weight(15)
        )
        .thresholds({ noMatch: 10, definiteMatch: 30 })
        .build();

      const classifier = await createTrainedClassifier();
      resolver.configureML(classifier);

      // Exact match should have high feature values
      const exactMatchFeatures = resolver.extractMLFeatures(
        { id: '1', firstName: 'John', lastName: 'Smith', email: 'john@example.com' },
        { id: '2', firstName: 'John', lastName: 'Smith', email: 'john@example.com' }
      );

      // Find the email_exact feature
      const emailExactIndex = exactMatchFeatures.names.indexOf('email_exact');
      if (emailExactIndex >= 0) {
        expect(exactMatchFeatures.values[emailExactIndex]).toBe(1);
      }

      // Partial match should have medium feature values
      const partialMatchFeatures = resolver.extractMLFeatures(
        { id: '1', firstName: 'John', lastName: 'Smith', email: 'john@example.com' },
        { id: '2', firstName: 'Jon', lastName: 'Smyth', email: 'jon@example.com' }
      );

      // Jaro-Winkler should give high similarity for similar names
      const firstNameJWIndex = partialMatchFeatures.names.indexOf('firstName_jaroWinkler');
      if (firstNameJWIndex >= 0) {
        expect(partialMatchFeatures.values[firstNameJWIndex]).toBeGreaterThan(0.8);
      }
    });
  });

  describe('ML Result Explanation', () => {
    it('should include meaningful explanations in ML results', async () => {
      const resolver = HaveWeMet.create<Person>()
        .schema((s) => s
          .field('firstName').type('string')
          .field('lastName').type('string')
          .field('email').type('string')
        )
        .matching((match) =>
          match
            .field('firstName').strategy('jaro-winkler').weight(10)
            .field('lastName').strategy('jaro-winkler').weight(10)
            .field('email').strategy('exact').weight(15)
        )
        .thresholds({ noMatch: 10, definiteMatch: 30 })
        .build();

      const classifier = await createTrainedClassifier();
      resolver.configureML(classifier, { mode: 'hybrid', mlWeight: 0.5 });

      const results = await resolver.resolveWithML(
        { id: 'new', firstName: 'John', lastName: 'Smith', email: 'john@example.com' },
        records
      );

      expect(results[0].explanation).toBeDefined();
      expect(results[0].explanation.length).toBeGreaterThan(0);

      // Hybrid mode should mention both probabilistic and ML
      expect(results[0].explanation).toMatch(/hybrid|ml|probabilistic/i);
    });

    it('should include feature importance in ML predictions', async () => {
      const resolver = HaveWeMet.create<Person>()
        .schema((s) => s
          .field('firstName').type('string')
          .field('lastName').type('string')
          .field('email').type('string')
        )
        .matching((match) =>
          match
            .field('firstName').strategy('jaro-winkler').weight(10)
            .field('lastName').strategy('jaro-winkler').weight(10)
            .field('email').strategy('exact').weight(15)
        )
        .thresholds({ noMatch: 10, definiteMatch: 30 })
        .build();

      const classifier = await createTrainedClassifier();
      classifier.setConfig({ includeFeatureImportance: true });
      resolver.configureML(classifier, { mode: 'mlOnly' });

      const results = await resolver.resolveWithML(
        { id: 'new', firstName: 'John', lastName: 'Smith', email: 'john@example.com' },
        records
      );

      expect(results[0].mlPrediction?.featureImportance).toBeDefined();
      expect(results[0].mlPrediction?.featureImportance.length).toBeGreaterThan(0);

      // Feature importance should have meaningful values
      results[0].mlPrediction?.featureImportance.forEach((fi) => {
        expect(fi.name).toBeDefined();
        expect(typeof fi.importance).toBe('number');
        expect(typeof fi.contribution).toBe('number');
      });
    });
  });
});
