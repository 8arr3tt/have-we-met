/**
 * Built-in ML Models
 *
 * Pre-built ML models for common identity matching scenarios.
 */

import { SimpleClassifier as SimpleClassifierClass } from './simple-classifier';
import { FeatureExtractor } from '../feature-extractor';
import type { MLModelWeights } from '../model-interface';
import { DEFAULT_PERSON_FEATURE_CONFIG as DefaultConfig } from './default-features';

// Simple Classifier
export {
  SimpleClassifier,
  createPersonMatchingClassifier,
  createClassifierFromFields,
  isValidSimpleClassifierWeights,
} from './simple-classifier';

export type { SimpleClassifierConfig } from './simple-classifier';

// Default Feature Configurations
export {
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
} from './default-features';

// Pre-trained Weights
import pretrainedWeights from './weights.json';
export { pretrainedWeights };

/**
 * Create a pre-trained classifier ready for person/customer matching.
 *
 * This loads the default pre-trained weights and configures the feature extractor
 * for common person identity fields (firstName, lastName, email, phone, dateOfBirth, address, ssn).
 */
export async function createPretrainedClassifier<T = Record<string, unknown>>(): Promise<
  SimpleClassifierClass<T>
> {
  const featureExtractor = new FeatureExtractor<T>(DefaultConfig);
  const classifier = new SimpleClassifierClass<T>({ featureExtractor });
  await classifier.loadWeights(pretrainedWeights as MLModelWeights);
  return classifier;
}
