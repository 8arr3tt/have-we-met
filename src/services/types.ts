/**
 * External services type definitions for third-party integrations
 * @module services/types
 */

import type { ResolverConfig } from '../types/config.js'
import type { MatchResult } from '../types/match.js'

/**
 * Service types supported by the external services system
 */
export type ServiceType = 'validation' | 'lookup' | 'custom'

/**
 * Error types that can occur during service execution.
 * Used for retry eligibility and error handling.
 */
export type ServiceErrorType = 'timeout' | 'network' | 'validation' | 'not_found' | 'rejected' | 'unavailable' | 'unknown'

/**
 * Logger interface for service execution logging
 */
export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void
  info(message: string, context?: Record<string, unknown>): void
  warn(message: string, context?: Record<string, unknown>): void
  error(message: string, context?: Record<string, unknown>): void
}

/**
 * Request metadata for service calls
 */
export interface RequestMetadata {
  /** Unique correlation ID for tracing */
  correlationId: string

  /** When the request started */
  startedAt: Date

  /** Original caller information */
  caller?: string

  /** Custom metadata */
  custom?: Record<string, unknown>
}

/**
 * Health check result for a service
 */
export interface HealthCheckResult {
  /** Whether the service is healthy */
  healthy: boolean

  /** Service response time in milliseconds */
  responseTimeMs?: number

  /** Reason for unhealthy status */
  reason?: string

  /** Timestamp of health check */
  checkedAt: Date

  /** Additional health details */
  details?: Record<string, unknown>
}

/**
 * Cache statistics
 */
export interface CacheStats {
  /** Number of cache hits */
  hits: number

  /** Number of cache misses */
  misses: number

  /** Hit rate (0-1) */
  hitRate: number

  /** Current cache size */
  size: number

  /** Timestamp of oldest entry */
  oldestEntry?: Date
}

/**
 * Cache entry wrapper
 */
export interface CacheEntry<T> {
  /** Cached value */
  value: T

  /** When the entry was cached */
  cachedAt: Date

  /** When the entry expires */
  expiresAt: Date

  /** Whether the entry is stale (past TTL but usable on error) */
  isStale: boolean
}

/**
 * Cache interface for service execution
 */
export interface ServiceCache {
  /** Get cached value by key */
  get<T>(key: string): Promise<CacheEntry<T> | null>

  /** Set cached value with TTL */
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>

  /** Delete cached value by key */
  delete(key: string): Promise<boolean>

  /** Clear all cached values */
  clear(): Promise<void>

  /** Get cache statistics */
  getStats(): CacheStats
}

/**
 * Context provided to service during execution
 */
export interface ServiceContext {
  /** The full record being processed */
  record: Record<string, unknown>

  /** Resolver configuration */
  config: ResolverConfig

  /** Request metadata (correlation ID, timestamps, etc.) */
  metadata: RequestMetadata

  /** Cache interface for service to use */
  cache?: ServiceCache

  /** Logger interface */
  logger?: Logger

  /** Abort signal for cancellation */
  signal?: AbortSignal

  /** Match result (only available for post-match services) */
  matchResult?: MatchResult
}

/**
 * Timing information for a service call
 */
export interface ServiceTiming {
  /** When the call started */
  startedAt: Date

  /** When the call completed */
  completedAt: Date

  /** Duration in milliseconds */
  durationMs: number
}

/**
 * Error information from a service call
 */
export interface ServiceErrorInfo {
  /** Error code */
  code: string

  /** Error message */
  message: string

  /** Error type for categorization */
  type: ServiceErrorType

  /** Whether this error is eligible for retry */
  retryable: boolean

  /** Original error if available */
  cause?: Error

  /** Additional error context */
  context?: Record<string, unknown>
}

/**
 * Result from a service call
 */
export interface ServiceResult<T = unknown> {
  /** Whether the call succeeded */
  success: boolean

  /** Result data (if success) */
  data?: T

  /** Error information (if failure) */
  error?: ServiceErrorInfo

  /** Timing information */
  timing: ServiceTiming

  /** Whether result was cached */
  cached: boolean

  /** Number of retry attempts made */
  retryAttempts?: number

  /** Service-specific metadata */
  metadata?: Record<string, unknown>
}

/**
 * Base interface for all external service plugins
 */
export interface ServicePlugin<TInput = unknown, TOutput = unknown> {
  /** Unique identifier for the service */
  name: string

  /** Service type */
  type: ServiceType

  /** Human-readable description */
  description?: string

  /** Execute the service call */
  execute(input: TInput, context: ServiceContext): Promise<ServiceResult<TOutput>>

  /** Health check for the service */
  healthCheck?(): Promise<HealthCheckResult>

  /** Cleanup resources */
  dispose?(): Promise<void>
}

/**
 * Validation check performed by a validation service
 */
export interface ValidationCheck {
  /** Check name */
  name: string

  /** Whether check passed */
  passed: boolean

  /** Details about the check */
  message?: string
}

/**
 * Input for validation services
 */
export interface ValidationInput {
  /** Field being validated */
  field: string

  /** Value to validate */
  value: unknown

  /** Additional context for validation */
  context?: Record<string, unknown>
}

/**
 * Output from validation services
 */
export interface ValidationOutput {
  /** Whether the value is valid */
  valid: boolean

  /** Validation details */
  details?: {
    /** Specific validation checks performed */
    checks: ValidationCheck[]

    /** Normalized/corrected value (if applicable) */
    normalizedValue?: unknown

    /** Confidence score (0-1) */
    confidence?: number
  }

  /** Reason for invalid (if not valid) */
  invalidReason?: string

  /** Suggestions for correction */
  suggestions?: string[]
}

/**
 * Service that validates identifier values
 */
export interface ValidationService extends ServicePlugin<ValidationInput, ValidationOutput> {
  type: 'validation'
}

/**
 * Input for lookup services
 */
export interface LookupInput {
  /** Field(s) to use as lookup key */
  keyFields: Record<string, unknown>

  /** Fields to retrieve */
  requestedFields?: string[]
}

/**
 * Match quality indicator for lookup results
 */
export type LookupMatchQuality = 'exact' | 'partial' | 'fuzzy'

/**
 * Source information for lookup results
 */
export interface LookupSource {
  /** Source system name */
  system: string

  /** Record ID in source system */
  recordId?: string

  /** When the source record was last updated */
  lastUpdated?: Date
}

/**
 * Output from lookup services
 */
export interface LookupOutput {
  /** Whether a record was found */
  found: boolean

  /** Retrieved data (mapped to schema fields) */
  data?: Record<string, unknown>

  /** Match quality indicator */
  matchQuality?: LookupMatchQuality

  /** Source system information */
  source?: LookupSource
}

/**
 * Service that looks up additional data from external sources
 */
export interface LookupService extends ServicePlugin<LookupInput, LookupOutput> {
  type: 'lookup'
}

/**
 * Input for custom services
 */
export interface CustomInput {
  /** The complete record */
  record: Record<string, unknown>

  /** Custom parameters */
  params?: Record<string, unknown>
}

/**
 * Output from custom services
 */
export interface CustomOutput {
  /** Service-specific result */
  result: unknown

  /** Whether to proceed with matching */
  proceed: boolean

  /** Score adjustment (if applicable) */
  scoreAdjustment?: number

  /** Flags/tags to add to record */
  flags?: string[]
}

/**
 * Service for arbitrary processing (fraud detection, scoring, etc.)
 */
export interface CustomService extends ServicePlugin<CustomInput, CustomOutput> {
  type: 'custom'
}

/**
 * Error types eligible for retry
 */
export type RetryableErrorType = 'timeout' | 'network' | 'server' | 'all'

/**
 * Retry configuration
 */
export interface RetryConfig {
  /** Maximum retry attempts */
  maxAttempts: number

  /** Initial delay between retries (ms) */
  initialDelayMs: number

  /** Backoff multiplier */
  backoffMultiplier: number

  /** Maximum delay between retries (ms) */
  maxDelayMs: number

  /** Errors to retry on */
  retryOn?: RetryableErrorType[]
}

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelayMs: 100,
  backoffMultiplier: 2,
  maxDelayMs: 5000,
  retryOn: ['timeout', 'network', 'server'],
}

/**
 * Cache configuration
 */
export interface CacheConfig {
  /** Whether to enable caching */
  enabled: boolean

  /** TTL in seconds */
  ttlSeconds: number

  /** Cache key function */
  keyFn?: (input: unknown) => string

  /** Whether to use stale cache on error */
  staleOnError?: boolean
}

/**
 * Default cache configuration
 */
export const DEFAULT_CACHE_CONFIG: CacheConfig = {
  enabled: true,
  ttlSeconds: 300,
  staleOnError: true,
}

/**
 * When to execute a service in the resolution workflow
 */
export type ExecutionPoint = 'pre-match' | 'post-match' | 'both'

/**
 * Behavior on service failure
 */
export type OnFailureBehavior = 'reject' | 'continue' | 'flag'

/**
 * Behavior on validation invalid
 */
export type OnInvalidBehavior = 'reject' | 'continue' | 'flag'

/**
 * Behavior on lookup not found
 */
export type OnNotFoundBehavior = 'continue' | 'flag'

/**
 * Configuration for a service in the resolver
 */
export interface ServiceConfig {
  /** Service plugin instance */
  plugin: ServicePlugin

  /** Fields this service applies to (for validation/lookup) */
  fields?: string[]

  /** Field mapping for lookup services (external field -> schema field) */
  fieldMapping?: Record<string, string>

  /** When to execute: before matching, after matching, or both */
  executionPoint: ExecutionPoint

  /** Behavior on failure */
  onFailure: OnFailureBehavior

  /** Behavior on invalid (for validation) */
  onInvalid?: OnInvalidBehavior

  /** Behavior on not found (for lookup) */
  onNotFound?: OnNotFoundBehavior

  /** Custom result predicate for custom services */
  resultPredicate?: (result: CustomOutput) => boolean

  /** Custom parameters for custom services */
  customParams?: Record<string, unknown>

  /** Timeout in milliseconds */
  timeout?: number

  /** Retry configuration */
  retry?: RetryConfig

  /** Cache configuration */
  cache?: CacheConfig

  /** Priority (lower = earlier execution) */
  priority?: number

  /** Whether service is required or optional */
  required?: boolean
}

/**
 * Default service configuration values
 */
export const DEFAULT_SERVICE_CONFIG: Omit<ServiceConfig, 'plugin' | 'executionPoint'> = {
  onFailure: 'continue',
  timeout: 5000,
  priority: 100,
  required: false,
}

/**
 * Combined result from executing multiple services
 */
export interface ServiceExecutionResult {
  /** Results from each service */
  results: Record<string, ServiceResult>

  /** Whether to proceed with matching */
  proceed: boolean

  /** Rejection reason (if not proceeding) */
  rejectionReason?: string

  /** Rejecting service name (if not proceeding) */
  rejectedBy?: string

  /** Enriched record data from lookup services */
  enrichedData?: Record<string, unknown>

  /** Score adjustments from custom services */
  scoreAdjustments?: number[]

  /** Flags accumulated from services */
  flags?: string[]

  /** Total execution time in milliseconds */
  totalDurationMs: number
}

/**
 * Circuit breaker state
 */
export type CircuitState = 'closed' | 'open' | 'half-open'

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  /** Failures before opening circuit */
  failureThreshold: number

  /** Time before attempting reset (ms) */
  resetTimeoutMs: number

  /** Successes in half-open to close */
  successThreshold: number

  /** Time window for failure counting (ms) */
  failureWindowMs: number
}

/**
 * Default circuit breaker configuration
 */
export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  resetTimeoutMs: 30000,
  successThreshold: 2,
  failureWindowMs: 60000,
}

/**
 * Circuit breaker status for health checks
 */
export interface CircuitBreakerStatus {
  /** Current state */
  state: CircuitState

  /** Number of failures in current window */
  failureCount: number

  /** Number of successes in half-open state */
  successCount: number

  /** When the state last changed */
  lastStateChange: Date

  /** When the last failure occurred */
  lastFailureTime?: Date
}

/**
 * Service executor interface
 */
export interface ServiceExecutor {
  /** Register a service */
  register(config: ServiceConfig): void

  /** Unregister a service by name */
  unregister(name: string): boolean

  /** Execute all pre-match services */
  executePreMatch(record: Record<string, unknown>): Promise<ServiceExecutionResult>

  /** Execute all post-match services */
  executePostMatch(
    record: Record<string, unknown>,
    matchResult: MatchResult,
  ): Promise<ServiceExecutionResult>

  /** Execute a specific service */
  executeService(name: string, input: unknown): Promise<ServiceResult>

  /** Get service health status */
  getHealthStatus(): Promise<Record<string, HealthCheckResult>>

  /** Get circuit breaker status for all services */
  getCircuitStatus(): Record<string, CircuitBreakerStatus>

  /** Dispose all services */
  dispose(): Promise<void>
}

/**
 * Global service defaults configuration
 */
export interface ServiceDefaults {
  /** Default timeout for all services (ms) */
  timeout?: number

  /** Default retry configuration */
  retry?: RetryConfig

  /** Default cache configuration */
  cache?: CacheConfig

  /** Default circuit breaker configuration */
  circuitBreaker?: CircuitBreakerConfig
}

/**
 * Built-in service configurations
 */
export interface ServicesConfig {
  /** Service configurations */
  services: ServiceConfig[]

  /** Global defaults */
  defaults?: ServiceDefaults

  /** Whether caching is enabled globally */
  cachingEnabled?: boolean

  /** Execution order by service name (optional override) */
  executionOrder?: string[]
}
