/**
 * ML Prediction Utilities
 *
 * Functions for creating, validating, and working with ML predictions.
 */

import type {
  FeatureImportance,
  FeatureVector,
  MLMatchOutcome,
  MLPrediction,
  BatchMLPrediction,
  RecordPair,
} from './types'

/**
 * Create an ML prediction result
 */
export function createPrediction(
  probability: number,
  classification: MLMatchOutcome,
  confidence: number,
  features: FeatureVector,
  featureImportance: FeatureImportance[] = []
): MLPrediction {
  return {
    probability,
    classification,
    confidence,
    features,
    featureImportance,
  }
}

/**
 * Create a feature vector
 */
export function createFeatureVector(
  values: number[],
  names: string[],
  metadata?: Record<string, unknown>
): FeatureVector {
  if (values.length !== names.length) {
    throw new Error(
      `Feature values length (${values.length}) must match names length (${names.length})`
    )
  }
  return { values, names, metadata }
}

/**
 * Create a feature importance entry
 */
export function createFeatureImportance(
  name: string,
  value: number,
  contribution: number
): FeatureImportance {
  return {
    name,
    value,
    contribution,
    importance: Math.abs(contribution),
  }
}

/**
 * Calculate feature importance from weights and feature values
 */
export function calculateFeatureImportance(
  featureVector: FeatureVector,
  weights: number[]
): FeatureImportance[] {
  if (featureVector.values.length !== weights.length) {
    throw new Error(
      `Feature vector length (${featureVector.values.length}) must match weights length (${weights.length})`
    )
  }

  const importance: FeatureImportance[] = featureVector.names.map(
    (name, i) => ({
      name,
      value: featureVector.values[i],
      contribution: featureVector.values[i] * weights[i],
      importance: Math.abs(featureVector.values[i] * weights[i]),
    })
  )

  // Sort by absolute importance (descending)
  return importance.sort((a, b) => b.importance - a.importance)
}

/**
 * Get the top N most important features
 */
export function getTopFeatures(
  featureImportance: FeatureImportance[],
  n: number
): FeatureImportance[] {
  return featureImportance.slice(0, Math.min(n, featureImportance.length))
}

/**
 * Filter predictions by classification
 */
export function filterByClassification<T>(
  predictions: BatchMLPrediction<T>[],
  classification: MLMatchOutcome
): BatchMLPrediction<T>[] {
  return predictions.filter(
    (p) => p.prediction.classification === classification
  )
}

/**
 * Filter predictions by minimum probability
 */
export function filterByMinProbability<T>(
  predictions: BatchMLPrediction<T>[],
  minProbability: number
): BatchMLPrediction<T>[] {
  return predictions.filter((p) => p.prediction.probability >= minProbability)
}

/**
 * Filter predictions by minimum confidence
 */
export function filterByMinConfidence<T>(
  predictions: BatchMLPrediction<T>[],
  minConfidence: number
): BatchMLPrediction<T>[] {
  return predictions.filter((p) => p.prediction.confidence >= minConfidence)
}

/**
 * Sort predictions by probability (descending)
 */
export function sortByProbability<T>(
  predictions: BatchMLPrediction<T>[],
  ascending: boolean = false
): BatchMLPrediction<T>[] {
  const sorted = [...predictions].sort(
    (a, b) => b.prediction.probability - a.prediction.probability
  )
  return ascending ? sorted.reverse() : sorted
}

/**
 * Sort predictions by confidence (descending)
 */
export function sortByConfidence<T>(
  predictions: BatchMLPrediction<T>[],
  ascending: boolean = false
): BatchMLPrediction<T>[] {
  const sorted = [...predictions].sort(
    (a, b) => b.prediction.confidence - a.prediction.confidence
  )
  return ascending ? sorted.reverse() : sorted
}

/**
 * Aggregate prediction statistics
 */
export interface PredictionStats {
  total: number
  matchCount: number
  nonMatchCount: number
  uncertainCount: number
  avgProbability: number
  avgConfidence: number
  minProbability: number
  maxProbability: number
}

/**
 * Calculate statistics for a set of predictions
 */
export function calculatePredictionStats<T>(
  predictions: BatchMLPrediction<T>[]
): PredictionStats {
  if (predictions.length === 0) {
    return {
      total: 0,
      matchCount: 0,
      nonMatchCount: 0,
      uncertainCount: 0,
      avgProbability: 0,
      avgConfidence: 0,
      minProbability: 0,
      maxProbability: 0,
    }
  }

  let matchCount = 0
  let nonMatchCount = 0
  let uncertainCount = 0
  let sumProbability = 0
  let sumConfidence = 0
  let minProbability = 1
  let maxProbability = 0

  for (const { prediction } of predictions) {
    switch (prediction.classification) {
      case 'match':
        matchCount++
        break
      case 'nonMatch':
        nonMatchCount++
        break
      case 'uncertain':
        uncertainCount++
        break
    }
    sumProbability += prediction.probability
    sumConfidence += prediction.confidence
    minProbability = Math.min(minProbability, prediction.probability)
    maxProbability = Math.max(maxProbability, prediction.probability)
  }

  return {
    total: predictions.length,
    matchCount,
    nonMatchCount,
    uncertainCount,
    avgProbability: sumProbability / predictions.length,
    avgConfidence: sumConfidence / predictions.length,
    minProbability,
    maxProbability,
  }
}

/**
 * Format prediction for human-readable output
 */
export function formatPrediction(prediction: MLPrediction): string {
  const lines: string[] = [
    `Classification: ${prediction.classification}`,
    `Probability: ${(prediction.probability * 100).toFixed(1)}%`,
    `Confidence: ${(prediction.confidence * 100).toFixed(1)}%`,
  ]

  if (prediction.featureImportance.length > 0) {
    lines.push('Top Features:')
    const topFeatures = getTopFeatures(prediction.featureImportance, 5)
    for (const feature of topFeatures) {
      const sign = feature.contribution >= 0 ? '+' : ''
      lines.push(
        `  - ${feature.name}: ${sign}${feature.contribution.toFixed(3)}`
      )
    }
  }

  return lines.join('\n')
}

/**
 * Create a labeled record pair for training
 */
export function createLabeledPair<T>(
  record1: T,
  record2: T,
  label: MLMatchOutcome
): RecordPair<T> {
  return { record1, record2, label }
}

/**
 * Merge two feature vectors
 */
export function mergeFeatureVectors(
  vector1: FeatureVector,
  vector2: FeatureVector
): FeatureVector {
  return {
    values: [...vector1.values, ...vector2.values],
    names: [...vector1.names, ...vector2.names],
    metadata: { ...vector1.metadata, ...vector2.metadata },
  }
}

/**
 * Normalize feature values to 0-1 range
 */
export function normalizeFeatureVector(vector: FeatureVector): FeatureVector {
  const min = Math.min(...vector.values)
  const max = Math.max(...vector.values)
  const range = max - min

  const normalizedValues =
    range === 0
      ? vector.values.map(() => 0.5)
      : vector.values.map((v) => (v - min) / range)

  return {
    ...vector,
    values: normalizedValues,
    metadata: {
      ...vector.metadata,
      normalized: true,
      originalMin: min,
      originalMax: max,
    },
  }
}

/**
 * Validate that a prediction has all required fields
 */
export function isValidPrediction(
  prediction: unknown
): prediction is MLPrediction {
  if (!prediction || typeof prediction !== 'object') {
    return false
  }

  const p = prediction as Record<string, unknown>

  return (
    typeof p.probability === 'number' &&
    p.probability >= 0 &&
    p.probability <= 1 &&
    ['match', 'nonMatch', 'uncertain'].includes(p.classification as string) &&
    typeof p.confidence === 'number' &&
    p.confidence >= 0 &&
    p.confidence <= 1 &&
    isValidFeatureVector(p.features) &&
    Array.isArray(p.featureImportance)
  )
}

/**
 * Validate that a feature vector has all required fields
 */
export function isValidFeatureVector(vector: unknown): vector is FeatureVector {
  if (!vector || typeof vector !== 'object') {
    return false
  }

  const v = vector as Record<string, unknown>

  return (
    Array.isArray(v.values) &&
    v.values.every((val) => typeof val === 'number') &&
    Array.isArray(v.names) &&
    v.names.every((name) => typeof name === 'string') &&
    v.values.length === v.names.length
  )
}
