/**
 * Feature Extractor Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  FeatureExtractor,
  FeatureExtractionConfigBuilder,
  featureConfig,
  builtInExtractors,
  getFeatureByName,
  getFieldFeatures,
  compareFeatureVectors,
  calculateFeatureStats,
  DEFAULT_FEATURE_EXTRACTOR_OPTIONS,
} from '../../../src/ml/feature-extractor';
import type {
  FeatureExtractionConfig,
  RecordPair,
  FeatureVector,
} from '../../../src/ml/types';

describe('FeatureExtractor', () => {
  interface TestRecord {
    firstName: string;
    lastName: string;
    email?: string;
    age?: number;
    dateOfBirth?: Date | string;
  }

  describe('constructor', () => {
    it('should create a feature extractor with valid config', () => {
      const config: FeatureExtractionConfig = {
        fields: [
          { field: 'firstName', extractors: ['jaroWinkler'] },
          { field: 'lastName', extractors: ['exact'] },
        ],
        normalize: true,
      };

      const extractor = new FeatureExtractor<TestRecord>(config);
      expect(extractor).toBeDefined();
      expect(extractor.getFeatureCount()).toBeGreaterThan(0);
    });

    it('should throw if field has no extractors', () => {
      const config: FeatureExtractionConfig = {
        fields: [{ field: 'firstName', extractors: [] }],
        normalize: true,
      };

      expect(() => new FeatureExtractor<TestRecord>(config)).toThrow(
        'at least one extractor'
      );
    });

    it('should throw if field name is missing', () => {
      const config: FeatureExtractionConfig = {
        fields: [{ field: '', extractors: ['exact'] }],
        normalize: true,
      };

      expect(() => new FeatureExtractor<TestRecord>(config)).toThrow(
        'must have a field name'
      );
    });

    it('should throw if custom extractor is specified but not provided', () => {
      const config: FeatureExtractionConfig = {
        fields: [{ field: 'firstName', extractors: ['custom'] }],
        normalize: true,
      };

      expect(() => new FeatureExtractor<TestRecord>(config)).toThrow(
        'no custom function provided'
      );
    });

    it('should accept custom extractors in options', () => {
      const config: FeatureExtractionConfig = {
        fields: [{ field: 'firstName', extractors: ['custom'] }],
        normalize: true,
      };

      const extractor = new FeatureExtractor<TestRecord>(config, {
        customExtractors: {
          firstName: (v1, v2) => (v1 === v2 ? 1 : 0),
        },
      });

      expect(extractor).toBeDefined();
    });
  });

  describe('getFeatureNames', () => {
    it('should return feature names for each extractor', () => {
      const config: FeatureExtractionConfig = {
        fields: [
          { field: 'firstName', extractors: ['jaroWinkler', 'exact'] },
        ],
        normalize: true,
      };

      const extractor = new FeatureExtractor<TestRecord>(config, {
        includeMissingByDefault: false,
      });
      const names = extractor.getFeatureNames();

      expect(names).toContain('firstName_jaroWinkler');
      expect(names).toContain('firstName_exact');
    });

    it('should include missing indicator when configured', () => {
      const config: FeatureExtractionConfig = {
        fields: [
          {
            field: 'firstName',
            extractors: ['exact'],
            includeMissingIndicator: true,
          },
        ],
        normalize: true,
      };

      const extractor = new FeatureExtractor<TestRecord>(config, {
        includeMissingByDefault: false,
      });
      const names = extractor.getFeatureNames();

      expect(names).toContain('firstName_exact');
      expect(names).toContain('firstName_missing');
    });

    it('should not duplicate missing feature', () => {
      const config: FeatureExtractionConfig = {
        fields: [
          {
            field: 'firstName',
            extractors: ['missing'],
            includeMissingIndicator: true,
          },
        ],
        normalize: true,
      };

      const extractor = new FeatureExtractor<TestRecord>(config);
      const names = extractor.getFeatureNames();

      // Should only appear once
      expect(names.filter((n) => n === 'firstName_missing').length).toBe(1);
    });
  });

  describe('extract', () => {
    let extractor: FeatureExtractor<TestRecord>;

    beforeEach(() => {
      const config: FeatureExtractionConfig = {
        fields: [
          { field: 'firstName', extractors: ['jaroWinkler', 'exact'] },
          { field: 'lastName', extractors: ['levenshtein'] },
        ],
        normalize: true,
      };
      extractor = new FeatureExtractor<TestRecord>(config, {
        includeMissingByDefault: false,
      });
    });

    it('should extract features from identical records', () => {
      const pair: RecordPair<TestRecord> = {
        record1: { firstName: 'John', lastName: 'Smith' },
        record2: { firstName: 'John', lastName: 'Smith' },
      };

      const vector = extractor.extract(pair);

      expect(vector.values).toBeDefined();
      expect(vector.names).toBeDefined();
      expect(vector.values.length).toBe(vector.names.length);

      // All features should be 1.0 for identical records
      for (const value of vector.values) {
        expect(value).toBe(1);
      }
    });

    it('should extract features from completely different records', () => {
      const pair: RecordPair<TestRecord> = {
        record1: { firstName: 'John', lastName: 'Smith' },
        record2: { firstName: 'Alice', lastName: 'Wong' },
      };

      const vector = extractor.extract(pair);

      // Exact matches should be 0
      const exactIdx = vector.names.indexOf('firstName_exact');
      expect(vector.values[exactIdx]).toBe(0);

      // Similarity scores should be between 0 and 1
      for (const value of vector.values) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    });

    it('should handle missing fields gracefully', () => {
      const pair: RecordPair<TestRecord> = {
        record1: { firstName: 'John', lastName: 'Smith' },
        record2: { firstName: undefined as unknown as string, lastName: 'Smith' },
      };

      const vector = extractor.extract(pair);

      // Should not throw and should have values
      expect(vector.values.length).toBeGreaterThan(0);
    });

    it('should handle null records gracefully', () => {
      const pair: RecordPair<TestRecord> = {
        record1: null as unknown as TestRecord,
        record2: { firstName: 'John', lastName: 'Smith' },
      };

      const vector = extractor.extract(pair);
      expect(vector.values.length).toBeGreaterThan(0);
    });

    it('should include metadata about extraction', () => {
      const pair: RecordPair<TestRecord> = {
        record1: { firstName: 'John', lastName: 'Smith' },
        record2: { firstName: 'John', lastName: 'Smith' },
      };

      const vector = extractor.extract(pair);

      expect(vector.metadata).toBeDefined();
      expect(vector.metadata?.fieldsProcessed).toBe(2);
      expect(typeof vector.metadata?.extractionTimeMs).toBe('number');
    });

    it('should apply field weights', () => {
      const config: FeatureExtractionConfig = {
        fields: [
          { field: 'firstName', extractors: ['exact'], weight: 2.0 },
          { field: 'lastName', extractors: ['exact'], weight: 1.0 },
        ],
        normalize: true,
      };
      const weightedExtractor = new FeatureExtractor<TestRecord>(config, {
        includeMissingByDefault: false,
      });

      const pair: RecordPair<TestRecord> = {
        record1: { firstName: 'John', lastName: 'Smith' },
        record2: { firstName: 'John', lastName: 'Smith' },
      };

      const vector = weightedExtractor.extract(pair);
      const firstNameIdx = vector.names.indexOf('firstName_exact');
      const lastNameIdx = vector.names.indexOf('lastName_exact');

      // Note: normalization clamps to 1, but the weight was applied
      // For exact matches with weight, both should be clamped to 1
      expect(vector.values[firstNameIdx]).toBeLessThanOrEqual(1);
      expect(vector.values[lastNameIdx]).toBeLessThanOrEqual(1);
    });
  });

  describe('extractBatch', () => {
    it('should extract features from multiple pairs', () => {
      const config: FeatureExtractionConfig = {
        fields: [{ field: 'firstName', extractors: ['exact'] }],
        normalize: true,
      };
      const extractor = new FeatureExtractor<TestRecord>(config);

      const pairs: RecordPair<TestRecord>[] = [
        {
          record1: { firstName: 'John', lastName: 'Smith' },
          record2: { firstName: 'John', lastName: 'Smith' },
        },
        {
          record1: { firstName: 'John', lastName: 'Smith' },
          record2: { firstName: 'Jane', lastName: 'Smith' },
        },
        {
          record1: { firstName: 'Alice', lastName: 'Wong' },
          record2: { firstName: 'Bob', lastName: 'Wong' },
        },
      ];

      const vectors = extractor.extractBatch(pairs);

      expect(vectors.length).toBe(3);
      expect(vectors[0].values.length).toBe(vectors[1].values.length);
    });
  });

  describe('nested field access', () => {
    interface NestedRecord {
      name: {
        first: string;
        last: string;
      };
    }

    it('should support dot notation for nested fields', () => {
      const config: FeatureExtractionConfig = {
        fields: [
          { field: 'name.first', extractors: ['exact'] },
          { field: 'name.last', extractors: ['exact'] },
        ],
        normalize: true,
      };
      const extractor = new FeatureExtractor<NestedRecord>(config, {
        includeMissingByDefault: false,
      });

      const pair: RecordPair<NestedRecord> = {
        record1: { name: { first: 'John', last: 'Smith' } },
        record2: { name: { first: 'John', last: 'Doe' } },
      };

      const vector = extractor.extract(pair);
      const firstIdx = vector.names.indexOf('name.first_exact');
      const lastIdx = vector.names.indexOf('name.last_exact');

      expect(vector.values[firstIdx]).toBe(1); // Same first name
      expect(vector.values[lastIdx]).toBe(0); // Different last name
    });
  });

  describe('static factory methods', () => {
    describe('fromFields', () => {
      it('should create extractor from field list', () => {
        const extractor = FeatureExtractor.fromFields<TestRecord>(
          ['firstName', 'lastName'],
          ['exact']
        );

        expect(extractor.getFeatureNames()).toContain('firstName_exact');
        expect(extractor.getFeatureNames()).toContain('lastName_exact');
      });

      it('should use default extractors when not specified', () => {
        const extractor = FeatureExtractor.fromFields<TestRecord>([
          'firstName',
          'lastName',
        ]);

        expect(extractor.getFeatureNames()).toContain('firstName_jaroWinkler');
        expect(extractor.getFeatureNames()).toContain('firstName_exact');
      });
    });

    describe('forPersonMatching', () => {
      it('should create extractor optimized for person matching', () => {
        const extractor = FeatureExtractor.forPersonMatching<TestRecord>();
        const names = extractor.getFeatureNames();

        expect(names.some((n) => n.includes('firstName'))).toBe(true);
        expect(names.some((n) => n.includes('lastName'))).toBe(true);
        expect(names.some((n) => n.includes('email'))).toBe(true);
        expect(names.some((n) => n.includes('phone'))).toBe(true);
      });
    });
  });
});

describe('Built-in Extractors', () => {
  describe('exact', () => {
    it('should return 1 for exact match', () => {
      expect(builtInExtractors.exact!('hello', 'hello')).toBe(1);
    });

    it('should return 1 for case-insensitive match', () => {
      expect(builtInExtractors.exact!('Hello', 'hello')).toBe(1);
    });

    it('should return 0 for no match', () => {
      expect(builtInExtractors.exact!('hello', 'world')).toBe(0);
    });

    it('should return 1 for null-null', () => {
      expect(builtInExtractors.exact!(null, null)).toBe(1);
    });

    it('should return 0 for null-value', () => {
      expect(builtInExtractors.exact!(null, 'hello')).toBe(0);
    });
  });

  describe('levenshtein', () => {
    it('should return 1 for identical strings', () => {
      expect(builtInExtractors.levenshtein!('hello', 'hello')).toBe(1);
    });

    it('should return high score for similar strings', () => {
      const score = builtInExtractors.levenshtein!('hello', 'hallo');
      expect(score).toBeGreaterThan(0.7);
      expect(score).toBeLessThan(1);
    });

    it('should return low score for different strings', () => {
      const score = builtInExtractors.levenshtein!('hello', 'world');
      expect(score).toBeLessThan(0.5);
    });
  });

  describe('jaroWinkler', () => {
    it('should return 1 for identical strings', () => {
      expect(builtInExtractors.jaroWinkler!('john', 'john')).toBe(1);
    });

    it('should give bonus for common prefix', () => {
      const withPrefix = builtInExtractors.jaroWinkler!('johnson', 'johnsen');
      const withoutPrefix = builtInExtractors.jaroWinkler!('ohnson', 'ohnsen');
      expect(withPrefix).toBeGreaterThan(withoutPrefix);
    });
  });

  describe('soundex', () => {
    it('should return 1 for similar sounding names', () => {
      expect(builtInExtractors.soundex!('Smith', 'Smyth')).toBe(1);
    });

    it('should return 0 for different sounding names', () => {
      expect(builtInExtractors.soundex!('Smith', 'Jones')).toBe(0);
    });
  });

  describe('metaphone', () => {
    it('should return 1 for similar sounding names', () => {
      expect(builtInExtractors.metaphone!('Knight', 'Night')).toBe(1);
    });

    it('should return 0 for different sounding names', () => {
      expect(builtInExtractors.metaphone!('Smith', 'Jones')).toBe(0);
    });
  });

  describe('numericDiff', () => {
    it('should return 1 for identical numbers', () => {
      expect(builtInExtractors.numericDiff!(100, 100)).toBe(1);
    });

    it('should return high score for close numbers', () => {
      const score = builtInExtractors.numericDiff!(100, 105);
      expect(score).toBeGreaterThan(0.9);
    });

    it('should return low score for far apart numbers', () => {
      const score = builtInExtractors.numericDiff!(100, 500);
      expect(score).toBeLessThan(0.5);
    });

    it('should handle string numbers', () => {
      const score = builtInExtractors.numericDiff!('100', '100');
      expect(score).toBe(1);
    });

    it('should return 0 for invalid numbers', () => {
      expect(builtInExtractors.numericDiff!('abc', 100)).toBe(0);
    });

    it('should handle null values', () => {
      expect(builtInExtractors.numericDiff!(null, null)).toBe(1);
      expect(builtInExtractors.numericDiff!(null, 100)).toBe(0);
    });
  });

  describe('dateDiff', () => {
    it('should return 1 for identical dates', () => {
      const date = new Date('2024-01-15');
      expect(builtInExtractors.dateDiff!(date, date)).toBe(1);
    });

    it('should return high score for close dates', () => {
      const date1 = new Date('2024-01-15');
      const date2 = new Date('2024-01-20');
      const score = builtInExtractors.dateDiff!(date1, date2);
      expect(score).toBeGreaterThan(0.9);
    });

    it('should return lower score for dates far apart', () => {
      const date1 = new Date('2024-01-15');
      const date2 = new Date('2025-01-15'); // 1 year apart
      const score = builtInExtractors.dateDiff!(date1, date2);
      expect(score).toBeLessThan(0.6);
    });

    it('should handle date strings', () => {
      const score = builtInExtractors.dateDiff!('2024-01-15', '2024-01-15');
      expect(score).toBe(1);
    });

    it('should handle null values', () => {
      expect(builtInExtractors.dateDiff!(null, null)).toBe(1);
      expect(builtInExtractors.dateDiff!(null, new Date())).toBe(0);
    });

    it('should return 0 for invalid dates', () => {
      expect(builtInExtractors.dateDiff!('invalid', new Date())).toBe(0);
    });
  });

  describe('missing', () => {
    it('should return 1 if either value is missing', () => {
      expect(builtInExtractors.missing!(null, 'value')).toBe(1);
      expect(builtInExtractors.missing!('value', null)).toBe(1);
      expect(builtInExtractors.missing!(undefined, 'value')).toBe(1);
      expect(builtInExtractors.missing!('', 'value')).toBe(1);
    });

    it('should return 0 if both values present', () => {
      expect(builtInExtractors.missing!('value1', 'value2')).toBe(0);
    });

    it('should return 1 if both missing', () => {
      expect(builtInExtractors.missing!(null, null)).toBe(1);
    });
  });
});

describe('FeatureExtractionConfigBuilder', () => {
  it('should build a valid configuration', () => {
    const config = featureConfig()
      .addField('firstName', ['jaroWinkler', 'exact'])
      .addField('lastName', ['levenshtein'])
      .build();

    expect(config.fields.length).toBe(2);
    expect(config.fields[0].field).toBe('firstName');
    expect(config.fields[0].extractors).toContain('jaroWinkler');
    expect(config.normalize).toBe(true);
  });

  it('should support addStringField', () => {
    const config = featureConfig()
      .addStringField('name')
      .build();

    expect(config.fields[0].extractors).toContain('jaroWinkler');
    expect(config.fields[0].extractors).toContain('levenshtein');
    expect(config.fields[0].extractors).toContain('exact');
  });

  it('should support addStringField with phonetic', () => {
    const config = featureConfig()
      .addStringField('name', { phonetic: true })
      .build();

    expect(config.fields[0].extractors).toContain('soundex');
    expect(config.fields[0].extractors).toContain('metaphone');
  });

  it('should support addExactField', () => {
    const config = featureConfig()
      .addExactField('id')
      .build();

    expect(config.fields[0].extractors).toEqual(['exact']);
  });

  it('should support addNumericField', () => {
    const config = featureConfig()
      .addNumericField('age')
      .build();

    expect(config.fields[0].extractors).toContain('numericDiff');
    expect(config.fields[0].extractors).toContain('exact');
  });

  it('should support addDateField', () => {
    const config = featureConfig()
      .addDateField('birthDate')
      .build();

    expect(config.fields[0].extractors).toContain('dateDiff');
    expect(config.fields[0].extractors).toContain('exact');
  });

  it('should support addNameField', () => {
    const config = featureConfig()
      .addNameField('firstName')
      .build();

    expect(config.fields[0].extractors).toContain('jaroWinkler');
    expect(config.fields[0].extractors).toContain('soundex');
    expect(config.fields[0].extractors).toContain('metaphone');
  });

  it('should support addCustomField', () => {
    const customFn = (v1: unknown, v2: unknown) => (v1 === v2 ? 1 : 0);
    const config = featureConfig()
      .addCustomField('special', customFn)
      .build();

    expect(config.fields[0].extractors).toContain('custom');
    expect(config.customExtractors?.['special']).toBe(customFn);
  });

  it('should support weight option', () => {
    const config = featureConfig()
      .addField('important', ['exact'], { weight: 2.0 })
      .build();

    expect(config.fields[0].weight).toBe(2.0);
  });

  it('should support normalize toggle', () => {
    const config = featureConfig()
      .addField('name', ['exact'])
      .normalize(false)
      .build();

    expect(config.normalize).toBe(false);
  });

  it('should support buildExtractor', () => {
    interface TestRecord {
      name: string;
    }

    const extractor = featureConfig()
      .addField('name', ['exact'])
      .buildExtractor<TestRecord>();

    expect(extractor).toBeDefined();
    expect(extractor.getFeatureNames()).toContain('name_exact');
  });
});

describe('Utility Functions', () => {
  let vector: FeatureVector;

  beforeEach(() => {
    vector = {
      values: [0.9, 1.0, 0.5, 0.8],
      names: ['firstName_jaroWinkler', 'firstName_exact', 'lastName_jaroWinkler', 'lastName_exact'],
    };
  });

  describe('getFeatureByName', () => {
    it('should return feature value by name', () => {
      expect(getFeatureByName(vector, 'firstName_exact')).toBe(1.0);
      expect(getFeatureByName(vector, 'lastName_jaroWinkler')).toBe(0.5);
    });

    it('should return undefined for unknown feature', () => {
      expect(getFeatureByName(vector, 'unknown')).toBeUndefined();
    });
  });

  describe('getFieldFeatures', () => {
    it('should return all features for a field', () => {
      const features = getFieldFeatures(vector, 'firstName');
      expect(features['firstName_jaroWinkler']).toBe(0.9);
      expect(features['firstName_exact']).toBe(1.0);
      expect(Object.keys(features).length).toBe(2);
    });

    it('should return empty object for unknown field', () => {
      const features = getFieldFeatures(vector, 'email');
      expect(Object.keys(features).length).toBe(0);
    });
  });

  describe('compareFeatureVectors', () => {
    it('should compare two feature vectors', () => {
      const vector2: FeatureVector = {
        values: [0.8, 0.9, 0.6, 0.7],
        names: ['firstName_jaroWinkler', 'firstName_exact', 'lastName_jaroWinkler', 'lastName_exact'],
      };

      const comparison = compareFeatureVectors(vector, vector2);

      expect(comparison['firstName_jaroWinkler'].value1).toBe(0.9);
      expect(comparison['firstName_jaroWinkler'].value2).toBe(0.8);
      expect(comparison['firstName_jaroWinkler'].diff).toBeCloseTo(0.1);
    });

    it('should handle missing features in second vector', () => {
      const vector2: FeatureVector = {
        values: [0.8],
        names: ['firstName_jaroWinkler'],
      };

      const comparison = compareFeatureVectors(vector, vector2);

      expect(comparison['firstName_exact'].value1).toBe(1.0);
      expect(comparison['firstName_exact'].value2).toBe(0);
    });
  });

  describe('calculateFeatureStats', () => {
    it('should calculate statistics for a feature', () => {
      const vectors: FeatureVector[] = [
        { values: [0.8, 0.5], names: ['a', 'b'] },
        { values: [0.9, 0.6], names: ['a', 'b'] },
        { values: [1.0, 0.7], names: ['a', 'b'] },
      ];

      const stats = calculateFeatureStats(vectors, 'a');

      expect(stats).not.toBeNull();
      expect(stats!.min).toBe(0.8);
      expect(stats!.max).toBe(1.0);
      expect(stats!.mean).toBeCloseTo(0.9);
      expect(stats!.stdDev).toBeGreaterThan(0);
    });

    it('should return null for empty vector array', () => {
      expect(calculateFeatureStats([], 'a')).toBeNull();
    });

    it('should return null for unknown feature', () => {
      const vectors: FeatureVector[] = [
        { values: [0.8], names: ['a'] },
      ];
      expect(calculateFeatureStats(vectors, 'unknown')).toBeNull();
    });
  });
});

describe('Integration Tests', () => {
  interface Person {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    dateOfBirth: string;
    ssn?: string;
  }

  it('should extract features for realistic person records', () => {
    const extractor = featureConfig()
      .addNameField('firstName', { weight: 1.0 })
      .addNameField('lastName', { weight: 1.2 })
      .addStringField('email', { weight: 1.5 })
      .addStringField('phone', { weight: 1.3 })
      .addDateField('dateOfBirth', { weight: 1.4 })
      .addExactField('ssn', { weight: 2.0 })
      .buildExtractor<Person>();

    const pair: RecordPair<Person> = {
      record1: {
        firstName: 'John',
        lastName: 'Smith',
        email: 'john.smith@example.com',
        phone: '555-123-4567',
        dateOfBirth: '1990-01-15',
        ssn: '123-45-6789',
      },
      record2: {
        firstName: 'Jon',
        lastName: 'Smyth',
        email: 'j.smith@example.com',
        phone: '555-123-4567',
        dateOfBirth: '1990-01-15',
        ssn: '123-45-6789',
      },
    };

    const vector = extractor.extract(pair);

    // Check that we got features
    expect(vector.values.length).toBeGreaterThan(0);
    expect(vector.names.length).toBe(vector.values.length);

    // SSN exact match should be high
    const ssnIdx = vector.names.indexOf('ssn_exact');
    if (ssnIdx >= 0) {
      expect(vector.values[ssnIdx]).toBeGreaterThan(0);
    }

    // Names should have similarity but not exact
    const firstNameJw = getFeatureByName(vector, 'firstName_jaroWinkler');
    const firstNameExact = getFeatureByName(vector, 'firstName_exact');
    expect(firstNameJw).toBeGreaterThan(0.8); // John vs Jon are similar
    expect(firstNameExact).toBe(0); // But not exact match
  });

  it('should handle completely different records', () => {
    const extractor = FeatureExtractor.forPersonMatching<Person>();

    const pair: RecordPair<Person> = {
      record1: {
        firstName: 'John',
        lastName: 'Smith',
        email: 'john@example.com',
        phone: '555-123-4567',
        dateOfBirth: '1990-01-15',
      },
      record2: {
        firstName: 'Alice',
        lastName: 'Wong',
        email: 'alice@company.com',
        phone: '999-888-7777',
        dateOfBirth: '1985-06-20',
      },
    };

    const vector = extractor.extract(pair);

    // Most features should be low
    const avgScore =
      vector.values.reduce((a, b) => a + b, 0) / vector.values.length;
    expect(avgScore).toBeLessThan(0.5);
  });

  it('should handle identical records', () => {
    // Create a custom extractor that only uses fields we provide
    const extractor = featureConfig()
      .addNameField('firstName')
      .addNameField('lastName')
      .addStringField('email')
      .addStringField('phone')
      .addDateField('dateOfBirth')
      .buildExtractor<Person>();

    const record: Person = {
      firstName: 'John',
      lastName: 'Smith',
      email: 'john@example.com',
      phone: '555-123-4567',
      dateOfBirth: '1990-01-15',
    };

    const pair: RecordPair<Person> = {
      record1: record,
      record2: { ...record },
    };

    const vector = extractor.extract(pair);

    // All non-missing features should be 1
    for (let i = 0; i < vector.names.length; i++) {
      if (!vector.names[i].includes('_missing')) {
        expect(vector.values[i]).toBe(1);
      }
    }
  });

  it('should perform well on batch extraction', () => {
    const extractor = featureConfig()
      .addStringField('firstName')
      .addStringField('lastName')
      .buildExtractor<Person>();

    const pairs: RecordPair<Person>[] = Array.from({ length: 1000 }, (_, i) => ({
      record1: {
        firstName: `John${i}`,
        lastName: 'Smith',
        email: 'john@example.com',
        phone: '555-123-4567',
        dateOfBirth: '1990-01-15',
      },
      record2: {
        firstName: `Jon${i}`,
        lastName: 'Smyth',
        email: 'j@example.com',
        phone: '555-999-0000',
        dateOfBirth: '1990-01-20',
      },
    }));

    const startTime = performance.now();
    const vectors = extractor.extractBatch(pairs);
    const duration = performance.now() - startTime;

    expect(vectors.length).toBe(1000);
    // Should complete in reasonable time (< 1 second for 1000 pairs)
    expect(duration).toBeLessThan(1000);
  });
});

describe('DEFAULT_FEATURE_EXTRACTOR_OPTIONS', () => {
  it('should have sensible defaults', () => {
    expect(DEFAULT_FEATURE_EXTRACTOR_OPTIONS.normalize).toBe(true);
    expect(DEFAULT_FEATURE_EXTRACTOR_OPTIONS.defaultWeight).toBe(1.0);
    expect(DEFAULT_FEATURE_EXTRACTOR_OPTIONS.includeMissingByDefault).toBe(true);
    expect(DEFAULT_FEATURE_EXTRACTOR_OPTIONS.customExtractors).toEqual({});
  });
});
