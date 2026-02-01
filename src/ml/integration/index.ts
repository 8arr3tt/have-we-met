/**
 * ML Integration Module
 *
 * Exports for integrating ML models with the resolver.
 */

export {
  MLMatchIntegrator,
  createMLIntegrator,
  isMLMatchResult,
} from './resolver-integration';

export type {
  MLMatchResult,
  MLMatchOptions,
  MLMatchStats,
} from './resolver-integration';
