/**
 * External services module - provides integration with third-party systems
 * for identity verification and data enrichment
 * @module services
 */

// Types
export type {
  ServiceType,
  ServiceErrorType,
  Logger,
  RequestMetadata,
  HealthCheckResult,
  CacheStats,
  CacheEntry,
  ServiceCache,
  ServiceContext,
  ServiceTiming,
  ServiceErrorInfo,
  ServiceResult,
  ServicePlugin,
  ValidationCheck,
  ValidationInput,
  ValidationOutput,
  ValidationService,
  LookupInput,
  LookupMatchQuality,
  LookupSource,
  LookupOutput,
  LookupService,
  CustomInput,
  CustomOutput,
  CustomService,
  RetryableErrorType,
  RetryConfig,
  CacheConfig,
  ExecutionPoint,
  OnFailureBehavior,
  OnInvalidBehavior,
  OnNotFoundBehavior,
  ServiceConfig,
  ServiceExecutionResult,
  CircuitState,
  CircuitBreakerConfig,
  CircuitBreakerStatus,
  ServiceExecutor,
  ServiceDefaults,
  ServicesConfig,
} from './types.js'

// Constants
export {
  DEFAULT_RETRY_CONFIG,
  DEFAULT_CACHE_CONFIG,
  DEFAULT_SERVICE_CONFIG,
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
} from './types.js'

// Error classes
export {
  ServiceError,
  ServiceTimeoutError,
  ServiceNetworkError,
  ServiceInputValidationError,
  ServiceNotFoundError,
  ServiceRejectedError,
  ServiceUnavailableError,
  ServiceServerError,
  ServiceConfigurationError,
  ServicePluginError,
  ServiceNotRegisteredError,
  ServiceAlreadyRegisteredError,
  isServiceError,
  isRetryableError,
  toServiceError,
} from './service-error.js'

// Validation functions
export {
  validateServicePlugin,
  validateValidationServicePlugin,
  validateLookupServicePlugin,
  validateCustomServicePlugin,
  validateRetryConfig,
  validateCacheConfig,
  validateCircuitBreakerConfig,
  validateServiceConfig,
  validateServiceDefaults,
  validateServicesConfig,
  isValidationService,
  isLookupService,
  isCustomService,
} from './validation.js'

// Service executor
export {
  ServiceExecutorImpl,
  createServiceExecutor,
  type ServiceExecutorOptions,
} from './service-executor.js'

// Execution context utilities
export {
  buildServiceContext,
  createRequestMetadata,
  generateCorrelationId,
  defaultLogger,
  createSilentLogger,
  createPrefixedLogger,
  type ExecutionContextOptions,
} from './execution-context.js'

// Resilience patterns
export {
  // Timeout
  withTimeout,
  withTimeoutFn,
  withTimeoutTimed,
  createTimeoutController,
  TimeoutController,
  type TimeoutOptions,
  type TimedResult,
  // Retry
  withRetry,
  withRetryDetailed,
  createRetryable,
  calculateRetryDelay,
  shouldRetryError,
  RetryTracker,
  type ExtendedRetryConfig,
  type RetryResult,
  type AttemptDetail,
  // Circuit breaker
  CircuitBreaker,
  createCircuitBreaker,
  withCircuitBreaker,
  CircuitBreakerRegistry,
  createCircuitBreakerRegistry,
  type ExtendedCircuitBreakerConfig,
  // Combined
  withResilience,
  withResilienceDetailed,
  createResilient,
  executeWithAbortableTimeout,
  type ResilienceConfig,
  type ResilienceResult,
} from './resilience/index.js'
