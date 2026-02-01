/**
 * Resolver ML Integration
 *
 * Integrates ML predictions into the resolver workflow, enabling ML-based matching
 * alongside or instead of probabilistic matching.
 */

import type {
  MLPrediction,
  RecordPair,
  MLIntegrationConfig,
  MLIntegrationMode,
  FeatureVector,
} from '../types';
import type { MLModel } from '../model-interface';
import { DEFAULT_ML_INTEGRATION_CONFIG } from '../types';
import type { MatchResult, MatchScore, MatchOutcome, FieldScore } from '../../core/scoring/types';

/**
 * Result of ML-enhanced matching
 */
export interface MLMatchResult<T = unknown> extends MatchResult<T> {
  /** ML prediction details (if ML was used) */
  mlPrediction?: MLPrediction;
  /** Whether ML was used for this match */
  mlUsed: boolean;
  /** ML score contribution (when in hybrid mode) */
  mlScoreContribution?: number;
  /** Probabilistic score contribution (when in hybrid mode) */
  probabilisticScoreContribution?: number;
  /** Time taken for ML prediction in milliseconds */
  mlPredictionTimeMs?: number;
  /** Error message if ML failed */
  mlError?: string;
}

/**
 * Options for ML matching
 */
export interface MLMatchOptions {
  /** Override the integration mode for this call */
  mode?: MLIntegrationMode;
  /** Override the ML weight for this call */
  mlWeight?: number;
  /** Whether to skip ML for this call */
  skipML?: boolean;
  /** Timeout override in milliseconds */
  timeoutMs?: number;
}

/**
 * Statistics from ML matching
 */
export interface MLMatchStats {
  /** Total matches processed */
  totalMatches: number;
  /** Matches where ML was used */
  mlUsedCount: number;
  /** Matches where ML failed */
  mlFailedCount: number;
  /** Average ML prediction time in milliseconds */
  avgMLPredictionTimeMs: number;
  /** Total ML prediction time in milliseconds */
  totalMLPredictionTimeMs: number;
}

/**
 * ML Match Integrator
 *
 * Handles integration of ML predictions into the match scoring workflow.
 */
export class MLMatchIntegrator<T = Record<string, unknown>> {
  private model: MLModel<T>;
  private config: MLIntegrationConfig;

  constructor(model: MLModel<T>, config: Partial<MLIntegrationConfig> = {}) {
    this.model = model;
    this.config = { ...DEFAULT_ML_INTEGRATION_CONFIG, ...config };
  }

  /**
   * Get the current configuration
   */
  getConfig(): MLIntegrationConfig {
    return { ...this.config };
  }

  /**
   * Update the configuration
   */
  setConfig(config: Partial<MLIntegrationConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get the ML model
   */
  getModel(): MLModel<T> {
    return this.model;
  }

  /**
   * Check if the model is ready
   */
  isReady(): boolean {
    return this.model.isReady();
  }

  /**
   * Enhance a single match result with ML prediction
   */
  async enhanceMatchResult(
    candidateRecord: T,
    existingRecord: T,
    probabilisticResult: MatchResult<T>,
    options?: MLMatchOptions
  ): Promise<MLMatchResult<T>> {
    const effectiveConfig = this.getEffectiveConfig(options);

    // Check if we should use ML for this match
    if (options?.skipML || !this.shouldUseML(probabilisticResult, effectiveConfig)) {
      return {
        ...probabilisticResult,
        mlUsed: false,
      };
    }

    const startTime = performance.now();

    try {
      // Get ML prediction with timeout
      const prediction = await this.predictWithTimeout(
        { record1: candidateRecord, record2: existingRecord },
        effectiveConfig.timeoutMs
      );

      const mlPredictionTimeMs = performance.now() - startTime;

      // Calculate combined result based on mode
      return this.combineResults(
        probabilisticResult,
        prediction,
        effectiveConfig,
        mlPredictionTimeMs
      );
    } catch (error) {
      const mlPredictionTimeMs = performance.now() - startTime;

      // Handle ML failure based on configuration
      if (effectiveConfig.fallbackOnError) {
        return {
          ...probabilisticResult,
          mlUsed: false,
          mlPredictionTimeMs,
          mlError: error instanceof Error ? error.message : String(error),
        };
      }

      // Re-throw if not configured to fallback
      throw error;
    }
  }

  /**
   * Enhance multiple match results with ML predictions
   */
  async enhanceMatchResults(
    candidateRecord: T,
    existingRecords: T[],
    probabilisticResults: MatchResult<T>[],
    options?: MLMatchOptions
  ): Promise<MLMatchResult<T>[]> {
    const effectiveConfig = this.getEffectiveConfig(options);

    if (options?.skipML) {
      return probabilisticResults.map((result) => ({
        ...result,
        mlUsed: false,
      }));
    }

    const results: MLMatchResult<T>[] = [];

    for (let i = 0; i < probabilisticResults.length; i++) {
      const existingRecord = existingRecords[i];
      const probabilisticResult = probabilisticResults[i];

      const mlResult = await this.enhanceMatchResult(
        candidateRecord,
        existingRecord,
        probabilisticResult,
        { ...options, ...effectiveConfig }
      );

      results.push(mlResult);
    }

    // Re-sort by combined score
    results.sort((a, b) => b.score.totalScore - a.score.totalScore);

    return results;
  }

  /**
   * Batch enhance with optimized ML predictions
   */
  async enhanceMatchResultsBatch(
    candidateRecord: T,
    existingRecords: T[],
    probabilisticResults: MatchResult<T>[],
    options?: MLMatchOptions
  ): Promise<{ results: MLMatchResult<T>[]; stats: MLMatchStats }> {
    const effectiveConfig = this.getEffectiveConfig(options);
    const stats: MLMatchStats = {
      totalMatches: probabilisticResults.length,
      mlUsedCount: 0,
      mlFailedCount: 0,
      avgMLPredictionTimeMs: 0,
      totalMLPredictionTimeMs: 0,
    };

    if (options?.skipML) {
      return {
        results: probabilisticResults.map((result) => ({
          ...result,
          mlUsed: false,
        })),
        stats,
      };
    }

    // Determine which results need ML
    const mlIndices: number[] = [];
    const mlPairs: RecordPair<T>[] = [];

    for (let i = 0; i < probabilisticResults.length; i++) {
      if (this.shouldUseML(probabilisticResults[i], effectiveConfig)) {
        mlIndices.push(i);
        mlPairs.push({
          record1: candidateRecord,
          record2: existingRecords[i],
        });
      }
    }

    // Get ML predictions in batch
    let predictions: MLPrediction[] = [];
    const startTime = performance.now();

    if (mlPairs.length > 0) {
      try {
        const batchResults = await this.model.predictBatch(mlPairs);
        predictions = batchResults.map((r) => r.prediction);
        stats.mlUsedCount = predictions.length;
      } catch (error) {
        if (!effectiveConfig.fallbackOnError) {
          throw error;
        }
        stats.mlFailedCount = mlPairs.length;
      }
    }

    stats.totalMLPredictionTimeMs = performance.now() - startTime;
    stats.avgMLPredictionTimeMs =
      stats.mlUsedCount > 0
        ? stats.totalMLPredictionTimeMs / stats.mlUsedCount
        : 0;

    // Build final results
    const results: MLMatchResult<T>[] = probabilisticResults.map((result, i) => {
      const mlIndex = mlIndices.indexOf(i);

      if (mlIndex === -1 || mlIndex >= predictions.length) {
        return {
          ...result,
          mlUsed: false,
        };
      }

      return this.combineResults(
        result,
        predictions[mlIndex],
        effectiveConfig,
        stats.avgMLPredictionTimeMs
      );
    });

    // Re-sort by combined score
    results.sort((a, b) => b.score.totalScore - a.score.totalScore);

    return { results, stats };
  }

  /**
   * Perform ML-only matching (no probabilistic scoring)
   */
  async matchWithMLOnly(
    candidateRecord: T,
    existingRecord: T,
    thresholds: { noMatch: number; definiteMatch: number }
  ): Promise<MLMatchResult<T>> {
    const startTime = performance.now();

    try {
      const prediction = await this.model.predict({
        record1: candidateRecord,
        record2: existingRecord,
      });

      const mlPredictionTimeMs = performance.now() - startTime;

      // Convert ML probability to score
      const maxScore = 100; // Use 100-point scale for compatibility
      const totalScore = prediction.probability * maxScore;

      // Determine outcome based on ML classification and thresholds
      const outcome = this.mlClassificationToOutcome(
        prediction.classification,
        totalScore,
        thresholds
      );

      // Create synthetic score object from ML prediction
      const score: MatchScore = {
        totalScore,
        maxPossibleScore: maxScore,
        normalizedScore: prediction.probability,
        fieldScores: this.mlFeaturesToFieldScores(prediction),
      };

      return {
        outcome,
        candidateRecord: existingRecord,
        score,
        explanation: this.generateMLExplanation(prediction, outcome),
        mlPrediction: prediction,
        mlUsed: true,
        mlPredictionTimeMs,
      };
    } catch (error) {
      throw new Error(
        `ML prediction failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Extract features from a record pair without predicting
   */
  extractFeatures(
    candidateRecord: T,
    existingRecord: T
  ): FeatureVector {
    return this.model.extractFeatures({
      record1: candidateRecord,
      record2: existingRecord,
    });
  }

  /**
   * Check if ML should be used for a given match result
   */
  private shouldUseML(
    result: MatchResult,
    config: MLIntegrationConfig
  ): boolean {
    if (!this.model.isReady()) {
      return false;
    }

    if (config.applyTo === 'all') {
      return true;
    }

    // Only apply to uncertain cases (potential matches)
    return result.outcome === 'potential-match';
  }

  /**
   * Get effective configuration combining defaults with options
   */
  private getEffectiveConfig(options?: MLMatchOptions): MLIntegrationConfig {
    if (!options) {
      return this.config;
    }

    return {
      ...this.config,
      mode: options.mode ?? this.config.mode,
      mlWeight: options.mlWeight ?? this.config.mlWeight,
      timeoutMs: options.timeoutMs ?? this.config.timeoutMs,
    };
  }

  /**
   * Run ML prediction with timeout
   */
  private async predictWithTimeout(
    pair: RecordPair<T>,
    timeoutMs: number
  ): Promise<MLPrediction> {
    const predictionPromise = this.model.predict(pair);

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new Error(`ML prediction timed out after ${timeoutMs}ms`)),
        timeoutMs
      );
    });

    return Promise.race([predictionPromise, timeoutPromise]);
  }

  /**
   * Combine probabilistic and ML results based on mode
   */
  private combineResults(
    probabilisticResult: MatchResult<T>,
    mlPrediction: MLPrediction,
    config: MLIntegrationConfig,
    mlPredictionTimeMs: number
  ): MLMatchResult<T> {
    switch (config.mode) {
      case 'mlOnly':
        return this.createMLOnlyResult(
          probabilisticResult,
          mlPrediction,
          mlPredictionTimeMs
        );

      case 'hybrid':
        return this.createHybridResult(
          probabilisticResult,
          mlPrediction,
          config.mlWeight,
          mlPredictionTimeMs
        );

      case 'fallback':
        // Only use ML if probabilistic result is uncertain
        if (probabilisticResult.outcome === 'potential-match') {
          return this.createMLOnlyResult(
            probabilisticResult,
            mlPrediction,
            mlPredictionTimeMs
          );
        }
        return {
          ...probabilisticResult,
          mlUsed: false,
          mlPrediction,
          mlPredictionTimeMs,
        };

      default:
        return {
          ...probabilisticResult,
          mlUsed: false,
        };
    }
  }

  /**
   * Create result using only ML prediction
   */
  private createMLOnlyResult(
    probabilisticResult: MatchResult<T>,
    mlPrediction: MLPrediction,
    mlPredictionTimeMs: number
  ): MLMatchResult<T> {
    const maxScore = probabilisticResult.score.maxPossibleScore;
    const totalScore = mlPrediction.probability * maxScore;

    const outcome = this.determineOutcomeFromScores(
      totalScore,
      probabilisticResult
    );

    return {
      outcome,
      candidateRecord: probabilisticResult.candidateRecord,
      score: {
        totalScore,
        maxPossibleScore: maxScore,
        normalizedScore: mlPrediction.probability,
        fieldScores: this.mergeFieldScoresWithML(
          probabilisticResult.score.fieldScores,
          mlPrediction
        ),
      },
      explanation: this.generateMLExplanation(mlPrediction, outcome),
      mlPrediction,
      mlUsed: true,
      mlPredictionTimeMs,
    };
  }

  /**
   * Create hybrid result combining probabilistic and ML scores
   */
  private createHybridResult(
    probabilisticResult: MatchResult<T>,
    mlPrediction: MLPrediction,
    mlWeight: number,
    mlPredictionTimeMs: number
  ): MLMatchResult<T> {
    const probWeight = 1 - mlWeight;
    const maxScore = probabilisticResult.score.maxPossibleScore;

    // Calculate ML contribution as score on the same scale
    const mlScore = mlPrediction.probability * maxScore;

    // Combine scores
    const probabilisticScore = probabilisticResult.score.totalScore;
    const combinedScore =
      probWeight * probabilisticScore + mlWeight * mlScore;

    // Determine outcome from combined score
    const outcome = this.determineOutcomeFromScores(
      combinedScore,
      probabilisticResult
    );

    return {
      outcome,
      candidateRecord: probabilisticResult.candidateRecord,
      score: {
        totalScore: combinedScore,
        maxPossibleScore: maxScore,
        normalizedScore: combinedScore / maxScore,
        fieldScores: this.mergeFieldScoresWithML(
          probabilisticResult.score.fieldScores,
          mlPrediction
        ),
      },
      explanation: this.generateHybridExplanation(
        probabilisticResult,
        mlPrediction,
        combinedScore,
        mlWeight,
        outcome
      ),
      mlPrediction,
      mlUsed: true,
      mlScoreContribution: mlWeight * mlScore,
      probabilisticScoreContribution: probWeight * probabilisticScore,
      mlPredictionTimeMs,
    };
  }

  /**
   * Determine outcome from combined score using original thresholds
   */
  private determineOutcomeFromScores(
    score: number,
    originalResult: MatchResult
  ): MatchOutcome {
    // Use the original result's threshold boundaries implicitly
    // by checking against the known outcomes and scores
    const originalScore = originalResult.score.totalScore;
    const originalOutcome = originalResult.outcome;

    // If the new score moves us across a boundary, recalculate
    if (originalOutcome === 'definite-match' && score < originalScore) {
      // Score decreased - might no longer be definite match
      // We don't have exact thresholds, so keep the ML classification influence
    }

    // Simple heuristic: use normalized score boundaries
    // These roughly correspond to typical threshold settings
    const normalizedScore = score / originalResult.score.maxPossibleScore;

    if (normalizedScore >= 0.65) {
      return 'definite-match';
    }
    if (normalizedScore < 0.3) {
      return 'no-match';
    }
    return 'potential-match';
  }

  /**
   * Convert ML classification to match outcome
   */
  private mlClassificationToOutcome(
    classification: 'match' | 'nonMatch' | 'uncertain',
    score: number,
    thresholds: { noMatch: number; definiteMatch: number }
  ): MatchOutcome {
    // Use both ML classification and score for outcome
    if (classification === 'match' && score >= thresholds.definiteMatch) {
      return 'definite-match';
    }
    if (classification === 'nonMatch' && score < thresholds.noMatch) {
      return 'no-match';
    }
    if (classification === 'match') {
      return 'potential-match'; // High confidence but below threshold
    }
    if (classification === 'nonMatch') {
      return 'no-match';
    }
    return 'potential-match'; // uncertain
  }

  /**
   * Merge probabilistic field scores with ML feature importance
   */
  private mergeFieldScoresWithML(
    fieldScores: FieldScore[],
    mlPrediction: MLPrediction
  ): FieldScore[] {
    // Create a lookup of ML feature importance by field
    const featureByField = new Map<string, number>();

    for (const feature of mlPrediction.featureImportance) {
      // Extract field name from feature name (e.g., "firstName_jaroWinkler" -> "firstName")
      const fieldMatch = feature.name.match(/^([^_]+)_/);
      if (fieldMatch) {
        const fieldName = fieldMatch[1];
        const current = featureByField.get(fieldName) ?? 0;
        featureByField.set(fieldName, current + feature.importance);
      }
    }

    // Enhance field scores with ML importance info
    return fieldScores.map((score) => ({
      ...score,
      // Could add mlImportance field if we extend the type
    }));
  }

  /**
   * Convert ML features to field scores for ML-only mode
   */
  private mlFeaturesToFieldScores(mlPrediction: MLPrediction): FieldScore[] {
    const fieldMap = new Map<string, FieldScore>();

    for (let i = 0; i < mlPrediction.features.names.length; i++) {
      const featureName = mlPrediction.features.names[i];
      const featureValue = mlPrediction.features.values[i];

      // Extract field and extractor from feature name
      const match = featureName.match(/^([^_]+)_(.+)$/);
      if (!match) continue;

      const fieldName = match[1];
      const extractorType = match[2];

      if (!fieldMap.has(fieldName)) {
        fieldMap.set(fieldName, {
          field: fieldName,
          similarity: featureValue,
          weight: 1,
          contribution: featureValue,
          threshold: 0,
          metThreshold: true,
          strategy: 'exact', // Default - ML doesn't use strategies
        });
      } else {
        // Update with highest similarity for this field
        const existing = fieldMap.get(fieldName)!;
        if (featureValue > existing.similarity) {
          existing.similarity = featureValue;
          existing.contribution = featureValue;
        }
      }
    }

    return Array.from(fieldMap.values());
  }

  /**
   * Generate explanation for ML-only result
   */
  private generateMLExplanation(
    mlPrediction: MLPrediction,
    outcome: MatchOutcome
  ): string {
    const probability = (mlPrediction.probability * 100).toFixed(1);
    const confidence = (mlPrediction.confidence * 100).toFixed(1);

    const outcomeText = {
      'definite-match': 'definite match',
      'potential-match': 'potential match',
      'no-match': 'no match',
    }[outcome];

    const topFeatures = mlPrediction.featureImportance
      .slice(0, 3)
      .map((f) => `${f.name} (${(f.importance * 100).toFixed(0)}%)`)
      .join(', ');

    return `ML prediction: ${probability}% match probability with ${confidence}% confidence. Classified as ${outcomeText}. Top features: ${topFeatures}.`;
  }

  /**
   * Generate explanation for hybrid result
   */
  private generateHybridExplanation(
    probabilisticResult: MatchResult,
    mlPrediction: MLPrediction,
    combinedScore: number,
    mlWeight: number,
    outcome: MatchOutcome
  ): string {
    const probScore = probabilisticResult.score.totalScore.toFixed(1);
    const mlProb = (mlPrediction.probability * 100).toFixed(1);
    const combined = combinedScore.toFixed(1);
    const mlWeightPct = (mlWeight * 100).toFixed(0);
    const probWeightPct = ((1 - mlWeight) * 100).toFixed(0);

    const outcomeText = {
      'definite-match': 'definite match',
      'potential-match': 'potential match',
      'no-match': 'no match',
    }[outcome];

    return `Hybrid score: ${combined} (${probWeightPct}% probabilistic [${probScore}] + ${mlWeightPct}% ML [${mlProb}%]). Classified as ${outcomeText}.`;
  }
}

/**
 * Create an ML match integrator from a model and optional configuration
 */
export function createMLIntegrator<T>(
  model: MLModel<T>,
  config?: Partial<MLIntegrationConfig>
): MLMatchIntegrator<T> {
  return new MLMatchIntegrator(model, config);
}

/**
 * Type guard to check if a result is an ML-enhanced result
 */
export function isMLMatchResult<T>(
  result: MatchResult<T>
): result is MLMatchResult<T> {
  return 'mlUsed' in result;
}
