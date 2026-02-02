/**
 * Fluent builder for configuring external services
 * @module builder/service-builder
 */

import type {
  ServiceConfig,
  ValidationService,
  LookupService,
  CustomService,
  RetryConfig,
  CacheConfig,
  ExecutionPoint,
  OnFailureBehavior,
  OnInvalidBehavior,
  OnNotFoundBehavior,
  CustomOutput,
  ServiceDefaults,
  ServicesConfig,
} from '../services/types.js'

/**
 * Error thrown when service builder configuration is invalid
 */
export class ServiceBuilderError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ServiceBuilderError'
  }
}

/**
 * Base interface for chainable service builders
 */
export interface ChainableServiceBuilder<T extends Record<string, unknown>> {
  validate(field: keyof T | string): ValidationServiceBuilder<T>
  lookup(field: keyof T | string): LookupServiceBuilder<T>
  custom(name: string): CustomServiceBuilder<T>
}

/**
 * Partial service config used during building
 */
interface PartialServiceConfig {
  plugin?: ValidationService | LookupService | CustomService
  fields?: string[]
  fieldMapping?: Record<string, string>
  executionPoint: ExecutionPoint
  onFailure: OnFailureBehavior
  onInvalid?: OnInvalidBehavior
  onNotFound?: OnNotFoundBehavior
  resultPredicate?: (result: CustomOutput) => boolean
  customParams?: Record<string, unknown>
  timeout?: number
  retry?: RetryConfig
  cache?: CacheConfig
  priority?: number
  required?: boolean
}

/**
 * Fluent builder for configuring validation services.
 *
 * @typeParam T - The record type being validated
 *
 * @example
 * ```typescript
 * services
 *   .validate('nhsNumber')
 *     .using(nhsNumberValidator)
 *     .onInvalid('reject')
 *     .required(true)
 * ```
 */
export class ValidationServiceBuilder<
  T extends Record<string, unknown>,
> implements ChainableServiceBuilder<T> {
  private config: PartialServiceConfig

  /** @internal Reference to parent builder for chaining */
  public readonly _parent: ServiceBuilder<T>

  constructor(parent: ServiceBuilder<T>, field: string) {
    this._parent = parent
    this.config = {
      fields: [field],
      executionPoint: 'pre-match',
      onFailure: 'continue',
      onInvalid: 'continue',
    }
  }

  /**
   * Set the validation service plugin to use.
   *
   * @param plugin - The validation service plugin
   * @returns This builder for chaining
   */
  using(plugin: ValidationService): this {
    this.config.plugin = plugin
    return this
  }

  /**
   * Set the behavior when validation fails.
   *
   * @param action - 'reject' to stop processing, 'continue' to proceed, 'flag' to mark
   * @returns This builder for chaining
   */
  onInvalid(action: OnInvalidBehavior): this {
    this.config.onInvalid = action
    return this
  }

  /**
   * Set the behavior when the service fails.
   *
   * @param action - 'reject' to stop, 'continue' to proceed, 'flag' to mark
   * @returns This builder for chaining
   */
  onFailure(action: OnFailureBehavior): this {
    this.config.onFailure = action
    return this
  }

  /**
   * Set the timeout for this service.
   *
   * @param ms - Timeout in milliseconds
   * @returns This builder for chaining
   */
  timeout(ms: number): this {
    if (ms <= 0) {
      throw new ServiceBuilderError('Timeout must be positive')
    }
    this.config.timeout = ms
    return this
  }

  /**
   * Set the retry configuration for this service.
   *
   * @param config - Retry configuration
   * @returns This builder for chaining
   */
  retry(config: RetryConfig): this {
    this.config.retry = config
    return this
  }

  /**
   * Set the cache configuration for this service.
   *
   * @param config - Cache configuration
   * @returns This builder for chaining
   */
  cache(config: CacheConfig): this {
    this.config.cache = config
    return this
  }

  /**
   * Set whether this service is required.
   *
   * @param isRequired - Whether the service is required
   * @returns This builder for chaining
   */
  required(isRequired: boolean): this {
    this.config.required = isRequired
    return this
  }

  /**
   * Set the priority for this service (lower = earlier execution).
   *
   * @param priority - Priority value
   * @returns This builder for chaining
   */
  priority(priority: number): this {
    this.config.priority = priority
    return this
  }

  /**
   * Configure another validation service and finalize this one.
   *
   * @param field - Field to validate
   * @returns A new ValidationServiceBuilder for the specified field
   */
  validate(field: keyof T | string): ValidationServiceBuilder<T> {
    this.finalize()
    return this._parent.validate(field)
  }

  /**
   * Configure a lookup service and finalize this one.
   *
   * @param field - Field to use as lookup key
   * @returns A new LookupServiceBuilder for the specified field
   */
  lookup(field: keyof T | string): LookupServiceBuilder<T> {
    this.finalize()
    return this._parent.lookup(field)
  }

  /**
   * Configure a custom service and finalize this one.
   *
   * @param name - Name for the custom service
   * @returns A new CustomServiceBuilder
   */
  custom(name: string): CustomServiceBuilder<T> {
    this.finalize()
    return this._parent.custom(name)
  }

  /**
   * Return to the parent ServiceBuilder.
   *
   * @returns The parent ServiceBuilder
   */
  done(): ServiceBuilder<T> {
    this.finalize()
    return this._parent
  }

  /**
   * Build and return the services configuration.
   * This is a convenience method that finalizes this service and calls build on the parent.
   *
   * @returns The complete services configuration
   */
  build(): ServicesConfig {
    return this.done().build()
  }

  /**
   * Finalize this service configuration and add it to the parent.
   * @internal
   */
  finalize(): void {
    if (this.config.plugin) {
      this._parent.addServiceConfig(this.config as ServiceConfig)
    }
  }

  /**
   * Get the current configuration for testing purposes.
   * @internal
   */
  getConfig(): PartialServiceConfig {
    return { ...this.config }
  }
}

/**
 * Fluent builder for configuring lookup services.
 *
 * @typeParam T - The record type being enriched
 *
 * @example
 * ```typescript
 * services
 *   .lookup('address')
 *     .using(addressStandardization)
 *     .mapFields({
 *       'streetAddress': 'address.street',
 *       'city': 'address.city'
 *     })
 *     .onNotFound('continue')
 * ```
 */
export class LookupServiceBuilder<
  T extends Record<string, unknown>,
> implements ChainableServiceBuilder<T> {
  private config: PartialServiceConfig

  /** @internal Reference to parent builder for chaining */
  public readonly _parent: ServiceBuilder<T>

  constructor(parent: ServiceBuilder<T>, field: string) {
    this._parent = parent
    this.config = {
      fields: [field],
      executionPoint: 'pre-match',
      onFailure: 'continue',
      onNotFound: 'continue',
    }
  }

  /**
   * Set the lookup service plugin to use.
   *
   * @param plugin - The lookup service plugin
   * @returns This builder for chaining
   */
  using(plugin: LookupService): this {
    this.config.plugin = plugin
    return this
  }

  /**
   * Map fields from the external service response to schema fields.
   *
   * @param mapping - Mapping from external field names to schema field names
   * @returns This builder for chaining
   */
  mapFields(mapping: Record<string, keyof T | string>): this {
    this.config.fieldMapping = mapping as Record<string, string>
    return this
  }

  /**
   * Add additional fields to use as lookup keys.
   *
   * @param fields - Additional fields to include in the lookup key
   * @returns This builder for chaining
   */
  withFields(...fields: (keyof T | string)[]): this {
    this.config.fields = [...(this.config.fields ?? []), ...fields.map(String)]
    return this
  }

  /**
   * Set the behavior when lookup returns no results.
   *
   * @param action - 'continue' to proceed, 'flag' to mark
   * @returns This builder for chaining
   */
  onNotFound(action: OnNotFoundBehavior): this {
    this.config.onNotFound = action
    return this
  }

  /**
   * Set the behavior when the service fails.
   *
   * @param action - 'reject' to stop, 'continue' to proceed, 'flag' to mark
   * @returns This builder for chaining
   */
  onFailure(action: OnFailureBehavior): this {
    this.config.onFailure = action
    return this
  }

  /**
   * Set the timeout for this service.
   *
   * @param ms - Timeout in milliseconds
   * @returns This builder for chaining
   */
  timeout(ms: number): this {
    if (ms <= 0) {
      throw new ServiceBuilderError('Timeout must be positive')
    }
    this.config.timeout = ms
    return this
  }

  /**
   * Set the retry configuration for this service.
   *
   * @param config - Retry configuration
   * @returns This builder for chaining
   */
  retry(config: RetryConfig): this {
    this.config.retry = config
    return this
  }

  /**
   * Set the cache configuration for this service.
   *
   * @param config - Cache configuration
   * @returns This builder for chaining
   */
  cache(config: CacheConfig): this {
    this.config.cache = config
    return this
  }

  /**
   * Set whether this service is required.
   *
   * @param isRequired - Whether the service is required
   * @returns This builder for chaining
   */
  required(isRequired: boolean): this {
    this.config.required = isRequired
    return this
  }

  /**
   * Set the priority for this service (lower = earlier execution).
   *
   * @param priority - Priority value
   * @returns This builder for chaining
   */
  priority(priority: number): this {
    this.config.priority = priority
    return this
  }

  /**
   * Configure a validation service and finalize this one.
   *
   * @param field - Field to validate
   * @returns A new ValidationServiceBuilder for the specified field
   */
  validate(field: keyof T | string): ValidationServiceBuilder<T> {
    this.finalize()
    return this._parent.validate(field)
  }

  /**
   * Configure another lookup service and finalize this one.
   *
   * @param field - Field to use as lookup key
   * @returns A new LookupServiceBuilder for the specified field
   */
  lookup(field: keyof T | string): LookupServiceBuilder<T> {
    this.finalize()
    return this._parent.lookup(field)
  }

  /**
   * Configure a custom service and finalize this one.
   *
   * @param name - Name for the custom service
   * @returns A new CustomServiceBuilder
   */
  custom(name: string): CustomServiceBuilder<T> {
    this.finalize()
    return this._parent.custom(name)
  }

  /**
   * Return to the parent ServiceBuilder.
   *
   * @returns The parent ServiceBuilder
   */
  done(): ServiceBuilder<T> {
    this.finalize()
    return this._parent
  }

  /**
   * Build and return the services configuration.
   * This is a convenience method that finalizes this service and calls build on the parent.
   *
   * @returns The complete services configuration
   */
  build(): ServicesConfig {
    return this.done().build()
  }

  /**
   * Finalize this service configuration and add it to the parent.
   * @internal
   */
  finalize(): void {
    if (this.config.plugin) {
      this._parent.addServiceConfig(this.config as ServiceConfig)
    }
  }

  /**
   * Get the current configuration for testing purposes.
   * @internal
   */
  getConfig(): PartialServiceConfig {
    return { ...this.config }
  }
}

/**
 * Fluent builder for configuring custom services.
 *
 * @typeParam T - The record type being processed
 *
 * @example
 * ```typescript
 * services
 *   .custom('fraudCheck')
 *     .using(fraudDetectionService)
 *     .executeAt('post-match')
 *     .onResult(r => r.result.riskScore < 0.7)
 * ```
 */
export class CustomServiceBuilder<
  T extends Record<string, unknown>,
> implements ChainableServiceBuilder<T> {
  private config: PartialServiceConfig
  private serviceName: string

  /** @internal Reference to parent builder for chaining */
  public readonly _parent: ServiceBuilder<T>

  constructor(parent: ServiceBuilder<T>, name: string) {
    this._parent = parent
    this.serviceName = name
    this.config = {
      executionPoint: 'pre-match',
      onFailure: 'continue',
    }
  }

  /**
   * Set the custom service plugin to use.
   *
   * @param plugin - The custom service plugin
   * @returns This builder for chaining
   */
  using(plugin: CustomService): this {
    this.config.plugin = plugin
    return this
  }

  /**
   * Set custom parameters to pass to the service.
   *
   * @param params - Custom parameters
   * @returns This builder for chaining
   */
  params(params: Record<string, unknown>): this {
    this.config.customParams = params
    return this
  }

  /**
   * Set a predicate to evaluate the service result.
   * If the predicate returns false, processing will be rejected.
   *
   * @param predicate - Function to evaluate the result
   * @returns This builder for chaining
   */
  onResult(predicate: (result: CustomOutput) => boolean): this {
    this.config.resultPredicate = predicate
    return this
  }

  /**
   * Set when this service should be executed.
   *
   * @param point - 'pre-match', 'post-match', or 'both'
   * @returns This builder for chaining
   */
  executeAt(point: ExecutionPoint): this {
    this.config.executionPoint = point
    return this
  }

  /**
   * Set the behavior when the service fails.
   *
   * @param action - 'reject' to stop, 'continue' to proceed, 'flag' to mark
   * @returns This builder for chaining
   */
  onFailure(action: OnFailureBehavior): this {
    this.config.onFailure = action
    return this
  }

  /**
   * Set the timeout for this service.
   *
   * @param ms - Timeout in milliseconds
   * @returns This builder for chaining
   */
  timeout(ms: number): this {
    if (ms <= 0) {
      throw new ServiceBuilderError('Timeout must be positive')
    }
    this.config.timeout = ms
    return this
  }

  /**
   * Set the retry configuration for this service.
   *
   * @param config - Retry configuration
   * @returns This builder for chaining
   */
  retry(config: RetryConfig): this {
    this.config.retry = config
    return this
  }

  /**
   * Set the cache configuration for this service.
   *
   * @param config - Cache configuration
   * @returns This builder for chaining
   */
  cache(config: CacheConfig): this {
    this.config.cache = config
    return this
  }

  /**
   * Set whether this service is required.
   *
   * @param isRequired - Whether the service is required
   * @returns This builder for chaining
   */
  required(isRequired: boolean): this {
    this.config.required = isRequired
    return this
  }

  /**
   * Set the priority for this service (lower = earlier execution).
   *
   * @param priority - Priority value
   * @returns This builder for chaining
   */
  priority(priority: number): this {
    this.config.priority = priority
    return this
  }

  /**
   * Configure a validation service and finalize this one.
   *
   * @param field - Field to validate
   * @returns A new ValidationServiceBuilder for the specified field
   */
  validate(field: keyof T | string): ValidationServiceBuilder<T> {
    this.finalize()
    return this._parent.validate(field)
  }

  /**
   * Configure a lookup service and finalize this one.
   *
   * @param field - Field to use as lookup key
   * @returns A new LookupServiceBuilder for the specified field
   */
  lookup(field: keyof T | string): LookupServiceBuilder<T> {
    this.finalize()
    return this._parent.lookup(field)
  }

  /**
   * Configure another custom service and finalize this one.
   *
   * @param name - Name for the custom service
   * @returns A new CustomServiceBuilder
   */
  custom(name: string): CustomServiceBuilder<T> {
    this.finalize()
    return this._parent.custom(name)
  }

  /**
   * Return to the parent ServiceBuilder.
   *
   * @returns The parent ServiceBuilder
   */
  done(): ServiceBuilder<T> {
    this.finalize()
    return this._parent
  }

  /**
   * Build and return the services configuration.
   * This is a convenience method that finalizes this service and calls build on the parent.
   *
   * @returns The complete services configuration
   */
  build(): ServicesConfig {
    return this.done().build()
  }

  /**
   * Finalize this service configuration and add it to the parent.
   * @internal
   */
  finalize(): void {
    if (this.config.plugin) {
      this._parent.addServiceConfig(this.config as ServiceConfig)
    }
  }

  /**
   * Get the current configuration for testing purposes.
   * @internal
   */
  getConfig(): PartialServiceConfig {
    return { ...this.config }
  }

  /**
   * Get the service name.
   * @internal
   */
  getName(): string {
    return this.serviceName
  }
}

/**
 * Fluent builder for configuring external services.
 *
 * @typeParam T - The record type being processed
 *
 * @example
 * ```typescript
 * const servicesConfig = new ServiceBuilder<Person>()
 *   .defaultTimeout(5000)
 *   .defaultRetry({ maxAttempts: 3, initialDelayMs: 100, backoffMultiplier: 2, maxDelayMs: 1000 })
 *   .caching(true)
 *   .validate('nhsNumber')
 *     .using(nhsNumberValidator)
 *     .onInvalid('reject')
 *     .required(true)
 *   .validate('email')
 *     .using(emailValidator)
 *     .onInvalid('flag')
 *   .lookup('address')
 *     .using(addressStandardization)
 *     .mapFields({ 'streetAddress': 'address.street' })
 *     .onNotFound('continue')
 *   .custom('fraudCheck')
 *     .using(fraudDetectionService)
 *     .executeAt('post-match')
 *     .onResult(r => r.result.riskScore < 0.7)
 *   .build()
 * ```
 */
export class ServiceBuilder<
  T extends Record<string, unknown>,
> implements ChainableServiceBuilder<T> {
  private services: ServiceConfig[] = []
  private defaults: ServiceDefaults = {}
  private _cachingEnabled: boolean = true
  private _executionOrder?: string[]
  /** @internal Track the current pending service builder for finalization */
  private _pendingBuilder?:
    | ValidationServiceBuilder<T>
    | LookupServiceBuilder<T>
    | CustomServiceBuilder<T>

  /**
   * Set the default timeout for all services.
   *
   * @param ms - Timeout in milliseconds
   * @returns This builder for chaining
   */
  defaultTimeout(ms: number): this {
    if (ms <= 0) {
      throw new ServiceBuilderError('Default timeout must be positive')
    }
    this.defaults.timeout = ms
    return this
  }

  /**
   * Set the default retry configuration for all services.
   *
   * @param config - Retry configuration
   * @returns This builder for chaining
   */
  defaultRetry(config: RetryConfig): this {
    this.validateRetryConfig(config)
    this.defaults.retry = config
    return this
  }

  /**
   * Set the default cache configuration for all services.
   *
   * @param config - Cache configuration
   * @returns This builder for chaining
   */
  defaultCache(config: CacheConfig): this {
    this.validateCacheConfig(config)
    this.defaults.cache = config
    return this
  }

  /**
   * Enable or disable caching globally.
   *
   * @param enabled - Whether caching is enabled
   * @returns This builder for chaining
   */
  caching(enabled: boolean): this {
    this._cachingEnabled = enabled
    return this
  }

  /**
   * Set the execution order for services.
   * Services will be executed in the order specified.
   *
   * @param order - Array of service names in execution order
   * @returns This builder for chaining
   */
  executionOrder(order: string[]): this {
    this._executionOrder = [...order]
    return this
  }

  /**
   * Start configuring a validation service.
   *
   * @param field - Field to validate
   * @returns A ValidationServiceBuilder for the specified field
   */
  validate(field: keyof T | string): ValidationServiceBuilder<T> {
    this.finalizePendingBuilder()
    const builder = new ValidationServiceBuilder<T>(this, String(field))
    this._pendingBuilder = builder
    return builder
  }

  /**
   * Start configuring a lookup service.
   *
   * @param field - Field to use as lookup key
   * @returns A LookupServiceBuilder for the specified field
   */
  lookup(field: keyof T | string): LookupServiceBuilder<T> {
    this.finalizePendingBuilder()
    const builder = new LookupServiceBuilder<T>(this, String(field))
    this._pendingBuilder = builder
    return builder
  }

  /**
   * Start configuring a custom service.
   *
   * @param name - Name for the custom service
   * @returns A CustomServiceBuilder
   */
  custom(name: string): CustomServiceBuilder<T> {
    this.finalizePendingBuilder()
    const builder = new CustomServiceBuilder<T>(this, name)
    this._pendingBuilder = builder
    return builder
  }

  /**
   * Add a service configuration to the builder.
   * @internal
   */
  addServiceConfig(config: ServiceConfig): void {
    const existingIndex = this.services.findIndex(
      (s) => s.plugin.name === config.plugin.name
    )
    if (existingIndex !== -1) {
      this.services[existingIndex] = config
    } else {
      this.services.push(config)
    }
  }

  /**
   * Finalize any pending builder.
   * @internal
   */
  finalizePendingBuilder(): void {
    if (this._pendingBuilder) {
      this._pendingBuilder.finalize()
      this._pendingBuilder = undefined
    }
  }

  /**
   * Build and return the services configuration.
   *
   * @returns The complete services configuration
   * @throws {ServiceBuilderError} If configuration is invalid
   */
  build(): ServicesConfig {
    this.finalizePendingBuilder()
    this.validateConfig()

    return {
      services: [...this.services],
      defaults: { ...this.defaults },
      cachingEnabled: this._cachingEnabled,
      executionOrder: this._executionOrder,
    }
  }

  /**
   * Get the current defaults for testing purposes.
   * @internal
   */
  getDefaults(): ServiceDefaults {
    return { ...this.defaults }
  }

  /**
   * Get the current services for testing purposes.
   * @internal
   */
  getServices(): ServiceConfig[] {
    return [...this.services]
  }

  /**
   * Check if caching is enabled.
   * @internal
   */
  isCachingEnabled(): boolean {
    return this._cachingEnabled
  }

  /**
   * Validate the complete configuration.
   * @internal
   */
  private validateConfig(): void {
    const serviceNames = new Set<string>()

    for (const service of this.services) {
      const name = service.plugin.name

      if (serviceNames.has(name)) {
        throw new ServiceBuilderError(
          `Duplicate service name '${name}'. Each service must have a unique name.`
        )
      }
      serviceNames.add(name)

      if (!service.plugin.execute) {
        throw new ServiceBuilderError(
          `Service '${name}' does not have an execute function.`
        )
      }

      if (service.plugin.type === 'validation' && !service.fields?.length) {
        throw new ServiceBuilderError(
          `Validation service '${name}' must have at least one field configured.`
        )
      }

      if (service.plugin.type === 'lookup' && !service.fields?.length) {
        throw new ServiceBuilderError(
          `Lookup service '${name}' must have at least one field configured.`
        )
      }
    }

    if (this._executionOrder) {
      for (const name of this._executionOrder) {
        if (!serviceNames.has(name)) {
          throw new ServiceBuilderError(
            `Execution order references unknown service '${name}'. ` +
              `Available services: ${Array.from(serviceNames).join(', ')}`
          )
        }
      }
    }
  }

  /**
   * Validate a retry configuration.
   * @internal
   */
  private validateRetryConfig(config: RetryConfig): void {
    if (config.maxAttempts < 1) {
      throw new ServiceBuilderError('maxAttempts must be at least 1')
    }
    if (config.initialDelayMs < 0) {
      throw new ServiceBuilderError('initialDelayMs must be non-negative')
    }
    if (config.backoffMultiplier < 1) {
      throw new ServiceBuilderError('backoffMultiplier must be at least 1')
    }
    if (config.maxDelayMs < config.initialDelayMs) {
      throw new ServiceBuilderError(
        'maxDelayMs must be greater than or equal to initialDelayMs'
      )
    }
  }

  /**
   * Validate a cache configuration.
   * @internal
   */
  private validateCacheConfig(config: CacheConfig): void {
    if (config.ttlSeconds < 0) {
      throw new ServiceBuilderError('ttlSeconds must be non-negative')
    }
  }
}

/**
 * Create a new ServiceBuilder instance.
 *
 * @typeParam T - The record type being processed
 * @returns A new ServiceBuilder instance
 */
export function createServiceBuilder<
  T extends Record<string, unknown>,
>(): ServiceBuilder<T> {
  return new ServiceBuilder<T>()
}

/**
 * Type alias for the result of a services() configurator callback
 */
export type ServiceBuilderResult<T extends Record<string, unknown>> =
  | ServiceBuilder<T>
  | ValidationServiceBuilder<T>
  | LookupServiceBuilder<T>
  | CustomServiceBuilder<T>
  | void
