/**
 * Model Trainer
 *
 * Training orchestrator for creating custom ML models from labeled data.
 * Implements gradient descent training for logistic regression.
 */

import type {
  TrainingConfig,
  TrainingExample,
  TrainingDataset,
  TrainingMetrics,
  TrainingResult,
  FeatureVector,
  RecordPair,
} from '../types';
import { DEFAULT_TRAINING_CONFIG } from '../types';
import { SimpleClassifier } from '../builtin/simple-classifier';
import { FeatureExtractor } from '../feature-extractor';
import type { FeatureExtractionConfig } from '../types';

/**
 * Training progress callback
 */
export type TrainingProgressCallback = (metrics: TrainingMetrics) => void;

/**
 * Training options
 */
export interface TrainerOptions<T> {
  /** Training configuration */
  config?: Partial<TrainingConfig>;
  /** Feature extraction configuration */
  featureConfig?: FeatureExtractionConfig;
  /** Feature extractor instance (alternative to featureConfig) */
  featureExtractor?: FeatureExtractor<T>;
  /** Progress callback */
  onProgress?: TrainingProgressCallback;
  /** Log interval (iterations between progress callbacks) */
  progressInterval?: number;
  /** Random seed for reproducibility */
  seed?: number;
}

/**
 * Prepared training data with extracted features
 */
interface PreparedData {
  features: number[][];
  labels: number[];
  featureNames: string[];
}

/**
 * Model Trainer class
 *
 * Trains logistic regression models using gradient descent with L2 regularization.
 */
export class ModelTrainer<T = Record<string, unknown>> {
  private readonly config: TrainingConfig;
  private featureExtractor: FeatureExtractor<T> | null = null;
  private readonly onProgress?: TrainingProgressCallback;
  private readonly progressInterval: number;
  private readonly seed?: number;

  constructor(options: TrainerOptions<T> = {}) {
    this.config = { ...DEFAULT_TRAINING_CONFIG, ...options.config };
    this.onProgress = options.onProgress;
    this.progressInterval = options.progressInterval ?? 10;
    this.seed = options.seed ?? options.config?.seed;

    // Initialize feature extractor
    if (options.featureExtractor) {
      this.featureExtractor = options.featureExtractor;
    } else if (options.featureConfig) {
      this.featureExtractor = new FeatureExtractor<T>(options.featureConfig);
    }
  }

  /**
   * Set the feature extractor
   */
  setFeatureExtractor(extractor: FeatureExtractor<T>): void {
    this.featureExtractor = extractor;
  }

  /**
   * Train a model from labeled examples
   */
  async train(dataset: TrainingDataset<T>): Promise<TrainingResult> {
    const startTime = performance.now();

    // Validate dataset
    if (!dataset.examples || dataset.examples.length === 0) {
      return {
        success: false,
        finalMetrics: {
          iteration: 0,
          trainingLoss: Infinity,
          trainingAccuracy: 0,
        },
        history: [],
        trainingTimeMs: performance.now() - startTime,
        earlyStopped: false,
        error: 'Dataset must contain at least one example',
      };
    }

    // Ensure feature extractor is configured
    if (!this.featureExtractor) {
      return {
        success: false,
        finalMetrics: {
          iteration: 0,
          trainingLoss: Infinity,
          trainingAccuracy: 0,
        },
        history: [],
        trainingTimeMs: performance.now() - startTime,
        earlyStopped: false,
        error: 'Feature extractor not configured. Call setFeatureExtractor() first.',
      };
    }

    try {
      // Split data into train/validation
      const { trainData, valData } = this.splitData(dataset.examples);

      // Extract features
      const trainPrepared = this.prepareData(trainData);
      const valPrepared = valData.length > 0 ? this.prepareData(valData) : null;

      // Initialize weights
      const featureCount = trainPrepared.featureNames.length;
      const { weights, bias } = this.initializeWeights(featureCount);

      // Training loop
      const history: TrainingMetrics[] = [];
      let currentWeights = weights;
      let currentBias = bias;
      let bestValLoss = Infinity;
      let patienceCounter = 0;
      let earlyStopped = false;

      for (let iteration = 1; iteration <= this.config.maxIterations; iteration++) {
        // Compute gradients and update weights
        const { weightGradients, biasGradient, loss } = this.computeGradients(
          trainPrepared.features,
          trainPrepared.labels,
          currentWeights,
          currentBias
        );

        // Update weights with gradient descent
        currentWeights = currentWeights.map(
          (w, i) => w - this.config.learningRate * weightGradients[i]
        );
        currentBias = currentBias - this.config.learningRate * biasGradient;

        // Compute metrics
        const trainAcc = this.computeAccuracy(
          trainPrepared.features,
          trainPrepared.labels,
          currentWeights,
          currentBias
        );

        const metrics: TrainingMetrics = {
          iteration,
          trainingLoss: loss,
          trainingAccuracy: trainAcc,
        };

        // Validation metrics
        if (valPrepared) {
          const valLoss = this.computeLoss(
            valPrepared.features,
            valPrepared.labels,
            currentWeights,
            currentBias
          );
          const valAcc = this.computeAccuracy(
            valPrepared.features,
            valPrepared.labels,
            currentWeights,
            currentBias
          );
          metrics.validationLoss = valLoss;
          metrics.validationAccuracy = valAcc;

          // Early stopping check
          if (valLoss < bestValLoss - this.config.minImprovement) {
            bestValLoss = valLoss;
            patienceCounter = 0;
          } else {
            patienceCounter++;
          }

          if (patienceCounter >= this.config.earlyStoppingPatience) {
            earlyStopped = true;
            history.push(metrics);
            break;
          }
        }

        history.push(metrics);

        // Progress callback
        if (this.onProgress && iteration % this.progressInterval === 0) {
          this.onProgress(metrics);
        }
      }

      const finalMetrics = history[history.length - 1];

      return {
        success: true,
        weights: currentWeights,
        bias: currentBias,
        finalMetrics,
        history,
        trainingTimeMs: performance.now() - startTime,
        earlyStopped,
      };
    } catch (error) {
      return {
        success: false,
        finalMetrics: {
          iteration: 0,
          trainingLoss: Infinity,
          trainingAccuracy: 0,
        },
        history: [],
        trainingTimeMs: performance.now() - startTime,
        earlyStopped: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Train and return a ready-to-use SimpleClassifier
   */
  async trainClassifier(dataset: TrainingDataset<T>): Promise<{
    classifier: SimpleClassifier<T> | null;
    result: TrainingResult;
  }> {
    const result = await this.train(dataset);

    if (!result.success || !result.weights || result.bias === undefined) {
      return { classifier: null, result };
    }

    // Create classifier with trained weights
    const classifier = new SimpleClassifier<T>({
      featureExtractor: this.featureExtractor!,
    });

    classifier.setWeightsAndBias(result.weights, result.bias);

    // Update metadata using setTrainingMetadata
    classifier.setTrainingMetadata(
      new Date(),
      result.finalMetrics.validationAccuracy ?? result.finalMetrics.trainingAccuracy,
      dataset.examples.length
    );

    return { classifier, result };
  }

  /**
   * Split data into training and validation sets
   */
  private splitData(
    examples: TrainingExample<T>[]
  ): { trainData: TrainingExample<T>[]; valData: TrainingExample<T>[] } {
    if (this.config.validationSplit <= 0 || this.config.validationSplit >= 1) {
      return { trainData: examples, valData: [] };
    }

    // Shuffle data
    const shuffled = this.shuffle([...examples]);

    // Split
    const valSize = Math.floor(shuffled.length * this.config.validationSplit);
    const valData = shuffled.slice(0, valSize);
    const trainData = shuffled.slice(valSize);

    return { trainData, valData };
  }

  /**
   * Prepare data by extracting features
   */
  private prepareData(examples: TrainingExample<T>[]): PreparedData {
    const features: number[][] = [];
    const labels: number[] = [];

    for (const example of examples) {
      const featureVector = this.featureExtractor!.extract(example.pair);
      features.push(featureVector.values);
      labels.push(example.label === 'match' ? 1 : 0);
    }

    return {
      features,
      labels,
      featureNames: this.featureExtractor!.getFeatureNames(),
    };
  }

  /**
   * Initialize weights randomly
   */
  private initializeWeights(featureCount: number): { weights: number[]; bias: number } {
    const rng = this.seed !== undefined ? seededRandom(this.seed) : Math.random;

    // Xavier/Glorot initialization scale
    const scale = Math.sqrt(2.0 / featureCount);

    const weights = Array.from({ length: featureCount }, () => (rng() - 0.5) * scale);
    const bias = (rng() - 0.5) * scale;

    return { weights, bias };
  }

  /**
   * Compute gradients using binary cross-entropy loss with L2 regularization
   */
  private computeGradients(
    features: number[][],
    labels: number[],
    weights: number[],
    bias: number
  ): { weightGradients: number[]; biasGradient: number; loss: number } {
    const n = features.length;
    const weightGradients = new Array(weights.length).fill(0);
    let biasGradient = 0;
    let totalLoss = 0;

    for (let i = 0; i < n; i++) {
      // Forward pass
      const logit = this.dotProduct(features[i], weights) + bias;
      const prediction = this.sigmoid(logit);

      // Compute loss (binary cross-entropy)
      const y = labels[i];
      const eps = 1e-15; // Small epsilon to avoid log(0)
      const clampedPred = Math.max(eps, Math.min(1 - eps, prediction));
      totalLoss += -y * Math.log(clampedPred) - (1 - y) * Math.log(1 - clampedPred);

      // Compute error
      const error = prediction - y;

      // Accumulate gradients
      for (let j = 0; j < weights.length; j++) {
        weightGradients[j] += error * features[i][j];
      }
      biasGradient += error;
    }

    // Average gradients
    for (let j = 0; j < weights.length; j++) {
      weightGradients[j] /= n;
      // Add L2 regularization gradient
      weightGradients[j] += this.config.regularization * weights[j];
    }
    biasGradient /= n;

    // Add L2 regularization to loss
    const l2Penalty =
      (this.config.regularization / 2) *
      weights.reduce((sum, w) => sum + w * w, 0);
    totalLoss = totalLoss / n + l2Penalty;

    return { weightGradients, biasGradient, loss: totalLoss };
  }

  /**
   * Compute loss without gradients (for validation)
   */
  private computeLoss(
    features: number[][],
    labels: number[],
    weights: number[],
    bias: number
  ): number {
    const n = features.length;
    let totalLoss = 0;
    const eps = 1e-15;

    for (let i = 0; i < n; i++) {
      const logit = this.dotProduct(features[i], weights) + bias;
      const prediction = this.sigmoid(logit);
      const y = labels[i];
      const clampedPred = Math.max(eps, Math.min(1 - eps, prediction));
      totalLoss += -y * Math.log(clampedPred) - (1 - y) * Math.log(1 - clampedPred);
    }

    // Add L2 regularization
    const l2Penalty =
      (this.config.regularization / 2) *
      weights.reduce((sum, w) => sum + w * w, 0);

    return totalLoss / n + l2Penalty;
  }

  /**
   * Compute accuracy
   */
  private computeAccuracy(
    features: number[][],
    labels: number[],
    weights: number[],
    bias: number,
    threshold: number = 0.5
  ): number {
    let correct = 0;

    for (let i = 0; i < features.length; i++) {
      const logit = this.dotProduct(features[i], weights) + bias;
      const prediction = this.sigmoid(logit);
      const predicted = prediction >= threshold ? 1 : 0;
      if (predicted === labels[i]) {
        correct++;
      }
    }

    return correct / features.length;
  }

  /**
   * Sigmoid activation function
   */
  private sigmoid(z: number): number {
    const clampedZ = Math.max(-500, Math.min(500, z));
    return 1 / (1 + Math.exp(-clampedZ));
  }

  /**
   * Dot product of two vectors
   */
  private dotProduct(a: number[], b: number[]): number {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      sum += a[i] * b[i];
    }
    return sum;
  }

  /**
   * Shuffle array (Fisher-Yates)
   */
  private shuffle<U>(array: U[]): U[] {
    const rng = this.seed !== undefined ? seededRandom(this.seed + 1) : Math.random;

    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  /**
   * Get the training configuration
   */
  getConfig(): TrainingConfig {
    return { ...this.config };
  }

  /**
   * Get the feature extractor
   */
  getFeatureExtractor(): FeatureExtractor<T> | null {
    return this.featureExtractor;
  }
}

/**
 * Simple seeded random number generator for reproducibility
 */
function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

/**
 * Create training examples from record pairs with known labels
 */
export function createTrainingExample<T>(
  pair: RecordPair<T>,
  label: 'match' | 'nonMatch',
  source?: string
): TrainingExample<T> {
  return {
    pair,
    label,
    source,
    timestamp: new Date(),
  };
}

/**
 * Create a training dataset from examples
 */
export function createTrainingDataset<T>(
  examples: TrainingExample<T>[],
  metadata?: TrainingDataset<T>['metadata']
): TrainingDataset<T> {
  const matchCount = examples.filter((e) => e.label === 'match').length;
  const nonMatchCount = examples.length - matchCount;

  return {
    examples,
    metadata: {
      ...metadata,
      createdAt: new Date(),
      matchCount,
      nonMatchCount,
    },
  };
}

/**
 * Merge multiple training datasets
 */
export function mergeTrainingDatasets<T>(
  ...datasets: TrainingDataset<T>[]
): TrainingDataset<T> {
  const allExamples = datasets.flatMap((d) => d.examples);
  return createTrainingDataset(allExamples);
}

/**
 * Balance a training dataset by undersampling the majority class
 */
export function balanceDataset<T>(
  dataset: TrainingDataset<T>,
  seed?: number
): TrainingDataset<T> {
  const matches = dataset.examples.filter((e) => e.label === 'match');
  const nonMatches = dataset.examples.filter((e) => e.label === 'nonMatch');

  const minCount = Math.min(matches.length, nonMatches.length);

  // Shuffle and take minCount from each
  const rng = seed !== undefined ? seededRandom(seed) : Math.random;
  const shuffle = <U>(arr: U[]): U[] => {
    const shuffled = [...arr];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  };

  const balancedMatches = shuffle(matches).slice(0, minCount);
  const balancedNonMatches = shuffle(nonMatches).slice(0, minCount);

  return createTrainingDataset([...balancedMatches, ...balancedNonMatches]);
}

/**
 * Calculate dataset statistics
 */
export function getDatasetStats<T>(dataset: TrainingDataset<T>): {
  totalExamples: number;
  matchCount: number;
  nonMatchCount: number;
  matchRatio: number;
  isBalanced: boolean;
} {
  const matchCount = dataset.examples.filter((e) => e.label === 'match').length;
  const nonMatchCount = dataset.examples.length - matchCount;
  const total = dataset.examples.length;
  const matchRatio = total > 0 ? matchCount / total : 0;

  // Consider balanced if ratio is between 0.4 and 0.6
  const isBalanced = matchRatio >= 0.4 && matchRatio <= 0.6;

  return {
    totalExamples: total,
    matchCount,
    nonMatchCount,
    matchRatio,
    isBalanced,
  };
}

/**
 * Export training result weights to JSON format
 */
export function exportWeightsToJson(
  result: TrainingResult,
  featureNames: string[],
  modelName: string = 'CustomModel'
): string {
  if (!result.success || !result.weights || result.bias === undefined) {
    throw new Error('Cannot export weights from failed training');
  }

  const weightsData = {
    modelType: 'SimpleClassifier',
    version: '1.0.0',
    weights: result.weights,
    bias: result.bias,
    featureNames,
    extra: {
      trainedAt: new Date().toISOString(),
      accuracy: result.finalMetrics.validationAccuracy ?? result.finalMetrics.trainingAccuracy,
      modelName,
    },
  };

  return JSON.stringify(weightsData, null, 2);
}
