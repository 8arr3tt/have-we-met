/**
 * Strategy registry for managing merge strategies
 * @module merge/strategies/strategy-registry
 */

import type { StrategyFunction, MergeStrategy } from '../types.js'
import { InvalidStrategyError } from '../merge-error.js'

/**
 * Registry mapping strategy names to their implementations
 */
const strategyRegistry = new Map<string, StrategyFunction>()

/**
 * Register a strategy implementation
 *
 * @param name - The strategy name (can be a built-in MergeStrategy or custom name)
 * @param fn - The strategy function implementation
 * @throws {InvalidStrategyError} If strategy name is empty
 *
 * @example
 * ```typescript
 * registerStrategy('myCustomStrategy', (values, records) => {
 *   // Custom logic to select/compute value
 *   return values.find(v => v !== null)
 * })
 * ```
 */
export function registerStrategy<T = unknown>(name: string, fn: StrategyFunction<T>): void {
  if (!name || name.trim() === '') {
    throw new InvalidStrategyError('Strategy name cannot be empty')
  }
  strategyRegistry.set(name, fn as StrategyFunction)
}

/**
 * Retrieve a strategy implementation by name
 *
 * @param name - The strategy name to look up
 * @returns The strategy function
 * @throws {InvalidStrategyError} If strategy is not found
 *
 * @example
 * ```typescript
 * const strategy = getStrategy('preferFirst')
 * const result = strategy(values, records, options)
 * ```
 */
export function getStrategy<T = unknown>(name: string): StrategyFunction<T> {
  const strategy = strategyRegistry.get(name)
  if (!strategy) {
    throw new InvalidStrategyError(
      `Unknown strategy '${name}'. Available strategies: ${getRegisteredStrategies().join(', ')}`,
    )
  }
  return strategy as StrategyFunction<T>
}

/**
 * Check if a strategy is registered
 *
 * @param name - The strategy name to check
 * @returns True if the strategy is registered
 */
export function hasStrategy(name: string): boolean {
  return strategyRegistry.has(name)
}

/**
 * Get all registered strategy names
 *
 * @returns Array of registered strategy names
 */
export function getRegisteredStrategies(): string[] {
  return Array.from(strategyRegistry.keys())
}

/**
 * Remove a strategy from the registry
 *
 * @param name - The strategy name to remove
 * @returns True if the strategy was removed, false if it wasn't registered
 */
export function unregisterStrategy(name: string): boolean {
  return strategyRegistry.delete(name)
}

/**
 * Clear all registered strategies (useful for testing)
 */
export function clearStrategies(): void {
  strategyRegistry.clear()
}

/**
 * Check if a strategy name is a built-in MergeStrategy
 *
 * @param name - The strategy name to check
 * @returns True if it's a built-in strategy
 */
export function isBuiltInStrategy(name: string): name is MergeStrategy {
  const builtInStrategies: string[] = [
    'preferFirst',
    'preferLast',
    'preferNewer',
    'preferOlder',
    'preferNonNull',
    'preferLonger',
    'preferShorter',
    'concatenate',
    'union',
    'mostFrequent',
    'average',
    'sum',
    'min',
    'max',
    'custom',
  ]
  return builtInStrategies.includes(name)
}
