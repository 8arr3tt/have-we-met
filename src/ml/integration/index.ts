/**
 * ML Integration Module
 *
 * Exports for integrating ML models with the resolver.
 */

export {
  MLMatchIntegrator,
  createMLIntegrator,
  isMLMatchResult,
} from './resolver-integration'

export type {
  MLMatchResult,
  MLMatchOptions,
  MLMatchStats,
} from './resolver-integration'

// Builder integration
export {
  MLBuilder,
  FieldFeatureBuilder,
  mlBuilder,
  createModelFromConfig,
  validateMLBuilderConfig,
} from './builder-integration'

export type { MLBuilderConfig, MLBuilderResult } from './builder-integration'
