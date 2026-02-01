/**
 * Pre-trained Model Weights Unit Tests
 *
 * Tests for the pre-trained weights and default feature configurations.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

import {
  SimpleClassifier,
  isValidSimpleClassifierWeights,
} from '../../../../src/ml/builtin/simple-classifier';
import {
  DEFAULT_PERSON_FEATURE_CONFIG,
  DEFAULT_PERSON_FEATURE_NAMES,
  DEFAULT_PERSON_FEATURE_COUNT,
  MINIMAL_FEATURE_CONFIG,
  MINIMAL_FEATURE_NAMES,
  EXTENDED_FEATURE_CONFIG,
  PATIENT_FEATURE_CONFIG,
  getFeatureConfig,
  calculateFeatureCount,
  generateFeatureNames,
} from '../../../../src/ml/builtin/default-features';
import { FeatureExtractor } from '../../../../src/ml/feature-extractor';
import type { MLModelWeights } from '../../../../src/ml/model-interface';

// Load the pre-trained weights
const weightsPath = join(__dirname, '../../../../src/ml/builtin/weights.json');
const rawWeights = JSON.parse(readFileSync(weightsPath, 'utf-8'));

interface PersonRecord {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  dateOfBirth?: string;
  address?: string;
  ssn?: string;
}

describe('Pre-trained Model Weights', () => {
  describe('weights.json structure', () => {
    it('should have valid SimpleClassifier format', () => {
      expect(isValidSimpleClassifierWeights(rawWeights)).toBe(true);
    });

    it('should have correct model type', () => {
      expect(rawWeights.modelType).toBe('SimpleClassifier');
    });

    it('should have version 1.0.0', () => {
      expect(rawWeights.version).toBe('1.0.0');
    });

    it('should have weights array', () => {
      expect(Array.isArray(rawWeights.weights)).toBe(true);
      expect(rawWeights.weights.length).toBeGreaterThan(0);
    });

    it('should have numeric weights', () => {
      for (const weight of rawWeights.weights) {
        expect(typeof weight).toBe('number');
        expect(isNaN(weight)).toBe(false);
      }
    });

    it('should have numeric bias', () => {
      expect(typeof rawWeights.bias).toBe('number');
      expect(isNaN(rawWeights.bias)).toBe(false);
    });

    it('should have feature names matching weights length', () => {
      expect(rawWeights.featureNames.length).toBe(rawWeights.weights.length);
    });

    it('should have all feature names as strings', () => {
      for (const name of rawWeights.featureNames) {
        expect(typeof name).toBe('string');
        expect(name.length).toBeGreaterThan(0);
      }
    });

    it('should have extra metadata', () => {
      expect(rawWeights.extra).toBeDefined();
      expect(rawWeights.extra.trainedAt).toBeDefined();
      expect(rawWeights.extra.accuracy).toBeDefined();
    });

    it('should have accuracy >= 0.85', () => {
      expect(rawWeights.extra.accuracy).toBeGreaterThanOrEqual(0.85);
    });

    it('should be small enough for npm distribution (<50KB)', () => {
      const jsonSize = JSON.stringify(rawWeights).length;
      expect(jsonSize).toBeLessThan(50 * 1024);
    });
  });

  describe('weights alignment with default features', () => {
    it('should have weights matching DEFAULT_PERSON_FEATURE_NAMES', () => {
      expect(rawWeights.featureNames).toEqual(DEFAULT_PERSON_FEATURE_NAMES);
    });

    it('should have correct feature count', () => {
      expect(rawWeights.weights.length).toBe(DEFAULT_PERSON_FEATURE_COUNT);
    });

    it('should match feature count from config', () => {
      const count = calculateFeatureCount(DEFAULT_PERSON_FEATURE_CONFIG);
      expect(rawWeights.weights.length).toBe(count);
    });
  });

  describe('loading weights into SimpleClassifier', () => {
    let classifier: SimpleClassifier<PersonRecord>;
    let featureExtractor: FeatureExtractor<PersonRecord>;

    beforeEach(() => {
      featureExtractor = new FeatureExtractor<PersonRecord>(DEFAULT_PERSON_FEATURE_CONFIG);
      classifier = new SimpleClassifier<PersonRecord>({
        featureExtractor,
      });
    });

    it('should load weights successfully', async () => {
      await classifier.loadWeights(rawWeights as MLModelWeights);
      expect(classifier.isReady()).toBe(true);
    });

    it('should have correct weights after loading', async () => {
      await classifier.loadWeights(rawWeights as MLModelWeights);
      expect(classifier.getWeights()).toEqual(rawWeights.weights);
    });

    it('should have correct bias after loading', async () => {
      await classifier.loadWeights(rawWeights as MLModelWeights);
      expect(classifier.getBias()).toBe(rawWeights.bias);
    });

    it('should have correct metadata after loading', async () => {
      await classifier.loadWeights(rawWeights as MLModelWeights);
      const metadata = classifier.getMetadata();
      expect(metadata.featureNames).toEqual(rawWeights.featureNames);
      expect(metadata.accuracy).toBe(rawWeights.extra.accuracy);
    });
  });

  describe('pre-trained model predictions', () => {
    let classifier: SimpleClassifier<PersonRecord>;

    beforeEach(async () => {
      const featureExtractor = new FeatureExtractor<PersonRecord>(DEFAULT_PERSON_FEATURE_CONFIG);
      classifier = new SimpleClassifier<PersonRecord>({
        featureExtractor,
      });
      await classifier.loadWeights(rawWeights as MLModelWeights);
    });

    it('should predict high probability for identical records', async () => {
      const record: PersonRecord = {
        firstName: 'John',
        lastName: 'Smith',
        email: 'john.smith@example.com',
        phone: '555-123-4567',
        dateOfBirth: '1985-03-15',
        address: '123 Main St, Springfield, IL',
        ssn: '123-45-6789',
      };

      const prediction = await classifier.predict({
        record1: record,
        record2: record,
      });

      expect(prediction.probability).toBeGreaterThan(0.9);
      expect(prediction.classification).toBe('match');
    });

    it('should predict low probability for completely different records', async () => {
      const record1: PersonRecord = {
        firstName: 'John',
        lastName: 'Smith',
        email: 'john.smith@example.com',
        phone: '555-123-4567',
        dateOfBirth: '1985-03-15',
        address: '123 Main St, Springfield, IL',
        ssn: '123-45-6789',
      };

      const record2: PersonRecord = {
        firstName: 'Mary',
        lastName: 'Johnson',
        email: 'mary.j@company.com',
        phone: '555-987-6543',
        dateOfBirth: '1992-08-22',
        address: '456 Oak Ave, Clinton, TX',
        ssn: '987-65-4321',
      };

      const prediction = await classifier.predict({
        record1,
        record2,
      });

      expect(prediction.probability).toBeLessThan(0.5);
      expect(prediction.classification).toBe('nonMatch');
    });

    it('should predict intermediate probability for partial matches', async () => {
      const record1: PersonRecord = {
        firstName: 'John',
        lastName: 'Smith',
        email: 'john.smith@example.com',
        phone: '555-123-4567',
        dateOfBirth: '1985-03-15',
        address: '123 Main St, Springfield, IL',
      };

      const record2: PersonRecord = {
        firstName: 'John',
        lastName: 'Smith',
        email: 'johnsmith@gmail.com',
        phone: '555-123-4568',
        dateOfBirth: '1985-03-15',
        address: '123 Main Street, Springfield, IL',
      };

      const prediction = await classifier.predict({
        record1,
        record2,
      });

      // Should be somewhere in between
      expect(prediction.probability).toBeGreaterThan(0.3);
    });

    it('should handle missing fields gracefully', async () => {
      const record1: PersonRecord = {
        firstName: 'John',
        lastName: 'Smith',
      };

      const record2: PersonRecord = {
        firstName: 'John',
        lastName: 'Smith',
      };

      const prediction = await classifier.predict({
        record1,
        record2,
      });

      expect(prediction.probability).toBeGreaterThanOrEqual(0);
      expect(prediction.probability).toBeLessThanOrEqual(1);
      expect(['match', 'nonMatch', 'uncertain']).toContain(prediction.classification);
    });

    it('should include feature importance in predictions', async () => {
      const record1: PersonRecord = {
        firstName: 'John',
        lastName: 'Smith',
        email: 'john@test.com',
      };

      const prediction = await classifier.predict({
        record1,
        record2: record1,
      });

      expect(prediction.featureImportance.length).toBeGreaterThan(0);

      // Check that each feature importance has required fields
      for (const fi of prediction.featureImportance) {
        expect(typeof fi.name).toBe('string');
        expect(typeof fi.value).toBe('number');
        expect(typeof fi.contribution).toBe('number');
        expect(typeof fi.importance).toBe('number');
      }
    });
  });

  describe('prediction performance', () => {
    let classifier: SimpleClassifier<PersonRecord>;

    beforeEach(async () => {
      const featureExtractor = new FeatureExtractor<PersonRecord>(DEFAULT_PERSON_FEATURE_CONFIG);
      classifier = new SimpleClassifier<PersonRecord>({
        featureExtractor,
      });
      await classifier.loadWeights(rawWeights as MLModelWeights);
    });

    it('should predict within 10ms', async () => {
      const record: PersonRecord = {
        firstName: 'John',
        lastName: 'Smith',
        email: 'john@test.com',
        phone: '555-1234',
        dateOfBirth: '1985-01-01',
        address: '123 Main St',
        ssn: '123-45-6789',
      };

      const start = performance.now();
      await classifier.predict({ record1: record, record2: record });
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(10);
    });

    it('should batch predict 100 pairs within 100ms', async () => {
      const pairs = Array.from({ length: 100 }, (_, i) => ({
        record1: {
          firstName: `First${i}`,
          lastName: `Last${i}`,
          email: `test${i}@example.com`,
        },
        record2: {
          firstName: `First${i}`,
          lastName: `Last${i}`,
          email: `test${i}@example.com`,
        },
      }));

      const start = performance.now();
      await classifier.predictBatch(pairs);
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(100);
    });
  });
});

describe('Default Feature Configurations', () => {
  describe('DEFAULT_PERSON_FEATURE_CONFIG', () => {
    it('should have expected fields', () => {
      const fieldNames = DEFAULT_PERSON_FEATURE_CONFIG.fields.map((f) => f.field);
      expect(fieldNames).toContain('firstName');
      expect(fieldNames).toContain('lastName');
      expect(fieldNames).toContain('email');
      expect(fieldNames).toContain('phone');
      expect(fieldNames).toContain('dateOfBirth');
      expect(fieldNames).toContain('address');
      expect(fieldNames).toContain('ssn');
    });

    it('should have normalize enabled', () => {
      expect(DEFAULT_PERSON_FEATURE_CONFIG.normalize).toBe(true);
    });

    it('should have correct feature count', () => {
      expect(calculateFeatureCount(DEFAULT_PERSON_FEATURE_CONFIG)).toBe(
        DEFAULT_PERSON_FEATURE_COUNT
      );
    });

    it('should generate correct feature names', () => {
      const names = generateFeatureNames(DEFAULT_PERSON_FEATURE_CONFIG);
      expect(names).toEqual(DEFAULT_PERSON_FEATURE_NAMES);
    });
  });

  describe('MINIMAL_FEATURE_CONFIG', () => {
    it('should have only basic fields', () => {
      const fieldNames = MINIMAL_FEATURE_CONFIG.fields.map((f) => f.field);
      expect(fieldNames).toEqual(['firstName', 'lastName', 'email']);
    });

    it('should generate correct feature names', () => {
      const names = generateFeatureNames(MINIMAL_FEATURE_CONFIG);
      expect(names).toEqual(MINIMAL_FEATURE_NAMES);
    });
  });

  describe('EXTENDED_FEATURE_CONFIG', () => {
    it('should have more fields than default', () => {
      expect(EXTENDED_FEATURE_CONFIG.fields.length).toBeGreaterThan(
        DEFAULT_PERSON_FEATURE_CONFIG.fields.length
      );
    });

    it('should include additional identity fields', () => {
      const fieldNames = EXTENDED_FEATURE_CONFIG.fields.map((f) => f.field);
      expect(fieldNames).toContain('middleName');
      expect(fieldNames).toContain('suffix');
      expect(fieldNames).toContain('city');
      expect(fieldNames).toContain('state');
      expect(fieldNames).toContain('zipCode');
      expect(fieldNames).toContain('driverLicense');
    });
  });

  describe('PATIENT_FEATURE_CONFIG', () => {
    it('should include healthcare-specific fields', () => {
      const fieldNames = PATIENT_FEATURE_CONFIG.fields.map((f) => f.field);
      expect(fieldNames).toContain('mrn');
      expect(fieldNames).toContain('gender');
    });

    it('should have high weight for dateOfBirth', () => {
      const dobField = PATIENT_FEATURE_CONFIG.fields.find((f) => f.field === 'dateOfBirth');
      expect(dobField).toBeDefined();
      expect(dobField!.weight).toBeGreaterThanOrEqual(2.0);
    });

    it('should have high weight for MRN', () => {
      const mrnField = PATIENT_FEATURE_CONFIG.fields.find((f) => f.field === 'mrn');
      expect(mrnField).toBeDefined();
      expect(mrnField!.weight).toBeGreaterThanOrEqual(2.0);
    });
  });

  describe('getFeatureConfig', () => {
    it('should return correct config for "person"', () => {
      expect(getFeatureConfig('person')).toBe(DEFAULT_PERSON_FEATURE_CONFIG);
    });

    it('should return correct config for "minimal"', () => {
      expect(getFeatureConfig('minimal')).toBe(MINIMAL_FEATURE_CONFIG);
    });

    it('should return correct config for "extended"', () => {
      expect(getFeatureConfig('extended')).toBe(EXTENDED_FEATURE_CONFIG);
    });

    it('should return correct config for "patient"', () => {
      expect(getFeatureConfig('patient')).toBe(PATIENT_FEATURE_CONFIG);
    });
  });

  describe('calculateFeatureCount', () => {
    it('should count extractors plus missing indicators', () => {
      const simpleConfig = {
        fields: [
          { field: 'test', extractors: ['exact' as const], includeMissingIndicator: true },
        ],
        normalize: true,
      };
      expect(calculateFeatureCount(simpleConfig)).toBe(2); // 1 extractor + 1 missing
    });

    it('should respect includeMissingIndicator: false', () => {
      const simpleConfig = {
        fields: [
          { field: 'test', extractors: ['exact' as const], includeMissingIndicator: false },
        ],
        normalize: true,
      };
      expect(calculateFeatureCount(simpleConfig)).toBe(1); // 1 extractor only
    });

    it('should calculate correctly for default person config', () => {
      // 7 fields with varying extractors
      // firstName: 3 extractors + 1 missing = 4
      // lastName: 3 extractors + 1 missing = 4
      // email: 2 extractors + 1 missing = 3
      // phone: 2 extractors + 1 missing = 3
      // dateOfBirth: 2 extractors + 1 missing = 3
      // address: 2 extractors + 1 missing = 3
      // ssn: 1 extractor + 1 missing = 2
      // Total: 4+4+3+3+3+3+2 = 22
      expect(calculateFeatureCount(DEFAULT_PERSON_FEATURE_CONFIG)).toBe(22);
      expect(DEFAULT_PERSON_FEATURE_COUNT).toBe(22);
    });
  });

  describe('generateFeatureNames', () => {
    it('should generate names in correct order', () => {
      const config = {
        fields: [
          { field: 'a', extractors: ['exact' as const, 'jaroWinkler' as const] },
          { field: 'b', extractors: ['exact' as const] },
        ],
        normalize: true,
      };

      const names = generateFeatureNames(config);
      expect(names).toEqual([
        'a_exact',
        'a_jaroWinkler',
        'a_missing',
        'b_exact',
        'b_missing',
      ]);
    });

    it('should handle config without missing indicators', () => {
      const config = {
        fields: [
          {
            field: 'test',
            extractors: ['exact' as const],
            includeMissingIndicator: false,
          },
        ],
        normalize: true,
      };

      const names = generateFeatureNames(config);
      expect(names).toEqual(['test_exact']);
    });
  });
});

describe('FeatureExtractor integration with pre-trained weights', () => {
  it('should produce compatible features for SimpleClassifier', async () => {
    const extractor = new FeatureExtractor<PersonRecord>(DEFAULT_PERSON_FEATURE_CONFIG);
    const featureNames = extractor.getFeatureNames();

    // Feature names should match the pre-trained weights
    expect(featureNames).toEqual(rawWeights.featureNames);
  });

  it('should produce correct number of features', () => {
    const extractor = new FeatureExtractor<PersonRecord>(DEFAULT_PERSON_FEATURE_CONFIG);
    expect(extractor.getFeatureCount()).toBe(rawWeights.weights.length);
  });

  it('should extract features that work with the classifier', async () => {
    const extractor = new FeatureExtractor<PersonRecord>(DEFAULT_PERSON_FEATURE_CONFIG);
    const classifier = new SimpleClassifier<PersonRecord>({ featureExtractor: extractor });
    await classifier.loadWeights(rawWeights as MLModelWeights);

    const features = extractor.extract({
      record1: { firstName: 'John', lastName: 'Doe' },
      record2: { firstName: 'John', lastName: 'Doe' },
    });

    // Should be able to predict from these features
    const prediction = classifier.predictFromFeatures(features);
    expect(prediction.probability).toBeGreaterThanOrEqual(0);
    expect(prediction.probability).toBeLessThanOrEqual(1);
  });
});
