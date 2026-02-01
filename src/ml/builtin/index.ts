/**
 * Built-in ML Models
 *
 * Pre-built ML models for common identity matching scenarios.
 */

// Simple Classifier
export {
  SimpleClassifier,
  createPersonMatchingClassifier,
  createClassifierFromFields,
  isValidSimpleClassifierWeights,
} from './simple-classifier';

export type { SimpleClassifierConfig } from './simple-classifier';
