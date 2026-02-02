/**
 * ML Model Interface
 *
 * Abstract interface that all ML models must implement.
 */

import type {
  BatchMLPrediction,
  FeatureVector,
  MLModelConfig,
  MLPrediction,
  ModelMetadata,
  RecordPair,
} from './types'

/**
 * Abstract interface for ML models used in identity matching
 *
 * All ML models must implement this interface to be used with the resolver.
 */
export interface MLModel<T> {
  /**
   * Get model metadata
   */
  getMetadata(): ModelMetadata

  /**
   * Get model configuration
   */
  getConfig(): MLModelConfig

  /**
   * Update model configuration
   */
  setConfig(config: Partial<MLModelConfig>): void

  /**
   * Predict whether a record pair is a match
   *
   * @param pair - The record pair to evaluate
   * @returns Prediction result with probability and classification
   */
  predict(pair: RecordPair<T>): Promise<MLPrediction>

  /**
   * Predict on multiple record pairs efficiently
   *
   * @param pairs - Array of record pairs to evaluate
   * @returns Array of prediction results
   */
  predictBatch(pairs: RecordPair<T>[]): Promise<BatchMLPrediction<T>[]>

  /**
   * Extract features from a record pair without predicting
   *
   * Useful for debugging and understanding what the model sees.
   *
   * @param pair - The record pair to extract features from
   * @returns Feature vector
   */
  extractFeatures(pair: RecordPair<T>): FeatureVector

  /**
   * Check if the model is ready to make predictions
   */
  isReady(): boolean

  /**
   * Load model weights from serialized format
   *
   * @param weights - Serialized weights (format depends on implementation)
   */
  loadWeights(weights: MLModelWeights): Promise<void>

  /**
   * Export model weights to serialized format
   *
   * @returns Serialized weights
   */
  exportWeights(): MLModelWeights
}

/**
 * Serialized model weights
 */
export interface MLModelWeights {
  /** Model type identifier */
  modelType: string
  /** Model version */
  version: string
  /** Weight values */
  weights: number[]
  /** Bias term */
  bias: number
  /** Feature names in order */
  featureNames: string[]
  /** Additional model-specific data */
  extra?: Record<string, unknown>
}

/**
 * Abstract base class providing common functionality for ML models
 */
export abstract class BaseMLModel<T> implements MLModel<T> {
  protected metadata: ModelMetadata
  protected config: MLModelConfig
  protected ready: boolean = false

  constructor(metadata: ModelMetadata, config: MLModelConfig) {
    this.metadata = metadata
    this.config = { ...config }
  }

  getMetadata(): ModelMetadata {
    return { ...this.metadata }
  }

  getConfig(): MLModelConfig {
    return { ...this.config }
  }

  setConfig(config: Partial<MLModelConfig>): void {
    this.config = { ...this.config, ...config }
  }

  isReady(): boolean {
    return this.ready
  }

  abstract predict(pair: RecordPair<T>): Promise<MLPrediction>
  abstract extractFeatures(pair: RecordPair<T>): FeatureVector
  abstract loadWeights(weights: MLModelWeights): Promise<void>
  abstract exportWeights(): MLModelWeights

  /**
   * Default batch prediction implementation
   * Subclasses can override for more efficient batch processing
   */
  async predictBatch(pairs: RecordPair<T>[]): Promise<BatchMLPrediction<T>[]> {
    const results: BatchMLPrediction<T>[] = []
    const batchSize = this.config.batchSize

    // Process in batches
    for (let i = 0; i < pairs.length; i += batchSize) {
      const batch = pairs.slice(i, i + batchSize)
      const predictions = await Promise.all(
        batch.map((pair) => this.predict(pair))
      )

      for (let j = 0; j < batch.length; j++) {
        results.push({
          pair: batch[j],
          prediction: predictions[j],
        })
      }
    }

    return results
  }

  /**
   * Classify probability into match outcome based on thresholds
   */
  protected classify(probability: number): 'match' | 'nonMatch' | 'uncertain' {
    if (probability >= this.config.matchThreshold) {
      return 'match'
    }
    if (probability <= this.config.nonMatchThreshold) {
      return 'nonMatch'
    }
    return 'uncertain'
  }

  /**
   * Calculate confidence based on distance from thresholds
   */
  protected calculateConfidence(probability: number): number {
    const classification = this.classify(probability)

    if (classification === 'match') {
      // Confidence increases as probability approaches 1
      const distanceFromThreshold = probability - this.config.matchThreshold
      const maxDistance = 1 - this.config.matchThreshold
      return maxDistance > 0 ? distanceFromThreshold / maxDistance : 1
    }

    if (classification === 'nonMatch') {
      // Confidence increases as probability approaches 0
      const distanceFromThreshold = this.config.nonMatchThreshold - probability
      const maxDistance = this.config.nonMatchThreshold
      return maxDistance > 0 ? distanceFromThreshold / maxDistance : 1
    }

    // Uncertain: confidence is 0 at midpoint, increases toward thresholds
    const midpoint =
      (this.config.matchThreshold + this.config.nonMatchThreshold) / 2
    const halfRange =
      (this.config.matchThreshold - this.config.nonMatchThreshold) / 2
    const distanceFromMidpoint = Math.abs(probability - midpoint)
    return halfRange > 0 ? distanceFromMidpoint / halfRange : 0
  }
}

/**
 * Model factory function type
 */
export type MLModelFactory<T> = (config?: Partial<MLModelConfig>) => MLModel<T>
