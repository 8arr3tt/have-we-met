/**
 * Execution context building for service calls
 * @module services/execution-context
 */

import type {
  ServiceContext,
  RequestMetadata,
  ServiceCache,
  Logger,
} from './types.js'
import type { ResolverConfig } from '../types/config.js'
import type { MatchResult } from '../core/scoring/types.js'

/**
 * Options for building a service context
 */
export interface ExecutionContextOptions {
  record: Record<string, unknown>
  config: ResolverConfig
  cache?: ServiceCache
  logger?: Logger
  signal?: AbortSignal
  matchResult?: MatchResult
  correlationId?: string
  caller?: string
  customMetadata?: Record<string, unknown>
}

/**
 * Generates a unique correlation ID for request tracing
 */
export function generateCorrelationId(): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substring(2, 10)
  return `svc-${timestamp}-${random}`
}

/**
 * Creates request metadata for a service call
 */
export function createRequestMetadata(options: {
  correlationId?: string
  caller?: string
  custom?: Record<string, unknown>
}): RequestMetadata {
  return {
    correlationId: options.correlationId ?? generateCorrelationId(),
    startedAt: new Date(),
    caller: options.caller,
    custom: options.custom,
  }
}

/**
 * Builds a service execution context from options
 */
export function buildServiceContext(
  options: ExecutionContextOptions
): ServiceContext {
  const metadata = createRequestMetadata({
    correlationId: options.correlationId,
    caller: options.caller,
    custom: options.customMetadata,
  })

  return {
    record: options.record,
    config: options.config,
    metadata,
    cache: options.cache,
    logger: options.logger,
    signal: options.signal,
    matchResult: options.matchResult,
  }
}

/**
 * Default console logger implementation
 */
export const defaultLogger: Logger = {
  debug: (message: string, context?: Record<string, unknown>) => {
    // Use console.log for debug since console.debug may not be available in all environments
    console.log(`[DEBUG] ${message}`, context ?? '')
  },
  info: (message: string, context?: Record<string, unknown>) => {
    console.log(`[INFO] ${message}`, context ?? '')
  },
  warn: (message: string, context?: Record<string, unknown>) => {
    console.warn(`[WARN] ${message}`, context ?? '')
  },
  error: (message: string, context?: Record<string, unknown>) => {
    console.error(`[ERROR] ${message}`, context ?? '')
  },
}

/**
 * Creates a no-op logger for silent operation
 */
export function createSilentLogger(): Logger {
  const noop = () => {}
  return {
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
  }
}

/**
 * Creates a logger that prefixes messages with a service name
 */
export function createPrefixedLogger(
  serviceName: string,
  baseLogger: Logger
): Logger {
  const prefix = `[${serviceName}]`
  return {
    debug: (message, context) =>
      baseLogger.debug(`${prefix} ${message}`, context),
    info: (message, context) =>
      baseLogger.info(`${prefix} ${message}`, context),
    warn: (message, context) =>
      baseLogger.warn(`${prefix} ${message}`, context),
    error: (message, context) =>
      baseLogger.error(`${prefix} ${message}`, context),
  }
}
