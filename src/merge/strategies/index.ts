/**
 * Merge strategies module - exports all strategy implementations and the registry
 * @module merge/strategies
 */

// Strategy registry
export {
  registerStrategy,
  getStrategy,
  hasStrategy,
  getRegisteredStrategies,
  unregisterStrategy,
  clearStrategies,
  isBuiltInStrategy,
} from './strategy-registry.js'

// Basic strategies
export { preferFirst, preferLast, preferNonNull } from './basic-strategies.js'

// Temporal strategies
export { preferNewer, preferOlder } from './temporal-strategies.js'

// String strategies
export { preferLonger, preferShorter } from './string-strategies.js'

// Array strategies
export { concatenate, union } from './array-strategies.js'

// Numeric strategies
export { mostFrequent, average, sum, min, max } from './numeric-strategies.js'

// Import all strategies for registration
import { preferFirst, preferLast, preferNonNull } from './basic-strategies.js'
import { preferNewer, preferOlder } from './temporal-strategies.js'
import { preferLonger, preferShorter } from './string-strategies.js'
import { concatenate, union } from './array-strategies.js'
import { mostFrequent, average, sum, min, max } from './numeric-strategies.js'
import { registerStrategy } from './strategy-registry.js'

/**
 * Register all built-in strategies with the registry.
 * This function is called automatically when the module is imported.
 */
export function registerBuiltInStrategies(): void {
  // Basic strategies
  registerStrategy('preferFirst', preferFirst)
  registerStrategy('preferLast', preferLast)
  registerStrategy('preferNonNull', preferNonNull)

  // Temporal strategies
  registerStrategy('preferNewer', preferNewer)
  registerStrategy('preferOlder', preferOlder)

  // String strategies
  registerStrategy('preferLonger', preferLonger)
  registerStrategy('preferShorter', preferShorter)

  // Array strategies
  registerStrategy('concatenate', concatenate)
  registerStrategy('union', union)

  // Numeric strategies
  registerStrategy('mostFrequent', mostFrequent)
  registerStrategy('average', average)
  registerStrategy('sum', sum)
  registerStrategy('min', min)
  registerStrategy('max', max)
}

// Auto-register built-in strategies on module load
registerBuiltInStrategies()
