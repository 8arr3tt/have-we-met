/**
 * Unit tests for execution context utilities
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  generateCorrelationId,
  createRequestMetadata,
  buildServiceContext,
  defaultLogger,
  createSilentLogger,
  createPrefixedLogger,
} from '../../../src/services/execution-context.js'
import type { ResolverConfig } from '../../../src/types/config.js'
import type { Logger } from '../../../src/services/types.js'

describe('generateCorrelationId', () => {
  it('generates unique IDs', () => {
    const id1 = generateCorrelationId()
    const id2 = generateCorrelationId()

    expect(id1).not.toBe(id2)
  })

  it('generates IDs with correct prefix', () => {
    const id = generateCorrelationId()

    expect(id.startsWith('svc-')).toBe(true)
  })

  it('generates IDs of reasonable length', () => {
    const id = generateCorrelationId()

    expect(id.length).toBeGreaterThan(10)
    expect(id.length).toBeLessThan(30)
  })
})

describe('createRequestMetadata', () => {
  it('creates metadata with provided correlationId', () => {
    const metadata = createRequestMetadata({
      correlationId: 'test-123',
    })

    expect(metadata.correlationId).toBe('test-123')
  })

  it('generates correlationId if not provided', () => {
    const metadata = createRequestMetadata({})

    expect(metadata.correlationId).toBeDefined()
    expect(metadata.correlationId.startsWith('svc-')).toBe(true)
  })

  it('sets startedAt to current time', () => {
    const before = new Date()
    const metadata = createRequestMetadata({})
    const after = new Date()

    expect(metadata.startedAt.getTime()).toBeGreaterThanOrEqual(before.getTime())
    expect(metadata.startedAt.getTime()).toBeLessThanOrEqual(after.getTime())
  })

  it('includes caller if provided', () => {
    const metadata = createRequestMetadata({
      caller: 'test-service',
    })

    expect(metadata.caller).toBe('test-service')
  })

  it('includes custom metadata if provided', () => {
    const metadata = createRequestMetadata({
      custom: { userId: 'user-1', source: 'api' },
    })

    expect(metadata.custom).toEqual({ userId: 'user-1', source: 'api' })
  })
})

describe('buildServiceContext', () => {
  const mockConfig: ResolverConfig = {
    schema: {
      name: { type: 'name' },
      email: { type: 'email' },
    },
    matching: {
      fields: new Map(),
      thresholds: { noMatch: 20, definiteMatch: 80 },
    },
  }

  it('builds context with record and config', () => {
    const record = { name: 'John', email: 'john@example.com' }

    const context = buildServiceContext({
      record,
      config: mockConfig,
    })

    expect(context.record).toEqual(record)
    expect(context.config).toBe(mockConfig)
  })

  it('includes request metadata', () => {
    const context = buildServiceContext({
      record: {},
      config: mockConfig,
      correlationId: 'test-corr-id',
    })

    expect(context.metadata.correlationId).toBe('test-corr-id')
    expect(context.metadata.startedAt).toBeInstanceOf(Date)
  })

  it('includes cache if provided', () => {
    const mockCache = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
      clear: vi.fn(),
      getStats: vi.fn(),
    }

    const context = buildServiceContext({
      record: {},
      config: mockConfig,
      cache: mockCache,
    })

    expect(context.cache).toBe(mockCache)
  })

  it('includes logger if provided', () => {
    const mockLogger: Logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }

    const context = buildServiceContext({
      record: {},
      config: mockConfig,
      logger: mockLogger,
    })

    expect(context.logger).toBe(mockLogger)
  })

  it('includes signal if provided', () => {
    const controller = new AbortController()

    const context = buildServiceContext({
      record: {},
      config: mockConfig,
      signal: controller.signal,
    })

    expect(context.signal).toBe(controller.signal)
  })

  it('includes matchResult if provided', () => {
    const matchResult = {
      outcome: 'match' as const,
      candidates: [],
      bestMatch: null,
      inputRecord: { id: '1', data: {} },
      processedAt: new Date(),
    }

    const context = buildServiceContext({
      record: {},
      config: mockConfig,
      matchResult,
    })

    expect(context.matchResult).toBe(matchResult)
  })

  it('includes caller in metadata', () => {
    const context = buildServiceContext({
      record: {},
      config: mockConfig,
      caller: 'resolver',
    })

    expect(context.metadata.caller).toBe('resolver')
  })

  it('includes custom metadata', () => {
    const context = buildServiceContext({
      record: {},
      config: mockConfig,
      customMetadata: { batchId: 'batch-1' },
    })

    expect(context.metadata.custom).toEqual({ batchId: 'batch-1' })
  })
})

describe('defaultLogger', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('has all logging methods', () => {
    expect(typeof defaultLogger.debug).toBe('function')
    expect(typeof defaultLogger.info).toBe('function')
    expect(typeof defaultLogger.warn).toBe('function')
    expect(typeof defaultLogger.error).toBe('function')
  })

  it('calls console.log for info level', () => {
    defaultLogger.info('test message', { key: 'value' })

    expect(console.log).toHaveBeenCalled()
  })

  it('calls console.warn for warn level', () => {
    defaultLogger.warn('warning message')

    expect(console.warn).toHaveBeenCalled()
  })

  it('calls console.error for error level', () => {
    defaultLogger.error('error message')

    expect(console.error).toHaveBeenCalled()
  })
})

describe('createSilentLogger', () => {
  it('creates logger with no-op functions', () => {
    const logger = createSilentLogger()

    expect(typeof logger.debug).toBe('function')
    expect(typeof logger.info).toBe('function')
    expect(typeof logger.warn).toBe('function')
    expect(typeof logger.error).toBe('function')
  })

  it('does not throw when called', () => {
    const logger = createSilentLogger()

    expect(() => logger.debug('test')).not.toThrow()
    expect(() => logger.info('test')).not.toThrow()
    expect(() => logger.warn('test')).not.toThrow()
    expect(() => logger.error('test')).not.toThrow()
  })
})

describe('createPrefixedLogger', () => {
  it('prefixes messages with service name', () => {
    const baseLogger: Logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }

    const prefixedLogger = createPrefixedLogger('my-service', baseLogger)
    prefixedLogger.info('test message', { key: 'value' })

    expect(baseLogger.info).toHaveBeenCalledWith('[my-service] test message', { key: 'value' })
  })

  it('prefixes all log levels', () => {
    const baseLogger: Logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }

    const prefixedLogger = createPrefixedLogger('svc', baseLogger)

    prefixedLogger.debug('debug msg')
    prefixedLogger.info('info msg')
    prefixedLogger.warn('warn msg')
    prefixedLogger.error('error msg')

    expect(baseLogger.debug).toHaveBeenCalledWith('[svc] debug msg', undefined)
    expect(baseLogger.info).toHaveBeenCalledWith('[svc] info msg', undefined)
    expect(baseLogger.warn).toHaveBeenCalledWith('[svc] warn msg', undefined)
    expect(baseLogger.error).toHaveBeenCalledWith('[svc] error msg', undefined)
  })
})
