/**
 * Builder ML Integration
 *
 * Fluent builder API for configuring ML matching capabilities.
 */

import type {
  MLIntegrationConfig,
  MLIntegrationMode,
  FeatureExtractionConfig,
  FieldFeatureConfig,
  FeatureExtractorType,
  CustomFeatureExtractor,
  MLModelConfig,
} from '../types';
import { DEFAULT_ML_INTEGRATION_CONFIG, DEFAULT_ML_MODEL_CONFIG } from '../types';
import type { MLModel } from '../model-interface';
import { FeatureExtractor } from '../feature-extractor';
import { SimpleClassifier } from '../builtin/simple-classifier';
import { createPretrainedClassifier } from '../builtin/index';

/**
 * Configuration object produced by the ML builder
 */
export interface MLBuilderConfig<T = Record<string, unknown>> {
  /** The ML model to use */
  model?: MLModel<T>;
  /** Whether to use the built-in pre-trained model */
  usePretrained?: boolean;
  /** ML integration configuration */
  integrationConfig: MLIntegrationConfig;
  /** Feature extraction configuration (for custom models) */
  featureConfig?: FeatureExtractionConfig;
  /** Model configuration */
  modelConfig?: Partial<MLModelConfig>;
}

/**
 * Field feature builder for configuring feature extraction per field
 */
export class FieldFeatureBuilder<T, P extends MLBuilder<T>> {
  private _fieldName: string;
  private _extractors: FeatureExtractorType[] = ['jaroWinkler', 'exact'];
  private _weight: number = 1.0;
  private _includeMissingIndicator: boolean = true;
  private _parent: P;

  constructor(parent: P, fieldName: string) {
    this._parent = parent;
    this._fieldName = fieldName;
  }

  /**
   * Set the feature extractors to use for this field.
   *
   * @param types - Array of extractor types
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * .field('firstName')
   *   .extractors(['jaroWinkler', 'soundex', 'exact'])
   * ```
   */
  extractors(types: FeatureExtractorType[]): this {
    this._extractors = types;
    return this;
  }

  /**
   * Add string similarity extractors optimized for names.
   *
   * @returns This builder for chaining
   */
  forName(): this {
    this._extractors = ['jaroWinkler', 'soundex', 'metaphone', 'exact'];
    return this;
  }

  /**
   * Add extractors optimized for exact identifiers (email, SSN, etc).
   *
   * @returns This builder for chaining
   */
  forIdentifier(): this {
    this._extractors = ['exact', 'levenshtein'];
    return this;
  }

  /**
   * Add extractors optimized for date fields.
   *
   * @returns This builder for chaining
   */
  forDate(): this {
    this._extractors = ['exact', 'dateDiff'];
    return this;
  }

  /**
   * Add extractors optimized for numeric fields.
   *
   * @returns This builder for chaining
   */
  forNumeric(): this {
    this._extractors = ['exact', 'numericDiff'];
    return this;
  }

  /**
   * Set the weight for this field's features.
   *
   * @param value - Weight multiplier (default: 1.0)
   * @returns This builder for chaining
   */
  weight(value: number): this {
    this._weight = value;
    return this;
  }

  /**
   * Set whether to include a missing value indicator for this field.
   *
   * @param include - Whether to include missing indicator (default: true)
   * @returns This builder for chaining
   */
  includeMissing(include: boolean): this {
    this._includeMissingIndicator = include;
    return this;
  }

  /**
   * Configure another field.
   *
   * @param name - Field name
   * @returns A new FieldFeatureBuilder for the specified field
   */
  field<K extends keyof T & string>(name: K): FieldFeatureBuilder<T, P> {
    this.finalize();
    return this._parent.field(name);
  }

  /**
   * Finalize this field configuration and return to the parent builder.
   *
   * @returns The parent MLBuilder
   */
  done(): P {
    this.finalize();
    return this._parent;
  }

  /**
   * Finalize and commit this field configuration.
   */
  finalize(): void {
    this._parent._addFieldConfig({
      field: this._fieldName,
      extractors: this._extractors,
      weight: this._weight,
      includeMissingIndicator: this._includeMissingIndicator,
    });
  }

  /**
   * Build the complete ML configuration.
   *
   * @returns The ML builder configuration
   */
  build(): MLBuilderConfig<T> {
    this.finalize();
    return this._parent.build();
  }

  /**
   * Get the parent builder (for internal use).
   */
  get parent(): P {
    return this._parent;
  }
}

/**
 * ML Builder for fluent configuration of ML matching.
 *
 * @example
 * ```typescript
 * HaveWeMet.create<Person>()
 *   .schema(...)
 *   .matching(...)
 *   .ml(ml => ml
 *     .usePretrained()        // Use built-in pre-trained model
 *     .mode('hybrid')         // Combine ML with probabilistic
 *     .mlWeight(0.4)          // 40% ML, 60% probabilistic
 *   )
 *   .build()
 *
 * // Or with custom model:
 * HaveWeMet.create<Person>()
 *   .schema(...)
 *   .matching(...)
 *   .ml(ml => ml
 *     .model(customModel)     // Use custom ML model
 *     .mode('mlOnly')         // Use ML exclusively
 *     .field('firstName').forName().weight(1.2)
 *     .field('email').forIdentifier().weight(1.5)
 *   )
 *   .build()
 * ```
 */
export class MLBuilder<T = Record<string, unknown>> {
  private _model?: MLModel<T>;
  private _usePretrained: boolean = false;
  private _integrationConfig: MLIntegrationConfig = { ...DEFAULT_ML_INTEGRATION_CONFIG };
  private _fieldConfigs: FieldFeatureConfig[] = [];
  private _customExtractors: Record<string, CustomFeatureExtractor> = {};
  private _modelConfig: Partial<MLModelConfig> = {};
  private _normalizeFeatures: boolean = true;

  /**
   * Use a custom ML model.
   *
   * @param model - The ML model instance
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * .ml(ml => ml
   *   .model(myTrainedClassifier)
   * )
   * ```
   */
  model(model: MLModel<T>): this {
    this._model = model;
    this._usePretrained = false;
    return this;
  }

  /**
   * Use the built-in pre-trained model for person/customer matching.
   *
   * The pre-trained model is optimized for common identity fields:
   * firstName, lastName, email, phone, dateOfBirth, address, ssn.
   *
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * .ml(ml => ml.usePretrained())
   * ```
   */
  usePretrained(): this {
    this._usePretrained = true;
    this._model = undefined;
    return this;
  }

  /**
   * Set the ML integration mode.
   *
   * - `'hybrid'`: Combine ML predictions with probabilistic scores (default)
   * - `'mlOnly'`: Use ML predictions exclusively
   * - `'fallback'`: Use ML only for uncertain probabilistic results
   *
   * @param mode - The integration mode
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * .ml(ml => ml.mode('hybrid'))
   * ```
   */
  mode(mode: MLIntegrationMode): this {
    this._integrationConfig.mode = mode;
    return this;
  }

  /**
   * Set the weight of ML score in hybrid mode.
   *
   * Final score = (1 - mlWeight) * probabilisticScore + mlWeight * mlScore
   *
   * @param weight - Weight between 0 and 1 (default: 0.5)
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * .ml(ml => ml.mlWeight(0.4))  // 40% ML, 60% probabilistic
   * ```
   */
  mlWeight(weight: number): this {
    if (weight < 0 || weight > 1) {
      throw new Error('ML weight must be between 0 and 1');
    }
    this._integrationConfig.mlWeight = weight;
    return this;
  }

  /**
   * Configure when to apply ML matching.
   *
   * - `'all'`: Apply ML to all comparisons (default)
   * - `'uncertainOnly'`: Only apply ML to potential matches (uncertain probabilistic results)
   *
   * @param target - When to apply ML
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * .ml(ml => ml.applyTo('uncertainOnly'))
   * ```
   */
  applyTo(target: 'all' | 'uncertainOnly'): this {
    this._integrationConfig.applyTo = target;
    return this;
  }

  /**
   * Set the timeout for ML predictions.
   *
   * @param ms - Timeout in milliseconds (default: 5000)
   * @returns This builder for chaining
   */
  timeout(ms: number): this {
    this._integrationConfig.timeoutMs = ms;
    return this;
  }

  /**
   * Configure fallback behavior on ML error.
   *
   * @param fallback - Whether to fallback to probabilistic on ML failure (default: true)
   * @returns This builder for chaining
   */
  fallbackOnError(fallback: boolean): this {
    this._integrationConfig.fallbackOnError = fallback;
    return this;
  }

  /**
   * Set the match threshold for ML classification.
   *
   * Predictions above this threshold are classified as matches.
   *
   * @param threshold - Threshold between 0 and 1 (default: 0.7)
   * @returns This builder for chaining
   */
  matchThreshold(threshold: number): this {
    this._modelConfig.matchThreshold = threshold;
    return this;
  }

  /**
   * Set the non-match threshold for ML classification.
   *
   * Predictions below this threshold are classified as non-matches.
   *
   * @param threshold - Threshold between 0 and 1 (default: 0.3)
   * @returns This builder for chaining
   */
  nonMatchThreshold(threshold: number): this {
    this._modelConfig.nonMatchThreshold = threshold;
    return this;
  }

  /**
   * Configure feature extraction for a specific field.
   *
   * @param name - Field name
   * @returns A FieldFeatureBuilder for configuring the field's feature extraction
   *
   * @example
   * ```typescript
   * .ml(ml => ml
   *   .field('firstName').forName().weight(1.2)
   *   .field('email').forIdentifier().weight(1.5)
   *   .field('dateOfBirth').forDate()
   * )
   * ```
   */
  field<K extends keyof T & string>(name: K): FieldFeatureBuilder<T, this> {
    return new FieldFeatureBuilder<T, this>(this, name);
  }

  /**
   * Add a custom feature extractor for a field.
   *
   * @param fieldName - Field name
   * @param extractor - Custom extractor function
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * .ml(ml => ml
   *   .customExtractor('customField', (v1, v2) => {
   *     // Return similarity score 0-1
   *     return v1 === v2 ? 1 : 0
   *   })
   * )
   * ```
   */
  customExtractor(fieldName: string, extractor: CustomFeatureExtractor): this {
    this._customExtractors[fieldName] = extractor;
    return this;
  }

  /**
   * Set whether to normalize features to 0-1 range.
   *
   * @param normalize - Whether to normalize (default: true)
   * @returns This builder for chaining
   */
  normalizeFeatures(normalize: boolean): this {
    this._normalizeFeatures = normalize;
    return this;
  }

  /**
   * Configure default feature extraction for all string fields.
   *
   * @param fields - Array of field names
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * .ml(ml => ml.stringFields(['firstName', 'lastName', 'address']))
   * ```
   */
  stringFields(fields: string[]): this {
    for (const field of fields) {
      this._fieldConfigs.push({
        field,
        extractors: ['jaroWinkler', 'levenshtein', 'exact'],
        weight: 1.0,
      });
    }
    return this;
  }

  /**
   * Configure default feature extraction for name fields.
   *
   * @param fields - Array of name field names
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * .ml(ml => ml.nameFields(['firstName', 'lastName']))
   * ```
   */
  nameFields(fields: string[]): this {
    for (const field of fields) {
      this._fieldConfigs.push({
        field,
        extractors: ['jaroWinkler', 'soundex', 'metaphone', 'exact'],
        weight: 1.2,
      });
    }
    return this;
  }

  /**
   * Configure default feature extraction for identifier fields.
   *
   * @param fields - Array of identifier field names
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * .ml(ml => ml.identifierFields(['email', 'ssn', 'phone']))
   * ```
   */
  identifierFields(fields: string[]): this {
    for (const field of fields) {
      this._fieldConfigs.push({
        field,
        extractors: ['exact', 'levenshtein'],
        weight: 1.5,
      });
    }
    return this;
  }

  /**
   * Configure default feature extraction for date fields.
   *
   * @param fields - Array of date field names
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * .ml(ml => ml.dateFields(['dateOfBirth', 'createdAt']))
   * ```
   */
  dateFields(fields: string[]): this {
    for (const field of fields) {
      this._fieldConfigs.push({
        field,
        extractors: ['exact', 'dateDiff'],
        weight: 1.3,
      });
    }
    return this;
  }

  /**
   * Add field configuration (internal use by FieldFeatureBuilder).
   */
  _addFieldConfig(config: FieldFeatureConfig): void {
    // Replace if field already exists
    const existingIndex = this._fieldConfigs.findIndex(
      (f) => f.field === config.field
    );
    if (existingIndex >= 0) {
      this._fieldConfigs[existingIndex] = config;
    } else {
      this._fieldConfigs.push(config);
    }
  }

  /**
   * Build the ML configuration.
   *
   * @returns The complete ML builder configuration
   */
  build(): MLBuilderConfig<T> {
    const config: MLBuilderConfig<T> = {
      model: this._model,
      usePretrained: this._usePretrained,
      integrationConfig: { ...this._integrationConfig },
      modelConfig: Object.keys(this._modelConfig).length > 0 ? this._modelConfig : undefined,
    };

    // Build feature config if custom fields or extractors were configured
    const hasCustomExtractors = Object.keys(this._customExtractors).length > 0;
    if (this._fieldConfigs.length > 0 || hasCustomExtractors) {
      config.featureConfig = {
        fields: [...this._fieldConfigs],
        normalize: this._normalizeFeatures,
        customExtractors: hasCustomExtractors
          ? { ...this._customExtractors }
          : undefined,
      };
    }

    return config;
  }
}

/**
 * Create a new ML builder.
 *
 * @returns A new MLBuilder instance
 *
 * @example
 * ```typescript
 * const mlConfig = mlBuilder<Person>()
 *   .usePretrained()
 *   .mode('hybrid')
 *   .mlWeight(0.4)
 *   .build()
 * ```
 */
export function mlBuilder<T = Record<string, unknown>>(): MLBuilder<T> {
  return new MLBuilder<T>();
}

/**
 * Result type for ML builder configurator functions
 */
export type MLBuilderResult<T> =
  | MLBuilder<T>
  | FieldFeatureBuilder<T, MLBuilder<T>>
  | void;

/**
 * Create an ML model from builder configuration.
 *
 * This async function creates and initializes the ML model based on
 * the builder configuration.
 *
 * @param config - The ML builder configuration
 * @returns Promise resolving to the configured ML model
 */
export async function createModelFromConfig<T>(
  config: MLBuilderConfig<T>
): Promise<MLModel<T>> {
  // If a model was provided directly, use it
  if (config.model) {
    // Apply model config if provided
    if (config.modelConfig) {
      config.model.setConfig({
        ...DEFAULT_ML_MODEL_CONFIG,
        ...config.modelConfig,
      });
    }
    return config.model;
  }

  // If using pre-trained, load the pre-trained classifier
  if (config.usePretrained) {
    const classifier = await createPretrainedClassifier<T>();
    if (config.modelConfig) {
      classifier.setConfig({
        ...classifier.getConfig(),
        ...config.modelConfig,
      });
    }
    return classifier;
  }

  // Create a new classifier with custom feature extraction
  if (config.featureConfig) {
    const featureExtractor = new FeatureExtractor<T>(config.featureConfig);
    const classifier = new SimpleClassifier<T>({
      featureExtractor,
      modelConfig: config.modelConfig ? {
        ...DEFAULT_ML_MODEL_CONFIG,
        ...config.modelConfig,
      } : undefined,
    });
    return classifier;
  }

  // Fall back to pre-trained if nothing else specified
  return createPretrainedClassifier<T>();
}

/**
 * Validate ML builder configuration.
 *
 * @param config - The configuration to validate
 * @returns Array of validation errors (empty if valid)
 */
export function validateMLBuilderConfig<T>(
  config: MLBuilderConfig<T>
): string[] {
  const errors: string[] = [];

  // Validate integration config
  if (config.integrationConfig.mlWeight < 0 || config.integrationConfig.mlWeight > 1) {
    errors.push('ML weight must be between 0 and 1');
  }

  if (config.integrationConfig.timeoutMs <= 0) {
    errors.push('Timeout must be positive');
  }

  // Validate model config
  if (config.modelConfig) {
    if (
      config.modelConfig.matchThreshold !== undefined &&
      (config.modelConfig.matchThreshold < 0 || config.modelConfig.matchThreshold > 1)
    ) {
      errors.push('Match threshold must be between 0 and 1');
    }

    if (
      config.modelConfig.nonMatchThreshold !== undefined &&
      (config.modelConfig.nonMatchThreshold < 0 || config.modelConfig.nonMatchThreshold > 1)
    ) {
      errors.push('Non-match threshold must be between 0 and 1');
    }

    if (
      config.modelConfig.matchThreshold !== undefined &&
      config.modelConfig.nonMatchThreshold !== undefined &&
      config.modelConfig.nonMatchThreshold >= config.modelConfig.matchThreshold
    ) {
      errors.push('Non-match threshold must be less than match threshold');
    }
  }

  // Validate feature config
  if (config.featureConfig) {
    for (const field of config.featureConfig.fields) {
      if (!field.field) {
        errors.push('Field configuration must have a field name');
      }
      if (!field.extractors || field.extractors.length === 0) {
        errors.push(`Field "${field.field}" must have at least one extractor`);
      }
    }
  }

  return errors;
}
