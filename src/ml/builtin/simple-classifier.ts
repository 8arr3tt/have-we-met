/**
 * Simple Classifier
 *
 * A lightweight logistic regression classifier for ML-based identity matching.
 * No external ML library dependencies.
 */

import { BaseMLModel, type MLModelWeights } from '../model-interface';
import type {
  FeatureVector,
  MLModelConfig,
  MLPrediction,
  ModelMetadata,
  RecordPair,
  BatchMLPrediction,
  FeatureImportance,
} from '../types';
import { DEFAULT_ML_MODEL_CONFIG } from '../types';
import {
  createPrediction,
  calculateFeatureImportance,
} from '../prediction';
import { FeatureExtractor } from '../feature-extractor';
import type { FeatureExtractionConfig } from '../types';

/**
 * Configuration options for SimpleClassifier
 */
export interface SimpleClassifierConfig {
  /** Model configuration */
  modelConfig?: Partial<MLModelConfig>;
  /** Feature extraction configuration */
  featureConfig?: FeatureExtractionConfig;
  /** Custom feature extractor instance */
  featureExtractor?: FeatureExtractor<unknown>;
}

/**
 * SimpleClassifier implements logistic regression for binary classification.
 *
 * Logistic regression predicts probability using:
 *   P(match) = sigmoid(w · x + b)
 *
 * Where:
 *   - w is the weight vector
 *   - x is the feature vector
 *   - b is the bias term
 *   - sigmoid(z) = 1 / (1 + e^(-z))
 */
export class SimpleClassifier<T = Record<string, unknown>> extends BaseMLModel<T> {
  private weights: number[] = [];
  private bias: number = 0;
  private featureExtractor: FeatureExtractor<T> | null = null;

  constructor(config: SimpleClassifierConfig = {}) {
    const metadata: ModelMetadata = {
      name: 'SimpleClassifier',
      version: '1.0.0',
      featureNames: [],
    };
    const modelConfig = { ...DEFAULT_ML_MODEL_CONFIG, ...config.modelConfig };
    super(metadata, modelConfig);

    // Initialize feature extractor if config provided
    if (config.featureExtractor) {
      this.featureExtractor = config.featureExtractor as FeatureExtractor<T>;
      this.metadata.featureNames = this.featureExtractor.getFeatureNames();
    } else if (config.featureConfig) {
      this.featureExtractor = new FeatureExtractor<T>(config.featureConfig);
      this.metadata.featureNames = this.featureExtractor.getFeatureNames();
    }
  }

  /**
   * Set the feature extractor
   */
  setFeatureExtractor(extractor: FeatureExtractor<T>): void {
    this.featureExtractor = extractor;
    this.metadata.featureNames = extractor.getFeatureNames();
  }

  /**
   * Get the current weights
   */
  getWeights(): number[] {
    return [...this.weights];
  }

  /**
   * Get the current bias
   */
  getBias(): number {
    return this.bias;
  }

  /**
   * Set weights and bias directly (for testing or manual configuration)
   */
  setWeightsAndBias(weights: number[], bias: number): void {
    if (this.featureExtractor && weights.length !== this.featureExtractor.getFeatureCount()) {
      throw new Error(
        `Weights length (${weights.length}) must match feature count (${this.featureExtractor.getFeatureCount()})`
      );
    }
    this.weights = [...weights];
    this.bias = bias;
    this.ready = weights.length > 0;
  }

  /**
   * Sigmoid activation function
   */
  private sigmoid(z: number): number {
    // Clamp to prevent overflow
    const clampedZ = Math.max(-500, Math.min(500, z));
    return 1 / (1 + Math.exp(-clampedZ));
  }

  /**
   * Compute dot product of weights and features
   */
  private dotProduct(features: number[]): number {
    if (features.length !== this.weights.length) {
      throw new Error(
        `Feature length (${features.length}) must match weights length (${this.weights.length})`
      );
    }

    let sum = 0;
    for (let i = 0; i < features.length; i++) {
      sum += features[i] * this.weights[i];
    }
    return sum;
  }

  /**
   * Compute raw logit (before sigmoid)
   */
  private computeLogit(features: number[]): number {
    return this.dotProduct(features) + this.bias;
  }

  /**
   * Compute probability from features
   */
  private computeProbability(features: number[]): number {
    return this.sigmoid(this.computeLogit(features));
  }

  /**
   * Extract features from a record pair
   */
  extractFeatures(pair: RecordPair<T>): FeatureVector {
    if (!this.featureExtractor) {
      throw new Error('Feature extractor not configured. Set feature config or call setFeatureExtractor()');
    }
    return this.featureExtractor.extract(pair);
  }

  /**
   * Predict whether a record pair is a match
   */
  async predict(pair: RecordPair<T>): Promise<MLPrediction> {
    if (!this.ready) {
      throw new Error('Model not ready. Load weights first.');
    }

    // Extract features
    const features = this.extractFeatures(pair);

    // Compute probability
    const probability = this.computeProbability(features.values);

    // Classify
    const classification = this.classify(probability);

    // Compute confidence
    const confidence = this.calculateConfidence(probability);

    // Compute feature importance if enabled
    let featureImportance: FeatureImportance[] = [];
    if (this.config.includeFeatureImportance) {
      featureImportance = calculateFeatureImportance(features, this.weights);
    }

    return createPrediction(probability, classification, confidence, features, featureImportance);
  }

  /**
   * Predict on multiple record pairs efficiently
   */
  async predictBatch(pairs: RecordPair<T>[]): Promise<BatchMLPrediction<T>[]> {
    if (!this.ready) {
      throw new Error('Model not ready. Load weights first.');
    }

    const results: BatchMLPrediction<T>[] = [];

    // Extract all features first
    const featureVectors = pairs.map((pair) => this.extractFeatures(pair));

    // Compute all predictions
    for (let i = 0; i < pairs.length; i++) {
      const features = featureVectors[i];
      const probability = this.computeProbability(features.values);
      const classification = this.classify(probability);
      const confidence = this.calculateConfidence(probability);

      let featureImportance: FeatureImportance[] = [];
      if (this.config.includeFeatureImportance) {
        featureImportance = calculateFeatureImportance(features, this.weights);
      }

      results.push({
        pair: pairs[i],
        prediction: createPrediction(
          probability,
          classification,
          confidence,
          features,
          featureImportance
        ),
      });
    }

    return results;
  }

  /**
   * Predict from pre-extracted features (for efficiency when features are already computed)
   */
  predictFromFeatures(features: FeatureVector): MLPrediction {
    if (!this.ready) {
      throw new Error('Model not ready. Load weights first.');
    }

    const probability = this.computeProbability(features.values);
    const classification = this.classify(probability);
    const confidence = this.calculateConfidence(probability);

    let featureImportance: FeatureImportance[] = [];
    if (this.config.includeFeatureImportance) {
      featureImportance = calculateFeatureImportance(features, this.weights);
    }

    return createPrediction(probability, classification, confidence, features, featureImportance);
  }

  /**
   * Predict batch from pre-extracted features
   */
  predictBatchFromFeatures(featureVectors: FeatureVector[]): MLPrediction[] {
    return featureVectors.map((features) => this.predictFromFeatures(features));
  }

  /**
   * Load model weights from serialized format
   */
  async loadWeights(weightsData: MLModelWeights): Promise<void> {
    // Validate model type
    if (weightsData.modelType !== 'SimpleClassifier') {
      throw new Error(
        `Invalid model type: expected "SimpleClassifier", got "${weightsData.modelType}"`
      );
    }

    // Validate weights
    if (!Array.isArray(weightsData.weights) || weightsData.weights.length === 0) {
      throw new Error('Weights must be a non-empty array');
    }

    if (weightsData.weights.some((w) => typeof w !== 'number' || isNaN(w))) {
      throw new Error('All weights must be valid numbers');
    }

    if (typeof weightsData.bias !== 'number' || isNaN(weightsData.bias)) {
      throw new Error('Bias must be a valid number');
    }

    // Validate feature names match weights
    if (weightsData.featureNames.length !== weightsData.weights.length) {
      throw new Error(
        `Feature names length (${weightsData.featureNames.length}) must match weights length (${weightsData.weights.length})`
      );
    }

    // Validate against feature extractor if set
    if (this.featureExtractor) {
      const expectedFeatures = this.featureExtractor.getFeatureNames();
      if (expectedFeatures.length !== weightsData.weights.length) {
        throw new Error(
          `Weights length (${weightsData.weights.length}) must match feature extractor feature count (${expectedFeatures.length})`
        );
      }
    }

    // Set weights and metadata
    this.weights = [...weightsData.weights];
    this.bias = weightsData.bias;
    this.metadata.featureNames = [...weightsData.featureNames];
    this.metadata.version = weightsData.version;

    // Parse extra metadata if present
    if (weightsData.extra) {
      if (typeof weightsData.extra.trainedAt === 'string') {
        this.metadata.trainedAt = new Date(weightsData.extra.trainedAt);
      }
      if (typeof weightsData.extra.accuracy === 'number') {
        this.metadata.accuracy = weightsData.extra.accuracy;
      }
      if (typeof weightsData.extra.trainingExamples === 'number') {
        this.metadata.trainingExamples = weightsData.extra.trainingExamples;
      }
    }

    this.ready = true;
  }

  /**
   * Export model weights to serialized format
   */
  exportWeights(): MLModelWeights {
    if (!this.ready) {
      throw new Error('Model not ready. No weights to export.');
    }

    return {
      modelType: 'SimpleClassifier',
      version: this.metadata.version,
      weights: [...this.weights],
      bias: this.bias,
      featureNames: [...this.metadata.featureNames],
      extra: {
        trainedAt: this.metadata.trainedAt?.toISOString(),
        accuracy: this.metadata.accuracy,
        trainingExamples: this.metadata.trainingExamples,
      },
    };
  }

  /**
   * Get feature importance based on weight magnitudes
   */
  getFeatureImportance(): Array<{ name: string; weight: number; importance: number }> {
    if (!this.ready) {
      throw new Error('Model not ready. Load weights first.');
    }

    const importance = this.metadata.featureNames.map((name, i) => ({
      name,
      weight: this.weights[i],
      importance: Math.abs(this.weights[i]),
    }));

    // Sort by importance descending
    return importance.sort((a, b) => b.importance - a.importance);
  }

  /**
   * Initialize weights randomly (for training)
   */
  initializeWeights(featureCount: number, seed?: number): void {
    // Simple random initialization with small values
    const rng = seed !== undefined ? seededRandom(seed) : Math.random;

    this.weights = Array.from({ length: featureCount }, () => (rng() - 0.5) * 0.1);
    this.bias = (rng() - 0.5) * 0.1;

    // Don't mark as ready - weights need to be trained
    this.ready = false;
  }

  /**
   * Update weights (for training)
   */
  updateWeights(weightGradients: number[], biasGradient: number, learningRate: number): void {
    if (weightGradients.length !== this.weights.length) {
      throw new Error('Gradient length must match weights length');
    }

    for (let i = 0; i < this.weights.length; i++) {
      this.weights[i] -= learningRate * weightGradients[i];
    }
    this.bias -= learningRate * biasGradient;
  }

  /**
   * Mark the model as ready (after training)
   */
  markAsReady(): void {
    if (this.weights.length === 0) {
      throw new Error('Cannot mark as ready: no weights set');
    }
    this.ready = true;
  }

  /**
   * Get the number of features expected by this model
   */
  getFeatureCount(): number {
    if (this.featureExtractor) {
      return this.featureExtractor.getFeatureCount();
    }
    return this.weights.length;
  }

  /**
   * Create a clone of this classifier with the same configuration
   */
  clone(): SimpleClassifier<T> {
    const clone = new SimpleClassifier<T>({
      modelConfig: this.config,
    });

    if (this.featureExtractor) {
      clone.setFeatureExtractor(this.featureExtractor);
    }

    if (this.ready) {
      clone.setWeightsAndBias([...this.weights], this.bias);
    }

    return clone;
  }
}

/**
 * Simple seeded random number generator for reproducible initialization
 */
function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

/**
 * Create a SimpleClassifier with default person matching configuration
 */
export function createPersonMatchingClassifier<T>(): SimpleClassifier<T> {
  return new SimpleClassifier<T>({
    featureExtractor: FeatureExtractor.forPersonMatching<T>(),
  });
}

/**
 * Create a SimpleClassifier from a list of field names
 */
export function createClassifierFromFields<T>(fields: string[]): SimpleClassifier<T> {
  return new SimpleClassifier<T>({
    featureExtractor: FeatureExtractor.fromFields<T>(fields),
  });
}

/**
 * Validate SimpleClassifier weights format
 */
export function isValidSimpleClassifierWeights(weights: unknown): weights is MLModelWeights {
  if (!weights || typeof weights !== 'object') {
    return false;
  }

  const w = weights as Record<string, unknown>;

  return (
    w.modelType === 'SimpleClassifier' &&
    typeof w.version === 'string' &&
    Array.isArray(w.weights) &&
    w.weights.every((v) => typeof v === 'number' && !isNaN(v)) &&
    typeof w.bias === 'number' &&
    !isNaN(w.bias) &&
    Array.isArray(w.featureNames) &&
    w.featureNames.every((n) => typeof n === 'string') &&
    w.featureNames.length === w.weights.length
  );
}
