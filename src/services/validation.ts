/**
 * Validation functions for service configuration
 * @module services/validation
 */

import type {
  ServicePlugin,
  ServiceConfig,
  RetryConfig,
  CacheConfig,
  CircuitBreakerConfig,
  ValidationService,
  LookupService,
  CustomService,
  ServiceDefaults,
  ServicesConfig,
} from './types.js'
import {
  ServiceConfigurationError,
  ServicePluginError,
} from './service-error.js'

/**
 * Valid service types
 */
const VALID_SERVICE_TYPES = ['validation', 'lookup', 'custom'] as const

/**
 * Valid execution points
 */
const VALID_EXECUTION_POINTS = ['pre-match', 'post-match', 'both'] as const

/**
 * Valid on-failure behaviors
 */
const VALID_ON_FAILURE_BEHAVIORS = ['reject', 'continue', 'flag'] as const

/**
 * Valid on-invalid behaviors
 */
const VALID_ON_INVALID_BEHAVIORS = ['reject', 'continue', 'flag'] as const

/**
 * Valid on-not-found behaviors
 */
const VALID_ON_NOT_FOUND_BEHAVIORS = ['continue', 'flag'] as const

/**
 * Validates a service plugin
 * @param plugin - The plugin to validate
 * @throws {ServicePluginError} If plugin is invalid
 */
export function validateServicePlugin(plugin: ServicePlugin): void {
  if (!plugin) {
    throw new ServicePluginError('plugin is required')
  }

  // Validate name
  if (!plugin.name || typeof plugin.name !== 'string') {
    throw new ServicePluginError(
      'plugin name must be a non-empty string',
      plugin.name
    )
  }

  if (plugin.name.trim() !== plugin.name) {
    throw new ServicePluginError(
      'plugin name must not have leading or trailing whitespace',
      plugin.name
    )
  }

  // Validate type
  if (!plugin.type) {
    throw new ServicePluginError('plugin type is required', plugin.name)
  }

  if (
    !VALID_SERVICE_TYPES.includes(
      plugin.type as (typeof VALID_SERVICE_TYPES)[number]
    )
  ) {
    throw new ServicePluginError(
      `plugin type must be one of: ${VALID_SERVICE_TYPES.join(', ')}`,
      plugin.name,
      { providedType: plugin.type }
    )
  }

  // Validate execute function
  if (!plugin.execute || typeof plugin.execute !== 'function') {
    throw new ServicePluginError(
      'plugin must have an execute function',
      plugin.name
    )
  }

  // Validate optional healthCheck
  if (
    plugin.healthCheck !== undefined &&
    typeof plugin.healthCheck !== 'function'
  ) {
    throw new ServicePluginError(
      'healthCheck must be a function if provided',
      plugin.name
    )
  }

  // Validate optional dispose
  if (plugin.dispose !== undefined && typeof plugin.dispose !== 'function') {
    throw new ServicePluginError(
      'dispose must be a function if provided',
      plugin.name
    )
  }

  // Validate optional description
  if (
    plugin.description !== undefined &&
    typeof plugin.description !== 'string'
  ) {
    throw new ServicePluginError(
      'description must be a string if provided',
      plugin.name
    )
  }
}

/**
 * Validates a validation service plugin
 * @param plugin - The validation service plugin to validate
 * @throws {ServicePluginError} If plugin is invalid
 */
export function validateValidationServicePlugin(
  plugin: ValidationService
): void {
  validateServicePlugin(plugin)

  if (plugin.type !== 'validation') {
    throw new ServicePluginError(
      `expected type 'validation', got '${plugin.type}'`,
      plugin.name
    )
  }
}

/**
 * Validates a lookup service plugin
 * @param plugin - The lookup service plugin to validate
 * @throws {ServicePluginError} If plugin is invalid
 */
export function validateLookupServicePlugin(plugin: LookupService): void {
  validateServicePlugin(plugin)

  if (plugin.type !== 'lookup') {
    throw new ServicePluginError(
      `expected type 'lookup', got '${plugin.type}'`,
      plugin.name
    )
  }
}

/**
 * Validates a custom service plugin
 * @param plugin - The custom service plugin to validate
 * @throws {ServicePluginError} If plugin is invalid
 */
export function validateCustomServicePlugin(plugin: CustomService): void {
  validateServicePlugin(plugin)

  if (plugin.type !== 'custom') {
    throw new ServicePluginError(
      `expected type 'custom', got '${plugin.type}'`,
      plugin.name
    )
  }
}

/**
 * Validates retry configuration
 * @param config - The retry config to validate
 * @param fieldPath - Field path for error messages
 * @throws {ServiceConfigurationError} If config is invalid
 */
export function validateRetryConfig(
  config: RetryConfig,
  fieldPath: string = 'retry'
): void {
  if (!config) {
    throw new ServiceConfigurationError(fieldPath, 'retry config is required')
  }

  // Validate maxAttempts
  if (
    typeof config.maxAttempts !== 'number' ||
    !Number.isInteger(config.maxAttempts)
  ) {
    throw new ServiceConfigurationError(
      `${fieldPath}.maxAttempts`,
      'must be an integer'
    )
  }

  if (config.maxAttempts < 1) {
    throw new ServiceConfigurationError(
      `${fieldPath}.maxAttempts`,
      'must be at least 1'
    )
  }

  // Validate initialDelayMs
  if (typeof config.initialDelayMs !== 'number') {
    throw new ServiceConfigurationError(
      `${fieldPath}.initialDelayMs`,
      'must be a number'
    )
  }

  if (config.initialDelayMs < 0) {
    throw new ServiceConfigurationError(
      `${fieldPath}.initialDelayMs`,
      'must not be negative'
    )
  }

  // Validate backoffMultiplier
  if (typeof config.backoffMultiplier !== 'number') {
    throw new ServiceConfigurationError(
      `${fieldPath}.backoffMultiplier`,
      'must be a number'
    )
  }

  if (config.backoffMultiplier < 1) {
    throw new ServiceConfigurationError(
      `${fieldPath}.backoffMultiplier`,
      'must be at least 1'
    )
  }

  // Validate maxDelayMs
  if (typeof config.maxDelayMs !== 'number') {
    throw new ServiceConfigurationError(
      `${fieldPath}.maxDelayMs`,
      'must be a number'
    )
  }

  if (config.maxDelayMs < config.initialDelayMs) {
    throw new ServiceConfigurationError(
      `${fieldPath}.maxDelayMs`,
      'must be greater than or equal to initialDelayMs'
    )
  }

  // Validate retryOn array if provided
  if (config.retryOn !== undefined) {
    if (!Array.isArray(config.retryOn)) {
      throw new ServiceConfigurationError(
        `${fieldPath}.retryOn`,
        'must be an array'
      )
    }

    const validRetryOn = ['timeout', 'network', 'server', 'all']
    for (const item of config.retryOn) {
      if (!validRetryOn.includes(item)) {
        throw new ServiceConfigurationError(
          `${fieldPath}.retryOn`,
          `invalid value '${item}', must be one of: ${validRetryOn.join(', ')}`
        )
      }
    }
  }
}

/**
 * Validates cache configuration
 * @param config - The cache config to validate
 * @param fieldPath - Field path for error messages
 * @throws {ServiceConfigurationError} If config is invalid
 */
export function validateCacheConfig(
  config: CacheConfig,
  fieldPath: string = 'cache'
): void {
  if (!config) {
    throw new ServiceConfigurationError(fieldPath, 'cache config is required')
  }

  // Validate enabled
  if (typeof config.enabled !== 'boolean') {
    throw new ServiceConfigurationError(
      `${fieldPath}.enabled`,
      'must be a boolean'
    )
  }

  // Validate ttlSeconds
  if (typeof config.ttlSeconds !== 'number') {
    throw new ServiceConfigurationError(
      `${fieldPath}.ttlSeconds`,
      'must be a number'
    )
  }

  if (config.ttlSeconds <= 0) {
    throw new ServiceConfigurationError(
      `${fieldPath}.ttlSeconds`,
      'must be positive'
    )
  }

  // Validate optional keyFn
  if (config.keyFn !== undefined && typeof config.keyFn !== 'function') {
    throw new ServiceConfigurationError(
      `${fieldPath}.keyFn`,
      'must be a function if provided'
    )
  }

  // Validate optional staleOnError
  if (
    config.staleOnError !== undefined &&
    typeof config.staleOnError !== 'boolean'
  ) {
    throw new ServiceConfigurationError(
      `${fieldPath}.staleOnError`,
      'must be a boolean if provided'
    )
  }
}

/**
 * Validates circuit breaker configuration
 * @param config - The circuit breaker config to validate
 * @param fieldPath - Field path for error messages
 * @throws {ServiceConfigurationError} If config is invalid
 */
export function validateCircuitBreakerConfig(
  config: CircuitBreakerConfig,
  fieldPath: string = 'circuitBreaker'
): void {
  if (!config) {
    throw new ServiceConfigurationError(
      fieldPath,
      'circuit breaker config is required'
    )
  }

  // Validate failureThreshold
  if (
    typeof config.failureThreshold !== 'number' ||
    !Number.isInteger(config.failureThreshold)
  ) {
    throw new ServiceConfigurationError(
      `${fieldPath}.failureThreshold`,
      'must be an integer'
    )
  }

  if (config.failureThreshold < 1) {
    throw new ServiceConfigurationError(
      `${fieldPath}.failureThreshold`,
      'must be at least 1'
    )
  }

  // Validate resetTimeoutMs
  if (typeof config.resetTimeoutMs !== 'number') {
    throw new ServiceConfigurationError(
      `${fieldPath}.resetTimeoutMs`,
      'must be a number'
    )
  }

  if (config.resetTimeoutMs <= 0) {
    throw new ServiceConfigurationError(
      `${fieldPath}.resetTimeoutMs`,
      'must be positive'
    )
  }

  // Validate successThreshold
  if (
    typeof config.successThreshold !== 'number' ||
    !Number.isInteger(config.successThreshold)
  ) {
    throw new ServiceConfigurationError(
      `${fieldPath}.successThreshold`,
      'must be an integer'
    )
  }

  if (config.successThreshold < 1) {
    throw new ServiceConfigurationError(
      `${fieldPath}.successThreshold`,
      'must be at least 1'
    )
  }

  // Validate failureWindowMs
  if (typeof config.failureWindowMs !== 'number') {
    throw new ServiceConfigurationError(
      `${fieldPath}.failureWindowMs`,
      'must be a number'
    )
  }

  if (config.failureWindowMs <= 0) {
    throw new ServiceConfigurationError(
      `${fieldPath}.failureWindowMs`,
      'must be positive'
    )
  }
}

/**
 * Validates a service configuration
 * @param config - The service config to validate
 * @param fieldPath - Field path for error messages
 * @throws {ServiceConfigurationError | ServicePluginError} If config is invalid
 */
export function validateServiceConfig(
  config: ServiceConfig,
  fieldPath: string = 'service'
): void {
  if (!config) {
    throw new ServiceConfigurationError(fieldPath, 'service config is required')
  }

  // Validate plugin
  validateServicePlugin(config.plugin)

  // Validate executionPoint
  if (!config.executionPoint) {
    throw new ServiceConfigurationError(
      `${fieldPath}.executionPoint`,
      'executionPoint is required'
    )
  }

  if (
    !VALID_EXECUTION_POINTS.includes(
      config.executionPoint as (typeof VALID_EXECUTION_POINTS)[number]
    )
  ) {
    throw new ServiceConfigurationError(
      `${fieldPath}.executionPoint`,
      `must be one of: ${VALID_EXECUTION_POINTS.join(', ')}`
    )
  }

  // Validate onFailure
  if (!config.onFailure) {
    throw new ServiceConfigurationError(
      `${fieldPath}.onFailure`,
      'onFailure is required'
    )
  }

  if (
    !VALID_ON_FAILURE_BEHAVIORS.includes(
      config.onFailure as (typeof VALID_ON_FAILURE_BEHAVIORS)[number]
    )
  ) {
    throw new ServiceConfigurationError(
      `${fieldPath}.onFailure`,
      `must be one of: ${VALID_ON_FAILURE_BEHAVIORS.join(', ')}`
    )
  }

  // Validate onInvalid (for validation services)
  if (config.onInvalid !== undefined) {
    if (
      !VALID_ON_INVALID_BEHAVIORS.includes(
        config.onInvalid as (typeof VALID_ON_INVALID_BEHAVIORS)[number]
      )
    ) {
      throw new ServiceConfigurationError(
        `${fieldPath}.onInvalid`,
        `must be one of: ${VALID_ON_INVALID_BEHAVIORS.join(', ')}`
      )
    }
  }

  // Validate onNotFound (for lookup services)
  if (config.onNotFound !== undefined) {
    if (
      !VALID_ON_NOT_FOUND_BEHAVIORS.includes(
        config.onNotFound as (typeof VALID_ON_NOT_FOUND_BEHAVIORS)[number]
      )
    ) {
      throw new ServiceConfigurationError(
        `${fieldPath}.onNotFound`,
        `must be one of: ${VALID_ON_NOT_FOUND_BEHAVIORS.join(', ')}`
      )
    }
  }

  // Validate optional timeout
  if (config.timeout !== undefined) {
    if (typeof config.timeout !== 'number') {
      throw new ServiceConfigurationError(
        `${fieldPath}.timeout`,
        'must be a number'
      )
    }

    if (config.timeout <= 0) {
      throw new ServiceConfigurationError(
        `${fieldPath}.timeout`,
        'must be positive'
      )
    }
  }

  // Validate optional priority
  if (config.priority !== undefined) {
    if (
      typeof config.priority !== 'number' ||
      !Number.isInteger(config.priority)
    ) {
      throw new ServiceConfigurationError(
        `${fieldPath}.priority`,
        'must be an integer'
      )
    }
  }

  // Validate optional required
  if (config.required !== undefined && typeof config.required !== 'boolean') {
    throw new ServiceConfigurationError(
      `${fieldPath}.required`,
      'must be a boolean'
    )
  }

  // Validate optional fields array
  if (config.fields !== undefined) {
    if (!Array.isArray(config.fields)) {
      throw new ServiceConfigurationError(
        `${fieldPath}.fields`,
        'must be an array'
      )
    }

    for (let i = 0; i < config.fields.length; i++) {
      if (typeof config.fields[i] !== 'string' || !config.fields[i]) {
        throw new ServiceConfigurationError(
          `${fieldPath}.fields[${i}]`,
          'must be a non-empty string'
        )
      }
    }
  }

  // Validate optional fieldMapping
  if (config.fieldMapping !== undefined) {
    if (
      typeof config.fieldMapping !== 'object' ||
      config.fieldMapping === null
    ) {
      throw new ServiceConfigurationError(
        `${fieldPath}.fieldMapping`,
        'must be an object'
      )
    }

    for (const [key, value] of Object.entries(config.fieldMapping)) {
      if (typeof value !== 'string' || !value) {
        throw new ServiceConfigurationError(
          `${fieldPath}.fieldMapping.${key}`,
          'must be a non-empty string'
        )
      }
    }
  }

  // Validate optional retry config
  if (config.retry !== undefined) {
    validateRetryConfig(config.retry, `${fieldPath}.retry`)
  }

  // Validate optional cache config
  if (config.cache !== undefined) {
    validateCacheConfig(config.cache, `${fieldPath}.cache`)
  }

  // Validate optional resultPredicate
  if (
    config.resultPredicate !== undefined &&
    typeof config.resultPredicate !== 'function'
  ) {
    throw new ServiceConfigurationError(
      `${fieldPath}.resultPredicate`,
      'must be a function if provided'
    )
  }

  // Validate optional customParams
  if (config.customParams !== undefined) {
    if (
      typeof config.customParams !== 'object' ||
      config.customParams === null
    ) {
      throw new ServiceConfigurationError(
        `${fieldPath}.customParams`,
        'must be an object if provided'
      )
    }
  }
}

/**
 * Validates service defaults configuration
 * @param defaults - The defaults to validate
 * @param fieldPath - Field path for error messages
 * @throws {ServiceConfigurationError} If config is invalid
 */
export function validateServiceDefaults(
  defaults: ServiceDefaults,
  fieldPath: string = 'defaults'
): void {
  if (!defaults) {
    return // Defaults are optional
  }

  // Validate optional timeout
  if (defaults.timeout !== undefined) {
    if (typeof defaults.timeout !== 'number') {
      throw new ServiceConfigurationError(
        `${fieldPath}.timeout`,
        'must be a number'
      )
    }

    if (defaults.timeout <= 0) {
      throw new ServiceConfigurationError(
        `${fieldPath}.timeout`,
        'must be positive'
      )
    }
  }

  // Validate optional retry
  if (defaults.retry !== undefined) {
    validateRetryConfig(defaults.retry, `${fieldPath}.retry`)
  }

  // Validate optional cache
  if (defaults.cache !== undefined) {
    validateCacheConfig(defaults.cache, `${fieldPath}.cache`)
  }

  // Validate optional circuitBreaker
  if (defaults.circuitBreaker !== undefined) {
    validateCircuitBreakerConfig(
      defaults.circuitBreaker,
      `${fieldPath}.circuitBreaker`
    )
  }
}

/**
 * Validates complete services configuration
 * @param config - The services config to validate
 * @throws {ServiceConfigurationError | ServicePluginError} If config is invalid
 */
export function validateServicesConfig(config: ServicesConfig): void {
  if (!config) {
    throw new ServiceConfigurationError(
      'services',
      'services config is required'
    )
  }

  // Validate services array
  if (!Array.isArray(config.services)) {
    throw new ServiceConfigurationError('services', 'must be an array')
  }

  // Validate each service config
  const serviceNames = new Set<string>()
  for (let i = 0; i < config.services.length; i++) {
    validateServiceConfig(config.services[i], `services[${i}]`)

    // Check for duplicate names
    const name = config.services[i].plugin.name
    if (serviceNames.has(name)) {
      throw new ServiceConfigurationError(
        `services[${i}]`,
        `duplicate service name '${name}'`
      )
    }
    serviceNames.add(name)
  }

  // Validate optional defaults
  if (config.defaults !== undefined) {
    validateServiceDefaults(config.defaults, 'defaults')
  }

  // Validate optional cachingEnabled
  if (
    config.cachingEnabled !== undefined &&
    typeof config.cachingEnabled !== 'boolean'
  ) {
    throw new ServiceConfigurationError('cachingEnabled', 'must be a boolean')
  }

  // Validate optional executionOrder
  if (config.executionOrder !== undefined) {
    if (!Array.isArray(config.executionOrder)) {
      throw new ServiceConfigurationError('executionOrder', 'must be an array')
    }

    for (let i = 0; i < config.executionOrder.length; i++) {
      const name = config.executionOrder[i]
      if (typeof name !== 'string') {
        throw new ServiceConfigurationError(
          `executionOrder[${i}]`,
          'must be a string'
        )
      }

      // Check that the service exists
      if (!serviceNames.has(name)) {
        throw new ServiceConfigurationError(
          `executionOrder[${i}]`,
          `service '${name}' not found in services array`
        )
      }
    }
  }
}

/**
 * Checks if a plugin is a validation service
 */
export function isValidationService(
  plugin: ServicePlugin
): plugin is ValidationService {
  return plugin.type === 'validation'
}

/**
 * Checks if a plugin is a lookup service
 */
export function isLookupService(
  plugin: ServicePlugin
): plugin is LookupService {
  return plugin.type === 'lookup'
}

/**
 * Checks if a plugin is a custom service
 */
export function isCustomService(
  plugin: ServicePlugin
): plugin is CustomService {
  return plugin.type === 'custom'
}
