import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  MLBuilder,
  FieldFeatureBuilder,
  mlBuilder,
  createModelFromConfig,
  validateMLBuilderConfig,
  type MLBuilderConfig,
} from '../../../../src/ml/integration/builder-integration';
import type { MLModel } from '../../../../src/ml/model-interface';
import { SimpleClassifier } from '../../../../src/ml/builtin/simple-classifier';

describe('MLBuilder', () => {
  describe('basic configuration', () => {
    it('creates default configuration', () => {
      const config = mlBuilder().build();

      expect(config.usePretrained).toBe(false);
      expect(config.model).toBeUndefined();
      expect(config.integrationConfig.mode).toBe('hybrid');
      expect(config.integrationConfig.mlWeight).toBe(0.5);
      expect(config.integrationConfig.applyTo).toBe('all');
      expect(config.integrationConfig.timeoutMs).toBe(5000);
      expect(config.integrationConfig.fallbackOnError).toBe(true);
    });

    it('configures usePretrained', () => {
      const config = mlBuilder().usePretrained().build();

      expect(config.usePretrained).toBe(true);
      expect(config.model).toBeUndefined();
    });

    it('configures custom model', () => {
      const mockModel = {
        isReady: () => true,
        predict: vi.fn(),
        predictBatch: vi.fn(),
        extractFeatures: vi.fn(),
        getMetadata: vi.fn(),
        getConfig: vi.fn(),
        setConfig: vi.fn(),
        loadWeights: vi.fn(),
        exportWeights: vi.fn(),
      } as unknown as MLModel<Record<string, unknown>>;

      const config = mlBuilder().model(mockModel).build();

      expect(config.model).toBe(mockModel);
      expect(config.usePretrained).toBe(false);
    });

    it('custom model overrides usePretrained', () => {
      const mockModel = {
        isReady: () => true,
      } as unknown as MLModel<Record<string, unknown>>;

      const config = mlBuilder()
        .usePretrained()
        .model(mockModel)
        .build();

      expect(config.model).toBe(mockModel);
      expect(config.usePretrained).toBe(false);
    });
  });

  describe('integration mode configuration', () => {
    it('configures mode', () => {
      const hybrid = mlBuilder().mode('hybrid').build();
      const mlOnly = mlBuilder().mode('mlOnly').build();
      const fallback = mlBuilder().mode('fallback').build();

      expect(hybrid.integrationConfig.mode).toBe('hybrid');
      expect(mlOnly.integrationConfig.mode).toBe('mlOnly');
      expect(fallback.integrationConfig.mode).toBe('fallback');
    });

    it('configures mlWeight', () => {
      const config = mlBuilder().mlWeight(0.4).build();

      expect(config.integrationConfig.mlWeight).toBe(0.4);
    });

    it('throws on invalid mlWeight', () => {
      expect(() => mlBuilder().mlWeight(-0.1)).toThrow('ML weight must be between 0 and 1');
      expect(() => mlBuilder().mlWeight(1.1)).toThrow('ML weight must be between 0 and 1');
    });

    it('configures applyTo', () => {
      const all = mlBuilder().applyTo('all').build();
      const uncertain = mlBuilder().applyTo('uncertainOnly').build();

      expect(all.integrationConfig.applyTo).toBe('all');
      expect(uncertain.integrationConfig.applyTo).toBe('uncertainOnly');
    });

    it('configures timeout', () => {
      const config = mlBuilder().timeout(10000).build();

      expect(config.integrationConfig.timeoutMs).toBe(10000);
    });

    it('configures fallbackOnError', () => {
      const withFallback = mlBuilder().fallbackOnError(true).build();
      const noFallback = mlBuilder().fallbackOnError(false).build();

      expect(withFallback.integrationConfig.fallbackOnError).toBe(true);
      expect(noFallback.integrationConfig.fallbackOnError).toBe(false);
    });
  });

  describe('model threshold configuration', () => {
    it('configures matchThreshold', () => {
      const config = mlBuilder().matchThreshold(0.8).build();

      expect(config.modelConfig?.matchThreshold).toBe(0.8);
    });

    it('configures nonMatchThreshold', () => {
      const config = mlBuilder().nonMatchThreshold(0.2).build();

      expect(config.modelConfig?.nonMatchThreshold).toBe(0.2);
    });

    it('configures both thresholds', () => {
      const config = mlBuilder()
        .matchThreshold(0.85)
        .nonMatchThreshold(0.15)
        .build();

      expect(config.modelConfig?.matchThreshold).toBe(0.85);
      expect(config.modelConfig?.nonMatchThreshold).toBe(0.15);
    });
  });

  describe('field feature configuration', () => {
    it('configures single field', () => {
      const config = mlBuilder<{ firstName: string }>()
        .field('firstName')
        .extractors(['jaroWinkler', 'exact'])
        .weight(1.5)
        .done()
        .build();

      expect(config.featureConfig?.fields).toHaveLength(1);
      expect(config.featureConfig?.fields[0].field).toBe('firstName');
      expect(config.featureConfig?.fields[0].extractors).toEqual(['jaroWinkler', 'exact']);
      expect(config.featureConfig?.fields[0].weight).toBe(1.5);
    });

    it('configures multiple fields with chaining', () => {
      interface Person {
        firstName: string;
        lastName: string;
        email: string;
      }

      const config = mlBuilder<Person>()
        .field('firstName').forName()
        .field('lastName').forName().weight(1.2)
        .field('email').forIdentifier()
        .build();

      expect(config.featureConfig?.fields).toHaveLength(3);
      expect(config.featureConfig?.fields[0].field).toBe('firstName');
      expect(config.featureConfig?.fields[1].field).toBe('lastName');
      expect(config.featureConfig?.fields[1].weight).toBe(1.2);
      expect(config.featureConfig?.fields[2].field).toBe('email');
    });

    it('configures field for name with phonetic extractors', () => {
      const config = mlBuilder<{ name: string }>()
        .field('name')
        .forName()
        .done()
        .build();

      const field = config.featureConfig?.fields[0];
      expect(field?.extractors).toContain('jaroWinkler');
      expect(field?.extractors).toContain('soundex');
      expect(field?.extractors).toContain('metaphone');
      expect(field?.extractors).toContain('exact');
    });

    it('configures field for identifier', () => {
      const config = mlBuilder<{ ssn: string }>()
        .field('ssn')
        .forIdentifier()
        .done()
        .build();

      const field = config.featureConfig?.fields[0];
      expect(field?.extractors).toContain('exact');
      expect(field?.extractors).toContain('levenshtein');
    });

    it('configures field for date', () => {
      const config = mlBuilder<{ dob: Date }>()
        .field('dob')
        .forDate()
        .done()
        .build();

      const field = config.featureConfig?.fields[0];
      expect(field?.extractors).toContain('exact');
      expect(field?.extractors).toContain('dateDiff');
    });

    it('configures field for numeric', () => {
      const config = mlBuilder<{ age: number }>()
        .field('age')
        .forNumeric()
        .done()
        .build();

      const field = config.featureConfig?.fields[0];
      expect(field?.extractors).toContain('exact');
      expect(field?.extractors).toContain('numericDiff');
    });

    it('configures includeMissing', () => {
      const config = mlBuilder<{ field: string }>()
        .field('field')
        .includeMissing(false)
        .done()
        .build();

      expect(config.featureConfig?.fields[0].includeMissingIndicator).toBe(false);
    });
  });

  describe('bulk field configuration', () => {
    it('configures string fields', () => {
      const config = mlBuilder()
        .stringFields(['field1', 'field2', 'field3'])
        .build();

      expect(config.featureConfig?.fields).toHaveLength(3);
      config.featureConfig?.fields.forEach((field) => {
        expect(field.extractors).toContain('jaroWinkler');
        expect(field.extractors).toContain('levenshtein');
        expect(field.extractors).toContain('exact');
      });
    });

    it('configures name fields', () => {
      const config = mlBuilder()
        .nameFields(['firstName', 'lastName'])
        .build();

      expect(config.featureConfig?.fields).toHaveLength(2);
      config.featureConfig?.fields.forEach((field) => {
        expect(field.extractors).toContain('soundex');
        expect(field.extractors).toContain('metaphone');
        expect(field.weight).toBe(1.2);
      });
    });

    it('configures identifier fields', () => {
      const config = mlBuilder()
        .identifierFields(['email', 'ssn'])
        .build();

      expect(config.featureConfig?.fields).toHaveLength(2);
      config.featureConfig?.fields.forEach((field) => {
        expect(field.extractors).toContain('exact');
        expect(field.weight).toBe(1.5);
      });
    });

    it('configures date fields', () => {
      const config = mlBuilder()
        .dateFields(['dob', 'createdAt'])
        .build();

      expect(config.featureConfig?.fields).toHaveLength(2);
      config.featureConfig?.fields.forEach((field) => {
        expect(field.extractors).toContain('dateDiff');
        expect(field.weight).toBe(1.3);
      });
    });
  });

  describe('custom extractors', () => {
    it('adds custom extractor', () => {
      const customFn = (v1: unknown, v2: unknown) => (v1 === v2 ? 1 : 0);

      const config = mlBuilder()
        .customExtractor('customField', customFn)
        .build();

      expect(config.featureConfig?.customExtractors?.['customField']).toBe(customFn);
    });

    it('configures feature normalization', () => {
      const withNorm = mlBuilder().normalizeFeatures(true).build();
      const withoutNorm = mlBuilder()
        .normalizeFeatures(false)
        .stringFields(['field1'])
        .build();

      expect(withNorm.featureConfig).toBeUndefined(); // No fields configured
      expect(withoutNorm.featureConfig?.normalize).toBe(false);
    });
  });

  describe('full configuration chains', () => {
    it('supports complex configuration', () => {
      interface Person {
        firstName: string;
        lastName: string;
        email: string;
        phone: string;
        dateOfBirth: Date;
      }

      const config = mlBuilder<Person>()
        .usePretrained()
        .mode('hybrid')
        .mlWeight(0.4)
        .applyTo('all')
        .timeout(8000)
        .fallbackOnError(true)
        .matchThreshold(0.75)
        .nonMatchThreshold(0.25)
        .field('firstName').forName().weight(1.0)
        .field('lastName').forName().weight(1.2)
        .field('email').forIdentifier().weight(1.5)
        .field('phone').forIdentifier()
        .field('dateOfBirth').forDate()
        .build();

      expect(config.usePretrained).toBe(true);
      expect(config.integrationConfig.mode).toBe('hybrid');
      expect(config.integrationConfig.mlWeight).toBe(0.4);
      expect(config.integrationConfig.timeoutMs).toBe(8000);
      expect(config.modelConfig?.matchThreshold).toBe(0.75);
      expect(config.featureConfig?.fields).toHaveLength(5);
    });

    it('field configuration returns to parent builder', () => {
      const builder = mlBuilder<{ name: string; email: string }>();

      const fieldBuilder = builder.field('name');
      expect(fieldBuilder).toBeInstanceOf(FieldFeatureBuilder);

      const returnedBuilder = fieldBuilder.done();
      expect(returnedBuilder).toBe(builder);
    });
  });
});

describe('mlBuilder factory', () => {
  it('creates a new MLBuilder instance', () => {
    const builder = mlBuilder();
    expect(builder).toBeInstanceOf(MLBuilder);
  });

  it('is generic', () => {
    interface Custom {
      customField: string;
    }

    const builder = mlBuilder<Custom>();
    expect(builder).toBeInstanceOf(MLBuilder);
  });
});

describe('validateMLBuilderConfig', () => {
  it('validates correct configuration', () => {
    const config: MLBuilderConfig = {
      usePretrained: true,
      integrationConfig: {
        mode: 'hybrid',
        mlWeight: 0.5,
        applyTo: 'all',
        timeoutMs: 5000,
        fallbackOnError: true,
      },
    };

    const errors = validateMLBuilderConfig(config);
    expect(errors).toHaveLength(0);
  });

  it('detects invalid mlWeight', () => {
    const config: MLBuilderConfig = {
      integrationConfig: {
        mode: 'hybrid',
        mlWeight: 1.5,
        applyTo: 'all',
        timeoutMs: 5000,
        fallbackOnError: true,
      },
    };

    const errors = validateMLBuilderConfig(config);
    expect(errors).toContain('ML weight must be between 0 and 1');
  });

  it('detects invalid timeout', () => {
    const config: MLBuilderConfig = {
      integrationConfig: {
        mode: 'hybrid',
        mlWeight: 0.5,
        applyTo: 'all',
        timeoutMs: -1,
        fallbackOnError: true,
      },
    };

    const errors = validateMLBuilderConfig(config);
    expect(errors).toContain('Timeout must be positive');
  });

  it('detects invalid match threshold', () => {
    const config: MLBuilderConfig = {
      integrationConfig: {
        mode: 'hybrid',
        mlWeight: 0.5,
        applyTo: 'all',
        timeoutMs: 5000,
        fallbackOnError: true,
      },
      modelConfig: {
        matchThreshold: 1.5,
      },
    };

    const errors = validateMLBuilderConfig(config);
    expect(errors).toContain('Match threshold must be between 0 and 1');
  });

  it('detects non-match threshold >= match threshold', () => {
    const config: MLBuilderConfig = {
      integrationConfig: {
        mode: 'hybrid',
        mlWeight: 0.5,
        applyTo: 'all',
        timeoutMs: 5000,
        fallbackOnError: true,
      },
      modelConfig: {
        matchThreshold: 0.5,
        nonMatchThreshold: 0.6,
      },
    };

    const errors = validateMLBuilderConfig(config);
    expect(errors).toContain('Non-match threshold must be less than match threshold');
  });

  it('detects missing field name', () => {
    const config: MLBuilderConfig = {
      integrationConfig: {
        mode: 'hybrid',
        mlWeight: 0.5,
        applyTo: 'all',
        timeoutMs: 5000,
        fallbackOnError: true,
      },
      featureConfig: {
        fields: [{ field: '', extractors: ['exact'] }],
        normalize: true,
      },
    };

    const errors = validateMLBuilderConfig(config);
    expect(errors).toContain('Field configuration must have a field name');
  });

  it('detects missing extractors', () => {
    const config: MLBuilderConfig = {
      integrationConfig: {
        mode: 'hybrid',
        mlWeight: 0.5,
        applyTo: 'all',
        timeoutMs: 5000,
        fallbackOnError: true,
      },
      featureConfig: {
        fields: [{ field: 'test', extractors: [] }],
        normalize: true,
      },
    };

    const errors = validateMLBuilderConfig(config);
    expect(errors).toContain('Field "test" must have at least one extractor');
  });
});

describe('createModelFromConfig', () => {
  it('uses provided model', async () => {
    const mockModel = {
      isReady: () => true,
      getConfig: () => ({ matchThreshold: 0.7, nonMatchThreshold: 0.3, includeFeatureImportance: true, batchSize: 100 }),
      setConfig: vi.fn(),
    } as unknown as MLModel<Record<string, unknown>>;

    const config: MLBuilderConfig = {
      model: mockModel,
      integrationConfig: {
        mode: 'hybrid',
        mlWeight: 0.5,
        applyTo: 'all',
        timeoutMs: 5000,
        fallbackOnError: true,
      },
    };

    const model = await createModelFromConfig(config);
    expect(model).toBe(mockModel);
  });

  it('applies model config to provided model', async () => {
    const setConfigMock = vi.fn();
    const mockModel = {
      isReady: () => true,
      getConfig: () => ({ matchThreshold: 0.7, nonMatchThreshold: 0.3, includeFeatureImportance: true, batchSize: 100 }),
      setConfig: setConfigMock,
    } as unknown as MLModel<Record<string, unknown>>;

    const config: MLBuilderConfig = {
      model: mockModel,
      integrationConfig: {
        mode: 'hybrid',
        mlWeight: 0.5,
        applyTo: 'all',
        timeoutMs: 5000,
        fallbackOnError: true,
      },
      modelConfig: {
        matchThreshold: 0.8,
      },
    };

    await createModelFromConfig(config);
    expect(setConfigMock).toHaveBeenCalledWith(
      expect.objectContaining({ matchThreshold: 0.8 })
    );
  });

  it('creates pre-trained classifier when usePretrained is true', async () => {
    const config: MLBuilderConfig = {
      usePretrained: true,
      integrationConfig: {
        mode: 'hybrid',
        mlWeight: 0.5,
        applyTo: 'all',
        timeoutMs: 5000,
        fallbackOnError: true,
      },
    };

    const model = await createModelFromConfig(config);
    expect(model).toBeInstanceOf(SimpleClassifier);
    expect(model.isReady()).toBe(true);
  });

  it('creates classifier with custom feature config', async () => {
    const config: MLBuilderConfig = {
      integrationConfig: {
        mode: 'hybrid',
        mlWeight: 0.5,
        applyTo: 'all',
        timeoutMs: 5000,
        fallbackOnError: true,
      },
      featureConfig: {
        fields: [
          { field: 'name', extractors: ['exact', 'jaroWinkler'] },
          { field: 'email', extractors: ['exact'] },
        ],
        normalize: true,
      },
    };

    const model = await createModelFromConfig(config);
    expect(model).toBeInstanceOf(SimpleClassifier);
  });

  it('falls back to pre-trained when no config specified', async () => {
    const config: MLBuilderConfig = {
      integrationConfig: {
        mode: 'hybrid',
        mlWeight: 0.5,
        applyTo: 'all',
        timeoutMs: 5000,
        fallbackOnError: true,
      },
    };

    const model = await createModelFromConfig(config);
    expect(model).toBeInstanceOf(SimpleClassifier);
    expect(model.isReady()).toBe(true);
  });
});

describe('FieldFeatureBuilder', () => {
  it('supports extractors method', () => {
    const config = mlBuilder<{ field: string }>()
      .field('field')
      .extractors(['exact', 'levenshtein', 'jaroWinkler'])
      .done()
      .build();

    expect(config.featureConfig?.fields[0].extractors).toEqual([
      'exact',
      'levenshtein',
      'jaroWinkler',
    ]);
  });

  it('supports chaining from field to field', () => {
    const config = mlBuilder<{ a: string; b: string; c: string }>()
      .field('a').extractors(['exact'])
      .field('b').extractors(['jaroWinkler'])
      .field('c').extractors(['soundex'])
      .build();

    expect(config.featureConfig?.fields).toHaveLength(3);
    expect(config.featureConfig?.fields[0].field).toBe('a');
    expect(config.featureConfig?.fields[1].field).toBe('b');
    expect(config.featureConfig?.fields[2].field).toBe('c');
  });

  it('allows building directly from field builder', () => {
    const config = mlBuilder<{ field: string }>()
      .field('field')
      .extractors(['exact'])
      .build();

    expect(config.featureConfig?.fields).toHaveLength(1);
  });

  it('finalize commits the field configuration', () => {
    const builder = mlBuilder<{ field: string }>();
    const fieldBuilder = builder.field('field').extractors(['exact']);

    fieldBuilder.finalize();

    const config = builder.build();
    expect(config.featureConfig?.fields).toHaveLength(1);
  });

  it('replaces existing field configuration', () => {
    const config = mlBuilder<{ field: string }>()
      .field('field').extractors(['exact']).weight(1.0)
      .field('field').extractors(['jaroWinkler']).weight(2.0)
      .build();

    // Should have only one field config
    expect(config.featureConfig?.fields).toHaveLength(1);
    expect(config.featureConfig?.fields[0].extractors).toEqual(['jaroWinkler']);
    expect(config.featureConfig?.fields[0].weight).toBe(2.0);
  });
});
