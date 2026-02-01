/**
 * ML Training Module
 *
 * Training utilities for creating custom ML models.
 */

// Trainer
export {
  ModelTrainer,
  createTrainingExample,
  createTrainingDataset,
  mergeTrainingDatasets,
  balanceDataset,
  getDatasetStats,
  exportWeightsToJson,
} from './trainer';

export type {
  TrainerOptions,
  TrainingProgressCallback,
} from './trainer';
